-- ============================================
-- FIX SIGN-UP: create_user_profile CANNOT RESOLVE user_profiles
-- Run this in the Supabase SQL Editor. Nobody can register until you do.
-- ============================================
--
-- 004 installs create_user_profile() as an AFTER INSERT trigger on auth.users
-- and marks it SECURITY DEFINER, but gives it no SET search_path. A SECURITY
-- DEFINER function without one inherits the CALLER's search_path.
--
-- GoTrue does not connect as postgres. It connects as supabase_auth_admin,
-- whose role setting is:
--
--     search_path=auth
--
-- No public. So when a sign-up fires the trigger, `INSERT INTO user_profiles`
-- resolves against the auth schema alone and raises
--
--     relation "user_profiles" does not exist
--
-- which aborts the auth.users insert and surfaces from the API as the
-- singularly unhelpful:
--
--     Database error creating new user
--
-- The effect is that NO new account can be created — not by email, not by
-- Google. An existing account still signs in, because sign-in does not fire
-- this trigger, which is what makes the failure so easy to miss: the owner's
-- own login works perfectly while every prospective user is turned away.
--
-- Verified two ways. On the hosted project, an insert into auth.users as
-- postgres (whose search_path includes public) succeeds, while the identical
-- insert through the admin API as supabase_auth_admin fails. On a local
-- replica with the same function definition, `SET search_path = public, auth`
-- succeeds and `SET search_path = auth` raises the error above — the function
-- and the row are identical, the search_path is the only variable.

CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- Both halves matter. The SET pins resolution regardless of who calls the
-- trigger, and schema-qualifying the target means the statement is correct
-- even if the setting is ever dropped again.
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url',
                 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.email)
    )
    -- A profile may already exist if a user is re-created or the trigger is
    -- ever attached twice. Signing up is not the moment to fail on that.
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- ============================================
-- Any other SECURITY DEFINER function with the same gap
-- ============================================
-- This is a class of bug, not a single instance: every SECURITY DEFINER
-- function that touches public and might be called from another schema's
-- role has it. Lists them so they can be checked rather than assumed.
SELECT p.proname,
       p.prosecdef              AS security_definer,
       p.proconfig              AS settings,
       CASE WHEN p.proconfig IS NULL THEN 'NO search_path — check its callers'
            ELSE 'pinned' END   AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY (p.proconfig IS NULL) DESC, p.proname;
