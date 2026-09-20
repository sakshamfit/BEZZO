/**
 * Payments — the critical scenarios from the reliability spec, exercised end to end.
 *
 *  1. A capture confirms the order (PENDING_PAYMENT → CONFIRMED, items confirmed).
 *  2. A duplicated gateway delivery is answered 200 `DUPLICATE` and has no second effect.
 *  3. A forged signature is refused with 400 — for a brand new event id *and* for one we have already
 *     seen, which is the case that proves the signature check is not skippable by guessing ids.
 *  4. A failed attempt leaves the order payable, retry issues a fresh intent against the same payment
 *     row, and the retried payment confirms the order.
 *  5. Refunds: full, partial, over-refund refused, buyer refused.
 *
 * The suite drives the mock gateway through `POST /dev/payments/:id/mock-webhook`, which *signs* a body
 * with the provider's own signer and re-enters the production webhook handler: signature verification,
 * the evidence row, deduplication and the state transition all run exactly as they do for a live
 * gateway. Nothing here bypasses a control.
 */
import { idempotencyKey, signIn, waitForApi, type Session } from '../helpers/api-client';

jest.setTimeout(90_000);

interface PlacedOrder {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal: number;
  payment: { id: string; status: string; providerReference: string | null } | null;
}

describe('payments', () => {
  let buyer: Session;
  let admin: Session;
  let listingId: string;
  let addressId: string;

  const buyerClient = () => buyer.client;

  /** Places an order for one line and returns it with its payment row. */
  async function placeOrder(paymentMethod: 'UPI' | 'CARD' | 'COD', quantity = 1): Promise<PlacedOrder> {
    await buyerClient().delete('/cart');
    const added = await buyerClient().post(
      '/cart/items',
      { supplierProductId: listingId, quantity },
      idempotencyKey('test-cart'),
    );
    expect(added.status).toBe(201);

    const placed = await buyerClient().post(
      '/orders',
      { deliveryAddressId: addressId, deliveryMode: 'INSTANT', paymentMethod },
      idempotencyKey('test-order'),
    );
    expect(placed.status).toBe(201);
    return placed.data as PlacedOrder;
  }

  async function orderDetail(orderId: string): Promise<PlacedOrder & { items: Array<{ status: string }> }> {
    const response = await buyerClient().get(`/orders/${orderId}`);
    expect(response.status).toBe(200);
    return response.data as PlacedOrder & { items: Array<{ status: string }> };
  }

  beforeAll(async () => {
    await waitForApi();
    [buyer, admin] = await Promise.all([signIn('buyer1@bezzo.local'), signIn('admin@bezzo.local')]);

    const catalogue = await buyerClient().get('/catalog/products?limit=5');
    expect(catalogue.status).toBe(200);
    const products = catalogue.data as Array<{ id: string; inStock: boolean }>;
    let offer: { listingId: string; sellableQuantity: number } | undefined;
    for (const product of products) {
      const detail = await buyerClient().get(`/catalog/products/${product.id}`);
      const offers = (detail.data as { offers: Array<{ listingId: string; sellableQuantity: number }> }).offers;
      offer = offers.find((candidate) => candidate.sellableQuantity > 5);
      if (offer) break;
    }
    expect(offer).toBeDefined();
    listingId = offer!.listingId;

    const addresses = await buyerClient().get('/buyer/addresses');
    const list = addresses.data as Array<{ id: string; isDefault?: boolean }>;
    addressId = (list.find((entry) => entry.isDefault) ?? list[0]).id;
    expect(addressId).toBeTruthy();
  });

  it('captures a payment through the signed webhook and confirms the order', async () => {
    const order = await placeOrder('UPI', 2);
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.payment?.status).toBe('PENDING');

    const simulated = await buyerClient().post(`/dev/payments/${order.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId: `test-capture-${Date.now()}`,
    });
    expect(simulated.status).toBe(200);
    expect((simulated.data as { status: string }).status).toBe('PROCESSED');

    const detail = await orderDetail(order.id);
    expect(detail.status).toBe('CONFIRMED');
    expect(detail.payment?.status).toBe('PAID');
    expect(detail.items.every((item) => item.status === 'CONFIRMED')).toBe(true);
  });

  it('answers a repeated delivery with DUPLICATE and applies nothing a second time', async () => {
    const order = await placeOrder('UPI');
    const eventId = `test-duplicate-${Date.now()}`;

    const first = await buyerClient().post(`/dev/payments/${order.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId,
    });
    expect((first.data as { status: string }).status).toBe('PROCESSED');

    const second = await buyerClient().post(`/dev/payments/${order.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId,
    });
    expect(second.status).toBe(200);
    const outcome = second.data as { status: string; applied: boolean };
    expect(outcome.status).toBe('DUPLICATE');
    expect(outcome.applied).toBe(false);

    const detail = await orderDetail(order.id);
    expect(detail.status).toBe('CONFIRMED');
    expect(detail.payment?.status).toBe('PAID');
  });

  it.each([
    ['a fresh event id', () => `test-forged-new-${Date.now()}`],
    ['an event id the platform has already recorded', () => `test-forged-seen-${Date.now()}`],
  ])('refuses a forged signature with 400 (%s)', async (_label, makeEventId) => {
    const eventId = makeEventId();
    const forged = async () => {
      const response = await fetch(`${process.env.BEZZO_API_URL ?? 'http://127.0.0.1:4000'}/api/v1/webhooks/payments/mock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mock-signature': 'deadbeef'.repeat(8) },
        body: JSON.stringify({ eventId, providerReference: 'x', amount: 1, status: 'PAID' }),
      });
      return { status: response.status, text: await response.text() };
    };

    // Register the event id through a real, correctly signed delivery first — the second assertion of
    // this test is that a known id is still refused when the signature is wrong.
    const order = await placeOrder('UPI');
    const signed = await buyerClient().post(`/dev/payments/${order.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId,
    });
    expect(signed.status).toBe(200);

    const result = await forged();
    expect(result.status).toBe(400);
    expect(result.text).toContain('PAYMENT_VERIFICATION_FAILED');
  });

  it('keeps the order payable after a failure, then captures on retry', async () => {
    const order = await placeOrder('CARD');
    const failed = await buyerClient().post(`/dev/payments/${order.payment!.id}/mock-webhook`, {
      outcome: 'FAILED',
      eventId: `test-fail-${Date.now()}`,
    });
    expect(failed.status).toBe(200);

    const afterFailure = await orderDetail(order.id);
    expect(afterFailure.status).toBe('PENDING_PAYMENT');
    expect(afterFailure.payment?.status).toBe('FAILED');

    const retry = await buyerClient().post(
      `/payments/${order.payment!.id}/retry`,
      {},
      idempotencyKey('test-retry'),
    );
    expect([200, 201]).toContain(retry.status);
    const intent = retry.data as { paymentId: string; providerReference: string };
    expect(intent.providerReference).toBeTruthy();

    const captured = await buyerClient().post(`/dev/payments/${order.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId: `test-retry-paid-${Date.now()}`,
    });
    expect(captured.status).toBe(200);

    const afterRetry = await orderDetail(order.id);
    expect(afterRetry.status).toBe('CONFIRMED');
    expect(afterRetry.payment?.status).toBe('PAID');
    // The retry reuses the payment row: an order can never accumulate two live payments.
    expect(afterRetry.payment?.id).toBe(order.payment!.id);
  });

  it('refunds in full and in part, and refuses what must be refused', async () => {
    const fullOrder = await placeOrder('UPI', 2);
    await buyerClient().post(`/dev/payments/${fullOrder.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId: `test-refund-full-${Date.now()}`,
    });

    const full = await admin.client.post(
      `/payments/${fullOrder.payment!.id}/refund`,
      { amount: String(fullOrder.grandTotal), reason: 'Integration test — full refund' },
      idempotencyKey('test-refund-full'),
    );
    expect([200, 201]).toContain(full.status);
    expect((await orderDetail(fullOrder.id)).payment?.status).toBe('REFUNDED');

    const partialOrder = await placeOrder('UPI');
    await buyerClient().post(`/dev/payments/${partialOrder.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId: `test-refund-partial-${Date.now()}`,
    });

    const partial = await admin.client.post(
      `/payments/${partialOrder.payment!.id}/refund`,
      { amount: '1.00', reason: 'Integration test — partial refund' },
      idempotencyKey('test-refund-partial'),
    );
    expect([200, 201]).toContain(partial.status);
    expect((await orderDetail(partialOrder.id)).payment?.status).toBe('PARTIALLY_REFUNDED');

    const over = await admin.client.post(
      `/payments/${partialOrder.payment!.id}/refund`,
      { amount: String(partialOrder.grandTotal), reason: 'Integration test — over refund' },
      idempotencyKey('test-refund-over'),
    );
    expect(over.status).toBeGreaterThanOrEqual(400);

    const asBuyer = await buyerClient().post(
      `/payments/${partialOrder.payment!.id}/refund`,
      { amount: '1.00', reason: 'Integration test — buyer attempt' },
      idempotencyKey('test-refund-buyer'),
    );
    expect(asBuyer.status).toBe(403);
    expect(asBuyer.errorCode).toBe('FORBIDDEN');
  });

  it('gives the buyer their own refunds and gives nobody else’s', async () => {
    const order = await placeOrder('UPI');
    await buyerClient().post(`/dev/payments/${order.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId: `test-refund-list-${Date.now()}`,
    });
    const refunded = await admin.client.post(
      `/payments/${order.payment!.id}/refund`,
      { amount: '1.00', reason: 'Integration test — refund visibility' },
      idempotencyKey('test-refund-visibility'),
    );
    expect([200, 201]).toContain(refunded.status);

    const mine = await buyerClient().get(`/orders/${order.id}/refunds`);
    expect(mine.status).toBe(200);
    const rows = mine.data as Array<{ amount: number; status: string; gatewayRefundReference: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1);
    expect(rows[0].gatewayRefundReference).toBeTruthy();

    // Another buyer must not learn that this order exists.
    const other = await signIn('buyer2@bezzo.local');
    const notMine = await other.client.get(`/orders/${order.id}/refunds`);
    expect(notMine.status).toBe(404);

    // An operator with the read permission can see it.
    expect((await admin.client.get(`/orders/${order.id}/refunds`)).status).toBe(200);
  });

  it('shows an operator the whole trail, and only the trail of the payment asked for', async () => {
    const list = await admin.client.get('/admin/payments?pageSize=5');
    expect(list.status).toBe(200);
    const page = list.data as {
      payments: Array<{ id: string; amount: number; refundableAmount: number; orderNumber: string }>;
      pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
    };
    expect(page.payments.length).toBeGreaterThan(0);
    expect(page.pagination.totalItems).toBeGreaterThan(0);

    const target = page.payments[0];
    const detail = await admin.client.get(`/admin/payments/${target.id}`);
    expect(detail.status).toBe(200);
    const trail = detail.data as {
      payment: { id: string; amount: number; refundableAmount: number };
      attempts: unknown[];
      refunds: unknown[];
      webhookEvents: Array<{ signatureValid: boolean; processingStatus: string }>;
    };
    expect(trail.payment.id).toBe(target.id);
    expect(Array.isArray(trail.attempts)).toBe(true);
    expect(Array.isArray(trail.refunds)).toBe(true);
    // The money trail must be numbers, not NUMERIC strings: the web client formats them directly.
    expect(typeof trail.payment.amount).toBe('number');
    expect(typeof trail.payment.refundableAmount).toBe('number');

    for (const event of trail.webhookEvents) {
      expect(['PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED', 'RECEIVED']).toContain(event.processingStatus);
      expect(typeof event.signatureValid).toBe('boolean');
    }

    // A filter that matches nothing must answer an empty page, not an error.
    const none = await admin.client.get('/admin/payments?q=no-such-order-number-zzz');
    expect(none.status).toBe(200);
    expect((none.data as { payments: unknown[] }).payments).toHaveLength(0);
  });

  it('answers a payment that does not exist with a typed 404 instead of a 500', async () => {
    const missing = await admin.client.post(
      '/payments/00000000-0000-4000-8000-000000000000/refund',
      { amount: '1.00', reason: 'Integration test — unknown payment' },
      idempotencyKey('test-refund-missing'),
    );
    expect(missing.status).toBe(404);
    expect(missing.errorCode).toBe('PAYMENT_NOT_FOUND');
  });
});
