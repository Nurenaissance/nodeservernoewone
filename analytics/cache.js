import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// REDIS CONNECTION FOR ANALYTICS CACHE (Optional - production only)
// ============================================================================

let redis = null;

// Only initialize Redis if properly configured for production
if (process.env.REDIS_PASSWORD && process.env.NODE_ENV === 'production') {
  console.log('🔄 Initializing Analytics Redis cache...');

  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });

  redis.on('connect', () => {
    console.log('✅ Analytics Redis cache connected');
  });

  redis.on('error', (err) => {
    console.error('❌ Analytics Redis connection error:', err);
  });
} else {
  console.log('⚠️  Analytics Redis cache disabled (using direct fetch in local development mode)');
}

// ============================================================================
// CACHE FUNCTIONS WITH GRACEFUL FALLBACKS
// ============================================================================

/**
 * Get cached data or fetch from DB
 * Falls back to direct fetch when Redis is not available
 */
export async function getCachedOrFetch(cacheKey, ttl, fetchFunction) {
  // If Redis not available, always fetch directly
  if (!redis) {
    return await fetchFunction();
  }

  try {
    // Try to get from cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`📦 [Cache] Hit: ${cacheKey}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 [Cache] Miss: ${cacheKey}`);

    // Fetch from database
    const data = await fetchFunction();

    // Store in cache
    if (data) {
      await redis.setex(cacheKey, ttl, JSON.stringify(data));
      console.log(`💾 [Cache] Stored: ${cacheKey} (TTL: ${ttl}s)`);
    }

    return data;
  } catch (error) {
    console.error('❌ [Cache] Error:', error);
    // Fallback to direct fetch
    return await fetchFunction();
  }
}

/**
 * Invalidate cache on events
 * No-op when Redis is not available
 */
export async function invalidateAnalyticsCache(tenantId, templateId = null, campaignId = null) {
  if (!redis) {
    return; // No-op in local development
  }

  try {
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
        console.log(`🗑️ [Cache] Invalidated ${keys.length} keys: ${pattern}`);
      }
    }
  } catch (error) {
    console.error('❌ [Cache] Error invalidating cache:', error);
  }
}

/**
 * Publish real-time analytics update
 * No-op when Redis is not available
 */
export async function publishAnalyticsUpdate(tenantId, eventType, data) {
  if (!redis) {
    return; // No-op in local development
  }

  try {
    await redis.publish(`analytics:updates:${tenantId}`, JSON.stringify({
      eventType,
      data,
      timestamp: new Date().toISOString()
    }));
    console.log(`📡 [Cache] Published update: ${eventType} for ${tenantId}`);
  } catch (error) {
    console.error('❌ [Cache] Error publishing update:', error);
  }
}

/**
 * Set cache with TTL
 * Returns false when Redis is not available
 */
export async function setCache(key, value, ttl) {
  if (!redis) {
    return false; // Cache not available
  }

  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('❌ [Cache] Error setting cache:', error);
    return false;
  }
}

/**
 * Get cache
 * Returns null when Redis is not available
 */
export async function getCache(key) {
  if (!redis) {
    return null; // Cache not available
  }

  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error('❌ [Cache] Error getting cache:', error);
    return null;
  }
}

/**
 * Delete cache
 * Returns false when Redis is not available
 */
export async function deleteCache(key) {
  if (!redis) {
    return false; // Cache not available
  }

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('❌ [Cache] Error deleting cache:', error);
    return false;
  }
}

export default redis;
