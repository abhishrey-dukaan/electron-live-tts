const { ipcRenderer } = require("electron");

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let animationId;
let visualizerInitialized = false;
let isRecording = false;
let transcriptHistory = [];

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const recordingIndicator = document.getElementById("recordingIndicator");
const statusText = document.getElementById("statusText");
const savePath = document.getElementById("savePath");
const canvas = document.getElementById("visualizer");
const canvasCtx = canvas.getContext("2d");

// Listen for environment variables from main process
ipcRenderer.on("init-env", (event, env) => {
  // DEEPGRAM_API_KEY is no longer needed as it's handled through the main process
});

// Initialize canvas
function setupCanvas() {
  canvas.width = canvas.offsetWidth * window.devicePixelRatio;
  canvas.height = canvas.offsetHeight * window.devicePixelRatio;
  canvasCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  canvas.style.width = canvas.offsetWidth + "px";
  canvas.style.height = canvas.offsetHeight + "px";
}

// Handle window resize
window.addEventListener("resize", setupCanvas);
setupCanvas();

// Draw initial empty visualizer
function drawEmptyVisualizer() {
  const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#f5f5f7");
  gradient.addColorStop(1, "#f5f5f7");

  canvasCtx.fillStyle = gradient;
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw a subtle line in the middle
  canvasCtx.beginPath();
  canvasCtx.strokeStyle = "#e5e5e7";
  canvasCtx.lineWidth = 2;
  canvasCtx.moveTo(0, canvas.height / 2);
  canvasCtx.lineTo(canvas.width, canvas.height / 2);
  canvasCtx.stroke();
}

// Initialize empty visualizer
drawEmptyVisualizer();

// Visualizer function with smooth animations
function drawVisualizer(dataArray) {
  const bufferLength = dataArray.length;
  const barWidth = (canvas.width / bufferLength) * 2.5;

  // Create gradient
  const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#007AFF");
  gradient.addColorStop(1, "#5856D6");

  canvasCtx.fillStyle = "#f5f5f7";
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

    // Add some randomness for more dynamic visualization
    const heightVariation = Math.random() * 5;

    canvasCtx.fillStyle = gradient;

    // Draw mirrored bars
    const y = (canvas.height - barHeight) / 2;
    canvasCtx.fillRect(x, y, barWidth - 2, barHeight + heightVariation);

    x += barWidth;
  }
}

function visualize(stream) {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function animate() {
    animationId = requestAnimationFrame(animate);
    analyser.getByteFrequencyData(dataArray);
    drawVisualizer(dataArray);
  }

  animate();
}

// Handle Deepgram messages
ipcRenderer.on("deepgram-ready", () => {
  statusText.textContent = "Connected to Deepgram";
});

ipcRenderer.on("deepgram-transcript", (_, data) => {
  if (
    data.channel &&
    data.channel.alternatives &&
    data.channel.alternatives[0]
  ) {
    const transcript = data.channel.alternatives[0].transcript;
    if (transcript && transcript.trim()) {
      // If it's a final transcript, add it to history
      if (data.is_final) {
        transcriptHistory.push(transcript);
      }
      updateLiveTranscription(transcript, data.is_final);
    }
  }
});

ipcRenderer.on("deepgram-closed", (_, data) => {
  statusText.textContent = `Disconnected from Deepgram: ${
    data.reason || "Connection closed"
  }`;
});

ipcRenderer.on("deepgram-error", (_, error) => {
  statusText.textContent = `Error: ${error}`;
  console.error("Deepgram error:", error);
});

startBtn.addEventListener("click", async () => {
  try {
    // Clear transcript history when starting new recording
    transcriptHistory = [];
    updateLiveTranscription("", true);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 48000,
      },
    });

    mediaRecorder = new MediaRecorder(stream);
    isRecording = true;

    // Set up audio processing for Deepgram
    audioContext = new AudioContext({ sampleRate: 48000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    // Start Deepgram connection
    await ipcRenderer.invoke("start-deepgram");

    processor.onaudioprocess = (e) => {
      if (isRecording) {
        // Convert audio to 16-bit PCM
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send audio data to main process
        ipcRenderer.send("send-audio", pcmData.buffer);
      }
    };

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    recordingIndicator.style.display = "inline";
    statusText.textContent = "Recording...";

    // Start visualization
    visualize(stream);

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      isRecording = false;
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      audioChunks = [];

      // Clean up audio processing
      processor.disconnect();
      source.disconnect();

      // Stop Deepgram connection
      await ipcRenderer.invoke("stop-deepgram");

      const reader = new FileReader();
      reader.onload = () => {
        const buffer = Buffer.from(reader.result);
        ipcRenderer.send("save-audio", buffer);
      };
      reader.readAsArrayBuffer(blob);

      // Clean up visualization
      if (animationId) {
        cancelAnimationFrame(animationId);
        drawEmptyVisualizer();
      }
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }

      // Reset UI
      startBtn.disabled = false;
      stopBtn.disabled = true;
      recordingIndicator.style.display = "none";
      statusText.textContent = "Saving...";
    };

    mediaRecorder.start();
  } catch (error) {
    statusText.textContent = `Error: ${error.message}`;
    console.error("Error starting recording:", error);
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
});

// Listen for save path from main process
ipcRenderer.on("audio-saved", async (event, path) => {
  savePath.textContent = path;
  statusText.textContent = "Transcribing...";

  try {
    // Send the path to main process to handle the Deepgram API call
    ipcRenderer.send("transcribe-audio", path);
  } catch (error) {
    console.error("Error sending transcription request:", error);
    statusText.textContent = "Error during transcription";
  }
});

// Listen for transcription response
ipcRenderer.on("transcription-complete", (event, result) => {
  if (result.error) {
    statusText.textContent = `Transcription Error: ${result.error}`;
    return;
  }

  statusText.textContent = "Transcription Complete";

  // Add transcription result to the UI
  const transcriptionDiv =
    document.getElementById("transcription") || document.createElement("div");
  transcriptionDiv.id = "transcription";
  transcriptionDiv.className = "transcription";
  transcriptionDiv.innerHTML = `
    <h3>Transcription Result:</h3>
    <p>${result.transcript}</p>
  `;

  // Add to document if it doesn't exist
  if (!document.getElementById("transcription")) {
    document.querySelector(".status").after(transcriptionDiv);
  }
});

// Update the live transcription display
function updateLiveTranscription(currentText, isFinal = false) {
  const transcriptionDiv =
    document.getElementById("transcription") || document.createElement("div");
  transcriptionDiv.id = "transcription";
  transcriptionDiv.className = "transcription";

  // Create history element if it doesn't exist
  let historyEl = document.getElementById("transcriptionHistory");
  if (!historyEl) {
    historyEl = document.createElement("div");
    historyEl.id = "transcriptionHistory";
    historyEl.className = "transcription-history";
  }

  // Create current transcription element
  const liveTranscriptionEl =
    document.getElementById("liveTranscription") || document.createElement("p");
  liveTranscriptionEl.id = "liveTranscription";
  liveTranscriptionEl.className = "current-transcription";

  // Update the display
  transcriptionDiv.innerHTML = `
    <h3>Live Transcription:</h3>
  `;

  // Add history of final transcripts
  if (transcriptHistory.length > 0) {
    historyEl.innerHTML = transcriptHistory
      .map((text) => `<p class="transcript-entry">${text}</p>`)
      .join("");
    transcriptionDiv.appendChild(historyEl);
  }

  // Add current transcript if there is one
  if (currentText && currentText.trim()) {
    liveTranscriptionEl.textContent = currentText;
    transcriptionDiv.appendChild(liveTranscriptionEl);
  }

  // Add to document if it doesn't exist
  if (!document.getElementById("transcription")) {
    document.querySelector(".container").appendChild(transcriptionDiv);
  }

  // Scroll to bottom to show latest text
  transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
}
