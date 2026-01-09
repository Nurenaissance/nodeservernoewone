import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.ANALYTICS_DB_HOST || process.env.DB_HOST || 'localhost',
  port: process.env.ANALYTICS_DB_PORT || process.env.DB_PORT || 5432,
  database: process.env.ANALYTICS_DB_NAME || process.env.DB_NAME || 'analytics',
  user: process.env.ANALYTICS_DB_USER || process.env.DB_USER,
  password: process.env.ANALYTICS_DB_PASSWORD || process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // SSL configuration for Azure PostgreSQL
  ssl: process.env.DB_HOST?.includes('azure.com') || process.env.ANALYTICS_DB_HOST?.includes('azure.com')
    ? { rejectUnauthorized: false }
    : false,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Analytics database connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Query helper
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️ Slow query (${duration}ms):`, text.substring(0, 100));
    }
    return res;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
}

// Transaction helper
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
