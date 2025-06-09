// Simple Voice-to-Text Interface
console.log('🎤 Simple Voice Interface Renderer Loaded');

// DOM Elements
let commandInput;
let submitButton;
let microphoneButton;
let clearButton;
let historyContainer;
let statusContainer;
let isRecording = false;
let currentAudio = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('📱 Initializing simple voice interface...');
  
  // Get DOM elements
  commandInput = document.getElementById('commandInput');
  submitButton = document.getElementById('submitButton');
  microphoneButton = document.getElementById('microphoneButton');
  clearButton = document.getElementById('clearButton');
  historyContainer = document.getElementById('historyContainer');
  statusContainer = document.getElementById('status');
  
  // Set up event listeners
  setupEventListeners();
  setupAudioCapture();
  loadCommandHistory();
  
  // Update status
  updateStatus('Ready for voice input', 'success');
});

// Set up event listeners
function setupEventListeners() {
  // Submit button
  if (submitButton) {
    submitButton.addEventListener('click', handleManualSubmit);
  }
  
  // Enter key in input
  if (commandInput) {
    commandInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleManualSubmit();
      }
    });
  }
  
  // Microphone button
  if (microphoneButton) {
    microphoneButton.addEventListener('click', toggleRecording);
  }
  
  // Clear history button
  if (clearButton) {
    clearButton.addEventListener('click', clearHistory);
  }
}

// Set up audio capture
async function setupAudioCapture() {
  try {
    console.log('🎧 Setting up audio capture...');
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000
      } 
    });
    
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (event) => {
      if (isRecording) {
        const audioData = event.inputBuffer.getChannelData(0);
        const audioBuffer = new Float32Array(audioData);
        
        // Convert to PCM and send to main process
        const pcmData = convertToPCM(audioBuffer);
        window.electronAPI.sendAudio(Array.from(pcmData));
      }
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    console.log('✅ Audio capture ready');
    updateStatus('Audio capture initialized', 'success');
    
  } catch (error) {
    console.error('❌ Failed to set up audio:', error);
    updateStatus('Failed to access microphone', 'error');
  }
}

// Convert Float32Array to PCM
function convertToPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  
  return new Uint8Array(buffer);
}

// Toggle recording
async function toggleRecording() {
  if (isRecording) {
    // Stop recording
    isRecording = false;
    microphoneButton.textContent = '🎤 Start Recording';
    microphoneButton.classList.remove('recording');
    updateStatus('Recording stopped', 'info');
    
    await window.electronAPI.stopRecording();
  } else {
    // Start recording
    isRecording = true;
    microphoneButton.textContent = '🛑 Stop Recording';
    microphoneButton.classList.add('recording');
    updateStatus('Recording... Speak now', 'recording');
    
    await window.electronAPI.startRecording();
  }
}

// Handle manual text submission
async function handleManualSubmit() {
  const command = commandInput.value.trim();
  if (!command) return;
  
  try {
    updateStatus('Processing command...', 'info');
    
    const result = await window.electronAPI.manualCommand(command);
    
    if (result.success) {
      addToHistory(command, 'manual', true, result.message);
      updateStatus('Command processed', 'success');
    } else {
      addToHistory(command, 'manual', false, result.error || 'Failed to process command');
      updateStatus('Command failed', 'error');
    }
    
    commandInput.value = '';
    
  } catch (error) {
    console.error('Error submitting command:', error);
    updateStatus('Error processing command', 'error');
  }
}

// Add item to history
function addToHistory(command, type, success, result = '') {
  const historyItem = document.createElement('div');
  historyItem.className = `history-item ${success ? 'success' : 'error'}`;
  
  const timestamp = new Date().toLocaleTimeString();
  const typeIcon = type === 'voice' ? '🎤' : '✏️';
  const statusIcon = success ? '✅' : '❌';
  
  historyItem.innerHTML = `
    <div class="history-header">
      <span class="history-type">${typeIcon} ${type.toUpperCase()}</span>
      <span class="history-time">${timestamp}</span>
      <span class="history-status">${statusIcon}</span>
    </div>
    <div class="history-command">"${command}"</div>
    ${result ? `<div class="history-result">${result}</div>` : ''}
  `;
  
  historyContainer.insertBefore(historyItem, historyContainer.firstChild);
  
  // Keep only last 20 items visible
  while (historyContainer.children.length > 20) {
    historyContainer.removeChild(historyContainer.lastChild);
  }
}

// Update status
function updateStatus(message, type = 'info') {
  if (!statusContainer) return;
  
  statusContainer.textContent = message;
  statusContainer.className = `status ${type}`;
  
  console.log(`📊 Status: ${message} (${type})`);
}

// Load command history
async function loadCommandHistory() {
  try {
    const history = await window.electronAPI.getCommandHistory();
    
    // Display last 10 commands
    history.slice(0, 10).reverse().forEach(item => {
      addToHistory(item.command, item.type, true, '');
    });
    
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

// Clear history
async function clearHistory() {
  try {
    await window.electronAPI.clearHistory();
    historyContainer.innerHTML = '';
    updateStatus('History cleared', 'success');
  } catch (error) {
    console.error('Error clearing history:', error);
    updateStatus('Failed to clear history', 'error');
  }
}

// Listen for IPC events from main process
window.electronAPI.onDeepgramReady(() => {
  console.log('✅ Deepgram connection ready');
  updateStatus('Voice recognition ready', 'success');
});

window.electronAPI.onDeepgramTranscript((data) => {
  const { transcript, isFinal, confidence } = data;
  
  // Update input field with interim results
  if (!isFinal) {
    commandInput.value = transcript;
    commandInput.style.fontStyle = 'italic';
    commandInput.style.opacity = '0.7';
  } else {
    // Final transcript
    commandInput.value = transcript;
    commandInput.style.fontStyle = 'normal';
    commandInput.style.opacity = '1';
    
    // Add to history
    addToHistory(transcript, 'voice', true, 'Transcription complete');
    
    // Clear input after 2 seconds
    setTimeout(() => {
      commandInput.value = '';
    }, 2000);
  }
});

window.electronAPI.onDeepgramClosed((data) => {
  console.log('🔌 Deepgram connection closed:', data);
  updateStatus('Voice recognition disconnected - reconnecting...', 'warning');
});

window.electronAPI.onDeepgramError((data) => {
  console.error('🚨 Deepgram error:', data);
  updateStatus('Voice recognition error', 'error');
});

console.log('✅ Simple Voice Interface Ready');
