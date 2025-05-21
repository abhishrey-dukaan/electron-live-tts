const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { WebSocket } = require("ws");
require("dotenv").config();

let mainWindow;
let deepgramSocket = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");

  // Send environment variables to renderer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("init-env", {
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    });
  });
}

// Handle Deepgram WebSocket connection
ipcMain.handle("start-deepgram", async () => {
  try {
    // Close existing connection if any
    if (deepgramSocket) {
      deepgramSocket.close();
      deepgramSocket = null;
    }

    // Build WebSocket URL with parameters
    const wsUrl = new URL("wss://api.deepgram.com/v1/listen");
    wsUrl.searchParams.append("encoding", "linear16");
    wsUrl.searchParams.append("sample_rate", "48000");
    wsUrl.searchParams.append("channels", "1");
    wsUrl.searchParams.append("interim_results", "true");
    wsUrl.searchParams.append("endpointing", "500");
    wsUrl.searchParams.append("numerals", "true");
    wsUrl.searchParams.append("language", "en");
    wsUrl.searchParams.append("model", "nova-2");
    wsUrl.searchParams.append("punctuate", "true");

    deepgramSocket = new WebSocket(wsUrl.toString(), {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    });

    deepgramSocket.on("open", () => {
      console.log("Connected to Deepgram");
      mainWindow.webContents.send("deepgram-ready");
    });

    deepgramSocket.on("message", (data) => {
      try {
        const jsonData = JSON.parse(data.toString());
        mainWindow.webContents.send("deepgram-transcript", jsonData);
      } catch (error) {
        console.error("Error parsing Deepgram message:", error);
      }
    });

    deepgramSocket.on("close", (code, reason) => {
      console.log("Deepgram connection closed:", code, reason.toString());
      mainWindow.webContents.send("deepgram-closed", {
        code,
        reason: reason.toString(),
      });
      deepgramSocket = null;
    });

    deepgramSocket.on("error", (error) => {
      console.error("Deepgram error:", error);
      mainWindow.webContents.send("deepgram-error", error.message);
    });

    return true;
  } catch (error) {
    console.error("Error setting up Deepgram:", error);
    mainWindow.webContents.send("deepgram-error", error.message);
    return false;
  }
});

// Handle audio data from renderer
ipcMain.on("send-audio", (_, buffer) => {
  if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
    deepgramSocket.send(buffer);
  }
});

// Handle stopping Deepgram connection
ipcMain.handle("stop-deepgram", async () => {
  if (deepgramSocket) {
    deepgramSocket.close();
    deepgramSocket = null;
  }
});

// Handle saving audio file
ipcMain.on("save-audio", async (event, buffer) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: "recording.webm",
    filters: [{ name: "Audio", extensions: ["webm"] }],
  });

  if (filePath) {
    fs.writeFile(filePath, buffer, (err) => {
      if (err) {
        console.error("Error saving audio:", err);
        event.reply("audio-saved", null);
        return;
      }
      console.log("Audio saved!");
      event.reply("audio-saved", filePath);
    });
  }
});

app.whenReady().then(createWindow);
