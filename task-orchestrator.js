const { exec } = require("child_process");
const AIService = require("./ai-service");
const VisualGuidance = require("./visual-guidance");

class TaskOrchestrator {
  constructor(apiKey) {
    this.aiService = new AIService(apiKey);
    this.visualGuidance = new VisualGuidance(apiKey);
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

🪟 WINDOW ACTIONS:
- Minimize window: First exit full screen (Escape key), then press Cmd+M
  Step 1: osascript -e 'tell application "System Events" to keystroke "escape"'
  Step 2: osascript -e 'tell application "System Events" to keystroke "m" using command down'
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
10. For window minimizing: ALWAYS exit full screen first (Escape), then use Cmd+M

STEP TYPES:
- KEYBOARD: Keyboard shortcuts and text input
- APPLICATION: Launch, quit, or control applications
- FILE: File and folder operations
- SYSTEM: System-level operations (lock, sleep, screenshot)
- MOUSE: Mouse movements and clicks
- UI_ELEMENT: GUI element interactions
- NOTIFICATION: System notifications and alerts
- MEDIA: Volume, music, and media controls
- WINDOW: Window management operations
- SHELL: Direct shell command execution

Example breakdown for "quit the current app and open chrome":
1. KEYBOARD: Quit current application
2. APPLICATION: Launch Chrome browser
3. WAIT: Allow Chrome to fully load

Example breakdown for "take a screenshot and open downloads folder":
1. SYSTEM: Take screenshot
2. FILE: Open Downloads folder

Example breakdown for "minimize this window":
1. KEYBOARD: Exit full screen mode (if applicable)
2. KEYBOARD: Minimize the window using Cmd+M

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

For minimize window commands, use this format:
{
  "success": true,
  "steps": [
    {
      "stepNumber": 1,
      "type": "KEYBOARD",
      "description": "Exit full screen mode if active",
      "script": "osascript -e 'tell application \\"System Events\\" to keystroke \\"escape\\"'",
      "delayAfter": 500,
      "continueOnError": true
    },
    {
      "stepNumber": 2,
      "type": "KEYBOARD",
      "description": "Minimize the window using Cmd+M",
      "script": "osascript -e 'tell application \\"System Events\\" to keystroke \\"m\\" using command down'",
      "delayAfter": 500,
      "continueOnError": false
    }
  ]
}`;
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

  // Main entry point for executing any task
  async executeTask(transcript) {
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

      console.log(`Starting task execution: ${transcript}`);
      
      // Break down the task into steps
      const taskBreakdown = await this.breakdownTask(transcript);
      
      if (!taskBreakdown.success) {
        throw new Error(taskBreakdown.error);
      }

      // Check if cancelled during breakdown
      if (this.shouldStop) {
        console.log("Task cancelled during breakdown");
        return { success: false, message: "Task cancelled" };
      }

      const steps = taskBreakdown.steps;
      console.log(`Task broken down into ${steps.length} steps`);

      // Execute each step sequentially with cancellation checks
      for (let i = 0; i < steps.length; i++) {
        // Check if task was cancelled
        if (this.shouldStop) {
          console.log(`Task cancelled at step ${i + 1}/${steps.length}`);
          if (this.onTaskComplete) {
            this.onTaskComplete(false, "Task cancelled by user");
          }
          return { success: false, message: "Task cancelled by user" };
        }

        const step = steps[i];
        console.log(`Executing step ${i + 1}/${steps.length}: ${step.description}`);
        
        if (this.onStepComplete) {
          this.onStepComplete(i + 1, steps.length, step.description);
        }

        const result = await this.executeStep(step);
        
        // Check again after step execution
        if (this.shouldStop) {
          console.log(`Task cancelled after step ${i + 1}/${steps.length}`);
          if (this.onTaskComplete) {
            this.onTaskComplete(false, "Task cancelled by user");
          }
          return { success: false, message: "Task cancelled by user" };
        }
        
        if (!result.success) {
          console.error(`Step ${i + 1} failed: ${result.error}`);
          
          if (this.onError) {
            this.onError(`Step ${i + 1} failed: ${result.error}`, i + 1, steps.length);
          }
          
          if (!step.continueOnError) {
            throw new Error(`Step ${i + 1} failed: ${result.error}`);
          }
        }

        // Add delay between steps (with cancellation check)
        if (i < steps.length - 1) {
          const delayTime = step.delayAfter || 1000;
          await this.cancellableDelay(delayTime);
        }
      }

      // Final check before marking as complete
      if (this.shouldStop) {
        console.log("Task cancelled before completion");
        if (this.onTaskComplete) {
          this.onTaskComplete(false, "Task cancelled by user");
        }
        return { success: false, message: "Task cancelled by user" };
      }

      console.log("Task completed successfully");
      
      if (this.onTaskComplete) {
        this.onTaskComplete(true, "Task completed successfully");
      }

      return { success: true, message: "Task completed successfully" };

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
      
      // Don't process queue automatically - let voice commands drive execution
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

    console.log(`📝 TASK BREAKDOWN PROMPT BEING SENT TO CLAUDE:`);
    console.log(`=====================================`);
    console.log(taskAnalysisPrompt);
    console.log(`=====================================`);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.aiService.apiKey,
          "anthropic-version": "2023-06-01",
        },
      };

      const data = JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 4096,
        messages: [
          { role: "user", content: taskAnalysisPrompt },
        ],
      });

      const req = require("https").request(options, (res) => {
        let responseData = "";

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          try {
            const response = JSON.parse(responseData);

            if (response.error) {
              resolve({ success: false, error: response.error.message });
            } else if (response.content && response.content.length > 0) {
              let content = response.content[0].text.trim();
              
              // Extract JSON from response
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const breakdown = JSON.parse(jsonMatch[0]);
                console.log(`🧠 RAW LLM BREAKDOWN RESPONSE:`, JSON.stringify(breakdown, null, 2));
                
                // Process and format each step with validation
                if (breakdown.steps) {
                  console.log(`🔧 Processing ${breakdown.steps.length} steps from LLM response...`);
                  breakdown.steps = breakdown.steps.map((step, index) => {
                    console.log(`🔧 Processing step ${index + 1}: ${step.description || 'No description'}`);
                    
                    // Validate step has required properties
                    if (!step.script) {
                      console.warn(`⚠️ Step ${index + 1} missing script, adding placeholder`);
                      step.script = 'display dialog "Step script not provided by LLM"';
                    }
                    
                    if (!step.description) {
                      console.warn(`⚠️ Step ${index + 1} missing description`);
                      step.description = `Unnamed step ${index + 1}`;
                    }
                    
                    console.log(`🔧 Step ${index + 1} script: ${step.script}`);
                    
                    const processedStep = {
                      ...step,
                      formattedScript: this.formatScriptForExecution(step.script),
                      delayAfter: step.delayAfter || 1000,
                      continueOnError: step.continueOnError || false
                    };
                    
                    console.log(`✅ Step ${index + 1} processed successfully`);
                    return processedStep;
                  });
                  
                  console.log(`✅ All ${breakdown.steps.length} steps processed successfully`);
                } else {
                  console.warn(`⚠️ No steps found in breakdown response`);
                }
                
                resolve(breakdown);
              } else {
                resolve({ success: false, error: "Could not parse task breakdown" });
              }
            } else {
              resolve({ success: false, error: "Unexpected API response format" });
            }
          } catch (error) {
            console.error("Error processing breakdown:", error);
            resolve({ success: false, error: `Failed to process breakdown: ${error.message}` });
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }

  // Execute a single step (updated to handle visual guidance and automatic fallback with retry loop)
  async executeStep(step) {
    const maxRetries = 3;
    let currentAttempt = 0;
    
    while (currentAttempt < maxRetries) {
      // Check for cancellation
      if (this.shouldStop) {
        return { success: false, error: "Task cancelled" };
      }
      
      const result = await this.executeSingleAttempt(step, currentAttempt);
      
      if (result.success) {
        return result;
      }
      
      // If it's not an AppleScript failure, don't retry
      if (!result.error.includes('osascript') && !result.error.includes('System Events')) {
        return result;
      }
      
      currentAttempt++;
      console.log(`❌ Attempt ${currentAttempt}/${maxRetries} failed: ${result.error}`);
      
      if (currentAttempt < maxRetries) {
        console.log(`🔄 Retrying with screenshot analysis...`);
        await this.delay(1000); // Wait 1 second before retry
      }
    }
    
    return { 
      success: false, 
      error: `Failed after ${maxRetries} attempts with screenshot analysis`,
      allAttemptsFailed: true
    };
  }

  // Execute a single attempt with screenshot analysis fallback
  async executeSingleAttempt(step, attemptNumber) {
    return new Promise(async (resolve) => {
      try {
        // Handle visual guidance steps (check both type and placeholder script)
        if (step.type === "VISUAL_GUIDANCE" || step.script === "VISUAL_GUIDANCE_PLACEHOLDER") {
          console.log(`🔍 Executing visual guidance step: ${step.description}`);
          
          const result = await this.visualGuidance.performVisualGuidedAction(
            step.visualTask || this.currentTask,
            step.visualStep || step.description
          );
          
          if (result.success) {
            console.log(`✅ Visual guidance completed: ${result.action}`);
            resolve({
              success: true,
              output: `Visual action completed: ${result.action} (confidence: ${result.confidence})`,
              visualAction: result.action,
              confidence: result.confidence
            });
          } else {
            console.error(`❌ Visual guidance failed: ${result.error}`);
            resolve({
              success: false,
              error: result.error,
              visualAction: "Failed to execute visual action"
            });
          }
          return;
        }

        // Handle regular AppleScript steps
        const script = step.formattedScript || this.formatScriptForExecution(step.script);
        
        console.log(`Executing step script (attempt ${attemptNumber + 1}): ${script}`);

        exec(script, async (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ AppleScript step failed (attempt ${attemptNumber + 1}):`, error);
            
            // SCREENSHOT ANALYSIS AND RETRY LOOP
            try {
              console.log(`📷 Taking screenshot for analysis (attempt ${attemptNumber + 1})...`);
              
              // Notify UI that screenshot analysis is starting
              if (this.notificationCallbacks.notifyScreenshotAnalysisStart) {
                this.notificationCallbacks.notifyScreenshotAnalysisStart(step.description);
              }
              
              // Take screenshot of current state
              const screenshot = await this.takeScreenshot();
              if (screenshot.success) {
                console.log(`📷 Screenshot captured: ${screenshot.path}`);
                
                // Enhanced analysis with better context
                const analysis = await this.analyzeFailureAndSuggestNextSteps(
                  screenshot.path, 
                  step.description, 
                  error.message,
                  this.currentTask,
                  attemptNumber + 1
                );
                
                // Notify UI about analysis result
                if (this.notificationCallbacks.notifyScreenshotAnalysisComplete) {
                  this.notificationCallbacks.notifyScreenshotAnalysisComplete(
                    analysis.success,
                    analysis.suggestedAction,
                    analysis.failureReason
                  );
                }
                
                if (analysis.success && analysis.actionSteps && analysis.actionSteps.length > 0) {
                  console.log(`🧠 LLM Analysis: ${analysis.explanation}`);
                  console.log(`🎯 Executing ${analysis.actionSteps.length} suggested actions...`);
                  
                  // Execute each suggested action
                  for (let i = 0; i < analysis.actionSteps.length; i++) {
                    const action = analysis.actionSteps[i];
                    console.log(`🎯 Executing action ${i + 1}/${analysis.actionSteps.length}: ${action.description}`);
                    
                    let actionResult;
                    if (action.type === 'VISUAL') {
                      // Use visual guidance for this action
                      actionResult = await this.visualGuidance.performVisualGuidedAction(
                        this.currentTask,
                        action.description
                      );
                    } else if (action.type === 'APPLESCRIPT') {
                      // Execute the suggested AppleScript
                      actionResult = await this.executeAppleScript(action.script);
                    } else if (action.type === 'KEYBOARD') {
                      // Execute keyboard shortcut
                      actionResult = await this.executeAppleScript(action.script);
                    }
                    
                    // Notify UI about action result
                    if (this.notificationCallbacks.notifyVisualFallbackResult) {
                      this.notificationCallbacks.notifyVisualFallbackResult(
                        actionResult.success,
                        action.description,
                        actionResult.error
                      );
                    }
                    
                    if (actionResult.success) {
                      console.log(`✅ Action ${i + 1} succeeded: ${action.description}`);
                      
                      // If this was the final action and it succeeded, consider the step complete
                      if (i === analysis.actionSteps.length - 1) {
                        resolve({
                          success: true,
                          output: `Original AppleScript failed, but visual guidance succeeded: ${action.description}`,
                          visualAction: action.description,
                          confidence: actionResult.confidence || 0.8,
                          usedFallback: true
                        });
                        return;
                      }
                    } else {
                      console.log(`❌ Action ${i + 1} failed: ${actionResult.error}`);
                      // Continue to the next action instead of giving up
                    }
                    
                    // Add small delay between actions
                    await this.delay(500);
                  }
                  
                  // If we reach here, some actions failed
                  resolve({
                    success: false,
                    error: `Visual fallback partially failed. Some actions succeeded but couldn't complete the task.`,
                    triedVisualFallback: true
                  });
                  return;
                  
                } else {
                  console.log(`❌ LLM analysis failed or no actions suggested: ${analysis.error || 'No actions provided'}`);
                }
              } else {
                console.error(`❌ Failed to take screenshot: ${screenshot.error}`);
              }
            } catch (screenshotError) {
              console.error(`❌ Screenshot analysis error:`, screenshotError);
            }
            
            // Return the original error for retry logic
            resolve({ 
              success: false, 
              error: error.message,
              code: error.code,
              triedVisualFallback: true
            });
          } else {
            console.log(`✅ AppleScript step completed successfully`);
            if (stdout) console.log("stdout:", stdout);
            if (stderr) console.log("stderr:", stderr);
            
            resolve({ 
              success: true, 
              output: stdout || stderr || "Step completed"
            });
          }
        });
      } catch (error) {
        console.error("Error in executeSingleAttempt:", error);
        resolve({
          success: false,
          error: error.message
        });
      }
    });
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
        script.startsWith('t:') || script.startsWith('kp:') || script.startsWith('w:') || script === 'p' ||
        script.includes('cliclick ')) {
      // If it's just cliclick parameters, prepend cliclick command
      if (!script.includes('cliclick ')) {
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

  // Enhanced screenshot analysis that provides specific actionable steps
  async analyzeFailureAndSuggestNextSteps(screenshotPath, failedStepDescription, errorMessage, originalTask, attemptNumber) {
    try {
      console.log(`🧠 Enhanced analysis for failed step: ${failedStepDescription} (attempt ${attemptNumber})`);
      
      // First, upload screenshot to cloud for optimization
      const uploadResult = await this.uploadScreenshotToCloud(screenshotPath);
      
      if (!uploadResult.success) {
        console.log(`⚠️ Cloud upload failed, falling back to base64: ${uploadResult.error}`);
        
        // Fallback to original base64 method
        return await this.analyzeWithBase64(screenshotPath, failedStepDescription, errorMessage, originalTask, attemptNumber);
      }
      
      // Notify UI that Claude analysis is starting
      if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
        this.notificationCallbacks.notifyClaudeAnalysis("start");
      }
      
      const analysisPrompt = `You are an expert macOS automation assistant analyzing a screenshot to fix a failed GUI automation task.

CONTEXT:
- User's Goal: "${originalTask}"
- Failed Step: "${failedStepDescription}"
- Error: "${errorMessage}"
- Attempt Number: ${attemptNumber}/3

INSTRUCTIONS:
1. Analyze what's visible in the screenshot
2. Understand why the AppleScript failed
3. Provide 1-3 specific, actionable steps to accomplish the user's goal
4. Focus on what the user actually wants to achieve (e.g., quit the application)

STEP TYPES:
- VISUAL: Use visual guidance to click/interact with visible elements
- APPLESCRIPT: Direct AppleScript command
- KEYBOARD: Keyboard shortcuts (like Cmd+Q to quit)

Return ONLY valid JSON:
{
  "success": true,
  "explanation": "I can see Activity Monitor is open. The AppleScript failed because the menu structure is different than expected.",
  "failureReason": "Menu item path is incorrect for current macOS version",
  "actionSteps": [
    {
      "type": "KEYBOARD",
      "description": "Press Cmd+Q to quit Activity Monitor",
      "script": "tell application \\"System Events\\" to keystroke \\"q\\" using command down"
    }
  ]
}

For quit/close tasks, prefer keyboard shortcuts:
- Cmd+Q to quit applications
- Cmd+W to close windows
- Alt+F4 equivalent

For minimize window tasks, ALWAYS use this sequence:
- First: Press Escape to exit full screen (if active)
- Then: Press Cmd+M to minimize the window

If you cannot see the target application or provide solutions:
{
  "success": false,
  "error": "Cannot see the target application in screenshot"
}`;

      console.log(`📝 PROMPT BEING SENT TO CLAUDE:`);
      console.log(`=====================================`);
      console.log(analysisPrompt);
      console.log(`=====================================`);
      console.log(`🖼️ Screenshot URL: ${uploadResult.cdnURL}`);
      console.log(`=====================================`);

      return new Promise((resolve, reject) => {
        const options = {
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.aiService.apiKey,
            "anthropic-version": "2023-06-01",
          },
        };

        const data = JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: analysisPrompt },
                {
                  type: "image",
                  source: {
                    type: "url",
                    url: uploadResult.cdnURL
                  }
                }
              ]
            }
          ],
        });

        const req = require("https").request(options, (res) => {
          let responseData = "";

          res.on("data", (chunk) => {
            responseData += chunk;
          });

          res.on("end", () => {
            try {
              const response = JSON.parse(responseData);
              console.log(`🧠 Claude response status: ${res.statusCode}`);

              if (response.error) {
                console.error(`❌ Claude API error:`, response.error);
                // Notify UI that Claude analysis failed
                if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                  this.notificationCallbacks.notifyClaudeAnalysis("failed", response.error.message || JSON.stringify(response.error));
                }
                resolve({ success: false, error: response.error.message || JSON.stringify(response.error) });
              } else if (response.content && response.content.length > 0) {
                const content = response.content[0].text.trim();
                console.log(`🧠 Claude raw response:`, content.substring(0, 200) + '...');
                
                // Extract JSON from response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    const analysis = JSON.parse(jsonMatch[0]);
                    console.log(`🧠 Enhanced screenshot analysis result:`, analysis);
                    
                    // Notify UI that Claude analysis succeeded
                    if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                      this.notificationCallbacks.notifyClaudeAnalysis("success", analysis);
                    }
                    
                    resolve(analysis);
                  } catch (parseError) {
                    console.error(`❌ Failed to parse Claude JSON response:`, parseError);
                    console.error(`❌ Problematic JSON:`, jsonMatch[0]);
                    
                    // Notify UI that Claude analysis failed to parse
                    if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                      this.notificationCallbacks.notifyClaudeAnalysis("failed", `JSON parse error: ${parseError.message}`);
                    }
                    resolve({ success: false, error: `JSON parse error: ${parseError.message}` });
                  }
                } else {
                  console.error(`❌ No JSON found in Claude response:`, content);
                  // Notify UI that Claude analysis failed to parse
                  if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                    this.notificationCallbacks.notifyClaudeAnalysis("failed", "No JSON found in response");
                  }
                  resolve({ success: false, error: "No JSON found in response" });
                }
              } else {
                console.error(`❌ Unexpected Claude API response format:`, response);
                // Notify UI that Claude analysis failed with unexpected response
                if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                  this.notificationCallbacks.notifyClaudeAnalysis("failed", "Unexpected API response format");
                }
                resolve({ success: false, error: "Unexpected API response format" });
              }
            } catch (error) {
              console.error("Error processing enhanced screenshot analysis:", error);
              resolve({ success: false, error: `Failed to process analysis: ${error.message}` });
            }
          });
        });

        req.on("error", (error) => {
          console.error("Request error in enhanced screenshot analysis:", error);
          resolve({ success: false, error: error.message });
        });

        req.write(data);
        req.end();
      });
      
    } catch (error) {
      console.error("Error in analyzeFailureAndSuggestNextSteps:", error);
      return { success: false, error: error.message };
    }
  }

  // Fallback method using base64 when cloud upload fails
  async analyzeWithBase64(screenshotPath, failedStepDescription, errorMessage, originalTask, attemptNumber) {
    try {
      console.log(`🔄 Using base64 fallback for screenshot analysis`);
      
      // Notify UI that Claude analysis is starting
      if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
        this.notificationCallbacks.notifyClaudeAnalysis("start");
      }
      
      // Read screenshot as base64
      const fs = require('fs');
      const imageBuffer = fs.readFileSync(screenshotPath);
      const base64Image = imageBuffer.toString('base64');
      
      const analysisPrompt = `You are an expert macOS automation assistant analyzing a screenshot to fix a failed GUI automation task.

CONTEXT:
- User's Goal: "${originalTask}"
- Failed Step: "${failedStepDescription}"
- Error: "${errorMessage}"
- Attempt Number: ${attemptNumber}/3

INSTRUCTIONS:
1. Analyze what's visible in the screenshot
2. Understand why the AppleScript failed
3. Provide 1-3 specific, actionable steps to accomplish the user's goal
4. Focus on what the user actually wants to achieve (e.g., quit the application)

STEP TYPES:
- VISUAL: Use visual guidance to click/interact with visible elements
- APPLESCRIPT: Direct AppleScript command
- KEYBOARD: Keyboard shortcuts (like Cmd+Q to quit)

Return ONLY valid JSON:
{
  "success": true,
  "explanation": "I can see Activity Monitor is open. The AppleScript failed because the menu structure is different than expected.",
  "failureReason": "Menu item path is incorrect for current macOS version",
  "actionSteps": [
    {
      "type": "KEYBOARD",
      "description": "Press Cmd+Q to quit Activity Monitor",
      "script": "tell application \\"System Events\\" to keystroke \\"q\\" using command down"
    }
  ]
}

For quit/close tasks, prefer keyboard shortcuts:
- Cmd+Q to quit applications
- Cmd+W to close windows
- Alt+F4 equivalent

For minimize window tasks, ALWAYS use this sequence:
- First: Press Escape to exit full screen (if active)
- Then: Press Cmd+M to minimize the window

If you cannot see the target application or provide solutions:
{
  "success": false,
  "error": "Cannot see the target application in screenshot"
}`;

      console.log(`📝 PROMPT BEING SENT TO CLAUDE (BASE64 FALLBACK):`);
      console.log(`=====================================`);
      console.log(analysisPrompt);
      console.log(`=====================================`);
      console.log(`🖼️ Screenshot: Base64 data (${base64Image.length} characters)`);
      console.log(`=====================================`);

      return new Promise((resolve, reject) => {
        const options = {
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.aiService.apiKey,
            "anthropic-version": "2023-06-01",
          },
        };

        const data = JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: analysisPrompt },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: screenshotPath.endsWith('.jpg') || screenshotPath.endsWith('.jpeg') ? "image/jpeg" : "image/png",
                    data: base64Image
                  }
                }
              ]
            }
          ],
        });

        const req = require("https").request(options, (res) => {
          let responseData = "";

          res.on("data", (chunk) => {
            responseData += chunk;
          });

          res.on("end", () => {
            try {
              const response = JSON.parse(responseData);
              console.log(`🧠 Claude response status (base64): ${res.statusCode}`);

              if (response.error) {
                console.error(`❌ Claude API error (base64):`, response.error);
                // Notify UI that Claude analysis failed
                if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                  this.notificationCallbacks.notifyClaudeAnalysis("failed", response.error.message || JSON.stringify(response.error));
                }
                resolve({ success: false, error: response.error.message || JSON.stringify(response.error) });
              } else if (response.content && response.content.length > 0) {
                const content = response.content[0].text.trim();
                console.log(`🧠 Claude raw response (base64):`, content.substring(0, 200) + '...');
                
                // Extract JSON from response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  try {
                    const analysis = JSON.parse(jsonMatch[0]);
                    console.log(`🧠 Enhanced screenshot analysis result (base64):`, analysis);
                    
                    // Notify UI that Claude analysis succeeded
                    if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                      this.notificationCallbacks.notifyClaudeAnalysis("success", analysis);
                    }
                    
                    resolve(analysis);
                  } catch (parseError) {
                    console.error(`❌ Failed to parse Claude JSON response (base64):`, parseError);
                    console.error(`❌ Problematic JSON (base64):`, jsonMatch[0]);
                    
                    // Notify UI that Claude analysis failed to parse
                    if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                      this.notificationCallbacks.notifyClaudeAnalysis("failed", `JSON parse error: ${parseError.message}`);
                    }
                    resolve({ success: false, error: `JSON parse error: ${parseError.message}` });
                  }
                } else {
                  console.error(`❌ No JSON found in Claude response (base64):`, content);
                  // Notify UI that Claude analysis failed to parse
                  if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                    this.notificationCallbacks.notifyClaudeAnalysis("failed", "No JSON found in response");
                  }
                  resolve({ success: false, error: "No JSON found in response" });
                }
              } else {
                console.error(`❌ Unexpected Claude API response format (base64):`, response);
                // Notify UI that Claude analysis failed with unexpected response
                if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                  this.notificationCallbacks.notifyClaudeAnalysis("failed", "Unexpected API response format");
                }
                resolve({ success: false, error: "Unexpected API response format" });
              }
            } catch (error) {
              console.error("Error processing enhanced screenshot analysis (base64):", error);
              
              // Notify UI that Claude analysis failed
              if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
                this.notificationCallbacks.notifyClaudeAnalysis("failed", `Failed to process analysis: ${error.message}`);
              }
              
              resolve({ success: false, error: `Failed to process analysis: ${error.message}` });
            }
          });
        });

        req.on("error", (error) => {
          console.error("Request error in enhanced screenshot analysis (base64):", error);
          
          // Notify UI that Claude analysis failed
          if (this.notificationCallbacks && this.notificationCallbacks.notifyClaudeAnalysis) {
            this.notificationCallbacks.notifyClaudeAnalysis("failed", error.message);
          }
          
          resolve({ success: false, error: error.message });
        });

        req.write(data);
        req.end();
      });
    } catch (error) {
      console.error("Error in base64 screenshot analysis:", error);
      return { success: false, error: error.message };
    }
  }

  // Helper to execute AppleScript commands
  async executeAppleScript(script) {
    return new Promise((resolve) => {
      const formattedScript = this.formatScriptForExecution(script);
      console.log(`🍎 Executing AppleScript: ${formattedScript}`);
      
      exec(formattedScript, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ AppleScript execution failed:`, error);
          resolve({ 
            success: false, 
            error: error.message,
            code: error.code 
          });
        } else {
          console.log(`✅ AppleScript executed successfully`);
          if (stdout) console.log("stdout:", stdout);
          if (stderr) console.log("stderr:", stderr);
          
          resolve({ 
            success: true, 
            output: stdout || stderr || "AppleScript completed",
            confidence: 0.9
          });
        }
      });
    });
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
    
    // Notify that task was cancelled only if there was an active task
    if (wasExecuting && this.onTaskComplete) {
      this.onTaskComplete(false, `Task cancelled by user: "${currentTaskName}"`);
    }
    
    return {
      success: true,
      wasCancelled: wasExecuting,
      cancelledTask: currentTaskName,
      message: wasExecuting ? 
        `Cancelled task: "${currentTaskName}"` : 
        "No active task to cancel"
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
}

module.exports = TaskOrchestrator; 