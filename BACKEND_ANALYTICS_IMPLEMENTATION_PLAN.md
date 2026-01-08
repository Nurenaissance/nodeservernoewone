# WhatsApp Business Analytics - Backend Implementation Plan

## Overview
This document provides a complete implementation plan for building a robust, accurate analytics system for WhatsApp Business messaging on a Node.js backend. This will replace reliance on Facebook's analytics API with your own event-driven tracking system.

## Table of Contents
1. [Database Schema](#database-schema)
2. [Event Tracking System](#event-tracking-system)
3. [API Endpoints](#api-endpoints)
4. [Webhook Handlers](#webhook-handlers)
5. [Data Aggregation](#data-aggregation)
6. [Caching Strategy](#caching-strategy)
7. [Implementation Code](#implementation-code)

---

## 1. Database Schema

### Tables Required

#### 1.1 `message_events` - Main event tracking table
```sql
CREATE TABLE message_events (
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_template_id (template_id),
    INDEX idx_sent_at (sent_at),
    INDEX idx_recipient_phone (recipient_phone),
    INDEX idx_campaign_id (campaign_id),
    INDEX idx_current_status (current_status),
    INDEX idx_tenant_sent_at (tenant_id, sent_at)
);
```

#### 1.2 `button_clicks` - Track button interactions
```sql
CREATE TABLE button_clicks (
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_message_id (message_id),
    INDEX idx_template_id (template_id),
    INDEX idx_clicked_at (clicked_at),

    FOREIGN KEY (message_id) REFERENCES message_events(message_id) ON DELETE CASCADE
);
```

#### 1.3 `template_analytics_daily` - Pre-aggregated daily stats
```sql
CREATE TABLE template_analytics_daily (
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
    UNIQUE (tenant_id, template_id, date),

    -- Indexes
    INDEX idx_tenant_date (tenant_id, date),
    INDEX idx_template_date (template_id, date)
);
```

#### 1.4 `campaign_analytics` - Campaign-level aggregations
```sql
CREATE TABLE campaign_analytics (
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_campaign_id (campaign_id),
    INDEX idx_started_at (started_at)
);
```

#### 1.5 `hourly_analytics` - Real-time hourly aggregations
```sql
CREATE TABLE hourly_analytics (
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
    UNIQUE (tenant_id, hour_start),

    -- Indexes
    INDEX idx_tenant_hour (tenant_id, hour_start)
);
```

---

## 2. Event Tracking System

### 2.1 Event Types to Track

```javascript
// Event types
const EVENT_TYPES = {
  MESSAGE_SENT: 'message.sent',
  MESSAGE_DELIVERED: 'message.delivered',
  MESSAGE_READ: 'message.read',
  MESSAGE_FAILED: 'message.failed',
  MESSAGE_REPLIED: 'message.replied',
  BUTTON_CLICKED: 'button.clicked',
  CONVERSATION_STARTED: 'conversation.started',
  CONVERSATION_ENDED: 'conversation.ended'
};

// Message statuses
const MESSAGE_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
  REPLIED: 'replied'
};
```

### 2.2 Event Data Structure

```javascript
// Example event payload
const messageEvent = {
  eventType: 'message.sent',
  tenantId: 'ai',
  messageId: 'wamid.xxx',
  templateId: '123456',
  templateName: 'welcome_message',
  recipientPhone: '919876543210',
  recipientName: 'John Doe',
  contactId: 12345,
  campaignId: 'campaign_001',
  broadcastGroupId: 5,
  messageType: 'template',
  conversationCategory: 'marketing',
  cost: 0.065,
  currency: 'INR',
  timestamp: new Date().toISOString(),
  metadata: {
    // Additional custom fields
  }
};
```

---

## 3. API Endpoints

### 3.1 Event Tracking Endpoints

#### POST `/api/analytics/track-event`
Track a message event (sent, delivered, read, etc.)

```javascript
// Request Body
{
  "eventType": "message.sent",
  "tenantId": "ai",
  "messageId": "wamid.xxx",
  "templateId": "123456",
  "templateName": "welcome_message",
  "recipientPhone": "919876543210",
  "recipientName": "John Doe",
  "contactId": 12345,
  "campaignId": "campaign_001",
  "messageType": "template",
  "conversationCategory": "marketing",
  "cost": 0.065,
  "timestamp": "2026-01-05T10:30:00Z"
}

// Response
{
  "success": true,
  "eventId": 12345,
  "message": "Event tracked successfully"
}
```

#### POST `/api/analytics/track-button-click`
Track button interactions

```javascript
// Request Body
{
  "tenantId": "ai",
  "messageId": "wamid.xxx",
  "buttonId": "btn_1",
  "buttonText": "Learn More",
  "buttonType": "url",
  "buttonIndex": 0,
  "recipientPhone": "919876543210",
  "templateId": "123456",
  "campaignId": "campaign_001",
  "timestamp": "2026-01-05T10:35:00Z"
}

// Response
{
  "success": true,
  "clickId": 67890,
  "message": "Button click tracked successfully"
}
```

### 3.2 Analytics Retrieval Endpoints

#### GET `/api/analytics/overview`
Get overall analytics for a tenant

```javascript
// Query Parameters
?tenantId=ai
&startDate=2026-01-01
&endDate=2026-01-31

// Response
{
  "success": true,
  "data": {
    "totalSent": 10000,
    "totalDelivered": 9500,
    "totalRead": 7200,
    "totalFailed": 500,
    "totalReplied": 1200,
    "totalButtonClicks": 850,
    "totalCost": 650.00,
    "deliveryRate": 95.00,
    "readRate": 75.79,
    "clickRate": 11.81,
    "replyRate": 16.67,
    "avgCostPerMessage": 0.065,
    "avgDeliveryTime": 2.5, // seconds
    "avgReadTime": 45.3,    // seconds
    "avgResponseTime": 320.5 // seconds
  }
}
```

#### GET `/api/analytics/template/:templateId`
Get analytics for a specific template

```javascript
// Query Parameters
?tenantId=ai
&startDate=2026-01-01
&endDate=2026-01-31
&granularity=daily // or 'hourly', 'weekly', 'monthly'

// Response
{
  "success": true,
  "templateId": "123456",
  "templateName": "welcome_message",
  "data": {
    "summary": {
      "totalSent": 500,
      "totalDelivered": 475,
      "totalRead": 380,
      "totalFailed": 25,
      "totalReplied": 65,
      "totalButtonClicks": 42,
      "totalCost": 32.50,
      "deliveryRate": 95.00,
      "readRate": 80.00,
      "clickRate": 11.05,
      "replyRate": 17.11
    },
    "dailyData": [
      {
        "date": "2026-01-01",
        "sent": 50,
        "delivered": 48,
        "read": 40,
        "failed": 2,
        "replied": 8,
        "buttonClicks": 5,
        "cost": 3.25
      },
      // ... more days
    ]
  }
}
```

#### GET `/api/analytics/campaign/:campaignId`
Get analytics for a specific campaign

```javascript
// Response
{
  "success": true,
  "campaignId": "campaign_001",
  "campaignName": "Holiday Sale",
  "data": {
    "status": "completed",
    "startedAt": "2026-01-01T00:00:00Z",
    "completedAt": "2026-01-05T23:59:59Z",
    "totalRecipients": 1000,
    "uniqueRecipients": 950,
    "totalSent": 1000,
    "totalDelivered": 950,
    "totalRead": 720,
    "totalFailed": 50,
    "totalReplied": 120,
    "totalButtonClicks": 85,
    "totalCost": 65.00,
    "deliveryRate": 95.00,
    "readRate": 75.79,
    "clickRate": 11.81,
    "replyRate": 16.67,
    "conversions": 35,
    "conversionRate": 4.86,
    "revenue": 35000.00,
    "roi": 53746.15
  }
}
```

#### GET `/api/analytics/real-time`
Get real-time analytics (last 24 hours, hourly breakdown)

```javascript
// Query Parameters
?tenantId=ai

// Response
{
  "success": true,
  "data": {
    "currentHour": {
      "sent": 45,
      "delivered": 42,
      "read": 30,
      "failed": 3,
      "replied": 5,
      "buttonClicks": 4,
      "cost": 2.93
    },
    "last24Hours": [
      {
        "hour": "2026-01-05T00:00:00Z",
        "sent": 120,
        "delivered": 115,
        "read": 90,
        "failed": 5,
        "replied": 15,
        "buttonClicks": 10,
        "cost": 7.80
      },
      // ... 23 more hours
    ],
    "trends": {
      "sentTrend": "+12%",      // compared to previous 24h
      "deliveryTrend": "+5%",
      "readTrend": "+8%"
    }
  }
}
```

#### GET `/api/analytics/top-templates`
Get top performing templates

```javascript
// Query Parameters
?tenantId=ai
&startDate=2026-01-01
&endDate=2026-01-31
&sortBy=engagement // or 'sent', 'delivered', 'read', 'clicks', 'cost'
&limit=10

// Response
{
  "success": true,
  "data": [
    {
      "templateId": "123456",
      "templateName": "welcome_message",
      "totalSent": 5000,
      "totalDelivered": 4750,
      "totalRead": 3800,
      "totalButtonClicks": 420,
      "deliveryRate": 95.00,
      "readRate": 80.00,
      "clickRate": 11.05,
      "totalCost": 325.00,
      "engagementScore": 87.5 // Weighted score
    },
    // ... more templates
  ]
}
```

#### GET `/api/analytics/button-performance`
Get button click analytics

```javascript
// Query Parameters
?tenantId=ai
&startDate=2026-01-01
&endDate=2026-01-31
&templateId=123456 // optional

// Response
{
  "success": true,
  "data": {
    "totalClicks": 850,
    "byButton": [
      {
        "buttonId": "btn_1",
        "buttonText": "Learn More",
        "buttonType": "url",
        "buttonIndex": 0,
        "totalClicks": 520,
        "clickRate": 61.18,
        "avgPosition": 1
      },
      {
        "buttonId": "btn_2",
        "buttonText": "Buy Now",
        "buttonType": "url",
        "buttonIndex": 1,
        "totalClicks": 330,
        "clickRate": 38.82,
        "avgPosition": 2
      }
    ],
    "byTemplate": [
      {
        "templateId": "123456",
        "templateName": "welcome_message",
        "totalClicks": 420,
        "clickRate": 49.41
      },
      // ... more templates
    ]
  }
}
```

#### POST `/api/analytics/custom-report`
Generate custom analytics report

```javascript
// Request Body
{
  "tenantId": "ai",
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "metrics": ["sent", "delivered", "read", "clicks", "cost"],
  "groupBy": "template", // or 'campaign', 'day', 'hour', 'contact'
  "filters": {
    "templateIds": ["123456", "789012"],
    "campaignIds": ["campaign_001"],
    "status": ["delivered", "read"]
  }
}

// Response
{
  "success": true,
  "reportId": "report_abc123",
  "data": [
    // Customized data based on request
  ],
  "metadata": {
    "generatedAt": "2026-01-05T10:30:00Z",
    "totalRecords": 150,
    "timeRange": "30 days"
  }
}
```

---

## 4. Webhook Handlers

### 4.1 WhatsApp Status Webhook Handler

```javascript
// POST /webhook/whatsapp-status
// This endpoint receives status updates from WhatsApp Cloud API

app.post('/webhook/whatsapp-status', async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry || !entry[0]?.changes) {
      return res.sendStatus(200);
    }

    for (const change of entry[0].changes) {
      const { value } = change;

      // Handle message status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await handleMessageStatus(status);
        }
      }

      // Handle incoming messages (for reply tracking)
      if (value.messages) {
        for (const message of value.messages) {
          await handleIncomingMessage(message);
        }
      }

      // Handle button clicks
      if (value.messages && value.messages[0]?.interactive) {
        await handleButtonClick(value.messages[0]);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// Handle message status updates
async function handleMessageStatus(status) {
  const { id: messageId, status: statusType, timestamp, errors } = status;

  const eventData = {
    messageId,
    timestamp: new Date(parseInt(timestamp) * 1000),
    status: statusType
  };

  switch (statusType) {
    case 'sent':
      await updateMessageEvent(messageId, {
        sent_at: eventData.timestamp,
        current_status: MESSAGE_STATUS.SENT
      });
      break;

    case 'delivered':
      await updateMessageEvent(messageId, {
        delivered_at: eventData.timestamp,
        current_status: MESSAGE_STATUS.DELIVERED
      });
      await incrementHourlyAnalytics(messageId, 'delivered');
      break;

    case 'read':
      await updateMessageEvent(messageId, {
        read_at: eventData.timestamp,
        current_status: MESSAGE_STATUS.READ
      });
      await incrementHourlyAnalytics(messageId, 'read');
      break;

    case 'failed':
      await updateMessageEvent(messageId, {
        failed_at: eventData.timestamp,
        current_status: MESSAGE_STATUS.FAILED,
        failure_reason: errors ? errors[0]?.error_data?.details : 'Unknown error'
      });
      await incrementHourlyAnalytics(messageId, 'failed');
      break;
  }

  // Trigger daily aggregation update
  await updateDailyAggregations(messageId);
}

// Handle incoming messages (replies)
async function handleIncomingMessage(message) {
  const { from, context, timestamp } = message;

  // Check if this is a reply to a template message
  if (context && context.id) {
    const replyToMessageId = context.id;

    await updateMessageEvent(replyToMessageId, {
      replied_at: new Date(parseInt(timestamp) * 1000),
      current_status: MESSAGE_STATUS.REPLIED
    });

    await incrementHourlyAnalytics(replyToMessageId, 'replied');
    await updateDailyAggregations(replyToMessageId);
  }
}

// Handle button clicks
async function handleButtonClick(message) {
  const { from, interactive, context, timestamp } = message;

  if (interactive && interactive.button_reply) {
    const buttonData = {
      messageId: context?.id,
      recipientPhone: from,
      buttonId: interactive.button_reply.id,
      buttonText: interactive.button_reply.title,
      clickedAt: new Date(parseInt(timestamp) * 1000)
    };

    await trackButtonClick(buttonData);
    await incrementHourlyAnalytics(buttonData.messageId, 'button_click');
    await updateDailyAggregations(buttonData.messageId);
  }
}
```

### 4.2 Message Sending Tracker

```javascript
// Track when messages are sent
async function trackMessageSend(messageData) {
  const {
    tenantId,
    messageId,
    templateId,
    templateName,
    recipientPhone,
    recipientName,
    contactId,
    campaignId,
    broadcastGroupId,
    messageType,
    conversationCategory,
    cost
  } = messageData;

  // Insert into message_events
  await db.query(`
    INSERT INTO message_events (
      tenant_id, message_id, template_id, template_name,
      recipient_phone, recipient_name, contact_id,
      campaign_id, broadcast_group_id, message_type,
      conversation_category, cost, current_status, sent_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
    ON CONFLICT (message_id) DO UPDATE SET
      sent_at = NOW(),
      current_status = 'sent',
      updated_at = NOW()
  `, [
    tenantId, messageId, templateId, templateName,
    recipientPhone, recipientName, contactId,
    campaignId, broadcastGroupId, messageType,
    conversationCategory, cost, MESSAGE_STATUS.SENT
  ]);

  // Update hourly analytics
  await incrementHourlyAnalytics(messageId, 'sent');

  // Update campaign analytics
  if (campaignId) {
    await incrementCampaignMetric(tenantId, campaignId, 'total_sent');
  }
}
```

---

## 5. Data Aggregation

### 5.1 Scheduled Aggregation Jobs

```javascript
// Run daily at midnight to aggregate previous day's data
const cron = require('node-cron');

// Daily aggregation - runs at 00:05 every day
cron.schedule('5 0 * * *', async () => {
  console.log('Running daily analytics aggregation...');
  await aggregateDailyAnalytics(new Date(Date.now() - 86400000)); // Yesterday
});

// Hourly aggregation - runs every hour at :02
cron.schedule('2 * * * *', async () => {
  console.log('Running hourly analytics aggregation...');
  await aggregateHourlyAnalytics();
});

// Campaign completion check - runs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('Checking for completed campaigns...');
  await checkCompletedCampaigns();
});
```

### 5.2 Aggregation Functions

```javascript
// Aggregate daily analytics for all templates
async function aggregateDailyAnalytics(date) {
  const dateStr = date.toISOString().split('T')[0];

  const query = `
    INSERT INTO template_analytics_daily (
      tenant_id, template_id, template_name, date,
      total_sent, total_delivered, total_read, total_failed, total_replied,
      total_button_clicks, avg_delivery_time, avg_read_time, avg_response_time,
      total_cost, avg_cost_per_message,
      delivery_rate, read_rate, click_rate, reply_rate
    )
    SELECT
      me.tenant_id,
      me.template_id,
      me.template_name,
      DATE(me.sent_at) as date,
      COUNT(*) as total_sent,
      COUNT(me.delivered_at) as total_delivered,
      COUNT(me.read_at) as total_read,
      COUNT(me.failed_at) as total_failed,
      COUNT(me.replied_at) as total_replied,
      COALESCE(bc.click_count, 0) as total_button_clicks,
      AVG(EXTRACT(EPOCH FROM (me.delivered_at - me.sent_at))) as avg_delivery_time,
      AVG(EXTRACT(EPOCH FROM (me.read_at - me.delivered_at))) as avg_read_time,
      AVG(EXTRACT(EPOCH FROM (me.replied_at - me.read_at))) as avg_response_time,
      SUM(me.cost) as total_cost,
      AVG(me.cost) as avg_cost_per_message,
      (COUNT(me.delivered_at)::DECIMAL / NULLIF(COUNT(*), 0) * 100) as delivery_rate,
      (COUNT(me.read_at)::DECIMAL / NULLIF(COUNT(me.delivered_at), 0) * 100) as read_rate,
      (COALESCE(bc.click_count, 0)::DECIMAL / NULLIF(COUNT(me.delivered_at), 0) * 100) as click_rate,
      (COUNT(me.replied_at)::DECIMAL / NULLIF(COUNT(me.read_at), 0) * 100) as reply_rate
    FROM message_events me
    LEFT JOIN (
      SELECT message_id, COUNT(*) as click_count
      FROM button_clicks
      WHERE DATE(clicked_at) = $1
      GROUP BY message_id
    ) bc ON me.message_id = bc.message_id
    WHERE DATE(me.sent_at) = $1
      AND me.template_id IS NOT NULL
    GROUP BY me.tenant_id, me.template_id, me.template_name, DATE(me.sent_at), bc.click_count
    ON CONFLICT (tenant_id, template_id, date) DO UPDATE SET
      total_sent = EXCLUDED.total_sent,
      total_delivered = EXCLUDED.total_delivered,
      total_read = EXCLUDED.total_read,
      total_failed = EXCLUDED.total_failed,
      total_replied = EXCLUDED.total_replied,
      total_button_clicks = EXCLUDED.total_button_clicks,
      avg_delivery_time = EXCLUDED.avg_delivery_time,
      avg_read_time = EXCLUDED.avg_read_time,
      avg_response_time = EXCLUDED.avg_response_time,
      total_cost = EXCLUDED.total_cost,
      avg_cost_per_message = EXCLUDED.avg_cost_per_message,
      delivery_rate = EXCLUDED.delivery_rate,
      read_rate = EXCLUDED.read_rate,
      click_rate = EXCLUDED.click_rate,
      reply_rate = EXCLUDED.reply_rate,
      updated_at = NOW()
  `;

  await db.query(query, [dateStr]);
  console.log(`Daily aggregation completed for ${dateStr}`);
}

// Aggregate hourly analytics
async function aggregateHourlyAnalytics() {
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);
  hourStart.setHours(hourStart.getHours() - 1); // Previous hour

  const query = `
    INSERT INTO hourly_analytics (
      tenant_id, hour_start,
      total_sent, total_delivered, total_read, total_failed, total_replied,
      total_button_clicks, total_cost
    )
    SELECT
      me.tenant_id,
      DATE_TRUNC('hour', me.sent_at) as hour_start,
      COUNT(*) as total_sent,
      COUNT(me.delivered_at) as total_delivered,
      COUNT(me.read_at) as total_read,
      COUNT(me.failed_at) as total_failed,
      COUNT(me.replied_at) as total_replied,
      COALESCE(SUM(bc.click_count), 0) as total_button_clicks,
      SUM(me.cost) as total_cost
    FROM message_events me
    LEFT JOIN (
      SELECT message_id, COUNT(*) as click_count
      FROM button_clicks
      WHERE clicked_at >= $1 AND clicked_at < $2
      GROUP BY message_id
    ) bc ON me.message_id = bc.message_id
    WHERE me.sent_at >= $1 AND me.sent_at < $2
    GROUP BY me.tenant_id, DATE_TRUNC('hour', me.sent_at)
    ON CONFLICT (tenant_id, hour_start) DO UPDATE SET
      total_sent = EXCLUDED.total_sent,
      total_delivered = EXCLUDED.total_delivered,
      total_read = EXCLUDED.total_read,
      total_failed = EXCLUDED.total_failed,
      total_replied = EXCLUDED.total_replied,
      total_button_clicks = EXCLUDED.total_button_clicks,
      total_cost = EXCLUDED.total_cost,
      updated_at = NOW()
  `;

  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hourEnd.getHours() + 1);

  await db.query(query, [hourStart, hourEnd]);
  console.log(`Hourly aggregation completed for ${hourStart.toISOString()}`);
}

// Update campaign analytics
async function updateCampaignAnalytics(campaignId) {
  const query = `
    UPDATE campaign_analytics ca
    SET
      total_sent = stats.total_sent,
      total_delivered = stats.total_delivered,
      total_read = stats.total_read,
      total_failed = stats.total_failed,
      total_replied = stats.total_replied,
      total_button_clicks = stats.total_button_clicks,
      total_cost = stats.total_cost,
      delivery_rate = (stats.total_delivered::DECIMAL / NULLIF(stats.total_sent, 0) * 100),
      read_rate = (stats.total_read::DECIMAL / NULLIF(stats.total_delivered, 0) * 100),
      click_rate = (stats.total_button_clicks::DECIMAL / NULLIF(stats.total_delivered, 0) * 100),
      reply_rate = (stats.total_replied::DECIMAL / NULLIF(stats.total_read, 0) * 100),
      avg_cost_per_recipient = (stats.total_cost::DECIMAL / NULLIF(stats.unique_recipients, 0)),
      updated_at = NOW()
    FROM (
      SELECT
        me.campaign_id,
        COUNT(*) as total_sent,
        COUNT(me.delivered_at) as total_delivered,
        COUNT(me.read_at) as total_read,
        COUNT(me.failed_at) as total_failed,
        COUNT(me.replied_at) as total_replied,
        COUNT(DISTINCT me.recipient_phone) as unique_recipients,
        COALESCE(SUM(bc.click_count), 0) as total_button_clicks,
        SUM(me.cost) as total_cost
      FROM message_events me
      LEFT JOIN (
        SELECT message_id, COUNT(*) as click_count
        FROM button_clicks
        GROUP BY message_id
      ) bc ON me.message_id = bc.message_id
      WHERE me.campaign_id = $1
      GROUP BY me.campaign_id
    ) stats
    WHERE ca.campaign_id = $1
  `;

  await db.query(query, [campaignId]);
}
```

---

## 6. Caching Strategy

### 6.1 Redis Caching Layer

```javascript
const Redis = require('ioredis');
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
});

// Cache keys
const CACHE_KEYS = {
  OVERVIEW: (tenantId, startDate, endDate) =>
    `analytics:overview:${tenantId}:${startDate}:${endDate}`,
  TEMPLATE: (tenantId, templateId, startDate, endDate) =>
    `analytics:template:${tenantId}:${templateId}:${startDate}:${endDate}`,
  CAMPAIGN: (tenantId, campaignId) =>
    `analytics:campaign:${tenantId}:${campaignId}`,
  REALTIME: (tenantId) =>
    `analytics:realtime:${tenantId}`,
  TOP_TEMPLATES: (tenantId, startDate, endDate, sortBy) =>
    `analytics:top:${tenantId}:${startDate}:${endDate}:${sortBy}`
};

// Cache TTL (in seconds)
const CACHE_TTL = {
  OVERVIEW: 300,      // 5 minutes
  TEMPLATE: 300,      // 5 minutes
  CAMPAIGN: 600,      // 10 minutes
  REALTIME: 60,       // 1 minute
  TOP_TEMPLATES: 600  // 10 minutes
};

// Get cached data or fetch from DB
async function getCachedOrFetch(cacheKey, ttl, fetchFunction) {
  try {
    // Try to get from cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const data = await fetchFunction();

    // Store in cache
    await redis.setex(cacheKey, ttl, JSON.stringify(data));

    return data;
  } catch (error) {
    console.error('Cache error:', error);
    // Fallback to direct fetch
    return await fetchFunction();
  }
}

// Invalidate cache on events
async function invalidateAnalyticsCache(tenantId, templateId = null, campaignId = null) {
  const patterns = [
    `analytics:overview:${tenantId}:*`,
    `analytics:realtime:${tenantId}`,
    `analytics:top:${tenantId}:*`
  ];

  if (templateId) {
    patterns.push(`analytics:template:${tenantId}:${templateId}:*`);
  }

  if (campaignId) {
    patterns.push(`analytics:campaign:${tenantId}:${campaignId}`);
  }

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

### 6.2 Real-time Updates with Redis Pub/Sub

```javascript
// Publisher (when events occur)
async function publishAnalyticsUpdate(tenantId, eventType, data) {
  await redis.publish(`analytics:updates:${tenantId}`, JSON.stringify({
    eventType,
    data,
    timestamp: new Date().toISOString()
  }));
}

// Subscriber (WebSocket server or SSE)
const subscriber = new Redis();

subscriber.subscribe('analytics:updates:*', (err, count) => {
  if (err) {
    console.error('Failed to subscribe:', err);
  } else {
    console.log(`Subscribed to ${count} channels`);
  }
});

subscriber.on('message', (channel, message) => {
  const tenantId = channel.split(':')[2];
  const update = JSON.parse(message);

  // Emit to WebSocket clients
  io.to(`analytics:${tenantId}`).emit('analytics-update', update);
});
```

---

## 7. Implementation Code

### 7.1 Complete Express.js API Implementation

```javascript
const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const axios = require('axios');

const app = express();
app.use(express.json());

// Database connection
const db = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

// ==================== EVENT TRACKING ENDPOINTS ====================

// Track message event
app.post('/api/analytics/track-event', async (req, res) => {
  try {
    const {
      eventType,
      tenantId,
      messageId,
      templateId,
      templateName,
      recipientPhone,
      recipientName,
      contactId,
      campaignId,
      broadcastGroupId,
      messageType,
      conversationCategory,
      cost,
      timestamp
    } = req.body;

    // Validate required fields
    if (!tenantId || !messageId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tenantId, messageId'
      });
    }

    let statusField = '';
    let statusValue = null;

    switch (eventType) {
      case 'message.sent':
        statusField = 'sent_at';
        statusValue = MESSAGE_STATUS.SENT;
        break;
      case 'message.delivered':
        statusField = 'delivered_at';
        statusValue = MESSAGE_STATUS.DELIVERED;
        break;
      case 'message.read':
        statusField = 'read_at';
        statusValue = MESSAGE_STATUS.READ;
        break;
      case 'message.failed':
        statusField = 'failed_at';
        statusValue = MESSAGE_STATUS.FAILED;
        break;
      case 'message.replied':
        statusField = 'replied_at';
        statusValue = MESSAGE_STATUS.REPLIED;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid event type'
        });
    }

    // Insert or update message event
    const query = `
      INSERT INTO message_events (
        tenant_id, message_id, template_id, template_name,
        recipient_phone, recipient_name, contact_id,
        campaign_id, broadcast_group_id, message_type,
        conversation_category, cost, current_status, ${statusField}
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (message_id) DO UPDATE SET
        ${statusField} = EXCLUDED.${statusField},
        current_status = EXCLUDED.current_status,
        updated_at = NOW()
      RETURNING id
    `;

    const result = await db.query(query, [
      tenantId, messageId, templateId, templateName,
      recipientPhone, recipientName, contactId,
      campaignId, broadcastGroupId, messageType,
      conversationCategory, cost || 0, statusValue,
      timestamp || new Date()
    ]);

    // Invalidate cache
    await invalidateAnalyticsCache(tenantId, templateId, campaignId);

    // Publish real-time update
    await publishAnalyticsUpdate(tenantId, eventType, {
      messageId,
      templateId,
      status: statusValue
    });

    res.json({
      success: true,
      eventId: result.rows[0].id,
      message: 'Event tracked successfully'
    });

  } catch (error) {
    console.error('Error tracking event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track event',
      error: error.message
    });
  }
});

// Track button click
app.post('/api/analytics/track-button-click', async (req, res) => {
  try {
    const {
      tenantId,
      messageId,
      buttonId,
      buttonText,
      buttonType,
      buttonIndex,
      recipientPhone,
      templateId,
      campaignId,
      timestamp
    } = req.body;

    if (!tenantId || !messageId || !buttonId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const query = `
      INSERT INTO button_clicks (
        tenant_id, message_id, button_id, button_text,
        button_type, button_index, recipient_phone,
        template_id, campaign_id, clicked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const result = await db.query(query, [
      tenantId, messageId, buttonId, buttonText,
      buttonType, buttonIndex, recipientPhone,
      templateId, campaignId, timestamp || new Date()
    ]);

    // Invalidate cache
    await invalidateAnalyticsCache(tenantId, templateId, campaignId);

    res.json({
      success: true,
      clickId: result.rows[0].id,
      message: 'Button click tracked successfully'
    });

  } catch (error) {
    console.error('Error tracking button click:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track button click',
      error: error.message
    });
  }
});

// ==================== ANALYTICS RETRIEVAL ENDPOINTS ====================

// Get overview analytics
app.get('/api/analytics/overview', async (req, res) => {
  try {
    const { tenantId, startDate, endDate } = req.query;

    if (!tenantId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameters'
      });
    }

    const cacheKey = CACHE_KEYS.OVERVIEW(tenantId, startDate, endDate);

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.OVERVIEW, async () => {
      const query = `
        SELECT
          COUNT(*) as total_sent,
          COUNT(delivered_at) as total_delivered,
          COUNT(read_at) as total_read,
          COUNT(failed_at) as total_failed,
          COUNT(replied_at) as total_replied,
          SUM(cost) as total_cost,
          AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at))) as avg_delivery_time,
          AVG(EXTRACT(EPOCH FROM (read_at - delivered_at))) as avg_read_time,
          AVG(EXTRACT(EPOCH FROM (replied_at - read_at))) as avg_response_time,
          (COUNT(delivered_at)::DECIMAL / NULLIF(COUNT(*), 0) * 100) as delivery_rate,
          (COUNT(read_at)::DECIMAL / NULLIF(COUNT(delivered_at), 0) * 100) as read_rate,
          (COUNT(replied_at)::DECIMAL / NULLIF(COUNT(read_at), 0) * 100) as reply_rate,
          AVG(cost) as avg_cost_per_message
        FROM message_events
        WHERE tenant_id = $1
          AND sent_at >= $2
          AND sent_at <= $3
      `;

      const result = await db.query(query, [tenantId, startDate, endDate]);

      // Get button clicks separately
      const clicksQuery = `
        SELECT COUNT(*) as total_button_clicks
        FROM button_clicks bc
        JOIN message_events me ON bc.message_id = me.message_id
        WHERE me.tenant_id = $1
          AND bc.clicked_at >= $2
          AND bc.clicked_at <= $3
      `;

      const clicksResult = await db.query(clicksQuery, [tenantId, startDate, endDate]);

      const stats = result.rows[0];
      const totalDelivered = parseInt(stats.total_delivered) || 1;

      return {
        totalSent: parseInt(stats.total_sent) || 0,
        totalDelivered: parseInt(stats.total_delivered) || 0,
        totalRead: parseInt(stats.total_read) || 0,
        totalFailed: parseInt(stats.total_failed) || 0,
        totalReplied: parseInt(stats.total_replied) || 0,
        totalButtonClicks: parseInt(clicksResult.rows[0].total_button_clicks) || 0,
        totalCost: parseFloat(stats.total_cost) || 0,
        deliveryRate: parseFloat(stats.delivery_rate) || 0,
        readRate: parseFloat(stats.read_rate) || 0,
        clickRate: ((parseInt(clicksResult.rows[0].total_button_clicks) || 0) / totalDelivered * 100).toFixed(2),
        replyRate: parseFloat(stats.reply_rate) || 0,
        avgCostPerMessage: parseFloat(stats.avg_cost_per_message) || 0,
        avgDeliveryTime: parseFloat(stats.avg_delivery_time) || 0,
        avgReadTime: parseFloat(stats.avg_read_time) || 0,
        avgResponseTime: parseFloat(stats.avg_response_time) || 0
      };
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching overview analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

// Get template analytics
app.get('/api/analytics/template/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { tenantId, startDate, endDate, granularity = 'daily' } = req.query;

    if (!tenantId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameters'
      });
    }

    const cacheKey = CACHE_KEYS.TEMPLATE(tenantId, templateId, startDate, endDate);

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.TEMPLATE, async () => {
      // Get summary
      const summaryQuery = `
        SELECT
          template_name,
          SUM(total_sent) as total_sent,
          SUM(total_delivered) as total_delivered,
          SUM(total_read) as total_read,
          SUM(total_failed) as total_failed,
          SUM(total_replied) as total_replied,
          SUM(total_button_clicks) as total_button_clicks,
          SUM(total_cost) as total_cost,
          AVG(delivery_rate) as delivery_rate,
          AVG(read_rate) as read_rate,
          AVG(click_rate) as click_rate,
          AVG(reply_rate) as reply_rate
        FROM template_analytics_daily
        WHERE tenant_id = $1
          AND template_id = $2
          AND date >= $3
          AND date <= $4
        GROUP BY template_name
      `;

      const summaryResult = await db.query(summaryQuery, [
        tenantId, templateId, startDate, endDate
      ]);

      // Get daily data
      const dailyQuery = `
        SELECT
          date,
          total_sent as sent,
          total_delivered as delivered,
          total_read as read,
          total_failed as failed,
          total_replied as replied,
          total_button_clicks as button_clicks,
          total_cost as cost
        FROM template_analytics_daily
        WHERE tenant_id = $1
          AND template_id = $2
          AND date >= $3
          AND date <= $4
        ORDER BY date ASC
      `;

      const dailyResult = await db.query(dailyQuery, [
        tenantId, templateId, startDate, endDate
      ]);

      const summary = summaryResult.rows[0] || {};

      return {
        templateId,
        templateName: summary.template_name || 'Unknown',
        summary: {
          totalSent: parseInt(summary.total_sent) || 0,
          totalDelivered: parseInt(summary.total_delivered) || 0,
          totalRead: parseInt(summary.total_read) || 0,
          totalFailed: parseInt(summary.total_failed) || 0,
          totalReplied: parseInt(summary.total_replied) || 0,
          totalButtonClicks: parseInt(summary.total_button_clicks) || 0,
          totalCost: parseFloat(summary.total_cost) || 0,
          deliveryRate: parseFloat(summary.delivery_rate) || 0,
          readRate: parseFloat(summary.read_rate) || 0,
          clickRate: parseFloat(summary.click_rate) || 0,
          replyRate: parseFloat(summary.reply_rate) || 0
        },
        dailyData: dailyResult.rows
      };
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching template analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template analytics',
      error: error.message
    });
  }
});

// Get real-time analytics
app.get('/api/analytics/real-time', async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Missing tenantId parameter'
      });
    }

    const cacheKey = CACHE_KEYS.REALTIME(tenantId);

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.REALTIME, async () => {
      // Current hour stats
      const currentHourQuery = `
        SELECT
          total_sent as sent,
          total_delivered as delivered,
          total_read as read,
          total_failed as failed,
          total_replied as replied,
          total_button_clicks as button_clicks,
          total_cost as cost
        FROM hourly_analytics
        WHERE tenant_id = $1
          AND hour_start = DATE_TRUNC('hour', NOW())
      `;

      const currentHourResult = await db.query(currentHourQuery, [tenantId]);

      // Last 24 hours
      const last24HoursQuery = `
        SELECT
          hour_start as hour,
          total_sent as sent,
          total_delivered as delivered,
          total_read as read,
          total_failed as failed,
          total_replied as replied,
          total_button_clicks as button_clicks,
          total_cost as cost
        FROM hourly_analytics
        WHERE tenant_id = $1
          AND hour_start >= NOW() - INTERVAL '24 hours'
        ORDER BY hour_start ASC
      `;

      const last24HoursResult = await db.query(last24HoursQuery, [tenantId]);

      return {
        currentHour: currentHourResult.rows[0] || {
          sent: 0, delivered: 0, read: 0, failed: 0,
          replied: 0, button_clicks: 0, cost: 0
        },
        last24Hours: last24HoursResult.rows
      };
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching real-time analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch real-time analytics',
      error: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Analytics API server running on port ${PORT}`);
});
```

### 7.2 Helper Functions

```javascript
// message_events.js - Database helper functions

async function updateMessageEvent(messageId, updates) {
  const fields = [];
  const values = [messageId];
  let paramIndex = 2;

  Object.entries(updates).forEach(([key, value]) => {
    fields.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  });

  if (fields.length === 0) return;

  fields.push('updated_at = NOW()');

  const query = `
    UPDATE message_events
    SET ${fields.join(', ')}
    WHERE message_id = $1
  `;

  await db.query(query, values);
}

async function trackButtonClick(buttonData) {
  const {
    tenantId,
    messageId,
    buttonId,
    buttonText,
    buttonType,
    buttonIndex,
    recipientPhone,
    clickedAt
  } = buttonData;

  // Get template_id and campaign_id from message
  const messageQuery = `
    SELECT template_id, campaign_id
    FROM message_events
    WHERE message_id = $1
  `;

  const messageResult = await db.query(messageQuery, [messageId]);

  if (messageResult.rows.length === 0) {
    console.warn(`Message not found: ${messageId}`);
    return;
  }

  const { template_id, campaign_id } = messageResult.rows[0];

  const query = `
    INSERT INTO button_clicks (
      tenant_id, message_id, button_id, button_text,
      button_type, button_index, recipient_phone,
      template_id, campaign_id, clicked_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;

  await db.query(query, [
    tenantId, messageId, buttonId, buttonText,
    buttonType, buttonIndex, recipientPhone,
    template_id, campaign_id, clickedAt
  ]);
}

async function incrementHourlyAnalytics(messageId, metric) {
  // Get message details
  const messageQuery = `
    SELECT tenant_id, sent_at, cost
    FROM message_events
    WHERE message_id = $1
  `;

  const messageResult = await db.query(messageQuery, [messageId]);

  if (messageResult.rows.length === 0) return;

  const { tenant_id, sent_at, cost } = messageResult.rows[0];
  const hourStart = new Date(sent_at);
  hourStart.setMinutes(0, 0, 0);

  const metricColumn = `total_${metric}`;

  const query = `
    INSERT INTO hourly_analytics (tenant_id, hour_start, ${metricColumn}, total_cost)
    VALUES ($1, $2, 1, $3)
    ON CONFLICT (tenant_id, hour_start) DO UPDATE SET
      ${metricColumn} = hourly_analytics.${metricColumn} + 1,
      ${metric === 'sent' ? 'total_cost = hourly_analytics.total_cost + EXCLUDED.total_cost,' : ''}
      updated_at = NOW()
  `;

  await db.query(query, [tenant_id, hourStart, cost || 0]);
}

async function updateDailyAggregations(messageId) {
  // Get message details
  const messageQuery = `
    SELECT tenant_id, template_id, DATE(sent_at) as date
    FROM message_events
    WHERE message_id = $1
  `;

  const messageResult = await db.query(messageQuery, [messageId]);

  if (messageResult.rows.length === 0) return;

  const { tenant_id, template_id, date } = messageResult.rows[0];

  // Re-aggregate for this template and date
  await aggregateDailyAnalytics(new Date(date));
}

module.exports = {
  updateMessageEvent,
  trackButtonClick,
  incrementHourlyAnalytics,
  updateDailyAggregations
};
```

---

## 8. Frontend Integration Changes

### 8.1 Update Message Sending to Track Events

```javascript
// When sending a message via WhatsApp API
async function sendTemplateMessage(templateData) {
  try {
    // Send via WhatsApp API
    const whatsappResponse = await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: templateData.recipientPhone,
        type: 'template',
        template: {
          name: templateData.templateName,
          language: { code: templateData.language }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );

    const messageId = whatsappResponse.data.messages[0].id;

    // Track the send event immediately
    await axios.post(`${BACKEND_URL}/api/analytics/track-event`, {
      eventType: 'message.sent',
      tenantId: localStorage.getItem('tenant_id'),
      messageId: messageId,
      templateId: templateData.templateId,
      templateName: templateData.templateName,
      recipientPhone: templateData.recipientPhone,
      recipientName: templateData.recipientName,
      contactId: templateData.contactId,
      campaignId: templateData.campaignId,
      broadcastGroupId: templateData.broadcastGroupId,
      messageType: 'template',
      conversationCategory: 'marketing', // or from template
      cost: 0.065, // Calculate based on conversation type
      timestamp: new Date().toISOString()
    });

    return { success: true, messageId };

  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}
```

### 8.2 Update Analytics Page to Use New Backend

```javascript
// Replace the fetchAnalyticsData function in AnalyticsPage.jsx

const fetchAnalyticsData = async () => {
  if (dataFetchingRef.current) return;
  dataFetchingRef.current = true;
  setLoading(true);

  try {
    const { startDate, endDate } = getDateRange(timeRange);

    console.log("Fetching analytics from backend...");

    // Fetch overview analytics
    const overviewResponse = await axiosFast.get('/api/analytics/overview', {
      params: {
        tenantId: localStorage.getItem('tenant_id'),
        startDate: new Date(startDate * 1000).toISOString().split('T')[0],
        endDate: new Date(endDate * 1000).toISOString().split('T')[0]
      },
      headers: {
        'X-Tenant-ID': localStorage.getItem('tenant_id')
      }
    });

    // Fetch template-specific analytics
    const templateAnalytics = await Promise.all(
      templates.map(async (template) => {
        const response = await axiosFast.get(`/api/analytics/template/${template.id}`, {
          params: {
            tenantId: localStorage.getItem('tenant_id'),
            startDate: new Date(startDate * 1000).toISOString().split('T')[0],
            endDate: new Date(endDate * 1000).toISOString().split('T')[0],
            granularity: 'daily'
          },
          headers: {
            'X-Tenant-ID': localStorage.getItem('tenant_id')
          }
        });
        return response.data.data;
      })
    );

    // Fetch button performance
    const buttonResponse = await axiosFast.get('/api/analytics/button-performance', {
      params: {
        tenantId: localStorage.getItem('tenant_id'),
        startDate: new Date(startDate * 1000).toISOString().split('T')[0],
        endDate: new Date(endDate * 1000).toISOString().split('T')[0]
      },
      headers: {
        'X-Tenant-ID': localStorage.getItem('tenant_id')
      }
    });

    // Process data
    const summaryMetrics = overviewResponse.data.data;

    // Combine all daily data from templates
    const allDailyData = {};
    templateAnalytics.forEach(template => {
      template.dailyData.forEach(day => {
        if (!allDailyData[day.date]) {
          allDailyData[day.date] = {
            date: format(new Date(day.date), 'MMM dd'),
            sent: 0,
            delivered: 0,
            read: 0,
            clicked: 0,
            cost: 0
          };
        }
        allDailyData[day.date].sent += day.sent || 0;
        allDailyData[day.date].delivered += day.delivered || 0;
        allDailyData[day.date].read += day.read || 0;
        allDailyData[day.date].clicked += day.button_clicks || 0;
        allDailyData[day.date].cost += parseFloat(day.cost) || 0;
      });
    });

    setAnalyticsData({
      summary: summaryMetrics,
      dailyData: Object.values(allDailyData),
      templatePerformance: templateAnalytics.map(t => ({
        name: t.templateName,
        ...t.summary,
        deliveryRate: t.summary.deliveryRate.toFixed(2),
        readRate: t.summary.readRate.toFixed(2),
        clickRate: t.summary.clickRate.toFixed(2)
      })),
      buttonClicks: buttonResponse.data.data.byButton || []
    });

    toast.success("Analytics data loaded successfully");
  } catch (error) {
    console.error("Error fetching analytics:", error);
    toast.error("Failed to load analytics data");
  } finally {
    setLoading(false);
    dataFetchingRef.current = false;
  }
};
```

---

## 9. Testing & Validation

### 9.1 Test Events

```bash
# Test message sent event
curl -X POST http://localhost:3000/api/analytics/track-event \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "message.sent",
    "tenantId": "ai",
    "messageId": "wamid.test123",
    "templateId": "123456",
    "templateName": "welcome_message",
    "recipientPhone": "919876543210",
    "messageType": "template",
    "cost": 0.065
  }'

# Test button click
curl -X POST http://localhost:3000/api/analytics/track-button-click \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "ai",
    "messageId": "wamid.test123",
    "buttonId": "btn_1",
    "buttonText": "Learn More",
    "buttonType": "url",
    "buttonIndex": 0,
    "recipientPhone": "919876543210"
  }'

# Get overview analytics
curl "http://localhost:3000/api/analytics/overview?tenantId=ai&startDate=2026-01-01&endDate=2026-01-31"
```

---

## 10. Deployment Checklist

- [ ] Create all database tables
- [ ] Set up Redis cache
- [ ] Configure cron jobs for aggregations
- [ ] Set up webhook endpoint
- [ ] Update message sending logic to track events
- [ ] Update frontend to use new analytics endpoints
- [ ] Test event tracking end-to-end
- [ ] Monitor performance and query optimization
- [ ] Set up database indexes
- [ ] Configure backup strategy
- [ ] Set up monitoring and alerts

---

## Summary

This implementation provides:
- ✅ Accurate, real-time event tracking
- ✅ Detailed analytics at message, template, and campaign levels
- ✅ Button click tracking
- ✅ Pre-aggregated data for fast queries
- ✅ Redis caching for performance
- ✅ Real-time updates via pub/sub
- ✅ Comprehensive API endpoints
- ✅ Scalable architecture

You now have full control over your analytics data with better accuracy than Facebook's API!
