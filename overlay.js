// Overlay widget for voice command status and transcripts
const { ipcRenderer } = require("electron");

let currentTranscript = "";
let isProcessing = false;
let currentTaskSteps = 0;
let totalTaskSteps = 0;

// History management
const MAX_HISTORY = 5;
let commandHistory = [];

// Load history from localStorage
function loadHistory() {
  try {
    const stored = localStorage.getItem('voicemac-history');
    if (stored) {
      commandHistory = JSON.parse(stored);
      // Ensure we don't exceed max history
      if (commandHistory.length > MAX_HISTORY) {
        commandHistory = commandHistory.slice(-MAX_HISTORY);
        saveHistory();
      }
    }
  } catch (error) {
    console.error('Error loading history:', error);
    commandHistory = [];
  }
}

// Save history to localStorage
function saveHistory() {
  try {
    localStorage.setItem('voicemac-history', JSON.stringify(commandHistory));
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

// Add command to history
function addToHistory(command, type = 'voice', status = 'pending') {
  const historyEntry = {
    id: Date.now(),
    command: command,
    type: type, // 'voice' or 'manual'
    status: status, // 'pending', 'success', 'error'
    timestamp: new Date().toISOString()
  };
  
  commandHistory.push(historyEntry);
  
  // Keep only last 5 entries
  if (commandHistory.length > MAX_HISTORY) {
    commandHistory = commandHistory.slice(-MAX_HISTORY);
  }
  
  saveHistory();
  updateHistoryDisplay();
  
  return historyEntry.id;
}

// Update command status in history
function updateHistoryStatus(commandId, status, result = null) {
  const entry = commandHistory.find(h => h.id === commandId);
  if (entry) {
    entry.status = status;
    if (result) {
      entry.result = result;
    }
    saveHistory();
    updateHistoryDisplay();
  }
}

// Get history for context (last 5 commands)
function getHistoryContext() {
  return commandHistory.map(entry => ({
    command: entry.command,
    type: entry.type,
    status: entry.status,
    timestamp: entry.timestamp
  }));
}

// Update history display in transcript area
function updateHistoryDisplay() {
  if (!transcriptText) return;
  
  if (commandHistory.length === 0) {
    transcriptText.innerHTML = '<div class="history-empty">No recent commands</div>';
    return;
  }
  
  const historyHTML = commandHistory.map(entry => {
    const timeAgo = getTimeAgo(new Date(entry.timestamp));
    const statusIcon = entry.status === 'success' ? '✅' : 
                      entry.status === 'error' ? '❌' : 
                      entry.status === 'pending' ? '⏳' : 
                      entry.status === 'cancelled' ? '🚫' : '🔄';
    const typeIcon = entry.type === 'manual' ? '⌨️' : '🎤';
    
    return `
      <div class="history-entry ${entry.status}">
        <div class="history-header">
          <span class="history-type">${typeIcon}</span>
          <span class="history-status">${statusIcon}</span>
          <span class="history-time">${timeAgo}</span>
        </div>
        <div class="history-command">${entry.command}</div>
      </div>
    `;
  }).join('');
  
  transcriptText.innerHTML = historyHTML;
  
  // Scroll to bottom to show latest
  transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

// Dynamically resize window based on content
function resizeWindow() {
  try {
    // Calculate content height
    const header = document.querySelector('.header');
    const transcript = document.querySelector('.transcript');
    const inputArea = document.querySelector('.input-area');
    const statusArea = document.querySelector('.status-area');
    
    if (!header || !transcript || !inputArea) return;
    
    const headerHeight = header.offsetHeight;
    const inputHeight = inputArea.offsetHeight;
    const statusHeight = statusArea ? 36 : 0; // Status area height + padding
    
    // Calculate needed transcript height
    const transcriptContent = transcript.scrollHeight;
    const maxTranscriptHeight = 300; // Max height from CSS
    const actualTranscriptHeight = Math.min(transcriptContent, maxTranscriptHeight);
    
    // Calculate total height needed
    const totalHeight = headerHeight + actualTranscriptHeight + inputHeight + statusHeight + 40; // 40px for margins/padding
    
    // Constrain to min/max heights
    const finalHeight = Math.max(240, Math.min(600, totalHeight));
    
    // Request window resize via IPC
    if (typeof require !== 'undefined') {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('resize-overlay', { width: 380, height: finalHeight });
    }
  } catch (error) {
    console.error('Error resizing window:', error);
  }
}

// Helper function to get relative time
function getTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 60) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString();
}

// DOM elements
const transcriptArea = document.getElementById("transcriptArea");
const transcriptText = document.getElementById("transcriptText");
const statusArea = document.getElementById("statusArea");
const statusIndicator = document.getElementById("statusIndicator");
const spinnerIcon = document.getElementById("spinnerIcon");
const successIcon = document.getElementById("successIcon");
const errorIcon = document.getElementById("errorIcon");

// Double tab detection for focusing command input
let lastTabTime = 0;
const DOUBLE_TAB_DELAY = 500; // milliseconds

// Global keydown listener for double-tab detection
document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    const currentTime = Date.now();
    const timeSinceLastTab = currentTime - lastTabTime;
    
    if (timeSinceLastTab < DOUBLE_TAB_DELAY) {
      // Double tab detected - focus command input
      event.preventDefault();
      const manualInput = document.getElementById('manualInput');
      if (manualInput) {
        manualInput.focus();
        manualInput.select(); // Select all text for easy replacement
        console.log('🎯 Double-tab detected: Command input focused');
      }
      lastTabTime = 0; // Reset to prevent triple-tab issues
    } else {
      lastTabTime = currentTime;
    }
  } else {
    lastTabTime = 0; // Reset if any other key is pressed
  }
});

// Update status message in bottom left
function updateStatusMessage(message, type = 'default') {
  if (!statusArea) return;
  
  statusArea.innerHTML = `<span style="margin-left: 12px;">${message}</span>`;
  
  // Remove existing status classes
  statusArea.classList.remove('processing', 'success', 'error', 'visible');
  
  // Add appropriate class and show
  if (type !== 'default') {
    statusArea.classList.add(type);
  }
  statusArea.classList.add('visible');
  
  // Auto-hide after certain delay based on type
  const hideDelay = type === 'success' ? 3000 : type === 'error' ? 4000 : 0;
  if (hideDelay > 0) {
    setTimeout(() => {
      statusArea.classList.remove('visible');
    }, hideDelay);
  }
}

// Update status indicator
function updateStatus(status) {
  // Remove existing status classes
  transcriptArea.classList.remove('processing', 'success', 'error');
  
  // Hide all indicators
  spinnerIcon.classList.remove('active');
  successIcon.classList.remove('active');
  errorIcon.classList.remove('active');
  
  // Update microphone indicator
  const micIndicator = document.querySelector('.mic-indicator');
  const audioBars = document.querySelector('.audio-bars');
  
  switch(status) {
    case 'processing':
      transcriptArea.classList.add('processing');
      spinnerIcon.classList.add('active');
      // Make mic indicator more active
      if (micIndicator) {
        micIndicator.style.background = 'rgba(245, 158, 11, 0.2)';
        micIndicator.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        micIndicator.style.color = '#f59e0b';
      }
      if (audioBars) {
        audioBars.style.display = 'flex';
      }
      break;
    case 'success':
      transcriptArea.classList.add('success');
      successIcon.classList.add('active');
      // Make mic indicator green
      if (micIndicator) {
        micIndicator.style.background = 'rgba(34, 197, 94, 0.2)';
        micIndicator.style.borderColor = 'rgba(34, 197, 94, 0.4)';
        micIndicator.style.color = '#22c55e';
      }
      if (audioBars) {
        audioBars.style.display = 'flex';
      }
      break;
    case 'error':
      transcriptArea.classList.add('error');
      errorIcon.classList.add('active');
      // Make mic indicator red
      if (micIndicator) {
        micIndicator.style.background = 'rgba(239, 68, 68, 0.2)';
        micIndicator.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        micIndicator.style.color = '#ef4444';
      }
      if (audioBars) {
        audioBars.style.display = 'none';
      }
      break;
    default:
      // Default active listening state
      if (micIndicator) {
        micIndicator.style.background = 'rgba(34, 197, 94, 0.15)';
        micIndicator.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        micIndicator.style.color = '#22c55e';
      }
      if (audioBars) {
        audioBars.style.display = 'flex';
      }
      break;
  }
}

// Handle Deepgram events
ipcRenderer.on("deepgram-ready", () => {
  console.log("Overlay: Deepgram ready");
  updateStatusMessage("🎤 Ready for commands...");
});

ipcRenderer.on("deepgram-transcript", (event, data) => {
  try {
    if (data.channel && data.channel.alternatives && data.channel.alternatives.length > 0) {
      const transcript = data.channel.alternatives[0].transcript;
      
      if (transcript && transcript.trim()) {
        if (data.is_final) {
          // Accumulate transcripts like the main window
          if (currentTranscript.trim()) {
            currentTranscript += " " + transcript.trim();
          } else {
            currentTranscript = transcript.trim();
          }
          transcriptText.textContent = currentTranscript;
          
          // Show that we detected speech
          updateStatus('processing');
          
        } else {
          // Show interim results
          const fullInterimText = currentTranscript + (currentTranscript ? " " : "") + transcript;
          transcriptText.textContent = fullInterimText;
        }
      }
    }
  } catch (error) {
    console.error("Overlay: Error processing transcript:", error);
    transcriptText.textContent = "❌ Transcript error";
    updateStatus('error');
  }
});

ipcRenderer.on("deepgram-error", (event, error) => {
  console.error("Overlay: Deepgram error:", error);
  updateStatusMessage("❌ Connection error", 'error');
  updateStatus('error');
});

ipcRenderer.on("deepgram-closed", (event, data) => {
  console.log("Overlay: Deepgram closed:", data);
  updateStatusMessage("🔌 Disconnected", 'error');
});

// Store current command ID for tracking
let currentCommandId = null;

// Listen for command execution updates from main window
ipcRenderer.on("command-processing", (event, command) => {
  updateStatusMessage(`🔄 Processing: "${command}"`, 'processing');
  updateStatus('processing');
  
  // Add to history as pending
  currentCommandId = addToHistory(command, 'voice', 'pending');
});

ipcRenderer.on("command-success", (event, command) => {
  updateStatusMessage(`✅ Executed: "${command}"`, 'success');
  updateStatus('success');
  
  // Update history status
  if (currentCommandId) {
    updateHistoryStatus(currentCommandId, 'success');
  }
  
  // Clear after 3 seconds and reset for next command
  setTimeout(() => {
    currentTranscript = "";
    currentCommandId = null;
    updateStatusMessage("🎤 Ready for next command...");
    updateStatus();
  }, 3000);
});

ipcRenderer.on("command-error", (event, command, error) => {
  updateStatusMessage(`❌ Failed: "${command}"`, 'error');
  updateStatus('error');
  
  // Update history status
  if (currentCommandId) {
    updateHistoryStatus(currentCommandId, 'error', error);
  }
  
  // Clear after 4 seconds and reset for next command
  setTimeout(() => {
    currentTranscript = "";
    currentCommandId = null;
    updateStatusMessage("🎤 Ready for next command...");
    updateStatus();
  }, 4000);
});

// Listen for clarification requests
ipcRenderer.on("clarification-needed", (event, command, clarificationMessage) => {
  updateStatusMessage(`❓ ${clarificationMessage}`, 'processing');
  updateStatus('processing');
  
  // Update history status
  if (currentCommandId) {
    updateHistoryStatus(currentCommandId, 'pending', clarificationMessage);
  }
  
  // Focus the input field for user to provide more details
  const manualInput = document.getElementById('manualInput');
  if (manualInput) {
    manualInput.focus();
    manualInput.placeholder = "Please be more specific...";
  }
  
  // Reset after a longer timeout to allow user to respond
  setTimeout(() => {
    if (manualInput) {
      manualInput.placeholder = "Type a command...";
    }
    updateStatusMessage("🎤 Ready for next command...");
    updateStatus();
  }, 8000);
});

// Listen for task orchestrator events
ipcRenderer.on("task-step-complete", (event, data) => {
  const { stepNumber, totalSteps, description } = data;
  currentTaskSteps = stepNumber;
  totalTaskSteps = totalSteps;
  
  updateStatusMessage(`📋 Step ${stepNumber}/${totalSteps}: ${description.substring(0, 40)}...`, 'processing');
  updateStatus('processing');
});

// Listen for screenshot analysis events
ipcRenderer.on("screenshot-analysis-start", (event, data) => {
  const { failedStep } = data;
  updateStatusMessage(`📷 Taking screenshot to analyze failure...`, 'processing');
  updateStatus('processing');
});

// Listen for screenshot capture events
ipcRenderer.on("screenshot-capture", (event, data) => {
  const { status, data: captureData } = data;
  
  switch(status) {
    case 'start':
      transcriptText.textContent = `📷 Capturing screenshot...`;
      updateStatus('processing');
      break;
    case 'success':
      transcriptText.textContent = `📷 Screenshot captured successfully`;
      updateStatus('processing');
      break;
    case 'failed':
      transcriptText.textContent = `❌ Screenshot capture failed`;
      updateStatus('error');
      break;
  }
});

// Listen for Claude analysis events
ipcRenderer.on("claude-analysis", (event, data) => {
  const { status, data: analysisData } = data;
  
  switch(status) {
    case 'start':
      transcriptText.textContent = `🧠 Sending to Claude for analysis...`;
      updateStatus('processing');
      break;
    case 'success':
      transcriptText.textContent = `🧠 Claude analysis complete - applying fix...`;
      updateStatus('processing');
      break;
    case 'failed':
      transcriptText.textContent = `❌ Claude failed: ${analysisData}`.substring(0, 60) + '...';
      updateStatus('error');
      break;
  }
});

// Listen for cloud upload events
ipcRenderer.on("cloud-upload", (event, data) => {
  const { status, data: uploadData } = data;
  
  switch(status) {
    case 'start':
      transcriptText.textContent = `☁️ Uploading screenshot to cloud...`;
      updateStatus('processing');
      break;
    case 'success':
      transcriptText.textContent = `☁️ Screenshot uploaded successfully`;
      updateStatus('processing');
      break;
    case 'failed':
      transcriptText.textContent = `⚠️ Cloud upload failed - using fallback`;
      updateStatus('processing'); // Still processing with fallback
      break;
  }
});

ipcRenderer.on("screenshot-analysis-complete", (event, data) => {
  const { success, suggestedAction, failureReason } = data;
  
  if (success && suggestedAction) {
    transcriptText.textContent = `🧠 Analysis complete - trying fix...`;
    updateStatus('processing');
  } else {
    transcriptText.textContent = `❌ Analysis failed: ${failureReason || 'Unknown error'}`.substring(0, 60) + '...';
    updateStatus('error');
  }
});

// Listen for visual fallback results
ipcRenderer.on("visual-fallback-success", (event, data) => {
  const { action } = data;
  transcriptText.textContent = `✅ Visual fix succeeded!`;
  updateStatus('success');
});

ipcRenderer.on("visual-fallback-failed", (event, data) => {
  const { error } = data;
  transcriptText.textContent = `❌ Visual fix failed`;
  updateStatus('error');
});

ipcRenderer.on("task-complete", (event, data) => {
  const { success, message } = data;
  
  // Update history status
  if (currentCommandId) {
    updateHistoryStatus(currentCommandId, success ? 'success' : 'error', message);
  }
  
  if (success) {
    updateStatusMessage(`✅ Task completed successfully!`, 'success');
    updateStatus('success');
  } else {
    updateStatusMessage(`❌ Task failed: ${message}`, 'error');
    updateStatus('error');
  }
  
  // Reset after showing result
  setTimeout(() => {
    currentTranscript = "";
    currentCommandId = null;
    currentTaskSteps = 0;
    totalTaskSteps = 0;
    updateStatusMessage("🎤 Ready for next command...");
    updateStatus();
  }, success ? 3000 : 4000);
});

ipcRenderer.on("task-error", (event, data) => {
  const { error, stepNumber, totalSteps } = data;
  transcriptText.textContent = `⚠️ Step ${stepNumber} failed: ${error.substring(0, 30)}...`;
  updateStatus('error');
});

// Handle tray button click with animation
async function handleTrayAnimation() {
  try {
    const container = document.querySelector('.container');
    
    // Add animation class
    container.classList.add('overlay-to-tray');
    
    // Wait for animation to complete before actually minimizing
    setTimeout(async () => {
      try {
        const result = await ipcRenderer.invoke("minimize-overlay");
        if (result.success) {
          console.log("Overlay animated to tray");
          // Remove animation class and reset for next time
          container.classList.remove('overlay-to-tray');
        } else {
          console.error("Failed to minimize overlay:", result.message);
          // Remove animation class on error
          container.classList.remove('overlay-to-tray');
        }
      } catch (error) {
        console.error("Error minimizing overlay:", error);
        container.classList.remove('overlay-to-tray');
      }
    }, 600); // Match animation duration
    
  } catch (error) {
    console.error("Error in tray animation:", error);
  }
}

// Handle clearing queue/pending tasks
async function handleClearQueue() {
  try {
    console.log('🗑️ Clear queue button clicked');
    
    // Show confirmation feedback
    updateStatusMessage("🗑️ Clearing pending tasks...", 'processing');
    updateStatus('processing');
    
    // Call the main process to clear queue and stop tasks
    const result = await ipcRenderer.invoke("clear-queue");
    console.log('Clear queue result:', result);
    
    if (result.success) {
      updateStatusMessage(`✅ ${result.message}`, 'success');
      updateStatus('success');
      
      // Update any pending commands in history to cancelled
      commandHistory.forEach(entry => {
        if (entry.status === 'pending') {
          entry.status = 'cancelled';
        }
      });
      saveHistory();
      updateHistoryDisplay();
      
      // Reset after showing success
      setTimeout(() => {
        currentTranscript = "";
        currentCommandId = null;
        currentTaskSteps = 0;
        totalTaskSteps = 0;
        updateStatusMessage("🎤 Ready for next command...");
        updateStatus();
      }, 2000);
    } else {
      updateStatusMessage(`❌ Clear failed: ${result.message}`, 'error');
      updateStatus('error');
      
      setTimeout(() => {
        updateStatusMessage("🎤 Ready for commands...");
        updateStatus();
      }, 3000);
    }
  } catch (error) {
    console.error('Error clearing queue:', error);
    updateStatusMessage("❌ Failed to clear queue", 'error');
    updateStatus('error');
    
    setTimeout(() => {
      updateStatusMessage("🎤 Ready for commands...");
      updateStatus();
    }, 3000);
  }
}

// Handle manual text input commands
async function handleManualCommand() {
  const input = document.getElementById('manualInput');
  const sendButton = document.getElementById('sendButton');
  const command = input.value.trim();
  
  if (!command) return;
  
  // Clear input and disable while processing
  input.value = '';
  input.disabled = true;
  sendButton.disabled = true;
  
  // Add to history as pending and show processing status
  currentCommandId = addToHistory(command, 'manual', 'pending');
  updateStatus('processing');
  updateStatusMessage(`🔄 Processing: "${command}"`, 'processing');
  
  try {
    // Send command to main process with history context
    const historyContext = getHistoryContext();
    const result = await ipcRenderer.invoke('execute-command', command, historyContext);
    console.log('Manual command executed:', result);
    
    // The result will be handled by the IPC event listeners (command-success/command-error)
  } catch (error) {
    console.error('Error executing manual command:', error);
    
    // Update history status
    if (currentCommandId) {
      updateHistoryStatus(currentCommandId, 'error', error.message);
    }
    
    updateStatusMessage(`❌ Failed: "${command}"`, 'error');
    updateStatus('error');
    
    // Reset after error
    setTimeout(() => {
      currentTranscript = "";
      currentCommandId = null;
      updateStatusMessage("🎤 Ready for next command...");
      updateStatus();
    }, 4000);
  } finally {
    // Re-enable input after command execution
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
  }
}

// Update transcript display for both voice and manual input
function updateTranscript(text) {
  currentTranscript = text;
  transcriptText.textContent = text;
}

// Initialize overlay
document.addEventListener("DOMContentLoaded", () => {
  // Load history from localStorage
  loadHistory();
  
  // Clear any residual text and set initial state
  currentTranscript = "";
  updateStatus();
  
  // Show history or empty state
  updateHistoryDisplay();
  
  // Show initial status message
  updateStatusMessage("🎤 Ready for commands...");
  
  // Add tray button event listener
  const trayButton = document.getElementById("trayButton");
  
  if (trayButton) {
    trayButton.addEventListener("click", handleTrayAnimation);
  }

  // Add clear button event listener
  const clearButton = document.getElementById("clearButton");
  
  if (clearButton) {
    clearButton.addEventListener("click", handleClearQueue);
  }
  
  // Set up manual input handlers
  const manualInput = document.getElementById('manualInput');
  const sendButton = document.getElementById('sendButton');
  
  if (manualInput) {
    // Handle Enter key
    manualInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !manualInput.disabled) {
        handleManualCommand();
      }
    });
    
    // Auto-focus input for convenience
    manualInput.focus();
    
    // Also handle input changes to enable/disable send button
    manualInput.addEventListener('input', () => {
      if (sendButton) {
        sendButton.disabled = !manualInput.value.trim() || manualInput.disabled;
      }
    });
  }
  
  if (sendButton) {
    sendButton.addEventListener('click', handleManualCommand);
  }
  
  console.log("Overlay widget initialized with manual input support");
}); 