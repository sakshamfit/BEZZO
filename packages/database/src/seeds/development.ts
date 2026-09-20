/**
 * Development seed — a realistic, idempotent marketplace fixture for local work.
 *
 * Creates: one admin, three verified suppliers (with documents and service areas), two medical-store
 * buyers with addresses, three pickers attached to the main hub, a catalog of products with supplier
 * listings and inventory (including the matching ledger rows).
 *
 * Orders, fulfillments and pickup tasks are intentionally NOT seeded here: they are created through
 * the real domain services by `apps/api/scripts/seed-scenario.ts`, so demo data always respects the
 * same invariants as production traffic.
 */
import { hashPassword } from '@bezzo/crypto';
import type { Database } from '../pool';

/** Local-only credentials. Deliberately obvious so they can never be mistaken for real accounts. */
export const DEV_PASSWORD = 'Bezzo@12345';

interface DevUser {
  key: string;
  email: string;
  phone: string;
  displayName: string;
  role: string;
}

const DEV_USERS: DevUser[] = [
  { key: 'admin', email: 'admin@bezzo.local', phone: '+919000000001', displayName: 'Bezzo Admin', role: 'SUPER_ADMIN' },
  { key: 'ops', email: 'ops@bezzo.local', phone: '+919000000002', displayName: 'Bezzo Operations', role: 'OPERATIONS_AGENT' },
  { key: 'supplier1', email: 'supplier1@bezzo.local', phone: '+919000000011', displayName: 'ABC Pharma Owner', role: 'SUPPLIER_OWNER' },
  { key: 'supplier2', email: 'supplier2@bezzo.local', phone: '+919000000012', displayName: 'XYZ Distributors Owner', role: 'SUPPLIER_OWNER' },
  { key: 'supplier3', email: 'supplier3@bezzo.local', phone: '+919000000013', displayName: 'Medico Wholesale Owner', role: 'SUPPLIER_OWNER' },
  { key: 'buyer1', email: 'buyer1@bezzo.local', phone: '+919000000021', displayName: 'Sunrise Pharmacy Owner', role: 'BUYER_OWNER' },
  { key: 'buyer2', email: 'buyer2@bezzo.local', phone: '+919000000022', displayName: 'City Medicos Owner', role: 'BUYER_OWNER' },
  { key: 'picker1', email: 'picker1@bezzo.local', phone: '+919000000031', displayName: 'Ravi Kumar', role: 'PICKER' },
  { key: 'picker2', email: 'picker2@bezzo.local', phone: '+919000000032', displayName: 'Amit Singh', role: 'PICKER' },
  { key: 'picker3', email: 'picker3@bezzo.local', phone: '+919000000033', displayName: 'Suresh Yadav', role: 'PICKER' },
];

interface DevSupplier {
  key: string;
  userKey: string;
  legalName: string;
  displayName: string;
  gstin: string;
  pan: string;
  address: string;
  locality: string;
  latitude: number;
  longitude: number;
  contactPhone: string;
}

const DEV_SUPPLIERS: DevSupplier[] = [
  {
    key: 'supplier1',
    userKey: 'supplier1',
    legalName: 'ABC Pharma Wholesalers Pvt Ltd',
    displayName: 'ABC Pharma Wholesaler',
    gstin: '09AAACA1234A1Z5',
    pan: 'AAACA1234A',
    address: '12 Sigra Crossing, Sigra',
    locality: 'Sigra',
    latitude: 25.3184,
    longitude: 82.9762,
    contactPhone: '+919000000011',
  },
  {
    key: 'supplier2',
    userKey: 'supplier2',
    legalName: 'XYZ Distributors Pvt Ltd',
    displayName: 'XYZ Distributors',
    gstin: '09AAACX5678B1Z2',
    pan: 'AAACX5678B',
    address: '45 Lanka Market, Lanka',
    locality: 'Lanka',
    latitude: 25.2721,
    longitude: 82.9905,
    contactPhone: '+919000000012',
  },
  {
    key: 'supplier3',
    userKey: 'supplier3',
    legalName: 'Medico Wholesale Traders',
    displayName: 'Medico Wholesale',
    gstin: '09AAACM9012C1Z9',
    pan: 'AAACM9012C',
    address: '8 Cantt Road, Cantonment',
    locality: 'Cantonment',
    latitude: 25.3345,
    longitude: 82.9782,
    contactPhone: '+919000000013',
  },
];

interface DevBuyer {
  key: string;
  userKey: string;
  businessName: string;
  storeName: string;
  gstin: string;
  license: string;
  address: {
    label: string;
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
}

const DEV_BUYERS: DevBuyer[] = [
  {
    key: 'buyer1',
    userKey: 'buyer1',
    businessName: 'Sunrise Pharmacy Pvt Ltd',
    storeName: 'Sunrise Pharmacy',
    gstin: '09AAACS1111D1Z1',
    license: 'UP-VAR-20B-112233',
    address: {
      label: 'Main Store',
      line1: 'Shop 4, Sigra Market',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      postalCode: '221010',
      latitude: 25.3172,
      longitude: 82.9741,
    },
  },
  {
    key: 'buyer2',
    userKey: 'buyer2',
    businessName: 'City Medicos',
    storeName: 'City Medicos',
    gstin: '09AAACC2222E1Z7',
    license: 'UP-VAR-20B-445566',
    address: {
      label: 'Head Store',
      line1: 'Plot 22, Ravindrapuri Road',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      postalCode: '221005',
      latitude: 25.2839,
      longitude: 82.9889,
    },
  },
];

interface DevPicker {
  key: string;
  userKey: string;
  employeeCode: string;
  vehicleType: string;
  capacityPackages: number;
  latitude: number;
  longitude: number;
  status: string;
}

const DEV_PICKERS: DevPicker[] = [
  { key: 'picker1', userKey: 'picker1', employeeCode: 'P-1001', vehicleType: 'MOTORCYCLE', capacityPackages: 20, latitude: 25.3180, longitude: 82.9730, status: 'AVAILABLE' },
  { key: 'picker2', userKey: 'picker2', employeeCode: 'P-1002', vehicleType: 'SCOOTER', capacityPackages: 24, latitude: 25.2740, longitude: 82.9880, status: 'AVAILABLE' },
  { key: 'picker3', userKey: 'picker3', employeeCode: 'P-1003', vehicleType: 'THREE_WHEELER', capacityPackages: 60, latitude: 25.3330, longitude: 82.9770, status: 'OFFLINE' },
];

interface DevProduct {
  name: string;
  genericName: string;
  categorySlug: string;
  dosageFormCode: string;
  strength: string;
  packSize: string;
  manufacturer: string;
  composition: string;
  prescription: 'NOT_SCHEDULED' | 'PRESCRIPTION_REQUIRED' | 'OTC' | 'CONTROLLED_SCHEDULE' | 'NARCOTIC';
  storage: string;
}

const DEV_PRODUCTS: DevProduct[] = [
  { name: 'Paracetamol 500mg Tablet', genericName: 'Paracetamol', categorySlug: 'analgesics', dosageFormCode: 'TABLET', strength: '500 mg', packSize: '10x10', manufacturer: 'Cipla Ltd', composition: 'Paracetamol 500 mg', prescription: 'OTC', storage: 'Store below 30°C' },
  { name: 'Azithromycin 500mg Tablet', genericName: 'Azithromycin', categorySlug: 'antibiotics', dosageFormCode: 'TABLET', strength: '500 mg', packSize: '1x3', manufacturer: 'Alkem Laboratories', composition: 'Azithromycin 500 mg', prescription: 'PRESCRIPTION_REQUIRED', storage: 'Store below 30°C' },
  { name: 'Amoxicillin + Clavulanic Acid 625mg', genericName: 'Amoxicillin and Clavulanic Acid', categorySlug: 'antibiotics', dosageFormCode: 'TABLET', strength: '625 mg', packSize: '1x10', manufacturer: 'Sun Pharmaceutical Industries', composition: 'Amoxicillin 500 mg + Clavulanic Acid 125 mg', prescription: 'PRESCRIPTION_REQUIRED', storage: 'Store below 25°C' },
  { name: 'Metformin 500mg Tablet', genericName: 'Metformin Hydrochloride', categorySlug: 'diabetes-care', dosageFormCode: 'TABLET', strength: '500 mg', packSize: '10x15', manufacturer: 'USV Pvt Ltd', composition: 'Metformin Hydrochloride 500 mg', prescription: 'PRESCRIPTION_REQUIRED', storage: 'Store below 30°C' },
  { name: 'Amlodipine 5mg Tablet', genericName: 'Amlodipine Besylate', categorySlug: 'cardiac-care', dosageFormCode: 'TABLET', strength: '5 mg', packSize: '10x10', manufacturer: 'Zydus Lifesciences', composition: 'Amlodipine Besylate 5 mg', prescription: 'PRESCRIPTION_REQUIRED', storage: 'Store below 30°C' },
  { name: 'Pantoprazole 40mg Tablet', genericName: 'Pantoprazole Sodium', categorySlug: 'gastro-care', dosageFormCode: 'TABLET', strength: '40 mg', packSize: '10x10', manufacturer: 'Aristo Pharmaceuticals', composition: 'Pantoprazole Sodium 40 mg', prescription: 'PRESCRIPTION_REQUIRED', storage: 'Store below 30°C' },
  { name: 'Salbutamol Inhaler 100mcg', genericName: 'Salbutamol', categorySlug: 'respiratory-care', dosageFormCode: 'INHALER', strength: '100 mcg', packSize: '1 unit', manufacturer: 'Cipla Ltd', composition: 'Salbutamol Sulphate 100 mcg', prescription: 'PRESCRIPTION_REQUIRED', storage: 'Store below 30°C, protect from sunlight' },
  { name: 'Cetirizine 10mg Tablet', genericName: 'Cetirizine Hydrochloride', categorySlug: 'otc-medicines', dosageFormCode: 'TABLET', strength: '10 mg', packSize: '10x10', manufacturer: 'Dr Reddys Laboratories', composition: 'Cetirizine Hydrochloride 10 mg', prescription: 'OTC', storage: 'Store below 30°C' },
  { name: 'Vitamin D3 60000 IU Sachet', genericName: 'Cholecalciferol', categorySlug: 'vitamins-supplements', dosageFormCode: 'SACHET', strength: '60000 IU', packSize: '1x4', manufacturer: 'Abbott India', composition: 'Cholecalciferol 60000 IU', prescription: 'OTC', storage: 'Store below 30°C' },
  { name: 'ORS Powder Lemon', genericName: 'Oral Rehydration Salts', categorySlug: 'otc-medicines', dosageFormCode: 'SACHET', strength: '21.8 g', packSize: '1x5', manufacturer: 'FDC Limited', composition: 'Sodium Chloride 2.6 g, Glucose 13.5 g', prescription: 'OTC', storage: 'Store in a cool dry place' },
  { name: 'Digital Thermometer', genericName: 'Digital Clinical Thermometer', categorySlug: 'diagnostics', dosageFormCode: 'SACHET', strength: 'N/A', packSize: '1 unit', manufacturer: 'Dr Morepen', composition: 'Not applicable', prescription: 'NOT_SCHEDULED', storage: 'Room temperature' },
  { name: 'Nitrile Examination Gloves (Medium)', genericName: 'Examination Gloves', categorySlug: 'surgicals', dosageFormCode: 'SACHET', strength: 'N/A', packSize: '100 pcs', manufacturer: 'Romsons Group', composition: 'Nitrile butadiene rubber', prescription: 'NOT_SCHEDULED', storage: 'Store in a dry place' },
];

/** Listing price/inventory matrix: supplierKey → product name → commercial terms. */
const DEV_LISTINGS: Array<{
  supplierKey: string;
  productName: string;
  supplierSku: string;
  sellingPrice: number;
  mrp: number;
  taxRate: number;
  available: number;
  lowStockThreshold: number;
  batchNumber: string;
  expiryDate: string;
}> = [
  { supplierKey: 'supplier1', productName: 'Paracetamol 500mg Tablet', supplierSku: 'ABC-PARA-500', sellingPrice: 215.0, mrp: 260.0, taxRate: 12, available: 480, lowStockThreshold: 50, batchNumber: 'PCM24A117', expiryDate: '2027-06-30' },
  { supplierKey: 'supplier1', productName: 'Azithromycin 500mg Tablet', supplierSku: 'ABC-AZITH-500', sellingPrice: 92.5, mrp: 110.0, taxRate: 12, available: 260, lowStockThreshold: 30, batchNumber: 'AZI25B203', expiryDate: '2026-12-31' },
  { supplierKey: 'supplier1', productName: 'Amoxicillin + Clavulanic Acid 625mg', supplierSku: 'ABC-AMOX-625', sellingPrice: 168.0, mrp: 205.0, taxRate: 12, available: 140, lowStockThreshold: 20, batchNumber: 'AMC25C311', expiryDate: '2026-10-31' },
  { supplierKey: 'supplier1', productName: 'Cetirizine 10mg Tablet', supplierSku: 'ABC-CTZ-10', sellingPrice: 32.0, mrp: 42.0, taxRate: 12, available: 900, lowStockThreshold: 100, batchNumber: 'CTZ25D102', expiryDate: '2027-03-31' },
  { supplierKey: 'supplier2', productName: 'Metformin 500mg Tablet', supplierSku: 'XYZ-MET-500', sellingPrice: 58.4, mrp: 72.0, taxRate: 12, available: 320, lowStockThreshold: 40, batchNumber: 'MET25E221', expiryDate: '2027-01-31' },
  { supplierKey: 'supplier2', productName: 'Amlodipine 5mg Tablet', supplierSku: 'XYZ-AML-5', sellingPrice: 41.0, mrp: 52.0, taxRate: 12, available: 410, lowStockThreshold: 50, batchNumber: 'AML25F118', expiryDate: '2027-05-31' },
  { supplierKey: 'supplier2', productName: 'Pantoprazole 40mg Tablet', supplierSku: 'XYZ-PAN-40', sellingPrice: 76.5, mrp: 96.0, taxRate: 12, available: 275, lowStockThreshold: 30, batchNumber: 'PAN25G220', expiryDate: '2026-11-30' },
  { supplierKey: 'supplier2', productName: 'Vitamin D3 60000 IU Sachet', supplierSku: 'XYZ-VITD-60K', sellingPrice: 118.0, mrp: 145.0, taxRate: 12, available: 190, lowStockThreshold: 25, batchNumber: 'VTD25H901', expiryDate: '2027-08-31' },
  { supplierKey: 'supplier3', productName: 'Salbutamol Inhaler 100mcg', supplierSku: 'MED-SALB-100', sellingPrice: 154.0, mrp: 190.0, taxRate: 12, available: 85, lowStockThreshold: 15, batchNumber: 'SLB25J330', expiryDate: '2027-02-28' },
  { supplierKey: 'supplier3', productName: 'ORS Powder Lemon', supplierSku: 'MED-ORS-LEM', sellingPrice: 96.0, mrp: 120.0, taxRate: 12, available: 240, lowStockThreshold: 30, batchNumber: 'ORS25K118', expiryDate: '2027-04-30' },
  { supplierKey: 'supplier3', productName: 'Digital Thermometer', supplierSku: 'MED-THERM-01', sellingPrice: 165.0, mrp: 220.0, taxRate: 18, available: 60, lowStockThreshold: 10, batchNumber: 'THM25L007', expiryDate: '2030-12-31' },
  { supplierKey: 'supplier3', productName: 'Nitrile Examination Gloves (Medium)', supplierSku: 'MED-GLOVE-M', sellingPrice: 385.0, mrp: 470.0, taxRate: 18, available: 120, lowStockThreshold: 20, batchNumber: 'GLV25M411', expiryDate: '2028-06-30' },
  { supplierKey: 'supplier1', productName: 'Metformin 500mg Tablet', supplierSku: 'ABC-MET-500', sellingPrice: 55.9, mrp: 72.0, taxRate: 12, available: 150, lowStockThreshold: 20, batchNumber: 'MET25E222', expiryDate: '2027-01-31' },
  { supplierKey: 'supplier2', productName: 'Paracetamol 500mg Tablet', supplierSku: 'XYZ-PARA-500', sellingPrice: 212.0, mrp: 260.0, taxRate: 12, available: 620, lowStockThreshold: 60, batchNumber: 'PCM24A221', expiryDate: '2027-06-30' },
  { supplierKey: 'supplier3', productName: 'Cetirizine 10mg Tablet', supplierSku: 'MED-CTZ-10', sellingPrice: 30.5, mrp: 42.0, taxRate: 12, available: 350, lowStockThreshold: 40, batchNumber: 'CTZ25D311', expiryDate: '2027-03-31' },
];

export async function seedDevelopment(db: Database): Promise<number> {
  let statements = 0;
  const passwordHash = await hashPassword(DEV_PASSWORD);

  const userIds = new Map<string, string>();
  for (const user of DEV_USERS) {
    const role = await db.row<{ id: string }>('SELECT id FROM roles WHERE code = $1', [user.role]);
    if (!role) throw new Error(`Role ${user.role} is missing — run the reference seed first`);
    const organizationType =
      user.role.startsWith('SUPPLIER') ? 'SUPPLIER_ORGANIZATION' : user.role.startsWith('BUYER') ? 'BUYER_ORGANIZATION' : 'BEZZO_ORGANIZATION';
    const organizationName = user.role.startsWith('SUPPLIER')
      ? (DEV_SUPPLIERS.find((s) => s.userKey === user.key)?.legalName ?? user.displayName)
      : user.role.startsWith('BUYER')
        ? (DEV_BUYERS.find((b) => b.userKey === user.key)?.businessName ?? user.displayName)
        : 'Bezzo Operations';

    // Users are matched on email so re-running the seed stays idempotent.
    const existing = await db.row<{ id: string }>('SELECT id FROM users WHERE email_normalized = lower($1)', [user.email]);
    const userId =
      existing?.id ??
      (
        await db.row<{ id: string }>(
          `INSERT INTO users (email, phone, display_name, password_hash, status, email_verified_at, phone_verified_at, terms_accepted_at, terms_version)
           VALUES ($1, $2, $3, $4, 'ACTIVE', now(), now(), now(), 'dev-seed')
           RETURNING id`,
          [user.email, user.phone, user.displayName, passwordHash],
        )
      )?.id;
    if (!userId) throw new Error(`Failed to seed user ${user.email}`);
    userIds.set(user.key, userId);
    statements += 1;

    const organization = await db.row<{ id: string }>(
      `INSERT INTO organizations (type, name)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [organizationType, organizationName],
    );
    const organizationId =
      organization?.id ??
      (
        await db.row<{ id: string }>(
          `SELECT id FROM organizations WHERE type = $1 AND name = $2 ORDER BY created_at LIMIT 1`,
          [organizationType, organizationName],
        )
      )?.id;
    if (organizationId) {
      await db.query(
        `INSERT INTO organization_members (organization_id, user_id, membership_status, is_primary_contact, joined_at)
         VALUES ($1, $2, 'ACTIVE', TRUE, now())
         ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [organizationId, userId],
      );
      statements += 1;
    }

    await db.query(
      `INSERT INTO user_roles (user_id, role_id, organization_id)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2 AND revoked_at IS NULL
       )`,
      [userId, role.id, organizationId ?? null],
    );
    statements += 1;
  }

  // ---- suppliers ---------------------------------------------------------------------------
  const supplierIds = new Map<string, string>();
  for (const supplier of DEV_SUPPLIERS) {
    const userId = userIds.get(supplier.userKey);
    if (!userId) throw new Error(`Missing seeded user for supplier ${supplier.key}`);
    const row = await db.row<{ id: string }>(
      `INSERT INTO suppliers (user_id, legal_name, display_name, business_type, gstin, pan, status, verification_status,
                              pickup_address, locality, city, state, postal_code, pickup_latitude, pickup_longitude,
                              contact_phone, contact_email, operating_hours, verified_at, submitted_for_review_at)
       VALUES ($1, $2, $3, 'WHOLESALER', $4, $5, 'ACTIVE', 'VERIFIED', $6, $7, 'Varanasi', 'Uttar Pradesh', '221001',
               $8, $9, $10, (SELECT email FROM users WHERE id = $1), '{"mon_sat":"09:00-20:00","sun":"CLOSED"}'::JSONB,
               now(), now())
       ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, status = EXCLUDED.status,
         verification_status = EXCLUDED.verification_status, pickup_latitude = EXCLUDED.pickup_latitude,
         pickup_longitude = EXCLUDED.pickup_longitude, pickup_address = EXCLUDED.pickup_address, locality = EXCLUDED.locality
       RETURNING id`,
      [
        userId,
        supplier.legalName,
        supplier.displayName,
        supplier.gstin,
        supplier.pan,
        supplier.address,
        supplier.locality,
        supplier.latitude,
        supplier.longitude,
        supplier.contactPhone,
      ],
    );
    if (!row) throw new Error(`Failed to seed supplier ${supplier.key}`);
    supplierIds.set(supplier.key, row.id);
    statements += 1;

    await db.query(
      `INSERT INTO supplier_business_details (supplier_id, registered_address, warehouse_address, contact_person, storage_configuration)
       VALUES ($1, $2, $2, $3, '{"temperature_controlled":true,"cold_chain":false}'::JSONB)
       ON CONFLICT (supplier_id) DO UPDATE SET registered_address = EXCLUDED.registered_address, contact_person = EXCLUDED.contact_person`,
      [row.id, supplier.address, supplier.displayName],
    );
    statements += 1;

    // Documents are seeded as approved metadata only: no binary is ever stored in PostgreSQL.
    const documents: Array<{ type: string; number: string; expiry: string }> = [
      { type: 'WHOLESALE_DRUG_LICENSE', number: `UP-VAR-20B-${supplier.gstin.slice(-4)}`, expiry: '2028-03-31' },
      { type: 'GST_CERTIFICATE', number: supplier.gstin, expiry: '2030-03-31' },
      { type: 'PAN', number: supplier.pan, expiry: '2035-12-31' },
    ];
    for (const document of documents) {
      await db.query(
        `INSERT INTO supplier_documents (supplier_id, document_type, document_number, object_key, file_name, content_type,
                                         file_size_bytes, status, issued_at, expires_at, verified_at)
         VALUES ($1, $2, $3, $4, $5, 'application/pdf', 0, 'APPROVED', '2024-04-01', $6::DATE, now())
         ON CONFLICT DO NOTHING`,
        [
          row.id,
          document.type,
          document.number,
          `dev-seed/${supplier.key}/${document.type.toLowerCase()}.pdf`,
          `${document.type.toLowerCase()}.pdf`,
          document.expiry,
        ],
      );
      statements += 1;
    }

    await db.query(
      `INSERT INTO supplier_service_areas (supplier_id, postal_code, city, state, service_type)
       VALUES ($1, '221001', 'Varanasi', 'Uttar Pradesh', 'BOTH'),
              ($1, '221010', 'Varanasi', 'Uttar Pradesh', 'BOTH'),
              ($1, '221005', 'Varanasi', 'Uttar Pradesh', 'BOTH')
       ON CONFLICT DO NOTHING`,
      [row.id],
    );
    statements += 1;
  }

  // ---- buyers + addresses ------------------------------------------------------------------
  const buyerIds = new Map<string, string>();
  for (const buyer of DEV_BUYERS) {
    const userId = userIds.get(buyer.userKey);
    if (!userId) throw new Error(`Missing seeded user for buyer ${buyer.key}`);
    const row = await db.row<{ id: string }>(
      `INSERT INTO buyers (user_id, business_name, store_name, business_type, gstin, license_reference, status, verification_status, verified_at)
       VALUES ($1, $2, $3, 'MEDICAL_STORE', $4, $5, 'ACTIVE', 'VERIFIED', now())
       ON CONFLICT (user_id) DO UPDATE SET business_name = EXCLUDED.business_name, store_name = EXCLUDED.store_name,
         status = EXCLUDED.status, verification_status = EXCLUDED.verification_status
       RETURNING id`,
      [userId, buyer.businessName, buyer.storeName, buyer.gstin, buyer.license],
    );
    if (!row) throw new Error(`Failed to seed buyer ${buyer.key}`);
    buyerIds.set(buyer.key, row.id);
    statements += 1;

    await db.query(
      `INSERT INTO buyer_addresses (buyer_id, label, contact_name, contact_phone, address_line_1, city, state, postal_code, latitude, longitude, is_default)
       SELECT $1, $2, $3, (SELECT phone FROM users WHERE id = $4), $5, $6, $7, $8, $9, $10, TRUE
       WHERE NOT EXISTS (SELECT 1 FROM buyer_addresses WHERE buyer_id = $1 AND label = $2)`,
      [
        row.id,
        buyer.address.label,
        buyer.storeName,
        userId,
        buyer.address.line1,
        buyer.address.city,
        buyer.address.state,
        buyer.address.postalCode,
        buyer.address.latitude,
        buyer.address.longitude,
      ],
    );
    statements += 1;

    await db.query(
      `INSERT INTO buyer_documents (buyer_id, document_type, document_number, object_key, file_name, content_type, file_size_bytes, status, expires_at, verified_at)
       SELECT $1, 'RETAIL_DRUG_LICENSE', $2, $3, 'retail-license.pdf', 'application/pdf', 0, 'APPROVED', '2028-03-31', now()
       WHERE NOT EXISTS (SELECT 1 FROM buyer_documents WHERE buyer_id = $1 AND document_type = 'RETAIL_DRUG_LICENSE')`,
      [row.id, buyer.license, `dev-seed/${buyer.key}/retail-license.pdf`],
    );
    statements += 1;
  }

  // ---- pickers -----------------------------------------------------------------------------
  const hub = await db.row<{ id: string }>(`SELECT id FROM collection_hubs WHERE code = 'HUB-01'`);
  if (!hub) throw new Error('Main hub is missing — run the reference seed first');
  for (const picker of DEV_PICKERS) {
    const userId = userIds.get(picker.userKey);
    if (!userId) throw new Error(`Missing seeded user for picker ${picker.key}`);
    const row = await db.row<{ id: string }>(
      `INSERT INTO pickers (user_id, employee_code, status, phone, vehicle_type, capacity_packages, home_hub_id,
                            current_latitude, current_longitude, last_heartbeat_at)
       VALUES ($1, $2, $3, (SELECT phone FROM users WHERE id = $1), $4, $5, $6, $7, $8, now())
       ON CONFLICT (user_id) DO UPDATE SET employee_code = EXCLUDED.employee_code, vehicle_type = EXCLUDED.vehicle_type,
         capacity_packages = EXCLUDED.capacity_packages, home_hub_id = EXCLUDED.home_hub_id,
         current_latitude = EXCLUDED.current_latitude, current_longitude = EXCLUDED.current_longitude,
         last_heartbeat_at = now()
       RETURNING id`,
      [userId, picker.employeeCode, picker.status, picker.vehicleType, picker.capacityPackages, hub.id, picker.latitude, picker.longitude],
    );
    statements += 1;
    if (row) {
      await db.query(
        `INSERT INTO picker_availability (picker_id, status, latitude, longitude, last_heartbeat_at)
         VALUES ($1, $2, $3, $4, now())`,
        [row.id, picker.status, picker.latitude, picker.longitude],
      );
      statements += 1;
    }
  }

  // ---- catalog + listings + inventory ------------------------------------------------------
  for (const product of DEV_PRODUCTS) {
    const category = await db.row<{ id: string }>('SELECT id FROM categories WHERE slug = $1', [product.categorySlug]);
    const dosageForm = await db.row<{ id: string }>('SELECT id FROM dosage_forms WHERE code = $1', [product.dosageFormCode]);
    if (!category) throw new Error(`Category ${product.categorySlug} is missing — run the reference seed first`);
    const manufacturer = await db.row<{ id: string }>(
      `INSERT INTO manufacturers (name, normalized_name)
       VALUES ($1, lower(regexp_replace($1, '[^a-zA-Z0-9]', '', 'g')))
       ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [product.manufacturer],
    );
    const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const row = await db.row<{ id: string }>(
      `INSERT INTO products (category_id, manufacturer_id, dosage_form_id, name, slug, normalized_name, generic_name,
                             normalized_generic_name, composition_summary, strength, pack_size, prescription_classification,
                             storage_requirements, status, published_at)
       VALUES ($1, $2, $3, $4, $5, lower(regexp_replace($4, '[^a-zA-Z0-9]', '', 'g')), $6,
               lower(regexp_replace($6, '[^a-zA-Z0-9]', '', 'g')), $7, $8, $9, $10, $11, 'PUBLISHED', now())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'PUBLISHED', category_id = EXCLUDED.category_id
       RETURNING id`,
      [
        category.id,
        manufacturer?.id ?? null,
        dosageForm?.id ?? null,
        product.name,
        slug,
        product.genericName,
        product.composition,
        product.strength,
        product.packSize,
        product.prescription,
        product.storage,
      ],
    );
    if (!row) throw new Error(`Failed to seed product ${product.name}`);
    statements += 1;

    await db.query(
      `INSERT INTO product_compositions (product_id, ingredient_name, normalized_ingredient_name, strength, sequence)
       SELECT $1, $2, lower(regexp_replace($2, '[^a-zA-Z0-9]', '', 'g')), $3, 1
       WHERE NOT EXISTS (SELECT 1 FROM product_compositions WHERE product_id = $1)`,
      [row.id, product.genericName, product.strength],
    );
    statements += 1;

    await db.query(
      `INSERT INTO product_identifiers (product_id, identifier_type, identifier_value, normalized_value)
       SELECT $1, 'INTERNAL_REFERENCE', $2, upper($2)
       WHERE NOT EXISTS (SELECT 1 FROM product_identifiers WHERE product_id = $1 AND identifier_type = 'INTERNAL_REFERENCE')`,
      [row.id, slug.toUpperCase()],
    );
    statements += 1;
  }

  for (const listing of DEV_LISTINGS) {
    const supplierId = supplierIds.get(listing.supplierKey);
    if (!supplierId) throw new Error(`Missing seeded supplier ${listing.supplierKey}`);
    const product = await db.row<{ id: string }>('SELECT id FROM products WHERE name = $1', [listing.productName]);
    if (!product) throw new Error(`Missing seeded product ${listing.productName}`);

    const listingRow = await db.row<{ id: string }>(
      `INSERT INTO supplier_product_listings (supplier_id, product_id, supplier_sku, selling_price, mrp_reference, tax_rate,
                                              minimum_order_quantity, lead_time_minutes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 60, 'ACTIVE')
       ON CONFLICT (supplier_id, product_id) DO UPDATE SET selling_price = EXCLUDED.selling_price,
         mrp_reference = EXCLUDED.mrp_reference, supplier_sku = EXCLUDED.supplier_sku, status = 'ACTIVE'
       RETURNING id`,
      [supplierId, product.id, listing.supplierSku, listing.sellingPrice, listing.mrp, listing.taxRate],
    );
    if (!listingRow) throw new Error(`Failed to seed listing ${listing.supplierSku}`);
    statements += 1;

    const inventory = await db.row<{ id: string; available_quantity: number }>(
      `INSERT INTO inventories (supplier_listing_id, supplier_id, available_quantity, low_stock_threshold, status,
                                batch_number, expiry_date, source)
       VALUES ($1, $2, $3, $4, 'AVAILABLE', $5, $6::DATE, 'MANUAL')
       ON CONFLICT (supplier_listing_id) DO UPDATE SET available_quantity = EXCLUDED.available_quantity,
         low_stock_threshold = EXCLUDED.low_stock_threshold, batch_number = EXCLUDED.batch_number,
         expiry_date = EXCLUDED.expiry_date, status = 'AVAILABLE', version = inventories.version + 1
       RETURNING id, available_quantity`,
      [listingRow.id, supplierId, listing.available, listing.lowStockThreshold, listing.batchNumber, listing.expiryDate],
    );
    statements += 1;

    if (inventory) {
      await db.query(
        `INSERT INTO inventory_transactions (inventory_id, supplier_id, transaction_type, quantity, before_quantity, after_quantity, reason, reference_type)
         SELECT $1, $2, 'STOCK_IN', $3, 0, $3, 'Development seed stock', 'SEED'
         WHERE NOT EXISTS (
           SELECT 1 FROM inventory_transactions WHERE inventory_id = $1 AND reference_type = 'SEED'
         )`,
        [inventory.id, supplierId, listing.available],
      );
      statements += 1;
    }
  }

  return statements;
}
