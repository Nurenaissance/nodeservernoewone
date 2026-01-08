# Analytics Implementation Summary

This document provides a comprehensive overview of the analytics implementation for your WhatsApp Business messaging platform.

## What Was Implemented

### 1. Database Schema
**File**: `database/analytics-schema.sql`

Created 5 main tables:
- `message_events` - Tracks all message lifecycle events
- `button_clicks` - Tracks button interactions
- `template_analytics_daily` - Pre-aggregated daily template statistics
- `campaign_analytics` - Campaign-level metrics
- `hourly_analytics` - Real-time hourly aggregations

Features:
- Automatic timestamp updates via triggers
- Optimized indexes for fast queries
- Helpful views for common analytics queries
- Data cleanup function for old records

### 2. Analytics Core Module
**Directory**: `analytics/`

Created modular analytics system:

#### `analytics/db.js`
- PostgreSQL connection pool
- Query helper functions
- Transaction support
- Performance monitoring

#### `analytics/constants.js`
- Event type definitions
- Message status enums
- Cost calculations
- Cache key patterns
- TTL configurations

#### `analytics/tracker.js`
- `trackMessageSend()` - Track when messages are sent
- `trackMessageStatus()` - Track delivery, read, failed events
- `trackMessageReply()` - Track user replies
- `trackButtonClick()` - Track button interactions
- Automatic hourly analytics updates
- Campaign metric tracking

#### `analytics/cache.js`
- Redis integration for caching
- Cache invalidation on events
- Real-time update publishing
- Helper functions for cache operations

#### `analytics/aggregation.js`
- Daily aggregation job (runs at 00:05)
- Hourly aggregation job (runs at :02 every hour)
- Campaign analytics updates
- Cron job setup and management

### 3. API Routes
**File**: `routes/analyticsRoute.js`

Implemented 7 API endpoints:

#### Event Tracking
1. `POST /api/analytics/track-event` - Track message events
2. `POST /api/analytics/track-button-click` - Track button clicks

#### Analytics Retrieval
3. `GET /api/analytics/overview` - Overall analytics summary
4. `GET /api/analytics/template/:templateId` - Template-specific analytics
5. `GET /api/analytics/real-time` - Real-time hourly data
6. `GET /api/analytics/top-templates` - Top performing templates
7. `GET /api/analytics/campaign/:campaignId` - Campaign analytics

All endpoints include:
- Redis caching
- Error handling
- Input validation
- Proper HTTP status codes

### 4. Integration Points

#### Message Sending Integration
**File**: `send-message.js` (modified)

Added automatic analytics tracking:
- Captures message ID from WhatsApp response
- Tracks tenant, template, recipient info
- Non-blocking (doesn't fail message send)
- Includes error handling

#### Webhook Integration
**File**: `routes/webhookRoute.js` (modified)

Added status tracking for:
- Message delivered events
- Message read events
- Message failed events (with error reasons)
- Works alongside existing webhook logic
- Preserves all existing functionality

### 5. Server Integration
**File**: `server.js` (modified)

Added:
- Analytics aggregation job initialization
- Cron job setup on server start
- Error handling for analytics failures

**File**: `routes/index.js` (modified)

Added:
- Analytics routes at `/api/analytics/*`

### 6. Dependencies
**File**: `package.json` (modified)

Added:
- `node-cron`: ^3.0.3 (for scheduled jobs)

Existing dependencies used:
- `pg`: PostgreSQL client
- `ioredis`: Redis client
- `express`: Web framework

### 7. Documentation

Created comprehensive documentation:

#### `ANALYTICS_SETUP_GUIDE.md`
- Complete setup instructions
- Environment variable configuration
- Database setup steps
- API endpoint reference
- Troubleshooting guide
- Performance optimization tips

#### `DJANGO_ENDPOINTS_NEEDED.md`
- List of required Django endpoints
- API specifications
- Model definitions
- Implementation priorities
- Testing instructions

#### `.env.analytics.example`
- Example environment configuration
- Comments explaining each variable
- Both separate and shared DB options

#### `IMPLEMENTATION_SUMMARY.md`
- This file - complete overview
- File-by-file changes
- Features implemented
- What was preserved

---

## What Was Preserved

### No Breaking Changes

1. **Message Sending**: All existing message sending logic works exactly as before
2. **Webhook Processing**: All webhook handlers continue to function normally
3. **Fixed Access Token**: Your hardcoded access tokens remain unchanged
4. **Session Management**: User sessions and flow management untouched
5. **Media Handling**: Batch media detection and processing preserved
6. **Campaign Webhooks**: Campaign logic continues working
7. **Template Status Updates**: Existing template status tracking intact
8. **Socket.IO Events**: All real-time events still emit
9. **Firebase Integration**: Unchanged
10. **All Other Routes**: health, message, template, webhook, auth, job, flow, trigger, session routes all work as before

### Fail-Safe Design

Analytics tracking is designed to never break your app:
- All analytics calls wrapped in try-catch
- Failures logged but don't stop message flow
- Analytics errors don't affect user experience
- Can be disabled by not setting up the database

---

## Files Created

```
analytics/
├── db.js                      # Database connection and queries
├── constants.js               # Constants and configurations
├── tracker.js                 # Event tracking functions
├── cache.js                   # Redis caching layer
└── aggregation.js             # Cron jobs and aggregations

database/
└── analytics-schema.sql       # Complete database schema

routes/
└── analyticsRoute.js          # API endpoints

documentation/
├── ANALYTICS_SETUP_GUIDE.md   # Setup and usage guide
├── DJANGO_ENDPOINTS_NEEDED.md # Django integration guide
├── IMPLEMENTATION_SUMMARY.md  # This file
└── .env.analytics.example     # Environment variable template
```

---

## Files Modified

```
send-message.js                # Added analytics tracking
routes/webhookRoute.js         # Added status tracking
routes/index.js                # Added analytics routes
server.js                      # Added cron job initialization
package.json                   # Added node-cron dependency
```

---

## How It Works

### Message Lifecycle Tracking

1. **Message Sent**:
   - User/system sends message via `sendMessage()`
   - WhatsApp API returns message ID
   - `trackMessageSend()` creates record in `message_events`
   - Status: `sent`

2. **Message Delivered**:
   - WhatsApp webhook receives "delivered" status
   - `trackMessageStatus()` updates `message_events`
   - Status: `delivered`
   - Increments `hourly_analytics`

3. **Message Read**:
   - WhatsApp webhook receives "read" status
   - `trackMessageStatus()` updates `message_events`
   - Status: `read`
   - Increments `hourly_analytics`

4. **Message Failed**:
   - WhatsApp webhook receives "failed" status
   - `trackMessageStatus()` updates with error reason
   - Status: `failed`

5. **User Replies**:
   - Detected in webhook as reply with context
   - `trackMessageReply()` updates `message_events`
   - Status: `replied`

### Data Aggregation

1. **Hourly** (runs at :02 every hour):
   - Aggregates previous hour's data
   - Updates `hourly_analytics` table
   - Used for real-time dashboard

2. **Daily** (runs at 00:05 every day):
   - Aggregates previous day's data
   - Calculates engagement rates
   - Updates `template_analytics_daily` table
   - Includes button click counts

3. **On-Demand**:
   - Campaign analytics updated when accessed
   - Template analytics computed from daily data

### Caching Strategy

1. **Cache on Read**:
   - First request fetches from database
   - Result stored in Redis with TTL
   - Subsequent requests served from cache

2. **Cache Invalidation**:
   - New events invalidate related caches
   - By tenant ID, template ID, campaign ID
   - Ensures data freshness

3. **Cache TTLs**:
   - Real-time data: 60 seconds
   - Overview/Template: 5 minutes
   - Campaign/Top Templates: 10 minutes

---

## Environment Setup Required

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup PostgreSQL Database
```bash
# Create database (or use existing)
createdb whatsapp_analytics

# Run schema
psql -U your_user -d whatsapp_analytics -f database/analytics-schema.sql
```

### 3. Configure Environment Variables
Copy `.env.analytics.example` to `.env` and configure:
```env
ANALYTICS_DB_HOST=localhost
ANALYTICS_DB_PORT=5432
ANALYTICS_DB_NAME=whatsapp_analytics
ANALYTICS_DB_USER=your_user
ANALYTICS_DB_PASSWORD=your_password

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### 4. Start Redis (if not running)
```bash
redis-server
```

### 5. Create Django Endpoints
See `DJANGO_ENDPOINTS_NEEDED.md` for required endpoints

### 6. Start Server
```bash
npm start
```

Look for:
```
✅ Analytics database connected
✅ Analytics Redis cache connected
✅ Analytics aggregation jobs initialized
Server is listening on port: 8080
```

---

## Testing

### Test Message Tracking

```bash
# Send a test message (will auto-track)
# Use your existing message sending endpoint

# Check if tracked
curl "http://localhost:8080/api/analytics/overview?tenantId=ai&startDate=2026-01-01&endDate=2026-12-31"
```

### Test Status Updates

Send a message and wait for WhatsApp webhook to deliver status updates. Check logs for:
```
✅ [Analytics] Message event updated: wamid.xxx
```

### Test Aggregation

```bash
# Manually trigger daily aggregation (for testing)
# In Node.js REPL:
import { aggregateDailyAnalytics } from './analytics/aggregation.js';
await aggregateDailyAnalytics(new Date());
```

---

## Metrics Tracked

### Message Metrics
- Total sent
- Total delivered
- Total read
- Total failed
- Total replied
- Delivery rate
- Read rate
- Reply rate

### Button Metrics
- Total button clicks
- Click rate
- Clicks by button type
- Clicks by template

### Performance Metrics
- Average delivery time
- Average read time
- Average response time

### Cost Metrics
- Total cost
- Average cost per message
- Cost by conversation category

### Campaign Metrics
- Recipients
- Unique recipients
- All message metrics above
- ROI (if revenue tracked)

---

## Next Steps

1. ✅ **Implementation Complete** - All code is ready
2. ⬜ **Install Dependencies** - Run `npm install`
3. ⬜ **Setup Database** - Run the schema SQL file
4. ⬜ **Configure Environment** - Set up .env variables
5. ⬜ **Create Django Endpoints** - See DJANGO_ENDPOINTS_NEEDED.md
6. ⬜ **Test Integration** - Send test messages and check analytics
7. ⬜ **Update Frontend** - Display analytics in your UI
8. ⬜ **Monitor Performance** - Watch logs and optimize queries

---

## Support & Maintenance

### Logs to Monitor

Watch for these in your server logs:
- `✅ [Analytics]` - Successful operations
- `❌ [Analytics]` - Errors (won't break app)
- `📊 [Aggregation]` - Cron job execution
- `📦 [Cache]` - Cache hits/misses

### Database Maintenance

Run monthly:
```sql
-- Clean up old data (>1 year)
SELECT cleanup_old_analytics();

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename LIKE '%analytics%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Performance Tuning

If queries are slow:
1. Check indexes: `\d message_events`
2. Analyze query plans: `EXPLAIN ANALYZE SELECT ...`
3. Add custom indexes if needed
4. Consider table partitioning for very large datasets

---

## Contact

If you encounter any issues:
1. Check the logs for error messages
2. Review `ANALYTICS_SETUP_GUIDE.md` for troubleshooting
3. Verify all environment variables are set correctly
4. Ensure PostgreSQL and Redis are running

Remember: Analytics failures will never break your main application. All tracking is wrapped in try-catch blocks.
