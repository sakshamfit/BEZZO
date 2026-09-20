-- 0012_performance_indexes.sql
-- Description: cross-domain indexes for the hottest operational queries, plus composite and partial
--              indexes that keep the marketplace fast at scale.
-- References: Bezzo_database_indexing_query_optimization_data_access_patterns_spec_v1.0.md,
--             Bezzo_performance_engineering_load_testing_capacity_planning_spec_v1.0.md.
--
-- Notes
--  * Every index here exists to serve a named query path listed in the comment above it.
--  * Partial indexes keep write amplification low on high-churn tables (pickup_tasks, packages).
--  * Indexes are created non-concurrently here because migrations run in a transaction on an empty or
--    maintenance window; production hot-path index additions must use a separate
--    `-- @transactional: false` migration with CREATE INDEX CONCURRENTLY.

-- Buyer order list (account page, most recent first).
CREATE INDEX orders_buyer_created_covering_idx
  ON orders (buyer_id, created_at DESC)
  INCLUDE (order_number, status, grand_total, currency);

-- Supplier fulfillment queue (supplier dashboard: what needs preparing/packing).
CREATE INDEX fulfillments_supplier_queue_idx
  ON fulfillments (supplier_id, status, ready_at)
  WHERE status IN ('ALLOCATED','PICKING','PACKED','READY_FOR_PICKUP');

-- Assignment engine hot path: claimable tasks ordered by operational priority.
CREATE INDEX pickup_tasks_assignment_idx
  ON pickup_tasks (priority DESC, pickup_window_end, created_at)
  WHERE status IN ('CREATED','OFFERED','EXPIRED','REJECTED') AND assigned_picker_id IS NULL;

-- Picker home screen: my active task.
CREATE INDEX pickup_tasks_active_picker_idx
  ON pickup_tasks (assigned_picker_id, created_at DESC)
  WHERE status IN ('ACCEPTED','EN_ROUTE','ARRIVED','COLLECTING','PICKED_UP','AT_HUB','PARTIALLY_PICKED','HANDOVER_EXCEPTION');

-- Hub receiving reconciliation: packages expected at a hub but not yet received.
CREATE INDEX pickup_packages_pending_receipt_idx
  ON pickup_packages (expected_hub_id, status)
  WHERE status IN ('PICKER_COLLECTED','PICKER_IN_TRANSIT','READY_FOR_PICKUP');

-- Inventory availability for the product listing page (sellable rows only, cold rows excluded).
CREATE INDEX inventories_sellable_idx
  ON inventories (supplier_listing_id, available_quantity, reserved_quantity)
  WHERE status = 'AVAILABLE' AND available_quantity > 0;

-- Active listings per product, ordered by price for marketplace "best offer" selection.
CREATE INDEX listings_active_by_product_price_idx
  ON supplier_product_listings (product_id, selling_price)
  WHERE status = 'ACTIVE';

-- Payment reconciliation worker scans recently updated non-terminal payments.
CREATE INDEX payments_recent_non_terminal_idx
  ON payments (updated_at)
  WHERE status IN ('PENDING','AUTHORIZED');

-- Support queue: oldest first within status/priority.
CREATE INDEX support_tickets_queue_idx
  ON support_tickets (status, priority DESC, created_at);

-- Dispute queue.
CREATE INDEX disputes_open_idx ON disputes (created_at)
  WHERE status IN ('OPEN','UNDER_REVIEW','AWAITING_EVIDENCE');

-- Notifications dispatcher: due, unsent notifications.
CREATE INDEX notifications_due_idx ON notifications (scheduled_at)
  WHERE status = 'QUEUED';

-- Analytics: GMV by business day.
CREATE INDEX orders_placed_business_day_idx ON orders (bezzo_business_date(placed_at))
  WHERE placed_at IS NOT NULL AND status NOT IN ('CANCELLED');

-- Session housekeeping: expired sessions.
CREATE INDEX sessions_expiry_idx ON sessions (expires_at) WHERE revoked_at IS NULL;

-- Idempotency housekeeping.
CREATE INDEX idempotency_keys_user_idx ON idempotency_keys (user_id, created_at DESC);

-- Audit investigation by request id (correlating one client request across services).
CREATE INDEX audit_logs_request_idx ON audit_logs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX domain_events_request_idx ON domain_events (request_id) WHERE request_id IS NOT NULL;
