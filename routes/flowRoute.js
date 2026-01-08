import express from 'express';
import { decryptRequest, encryptResponse, FlowEndpointException } from '../flowsAPI/encryption.js';
import { getNextScreen } from '../flowsAPI/flow.js';
import { isRequestSignatureValid } from '../utils.js';
import { sendFlowMessage } from '../mainwebhook/snm.js';

const router = express.Router();

// SECURITY FIX: Load secrets from environment variables instead of hardcoding
const PASSPHRASE = process.env.PASSPHRASE;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Validate required environment variables on startup
if (!PRIVATE_KEY) {
    console.error('❌ CRITICAL: PRIVATE_KEY environment variable is not set');
    throw new Error('PRIVATE_KEY environment variable is required for WhatsApp Flow decryption');
}

if (!PASSPHRASE) {
    console.error('❌ CRITICAL: PASSPHRASE environment variable is not set');
    throw new Error('PASSPHRASE environment variable is required for WhatsApp Flow decryption');
}

console.log('✅ WhatsApp Flow encryption keys loaded from environment variables');

router.post("/data/:bpid/:name", async (req, res) => {
    if (!PRIVATE_KEY) {
        throw new Error(
            'Private key is empty. Please check your env variable "PRIVATE_KEY".'
        );
    }
    if (!isRequestSignatureValid(req)) {
        // Return status code 432 if request signature does not match.
        // To learn more about return error codes visit: https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes
        return res.status(432).send();
    }
    let decryptedRequest = null;
    try {
        decryptedRequest = decryptRequest(req.body, PRIVATE_KEY, PASSPHRASE);
    } catch (err) {
        console.error(err);
        if (err instanceof FlowEndpointException) {
            return res.status(err.statusCode).send();
        }
        return res.status(500).send();
    }
    const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;
    console.log("💬 Decrypted Request:", decryptedBody);
    const screenResponse = await getNextScreen(decryptedBody, req.params.bpid, req.params.name);
    console.log("👉 Response to Encrypt:", screenResponse);

    res.send(encryptResponse(screenResponse, aesKeyBuffer, initialVectorBuffer));
});

router.post("/send-flow", async (req, res) => {
    try {
        const { phone, header, body, footer, flow_name, flow_cta } = req.body.flowData;
        const { bpid, token, tenant_id } = req.body.cred;
        await sendFlowMessage(phone, bpid, header, body, footer, flow_name, flow_cta, token, tenant_id);
        return res.status(200).json({
            success: true,
            message: "Flow sent successfully"
        });

    } catch (error) {
        console.error("Error in sending flow:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || error.message,
            message: "Failed to send flow"
        });
    }
});

export default router;
