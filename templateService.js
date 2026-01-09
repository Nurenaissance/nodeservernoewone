import axios from 'axios';
import { messageCache } from "./server.js";
import { getMediaID } from "./helpers/handle-media.js";
import { messageQueue } from "./queues/workerQueues.js";
import { sendMessage } from "./queues/worker.js";
import { djangoURL, fastURL } from "./mainwebhook/snm.js";
import { replacePlaceholders } from "./helpers/misc.js"
import { getIndianCurrentTime } from './utils.js';

export async function setTemplate(templateData, phone, bpid, access_token, tenant, otp, link) {
    try {
        console.log("otp received: ", otp);
        console.log("Template Data rcvd: ", templateData)
        const components = templateData?.components || [];
        const template_name = templateData?.name || "defaultTemplateName";
        let messageData;
        const res_components = [];

        for (const component of components) {
            if (component.type === "HEADER") {
            const header_handle = component?.example?.header_handle || [];
            const format = component?.format.toLowerCase()
            const header_text = component?.example?.header_text || [];
            const parameters = [];

            for (const handle of header_handle) {
                const mediaID = await getMediaID(handle, bpid, access_token);
                parameters.push({
                type: format,
                [`${format}`]: { id: mediaID },
                });
            }
            for (const text of header_text) {
                let modified_text = await replacePlaceholders(text, undefined, phone, tenant);
                parameters.push({
                type: "text",
                text: modified_text,
                });
            }
            if (parameters.length > 0) {
                const header_component = {
                type: "header",
                parameters: parameters,
                };
                res_components.push(header_component);
            }
            } else if (component.type === "BODY") {
            const body_text = component?.example?.body_text[0] || [];
            const parameters = [];

            for (const text of body_text) {
                let modified_text;
                if (otp) modified_text = otp;
                else modified_text = await replacePlaceholders(text, undefined, phone, tenant);

                parameters.push({
                type: "text",
                text: modified_text,
                });
            }
            if (parameters.length > 0) {
                const body_component = {
                type: "body",
                parameters: parameters,
                };
                res_components.push(body_component);
            }
            } else if (component.type === "CAROUSEL") {
            const cards = component?.cards || [];
            const cards_content = [];

            for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
                const card = cards[cardIndex];
                const inner_card_component = [];
                
                for (const cardComponent of card.components || []) {
                if (cardComponent.type === "HEADER") {
                    const header_handle = cardComponent?.example?.header_handle || [];
                    const parameters = [];

                    for (const handle of header_handle) {
                    const mediaID = await getMediaID(handle, bpid, access_token);
                    parameters.push({
                        type: "image",
                        image: { id: mediaID }
                    });
                    }

                    if (parameters.length > 0) {
                    inner_card_component.push({
                        type: "header",
                        parameters: parameters
                    });
                    }
                } else if(cardComponent.type === "BODY"){
                    const body_text = cardComponent?.example?.body_text[0] || [];
                    const parameters = [];
        
                    for (const text of body_text) {
                    let modified_text;
                    if (otp) modified_text = otp;
                    else modified_text = await replacePlaceholders(text, undefined, phone, tenant);
        
                    parameters.push({
                        type: "text",
                        text: modified_text,
                    });
                    }
                    if (parameters.length > 0) {
                    inner_card_component.push({
                        type: "body",
                        parameters: parameters
                    });
                    }
                } else if (cardComponent.type === "BUTTONS") {
                    const buttons = cardComponent.buttons || [];
                    
                    buttons.forEach((button, buttonIndex) => {
                    if (button.type === "QUICK_REPLY") {
                        inner_card_component.push({
                        type: "button",
                        sub_type: "quick_reply",  
                        index: buttonIndex.toString(),
                        parameters: [
                            {
                            type: "payload",
                            payload: button.text.toLowerCase().replace(/\s+/g, '-')
                            }
                        ]
                        });
                    }
                    });
                }
                }
                const card_component = {
                card_index: cardIndex,
                components: inner_card_component
                };
                cards_content.push(card_component);
            }

            const carousel_component = {
                type: "carousel",
                cards: cards_content
            };
            res_components.push(carousel_component);
            } else if(component.type == "BUTTONS"){
            if(tenant == 'hjiqohe' && link){
                const parameters = [{type: "text", text: link}]
                const button_component = {type: "button", sub_type: "url", index: 0, parameters: parameters}
                console.log("Button Component: ", button_component)
                res_components.push(button_component)
            }
            }
            else {
            console.warn(`Unknown component type: ${component.type}`);
            }
        }

        messageData = {
            type: "template",
            template: {
            name: template_name,
            language: {
                code: templateData?.language,
            },
            components: res_components,
            },
        };

        return messageData;
    } catch (error) {
        console.error("Error in setTemplate function:", error);
        throw error; 
    }
}

export async function sendCampaign(campaignData, access_token, tenant_id, account_id, bpid){
  console.log("Req rcvd in sendCampaign: ", campaignData, access_token, account_id, tenant_id, bpid)

  const campaignId = campaignData.id
  const response = await axios.get(`${djangoURL}/campaign?id=${campaignId}`, {headers: {'X-Tenant-Id': tenant_id}})

  const contacts = response.data.phone
  const name = response.data.name
  const init = response.data.init
  const templates_data = response.data.templates_data
  console.log("templates data, init: " , templates_data, init)

  const templateInfo = templates_data.find(template => template.index == init)
  campaignData = { campaignId, name, contacts, templates_data, init}
  console.log("TEmplate Info: ", templateInfo, campaignData)

  const templateName = templateInfo.name;
  const cacheKey = `${account_id}_${templateName}`;
  let templateData = messageCache.get(cacheKey);
  console.log("AccountID, templateName, access_token: ", account_id, templateName, access_token)
  
  if (!templateData) {
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${account_id}/message_templates?name=${templateName}`,
      {headers: { Authorization: `Bearer ${access_token}` }}
    );
    console.log("REsponse: ", response.data)
    templateData = response.data.data[0]
    messageCache.set(cacheKey, templateData);
  }

  for(let contact of contacts){
    const messageData = await setTemplate(templateData, contact, bpid, access_token, tenant_id, null)
    campaignData = {
      ...campaignData, access_token, tenant_id, account_id, bpid
    }
    console.log("Sending data in campaign worker")

    // Check if messageQueue is available (production mode)
    if (messageQueue) {
      messageQueue.add('campaign', {messageData, contact, templateInfo, campaignData}, {attempts: 3, backoff: 5000});
    } else {
      // Local development mode - send message directly
      console.log("⚠️  Local dev mode: Sending campaign message directly without queue");
      try {
        const messageID = await sendMessage(messageData, contact, bpid, access_token, tenant_id);

        // Only post statistics if message was sent successfully
        if (messageID) {
          // Store statistics
          const data = {
            message_id: messageID,
            status: "sent",
            type: "campaign",
            type_identifier: campaignData.name,
            template_name: templateInfo.name,
            userPhone: contact,
            tenant_id: campaignData.tenant_id
          };
          await axios.post(`${djangoURL}/individual_message_statistics/`, data, {headers: {'bpid': campaignData.bpid}});
        } else {
          console.error("❌ Campaign message sending failed - messageID is null/undefined");
        }
      } catch (err) {
        console.error("Error sending campaign message in local dev mode:", err);
      }
    }
  }
  console.log("Contacts: ", contacts)
  const data = {name: campaignData.name, sent: contacts.length, type: "campaign"}
  axios.post(`${djangoURL}/message-stat/`, data, {headers: {'X-Tenant-Id': campaignData.tenant_id}})
}

export async function sendTemplate(templateData, access_token, tenant_id, account_id, bpid) {
  console.log("Req rcvd in sendTemplate: ", templateData, access_token, account_id, tenant_id, bpid);

  const templateName = templateData.name;
  const cacheKey = `${account_id}_${templateName}`;
  let templateDetails = messageCache.get(cacheKey);

  console.log("AccountID, templateName, access_token: ", account_id, templateName, access_token);
  if (!templateDetails) {
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${account_id}/message_templates?name=${templateName}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    console.log("Response: ", response.data);
    templateDetails = response.data.data[0];
    messageCache.set(cacheKey, templateDetails);
  }

  const contacts = templateData.phone;
  console.log("Contacts to send template: ", contacts);

  // Array to store job IDs or message IDs
  const jobIds = [];

  for (let contact of contacts) {
    const messageData = await setTemplate(templateDetails, contact, bpid, access_token, tenant_id, null);
    const jobTemplateData = {
      name: templateName,
      access_token,
      tenant_id,
      account_id,
      bpid
    };

    console.log("Sending data in template worker");

    // Check if messageQueue is available (production mode)
    if (messageQueue) {
      const job = await messageQueue.add('template', { messageData, contact, templateData: jobTemplateData }, { attempts: 3, backoff: 5000 });
      jobIds.push(job.id);
    } else {
      // Local development mode - send message directly
      console.log("⚠️  Local dev mode: Sending message directly without queue");
      try {
        const messageID = await sendMessage(messageData, contact, bpid, access_token, tenant_id);

        // Only post statistics if message was sent successfully
        if (messageID) {
          jobIds.push(messageID);

          // Store statistics
          const data = {
            message_id: messageID,
            status: "sent",
            type: "template",
            type_identifier: templateName,
            template_name: templateName,
            userPhone: contact,
            tenant_id: tenant_id
          };
          await axios.post(`${djangoURL}/individual_message_statistics/`, data, { headers: { 'bpid': bpid } });
        } else {
          console.error("❌ Message sending failed - messageID is null/undefined");
        }
      } catch (err) {
        console.error("Error sending message in local dev mode:", err);
      }
    }
  }

  console.log("Contacts: ", contacts);
  const data = { name: templateName, sent: contacts.length, type: "template" };
  axios.post(`${djangoURL}/message-stat/`, data, { headers: { 'X-Tenant-Id': tenant_id } });

  return jobIds;
}

export async function sendTemplateToGroup(groupData, access_token, tenant_id, account_id, bpid) {
  console.log("Req rcvd in sendTemplateToGroup: ", groupData, access_token, account_id, tenant_id, bpid);

  const groupId = groupData.id;
  const groupName = groupData.name;
  const templateName = groupData.templateName
  const response = await axios.get(`${fastURL}/broadcast-groups/${groupId}`, { headers: { 'X-Tenant-Id': tenant_id } });
  const groupDetails = response.data;
  const contacts = groupDetails.members.map(member => member.phone);
  
  console.log("Group details: ", groupDetails);
  console.log("Contacts to send template to group: ", contacts);

  // Fetch the template details from the Facebook API (if not already cached)
  const cacheKey = `${account_id}_${templateName}`;
  let templateDetails = messageCache.get(cacheKey);

  console.log("AccountID, templateName, access_token: ", account_id, templateName, access_token);
  if (!templateDetails) {
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${account_id}/message_templates?name=${templateName}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    console.log("Response: ", response.data);
    templateDetails = response.data.data[0];
    messageCache.set(cacheKey, templateDetails);
  }

  // Loop through each contact and send the template
  for (let contact of contacts) {
    const messageData = await setTemplate(templateDetails, contact, bpid, access_token, tenant_id, null);
    groupData = {
      ...groupData,
      templateName,
      access_token,
      tenant_id,
      account_id,
      bpid
    };
    console.log("Sending data in worker for group");

    // Check if messageQueue is available (production mode)
    if (messageQueue) {
      messageQueue.add('group', { messageData, contact, groupData }, { attempts: 3, backoff: 5000 });
    } else {
      // Local development mode - send message directly
      console.log("⚠️  Local dev mode: Sending group message directly without queue");
      try {
        const messageID = await sendMessage(messageData, contact, bpid, access_token, tenant_id);

        // Only post statistics if message was sent successfully
        if (messageID) {
          // Store statistics
          const data = {
            message_id: messageID,
            status: "sent",
            type: "group",
            type_identifier: groupName,
            template_name: templateName,
            userPhone: contact,
            tenant_id: tenant_id
          };
          await axios.post(`${djangoURL}/individual_message_statistics/`, data, { headers: { 'bpid': bpid } });
        } else {
          console.error("❌ Group message sending failed - messageID is null/undefined");
        }
      } catch (err) {
        console.error("Error sending group message in local dev mode:", err);
      }
    }
  }

  console.log("Contacts: ", contacts);
  const data = { name: groupName, sent: contacts.length, type: "group" };
  await axios.post(`${djangoURL}/message-stat/`, data, { headers: { 'X-Tenant-Id': tenant_id } });
}

export async function setTemplateData(templateName, userSession){
    let responseData = messageCache.get(userSession.business_phone_number_id);

    if (!responseData) {
      try {
        const response = await axios.get(`${fastURL}/whatsapp_tenant`, {
          headers: { bpid: userSession.business_phone_number_id },
        });
        responseData = response.data;
        messageCache.set(userSession.business_phone_number_id, responseData);
      } catch (error) {
        console.error(`Error fetching tenant data: ${error.message}`);
        throw new Error("Failed to fetch tenant data.");
      }
    }

    const access_token = responseData?.whatsapp_data[0]?.access_token;
    const account_id = responseData?.whatsapp_data[0]?.business_account_id;
    const tenant_id = responseData?.whatsapp_data[0]?.tenant_id

    if (!access_token || !account_id) {
      throw new Error("Invalid tenant data. Missing access token or account ID.");
    }

    const cacheKey = `${account_id}_${templateName}`;
    let graphResponse = messageCache.get(cacheKey);

    // Fetch template data if not available in cache
    if (!graphResponse) {
      try {
        const response = await axios.get(
          `https://graph.facebook.com/v22.0/${account_id}/message_templates?name=${templateName}`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        graphResponse = response.data;
        messageCache.set(cacheKey, graphResponse);
      } catch (error) {
        console.error(`Error fetching template: ${error.message}`);
        throw new Error("Failed to fetch template data from the API.");
      }
    }

    if (!graphResponse?.data || graphResponse.data.length === 0) {
      console.error("Template not found.");
      return
    }

    const templateData = graphResponse.data[0];

    

    const messageData = await setTemplateCar(
    templateData,
    userSession.userPhoneNumber,
    userSession.business_phone_number_id,
    userSession.accessToken
    );

    console.log("Message Data: ", messageData);
    return messageData;
}

export async function sendTemplateMessage(templateName, userSession) {
    
    // Send message template
    const messageData = await setTemplateData(templateName, userSession);

    const sendMessageResponse = await sendMessageTemplate(
    userSession.userPhoneNumber,
    userSession.business_phone_number_id,
    messageData,
    userSession.accessToken,
    userSession.tenant
    );
    
}

export async function setTemplateCar(templateData, phone, bpid, access_token) {
    try {
        const components = templateData?.components || []; // Fallback to empty array if components are missing
        const template_name = templateData.name || "defaultTemplateName"; // Fallback if template name is missing
        const cacheKey = `${template_name}_${phone}_${bpid}`;
        let messageData = messageCache.get(cacheKey);

        if (!messageData) {
        const res_components = [];

        for (const component of components) {
            if (component.type === "HEADER") {
            const header_handle = component?.example?.header_handle || [];
            const header_text = component?.example?.header_text || [];
            const parameters = [];

            for (const handle of header_handle) {
                const mediaID = await getMediaID(handle, bpid, access_token);
                parameters.push({
                type: "image",
                image: { id: mediaID },
                });
            }
            for (const text of header_text) {
                let modified_text = await replacePlaceholders(text, undefined, phone);
                parameters.push({
                type: "text",
                text: modified_text,
                });
            }
            if (parameters.length > 0) {
                const header_component = {
                type: "header",
                parameters: parameters,
                };
                res_components.push(header_component);
            }
            } else if (component.type === "BODY") {
            const body_text = component?.example?.body_text[0] || [];
            const parameters = [];

            for (const text of body_text) {
                let modified_text= await replacePlaceholders(text, undefined, phone);

                parameters.push({
                type: "text",
                text: modified_text,
                });
            }
            if (parameters.length > 0) {
                const body_component = {
                type: "body",
                parameters: parameters,
                };
                res_components.push(body_component);
            }
            }
            else if (component.type === "CAROUSEL") {
            const cards = component?.cards || [];
            const cards_content = [];

            for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
                const card = cards[cardIndex];
                const inner_card_component = [];
                
                for (const cardComponent of card.components || []) {
                if (cardComponent.type === "HEADER") {
                    const header_handle = cardComponent?.example?.header_handle || [];
                    const parameters = [];

                    for (const handle of header_handle) {
                    const mediaID = await getMediaID(handle, bpid, access_token);
                    parameters.push({
                        type: "image",
                        image: { id: mediaID }
                    });
                    }

                    if (parameters.length > 0) {
                    inner_card_component.push({
                        type: "header",
                        parameters: parameters
                    });
                    }
                } else if(cardComponent.type === "BODY"){
                    const body_text = cardComponent?.example?.body_text[0] || [];
                    const parameters = [];
        
                    for (const text of body_text) {
                    let modified_text;
                    if (otp) modified_text = otp;
                    else modified_text = await replacePlaceholders(text, undefined, phone);
        
                    parameters.push({
                        type: "text",
                        text: modified_text,
                    });
                    }
                    if (parameters.length > 0) {
                    inner_card_component.push({
                        type: "body",
                        parameters: parameters
                    });
                    }
                } else if (cardComponent.type === "BUTTONS") {
                    const buttons = cardComponent.buttons || [];
                    
                    buttons.forEach((button, buttonIndex) => {
                    if (button.type === "QUICK_REPLY") {
                        inner_card_component.push({
                        type: "button",
                        sub_type: "quick_reply",  
                        index: buttonIndex.toString(),
                        parameters: [
                            {
                            type: "payload",
                            payload: button.text.toLowerCase().replace(/\s+/g, '-')
                            }
                        ]
                        });
                    }
                    });
                }
                }
                const card_component = {
                card_index: cardIndex,
                components: inner_card_component
                };
                cards_content.push(card_component);
            }

            const carousel_component = {
                type: "carousel",
                cards: cards_content
            };
            res_components.push(carousel_component);
            }
            else {
            console.warn(`Unknown component type: ${component.type}`);
            }
        }

        messageData = {
            type: "template",
            template: {
            name: template_name,
            language: {
                code: templateData?.language,
            },
            components: res_components,
            },
        };
        messageCache.set(cacheKey, messageData);
        }

        return messageData;
    } catch (error) {
        console.error("Error in setTemplate function:", error);
        throw error; // Rethrow the error to handle it further up the call stack if needed
    }
}
  
export async function sendMessageTemplate(phoneNumber, business_phone_number_id, messageData, access_token = null, tenant) {
    const url = `https://graph.facebook.com/v18.0/${business_phone_number_id}/messages`;

    try {
        const response = await axios.post(
        url,
        {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNumber,
            ...messageData
        },
        {
            headers: { Authorization: `Bearer ${access_token}` },
        }
        );

        let timestamp = await getIndianCurrentTime()

        try{
            console.log("MESSAGE DATA: ", JSON.stringify(messageData, null, 4))

            let formattedConversation = [{ text: messageData, sender: "bot" }];

            try {
                console.log("Saving convo data: ", phoneNumber, business_phone_number_id, formattedConversation ,tenant)
                console.log(timestamp)
                const saveRes = await axios.post(
                    `${djangoURL}/whatsapp_convo_post/${phoneNumber}/?source=whatsapp`, 
                    {
                        contact_id: phoneNumber,
                        business_phone_number_id: business_phone_number_id,
                        conversations: formattedConversation,
                        tenant: tenant || userSession?.tenant,
                        time: timestamp
                    }, 
                    {
                        headers: {
                        'Content-Type': 'application/json',
                        'X-Tenant-Id': tenant
                        },
                    }
                    );

                    console.log("SAVE RES: ", saveRes.data)

            } catch (error) {
                console.error("Error saving conversation:", error.message);
            }
        }catch(error){
            console.log("error occured while emission: ", error)
        }
        console.log("Message sent successfully:", response.data);

        return { success: true, data: response.data };
    } catch (error) {
        if (error.response) {
        console.error("Response Error:", error.response.data);
        } else if (error.request) {
        console.error("No Response Error:", error.request);
        } else {
        console.error("Setup Error:", error.message);
        }

        return { success: false, error: error.response ? error.response.data : error.message };
    }
}
