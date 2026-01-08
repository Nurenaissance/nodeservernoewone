# Redis Session Migration Guide

## Overview

The Node.js WhatsApp bot server has been migrated from in-memory Map-based sessions to Redis-based sessions for:
- **Horizontal Scaling**: Multiple server instances can share session data
- **Persistence**: Sessions survive server restarts
- **Better Memory Management**: Redis handles memory more efficiently for large session datasets

## What Changed

### Before (In-Memory Map)
```javascript
// Synchronous operations
export let userSessions = new Map();

const session = userSessions.get(key);
userSessions.set(key, sessionData);
userSessions.delete(key);
```

### After (Redis-Based)
```javascript
// Async operations
import sessionManager from './sessionManager.js';
export const userSessions = sessionManager;

const session = await userSessions.get(key);
await userSessions.set(key, sessionData);
await userSessions.delete(key);
```

## Required Code Changes

All files that use `userSessions` must be updated to use `await` for session operations:

### Files That Need Updates

1. **mainwebhook/snm.js** - Button, list, and node message handlers
2. **mainwebhook/userWebhook.js** - Main user webhook handler
3. **helpers/misc.js** - Session initialization
4. **send-message.js** - Message sending with session data
5. **webhooks/personWebhook.js** - Person-to-person chat
6. **webhooks/manualWebhook.js** - Manual agent chat
7. **webhooks/businessWebhook.js** - Business agent chat
8. **webhooks/campaignWebhook.js** - Campaign webhook
9. **routes/webhookRoute.js** - Webhook routes
10. **routes/authRoute.js** - Authentication routes

### Update Pattern

**Before:**
```javascript
function sendButtonMessage(buttons, message, phoneNumber, business_phone_number_id) {
    const key = phoneNumber + business_phone_number_id
    const userSession = userSessions.get(key);  // Synchronous
    // ... rest of code
}
```

**After:**
```javascript
async function sendButtonMessage(buttons, message, phoneNumber, business_phone_number_id) {
    const key = phoneNumber + business_phone_number_id
    const userSession = await userSessions.get(key);  // Async
    // ... rest of code
}
```

### Common Patterns to Update

1. **Getting a session:**
   ```javascript
   const session = await userSessions.get(key);
   ```

2. **Setting a session:**
   ```javascript
   await userSessions.set(key, sessionData);
   ```

3. **Deleting a session:**
   ```javascript
   await userSessions.delete(key);
   ```

4. **Iterating over sessions:**
   ```javascript
   const entries = await userSessions.entries();
   for (const [key, session] of entries) {
       // Process session
   }
   ```

5. **Checking if session exists:**
   ```javascript
   const exists = await userSessions.has(key);
   ```

## Redis Configuration

### Environment Variables

Add to `.env` file:

```bash
# Local Development
REDIS_URL=redis://localhost:6379

# Azure Redis Cache (Production)
# REDIS_URL=rediss://your-redis-name.redis.cache.windows.net:6380?password=YOUR_PASSWORD
```

### Session TTL

Sessions automatically expire after 24 hours of inactivity. This is configurable in `sessionManager.js`:

```javascript
this.SESSION_TTL = 86400; // 24 hours in seconds
```

### Inactive Session Cleanup

The cleanup job runs every hour and removes sessions inactive for more than 30 minutes:

```javascript
setInterval(clearInactiveSessions, 60 * 60 * 1000); // Every hour
```

## Redis Installation

### Local Development

**Windows:**
```bash
# Using Chocolatey
choco install redis-64

# Or download from: https://github.com/microsoftarchive/redis/releases
```

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
```

### Azure Deployment

1. Create Azure Cache for Redis:
   ```bash
   az redis create --name your-redis-name \
     --resource-group your-rg \
     --location centralindia \
     --sku Basic \
     --vm-size c0
   ```

2. Get connection string:
   ```bash
   az redis list-keys --name your-redis-name --resource-group your-rg
   ```

3. Update `.env`:
   ```bash
   REDIS_URL=rediss://your-redis-name.redis.cache.windows.net:6380?password=YOUR_PRIMARY_KEY
   ```

## Session Manager API

The `SessionManager` class provides these methods:

### Core Methods

- **`connect()`** - Initialize Redis connection
- **`get(key)`** - Retrieve session by key
- **`set(key, value)`** - Store/update session
- **`delete(key)`** - Remove session
- **`has(key)`** - Check if session exists
- **`entries()`** - Get all sessions (expensive operation)
- **`size()`** - Get count of active sessions
- **`clear()`** - Remove all sessions (use with caution!)
- **`cleanupInactiveSessions(threshold)`** - Remove inactive sessions
- **`disconnect()`** - Close Redis connection gracefully

### Auto-Reconnection

The session manager automatically reconnects to Redis if the connection is lost:
- Exponential backoff strategy
- Max 10 reconnection attempts
- Falls back gracefully if Redis is unavailable

## Migration Checklist

- [x] Install Redis client (`redis` package already in package.json)
- [x] Create `sessionManager.js` with Redis wrapper
- [x] Update `server.js` to use sessionManager
- [x] Update `utils.js` clearInactiveSessions function
- [x] Add REDIS_URL to `.env`
- [ ] Update all webhook handlers to use async session operations
- [ ] Update all message handlers to use async session operations
- [ ] Update helper functions to use async session operations
- [ ] Test locally with Redis running
- [ ] Deploy to staging environment
- [ ] Monitor session persistence and performance
- [ ] Deploy to production

## Testing

### Local Testing

1. **Start Redis:**
   ```bash
   redis-server
   ```

2. **Verify Redis connection:**
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

3. **Start the Node.js server:**
   ```bash
   npm start
   ```

4. **Check logs for Redis connection:**
   ```
   ✅ Redis: Connected and ready
   Server is listening on port: 8080
   ```

### Verify Session Storage

```bash
# Connect to Redis CLI
redis-cli

# List all session keys
KEYS whatsapp:session:*

# Get a specific session
GET whatsapp:session:<phoneNumber><business_phone_number_id>

# Check session TTL
TTL whatsapp:session:<phoneNumber><business_phone_number_id>
```

## Troubleshooting

### Redis Connection Errors

**Problem:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution:**
- Ensure Redis is running: `redis-cli ping`
- Check REDIS_URL in `.env`
- Verify firewall settings

### Session Not Persisting

**Problem:** Sessions are lost on server restart

**Solution:**
- Check Redis is configured for persistence (RDB or AOF)
- Verify session TTL is set correctly
- Check Redis memory policy: `redis-cli CONFIG GET maxmemory-policy`

### High Memory Usage

**Problem:** Redis using too much memory

**Solution:**
- Review session TTL settings
- Enable inactive session cleanup
- Configure Redis maxmemory: `redis-cli CONFIG SET maxmemory 256mb`
- Set eviction policy: `redis-cli CONFIG SET maxmemory-policy allkeys-lru`

## Performance Considerations

### Session Size

Each session is serialized to JSON. Keep session data minimal:
- Avoid storing large arrays or objects
- Don't store binary data
- Clean up unused fields

### Network Latency

Redis operations add network latency:
- **Local:** ~1-2ms per operation
- **Azure Redis:** ~10-20ms per operation
- Batch operations when possible
- Use connection pooling (built into redis client)

### Scaling

With Redis sessions, you can:
- Run multiple Node.js instances behind a load balancer
- Share sessions across all instances
- Scale horizontally without session loss

## Rollback Plan

If issues occur, rollback to in-memory Map:

1. **Edit `server.js`:**
   ```javascript
   // import sessionManager from './sessionManager.js';
   export const userSessions = new Map(); // Rollback to Map
   ```

2. **Edit `utils.js`:**
   ```javascript
   export function clearInactiveSessions() {  // Remove async
     const inactivityThreshold = 30 * 60 * 1000;
     const now = Date.now();
     for (const [userPhoneNumber, session] of userSessions.entries()) {
       if (now - session.lastActivityTime > inactivityThreshold) {
         userSessions.delete(userPhoneNumber);
       }
     }
   }
   ```

3. **Restart server**

## Next Steps

After successful Redis migration:

1. **Monitor Performance:**
   - Session access latency
   - Redis memory usage
   - Connection pool utilization

2. **Optimize:**
   - Adjust session TTL based on usage patterns
   - Fine-tune cleanup intervals
   - Implement session compression if needed

3. **Scale:**
   - Deploy multiple server instances
   - Configure load balancer
   - Monitor cross-instance session sharing

## Support

For issues or questions:
- Check Redis logs: `redis-cli MONITOR`
- Review Node.js server logs
- Check session manager error logs
- Verify network connectivity to Redis

---

**Migration Status:** Session manager created, server.js and utils.js updated. Webhook handlers need async updates.

**Last Updated:** 2026-01-07
