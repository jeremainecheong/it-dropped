-- 025: watch a whole category, not just a product.
--
-- Every existing alert is anchored to a listing or a style code that already
-- exists — which makes them useless for the thing a drop actually is: products
-- that did not exist yesterday. "Tell me when new tees appear" cannot be
-- expressed as a product alert by definition.
--
-- A watch names a category (the same six-bucket vocabulary the shop's chips
-- use — Tops, Bottoms, Outerwear, Headwear, Accessories, Footwear), optionally
-- narrowed to one region and/or to the user's saved sizes. The scraper's
-- matcher (database.MatchCategoryWatches) fires on 'new' drops and notifies as
-- a DIGEST — one row per (user, category, region, cycle), "6 new Tops in US" —
-- because a Friday drop matching a watch forty times over as forty bell rows
-- is how notification systems get muted.
--
-- The category is stored as the bucket key, not a product_type: the raw
-- product_type strings differ per storefront ("HOODIE" vs "Mens Long Sleeve
-- Sweatshirt") and the bucket mapping lives in code, applied at match time.
--
-- The matcher guards on this table existing (to_regclass) and skips silently
-- when it does not, so the scraper never breaks against a database this has
-- not been applied to. The frontend likewise hides the watch UI when its
-- first read 404s.
--
-- Idempotent throughout.

BEGIN;

CREATE TABLE IF NOT EXISTS category_watches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Bucket key from the shared vocabulary; free TEXT rather than a CHECK so
    -- adding a bucket is a code change, not a migration.
    category        TEXT NOT NULL,
    -- NULL means every region.
    region          TEXT,
    -- Only notify for items available in the user's saved sizes.
    my_sizes_only   BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One watch per (user, category, region), with NULL region participating —
-- a plain UNIQUE would treat NULLs as distinct and allow duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_watches_scope
    ON category_watches (user_id, category, COALESCE(region, 'all'));

CREATE INDEX IF NOT EXISTS idx_category_watches_active
    ON category_watches (category) WHERE is_active = true;

ALTER TABLE category_watches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own category watches" ON category_watches;
CREATE POLICY "Users manage own category watches" ON category_watches
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMIT;
