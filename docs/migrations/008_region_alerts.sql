-- 008: track a garment into a region that doesn't stock it yet
--
-- Every existing alert is bound to products.id, which identifies ONE regional
-- listing. That makes the most common request in this product unexpressible:
-- "this jacket is in JP but not SG — tell me when it lands in SG." The SG
-- listing does not exist yet, so there is no row to point an alert at, and
-- when it finally appears it is a brand-new UUID that no existing alert can
-- match.
--
-- region_alerts is bound to (style_code, region) instead: the garment, and
-- the country the user actually buys from. style_code is the cross-region
-- identity added in 007.
--
-- Also fixes two matcher bugs that this migration's CHECK relaxation enables:
-- notifications had no 'price_increase' type, so an any_change alert had
-- nowhere to write.

BEGIN;

-- --- region availability alerts -----------------------------------------
CREATE TABLE IF NOT EXISTS region_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Deliberately NOT a foreign key. The whole point is to name a garment
    -- that has no row in this region yet.
    style_code      TEXT NOT NULL,
    region          TEXT NOT NULL CHECK (region IN ('us','uk','eu','jp','au','sg')),
    -- Denormalised so the alert list and the notification can be rendered
    -- without a listing to join against.
    title           TEXT,
    image_url       TEXT,
    is_active       BOOLEAN DEFAULT true,
    triggered       BOOLEAN DEFAULT false,
    triggered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_user_style_region UNIQUE(user_id, style_code, region)
);

CREATE INDEX IF NOT EXISTS idx_region_alerts_user ON region_alerts(user_id);
-- The matcher's hot path: one lookup per new product per cycle.
CREATE INDEX IF NOT EXISTS idx_region_alerts_lookup
    ON region_alerts(style_code, region) WHERE is_active = true AND triggered = false;

ALTER TABLE region_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own region alerts" ON region_alerts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own region alerts" ON region_alerts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own region alerts" ON region_alerts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own region alerts" ON region_alerts
    FOR DELETE USING (auth.uid() = user_id);

-- --- notification types --------------------------------------------------
-- 'any_change' price alerts are supposed to fire in both directions, but
-- there was no notification type to record a rise, so the matcher only ever
-- handled price_drop.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'price_drop', 'price_increase', 'restock', 'new_product',
        'thread_reply', 'system'
    ));

COMMIT;
