// Overlay widget for voice command status and transcripts
const { ipcRenderer } = require("electron");

let currentTranscript = "";
let isProcessing = false;
let currentTaskSteps = 0;
let totalTaskSteps = 0;

// DOM elements
const transcriptArea = document.getElementById("transcriptArea");
const transcriptText = document.getElementById("transcriptText");
const statusIndicator = document.getElementById("statusIndicator");
const spinnerIcon = document.getElementById("spinnerIcon");
const successIcon = document.getElementById("successIcon");
const errorIcon = document.getElementById("errorIcon");
const timeStamp = document.getElementById("timeStamp");

// Update timestamp
function updateTimestamp() {
  const now = new Date();
  timeStamp.textContent = now.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Update status indicator
function updateStatus(status) {
  // Remove existing status classes
  transcriptArea.classList.remove('processing', 'success', 'error');
  
  // Hide all indicators
  spinnerIcon.classList.remove('active');
  successIcon.classList.remove('active');
  errorIcon.classList.remove('active');
  
  switch(status) {
    case 'processing':
      transcriptArea.classList.add('processing');
      spinnerIcon.classList.add('active');
      break;
    case 'success':
      transcriptArea.classList.add('success');
      successIcon.classList.add('active');
      break;
    case 'error':
      transcriptArea.classList.add('error');
      errorIcon.classList.add('active');
      break;
    default:
      // No specific status
      break;
  }
  
  updateTimestamp();
}

// Handle Deepgram events
ipcRenderer.on("deepgram-ready", () => {
  console.log("Overlay: Deepgram ready");
  transcriptText.textContent = "🎤 Ready for commands...";
  updateTimestamp();
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
  transcriptText.textContent = "❌ Connection error";
  updateStatus('error');
});

ipcRenderer.on("deepgram-closed", (event, data) => {
  console.log("Overlay: Deepgram closed:", data);
  transcriptText.textContent = "🔌 Disconnected";
  updateTimestamp();
});

// Listen for command execution updates from main window
ipcRenderer.on("command-processing", (event, command) => {
  transcriptText.textContent = `🔄 Processing: "${command}"`;
  updateStatus('processing');
});

ipcRenderer.on("command-success", (event, command) => {
  transcriptText.textContent = `✅ Executed: "${command}"`;
  updateStatus('success');
  
  // Clear after 3 seconds and reset for next command
  setTimeout(() => {
    currentTranscript = "";
    transcriptText.textContent = "🎤 Ready for next command...";
    updateStatus();
  }, 3000);
});

ipcRenderer.on("command-error", (event, command, error) => {
  transcriptText.textContent = `❌ Failed: "${command}"`;
  updateStatus('error');
  
  // Clear after 4 seconds and reset for next command
  setTimeout(() => {
    currentTranscript = "";
    transcriptText.textContent = "🎤 Ready for next command...";
    updateStatus();
  }, 4000);
});

// Listen for task orchestrator events
ipcRenderer.on("task-step-complete", (event, data) => {
  const { stepNumber, totalSteps, description } = data;
  currentTaskSteps = stepNumber;
  totalTaskSteps = totalSteps;
  
  transcriptText.textContent = `📋 Step ${stepNumber}/${totalSteps}: ${description.substring(0, 40)}...`;
  updateStatus('processing');
});

// Listen for screenshot analysis events
ipcRenderer.on("screenshot-analysis-start", (event, data) => {
  const { failedStep } = data;
  transcriptText.textContent = `📷 Taking screenshot to analyze failure...`;
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
  
  if (success) {
    transcriptText.textContent = `🎉 Task completed successfully!`;
    updateStatus('success');
  } else {
    transcriptText.textContent = `❌ Task failed: ${message}`;
    updateStatus('error');
  }
  
  // Reset after showing result
  setTimeout(() => {
    currentTranscript = "";
    currentTaskSteps = 0;
    totalTaskSteps = 0;
    transcriptText.textContent = "🎤 Ready for next command...";
    updateStatus();
  }, success ? 3000 : 4000);
});

ipcRenderer.on("task-error", (event, data) => {
  const { error, stepNumber, totalSteps } = data;
  transcriptText.textContent = `⚠️ Step ${stepNumber} failed: ${error.substring(0, 30)}...`;
  updateStatus('error');
});

// Handle minimize button click
async function handleMinimize() {
  try {
    const result = await ipcRenderer.invoke("minimize-overlay");
    if (result.success) {
      console.log("Overlay minimized to tray");
    } else {
      console.error("Failed to minimize overlay:", result.message);
    }
  } catch (error) {
    console.error("Error minimizing overlay:", error);
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
  
  // Update display to show typed command
  currentTranscript = command;
  transcriptText.textContent = `⌨️ ${command}`;
  updateStatus('processing');
  
  try {
    // Send command to main process (same as voice commands)
    const result = await ipcRenderer.invoke('execute-command', command);
    console.log('Manual command executed:', result);
  } catch (error) {
    console.error('Error executing manual command:', error);
    transcriptText.textContent = `❌ Failed: "${command}"`;
    updateStatus('error');
    
    // Reset after error
    setTimeout(() => {
      currentTranscript = "";
      transcriptText.textContent = "🎤 Ready for next command...";
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
  updateTimestamp();
}

// Initialize overlay
document.addEventListener("DOMContentLoaded", () => {
  updateTimestamp();
  
  // Clear any residual text and set initial state
  currentTranscript = "";
  transcriptText.textContent = "🎤 Ready for commands...";
  updateStatus();
  
  // Update timestamp every second
  setInterval(updateTimestamp, 1000);
  
  // Add minimize button event listener
  const minimizeButton = document.getElementById("minimizeButton");
  if (minimizeButton) {
    minimizeButton.addEventListener("click", handleMinimize);
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