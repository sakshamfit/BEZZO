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

/* --------------------------------------------------------------- applications */

export type PartnerApplicationType = 'SUPPLIER' | 'PICKER' | 'RETAILER' | 'PARTNER';

export type PartnerApplicationStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'DUPLICATE';

/**
 * A partner application as returned by `POST /applications`.
 *
 * `whatsappUrl` is a `wa.me` deep link whose message already contains the reference and the submitted
 * details; `routedToDisplay` is the operations line the application was routed to. Nothing here implies
 * the message was delivered — the applicant sends it from their own WhatsApp.
 */
export interface PartnerApplication {
  id: string;
  reference: string;
  applicationType: PartnerApplicationType;
  status: PartnerApplicationStatus;
  applicantName: string;
  businessName: string;
  contactPhone: string;
  contactEmail: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  gstin: string | null;
  licenceReference: string | null;
  yearsInBusiness: number | null;
  monthlyVolume: string | null;
  message: string | null;
  routedToNumber: string;
  routedToDisplay: string;
  whatsappUrl: string;
  deliveryChannel: string;
  source: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /applications/routing` — where applications are delivered. */
export interface ApplicationRouting {
  whatsappNumber: string;
  whatsappNumberRaw: string;
  whatsappUrl: string;
  channel: string;
}

/** `GET /admin/applications/summary` — queue counters for the operations header. */
export type ApplicationStatusCounts = Partial<Record<PartnerApplicationStatus, number>>;

/* ---------------------------------------------------------------- checkout & orders */

export interface DeliverySlot {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
}

/** A priced basket line as the server sees it: prices are never computed in the browser. */
export interface CheckoutLine {
  supplierProductId: string;
  productId: string;
  productName: string;
  manufacturerName: string | null;
  packSize: string | null;
  supplierId: string;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  mrpReference: number | null;
  taxRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  sellableQuantity: number;
  issue: string | null;
}

export interface CheckoutIssue {
  code: string;
  message: string;
  supplierProductId?: string;
}

export interface CheckoutQuote {
  placeable: boolean;
  currency: string;
  deliveryMode: string;
  deliveryFee: number;
  deliveryFeeBreakdown: { base: number; instantSurcharge: number; currency: string };
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  itemCount: number;
  cartId: string;
  supplierCount: number;
  deliveryAddress: BuyerAddress | null;
  issues: CheckoutIssue[];
  lines: CheckoutLine[];
  quotedAt: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  deliveryFee: number;
  grandTotal: number;
  deliveryMode: string;
  deliveryDate: string | null;
  placedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  itemCount: number;
  unitCount: number;
  supplierCount: number;
  fulfillmentStatuses: string[];
}

export interface OrderItem {
  id: string;
  productId: string;
  supplierProductId: string;
  supplierId: string;
  supplierName: string | null;
  productName: string;
  manufacturerName: string | null;
  composition: string | null;
  packSize: string | null;
  unitPrice: number;
  mrpReference: number | null;
  taxRate: number | null;
  quantity: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  status: string;
}

export interface OrderFulfillment {
  id: string;
  fulfillmentReference: string;
  supplierId: string;
  supplierName: string | null;
  status: string;
  subtotal: number;
  taxTotal: number;
  deliveryAllocation: number;
  total: number;
  packageCount: number;
  itemCount: number;
  unitCount: number;
  acceptedAt: string | null;
  packedAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

export interface OrderPayment {
  id: string;
  gateway: string;
  status: string;
  amount: number;
  currency: string;
  method: string;
  providerReference: string | null;
  providerOrderReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: string | null;
  refundedAmount: number;
  providerPayload?: Record<string, unknown> | null;
  failure?: { code: string; message: string } | null;
}

export interface OrderTimelineEntry {
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  actorType: string;
  createdAt: string;
}

export interface OrderAddressSnapshot {
  id?: string;
  label?: string | null;
  contactName?: string;
  contactPhone?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  capturedAt?: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  deliveryFee: number;
  grandTotal: number;
  deliveryMode: string;
  deliveryDate: string | null;
  shippingAddress: OrderAddressSnapshot;
  buyerNote: string | null;
  placedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  checkoutSessionId: string | null;
  itemCount: number;
  supplierCount: number;
  items: OrderItem[];
  fulfillments: OrderFulfillment[];
  payment: OrderPayment | null;
  activeReservations: number;
  reservationCount: number;
  timeline: OrderTimelineEntry[];
  cancellation?: { orderNumber: string; releasedLines: number; releasedUnits: number };
}

/* ------------------------------------------------------------------------------------------------
 * Payments (Phase 6)
 *
 * The buyer sees a payment; an operator sees the whole trail behind it — attempts, refunds and the
 * webhook evidence log. `refundableAmount` is computed by the API (captured minus already refunded) so
 * the screen never does money arithmetic of its own.
 * ---------------------------------------------------------------------------------------------- */

export interface OrderRefund {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  gatewayRefundReference: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface PaymentRetryIntent {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  amount: number;
  currency: string;
  method: string;
  gateway: string;
  attemptNumber: number;
  providerReference: string | null;
  /** What the gateway hands to its own client SDK; empty for the mock provider. */
  providerPayload: Record<string, unknown> | null;
}

export interface PaymentRefundResult {
  refundId: string;
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  status: string;
  providerRefundReference: string | null;
  message: string;
}

/** What `POST /dev/payments/:id/mock-webhook` answers: the production webhook outcome, echoed back. */
export interface MockWebhookOutcome {
  status: 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'REJECTED' | 'UNMATCHED';
  eventId: string;
  eventType: string;
  paymentId: string | null;
  applied: boolean;
  simulatedOutcome?: string;
  paymentStatus?: string;
}

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  buyerId: string;
  buyerName: string | null;
  gateway: string;
  providerReference: string | null;
  method: string;
  status: string;
  amount: number;
  refundedAmount: number;
  refundableAmount: number;
  currency: string;
  failureCode: string | null;
  failureMessage: string | null;
  lastReconciledAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminPaymentList {
  payments: AdminPaymentRow[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface PaymentAttempt {
  id: string;
  attemptNumber: number;
  gateway: string;
  status: string;
  amount: number;
  providerReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRefundRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  reason: string | null;
  gatewayRefundReference: string | null;
  requestedBy: string | null;
  failureReason: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface PaymentWebhookEvent {
  id: string;
  externalEventId: string;
  eventType: string;
  signatureValid: boolean;
  processingStatus: string;
  processingAttempts: number;
  processingError: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface AdminPaymentDetail {
  payment: AdminPaymentRow & { updatedAt: string };
  attempts: PaymentAttempt[];
  refunds: PaymentRefundRecord[];
  webhookEvents: PaymentWebhookEvent[];
}
