const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const FormData = require('form-data');
const WebAutomation = require('./web-automation');

class CommandClassifier {
  constructor() {
    this.taskPatterns = [
      // Application patterns  
      /^(open|launch|start|activate)\s+(.*)/i,
      /^(quit|close|exit)\s+(.*)/i,
      /^(switch to|go to)\s+(.*)/i,
      
      // Web patterns
      /^(search|google|find)\s+(.*)/i,
      /^(navigate to|go to|visit)\s+(.*)/i,
      /^(open|play)\s+.*\s+(youtube|video)/i,
      
      // System patterns
      /^(take|capture)\s+(screenshot|photo)/i,
      /^(lock|secure)\s+(screen|computer)/i,
      /^(turn|set)\s+(volume|sound)/i,
      /^(create|make)\s+(folder|directory)/i,
      /^(open|show)\s+(finder|files)/i,
      
      // Note/reminder patterns
      /^(create|make|new)\s+(note|reminder)/i,
      /^(add|set)\s+(reminder|note)/i,
      
      // Media patterns
      /^(play|pause|stop)\s+(music|song|video)/i,
      /^(next|previous)\s+(song|track)/i
    ];

    this.questionPatterns = [
      /^(what|how|when|where|why|who)/i,
      /^(can you|could you|will you)/i,
      /^(tell me|show me|explain)/i,
      /\?$/
    ];

    this.cache = new Map();
  }

  classifyCommand(input) {
    if (!input || typeof input !== 'string') {
      return { type: 'CLARIFICATION', confidence: 0 };
    }

    const normalizedInput = input.trim().toLowerCase();
    
    if (this.cache.has(normalizedInput)) {
      return this.cache.get(normalizedInput);
    }

    let taskConfidence = 0;
    let questionConfidence = 0;

    // Check task patterns
    for (const pattern of this.taskPatterns) {
      if (pattern.test(normalizedInput)) {
        taskConfidence = Math.max(taskConfidence, 0.9);
        break;
      }
    }

    // Check for action words
    if (this.hasActionWords(normalizedInput)) {
      taskConfidence = Math.max(taskConfidence, 0.7);
    }

    // Check question patterns  
    for (const pattern of this.questionPatterns) {
      if (pattern.test(normalizedInput)) {
        questionConfidence = Math.max(questionConfidence, 0.8);
        break;
      }
    }

    let result;
    if (taskConfidence > questionConfidence && taskConfidence > 0.6) {
      result = { type: 'TASK_EXECUTION', confidence: taskConfidence };
    } else if (questionConfidence > 0.6) {
      result = { type: 'TEXT_RESPONSE', confidence: questionConfidence };
    } else {
      result = { type: 'AMBIGUOUS', confidence: Math.max(taskConfidence, questionConfidence) };
    }

    this.cache.set(normalizedInput, result);
    return result;
  }

  addTaskPattern(pattern) {
    this.taskPatterns.push(pattern);
  }

  addQuestionPattern(pattern) {
    this.questionPatterns.push(pattern);
  }

  hasActionWords(input) {
    const actionWords = [
      'open', 'close', 'start', 'stop', 'create', 'delete', 'move', 'copy',
      'send', 'call', 'message', 'email', 'search', 'find', 'play', 'pause',
      'take', 'capture', 'save', 'export', 'import', 'download', 'upload',
      'lock', 'unlock', 'turn', 'set', 'change', 'switch', 'go', 'navigate'
    ];
    
    return actionWords.some(word => input.includes(word));
  }

  clearCache() {
    this.cache.clear();
  }
}

class TaskOrchestrator {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.currentTask = null;
    this.isExecuting = false;
    this.shouldStop = false;
    this.currentExecution = null;
    this.onStepComplete = null;
    this.onTaskComplete = null;
    this.onError = null;
    this.notificationCallbacks = null;
    this.classifier = new CommandClassifier();
    this.historyContext = [];
    
    // Web automation instance
    this.webAutomation = new WebAutomation();
  }

  setHistoryContext(historyContext) {
    this.historyContext = historyContext || [];
    console.log(`📚 Task Orchestrator: History context updated with ${this.historyContext.length} commands`);
  }

  getFormattedHistoryContext() {
    if (!this.historyContext || this.historyContext.length === 0) {
      return "No previous commands in history.";
    }

    const recentCommands = this.historyContext.slice(-5);
    const formatted = recentCommands.map((cmd, index) => {
      const timestamp = new Date(cmd.timestamp || Date.now()).toLocaleTimeString();
      return `${index + 1}. [${timestamp}] "${cmd.command}" - ${cmd.success ? 'Success' : 'Failed'}`;
    }).join('\n');

    return `Recent command history:\n${formatted}`;
  }

  updateSystemPrompt(newPrompt) {
    this.customSystemPrompt = newPrompt;
    console.log("📝 Task Orchestrator: System prompt updated");
  }

  getSystemPrompt() {
    return this.customSystemPrompt || this.getDefaultTaskAnalysisPrompt();
  }

  getDefaultTaskAnalysisPrompt() {
    return `You are an expert macOS automation assistant. Analyze user commands and break them into simple, executable steps.

For each task, provide a JSON response with:
1. "steps" array - each step should be simple and actionable
2. "type" - either "application", "web", "system", or "complex"
3. "description" - brief explanation of what will be done

Web tasks should use browser automation. System tasks use AppleScript/shell commands.

Examples:
- "open youtube" → {"type": "web", "steps": ["Open browser", "Navigate to youtube.com"], "description": "Opening YouTube in browser"}
- "quit slack" → {"type": "application", "steps": ["Quit Slack application"], "description": "Closing Slack"}
- "take screenshot" → {"type": "system", "steps": ["Capture screen"], "description": "Taking screenshot"}

Be concise and practical.`;
  }

  setCallbacks(onStepComplete, onTaskComplete, onError) {
    this.onStepComplete = onStepComplete;
    this.onTaskComplete = onTaskComplete;
    this.onError = onError;
  }

  setNotificationCallbacks(callbacks) {
    this.notificationCallbacks = callbacks;
  }

  async executeTask(transcript) {
    console.log(`📥 Task received: "${transcript}"`);
    
    // Classify the command using simple pattern matching
    const classification = this.classifier.classifyCommand(transcript);
    console.log(`🔍 Command classification: ${classification.type} (confidence: ${classification.confidence}) - ${this.getClassificationReason(classification, transcript)}`);

    if (classification.type === 'TASK_EXECUTION') {
      return this.executeTaskDirectly(transcript);
    } else if (classification.type === 'TEXT_RESPONSE') {
      return this.handleTextResponse(transcript);
    } else {
      return this.handleAmbiguousCommand(transcript);
    }
  }

  getClassificationReason(classification, transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    if (classification.type === 'TASK_EXECUTION') {
      if (lowerTranscript.includes('open') || lowerTranscript.includes('launch')) {
        return 'Contains application launch keywords';
      } else if (lowerTranscript.includes('quit') || lowerTranscript.includes('close')) {
        return 'Contains application close keywords';
      } else if (lowerTranscript.includes('youtube') || lowerTranscript.includes('search')) {
        return 'Web-based task detected';
      } else {
        return 'Matches known task patterns';
      }
    } else if (classification.type === 'TEXT_RESPONSE') {
      return 'Question pattern detected';
    } else {
      return 'No clear pattern match';
    }
  }

  handleStopCommand(transcript) {
    console.log(`🛑 Stop command received: ${transcript}`);
    this.stop();
    return { success: true, message: "Task execution stopped" };
  }

  async handleTextResponse(transcript) {
    console.log(`💬 Handling text response for: ${transcript}`);
    
    // Simple fallback responses without AI
    const lowerTranscript = transcript.toLowerCase();
    
    if (lowerTranscript.includes('time')) {
      const currentTime = new Date().toLocaleTimeString();
      return { success: true, message: `The current time is ${currentTime}` };
    } else if (lowerTranscript.includes('date')) {
      const currentDate = new Date().toLocaleDateString();
      return { success: true, message: `Today's date is ${currentDate}` };
    } else {
      return { 
        success: true, 
        message: `I heard "${transcript}" but I'm not sure how to answer that. Try asking about the time or date, or give me a task to perform.`,
        clarificationNeeded: true 
      };
    }
  }

  async handleClarificationRequest(transcript) {
    console.log(`🤔 Clarification needed for: ${transcript}`);
    return {
      success: true,
      message: `I heard "${transcript}" but I'm not sure how to help. Try commands like "open slack", "quit chrome", "search for cats", or "take screenshot".`,
      clarificationNeeded: true
    };
  }

  // Handle ambiguous commands by trying simple patterns first, then AI if available
  async handleAmbiguousCommand(transcript) {
    console.log(`🤔 Ambiguous command, trying simple patterns first: ${transcript}`);
    
    // First try simple command patterns without AI
    const simpleCommand = this.checkForSimpleApplicationCommand(transcript);
    if (simpleCommand) {
      console.log(`⚡ Executing as simple command without AI: ${transcript}`);
      return this.executeSimpleCommand(simpleCommand);
    }
    
    // Try more pattern matching without AI
    const lowerTranscript = transcript.toLowerCase();
    
    // Web patterns - use Playwright
    if (lowerTranscript.includes('youtube') || lowerTranscript.includes('search') || lowerTranscript.includes('google')) {
      console.log(`🌐 Web task detected, using Playwright: ${transcript}`);
      
      if (lowerTranscript.includes('youtube')) {
        return this.webAutomation.executeYouTubeTask(transcript, this.onStepComplete);
      } else {
        return this.webAutomation.executeSearchTask(transcript, this.onStepComplete);
      }
    }
    
    // Note creation patterns
    if (lowerTranscript.includes('create') && (lowerTranscript.includes('note') || lowerTranscript.includes('reminder'))) {
      console.log(`📝 Creating note/reminder without AI classification`);
      const command = { app: 'Notes', action: 'launch', originalCommand: transcript };
      return this.executeSimpleCommand(command);
    }
    
    // File/folder operations
    if (lowerTranscript.includes('create') && lowerTranscript.includes('folder')) {
      console.log(`📁 Creating folder without AI classification`);
      return this.executeCreateFolder(transcript);
    }
    
    // Volume control
    if (lowerTranscript.includes('volume') || lowerTranscript.includes('sound')) {
      console.log(`🔊 Volume control without AI classification`);
      return this.executeVolumeControl(transcript);
    }
    
    // Screenshot
    if (lowerTranscript.includes('screenshot') || lowerTranscript.includes('capture')) {
      console.log(`📸 Taking screenshot without AI classification`);
      return this.executeScreenshot(transcript);
    }
    
    // Lock screen
    if (lowerTranscript.includes('lock')) {
      console.log(`🔒 Locking screen without AI classification`);
      return this.executeLockScreen(transcript);
    }
    
    // If no patterns match, provide helpful guidance
    console.log(`💬 No pattern matched, providing guidance for: ${transcript}`);
    return {
      success: true,
      message: `I heard "${transcript}" but I'm not sure how to help with that. Try simpler commands like "open slack", "quit chrome", "search for cats", "take screenshot", or "lock screen".`,
      clarificationNeeded: true
    };
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

    // Set up 15-second timeout
    const TASK_TIMEOUT_MS = 15000;
    let timeoutId;
    let isTimedOut = false;

    try {
      this.isExecuting = true;
      this.shouldStop = false;
      this.currentTask = transcript;

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(async () => {
          isTimedOut = true;
          console.log(`⏰ Task timeout (15s) - cancelling: ${transcript}`);
          this.stop();
          
          // Clean up Playwright browser if it was initialized during this task
          if (this.browser && this.isWebBasedTask(transcript)) {
            try {
              console.log('🎭 Cleaning up Playwright browser due to timeout...');
              await this.cleanup();
            } catch (cleanupError) {
              console.error('Error cleaning up browser:', cleanupError);
            }
          }
          
          reject(new Error(`Task timeout: "${transcript}" took longer than 15 seconds to complete`));
        }, TASK_TIMEOUT_MS);
      });

      // Create task execution promise
      const taskPromise = (async () => {
        // Check if this is a simple application command that can be executed directly
        const simpleCommand = this.checkForSimpleApplicationCommand(transcript);
        if (simpleCommand) {
          console.log(`⚡ Executing simple application command: ${transcript}`);
          return await this.executeSimpleCommand(simpleCommand);
        }

        // Check if this is a web task - use Playwright
        if (this.isWebBasedTask(transcript)) {
          console.log(`🌐 Web task detected, using Playwright: ${transcript}`);
          return await this.executeWebTaskWithPlaywright(transcript);
        }

        console.log(`🚀 Starting basic task execution: ${transcript}`);
        
        // For other tasks, try simple system commands
        return await this.executeBasicSystemCommand(transcript);
      })();

      // Race between task execution and timeout
      const result = await Promise.race([taskPromise, timeoutPromise]);

      // Clear timeout if task completed before timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Call completion callback
      if (this.onTaskComplete && !isTimedOut) {
        this.onTaskComplete(result.success, result.message || result.error);
      }

      return result;

    } catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const errorMessage = isTimedOut ? 
        `⏰ Task timeout: "${transcript}" was cancelled after 15 seconds` : 
        error.message;

      console.error("Task execution failed:", errorMessage);
      
      if (this.onTaskComplete) {
        this.onTaskComplete(false, errorMessage);
      }

      return { success: false, error: errorMessage };
    } finally {
      // Ensure timeout is always cleared
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      this.isExecuting = false;
      this.shouldStop = false;
      this.currentTask = null;
      this.currentExecution = null;
    }
  }

  // Check for simple application commands that can be executed directly
  checkForSimpleApplicationCommand(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    // Application launch patterns
    const appLaunchPatterns = [
      { pattern: /(open|launch|start).*(notes|note)/, app: 'Notes', action: 'launch' },
      { pattern: /(open|launch|start).*(slack)/, app: 'Slack', action: 'launch' },
      { pattern: /(open|launch|start).*(finder)/, app: 'Finder', action: 'launch' },
      { pattern: /(open|launch|start).*(terminal)/, app: 'Terminal', action: 'launch' },
      { pattern: /(open|launch|start).*(mail)/, app: 'Mail', action: 'launch' },
      { pattern: /(open|launch|start).*(messages)/, app: 'Messages', action: 'launch' },
      { pattern: /(open|launch|start).*(discord)/, app: 'Discord', action: 'launch' },
      { pattern: /(open|launch|start).*(spotify)/, app: 'Spotify', action: 'launch' },
      { pattern: /(open|launch|start).*(calendar)/, app: 'Calendar', action: 'launch' },
      { pattern: /(open|launch|start).*(chrome)/, app: 'Google Chrome', action: 'launch' },
      { pattern: /(open|launch|start).*(safari)/, app: 'Safari', action: 'launch' },
      { pattern: /(open|launch|start).*(arc)/, app: 'Arc', action: 'launch' },
      
      // Quit patterns
      { pattern: /(quit|close).*(notes|note)/, app: 'Notes', action: 'quit' },
      { pattern: /(quit|close).*(slack)/, app: 'Slack', action: 'quit' },
      { pattern: /(quit|close).*(finder)/, app: 'Finder', action: 'quit' },
      { pattern: /(quit|close).*(terminal)/, app: 'Terminal', action: 'quit' },
      { pattern: /(quit|close).*(mail)/, app: 'Mail', action: 'quit' },
      { pattern: /(quit|close).*(messages)/, app: 'Messages', action: 'quit' },
      { pattern: /(quit|close).*(discord)/, app: 'Discord', action: 'quit' },
      { pattern: /(quit|close).*(spotify)/, app: 'Spotify', action: 'quit' },
      { pattern: /(quit|close).*(calendar)/, app: 'Calendar', action: 'quit' },
      { pattern: /(quit|close).*(chrome)/, app: 'Google Chrome', action: 'quit' },
      { pattern: /(quit|close).*(safari)/, app: 'Safari', action: 'quit' },
      { pattern: /(quit|close).*(arc)/, app: 'Arc', action: 'quit' },
      
      // File/folder patterns
      { pattern: /(open).*(trash|bin)/, app: 'Trash', action: 'open' },
      { pattern: /(open).*(downloads)/, app: 'Downloads', action: 'open' },
      { pattern: /(open).*(documents)/, app: 'Documents', action: 'open' },
      { pattern: /(open).*(desktop)/, app: 'Desktop', action: 'open' },
    ];
    
    for (const pattern of appLaunchPatterns) {
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

  // Helper functions for simple system commands
  async executeCreateFolder(transcript) {
    // Extract folder name from the command
    const folderNameMatch = transcript.match(/create (?:a )?folder (?:named |called )?["']?([^"']+)["']?/i);
    if (!folderNameMatch) {
      return {
        success: false,
        error: "Could not determine folder name from command. Please specify a name like 'create folder named MyFolder'"
      };
    }
    
    const folderName = folderNameMatch[1].trim();
    const script = `osascript -e 'tell application "Finder" to make new folder at desktop with properties {name:"${folderName}"}'`;
    const result = await this.executeShellCommand(script);
    return {
      success: result.success,
      message: result.success ? `Created folder "${folderName}" on desktop` : result.error
    };
  }

  async executeVolumeControl(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    let script;
    
    if (lowerTranscript.includes('up') || lowerTranscript.includes('increase')) {
      script = `osascript -e 'set volume output volume ((output volume of (get volume settings)) + 10)'`;
    } else if (lowerTranscript.includes('down') || lowerTranscript.includes('decrease')) {
      script = `osascript -e 'set volume output volume ((output volume of (get volume settings)) - 10)'`;
    } else if (lowerTranscript.includes('mute')) {
      script = `osascript -e 'set volume with output muted'`;
    } else {
      script = `osascript -e 'set volume output volume 50'`;
    }
    
    const result = await this.executeShellCommand(script);
    return {
      success: result.success,
      message: result.success ? "Volume adjusted" : result.error
    };
  }

  async executeScreenshot(transcript) {
    const script = `osascript -e 'tell application "System Events" to keystroke "3" using {command down, shift down}'`;
    const result = await this.executeShellCommand(script);
    return {
      success: result.success,
      message: result.success ? "Screenshot taken" : result.error
    };
  }

  async executeLockScreen(transcript) {
    const script = `osascript -e 'tell application "System Events" to keystroke "q" using {control down, command down}'`;
    const result = await this.executeShellCommand(script);
    return {
      success: result.success,
      message: result.success ? "Screen locked" : result.error
    };
  }

  // Execute a simple command directly without screenshot analysis
  async executeSimpleCommand(command) {
    try {
      console.log(`⚡ Executing simple command: ${command.action} ${command.app}`);
      
      let script;
      if (command.action === 'launch') {
        // Enhanced activation script that handles minimized windows
        script = `osascript -e '
          tell application "${command.app}"
            activate
            if it is running then
              tell application "System Events"
                set frontmost of process "${command.app}" to true
              end tell
            end if
          end tell'`;
      } else if (command.action === 'quit') {
        script = `osascript -e 'tell application "${command.app}" to quit'`;
      } else if (command.action === 'open') {
        // For folder/file operations
        if (command.app === 'Downloads') {
          script = `osascript -e 'tell application "Finder" to open folder "Downloads" of home folder'`;
        } else if (command.app === 'Documents') {
          script = `osascript -e 'tell application "Finder" to open folder "Documents" of home folder'`;
        } else if (command.app === 'Desktop') {
          script = `osascript -e 'tell application "Finder" to open desktop'`;
        } else if (command.app === 'Trash') {
          script = `osascript -e 'tell application "Finder" to open trash'`;
        }
      }
      
      if (!script) {
        return { success: false, error: `Unknown action: ${command.action} for ${command.app}` };
      }
      
      const result = await this.executeShellCommand(script);
      
      if (result.success) {
        const actionText = command.action === 'launch' ? 'launch' : command.action;
        return { 
          success: true, 
          message: `Successfully ${actionText}ed ${command.app}` 
        };
      } else {
        return { 
          success: false, 
          error: `Failed to ${command.action} ${command.app}: ${result.error}` 
        };
      }
    } catch (error) {
      console.error(`Error executing simple command:`, error);
      return { success: false, error: error.message };
    }
  }

  // NEW: Web task execution with Playwright
  async executeWebTaskWithPlaywright(transcript) {
    console.log(`🌐 Executing web task with Playwright: ${transcript}`);
    
    try {
      // Initialize Playwright if needed
      if (!this.browser) {
        await this.initializePlaywright();
      }
      
      // Generate steps based on the task
      const steps = await this.generateWebTaskSteps(transcript);
      console.log(`🌐 Executing web task ${steps.type} with ${steps.steps.length} steps`);
      
      // Execute each step
      for (let i = 0; i < steps.steps.length; i++) {
        const step = steps.steps[i];
        const stepNumber = i + 1;
        
        // Notify about step execution
        if (this.onStepComplete) {
          this.onStepComplete({
            stepNumber,
            totalSteps: steps.steps.length,
            description: step
          });
        }
        
        // Execute the step
        await this.executeIterationStep(step, stepNumber, steps.steps.length);
        
        // Check if we should stop
        if (this.shouldStop) {
          console.log('🛑 Web task execution stopped by request');
          break;
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ Web task execution error:', error);
      throw error;
    }
  }

  // Execute a single step in a task iteration
  async executeIterationStep(step, currentStep, totalSteps) {
    console.log(`📋 Executing step ${currentStep}/${totalSteps}: ${step}`);
    
    try {
      const page = await this.browser.newPage();
      
      switch (step.toLowerCase()) {
        case 'open safari browser':
        case 'open browser':
          // Browser is already open via Playwright
          await this.delay(1000); // Simulate browser opening
          break;
          
        case 'navigate to youtube':
        case 'go to youtube':
          await page.goto('https://www.youtube.com');
          await page.waitForLoadState('networkidle');
          break;
          
        case 'search for the requested video':
          const searchQuery = this.extractSearchTerms(this.currentTask);
          await page.fill('input#search', searchQuery);
          await page.press('input#search', 'Enter');
          await page.waitForLoadState('networkidle');
          break;
          
        case 'select the appropriate video':
          await page.click('ytd-video-renderer:first-child');
          await page.waitForLoadState('networkidle');
          break;
          
        case 'start playback':
          await page.click('.ytp-play-button');
          await this.delay(2000); // Wait for playback to start
          break;
          
        default:
          if (step.startsWith('navigate to ')) {
            const url = step.replace('navigate to ', '').trim();
            await page.goto(url.startsWith('http') ? url : `https://${url}`);
            await page.waitForLoadState('networkidle');
          } else {
            console.warn(`⚠️ Unknown step: ${step}`);
          }
      }
      
      // Take screenshot after each step for verification
      await page.screenshot({ 
        path: `step-${currentStep}-screenshot.png`,
        fullPage: true 
      });
      
      await page.close();
      
    } catch (error) {
      console.error(`❌ Step execution error: ${error.message}`);
      throw error;
    }
  }

  // Helper function to generate web task steps
  async generateWebTaskSteps(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    if (lowerTranscript.includes('youtube') || lowerTranscript.includes('play') && lowerTranscript.includes('video')) {
      return {
        type: 'youtube_search',
        steps: [
          'Open Safari browser',
          'Navigate to YouTube',
          'Search for the requested video',
          'Select the appropriate video',
          'Start playback'
        ]
      };
    }
    
    if (lowerTranscript.includes('search') || lowerTranscript.includes('google')) {
      return {
        type: 'web_search',
        steps: [
          'Open Safari browser',
          'Navigate to Google',
          'Enter search query',
          'Press search button'
        ]
      };
    }
    
    // Default web navigation
    const url = this.extractUrl(transcript);
    return {
      type: 'web_navigation',
      steps: [
        'Open Safari browser',
        `Navigate to ${url}`
      ]
    };
  }

  // Helper to extract URL from transcript
  extractUrl(transcript) {
    const urlMatch = transcript.match(/(?:go to|open|navigate to|visit)\s+(?:https?:\/\/)?([^\s]+)/i);
    if (urlMatch) {
      return urlMatch[1];
    }
    return 'google.com'; // Default fallback
  }

  async initializePlaywright() {
    if (!this.playwright) {
      console.log('🎭 Initializing Playwright...');
      this.playwright = require('playwright');
      this.browser = await this.playwright.chromium.launch({ 
        headless: false, // Keep visible for user feedback
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.page = await this.browser.newPage();
      console.log('✅ Playwright initialized successfully');
    }
  }

  async executeYouTubeTask(transcript) {
    try {
      const steps = [
        "Open web browser",
        "Navigate to YouTube", 
        "Search for the requested video",
        "Select the appropriate video",
        "Start playback"
      ];
      
      // Step 1: Open browser (already done in initialization)
      if (this.onStepComplete) {
        this.onStepComplete(steps[0], "completed");
        this.onStepComplete(steps[1], "active");
      }
      
      // Step 2: Navigate to YouTube
      console.log('🌐 Navigating to YouTube...');
      await this.page.goto('https://youtube.com');
      await this.page.waitForLoadState('networkidle');
      
      if (this.onStepComplete) {
        this.onStepComplete(steps[1], "completed");
        this.onStepComplete(steps[2], "active");
      }
      
      // Step 3: Extract search terms from transcript
      const searchTerms = this.extractSearchTerms(transcript);
      console.log(`🔍 Searching for: ${searchTerms}`);
      
      // Find and click search box
      const searchBox = await this.page.locator('input[name="search_query"]').first();
      await searchBox.click();
      await searchBox.fill(searchTerms);
      await searchBox.press('Enter');
      
      // Wait for search results
      await this.page.waitForSelector('#contents ytd-video-renderer', { timeout: 10000 });
      
      if (this.onStepComplete) {
        this.onStepComplete(steps[2], "completed");
        this.onStepComplete(steps[3], "active");
      }
      
      // Step 4: Click first video
      console.log('▶️ Selecting first video...');
      const firstVideo = await this.page.locator('#contents ytd-video-renderer').first();
      await firstVideo.click();
      
      // Wait for video to load
      await this.page.waitForSelector('video', { timeout: 15000 });
      
      if (this.onStepComplete) {
        this.onStepComplete(steps[3], "completed");
        this.onStepComplete(steps[4], "active");
      }
      
      // Step 5: Ensure video starts playing
      await this.delay(2000);
      
      if (this.onStepComplete) {
        this.onStepComplete(steps[4], "completed");
      }
      
      console.log('✅ YouTube video playing successfully');
      return { 
        success: true, 
        message: `Successfully opened YouTube and started playing video for: ${searchTerms}` 
      };
      
    } catch (error) {
      console.error('YouTube task failed:', error);
      return { success: false, error: `YouTube automation failed: ${error.message}` };
    }
  }

  async executeSearchTask(transcript) {
    try {
      const steps = [
        "Open web browser",
        "Navigate to Google",
        "Perform search",
        "Display results"
      ];
      
      // Step 1: Already done
      if (this.onStepComplete) {
        this.onStepComplete(steps[0], "completed");
        this.onStepComplete(steps[1], "active");
      }
      
      // Step 2: Navigate to Google
      console.log('🌐 Navigating to Google...');
      await this.page.goto('https://google.com');
      await this.page.waitForLoadState('networkidle');
      
      if (this.onStepComplete) {
        this.onStepComplete(steps[1], "completed");
        this.onStepComplete(steps[2], "active");
      }
      
      // Step 3: Search
      const searchTerms = this.extractSearchTerms(transcript);
      console.log(`🔍 Searching for: ${searchTerms}`);
      
      const searchBox = await this.page.locator('input[name="q"]').first();
      await searchBox.click();
      await searchBox.fill(searchTerms);
      await searchBox.press('Enter');
      
      await this.page.waitForLoadState('networkidle');
      
      if (this.onStepComplete) {
        this.onStepComplete(steps[2], "completed");
        this.onStepComplete(steps[3], "completed");
      }
      
      console.log('✅ Google search completed successfully');
      return { 
        success: true, 
        message: `Successfully searched Google for: ${searchTerms}` 
      };
      
    } catch (error) {
      console.error('Search task failed:', error);
      return { success: false, error: `Search automation failed: ${error.message}` };
    }
  }

  async executeGenericWebTask(transcript) {
    try {
      console.log('🌐 Executing generic web task...');
      
      if (this.onStepComplete) {
        this.onStepComplete("Open web browser", "completed");
        this.onStepComplete("Navigate to website", "active");
      }
      
      // Extract URL or search terms
      const urlMatch = transcript.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.com)/);
      if (urlMatch) {
        const url = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
        console.log(`🌐 Navigating to: ${url}`);
        await this.page.goto(url);
        await this.page.waitForLoadState('networkidle');
        
        if (this.onStepComplete) {
          this.onStepComplete("Navigate to website", "completed");
        }
        
        return { success: true, message: `Successfully navigated to ${url}` };
      } else {
        // Fallback to Google search
        return await this.executeSearchTask(transcript);
      }
      
    } catch (error) {
      console.error('Generic web task failed:', error);
      return { success: false, error: `Web navigation failed: ${error.message}` };
    }
  }

  extractSearchTerms(transcript) {
    // Remove common command words and extract search terms
    const cleanTranscript = transcript
      .toLowerCase()
      .replace(/^(open|play|search|find|google|youtube)\s+/g, '')
      .replace(/\s+(on youtube|on google|video|videos)\s*$/g, '')
      .trim();
      
    return cleanTranscript || transcript;
  }

  // Check if this is a web-based task
  isWebBasedTask(transcript) {
    const webKeywords = [
      'youtube', 'google', 'search', 'website', 'browser', 'internet',
      'facebook', 'twitter', 'instagram', 'reddit', 'amazon', 'netflix',
      'gmail', 'email', 'web', 'online', 'url', '.com', '.org', '.net'
    ];
    
    const lowerTranscript = transcript.toLowerCase();
    return webKeywords.some(keyword => lowerTranscript.includes(keyword));
  }

  // Basic system command execution for non-web tasks
  async executeBasicSystemCommand(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    // Try to map to basic system commands
    if (lowerTranscript.includes('screenshot')) {
      return this.executeScreenshot(transcript);
    } else if (lowerTranscript.includes('lock')) {
      return this.executeLockScreen(transcript);
    } else if (lowerTranscript.includes('volume')) {
      return this.executeVolumeControl(transcript);
    } else if (lowerTranscript.includes('folder')) {
      return this.executeCreateFolder(transcript);
    } else {
      return {
        success: false,
        error: `I'm not sure how to handle "${transcript}". Try simpler commands like "take screenshot", "lock screen", or "open [app name]".`
      };
    }
  }

  // Execute shell command utility
  async executeShellCommand(command) {
    return new Promise((resolve) => {
      console.log(`⚡ Executing shell command: ${command}`);
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Command failed: ${error.message}`);
          resolve({ success: false, error: error.message });
        } else {
          console.log(`✅ Command successful: ${command}`);
          resolve({ success: true, output: stdout || stderr });
        }
      });
    });
  }

  // Utility functions
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cancellableDelay(ms) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      
      // Store the timeout so it can be cancelled
      this.currentExecution = {
        type: 'delay',
        timeoutId: timeoutId,
        cancel: () => {
          clearTimeout(timeoutId);
          reject(new Error('Delay cancelled'));
        }
      };
    });
  }

  stop() {
    console.log("🛑 Stop signal received");
    this.shouldStop = true;
    
    const wasCancelled = this.isExecuting;
    const cancelledTask = this.currentTask;
    
    if (this.currentExecution) {
      console.log("🛑 Cancelling current execution");
      if (this.currentExecution.cancel) {
        this.currentExecution.cancel();
      }
      this.currentExecution = null;
    }
    
    this.isExecuting = false;
    this.currentTask = null;
    
    return {
      success: true,
      wasCancelled: wasCancelled,
      cancelledTask: cancelledTask,
      message: wasCancelled ? `Cancelled task: ${cancelledTask}` : 'No active task to cancel'
    };
  }

  // Close Playwright browser when done
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.playwright = null;
      console.log('🎭 Playwright browser closed');
    }
  }

  getStatus() {
    return {
      isExecuting: this.isExecuting,
      currentTask: this.currentTask,
      queueLength: 0,
      canBeCancelled: this.isExecuting && this.currentExecution !== null
    };
  }
}

module.exports = TaskOrchestrator;