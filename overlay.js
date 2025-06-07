// Overlay widget for voice command status and transcripts
const { ipcRenderer } = require("electron");

let currentTranscript = "";
let isProcessing = false;
let currentTaskSteps = 0;
let totalTaskSteps = 0;

// Multi-step task execution state
let currentTask = null;
let taskSteps = [];
let activeStepIndex = -1;

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
    transcriptText.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">🎤</div>
        <div class="history-empty-text">No recent commands</div>
        <div class="history-empty-subtitle">Start speaking to see your voice commands here</div>
      </div>
    `;
    return;
  }
  
  const historyHTML = commandHistory.map(entry => {
    const timeAgo = getTimeAgo(new Date(entry.timestamp));
    
    // More descriptive status indicators
    let statusIcon, statusText, statusClass;
    switch(entry.status) {
      case 'success':
        statusIcon = '✅';
        statusText = 'Completed';
        statusClass = 'status-completed';
        break;
      case 'error':
        statusIcon = '❌';
        statusText = 'Failed';
        statusClass = 'status-failed';
        break;
      case 'pending':
        statusIcon = '⏳';
        statusText = 'Processing';
        statusClass = 'status-processing';
        break;
      case 'cancelled':
        statusIcon = '🚫';
        statusText = 'Cancelled';
        statusClass = 'status-cancelled';
        break;
      default:
        statusIcon = '🔄';
        statusText = 'Running';
        statusClass = 'status-running';
    }
    
    const typeIcon = entry.type === 'manual' ? '💬' : '🎤';
    
    return `
      <div class="history-entry ${entry.status}">
        <div class="history-header">
          <span class="history-type">${typeIcon}</span>
          <div class="history-status ${statusClass}">
            <span class="status-icon">${statusIcon}</span>
            <span class="status-text">${statusText}</span>
          </div>
          <span class="history-time">${timeAgo}</span>
        </div>
        <div class="history-command">${entry.command}</div>
        ${entry.result ? `<div class="history-result">${entry.result}</div>` : ''}
      </div>
    `;
  }).join('');
  
  transcriptText.innerHTML = historyHTML;
  
  // Scroll to bottom to show latest
  transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

// Throttle function with leading edge execution
function throttle(func, limit) {
  let lastFunc;
  let lastRan;
  return function(...args) {
    if (!lastRan) {
      func.apply(this, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if ((Date.now() - lastRan) >= limit) {
          func.apply(this, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  }
}

function resizeWindow() {
  try {
    // Get elements
    const header = document.querySelector('.header');
    const transcript = document.querySelector('.transcript');
    const inputArea = document.querySelector('.input-area');
    const statusArea = document.querySelector('.status-area');
    const container = document.querySelector('.container');
    
    if (!header || !transcript || !inputArea || !container) return;
    
    // Store scroll position
    const scrollTop = transcript.scrollTop;
    const scrollHeight = transcript.scrollHeight;
    const isScrolledToBottom = Math.abs((scrollTop + transcript.clientHeight) - scrollHeight) < 2;
    
    // Use RAF for smooth updates
    requestAnimationFrame(() => {
      // Reset any fixed heights to get true content size
      transcript.style.maxHeight = '';
      container.style.height = '';
      
      // Get the actual content height
      const transcriptContent = Math.max(280, transcript.scrollHeight);
      const headerHeight = header.offsetHeight;
      const inputHeight = inputArea.offsetHeight;
      const statusHeight = statusArea ? statusArea.offsetHeight + 16 : 0;
      
      // Calculate the minimum height needed for the window
      const minHeight = 400;
      const maxHeight = Math.min(800, window.screen.height * 0.8);
      
      // Calculate needed height for content
      const neededHeight = Math.max(minHeight, headerHeight + transcriptContent + inputHeight + 8);
      
      // Set final height within bounds
      const finalHeight = Math.min(maxHeight, neededHeight);
      
      // Set transcript max height to allow scrolling if needed
      const transcriptMaxHeight = Math.max(280, finalHeight - headerHeight - inputHeight - 16);
      transcript.style.maxHeight = `${transcriptMaxHeight}px`;
      
      // Restore scroll position
      if (isScrolledToBottom) {
        transcript.scrollTop = transcript.scrollHeight;
      } else {
        transcript.scrollTop = scrollTop;
      }
      
      // Request window resize via IPC
      if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('resize-overlay', { 
          width: 380, 
          height: finalHeight
        });
      }
    });
  } catch (error) {
    console.error('Error resizing window:', error);
  }
}

// Super throttled resize for input changes
const inputResizeThrottle = throttle(resizeWindow, 150);

// Regular throttle for other changes
const regularResizeThrottle = throttle(resizeWindow, 50);

// Handle input changes separately
const inputField = document.querySelector('.input-field');
if (inputField) {
  inputField.addEventListener('input', () => {
    requestAnimationFrame(inputResizeThrottle);
  }, { passive: true });
}

// Call resize on content changes
const observer = new MutationObserver((mutations) => {
  // Check if we need to scroll to bottom
  const transcript = document.querySelector('.transcript');
  if (!transcript) return;
  
  const shouldScrollToBottom = mutations.some(mutation => {
    return mutation.type === 'childList' && mutation.addedNodes.length > 0;
  });
  
  requestAnimationFrame(() => {
    regularResizeThrottle();
    if (shouldScrollToBottom) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  });
});

// Observe transcript changes
const transcript = document.querySelector('.transcript');
if (transcript) {
  observer.observe(transcript, { 
    childList: true, 
    subtree: true, 
    characterData: true,
    attributes: true 
  });
  
  // Smooth scroll handling with RAF
  let isScrolling = false;
  let rafId = null;
  
  transcript.addEventListener('scroll', () => {
    isScrolling = true;
    if (rafId) return;
    
    rafId = requestAnimationFrame(() => {
      const statusArea = document.querySelector('.status-area');
      if (statusArea && statusArea.classList.contains('visible')) {
        statusArea.classList.remove('visible');
      }
      isScrolling = false;
      rafId = null;
    });
  }, { passive: true });
}

// Initial resize
resizeWindow();

// Add resize listener for window with RAF
window.addEventListener('resize', () => {
  requestAnimationFrame(regularResizeThrottle);
}, { passive: true });

// Add scroll handler to hide status area when scrolling
if (transcript) {
  let scrollTimeout;
  transcript.addEventListener('scroll', () => {
    const statusArea = document.querySelector('.status-area');
    if (statusArea && statusArea.classList.contains('visible')) {
      statusArea.classList.remove('visible');
    }
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (statusArea) {
        statusArea.classList.add('visible');
      }
    }, 1000);
  });
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
  
  // Start multi-step task display for complex commands
  if (isComplexCommand(command)) {
    const steps = generateStepsForCommand(command);
    startMultiStepTask(command, steps);
    
    // Start auto-progression as fallback if detailed events don't come
    startAutoProgression(steps.length);
  }
});

ipcRenderer.on("command-success", (event, command) => {
  updateStatusMessage(`✅ Executed: "${command}"`, 'success');
  updateStatus('success');
  
  // Update history status
  if (currentCommandId) {
    updateHistoryStatus(currentCommandId, 'success');
  }
  
  // Complete multi-step task if active
  if (currentTask) {
    completeMultiStepTask(true);
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
  
  // Update multi-step task display if active
  if (currentTask && stepNumber <= taskSteps.length) {
    // Mark previous step as completed
    if (stepNumber > 1) {
      updateStepStatus(stepNumber - 2, 'completed');
    }
    // Mark current step as active
    if (stepNumber <= taskSteps.length) {
      updateStepStatus(stepNumber - 1, 'active');
    }
  }
  
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
  
  // Complete multi-step task if active
  if (currentTask) {
    completeMultiStepTask(success);
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

// Multi-step Task Execution Functions
function startMultiStepTask(command, steps) {
  currentTask = {
    command: command,
    steps: steps,
    startTime: Date.now()
  };
  
  taskSteps = steps.map((step, index) => ({
    id: index,
    description: step.description || step,
    status: 'pending',
    completed: false,
    failed: false
  }));
  
  activeStepIndex = -1;
  
  // Update UI
  const taskCommandEl = document.getElementById('taskCommand');
  const taskPanel = document.getElementById('taskExecutionPanel');
  
  if (taskCommandEl) {
    taskCommandEl.textContent = command;
  }
  
  renderTaskSteps();
  showTaskPanel();
  
  // Auto-hide transcript area when task panel is active
  const transcriptArea = document.getElementById('transcriptArea');
  if (transcriptArea) {
    transcriptArea.style.opacity = '0.3';
  }
}

function renderTaskSteps() {
  const taskStepsContainer = document.getElementById('taskSteps');
  if (!taskStepsContainer) return;
  
  taskStepsContainer.innerHTML = '';
  
  taskSteps.forEach((step, index) => {
    const stepElement = document.createElement('div');
    stepElement.className = `task-step ${step.status}`;
    stepElement.id = `task-step-${index}`;
    
    // Determine icon content
    let iconContent = index + 1;
    if (step.status === 'completed') iconContent = '✓';
    if (step.status === 'failed') iconContent = '✗';
    if (step.status === 'active') iconContent = '⟳';
    
    // Determine status text
    let statusText = step.status.charAt(0).toUpperCase() + step.status.slice(1);
    if (step.status === 'active') statusText = 'Running';
    
    stepElement.innerHTML = `
      <div class="step-icon ${step.status}">${iconContent}</div>
      <div class="step-description">${step.description}</div>
      <div class="step-status ${step.status}">${statusText}</div>
    `;
    
    taskStepsContainer.appendChild(stepElement);
  });
}

function updateStepStatus(stepIndex, status) {
  if (stepIndex < 0 || stepIndex >= taskSteps.length) return;
  
  // Update previous step to completed if moving to next
  if (status === 'active' && activeStepIndex >= 0) {
    taskSteps[activeStepIndex].status = 'completed';
    taskSteps[activeStepIndex].completed = true;
  }
  
  // Update current step
  taskSteps[stepIndex].status = status;
  
  if (status === 'active') {
    activeStepIndex = stepIndex;
  } else if (status === 'completed') {
    taskSteps[stepIndex].completed = true;
    if (stepIndex === activeStepIndex) {
      activeStepIndex = -1;
    }
  } else if (status === 'failed') {
    taskSteps[stepIndex].failed = true;
    activeStepIndex = -1;
  }
  
  renderTaskSteps();
  
  // Auto-scroll to active step
  const activeStepEl = document.getElementById(`task-step-${stepIndex}`);
  if (activeStepEl) {
    activeStepEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function completeMultiStepTask(success = true) {
  // Stop auto-progression
  stopAutoProgression();
  
  if (activeStepIndex >= 0) {
    updateStepStatus(activeStepIndex, success ? 'completed' : 'failed');
  }
  
  // Mark all remaining steps as completed if successful
  if (success) {
    taskSteps.forEach((step, index) => {
      if (step.status === 'pending' || step.status === 'active') {
        step.status = 'completed';
        step.completed = true;
      }
    });
    renderTaskSteps();
  }
  
  // Auto-hide panel after completion
  setTimeout(() => {
    hideTaskPanel();
  }, success ? 3000 : 5000); // Show longer for failures
}

function showTaskPanel() {
  const taskPanel = document.getElementById('taskExecutionPanel');
  if (taskPanel) {
    taskPanel.classList.add('active');
    
    // Adjust status area position
    const statusArea = document.getElementById('statusArea');
    if (statusArea) {
      statusArea.style.bottom = '320px'; // Move up when task panel is visible
    }
  }
}

function hideTaskPanel() {
  // Stop auto-progression
  stopAutoProgression();
  
  const taskPanel = document.getElementById('taskExecutionPanel');
  const transcriptArea = document.getElementById('transcriptArea');
  const statusArea = document.getElementById('statusArea');
  
  if (taskPanel) {
    taskPanel.classList.remove('active');
  }
  
  if (transcriptArea) {
    transcriptArea.style.opacity = '1';
  }
  
  if (statusArea) {
    statusArea.style.bottom = '84px'; // Reset to original position
  }
  
  // Reset task state
  currentTask = null;
  taskSteps = [];
  activeStepIndex = -1;
}

// Auto-progression fallback system
let autoProgressionTimer = null;
let autoProgressionStep = 0;

function startAutoProgression(totalSteps) {
  // Clear any existing timer
  if (autoProgressionTimer) {
    clearInterval(autoProgressionTimer);
  }
  
  autoProgressionStep = 0;
  
  // Start the first step immediately
  setTimeout(() => {
    if (currentTask && autoProgressionStep < totalSteps) {
      updateStepStatus(autoProgressionStep, 'active');
      autoProgressionStep++;
    }
  }, 1000);
  
  // Continue progressing steps every 3 seconds
  autoProgressionTimer = setInterval(() => {
    if (!currentTask) {
      clearInterval(autoProgressionTimer);
      return;
    }
    
    if (autoProgressionStep <= totalSteps) {
      // Complete previous step
      if (autoProgressionStep > 0) {
        updateStepStatus(autoProgressionStep - 1, 'completed');
      }
      
      // Start next step if available
      if (autoProgressionStep < totalSteps) {
        updateStepStatus(autoProgressionStep, 'active');
        autoProgressionStep++;
      } else {
        // All steps completed
        clearInterval(autoProgressionTimer);
      }
    }
  }, 3000); // Progress every 3 seconds
}

function stopAutoProgression() {
  if (autoProgressionTimer) {
    clearInterval(autoProgressionTimer);
    autoProgressionTimer = null;
  }
  autoProgressionStep = 0;
}

// Helper function to determine if a command needs multi-step display
function isComplexCommand(command) {
  const complexKeywords = [
    'open', 'launch', 'start', 'play', 'create', 'send', 'email', 
    'search', 'find', 'navigate', 'browse', 'download', 'install',
    'reminder', 'note', 'calendar', 'schedule', 'youtube', 'google',
    'website', 'application', 'browser', 'document', 'file'
  ];
  
  const lowerCommand = command.toLowerCase();
  return complexKeywords.some(keyword => lowerCommand.includes(keyword)) || 
         command.split(' ').length > 3; // Complex if more than 3 words
}

// Generate steps for common commands
function generateStepsForCommand(command) {
  const lowerCommand = command.toLowerCase();
  
  // YouTube-related commands
  if (lowerCommand.includes('youtube') || (lowerCommand.includes('play') && lowerCommand.includes('video'))) {
    return [
      "Open web browser",
      "Navigate to YouTube",
      "Search for the requested video",
      "Select the appropriate video",
      "Start playback"
    ];
  }
  
  // Reminder/Note commands
  if (lowerCommand.includes('reminder') || lowerCommand.includes('note')) {
    return [
      "Open Reminders app",
      "Create new reminder",
      "Set reminder text",
      "Configure timing",
      "Save reminder"
    ];
  }
  
  // Email commands
  if (lowerCommand.includes('email') || lowerCommand.includes('send')) {
    return [
      "Open Mail app",
      "Create new email",
      "Set recipient",
      "Write message content",
      "Send email"
    ];
  }
  
  // Browser/Website commands
  if (lowerCommand.includes('open') && (lowerCommand.includes('website') || lowerCommand.includes('browser'))) {
    return [
      "Launch web browser",
      "Enter website URL",
      "Navigate to page",
      "Wait for page load"
    ];
  }
  
  // System commands (brightness, volume, etc.)
  if (lowerCommand.includes('brightness') || lowerCommand.includes('volume') || lowerCommand.includes('screen')) {
    return [
      "Access system preferences",
      "Locate display/sound settings",
      "Adjust the requested setting",
      "Apply changes"
    ];
  }
  
  // File/Application commands
  if (lowerCommand.includes('open') || lowerCommand.includes('launch') || lowerCommand.includes('start')) {
    return [
      "Locate the application",
      "Launch the application",
      "Wait for app to load",
      "Perform requested action"
    ];
  }
  
  // Generic fallback for complex commands
  return [
    "Analyze the command",
    "Execute the primary action",
    "Verify completion",
    "Provide feedback"
  ];
}

// Demo function to show multi-step task (for testing)
function demoMultiStepTask() {
  const steps = [
    "Open browser",
    "Click in the address bar and type youtube.com and press enter", 
    "Search for 'coldplay paradise'",
    "Click on first video",
    "Click play button"
  ];
  
  startMultiStepTask("play coldplay paradise on youtube", steps);
  
  // Simulate step execution
  let currentStep = 0;
  const executeNextStep = () => {
    if (currentStep < steps.length) {
      updateStepStatus(currentStep, 'active');
      
      setTimeout(() => {
        updateStepStatus(currentStep, 'completed');
        currentStep++;
        
        if (currentStep < steps.length) {
          setTimeout(executeNextStep, 800);
        } else {
          completeMultiStepTask(true);
        }
      }, 2000);
    }
  };
  
  setTimeout(executeNextStep, 1000);
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
  
  // Set up task panel close button
  const taskCloseBtn = document.getElementById('taskCloseBtn');
  if (taskCloseBtn) {
    taskCloseBtn.addEventListener('click', hideTaskPanel);
  }
  
  // Add keyboard shortcut for demo (Ctrl+D)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      demoMultiStepTask();
    }
  });
  
  console.log("Overlay widget initialized with multi-step task support");
}); 