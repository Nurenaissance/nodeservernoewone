/**
 * Test Scenarios for WhatsApp Webhook Simulator
 *
 * This file contains example test scenarios you can run to test your bot flows.
 * Customize the scenarios based on your actual flow configurations.
 *
 * Usage:
 *   node testing/testScenarios.js [scenario-name]
 *
 * Examples:
 *   node testing/testScenarios.js basic
 *   node testing/testScenarios.js greeting-flow
 *   node testing/testScenarios.js all
 */

import {
  simulateTextMessage,
  simulateButtonReply,
  simulateListReply,
  simulateNfmReply,
  simulateImageMessage,
  simulateDocumentMessage,
  simulateLocationMessage,
  simulateOrderMessage,
  simulateStatusUpdate,
  runFlowScenario,
  CONFIG
} from './webhookSimulator.js';

// ============================================================================
// CONFIGURATION - IMPORTANT: Customize for your testing!
// ============================================================================
//
// To test properly, you MUST use real values from your WhatsApp Business setup:
//
// 1. Get your Business Phone Number ID from Meta Business Suite:
//    - Go to: https://business.facebook.com/settings/whatsapp-business-accounts
//    - Click on your WhatsApp account → Phone numbers → Copy the Phone Number ID
//
// 2. Set these environment variables in your .env file:
//    TEST_PHONE_NUMBER_ID=your_real_phone_number_id
//    TEST_USER_PHONE=your_test_whatsapp_number (e.g., 919876543210)
//
// Without real values, getSession() will fail because the phone number ID
// won't exist in your Django backend.
//
// ============================================================================

const TEST_CONFIG = {
  // REQUIRED: Your real WhatsApp Business Phone Number ID
  phoneNumberId: process.env.TEST_PHONE_NUMBER_ID || CONFIG.defaultPhoneNumberId,

  // REQUIRED: A real WhatsApp number to simulate (with country code, no +)
  userPhone: process.env.TEST_USER_PHONE || CONFIG.defaultUserPhone,

  // Optional: Display name for the test user
  userName: process.env.TEST_USER_NAME || 'Test User',

  // Delay between steps (ms) - increase if your server needs more processing time
  delayBetweenSteps: 1500,

  // Whether to log request/response details
  verbose: true
};

// Warn if using default (fake) values
if (TEST_CONFIG.phoneNumberId === '123456789012345') {
  console.warn('\n⚠️  WARNING: Using default test phone number ID!');
  console.warn('   Set TEST_PHONE_NUMBER_ID in .env to your real WhatsApp Business Phone Number ID');
  console.warn('   Without this, tests will fail with "Session initialization failed"\n');
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

const scenarios = {
  /**
   * Basic text message test
   */
  basic: async () => {
    console.log('\n🧪 Running: Basic Text Message Test');
    await simulateTextMessage('Hello', {
      userPhone: TEST_CONFIG.userPhone,
      phoneNumberId: TEST_CONFIG.phoneNumberId
    });
  },

  /**
   * Test greeting and language selection flow
   */
  'greeting-flow': async () => {
    console.log('\n🧪 Running: Greeting & Language Selection Flow');
    await runFlowScenario([
      {
        type: 'text',
        text: 'Hi',
        description: 'Send greeting to trigger welcome message'
      },
      {
        type: 'button',
        buttonId: 'lang_en',
        buttonTitle: 'English',
        description: 'Select English language'
      }
    ], {
      ...TEST_CONFIG,
      delayBetweenSteps: TEST_CONFIG.delayBetweenSteps
    });
  },

  /**
   * Test a typical menu navigation flow
   */
  'menu-flow': async () => {
    console.log('\n🧪 Running: Menu Navigation Flow');
    await runFlowScenario([
      {
        type: 'text',
        text: 'Hi',
        description: 'Start conversation'
      },
      {
        type: 'list',
        listId: 'menu_services',
        listTitle: 'Our Services',
        description: 'Select from main menu'
      },
      {
        type: 'button',
        buttonId: 'back_main',
        buttonTitle: 'Back to Main Menu',
        description: 'Navigate back to main menu'
      }
    ], {
      ...TEST_CONFIG,
      delayBetweenSteps: TEST_CONFIG.delayBetweenSteps
    });
  },

  /**
   * Test special triggers
   */
  'special-triggers': async () => {
    console.log('\n🧪 Running: Special Triggers Test');

    // Test AI mode trigger
    await simulateTextMessage('/ai', TEST_CONFIG);
    await new Promise(r => setTimeout(r, 1000));

    // Test review trigger
    await simulateTextMessage('/review', TEST_CONFIG);
    await new Promise(r => setTimeout(r, 1000));

    // Test stop trigger
    await simulateTextMessage('0', TEST_CONFIG);
  },

  /**
   * Test media uploads
   */
  'media-uploads': async () => {
    console.log('\n🧪 Running: Media Uploads Test');

    console.log('\n📷 Testing image upload...');
    await simulateImageMessage({
      ...TEST_CONFIG,
      caption: 'Test image'
    });
    await new Promise(r => setTimeout(r, 1500));

    console.log('\n📄 Testing document upload...');
    await simulateDocumentMessage('test_document.pdf', TEST_CONFIG);
    await new Promise(r => setTimeout(r, 1500));

    console.log('\n📍 Testing location share...');
    await simulateLocationMessage(28.6139, 77.2090, {
      ...TEST_CONFIG,
      name: 'Test Location',
      address: 'New Delhi, India'
    });
  },

  /**
   * Test order/e-commerce flow
   */
  'order-flow': async () => {
    console.log('\n🧪 Running: Order Flow Test');
    await simulateOrderMessage([
      { id: 'product_001', quantity: 2, price: 1000, currency: 'INR' },
      { id: 'product_002', quantity: 1, price: 500, currency: 'INR' }
    ], TEST_CONFIG);
  },

  /**
   * Test NFM (form) submission
   */
  'form-submission': async () => {
    console.log('\n🧪 Running: Form Submission Test');
    await simulateNfmReply({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '9876543210',
      message: 'This is a test form submission'
    }, TEST_CONFIG);
  },

  /**
   * Test status updates (simulate message delivery/read receipts)
   */
  'status-updates': async () => {
    console.log('\n🧪 Running: Status Updates Test');
    const testMessageId = 'wamid.TEST123456789';

    console.log('\n📤 Simulating "sent" status...');
    await simulateStatusUpdate('sent', testMessageId, TEST_CONFIG);
    await new Promise(r => setTimeout(r, 500));

    console.log('\n✅ Simulating "delivered" status...');
    await simulateStatusUpdate('delivered', testMessageId, TEST_CONFIG);
    await new Promise(r => setTimeout(r, 500));

    console.log('\n👀 Simulating "read" status...');
    await simulateStatusUpdate('read', testMessageId, TEST_CONFIG);
    await new Promise(r => setTimeout(r, 500));

    console.log('\n❌ Simulating "failed" status...');
    await simulateStatusUpdate('failed', testMessageId, {
      ...TEST_CONFIG,
      errors: [{ code: 131026, message: 'Message undeliverable' }]
    });
  },

  /**
   * Test conversation reset
   */
  'reset-conversation': async () => {
    console.log('\n🧪 Running: Conversation Reset Test');
    await simulateTextMessage('0', TEST_CONFIG);
  },

  /**
   * Test button reply variations
   */
  'button-replies': async () => {
    console.log('\n🧪 Running: Button Reply Variations Test');

    // Common button patterns in your codebase
    const buttons = [
      { id: 'yes', title: 'Yes' },
      { id: 'no', title: 'No' },
      { id: 'confirm', title: 'Confirm' },
      { id: 'cancel', title: 'Cancel' },
      { id: 'back', title: 'Back' }
    ];

    for (const btn of buttons) {
      console.log(`\n🔘 Testing button: ${btn.title}`);
      await simulateButtonReply(btn.id, btn.title, TEST_CONFIG);
      await new Promise(r => setTimeout(r, 1000));
    }
  },

  /**
   * Complete end-to-end flow test
   */
  'e2e-flow': async () => {
    console.log('\n🧪 Running: End-to-End Flow Test');
    console.log('⚠️  Customize this scenario based on your actual flow!\n');

    await runFlowScenario([
      {
        type: 'text',
        text: 'Hi',
        description: 'Start conversation'
      },
      {
        type: 'button',
        buttonId: 'lang_en',
        buttonTitle: 'English',
        description: 'Select language'
      },
      {
        type: 'list',
        listId: 'option_1',
        listTitle: 'Option 1',
        description: 'Select first option'
      },
      {
        type: 'text',
        text: 'John Doe',
        description: 'Enter name'
      },
      {
        type: 'text',
        text: 'john@example.com',
        description: 'Enter email'
      },
      {
        type: 'button',
        buttonId: 'confirm',
        buttonTitle: 'Confirm',
        description: 'Confirm submission'
      }
    ], {
      ...TEST_CONFIG,
      delayBetweenSteps: 2000
    });
  },

  /**
   * Stress test - rapid message sending
   */
  'stress-test': async () => {
    console.log('\n🧪 Running: Stress Test (10 rapid messages)');
    console.log('⚠️  This will send 10 messages rapidly!\n');

    const messages = [];
    for (let i = 1; i <= 10; i++) {
      messages.push(simulateTextMessage(`Stress test message ${i}`, {
        ...TEST_CONFIG,
        logRequest: false,
        logResponse: false
      }));
    }

    const results = await Promise.all(messages);
    const successful = results.filter(r => r.success).length;
    console.log(`\n📊 Results: ${successful}/10 messages processed successfully`);
  },

  /**
   * Test all message types
   */
  'all-types': async () => {
    console.log('\n🧪 Running: All Message Types Test');

    const tests = [
      { name: 'Text', fn: () => simulateTextMessage('Test message', TEST_CONFIG) },
      { name: 'Button', fn: () => simulateButtonReply('test_btn', 'Test Button', TEST_CONFIG) },
      { name: 'List', fn: () => simulateListReply('test_list', 'Test List Option', '', TEST_CONFIG) },
      { name: 'Image', fn: () => simulateImageMessage(TEST_CONFIG) },
      { name: 'Document', fn: () => simulateDocumentMessage('test.pdf', TEST_CONFIG) },
      { name: 'Location', fn: () => simulateLocationMessage(28.6139, 77.2090, TEST_CONFIG) },
      { name: 'Order', fn: () => simulateOrderMessage([{ id: 'p1', quantity: 1, price: 100 }], TEST_CONFIG) }
    ];

    for (const test of tests) {
      console.log(`\n📝 Testing: ${test.name} message`);
      await test.fn();
      await new Promise(r => setTimeout(r, 1000));
    }
  }
};

// ============================================================================
// CLI RUNNER
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const scenarioName = args[0];

  console.log('🤖 WhatsApp Webhook Test Scenarios');
  console.log('='.repeat(50));
  console.log(`📍 Target: ${CONFIG.webhookUrl}`);
  console.log(`📱 Phone ID: ${TEST_CONFIG.phoneNumberId}`);
  console.log(`👤 User: ${TEST_CONFIG.userName} (${TEST_CONFIG.userPhone})`);
  console.log('='.repeat(50));

  if (!scenarioName) {
    console.log('\nAvailable scenarios:');
    Object.keys(scenarios).forEach(name => {
      console.log(`  - ${name}`);
    });
    console.log('\nUsage: node testing/testScenarios.js <scenario-name>');
    console.log('       node testing/testScenarios.js all  (run all scenarios)');
    process.exit(0);
  }

  if (scenarioName === 'all') {
    console.log('\n🚀 Running ALL scenarios...\n');
    for (const [name, fn] of Object.entries(scenarios)) {
      if (name === 'stress-test') continue; // Skip stress test in "all" mode
      try {
        await fn();
        console.log(`\n✅ ${name} completed`);
        await new Promise(r => setTimeout(r, 2000));
      } catch (error) {
        console.error(`\n❌ ${name} failed:`, error.message);
      }
    }
  } else if (scenarios[scenarioName]) {
    try {
      await scenarios[scenarioName]();
      console.log('\n✅ Scenario completed!');
    } catch (error) {
      console.error('\n❌ Scenario failed:', error.message);
      process.exit(1);
    }
  } else {
    console.error(`\n❌ Unknown scenario: ${scenarioName}`);
    console.log('\nAvailable scenarios:');
    Object.keys(scenarios).forEach(name => {
      console.log(`  - ${name}`);
    });
    process.exit(1);
  }
}

main().catch(console.error);

export { scenarios, TEST_CONFIG };
