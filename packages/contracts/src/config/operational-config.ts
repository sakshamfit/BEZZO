/**
 * Operational configuration keys.
 *
 * BEZZO policy values that operations must be able to change without a deployment
 * (feature flags / remote configuration spec). Values live in the `configurations` table and are
 * read through the server-side configuration service with a safe default fallback.
 */

export interface ConfigDefinition<T = unknown> {
  key: string;
  description: string;
  defaultValue: T;
  /** Value type used for validation when admins write the configuration. */
  type: 'string' | 'number' | 'boolean' | 'json';
  /** Never expose to non-admin clients. */
  sensitive?: boolean;
}

export const CONFIG_KEYS = {
  // Pickup operations
  PICKER_OFFER_TIMEOUT_SECONDS: 'picker.offer_timeout_seconds',
  PICKER_ASSIGNMENT_RADIUS_KM: 'picker.assignment_radius_km',
  PICKER_HEARTBEAT_STALE_SECONDS: 'picker.heartbeat_stale_seconds',
  PICKER_DEFAULT_CAPACITY_PACKAGES: 'picker.default_capacity_packages',
  PICKER_GEOFENCE_RADIUS_METERS: 'picker.geofence_radius_meters',
  PICKER_ALLOW_PARALLEL_OFFERS: 'picker.allow_parallel_offers',
  PICKER_PARALLEL_OFFER_COUNT: 'picker.parallel_offer_count',
  PICKER_MAX_ACTIVE_TASKS: 'picker.max_active_tasks',
  PICKUP_TASK_LEAD_TIME_MINUTES: 'pickup.task_lead_time_minutes',
  PICKUP_RUN_MAX_STOPS: 'pickup.run_max_stops',
  PICKUP_RUN_MAX_PACKAGES: 'pickup.run_max_packages',
  PICKUP_RUN_MAX_ROUTE_MINUTES: 'pickup.run_max_route_minutes',
  PICKUP_WINDOW_COMPATIBILITY_MINUTES: 'pickup.window_compatibility_minutes',
  PICKUP_SLA_RISK_THRESHOLD_MINUTES: 'pickup.sla_risk_threshold_minutes',
  PICKUP_SHORT_PICK_THRESHOLD_PERCENT: 'pickup.short_pick_threshold_percent',
  HUB_RECEIVING_REQUIRE_ALL_PACKAGES: 'hub.receiving_require_all_packages',
  HUB_RECEIVING_DISCREPANCY_INCIDENT_THRESHOLD: 'hub.receiving_discrepancy_incident_threshold',

  // Marketplace / commercial
  MARKETPLACE_COMMISSION_PERCENT: 'marketplace.commission_percent',
  DEFAULT_DELIVERY_FEE: 'delivery.default_fee',
  INSTANT_DELIVERY_FEE: 'delivery.instant_fee',
  INSTANT_DELIVERY_ENABLED: 'delivery.instant_enabled',
  INSTANT_DELIVERY_CUTOFF_HOUR: 'delivery.instant_cutoff_hour',
  FREE_DELIVERY_THRESHOLD: 'delivery.free_threshold',
  MINIMUM_ORDER_VALUE: 'order.minimum_value',
  MAXIMUM_CART_LINES: 'cart.max_lines',
  MAXIMUM_ITEM_QUANTITY: 'cart.max_item_quantity',
  RESERVATION_TTL_SECONDS: 'inventory.reservation_ttl_seconds',
  LOW_STOCK_DEFAULT_THRESHOLD: 'inventory.low_stock_default_threshold',
  ALLOW_ORDERS_WHEN_SUPPLIER_UNVERIFIED: 'supplier.allow_orders_when_unverified',

  // Compliance / regulatory (jurisdiction dependent — see ADR-0006)
  REQUIRE_PRESCRIPTION_CLASSIFICATION: 'compliance.require_prescription_classification',
  BLOCK_ORDERS_WITH_EXPIRED_SUPPLIER_LICENCE: 'compliance.block_orders_expired_supplier_licence',
  BLOCK_ORDERS_WITH_EXPIRED_BUYER_LICENCE: 'compliance.block_orders_expired_buyer_licence',
  SUPPLIER_LICENCE_EXPIRY_WARNING_DAYS: 'compliance.supplier_licence_expiry_warning_days',
  RESTRICTED_PRODUCT_REQUIRES_ADMIN_APPROVAL: 'compliance.restricted_product_admin_approval',
  REQUIRE_BUYER_VERIFICATION_TO_ORDER: 'compliance.require_buyer_verification_to_order',
  CONTROLLED_SUBSTANCE_MARKETPLACE_ENABLED: 'compliance.controlled_substance_marketplace_enabled',

  // Payments
  ENABLED_PAYMENT_METHODS: 'payments.enabled_methods',
  COD_ENABLED: 'payments.cod_enabled',
  COD_MAX_ORDER_VALUE: 'payments.cod_max_order_value',
  PAYMENT_RECONCILIATION_LOOKBACK_HOURS: 'payments.reconciliation_lookback_hours',

  // Notifications
  NOTIFICATIONS_ENABLED: 'notifications.enabled',
  PICKER_NOTIFY_ON_TASK: 'notifications.picker_on_task',

  // Search
  SEARCH_PROVIDER: 'search.provider',
  SEARCH_FALLBACK_ENABLED: 'search.fallback_enabled',
} as const;

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];

export const CONFIG_DEFINITIONS: readonly ConfigDefinition[] = [
  {
    key: CONFIG_KEYS.PICKER_OFFER_TIMEOUT_SECONDS,
    description: 'Seconds a picker has to accept an offered pickup task before it expires.',
    defaultValue: 20,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKER_ASSIGNMENT_RADIUS_KM,
    description: 'Maximum picker-to-supplier distance considered by the assignment engine.',
    defaultValue: 12,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKER_HEARTBEAT_STALE_SECONDS,
    description: 'Heartbeat age after which a picker is treated as STALE and receives no new offers.',
    defaultValue: 120,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKER_DEFAULT_CAPACITY_PACKAGES,
    description: 'Default package capacity for a picker without an explicit override.',
    defaultValue: 20,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKER_GEOFENCE_RADIUS_METERS,
    description: 'Radius used to surface the arrival prompt near a supplier location.',
    defaultValue: 250,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKER_ALLOW_PARALLEL_OFFERS,
    description: 'Whether high-priority tasks may be offered to several pickers at once.',
    defaultValue: false,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.PICKER_PARALLEL_OFFER_COUNT,
    description: 'Number of simultaneous offers when parallel offering is enabled.',
    defaultValue: 3,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKER_MAX_ACTIVE_TASKS,
    description: 'Maximum concurrently assigned (not completed) pickup tasks per picker.',
    defaultValue: 1,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKUP_TASK_LEAD_TIME_MINUTES,
    description: 'How long before the pickup window a task becomes eligible for offering.',
    defaultValue: 30,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKUP_RUN_MAX_STOPS,
    description: 'Maximum stops grouped into a single pickup run.',
    defaultValue: 5,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKUP_RUN_MAX_PACKAGES,
    description: 'Maximum total packages grouped into a single pickup run.',
    defaultValue: 60,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKUP_RUN_MAX_ROUTE_MINUTES,
    description: 'Maximum estimated route duration for a pickup run.',
    defaultValue: 90,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKUP_WINDOW_COMPATIBILITY_MINUTES,
    description: 'Overlap required between two pickup windows to be grouped in one run.',
    defaultValue: 30,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKUP_SLA_RISK_THRESHOLD_MINUTES,
    description: 'Minutes before pickup window end at which a task becomes at-risk.',
    defaultValue: 20,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PICKUP_SHORT_PICK_THRESHOLD_PERCENT,
    description: 'Collected percentage below which a pickup is reported as a failed pickup instead of partial.',
    defaultValue: 10,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.HUB_RECEIVING_REQUIRE_ALL_PACKAGES,
    description: 'Whether hub handover completion requires a fully balanced reconciliation.',
    defaultValue: false,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.HUB_RECEIVING_DISCREPANCY_INCIDENT_THRESHOLD,
    description: 'Discrepancy count that raises a hub receiving incident.',
    defaultValue: 0,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.MARKETPLACE_COMMISSION_PERCENT,
    description: 'Default marketplace commission applied to supplier settlements.',
    defaultValue: 8,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.DEFAULT_DELIVERY_FEE,
    description: 'Default scheduled delivery fee.',
    defaultValue: 49,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.INSTANT_DELIVERY_FEE,
    description: 'Surcharge applied to instant delivery.',
    defaultValue: 99,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.INSTANT_DELIVERY_ENABLED,
    description: 'Master switch for instant delivery.',
    defaultValue: true,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.INSTANT_DELIVERY_CUTOFF_HOUR,
    description: 'Local hour after which instant delivery is not offered.',
    defaultValue: 20,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.FREE_DELIVERY_THRESHOLD,
    description: 'Order subtotal at which delivery fee is waived (0 disables).',
    defaultValue: 5000,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.MINIMUM_ORDER_VALUE,
    description: 'Minimum order subtotal accepted at checkout.',
    defaultValue: 0,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.MAXIMUM_CART_LINES,
    description: 'Maximum distinct listings in a cart.',
    defaultValue: 100,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.MAXIMUM_ITEM_QUANTITY,
    description: 'Maximum quantity per cart line.',
    defaultValue: 1000,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.RESERVATION_TTL_SECONDS,
    description: 'Lifetime of an inventory reservation before automatic release.',
    defaultValue: 900,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.LOW_STOCK_DEFAULT_THRESHOLD,
    description: 'Default low stock threshold for new listings.',
    defaultValue: 10,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.ALLOW_ORDERS_WHEN_SUPPLIER_UNVERIFIED,
    description: 'Whether unverified suppliers may receive orders (must remain false in production).',
    defaultValue: false,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.REQUIRE_PRESCRIPTION_CLASSIFICATION,
    description: 'Whether products must carry a prescription classification before publication.',
    defaultValue: true,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.BLOCK_ORDERS_WITH_EXPIRED_SUPPLIER_LICENCE,
    description: 'Blocks checkout when a supplier licence document has expired.',
    defaultValue: true,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.BLOCK_ORDERS_WITH_EXPIRED_BUYER_LICENCE,
    description: 'Blocks checkout when the buyer licence document has expired.',
    defaultValue: true,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.SUPPLIER_LICENCE_EXPIRY_WARNING_DAYS,
    description: 'Lead time for licence expiry warnings in the supplier and admin dashboards.',
    defaultValue: 30,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.RESTRICTED_PRODUCT_REQUIRES_ADMIN_APPROVAL,
    description: 'Requires admin approval before restricted products can be listed.',
    defaultValue: true,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.REQUIRE_BUYER_VERIFICATION_TO_ORDER,
    description: 'Blocks ordering until buyer verification completes.',
    defaultValue: true,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.CONTROLLED_SUBSTANCE_MARKETPLACE_ENABLED,
    description:
      'Master switch for controlled/narcotic schedule products. Requires jurisdiction-specific legal validation before enabling.',
    defaultValue: false,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.ENABLED_PAYMENT_METHODS,
    description: 'Payment methods offered at checkout.',
    defaultValue: ['UPI', 'CARD', 'NET_BANKING', 'WALLET'],
    type: 'json',
  },
  { key: CONFIG_KEYS.COD_ENABLED, description: 'Whether cash on delivery is offered.', defaultValue: false, type: 'boolean' },
  {
    key: CONFIG_KEYS.COD_MAX_ORDER_VALUE,
    description: 'Maximum order value permitted for cash on delivery.',
    defaultValue: 10000,
    type: 'number',
  },
  {
    key: CONFIG_KEYS.PAYMENT_RECONCILIATION_LOOKBACK_HOURS,
    description: 'Lookback window for the payment reconciliation worker.',
    defaultValue: 48,
    type: 'number',
  },
  { key: CONFIG_KEYS.NOTIFICATIONS_ENABLED, description: 'Master notification switch.', defaultValue: true, type: 'boolean' },
  {
    key: CONFIG_KEYS.PICKER_NOTIFY_ON_TASK,
    description: 'Push a picker when a task offer is created.',
    defaultValue: true,
    type: 'boolean',
  },
  {
    key: CONFIG_KEYS.SEARCH_PROVIDER,
    description: 'Search provider: opensearch or postgres-fallback.',
    defaultValue: 'postgres-fallback',
    type: 'string',
  },
  {
    key: CONFIG_KEYS.SEARCH_FALLBACK_ENABLED,
    description: 'Allow degraded database-backed search when OpenSearch is unavailable.',
    defaultValue: true,
    type: 'boolean',
  },
];

export const DEFAULT_CONFIGURATION: Readonly<Record<string, unknown>> = Object.freeze(
  CONFIG_DEFINITIONS.reduce<Record<string, unknown>>((acc, definition) => {
    acc[definition.key] = definition.defaultValue;
    return acc;
  }, {}),
);
