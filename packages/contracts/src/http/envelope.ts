/**
 * BEZZO HTTP envelope + domain-event contracts.
 *
 * Source: Bezzo_api_implementation_endpoint_by_endpoint_engineering_spec_v1.0.md §7–§8,
 *         Bezzo_api_error_handling_idempotency_integration_contract_spec_v1.0.md §6–§9,
 *         Bezzo_event_driven_architecture_domain_events_spec_v1.0.md.
 */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ResponseMeta {
  requestId: string;
  correlationId?: string;
  pagination?: PaginationMeta | CursorPaginationMeta;
  [key: string]: unknown;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorObject {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
  fieldErrors?: FieldError[];
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface ErrorEnvelope {
  success: false;
  error: ApiErrorObject;
  meta: ResponseMeta;
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/* ------------------------------------------------------------------------------------------------
 * Domain events
 * ---------------------------------------------------------------------------------------------- */

export const DomainEventName = {
  // identity / org
  UserRegistered: 'UserRegistered',
  UserActivated: 'UserActivated',
  UserSuspended: 'UserSuspended',
  SessionRevoked: 'SessionRevoked',
  // onboarding
  SupplierApplicationSubmitted: 'SupplierApplicationSubmitted',
  SupplierVerified: 'SupplierVerified',
  SupplierRejected: 'SupplierRejected',
  SupplierSuspended: 'SupplierSuspended',
  BuyerVerified: 'BuyerVerified',
  BuyerSuspended: 'BuyerSuspended',
  DocumentUploaded: 'DocumentUploaded',
  DocumentReviewed: 'DocumentReviewed',
  // catalog / inventory
  ProductCreated: 'ProductCreated',
  ProductPublished: 'ProductPublished',
  ProductBlocked: 'ProductBlocked',
  ListingCreated: 'ListingCreated',
  ListingPriceChanged: 'ListingPriceChanged',
  InventoryUpdated: 'InventoryUpdated',
  InventoryReserved: 'InventoryReserved',
  InventoryReservationReleased: 'InventoryReservationReleased',
  InventoryReservationExpired: 'InventoryReservationExpired',
  InventoryLowStock: 'InventoryLowStock',
  // cart / checkout / order
  CartItemAdded: 'CartItemAdded',
  CheckoutStarted: 'CheckoutStarted',
  CheckoutValidated: 'CheckoutValidated',
  OrderCreated: 'OrderCreated',
  OrderConfirmed: 'OrderConfirmed',
  OrderCancelled: 'OrderCancelled',
  OrderFulfilled: 'OrderFulfilled',
  OrderDelivered: 'OrderDelivered',
  // fulfillment
  FulfillmentCreated: 'FulfillmentCreated',
  FulfillmentAccepted: 'FulfillmentAccepted',
  FulfillmentRejected: 'FulfillmentRejected',
  FulfillmentPacked: 'FulfillmentPacked',
  FulfillmentReadyForPickup: 'FulfillmentReadyForPickup',
  FulfillmentCollected: 'FulfillmentCollected',
  FulfillmentAtHub: 'FulfillmentAtHub',
  // pickup / picker
  PickupTaskCreated: 'PickupTaskCreated',
  PickupTaskOffered: 'PickupTaskOffered',
  PickupTaskAccepted: 'PickupTaskAccepted',
  PickupTaskRejected: 'PickupTaskRejected',
  PickupTaskExpired: 'PickupTaskExpired',
  PickerArrivedAtSupplier: 'PickerArrivedAtSupplier',
  PickupCollectionStarted: 'PickupCollectionStarted',
  PackageCollected: 'PackageCollected',
  PickupCompleted: 'PickupCompleted',
  PickupPartiallyCompleted: 'PickupPartiallyCompleted',
  PickupFailed: 'PickupFailed',
  PickupRunCreated: 'PickupRunCreated',
  PickupRunStarted: 'PickupRunStarted',
  PickupRunCompleted: 'PickupRunCompleted',
  PickerArrivedAtHub: 'PickerArrivedAtHub',
  HubReceivingStarted: 'HubReceivingStarted',
  PackageReceivedAtHub: 'HubReceivedPackage',
  HubReceivingCompleted: 'HubReceivingCompleted',
  HubReceivingDiscrepancy: 'HubReceivingDiscrepancy',
  PickupExceptionCreated: 'PickupExceptionCreated',
  PickupExceptionResolved: 'PickupExceptionResolved',
  // payments
  PaymentInitiated: 'PaymentInitiated',
  PaymentConfirmed: 'PaymentConfirmed',
  PaymentFailed: 'PaymentFailed',
  RefundCompleted: 'RefundCompleted',
  WebhookReceived: 'WebhookReceived',
  // logistics
  DeliveryQuoted: 'DeliveryQuoted',
  DeliveryAssigned: 'DeliveryAssigned',
  DeliveryPickedUp: 'DeliveryPickedUp',
  DeliveryCompleted: 'DeliveryCompleted',
  DeliveryFailed: 'DeliveryFailed',
  // notifications / support
  NotificationQueued: 'NotificationQueued',
  NotificationSent: 'NotificationSent',
  NotificationFailed: 'NotificationFailed',
  SupportTicketCreated: 'SupportTicketCreated',
  DisputeCreated: 'DisputeCreated',
  DisputeResolved: 'DisputeResolved',
  // admin
  AuditRecordCreated: 'AuditRecordCreated',
} as const;
export type DomainEventName = (typeof DomainEventName)[keyof typeof DomainEventName];

/**
 * Canonical event envelope (event-driven architecture spec §7, analytics spec §7).
 * `eventVersion` allows contract evolution without breaking consumers.
 */
export interface DomainEventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  eventName: DomainEventName | string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  /** Business correlation identifiers used for tracing one order journey end-to-end. */
  correlation: EventCorrelation;
  actor: { type: string; id: string | null };
  payload: TPayload;
  occurredAt: string;
}

export interface EventCorrelation {
  orderId?: string | null;
  fulfillmentId?: string | null;
  pickupTaskId?: string | null;
  pickupRunId?: string | null;
  packageId?: string | null;
  hubReceivingId?: string | null;
  paymentId?: string | null;
  deliveryId?: string | null;
  requestId?: string | null;
}
