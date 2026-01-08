import express from 'express';
import axios from 'axios';
import { Worker } from 'worker_threads';
import { sendTextMessage, fastURL } from '../mainwebhook/snm.js';
import { sendMessage } from '../send-message.js';
import { messageCache } from '../server.js';

const router = express.Router();

router.post("/sendMessage", async (req, res) => {
  const { 
    message, 
    phone,
    business_phone_number_id = 534896646366826,
    access_token = "EAAVZBobCt7AcBO1IxLG4luufAySUGczTQZAeGZBZBDsGRLQZAaLJSVVCfTDJ1Eq23V7WhS6PVYZBCr9AHatrUyyFLuUDMXMLm2q2Oed2F9LAfsozZAVDvUvmBJNgGH8YVjpbOFTHVJjvZAQ2RY6aliQqpAP3XvrhxLm2tFJx8eobUxpX8njE1V2BmWhxwMmqfwfdjTqWJlFfdzR7qqkAZCv6HmQqYZASW1xkplAePvGYdJinL0Ibh5FvSFYfxkUyqR",
    tenant_id = 'leqcjsk',
    custom =false
  } = req.body;

  try {
    if(!custom){
    await sendTextMessage(phone, business_phone_number_id, message, access_token, tenant_id);}
    else{
      await sendMessage(
        phone, business_phone_number_id, message, access_token, tenant_id
    );
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.post("/send-message", async (req, res) => {
  try {
    const { phoneNumbers, message, url, messageType, additionalData, business_phone_number_id, bg_id } = req.body;
    const tenant_id = req.headers['x-tenant-id'];
    const sendPromises = phoneNumbers.map(async (phoneNumber) => {
      
      const formattedPhoneNumber = phoneNumber.length === 10 ? `91${phoneNumber}` : phoneNumber;
      const cacheKey = `sm_${business_phone_number_id}`;
      
      let access_token = messageCache.get(cacheKey);
      if (!access_token) {
        try {
          const tenantRes = await axios.get(`${fastURL}/whatsapp_tenant`, {
            headers: { 'X-Tenant-Id': tenant_id }
          });
          access_token = tenantRes.data.whatsapp_data[0].access_token;
          messageCache.set(cacheKey, access_token);
        } catch (error) {
          console.error(`Error fetching tenant data for user ${business_phone_number_id}:`, error);
          throw error;
        }
      }

      const messageHandlers = {
        text: () => sendTextMessage(formattedPhoneNumber, business_phone_number_id, message, access_token, tenant_id),
        media: async () => {
          try {
            const { mediaId, caption } = additionalData;
            console.log(`Media ID: ${mediaId}, caption: ${caption}`);
      
            const mediaResponse = await axios.get(`https://graph.facebook.com/v22.0/${mediaId}/`, {
              headers: { 'Authorization': `Bearer ${access_token}` }
            });
      
            const mime = mediaResponse?.data?.mime_type;
            let messageData;
      
            switch (mime) {
              case "application/pdf":
                messageData = { type: "document", document: { id: mediaId } };
                if (caption) messageData.document.caption = caption;
                break;
      
              case "image/jpeg":
              case "image/png":
              case "image/gif":
                messageData = { type: "image", image: { id: mediaId } };
                if (caption) messageData.image.caption = caption;
                break;
      
              case "video/mp4":
              case "video/quicktime":
                messageData = { type: "video", video: { id: mediaId } };
                if (caption) messageData.video.caption = caption;
                break;
      
              case "audio/mpeg":
              case "audio/ogg":
              case "audio/wav":
                messageData = { type: "audio", audio: { id: mediaId } };
                break;
      
              default:
                console.warn(`Unsupported MIME type: ${mime}`);
                return;
            }
      
            return sendMessage(formattedPhoneNumber, business_phone_number_id, messageData, access_token, tenant_id);
          } catch (error) {
            console.error("Error handling media:", error);
          }
        },
      };
      
      if (!messageHandlers[messageType]) {
        throw new Error("Invalid message type");
      }

      const response = await messageHandlers[messageType]();
      const messageID = response.data?.messages[0]?.id;

      return { phoneNumber: formattedPhoneNumber, messageID, success: true };
    });

    const results = await Promise.all(sendPromises);
    res.json({ results });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.post("/use-worker", async (req, res) => {
  const worker = new Worker('./worker2.js', {workerData: req.body});
  worker.on('message', (result) => {
    console.log('square of 5 is :', result);
  });
  worker.on("error", (msg) => {
    console.log(msg);
  });
  console.log('hurreyy');
  res.sendStatus(200);
});

export default router;
