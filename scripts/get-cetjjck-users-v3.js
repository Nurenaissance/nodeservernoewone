/**
 * Script to fetch all users associated with tenant "cetjjck" (v3)
 * Discovers table structure first
 *
 * Usage: node scripts/get-cetjjck-users-v3.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

async function fetchCetjjckUsers() {
  let client;

  try {
    console.log('🔌 Connecting to database...');
    client = await pool.connect();
    console.log('✅ Connected to database\n');

    // Step 1: Discover tenant_tenant table structure
    console.log('🔍 Step 1: Discovering tenant_tenant table structure...\n');
    const tenantColumnsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'tenant_tenant'
      ORDER BY ordinal_position;
    `);

    console.log('📊 tenant_tenant columns:');
    tenantColumnsResult.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });
    console.log('');

    // Step 2: Find tenant by searching in tenant_tenant
    console.log('🔍 Step 2: Searching for "cetjjck" in tenant_tenant...\n');
    const tenantResult = await client.query(`SELECT * FROM tenant_tenant LIMIT 10;`);

    console.log(`Found ${tenantResult.rows.length} tenants (showing first 10):`);
    let cetjjckTenant = null;

    tenantResult.rows.forEach((tenant, index) => {
      console.log(`\n   Tenant #${index + 1}:`);
      Object.keys(tenant).forEach(key => {
        console.log(`      ${key}: ${tenant[key]}`);
        // Check if any field contains 'cetjjck'
        if (String(tenant[key]).toLowerCase().includes('cetjjck')) {
          cetjjckTenant = tenant;
        }
      });
    });

    if (!cetjjckTenant) {
      console.log('\n❌ Could not find tenant with "cetjjck" in tenant_tenant table');
      console.log('   The tenant might use a different identifier\n');
    } else {
      console.log('\n✅ Found tenant with "cetjjck":', cetjjckTenant);
    }

    // Step 3: Discover simplecrm_customuser table structure
    console.log('\n🔍 Step 3: Discovering simplecrm_customuser table structure...\n');
    const userColumnsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'simplecrm_customuser'
      ORDER BY ordinal_position;
    `);

    console.log('📊 simplecrm_customuser columns:');
    userColumnsResult.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });
    console.log('');

    // Step 4: Search for users by string matching
    console.log('🔍 Step 4: Searching for users with "cetjjck"...\n');

    // Build dynamic query based on available columns
    const columns = userColumnsResult.rows.map(r => r.column_name);
    const selectColumns = [
      'id',
      columns.includes('username') ? 'username' : null,
      columns.includes('email') ? 'email' : null,
      columns.includes('first_name') ? 'first_name' : null,
      columns.includes('last_name') ? 'last_name' : null,
      columns.includes('is_active') ? 'is_active' : null,
      columns.includes('tenant_id') ? 'tenant_id' : null,
      columns.includes('date_joined') ? 'date_joined' : null,
      columns.includes('last_login') ? 'last_login' : null,
    ].filter(Boolean).join(', ');

    // Try to find users by searching all text fields
    const searchConditions = columns
      .filter(col => col.includes('tenant') || col === 'username' || col === 'email')
      .map(col => `CAST(${col} AS TEXT) ILIKE '%cetjjck%'`)
      .join(' OR ');

    let userQuery = `SELECT ${selectColumns} FROM simplecrm_customuser`;
    if (searchConditions) {
      userQuery += ` WHERE ${searchConditions}`;
    }
    userQuery += ` ORDER BY id DESC LIMIT 20;`;

    console.log('📝 Executing query:', userQuery, '\n');

    const userResult = await client.query(userQuery);

    if (userResult.rows.length === 0) {
      console.log('❌ No users found matching "cetjjck"');

      // Show sample users for reference
      console.log('\n📊 Showing first 5 users for reference:\n');
      const sampleResult = await client.query(`
        SELECT ${selectColumns} FROM simplecrm_customuser ORDER BY id DESC LIMIT 5;
      `);

      sampleResult.rows.forEach((user, index) => {
        console.log(`\n   User #${index + 1}:`);
        Object.keys(user).forEach(key => {
          console.log(`      ${key}: ${user[key]}`);
        });
      });
    } else {
      console.log(`✅ Found ${userResult.rows.length} user(s) matching "cetjjck":\n`);
      console.log('═'.repeat(80));

      userResult.rows.forEach((user, index) => {
        console.log(`\n👤 User #${index + 1}:`);
        Object.keys(user).forEach(key => {
          const value = user[key];
          if (value instanceof Date) {
            console.log(`   ${key}: ${value.toLocaleString()}`);
          } else {
            console.log(`   ${key}: ${value}`);
          }
        });
      });

      console.log('\n' + '═'.repeat(80));

      // Summary
      console.log('\n📋 SUMMARY:');
      console.log(`   Total Users: ${userResult.rows.length}`);
      if (columns.includes('username')) {
        const usernames = userResult.rows.map(u => u.username).filter(Boolean);
        if (usernames.length > 0) {
          console.log(`   Usernames: ${usernames.join(', ')}`);
        }
      }
    }

  } catch (error) {
    console.error('\n❌ Database error:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    console.log('\n✅ Database connection closed');
  }
}

// Run the script
console.log('🔐 Fetching users for tenant: cetjjck (v3 - Discovery Mode)\n');
fetchCetjjckUsers();
