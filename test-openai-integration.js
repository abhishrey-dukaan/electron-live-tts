#!/usr/bin/env node

require('dotenv').config();
const TaskOrchestrator = require('./task-orchestrator');

async function testOpenAIIntegration() {
  console.log('🧪 Testing OpenAI GPT-4o Integration...\n');
  
  // Check environment variables
  console.log('Environment Check:');
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Found' : '❌ Missing'}`);
  console.log(`Groq API Key: ${process.env.GROQ_API_KEY ? '⚠️  Found (should not be used)' : '✅ Not found (good)'}`);
  console.log('');
  
  // Initialize TaskOrchestrator
  const orchestrator = new TaskOrchestrator();
  
  const testCommands = [
    'press tab',
    'take screenshot',
    'increase volume'
  ];

  for (const command of testCommands) {
    console.log(`\n🔍 Testing: "${command}"`);
    console.log('─'.repeat(50));
    
    try {
      const result = await orchestrator.getExecutionCommand(command);
      
      if (result.success) {
        console.log(`✅ Success: ${result.type} - ${result.explanation}`);
        if (result.command) {
          console.log(`📝 Command: ${typeof result.command === 'string' ? result.command : JSON.stringify(result.command)}`);
        }
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`💥 Error: ${error.message}`);
    }
    
    // Wait between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🏁 Test completed!');
  process.exit(0);
}

testOpenAIIntegration().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 