import axios from "axios";

import { djangoURL} from "../mainwebhook/snm.js"


export async function getAccessTokenprev(auth_code) {
    const client_id = '1546607802575879'; 
    const client_secret = '1cc11e828571e071c91f56da993bb60b';
    const redirect_uri = 'https://nuren.ai/chatbotredirect/';
  
    // Method 1: Using URLSearchParams (Recommended)
    const params = new URLSearchParams({
        client_id: client_id,
        redirect_uri: redirect_uri,
        client_secret: client_secret,
        code: auth_code
    });
    
    const url = `https://graph.facebook.com/v18.0/oauth/access_token?${params.toString()}`;
    
    console.log('Request URL:', url);
    console.log('Auth code being sent:', auth_code);
  
    try {
        const response = await axios.get(url);
        const data = response.data;
  
        if (response.status === 200) {
            console.log('Access token retrieved successfully');
            return data.access_token;
        } else {
            throw new Error(`Error: ${data.error?.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Failed to retrieve access token:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            url: url
        });
        throw error;
    }
}
export async function getAccessToken(auth_code) {
  const client_id = '1546607802575879'; 
  const client_secret = '1cc11e828571e071c91f56da993bb60b';
  
  const url = "https://graph.facebook.com/v18.0/oauth/access_token";
  
  try {
    console.log('Getting access token with code:', auth_code);
    
    // Don't include redirect_uri - let Facebook use the default
    const response = await axios.post(url, {
      client_id: client_id,
      client_secret: client_secret,
      grant_type: "authorization_code",
      code: auth_code
    }, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    console.log('Access token response:', response.data);
    
    if (response.status === 200 && response.data.access_token) {
      return response.data.access_token;
    } else {
      throw new Error(`Error: ${response.data.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to retrieve access token:', error.response?.data || error.message);
    throw new Error(`Failed to get access token: ${error.response?.data?.error?.message || error.message}`);
  }
}
const DEFAULT_SYSTEM_TOKEN = 'EAAVZBobCt7AcBO8trGDsP8t4bTe2mRA7sNdZCQ346G9ZANwsi4CVdKM5MwYwaPlirOHAcpDQ63LoHxPfx81tN9h2SUIHc1LUeEByCzS8eQGH2J7wwe9tqAxZAdwr4SxkXGku2l7imqWY16qemnlOBrjYH3dMjN4gamsTikIROudOL3ScvBzwkuShhth0rR9P';
export async function getWabaID(userAccessToken) {
    const url = `https://graph.facebook.com/v23.0/debug_token?input_token=${userAccessToken}`;
    
    try {
        const response = await axios.get(url, {
            headers: {
                "Authorization": `Bearer ${DEFAULT_SYSTEM_TOKEN}`, // Using system token for authorization
            },
        });

        if (response.status === 200) {
            const data = response.data;
            
            // Check if the required data structure exists
            if (!data.data || !data.data.granular_scopes) {
                throw new Error('Invalid response structure: missing granular_scopes');
            }

            let waba_id;
            for (const g_scope of data.data.granular_scopes) {
                // Check for both possible scopes that contain WABA ID
                if (g_scope.scope === "whatsapp_business_messaging" || g_scope.scope === "whatsapp_business_management") {
                    if (g_scope.target_ids && g_scope.target_ids.length > 0) {
                        waba_id = g_scope.target_ids[0];
                        break;
                    }
                }
            }
            
            if (waba_id) {
                return waba_id;
            } else {
                throw new Error('No WABA ID found for this access token');
            }
        } else {
            throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        if (error.response) {
            const errorMessage = error.response.data?.error?.message || 'Unknown API error';
            console.error('API Error:', error.response.status, errorMessage);
            throw new Error(`API Error: ${errorMessage}`);
        } else {
            console.error('Failed to retrieve WABA ID:', error.message);
            throw error;
        }
    }
}

export async function getPhoneNumberID(access_token, waba_id) {

    const url = `https://graph.facebook.com/v18.0/${waba_id}/phone_numbers`;
  
    try {
      const response = await axios.get(url, {
        headers: {
          "Authorization": `Bearer ${access_token}`,
        },
      });
  
      if (response.status === 200) {
        const data = response.data;
        console.log("phone numebr id: ", data)
        return data.data[0].id; 
      } else {
        throw new Error(`Error: ${response.data.error.message}`);
      }
    } catch (error) {
      console.error('Failed to retrieve phone number ID:', error);
      throw error;
    }
}

export async function registerAccount(business_phone_number_id, access_token){
  console.log("KHB");
  const url = `https://graph.facebook.com/v19.0/${business_phone_number_id}/register`;
  console.log(url);
  const body = {
    "messaging_product": "whatsapp",
    "pin": "123456"
  };
  console.log("Request Body:", body);

  try {
    const response = await axios.post(url, body, {
      headers: {
        "Authorization": `Bearer ${access_token}`,
      }
    });
    console.log("Response Data:", JSON.stringify(response.data, null, 4)); // Log response data
    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Error: ${response.data.error.message}`);
    }
  } catch (error) {
    console.error('Failed to register account:', error.response ? error.response.data : error.message); // More detailed error logging
    throw error;
  }
}

export async function postRegister(access_token, account_id){
    const url = `https://graph.facebook.com/v19.0/${account_id}/subscribed_apps?access_token=${access_token}`
    
    try{
        const response = await axios.post(url, {
            headers:{
                'Authorization': `Bearer ${access_token}`,
            }
        });
        if (response.status === 200) {
            const data = response.data;
            return response.status
        } else {
            throw new Error(`Error: ${response.data.error.message}`);
        }
    }catch (error) {
        console.error('Failed to retrieve phone number ID:', error);
        throw error;
    }
}

export async function addKey(tenant_id){
  try{
    axios.get(`${djangoURL}/add-key/${tenant_id}`, {
      headers:{
        'X-Tenant-Id': tenant_id,
    }
    })
  }
  catch (error) {
    console.error("Error occured in addKey: ", error)
    throw error
  }
}
