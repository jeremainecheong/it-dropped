-- 022: a change type for products the store has stopped publishing.
--
-- The differ only ever iterated the products a fetch returned, so a listing
-- pulled from the feed — archived, unpublished, withdrawn from a region — was
-- never diffed and never touched. Its row kept is_available = true forever: it
-- stayed in the shop grid as a buyable item, and sellout_by_style (019) kept
-- reporting still_live for it, which made "still there after six days" — the
-- half of that comparison 019 exists to provide — systematically wrong for
-- exactly the garments that had gone.
--
-- scraper.DetectDelistings now corrects those rows and records the event. This
-- migration is what lets the event be stored: drops_change_type_check (007)
-- lists the permitted values, and an insert of anything else is rejected.
--
-- 'delisted' is a separate value rather than reusing 'sold_out' on purpose.
-- 019 measures sell-out velocity from 'sold_out' drops, and those are observed
-- available -> unavailable edges on listings still in the feed. A delisting is
-- only ever observed as an absence, at an unknown moment between two fetches,
-- and the garment may never have sold a unit. Folding the two together would
-- put invented timestamps into "this went in four hours in Japan"; keeping them
-- apart leaves 019's inputs untouched while still clearing still_live, since
-- that column reads products.is_available.
--
-- Until this is applied the scraper still corrects is_available — only the
-- accompanying drop insert fails the CHECK, and scrapeRegion logs that per drop
-- without failing the region.
--
-- Idempotent: re-running rewrites the same constraint.

BEGIN;

ALTER TABLE drops DROP CONSTRAINT IF EXISTS drops_change_type_check;
ALTER TABLE drops ADD CONSTRAINT drops_change_type_check
    CHECK (change_type IN (
        'new',
        'restock',
        'price_drop',
        'price_increase',
        'size_restock',
        'sold_out',
        'size_sold_out',
        -- The store no longer publishes this listing at all.
        'delisted'
    ));

COMMIT;
