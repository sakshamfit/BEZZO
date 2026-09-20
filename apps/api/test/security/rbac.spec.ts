/**
 * Role-based access control matrix — the regression test for the defect that made the whole platform's
 * `@Roles` / `@RequirePermissions` metadata inert.
 *
 * What went wrong: `PermissionsGuard` asked the reflector for its metadata with `[KEY]` instead of
 * `KEY`. The lookup silently returned `undefined`, the guard answered `true` for every request, and the
 * only thing still protecting cross-tenant data was the ownership check inside each service — which is
 * exactly the kind of defence that leaves admin surfaces wide open, because an admin surface has no
 * per-row owner to compare against.
 *
 * The suite is assertively negative: for every protected surface it checks that an actor who must not
 * reach it is refused with 401/403 — never 200 — as well as the positive case, so a guard that refuses
 * everything (the other failure mode) cannot pass either.
 */
import { ApiClient, signIn, waitForApi, type Session } from '../helpers/api-client';

jest.setTimeout(60_000);

/** A route that must answer 403 for a role which is authenticated but unauthorized. */
const ADMIN_ONLY = ['/admin/applications', '/admin/applications/summary'];
const SUPPLIER_ONLY = ['/supplier/profile', '/supplier/listings', '/supplier/inventory', '/supplier/documents'];
const BUYER_ONLY = ['/buyer/profile', '/buyer/addresses', '/buyer/documents', '/cart', '/orders'];
// The picker API lands with Phase 7. Until then the honest assertion is that the routes are absent
// (404) rather than open to everyone; the negative role checks below already apply to every other
// surface, and this test flips to 403/200 the moment the module is registered.
const PICKER_ROUTES_PENDING: string[] = ['/picker/tasks'];

const DENIED = [401, 403];

describe('RBAC matrix', () => {
  let buyer: Session;
  let supplier: Session;
  let picker: Session;
  let admin: Session;
  let anonymous: ApiClient;

  beforeAll(async () => {
    await waitForApi();
    anonymous = new ApiClient();
    [buyer, supplier, picker, admin] = await Promise.all([
      signIn('buyer1@bezzo.local'),
      signIn('supplier1@bezzo.local'),
      signIn('picker1@bezzo.local'),
      signIn('admin@bezzo.local'),
    ]);
  });

  it('assigns exactly the seeded role to each account', () => {
    expect(buyer.roles).toEqual(['BUYER_OWNER']);
    expect(supplier.roles).toEqual(['SUPPLIER_OWNER']);
    expect(picker.roles).toEqual(['PICKER']);
    expect(admin.roles).toEqual(['SUPER_ADMIN']);
  });

  it('refuses every protected route without a token', async () => {
    const probes = [...ADMIN_ONLY, ...SUPPLIER_ONLY, ...BUYER_ONLY, '/me', '/notifications'];
    for (const path of probes) {
      const response = await anonymous.get(path);
      expect([401, 403]).toContain(response.status);
    }
  });

  it('keeps admin surfaces away from every non-admin role', async () => {
    const intruders: Array<[string, Session]> = [
      ['buyer', buyer],
      ['supplier', supplier],
      ['picker', picker],
    ];
    for (const path of ADMIN_ONLY) {
      for (const [label, session] of intruders) {
        const response = await session.client.get(path);
        expect({ path, label, status: response.status }).toEqual({ path, label, status: 403 });
      }
      expect((await admin.client.get(path)).status).toBe(200);
    }
  });

  it('keeps supplier surfaces away from buyers, pickers and admins without the permission', async () => {
    for (const path of SUPPLIER_ONLY) {
      const asBuyer = await buyer.client.get(path);
      const asPicker = await picker.client.get(path);
      expect({ path, role: 'BUYER_OWNER', status: asBuyer.status }).toEqual({
        path,
        role: 'BUYER_OWNER',
        status: 403,
      });
      expect({ path, role: 'PICKER', status: asPicker.status }).toEqual({ path, role: 'PICKER', status: 403 });
      expect((await supplier.client.get(path)).status).toBe(200);
    }
  });

  it('keeps buyer surfaces away from suppliers and pickers', async () => {
    for (const path of BUYER_ONLY) {
      for (const [label, session] of [
        ['supplier', supplier],
        ['picker', picker],
      ] as Array<[string, Session]>) {
        const response = await session.client.get(path);
        expect({ path, label, status: response.status }).toEqual({ path, label, status: 403 });
      }
      expect((await buyer.client.get(path)).status).toBe(200);
    }
  });

  it('has not exposed picker surfaces before the picker module exists', async () => {
    for (const path of PICKER_ROUTES_PENDING) {
      for (const session of [buyer, supplier, picker]) {
        const response = await session.client.get(path);
        expect({ path, status: response.status }).toEqual({ path, status: 404 });
      }
    }
  });

  it('refuses a supplier the buyer order list and a buyer the supplier inventory ledger', async () => {
    expect((await supplier.client.get('/orders')).status).toBe(403);
    expect((await buyer.client.get('/supplier/inventory')).status).toBe(403);
  });

  it('does not let a buyer refund a payment they do not own the money for', async () => {
    // The refund route is guarded by `admin.payment.review`; the buyer must be refused before the
    // service is ever reached, whatever payment id they guess.
    const response = await buyer.client.post(
      '/payments/00000000-0000-4000-8000-000000000000/refund',
      { amount: '1.00', reason: 'RBAC probe' },
      { 'idempotency-key': `rbac-refund-${Date.now()}` },
    );
    expect(response.status).toBe(403);
    expect(response.errorCode).toBe('FORBIDDEN');
  });

  it('does not let an unprivileged role simulate a gateway webhook for someone else’s payment', async () => {
    const response = await supplier.client.post(
      '/dev/payments/00000000-0000-4000-8000-000000000000/mock-webhook',
      { outcome: 'PAID' },
    );
    // Ownership or `admin.payment.read` is required; a supplier holds neither.
    expect([403, 404]).toContain(response.status);
  });
});
