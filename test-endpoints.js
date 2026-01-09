import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// API URLs
const DJANGO_URL = "https://backeng4whatsapp-dxbmgpakhzf9bped.centralindia-01.azurewebsites.net";
const FASTAPI_URL = "https://fastapione-gue2c5ecc9c4b8hy.centralindia-01.azurewebsites.net";
const NODEJS_URL = "http://localhost:8080"; // Local Node.js server

// Test tenant ID (you can change this)
const TEST_TENANT_ID = "hjiqohe";

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Test helper function
async function testEndpoint(name, url, options = {}) {
  try {
    logInfo(`Testing: ${name}`);
    logInfo(`URL: ${url}`);

    const startTime = Date.now();
    const response = await axios({
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      data: options.data,
      params: options.params,
      timeout: 10000,
      validateStatus: () => true // Don't throw on any status code
    });
    const duration = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      logSuccess(`${name} - Status: ${response.status} (${duration}ms)`);
      if (options.showData) {
        console.log('Response data:', JSON.stringify(response.data, null, 2).substring(0, 500));
      }
      return { success: true, status: response.status, data: response.data, duration };
    } else {
      logWarning(`${name} - Status: ${response.status} (${duration}ms)`);
      if (response.data) {
        console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 300));
      }
      return { success: false, status: response.status, data: response.data, duration };
    }
  } catch (error) {
    logError(`${name} - Error: ${error.message}`);
    if (error.code) {
      console.log(`Error code: ${error.code}`);
    }
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log('\n' + '='.repeat(80), colors.bright);
  log('🧪 ENDPOINT CONNECTIVITY TEST SUITE', colors.bright);
  log('='.repeat(80) + '\n', colors.bright);

  const results = {
    django: [],
    fastapi: [],
    nodejs: []
  };

  // ==================== DJANGO ENDPOINTS ====================
  log('\n📦 TESTING DJANGO ENDPOINTS', colors.bright);
  log('-'.repeat(80) + '\n', colors.yellow);

  // Test 1: Django Health Check
  results.django.push(await testEndpoint(
    'Django - Health Check',
    `${DJANGO_URL}/`
  ));

  // Test 2: Django - Message Statistics (GET)
  results.django.push(await testEndpoint(
    'Django - Message Statistics Endpoint',
    `${DJANGO_URL}/message-stat/`,
    {
      headers: { 'X-Tenant-Id': TEST_TENANT_ID }
    }
  ));

  // Test 3: Django - Individual Message Statistics
  results.django.push(await testEndpoint(
    'Django - Individual Message Stats',
    `${DJANGO_URL}/individual_message_statistics/`,
    {
      headers: { 'X-Tenant-Id': TEST_TENANT_ID }
    }
  ));

  // Test 4: Django - Templates Endpoint
  results.django.push(await testEndpoint(
    'Django - Templates List',
    `${DJANGO_URL}/templates/`,
    {
      headers: { 'X-Tenant-Id': TEST_TENANT_ID }
    }
  ));

  // Test 5: Django - Status Details (the old logs endpoint)
  results.django.push(await testEndpoint(
    'Django - Status Details (Old Logs)',
    `${DJANGO_URL}/webhook/status_details`,
    {
      headers: { 'tenant_id': TEST_TENANT_ID },
      showData: true
    }
  ));

  // ==================== FASTAPI ENDPOINTS ====================
  log('\n🚀 TESTING FASTAPI ENDPOINTS', colors.bright);
  log('-'.repeat(80) + '\n', colors.yellow);

  // Test 1: FastAPI Health Check
  results.fastapi.push(await testEndpoint(
    'FastAPI - Health Check',
    `${FASTAPI_URL}/`
  ));

  // Test 2: FastAPI - WhatsApp Tenant
  results.fastapi.push(await testEndpoint(
    'FastAPI - WhatsApp Tenant Info',
    `${FASTAPI_URL}/whatsapp_tenant`,
    {
      headers: { 'bpid': 'test_business_phone_id' }
    }
  ));

  // Test 3: FastAPI - Broadcast Analytics
  results.fastapi.push(await testEndpoint(
    'FastAPI - Broadcast Analytics',
    `${FASTAPI_URL}/broadcast-analytics/`,
    {
      headers: { 'X-Tenant-ID': TEST_TENANT_ID }
    }
  ));

  // ==================== NODE.JS ENDPOINTS (LOCAL) ====================
  log('\n⚡ TESTING NODE.JS ENDPOINTS (LOCAL)', colors.bright);
  log('-'.repeat(80) + '\n', colors.yellow);

  // Test 1: Node.js Health Check
  results.nodejs.push(await testEndpoint(
    'Node.js - Health Check',
    `${NODEJS_URL}/`
  ));

  // Test 2: Node.js - Health Status Endpoint
  results.nodejs.push(await testEndpoint(
    'Node.js - Health Status',
    `${NODEJS_URL}/health`
  ));

  // Test 3: Node.js - Analytics Overview
  results.nodejs.push(await testEndpoint(
    'Node.js - Analytics Overview',
    `${NODEJS_URL}/api/analytics/overview`,
    {
      params: {
        tenantId: TEST_TENANT_ID,
        startDate: '2026-01-01',
        endDate: '2026-01-09'
      }
    }
  ));

  // Test 4: Node.js - Logs Endpoint (NEW)
  results.nodejs.push(await testEndpoint(
    'Node.js - Logs Endpoint (NEW)',
    `${NODEJS_URL}/api/analytics/logs`,
    {
      params: {
        tenantId: TEST_TENANT_ID
      },
      showData: true
    }
  ));

  // Test 5: Node.js - Real-time Analytics
  results.nodejs.push(await testEndpoint(
    'Node.js - Real-time Analytics',
    `${NODEJS_URL}/api/analytics/real-time`,
    {
      params: {
        tenantId: TEST_TENANT_ID
      }
    }
  ));

  // ==================== CROSS-SERVICE INTEGRATION TEST ====================
  log('\n🔗 TESTING CROSS-SERVICE INTEGRATION', colors.bright);
  log('-'.repeat(80) + '\n', colors.yellow);

  // Test: Node.js calling Django
  try {
    logInfo('Testing: Node.js → Django Integration');
    const startTime = Date.now();
    const response = await axios.post(
      `${DJANGO_URL}/add-dynamic-data/`,
      {
        flow_name: 'test_flow',
        input_variable: 'test_var',
        value: 'test_value',
        phone: '1234567890'
      },
      {
        headers: { 'X-Tenant-Id': TEST_TENANT_ID },
        timeout: 10000,
        validateStatus: () => true
      }
    );
    const duration = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      logSuccess(`Integration Test: Node.js → Django - Status: ${response.status} (${duration}ms)`);
    } else {
      logWarning(`Integration Test: Node.js → Django - Status: ${response.status} (${duration}ms)`);
    }
  } catch (error) {
    logError(`Integration Test: Node.js → Django - Error: ${error.message}`);
  }

  // ==================== TEST SUMMARY ====================
  log('\n' + '='.repeat(80), colors.bright);
  log('📊 TEST SUMMARY', colors.bright);
  log('='.repeat(80) + '\n', colors.bright);

  const printSummary = (name, tests) => {
    const successful = tests.filter(t => t.success).length;
    const failed = tests.filter(t => !t.success).length;
    const total = tests.length;
    const percentage = Math.round((successful / total) * 100);

    log(`${name}:`, colors.bright);
    log(`  Total Tests: ${total}`);
    logSuccess(`  Passed: ${successful}`);
    if (failed > 0) {
      logError(`  Failed: ${failed}`);
    }
    log(`  Success Rate: ${percentage}%`);

    if (successful > 0) {
      const avgDuration = tests
        .filter(t => t.success && t.duration)
        .reduce((sum, t) => sum + t.duration, 0) / successful;
      log(`  Avg Response Time: ${Math.round(avgDuration)}ms`);
    }
    console.log();
  };

  printSummary('Django Endpoints', results.django);
  printSummary('FastAPI Endpoints', results.fastapi);
  printSummary('Node.js Endpoints', results.nodejs);

  const allTests = [...results.django, ...results.fastapi, ...results.nodejs];
  const totalSuccess = allTests.filter(t => t.success).length;
  const totalTests = allTests.length;
  const overallPercentage = Math.round((totalSuccess / totalTests) * 100);

  log('='.repeat(80), colors.bright);
  log(`OVERALL: ${totalSuccess}/${totalTests} tests passed (${overallPercentage}%)`, colors.bright);
  log('='.repeat(80) + '\n', colors.bright);

  if (overallPercentage === 100) {
    logSuccess('🎉 All tests passed! Your endpoints are working correctly.');
  } else if (overallPercentage >= 70) {
    logWarning('⚠️  Most tests passed, but some endpoints need attention.');
  } else {
    logError('❌ Multiple endpoints are failing. Please check your services.');
  }

  // Check if Node.js server is running
  const nodeJsRunning = results.nodejs.filter(t => t.success).length > 0;
  if (!nodeJsRunning) {
    log('\n' + '='.repeat(80), colors.red);
    logError('Node.js server appears to be offline!');
    logInfo('Please start your Node.js server with: node server.js');
    log('='.repeat(80) + '\n', colors.red);
  }
}

// Run the tests
log('\n🚀 Starting endpoint tests...\n', colors.bright);
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
