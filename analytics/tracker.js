import { query } from './db.js';
import { MESSAGE_STATUS, EVENT_TYPES, MESSAGE_COSTS } from './constants.js';
import { invalidateAnalyticsCache, publishAnalyticsUpdate } from './cache.js';

// Track message send event
export async function trackMessageSend(messageData) {
  const {
    tenantId,
    messageId,
    templateId,
    templateName,
    recipientPhone,
    recipientName,
    contactId,
    campaignId,
    broadcastGroupId,
    messageType,
    conversationCategory = 'marketing',
    cost,
    timestamp
  } = messageData;

  try {
    // Calculate cost if not provided
    const messageCost = cost || MESSAGE_COSTS[conversationCategory] || 0.065;

    const sql = `
      INSERT INTO message_events (
        tenant_id, message_id, template_id, template_name,
        recipient_phone, recipient_name, contact_id,
        campaign_id, broadcast_group_id, message_type,
        conversation_category, cost, current_status, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (message_id) DO UPDATE SET
        sent_at = EXCLUDED.sent_at,
        current_status = EXCLUDED.current_status,
        updated_at = NOW()
      RETURNING id
    `;

    const values = [
      tenantId, messageId, templateId, templateName,
      recipientPhone, recipientName, contactId,
      campaignId, broadcastGroupId, messageType,
      conversationCategory, messageCost, MESSAGE_STATUS.SENT,
      timestamp || new Date()
    ];

    const result = await query(sql, values);

    // Update hourly analytics
    await incrementHourlyAnalytics(tenantId, messageId, 'sent', messageCost);

    // Update campaign analytics if campaignId exists
    if (campaignId) {
      await incrementCampaignMetric(tenantId, campaignId, 'total_sent');
    }

    // Invalidate cache
    await invalidateAnalyticsCache(tenantId, templateId, campaignId);

    console.log(`✅ [Analytics] Message send tracked: ${messageId}`);
    return { success: true, eventId: result.rows[0]?.id };

  } catch (error) {
    console.error('❌ [Analytics] Error tracking message send:', error);
    return { success: false, error: error.message };
  }
}

// Update message event status
export async function updateMessageEvent(messageId, updates) {
  const fields = [];
  const values = [messageId];
  let paramIndex = 2;

  Object.entries(updates).forEach(([key, value]) => {
    fields.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  });

  if (fields.length === 0) return;

  fields.push('updated_at = NOW()');

  const sql = `
    UPDATE message_events
    SET ${fields.join(', ')}
    WHERE message_id = $1
    RETURNING tenant_id, template_id, campaign_id
  `;

  try {
    const result = await query(sql, values);

    if (result.rows.length > 0) {
      const { tenant_id, template_id, campaign_id } = result.rows[0];

      // Invalidate cache
      await invalidateAnalyticsCache(tenant_id, template_id, campaign_id);

      console.log(`✅ [Analytics] Message event updated: ${messageId}`);
    }

    return { success: true };
  } catch (error) {
    console.error('❌ [Analytics] Error updating message event:', error);
    return { success: false, error: error.message };
  }
}

// Track message status from webhook
export async function trackMessageStatus(statusData) {
  const { messageId, status, timestamp, errorReason } = statusData;

  try {
    let statusField = '';
    let statusValue = null;

    switch (status) {
      case 'sent':
        statusField = 'sent_at';
        statusValue = MESSAGE_STATUS.SENT;
        break;
      case 'delivered':
        statusField = 'delivered_at';
        statusValue = MESSAGE_STATUS.DELIVERED;
        break;
      case 'read':
        statusField = 'read_at';
        statusValue = MESSAGE_STATUS.READ;
        break;
      case 'failed':
        statusField = 'failed_at';
        statusValue = MESSAGE_STATUS.FAILED;
        break;
      default:
        console.warn(`⚠️ [Analytics] Unknown status: ${status}`);
        return { success: false, error: 'Unknown status' };
    }

    const updates = {
      [statusField]: timestamp || new Date(),
      current_status: statusValue
    };

    if (status === 'failed' && errorReason) {
      updates.failure_reason = errorReason;
    }

    await updateMessageEvent(messageId, updates);

    // Get tenant info for hourly analytics
    const tenantResult = await query(
      'SELECT tenant_id FROM message_events WHERE message_id = $1',
      [messageId]
    );

    if (tenantResult.rows.length > 0) {
      const tenantId = tenantResult.rows[0].tenant_id;
      await incrementHourlyAnalytics(tenantId, messageId, status, 0);
    }

    return { success: true };

  } catch (error) {
    console.error('❌ [Analytics] Error tracking message status:', error);
    return { success: false, error: error.message };
  }
}

// Track message reply
export async function trackMessageReply(replyData) {
  const { messageId, timestamp } = replyData;

  try {
    await updateMessageEvent(messageId, {
      replied_at: timestamp || new Date(),
      current_status: MESSAGE_STATUS.REPLIED
    });

    // Get tenant info for hourly analytics
    const tenantResult = await query(
      'SELECT tenant_id FROM message_events WHERE message_id = $1',
      [messageId]
    );

    if (tenantResult.rows.length > 0) {
      const tenantId = tenantResult.rows[0].tenant_id;
      await incrementHourlyAnalytics(tenantId, messageId, 'replied', 0);
    }

    console.log(`✅ [Analytics] Message reply tracked: ${messageId}`);
    return { success: true };

  } catch (error) {
    console.error('❌ [Analytics] Error tracking message reply:', error);
    return { success: false, error: error.message };
  }
}

// Track button click
export async function trackButtonClick(buttonData) {
  const {
    tenantId,
    messageId,
    buttonId,
    buttonText,
    buttonType,
    buttonIndex,
    recipientPhone,
    timestamp
  } = buttonData;

  try {
    // Get template_id and campaign_id from message
    const messageResult = await query(
      'SELECT template_id, campaign_id FROM message_events WHERE message_id = $1',
      [messageId]
    );

    let templateId = null;
    let campaignId = null;

    if (messageResult.rows.length > 0) {
      templateId = messageResult.rows[0].template_id;
      campaignId = messageResult.rows[0].campaign_id;
    }

    const sql = `
      INSERT INTO button_clicks (
        tenant_id, message_id, button_id, button_text,
        button_type, button_index, recipient_phone,
        template_id, campaign_id, clicked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const values = [
      tenantId, messageId, buttonId, buttonText,
      buttonType, buttonIndex, recipientPhone,
      templateId, campaignId, timestamp || new Date()
    ];

    const result = await query(sql, values);

    // Update hourly analytics
    await incrementHourlyAnalytics(tenantId, messageId, 'button_click', 0);

    // Invalidate cache
    await invalidateAnalyticsCache(tenantId, templateId, campaignId);

    console.log(`✅ [Analytics] Button click tracked: ${buttonId}`);
    return { success: true, clickId: result.rows[0]?.id };

  } catch (error) {
    console.error('❌ [Analytics] Error tracking button click:', error);
    return { success: false, error: error.message };
  }
}

// Increment hourly analytics
async function incrementHourlyAnalytics(tenantId, messageId, metric, cost = 0) {
  try {
    // Get message sent time
    const messageResult = await query(
      'SELECT sent_at FROM message_events WHERE message_id = $1',
      [messageId]
    );

    if (messageResult.rows.length === 0) {
      console.warn(`⚠️ [Analytics] Message not found for hourly analytics: ${messageId}`);
      return;
    }

    const sentAt = new Date(messageResult.rows[0].sent_at);
    const hourStart = new Date(sentAt);
    hourStart.setMinutes(0, 0, 0);

    const metricColumn = metric === 'button_click' ? 'total_button_clicks' : `total_${metric}`;

    const sql = `
      INSERT INTO hourly_analytics (tenant_id, hour_start, ${metricColumn}, total_cost)
      VALUES ($1, $2, 1, $3)
      ON CONFLICT (tenant_id, hour_start) DO UPDATE SET
        ${metricColumn} = hourly_analytics.${metricColumn} + 1,
        ${metric === 'sent' ? 'total_cost = hourly_analytics.total_cost + EXCLUDED.total_cost,' : ''}
        updated_at = NOW()
    `;

    await query(sql, [tenantId, hourStart, cost || 0]);

  } catch (error) {
    console.error('❌ [Analytics] Error updating hourly analytics:', error);
  }
}

// Increment campaign metric
async function incrementCampaignMetric(tenantId, campaignId, metric) {
  try {
    const sql = `
      INSERT INTO campaign_analytics (tenant_id, campaign_id, ${metric}, status)
      VALUES ($1, $2, 1, 'active')
      ON CONFLICT (tenant_id, campaign_id) DO UPDATE SET
        ${metric} = campaign_analytics.${metric} + 1,
        updated_at = NOW()
    `;

    await query(sql, [tenantId, campaignId]);

  } catch (error) {
    // If unique constraint doesn't exist on (tenant_id, campaign_id), just update
    try {
      const updateSql = `
        UPDATE campaign_analytics
        SET ${metric} = ${metric} + 1, updated_at = NOW()
        WHERE tenant_id = $1 AND campaign_id = $2
      `;
      await query(updateSql, [tenantId, campaignId]);
    } catch (updateError) {
      console.error('❌ [Analytics] Error updating campaign metric:', updateError);
    }
  }
}
