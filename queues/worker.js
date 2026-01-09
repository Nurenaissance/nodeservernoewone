import axios from "axios";
import { writeFile, readFile } from 'fs/promises';
import { messageQueue, getCampaignUserSession, setCampaignUserSession, setTemplateName } from "./workerQueues.js";
import { getIndianCurrentTime } from '../utils.js';

const djangoURL = process.env.DJANGO_URL || "https://backeng4whatsapp-dxbmgpakhzf9bped.centralindia-01.azurewebsites.net"

const numberOfWorkers = 1

// ============================================================================
// QUEUE WORKERS (Only register if messageQueue is available)
// ============================================================================

if (messageQueue) {
  console.log('🔄 Registering Bull Queue workers...');

  messageQueue.process('campaign', numberOfWorkers, async(job) => {
  try{
    const { messageData, contact, templateInfo, campaignData } = job.data
    console.log("Rcvd message queue data in campaign worker: ", job.data)
  
    const key = `${campaignData.bpid}_${contact}`
    const campaignUserSession = await getCampaignUserSession(key)
  
    const messageID = await sendMessage(messageData, contact, campaignData.bpid, campaignData.access_token, campaignData.tenant_id)
    campaignUserSession.templateInfo = templateInfo;
    campaignUserSession.lastMessageID = messageID;
    await setCampaignUserSession(key, campaignUserSession)
    addData(key, campaignData)
    
    const data = {message_id: messageID, status: "sent", type: "campaign", type_identifier: campaignData.name, template_name: templateInfo.name, userPhone: contact, tenant_id: campaignData.tenant_id}
    const res = await axios.post(`${djangoURL}/individual_message_statistics/`, data, {headers: {'bpid': campaignData.bpid}})
    
  }catch(err){
    console.error("Error occured in messageQueue(campaign): ", err)
  }
})

messageQueue.process('template', numberOfWorkers, async(job) => {
  try {
    const { messageData, contact, templateData } = job.data;
    console.log("Rcvd message queue data in template worker: ", job.data);

    const messageID = await sendMessage(messageData, contact, templateData.bpid, templateData.access_token, templateData.tenant_id);
    
    // Store the messageID in the job's result
    job.data.messageID = messageID;
    
    const key = `template_wamid:${messageID}`;
    await setTemplateName(key, templateData.name, { EX: 600 });

    const data = {
      message_id: messageID,
      status: "sent",
      type: "template",
      type_identifier: templateData.name,
      template_name: templateData.name,
      userPhone: contact,
      tenant_id: templateData.tenant_id
    };
    const res = await axios.post(`${djangoURL}/individual_message_statistics/`, data, { headers: { 'bpid': templateData.bpid } });
    return { messageID, contact }; // Return result for job

  } catch (err) {
    console.error("Error occurred in messageQueue(template): ", err);
    throw err; // Rethrow to mark job as failed
  }
});

messageQueue.process('group', numberOfWorkers, async(job) => {
  try {
    const { messageData, contact, groupData } = job.data;
    console.log("Rcvd message queue data in template worker: ", job.data);

    const messageID = await sendMessage(messageData, contact, groupData.bpid, groupData.access_token, groupData.tenant_id);

    const key = `template_wamid:${messageID}`;
    await setTemplateName(key, groupData.templateName, { EX: 600 });

    const data = {
      message_id: messageID,
      status: "sent",
      type: "group",
      type_identifier: groupData.name,
      template_name: groupData.templateName,
      userPhone: contact,
      tenant_id: groupData.tenant_id
    };
    const res = await axios.post(`${djangoURL}/individual_message_statistics/`, data, { headers: { 'bpid': groupData.bpid } });

  } catch (err) {
    console.error("Error occurred in messageQueue(group): ", err);
  }
});

  console.log('✅ Bull Queue workers registered successfully');
} else {
  console.log('⚠️  Bull Queue workers disabled (messageQueue not available in local development mode)');
}

// ============================================================================
// MESSAGE SENDING FUNCTION (Always available)
// ============================================================================

export async function sendMessage(messageData, contact, bpid, access_token, tenant_id) {
  try{
    const url = `https://graph.facebook.com/v18.0/${bpid}/messages`;
    const headers = { 'Authorization': `Bearer ${access_token}`}

    contact = String(contact).trim();
    if(contact.length == 10) contact = `91${contact}`
    console.log("Sending Message to: ", contact, messageData, headers)
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: contact,
        ...messageData
      },
      {
        headers: headers
      }
    );
    const messageID = response.data.messages[0].id
    console.log("Message  sent successfully: ", messageID)

    // Save template message to conversation
    try {
      const timestamp = await getIndianCurrentTime();
      const formattedConversation = [{ text: messageData, sender: "bot" }];

      await axios.post(
        `${djangoURL}/whatsapp_convo_post/${contact}/?source=whatsapp`,
        {
          contact_id: contact,
          business_phone_number_id: bpid,
          conversations: formattedConversation,
          tenant: tenant_id,
          time: timestamp
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Id': tenant_id
          },
        }
      );
      console.log("Template message saved to conversation for: ", contact);
    } catch (saveError) {
      console.error("Error saving template message to conversation:", saveError.message);
    }

    return messageID
  }catch(error){
    console.error("Error rcvd in sendMessage: ", JSON.stringify(error, null, 7))

    // Log the specific Facebook API error if available
    if (error.response?.data) {
      console.error("❌ Facebook API Error Details:", JSON.stringify(error.response.data, null, 2));
    }

    // Return null to indicate failure
    return null;
  }
}

import path from 'path'
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.resolve(__dirname, "../dataStore/activeCampaign.json");

export async function readData() {
  try {
      const data = await readFile(filePath, 'utf8');
      return JSON.parse(data);
  } catch (err) {
      console.error('Error reading the file:', err);
      return {};
  }
}

export async function writeData(data) {
  try {
      console.log("Erititng data: ", data, "to file: ", filePath)
      await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log('Data successfully written to file: ', filePath);
  } catch (err) {
      console.error('Error writing to the file:', err);
  }
}

export async function addData(key, value) {
  try {
      const data = await readData();
      data[key] = value;
      await writeData(data);
      console.log(`Data added successfully for key: ${key}`);
  } catch (err) {
      console.error('Error adding data:', err);
  }
}

export async function deleteData(key) {
  try {
      const data = await readData();
      if (data[key]) {
          delete data[key];
          await writeData(data);
          console.log(`Data deleted for key: ${key}`);
      } else {
          console.log(`Key not found: ${key}`);
      }
  } catch (err) {
      console.error('Error deleting data:', err);
  }
}