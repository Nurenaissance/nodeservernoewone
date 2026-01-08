import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Backend URLs
// const FASTAPI_URL = "http://localhost:8001";
// const DJANGO_URL  = "http://127.0.0.1:8000";


const FASTAPI_URL = "https://fastapione-gue2c5ecc9c4b8hy.centralindia-01.azurewebsites.net";
const DJANGO_URL  = "https://backeng4whatsapp-dxbmgpakhzf9bped.centralindia-01.azurewebsites.net";

// Default
axios.defaults.baseURL = FASTAPI_URL;

// Token
const SERVICE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3aGF0c2FwcF9ib3QiLCJ0ZW5hbnRfaWQiOiJhaSIsInJvbGUiOiJzeXN0ZW0iLCJ0aWVyIjoiZW50ZXJwcmlzZSIsInNjb3BlIjoic2VydmljZSIsImV4cCI6MjA1NDk3NDY2OX0.SLXxiBy00-NP9dBVcPl-9b5E0QtakNUajRKAjeXgFG8";

// -------- LOGGER INTERCEPTOR --------
axios.interceptors.request.use((config) => {

  const finalUrl = config.url.startsWith("http")
    ? config.url
    : `${config.baseURL}${config.url}`;

  console.log("\n----- OUTGOING REQUEST -----");
  console.log("URL:", finalUrl);
  console.log("METHOD:", config.method?.toUpperCase());
  console.log("HEADERS SENT:", config.headers);
  console.log("-----------------------------\n");

  return config;
});

// -------- AUTH INTERCEPTOR --------
axios.interceptors.request.use((config) => {
  
  // Auth
  config.headers["Authorization"] = config.headers["Authorization"] || `Bearer ${SERVICE_TOKEN}`;

  // Auto tenant support
  if (globalThis.currentTenant && !config.headers["X-Tenant-Id"]) {
    config.headers["X-Tenant-Id"] = globalThis.currentTenant;
  }

  return config;
});

// Export helpers
export function useFastAPI() {
  axios.defaults.baseURL = FASTAPI_URL;
}

export function useDjango() {
  axios.defaults.baseURL = DJANGO_URL;
}

export default axios;
