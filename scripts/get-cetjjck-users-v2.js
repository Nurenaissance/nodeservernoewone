/**
 * Script to fetch all users associated with tenant "cetjjck" (v2)
 * Based on the actual database structure
 *
 * Usage: node scripts/get-cetjjck-users-v2.js
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

    // First, get the tenant info
    console.log('🔍 Looking up tenant "cetjjck"...\n');
    const tenantResult = await client.query(`
      SELECT * FROM tenant_tenant WHERE tenant_id = $1;
    `, ['cetjjck']);

    if (tenantResult.rows.length === 0) {
      console.log('❌ Tenant "cetjjck" not found in tenant_tenant table');
      console.log('   Listing all tenants:\n');

      const allTenantsResult = await client.query(`
        SELECT tenant_id, name FROM tenant_tenant ORDER BY tenant_id;
      `);

      allTenantsResult.rows.forEach(tenant => {
        console.log(`   - ${tenant.tenant_id} (${tenant.name || 'No name'})`);
      });

      return;
    }

    const tenant = tenantResult.rows[0];
    console.log('✅ Found tenant:');
    console.log(`   Tenant ID: ${tenant.tenant_id}`);
    console.log(`   Name: ${tenant.name || 'N/A'}`);
    console.log(`   ID: ${tenant.id}\n`);

    // Now query the custom user table
    console.log('🔍 Querying simplecrm_customuser table...\n');
    const userResult = await client.query(`
      SELECT
        id,
        username,
        email,
        first_name,
        last_name,
        is_active,
        is_staff,
        is_superuser,
        date_joined,
        last_login,
        tenant_id
      FROM simplecrm_customuser
      WHERE tenant_id = $1
      ORDER BY date_joined DESC;
    `, [tenant.id]);

    if (userResult.rows.length === 0) {
      console.log('❌ No users found in simplecrm_customuser for tenant "cetjjck"');

      // Try alternative: search by tenant_id string directly
      console.log('\n🔍 Trying alternative: searching by tenant_id string...\n');
      const altResult = await client.query(`
        SELECT
          id,
          username,
          email,
          first_name,
          last_name,
          is_active,
          tenant_id
        FROM simplecrm_customuser
        WHERE CAST(tenant_id AS TEXT) = $1
        ORDER BY id DESC;
      `, ['cetjjck']);

      if (altResult.rows.length > 0) {
        console.log(`✅ Found ${altResult.rows.length} user(s)!`);
        displayUsers(altResult.rows);
      } else {
        console.log('   Still no users found.');

        // List all users with their tenant_ids to help debug
        console.log('\n📊 Listing first 10 users with their tenant_ids:\n');
        const sampleUsers = await client.query(`
          SELECT
            id,
            username,
            email,
            tenant_id
          FROM simplecrm_customuser
          ORDER BY id DESC
          LIMIT 10;
        `);

        sampleUsers.rows.forEach(user => {
          console.log(`   User: ${user.username}, Email: ${user.email}, Tenant ID: ${user.tenant_id}`);
        });
      }

      return;
    }

    console.log(`✅ Found ${userResult.rows.length} user(s) for tenant "cetjjck":\n`);
    displayUsers(userResult.rows);

  } catch (error) {
    console.error('\n❌ Database error:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    console.log('\n✅ Database connection closed');
  }
}

function displayUsers(users) {
  console.log('═'.repeat(80));

  users.forEach((user, index) => {
    console.log(`\n👤 User #${index + 1}:`);
    console.log(`   ID:         ${user.id}`);
    console.log(`   Username:   ${user.username || 'N/A'}`);
    console.log(`   Email:      ${user.email || 'N/A'}`);
    console.log(`   First Name: ${user.first_name || 'N/A'}`);
    console.log(`   Last Name:  ${user.last_name || 'N/A'}`);
    console.log(`   Active:     ${user.is_active !== undefined ? user.is_active : 'N/A'}`);
    console.log(`   Tenant ID:  ${user.tenant_id}`);

    if (user.is_staff !== undefined) {
      console.log(`   Staff:      ${user.is_staff}`);
    }
    if (user.is_superuser !== undefined) {
      console.log(`   Superuser:  ${user.is_superuser}`);
    }
    if (user.date_joined) {
      console.log(`   Joined:     ${new Date(user.date_joined).toLocaleString()}`);
    }
    if (user.last_login) {
      console.log(`   Last Login: ${new Date(user.last_login).toLocaleString()}`);
    }
  });

  console.log('\n' + '═'.repeat(80));

  // Summary
  console.log('\n📋 SUMMARY:');
  console.log(`   Total Users: ${users.length}`);
  console.log(`   Usernames: ${users.map(u => u.username).join(', ')}`);
}

// Run the script
console.log('🔐 Fetching users for tenant: cetjjck (v2)\n');
fetchCetjjckUsers();
