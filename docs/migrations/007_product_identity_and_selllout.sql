-- 007: cross-region identity, size/colour correctness, and sell-out events
--
-- Three problems this fixes:
--
-- 1. products.available_sizes was populated from Shopify's option1, which on
--    these storefronts is COLOUR, not size. Every existing row holds colour
--    names, so the shop's size filter matches nothing and size alerts are
--    unservable. The parser now resolves the axis by the product's declared
--    options[] names; existing rows are cleared so the next scrape refills
--    them correctly rather than leaving colours in place.
--
-- 2. Cross-region comparison joined on `handle`, which only matches ~4% of
--    Australian products against their US counterparts. The Shopify SKU
--    ("1140364-OLIV-XS") carries a stable style code that does match.
--
-- 3. The differ had no available -> unavailable branch, so the system could
--    not record that anything ever sold out.

BEGIN;

-- --- 1 & 2: product identity and variant detail -------------------------
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS style_code         TEXT,
    ADD COLUMN IF NOT EXISTS color              TEXT,
    ADD COLUMN IF NOT EXISTS all_sizes          TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS available_variants INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS published_at       TIMESTAMPTZ;

-- The cross-region join key. Not unique: the same style legitimately appears
-- once per region, and in several colourways.
CREATE INDEX IF NOT EXISTS idx_products_style_code ON products(style_code);
CREATE INDEX IF NOT EXISTS idx_products_published  ON products(published_at DESC NULLS LAST);

-- Backfill so nothing regresses before the next full scrape repopulates it.
UPDATE products SET style_code = handle WHERE style_code IS NULL;

-- Existing available_sizes hold colour names. Empty them rather than serve
-- wrong data; the next scrape cycle refills every row with real sizes.
UPDATE products SET available_sizes = '{}' WHERE available_sizes <> '{}';

-- --- 3: sell-out events --------------------------------------------------
ALTER TABLE drops DROP CONSTRAINT IF EXISTS drops_change_type_check;
ALTER TABLE drops ADD CONSTRAINT drops_change_type_check
    CHECK (change_type IN (
        'new',
        'restock',
        'price_drop',
        'price_increase',
        'size_restock',
        'sold_out',
        'size_sold_out'
    ));

-- --- Notification backlog amnesty ---------------------------------------
-- The scraper has been recording drops with notified=false since day one,
-- including the ~5,000-row initial backfill. Turning the notifier on without
-- this would blast every subscriber with thousands of messages and get the
-- bot rate-limited or banned. Everything already in the table is history, not
-- news: mark it delivered.
UPDATE drops SET notified = TRUE, notified_at = NOW() WHERE notified = FALSE;

COMMIT;
