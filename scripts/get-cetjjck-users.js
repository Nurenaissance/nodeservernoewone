/**
 * Script to fetch all users associated with tenant "cetjjck"
 *
 * Usage: node scripts/get-cetjjck-users.js
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
    console.log(`   Host: ${process.env.DB_HOST}`);
    console.log(`   Database: ${process.env.DB_NAME}`);
    console.log(`   User: ${process.env.DB_USER}\n`);

    client = await pool.connect();
    console.log('✅ Connected to database\n');

    // Try different possible table structures
    const queries = [
      // Query 1: Standard Django auth_user with tenant_id field
      {
        name: 'auth_user with tenant_id',
        sql: `
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
          FROM auth_user
          WHERE tenant_id = $1
          ORDER BY date_joined DESC;
        `
      },
      // Query 2: Custom user table
      {
        name: 'users table',
        sql: `
          SELECT
            id,
            username,
            email,
            first_name,
            last_name,
            tenant_id,
            is_active,
            created_at,
            updated_at
          FROM users
          WHERE tenant_id = $1
          ORDER BY created_at DESC;
        `
      },
      // Query 3: Users with tenant relationship
      {
        name: 'users with tenant join',
        sql: `
          SELECT
            u.id,
            u.username,
            u.email,
            u.first_name,
            u.last_name,
            t.tenant_id,
            u.is_active
          FROM auth_user u
          LEFT JOIN tenants t ON u.tenant_id = t.id
          WHERE t.tenant_id = $1
          ORDER BY u.date_joined DESC;
        `
      },
      // Query 4: Just list all tables to understand structure
      {
        name: 'list all tables',
        sql: `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `
      }
    ];

    let found = false;

    for (const query of queries) {
      try {
        console.log(`🔍 Trying query: ${query.name}...`);

        if (query.name === 'list all tables') {
          const result = await client.query(query.sql);
          console.log('\n📊 Available tables in database:');
          result.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
          });
          console.log('');
          continue;
        }

        const result = await client.query(query.sql, ['cetjjck']);

        if (result.rows.length > 0) {
          found = true;
          console.log(`✅ Found ${result.rows.length} user(s) for tenant "cetjjck":\n`);
          console.log('═'.repeat(80));

          result.rows.forEach((user, index) => {
            console.log(`\n👤 User #${index + 1}:`);
            console.log(`   ID:         ${user.id}`);
            console.log(`   Username:   ${user.username}`);
            console.log(`   Email:      ${user.email || 'N/A'}`);
            console.log(`   First Name: ${user.first_name || 'N/A'}`);
            console.log(`   Last Name:  ${user.last_name || 'N/A'}`);
            console.log(`   Active:     ${user.is_active}`);
            console.log(`   Tenant ID:  ${user.tenant_id || 'cetjjck'}`);

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
          break;
        }
      } catch (err) {
        if (err.code === '42P01') {
          // Table doesn't exist, try next query
          console.log(`   ⚠️  Table/column not found, trying next query...\n`);
        } else {
          console.error(`   ❌ Error: ${err.message}\n`);
        }
      }
    }

    if (!found) {
      console.log('❌ No users found for tenant "cetjjck"');
      console.log('   This could mean:');
      console.log('   1. No users exist for this tenant');
      console.log('   2. The tenant uses a different identifier');
      console.log('   3. The database structure is different than expected\n');

      // Try to find any user with cetjjck in any field
      console.log('🔍 Searching for "cetjjck" in all text fields...\n');
      try {
        const searchResult = await client.query(`
          SELECT
            id,
            username,
            email,
            first_name,
            last_name
          FROM auth_user
          WHERE
            username ILIKE '%cetjjck%' OR
            email ILIKE '%cetjjck%' OR
            first_name ILIKE '%cetjjck%' OR
            last_name ILIKE '%cetjjck%'
          LIMIT 10;
        `);

        if (searchResult.rows.length > 0) {
          console.log(`✅ Found ${searchResult.rows.length} user(s) with "cetjjck" in their data:`);
          searchResult.rows.forEach((user, index) => {
            console.log(`\n   ${index + 1}. Username: ${user.username}, Email: ${user.email || 'N/A'}`);
          });
        } else {
          console.log('   No users found with "cetjjck" in any field');
        }
      } catch (err) {
        console.error(`   Error searching: ${err.message}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Database error:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    if (error.detail) {
      console.error(`   Detail: ${error.detail}`);
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
console.log('🔐 Fetching users for tenant: cetjjck\n');
fetchCetjjckUsers();
