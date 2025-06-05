// Simple microphone test script
const { app, BrowserWindow } = require('electron');

function createTestWindow() {
  const testWindow = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  testWindow.loadURL(`data:text/html,
    <!DOCTYPE html>
    <html>
    <head>
      <title>Microphone Test</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #1a1a1a; color: white; }
        button { padding: 10px 20px; margin: 10px; font-size: 16px; cursor: pointer; }
        #status { margin: 20px 0; padding: 10px; background: #333; border-radius: 5px; }
        #visualizer { width: 100%; height: 100px; background: #222; margin: 10px 0; }
      </style>
    </head>
    <body>
      <h1>🎤 Microphone Test</h1>
      <button onclick="startTest()">Start Microphone Test</button>
      <button onclick="stopTest()">Stop Test</button>
      <div id="status">Click "Start Microphone Test" to begin...</div>
      <canvas id="visualizer" width="500" height="100"></canvas>
      
      <script>
        let stream = null;
        let audioContext = null;
        let analyser = null;
        let microphone = null;
        let animationFrame = null;
        
        async function startTest() {
          try {
            document.getElementById('status').innerHTML = '🔄 Requesting microphone access...';
            
            stream = await navigator.mediaDevices.getUserMedia({ 
              audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
              } 
            });
            
            document.getElementById('status').innerHTML = '✅ Microphone access granted! Analyzing audio...';
            
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 2048;
            microphone.connect(analyser);
            
            visualize();
            
            console.log('✅ Microphone test started successfully');
            console.log('📊 Audio context state:', audioContext.state);
            console.log('📊 Sample rate:', audioContext.sampleRate);
            
          } catch (error) {
            console.error('❌ Microphone test failed:', error);
            document.getElementById('status').innerHTML = '❌ Error: ' + error.message;
            
            if (error.name === 'NotAllowedError') {
              document.getElementById('status').innerHTML = '❌ Microphone permission denied. Please allow microphone access in System Preferences > Security & Privacy > Privacy > Microphone';
            }
          }
        }
        
        function visualize() {
          const canvas = document.getElementById('visualizer');
          const ctx = canvas.getContext('2d');
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          
          function draw() {
            animationFrame = requestAnimationFrame(draw);
            
            analyser.getByteFrequencyData(dataArray);
            
            ctx.fillStyle = '#222';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / dataArray.length) * 2.5;
            let barHeight;
            let x = 0;
            
            let maxAmplitude = 0;
            for (let i = 0; i < dataArray.length; i++) {
              maxAmplitude = Math.max(maxAmplitude, dataArray[i]);
            }
            
            // Update status with audio level
            document.getElementById('status').innerHTML = 
              '🎤 Microphone active - Audio level: ' + maxAmplitude + '/255 ' + 
              (maxAmplitude > 10 ? '📊 DETECTING AUDIO!' : '🔇 No audio detected');
            
            for (let i = 0; i < dataArray.length; i++) {
              barHeight = (dataArray[i] / 255) * canvas.height;
              
              const r = barHeight + 25 * (i / dataArray.length);
              const g = 250 * (i / dataArray.length);
              const b = 50;
              
              ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
              ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
              
              x += barWidth + 1;
            }
          }
          
          draw();
        }
        
        function stopTest() {
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
          }
          
          if (audioContext) {
            audioContext.close();
            audioContext = null;
          }
          
          if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
          }
          
          document.getElementById('status').innerHTML = '🛑 Microphone test stopped';
          
          const canvas = document.getElementById('visualizer');
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#222';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          console.log('🛑 Microphone test stopped');
        }
        
        // Test on page load
        window.addEventListener('load', () => {
          console.log('🔧 Microphone test page loaded');
          console.log('📱 User agent:', navigator.userAgent);
          console.log('🎤 Media devices available:', !!navigator.mediaDevices);
        });
      </script>
    </body>
    </html>
  `);
}

app.whenReady().then(createTestWindow);

app.on('window-all-closed', () => {
  app.quit();
}); 