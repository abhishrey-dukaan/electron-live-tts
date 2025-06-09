const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Recording controls
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  sendAudio: (audioData) => ipcRenderer.invoke('send-audio', audioData),
  
  // Manual commands
  manualCommand: (command) => ipcRenderer.invoke('manual-command', command),
  
  // History management
  getCommandHistory: () => ipcRenderer.invoke('get-command-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  
  // Deepgram event listeners
  onDeepgramReady: (callback) => ipcRenderer.on('deepgram-ready', callback),
  onDeepgramTranscript: (callback) => ipcRenderer.on('deepgram-transcript', (event, data) => callback(data)),
  onDeepgramClosed: (callback) => ipcRenderer.on('deepgram-closed', (event, data) => callback(data)),
  onDeepgramError: (callback) => ipcRenderer.on('deepgram-error', (event, data) => callback(data))
}); 