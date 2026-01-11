import express from 'express';
import tenantAutomationControl from '../tenantAutomationControl.js';

const router = express.Router();

/**
 * KILL SWITCH: Instantly stop all automation for a tenant
 * POST /api/tenant-control/kill-switch
 * Body: { tenant_id, business_phone_number_id }
 */
router.post('/kill-switch', async (req, res) => {
  try {
    const { tenant_id, business_phone_number_id } = req.body;

    if (!tenant_id || !business_phone_number_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenant_id, business_phone_number_id'
      });
    }

    console.log(`🚨 Kill switch requested for tenant: ${tenant_id}`);

    const result = await tenantAutomationControl.killSwitch(tenant_id, business_phone_number_id);

    return res.status(200).json(result);
  } catch (error) {
    console.error('❌ Error in kill-switch endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to execute kill switch',
      message: error.message
    });
  }
});

/**
 * Enable automation for a tenant
 * POST /api/tenant-control/enable-automation
 * Body: { tenant_id, business_phone_number_id }
 */
router.post('/enable-automation', async (req, res) => {
  try {
    const { tenant_id, business_phone_number_id } = req.body;

    if (!tenant_id || !business_phone_number_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenant_id, business_phone_number_id'
      });
    }

    console.log(`✅ Enable automation requested for tenant: ${tenant_id}`);

    const result = await tenantAutomationControl.enableAutomation(tenant_id, business_phone_number_id);

    return res.status(200).json(result);
  } catch (error) {
    console.error('❌ Error in enable-automation endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to enable automation',
      message: error.message
    });
  }
});

/**
 * Invalidate flow cache when flow changes
 * POST /api/tenant-control/invalidate-flow
 * Body: { tenant_id, business_phone_number_id, reset_sessions }
 */
router.post('/invalidate-flow', async (req, res) => {
  try {
    const { tenant_id, business_phone_number_id, reset_sessions = true } = req.body;

    if (!tenant_id || !business_phone_number_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenant_id, business_phone_number_id'
      });
    }

    console.log(`🔄 Flow invalidation requested for tenant: ${tenant_id}`);

    const result = await tenantAutomationControl.invalidateFlowCache(
      tenant_id,
      business_phone_number_id,
      reset_sessions
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error('❌ Error in invalidate-flow endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to invalidate flow cache',
      message: error.message
    });
  }
});

/**
 * Get automation status for a tenant
 * GET /api/tenant-control/status
 * Query: tenant_id, business_phone_number_id
 */
router.get('/status', async (req, res) => {
  try {
    const { tenant_id, business_phone_number_id } = req.query;

    if (!tenant_id || !business_phone_number_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: tenant_id, business_phone_number_id'
      });
    }

    const result = await tenantAutomationControl.getAutomationStatus(tenant_id, business_phone_number_id);

    return res.status(200).json(result);
  } catch (error) {
    console.error('❌ Error in status endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get automation status',
      message: error.message
    });
  }
});

/**
 * Enhanced reset-session with flow cache invalidation
 * POST /api/tenant-control/reset-session
 * Body: { business_phone_number_id, tenant_id, invalidate_cache }
 */
router.post('/reset-session', async (req, res) => {
  try {
    const { business_phone_number_id, tenant_id, invalidate_cache = true } = req.body;

    if (!business_phone_number_id) {
      return res.status(400).json({
        success: false,
        error: 'business_phone_number_id is required'
      });
    }

    console.log(`🔄 Reset session requested for BPID: ${business_phone_number_id}`);

    const sessionsDeleted = await tenantAutomationControl.deleteAllSessionsForBpid(business_phone_number_id);

    let cacheCleared = 0;
    if (invalidate_cache) {
      const { messageCache } = await import('../server.js');
      cacheCleared = messageCache.del(business_phone_number_id) ? 1 : 0;
    }

    return res.status(200).json({
      success: true,
      message: `Session reset successfully for ${business_phone_number_id}`,
      sessionsDeleted,
      cacheCleared,
      actions: [
        `Deleted ${sessionsDeleted} active sessions`,
        invalidate_cache ? `Cleared ${cacheCleared} cache entries` : 'Cache not cleared'
      ]
    });
  } catch (error) {
    console.error('❌ Error in reset-session endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset session',
      message: error.message
    });
  }
});

export default router;
