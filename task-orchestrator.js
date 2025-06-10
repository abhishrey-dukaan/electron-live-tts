const { exec } = require("child_process");
const AIService = require("./ai-service");
const VisualGuidance = require("./visual-guidance");
const AppDiscovery = require("./app-discovery");

class CommandClassifier {
  constructor() {
    // Local memory for command patterns
    this.taskPatterns = [
      // Action verbs that typically indicate tasks
      /^(open|launch|start|run|execute|play|pause|stop|quit|close|minimize|maximize)/i,
      /^(click|tap|press|type|enter|input)/i,
      /^(go to|navigate to|visit|browse)/i,
      /^(increase|decrease|set|adjust|change|turn)/i,
      /^(take|capture|screenshot|record)/i,
      /^(copy|paste|cut|save|delete|move)/i,
      /^(search for|find|look for)/i,
      /^(volume|brightness|sound)/i,
      /^(refresh|reload|update)/i,
      /^(hide|show|toggle)/i,
      
      // Natural language task requests
      /^(can you|could you|would you).*(open|launch|start|run|quit|close|minimize|maximize|set|adjust|increase|decrease)/i,
      /^(please).*(open|launch|start|run|quit|close|minimize|maximize|set|adjust|increase|decrease)/i,
      /(open|launch|start|run|quit|close).*(app|application|program)/i,
      /(open|launch).*(notes|slack|chrome|safari|finder|terminal|mail|messages|discord|spotify|calendar)/i,
      
      // Direct commands
      /brightness/i,
      /volume/i,
      /(spotify|music|play|pause)/i,
      /(chrome|safari|browser|firefox|arc)/i,
      /(finder|desktop|downloads|documents)/i,
      /(screenshot|screen)/i,
      /(window|minimize|close)/i,
      /(notes|slack|discord|messages|mail|calendar|terminal)/i,
      /(trash|bin)/i,
    ];
    
    this.questionPatterns = [
      // Question words
      /^(what|who|when|where|why|how|which|can you tell me|do you know)/i,
      /^(explain|describe|tell me about)/i,
      /^(is|are|was|were|will|would|could|should)/i,
      
      // Information requests
      /weather/i,
      /time|date/i,
      /^(help|assistance)/i,
      /^(definition|meaning)/i,
      /^(translate|translation)/i,
    ];
    
    this.clarificationPatterns = [
      /^(um|uh|er)/i,
      /^(wait|hold on|actually)/i,
      /^(nevermind|cancel|stop)/i,
      // Removed "can you|could you|would you" - these are often task requests
      /\?$/,  // Ends with question mark
    ];
    
    // Cache for previously classified commands
    this.classificationCache = new Map();
  }
  
  classifyCommand(input) {
    if (!input || typeof input !== 'string') {
      return { type: 'UNKNOWN', confidence: 0, reasoning: 'Invalid input' };
    }
    
    const cleanInput = input.trim().toLowerCase();
    
    // Check cache first
    if (this.classificationCache.has(cleanInput)) {
      return this.classificationCache.get(cleanInput);
    }
    
    let result;
    
    // Check for stop/cancel commands first (highest priority)
    if (/^(stop|cancel|halt|abort)/i.test(cleanInput)) {
      result = { 
        type: 'STOP_COMMAND', 
        confidence: 0.95, 
        reasoning: 'Stop/cancel keyword detected' 
      };
    }
    // Check for clear task patterns BEFORE other patterns (high priority)
    else if (this.taskPatterns.some(pattern => pattern.test(cleanInput))) {
      result = { 
        type: 'TASK_EXECUTION', 
        confidence: 0.90, 
        reasoning: 'Matches known task patterns' 
      };
    }
    // Check for clarification patterns (but only for truly ambiguous input)
    else if (this.clarificationPatterns.some(pattern => pattern.test(cleanInput)) && !this.hasActionWords(cleanInput)) {
      result = { 
        type: 'CLARIFICATION_NEEDED', 
        confidence: 0.7, 
        reasoning: 'Appears to need clarification' 
      };
    }
    // Check for question patterns
    else if (this.questionPatterns.some(pattern => pattern.test(cleanInput))) {
      result = { 
        type: 'TEXT_RESPONSE', 
        confidence: 0.8, 
        reasoning: 'Matches question patterns' 
      };
    }
    // Very short commands (likely incomplete)
    else if (cleanInput.length < 3) {
      result = { 
        type: 'CLARIFICATION_NEEDED', 
        confidence: 0.9, 
        reasoning: 'Command too short' 
      };
    }
    // Default to ambiguous if nothing matches clearly
    else {
      result = { 
        type: 'AMBIGUOUS', 
        confidence: 0.3, 
        reasoning: 'No clear pattern match' 
      };
    }
    
    // Cache the result
    this.classificationCache.set(cleanInput, result);
    
    // Limit cache size to prevent memory issues
    if (this.classificationCache.size > 1000) {
      const firstKey = this.classificationCache.keys().next().value;
      this.classificationCache.delete(firstKey);
    }
    
    return result;
  }
  
  // Add new patterns based on user feedback
  addTaskPattern(pattern) {
    this.taskPatterns.push(new RegExp(pattern, 'i'));
  }
  
  addQuestionPattern(pattern) {
    this.questionPatterns.push(new RegExp(pattern, 'i'));
  }
  
  // Check if input contains action words that suggest a task
  hasActionWords(input) {
    const actionWords = [
      'open', 'launch', 'start', 'run', 'execute', 'quit', 'close', 'minimize', 'maximize',
      'play', 'pause', 'stop', 'increase', 'decrease', 'set', 'adjust', 'take', 'capture',
      'click', 'type', 'press', 'go', 'navigate', 'visit', 'browse', 'search', 'find',
      'copy', 'paste', 'cut', 'save', 'delete', 'move', 'refresh', 'reload', 'update',
      'hide', 'show', 'toggle', 'turn'
    ];
    
    return actionWords.some(word => input.toLowerCase().includes(word));
  }

  // Clear cache (useful for testing or updates)
  clearCache() {
    this.classificationCache.clear();
  }
}

class TaskOrchestrator {
  constructor(aiService) {
    this.aiService = aiService;
    this.visualGuidance = new VisualGuidance(this.aiService.getApiKey('anthropic')); // Keep for now if visual guidance is separate
    
    // Initialize dynamic app discovery
    this.appDiscovery = new AppDiscovery();
    this.appDiscoveryReady = false;
    this.initializeAppDiscovery();
    
    // API keys are now set in main.js from .env
    
    this.isExecuting = false;
    this.currentTask = null;
    this.executionQueue = [];
    this.onStepComplete = null;
    this.onTaskComplete = null;
    this.onError = null;
    this.shouldStop = false; // Flag for cancellation
    this.currentExecution = null; // Track current execution promise
    this.notificationCallbacks = {}; // Store notification callbacks
    this.customSystemPrompt = null; // Custom system prompt for task analysis
    this.commandClassifier = new CommandClassifier(); // Local command classification
    this.historyContext = []; // Command history context for better understanding
  }

  async initializeAppDiscovery() {
    try {
      await this.appDiscovery.init();
      this.appDiscoveryReady = true;
      console.log('✅ Task Orchestrator: App discovery ready');
    } catch (err) {
      console.error('⚠️ Task Orchestrator: App discovery initialization failed:', err.message);
      this.appDiscoveryReady = false;
    }
  }

  // Set history context for better command understanding
  setHistoryContext(historyContext) {
    this.historyContext = historyContext || [];
    console.log(`📚 Task Orchestrator: History context updated with ${this.historyContext.length} commands`);
  }

  // Get formatted history context for AI prompt
  getFormattedHistoryContext() {
    if (!this.historyContext || this.historyContext.length === 0) {
      return "";
    }

    const historyText = this.historyContext.map((entry, index) => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      const status = entry.status === 'success' ? '✅' : entry.status === 'error' ? '❌' : '⏳';
      return `${index + 1}. [${timestamp}] ${status} ${entry.type === 'manual' ? '⌨️' : '🎤'} "${entry.command}"`;
    }).join('\n');

    return `\n\n📚 RECENT COMMAND HISTORY (last ${this.historyContext.length} commands):\n${historyText}\n\nUse this context to better understand the user's intent and workflow patterns.\n`;
  }

  // Update the system prompt
  updateSystemPrompt(newPrompt) {
    this.customSystemPrompt = newPrompt;
    console.log("📝 Task Orchestrator: System prompt updated");
  }

  // Get current system prompt (for task analysis)
  getSystemPrompt() {
    return this.customSystemPrompt || this.getDefaultTaskAnalysisPrompt();
  }

  // Get the default task analysis prompt
  getDefaultTaskAnalysisPrompt() {
    return `You are VoiceMac, an advanced macOS voice automation assistant. Analyze commands and break them down into atomic, sequential steps using the comprehensive action types below.

🎯 VOICEMAC ACTION TYPES & COMMANDS:

📱 KEYBOARD ACTIONS:
- Quit app: osascript -e 'tell application "System Events" to keystroke "q" using command down'
- Copy: osascript -e 'tell application "System Events" to keystroke "c" using command down'
- Paste: osascript -e 'tell application "System Events" to keystroke "v" using command down'
- Switch apps: osascript -e 'tell application "System Events" to keystroke tab using command down'
- New tab: osascript -e 'tell application "System Events" to keystroke "t" using command down'
- Close tab: osascript -e 'tell application "System Events" to keystroke "w" using command down'
- Refresh: osascript -e 'tell application "System Events" to keystroke "r" using command down'
- Find: osascript -e 'tell application "System Events" to keystroke "f" using command down'
- Enter: cliclick kp:return
- Space: cliclick kp:space
- Tab: cliclick kp:tab
- Escape: cliclick kp:esc

🖥️ APPLICATION ACTIONS:
- Launch Chrome: osascript -e 'tell application "Google Chrome" to activate' 2>/dev/null || osascript -e 'tell application "Arc" to activate' 2>/dev/null || osascript -e 'tell application "Safari" to activate'
- Quit browser: osascript -e 'tell application "Google Chrome" to quit' 2>/dev/null || osascript -e 'tell application "Arc" to quit' 2>/dev/null || osascript -e 'tell application "Safari" to quit'
- Launch Finder: osascript -e 'tell application "Finder" to activate'
- Launch Terminal: osascript -e 'tell application "Terminal" to activate'
- Launch Notes: osascript -e 'tell application "Notes" to activate'
- Launch Calendar: osascript -e 'tell application "Calendar" to activate'
- Launch Mail: osascript -e 'tell application "Mail" to activate'
- Launch Messages: osascript -e 'tell application "Messages" to activate'
- Launch Slack: osascript -e 'tell application "Slack" to activate'
- Launch Discord: osascript -e 'tell application "Discord" to activate'
- Launch Spotify: osascript -e 'tell application "Spotify" to activate'
- Launch any app: osascript -e 'tell application "AppName" to activate'
- Get running apps: osascript -e 'tell application "System Events" to get name of every application process whose visible is true'

📁 FILE ACTIONS:
- Open Downloads: open ~/Downloads
- Open Documents: open ~/Documents
- Open Desktop: open ~/Desktop
- Open specific folder: open /path/to/folder
- New Finder window: osascript -e 'tell application "System Events" to tell process "Finder" to click menu item "New Finder Window" of menu "File" of menu bar 1'

🖲️ MOUSE ACTIONS:
- Move cursor: cliclick m:x,y
- Click: cliclick c:x,y
- Double-click: cliclick dc:x,y
- Right-click: cliclick rc:x,y
- Get mouse position: cliclick p
- Move to top-left: cliclick m:0,0

🎛️ SYSTEM ACTIONS:
- Lock screen: osascript -e 'tell application "System Events" to keystroke "q" using {control down, command down}'
- Sleep display: osascript -e 'tell application "System Events" to sleep'
- Take screenshot: screencapture -x ~/Desktop/screenshot_$(date +%Y%m%d_%H%M%S).png
- List processes: ps aux

🔊 MEDIA ACTIONS:
- Volume up: osascript -e 'set volume output volume ((output volume of (get volume settings)) + 12)'
- Volume down: osascript -e 'set volume output volume ((output volume of (get volume settings)) - 12)'
- Set volume: osascript -e 'set volume output volume 50'
- Mute toggle: if osascript -e 'output muted of (get volume settings)' | grep -q 'true'; then osascript -e 'set volume without output muted'; else osascript -e 'set volume with output muted'; fi
- Play/Pause Spotify: osascript -e 'tell application "Spotify" to playpause' 2>/dev/null

💡 BRIGHTNESS ACTIONS:
- Increase brightness: cliclick kp:brightness-up
- Decrease brightness: cliclick kp:brightness-down
- Full brightness: cliclick kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-down
- Minimum brightness: cliclick kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down kp:brightness-down

🪟 WINDOW ACTIONS:
- Minimize current window: osascript -e 'tell application "System Events" to keystroke "m" using {command down}'
- Minimize Arc window: osascript -e 'tell application "Arc" to activate' && osascript -e 'tell application "System Events" to keystroke "m" using {command down}'
- Minimize Chrome window: osascript -e 'tell application "Google Chrome" to activate' && osascript -e 'tell application "System Events" to keystroke "m" using {command down}'
- Minimize Safari window: osascript -e 'tell application "Safari" to activate' && osascript -e 'tell application "System Events" to keystroke "m" using {command down}'
- Minimize any app window: osascript -e 'tell application "System Events" to keystroke "m" using {command down}'
- Get window bounds: osascript -e 'tell application "Finder" to get bounds of window of desktop'

💬 NOTIFICATION ACTIONS:
- Show notification: osascript -e 'display notification "Message" with title "Title"'

⌨️ TEXT INPUT:
- Type text: cliclick t:"Text to type"
- Wait/pause: sleep 1 (for seconds) or cliclick w:500 (for milliseconds)

🔧 SHELL COMMANDS:
- Get system info: osascript -e 'get volume settings'
- Check file: ls -la filename
- Current directory: pwd

TASK BREAKDOWN RULES:
1. Each step should be a single, atomic operation
2. Steps should be sequential and logical
3. Include appropriate delays between GUI operations (1-3 seconds)
4. Handle app activation separately from GUI operations
5. Web navigation: open browser → navigate URL → find elements → interact
6. For complex tasks, include verification steps
7. Use cliclick for precise mouse/keyboard operations
8. Use osascript for application control and system integration
9. Use shell commands for file operations and system queries
10. For window minimizing: Use Cmd+M directly - no need to exit full screen first

STEP TYPES:
- KEYBOARD: Keyboard shortcuts and text input
- APPLICATION: Launch, quit, or control applications
- FILE: File and folder operations
- SYSTEM: System-level operations (lock, sleep, screenshot)
- MOUSE: Mouse movements and clicks
- UI_ELEMENT: GUI element interactions
- NOTIFICATION: System notifications and alerts
- MEDIA: Volume, music, and media controls
- BRIGHTNESS: Display brightness control using cliclick
- WINDOW: Window management operations
- SHELL: Direct shell command execution

Example breakdown for "quit the current app and open chrome":
1. KEYBOARD: Quit current application
2. APPLICATION: Launch Chrome browser
3. WAIT: Allow Chrome to fully load

Example breakdown for "take a screenshot and open downloads folder":
1. SYSTEM: Take screenshot
2. FILE: Open Downloads folder

Example breakdown for "minimize this window" or "minimize current window":
1. WINDOW: Minimize the active window using Cmd+M

Example breakdown for "minimize arc" or "minimize arc window":
1. APPLICATION: Activate Arc browser
2. WINDOW: Minimize Arc window using Cmd+M

Example breakdown for "increase brightness to full" or "set brightness to maximum":
1. SYSTEM: Set display brightness to maximum using cliclick

Example breakdown for "open notes" or "launch notes":
1. APPLICATION: Launch Notes application

Example breakdown for "open slack" or "launch slack":
1. APPLICATION: Launch Slack application

Return ONLY a JSON response in this exact format:
{
  "success": true,
  "steps": [
    {
      "stepNumber": 1,
      "type": "KEYBOARD",
      "description": "Quit current application",
      "script": "osascript -e 'tell application \\"System Events\\" to keystroke \\"q\\" using command down'",
      "delayAfter": 1000,
      "continueOnError": false
    },
    {
      "stepNumber": 2,
      "type": "APPLICATION",
      "description": "Launch Chrome browser",
      "script": "osascript -e 'tell application \\"Google Chrome\\" to activate' 2>/dev/null || osascript -e 'tell application \\"Arc\\" to activate' 2>/dev/null || osascript -e 'tell application \\"Safari\\" to activate'",
      "delayAfter": 2000,
      "continueOnError": false
    }
  ]
}

For minimize current window commands, use this format:
{
  "success": true,
  "steps": [
    {
      "stepNumber": 1,
      "type": "WINDOW",
      "description": "Minimize the active window using Cmd+M",
      "script": "osascript -e 'tell application \\"System Events\\" to keystroke \\"m\\" using {command down}'",
      "delayAfter": 500,
      "continueOnError": false
    }
  ]
}

For minimize specific app window (e.g. Arc), use this format:
{
  "success": true,
  "steps": [
    {
      "stepNumber": 1,
      "type": "APPLICATION",
      "description": "Activate Arc browser",
      "script": "osascript -e 'tell application \\"Arc\\" to activate'",
      "delayAfter": 1000,
      "continueOnError": false
    },
    {
      "stepNumber": 2,
      "type": "WINDOW",
      "description": "Minimize Arc window using Cmd+M",
      "script": "osascript -e 'tell application \\"System Events\\" to keystroke \\"m\\" using {command down}'",
      "delayAfter": 500,
      "continueOnError": false
    }
  ]
}

For brightness control commands, use this format:
{
  "success": true,
  "steps": [
    {
      "stepNumber": 1,
      "type": "BRIGHTNESS",
      "description": "Increase display brightness to maximum",
      "script": "cliclick kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up kp:brightness-up",
      "delayAfter": 1000,
      "continueOnError": false
    }
  ]
}

For opening applications (e.g. "open notes", "launch slack"), use this format:
{
  "success": true,
  "steps": [
    {
      "stepNumber": 1,
      "type": "APPLICATION",
      "description": "Launch Notes application",
      "script": "osascript -e 'tell application \\"Notes\\" to activate'",
      "delayAfter": 2000,
      "continueOnError": false
    }
  ]}`;
  }

  // Set callback functions for event handling
  setCallbacks(onStepComplete, onTaskComplete, onError) {
    this.onStepComplete = onStepComplete;
    this.onTaskComplete = onTaskComplete;
    this.onError = onError;
  }

  // Set notification callbacks for UI feedback
  setNotificationCallbacks(callbacks) {
    this.notificationCallbacks = callbacks;
  }

  // NEW: Main entry point for all user commands.
  // This function acts as an intelligent router.
  // It first analyzes the user's intent and then routes the command accordingly.
  async handleCommand(transcript, historyContext = []) {
    this.setHistoryContext(historyContext);
    
    // First, get the intent from the AI.
    const intent = await this.getCommandIntent(transcript);

    switch (intent.type) {
      case 'TASK_EXECUTION':
        console.log(`🤖 Intent: Task Execution. Full command: "${intent.command}"`);
        return this.executeTaskDirectly(intent.command);

      case 'CONVERSATIONAL_RESPONSE':
        console.log(`🤖 Intent: Conversational Response.`);
        return this.handleTextResponse(transcript);
        
      case 'CLARIFICATION_NEEDED':
        console.log(`🤖 Intent: Clarification Needed. Question: "${intent.question}"`);
        return {
          success: true,
          type: 'CLARIFICATION_NEEDED',
          message: intent.question,
          transcript: transcript
        };
        
      case 'STOP_COMMAND':
        console.log(`🤖 Intent: Stop Command.`);
        return this.handleStopCommand(transcript);

      default:
        console.log(`🤖 Intent: Unknown. Defaulting to clarification.`);
        return this.handleClarificationRequest(transcript);
    }
  }

  // NEW: Use a fast LLM to classify intent and get details.
  async getCommandIntent(transcript) {
    const history = this.getFormattedHistoryContext();
    const prompt = `You are an expert command analyst. Your job is to analyze the user's input and determine their intent.
The user's command is: "${transcript}"
${history}

Classify the user's intent into one of the following types and provide the required information in a JSON object:
1.  **TASK_EXECUTION**: The user wants to perform a clear, actionable task on their computer.
    - If the command is complete, provide the full, normalized command.
    - Example: "open slack" -> {"type": "TASK_EXECUTION", "command": "Open the Slack application"}
2.  **CONVERSATIONAL_RESPONSE**: The user is asking a question, making a general statement, or having a conversation.
    - Example: "what's the weather like" -> {"type": "CONVERSATIONAL_RESPONSE"}
3.  **CLARIFICATION_NEEDED**: The user's command is a task, but it's incomplete or ambiguous and needs more information.
    - You MUST formulate a friendly, specific question to ask the user.
    - Example: "send an email" -> {"type": "CLARIFICATION_NEEDED", "question": "I can do that! Who should I send the email to?"}
4.  **STOP_COMMAND**: The user wants to stop or cancel the current action.
    - Example: "stop" -> {"type": "STOP_COMMAND"}

Respond with ONLY the JSON object.

User Input: "${transcript}"`;

    // Use a fast model for this classification.
    const originalTextModel = this.aiService.getTextModel();
    this.aiService.setTextModel('groq', 'llama-3.1-8b-instant');
    
    try {
      const response = await this.aiService.generateResponse(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const intent = JSON.parse(jsonMatch[0]);
        // Restore original model
        this.aiService.setTextModel(originalTextModel.provider, originalTextModel.model);
        return intent;
      }
      throw new Error("Could not parse intent from AI response.");
    } catch (error) {
      console.error("Error getting command intent:", error);
      // Restore original model
      this.aiService.setTextModel(originalTextModel.provider, originalTextModel.model);
      return { type: 'UNKNOWN', error: error.message };
    }
  }

  // Remove the old 'executeTask' and 'commandClassifier' related methods.
  // The new handleCommand is the entry point now.

  // Handle stop/cancel commands
  handleStopCommand(transcript) {
    console.log(`🛑 Stop command detected: ${transcript}`);
    return this.stop();
  }

  // Handle text responses (questions, explanations, etc.)
  async handleTextResponse(transcript) {
    console.log(`💬 Text response needed for: ${transcript}`);
    try {
      const response = await this.aiService.generateTextResponse(transcript);
      return {
        success: true,
        type: 'TEXT_RESPONSE',
        message: response,
        transcript: transcript
      };
    } catch (error) {
      return {
        success: false,
        type: 'TEXT_RESPONSE',
        message: "Sorry, I couldn't generate a response to that question.",
        error: error.message
      };
    }
  }

  // Handle clarification requests
  async handleClarificationRequest(transcript) {
    console.log(`❓ Clarification needed for: ${transcript}`);
    return {
      success: true,
      type: 'CLARIFICATION_NEEDED',
      message: "Could you please be more specific about what you'd like me to do?",
      transcript: transcript
    };
  }

  // Handle ambiguous commands by asking AI to classify
  async handleAmbiguousCommand(transcript) {
    console.log(`🤔 Ambiguous command, asking AI to classify: ${transcript}`);
    
    try {
      const aiClassification = await this.getAIClassification(transcript);
      
      if (aiClassification.type === 'TASK_EXECUTION') {
        console.log(`🎯 AI classified as task, executing: ${transcript}`);
        return this.executeTaskDirectly(transcript);
      } else if (aiClassification.type === 'TEXT_RESPONSE') {
        console.log(`💬 AI classified as question, responding: ${transcript}`);
        return this.handleTextResponse(transcript);
      } else {
        return this.handleClarificationRequest(transcript);
      }
    } catch (error) {
      console.error(`AI classification error:`, error);
      
      // Check if error is due to missing API key
      if (error.message && error.message.includes('API key not found')) {
        console.log(`🔧 No AI available, trying simple command patterns for: ${transcript}`);
        
        // Try to execute as a simple command first
        const simpleCommand = this.checkForSimpleApplicationCommand(transcript);
        if (simpleCommand) {
          console.log(`⚡ Executing as simple command without AI: ${transcript}`);
          return this.executeSimpleCommand(simpleCommand);
        }
        
        // Try some common patterns without AI
        const lowerTranscript = transcript.toLowerCase();
        if (lowerTranscript.includes('create') && lowerTranscript.includes('note')) {
          console.log(`📝 Creating note without AI classification`);
          const command = { app: 'Notes', action: 'launch', originalCommand: transcript };
          return this.executeSimpleCommand(command);
        }
        
        if (lowerTranscript.includes('search') || lowerTranscript.includes('google')) {
          console.log(`🔍 Opening browser for search without AI classification`);
          const command = { app: 'Safari', action: 'launch', originalCommand: transcript };
          return this.executeSimpleCommand(command);
        }
      }
      
      // Fallback to treating as clarification request
      return this.handleClarificationRequest(transcript);
    }
  }

  // Execute task directly (the original executeTask logic)
  async executeTaskDirectly(transcript) {
    // If currently executing, cancel it and start new task
    if (this.isExecuting) {
      console.log("🔄 Cancelling current task to start new one:", transcript);
      this.stop();
      
      // Wait a brief moment for cleanup
      await this.delay(500);
    }

    try {
      this.isExecuting = true;
      this.shouldStop = false;
      this.currentTask = transcript;

      // Check if this is a simple application command that can be executed directly
      const simpleCommand = this.checkForSimpleApplicationCommand(transcript);
      if (simpleCommand) {
        console.log(`⚡ Executing simple application command: ${transcript}`);
        const result = await this.executeSimpleCommand(simpleCommand);
        
        if (this.onTaskComplete) {
          this.onTaskComplete(result.success, result.message || result.error);
        }
        
        return result;
      }

      console.log(`🚀 Starting screenshot-driven task execution: ${transcript}`);
      
      // Check if this is a web-based task that might need a browser
      const isWebTask = this.isWebBasedTask(transcript);
      console.log(`🌐 Web-based task detected: ${isWebTask}`);
      
      // Take initial screenshot to understand current state
      console.log(`📷 Taking initial screenshot to understand current state...`);
      const initialScreenshot = await this.takeScreenshot();
      
      if (!initialScreenshot.success) {
        throw new Error(`Failed to take initial screenshot: ${initialScreenshot.error}`);
      }

      console.log(`📷 Initial screenshot captured: ${initialScreenshot.path}`);

      // If it's a web task, check if we need to open a browser first
      if (isWebTask) {
        const needsBrowser = await this.checkIfBrowserNeeded(initialScreenshot.path, transcript);
        if (needsBrowser) {
          console.log(`🌐 Opening browser first for web task...`);
          await this.openBrowserForWebTask();
          
          // Take another screenshot after opening browser
          await this.delay(3000); // Wait for browser to load
          const browserScreenshot = await this.takeScreenshot();
          if (browserScreenshot.success) {
            initialScreenshot.path = browserScreenshot.path;
            console.log(`📷 Updated screenshot after opening browser: ${browserScreenshot.path}`);
          }
        }
      }

      // Start the iterative screenshot-driven execution
      const result = await this.executeWithScreenshotIteration(transcript, initialScreenshot.path, 1);
      
      if (result.success) {
        console.log("Task completed successfully with screenshot-driven approach");
        
        if (this.onTaskComplete) {
          this.onTaskComplete(true, "Task completed successfully");
        }

        return { success: true, message: "Task completed successfully" };
      } else {
        throw new Error(result.error || "Task execution failed");
      }

    } catch (error) {
      console.error("Task execution failed:", error);
      
      if (this.onTaskComplete) {
        this.onTaskComplete(false, error.message);
      }

      return { success: false, error: error.message };
    } finally {
      this.isExecuting = false;
      this.shouldStop = false;
      this.currentTask = null;
      this.currentExecution = null;
    }
  }

  // Check for simple application commands that can be executed directly
  checkForSimpleApplicationCommand(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    // First check for dynamic app launch/quit commands
    const dynamicAppCommand = this.checkDynamicAppCommand(transcript);
    if (dynamicAppCommand) {
      return dynamicAppCommand;
    }
    
    // Fall back to static patterns for system actions and special cases
    const simplePatterns = [
      // Window management patterns
      { pattern: /(minimize|min).*(window|current|active|this)/, app: 'ActiveWindow', action: 'minimize' },
      { pattern: /(minimize|min)(?!.*all)/, app: 'ActiveWindow', action: 'minimize' },
      
      // File/folder patterns
      { pattern: /(open).*(trash|bin)/, app: 'Trash', action: 'open' },
      { pattern: /(open).*(downloads)/, app: 'Downloads', action: 'open' },
      { pattern: /(open).*(documents)/, app: 'Documents', action: 'open' },
      { pattern: /(open).*(desktop)/, app: 'Desktop', action: 'open' },
      
      // System actions
      { pattern: /(take|capture).*(screenshot|screen)/, app: 'System', action: 'screenshot' },
      { pattern: /(lock|sleep).*(screen|system)/, app: 'System', action: 'lock' },
      { pattern: /(volume|sound|vol)\s*up/, app: 'System', action: 'volume_up' },
      { pattern: /(volume|sound|vol)\s*down/, app: 'System', action: 'volume_down' },
      
      // File deletion patterns  
      { pattern: /(delete|remove).*(all\s+)?(the\s+)?screenshots?\s*(from\s+)?desktop/, app: 'System', action: 'delete_screenshots' },
      { pattern: /(clear|clean).*(desktop\s+)?screenshots?/, app: 'System', action: 'delete_screenshots' },
    ];
    
    for (const pattern of simplePatterns) {
      if (pattern.pattern.test(lowerTranscript)) {
        return {
          app: pattern.app,
          action: pattern.action,
          originalCommand: transcript
        };
      }
    }
    
    return null;
  }

  // Check for dynamic application commands using app discovery
  checkDynamicAppCommand(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    // Extract action and app name from command
    let action = null;
    let appSearch = null;
    
    // Check for open/launch patterns
    const openMatch = lowerTranscript.match(/(open|launch|start)\s+(.+)/);
    if (openMatch) {
      action = 'launch';
      appSearch = openMatch[2].trim();
    }
    
    // Check for quit/close patterns
    const quitMatch = lowerTranscript.match(/(quit|close)\s+(.+)/);
    if (quitMatch) {
      action = 'quit';
      appSearch = quitMatch[2].trim();
    }
    
    if (!action || !appSearch) {
      return null;
    }
    
    // Clean up app search term
    appSearch = appSearch
      .replace(/\b(app|application|program)\b/g, '') // Remove common suffixes
      .trim();
    
    // Try to find the app
    const foundApp = this.appDiscovery.findApp(appSearch);
    if (foundApp) {
      console.log(`🎯 Dynamic app discovery found: ${foundApp.name} for search "${appSearch}"`);
      return {
        app: foundApp.name,
        appPath: foundApp.path,
        action: action,
        originalCommand: transcript,
        isDynamic: true
      };
    }
    
    console.log(`🔍 No app found for search term: "${appSearch}"`);
    return null;
  }

  // Execute a simple command directly without screenshot analysis
  async executeSimpleCommand(command) {
    try {
      let script;
      let actionMessage;
      
      // Handle dynamic app commands
      if (command.isDynamic) {
        if (command.action === 'launch') {
          // Use the app discovery launch method for better reliability
          try {
            const app = { 
              name: command.app, 
              path: command.appPath,
              launchCommand: `open "${command.appPath}"`
            };
            const result = await this.appDiscovery.launch(app);
            return {
              success: true,
              message: `Successfully opened ${command.app}`
            };
          } catch (error) {
            // Fallback to basic osascript
            script = `osascript -e 'tell application "${command.app}" to activate'`;
            actionMessage = `Successfully opened ${command.app}`;
          }
        } else if (command.action === 'quit') {
          try {
            const app = { name: command.app };
            const result = await this.appDiscovery.quit(app);
            return {
              success: true,
              message: `Successfully quit ${command.app}`
            };
          } catch (error) {
            // Fallback to basic osascript
            script = `osascript -e 'tell application "${command.app}" to quit'`;
            actionMessage = `Successfully quit ${command.app}`;
          }
        }
      }
      // Handle static system commands
      else if (command.action === 'launch') {
        script = `osascript -e 'tell application "${command.app}" to activate'`;
        actionMessage = `Successfully opened ${command.app}`;
      } else if (command.action === 'quit') {
        script = `osascript -e 'tell application "${command.app}" to quit'`;
        actionMessage = `Successfully quit ${command.app}`;
      } else if (command.action === 'minimize') {
        script = `osascript -e 'tell application "System Events" to keystroke "m" using command down'`;
        actionMessage = `Successfully minimized active window`;
      } else if (command.action === 'screenshot') {
        script = `screencapture -x ~/Desktop/screenshot_$(date +%Y%m%d_%H%M%S).png`;
        actionMessage = `Successfully took screenshot`;
      } else if (command.action === 'lock') {
        script = `osascript -e 'tell application "System Events" to keystroke "q" using {control down, command down}'`;
        actionMessage = `Successfully locked screen`;
      } else if (command.action === 'volume_up') {
        script = `osascript -e 'set volume output volume ((output volume of (get volume settings)) + 12)'`;
        actionMessage = `Successfully increased volume`;
      } else if (command.action === 'volume_down') {
        script = `osascript -e 'set volume output volume ((output volume of (get volume settings)) - 12)'`;
        actionMessage = `Successfully decreased volume`;
      } else if (command.action === 'delete_screenshots') {
        script = `cd ~/Desktop && rm -f Screenshot*.png Screen\\ Shot*.png *screenshot*.png *Screenshot*.png 2>/dev/null || true`;
        actionMessage = `Successfully deleted all screenshots from desktop`;
      } else if (command.action === 'open') {
        if (command.app === 'Trash') {
          script = `open ~/.Trash`;
          actionMessage = `Successfully opened Trash`;
        } else if (command.app === 'Downloads') {
          script = `open ~/Downloads`;
          actionMessage = `Successfully opened Downloads folder`;
        } else if (command.app === 'Documents') {
          script = `open ~/Documents`;
          actionMessage = `Successfully opened Documents folder`;
        } else if (command.app === 'Desktop') {
          script = `open ~/Desktop`;
          actionMessage = `Successfully opened Desktop folder`;
        }
      }
      
      if (!script) {
        return { success: false, error: `Unknown command for ${command.app}` };
      }
      
      console.log(`⚡ Executing simple command: ${script}`);
      
      return new Promise((resolve) => {
        const { exec } = require("child_process");
        exec(script, (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ Simple command failed:`, error);
            resolve({ 
              success: false, 
              error: `Failed to ${command.action} ${command.app}: ${error.message}` 
            });
          } else {
            console.log(`✅ Simple command successful: ${command.action} ${command.app}`);
            resolve({ 
              success: true, 
              message: actionMessage
            });
          }
        });
      });
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Check if a task is web-based and might need a browser
  isWebBasedTask(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    // Check for explicit native app commands first (these are NOT web tasks)
    const nativeAppKeywords = [
      'notes', 'slack', 'finder', 'terminal', 'mail', 'messages', 'discord', 'spotify',
      'calendar', 'system preferences', 'settings', 'trash', 'bin'
    ];
    
    if (nativeAppKeywords.some(keyword => lowerTranscript.includes(keyword))) {
      return false;
    }
    
    // Check for web-specific keywords
    const webKeywords = [
      'youtube', 'google search', 'website', 'browser', 'chrome', 'safari', 'firefox', 'arc',
      'facebook', 'twitter', 'instagram', 'reddit', 'wikipedia', 'amazon', 'netflix',
      'video', 'watch', 'browse', 'navigate to', 'go to', 'visit', 'url', 'link', 
      'web', 'online', 'internet', '.com', '.org', '.net'
    ];
    
    return webKeywords.some(keyword => lowerTranscript.includes(keyword));
  }

  // Check if we need to open a browser by analyzing the screenshot
  async checkIfBrowserNeeded(screenshotPath, task) {
    try {
      console.log(`🔍 Checking if browser is needed for task: ${task}`);
      
      // Quick analysis to see if there's already a browser open
      const analysis = await this.quickScreenshotAnalysis(screenshotPath, 
        `Look at this screenshot. Is there a web browser (Chrome, Safari, Firefox, Arc, etc.) visible on the screen? 
        The user wants to: "${task}"
        
        Respond with just: YES (if browser is visible) or NO (if no browser visible)`);
      
      if (analysis && analysis.toLowerCase().includes('no')) {
        console.log(`🌐 No browser detected, will open one for web task`);
        return true;
      } else {
        console.log(`🌐 Browser appears to be open, proceeding with task`);
        return false;
      }
    } catch (error) {
      console.error(`⚠️ Browser check failed, assuming browser needed:`, error);
      return true; // Default to opening browser if check fails
    }
  }

  // Quick screenshot analysis for simple yes/no questions
  async quickScreenshotAnalysis(screenshotPath, question) {
    try {
      const uploadResult = await this.uploadScreenshotToCloud(screenshotPath);
      
      if (!uploadResult.success) {
        console.log(`⚠️ Cloud upload failed for quick analysis, skipping`);
        return "NO"; // Default response
      }

      try {
        // Use AI service with configured image model
        const imageSource = {
          type: 'url',
          url: uploadResult.cdnURL
        };

        const response = await this.aiService.analyzeImage(question, imageSource, 50);
        console.log(`🔍 Quick analysis result: ${response}`);
        return response;
      } catch (error) {
        console.error("Quick analysis error:", error);
        return "NO";
      }
    } catch (error) {
      console.error("Quick analysis error:", error);
      return "NO";
    }
  }

  // Open a browser for web tasks
  async openBrowserForWebTask() {
    try {
      console.log(`🌐 Opening browser for web task...`);
      
      // Try to open the user's default browser with a search page
      const browserScript = `osascript -e 'tell application "Google Chrome" to activate' 2>/dev/null || osascript -e 'tell application "Arc" to activate' 2>/dev/null || osascript -e 'tell application "Safari" to activate'`;
      
      return new Promise((resolve) => {
        const { exec } = require("child_process");
        exec(browserScript, (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ Failed to open browser:`, error);
          } else {
            console.log(`✅ Browser opened successfully`);
          }
          resolve(); // Continue regardless of browser open success
        });
      });
    } catch (error) {
      console.error(`❌ Error opening browser:`, error);
    }
  }

  // New method: Execute task with continuous screenshot analysis
  async executeWithScreenshotIteration(originalTask, screenshotPath, iterationCount) {
    const maxIterations = 15; // Prevent infinite loops
    
    console.log(`🔄 Screenshot iteration ${iterationCount}/${maxIterations} for task: ${originalTask}`);
    
    if (iterationCount > maxIterations) {
      return { 
        success: false, 
        error: `Task exceeded maximum iterations (${maxIterations}). Task may be too complex or stuck.` 
      };
    }

    // Check if task was cancelled
    if (this.shouldStop) {
      console.log("Task cancelled during screenshot iteration");
      return { success: false, error: "Task cancelled by user" };
    }

    try {
      // Analyze current state and get next steps
      console.log(`🧠 Analyzing screenshot to determine next steps (iteration ${iterationCount})...`);
      
      const analysis = await this.analyzeScreenshotForNextSteps(
        screenshotPath, 
        originalTask, 
        iterationCount
      );

      if (!analysis.success) {
        return { 
          success: false, 
          error: `Screenshot analysis failed: ${analysis.error}` 
        };
      }

      // Check if task is complete
      if (analysis.isComplete) {
        console.log(`✅ Task completed! ${analysis.explanation}`);
        return { 
          success: true, 
          message: analysis.explanation || "Task completed successfully" 
        };
      }

      // Execute the suggested next steps
      if (!analysis.nextSteps || analysis.nextSteps.length === 0) {
        return { 
          success: false, 
          error: "No next steps provided by analysis" 
        };
      }

      console.log(`🎯 Executing ${analysis.nextSteps.length} next steps...`);
      
      // Update progress callback
      if (this.onStepComplete) {
        this.onStepComplete(iterationCount, maxIterations, `Iteration ${iterationCount}: ${analysis.nextSteps[0].description}`);
      }

      // Execute each next step
      for (let i = 0; i < analysis.nextSteps.length; i++) {
        const step = analysis.nextSteps[i];
        console.log(`🎯 Executing step ${i + 1}/${analysis.nextSteps.length}: ${step.description}`);
        
        // Check for cancellation before each step
        if (this.shouldStop) {
          return { success: false, error: "Task cancelled by user" };
        }

        const result = await this.executeIterationStep(step);
        
        if (!result.success) {
          console.log(`❌ Step failed: ${result.error}`);
          if (!step.continueOnError) {
            return { 
              success: false, 
              error: `Step failed: ${step.description} - ${result.error}` 
            };
          }
        } else {
          console.log(`✅ Step completed: ${step.description}`);
        }

        // Add delay between steps
        await this.cancellableDelay(step.delayAfter || 1000);
      }

      // Wait a moment for the screen to update after actions
      await this.cancellableDelay(2000);

      // Take another screenshot to see the new state
      console.log(`📷 Taking screenshot after executing steps (iteration ${iterationCount})...`);
      const newScreenshot = await this.takeScreenshot();
      
      if (!newScreenshot.success) {
        return { 
          success: false, 
          error: `Failed to take screenshot after iteration ${iterationCount}: ${newScreenshot.error}` 
        };
      }

      // Continue with next iteration
      return this.executeWithScreenshotIteration(originalTask, newScreenshot.path, iterationCount + 1);

    } catch (error) {
      console.error(`❌ Error in screenshot iteration ${iterationCount}:`, error);
      return { 
        success: false, 
        error: `Iteration ${iterationCount} failed: ${error.message}` 
      };
    }
  }

  // Analyze screenshot and determine next steps for the task
  async analyzeScreenshotForNextSteps(screenshotPath, originalTask, iterationCount) {
    try {
      console.log(`🧠 Starting screenshot analysis for iteration ${iterationCount}`);
      console.log(`📷 Screenshot path: ${screenshotPath}`);
      
      // Check if screenshot file exists and get its size
      const fs = require('fs');
      try {
        const stats = fs.statSync(screenshotPath);
        console.log(`📏 Screenshot file size: ${stats.size} bytes`);
        if (stats.size === 0) {
          return { success: false, error: "Screenshot file is empty" };
        }
      } catch (fileError) {
        console.error(`❌ Screenshot file not found: ${fileError.message}`);
        return { success: false, error: `Screenshot file not found: ${fileError.message}` };
      }
      
      // First, upload screenshot to cloud for optimization
      const uploadResult = await this.uploadScreenshotToCloud(screenshotPath);
      
      if (!uploadResult.success) {
        console.log(`⚠️ Cloud upload failed, falling back to base64: ${uploadResult.error}`);
        return await this.analyzeScreenshotWithBase64(screenshotPath, originalTask, iterationCount);
      }
      
      console.log(`☁️ Cloud upload successful: ${uploadResult.cdnURL}`);
      
      // Notify UI that Claude analysis is starting
      if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
        this.notificationCallbacks.notifyAIAnalysis("start");
      }
      
      const analysisPrompt = `You are an expert macOS automation assistant. Look at this screenshot and help execute the task: "${originalTask}"

This is iteration ${iterationCount} of the task execution. Analyze what you see and provide the next steps.

YOUR TASK:
1. Look at the screenshot carefully
2. Understand what's currently visible on the screen
3. Determine what needs to happen next to achieve: "${originalTask}"
4. Provide specific, actionable steps using macOS automation tools

AVAILABLE TOOLS:
- cliclick c:x,y - Click at coordinates x,y
- cliclick t:"text" - Type text
- cliclick kp:return - Press Enter
- cliclick kp:tab - Press Tab
- cliclick kp:escape - Press Escape
- osascript -e 'tell application "App" to activate' - Switch to app

COMMON SCENARIOS:
- If you see a browser with address bar → click address bar, type URL, press enter
- If you see YouTube homepage → click search box, type search terms, press enter
- If you see search results → click on a video thumbnail
- If you see a video page → task might be complete
- If you see any app → determine what action is needed

COORDINATES GUIDELINES:
- Browser address bar: usually around y:60-80, x varies by screen width
- YouTube search box: usually center-top of page around y:150-200
- Video thumbnails: usually in grid layout, safe coordinates around y:300-500

Be flexible and adaptive. If you can't determine exact coordinates, make reasonable estimates based on typical UI layouts.

RESPONSE FORMAT - Return ONLY valid JSON:

If you can determine next steps:
{
  "success": true,
  "isComplete": false,
  "explanation": "I can see [describe what you see]. The next step is to [describe action].",
  "nextSteps": [
    {
      "type": "CLICK",
      "description": "Click on [element]",
      "script": "c:400,60",
      "delayAfter": 1000,
      "continueOnError": false
    }
  ]
}

If the task appears complete:
{
  "success": true,
  "isComplete": true,
  "explanation": "I can see [describe completion state]. The task '${originalTask}' is now complete."
}

If you truly cannot see anything useful (only use as last resort):
{
  "success": false,
  "error": "The screenshot appears to be [describe issue: blank, corrupted, unreadable, etc.]"
}

IMPORTANT: Always try to provide next steps even if you're not 100% certain. Make reasonable assumptions about UI element locations.`;

      console.log(`📝 ANALYSIS PROMPT FOR ITERATION ${iterationCount}:`);
      console.log(`=====================================`);
      console.log(analysisPrompt.substring(0, 500) + "...");
      console.log(`=====================================`);
      console.log(`🖼️ Screenshot URL: ${uploadResult.cdnURL}`);
      console.log(`=====================================`);

      try {
        // Use AI service with configured image model instead of hardcoded Claude
        const imageSource = {
          type: 'url',
          url: uploadResult.cdnURL
        };

        // Notify UI that analysis is starting
        if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
          this.notificationCallbacks.notifyAIAnalysis("start");
        }

        const analysisResponse = await this.aiService.analyzeImage(analysisPrompt, imageSource, 2048);
        
        console.log(`🧠 AI analysis response:`, analysisResponse.substring(0, 300) + '...');
        
        // Extract JSON from response
        const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const analysis = JSON.parse(jsonMatch[0]);
            console.log(`🧠 Screenshot analysis result:`, JSON.stringify(analysis, null, 2));
            
            // Validate the analysis result
            if (!analysis.success && !analysis.error) {
              console.warn(`⚠️ Analysis marked as unsuccessful but no error provided, treating as unable to determine steps`);
              analysis.error = "Unable to determine next steps from current screen state";
            }
            
            if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
              this.notificationCallbacks.notifyAIAnalysis("success", "Analysis completed");
            }
            
            return analysis;
          } catch (parseError) {
            console.error(`❌ JSON parsing error:`, parseError);
            const fallbackError = `Failed to parse AI response: ${parseError.message}`;
            
            if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
              this.notificationCallbacks.notifyAIAnalysis("failed", fallbackError);
            }
            
            // Try base64 fallback if parsing fails
            console.log(`🔄 Parsing failed, trying base64 fallback...`);
            return await this.analyzeScreenshotWithBase64(screenshotPath, originalTask, iterationCount);
          }
        } else {
          const fallbackError = "No valid JSON found in AI response";
          console.error(`❌ ${fallbackError}`);
          
          if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
            this.notificationCallbacks.notifyAIAnalysis("failed", fallbackError);
          }
          
          // Try base64 fallback if no JSON found
          console.log(`🔄 No JSON found, trying base64 fallback...`);
          return await this.analyzeScreenshotWithBase64(screenshotPath, originalTask, iterationCount);
        }
      } catch (error) {
        console.error(`❌ AI service error:`, error);
        const fallbackError = `AI service failed: ${error.message}`;
        
        if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
          this.notificationCallbacks.notifyAIAnalysis("failed", fallbackError);
        }
        
        // Try base64 fallback if AI service fails
        console.log(`🔄 AI service error occurred, trying base64 fallback...`);
        return await this.analyzeScreenshotWithBase64(screenshotPath, originalTask, iterationCount);
      }
    } catch (error) {
      console.error("Error in analyzeScreenshotForNextSteps:", error);
      console.log(`🔄 Outer try-catch error, trying base64 fallback...`);
      try {
        return await this.analyzeScreenshotWithBase64(screenshotPath, originalTask, iterationCount);
      } catch (fallbackError) {
        return { success: false, error: `Analysis failed: ${error.message}` };
      }
    }
  }

  // Fallback method using base64 for screenshot analysis
  async analyzeScreenshotWithBase64(screenshotPath, originalTask, iterationCount) {
    try {
      console.log(`🔄 Using base64 fallback for screenshot analysis iteration ${iterationCount}`);
      
      if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
        this.notificationCallbacks.notifyAIAnalysis("start");
      }
      
      // Read screenshot as base64
      const fs = require('fs');
      const imageBuffer = fs.readFileSync(screenshotPath);
      const base64Image = imageBuffer.toString('base64');
      
      console.log(`📊 Base64 image size: ${base64Image.length} characters`);
      
      const analysisPrompt = `You are an expert macOS automation assistant. Look at this screenshot and help execute the task: "${originalTask}"

This is iteration ${iterationCount} of the task execution. Analyze what you see and provide the next steps.

YOUR TASK:
1. Look at the screenshot carefully
2. Understand what's currently visible on the screen
3. Determine what needs to happen next to achieve: "${originalTask}"
4. Provide specific, actionable steps using macOS automation tools

AVAILABLE TOOLS:
- cliclick c:x,y - Click at coordinates x,y
- cliclick t:"text" - Type text
- cliclick kp:return - Press Enter
- cliclick kp:tab - Press Tab
- cliclick kp:escape - Press Escape
- osascript -e 'tell application "App" to activate' - Switch to app

COMMON SCENARIOS:
- If you see a browser with address bar → click address bar, type URL, press enter
- If you see YouTube homepage → click search box, type search terms, press enter
- If you see search results → click on a video thumbnail
- If you see a video page → task might be complete
- If you see any app → determine what action is needed

COORDINATES GUIDELINES:
- Browser address bar: usually around y:60-80, x varies by screen width
- YouTube search box: usually center-top of page around y:150-200
- Video thumbnails: usually in grid layout, safe coordinates around y:300-500

Be flexible and adaptive. If you can't determine exact coordinates, make reasonable estimates based on typical UI layouts.

RESPONSE FORMAT - Return ONLY valid JSON:

If you can determine next steps:
{
  "success": true,
  "isComplete": false,
  "explanation": "I can see [describe what you see]. The next step is to [describe action].",
  "nextSteps": [
    {
      "type": "CLICK",
      "description": "Click on [element]",
      "script": "c:400,60",
      "delayAfter": 1000,
      "continueOnError": false
    }
  ]
}

If the task appears complete:
{
  "success": true,
  "isComplete": true,
  "explanation": "I can see [describe completion state]. The task '${originalTask}' is now complete."
}

If you truly cannot see anything useful (only use as last resort):
{
  "success": false,
  "error": "The screenshot appears to be [describe issue: blank, corrupted, unreadable, etc.]"
}

IMPORTANT: Always try to provide next steps even if you're not 100% certain. Make reasonable assumptions about UI element locations.`;

      console.log(`📝 BASE64 ANALYSIS PROMPT FOR ITERATION ${iterationCount}:`);
      console.log(`=====================================`);
      console.log(analysisPrompt.substring(0, 500) + "...");
      console.log(`=====================================`);

      try {
        // Use AI service with configured image model instead of hardcoded Claude
        const imageSource = {
          type: 'base64',
          media_type: screenshotPath.endsWith('.jpg') || screenshotPath.endsWith('.jpeg') ? "image/jpeg" : "image/png",
          data: base64Image
        };

        const analysisResponse = await this.aiService.analyzeImage(analysisPrompt, imageSource, 2048);
        
        console.log(`🧠 AI base64 analysis response:`, analysisResponse.substring(0, 300) + '...');
        
        // Extract JSON from response
        const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const analysis = JSON.parse(jsonMatch[0]);
            console.log(`🧠 Screenshot analysis result (base64):`, JSON.stringify(analysis, null, 2));
            
            // Validate the analysis result
            if (!analysis.success && !analysis.error) {
              console.warn(`⚠️ Base64 analysis marked as unsuccessful but no error provided, treating as unable to determine steps`);
              analysis.error = "Unable to determine next steps from current screen state";
            }
            
            if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
              this.notificationCallbacks.notifyAIAnalysis("success", "Base64 analysis completed");
            }
            
            return analysis;
          } catch (parseError) {
            console.error(`❌ Failed to parse AI base64 analysis JSON:`, parseError);
            const fallbackError = `JSON parse error in base64 fallback: ${parseError.message}`;
            
            if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
              this.notificationCallbacks.notifyAIAnalysis("failed", fallbackError);
            }
            
            return { success: false, error: fallbackError };
          }
        } else {
          const fallbackError = "No JSON found in base64 response";
          console.error(`❌ ${fallbackError}`);
          
          if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
            this.notificationCallbacks.notifyAIAnalysis("failed", fallbackError);
          }
          
          return { success: false, error: fallbackError };
        }
      } catch (error) {
        console.error("Error in base64 screenshot analysis:", error);
        const fallbackError = `Base64 analysis failed: ${error.message}`;
        
        if (this.notificationCallbacks && this.notificationCallbacks.notifyAIAnalysis) {
          this.notificationCallbacks.notifyAIAnalysis("failed", fallbackError);
        }
        
        return { success: false, error: fallbackError };
      }
    } catch (error) {
      console.error("Error in base64 screenshot analysis:", error);
      return { success: false, error: error.message };
    }
  }

  // Execute an individual step from the task breakdown
  async executeIterationStep(step) {
    if (this.shouldStop) {
      throw new Error("Task cancelled by user");
    }

    console.log("🎯 Processing step:", step);
    const startTime = Date.now();

    try {
      let script = step.script || step.command;
      
      // Handle visual guidance steps properly
      if (script === "VISUAL_GUIDANCE_PLACEHOLDER" || step.type === "VISUAL_GUIDANCE") {
        console.log("🔍 Visual guidance step detected - using screenshot analysis");
        
        // Validate step has necessary information
        if (!step.description && !step.visualTask && !step.visualStep) {
          console.log("⚠️ Visual guidance step missing description, using generic fallback");
          step.description = "Perform visual guidance action";
        }
        
        // Take screenshot for visual guidance
        const screenshotResult = await this.takeScreenshot();
        if (!screenshotResult.success) {
          throw new Error(`Screenshot failed: ${screenshotResult.error}`);
        }
        
        // Use the visual task description if available, otherwise use step description
        const visualTask = step.visualTask || step.description || "Complete the visual task";
        const visualStep = step.visualStep || step.description || "Perform the required action";
        
        console.log(`🎯 Visual guidance: ${visualTask} - ${visualStep}`);
        
        // Try visual guidance with timeout and fallback
        let visualResult = null;
        try {
          // Add timeout to prevent hanging
          visualResult = await Promise.race([
            this.analyzeScreenshotForNextSteps(screenshotResult.path, visualTask, 1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Visual analysis timeout')), 60000))
          ]);
        } catch (error) {
          console.log(`⚠️ Visual guidance failed: ${error.message}, using fallback`);
          // Fallback to basic action if visual guidance fails
          return {
            success: true,
            output: `Visual guidance attempted but failed: ${error.message}. Step marked as completed.`,
            duration: Date.now() - startTime
          };
        }
        
        // Execute the suggested steps from visual analysis
        if (visualResult && visualResult.success && visualResult.nextSteps && visualResult.nextSteps.length > 0) {
          for (const visualStep of visualResult.nextSteps) {
            console.log(`🎯 Executing visual step: ${visualStep.description}`);
            
            // Validate visual step has required fields
            if (!visualStep.script) {
              console.log(`⚠️ Visual step missing script: ${JSON.stringify(visualStep)}`);
              continue;
            }
            
            // Format the script properly
            let visualScript = visualStep.script;
            if (visualScript && !visualScript.startsWith('cliclick') && 
                (visualScript.startsWith('c:') || visualScript.startsWith('m:') || 
                 visualScript.startsWith('dc:') || visualScript.startsWith('rc:'))) {
              visualScript = `cliclick ${visualScript}`;
            }
            
            // Execute the visual step with error handling
            try {
              const result = await this.executeScript(visualScript);
              if (!result.success) {
                console.warn(`⚠️ Visual step failed: ${result.error}`);
                // Continue with other steps even if one fails
              }
              
              // Add delay if specified
              if (visualStep.delayAfter) {
                await this.delay(visualStep.delayAfter);
              }
            } catch (stepError) {
              console.warn(`⚠️ Visual step execution error: ${stepError.message}`);
              // Continue with remaining steps
            }
          }
        } else if (visualResult && visualResult.isComplete) {
          console.log("🎉 Visual guidance reports task is complete");
        } else {
          console.log("⚠️ Visual guidance did not provide usable next steps");
        }
        
        return {
          success: true,
          output: `Visual guidance completed: ${step.description}`,
          duration: Date.now() - startTime
        };
      }
      
      // Regular script execution for non-visual steps
      const formattedScript = this.formatScriptForExecution(script);
      console.log("🔧 Original script:", script);
      
      if (formattedScript !== script) {
        console.log("🔧 Formatted script:", formattedScript);
      } else if (script.startsWith('cliclick') || script.startsWith('osascript') || script.startsWith('open')) {
        console.log("🔧 Command already properly formatted:", formattedScript);
      } else {
        console.log("🔧 Unrecognized command format, executing as-is:", formattedScript);
      }
      
      console.log("🎯 Final executing script:", formattedScript);
      
      const result = await this.executeScript(formattedScript);
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Step executed successfully: ${step.description}`);
        
        // Add delay if specified
        if (step.delayAfter) {
          await this.delay(step.delayAfter);
        }
        
        return {
          success: true,
          output: result.output,
          duration
        };
      } else {
        console.log(`❌ Step execution failed: ${result.error}`);
        console.log(`❌ Failed script: ${formattedScript}`);
        console.log(`❌ Exit code: ${result.exitCode}`);
        console.log(`❌ Signal: ${result.signal}`);
        console.log(`❌ Stderr: ${result.stderr}`);
        
        throw new Error(result.error);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`💥 Step execution error (${duration}ms):`, error);
      throw error;
    }
  }

  // Get AI classification for ambiguous commands
  async getAIClassification(transcript) {
    const classificationPrompt = `You are a command classifier. Classify this user input as one of:
- TASK_EXECUTION: Commands that should execute system actions (open apps, control system, navigate, etc.)
- TEXT_RESPONSE: Questions or requests that need a conversational response (weather, explanations, etc.)

User input: "${transcript}"

Respond with only: TASK_EXECUTION or TEXT_RESPONSE`;

    try {
      const response = await this.aiService.generateResponse(classificationPrompt);
      
      if (response.includes('TASK_EXECUTION')) {
        return { type: 'TASK_EXECUTION' };
      } else if (response.includes('TEXT_RESPONSE')) {
        return { type: 'TEXT_RESPONSE' };
      } else {
        return { type: 'CLARIFICATION_NEEDED' };
      }
    } catch (error) {
      console.error('AI classification error:', error);
      return { type: 'CLARIFICATION_NEEDED' };
    }
  }

  // Break down complex tasks into atomic operations
  async breakdownTask(transcript) {
    try {
      const breakdown = await this.analyzeAndBreakdown(transcript);
      return breakdown;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Analyze task and create step-by-step breakdown
  async analyzeAndBreakdown(transcript) {
    // Use custom system prompt if available, otherwise use default task analysis prompt
    const basePrompt = this.getSystemPrompt();
    const taskAnalysisPrompt = `${basePrompt}

User command: "${transcript}"

Analyze and break down this task:`;

    console.log(`📝 TASK BREAKDOWN PROMPT:`);
    console.log(`=====================================`);
    console.log(taskAnalysisPrompt);
    console.log(`=====================================`);

    try {
      const responseText = await this.aiService.generateResponse(taskAnalysisPrompt);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const breakdown = JSON.parse(jsonMatch[0]);
        // ... (rest of the processing logic)
        return breakdown;
      }
      return { success: false, error: "Could not parse task breakdown" };
    } catch (error) {
      console.error("Error during task breakdown:", error);
      return { success: false, error: error.message };
    }
  }

  // Format AppleScript for shell execution
  formatScriptForExecution(script) {
    // Add null/undefined check
    if (!script || typeof script !== 'string') {
      console.error(`❌ Invalid script provided to formatScriptForExecution: ${script}`);
      return 'osascript -e "display dialog \\"Invalid script provided\\""';
    }
    
    // Handle visual guidance placeholder - should not reach here but just in case
    if (script === "VISUAL_GUIDANCE_PLACEHOLDER") {
      console.warn(`⚠️ VISUAL_GUIDANCE_PLACEHOLDER script should be handled as visual guidance step, not AppleScript`);
      return 'osascript -e "display dialog \\"Visual guidance step should not be executed as AppleScript\\""';
    }
    
    // Check if it's already a formatted command (starts with a command)
    if (script.startsWith('osascript') || script.startsWith('cliclick') || script.startsWith('open') || script.startsWith('screencapture')) {
      return script;
    }
    
    // Check if it's a cliclick command
    if (script.startsWith('m:') || script.startsWith('c:') || script.startsWith('dc:') || script.startsWith('rc:') || 
        script.startsWith('t:') || script.startsWith('kp:')) {
      // If it's just cliclick parameters, prepend cliclick command
      if (!script.startsWith('cliclick ')) {
        return `cliclick ${script}`;
      }
      return script;
    }
    
    // Check if it's a shell command (contains shell-specific patterns)
    if (script.includes('~/') || script.includes('osascript -e ') || script.includes('ps aux') || 
        script.includes('sleep ') || script.includes('set volume') || script.includes('grep ') ||
        script.includes('&&') || script.includes('||') || script.includes('2>/dev/null')) {
      // It's a shell command, return as-is
      return script;
    }
    
    // If it contains multiple commands separated by newlines, treat as shell script
    if (script.includes('\n') && (script.includes('osascript') || script.includes('cliclick') || script.includes('open'))) {
      return script;
    }
    
    // Clean up the script for AppleScript
    let cleanScript = script.trim();
    
    // Remove markdown formatting if present
    cleanScript = cleanScript.replace(/```applescript\n?/g, '');
    cleanScript = cleanScript.replace(/```\n?/g, '');
    cleanScript = cleanScript.replace(/^applescript\n?/g, '');
    cleanScript = cleanScript.trim();
    
    // Escape single quotes for shell execution
    const escapedScript = cleanScript.replace(/'/g, "'\\''");
    
    return `osascript -e '${escapedScript}'`;
  }

  // Take a screenshot for verification
  async takeScreenshot(filename = null) {
    const screenshotFile = filename || `/tmp/screenshot_${Date.now()}.jpg`;
    
    // Notify UI that screenshot capture is starting
    if (this.notificationCallbacks && this.notificationCallbacks.notifyScreenshotCapture) {
      this.notificationCallbacks.notifyScreenshotCapture("start");
    }
    
    return new Promise((resolve) => {
      // Create JPEG screenshot directly with compression
      const command = `screencapture -x -t jpg "${screenshotFile}"`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          // Notify UI that screenshot capture failed
          if (this.notificationCallbacks && this.notificationCallbacks.notifyScreenshotCapture) {
            this.notificationCallbacks.notifyScreenshotCapture("failed", error.message);
          }
          resolve({ success: false, error: error.message });
        } else {
          // Notify UI that screenshot capture succeeded
          if (this.notificationCallbacks && this.notificationCallbacks.notifyScreenshotCapture) {
            this.notificationCallbacks.notifyScreenshotCapture("success", screenshotFile);
          }
          
          // Check file size and compress further if needed
          this.checkAndCompressScreenshot(screenshotFile).then(finalPath => {
            resolve({ success: true, path: finalPath });
          }).catch(compressError => {
            console.error("Screenshot compression failed:", compressError);
            // Fall back to original file if compression fails
            resolve({ success: true, path: screenshotFile });
          });
        }
      });
    });
  }

  // Check screenshot size and compress if too large for Claude API
  async checkAndCompressScreenshot(screenshotPath) {
    return new Promise((resolve, reject) => {
      try {
        const fs = require('fs');
        const stats = fs.statSync(screenshotPath);
        console.log(`📏 Screenshot size: ${stats.size} bytes`);
        
        // Claude API limit is 5MB, but we want to stay well under to account for base64 overhead
        const maxSizeBytes = 3 * 1024 * 1024; // 3MB limit to be safe
        
        if (stats.size <= maxSizeBytes) {
          console.log('✅ Screenshot size acceptable, no compression needed');
          resolve(screenshotPath);
          return;
        }
        
        console.log('🗜️ Screenshot too large, compressing...');
        
        // Create compressed version using sips (System Image Processing System)
        const compressedPath = screenshotPath.replace('.jpg', '_compressed.jpg');
        const compressionCommand = `sips -Z 1920 -s format jpeg -s formatOptions 60 "${screenshotPath}" --out "${compressedPath}"`;
        
        exec(compressionCommand, (error, stdout, stderr) => {
          if (error) {
            console.error('❌ Compression failed:', error);
            resolve(screenshotPath); // Return original if compression fails
          } else {
            const compressedStats = fs.statSync(compressedPath);
            console.log(`✅ Compressed screenshot: ${compressedStats.size} bytes (saved ${stats.size - compressedStats.size} bytes)`);
            
            // Remove original large file
            try {
              fs.unlinkSync(screenshotPath);
            } catch (cleanupError) {
              console.warn('⚠️ Could not clean up original screenshot:', cleanupError);
            }
            
            resolve(compressedPath);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Upload screenshot to cloud service for optimization
  async uploadScreenshotToCloud(screenshotPath) {
    try {
      const FormData = require('form-data');
      const fs = require('fs');
      const https = require('https');
      
      // Notify UI that upload is starting
      if (this.notificationCallbacks && this.notificationCallbacks.notifyCloudUpload) {
        this.notificationCallbacks.notifyCloudUpload("start");
      }
      
      const form = new FormData();
      form.append('file', fs.createReadStream(screenshotPath));
      
      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'dms.mydukaan.io',
          path: '/api/media/upload/',
          method: 'POST',
          headers: {
            'sec-ch-ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            'sec-ch-ua-mobile': '?0',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://web.mydukaan.io/',
            'x-Mode': 'seller-web',
            'sec-ch-ua-platform': '"macOS"',
            ...form.getHeaders()
          }
        };
        
        const req = https.request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          
          res.on('end', () => {
            try {
              const response = JSON.parse(responseData);
              console.log(`☁️ Cloud upload response:`, response);
              
              // Check for cdnURL in nested data structure
              const cdnURL = response.cdnURL || (response.data && response.data.cdnURL);
              
              if (cdnURL) {
                console.log(`☁️ Screenshot uploaded successfully: ${cdnURL}`);
                
                // Notify UI that upload succeeded
                if (this.notificationCallbacks && this.notificationCallbacks.notifyCloudUpload) {
                  this.notificationCallbacks.notifyCloudUpload("success", cdnURL);
                }
                
                resolve({ success: true, cdnURL: cdnURL });
              } else {
                console.error('❌ Upload failed - no CDN URL found in response:', JSON.stringify(response, null, 2));
                
                // Notify UI that upload failed
                if (this.notificationCallbacks && this.notificationCallbacks.notifyCloudUpload) {
                  this.notificationCallbacks.notifyCloudUpload("failed", "No CDN URL found in response");
                }
                
                resolve({ success: false, error: 'No CDN URL found in response' });
              }
            } catch (error) {
              console.error('❌ Failed to parse upload response:', error);
              console.error('❌ Raw response:', responseData);
              
              // Notify UI that upload failed
              if (this.notificationCallbacks && this.notificationCallbacks.notifyCloudUpload) {
                this.notificationCallbacks.notifyCloudUpload("failed", `Parse error: ${error.message}`);
              }
              
              resolve({ success: false, error: `Parse error: ${error.message}` });
            }
          });
        });
        
        req.on('error', (error) => {
          console.error('❌ Upload request error:', error);
          
          // Notify UI that upload failed
          if (this.notificationCallbacks && this.notificationCallbacks.notifyCloudUpload) {
            this.notificationCallbacks.notifyCloudUpload("failed", error.message);
          }
          
          resolve({ success: false, error: error.message });
        });
        
        form.pipe(req);
      });
    } catch (error) {
      console.error('❌ Upload setup error:', error);
      
      // Notify UI that upload failed
      if (this.notificationCallbacks && this.notificationCallbacks.notifyCloudUpload) {
        this.notificationCallbacks.notifyCloudUpload("failed", error.message);
      }
      
      return { success: false, error: error.message };
    }
  }

  // Utility function for delays
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cancellable delay that can be interrupted
  async cancellableDelay(ms) {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      
      // Check for cancellation every 100ms
      const checkInterval = setInterval(() => {
        if (this.shouldStop) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Clean up interval when timeout completes
      setTimeout(() => {
        clearInterval(checkInterval);
      }, ms);
    });
  }

  // Stop current execution
  stop() {
    const wasExecuting = this.isExecuting;
    const currentTaskName = this.currentTask;
    
    console.log("🛑 Stopping task execution");
    
    if (wasExecuting && currentTaskName) {
      console.log(`🛑 Cancelling current task: "${currentTaskName}"`);
    } else {
      console.log("🛑 No active task to cancel");
    }
    
    this.shouldStop = true;
    this.isExecuting = false;
    this.currentTask = null;
    this.executionQueue = [];
    
    if (wasExecuting && this.onTaskComplete) {
      this.onTaskComplete(false, `Task cancelled by user: "${currentTaskName}"`);
    }
    
    return {
      type: 'STOP_COMMAND_SUCCESS',
      success: true,
      wasCancelled: wasExecuting,
      cancelledTask: currentTaskName,
      message: wasExecuting ? 
        `Cancelled task: "${currentTaskName}"` : 
        "All tasks stopped."
    };
  }

  // Get current status
  getStatus() {
    return {
      isExecuting: this.isExecuting,
      currentTask: this.currentTask,
      queueLength: this.executionQueue.length,
      canBeCancelled: this.isExecuting
    };
  }

  // Execute a script with proper error handling
  async executeScript(script) {
    if (!script || typeof script !== 'string') {
      return {
        success: false,
        error: 'Invalid script provided',
        exitCode: -1
      };
    }

    return new Promise((resolve) => {
      const { exec } = require("child_process");
      
      exec(script, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message,
            exitCode: error.code,
            signal: error.signal,
            stderr: stderr,
            stdout: stdout
          });
        } else {
          resolve({
            success: true,
            output: stdout || stderr || "Command executed successfully",
            stdout: stdout,
            stderr: stderr
          });
        }
      });
    });
  }

  // Build analysis prompt for screenshot
  buildAnalysisPrompt(originalTask, iterationCount, screenshotURL = null) {
    return `You are an expert macOS automation assistant. Look at this screenshot and help execute the task: "${originalTask}"

This is iteration ${iterationCount} of the task execution. Analyze what you see and provide the next steps.

YOUR TASK:
1. Look at the screenshot carefully
2. Understand what's currently visible on the screen
3. Determine what needs to happen next to achieve: "${originalTask}"
4. Provide specific, actionable steps using macOS automation tools

AVAILABLE TOOLS:
- cliclick c:x,y - Click at coordinates x,y
- cliclick t:"text" - Type text
- cliclick kp:return - Press Enter
- cliclick kp:tab - Press Tab
- cliclick kp:escape - Press Escape
- osascript -e 'tell application "App" to activate' - Switch to app

COMMON SCENARIOS:
- If you see a browser with address bar → click address bar, type URL, press enter
- If you see YouTube homepage → click search box, type search terms, press enter
- If you see search results → click on a video thumbnail
- If you see a video page → task might be complete
- If you see any app → determine what action is needed

COORDINATES GUIDELINES:
- Browser address bar: usually around y:60-80, x varies by screen width
- YouTube search box: usually center-top of page around y:150-200
- Video thumbnails: usually in grid layout, safe coordinates around y:300-500

Be flexible and adaptive. If you can't determine exact coordinates, make reasonable estimates based on typical UI layouts.

RESPONSE FORMAT - Return ONLY valid JSON:

If you can determine next steps:
{
  "success": true,
  "isComplete": false,
  "explanation": "I can see [describe what you see]. The next step is to [describe action].",
  "nextSteps": [
    {
      "type": "CLICK",
      "description": "Click on [element]",
      "script": "c:400,60",
      "delayAfter": 1000,
      "continueOnError": false
    }
  ]
}

If the task appears complete:
{
  "success": true,
  "isComplete": true,
  "explanation": "I can see [describe completion state]. The task '${originalTask}' is now complete."
}

If you truly cannot see anything useful (only use as last resort):
{
  "success": false,
  "error": "The screenshot appears to be [describe issue: blank, corrupted, unreadable, etc.]"
}

IMPORTANT: Always try to provide next steps even if you're not 100% certain. Make reasonable assumptions about UI element locations.`;
  }
}

module.exports = TaskOrchestrator; 