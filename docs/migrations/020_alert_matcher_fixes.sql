-- 020: give sold-out a delivery path, and let size alerts fire more than once
--
-- Two matcher defects, one of which needs schema.
--
-- 1. SOLD-OUT COULD NOT BE DELIVERED. products/drops have tracked the
--    available -> unavailable transition since 007, and it is the single
--    event a cross-region tracker exists for: "it's gone in SG, it's still
--    up in JP." But `notifications.type` had no value for it (006 listed
--    five, 008 added price_increase), so even once the matcher grew a branch
--    the INSERT would have failed the CHECK. This adds 'sold_out'.
--
--    No new alert_type is introduced. The existing price_alerts row with
--    alert_type = 'restock' already means "watch this listing's availability
--    for me"; sell-out is that same subscription in the other direction, and
--    the matcher fires it without consuming the alert's `triggered` flag so
--    the restock notification the user actually asked for still arrives.
--
-- 2. SIZE ALERTS WERE ONE-SHOT. size_alerts.triggered was only ever cleared
--    by ReArmAlerts, which the scraper calls when the WHOLE listing goes
--    unavailable — the exact case the differ does NOT emit size_sold_out for.
--    So "tell me when a Medium is back" delivered once per lifetime and then
--    went quiet forever. The fix is in the Go matcher (it now consumes
--    size_sold_out and clears `triggered` for just the sizes that vanished);
--    the index below is what keeps that per-cycle UPDATE off a table scan.
--
-- Idempotent: safe to re-run.

BEGIN;

-- --- notification types --------------------------------------------------
-- Guarded rather than ALTER ... ADD alone, because the constraint already
-- exists under this name from 008 and re-running must not error.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'price_drop', 'price_increase', 'restock', 'sold_out', 'new_product',
        'thread_reply', 'system'
    ));

-- --- matcher hot paths ---------------------------------------------------
-- Every restock/size_restock drop looks up the pending size alerts for one
-- listing; 006 indexed product_id alone, which also drags in every alert
-- already fired and every alert switched off.
CREATE INDEX IF NOT EXISTS idx_size_alerts_pending
    ON size_alerts(product_id, size) WHERE is_active = true AND triggered = false;

-- The re-arm side of defect 2: one UPDATE per size_sold_out drop, matching
-- only alerts that have already fired.
CREATE INDEX IF NOT EXISTS idx_size_alerts_rearm
    ON size_alerts(product_id, size) WHERE triggered = true;

-- Sold-out matching reads restock alerts regardless of `triggered`, so the
-- pending-only shape above would not serve it.
CREATE INDEX IF NOT EXISTS idx_price_alerts_active_type
    ON price_alerts(product_id, alert_type) WHERE is_active = true;

COMMIT;
