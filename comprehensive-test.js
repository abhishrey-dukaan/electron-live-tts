const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// Test categories and their tasks
const testTasks = {
  fileSystem: [
    "create a new folder called Documents",
    "create a folder named Pictures",
    "make a new directory called Downloads",
    "create folder Music",
    "make directory Videos",
    "create a folder named Work Files",
    "make a new folder called Personal",
    "create directory Projects",
    "make folder called Backups",
    "create new folder Templates"
  ],
  
  webBrowsing: [
    "open youtube.com",
    "go to google.com",
    "navigate to github.com",
    "open twitter.com",
    "visit facebook.com",
    "go to linkedin.com",
    "open reddit.com",
    "navigate to amazon.com",
    "visit netflix.com",
    "go to spotify.com"
  ],
  
  applications: [
    "open Notes",
    "launch Calculator",
    "start Safari",
    "open System Preferences",
    "launch Terminal",
    "start TextEdit",
    "open Calendar",
    "launch Mail",
    "start Messages",
    "open Finder"
  ],
  
  mediaControls: [
    "play some music",
    "pause the music",
    "next song",
    "previous track",
    "volume up",
    "volume down",
    "mute audio",
    "unmute audio",
    "set volume to 50%",
    "stop playback"
  ],
  
  systemCommands: [
    "take a screenshot",
    "capture screen",
    "lock screen",
    "show desktop",
    "hide desktop icons",
    "show dock",
    "hide dock",
    "empty trash",
    "show downloads folder",
    "open applications folder"
  ],
  
  searchCommands: [
    "search for cats",
    "google funny videos",
    "find pizza recipes",
    "search for weather forecast",
    "look up movie times",
    "find nearby restaurants",
    "search for coding tutorials",
    "google current news",
    "find stock prices",
    "search for job listings"
  ],
  
  youtubeCommands: [
    "play coldplay paradise on youtube",
    "search youtube for cooking videos",
    "find tutorial videos on youtube",
    "play music videos on youtube",
    "search youtube for news",
    "find workout videos on youtube",
    "play meditation music on youtube",
    "search youtube for documentaries",
    "find gaming videos on youtube",
    "play latest music on youtube"
  ],
  
  textEditing: [
    "create new note",
    "write a reminder",
    "make shopping list",
    "create todo list",
    "write meeting notes",
    "create new document",
    "make text file",
    "write quick note",
    "create memo",
    "write journal entry"
  ],
  
  emailCommands: [
    "open mail",
    "check emails",
    "write new email",
    "send email",
    "check inbox",
    "read latest email",
    "compose message",
    "reply to email",
    "forward email",
    "delete email"
  ],
  
  miscCommands: [
    "what time is it",
    "show calendar",
    "set reminder",
    "check weather",
    "show notifications",
    "open settings",
    "show battery status",
    "check updates",
    "show memory usage",
    "display cpu usage"
  ]
};

// Test configuration
const config = {
  screenshotDir: 'test-screenshots',
  videoDir: 'test-recordings',
  logFile: 'test-results.log',
  maxRetries: 3,
  delayBetweenTests: 2000 // 2 seconds
};

// Helper functions
async function setupTestDirs() {
  for (const dir of [config.screenshotDir, config.videoDir]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function appendToLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  await fs.appendFile(config.logFile, logMessage);
}

// Main test suite
test.describe('Comprehensive Voice Command Tests', () => {
  let electronApp;
  let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  };

  test.beforeAll(async () => {
    await setupTestDirs();
    await fs.writeFile(config.logFile, '=== Test Run Started ===\n');
    
    // Launch the Electron app
    electronApp = await electron.launch({ 
      args: ['main.js'],
      env: {
        ...process.env,
        DEEPGRAM_API_KEY: 'a076385db3d2cb8e4eb9c4276b2eed2ae70d154c',
        NODE_ENV: 'test'
      }
    });
    await appendToLog('Electron app launched successfully');
  });

  test.afterAll(async () => {
    await electronApp.close();
    
    // Generate test report
    const report = `
=== Test Results ===
Total Tests: ${testResults.total}
Passed: ${testResults.passed}
Failed: ${testResults.failed}
Skipped: ${testResults.skipped}
=================
    `;
    
    await appendToLog(report);
  });

  // Generate tests for each category
  for (const [category, tasks] of Object.entries(testTasks)) {
    test.describe(category, () => {
      tasks.forEach((task, index) => {
        test(`${category} ${index + 1}: "${task}"`, async () => {
          testResults.total++;
          
          try {
            // Get the main window
            const window = await electronApp.firstWindow();
            
            // Take before screenshot
            await window.screenshot({ 
              path: path.join(config.screenshotDir, `${category}-${index}-before.png`) 
            });
            
            // Execute the voice command
            await window.evaluate((cmd) => {
              // Simulate voice command
              window.executeVoiceCommand(cmd);
            }, task);
            
            // Wait for command processing
            await window.waitForTimeout(3000);
            
            // Take after screenshot
            await window.screenshot({ 
              path: path.join(config.screenshotDir, `${category}-${index}-after.png`) 
            });
            
            // Check for error indicators
            const hasError = await window.evaluate(() => {
              return document.body.textContent.includes('error') || 
                     document.body.textContent.includes('failed');
            });
            
            if (hasError) {
              throw new Error(`Command execution failed: ${task}`);
            }
            
            testResults.passed++;
            await appendToLog(`✅ PASSED: ${category} - ${task}`);
            
          } catch (error) {
            testResults.failed++;
            await appendToLog(`❌ FAILED: ${category} - ${task}\nError: ${error.message}`);
            throw error;
          }
        });
      });
    });
  }
}); 