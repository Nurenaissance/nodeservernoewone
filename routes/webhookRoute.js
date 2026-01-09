import express from 'express';
import axios from 'axios';

import { getSession, saveMessage, updateLastSeen } from '../helpers/misc.js';
import { convertToValidDateFormat, delay, getIndianCurrentTime, isRequestSignatureValid } from '../utils.js';
import { userWebhook } from '../mainwebhook/userWebhook.js';
import { campaignWebhook } from '../webhooks/campaignWebhook.js';
import { readData } from '../queues/worker.js';
import { djangoURL, fastURL } from '../mainwebhook/snm.js';
import { io, messageCache, userSessions } from '../server.js';
import { delTemplateName, getTemplateName } from '../queues/workerQueues.js';
import { sendMessage } from '../send-message.js';
import { normalizePhone } from '../normalize.js';
import { trackMessageStatus, trackMessageReply, trackButtonClick } from '../analytics/tracker.js';
const router = express.Router();
const WEBHOOK_VERIFY_TOKEN = "COOL";

// ==================== MULTI MEDIA BATCH DETECTION (MOVED FROM userWebhook.js) ====================
// ==================== MULTI MEDIA BATCH DETECTION ====================
const mediaCollectionMap = new Map();

const MEDIA_CONFIG = {
  DETECTION_WINDOW: 5000,           // Wait 5s for additional files
  SINGLE_FILE_TIMEOUT: 2500,        // Fast process single files after 2.5s
  BATCH_PROCESSING_DELAY: 5000,     // Process batch after 5s of last file
  MAX_FILES: 10,
  CLEANUP_AFTER: 8000
};

function collectMedia(userKey, mediaId, messageType, userSession) {
  const now = Date.now();
  
  if (mediaCollectionMap.has(userKey)) {
    const collection = mediaCollectionMap.get(userKey);
    
    if (collection.processed || collection.isProcessing) {
      console.log(`⚠️ [BATCH] Collection already processed/processing, not adding: ${mediaId}`);
      return { collected: false, isFirstFile: false, count: 0, alreadyProcessed: true };
    }
    
    const timeSinceLastUpload = now - collection.lastUploadTime;
    
    if (timeSinceLastUpload < MEDIA_CONFIG.DETECTION_WINDOW) {
      collection.mediaIds.push(mediaId);
      collection.types.push(messageType);
      collection.lastUploadTime = now;
      
      const newCount = collection.mediaIds.length;
      console.log(`📦 [BATCH] Added to collection (${newCount} files): ${mediaId}`);
      
      // Clear single file timeout since we have multiple files
      if (collection.singleFileTimeout) {
        clearTimeout(collection.singleFileTimeout);
        collection.singleFileTimeout = null;
      }
      
      // 🚀 CRITICAL FIX: Only schedule batch timeout if this is the 2nd file
      // Don't reset it for subsequent files
      if (newCount === 2) {
        console.log(`📦 [BATCH] Multiple files detected (${newCount}), scheduling batch processing`);
        scheduleBatchProcessing(userKey);
      }
      // For files 3+, just extend the collection but don't reset the timeout
      else if (newCount > 2) {
        console.log(`📦 [BATCH] Extended collection to ${newCount} files, keeping existing batch schedule`);
      }
      
      return { collected: true, isFirstFile: false, count: newCount };
    } else {
      // Time window expired - process existing and start new
      console.log(`⏱️ [BATCH] Time window expired (${timeSinceLastUpload}ms), processing existing collection`);
      processMediaBatch(userKey);
      
      // Start new collection
      mediaCollectionMap.set(userKey, {
        mediaIds: [mediaId],
        types: [messageType],
        startTime: now,
        lastUploadTime: now,
        userSession: userSession,
        batchTimeout: null,
        singleFileTimeout: null,
        processed: false,
        isProcessing: false,
        skipNodeMessage: true
      });
      
      console.log(`📦 [BATCH] Started new collection for ${userKey}: ${mediaId}`);
      scheduleSingleFileTimeout(userKey);
      return { collected: true, isFirstFile: true, count: 1 };
    }
  } else {
    // First file - create new collection
    mediaCollectionMap.set(userKey, {
      mediaIds: [mediaId],
      types: [messageType],
      startTime: now,
      lastUploadTime: now,
      userSession: userSession,
      batchTimeout: null,
      singleFileTimeout: null,
      processed: false,
      isProcessing: false,
      skipNodeMessage: true
    });
    
    console.log(`📦 [BATCH] Started collection for ${userKey}: ${mediaId} (waiting for more files)`);
    scheduleSingleFileTimeout(userKey);
    
    return { collected: true, isFirstFile: true, count: 1 };
  }
}

function scheduleBatchProcessing(userKey) {
  const collection = mediaCollectionMap.get(userKey);
  if (!collection) return;
  
  // 🔥 Clear any existing single file timeout
  if (collection.singleFileTimeout) {
    clearTimeout(collection.singleFileTimeout);
    collection.singleFileTimeout = null;
  }
  
  if (collection.batchTimeout) {
    clearTimeout(collection.batchTimeout);
  }
  
  const fileCount = collection.mediaIds.length;
  console.log(`⏱️ [BATCH] Batch timer scheduled for ${fileCount} files - will process in ${MEDIA_CONFIG.BATCH_PROCESSING_DELAY}ms`);
  
  collection.batchTimeout = setTimeout(() => {
    processMediaBatch(userKey);
  }, MEDIA_CONFIG.BATCH_PROCESSING_DELAY);  // 🔥 CHANGED: Use longer delay for batches
}
function scheduleSingleFileTimeout(userKey) {
  const collection = mediaCollectionMap.get(userKey);
  if (!collection) return;
  
  collection.singleFileTimeout = setTimeout(async () => {
    const currentCollection = mediaCollectionMap.get(userKey);
    if (currentCollection && 
        !currentCollection.processed && 
        !currentCollection.isProcessing &&
        currentCollection.mediaIds.length === 1) {
      
      console.log(`⏰ [SINGLE] Fast-track timeout - only 1 file received, processing immediately`);
      
      // 🔥 CRITICAL: Clear the batch timeout first
      if (currentCollection.batchTimeout) {
        clearTimeout(currentCollection.batchTimeout);
        currentCollection.batchTimeout = null;
      }
      
      await processMediaBatch(userKey);
    }
  }, MEDIA_CONFIG.SINGLE_FILE_TIMEOUT);  // 🔥 CHANGED: Use dedicated single file timeout (2.5s)
}
async function processMediaBatch(userKey) {
  const collection = mediaCollectionMap.get(userKey);
  
  if (!collection || collection.processed || collection.isProcessing) {
    console.log(`⚠️ [BATCH] No collection or already processed/processing for ${userKey}`);
    return;
  }
  
  collection.isProcessing = true;
  
  // Clear all timeouts
  if (collection.singleFileTimeout) {
    clearTimeout(collection.singleFileTimeout);
  }
  if (collection.batchTimeout) {
    clearTimeout(collection.batchTimeout);
  }
  
  const totalFiles = collection.mediaIds.length;
  const userSession = collection.userSession;
  
  console.log(`🚀 [BATCH] Processing ${totalFiles} file(s) for ${userKey}`);
  
  try {
    const sessionKey = userSession.userPhoneNumber + userSession.business_phone_number_id;
    const currentSession = await userSessions.get(sessionKey);
    
    if (!currentSession) {
      console.error('❌ [BATCH] Session lost during processing');
      return;
    }
    
    if (totalFiles === 1) {
      console.log(`📄 [SINGLE] Only 1 file - releasing to normal userWebhook flow`);
      
      // Mark as processed BEFORE creating mock request
      collection.processed = true;
      
      // Create mock request to pass to userWebhook
      const mockReq = {
        body: {
          entry: [{
            changes: [{
              value: {
                metadata: {
                  phone_number_id: userSession.business_phone_number_id
                },
                contacts: [{
                  wa_id: userSession.userPhoneNumber,
                  profile: { name: userSession.userName }
                }],
                messages: [{
                  type: collection.types[0],
                  id: 'batch_released_' + Date.now(),
                  timestamp: Math.floor(Date.now() / 1000),
                  [collection.types[0]]: {
                    id: collection.mediaIds[0]
                  }
                }]
              }
            }]
          }]
        }
      };
      
      // Clean up immediately since we're processing now
      mediaCollectionMap.delete(userKey);
      console.log(`🧹 [BATCH] Cleaned up single-file collection for ${userKey}`);
      
      // Import and call userWebhook from the correct path
      const { userWebhook } = await import('../mainwebhook/userWebhook.js');
      await userWebhook(mockReq);
      
      console.log(`✅ [SINGLE] File released and processed successfully`);
      return;
    }
    
    // Multiple files - send to bulk endpoint
    if (totalFiles >= 2) {
      console.log(`📦 [BULK] ${totalFiles} files detected - sending to bulk endpoint & jumping to node 1`);
      
      const mediaData = collection.mediaIds.map((id, index) => ({
        mediaId: id,
        type: collection.types[index],
        sequence: index + 1
      }));
      
      try {
        console.log(`📤 [BULK] Sending ${totalFiles} files to bulk API`);
        const response = await axios.post(
          'https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/process-multiple-media',
          {
            userPhone: userSession.userPhoneNumber,
            businessPhoneId: userSession.business_phone_number_id,
            flowName: userSession.flowName,
            inputVariable: userSession.inputVariable,
            totalFiles: totalFiles,
            mediaFiles: mediaData,
            timestamp: await getIndianCurrentTime()
          },
          {
            headers: { 
              'X-Tenant-Id': userSession.tenant,
              'Authorization': `Bearer ${userSession.accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        console.log(`✅ [BULK] API Success:`, response.status, response.data);
        
        currentSession.inputVariable = null;
        
        const targetNodeIndex = currentSession.flowData.findIndex(node => node.id === 1);
        
        if (targetNodeIndex === -1) {
          console.error('❌ [BULK] Node with id 1 not found in flowData');
          
          const fallbackNodeIndex = currentSession.flowData.findIndex(node => 
            node.type === 'Button' || (node.body && node.body.includes('Got it'))
          );
          
          if (fallbackNodeIndex !== -1) {
            console.warn(`⚠️ [BULK] Using fallback button node at index ${fallbackNodeIndex}`);
            currentSession.currNode = fallbackNodeIndex;
            currentSession.nextNode = currentSession.adjList[fallbackNodeIndex];
          } else {
            console.error('❌ [BULK] No suitable fallback node found');
            throw new Error('Target node with id 1 not found and no fallback available');
          }
        } else {
          currentSession.currNode = targetNodeIndex;
          currentSession.nextNode = currentSession.adjList[targetNodeIndex];
        }
        
        await userSessions.set(sessionKey, currentSession);
        
        console.log(`🎯 [BULK] Jumped to node with id:1 (array index: ${targetNodeIndex})`);
        
        const { sendNodeMessage } = await import('../mainwebhook/snm.js');
        console.log("testingggggggggg");
        await sendNodeMessage(
          currentSession.userPhoneNumber, 
          currentSession.business_phone_number_id
        );
        
        console.log(`✅ [BULK] Flow continued successfully from node 1`);
        
      } catch (error) {
        console.error(`❌ [BULK] API Error:`, error.response?.data || error.message);
        
        const errorMsg = {
          type: "text",
          text: {
            body: "⚠️ There was an error processing your documents. Please try uploading them again one by one."
          }
        };
        
        await sendMessage(
          userSession.userPhoneNumber,
          userSession.business_phone_number_id,
          errorMsg,
          userSession.accessToken,
          userSession.tenant
        );
        
        currentSession.inputVariable = userSession.inputVariable;
        await userSessions.set(sessionKey, currentSession);
      }
    }
    
  } catch (error) {
    console.error(`❌ [BATCH] Unexpected error:`, error);
  } finally {
    if (!collection.processed) {
      collection.processed = true;
    }
    collection.isProcessing = false;
    
    // Clean up after delay
    setTimeout(() => {
      if (mediaCollectionMap.has(userKey)) {
        mediaCollectionMap.delete(userKey);
        console.log(`🧹 [BATCH] Delayed cleanup for ${userKey}`);
      }
    }, MEDIA_CONFIG.CLEANUP_AFTER);
  }
}

function isInBatchCollection(userKey) {
  const collection = mediaCollectionMap.get(userKey);
  if (!collection) return false;
  // Only block if collection is being processed, not just because it has 2+ files
  return collection.isProcessing;  // ✅ CORRECT
}

function getCollectionCount(userKey) {
  const collection = mediaCollectionMap.get(userKey);
  return collection ? collection.mediaIds.length : 0;
}

function wasMediaCollected(userKey, mediaId) {
  const collection = mediaCollectionMap.get(userKey);
  if (!collection) return false;
  return collection.mediaIds.includes(mediaId);
}

// 🔥 NEW: Export function to check if we should skip node message
export function shouldSkipNodeMessage(userKey) {
  const collection = mediaCollectionMap.get(userKey);
  if (!collection) return false;
  return collection.skipNodeMessage === true && !collection.processed && !collection.isProcessing;
}

// ==================== WEBHOOK HANDLER ====================
router.post("/webhook", async (req, res) => {
  console.log("Webhook Processing Start");

  // SECURITY FIX: Validate webhook signature from Meta
  // This prevents unauthorized parties from sending fake webhook requests
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = process.env.APP_SECRET;

  // Validate APP_SECRET is configured
  if (!appSecret) {
    console.error('❌ CRITICAL: APP_SECRET not configured - cannot validate webhook signature');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Validate signature is present
  if (!signature) {
    console.error('❌ SECURITY: Missing webhook signature in request');
    return res.status(403).json({ error: 'No signature provided' });
  }

  // Validate the signature
  if (!isRequestSignatureValid(req)) {
    console.error('❌ SECURITY: Invalid webhook signature - rejecting request');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  console.log('✅ Webhook signature validated successfully');

  try {
    res.sendStatus(200);

    const business_phone_number_id = req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
    const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    const statuses = req.body.entry?.[0]?.changes[0]?.value?.statuses?.[0];
    const smb = req.body.entry?.[0]?.changes[0]?.value?.message_echoes?.[0];
    const contact = req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0];

    // ==================== EARLY MEDIA BATCH DETECTION ====================
    if (message) {
      const userPhoneNumber = normalizePhone(contact?.wa_id);

      const message_type = message?.type;
      const isMediaMessage = ['image', 'document', 'video'].includes(message_type);
      const mediaId = message?.image?.id || message?.document?.id || message?.video?.id;
      const userKey = `${userPhoneNumber}:${business_phone_number_id}`;
   if (message_type === 'unsupported') {
    console.log(`⚠️ [webhook] Unsupported message type - checking if in active flow`);
    
    // Get session to check if in HelloZestay flow
    const tempSession = await getSession(business_phone_number_id, contact);
    
    // Import the check function
    const { isInHelloZestayFlow } = await import('../mainwebhook/userWebhook.js');
    
    if (isInHelloZestayFlow(userPhoneNumber, business_phone_number_id)) {
      console.log(`🛑 [webhook] In HelloZestay flow - IGNORING unsupported message`);
      const errorMsg = {
          type: "text",
          text: {
            body: "Multiple files detected please wait and then click Done Uploading..."
          }
        };
        
        await sendMessage(
          userPhoneNumber,
          business_phone_number_id,
          errorMsg,
          'EAAVZBobCt7AcBO3Y2khw99wNz6HgSVt2ciXhYy29e33C6LHB1GBokvSbtX2YGKwxdiue22o9x5yo0QyDkUq0QZBUA57fNBeTAq6ZBw7HHcxVXfIrZBgErKEYB90pxkiqPXqrvqIAf0sCClJwQxnZCEFT9Umo7guGs8X5R0xRabOawKb2mTek7lRx2ZCyAyTjQgJ5ZA8LN8rabdz4yibKxHTp8NYrNDKSyAw0AP0nx3Aap5MdmNJjl2nQwZATBvDy',
          'hjiqohe'
        );
      return; // EXIT - Don't process
    }
  }
   if (message_type === 'text') {
        const tempSession = await getSession(business_phone_number_id, contact);
        const { isInHelloZestayFlow } = await import('../mainwebhook/userWebhook.js');
        
        const isInFlow = isInHelloZestayFlow(userPhoneNumber, business_phone_number_id);
        const inputVar = tempSession.inputVariable;
        
        // Only check for hjiqohe tenant in HelloZestay flow expecting document input
        if (tempSession.tenant === 'hjiqohe' && 
            isInFlow && 
            (inputVar === 'document' || inputVar === 'document1')) {
          
          console.log(`❌ [hjiqohe] Text rejected for ${inputVar}. Expected: image/document`);
          
          const errorMessage = {
            type: 'text',
            text: {
              body: '⚠️ Please upload an image or document of your ID.\n\nText messages are not accepted here.'
            }
          };
          
          await sendMessage(
            userPhoneNumber,
            business_phone_number_id,
            errorMessage,
            tempSession.accessToken,
            tempSession.tenant
          );
          
          const timestamp = await getIndianCurrentTime();
          await updateLastSeen("replied", timestamp, userPhoneNumber, business_phone_number_id);
          
          return; // EXIT - Don't pass to userWebhook
        }
      }   
  // CHECK: Is there already a collection in progress?
      if (isInBatchCollection(userKey)) {
        const count = getCollectionCount(userKey);
        console.log(`⏸️ [BATCH] BLOCKING webhook - batch collection in progress (${count} file(s))`);
        
        const timestamp = await getIndianCurrentTime();
        await updateLastSeen("replied", timestamp, userPhoneNumber, business_phone_number_id);
        
        return; // EXIT - Don't pass to userWebhook
      }

      // CHECK: Was this media already processed in a batch?
      if (isMediaMessage && mediaId && wasMediaCollected(userKey, mediaId)) {
        console.log(`✅ [BATCH] Media ${mediaId} already in batch - ignoring duplicate`);
        return; // EXIT
      }

      // MEDIA COLLECTION: Try to collect if it's media
      if (isMediaMessage && mediaId) {
        // Get session to check if we're expecting media input
        const tempSession = await getSession(business_phone_number_id, contact);
        
        // Check if this is a batchable input variable (document/document1)
        const isBatchableVariable = tempSession.tenant ===  'hjiqohe' && 
         tempSession.inputVariable && 
          (tempSession.inputVariable === 'document' || 
           tempSession.inputVariable === 'document1' ||
           tempSession.inputVariable.startsWith('document'));
        
        if (isBatchableVariable) {
          console.log(`📋 [BATCH] Media with batchable inputVariable: "${tempSession.inputVariable}"`);
          
          const collectionResult = collectMedia(userKey, mediaId, message_type, tempSession);
          
          if (collectionResult.collected) {
            console.log(`⏸️ [BATCH] File collected (${collectionResult.count}). BLOCKING webhook to wait for more files...`);
            
            const timestamp = await getIndianCurrentTime();
            await updateLastSeen("replied", timestamp, userPhoneNumber, business_phone_number_id);
            
            // 🔥 KEY FIX: Save background tasks in fire-and-forget mode
            // Promise.allSettled([
            //   saveMessage(
            //     tempSession.userPhoneNumber,
            //     tempSession.business_phone_number_id,
            //     [{ text: `[Document uploaded]`, sender: "user" }],
            //     tempSession.tenant,
            //     timestamp
            //   )
            // ]).catch(err => console.error("[BATCH] Background ops error:", err));
            
            return; // EXIT - Wait for batch OR timeout
          } else if (collectionResult.alreadyProcessed) {
            console.log(`✅ [BATCH] Already processed - webhook redundant`);
            return; // EXIT
          }
        } else {
          console.log(`ℹ️ [BATCH] Media but not a batchable variable (${tempSession.inputVariable}) - processing normally`);
        }
      }

      // Continue to userWebhook if not blocked
      return userWebhook(req);
    }

    // ==================== HANDLE NON-MESSAGE WEBHOOKS ====================
    
    if (smb) {
      const smb_type = smb.type;
      const phoneNumber = smb.to;
      let timestamp = await getIndianCurrentTime();
      let userSession = await getSession(business_phone_number_id, { wa_id: phoneNumber });

      let formattedConversation;
      let messageData = {
        type: smb_type
      };

      if (smb_type == "text") {
        formattedConversation = [{
          text: smb.text.body,
          sender: "bot"
        }];
        messageData.text = smb.text.body;
      }

      saveMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, formattedConversation, userSession.tenant, timestamp);
      io.emit('node-message', {
        message: messageData,
        phone_number_id: business_phone_number_id,
        contactPhone: phoneNumber,
        time: timestamp
      });
    }

    if (statuses) {
      let timestamp = await getIndianCurrentTime();
      const convertedTimestamp = await convertToValidDateFormat(timestamp);
      const status = statuses?.status;
      const id = statuses?.id;
      const userPhone = statuses?.recipient_id;
      const business_phone_number_id = req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;

      const sendTemplateStatusUpdate = async (status, errorCode = null) => {
        try {
          await delay(1000);
          const redisKey = `template_wamid:${id}`;
          const templateName = await getTemplateName(redisKey);
          if (!templateName)
            return;
          await delTemplateName(redisKey);

          let responseData = messageCache.get(business_phone_number_id);
          if (!responseData) {
            const response = await axios.get(`${fastURL}/whatsapp_tenant`, { headers: { 'bpid': business_phone_number_id } });
            responseData = response.data;
            messageCache.set(business_phone_number_id, responseData);
          }
          const tenant_id = responseData.whatsapp_data[0].tenant_id;

          const response = await axios.get(`${djangoURL}/contacts-by-phone/${userPhone}/`, {
            headers: { 'X-Tenant-Id': tenant_id }
          });
          const userName = response.data[0].name || null;

          const templateStatusPayload = {
            template_name: templateName,
            phone_number: userPhone,
            name: userName,
            tenant_id: tenant_id,
            status: status,
            timestamp: convertedTimestamp
          };

          if (status === "failed" && errorCode) {
            templateStatusPayload.error_code = errorCode;
          }

          await axios.post('https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/template_status', templateStatusPayload);
          console.log(`Template status update sent for ${status}:`, templateStatusPayload);

          if (errorCode && errorCode === 131049) {
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const date = tomorrow.toISOString().split('T')[0];
            const time = tomorrow.toTimeString().split(' ')[0].substring(0, 5);
            const scheduledMessagePayload = {
              type: "Template",
              date: date,
              time: time,
              value: {
                template: {
                  name: templateName
                },
                business_phone_number_id: business_phone_number_id,
                phoneNumbers: [userPhone]
              }
            };
            await axios.post(`${fastURL}/scheduled-events/`, scheduledMessagePayload, { headers: { 'X-Tenant-Id': tenant_id } });
            console.log("scheduled");
          }
        } catch (error) {
          console.error('Error sending template status update:', error);
        }
      };

      if (status == "failed") {
        // Convert to ISO 8601 with timezone for Django
        const isoTimestamp = new Date(convertedTimestamp).toISOString();
        axios.post(`${djangoURL}/individual_message_statistics/`, { message_id: id, status, timestamp: isoTimestamp }, { headers: { 'bpid': business_phone_number_id } })
          .catch(err => console.error('Failed to save message statistics:', err.message));
        const error = statuses?.errors[0];
        console.log("Message failed: ", error);
        io.emit('failed-response', error);
        await sendTemplateStatusUpdate(status, error?.code);

        // Save failed status to conversation
        try {
          const userSession = await getSession(business_phone_number_id, { wa_id: userPhone }, true);
          await saveMessage(
            userPhone,
            business_phone_number_id,
            [{ text: `[System: Message failed - ${error?.message || 'Unknown error'}]`, sender: "system" }],
            userSession.tenant,
            timestamp
          );
        } catch (err) {
          console.error('Error saving failed status to conversation:', err.message);
        }

        // Track analytics
        try {
          await trackMessageStatus({
            messageId: id,
            status: 'failed',
            timestamp: new Date(convertedTimestamp),
            errorReason: error?.message || error?.error_data?.details
          });
        } catch (analyticsError) {
          console.error('❌ [Analytics] Failed to track failed status:', analyticsError);
        }
      }
      else if (status == "delivered") {
        // Convert to ISO 8601 with timezone for Django
        const isoTimestamp = new Date(convertedTimestamp).toISOString();
        axios.post(`${djangoURL}/individual_message_statistics/`, { message_id: id, status, timestamp: isoTimestamp }, { headers: { 'bpid': business_phone_number_id } })
          .catch(err => console.error('Failed to save message statistics:', err.message));
        console.log("Delivered: ", userPhone);
        updateLastSeen("delivered", timestamp, userPhone, business_phone_number_id);
        await sendTemplateStatusUpdate(status);

        // Track analytics
        try {
          await trackMessageStatus({
            messageId: id,
            status: 'delivered',
            timestamp: new Date(convertedTimestamp)
          });
        } catch (analyticsError) {
          console.error('❌ [Analytics] Failed to track delivered status:', analyticsError);
        }
      }
      else if (status == "read") {
        // Convert to ISO 8601 with timezone for Django
        const isoTimestamp = new Date(convertedTimestamp).toISOString();
        axios.post(`${djangoURL}/individual_message_statistics/`, { message_id: id, status, timestamp: isoTimestamp }, { headers: { 'bpid': business_phone_number_id } })
          .catch(err => console.error('Failed to save message statistics:', err.message));
        updateLastSeen("seen", timestamp, userPhone, business_phone_number_id);

        // Track analytics
        try {
          await trackMessageStatus({
            messageId: id,
            status: 'read',
            timestamp: new Date(convertedTimestamp)
          });
        } catch (analyticsError) {
          console.error('❌ [Analytics] Failed to track read status:', analyticsError);
        }
      }
      else if (statuses.type == "payment") {
        console.log("recieved payment")
        const userSession = await getSession(business_phone_number_id, { wa_id: statuses.recipient_id });
        const urltest = "https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/order-payment";
        const config = {
          headers: {
            'Authorization': `Bearer ${userSession.accessToken}`,
            'Content-Type': 'application/json'
          }
        };
        const requestBody = {
          status: statuses,
          userSession
        };
        const response = await axios.post(urltest, requestBody, config);
      }

      const activeCampaign = await readData();
      const key = `${business_phone_number_id}_${userPhone}`;
      if (key in activeCampaign) {
        return campaignWebhook(req, res, activeCampaign[key]);
      }
    }
    console.log("Webhook Processing Complete");
  }
  catch (error) {
    console.error("Error in webhook handler:", error);
    // Only send error status if response hasn't been sent yet
    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
});

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  console.log("received req: ", req.body);
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    res.sendStatus(403);
  }
});

export default router;
