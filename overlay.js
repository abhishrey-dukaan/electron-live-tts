// Simple Voice Transcript Overlay
console.log('🎤 Simple Voice Overlay Loaded');

let transcriptArea;
let transcriptText;
let commandInput;
let currentTranscript = '';
let commandHistory = [];

// Initialize overlay
document.addEventListener('DOMContentLoaded', () => {
  console.log('📱 Initializing simple voice overlay...');
  
  // Get DOM elements
  transcriptArea = document.querySelector('.transcript');
  transcriptText = document.querySelector('.transcript-text');
  commandInput = document.querySelector('.command-input');
  
  // Set up event listeners
  setupEventListeners();
  loadHistory();
  updateHistoryDisplay();
  
  console.log('✅ Simple overlay ready');
});

// Set up event listeners
function setupEventListeners() {
  // Manual command input
  if (commandInput) {
    commandInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleManualCommand();
      }
    });
  }
}

// Load history from localStorage
function loadHistory() {
  try {
    const stored = localStorage.getItem('simple-voice-history');
    if (stored) {
      commandHistory = JSON.parse(stored);
      // Keep only last 10 commands
      if (commandHistory.length > 10) {
        commandHistory = commandHistory.slice(-10);
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
    localStorage.setItem('simple-voice-history', JSON.stringify(commandHistory));
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

// Add command to history
function addToHistory(command, type = 'voice') {
  const historyEntry = {
    id: Date.now(),
    command: command,
    type: type,
    timestamp: new Date().toISOString()
  };
  
  commandHistory.push(historyEntry);
  
  // Keep only last 10 entries
  if (commandHistory.length > 10) {
    commandHistory = commandHistory.slice(-10);
  }
  
  saveHistory();
  updateHistoryDisplay();
}

// Update history display
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
    const typeIcon = entry.type === 'manual' ? '💬' : '🎤';
    
    return `
      <div class="history-entry">
        <div class="history-header">
          <span class="history-type">${typeIcon}</span>
          <span class="history-time">${timeAgo}</span>
        </div>
        <div class="history-command">${entry.command}</div>
      </div>
    `;
  }).join('');
  
  transcriptText.innerHTML = historyHTML;
  
  // Scroll to bottom to show latest
  if (transcriptArea) {
    transcriptArea.scrollTop = transcriptArea.scrollHeight;
  }
}

// Get time ago string
function getTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

// Handle manual command submission
async function handleManualCommand() {
  if (!commandInput) return;
  
  const command = commandInput.value.trim();
  if (!command) return;
  
  try {
    console.log(`📝 Manual command: "${command}"`);
    
    // Add to history
    addToHistory(command, 'manual');
    
    // Send to main process (just for logging)
    const result = await window.electronAPI.manualCommand(command);
    console.log('Command result:', result);
    
    // Clear input
    commandInput.value = '';
    
    // Show temporary feedback
    updateTranscript(`Manual: ${command}`, true);
    
  } catch (error) {
    console.error('Error submitting manual command:', error);
  }
}

// Update transcript display
function updateTranscript(text, isTemp = false) {
  if (isTemp) {
    // Show temporary message
    if (transcriptText) {
      transcriptText.innerHTML = `
        <div class="current-transcript">
          <div class="transcript-text">${text}</div>
        </div>
      `;
    }
    
    // Revert to history after 2 seconds
    setTimeout(() => {
      updateHistoryDisplay();
    }, 2000);
  }
}

// IPC event listeners
window.electronAPI.onDeepgramReady(() => {
  console.log('✅ Deepgram ready in overlay');
});

window.electronAPI.onDeepgramTranscript((data) => {
  const { transcript, isFinal } = data;
  
  if (transcript.trim()) {
    console.log(`🎤 Overlay transcript: "${transcript}" (${isFinal ? 'final' : 'interim'})`);
    
    // Show current transcript
    updateTranscript(`🎤 ${transcript}`, !isFinal);
    
    if (isFinal) {
      // Add to history
      addToHistory(transcript, 'voice');
      currentTranscript = transcript;
    }
  }
});

window.electronAPI.onDeepgramClosed((data) => {
  console.log('🔌 Deepgram closed in overlay:', data);
  updateTranscript('🔌 Reconnecting...', true);
});

window.electronAPI.onDeepgramError((data) => {
  console.error('🚨 Deepgram error in overlay:', data);
  updateTranscript('❌ Voice recognition error', true);
});

console.log('✅ Simple Voice Overlay Ready'); 