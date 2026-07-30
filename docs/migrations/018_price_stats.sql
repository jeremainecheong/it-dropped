-- 018: price statistics, so a discount can be verified rather than believed.
--
-- The catalogue shows a SALE badge whenever compare_price exceeds price. That
-- number is set by the retailer and means whatever they want it to mean; a
-- "was £120, now £60" on an item that has never sold at £120 is the oldest
-- trick in the shop. Nothing in the badge is our observation.
--
-- price_history is our observation. It has recorded every price change since
-- January, so we can say what a listing has actually cost, and a claim like
-- "the lowest we have seen it in 90 days" is either true of that record or it
-- is not.
--
-- Two functions rather than a view: the product page wants one listing's
-- window and the shop grid wants a page of them at once, and a per-card query
-- across a 24-item grid is 24 round trips for a badge.

-- One listing.
CREATE OR REPLACE FUNCTION price_stats(p_product_id UUID, p_days INT DEFAULT 90)
RETURNS TABLE (
    low         DECIMAL(10,2),
    high        DECIMAL(10,2),
    points      INT,
    first_seen  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pinned: a SECURITY DEFINER function that inherits the caller's search_path
-- resolves `price_history` to whatever they put in front of it.
SET search_path = public
AS $$
    SELECT MIN(price)::DECIMAL(10,2),
           MAX(price)::DECIMAL(10,2),
           COUNT(*)::INT,
           MIN(recorded_at)
    FROM price_history
    WHERE product_id = p_product_id
      AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL;
$$;

-- A page of listings, in one round trip.
--
-- Products with no history in the window are simply absent from the result
-- rather than returned as zeroes: a listing we have never priced is not a
-- listing whose low is nothing, and a caller that cannot tell the difference
-- would badge every new arrival as its own record low.
CREATE OR REPLACE FUNCTION price_stats_bulk(p_product_ids UUID[], p_days INT DEFAULT 90)
RETURNS TABLE (
    product_id  UUID,
    low         DECIMAL(10,2),
    high        DECIMAL(10,2),
    points      INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ph.product_id,
           MIN(ph.price)::DECIMAL(10,2),
           MAX(ph.price)::DECIMAL(10,2),
           COUNT(*)::INT
    FROM price_history ph
    WHERE ph.product_id = ANY(p_product_ids)
      AND ph.recorded_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY ph.product_id;
$$;

-- Both are read-only over a table the publishable key can already read, so
-- exposing them adds no reach.
GRANT EXECUTE ON FUNCTION price_stats(UUID, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION price_stats_bulk(UUID[], INT) TO anon, authenticated;

-- The bulk lookup filters on product_id and recorded_at together; the existing
-- indexes cover each separately, which makes Postgres pick one and filter the
-- rest by hand.
CREATE INDEX IF NOT EXISTS idx_price_history_product_recorded
    ON price_history (product_id, recorded_at DESC);
