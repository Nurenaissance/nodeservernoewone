import axios from 'axios';
import FormData from 'form-data';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { sendMessage } from '../send-message.js';
import { agent } from '../mainwebhook/userWebhook.js';
import { sendProductMessage } from '../mainwebhook/snm.js';

export const captionLanguage = {
  en: "Scan the QR code to complete your payment for the order. Thank you!",
  mr: "आपला ऑर्डरचा पेमेंट पूर्ण करण्यासाठी QR कोड स्कॅन करा. धन्यवाद!",
  as: "আপোনাৰ অৰ্ডাৰৰ পৰিশোধ সম্পূৰ্ণ কৰিবলৈ QR কোড স্কেন কৰক। ধন্যবাদ!",
  hi: "अपने ऑर्डर के भुगतान के लिए QR कोड स्कैन करें। धन्यवाद!",
  bn: "আপনার অর্ডারের অর্থপ্রদান সম্পূর্ণ করতে QR কোডটি স্ক্যান করুন। ধন্যবাদ!"
};

async function generateBill(products, userSession, fulfilledApiProducts) {
  const language = userSession.language;

  const spreadsheetIds = {
    en: '1EuXHDggvZIVtdfowNJceXIHjJjpKwr1Z-k6fpoo3u_M',
    hi: '1F_nEekNQfxPGkeqzSfQMHjXBF0VOfbfs-1uvN13oj0U',
    bn: '16NK-etS2LsOgQINWCf8HbossHq6-qtrEhspS0uc956c',
    mr: '1egMI_4FUYj8TPypa1F_p-YW13jT2ewFGsxV2RqBU6rg',
  };

  const spreadsheetId = spreadsheetIds[language];
  if (!spreadsheetId) {
    throw new Error(`Invalid language code: ${language}`);
  }

  const auth = new GoogleAuth({
    credentials: JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')),
    scopes: 'https://www.googleapis.com/auth/spreadsheets',
  });

  const range = 'Sheet1!A:E'; // Include column E for UNIT PRICE
  const service = google.sheets({ version: 'v4', auth });

  let rows;
  try {
    const result = await service.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    rows = result.data.values || [];
  } catch (error) {
    console.error('Error retrieving data:', error.message);
    throw error;
  }

  let totalAmount = 0;
  const productList = products.map(product => {
    const productID = product.product_retailer_id;
    const productData = rows.find(row => row[0] === productID);
    if (!productData) return null;

    const productName = productData[3]; // TITLE
    const unitPrice = parseFloat(productData[4]); // UNIT PRICE (col E)

    const apiProduct = fulfilledApiProducts.find(p => p.product_id === productID);
    const fulfilledQuantity = apiProduct?.fulfilled_quantity || 0;

    const productTotal = unitPrice * fulfilledQuantity;
    totalAmount += productTotal;

    return {
      id: productID,
      name: productName,
      quantity: fulfilledQuantity,
      unitPrice: unitPrice.toFixed(2),
    };
  }).filter(item => item !== null);

  totalAmount = Math.ceil(totalAmount).toFixed(2);

  const messages = {
    en: `Thank you for shopping with us! 🙏\n\n💰 *Total Amount:* *₹${totalAmount}*\n\n*Items Purchased:*\n${productList.map(item => `🔹 ${item.name} \n   Quantity: *${item.quantity}*  |  Unit Price: *₹${item.unitPrice}*`).join('\n\n')}\n\nPlease scan the QR code below to complete your payment. 👇`,

    hi: `हमारे स्टोर से खरीदारी करने के लिए धन्यवाद! 🙏\n\n💰 *कुल राशि:* *₹${totalAmount}*\n\n*खरीदी गई वस्तुएं:*\n${productList.map(item => `🔹 ${item.name} \n   मात्रा: *${item.quantity}*  |  यूनिट प्राइस: *₹${item.unitPrice}*`).join('\n\n')}\n\nकृपया भुगतान पूरा करने के लिए नीचे दिए गए QR कोड को स्कैन करें। 👇`,

    bn: `আমাদের স্টোর থেকে কেনাকাটা করার জন্য ধন্যবাদ! 🙏\n\n💰 *মোট পরিমাণ:* *₹${totalAmount}*\n\n*কেনা জিনিসপত্র:*\n${productList.map(item => `🔹 ${item.name} \n   পরিমাণ: *${item.quantity}*  |  একক দাম: *₹${item.unitPrice}*`).join('\n\n')}\n\nঅনুগ্রহ করে পেমেন্ট সম্পূর্ণ করতে নীচের QR কোডটি স্ক্যান করুন। 👇`,

    mr: `आमच्या स्टोअरवरून खरेदी केल्याबद्दल धन्यवाद! 🙏\n\n💰 *एकूण रक्कम:* *₹${totalAmount}*\n\n*खरेदी केलेली वस्तू:* \n${productList.map(item => `🔹 ${item.name} \n   प्रमाण: *${item.quantity}*  |  युनिट किमत: *₹${item.unitPrice}*`).join('\n\n')}\n\nकृपया पेमेंट पूर्ण करण्यासाठी खालील QR कोड स्कॅन करा. 👇`,
  };

  const textMessageData = {
    type: "text",
    text: {
      body: messages[language] || messages.en,
    },
  };

  await sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, textMessageData, userSession.accessToken, userSession.tenant);
}


export async function checkRRPEligibility(userSession) {
  try {
    if (userSession?.isRRPEligible != undefined) return userSession;
    const phone = userSession.userPhoneNumber.slice(2);
    console.log("Checking for phone: ", phone);

    const response = await axios.post(
      'https://masterappapi.drishtee.in/rrp/nuren/checkRRP',
      { 'rrp_phone_no': phone },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log("Response for checking eligibility: ", response.data);

    if (response.data.RRP_id) {
      console.log("Response RRP Id: ", response.data.RRP_id);
      userSession.isRRPEligible = true;
    }
    console.log("User Session for RRP: ", userSession);
  } catch (error) {
    if (error.response) {
      if (error.response.status === 404) {
        userSession.isRRPEligible = false;
        console.error("Error: 404 Not Found - RRP service unavailable for this phone number");
      } else {
        console.error(`Error: ${error.response.status} - ${error.response.data}`);
      }
    } else if (error.request) {
      console.error("Error: No response received from the server", error.request);
    } else {
      console.error("Error: Unexpected issue occurred", error.message);
    }
  }
  return userSession;
}

export async function processOrderForDrishtee(userSession, products) {
  const responseMessage_hi = "धन्यवाद! आपकी प्रतिक्रिया हमें मिल गई है। अब हम आपके ऑर्डर को आगे बढ़ा रहे हैं। हमें फिर से सेवा का मौका दें, यह हमारा सौभाग्य होगा।";
  const responseMessage_en = "Thank you! We've received your response. We're now moving ahead to place your order. Looking forward to serving you again!";
  const responseMessage_bn = "আপনার উত্তর পাওয়া গেছে, ধন্যবাদ! আমরা এখন আপনার অর্ডার প্রসেস করার কাজ এগিয়ে নিচ্ছি। আবার আপনাকে সাহায্য করতে পারলে ভালো লাগবে।";
  const responseMessage_mr = "धन्यवाद! तुमचा प्रतिसाद आम्हाला मिळाला आहे. आता तुमची ऑर्डर पुढे नेण्याची प्रक्रिया सुरू करत आहोत. कृपया पुन्हा भेट द्या, आम्हाला आनंद होईल.";
  let responseMessage = responseMessage_en;

  const language = userSession.language;

  if (language == "mr") responseMessage = responseMessage_mr;
  else if (language == "bn") responseMessage = responseMessage_bn;
  else if (language == "hi") responseMessage = responseMessage_hi;

  const spreadsheetIds = {
    en: '1EuXHDggvZIVtdfowNJceXIHjJjpKwr1Z-k6fpoo3u_M',
    hi: '1F_nEekNQfxPGkeqzSfQMHjXBF0VOfbfs-1uvN13oj0U',
    bn: '16NK-etS2LsOgQINWCf8HbossHq6-qtrEhspS0uc956c',
    mr: '1egMI_4FUYj8TPypa1F_p-YW13jT2ewFGsxV2RqBU6rg',
  };

  const spreadsheetId = spreadsheetIds[language];
  console.log(spreadsheetId)
  if (!spreadsheetId) {
    throw new Error(`Invalid language code: ${language}`);
  }

  const auth = new GoogleAuth({
    credentials: JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')),
    scopes: 'https://www.googleapis.com/auth/spreadsheets',
  });

  const range = 'Sheet1!A:D';

  const service = google.sheets({ version: 'v4', auth });

  let rows;
  try {
    const result = await service.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    rows = result.data.values || [];
  } catch (error) {
    console.error('Error retrieving data:', error.message);
    throw error;
  }

  console.log("Products: ", products);
  const phone = userSession.userPhoneNumber.slice(2);
  const url = "https://masterappapi.drishtee.in/rrp/nuren/savePreOrder";
  const headers = { 'Content-Type': 'application/json' };
  const data = {
    rrp_phone_no: phone,
    products: products.map(product => {
      const productID = product.product_retailer_id
      const productData = rows.find(row => row[0] === productID); // Assuming column A contains the product ID
      const productName = productData[3]
      const regex = /\[(\d+)\s*(?:Units?|यूनिट्स?|युनिट्स?|ইউনিটস?|ইউনিট)?\]/;
      const match = productName.match(regex);
      console.log("Match: ", match)
      let units = 1;
      if (match) {
        units = parseInt(match[1], 10); // Extract the number and convert it to an integer
        console.log("Units: ", units)
      }
      return {
        product_id: product.product_retailer_id,
        product_quantity: product.quantity * units
      }
    })
  };

  let apiResponse;
  try {
    const response = await axios.post(url, data, { headers: headers });
    apiResponse = response.data;
  } catch (error) {
    console.error("Error in processOrderForDrishtee: ", error);
    if (error.response) {
      if (error.response.status === 404) {
        userSession.isRRPEligible = false;
        console.error("Error: 404 Not Found - RRP service unavailable for this phone number");
        const messageData = {
          type: 'text',
          text: {
            body: 'Sorry, our services are not available in your area. Please join our RRP network to avail these services.'
          }
        };
        return sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
      } else {
        console.error(`Error: ${error.response.status} - ${error.response.data}`);
      }
      return;
    }
  }

  // Check if apiResponse is an object with products array
  if (typeof apiResponse === 'object' && apiResponse !== null && Array.isArray(apiResponse.products)) {
    // Generate order status message based on language
    const orderStatusMessages = {
      en: {
        header: "📋 *Order Status Update*",
        fulfilled: "✅ *Fulfilled* - ",
        partial: "⚠️ *Partially Fulfilled* - ",
        outOfStock: "❌ *Out of Stock* - ",
        footer: "Thank you for your order! We'll process the fulfilled items."
      },
      hi: {
        header: "📋 *ऑर्डर स्थिति अपडेट*",
        fulfilled: "✅ *पूर्ण* - ",
        partial: "⚠️ *आंशिक रूप से पूर्ण* - ",
        outOfStock: "❌ *स्टॉक समाप्त* - ",
        footer: "आपके ऑर्डर के लिए धन्यवाद! हम पूर्ण की गई वस्तुओं को प्रोसेस करेंगे।"
      },
      bn: {
        header: "📋 *অর্ডার স্ট্যাটাস আপডেট*",
        fulfilled: "✅ *সম্পূর্ণ* - ",
        partial: "⚠️ *আংশিকভাবে সম্পূর্ণ* - ",
        outOfStock: "❌ *স্টক শেষ* - ",
        footer: "আপনার অর্ডারের জন্য ধন্যবাদ! আমরা সম্পূর্ণ পণ্যগুলি প্রসেস করবো।"
      },
      mr: {
        header: "📋 *ऑर्डर स्थिती अपडेट*",
        fulfilled: "✅ *पूर्ण* - ",
        partial: "⚠️ *अंशतः पूर्ण* - ",
        outOfStock: "❌ *स्टॉक संपला* - ",
        footer: "तुमच्या ऑर्डरसाठी धन्यवाद! आम्ही पूर्ण वस्तू प्रक्रिया करू."
      }
    };

    const messages = orderStatusMessages[language] || orderStatusMessages.en;
    
    // Build the order status message
    let orderStatusText = `${messages.header}\n\n`;
    
    // Process each product in the response
    apiResponse.products.forEach(product => {
      // Find the product name from the spreadsheet data
      const productData = rows.find(row => row[0] === product.product_id);
      const productName = productData ? productData[3] : `Product ${product.product_id}`;
      
      // Clean product name (remove units info if present)
      const cleanProductName = productName.replace(/\[(\d+)\s*(?:Units?|यूनिट्स?|युनिट्स?|ইউনিটস?|ইউনিট)?\]/g, '').trim();
      
      if (product.stock_availability_status === "Available") {
        orderStatusText += `${messages.fulfilled}${cleanProductName}\n`;
        orderStatusText += `   Quantity Fulfilled: ${product.fulfilled_quantity}\n\n`;
      } else if (product.stock_availability_status === "Partial") {
        orderStatusText += `${messages.partial}${cleanProductName}\n`;
        orderStatusText += `   Requested: ${product.requested_quantity}, Fulfilled: ${product.fulfilled_quantity}\n\n`;
      } else if (product.stock_availability_status === "Out of Stock") {
        orderStatusText += `${messages.outOfStock}${cleanProductName}\n`;
        orderStatusText += `   Requested: ${product.requested_quantity}, Fulfilled: 0\n\n`;
      }
    });
    
    orderStatusText += `${messages.footer}`;

    // Send the order status message
    const orderStatusMessageData = {
      type: 'text',
      text: {
        body: orderStatusText
      }
    };

    await sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, orderStatusMessageData, userSession.accessToken, userSession.tenant);

    // Only generate bill and send image if there are fulfilled items
    const hasFulfilledItems = apiResponse.products.some(product => product.fulfilled_quantity > 0);
    
    if (hasFulfilledItems) {
      // Filter products to only include fulfilled items for bill generation
      const fulfilledProducts = products.filter(product => {
        const apiProduct = apiResponse.products.find(p => p.product_id === product.product_retailer_id);
        return apiProduct && apiProduct.fulfilled_quantity > 0;
      }).map(product => {
        const apiProduct = apiResponse.products.find(p => p.product_id === product.product_retailer_id);
        // Update quantity to fulfilled quantity
        return {
          ...product,
          quantity: Math.ceil(apiProduct.fulfilled_quantity / (product.units || 1)) // Adjust for units if needed
        };
      });

      if (fulfilledProducts.length > 0) {
        await generateBill(fulfilledProducts, userSession, apiResponse.products);
        const messageData = {
          type: "image",
          image: {
            id: 707244195615139,
            caption: captionLanguage[userSession.language]
          }
        };
        await sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
      }
    }
  } else {
    // Handle case where apiResponse is a string or doesn't have the expected structure
    console.log("API Response is not in expected format:", apiResponse);
    
    // Send a simple success message
    const messageData = {
      type: 'text',
      text: {
        body: typeof apiResponse === 'string' ? apiResponse : responseMessage
      }
    };
    await sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);

    // Generate bill with original products (fallback behavior)
    await generateBill(products, userSession);
    const imageMessageData = {
      type: "image",
      image: {
        id: 1484796822889951,
        caption: captionLanguage[userSession.language]
      }
    };
    await sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, imageMessageData, userSession.accessToken, userSession.tenant);
  }
}

export async function handleAudioOrdersForDrishtee(mediaID, userSession) {
  try {
    let response = await axios.get(`https://graph.facebook.com/v18.0/${mediaID}`, { headers: { 'Authorization': `Bearer ${userSession.accessToken}` } })
    const mediaURL = response.data.url
    response = await axios.get(mediaURL, { headers: { 'Authorization': `Bearer ${userSession.accessToken}` }, responseType: 'arraybuffer' })
    const audioFile = response.data
    const formData = new FormData();
    formData.append('file', audioFile, 'audio.mp4');// Attach the file stream to FormData

    response = await axios.post(
      'https://www.aptilab.in/api/process/drishtee/product/search/',
      formData,
      {
        headers: { ...formData.getHeaders() }, // Include headers from FormData
        httpsAgent: agent,
      }
    );
    const product_list = response.data.data.data
    console.log("Product List: ", product_list)
    let product_body, fallback_message;
    const language = userSession.language

    if (language == "en") {
      product_body = `Browse through our exclusive collection of products and find what suits your needs best. Shop now and enjoy amazing offers!`
      fallback_message = "Oops! It looks like this item is currently out of stock. Don't worry, we're working hard to restock it soon! In the meantime, feel free to browse similar products or check back later."
    }
    else if (language == "bn") {
      product_body = "আমাদের বিশেষ পণ্যের সংগ্রহ দেখুন এবং আপনার প্রয়োজন অনুযায়ী পছন্দ করুন। এখনই কেনাকাটা করুন এবং চমৎকার অফার উপভোগ করুন!"
      fallback_message = "ওহ! এটা বর্তমানে স্টক আউট রয়েছে। চিন্তা করবেন না, আমরা শীঘ্রই এটি পুনরায় স্টক করব! এর মধ্যে, আপনি অনুরূপ পণ্যগুলি দেখতে পারেন অথবা পরে আবার চেক করতে পারেন।"
    }
    else if (language == "hi") {
      product_body = "हमारे उत्पादों के विशेष संग्रह को ब्राउज़ करें और अपनी आवश्यकताओं के अनुसार सबसे उपयुक्त उत्पाद खोजें। अभी खरीदारी करें और शानदार ऑफ़र्स का आनंद लें!"
      fallback_message = "क्षमा करें! यह उत्पाद वर्तमान में स्टॉक में उपलब्ध नहीं है। कृपया चिंता न करें, इसे शीघ्र ही स्टॉक में लाने के लिए हम प्रयासरत हैं। तब तक, आप समान उत्पाद ब्राउज़ कर सकते हैं या बाद में पुनः जांच सकते हैं।";
    }
    else if (language == "mr") {
      product_body = "आमच्या खास उत्पादनांच्या संग्रहातून ब्राउज करा आणि तुमच्या गरजेनुसार सर्वोत्तम निवडा. आत्ताच खरेदी करा आणि आश्चर्यकारक ऑफर्सचा आनंद घ्या!"
      fallback_message = "ओह! हे सध्या स्टॉकमध्ये नाही. काळजी करू नका, आम्ही लवकरच ते पुन्हा स्टॉक करू! तोपर्यंत, कृपया समान उत्पादने बघा किंवा नंतर पुन्हा तपासा."
    }

    if (Array.isArray(product_list) && product_list.length > 0) {
      const header = "Items"
      const catalog_id = 1822573908147892
      const footer = null
      const section_title = "Items"
      const chunkSize = 30;
      for (let i = 0; i < product_list.length; i += chunkSize) {
        const chunk = product_list.slice(i, i + chunkSize);
        await sendProductMessage(userSession, chunk, catalog_id, header, product_body, footer, section_title, userSession.tenant);
      }
    }
    else {
      const messageData = {
        type: "text",
        text: { body: fallback_message }
      }
      return sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
    }
  } catch (error) {
    console.error("An Error occured in handleAudioForDrishtee: ", error)
  }
}

export async function handleTextOrdersForDrishtee(message, userSession) {
  console.log("Received text message: ", message)

  const formData = new FormData();
  formData.append('query', message);// Attach the file stream to FormData

  const response = await axios.post(
    'https://www.aptilab.in/api/process/drishtee/product/search/',
    formData,
    {
      headers: { ...formData.getHeaders() }, // Include headers from FormData
      httpsAgent: agent,
    }
  );
  console.log("Response: ", response.data)
  const product_list = response.data.data.data
  console.log("Product List: ", product_list, typeof product_list)
  let product_body, fallback_message;
  const language = userSession.language

  if (language == "en") {
    product_body = `Browse through our exclusive collection of products and find what suits your needs best. Shop now and enjoy amazing offers!`
    fallback_message = "Oops! It looks like this item is currently out of stock. Don't worry, we're working hard to restock it soon! In the meantime, feel free to browse similar products or check back later."
  }
  else if (language == "bn") {
    product_body = "আমাদের বিশেষ পণ্যের সংগ্রহ দেখুন এবং আপনার প্রয়োজন অনুযায়ী পছন্দ করুন। এখনই কেনাকাটা করুন এবং চমৎকার অফার উপভোগ করুন!"
    fallback_message = "ওহ! এটা বর্তমানে স্টক আউট রয়েছে। চিন্তা করবেন না, আমরা শীঘ্রই এটি পুনরায় স্টক করব! এর মধ্যে, আপনি অনুরূপ পণ্যগুলি দেখতে পারেন অথবা পরে আবার চেক করতে পারেন।"
  }
  else if (language == "hi") {
    product_body = "हमारे उत्पादों के विशेष संग्रह को ब्राउज़ करें और अपनी आवश्यकताओं के अनुसार सबसे उपयुक्त उत्पाद खोजें। अभी खरीदारी करें और शानदार ऑफ़र्स का आनंद लें!"
    fallback_message = "क्षमा करें! यह उत्पाद वर्तमान में स्टॉक में उपलब्ध नहीं है। कृपया चिंता न करें, इसे शीघ्र ही स्टॉक में लाने के लिए हम प्रयासरत हैं। तब तक, आप समान उत्पाद ब्राउज़ कर सकते हैं या बाद में पुनः जांच सकते हैं।";
  }
  else if (language == "mr") {
    product_body = "आमच्या खास उत्पादनांच्या संग्रहातून ब्राउज करा आणि तुमच्या गरजेनुसार सर्वोत्तम निवडा. आत्ताच खरेदी करा आणि आश्चर्यकारक ऑफर्सचा आनंद घ्या!"
    fallback_message = "ओह! हे सध्या स्टॉकमध्ये नाही. काळजी करू नका, आम्ही लवकरच ते पुन्हा स्टॉक करू! तोपर्यंत, कृपया समान उत्पादने बघा किंवा नंतर पुन्हा तपासा."
  }

  if (Array.isArray(product_list) && product_list.length > 0) {
    const header = "Items"
    const catalog_id = 1822573908147892
    const footer = null
    const section_title = "Items"
    const chunkSize = 30;
    for (let i = 0; i < product_list.length; i += chunkSize) {
      const chunk = product_list.slice(i, i + chunkSize);
      await sendProductMessage(userSession, chunk, catalog_id, header, product_body, footer, section_title, userSession.tenant);
    }
  }
  else {
    const messageData = {
      type: "text",
      text: { body: fallback_message }
    }
    return sendMessage(userSession.userPhoneNumber, userSession.business_phone_number_id, messageData, userSession.accessToken, userSession.tenant);
  }
}
