-- 024: make the notification preferences mean something.
--
-- user_profiles.notifications has existed since 004 and had no reader anywhere
-- — not in the app, not in the scraper. The profile page now writes it, and
-- database.MatchAlerts now consults it, so the two switches on /profile finally
-- govern whether a matched alert becomes a notification row.
--
-- That exposes the column default as wrong. It shipped as price_changes:false,
-- which was harmless while nothing read it and is not harmless now: a user
-- creating a price alert on a product would have it match, flip to triggered,
-- and produce no notification — the alert loop broken again, this time
-- silently and by default. A preference the user was never shown must not be
-- the thing that swallows an alert they explicitly asked for. Defaulting to
-- true makes the switch a mute for something that works, rather than a gate on
-- something that doesn't.
--
-- thread_replies keeps its default and stays unread — the forum is frozen.
--
-- Idempotent: the UPDATE only touches rows still holding the old default.

BEGIN;

-- The reader. MatchAlerts calls this inside the UPDATE that flips an alert to
-- triggered, so a muted category leaves its alerts armed rather than consuming
-- them silently.
--
-- Absent row or absent key means true: a preference nobody has expressed must
-- not suppress an alert somebody explicitly created.
--
-- SECURITY INVOKER on purpose. The only caller is the scraper, which connects
-- as the owner and is not subject to RLS; a DEFINER function would hand every
-- role a way to read one bit of any user's settings for nothing in return.
CREATE OR REPLACE FUNCTION wants_notification(p_user_id UUID, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT (notifications ->> p_key)::boolean
           FROM user_profiles
          WHERE id = p_user_id),
        TRUE
    )
$$;

REVOKE ALL ON FUNCTION wants_notification(UUID, TEXT) FROM PUBLIC;

ALTER TABLE user_profiles
    ALTER COLUMN notifications
    SET DEFAULT '{"drops": true, "price_changes": true, "thread_replies": true}'::jsonb;

-- Existing rows were created by the signup trigger with the old default, so
-- they carry the false verbatim. Only rows that were never edited are moved:
-- a user who deliberately turned price changes off after some other key was
-- also changed is left alone.
UPDATE user_profiles
SET notifications = notifications || '{"price_changes": true}'::jsonb
WHERE notifications = '{"drops": true, "price_changes": false, "thread_replies": true}'::jsonb;

COMMIT;
