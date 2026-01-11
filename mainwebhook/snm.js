import axios from "axios";
import { userSessions } from "../server.js";
import { sendMessage } from "../send-message.js"
import { replacePlaceholders } from "../helpers/misc.js"
import { sendTemplateMessage } from "../templateService.js";
import { chooseOptionMap } from "../utils.js";
import { handleAudioOrdersForDrishtee, handleTextOrdersForDrishtee } from "../drishtee/drishteeservice.js";
import { findNextNodesFromEdges, findNodeById, getNodeData } from "../helpers/edge-navigation.js";

export const fastURL = process.env.FAST_API_URL || process.env.FASTAPI_URL || "https://fastapiyes-avaaadfjgzafe6ff.canadacentral-01.azurewebsites.net"
export const djangoURL = process.env.DJANGO_URL || "https://django-faecdbgwhgepemec.canadacentral-01.azurewebsites.net"

export async function sendFlowMessage(phone, bpid, header, body, footer, flowName, flowCta, access_token = null, tenant_id = null) {
    const messageData = {
        type: "interactive",
        interactive: {
            type: "flow",
            header: {
                type: "text",
                text: header
            },
            body: { text: body },
            footer: { text: footer },
            action: {
                name: "flow",
                parameters: {
                    flow_message_version: "3",
                    flow_name: flowName,
                    flow_cta: flowCta
                }
            }
        }
    }
    return sendMessage(phone, bpid, messageData, access_token, tenant_id)
}

export async function sendLocationMessage(phone, bpid, body, access_token = null, tenant_id = null) {
    const { latitude, longitude, name, address } = body
    const messageData = {
        type: "location",
        location: {
            latitude: latitude,
            longitude: longitude,
            name: name,
            address: address
        }
    }

    return sendMessage(phone, bpid, messageData, access_token, tenant_id)
}

export async function sendVideoMessage(phone, bpid, videoID, access_token = null, tenant_id = null, caption = null) {
    const messageData = {
        type: "video",
        video: {
            id: videoID
        }
    }
    if (caption) messageData.video.caption = caption
    return sendMessage(phone, bpid, messageData, access_token, tenant_id)
}

export async function sendAudioMessage(phone, bpid, audioID, caption, access_token = null, tenant_id = null) {
    const audioObject = {}
    if (audioID) audioObject.id = audioID
    if (caption) audioObject.caption = caption
    const messageData = {
        type: "audio",
        audio: audioObject
    }
    return sendMessage(phone, bpid, messageData, access_token, tenant_id)
}

export async function sendTextMessage(userPhoneNumber, business_phone_number_id, message, access_token, tenant_id) {
    console.log("cCess:token: ", access_token)
    const messageData = {
        type: "text",
        text: { body: message }
    }
    return sendMessage(userPhoneNumber, business_phone_number_id, messageData, access_token, tenant_id)
}

export async function sendImageMessage(phoneNumber, business_phone_number_id, imageID, caption, access_token = null, tenant_id = null) {
    const imageObject = {}
    if (imageID) imageObject.id = imageID
    if (caption) imageObject.caption = caption
    const messageData = {
        type: "image",
        image: imageObject
    };
    console.log("IMAGEEEE");
    return sendMessage(phoneNumber, business_phone_number_id, messageData, access_token, tenant_id);
}

export async function sendButtonMessage(buttons, message, phoneNumber, business_phone_number_id, mediaID = null, access_token = null, tenant_id = null) {
    const key = phoneNumber + business_phone_number_id
    const userSession = await userSessions.get(key);
    const flow = userSession.flowData
    try {
        let button_rows = buttons.map(buttonNode => ({
            type: 'reply',
            reply: {
                id: flow[buttonNode].id,
                title: (flow[buttonNode].body).slice(0, 20)
            }
        }));
        console.log("button_row:", button_rows)
        const messageData = {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: message },
                action: { buttons: button_rows }
            }
        }
        if (mediaID !== null && mediaID !== undefined) {
            messageData.interactive['header'] = { type: 'image', image: { id: mediaID } }
        }
        return sendMessage(phoneNumber, business_phone_number_id, messageData, access_token, tenant_id)
    } catch (error) {
        console.error('Failed to send button message:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response ? error.response.data : error.message };
    }
}

export async function sendInputMessage(userPhoneNumber, business_phone_number_id, message, access_token = null, tenant_id = null) {
    const messageData = {
        type: "text",
        text: { body: message }
    }
    return sendMessage(userPhoneNumber, business_phone_number_id, messageData, access_token, tenant_id)
}

export async function sendListMessage(list, message, listTitle, phoneNumber, business_phone_number_id, access_token = null, tenant_id = null) {
    const key = phoneNumber + business_phone_number_id
    // console.log("USER SESSIONS: ",  userSessions, key)
    const userSession = await userSessions.get(key);
    const flow = userSession.flowData

    const rows = list.map((listNode, index) => ({
        id: flow[listNode].id,
        title: (flow[listNode].body).slice(0, 24),
        ...(flow[listNode].description && { description: (flow[listNode].description).slice(0, 72) })
    }));
    console.log(userSession.language)
    console.log("OPTION CHOOSING RESULT: ", chooseOptionMap[`${userSession.language}`])
    const messageData = {
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: message },
            action: {
                button: listTitle || chooseOptionMap[`${userSession.language}`] || "Choose Option:",
                sections: [{ title: "Section Title", rows }]
            }
        }
    };
    return sendMessage(phoneNumber, business_phone_number_id, messageData, access_token, tenant_id);
}

export async function sendProductMessage(userSession, product_list, catalog_id, header, body, footer, section_title, tenant_id = null) {
    let productMessageData;
    // single product
    if (product_list.length == 1) {
        productMessageData = {
            type: "interactive",
            interactive: {
                type: "product",
                action: {
                    catalog_id: catalog_id,
                    product_retailer_id: product_list[0]
                }
            }
        }
        if (body) productMessageData.interactive['body'] = { text: body }
        if (footer) productMessageData.interactive['footer'] = { text: footer }
    }
    // multiple products
    else {
        let section = {
            title: section_title,
            product_items: []
        };

        for (let product of product_list) {
            console.log("product: ", product);
            section['product_items'].push({ product_retailer_id: product });
        }
        let sections = [section];
        console.log("sections: ", JSON.stringify(sections, null, 4))
        productMessageData = {
            type: "interactive",
            interactive: {
                type: "product_list",
                header: {
                    type: "text",
                    text: header
                },
                body: {
                    text: body
                },
                action: {
                    button: "Start Shopping",
                    catalog_id: catalog_id,
                    sections: sections
                }
            }
        }
        if (footer) productMessageData.interactive['footer'] = { text: footer }
    }
    console.log("Message Data ", JSON.stringify(productMessageData, null, 4))
    await sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, productMessageData, userSession.accessToken, tenant_id)
}

export async function sendNodeMessage(userPhoneNumber, business_phone_number_id) {
    const key = userPhoneNumber + business_phone_number_id
    const userSession = await userSessions.get(key);
    if (!userSession) {
        console.error(`No session found for user ${userPhoneNumber} and ${business_phone_number_id}`);
        return;
    }

    const { flowVersion, accessToken, currNode } = userSession;

    console.log("Current Node: ", currNode, " | Flow Version:", flowVersion || 1)

    // Handle delay
    let delay;
    if (flowVersion === 2) {
        const nodeObj = findNodeById(userSession.nodes, currNode);
        delay = nodeObj?.data?.delay;
        if (delay !== undefined && delay > 0) {
            nodeObj.data.delay = 0;  // Clear delay
            console.log(`delayed by ${delay} seconds`)
            setTimeout(() => {
                sendNodeMessage(userPhoneNumber, business_phone_number_id);
            }, delay * 1000)
            return;
        }
    } else {
        const flow = userSession.flowData;
        if (currNode) delay = flow[currNode]?.delay;
        if (delay !== undefined && delay > 0) {
            userSession.flowData[currNode].delay = 0
            console.log(`delayed by ${delay} seconds`)
            setTimeout(() => {
                sendNodeMessage(userPhoneNumber, business_phone_number_id);
            }, delay * 1000)
            return;
        }
    }

    if (typeof currNode !== undefined && currNode !== null) {
        // DUAL MODE PROCESSING
        if (flowVersion === 2) {
            // NEW MODE V2
            await processNodeV2(userSession, userPhoneNumber, business_phone_number_id);
        } else {
            // LEGACY MODE
            await processNodeLegacy(userSession, userPhoneNumber, business_phone_number_id);
        }
    } else {
        console.log("No current node - flow ended or reset needed");
    }

    await userSessions.set(key, userSession);
}

// V2 Node Processing
async function processNodeV2(userSession, userPhoneNumber, business_phone_number_id) {
    const { nodes, edges, currNode, accessToken } = userSession;

    const nodeObj = findNodeById(nodes, currNode);
    if (!nodeObj) {
        console.error(`Node ${currNode} not found`);
        return;
    }

    const nextNode = findNextNodesFromEdges(edges, currNode);
    const nodeType = nodeObj.type;
    const nodeData = nodeObj.data || {};
    let node_message = nodeData.message || nodeData.question || nodeData.body || nodeData.text || "";

    console.log(`Processing v2 node type: ${nodeType}`);

    switch (nodeType) {
        case "askQuestion":
            const optionType = nodeData.optionType;
            node_message = await replacePlaceholders(node_message, userSession);

            if (nodeData.variable) {
                userSession.inputVariable = nodeData.variable;
                userSession.inputVariableType = nodeData.dataType;
            }

            if (optionType === "Buttons") {
                const buttonOptions = nodeData.options || [];
                const buttons = buttonOptions.map((opt, idx) => ({
                    type: 'reply',
                    reply: {
                        id: `option${idx}`,
                        title: (typeof opt === 'string' ? opt : opt.title || opt).slice(0, 20)
                    }
                }));

                const messageData = {
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: node_message },
                        action: { buttons: buttons }
                    }
                };

                if (nodeData.med_id) {
                    messageData.interactive['header'] = {
                        type: 'image',
                        image: { id: nodeData.med_id }
                    };
                }

                await sendMessage(userPhoneNumber, business_phone_number_id, messageData, accessToken, userSession.tenant);
            }
            else if (optionType === "Lists") {
                const listOptions = nodeData.options || [];
                const rows = listOptions.map((opt, idx) => {
                    if (typeof opt === 'string') {
                        return { id: `option${idx}`, title: opt.slice(0, 24) };
                    } else {
                        return {
                            id: `option${idx}`,
                            title: (opt.title || opt).slice(0, 24),
                            ...(opt.description && { description: opt.description.slice(0, 72) })
                        };
                    }
                });

                const messageData = {
                    type: "interactive",
                    interactive: {
                        type: "list",
                        body: { text: node_message },
                        action: {
                            button: nodeData.listTitle || "Choose Option",
                            sections: [{ title: "Options", rows }]
                        }
                    }
                };

                await sendMessage(userPhoneNumber, business_phone_number_id, messageData, accessToken, userSession.tenant);
            }
            else if (optionType === "Text") {
                const messageData = {
                    type: "text",
                    text: { body: node_message }
                };

                if (nodeData.med_id) {
                    await sendImageMessage(userPhoneNumber, business_phone_number_id, nodeData.med_id, node_message, accessToken);
                } else {
                    await sendMessage(userPhoneNumber, business_phone_number_id, messageData, accessToken, userSession.tenant);
                }
            }
            break;

        case "sendMessage":
            const messageType = nodeData.fields?.type || nodeData.type || "text";
            const content = nodeData.fields?.content || nodeData.content || {};

            if (messageType === "text") {
                node_message = await replacePlaceholders(content.text || node_message, userSession);
                await sendTextMessage(userPhoneNumber, business_phone_number_id, node_message, accessToken, userSession.tenant);

                // Auto-advance
                if (nextNode.length > 0) {
                    userSession.currNode = nextNode[0];
                    sendNodeMessage(userPhoneNumber, business_phone_number_id);
                }
            }
            else if (messageType === "Image") {
                let caption = content.caption || "";
                caption = await replacePlaceholders(caption, userSession);
                await sendImageMessage(userPhoneNumber, business_phone_number_id, content.med_id, caption, accessToken);

                if (nextNode.length > 0) {
                    userSession.currNode = nextNode[0];
                    sendNodeMessage(userPhoneNumber, business_phone_number_id);
                }
            }
            break;

        default:
            console.log(`V2 node type "${nodeType}" not yet fully implemented, falling back to basic handling`);
            if (nextNode.length > 0) {
                userSession.currNode = nextNode[0];
                sendNodeMessage(userPhoneNumber, business_phone_number_id);
            }
    }

    userSession.nextNode = nextNode;
}

// Legacy Node Processing
async function processNodeLegacy(userSession, userPhoneNumber, business_phone_number_id) {
    const { flowData, adjList, currNode, accessToken } = userSession;
    const flow = flowData;
    const adjListParsed = adjList;

    if (!adjListParsed) {
        console.error("No adjacency list found for legacy flow");
        return;
    }

    if (typeof currNode !== undefined && currNode !== null) {
        const nextNode = adjListParsed[currNode];
        let node_message = flow[currNode]?.body;
        console.log("flowlfolwolfowl: ", flow[currNode])

        switch (flow[currNode]?.type) {
            case "Button":
                const buttons = nextNode
                node_message = await replacePlaceholders(node_message, userSession)

                var variable = flow[currNode]?.variable
                if (variable) {
                    userSession.inputVariable = variable
                }

                let mediaID = flow[currNode]?.mediaID
                console.log("Information for buttons: ", buttons, node_message)
                await sendButtonMessage(buttons, node_message, userPhoneNumber, business_phone_number_id, mediaID);
                break;

            case "List":
                const list = nextNode
                node_message = await replacePlaceholders(node_message, userSession)


                var variable = flow[currNode]?.variable
                if (variable) {
                    userSession.inputVariable = variable
                }
                let listTitle = flow[currNode]?.listTitle
                await sendListMessage(list, node_message, listTitle, userPhoneNumber, business_phone_number_id, accessToken);
                break;

            case "Text":
                node_message = await replacePlaceholders(node_message, userSession)


                var variable = flow[currNode]?.variable
                if (variable) {
                    userSession.inputVariable = variable
                }

                if (flow[currNode]?.mediaID)
                    await sendImageMessage(userPhoneNumber, business_phone_number_id, flow[currNode]?.mediaID, node_message, accessToken);
                else
                    await sendInputMessage(userPhoneNumber, business_phone_number_id, node_message);

                // userSession.currNode = nextNode[0] !==undefined ? nextNode[0] : null;

                break;

            case "string":

                node_message = await replacePlaceholders(node_message, userSession)

                await sendTextMessage(userPhoneNumber, business_phone_number_id, node_message, userSession.accessToken, userSession.tenant);
                // console.log(nextNode[0])
                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;
                console.log("string currNode: ", userSession.currNode)

                if (userSession.currNode != null) {
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    sendNodeMessage(userPhoneNumber, business_phone_number_id)
                }
                break;

            case "image":
                var caption = flow[currNode]?.body?.caption

                if (caption) caption = await replacePlaceholders(caption, userSession)

                await sendImageMessage(userPhoneNumber, business_phone_number_id, flow[currNode]?.body?.id, caption, accessToken);
                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;
                console.log("image currNode: ", userSession.currNode)
                if (userSession.currNode != null) {
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    sendNodeMessage(userPhoneNumber, business_phone_number_id)
                }
                break;

            case "audio":
                const audioID = flow[currNode]?.body?.audioID

                var caption = flow[currNode]?.body?.caption
                if (caption) caption = await replacePlaceholders(caption, userSession)


                await sendAudioMessage(userPhoneNumber, business_phone_number_id, audioID, caption, accessToken);
                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;
                console.log("audio currNode: ", userSession.currNode)
                if (userSession.currNode != null) {
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    sendNodeMessage(userPhoneNumber, business_phone_number_id)
                }
                break;

            case "video":

                var caption = flow[currNode]?.body?.caption
                if (caption) caption = await replacePlaceholders(caption, userSession)

                await sendVideoMessage(userPhoneNumber, business_phone_number_id, flow[currNode]?.body?.videoID, accessToken, userSession?.tenant, caption);
                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;
                console.log("video currNode: ", userSession.currNode)
                if (userSession.currNode != null) {
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    sendNodeMessage(userPhoneNumber, business_phone_number_id)
                }
                break;

            case "location":
                node_message = await replacePlaceholders(node_message, userSession)

                sendLocationMessage(userPhoneNumber, business_phone_number_id, flow[currNode]?.body, accessToken)
                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;
                console.log("image currNode: ", userSession.currNode)
                if (userSession.currNode != null) {
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    sendNodeMessage(userPhoneNumber, business_phone_number_id)
                }
                break;

            case "AI":
                console.log("AI Node")
                if (node_message) {
                    node_message = await replacePlaceholders(node_message, userSession)
                    await sendTextMessage(userPhoneNumber, business_phone_number_id, node_message);
                }
                userSession.AIModePrompt = flow[currNode]?.prompt;
                userSession.AIMode = true;
                break;

            case "api":
                const api = flow[currNode]?.api
                const method = api?.method

                let headers = api?.headers
                if (headers) headers = JSON.parse(headers)
                console.log("Type of headers: ", typeof (headers))
                const url = api?.endpoint

                if (method == "GET") {
                    const variable_name = api?.variable
                    console.log("Variable Name: ", variable_name)
                    const response = await axios.get(url, { headers: headers })
                    console.log("Received Response from GET req: ", response.data)
                    userSession.api.GET[`${variable_name}`] = response.data
                    console.log("User Session after GET: ", userSession)
                }
                else if (method == 'POST') {
                    console.log("Entering API-POST")
                    const variables = api?.variable
                    const variableList = variables?.split(',').map(item => item.trim());
                    console.log("Variables: ", typeof (variableList))

                    const dataToSend = {}

                    for (const variable of variableList) {
                        console.log("Var: ", variable)
                        const value = userSession.api.POST?.[variable]
                        console.log(value)
                        dataToSend[variable] = value
                    }
                    console.log("Data to Send: ", dataToSend)
                    axios.post(url, dataToSend, { headers: head })
                    console.log("Sending POST req with data: ", dataToSend)
                }
                else if (method == "DELETE") {

                }

                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;
                console.log("string currNode: ", userSession.currNode)
                if (userSession.currNode != null) {
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    sendNodeMessage(userPhoneNumber, business_phone_number_id)
                }
                break;

            case "template":
                const templateName = flow[currNode]?.name
                await sendTemplateMessage(templateName, userSession)
                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;
                if (userSession.currNode != null) {
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    sendNodeMessage(userPhoneNumber, business_phone_number_id)
                }
                break;

            case "custom":
                const customCode = flow[currNode]?.customCode
                if (customCode == 1) {
                    const message = userSession?.api?.POST?.text_product
                    await handleTextOrdersForDrishtee(message, userSession)
                }
                else if (customCode == 2) {
                    const mediaID = userSession?.api?.POST?.audio_product
                    await handleAudioOrdersForDrishtee(mediaID, userSession)
                }
                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;

                if (userSession.currNode != null) {
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    sendNodeMessage(userPhoneNumber, business_phone_number_id)
                }
                break;

            case "customint":
                const urltest = `https://nurenaiautomatic-b7hmdnb4fzbpbtbh.canadacentral-01.azurewebsites.net/webhook/${userSession.tenant}`;

                try {
                    const config = {
                        headers: {
                            'Authorization': `Bearer ${userSession.accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    };

                    // Combine both node_message and userSession in the body if needed
                    const requestBody = {
                        node_message,
                        userSession
                    };

                    // First get the response from the custom integration
                    const response = await axios.post(urltest, requestBody, config);
                    console.log("recieved n8n response");

                    // Wait for the message to be sent before proceeding
                    await sendMessage(
                        userSession.userPhoneNumber,
                        userSession.business_phone_number_id,
                        response.data,  // access the actual data
                        userSession.accessToken,
                        userSession.tenant
                    );
                    console.log("Message sent successfully");

                    // Now that message is sent, proceed with next steps
                    userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;

                    // CRITICAL: Save session BEFORE recursive sendNodeMessage call
                    // Otherwise recursive call retrieves old session from storage
                    await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                    console.log(`customint advanced from node to ${userSession.currNode}, session saved`);

                    // Only proceed to the next node if there is one
                    if (userSession.currNode != null) {
                        await sendNodeMessage(userPhoneNumber, business_phone_number_id);
                    }
                } catch (err) {
                    console.error("Error in customint:", err.message);
                }
                break;

            case "flowjson":
                const flowName = flow[currNode]?.flowName
                const flowCta = flow[currNode]?.cta
                const flowHeader = flow[currNode]?.header
                const flowBody = flow[currNode]?.body
                const flowFooter = flow[currNode]?.footer
                await sendFlowMessage(userPhoneNumber, business_phone_number_id, flowHeader, flowBody, flowFooter, flowName, flowCta, userSession.accessToken, userSession.tenant)

                // Auto-advance to next node after sending flow (prevents repeat when user replies)
                // But DON'T call sendNodeMessage recursively - wait for user's nfm_reply
                console.log(`📋 FlowJSON sent: ${flowName}, waiting for user response`);
                userSession.currNode = nextNode[0] !== undefined ? nextNode[0] : null;
                userSession.nextNode = nextNode;
                await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
                console.log(`✅ FlowJSON advanced to next node: ${userSession.currNode} (will process after nfm_reply)`);
                break;

            case "button_element":
            case "list_element":
                // These are button/list OPTIONS, not actual nodes to display
                // They should have already been handled by userWebhook.js
                // If we're here, something went wrong - just log and skip
                console.warn(`⚠️ WARNING: Reached button_element node ${currNode} in sendNodeMessage - should have been handled earlier`);
                console.warn(`⚠️ This indicates the button advancement in userWebhook.js didn't work correctly`);
                // Don't call sendNodeMessage recursively here - it creates loops
                break;

            default:
                console.log(`Unknown node type: ${flow[currNode]?.type}`);
        }

        userSession.nextNode = nextNode;
        await userSessions.set(userPhoneNumber + business_phone_number_id, userSession);
        console.log("Updated Current Node: ", userSession.currNode);
        // await Promise.all([sendMessagePromise, sendDynamicPromise])
    } else {
        userSession.currNode = userSession.startNode;
        userSession.nextNode = adjListParsed[userSession.currNode] || [];
    }
}
