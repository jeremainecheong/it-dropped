-- ============================================
-- FORUM SCHEMA MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Forum Threads
CREATE TABLE IF NOT EXISTS forum_threads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    category        TEXT NOT NULL CHECK (category IN ('general', 'drops', 'fit-check', 'price-talk', 'wtb-wts')),
    product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
    is_pinned       BOOLEAN DEFAULT false,
    is_locked       BOOLEAN DEFAULT false,
    is_deleted      BOOLEAN DEFAULT false,
    view_count      INTEGER DEFAULT 0,
    like_count      INTEGER DEFAULT 0,
    comment_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Forum Comments
CREATE TABLE IF NOT EXISTS forum_comments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id       UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES forum_comments(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    is_deleted      BOOLEAN DEFAULT false,
    like_count      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Forum Likes (for both threads and comments)
CREATE TABLE IF NOT EXISTS forum_likes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id       UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
    comment_id      UUID REFERENCES forum_comments(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_thread_like UNIQUE(user_id, thread_id),
    CONSTRAINT unique_comment_like UNIQUE(user_id, comment_id),
    CONSTRAINT like_one_target CHECK (
        (thread_id IS NOT NULL AND comment_id IS NULL) OR
        (thread_id IS NULL AND comment_id IS NOT NULL)
    )
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_threads_category ON forum_threads(category);
CREATE INDEX IF NOT EXISTS idx_threads_user ON forum_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_product ON forum_threads(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_created ON forum_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_pinned ON forum_threads(is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON forum_comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON forum_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON forum_comments(parent_id) WHERE parent_id IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_likes ENABLE ROW LEVEL SECURITY;

-- Threads policies
CREATE POLICY "Threads viewable by everyone" ON forum_threads
    FOR SELECT USING (is_deleted = false);

CREATE POLICY "Users can create threads" ON forum_threads
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own threads" ON forum_threads
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can update any thread" ON forum_threads
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Comments policies
CREATE POLICY "Comments viewable by everyone" ON forum_comments
    FOR SELECT USING (is_deleted = false);

CREATE POLICY "Users can create comments" ON forum_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments" ON forum_comments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can update any comment" ON forum_comments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Likes policies
CREATE POLICY "Likes viewable by everyone" ON forum_likes
    FOR SELECT USING (true);

CREATE POLICY "Users can manage own likes" ON forum_likes
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE TRIGGER trigger_threads_updated_at
    BEFORE UPDATE ON forum_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_comments_updated_at
    BEFORE UPDATE ON forum_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- REALTIME ENABLED
-- ============================================
ALTER TABLE forum_threads REPLICA IDENTITY FULL;
ALTER TABLE forum_comments REPLICA IDENTITY FULL;

-- ============================================
-- FUNCTIONS FOR LIKE/COMMENT COUNTS
-- ============================================

-- Function to update thread comment count
CREATE OR REPLACE FUNCTION update_thread_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE forum_threads SET comment_count = comment_count + 1 WHERE id = NEW.thread_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE forum_threads SET comment_count = comment_count - 1 WHERE id = OLD.thread_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_comment_count
    AFTER INSERT OR DELETE ON forum_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_comment_count();

-- Function to update like counts
CREATE OR REPLACE FUNCTION update_like_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.thread_id IS NOT NULL THEN
            UPDATE forum_threads SET like_count = like_count + 1 WHERE id = NEW.thread_id;
        ELSIF NEW.comment_id IS NOT NULL THEN
            UPDATE forum_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.thread_id IS NOT NULL THEN
            UPDATE forum_threads SET like_count = like_count - 1 WHERE id = OLD.thread_id;
        ELSIF OLD.comment_id IS NOT NULL THEN
            UPDATE forum_comments SET like_count = like_count - 1 WHERE id = OLD.comment_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_like_counts
    AFTER INSERT OR DELETE ON forum_likes
    FOR EACH ROW
    EXECUTE FUNCTION update_like_counts();
