import express from 'express';
import { getSession, triggerFlowById } from '../helpers/misc.js';

const router = express.Router();

router.post("/trigger-flow", async (req, res) => {
    try {
        const business_phone_number_id = req.body.business_phone_number_id;
        const userPhoneNumber = req.body.userPhoneNumber;
        const userName = req.body.userName;
        const id = req.body.id;
        
        // Validate required fields
        if (!business_phone_number_id || !userPhoneNumber || !userName || !id) {
            return res.status(400).json({ 
                "Error": "Missing required fields: business_phone_number_id, userPhoneNumber, userName, id" 
            });
        }
        
        const contact = {
            wa_id: userPhoneNumber,
            profile: { name: userName.trim() }
        };
        
        const userSession = await getSession(business_phone_number_id, contact);
        await triggerFlowById(userSession, id);
        res.status(200).json({ "message": "trigger flow successfully set" });
    } catch (error) {
        console.log("Error Occurred setting trigger flow:", error.response?.data || error.message);
        res.status(500).json({ "Error": "Error Occurred setting trigger flow" });
    }
});
export default router; 
