-- ============================================
-- FIX COMMENTING AND LIKING IN THE FORUM
-- Run this in the Supabase SQL Editor.
-- ============================================
--
-- 003 gives forum_threads and forum_comments an "Admins can ..." UPDATE
-- policy that reads the role out of auth.users:
--
--     EXISTS (SELECT 1 FROM auth.users
--              WHERE users.id = auth.uid()
--                AND users.raw_user_meta_data->>'role' = 'admin')
--
-- The authenticated role has no SELECT on auth.users — has_table_privilege
-- reports false — so evaluating this policy raises
--
--     42501: permission denied for table users
--
-- before it can decide anything. Postgres checks every UPDATE policy on a
-- table, so one unreadable policy fails the statement for everyone,
-- including the ordinary owner covered by the sibling "Users can update own"
-- policy.
--
-- That breaks more than editing a post. update_thread_comment_count and
-- update_like_counts are plain triggers that UPDATE forum_threads to keep
-- comment_count and like_count current, and they run as the invoker. So
-- posting a comment and liking anything both fail outright, which is how
-- this was found: creating a thread succeeded, commenting on it did not.
--
-- The role lookup was also pointing at the wrong place. No user has ever had
-- a role in raw_user_meta_data — the count is zero — while user_profiles.role
-- is a real column with a CHECK for ('user','moderator','admin') and a
-- moderator seeded by 005. The policy was reading a field the schema does not
-- populate.

-- ============================================
-- One readable place to ask "is this an admin?"
-- ============================================
-- SECURITY DEFINER so it can read user_profiles without depending on the
-- caller's grants, and so the policy does not recurse into user_profiles' own
-- RLS. search_path is pinned for the reason 015 exists.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ============================================
-- Repoint the policies
-- ============================================
DROP POLICY IF EXISTS "Admins can update any thread" ON forum_threads;
CREATE POLICY "Admins can update any thread" ON forum_threads
    FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update any comment" ON forum_comments;
CREATE POLICY "Admins can update any comment" ON forum_comments
    FOR UPDATE USING (public.is_admin());

-- ============================================
-- VERIFY
-- ============================================
-- No policy anywhere should reach into auth.users: authenticated cannot read
-- it, so any that does will fail the same way.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%auth.users%'
ORDER BY tablename, policyname;
