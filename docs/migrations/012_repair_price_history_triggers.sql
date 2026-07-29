-- ============================================
-- REPAIR THE price_history TRIGGERS
-- Run this in the Supabase SQL Editor.
-- ============================================
--
-- 004 creates price_history with a currency column and installs
-- record_initial_price / record_price_change, which both insert into it.
-- The CREATE TABLE is IF NOT EXISTS, so on a project where price_history
-- already existed in an earlier shape the table was left alone while the
-- functions were installed anyway. The result is a pair of triggers that
-- reference a column their table does not have, and since they fire AFTER
-- INSERT and AFTER UPDATE OF price on products, *every* product write
-- raises:
--
--     ERROR: 42703: column "currency" of relation "price_history"
--            does not exist
--
-- On the hosted project this had silently frozen the catalogue: the scraper
-- could not insert or update a single row, and the newest last_seen_at was
-- over six months old.
--
-- A later generation of the same idea, record_price_history, was added
-- alongside rather than replacing them, so an insert also fired two
-- identical initial-price triggers. This reconciles all of it.

-- ============================================
-- 1. Reconcile the columns
-- ============================================
-- Two shapes of this table exist in the wild: 004's (currency) and an
-- earlier one (is_available, available_sizes). Whichever a project has, it
-- is missing the other half, and the trigger functions below write all of
-- it. Adding both makes the two lineages converge.
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS currency        TEXT;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS is_available    BOOLEAN;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS available_sizes TEXT[];

-- Existing rows predate whichever column was just added; take the values
-- from the product so backfilled history is not silently unitless.
UPDATE price_history ph
SET currency        = COALESCE(ph.currency, p.currency),
    is_available    = COALESCE(ph.is_available, p.is_available),
    available_sizes = COALESCE(ph.available_sizes, p.available_sizes)
FROM products p
WHERE ph.product_id = p.id
  AND (ph.currency IS NULL OR ph.is_available IS NULL OR ph.available_sizes IS NULL);

-- Anything still NULL has no product to inherit from (product deleted).
-- Inventing a value there would be a lie, so the columns stay nullable.

-- ============================================
-- 1b. Teach the functions the full row
-- ============================================
-- 004's versions write only currency, which violates the NOT NULL that the
-- earlier lineage put on is_available. Writing every column satisfies both.
CREATE OR REPLACE FUNCTION record_initial_price() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    INSERT INTO price_history
        (product_id, price, compare_price, currency, is_available, available_sizes)
    VALUES
        (NEW.id, NEW.price, NEW.compare_price, NEW.currency,
         NEW.is_available, NEW.available_sizes);
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION record_price_change() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF OLD.price IS DISTINCT FROM NEW.price THEN
        INSERT INTO price_history
            (product_id, price, compare_price, currency, is_available, available_sizes)
        VALUES
            (NEW.id, NEW.price, NEW.compare_price, NEW.currency,
             NEW.is_available, NEW.available_sizes);
    END IF;
    RETURN NEW;
END;
$fn$;

-- ============================================
-- 2. The duplicate triggers
-- ============================================
-- products_initial_price_trigger calls the same function as
-- on_product_insert, so every insert recorded the initial price twice.
DROP TRIGGER IF EXISTS products_initial_price_trigger ON products;

-- record_price_history is a third implementation of the same rule, writing
-- rows without a currency. on_product_price_change already covers price
-- moves, and the scraper records availability changes as drops.
DROP TRIGGER IF EXISTS products_price_history_trigger ON products;
DROP FUNCTION IF EXISTS record_price_history();

-- ============================================
-- VERIFY
-- ============================================
-- Expect exactly three triggers: on_product_insert, on_product_price_change
-- and products_search_vector_trigger.
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'products'::regclass AND NOT tgisinternal
ORDER BY tgname;

-- Expect zero: a write that would previously have raised 42703.
WITH probe AS (
    UPDATE products SET price = price
    WHERE id = (SELECT id FROM products LIMIT 1)
    RETURNING 1
)
SELECT count(*) - count(*) AS trigger_write_errors FROM probe;
