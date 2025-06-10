const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const { exec } = require("child_process");
const AIService = require("./ai-service");
const TaskOrchestrator = require("./task-orchestrator");
const AtomicScriptGenerator = require("./atomic-script-generator");
const VisualGuidance = require("./visual-guidance");
require("dotenv").config();

// Helper function to load saved system prompt
function loadSavedSystemPrompt() {
  try {
    const settingsPath = path.join(__dirname, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings.systemPrompt;
    }
  } catch (error) {
    console.log("No saved system prompt found or error loading:", error.message);
  }
  return null;
}

// Helper function to save system prompt
function saveSystemPrompt(prompt) {
  try {
    const settingsPath = path.join(__dirname, 'settings.json');
    const settings = { systemPrompt: prompt };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log("✅ System prompt saved to settings.json");
  } catch (error) {
    console.error("Error saving system prompt:", error);
  }
}

let mainWindow;
let overlayWindow;
let deepgramSocket;
let aiService;
let taskOrchestrator;
let atomicScriptGenerator;
let visualGuidance;
let tray = null;
let lastAudioSentTime = Date.now();

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Modern Electron security best practices
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      // Enable background processing
      backgroundThrottling: false,
    },
    // Allow window to be hidden but not destroyed
    skipTaskbar: false,
    show: true,
  });

  mainWindow.loadFile("index.html");

  // Prevent window from being destroyed when closed - hide instead
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show notification that app is running in background
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
      
      console.log("App minimized to background - voice commands still active");
      return false;
    }
  });

  // Prevent the app from suspending when window loses focus
  mainWindow.on('blur', () => {
    console.log("Window lost focus - maintaining background operation");
  });

  mainWindow.on('focus', () => {
    console.log("Window gained focus");
  });

  // Initialize AI service and task orchestrator
  aiService = new AIService();
  
  // Set API keys for all providers - loaded from .env file
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const GROQ_KEY = process.env.GROQ_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;
  
  aiService.setApiKeys({
    ANTHROPIC_API_KEY: ANTHROPIC_KEY,
    GROQ_API_KEY: GROQ_KEY,
    OPENAI_API_KEY: OPENAI_KEY
  });
  
  taskOrchestrator = new TaskOrchestrator(aiService);
  atomicScriptGenerator = new AtomicScriptGenerator(aiService);
  visualGuidance = new VisualGuidance(aiService.getApiKey('anthropic'));
  
  // Test the vision models at startup to ensure they work
  console.log("🧪 Testing vision models at startup...");
  try {
    const visionResults = await aiService.testVisionModels();
    if (visionResults.successful > 0) {
      console.log(`✅ Vision models working: ${visionResults.successful}/${visionResults.tested} models functional`);
    } else {
      console.log(`⚠️ No vision models working: ${visionResults.failed}/${visionResults.tested} models failed`);
    }
  } catch (error) {
    console.error("⚠️ Vision model startup test failed:", error);
  }
  
  // Load saved system prompt from storage if available
  const savedPrompt = loadSavedSystemPrompt();
  if (savedPrompt) {
    aiService.updateSystemPrompt(savedPrompt);
    taskOrchestrator.updateSystemPrompt(savedPrompt);
    console.log("📝 Loaded saved system prompt on startup");
  }

  // Set up task orchestrator callbacks
  taskOrchestrator.setCallbacks(
    // onStepComplete
    (stepNumber, totalSteps, description) => {
      console.log(`Task step completed: ${stepNumber}/${totalSteps} - ${description}`);
      mainWindow.webContents.send("task-step-complete", {
        stepNumber,
        totalSteps,
        description
      });
      if (overlayWindow) {
        overlayWindow.webContents.send("task-step-complete", {
          stepNumber,
          totalSteps,
          description
        });
      }
    },
    // onTaskComplete
    (success, message) => {
      console.log(`Task completed - Success: ${success}, Message: ${message}`);
      mainWindow.webContents.send("task-complete", { success, message });
      if (overlayWindow) {
        overlayWindow.webContents.send("task-complete", { success, message });
      }
    },
    // onError
    (error, stepNumber, totalSteps) => {
      console.log(`Task error at step ${stepNumber}/${totalSteps}: ${error}`);
      mainWindow.webContents.send("task-error", { error, stepNumber, totalSteps });
      if (overlayWindow) {
        overlayWindow.webContents.send("task-error", { error, stepNumber, totalSteps });
      }
    }
  );

  // Setup notification callbacks for screenshot analysis
  taskOrchestrator.setNotificationCallbacks({
    notifyScreenshotAnalysisStart,
    notifyScreenshotAnalysisComplete,
    notifyVisualFallbackResult,
    notifyScreenshotCapture,
    notifyAIAnalysis,
    notifyCloudUpload
  });

  // Send environment variables to renderer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("init-env", {
      DEEPGRAM_API_KEY: DEEPGRAM_KEY,
      ANTHROPIC_API_KEY: ANTHROPIC_KEY,
      GROQ_API_KEY: GROQ_KEY,
      OPENAI_API_KEY: OPENAI_KEY,
    });
  });
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 380,
    height: 450,
    minWidth: 350,
    minHeight: 400,
    maxWidth: 500,
    maxHeight: 600,
    x: Math.max(20, width - 400), // Right side with padding
    y: 20, // Top area
    webPreferences: {
      // Modern Electron security best practices
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
    // Overlay window properties - make it draggable and persistent
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true, // Allow dragging
    focusable: true, // Allow focusing for interactions
    show: true, // Always show from start
    hasShadow: false,
    minimizable: false,
    maximizable: false,
  });

  overlayWindow.loadFile("overlay.html");

  // Add improved bounds checking to keep window in viewport
  function ensureOverlayOnScreen() {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    
    const bounds = overlayWindow.getBounds();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
    
    let newX = bounds.x;
    let newY = bounds.y;
    let changed = false;
    
    // Ensure window is not completely off-screen
    const minVisibleWidth = 100; // At least 100px visible
    const minVisibleHeight = 50;  // At least 50px visible
    
    // Check horizontal bounds
    if (bounds.x + bounds.width < screenX + minVisibleWidth) {
      newX = screenX; // Too far left
      changed = true;
    } else if (bounds.x > screenX + screenWidth - minVisibleWidth) {
      newX = screenX + screenWidth - bounds.width; // Too far right
      changed = true;
    }
    
    // Check vertical bounds
    if (bounds.y + bounds.height < screenY + minVisibleHeight) {
      newY = screenY; // Too far up
      changed = true;
    } else if (bounds.y > screenY + screenHeight - minVisibleHeight) {
      newY = screenY + screenHeight - bounds.height; // Too far down
      changed = true;
    }
    
    if (changed) {
      overlayWindow.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });
      console.log(`📍 Adjusted overlay position to stay in viewport: (${newX}, ${newY})`);
    }
  }

  // Call bounds checking when moving
  overlayWindow.on('moved', ensureOverlayOnScreen);
  overlayWindow.on('resized', ensureOverlayOnScreen);
  
  // Initial bounds check
  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    ensureOverlayOnScreen();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let icon;
  
  try {
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
      // Resize icon for tray
      icon = icon.resize({ width: 16, height: 16 });
    } else {
      // Create a simple fallback icon
      icon = nativeImage.createEmpty();
    }
  } catch (error) {
    console.error('Error loading tray icon:', error);
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (process.platform === 'darwin') {
            app.dock.show();
          }
        }
      }
    },
    {
      label: 'Toggle Overlay',
      click: () => {
        if (overlayWindow) {
          if (overlayWindow.isVisible()) {
            overlayWindow.hide();
          } else {
            overlayWindow.show();
          }
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Restart Voice',
      click: () => {
        console.log('🔄 Restarting voice connection...');
        startDeepgramConnection();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Voice Command Assistant');
  tray.setContextMenu(contextMenu);
  
  // Show main window on tray click
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        if (process.platform === 'darwin') {
          app.dock.show();
        }
      }
    }
  });
}

// Deepgram WebSocket connection
async function startDeepgramConnection() {
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
  
  if (!DEEPGRAM_API_KEY || DEEPGRAM_API_KEY === 'your-deepgram-key-here') {
    console.log('⚠️  DEEPGRAM_API_KEY not set. Please set your API key:');
    console.log('   export DEEPGRAM_API_KEY="your-actual-api-key-here"');
    console.log('   Then run: yarn start');
    
    // Send error to both windows
    if (mainWindow) {
      mainWindow.webContents.send('deepgram-error', { error: 'API key not configured' });
    }
    if (overlayWindow) {
      overlayWindow.webContents.send('deepgram-error', { error: 'API key not configured' });
    }
    return;
  }

  try {
    // Close existing connection if any
    if (deepgramSocket) {
      deepgramSocket.close();
    }

    console.log('🔗 Connecting to Deepgram...');
    
    // Enhanced Deepgram connection with better parameters
    const deepgramUrl = `wss://api.deepgram.com/v1/listen?` + [
      'model=nova-2',
      'language=en-US',
      'smart_format=true',
      'interim_results=true',
      'endpointing=300',
      'utterance_end_ms=1000',
      'vad_events=true',
      'punctuate=true',
      'diarize=false',
      'multichannel=false',
      'alternatives=1',
      'numerals=true',
      'search=voice command,computer action,execute,run,open,close,click,type,navigate',
      'replace=um:,uh:,er:'
    ].join('&');

    deepgramSocket = new WebSocket(deepgramUrl, {
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'User-Agent': 'ElectronVoiceApp/1.0'
      }
    });

    deepgramSocket.on('open', () => {
      console.log('✅ Deepgram WebSocket opened successfully');
      
      // Send ready signal to both windows
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-ready');
      }
      if (overlayWindow) {
        overlayWindow.webContents.send('deepgram-ready');
      }
    });

    deepgramSocket.on('message', async (data) => {
      try {
        const response = JSON.parse(data);
        
        // Handle speech detection events
        if (response.type === 'SpeechStarted') {
          console.log('🎤 Speech started');
          if (mainWindow) {
            mainWindow.webContents.send('speech-started');
          }
          if (overlayWindow) {
            overlayWindow.webContents.send('speech-started');
          }
          return;
        }
        
        if (response.type === 'UtteranceEnd') {
          console.log('🔇 Speech ended');
          if (mainWindow) {
            mainWindow.webContents.send('speech-ended');
          }
          if (overlayWindow) {
            overlayWindow.webContents.send('speech-ended');
          }
          return;
        }

        // Handle transcription results
        if (response.channel?.alternatives?.[0]?.transcript) {
          const transcript = response.channel.alternatives[0].transcript;
          const confidence = response.channel.alternatives[0].confidence;
          const isFinal = response.is_final;
          
          if (transcript.trim()) {
            console.log(`🎤 Transcript (${isFinal ? 'final' : 'interim'}): "${transcript}" (confidence: ${confidence?.toFixed(2) || 'N/A'})`);
            
            // Send transcript to both windows
            const transcriptData = {
              transcript,
              confidence,
              isFinal,
              timestamp: Date.now()
            };
            
            if (mainWindow) {
              mainWindow.webContents.send('deepgram-transcript', transcriptData);
            }
            if (overlayWindow) {
              overlayWindow.webContents.send('deepgram-transcript', transcriptData);
            }
            
            // Process final transcripts for commands
            if (isFinal && transcript.trim().length > 2) {
              console.log('🤖 Processing voice command:', transcript);
              
              // Add timestamp and send to task orchestrator
              try {
                await processVoiceCommand(transcript, confidence);
              } catch (error) {
                console.error('Error processing voice command:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ Error parsing Deepgram response:', error);
      }
    });

    deepgramSocket.on('close', (code, reason) => {
      console.log(`🔌 Deepgram WebSocket closed: ${code} ${reason}`);
      
      // Send close event to both windows
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-closed', { code, reason: reason.toString() });
      }
      if (overlayWindow) {
        overlayWindow.webContents.send('deepgram-closed', { code, reason: reason.toString() });
      }
      
      // Auto-reconnect after delay (unless app is quitting)
      if (!app.isQuiting && code !== 1000) {
        console.log('🔄 Auto-reconnecting to Deepgram in 3 seconds...');
        setTimeout(() => {
          startDeepgramConnection();
        }, 3000);
      }
    });

    deepgramSocket.on('error', (error) => {
      console.error('🚨 Deepgram WebSocket error:', error);
      
      // Send error to both windows
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-error', { error: error.message });
      }
      if (overlayWindow) {
        overlayWindow.webContents.send('deepgram-error', { error: error.message });
      }
    });

  } catch (error) {
    console.error('❌ Failed to initialize Deepgram connection:', error);
  }
}

// Process voice commands through task orchestrator
async function processVoiceCommand(transcript, confidence = null) {
  try {
    console.log(`🎯 Processing command: "${transcript}"`);
    
    // Check network connectivity first
    const isOnline = await checkNetworkConnectivity();
    if (!isOnline) {
      console.log('❌ No internet connection - handling simple commands only');
      await handleSimpleAction(transcript);
      return;
    }

    // Send to task orchestrator for complex processing
    const result = await taskOrchestrator.processCommand(transcript, {
      confidence,
      timestamp: Date.now(),
      source: 'voice'
    });
    
    console.log('✅ Command processing result:', result);
    
    // Send result to both windows
    if (mainWindow) {
      mainWindow.webContents.send('command-result', result);
    }
    if (overlayWindow) {
      overlayWindow.webContents.send('command-result', result);
    }
    
  } catch (error) {
    console.error('❌ Error in voice command processing:', error);
    
    // Fallback to simple actions
    try {
      await handleSimpleAction(transcript);
    } catch (fallbackError) {
      console.error('❌ Fallback processing also failed:', fallbackError);
    }
  }
}

// Check network connectivity
async function checkNetworkConnectivity() {
  return new Promise((resolve) => {
    require('dns').lookup('google.com', (err) => {
      if (err && err.code === "ENOTFOUND") {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Simple offline command handling
async function handleSimpleAction(transcript) {
  const command = transcript.toLowerCase().trim();
  
  console.log(`🔧 Handling simple action: "${command}"`);
  
  try {
    // Basic system commands that don't require AI
    if (command.includes('minimize') || command.includes('hide')) {
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.hide();
      }
      return { success: true, action: 'minimized app' };
    }
    
    if (command.includes('show') || command.includes('restore')) {
      if (mainWindow) {
        mainWindow.show();
        if (process.platform === 'darwin') {
          app.dock.show();
        }
      }
      return { success: true, action: 'showed app' };
    }
    
    if (command.includes('quit') || command.includes('exit') || command.includes('close app')) {
      app.quit();
      return { success: true, action: 'quitting app' };
    }
    
    // Simple applescript/system commands for macOS
    if (process.platform === 'darwin') {
      if (command.includes('open calculator')) {
        exec('open -a Calculator');
        return { success: true, action: 'opened calculator' };
      }
      
      if (command.includes('open safari')) {
        exec('open -a Safari');
        return { success: true, action: 'opened safari' };
      }
      
      if (command.includes('open chrome')) {
        exec('open -a "Google Chrome"');
        return { success: true, action: 'opened chrome' };
      }
      
      if (command.includes('volume up')) {
        exec('osascript -e "set volume output volume (output volume of (get volume settings) + 10)"');
        return { success: true, action: 'increased volume' };
      }
      
      if (command.includes('volume down')) {
        exec('osascript -e "set volume output volume (output volume of (get volume settings) - 10)"');
        return { success: true, action: 'decreased volume' };
      }
      
      if (command.includes('mute')) {
        exec('osascript -e "set volume with output muted"');
        return { success: true, action: 'muted audio' };
      }
    }
    
    console.log(`ℹ️  No simple action found for: "${command}"`);
    return { success: false, error: 'No simple action available' };
    
  } catch (error) {
    console.error('❌ Error in simple action:', error);
    return { success: false, error: error.message };
  }
}

// IPC Handlers
ipcMain.handle('start-recording', async () => {
  console.log('🎤 Starting recording...');
  await startDeepgramConnection();
  return { success: true };
});

ipcMain.handle('stop-recording', async () => {
  console.log('🛑 Stopping recording...');
  if (deepgramSocket) {
    deepgramSocket.close();
  }
  return { success: true };
});

ipcMain.handle('send-audio', async (event, audioData) => {
  if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
    const now = Date.now();
    
    // Throttle audio sending to prevent overwhelming the API
    if (now - lastAudioSentTime >= 50) { // 20 FPS max
      deepgramSocket.send(audioData);
      lastAudioSentTime = now;
    }
  }
  return { success: true };
});

ipcMain.handle('process-manual-command', async (event, command) => {
  console.log(`📝 Manual command received: "${command}"`);
  try {
    await processVoiceCommand(command, 1.0); // High confidence for manual commands
    return { success: true };
  } catch (error) {
    console.error('Error processing manual command:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-system-prompt', async (event, prompt) => {
  try {
    saveSystemPrompt(prompt);
    if (aiService) {
      aiService.updateSystemPrompt(prompt);
    }
    if (taskOrchestrator) {
      taskOrchestrator.updateSystemPrompt(prompt);
    }
    return { success: true };
  } catch (error) {
    console.error('Error saving system prompt:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-system-prompt', async () => {
  try {
    const prompt = loadSavedSystemPrompt();
    return { success: true, prompt };
  } catch (error) {
    console.error('Error loading system prompt:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('execute-atomic-step', async (event, step) => {
  return await executeAtomicStep(step);
});

async function executeAtomicStep(step) {
  try {
    console.log(`⚙️ Executing atomic step:`, step);
    
    // Simple step execution - can be enhanced with more sophisticated logic
    if (step.type === 'click') {
      // Use system click at coordinates
      const clickScript = `osascript -e 'tell application "System Events" to click at {${step.x}, ${step.y}}'`;
      await new Promise((resolve, reject) => {
        exec(clickScript, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });
      
      return { success: true, message: `Clicked at (${step.x}, ${step.y})` };
    }
    
    if (step.type === 'type') {
      // Use system typing
      const typeScript = `osascript -e 'tell application "System Events" to keystroke "${step.text}"'`;
      await new Promise((resolve, reject) => {
        exec(typeScript, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });
      
      return { success: true, message: `Typed: ${step.text}` };
    }
    
    if (step.type === 'key') {
      // Use system key press
      const keyScript = `osascript -e 'tell application "System Events" to key code ${step.keyCode}'`;
      await new Promise((resolve, reject) => {
        exec(keyScript, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });
      
      return { success: true, message: `Pressed key: ${step.key}` };
    }
    
    return { success: false, error: 'Unknown step type' };
    
  } catch (error) {
    console.error('❌ Error executing atomic step:', error);
    return { success: false, error: error.message };
  }
}

// Notification functions for UI feedback
function notifyScreenshotAnalysisStart(failedStep) {
  console.log(`📸 Starting screenshot analysis for failed step: ${failedStep}`);
  if (overlayWindow) {
    overlayWindow.webContents.send('screenshot-analysis-start', { step: failedStep });
  }
}

function notifyScreenshotAnalysisComplete(success, suggestedAction, failureReason) {
  console.log(`📋 Screenshot analysis complete - Success: ${success}`);
  if (suggestedAction) {
    console.log(`💡 Suggested action: ${suggestedAction}`);
  }
  if (failureReason) {
    console.log(`❌ Failure reason: ${failureReason}`);
  }
  
  if (overlayWindow) {
    overlayWindow.webContents.send('screenshot-analysis-complete', {
      success,
      suggestedAction,
      failureReason
    });
  }
}

function notifyVisualFallbackResult(success, action, error) {
  console.log(`👁️  Visual fallback result - Success: ${success}, Action: ${action}`);
  if (error) {
    console.log(`❌ Error: ${error}`);
  }
  
  if (overlayWindow) {
    overlayWindow.webContents.send('visual-fallback-result', {
      success,
      action,
      error
    });
  }
}

function notifyScreenshotCapture(status, data) {
  if (overlayWindow) {
    overlayWindow.webContents.send('screenshot-capture', { status, data });
  }
}

function notifyAIAnalysis(status, data) {
  if (overlayWindow) {
    overlayWindow.webContents.send('ai-analysis', { status, data });
  }
}

function notifyCloudUpload(status, data) {
  if (overlayWindow) {
    overlayWindow.webContents.send('cloud-upload', { status, data });
  }
}

// App initialization
app.whenReady().then(async () => {
  await createWindow();
  createOverlayWindow();
  createTray();
  
  // Start Deepgram connection after a brief delay
  setTimeout(() => {
    startDeepgramConnection();
  }, 2000);
});

app.on('window-all-closed', () => {
  // Don't quit on window close - keep running in background
  if (process.platform !== 'darwin') {
    // On Windows/Linux, keep the app running with tray
    console.log('🖥️ All windows closed - app continues in background');
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    createOverlayWindow();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (deepgramSocket) {
    deepgramSocket.close();
  }
});

console.log('🚀 Voice Command Assistant started with comprehensive AI backend');
