const TaskOrchestrator = require('./task-orchestrator');
require('dotenv').config();

async function testVoiceCommands() {
    console.log('🧪 Starting Voice Command Tests...\n');
    
    const orchestrator = new TaskOrchestrator(process.env.GROQ_API_KEY);
    
    // Test commands in order
    const testCommands = [
        'press tab',
        'click ok',
        'search for coldplay yellow',
        'go to youtube.com'
    ];
    
    for (const command of testCommands) {
        console.log(`\n🎤 Testing command: "${command}"`);
        console.log('=' .repeat(50));
        
        try {
            const result = await orchestrator.executeTask(command);
            console.log(`✅ Result:`, result);
        } catch (error) {
            console.log(`❌ Error:`, error.message);
        }
        
        // Wait between commands
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n🧪 Test completed!');
    process.exit(0);
}

testVoiceCommands().catch(console.error); 