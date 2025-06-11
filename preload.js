const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Environment and initialization
  onInitEnv: (callback) => ipcRenderer.on('init-env', callback),
  
  // Voice and audio
  sendAudio: (audioData) => ipcRenderer.send('audio-data', audioData),
  onTranscriptUpdate: (callback) => ipcRenderer.on('transcript-update', callback),
  onVoiceActivity: (callback) => ipcRenderer.on('voice-activity', callback),
  
  // Task execution
  executeCommand: (transcript, historyContext) => ipcRenderer.invoke('execute-command', transcript, historyContext),
  executeDynamicTask: (data) => ipcRenderer.invoke('execute-dynamic-task', data),
  onTaskStepComplete: (callback) => ipcRenderer.on('task-step-complete', callback),
  onTaskComplete: (callback) => ipcRenderer.on('task-complete', callback),
  onTaskError: (callback) => ipcRenderer.on('task-error', callback),
  
  // Command processing
  onCommandProcessing: (callback) => ipcRenderer.on('command-processing', callback),
  onCommandSuccess: (callback) => ipcRenderer.on('command-success', callback),
  onCommandError: (callback) => ipcRenderer.on('command-error', callback),
  onClarificationNeeded: (callback) => ipcRenderer.on('clarification-needed', callback),
  
  // Overlay management
  resizeOverlay: (dimensions) => ipcRenderer.send('resize-overlay', dimensions),
  resetOverlayPosition: () => ipcRenderer.invoke('reset-overlay-position'),
  
  // System prompt management
  updateSystemPrompt: (prompt) => ipcRenderer.invoke('update-system-prompt', prompt),
  getSystemPrompt: () => ipcRenderer.invoke('get-system-prompt'),
  
  // Model configuration
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  getModelConfig: () => ipcRenderer.invoke('get-model-config'),
  setTextModel: (provider, model) => ipcRenderer.invoke('set-text-model', provider, model),
  setImageModel: (provider, model) => ipcRenderer.invoke('set-image-model', provider, model),
  requestModelInfo: () => ipcRenderer.send('request-model-info'),
  onModelInfo: (callback) => ipcRenderer.on('model-info', callback),
  
  // Testing and development
  testVoiceCommand: (text) => ipcRenderer.invoke('test-voice-command', text),
  testAllModels: () => ipcRenderer.invoke('test-all-models'),
  
  // Deepgram connection management
  startDeepgram: () => ipcRenderer.invoke('start-deepgram'),
  stopDeepgram: () => ipcRenderer.invoke('stop-deepgram'),
  onDeepgramReady: (callback) => ipcRenderer.on('deepgram-ready', callback),
  onDeepgramClosed: (callback) => ipcRenderer.on('deepgram-closed', callback),
  onDeepgramError: (callback) => ipcRenderer.on('deepgram-error', callback),
  onDeepgramReconnected: (callback) => ipcRenderer.on('deepgram-reconnected', callback),
  onDeepgramTranscript: (callback) => ipcRenderer.on('deepgram-transcript', callback),
  
  // Queue management
  clearQueue: () => ipcRenderer.invoke('clear-queue'),
  onQueueUpdate: (callback) => ipcRenderer.on('queue-update', callback),
  minimizeOverlay: () => ipcRenderer.invoke('minimize-overlay'),
  
  // Task management
  stopTask: () => ipcRenderer.invoke('stop-task'),
  executeWebTask: (taskType, params) => ipcRenderer.invoke('execute-web-task', taskType, params),
  
  // Screenshot and visual analysis notifications
  onScreenshotAnalysisStart: (callback) => ipcRenderer.on('screenshot-analysis-start', callback),
  onScreenshotAnalysisComplete: (callback) => ipcRenderer.on('screenshot-analysis-complete', callback),
  onVisualFallbackResult: (callback) => ipcRenderer.on('visual-fallback-result', callback),
  onVisualFallbackSuccess: (callback) => ipcRenderer.on('visual-fallback-success', callback),
  onVisualFallbackFailed: (callback) => ipcRenderer.on('visual-fallback-failed', callback),
  onScreenshotCapture: (callback) => ipcRenderer.on('screenshot-capture', callback),
  onClaudeAnalysis: (callback) => ipcRenderer.on('claude-analysis', callback),
  onCloudUpload: (callback) => ipcRenderer.on('cloud-upload', callback),
  
  // Visual guidance events
  onVisualGuidanceStart: (callback) => ipcRenderer.on('visual-guidance-start', callback),
  onVisualGuidanceScreenshot: (callback) => ipcRenderer.on('visual-guidance-screenshot', callback),
  onVisualGuidanceAction: (callback) => ipcRenderer.on('visual-guidance-action', callback),
  onVisualGuidanceComplete: (callback) => ipcRenderer.on('visual-guidance-complete', callback),
  
  // Playwright web automation
  playwrightDownloadFile: (url, filename) => ipcRenderer.invoke('playwright-download-file', url, filename),
  playwrightNavigate: (url) => ipcRenderer.invoke('playwright-navigate', url),
  playwrightSearchGoogle: (query) => ipcRenderer.invoke('playwright-search-google', query),
  playwrightScreenshot: (filename) => ipcRenderer.invoke('playwright-screenshot', filename),
  playwrightGetDownloads: () => ipcRenderer.invoke('playwright-get-downloads'),
  playwrightClose: () => ipcRenderer.invoke('playwright-close'),

  // Utility
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
  
  // Node.js utilities (safely exposed)
  node: {
    process: {
      platform: process.platform,
      versions: process.versions
    }
  }
});

// Optional: Expose a version info for debugging
contextBridge.exposeInMainWorld('versions', {
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
}); 