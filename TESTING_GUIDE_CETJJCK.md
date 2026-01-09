# Testing Guide for Tenant cetjjck Workflow

## Overview
This guide explains how to test the **interviewdrishtee** workflow for tenant **cetjjck** using the webhook simulator.

## Prerequisites

### 1. Server Must Be Running
Your Node.js server MUST be running before testing:
```bash
# In one terminal, start the server
cd whatsapp_bot_server_withclaude
node server.js
```

### 2. Fixes Applied
Ensure you've applied these critical fixes:
- ✅ **Analytics SSL Fix** - `analytics/db.js` updated
- ✅ **Node Advancement Fix** - `mainwebhook/userWebhook.js` updated
- ✅ **Timezone Fix** - `routes/webhookRoute.js` updated

**⚠️ If you haven't restarted your server after applying fixes, DO IT NOW!**

---

## Running Tests

### Test 1: Text Input Flow (Main Test)
Tests the calibration text input that was stuck at node 0:

```bash
cd whatsapp_bot_server_withclaude
node testing/test-cetjjck-workflow.js text
```

**Expected Results:**
```
✅ handleInput called with value: "Why won't it move"
✅ Valid inputVariable detected: calibration
✅ Advanced from 0 to [next_node] after text input  ← THIS IS THE FIX!
✅ Message sent successfully
✅ No SSL errors for analytics database
```

---

### Test 2: Button Reply Flow
Tests button interactions:

```bash
node testing/test-cetjjck-workflow.js button
```

---

### Test 3: Analytics Database Connection
Verifies analytics tracking works without SSL errors:

```bash
node testing/test-cetjjck-workflow.js analytics
```

**Expected Results:**
```
✅ Analytics database connected
❌ NO "pg_hba.conf entry" or "SSL off" errors
✅ Message tracking successful
```

---

### Test 4: Run All Tests
Runs all tests sequentially:

```bash
node testing/test-cetjjck-workflow.js all
```

---

## What Gets Tested

### Tenant Configuration
- **Tenant ID:** `cetjjck`
- **Phone Number ID:** `679698821892367`
- **Test User:** `919643393874` (Adarsh Sharma)
- **Flow Name:** `interviewdrishtee`

### Test Scenarios

#### 1. **Text Input Node Advancement**
   - **Bug Fixed:** Nodes wouldn't advance from start node with text input
   - **Tests:** Sending text "Why won't it move"
   - **Verifies:** Node advances from 0 to next node

#### 2. **Analytics Database SSL**
   - **Bug Fixed:** "SSL off" errors connecting to Azure PostgreSQL
   - **Tests:** Message tracking after sending text
   - **Verifies:** No pg_hba.conf errors in logs

#### 3. **Timezone Handling**
   - **Bug Fixed:** Naive datetime warnings in Django
   - **Tests:** Message statistics tracking
   - **Verifies:** No RuntimeWarning in Django logs

---

## Interpreting Results

### ✅ Success Indicators

**In your Node.js server logs, you should see:**
```
✅ Webhook signature validated successfully
✅ Valid inputVariable detected: calibration
✅ Advanced from 0 to 1 after text input  ← KEY FIX VERIFICATION
✅ Data sent successfully! Response: { message: 'Success' }
✅ Message sent successfully
✅ Analytics database connected
❌ NO "pg_hba.conf" errors
❌ NO "SSL off" errors
```

**In Django logs (Azure Portal), you should see:**
```
✅ POST /individual_message_statistics/ HTTP/1.1" 200
✅ POST /whatsapp_convo_post/919643393874/ HTTP/1.1" 202
❌ NO RuntimeWarning about naive datetime
```

---

### ❌ Failure Indicators

If you see these errors, the fixes weren't applied correctly:

**Node Not Advancing:**
```
❌ Current Node: 0  | Flow Version: 1
❌ Current Node: 0  | Flow Version: 1  ← STUCK!
```
**Solution:** Restart your Node.js server

**Analytics SSL Errors:**
```
❌ error: no pg_hba.conf entry for host "X.X.X.X", user "nurenai", database "nurenpostgres_Whatsapp", SSL off
```
**Solution:** Restart your Node.js server to apply SSL fix

**Timezone Warnings:**
```
❌ RuntimeWarning: DateTimeField IndividualMessageStatistics.timestamp received a naive datetime
```
**Solution:** Restart your Node.js server to apply timezone fix

---

## Troubleshooting

### Problem: Connection Refused
```
❌ Error: connect ECONNREFUSED
```
**Solution:** Your Node.js server isn't running. Start it first!

### Problem: Session Initialization Failed
```
❌ Session initialization failed
```
**Solution:**
1. Check that phone number ID `679698821892367` exists in Django backend
2. Verify tenant `cetjjck` is configured correctly
3. Check Django logs for errors

### Problem: Still Getting SSL Errors
```
❌ SSL off errors persist
```
**Solution:**
1. Verify `analytics/db.js` line 18-20 has SSL config:
   ```javascript
   ssl: process.env.DB_HOST?.includes('azure.com') || process.env.ANALYTICS_DB_HOST?.includes('azure.com')
     ? { rejectUnauthorized: false }
     : false,
   ```
2. **RESTART YOUR SERVER!** (Most common issue)

### Problem: Node Still Stuck at 0
```
❌ Current Node: 0 not advancing
```
**Solution:**
1. Verify `mainwebhook/userWebhook.js` lines 943-958 have the fix
2. Look for:
   ```javascript
   const isTextInputNode = ['Text', 'string', ...].includes(type);
   const shouldAdvance = userSession.currNode != userSession.startNode || isTextInputNode;
   ```
3. **RESTART YOUR SERVER!**

---

## Manual Testing via WhatsApp

After automated tests pass, you can test via actual WhatsApp:

1. **Open WhatsApp** on your phone
2. **Send a message** to your business number
3. **Send text:** "Why won't it move"
4. **Observe:**
   - Bot should respond with next node message
   - No errors in server logs
   - Analytics tracking works

---

## Next Steps After Testing

Once all tests pass:

### 1. Deploy to Production (if needed)
The fixes are code changes, so you need to deploy:
```bash
# If you made changes, commit and deploy
git add .
git commit -m "Fixed node advancement and analytics SSL"
git push
```

### 2. Monitor Production Logs
After deployment, monitor Azure logs:
- No SSL errors
- No timezone warnings
- Nodes advancing correctly

### 3. Test Other Workflows
Test other tenants' workflows using the same pattern:
```bash
# Copy test script for other tenants
cp testing/test-cetjjck-workflow.js testing/test-[tenant-id]-workflow.js
# Edit with new tenant's phone number ID and flow details
```

---

## Summary of Fixes Applied

| Issue | File | Line | Status |
|-------|------|------|--------|
| Analytics SSL | `analytics/db.js` | 18-20 | ✅ Fixed |
| Node Advancement | `mainwebhook/userWebhook.js` | 943-958 | ✅ Fixed |
| Timezone Handling | `routes/webhookRoute.js` | 649, 685, 705 | ✅ Fixed |

---

## Test Results Log

After running tests, document results here:

```
Date: [YYYY-MM-DD]
Tester: [Your Name]

Test 1 - Text Input Flow: ✅ PASS / ❌ FAIL
  - Node advanced from 0 to 1: [ ]
  - Message sent: [ ]
  - No errors: [ ]

Test 2 - Button Reply: ✅ PASS / ❌ FAIL
  - Button processed: [ ]
  - Flow continued: [ ]

Test 3 - Analytics: ✅ PASS / ❌ FAIL
  - No SSL errors: [ ]
  - Tracking works: [ ]

Notes:
[Add any observations or issues]
```

---

## Support

If tests still fail after following this guide:
1. Check all three fix files are correctly updated
2. Restart server (most common solution!)
3. Check Django logs in Azure Portal
4. Verify .env has correct database credentials
5. Test database connectivity directly

---

**Remember:** The #1 most common issue is **forgetting to restart the server** after applying fixes! 🔄
