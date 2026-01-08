# Django Endpoints Required for Analytics Integration

This document lists the Django endpoints that need to be created or updated to support the analytics system. The Node.js server will call these endpoints for additional data enrichment.

## Required Endpoints

### 1. Get Contact Details by Phone Number

**Purpose**: Enrich analytics data with contact names and IDs

**Endpoint**: `GET /api/contacts-by-phone/{phone_number}/`

**Headers**:
- `X-Tenant-Id`: Tenant identifier

**Response**:
```json
[
  {
    "id": 12345,
    "name": "John Doe",
    "phone": "919876543210",
    "tenant_id": "ai"
  }
]
```

**Status**: Already exists (used in webhookRoute.js:575)

---

### 2. Get Template Details

**Purpose**: Fetch template metadata for analytics tracking

**Endpoint**: `GET /api/templates/{template_id}/`

**Headers**:
- `X-Tenant-Id`: Tenant identifier

**Response**:
```json
{
  "id": "123456",
  "name": "welcome_message",
  "category": "MARKETING",
  "language": "en",
  "status": "APPROVED",
  "components": []
}
```

**Status**: **NEEDS TO BE CREATED**

---

### 3. Get Campaign Details

**Purpose**: Fetch campaign information for analytics

**Endpoint**: `GET /api/campaigns/{campaign_id}/`

**Headers**:
- `X-Tenant-Id`: Tenant identifier

**Response**:
```json
{
  "id": "campaign_001",
  "name": "Holiday Sale",
  "status": "active",
  "started_at": "2026-01-01T00:00:00Z",
  "tenant_id": "ai",
  "broadcast_group_id": 5
}
```

**Status**: **NEEDS TO BE CREATED**

---

### 4. Get Broadcast Group Details

**Purpose**: Fetch broadcast group information

**Endpoint**: `GET /api/broadcast-groups/{group_id}/`

**Headers**:
- `X-Tenant-Id`: Tenant identifier

**Response**:
```json
{
  "id": 5,
  "name": "Premium Customers",
  "total_contacts": 1000,
  "tenant_id": "ai"
}
```

**Status**: **NEEDS TO BE CREATED**

---

### 5. Get Tenant WhatsApp Configuration

**Purpose**: Fetch WhatsApp business account details

**Endpoint**: `GET /api/whatsapp_tenant`

**Headers**:
- `X-Tenant-Id`: Tenant identifier
- `bpid`: Business phone number ID

**Response**:
```json
{
  "whatsapp_data": [
    {
      "tenant_id": "ai",
      "business_phone_number_id": "534896646366826",
      "access_token": "EAA...",
      "account_id": "123456789"
    }
  ]
}
```

**Status**: Already exists (used in webhookRoute.js:569 and messageRoute.js:47)

---

## Optional Endpoints (For Enhanced Analytics)

### 6. Update Campaign Status

**Purpose**: Update campaign status when completed

**Endpoint**: `PATCH /api/campaigns/{campaign_id}/`

**Headers**:
- `X-Tenant-Id`: Tenant identifier

**Request Body**:
```json
{
  "status": "completed",
  "completed_at": "2026-01-05T23:59:59Z"
}
```

**Response**:
```json
{
  "id": "campaign_001",
  "status": "completed",
  "completed_at": "2026-01-05T23:59:59Z"
}
```

**Status**: **OPTIONAL - For enhanced campaign tracking**

---

### 7. Get Message Template Analytics Summary

**Purpose**: Django-side analytics summary for templates

**Endpoint**: `GET /api/templates/{template_id}/analytics/`

**Headers**:
- `X-Tenant-Id`: Tenant identifier

**Query Parameters**:
- `start_date`: ISO date string
- `end_date`: ISO date string

**Response**:
```json
{
  "template_id": "123456",
  "template_name": "welcome_message",
  "total_sent": 500,
  "date_range": {
    "start": "2026-01-01",
    "end": "2026-01-31"
  }
}
```

**Status**: **OPTIONAL - Can be handled by Node.js analytics endpoints**

---

## Implementation Priority

### High Priority (Required for Basic Functionality)
1. ✅ Get Contact Details by Phone Number - Already exists
2. ✅ Get Tenant WhatsApp Configuration - Already exists
3. ❌ Get Template Details - **CREATE THIS**
4. ❌ Get Campaign Details - **CREATE THIS**

### Medium Priority (Enhanced Features)
5. ❌ Get Broadcast Group Details - **CREATE THIS**
6. ❌ Update Campaign Status - **CREATE THIS**

### Low Priority (Optional)
7. ❌ Get Message Template Analytics Summary - Optional, can use Node.js endpoints

---

## Django Models Required

You may need to create or update these Django models:

### Template Model
```python
class MessageTemplate(models.Model):
    template_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=50)  # MARKETING, UTILITY, etc.
    language = models.CharField(max_length=10)
    status = models.CharField(max_length=50)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

### Campaign Model
```python
class Campaign(models.Model):
    campaign_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=50)  # active, completed, paused
    started_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    broadcast_group = models.ForeignKey(BroadcastGroup, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

### BroadcastGroup Model
```python
class BroadcastGroup(models.Model):
    name = models.CharField(max_length=255)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    contacts = models.ManyToManyField(Contact)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

---

## Integration Notes

1. **Authentication**: All endpoints should use the same authentication mechanism as existing endpoints (X-Tenant-Id header)

2. **Error Handling**: Return proper HTTP status codes:
   - 200: Success
   - 404: Resource not found
   - 400: Bad request
   - 500: Server error

3. **CORS**: Ensure CORS is configured to allow requests from the Node.js server

4. **Rate Limiting**: Consider implementing rate limiting for these endpoints

---

## Testing

After creating the Django endpoints, test them with:

```bash
# Test Get Template Details
curl -X GET "http://your-django-server/api/templates/123456/" \
  -H "X-Tenant-Id: ai"

# Test Get Campaign Details
curl -X GET "http://your-django-server/api/campaigns/campaign_001/" \
  -H "X-Tenant-Id: ai"

# Test Get Broadcast Group Details
curl -X GET "http://your-django-server/api/broadcast-groups/5/" \
  -H "X-Tenant-Id: ai"
```

---

## Next Steps

1. Create the required Django endpoints listed above
2. Update the Node.js analytics tracker to call these endpoints for data enrichment
3. Test the integration end-to-end
4. Monitor performance and optimize as needed
