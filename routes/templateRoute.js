import express from 'express';
import axios from 'axios';
import { sendCampaign, sendTemplate, sendTemplateToGroup } from '../templateService.js';
import { messageCache } from '../server.js';
import { fastURL } from '../mainwebhook/snm.js';

const router = express.Router();

router.post("/send-template", async (req, res) => {
  const type = req.body.type || "template";
  const bpid = req.body.business_phone_number_id;

  try {
    let responseData = messageCache.get(bpid);
    if (!responseData) {
      const response = await axios.get(`${fastURL}/whatsapp_tenant`, {
        headers: { 'bpid': bpid },
        // Fix BigInt precision issue
        transformResponse: [(data) => {
          if (typeof data === 'string') {
            try {
              // Fix large numbers before JSON parsing
              const fixedData = data.replace(
                /"business_account_id":\s*(\d{15,})/g, 
                '"business_account_id":"$1"'
              ).replace(
                /"business_phone_number_id":\s*(\d{15,})/g,
                '"business_phone_number_id":"$1"'
              );
              return JSON.parse(fixedData);
            } catch (e) {
              return JSON.parse(data);
            }
          }
          return data;
        }]
      });
      responseData = response.data; 
      messageCache.set(bpid, responseData);
    }

    const whatsappData = responseData.whatsapp_data?.[0];
    if (!whatsappData) {
      return res.status(400).send({ status: 400, message: "Invalid WhatsApp data." });
    }

    const { access_token, tenant_id, business_account_id: account_id } = whatsappData;

    const handleType = {
      campaign: async () => {
        const campaignData = req.body?.campaign;
        if (!campaignData) {
          return res.status(400).send({ status: 400, message: "Campaign data not found in request" });
        }
        const jobIds = await sendCampaign(campaignData, access_token, tenant_id, account_id, bpid);
        return res.status(200).send({ status: 200, message: "Campaign scheduled", jobIds });
      },
      template: async () => {
        const templateData = req.body?.template;
        templateData.phone = req.body?.phoneNumbers;
        if (!templateData) {
          return res.status(400).send({ status: 400, message: "Template data not found in request" });
        }
        const jobIds = await sendTemplate(templateData, access_token, tenant_id, account_id, bpid);
        return res.status(200).send({ status: 200, message: "Template send scheduled", jobIds });
      },
      group: async () => {
        const groupData = req.body?.group;
        if (!groupData) {
          return res.status(400).send({ status: 400, message: "Group data not found in request" });
        }
        const jobIds = await sendTemplateToGroup(groupData, access_token, tenant_id, account_id, bpid);
        return res.status(200).send({ status: 200, message: "Group template send scheduled", jobIds });
      }
    };

    if (handleType[type]) {
      return await handleType[type]();
    } else {
      return res.status(400).send({ status: 400, message: "Invalid type specified in request" });
    }
  } catch (error) {
    console.error("Error in /send-template:", error.message);
    res.status(500).send({ status: 500, message: "Internal server error" });
  }
});

export default router;
