-- +goose NO TRANSACTION
-- +goose Up
-- RFC-012 reporting indexes (goose 0013). Adds paid_at because RFC-008 orders lacked that column.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ NULL;
UPDATE orders SET paid_at = updated_at WHERE status IN ('PAID', 'REFUNDED') AND paid_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_organizer_paid_idx ON orders (event_id, paid_at DESC, id DESC) WHERE status = 'PAID';
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_admin_status_updated_idx ON orders (status, updated_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS order_items_order_ticket_type_idx ON order_items (order_id, ticket_type_id) INCLUDE (quantity, unit_price_rupiah);
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_admin_status_updated_idx ON payments (status, updated_at DESC, id DESC) INCLUDE (order_id, provider, external_reference);
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_external_reference_search_idx ON payments (lower(external_reference));
CREATE INDEX CONCURRENTLY IF NOT EXISTS tickets_event_status_issued_idx ON tickets (event_id, status, issued_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tickets_order_item_idx ON tickets (order_item_id, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS check_in_attempts_event_result_time_idx ON check_in_attempts (event_id, result, attempted_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS refunds_admin_status_updated_idx ON refunds (status, updated_at DESC, id DESC) INCLUDE (order_id, amount_rupiah);
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_admin_username_search_idx ON users (lower(username), id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_admin_email_search_idx ON users (lower(email), id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS organizer_profiles_admin_name_search_idx ON organizer_profiles (lower(name), id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS events_admin_title_search_idx ON events (lower(title), id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_buyer_paid_history_idx ON orders (buyer_user_id, paid_at DESC, event_id) WHERE status = 'PAID';
CREATE INDEX CONCURRENTLY IF NOT EXISTS events_recommendation_candidate_idx ON events (status, starts_at ASC, id ASC) INCLUDE (category, city, province, organizer_profile_id, slug, title);

ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments', 'ticket-qr',
    'checkin-qr', 'checkin-manual', 'checkin-invalid',
    'report-dashboard', 'report-export', 'recommendation'
  ));

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS events_recommendation_candidate_idx;
DROP INDEX CONCURRENTLY IF EXISTS orders_buyer_paid_history_idx;
DROP INDEX CONCURRENTLY IF EXISTS events_admin_title_search_idx;
DROP INDEX CONCURRENTLY IF EXISTS organizer_profiles_admin_name_search_idx;
DROP INDEX CONCURRENTLY IF EXISTS users_admin_email_search_idx;
DROP INDEX CONCURRENTLY IF EXISTS users_admin_username_search_idx;
DROP INDEX CONCURRENTLY IF EXISTS refunds_admin_status_updated_idx;
DROP INDEX CONCURRENTLY IF EXISTS check_in_attempts_event_result_time_idx;
DROP INDEX CONCURRENTLY IF EXISTS tickets_order_item_idx;
DROP INDEX CONCURRENTLY IF EXISTS tickets_event_status_issued_idx;
DROP INDEX CONCURRENTLY IF EXISTS payments_external_reference_search_idx;
DROP INDEX CONCURRENTLY IF EXISTS payments_admin_status_updated_idx;
DROP INDEX CONCURRENTLY IF EXISTS order_items_order_ticket_type_idx;
DROP INDEX CONCURRENTLY IF EXISTS orders_admin_status_updated_idx;
DROP INDEX CONCURRENTLY IF EXISTS orders_organizer_paid_idx;
ALTER TABLE orders DROP COLUMN IF EXISTS paid_at;
ALTER TABLE auth_rate_limits DROP CONSTRAINT IF EXISTS auth_rate_limits_scope_chk;
ALTER TABLE auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_scope_chk
  CHECK (scope IN (
    'register', 'login', 'oauth', 'analytics', 'organizer', 'event', 'ai', 'staff',
    'catalog', 'catalog-search', 'catalog-filters', 'catalog-detail', 'catalog-ai-min', 'catalog-ai-day',
    'checkout-summary', 'create-order', 'create-payment', 'webhook-payments', 'ticket-qr',
    'checkin-qr', 'checkin-manual', 'checkin-invalid'
  ));
