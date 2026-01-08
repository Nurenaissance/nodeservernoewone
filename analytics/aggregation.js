import { query } from './db.js';
import cron from 'node-cron';

// Aggregate daily analytics for all templates
export async function aggregateDailyAnalytics(date) {
  const dateStr = date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  console.log(`📊 [Aggregation] Starting daily aggregation for ${dateStr}`);

  try {
    const sql = `
      INSERT INTO template_analytics_daily (
        tenant_id, template_id, template_name, date,
        total_sent, total_delivered, total_read, total_failed, total_replied,
        total_button_clicks, avg_delivery_time, avg_read_time, avg_response_time,
        total_cost, avg_cost_per_message,
        delivery_rate, read_rate, click_rate, reply_rate
      )
      SELECT
        me.tenant_id,
        me.template_id,
        me.template_name,
        DATE(me.sent_at) as date,
        COUNT(*) as total_sent,
        COUNT(me.delivered_at) as total_delivered,
        COUNT(me.read_at) as total_read,
        COUNT(me.failed_at) as total_failed,
        COUNT(me.replied_at) as total_replied,
        COALESCE(SUM(bc.click_count), 0) as total_button_clicks,
        AVG(EXTRACT(EPOCH FROM (me.delivered_at - me.sent_at))) as avg_delivery_time,
        AVG(EXTRACT(EPOCH FROM (me.read_at - me.delivered_at))) as avg_read_time,
        AVG(EXTRACT(EPOCH FROM (me.replied_at - me.read_at))) as avg_response_time,
        SUM(me.cost) as total_cost,
        AVG(me.cost) as avg_cost_per_message,
        ROUND((COUNT(me.delivered_at)::DECIMAL / NULLIF(COUNT(*), 0) * 100)::NUMERIC, 2) as delivery_rate,
        ROUND((COUNT(me.read_at)::DECIMAL / NULLIF(COUNT(me.delivered_at), 0) * 100)::NUMERIC, 2) as read_rate,
        ROUND((COALESCE(SUM(bc.click_count), 0)::DECIMAL / NULLIF(COUNT(me.delivered_at), 0) * 100)::NUMERIC, 2) as click_rate,
        ROUND((COUNT(me.replied_at)::DECIMAL / NULLIF(COUNT(me.read_at), 0) * 100)::NUMERIC, 2) as reply_rate
      FROM message_events me
      LEFT JOIN (
        SELECT message_id, COUNT(*) as click_count
        FROM button_clicks
        WHERE DATE(clicked_at) = $1
        GROUP BY message_id
      ) bc ON me.message_id = bc.message_id
      WHERE DATE(me.sent_at) = $1
        AND me.template_id IS NOT NULL
      GROUP BY me.tenant_id, me.template_id, me.template_name, DATE(me.sent_at)
      ON CONFLICT (tenant_id, template_id, date) DO UPDATE SET
        total_sent = EXCLUDED.total_sent,
        total_delivered = EXCLUDED.total_delivered,
        total_read = EXCLUDED.total_read,
        total_failed = EXCLUDED.total_failed,
        total_replied = EXCLUDED.total_replied,
        total_button_clicks = EXCLUDED.total_button_clicks,
        avg_delivery_time = EXCLUDED.avg_delivery_time,
        avg_read_time = EXCLUDED.avg_read_time,
        avg_response_time = EXCLUDED.avg_response_time,
        total_cost = EXCLUDED.total_cost,
        avg_cost_per_message = EXCLUDED.avg_cost_per_message,
        delivery_rate = EXCLUDED.delivery_rate,
        read_rate = EXCLUDED.read_rate,
        click_rate = EXCLUDED.click_rate,
        reply_rate = EXCLUDED.reply_rate,
        updated_at = NOW()
    `;

    const result = await query(sql, [dateStr]);
    console.log(`✅ [Aggregation] Daily aggregation completed for ${dateStr}: ${result.rowCount} templates`);
    return { success: true, count: result.rowCount };

  } catch (error) {
    console.error('❌ [Aggregation] Error in daily aggregation:', error);
    return { success: false, error: error.message };
  }
}

// Aggregate hourly analytics
export async function aggregateHourlyAnalytics() {
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);
  hourStart.setHours(hourStart.getHours() - 1); // Previous hour

  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hourEnd.getHours() + 1);

  console.log(`📊 [Aggregation] Starting hourly aggregation for ${hourStart.toISOString()}`);

  try {
    const sql = `
      INSERT INTO hourly_analytics (
        tenant_id, hour_start,
        total_sent, total_delivered, total_read, total_failed, total_replied,
        total_button_clicks, total_cost
      )
      SELECT
        me.tenant_id,
        DATE_TRUNC('hour', me.sent_at) as hour_start,
        COUNT(*) as total_sent,
        COUNT(me.delivered_at) as total_delivered,
        COUNT(me.read_at) as total_read,
        COUNT(me.failed_at) as total_failed,
        COUNT(me.replied_at) as total_replied,
        COALESCE(SUM(bc.click_count), 0) as total_button_clicks,
        SUM(me.cost) as total_cost
      FROM message_events me
      LEFT JOIN (
        SELECT message_id, COUNT(*) as click_count
        FROM button_clicks
        WHERE clicked_at >= $1 AND clicked_at < $2
        GROUP BY message_id
      ) bc ON me.message_id = bc.message_id
      WHERE me.sent_at >= $1 AND me.sent_at < $2
      GROUP BY me.tenant_id, DATE_TRUNC('hour', me.sent_at)
      ON CONFLICT (tenant_id, hour_start) DO UPDATE SET
        total_sent = EXCLUDED.total_sent,
        total_delivered = EXCLUDED.total_delivered,
        total_read = EXCLUDED.total_read,
        total_failed = EXCLUDED.total_failed,
        total_replied = EXCLUDED.total_replied,
        total_button_clicks = EXCLUDED.total_button_clicks,
        total_cost = EXCLUDED.total_cost,
        updated_at = NOW()
    `;

    const result = await query(sql, [hourStart, hourEnd]);
    console.log(`✅ [Aggregation] Hourly aggregation completed for ${hourStart.toISOString()}`);
    return { success: true, count: result.rowCount };

  } catch (error) {
    console.error('❌ [Aggregation] Error in hourly aggregation:', error);
    return { success: false, error: error.message };
  }
}

// Update campaign analytics
export async function updateCampaignAnalytics(campaignId) {
  console.log(`📊 [Aggregation] Updating campaign analytics for ${campaignId}`);

  try {
    const sql = `
      INSERT INTO campaign_analytics (
        tenant_id, campaign_id,
        total_sent, total_delivered, total_read, total_failed, total_replied,
        total_button_clicks, total_cost, unique_recipients,
        delivery_rate, read_rate, click_rate, reply_rate, avg_cost_per_recipient
      )
      SELECT
        me.tenant_id,
        me.campaign_id,
        COUNT(*) as total_sent,
        COUNT(me.delivered_at) as total_delivered,
        COUNT(me.read_at) as total_read,
        COUNT(me.failed_at) as total_failed,
        COUNT(me.replied_at) as total_replied,
        COALESCE(SUM(bc.click_count), 0) as total_button_clicks,
        SUM(me.cost) as total_cost,
        COUNT(DISTINCT me.recipient_phone) as unique_recipients,
        ROUND((COUNT(me.delivered_at)::DECIMAL / NULLIF(COUNT(*), 0) * 100)::NUMERIC, 2) as delivery_rate,
        ROUND((COUNT(me.read_at)::DECIMAL / NULLIF(COUNT(me.delivered_at), 0) * 100)::NUMERIC, 2) as read_rate,
        ROUND((COALESCE(SUM(bc.click_count), 0)::DECIMAL / NULLIF(COUNT(me.delivered_at), 0) * 100)::NUMERIC, 2) as click_rate,
        ROUND((COUNT(me.replied_at)::DECIMAL / NULLIF(COUNT(me.read_at), 0) * 100)::NUMERIC, 2) as reply_rate,
        ROUND((SUM(me.cost)::DECIMAL / NULLIF(COUNT(DISTINCT me.recipient_phone), 0))::NUMERIC, 4) as avg_cost_per_recipient
      FROM message_events me
      LEFT JOIN (
        SELECT message_id, COUNT(*) as click_count
        FROM button_clicks
        GROUP BY message_id
      ) bc ON me.message_id = bc.message_id
      WHERE me.campaign_id = $1
      GROUP BY me.tenant_id, me.campaign_id
      ON CONFLICT (campaign_id) DO UPDATE SET
        total_sent = EXCLUDED.total_sent,
        total_delivered = EXCLUDED.total_delivered,
        total_read = EXCLUDED.total_read,
        total_failed = EXCLUDED.total_failed,
        total_replied = EXCLUDED.total_replied,
        total_button_clicks = EXCLUDED.total_button_clicks,
        total_cost = EXCLUDED.total_cost,
        unique_recipients = EXCLUDED.unique_recipients,
        delivery_rate = EXCLUDED.delivery_rate,
        read_rate = EXCLUDED.read_rate,
        click_rate = EXCLUDED.click_rate,
        reply_rate = EXCLUDED.reply_rate,
        avg_cost_per_recipient = EXCLUDED.avg_cost_per_recipient,
        updated_at = NOW()
    `;

    const result = await query(sql, [campaignId]);
    console.log(`✅ [Aggregation] Campaign analytics updated for ${campaignId}`);
    return { success: true };

  } catch (error) {
    console.error('❌ [Aggregation] Error updating campaign analytics:', error);
    return { success: false, error: error.message };
  }
}

// Setup cron jobs
export function setupAggregationJobs() {
  console.log('⏰ [Aggregation] Setting up cron jobs...');

  // Daily aggregation - runs at 00:05 every day
  cron.schedule('5 0 * * *', async () => {
    console.log('⏰ [Cron] Running daily analytics aggregation...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await aggregateDailyAnalytics(yesterday);
  });

  // Hourly aggregation - runs every hour at :02
  cron.schedule('2 * * * *', async () => {
    console.log('⏰ [Cron] Running hourly analytics aggregation...');
    await aggregateHourlyAnalytics();
  });

  console.log('✅ [Aggregation] Cron jobs set up successfully');
}
