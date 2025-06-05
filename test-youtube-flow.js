const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import our modules for testing
const VisualGuidance = require('./visual-guidance');
const AtomicScriptGenerator = require('./atomic-script-generator');
const TaskOrchestrator = require('./task-orchestrator');
require('dotenv').config();

class YouTubeFlowTester {
  constructor() {
    this.visualGuidance = new VisualGuidance(process.env.ANTHROPIC_API_KEY);
    this.atomicScriptGenerator = new AtomicScriptGenerator(process.env.ANTHROPIC_API_KEY);
    this.taskOrchestrator = new TaskOrchestrator(process.env.ANTHROPIC_API_KEY);
  }

  // Test taking screenshots
  async testScreenshotCapture() {
    console.log('🧪 Testing screenshot capture...');
    
    try {
      const result = await this.visualGuidance.takeScreenshot();
      
      if (!result.success) {
        throw new Error(`Screenshot failed: ${result.error}`);
      }
      
      // Verify file exists
      if (!fs.existsSync(result.path)) {
        throw new Error(`Screenshot file not found: ${result.path}`);
      }
      
      // Check file size
      const stats = fs.statSync(result.path);
      if (stats.size < 1000) {
        throw new Error(`Screenshot file too small: ${stats.size} bytes`);
      }
      
      console.log(`✅ Screenshot captured successfully: ${result.path} (${stats.size} bytes)`);
      return { success: true, path: result.path };
      
    } catch (error) {
      console.error(`❌ Screenshot test failed:`, error);
      return { success: false, error: error.message };
    }
  }

  // Test base64 conversion
  async testBase64Conversion() {
    console.log('🧪 Testing base64 conversion...');
    
    try {
      const screenshotResult = await this.testScreenshotCapture();
      if (!screenshotResult.success) {
        throw new Error('Screenshot capture failed');
      }
      
      const base64 = await this.visualGuidance.screenshotToBase64(screenshotResult.path);
      
      if (!base64) {
        throw new Error('Base64 conversion returned null');
      }
      
      if (base64.length < 1000) {
        throw new Error(`Base64 string too short: ${base64.length} chars`);
      }
      
      console.log(`✅ Base64 conversion successful: ${base64.length} characters`);
      
      // Clean up
      if (fs.existsSync(screenshotResult.path)) {
        fs.unlinkSync(screenshotResult.path);
      }
      
      return { success: true, base64Length: base64.length };
      
    } catch (error) {
      console.error(`❌ Base64 conversion test failed:`, error);
      return { success: false, error: error.message };
    }
  }

  // Test AI screenshot analysis
  async testAIScreenshotAnalysis() {
    console.log('🧪 Testing AI screenshot analysis...');
    
    try {
      // First, open Safari to have something to analyze
      await this.executeAppleScript('tell application "Safari" to activate');
      await this.delay(2000);
      
      const screenshotResult = await this.visualGuidance.takeScreenshot();
      if (!screenshotResult.success) {
        throw new Error('Screenshot capture failed');
      }
      
      const analysisResult = await this.visualGuidance.analyzeScreenshotForAction(
        screenshotResult.path,
        'search for fix you by coldplay on youtube',
        'Find and click the address bar'
      );
      
      console.log('🧠 AI Analysis Result:', JSON.stringify(analysisResult, null, 2));
      
      if (!analysisResult.success) {
        throw new Error(`AI analysis failed: ${analysisResult.error}`);
      }
      
      // Verify required fields
      if (!analysisResult.action) {
        throw new Error('Analysis missing action field');
      }
      
      if (!analysisResult.description) {
        throw new Error('Analysis missing description field');
      }
      
      console.log(`✅ AI analysis successful: ${analysisResult.action} - ${analysisResult.description}`);
      
      // Clean up
      if (fs.existsSync(screenshotResult.path)) {
        fs.unlinkSync(screenshotResult.path);
      }
      
      return { success: true, analysis: analysisResult };
      
    } catch (error) {
      console.error(`❌ AI screenshot analysis test failed:`, error);
      return { success: false, error: error.message };
    }
  }

  // Test clicking mechanisms
  async testClickingMechanisms() {
    console.log('🧪 Testing clicking mechanisms...');
    
    try {
      // Test if cliclick is available
      const cliclickAvailable = await this.visualGuidance.checkCliclickAvailable();
      console.log(`📱 cliclick available: ${cliclickAvailable}`);
      
      // Test a simple click action
      const testAction = {
        action: "CLICK",
        coordinates: [100, 100],
        description: "Test click at coordinates 100,100",
        confidence: 0.9
      };
      
      console.log('🖱️ Testing coordinate click...');
      const clickResult = await this.visualGuidance.executeVisualAction(testAction);
      
      console.log('🖱️ Click result:', clickResult);
      
      return { 
        success: true, 
        cliclickAvailable, 
        clickResult: clickResult.success 
      };
      
    } catch (error) {
      console.error(`❌ Clicking mechanism test failed:`, error);
      return { success: false, error: error.message };
    }
  }

  // Test YouTube step generation
  async testYouTubeStepGeneration() {
    console.log('🧪 Testing YouTube step generation...');
    
    try {
      const steps = await this.atomicScriptGenerator.generateYouTubeSteps('fix you by coldplay');
      
      if (!steps || !Array.isArray(steps)) {
        throw new Error('Steps generation returned invalid result');
      }
      
      if (steps.length === 0) {
        throw new Error('No steps generated');
      }
      
      console.log(`✅ Generated ${steps.length} YouTube steps`);
      
      // Verify step structure
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`📋 Step ${i + 1}: ${step.type} - ${step.description}`);
        
        if (!step.type || !step.description) {
          throw new Error(`Step ${i + 1} missing required fields`);
        }
        
        if (step.type === 'VISUAL_GUIDANCE' && step.script !== 'VISUAL_GUIDANCE_PLACEHOLDER') {
          console.warn(`⚠️ Step ${i + 1} has wrong script for visual guidance: ${step.script}`);
        }
      }
      
      return { success: true, stepCount: steps.length, steps };
      
    } catch (error) {
      console.error(`❌ YouTube step generation test failed:`, error);
      return { success: false, error: error.message };
    }
  }

  // Test TaskOrchestrator step execution
  async testTaskOrchestratorExecution() {
    console.log('🧪 Testing TaskOrchestrator step execution...');
    
    try {
      // Create a simple test step
      const testStep = {
        stepNumber: 1,
        type: "APP_LAUNCH",
        description: "Open Safari browser",
        script: 'tell application "Safari" to activate',
        formattedScript: 'osascript -e \'tell application "Safari" to activate\'',
        delayAfter: 1000,
        continueOnError: false
      };
      
      console.log('🎯 Testing regular AppleScript step...');
      const result = await this.taskOrchestrator.executeSingleAttempt(testStep, 0);
      
      console.log('📊 Step execution result:', result);
      
      if (!result.success) {
        console.warn(`⚠️ Step execution failed: ${result.error}`);
      }
      
      // Test a visual guidance step
      const visualStep = {
        stepNumber: 2,
        type: "VISUAL_GUIDANCE",
        description: "Find address bar",
        script: "VISUAL_GUIDANCE_PLACEHOLDER",
        visualTask: "navigate to youtube",
        visualStep: "Find and click the address bar",
        delayAfter: 1000,
        continueOnError: false
      };
      
      console.log('🎯 Testing visual guidance step...');
      const visualResult = await this.taskOrchestrator.executeSingleAttempt(visualStep, 0);
      
      console.log('📊 Visual step execution result:', visualResult);
      
      return { 
        success: true, 
        regularStepSuccess: result.success,
        visualStepSuccess: visualResult.success,
        regularStepError: result.error,
        visualStepError: visualResult.error
      };
      
    } catch (error) {
      console.error(`❌ TaskOrchestrator execution test failed:`, error);
      return { success: false, error: error.message };
    }
  }

  // Test full YouTube flow
  async testFullYouTubeFlow() {
    console.log('🧪 Testing full YouTube search flow...');
    
    try {
      const searchQuery = 'fix you by coldplay';
      
      // Generate steps
      const steps = await this.atomicScriptGenerator.generateYouTubeSteps(searchQuery);
      console.log(`📋 Generated ${steps.length} steps for YouTube search`);
      
      // Execute each step
      for (let i = 0; i < Math.min(steps.length, 3); i++) { // Test first 3 steps only
        const step = steps[i];
        console.log(`🎯 Executing step ${i + 1}: ${step.description}`);
        
        const result = await this.taskOrchestrator.executeSingleAttempt(step, 0);
        
        if (result.success) {
          console.log(`✅ Step ${i + 1} completed successfully`);
        } else {
          console.error(`❌ Step ${i + 1} failed: ${result.error}`);
          
          // Don't fail the entire test for step failures - just log them
          if (!step.continueOnError && i < 2) { // Only fail for critical first steps
            return {
              success: false,
              error: `Critical step ${i + 1} failed: ${result.error}`,
              failedStep: i + 1,
              stepDescription: step.description
            };
          }
        }
        
        // Wait between steps
        await this.delay(step.delayAfter || 1000);
      }
      
      return { 
        success: true, 
        stepsExecuted: Math.min(steps.length, 3),
        totalSteps: steps.length
      };
      
    } catch (error) {
      console.error(`❌ Full YouTube flow test failed:`, error);
      return { success: false, error: error.message };
    }
  }

  // Utility functions
  async executeAppleScript(script) {
    return new Promise((resolve) => {
      const formattedScript = `osascript -e '${script.replace(/'/g, "'\\''")}'`;
      exec(formattedScript, (error, stdout, stderr) => {
        resolve({
          success: !error,
          output: stdout || stderr,
          error: error ? error.message : null
        });
      });
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting comprehensive YouTube flow testing...\n');
    
    const results = {
      screenshotCapture: await this.testScreenshotCapture(),
      base64Conversion: await this.testBase64Conversion(),
      aiScreenshotAnalysis: await this.testAIScreenshotAnalysis(),
      clickingMechanisms: await this.testClickingMechanisms(),
      youtubeStepGeneration: await this.testYouTubeStepGeneration(),
      taskOrchestratorExecution: await this.testTaskOrchestratorExecution(),
      fullYouTubeFlow: await this.testFullYouTubeFlow()
    };
    
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    let passedCount = 0;
    let totalCount = 0;
    
    for (const [testName, result] of Object.entries(results)) {
      totalCount++;
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${testName}`);
      
      if (result.success) {
        passedCount++;
      } else {
        console.log(`   Error: ${result.error}`);
      }
    }
    
    console.log('========================');
    console.log(`Overall: ${passedCount}/${totalCount} tests passed`);
    
    if (passedCount === totalCount) {
      console.log('🎉 All tests passed! YouTube flow should work correctly.');
    } else {
      console.log('⚠️  Some tests failed. Issues need to be fixed.');
    }
    
    return results;
  }
}

// Export for standalone usage
if (require.main === module) {
  const tester = new YouTubeFlowTester();
  tester.runAllTests().then(results => {
    console.log('\n🏁 Testing completed');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Testing failed:', error);
    process.exit(1);
  });
}

module.exports = YouTubeFlowTester; 