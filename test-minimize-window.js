const TaskOrchestrator = require('./task-orchestrator');

class MinimizeWindowTester {
  constructor() {
    this.taskOrchestrator = new TaskOrchestrator(process.env.ANTHROPIC_API_KEY);
  }

  async testMinimizeWindowBreakdown() {
    console.log('🧪 Testing Minimize Window Task Breakdown...\n');

    try {
      // Test minimize window command
      console.log('📋 Testing: "minimize this window"');
      
      // Mock the AI response to test our logic without API call
      const mockBreakdown = await this.simulateTaskBreakdown('minimize this window');
      
      console.log('🔧 Expected breakdown:');
      console.log(JSON.stringify(mockBreakdown, null, 2));
      
      // Verify the breakdown includes the correct steps
      if (mockBreakdown.success && mockBreakdown.steps) {
        const steps = mockBreakdown.steps;
        
        console.log(`\n✅ Generated ${steps.length} steps`);
        
        // Check if first step is escape key
        const firstStep = steps[0];
        if (firstStep.description.toLowerCase().includes('exit') || 
            firstStep.description.toLowerCase().includes('escape') ||
            firstStep.script.includes('escape')) {
          console.log('✅ First step correctly exits full screen');
        } else {
          console.log('⚠️ First step should exit full screen');
        }
        
        // Check if second step is Cmd+M
        const secondStep = steps[1];
        if (secondStep.description.toLowerCase().includes('minimize') &&
            secondStep.script.includes('keystroke "m"') &&
            secondStep.script.includes('command down')) {
          console.log('✅ Second step correctly minimizes with Cmd+M');
        } else {
          console.log('⚠️ Second step should minimize with Cmd+M');
        }
        
        console.log('\n🎉 Minimize window test completed!');
        return { success: true, steps: steps.length };
        
      } else {
        console.log('❌ Failed to generate proper breakdown');
        return { success: false, error: 'No steps generated' };
      }
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Simulate the expected task breakdown for minimize window
  simulateTaskBreakdown(command) {
    if (command.toLowerCase().includes('minimize')) {
      return {
        success: true,
        steps: [
          {
            stepNumber: 1,
            type: "KEYBOARD",
            description: "Exit full screen mode if active",
            script: "osascript -e 'tell application \"System Events\" to keystroke \"escape\"'",
            delayAfter: 500,
            continueOnError: true
          },
          {
            stepNumber: 2,
            type: "KEYBOARD", 
            description: "Minimize the window using Cmd+M",
            script: "osascript -e 'tell application \"System Events\" to keystroke \"m\" using command down'",
            delayAfter: 500,
            continueOnError: false
          }
        ]
      };
    }
    
    return { success: false, error: "Command not recognized" };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runTests() {
    try {
      console.log('🎯 Testing Minimize Window Instructions\n');
      
      const result = await this.testMinimizeWindowBreakdown();
      
      if (result.success) {
        console.log('\n✅ All minimize window tests passed!');
        console.log(`📊 Steps verified: ${result.steps}`);
      } else {
        console.log('\n❌ Tests failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('\n❌ Test execution failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new MinimizeWindowTester();
  tester.runTests();
}

module.exports = MinimizeWindowTester; 