import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis-based session manager that provides a Map-like interface
 * for session storage with persistence and horizontal scaling support
 */
class SessionManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.SESSION_PREFIX = 'whatsapp:session:';
    this.SESSION_TTL = 86400; // 24 hours in seconds
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    try {
      // Redis configuration from environment variables
      const redisConfig = {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
        socket: {
          connectTimeout: 10000,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('❌ Redis: Max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            // Exponential backoff: 50ms, 100ms, 200ms, 400ms, etc.
            return Math.min(retries * 50, 3000);
          }
        }
      };

      this.client = createClient(redisConfig);

      // Error handling
      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔄 Redis: Connecting...');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis: Connected and ready');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Redis: Reconnecting...');
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('⚠️  Redis: Connection closed');
        this.isConnected = false;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Get a session by key
   * @param {string} key - Session key (phoneNumber + business_phone_number_id)
   * @returns {Object|null} Session object or null if not found
   */
  async get(key) {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, attempting to reconnect...');
        await this.connect();
      }

      const redisKey = this.SESSION_PREFIX + key;
      const data = await this.client.get(redisKey);

      if (!data) {
        return null;
      }

      // Update lastActivityTime on retrieval
      const session = JSON.parse(data);
      session.lastActivityTime = Date.now();

      return session;
    } catch (error) {
      console.error(`❌ Error getting session for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set/update a session
   * @param {string} key - Session key
   * @param {Object} value - Session object
   * @returns {boolean} Success status
   */
  async set(key, value) {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, attempting to reconnect...');
        await this.connect();
      }

      const redisKey = this.SESSION_PREFIX + key;

      // Add/update lastActivityTime
      const sessionData = {
        ...value,
        lastActivityTime: Date.now()
      };

      // Serialize and store with TTL
      const serialized = JSON.stringify(sessionData);
      await this.client.setEx(redisKey, this.SESSION_TTL, serialized);

      return true;
    } catch (error) {
      console.error(`❌ Error setting session for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete a session
   * @param {string} key - Session key
   * @returns {boolean} Success status
   */
  async delete(key) {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, attempting to reconnect...');
        await this.connect();
      }

      const redisKey = this.SESSION_PREFIX + key;
      await this.client.del(redisKey);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting session for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get all session entries (for iteration)
   * Note: This operation can be expensive with many sessions
   * @returns {Array} Array of [key, value] pairs
   */
  async entries() {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, attempting to reconnect...');
        await this.connect();
      }

      const pattern = this.SESSION_PREFIX + '*';
      const keys = await this.client.keys(pattern);

      if (keys.length === 0) {
        return [];
      }

      // Fetch all sessions in parallel
      const sessions = await Promise.all(
        keys.map(async (redisKey) => {
          const data = await this.client.get(redisKey);
          if (data) {
            const key = redisKey.replace(this.SESSION_PREFIX, '');
            return [key, JSON.parse(data)];
          }
          return null;
        })
      );

      return sessions.filter(entry => entry !== null);
    } catch (error) {
      console.error('❌ Error getting session entries:', error);
      return [];
    }
  }

  /**
   * Check if a session exists
   * @param {string} key - Session key
   * @returns {boolean} Existence status
   */
  async has(key) {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, attempting to reconnect...');
        await this.connect();
      }

      const redisKey = this.SESSION_PREFIX + key;
      const exists = await this.client.exists(redisKey);
      return exists === 1;
    } catch (error) {
      console.error(`❌ Error checking session existence for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get the number of active sessions
   * @returns {number} Session count
   */
  async size() {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, attempting to reconnect...');
        await this.connect();
      }

      const pattern = this.SESSION_PREFIX + '*';
      const keys = await this.client.keys(pattern);
      return keys.length;
    } catch (error) {
      console.error('❌ Error getting session count:', error);
      return 0;
    }
  }

  /**
   * Clear all sessions (use with caution!)
   * @returns {boolean} Success status
   */
  async clear() {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, attempting to reconnect...');
        await this.connect();
      }

      const pattern = this.SESSION_PREFIX + '*';
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(keys);
      }

      return true;
    } catch (error) {
      console.error('❌ Error clearing sessions:', error);
      return false;
    }
  }

  /**
   * Close Redis connection gracefully
   */
  async disconnect() {
    try {
      if (this.client && this.isConnected) {
        await this.client.quit();
        console.log('✅ Redis: Disconnected gracefully');
      }
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error);
    }
  }

  /**
   * Clean up inactive sessions based on lastActivityTime
   * @param {number} inactivityThreshold - Threshold in milliseconds (default: 30 minutes)
   * @returns {number} Number of sessions cleaned up
   */
  async cleanupInactiveSessions(inactivityThreshold = 30 * 60 * 1000) {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, attempting to reconnect...');
        await this.connect();
      }

      const now = Date.now();
      const entries = await this.entries();
      let cleanedCount = 0;

      for (const [key, session] of entries) {
        if (session.lastActivityTime && (now - session.lastActivityTime > inactivityThreshold)) {
          await this.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} inactive session(s)`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('❌ Error cleaning up inactive sessions:', error);
      return 0;
    }
  }
}

// Create singleton instance
const sessionManager = new SessionManager();

// Initialize connection
sessionManager.connect().catch(error => {
  console.error('❌ Failed to initialize session manager:', error);
  console.warn('⚠️  Server will continue but sessions may not persist');
});

// Export the singleton instance
export default sessionManager;

// Also export the class for testing purposes
export { SessionManager };
