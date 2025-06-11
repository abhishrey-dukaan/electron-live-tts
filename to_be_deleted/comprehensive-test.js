const fs = require('fs');
const AIService = require('./ai-service');
const TaskOrchestrator = require('./task-orchestrator');
require('dotenv').config();

class ComprehensiveSystemTester {
  constructor() {
    this.aiService = null;
    this.taskOrchestrator = null;
    this.testResults = [];
  }

  async setup() {
    console.log('🚀 Setting up Comprehensive System Test...\n');
    
    // Check API keys status
    await this.checkApiKeysStatus();
    
    // Initialize services
    await this.initializeServices();
    
    console.log('✅ Setup complete\n');
  }

  async checkApiKeysStatus() {
    console.log('🔑 Checking API Keys Status...');
    
    if (!fs.existsSync('.env')) {
      console.log('❌ .env file not found');
      return;
    }
    
    const apiKeys = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      groq: process.env.GROQ_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      deepgram: process.env.DEEPGRAM_API_KEY
    };
    
    console.log('\n📋 API Key Status:');
    Object.entries(apiKeys).forEach(([provider, key]) => {
      const isValid = key && 
                     key !== `your_${provider}_api_key_here` && 
                     !key.includes('your_') && 
                     !key.includes('_here') && 
                     key.trim() !== '';
      
      console.log(`  ${provider.toUpperCase()}: ${isValid ? '✅ Valid' : '❌ Invalid/Missing'}`);
    });
    
    console.log('');
  }

  async initializeServices() {
    console.log('🔧 Initializing services...');
    
    // Initialize AI Service
    this.aiService = new AIService();
    this.aiService.setApiKeys({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY
    });
    
    // Set default models
    this.aiService.setTextModel('anthropic', 'claude-3-5-sonnet-20241022');
    this.aiService.setImageModel('anthropic', 'claude-3-5-sonnet-20241022');
    
    // Initialize Task Orchestrator
    this.taskOrchestrator = new TaskOrchestrator();
    this.taskOrchestrator.aiService = this.aiService;
    
    console.log('✅ Services initialized');
  }

  async runAllTests() {
    console.log('🧪 Running Comprehensive System Tests...\n');
    
    const testSuites = [
      { name: 'Core System Tests', tests: await this.getCoreSystemTests() },
      { name: 'Simple Command Tests', tests: await this.getSimpleCommandTests() },
      { name: 'Voice Command Classification Tests', tests: await this.getClassificationTests() },
      { name: 'Web Task Tests', tests: await this.getWebTaskTests() },
      { name: 'Complex Task Tests', tests: await this.getComplexTaskTests() }
    ];
    
    let totalTests = 0;
    let totalPassed = 0;
    
    for (const suite of testSuites) {
      console.log(`\n🧪 ${suite.name}`);
      console.log('='.repeat(50));
      
      let suitePassed = 0;
      
      for (const test of suite.tests) {
        totalTests++;
        console.log(`\n${totalTests}. ${test.description}`);
        
        try {
          const result = await test.test();
          if (result.success) {
            console.log(`   ✅ PASS: ${result.message}`);
            suitePassed++;
            totalPassed++;
          } else {
            console.log(`   ❌ FAIL: ${result.message}`);
          }
        } catch (error) {
          console.log(`   💥 ERROR: ${error.message}`);
        }
      }
      
      console.log(`\n📊 Suite Result: ${suitePassed}/${suite.tests.length} tests passed`);
    }
    
    console.log(`\n🎯 FINAL RESULTS`);
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalTests - totalPassed}`);
    console.log(`Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
    
    if (totalPassed === totalTests) {
      console.log('\n🎉 ALL TESTS PASSED! System is working perfectly!');
    } else {
      console.log('\n⚠️  Some tests failed. Check API key configuration.');
    }
  }

  async getCoreSystemTests() {
    return [
      {
        description: 'AIService initialization',
        test: async () => {
          return this.aiService ? 
            { success: true, message: 'AIService initialized' } :
            { success: false, message: 'AIService not initialized' };
        }
      },
      {
        description: 'TaskOrchestrator initialization',
        test: async () => {
          return this.taskOrchestrator ? 
            { success: true, message: 'TaskOrchestrator initialized' } :
            { success: false, message: 'TaskOrchestrator not initialized' };
        }
      },
      {
        description: 'API key loading mechanism',
        test: async () => {
          const anthropicKey = this.aiService.getApiKey('anthropic');
          const groqKey = this.aiService.getApiKey('groq');
          const openaiKey = this.aiService.getApiKey('openai');
          
          return {
            success: true,
            message: `API keys loaded - Anthropic: ${anthropicKey ? 'Available' : 'Missing'}, Groq: ${groqKey ? 'Available' : 'Missing'}, OpenAI: ${openaiKey ? 'Available' : 'Missing'}`
          };
        }
      }
    ];
  }

  async getSimpleCommandTests() {
    return [
      {
        description: 'Simple app launch command detection',
        test: async () => {
          const command = this.taskOrchestrator.checkForSimpleApplicationCommand('open slack');
          return command && command.app === 'Slack' && command.action === 'launch' ?
            { success: true, message: 'Simple command detected correctly' } :
            { success: false, message: 'Simple command detection failed' };
        }
      },
      {
        description: 'Simple app quit command detection',
        test: async () => {
          const command = this.taskOrchestrator.checkForSimpleApplicationCommand('quit chrome');
          return command && command.app === 'Google Chrome' && command.action === 'quit' ?
            { success: true, message: 'Quit command detected correctly' } :
            { success: false, message: 'Quit command detection failed' };
        }
      },
      {
        description: 'File/folder open command detection',
        test: async () => {
          const command = this.taskOrchestrator.checkForSimpleApplicationCommand('open downloads');
          return command && command.app === 'Downloads' && command.action === 'open' ?
            { success: true, message: 'File open command detected correctly' } :
            { success: false, message: 'File open command detection failed' };
        }
      }
    ];
  }

  async getClassificationTests() {
    const classificationTests = [
      { input: 'open slack', expected: 'TASK_EXECUTION', description: 'App launch command' },
      { input: 'quit chrome', expected: 'TASK_EXECUTION', description: 'App quit command' },
      { input: 'what time is it', expected: 'TEXT_RESPONSE', description: 'Question about time' },
      { input: 'how to cook pasta', expected: 'TEXT_RESPONSE', description: 'How-to question' },
      { input: 'play music on spotify', expected: 'TASK_EXECUTION', description: 'Complex task' },
      { input: 'reply to her', expected: 'AMBIGUOUS', description: 'Ambiguous command' },
      { input: 'create a new note', expected: 'TASK_EXECUTION', description: 'Create command' }
    ];

    return classificationTests.map(test => ({
      description: `Classify: "${test.input}" as ${test.expected}`,
      test: async () => {
        try {
          const result = this.taskOrchestrator.classifier.classifyCommand(test.input);
          return result.type === test.expected ?
            { success: true, message: `Correctly classified as ${result.type}` } :
            { success: false, message: `Expected ${test.expected}, got ${result.type}` };
        } catch (error) {
          return { success: false, message: `Classification error: ${error.message}` };
        }
      }
    }));
  }

  async getWebTaskTests() {
    return [
      {
        description: 'Web task detection',
        test: async () => {
          const isWebTask = this.taskOrchestrator.isWebBasedTask('search google for weather');
          return isWebTask ?
            { success: true, message: 'Web task detected correctly' } :
            { success: false, message: 'Web task detection failed' };
        }
      },
      {
        description: 'YouTube task detection',
        test: async () => {
          const isWebTask = this.taskOrchestrator.isWebBasedTask('play music on youtube');
          return isWebTask ?
            { success: true, message: 'YouTube task detected correctly' } :
            { success: false, message: 'YouTube task detection failed' };
        }
      },
      {
        description: 'Non-web task detection',
        test: async () => {
          const isWebTask = this.taskOrchestrator.isWebBasedTask('open notes app');
          return !isWebTask ?
            { success: true, message: 'Non-web task correctly identified' } :
            { success: false, message: 'Non-web task incorrectly identified as web task' };
        }
      }
    ];
  }

  async getComplexTaskTests() {
    return [
      {
        description: 'Task orchestrator status check',
        test: async () => {
          const status = this.taskOrchestrator.getStatus();
          return status && typeof status.isExecuting === 'boolean' ?
            { success: true, message: `Status available: ${JSON.stringify(status)}` } :
            { success: false, message: 'Status check failed' };
        }
      },
      {
        description: 'Screenshot capability check',
        test: async () => {
          try {
            // Just check if the method exists and can be called
            const screenshotResult = await this.taskOrchestrator.takeScreenshot('/tmp/test_screenshot.jpg');
            // Clean up test file if it was created
            if (fs.existsSync('/tmp/test_screenshot.jpg')) {
              fs.unlinkSync('/tmp/test_screenshot.jpg');
            }
            return screenshotResult.success ?
              { success: true, message: 'Screenshot capability working' } :
              { success: false, message: `Screenshot failed: ${screenshotResult.error}` };
          } catch (error) {
            return { success: false, message: `Screenshot error: ${error.message}` };
          }
        }
      }
    ];
  }

  async testRealCommands() {
    console.log('\n🎯 Testing Real Voice Commands...\n');
    
    const realCommands = [
      'open slack',
      'quit slack', 
      'open safari',
      'create a new note',
      'open downloads folder',
      'search google for weather'
    ];
    
    for (let i = 0; i < realCommands.length; i++) {
      const command = realCommands[i];
      console.log(`${i + 1}. Testing: "${command}"`);
      
      try {
        const result = await this.taskOrchestrator.executeTask(command);
        console.log(`   Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'} - ${result.message || result.error}`);
      } catch (error) {
        console.log(`   Result: 💥 ERROR - ${error.message}`);
      }
      
      // Add delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Main execution
async function main() {
  const tester = new ComprehensiveSystemTester();
  
  try {
    await tester.setup();
    await tester.runAllTests();
    
    // Ask user if they want to test real commands
    console.log('\n❓ Would you like to test real voice commands? (This will actually execute them)');
    console.log('   Press Ctrl+C to exit, or wait 5 seconds to continue with real command tests...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await tester.testRealCommands();
    
  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ComprehensiveSystemTester; 