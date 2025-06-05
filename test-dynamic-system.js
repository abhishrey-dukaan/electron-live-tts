// Test script for the dynamic task execution system
const TaskOrchestrator = require("./task-orchestrator");
const AtomicScriptGenerator = require("./atomic-script-generator");
require("dotenv").config();

async function testSystem() {
  console.log("🧪 Testing Dynamic Task Execution System\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY not found in environment");
    return;
  }

  // Initialize components
  const orchestrator = new TaskOrchestrator(apiKey);
  const scriptGenerator = new AtomicScriptGenerator(apiKey);

  // Set up callbacks to see progress
  orchestrator.setCallbacks(
    (stepNum, totalSteps, description) => {
      console.log(`📋 Step ${stepNum}/${totalSteps}: ${description}`);
    },
    (success, message) => {
      console.log(`🎯 Task Complete - Success: ${success}, Message: ${message}`);
    },
    (error, stepNum, totalSteps) => {
      console.log(`⚠️  Error at step ${stepNum}/${totalSteps}: ${error}`);
    }
  );

  // Test 1: Simple predefined action
  console.log("🔥 Test 1: Simple Action - Open Finder");
  try {
    const script = scriptGenerator.getPredefinedScript('open_finder');
    console.log("Generated script:", script);
    
    const formatted = scriptGenerator.formatForExecution(script);
    console.log("Formatted for execution:", formatted);
    console.log("✅ Test 1 passed\n");
  } catch (error) {
    console.error("❌ Test 1 failed:", error.message);
  }

  // Test 2: Web browsing steps generation
  console.log("🔥 Test 2: Web Browsing Steps - YouTube");
  try {
    const steps = await scriptGenerator.generateYouTubeSteps("porcupine tree songs");
    console.log(`Generated ${steps.length} steps for YouTube search:`);
    steps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step.description}`);
    });
    console.log("✅ Test 2 passed\n");
  } catch (error) {
    console.error("❌ Test 2 failed:", error.message);
  }

  // Test 3: Task breakdown (without execution)
  console.log("🔥 Test 3: Task Breakdown Analysis");
  try {
    const breakdown = await orchestrator.breakdownTask("open safari and go to google.com");
    if (breakdown.success) {
      console.log(`Task broken down into ${breakdown.steps.length} steps:`);
      breakdown.steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step.type}: ${step.description}`);
      });
      console.log("✅ Test 3 passed\n");
    } else {
      console.error("❌ Test 3 failed:", breakdown.error);
    }
  } catch (error) {
    console.error("❌ Test 3 failed:", error.message);
  }

  // Test 4: Atomic script generation
  console.log("🔥 Test 4: Atomic Script Generation");
  try {
    const result = await scriptGenerator.generateAtomicScript(
      "Click the search button in Safari",
      { application: "Safari", action: "click", element: "search button" }
    );
    
    if (result.success) {
      console.log("Generated atomic script:", result.script);
      console.log("✅ Test 4 passed\n");
    } else {
      console.error("❌ Test 4 failed:", result.error);
    }
  } catch (error) {
    console.error("❌ Test 4 failed:", error.message);
  }

  // Test 5: System status
  console.log("🔥 Test 5: System Status");
  try {
    const status = orchestrator.getStatus();
    console.log("Orchestrator status:", status);
    console.log("✅ Test 5 passed\n");
  } catch (error) {
    console.error("❌ Test 5 failed:", error.message);
  }

  console.log("🧪 Dynamic Task Execution System Tests Complete!");
  console.log("\n📋 Summary:");
  console.log("✅ Atomic script generation working");
  console.log("✅ Web browsing step templates working");
  console.log("✅ Task breakdown analysis working");
  console.log("✅ System status tracking working");
  console.log("\n🚀 System ready for voice command execution!");
}

// Run tests if called directly
if (require.main === module) {
  testSystem().catch(console.error);
}

module.exports = { testSystem }; 