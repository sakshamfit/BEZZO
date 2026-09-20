/**
 * BEZZO canonical domain vocabulary.
 *
 * Every enum in this file is derived from the Bezzo specification corpus. The source document is
 * noted above each group. Client (web/mobile) and server share these exact string values so that a
 * persisted state can never drift from what a UI renders.
 *
 * Rule (spec: Bezzo_business_rules_state_machine_spec_v1.0.md §3): state names and transition
 * semantics must remain stable across clients.
 */

/* ------------------------------------------------------------------------------------------------
 * Identity — Bezzo_identity_authentication_user_account_spec_v1.0.md §6
 * ---------------------------------------------------------------------------------------------- */
export const UserStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  RESTRICTED: 'RESTRICTED',
  SUSPENDED: 'SUSPENDED',
  LOCKED: 'LOCKED',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** Bezzo_api_implementation_endpoint_by_endpoint_engineering_spec_v1.0.md §6 (superset — ADR-0003). */
/**
 * Partner applications — the public "apply to sell / apply to pick / apply to buy" intake.
 *
 * Every submission is stored with a human-readable reference and is deliberately routed to the
 * operations WhatsApp line so a real person can follow up: the platform never pretends an automated
 * approval happened when a human review is required (compliance spec §3 — supplier and retailer
 * verification is a human gate).
 */
export const PartnerApplicationType = {
  SUPPLIER: 'SUPPLIER',
  PICKER: 'PICKER',
  RETAILER: 'RETAILER',
  PARTNER: 'PARTNER',
} as const;
export type PartnerApplicationType = (typeof PartnerApplicationType)[keyof typeof PartnerApplicationType];

export const PartnerApplicationStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DUPLICATE: 'DUPLICATE',
} as const;
export type PartnerApplicationStatus = (typeof PartnerApplicationStatus)[keyof typeof PartnerApplicationStatus];

export const RoleCode = {
  BUYER: 'BUYER',
  BUYER_OWNER: 'BUYER_OWNER',
  BUYER_STAFF: 'BUYER_STAFF',
  SUPPLIER: 'SUPPLIER',
  SUPPLIER_OWNER: 'SUPPLIER_OWNER',
  SUPPLIER_INVENTORY: 'SUPPLIER_INVENTORY',
  SUPPLIER_FINANCE: 'SUPPLIER_FINANCE',
  PICKER: 'PICKER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  OPERATIONS_AGENT: 'OPERATIONS_AGENT',
  FINANCE_AGENT: 'FINANCE_AGENT',
  COMPLIANCE_AGENT: 'COMPLIANCE_AGENT',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

/** Organization types — identity spec §8. */
export const OrganizationType = {
  BUYER_ORGANIZATION: 'BUYER_ORGANIZATION',
  SUPPLIER_ORGANIZATION: 'SUPPLIER_ORGANIZATION',
  BEZZO_ORGANIZATION: 'BEZZO_ORGANIZATION',
} as const;
export type OrganizationType = (typeof OrganizationType)[keyof typeof OrganizationType];

/** Bezzo_api_error_handling_idempotency_integration_contract_spec_v1.0.md §10.2/§10.3 */
export const Permission = {
  // Buyer
  BUYER_PROFILE_READ: 'buyer.profile.read',
  BUYER_PROFILE_WRITE: 'buyer.profile.write',
  BUYER_ORDER_READ: 'buyer.order.read',
  BUYER_ORDER_WRITE: 'buyer.order.write',
  // Supplier
  SUPPLIER_PROFILE_READ: 'supplier.profile.read',
  SUPPLIER_PROFILE_WRITE: 'supplier.profile.write',
  SUPPLIER_LISTING_WRITE: 'supplier.listing.write',
  SUPPLIER_INVENTORY_WRITE: 'supplier.inventory.write',
  SUPPLIER_FULFILLMENT_WRITE: 'supplier.fulfillment.write',
  SUPPLIER_SETTLEMENT_READ: 'supplier.settlement.read',
  // Picker operations
  PICKER_TASK_READ: 'picker.task.read',
  PICKER_TASK_EXECUTE: 'picker.task.execute',
  PICKER_PACKAGE_SCAN: 'picker.package.scan',
  PICKER_HANDOVER_EXECUTE: 'picker.handover.execute',
  // Hub
  HUB_RECEIVING_EXECUTE: 'hub.receiving.execute',
  HUB_RECEIVING_READ: 'hub.receiving.read',
  // Admin / backoffice
  ADMIN_USER_READ: 'admin.user.read',
  ADMIN_USER_WRITE: 'admin.user.write',
  ADMIN_SUPPLIER_READ: 'admin.supplier.read',
  ADMIN_SUPPLIER_VERIFY: 'admin.supplier.verify',
  ADMIN_BUYER_VERIFY: 'admin.buyer.verify',
  ADMIN_CATALOG_WRITE: 'admin.catalog.write',
  ADMIN_ORDER_READ: 'admin.order.read',
  ADMIN_ORDER_WRITE: 'admin.order.write',
  ADMIN_PAYMENT_READ: 'admin.payment.read',
  ADMIN_PAYMENT_REVIEW: 'admin.payment.review',
  ADMIN_LOGISTICS_READ: 'admin.logistics.read',
  ADMIN_LOGISTICS_WRITE: 'admin.logistics.write',
  ADMIN_PICKER_READ: 'admin.picker.read',
  ADMIN_PICKER_MANAGE: 'admin.picker.manage',
  ADMIN_HUB_MANAGE: 'admin.hub.manage',
  ADMIN_DISPUTE_READ: 'admin.dispute.read',
  ADMIN_DISPUTE_RESOLVE: 'admin.dispute.resolve',
  ADMIN_SETTLEMENT_APPROVE: 'admin.settlement.approve',
  ADMIN_AUDIT_READ: 'admin.audit.read',
  ADMIN_APPLICATION_READ: 'admin.application.read',
  ADMIN_APPLICATION_WRITE: 'admin.application.write',
  ADMIN_CONFIG_WRITE: 'admin.config.write',
  ADMIN_ANALYTICS_READ: 'admin.analytics.read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

/* ------------------------------------------------------------------------------------------------
 * Buyer — database_schema spec §11 / identity spec §6
 * ---------------------------------------------------------------------------------------------- */
export const BuyerStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  RESTRICTED: 'RESTRICTED',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type BuyerStatus = (typeof BuyerStatus)[keyof typeof BuyerStatus];

export const VerificationStatus = {
  REGISTERED: 'REGISTERED',
  DOCUMENTS_PENDING: 'DOCUMENTS_PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const DocumentType = {
  WHOLESALE_DRUG_LICENSE: 'WHOLESALE_DRUG_LICENSE',
  RETAIL_DRUG_LICENSE: 'RETAIL_DRUG_LICENSE',
  GST_CERTIFICATE: 'GST_CERTIFICATE',
  PAN: 'PAN',
  BUSINESS_REGISTRATION: 'BUSINESS_REGISTRATION',
  PREMISES_PROOF: 'PREMISES_PROOF',
  AUTHORIZED_PERSON_PROOF: 'AUTHORIZED_PERSON_PROOF',
  QUALIFIED_PERSON_DOCUMENT: 'QUALIFIED_PERSON_DOCUMENT',
  BANK_DOCUMENT: 'BANK_DOCUMENT',
  STORAGE_FACILITY_PROOF: 'STORAGE_FACILITY_PROOF',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/* ------------------------------------------------------------------------------------------------
 * Catalog — database_schema spec §18–§25
 * ---------------------------------------------------------------------------------------------- */
export const ProductStatus = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PUBLISHED: 'PUBLISHED',
  UNPUBLISHED: 'UNPUBLISHED',
  BLOCKED: 'BLOCKED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

/** Prescription handling classification. Regulatory meaning is jurisdiction-configurable (see ADR-0006). */
export const PrescriptionClassification = {
  NOT_SCHEDULED: 'NOT_SCHEDULED',
  PRESCRIPTION_REQUIRED: 'PRESCRIPTION_REQUIRED',
  CONTROLLED_SCHEDULE: 'CONTROLLED_SCHEDULE',
  NARCOTIC: 'NARCOTIC',
  OTC: 'OTC',
} as const;
export type PrescriptionClassification =
  (typeof PrescriptionClassification)[keyof typeof PrescriptionClassification];

export const ListingStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  SUSPENDED: 'SUSPENDED',
} as const;
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];

export const InventoryStatus = {
  AVAILABLE: 'AVAILABLE',
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  QUARANTINED: 'QUARANTINED',
  BLOCKED: 'BLOCKED',
  DAMAGED: 'DAMAGED',
  EXPIRED: 'EXPIRED',
  RECALLED: 'RECALLED',
  DEPLETED: 'DEPLETED',
} as const;
export type InventoryStatus = (typeof InventoryStatus)[keyof typeof InventoryStatus];

/** Inventory states that may never be allocated to an order (state machine spec §9). */
export const NON_ALLOCATABLE_INVENTORY_STATUSES: readonly InventoryStatus[] = [
  InventoryStatus.QUARANTINED,
  InventoryStatus.BLOCKED,
  InventoryStatus.DAMAGED,
  InventoryStatus.EXPIRED,
  InventoryStatus.RECALLED,
];

export const InventoryTransactionType = {
  STOCK_IN: 'STOCK_IN',
  STOCK_OUT: 'STOCK_OUT',
  RESERVATION: 'RESERVATION',
  RESERVATION_RELEASE: 'RESERVATION_RELEASE',
  RESERVATION_EXPIRY: 'RESERVATION_EXPIRY',
  SALE: 'SALE',
  RETURN: 'RETURN',
  ADJUSTMENT: 'ADJUSTMENT',
  DAMAGE: 'DAMAGE',
  EXPIRY: 'EXPIRY',
  BLOCK: 'BLOCK',
  UNBLOCK: 'UNBLOCK',
} as const;
export type InventoryTransactionType =
  (typeof InventoryTransactionType)[keyof typeof InventoryTransactionType];

export const ReservationStatus = {
  ACTIVE: 'ACTIVE',
  CONFIRMED: 'CONFIRMED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

/* ------------------------------------------------------------------------------------------------
 * Cart / Checkout / Order — state machine spec §12–§15
 * ---------------------------------------------------------------------------------------------- */
export const CartStatus = {
  ACTIVE: 'ACTIVE',
  CHECKOUT_STARTED: 'CHECKOUT_STARTED',
  CONVERTED: 'CONVERTED',
  ABANDONED: 'ABANDONED',
  EXPIRED: 'EXPIRED',
} as const;
export type CartStatus = (typeof CartStatus)[keyof typeof CartStatus];

export const CheckoutStatus = {
  STARTED: 'STARTED',
  PRICING: 'PRICING',
  INVENTORY_CHECK: 'INVENTORY_CHECK',
  INVENTORY_RESERVED: 'INVENTORY_RESERVED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  ORDER_CREATED: 'ORDER_CREATED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type CheckoutStatus = (typeof CheckoutStatus)[keyof typeof CheckoutStatus];

export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  PARTIALLY_FULFILLED: 'PARTIALLY_FULFILLED',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
  PARTIALLY_CANCELLED: 'PARTIALLY_CANCELLED',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  PARTIALLY_RETURNED: 'PARTIALLY_RETURNED',
  RETURNED: 'RETURNED',
  CLOSED: 'CLOSED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OrderItemStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  ALLOCATED: 'ALLOCATED',
  PROCESSING: 'PROCESSING',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURNED: 'RETURNED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderItemStatus = (typeof OrderItemStatus)[keyof typeof OrderItemStatus];

/**
 * Fulfillment state machine — Bezzo_business_rules_state_machine_spec_v1.0.md §16 plus the
 * `READY_FOR_PICKUP` state required by the Bezzo collection flow
 * (Bezzo_picker_collection_system_architecture_spec_v1.0.md §5/§31). See ADR-0004.
 */
export const FulfillmentStatus = {
  CREATED: 'CREATED',
  ALLOCATING: 'ALLOCATING',
  ALLOCATED: 'ALLOCATED',
  PICKING: 'PICKING',
  PACKED: 'PACKED',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  READY_FOR_DISPATCH: 'READY_FOR_DISPATCH',
  PICKUP_ASSIGNED: 'PICKUP_ASSIGNED',
  COLLECTED: 'COLLECTED',
  AT_HUB: 'AT_HUB',
  HANDED_TO_LOGISTICS: 'HANDED_TO_LOGISTICS',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  RETURNING: 'RETURNING',
  RETURNED: 'RETURNED',
} as const;
export type FulfillmentStatus = (typeof FulfillmentStatus)[keyof typeof FulfillmentStatus];

/**
 * Per-line picking state inside a fulfillment — `fulfillment_items.status` in the physical model.
 * It is deliberately a smaller vocabulary than `FulfillmentStatus`: a line is pending until the
 * supplier allocates it, then packed, collected, delivered — or short-picked when the shelf is empty.
 */
export const FulfillmentItemStatus = {
  PENDING: 'PENDING',
  ALLOCATED: 'ALLOCATED',
  PACKED: 'PACKED',
  COLLECTED: 'COLLECTED',
  DELIVERED: 'DELIVERED',
  SHORT_PICKED: 'SHORT_PICKED',
  CANCELLED: 'CANCELLED',
} as const;
export type FulfillmentItemStatus = (typeof FulfillmentItemStatus)[keyof typeof FulfillmentItemStatus];

/* ------------------------------------------------------------------------------------------------
 * Payments — state machine spec §19, payment/billing spec
 * ---------------------------------------------------------------------------------------------- */
export const PaymentStatus = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethodType = {
  UPI: 'UPI',
  CARD: 'CARD',
  NET_BANKING: 'NET_BANKING',
  WALLET: 'WALLET',
  COD: 'COD',
} as const;
export type PaymentMethodType = (typeof PaymentMethodType)[keyof typeof PaymentMethodType];

export const PaymentProvider = {
  MOCK: 'mock',
  RAZORPAY: 'razorpay',
  CASHFREE: 'cashfree',
  PAYU: 'payu',
  COD: 'cod',
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const WebhookProcessingStatus = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  DUPLICATE: 'DUPLICATE',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const;
export type WebhookProcessingStatus =
  (typeof WebhookProcessingStatus)[keyof typeof WebhookProcessingStatus];

/* ------------------------------------------------------------------------------------------------
 * Delivery / logistics — state machine spec §17–§18, logistics spec
 * ---------------------------------------------------------------------------------------------- */
export const DeliveryMode = {
  INSTANT: 'INSTANT',
  SCHEDULED: 'SCHEDULED',
} as const;
export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode];

export const DeliveryStatus = {
  PENDING: 'PENDING',
  QUOTED: 'QUOTED',
  BOOKING: 'BOOKING',
  ASSIGNED: 'ASSIGNED',
  PICKUP_PENDING: 'PICKUP_PENDING',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const LogisticsProvider = {
  MANUAL: 'manual',
  PORTER: 'porter',
  BEZZO_FLEET: 'bezzo_fleet',
} as const;
export type LogisticsProvider = (typeof LogisticsProvider)[keyof typeof LogisticsProvider];

/* ------------------------------------------------------------------------------------------------
 * Picker collection system — Bezzo_picker_collection_system_architecture_spec_v1.0.md §8–§20
 * ---------------------------------------------------------------------------------------------- */
export const PickerStatus = {
  OFFLINE: 'OFFLINE',
  AVAILABLE: 'AVAILABLE',
  OFFERED: 'OFFERED',
  BUSY: 'BUSY',
  ON_BREAK: 'ON_BREAK',
  SUSPENDED: 'SUSPENDED',
  STALE: 'STALE',
} as const;
export type PickerStatus = (typeof PickerStatus)[keyof typeof PickerStatus];

export const VehicleType = {
  MOTORCYCLE: 'MOTORCYCLE',
  SCOOTER: 'SCOOTER',
  THREE_WHEELER: 'THREE_WHEELER',
  TEMPO: 'TEMPO',
  VAN: 'VAN',
  OTHER: 'OTHER',
} as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];

export const PickupTaskStatus = {
  CREATED: 'CREATED',
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  COLLECTING: 'COLLECTING',
  PICKED_UP: 'PICKED_UP',
  AT_HUB: 'AT_HUB',
  HANDED_OVER: 'HANDED_OVER',
  COMPLETED: 'COMPLETED',
  // exception + terminal branches
  EXPIRED: 'EXPIRED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  FAILED_PICKUP: 'FAILED_PICKUP',
  PARTIALLY_PICKED: 'PARTIALLY_PICKED',
  HANDOVER_EXCEPTION: 'HANDOVER_EXCEPTION',
} as const;
export type PickupTaskStatus = (typeof PickupTaskStatus)[keyof typeof PickupTaskStatus];

export const PickupTaskPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type PickupTaskPriority = (typeof PickupTaskPriority)[keyof typeof PickupTaskPriority];

export const PickupRunStatus = {
  DRAFT: 'DRAFT',
  PLANNED: 'PLANNED',
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  ALL_STOPS_COLLECTED: 'ALL_STOPS_COLLECTED',
  EN_ROUTE_TO_HUB: 'EN_ROUTE_TO_HUB',
  AT_HUB: 'AT_HUB',
  HANDED_OVER: 'HANDED_OVER',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type PickupRunStatus = (typeof PickupRunStatus)[keyof typeof PickupRunStatus];

export const PickupStopStatus = {
  PENDING: 'PENDING',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  COLLECTING: 'COLLECTING',
  COLLECTED: 'COLLECTED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type PickupStopStatus = (typeof PickupStopStatus)[keyof typeof PickupStopStatus];

/** Physical package chain of custody — picker spec §21. `WITH_SUPPLIER` is the pre-handover state. */
export const PackageStatus = {
  CREATED: 'CREATED',
  WITH_SUPPLIER: 'WITH_SUPPLIER',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  PICKER_COLLECTED: 'PICKER_COLLECTED',
  PICKER_IN_TRANSIT: 'PICKER_IN_TRANSIT',
  HUB_RECEIVED: 'HUB_RECEIVED',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  MISSING: 'MISSING',
  DAMAGED: 'DAMAGED',
  UNEXPECTED: 'UNEXPECTED',
  RETURNED: 'RETURNED',
} as const;
export type PackageStatus = (typeof PackageStatus)[keyof typeof PackageStatus];

export const HubReceivingStatus = {
  EXPECTED: 'EXPECTED',
  RECEIVING: 'RECEIVING',
  SCANNING: 'SCANNING',
  RECONCILIATION: 'RECONCILIATION',
  ACCEPTED: 'ACCEPTED',
  MISSING: 'MISSING',
  DAMAGED: 'DAMAGED',
  UNEXPECTED: 'UNEXPECTED',
  UNREADABLE: 'UNREADABLE',
  DISPUTED: 'DISPUTED',
} as const;
export type HubReceivingStatus = (typeof HubReceivingStatus)[keyof typeof HubReceivingStatus];

/** Hub package scan results — drives reconciliation rather than raw status mutation. */
export const HubScanResult = {
  ACCEPTED: 'ACCEPTED',
  DUPLICATE: 'DUPLICATE',
  UNEXPECTED: 'UNEXPECTED',
  UNREADABLE: 'UNREADABLE',
  DAMAGED: 'DAMAGED',
  WRONG_HUB: 'WRONG_HUB',
  ALREADY_RECEIVED: 'ALREADY_RECEIVED',
} as const;
export type HubScanResult = (typeof HubScanResult)[keyof typeof HubScanResult];

/** Picker exception taxonomy — picker spec §33. */
export const PickupExceptionType = {
  SUPPLIER_CLOSED: 'SUPPLIER_CLOSED',
  SUPPLIER_NOT_READY: 'SUPPLIER_NOT_READY',
  PACKAGE_MISSING: 'PACKAGE_MISSING',
  PACKAGE_DAMAGED: 'PACKAGE_DAMAGED',
  PACKAGE_UNEXPECTED: 'PACKAGE_UNEXPECTED',
  PACKAGE_BARCODE_UNREADABLE: 'PACKAGE_BARCODE_UNREADABLE',
  WRONG_PACKAGE: 'WRONG_PACKAGE',
  PICKUP_WINDOW_MISSED: 'PICKUP_WINDOW_MISSED',
  PICKER_DELAYED: 'PICKER_DELAYED',
  VEHICLE_FAILURE: 'VEHICLE_FAILURE',
  NAVIGATION_FAILURE: 'NAVIGATION_FAILURE',
  HUB_CLOSED: 'HUB_CLOSED',
  HUB_CAPACITY_FULL: 'HUB_CAPACITY_FULL',
  HUB_RECEIVING_DISCREPANCY: 'HUB_RECEIVING_DISCREPANCY',
  TASK_CANCELLED: 'TASK_CANCELLED',
} as const;
export type PickupExceptionType = (typeof PickupExceptionType)[keyof typeof PickupExceptionType];

export const PickupExceptionStatus = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;
export type PickupExceptionStatus =
  (typeof PickupExceptionStatus)[keyof typeof PickupExceptionStatus];

/** Assignment offer outcome, recorded for operational analytics (picker spec §7). */
export const OfferOutcome = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  SUPERSEDED: 'SUPERSEDED',
  CANCELLED: 'CANCELLED',
} as const;
export type OfferOutcome = (typeof OfferOutcome)[keyof typeof OfferOutcome];

/* ------------------------------------------------------------------------------------------------
 * Cross-cutting
 * ---------------------------------------------------------------------------------------------- */
export const ActorType = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPPLIER: 'SUPPLIER',
  BUYER: 'BUYER',
  PICKER: 'PICKER',
  HUB: 'HUB',
  PROVIDER: 'PROVIDER',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const NotificationChannel = {
  PUSH: 'PUSH',
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  IN_APP: 'IN_APP',
  WHATSAPP: 'WHATSAPP',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationDeliveryStatus = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  READ: 'READ',
  DEAD_LETTER: 'DEAD_LETTER',
} as const;
export type NotificationDeliveryStatus =
  (typeof NotificationDeliveryStatus)[keyof typeof NotificationDeliveryStatus];

export const ClientPlatform = {
  WEB: 'web',
  ANDROID: 'android',
  IOS: 'ios',
  ADMIN: 'admin',
} as const;
export type ClientPlatform = (typeof ClientPlatform)[keyof typeof ClientPlatform];
