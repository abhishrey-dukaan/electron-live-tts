#!/usr/bin/env node

const ComprehensiveTestSuite = require('./comprehensive-test-suite');

async function runTests() {
    console.log('🚀 Starting VoiceMac Test Runner');
    console.log('=' .repeat(50));
    
    const testSuite = new ComprehensiveTestSuite();
    
    // Run a subset of tests first
    console.log('🧪 Running Application Control Tests...');
    await testSuite.runCategory('app');
    
    console.log('\n🧪 Running System Control Tests...');
    await testSuite.runCategory('system');
    
    console.log('\n🧪 Running Web Automation Tests...');
    await testSuite.runCategory('web');
    
    console.log('\n📊 Test Summary:');
    console.log(`✅ Passed: ${testSuite.passedTests.length}`);
    console.log(`❌ Failed: ${testSuite.failedTests.length}`);
    console.log(`⏭️  Skipped: ${testSuite.skippedTests.length}`);
    
    if (testSuite.failedTests.length > 0) {
        console.log('\n❌ Failed Tests:');
        testSuite.failedTests.forEach(test => {
            console.log(`   - ${test.command}: ${test.error}`);
        });
    }
    
    console.log('\n✨ Test run completed!');
    process.exit(testSuite.failedTests.length > 0 ? 1 : 0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run tests
runTests().catch(error => {
    console.error('💥 Test runner error:', error);
    process.exit(1);
}); 