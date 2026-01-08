// Event types for message tracking
export const EVENT_TYPES = {
  MESSAGE_SENT: 'message.sent',
  MESSAGE_DELIVERED: 'message.delivered',
  MESSAGE_READ: 'message.read',
  MESSAGE_FAILED: 'message.failed',
  MESSAGE_REPLIED: 'message.replied',
  BUTTON_CLICKED: 'button.clicked',
  CONVERSATION_STARTED: 'conversation.started',
  CONVERSATION_ENDED: 'conversation.ended'
};

// Message statuses
export const MESSAGE_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
  REPLIED: 'replied'
};

// Message types
export const MESSAGE_TYPES = {
  TEMPLATE: 'template',
  TEXT: 'text',
  MEDIA: 'media',
  INTERACTIVE: 'interactive',
  DOCUMENT: 'document',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio'
};

// Conversation categories
export const CONVERSATION_CATEGORIES = {
  MARKETING: 'marketing',
  UTILITY: 'utility',
  AUTHENTICATION: 'authentication',
  SERVICE: 'service'
};

// Cost per message by conversation category (in INR)
export const MESSAGE_COSTS = {
  marketing: 0.065,
  utility: 0.035,
  authentication: 0.025,
  service: 0.045
};

// Cache keys
export const CACHE_KEYS = {
  OVERVIEW: (tenantId, startDate, endDate) =>
    `analytics:overview:${tenantId}:${startDate}:${endDate}`,
  TEMPLATE: (tenantId, templateId, startDate, endDate) =>
    `analytics:template:${tenantId}:${templateId}:${startDate}:${endDate}`,
  CAMPAIGN: (tenantId, campaignId) =>
    `analytics:campaign:${tenantId}:${campaignId}`,
  REALTIME: (tenantId) =>
    `analytics:realtime:${tenantId}`,
  TOP_TEMPLATES: (tenantId, startDate, endDate, sortBy) =>
    `analytics:top:${tenantId}:${startDate}:${endDate}:${sortBy}`
};

// Cache TTL (in seconds)
export const CACHE_TTL = {
  OVERVIEW: 300,      // 5 minutes
  TEMPLATE: 300,      // 5 minutes
  CAMPAIGN: 600,      // 10 minutes
  REALTIME: 60,       // 1 minute
  TOP_TEMPLATES: 600  // 10 minutes
};
