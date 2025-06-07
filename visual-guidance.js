const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

class VisualGuidance {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.screenshotDir = "/tmp/voice-assistant-screenshots";
    this.ensureScreenshotDir();
  }

  // Ensure screenshot directory exists
  ensureScreenshotDir() {
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  // Take a screenshot and save it
  async takeScreenshot() {
    const timestamp = Date.now();
    const screenshotPath = path.join(this.screenshotDir, `screenshot_${timestamp}.jpg`);
    
    return new Promise((resolve) => {
      // Create JPEG screenshot directly with compression
      const command = `screencapture -x -t jpg "${screenshotPath}"`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error("Screenshot error:", error);
          resolve({ success: false, error: error.message });
        } else {
          console.log("Screenshot saved:", screenshotPath);
          
          // Check file size and compress further if needed
          this.checkAndCompressScreenshot(screenshotPath).then(finalPath => {
            resolve({ success: true, path: finalPath });
          }).catch(compressError => {
            console.error("Screenshot compression failed:", compressError);
            // Fall back to original file if compression fails
            resolve({ success: true, path: screenshotPath });
          });
        }
      });
    });
  }

  // Check screenshot size and compress if too large for Claude API
  async checkAndCompressScreenshot(screenshotPath) {
    return new Promise((resolve, reject) => {
      try {
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

  // Convert screenshot to base64 for AI analysis
  async screenshotToBase64(screenshotPath) {
    try {
      const imageBuffer = fs.readFileSync(screenshotPath);
      const base64Image = imageBuffer.toString('base64');
      return base64Image;
    } catch (error) {
      console.error("Error converting screenshot to base64:", error);
      return null;
    }
  }

  // Analyze screenshot and get next action
  async analyzeScreenshotForAction(screenshotPath, currentTask, stepDescription) {
    try {
      // Check if API key is available and valid
      if (!this.apiKey || 
          this.apiKey === 'your_anthropic_api_key_here' || 
          this.apiKey.includes('your_') ||
          this.apiKey.includes('_here') ||
          this.apiKey.trim() === '') {
        console.log("🎯 VisualGuidance: No valid API key available, skipping visual analysis");
        return { success: false, error: "API key not configured for visual guidance" };
      }

      const base64Image = await this.screenshotToBase64(screenshotPath);
      if (!base64Image) {
        return { success: false, error: "Failed to process screenshot" };
      }

      const analysisPrompt = `You are a visual UI automation expert. Analyze this screenshot and determine the exact next action to take.

CURRENT TASK: ${currentTask}
CURRENT STEP: ${stepDescription}

ANALYSIS RULES:
1. Look for specific UI elements (search boxes, buttons, text fields)
2. Provide exact coordinates or element descriptions
3. Choose the most appropriate interaction method
4. Be specific about what to click or type

AVAILABLE ACTIONS:
- CLICK: Click at specific coordinates or on specific elements
- TYPE: Type text into focused element
- SCROLL: Scroll in specific direction
- WAIT: Wait for page to load
- KEY_PRESS: Press specific keys (Enter, Tab, etc.)

For YouTube specifically:
- Look for the search box (usually at the top)
- Look for video thumbnails to click
- Look for search results

For Google:
- Look for the main search box
- Look for search results

Return ONLY a JSON response in this exact format:
{
  "success": true,
  "action": "CLICK|TYPE|SCROLL|WAIT|KEY_PRESS",
  "target": "description of what to interact with",
  "coordinates": [x, y] (if clicking),
  "text": "text to type" (if typing),
  "key": "key to press" (if key press),
  "description": "human readable description of action",
  "confidence": 0.9
}

Analyze the screenshot and determine the next action:`;

      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
      };

      const data = JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: analysisPrompt
              },
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

      return new Promise((resolve, reject) => {
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
                  const action = JSON.parse(jsonMatch[0]);
                  resolve(action);
                } else {
                  resolve({ success: false, error: "Could not parse action from AI response" });
                }
              } else {
                resolve({ success: false, error: "Unexpected AI response format" });
              }
            } catch (error) {
              console.error("Error processing AI response:", error);
              resolve({ success: false, error: `Failed to process AI response: ${error.message}` });
            }
          });
        });

        req.on("error", (error) => {
          reject(error);
        });

        req.write(data);
        req.end();
      });
    } catch (error) {
      console.error("Error analyzing screenshot:", error);
      return { success: false, error: error.message };
    }
  }

  // Check if cliclick is available
  async checkCliclickAvailable() {
    return new Promise((resolve) => {
      exec("which cliclick", (error, stdout, stderr) => {
        resolve(!error && stdout.trim().length > 0);
      });
    });
  }

  // Execute the action determined by AI
  async executeVisualAction(action) {
    try {
      let script = "";

      switch (action.action) {
        case "CLICK":
          if (action.coordinates && action.coordinates.length === 2) {
            const [x, y] = action.coordinates;
            const cliclickAvailable = await this.checkCliclickAvailable();
            
            if (cliclickAvailable) {
              // Use cliclick tool for reliable coordinate clicking
              script = `do shell script "cliclick c:${x},${y}"`;
            } else {
              // Fallback to AppleScript method
              script = `tell application "System Events"
    tell (first application process whose frontmost is true)
        click at {${x}, ${y}}
    end tell
end tell`;
            }
          } else {
            // For non-coordinate clicks, try to find and click UI elements
            const target = action.target || "button 1";
            script = `tell application "System Events"
    tell (first application process whose frontmost is true)
        try
            click ${target}
        on error
            try
                click UI element "${target}" of window 1
            on error
                try
                    click button "${target}" of window 1
                on error
                    try
                        click first button of window 1
                    on error
                        click at {500, 400}
                    end try
                end try
            end try
        end try
    end tell
end tell`;
          }
          break;

        case "TYPE":
          // Use clipboard method to avoid "Can't get text" errors
          script = `set the clipboard to "${action.text}"
tell application "System Events"
    delay 0.5
    keystroke "v" using command down
end tell`;
          break;

        case "KEY_PRESS":
          if (action.key === "Enter") {
            script = `tell application "System Events" to keystroke return`;
          } else if (action.key === "Tab") {
            script = `tell application "System Events" to keystroke tab`;
          } else if (action.key === "Escape") {
            script = `tell application "System Events" to keystroke escape`;
          } else {
            script = `tell application "System Events" to keystroke "${action.key}"`;
          }
          break;

        case "SCROLL":
          script = `tell application "System Events" 
    tell (first application process whose frontmost is true)
        scroll down 5
    end tell
end tell`;
          break;

        case "WAIT":
          script = `delay 2`;
          break;

        default:
          return { success: false, error: `Unknown action: ${action.action}` };
      }

      // Execute the script with multiple fallback attempts
      return await this.executeScriptWithFallbacks(script, action);
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Execute script with multiple fallback methods
  async executeScriptWithFallbacks(script, action) {
    const formattedScript = `osascript -e '${script.replace(/'/g, "'\\''")}'`;
    
    return new Promise((resolve) => {
      console.log(`🎯 Executing visual action: ${action.description}`);
      console.log(`📜 Primary script: ${script}`);

      exec(formattedScript, async (error, stdout, stderr) => {
        if (error) {
          console.error("❌ Primary visual action failed:", error.message);
          
          // Try fallback methods for clicks
          if (action.action === "CLICK") {
            console.log("🔄 Trying fallback click methods...");
            
            const fallbackResult = await this.tryClickFallbacks(action);
            resolve(fallbackResult);
          } else {
            resolve({ 
              success: false, 
              error: error.message,
              action: action.description
            });
          }
        } else {
          console.log("✅ Visual action completed successfully");
          if (stdout) console.log("📤 stdout:", stdout);
          if (stderr && stderr.trim()) console.log("📤 stderr:", stderr);
          resolve({ 
            success: true, 
            output: stdout || stderr || "Action completed",
            action: action.description
          });
        }
      });
    });
  }

  // Try multiple fallback methods for clicking
  async tryClickFallbacks(action) {
    const fallbackMethods = [];
    
    if (action.coordinates && action.coordinates.length === 2) {
      const [x, y] = action.coordinates;
      
      // Method 1: Simple AppleScript click at coordinates
      fallbackMethods.push({
        description: "AppleScript click at coordinates",
        script: `tell application "System Events" to click at {${x}, ${y}}`
      });
      
      // Method 2: Mouse move and click
      fallbackMethods.push({
        description: "Mouse move and click",
        script: `tell application "System Events"
    set the mouse location to {${x}, ${y}}
    delay 0.1
    click at the mouse location
end tell`
      });
      
      // Method 3: If cliclick is available, try it as fallback
      const cliclickAvailable = await this.checkCliclickAvailable();
      if (cliclickAvailable) {
        fallbackMethods.push({
          description: "cliclick coordinate click",
          script: `do shell script "cliclick c:${x},${y}"`
        });
      }
    }
    
    // Method 4: Try to click center of screen if all else fails
    fallbackMethods.push({
      description: "Click center of screen",
      script: `tell application "System Events" to click at {640, 400}`
    });
    
    // Try each fallback method
    for (let i = 0; i < fallbackMethods.length; i++) {
      const method = fallbackMethods[i];
      console.log(`🔄 Trying fallback ${i + 1}/${fallbackMethods.length}: ${method.description}`);
      
      const result = await this.executeSingleScript(method.script, method.description);
      if (result.success) {
        console.log(`✅ Fallback method ${i + 1} succeeded: ${method.description}`);
        return {
          success: true,
          output: `Fallback click completed: ${method.description}`,
          action: action.description,
          usedFallback: true,
          fallbackMethod: method.description
        };
      } else {
        console.log(`❌ Fallback method ${i + 1} failed: ${result.error}`);
      }
      
      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return {
      success: false,
      error: `All ${fallbackMethods.length} fallback methods failed`,
      action: action.description,
      triedAllFallbacks: true
    };
  }

  // Execute a single script and return result
  async executeSingleScript(script, description) {
    const formattedScript = `osascript -e '${script.replace(/'/g, "'\\''")}'`;
    
    return new Promise((resolve) => {
      exec(formattedScript, (error, stdout, stderr) => {
        if (error) {
          resolve({ 
            success: false, 
            error: error.message
          });
        } else {
          resolve({ 
            success: true, 
            output: stdout || stderr || "Completed"
          });
        }
      });
    });
  }

  // Main method: take screenshot, analyze, and execute action
  async performVisualGuidedAction(currentTask, stepDescription) {
    try {
      console.log(`🔍 Taking screenshot for: ${stepDescription}`);
      
      // Take screenshot
      const screenshotResult = await this.takeScreenshot();
      if (!screenshotResult.success) {
        return { success: false, error: "Failed to take screenshot" };
      }

      console.log(`📷 Screenshot saved: ${screenshotResult.path}`);
      
      // Analyze screenshot
      console.log(`🤖 Analyzing screenshot for task: ${currentTask}`);
      const actionResult = await this.analyzeScreenshotForAction(
        screenshotResult.path, 
        currentTask, 
        stepDescription
      );

      if (!actionResult.success) {
        return { success: false, error: "Failed to analyze screenshot" };
      }

      console.log(`🎯 AI suggested action: ${actionResult.description} (confidence: ${actionResult.confidence})`);
      
      // Execute the action
      const executionResult = await this.executeVisualAction(actionResult);
      
      // Clean up screenshot
      this.cleanupScreenshot(screenshotResult.path);
      
      return {
        success: executionResult.success,
        error: executionResult.error,
        action: actionResult.description,
        confidence: actionResult.confidence,
        executionDetails: executionResult
      };
    } catch (error) {
      console.error("Error in visual guided action:", error);
      return { success: false, error: error.message };
    }
  }

  // Clean up old screenshots
  cleanupScreenshot(screenshotPath) {
    try {
      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
        console.log(`🗑️  Cleaned up screenshot: ${screenshotPath}`);
      }
    } catch (error) {
      console.error("Error cleaning up screenshot:", error);
    }
  }

  // Clean up all old screenshots
  cleanupOldScreenshots() {
    try {
      const files = fs.readdirSync(this.screenshotDir);
      files.forEach(file => {
        const filePath = path.join(this.screenshotDir, file);
        const stats = fs.statSync(filePath);
        const ageInMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
        
        // Delete screenshots older than 10 minutes
        if (ageInMinutes > 10) {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Cleaned up old screenshot: ${file}`);
        }
      });
    } catch (error) {
      console.error("Error cleaning up old screenshots:", error);
    }
  }
}

module.exports = VisualGuidance; 