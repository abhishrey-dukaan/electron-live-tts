const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');

// Global variables
let mainWindow;
let overlayWindow;
let deepgramWs = null;
let isRecording = false;
let currentTranscript = '';
let commandHistory = [];

// Simple configuration
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'your-deepgram-key-here';

// Validate API key on startup
if (!process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY === 'your-deepgram-key-here') {
  console.log('⚠️  DEEPGRAM_API_KEY not set. Please set your API key:');
  console.log('   export DEEPGRAM_API_KEY="your-actual-api-key-here"');
  console.log('   Then run: yarn start');
}

// Create main application window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active'
  });

  mainWindow.loadFile('index.html');
  
  // Show dev tools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('focus', () => {
    console.log('Window gained focus');
  });

  mainWindow.on('blur', () => {
    console.log('Window lost focus - maintaining background operation');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create overlay window
function createOverlayWindow() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = displays[0];
  
  overlayWindow = new BrowserWindow({
    width: 380,
    height: 450,
    minWidth: 350,
    minHeight: 400,
    maxWidth: 500,
    maxHeight: 600,
    x: primaryDisplay.bounds.width - 400,
    y: 20,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    transparent: true,
    skipTaskbar: true,
    acceptFirstMouse: true,
    titleBarStyle: 'customButtonsOnHover',
    show: false // Don't show immediately
  });

  overlayWindow.loadFile('overlay.html');
  
  // Show overlay after it's loaded
  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Initialize Deepgram WebSocket connection
async function initializeDeepgram() {
  try {
    // Skip if no valid API key
    if (!process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY === 'your-deepgram-key-here') {
      console.log('⚠️  Skipping Deepgram initialization - no API key');
      sendToRenderer('deepgram-error', { error: 'API key not configured' });
      return;
    }
    
    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      console.log('🔗 Deepgram already connected');
      return;
    }

    console.log('Creating new Deepgram WebSocket connection...');
    
    const deepgramUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1000`;
    
    deepgramWs = new WebSocket(deepgramUrl, {
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`
      }
    });

    deepgramWs.on('open', () => {
      console.log('✅ Deepgram WebSocket opened successfully');
      sendToRenderer('deepgram-ready');
    });

    deepgramWs.on('message', (data) => {
      try {
        const response = JSON.parse(data);
        
        if (response.channel?.alternatives?.[0]?.transcript) {
          const transcript = response.channel.alternatives[0].transcript;
          const confidence = response.channel.alternatives[0].confidence;
          const isFinal = response.is_final;
          
          if (transcript.trim()) {
            console.log(`🎤 Transcript (${isFinal ? 'final' : 'interim'}): "${transcript}"`);
            
            sendToRenderer('deepgram-transcript', {
              transcript,
              confidence,
              isFinal,
              timestamp: Date.now()
            });
            
            if (isFinal) {
              currentTranscript = transcript;
              // Add to command history
              commandHistory.unshift({
                command: transcript,
                timestamp: Date.now(),
                type: 'voice'
              });
              
              // Keep only last 50 commands
              if (commandHistory.length > 50) {
                commandHistory = commandHistory.slice(0, 50);
              }
              
              saveCommandHistory();
            }
          }
        }
      } catch (error) {
        console.error('Error parsing Deepgram response:', error);
      }
    });

    deepgramWs.on('close', (code, reason) => {
      console.log(`🔌 Deepgram WebSocket closed: ${code} ${reason}`);
      sendToRenderer('deepgram-closed', { code, reason: reason.toString() });
      
      // Auto-reconnect after delay
      setTimeout(() => {
        console.log('🔄 Auto-reconnecting to Deepgram...');
        initializeDeepgram();
      }, 2000);
    });

    deepgramWs.on('error', (error) => {
      console.error('🚨 Deepgram WebSocket error:', error);
      sendToRenderer('deepgram-error', { error: error.message });
    });

  } catch (error) {
    console.error('Failed to initialize Deepgram:', error);
  }
}

// Send audio data to Deepgram
function sendAudioToDeepgram(audioData) {
  if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
    deepgramWs.send(audioData);
  }
}

// Send message to renderer processes
function sendToRenderer(channel, data = null) {
  try {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send(channel, data);
    }
    if (overlayWindow && overlayWindow.webContents) {
      overlayWindow.webContents.send(channel, data);
    }
  } catch (error) {
    console.error(`Error sending to renderer:`, error);
  }
}

// Load command history
function loadCommandHistory() {
  try {
    if (fs.existsSync('command-history.json')) {
      const data = fs.readFileSync('command-history.json', 'utf8');
      commandHistory = JSON.parse(data) || [];
    }
  } catch (error) {
    console.error('Error loading command history:', error);
    commandHistory = [];
  }
}

// Save command history
function saveCommandHistory() {
  try {
    fs.writeFileSync('command-history.json', JSON.stringify(commandHistory, null, 2));
  } catch (error) {
    console.error('Error saving command history:', error);
  }
}

// App event handlers
app.whenReady().then(() => {
  // Remove default menu
  Menu.setApplicationMenu(null);
  
  createMainWindow();
  createOverlayWindow();
  loadCommandHistory();
  
  // Initialize Deepgram after a short delay
  setTimeout(() => {
    initializeDeepgram();
  }, 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    createOverlayWindow();
  }
});

app.on('before-quit', () => {
  if (deepgramWs) {
    deepgramWs.close();
  }
});

// IPC handlers
ipcMain.handle('start-recording', async () => {
  isRecording = true;
  console.log('🎤 Recording started');
  return { success: true };
});

ipcMain.handle('stop-recording', async () => {
  isRecording = false;
  console.log('🛑 Recording stopped');
  return { success: true };
});

ipcMain.handle('send-audio', async (event, audioData) => {
  if (isRecording) {
    sendAudioToDeepgram(Buffer.from(audioData));
  }
  return { success: true };
});

ipcMain.handle('get-command-history', async () => {
  return commandHistory;
});

ipcMain.handle('clear-history', async () => {
  commandHistory = [];
  saveCommandHistory();
  return { success: true };
});

ipcMain.handle('manual-command', async (event, command) => {
  console.log(`📝 Manual command: "${command}"`);
  
  // Add to history
  commandHistory.unshift({
    command,
    timestamp: Date.now(),
    type: 'manual'
  });
  
  saveCommandHistory();
  
  // Just echo back the command - no processing
  return {
    success: true,
    message: `Received: "${command}"`
  };
});

console.log('🚀 Simple Voice App started - Deepgram integration only');
