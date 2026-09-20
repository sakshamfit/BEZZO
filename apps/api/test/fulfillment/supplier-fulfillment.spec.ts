/**
 * Supplier fulfillment workflow integration test.
 *
 * Verifies the full vertical slice of Phase 5:
 * 1. Supplier lists fulfillments and views detailed item pick list
 * 2. Supplier accepts incoming order (CREATED -> ALLOCATED)
 * 3. Supplier packs order with physical parcel specifications (ALLOCATED -> PACKED)
 * 4. Supplier marks order ready for pickup (PACKED -> READY_FOR_PICKUP), dispatching a pickup task
 * 5. Supplier rejects an order, releasing the reserved inventory units
 */
import { idempotencyKey, signIn, waitForApi, type Session } from '../helpers/api-client';

jest.setTimeout(120_000);

describe('Supplier Fulfillment Pipeline', () => {
  let buyer: Session;
  let supplier: Session;
  let listingId: string;
  let addressId: string;

  beforeAll(async () => {
    await waitForApi();
    buyer = await signIn('buyer1@bezzo.local');
    supplier = await signIn('supplier1@bezzo.local');

    // Get an offer from supplier1
    const catalogue = await buyer.client.get('/catalog/products?limit=10');
    let foundListingId: string | null = null;
    for (const product of catalogue.data as Array<{ id: string }>) {
      const detail = await buyer.client.get(`/catalog/products/${product.id}`);
      const offers = (detail.data as { offers: Array<{ listingId: string; supplierId: string; sellableQuantity: number }> }).offers;
      const match = offers.find(
        (o) => o.supplierId === supplier.supplierId && o.sellableQuantity > 5,
      );
      if (match) {
        foundListingId = match.listingId;
        break;
      }
    }

    if (!foundListingId) {
      // Fallback: use first available offer
      const anyProduct = catalogue.data as Array<{ id: string }>;
      const detail = await buyer.client.get(`/catalog/products/${anyProduct[0]?.id}`);
      const offers = (detail.data as { offers: Array<{ listingId: string; sellableQuantity: number }> }).offers;
      foundListingId = offers[0]?.listingId ?? '';
    }
    listingId = foundListingId;

    const addresses = await buyer.client.get('/buyer/addresses');
    const addressList = addresses.data as Array<{ id: string }>;
    addressId = addressList[0]!.id;
  });

  async function placeOrder(): Promise<string> {
    await buyer.client.delete('/cart');
    const added = await buyer.client.post(
      '/cart/items',
      { supplierProductId: listingId, quantity: 1 },
      idempotencyKey('sup-ful-cart'),
    );
    expect(added.status).toBe(201);

    const placed = await buyer.client.post(
      '/orders',
      { deliveryAddressId: addressId, deliveryMode: 'INSTANT', paymentMethod: 'COD' },
      idempotencyKey('sup-ful-order'),
    );
    expect(placed.status).toBe(201);
    const orderData = placed.data as { id: string };
    return orderData.id;
  }

  it('progresses an order through accept -> pack -> ready for pickup', async () => {
    const orderId = await placeOrder();
    expect(orderId).toBeDefined();

    // 1. Supplier lists fulfillments
    const listRes = await supplier.client.get('/supplier/fulfillments?page=1&pageSize=10');
    expect(listRes.status).toBe(200);
    const listData = listRes.data as { rows: Array<{ id: string; orderId: string; status: string }>; total: number };
    expect(listData.rows.length).toBeGreaterThan(0);

    const targetFulfillment = listData.rows.find((r) => r.orderId === orderId);
    expect(targetFulfillment).toBeDefined();
    const fulfillmentId = targetFulfillment!.id;

    // 2. Supplier gets fulfillment detail
    const detailRes = await supplier.client.get(`/supplier/fulfillments/${fulfillmentId}`);
    expect(detailRes.status).toBe(200);
    const detail = detailRes.data as {
      id: string;
      status: string;
      items: Array<{ id: string; quantity: number }>;
      buyer: { tradeName: string };
    };
    expect(detail.id).toBe(fulfillmentId);
    expect(detail.items.length).toBeGreaterThan(0);
    expect(detail.buyer.tradeName).toBeDefined();

    // 3. Supplier accepts fulfillment
    const acceptRes = await supplier.client.post(
      `/supplier/fulfillments/${fulfillmentId}/accept`,
      {},
      idempotencyKey('test-accept'),
    );
    expect(acceptRes.status).toBe(200);
    expect((acceptRes.data as { status: string }).status).toBe('ALLOCATED');

    // 4. Supplier packs fulfillment
    const packRes = await supplier.client.post(
      `/supplier/fulfillments/${fulfillmentId}/pack`,
      {
        packages: [
          {
            packageType: 'STANDARD',
            weightGrams: 650,
            sealNumber: 'SEAL-TEST-001',
            handlingNotes: 'Handle with care',
          },
        ],
      },
      idempotencyKey('test-pack'),
    );
    expect(packRes.status).toBe(200);
    expect((packRes.data as { status: string; packageCount: number }).status).toBe('PACKED');
    expect((packRes.data as { packageCount: number }).packageCount).toBe(1);

    // 5. Supplier marks ready for pickup
    const readyRes = await supplier.client.post(
      `/supplier/fulfillments/${fulfillmentId}/ready`,
      {},
      idempotencyKey('test-ready'),
    );
    expect(readyRes.status).toBe(200);
    const readyData = readyRes.data as { status: string; pickupTaskId: string; taskCode: string };
    expect(readyData.status).toBe('READY_FOR_PICKUP');
    expect(readyData.pickupTaskId).toBeDefined();
    expect(readyData.taskCode).toMatch(/^PT-/);

    // Verify detail reflects the new state and packages
    const finalDetailRes = await supplier.client.get(`/supplier/fulfillments/${fulfillmentId}`);
    const finalDetail = finalDetailRes.data as {
      status: string;
      packages: Array<{ packageCode: string; status: string }>;
      pickupTask: { taskCode: string; status: string } | null;
    };
    expect(finalDetail.status).toBe('READY_FOR_PICKUP');
    expect(finalDetail.packages.length).toBe(1);
    expect(finalDetail.pickupTask).not.toBeNull();
    expect(finalDetail.pickupTask?.taskCode).toBe(readyData.taskCode);
  });

  it('allows rejecting an order and releases reserved inventory', async () => {
    const orderId = await placeOrder();
    const listRes = await supplier.client.get('/supplier/fulfillments?page=1&pageSize=10');
    const listData = listRes.data as { rows: Array<{ id: string; orderId: string; status: string }> };
    const targetFulfillment = listData.rows.find((r) => r.orderId === orderId)!;

    const rejectRes = await supplier.client.post(
      `/supplier/fulfillments/${targetFulfillment.id}/reject`,
      { reason: 'Inventory batch damaged during quality check' },
      idempotencyKey('test-reject'),
    );
    expect(rejectRes.status).toBe(200);
    const rejectData = rejectRes.data as { success: boolean; status: string; releasedUnits: number };
    expect(rejectData.success).toBe(true);
    expect(rejectData.status).toBe('CANCELLED');
    expect(rejectData.releasedUnits).toBeGreaterThanOrEqual(1);

    // Verify detail confirms CANCELLED status
    const detailRes = await supplier.client.get(`/supplier/fulfillments/${targetFulfillment.id}`);
    expect((detailRes.data as { status: string }).status).toBe('CANCELLED');
  });
});
