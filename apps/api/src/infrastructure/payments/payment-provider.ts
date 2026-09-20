/**
 * Payment gateway abstraction (payments spec, project rule §22).
 *
 * Contract enforced platform-wide:
 *  - the domain never talks to a gateway SDK: it depends on `PaymentProvider`;
 *  - payment status is only ever set from a SERVER-VERIFIED signal (signed webhook or a server-side
 *    status fetch) — a client "payment succeeded" callback is never authoritative;
 *  - webhook signatures are verified in constant time and every webhook is stored with a unique
 *    provider event id so replays cannot double-apply;
 *  - every provider call is idempotent via a caller-supplied idempotency key.
 *
 * Providers:
 *  - `mock`     — a fully functional local sandbox (deterministic ids + HMAC-signed webhooks) used in
 *                 development and the automated test suite. It exercises the real code paths.
 *  - `razorpay` — real HTTP integration with HMAC-SHA256 webhook verification.
 *                 REQUIRES EXTERNAL CREDENTIALS (RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET).
 *  - `cashfree` — declared in configuration; the adapter is NOT IMPLEMENTED yet and boot fails with an
 *                 explicit message rather than silently falling back to an unverified provider.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PaymentMethodType, PaymentProvider as PaymentProviderName } from '@bezzo/contracts';

export interface CreatePaymentIntentInput {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  method: PaymentMethodType;
  buyerId: string;
  idempotencyKey: string;
  returnUrl?: string;
}

export interface CreatePaymentIntentResult {
  providerReference: string;
  providerOrderReference: string | null;
  /** Opaque, provider-specific data handed to the client to complete the payment. */
  providerPayload: Record<string, unknown> | null;
}

export interface ProviderPaymentStatus {
  providerReference: string;
  status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  amount: number | null;
  method: PaymentMethodType | null;
  failureCode: string | null;
  failureMessage: string | null;
  raw: Record<string, unknown>;
}

export interface ParsedWebhook {
  externalEventId: string;
  eventType: string;
  providerReference: string | null;
  status: ProviderPaymentStatus['status'] | null;
  amount: number | null;
  raw: Record<string, unknown>;
}

export interface RefundInput {
  providerReference: string;
  amount: number;
  currency: string;
  reason?: string;
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundReference: string;
  status: 'PROCESSING' | 'REFUNDED' | 'FAILED';
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult>;
  fetchStatus(providerReference: string): Promise<ProviderPaymentStatus>;
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(rawBody: Buffer): ParsedWebhook;
  refund(input: RefundInput): Promise<RefundResult>;
}

export class PaymentProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly retryable: boolean,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

/** Local sandbox gateway: real contract, deterministic behaviour, HMAC-signed webhooks. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  constructor(private readonly webhookSecret: string) {}

  async createIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult> {
    const providerReference = `mockpay_${input.idempotencyKey.slice(0, 24).replace(/[^a-zA-Z0-9]/g, '')}`;
    return {
      providerReference,
      providerOrderReference: `mockorder_${input.orderId}`,
      providerPayload: {
        sandbox: true,
        providerReference,
        amount: input.amount,
        currency: input.currency,
        /** Development-only helper route that signs a webhook exactly like the vendor would. */
        simulateWebhookUrl: '/api/v1/dev/payments/mock-webhook',
      },
    };
  }

  async fetchStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    return {
      providerReference,
      status: 'PENDING',
      amount: null,
      method: null,
      failureCode: null,
      failureMessage: null,
      raw: { provider: 'mock' },
    };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const signature = firstHeader(headers['x-mock-signature']);
    if (!signature) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return constantTimeEquals(signature, expected);
  }

  parseWebhook(rawBody: Buffer): ParsedWebhook {
    const parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    return {
      externalEventId: String(parsed.eventId ?? parsed.event_id ?? randomUUID()),
      eventType: String(parsed.eventType ?? parsed.event_type ?? 'payment.captured'),
      providerReference: (parsed.paymentReference as string) ?? (parsed.providerReference as string) ?? null,
      status: typeof parsed.status === 'string' ? normalizeStatus(parsed.status) : null,
      amount: parsed.amount === undefined ? null : Number(parsed.amount),
      raw: parsed,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return {
      providerRefundReference: `mockrefund_${input.idempotencyKey.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '')}`,
      status: 'REFUNDED',
      raw: { provider: 'mock', amount: input.amount },
    };
  }

  /** Test/development helper: produce a correctly signed webhook body for a payment. */
  buildWebhookPayload(input: {
    providerReference: string;
    amount: number;
    status: ProviderPaymentStatus['status'];
    eventId?: string;
  }): { body: string; signature: string } {
    const body = JSON.stringify({
      eventId: input.eventId ?? `evt_${randomUUID()}`,
      eventType: 'payment.captured',
      paymentReference: input.providerReference,
      amount: input.amount,
      status: input.status,
    });
    const signature = createHmac('sha256', this.webhookSecret).update(Buffer.from(body)).digest('hex');
    return { body, signature };
  }
}

/** Razorpay adapter (Order + Payment + Refund APIs, `X-Razorpay-Signature` webhooks). */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;

  constructor(
    private readonly options: { keyId: string; keySecret: string; webhookSecret: string; baseUrl?: string },
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.options.keyId}:${this.options.keySecret}`).toString('base64')}`;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.options.baseUrl ?? 'https://api.razorpay.com/v1'}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: this.authHeader(), ...(init.headers ?? {}) },
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      throw new PaymentProviderError(
        this.name,
        `Razorpay request ${path} failed with status ${response.status}`,
        response.status >= 500 || response.status === 429,
        body,
      );
    }
    return body as T;
  }

  async createIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult> {
    const order = await this.request<{ id: string; amount: number; currency: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: Math.round(input.amount * 100), // Razorpay expects paise
        currency: input.currency,
        receipt: input.orderNumber,
        notes: { orderId: input.orderId, buyerId: input.buyerId, idempotencyKey: input.idempotencyKey },
      }),
    });
    return {
      providerReference: order.id,
      providerOrderReference: order.id,
      providerPayload: { keyId: this.options.keyId, orderId: order.id, amount: order.amount, currency: order.currency },
    };
  }

  async fetchStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    const payment = await this.request<{
      id: string;
      status: string;
      amount: number;
      method?: string;
      error_code?: string;
      error_description?: string;
    }>(`/payments/${providerReference}`, { method: 'GET' });
    return {
      providerReference: payment.id,
      status: normalizeStatus(payment.status),
      amount: payment.amount / 100,
      method: normalizeMethod(payment.method),
      failureCode: payment.error_code ?? null,
      failureMessage: payment.error_description ?? null,
      raw: payment as unknown as Record<string, unknown>,
    };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const signature = firstHeader(headers['x-razorpay-signature']);
    if (!signature) return false;
    const expected = createHmac('sha256', this.options.webhookSecret).update(rawBody).digest('hex');
    return constantTimeEquals(signature, expected);
  }

  parseWebhook(rawBody: Buffer): ParsedWebhook {
    const parsed = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      payload?: { payment?: { entity?: Record<string, unknown> } };
    };
    const entity = parsed.payload?.payment?.entity ?? {};
    return {
      externalEventId: `${parsed.event ?? 'event'}:${String(entity.id ?? '')}:${String(entity.status ?? '')}`,
      eventType: parsed.event ?? 'unknown',
      providerReference: (entity.id as string) ?? null,
      status: typeof entity.status === 'string' ? normalizeStatus(entity.status) : null,
      amount: entity.amount === undefined ? null : Number(entity.amount) / 100,
      raw: parsed as unknown as Record<string, unknown>,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const refund = await this.request<{ id: string; status: string }>(`/payments/${input.providerReference}/refund`, {
      method: 'POST',
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        notes: { reason: input.reason ?? '', idempotencyKey: input.idempotencyKey },
      }),
    });
    return {
      providerRefundReference: refund.id,
      status: refund.status === 'processed' ? 'REFUNDED' : 'PROCESSING',
      raw: refund as unknown as Record<string, unknown>,
    };
  }
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function normalizeStatus(status: string): ProviderPaymentStatus['status'] {
  switch (status.toLowerCase()) {
    case 'created':
    case 'pending':
    case 'initiated':
    case 'authorized_pending':
      return 'PENDING';
    case 'authorized':
      return 'AUTHORIZED';
    case 'captured':
    case 'paid':
    case 'success':
    case 'succeeded':
      return 'PAID';
    case 'failed':
    case 'error':
      return 'FAILED';
    case 'refunded':
    case 'partially_refunded':
      return 'REFUNDED';
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

function normalizeMethod(method: string | undefined): PaymentMethodType | null {
  if (!method) return null;
  switch (method.toLowerCase()) {
    case 'upi':
      return 'UPI';
    case 'card':
      return 'CARD';
    case 'netbanking':
      return 'NET_BANKING';
    case 'wallet':
      return 'WALLET';
    case 'cod':
      return 'COD';
    default:
      return null;
  }
}
