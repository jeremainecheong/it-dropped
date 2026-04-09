-- ============================================
-- SEED MODERATOR & ADMIN ACCOUNTS
-- Run this AFTER running 004_user_profiles_price_history.sql
-- ============================================

-- Note: You need to first create these accounts via the signup page,
-- then run this SQL to upgrade them to moderator/admin roles.

-- Option 1: Upgrade existing user by email
UPDATE user_profiles
SET role = 'moderator'
WHERE id = (SELECT id FROM auth.users WHERE email = 'mod@itdropped.com');

UPDATE user_profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@itdropped.com');

-- Option 2: If you want to check/create profiles for existing auth users
-- This handles cases where user signed up before migration was run
INSERT INTO user_profiles (id, display_name, avatar_url, role)
SELECT 
    id,
    COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || email,
    CASE 
        WHEN email = 'admin@itdropped.com' THEN 'admin'
        WHEN email = 'mod@itdropped.com' THEN 'moderator'
        ELSE 'user'
    END
FROM auth.users
WHERE id NOT IN (SELECT id FROM user_profiles)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- QUICK TEST: Create a test moderator
-- ============================================
-- 1. Sign up with email: mod@itdropped.com
-- 2. Run this SQL:
--    UPDATE user_profiles SET role = 'moderator' 
--    WHERE id = (SELECT id FROM auth.users WHERE email = 'mod@itdropped.com');
