import Queue from 'bull';
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url';
import { createClient } from 'redis';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

// ============================================================================
// BULL MESSAGE QUEUE (Optional - only for production with Redis)
// ============================================================================

let messageQueue = null;

// Only initialize messageQueue if Redis is properly configured
if (process.env.REDIS_PASSWORD && process.env.NODE_ENV === 'production') {
  console.log('🔄 Initializing Bull Message Queue with Redis...');

  messageQueue = new Queue('messageQueue', {
    redis: {
      host: 'whatsappnuren.redis.cache.windows.net',
      port: 6379,
      password: process.env.REDIS_PASSWORD
    },
  });

  messageQueue.on('error', (err) => {
    console.error('❌ Redis connection error in Message Queue:', err);
  });

  messageQueue.on('completed', (job, result) => {
    console.log(`✅ Job completed with result: ${result}`);
  });

  messageQueue.on('failed', (job, err) => {
    console.error(`❌ Job ${JSON.stringify(job, null, 5)} failed with error: ${err}`);
  });

  messageQueue.on('waiting', (jobId) => {
    console.log(`⏳ Job waiting to be processed: ${jobId}`);
  });

  messageQueue.on('active', (job) => {
    console.log(`🔄 Job ${job.id} is now active and being processed.`);
  });

  messageQueue.on('stalled', (job) => {
    console.log(`⚠️  Job ${job.id} has stalled.`);
  });

  messageQueue.on('progress', (job, progress) => {
    console.log(`📊 Job ${job.id} progress: ${progress}%`);
  });

  messageQueue.on('removed', (job) => {
    console.log(`🗑️  Job ${job.id} has been removed from the queue.`);
  });

  messageQueue.on('paused', () => {
    console.log('⏸️  Queue processing has been paused.');
  });

  messageQueue.on('resumed', () => {
    console.log('▶️  Queue processing has been resumed.');
  });

  messageQueue.on('cleaned', (jobs, type) => {
    console.log(`🧹 Cleaned ${type} jobs:`, jobs);
  });

  messageQueue.on('drained', () => {
    console.log('📭 The queue has been drained and is empty.');
  });

  console.log('✅ Bull Message Queue initialized');
} else {
  console.log('⚠️  Bull Message Queue disabled (Redis not configured - using local development mode)');
}

export { messageQueue };

// ============================================================================
// REDIS CLIENT FOR CAMPAIGN SESSIONS (Optional - only for production)
// ============================================================================

let client = null;

// Only initialize Redis client if Redis is properly configured
if (process.env.REDIS_PASSWORD && process.env.NODE_ENV === 'production') {
  console.log('🔄 Initializing Redis client for campaign sessions...');

  client = createClient({
    url: 'redis://whatsappnuren.redis.cache.windows.net:6379',
    password: process.env.REDIS_PASSWORD,
  });

  client.on('error', (err) => console.error('❌ Redis Client Error (Campaign):', err));

  // Connect to Redis
  await client.connect();
  console.log('✅ Redis client for campaign sessions connected');
} else {
  console.log('⚠️  Redis client for campaign sessions disabled (using local development mode)');
}

export { client };

// ============================================================================
// REDIS HELPER FUNCTIONS (Safe fallbacks for local development)
// ============================================================================

/**
 * Get a user session from Redis by key
 * @param {string} key - The Redis key
 * @returns {Promise<any>} - Parsed session data or null if the key doesn't exist
 */
export async function getCampaignUserSession(key) {
  if (!client) {
    console.warn('⚠️  Redis not available - getCampaignUserSession called in local mode');
    const { bpid, phone } = key.split('_');
    return {
      bpid: bpid || 'default',
      phone: phone || 'unknown',
    };
  }

  try {
    const { bpid, phone } = key.split('_');
    const defaultValue = {
      bpid: bpid,
      phone: phone,
    };
    const result = await client.get(key);

    if (result) {
      return JSON.parse(result);
    }

    await setCampaignUserSession(key, defaultValue);
    return defaultValue;
  } catch (err) {
    console.error('❌ Error getting or creating campaign user session:', err);
    throw err;
  }
}

/**
 * Set a user session in Redis
 * @param {string} key - The Redis key
 * @param {object} session - The session data to store
 */
export async function setCampaignUserSession(key, session) {
  if (!client) {
    console.warn('⚠️  Redis not available - setCampaignUserSession called in local mode');
    return;
  }

  try {
    await client.set(key, JSON.stringify(session));
    console.log(`✅ Session set for key: ${key}`);
  } catch (err) {
    console.error('❌ Error setting campaign user session:', err);
    throw err;
  }
}

export async function deleteCampaignUserSession(key) {
  if (!client) {
    console.warn('⚠️  Redis not available - deleteCampaignUserSession called in local mode');
    return;
  }

  try {
    await client.del(key);
    console.log(`🗑️  Session deleted for key: ${key}`);
  } catch (err) {
    console.error('❌ Error deleting campaign user session:', err);
    throw err;
  }
}

export async function setTemplateName(key, value, options = {}) {
  if (!client) {
    console.warn('⚠️  Redis not available - setTemplateName called in local mode');
    return null;
  }

  try {
    return await client.set(key, value, options);
  } catch (err) {
    console.error(`❌ Redis SET error for key ${key}:`, err);
  }
}

export async function getTemplateName(key) {
  if (!client) {
    console.warn('⚠️  Redis not available - getTemplateName called in local mode');
    return null;
  }

  try {
    return await client.get(key);
  } catch (err) {
    console.error(`❌ Redis GET error for key ${key}:`, err);
  }
}

export async function delTemplateName(key) {
  if (!client) {
    console.warn('⚠️  Redis not available - delTemplateName called in local mode');
    return null;
  }

  try {
    return await client.del(key);
  } catch (err) {
    console.error(`❌ Redis DEL error for key ${key}:`, err);
  }
}
