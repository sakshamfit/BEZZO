/**
 * BEZZO state machines.
 *
 * Single source of truth for allowed transitions. The API services call `assertTransition` before
 * persisting, so a client can never move an entity into an unsupported state
 * (Bezzo_business_rules_state_machine_spec_v1.0.md §3, API spec §2.5).
 *
 * These are pure functions — trivially unit-testable and shared with clients for UI gating
 * (clients may hide actions, but the server always re-validates).
 */
import {
  BuyerStatus,
  CartStatus,
  CheckoutStatus,
  DeliveryStatus,
  FulfillmentStatus,
  HubReceivingStatus,
  OrderStatus,
  PackageStatus,
  PaymentStatus,
  PickupRunStatus,
  PickupTaskStatus,
  ProductStatus,
  ReservationStatus,
  UserStatus,
  VerificationStatus,
} from './enums';

export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export const USER_STATUS_TRANSITIONS: TransitionMap<UserStatus> = {
  PENDING: [UserStatus.ACTIVE, UserStatus.LOCKED, UserStatus.DEACTIVATED],
  ACTIVE: [UserStatus.RESTRICTED, UserStatus.SUSPENDED, UserStatus.LOCKED, UserStatus.DEACTIVATED],
  RESTRICTED: [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED],
  SUSPENDED: [UserStatus.ACTIVE, UserStatus.DEACTIVATED],
  LOCKED: [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED],
  DEACTIVATED: [],
};

export const VERIFICATION_STATUS_TRANSITIONS: TransitionMap<VerificationStatus> = {
  REGISTERED: [VerificationStatus.DOCUMENTS_PENDING, VerificationStatus.SUSPENDED],
  DOCUMENTS_PENDING: [VerificationStatus.UNDER_REVIEW, VerificationStatus.SUSPENDED],
  UNDER_REVIEW: [
    VerificationStatus.VERIFIED,
    VerificationStatus.REJECTED,
    VerificationStatus.DOCUMENTS_PENDING,
    VerificationStatus.SUSPENDED,
  ],
  VERIFIED: [VerificationStatus.SUSPENDED],
  REJECTED: [VerificationStatus.DOCUMENTS_PENDING, VerificationStatus.SUSPENDED],
  SUSPENDED: [VerificationStatus.VERIFIED, VerificationStatus.DOCUMENTS_PENDING],
};

export const BUYER_STATUS_TRANSITIONS: TransitionMap<BuyerStatus> = {
  PENDING_VERIFICATION: [BuyerStatus.ACTIVE, BuyerStatus.SUSPENDED, BuyerStatus.DEACTIVATED],
  ACTIVE: [BuyerStatus.RESTRICTED, BuyerStatus.SUSPENDED, BuyerStatus.DEACTIVATED],
  RESTRICTED: [BuyerStatus.ACTIVE, BuyerStatus.SUSPENDED, BuyerStatus.DEACTIVATED],
  SUSPENDED: [BuyerStatus.ACTIVE, BuyerStatus.DEACTIVATED],
  DEACTIVATED: [],
};

export const PRODUCT_STATUS_TRANSITIONS: TransitionMap<ProductStatus> = {
  DRAFT: [ProductStatus.UNDER_REVIEW, ProductStatus.ARCHIVED],
  UNDER_REVIEW: [
    ProductStatus.PUBLISHED,
    ProductStatus.DRAFT,
    ProductStatus.BLOCKED,
    ProductStatus.ARCHIVED,
  ],
  PUBLISHED: [ProductStatus.UNPUBLISHED, ProductStatus.BLOCKED, ProductStatus.ARCHIVED],
  UNPUBLISHED: [ProductStatus.PUBLISHED, ProductStatus.BLOCKED, ProductStatus.ARCHIVED],
  BLOCKED: [ProductStatus.UNPUBLISHED, ProductStatus.ARCHIVED],
  ARCHIVED: [],
};

export const RESERVATION_STATUS_TRANSITIONS: TransitionMap<ReservationStatus> = {
  ACTIVE: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.RELEASED,
    ReservationStatus.EXPIRED,
    ReservationStatus.CANCELLED,
  ],
  CONFIRMED: [],
  RELEASED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const CART_STATUS_TRANSITIONS: TransitionMap<CartStatus> = {
  ACTIVE: [CartStatus.CHECKOUT_STARTED, CartStatus.ABANDONED, CartStatus.EXPIRED],
  CHECKOUT_STARTED: [CartStatus.CONVERTED, CartStatus.ACTIVE, CartStatus.EXPIRED],
  CONVERTED: [],
  ABANDONED: [CartStatus.ACTIVE],
  EXPIRED: [],
};

export const CHECKOUT_STATUS_TRANSITIONS: TransitionMap<CheckoutStatus> = {
  STARTED: [CheckoutStatus.PRICING, CheckoutStatus.FAILED, CheckoutStatus.EXPIRED, CheckoutStatus.CANCELLED],
  PRICING: [
    CheckoutStatus.INVENTORY_CHECK,
    CheckoutStatus.FAILED,
    CheckoutStatus.EXPIRED,
    CheckoutStatus.CANCELLED,
  ],
  INVENTORY_CHECK: [
    CheckoutStatus.INVENTORY_RESERVED,
    CheckoutStatus.FAILED,
    CheckoutStatus.EXPIRED,
    CheckoutStatus.CANCELLED,
  ],
  INVENTORY_RESERVED: [
    CheckoutStatus.PAYMENT_PENDING,
    CheckoutStatus.FAILED,
    CheckoutStatus.EXPIRED,
    CheckoutStatus.CANCELLED,
  ],
  PAYMENT_PENDING: [
    CheckoutStatus.PAYMENT_CONFIRMED,
    CheckoutStatus.FAILED,
    CheckoutStatus.EXPIRED,
    CheckoutStatus.CANCELLED,
  ],
  PAYMENT_CONFIRMED: [CheckoutStatus.ORDER_CREATED, CheckoutStatus.FAILED],
  ORDER_CREATED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const ORDER_STATUS_TRANSITIONS: TransitionMap<OrderStatus> = {
  PENDING_PAYMENT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED, OrderStatus.PARTIALLY_CANCELLED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED, OrderStatus.PARTIALLY_CANCELLED],
  PROCESSING: [
    OrderStatus.PARTIALLY_FULFILLED,
    OrderStatus.FULFILLED,
    OrderStatus.PARTIALLY_CANCELLED,
    OrderStatus.CANCELLED,
  ],
  PARTIALLY_FULFILLED: [
    OrderStatus.FULFILLED,
    OrderStatus.PARTIALLY_CANCELLED,
    OrderStatus.RETURN_REQUESTED,
  ],
  FULFILLED: [OrderStatus.CLOSED, OrderStatus.RETURN_REQUESTED, OrderStatus.PARTIALLY_RETURNED],
  RETURN_REQUESTED: [OrderStatus.PARTIALLY_RETURNED, OrderStatus.RETURNED, OrderStatus.FULFILLED],
  PARTIALLY_RETURNED: [OrderStatus.RETURNED, OrderStatus.CLOSED],
  RETURNED: [OrderStatus.CLOSED],
  PARTIALLY_CANCELLED: [OrderStatus.CANCELLED, OrderStatus.FULFILLED, OrderStatus.CLOSED],
  CANCELLED: [],
  CLOSED: [],
};

export const FULFILLMENT_STATUS_TRANSITIONS: TransitionMap<FulfillmentStatus> = {
  CREATED: [FulfillmentStatus.ALLOCATING, FulfillmentStatus.CANCELLED],
  ALLOCATING: [FulfillmentStatus.ALLOCATED, FulfillmentStatus.FAILED, FulfillmentStatus.CANCELLED],
  ALLOCATED: [FulfillmentStatus.PICKING, FulfillmentStatus.FAILED, FulfillmentStatus.CANCELLED],
  PICKING: [FulfillmentStatus.PACKED, FulfillmentStatus.FAILED, FulfillmentStatus.CANCELLED],
  PACKED: [FulfillmentStatus.READY_FOR_PICKUP, FulfillmentStatus.CANCELLED],
  // Bezzo collection flow (ADR-0004): ready → offered/assigned → collected → hub → delivery
  READY_FOR_PICKUP: [
    FulfillmentStatus.PICKUP_ASSIGNED,
    FulfillmentStatus.CANCELLED,
    FulfillmentStatus.FAILED,
  ],
  READY_FOR_DISPATCH: [FulfillmentStatus.HANDED_TO_LOGISTICS, FulfillmentStatus.CANCELLED],
  PICKUP_ASSIGNED: [FulfillmentStatus.COLLECTED, FulfillmentStatus.FAILED, FulfillmentStatus.CANCELLED],
  COLLECTED: [FulfillmentStatus.AT_HUB, FulfillmentStatus.FAILED],
  AT_HUB: [FulfillmentStatus.HANDED_TO_LOGISTICS, FulfillmentStatus.FAILED],
  HANDED_TO_LOGISTICS: [FulfillmentStatus.IN_TRANSIT, FulfillmentStatus.FAILED],
  IN_TRANSIT: [FulfillmentStatus.DELIVERED, FulfillmentStatus.FAILED, FulfillmentStatus.RETURNING],
  DELIVERED: [FulfillmentStatus.RETURNING],
  FAILED: [FulfillmentStatus.PICKING, FulfillmentStatus.CANCELLED],
  CANCELLED: [],
  RETURNING: [FulfillmentStatus.RETURNED],
  RETURNED: [],
};

export const PAYMENT_STATUS_TRANSITIONS: TransitionMap<PaymentStatus> = {
  PENDING: [
    PaymentStatus.AUTHORIZED,
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  AUTHORIZED: [PaymentStatus.PAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  PAID: [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED],
  FAILED: [PaymentStatus.PENDING],
  PARTIALLY_REFUNDED: [PaymentStatus.REFUNDED],
  REFUNDED: [],
  CANCELLED: [],
};

export const DELIVERY_STATUS_TRANSITIONS: TransitionMap<DeliveryStatus> = {
  PENDING: [DeliveryStatus.QUOTED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  QUOTED: [DeliveryStatus.BOOKING, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  BOOKING: [DeliveryStatus.ASSIGNED, DeliveryStatus.FAILED, DeliveryStatus.CANCELLED],
  ASSIGNED: [DeliveryStatus.PICKUP_PENDING, DeliveryStatus.FAILED, DeliveryStatus.CANCELLED],
  PICKUP_PENDING: [DeliveryStatus.PICKED_UP, DeliveryStatus.FAILED, DeliveryStatus.CANCELLED],
  PICKED_UP: [DeliveryStatus.IN_TRANSIT, DeliveryStatus.FAILED],
  IN_TRANSIT: [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED],
  DELIVERED: [DeliveryStatus.RETURNED],
  FAILED: [DeliveryStatus.BOOKING, DeliveryStatus.CANCELLED],
  CANCELLED: [],
  RETURNED: [],
};

/**
 * Pickup task state machine — picker spec §9 (including the specified exception branches).
 */
export const PICKUP_TASK_STATUS_TRANSITIONS: TransitionMap<PickupTaskStatus> = {
  CREATED: [PickupTaskStatus.OFFERED, PickupTaskStatus.ACCEPTED, PickupTaskStatus.CANCELLED],
  OFFERED: [
    PickupTaskStatus.ACCEPTED,
    PickupTaskStatus.REJECTED,
    PickupTaskStatus.EXPIRED,
    PickupTaskStatus.CANCELLED,
  ],
  ACCEPTED: [
    PickupTaskStatus.EN_ROUTE,
    PickupTaskStatus.ARRIVED,
    PickupTaskStatus.CANCELLED,
    PickupTaskStatus.FAILED_PICKUP,
  ],
  EN_ROUTE: [
    PickupTaskStatus.ARRIVED,
    PickupTaskStatus.FAILED_PICKUP,
    PickupTaskStatus.CANCELLED,
    PickupTaskStatus.EXPIRED,
  ],
  ARRIVED: [
    PickupTaskStatus.COLLECTING,
    PickupTaskStatus.FAILED_PICKUP,
    PickupTaskStatus.CANCELLED,
  ],
  COLLECTING: [
    PickupTaskStatus.PICKED_UP,
    PickupTaskStatus.PARTIALLY_PICKED,
    PickupTaskStatus.FAILED_PICKUP,
    PickupTaskStatus.CANCELLED,
  ],
  PICKED_UP: [PickupTaskStatus.AT_HUB, PickupTaskStatus.HANDOVER_EXCEPTION, PickupTaskStatus.FAILED_PICKUP],
  PARTIALLY_PICKED: [
    PickupTaskStatus.AT_HUB,
    PickupTaskStatus.PICKED_UP,
    PickupTaskStatus.CANCELLED,
    PickupTaskStatus.FAILED_PICKUP,
  ],
  AT_HUB: [
    PickupTaskStatus.HANDED_OVER,
    PickupTaskStatus.HANDOVER_EXCEPTION,
    PickupTaskStatus.COMPLETED,
  ],
  HANDOVER_EXCEPTION: [PickupTaskStatus.HANDED_OVER, PickupTaskStatus.COMPLETED, PickupTaskStatus.CANCELLED],
  HANDED_OVER: [PickupTaskStatus.COMPLETED],
  COMPLETED: [],
  EXPIRED: [PickupTaskStatus.OFFERED, PickupTaskStatus.CANCELLED],
  REJECTED: [PickupTaskStatus.OFFERED, PickupTaskStatus.CANCELLED],
  CANCELLED: [],
  FAILED_PICKUP: [PickupTaskStatus.CANCELLED, PickupTaskStatus.OFFERED],
};

export const PICKUP_RUN_STATUS_TRANSITIONS: TransitionMap<PickupRunStatus> = {
  DRAFT: [PickupRunStatus.PLANNED, PickupRunStatus.CANCELLED],
  PLANNED: [PickupRunStatus.OFFERED, PickupRunStatus.CANCELLED],
  OFFERED: [PickupRunStatus.ACCEPTED, PickupRunStatus.CANCELLED, PickupRunStatus.FAILED],
  ACCEPTED: [PickupRunStatus.IN_PROGRESS, PickupRunStatus.CANCELLED, PickupRunStatus.FAILED],
  IN_PROGRESS: [
    PickupRunStatus.ALL_STOPS_COLLECTED,
    PickupRunStatus.PARTIAL,
    PickupRunStatus.FAILED,
  ],
  ALL_STOPS_COLLECTED: [PickupRunStatus.EN_ROUTE_TO_HUB, PickupRunStatus.PARTIAL],
  PARTIAL: [PickupRunStatus.EN_ROUTE_TO_HUB, PickupRunStatus.COMPLETED, PickupRunStatus.FAILED],
  EN_ROUTE_TO_HUB: [PickupRunStatus.AT_HUB, PickupRunStatus.FAILED],
  AT_HUB: [PickupRunStatus.HANDED_OVER, PickupRunStatus.PARTIAL],
  HANDED_OVER: [PickupRunStatus.COMPLETED],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export const HUB_RECEIVING_STATUS_TRANSITIONS: TransitionMap<HubReceivingStatus> = {
  EXPECTED: [HubReceivingStatus.RECEIVING, HubReceivingStatus.DISPUTED],
  RECEIVING: [HubReceivingStatus.SCANNING, HubReceivingStatus.DISPUTED],
  SCANNING: [
    HubReceivingStatus.RECONCILIATION,
    HubReceivingStatus.DISPUTED,
    HubReceivingStatus.UNREADABLE,
  ],
  RECONCILIATION: [
    HubReceivingStatus.ACCEPTED,
    HubReceivingStatus.MISSING,
    HubReceivingStatus.DAMAGED,
    HubReceivingStatus.UNEXPECTED,
    HubReceivingStatus.DISPUTED,
  ],
  MISSING: [HubReceivingStatus.RECONCILIATION, HubReceivingStatus.ACCEPTED, HubReceivingStatus.DISPUTED],
  DAMAGED: [HubReceivingStatus.RECONCILIATION, HubReceivingStatus.ACCEPTED, HubReceivingStatus.DISPUTED],
  UNEXPECTED: [HubReceivingStatus.RECONCILIATION, HubReceivingStatus.ACCEPTED, HubReceivingStatus.DISPUTED],
  UNREADABLE: [HubReceivingStatus.RECONCILIATION, HubReceivingStatus.ACCEPTED, HubReceivingStatus.DISPUTED],
  DISPUTED: [HubReceivingStatus.RECONCILIATION, HubReceivingStatus.ACCEPTED],
  ACCEPTED: [],
};

export const PACKAGE_STATUS_TRANSITIONS: TransitionMap<PackageStatus> = {
  CREATED: [PackageStatus.WITH_SUPPLIER, PackageStatus.READY_FOR_PICKUP, PackageStatus.MISSING],
  WITH_SUPPLIER: [PackageStatus.READY_FOR_PICKUP, PackageStatus.MISSING, PackageStatus.DAMAGED],
  READY_FOR_PICKUP: [
    PackageStatus.PICKER_COLLECTED,
    PackageStatus.MISSING,
    PackageStatus.DAMAGED,
    PackageStatus.UNEXPECTED,
  ],
  PICKER_COLLECTED: [
    PackageStatus.PICKER_IN_TRANSIT,
    PackageStatus.DAMAGED,
    PackageStatus.MISSING,
  ],
  PICKER_IN_TRANSIT: [PackageStatus.HUB_RECEIVED, PackageStatus.DAMAGED, PackageStatus.MISSING],
  HUB_RECEIVED: [PackageStatus.READY_FOR_DELIVERY, PackageStatus.DAMAGED, PackageStatus.RETURNED],
  READY_FOR_DELIVERY: [PackageStatus.OUT_FOR_DELIVERY, PackageStatus.DAMAGED, PackageStatus.RETURNED],
  OUT_FOR_DELIVERY: [PackageStatus.DELIVERED, PackageStatus.RETURNED],
  DELIVERED: [PackageStatus.RETURNED],
  MISSING: [PackageStatus.READY_FOR_PICKUP, PackageStatus.RETURNED],
  DAMAGED: [PackageStatus.RETURNED],
  UNEXPECTED: [PackageStatus.READY_FOR_PICKUP, PackageStatus.RETURNED],
  RETURNED: [],
};

/** States from which a package has physically left the supplier and is in Bezzo custody. */
export const PACKAGE_IN_CUSTODY_STATUSES: readonly PackageStatus[] = [
  PackageStatus.PICKER_COLLECTED,
  PackageStatus.PICKER_IN_TRANSIT,
  PackageStatus.HUB_RECEIVED,
  PackageStatus.READY_FOR_DELIVERY,
];

/** Terminal pickup task states that never accept further picker actions. */
export const PICKUP_TASK_TERMINAL_STATUSES: readonly PickupTaskStatus[] = [
  PickupTaskStatus.COMPLETED,
  PickupTaskStatus.CANCELLED,
];

export function canTransition<S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S,
  options: { allowIdempotentSelf?: boolean } = {},
): boolean {
  if (from === to) {
    return options.allowIdempotentSelf === true;
  }
  const allowed = map[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export class IllegalStateTransitionError extends Error {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(
    readonly entity: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Illegal ${entity} transition: ${from} -> ${to}`);
    this.name = 'IllegalStateTransitionError';
  }
}

export function assertTransition<S extends string>(
  entity: string,
  map: TransitionMap<S>,
  from: S,
  to: S,
  options: { allowIdempotentSelf?: boolean } = {},
): void {
  if (!canTransition(map, from, to, options)) {
    throw new IllegalStateTransitionError(entity, from, to);
  }
}
