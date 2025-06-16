const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');
const WebAutomation = require('./web-automation');
const fetch = require('node-fetch');
const OpenAI = require('openai');

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
  constructor() {
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

    this.openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.screenshotDir = path.join(__dirname, 'screenshots');
    
    // Ensure screenshots directory exists
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
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
      // Check if this is a UI interaction command that would benefit from vision
      const isUICommand = this.isUIInteractionCommand(transcript);
      
      let executionPlan;
      
      if (isUICommand) {
        console.log(`🔍 UI interaction detected, using vision-first approach for: "${transcript}"`);
        executionPlan = await this.getExecutionCommandWithVision(transcript);
      } else {
        console.log(`⚡ Standard command execution for: "${transcript}"`);
        executionPlan = await this.getExecutionCommand(transcript);
      }
      
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

  isUIInteractionCommand(transcript) {
    const uiKeywords = [
      'click', 'press', 'tap', 'select', 'choose', 'button', 'ok', 'okay', 'cancel', 
      'tab', 'enter', 'return', 'escape', 'space', 'arrow', 'up', 'down', 'left', 'right',
      'dialog', 'window', 'menu', 'close', 'minimize', 'maximize', 'scroll', 'type',
      'text', 'field', 'input', 'checkbox', 'radio', 'dropdown', 'slider',
      'search', 'find', 'look for', 'type in', 'enter text', 'write'
    ];
    
    const lowerTranscript = transcript.toLowerCase();
    
    // Special cases for search commands when we're likely on a web page
    if (lowerTranscript.includes('search for') || lowerTranscript.includes('search')) {
      return true;
    }
    
    return uiKeywords.some(keyword => lowerTranscript.includes(keyword));
  }

  async getExecutionCommandWithVision(transcript) {
    try {
      console.log(`📸 Taking screenshot for vision-guided execution...`);
      
      // Take screenshot first
      const screenshotPath = await this.takeScreenshot('ui-interaction');
      
      // Analyze the screenshot to understand current UI state
      const visionAnalysis = await this.analyzeScreenshotWithVision(
        screenshotPath,
        `The user wants to: "${transcript}". What is currently visible on the screen? What UI elements are present? What's the best way to accomplish this task based on what you can see?`,
        `User command: "${transcript}"`
      );
      
      if (!visionAnalysis.success) {
        console.log(`❌ Vision analysis failed, falling back to standard approach`);
        return await this.getExecutionCommand(transcript);
      }
      
      // Use vision context to generate better command
      console.log(`🤖 Using vision analysis to generate precise command...`);
      return await this.getExecutionCommand(transcript, visionAnalysis.analysis);
      
    } catch (error) {
      console.error('❌ Vision-guided command generation failed:', error);
      console.log(`🔄 Falling back to standard approach...`);
      return await this.getExecutionCommand(transcript);
    }
  }

  async getExecutionCommand(transcript, visionContext = null) {
    try {
      const visionPrompt = visionContext ? `\nVISUAL CONTEXT: ${visionContext}\nUse this visual info to be more precise.` : '';

      const prompt = `Generate macOS automation commands. Respond with JSON: {"type": "applescript|shell|playwright", "command": "...", "explanation": "..."}

RULES:
- applescript: UI automation, keyboard shortcuts, app control
- shell: System commands (brightness, volume, media controls)  
- playwright: Web browser automation (array of action objects)

WORKING COMMANDS:
- Notes: tell application "Notes" to activate → delay 1 → tell application "System Events" to keystroke "n" using command down
- Brightness: brightness 0.5 (shell command, 0.1-1.0 range)
- Volume: cliclick kp:volume-up/down/mute (shell)
- Media: cliclick kp:play-pause/play-next/play-previous (shell)
- Minimize: cliclick c:37,14 (click yellow minimize button)
- Click buttons/windows: cliclick c:x,y (use vision to find exact coordinates)
- Tab/Enter/Escape: cliclick kp:tab/return/esc (shell)
- Screenshot: screencapture ~/Desktop/screenshot.png (shell command)
- Mouse clicks: ALWAYS use cliclick c:x,y for any UI clicking
- Key combinations: Use AppleScript for complex shortcuts like cmd+shift+3

PLAYWRIGHT EXAMPLE:
[{"action": "navigate", "url": "https://youtube.com"}, {"action": "click", "selector": "input[name=search_query]"}, {"action": "type", "selector": "input[name=search_query]", "text": "coldplay"}, {"action": "press", "selector": "input[name=search_query]", "key": "Enter"}]

If unclear/ambiguous: {"type": "error", "command": "", "explanation": "Command unclear"}${visionPrompt}

Task: "${transcript}"`;

      // Make API call to OpenAI GPT-4o with retry mechanism
      const response = await this.callOpenAIWithRetry(prompt);

      const result = await response.json();
      
      if (!result.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from OpenAI API. Full response: ' + JSON.stringify(result));
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

      if (!['applescript', 'shell', 'playwright', 'error'].includes(executionPlan.type)) {
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
    // Proper shell escaping for AppleScript execution
    // Split into lines and properly escape each line for shell execution
    const lines = script.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Build osascript command with proper escaping
    const osascriptArgs = lines.map(line => {
      // Use single quotes to wrap each line to avoid quote escaping issues
      const escapedLine = line.replace(/'/g, "'\"'\"'"); // Escape single quotes in the content
      return `-e '${escapedLine}'`;
    }).join(' ');

    const fullCommand = `osascript ${osascriptArgs}`;
    console.log(`[AppleScript] Executing: ${fullCommand}`);

    return new Promise((resolve, reject) => {
      exec(fullCommand, (error, stdout, stderr) => {
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

      // Create task execution promise with screenshot fallback
      const taskPromise = this.executeTaskWithScreenshotFallback(transcript);

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



  async callOpenAIWithRetry(prompt, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log('Sending request to OpenAI GPT-4o...');
        
        const response = await this.openaiClient.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { 
              role: 'system', 
              content: 'You are a macOS automation expert. Always respond with valid JSON containing type, command, and explanation fields. Use applescript for UI, shell for system commands, playwright for web.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: "json_object" }
        });

        console.log('Received response from OpenAI GPT-4o:', JSON.stringify(response, null, 2));
        
        return {
          ok: true,
          json: () => Promise.resolve({
            choices: [
              {
                message: {
                  content: response.choices[0].message.content
                }
              }
            ]
          })
        };

      } catch (error) {
        console.error(`❌ OpenAI request failed (attempt ${attempt}/${maxRetries}):`, error);
        
        // Check for rate limit errors
        if (error.status === 429) {
          const waitTime = Math.min(Math.pow(2, attempt) * 5000, 30000);
          console.log(`⏳ Rate limited, waiting ${Math.round(waitTime/1000)}s before retry ${attempt}/${maxRetries}...`);
          await this.delay(waitTime);
          continue;
        }
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        const waitTime = Math.min(Math.pow(2, attempt) * 2000, 10000);
        console.log(`🔄 Request failed, retrying in ${waitTime/1000}s... (${attempt}/${maxRetries})`);
        await this.delay(waitTime);
      }
    }
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

  // Screenshot and Vision Analysis Methods
  async takeScreenshot(description = 'task-failure') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${description}-${timestamp}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    
    console.log(`📸 Taking screenshot: ${filename}`);
    
    return new Promise((resolve, reject) => {
      // Use screencapture to take a screenshot of the entire screen
      exec(`screencapture -x "${filepath}"`, (error, stdout, stderr) => {
        if (error) {
          console.error('Screenshot failed:', error);
          reject(error);
        } else {
          console.log(`✅ Screenshot saved: ${filepath}`);
          resolve(filepath);
        }
      });
    });
  }

  async analyzeScreenshotWithVision(imagePath, question, context = '') {
    try {
      console.log(`🔍 Analyzing screenshot with OpenAI Vision: ${path.basename(imagePath)}`);
      console.log(`❓ Question: ${question}`);
      
      // Read image file and convert to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Context: ${context}\n\nQuestion: ${question}\n\nPlease analyze this screenshot and provide specific actionable information.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ];

      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 1000
      });

      const analysis = response.choices[0].message.content;
      console.log(`🤖 Vision Analysis Response: ${analysis}`);
      
      return {
        success: true,
        analysis: analysis,
        imagePath: imagePath
      };
      
    } catch (error) {
      console.error('❌ Vision analysis failed:', error);
      return {
        success: false,
        error: error.message,
        imagePath: imagePath
      };
    }
  }

  async executeTaskWithScreenshotFallback(task, retryCount = 0) {
    const maxRetries = 2;
    
    try {
      console.log(`🚀 Executing task: "${task}" (attempt ${retryCount + 1})`);
      
      // First attempt - normal execution
      const result = await this.executeTask(task);
      
      if (result.success) {
        console.log(`✅ Task completed successfully: "${task}"`);
        return result;
      } else {
        throw new Error(result.error || 'Task execution failed');
      }
      
    } catch (error) {
      console.log(`❌ Task failed: ${error.message}`);
      
      if (retryCount < maxRetries) {
        console.log(`🔄 Attempting screenshot-assisted recovery...`);
        
        // Take screenshot for context
        const screenshotPath = await this.takeScreenshot(`task-failure-${retryCount + 1}`);
        
        // Analyze what went wrong
        const visionAnalysis = await this.analyzeScreenshotWithVision(
          screenshotPath,
          `The task "${task}" failed with error: ${error.message}. What is the current state of the screen? What might have gone wrong? How can we fix this?`,
          `User requested: "${task}". Previous attempt failed.`
        );
        
        if (visionAnalysis.success) {
          // Get improved command based on visual analysis
          const improvedTask = await this.getImprovedTaskFromVision(task, error.message, visionAnalysis.analysis);
          
          if (improvedTask && improvedTask !== task) {
            console.log(`🔧 Retrying with improved approach: "${improvedTask}"`);
            return await this.executeTaskWithScreenshotFallback(improvedTask, retryCount + 1);
          }
        }
        
        // If vision analysis didn't help, try a generic retry
        if (retryCount < maxRetries - 1) {
          console.log(`🔄 Retrying original task...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          return await this.executeTaskWithScreenshotFallback(task, retryCount + 1);
        }
      }
      
      // Final failure
      console.log(`💥 Task failed after ${retryCount + 1} attempts: "${task}"`);
      return {
        success: false,
        error: `Task failed after ${retryCount + 1} attempts: ${error.message}`,
        finalError: true
      };
    }
  }

  async getImprovedTaskFromVision(originalTask, errorMessage, visionAnalysis) {
    try {
      console.log(`🧠 Getting improved task based on vision analysis...`);
      
      const prompt = `Original task: "${originalTask}"
Error message: "${errorMessage}"
Visual analysis of current screen: "${visionAnalysis}"

Based on the visual context and error, suggest an improved version of the original task that is more likely to succeed. Consider:
1. What applications are currently visible?
2. What state is the system in?
3. What specific elements can be targeted?
4. What alternative approaches might work?

Return only the improved task command, nothing else. If no improvement is possible, return "NO_IMPROVEMENT".`;

      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200
      });

      const improvedTask = response.choices[0].message.content.trim();
      
      console.log(`💡 Improved task suggestion: "${improvedTask}"`);
      
      return improvedTask === "NO_IMPROVEMENT" ? null : improvedTask;
      
    } catch (error) {
      console.error('❌ Failed to get improved task:', error);
      return null;
    }
  }
}

module.exports = TaskOrchestrator;