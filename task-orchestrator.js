const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const FormData = require('form-data');
const WebAutomation = require('./web-automation');
const fetch = require('node-fetch');

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
    this.activeTaskContext = null;
    
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

Important rules:
- For any task involving a web browser (searching, navigating, interacting with a site), you MUST use the 'playwright' type. The 'command' for this type MUST be an array of objects.
- Each object in the 'command' array MUST have an 'action' and a 'selector' (unless the action is 'navigate' or 'wait').
- Supported actions are: 'navigate' (requires 'url'), 'click', 'type' (requires 'text' and 'selector'), 'press' (requires 'key' and 'selector'), and 'wait' (requires 'duration').
- Example of a valid Playwright command: '[{"action": "navigate", "url": "https://google.com"}, {"action": "type", "selector": "input[name=q]", "text": "fastest language model"}, {"action": "press", "selector": "input[name=q]", "key": "Enter"}]'
- CRITICAL RULE: You MUST NOT infer or guess the user's intent. If a command is not a clear, explicit instruction to control a macOS application or web browser, you MUST respond with a valid JSON object containing an 'error' field. Example: '{"type": "error", "command": "", "explanation": "Command is ambiguous or not an executable task."}'
- For non-web tasks, use 'applescript' or 'shell' types. For application control, always use 'activate' to ensure the app is brought to the foreground (e.g., 'tell application "Notes" to activate').

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
    
    try {
      // Get execution command from LLM
      const executionPlan = await this.getExecutionCommand(transcript);
      console.log(`🔍 Execution plan:`, executionPlan);

      if (!executionPlan.success) {
        return {
          success: false,
          error: executionPlan.error || 'Failed to generate execution command',
          clarificationNeeded: true
        };
      }

      // Execute the command based on the type
      switch (executionPlan.type) {
        case 'applescript':
          return await this.executeAppleScript(executionPlan.command);
        case 'shell':
          return await this.executeShellCommand(executionPlan.command);
        case 'keyboard_shortcut':
          return await this.executeKeyboardShortcut(executionPlan.command);
        case 'playwright':
          return await this.webAutomation.executeWebTask(executionPlan.command, this.onStepComplete);
        case 'error':
          // This case is now handled in getExecutionCommand, but we keep it for safety
          return { success: false, error: executionPlan.explanation };
        default:
          throw new Error(`Unknown execution type: ${executionPlan.type}`);
      }
    } catch (error) {
      console.error('Task execution error:', error);
      return {
        success: false,
        error: 'Failed to execute command. Please try again.',
        clarificationNeeded: true
      };
    }
  }

  async getExecutionCommand(transcript) {
    try {
      const prompt = `You are an expert in macOS automation. Your primary goal is to generate precise, executable commands based on user requests.

      Current Task Context: ${this.activeTaskContext ? `An active '${this.activeTaskContext}' task is in progress. Subsequent commands should relate to this task.` : 'No active task.'}

      You must respond with a JSON object containing:
      1. type: One of 'applescript', 'shell', 'keyboard_shortcut', or 'playwright'.
      2. command: For 'applescript', 'shell', or 'keyboard_shortcut', this is the command string. For 'playwright', this is an array of action objects.
      3. explanation: Brief explanation of what the command does

      Important rules:
      - For any task involving a web browser (searching, navigating, interacting with a site), you MUST use the 'playwright' type. The 'command' for this type MUST be an array of objects.
      - Each object in the 'command' array MUST have an 'action' and a 'selector' (unless the action is 'navigate' or 'wait').
      - Supported actions are: 'navigate' (requires 'url'), 'click', 'type' (requires 'text' and 'selector'), 'press' (requires 'key' and 'selector'), and 'wait' (requires 'duration').
      - Example of a valid Playwright command: '[{"action": "navigate", "url": "https://google.com"}, {"action": "type", "selector": "input[name=q]", "text": "fastest language model"}, {"action": "press", "selector": "input[name=q]", "key": "Enter"}]'
      - CRITICAL RULE: You MUST NOT infer or guess the user's intent. If a command is not a clear, explicit instruction, you MUST respond with a valid JSON object containing an 'error' field. Example: {"type": "error", "command": "", "explanation": "Command is ambiguous or not an executable task."}
      - For non-web tasks, use 'applescript' or 'shell' types. For application control, always use 'activate' to ensure the app is brought to the foreground (e.g., 'tell application "Notes" to activate').
      - For web automation, you MUST first activate the browser window before executing any other steps.
      
      Voice: "can you open safari and go to github"
      Response: {
        "type": "applescript",
        "command": "tell application \\"Safari\\" to activate\\ntell application \\"System Events\\"\\nkeystroke \\"l\\" using command down\\ndelay 0.1\\nkeystroke \\"github.com\\"\\nkey code 36\\nend tell",
        "explanation": "Opens Safari, focuses address bar with Cmd+L, types github.com and presses return"
      }

      Voice: "take a screenshot"
      Response: {
        "type": "shell",
        "command": "screencapture ~/Desktop/screenshot-$(date +%Y%m%d-%H%M%S).png",
        "explanation": "Captures screen to Desktop with timestamp in filename"
      }

      Voice: "can you open slack"
      Response: {
        "type": "applescript",
        "command": "tell application \\"Slack\\" to activate",
        "explanation": "Opens and activates Slack application"
      }

      Voice: "increase volume"
      Response: {
        "type": "applescript",
        "command": "set volume output volume ((output volume of (get volume settings)) + 10)",
        "explanation": "Increases system volume by 10%"
      }

      Voice command to execute: "${transcript}"

      Respond with the most appropriate command in JSON format.`;

      // Make API call to Groq
      console.log('Sending request to Groq API...');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [
            { 
              role: 'system', 
              content: 'You are a macOS automation expert that generates precise execution commands. Always respond with valid JSON containing type, command, and explanation fields.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: "json_object" }
        })
      });

      const result = await response.json();
      console.log('Received response from Groq API:', JSON.stringify(result, null, 2));
      
      if (!result.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from Groq API. Full response: ' + JSON.stringify(result));
      }

      let executionPlan;
      try {
        executionPlan = JSON.parse(result.choices[0].message.content);
      } catch (e) {
        console.error("Failed to parse LLM response JSON:", e);
        throw new Error(`Could not parse the response from the LLM. Response content: ${result.choices[0].message.content}`);
      }
      console.log('📋 Execution plan:', JSON.stringify(executionPlan, null, 2));

      // Validate the execution plan
      if (!executionPlan.type || !executionPlan.explanation) {
        throw new Error('Invalid execution plan format: type or explanation missing');
      }

      if (executionPlan.type !== 'error' && !executionPlan.command) {
        throw new Error('Invalid execution plan format: command is missing for non-error type');
      }

      if (!['applescript', 'shell', 'keyboard_shortcut', 'playwright', 'error'].includes(executionPlan.type)) {
        throw new Error(`Invalid execution type: ${executionPlan.type}`);
      }

      // Handle error responses from the LLM
      if (executionPlan.type === 'error') {
        return { success: false, error: executionPlan.explanation };
      }

      // New: Set a timer to automatically clear the task context after a period of inactivity
      if (this.contextClearTimer) {
        clearTimeout(this.contextClearTimer);
      }
      this.contextClearTimer = setTimeout(() => {
        console.log('[Task Context] Clearing active task context due to inactivity.');
        this.activeTaskContext = null;
      }, 120000); // 2 minutes of inactivity

      return {
        success: true,
        ...executionPlan
      };

    } catch (error) {
      console.error('Failed to generate execution command:', error);
      return {
        success: false,
        error: `Failed to generate execution command: ${error.message}`
      };
    }
  }

  async executeAppleScript(script) {
    // Each line of an AppleScript can be passed with its own -e flag.
    // This is a more robust way to handle multi-line scripts.
    const sanitizedScript = script.replace(/"/g, '\\"');
    const osascriptCommand = sanitizedScript.split('\n')
      .map(line => `-e "${line.trim()}"`)
      .join(' ');

    console.log(`[AppleScript] Executing: osascript ${osascriptCommand}`);

    return new Promise((resolve, reject) => {
      exec(`osascript ${osascriptCommand}`, (error, stdout, stderr) => {
        if (error) {
          console.error('[AppleScript] Execution Error:', {
            message: error.message,
            stdout: stdout,
            stderr: stderr,
          });
          reject(new Error(`AppleScript execution failed: ${stderr || error.message}`));
        } else {
          console.log('[AppleScript] Execution Success:', stdout);
          resolve({
            success: true,
            message: stdout.trim() || 'Command executed successfully'
          });
        }
      });
    });
  }

  async executeShellCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Shell command execution error:', error);
          reject(error);
        } else {
          resolve({
            success: true,
            message: stdout.trim() || 'Command executed successfully'
          });
        }
      });
    });
  }

  async executeKeyboardShortcut(shortcut) {
    // The LLM is now trusted to generate the full, valid AppleScript for shortcuts.
    // We just need to execute it directly.
    return this.executeAppleScript(shortcut);
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
      const taskPromise = this.executeTask(transcript);

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

  // Handle ambiguous commands by trying LLM approach
  async handleAmbiguousCommand(transcript) {
    console.log(`🤔 Ambiguous command, using LLM: ${transcript}`);
    return await this.executeTask(transcript);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cancellableDelay(ms) {
    if (this.shouldStop) {
      throw new Error('Task cancelled');
    }
    await this.delay(ms);
    if (this.shouldStop) {
      throw new Error('Task cancelled');
    }
  }

  stop() {
    console.log("🛑 Stop requested");
    this.shouldStop = true;
    return {
      wasCancelled: true,
      cancelledTask: this.currentTask
    };
  }

  async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error('Error closing browser:', error);
      }
      this.browser = null;
    }
  }

  getStatus() {
    return {
      isExecuting: this.isExecuting,
      currentTask: this.currentTask,
      shouldStop: this.shouldStop
    };
  }
}

module.exports = TaskOrchestrator;