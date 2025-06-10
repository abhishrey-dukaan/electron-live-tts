const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const { exec } = require("child_process");
const AIService = require("./ai-service");
const TaskOrchestrator = require("./task-orchestrator");
const AtomicScriptGenerator = require("./atomic-script-generator");
const VisualGuidance = require("./visual-guidance");
const PlaywrightService = require("./playwright-service");
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
let playwrightService;
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
  playwrightService = new PlaywrightService();
  
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
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 380,
    height: 240,
    minHeight: 240,
    maxHeight: 600,
    x: Math.max(20, width - 400), // Right side with padding
    y: Math.max(20, height - 640), // Bottom area with padding for max height (600px + 40px margin)
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
    
    // Apply changes if needed
    if (changed) {
      overlayWindow.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });
      console.log(`📍 Adjusted overlay position to stay on screen: (${newX}, ${newY})`);
    }
  }

  overlayWindow.on('move', ensureOverlayOnScreen);
  overlayWindow.on('resize', ensureOverlayOnScreen);

  // Ensure overlay starts on-screen
  overlayWindow.once('ready-to-show', () => {
    ensureOverlayOnScreen();
    overlayWindow.show();
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
  
  // Don't auto-show here, let ready-to-show handle it
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
  createWindow();
  createOverlayWindow();
  createTray();
  
  // Prevent app suspension
  app.setName('Voice Command Assistant');
  
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
    createWindow();
  } else {
    mainWindow.show();
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  }
});

// Prevent the app from being suspended
app.on('before-quit', async (event) => {
  app.isQuiting = true;
  
  // Clean up Playwright browser
  if (playwrightService) {
    console.log("🧹 Cleaning up Playwright service...");
    try {
      await playwrightService.close();
    } catch (error) {
      console.error("Error closing Playwright:", error);
    }
  }
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

// Enhanced Deepgram connection function with rate limiting
async function startDeepgramConnection() {
  try {
    // Use hardcoded Deepgram API key for reliability
    const DEEPGRAM_API_KEY = "a076385db3d2cb8e4eb9c4276b2eed2ae70d154c";
    
    if (!DEEPGRAM_API_KEY) {
      const errorMsg = "❌ Deepgram API key not configured in application";
      console.error(errorMsg);
      mainWindow.webContents.send("deepgram-error", errorMsg);
      if (overlayWindow) {
        overlayWindow.webContents.send("deepgram-error", errorMsg);
      }
      throw new Error("Deepgram API key not configured");
    }

    // Check network connectivity first
    const networkCheck = await checkNetworkConnectivity();
    if (!networkCheck.connected) {
      const errorMsg = `❌ Network connectivity issue: ${networkCheck.error}`;
      console.error(errorMsg);
      mainWindow.webContents.send("deepgram-error", errorMsg);
      if (overlayWindow) {
        overlayWindow.webContents.send("deepgram-error", errorMsg);
      }
      return false;
    }

    // Prevent multiple concurrent connections
    if (deepgramSocket && deepgramSocket.readyState === WebSocket.CONNECTING) {
      console.log("⚠️ Connection already in progress, waiting...");
      return false;
    }

    // Close existing connection if any
    if (deepgramSocket && (deepgramSocket.readyState === WebSocket.OPEN || deepgramSocket.readyState === WebSocket.CONNECTING)) {
      console.log("Closing existing connection...");
      deepgramSocket.removeAllListeners(); // Remove all listeners to prevent duplicate events
      deepgramSocket.close();
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for clean closure
    }

    console.log("Creating new Deepgram WebSocket connection...");

    // Create new WebSocket connection with optimized parameters
    deepgramSocket = new WebSocket(
      "wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&punctuate=true&interim_results=true&smart_format=true&endpointing=300&utterance_end_ms=2000&vad_events=true",
      {
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
        },
      }
    );

    // Connection management variables
    let keepAliveInterval;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    let networkFailureCount = 0;
    const maxNetworkFailures = 5;
    
    // Set up event handlers
    deepgramSocket.on("open", () => {
      console.log("✅ Deepgram WebSocket opened successfully");
      reconnectAttempts = 0; // Reset on successful connection
      networkFailureCount = 0; // Reset network failure count
      lastAudioSentTime = Date.now(); // Reset global audio tracking
      
      // Send periodic audio data checks instead of ping/pong
      keepAliveInterval = setInterval(() => {
        if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
          const timeSinceLastAudio = Date.now() - lastAudioSentTime;
          
          // If no audio data sent for 25 seconds, log warning
          if (timeSinceLastAudio > 25000) {
            console.log("⚠️ No audio data sent for 25+ seconds - connection may timeout soon");
          }
          
          // Deepgram will close at 30 seconds without data
          console.log(`📡 Connection alive - last audio: ${timeSinceLastAudio}ms ago`);
        }
      }, 15000); // Check every 15 seconds
      
      mainWindow.webContents.send("deepgram-ready");
      if (overlayWindow) {
        overlayWindow.webContents.send("deepgram-ready");
      }
    });

    deepgramSocket.on("message", (data) => {
      try {
        const response = JSON.parse(data);
        // Don't update lastAudioSentTime here - that's for tracking outgoing audio
        
        mainWindow.webContents.send("deepgram-transcript", response);
        if (overlayWindow) {
          overlayWindow.webContents.send("deepgram-transcript", response);
        }
      } catch (error) {
        console.error("Error parsing Deepgram response:", error);
      }
    });

    deepgramSocket.on("close", (code, reason) => {
      console.log("🔌 Deepgram WebSocket closed:", code, reason?.toString());
      
      // Clear keepalive interval
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
      
      mainWindow.webContents.send("deepgram-closed", {
        code,
        reason: reason?.toString() || "Connection closed",
      });
      if (overlayWindow) {
        overlayWindow.webContents.send("deepgram-closed", {
          code,
          reason: reason?.toString() || "Connection closed",
        });
      }
      
      // Enhanced auto-reconnect logic with network failure detection
      if (code !== 1000 && code !== 1001 && reconnectAttempts < maxReconnectAttempts) {
        const isNetworkError = code === 1006 || reason?.toString().includes('ENOTFOUND') || reason?.toString().includes('ECONNREFUSED');
        const isRateLimited = code === 1006 && reason?.toString().includes('429');
        const isTimeout = code === 1011;
        
        // If it's a network error, check connectivity first
        if (isNetworkError) {
          networkFailureCount++;
          if (networkFailureCount >= maxNetworkFailures) {
            console.log("🛑 Too many network failures, stopping auto-reconnection");
            console.log("💡 Please check your internet connection and restart the app manually");
            return;
          }
        }
        
        let backoffTime;
        if (isRateLimited) {
          backoffTime = Math.pow(2, reconnectAttempts + 3) * 1000; // Longer for rate limits: 16s, 32s, 64s
        } else if (isTimeout) {
          backoffTime = 5000; // Quick reconnect for timeouts
        } else if (isNetworkError) {
          backoffTime = Math.pow(2, reconnectAttempts + 2) * 1000; // Network errors: 8s, 16s, 32s
        } else {
          backoffTime = Math.pow(2, reconnectAttempts + 1) * 1000; // Normal: 4s, 8s, 16s
        }
        
        console.log(`🔄 Attempting to reconnect in ${backoffTime/1000}s... (${reconnectAttempts + 1}/${maxReconnectAttempts})`);
        reconnectAttempts++;
        
        setTimeout(async () => {
          try {
            console.log("🔄 Auto-reconnecting to Deepgram...");
            const success = await startDeepgramConnection();
            if (success) {
              console.log("✅ Auto-reconnection successful");
              mainWindow.webContents.send("deepgram-reconnected");
              if (overlayWindow) {
                overlayWindow.webContents.send("deepgram-reconnected");
              }
            }
          } catch (error) {
            console.error("❌ Auto-reconnection failed:", error);
          }
        }, backoffTime);
      } else {
        console.log("🛑 Max reconnection attempts reached or planned closure");
      }
    });

    deepgramSocket.on("error", (error) => {
      console.error("💥 Deepgram WebSocket error:", error);
      
      // Clear keepalive interval on error
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
      
      let errorMessage = error.message;
      
      // Check for common error types
      if (error.message && error.message.includes('401')) {
        errorMessage = "❌ Invalid Deepgram API key. Please:\n1. Check your API key at https://console.deepgram.com/\n2. Update DEEPGRAM_API_KEY in your .env file\n3. Restart the application";
      } else if (error.message && error.message.includes('429')) {
        console.log("⚠️  Rate limited by Deepgram - will retry with longer delay");
        errorMessage = "Rate limited - reconnecting with delay";
      } else if (error.message && error.message.includes('Unexpected server response: 401')) {
        errorMessage = "❌ Unauthorized: Invalid Deepgram API key. Please check your API key in the .env file.";
      } else if (error.message && error.message.includes('ENOTFOUND')) {
        errorMessage = "❌ Network connectivity issue: Cannot reach Deepgram servers. Please check your internet connection.";
        networkFailureCount++;
      } else if (error.message && error.message.includes('ECONNREFUSED')) {
        errorMessage = "❌ Connection refused: Cannot connect to Deepgram servers.";
        networkFailureCount++;
      }
      
      mainWindow.webContents.send("deepgram-error", errorMessage);
      if (overlayWindow) {
        overlayWindow.webContents.send("deepgram-error", errorMessage);
      }
    });

    // Wait for connection to be established
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout (10s)"));
      }, 10000);

      deepgramSocket.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      deepgramSocket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    return true;
  } catch (error) {
    console.error("❌ Error starting Deepgram:", error);
    return false;
  }
}

// Add network connectivity check function
async function checkNetworkConnectivity() {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const ping = spawn('ping', ['-c', '1', '8.8.8.8']);
    
    let timeout = setTimeout(() => {
      ping.kill();
      resolve({ connected: false, error: "Network timeout" });
    }, 5000);
    
    ping.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ connected: true });
      } else {
        resolve({ connected: false, error: "Cannot reach internet" });
      }
    });
    
    ping.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ connected: false, error: error.message });
    });
  });
}

// Handle start Deepgram connection
ipcMain.handle("start-deepgram", async () => {
  return await startDeepgramConnection();
});

// Handle stop Deepgram connection
ipcMain.handle("stop-deepgram", async () => {
  if (deepgramSocket) {
    const closePromise = new Promise((resolve) => {
      deepgramSocket.once("close", () => resolve());
    });

    deepgramSocket.close();
    await closePromise;
    deepgramSocket = null;
  }
  return true;
});

// Handle sending audio data to Deepgram - ENHANCED
ipcMain.on("audio-data", (event, buffer) => {
  if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
    try {
      // Convert ArrayBuffer to Buffer with validation
      const audioBuffer = Buffer.from(buffer);
      
      // ENHANCED: Validate audio buffer format
      if (audioBuffer.length > 0) {
        // Ensure buffer length is even (16-bit samples)
        if (audioBuffer.length % 2 !== 0) {
          console.warn(`⚠️ Audio buffer length ${audioBuffer.length} is odd, trimming`);
          audioBuffer = audioBuffer.subarray(0, audioBuffer.length - 1);
        }
        
        deepgramSocket.send(audioBuffer);
        lastAudioSentTime = Date.now(); // Update last audio sent time
        
        // ENHANCED: Better debugging with audio level detection
        const int16Array = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
        const maxSample = Math.max(...Array.from(int16Array).map(Math.abs));
        const audioLevel = maxSample / 32767;
        
        // Log with audio level info
        const now = Date.now();
        if (now % 5000 < 100) { // Log roughly every 5 seconds
          console.log(`📊 Audio flowing: ${audioBuffer.length} bytes, level: ${audioLevel.toFixed(3)} ${audioLevel > 0.01 ? '🎤' : '🔇'}`);
        }
      }
    } catch (error) {
      console.error("Error sending audio data:", error);
      mainWindow.webContents.send(
        "deepgram-error",
        "Failed to send audio data"
      );
    }
  } else {
    // Log connection state when trying to send audio
    const state = deepgramSocket ? deepgramSocket.readyState : 'null';
    console.log(`⚠️ Cannot send audio - WebSocket state: ${state}`);
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
    const { screen } = require('electron');
    const currentBounds = overlayWindow.getBounds();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
    
    let newX = currentBounds.x;
    let newY = currentBounds.y;
    
    // Ensure the resized window doesn't go off screen
    // Check if window would extend beyond right edge
    if (newX + width > screenX + screenWidth) {
      newX = Math.max(screenX, screenX + screenWidth - width);
    }
    
    // Check if window would extend beyond bottom edge
    if (newY + height > screenY + screenHeight) {
      newY = Math.max(screenY, screenY + screenHeight - height);
    }
    
    overlayWindow.setBounds({
      x: newX,
      y: newY,
      width: width,
      height: height
    });
    
    // Only log if position actually changed
    if (newX !== currentBounds.x || newY !== currentBounds.y) {
      console.log(`📍 Overlay repositioned to ${width}x${height} at (${newX}, ${newY})`);
    }
  }
});

// Handle overlay position reset
ipcMain.handle("reset-overlay-position", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workArea;
    
    // Reset to default position (bottom-right with proper margin for max height)
    overlayWindow.setBounds({
      x: Math.max(20, width - 400),
      y: Math.max(20, height - 640), // Account for max height of 600px + 40px margin
      width: 380,
      height: 240
    });
    
    console.log("🔄 Overlay position reset to default");
    return { success: true, message: "Overlay position reset" };
  }
  return { success: false, message: "Overlay window not found" };
});

// Handle manual command execution from overlay
ipcMain.handle("execute-command", async (event, transcript, historyContext = null) => {
  try {
    console.log("🎤 Manual command from overlay:", transcript);
    
    // Send notifications to both windows about command processing
    if (mainWindow) {
      mainWindow.webContents.send("command-processing", transcript);
    }
    if (overlayWindow) {
      overlayWindow.webContents.send("command-processing", transcript);
    }
    
    // Use the new, intelligent command handler
    const result = await taskOrchestrator.handleCommand(transcript, historyContext);
    
    // Handle the result from the orchestrator
    if (result.type === 'STOP_COMMAND_SUCCESS') {
      console.log('✅ Stop command processed successfully.');
      if (overlayWindow) {
        overlayWindow.webContents.send('tasks-cleared', result.message);
      }
    } else if (result.type === 'CLARIFICATION_NEEDED') {
      console.log("❓ Clarification needed for:", transcript);
      // Send clarification request to the UI
      if (overlayWindow) {
        overlayWindow.webContents.send("clarification-needed", transcript, result.message);
      }
    } else if (result.success) {
      console.log("✅ Manual command executed successfully");
      if (overlayWindow) {
        overlayWindow.webContents.send("command-success", transcript);
      }
    } else {
      console.log("❌ Manual command failed:", result.error || result.message);
      if (overlayWindow) {
        overlayWindow.webContents.send("command-error", transcript, result.error || result.message);
      }
    }
    
    return result;
  } catch (error) {
    console.error("Manual command execution error:", error);
    
    // Notify about error
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
      
      // Broadcast updated model info to all windows
      const textModel = aiService.getTextModel();
      const imageModel = aiService.getImageModel();
      if (mainWindow) {
        mainWindow.webContents.send('model-info', { textModel, imageModel });
      }
      if (overlayWindow) {
        overlayWindow.webContents.send('model-info', { textModel, imageModel });
      }
      
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
      
      // Broadcast updated model info to all windows
      const textModel = aiService.getTextModel();
      const imageModel = aiService.getImageModel();
      if (mainWindow) {
        mainWindow.webContents.send('model-info', { textModel, imageModel });
      }
      if (overlayWindow) {
        overlayWindow.webContents.send('model-info', { textModel, imageModel });
      }
      
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

// Test vision models specifically
ipcMain.handle("test-vision-models", async (event) => {
  try {
    if (aiService && aiService.testVisionModels) {
      console.log("🧪 Starting vision model testing...");
      const results = await aiService.testVisionModels();
      return { success: true, results };
    }
    return { success: false, error: "AI service not available" };
  } catch (error) {
    console.error("Error testing vision models:", error);
    return { success: false, error: error.message };
  }
});

// Handle model info requests
ipcMain.on("request-model-info", (event) => {
  try {
    const textModel = aiService.getTextModel();
    const imageModel = aiService.getImageModel();
    
    // Send to both main window and overlay
    if (mainWindow) {
      mainWindow.webContents.send('model-info', { textModel, imageModel });
    }
    if (overlayWindow) {
      overlayWindow.webContents.send('model-info', { textModel, imageModel });
    }
  } catch (error) {
    console.error("Error sending model info:", error);
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

// Playwright-based web task handler
ipcMain.handle("execute-web-task", async (event, taskType, params) => {
  try {
    console.log(`🌐 Executing Playwright web task: ${taskType}`);
    
    // Use Playwright for web-related tasks
    const result = await playwrightService.executeWebTask(taskType, params);
    
    if (result.success) {
      console.log(`✅ Playwright task ${taskType} completed successfully`);
      return result;
    } else {
      console.error(`❌ Playwright task ${taskType} failed:`, result.error);
      return result;
    }
  } catch (error) {
    console.error("Playwright web task execution error:", error);
    return { success: false, error: error.message };
  }
});

// Additional Playwright-specific handlers
ipcMain.handle("playwright-download-file", async (event, url, filename) => {
  try {
    console.log(`📥 Playwright download: ${url}`);
    return await playwrightService.downloadFile(url, filename);
  } catch (error) {
    console.error("Playwright download error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-navigate", async (event, url) => {
  try {
    console.log(`🌐 Playwright navigate: ${url}`);
    return await playwrightService.navigateToUrl(url);
  } catch (error) {
    console.error("Playwright navigation error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-search-google", async (event, query) => {
  try {
    console.log(`🔍 Playwright Google search: ${query}`);
    return await playwrightService.searchGoogle(query);
  } catch (error) {
    console.error("Playwright search error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-screenshot", async (event, filename) => {
  try {
    console.log(`📷 Playwright screenshot`);
    return await playwrightService.takeScreenshot(filename);
  } catch (error) {
    console.error("Playwright screenshot error:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-get-downloads", async (event) => {
  try {
    const files = playwrightService.getDownloadedFiles();
    return { success: true, files };
  } catch (error) {
    console.error("Error getting downloads:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("playwright-close", async (event) => {
  try {
    await playwrightService.close();
    return { success: true };
  } catch (error) {
    console.error("Error closing Playwright:", error);
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
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("screenshot-capture", { status, data });
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("screenshot-capture", { status, data });
    }
  } catch (error) {
    console.log(`⚠️ Error sending screenshot capture notification: ${error.message}`);
  }
}

function notifyAIAnalysis(status, data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("ai-analysis", { status, data });
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("ai-analysis", { status, data });
    }
  } catch (error) {
    console.log(`⚠️ Error sending AI analysis notification: ${error.message}`);
  }
}

function notifyCloudUpload(status, data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud-upload", { status, data });
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("cloud-upload", { status, data });
    }
  } catch (error) {
    console.log(`⚠️ Error sending cloud upload notification: ${error.message}`);
  }
}

// Handle testing commands via stdin for automated testing
process.stdin.on('data', (data) => {
  const input = data.toString().trim();
  if (input.startsWith('TEST_COMMAND:')) {
    const command = input.replace('TEST_COMMAND:', '');
    console.log(`🧪 Test command received: ${command}`);
    
    // Execute the command using the same handler as manual commands
    taskOrchestrator.executeTask(command).then((result) => {
      if (result && result.success) {
        console.log(`✅ TEST_COMMAND_COMPLETED: ${command}`);
      } else {
        console.log(`❌ TEST_COMMAND_FAILED: ${command} - ${result?.error || 'Unknown error'}`);
      }
    }).catch((error) => {
      console.log(`❌ TEST_COMMAND_FAILED: ${command} - ${error.message}`);
    });
  }
});
