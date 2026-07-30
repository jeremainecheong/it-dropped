-- ============================================
-- USER PROFILES & PRICE HISTORY MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- USER PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username        TEXT UNIQUE,
    display_name    TEXT,
    avatar_url      TEXT,
    bio             TEXT,
    role            TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
    regions         TEXT[] DEFAULT ARRAY['us', 'uk', 'eu', 'jp', 'au', 'sg'],
    notifications   JSONB DEFAULT '{"drops": true, "price_changes": false, "thread_replies": true}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_profile();

-- RLS for user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles viewable by everyone" ON user_profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- PRICE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS price_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price           DECIMAL(10,2) NOT NULL,
    compare_price   DECIMAL(10,2),
    currency        TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded ON price_history(recorded_at DESC);

-- Trigger to record price changes
CREATE OR REPLACE FUNCTION record_price_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only record if price actually changed
    IF OLD.price IS DISTINCT FROM NEW.price THEN
        INSERT INTO price_history (product_id, price, compare_price, currency)
        VALUES (NEW.id, NEW.price, NEW.compare_price, NEW.currency);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_product_price_change ON products;
CREATE TRIGGER on_product_price_change
    AFTER UPDATE OF price ON products
    FOR EACH ROW
    EXECUTE FUNCTION record_price_change();

-- Also record initial price on product insert
CREATE OR REPLACE FUNCTION record_initial_price()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO price_history (product_id, price, compare_price, currency)
    VALUES (NEW.id, NEW.price, NEW.compare_price, NEW.currency);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_product_insert ON products;
CREATE TRIGGER on_product_insert
    AFTER INSERT ON products
    FOR EACH ROW
    EXECUTE FUNCTION record_initial_price();

-- ============================================
-- VIEWS
-- ============================================

-- User profile with stats
CREATE OR REPLACE VIEW user_profile_stats AS
SELECT 
    p.*,
    COALESCE(t.thread_count, 0) as thread_count,
    COALESCE(c.comment_count, 0) as comment_count,
    COALESCE(l.like_count, 0) as total_likes_received
FROM user_profiles p
LEFT JOIN (SELECT user_id, COUNT(*) as thread_count FROM forum_threads WHERE is_deleted = false GROUP BY user_id) t ON p.id = t.user_id
LEFT JOIN (SELECT user_id, COUNT(*) as comment_count FROM forum_comments WHERE is_deleted = false GROUP BY user_id) c ON p.id = c.user_id
LEFT JOIN (SELECT ft.user_id, SUM(ft.like_count) as like_count FROM forum_threads ft WHERE is_deleted = false GROUP BY ft.user_id) l ON p.id = l.user_id;
