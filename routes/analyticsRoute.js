import express from 'express';
import { query } from '../analytics/db.js';
import { getCachedOrFetch } from '../analytics/cache.js';
import { CACHE_KEYS, CACHE_TTL } from '../analytics/constants.js';
import { trackMessageSend, trackMessageStatus, trackMessageReply, trackButtonClick } from '../analytics/tracker.js';

const router = express.Router();

// ==================== EVENT TRACKING ENDPOINTS ====================

// Track message event
router.post('/track-event', async (req, res) => {
  try {
    const {
      eventType,
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
      conversationCategory,
      cost,
      timestamp
    } = req.body;

    // Validate required fields
    if (!tenantId || !messageId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tenantId, messageId'
      });
    }

    let result;

    switch (eventType) {
      case 'message.sent':
        result = await trackMessageSend({
          tenantId, messageId, templateId, templateName,
          recipientPhone, recipientName, contactId,
          campaignId, broadcastGroupId, messageType,
          conversationCategory, cost, timestamp
        });
        break;

      case 'message.delivered':
      case 'message.read':
      case 'message.failed':
        result = await trackMessageStatus({
          messageId,
          status: eventType.split('.')[1],
          timestamp
        });
        break;

      case 'message.replied':
        result = await trackMessageReply({ messageId, timestamp });
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid event type'
        });
    }

    if (result.success) {
      res.json({
        success: true,
        eventId: result.eventId,
        message: 'Event tracked successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to track event',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Error in track-event endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track event',
      error: error.message
    });
  }
});

// Track button click
router.post('/track-button-click', async (req, res) => {
  try {
    const {
      tenantId,
      messageId,
      buttonId,
      buttonText,
      buttonType,
      buttonIndex,
      recipientPhone,
      timestamp
    } = req.body;

    if (!tenantId || !messageId || !buttonId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const result = await trackButtonClick({
      tenantId, messageId, buttonId, buttonText,
      buttonType, buttonIndex, recipientPhone, timestamp
    });

    if (result.success) {
      res.json({
        success: true,
        clickId: result.clickId,
        message: 'Button click tracked successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to track button click',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Error in track-button-click endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track button click',
      error: error.message
    });
  }
});

// ==================== ANALYTICS RETRIEVAL ENDPOINTS ====================

// Get overview analytics
router.get('/overview', async (req, res) => {
  try {
    const { tenantId, startDate, endDate } = req.query;

    if (!tenantId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameters: tenantId, startDate, endDate'
      });
    }

    const cacheKey = CACHE_KEYS.OVERVIEW(tenantId, startDate, endDate);

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.OVERVIEW, async () => {
      const sql = `
        SELECT
          COUNT(*) as total_sent,
          COUNT(delivered_at) as total_delivered,
          COUNT(read_at) as total_read,
          COUNT(failed_at) as total_failed,
          COUNT(replied_at) as total_replied,
          SUM(cost) as total_cost,
          AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at))) as avg_delivery_time,
          AVG(EXTRACT(EPOCH FROM (read_at - delivered_at))) as avg_read_time,
          AVG(EXTRACT(EPOCH FROM (replied_at - read_at))) as avg_response_time,
          ROUND((COUNT(delivered_at)::DECIMAL / NULLIF(COUNT(*), 0) * 100)::NUMERIC, 2) as delivery_rate,
          ROUND((COUNT(read_at)::DECIMAL / NULLIF(COUNT(delivered_at), 0) * 100)::NUMERIC, 2) as read_rate,
          ROUND((COUNT(replied_at)::DECIMAL / NULLIF(COUNT(read_at), 0) * 100)::NUMERIC, 2) as reply_rate,
          AVG(cost) as avg_cost_per_message
        FROM message_events
        WHERE tenant_id = $1
          AND sent_at >= $2
          AND sent_at <= $3
      `;

      const result = await query(sql, [tenantId, startDate, endDate]);

      // Get button clicks separately
      const clicksSql = `
        SELECT COUNT(*) as total_button_clicks
        FROM button_clicks bc
        JOIN message_events me ON bc.message_id = me.message_id
        WHERE me.tenant_id = $1
          AND bc.clicked_at >= $2
          AND bc.clicked_at <= $3
      `;

      const clicksResult = await query(clicksSql, [tenantId, startDate, endDate]);

      const stats = result.rows[0];
      const totalDelivered = parseInt(stats.total_delivered) || 1;

      return {
        totalSent: parseInt(stats.total_sent) || 0,
        totalDelivered: parseInt(stats.total_delivered) || 0,
        totalRead: parseInt(stats.total_read) || 0,
        totalFailed: parseInt(stats.total_failed) || 0,
        totalReplied: parseInt(stats.total_replied) || 0,
        totalButtonClicks: parseInt(clicksResult.rows[0].total_button_clicks) || 0,
        totalCost: parseFloat(stats.total_cost) || 0,
        deliveryRate: parseFloat(stats.delivery_rate) || 0,
        readRate: parseFloat(stats.read_rate) || 0,
        clickRate: parseFloat(((parseInt(clicksResult.rows[0].total_button_clicks) || 0) / totalDelivered * 100).toFixed(2)),
        replyRate: parseFloat(stats.reply_rate) || 0,
        avgCostPerMessage: parseFloat(stats.avg_cost_per_message) || 0,
        avgDeliveryTime: parseFloat(stats.avg_delivery_time) || 0,
        avgReadTime: parseFloat(stats.avg_read_time) || 0,
        avgResponseTime: parseFloat(stats.avg_response_time) || 0
      };
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching overview analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

// Get template analytics
router.get('/template/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { tenantId, startDate, endDate, granularity = 'daily' } = req.query;

    if (!tenantId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameters'
      });
    }

    const cacheKey = CACHE_KEYS.TEMPLATE(tenantId, templateId, startDate, endDate);

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.TEMPLATE, async () => {
      // Get summary
      const summarySql = `
        SELECT
          template_name,
          SUM(total_sent) as total_sent,
          SUM(total_delivered) as total_delivered,
          SUM(total_read) as total_read,
          SUM(total_failed) as total_failed,
          SUM(total_replied) as total_replied,
          SUM(total_button_clicks) as total_button_clicks,
          SUM(total_cost) as total_cost,
          AVG(delivery_rate) as delivery_rate,
          AVG(read_rate) as read_rate,
          AVG(click_rate) as click_rate,
          AVG(reply_rate) as reply_rate
        FROM template_analytics_daily
        WHERE tenant_id = $1
          AND template_id = $2
          AND date >= $3
          AND date <= $4
        GROUP BY template_name
      `;

      const summaryResult = await query(summarySql, [
        tenantId, templateId, startDate, endDate
      ]);

      // Get daily data
      const dailySql = `
        SELECT
          date,
          total_sent as sent,
          total_delivered as delivered,
          total_read as read,
          total_failed as failed,
          total_replied as replied,
          total_button_clicks as button_clicks,
          total_cost as cost
        FROM template_analytics_daily
        WHERE tenant_id = $1
          AND template_id = $2
          AND date >= $3
          AND date <= $4
        ORDER BY date ASC
      `;

      const dailyResult = await query(dailySql, [
        tenantId, templateId, startDate, endDate
      ]);

      const summary = summaryResult.rows[0] || {};

      return {
        templateId,
        templateName: summary.template_name || 'Unknown',
        summary: {
          totalSent: parseInt(summary.total_sent) || 0,
          totalDelivered: parseInt(summary.total_delivered) || 0,
          totalRead: parseInt(summary.total_read) || 0,
          totalFailed: parseInt(summary.total_failed) || 0,
          totalReplied: parseInt(summary.total_replied) || 0,
          totalButtonClicks: parseInt(summary.total_button_clicks) || 0,
          totalCost: parseFloat(summary.total_cost) || 0,
          deliveryRate: parseFloat(summary.delivery_rate) || 0,
          readRate: parseFloat(summary.read_rate) || 0,
          clickRate: parseFloat(summary.click_rate) || 0,
          replyRate: parseFloat(summary.reply_rate) || 0
        },
        dailyData: dailyResult.rows
      };
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching template analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template analytics',
      error: error.message
    });
  }
});

// Get real-time analytics
router.get('/real-time', async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Missing tenantId parameter'
      });
    }

    const cacheKey = CACHE_KEYS.REALTIME(tenantId);

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.REALTIME, async () => {
      // Current hour stats
      const currentHourSql = `
        SELECT
          total_sent as sent,
          total_delivered as delivered,
          total_read as read,
          total_failed as failed,
          total_replied as replied,
          total_button_clicks as button_clicks,
          total_cost as cost
        FROM hourly_analytics
        WHERE tenant_id = $1
          AND hour_start = DATE_TRUNC('hour', NOW())
      `;

      const currentHourResult = await query(currentHourSql, [tenantId]);

      // Last 24 hours
      const last24HoursSql = `
        SELECT
          hour_start as hour,
          total_sent as sent,
          total_delivered as delivered,
          total_read as read,
          total_failed as failed,
          total_replied as replied,
          total_button_clicks as button_clicks,
          total_cost as cost
        FROM hourly_analytics
        WHERE tenant_id = $1
          AND hour_start >= NOW() - INTERVAL '24 hours'
        ORDER BY hour_start ASC
      `;

      const last24HoursResult = await query(last24HoursSql, [tenantId]);

      return {
        currentHour: currentHourResult.rows[0] || {
          sent: 0, delivered: 0, read: 0, failed: 0,
          replied: 0, button_clicks: 0, cost: 0
        },
        last24Hours: last24HoursResult.rows
      };
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching real-time analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch real-time analytics',
      error: error.message
    });
  }
});

// Get top performing templates
router.get('/top-templates', async (req, res) => {
  try {
    const { tenantId, startDate, endDate, sortBy = 'sent', limit = 10 } = req.query;

    if (!tenantId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameters'
      });
    }

    const cacheKey = CACHE_KEYS.TOP_TEMPLATES(tenantId, startDate, endDate, sortBy);

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.TOP_TEMPLATES, async () => {
      const validSortFields = ['sent', 'delivered', 'read', 'clicks', 'cost'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'sent';

      const sortMapping = {
        sent: 'total_sent',
        delivered: 'total_delivered',
        read: 'total_read',
        clicks: 'total_button_clicks',
        cost: 'total_cost'
      };

      const sql = `
        SELECT
          template_id,
          template_name,
          SUM(total_sent) as total_sent,
          SUM(total_delivered) as total_delivered,
          SUM(total_read) as total_read,
          SUM(total_button_clicks) as total_button_clicks,
          AVG(delivery_rate) as delivery_rate,
          AVG(read_rate) as read_rate,
          AVG(click_rate) as click_rate,
          SUM(total_cost) as total_cost
        FROM template_analytics_daily
        WHERE tenant_id = $1
          AND date >= $2
          AND date <= $3
        GROUP BY template_id, template_name
        ORDER BY ${sortMapping[sortField]} DESC
        LIMIT $4
      `;

      const result = await query(sql, [tenantId, startDate, endDate, limit]);

      return result.rows.map(row => ({
        templateId: row.template_id,
        templateName: row.template_name,
        totalSent: parseInt(row.total_sent) || 0,
        totalDelivered: parseInt(row.total_delivered) || 0,
        totalRead: parseInt(row.total_read) || 0,
        totalButtonClicks: parseInt(row.total_button_clicks) || 0,
        deliveryRate: parseFloat(row.delivery_rate) || 0,
        readRate: parseFloat(row.read_rate) || 0,
        clickRate: parseFloat(row.click_rate) || 0,
        totalCost: parseFloat(row.total_cost) || 0
      }));
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching top templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top templates',
      error: error.message
    });
  }
});

// Get button performance analytics
router.get('/button-performance', async (req, res) => {
  try {
    const { tenantId, startDate, endDate } = req.query;

    if (!tenantId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameters: tenantId, startDate, endDate'
      });
    }

    const cacheKey = CACHE_KEYS.BUTTON_PERFORMANCE || `button_performance_${tenantId}_${startDate}_${endDate}`;

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.OVERVIEW, async () => {
      try {
        // Get button click statistics grouped by button text and type
        const sql = `
          SELECT
            bc.button_text,
            bc.button_type,
            bc.button_index,
            COUNT(*) as total_clicks,
            COUNT(DISTINCT bc.message_id) as unique_messages,
            COUNT(DISTINCT bc.recipient_phone) as unique_recipients
          FROM button_clicks bc
          JOIN message_events me ON bc.message_id = me.message_id
          WHERE me.tenant_id = $1
            AND bc.clicked_at >= $2
            AND bc.clicked_at <= $3
          GROUP BY bc.button_text, bc.button_type, bc.button_index
          ORDER BY total_clicks DESC
        `;

        const result = await query(sql, [tenantId, startDate, endDate]);

        // Transform data for frontend
        const byButton = result.rows.map(row => ({
          buttonText: row.button_text || `Button ${row.button_index}`,
          buttonType: row.button_type,
          buttonIndex: parseInt(row.button_index) || 0,
          totalClicks: parseInt(row.total_clicks) || 0,
          uniqueMessages: parseInt(row.unique_messages) || 0,
          uniqueRecipients: parseInt(row.unique_recipients) || 0
        }));

        // Get overall stats
        const totalClicks = byButton.reduce((sum, btn) => sum + btn.totalClicks, 0);

        return {
          totalClicks,
          byButton,
          summary: {
            totalButtons: byButton.length,
            mostClickedButton: byButton[0]?.buttonText || null,
            mostClickedButtonClicks: byButton[0]?.totalClicks || 0
          }
        };
      } catch (queryError) {
        // If table doesn't exist or query fails, return empty data instead of crashing
        console.warn('Button performance query failed (table may not exist):', queryError.message);
        return {
          totalClicks: 0,
          byButton: [],
          summary: {
            totalButtons: 0,
            mostClickedButton: null,
            mostClickedButtonClicks: 0
          }
        };
      }
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching button performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch button performance',
      error: error.message
    });
  }
});

// Get campaign analytics
router.get('/campaign/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Missing tenantId parameter'
      });
    }

    const cacheKey = CACHE_KEYS.CAMPAIGN(tenantId, campaignId);

    const data = await getCachedOrFetch(cacheKey, CACHE_TTL.CAMPAIGN, async () => {
      const sql = `
        SELECT *
        FROM campaign_analytics
        WHERE tenant_id = $1 AND campaign_id = $2
      `;

      const result = await query(sql, [tenantId, campaignId]);

      if (result.rows.length === 0) {
        return null;
      }

      const campaign = result.rows[0];

      return {
        campaignId: campaign.campaign_id,
        campaignName: campaign.campaign_name,
        status: campaign.status,
        startedAt: campaign.started_at,
        completedAt: campaign.completed_at,
        totalRecipients: parseInt(campaign.total_recipients) || 0,
        uniqueRecipients: parseInt(campaign.unique_recipients) || 0,
        totalSent: parseInt(campaign.total_sent) || 0,
        totalDelivered: parseInt(campaign.total_delivered) || 0,
        totalRead: parseInt(campaign.total_read) || 0,
        totalFailed: parseInt(campaign.total_failed) || 0,
        totalReplied: parseInt(campaign.total_replied) || 0,
        totalButtonClicks: parseInt(campaign.total_button_clicks) || 0,
        totalCost: parseFloat(campaign.total_cost) || 0,
        deliveryRate: parseFloat(campaign.delivery_rate) || 0,
        readRate: parseFloat(campaign.read_rate) || 0,
        clickRate: parseFloat(campaign.click_rate) || 0,
        replyRate: parseFloat(campaign.reply_rate) || 0,
        avgCostPerRecipient: parseFloat(campaign.avg_cost_per_recipient) || 0
      };
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching campaign analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign analytics',
      error: error.message
    });
  }
});

// ==================== LOGS ENDPOINT ====================

// Get message delivery logs
router.get('/logs', async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameter: tenantId'
      });
    }

    const sql = `
      SELECT
        me.template_name,
        me.current_status as status,
        me.recipient_phone as phone_number,
        COALESCE(cc.name, me.recipient_name, 'Unknown') as name,
        me.sent_at as date,
        me.failure_reason as error_code,
        me.delivered_at,
        me.read_at,
        me.failed_at,
        me.replied_at,
        me.message_type,
        me.cost
      FROM message_events me
      LEFT JOIN contacts_contact cc ON cc.phone = me.recipient_phone AND cc.tenant_id = me.tenant_id
      WHERE me.tenant_id = $1
      ORDER BY me.sent_at DESC
      LIMIT 1000
    `;

    const result = await query(sql, [tenantId]);

    // Transform data to match frontend expectations
    const logs = result.rows.map(row => ({
      template_name: row.template_name || 'No Template',
      status: row.status || 'sent',
      phone_number: row.phone_number,
      name: row.name, // Already handled by COALESCE in SQL
      date: row.date,
      error_code: row.error_code,
      delivered_at: row.delivered_at,
      read_at: row.read_at,
      failed_at: row.failed_at,
      replied_at: row.replied_at,
      message_type: row.message_type,
      cost: parseFloat(row.cost) || 0
    }));

    res.json(logs);

  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs',
      error: error.message
    });
  }
});

export default router;
