-- WhatsApp Business Analytics Database Schema
-- This schema creates all required tables for tracking message events, button clicks, and analytics

-- ==================== MESSAGE EVENTS TABLE ====================
-- Main event tracking table for all message lifecycle events
CREATE TABLE IF NOT EXISTS message_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    message_id VARCHAR(255) NOT NULL UNIQUE,

    -- Message Details
    template_id VARCHAR(255),
    template_name VARCHAR(255),
    conversation_id VARCHAR(255),

    -- Recipient Details
    recipient_phone VARCHAR(50) NOT NULL,
    recipient_name VARCHAR(255),
    contact_id INTEGER,

    -- Event Tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    replied_at TIMESTAMP WITH TIME ZONE,

    -- Status
    current_status VARCHAR(50) DEFAULT 'pending',
    -- Possible values: 'pending', 'sent', 'delivered', 'read', 'failed', 'replied'

    failure_reason TEXT,

    -- Metadata
    message_type VARCHAR(50), -- 'template', 'text', 'media', 'interactive'
    campaign_id VARCHAR(255),
    broadcast_group_id INTEGER,

    -- Costs
    cost DECIMAL(10, 4) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    conversation_category VARCHAR(50), -- 'marketing', 'utility', 'authentication', 'service'

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for message_events
CREATE INDEX IF NOT EXISTS idx_message_events_tenant_id ON message_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_events_template_id ON message_events(template_id);
CREATE INDEX IF NOT EXISTS idx_message_events_sent_at ON message_events(sent_at);
CREATE INDEX IF NOT EXISTS idx_message_events_recipient_phone ON message_events(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_message_events_campaign_id ON message_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_message_events_current_status ON message_events(current_status);
CREATE INDEX IF NOT EXISTS idx_message_events_tenant_sent_at ON message_events(tenant_id, sent_at);

-- ==================== BUTTON CLICKS TABLE ====================
-- Track button interactions
CREATE TABLE IF NOT EXISTS button_clicks (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    message_id VARCHAR(255) NOT NULL,

    -- Button Details
    button_id VARCHAR(255),
    button_text TEXT,
    button_type VARCHAR(50), -- 'quick_reply', 'call_to_action', 'url'
    button_index INTEGER,

    -- Click Details
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recipient_phone VARCHAR(50),

    -- Metadata
    template_id VARCHAR(255),
    campaign_id VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for button_clicks
CREATE INDEX IF NOT EXISTS idx_button_clicks_tenant_id ON button_clicks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_button_clicks_message_id ON button_clicks(message_id);
CREATE INDEX IF NOT EXISTS idx_button_clicks_template_id ON button_clicks(template_id);
CREATE INDEX IF NOT EXISTS idx_button_clicks_clicked_at ON button_clicks(clicked_at);

-- ==================== TEMPLATE ANALYTICS DAILY TABLE ====================
-- Pre-aggregated daily stats
CREATE TABLE IF NOT EXISTS template_analytics_daily (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    template_id VARCHAR(255) NOT NULL,
    template_name VARCHAR(255),
    date DATE NOT NULL,

    -- Message Counts
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_read INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_replied INTEGER DEFAULT 0,

    -- Button Clicks
    total_button_clicks INTEGER DEFAULT 0,

    -- Timing Metrics (in seconds)
    avg_delivery_time DECIMAL(10, 2), -- Average time from sent to delivered
    avg_read_time DECIMAL(10, 2),     -- Average time from delivered to read
    avg_response_time DECIMAL(10, 2), -- Average time from read to reply

    -- Cost Metrics
    total_cost DECIMAL(10, 4) DEFAULT 0,
    avg_cost_per_message DECIMAL(10, 4),

    -- Engagement Rates
    delivery_rate DECIMAL(5, 2), -- Percentage
    read_rate DECIMAL(5, 2),     -- Percentage
    click_rate DECIMAL(5, 2),    -- Percentage
    reply_rate DECIMAL(5, 2),    -- Percentage

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint
    UNIQUE (tenant_id, template_id, date)
);

-- Indexes for template_analytics_daily
CREATE INDEX IF NOT EXISTS idx_template_analytics_daily_tenant_date ON template_analytics_daily(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_template_analytics_daily_template_date ON template_analytics_daily(template_id, date);

-- ==================== CAMPAIGN ANALYTICS TABLE ====================
-- Campaign-level aggregations
CREATE TABLE IF NOT EXISTS campaign_analytics (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    campaign_id VARCHAR(255) NOT NULL,
    campaign_name VARCHAR(255),

    -- Campaign Info
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50), -- 'active', 'completed', 'failed', 'paused'

    -- Recipient Stats
    total_recipients INTEGER DEFAULT 0,
    unique_recipients INTEGER DEFAULT 0,

    -- Message Stats
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_read INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_replied INTEGER DEFAULT 0,
    total_button_clicks INTEGER DEFAULT 0,

    -- Cost Stats
    total_cost DECIMAL(10, 4) DEFAULT 0,
    avg_cost_per_recipient DECIMAL(10, 4),

    -- Engagement Metrics
    delivery_rate DECIMAL(5, 2),
    read_rate DECIMAL(5, 2),
    click_rate DECIMAL(5, 2),
    reply_rate DECIMAL(5, 2),

    -- ROI Metrics (if applicable)
    conversions INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5, 2),
    revenue DECIMAL(10, 2),
    roi DECIMAL(10, 2),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for campaign_analytics
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_tenant_id ON campaign_analytics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign_id ON campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_started_at ON campaign_analytics(started_at);

-- ==================== HOURLY ANALYTICS TABLE ====================
-- Real-time hourly aggregations
CREATE TABLE IF NOT EXISTS hourly_analytics (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    hour_start TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Message Counts
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_read INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_replied INTEGER DEFAULT 0,
    total_button_clicks INTEGER DEFAULT 0,

    -- Cost
    total_cost DECIMAL(10, 4) DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint
    UNIQUE (tenant_id, hour_start)
);

-- Indexes for hourly_analytics
CREATE INDEX IF NOT EXISTS idx_hourly_analytics_tenant_hour ON hourly_analytics(tenant_id, hour_start);

-- ==================== HELPER FUNCTIONS ====================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating updated_at
CREATE TRIGGER update_message_events_updated_at BEFORE UPDATE ON message_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_template_analytics_daily_updated_at BEFORE UPDATE ON template_analytics_daily
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_analytics_updated_at BEFORE UPDATE ON campaign_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hourly_analytics_updated_at BEFORE UPDATE ON hourly_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== VIEWS FOR COMMON QUERIES ====================

-- View for recent message events (last 7 days)
CREATE OR REPLACE VIEW recent_message_events AS
SELECT * FROM message_events
WHERE sent_at >= NOW() - INTERVAL '7 days'
ORDER BY sent_at DESC;

-- View for daily message summary
CREATE OR REPLACE VIEW daily_message_summary AS
SELECT
    tenant_id,
    DATE(sent_at) as date,
    COUNT(*) as total_sent,
    COUNT(delivered_at) as total_delivered,
    COUNT(read_at) as total_read,
    COUNT(failed_at) as total_failed,
    COUNT(replied_at) as total_replied,
    SUM(cost) as total_cost,
    ROUND((COUNT(delivered_at)::DECIMAL / NULLIF(COUNT(*), 0) * 100)::NUMERIC, 2) as delivery_rate,
    ROUND((COUNT(read_at)::DECIMAL / NULLIF(COUNT(delivered_at), 0) * 100)::NUMERIC, 2) as read_rate
FROM message_events
GROUP BY tenant_id, DATE(sent_at)
ORDER BY date DESC;

-- ==================== SAMPLE DATA CLEANUP ====================

-- Function to clean up old analytics data (older than 1 year)
CREATE OR REPLACE FUNCTION cleanup_old_analytics()
RETURNS void AS $$
BEGIN
    DELETE FROM message_events WHERE sent_at < NOW() - INTERVAL '1 year';
    DELETE FROM button_clicks WHERE clicked_at < NOW() - INTERVAL '1 year';
    DELETE FROM template_analytics_daily WHERE date < NOW() - INTERVAL '1 year';
    DELETE FROM hourly_analytics WHERE hour_start < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- ==================== GRANT PERMISSIONS ====================
-- Grant necessary permissions to your application user
-- Replace 'your_app_user' with your actual database user

-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
