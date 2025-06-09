#!/usr/bin/env node

// Simple test launcher without Deepgram
console.log('🧪 Starting Simple Voice App (Test Mode - No Deepgram)');
console.log('📱 This will test the UI without voice recognition');

// Don't set Deepgram key - test offline mode
process.env.NODE_ENV = 'development';

// Launch Electron
const { spawn } = require('child_process');
const electron = spawn('yarn', ['start'], {
  stdio: 'inherit',
  cwd: __dirname
});

electron.on('close', (code) => {
  console.log(`App exited with code ${code}`);
  process.exit(code);
});

electron.on('error', (err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
}); 