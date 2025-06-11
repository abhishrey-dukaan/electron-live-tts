const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');

test('Deepgram Connection Test', async () => {
  console.log('🧪 Starting Deepgram connection test...');
  
  // Launch the Electron app
  const electronApp = await electron.launch({ 
    args: ['main.js'],
    timeout: 30000 
  });
  
  console.log('🚀 Electron app launched');
  
  // Get the main window
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  
  console.log('📱 Main window loaded');
  
  // Wait for the app to initialize
  await window.waitForTimeout(3000);
  
  // Check if Deepgram connection messages appear in console
  let deepgramConnected = false;
  let deepgramError = null;
  let audioSystemReady = false;
  
  // Listen to console messages
  window.on('console', (msg) => {
    const text = msg.text();
    console.log('Console:', text);
    
    if (text.includes('Deepgram WebSocket opened successfully')) {
      deepgramConnected = true;
    }
    if (text.includes('Audio system initialized')) {
      audioSystemReady = true;
    }
    if (text.includes('Recording error') || text.includes('Deepgram error')) {
      deepgramError = text;
    }
  });
  
  // Wait for connection to establish
  await window.waitForTimeout(10000);
  
  // Check connection status elements
  const connectionStatus = await window.locator('#connection-status').textContent();
  const recordingStatus = await window.locator('#recording-status').textContent();
  
  console.log('🔍 Connection Status:', connectionStatus);
  console.log('🔍 Recording Status:', recordingStatus);
  
  // Test results
  console.log('✅ Test Results:');
  console.log('  - Deepgram Connected:', deepgramConnected);
  console.log('  - Audio System Ready:', audioSystemReady);
  console.log('  - Any Errors:', deepgramError || 'None');
  console.log('  - Connection Status UI:', connectionStatus);
  console.log('  - Recording Status UI:', recordingStatus);
  
  // Check if the start-deepgram handler error is gone
  expect(deepgramError).not.toContain('No handler registered for');
  
  // Take a screenshot for verification
  await window.screenshot({ path: 'deepgram-test-screenshot.png' });
  console.log('📸 Screenshot saved');
  
  // Keep app running for manual testing if needed
  console.log('🔄 Keeping app running for 10 more seconds for manual verification...');
  await window.waitForTimeout(10000);
  
  await electronApp.close();
  console.log('🏁 Test completed');
}); 