/**
 * WhatsApp Webhook Simulator
 *
 * This utility mimics Facebook/WhatsApp webhook calls to test your bot locally
 * without needing to deploy to production.
 *
 * Usage:
 *   node testing/webhookSimulator.js
 *
 * Or import functions in your test scripts:
 *   import { simulateTextMessage, simulateButtonReply } from './testing/webhookSimulator.js';
 */

import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Configuration - adjust these for your testing environment
const CONFIG = {
  webhookUrl: process.env.SIMULATOR_WEBHOOK_URL || 'http://localhost:8080/webhook',
  appSecret: process.env.APP_SECRET || 'your_app_secret',
  defaultPhoneNumberId: process.env.SIMULATOR_PHONE_NUMBER_ID || '123456789012345',
  defaultUserPhone: process.env.SIMULATOR_USER_PHONE || '919876543210',
  defaultUserName: process.env.SIMULATOR_USER_NAME || 'Test User',
};

// ============================================================================
// PAYLOAD BUILDERS
// ============================================================================

/**
 * Generate a unique message ID (mimics WhatsApp message IDs)
 */
function generateMessageId() {
  return `wamid.${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

/**
 * Generate a unique media ID
 */
function generateMediaId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Get current timestamp in seconds
 */
function getTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Build the base webhook payload structure
 */
function buildBasePayload(phoneNumberId, userPhone, userName) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: phoneNumberId,
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: phoneNumberId,
            phone_number_id: phoneNumberId
          },
          contacts: [{
            profile: {
              name: userName
            },
            wa_id: userPhone
          }],
          messages: []
        },
        field: 'messages'
      }]
    }]
  };
}

/**
 * Build a TEXT message payload
 */
export function buildTextMessage(text, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId()
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'text',
    text: {
      body: text
    }
  }];

  return payload;
}

/**
 * Build a BUTTON REPLY message payload (when user clicks a button)
 */
export function buildButtonReply(buttonId, buttonTitle, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    contextMessageId = null
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  const message = {
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: {
        id: buttonId,
        title: buttonTitle
      }
    }
  };

  if (contextMessageId) {
    message.context = { id: contextMessageId };
  }

  payload.entry[0].changes[0].value.messages = [message];
  return payload;
}

/**
 * Build a LIST REPLY message payload (when user selects from a list)
 */
export function buildListReply(listId, listTitle, listDescription = '', options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    contextMessageId = null
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  const message = {
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'interactive',
    interactive: {
      type: 'list_reply',
      list_reply: {
        id: listId,
        title: listTitle,
        description: listDescription
      }
    }
  };

  if (contextMessageId) {
    message.context = { id: contextMessageId };
  }

  payload.entry[0].changes[0].value.messages = [message];
  return payload;
}

/**
 * Build a NFM (Native Flow Message) REPLY payload (form responses)
 */
export function buildNfmReply(responseJson, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId()
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'interactive',
    interactive: {
      type: 'nfm_reply',
      nfm_reply: {
        response_json: typeof responseJson === 'string' ? responseJson : JSON.stringify(responseJson),
        body: 'Sent',
        name: 'flow'
      }
    }
  }];

  return payload;
}

/**
 * Build an IMAGE message payload
 */
export function buildImageMessage(options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    mediaId = generateMediaId(),
    caption = '',
    mimeType = 'image/jpeg'
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'image',
    image: {
      id: mediaId,
      mime_type: mimeType,
      sha256: crypto.randomBytes(32).toString('hex'),
      caption: caption
    }
  }];

  return payload;
}

/**
 * Build a DOCUMENT message payload
 */
export function buildDocumentMessage(filename, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    mediaId = generateMediaId(),
    caption = '',
    mimeType = 'application/pdf'
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'document',
    document: {
      id: mediaId,
      mime_type: mimeType,
      sha256: crypto.randomBytes(32).toString('hex'),
      filename: filename,
      caption: caption
    }
  }];

  return payload;
}

/**
 * Build a VIDEO message payload
 */
export function buildVideoMessage(options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    mediaId = generateMediaId(),
    caption = '',
    mimeType = 'video/mp4'
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'video',
    video: {
      id: mediaId,
      mime_type: mimeType,
      sha256: crypto.randomBytes(32).toString('hex'),
      caption: caption
    }
  }];

  return payload;
}

/**
 * Build an AUDIO message payload
 */
export function buildAudioMessage(options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    mediaId = generateMediaId(),
    isVoice = true,
    mimeType = 'audio/ogg; codecs=opus'
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'audio',
    audio: {
      id: mediaId,
      mime_type: mimeType,
      sha256: crypto.randomBytes(32).toString('hex'),
      voice: isVoice
    }
  }];

  return payload;
}

/**
 * Build a LOCATION message payload
 */
export function buildLocationMessage(latitude, longitude, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    name = '',
    address = ''
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'location',
    location: {
      latitude: latitude,
      longitude: longitude,
      name: name,
      address: address
    }
  }];

  return payload;
}

/**
 * Build a CONTACTS message payload
 */
export function buildContactsMessage(contacts, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId()
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'contacts',
    contacts: contacts.map(c => ({
      name: { formatted_name: c.name, first_name: c.name },
      phones: [{ phone: c.phone, type: 'CELL' }],
      emails: c.email ? [{ email: c.email, type: 'WORK' }] : []
    }))
  }];

  return payload;
}

/**
 * Build a REACTION message payload
 */
export function buildReactionMessage(emoji, reactToMessageId, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId()
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'reaction',
    reaction: {
      message_id: reactToMessageId,
      emoji: emoji
    }
  }];

  return payload;
}

/**
 * Build a STICKER message payload
 */
export function buildStickerMessage(options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    mediaId = generateMediaId(),
    animated = false
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'sticker',
    sticker: {
      id: mediaId,
      mime_type: 'image/webp',
      sha256: crypto.randomBytes(32).toString('hex'),
      animated: animated
    }
  }];

  return payload;
}

/**
 * Build an ORDER message payload (e-commerce)
 */
export function buildOrderMessage(productItems, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    userName = CONFIG.defaultUserName,
    messageId = generateMessageId(),
    catalogId = 'catalog_123',
    text = ''
  } = options;

  const payload = buildBasePayload(phoneNumberId, userPhone, userName);
  payload.entry[0].changes[0].value.messages = [{
    from: userPhone,
    id: messageId,
    timestamp: getTimestamp(),
    type: 'order',
    order: {
      catalog_id: catalogId,
      product_items: productItems.map(item => ({
        product_retailer_id: item.id,
        quantity: item.quantity,
        item_price: item.price,
        currency: item.currency || 'INR'
      })),
      text: text
    }
  }];

  return payload;
}

/**
 * Build a STATUS UPDATE payload (sent, delivered, read, failed)
 */
export function buildStatusUpdate(status, messageId, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId,
    userPhone = CONFIG.defaultUserPhone,
    errors = null
  } = options;

  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: phoneNumberId,
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: phoneNumberId,
            phone_number_id: phoneNumberId
          },
          statuses: [{
            id: messageId,
            status: status,
            timestamp: getTimestamp(),
            recipient_id: userPhone
          }]
        },
        field: 'messages'
      }]
    }]
  };

  if (errors && status === 'failed') {
    payload.entry[0].changes[0].value.statuses[0].errors = errors;
  }

  return payload;
}

/**
 * Build a MESSAGE ECHO payload (when bot sends a message)
 */
export function buildMessageEcho(messageType, to, options = {}) {
  const {
    phoneNumberId = CONFIG.defaultPhoneNumberId
  } = options;

  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: phoneNumberId,
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: phoneNumberId,
            phone_number_id: phoneNumberId
          },
          message_echoes: [{
            type: messageType,
            to: to,
            timestamp: getTimestamp()
          }]
        },
        field: 'messages'
      }]
    }]
  };
}

// ============================================================================
// SIGNATURE GENERATION
// ============================================================================

/**
 * Generate the x-hub-signature-256 header value
 */
function generateSignature(payload, appSecret) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(payloadString);
  return `sha256=${hmac.digest('hex')}`;
}

// ============================================================================
// SIMULATOR FUNCTIONS
// ============================================================================

/**
 * Send a simulated webhook request to your local server
 */
export async function sendWebhook(payload, options = {}) {
  const {
    webhookUrl = CONFIG.webhookUrl,
    appSecret = CONFIG.appSecret,
    includeSignature = true,
    logRequest = true,
    logResponse = true
  } = options;

  const payloadString = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json'
  };

  if (includeSignature) {
    headers['x-hub-signature-256'] = generateSignature(payloadString, appSecret);
  }

  if (logRequest) {
    console.log('\n📤 Sending webhook to:', webhookUrl);
    console.log('📋 Payload:', JSON.stringify(payload, null, 2));
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: headers,
      body: payloadString
    });

    const responseText = await response.text();

    if (logResponse) {
      console.log('📥 Response Status:', response.status);
      if (responseText) {
        console.log('📥 Response Body:', responseText);
      }
    }

    return {
      status: response.status,
      body: responseText,
      success: response.ok
    };
  } catch (error) {
    console.error('❌ Error sending webhook:', error.message);
    return {
      status: 0,
      body: null,
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS (Combine build + send)
// ============================================================================

export async function simulateTextMessage(text, options = {}) {
  const payload = buildTextMessage(text, options);
  return sendWebhook(payload, options);
}

export async function simulateButtonReply(buttonId, buttonTitle, options = {}) {
  const payload = buildButtonReply(buttonId, buttonTitle, options);
  return sendWebhook(payload, options);
}

export async function simulateListReply(listId, listTitle, listDescription = '', options = {}) {
  const payload = buildListReply(listId, listTitle, listDescription, options);
  return sendWebhook(payload, options);
}

export async function simulateNfmReply(responseJson, options = {}) {
  const payload = buildNfmReply(responseJson, options);
  return sendWebhook(payload, options);
}

export async function simulateImageMessage(options = {}) {
  const payload = buildImageMessage(options);
  return sendWebhook(payload, options);
}

export async function simulateDocumentMessage(filename, options = {}) {
  const payload = buildDocumentMessage(filename, options);
  return sendWebhook(payload, options);
}

export async function simulateVideoMessage(options = {}) {
  const payload = buildVideoMessage(options);
  return sendWebhook(payload, options);
}

export async function simulateAudioMessage(options = {}) {
  const payload = buildAudioMessage(options);
  return sendWebhook(payload, options);
}

export async function simulateLocationMessage(latitude, longitude, options = {}) {
  const payload = buildLocationMessage(latitude, longitude, options);
  return sendWebhook(payload, options);
}

export async function simulateReactionMessage(emoji, reactToMessageId, options = {}) {
  const payload = buildReactionMessage(emoji, reactToMessageId, options);
  return sendWebhook(payload, options);
}

export async function simulateOrderMessage(productItems, options = {}) {
  const payload = buildOrderMessage(productItems, options);
  return sendWebhook(payload, options);
}

export async function simulateStatusUpdate(status, messageId, options = {}) {
  const payload = buildStatusUpdate(status, messageId, options);
  return sendWebhook(payload, options);
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Run a complete flow test scenario
 */
export async function runFlowScenario(steps, options = {}) {
  const { delayBetweenSteps = 1000 } = options;
  const results = [];

  console.log('\n🚀 Starting flow scenario test...\n');
  console.log('='.repeat(60));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n📍 Step ${i + 1}: ${step.description || step.type}`);
    console.log('-'.repeat(40));

    let result;
    switch (step.type) {
      case 'text':
        result = await simulateTextMessage(step.text, { ...options, ...step.options });
        break;
      case 'button':
        result = await simulateButtonReply(step.buttonId, step.buttonTitle, { ...options, ...step.options });
        break;
      case 'list':
        result = await simulateListReply(step.listId, step.listTitle, step.listDescription, { ...options, ...step.options });
        break;
      case 'nfm':
        result = await simulateNfmReply(step.responseJson, { ...options, ...step.options });
        break;
      case 'image':
        result = await simulateImageMessage({ ...options, ...step.options });
        break;
      case 'document':
        result = await simulateDocumentMessage(step.filename, { ...options, ...step.options });
        break;
      case 'location':
        result = await simulateLocationMessage(step.latitude, step.longitude, { ...options, ...step.options });
        break;
      case 'order':
        result = await simulateOrderMessage(step.productItems, { ...options, ...step.options });
        break;
      default:
        console.log(`⚠️ Unknown step type: ${step.type}`);
        continue;
    }

    results.push({ step: i + 1, ...result });

    if (i < steps.length - 1 && delayBetweenSteps > 0) {
      console.log(`⏳ Waiting ${delayBetweenSteps}ms before next step...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenSteps));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Flow scenario completed!');
  console.log(`📊 Results: ${results.filter(r => r.success).length}/${results.length} successful`);

  return results;
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function runInteractiveMode() {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  console.log('\n🤖 WhatsApp Webhook Simulator - Interactive Mode');
  console.log('='.repeat(50));
  console.log(`📍 Target: ${CONFIG.webhookUrl}`);
  console.log(`📱 Phone ID: ${CONFIG.defaultPhoneNumberId}`);
  console.log(`👤 User: ${CONFIG.defaultUserName} (${CONFIG.defaultUserPhone})`);
  console.log('='.repeat(50));
  console.log('\nCommands:');
  console.log('  text <message>     - Send a text message');
  console.log('  button <id> <title> - Send a button reply');
  console.log('  list <id> <title>   - Send a list reply');
  console.log('  image              - Send an image');
  console.log('  document <filename> - Send a document');
  console.log('  location <lat> <lng> - Send a location');
  console.log('  status <type> <msgId> - Send status update (sent/delivered/read/failed)');
  console.log('  config             - Show current configuration');
  console.log('  exit               - Exit simulator');
  console.log('');

  while (true) {
    const input = await question('\n> ');
    const parts = input.trim().split(' ');
    const command = parts[0]?.toLowerCase();

    try {
      switch (command) {
        case 'text':
          await simulateTextMessage(parts.slice(1).join(' '));
          break;
        case 'button':
          await simulateButtonReply(parts[1], parts.slice(2).join(' '));
          break;
        case 'list':
          await simulateListReply(parts[1], parts.slice(2).join(' '));
          break;
        case 'image':
          await simulateImageMessage({ caption: parts.slice(1).join(' ') });
          break;
        case 'document':
          await simulateDocumentMessage(parts[1] || 'test.pdf');
          break;
        case 'location':
          await simulateLocationMessage(parseFloat(parts[1]) || 28.6139, parseFloat(parts[2]) || 77.2090);
          break;
        case 'status':
          await simulateStatusUpdate(parts[1] || 'delivered', parts[2] || generateMessageId());
          break;
        case 'config':
          console.log('\nCurrent Configuration:');
          console.log(JSON.stringify(CONFIG, null, 2));
          break;
        case 'exit':
        case 'quit':
          console.log('👋 Goodbye!');
          rl.close();
          process.exit(0);
        case '':
          break;
        default:
          console.log('❓ Unknown command. Type "exit" to quit.');
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

// Run interactive mode if executed directly
if (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('webhookSimulator.js')) {
  runInteractiveMode().catch(console.error);
}

export { CONFIG, generateMessageId, generateSignature };
