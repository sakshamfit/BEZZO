/**
 * Reference seed — controlled vocabulary that every BEZZO environment requires.
 *
 * Contains: roles, permissions, role→permission grants, dosage forms, medicine categories,
 * delivery slots, collection hub, feature flags and the runtime configuration defaults.
 * Every statement is idempotent.
 */
import {
  CONFIG_DEFINITIONS,
  Permission as PermissionCode,
  RoleCode,
} from '@bezzo/contracts';
import type { Database } from '../pool';

interface RoleSeed {
  code: string;
  name: string;
  description: string;
  scope: 'MARKETPLACE' | 'ADMIN';
  permissions: string[];
}

/**
 * Role→permission map. Codes are a superset of the identity, API and DB-schema specifications
 * (see docs/02-architecture-decisions.md ADR-0003). Granular authority is expressed as permissions;
 * a role is only a convenient bundle.
 */
const ADMIN_READ_PERMISSIONS = [
  PermissionCode.ADMIN_USER_READ,
  PermissionCode.ADMIN_SUPPLIER_READ,
  PermissionCode.ADMIN_ORDER_READ,
  PermissionCode.ADMIN_PAYMENT_READ,
  PermissionCode.ADMIN_LOGISTICS_READ,
  PermissionCode.ADMIN_PICKER_READ,
  PermissionCode.ADMIN_DISPUTE_READ,
  PermissionCode.ADMIN_ANALYTICS_READ,
];

export const ROLE_SEEDS: RoleSeed[] = [
  {
    code: RoleCode.BUYER,
    name: 'Buyer',
    description: 'Medical store account (base role for every buyer user)',
    scope: 'MARKETPLACE',
    permissions: [
      PermissionCode.BUYER_PROFILE_READ,
      PermissionCode.BUYER_PROFILE_WRITE,
      PermissionCode.BUYER_ORDER_READ,
      PermissionCode.BUYER_ORDER_WRITE,
    ],
  },
  {
    code: RoleCode.BUYER_OWNER,
    name: 'Buyer Owner',
    description: 'Owns the medical-store organization and may manage staff and documents',
    scope: 'MARKETPLACE',
    permissions: [
      PermissionCode.BUYER_PROFILE_READ,
      PermissionCode.BUYER_PROFILE_WRITE,
      PermissionCode.BUYER_ORDER_READ,
      PermissionCode.BUYER_ORDER_WRITE,
    ],
  },
  {
    code: RoleCode.BUYER_STAFF,
    name: 'Buyer Staff',
    description: 'Places and tracks orders on behalf of the medical store',
    scope: 'MARKETPLACE',
    permissions: [PermissionCode.BUYER_PROFILE_READ, PermissionCode.BUYER_ORDER_READ, PermissionCode.BUYER_ORDER_WRITE],
  },
  {
    code: RoleCode.SUPPLIER,
    name: 'Supplier',
    description: 'Wholesaler account (base role for every supplier user)',
    scope: 'MARKETPLACE',
    permissions: [
      PermissionCode.SUPPLIER_PROFILE_READ,
      PermissionCode.SUPPLIER_PROFILE_WRITE,
      PermissionCode.SUPPLIER_LISTING_WRITE,
      PermissionCode.SUPPLIER_INVENTORY_WRITE,
      PermissionCode.SUPPLIER_FULFILLMENT_WRITE,
      PermissionCode.SUPPLIER_SETTLEMENT_READ,
    ],
  },
  {
    code: RoleCode.SUPPLIER_OWNER,
    name: 'Supplier Owner',
    description: 'Owns the wholesaler organization, compliance documents and bank details',
    scope: 'MARKETPLACE',
    permissions: [
      PermissionCode.SUPPLIER_PROFILE_READ,
      PermissionCode.SUPPLIER_PROFILE_WRITE,
      PermissionCode.SUPPLIER_LISTING_WRITE,
      PermissionCode.SUPPLIER_INVENTORY_WRITE,
      PermissionCode.SUPPLIER_FULFILLMENT_WRITE,
      PermissionCode.SUPPLIER_SETTLEMENT_READ,
    ],
  },
  {
    code: RoleCode.SUPPLIER_INVENTORY,
    name: 'Supplier Inventory Operator',
    description: 'Maintains listings, stock and order preparation',
    scope: 'MARKETPLACE',
    permissions: [
      PermissionCode.SUPPLIER_PROFILE_READ,
      PermissionCode.SUPPLIER_LISTING_WRITE,
      PermissionCode.SUPPLIER_INVENTORY_WRITE,
      PermissionCode.SUPPLIER_FULFILLMENT_WRITE,
    ],
  },
  {
    code: RoleCode.SUPPLIER_FINANCE,
    name: 'Supplier Finance',
    description: 'Views settlements and invoices only',
    scope: 'MARKETPLACE',
    permissions: [PermissionCode.SUPPLIER_PROFILE_READ, PermissionCode.SUPPLIER_SETTLEMENT_READ],
  },
  {
    code: RoleCode.PICKER,
    name: 'Picker',
    description: 'Collects prepared fulfillments from suppliers and hands them over at a Bezzo hub',
    scope: 'MARKETPLACE',
    permissions: [
      PermissionCode.PICKER_TASK_READ,
      PermissionCode.PICKER_TASK_EXECUTE,
      PermissionCode.PICKER_PACKAGE_SCAN,
      PermissionCode.PICKER_HANDOVER_EXECUTE,
    ],
  },
  {
    code: RoleCode.SUPPORT_AGENT,
    name: 'Support Agent',
    description: 'Handles buyer/supplier support conversations and disputes',
    scope: 'ADMIN',
    permissions: [
      ...ADMIN_READ_PERMISSIONS,
      PermissionCode.ADMIN_DISPUTE_RESOLVE,
    ],
  },
  {
    code: RoleCode.OPERATIONS_AGENT,
    name: 'Operations Agent',
    description: 'Runs pickup, hub, logistics and fulfillment operations',
    scope: 'ADMIN',
    permissions: [
      ...ADMIN_READ_PERMISSIONS,
      PermissionCode.ADMIN_PICKER_MANAGE,
      PermissionCode.ADMIN_HUB_MANAGE,
      PermissionCode.ADMIN_ORDER_WRITE,
      PermissionCode.ADMIN_LOGISTICS_WRITE,
      PermissionCode.HUB_RECEIVING_EXECUTE,
      PermissionCode.HUB_RECEIVING_READ,
    ],
  },
  {
    code: RoleCode.FINANCE_AGENT,
    name: 'Finance Agent',
    description: 'Reviews payments, refunds and supplier settlements',
    scope: 'ADMIN',
    permissions: [
      ...ADMIN_READ_PERMISSIONS,
      PermissionCode.ADMIN_PAYMENT_REVIEW,
      PermissionCode.ADMIN_SETTLEMENT_APPROVE,
    ],
  },
  {
    code: RoleCode.COMPLIANCE_AGENT,
    name: 'Compliance Agent',
    description: 'Verifies suppliers/buyers and moderates the catalog',
    scope: 'ADMIN',
    permissions: [
      ...ADMIN_READ_PERMISSIONS,
      PermissionCode.ADMIN_SUPPLIER_VERIFY,
      PermissionCode.ADMIN_BUYER_VERIFY,
      PermissionCode.ADMIN_CATALOG_WRITE,
      PermissionCode.ADMIN_AUDIT_READ,
    ],
  },
  {
    code: RoleCode.ADMIN,
    name: 'Administrator',
    description: 'Full backoffice operator role',
    scope: 'ADMIN',
    permissions: (Object.values(PermissionCode) as string[]).filter((code) => code.startsWith('admin.')),
  },
  {
    code: RoleCode.SUPER_ADMIN,
    name: 'Super Administrator',
    description: 'Unrestricted platform administration',
    scope: 'ADMIN',
    permissions: Object.values(PermissionCode) as string[],
  },
];

const DOSAGE_FORMS: Array<{ code: string; name: string; sortOrder: number }> = [
  { code: 'TABLET', name: 'Tablet', sortOrder: 1 },
  { code: 'CAPSULE', name: 'Capsule', sortOrder: 2 },
  { code: 'SYRUP', name: 'Syrup', sortOrder: 3 },
  { code: 'INJECTION', name: 'Injection', sortOrder: 4 },
  { code: 'CREAM', name: 'Cream', sortOrder: 5 },
  { code: 'OINTMENT', name: 'Ointment', sortOrder: 6 },
  { code: 'DROPS', name: 'Drops', sortOrder: 7 },
  { code: 'INHALER', name: 'Inhaler', sortOrder: 8 },
  { code: 'SACHET', name: 'Sachet', sortOrder: 9 },
  { code: 'GEL', name: 'Gel', sortOrder: 10 },
];

/** Two-level starter taxonomy. Operations extend it through the admin catalog module. */
const CATEGORIES: Array<{ slug: string; name: string; parent?: string; sortOrder: number }> = [
  { slug: 'medicines', name: 'Medicines', sortOrder: 1 },
  { slug: 'prescription-medicines', name: 'Prescription Medicines', parent: 'medicines', sortOrder: 1 },
  { slug: 'otc-medicines', name: 'Over-the-Counter Medicines', parent: 'medicines', sortOrder: 2 },
  { slug: 'antibiotics', name: 'Antibiotics', parent: 'medicines', sortOrder: 3 },
  { slug: 'analgesics', name: 'Analgesics & Pain Relief', parent: 'medicines', sortOrder: 4 },
  { slug: 'cardiac-care', name: 'Cardiac Care', parent: 'medicines', sortOrder: 5 },
  { slug: 'diabetes-care', name: 'Diabetes Care', parent: 'medicines', sortOrder: 6 },
  { slug: 'gastro-care', name: 'Gastrointestinal Care', parent: 'medicines', sortOrder: 7 },
  { slug: 'respiratory-care', name: 'Respiratory Care', parent: 'medicines', sortOrder: 8 },
  { slug: 'vitamins-supplements', name: 'Vitamins & Supplements', sortOrder: 2 },
  { slug: 'medical-devices', name: 'Medical Devices & Consumables', sortOrder: 3 },
  { slug: 'surgicals', name: 'Surgicals', parent: 'medical-devices', sortOrder: 1 },
  { slug: 'diagnostics', name: 'Diagnostics', parent: 'medical-devices', sortOrder: 2 },
  { slug: 'personal-care', name: 'Personal Care & Hygiene', sortOrder: 4 },
  { slug: 'baby-care', name: 'Baby & Mother Care', sortOrder: 5 },
  { slug: 'ayurveda', name: 'Ayurveda & Herbal', sortOrder: 6 },
];

const DELIVERY_SLOTS: Array<{ name: string; start: string; end: string; sortOrder: number }> = [
  { name: 'Morning', start: '09:00', end: '12:00', sortOrder: 1 },
  { name: 'Afternoon', start: '12:00', end: '16:00', sortOrder: 2 },
  { name: 'Evening', start: '16:00', end: '20:00', sortOrder: 3 },
];

const FEATURE_FLAGS: Array<{ key: string; enabled: boolean; description: string }> = [
  { key: 'picker.parallel_offers', enabled: false, description: 'Offer urgent pickups to several pickers simultaneously' },
  { key: 'picker.runs_enabled', enabled: true, description: 'Group multiple pickup stops into a single run' },
  { key: 'marketplace.instant_delivery', enabled: true, description: 'Offer instant delivery at checkout' },
  { key: 'marketplace.scheduled_delivery', enabled: true, description: 'Offer scheduled delivery slots at checkout' },
  { key: 'search.opensearch', enabled: false, description: 'Use OpenSearch instead of the database fallback' },
  { key: 'payments.cod', enabled: false, description: 'Offer cash on delivery (requires finance approval)' },
  { key: 'supplier.self_service_onboarding', enabled: true, description: 'Allow suppliers to complete onboarding without an invite' },
];

export async function seedReference(db: Database): Promise<number> {
  let statements = 0;

  // ---- roles -------------------------------------------------------------------------------
  for (const role of ROLE_SEEDS) {
    await db.query(
      `INSERT INTO roles (code, name, description, scope)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, scope = EXCLUDED.scope`,
      [role.code, role.name, role.description, role.scope],
    );
    statements += 1;
  }

  // ---- permissions + role grants ------------------------------------------------------------
  const allPermissions = new Set<string>();
  for (const role of ROLE_SEEDS) for (const permission of role.permissions) allPermissions.add(permission);

  for (const code of allPermissions) {
    await db.query(
      `INSERT INTO permissions (code, description)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
      [code, code.split('.').join(' ')],
    );
    statements += 1;
  }

  for (const role of ROLE_SEEDS) {
    for (const permission of role.permissions) {
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [role.code, permission],
      );
      statements += 1;
    }
  }

  // ---- dosage forms ------------------------------------------------------------------------
  for (const form of DOSAGE_FORMS) {
    await db.query(
      `INSERT INTO dosage_forms (code, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [form.code, form.name, form.sortOrder],
    );
    statements += 1;
  }

  // ---- categories (parents first, then children) -------------------------------------------
  const ordered = [...CATEGORIES.filter((c) => !c.parent), ...CATEGORIES.filter((c) => c.parent)];
  for (const category of ordered) {
    await db.query(
      `INSERT INTO categories (slug, name, sort_order, parent_id, status)
       VALUES ($1, $2, $3, (SELECT id FROM categories WHERE slug = $4), 'ACTIVE')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, parent_id = EXCLUDED.parent_id`,
      [category.slug, category.name, category.sortOrder, category.parent ?? null],
    );
    statements += 1;
  }

  // ---- delivery slots ----------------------------------------------------------------------
  for (const slot of DELIVERY_SLOTS) {
    await db.query(
      `INSERT INTO delivery_slots (name, start_time, end_time, sort_order, active)
       VALUES ($1, $2::TIME, $3::TIME, $4, TRUE)
       ON CONFLICT DO NOTHING`,
      [slot.name, slot.start, slot.end, slot.sortOrder],
    );
    statements += 1;
  }

  // ---- collection hub ----------------------------------------------------------------------
  await db.query(
    `INSERT INTO collection_hubs (code, name, address, locality, city, state, postal_code, latitude, longitude,
                                  operating_hours, capacity_packages, status, supported_delivery_zones)
     VALUES ('HUB-01', 'Bezzo Main Hub', 'Bezzo Operations, Sigra', 'Sigra', 'Varanasi', 'Uttar Pradesh', '221010',
             25.317600, 82.973900, '{"mon_sat":"08:00-21:00","sun":"09:00-14:00"}'::JSONB, 2000, 'ACTIVE',
             '["221001","221002","221010"]'::JSONB)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude, operating_hours = EXCLUDED.operating_hours, capacity_packages = EXCLUDED.capacity_packages`,
    [],
  );
  statements += 1;

  // ---- runtime configuration ---------------------------------------------------------------
  for (const definition of CONFIG_DEFINITIONS) {
    await db.query(
      `INSERT INTO configurations (key, value, description)
       VALUES ($1, $2::JSONB, $3)
       ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
      [definition.key, JSON.stringify(definition.defaultValue), definition.description],
    );
    statements += 1;
  }

  // ---- feature flags -----------------------------------------------------------------------
  for (const flag of FEATURE_FLAGS) {
    await db.query(
      `INSERT INTO feature_flags (key, enabled, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
      [flag.key, flag.enabled, flag.description],
    );
    statements += 1;
  }

  return statements;
}
