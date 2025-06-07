# Voice Assistant with Multi-Model AI Support

This application provides voice-controlled automation for macOS using multiple AI providers. It records audio, transcribes it using Deepgram, and converts voice commands to AppleScript using advanced AI models from Anthropic, Groq, and OpenAI.

## 🚀 Features

- **Voice-controlled macOS automation** with AppleScript generation
- **Multiple AI providers**: Anthropic Claude, Groq, and OpenAI models
- **Model configuration**: Separate models for text and image processing
- **Live model testing** to verify API connectivity
- **Real-time voice recognition** with Deepgram
- **Visual UI overlay** for status monitoring
- **Dynamic task execution** with visual guidance

## 🤖 Supported AI Models

### Anthropic Claude
- **Claude Opus 4**: Most capable model for complex reasoning
- **Claude Sonnet 4**: High-performance model with exceptional reasoning  
- **Claude 3.5 Sonnet**: Balanced performance and efficiency
- **Claude 3.5 Haiku**: Fastest model for quick responses

### Groq Models
- **DeepSeek R1 Distill Llama 70B**: Excellent reasoning and math capabilities
- **Llama 3.3 70B Versatile**: Versatile large model with strong performance
- **Llama 3.1 8B Instant**: Ultra-fast responses for quick tasks
- **Llama 3 70B**: Strong general purpose model
- **Mixtral 8x7B**: Efficient mixture of experts model

### OpenAI Models
- **GPT-4.5 Preview**: Latest and most capable GPT model
- **GPT-4o**: Omni-modal GPT-4 with enhanced capabilities
- **GPT-4o Mini**: Efficient version of GPT-4o
- **o1-preview**: Advanced reasoning model
- **o1-mini**: Compact reasoning model
- **GPT-4 Turbo**: Optimized GPT-4 with latest training

## 📋 Setup

1. Create a `.env` file in the root directory with your API keys:

```env
# Deepgram API key for speech-to-text
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Anthropic API key for Claude models
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Groq API key for Groq models
GROQ_API_KEY=your_groq_api_key_here

# OpenAI API key for OpenAI models
OPENAI_API_KEY=your_openai_api_key_here
```

2. Install dependencies:

```bash
yarn install
```

3. Start the application:

```bash
yarn start
```

## ⚙️ Configuration

### Model Selection
1. Click the **⚙️ Settings** button in the main interface
2. In the **🤖 AI Model Configuration** section:
   - Choose your preferred **Text Generation Model** for voice command processing
   - Select an **Image Analysis Model** for visual tasks
   - Click **🧪 Test All Models** to verify API connectivity

### Available Providers
- **Anthropic**: Requires `ANTHROPIC_API_KEY`
- **Groq**: Requires `GROQ_API_KEY`  
- **OpenAI**: Requires `OPENAI_API_KEY`

## 🎯 Usage

1. **Start the application** with `yarn start`
2. **Click "🎤 Start Listening"** to begin voice recognition
3. **Speak your automation command** (e.g., "open Safari and search for weather")
4. The AI will **generate and execute** the appropriate AppleScript
5. Monitor execution in the **live overlay window**

## 🔑 API Keys

Obtain your API keys from:

- **Deepgram**: https://deepgram.com
- **Anthropic**: https://console.anthropic.com  
- **Groq**: https://console.groq.com
- **OpenAI**: https://platform.openai.com

## 🧪 Testing Models

The application includes a built-in model testing feature:

1. Open **Settings** → **🤖 AI Model Configuration**
2. Click **🧪 Test All Models**
3. View results showing which models are working with your API keys
4. Models with ✅ status are ready to use
5. Models with ❌ status need valid API keys or have connectivity issues

## 🎛️ Model Recommendations

### For Speed
- **Groq**: Llama 3.1 8B Instant
- **Anthropic**: Claude 3.5 Haiku

### For Complex Tasks  
- **Anthropic**: Claude Opus 4
- **OpenAI**: GPT-4.5 Preview
- **Groq**: DeepSeek R1 Distill Llama 70B

### For Balance
- **Anthropic**: Claude Sonnet 4  
- **OpenAI**: GPT-4o
- **Groq**: Llama 3.3 70B Versatile

## 🛠️ Development

Built with:
- **Electron** for cross-platform desktop app
- **Node.js** for backend processing
- **Deepgram** for speech-to-text
- **Multiple AI APIs** for intelligent command processing
- **AppleScript** for macOS automation
