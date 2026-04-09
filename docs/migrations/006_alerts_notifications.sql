-- ============================================
-- PRICE ALERTS & NOTIFICATIONS MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PRICE ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS price_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_price    DECIMAL(10,2) NOT NULL,
    alert_type      TEXT NOT NULL CHECK (alert_type IN ('price_drop', 'any_change', 'restock')),
    is_active       BOOLEAN DEFAULT true,
    triggered       BOOLEAN DEFAULT false,
    triggered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_product_alert UNIQUE(user_id, product_id, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_product ON price_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(is_active) WHERE is_active = true;

-- RLS for price_alerts
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON price_alerts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own alerts" ON price_alerts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON price_alerts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts" ON price_alerts
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('price_drop', 'restock', 'new_product', 'thread_reply', 'system')),
    title           TEXT NOT NULL,
    body            TEXT,
    link            TEXT,
    is_read         BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" ON notifications
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- SIZE ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS size_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size            TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    triggered       BOOLEAN DEFAULT false,
    triggered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_product_size UNIQUE(user_id, product_id, size)
);

CREATE INDEX IF NOT EXISTS idx_size_alerts_user ON size_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_size_alerts_product ON size_alerts(product_id);

-- RLS for size_alerts
ALTER TABLE size_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own size alerts" ON size_alerts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own size alerts" ON size_alerts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own size alerts" ON size_alerts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own size alerts" ON size_alerts
    FOR DELETE USING (auth.uid() = user_id);
