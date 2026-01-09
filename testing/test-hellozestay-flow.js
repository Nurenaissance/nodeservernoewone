/**
 * Test Script for HelloZestay Flow (hjiqohe tenant)
 *
 * This tests the optimized HelloZestay flow which:
 * 1. Accepts format: "HelloZestay GUEST_ID"
 * 2. Looks up resort name from Redis/API
 * 3. Sends personalized greeting
 * 4. Triggers flow ID "209"
 * 5. Has special locking to prevent concurrent processing
 */

import {
  simulateTextMessage,
  simulateButtonReply,
  CONFIG
} from './webhookSimulator.js';

// ============================================================================
// CONFIGURATION - hjiqohe Tenant (HelloZestay)
// ============================================================================

const HELLOZESTAY_CONFIG = {
  // IMPORTANT: You need to find the actual phone number ID for hjiqohe tenant
  // Check your Django database or Azure portal for the correct value
  phoneNumberId: 'YOUR_HJIQOHE_PHONE_NUMBER_ID_HERE', // ⚠️ UPDATE THIS

  // Test user phone
  userPhone: '919999999999', // ⚠️ UPDATE with a real test number

  // User name
  userName: 'Test User',

  // Valid test guest IDs (you should have these in your system)
  validGuestId: 'TEST123', // ⚠️ UPDATE with a real guest ID from your system
  invalidGuestId: 'INVALID999',

  // Delay between steps
  delayBetweenSteps: 3000, // 3 seconds to allow for async operations

  // Webhook URL
  webhookUrl: process.env.SIMULATOR_WEBHOOK_URL || 'http://localhost:8080/webhook',
};

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Test 1: Valid HelloZestay Trigger
 * Tests the complete flow with a valid guest ID
 */
async function testValidHelloZestay() {
  console.log('\\n🧪 TEST 1: Valid HelloZestay Trigger');
  console.log('='.repeat(60));

  try {
    // Send HelloZestay message with valid guest ID
    console.log(`\\n📤 Sending: "HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}"`);
    await simulateTextMessage(`HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}`, {
      phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
      userPhone: HELLOZESTAY_CONFIG.userPhone,
      userName: HELLOZESTAY_CONFIG.userName,
      webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
    });

    console.log('✅ Message sent successfully');
    console.log('⏳ Waiting for HelloZestay processing...');
    await delay(HELLOZESTAY_CONFIG.delayBetweenSteps);

    // Expected behavior
    console.log('\\n📊 Expected behavior in server logs:');
    console.log('  ✅ "⚡⚡⚡ [hjiqohe] ULTRA-FAST PATH: HelloZestay executing"');
    console.log('  ✅ "⚡ [WARMUP] Parallel fetch starting for HelloZestay"');
    console.log('  ✅ "✅ [t=XXXms] Resort: [RESORT_NAME]"');
    console.log('  ✅ "📤 [t=XXXms] Sending greeting + triggering flow"');
    console.log('  ✅ "✅ [t=XXXms] Both greeting and flow complete"');
    console.log('  ✅ "✅✅✅ [hjiqohe] HelloZestay completed"');
    console.log('  ✅ Flow ID "209" triggered');
    console.log('  ❌ NO infinite loops');
    console.log('  ❌ NO "HelloZestay lock already held" errors');

  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
    throw error;
  }
}

/**
 * Test 2: Invalid Guest ID
 * Tests error handling with invalid guest ID
 */
async function testInvalidGuestId() {
  console.log('\\n🧪 TEST 2: Invalid Guest ID');
  console.log('='.repeat(60));

  try {
    console.log(`\\n📤 Sending: "HelloZestay ${HELLOZESTAY_CONFIG.invalidGuestId}"`);
    await simulateTextMessage(`HelloZestay ${HELLOZESTAY_CONFIG.invalidGuestId}`, {
      phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
      userPhone: HELLOZESTAY_CONFIG.userPhone,
      userName: HELLOZESTAY_CONFIG.userName,
      webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
    });

    console.log('✅ Message sent successfully');
    console.log('⏳ Waiting for error handling...');
    await delay(HELLOZESTAY_CONFIG.delayBetweenSteps);

    console.log('\\n📊 Expected behavior in server logs:');
    console.log('  ✅ "⚠️ [t=XXXms] Redis empty, trying API..."');
    console.log('  ✅ "❌ [t=XXXms] Guest not found in Redis OR API"');
    console.log('  ✅ Error message sent to user');
    console.log('  ✅ Flow NOT triggered');

  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
    throw error;
  }
}

/**
 * Test 3: HelloZestay Without Guest ID
 * Tests validation when guest ID is missing
 */
async function testMissingGuestId() {
  console.log('\\n🧪 TEST 3: HelloZestay Without Guest ID');
  console.log('='.repeat(60));

  try {
    console.log('\\n📤 Sending: "HelloZestay" (no guest ID)');
    await simulateTextMessage('HelloZestay', {
      phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
      userPhone: HELLOZESTAY_CONFIG.userPhone,
      userName: HELLOZESTAY_CONFIG.userName,
      webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
    });

    console.log('✅ Message sent successfully');
    console.log('⏳ Waiting for validation...');
    await delay(HELLOZESTAY_CONFIG.delayBetweenSteps);

    console.log('\\n📊 Expected behavior in server logs:');
    console.log('  ✅ Validation error caught');
    console.log('  ✅ "⚠️ Please provide your Property ID" message sent');
    console.log('  ✅ Lock released immediately');

  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
    throw error;
  }
}

/**
 * Test 4: HelloZestay Restart (Sending HelloZestay again while in flow)
 * Tests the restart mechanism
 */
async function testHelloZestayRestart() {
  console.log('\\n🧪 TEST 4: HelloZestay Restart');
  console.log('='.repeat(60));

  try {
    // First HelloZestay
    console.log(`\\n📤 Step 1: Sending first HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}`);
    await simulateTextMessage(`HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}`, {
      phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
      userPhone: HELLOZESTAY_CONFIG.userPhone,
      userName: HELLOZESTAY_CONFIG.userName,
      webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
    });

    await delay(2000); // Short delay

    // Send another HelloZestay while first is still active
    console.log(`\\n📤 Step 2: Sending second HelloZestay ${HELLOZESTAY_CONFIG.validGuestId} (restart)`);
    await simulateTextMessage(`HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}`, {
      phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
      userPhone: HELLOZESTAY_CONFIG.userPhone,
      userName: HELLOZESTAY_CONFIG.userName,
      webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
    });

    console.log('⏳ Waiting for restart processing...');
    await delay(HELLOZESTAY_CONFIG.delayBetweenSteps);

    console.log('\\n📊 Expected behavior in server logs:');
    console.log('  ✅ "🔄 [hjiqohe] HelloZestay restart requested"');
    console.log('  ✅ "🗑️ HelloZestay flow cleared"');
    console.log('  ✅ Flow restarts successfully');
    console.log('  ❌ NO lock conflicts');

  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
    throw error;
  }
}

/**
 * Test 5: Language Change Blocked During HelloZestay
 * Tests that /language command is blocked during active flow
 */
async function testLanguageChangeBlocked() {
  console.log('\\n🧪 TEST 5: Language Change Blocked During HelloZestay');
  console.log('='.repeat(60));

  try {
    // Start HelloZestay
    console.log(`\\n📤 Step 1: Starting HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}`);
    await simulateTextMessage(`HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}`, {
      phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
      userPhone: HELLOZESTAY_CONFIG.userPhone,
      userName: HELLOZESTAY_CONFIG.userName,
      webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
    });

    await delay(1000);

    // Try to change language
    console.log('\\n📤 Step 2: Attempting /language command');
    await simulateTextMessage('/language', {
      phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
      userPhone: HELLOZESTAY_CONFIG.userPhone,
      userName: HELLOZESTAY_CONFIG.userName,
      webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
    });

    console.log('⏳ Waiting for blocking...');
    await delay(HELLOZESTAY_CONFIG.delayBetweenSteps);

    console.log('\\n📊 Expected behavior in server logs:');
    console.log('  ✅ "⚠️ [hjiqohe] Language change blocked during HelloZestay flow"');
    console.log('  ✅ /language command ignored');
    console.log('  ✅ Flow continues normally');

  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
    throw error;
  }
}

/**
 * Test 6: Concurrent HelloZestay Prevention
 * Tests the locking mechanism
 */
async function testConcurrentPrevention() {
  console.log('\\n🧪 TEST 6: Concurrent HelloZestay Prevention');
  console.log('='.repeat(60));

  try {
    console.log('\\n📤 Sending two HelloZestay messages simultaneously...');

    // Send two messages at the same time
    await Promise.all([
      simulateTextMessage(`HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}`, {
        phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
        userPhone: HELLOZESTAY_CONFIG.userPhone,
        userName: HELLOZESTAY_CONFIG.userName,
        webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
      }),
      simulateTextMessage(`HelloZestay ${HELLOZESTAY_CONFIG.validGuestId}`, {
        phoneNumberId: HELLOZESTAY_CONFIG.phoneNumberId,
        userPhone: HELLOZESTAY_CONFIG.userPhone,
        userName: HELLOZESTAY_CONFIG.userName,
        webhookUrl: HELLOZESTAY_CONFIG.webhookUrl
      })
    ]);

    console.log('⏳ Waiting for lock handling...');
    await delay(HELLOZESTAY_CONFIG.delayBetweenSteps);

    console.log('\\n📊 Expected behavior in server logs:');
    console.log('  ✅ First request acquires lock and processes');
    console.log('  ✅ Second request sees "⚠️ [hjiqohe] HelloZestay lock already held"');
    console.log('  ✅ Second request skipped gracefully');
    console.log('  ✅ NO duplicate processing');

  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
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
  console.log('\\n' + '='.repeat(80));
  console.log('🚀 TESTING HELLOZESTAY FLOW (hjiqohe tenant)');
  console.log('='.repeat(80));
  console.log('\\nTenant: hjiqohe');
  console.log('Phone Number ID:', HELLOZESTAY_CONFIG.phoneNumberId);
  console.log('Test User:', HELLOZESTAY_CONFIG.userPhone);
  console.log('Webhook URL:', HELLOZESTAY_CONFIG.webhookUrl);

  // Validation check
  if (HELLOZESTAY_CONFIG.phoneNumberId === 'YOUR_HJIQOHE_PHONE_NUMBER_ID_HERE') {
    console.error('\\n❌ ERROR: Please update phoneNumberId in HELLOZESTAY_CONFIG');
    console.error('   Find the hjiqohe phone number ID from your Django database or Azure portal');
    process.exit(1);
  }

  if (HELLOZESTAY_CONFIG.validGuestId === 'TEST123') {
    console.warn('\\n⚠️  WARNING: Using default test guest ID "TEST123"');
    console.warn('   Update HELLOZESTAY_CONFIG.validGuestId with a real guest ID from your system');
  }

  console.log('\\n⚠️  IMPORTANT: Make sure your Node.js server is running!');
  console.log('   Run: node server.js (in another terminal)');
  console.log('\\n⏳ Starting tests in 3 seconds...\\n');

  await delay(3000);

  const testToRun = process.argv[2];

  try {
    if (testToRun === 'valid' || !testToRun) {
      await testValidHelloZestay();
    } else if (testToRun === 'invalid') {
      await testInvalidGuestId();
    } else if (testToRun === 'missing') {
      await testMissingGuestId();
    } else if (testToRun === 'restart') {
      await testHelloZestayRestart();
    } else if (testToRun === 'language') {
      await testLanguageChangeBlocked();
    } else if (testToRun === 'concurrent') {
      await testConcurrentPrevention();
    } else if (testToRun === 'all') {
      await testValidHelloZestay();
      await delay(2000);
      await testInvalidGuestId();
      await delay(2000);
      await testMissingGuestId();
      await delay(2000);
      await testHelloZestayRestart();
      await delay(2000);
      await testLanguageChangeBlocked();
      await delay(2000);
      await testConcurrentPrevention();
    } else {
      console.error('❌ Unknown test:', testToRun);
      console.log('\\nAvailable tests:');
      console.log('  node testing/test-hellozestay-flow.js valid      - Valid guest ID');
      console.log('  node testing/test-hellozestay-flow.js invalid    - Invalid guest ID');
      console.log('  node testing/test-hellozestay-flow.js missing    - Missing guest ID');
      console.log('  node testing/test-hellozestay-flow.js restart    - Flow restart');
      console.log('  node testing/test-hellozestay-flow.js language   - Language blocking');
      console.log('  node testing/test-hellozestay-flow.js concurrent - Concurrent prevention');
      console.log('  node testing/test-hellozestay-flow.js all        - Run all tests');
      process.exit(1);
    }

    console.log('\\n' + '='.repeat(80));
    console.log('✅ ALL TESTS COMPLETED');
    console.log('='.repeat(80));
    console.log('\\n⚠️  Review server logs above to verify expected behavior');
    console.log('\\n');

  } catch (error) {
    console.log('\\n' + '='.repeat(80));
    console.log('❌ TEST SUITE FAILED');
    console.log('='.repeat(80));
    console.error('\\nError:', error.message);
    console.log('\\n💡 Troubleshooting:');
    console.log('  1. Is your Node.js server running?');
    console.log('  2. Did you update the phoneNumberId for hjiqohe?');
    console.log('  3. Did you provide a valid test guest ID?');
    console.log('  4. Check server logs for detailed error messages');
    process.exit(1);
  }
}

// Run tests
runTests();
