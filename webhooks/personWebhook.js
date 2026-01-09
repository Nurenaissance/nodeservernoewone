import axios from "axios";
import { userSessions } from "../server.js";
import { delay } from "../utils.js";
import { sendMessage } from "../send-message.js";
import { fastURL } from "../mainwebhook/snm.js";

const personMap = {};

export async function personWebhook(req, userSession) {
  const business_phone_number_id = userSession.business_phone_number_id;
  const userPhoneNumber = userSession.userPhoneNumber;
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const message_text = message?.text?.body;
  const messageType = message?.type;
  const recipient = userSession.talking_to;

  if (!recipient) {
    if (!personMap[business_phone_number_id]) {
      personMap[business_phone_number_id] = {
        phoneNumber: userPhoneNumber,
        joinedAt: Date.now()
      };
      const messageData = { type: "text", text: { body: `🔍 Looking for someone to chat with... You'll be connected as soon as someone else joins. Feel free to send a message once connected!` } };
      sendMessage(userPhoneNumber, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
    }
    else if (personMap[business_phone_number_id].phoneNumber == userPhoneNumber) {
      if (message_text === "/end") {
        delete personMap[business_phone_number_id];
        userSession.type = "chatbot";
        const messageData = { type: "text", text: { body: `✅ You've exited the matching queue. I'm back to assist you with any questions or information you need!` } };
        sendMessage(userPhoneNumber, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
      }
      else {
        const messageData = { type: "text", text: { body: `⏳ Still searching for a chat partner for you... This might take a moment depending on who's online. \n\nIf you'd like to cancel and return to the regular chatbot, just type "/end".` } };
        sendMessage(userPhoneNumber, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
      }
    }
    else {
      const recipient = personMap[business_phone_number_id].phoneNumber;
      const recipientKey = recipient + business_phone_number_id;
      const recipientSession = await userSessions.get(recipientKey);
      if (!recipientSession) {
        personMap[business_phone_number_id] = {
          phoneNumber: userPhoneNumber,
          joinedAt: Date.now()
        };
        const messageData = { type: "text", text: { body: `🔍 Looking for someone to chat with... You'll be connected as soon as someone else joins. Feel free to send a message once connected!` } };
        sendMessage(userPhoneNumber, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
        return;
      }
      userSession.talking_to = recipient;
      recipientSession.talking_to = userPhoneNumber;
      delete personMap[business_phone_number_id];
      const messageData = { type: "text", text: { body: `🎉 Connected! You're now chatting with a random person. \n\n• Anything you send will go directly to them\n• Your identity remains anonymous\n• Type "/end" anytime to end the conversation\n\nHave fun and please be respectful!` } };
      sendMessage(userPhoneNumber, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
      sendMessage(recipient, business_phone_number_id, messageData, recipientSession.accessToken, recipientSession.tenant);
    }
    return;
  }

  const recipientKey = recipient + business_phone_number_id;
  const recipientSession = await userSessions.get(recipientKey);

  if (message_text === '/end') {
    userSession.type = "chatbot";
    delete userSession.talking_to;
    delete userSession.isConnectedToAI;
    const userMessageData = { type: "text", text: { body: `✅ Chat ended. You've returned to the regular assistant mode. Thanks for using our anonymous chat feature!` } };
    sendMessage(userPhoneNumber, business_phone_number_id, userMessageData, userSession.accessToken, userSession.tenant);

    if (!recipient.startsWith("ai-") && recipientSession) {
      recipientSession.type = "chatbot";
      delete recipientSession.talking_to;
      const recipientMessageData = { type: "text", text: { body: `⚠️ The other person has ended the conversation.\n\n• To chat with someone new, type "/person"\n• Or I can help you with other questions as your regular assistant.` } };
      sendMessage(recipient, business_phone_number_id, recipientMessageData, recipientSession.accessToken, recipientSession.tenant);
    }
    return;
  }

  if (userSession.isConnectedToAI) {
    if (messageType === 'text') {
      handleAIChat(userPhoneNumber, business_phone_number_id, message_text, userSession);
    }
    else {
      setTimeout(() => {
        const messageData = {
          type: "text",
          text: {
            body: "I prefer chatting with text messages. Tell me more about yourself!"
          }
        };
        sendMessage(userPhoneNumber, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
      }, 1500);
    }
    return;
  }

  if (!recipientSession) {
    userSession.type = "chatbot";
    delete userSession.talking_to;
    const messageData = { type: "text", text: { body: `⚠️ Your chat partner has disconnected due to inactivity. The conversation has ended.\n\n• To chat with someone new, type "/person"\n• I'm now back in assistant mode and ready to help you with any questions!` } };
    sendMessage(userPhoneNumber, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
    return;
  }

  const keysToRemove = ['mime_type', 'sha256', 'animated'];
  let filteredMessageType = Object.keys(message[messageType])
    .filter(key => !keysToRemove.includes(key))
    .reduce((obj, key) => {
      obj[key] = message[messageType][key];
      return obj;
    }, {});

  if (messageType === 'contacts') {
    filteredMessageType = Object.values(filteredMessageType);
  }

  const messageData = { type: messageType, [messageType]: filteredMessageType };
  const context = message?.context?.id;
  if (context) {
    messageData["context"] = { "message_id": context };
  }
  sendMessage(recipient, business_phone_number_id, messageData, recipientSession.accessToken, recipientSession.tenant)
}

// Run this function every minute
async function checkLongWaitingUsers() {
  const currentTime = Date.now();
  const tenMinutes = 10 * 1000; // 10 seconds in milliseconds

  for (const [businessId, waitingUser] of Object.entries(personMap)) {
    // If user has been waiting for more than 10 minutes
    if (currentTime - waitingUser.joinedAt > tenMinutes) {
      const userPhoneNumber = waitingUser.phoneNumber;
      const userKey = userPhoneNumber + businessId;
      const userSession = await userSessions.get(userKey);

      // Remove from waiting pool
      delete personMap[businessId];

      if (userSession) {
        // Create a fake session ID for the AI
        const aiSessionId = "ai-" + Date.now();

        // Set up the connection
        userSession.talking_to = aiSessionId;
        userSession.isConnectedToAI = true;

        // Send connection message (same as human connection)
        const messageData = {
          type: "text",
          text: {
            body: `🎉 Connected! You're now chatting with a random person. \n\n• Anything you send will go directly to them\n• Your identity remains anonymous\n• Type "/end" anytime to end the conversation\n\nHave fun and please be respectful!`
          }
        };
        sendMessage(userPhoneNumber, businessId, messageData, userSession.accessToken, userSession.tenant);

        const firstMessage = getRandomFirstMessage();
        const aiMessageData = {
          type: "text",
          text: { body: firstMessage }
        };
        sendMessage(userPhoneNumber, businessId, aiMessageData, userSession.accessToken, userSession.tenant);
      }
    }
  }
}

// Helper function to get random first messages
function getRandomFirstMessage() {
  const messages = [
    "Hey there! How's your day going?",
    "Hi! Nice to meet you. What brings you here today?",
    "Hello! I'm glad we got connected. How are you doing?",
    "Hey! I've been waiting to chat with someone. What's up?",
    "Hi there! Anything interesting happening in your world today?"
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// Set up interval to run the check every 5 seconds
setInterval(checkLongWaitingUsers, 5 * 1000);

async function getPrompt(userSession) {
  const defaultPrompt = "You are pretending to be a real person chatting on WhatsApp. Act natural, conversational, and human-like. Occasionally make typos or use casual language. Never reveal you're an AI. Keep responses short (1-3 sentences). If asked personal questions, make up realistic but generic details. If asked where you're from, pick a random city. If asked what you do, choose a common profession. Never use asterisks for actions or use markdown formatting.";
  try {
    const response = await axios.get(`${fastURL}/prompt/fetch/`, {
      headers: {
        "X-Tenant-ID": userSession.tenant
      }
    });
    const prompt = response.data.prompt || defaultPrompt;
    return prompt;
  } catch (err) {
    console.error("Error fetching custom prompt, using default:");
    return defaultPrompt;
  }
}

async function handleAIChat(userPhoneNumber, businessId, message, userSession) {
  try {
    if (!userSession.aiPrompt) {
      userSession.aiPrompt = await getPrompt(userSession);
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: userSession.aiPrompt
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 150
      })
    });

    const data = await response.json();
    let aiReply = data.choices[0].message.content.trim();

    // Add human-like variations occasionally
    aiReply = addHumanVariations(aiReply);

    // Add a realistic typing delay based on message length
    // Assume average typing speed of 40 WPM
    const wordCount = message.split(' ').length;
    const baseDelay = 1000; // Minimum 1 second
    const typingDelay = Math.min(baseDelay + (wordCount * 200), 8000); // Cap at 8 seconds

    await delay(typingDelay);

    // Send the AI's response
    const messageData = {
      type: "text",
      text: { body: aiReply }
    };
    sendMessage(userPhoneNumber, businessId, messageData, userSession.accessToken, userSession.tenant);
  } catch (error) {
    console.error("Error with AI chat:", error);

    // If API fails, send a generic message after a delay
    setTimeout(() => {
      const fallbackMessage = {
        type: "text",
        text: {
          body: "Sorry, my connection is a bit spotty. What were you saying?"
        }
      };
      sendMessage(userPhoneNumber, businessId, fallbackMessage, userSession.accessToken, userSession.tenant);
    }, 2000);
  }
}

// Helper function to add human-like variations
function addHumanVariations(text) {
  // Occasionally add typos (20% chance)
  if (Math.random() < 0.2) {
    const words = text.split(' ');
    const randomIndex = Math.floor(Math.random() * words.length);
    if (words[randomIndex] && words[randomIndex].length > 3) {
      // Swap two adjacent characters
      const word = words[randomIndex];
      const pos = Math.floor(Math.random() * (word.length - 2)) + 1;
      words[randomIndex] = word.substring(0, pos) + word[pos + 1] + word[pos] + word.substring(pos + 2);
    }
    text = words.join(' ');
  }

  // Occasionally add fillers (30% chance)
  if (Math.random() < 0.3) {
    const fillers = ["hmm", "well", "so", "anyway", "like", "tbh", "lol", "haha"];
    const filler = fillers[Math.floor(Math.random() * fillers.length)];

    if (Math.random() < 0.5) {
      text = filler + ", " + text.charAt(0).toLowerCase() + text.slice(1);
    } else {
      text = text + ". " + filler.charAt(0).toUpperCase() + filler.slice(1);
    }
  }

  return text;
}
