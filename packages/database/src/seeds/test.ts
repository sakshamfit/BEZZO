/**
 * Test seed — the smallest deterministic fixture that integration tests build on.
 *
 * Tests are expected to create their own transactional objects inside the test transaction; this
 * seed only provides the actors that many tests share.
 */
import { hashPassword } from '@bezzo/crypto';
import type { Database } from '../pool';

export const TEST_PASSWORD = 'Test@12345';

export async function seedTest(db: Database): Promise<number> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  let statements = 0;

  const hub = await db.row<{ id: string }>(`SELECT id FROM collection_hubs WHERE code = 'HUB-01'`);
  if (!hub) throw new Error('Test seed requires the reference seed to run first');

  const actorSpecs: Array<{
    email: string;
    phone: string;
    displayName: string;
    role: string;
    supplier?: { legalName: string; displayName: string; latitude: number; longitude: number };
    buyer?: { businessName: string; storeName: string };
    picker?: { employeeCode: string; latitude: number; longitude: number; capacity: number };
  }> = [
    { email: 'test.admin@bezzo.test', phone: '+919111111001', displayName: 'Test Admin', role: 'SUPER_ADMIN' },
    {
      email: 'test.supplier@bezzo.test',
      phone: '+919111111002',
      displayName: 'Test Supplier Owner',
      role: 'SUPPLIER_OWNER',
      supplier: { legalName: 'Test Pharma Wholesale', displayName: 'Test Pharma', latitude: 25.318, longitude: 82.974 },
    },
    {
      email: 'test.buyer@bezzo.test',
      phone: '+919111111003',
      displayName: 'Test Buyer Owner',
      role: 'BUYER_OWNER',
      buyer: { businessName: 'Test Medical Store', storeName: 'Test Medicos' },
    },
    {
      email: 'test.picker@bezzo.test',
      phone: '+919111111004',
      displayName: 'Test Picker',
      role: 'PICKER',
      picker: { employeeCode: 'P-TEST-01', latitude: 25.318, longitude: 82.974, capacity: 30 },
    },
  ];

  for (const actor of actorSpecs) {
    const role = await db.row<{ id: string }>('SELECT id FROM roles WHERE code = $1', [actor.role]);
    if (!role) throw new Error(`Role ${actor.role} missing — run the reference seed first`);

    const existing = await db.row<{ id: string }>('SELECT id FROM users WHERE email_normalized = lower($1)', [actor.email]);
    const user =
      existing ??
      (await db.row<{ id: string }>(
        `INSERT INTO users (email, phone, display_name, password_hash, status, email_verified_at, phone_verified_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', now(), now())
         RETURNING id`,
        [actor.email, actor.phone, actor.displayName, passwordHash],
      ));
    if (!user) throw new Error(`Failed to seed test user ${actor.email}`);
    statements += 1;

    await db.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2 AND revoked_at IS NULL)`,
      [user.id, role.id],
    );
    statements += 1;

    if (actor.supplier) {
      await db.query(
        `INSERT INTO suppliers (user_id, legal_name, display_name, status, verification_status, city, state, postal_code,
                                pickup_latitude, pickup_longitude, verified_at)
         VALUES ($1, $2, $3, 'ACTIVE', 'VERIFIED', 'Varanasi', 'Uttar Pradesh', '221001', $4, $5, now())
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, actor.supplier.legalName, actor.supplier.displayName, actor.supplier.latitude, actor.supplier.longitude],
      );
      statements += 1;
    }

    if (actor.buyer) {
      await db.query(
        `INSERT INTO buyers (user_id, business_name, store_name, status, verification_status, verified_at)
         VALUES ($1, $2, $3, 'ACTIVE', 'VERIFIED', now())
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, actor.buyer.businessName, actor.buyer.storeName],
      );
      statements += 1;
    }

    if (actor.picker) {
      await db.query(
        `INSERT INTO pickers (user_id, employee_code, status, capacity_packages, home_hub_id, current_latitude, current_longitude, last_heartbeat_at)
         VALUES ($1, $2, 'AVAILABLE', $3, $4, $5, $6, now())
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, actor.picker.employeeCode, actor.picker.capacity, hub.id, actor.picker.latitude, actor.picker.longitude],
      );
      statements += 1;
    }
  }

  return statements;
}
