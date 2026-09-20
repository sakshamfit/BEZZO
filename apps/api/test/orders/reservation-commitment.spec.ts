/**
 * Inventory reservations across the payment boundary.
 *
 * The reservation TTL is a *payment* window. The defect this suite locks down: every reservation used to
 * carry a mandatory expiry and the expiry job released anything whose timer elapsed, so a cash-on-delivery
 * order — confirmed the moment it is placed, with no money to wait for — lost its stock back to the shelf
 * while the order was still live and owed to the buyer. The order was not cancelled either, so the
 * platform held a promise it could no longer keep.
 *
 * The rule now: ACTIVE means "held until the payment window elapses"; CONFIRMED means "committed, and no
 * timer can release it". The job additionally refuses to touch a reservation whose order is no longer
 * waiting for money, which is the second belt for any row state that predates this change.
 */
import { idempotencyKey, signIn, waitForApi, type Session } from '../helpers/api-client';

jest.setTimeout(150_000);

interface OrderShape {
  id: string;
  orderNumber: string;
  status: string;
  payment: { id: string } | null;
}

describe('reservation commitment', () => {
  let buyer: Session;
  let listingId: string;
  let addressId: string;

  async function placeOrder(paymentMethod: 'COD' | 'UPI'): Promise<OrderShape> {
    await buyer.client.delete('/cart');
    const added = await buyer.client.post(
      '/cart/items',
      { supplierProductId: listingId, quantity: 1 },
      idempotencyKey('reservation-cart'),
    );
    expect(added.status).toBe(201);
    const placed = await buyer.client.post(
      '/orders',
      { deliveryAddressId: addressId, deliveryMode: 'INSTANT', paymentMethod },
      idempotencyKey('reservation-order'),
    );
    expect(placed.status).toBe(201);
    return placed.data as OrderShape;
  }

  beforeAll(async () => {
    await waitForApi();
    buyer = await signIn('buyer1@bezzo.local');

    const catalogue = await buyer.client.get('/catalog/products?limit=5');
    let offer: { listingId: string } | undefined;
    for (const product of catalogue.data as Array<{ id: string }>) {
      const detail = await buyer.client.get(`/catalog/products/${product.id}`);
      offer = (detail.data as { offers: Array<{ listingId: string; sellableQuantity: number }> }).offers.find(
        (candidate) => candidate.sellableQuantity > 5,
      );
      if (offer) break;
    }
    expect(offer).toBeDefined();
    listingId = offer!.listingId;

    const addresses = await buyer.client.get('/buyer/addresses');
    const list = addresses.data as Array<{ id: string; isDefault?: boolean }>;
    addressId = (list.find((entry) => entry.isDefault) ?? list[0]).id;
  });

  it('commits a cash-on-delivery reservation at placement, with no payment window', async () => {
    const order = await placeOrder('COD');
    expect(order.status).toBe('CONFIRMED');

    const detail = await buyer.client.get(`/orders/${order.id}`);
    const body = detail.data as { activeReservations: number; reservationCount: number };
    // The reservation is committed, not "active": `activeReservations` counts timed holds only.
    expect(body.reservationCount).toBeGreaterThan(0);
    expect(body.activeReservations).toBe(0);

    await buyer.client.post(
      `/orders/${order.id}/cancel`,
      { reason: 'Integration test — reservation commitment' },
      idempotencyKey('reservation-cancel'),
    );
  });

  it('keeps a committed reservation through an elapsed timer while the order is confirmed', async () => {
    const order = await placeOrder('COD');

    // Reach into the database through the API's own surface is not possible (correctly), so the timer is
    // proven by waiting for a real cycle of the `reservations.expire` job: 30 s cadence, one interval
    // plus slack. Nothing may move — that is the assertion.
    await new Promise((resolve) => setTimeout(resolve, 45_000));

    const detail = await buyer.client.get(`/orders/${order.id}`);
    const body = detail.data as { status: string; paymentStatus: string; reservationCount: number };
    expect(body.status).toBe('CONFIRMED');
    expect(body.paymentStatus).not.toBe('CANCELLED');
    expect(body.reservationCount).toBeGreaterThan(0);

    await buyer.client.post(
      `/orders/${order.id}/cancel`,
      { reason: 'Integration test — committed reservation survived' },
      idempotencyKey('reservation-cancel-after-wait'),
    );
  });

  it('commits a prepaid reservation when the gateway capture is applied', async () => {
    const order = await placeOrder('UPI');
    expect(order.status).toBe('PENDING_PAYMENT');

    const before = await buyer.client.get(`/orders/${order.id}`);
    expect((before.data as { activeReservations: number }).activeReservations).toBeGreaterThan(0);

    const captured = await buyer.client.post(`/dev/payments/${order.payment!.id}/mock-webhook`, {
      outcome: 'PAID',
      eventId: `reservation-capture-${Date.now()}`,
    });
    expect(captured.status).toBe(200);

    const after = await buyer.client.get(`/orders/${order.id}`);
    const body = after.data as { status: string; activeReservations: number; reservationCount: number };
    expect(body.status).toBe('CONFIRMED');
    // Paid: the hold became a commitment, so no timed reservation is left to expire.
    expect(body.activeReservations).toBe(0);
    expect(body.reservationCount).toBeGreaterThan(0);
  });
});
