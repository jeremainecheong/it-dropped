-- 023: give existing saves a product_id.
--
-- wishlists has both a NOT NULL TEXT `handle` and a nullable `product_id`, and
-- until now only the first was ever written. The client resolved a save's
-- identity as `product_id ?? handle`, which was fine while every link off a
-- saved card went to the external store — a handle is a fine key for a store
-- URL. It stopped being fine the moment /wishlist started linking to our own
-- /product/[id], because that route filters products.id, a UUID column: a
-- handle in that slot is a PostgREST 22P02 and the card opens an error page.
--
-- The client now declines to build an internal link for a non-UUID id, so no
-- save is broken either way. This migration is what turns those saves back into
-- real product links instead of store-only ones.
--
-- Two legacy shapes exist, because addItem stored `handle: item.handle ||
-- item.id`:
--
--   1. handle IS the product UUID — from callers that never passed a handle
--      (trending-products, search-overlay). Matched on products.id.
--   2. handle is a real Shopify handle — from the product page. Matched on
--      (handle, region), which is the catalogue's own unique key.
--
-- Both are resolved below. A row whose product no longer exists in the
-- catalogue keeps product_id NULL and keeps working exactly as it does today.
--
-- Idempotent: both statements only touch rows where product_id IS NULL.

BEGIN;

-- Shape 1. The regex guard matters: handle is TEXT, and a bare ::uuid cast of a
-- real handle aborts the whole statement rather than skipping the row. Postgres
-- does not guarantee evaluation order between WHERE clauses, so the cast lives
-- inside a CASE that cannot be reached for a non-UUID value.
UPDATE wishlists w
SET product_id = p.id
FROM products p
WHERE w.product_id IS NULL
  AND w.handle ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND p.id = (CASE
        WHEN w.handle ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN w.handle::uuid
      END);

-- Shape 2. (handle, region) is unique in products, so this cannot fan out.
UPDATE wishlists w
SET product_id = p.id
FROM products p
WHERE w.product_id IS NULL
  AND p.handle = w.handle
  AND p.region = w.region;

COMMIT;
