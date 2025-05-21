// Example renderer.js implementation for the refactored system
const { ipcRenderer } = require("electron");

// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // DOM elements
  const transcriptEl = document.getElementById("currentTranscription");
  const startBtn = document.getElementById("startBtn");
  const processBtn = document.getElementById("processBtn");
  const textInput = document.getElementById("textInput");
  const executionLog = document.getElementById("executionLog");
  const micVisualization = document.getElementById("micVisualization");
  const recordingStatus = document.getElementById("recordingStatus");

  let isRecording = false;
  let finalTranscript = "";
  let audioContext = null;
  let audioStream = null;
  let silenceTimer = null;
  let lastAudioTime = Date.now();
  let silenceStart = null;
  const SILENCE_THRESHOLD = 0.01;
  const SILENCE_DURATION = 2000;
  let lastLogTime = 0;
  let audioProcessor = null;

  // Initialize audio context
  async function initializeAudio() {
    try {
      addLogEntry("Initializing audio...");

      // Request microphone permission with specific constraints
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      addLogEntry("Microphone access granted");

      // Create audio context with specific sample rate
      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });

      // Create media stream source
      const source = audioContext.createMediaStreamSource(audioStream);

      // Create script processor for raw audio data
      audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

      // Connect nodes
      source.connect(audioProcessor);
      audioProcessor.connect(audioContext.destination);

      // Handle audio processing
      audioProcessor.onaudioprocess = handleAudioProcess;

      addLogEntry("Audio system initialized successfully");
      return true;
    } catch (error) {
      console.error("Error initializing audio:", error);
      addLogEntry(`Error initializing audio: ${error.message}`, "error");
      return false;
    }
  }

  // Handle audio processing
  function handleAudioProcess(e) {
    if (!isRecording) return;

    const inputData = e.inputBuffer.getChannelData(0);
    const audioLevel = Math.max(...inputData.map(Math.abs));
    const now = Date.now();

    // Log audio levels periodically
    if (now - lastLogTime > 1000) {
      console.log("Current audio level:", audioLevel);
      addLogEntry(`Audio level: ${audioLevel.toFixed(4)}`);
      lastLogTime = now;

      // Update wave animation based on actual audio level
      updateWaveAnimation(true, audioLevel);
    }

    // Silence detection
    if (audioLevel > SILENCE_THRESHOLD) {
      if (silenceStart !== null) {
        addLogEntry("Audio detected, resetting silence timer");
        silenceStart = null;
      }
      lastAudioTime = now;
    } else if (silenceStart === null) {
      silenceStart = now;
      addLogEntry("Silence started");
    } else {
      const silenceDuration = now - silenceStart;
      if (silenceDuration >= SILENCE_DURATION && finalTranscript.trim()) {
        addLogEntry("Silence threshold reached, processing command");
        silenceStart = null;
        handleSilence();
      }
    }

    // Convert and send audio data
    try {
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
      }
      ipcRenderer.send("audio-data", int16Data.buffer);
    } catch (error) {
      console.error("Error processing audio data:", error);
      addLogEntry(`Error processing audio: ${error.message}`, "error");
    }
  }

  // Update wave animation with actual audio level
  function updateWaveAnimation(isRecording, audioLevel = 0) {
    const audioWaves = document.getElementById("audioWaves");
    if (!audioWaves) return;

    if (!isRecording) {
      audioWaves.querySelectorAll(".wave-bar").forEach((bar) => {
        bar.style.height = "2px";
      });
      return;
    }

    // Scale the audio level to a reasonable range for visualization
    const maxHeight = 30;
    const scaledLevel = Math.min(audioLevel * 200, 1) * maxHeight;

    audioWaves.querySelectorAll(".wave-bar").forEach((bar) => {
      // Add some randomness but keep it proportional to the actual audio level
      const randomFactor = 0.7 + Math.random() * 0.6;
      const height = Math.max(2, scaledLevel * randomFactor);
      bar.style.height = `${height}px`;
    });
  }

  // Handle silence detection
  async function handleSilence() {
    try {
      if (!isRecording || !finalTranscript.trim()) return;

      console.log("Processing command after silence");
      addLogEntry("Detected silence, processing command...");

      // Stop recording but keep the audio context alive
      await ipcRenderer.invoke("stop-deepgram");
      isRecording = false;
      startBtn.textContent = "Start Recording";

      // Execute the command
      console.log("Executing command:", finalTranscript);
      addLogEntry(`Executing command: ${finalTranscript}`);
      await executeCommand(finalTranscript);

      // Clear the transcript and reset
      finalTranscript = "";
      transcriptEl.textContent = "Waiting for speech...";

      // Automatically start listening again
      console.log("Restarting recording");
      addLogEntry("Restarting recording");
      const success = await ipcRenderer.invoke("start-deepgram");
      if (success) {
        isRecording = true;
        startBtn.textContent = "Stop Recording";
        silenceStart = null; // Reset silence detection
      }
    } catch (error) {
      console.error("Error handling silence:", error);
      addLogEntry(`Error: ${error.message}`, "error");
      stopRecording();
    }
  }

  // Set up environment variables
  ipcRenderer.on("init-env", (event, env) => {
    if (!env.DEEPGRAM_API_KEY) {
      addLogEntry("Warning: Deepgram API key not set", "warning");
    }
    if (!env.ANTHROPIC_API_KEY) {
      addLogEntry("Warning: Anthropic API key not set", "warning");
    }
  });

  // Handle text input
  textInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = textInput.value.trim();

      if (!text) {
        addLogEntry("No command entered", "warning");
        return;
      }

      try {
        addLogEntry(`Processing text command: ${text}`);
        await executeCommand(text);
        textInput.value = ""; // Clear input after successful execution
      } catch (error) {
        console.error("Command execution error:", error);
        addLogEntry(`Error: ${error.message}`, "error");
      }
    }
  });

  // Process command function
  async function processCommand() {
    try {
      if (!finalTranscript.trim()) {
        addLogEntry("No command to process", "warning");
        return;
      }

      processBtn.disabled = true;

      // Temporarily disable recording
      const wasRecording = isRecording;
      if (wasRecording) {
        await ipcRenderer.invoke("stop-deepgram");
        isRecording = false;
      }

      // Process the command
      addLogEntry(`Processing command: ${finalTranscript}`);
      await executeCommand(finalTranscript);

      // Clear transcript
      finalTranscript = "";
      transcriptEl.textContent = "Waiting for speech...";

      // Resume recording if it was active
      if (wasRecording) {
        const success = await ipcRenderer.invoke("start-deepgram");
        if (success) {
          isRecording = true;
        }
      }
    } catch (error) {
      console.error("Error processing command:", error);
      addLogEntry(`Error: ${error.message}`, "error");
    } finally {
      processBtn.disabled = false;
    }
  }

  // Start/Stop recording
  startBtn.addEventListener("click", async () => {
    try {
      if (!isRecording) {
        addLogEntry("Starting audio capture...");

        // Initialize audio if not already done
        if (!audioContext || audioContext.state !== "running") {
          const initialized = await initializeAudio();
          if (!initialized) {
            throw new Error("Failed to initialize audio");
          }
        }

        // Resume audio context if it's suspended
        if (audioContext.state === "suspended") {
          await audioContext.resume();
          addLogEntry("Audio context resumed");
        }

        // Start Deepgram connection
        addLogEntry("Connecting to Deepgram...");
        const success = await ipcRenderer.invoke("start-deepgram");

        if (success) {
          isRecording = true;
          startBtn.textContent = "Stop Recording";
          finalTranscript = "";
          transcriptEl.textContent = "Listening...";
          processBtn.disabled = true;
          micVisualization.classList.add("recording");
          recordingStatus.classList.add("active");
          addLogEntry("Recording started successfully");
        } else {
          throw new Error("Failed to start Deepgram connection");
        }
      } else {
        await stopRecording();
      }
    } catch (error) {
      console.error("Recording error:", error);
      addLogEntry(`Error: ${error.message}`, "error");
      await stopRecording();
    }
  });

  // Process command button
  processBtn.addEventListener("click", processCommand);

  // Handle transcript updates from Deepgram
  ipcRenderer.on("deepgram-transcript", (event, data) => {
    if (!data?.channel?.alternatives?.[0]) return;

    const transcript = data.channel.alternatives[0].transcript || "";

    if (data.is_final) {
      finalTranscript += transcript + " ";
      transcriptEl.textContent = finalTranscript;
      processBtn.disabled = !finalTranscript.trim();
      addLogEntry(`Transcript: ${transcript}`);
    } else {
      transcriptEl.textContent = finalTranscript + transcript;
    }
  });

  // Handle Deepgram connection status
  ipcRenderer.on("deepgram-ready", () => {
    addLogEntry("Connected to Deepgram", "success");
  });

  ipcRenderer.on("deepgram-closed", (event, data) => {
    addLogEntry(`Connection closed: ${data.reason}`);
    stopRecording();
  });

  ipcRenderer.on("deepgram-error", (event, error) => {
    addLogEntry(`Deepgram error: ${error}`, "error");
    stopRecording();
  });

  // Helper function to stop recording
  async function stopRecording() {
    try {
      if (isRecording) {
        addLogEntry("Stopping recording...");
        await ipcRenderer.invoke("stop-deepgram");
      }

      isRecording = false;
      startBtn.textContent = "Start Recording";
      micVisualization.classList.remove("recording");
      recordingStatus.classList.remove("active");
      updateWaveAnimation(false);

      // Clean up audio resources
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

      // Enable process button if we have a transcript
      processBtn.disabled = !finalTranscript.trim();
      addLogEntry("Recording stopped");
    } catch (error) {
      console.error("Error stopping recording:", error);
      addLogEntry(`Error stopping recording: ${error.message}`, "error");
    }
  }

  // Helper function to add log entries
  function addLogEntry(message, type = "") {
    const entry = document.createElement("div");
    entry.className = `log-entry${type ? " " + type : ""}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    executionLog.appendChild(entry);
    executionLog.scrollTop = executionLog.scrollHeight;
  }

  // Execute command function
  async function executeCommand(text) {
    try {
      addLogEntry(`Processing command: ${text}`);

      const result = await ipcRenderer.invoke("get-osa-script", text);

      if (!result.success) {
        addLogEntry(`Error: ${result.error}`, "error");
        return;
      }

      addLogEntry("Executing script...");
      const output = await ipcRenderer.invoke(
        "execute-script",
        result.response
      );
      addLogEntry(`Output: ${output}`, "success");
    } catch (error) {
      console.error("Script execution error:", error);
      addLogEntry(`Error: ${error.message}`, "error");
    }
  }

  // Clean up when window is closed
  window.addEventListener("beforeunload", () => {
    stopRecording();
  });
});
