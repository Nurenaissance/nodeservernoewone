# DEPLOYMENT.md

This guide provides comprehensive instructions for deploying, configuring, and maintaining the WhatsApp Bot Server application.

## 1. Prerequisites

Before setting up the application, ensure you have the following software, services, and accounts:

### Software
- **Node.js**: Version 16.0.0 or higher (as specified in `package.json`).
- **npm**: Comes with Node.js.
- **PM2**: Process manager for Node.js (`npm install pm2 -g`).
- **Git**: For version control.

### Services & Accounts
- **PostgreSQL Database**: Two separate databases are recommended: one for the main application and one for analytics.
- **Redis**: A Redis instance is required for session management, caching, rate limiting, and message queues.
- **Meta for Developers Account**: To create a WhatsApp Business App, get API keys, and configure webhooks.
- **Azure Account**:
    - **Azure Blob Storage**: For storing media files like images and videos.
    - **Azure App Service (or VM)**: For hosting the Node.js application.
    - **Azure Functions (Optional)**: If using the media processor or template status webhooks.
- **Django & FastAPI Services**: This Node.js server is part of a microservices architecture and depends on running instances of the Django and FastAPI backend services.
- **OpenAI Account**: An API key is needed for AI-powered input validation features.
- **Google Cloud Platform Account**: A service account is required for integrations with Google services like Google Sheets.

## 2. Environment Variables

Create a `.env` file in the root directory by copying `.env.example` and fill in the values for your environment.

### Service Authentication
These keys must be identical across the Django, FastAPI, and Node.js services for mutual authentication.

| Variable              | Description                               | Example                                       |
| --------------------- | ----------------------------------------- | --------------------------------------------- |
| `DJANGO_SERVICE_KEY`  | Secret key to validate requests from Django. | `sk_django_...`                               |
| `FASTAPI_SERVICE_KEY` | Secret key to validate requests from FastAPI. | `sk_fastapi_...`                              |
| `NODEJS_SERVICE_KEY`  | Secret key for this service, shared with others. | `sk_nodejs_...`                               |

### JWT Configuration
Must be identical across all services.

| Variable         | Description                                   | Example                                       |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `JWT_SECRET_KEY` | Shared secret for signing and verifying JWTs. | `your-long-random-jwt-secret`                 |
| `JWT_SECRET`     | (Duplicate) Shared secret for JWTs.           | `your-long-random-jwt-secret`                 |

### Server Configuration
| Variable   | Description                        | Default       |
| ---------- | ---------------------------------- | ------------- |
| `PORT`     | The port the application runs on.  | `3000`        |
| `NODE_ENV` | The runtime environment.           | `development` |

### Main Database (PostgreSQL)
| Variable        | Description                            | Example      |
| --------------- | -------------------------------------- | ------------ |
| `DB_HOST`       | Hostname of the main database server.  | `localhost`  |
| `DB_PORT`       | Port of the main database server.      | `5432`       |
| `DB_NAME`       | Name of the main database.             | `whatsapp_bot` |
| `DB_USER`       | Username for the main database.        | `postgres`   |
| `DB_PASSWORD`   | Password for the main database user.   | `db_password` |

### Analytics Database (PostgreSQL)
| Variable              | Description                                  | Example          |
| --------------------- | -------------------------------------------- | ---------------- |
| `ANALYTICS_DB_HOST`     | Hostname of the analytics database server.   | `localhost`      |
| `ANALYTICS_DB_PORT`     | Port of the analytics database server.       | `5432`           |
| `ANALYTICS_DB_NAME`     | Name of the analytics database.              | `analytics`      |
| `ANALYTICS_DB_USER`     | Username for the analytics database.         | `analytics_user` |
| `ANALYTICS_DB_PASSWORD` | Password for the analytics database user.    | `analytics_pass` |

### Redis Configuration
Used for session management, caching, rate limiting, and Bull message queues.

| Variable         | Description                                   | Example     |
| ---------------- | --------------------------------------------- | ----------- |
| `REDIS_URL`      | Full Redis connection URL.                    | `redis://localhost:6379` |
| `REDIS_PASSWORD` | Password for Redis authentication (leave blank if none). | `redis_pass` |

### Service URLs
Endpoints for dependent microservices.

| Variable      | Description                           | Example                  |
| ------------- | ------------------------------------- | ------------------------ |
| `DJANGO_URL`  | Base URL for the Django backend.      | `http://localhost:8000`  |
| `FAST_API_URL`| Base URL for the FastAPI backend.     | `http://localhost:8001`  |
| `NODEJS_URL`  | Publicly accessible URL of this server. | `http://localhost:3000`  |

### WhatsApp / Meta Configuration
| Variable                   | Description                                                                     | Example                             |
| -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `WEBHOOK_VERIFY_TOKEN`     | A secret token you create. Used to verify the webhook URL with Meta.            | `your_webhook_verify_token`         |
| `APP_SECRET`               | The App Secret from your Meta Developer Console. Used for webhook signature validation. | `your_meta_app_secret`              |
| `WHATSAPP_FLOW_PRIVATE_KEY`| The multi-line encrypted private key for decrypting WhatsApp Flow data.         | `"-----BEGIN ... KEY-----..."`      |
| `WHATSAPP_FLOW_PASSPHRASE` | The passphrase for the encrypted private key.                                   | `your_flow_encryption_passphrase`   |

### External Services
| Variable                      | Description                                                  | Example                               |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------- |
| `OPENAI_API_KEY`              | API key for OpenAI services.                                 | `sk-your-openai-api-key`              |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | Base64-encoded JSON of a Google Cloud service account key.   | `base64_encoded_json`                 |

### Azure Configuration
| Variable                        | Description                                                         | Example                               |
| ------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string for Azure Blob Storage.                           | `DefaultEndpointsProtocol=...`        |
| `AZURE_STORAGE_CONTAINER`       | The name of the container in Blob Storage for media uploads.        | `media`                               |
| `AZURE_FUNCTION_MEDIA_PROCESSOR`| URL for an Azure Function that processes media.                     | `https://.../webhook/process-multiple-media` |
| `AZURE_FUNCTION_TEMPLATE_STATUS`| URL for an Azure Function that handles template status updates.     | `https://.../webhook/template_status` |

### Logging & PM2
| Variable               | Description                                           | Example |
| ---------------------- | ----------------------------------------------------- | ------- |
| `LOG_LEVEL`            | The logging verbosity level.                          | `info`  |
| `PM2_INSTANCES`        | Number of worker instances for PM2 to run.            | `2`     |
| `PM2_MAX_MEMORY_RESTART` | Memory threshold for PM2 to restart an instance.      | `500M`  |

### Webhook Simulator (For Testing)
| Variable                  | Description                                                                      | Example                             |
| ------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| `SIMULATOR_WEBHOOK_URL`   | The target URL for the webhook simulator to send test events.                    | `http://localhost:8080/webhook`     |
| `SIMULATOR_PHONE_NUMBER_ID` | Your real WhatsApp Business Phone Number ID from the Meta Business Suite.        | `your_real_phone_number_id`         |
| `TEST_PHONE_NUMBER_ID`    | (Duplicate) Your real WhatsApp Business Phone Number ID.                         | `your_real_phone_number_id`         |
| `SIMULATOR_USER_PHONE`    | A real WhatsApp number (without `+`) for receiving test messages.                | `919876543210`                      |
| `TEST_USER_PHONE`         | (Duplicate) Test user's WhatsApp number.                                         | `919876543210`                      |
| `SIMULATOR_USER_NAME`     | Display name for the test user.                                                  | `Test User`                         |
| `TEST_USER_NAME`          | (Duplicate) Test user's display name.                                            | `Test User`                         |


## 3. Service Dependencies

This application relies on several external and internal services to function correctly.

### Django Backend
The primary backend for core business logic, data persistence, and tenant management.
- **Endpoint**: Configured via `DJANGO_URL` (e.g., `http://localhost:8000`)
- **Key Endpoints Called**:
  - `GET /whatsapp_tenant` - Fetch tenant/flow data (Header: `bpid`)
  - `POST /contacts_by_tenant/` - Create contacts
  - `GET /contacts-by-phone/{phone}` - Fetch contact details
  - `POST /whatsapp_convo_post/{phone}/` - Save conversation history
  - `GET /flows/{id}/` - Fetch flow by ID
  - `POST /query-faiss/` - AI/FAISS queries
  - `POST /individual_message_statistics/` - Save message statistics

### FastAPI Backend
A secondary backend service for performance-critical tasks.
- **Endpoint**: Configured via `FAST_API_URL` (e.g., `http://localhost:8001`)
- **Key Endpoints Called**:
  - `GET /whatsapp_tenant` - Fetch tenant data (fallback/primary)
  - `POST /set-status/` - Update message status
  - `POST /notifications` - Send notifications
  - `GET /prompt/fetch/` - Fetch AI prompts
  - `POST /scheduled-events/` - Schedule events

### Redis
Used for several critical functions:
- **Session Management**: Stores user session data for conversations
- **Caching**: Caches frequently accessed data (tenant info, analytics)
- **Message Queues**: Background jobs via BullMQ for campaigns
- **Rate Limiting**: Prevents abuse by limiting request frequency
- **Endpoint**: Configured via `REDIS_URL` and `REDIS_PASSWORD`

### Meta (Facebook) Graph API
The official API for sending and receiving WhatsApp messages.
- Requires valid Access Token per tenant
- Webhook signature validation via `APP_SECRET`


## 4. Local Development Setup

Follow these steps to run the server on your local machine.

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd whatsapp_bot_server_withclaude
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Set Up Environment File
```bash
cp .env.example .env
```

Edit `.env` with your local configuration:
```env
# Local Development Settings
NODE_ENV=development

# Local Service URLs
DJANGO_URL=http://localhost:8000
FAST_API_URL=http://localhost:8001

# Redis (local or Azure)
REDIS_URL=redis://localhost:6379
# REDIS_PASSWORD=  # Leave empty for local Redis without auth

# Or use Azure Redis
# REDIS_URL=redis://your-redis.redis.cache.windows.net:6379
# REDIS_PASSWORD=your-azure-redis-password
```

### Step 4: Start Dependent Services
Ensure these are running:
- PostgreSQL database
- Redis server
- Django backend on port 8000
- FastAPI backend on port 8001

### Step 5: Run the Server
```bash
# Using PM2 (recommended)
pm2 start pm2.config.json
pm2 logs

# Or directly with Node
node server.js
```

### Step 6: Expose Webhook (Optional)
For receiving webhooks from Meta locally:
```bash
ngrok http 3000
```
Use the generated HTTPS URL in Meta Developer Console.


## 5. Production Deployment (Azure)

### Azure App Service Setup

1. **Create Resources**:
   - Azure App Service (Linux, Node.js runtime)
   - Azure Redis Cache
   - Azure Blob Storage (for media)

2. **Configure Environment Variables**:
   In Azure Portal → App Service → Configuration → Application settings:
   ```
   NODE_ENV=production
   DJANGO_URL=https://your-django-backend.azurewebsites.net
   FAST_API_URL=https://your-fastapi-backend.azurewebsites.net
   REDIS_URL=redis://your-redis.redis.cache.windows.net:6379
   REDIS_PASSWORD=your-azure-redis-access-key
   # ... all other required env vars
   ```

3. **Set Startup Command**:
   ```
   npm start
   ```
   This runs `pm2-runtime pm2.config.json` which starts both `server.js` and `queues/worker.js`.

4. **Deploy**:
   - Via GitHub Actions (workflows in `.github/`)
   - Via Azure CLI: `az webapp up`
   - Via VS Code Azure extension

5. **Configure Webhook in Meta Console**:
   - URL: `https://your-app.azurewebsites.net/webhook`
   - Verify Token: Same as `WEBHOOK_VERIFY_TOKEN` in env


## 6. Configuration Options

### Environment-Based Behavior

| `NODE_ENV` | Redis Caching | Bull Queues | Rate Limiting |
|------------|---------------|-------------|---------------|
| `development` | Disabled | Disabled | Memory-based |
| `production` | Enabled | Enabled | Redis-based |

### PM2 Configuration (`pm2.config.json`)
```json
{
  "apps": [
    {
      "name": "whatsapp-server",
      "script": "server.js",
      "instances": "max",  // Or specific number
      "max_memory_restart": "500M"
    },
    {
      "name": "queue-worker",
      "script": "queues/worker.js",
      "instances": 1
    }
  ]
}
```

### Rate Limiting (adjust in `middleware/rateLimiter.js`)
- Default: 100 requests per minute per IP
- Webhook: 1000 requests per minute per tenant


## 7. Common Issues & Troubleshooting

### Redis Authentication Errors
**Symptom**: `NOAUTH Authentication required` or `AUTH command failed`

**Solution**:
```env
# Ensure password is set correctly
REDIS_URL=redis://your-host:6379
REDIS_PASSWORD=your-password
```

### Session Initialization Failed
**Symptom**: `Session initialization failed: Session initialization failed: ...` (repeated)

**Causes & Solutions**:
1. **Backend unreachable**: Check `DJANGO_URL` and `FAST_API_URL` are correct
2. **Invalid bpid**: The `business_phone_number_id` doesn't exist in Django
3. **Redis connection failed**: Check Redis connectivity

**Debug**: Look for these log messages:
```
Fast Backend failed: <error details>
Django Backend failed: <error details>
Both Backends failed!!
```

### Webhook Signature Validation Failed
**Symptom**: `Invalid webhook signature` - messages not processed

**Solution**: Ensure `APP_SECRET` matches your Meta Developer Console App Secret

### 429 Too Many Requests
**Symptom**: Requests rejected with 429 status

**Solution**: Wait for rate limit reset, or adjust limits in `middleware/rateLimiter.js`

### Flow Data Missing
**Symptom**: `Flow Data is not present for bpid: <id>`

**Solution**: Ensure the WhatsApp number has a flow configured in Django admin


## 8. Health Checks

### Server Health Endpoint
```bash
curl http://localhost:3000/health
```
**Success Response**:
```json
{"status": "ok", "message": "WhatsApp bot server is healthy."}
```

### Check Redis Connection
Look for in startup logs:
```
✅ Redis: Connected and ready
```

### Check Backend Connectivity
```bash
# Test Django
curl -H "bpid: YOUR_BPID" http://localhost:8000/whatsapp_tenant

# Test FastAPI
curl -H "bpid: YOUR_BPID" http://localhost:8001/whatsapp_tenant
```

### PM2 Status
```bash
pm2 status
pm2 logs whatsapp-server --lines 100
```

### Verify Webhook
In Meta Developer Console, use "Test" button to send a test webhook and check server logs for processing.
