import express from 'express';
import { sendMessage } from '../send-message.js';

const router = express.Router();

router.get("/health", async (req, res) => {
    try {
        const phoneNumber = "9643393874";
        const business_phone_number_id = "241683569037594";
        const messageData = { type: "text", text: { body: "This is a health checkup" } };
        const access_token = "EAAVZBobCt7AcBO8trGDsP8t4bTe2mRA7sNdZCQ346G9ZANwsi4CVdKM5MwYwaPlirOHAcpDQ63LoHxPfx81tN9h2SUIHc1LUeEByCzS8eQGH2J7wwe9tqAxZAdwr4SxkXGku2l7imqWY16qemnlOBrjYH3dMjN4gamsTikIROudOL3ScvBzwkuShhth0rR9P";
        const tenant = "ai";
        await sendMessage(phoneNumber, business_phone_number_id, messageData, access_token, tenant);

        res.status(200).json({ "status": "ok", "message": "WhatsApp bot server is healthy." });
    } catch (error) {
        res.status(500).json({ "status": "error", "message": "WhatsApp bot server is unhealthy.", "error": error.response?.data || error.message || error });
    }
});

export default router;
