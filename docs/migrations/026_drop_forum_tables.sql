-- 026: drop the forum's tables. The surface was deleted from the app first
-- (PR #13) and these sat unreferenced for a release, exactly so this step
-- would be a formality rather than a leap.
--
-- Everything the forum owned goes: three tables (CASCADE takes their
-- policies, triggers and indexes), the two counter functions, and the
-- realtime publication membership. The signup trigger and user_profiles stay
-- — they serve auth and notification prefs, not the forum.
--
-- notifications loses the 'thread_reply' type: nothing can produce it now.
-- Existing rows of that type (if any) are deleted before the constraint
-- tightens, or the ALTER would fail on them.
--
-- The notifications-prefs JSONB keeps its thread_replies key in existing rows
-- (harmless, unread) but the column default drops it, so new rows carry only
-- keys with producers. The frontend's DEFAULT_PREFS mirrors this in the same
-- release.
--
-- Idempotent throughout.

BEGIN;

DROP TABLE IF EXISTS forum_likes CASCADE;
DROP TABLE IF EXISTS forum_comments CASCADE;
DROP TABLE IF EXISTS forum_threads CASCADE;

DROP FUNCTION IF EXISTS update_thread_comment_count() CASCADE;
DROP FUNCTION IF EXISTS update_like_counts() CASCADE;

DELETE FROM notifications WHERE type = 'thread_reply';

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'price_drop', 'price_increase', 'restock', 'sold_out', 'new_product',
        'system'
    ));

ALTER TABLE user_profiles
    ALTER COLUMN notifications
    SET DEFAULT '{"drops": true, "price_changes": true}'::jsonb;

COMMIT;
