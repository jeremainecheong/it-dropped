-- ============================================
-- FIX FORUM COUNTERS, AND TURN REALTIME ON
-- Run this in the Supabase SQL Editor.
-- ============================================
--
-- COUNTERS
--
-- update_thread_comment_count and update_like_counts maintain
-- forum_threads.comment_count and like_count by UPDATEing forum_threads. Both
-- are plain triggers, so they run as the invoker and are subject to RLS.
--
-- forum_threads' UPDATE policies allow the thread's own author, or an admin.
-- So the counters are only maintained when you act on your OWN thread.
-- Comment on somebody else's and the UPDATE matches no rows: no error, no
-- increment, because RLS filters rows rather than refusing the statement.
-- The count then drifts permanently below the truth, and a delete decrements
-- from that wrong base, so it can go negative.
--
-- Observed live: a thread showing comment_count = 1 with two comments
-- actually stored, then 0 after one was removed while one remained.
--
-- These triggers are bookkeeping, not authorisation. They should run with the
-- privileges of the schema owner and be exempt from RLS, exactly like
-- create_user_profile. search_path is pinned for the reason 015 exists.

CREATE OR REPLACE FUNCTION public.update_thread_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_threads
           SET comment_count = comment_count + 1
         WHERE id = NEW.thread_id;
    ELSIF TG_OP = 'DELETE' THEN
        -- GREATEST keeps a mis-sequenced delete from driving the count
        -- negative, which the old version could and did.
        UPDATE public.forum_threads
           SET comment_count = GREATEST(comment_count - 1, 0)
         WHERE id = OLD.thread_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_like_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.thread_id IS NOT NULL THEN
            UPDATE public.forum_threads
               SET like_count = like_count + 1 WHERE id = NEW.thread_id;
        ELSIF NEW.comment_id IS NOT NULL THEN
            UPDATE public.forum_comments
               SET like_count = like_count + 1 WHERE id = NEW.comment_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.thread_id IS NOT NULL THEN
            UPDATE public.forum_threads
               SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.thread_id;
        ELSIF OLD.comment_id IS NOT NULL THEN
            UPDATE public.forum_comments
               SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

-- Resync whatever the broken version left behind.
UPDATE forum_threads t
SET comment_count = (SELECT count(*) FROM forum_comments c
                      WHERE c.thread_id = t.id AND COALESCE(c.is_deleted, false) = false),
    like_count    = (SELECT count(*) FROM forum_likes l WHERE l.thread_id = t.id);

UPDATE forum_comments c
SET like_count = (SELECT count(*) FROM forum_likes l WHERE l.comment_id = c.id);

-- ============================================
-- REALTIME
-- ============================================
-- app/community/[threadId]/page.tsx subscribes to postgres_changes on
-- forum_comments so a comment posted in another tab or by another reader
-- appears without a refresh. The supabase_realtime publication is empty, so
-- that subscription has never delivered anything — it connects, reports
-- SUBSCRIBED, and stays silent.
--
-- Only tables whose SELECT policy is already public go in. Realtime applies
-- RLS to each subscriber, but adding a user-scoped table here would be
-- inviting a leak for no benefit, since nothing subscribes to one.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname='supabase_realtime' AND tablename='forum_comments') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE forum_comments;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname='supabase_realtime' AND tablename='forum_threads') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE forum_threads;
    END IF;
END $$;

-- ============================================
-- VERIFY
-- ============================================
SELECT 'counter triggers' AS check,
       string_agg(p.proname || '=' || CASE WHEN p.prosecdef THEN 'definer' ELSE 'INVOKER (still broken)' END, ', ') AS result
FROM pg_proc p WHERE p.proname IN ('update_thread_comment_count','update_like_counts')
UNION ALL
SELECT 'realtime tables', COALESCE(string_agg(tablename, ', '), 'NONE')
FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
UNION ALL
SELECT 'counts agree with reality',
       CASE WHEN count(*) = 0 THEN 'yes' ELSE count(*)::text || ' thread(s) still wrong' END
FROM forum_threads t
WHERE t.comment_count <> (SELECT count(*) FROM forum_comments c
                           WHERE c.thread_id = t.id AND COALESCE(c.is_deleted,false) = false);
