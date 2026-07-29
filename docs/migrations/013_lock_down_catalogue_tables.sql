-- ============================================
-- ROW LEVEL SECURITY FOR THE CATALOGUE TABLES
-- Run this in the Supabase SQL Editor. Urgent.
-- ============================================
--
-- products, drops, price_history and scrape_logs were left without RLS on the
-- reasoning that they are public data served read-only through the Go API.
-- The first half is true. The second is not: Supabase exposes every table in
-- the public schema through PostgREST, and that endpoint is already live
-- because the frontend uses it for auth, wishlists and the forum. The Go API
-- is not a gate in front of these tables, it is just the door this codebase
-- happens to use.
--
-- Verified against the live project with nothing but the publishable key that
-- ships in the browser bundle: anon holds INSERT, UPDATE, DELETE and TRUNCATE
-- on all four tables, and a PATCH against a real product returned the updated
-- row. Anyone who opened the site could rewrite prices or empty the catalogue.
--
-- Reading stays open, because the catalogue is deliberately public and the
-- shop, compare and product pages are server-rendered for SEO. Writing becomes
-- service_role only, which is what the scraper already connects as.

-- ============================================
-- Public to read, nobody to write
-- ============================================
-- No INSERT/UPDATE/DELETE policy is defined on purpose. With RLS enabled and
-- no policy for an action, that action is denied for every role except those
-- that bypass RLS — service_role and the table owner. The scraper connects
-- with the Postgres credentials and is unaffected.
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE drops         ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Catalogue is publicly readable" ON products;
CREATE POLICY "Catalogue is publicly readable" ON products
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Drops are publicly readable" ON drops;
CREATE POLICY "Drops are publicly readable" ON drops
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Price history is publicly readable" ON price_history;
CREATE POLICY "Price history is publicly readable" ON price_history
    FOR SELECT USING (true);

-- ============================================
-- Not public at all
-- ============================================
-- scrape_logs carries error_message, which quotes upstream failures verbatim
-- and can include request URLs. It is operational telemetry, not catalogue,
-- and it was readable by anyone. No policy at all: service_role only.
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- subscribers holds contact details; push_subscriptions holds the endpoint and
-- keys needed to send a browser push. Both were writable by anon. Guarded on
-- existence because neither is created by a migration in this repo.
DO $$
BEGIN
    IF to_regclass('public.subscribers') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY';
    END IF;

    IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Users manage own push subscriptions" ON push_subscriptions';
        EXECUTE 'CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions
                     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    END IF;
END $$;

-- ============================================
-- VERIFY
-- ============================================
-- Every table in the public schema should now report rowsecurity = true.
SELECT tablename, rowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS policies
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY rowsecurity, tablename;
