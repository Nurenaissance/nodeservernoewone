import express from 'express';
import { getSession } from '../helpers/misc.js';

const router = express.Router();

router.post('/update-session-mode', async (req, res) => {
    try {
        const business_phone_number_id = req.body.business_phone_number_id;
        const userPhoneNumber = req.body.userPhoneNumber;
        const mode = req.body.mode || "chatbot";

        const userSession = await getSession(business_phone_number_id, { wa_id: userPhoneNumber }, true);
        userSession.type = mode;
        console.log("done");
        return res.status(200).json({ message: 'Session mode updated successfully' });
    } catch (error) {
        console.log("Error updating session mode:", error.response?.data || error.message);
        res.status(500).json({ "Error": "Error updating session mode" });
    }
});

export default router;
