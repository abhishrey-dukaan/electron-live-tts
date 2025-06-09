# Simple Voice App

A minimal Electron application for voice-to-text transcription using Deepgram.

## Features

✅ **Real-time voice recognition** - Powered by Deepgram API  
✅ **Live transcription display** - See your speech converted to text instantly  
✅ **Command history** - Keep track of recent voice inputs  
✅ **Overlay window** - Always-on-top transcript display  
✅ **Manual text input** - Type commands as well as speak them  
✅ **Clean, modern UI** - Glassmorphic design with smooth animations  

## What's Removed

❌ **All AI/LLM integrations** - No ChatGPT, Claude, or other AI services  
❌ **Complex task orchestration** - No automated command execution  
❌ **System automation** - No AppleScript or shell command execution  
❌ **Web scraping** - No browser automation or screenshot analysis  
❌ **Heavy dependencies** - Removed React, Tailwind, and testing frameworks  

## Setup

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Get a Deepgram API key:**
   - Go to [deepgram.com](https://deepgram.com)
   - Sign up for a free account
   - Get your API key from the dashboard

3. **Set up your API key:**
   ```bash
   export DEEPGRAM_API_KEY="your-actual-api-key-here"
   ```

4. **Start the app:**
   ```bash
   ./setup.sh
   ```
   Or manually:
   ```bash
   yarn start
   ```

5. **Test without Deepgram (UI only):**
   ```bash
   node test-simple.js
   ```

## Usage

1. **Grant microphone permissions** when prompted
2. **Click "Start Recording"** to begin voice recognition
3. **Speak clearly** and see real-time transcription
4. **Type manual commands** in the input field if needed
5. **View command history** in the main window

## Files Structure

```
├── main.js          # Main Electron process (simplified)
├── renderer.js      # Main window renderer (voice controls)
├── overlay.js       # Overlay window renderer (transcript display)
├── preload.js       # Security bridge between main and renderer
├── index.html       # Main window UI
├── overlay.html     # Overlay window UI
└── package.json     # Dependencies (minimal)
```

## Dependencies

- **electron** - Desktop app framework
- **ws** - WebSocket client for Deepgram connection

That's it! No complex AI services, no heavy frameworks.

## Configuration

The app uses these simple settings:

- **Deepgram Model:** `nova-2` (fast and accurate)
- **Language:** `en-US` 
- **Sample Rate:** `16kHz`
- **Silence Timeout:** `300ms`

## Privacy

- **No data sent to AI services** - Only Deepgram for voice transcription
- **Local storage only** - Command history saved locally
- **No tracking** - No analytics or telemetry

Perfect for users who want voice recognition without AI complexity!
