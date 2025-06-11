const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const { exec } = require("child_process");
const AIService = require("./ai-service");
const TaskOrchestrator = require("./task-orchestrator");
const AtomicScriptGenerator = require("./atomic-script-generator");
const VisualGuidance = require("./visual-guidance");
require("dotenv").config();

// Add Deepgram API key
process.env.DEEPGRAM_API_KEY = 'a076385db3d2cb8e4eb9c4276b2eed2ae70d154c';

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
let onboardingWindow;
let deepgramSocket;
let aiService;
let taskOrchestrator;
let atomicScriptGenerator;
let visualGuidance;
let tray = null;
let lastAudioSentTime = Date.now();
let userPreferences = null;
let lastAudioLogTime = Date.now();

// Connection management variables
let deepgramConnectionAttempts = 0;
let lastConnectionAttempt = 0;
let reconnectTimeout = null;
let isConnecting = false;

// Global cleanup function to fully reset Deepgram state
function cleanupDeepgramState() {
  console.log("🧹 Cleaning up Deepgram state...");
  
  // Clear any pending reconnection attempts
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
    console.log("🔄 Cleared pending reconnection timeout");
  }
  
  // Reset connection management variables
  isConnecting = false;
  deepgramConnectionAttempts = 0;
  lastConnectionAttempt = 0;
  
  // Close WebSocket if exists
  if (deepgramSocket) {
    deepgramSocket.removeAllListeners();
    if (deepgramSocket.readyState === WebSocket.OPEN || deepgramSocket.readyState === WebSocket.CONNECTING) {
      deepgramSocket.close(1000, "Cleanup");
    }
    deepgramSocket = null;
  }
  
  console.log("✅ Deepgram state cleaned up");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
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
      
      // Overlay should always stay visible - no need to show/hide based on main window
      
      // Show notification that app is running in background
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
      
      console.log("App minimized to background - voice commands still active");
      return false;
    }
  });

  // Remove overlay show/hide logic - overlay should always be visible
  mainWindow.on('show', () => {
    // Overlay stays visible
  });

  mainWindow.on('hide', () => {
    // Overlay stays visible
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
  
  // Set API keys for all providers
  aiService.setApiKeys({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  });
  
  taskOrchestrator = new TaskOrchestrator(process.env.ANTHROPIC_API_KEY);
  atomicScriptGenerator = new AtomicScriptGenerator(process.env.ANTHROPIC_API_KEY);
  visualGuidance = new VisualGuidance(process.env.ANTHROPIC_API_KEY);
  
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
    notifyClaudeAnalysis,
    notifyCloudUpload
  });

  // Send environment variables to renderer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("init-env", {
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    });
  });
}

function createOverlayWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  // Calculate safe positioning with proper margins
  const overlayWidth = 380;
  const overlayHeight = 400; // Use a mid-range height for initial positioning
  const margin = 30; // Increased margin for better spacing
  
  // Position overlay in top-right corner with safe margins (moved higher up)
  const safeX = Math.max(margin, width - overlayWidth - margin);
  const safeY = Math.max(margin, 100); // Positioned much higher up on screen

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: 240, // Start with minimum height
    minHeight: 240,
    maxHeight: 600,
    x: safeX,
    y: safeY,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
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

  // Add bounds checking to keep window in viewport
  overlayWindow.on('move', () => {
    const bounds = overlayWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = display.workArea;
    
    let newX = bounds.x;
    let newY = bounds.y;
    
    // Keep window within screen bounds
    if (bounds.x < screenX) newX = screenX;
    if (bounds.y < screenY) newY = screenY;
    if (bounds.x + bounds.width > screenX + screenWidth) newX = screenX + screenWidth - bounds.width;
    if (bounds.y + bounds.height > screenY + screenHeight) newY = screenY + screenHeight - bounds.height;
    
    // Only move if necessary to avoid infinite loops
    if (newX !== bounds.x || newY !== bounds.y) {
      overlayWindow.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });
    }
  });

  // Make overlay persistent across all screens and workspaces
  overlayWindow.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
  overlayWindow.setAlwaysOnTop(true, 'floating');
  
  // Ensure overlay is always visible on all screens
  overlayWindow.on('closed', () => {
    // If overlay is accidentally closed, recreate it
    if (!app.isQuiting) {
      createOverlayWindow();
    }
  });

  // Keep overlay on top and visible at all times
  overlayWindow.on('blur', () => {
    overlayWindow.setAlwaysOnTop(true, 'floating');
  });

  // Keep overlay visible and on top (but allow user positioning)
  setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed() && !app.isQuiting) {
      // Ensure overlay stays on top and visible
      if (!overlayWindow.isVisible()) {
        overlayWindow.show();
      }
      overlayWindow.setAlwaysOnTop(true, 'floating');
      // Note: Removed auto-repositioning to allow user dragging
    }
  }, 5000); // Check every 5 seconds
  
  // Always show overlay immediately
  overlayWindow.show();
}

function createTray() {
  // Create a simple tray icon (you can replace with a better icon)
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  
  // Create a simple icon if none exists
  const icon = nativeImage.createFromNamedImage('NSStatusAvailable', [16, 16]);
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Voice Assistant',
      click: () => {
        mainWindow.show();
        // Overlay stays visible - no hiding
        if (process.platform === 'darwin') {
          app.dock.show();
        }
      }
    },
    {
      label: 'Hide Overlay Widget',
      click: () => {
        if (overlayWindow) {
          overlayWindow.hide();
        }
      }
    },
    {
      label: 'Show Overlay Widget',
      click: () => {
        if (overlayWindow) {
          overlayWindow.show();
        }
      }
    },
    {
      label: 'Voice Commands Active',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Voice Command Assistant - Running');
  tray.setContextMenu(contextMenu);
  
  // Double-click to show window
  tray.on('double-click', () => {
    mainWindow.show();
    // Overlay stays visible
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  });
}

app.whenReady().then(() => {
  // Check if onboarding is completed
  if (shouldShowOnboarding()) {
    createOnboardingWindow();
  } else {
    startMainApp();
  }
  
  // Prevent app suspension
  app.setName('VoiceMac Assistant');
  
  // Keep the app running in background
  if (process.platform === 'darwin') {
    // Remove the problematic dock icon setting for now
    // app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  }
});

app.on("window-all-closed", () => {
  // Don't quit the app when all windows are closed - keep running in background
  if (process.platform !== "darwin") {
    // On Windows/Linux, minimize to system tray instead of quitting
    console.log("All windows closed - running in background");
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (shouldShowOnboarding()) {
      createOnboardingWindow();
    } else {
      createWindow();
    }
  } else if (mainWindow) {
    mainWindow.show();
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  }
});

// Prevent the app from being suspended
app.on('before-quit', () => {
  app.isQuiting = true;
});

// Keep the app active even when hidden
setInterval(() => {
  // This prevents the app from going to sleep
  // Small periodic task to keep the event loop active
}, 30000); // Every 30 seconds

// Forward command status to overlay
ipcMain.on("command-processing", (event, command) => {
  if (overlayWindow) {
    overlayWindow.webContents.send("command-processing", command);
  }
});

ipcMain.on("command-success", (event, command) => {
  if (overlayWindow) {
    overlayWindow.webContents.send("command-success", command);
  }
});

ipcMain.on("command-error", (event, command, error) => {
  if (overlayWindow) {
    overlayWindow.webContents.send("command-error", command, error);
  }
});

// Handle overlay minimize request
ipcMain.handle("minimize-overlay", async () => {
  if (overlayWindow) {
    overlayWindow.hide();
    return { success: true, message: "Overlay minimized to tray" };
  }
  return { success: false, message: "Overlay window not found" };
});

// Handle overlay close request
ipcMain.handle("close-overlay", async () => {
  if (overlayWindow) {
    overlayWindow.hide();
    return { success: true, message: "Overlay closed" };
  }
  return { success: false, message: "Overlay window not found" };
});

// Handle audio data with better error handling and logging
ipcMain.on("audio-data", (event, buffer) => {
  if (!deepgramSocket) {
    console.log("No Deepgram connection available - dropping audio data");
    return;
  }

  if (deepgramSocket.readyState !== WebSocket.OPEN) {
    console.log(`Deepgram WebSocket not ready (state: ${deepgramSocket.readyState}) - dropping audio data`);
    return;
  }

  try {
    // Convert ArrayBuffer to Buffer
    const audioBuffer = Buffer.from(buffer);
    
    // Validate buffer
    if (audioBuffer.length === 0) {
      console.warn("Received empty audio buffer");
      return;
    }

    if (audioBuffer.length % 2 !== 0) {
      console.warn(`Audio buffer length ${audioBuffer.length} is odd, trimming`);
      audioBuffer = audioBuffer.subarray(0, audioBuffer.length - 1);
    }

    // Send audio data
    deepgramSocket.send(audioBuffer);

    // Log audio data periodically
    const now = Date.now();
    if (now - lastAudioLogTime > 5000) {
      console.log(`📊 Sent ${audioBuffer.length} bytes of audio data to Deepgram`);
      lastAudioLogTime = now;
    }
  } catch (error) {
    console.error("Error sending audio data to Deepgram:", error);
    
    // Don't automatically reconnect - let the UI handle it
    mainWindow.webContents.send("deepgram-error", "Failed to send audio data");
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("deepgram-error", "Failed to send audio data");
    }
  }
});

// Enhanced Deepgram connection function with rate limiting
async function startDeepgramConnection() {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("Deepgram API key not found");
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
      console.log("Connection attempt already in progress, skipping...");
      return false;
    }

    // Rate limiting: wait between connection attempts
    const now = Date.now();
    const timeSinceLastAttempt = now - lastConnectionAttempt;
    const minWaitTime = Math.min(5000 * Math.pow(2, deepgramConnectionAttempts), 60000); // Exponential backoff, max 1 minute

    if (timeSinceLastAttempt < minWaitTime) {
      const waitTime = minWaitTime - timeSinceLastAttempt;
      console.log(`⏳ Rate limiting: waiting ${Math.round(waitTime/1000)}s before next connection attempt...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    isConnecting = true;
    lastConnectionAttempt = Date.now();
    deepgramConnectionAttempts++;

    // Close existing connection if any
    if (deepgramSocket) {
      console.log("Closing existing Deepgram connection...");
      deepgramSocket.removeAllListeners();
      if (deepgramSocket.readyState === WebSocket.OPEN || deepgramSocket.readyState === WebSocket.CONNECTING) {
        deepgramSocket.close();
      }
      deepgramSocket = null;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Creating new Deepgram WebSocket connection (attempt ${deepgramConnectionAttempts})...`);
    console.log("Using API key:", process.env.DEEPGRAM_API_KEY.substring(0, 8) + '...');

    // Create new WebSocket connection with optimized parameters
    deepgramSocket = new WebSocket(
      "wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&punctuate=true&interim_results=true&endpointing=500",
      {
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        },
      }
    );

    // Set up event handlers
    deepgramSocket.on("open", () => {
      console.log("✅ Deepgram WebSocket opened successfully");
      console.log("Connection ready for audio streaming");
      
      // Reset connection attempts on successful connection
      deepgramConnectionAttempts = 0;
      isConnecting = false;
      
      mainWindow.webContents.send("deepgram-ready");
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send("deepgram-ready");
      }
    });

    deepgramSocket.on("message", (data) => {
      try {
        const response = JSON.parse(data);
        console.log("Received transcript:", response.channel?.alternatives[0]?.transcript || "no transcript");
        
        mainWindow.webContents.send("deepgram-transcript", response);
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send("deepgram-transcript", response);
        }
      } catch (error) {
        console.error("Error parsing Deepgram response:", error);
      }
    });

    deepgramSocket.on("close", (code, reason) => {
      console.log(`🔌 Deepgram WebSocket closed: ${code} - ${reason}`);
      isConnecting = false;
      
      // Notify UI of disconnection but don't auto-reconnect
      mainWindow.webContents.send("deepgram-closed", { code, reason });
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send("deepgram-closed", { code, reason });
      }
      
      console.log("🔌 Connection closed - manual reconnection required");
    });

    deepgramSocket.on("error", (error) => {
      console.error("🚨 Deepgram WebSocket error:", error.message);
      isConnecting = false;
      
      // Handle specific error types
      if (error.message.includes('429')) {
        console.log("⚠️ Rate limited by Deepgram - backing off");
        deepgramConnectionAttempts += 2; // Increase backoff for rate limiting
      }
    });

    // Wait for connection with timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        isConnecting = false;
        reject(new Error("Deepgram connection timeout (15s)"));
      }, 15000);

      deepgramSocket.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      deepgramSocket.once("error", (error) => {
        clearTimeout(timeout);
        isConnecting = false;
        reject(error);
      });
    });

    return true;
  } catch (error) {
    isConnecting = false;
    console.error("Failed to start Deepgram:", error);
    
    // Don't spam error messages for rate limiting
    if (!error.message.includes('429') && !error.message.includes('timeout')) {
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        type: error.type
      });
    }
    
    // Only send error to UI if it's not a rate limiting or connection attempt issue
    if (!error.message.includes('429') && deepgramConnectionAttempts <= 3) {
      mainWindow.webContents.send("deepgram-error", error.message);
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send("deepgram-error", error.message);
      }
    }
    
    return false;
  }
}

// Handle starting Deepgram connection
ipcMain.handle("start-deepgram", async (event) => {
  try {
    console.log("🔗 Starting Deepgram connection...");
    
    // First clean up any existing state
    cleanupDeepgramState();
    
    // Wait a moment for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = await startDeepgramConnection();
    if (result) {
      console.log("✅ Deepgram connection started successfully");
      return { success: true };
    } else {
      console.log("❌ Failed to start Deepgram connection");
      return { success: false, error: "Failed to establish connection" };
    }
  } catch (error) {
    console.error("Error starting Deepgram:", error);
    return { success: false, error: error.message };
  }
});

// Handle stopping Deepgram connection
ipcMain.handle("stop-deepgram", async (event) => {
  try {
    console.log("🔗 Stopping Deepgram connection...");
    
    // Use the global cleanup function
    cleanupDeepgramState();
    
    // Notify renderers
    mainWindow.webContents.send("deepgram-closed");
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("deepgram-closed");
    }
    
    console.log("✅ Deepgram connection stopped and state cleaned");
    return { success: true };
  } catch (error) {
    console.error("Error stopping Deepgram:", error);
    return { success: false, error: error.message };
  }
});

// Handle getting OSA script from AI service
ipcMain.handle("get-osa-script", async (event, transcript) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Anthropic API key not found");
    }

    if (typeof transcript !== "string") {
      throw new Error("Invalid transcript type: " + typeof transcript);
    }

    console.log("Getting OSA script for:", transcript);
    const result = await aiService.getOSAScript(transcript);

    if (result.error) {
      console.error("AI service error:", result.error);
      return {
        success: false,
        error: result.error,
      };
    }

    if (!result.steps || !result.steps[0] || !result.steps[0].script) {
      throw new Error("Invalid script generated");
    }

    const script = result.steps[0].script;
    console.log("Generated script:", script);

    return {
      success: true,
      response: script,
    };
  } catch (error) {
    console.error("Error generating OSA script:", error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Enhanced task execution using the new orchestrator
ipcMain.handle("execute-dynamic-task", async (event, transcript) => {
  try {
    console.log("Executing dynamic task:", transcript);
    
    // Check if this is a simple single-action task that can use atomic scripts
    const simpleActions = [
      'open safari', 'open chrome', 'open firefox', 'open finder', 'open notes',
      'take screenshot', 'volume up', 'volume down', 'lock screen'
    ];
    
    const isSimpleAction = simpleActions.some(action => 
      transcript.toLowerCase().includes(action)
    );

    if (isSimpleAction) {
      // Handle simple actions with predefined scripts
      return await handleSimpleAction(transcript);
    } else {
      // Handle complex tasks with the orchestrator
      return await taskOrchestrator.executeTask(transcript);
    }
  } catch (error) {
    console.error("Dynamic task execution error:", error);
    return { success: false, error: error.message };
  }
});

// Handle overlay window resize
ipcMain.on("resize-overlay", (event, { width, height }) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const currentBounds = overlayWindow.getBounds();
    overlayWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: width,
      height: height
    });
  }
});

// Handle manual command execution from overlay
ipcMain.handle("execute-command", async (event, transcript, historyContext = null) => {
  try {
    console.log("🎤 Manual command from overlay:", transcript);
    if (historyContext && historyContext.length > 0) {
      console.log("📚 History context provided:", historyContext.length, "previous commands");
    }
    
    // Send notifications to both windows about command processing
    if (mainWindow) {
      mainWindow.webContents.send("command-processing", transcript);
    }
    if (overlayWindow) {
      overlayWindow.webContents.send("command-processing", transcript);
    }
    
    // Set history context in task orchestrator if provided
    if (historyContext && taskOrchestrator.setHistoryContext) {
      taskOrchestrator.setHistoryContext(historyContext);
    }
    
    // Use the same logic as execute-dynamic-task but with proper routing
    const result = await taskOrchestrator.executeTask(transcript);
    
    // Handle different result types
    if (result.type === 'CLARIFICATION_NEEDED') {
      console.log("❓ Clarification needed for:", transcript);
      const clarificationMessage = result.message || "Could you please be more specific about what you'd like me to do?";
      
      // Send clarification request to both windows
      if (mainWindow) {
        mainWindow.webContents.send("clarification-needed", transcript, clarificationMessage);
      }
      if (overlayWindow) {
        overlayWindow.webContents.send("clarification-needed", transcript, clarificationMessage);
      }
    } else if (result.success) {
      console.log("✅ Manual command executed successfully");
      if (mainWindow) {
        mainWindow.webContents.send("command-success", transcript);
      }
      if (overlayWindow) {
        overlayWindow.webContents.send("command-success", transcript);
      }
    } else {
      console.log("❌ Manual command failed:", result.error || result.message);
      if (mainWindow) {
        mainWindow.webContents.send("command-error", transcript, result.error || result.message);
      }
      if (overlayWindow) {
        overlayWindow.webContents.send("command-error", transcript, result.error || result.message);
      }
    }
    
    return result;
  } catch (error) {
    console.error("Manual command execution error:", error);
    
    // Notify about error
    if (mainWindow) {
      mainWindow.webContents.send("command-error", transcript, error.message);
    }
    if (overlayWindow) {
      overlayWindow.webContents.send("command-error", transcript, error.message);
    }
    
    return { success: false, error: error.message };
  }
});

// Handle system prompt updates
ipcMain.handle("update-system-prompt", async (event, newPrompt) => {
  try {
    console.log("Updating system prompt...");
    
    // Update the AI service with the new prompt
    if (aiService) {
      aiService.updateSystemPrompt(newPrompt);
    }
    
    // Update task orchestrator and other services that might use prompts
    if (taskOrchestrator) {
      taskOrchestrator.updateSystemPrompt(newPrompt);
    }
    
    // Save to persistent storage
    try {
      const fs = require("fs");
      const path = require("path");
      const settingsPath = path.join(__dirname, 'settings.json');
      const settings = { systemPrompt: newPrompt };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("✅ System prompt saved to settings.json");
    } catch (saveError) {
      console.error("Warning: Could not save system prompt to file:", saveError);
      // Don't fail the update just because file save failed
    }
    
    console.log("✅ System prompt updated successfully");
    return { success: true };
  } catch (error) {
    console.error("Error updating system prompt:", error);
    return { success: false, error: error.message };
  }
});

// Get current system prompt
ipcMain.handle("get-system-prompt", async (event) => {
  try {
    if (aiService && aiService.getSystemPrompt) {
      return { success: true, prompt: aiService.getSystemPrompt() };
    }
    return { success: false, error: "AI service not available" };
  } catch (error) {
    console.error("Error getting system prompt:", error);
    return { success: false, error: error.message };
  }
});

// Get available models
ipcMain.handle("get-available-models", async (event) => {
  try {
    if (aiService && aiService.getAvailableModels) {
      return { success: true, models: aiService.getAvailableModels() };
    }
    return { success: false, error: "AI service not available" };
  } catch (error) {
    console.error("Error getting available models:", error);
    return { success: false, error: error.message };
  }
});

// Get current model configurations
ipcMain.handle("get-model-config", async (event) => {
  try {
    if (aiService) {
      return { 
        success: true, 
        textModel: aiService.getTextModel(),
        imageModel: aiService.getImageModel()
      };
    }
    return { success: false, error: "AI service not available" };
  } catch (error) {
    console.error("Error getting model config:", error);
    return { success: false, error: error.message };
  }
});

// Set text model
ipcMain.handle("set-text-model", async (event, provider, model) => {
  try {
    if (aiService && aiService.setTextModel) {
      aiService.setTextModel(provider, model);
      return { success: true };
    }
    return { success: false, error: "AI service not available" };
  } catch (error) {
    console.error("Error setting text model:", error);
    return { success: false, error: error.message };
  }
});

// Set image model
ipcMain.handle("set-image-model", async (event, provider, model) => {
  try {
    if (aiService && aiService.setImageModel) {
      aiService.setImageModel(provider, model);
      return { success: true };
    }
    return { success: false, error: "AI service not available" };
  } catch (error) {
    console.error("Error setting image model:", error);
    return { success: false, error: error.message };
  }
});

// Test all models
ipcMain.handle("test-all-models", async (event) => {
  try {
    if (aiService && aiService.testAllModels) {
      console.log("🧪 Starting model testing...");
      const results = await aiService.testAllModels();
      return { success: true, results };
    }
    return { success: false, error: "AI service not available" };
  } catch (error) {
    console.error("Error testing models:", error);
    return { success: false, error: error.message };
  }
});

// Handle simple actions with atomic scripts
async function handleSimpleAction(transcript) {
  const lowerTranscript = transcript.toLowerCase();
  
  let action = null;
  if (lowerTranscript.includes('open safari')) action = 'open_safari';
  else if (lowerTranscript.includes('open chrome')) action = 'open_chrome';
  else if (lowerTranscript.includes('open firefox')) action = 'open_firefox';
  else if (lowerTranscript.includes('open finder')) action = 'open_finder';
  else if (lowerTranscript.includes('open notes')) action = 'open_notes';
  else if (lowerTranscript.includes('take screenshot')) action = 'screenshot';
  else if (lowerTranscript.includes('volume up')) action = 'volume_up';
  else if (lowerTranscript.includes('volume down')) action = 'volume_down';
  else if (lowerTranscript.includes('lock screen')) action = 'lock_screen';

  if (action) {
    const script = atomicScriptGenerator.getPredefinedScript(action);
    if (script) {
      const formattedScript = atomicScriptGenerator.formatForExecution(script);
      
      return new Promise((resolve) => {
        exec(formattedScript, (error, stdout, stderr) => {
          if (error) {
            console.error("Simple action execution error:", error);
            resolve({ success: false, error: error.message });
          } else {
            console.log("Simple action completed successfully");
            resolve({ success: true, message: "Action completed successfully" });
          }
        });
      });
    }
  }

  // If not a recognized simple action, fall back to orchestrator
  return await taskOrchestrator.executeTask(transcript);
}

// Create predefined task templates for common requests
ipcMain.handle("execute-web-task", async (event, taskType, params) => {
  try {
    let steps = [];

    switch (taskType) {
      case 'youtube_search':
        steps = await atomicScriptGenerator.generateYouTubeSteps(params.query);
        break;
      case 'google_search':
        steps = await atomicScriptGenerator.generateWebBrowsingSteps("google.com", params.query);
        break;
      case 'navigate_url':
        steps = await atomicScriptGenerator.generateWebBrowsingSteps(params.url);
        break;
      default:
        return { success: false, error: "Unknown task type" };
    }

    // Use TaskOrchestrator to execute steps (handles visual guidance properly)
    console.log(`🌐 Executing web task ${taskType} with ${steps.length} steps`);
    
    // Execute each step using TaskOrchestrator's step execution
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`📋 Executing step ${i + 1}/${steps.length}: ${step.description}`);
      
      // Use TaskOrchestrator's executeIterationStep method for proper handling
      const result = await taskOrchestrator.executeIterationStep(step);
      
      if (!result.success) {
        console.error(`❌ Step ${i + 1} failed:`, result.error);
        return {
          success: false,
          stepNumber: i + 1,
          totalSteps: steps.length,
          error: result.error
        };
      } else {
        console.log(`✅ Step ${i + 1} completed successfully`);
      }

      // Wait between steps
      if (i < steps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, step.delayAfter || 1000));
      }
    }

    console.log(`🎉 Web task ${taskType} completed successfully`);
    return { success: true, message: "Web task completed successfully" };
  } catch (error) {
    console.error("Web task execution error:", error);
    return { success: false, error: error.message };
  }
});

// Deprecated method - for backward compatibility
async function executeAtomicStep(step) {
  console.warn("⚠️ executeAtomicStep is deprecated, use TaskOrchestrator.executeIterationStep instead");
  
  if (!taskOrchestrator) {
    throw new Error("TaskOrchestrator not initialized");
  }
  return await taskOrchestrator.executeIterationStep(step);
}

// Get task orchestrator status
ipcMain.handle("get-task-status", async () => {
  return taskOrchestrator.getStatus();
});

// Stop current task execution
ipcMain.handle("stop-task", async () => {
  const result = taskOrchestrator.stop();
  console.log("🛑 Stop task result:", result);
  return result;
});

// Clear queue and stop all pending tasks
ipcMain.handle("clear-queue", async () => {
  try {
    console.log("🗑️ Clear queue request received");
    
    // Stop current task if running
    const stopResult = taskOrchestrator.stop();
    console.log("🛑 Stop result during clear:", stopResult);
    
    // Get status to check what was cleared
    const status = taskOrchestrator.getStatus();
    console.log("📊 Task orchestrator status after clear:", status);
    
    if (stopResult.wasCancelled) {
      return {
        success: true,
        message: `Cancelled active task and cleared queue`,
        details: {
          cancelledTask: stopResult.cancelledTask,
          queueLength: status.queueLength
        }
      };
    } else {
      return {
        success: true,
        message: "Queue cleared (no active tasks)",
        details: {
          queueLength: status.queueLength
        }
      };
    }
  } catch (error) {
    console.error("❌ Error clearing queue:", error);
    return {
      success: false,
      message: `Failed to clear queue: ${error.message}`,
      error: error.message
    };
  }
});

// Take a screenshot for verification
ipcMain.handle("take-screenshot", async () => {
  try {
    const result = await atomicScriptGenerator.takeScreenshot();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Update the existing execute-script handler to use the new system
ipcMain.handle("execute-script", async (event, script) => {
  return new Promise((resolve, reject) => {
    if (typeof script !== "string") {
      console.error("Invalid script type:", typeof script);
      reject(new Error("Script must be a string"));
      return;
    }

    console.log("Executing script:", script);

    // Execute the script directly since it's already properly formatted from AI service
    exec(script, (error, stdout, stderr) => {
      if (error) {
        console.error("Script execution error:", error);
        reject(error);
      } else {
        console.log("Script execution successful");
        console.log("stdout:", stdout);
        console.log("stderr:", stderr);
        resolve(stdout || stderr || "Command executed successfully");
      }
    });
  });
});

// Add functions to send screenshot analysis notifications
function notifyScreenshotAnalysisStart(failedStep) {
  mainWindow.webContents.send("screenshot-analysis-start", { failedStep });
  if (overlayWindow) {
    overlayWindow.webContents.send("screenshot-analysis-start", { failedStep });
  }
}

function notifyScreenshotAnalysisComplete(success, suggestedAction, failureReason) {
  mainWindow.webContents.send("screenshot-analysis-complete", { 
    success, 
    suggestedAction, 
    failureReason 
  });
  if (overlayWindow) {
    overlayWindow.webContents.send("screenshot-analysis-complete", { 
      success, 
      suggestedAction, 
      failureReason 
    });
  }
}

function notifyVisualFallbackResult(success, action, error) {
  const eventName = success ? "visual-fallback-success" : "visual-fallback-failed";
  const data = success ? { action } : { error };
  
  mainWindow.webContents.send(eventName, data);
  if (overlayWindow) {
    overlayWindow.webContents.send(eventName, data);
  }
}

function notifyScreenshotCapture(status, data) {
  mainWindow.webContents.send("screenshot-capture", { status, data });
  if (overlayWindow) {
    overlayWindow.webContents.send("screenshot-capture", { status, data });
  }
}

function notifyClaudeAnalysis(status, data) {
  mainWindow.webContents.send("claude-analysis", { status, data });
  if (overlayWindow) {
    overlayWindow.webContents.send("claude-analysis", { status, data });
  }
}

function notifyCloudUpload(status, data) {
  mainWindow.webContents.send("cloud-upload", { status, data });
  if (overlayWindow) {
    overlayWindow.webContents.send("cloud-upload", { status, data });
  }
}

// Onboarding System Functions
function shouldShowOnboarding() {
  try {
    const preferencesPath = path.join(__dirname, 'user-preferences.json');
    if (fs.existsSync(preferencesPath)) {
      const preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
      return !preferences.onboardingCompleted;
    }
  } catch (error) {
    console.error('Error checking onboarding status:', error);
  }
  return true; // Show onboarding by default
}

function createOnboardingWindow() {
  onboardingWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hiddenInset',
    show: true,
    center: true
  });

  onboardingWindow.loadFile('onboarding.html');
  
  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });
}

function startMainApp() {
  createWindow();
  createOverlayWindow();
  createTray();
  
  // Don't auto-start Deepgram - let user manually start it
  console.log("🚀 App started - use the interface to connect to Deepgram");
}

// IPC Handlers for Onboarding
ipcMain.handle('check-permissions', async () => {
  const permissions = {
    microphone: await systemPreferences.getMediaAccessStatus('microphone') === 'granted',
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    screen: await systemPreferences.getMediaAccessStatus('screen') === 'granted'
  };
  return permissions;
});

ipcMain.handle('request-microphone-permission', async () => {
  try {
    const status = await systemPreferences.askForMediaAccess('microphone');
    return status;
  } catch (error) {
    console.error('Error requesting microphone permission:', error);
    return false;
  }
});

ipcMain.handle('open-accessibility-settings', async () => {
  // Open System Preferences to Accessibility
  exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"');
  return true;
});

ipcMain.handle('open-screen-recording-settings', async () => {
  // Open System Preferences to Screen Recording
  exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"');
  return true;
});

ipcMain.handle('save-onboarding-preferences', async (event, preferences) => {
  try {
    const preferencesPath = path.join(__dirname, 'user-preferences.json');
    fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2));
    userPreferences = preferences;
    console.log('✅ Onboarding preferences saved');
    return { success: true };
  } catch (error) {
    console.error('Error saving preferences:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('launch-main-app', async () => {
  if (onboardingWindow) {
    onboardingWindow.close();
  }
  startMainApp();
  return true;
});

ipcMain.handle('start-tutorial-listening', async () => {
  // Start listening for tutorial commands
  if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
    return { success: true };
  } else {
    // Don't auto-start, let user start manually
    return { success: false, error: "Please start voice recognition first" };
  }
});

ipcMain.handle('execute-tutorial-command', async (event, command) => {
  try {
    if (taskOrchestrator) {
      const result = await taskOrchestrator.executeTaskDirectly(command);
      return result;
    } else {
      throw new Error('Task orchestrator not initialized');
    }
  } catch (error) {
    console.error('Tutorial command error:', error);
    return { success: false, error: error.message };
  }
});
