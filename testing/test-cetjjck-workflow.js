/**
 * Test Script for Tenant cetjjck Workflow
 *
 * This tests the "interviewdrishtee" flow for tenant cetjjck
 * Based on the logs, this flow starts with a text input node
 */

import {
  simulateTextMessage,
  simulateButtonReply,
  CONFIG
} from './webhookSimulator.js';

// ============================================================================
// CONFIGURATION - cetjjck Tenant
// ============================================================================

const CETJJCK_CONFIG = {
  // Phone Number ID from logs: 679698821892367
  phoneNumberId: '679698821892367',

  // Test user phone (from logs: 919643393874)
  userPhone: '919643393874',

  // User name
  userName: 'Adarsh Sharma',

  // Delay between steps
  delayBetweenSteps: 2000,

  // Webhook URL
  webhookUrl: process.env.SIMULATOR_WEBHOOK_URL || 'http://localhost:8080/webhook',
};

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Test 1: Text Input Flow
 * Tests the calibration text input node
 */
async function testTextInputFlow() {
  console.log('\n🧪 TEST 1: Text Input Flow (interviewdrishtee)');
  console.log('='.repeat(60));

  try {
    // Step 1: Send text message to trigger flow
    console.log('\n📤 Step 1: Sending text message...');
    await simulateTextMessage("Why won't it move", {
      phoneNumberId: CETJJCK_CONFIG.phoneNumberId,
      userPhone: CETJJCK_CONFIG.userPhone,
      userName: CETJJCK_CONFIG.userName,
      webhookUrl: CETJJCK_CONFIG.webhookUrl
    });

    console.log('✅ Text message sent successfully');
    console.log('⏳ Waiting for server processing...');
    await delay(CETJJCK_CONFIG.delayBetweenSteps);

    // Check logs
    console.log('\n📊 Expected behavior:');
    console.log('  ✅ handleInput called with value: "Why won\'t it move"');
    console.log('  ✅ Valid inputVariable detected: calibration');
    console.log('  ✅ Node should advance from 0 to next node');
    console.log('  ✅ Message should be sent');

    console.log('\n✨ Test completed! Check server logs above for:');
    console.log('  1. "Advanced from 0 to [next node] after text input"');
    console.log('  2. "Message sent successfully"');
    console.log('  3. No SSL errors for analytics DB');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  }
}

/**
 * Test 2: Button Reply Flow
 * Tests button interaction after text input
 */
async function testButtonReplyFlow() {
  console.log('\n🧪 TEST 2: Button Reply Flow');
  console.log('='.repeat(60));

  try {
    // First send text to start flow
    console.log('\n📤 Step 1: Sending initial text...');
    await simulateTextMessage("Test message", {
      phoneNumberId: CETJJCK_CONFIG.phoneNumberId,
      userPhone: CETJJCK_CONFIG.userPhone,
      userName: CETJJCK_CONFIG.userName,
      webhookUrl: CETJJCK_CONFIG.webhookUrl
    });

    await delay(CETJJCK_CONFIG.delayBetweenSteps);

    // Then send button reply (if flow has buttons)
    console.log('\n📤 Step 2: Sending button reply...');
    await simulateButtonReply('button_1', {
      phoneNumberId: CETJJCK_CONFIG.phoneNumberId,
      userPhone: CETJJCK_CONFIG.userPhone,
      userName: CETJJCK_CONFIG.userName,
      webhookUrl: CETJJCK_CONFIG.webhookUrl
    });

    console.log('✅ Button reply sent successfully');
    await delay(CETJJCK_CONFIG.delayBetweenSteps);

    console.log('\n✨ Test completed! Check server logs.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  }
}

/**
 * Test 3: Analytics Database Connection
 * Verifies analytics tracking works without SSL errors
 */
async function testAnalyticsTracking() {
  console.log('\n🧪 TEST 3: Analytics Database Connection');
  console.log('='.repeat(60));

  try {
    console.log('\n📤 Sending test message to trigger analytics...');
    await simulateTextMessage("Analytics test", {
      phoneNumberId: CETJJCK_CONFIG.phoneNumberId,
      userPhone: CETJJCK_CONFIG.userPhone,
      userName: CETJJCK_CONFIG.userName,
      webhookUrl: CETJJCK_CONFIG.webhookUrl
    });

    await delay(CETJJCK_CONFIG.delayBetweenSteps);

    console.log('\n📊 What to check in server logs:');
    console.log('  ❌ NO "pg_hba.conf entry" errors (SSL fix applied)');
    console.log('  ✅ "✅ Analytics database connected"');
    console.log('  ✅ Message tracking successful');

    console.log('\n✨ Test completed! Verify no SSL errors in logs.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 TESTING CETJJCK WORKFLOW (interviewdrishtee)');
  console.log('='.repeat(80));
  console.log('\nTenant ID: cetjjck');
  console.log('Phone Number ID:', CETJJCK_CONFIG.phoneNumberId);
  console.log('Test User:', CETJJCK_CONFIG.userPhone);
  console.log('Webhook URL:', CETJJCK_CONFIG.webhookUrl);

  // Check if server is running
  console.log('\n⚠️  IMPORTANT: Make sure your Node.js server is running!');
  console.log('   Run: node server.js (in another terminal)');
  console.log('\n⏳ Starting tests in 3 seconds...\n');

  await delay(3000);

  const testToRun = process.argv[2];

  try {
    if (testToRun === 'text' || !testToRun) {
      await testTextInputFlow();
    } else if (testToRun === 'button') {
      await testButtonReplyFlow();
    } else if (testToRun === 'analytics') {
      await testAnalyticsTracking();
    } else if (testToRun === 'all') {
      await testTextInputFlow();
      await delay(2000);
      await testButtonReplyFlow();
      await delay(2000);
      await testAnalyticsTracking();
    } else {
      console.error('❌ Unknown test:', testToRun);
      console.log('\nAvailable tests:');
      console.log('  node testing/test-cetjjck-workflow.js text');
      console.log('  node testing/test-cetjjck-workflow.js button');
      console.log('  node testing/test-cetjjck-workflow.js analytics');
      console.log('  node testing/test-cetjjck-workflow.js all');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TESTS COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.log('\n' + '='.repeat(80));
    console.log('❌ TEST SUITE FAILED');
    console.log('='.repeat(80));
    console.error('\nError:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('  1. Is your Node.js server running?');
    console.log('  2. Did you restart after applying the fixes?');
    console.log('  3. Check server logs for detailed error messages');
    process.exit(1);
  }
}

// Run tests
runTests();
