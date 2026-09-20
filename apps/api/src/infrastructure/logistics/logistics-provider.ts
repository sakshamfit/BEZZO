/**
 * Logistics provider abstraction — hub → retailer delivery (logistics spec, project rule §23).
 *
 * Rules:
 *  - Porter (or any vendor) must never be referenced outside this adapter;
 *  - vendor statuses are normalised here and NEVER stored as canonical BEZZO states directly — the
 *    delivery service maps them onto BEZZO's own state machine and can reject an illegal jump;
 *  - provider failure never corrupts an order: booking is retried, and an unbooked delivery is a
 *    visible operational task rather than a silent failure.
 *
 * Providers:
 *  - `manual`     — fully implemented: Bezzo dispatch assigns and updates the trip (default, so the
 *                   platform is shippable before any vendor contract exists).
 *  - `porter`     — implemented REST integration (price estimate, create order, cancel, status) with
 *                   HMAC webhook verification. REQUIRES EXTERNAL CREDENTIALS.
 *  - `bezzo_fleet`— reserved for Bezzo's own rider network; same contract.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DeliveryStatus, type LogisticsProvider as LogisticsProviderName } from '@bezzo/contracts';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  addressLine: string;
  contactName?: string;
  contactPhone?: string;
  landmark?: string;
}

export interface QuoteRequest {
  pickup: GeoPoint;
  dropoff: GeoPoint;
  packageCount: number;
  totalWeightGrams: number;
  scheduledAt?: Date | null;
  paymentMode: 'PREPAID' | 'COD';
}

export interface QuoteResult {
  quoteReference: string | null;
  estimatedFee: number;
  estimatedPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
  distanceKm: number | null;
  currency: string;
  raw: Record<string, unknown>;
}

export interface CreateDeliveryRequest {
  orderId: string;
  orderNumber: string;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  packageCount: number;
  totalWeightGrams: number;
  scheduledAt?: Date | null;
  orderValue: number;
  paymentMode: 'PREPAID' | 'COD';
  idempotencyKey: string;
}

export interface CreateDeliveryResult {
  providerDeliveryId: string;
  trackingUrl: string | null;
  estimatedPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
  fee: number | null;
  raw: Record<string, unknown>;
}

export interface ProviderDeliveryUpdate {
  providerDeliveryId: string;
  providerStatus: string;
  /** Status mapped by the adapter; the delivery service decides whether the transition is legal. */
  internalStatus: DeliveryStatus;
  occurredAt: Date;
  description?: string;
  latitude?: number;
  longitude?: number;
  providerEventId?: string;
  raw: Record<string, unknown>;
}

export interface LogisticsProvider {
  readonly name: LogisticsProviderName;
  quote(request: QuoteRequest): Promise<QuoteResult>;
  createDelivery(request: CreateDeliveryRequest): Promise<CreateDeliveryResult>;
  cancelDelivery(providerDeliveryId: string, reason: string): Promise<void>;
  fetchStatus(providerDeliveryId: string): Promise<ProviderDeliveryUpdate | null>;
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(rawBody: Buffer): ProviderDeliveryUpdate | null;
}

export class LogisticsProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly retryable: boolean,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'LogisticsProviderError';
  }
}

/**
 * Vendor status → BEZZO delivery status.
 *
 * Unknown vendor statuses map to the booking state, never to DELIVERED: a delivery is only ever
 * completed by an explicit vendor "delivered" signal.
 */
export function mapPorterStatus(providerStatus: string, fallback: DeliveryStatus): DeliveryStatus {
  const normalized = providerStatus.toLowerCase().replace(/[\s-]/g, '_');
  switch (normalized) {
    case 'order_created':
    case 'created':
    case 'searching_for_driver':
    case 'unassigned':
      return DeliveryStatus.BOOKING;
    case 'driver_assigned':
    case 'assigned':
      return DeliveryStatus.ASSIGNED;
    case 'driver_arrived':
    case 'arrived_at_pickup':
    case 'pickup_started':
      return DeliveryStatus.PICKUP_PENDING;
    case 'order_picked_up':
    case 'picked_up':
    case 'in_pickup_transit':
      return DeliveryStatus.PICKED_UP;
    case 'in_transit':
    case 'on_the_way':
      return DeliveryStatus.IN_TRANSIT;
    case 'delivered':
    case 'order_delivered':
      return DeliveryStatus.DELIVERED;
    case 'cancelled':
    case 'order_cancelled':
      return DeliveryStatus.CANCELLED;
    case 'failed':
    case 'order_failed':
    case 'delivery_failed':
      return DeliveryStatus.FAILED;
    default:
      return fallback;
  }
}

/** Manual dispatch: Bezzo operations assign a rider/partner and update the trip in-system. */
export class ManualLogisticsProvider implements LogisticsProvider {
  readonly name = 'manual' as const;

  async quote(request: QuoteRequest): Promise<QuoteResult> {
    return {
      quoteReference: null,
      estimatedFee: 0,
      estimatedPickupAt: request.scheduledAt ?? null,
      estimatedDeliveryAt: null,
      distanceKm: null,
      currency: 'INR',
      raw: { provider: 'manual', note: 'Fee is entered by operations when the trip is assigned.' },
    };
  }

  async createDelivery(request: CreateDeliveryRequest): Promise<CreateDeliveryResult> {
    return {
      providerDeliveryId: `manual_${request.orderNumber}`,
      trackingUrl: null,
      estimatedPickupAt: request.scheduledAt ?? null,
      estimatedDeliveryAt: null,
      fee: null,
      raw: { provider: 'manual', instructions: 'Assign a Bezzo rider/dispatch partner manually.' },
    };
  }

  async cancelDelivery(): Promise<void> {
    // Nothing upstream to cancel; the delivery row is updated by the domain service.
  }

  async fetchStatus(): Promise<ProviderDeliveryUpdate | null> {
    return null;
  }

  verifyWebhookSignature(): boolean {
    return false;
  }

  parseWebhook(): ProviderDeliveryUpdate | null {
    return null;
  }
}

/** Porter adapter. REQUIRES EXTERNAL CREDENTIALS (PORTER_API_KEY / PORTER_API_SECRET). */
export class PorterLogisticsProvider implements LogisticsProvider {
  readonly name = 'porter' as const;

  constructor(
    private readonly options: {
      apiKey: string;
      apiSecret: string;
      baseUrl: string;
      webhookSecret?: string;
      cityId?: number;
    },
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-api-key': `${this.options.apiKey}:${this.options.apiSecret}`,
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      throw new LogisticsProviderError(
        this.name,
        `Porter request ${path} failed with status ${response.status}`,
        response.status >= 500 || response.status === 429,
        body,
      );
    }
    return body as T;
  }

  async quote(request: QuoteRequest): Promise<QuoteResult> {
    const body = {
      pickup_details: {
        lat: request.pickup.latitude,
        lng: request.pickup.longitude,
        address: { street_address1: request.pickup.addressLine },
      },
      drop_details: {
        lat: request.dropoff.latitude,
        lng: request.dropoff.longitude,
        address: { street_address1: request.dropoff.addressLine },
      },
      ...(this.options.cityId ? { city_id: this.options.cityId } : {}),
    };
    const response = await this.request<{
      estimated_fare?: { minor_amount?: number };
      distance?: number;
      pickup_eta?: number;
    }>('/v1/price-estimates', { method: 'POST', body: JSON.stringify(body) });
    return {
      quoteReference: null,
      estimatedFee: response.estimated_fare?.minor_amount ? response.estimated_fare.minor_amount / 100 : 0,
      estimatedPickupAt: response.pickup_eta ? new Date(Date.now() + response.pickup_eta * 60_000) : null,
      estimatedDeliveryAt: null,
      distanceKm: response.distance ? response.distance / 1000 : null,
      currency: 'INR',
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async createDelivery(request: CreateDeliveryRequest): Promise<CreateDeliveryResult> {
    const body = {
      request_id: request.idempotencyKey, // vendor-side idempotency: retries cannot double-book
      ...(this.options.cityId ? { city_id: this.options.cityId } : {}),
      pickup_details: {
        lat: request.pickup.latitude,
        lng: request.pickup.longitude,
        name: request.pickup.contactName,
        phone_number: request.pickup.contactPhone,
        address: { street_address1: request.pickup.addressLine, landmark: request.pickup.landmark },
      },
      drop_details: {
        lat: request.dropoff.latitude,
        lng: request.dropoff.longitude,
        name: request.dropoff.contactName,
        phone_number: request.dropoff.contactPhone,
        address: { street_address1: request.dropoff.addressLine, landmark: request.dropoff.landmark },
      },
      ...(request.scheduledAt ? { pickups_at: Math.floor(request.scheduledAt.getTime() / 1000) } : {}),
    };
    const response = await this.request<{
      order_id?: string;
      tracking_url?: string;
      pickup_eta?: number;
      delivery_eta?: number;
      order_details?: { total_fare?: number };
    }>('/v1/orders', { method: 'POST', body: JSON.stringify(body) });

    if (!response.order_id) {
      throw new LogisticsProviderError(this.name, 'Porter did not return an order id', false, response);
    }
    return {
      providerDeliveryId: response.order_id,
      trackingUrl: response.tracking_url ?? null,
      estimatedPickupAt: response.pickup_eta ? new Date(Date.now() + response.pickup_eta * 60_000) : null,
      estimatedDeliveryAt: response.delivery_eta ? new Date(Date.now() + response.delivery_eta * 60_000) : null,
      fee: response.order_details?.total_fare ? response.order_details.total_fare / 100 : null,
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async cancelDelivery(providerDeliveryId: string, reason: string): Promise<void> {
    await this.request(`/v1/orders/${providerDeliveryId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async fetchStatus(providerDeliveryId: string): Promise<ProviderDeliveryUpdate | null> {
    const response = await this.request<{ order_id: string; status: string; updated_at?: string }>(
      `/v1/orders/${providerDeliveryId}`,
      { method: 'GET' },
    );
    if (!response?.status) return null;
    return {
      providerDeliveryId: response.order_id ?? providerDeliveryId,
      providerStatus: response.status,
      internalStatus: mapPorterStatus(response.status, DeliveryStatus.ASSIGNED),
      occurredAt: response.updated_at ? new Date(response.updated_at) : new Date(),
      raw: response as unknown as Record<string, unknown>,
    };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    if (!this.options.webhookSecret) return false;
    const header = headers['x-porter-signature'] ?? headers['x-webhook-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature) return false;
    const expected = createHmac('sha256', this.options.webhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: Buffer): ProviderDeliveryUpdate | null {
    const parsed = JSON.parse(rawBody.toString('utf8')) as {
      order_id?: string;
      status?: string;
      event_id?: string;
      updated_at?: string;
      location?: { lat?: number; lng?: number };
    };
    if (!parsed.order_id || !parsed.status) return null;
    return {
      providerDeliveryId: parsed.order_id,
      providerStatus: parsed.status,
      internalStatus: mapPorterStatus(parsed.status, DeliveryStatus.ASSIGNED),
      occurredAt: parsed.updated_at ? new Date(parsed.updated_at) : new Date(),
      providerEventId: parsed.event_id,
      latitude: parsed.location?.lat,
      longitude: parsed.location?.lng,
      raw: parsed as unknown as Record<string, unknown>,
    };
  }
}
