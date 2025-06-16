const SimpleTaskOrchestrator = require('./simple-task-orchestrator');

async function visualTest() {
    const s = new SimpleTaskOrchestrator();
    
    console.log('🎯 Creating test dialog that should appear on your screen...');
    
    // Create a test dialog
    await s.executeShell('osascript -e "tell application \\"System Events\\" to display dialog \\"Voice Test - Try pressing TAB or clicking OK\\""');
    
    console.log('✅ Dialog should be visible on screen now!');
    console.log('💡 You can now test voice commands like:');
    console.log('   - "press tab" (should change focus)');
    console.log('   - "click ok" (should close dialog)');
    console.log('   - "press escape" (should cancel)');
}

visualTest().catch(console.error); 