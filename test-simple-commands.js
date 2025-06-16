const SimpleTaskOrchestrator = require('./simple-task-orchestrator');

async function testSimpleCommands() {
    console.log('🧪 Testing Simple Voice Commands - You should see results on screen!\n');
    
    const orchestrator = new SimpleTaskOrchestrator();
    
    // Test commands that will show visible results
    const tests = [
        {
            command: 'go to youtube',
            description: 'Should open YouTube in Safari browser'
        },
        {
            command: 'take screenshot', 
            description: 'Should trigger screenshot tool (Cmd+Shift+3)'
        },
        {
            command: 'search for coldplay yellow',
            description: 'Should search YouTube for "coldplay yellow"'
        },
        {
            command: 'volume up',
            description: 'Should increase system volume (you will hear this)'
        },
        {
            command: 'press tab',
            description: 'Should press Tab key (focus will change if dialog is open)'
        }
    ];
    
    for (const test of tests) {
        console.log(`\n🎯 Testing: "${test.command}"`);
        console.log(`📋 Expected: ${test.description}`);
        console.log('=' .repeat(60));
        
        try {
            const result = await orchestrator.executeTask(test.command);
            
            if (result.success) {
                console.log(`✅ SUCCESS: ${result.message}`);
            } else {
                console.log(`❌ FAILED: ${result.error}`);
            }
        } catch (error) {
            console.log(`💥 ERROR: ${error.message}`);
        }
        
        // Wait between commands to see results
        console.log('⏳ Waiting 3 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log('🎉 Test completed! Check your screen for the results.');
}

testSimpleCommands().catch(console.error); 