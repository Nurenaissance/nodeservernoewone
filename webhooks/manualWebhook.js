import { userSessions, nurenConsumerMap } from "../server.js";
import { sendMessage } from "../send-message.js";
import { normalizePhone } from "../normalize.js";

export async function manualWebhook(req, userSession){
  const business_phone_number_id = req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
  const contact = req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0];
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const userPhoneNumber = normalizePhone(contact?.wa_id);
  const message_text = message?.text?.body

  let recipient;
  let messageData = null

  if (userPhoneNumber in nurenConsumerMap){
    recipient = nurenConsumerMap[userPhoneNumber]
    if (message_text == "close"){
      await userSessions.delete(userPhoneNumber+business_phone_number_id)
      const customer_userSession = await userSessions.get(recipient+business_phone_number_id)
      customer_userSession.type = "chatbot"
      await sendMessage(
                recipient, 
                business_phone_number_id, 
                {
                    type: "text", 
                    text: { body: "This direct chat is now closed. Thank you for contacting us!" }
                }, 
                customer_userSession.accessToken, 
                customer_userSession.tenant
            )
      delete nurenConsumerMap[userPhoneNumber]
      delete customer_userSession?.talking_to
      console.log("Nuren Consumer Map after deleting: ", nurenConsumerMap)
      console.log("Customer User Session after delete: ", customer_userSession)
      return
    }
  }
  else if (userSession.type == "one2one"){
    recipient = userSession?.talking_to
    console.log("Recipient: ", recipient)
    if(recipient === undefined) return sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, {type: "text", text: { body: "Please wait while one of our agents accepts your message request."}}, userSession.accessToken, userSession.tenant)
    if(message_text && message_text.startsWith("/")) {
      const messageData = {type: "text", text: {body: "Sorry, you are not authorized to use this command."}}
      sendMessage(userPhoneNumber, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant)
    }
    
  }
  const messageType = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0].type
  const keysToRemove = ['mime_type', 'sha256', 'animated'];

  let filteredMessageType = Object.keys(message[messageType])
    .filter(key => !keysToRemove.includes(key))
    .reduce((obj, key) => {
      obj[key] = message[messageType][key];
      return obj;
    }, {});
    console.log("Filtered Message Type: ", filteredMessageType)

    if (messageType === 'contacts') {
      filteredMessageType = Object.values(filteredMessageType);
    }

  if(!messageData) messageData = { type: messageType, [messageType]: filteredMessageType }
  
  const context = message?.context?.id
  if (context) {
    messageData["context"] = {"message_id": context}
  }
  console.log("Sending message data: ", messageData)
  sendMessage(recipient, business_phone_number_id, messageData, userSession.accessToken, userSession.tenant)
}
