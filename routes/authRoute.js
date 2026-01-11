import express from 'express';
import axios from 'axios';
import { delay } from '../utils.js';
import { getAccessToken, getWabaID, getPhoneNumberID, registerAccount, postRegister, addKey,getAccessTokenprev } from '../helpers/login-flow.js';
import { djangoURL } from '../mainwebhook/snm.js';
import { userSessions, messageCache } from '../server.js';

const router = express.Router();

router.post("/login-flow/:tenant_id", async (req, res) => {
  try {
    const tenant_id = req.params.tenant_id;
    console.log("Tenant ID: ", tenant_id);
    const authCode = req.body.code;
    console.log("authCode: ", authCode);
    
    // Check if registration should be skipped (user is already connected)
    const skipRegistration = req.body.skip_registration || false;
    console.log("Skip Registration: ", skipRegistration);
    let access_token; // ✅ Declare it once in outer scope

    if (!skipRegistration) {
      access_token = await getAccessTokenprev(authCode);
      console.log("access token: ", access_token);
    } else {
      access_token = await getAccessToken(authCode);
      console.log("access token: ", access_token);
    }

    const atatataResponse = await axios.post('https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/register', {
      access_token: access_token,
    },
    {
      headers: {
        'X-Tenant-Id': tenant_id
      }
    });
    const waba_id = await getWabaID(access_token);
    console.log("waba_id: ", waba_id);

    const business_phone_number_id = await getPhoneNumberID(access_token, waba_id);
    console.log("bipd: ", business_phone_number_id);

    if (!skipRegistration) {
      // Only register if user is NOT already connected (new user)
      console.log("New user - proceeding with registration");
      await delay(5000);
      const register_response = await registerAccount(business_phone_number_id, access_token);
      console.log("Registration completed: ", register_response);
    } else {
      console.log("Connected user - skipping registration step");
    }
    
    // Post-register step (runs for both scenarios)
    const postRegister_response = await postRegister(access_token, waba_id);
    console.log("Post-register completed: ", postRegister_response);
    const postRegisterDataResponse = await axios.post('https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/register', {
      business_phone_number_id: business_phone_number_id,
      access_token: access_token,
      accountID: waba_id,
      firstInsert: !skipRegistration // true if new user, false if registration was skipped
    },
    {
      headers: {
        'X-Tenant-Id': tenant_id
      }
    });
    console.log("Post-register webhook response: ", postRegisterDataResponse.data);

    const response = await axios.post(`${djangoURL}/insert-data/`, {
      business_phone_number_id: business_phone_number_id,
      access_token: access_token,
      accountID: waba_id,
      firstInsert: true // false if registration was skipped, true if new user
    },
    {
      headers: {
        'X-Tenant-Id': tenant_id,
        'bpid': business_phone_number_id
      }
    });

    console.log("Django response: ", response.data);

    addKey(tenant_id);
    
    res.status(200).json({
      access_token,
      wbid: waba_id,
      business_phone_number_id,
      registration_skipped: skipRegistration,
      user_type: skipRegistration ? 'existing_connected' : 'new_registration'
    });

  } catch (error) {
    console.error('Error occurred during login flow:', error);
    res.status(500).json({
      error: 'Error occurred during login flow',
      message: error.message
    });
  }
});

/**
 * DEPRECATED: Use /api/tenant-control/reset-session instead
 * This endpoint is maintained for backward compatibility
 */
router.post("/reset-session", async (req, res) => {
  const bpid = req.body.business_phone_number_id;
  try {
    // Validate bpid parameter
    if (!bpid) {
      return res.status(400).json({ "Error": "business_phone_number_id is required" });
    }

    console.log(`⚠️  Using deprecated /reset-session endpoint. Use /api/tenant-control/reset-session instead`);

    // Import tenant automation control
    const tenantAutomationControl = (await import('../tenantAutomationControl.js')).default;

    // Delete all sessions for this BPID
    const deletedCount = await tenantAutomationControl.deleteAllSessionsForBpid(bpid);

    // Clear message cache for this bpid
    const cacheCleared = messageCache.del(bpid);

    console.log(`Reset session: Deleted ${deletedCount} session(s) and cleared cache for ${bpid}`);

    res.status(200).json({
      "Success": `Session Deleted Successfully for ${bpid}`,
      "deletedSessions": deletedCount,
      "cacheCleared": cacheCleared,
      "warning": "This endpoint is deprecated. Please use /api/tenant-control/reset-session instead"
    });
  } catch (error) {
    console.error(`Error Occurred while resetting session for ${bpid}:`, error);
    res.status(500).json({
      "Error": `Error Occurred while resetting session for ${bpid}`,
      "message": error.message
    });
  }
});

export default router;
