import axios from "axios";
import { userSessions, io } from "./server.js";
import { getImageAndUploadToBlob } from "./helpers/handle-media.js"
import { saveMessage } from "./helpers/misc.js";
import { getIndianCurrentTime } from "./utils.js";
import { normalizePhone } from "./normalize.js";
import { trackMessageSend } from "./analytics/tracker.js";

export async function sendMessage(phoneNumber, business_phone_number_id, messageData, access_token = null, tenant) {

    const key = phoneNumber + business_phone_number_id;
    const userSession = await userSessions.get(key);
    if (!userSession && access_token == null) {
        console.error("User session not found and no access token provided.");
        return { success: false, error: "User session or access token missing." };
    }

    const url = `https://graph.facebook.com/v18.0/${business_phone_number_id}/messages`;
    console.log('Sending message to:', phoneNumber);

    phoneNumber = String(phoneNumber).trim();
    phoneNumber = normalizePhone(phoneNumber);


    //console.log('Message Data:', JSON.stringify(messageData, null, 7));

    if (access_token == null) access_token = userSession.accessToken;
    if (tenant == null) tenant = userSession.tenant
    try {
        messageData["messaging_product"] = "whatsapp"
        messageData["recipient_type"] = "individual"
        messageData["to"] = phoneNumber
        console.log("Sending Message")
        const response = await axios.post(
            url, messageData,
            {
                headers: { Authorization: `Bearer ${access_token}` }
            }
        );
        if (response.data && response.data.messages && response.data.messages.length > 0) {
            console.log('Message sent successfully:', response.data);
            console.log("Tenant sent in send-message: ", tenant)

            const messageId = response.data.messages[0].id;

            // Track analytics for this message
            try {
                await trackMessageSend({
                    tenantId: tenant,
                    messageId: messageId,
                    templateId: messageData?.template?.name || null,
                    templateName: messageData?.template?.name || null,
                    recipientPhone: phoneNumber,
                    recipientName: null,
                    contactId: null,
                    campaignId: null,
                    broadcastGroupId: null,
                    messageType: messageData.type || 'text',
                    conversationCategory: 'marketing',
                    cost: null, // Will use default cost based on category
                    timestamp: new Date()
                });
            } catch (analyticsError) {
                console.error('❌ [Analytics] Failed to track message send:', analyticsError);
                // Don't fail the message send if analytics tracking fails
            }

            let mediaURLPromise = Promise.resolve(null);
            const mediaID = messageData?.video?.id || messageData?.audio?.id || messageData?.image?.id
            // if (mediaID != undefined) {
            //     mediaURLPromise = await getImageAndUploadToBlob(mediaID, access_token).then(mediaURL => {
            //         if (messageData?.video?.id) {
            //             messageData.video.id = mediaURL;
            //         } else if (messageData?.audio?.id) {
            //             messageData.audio.id = mediaURL;
            //         } else if (messageData?.image?.id) {
            //             messageData.image.id = mediaURL;
            //         }
            //     })
            // }

            let timestamp = await getIndianCurrentTime()

            // console.log("MESSAGE DATA: ", JSON.stringify(messageData, null, 4))
            io.emit('node-message', {
                message: messageData,
                phone_number_id: business_phone_number_id,
                contactPhone: phoneNumber,
                time: timestamp
            });
            console.log("Emitted Node Message")
            let formattedConversation = [{ text: messageData, sender: "bot" }];
            saveMessage(normalizePhone(phoneNumber), business_phone_number_id, formattedConversation, tenant, timestamp)

            await mediaURLPromise
            // if(userSession) console.log("Current Node after sending message: ", userSession.currNode, "Next Node after sending message: ", userSession.nextNode)
            return { success: true, data: response.data };

        } else {
            throw new Error("Message not sent");
        }

    } catch (error) {
        console.error('Failed to send message:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response ? error.response.data : error.message };
    }
}
