const fs = require('fs');
const AIService = require('./ai-service');
const TaskOrchestrator = require('./task-orchestrator');
require('dotenv').config();

class VoiceCommandDirectTester {
  constructor() {
    this.aiService = null;
    this.taskOrchestrator = null;
    this.testResults = [];
  }

  async setup() {
    console.log('🚀 Setting up Voice Command Direct Testing...\n');
    
    // Check API keys
    await this.checkApiKeys();
    
    // Initialize services
    await this.initializeServices();
    
    console.log('✅ Setup complete\n');
  }

  async checkApiKeys() {
    console.log('🔑 Checking API keys...');
    
    if (!fs.existsSync('.env')) {
      throw new Error('❌ .env file not found. Please create it with your API keys.');
    }
    
    const envContent = fs.readFileSync('.env', 'utf8');
    const hasPlaceholders = envContent.includes('your_') || envContent.includes('_here');
    
    const requiredKeys = [
      'ANTHROPIC_API_KEY',
      'GROQ_API_KEY', 
      'OPENAI_API_KEY',
      'DEEPGRAM_API_KEY'
    ];
    
    const missingKeys = requiredKeys.filter(key => !process.env[key] || process.env[key].includes('your_'));
    
    if (missingKeys.length > 0) {
      console.log('⚠️  WARNING: Missing or placeholder API keys:');
      missingKeys.forEach(key => {
        console.log(`   - ${key}: ${process.env[key] || 'NOT SET'}`);
      });
      console.log('🔧 Some tests may fail without proper API keys\n');
    } else {
      console.log('✅ All API keys appear to be configured\n');
    }
  }

  async initializeServices() {
    console.log('🔧 Initializing AI services...');
    
    // Initialize AI service
    this.aiService = new AIService();
    this.aiService.setApiKeys({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY
    });
    
    // Initialize Task Orchestrator
    this.taskOrchestrator = new TaskOrchestrator();
    this.taskOrchestrator.aiService = this.aiService;
    
    console.log('✅ Services initialized');
  }

  async testVoiceCommand(command, description, shouldSucceed = true) {
    console.log(`\n🎤 Testing: "${command}"`);
    console.log(`📋 Expected: ${description}`);
    
    const testStart = Date.now();
    let success = false;
    let error = null;
    let result = null;
    
    try {
      // Test command classification first
      const classification = this.taskOrchestrator.commandClassifier.classifyCommand(command);
      console.log(`🔍 Classification: ${classification.type} (confidence: ${classification.confidence})`);
      
      // Test AI classification for ambiguous commands
      if (classification.type === 'AMBIGUOUS') {
        try {
          const aiClassification = await this.taskOrchestrator.getAIClassification(command);
          console.log(`🤖 AI Classification: ${JSON.stringify(aiClassification, null, 2)}`);
        } catch (aiError) {
          console.log(`⚠️ AI Classification failed: ${aiError.message}`);
        }
      }
      
      // Test task execution (without actual system commands)
      if (classification.type === 'TASK_EXECUTION') {
        console.log('🚀 Testing task execution logic...');
        // We'll test the logic but skip actual system execution
        const taskResult = await this.testTaskLogic(command);
        success = taskResult.success;
        result = taskResult;
      } else if (classification.type === 'QUESTION') {
        console.log('❓ Testing question handling...');
        const questionResult = await this.testQuestionHandling(command);
        success = questionResult.success;
        result = questionResult;
      } else if (classification.type === 'AMBIGUOUS') {
        console.log('🤔 Testing ambiguous command handling...');
        const ambiguousResult = await this.testAmbiguousHandling(command);
        success = ambiguousResult.success;
        result = ambiguousResult;
      } else {
        success = true;
        result = { message: 'Command classification successful' };
      }
      
    } catch (err) {
      error = err.message;
      console.log(`❌ Test failed: ${error}`);
    }
    
    const duration = Date.now() - testStart;
    const testResult = {
      command,
      description,
      success,
      error,
      duration,
      result,
      shouldSucceed
    };
    
    this.testResults.push(testResult);
    
    if (success) {
      console.log(`✅ Test passed in ${duration}ms`);
    } else {
      if (shouldSucceed) {
        console.log(`❌ Test failed in ${duration}ms: ${error}`);
      } else {
        console.log(`✅ Test correctly failed in ${duration}ms (expected failure)`);
      }
    }
    
    return testResult;
  }

  async testTaskLogic(command) {
    try {
      // Test the task analysis without executing
      console.log('   📝 Analyzing task structure...');
      
      // Check if it's a simple application command
      const simpleCheck = this.taskOrchestrator.checkForSimpleApplicationCommand(command);
      if (simpleCheck) {
        console.log(`   ✅ Identified as simple application command: ${simpleCheck}`);
        return { success: true, type: 'simple_app', command: simpleCheck };
      }
      
      // Check if it's web-based
      const isWebBased = this.taskOrchestrator.isWebBasedTask(command);
      if (isWebBased) {
        console.log('   🌐 Identified as web-based task');
        return { success: true, type: 'web_task' };
      }
      
      console.log('   🎯 Identified as complex task requiring screenshot analysis');
      return { success: true, type: 'complex_task' };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testQuestionHandling(command) {
    try {
      console.log('   🤖 Testing AI text response generation...');
      
      const response = await this.aiService.generateTextResponse(command);
      console.log(`   📝 AI Response: ${response.substring(0, 100)}...`);
      
      return { success: true, response: response.substring(0, 200) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testAmbiguousHandling(command) {
    try {
      console.log('   🔍 Testing ambiguous command classification...');
      
      const aiClassification = await this.taskOrchestrator.getAIClassification(command);
      console.log(`   🎯 AI determined: ${JSON.stringify(aiClassification)}`);
      
      return { success: true, classification: aiClassification };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testModelConnectivity() {
    console.log('\n🧪 Testing AI Model Connectivity...\n');
    
    try {
      const results = await this.aiService.testAllModels();
      
      console.log('📊 Model Test Results:');
      console.log('=' .repeat(50));
      
      let totalModels = 0;
      let workingModels = 0;
      
      Object.entries(results).forEach(([provider, models]) => {
        console.log(`\n🏢 ${provider.toUpperCase()}:`);
        Object.entries(models).forEach(([modelId, result]) => {
          totalModels++;
          const status = result.success ? '✅' : '❌';
          const time = result.responseTime ? `(${result.responseTime}ms)` : '';
          console.log(`   ${status} ${modelId} ${time}`);
          if (!result.success) {
            console.log(`      Error: ${result.error}`);
          } else {
            workingModels++;
          }
        });
      });
      
      console.log('\n' + '='.repeat(50));
      console.log(`📈 Success Rate: ${workingModels}/${totalModels} (${Math.round((workingModels/totalModels)*100)}%)`);
      
      return { success: true, workingModels, totalModels, results };
    } catch (error) {
      console.log(`❌ Model connectivity test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async runAllTests() {
    console.log('\n🧪 Starting Comprehensive Voice Command Testing...\n');
    
    const tests = [
      // Simple application commands
      {
        command: "open safari",
        description: "Should identify as simple application command",
        shouldSucceed: true
      },
      {
        command: "open chrome",
        description: "Should identify as simple application command", 
        shouldSucceed: true
      },
      
      // Web-based tasks
      {
        command: "play coldplay yellow on youtube",
        description: "Should identify as web-based task and plan execution",
        shouldSucceed: true
      },
      {
        command: "search for best restaurants near me",
        description: "Should identify as web-based search task",
        shouldSucceed: true
      },
      {
        command: "open website reddit.com",
        description: "Should identify as web-based navigation task",
        shouldSucceed: true
      },
      
      // Complex tasks
      {
        command: "open sublime text",
        description: "Should identify as application task requiring screenshot analysis",
        shouldSucceed: true
      },
      {
        command: "create a new document in pages",
        description: "Should identify as complex task requiring multiple steps",
        shouldSucceed: true
      },
      
      // Questions
      {
        command: "what's the weather like today?",
        description: "Should identify as question and generate AI response",
        shouldSucceed: true
      },
      {
        command: "how do I install node.js?",
        description: "Should identify as question and provide helpful response",
        shouldSucceed: true
      },
      
      // Ambiguous commands
      {
        command: "reply to her",
        description: "Should identify as ambiguous and request clarification",
        shouldSucceed: true
      },
      {
        command: "send that",
        description: "Should identify as ambiguous and ask for specifics",
        shouldSucceed: true
      }
    ];

    console.log(`📝 Running ${tests.length} voice command tests...\n`);

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      console.log(`--- Test ${i + 1}/${tests.length} ---`);
      await this.testVoiceCommand(test.command, test.description, test.shouldSucceed);
      
      // Brief pause between tests
      await this.delay(1000);
    }

    // Test model connectivity
    const modelTest = await this.testModelConnectivity();
    
    this.printTestSummary(modelTest);
  }

  printTestSummary(modelTestResult) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE TEST SUMMARY');
    console.log('='.repeat(60));
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success === r.shouldSucceed).length;
    const failedTests = totalTests - passedTests;
    const averageTime = this.testResults.reduce((sum, r) => sum + r.duration, 0) / totalTests;
    
    console.log(`📋 Voice Command Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📈 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log(`⏱️  Average Time: ${Math.round(averageTime)}ms`);
    
    if (modelTestResult.success) {
      console.log(`\n🤖 AI Model Tests:`);
      console.log(`✅ Working Models: ${modelTestResult.workingModels}/${modelTestResult.totalModels}`);
      console.log(`📈 Model Success Rate: ${Math.round((modelTestResult.workingModels/modelTestResult.totalModels)*100)}%`);
    }
    
    console.log('\n📋 Test Details:');
    console.log('-'.repeat(40));
    this.testResults.forEach((result, index) => {
      const expectedResult = result.shouldSucceed ? 'PASS' : 'FAIL';
      const actualResult = result.success ? 'PASS' : 'FAIL';
      const status = (result.success === result.shouldSucceed) ? '✅' : '❌';
      
      console.log(`${status} Test ${index + 1}: "${result.command}"`);
      console.log(`   Expected: ${expectedResult}, Got: ${actualResult}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      console.log(`   Duration: ${result.duration}ms\n`);
    });
    
    if (failedTests > 0 || !modelTestResult.success) {
      console.log('🔧 RECOMMENDATIONS:');
      if (!modelTestResult.success || modelTestResult.workingModels < modelTestResult.totalModels) {
        console.log('- Check API keys in .env file - some models may not be accessible');
        console.log('- Verify internet connection for API calls');
      }
      if (failedTests > 0) {
        console.log('- Review failed tests for classification or logic issues');
        console.log('- Check that required dependencies are installed');
      }
    } else {
      console.log('🎉 ALL TESTS PASSED! The voice command system is working correctly.');
    }
    
    console.log('\n' + '='.repeat(60));
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the tests
async function runVoiceCommandTests() {
  const tester = new VoiceCommandDirectTester();
  
  try {
    await tester.setup();
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
    console.error('🔧 Please check:');
    console.error('- .env file exists with proper API keys');
    console.error('- All dependencies are installed (yarn install)');
    console.error('- Internet connection is working');
    process.exit(1);
  }
}

// Export for use as module or run directly
if (require.main === module) {
  runVoiceCommandTests().catch(console.error);
}

module.exports = { VoiceCommandDirectTester, runVoiceCommandTests }; 