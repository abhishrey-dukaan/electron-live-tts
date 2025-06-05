// Audio debugging diagnostic script
const { ipcRenderer } = require('electron');

// Add this to your renderer.js temporarily for debugging
function addAudioDebugging() {
  let audioDebugInterval;
  let audioDataCount = 0;
  let lastAudioDataTime = 0;
  let totalAudioBytes = 0;

  // Override the handleAudioProcess function with debugging
  const originalHandleAudioProcess = window.handleAudioProcess;
  
  window.handleAudioProcess = function(e) {
    const inputData = e.inputBuffer.getChannelData(0);
    const audioLevel = Math.max(...inputData.map(Math.abs));
    const now = Date.now();
    
    audioDataCount++;
    lastAudioDataTime = now;
    totalAudioBytes += inputData.length * 2; // Int16Array is 2 bytes per sample
    
    console.log(`🎤 Audio Debug - Count: ${audioDataCount}, Level: ${audioLevel.toFixed(4)}, Buffer: ${inputData.length}`);
    
    // Check if audio level is too low (might indicate no microphone input)
    if (audioLevel < 0.001) {
      console.log("⚠️ Very low audio level detected - microphone might not be working");
    }
    
    // Call original function
    if (originalHandleAudioProcess) {
      originalHandleAudioProcess.call(this, e);
    }
  };
  
  // Start audio debugging interval
  audioDebugInterval = setInterval(() => {
    const timeSinceLastAudio = Date.now() - lastAudioDataTime;
    console.log(`📊 Audio Debug Summary:
      - Total audio packets: ${audioDataCount}
      - Total bytes processed: ${totalAudioBytes}
      - Time since last audio: ${timeSinceLastAudio}ms
      - Audio stream active: ${window.audioStream?.active}
      - Audio context state: ${window.audioContext?.state}
      - Recording state: ${window.isRecording}
    `);
    
    // Check for potential issues
    if (timeSinceLastAudio > 5000 && window.isRecording) {
      console.log("❌ No audio data for 5+ seconds - audio stream may be broken");
    }
    
    if (window.audioContext?.state === 'suspended') {
      console.log("⚠️ Audio context is suspended - attempting to resume...");
      window.audioContext.resume().catch(err => {
        console.error("Failed to resume audio context:", err);
      });
    }
    
    // Reset counters
    audioDataCount = 0;
    totalAudioBytes = 0;
  }, 5000); // Every 5 seconds
  
  return () => {
    if (audioDebugInterval) {
      clearInterval(audioDebugInterval);
    }
  };
}

// Test microphone directly
async function testMicrophoneDirectly() {
  try {
    console.log("🔧 Testing microphone access directly...");
    
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });
    
    console.log("✅ Microphone access granted");
    console.log("📊 Stream details:", {
      active: stream.active,
      tracks: stream.getAudioTracks().map(track => ({
        kind: track.kind,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: track.getSettings()
      }))
    });
    
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let maxLevel = 0;
    let sampleCount = 0;
    
    const testDuration = 5000; // 5 seconds
    const startTime = Date.now();
    
    function checkAudioLevel() {
      analyser.getByteFrequencyData(dataArray);
      const currentMax = Math.max(...dataArray);
      maxLevel = Math.max(maxLevel, currentMax);
      sampleCount++;
      
      if (Date.now() - startTime < testDuration) {
        requestAnimationFrame(checkAudioLevel);
      } else {
        console.log(`🎤 Microphone test completed:
          - Duration: ${testDuration}ms
          - Samples: ${sampleCount}
          - Max audio level: ${maxLevel}/255
          - Result: ${maxLevel > 10 ? '✅ WORKING' : '❌ NOT WORKING OR TOO QUIET'}
        `);
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
      }
    }
    
    console.log("🎤 Speak now for 5 seconds...");
    checkAudioLevel();
    
  } catch (error) {
    console.error("❌ Microphone test failed:", error);
    if (error.name === 'NotAllowedError') {
      console.log("💡 Fix: Allow microphone access in browser/app settings");
    } else if (error.name === 'NotFoundError') {
      console.log("💡 Fix: Connect a microphone to your computer");
    }
  }
}

// Export functions for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    addAudioDebugging,
    testMicrophoneDirectly
  };
} 