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
  OrderDetail,
  OrderSummary,
  PartnerApplication,
  ProductDetail,
  ProductSuggestion,
  ProductSummary,
  SecurityOverview,
  StaffSession,
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
  environment: 'development',
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
    const cat = query.category;
    const presc = query.prescriptionClassification;

    let filtered = MOCK_PRODUCTS.map((p) => p.summary);
    if (q) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.genericName?.toLowerCase() || '').includes(q) ||
          (p.brandName?.toLowerCase() || '').includes(q),
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

    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '12', 10);
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      status: 200,
      payload: {
        success: true,
        data: items,
        meta: {
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
      const { listingId, quantity = 1 } = (body ?? {}) as { listingId?: string; quantity?: number };
      let foundOffer: { offer: SupplierOffer; product: MockProductData } | null = null;
      for (const prod of MOCK_PRODUCTS) {
        for (const off of prod.detail.offers) {
          if (off.listingId === listingId) {
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
    const orderId = norm.replace('/api/v1/orders/', '').replace('/orders/', '');
    const found = mockStore.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (found) {
      return { status: 200, payload: { success: true, data: found } };
    }
    return { status: 200, payload: { success: true, data: mockStore.orders[0] ?? null } };
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
  if (norm === '/buyer/documents' || norm === '/api/v1/buyer/documents') {
    return { status: 200, payload: { success: true, data: MOCK_BUYER_DOCUMENTS } };
  }
  if (norm === '/me/sessions' || norm === '/api/v1/me/sessions') {
    return { status: 200, payload: { success: true, data: MOCK_STAFF_SESSIONS } };
  }
  if (norm === '/me/security' || norm === '/api/v1/me/security') {
    return { status: 200, payload: { success: true, data: MOCK_SECURITY_OVERVIEW } };
  }

  // 8. Supplier portal
  if (norm === '/supplier/profile' || norm === '/api/v1/supplier/profile') {
    return { status: 200, payload: { success: true, data: MOCK_SUPPLIER_PROFILE } };
  }
  if (norm.startsWith('/supplier/listings') || norm.startsWith('/api/v1/supplier/listings')) {
    const listings: SupplierListing[] = [
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
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          items: listings,
          pagination: { page: 1, pageSize: 8, totalItems: listings.length, totalPages: 1 },
        },
      },
    };
  }
  if (norm.startsWith('/supplier/inventory') || norm.startsWith('/api/v1/supplier/inventory')) {
    const items: SupplierInventoryItem[] = [
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
    return {
      status: 200,
      payload: {
        success: true,
        data: {
          items,
          pagination: { page: 1, pageSize: 8, totalItems: items.length, totalPages: 1 },
        },
      },
    };
  }

  // 9. Admin operations
  if (norm.startsWith('/admin/applications') || norm.startsWith('/api/v1/admin/applications')) {
    if (norm.includes('summary')) {
      return {
        status: 200,
        payload: {
          success: true,
          data: {
            statusCounts: { IN_REVIEW: 1, APPROVED: 1 },
            total: mockStore.partnerApplications.length,
            awaitingReview: '1',
            whatsappNumber: '+91 90000 00000',
          },
        },
      };
    }
    return { status: 200, payload: { success: true, data: mockStore.partnerApplications } };
  }

  if (norm.startsWith('/admin/payments') || norm.startsWith('/api/v1/admin/payments')) {
    const list: AdminPaymentList = {
      payments: mockStore.payments,
      pagination: {
        page: 1,
        pageSize: 25,
        totalItems: mockStore.payments.length,
        totalPages: 1,
      },
    };
    return { status: 200, payload: { success: true, data: list } };
  }

  if (norm === '/notifications' || norm === '/api/v1/notifications') {
    return {
      status: 200,
      payload: {
        success: true,
        data: [
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
        ],
        meta: { unreadCount: 1 },
      },
    };
  }

  // Default catch-all response
  return {
    status: 200,
    payload: {
      success: true,
      data: {},
    },
  };
}
