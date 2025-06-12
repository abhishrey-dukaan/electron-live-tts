const { app, BrowserWindow, ipcMain, systemPreferences } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('test-audio.html');
  win.webContents.openDevTools();

  // Handle microphone permission request
  ipcMain.handle('request-microphone', async () => {
    try {
      if (process.platform === 'darwin') {
        const status = await systemPreferences.askForMediaAccess('microphone');
        console.log('Microphone permission status:', status);
        return status;
      }
      return true;
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      return false;
    }
  });
}

// Check microphone permission on startup
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    const status = await systemPreferences.getMediaAccessStatus('microphone');
    console.log('Initial microphone permission status:', status);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 