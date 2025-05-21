# Audio to OSAScript Converter

This application records audio, transcribes it using Deepgram, and converts the transcription to AppleScript commands using Anthropic's Claude AI.

## Setup

1. Create a `.env` file in the root directory with the following content:

```
# Deepgram API key for speech-to-text
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Anthropic API key for generating OSAScript
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

2. Install dependencies:

```bash
npm install
```

3. Start the application:

```bash
npm start
```

## Usage

1. Click "Start Recording" to begin recording audio
2. Speak your desired automation command
3. Click "Stop Recording" to end the recording
4. Click "Give OSAScript" to get the AI-generated AppleScript command

## Environment Variables

- `DEEPGRAM_API_KEY`: Your Deepgram API key for speech-to-text conversion
- `ANTHROPIC_API_KEY`: Your Anthropic API key for AI-powered OSAScript generation

You can obtain these API keys from:

- Deepgram: https://deepgram.com
- Anthropic: https://anthropic.com
