
import { sendTextMessage, fastURL, djangoURL, sendNodeMessage } from "../mainwebhook/snm.js"
import { normalizePhone } from "../normalize.js";
import { userSessions, messageCache } from "../server.js";
import { findNextNodesFromEdges, findNodeById } from "./edge-navigation.js";
import axios from "axios";

const fallback_messages = {
    as: "দয়া করে সঠিক ইনপুট দিন",
    bh: "कृपया सही इनपुट दें",
    bn: "দয়া করে সঠিক ইনপুট দিন",
    gu: "કૃપા કરીને સahi ઇનપુટ આપો",
    hi: "कृपया सही इनपुट दें",
    kn: "ದಯವಿಟ್ಟು ಸರಿಯಾದ ಇನ್‌ಪುಟ್ ನೀಡಿರಿ",
    mr: "कृपया योग्य इनपुट द्या",
    or: "ଦୟାକରି ସଠିକ୍ ଇନପୁଟ୍ ଦିଅନ୍ତୁ"
}

export async function executeFallback(userSession) {
    console.log("Entering Fallback")
    var fallback_count = userSession.fallback_count
    const userPhoneNumber = userSession.userPhoneNumber
    const business_phone_number_id = userSession.business_phone_number_id

    if (fallback_count > 0) {
        console.log("Fallback Count: ", fallback_count)
        const fallback_msg = fallback_messages?.[userSession.language] || userSession.fallback_msg
        console.log("Fallback Message: ", fallback_msg)
        const access_token = userSession.accessToken
        const response = await sendTextMessage(userPhoneNumber, business_phone_number_id, fallback_msg, access_token)
        fallback_count = fallback_count - 1;
        userSession.fallback_count = fallback_count
    }
    else {
        if (userSession.isTrigger) {
            await userSessions.delete(userPhoneNumber + business_phone_number_id);
            console.log("restarting user session for user: ", userPhoneNumber)
        }
        else {
            userSession.currNode = userSession.startNode
            userSession.nextNode = userSession.adjList[userSession.currNode]
            userSession.fallback_count = userSession.max_fallback_count || 1
            await sendNodeMessage(userPhoneNumber, business_phone_number_id);
        }
    }
}

export async function addContact(phone, name, bpid) {
    phone = normalizePhone(phone);
    try {
        const c_data = {
            name: name,
            phone: phone
        }
        await axios.post(`${djangoURL}/contacts_by_tenant/`, c_data, {
            headers: { 'bpid': bpid }
        })
    } catch (error) {
        console.error('Error Occured while adding contact: ', error.message)
    }
}

export async function addDynamicModelInstance(modelName, updateData, tenant) {
    const url = `${djangoURL}/dynamic-model-data/${modelName}/`;
    const data = updateData;
    try {
        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Id': tenant
            },
        });
        console.log('Data updated successfully:', response.data);
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`Failed to add dynamic model instance: ${error.response.status}`, JSON.stringify(error.response.data, null, 5));
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error in setting up the request:', error.message);
        }
        return null;
    }
}

export async function replacePlaceholders(message, userSession = {}, contact = null, tenant = null) {

    console.log("message b4 replacement: ", message)
    const placeholders = [...message.matchAll(/{{\s*[\w._\[\]]+\s*}}/g)] || [];

    if (userSession && !contact) contact = userSession.userPhoneNumber
    if (userSession && !tenant) tenant = userSession.tenant

    if (placeholders && placeholders.length > 0) {
        console.log("Placeholders: ", placeholders)
        for (const placeholder of placeholders) {
            let key = placeholder[0].slice(2, -2).trim();
            const keys = key.split('.')
            if (keys[0] == 'contact') {
                let contactData = messageCache.get(contact)
                if (!contactData) {
                    const response = await axios.get(`${djangoURL}/contacts-by-phone/${contact}`, { headers: { 'X-Tenant-Id': tenant } })
                    // Fix: API returns an object, not an array
                    contactData = Array.isArray(response.data) ? response.data[0] : response.data;
                    console.log("Received Data: ", contactData)
                    messageCache.set(contact, contactData)
                }
                if (keys.length > 1) {
                    // Support nested paths like contact.customField.name or contact.name
                    let replacementValue = contactData;
                    const fieldPath = keys.slice(1).filter(k => k !== ''); // Remove empty strings from trailing dots

                    for (const field of fieldPath) {
                        if (replacementValue && replacementValue[field] !== undefined) {
                            replacementValue = replacementValue[field];
                        } else {
                            // If path not found, try direct field access (fallback)
                            replacementValue = contactData?.[field] || '';
                            break;
                        }
                    }

                    // Ensure we have a string value
                    replacementValue = replacementValue !== null && replacementValue !== undefined ? String(replacementValue) : '';
                    message = message.replace(placeholder[0], replacementValue);
                } else {
                    console.warn("Invalid contact placeholder: ", placeholder[0]);
                }
            }
            else if (keys[0] == 'api') {
                const data_source = userSession.api.GET
                const nestedKeyPath = keys.slice(1).join('.');
                const replacementValue = await getNestedValue(data_source, nestedKeyPath) || '';

                message = message.replace(placeholder[0], replacementValue);
            }
            else {
                console.log("Unrecognized Placeholder: ", keys[0])
            }
        }
    }
    console.log("MEssage after replacing: ", message)
    return message;
}

async function getNestedValue(obj, keyPath) {
    if (!obj || !keyPath || typeof keyPath !== 'string') {
        return undefined; // Return undefined if obj or keyPath is invalid
    }

    // Split the key path into parts (e.g., "responseData1.user.name" -> ["responseData1", "user", "name"])
    const keys = keyPath.split('.');

    // Traverse the object to get the value
    let current = obj;
    for (const key of keys) {
        if (current[key] === undefined) {
            return undefined; // Key not found
        }
        current = current[key];
    }

    return current;
}

export async function updateStatus(status, message_id, business_phone_number_id, user_phone, broadcastGroup, tenant, timestamp) {
    let isRead = false;
    let isDelivered = false;
    let isSent = false;
    let isReplied = false;
    let isFailed = false;
    console.log("Sending message status: ", status)
    try {
        if (status === "replied") {
            isReplied = true;
        } else if (status === "read") {
            isRead = true;
        } else if (status === "delivered") {
            isDelivered = true;
        } else if (status === "sent") {
            isSent = true;
        } else if (status === "failed") {
            isFailed = true;
        }

        // Prepare data to send
        const data = {
            business_phone_number_id: business_phone_number_id,
            is_failed: isFailed,
            is_replied: isReplied,
            is_read: isRead,
            is_delivered: isDelivered,
            is_sent: isSent,
            user_phone: user_phone,
            message_id: message_id,
            bg_id: broadcastGroup?.id,
            bg_name: broadcastGroup?.name,
            template_name: broadcastGroup?.template_name,
            timestamp: timestamp
        };
        // console.log("Tenant Sent: ", tenant)
        // console.log("Sending request with data:", data);

        // Send POST request with JSON payload
        console.log(message_id, "message id")
        console.log("Sending req to set status")
        const response = await axios.post(`${fastURL}/set-status/`, data, {
            headers: {
                "X-Tenant-Id": tenant,
                "Content-Type": "application/json"
            }
        });

        console.log("Response received in set-status:", response.data);
    } catch (error) {
        console.error("Error updating status:", error.response ? error.response.data : error.message);
    }
}

export async function validateInput(inputVariable, message) {
    try {
        const prompt = `Question being asked is: ${inputVariable}?\n
Response being given is: ${message}\n
Does the response answer the question? reply in yes or no. nothing else `

        const api_key = process.env.OPENAI_API_KEY;

        const data = {
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "you are a helpful assisstant who replies in yes or no only"
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        }
        const response = await axios.post('https://api.openai.com/v1/chat/completions', data, {
            headers: {
                'Authorization': `Bearer ${api_key}`,
                'Content-Type': 'application/json',
            }
        });

        const validationResult = response.data.choices[0].message.content;
        console.log("Validation Result: ", validationResult)
        return validationResult
    } catch (error) {
        console.error('Error validating input:', error);
        return false;
    }
}

export async function getTenantFromBpid(bpid) {
    try {
        var response = await axios.get(`${djangoURL}/get-tenant/?bpid=${bpid}`, {
        })
        // console.log("Tenant Response: ", response.data)
        const tenant = response.data.tenant
        return tenant
    } catch (error) {
        console.error(`Error getting tenant for ${bpid}: `, error)
    }
}

export async function saveMessage(userPhoneNumber, business_phone_number_id, formattedConversation, tenant, timestamp) {
    try {

        const body = {
            contact_id: userPhoneNumber,
            business_phone_number_id: business_phone_number_id,
            conversations: formattedConversation,
            tenant: tenant,
            time: timestamp
        }

        axios.post(`${djangoURL}/whatsapp_convo_post/${userPhoneNumber}/?source=whatsapp`, body,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': tenant
                }
            }
        );
        // if (!saveRes.ok) throw new Error("Failed to save conversation");
    } catch (error) {
        console.error("Error saving conversation (save message):", error.message);
    }
}

export async function sendNotification(notif, tenant) {
    try {
        await axios.post(`${fastURL}/notifications`, notif,
            {
                headers: {
                    'X-Tenant-Id': tenant
                }
            }
        )
        // console.log("Response Sending Notification: ", res.data)
    }
    catch (error) {
        console.error(`Error sending notification: ${error}`)
    }
}

export async function updateLastSeen(type, time, phone, bpid) {
    try {
        const response = await axios.patch(`${djangoURL}/update-last-seen/${phone}/${type}`, { time: time }, { headers: { bpid: bpid } })

        console.log("Response updating last seen: ", response.data)
    } catch (error) {
        console.error("Error Occured in updating last seen: ", error)
    }
}

export async function getSession(business_phone_number_id, contact, skipAddContact = false, retryCount = 0) {
    const MAX_RETRIES = 3;

    // Prevent infinite recursion
    if (retryCount >= MAX_RETRIES) {
        throw new Error(`Session initialization failed after ${MAX_RETRIES} attempts. Please check backend connectivity and service authentication.`);
    }

    try {
        console.log("Contact: ", contact)
        const userPhoneNumber = contact?.wa_id
        // Better contact name handling - only use fallback if truly no name available
let userName = null;
if (contact?.profile?.name && contact.profile.name.trim() !== '') {
    userName = contact.profile.name.trim();
}
// Don't set a default "Nuren User" - let it be null if no name is available

        const key = String(userPhoneNumber) + String(business_phone_number_id);
        let userSession = await userSessions.get(key);

        if (!userSession) {
            // Only add contact if skipAddContact is false
            if (!skipAddContact) {
                addContact(userPhoneNumber, userName, business_phone_number_id)
            }
            console.log(`Creating new session for user ${userPhoneNumber}`);
            try {
                let responseData = messageCache.get(business_phone_number_id)

                // Validate cached data - if it's missing critical fields, refetch
                if (responseData) {
                    const whatsappData = responseData?.whatsapp_data?.[0];
                    const hasValidData = whatsappData && (whatsappData.adj_list || whatsappData.nodes);
                    if (!hasValidData) {
                        console.log("⚠️ Cached data is invalid (missing adj_list/nodes), clearing cache...");
                        messageCache.delete(business_phone_number_id);
                        responseData = null;
                    } else {
                        console.log("✅ Using valid cached tenant data");
                    }
                }

                // Service authentication headers
                const serviceHeaders = {
                    'bpid': business_phone_number_id,
                    'X-Service-Key': process.env.NODEJS_SERVICE_KEY || process.env.NODE_SERVICE_KEY
                };

                //Get tenant from Fast
                if (!responseData) {
                    try {
                        console.log(`🔍 Attempting FastAPI: ${fastURL}/whatsapp_tenant`);
                        const response = await axios.get(`${fastURL}/whatsapp_tenant`, {
                            headers: serviceHeaders,
                            timeout: 10000
                        });
                        responseData = response.data
                        messageCache.set(business_phone_number_id, responseData)
                        console.log("✅ FastAPI tenant fetch successful");
                    } catch (error) {
                        console.log("❌ FastAPI Backend failed:", error.response?.status, error.response?.data || error.message);
                    }
                }
                //Get tenant from Django
                if (!responseData) {
                    try {
                        console.log(`🔍 Attempting Django: ${djangoURL}/whatsapp_tenant`);
                        const response = await axios.get(`${djangoURL}/whatsapp_tenant`, {
                            headers: serviceHeaders,
                            timeout: 10000
                        });
                        responseData = response.data
                        messageCache.set(business_phone_number_id, responseData)
                        console.log("✅ Django tenant fetch successful");
                    } catch (error) {
                        console.log("❌ Django Backend failed:", error.response?.status, error.response?.data || error.message);
                    }
                }
                //Get tenant failed from both
                if (!responseData) {
                    throw new Error(`Both Backends failed!! FastAPI: ${fastURL}, Django: ${djangoURL}. Check: 1) Services are running 2) NODEJS_SERVICE_KEY is set 3) Network connectivity`);
                }

                // DUAL MODE DETECTION
                const whatsappData = responseData?.whatsapp_data[0];
                const flowVersion = whatsappData?.flow_version || 1;

                console.log(`Flow Version: ${flowVersion} (${flowVersion === 2 ? 'NEW' : 'LEGACY'})`);

                let multilingual = whatsappData.multilingual;
                let flowData, adjList, startNode, currNode, nextNode, nodes, edges, startNodeId;

                if (flowVersion === 2) {
                    // NEW MODE: Use nodes + edges
                    nodes = whatsappData.nodes;
                    edges = whatsappData.edges;
                    startNodeId = whatsappData.start_node_id;
                    currNode = startNodeId;
                    nextNode = findNextNodesFromEdges(edges, currNode);

                    // For compatibility with sendNodeMessage
                    flowData = nodes;  // Store nodes in flowData for now
                    adjList = null;    // No adjacency list
                    startNode = startNodeId;

                    console.log(`New mode: ${nodes?.length} nodes, ${edges?.length} edges, start: ${startNodeId}`);
                } else {
                    // LEGACY MODE: Use flow_data + adj_list
                    if (multilingual) flowData = responseData?.whatsapp_data;
                    else flowData = whatsappData.flow_data;

                    adjList = whatsappData?.adj_list;
                    startNode = whatsappData?.start !== null ? whatsappData?.start : 0;
                    currNode = startNode;
                    nextNode = adjList?.[currNode] || [];

                    nodes = null;
                    edges = null;
                    startNodeId = null;

                    console.log(`Legacy mode: flow_data length ${flowData?.length}, start: ${startNode}`);
                }

                if (!flowData && !nodes) console.error("Flow Data is not present for bpid: ", business_phone_number_id)

                let triggers = {};
                responseData.triggers.forEach(element => {
                    triggers[element.trigger] = element.id;
                });

                userSession = {
                    type: "chatbot",
                    AIMode: false,
                    lastActivityTime: Date.now(),

                    // Mode detection
                    flowVersion: flowVersion,

                    // Legacy fields
                    flowData: flowData || [],
                    adjList: adjList || {},
                    startNode: startNode,

                    // New fields
                    nodes: nodes || null,
                    edges: edges || null,
                    startNodeId: startNodeId || null,

                    // Navigation
                    currNode: currNode,
                    nextNode: nextNode,

                    // Common fields
                    accessToken: whatsappData.access_token,
                    accountID: whatsappData.business_account_id,
                    flowName: whatsappData.flow_name || "",
                    business_phone_number_id: whatsappData.business_phone_number_id,
                    tenant: whatsappData.tenant_id,
                    userPhoneNumber: userPhoneNumber,
                    userName: userName,
                    inputVariable: null,
                    inputVariableType: null,
                    fallback_msg: whatsappData.fallback_message || "please provide correct input",
                    fallback_count: whatsappData.fallback_count != null ? whatsappData.fallback_count : 1,
                    max_fallback_count: whatsappData.fallback_count != null ? whatsappData.fallback_count : 1,
                    products: responseData.catalog_data,
                    language: "en",
                    multilingual: multilingual,
                    doorbell: whatsappData?.introductory_msg || null,
                    api: {
                        POST: {},
                        GET: {}
                    },
                    triggers: triggers,
                    isTrigger: false,
                    hop_nodes: whatsappData.hop_nodes || [],
                    agents: responseData.agents || []
                };

                const key = userPhoneNumber + business_phone_number_id
                await userSessions.set(key, userSession);
            } catch (error) {
                console.error(`Error fetching tenant data for user ${userPhoneNumber}:`, error.message);
                throw error;
            }
        } else {
            userSession.lastActivityTime = Date.now()

            // Update nextNode based on mode
            if (userSession.currNode != null) {
                if (userSession.flowVersion === 2) {
                    // New mode: use edges
                    userSession.nextNode = findNextNodesFromEdges(userSession.edges, userSession.currNode);
                } else {
                    // Legacy mode: use adj_list
                    // Safety check: ensure adjList exists
                    if (!userSession.adjList) {
                        console.warn(`⚠️ [getSession] adjList undefined, clearing cache and reinitializing session...`);
                        await userSessions.delete(userPhoneNumber + business_phone_number_id);
                        messageCache.delete(business_phone_number_id); // Clear bad cached data
                        return await getSession(business_phone_number_id, contact, skipAddContact, retryCount + 1);
                    }
                    userSession.nextNode = userSession.adjList[userSession.currNode];
                }
            }
            else if (userSession.isTrigger) {
                await userSessions.delete(userPhoneNumber + business_phone_number_id);
                messageCache.delete(business_phone_number_id); // Clear cached data for fresh trigger
                return await getSession(business_phone_number_id, contact, skipAddContact, retryCount + 1);
            }
            else {
                userSession.currNode = userSession.flowVersion === 2 ? userSession.startNodeId : userSession.startNode;

                if (userSession.flowVersion === 2) {
                    userSession.nextNode = findNextNodesFromEdges(userSession.edges, userSession.currNode);
                } else {
                    // Safety check: ensure adjList exists before accessing
                    if (!userSession.adjList) {
                        console.warn(`⚠️ [getSession] adjList is undefined for session, clearing cache and reinitializing...`);
                        await userSessions.delete(userPhoneNumber + business_phone_number_id);
                        messageCache.delete(business_phone_number_id); // Clear bad cached data
                        return await getSession(business_phone_number_id, contact, skipAddContact, retryCount + 1);
                    }
                    userSession.nextNode = userSession.adjList[userSession.currNode];
                }

                userSession.fallback_count = userSession.max_fallback_count || 1;
            }
        }
        return userSession;
    } catch (error) {
        console.error("Error in getSession: ", error);
        throw new Error(`Session initialization failed: ${error.message}`)
    }
}

export async function triggerFlowById(userSession, id) {
    try {
        const serviceHeaders = {
            'X-Service-Key': process.env.NODEJS_SERVICE_KEY || process.env.NODE_SERVICE_KEY
        };

        const response = await axios.get(`${djangoURL}/flows/${id}/`, {
            headers: serviceHeaders,
            timeout: 10000
        });
        const { flowData = {}, adjList = {}, flowName, startNode, fallback_msg, fallback_count } = response.data;
        const currNode = startNode || 0;
        const nextNode = adjList?.[currNode] || [];

        userSession.flowData = flowData;
        userSession.adjList = adjList;
        userSession.flowName = flowName;
        userSession.startNode = startNode || 0;
        userSession.currNode = currNode;
        userSession.nextNode = nextNode;
        userSession.fallback_msg = fallback_msg || "please provide correct input";
        userSession.fallback_count = fallback_count || 1;
        userSession.isTrigger = true;

        const { userPhoneNumber, business_phone_number_id } = userSession;
        await sendNodeMessage(userPhoneNumber, business_phone_number_id);
    } catch (error) {
        throw error;
    }
}
