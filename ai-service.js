const https = require("https");

class AIService {
  constructor() {
    this.customSystemPrompt = null;
    this.textModelConfig = {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022'
    };
    this.imageModelConfig = {
      provider: 'anthropic', 
      model: 'claude-3-5-sonnet-20241022'
    };
    this.apiKeys = {};
  }

  // Set API keys for different providers
  setApiKeys(keys) {
    this.apiKeys = { ...this.apiKeys, ...keys };
  }

  // Get API key for a specific provider
  getApiKey(provider) {
    const keyMap = {
      'anthropic': this.apiKeys.ANTHROPIC_API_KEY,
      'groq': this.apiKeys.GROQ_API_KEY,
      'openai': this.apiKeys.OPENAI_API_KEY
    };
    
    const key = keyMap[provider];
    
    // Return null if key is missing, undefined, empty, or contains placeholder text
    if (!key || 
        key === 'your_anthropic_api_key_here' || 
        key === 'your_groq_api_key_here' || 
        key === 'your_openai_api_key_here' ||
        key.includes('your_') ||
        key.includes('_here') ||
        key.trim() === '') {
      return null;
    }
    
    return key;
  }

  // Set text model configuration
  setTextModel(provider, model) {
    this.textModelConfig = { provider, model };
    console.log(`📝 AI Service: Text model set to ${provider}/${model}`);
  }

  // Set image model configuration  
  setImageModel(provider, model) {
    this.imageModelConfig = { provider, model };
    console.log(`🖼️ AI Service: Image model set to ${provider}/${model}`);
  }

  // Get current text model configuration
  getTextModel() {
    return this.textModelConfig;
  }

  // Get current image model configuration
  getImageModel() {
    return this.imageModelConfig;
  }

  // Get available models by provider
  getAvailableModels() {
    return {
      anthropic: {
        text: [
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most capable model for complex reasoning' },
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'High-performance model with exceptional reasoning' },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Balanced performance and efficiency' },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest model for quick responses' }
        ],
        image: [
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Advanced vision capabilities' },
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Strong visual reasoning' },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Good vision understanding' },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast image processing' }
        ]
      },
      groq: {
        text: [
          { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B', description: 'Excellent reasoning and math capabilities' },
          { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', description: 'Versatile large model with strong performance' },
          { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', description: 'Ultra-fast responses for quick tasks' },
          { id: 'llama3-70b-8192', name: 'Llama 3 70B', description: 'Strong general purpose model' },
          { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT', description: 'Efficient instruction-tuned model' }
        ],
        image: [
          { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision', description: 'Vision-enabled Llama model' }
        ]
      },
      openai: {
        text: [
          { id: 'gpt-4o', name: 'GPT-4o', description: 'Omni-modal GPT-4 with enhanced capabilities' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Efficient version of GPT-4o' },
          { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Optimized GPT-4 with latest training' },
          { id: 'gpt-4', name: 'GPT-4', description: 'Original GPT-4 model with strong capabilities' },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and cost-effective model' }
        ],
        image: [
          { id: 'gpt-4o', name: 'GPT-4o', description: 'Advanced vision capabilities' },
          { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Strong image understanding' }
        ]
      }
    };
  }

  // Update the system prompt
  updateSystemPrompt(newPrompt) {
    this.customSystemPrompt = newPrompt;
    console.log("📝 AI Service: System prompt updated");
  }

  // Get current system prompt
  getSystemPrompt() {
    return this.customSystemPrompt || this.getDefaultSystemPrompt();
  }

  // Get the default system prompt
  getDefaultSystemPrompt() {
    return `You are an expert macOS automation assistant that converts natural language commands into executable AppleScript. You can handle complex, multi-step automation tasks for daily workflows.

CAPABILITIES & EXAMPLES:

🔹 APPLICATION CONTROL:
- "open slack" → tell application "Slack" to activate
- "quit chrome" → tell application "Google Chrome" to quit
- "minimize all windows" → tell application "System Events" to keystroke "m" using {command down, option down}

🔹 MESSAGING & COMMUNICATION:
- "message john on slack" → 
  tell application "Slack" to activate
  delay 1
  tell application "System Events"
    keystroke "k" using command down
    delay 0.5
    type text "john"
    delay 0.5
    keystroke return
  end tell

- "send email to sarah" →
  tell application "Mail" to activate
  delay 1
  tell application "System Events"
    keystroke "n" using command down
    delay 1
    type text "sarah@example.com"
    keystroke tab
    keystroke tab
    type text "Quick message"
    keystroke tab
  end tell

🔹 FILE MANAGEMENT:
- "create new folder on desktop" →
  tell application "Finder"
    activate
    set desktop_folder to desktop
    make new folder at desktop_folder with properties {name:"New Folder"}
  end tell

- "open downloads folder" → tell application "Finder" to open folder "Downloads" of home folder

🔹 DOCUMENT CREATION:
- "create new document" → tell application "TextEdit" to make new document
- "open word" → tell application "Microsoft Word" to activate
- "new powerpoint" → tell application "Microsoft PowerPoint" to make new presentation

🔹 WEB BROWSING:
- "search google for weather" →
  tell application "Safari" to activate
  delay 1
  tell application "System Events"
    keystroke "l" using command down
    delay 0.5
    type text "google.com"
    keystroke return
    delay 2
    type text "weather"
    keystroke return
  end tell

🔹 SYSTEM CONTROL:
- "turn up volume" → set volume output volume ((output volume of (get volume settings)) + 10)
- "lock screen" → tell application "System Events" to keystroke "q" using {control down, command down}
- "take screenshot" → tell application "System Events" to keystroke "3" using {command down, shift down}

🔹 CALENDAR & REMINDERS:
- "create reminder to call mom" →
  tell application "Reminders"
    activate
    tell list "Reminders"
      make new reminder with properties {name:"Call mom"}
    end tell
  end tell

🔹 ADVANCED GUI AUTOMATION:
- Use "System Events" for clicking buttons, typing text, keyboard shortcuts
- Add appropriate delays (delay 0.5 to delay 2) between actions
- Use proper element targeting: button "OK", menu item "Save", etc.

CRITICAL RULES:
1. Output ONLY the AppleScript - no explanations, no markdown
2. Use proper AppleScript syntax with tell blocks
3. Add delays between GUI actions (delay 0.5 to delay 2)
4. Handle multi-step processes logically
5. Use exact application names: "Slack", "Safari", "Google Chrome", "Microsoft Word", etc.
6. For GUI automation, always use "System Events"
7. Break complex tasks into clear steps with appropriate delays`;
  }

  // Make API request based on provider
  async makeApiRequest(provider, model, messages, maxTokens = 2048) {
    const apiKey = this.getApiKey(provider);
    if (!apiKey) {
      throw new Error(`API key not found for provider: ${provider}`);
    }

    switch (provider) {
      case 'anthropic':
        return this.makeAnthropicRequest(model, messages, maxTokens, apiKey);
      case 'groq':
        return this.makeGroqRequest(model, messages, maxTokens, apiKey);
      case 'openai':
        return this.makeOpenAIRequest(model, messages, maxTokens, apiKey);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  // Make Anthropic API request
  makeAnthropicRequest(model, messages, maxTokens, apiKey) {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    };

    const data = JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: messages,
    });

    return this.executeRequest(options, data);
  }

  // Make Groq API request
  makeGroqRequest(model, messages, maxTokens, apiKey) {
    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    };

    const data = JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: messages,
    });

    return this.executeRequest(options, data, 'groq');
  }

  // Make OpenAI API request
  makeOpenAIRequest(model, messages, maxTokens, apiKey) {
    const options = {
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    };

    const data = JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: messages,
    });

    return this.executeRequest(options, data, 'openai');
  }

  // Execute HTTP request
  executeRequest(options, data, responseFormat = 'anthropic') {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseData = "";

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          try {
            const response = JSON.parse(responseData);

            if (response.error) {
              resolve({ error: response.error.message || response.error });
            } else {
              // Parse response based on provider format
              let content;
              if (responseFormat === 'anthropic') {
                content = response.content && response.content.length > 0 
                  ? response.content[0].text 
                  : null;
              } else if (responseFormat === 'groq' || responseFormat === 'openai') {
                content = response.choices && response.choices.length > 0 
                  ? response.choices[0].message.content 
                  : null;
              }

              if (content) {
                resolve({ success: true, content: content.trim() });
              } else {
                resolve({ error: "Unexpected API response format" });
              }
            }
          } catch (error) {
            console.error("Error processing response:", error);
            resolve({
              error: `Failed to process API response: ${error.message}`,
            });
          }
        });
      });

      req.on("error", (error) => {
        console.error("Request error:", error);
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }

  async getOSAScript(transcription) {
    if (typeof transcription !== "string") {
      return { error: "Transcription must be a string" };
    }

    // Use configured text model
    const { provider, model } = this.textModelConfig;
    console.log(`🤖 Using ${provider}/${model} for OSA script generation`);

    // Use custom system prompt if available, otherwise use default
    const basePrompt = this.getSystemPrompt();
    const systemPrompt = `${basePrompt}

Current user command: "${transcription}"

Generate the AppleScript to accomplish this task:`;

    const messages = [
      { role: "user", content: systemPrompt }
    ];

    try {
      const response = await this.makeApiRequest(provider, model, messages, 2048);

      if (response.error) {
        return { error: response.error };
      }

      const script = response.content;

      // If the response starts with ERROR:, pass it through as an error
      if (script.startsWith("ERROR:")) {
        return { error: script.substring(6).trim() };
      }

      // Clean up the script and wrap it for execution
      let cleanScript = script;
      
      // Remove any markdown formatting
      cleanScript = cleanScript.replace(/```applescript\n?/g, '');
      cleanScript = cleanScript.replace(/```\n?/g, '');
      cleanScript = cleanScript.replace(/^applescript\n?/g, '');
      cleanScript = cleanScript.trim();
      
      // Ensure proper escaping for shell execution
      const escapedScript = cleanScript.replace(/'/g, "'\\''");
      const formattedScript = `osascript -e '${escapedScript}'`;

      console.log("Generated AppleScript:", cleanScript);
      console.log("Formatted command:", formattedScript);

      // Return the script as a single step
      return {
        success: true,
        steps: [
          {
            stepNumber: 1,
            script: formattedScript,
          },
        ],
      };
    } catch (error) {
      console.error("Error generating OSA script:", error);
      return { error: `Failed to generate script: ${error.message}` };
    }
  }

  // Generate a conversational text response
  async generateTextResponse(userInput) {
    const { provider, model } = this.textModelConfig;
    console.log(`🤖 Using ${provider}/${model} for text response`);

    const prompt = `You are a helpful AI assistant. Provide a conversational response to this user input: "${userInput}"`;

    const messages = [
      { role: "user", content: prompt }
    ];

    try {
      const response = await this.makeApiRequest(provider, model, messages, 1024);

      if (response.error) {
        throw new Error(response.error);
      }

      return response.content;
    } catch (error) {
      console.error("Error generating text response:", error);
      throw error;
    }
  }

  // Generate a simple response (used for classification)
  async generateResponse(prompt) {
    const { provider, model } = this.textModelConfig;
    console.log(`🤖 Using ${provider}/${model} for response generation`);

    const messages = [
      { role: "user", content: prompt }
    ];

    try {
      const response = await this.makeApiRequest(provider, model, messages, 100);

      if (response.error) {
        throw new Error(response.error);
      }

      return response.content;
    } catch (error) {
      console.error("Error generating response:", error);
      throw error;
    }
  }

  // Test all configured models
  async testAllModels() {
    const results = {
      tested: 0,
      successful: 0,
      failed: 0,
      details: []
    };

    const testPrompt = "Say 'Hello, I am working correctly!' in a brief response.";
    const availableModels = this.getAvailableModels();

    for (const [provider, modelCategories] of Object.entries(availableModels)) {
      for (const model of modelCategories.text) {
        results.tested++;
        console.log(`🧪 Testing ${provider}/${model.id}...`);

        try {
          const messages = [{ role: "user", content: testPrompt }];
          const response = await this.makeApiRequest(provider, model.id, messages, 100);

          if (response.error) {
            results.failed++;
            results.details.push({
              provider,
              model: model.id,
              status: 'failed',
              error: response.error
            });
            console.log(`❌ ${provider}/${model.id} failed: ${response.error}`);
          } else {
            results.successful++;
            results.details.push({
              provider,
              model: model.id,
              status: 'success',
              response: response.content.substring(0, 100)
            });
            console.log(`✅ ${provider}/${model.id} working`);
          }
        } catch (error) {
          results.failed++;
          results.details.push({
            provider,
            model: model.id,
            status: 'failed',
            error: error.message
          });
          console.log(`❌ ${provider}/${model.id} failed: ${error.message}`);
        }

        // Add a small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\n📊 Model Test Results:`);
    console.log(`Total Tested: ${results.tested}`);
    console.log(`Successful: ${results.successful}`);
    console.log(`Failed: ${results.failed}`);

    return results;
  }
}

module.exports = AIService;
