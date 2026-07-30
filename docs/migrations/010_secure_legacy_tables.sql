-- ============================================
-- SECURE THE LEGACY wishlists AND alerts TABLES
-- Run this in the Supabase SQL Editor.
-- ============================================
--
-- Both tables exist in the hosted project but were never in this repo, so
-- they were created outside the migration chain and never had row level
-- security switched on. Every other user-owned table (price_alerts,
-- size_alerts, notifications, region_alerts) enables RLS in the migration
-- that creates it; these two were missed because no migration creates them.
--
-- Verified against the live project using only the publishable key that
-- ships in the browser bundle: an anonymous caller could SELECT every row
-- of wishlists, INSERT a row naming any user_id, and DELETE it again.
-- wishlists held real user rows at the time, so this is a live exposure of
-- who is watching what, not a theoretical one.
--
-- This migration is idempotent and safe to re-run.

-- ============================================
-- WISHLISTS
-- ============================================
-- Written by frontend/lib/wishlist-context.tsx. Codified here so a fresh
-- deployment reproduces the table instead of failing on first write; on the
-- existing project the IF NOT EXISTS makes this a no-op.
CREATE TABLE IF NOT EXISTS wishlists (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id            UUID REFERENCES products(id) ON DELETE SET NULL,
    handle                TEXT NOT NULL,
    title                 TEXT,
    price                 DECIMAL(10,2),
    currency              TEXT,
    image_url             TEXT,
    product_url           TEXT,
    region                TEXT NOT NULL,
    selected_size         TEXT,
    track_all_regions     BOOLEAN DEFAULT false,
    notify_on_price_drop  BOOLEAN DEFAULT false,
    notify_on_restock     BOOLEAN DEFAULT false,
    target_price          DECIMAL(10,2),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),

    -- The upsert in wishlist-context.tsx names this exact conflict target.
    CONSTRAINT unique_wishlist_entry UNIQUE(user_id, handle, region)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);

ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wishlist" ON wishlists;
CREATE POLICY "Users can view own wishlist" ON wishlists
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add to own wishlist" ON wishlists;
CREATE POLICY "Users can add to own wishlist" ON wishlists
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own wishlist" ON wishlists;
CREATE POLICY "Users can update own wishlist" ON wishlists
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete from own wishlist" ON wishlists;
CREATE POLICY "Users can delete from own wishlist" ON wishlists
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ALERTS (legacy)
-- ============================================
-- Superseded by price_alerts (006) and region_alerts (008); nothing in the
-- current frontend or backend reads or writes it, and it is empty. Locking
-- it down rather than dropping it, because confirming it is genuinely
-- disused is the owner's call, not this migration's. Once confirmed:
--     DROP TABLE alerts;
-- Guarded on existence: the table is only present on projects that predate
-- this migration chain, so a fresh deployment must skip it rather than fail.
DO $$
BEGIN
    IF to_regclass('public.alerts') IS NULL THEN
        RAISE NOTICE 'alerts table absent — nothing to secure';
        RETURN;
    END IF;

    EXECUTE 'ALTER TABLE alerts ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Users can view own legacy alerts" ON alerts';
    EXECUTE 'CREATE POLICY "Users can view own legacy alerts" ON alerts
                 FOR SELECT USING (auth.uid() = user_id)';

    EXECUTE 'DROP POLICY IF EXISTS "Users can create own legacy alerts" ON alerts';
    EXECUTE 'CREATE POLICY "Users can create own legacy alerts" ON alerts
                 FOR INSERT WITH CHECK (auth.uid() = user_id)';

    EXECUTE 'DROP POLICY IF EXISTS "Users can update own legacy alerts" ON alerts';
    EXECUTE 'CREATE POLICY "Users can update own legacy alerts" ON alerts
                 FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';

    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own legacy alerts" ON alerts';
    EXECUTE 'CREATE POLICY "Users can delete own legacy alerts" ON alerts
                 FOR DELETE USING (auth.uid() = user_id)';
END $$;

-- ============================================
-- VERIFY
-- ============================================
-- Every user-owned table should report rowsecurity = true. The catalog
-- tables (products, drops, price_history) are intentionally public and are
-- served read-only through the Go API, so they are not listed here.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('wishlists', 'alerts', 'price_alerts', 'size_alerts',
                    'notifications', 'region_alerts', 'user_profiles')
ORDER BY rowsecurity, tablename;
