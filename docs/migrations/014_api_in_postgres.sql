-- ============================================
-- MOVE THE READ API INTO POSTGRES
-- Run this in the Supabase SQL Editor.
-- ============================================
--
-- The Go API is 13 read-only GET routes. Most of them are a filtered SELECT
-- that PostgREST can already express, so they need nothing here. This adds
-- only the pieces PostgREST genuinely cannot do:
--
--   price_usd        a sort key. The Go API ordered by a CASE expression over
--                    currency, and PostgREST can only order by columns.
--   search_products  ORDER BY ts_rank(...) depends on the query argument, so
--                    it can never be a stored column.
--   products_by_handle  resolves a handle to a style_code through a scalar
--                    subquery, then returns every region carrying it.
--   region_stats     three CTEs and a window function.
--   analytics_summary  three independent aggregates the handler merged in Go.
--
-- Everything here is read-only and STABLE. Functions are SECURITY INVOKER, so
-- the RLS added in 013 still applies: anon may read the catalogue and nothing
-- else.

-- ============================================
-- 1. price_usd — the sort key
-- ============================================
-- Approximate USD so listings from six storefronts sort on one axis: ¥28,000
-- is cheaper than £205, but ORDER BY price ranks it as the most expensive.
-- Keep these rates in step with frontend/lib/currency.ts and the Go
-- priceUSDExpr. They exist to order and compare, never to quote a price.
ALTER TABLE products DROP COLUMN IF EXISTS price_usd;
ALTER TABLE products ADD COLUMN price_usd NUMERIC
    GENERATED ALWAYS AS (price * CASE currency
        WHEN 'USD' THEN 1.0
        WHEN 'GBP' THEN 1.27
        WHEN 'EUR' THEN 1.08
        WHEN 'JPY' THEN 0.0067
        WHEN 'AUD' THEN 0.65
        WHEN 'SGD' THEN 0.74
        ELSE 1.0
    END) STORED;

CREATE INDEX IF NOT EXISTS idx_products_price_usd ON products(price_usd);

-- ============================================
-- 2. search_products — full-text, ranked
-- ============================================
-- search_vector is maintained by products_search_vector_trigger with
-- setweight A/B/C/D over title/vendor/product_type/tags. The rank is used
-- only to order; it is not returned, exactly as the Go route did.
CREATE OR REPLACE FUNCTION search_products(q TEXT, p_region TEXT DEFAULT NULL, lim INT DEFAULT 20)
RETURNS SETOF products
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
    SELECT p.*
    FROM products p
    WHERE p.search_vector @@ plainto_tsquery('english', q)
      AND (p_region IS NULL OR p_region = '' OR p.region = p_region)
    ORDER BY ts_rank(p.search_vector, plainto_tsquery('english', q)) DESC
    LIMIT LEAST(GREATEST(COALESCE(lim, 20), 1), 50);
$$;

-- ============================================
-- 3. products_by_handle — every region carrying this garment
-- ============================================
-- style_code identifies the garment across storefronts; the handle does not.
-- Resolve the handle to a code first, falling back to the handle itself when
-- no listing has one, which is what COALESCE did in the Go query.
CREATE OR REPLACE FUNCTION products_by_handle(h TEXT)
RETURNS SETOF products
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
    SELECT p.*
    FROM products p
    WHERE p.style_code = COALESCE(
              (SELECT style_code FROM products
                WHERE handle = h AND style_code IS NOT NULL LIMIT 1), h)
       OR p.handle = h
    ORDER BY p.region;
$$;

-- ============================================
-- 4. region_stats — the dashboard's per-region summary
-- ============================================
CREATE OR REPLACE VIEW region_stats AS
WITH region_counts AS (
    SELECT region, COUNT(*) AS total_items FROM products GROUP BY region
),
active_drops AS (
    SELECT region, COUNT(*) AS active_count
    FROM products WHERE first_seen_at > NOW() - INTERVAL '24 hours'
    GROUP BY region
),
category_ranks AS (
    SELECT region, product_type,
           ROW_NUMBER() OVER (PARTITION BY region ORDER BY COUNT(*) DESC) AS rn
    FROM products WHERE product_type <> ''
    GROUP BY region, product_type
)
SELECT rc.region,
       COALESCE(ad.active_count, 0)      AS active_drops_24h,
       COALESCE(rc.total_items, 0)       AS total_tracked_items,
       COALESCE(cr.product_type, 'N/A')  AS top_category
FROM region_counts rc
LEFT JOIN active_drops ad  ON rc.region = ad.region
LEFT JOIN category_ranks cr ON rc.region = cr.region AND cr.rn = 1
ORDER BY rc.region;

-- ============================================
-- 5. analytics_summary — one call, three aggregates
-- ============================================
-- The Go handler ran three queries and merged them into one object. Same
-- shape, one round trip. Each half re-clamps its own window exactly as the
-- Go methods did.
CREATE OR REPLACE FUNCTION analytics_summary(days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
    WITH d_act AS (
        SELECT LEAST(GREATEST(COALESCE(days, 7), 1), 90) AS n
    ),
    d_band AS (
        SELECT LEAST(GREATEST(COALESCE(days, 30), 1), 365) AS n
    ),
    activity AS (
        SELECT d::date AS day,
               COUNT(*) FILTER (WHERE dr.change_type = 'new')                         AS drops,
               COUNT(*) FILTER (WHERE dr.change_type IN ('restock','size_restock'))    AS restocks,
               COUNT(*) FILTER (WHERE dr.change_type IN ('sold_out','size_sold_out'))  AS sold_out,
               COUNT(*) FILTER (WHERE dr.change_type = 'price_drop')                   AS price_drops
        FROM d_act,
             generate_series(CURRENT_DATE - ((d_act.n - 1) || ' days')::interval, CURRENT_DATE, '1 day') d
        LEFT JOIN drops dr ON dr.detected_at::date = d::date
        GROUP BY d ORDER BY d
    ),
    bands AS (
        SELECT d::date AS day,
               COALESCE(ROUND(AVG(ph.usd)::numeric, 2), 0) AS avg,
               COALESCE(ROUND(MIN(ph.usd)::numeric, 2), 0) AS min,
               COALESCE(ROUND(MAX(ph.usd)::numeric, 2), 0) AS max,
               COUNT(ph.id)                                AS samples
        FROM d_band,
             generate_series(CURRENT_DATE - ((d_band.n - 1) || ' days')::interval, CURRENT_DATE, '1 day') d
        LEFT JOIN LATERAL (
            SELECT ph.id, ph.price * CASE ph.currency
                       WHEN 'USD' THEN 1.0 WHEN 'GBP' THEN 1.27 WHEN 'EUR' THEN 1.08
                       WHEN 'JPY' THEN 0.0067 WHEN 'AUD' THEN 0.65 WHEN 'SGD' THEN 0.74
                       ELSE 1.0 END AS usd
            FROM price_history ph
            WHERE ph.recorded_at::date = d::date
        ) ph ON TRUE
        GROUP BY d ORDER BY d
    ),
    cats AS (
        SELECT product_type AS name, COUNT(*) AS count
        FROM products WHERE product_type <> ''
        GROUP BY product_type ORDER BY count DESC LIMIT 8
    )
    SELECT jsonb_build_object(
        'drop_activity', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.day) FROM activity a), '[]'::jsonb),
        'price_bands',   COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.day) FROM bands b),    '[]'::jsonb),
        'categories',    COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM cats c),                    '[]'::jsonb)
    );
$$;

-- ============================================
-- 6. Grants
-- ============================================
GRANT SELECT  ON region_stats                                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_products(TEXT, TEXT, INT)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION products_by_handle(TEXT)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_summary(INT)             TO anon, authenticated;

-- ============================================
-- VERIFY
-- ============================================
SELECT 'price_usd'         AS object, count(*)::text AS result FROM information_schema.columns
  WHERE table_name='products' AND column_name='price_usd'
UNION ALL SELECT 'search_products rows',  count(*)::text FROM search_products('hoodie', NULL, 5)
UNION ALL SELECT 'region_stats rows',     count(*)::text FROM region_stats
UNION ALL SELECT 'analytics keys',        (SELECT string_agg(k, ',') FROM jsonb_object_keys(analytics_summary(7)) k);
