-- 009: repair style codes, and force one full re-upsert to apply them
--
-- 007 derived style_code from the leading segment of the Shopify SKU. Every
-- Stussy-operated store publishes segmented SKUs ("1140364-OLIV-XS"), so that
-- worked for five regions. Dover Street Market Singapore publishes its own
-- unsegmented SKUs ("800011633GRY00S"), which encode colour and size and use
-- DSM's numbering. With no separator to split on, the whole string became the
-- style code — giving all 250 SG products an identity that matched nothing.
-- Measured against the live catalogue: 0 of 250 joined cross-region.
--
-- The handle carries the real code at the opposite end:
--
--     stussy-mens-varsity-zip-hood-navy-ss26-118589   -> 118589
--
-- 250 of 250 SG handles carry it, and 208 (83%) match a style code in the US
-- catalogue. The rest are DSM-exclusive or out of season, and are correctly
-- left unjoined.
--
-- The re-upsert is the point of this migration. The scraper skips writing a
-- product whose hash is unchanged, and the hash did not cover style_code, so
-- corrected codes would never reach an existing row. GenerateHash now covers
-- every 007 column; clearing last_hash forces one write per product on the
-- next cycle, after which hash-skip resumes normally.

BEGIN;

-- Blank, don't NULL: last_hash is read into a non-nullable string.
UPDATE products SET last_hash = '';

-- The SG rows hold the unusable DSM SKU. Clearing them makes a failed
-- re-derivation visible as NULL rather than silently keeping bad data.
UPDATE products SET style_code = NULL WHERE region = 'sg';

COMMIT;
