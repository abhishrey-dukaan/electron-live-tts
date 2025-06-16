#!/usr/bin/env node

require('dotenv').config();
const TaskOrchestrator = require('./task-orchestrator');

async function testScreenshot() {
  console.log('🧪 Testing Screenshot Functionality...\n');
  
  const orchestrator = new TaskOrchestrator();
  
  try {
    console.log('📸 Taking test screenshot...');
    const screenshotPath = await orchestrator.takeScreenshot('test-screenshot');
    console.log(`✅ Screenshot test completed: ${screenshotPath}`);
    console.log('🖼️  Screenshot should have opened automatically for viewing');
  } catch (error) {
    console.error('❌ Screenshot test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testScreenshot(); 