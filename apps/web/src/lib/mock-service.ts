/**
 * In-memory mock service for AI Studio preview.
 *
 * Provides realistic, stateful marketplace data so that every page in BEZZO
 * (storefront, catalogue, cart, checkout, orders, supplier workspace, and admin console)
 * works interactively in the container without requiring live external Postgres,
 * Redis, or OpenSearch instances.
 */

import type {
  AdminPaymentDetail,
  AdminPaymentList,
  AdminPaymentRow,
  ApplicationRouting,
  BuyerAddress,
  BuyerDocument,
  BuyerProfile,
  Cart,
  CartLine,
  Category,
  CheckoutQuote,
  DeliverySlot,
  DosageForm,
  HealthSnapshot,
  InventoryLedgerEntry,
  NotificationItem,
  NotificationPreference,
  OrderDetail,
  OrderSummary,
  PartnerApplication,
  PartnerApplicationStatus,
  PaymentRefundRecord,
  PaymentWebhookEvent,
  ProductDetail,
  ProductSuggestion,
  ProductSummary,
  SecurityOverview,
  StaffSession,
  SupplierFulfillmentDetail,
  SupplierInventoryItem,
  SupplierListing,
  SupplierOffer,
  SupplierProfile,
  VersionSnapshot,
} from './types';
import type { Principal } from './auth-context';

export const MOCK_HEALTH: HealthSnapshot = {
  status: 'ok',
  service: 'bezzo-api',
  version: '1.0.0',
  environment: 'development (in-memory preview)',
  uptimeSeconds: 3600,
  dependencies: {
    database: { status: 'ok', latencyMs: 1 },
    redis: { status: 'ok' },
    opensearch: { status: 'ok' },
  },
  timestamp: '2025-02-15T12:00:00Z',
};

export const MOCK_VERSION: VersionSnapshot = {
  service: 'bezzo-api',
  version: '1.0.0',
  environment: 'development (in-memory preview)',
  apiBasePath: '/api/v1',
  features: {
    search: true,
    payments: 'mock',
    logistics: 'mock',
  },
};

export const MOCK_ROUTING: ApplicationRouting = {
  whatsappNumber: '+91 90000 00000',
  whatsappNumberRaw: '919000000000',
  whatsappUrl: 'https://wa.me/919000000000',
  channel: 'WHATSAPP',
};

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-1', slug: 'medicines', name: 'Medicines', productCount: 42 },
  { id: 'cat-2', slug: 'prescription-medicines', name: 'Prescription Medicines', productCount: 28 },
  { id: 'cat-3', slug: 'otc-medicines', name: 'Over-the-Counter Medicines', productCount: 14 },
  { id: 'cat-4', slug: 'antibiotics', name: 'Antibiotics', productCount: 12 },
  { id: 'cat-5', slug: 'analgesics', name: 'Analgesics & Pain Relief', productCount: 10 },
  { id: 'cat-6', slug: 'cardiac-care', name: 'Cardiac Care', productCount: 8 },
  { id: 'cat-7', slug: 'diabetes-care', name: 'Diabetes Care', productCount: 9 },
  { id: 'cat-8', slug: 'gastro-care', name: 'Gastrointestinal Care', productCount: 7 },
  { id: 'cat-9', slug: 'respiratory-care', name: 'Respiratory Care', productCount: 6 },
  { id: 'cat-10', slug: 'vitamins-supplements', name: 'Vitamins & Supplements', productCount: 15 },
  { id: 'cat-11', slug: 'medical-devices', name: 'Medical Devices & Consumables', productCount: 11 },
  { id: 'cat-12', slug: 'ayurveda', name: 'Ayurveda & Herbal', productCount: 5 },
];

export const MOCK_DOSAGE_FORMS: DosageForm[] = [
  { id: 'df-1', code: 'TABLET', name: 'Tablet' },
  { id: 'df-2', code: 'CAPSULE', name: 'Capsule' },
  { id: 'df-3', code: 'SYRUP', name: 'Syrup' },
  { id: 'df-4', code: 'INJECTION', name: 'Injection' },
  { id: 'df-5', code: 'DROPS', name: 'Drops' },
];

export const MOCK_DELIVERY_SLOTS: DeliverySlot[] = [
  { id: 'slot-1', name: 'Morning', startTime: '09:00', endTime: '12:00', maxCapacity: 50 },
  { id: 'slot-2', name: 'Afternoon', startTime: '12:00', endTime: '16:00', maxCapacity: 50 },
  { id: 'slot-3', name: 'Evening', startTime: '16:00', endTime: '20:00', maxCapacity: 50 },
];

export interface MockProductData {
  summary: ProductSummary;
  detail: ProductDetail;
}

export const MOCK_PRODUCTS: MockProductData[] = [
  {
    summary: {
      id: 'prod-1',
      name: 'Dolo 650 Tablet',
      genericName: 'Paracetamol',
      brandName: 'Dolo',
      manufacturerName: 'Micro Labs Ltd',
      categoryId: 'cat-5',
      dosageForm: 'Tablet',
      strength: '650mg',
      packSize: '15 Tablets',
      prescriptionClassification: 'OTC',
      supplierCount: 3,
      minPrice: 2850,
      maxPrice: 3100,
      sellableQuantity: 450,
      inStock: true,
    },
    detail: {
      id: 'prod-1',
      name: 'Dolo 650 Tablet',
      slug: 'dolo-650-tablet',
      genericName: 'Paracetamol',
      brandName: 'Dolo',
      compositionSummary: 'Paracetamol IP 650 mg',
      strength: '650mg',
      packSize: '15 Tablets',
      packUnit: 'Strip',
      prescriptionClassification: 'OTC',
      storageRequirements: 'Store below 25°C in a dry place away from sunlight',
      description: 'Widely prescribed antipyretic and analgesic for fever, headache, body ache and mild to moderate pain.',
      category: { id: 'cat-5', name: 'Analgesics & Pain Relief' },
      manufacturerName: 'Micro Labs Ltd',
      dosageForm: 'Tablet',
      restricted: false,
      updatedAt: '2025-02-15T10:00:00Z',
      offers: [
        {
          listingId: 'list-1-1',
          supplierId: 'sup-1',
          supplierName: 'ABC Pharma Wholesaler',
          supplierCity: 'Varanasi',
          sellingPrice: 2850,
          mrpReference: 3360,
          taxRate: 12,
          minimumOrderQuantity: 10,
          leadTimeMinutes: 60,
          sellableQuantity: 200,
          batchNumber: 'DL24A102',
          expiryDate: '2026-12-31',
        },
        {
          listingId: 'list-1-2',
          supplierId: 'sup-2',
          supplierName: 'XYZ Distributors',
          supplierCity: 'Varanasi',
          sellingPrice: 2900,
          mrpReference: 3360,
          taxRate: 12,
          minimumOrderQuantity: 5,
          leadTimeMinutes: 90,
          sellableQuantity: 150,
          batchNumber: 'DL24C088',
          expiryDate: '2026-11-30',
        },
      ],
    },
  },
  {
    summary: {
      id: 'prod-2',
      name: 'Augmentin 625 Duo Tablet',
      genericName: 'Amoxicillin + Potassium Clavulanate',
      brandName: 'Augmentin',
      manufacturerName: 'GlaxoSmithKline Pharmaceuticals Ltd',
      categoryId: 'cat-4',
      dosageForm: 'Tablet',
      strength: '500mg + 125mg',
      packSize: '10 Tablets',
      prescriptionClassification: 'SCHEDULE_H',
      supplierCount: 2,
      minPrice: 16800,
      maxPrice: 17200,
      sellableQuantity: 180,
      inStock: true,
    },
    detail: {
      id: 'prod-2',
      name: 'Augmentin 625 Duo Tablet',
      slug: 'augmentin-625-duo-tablet',
      genericName: 'Amoxicillin + Potassium Clavulanate',
      brandName: 'Augmentin',
      compositionSummary: 'Amoxicillin Trihydrate IP eq. to Amoxicillin 500 mg, Potassium Clavulanate Diluted IP eq. to Clavulanic Acid 125 mg',
      strength: '500mg + 125mg',
      packSize: '10 Tablets',
      packUnit: 'Strip',
      prescriptionClassification: 'SCHEDULE_H',
      storageRequirements: 'Store protected from moisture at temperature not exceeding 25°C',
      description: 'Broad-spectrum antibiotic combining amoxicillin and clavulanate potassium for bacterial respiratory, urinary, and skin infections.',
      category: { id: 'cat-4', name: 'Antibiotics' },
      manufacturerName: 'GlaxoSmithKline Pharmaceuticals Ltd',
      dosageForm: 'Tablet',
      restricted: true,
      updatedAt: '2025-02-14T08:30:00Z',
      offers: [
        {
          listingId: 'list-2-1',
          supplierId: 'sup-1',
          supplierName: 'ABC Pharma Wholesaler',
          supplierCity: 'Varanasi',
          sellingPrice: 16800,
          mrpReference: 20450,
          taxRate: 12,
          minimumOrderQuantity: 5,
          leadTimeMinutes: 60,
          sellableQuantity: 100,
          batchNumber: 'AG24H019',
          expiryDate: '2026-09-30',
        },
      ],
    },
  },
  {
    summary: {
      id: 'prod-3',
      name: 'Glycomet 500 SR Tablet',
      genericName: 'Metformin Hydrochloride',
      brandName: 'Glycomet',
      manufacturerName: 'USV Ltd',
      categoryId: 'cat-7',
      dosageForm: 'Tablet',
      strength: '500mg',
      packSize: '20 Tablets',
      prescriptionClassification: 'SCHEDULE_H',
      supplierCount: 2,
      minPrice: 3800,
      maxPrice: 4100,
      sellableQuantity: 320,
      inStock: true,
    },
    detail: {
      id: 'prod-3',
      name: 'Glycomet 500 SR Tablet',
      slug: 'glycomet-500-sr-tablet',
      genericName: 'Metformin Hydrochloride',
      brandName: 'Glycomet',
      compositionSummary: 'Metformin Hydrochloride IP 500 mg in sustained release form',
      strength: '500mg',
      packSize: '20 Tablets',
      packUnit: 'Strip',
      prescriptionClassification: 'SCHEDULE_H',
      storageRequirements: 'Store in a cool and dry place',
      description: 'Oral anti-diabetic biguanide medication for glycemic control in patients with type 2 diabetes mellitus.',
      category: { id: 'cat-7', name: 'Diabetes Care' },
      manufacturerName: 'USV Ltd',
      dosageForm: 'Tablet',
      restricted: true,
      updatedAt: '2025-02-10T12:00:00Z',
      offers: [
        {
          listingId: 'list-3-1',
          supplierId: 'sup-1',
          supplierName: 'ABC Pharma Wholesaler',
          supplierCity: 'Varanasi',
          sellingPrice: 3800,
          mrpReference: 4620,
          taxRate: 12,
          minimumOrderQuantity: 10,
          leadTimeMinutes: 60,
          sellableQuantity: 200,
          batchNumber: 'GM24K09',
          expiryDate: '2027-03-31',
        },
      ],
    },
  },
  {
    summary: {
      id: 'prod-4',
      name: 'Pan 40 Tablet',
      genericName: 'Pantoprazole Sodium',
      brandName: 'Pan',
      manufacturerName: 'Alkem Laboratories Ltd',
      categoryId: 'cat-8',
      dosageForm: 'Tablet',
      strength: '40mg',
      packSize: '15 Tablets',
      prescriptionClassification: 'SCHEDULE_H',
      supplierCount: 3,
      minPrice: 11500,
      maxPrice: 12200,
      sellableQuantity: 260,
      inStock: true,
    },
    detail: {
      id: 'prod-4',
      name: 'Pan 40 Tablet',
      slug: 'pan-40-tablet',
      genericName: 'Pantoprazole Sodium',
      brandName: 'Pan',
      compositionSummary: 'Pantoprazole Sodium Gastro-resistant IP eq. to Pantoprazole 40 mg',
      strength: '40mg',
      packSize: '15 Tablets',
      packUnit: 'Strip',
      prescriptionClassification: 'SCHEDULE_H',
      storageRequirements: 'Store protected from light and moisture at a temperature below 25°C',
      description: 'Proton pump inhibitor that decreases the amount of acid produced in the stomach, treating acid reflux and peptic ulcers.',
      category: { id: 'cat-8', name: 'Gastrointestinal Care' },
      manufacturerName: 'Alkem Laboratories Ltd',
      dosageForm: 'Tablet',
      restricted: true,
      updatedAt: '2025-02-12T14:15:00Z',
      offers: [
        {
          listingId: 'list-4-1',
          supplierId: 'sup-1',
          supplierName: 'ABC Pharma Wholesaler',
          supplierCity: 'Varanasi',
          sellingPrice: 11500,
          mrpReference: 15300,
          taxRate: 12,
          minimumOrderQuantity: 10,
          leadTimeMinutes: 60,
          sellableQuantity: 140,
          batchNumber: 'PN24L11',
          expiryDate: '2026-11-30',
        },
      ],
    },
  },
];

/* Additional preview fixtures: a fuller catalogue so the marketplace surfaces
   (rails, category browse, search suggestions, supplier comparison) have real
   variety to show. Shaped exactly like the API's summaries and details. */
const EXTRA_MOCK_PRODUCTS: MockProductData[] = [
  mkProduct({
    id: 'prod-5', name: 'Pan 40 Tablet', genericName: 'Pantoprazole', brandName: 'Pan',
    manufacturerName: 'Alkem Laboratories', categoryId: 'cat-8', dosageForm: 'Tablet', strength: '40mg',
    packSize: '15 Tablets', prescriptionClassification: 'PRESCRIPTION_REQUIRED',
    composition: 'Pantoprazole Sodium IP 40 mg', storage: 'Store below 30°C, protect from moisture',
    description: 'Proton pump inhibitor for gastro-oesophageal reflux and hyperacidity.',
    restricted: false, offers: [
      offer('list-5-1', 'sup-1', 'ABC Pharma Wholesaler', 'Varanasi', 11800, 13100, 12, 10, 45, 320, 'PN23F441', '2027-03-31'),
      offer('list-5-2', 'sup-2', 'XYZ Distributors', 'Varanasi', 12150, 13100, 12, 5, 75, 180, 'PN23G118', '2026-12-31'),
    ],
  }),
  mkProduct({
    id: 'prod-6', name: 'Telma 40 Tablet', genericName: 'Telmisartan', brandName: 'Telma',
    manufacturerName: 'Glenmark Pharmaceuticals', categoryId: 'cat-6', dosageForm: 'Tablet', strength: '40mg',
    packSize: '15 Tablets', prescriptionClassification: 'PRESCRIPTION_REQUIRED',
    composition: 'Telmisartan IP 40 mg', storage: 'Store below 25°C in a dry place',
    description: 'Angiotensin II receptor blocker for hypertension.',
    restricted: false, offers: [
      offer('list-6-1', 'sup-1', 'ABC Pharma Wholesaler', 'Varanasi', 9600, 10600, 12, 10, 60, 240, 'TL24A210', '2027-06-30'),
      offer('list-6-2', 'sup-3', 'MedLink Supplies', 'Prayagraj', 9950, 10600, 12, 10, 120, 90, 'TL24B090', '2026-10-31'),
    ],
  }),
  mkProduct({
    id: 'prod-7', name: 'Glycomet GP 2 Tablet', genericName: 'Metformin + Glimepiride', brandName: 'Glycomet',
    manufacturerName: 'USV Pvt Ltd', categoryId: 'cat-7', dosageForm: 'Tablet', strength: '500mg/2mg',
    packSize: '15 Tablets', prescriptionClassification: 'PRESCRIPTION_REQUIRED',
    composition: 'Metformin Hydrochloride IP 500 mg + Glimepiride IP 2 mg', storage: 'Store below 30°C, protect from light',
    description: 'Fixed-dose combination for type 2 diabetes mellitus.',
    restricted: false, offers: [
      offer('list-7-1', 'sup-2', 'XYZ Distributors', 'Varanasi', 7200, 8100, 12, 10, 90, 260, 'GL24C77', '2027-01-31'),
    ],
  }),
  mkProduct({
    id: 'prod-8', name: 'A to Z NS Tablet', genericName: 'Multivitamin & Minerals', brandName: 'A to Z',
    manufacturerName: 'Alkem Laboratories', categoryId: 'cat-10', dosageForm: 'Tablet', strength: null,
    packSize: '15 Tablets', prescriptionClassification: 'OTC',
    composition: 'Multivitamin and multimineral supplement', storage: 'Store below 25°C in a dry place',
    description: 'Daily nutritional supplement with vitamins, minerals and trace elements.',
    restricted: false, offers: [
      offer('list-8-1', 'sup-1', 'ABC Pharma Wholesaler', 'Varanasi', 5400, 6150, 12, 10, 45, 410, 'AZ24D31', '2027-08-31'),
      offer('list-8-2', 'sup-3', 'MedLink Supplies', 'Prayagraj', 5600, 6150, 12, 5, 60, 150, 'AZ24E15', '2026-09-30'),
    ],
  }),
  mkProduct({
    id: 'prod-9', name: 'Cheston Cold Tablet', genericName: 'Cetirizine + Paracetamol + Phenylephrine', brandName: 'Cheston',
    manufacturerName: 'Cipla Ltd', categoryId: 'cat-9', dosageForm: 'Tablet', strength: null,
    packSize: '10 Tablets', prescriptionClassification: 'OTC',
    composition: 'Cetirizine Dihydrochloride IP 5 mg + Paracetamol IP 500 mg + Phenylephrine Hydrochloride IP 10 mg',
    storage: 'Store below 30°C', description: 'Combination for cold and allergic rhinitis symptoms.',
    restricted: false, offers: [
      offer('list-9-1', 'sup-2', 'XYZ Distributors', 'Varanasi', 3600, 4100, 12, 10, 45, 300, 'CH24F9', '2027-02-28'),
    ],
  }),
  mkProduct({
    id: 'prod-10', name: 'Ascoril LS Syrup', genericName: 'Levosalbutamol + Ambroxol + Guaifenesin', brandName: 'Ascoril',
    manufacturerName: 'Glenmark Pharmaceuticals', categoryId: 'cat-9', dosageForm: 'Syrup', strength: '100ml',
    packSize: '1 Bottle', prescriptionClassification: 'PRESCRIPTION_REQUIRED',
    composition: 'Levosalbutamol + Ambroxol + Guaifenesin syrup', storage: 'Store below 30°C, protect from light',
    description: 'Expectorant cough syrup for productive cough.',
    restricted: false, offers: [
      offer('list-10-1', 'sup-1', 'ABC Pharma Wholesaler', 'Varanasi', 8900, 9900, 12, 5, 60, 120, 'AS24G2', '2026-08-31'),
      offer('list-10-2', 'sup-3', 'MedLink Supplies', 'Prayagraj', 9200, 9900, 12, 5, 45, 80, 'AS24H8', '2026-07-31'),
    ],
  }),
  mkProduct({
    id: 'prod-11', name: 'Monocef 1gm Injection', genericName: 'Ceftriaxone', brandName: 'Monocef',
    manufacturerName: 'Aristo Pharmaceuticals', categoryId: 'cat-4', dosageForm: 'Injection', strength: '1gm',
    packSize: '1 Vial', prescriptionClassification: 'PRESCRIPTION_REQUIRED',
    composition: 'Ceftriaxone Sodium IP equivalent to Ceftriaxone 1 gm', storage: 'Store below 25°C; reconstituted solution to be used immediately',
    description: 'Third-generation cephalosporin for serious bacterial infections.',
    restricted: false, offers: [
      offer('list-11-1', 'sup-2', 'XYZ Distributors', 'Varanasi', 4700, 5300, 12, 5, 30, 200, 'MN24I6', '2027-05-31'),
    ],
  }),
  mkProduct({
    id: 'prod-12', name: 'Human Mixtard 30/70 Injection', genericName: 'Insulin Human (Isophane)', brandName: 'Mixtard',
    manufacturerName: 'Novo Nordisk', categoryId: 'cat-7', dosageForm: 'Injection', strength: '100 IU/ml',
    packSize: '1 Cartridge', prescriptionClassification: 'PRESCRIPTION_REQUIRED',
    composition: 'Insulin human (isophane) 100 IU/ml suspension for injection', storage: 'Store at 2°C–8°C; do not freeze',
    description: 'Pre-mixed human insulin for diabetes management.',
    restricted: false, offers: [
      offer('list-12-1', 'sup-3', 'MedLink Supplies', 'Prayagraj', 17800, 19000, 5, 2, 45, 60, 'MX24J1', '2026-11-30'),
    ],
  }),
  mkProduct({
    id: 'prod-13', name: 'Moov Pain Relief Cream', genericName: 'Diclofenac + Menthol + Methyl Salicylate', brandName: 'Moov',
    manufacturerName: 'Reckitt', categoryId: 'cat-5', dosageForm: 'Cream', strength: '30g',
    packSize: '1 Tube', prescriptionClassification: 'OTC',
    composition: 'Topical analgesic cream', storage: 'Store below 30°C',
    description: 'Topical pain relief for muscle and joint pain.',
    restricted: false, offers: [
      offer('list-13-1', 'sup-1', 'ABC Pharma Wholesaler', 'Varanasi', 6900, 7600, 18, 10, 45, 350, 'MV24K4', '2027-04-30'),
    ],
  }),
  mkProduct({
    id: 'prod-14', name: 'Zincovit Tablet', genericName: 'Multivitamin + Zinc', brandName: 'Zincovit',
    manufacturerName: 'Apex Laboratories', categoryId: 'cat-10', dosageForm: 'Tablet', strength: null,
    packSize: '15 Tablets', prescriptionClassification: 'OTC',
    composition: 'Multivitamin, multimineral and zinc supplement', storage: 'Store below 25°C',
    description: 'Zinc-based nutritional supplement for daily immunity support.',
    restricted: false, offers: [
      offer('list-14-1', 'sup-2', 'XYZ Distributors', 'Varanasi', 4200, 4800, 12, 10, 60, 500, 'ZN24L7', '2027-09-30'),
      offer('list-14-2', 'sup-1', 'ABC Pharma Wholesaler', 'Varanasi', 4350, 4800, 12, 10, 45, 220, 'ZN24M3', '2026-12-31'),
    ],
  }),
  mkProduct({
    id: 'prod-15', name: 'Accu-Chek Active Strips', genericName: 'Glucose Test Strips', brandName: 'Accu-Chek',
    manufacturerName: 'Roche Diabetes Care', categoryId: 'cat-11', dosageForm: 'Device', strength: null,
    packSize: '50 Strips', prescriptionClassification: 'OTC',
    composition: 'Glucose oxidase based test strips for blood glucose monitoring',
    storage: 'Store at 2°C–32°C in original container',
    description: 'Blood glucose test strips for use with Accu-Chek Active meter.',
    restricted: false, offers: [
      offer('list-15-1', 'sup-3', 'MedLink Supplies', 'Prayagraj', 11400, 12500, 12, 2, 90, 85, 'AC24N5', '2027-01-31'),
    ],
  }),
  mkProduct({
    id: 'prod-16', name: 'Digene Gel Mint Flavour', genericName: 'Antacid Suspension', brandName: 'Digene',
    manufacturerName: 'Abbott India', categoryId: 'cat-8', dosageForm: 'Syrup', strength: '200ml',
    packSize: '1 Bottle', prescriptionClassification: 'OTC',
    composition: 'Magaldrate + Simethicone antacid gel', storage: 'Store below 30°C; do not freeze',
    description: 'Antacid gel for heartburn and acidity relief.',
    restricted: false, offers: [
      offer('list-16-1', 'sup-1', 'ABC Pharma Wholesaler', 'Varanasi', 8200, 9000, 12, 5, 45, 260, 'DG24O9', '2027-07-31'),
    ],
  }),
  mkProduct({
    id: 'prod-17', name: 'Cifran CT Tablet', genericName: 'Ciprofloxacin + Tinidazole', brandName: 'Cifran',
    manufacturerName: 'Sun Pharmaceutical', categoryId: 'cat-4', dosageForm: 'Tablet', strength: '500mg/600mg',
    packSize: '10 Tablets', prescriptionClassification: 'PRESCRIPTION_REQUIRED',
    composition: 'Ciprofloxacin IP 500 mg + Tinidazole IP 600 mg', storage: 'Store below 30°C, protected from light',
    description: 'Antibacterial combination for mixed infections.',
    restricted: false, offers: [
      offer('list-17-1', 'sup-2', 'XYZ Distributors', 'Varanasi', 6800, 7500, 12, 10, 60, 140, 'CF24P2', '2026-10-31'),
    ],
  }),
  mkProduct({
    id: 'prod-18', name: 'Betadine Gargle', genericName: 'Povidone Iodine', brandName: 'Betadine',
    manufacturerName: 'Win-Medicare', categoryId: 'cat-12', dosageForm: 'Drops', strength: '2% w/v',
    packSize: '100ml', prescriptionClassification: 'OTC',
    composition: 'Povidone Iodine 2% w/v gargle and mouthwash', storage: 'Store below 25°C',
    description: 'Antiseptic gargle for throat infections.',
    restricted: false, offers: [
      offer('list-18-1', 'sup-3', 'MedLink Supplies', 'Prayagraj', 5100, 5700, 12, 5, 75, 190, 'BD24Q6', '2027-03-31'),
    ],
  }),
  mkProduct({
    id: 'prod-19', name: 'Dettol Antiseptic Liquid', genericName: 'Chloroxylenol', brandName: 'Dettol',
    manufacturerName: 'Reckitt', categoryId: 'cat-11', dosageForm: 'Syrup', strength: null,
    packSize: '550ml', prescriptionClassification: 'OTC',
    composition: 'Chloroxylenol IP 4.8% w/v antiseptic liquid', storage: 'Store in a cool place away from sunlight',
    description: 'Household antiseptic for first aid and hygiene.',
    restricted: false, offers: [
      offer('list-19-1', 'sup-1', 'ABC Pharma Wholesaler', 'Varanasi', 9900, 10800, 18, 5, 45, 400, 'DT24R8', '2028-01-31'),
    ],
  }),
  mkProduct({
    id: 'prod-20', name: 'Sinarest Tablet', genericName: 'Paracetamol + Phenylephrine + CPM', brandName: 'Sinarest',
    manufacturerName: 'Centaur Pharmaceuticals', categoryId: 'cat-9', dosageForm: 'Tablet', strength: null,
    packSize: '10 Tablets', prescriptionClassification: 'OTC',
    composition: 'Paracetamol 500 mg + Phenylephrine 5 mg + Chlorpheniramine 2 mg',
    storage: 'Store below 30°C', description: 'Cold and sinus congestion relief.',
    restricted: false, offers: [
      offer('list-20-1', 'sup-2', 'XYZ Distributors', 'Varanasi', 3100, 3500, 12, 10, 45, 280, 'SN24S1', '2027-02-28'),
    ],
  }),
];

/* Fixture helpers — the same shape the API returns, built compactly. */
function offer(
  listingId: string, supplierId: string, supplierName: string, supplierCity: string,
  sellingPrice: number, mrpReference: number, taxRate: number, minimumOrderQuantity: number,
  leadTimeMinutes: number, sellableQuantity: number, batchNumber: string, expiryDate: string,
): SupplierOffer {
  return {
    listingId, supplierId, supplierName, supplierCity, sellingPrice, mrpReference, taxRate,
    minimumOrderQuantity, leadTimeMinutes, sellableQuantity, batchNumber, expiryDate,
  };
}

function mkProduct(input: {
  id: string; name: string; genericName: string; brandName: string; manufacturerName: string;
  categoryId: string; dosageForm: string; strength: string | null; packSize: string;
  prescriptionClassification: string; composition: string; storage: string; description: string;
  restricted: boolean; offers: SupplierOffer[];
}): MockProductData {
  const summary: ProductSummary = {
    id: input.id, name: input.name, genericName: input.genericName, brandName: input.brandName,
    manufacturerName: input.manufacturerName, categoryId: input.categoryId,
    dosageForm: input.dosageForm, strength: input.strength, packSize: input.packSize,
    prescriptionClassification: input.prescriptionClassification,
    supplierCount: input.offers.length,
    minPrice: Math.min(...input.offers.map((o) => o.sellingPrice)),
    maxPrice: Math.max(...input.offers.map((o) => o.sellingPrice)),
    sellableQuantity: input.offers.reduce((total, o) => total + o.sellableQuantity, 0),
    inStock: input.offers.some((o) => o.sellableQuantity > 0),
  };
  const detail: ProductDetail = {
    id: input.id, name: input.name,
    slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    genericName: input.genericName, brandName: input.brandName,
    compositionSummary: input.composition, strength: input.strength, packSize: input.packSize,
    packUnit: 'Pack', prescriptionClassification: input.prescriptionClassification,
    storageRequirements: input.storage, description: input.description,
    category: { id: input.categoryId, name: categoryName(input.categoryId) },
    manufacturerName: input.manufacturerName, dosageForm: input.dosageForm,
    restricted: input.restricted, offers: input.offers,
    updatedAt: '2025-02-15T09:00:00Z',
  };
  return { summary, detail };
}

function categoryName(categoryId: string): string {
  return MOCK_CATEGORIES.find((category) => category.id === categoryId)?.name ?? 'Catalogue';
}

MOCK_PRODUCTS.push(...EXTRA_MOCK_PRODUCTS);

/* Preview housekeeping: recount each category from the fixture catalogue and
   drop categories with no products, so the visual category surfaces mirror a
   live catalogue rather than promising empty shelves. */
(function pruneEmptyCategories() {
  for (let index = MOCK_CATEGORIES.length - 1; index >= 0; index -= 1) {
    const category = MOCK_CATEGORIES[index]!;
    const count = MOCK_PRODUCTS.filter((product) => product.summary.categoryId === category.id).length;
    if (count === 0) {
      MOCK_CATEGORIES.splice(index, 1);
    } else {
      category.productCount = count;
    }
  }
})();


export const MOCK_USERS: Record<string, { password: string; principal: Principal }> = {
  'admin@bezzo.local': {
    password: 'Bezzo@12345',
    principal: {
      id: 'user-admin',
      sessionId: 'sess-admin',
      email: 'admin@bezzo.local',
      phone: '+919000000001',
      displayName: 'Bezzo Admin',
      status: 'ACTIVE',
      emailVerified: true,
      phoneVerified: true,
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permissions: [
        'admin.user.read',
        'admin.user.write',
        'admin.supplier.read',
        'admin.supplier.write',
        'admin.order.read',
        'admin.order.write',
        'admin.payment.read',
        'admin.payment.review',
        'admin.logistics.read',
        'admin.logistics.write',
        'admin.picker.read',
        'admin.picker.manage',
        'admin.dispute.read',
        'admin.dispute.resolve',
        'admin.analytics.read',
        'admin.application.read',
        'admin.application.write',
      ],
      organization: { id: 'org-admin', type: 'PLATFORM', name: 'BEZZO Operations' },
      supplier: null,
      buyer: null,
      picker: null,
      lastLoginAt: '2025-02-15T09:00:00Z',
      createdAt: '2025-01-01T00:00:00Z',
    },
  },
  'ops@bezzo.local': {
    password: 'Bezzo@12345',
    principal: {
      id: 'user-ops',
      sessionId: 'sess-ops',
      email: 'ops@bezzo.local',
      phone: '+919000000002',
      displayName: 'Bezzo Operations',
      status: 'ACTIVE',
      emailVerified: true,
      phoneVerified: true,
      roles: ['OPERATIONS_AGENT'],
      permissions: [
        'admin.user.read',
        'admin.supplier.read',
        'admin.order.read',
        'admin.order.write',
        'admin.logistics.read',
        'admin.logistics.write',
        'admin.picker.read',
        'admin.picker.manage',
        'admin.application.read',
      ],
      organization: { id: 'org-admin', type: 'PLATFORM', name: 'BEZZO Operations' },
      supplier: null,
      buyer: null,
      picker: null,
      lastLoginAt: '2025-02-15T08:30:00Z',
      createdAt: '2025-01-01T00:00:00Z',
    },
  },
  'buyer1@bezzo.local': {
    password: 'Bezzo@12345',
    principal: {
      id: 'user-buyer-1',
      sessionId: 'sess-buyer-1',
      email: 'buyer1@bezzo.local',
      phone: '+919000000021',
      displayName: 'Sunrise Pharmacy Owner',
      status: 'ACTIVE',
      emailVerified: true,
      phoneVerified: true,
      roles: ['BUYER_OWNER', 'BUYER'],
      permissions: [
        'buyer.profile.read',
        'buyer.profile.write',
        'buyer.order.read',
        'buyer.order.write',
      ],
      organization: { id: 'org-buyer-1', type: 'BUYER', name: 'Sunrise Pharmacy' },
      supplier: null,
      buyer: { id: 'buyer-1', status: 'VERIFIED' },
      picker: null,
      lastLoginAt: '2025-02-15T11:00:00Z',
      createdAt: '2025-01-05T00:00:00Z',
    },
  },
  'supplier1@bezzo.local': {
    password: 'Bezzo@12345',
    principal: {
      id: 'user-sup-1',
      sessionId: 'sess-sup-1',
      email: 'supplier1@bezzo.local',
      phone: '+919000000011',
      displayName: 'ABC Pharma Owner',
      status: 'ACTIVE',
      emailVerified: true,
      phoneVerified: true,
      roles: ['SUPPLIER_OWNER', 'SUPPLIER'],
      permissions: [
        'supplier.profile.read',
        'supplier.profile.write',
        'supplier.listing.write',
        'supplier.inventory.write',
        'supplier.fulfillment.write',
        'supplier.settlement.read',
      ],
      organization: { id: 'org-sup-1', type: 'SUPPLIER', name: 'ABC Pharma Wholesalers Pvt Ltd' },
      supplier: { id: 'sup-1', status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      buyer: null,
      picker: null,
      lastLoginAt: '2025-02-15T10:30:00Z',
      createdAt: '2025-01-02T00:00:00Z',
    },
  },
};

export const MOCK_BUYER_PROFILE: BuyerProfile = {
  id: 'buyer-1',
  userId: 'user-buyer-1',
  businessName: 'Sunrise Pharmacy Wholesalers & Retail',
  storeName: 'Sunrise Pharmacy',
  businessType: 'RETAILER',
  gstin: '09AAACB9876D1Z1',
  licenseReference: 'UP-VAR-DL-20B-12345',
  status: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  verifiedAt: '2025-01-07T10:00:00Z',
  creditTermsDays: 15,
  createdAt: '2025-01-05T00:00:00Z',
  updatedAt: '2025-02-01T12:00:00Z',
};

export const MOCK_BUYER_ADDRESSES: BuyerAddress[] = [
  {
    id: 'addr-1',
    label: 'Main Store',
    contactName: 'Ramesh Patel',
    contactPhone: '+919000000021',
    addressLine1: 'Shop No. 4, Sigra Crossing',
    addressLine2: 'Near Bharat Mata Mandir',
    landmark: 'Opposite State Bank',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    postalCode: '221002',
    country: 'India',
    isDefault: true,
    latitude: 25.3176,
    longitude: 82.9739,
    createdAt: '2025-01-05T00:00:00Z',
    updatedAt: '2025-01-05T00:00:00Z',
  },
  {
    id: 'addr-2',
    label: 'Branch Warehouse',
    contactName: 'Sanjay Verma',
    contactPhone: '+919000000021',
    addressLine1: 'Plot 12, Industrial Area, Chandpur',
    addressLine2: 'Godown 3B',
    landmark: 'Near Railway Siding',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    postalCode: '221106',
    country: 'India',
    isDefault: false,
    latitude: 25.325,
    longitude: 82.955,
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2025-01-10T00:00:00Z',
  },
];

export const MOCK_BUYER_DOCUMENTS: BuyerDocument[] = [
  {
    id: 'doc-1',
    documentType: 'DRUG_LICENSE_20B',
    documentNumber: 'UP-VAR-DL-20B-12345',
    status: 'VERIFIED',
    issuedAt: '2024-01-01T00:00:00Z',
    expiresAt: '2028-12-31T00:00:00Z',
    verifiedAt: '2025-01-07T10:00:00Z',
    rejectionReason: null,
    downloadUrl: '/documents/dl_20b.pdf',
    createdAt: '2025-01-05T12:00:00Z',
  },
  {
    id: 'doc-2',
    documentType: 'GST_CERTIFICATE',
    documentNumber: '09AAACB9876D1Z1',
    status: 'VERIFIED',
    issuedAt: '2023-05-01T00:00:00Z',
    expiresAt: null,
    verifiedAt: '2025-01-07T10:05:00Z',
    rejectionReason: null,
    downloadUrl: '/documents/gst_cert.pdf',
    createdAt: '2025-01-05T12:05:00Z',
  },
];

export const MOCK_SUPPLIER_PROFILE: SupplierProfile = {
  id: 'sup-1',
  legalName: 'ABC Pharma Wholesalers Pvt Ltd',
  displayName: 'ABC Pharma Wholesaler',
  businessType: 'WHOLESALER',
  status: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  gstin: '09AAACA1234A1Z5',
  pan: 'AAACA1234A',
  pickupAddress: '12 Sigra Crossing, Sigra, Varanasi',
  locality: 'Sigra',
  city: 'Varanasi',
  state: 'Uttar Pradesh',
  postalCode: '221002',
  latitude: 25.318,
  longitude: 82.974,
  contactPhone: '+919000000011',
  contactEmail: 'supplier1@bezzo.local',
  operatingHours: { monday: '09:00 - 19:00', tuesday: '09:00 - 19:00' },
  verifiedAt: '2025-01-03T10:00:00Z',
  rejectionReason: null,
  createdAt: '2025-01-02T00:00:00Z',
  stats: { listings: 142, activeListings: 138, lowStockItems: 1 },
};

export const MOCK_STAFF_SESSIONS: StaffSession[] = [
  {
    id: 'sess-current',
    deviceName: 'MacBook Pro',
    deviceType: 'DESKTOP',
    ipAddress: '127.0.0.1',
    authenticationMethod: 'PASSWORD',
    createdAt: '2025-02-15T09:00:00Z',
    lastSeenAt: '2025-02-15T11:45:00Z',
    expiresAt: '2025-02-22T09:00:00Z',
    current: true,
  },
];

export const MOCK_SECURITY_OVERVIEW: SecurityOverview = {
  lockedUntil: null,
  passwordUpdatedAt: '2025-01-10T00:00:00Z',
  recentEvents: [
    {
      eventType: 'USER_LOGIN',
      success: true,
      reason: null,
      identifier: 'buyer1@bezzo.local',
      ipAddress: '127.0.0.1',
      createdAt: '2025-02-15T09:00:00Z',
    },
    {
      eventType: 'TOKEN_REFRESH',
      success: true,
      reason: null,
      identifier: 'buyer1@bezzo.local',
      ipAddress: '127.0.0.1',
      createdAt: '2025-02-15T10:00:00Z',
    },
  ],
};

const INITIAL_CART_ITEMS: CartLine[] = [
  {
    id: 'line-1',
    supplierProductId: 'list-1-1',
    productId: 'prod-1',
    productName: 'Dolo 650 Tablet',
    manufacturerName: 'Micro Labs Ltd',
    strength: '650mg',
    packSize: '15 Tablets',
    prescriptionClassification: 'OTC',
    supplierId: 'sup-1',
    supplierName: 'ABC Pharma Wholesaler',
    supplierCity: 'Varanasi',
    quantity: 10,
    minimumOrderQuantity: 10,
    sellableQuantity: 200,
    unitPrice: 2850,
    mrpReference: 3360,
    taxRate: 12,
    lineSubtotal: 28500,
    lineTax: 3420,
    lineTotal: 31920,
    leadTimeMinutes: 60,
    batchNumber: 'DL24A102',
    expiryDate: '2026-12-31',
    available: true,
    issues: [],
    addedAt: '2025-02-15T10:00:00Z',
    updatedAt: '2025-02-15T10:00:00Z',
  },
];

class MockStore {
  cart: Cart = {
    cartId: 'cart-1',
    status: 'ACTIVE',
    currency: 'INR',
    itemCount: 1,
    unitCount: 10,
    supplierCount: 1,
    estimatedSubtotal: 28500,
    estimatedTax: 3420,
    estimatedTotal: 31920,
    hasIssues: false,
    issues: [],
    items: [...INITIAL_CART_ITEMS],
    updatedAt: '2025-02-15T10:00:00Z',
  };

  orders: OrderDetail[] = [
    {
      id: 'ord-1001',
      orderNumber: 'BZO-202502-0042',
      status: 'PROCESSING',
      paymentStatus: 'CAPTURED',
      currency: 'INR',
      subtotal: 75300,
      discountTotal: 0,
      taxTotal: 9036,
      deliveryFee: 15000,
      grandTotal: 99336,
      deliveryMode: 'SCHEDULED',
      deliveryDate: '2025-02-16',
      shippingAddress: {
        id: 'addr-1',
        label: 'Main Store',
        contactName: 'Ramesh Patel',
        contactPhone: '+919000000021',
        addressLine1: 'Shop No. 4, Sigra Crossing',
        addressLine2: 'Near Bharat Mata Mandir',
        landmark: 'Opposite State Bank',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        postalCode: '221002',
        country: 'India',
      },
      buyerNote: 'Please deliver during store operating hours',
      placedAt: '2025-02-15T09:30:00Z',
      confirmedAt: '2025-02-15T09:35:00Z',
      cancelledAt: null,
      completedAt: null,
      createdAt: '2025-02-15T09:30:00Z',
      checkoutSessionId: 'sess-checkout-1',
      itemCount: 1,
      supplierCount: 1,
      activeReservations: 1,
      reservationCount: 1,
      timeline: [
        {
          fromStatus: null,
          toStatus: 'CONFIRMED',
          reason: 'Order placed by retailer',
          actorType: 'BUYER',
          createdAt: '2025-02-15T09:30:00Z',
        },
      ],
      fulfillments: [
        {
          id: 'ful-1',
          fulfillmentReference: 'FUL-202502-0042-1',
          supplierId: 'sup-1',
          supplierName: 'ABC Pharma Wholesaler',
          status: 'ACCEPTED',
          subtotal: 75300,
          taxTotal: 9036,
          deliveryAllocation: 15000,
          total: 99336,
          packageCount: 1,
          itemCount: 1,
          unitCount: 20,
          acceptedAt: '2025-02-15T09:40:00Z',
          packedAt: null,
          readyAt: null,
          collectedAt: null,
          deliveredAt: null,
          cancelledAt: null,
        },
      ],
      items: [
        {
          id: 'oi-1',
          productId: 'prod-1',
          supplierProductId: 'list-1-1',
          supplierId: 'sup-1',
          supplierName: 'ABC Pharma Wholesaler',
          productName: 'Dolo 650 Tablet',
          manufacturerName: 'Micro Labs Ltd',
          composition: 'Paracetamol IP 650 mg',
          packSize: '15 Tablets',
          unitPrice: 2850,
          mrpReference: 3360,
          taxRate: 12,
          quantity: 20,
          discountAmount: 0,
          taxAmount: 6840,
          lineTotal: 63840,
          status: 'ACCEPTED',
        },
      ],
      payment: {
        id: 'pay-1',
        gateway: 'MANUAL',
        status: 'CAPTURED',
        amount: 99336,
        currency: 'INR',
        method: 'COD',
        providerReference: 'COD-CONFIRMED',
        providerOrderReference: null,
        failureCode: null,
        failureMessage: null,
        paidAt: null,
        refundedAmount: 0,
      },
    },
  ];

  partnerApplications: PartnerApplication[] = [
    {
      id: 'app-1',
      reference: 'APP-2025-001',
      businessName: 'Gupta Medical Hall',
      applicantName: 'Vikram Gupta',
      contactPhone: '+919876543210',
      contactEmail: 'vikram@guptamedical.in',
      applicationType: 'RETAILER',
      status: 'IN_REVIEW',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      postalCode: '221001',
      gstin: '09ABCDE1234F1Z5',
      licenceReference: 'UP-VAR-DL-2024-0091',
      yearsInBusiness: 5,
      monthlyVolume: '5L-10L',
      message: 'Submitted verification documents via portal',
      routedToNumber: '+919000000000',
      routedToDisplay: '+91 90000 00000',
      whatsappUrl: 'https://wa.me/919000000000',
      deliveryChannel: 'WHATSAPP',
      source: 'WEB',
      reviewNotes: 'Documents in order, awaiting inspection',
      reviewedAt: null,
      createdAt: '2025-02-14T11:00:00Z',
      updatedAt: '2025-02-14T11:00:00Z',
    },
    {
      id: 'app-2',
      reference: 'APP-2025-002',
      businessName: 'Apex Pharmaceuticals & Distribution',
      applicantName: 'Sunil Agarwal',
      contactPhone: '+919876543211',
      contactEmail: 'sunil@apexpharma.in',
      applicationType: 'SUPPLIER',
      status: 'APPROVED',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      postalCode: '221002',
      gstin: '09XYZAB9876C1Z3',
      licenceReference: 'UP-VAR-WDL-2024-0018',
      yearsInBusiness: 12,
      monthlyVolume: '25L+',
      message: 'Wholesale distributor in Sigra',
      routedToNumber: '+919000000000',
      routedToDisplay: '+91 90000 00000',
      whatsappUrl: 'https://wa.me/919000000000',
      deliveryChannel: 'WHATSAPP',
      source: 'WEB',
      reviewNotes: 'Wholesale license verified against state FDA register',
      reviewedAt: '2025-02-13T10:00:00Z',
      createdAt: '2025-02-12T09:30:00Z',
      updatedAt: '2025-02-13T10:00:00Z',
    },
  ];

  payments: AdminPaymentRow[] = [
    {
      id: 'pay-1',
      orderId: 'ord-1001',
      orderNumber: 'BZO-202502-0042',
      orderStatus: 'PROCESSING',
      buyerId: 'buyer-1',
      buyerName: 'Sunrise Pharmacy',
      gateway: 'MANUAL',
      providerReference: 'COD-CONFIRMED',
      method: 'COD',
      status: 'CAPTURED',
      amount: 99336,
      refundedAmount: 0,
      refundableAmount: 99336,
      currency: 'INR',
      failureCode: null,
      failureMessage: null,
      lastReconciledAt: null,
      paidAt: null,
      createdAt: '2025-02-15T09:30:00Z',
    },
    {
      id: 'pay-2',
      orderId: 'ord-1000',
      orderNumber: 'BZO-202502-0038',
      orderStatus: 'FULFILLED',
      buyerId: 'buyer-1',
      buyerName: 'Sunrise Pharmacy',
      gateway: 'RAZORPAY',
      providerReference: 'razorpay_pay_Nop9283471',
      method: 'UPI',
      status: 'CAPTURED',
      amount: 62040,
      refundedAmount: 0,
      refundableAmount: 62040,
      currency: 'INR',
      failureCode: null,
      failureMessage: null,
      lastReconciledAt: '2025-02-12T17:00:00Z',
      paidAt: '2025-02-11T14:02:00Z',
      createdAt: '2025-02-11T14:00:00Z',
    },
  ];

  recalculateCart() {
    let unitCount = 0;
    let subtotal = 0;
    let tax = 0;
    const suppliers = new Set<string>();

    for (const line of this.cart.items) {
      line.lineSubtotal = line.unitPrice * line.quantity;
      line.lineTax = Math.round((line.lineSubtotal * (line.taxRate ?? 12)) / 100);
      line.lineTotal = line.lineSubtotal + line.lineTax;
      unitCount += line.quantity;
      subtotal += line.lineSubtotal;
      tax += line.lineTax;
      if (line.supplierId) suppliers.add(line.supplierId);
    }

    this.cart.itemCount = this.cart.items.length;
    this.cart.unitCount = unitCount;
    this.cart.supplierCount = suppliers.size;
    this.cart.estimatedSubtotal = subtotal;
    this.cart.estimatedTax = tax;
    this.cart.estimatedTotal = subtotal + tax;
    this.cart.updatedAt = new Date().toISOString();
  }
}

export const mockStore = new MockStore();

/* Preview-only supplier fulfilment queue, shaped exactly like the API's rows.
 *
 * These are full `SupplierFulfillmentDetail` records so the detail screen renders its items,
 * packages, timeline and pickup task, and so the accept → pack → ready / reject actions can
 * run a real (if miniature) state machine against the in-memory store. */
export const MOCK_SUPPLIER_FULFILLMENTS: SupplierFulfillmentDetail[] = [
  {
    id: 'ful-mock-1',
    orderId: 'ord-mock-1',
    orderNumber: 'BZO-20250215-1042',
    fulfillmentReference: 'BZO-20250215-1042-F1',
    status: 'CREATED',
    subtotal: 4200,
    taxTotal: 504,
    deliveryAllocation: 150,
    total: 4854,
    packageCount: 0,
    itemCount: 4,
    buyerTradeName: 'Sunrise Pharmacy',
    deliveryLocality: 'Andheri West',
    deliveryCity: 'Mumbai',
    deliverySlotName: 'Morning',
    buyer: {
      id: 'buyer-1',
      tradeName: 'Sunrise Pharmacy',
      drugLicenceNumber: 'UP-DL-21B-114520',
      contactPhone: '+919000000021',
    },
    deliveryAddress: {
      addressLine1: 'Shop No. 4, Sigra Crossing',
      addressLine2: 'Near Bharat Mata Mandir',
      locality: 'Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400053',
    },
    items: [
      {
        id: 'ful-mock-1-item-1',
        orderItemId: 'oi-1',
        productId: 'prod-1',
        productName: 'Dolo 650 Tablet',
        dosageForm: 'Tablet',
        packSize: '15 Tablets',
        sku: 'DOLO-650-15T',
        batchNumber: 'DL24A102',
        expiryDate: '2026-12-31',
        unitPrice: 2850,
        quantity: 2,
        lineTotal: 5700,
        status: 'PENDING',
        shortPickedQuantity: 0,
      },
      {
        id: 'ful-mock-1-item-2',
        orderItemId: 'oi-2',
        productId: 'prod-3',
        productName: 'Cetaphil Gentle Skin Cleanser',
        dosageForm: 'Lotion',
        packSize: '125 ml',
        sku: 'CET-GSC-125',
        batchNumber: 'CT24C077',
        expiryDate: '2027-03-31',
        unitPrice: 2100,
        quantity: 2,
        lineTotal: 4200,
        status: 'PENDING',
        shortPickedQuantity: 0,
      },
    ],
    packages: [],
    timeline: [
      {
        id: 'ful-mock-1-tl-1',
        fromStatus: null,
        toStatus: 'CREATED',
        reason: 'Order routed to supplier',
        actorType: 'SYSTEM',
        createdAt: '2025-02-15T08:12:00Z',
      },
    ],
    pickupTask: null,
    acceptedAt: null,
    packedAt: null,
    readyAt: null,
    collectedAt: null,
    deliveredAt: null,
    createdAt: '2025-02-15T08:12:00Z',
  },
  {
    id: 'ful-mock-2',
    orderId: 'ord-mock-2',
    orderNumber: 'BZO-20250214-0931',
    fulfillmentReference: 'BZO-20250214-0931-F1',
    status: 'ACCEPTED',
    subtotal: 11800,
    taxTotal: 1416,
    deliveryAllocation: 150,
    total: 13366,
    packageCount: 0,
    itemCount: 9,
    buyerTradeName: 'CityCare Meds',
    deliveryLocality: 'Bandra',
    deliveryCity: 'Mumbai',
    deliverySlotName: 'Afternoon',
    buyer: {
      id: 'buyer-2',
      tradeName: 'CityCare Meds',
      drugLicenceNumber: 'MH-DL-21B-220184',
      contactPhone: '+919000000022',
    },
    deliveryAddress: {
      addressLine1: 'Plot 12, Hill Road',
      addressLine2: null,
      locality: 'Bandra',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400050',
    },
    items: [
      {
        id: 'ful-mock-2-item-1',
        orderItemId: 'oi-3',
        productId: 'prod-2',
        productName: 'Augmentin 625 Duo Tablet',
        dosageForm: 'Tablet',
        packSize: '10 Tablets',
        sku: 'AUG-625-10T',
        batchNumber: 'AG24H019',
        expiryDate: '2026-09-30',
        unitPrice: 16800,
        quantity: 5,
        lineTotal: 84000,
        status: 'ACCEPTED',
        shortPickedQuantity: 0,
      },
      {
        id: 'ful-mock-2-item-2',
        orderItemId: 'oi-4',
        productId: 'prod-5',
        productName: 'Pan 40 Tablet',
        dosageForm: 'Tablet',
        packSize: '15 Tablets',
        sku: 'PAN-40-15T',
        batchNumber: 'PN24D044',
        expiryDate: '2026-11-30',
        unitPrice: 6800,
        quantity: 4,
        lineTotal: 27200,
        status: 'ACCEPTED',
        shortPickedQuantity: 0,
      },
    ],
    packages: [],
    timeline: [
      {
        id: 'ful-mock-2-tl-1',
        fromStatus: null,
        toStatus: 'CREATED',
        reason: 'Order routed to supplier',
        actorType: 'SYSTEM',
        createdAt: '2025-02-14T09:31:00Z',
      },
      {
        id: 'ful-mock-2-tl-2',
        fromStatus: 'CREATED',
        toStatus: 'ACCEPTED',
        reason: 'Accepted by supplier',
        actorType: 'SUPPLIER',
        createdAt: '2025-02-14T10:02:00Z',
      },
    ],
    pickupTask: null,
    acceptedAt: '2025-02-14T10:02:00Z',
    packedAt: null,
    readyAt: null,
    collectedAt: null,
    deliveredAt: null,
    createdAt: '2025-02-14T09:31:00Z',
  },
  {
    id: 'ful-mock-3',
    orderId: 'ord-mock-3',
    orderNumber: 'BZO-20250213-0877',
    fulfillmentReference: 'BZO-20250213-0877-F1',
    status: 'READY_FOR_PICKUP',
    subtotal: 6400,
    taxTotal: 768,
    deliveryAllocation: 150,
    total: 7318,
    packageCount: 3,
    itemCount: 6,
    buyerTradeName: 'Wellness Point',
    deliveryLocality: 'Powai',
    deliveryCity: 'Mumbai',
    deliverySlotName: 'Morning',
    buyer: {
      id: 'buyer-3',
      tradeName: 'Wellness Point',
      drugLicenceNumber: 'MH-DL-21B-331902',
      contactPhone: '+919000000023',
    },
    deliveryAddress: {
      addressLine1: 'Unit 7, Hiranandani Gardens',
      addressLine2: null,
      locality: 'Powai',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400076',
    },
    items: [
      {
        id: 'ful-mock-3-item-1',
        orderItemId: 'oi-5',
        productId: 'prod-8',
        productName: 'Shelcal 500 Tablet',
        dosageForm: 'Tablet',
        packSize: '15 Tablets',
        sku: 'SHC-500-15T',
        batchNumber: 'SC24B211',
        expiryDate: '2027-01-31',
        unitPrice: 3200,
        quantity: 6,
        lineTotal: 19200,
        status: 'ACCEPTED',
        shortPickedQuantity: 0,
      },
    ],
    packages: [
      {
        id: 'pkg-mock-3-1',
        packageCode: 'PKG-BZO-20250213-0877-1',
        status: 'PACKED',
        packageType: 'CARTON',
        weightGrams: 2400,
        sealNumber: 'SEAL-88412',
        handlingNotes: 'Fragile — keep upright',
        pickupTaskId: null,
        collectedAt: null,
        createdAt: '2025-02-13T11:20:00Z',
      },
    ],
    timeline: [
      {
        id: 'ful-mock-3-tl-1',
        fromStatus: null,
        toStatus: 'CREATED',
        reason: 'Order routed to supplier',
        actorType: 'SYSTEM',
        createdAt: '2025-02-13T08:40:00Z',
      },
      {
        id: 'ful-mock-3-tl-2',
        fromStatus: 'CREATED',
        toStatus: 'ACCEPTED',
        reason: 'Accepted by supplier',
        actorType: 'SUPPLIER',
        createdAt: '2025-02-13T09:00:00Z',
      },
      {
        id: 'ful-mock-3-tl-3',
        fromStatus: 'ACCEPTED',
        toStatus: 'PACKED',
        reason: '1 package registered',
        actorType: 'SUPPLIER',
        createdAt: '2025-02-13T11:20:00Z',
      },
      {
        id: 'ful-mock-3-tl-4',
        fromStatus: 'PACKED',
        toStatus: 'READY_FOR_PICKUP',
        reason: 'Ready for picker collection',
        actorType: 'SUPPLIER',
        createdAt: '2025-02-13T11:45:00Z',
      },
    ],
    pickupTask: {
      id: 'task-mock-3',
      taskCode: 'PK-88412',
      status: 'DISPATCHED',
      priority: 'NORMAL',
      pickupWindowStart: '2025-02-13T12:00:00Z',
      pickupWindowEnd: '2025-02-13T14:00:00Z',
      assignedPickerName: null,
      assignedPickerPhone: null,
      createdAt: '2025-02-13T11:45:00Z',
    },
    acceptedAt: '2025-02-13T09:00:00Z',
    packedAt: '2025-02-13T11:20:00Z',
    readyAt: '2025-02-13T11:45:00Z',
    collectedAt: null,
    deliveredAt: null,
    createdAt: '2025-02-13T08:40:00Z',
  },
  {
    id: 'ful-mock-4',
    orderId: 'ord-mock-4',
    orderNumber: 'BZO-20250212-0812',
    fulfillmentReference: 'BZO-20250212-0812-F1',
    status: 'DELIVERED',
    subtotal: 9200,
    taxTotal: 1104,
    deliveryAllocation: 150,
    total: 10454,
    packageCount: 4,
    itemCount: 11,
    buyerTradeName: 'Sunrise Pharmacy',
    deliveryLocality: 'Andheri West',
    deliveryCity: 'Mumbai',
    deliverySlotName: 'Morning',
    buyer: {
      id: 'buyer-1',
      tradeName: 'Sunrise Pharmacy',
      drugLicenceNumber: 'UP-DL-21B-114520',
      contactPhone: '+919000000021',
    },
    deliveryAddress: {
      addressLine1: 'Shop No. 4, Sigra Crossing',
      addressLine2: 'Near Bharat Mata Mandir',
      locality: 'Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400053',
    },
    items: [
      {
        id: 'ful-mock-4-item-1',
        orderItemId: 'oi-6',
        productId: 'prod-1',
        productName: 'Dolo 650 Tablet',
        dosageForm: 'Tablet',
        packSize: '15 Tablets',
        sku: 'DOLO-650-15T',
        batchNumber: 'DL24A102',
        expiryDate: '2026-12-31',
        unitPrice: 2850,
        quantity: 11,
        lineTotal: 31350,
        status: 'ACCEPTED',
        shortPickedQuantity: 0,
      },
    ],
    packages: [
      {
        id: 'pkg-mock-4-1',
        packageCode: 'PKG-BZO-20250212-0812-1',
        status: 'COLLECTED',
        packageType: 'CARTON',
        weightGrams: 3100,
        sealNumber: 'SEAL-87903',
        handlingNotes: null,
        pickupTaskId: 'task-mock-4',
        collectedAt: '2025-02-12T12:10:00Z',
        createdAt: '2025-02-12T10:30:00Z',
      },
    ],
    timeline: [
      {
        id: 'ful-mock-4-tl-1',
        fromStatus: null,
        toStatus: 'CREATED',
        reason: 'Order routed to supplier',
        actorType: 'SYSTEM',
        createdAt: '2025-02-12T08:12:00Z',
      },
      {
        id: 'ful-mock-4-tl-2',
        fromStatus: 'CREATED',
        toStatus: 'ACCEPTED',
        reason: 'Accepted by supplier',
        actorType: 'SUPPLIER',
        createdAt: '2025-02-12T08:55:00Z',
      },
      {
        id: 'ful-mock-4-tl-3',
        fromStatus: 'ACCEPTED',
        toStatus: 'PACKED',
        reason: '1 package registered',
        actorType: 'SUPPLIER',
        createdAt: '2025-02-12T10:30:00Z',
      },
      {
        id: 'ful-mock-4-tl-4',
        fromStatus: 'PACKED',
        toStatus: 'READY_FOR_PICKUP',
        reason: 'Ready for picker collection',
        actorType: 'SUPPLIER',
        createdAt: '2025-02-12T11:00:00Z',
      },
      {
        id: 'ful-mock-4-tl-5',
        fromStatus: 'READY_FOR_PICKUP',
        toStatus: 'DELIVERED',
        reason: 'Collected and delivered',
        actorType: 'SYSTEM',
        createdAt: '2025-02-12T15:40:00Z',
      },
    ],
    pickupTask: null,
    acceptedAt: '2025-02-12T08:55:00Z',
    packedAt: '2025-02-12T10:30:00Z',
    readyAt: '2025-02-12T11:00:00Z',
    collectedAt: '2025-02-12T12:10:00Z',
    deliveredAt: '2025-02-12T15:40:00Z',
    createdAt: '2025-02-12T08:12:00Z',
  },
];

/* Preview-only supplier catalogue + stock, mirroring the API's row shapes. */
export const MOCK_SUPPLIER_LISTINGS: SupplierListing[] = [
  {
    id: 'list-1-1',
    productId: 'prod-1',
    productName: 'Dolo 650 Tablet',
    strength: '650mg',
    packSize: '15 Tablets',
    dosageForm: 'Tablet',
    manufacturerName: 'Micro Labs Ltd',
    prescriptionClassification: 'OTC',
    supplierSku: 'DOLO-650-15T',
    status: 'ACTIVE',
    sellingPrice: 2850,
    mrpReference: 3360,
    taxRate: 12,
    minimumOrderQuantity: 10,
    leadTimeMinutes: 60,
    inventoryId: 'inv-dolo-1',
    availableQuantity: 200,
    reservedQuantity: 20,
    sellableQuantity: 180,
    lowStockThreshold: 50,
    inventoryStatus: 'IN_STOCK',
    batchNumber: 'DL24A102',
    expiryDate: '2026-12-31',
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2025-02-15T08:00:00Z',
  },
  {
    id: 'list-2-1',
    productId: 'prod-2',
    productName: 'Augmentin 625 Duo Tablet',
    strength: '500mg + 125mg',
    packSize: '10 Tablets',
    dosageForm: 'Tablet',
    manufacturerName: 'GlaxoSmithKline Pharmaceuticals Ltd',
    prescriptionClassification: 'SCHEDULE_H',
    supplierSku: 'AUG-625-10T',
    status: 'ACTIVE',
    sellingPrice: 16800,
    mrpReference: 20450,
    taxRate: 12,
    minimumOrderQuantity: 5,
    leadTimeMinutes: 60,
    inventoryId: 'inv-aug-1',
    availableQuantity: 100,
    reservedQuantity: 10,
    sellableQuantity: 90,
    lowStockThreshold: 25,
    inventoryStatus: 'IN_STOCK',
    batchNumber: 'AG24H019',
    expiryDate: '2026-09-30',
    createdAt: '2025-01-12T00:00:00Z',
    updatedAt: '2025-02-14T08:00:00Z',
  },
];

export const MOCK_SUPPLIER_INVENTORY: SupplierInventoryItem[] = [
  {
    id: 'inv-1',
    listingId: 'list-1-1',
    productName: 'Dolo 650 Tablet',
    packSize: '15 Tablets',
    sellingPrice: 2850,
    availableQuantity: 20,
    reservedQuantity: 5,
    sellableQuantity: 15,
    damagedQuantity: 0,
    expiredQuantity: 0,
    blockedQuantity: 0,
    lowStockThreshold: 50,
    status: 'LOW_STOCK',
    batchNumber: 'DL24A102',
    expiryDate: '2026-12-31',
    version: 1,
    updatedAt: '2025-02-15T08:00:00Z',
  },
];

export const MOCK_INVENTORY_LEDGER: InventoryLedgerEntry[] = [
  {
    id: 'ledger-1',
    transactionType: 'STOCK_RECEIVED',
    quantity: 200,
    beforeQuantity: 0,
    afterQuantity: 200,
    reason: 'Opening stock — batch DL24A102',
    referenceType: 'GOODS_RECEIPT',
    referenceId: 'gr-1042',
    createdAt: '2025-01-10T09:00:00Z',
  },
  {
    id: 'ledger-2',
    transactionType: 'RESERVATION',
    quantity: -5,
    beforeQuantity: 200,
    afterQuantity: 195,
    reason: 'Reserved for order BZO-20250212-0812',
    referenceType: 'ORDER',
    referenceId: 'ord-mock-4',
    createdAt: '2025-02-12T08:12:00Z',
  },
  {
    id: 'ledger-3',
    transactionType: 'MANUAL_ADJUSTMENT',
    quantity: -175,
    beforeQuantity: 195,
    afterQuantity: 20,
    reason: 'Cycle count correction',
    referenceType: 'MANUAL',
    referenceId: null,
    createdAt: '2025-02-14T17:30:00Z',
  },
];

/* Preview-only notification inbox + preference matrix (mutable so mark-read works). */
export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Welcome to BEZZO',
    body: 'Your B2B medical marketplace account is active and ready to order.',
    type: 'INFO',
    channel: 'IN_APP',
    status: 'DELIVERED',
    read: false,
    referenceType: null,
    referenceId: null,
    createdAt: '2025-02-15T09:00:00Z',
  },
  {
    id: 'notif-2',
    title: 'Order BZO-20250212-0812 delivered',
    body: 'All 4 packages were delivered to Sunrise Pharmacy and signed for.',
    type: 'ORDER_UPDATE',
    channel: 'IN_APP',
    status: 'DELIVERED',
    read: true,
    referenceType: 'ORDER',
    referenceId: 'ord-mock-4',
    createdAt: '2025-02-12T15:41:00Z',
  },
];

export const MOCK_NOTIFICATION_PREFERENCES: NotificationPreference[] = [
  { eventType: 'ORDER_UPDATE', channel: 'IN_APP', enabled: true },
  { eventType: 'ORDER_UPDATE', channel: 'SMS', enabled: true },
  { eventType: 'FULFILLMENT_UPDATE', channel: 'IN_APP', enabled: true },
  { eventType: 'FULFILLMENT_UPDATE', channel: 'SMS', enabled: false },
  { eventType: 'PAYMENT_UPDATE', channel: 'IN_APP', enabled: true },
  { eventType: 'PAYMENT_UPDATE', channel: 'EMAIL', enabled: true },
  { eventType: 'MARKETING', channel: 'IN_APP', enabled: false },
  { eventType: 'MARKETING', channel: 'EMAIL', enabled: false },
];

/* Preview-only payment evidence: refund records and webhook events keyed by payment id. */
export const MOCK_PAYMENT_REFUNDS: Record<string, PaymentRefundRecord[]> = {};
export const MOCK_PAYMENT_WEBHOOKS: Record<string, PaymentWebhookEvent[]> = {};
let mockAttemptCounter = 2;

/* In-flight OTP challenges (preview code: 123456). */
const mockOtpChallenges = new Map<string, { purpose: string; identifier: string; userId: string }>();

export function handleMockRoute(
  path: string,
  method: string,
  query: Record<string, string>,
  body?: unknown,
): { status: number; payload: unknown } {
  const norm = path.startsWith('/') ? path : `/${path}`;

  // 1. Health & Version & Routing
  if (norm === '/health' || norm === '/api/v1/health') {
    return { status: 200, payload: { success: true, data: MOCK_HEALTH } };
  }
  if (norm === '/version' || norm === '/api/v1/version') {
    return { status: 200, payload: { success: true, data: MOCK_VERSION } };
  }
  if (norm === '/applications/routing' || norm === '/api/v1/applications/routing') {
    return { status: 200, payload: { success: true, data: MOCK_ROUTING } };
  }
  if (norm === '/applications' || norm === '/api/v1/applications') {
    if (method !== 'POST') {
      return {
        status: 405,
        payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } },
      };
    }
    const b = (body ?? {}) as Record<string, string | number | undefined>;
    const now = new Date().toISOString();
    const reference = `APP-2025-${String(mockStore.partnerApplications.length + 1).padStart(3, '0')}`;
    const lines = [
      `New ${String(b.applicationType ?? 'PARTNER').toLowerCase()} application ${reference}`,
      `Business: ${b.businessName ?? '—'}`,
      `Contact: ${b.applicantName ?? '—'} (${b.contactPhone ?? '—'})`,
      `City: ${b.city ?? '—'}, ${b.state ?? '—'}`,
    ];
    if (b.gstin) lines.push(`GSTIN: ${b.gstin}`);
    if (b.licenceReference) lines.push(`Licence: ${b.licenceReference}`);
    const application: PartnerApplication = {
      id: `app-${Date.now()}`,
      reference,
      applicationType: (b.applicationType as PartnerApplication['applicationType']) ?? 'SUPPLIER',
      status: 'NEW',
      applicantName: String(b.applicantName ?? ''),
      businessName: String(b.businessName ?? ''),
      contactPhone: String(b.contactPhone ?? ''),
      contactEmail: b.contactEmail ? String(b.contactEmail) : null,
      city: String(b.city ?? ''),
      state: String(b.state ?? ''),
      postalCode: b.postalCode ? String(b.postalCode) : null,
      gstin: b.gstin ? String(b.gstin) : null,
      licenceReference: b.licenceReference ? String(b.licenceReference) : null,
      yearsInBusiness: b.yearsInBusiness !== undefined ? Number(b.yearsInBusiness) : null,
      monthlyVolume: b.monthlyVolume ? String(b.monthlyVolume) : null,
      message: b.message ? String(b.message) : null,
      routedToNumber: MOCK_ROUTING.whatsappNumber,
      routedToDisplay: MOCK_ROUTING.whatsappNumber,
      whatsappUrl: `${MOCK_ROUTING.whatsappUrl}?text=${encodeURIComponent(lines.join('\n'))}`,
      deliveryChannel: 'WHATSAPP',
      source: 'WEB',
      reviewNotes: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mockStore.partnerApplications.push(application);
    return { status: 201, payload: { success: true, data: application } };
  }

  // 2. Authentication
  if (norm === '/auth/login' || norm === '/api/v1/auth/login') {
    const { identifier } = (body ?? {}) as { identifier?: string; password?: string };
    const email = identifier?.toLowerCase().trim() || 'buyer1@bezzo.local';
    const fallbackUser = MOCK_USERS['buyer1@bezzo.local']!;
    const match = MOCK_USERS[email] ?? fallbackUser;
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          accessToken: `token_${match.principal.id}_${Date.now()}`,
          refreshToken: `refresh_${match.principal.id}_${Date.now()}`,
          accessTokenExpiresIn: 3600,
          principal: match.principal,
        },
      },
    };
  }

  if (norm === '/me' || norm === '/api/v1/me' || norm === '/auth/me' || norm === '/api/v1/auth/me') {
    return {
      status: 200,
      payload: {
        success: true,
        data: MOCK_USERS['buyer1@bezzo.local']!.principal,
      },
    };
  }

  if (norm === '/auth/refresh' || norm === '/api/v1/auth/refresh') {
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          accessToken: `token_refreshed_${Date.now()}`,
          refreshToken: `refresh_${Date.now()}`,
          accessTokenExpiresIn: 3600,
          principal: MOCK_USERS['buyer1@bezzo.local']!.principal,
        },
      },
    };
  }

  if (norm === '/auth/logout' || norm === '/api/v1/auth/logout') {
    return { status: 200, payload: { success: true, data: { loggedOut: true } } };
  }
  if (norm === '/auth/register' || norm === '/api/v1/auth/register') {
    if (method !== 'POST') {
      return {
        status: 405,
        payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } },
      };
    }
    const b = (body ?? {}) as { email?: string; phone?: string; accountType?: string };
    if (!b.email?.trim() && !b.phone?.trim()) {
      return {
        status: 422,
        payload: {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'An email address or phone number is required.' },
        },
      };
    }
    return {
      status: 201,
      payload: {
        success: true,
        data: {
          userId: `user-${Date.now()}`,
          status: 'PENDING_VERIFICATION',
          verificationRequired: true,
          devOtp: '123456',
        },
      },
    };
  }
  if (norm === '/auth/otp/request' || norm === '/api/v1/auth/otp/request') {
    if (method !== 'POST') {
      return {
        status: 405,
        payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } },
      };
    }
    const b = (body ?? {}) as { identifier?: string; purpose?: string };
    const identifier = b.identifier?.trim() ?? '';
    if (!identifier) {
      return {
        status: 422,
        payload: {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'An identifier is required.' },
        },
      };
    }
    const masked = identifier.includes('@')
      ? `${identifier.slice(0, 1)}${'•'.repeat(Math.max(1, identifier.indexOf('@') - 1))}@${identifier.split('@')[1] ?? ''}`
      : `•••••• ${identifier.slice(-4)}`;
    const challengeId = `ch_${Date.now()}`;
    mockOtpChallenges.set(challengeId, {
      purpose: b.purpose ?? 'EMAIL_VERIFY',
      identifier,
      userId: `user-${Date.now()}`,
    });
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          challengeId,
          expiresInSeconds: 600,
          destinationMasked: masked,
          devOtp: '123456',
        },
      },
    };
  }
  if (norm === '/auth/otp/verify' || norm === '/api/v1/auth/otp/verify') {
    if (method !== 'POST') {
      return {
        status: 405,
        payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } },
      };
    }
    const b = (body ?? {}) as { challengeId?: string; code?: string };
    const challenge = b.challengeId ? mockOtpChallenges.get(b.challengeId) : undefined;
    if (!challenge) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'CHALLENGE_NOT_FOUND', message: 'That verification challenge has expired. Request a new code.' },
        },
      };
    }
    if ((b.code ?? '').trim() !== '123456') {
      return {
        status: 401,
        payload: {
          success: false,
          error: { code: 'INVALID_OTP', message: 'That code is not valid. The preview code is 123456.' },
        },
      };
    }
    mockOtpChallenges.delete(b.challengeId!);
    return {
      status: 200,
      payload: {
        success: true,
        data: { verified: true, purpose: challenge.purpose, userId: challenge.userId },
      },
    };
  }

  // 3. Catalog
  if (norm === '/catalog/categories' || norm === '/api/v1/catalog/categories') {
    return { status: 200, payload: { success: true, data: MOCK_CATEGORIES } };
  }

  if (norm === '/catalog/delivery-slots' || norm === '/api/v1/catalog/delivery-slots') {
    return { status: 200, payload: { success: true, data: MOCK_DELIVERY_SLOTS } };
  }

  if (norm === '/catalog/products/suggest' || norm === '/api/v1/catalog/products/suggest') {
    const q = (query.q ?? '').toLowerCase();
    const suggestions: ProductSuggestion[] = MOCK_PRODUCTS
      .filter((p) => !q || p.summary.name.toLowerCase().includes(q) || (p.summary.genericName?.toLowerCase() || '').includes(q))
      .map((p) => ({
        id: p.summary.id,
        name: p.summary.name,
        strength: p.summary.strength,
        packSize: p.summary.packSize,
        manufacturerName: p.summary.manufacturerName,
      }));
    return { status: 200, payload: { success: true, data: suggestions } };
  }

  if (norm === '/catalog/products' || norm === '/api/v1/catalog/products') {
    const q = (query.q ?? '').toLowerCase();
    // The real API accepts `categoryId` (and legacy `category` reads the same way here).
    const cat = query.categoryId ?? query.category;
    const presc = query.prescriptionClassification;
    const inStockOnly = query.inStockOnly === 'true';
    const sort = query.sort ?? 'relevance';

    let filtered = MOCK_PRODUCTS.map((p) => p.summary);
    if (q) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.genericName?.toLowerCase() || '').includes(q) ||
          (p.brandName?.toLowerCase() || '').includes(q) ||
          (p.manufacturerName?.toLowerCase() || '').includes(q),
      );
    }
    if (cat) {
      const targetCat = MOCK_CATEGORIES.find((c) => c.slug === cat || c.id === cat);
      if (targetCat) {
        filtered = filtered.filter((p) => p.categoryId === targetCat.id);
      }
    }
    if (presc) {
      filtered = filtered.filter((p) => p.prescriptionClassification === presc);
    }
    if (inStockOnly) {
      filtered = filtered.filter((p) => p.inStock);
    }
    if (sort === 'price_asc') {
      filtered = [...filtered].sort((a, b) => (a.minPrice ?? 0) - (b.minPrice ?? 0));
    } else if (sort === 'price_desc') {
      filtered = [...filtered].sort((a, b) => (b.minPrice ?? 0) - (a.minPrice ?? 0));
    } else if (sort === 'name_asc') {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'created_desc') {
      // Deterministic "newest first" for the preview: reverse of catalogue order.
      filtered = [...filtered].reverse();
    }

    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '12', 10);
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    // Mirrors the real API contract: the page payload is { items, pagination }.
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          items,
          pagination: {
            page,
            pageSize,
            totalItems,
            totalPages,
            hasNext: page < totalPages,
          },
        },
      },
    };
  }

  if (norm.startsWith('/catalog/products/') || norm.startsWith('/api/v1/catalog/products/')) {
    const prodId = norm.replace('/api/v1/catalog/products/', '').replace('/catalog/products/', '');
    const found = MOCK_PRODUCTS.find((p) => p.summary.id === prodId || p.detail.slug === prodId);
    if (found) {
      return { status: 200, payload: { success: true, data: found.detail } };
    }
    return { status: 200, payload: { success: true, data: MOCK_PRODUCTS[0]!.detail } };
  }

  // 4. Cart
  if (norm === '/cart' || norm === '/api/v1/cart') {
    if (method === 'DELETE') {
      mockStore.cart.items = [];
      mockStore.recalculateCart();
      return { status: 200, payload: { success: true, data: mockStore.cart } };
    }
    return { status: 200, payload: { success: true, data: mockStore.cart } };
  }

  if (norm === '/cart/items' || norm === '/api/v1/cart/items') {
    if (method === 'POST') {
      const { supplierProductId, listingId, quantity = 1 } = (body ?? {}) as {
        supplierProductId?: string;
        listingId?: string;
        quantity?: number;
      };
      const resolvedListingId = supplierProductId ?? listingId;
      let foundOffer: { offer: SupplierOffer; product: MockProductData } | null = null;
      for (const prod of MOCK_PRODUCTS) {
        for (const off of prod.detail.offers) {
          if (off.listingId === resolvedListingId) {
            foundOffer = { offer: off, product: prod };
            break;
          }
        }
        if (foundOffer) break;
      }

      if (foundOffer) {
        const existing = mockStore.cart.items.find((l) => l.supplierProductId === listingId);
        if (existing) {
          existing.quantity += quantity;
        } else {
          const lineSub = foundOffer.offer.sellingPrice * quantity;
          const lineTax = Math.round((lineSub * (foundOffer.offer.taxRate ?? 12)) / 100);
          mockStore.cart.items.push({
            id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            supplierProductId: foundOffer.offer.listingId,
            productId: foundOffer.product.summary.id,
            productName: foundOffer.product.summary.name,
            strength: foundOffer.product.summary.strength,
            packSize: foundOffer.product.summary.packSize,
            prescriptionClassification: foundOffer.product.summary.prescriptionClassification,
            manufacturerName: foundOffer.product.summary.manufacturerName,
            supplierId: foundOffer.offer.supplierId,
            supplierName: foundOffer.offer.supplierName,
            supplierCity: foundOffer.offer.supplierCity,
            quantity,
            minimumOrderQuantity: foundOffer.offer.minimumOrderQuantity,
            sellableQuantity: foundOffer.offer.sellableQuantity,
            unitPrice: foundOffer.offer.sellingPrice,
            mrpReference: foundOffer.offer.mrpReference,
            taxRate: foundOffer.offer.taxRate,
            lineSubtotal: lineSub,
            lineTax,
            lineTotal: lineSub + lineTax,
            leadTimeMinutes: foundOffer.offer.leadTimeMinutes,
            batchNumber: foundOffer.offer.batchNumber,
            expiryDate: foundOffer.offer.expiryDate,
            available: true,
            issues: [],
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        mockStore.recalculateCart();
      }
      return { status: 200, payload: { success: true, data: mockStore.cart } };
    }
  }

  if (norm.startsWith('/cart/items/') || norm.startsWith('/api/v1/cart/items/')) {
    const lineId = norm.replace('/api/v1/cart/items/', '').replace('/cart/items/', '');
    if (method === 'DELETE') {
      mockStore.cart.items = mockStore.cart.items.filter((l) => l.id !== lineId);
      mockStore.recalculateCart();
      return { status: 200, payload: { success: true, data: mockStore.cart } };
    }
    if (method === 'PATCH') {
      const { quantity } = (body ?? {}) as { quantity?: number };
      if (typeof quantity === 'number') {
        const line = mockStore.cart.items.find((l) => l.id === lineId);
        if (line) {
          line.quantity = Math.max(1, quantity);
        }
        mockStore.recalculateCart();
      }
      return { status: 200, payload: { success: true, data: mockStore.cart } };
    }
  }

  // 5. Checkout
  if (norm === '/checkout/quote' || norm === '/api/v1/checkout/quote') {
    const subtotal = mockStore.cart.estimatedSubtotal || 28500;
    const taxTotal = mockStore.cart.estimatedTax || 3420;
    const deliveryFee = 15000;
    const grandTotal = subtotal + taxTotal + deliveryFee;

    const quote: CheckoutQuote = {
      placeable: true,
      currency: 'INR',
      deliveryMode: 'SCHEDULED',
      deliveryFee,
      deliveryFeeBreakdown: { base: deliveryFee, instantSurcharge: 0, currency: 'INR' },
      subtotal,
      taxTotal,
      discountTotal: 0,
      grandTotal,
      itemCount: mockStore.cart.items.length || 1,
      cartId: mockStore.cart.cartId,
      supplierCount: mockStore.cart.supplierCount || 1,
      deliveryAddress: MOCK_BUYER_ADDRESSES[0] ?? null,
      issues: [],
      lines: mockStore.cart.items.map((l) => ({
        supplierProductId: l.supplierProductId,
        productId: l.productId,
        productName: l.productName,
        manufacturerName: l.manufacturerName,
        packSize: l.packSize,
        supplierId: l.supplierId,
        supplierName: l.supplierName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        mrpReference: l.mrpReference,
        taxRate: l.taxRate ?? 12,
        lineSubtotal: l.lineSubtotal,
        lineTax: l.lineTax,
        lineTotal: l.lineTotal,
        sellableQuantity: l.sellableQuantity,
        issue: null,
      })),
      quotedAt: new Date().toISOString(),
    };
    return { status: 200, payload: { success: true, data: quote } };
  }

  // 6. Orders
  if (norm === '/orders' || norm === '/api/v1/orders') {
    if (method === 'POST') {
      const b = (body ?? {}) as {
        deliveryAddressId?: string;
        deliveryMode?: string;
        deliverySlotId?: string;
        deliveryDate?: string;
        paymentMethod?: string;
        buyerNote?: string;
      };
      const subtotal = mockStore.cart.estimatedSubtotal || 28500;
      const taxTotal = mockStore.cart.estimatedTax || 3420;
      const deliveryFee = 15000;
      const grandTotal = subtotal + taxTotal + deliveryFee;
      const orderNumber = `BZO-202502-${Math.floor(1000 + Math.random() * 9000)}`;

      const newOrder: OrderDetail = {
        id: `ord-${Date.now()}`,
        orderNumber,
        status: 'CONFIRMED',
        paymentStatus: b.paymentMethod === 'COD' ? 'PENDING' : 'CAPTURED',
        currency: 'INR',
        subtotal,
        discountTotal: 0,
        taxTotal,
        deliveryFee,
        grandTotal,
        deliveryMode: b.deliveryMode || 'SCHEDULED',
        deliveryDate: b.deliveryDate || '2025-02-16',
        shippingAddress: {
          id: 'addr-1',
          label: 'Main Store',
          contactName: 'Ramesh Patel',
          contactPhone: '+919000000021',
          addressLine1: 'Shop No. 4, Sigra Crossing',
          addressLine2: 'Near Bharat Mata Mandir',
          landmark: 'Opposite State Bank',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          postalCode: '221002',
          country: 'India',
        },
        buyerNote: b.buyerNote || null,
        placedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
        cancelledAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        checkoutSessionId: `sess-${Date.now()}`,
        itemCount: mockStore.cart.items.length || 1,
        supplierCount: mockStore.cart.supplierCount || 1,
        activeReservations: 1,
        reservationCount: 1,
        timeline: [
          {
            fromStatus: null,
            toStatus: 'CONFIRMED',
            reason: 'Order placed by retailer',
            actorType: 'BUYER',
            createdAt: new Date().toISOString(),
          },
        ],
        fulfillments: [
          {
            id: `ful-${Date.now()}`,
            fulfillmentReference: `${orderNumber}-1`,
            supplierId: 'sup-1',
            supplierName: 'ABC Pharma Wholesaler',
            status: 'ACCEPTED',
            subtotal,
            taxTotal,
            deliveryAllocation: deliveryFee,
            total: grandTotal,
            packageCount: 1,
            itemCount: mockStore.cart.items.length || 1,
            unitCount: mockStore.cart.unitCount || 10,
            acceptedAt: new Date().toISOString(),
            packedAt: null,
            readyAt: null,
            collectedAt: null,
            deliveredAt: null,
            cancelledAt: null,
          },
        ],
        items: mockStore.cart.items.map((l) => ({
          id: `item-${l.id}`,
          productId: l.productId,
          supplierProductId: l.supplierProductId,
          supplierId: l.supplierId,
          supplierName: l.supplierName,
          productName: l.productName,
          manufacturerName: l.manufacturerName,
          composition: null,
          packSize: l.packSize,
          unitPrice: l.unitPrice,
          mrpReference: l.mrpReference,
          taxRate: l.taxRate ?? 12,
          quantity: l.quantity,
          discountAmount: 0,
          taxAmount: l.lineTax,
          lineTotal: l.lineTotal,
          status: 'ACCEPTED',
        })),
        payment: {
          id: `pay-${Date.now()}`,
          gateway: b.paymentMethod === 'COD' ? 'MANUAL' : 'RAZORPAY',
          status: b.paymentMethod === 'COD' ? 'PENDING' : 'CAPTURED',
          amount: grandTotal,
          currency: 'INR',
          method: b.paymentMethod || 'COD',
          providerReference: b.paymentMethod === 'COD' ? 'COD-CONFIRMED' : 'razorpay_mock',
          providerOrderReference: null,
          failureCode: null,
          failureMessage: null,
          paidAt: b.paymentMethod === 'COD' ? null : new Date().toISOString(),
          refundedAmount: 0,
        },
      };

      mockStore.orders.unshift(newOrder);
      mockStore.cart.items = [];
      mockStore.recalculateCart();

      return { status: 201, payload: { success: true, data: newOrder } };
    }

    const summaries: OrderSummary[] = mockStore.orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      currency: o.currency,
      subtotal: o.subtotal,
      taxTotal: o.taxTotal,
      deliveryFee: o.deliveryFee,
      grandTotal: o.grandTotal,
      deliveryMode: o.deliveryMode,
      deliveryDate: o.deliveryDate,
      placedAt: o.placedAt || o.createdAt,
      confirmedAt: o.confirmedAt,
      cancelledAt: o.cancelledAt,
      itemCount: o.itemCount,
      unitCount: o.items.reduce((acc, i) => acc + i.quantity, 0),
      supplierCount: o.supplierCount,
      fulfillmentStatuses: o.fulfillments.map((f) => f.status),
    }));

    return {
      status: 200,
      payload: {
        success: true,
        data: summaries,
        meta: {
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: summaries.length,
            totalPages: 1,
          },
        },
      },
    };
  }

  if (norm.startsWith('/orders/') || norm.startsWith('/api/v1/orders/')) {
    const rest = norm.replace('/api/v1/orders/', '').replace('/orders/', '');
    const [orderId, sub] = rest.split('/');
    const found = mockStore.orders.find((o) => o.id === orderId || o.orderNumber === orderId);

    if (!found) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Order ${orderId} does not exist in the preview dataset.` },
        },
      };
    }

    if (!sub) {
      return { status: 200, payload: { success: true, data: found } };
    }

    if (sub === 'refunds') {
      // No seeded refunds in the preview dataset; the detail screen renders an honest empty state.
      return { status: 200, payload: { success: true, data: [] } };
    }

    if (sub === 'cancel') {
      if (method !== 'POST') {
        return {
          status: 405,
          payload: {
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: `${method} is not supported on this endpoint.` },
          },
        };
      }
      if (['DELIVERED', 'CANCELLED', 'COMPLETED'].includes(found.status)) {
        return {
          status: 409,
          payload: {
            success: false,
            error: {
              code: 'ORDER_NOT_CANCELLABLE',
              message: `Order ${found.orderNumber} is already ${found.status.toLowerCase()} and can no longer be cancelled.`,
            },
          },
        };
      }
      const reason = ((body ?? {}) as { reason?: string }).reason?.trim() || 'Cancelled by buyer';
      const now = new Date().toISOString();
      found.status = 'CANCELLED';
      found.cancelledAt = now;
      found.activeReservations = 0;
      found.cancellation = {
        orderNumber: found.orderNumber,
        releasedLines: found.items.length,
        releasedUnits: found.items.reduce((total, item) => total + item.quantity, 0),
      };
      found.timeline.push({
        fromStatus: 'PROCESSING',
        toStatus: 'CANCELLED',
        reason,
        actorType: 'BUYER',
        createdAt: now,
      });
      found.fulfillments.forEach((fulfillment) => {
        if (!['DELIVERED', 'CANCELLED'].includes(fulfillment.status)) {
          fulfillment.status = 'CANCELLED';
          fulfillment.cancelledAt = now;
        }
      });
      return { status: 200, payload: { success: true, data: found } };
    }

    return {
      status: 404,
      payload: {
        success: false,
        error: { code: 'NOT_FOUND', message: `Unknown order sub-resource "${sub}".` },
      },
    };
  }

  // 7. Buyer account
  if (norm === '/buyer/profile' || norm === '/api/v1/buyer/profile') {
    return { status: 200, payload: { success: true, data: MOCK_BUYER_PROFILE } };
  }
  if (norm === '/buyer/addresses' || norm === '/api/v1/buyer/addresses') {
    if (method === 'POST') {
      const newAddr = {
        id: `addr-${Date.now()}`,
        ...(body as Record<string, unknown>),
        country: 'India',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as BuyerAddress;
      MOCK_BUYER_ADDRESSES.push(newAddr);
      return { status: 201, payload: { success: true, data: newAddr } };
    }
    return { status: 200, payload: { success: true, data: MOCK_BUYER_ADDRESSES } };
  }
  if (norm.startsWith('/buyer/addresses/') || norm.startsWith('/api/v1/buyer/addresses/')) {
    const aid = norm.split('/buyer/addresses/')[1]?.replace('/api/v1/', '') ?? '';
    const index = MOCK_BUYER_ADDRESSES.findIndex((address) => address.id === aid);
    if (index === -1) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Address ${aid} does not exist in the preview dataset.` },
        },
      };
    }
    if (method === 'DELETE') {
      MOCK_BUYER_ADDRESSES.splice(index, 1);
      return { status: 200, payload: { success: true, data: { deleted: true } } };
    }
    if (method === 'PATCH') {
      const b = (body ?? {}) as Record<string, unknown>;
      const address = MOCK_BUYER_ADDRESSES[index]!;
      const textFields = ['label', 'contactName', 'contactPhone', 'addressLine1', 'addressLine2', 'landmark', 'city', 'state', 'postalCode'] as const;
      for (const field of textFields) {
        if (typeof b[field] === 'string') {
          (address as unknown as Record<string, unknown>)[field] = (b[field] as string).trim();
        }
      }
      if (typeof b.isDefault === 'boolean' && b.isDefault) {
        MOCK_BUYER_ADDRESSES.forEach((row, i) => {
          (row as unknown as Record<string, unknown>).isDefault = i === index;
        });
      }
      address.updatedAt = new Date().toISOString();
      return { status: 200, payload: { success: true, data: address } };
    }
    return { status: 200, payload: { success: true, data: MOCK_BUYER_ADDRESSES[index] } };
  }
  if (norm === '/buyer/documents' || norm === '/api/v1/buyer/documents') {
    return { status: 200, payload: { success: true, data: MOCK_BUYER_DOCUMENTS } };
  }
  if (norm === '/me/sessions' || norm === '/api/v1/me/sessions') {
    return { status: 200, payload: { success: true, data: MOCK_STAFF_SESSIONS } };
  }
  if (norm.startsWith('/auth/sessions/') || norm.startsWith('/api/v1/auth/sessions/')) {
    if (method !== 'DELETE') {
      return {
        status: 405,
        payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use DELETE.' } },
      };
    }
    const sid = norm.split('/auth/sessions/')[1]?.replace('/api/v1/', '') ?? '';
    const index = MOCK_STAFF_SESSIONS.findIndex((session) => session.id === sid);
    if (index === -1) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Session ${sid} does not exist in the preview dataset.` },
        },
      };
    }
    MOCK_STAFF_SESSIONS.splice(index, 1);
    return { status: 200, payload: { success: true, data: { revoked: true } } };
  }
  if (norm === '/me/security' || norm === '/api/v1/me/security') {
    return { status: 200, payload: { success: true, data: MOCK_SECURITY_OVERVIEW } };
  }

  // 8. Supplier portal — fulfilment queue (preview fixtures shaped exactly like the API rows)
  if (norm === '/supplier/fulfillments' || norm === '/api/v1/supplier/fulfillments') {
    const status = query.status;
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '15', 10);
    let rows = MOCK_SUPPLIER_FULFILLMENTS;
    if (status) {
      rows = rows.filter((row) => row.status === status);
    }
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return {
      status: 200,
      payload: {
        success: true,
        data: { rows: rows.slice(start, start + pageSize), total },
      },
    };
  }
  if (norm.startsWith('/supplier/fulfillments/') || norm.startsWith('/api/v1/supplier/fulfillments/')) {
    const rest = norm.split('/supplier/fulfillments/')[1]?.replace('/api/v1/', '') ?? '';
    const [fid, action] = rest.split('/');
    const found = MOCK_SUPPLIER_FULFILLMENTS.find((row) => row.id === fid);
    if (!found) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Fulfillment ${fid} does not exist in the preview dataset.` },
        },
      };
    }

    const touch = (toStatus: string, reason: string) => {
      found.timeline.push({
        id: `ful-${found.id}-tl-${found.timeline.length + 1}-${Date.now()}`,
        fromStatus: found.status,
        toStatus,
        reason,
        actorType: 'SUPPLIER',
        createdAt: new Date().toISOString(),
      });
      found.status = toStatus;
    };

    if (!action) {
      return { status: 200, payload: { success: true, data: found } };
    }

    if (method !== 'POST') {
      return {
        status: 405,
        payload: {
          success: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: `${method} is not supported on this endpoint.` },
        },
      };
    }

    if (action === 'accept') {
      if (found.status !== 'CREATED') {
        return {
          status: 409,
          payload: {
            success: false,
            error: { code: 'INVALID_TRANSITION', message: `Only CREATED fulfillments can be accepted (current: ${found.status}).` },
          },
        };
      }
      touch('ACCEPTED', 'Accepted by supplier');
      found.acceptedAt = new Date().toISOString();
      found.items.forEach((item) => {
        item.status = 'ACCEPTED';
      });
      return { status: 200, payload: { success: true, data: found } };
    }

    if (action === 'pack') {
      if (found.status !== 'ACCEPTED') {
        return {
          status: 409,
          payload: {
            success: false,
            error: { code: 'INVALID_TRANSITION', message: `Pack requires an ACCEPTED fulfillment (current: ${found.status}).` },
          },
        };
      }
      const b = (body ?? {}) as {
        packages?: Array<{ packageType?: string; weightGrams?: number; sealNumber?: string; handlingNotes?: string }>;
      };
      const incoming = b.packages?.length
        ? b.packages
        : [{ packageType: 'CARTON', weightGrams: undefined, sealNumber: undefined, handlingNotes: undefined }];
      for (const pkg of incoming) {
        found.packages.push({
          id: `pkg-${found.id}-${found.packages.length + 1}-${Date.now()}`,
          packageCode: `PKG-${found.fulfillmentReference}-${found.packages.length + 1}`,
          status: 'PACKED',
          packageType: pkg.packageType ?? 'CARTON',
          weightGrams: pkg.weightGrams ?? null,
          sealNumber: pkg.sealNumber?.trim() || null,
          handlingNotes: pkg.handlingNotes?.trim() || null,
          pickupTaskId: null,
          collectedAt: null,
          createdAt: new Date().toISOString(),
        });
      }
      found.packageCount = found.packages.length;
      touch('PACKED', `${incoming.length} package${incoming.length > 1 ? 's' : ''} registered`);
      found.packedAt = new Date().toISOString();
      return { status: 200, payload: { success: true, data: found } };
    }

    if (action === 'ready') {
      if (found.status !== 'PACKED') {
        return {
          status: 409,
          payload: {
            success: false,
            error: { code: 'INVALID_TRANSITION', message: `Ready requires a PACKED fulfillment (current: ${found.status}).` },
          },
        };
      }
      const task = {
        id: `task-${found.id}-${Date.now()}`,
        taskCode: `PK-${Math.floor(10000 + Math.random() * 90000)}`,
        status: 'DISPATCHED',
        priority: 'NORMAL',
        pickupWindowStart: new Date().toISOString(),
        pickupWindowEnd: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        assignedPickerName: null,
        assignedPickerPhone: null,
        createdAt: new Date().toISOString(),
      };
      found.pickupTask = task;
      found.packages.forEach((pkg) => {
        pkg.pickupTaskId = task.id;
      });
      touch('READY_FOR_PICKUP', `Pickup task ${task.taskCode} dispatched`);
      found.readyAt = new Date().toISOString();
      return { status: 200, payload: { success: true, data: { pickupTaskId: task.id, taskCode: task.taskCode } } };
    }

    if (action === 'reject') {
      if (found.status !== 'CREATED') {
        return {
          status: 409,
          payload: {
            success: false,
            error: { code: 'INVALID_TRANSITION', message: `Only CREATED fulfillments can be rejected (current: ${found.status}).` },
          },
        };
      }
      const reason = ((body ?? {}) as { reason?: string }).reason?.trim() || 'Rejected by supplier';
      touch('REJECTED', reason);
      found.acceptedAt = null;
      return { status: 200, payload: { success: true, data: found } };
    }

    return {
      status: 404,
      payload: {
        success: false,
        error: { code: 'NOT_FOUND', message: `Unknown fulfillment action "${action}".` },
      },
    };
  }

  // 8. Supplier portal
  if (norm === '/supplier/profile' || norm === '/api/v1/supplier/profile') {
    return { status: 200, payload: { success: true, data: MOCK_SUPPLIER_PROFILE } };
  }
  if (norm === '/supplier/listings' || norm === '/api/v1/supplier/listings') {
    if (method === 'POST') {
      const b = (body ?? {}) as {
        productId?: string;
        supplierSku?: string;
        sellingPrice?: number;
        mrpReference?: number;
        taxRate?: number;
        minimumOrderQuantity?: number;
        leadTimeMinutes?: number;
        openingQuantity?: number;
        batchNumber?: string;
        expiryDate?: string;
        lowStockThreshold?: number;
      };
      const product = MOCK_PRODUCTS.find((candidate) => candidate.summary.id === b.productId);
      const summary = product?.summary;
      const opening = Math.max(0, Math.round(b.openingQuantity ?? 0));
      const now = new Date().toISOString();
      const listingId = `list-${Date.now()}`;
      const listing: SupplierListing = {
        id: listingId,
        productId: b.productId ?? 'prod-1',
        productName: summary?.name ?? 'Newly listed product',
        strength: summary?.strength ?? null,
        packSize: summary?.packSize ?? null,
        dosageForm: summary?.dosageForm ?? 'TABLET',
        manufacturerName: summary?.manufacturerName ?? null,
        prescriptionClassification: summary?.prescriptionClassification ?? 'OTC',
        supplierSku: b.supplierSku?.trim() || null,
        status: 'ACTIVE',
        sellingPrice: Math.max(1, Math.round(b.sellingPrice ?? 0)),
        mrpReference: b.mrpReference ?? null,
        taxRate: b.taxRate ?? 12,
        minimumOrderQuantity: Math.max(1, Math.round(b.minimumOrderQuantity ?? 1)),
        leadTimeMinutes: Math.max(0, Math.round(b.leadTimeMinutes ?? 60)),
        inventoryId: `inv-${listingId}`,
        availableQuantity: opening,
        reservedQuantity: 0,
        sellableQuantity: opening,
        lowStockThreshold: b.lowStockThreshold ?? 10,
        inventoryStatus: opening <= (b.lowStockThreshold ?? 10) ? 'LOW_STOCK' : 'IN_STOCK',
        batchNumber: b.batchNumber?.trim() || null,
        expiryDate: b.expiryDate || null,
        createdAt: now,
        updatedAt: now,
      };
      MOCK_SUPPLIER_LISTINGS.push(listing);
      MOCK_SUPPLIER_INVENTORY.push({
        id: listing.inventoryId!,
        listingId: listing.id,
        productName: listing.productName,
        packSize: listing.packSize,
        sellingPrice: listing.sellingPrice,
        availableQuantity: opening,
        reservedQuantity: 0,
        sellableQuantity: opening,
        damagedQuantity: 0,
        expiredQuantity: 0,
        blockedQuantity: 0,
        lowStockThreshold: listing.lowStockThreshold ?? 10,
        status: listing.inventoryStatus ?? 'IN_STOCK',
        batchNumber: listing.batchNumber,
        expiryDate: listing.expiryDate,
        version: 1,
        updatedAt: now,
      });
      return { status: 201, payload: { success: true, data: listing } };
    }
    const search = (query.search ?? '').toLowerCase();
    const status = query.status;
    let rows = MOCK_SUPPLIER_LISTINGS;
    if (search) {
      rows = rows.filter(
        (row) =>
          row.productName.toLowerCase().includes(search) ||
          (row.supplierSku ?? '').toLowerCase().includes(search),
      );
    }
    if (status && status !== 'ALL') {
      rows = rows.filter((row) => row.status === status);
    }
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '8', 10);
    const start = (page - 1) * pageSize;
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          items: rows.slice(start, start + pageSize),
          pagination: { page, pageSize, totalItems: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
        },
      },
    };
  }
  if (norm.startsWith('/supplier/listings/') || norm.startsWith('/api/v1/supplier/listings/')) {
    const lid = norm.split('/supplier/listings/')[1]?.replace('/api/v1/', '') ?? '';
    const listing = MOCK_SUPPLIER_LISTINGS.find((row) => row.id === lid);
    if (!listing) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Listing ${lid} does not exist in the preview dataset.` },
        },
      };
    }
    if (method === 'PATCH') {
      const b = (body ?? {}) as Record<string, unknown>;
      const numeric = (key: string): number | undefined =>
        b[key] === undefined || b[key] === null || b[key] === '' ? undefined : Number(b[key]);
      const sellingPrice = numeric('sellingPrice');
      if (sellingPrice !== undefined && sellingPrice > 0) listing.sellingPrice = Math.round(sellingPrice);
      const mrp = numeric('mrpReference');
      if (mrp !== undefined && mrp > 0) listing.mrpReference = Math.round(mrp);
      const moq = numeric('minimumOrderQuantity');
      if (moq !== undefined && moq > 0) listing.minimumOrderQuantity = Math.round(moq);
      const lead = numeric('leadTimeMinutes');
      if (lead !== undefined && lead >= 0) listing.leadTimeMinutes = Math.round(lead);
      const tax = numeric('taxRate');
      if (tax !== undefined && tax >= 0) listing.taxRate = Number(tax);
      if (typeof b.status === 'string' && ['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(b.status)) {
        listing.status = b.status;
      }
      listing.updatedAt = new Date().toISOString();
      return { status: 200, payload: { success: true, data: listing } };
    }
    return { status: 200, payload: { success: true, data: listing } };
  }
  if (norm.startsWith('/supplier/inventory/') || norm.startsWith('/api/v1/supplier/inventory/')) {
    const rest = norm.split('/supplier/inventory/')[1]?.replace('/api/v1/', '') ?? '';
    const [invId, action] = rest.split('/');
    const item = MOCK_SUPPLIER_INVENTORY.find((row) => row.id === invId);
    if (!item) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Inventory record ${invId} does not exist in the preview dataset.` },
        },
      };
    }

    const applyStock = (after: number, transactionType: string, quantity: number, reason: string | null) => {
      const before = item.availableQuantity;
      item.availableQuantity = Math.max(0, after);
      item.sellableQuantity = Math.max(0, item.availableQuantity - item.reservedQuantity);
      item.version += 1;
      const threshold = item.lowStockThreshold ?? 0;
      item.status =
        item.availableQuantity === 0 ? 'OUT_OF_STOCK' : item.availableQuantity <= threshold ? 'LOW_STOCK' : 'IN_STOCK';
      item.updatedAt = new Date().toISOString();
      MOCK_INVENTORY_LEDGER.push({
        id: `ledger-${Date.now()}`,
        transactionType,
        quantity,
        beforeQuantity: before,
        afterQuantity: item.availableQuantity,
        reason,
        referenceType: 'MANUAL',
        referenceId: null,
        createdAt: new Date().toISOString(),
      });
      const linked = MOCK_SUPPLIER_LISTINGS.find((row) => row.id === item.listingId);
      if (linked) {
        linked.availableQuantity = item.availableQuantity;
        linked.sellableQuantity = item.sellableQuantity;
        linked.inventoryStatus = item.status;
        linked.updatedAt = item.updatedAt;
      }
    };

    if (!action) {
      return { status: 200, payload: { success: true, data: item } };
    }
    if (action === 'ledger') {
      const entries = MOCK_INVENTORY_LEDGER.slice().reverse();
      return { status: 200, payload: { success: true, data: entries } };
    }
    if (method !== 'POST') {
      return {
        status: 405,
        payload: {
          success: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: `${method} is not supported on this endpoint.` },
        },
      };
    }
    const b = (body ?? {}) as { quantityDelta?: number; availableQuantity?: number; reason?: string };
    const reason = b.reason?.trim() || null;
    if (action === 'adjust') {
      const delta = Math.trunc(Number(b.quantityDelta ?? 0));
      if (!Number.isFinite(delta) || delta === 0) {
        return {
          status: 422,
          payload: {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'quantityDelta must be a non-zero integer.' },
          },
        };
      }
      if (delta < 0 && item.availableQuantity + delta < 0) {
        return {
          status: 409,
          payload: {
            success: false,
            error: { code: 'INSUFFICIENT_STOCK', message: `Adjustment would take available stock below zero (available: ${item.availableQuantity}).` },
          },
        };
      }
      applyStock(item.availableQuantity + delta, 'MANUAL_ADJUSTMENT', delta, reason);
      return { status: 200, payload: { success: true, data: item } };
    }
    if (action === 'set') {
      const target = Math.trunc(Number(b.availableQuantity ?? NaN));
      if (!Number.isFinite(target) || target < 0) {
        return {
          status: 422,
          payload: {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'availableQuantity must be zero or a positive integer.' },
          },
        };
      }
      applyStock(target, 'STOCK_COUNT', target - item.availableQuantity, reason);
      return { status: 200, payload: { success: true, data: item } };
    }
    return {
      status: 404,
      payload: {
        success: false,
        error: { code: 'NOT_FOUND', message: `Unknown inventory action "${action}".` },
      },
    };
  }
  if (norm === '/supplier/inventory' || norm === '/api/v1/supplier/inventory') {
    const status = query.status;
    let rows = MOCK_SUPPLIER_INVENTORY;
    if (status && status !== 'ALL') {
      rows = rows.filter((row) => row.status === status);
    }
    if (query.lowStockOnly === 'true') {
      rows = rows.filter((row) => row.status === 'LOW_STOCK' || row.status === 'OUT_OF_STOCK');
    }
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '8', 10);
    const start = (page - 1) * pageSize;
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          items: rows.slice(start, start + pageSize),
          pagination: { page, pageSize, totalItems: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
        },
      },
    };
  }

  if (norm === '/admin/applications/summary' || norm === '/api/v1/admin/applications/summary') {
    const statusCounts: Record<string, number> = {};
    let total = 0;
    for (const application of mockStore.partnerApplications) {
      statusCounts[application.status] = (statusCounts[application.status] ?? 0) + 1;
      total += 1;
    }
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          statusCounts,
          total,
          awaitingReview: String((statusCounts.NEW ?? 0) + (statusCounts.IN_REVIEW ?? 0)),
        },
      },
    };
  }
  if (norm === '/admin/applications' || norm === '/api/v1/admin/applications') {
    let rows = mockStore.partnerApplications;
    if (query.status && query.status !== 'ALL') {
      rows = rows.filter((row) => row.status === query.status);
    }
    if (query.applicationType) {
      rows = rows.filter((row) => row.applicationType === query.applicationType);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.applicantName.toLowerCase().includes(needle) ||
          row.businessName.toLowerCase().includes(needle) ||
          row.reference.toLowerCase().includes(needle) ||
          row.city.toLowerCase().includes(needle),
      );
    }
    return { status: 200, payload: { success: true, data: rows } };
  }
  if (norm.startsWith('/admin/applications/') || norm.startsWith('/api/v1/admin/applications/')) {
    const aid = norm.split('/admin/applications/')[1]?.replace('/api/v1/', '') ?? '';
    const application = mockStore.partnerApplications.find((row) => row.id === aid || row.reference === aid);
    if (!application) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Application ${aid} does not exist in the preview dataset.` },
        },
      };
    }
    if (method === 'PATCH') {
      const b = (body ?? {}) as { status?: string; reviewNotes?: string };
      const allowedStatuses = ['NEW', 'CONTACTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE'];
      if (!b.status || !allowedStatuses.includes(b.status)) {
        return {
          status: 422,
          payload: {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: `status must be one of ${allowedStatuses.join(', ')}.` },
          },
        };
      }
      application.status = b.status as PartnerApplicationStatus;
      application.reviewNotes = b.reviewNotes?.trim() || application.reviewNotes;
      application.reviewedAt = new Date().toISOString();
      application.updatedAt = application.reviewedAt;
      return { status: 200, payload: { success: true, data: application } };
    }
    return { status: 200, payload: { success: true, data: application } };
  }

  if (norm === '/admin/payments' || norm === '/api/v1/admin/payments') {
    let rows = mockStore.payments;
    if (query.status && query.status !== 'ALL') {
      rows = rows.filter((row) => row.status === query.status);
    }
    if (query.q) {
      const needle = query.q.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.orderNumber.toLowerCase().includes(needle) ||
          (row.providerReference ?? '').toLowerCase().includes(needle) ||
          (row.buyerName ?? '').toLowerCase().includes(needle),
      );
    }
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '25', 10);
    const start = (page - 1) * pageSize;
    const list: AdminPaymentList = {
      payments: rows.slice(start, start + pageSize),
      pagination: {
        page,
        pageSize,
        totalItems: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
      },
    };
    return { status: 200, payload: { success: true, data: list } };
  }
  if (norm.startsWith('/admin/payments/') || norm.startsWith('/api/v1/admin/payments/')) {
    const pid = norm.split('/admin/payments/')[1]?.replace('/api/v1/', '') ?? '';
    const row = mockStore.payments.find((p) => p.id === pid);
    if (!row) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Payment ${pid} does not exist in the preview dataset.` },
        },
      };
    }
    const detail: AdminPaymentDetail = {
      payment: { ...row, updatedAt: row.lastReconciledAt ?? row.createdAt },
      attempts: [
        {
          id: `attempt-${row.id}-1`,
          attemptNumber: 1,
          gateway: row.gateway,
          status: row.status,
          amount: row.amount,
          providerReference: row.providerReference,
          failureCode: row.failureCode,
          failureMessage: row.failureMessage,
          createdAt: row.createdAt,
          updatedAt: row.paidAt ?? row.createdAt,
        },
      ],
      refunds: MOCK_PAYMENT_REFUNDS[row.id] ?? [],
      webhookEvents: MOCK_PAYMENT_WEBHOOKS[row.id] ?? [],
    };
    return { status: 200, payload: { success: true, data: detail } };
  }
  if (
    (norm.startsWith('/payments/') || norm.startsWith('/api/v1/payments/')) &&
    (norm.endsWith('/retry') || norm.endsWith('/refund'))
  ) {
    const parts = norm.replace('/api/v1/payments/', '').replace('/payments/', '').split('/');
    const pid = parts[0];
    const action = parts[1];
    const row = mockStore.payments.find((p) => p.id === pid);
    const order = mockStore.orders.find((o) => o.payment?.id === pid);
    if (!row && !order?.payment) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Payment ${pid} does not exist in the preview dataset.` },
        },
      };
    }

    if (action === 'retry') {
      if (method !== 'POST') {
        return {
          status: 405,
          payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } },
        };
      }
      const target = row ?? null;
      const status = target?.status ?? order!.payment!.status;
      if (status === 'CAPTURED' || status === 'REFUNDED') {
        return {
          status: 409,
          payload: {
            success: false,
            error: { code: 'PAYMENT_NOT_RETRIABLE', message: `A ${status.toLowerCase()} payment cannot be retried.` },
          },
        };
      }
      mockAttemptCounter += 1;
      const attemptNumber = mockAttemptCounter;
      const providerReference = `razorpay_mock_retry_${attemptNumber}`;
      if (target) {
        target.status = 'PENDING';
        target.providerReference = providerReference;
        target.failureCode = null;
        target.failureMessage = null;
      }
      if (order?.payment) {
        order.payment.status = 'PENDING';
        order.payment.providerReference = providerReference;
        order.paymentStatus = 'PENDING';
      }
      const intent = {
        paymentId: pid,
        orderId: target?.orderId ?? order!.id,
        orderNumber: target?.orderNumber ?? order!.orderNumber,
        status: 'PENDING',
        amount: target?.amount ?? order!.payment!.amount,
        currency: target?.currency ?? order!.payment!.currency ?? 'INR',
        method: target?.method ?? order!.payment!.method,
        gateway: target?.gateway ?? order!.payment!.gateway,
        attemptNumber,
        providerReference,
        providerPayload: {},
      };
      return { status: 200, payload: { success: true, data: intent } };
    }

    if (action === 'refund') {
      if (method !== 'POST') {
        return {
          status: 405,
          payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } },
        };
      }
      if (!row) {
        return {
          status: 404,
          payload: {
            success: false,
            error: { code: 'NOT_FOUND', message: `Refunds are only supported on back-office payments in the preview.` },
          },
        };
      }
      if (row.status !== 'CAPTURED') {
        return {
          status: 409,
          payload: {
            success: false,
            error: { code: 'PAYMENT_NOT_REFUNDABLE', message: `Only captured payments can be refunded (current: ${row.status}).` },
          },
        };
      }
      const b = (body ?? {}) as { amount?: string | number; reason?: string };
      const requested = b.amount === undefined || b.amount === '' ? row.refundableAmount : Number(b.amount);
      if (!Number.isFinite(requested) || requested <= 0) {
        return {
          status: 422,
          payload: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Refund amount must be positive.' } },
        };
      }
      if (requested > row.refundableAmount) {
        return {
          status: 409,
          payload: {
            success: false,
            error: { code: 'REFUND_EXCEEDS_LIMIT', message: `Refund exceeds the refundable amount (${row.refundableAmount}).` },
          },
        };
      }
      const now = new Date().toISOString();
      const record: PaymentRefundRecord = {
        id: `ref-${Date.now()}`,
        amount: Math.round(requested),
        currency: row.currency,
        status: 'PROCESSED',
        reason: b.reason?.trim() || null,
        gatewayRefundReference: `rfnd_mock_${Date.now()}`,
        requestedBy: 'admin-1',
        failureReason: null,
        processedAt: now,
        createdAt: now,
      };
      MOCK_PAYMENT_REFUNDS[row.id] = [...(MOCK_PAYMENT_REFUNDS[row.id] ?? []), record];
      row.refundedAmount += record.amount;
      row.refundableAmount = Math.max(0, row.amount - row.refundedAmount);
      if (row.refundableAmount === 0) row.status = 'REFUNDED';
      const result = {
        refundId: record.id,
        paymentId: row.id,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        amount: record.amount,
        currency: record.currency,
        status: record.status,
        providerRefundReference: record.gatewayRefundReference,
        message: 'Refund processed through the mock gateway. Settlement follows the gateway timeline.',
      };
      return { status: 200, payload: { success: true, data: result } };
    }
  }
  if (norm.startsWith('/dev/payments/') || norm.startsWith('/api/v1/dev/payments/')) {
    const pid = norm.split('/dev/payments/')[1]?.replace('/api/v1/', '').replace('/mock-webhook', '') ?? '';
    if (!norm.endsWith('/mock-webhook')) {
      return {
        status: 404,
        payload: { success: false, error: { code: 'NOT_FOUND', message: 'Unknown development endpoint.' } },
      };
    }
    if (method !== 'POST') {
      return {
        status: 405,
        payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } },
      };
    }
    const row = mockStore.payments.find((p) => p.id === pid);
    const order = mockStore.orders.find((o) => o.payment?.id === pid);
    if (!row && !order?.payment) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Payment ${pid} does not exist in the preview dataset.` },
        },
      };
    }
    const outcome = ((body ?? {}) as { outcome?: string }).outcome ?? 'PAID';
    const current = row?.status ?? order!.payment!.status;
    const applied = (outcome === 'PAID' && current === 'PENDING') || (outcome === 'FAILED' && current === 'PENDING');
    const eventId = `evt_mock_${Date.now()}`;
    const eventType = outcome === 'PAID' ? 'payment.captured' : 'payment.failed';
    const now = new Date().toISOString();
    const nextStatus = !applied ? current : outcome === 'PAID' ? 'CAPTURED' : 'FAILED';
    if (applied) {
      if (row) {
        row.status = nextStatus;
        if (outcome === 'PAID') row.paidAt = now;
        if (outcome === 'FAILED') {
          row.failureCode = 'GATEWAY_DECLINED';
          row.failureMessage = 'Simulated gateway decline (preview).';
        }
      }
      if (order?.payment) {
        order.payment.status = nextStatus;
        if (outcome === 'PAID') order.payment.paidAt = now;
        if (outcome === 'FAILED') {
          order.payment.failureCode = 'GATEWAY_DECLINED';
          order.payment.failureMessage = 'Simulated gateway decline (preview).';
        }
        order.paymentStatus = nextStatus;
      }
    }
    const event: PaymentWebhookEvent = {
      id: `we-${Date.now()}`,
      externalEventId: eventId,
      eventType,
      signatureValid: true,
      processingStatus: applied ? 'PROCESSED' : current === nextStatus ? 'DUPLICATE' : 'IGNORED',
      processingAttempts: 1,
      processingError: null,
      receivedAt: now,
      processedAt: applied ? now : null,
    };
    const owner = row?.id ?? order!.payment!.id;
    MOCK_PAYMENT_WEBHOOKS[owner] = [...(MOCK_PAYMENT_WEBHOOKS[owner] ?? []), event];
    const webhookOutcome = {
      status: applied ? 'PROCESSED' : current === nextStatus ? 'DUPLICATE' : 'IGNORED',
      eventId,
      eventType,
      paymentId: owner,
      applied,
      simulatedOutcome: outcome,
      paymentStatus: nextStatus,
    };
    return { status: 200, payload: { success: true, data: webhookOutcome } };
  }

  if (norm === '/notifications' || norm === '/api/v1/notifications') {
    let rows = MOCK_NOTIFICATIONS;
    if (query.unreadOnly === 'true') {
      rows = rows.filter((row) => !row.read);
    }
    const unreadCount = MOCK_NOTIFICATIONS.filter((row) => !row.read).length;
    const pageSize = parseInt(query.pageSize || '20', 10);
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          items: rows,
          pagination: {
            page: parseInt(query.page || '1', 10),
            pageSize,
            totalItems: rows.length,
            totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
          },
          meta: { unreadCount },
        },
      },
    };
  }
  if (norm.startsWith('/notifications/') || norm.startsWith('/api/v1/notifications/')) {
    const rest = norm.split('/notifications/')[1]?.replace('/api/v1/', '') ?? '';
    if (rest === 'read-all') {
      if (method !== 'POST') {
        return {
          status: 405,
          payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } },
        };
      }
      MOCK_NOTIFICATIONS.forEach((row) => {
        row.read = true;
        if (row.status === 'DELIVERED') row.status = 'READ';
      });
      return { status: 200, payload: { success: true, data: { updated: MOCK_NOTIFICATIONS.length } } };
    }
    const nid = rest.replace('/read', '');
    const notification = MOCK_NOTIFICATIONS.find((row) => row.id === nid);
    if (!notification) {
      return {
        status: 404,
        payload: {
          success: false,
          error: { code: 'NOT_FOUND', message: `Notification ${nid} does not exist in the preview dataset.` },
        },
      };
    }
    if (rest.endsWith('/read')) {
      if (method !== 'PATCH') {
        return {
          status: 405,
          payload: { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use PATCH.' } },
        };
      }
      notification.read = true;
      if (notification.status === 'DELIVERED') notification.status = 'READ';
      return { status: 200, payload: { success: true, data: notification } };
    }
    return { status: 200, payload: { success: true, data: notification } };
  }
  if (norm === '/notification-preferences' || norm === '/api/v1/notification-preferences') {
    if (method === 'PATCH' || method === 'PUT') {
      const b = (body ?? {}) as { eventType?: string; channel?: string; enabled?: boolean };
      const pref = MOCK_NOTIFICATION_PREFERENCES.find(
        (row) => row.eventType === b.eventType && row.channel === b.channel,
      );
      if (!pref) {
        return {
          status: 404,
          payload: {
            success: false,
            error: { code: 'NOT_FOUND', message: 'No such preference row in the preview dataset.' },
          },
        };
      }
      if (typeof b.enabled === 'boolean') pref.enabled = b.enabled;
      return { status: 200, payload: { success: true, data: MOCK_NOTIFICATION_PREFERENCES } };
    }
    return { status: 200, payload: { success: true, data: MOCK_NOTIFICATION_PREFERENCES } };
  }

  // Anything unmocked fails loudly instead of pretending to succeed: a silent `{}` here used to
  // make console buttons "work" while changing nothing.
  return {
    status: 404,
    payload: {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED_IN_PREVIEW',
        message: `${method} ${norm} is not available in the in-memory preview.`,
      },
    },
  };
}
