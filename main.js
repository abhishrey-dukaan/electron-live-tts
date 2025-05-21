const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const WebSocket = require("ws");
const { exec } = require("child_process");
const AIService = require("./ai-service");
require("dotenv").config();

let mainWindow;
let deepgramSocket;
let aiService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");

  // Initialize AI service
  aiService = new AIService(process.env.ANTHROPIC_API_KEY);

  // Send environment variables to renderer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("init-env", {
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    });
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle start Deepgram connection
ipcMain.handle("start-deepgram", async () => {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("Deepgram API key not found");
    }

    // Close existing connection if any
    if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.close();
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay to ensure clean closure
    }

    // Create new WebSocket connection with proper parameters
    deepgramSocket = new WebSocket(
      "wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&punctuate=true",
      {
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        },
      }
    );

    // Set up event handlers
    deepgramSocket.on("open", () => {
      console.log("Deepgram WebSocket opened");
      mainWindow.webContents.send("deepgram-ready");
    });

    deepgramSocket.on("message", (data) => {
      try {
        const response = JSON.parse(data);
        mainWindow.webContents.send("deepgram-transcript", response);
      } catch (error) {
        console.error("Error parsing Deepgram response:", error);
      }
    });

    deepgramSocket.on("close", (code, reason) => {
      console.log("Deepgram WebSocket closed:", code, reason);
      mainWindow.webContents.send("deepgram-closed", {
        code,
        reason: reason.toString(),
      });
    });

    deepgramSocket.on("error", (error) => {
      console.error("Deepgram WebSocket error:", error);
      mainWindow.webContents.send("deepgram-error", error.message);
    });

    // Wait for connection to be established
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 5000);

      deepgramSocket.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      deepgramSocket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    return true;
  } catch (error) {
    console.error("Error starting Deepgram:", error);
    return false;
  }
});

// Handle stop Deepgram connection
ipcMain.handle("stop-deepgram", async () => {
  if (deepgramSocket) {
    const closePromise = new Promise((resolve) => {
      deepgramSocket.once("close", () => resolve());
    });

    deepgramSocket.close();
    await closePromise;
    deepgramSocket = null;
  }
  return true;
});

// Handle sending audio data to Deepgram
ipcMain.on("audio-data", (event, buffer) => {
  if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
    try {
      // Convert ArrayBuffer to Buffer
      const audioBuffer = Buffer.from(buffer);
      deepgramSocket.send(audioBuffer);
    } catch (error) {
      console.error("Error sending audio data:", error);
      mainWindow.webContents.send(
        "deepgram-error",
        "Failed to send audio data"
      );
    }
  }
});

// Handle getting OSA script from AI service
ipcMain.handle("get-osa-script", async (event, transcript) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Anthropic API key not found");
    }

    if (typeof transcript !== "string") {
      throw new Error("Invalid transcript type: " + typeof transcript);
    }

    console.log("Getting OSA script for:", transcript);
    const result = await aiService.getOSAScript(transcript);

    if (result.error) {
      console.error("AI service error:", result.error);
      return {
        success: false,
        error: result.error,
      };
    }

    if (!result.steps || !result.steps[0] || !result.steps[0].script) {
      throw new Error("Invalid script generated");
    }

    const script = result.steps[0].script;
    console.log("Generated script:", script);

    return {
      success: true,
      response: script,
    };
  } catch (error) {
    console.error("Error generating OSA script:", error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Handle executing AppleScript
ipcMain.handle("execute-script", async (event, script) => {
  return new Promise((resolve, reject) => {
    if (typeof script !== "string") {
      console.error("Invalid script type:", typeof script);
      reject(new Error("Script must be a string"));
      return;
    }

    console.log("Executing script:", script);

    // Execute the script directly since it's already properly formatted from AI service
    exec(script, (error, stdout, stderr) => {
      if (error) {
        console.error("Script execution error:", error);
        reject(error);
      } else {
        console.log("Script execution successful");
        console.log("stdout:", stdout);
        console.log("stderr:", stderr);
        resolve(stdout || stderr || "Command executed successfully");
      }
    });
  });
});
