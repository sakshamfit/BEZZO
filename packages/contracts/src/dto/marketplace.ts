/**
 * Buyer, supplier, catalog, inventory, cart, checkout and order contracts.
 * Source: Bezzo_api_implementation_endpoint_by_endpoint_engineering_spec_v1.0.md §14–§34,
 *         Bezzo_database_schema_entity_relationship_implementation_spec_v1.0.md §11–§41.
 */
import type {
  BuyerStatus,
  CartStatus,
  DeliveryMode,
  DeliveryStatus,
  DocumentStatus,
  DocumentType,
  FulfillmentStatus,
  InventoryStatus,
  ListingStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentMethodType,
  PaymentProvider,
  PaymentStatus,
  PrescriptionClassification,
  ProductStatus,
  VerificationStatus,
} from '../domain/enums';

/* ------------------------------------------------------------------------------------------------
 * Buyer
 * ---------------------------------------------------------------------------------------------- */
export interface BuyerProfileResponse {
  id: string;
  userId: string;
  businessName: string;
  storeName: string;
  businessType: string | null;
  gstin: string | null;
  licenseReference: string | null;
  status: BuyerStatus;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateBuyerProfileRequest {
  businessName?: string;
  storeName?: string;
  businessType?: string;
  gstin?: string;
  licenseReference?: string;
}

export interface AddressInput {
  label: string;
  contactName: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

export interface AddressResponse extends AddressInput {
  id: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------------------------------------
 * Supplier
 * ---------------------------------------------------------------------------------------------- */
export interface SupplierApplicationRequest {
  legalName: string;
  displayName: string;
  businessType?: string;
  gstin?: string;
  pan?: string;
  registeredAddress?: string;
  warehouseAddress?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  /** Service areas this supplier will serve (drives assignment & eligibility). */
  serviceAreas?: Array<{ postalCode: string; city: string; state: string }>;
}

export interface SupplierProfileResponse {
  id: string;
  userId: string;
  legalName: string;
  displayName: string;
  businessType: string | null;
  gstin: string | null;
  status: string;
  verificationStatus: VerificationStatus;
  entityStatus: string;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupAddress: string | null;
  operatingHours: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierDocumentResponse {
  id: string;
  documentType: DocumentType;
  documentNumber: string | null;
  status: DocumentStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  /** Never a raw object key — a short-lived signed URL is issued on demand. */
  downloadUrl: string | null;
  createdAt: string;
}

export interface CreateDocumentRequest {
  documentType: DocumentType;
  documentNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  fileName: string;
  contentType: string;
  /** base64 payload for the dev/local storage driver; S3 multipart in production. */
  contentBase64: string;
}

/* ------------------------------------------------------------------------------------------------
 * Catalog
 * ---------------------------------------------------------------------------------------------- */
export interface CategoryResponse {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  status: string;
  childrenCount?: number;
}

export interface ManufacturerResponse {
  id: string;
  name: string;
  status: string;
}

export interface DosageFormResponse {
  id: string;
  name: string;
  code: string;
}

export interface CompositionEntry {
  ingredientName: string;
  strength: string | null;
  unit: string | null;
  sequence: number;
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  genericName: string | null;
  manufacturerName: string | null;
  strength: string | null;
  packSize: string | null;
  dosageForm: string | null;
  prescriptionClassification: PrescriptionClassification;
  status: ProductStatus;
  imageUrl: string | null;
  /** Best available offer for discovery surfaces (server-computed). */
  bestPrice: string | null;
  bestMrp: string | null;
  supplierCount: number;
  inStock: boolean;
}

export interface ProductDetailResponse extends ProductSummary {
  compositionSummary: string | null;
  compositions: CompositionEntry[];
  storageRequirements: string | null;
  description: string | null;
  category: { id: string; name: string; slug: string } | null;
  images: Array<{ id: string; imageType: string; url: string | null; altText: string | null }>;
  identifiers: Array<{ id: string; identifierType: string; identifierValue: string }>;
  listings: SupplierListingSummary[];
}

export interface SupplierListingSummary {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierSku: string | null;
  sellingPrice: string;
  mrpReference: string | null;
  taxRate: string | null;
  minimumOrderQuantity: number;
  status: ListingStatus;
  inventoryStatus: InventoryStatus | null;
  sellableQuantity: number;
  leadTimeMinutes: number | null;
  serviceable: boolean;
}

export interface CreateProductRequest {
  categoryId: string;
  manufacturerId?: string | null;
  dosageFormId?: string | null;
  name: string;
  genericName?: string | null;
  compositionSummary?: string | null;
  strength?: string | null;
  packSize?: string | null;
  packUnit?: string | null;
  prescriptionClassification?: PrescriptionClassification;
  storageRequirements?: string | null;
  description?: string | null;
  compositions?: CompositionEntry[];
  identifiers?: Array<{ identifierType: string; identifierValue: string }>;
}

export interface CreateListingRequest {
  productId: string;
  supplierSku?: string;
  sellingPrice: number;
  mrpReference?: number;
  taxRate?: number;
  minimumOrderQuantity?: number;
  leadTimeMinutes?: number;
  initialStock?: number;
  batchNumber?: string;
  expiryDate?: string;
  lowStockThreshold?: number;
}

export interface UpdateListingRequest {
  supplierSku?: string;
  sellingPrice?: number;
  mrpReference?: number;
  taxRate?: number;
  minimumOrderQuantity?: number;
  leadTimeMinutes?: number;
  status?: ListingStatus;
}

export interface InventoryResponse {
  id: string;
  supplierListingId: string;
  productId: string;
  productName: string;
  supplierSku: string | null;
  availableQuantity: number;
  reservedQuantity: number;
  sellableQuantity: number;
  damagedQuantity: number;
  expiredQuantity: number;
  blockedQuantity: number;
  lowStockThreshold: number | null;
  status: InventoryStatus;
  batchNumber: string | null;
  expiryDate: string | null;
  version: number;
  updatedAt: string;
}

export interface UpdateInventoryRequest {
  /** Absolute stock-in quantity adjustment (delta) recorded in the inventory ledger. */
  quantityDelta?: number;
  reason?: string;
  lowStockThreshold?: number;
  batchNumber?: string;
  expiryDate?: string;
  status?: InventoryStatus;
}

export interface ReserveInventoryRequest {
  orderId: string;
  orderItemId: string;
  listingId: string;
  quantity: number;
  ttlSeconds?: number;
}

export interface ReservationResponse {
  id: string;
  inventoryId: string;
  listingId: string;
  orderId: string;
  orderItemId: string;
  quantity: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

/* ------------------------------------------------------------------------------------------------
 * Cart / checkout
 * ---------------------------------------------------------------------------------------------- */
export interface CartItemResponse {
  id: string;
  listingId: string;
  productId: string;
  productName: string;
  manufacturerName: string | null;
  supplierId: string;
  supplierName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  availableQuantity: number;
  imageUrl: string | null;
  serviceable: boolean;
  issue: string | null;
}

export interface CartResponse {
  id: string;
  status: CartStatus;
  currency: string;
  items: CartItemResponse[];
  subtotal: string;
  itemCount: number;
  supplierCount: number;
  issues: string[];
}

export interface AddCartItemRequest {
  listingId: string;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

export interface CheckoutQuoteRequest {
  addressId: string;
  deliveryMode: DeliveryMode;
  deliveryDate?: string;
  deliverySlotId?: string;
  paymentMethod?: PaymentMethodType;
  couponCode?: string;
}

export interface CheckoutIssue {
  code: string;
  message: string;
  listingId?: string;
}

export interface FulfillmentQuote {
  supplierId: string;
  supplierName: string;
  itemCount: number;
  subtotal: string;
  deliveryFee: string;
  taxAmount: string;
  total: string;
}

export interface CheckoutQuoteResponse {
  checkoutId: string;
  currency: string;
  items: CartItemResponse[];
  fulfillments: FulfillmentQuote[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  deliveryFee: string;
  grandTotal: string;
  deliveryMode: DeliveryMode;
  deliveryDate: string | null;
  deliverySlotId: string | null;
  instantDeliveryAvailable: boolean;
  expiresAt: string;
  issues: CheckoutIssue[];
}

export interface PlaceOrderRequest {
  checkoutId: string;
  addressId: string;
  paymentMethod: PaymentMethodType;
}

/* ------------------------------------------------------------------------------------------------
 * Orders
 * ---------------------------------------------------------------------------------------------- */
export interface OrderItemResponse {
  id: string;
  productId: string;
  listingId: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  manufacturerSnapshot: string | null;
  packSizeSnapshot: string | null;
  unitPrice: string;
  mrpSnapshot: string | null;
  quantity: number;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  status: OrderItemStatus;
}

export interface FulfillmentResponse {
  id: string;
  fulfillmentReference: string;
  supplierId: string;
  supplierName: string;
  status: FulfillmentStatus;
  subtotal: string;
  taxTotal: string;
  total: string;
  packageCount: number;
  readyAt: string | null;
  pickupTaskId: string | null;
  pickupTaskStatus: string | null;
}

export interface OrderSummaryResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryMode: DeliveryMode;
  grandTotal: string;
  currency: string;
  itemCount: number;
  supplierCount: number;
  placedAt: string | null;
  createdAt: string;
  /** Retailer-facing, unified progress across fulfillments. */
  progress: OrderProgressStep[];
}

export interface OrderProgressStep {
  key:
    | 'PLACED'
    | 'CONFIRMED'
    | 'PREPARING'
    | 'READY_FOR_PICKUP'
    | 'COLLECTED'
    | 'AT_HUB'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED';
  label: string;
  completed: boolean;
  completedAt: string | null;
}

export interface OrderDetailResponse extends OrderSummaryResponse {
  items: OrderItemResponse[];
  fulfillments: FulfillmentResponse[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  deliveryFee: string;
  shippingAddressSnapshot: Record<string, unknown> | null;
  payment: PaymentSummaryResponse | null;
  delivery: DeliveryResponse | null;
  timeline: Array<{
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    actorType: string;
    createdAt: string;
  }>;
}

export interface OrderTrackingResponse {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  progress: OrderProgressStep[];
  fulfillments: FulfillmentResponse[];
  delivery: DeliveryResponse | null;
}

/* ------------------------------------------------------------------------------------------------
 * Payments / deliveries
 * ---------------------------------------------------------------------------------------------- */
export interface PaymentSummaryResponse {
  id: string;
  provider: PaymentProvider;
  paymentMethod: PaymentMethodType;
  status: PaymentStatus;
  amount: string;
  currency: string;
  providerReference: string | null;
  paidAt: string | null;
}

export interface PaymentIntentResponse {
  paymentId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: string;
  currency: string;
  /** Provider-hosted checkout parameters (gateway specific, opaque to the domain). */
  providerPayload: Record<string, unknown> | null;
  /** Mock/sandbox environments only: how a client can simulate provider confirmation. */
  sandboxConfirmation: { endpoint: string; body: Record<string, unknown> } | null;
}

export interface DeliveryResponse {
  id: string;
  orderId: string | null;
  fulfillmentId: string | null;
  provider: string;
  status: DeliveryStatus;
  deliveryMode: DeliveryMode;
  providerReference: string | null;
  trackingUrl: string | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  events: Array<{
    eventType: string;
    providerStatus: string | null;
    description: string | null;
    occurredAt: string;
  }>;
}

export interface DeliverySlotResponse {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Dashboard payloads
 * ---------------------------------------------------------------------------------------------- */
export interface SupplierDashboardResponse {
  supplierId: string;
  verificationStatus: VerificationStatus;
  counts: {
    activeListings: number;
    outOfStockListings: number;
    pendingFulfillments: number;
    readyForPickup: number;
    inTransit: number;
    deliveredThisMonth: number;
  };
  revenue: { today: string; last7Days: string; last30Days: string; currency: string };
  pendingPickups: Array<{
    fulfillmentId: string;
    fulfillmentReference: string;
    packageCount: number;
    pickupWindowStart: string | null;
    pickupWindowEnd: string | null;
    pickupTaskStatus: string | null;
    pickerName: string | null;
  }>;
  lowStock: Array<{ listingId: string; productName: string; sellableQuantity: number }>;
}

export interface AdminDashboardResponse {
  generatedAt: string;
  users: { total: number; buyers: number; suppliers: number; pickers: number };
  onboarding: { suppliersUnderReview: number; buyersUnderReview: number; documentsExpiringSoon: number };
  orders: { today: number; pendingPayment: number; processing: number; fulfilled: number; cancelled: number };
  gmv: { today: string; last7Days: string; last30Days: string; currency: string };
  pickupOperations: {
    availableTasks: number;
    unassigned: number;
    activePickups: number;
    atRisk: number;
    atSupplier: number;
    atHub: number;
    exceptionsOpen: number;
    partialPickups: number;
    failedPickups: number;
  };
  hub: { receivingInProgress: number; packagesReceivedToday: number; discrepanciesOpen: number };
  payments: { captured30Days: string; failed30Days: number; pending: number };
  alerts: Array<{ level: 'INFO' | 'WARNING' | 'CRITICAL'; code: string; message: string; count: number }>;
}
