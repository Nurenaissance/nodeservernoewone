# WhatsApp Business Analytics - Setup Guide

This guide will help you set up the complete analytics system for your WhatsApp Business messaging platform.

## Overview

The analytics system tracks:
- Message lifecycle events (sent, delivered, read, failed, replied)
- Button clicks and interactions
- Template performance metrics
- Campaign analytics
- Real-time hourly statistics
- Cost tracking

## Prerequisites

- Node.js >= 16.0.0
- PostgreSQL database
- Redis server
- Environment variables configured

---

## Step 1: Install Dependencies

Run npm install to install the new dependency:

```bash
npm install
```

This will install `node-cron` which is required for data aggregation jobs.

---

## Step 2: Database Setup

### Create Analytics Database (Option 1 - Separate Database)

If you want a separate database for analytics:

```bash
# Create a new PostgreSQL database
createdb whatsapp_analytics

# Or using psql
psql -U postgres
CREATE DATABASE whatsapp_analytics;
```

### Use Existing Database (Option 2 - Same Database)

You can also use your existing database. The analytics tables will be created in the same database.

### Run the Schema Migration

```bash
# Connect to your database
psql -U your_user -d your_database_name

# Run the schema file
\i database/analytics-schema.sql
```

Or programmatically:

```bash
psql -U your_user -d your_database_name -f database/analytics-schema.sql
```

This will create:
- `message_events` table
- `button_clicks` table
- `template_analytics_daily` table
- `campaign_analytics` table
- `hourly_analytics` table
- Indexes for performance
- Triggers for auto-updating timestamps
- Helpful views for common queries

---

## Step 3: Environment Variables

Create or update your `.env` file with the following variables:

```env
# ==================== ANALYTICS DATABASE ====================
# If using a separate analytics database
ANALYTICS_DB_HOST=localhost
ANALYTICS_DB_PORT=5432
ANALYTICS_DB_NAME=whatsapp_analytics
ANALYTICS_DB_USER=your_db_user
ANALYTICS_DB_PASSWORD=your_db_password

# If using the same database as your main app, you can skip these
# and the system will use DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

# ==================== REDIS (REQUIRED) ====================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password  # Optional, if Redis requires auth

# ==================== EXISTING VARIABLES ====================
# Keep all your existing environment variables
PORT=8080
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_main_database
DB_USER=your_db_user
DB_PASSWORD=your_db_password
# ... other existing variables
```

---

## Step 4: Verify Installation

### Check Database Connection

Start your server and check the logs:

```bash
npm start
```

You should see:
```
✅ Analytics database connected
✅ Analytics Redis cache connected
✅ Analytics aggregation jobs initialized
Server is listening on port: 8080
```

### Test API Endpoints

```bash
# Test tracking a message send event
curl -X POST http://localhost:8080/api/analytics/track-event \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "message.sent",
    "tenantId": "ai",
    "messageId": "wamid.test123",
    "templateId": "123456",
    "templateName": "welcome_message",
    "recipientPhone": "919876543210",
    "messageType": "template",
    "conversationCategory": "marketing"
  }'

# Expected response:
# {"success":true,"eventId":1,"message":"Event tracked successfully"}
```

```bash
# Test fetching overview analytics
curl "http://localhost:8080/api/analytics/overview?tenantId=ai&startDate=2026-01-01&endDate=2026-01-31"

# Expected response:
# {"success":true,"data":{"totalSent":0,"totalDelivered":0,...}}
```

---

## Step 5: Django Endpoints Setup

The analytics system requires some Django endpoints for data enrichment. See `DJANGO_ENDPOINTS_NEEDED.md` for details.

**Required endpoints to create:**
1. `GET /api/templates/{template_id}/` - Get template details
2. `GET /api/campaigns/{campaign_id}/` - Get campaign details
3. `GET /api/broadcast-groups/{group_id}/` - Get broadcast group details

---

## Step 6: Monitoring & Maintenance

### Cron Jobs Running

The system automatically runs these cron jobs:

1. **Daily Aggregation**: Runs at 00:05 every day
   - Aggregates previous day's data into `template_analytics_daily`

2. **Hourly Aggregation**: Runs at :02 every hour
   - Aggregates previous hour's data into `hourly_analytics`

### Database Maintenance

To clean up old data (older than 1 year):

```sql
SELECT cleanup_old_analytics();
```

You can schedule this monthly via PostgreSQL cron or manually.

### Monitor Redis Cache

Check Redis cache status:

```bash
redis-cli
> INFO stats
> KEYS analytics:*
```

---

## Step 7: API Endpoints Reference

### Event Tracking

#### Track Message Event
```
POST /api/analytics/track-event
```

Request body:
```json
{
  "eventType": "message.sent",
  "tenantId": "ai",
  "messageId": "wamid.xxx",
  "templateId": "123456",
  "templateName": "welcome_message",
  "recipientPhone": "919876543210",
  "messageType": "template",
  "conversationCategory": "marketing"
}
```

#### Track Button Click
```
POST /api/analytics/track-button-click
```

Request body:
```json
{
  "tenantId": "ai",
  "messageId": "wamid.xxx",
  "buttonId": "btn_1",
  "buttonText": "Learn More",
  "buttonType": "url",
  "recipientPhone": "919876543210"
}
```

### Analytics Retrieval

#### Get Overview Analytics
```
GET /api/analytics/overview?tenantId=ai&startDate=2026-01-01&endDate=2026-01-31
```

#### Get Template Analytics
```
GET /api/analytics/template/123456?tenantId=ai&startDate=2026-01-01&endDate=2026-01-31
```

#### Get Real-time Analytics
```
GET /api/analytics/real-time?tenantId=ai
```

#### Get Top Templates
```
GET /api/analytics/top-templates?tenantId=ai&startDate=2026-01-01&endDate=2026-01-31&sortBy=sent&limit=10
```

#### Get Campaign Analytics
```
GET /api/analytics/campaign/campaign_001?tenantId=ai
```

---

## Step 8: Frontend Integration

Update your frontend to use the new analytics endpoints. Example for React:

```javascript
import axios from 'axios';

const fetchAnalytics = async () => {
  const { data } = await axios.get('/api/analytics/overview', {
    params: {
      tenantId: localStorage.getItem('tenant_id'),
      startDate: '2026-01-01',
      endDate: '2026-01-31'
    }
  });

  console.log('Analytics:', data);
};
```

---

## Troubleshooting

### Database Connection Issues

If you see database connection errors:

1. Check PostgreSQL is running:
   ```bash
   sudo service postgresql status
   ```

2. Verify credentials in `.env`

3. Test connection manually:
   ```bash
   psql -U your_user -d your_database_name
   ```

### Redis Connection Issues

If Redis cache is not working:

1. Check Redis is running:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

2. Verify Redis host and port in `.env`

### Analytics Not Tracking

If messages are sent but not tracked:

1. Check logs for analytics errors:
   ```
   ❌ [Analytics] Failed to track message send: ...
   ```

2. Verify database tables exist:
   ```sql
   \dt
   SELECT * FROM message_events LIMIT 1;
   ```

3. Check if the tracking code is executing:
   - Add console.logs in `send-message.js`
   - Verify `trackMessageSend` is being called

### Cron Jobs Not Running

If aggregation jobs are not running:

1. Check server logs for cron initialization:
   ```
   ✅ Analytics aggregation jobs initialized
   ```

2. Verify `node-cron` is installed:
   ```bash
   npm list node-cron
   ```

3. Manually trigger aggregation for testing:
   ```javascript
   // In Node.js REPL or test script
   import { aggregateDailyAnalytics } from './analytics/aggregation.js';
   await aggregateDailyAnalytics(new Date());
   ```

---

## Performance Optimization

### Database Indexing

The schema already includes indexes. If you notice slow queries, you can add more:

```sql
-- Add index for specific query patterns
CREATE INDEX idx_custom ON message_events (tenant_id, sent_at, current_status);
```

### Redis Cache Tuning

Adjust cache TTL in `analytics/constants.js`:

```javascript
export const CACHE_TTL = {
  OVERVIEW: 300,      // Increase if data doesn't change often
  TEMPLATE: 300,
  CAMPAIGN: 600,
  REALTIME: 60,       // Keep low for real-time data
  TOP_TEMPLATES: 600
};
```

### Query Optimization

For large datasets, consider:
- Partitioning `message_events` table by date
- Using materialized views for frequently accessed data
- Implementing pagination for API responses

---

## Security Considerations

1. **API Authentication**: Add authentication middleware to analytics endpoints
2. **Rate Limiting**: Implement rate limiting for public endpoints
3. **Input Validation**: Validate all input parameters
4. **SQL Injection**: Using parameterized queries (already implemented)
5. **Tenant Isolation**: Ensure proper tenant_id filtering in all queries

---

## Next Steps

1. ✅ Set up database schema
2. ✅ Configure environment variables
3. ✅ Install dependencies
4. ⬜ Create required Django endpoints
5. ⬜ Test analytics tracking end-to-end
6. ⬜ Update frontend to display analytics
7. ⬜ Monitor performance and optimize

---

## Support

For issues or questions:
- Check logs in your Node.js console
- Review the implementation plan in `BACKEND_ANALYTICS_IMPLEMENTATION_PLAN.md`
- Check Django endpoints documentation in `DJANGO_ENDPOINTS_NEEDED.md`
