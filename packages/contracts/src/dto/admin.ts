/**
 * Admin / backoffice contracts.
 * Source: Bezzo_admin_operations_and_backoffice_spec_v1.0_final.md,
 *         Bezzo_api_implementation_endpoint_by_endpoint_engineering_spec_v1.0.md §41–§43.
 */
import type {
  BuyerStatus,
  DocumentStatus,
  DocumentType,
  OrderStatus,
  PaymentStatus,
  UserStatus,
  VerificationStatus,
} from '../domain/enums';

export interface PaginatedResponse<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface AdminQueueItem {
  entityType: 'SUPPLIER' | 'BUYER' | 'PRODUCT' | 'DOCUMENT' | 'DISPUTE' | 'PICKUP_EXCEPTION';
  entityId: string;
  title: string;
  subtitle: string | null;
  status: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  slaDueAt: string | null;
  ageMinutes: number;
  assignedTo: string | null;
  createdAt: string;
}

export interface AdminUserListItem {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roles: string[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserDetail extends AdminUserListItem {
  organization: { id: string; type: string; name: string } | null;
  buyerId: string | null;
  supplierId: string | null;
  pickerId: string | null;
  statusHistory: Array<{ fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string }>;
  sessions: Array<{ id: string; deviceName: string | null; lastSeenAt: string; createdAt: string }>;
}

export interface AdminSupplierListItem {
  id: string;
  legalName: string;
  displayName: string;
  gstin: string | null;
  entityStatus: string;
  verificationStatus: VerificationStatus;
  ownerUserId: string;
  documentCount: number;
  pendingDocumentCount: number;
  activeListingCount: number;
  createdAt: string;
}

export interface AdminSupplierDetail extends AdminSupplierListItem {
  businessType: string | null;
  pan: string | null;
  pickupAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceAreas: Array<{ id: string; city: string; state: string; postalCode: string }>;
  documents: Array<{
    id: string;
    documentType: DocumentType;
    documentNumber: string | null;
    status: DocumentStatus;
    expiresAt: string | null;
    rejectionReason: string | null;
    downloadUrl: string | null;
  }>;
  verificationHistory: Array<{
    decision: string;
    reason: string | null;
    reviewerUserId: string | null;
    createdAt: string;
  }>;
}

export interface AdminBuyerListItem {
  id: string;
  businessName: string;
  storeName: string;
  gstin: string | null;
  licenseReference: string | null;
  status: BuyerStatus;
  verificationStatus: VerificationStatus;
  orderCount: number;
  createdAt: string;
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  buyerName: string;
  supplierCount: number;
  grandTotal: string;
  currency: string;
  placedAt: string | null;
  createdAt: string;
}

export interface AdminPaymentListItem {
  id: string;
  orderNumber: string;
  provider: string;
  paymentMethod: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminAuditEvent {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string | null;
  reason: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
}

export interface VerificationDecisionRequest {
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'SUSPEND';
  reason?: string;
  checklist?: Record<string, boolean>;
}

export interface DocumentReviewRequest {
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}

export interface ModerationDecisionRequest {
  decision: 'APPROVE' | 'REJECT' | 'BLOCK';
  reason?: string;
}

export interface ConfigEntry {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AnalyticsOverviewResponse {
  range: { from: string; to: string };
  gmv: { value: string; currency: string; previousPeriodChangePercent: number | null };
  orders: { total: number; fulfilled: number; cancelled: number; averageOrderValue: string };
  buyers: { active: number; new: number; repeatRate: number };
  suppliers: { active: number; readyOnTimePercent: number | null; averagePreparationMinutes: number | null };
  pickup: {
    tasksCompleted: number;
    averageAssignmentLatencyMs: number | null;
    averagePickupDurationMinutes: number | null;
    averageHandoverMinutes: number | null;
    partialPickupRate: number;
    failedPickupRate: number;
    missingPackageRate: number;
  };
  delivery: { delivered: number; averageDeliveryMinutes: number | null; failureRate: number };
  payments: { captured: string; failureRate: number; pending: number };
  topProducts: Array<{ productId: string; name: string; unitsSold: number; revenue: string }>;
  topSuppliers: Array<{ supplierId: string; name: string; ordersFulfilled: number; readyOnTimePercent: number }>;
  search: { totalSearches: number; zeroResultRate: number; topQueries: Array<{ query: string; count: number }> };
}
