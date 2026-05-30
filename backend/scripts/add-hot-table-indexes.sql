-- Phase-0 performance indexes for the hot tables.
--
-- WHY: Order/OrderItem/KOT/KOTItem/Payment/StockTransaction/MenuItem/Table had
-- ZERO indexes on the columns every query filters by (outlet_id, status,
-- created_at, foreign keys). Every KDS poll, order list and report was a full
-- table scan — the scalability wall at ~100K+ rows.
--
-- HOW TO APPLY (production-safe, NO table lock):
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so run this
--   file statement-by-statement, NOT wrapped in BEGIN/COMMIT.
--     psql "$DATABASE_URL" -f backend/scripts/add-hot-table-indexes.sql
--   (Supabase SQL editor: paste and run; it executes each statement separately.)
--
-- These mirror the @@index entries added to prisma/schema.prisma, so a future
-- `prisma db push`/`migrate` will see them as already-present (no-op).

-- orders --------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_outlet_id_status_idx        ON orders (outlet_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_outlet_id_created_at_idx    ON orders (outlet_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_outlet_id_is_paid_idx       ON orders (outlet_id, is_paid);
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_table_id_idx                ON orders (table_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_id_idx             ON orders (customer_id);

-- order_items ---------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS order_items_order_id_idx           ON order_items (order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS order_items_menu_item_id_idx       ON order_items (menu_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS order_items_kot_id_idx             ON order_items (kot_id);

-- kot -----------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS kot_outlet_id_status_idx           ON kot (outlet_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS kot_order_id_idx                   ON kot (order_id);

-- kot_items -----------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS kot_items_kot_id_idx               ON kot_items (kot_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS kot_items_order_item_id_idx        ON kot_items (order_item_id);

-- payments ------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_outlet_id_created_at_idx  ON payments (outlet_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_order_id_idx              ON payments (order_id);

-- stock_transactions --------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS stock_tx_outlet_id_created_at_idx  ON stock_transactions (outlet_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS stock_tx_reference_idx             ON stock_transactions (reference_type, reference_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS stock_tx_inventory_item_id_idx     ON stock_transactions (inventory_item_id);

-- menu_items ----------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS menu_items_outlet_available_idx    ON menu_items (outlet_id, is_available);
CREATE INDEX CONCURRENTLY IF NOT EXISTS menu_items_category_id_idx         ON menu_items (category_id);

-- tables --------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS tables_outlet_id_status_idx        ON tables (outlet_id, status);
