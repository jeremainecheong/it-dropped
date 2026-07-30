-- 019: how fast a garment sells out, per region.
--
-- The drops table has recorded `new` and `sold_out` with timestamps since the
-- beginning, so the interval between them is already in the data. It answers a
-- question no storefront will: this piece went in four hours in Japan and has
-- sat for six days in the US.
--
-- The catch, and the reason for the filter below.
--
-- A catalogue seeding run writes a `new` drop for every product it inserts,
-- because from the differ's point of view every product is new. On 2026-01-10
-- that was 900 rows in one day. Treating those as drop moments would date a
-- garment's release to whenever we happened to first scrape it, and the
-- "velocity" would measure our deployment history rather than anyone's
-- shopping.
--
-- A real Stüssy drop is dozens of pieces. A day with hundreds of new listings
-- is us, not them. Days above the threshold are excluded, which makes this
-- self-maintaining: reseed the catalogue again and that day is discounted too,
-- with no date to remember to update.
--
-- Consequence worth stating plainly: at the time of writing this returns
-- nothing at all. Every `new` we hold is from a seeding day and every
-- `sold_out` postdates it, so there is not one honest pair to report. It fills
-- in as the daily scrape observes real drops, and until then the UI shows
-- nothing rather than a number that would be an artefact of when we happened
-- to start looking.

-- Above this many new listings in a day, the day is a catalogue load.
CREATE OR REPLACE FUNCTION is_bulk_load_day(p_day TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*) > 300
    FROM drops
    WHERE change_type = 'new'
      AND date_trunc('day', detected_at) = date_trunc('day', p_day);
$$;

-- Observed drop moments: the first time we saw a listing appear, on a day that
-- was not a bulk load.
CREATE OR REPLACE VIEW observed_arrivals AS
WITH bulk_days AS (
    SELECT date_trunc('day', detected_at) AS day
    FROM drops
    WHERE change_type = 'new'
    GROUP BY 1
    HAVING COUNT(*) > 300
)
SELECT d.product_id,
       d.region,
       MIN(d.detected_at) AS appeared_at
FROM drops d
WHERE d.change_type = 'new'
  AND d.product_id IS NOT NULL
  AND date_trunc('day', d.detected_at) NOT IN (SELECT day FROM bulk_days)
GROUP BY d.product_id, d.region;

-- First sellout per listing. A piece that restocks and sells out again has
-- several; the first is the one that answers "how fast did it go".
CREATE OR REPLACE VIEW observed_sellouts AS
SELECT product_id,
       region,
       MIN(detected_at) AS sold_out_at
FROM drops
WHERE change_type = 'sold_out'
  AND product_id IS NOT NULL
GROUP BY product_id, region;

-- Every region carrying one garment, with how long it lasted.
--
-- Listings still in stock are included with a null sellout and the hours they
-- have been up so far, because "still there after six days" is half the
-- comparison and dropping it would leave only the regions that sold out.
CREATE OR REPLACE FUNCTION sellout_by_style(p_style_code TEXT)
RETURNS TABLE (
    region        TEXT,
    product_id    UUID,
    appeared_at   TIMESTAMPTZ,
    sold_out_at   TIMESTAMPTZ,
    hours         NUMERIC,
    still_live    BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.region,
           p.id,
           a.appeared_at,
           s.sold_out_at,
           ROUND(EXTRACT(EPOCH FROM (COALESCE(s.sold_out_at, NOW()) - a.appeared_at)) / 3600.0, 1),
           s.sold_out_at IS NULL AND p.is_available
    FROM products p
    JOIN observed_arrivals a ON a.product_id = p.id
    LEFT JOIN observed_sellouts s ON s.product_id = p.id
    WHERE COALESCE(p.style_code, p.handle) = p_style_code
    ORDER BY 5;
$$;

-- What went fastest lately, across the catalogue.
CREATE OR REPLACE FUNCTION fastest_sellouts(p_days INT DEFAULT 90, p_limit INT DEFAULT 20)
RETURNS TABLE (
    product_id   UUID,
    style_code   TEXT,
    title        TEXT,
    region       TEXT,
    image_url    TEXT,
    sold_out_at  TIMESTAMPTZ,
    hours        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id,
           COALESCE(p.style_code, p.handle),
           p.title,
           p.region,
           p.image_url,
           s.sold_out_at,
           ROUND(EXTRACT(EPOCH FROM (s.sold_out_at - a.appeared_at)) / 3600.0, 1) AS hours
    FROM observed_sellouts s
    JOIN observed_arrivals a ON a.product_id = s.product_id
    JOIN products p ON p.id = s.product_id
    WHERE s.sold_out_at >= NOW() - (p_days || ' days')::INTERVAL
      AND s.sold_out_at > a.appeared_at
    ORDER BY hours ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- The views read `drops`, which migration 013 left world-readable, so these
-- expose nothing new. They are SECURITY DEFINER only so the search_path can be
-- pinned.
GRANT SELECT ON observed_arrivals, observed_sellouts TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sellout_by_style(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fastest_sellouts(INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_bulk_load_day(TIMESTAMPTZ) TO anon, authenticated;

-- Both views group drops by product and type; the existing index is on
-- detected_at alone.
CREATE INDEX IF NOT EXISTS idx_drops_type_product
    ON drops (change_type, product_id, detected_at);
