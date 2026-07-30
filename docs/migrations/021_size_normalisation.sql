-- 021: a size vocabulary shared across storefronts.
--
-- Measured against this database, Dover Street Market Singapore and the six
-- Stussy-operated stores had an overlap of exactly ZERO size tokens:
--
--   SG      'Size Small', 'Size Medium', 'Size Large', 'Size X-Large',
--           'Size XX-Large', 'Size X-Small', 'Size One Size', 'Size 26'..
--           'Size 38', 'Size Large/X-Large'                    — 16 tokens
--   Stussy  'S','M','L','XL','XXL','XS','ONE SIZE','28'..'38','EA','S/M',
--           'L/XL','US 4'..'US 7','7 1/8'..'7 1/2'             — 77 tokens
--
-- So a garment sold in both rendered twice in the size-availability matrix —
-- an 'M' row blank for Singapore and a 'Size Medium' row blank for everywhere
-- else — and a size alert could never match across regions. That is the one
-- market this catalogue is actually shopped from.
--
-- The normalisation itself lives in the scraper (scraper.normaliseSize), not
-- here: one implementation, exercised by tests, rather than a second copy in
-- SQL that drifts from it.
--
-- NEW COLUMNS, not a rewrite of all_sizes/available_sizes. The raw values stay
-- exactly as the store published them, so a bad rule is recoverable by
-- re-deriving from the original, and what the storefront actually said remains
-- auditable. Display the raw values; group, join and alert on the normalised.

BEGIN;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS all_sizes_normalised       TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS available_sizes_normalised TEXT[] DEFAULT '{}';

COMMENT ON COLUMN products.all_sizes_normalised IS
    'all_sizes mapped onto the cross-region vocabulary by scraper.normaliseSize. Raw values stay in all_sizes.';
COMMENT ON COLUMN products.available_sizes_normalised IS
    'available_sizes mapped onto the cross-region vocabulary by scraper.normaliseSize. Raw values stay in available_sizes.';

-- Size alerts ask "who still has an M", which is a containment test over this
-- column across every region at once.
CREATE INDEX IF NOT EXISTS idx_products_available_sizes_norm
    ON products USING GIN (available_sizes_normalised);

-- Force one write per affected product on the next scrape.
--
-- The scraper skips the upsert when the content hash is unchanged, and the
-- hash is computed from the raw sizes — which have not changed. Nothing about
-- adding a column moves it, so without this the new columns would stay empty
-- on every existing row indefinitely. 009 cleared last_hash for the same
-- reason when style_code arrived.
--
-- Blank, don't NULL: last_hash is scanned into a non-nullable Go string.
--
-- Scoped and self-limiting, which is what makes re-running this file a no-op:
-- only rows that carry sizes but no normalised sizes are touched, and after
-- the next scrape fills them there is nothing left to match. Products with no
-- size run at all are excluded so they are not re-upserted forever.
--
-- This produces no spurious drop notifications: DetectChanges compares price,
-- availability and the RAW size run against the stored row, all of which are
-- identical — only the fingerprint was reset.
UPDATE products
SET last_hash = ''
WHERE all_sizes <> '{}'
  AND (all_sizes_normalised IS NULL OR all_sizes_normalised = '{}');

COMMIT;
