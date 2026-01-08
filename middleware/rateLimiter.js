import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Rate limiting middleware for WhatsApp Bot Server
 * Uses Redis for distributed rate limiting across multiple instances
 * Falls back to in-memory if Redis is unavailable
 */

let redisClient = null;
let isRedisAvailable = false;

// Initialize Redis client for rate limiting
async function initializeRedisClient() {
  try {
    const redisConfig = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
          if (retries > 5) return new Error('Max reconnection attempts reached');
          return Math.min(retries * 100, 3000);
        }
      }
    };

    redisClient = createClient(redisConfig);

    redisClient.on('error', (err) => {
      console.error('❌ Rate Limiter Redis Error:', err);
      isRedisAvailable = false;
    });

    redisClient.on('ready', () => {
      console.log('✅ Rate Limiter: Redis connected');
      isRedisAvailable = true;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('❌ Failed to connect Redis for rate limiting:', error);
    console.warn('⚠️  Using in-memory rate limiting as fallback');
    isRedisAvailable = false;
    return null;
  }
}

// Initialize Redis connection
const redisPromise = initializeRedisClient();

/**
 * Create rate limiter with Redis backend (with fallback to memory)
 * @param {Object} options - Rate limiter options
 * @returns {RateLimiterRedis|RateLimiterMemory} Rate limiter instance
 */
async function createRateLimiter(options) {
  const client = await redisPromise;

  if (client && isRedisAvailable) {
    // Use Redis-based rate limiter for distributed systems
    return new RateLimiterRedis({
      storeClient: client,
      keyPrefix: options.keyPrefix || 'rl',
      points: options.points,
      duration: options.duration,
      blockDuration: options.blockDuration || 0,
      execEvenly: options.execEvenly || false,
      insuranceLimiter: new RateLimiterMemory({
        points: options.points,
        duration: options.duration,
      })
    });
  } else {
    // Fallback to in-memory rate limiter
    console.warn(`⚠️  Using in-memory rate limiter for ${options.keyPrefix}`);
    return new RateLimiterMemory({
      points: options.points,
      duration: options.duration,
      blockDuration: options.blockDuration || 0,
    });
  }
}

// Define rate limiters for different endpoints

/**
 * Webhook Rate Limiter
 * - 60 requests per minute per IP
 * - Prevents webhook spam and DoS attacks
 */
const webhookLimiter = await createRateLimiter({
  keyPrefix: 'webhook',
  points: 60,
  duration: 60,
  blockDuration: 60
});

/**
 * API Rate Limiter
 * - 100 requests per minute per IP
 * - For general API endpoints
 */
const apiLimiter = await createRateLimiter({
  keyPrefix: 'api',
  points: 100,
  duration: 60,
  blockDuration: 60
});

/**
 * Strict Rate Limiter
 * - 20 requests per minute per IP
 * - For sensitive operations (auth, config changes)
 */
const strictLimiter = await createRateLimiter({
  keyPrefix: 'strict',
  points: 20,
  duration: 60,
  blockDuration: 300 // 5 minutes block
});

/**
 * Per-Tenant Rate Limiter
 * - 1000 requests per minute per tenant
 * - Prevents single tenant from overwhelming the system
 */
const tenantLimiter = await createRateLimiter({
  keyPrefix: 'tenant',
  points: 1000,
  duration: 60,
  blockDuration: 60
});

/**
 * Message Send Rate Limiter
 * - 30 messages per minute per phone number
 * - Prevents message spam to users
 */
const messageSendLimiter = await createRateLimiter({
  keyPrefix: 'msg_send',
  points: 30,
  duration: 60,
  blockDuration: 120
});

/**
 * Extract client identifier from request
 * Priority: X-Tenant-Id > X-Forwarded-For > IP address
 */
function getClientIdentifier(req) {
  const tenantId = req.headers['x-tenant-id'];
  if (tenantId) return `tenant_${tenantId}`;

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Generic rate limit middleware factory
 */
function createRateLimitMiddleware(limiter, options = {}) {
  return async (req, res, next) => {
    try {
      const key = options.keyExtractor
        ? options.keyExtractor(req)
        : getClientIdentifier(req);

      await limiter.consume(key);
      next();
    } catch (rejRes) {
      // Rate limit exceeded
      const retryAfter = Math.round(rejRes.msBeforeNext / 1000) || 60;

      res.set({
        'Retry-After': retryAfter,
        'X-RateLimit-Limit': limiter.points,
        'X-RateLimit-Remaining': rejRes.remainingPoints,
        'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString()
      });

      return res.status(429).json({
        error: 'Too Many Requests',
        message: options.message || 'Rate limit exceeded. Please try again later.',
        retryAfter: retryAfter,
        limit: limiter.points,
        remaining: rejRes.remainingPoints
      });
    }
  };
}

/**
 * Webhook rate limiting middleware
 * Usage: app.use('/webhook', webhookRateLimiter)
 */
export const webhookRateLimiter = createRateLimitMiddleware(webhookLimiter, {
  message: 'Webhook rate limit exceeded. Maximum 60 requests per minute.'
});

/**
 * API rate limiting middleware
 * Usage: app.use('/api', apiRateLimiter)
 */
export const apiRateLimiter = createRateLimitMiddleware(apiLimiter, {
  message: 'API rate limit exceeded. Maximum 100 requests per minute.'
});

/**
 * Strict rate limiting middleware
 * Usage: app.post('/auth/login', strictRateLimiter, handler)
 */
export const strictRateLimiter = createRateLimitMiddleware(strictLimiter, {
  message: 'Too many requests to this endpoint. Please wait before trying again.'
});

/**
 * Per-tenant rate limiting middleware
 * Usage: app.use(tenantRateLimiter)
 */
export const tenantRateLimiter = createRateLimitMiddleware(tenantLimiter, {
  keyExtractor: (req) => {
    const tenantId = req.headers['x-tenant-id'];
    return tenantId ? `tenant_${tenantId}` : getClientIdentifier(req);
  },
  message: 'Tenant rate limit exceeded. Maximum 1000 requests per minute per tenant.'
});

/**
 * Message send rate limiting middleware
 * Usage: app.post('/send-message', messageSendRateLimiter, handler)
 */
export const messageSendRateLimiter = createRateLimitMiddleware(messageSendLimiter, {
  keyExtractor: (req) => {
    const phoneNumber = req.body?.phoneNumber || req.body?.to || 'unknown';
    return `msg_${phoneNumber}`;
  },
  message: 'Message rate limit exceeded. Maximum 30 messages per minute per recipient.'
});

/**
 * Custom rate limiter creator for specific use cases
 * @param {Object} config - Rate limiter configuration
 * @returns {Function} Express middleware
 */
export async function createCustomRateLimiter(config) {
  const limiter = await createRateLimiter({
    keyPrefix: config.keyPrefix || 'custom',
    points: config.points || 60,
    duration: config.duration || 60,
    blockDuration: config.blockDuration || 60
  });

  return createRateLimitMiddleware(limiter, {
    keyExtractor: config.keyExtractor,
    message: config.message
  });
}

/**
 * Skip rate limiting for trusted sources
 * Check for internal service keys
 */
export function skipRateLimitForServices(req, res, next) {
  const serviceKey = req.headers['x-service-key'];
  const validKeys = [
    process.env.DJANGO_SERVICE_KEY,
    process.env.FASTAPI_SERVICE_KEY,
    process.env.NODEJS_SERVICE_KEY
  ].filter(Boolean);

  // Skip rate limiting for valid service keys
  if (serviceKey && validKeys.includes(serviceKey)) {
    req.skipRateLimit = true;
    return next();
  }

  next();
}

/**
 * Conditionally apply rate limiting
 * Skip if request has skipRateLimit flag
 */
export function conditionalRateLimit(limiter) {
  return async (req, res, next) => {
    if (req.skipRateLimit) {
      return next();
    }
    return limiter(req, res, next);
  };
}

// Export rate limiters for direct use
export {
  webhookLimiter,
  apiLimiter,
  strictLimiter,
  tenantLimiter,
  messageSendLimiter,
  redisClient as rateLimiterRedisClient
};

// Export cleanup function
export async function cleanupRateLimiter() {
  if (redisClient && isRedisAvailable) {
    await redisClient.quit();
    console.log('✅ Rate Limiter: Redis connection closed');
  }
}
