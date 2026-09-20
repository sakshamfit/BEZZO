/**
 * Response shapes consumed by the web client.
 *
 * These mirror the API contract (envelope payloads) for the endpoints the client consumes. They are
 * intentionally hand-written and narrow: the web client depends on the published contract, not on the
 * API's internal TypeScript types, so an API refactor cannot silently change what a screen renders.
 */

/** `GET /catalog/products/suggest?q=&limit=` — a flat array of lightweight suggestions. */
export interface ProductSuggestion {
  id: string;
  name: string;
  strength: string | null;
  packSize: string | null;
  manufacturerName: string | null;
}

/** One row of `GET /catalog/products` (the envelope lifts `items` and `meta.pagination`). */
export interface ProductSummary {
  id: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  manufacturerName: string | null;
  categoryId: string | null;
  dosageForm: string | null;
  strength: string | null;
  packSize: string | null;
  prescriptionClassification: string;
  supplierCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  sellableQuantity: number;
  inStock: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug?: string;
  productCount?: number;
}

export interface Manufacturer {
  id: string;
  name: string;
  productCount?: number;
}

export interface DosageForm {
  id: string;
  code: string;
  name: string;
}

export interface DeliverySlot {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
}

export interface SupplierOffer {
  listingId: string;
  supplierId: string;
  supplierName: string;
  supplierCity: string | null;
  sellingPrice: number;
  mrpReference: number | null;
  taxRate: number | null;
  minimumOrderQuantity: number;
  leadTimeMinutes: number | null;
  sellableQuantity: number;
  batchNumber: string | null;
  expiryDate: string | null;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  genericName: string | null;
  brandName: string | null;
  compositionSummary: string | null;
  strength: string | null;
  packSize: string | null;
  packUnit: string | null;
  prescriptionClassification: string;
  storageRequirements: string | null;
  description: string | null;
  category: { id: string; name: string };
  manufacturerName: string | null;
  dosageForm: string | null;
  restricted: boolean;
  offers: SupplierOffer[];
  updatedAt: string;
}

export interface CartLine {
  id: string;
  supplierProductId: string;
  productId: string;
  productName: string;
  manufacturerName: string | null;
  strength: string | null;
  packSize: string | null;
  prescriptionClassification: string;
  supplierId: string;
  supplierName: string;
  supplierCity: string | null;
  quantity: number;
  minimumOrderQuantity: number;
  sellableQuantity: number;
  unitPrice: number;
  mrpReference: number | null;
  taxRate: number | null;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  leadTimeMinutes: number | null;
  batchNumber: string | null;
  expiryDate: string | null;
  available: boolean;
  issues: string[];
  addedAt: string;
  updatedAt: string;
}

export interface Cart {
  cartId: string;
  status: string;
  currency: string;
  itemCount: number;
  unitCount: number;
  supplierCount: number;
  estimatedSubtotal: number;
  estimatedTax: number;
  estimatedTotal: number;
  hasIssues: boolean;
  issues: Array<{ code: string; message: string; itemId?: string }>;
  items: CartLine[];
  updatedAt: string;
}

export interface BuyerProfile {
  id: string;
  userId: string;
  businessName: string;
  storeName: string;
  businessType: string | null;
  gstin: string | null;
  licenseReference: string | null;
  status: string;
  verificationStatus: string;
  verifiedAt: string | null;
  creditTermsDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerAddress {
  id: string;
  label: string | null;
  contactName: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerDocument {
  id: string;
  documentType: string;
  documentNumber: string | null;
  status: string;
  issuedAt: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  downloadUrl: string | null;
  createdAt: string;
}

export interface SupplierProfile {
  id: string;
  legalName: string;
  displayName: string;
  businessType: string | null;
  status: string;
  verificationStatus: string;
  gstin: string | null;
  pan: string | null;
  pickupAddress: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  contactPhone: string | null;
  contactEmail: string | null;
  operatingHours: Record<string, string> | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  stats: { listings: number; activeListings: number; lowStockItems: number };
}

export interface SupplierListing {
  id: string;
  productId: string;
  productName: string;
  packSize: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturerName: string | null;
  prescriptionClassification: string;
  supplierSku: string | null;
  sellingPrice: number;
  mrpReference: number | null;
  taxRate: number | null;
  minimumOrderQuantity: number;
  leadTimeMinutes: number | null;
  status: string;
  inventoryId: string | null;
  availableQuantity: number;
  reservedQuantity: number;
  sellableQuantity: number;
  lowStockThreshold: number | null;
  inventoryStatus: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInventoryItem {
  id: string;
  listingId: string;
  productName: string;
  packSize: string | null;
  sellingPrice: number;
  availableQuantity: number;
  reservedQuantity: number;
  sellableQuantity: number;
  damagedQuantity: number;
  expiredQuantity: number;
  blockedQuantity: number;
  lowStockThreshold: number | null;
  status: string;
  batchNumber: string | null;
  expiryDate: string | null;
  version: number;
  updatedAt: string;
}

export interface InventoryLedgerEntry {
  id: string;
  transactionType: string;
  quantity: number;
  beforeQuantity: number;
  afterQuantity: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface StaffSession {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  authenticationMethod: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  current: boolean;
}

export interface SecurityOverview {
  lockedUntil: string | null;
  passwordUpdatedAt: string | null;
  recentEvents: Array<{
    eventType: string;
    success: boolean;
    reason: string | null;
    identifier: string | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
}

export interface NotificationPreference {
  eventType: string;
  channel: string;
  enabled: boolean;
}

export interface DeviceRegistration {
  id: string;
  deviceId: string;
  platform: string;
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  read: boolean;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface HealthSnapshot {
  status: string;
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  dependencies: Record<
    string,
    {
      status: string;
      latencyMs?: number;
      driver?: string;
      usedInMemoryFallback?: boolean;
      provider?: string;
      degraded?: boolean;
      pendingJobs?: number;
      pool?: { total: number; idle: number; waiting: number };
      error?: string;
    }
  >;
  worker?: { enabled: boolean };
  timestamp: string;
}

export interface VersionSnapshot {
  service: string;
  version: string;
  environment: string;
  apiBasePath: string;
  features: Record<string, string | boolean>;
}
