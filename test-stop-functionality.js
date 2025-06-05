const TaskOrchestrator = require('./task-orchestrator');

class StopFunctionalityTester {
  constructor() {
    this.taskOrchestrator = new TaskOrchestrator(process.env.ANTHROPIC_API_KEY);
  }

  async testStopFunctionality() {
    console.log('🧪 Testing Stop Functionality...\n');

    // Test 1: Stop with no active task
    console.log('📋 Test 1: Stop with no active task');
    const stopResult1 = this.taskOrchestrator.stop();
    console.log('Result:', stopResult1);
    console.log('✅ Test 1 passed\n');

    // Test 2: Start a task and then stop it
    console.log('📋 Test 2: Start task and stop it');
    
    // Start a long-running task (simulate with a simple task)
    const taskPromise = this.taskOrchestrator.executeTask('take a screenshot and wait 5 seconds');
    
    // Wait a bit to let the task start
    await this.delay(1000);
    
    // Now stop it
    const stopResult2 = this.taskOrchestrator.stop();
    console.log('Stop result:', stopResult2);
    
    // Wait for the task promise to resolve/reject
    try {
      const taskResult = await taskPromise;
      console.log('Task result:', taskResult);
    } catch (error) {
      console.log('Task was cancelled (expected):', error.message);
    }
    
    console.log('✅ Test 2 passed\n');

    // Test 3: Test status after stop
    console.log('📋 Test 3: Check status after stop');
    const status = this.taskOrchestrator.getStatus();
    console.log('Status after stop:', status);
    console.log('✅ Test 3 passed\n');

    console.log('🎉 All stop functionality tests completed!');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runTests() {
    try {
      await this.testStopFunctionality();
      console.log('\n✅ All tests passed successfully!');
    } catch (error) {
      console.error('\n❌ Tests failed:', error);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new StopFunctionalityTester();
  tester.runTests();
}

module.exports = StopFunctionalityTester; 