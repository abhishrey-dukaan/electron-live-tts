const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require("electron");
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
  aiService = new AIService(process.env.ANTHROPIC_API_KEY);
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

  overlayWindow = new BrowserWindow({
    width: 350,
    height: 150,
    x: 20, // 20px from left edge
    y: height - 170, // 20px from bottom
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
    // Overlay window properties - make it always visible and persistent
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    show: true, // Always show from start
    hasShadow: false,
  });

  overlayWindow.loadFile("overlay.html");

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

  // Force overlay to stay visible and positioned correctly
  setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed() && !app.isQuiting) {
      // Ensure overlay stays on top and visible
      if (!overlayWindow.isVisible()) {
        overlayWindow.show();
      }
      overlayWindow.setAlwaysOnTop(true, 'floating');
      
      // Keep it positioned in bottom left
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      const [currentX, currentY] = overlayWindow.getPosition();
      const expectedX = 20;
      const expectedY = height - 170;
      
      // Reposition if it moved
      if (currentX !== expectedX || currentY !== expectedY) {
        overlayWindow.setPosition(expectedX, expectedY);
      }
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

// Enhanced Deepgram connection function with rate limiting
async function startDeepgramConnection() {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("Deepgram API key not found");
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
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        },
      }
    );

    // Connection management variables
    let keepAliveInterval;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    
    // Set up event handlers
    deepgramSocket.on("open", () => {
      console.log("✅ Deepgram WebSocket opened successfully");
      reconnectAttempts = 0; // Reset on successful connection
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
      
      // Enhanced auto-reconnect logic with better rate limiting
      if (code !== 1000 && code !== 1001 && reconnectAttempts < maxReconnectAttempts) {
        const isRateLimited = code === 1006 && reason?.toString().includes('429');
        const isTimeout = code === 1011;
        
        let backoffTime;
        if (isRateLimited) {
          backoffTime = Math.pow(2, reconnectAttempts + 3) * 1000; // Longer for rate limits: 16s, 32s, 64s
        } else if (isTimeout) {
          backoffTime = 5000; // Quick reconnect for timeouts
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
      
      // Check for rate limiting
      if (error.message && error.message.includes('429')) {
        console.log("⚠️  Rate limited by Deepgram - will retry with longer delay");
        mainWindow.webContents.send("deepgram-error", "Rate limited - reconnecting with delay");
        if (overlayWindow) {
          overlayWindow.webContents.send("deepgram-error", "Rate limited - reconnecting with delay");
        }
      } else {
        mainWindow.webContents.send("deepgram-error", error.message);
        if (overlayWindow) {
          overlayWindow.webContents.send("deepgram-error", error.message);
        }
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
      
      // Use TaskOrchestrator's executeSingleAttempt method for proper visual guidance handling
      const result = await taskOrchestrator.executeSingleAttempt(step, 0);
      
      if (!result.success && !step.continueOnError) {
        console.error(`❌ Step ${i + 1} failed: ${result.error}`);
        return { success: false, error: `Step ${i + 1} failed: ${result.error}` };
      }

      if (result.success) {
        console.log(`✅ Step ${i + 1} completed: ${step.description}`);
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

// Execute a single atomic step (DEPRECATED - keeping for backward compatibility)
async function executeAtomicStep(step) {
  console.warn("⚠️ executeAtomicStep is deprecated, use TaskOrchestrator.executeSingleAttempt instead");
  
  // For visual guidance steps, delegate to TaskOrchestrator
  if (step.type === "VISUAL_GUIDANCE" || step.script === "VISUAL_GUIDANCE_PLACEHOLDER") {
    return await taskOrchestrator.executeSingleAttempt(step, 0);
  }
  
  return new Promise((resolve) => {
    const script = step.formattedScript;
    
    console.log(`Executing atomic step: ${script}`);

    exec(script, (error, stdout, stderr) => {
      if (error) {
        console.error(`Atomic step execution error:`, error);
        resolve({ 
          success: false, 
          error: error.message,
          code: error.code 
        });
      } else {
        console.log(`Atomic step completed successfully`);
        resolve({ 
          success: true, 
          output: stdout || stderr || "Step completed"
        });
      }
    });
  });
}

// Get task orchestrator status
ipcMain.handle("get-task-status", async () => {
  return taskOrchestrator.getStatus();
});

// Stop current task execution
ipcMain.handle("stop-task", async () => {
  taskOrchestrator.stop();
  return { success: true, message: "Task execution stopped" };
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
