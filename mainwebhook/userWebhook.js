import https from 'https';
import axios from "axios";
import { createClient } from 'redis';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { io, userSessions } from "../server.js";
import { getIndianCurrentTime } from '../utils.js';
import { updateStatus, updateLastSeen, saveMessage, sendNotification, executeFallback, getSession, triggerFlowById } from "../helpers/misc.js";
import { findNextNodesFromEdges, findNodeById, extractButtonOptionIndex } from "../helpers/edge-navigation.js";
import { manualWebhook } from "../webhooks/manualWebhook.js";
import { personWebhook } from "../webhooks/personWebhook.js";
import { businessWebhook } from "../webhooks/businessWebhook.js";
import { sendMessage } from "../send-message.js";
import { handleCatalogManagement } from "../drishtee/drishtee.js"
import { checkRRPEligibility, processOrderForDrishtee } from "../drishtee/drishteeservice.js";
import { handleMediaUploads, getImageAndUploadToBlob } from "../helpers/handle-media.js";
import { languageMap } from "../dataStore/dictionary.js";
import { djangoURL, sendNodeMessage } from "./snm.js";
import { normalizePhone } from '../normalize.js';
const redisOptions = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('❌ Redis max retries reached');
        return new Error('Max retries reached');
      }
      const delay = Math.min(retries * 100, 3000);
      console.log(`🔄 Redis reconnecting in ${delay}ms (attempt ${retries})`);
      return delay;
    },
    connectTimeout: 30000,
    keepAlive: 5000,
    noDelay: true
  },
  enableAutoPipelining: true,
  enableOfflineQueue: true
};

const client = createClient(redisOptions);
const mediaClient = createClient(redisOptions);
let isRedisConnected = false; // ✅ CRITICAL FIX

// ✅ Enhanced event handlers for client
client.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
  isRedisConnected = false;
});
client.on('connect', () => {
  console.log('✅ Redis client connected');
  isRedisConnected = true;
});
client.on('reconnecting', () => {
  console.log('🔄 Redis client reconnecting...');
  isRedisConnected = false;
});
client.on('ready', () => {
  console.log('✅ Redis client ready');
  isRedisConnected = true;
});
client.on('end', () => {
  console.log('⚠️ Redis client connection ended');
  isRedisConnected = false;
});
client.on('disconnect', () => {
  console.log('⚠️ Redis client disconnected');
  isRedisConnected = false;
});

// ✅ Complete event handlers for mediaClient
mediaClient.on('error', (err) => console.error('Media Redis Client Error:', err.message));
mediaClient.on('connect', () => console.log('✅ Media Redis client connected'));
mediaClient.on('reconnecting', () => console.log('🔄 Media Redis reconnecting...'));
mediaClient.on('ready', () => console.log('✅ Media Redis ready'));
mediaClient.on('end', () => console.log('⚠️ Media Redis connection ended'));
mediaClient.on('disconnect', () => console.log('⚠️ Media Redis disconnected'));

async function ensureRedisConnection() {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      if (!client.isOpen) {
        console.log(`🔌 Attempting Redis connection (${attempt + 1}/${maxRetries})...`);
        await client.connect();
      }
      if (!mediaClient.isOpen) {
        await mediaClient.connect();
      }
      
      await client.ping();
      await mediaClient.ping();
      
      console.log('✅ Redis connections verified');
      isRedisConnected = true;
      return true;
      
    } catch (err) {
      attempt++;
      console.error(`❌ Redis connection attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxRetries) {
        const delay = Math.min(attempt * 1000, 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('❌ All Redis connection attempts failed');
  isRedisConnected = false;
  return false;
}

// ✅ Keepalive function
async function keepRedisAlive() {
  if (isRedisConnected && client.isOpen && mediaClient.isOpen) {
    try {
      await client.ping();
      await mediaClient.ping();
      console.log('💓 Redis keepalive ping successful');
    } catch (err) {
      console.error('⚠️ Redis keepalive ping failed:', err.message);
      isRedisConnected = false;
      await ensureRedisConnection();
    }
  } else {
    console.log('🔄 Redis not fully connected, attempting reconnection...');
    await ensureRedisConnection();
  }
}

// Call at startup
ensureRedisConnection().catch(console.error);

// ✅ Keepalive every 5 minutes
setInterval(keepRedisAlive, 5 * 60 * 1000);

export const agent = new https.Agent({
  rejectUnauthorized: false,
});



// ==================== HELLOZESTAY OPTIMIZATIONS ====================

const ACTIVE_HELLOZESTAY_FLOWS = new Map();
const HELLOZESTAY_LOCKS = new Map();

export function isInHelloZestayFlow(userPhoneNumber, businessPhoneId) {
  const userKey = `${userPhoneNumber}:${businessPhoneId}`;
  const flowData = ACTIVE_HELLOZESTAY_FLOWS.get(userKey);
  
  if (!flowData) return false;
  
  if (Date.now() - flowData.startTime > 30 * 60 * 1000) {
    ACTIVE_HELLOZESTAY_FLOWS.delete(userKey);
    HELLOZESTAY_LOCKS.delete(userKey);
    return false;
  }
  
  return true;
}

function markHelloZestayActive(userPhoneNumber, businessPhoneId, guestId) {
  const userKey = `${userPhoneNumber}:${businessPhoneId}`;
  ACTIVE_HELLOZESTAY_FLOWS.set(userKey, {
    startTime: Date.now(),
    guestId: guestId
  });
  console.log(`✅ HelloZestay flow marked active for ${userKey} with guestId: ${guestId}`);
}

function clearHelloZestayFlow(userPhoneNumber, businessPhoneId) {
  const userKey = `${userPhoneNumber}:${businessPhoneId}`;
  ACTIVE_HELLOZESTAY_FLOWS.delete(userKey);
  HELLOZESTAY_LOCKS.delete(userKey);
  console.log(`🗑️ HelloZestay flow cleared for ${userKey}`);
}

function acquireHelloZestayLock(userPhoneNumber, businessPhoneId) {
  const userKey = `${userPhoneNumber}:${businessPhoneId}`;
  
  if (HELLOZESTAY_LOCKS.get(userKey)) {
    console.log(`🔒 HelloZestay already processing for ${userKey}`);
    return false;
  }
  
  HELLOZESTAY_LOCKS.set(userKey, Date.now());
  return true;
}

function releaseHelloZestayLock(userPhoneNumber, businessPhoneId) {
  const userKey = `${userPhoneNumber}:${businessPhoneId}`;
  HELLOZESTAY_LOCKS.delete(userKey);
}
// Add this after the imports and before the Redis client setup
async function fetchResortFromAPI(guestId, tenant) {
    await ensureRedisConnection(); // Add this
  

  try {
    console.log(`🔍 Fetching resort from API for guest: ${guestId}`);
    const response = await axios.get(
      'https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/resort',
      {
        params: { tenantId: guestId },
        timeout: 5000
      }
    );
    
    if (response.data && response.data.resortName) {
      console.log(`✅ API returned resort: ${response.data.resortName}`);
      
      // Cache it in Redis for future use
      client.setEx(`guest:${guestId}:resort`, 3600, response.data.resortName)
        .catch(err => console.error('Redis cache error:', err));
      
      return response.data.resortName;
    }
    
    console.warn(`⚠️ API returned empty data for ${guestId}`);
    return null;
  } catch (error) {
    console.error(`❌ API fetch failed for ${guestId}:`, error.message);
    return null;
  }
}
// ULTRA-FAST: No welcome message, no delays, just trigger flow + fire webhook
// ULTRA-FAST: No welcome message, no delays, just trigger flow + fire webhook
async function handleHelloZestayFlowOptimized(userSession, normalizedGuestId, resortName) {
  const startTime = Date.now();
  
  try {
    console.log(`⚡ [START] t=0ms - Guest: ${normalizedGuestId}`);
    
    // If Redis didn't have it, try the API
    if (!resortName) {
      console.log(`⚠️ [t=${Date.now() - startTime}ms] Redis empty, trying API...`);
      resortName = await fetchResortFromAPI(normalizedGuestId, userSession.tenant);
    }
    
    // If still not found, send error and exit
    if (!resortName) {
      console.warn(`❌ [t=${Date.now() - startTime}ms] Guest not found in Redis OR API: ${normalizedGuestId}`);
      const errorMessage = {
        type: "text",
        text: { body: `⚠️ Guest ID "${normalizedGuestId}" not found. Please check your Property ID and try again.` }
      };
      await sendMessage(
        userSession.userPhoneNumber,
        userSession.business_phone_number_id,
        errorMessage,
        userSession.accessToken,
        userSession.tenant
      );
      return { success: false };
    }
    
    console.log(`✅ [t=${Date.now() - startTime}ms] Resort: ${resortName}`);
    
    // Send greeting + trigger flow in parallel
    const greetingText = `Hi *${userSession.userName || 'there'}*\nYou have arrived at *${resortName}*`;
    console.log(`📤 [t=${Date.now() - startTime}ms] Sending greeting + triggering flow`);
    
    const [greetingSent, flowDone] = await Promise.all([
      sendMessage(
        userSession.userPhoneNumber,
        userSession.business_phone_number_id,
        { type: "text", text: { body: greetingText } },
        userSession.accessToken,
        userSession.tenant
      ),
      triggerFlowById(userSession, "209")
    ]);
    
    console.log(`✅ [t=${Date.now() - startTime}ms] Both greeting and flow complete`);
    
    // Webhook (background)
    axios.post(
      'https://backeng4whatsapp-dxbmgpakhzf9bped.centralindia-01.azurewebsites.net/add-dynamic-data/',
      {
        flow_name: "zestayreceptionmain",
        input_variable: "propertyid",
        value: normalizedGuestId,
        phone: userSession.userPhoneNumber
      },
      { headers: { 'X-Tenant-Id': 'hjiqohe' }, timeout: 5000 }
    ).catch(err => console.error('Webhook error:', err.message));
    
    return { success: true };
    
  } catch (error) {
    console.error(`❌ [t=${Date.now() - startTime}ms]:`, error);
    return { success: false };
  }
}


export async function userWebhook(req) {
   await ensureRedisConnection().catch(err => {
    console.error('⚠️ Redis connection issue, continuing without Redis:', err.message);
  });
  const business_phone_number_id = req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
  const contact = req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0];
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const userPhoneNumber = normalizePhone(contact?.wa_id);
  const userName = contact?.profile?.name || null;
  const products = message?.order?.product_items;

  const message_type = message?.type;
  const message_text = message?.text?.body ||
    (message?.interactive ? (message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title) : null) ||
    message?.button?.text ||
    message?.audio?.id ||
    message?.document?.id ||
    message?.image?.id ||
    message?.video?.id ||
    message?.reaction?.emoji ||
    message?.sticker?.id ||
    JSON.stringify(message?.location);

  let timestamp = await getIndianCurrentTime();

  const repliedTo = message?.context?.id || null;
  if (repliedTo !== null) updateStatus("replied", repliedTo, null, null, null, null, timestamp);

  // ⚡ OPTIMIZATION: Early HelloZestay detection for parallel warmup
  const triggerText = message?.text?.body || 
    message?.interactive?.button_reply?.title || 
    message?.interactive?.list_reply?.title || 
    message?.button?.text;
  
  const isHelloZestayTrigger = triggerText?.toLowerCase().startsWith('hellozestay');
  
  // Extract guest ID early
  let normalizedGuestId = null;
  if (isHelloZestayTrigger) {
    const parts = triggerText.trim().split(" ");
    const guestId = parts.length > 1 ? parts[1] : null;
    normalizedGuestId = guestId?.toUpperCase();
  }
  
  // ⚡ Parallel warmup: Start session + Redis lookup simultaneously
  let userSession;
  let resortNamePromise = null;
  
if (isHelloZestayTrigger && normalizedGuestId) {
  console.log(`⚡ [WARMUP] Parallel fetch starting for HelloZestay ${normalizedGuestId}`);
  
  const sessionPromise = getSession(business_phone_number_id, contact);
  
  // Try Redis first, with API fallback built into the promise chain
  resortNamePromise = client.get(`guest:${normalizedGuestId}:resort`)
    .then(redisResult => {
      if (redisResult) {
        console.log(`✅ Redis hit: ${redisResult}`);
        return redisResult;
      }
      console.log(`⚠️ Redis miss, will try API later`);
      return null; // Will be checked in handleHelloZestayFlowOptimized
    })
    .catch(err => {
      console.error('⚠️ Redis warmup error:', err.message);
      return null; // Will trigger API fallback
    });
  
  userSession = await sessionPromise;
  console.log(`⚡ [WARMUP] Session ready`);
} else {
  userSession = await getSession(business_phone_number_id, contact);
}
  
  // Now check if it's actually hjiqohe tenant
  const isHjiqoheTenant = userSession.tenant === 'hjiqohe';
  const isValidHelloZestay = isHelloZestayTrigger && isHjiqoheTenant;
  
  let inActiveHelloZestayFlow = isHjiqoheTenant && 
                                 isInHelloZestayFlow(userPhoneNumber, business_phone_number_id);
  
  // Allow HelloZestay restart
  if (isValidHelloZestay && inActiveHelloZestayFlow) {
    console.log(`🔄 [hjiqohe] HelloZestay restart requested for ${userPhoneNumber}`);
    clearHelloZestayFlow(userPhoneNumber, business_phone_number_id);
    inActiveHelloZestayFlow = false;
  }
  
  // Block /language during active HelloZestay flow
  if (message_text === '/language' && inActiveHelloZestayFlow) {
    console.log(`⚠️ [hjiqohe] Language change blocked during HelloZestay flow`);
    
    const messageData = {
      type: 'text',
      text: {
        body: '⚠️ Cannot change language during check-in. Please complete your current process first.'
      }
    };
    
    await sendMessage(
      userPhoneNumber, 
      business_phone_number_id, 
      messageData, 
      userSession.accessToken, 
      userSession.tenant
    );
    
    return;
  }
  


// Only apply processing lock for hjiqohe tenant
if (userSession.tenant === 'hjiqohe' && userSession.isProcessing) {
  console.log(`🔄 [hjiqohe] Message from ${userSession.userPhoneNumber} is already being processed, skipping...`);
  return;
}

// Set processing lock only for hjiqohe
if (userSession.tenant === 'hjiqohe') {
  userSession.isProcessing = true;
}

const sessionKey = userSession.userPhoneNumber + userSession.business_phone_number_id;
userSessions.set(sessionKey, userSession);
  try {
    // ==================== HELLOZESTAY ULTRA-FAST PATH ====================
    
    if (isValidHelloZestay && !inActiveHelloZestayFlow) {
      console.log("⚡⚡⚡ [hjiqohe] ULTRA-FAST PATH: HelloZestay executing");
      
      if (!acquireHelloZestayLock(userPhoneNumber, business_phone_number_id)) {
        console.log("⚠️ [hjiqohe] HelloZestay lock already held, skipping");
        return;
      }
      
      if (!normalizedGuestId) {
        console.log("❌ [hjiqohe] No guest ID provided");
        
        const errorMsg = {
          type: "text",
          text: {
            body: "⚠️ Please provide your Property ID.\n\nFormat: HelloZestay [YOUR_ID]"
          }
        };
        
        await sendMessage(
          userPhoneNumber, 
          business_phone_number_id, 
          errorMsg, 
          userSession.accessToken, 
          userSession.tenant
        );
        
        releaseHelloZestayLock(userPhoneNumber, business_phone_number_id);
        return;
      }
      
      userSession.guestId = normalizedGuestId;
      console.log(`⚡ [hjiqohe] Guest ID: ${normalizedGuestId}`);
      
      markHelloZestayActive(userPhoneNumber, business_phone_number_id, normalizedGuestId);
      
      // Get pre-fetched resort name
      const resortName = resortNamePromise ? await resortNamePromise : null;
      console.log(`⚡ [WARMUP] Redis result: ${resortName}`);
      
      // Fire ALL non-critical operations in background
      Promise.allSettled([
        saveMessage(
          userSession.userPhoneNumber, 
          userSession.business_phone_number_id, 
          [{ text: message_text, sender: "user" }], 
          userSession.tenant, 
          timestamp
        ),
        ioEmissions(message, userSession, timestamp),
        updateLastSeen("replied", timestamp, userSession.userPhoneNumber, userSession.business_phone_number_id),
        sendReadAndTypingIndicator(message.id, business_phone_number_id, userSession.accessToken)
      ]).catch(err => console.error("[hjiqohe] Background ops error:", err));
      
      // Call optimized handler with pre-fetched data
      try {
        const result = await handleHelloZestayFlowOptimized(userSession, normalizedGuestId, resortName);
        
        if (result.success) {
          console.log(`✅✅✅ [hjiqohe] HelloZestay completed`);
        }
        
        releaseHelloZestayLock(userPhoneNumber, business_phone_number_id);
        return;
        
      } catch (error) {
        console.error(`❌ [hjiqohe] Fast path error:`, error.message);
        clearHelloZestayFlow(userPhoneNumber, business_phone_number_id);
        releaseHelloZestayLock(userPhoneNumber, business_phone_number_id);
      }
    }
    
    // ==================== END HELLOZESTAY ULTRA-FAST PATH ====================

    
    let formattedConversation;
    if (message_type == "text" || message_type == "interactive" || message_type == "button") {
      formattedConversation = [{
        text: message_text,
        sender: "user"
      }];
    }
    else if (message_type == "reaction") {
      const emoji = message?.reaction?.emoji;
      const messageId = message?.reaction?.message_id;
      formattedConversation = [{
        text: `Reacted ${emoji} to message`,
        sender: "user"
      }];
    }
    else if (message_type == "sticker") {
      formattedConversation = [{
        text: "[Sticker]",
        sender: "user"
      }];
    }
    else if (message_type == "image") {
      const caption = message?.image?.caption || "";
      formattedConversation = [{
        text: caption ? `[Image: ${caption}]` : "[Image]",
        sender: "user"
      }];
    }
    else if (message_type == "video") {
      const caption = message?.video?.caption || "";
      formattedConversation = [{
        text: caption ? `[Video: ${caption}]` : "[Video]",
        sender: "user"
      }];
    }
    else if (message_type == "document") {
      const filename = message?.document?.filename || "document";
      formattedConversation = [{
        text: `[Document: ${filename}]`,
        sender: "user"
      }];
    }
    else if (message_type == "audio") {
      formattedConversation = [{
        text: "[Voice message]",
        sender: "user"
      }];
    }
    else if (message_type == "location") {
      formattedConversation = [{
        text: "[Location shared]",
        sender: "user"
      }];
    }
    else if (message_type == "contacts") {
      formattedConversation = [{
        text: "[Contact shared]",
        sender: "user"
      }];
    }

    if (!isValidHelloZestay) {
      saveMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, formattedConversation, userSession.tenant, timestamp);
    }

    const notif_body = { content: `${userSession.userPhoneNumber} | New meessage from ${userSession.userName || userSession.userPhoneNumber}: ${message_text}`, created_on: timestamp };
    sendNotification(notif_body, userSession.tenant);

    if (!isValidHelloZestay) {
      ioEmissions(message, userSession, timestamp);
      updateLastSeen("replied", timestamp, userSession.userPhoneNumber, userSession.business_phone_number_id);
    }

    if (userSession.type == "nothing") {
      return;
    }

    if (!isValidHelloZestay) {
      await sendReadAndTypingIndicator(message.id, business_phone_number_id, userSession.accessToken);
    }

    const agents = userSession.agents;
    if (agents) {
      const isBusiness = agents.includes(userPhoneNumber);
      if (isBusiness) return businessWebhook(req);
    }

    if (userSession.type == "one2one") {
      return manualWebhook(req, userSession);
    }
    else if (userSession.type == 'person') {
      return personWebhook(req, userSession);
    }

    if (message_text == "/human") {
      userSession.type = "one2one";
      const key = userPhoneNumber + business_phone_number_id;
      userSessions.set(key, userSession);
      return sendWelcomeMessage(userSession);
    }
    else if (message_text == '/person') {
      userSession.type = 'person';
      return personWebhook(req, userSession);
    }
    else if (message_text == '/language') {
      if (!userSession.doorbell) return;
      
      const key = String(userPhoneNumber) + String(business_phone_number_id);
      userSessions.delete(key);
      userSession = await getSession(business_phone_number_id, contact);
      return sendLanguageSelectionMessage(userSession.doorbell, userSession.accessToken, userSession.userPhoneNumber, userSession.business_phone_number_id, userSession.tenant);
    }

    // Regular trigger handling (skip if handled in fast path)
    if (triggerText && !isValidHelloZestay) {
      const messageText = triggerText.trim().toLowerCase();
      const prefixEnabledTriggers = ["checkin", "hellozestay", "/review"];

      for (const triggerKey in userSession.triggers) {
        const isPrefixMatch = prefixEnabledTriggers.includes(triggerKey.toLowerCase()) &&
                              messageText.startsWith(triggerKey.toLowerCase());
        const isExactMatch = messageText === triggerKey.toLowerCase();

        if (isPrefixMatch || isExactMatch) {
          try {
            console.log("Trigger found:", triggerKey, "from message type:", message_type);
            const id = userSession.triggers[triggerKey];

            if (isPrefixMatch && message?.text?.body) {
              const parts = messageText.split(" ");
              if (parts.length > 1) {
                userSession.guestId = parts[1];
              }
            }

            await triggerFlowById(userSession, id);
            return;
          } catch (error) {
            console.log("Error in triggering flow:", error.response?.data || error.message);
          }
        }
      }
    }

    if (userSession.tenant == 'leqcjsk') {
      if (userSession?.isRRPEligible == undefined) userSession = await checkRRPEligibility(userSession);
      if (userSession?.isRRPEligible && message_type == "order") return processOrderForDrishtee(userSession, products);
      else if (!userSession?.isRRPEligible) {
        const messageData = {
          type: 'text',
          text: {
            body: 'Sorry, our services are not available in your area. Please join our RRP network to avail these services.'
          }
        };
        return sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
      }
    }

    if (userSession?.flowData && userSession?.flowData.length == 0) return;

    if (userSession.multilingual && !['order', 'location'].includes(message_type)) {
      if (message_type === "text" || message_type == "interactive") {
        const doorbell = userSession.doorbell;
        const language_data = doorbell?.languages;

        const languageKeys = Object.keys(language_data);
        const languageValues = Object.values(language_data);

        if (languageKeys.includes(message_text) || languageValues.includes(message_text)) {
          let lang_code;
          if (languageKeys.includes(message_text)) {
            const language = language_data[message_text];
            lang_code = languageMap[language];
          } else {
            lang_code = languageMap[message_text];
          }

          const flowData = userSession.flowData;
          userSession.language = lang_code;

          const selectedFlowData = flowData.find(data => data.language === lang_code);
          userSession.flowData = selectedFlowData?.flow_data;

          userSession.multilingual = false;
          userSession.fallback_msg = selectedFlowData?.fallback_message;

          sendNodeMessage(userPhoneNumber, business_phone_number_id);
        }
        else {
          sendLanguageSelectionMessage(doorbell, userSession.accessToken, userSession.userPhoneNumber, userSession.business_phone_number_id, userSession.tenant);
        }
      }
      return;
    }

    if (userSession.AIMode) {
      if (message_type == "interactive") {
        let userSelectionID = message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id;
        if (userSelectionID == "Exit AI") {
          userSession.AIMode = false;
          userSession.nextNode = userSession.adjList[userSession.currNode];
          userSession.currNode = userSession.nextNode[0];
          sendNodeMessage(userPhoneNumber, business_phone_number_id);
        }
        else if (userSelectionID.startsWith("Hop")) {
          const node = Number(userSelectionID.split(":")[1]);
          userSession.AIMode = false;
          userSession.currNode = node;
          userSession.nextNode = userSession.adjList[userSession.currNode];
          sendNodeMessage(userSession.userPhoneNumber, userSession.business_phone_number_id);
        }
      }
      else if (message_type == "text") {
        const query = message.text.body;
        handleQuery(query, userSession);
      }
      else if (message_type == "audio") {
        try {
          const mediaID = message.audio.id;
          const response = await axios.post("https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/voice", { mediaID: mediaID, userSession: userSession });
          const query = response.data;
          handleQuery(query, userSession);
        } catch (error) {
          console.log("error handling audio query:", error.response?.data || error.message);
        }
      }
      else if (message_type == "image" || message_type == "document" || message_type == "video") {
        const mediaID = message?.image?.id || message?.document?.id || message?.video?.id;
        const doc_name = userSession.inputVariable;
        try {
          await handleMediaUploads(userName, userPhoneNumber, doc_name, mediaID, userSession, userSession.tenant);
        } catch (error) {
          console.error("Error retrieving media content:", error);
        }
      }
      return;
    }

    handleInput(userSession, message_text);
    
    if (message_type === "interactive") {
      if (message.interactive.type === "nfm_reply") {
        let nfm_response = message.interactive.nfm_reply.response_json;
        const responseJson = JSON.parse(nfm_response);
        console.log("Flow response: ", responseJson);
        const flowName = responseJson.flow_name || "Unknown_Flow";
        const sheetName = flowName;
        const spreadsheet_id = "1QBhLjiD8MCflufTNE0K51qsLtMyI0lyQIoM7Pg9aBYU";
        const auth = new GoogleAuth({
          credentials: JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')),
          scopes: 'https://www.googleapis.com/auth/spreadsheets',
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const timestamp = await getIndianCurrentTime();
        let rowData = [userSession.tenant, userSession.userPhoneNumber, timestamp];
        Object.keys(responseJson).forEach(key => {
          if (key !== 'flow_name') {
            rowData.push(responseJson[key] || '');
          }
        });
        try {
          await axios.post(
            "https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/nfm",
            {
              tenant: userSession.tenant,
              phone: userSession.userPhoneNumber,
              timestamp: timestamp,
              flow_name: flowName,
              data: responseJson
            }
          );
          console.log("NFM JSON sent to external webhook successfully.");
        } catch (err) {
          console.error("Failed to send NFM JSON to external webhook:", err.message);
        }
        try {
          const response = await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheet_id,
            range: `${sheetName}!A:Z`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: {
              values: [rowData]
            }
          });
          console.log(`${response.data.updates.updatedCells} cells appended.`);
        } catch (error) {
          console.error('Error appending data to sheet:', error);
        }
        userSession.currNode = userSession.nextNode[0];
        userSession.nextNode = userSession.adjList[userSession.currNode];
        sendNodeMessage(userPhoneNumber, business_phone_number_id);
        return;
      }
      else {
        let userSelectionID = message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id;

        if (userSelectionID === "restart_flow") {
          console.log(`🔄 Restart button clicked for ${userSession.userPhoneNumber}`);

          // Re-activate HelloZestay flow if this is hjiqohe tenant and guestId exists
          if (userSession.tenant === 'hjiqohe' && userSession.guestId) {
            markHelloZestayActive(userPhoneNumber, business_phone_number_id, userSession.guestId);
            console.log(`✅ HelloZestay flow re-activated for ${userPhoneNumber}`);
          }

          userSession.currNode = userSession.flowVersion === 2 ? userSession.startNodeId : userSession.startNode;

          if (userSession.flowVersion === 2) {
            userSession.nextNode = findNextNodesFromEdges(userSession.edges, userSession.currNode);
          } else {
            userSession.nextNode = userSession.adjList[userSession.startNode];
          }

          userSession.inputVariable = null;
          const sessionKey = userSession.userPhoneNumber + userSession.business_phone_number_id;
          userSessions.set(sessionKey, userSession);
          sendNodeMessage(userPhoneNumber, business_phone_number_id);
          return;
        }

        if (typeof userSelectionID == "string" && userSelectionID.split('_')[0] == 'drishtee') {
          handleCatalogManagement(userSelectionID, userSession);
        }

        // DUAL MODE NAVIGATION
        if (userSession.flowVersion === 2) {
          // NEW MODE: Edge-based navigation
          console.log("Using edge-based navigation (v2)");

          const sourceHandle = extractButtonOptionIndex(
            userSelectionID,
            userSession.nodes,
            userSession.edges,
            userSession.currNode
          );

          const nextNodes = findNextNodesFromEdges(
            userSession.edges,
            userSession.currNode,
            sourceHandle
          );

          if (nextNodes.length > 0) {
            // SINGLE ADVANCE (FIX: no double-advance)
            userSession.currNode = nextNodes[0];
            userSession.nextNode = findNextNodesFromEdges(userSession.edges, userSession.currNode);
            console.log(`Advanced to node: ${userSession.currNode}`);
          } else {
            console.warn(`No matching edge found for selection ${userSelectionID}`);
            await executeFallback(userSession);
            return;
          }

        } else {
          // LEGACY MODE: Adjacency list navigation (WITH FIX)
          console.log("Using adjacency list navigation (legacy)");

          let found = false;

          // First: check in nextNode array
          for (let i = 0; i < userSession.nextNode.length; i++) {
            if (userSession.flowData[userSession.nextNode[i]].id == userSelectionID) {
              // FIX: Single advance only
              userSession.currNode = userSession.nextNode[i];
              userSession.nextNode = userSession.adjList[userSession.currNode];
              // REMOVED: userSession.currNode = userSession.nextNode[0];  <-- DOUBLE-ADVANCE BUG FIXED
              found = true;
              console.log(`Found in nextNode array, advanced to: ${userSession.currNode}`);
              break;
            }
          }

          // Second: global search in flowData
          if (!found) {
            for (let i = 0; i < userSession.flowData.length; i++) {
              if (userSession.flowData[i].id == userSelectionID) {
                // FIX: Single advance only
                userSession.currNode = i;
                userSession.nextNode = userSession.adjList[userSession.currNode];
                // REMOVED: userSession.currNode = userSession.nextNode[0];  <-- DOUBLE-ADVANCE BUG FIXED

                // Handle input variable from parent
                for (let j = 0; j < userSession.flowData.length; j++) {
                  if (userSession.adjList[j].includes(i)) {
                    var variable = userSession.flowData[j].variable;
                    if (variable) {
                      userSession.inputVariable = variable;
                      handleInput(userSession, message_text);
                    }
                  }
                }
                console.log(`Found in global search, advanced to: ${userSession.currNode}`);
                break;
              }
            }
          }
        }
      }
    }
    else if (message_type === "text" || message_type == "image") {
      if (userSession.flowVersion === 2) {
        // NEW MODE
        const currNodeObj = findNodeById(userSession.nodes, userSession.currNode);
        const nodeType = currNodeObj?.type;

        const startNode = userSession.startNodeId || userSession.startNode;
        if (userSession.currNode != startNode) {
          console.log("Node Type: ", nodeType);

          if (['sendMessage', 'ai', 'api', 'template', 'customint', 'flowjson'].includes(nodeType)) {
            // Auto-advance for message nodes
            const nextNodes = findNextNodesFromEdges(userSession.edges, userSession.currNode);
            if (nextNodes.length > 0) {
              userSession.currNode = nextNodes[0];
            }
          }
          else if (['askQuestion'].includes(nodeType)) {
            // Check if expecting text input
            const data = currNodeObj?.data || {};
            if (data.optionType === 'Text') {
              // Text input - advance
              const nextNodes = findNextNodesFromEdges(userSession.edges, userSession.currNode);
              if (nextNodes.length > 0) {
                userSession.currNode = nextNodes[0];
              }
            } else {
              // Button/List - should use interactive, fallback
              await executeFallback(userSession);
              return;
            }
          }
        }
      } else {
        // LEGACY MODE
        const flow = userSession.flowData;
        const type = flow[userSession.currNode]?.type;

        if (userSession.currNode != userSession.startNode) {
          console.log("Type: ", type);
          if (['Text', 'string', 'audio', 'video', 'location', 'image', 'AI', 'product'].includes(type)) {
            userSession.currNode = userSession.nextNode[0];
          }
          else if (['Button', 'List'].includes(type)) {
            await executeFallback(userSession);
            return;
          }
        }
      }
    }
    else if (message_type == "audio") {
      userSession.currNode = userSession.nextNode[0];
    }
    else if (message_type == "document") {
      userSession.currNode = userSession.nextNode[0];
    }
   else if (message_type == "order") {
      console.log("xyz");
      let urltest = "https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/customNode";
      if (userSession.tenant == 'ecdayvn')
        urltest = "https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/order-payment";
      try {
        const config = {
          headers: {
            'Authorization': `Bearer ${userSession.accessToken}`,
            'Content-Type': 'application/json'
          }
        };
        const requestBody = {
          message,
          userSession
        };
        await axios.post(urltest, requestBody, config);
      } catch (err) {
        console.log("error in order", err.message);
      }
      return;
    }
    else if (message_type == "location") {
      if (userSession.tenant == 'ecdayvn') {
        const url = "https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/order-payment";
        try {
          const config = {
            headers: {
              'Authorization': `Bearer ${userSession.accessToken}`,
              'Content-Type': 'application/json'
            }
          };
          const requestBody = {
            message,
            userSession
          };
          await axios.post(url, requestBody, config);
        } catch (err) {
          console.log("error in location", err.message);
        }
        return;
      } else if (userSession.tenant !== 'ecdayvn') {
        const url = "https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/a0d463e0-ed45-4642-bb11-da3c132a533b";
        try {
          const config = {
            headers: {
              'Authorization': `Bearer ${userSession.accessToken}`,
              'Content-Type': 'application/json'
            }
          };
          const requestBody = {
            message,
            userSession
          };
          await axios.post(url, requestBody, config);
        } catch (err) {
          console.log("error in location for other tenants", err.message);
        }
        return;
      }
      userSession.currNode = userSession.nextNode[0];
    }
    else if (message_type == "reaction") {
      // Reactions are already saved to conversation, no flow progression needed
      console.log(`Reaction ${message?.reaction?.emoji} saved to conversation`);
      return;
    }
    else if (message_type == "sticker") {
      // Stickers are already saved to conversation, no flow progression needed
      console.log("Sticker saved to conversation");
      return;
    }
    else if (message_type == "contacts") {
      // Contact shares are already saved to conversation
      console.log("Contact shared saved to conversation");
      return;
    }

    sendNodeMessage(userPhoneNumber, business_phone_number_id);
    console.log("Webhook processing completed successfully");
  } finally {
  // Only release lock if it was set for hjiqohe
  if (userSession.tenant === 'hjiqohe') {
    userSession.isProcessing = false;
  }
  userSessions.set(sessionKey, userSession);
}
}
function assignAgent(agentList) {
  for (let agent of agentList) {
    if (agent in nurenConsumerMap) continue
    else return agent
  }
  return agentList[0]
}

async function sendReadAndTypingIndicator(message_id, business_phone_number_id, access_token) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${business_phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: message_id,
        typing_indicator: { type: "text" }
      },
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
  } catch (error) {
    console.error("Error sending read receipt and typing indicator:", error?.response?.data || error.message);
  }
}

async function sendWelcomeMessage(userSession) {
  const waitingMessageForConsumer = "Hang tight! We're connecting you with an agent. It won't take long. ⏳"
  sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, { type: "text", text: { body: waitingMessageForConsumer } }, userSession.accessToken, userSession.tenant)

  const welcomeMessageForRetailer = `${userSession.userName} wants to chat with you! Press the button to start the conversation. 🚀`
  const buttonMessageBody = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: welcomeMessageForRetailer },
      action: { buttons: [{ type: "reply", reply: { id: `chatwith_${userSession.userPhoneNumber}`, title: "Start Talking" } }] }
    }
  }
  const agents = userSession.agents
  agents.forEach(agent => {
    sendMessage(agent, userSession.business_phone_number_id, buttonMessageBody, userSession.accessToken, userSession.tenant)
  })
}

async function handleQuery(query, userSession) {
  try {
    const nodes = userSession.hop_nodes;
    const language = Object.keys(languageMap).find(key => languageMap[key] === userSession.language) || "English";
    const prompt = userSession.AIModePrompt || "You are a helpful assistant. Reply to the point. Dont include any apologies or explanations in your replies. IMPORTANT: Your entire response must be 1000 characters or less due to WhatsApp message limitations."
    const userPhoneNumber = userSession.userPhoneNumber;
    const data = { query: query, nodes: nodes, language: language, prompt: prompt, phone: userPhoneNumber };
    const headers = { 'X-Tenant-Id': userSession.tenant };
    const response = await axios.post(`${djangoURL}/query-faiss/`, data, { headers: headers });
    console.log("openai response:", response.data);

    const nodeId = response.data.id;
    const messageText = response.data.message;
    const fixedMessageText = messageText.replace(/"/g, "'");
    const messageData = {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: fixedMessageText },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: "Exit AI",
                title: "Exit"
              }
            }
          ]
        }
      }
    }
    await sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, messageData, userSession.accessToken, userSession.tenant)

    if (nodeId != -1) {
      const index = nodes.findIndex(obj => obj.id == nodeId)
      const action = nodes[index].action;
      const messageData = {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: `Do you want to explore ${action} further?` },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: {
                  id: `Hop:${nodeId}`,
                  title: "Yes"
                }
              }
            ]
          }
        }
      }
      sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, messageData, userSession.accessToken, userSession.tenant)
    }
  } catch (error) {
    console.log("Error in openai response:", error.response?.data || error.message);
  }
}

async function sendLanguageSelectionMessage(doorbell, access_token, phoneNumber, business_phone_number_id, tenant_id) {
  let messageData = {}
  if (doorbell.type === "button") {
    let button_rows = Object.entries(doorbell.languages).map(([key, value]) => ({
      type: 'reply',
      reply: {
        id: key,
        title: value
      }
    }));
    messageData = {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: doorbell.message },
        action: { buttons: button_rows }
      }
    };
  }
  else if (doorbell.type === "list") {
    let list_rows = Object.entries(doorbell.languages).map(([key, value]) => ({
      id: key,
      title: value
    }));
    messageData = {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: doorbell.message },
        action: {
          button: "Choose Language",
          sections: [{ title: "Section Title", rows: list_rows }]
        }
      }
    };
  }
  else {
    messageData = {
      type: "text",
      text: {
        body: doorbell.message
      }
    };
  }
  return sendMessage(phoneNumber, business_phone_number_id, messageData, access_token, tenant_id);
}

async function handleInput(userSession, value) {
  console.log("handleInput called with value:", value);

  try {
    if (
      userSession.inputVariable !== undefined &&
      userSession.inputVariable !== null &&
      userSession.inputVariable.length > 0
    ) {
      console.log("Valid inputVariable detected:", userSession.inputVariable);

      const input_variable = userSession.inputVariable;
      const phone = userSession.userPhoneNumber;
      const flow_name = userSession.flowName;

      console.log("Extracted user session details:", { input_variable, phone, flow_name });

      userSession.api.POST[input_variable] = value;
      console.log(`Stored value in userSession.api.POST[${input_variable}] = ${value}`);

      userSession.inputVariable = null;
      console.log("Cleared inputVariable after storing value");

      const payload = { flow_name, input_variable, value, phone };
      console.log("Constructed payload:", payload);

      try {
        console.log("Sending data to API:", `${djangoURL}/add-dynamic-data/`);
        const response = await axios.post(`${djangoURL}/add-dynamic-data/`, payload, {
          headers: { 'X-Tenant-Id': userSession.tenant }
        });

        console.log("Data sent successfully! Response:", response.data);
      } catch (error) {
        console.error("Error while sending data in handleInput:", error.response?.data || error.message);
      }
    } else {
      console.log("No valid inputVariable found, skipping API call.");
    }
  } catch (error) {
    console.error("Unexpected error in handleInput:", error);
  }

  console.log("Returning updated userSession:");
  return userSession;
}

export async function ioEmissions(message, userSession, timestamp) {
  const message_text = message?.text?.body || (message?.interactive ? (message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title) : null)
  const temp_user = message?.text?.body?.startsWith('*/') ? message.text.body.split('*/')[1]?.split(' ')[0] : null;
  if (temp_user) {
    io.emit('temp-user', {
      temp_user: temp_user,
      phone_number_id: userSession.business_phone_number_id,
      contactPhone: userSession.userPhoneNumber,
      time: timestamp
    });
  }

  io.emit('new-message', {
    message: { type: "text", text: { body: message_text } },
    phone_number_id: userSession.business_phone_number_id,
    contactPhone: userSession.userPhoneNumber,
    name: userSession.userName,
    time: timestamp
  });
}
export { clearHelloZestayFlow, markHelloZestayActive };
