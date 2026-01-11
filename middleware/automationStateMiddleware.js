/**
 * Automation State Middleware
 *
 * Checks if automation is active for a tenant before processing webhook/automation requests
 * Acts as a circuit breaker for the kill switch functionality
 */

import tenantAutomationControl from '../tenantAutomationControl.js';
import { getTenantFromBpid } from '../helpers/misc.js';

/**
 * Middleware to check if automation is active for a tenant
 * If automation is disabled (kill switch activated), reject the request
 */
export async function checkAutomationActive(req, res, next) {
  try {
    // Extract BPID from request (different endpoints might use different parameter names)
    const bpid = req.body?.business_phone_number_id ||
                 req.query?.business_phone_number_id ||
                 req.params?.business_phone_number_id ||
                 req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id; // WhatsApp webhook format

    if (!bpid) {
      // If no BPID found, allow the request (might be a health check or non-automation endpoint)
      return next();
    }

    // Get tenant ID
    let tenantId = req.body?.tenant_id ||
                   req.query?.tenant_id ||
                   req.headers?.['x-tenant-id'] ||
                   req.headers?.['X-Tenant-ID'];

    // If tenant ID not in request, try to fetch from database
    if (!tenantId) {
      try {
        tenantId = await getTenantFromBpid(bpid);
      } catch (error) {
        console.warn(`⚠️  Could not fetch tenant for BPID: ${bpid}`);
        // Allow request if we can't determine tenant (backward compatibility)
        return next();
      }
    }

    if (!tenantId) {
      // If still no tenant ID, allow the request (backward compatibility)
      return next();
    }

    // Check if automation is active for this tenant
    const isActive = await tenantAutomationControl.getTenantAutomationState(tenantId, bpid);

    if (!isActive) {
      console.log(`🚫 Automation disabled for tenant ${tenantId}, BPID ${bpid} - Request blocked`);
      return res.status(503).json({
        success: false,
        error: 'Automation is currently disabled for this tenant',
        message: 'Automation has been stopped. Contact your administrator to re-enable it.',
        tenantId,
        bpid,
        automationActive: false
      });
    }

    // Automation is active, proceed with request
    next();
  } catch (error) {
    console.error('❌ Error in automation state middleware:', error);
    // On error, allow the request (fail open for reliability)
    next();
  }
}

/**
 * Apply automation state check only to specific routes
 * Usage: app.use('/webhook', checkAutomationActiveForWebhooks, webhookRoutes)
 */
export function checkAutomationActiveForWebhooks(req, res, next) {
  // Only check automation state for POST requests (actual message processing)
  // Skip GET requests (verification, health checks)
  if (req.method === 'GET') {
    return next();
  }

  return checkAutomationActive(req, res, next);
}

export default {
  checkAutomationActive,
  checkAutomationActiveForWebhooks
};
