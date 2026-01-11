/**
 * Tenant Automation Control Service
 *
 * Enterprise-grade centralized control for tenant automation
 * Features:
 * - Kill switch to instantly stop all automation for a tenant
 * - Cache invalidation for flow changes
 * - Session management
 * - Real-time state broadcasting via WebSocket
 */

import { userSessions, messageCache, io } from './server.js';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

class TenantAutomationControl {
  constructor() {
    // Redis prefix for tenant states
    this.TENANT_STATE_PREFIX = 'tenant:automation:';
    this.TENANT_ACTIVE_KEY = 'active';
    this.redisClient = null;
    this.initializeRedis();
  }

  async initializeRedis() {
    try {
      const redisConfig = {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
      };

      this.redisClient = createClient(redisConfig);

      this.redisClient.on('error', (err) => {
        console.error('❌ Tenant Control Redis Error:', err);
      });

      this.redisClient.on('ready', () => {
        console.log('✅ Tenant Automation Control: Redis connected');
      });

      await this.redisClient.connect();
    } catch (error) {
      console.error('❌ Failed to initialize Tenant Control Redis:', error);
    }
  }

  /**
   * Kill Switch: Instantly stop ALL automation for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} bpid - Business Phone Number ID
   * @returns {Object} Result with statistics
   */
  async killSwitch(tenantId, bpid) {
    console.log(`🚨 KILL SWITCH ACTIVATED for tenant: ${tenantId}, BPID: ${bpid}`);

    const result = {
      success: false,
      tenantId,
      bpid,
      sessionsDeleted: 0,
      cachesCleared: 0,
      automationStopped: false,
      timestamp: new Date().toISOString(),
      actions: []
    };

    try {
      // 1. Set tenant automation state to INACTIVE
      await this.setTenantAutomationState(tenantId, bpid, false);
      result.automationStopped = true;
      result.actions.push('Tenant automation state set to INACTIVE');

      // 2. Delete ALL sessions for this BPID
      const deletedSessions = await this.deleteAllSessionsForBpid(bpid);
      result.sessionsDeleted = deletedSessions;
      result.actions.push(`Deleted ${deletedSessions} active sessions`);

      // 3. Clear message cache for this BPID
      const cacheCleared = messageCache.del(bpid);
      result.cachesCleared = cacheCleared ? 1 : 0;
      result.actions.push(`Cleared ${result.cachesCleared} cache entries`);

      // 4. Broadcast to all connected clients via WebSocket
      io.emit('automation:killed', {
        tenantId,
        bpid,
        timestamp: result.timestamp,
        message: 'Automation has been stopped for this tenant'
      });
      result.actions.push('Broadcast kill switch notification via WebSocket');

      result.success = true;
      console.log(`✅ KILL SWITCH COMPLETED for tenant: ${tenantId}`);

      return result;
    } catch (error) {
      console.error(`❌ Error in kill switch for tenant ${tenantId}:`, error);
      result.error = error.message;
      return result;
    }
  }

  /**
   * Invalidate flow cache and reset sessions when flow changes
   * @param {string} tenantId - Tenant ID
   * @param {string} bpid - Business Phone Number ID
   * @param {boolean} resetSessions - Whether to reset existing sessions (default: true)
   * @returns {Object} Result with statistics
   */
  async invalidateFlowCache(tenantId, bpid, resetSessions = true) {
    console.log(`🔄 Invalidating flow cache for tenant: ${tenantId}, BPID: ${bpid}`);

    const result = {
      success: false,
      tenantId,
      bpid,
      sessionsDeleted: 0,
      cachesCleared: 0,
      timestamp: new Date().toISOString(),
      actions: []
    };

    try {
      // 1. Clear message cache (contains flow data)
      const cacheCleared = messageCache.del(bpid);
      result.cachesCleared = cacheCleared ? 1 : 0;
      result.actions.push(`Cleared flow cache for BPID: ${bpid}`);

      // 2. Reset all sessions if requested (so they reload fresh flow data)
      if (resetSessions) {
        const deletedSessions = await this.deleteAllSessionsForBpid(bpid);
        result.sessionsDeleted = deletedSessions;
        result.actions.push(`Reset ${deletedSessions} sessions to reload new flow`);
      }

      // 3. Broadcast flow change notification via WebSocket
      io.emit('flow:changed', {
        tenantId,
        bpid,
        timestamp: result.timestamp,
        message: 'Flow has been updated. New conversations will use the updated flow.'
      });
      result.actions.push('Broadcast flow change notification via WebSocket');

      result.success = true;
      console.log(`✅ Flow cache invalidated for tenant: ${tenantId}`);

      return result;
    } catch (error) {
      console.error(`❌ Error invalidating flow cache for tenant ${tenantId}:`, error);
      result.error = error.message;
      return result;
    }
  }

  /**
   * Set tenant automation state (active/inactive)
   * @param {string} tenantId - Tenant ID
   * @param {string} bpid - Business Phone Number ID
   * @param {boolean} isActive - Automation state
   */
  async setTenantAutomationState(tenantId, bpid, isActive) {
    if (!this.redisClient) {
      console.warn('⚠️  Redis client not connected for tenant state');
      return false;
    }

    try {
      const key = `${this.TENANT_STATE_PREFIX}${tenantId}:${bpid}`;
      const state = {
        tenantId,
        bpid,
        active: isActive,
        updatedAt: new Date().toISOString()
      };

      await this.redisClient.set(key, JSON.stringify(state), {
        EX: 86400 // Expire in 24 hours
      });

      console.log(`📝 Tenant automation state set: ${tenantId} - ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
      return true;
    } catch (error) {
      console.error('❌ Error setting tenant automation state:', error);
      return false;
    }
  }

  /**
   * Get tenant automation state
   * @param {string} tenantId - Tenant ID
   * @param {string} bpid - Business Phone Number ID
   * @returns {boolean} Whether automation is active
   */
  async getTenantAutomationState(tenantId, bpid) {
    if (!this.redisClient) {
      console.warn('⚠️  Redis client not connected, assuming active');
      return true; // Default to active if Redis is unavailable
    }

    try {
      const key = `${this.TENANT_STATE_PREFIX}${tenantId}:${bpid}`;
      const stateJson = await this.redisClient.get(key);

      if (!stateJson) {
        // No state set means active by default
        return true;
      }

      const state = JSON.parse(stateJson);
      return state.active;
    } catch (error) {
      console.error('❌ Error getting tenant automation state:', error);
      return true; // Default to active on error
    }
  }

  /**
   * Delete all sessions for a given BPID
   * @param {string} bpid - Business Phone Number ID
   * @returns {number} Number of sessions deleted
   */
  async deleteAllSessionsForBpid(bpid) {
    try {
      const entries = await userSessions.entries();
      let deletedCount = 0;

      for (const [key, value] of entries) {
        if (key.includes(bpid)) {
          await userSessions.delete(key);
          deletedCount++;
        }
      }

      console.log(`🗑️  Deleted ${deletedCount} sessions for BPID: ${bpid}`);
      return deletedCount;
    } catch (error) {
      console.error('❌ Error deleting sessions for BPID:', error);
      return 0;
    }
  }

  /**
   * Re-enable automation for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} bpid - Business Phone Number ID
   * @returns {Object} Result
   */
  async enableAutomation(tenantId, bpid) {
    console.log(`✅ Re-enabling automation for tenant: ${tenantId}, BPID: ${bpid}`);

    try {
      await this.setTenantAutomationState(tenantId, bpid, true);

      // Broadcast automation enabled via WebSocket
      io.emit('automation:enabled', {
        tenantId,
        bpid,
        timestamp: new Date().toISOString(),
        message: 'Automation has been re-enabled for this tenant'
      });

      return {
        success: true,
        tenantId,
        bpid,
        message: 'Automation enabled successfully'
      };
    } catch (error) {
      console.error(`❌ Error enabling automation for tenant ${tenantId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get automation status for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} bpid - Business Phone Number ID
   * @returns {Object} Status information
   */
  async getAutomationStatus(tenantId, bpid) {
    try {
      const isActive = await this.getTenantAutomationState(tenantId, bpid);
      const entries = await userSessions.entries();
      const sessionCount = entries.filter(([key]) => key.includes(bpid)).length;

      return {
        success: true,
        tenantId,
        bpid,
        automationActive: isActive,
        activeSessions: sessionCount,
        cacheExists: messageCache.has(bpid)
      };
    } catch (error) {
      console.error(`❌ Error getting automation status for tenant ${tenantId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
        console.log('✅ Tenant Automation Control: Redis disconnected');
      }
    } catch (error) {
      console.error('❌ Error disconnecting Tenant Control Redis:', error);
    }
  }
}

// Create singleton instance
const tenantAutomationControl = new TenantAutomationControl();

export default tenantAutomationControl;
export { TenantAutomationControl };
