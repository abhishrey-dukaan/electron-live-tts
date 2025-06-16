#!/usr/bin/env node

require('dotenv').config();
const TaskOrchestrator = require('./task-orchestrator');

async function testOpenAICommands() {
  console.log('🧪 Testing OpenAI GPT-4o Integration...\n');
  
  // Initialize TaskOrchestrator (apiKey parameter is legacy, not used anymore)
  const orchestrator = new TaskOrchestrator('dummy');
  
  const testCommands = [
    // Simple UI commands
    'press tab',
    'press enter', 
    'take screenshot',
    
    // System commands
    'increase volume',
    'set brightness to 50%',
    
    // Note creation
    'create a new note with text hello world',
    
    // Web commands  
    'go to youtube.com',
    
    // Error case
    'this is not a clear command'
  ];

  for (const command of testCommands) {
    console.log(`\n🔍 Testing: "${command}"`);
    console.log('━'.repeat(50));
    
    try {
      const result = await orchestrator.executeTask(command);
      
      if (result.success) {
        console.log(`✅ Success: ${result.message || 'Command completed'}`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
      
    } catch (error) {
      console.error(`💥 Error: ${error.message}`);
    }
    
    // Add delay between tests to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n🏁 Testing completed!');
  
  // Cleanup
  await orchestrator.cleanup();
}

// Show environment status
console.log('🔧 Environment Check:');
console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Found' : '❌ Missing'}`);
console.log(`Groq API Key: ${process.env.GROQ_API_KEY ? '⚠️  Found (not used)' : '✅ Not found (good, not needed)'}`);
console.log('');

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

testOpenAICommands().catch(console.error); 