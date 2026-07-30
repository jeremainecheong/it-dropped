-- ============================================
-- BACKFILL style_code FROM handle
-- Run this in the Supabase SQL Editor, after 009.
-- ============================================
--
-- 007 backfilled style_code = handle for every pre-existing row, because at
-- that point nothing could derive a better value. A handle is unique per
-- store, so every row got an identity that matches only itself and
-- cross-region comparison stays inert until a scrape rewrites the column.
--
-- 009 clears last_hash so the next scrape does rewrite it, but a catalogue
-- that is not being scraped right now would sit inert until one runs. This
-- derives the same value directly from the handle in SQL, so an existing
-- catalogue starts matching immediately.
--
-- The rules mirror styleCodeFromHandle / looksLikeStyleCode in
-- backend/internal/scraper/parser.go. Verified against a scraped database:
-- this SQL and the Go parser agree on every row of a six-region catalogue.
-- Keep the two in step if either changes.

-- Real codes are short alphanumerics carrying most of their length in
-- digits ("118589", "1915000GD", "OM0335"). Four digits is what separates
-- them from season markers like "ss26".
CREATE OR REPLACE FUNCTION pg_temp.looks_like_style_code(s TEXT)
RETURNS BOOLEAN AS $$
    SELECT s ~ '^[0-9A-Z]{4,12}$'
       AND length(regexp_replace(s, '[^0-9]', '', 'g')) >= 4;
$$ LANGUAGE sql IMMUTABLE;

-- Both storefront conventions carry the code, at opposite ends:
--   Stussy  1140364-garment-dyed-ss-tee-olive             -> leading
--   DSM SG  stussy-mens-varsity-zip-hood-navy-ss26-118589 -> trailing
-- Leading is tried first: it is authoritative on Stussy's own stores. DSM
-- also appends the season marker after the code on some listings
-- ("...-blac-1321253-ss26"), leaving it at neither end; an interior segment
-- counts only when exactly one qualifies, since two would be a guess.
WITH derived AS (
    SELECT
        id,
        upper(parts[1])                      AS lead,
        upper(parts[array_length(parts, 1)]) AS tail,
        (SELECT array_agg(DISTINCT upper(seg))
           FROM unnest(parts[2:array_length(parts, 1) - 1]) AS seg
          WHERE pg_temp.looks_like_style_code(upper(seg))) AS mids
    FROM (
        SELECT id, string_to_array(btrim(handle), '-') AS parts
        FROM products
    ) s
    WHERE array_length(parts, 1) >= 2
)
UPDATE products p
SET style_code = CASE
        WHEN pg_temp.looks_like_style_code(d.lead) THEN d.lead
        WHEN pg_temp.looks_like_style_code(d.tail) THEN d.tail
        WHEN array_length(d.mids, 1) = 1          THEN d.mids[1]
        ELSE NULL
    END
FROM derived d
WHERE p.id = d.id
  -- Only touch rows that carry no usable identity: either the 007 fallback
  -- (style_code = handle) or the NULL 009 left on the SG rows. A row whose
  -- style_code a scrape already set correctly is left alone.
  AND (p.style_code IS NULL OR p.style_code = p.handle);

-- ============================================
-- VERIFY
-- ============================================
-- shared_across_regions counts garments carried by more than one region,
-- which is the whole point of the column. It should be well above zero.
SELECT
    count(*)                                            AS products,
    count(*) FILTER (WHERE style_code IS NULL)          AS no_code,
    count(*) FILTER (WHERE style_code = handle)         AS still_handle,
    (SELECT count(*) FROM (
        SELECT style_code FROM products
        WHERE style_code IS NOT NULL
        GROUP BY style_code HAVING count(DISTINCT region) > 1
     ) x)                                               AS shared_across_regions
FROM products;
