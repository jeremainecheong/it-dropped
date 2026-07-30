-- DROPRADAR Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shopify_id      BIGINT NOT NULL,
    region          TEXT NOT NULL CHECK (region IN ('us', 'uk', 'eu', 'jp', 'au', 'sg')),
    handle          TEXT NOT NULL,
    title           TEXT NOT NULL,
    vendor          TEXT,
    product_type    TEXT,
    tags            TEXT[] DEFAULT '{}',
    price           DECIMAL(10,2),
    compare_price   DECIMAL(10,2),
    currency        TEXT NOT NULL DEFAULT 'USD',
    is_available    BOOLEAN DEFAULT true,
    available_sizes TEXT[] DEFAULT '{}',
    total_variants  INTEGER DEFAULT 0,
    image_url       TEXT,
    product_url     TEXT NOT NULL,
    first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
    last_hash       TEXT,
    
    CONSTRAINT unique_product_region UNIQUE(shopify_id, region)
);

CREATE INDEX idx_products_region ON products(region);
CREATE INDEX idx_products_available ON products(is_available);
CREATE INDEX idx_products_last_seen ON products(last_seen_at DESC);
CREATE INDEX idx_products_first_seen ON products(first_seen_at DESC);

-- ============================================
-- DROPS TABLE
-- ============================================
CREATE TABLE drops (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
    shopify_id      BIGINT NOT NULL,
    region          TEXT NOT NULL,
    change_type     TEXT NOT NULL CHECK (change_type IN ('new', 'restock', 'price_drop', 'price_increase', 'size_restock')),
    title           TEXT NOT NULL,
    price           DECIMAL(10,2),
    currency        TEXT,
    image_url       TEXT,
    product_url     TEXT,
    old_value       TEXT,
    new_value       TEXT,
    available_sizes TEXT[] DEFAULT '{}',
    detected_at     TIMESTAMPTZ DEFAULT NOW(),
    notified        BOOLEAN DEFAULT false,
    notified_at     TIMESTAMPTZ
);

CREATE INDEX idx_drops_detected ON drops(detected_at DESC);
CREATE INDEX idx_drops_region ON drops(region);
CREATE INDEX idx_drops_type ON drops(change_type);
CREATE INDEX idx_drops_notified ON drops(notified) WHERE notified = false;

-- ============================================
-- SUBSCRIBERS TABLE
-- ============================================
CREATE TABLE subscribers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id     BIGINT UNIQUE NOT NULL,
    chat_id         BIGINT NOT NULL,
    username        TEXT,
    first_name      TEXT,
    last_name       TEXT,
    regions         TEXT[] DEFAULT ARRAY['us', 'uk', 'eu', 'jp', 'au'],
    keywords        TEXT[] DEFAULT '{}',
    excluded_keywords TEXT[] DEFAULT '{}',
    min_price       DECIMAL(10,2),
    max_price       DECIMAL(10,2),
    notify_new      BOOLEAN DEFAULT true,
    notify_restock  BOOLEAN DEFAULT true,
    notify_price    BOOLEAN DEFAULT false,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    last_notified   TIMESTAMPTZ
);

CREATE INDEX idx_subscribers_telegram ON subscribers(telegram_id);
CREATE INDEX idx_subscribers_active ON subscribers(is_active) WHERE is_active = true;

-- ============================================
-- SCRAPE LOGS TABLE
-- ============================================
CREATE TABLE scrape_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region          TEXT NOT NULL,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    status          TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
    products_found  INTEGER DEFAULT 0,
    new_count       INTEGER DEFAULT 0,
    restock_count   INTEGER DEFAULT 0,
    price_changes   INTEGER DEFAULT 0,
    error_message   TEXT,
    duration_ms     INTEGER
);

CREATE INDEX idx_scrape_logs_started ON scrape_logs(started_at DESC);
CREATE INDEX idx_scrape_logs_region ON scrape_logs(region);
CREATE INDEX idx_scrape_logs_status ON scrape_logs(status);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for subscribers
CREATE TRIGGER trigger_subscribers_updated_at
    BEFORE UPDATE ON subscribers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- VIEWS
-- ============================================

-- Recent drops view
CREATE VIEW recent_drops_view AS
SELECT 
    d.*,
    p.title as product_title,
    p.image_url as product_image
FROM drops d
LEFT JOIN products p ON d.product_id = p.id
ORDER BY d.detected_at DESC
LIMIT 100;

-- Active subscribers by region
CREATE VIEW subscribers_by_region AS
SELECT 
    unnest(regions) as region,
    COUNT(*) as subscriber_count
FROM subscribers
WHERE is_active = true
GROUP BY region;
