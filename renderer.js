// Voice Command Runner - Simplified for automatic voice processing
const { ipcRenderer } = require("electron");

// Fallback for window.electronAPI when preload is unavailable
if (!window.electronAPI) {
  window.electronAPI = {
    // Voice and audio
    sendAudio: (data) => ipcRenderer.send("audio-data", data),
    // Deepgram
    startDeepgram: () => ipcRenderer.invoke("start-deepgram"),
    stopDeepgram: () => ipcRenderer.invoke("stop-deepgram"),
    // Command execution
    executeCommand: (t, h) => ipcRenderer.invoke("execute-command", t, h),
    executeDynamicTask: (d) => ipcRenderer.invoke("execute-dynamic-task", d),
    executeWebTask: (type, p) => ipcRenderer.invoke("execute-web-task", type, p),
    stopTask: () => ipcRenderer.invoke("stop-task"),
    // Model configuration
    getAvailableModels: () => ipcRenderer.invoke("get-available-models"),
    getModelConfig: () => ipcRenderer.invoke("get-model-config"),
    setTextModel: (prov, model) => ipcRenderer.invoke("set-text-model", prov, model),
    setImageModel: (prov, model) => ipcRenderer.invoke("set-image-model", prov, model),
    testAllModels: () => ipcRenderer.invoke("test-all-models"),
    // System prompt
    getSystemPrompt: () => ipcRenderer.invoke("get-system-prompt"),
    updateSystemPrompt: (p) => ipcRenderer.invoke("update-system-prompt", p),
    // Event listeners
    onInitEnv: (cb) => ipcRenderer.on("init-env", cb),
    onDeepgramReady: (cb) => ipcRenderer.on("deepgram-ready", cb),
    onDeepgramClosed: (cb) => ipcRenderer.on("deepgram-closed", cb),
    onDeepgramError: (cb) => ipcRenderer.on("deepgram-error", cb),
    onDeepgramReconnected: (cb) => ipcRenderer.on("deepgram-reconnected", cb),
    onDeepgramTranscript: (cb) => ipcRenderer.on("deepgram-transcript", cb),
    // Task events
    onTaskStepComplete: (cb) => ipcRenderer.on("task-step-complete", cb),
    onTaskComplete: (cb) => ipcRenderer.on("task-complete", cb),
    onTaskError: (cb) => ipcRenderer.on("task-error", cb),
    // Command events
    onCommandProcessing: (cmd) => ipcRenderer.send("command-processing", cmd),
    onCommandSuccess: (cmd) => ipcRenderer.send("command-success", cmd),
    onCommandError: (cmd, err) => ipcRenderer.send("command-error", cmd, err),
  };
}

// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // DOM elements - updated to match the new HTML IDs
  const transcriptEl = document.getElementById("transcript");
  const startBtn = document.getElementById("startBtn");
  const testYouTubeBtn = document.getElementById("testYouTubeBtn");
  const testMicBtn = document.getElementById("testMicBtn");
  const clearLogBtn = document.getElementById("clearLogBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const runTestSuiteBtn = document.getElementById("runTestSuiteBtn");
  const helpBtn = document.getElementById("helpBtn");
  const logContainer = document.getElementById("logContainer");
  
  // Status elements
  const connectionStatus = document.getElementById("connection-status");
  const recordingStatus = document.getElementById("recording-status");
  const taskStatus = document.getElementById("task-status");
  const connectionIndicator = document.getElementById("connection-indicator");
  const recordingIndicator = document.getElementById("recording-indicator");
  const taskIndicator = document.getElementById("task-indicator");

  let isRecording = false;
  let currentTranscript = ""; // Current command being built
  let audioContext = null;
  let audioStream = null;
  let silenceTimer = null;
  let commandSilenceTimer = null; // New timer for command processing
  let lastAudioTime = Date.now();
  let silenceStart = null;
  const SILENCE_THRESHOLD = 0.01;
  const SILENCE_DURATION = 2000;
  const COMMAND_SILENCE_DURATION = 3000; // 3 seconds silence to process command
  let lastLogTime = 0;
  let audioProcessor = null;
  let isProcessingCommand = false;
  let heartbeatInterval = null; // Add heartbeat interval
  let lastAudioLevelLog = 0;
  let lastAudioSentTime = 0;

  // Initialize the interface
  initializeInterface();

  function initializeInterface() {
    // Set initial status
    updateConnectionStatus("Ready");
    updateRecordingStatus("Ready");
    updateTaskStatus("Ready");
    
    // Add initial log entries
    addLogEntry("✅ Voice Assistant initialized successfully", "success");
    addLogEntry("🔗 Connecting to Deepgram WebSocket...", "info");
    addLogEntry("🎤 Audio system ready - listening for commands", "primary");
    addLogEntry("System ready for voice commands...", "");
    
    // Setup event listeners
    setupEventListeners();
    
    // Auto-start recording
    setTimeout(() => {
      startRecording();
    }, 1000);
  }

  // Setup all event listeners
  function setupEventListeners() {
    console.log("🔧 Setting up event listeners...");
    
    // Debug: Check if elements exist
    console.log("Elements found:", {
      startBtn: !!startBtn,
      testYouTubeBtn: !!testYouTubeBtn,
      testMicBtn: !!testMicBtn,
      clearLogBtn: !!clearLogBtn,
      settingsBtn: !!settingsBtn,
      runTestSuiteBtn: !!runTestSuiteBtn,
      helpBtn: !!helpBtn
    });

    if (startBtn) {
      console.log("✅ Attaching start button listener");
      startBtn.addEventListener("click", (e) => {
        console.log("🎤 Start button clicked!");
        e.preventDefault();
        toggleRecording();
      });
    } else {
      console.log("❌ Start button not found!");
    }

    if (testYouTubeBtn) {
      console.log("✅ Attaching YouTube test button listener");
      testYouTubeBtn.addEventListener("click", async (e) => {
        console.log("▶️ YouTube test button clicked!");
        e.preventDefault();
        addLogEntry("🧪 Testing YouTube command...", "info");
        updateTaskStatus("Testing");
        updateTaskIndicator("processing");
        
        try {
          const result = await window.electronAPI.executeCommand("play porcupine tree songs on youtube");
          if (result.success) {
            addLogEntry("✅ YouTube test completed successfully!", "success");
            updateTaskStatus("Completed");
            updateTaskIndicator("connected");
          } else {
            addLogEntry("❌ YouTube test failed", "error");
            updateTaskStatus("Failed");
            updateTaskIndicator("disconnected");
          }
        } catch (error) {
          addLogEntry("❌ YouTube test error: " + error.message, "error");
          updateTaskStatus("Error");
          updateTaskIndicator("disconnected");
        }
        
        // Reset status after 3 seconds
        setTimeout(() => {
          updateTaskStatus("Ready");
          updateTaskIndicator("ready");
        }, 3000);
      });
    } else {
      console.log("❌ YouTube test button not found!");
    }

    if (testMicBtn) {
      console.log("✅ Attaching microphone test button listener");
      testMicBtn.addEventListener("click", async (e) => {
        console.log("🎤 Microphone test button clicked!");
        e.preventDefault();
        addLogEntry("🎤 Testing microphone...", "info");
        updateRecordingStatus("Testing");
        updateRecordingIndicator("processing");
        
        try {
          // Test microphone access
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          addLogEntry("✅ Microphone access granted", "success");
          
          // Test audio levels for 3 seconds
          const audioContext = new AudioContext();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          source.connect(analyser);
          
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let testCount = 0;
          const maxTests = 30; // 3 seconds at ~100ms intervals
          
          const testInterval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            
            if (average > 10) {
              addLogEntry(`🔊 Audio detected (level: ${Math.round(average)})`, "success");
            }
            
            testCount++;
            if (testCount >= maxTests) {
              clearInterval(testInterval);
              stream.getTracks().forEach(track => track.stop());
              audioContext.close();
              
              addLogEntry("✅ Microphone test completed", "success");
              updateRecordingStatus("Ready");
              updateRecordingIndicator("ready");
            }
          }, 100);
          
        } catch (error) {
          addLogEntry("❌ Microphone test failed: " + error.message, "error");
          updateRecordingStatus("Error");
          updateRecordingIndicator("disconnected");
          
          // Reset status after 3 seconds
          setTimeout(() => {
            updateRecordingStatus("Ready");
            updateRecordingIndicator("ready");
          }, 3000);
        }
      });
    } else {
      console.log("❌ Microphone test button not found!");
    }

    if (clearLogBtn) {
      console.log("✅ Attaching clear log button listener");
      clearLogBtn.addEventListener("click", () => {
        logContainer.innerHTML = '';
        addLogEntry("🗑️ Log cleared", "info");
        addLogEntry("✅ Voice Assistant ready", "success");
        addLogEntry("🎤 Listening for commands...", "primary");
      });
    }

    if (settingsBtn) {
      console.log("✅ Attaching settings button listener");
      settingsBtn.addEventListener("click", () => {
        console.log("⚙️ Settings button clicked!");
        addLogEntry("⚙️ Opening settings...", "info");
        settingsModal.classList.add("active");
      });
    } else {
      console.log("❌ Settings button not found!");
    }

    if (runTestSuiteBtn) {
      console.log("✅ Attaching test suite button listener");
      runTestSuiteBtn.addEventListener("click", async (e) => {
        console.log("🧪 Test suite button clicked!");
        e.preventDefault();
        addLogEntry("🧪 Starting comprehensive test suite...", "info");
        updateTaskStatus("Testing");
        updateTaskIndicator("processing");
        
        try {
          const result = await window.electronAPI.runComprehensiveTests();
          if (result.success) {
            addLogEntry("✅ Test suite completed successfully!", "success");
            updateTaskStatus("Completed");
            updateTaskIndicator("connected");
          } else {
            addLogEntry("❌ Test suite failed: " + result.error, "error");
            updateTaskStatus("Failed");
            updateTaskIndicator("disconnected");
          }
        } catch (error) {
          addLogEntry("❌ Test suite error: " + error.message, "error");
          updateTaskStatus("Error");
          updateTaskIndicator("disconnected");
        }
        
        // Reset status after 3 seconds
        setTimeout(() => {
          updateTaskStatus("Ready");
          updateTaskIndicator("ready");
        }, 3000);
      });
    } else {
      console.log("❌ Test suite button not found!");
    }

    if (helpBtn) {
      console.log("✅ Attaching help button listener");
      helpBtn.addEventListener("click", (e) => {
        console.log("❓ Help button clicked!");
        e.preventDefault();
        showHelpModal();
      });
    } else {
      console.log("❌ Help button not found!");
    }
  
    console.log("✅ All event listeners attached!");
  }

  // Help Modal Function
  function showHelpModal() {
    const helpModal = document.createElement('div');
    helpModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    helpModal.innerHTML = `
      <div class="bg-gray-900 rounded-2xl p-6 max-w-4xl w-full max-h-screen overflow-y-auto m-4">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold text-white">VoiceMac Help & Commands</h2>
          <button id="close-help-modal" class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <h3 class="text-lg font-semibold text-white mb-4">Application Control</h3>
            <div class="space-y-2 mb-6">
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"open notes"</div>
                <div class="text-gray-300 text-xs">Launch any application</div>
              </div>
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"quit safari"</div>
                <div class="text-gray-300 text-xs">Close any application</div>
              </div>
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"switch to finder"</div>
                <div class="text-gray-300 text-xs">Switch to running app</div>
              </div>
            </div>
            
            <h3 class="text-lg font-semibold text-white mb-4">System Control</h3>
            <div class="space-y-2">
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"take screenshot"</div>
                <div class="text-gray-300 text-xs">Capture your screen</div>
              </div>
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"lock screen"</div>
                <div class="text-gray-300 text-xs">Lock your Mac</div>
              </div>
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"volume up"</div>
                <div class="text-gray-300 text-xs">Control system volume</div>
              </div>
            </div>
          </div>
          
          <div>
            <h3 class="text-lg font-semibold text-white mb-4">Web Automation</h3>
            <div class="space-y-2 mb-6">
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"search for cats on youtube"</div>
                <div class="text-gray-300 text-xs">Search and play YouTube videos</div>
              </div>
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"search for weather"</div>
                <div class="text-gray-300 text-xs">Google search for anything</div>
              </div>
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"open reddit.com"</div>
                <div class="text-gray-300 text-xs">Navigate to any website</div>
              </div>
            </div>
            
            <h3 class="text-lg font-semibold text-white mb-4">File Operations</h3>
            <div class="space-y-2">
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"open downloads"</div>
                <div class="text-gray-300 text-xs">Open Downloads folder</div>
              </div>
              <div class="bg-gray-800 rounded p-3">
                <div class="font-mono text-green-400 text-sm">"create folder named MyDocs"</div>
                <div class="text-gray-300 text-xs">Create new folder on desktop with specified name</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="mt-6 p-4 bg-blue-900 bg-opacity-50 rounded-lg">
          <h4 class="text-white font-semibold mb-2">💡 Tips for Best Results</h4>
          <ul class="text-blue-200 text-sm space-y-1">
            <li>• Speak clearly and naturally</li>
            <li>• Wait for 3 seconds of silence after each command</li>
            <li>• Use specific app names (e.g., "Safari" not "browser")</li>
            <li>• Commands work even when app is minimized</li>
          </ul>
        </div>
      </div>
    `;
    
    document.body.appendChild(helpModal);
    
    // Close modal event
    document.getElementById('close-help-modal').addEventListener('click', () => {
      document.body.removeChild(helpModal);
    });
    
    // Close on background click
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        document.body.removeChild(helpModal);
      }
    });
  }

  // Toggle recording function
  async function toggleRecording() {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  // Update status functions
  function updateConnectionStatus(status) {
    if (connectionStatus) {
      connectionStatus.textContent = status;
    }
  }

  function updateRecordingStatus(status) {
    if (recordingStatus) {
      recordingStatus.textContent = status;
    }
  }

  function updateTaskStatus(status) {
    if (taskStatus) {
      taskStatus.textContent = status;
    }
  }

  function updateConnectionIndicator(type) {
    if (connectionIndicator) {
      connectionIndicator.className = `indicator ${type}`;
    }
  }

  function updateRecordingIndicator(type) {
    if (recordingIndicator) {
      recordingIndicator.className = `indicator ${type}`;
    }
  }

  function updateTaskIndicator(type) {
    if (taskIndicator) {
      taskIndicator.className = `indicator ${type}`;
    }
  }

  // Update button states
  function updateButtonStates() {
    if (startBtn) {
      if (isRecording) {
        startBtn.innerHTML = '<span>🛑</span>Stop Listening';
        startBtn.className = 'control-btn danger';
      } else {
        startBtn.innerHTML = '<span>🎤</span>Start Listening';
        startBtn.className = 'control-btn success';
      }
    }
  }

  // Settings modal functionality
  const settingsModal = document.getElementById("settings-modal");
  const closeModalBtn = document.getElementById("close-modal");
  const systemPromptTextarea = document.getElementById("system-prompt-textarea");
  const resetPromptBtn = document.getElementById("reset-prompt-btn");
  const cancelSettingsBtn = document.getElementById("cancel-settings-btn");
  const saveSettingsBtn = document.getElementById("save-settings-btn");

  // Model configuration elements
  const textProviderSelect = document.getElementById("text-provider-select");
  const textModelSelect = document.getElementById("text-model-select");
  const imageProviderSelect = document.getElementById("image-provider-select");
  const imageModelSelect = document.getElementById("image-model-select");
  const testModelsBtn = document.getElementById("test-models-btn");
  const testResults = document.getElementById("test-results");

  // Debug: Check if settings elements exist
  console.log("Settings elements found:", {
    settingsModal: !!settingsModal,
    closeModalBtn: !!closeModalBtn,
    systemPromptTextarea: !!systemPromptTextarea,
    resetPromptBtn: !!resetPromptBtn,
    cancelSettingsBtn: !!cancelSettingsBtn,
    saveSettingsBtn: !!saveSettingsBtn,
    textProviderSelect: !!textProviderSelect,
    textModelSelect: !!textModelSelect,
    imageProviderSelect: !!imageProviderSelect,
    imageModelSelect: !!imageModelSelect,
    testModelsBtn: !!testModelsBtn,
    testResults: !!testResults
  });

  let availableModels = {};
  let currentConfig = { textModel: null, imageModel: null };

  // Default system prompt for VoiceMac
  const defaultSystemPrompt = `You are VoiceMac, an AI assistant specialized in controlling a macOS environment via voice commands. Follow these rules:

1. Listen for natural language instructions and translate them into JSON-formatted \`actionSteps\` arrays. Each \`actionStep\` must have \`type\`, \`description\`, and \`script\` fields. Use AppleScript or shell commands as appropriate.

2. Supported \`type\` values:
   • KEYBOARD – for simulating keystrokes (e.g., quit apps, keyboard shortcuts).
   • APPLICATION – for launching or quitting applications.
   • FILE – for opening folders or files.
   • SYSTEM – for adjusting system settings (volume, screen sleep, screenshots, lock screen, etc.).
   • MOUSE – for moving the cursor or clicking at specific coordinates.
   • UI_ELEMENT – for interacting with menu items or UI controls via AppleScript/UI scripting.
   • NOTIFICATION – for showing macOS notifications.
   • MEDIA – for controlling media playback (Spotify, iTunes, etc.).
   • WINDOW – for window management (minimize, maximize, switch spaces).
   • SHELL – for running arbitrary shell scripts when needed.

3. Whenever you generate \`actionSteps\`, wrap the entire JSON array in a single code block. Ensure that descriptions are concise and scripts are valid AppleScript or shell one-liners.

4. If the user's command cannot be mapped to a valid \`actionStep\`, respond with a suggestion for clarification or say: "I'm not sure how to perform that action. Could you rephrase?"

5. Always confirm the intended action before returning the final JSON if the instruction is ambiguous. For example: "Did you mean 'lock the screen' or 'sleep the display'?"

6. Address the user as "Godfather" when replying or asking follow-up questions.

7. Keep responses brief, focused on the JSON output, and avoid unnecessary explanation. Use Tailwind-friendly HTML wrappers only when presenting examples or code.

Example scenario:
User: "Godfather, mute the volume and lock the screen."
Assistant (JSON output):
[
  {
    "type": "SYSTEM",
    "description": "Mute system volume",
    "script": "set volume with output muted"
  },
  {
    "type": "SYSTEM",
    "description": "Lock the screen",
    "script": "tell application \\"System Events\\" to keystroke \\"q\\" using {control down, command down}"
  }
]

Now await the user's voice command and generate the corresponding \`actionSteps\` JSON.`;

  // Load saved prompt or use default
  function loadSystemPrompt() {
    const savedPrompt = localStorage.getItem('voicemac-system-prompt');
    return savedPrompt || defaultSystemPrompt;
  }

  // Save prompt to localStorage
  function saveSystemPrompt(prompt) {
    localStorage.setItem('voicemac-system-prompt', prompt);
  }

  // Load available models and setup model configuration
  async function loadModelConfiguration() {
    try {
      // Get available models
      const modelsResult = await window.electronAPI.getAvailableModels();
      if (modelsResult.success) {
        availableModels = modelsResult.models;
        console.log("🤖 Available models loaded:", availableModels);
      }

      // Get current model configuration
      const configResult = await window.electronAPI.getModelConfig();
      if (configResult.success) {
        currentConfig = {
          textModel: configResult.textModel,
          imageModel: configResult.imageModel
        };
        console.log("📋 Current model config:", currentConfig);
      }

      // Setup provider select handlers
      setupModelSelectors();
    } catch (error) {
      console.error("Error loading model configuration:", error);
      addLogEntry("❌ Failed to load model configuration", "error");
    }
  }

  // Setup model selector event handlers
  function setupModelSelectors() {
    // Text provider change handler
    if (textProviderSelect) {
      textProviderSelect.addEventListener("change", () => {
        updateModelOptions(textProviderSelect.value, textModelSelect, 'text');
      });
    }

    // Image provider change handler
    if (imageProviderSelect) {
      imageProviderSelect.addEventListener("change", () => {
        updateModelOptions(imageProviderSelect.value, imageModelSelect, 'image');
      });
    }

    // Text model change handler
    if (textModelSelect) {
      textModelSelect.addEventListener("change", async () => {
        const provider = textProviderSelect.value;
        const model = textModelSelect.value;
        if (provider && model) {
          try {
            await window.electronAPI.setTextModel(provider, model);
            addLogEntry(`✅ Text model set to ${provider}/${model}`, "success");
          } catch (error) {
            addLogEntry(`❌ Failed to set text model: ${error.message}`, "error");
          }
        }
      });
    }

    // Image model change handler
    if (imageModelSelect) {
      imageModelSelect.addEventListener("change", async () => {
        const provider = imageProviderSelect.value;
        const model = imageModelSelect.value;
        if (provider && model) {
          try {
            await window.electronAPI.setImageModel(provider, model);
            addLogEntry(`✅ Image model set to ${provider}/${model}`, "success");
          } catch (error) {
            addLogEntry(`❌ Failed to set image model: ${error.message}`, "error");
          }
        }
      });
    }

    // Test models button handler
    if (testModelsBtn) {
      testModelsBtn.addEventListener("click", async () => {
        await testAllModels();
      });
    }
  }

  // Update model options based on selected provider
  function updateModelOptions(provider, selectElement, modelType) {
    if (!selectElement || !availableModels[provider]) return;

    // Clear existing options
    selectElement.innerHTML = '<option value="">Select a model...</option>';

    // Add models for the selected provider
    const models = availableModels[provider][modelType] || [];
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} - ${model.description}`;
      selectElement.appendChild(option);
    });

    // Set current selection if it matches
    if (modelType === 'text' && currentConfig.textModel && 
        currentConfig.textModel.provider === provider) {
      selectElement.value = currentConfig.textModel.model;
    } else if (modelType === 'image' && currentConfig.imageModel && 
               currentConfig.imageModel.provider === provider) {
      selectElement.value = currentConfig.imageModel.model;
    }
  }

  // Set current model selections in UI
  function setCurrentModelSelections() {
    if (currentConfig.textModel) {
      if (textProviderSelect) {
        textProviderSelect.value = currentConfig.textModel.provider;
        updateModelOptions(currentConfig.textModel.provider, textModelSelect, 'text');
      }
    }

    if (currentConfig.imageModel) {
      if (imageProviderSelect) {
        imageProviderSelect.value = currentConfig.imageModel.provider;
        updateModelOptions(currentConfig.imageModel.provider, imageModelSelect, 'image');
      }
    }
  }

  // Test all models
  async function testAllModels() {
    if (!testModelsBtn || !testResults) return;

    testModelsBtn.disabled = true;
    testModelsBtn.textContent = "🧪 Testing...";
    testResults.style.display = "block";
    testResults.innerHTML = "<div style='text-align: center; padding: 20px;'>🔄 Testing models, please wait...</div>";

    try {
      const result = await window.electronAPI.testAllModels();
      
      if (result.success) {
        displayTestResults(result.results);
        addLogEntry(`🧪 Model testing complete: ${result.results.successful}/${result.results.tested} models working`, "info");
      } else {
        testResults.innerHTML = `<div style='color: #ef4444; text-align: center; padding: 20px;'>❌ Testing failed: ${result.error}</div>`;
        addLogEntry(`❌ Model testing failed: ${result.error}`, "error");
      }
    } catch (error) {
      testResults.innerHTML = `<div style='color: #ef4444; text-align: center; padding: 20px;'>❌ Testing error: ${error.message}</div>`;
      addLogEntry(`❌ Model testing error: ${error.message}`, "error");
    } finally {
      testModelsBtn.disabled = false;
      testModelsBtn.textContent = "🧪 Test All Models";
    }
  }

  // Display test results
  function displayTestResults(results) {
    if (!testResults) return;

    const summary = `
      <div style="margin-bottom: 12px; padding: 8px; background: rgba(59, 130, 246, 0.2); border-radius: 6px; text-align: center;">
        📊 Results: ${results.successful}/${results.tested} models working (${Math.round(results.successful / results.tested * 100)}% success rate)
      </div>
    `;

    const items = results.details.map(detail => {
      const statusClass = detail.status === 'success' ? 'success' : 'failed';
      const statusText = detail.status === 'success' ? '✅ Working' : '❌ Failed';
      
      return `
        <div class="test-result-item">
          <span class="test-result-model">${detail.provider}/${detail.model.split('-').slice(0, 3).join('-')}</span>
          <span class="test-result-status ${statusClass}">${statusText}</span>
        </div>
      `;
    }).join('');

    testResults.innerHTML = summary + items;
  }

  // Open settings modal
  settingsBtn.addEventListener("click", async () => {
    try {
      // Load system prompt
      const result = await window.electronAPI.getSystemPrompt();
      if (result.success) {
        systemPromptTextarea.value = result.prompt;
      } else {
        // Fallback to localStorage
        systemPromptTextarea.value = loadSystemPrompt();
      }

      // Load model configuration
      await loadModelConfiguration();
      setCurrentModelSelections();
    } catch (error) {
      console.error("Error loading settings:", error);
      // Fallback to localStorage for system prompt
      systemPromptTextarea.value = loadSystemPrompt();
      addLogEntry("⚠️ Some settings failed to load", "warning");
    }
    
    settingsModal.classList.add("active");
    addLogEntry("⚙️ Settings opened");
  });

  // Close modal
  function closeModal() {
    settingsModal.classList.remove("active");
  }

  closeModalBtn.addEventListener("click", closeModal);
  cancelSettingsBtn.addEventListener("click", closeModal);

  // Close modal when clicking outside
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      closeModal();
    }
  });

  // Reset to default prompt
  resetPromptBtn.addEventListener("click", () => {
    systemPromptTextarea.value = defaultSystemPrompt;
    addLogEntry("🔄 System prompt reset to default");
  });

  // Save settings
  saveSettingsBtn.addEventListener("click", async () => {
    const newPrompt = systemPromptTextarea.value.trim();
    
    if (!newPrompt) {
      addLogEntry("❌ System prompt cannot be empty", "error");
      return;
    }

    try {
      // Save the prompt
      saveSystemPrompt(newPrompt);
      
      // Notify the main process about the updated prompt
      await window.electronAPI.updateSystemPrompt(newPrompt);
      
      addLogEntry("✅ System prompt saved successfully!", "success");
      closeModal();
    } catch (error) {
      console.error("Error saving system prompt:", error);
      addLogEntry(`❌ Failed to save settings: ${error.message}`, "error");
    }
  });

  // Keyboard shortcuts for modal
  document.addEventListener("keydown", (e) => {
    if (settingsModal.classList.contains("active")) {
      if (e.key === "Escape") {
        closeModal();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveSettingsBtn.click();
      }
    }
  });

  // Add microphone test functionality
  const micTestBtn = document.getElementById("mic-test");
  if (micTestBtn) {
    micTestBtn.addEventListener("click", async () => {
      addLogEntry("🎤 Testing microphone...");
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
          }
        });
        
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        });
        
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        
        source.connect(processor);
        processor.connect(audioCtx.destination);
        
        let maxLevel = 0;
        let sampleCount = 0;
        
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const level = Math.max(...inputData.map(Math.abs));
          maxLevel = Math.max(maxLevel, level);
          sampleCount++;
          
          if (sampleCount >= 10) { // After ~2 seconds at 4096 buffer
            addLogEntry(`🎤 Microphone test result: Max level ${(maxLevel * 100).toFixed(1)}%`);
            if (maxLevel > 0.01) {
              addLogEntry("✅ Microphone is working!", "success");
            } else {
              addLogEntry("⚠️ Microphone seems quiet - speak louder or check settings", "warning");
            }
            
            // Clean up
            processor.disconnect();
            source.disconnect();
            stream.getTracks().forEach(track => track.stop());
            audioCtx.close();
          }
        };
        
      } catch (error) {
        addLogEntry(`❌ Microphone test failed: ${error.message}`, "error");
      }
    });
  }

  // Start recording function
  async function startRecording() {
    try {
      console.log("🎤 Starting recording...");
      addLogEntry("Starting audio capture...");

      if (!audioContext || audioContext.state === 'closed') {
        console.log("🔧 Initializing audio system...");
        const audioInitialized = await initializeAudio();
        if (!audioInitialized) {
          addLogEntry("❌ Failed to initialize audio system", "error");
          return;
        }
      }

      // Check if audio context is suspended and resume it
      if (audioContext.state === 'suspended') {
        console.log("🔄 Resuming audio context...");
        await audioContext.resume();
      }

      // Verify audio track is active
      if (audioStream) {
        const audioTrack = audioStream.getAudioTracks()[0];
        if (!audioTrack || !audioTrack.enabled) {
          console.log("⚠️ Audio track is not enabled, reinitializing...");
          const audioInitialized = await initializeAudio();
          if (!audioInitialized) {
            addLogEntry("❌ Failed to reinitialize audio", "error");
            return;
          }
        }
      }

      console.log("🎤 Starting Deepgram connection...");
      const success = await window.electronAPI.startDeepgram();
      
      if (success) {
        isRecording = true;
        isProcessingCommand = false;
        updateButtonStates();
        updateRecordingStatus("Recording");
        addLogEntry("✅ Recording started successfully", "success");
        
        // Start audio level monitoring
        startAudioLevelMonitoring();
      } else {
        addLogEntry("❌ Failed to start recording", "error");
        console.error("Failed to start Deepgram connection");
      }
    } catch (error) {
      console.error("Error starting recording:", error);
      addLogEntry(`❌ Recording error: ${error.message}`, "error");
    }
  }

  // Initialize audio context and stream
  async function initializeAudio() {
    try {
      console.log("🎤 Requesting microphone access...");
      
      // First check if we already have permission
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      console.log("Microphone permission status:", permissionStatus.state);
      
      if (permissionStatus.state === 'denied') {
        addLogEntry("❌ Microphone access denied. Please allow microphone access in your browser settings.", "error");
        return false;
      }

      // Request microphone access with specific constraints
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false
      });

      // Log audio track settings
      const audioTrack = audioStream.getAudioTracks()[0];
      console.log("Audio track settings:", audioTrack.getSettings());
      console.log("Audio track enabled:", audioTrack.enabled);
      console.log("Audio track muted:", audioTrack.muted);
      console.log("Audio track readyState:", audioTrack.readyState);
      
      // Create audio context with specific sample rate
      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
        latencyHint: 'interactive'
      });

      console.log("Audio context created:", {
        state: audioContext.state,
        sampleRate: audioContext.sampleRate,
        baseLatency: audioContext.baseLatency
      });

      // Create and connect nodes
      const source = audioContext.createMediaStreamSource(audioStream);
      audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(audioProcessor);
      audioProcessor.connect(audioContext.destination);
      audioProcessor.onaudioprocess = handleAudioProcess;

      addLogEntry("✅ Audio system initialized", "success");
      return true;

    } catch (error) {
      console.error("Audio initialization error:", error);
      
      if (error.name === 'NotAllowedError') {
        addLogEntry("❌ Microphone access denied. Please allow microphone access in your browser settings.", "error");
      } else if (error.name === 'NotFoundError') {
        addLogEntry("❌ No microphone found. Please connect a microphone and try again.", "error");
      } else {
        addLogEntry(`❌ Audio initialization error: ${error.message}`, "error");
      }
      
      return false;
    }
  }

  // Handle audio processing
  function handleAudioProcess(e) {
    if (!isRecording) return;

    try {
      const inputData = e.inputBuffer.getChannelData(0);
      const audioLevel = Math.max(...inputData.map(Math.abs));
      
      // Debug audio levels
      if (audioLevel > 0.01) {
        console.log(`🎤 Audio detected - Level: ${audioLevel.toFixed(4)}`);
      }

      // Convert to 16-bit PCM
      const int16Data = new Int16Array(inputData.length);
      let hasSound = false;
      
      for (let i = 0; i < inputData.length; i++) {
        // Scale and clamp the float32 audio data to int16 range
        const sample = Math.max(-32768, Math.min(32767, Math.round(inputData[i] * 32767)));
        int16Data[i] = sample;
        if (Math.abs(sample) > 250) { // Check if we have meaningful audio
          hasSound = true;
        }
      }

      // Only send if we have actual audio or every 500ms as keepalive
      const now = Date.now();
      if (hasSound || now - lastAudioSentTime > 500) {
        window.electronAPI.sendAudio(int16Data.buffer);
        lastAudioSentTime = now;
        
        if (hasSound) {
          console.log(`📢 Sending audio data - Level: ${audioLevel.toFixed(4)}`);
        }
      }

      // Update visual feedback
      updateAudioLevel(audioLevel);
      
    } catch (error) {
      console.error("Error processing audio:", error);
      addLogEntry(`❌ Audio processing error: ${error.message}`, "error");
    }
  }

  // Monitor audio levels
  function startAudioLevelMonitoring() {
    if (!audioContext || !audioStream) return;
    
    const audioTrack = audioStream.getAudioTracks()[0];
    if (audioTrack) {
      console.log("Audio track state:", {
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        readyState: audioTrack.readyState
      });
    }
  }

  // Update audio level indicator
  function updateAudioLevel(level) {
    const indicator = document.querySelector('.audio-level-indicator');
    if (indicator) {
      const height = Math.min(100, level * 200); // Scale level to percentage
      indicator.style.height = `${height}%`;
      indicator.style.backgroundColor = level > 0.01 ? '#22c55e' : '#64748b';
    }
  }

  // Add audio level indicator to DOM
  function addAudioLevelIndicator() {
    const container = document.createElement('div');
    container.className = 'audio-level-container';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 10px;
      height: 100px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 5px;
      overflow: hidden;
    `;

    const indicator = document.createElement('div');
    indicator.className = 'audio-level-indicator';
    indicator.style.cssText = `
      position: absolute;
      bottom: 0;
      width: 100%;
      height: 0%;
      background: #64748b;
      transition: all 0.1s ease;
    `;

    container.appendChild(indicator);
    document.body.appendChild(container);
  }

  // Call this when the page loads
  addAudioLevelIndicator();

  // Update transcription UI with status
  function updateTranscriptionStatus(status) {
    const transcriptEl = document.getElementById("transcript");
    
    switch(status) {
      case 'processing':
        transcriptEl.textContent = "🔄 Processing command...";
        addLogEntry(`🔄 Status: Processing command`);
        break;
      case 'success':
        transcriptEl.textContent = "✅ Command executed successfully!";
        addLogEntry(`✅ Status: Command executed successfully`);
        break;
      case 'error':
        transcriptEl.textContent = "❌ Command execution failed";
        addLogEntry(`❌ Status: Command execution failed`);
        break;
      case 'ready':
        transcriptEl.textContent = "🎤 Ready for your command...";
        addLogEntry(`🎤 Status: Ready for next command`);
        break;
      default:
        transcriptEl.textContent = "Waiting for voice input...";
    }
  }

  // New function to process complete commands after silence
  async function handleCompleteCommand() {
    try {
      if (!currentTranscript.trim()) {
        console.log("HandleCompleteCommand: No transcript");
        return;
      }

      // Check if a command is already being processed
      if (isProcessingCommand) {
        console.log("🔄 INTERRUPTING CURRENT COMMAND - New command received");
        addLogEntry(`🔄 Interrupting current command with: "${currentTranscript}"`);
        
        // Cancel the current task
        try {
          await window.electronAPI.stopTask();
          addLogEntry("🛑 Current task cancelled");
        } catch (error) {
          console.error("Error stopping current task:", error);
        }
        
        // Reset processing state
        isProcessingCommand = false;
        startBtn.textContent = "⏹️ Stop Listening";
        startBtn.disabled = false;
      }

      isProcessingCommand = true;
      console.log("🔄 PROCESSING COMPLETE COMMAND AFTER SILENCE");
      addLogEntry(`🔄 Processing command: "${currentTranscript}"`);
      
      // Notify overlay about processing
      window.electronAPI.onCommandProcessing(currentTranscript);
      
      // Show processing status
      updateTranscriptionStatus('processing');

      // Don't stop recording - keep listening for interruptions
      startBtn.textContent = "Processing...";
      startBtn.disabled = true;

      // Execute the complete command
      const commandToExecute = currentTranscript.trim();
      addLogEntry(`🤖 Executing: "${commandToExecute}"`);
      
      const result = await executeCommand(commandToExecute);
      
      console.log("📊 Execution result:", result.success ? "SUCCESS" : "FAILED");
      
      // Notify overlay about result
      if (result.success) {
        window.electronAPI.onCommandSuccess(commandToExecute);
      } else {
        window.electronAPI.onCommandError(commandToExecute, result.error);
      }
      
      // Show result status
      if (result.success) {
        updateTranscriptionStatus('success');
        setTimeout(() => {
          updateTranscriptionStatus('ready');
        }, 2000);
      } else {
        updateTranscriptionStatus('error');
        setTimeout(() => {
          updateTranscriptionStatus('ready');
        }, 3000);
      }

      // Clear the current transcript for next command
      currentTranscript = "";
      
      // Keep transcript for continuous chat; no clearing here

      // Re-enable the start button and continue listening
      setTimeout(() => {
        startBtn.textContent = "⏹️ Stop Listening";
        startBtn.disabled = false;
        isProcessingCommand = false;
        addLogEntry("✅ Ready for next command (or say something to interrupt)");
      }, 1000);
      
    } catch (error) {
      console.error("Error in complete command processing:", error);
      addLogEntry(`❌ Processing error: ${error.message}`, "error");
      
      // Notify overlay about error
      window.electronAPI.onCommandError(currentTranscript, error.message);
      
      updateTranscriptionStatus('error');
      isProcessingCommand = false;
      startBtn.textContent = "🎤 Start Listening";
      startBtn.disabled = false;
    }
  }

  // Handle silence detection and automatic command processing
  async function handleSilence() {
    try {
      if (!isRecording || !currentTranscript.trim() || isProcessingCommand) {
        console.log("HandleSilence: Conditions not met", {
          isRecording,
          hasTranscript: !!currentTranscript.trim(),
          isProcessingCommand
        });
        return;
      }

      isProcessingCommand = true;
      console.log("🔄 STARTING COMMAND PROCESSING");
      addLogEntry("🔄 Auto-processing voice command...");
      
      // Show processing status immediately
      updateTranscriptionStatus('processing');

      // Stop recording temporarily
      await window.electronAPI.stopDeepgram();
      isRecording = false;
      startBtn.textContent = "Processing...";
      startBtn.disabled = true;

      // Execute the command automatically
      const commandToExecute = currentTranscript.trim();
      console.log("🎯 Executing command:", commandToExecute);
      addLogEntry(`🎯 Executing: "${commandToExecute}"`);
      
      // Add a small delay to ensure UI updates
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = await executeCommand(commandToExecute);
      
      console.log("📊 Execution result:", result.success ? "SUCCESS" : "FAILED");
      
      // Show result status
      if (result.success) {
        updateTranscriptionStatus('success');
        setTimeout(() => {
          updateTranscriptionStatus('ready');
        }, 3000);
      } else {
        updateTranscriptionStatus('error');
        setTimeout(() => {
          updateTranscriptionStatus('ready');
        }, 4000);
      }

      // Clear the current transcript for next command
      currentTranscript = "";

      // Automatically start listening again after showing result
      console.log("🔄 Restarting recording for next command");
      addLogEntry("🔄 Restarting recording...");
      setTimeout(async () => {
        try {
          const success = await window.electronAPI.startDeepgram();
          if (success) {
            isRecording = true;
            isProcessingCommand = false;
            startBtn.textContent = "⏹️ Stop Listening";
            startBtn.disabled = false;
            addLogEntry("✅ Ready for next command!");
          } else {
            addLogEntry("❌ Failed to restart recording", "error");
            updateTranscriptionStatus('error');
            isProcessingCommand = false;
          }
        } catch (error) {
          console.error("Error restarting recording:", error);
          addLogEntry(`❌ Restart error: ${error.message}`, "error");
          isProcessingCommand = false;
        }
      }, 3000); // Show result for 3 seconds before restarting
    } catch (error) {
      console.error("Error handling silence:", error);
      addLogEntry(`❌ Error: ${error.message}`, "error");
      updateTranscriptionStatus('error');
      isProcessingCommand = false;
      startBtn.disabled = false;
      // Try to restart recording even after error
      setTimeout(() => {
        startRecording();
      }, 2000);
    }
  }

  // Set up environment variables
  window.electronAPI.onInitEnv((event, env) => {
    if (!env.DEEPGRAM_API_KEY) {
      addLogEntry("⚠️ Warning: Deepgram API key not set", "warning");
    }
    if (!env.ANTHROPIC_API_KEY) {
      addLogEntry("⚠️ Warning: Anthropic API key not set", "warning");
    }
  });

  // Handle Deepgram events
  window.electronAPI.onDeepgramReady(() => {
    updateConnectionStatus("connected");
    addLogEntry("🎤 Voice recognition ready", "success");
  });

  window.electronAPI.onDeepgramClosed((event, data) => {
    updateConnectionStatus("disconnected");
    const { code, reason } = data;
    if (code === 1000 || code === 1001) {
      addLogEntry("🔌 Voice connection closed normally");
    } else {
      addLogEntry(`⚠️ Voice connection lost: ${reason} (code: ${code})`, "warning");
    }
  });

  window.electronAPI.onDeepgramError((event, errorMessage) => {
    updateConnectionStatus("error");
    if (errorMessage.includes("Rate limited")) {
      addLogEntry("⚠️ Voice service rate limited - retrying with delay", "warning");
    } else {
      addLogEntry(`❌ Voice recognition error: ${errorMessage}`, "error");
    }
  });

  window.electronAPI.onDeepgramReconnected(() => {
    updateConnectionStatus("connected");
    addLogEntry("🔄 Voice recognition reconnected", "success");
  });

  window.electronAPI.onDeepgramTranscript((event, data) => {
    try {
      console.log("Received Deepgram data:", data);
      
      if (data.channel && data.channel.alternatives && data.channel.alternatives.length > 0) {
        const transcript = data.channel.alternatives[0].transcript;
        
        console.log("Transcript:", transcript, "Is final:", data.is_final);
        
        if (transcript && transcript.trim()) {
          const transcriptEl = document.getElementById("transcript");
          
          if (data.is_final) {
            // Check if this is an interruption during command processing
            if (isProcessingCommand && currentTranscript.trim()) {
              console.log("🔄 COMMAND INTERRUPTION DETECTED");
              addLogEntry(`🔄 Interrupting with new command: "${transcript}"`);
              
              // Replace current transcript with new one
              currentTranscript = transcript.trim();
              transcriptEl.textContent = `⚡ Interrupting: ${currentTranscript}`;
            } else {
              // Normal case - append to current transcript
              if (currentTranscript.trim()) {
                currentTranscript += " " + transcript.trim();
              } else {
                currentTranscript = transcript.trim();
              }
              transcriptEl.textContent = currentTranscript;
              addLogEntry(`🎤 Added: "${transcript}" (Total: "${currentTranscript}")`);
            }
            
            console.log("📝 Final transcript added:", transcript);
            console.log("📝 Full command so far:", currentTranscript);
            
            // Reset silence timer - start/restart the silence detection
            if (silenceTimer) {
              clearTimeout(silenceTimer);
            }
            
            // Wait for silence before processing (shorter for interruptions)
            const silenceDelay = isProcessingCommand ? 1500 : 3000; // 1.5s for interruptions, 3s for normal
            silenceTimer = setTimeout(() => {
              handleCompleteCommand();
            }, silenceDelay);
            
          } else {
            // Show interim results
            let displayText;
            if (isProcessingCommand) {
              displayText = `⚡ Interrupting: ${transcript}`;
            } else {
              displayText = currentTranscript + (currentTranscript ? " " : "") + transcript;
            }
            transcriptEl.textContent = displayText;
            console.log("Interim transcript:", transcript);
            console.log("Full interim text:", displayText);
          }
        }
      } else {
        console.log("No alternatives in Deepgram response");
      }
    } catch (error) {
      console.error("Error processing transcript:", error);
      addLogEntry(`❌ Transcript error: ${error.message}`, "error");
    }
  });

  // Connection status update function
  function updateConnectionStatus(status) {
    const statusElement = document.getElementById("connection-status");
    if (statusElement) {
      statusElement.className = `status ${status}`;
      switch (status) {
        case "connected":
          statusElement.textContent = "🟢 Connected";
          statusElement.title = "Voice recognition is active and ready";
          break;
        case "disconnected":
          statusElement.textContent = "🔴 Disconnected";
          statusElement.title = "Voice recognition is disconnected";
          break;
        case "reconnecting":
          statusElement.textContent = "🟡 Reconnecting...";
          statusElement.title = "Attempting to reconnect voice recognition";
          break;
        case "error":
          statusElement.textContent = "🔴 Error";
          statusElement.title = "Voice recognition error - check connection";
          break;
        default:
          statusElement.textContent = "🔄 Unknown";
          statusElement.title = "Voice recognition status unknown";
      }
    }
  }

  // Process command manually (backup option)
  async function processCommand() {
    if (!currentTranscript.trim()) {
      addLogEntry("⚠️ No transcript to process", "warning");
      console.log("❌ No current transcript available");
      console.log("Current transcript value:", currentTranscript);
      return;
    }

    try {
      console.log("🎯 Manual processing triggered");
      addLogEntry(`🎯 Manually processing: "${currentTranscript}"`);
      
      // Temporarily stop recording to avoid conflicts
      if (isRecording) {
        await window.electronAPI.stopDeepgram();
        isRecording = false;
        startBtn.textContent = "⏹️ Stop Listening";
      }
      
      const result = await executeCommand(currentTranscript);
      
      if (result.success) {
        updateTranscriptionStatus('success');
      } else {
        updateTranscriptionStatus('error');
      }
      
      currentTranscript = "";

      // Don't automatically restart recording - user can manually restart if needed
      console.log("Command processed - manual restart required if needed");
      
    } catch (error) {
      console.error("Error processing command:", error);
      addLogEntry(`❌ Error: ${error.message}`, "error");
    }
  }

  // Stop recording function
  async function stopRecording() {
    try {
      isRecording = false;
      isProcessingCommand = false;
      updateButtonStates();
      updateRecordingStatus("Stopped");
      updateRecordingIndicator("ready");

      // Clear any pending timers
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      if (commandSilenceTimer) {
        clearTimeout(commandSilenceTimer);
        commandSilenceTimer = null;
      }
      
      // Clear heartbeat interval
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }

      await window.electronAPI.stopDeepgram();

      if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
      }
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
        audioStream = null;
      }
      if (audioContext) {
        await audioContext.close();
        audioContext = null;
      }

      addLogEntry("🛑 Continuous recording stopped", "info");
    } catch (error) {
      console.error("Error stopping recording:", error);
      addLogEntry(`❌ Error stopping recording: ${error.message}`, "error");
    }
  }

  // Helper function to add log entries
  function addLogEntry(message, type = "") {
    if (!logContainer) return;
    
    const entry = document.createElement("div");
    entry.className = `log-entry${type ? " " + type : ""}`;
    
    // Create time element
    const timeElement = document.createElement("div");
    timeElement.className = "log-time";
    timeElement.textContent = new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Create message element
    const messageElement = document.createElement("div");
    messageElement.className = "log-message";
    messageElement.textContent = message;
    
    entry.appendChild(timeElement);
    entry.appendChild(messageElement);
    
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // Execute command function with dynamic task execution
  async function executeCommand(text) {
    try {
      addLogEntry(`🚀 Processing command: "${text}"`);

      // Check for stop/cancel commands first
      if (isStopCommand(text)) {
        return await handleStopCommand(text);
      }

      // Check for web-specific tasks first
      if (isWebTask(text)) {
        return await executeWebTask(text);
      }

      // Use the new dynamic task execution system
      addLogEntry("🤖 Analyzing task and breaking into steps...");
      const result = await window.electronAPI.executeDynamicTask(text);
      
      console.log("Dynamic Task Result:", result);

      if (!result.success) {
        addLogEntry(`❌ Task Error: ${result.error}`, "error");
        return result;
      }

      addLogEntry(`✅ Task completed successfully!`, "success");
      return result;
    } catch (error) {
      console.error("Task execution error:", error);
      addLogEntry(`❌ Execution error: ${error.message}`, "error");
      return { success: false, error: error.message };
    }
  }

  // Check if this is a stop/cancel command
  function isStopCommand(text) {
    const stopKeywords = [
      'stop', 'cancel', 'abort', 'halt', 'quit task', 'stop task', 
      'cancel task', 'stop it', 'cancel it', 'abort task', 'end task'
    ];
    
    const lowerText = text.toLowerCase().trim();
    return stopKeywords.some(keyword => 
      lowerText === keyword || 
      lowerText.startsWith(keyword + ' ') ||
      lowerText.endsWith(' ' + keyword) ||
      lowerText.includes(' ' + keyword + ' ')
    );
  }

  // Handle stop/cancel commands
  async function handleStopCommand(text) {
    try {
      addLogEntry(`🛑 Stop command received. Stopping all tasks...`);
      
      // Stop any ongoing task execution
      const stopResult = await window.electronAPI.stopTask();
      
      if (stopResult.success) {
        addLogEntry("✅ All tasks stopped successfully");
        
        // Notify overlay about cancellation
        window.electronAPI.onCommandSuccess(text);
        
        // Reset UI state
        const transcriptEl = document.getElementById("transcript");
        transcriptEl.textContent = "🎤 Ready for your next command...";
        
        return { success: true, message: "Task cancelled" };
      } else {
        addLogEntry("❌ Failed to stop tasks", "error");
        return { success: false, error: "Failed to stop tasks" };
      }
      
    } catch (error) {
      console.error("Error handling stop command:", error);
      addLogEntry(`❌ Error stopping tasks: ${error.message}`, "error");
      return { success: false, error: error.message };
    }
  }

  // Check if this is a web-related task
  function isWebTask(text) {
    const webKeywords = [
      'youtube', 'google', 'search', 'browse', 'website', 'web',
      'play music', 'play songs', 'watch video', 'open website'
    ];
    
    return webKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
  }

  // Execute web-specific tasks with predefined steps
  async function executeWebTask(text) {
    try {
      const lowerText = text.toLowerCase();
      
      let taskType = null;
      let params = {};

      // Determine task type and extract parameters
      if (lowerText.includes('youtube') || lowerText.includes('play')) {
        taskType = 'youtube_search';
        // Extract search query
        const match = text.match(/(?:play|youtube|search for)\s+(.+?)(?:\s+on youtube|$)/i);
        params.query = match ? match[1] : text.replace(/(?:play|youtube|search for|on youtube)/gi, '').trim();
      } else if (lowerText.includes('google') && lowerText.includes('search')) {
        taskType = 'google_search';
        const match = text.match(/(?:google|search)\s+(?:for\s+)?(.+)/i);
        params.query = match ? match[1] : text.replace(/(?:google|search|for)/gi, '').trim();
      } else if (lowerText.includes('go to') || lowerText.includes('open website')) {
        taskType = 'navigate_url';
        const match = text.match(/(?:go to|open website|navigate to)\s+(.+)/i);
        params.url = match ? match[1] : text;
      }

      if (taskType) {
        addLogEntry(`🌐 Executing web task: ${taskType} with ${JSON.stringify(params)}`);
        const result = await window.electronAPI.executeWebTask(taskType, params);
        
        if (!result.success) {
          addLogEntry(`❌ Web task failed: ${result.error}`, "error");
          return result;
        }

        addLogEntry(`✅ Web task completed successfully!`, "success");
        return result;
      }
    } catch (error) {
      console.error("Web task execution error:", error);
      addLogEntry(`❌ Web task error: ${error.message}`, "error");
      return { success: false, error: error.message };
    }

    // Fallback to regular dynamic task execution
    return { success: false, error: "No valid web task found" };
  }

  // Update wave animation with actual audio level
  function updateWaveAnimation(isRecording, audioLevel = 0) {
    const audioWaves = document.getElementById("audioWaves");
    if (!audioWaves) return;

    // Skip animation updates if window is not visible (save resources)
    if (document.hidden) return;

    if (!isRecording) {
      audioWaves.querySelectorAll(".wave-bar").forEach((bar) => {
        bar.style.height = "2px";
      });
      return;
    }

    // Scale the audio level to a reasonable range for visualization
    const maxHeight = 30;
    const scaledLevel = Math.min(audioLevel * 200, 1) * maxHeight;

    // Show actual audio activity in the console occasionally
    const now = Date.now();
    if (now - lastLogTime > 5000) { // Log every 5 seconds
      console.log(`🎵 Audio level: ${audioLevel.toFixed(4)}, scaled: ${scaledLevel.toFixed(1)}px`);
      lastLogTime = now;
      addLogEntry(`🎵 Audio activity: ${(audioLevel * 100).toFixed(1)}%`);
    }

    audioWaves.querySelectorAll(".wave-bar").forEach((bar) => {
      // Add some randomness but keep it proportional to the actual audio level
      const randomFactor = 0.7 + Math.random() * 0.6;
      const height = Math.max(2, scaledLevel * randomFactor);
      bar.style.height = `${height}px`;
    });
  }

  // Event listeners
  startBtn.addEventListener("click", () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  stopBtn.addEventListener("click", stopRecording);

  // Handle visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log("🌙 App moved to background - voice commands still active");
      addLogEntry("🌙 Running in background - voice commands active");
      
      // Stop visual animations to save resources
      if (isRecording && !isProcessingCommand) {
        updateWaveAnimation(false);
      }
    } else {
      console.log("🌞 App returned to foreground");
      addLogEntry("🌞 App back in focus - full operation resumed");
      
      // Resume visual animations
      if (isRecording && !isProcessingCommand) {
        // Restart wave animation
        setInterval(() => {
          if (isRecording && !isProcessingCommand && !document.hidden) {
            updateWaveAnimation(true, Math.random() * 0.1);
          }
        }, 100);
      }
    }
  });

  // Handle window focus/blur
  window.addEventListener('focus', () => {
    console.log("🎯 Window focused");
    addLogEntry("🎯 Window active");
  });

  window.addEventListener('blur', () => {
    console.log("😴 Window blurred - continuing background operation");
    addLogEntry("😴 Window minimized - voice commands still active");
  });

  // Prevent the page from pausing when hidden
  let backgroundKeepAlive;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Keep the app active in background
      backgroundKeepAlive = setInterval(() => {
        // Small task to prevent suspension
        console.log("Background heartbeat:", new Date().toLocaleTimeString());
      }, 30000); // Every 30 seconds
    } else {
      if (backgroundKeepAlive) {
        clearInterval(backgroundKeepAlive);
        backgroundKeepAlive = null;
      }
    }
  });

  // Clean up when window is closed
  window.addEventListener("beforeunload", () => {
    if (backgroundKeepAlive) {
      clearInterval(backgroundKeepAlive);
    }
    stopRecording();
  });

  // Initialize
  addLogEntry("🔥 Voice Command Runner initialized - ready for continuous voice commands!");
  addLogEntry("💡 Tip: Speak naturally with pauses - commands process after 3 seconds of silence");
  addLogEntry("🌙 Background Mode: App continues listening when minimized or in background");

  // Automatically start voice recognition when the app loads
  setTimeout(async () => {
    addLogEntry("🚀 Auto-starting voice recognition...");
    await startRecording();
  }, 1000); // Small delay to ensure everything is loaded

  // Event listeners for task orchestrator
  window.electronAPI.onTaskStepComplete((event, data) => {
    const { stepNumber, totalSteps, description } = data;
    addLogEntry(`📋 Step ${stepNumber}/${totalSteps}: ${description}`);
  });

  window.electronAPI.onTaskComplete((event, data) => {
    const { success, message } = data;
    if (success) {
      addLogEntry(`✅ Task finished: ${message}`, "success");
    } else {
      addLogEntry(`❌ Task failed: ${message}`, "error");
    }
  });

  window.electronAPI.onTaskError((event, data) => {
    const { error, stepNumber, totalSteps } = data;
    addLogEntry(`⚠️ Error at step ${stepNumber}/${totalSteps}: ${error}`, "error");
  });

  // Enhanced visual guidance event listeners
  window.electronAPI.onVisualGuidanceStart((event, data) => {
    const { stepDescription } = data;
    addLogEntry(`🔍 Taking screenshot for: ${stepDescription}`);
  });

  window.electronAPI.onVisualGuidanceScreenshot((event, data) => {
    const { screenshotPath } = data;
    addLogEntry(`📷 Screenshot captured and analyzing...`);
  });

  window.electronAPI.onVisualGuidanceAction((event, data) => {
    const { action, confidence } = data;
    addLogEntry(`🎯 AI suggested: ${action} (confidence: ${confidence})`);
  });

  window.electronAPI.onVisualGuidanceComplete((event, data) => {
    const { success, action, error } = data;
    if (success) {
      addLogEntry(`✅ Visual guidance succeeded: ${action}`, "success");
    } else {
      addLogEntry(`❌ Visual guidance failed: ${error}`, "error");
    }
  });

  // New event listeners for screenshot analysis fallback
  window.electronAPI.onScreenshotAnalysisStart((event, data) => {
    const { failedStep } = data;
    addLogEntry(`📷 AppleScript failed - taking screenshot to analyze what went wrong...`);
  });

  // Listen for screenshot capture events
  window.electronAPI.onScreenshotCapture((event, data) => {
    const { status, data: captureData } = data;
    
    if (status === 'started') {
      addLogEntry(`📷 Capturing screenshot...`);
    } else if (status === 'success') {
      addLogEntry(`✅ Screenshot captured: ${captureData.path}`);
    } else {
      addLogEntry(`❌ Screenshot failed: ${captureData.error}`, "error");
    }
  });

  // Listen for Claude analysis events
  window.electronAPI.onClaudeAnalysis((event, data) => {
    const { status, data: analysisData } = data;
    
    if (status === 'started') {
      addLogEntry(`🤖 Analyzing screenshot with AI...`);
    } else if (status === 'success') {
      addLogEntry(`✅ AI analysis complete: ${analysisData.result}`);
    } else {
      addLogEntry(`❌ AI analysis failed: ${analysisData.error}`, "error");
    }
  });

  // Listen for cloud upload events
  window.electronAPI.onCloudUpload((event, data) => {
    const { status, data: uploadData } = data;
    
    if (status === 'started') {
      addLogEntry(`☁️ Uploading for analysis...`);
    } else if (status === 'success') {
      addLogEntry(`✅ Uploaded successfully: ${uploadData.url}`);
    } else {
      addLogEntry(`❌ Upload failed: ${uploadData.error}`, "error");
    }
  });

  window.electronAPI.onScreenshotAnalysisComplete((event, data) => {
    const { success, suggestedAction, failureReason } = data;
    if (success && suggestedAction) {
      addLogEntry(`🧠 AI Suggestion: "${suggestedAction}"`, "info");
    } else if (!success) {
      addLogEntry(`🤔 AI could not determine a fix. Reason: ${failureReason}`, "warning");
    }
  });

  window.electronAPI.onVisualFallbackSuccess((event, data) => {
    const { action } = data;
    addLogEntry(`🎯 Visual fallback succeeded: ${action}`, "success");
  });

  window.electronAPI.onVisualFallbackFailed((event, data) => {
    const { error } = data;
    addLogEntry(`❌ Visual fallback also failed: ${error}`, "error");
  });

  // Function to simulate voice commands for testing
  window.executeVoiceCommand = async (command) => {
    console.log(`🎤 Simulating voice command: "${command}"`);
    
    try {
      // Stop any existing recording
      await stopRecording();
      
      // Simulate the transcript event
      const simulatedResponse = {
        channel: {
          alternatives: [
            {
              transcript: command,
              confidence: 0.98
            }
          ]
        },
        is_final: true
      };
      
      // Process the simulated transcript
      processTranscript(simulatedResponse);
      
      // Wait for command processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } catch (error) {
      console.error('Error executing simulated voice command:', error);
      return false;
    }
  };

  // Keyboard shortcuts
  document.addEventListener('keydown', async (event) => {
    // Check if Command (Mac) or Control (Windows/Linux) is pressed
    const isCmdOrCtrl = event.metaKey || event.ctrlKey;
    
    if (isCmdOrCtrl) {
      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault();
          if (isRecording) {
            await stopRecording();
          } else {
            await startRecording();
          }
          break;
        
        case 'y':
          event.preventDefault();
          const testYoutubeBtn = document.getElementById('testYoutubeBtn');
          if (testYoutubeBtn) {
            testYoutubeBtn.click();
          }
          break;
        
        case 'm':
          event.preventDefault();
          const testMicrophoneBtn = document.getElementById('testMicrophoneBtn');
          if (testMicrophoneBtn) {
            testMicrophoneBtn.click();
          }
          break;
        
        case 't':
          event.preventDefault();
          const runTestBtn = document.getElementById('runTestBtn');
          if (runTestBtn) {
            runTestBtn.click();
          }
          break;
        
        case 'l':
          event.preventDefault();
          const clearLogBtn = document.getElementById('clearLogBtn');
          if (clearLogBtn) {
            clearLogBtn.click();
          }
          break;
        
        case 'h':
          event.preventDefault();
          const helpBtn = document.getElementById('helpBtn');
          if (helpBtn) {
            helpBtn.click();
          }
          break;
        
        case ',':
          event.preventDefault();
          const settingsBtn = document.getElementById('settingsBtn');
          if (settingsBtn) {
            settingsBtn.click();
          }
          break;
      }
    }
  });
});
