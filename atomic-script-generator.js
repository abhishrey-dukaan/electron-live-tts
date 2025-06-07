const https = require("https");
const VisualGuidance = require("./visual-guidance");

class AtomicScriptGenerator {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.visualGuidance = new VisualGuidance(apiKey);
  }

  // Generate a single atomic script for a specific action
  async generateAtomicScript(action, context = {}) {
    // Check if API key is available and valid
    if (!this.apiKey || 
        this.apiKey === 'your_anthropic_api_key_here' || 
        this.apiKey.includes('your_') ||
        this.apiKey.includes('_here') ||
        this.apiKey.trim() === '') {
      console.log("🔧 AtomicScriptGenerator: No valid API key available, using predefined scripts only");
      return { success: false, error: "API key not configured for script generation" };
    }

    const systemPrompt = `You are an expert AppleScript generator that creates SINGLE, ATOMIC scripts for specific actions. Each script should do ONE thing only.

CRITICAL SYNTAX RULES:
1. NEVER use 'type text' - it causes "Can't get text" errors
2. Use 'keystroke' for individual characters OR use the clipboard method
3. For typing URLs/text, use this clipboard pattern:
   set the clipboard to "text to type"
   keystroke "v" using command down

4. Always add proper delays between actions
5. Each script should be standalone and atomic

COMMON PATTERNS:

🔹 LAUNCH APP:
tell application "ApplicationName" to activate

🔹 TYPE TEXT (use clipboard method):
set the clipboard to "text here"
tell application "System Events" to keystroke "v" using command down

🔹 OPEN ADDRESS BAR:
tell application "System Events" to keystroke "l" using command down

🔹 PRESS ENTER:
tell application "System Events" to keystroke return

🔹 CLICK ELEMENT (use GUI scripting):
tell application "System Events"
    tell process "Safari"
        click button "Search" of window 1
    end tell
end tell

🔹 FIND AND CLICK SEARCH BOX:
tell application "System Events"
    tell process "Safari"
        set searchField to text field 1 of window 1
        click searchField
    end tell
end tell

CONTEXT: ${JSON.stringify(context)}
ACTION TO GENERATE SCRIPT FOR: ${action}

Return ONLY the AppleScript code - no explanations, no markdown, no formatting.`;

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
        { role: "user", content: systemPrompt },
      ],
    });

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
              resolve({ success: false, error: response.error.message });
            } else if (response.content && response.content.length > 0) {
              let script = response.content[0].text.trim();
              
              // Clean up any markdown formatting
              script = script.replace(/```applescript\n?/g, '');
              script = script.replace(/```\n?/g, '');
              script = script.replace(/^applescript\n?/g, '');
              script = script.trim();
              
              resolve({ success: true, script: script });
            } else {
              resolve({ success: false, error: "No script generated" });
            }
          } catch (error) {
            resolve({ success: false, error: error.message });
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

  // Predefined atomic scripts for common actions
  getPredefinedScript(action, params = {}) {
    const scripts = {
      // Browser actions
      'open_safari': 'tell application "Safari" to activate',
      'open_chrome': 'tell application "Google Chrome" to activate',
      'open_firefox': 'tell application "Firefox" to activate',
      
      // Address bar actions
      'focus_address_bar': `tell application "System Events" to keystroke "l" using command down`,
      
      // Text input using clipboard (fixes "Can't get text" error)
      'type_text': `set the clipboard to "${params.text || ''}"
tell application "System Events"
    delay 0.5
    keystroke "v" using command down
end tell`,
      
      // Navigation
      'press_enter': 'tell application "System Events" to keystroke return',
      'press_tab': 'tell application "System Events" to keystroke tab',
      'press_escape': 'tell application "System Events" to key code 53',
      
      // Common keyboard shortcuts
      'cmd_f': 'tell application "System Events" to keystroke "f" using command down',
      'cmd_t': 'tell application "System Events" to keystroke "t" using command down',
      'cmd_w': 'tell application "System Events" to keystroke "w" using command down',
      'cmd_r': 'tell application "System Events" to keystroke "r" using command down',
      
      // Screenshots
      'screenshot': 'tell application "System Events" to keystroke "3" using {command down, shift down}',
      
      // Volume control
      'volume_up': 'set volume output volume ((output volume of (get volume settings)) + 10)',
      'volume_down': 'set volume output volume ((output volume of (get volume settings)) - 10)',
      
      // Common app launches
      'open_finder': 'tell application "Finder" to activate',
      'open_terminal': 'tell application "Terminal" to activate',
      'open_textedit': 'tell application "TextEdit" to activate',
      'open_notes': 'tell application "Notes" to activate',
      'open_calendar': 'tell application "Calendar" to activate',
      'open_mail': 'tell application "Mail" to activate',
      
      // System actions
      'lock_screen': 'tell application "System Events" to keystroke "q" using {control down, command down}',
      'sleep': 'tell application "System Events" to sleep',
      
      // Wait/delay
      'wait_short': 'delay 1',
      'wait_medium': 'delay 2',
      'wait_long': 'delay 3',
    };

    return scripts[action] || null;
  }

  // Format script for execution
  formatForExecution(script) {
    // Clean up the script
    let cleanScript = script.trim();
    
    // Escape single quotes for shell execution
    const escapedScript = cleanScript.replace(/'/g, "'\\''");
    
    return `osascript -e '${escapedScript}'`;
  }

  // Create a step object for the task orchestrator
  createStep(stepNumber, type, description, script, options = {}) {
    return {
      stepNumber,
      type,
      description,
      script,
      formattedScript: this.formatForExecution(script),
      delayAfter: options.delayAfter || 1000,
      continueOnError: options.continueOnError || false,
      retryCount: options.retryCount || 0,
      maxRetries: options.maxRetries || 2
    };
  }

  // Generate YouTube-specific steps with visual guidance
  async generateYouTubeSteps(searchQuery) {
    const steps = [];
    
    // Step 1: Open Safari
    steps.push(this.createStep(
      1,
      "APP_LAUNCH",
      "Open Safari browser",
      this.getPredefinedScript('open_safari'),
      { delayAfter: 2000 }
    ));

    // Step 2: Focus address bar
    steps.push(this.createStep(
      2,
      "GUI_INTERACTION",
      "Focus address bar",
      this.getPredefinedScript('focus_address_bar'),
      { delayAfter: 500 }
    ));

    // Step 3: Type YouTube URL
    steps.push(this.createStep(
      3,
      "GUI_INTERACTION",
      "Navigate to YouTube",
      this.getPredefinedScript('type_text', { text: "youtube.com" }),
      { delayAfter: 500 }
    ));

    // Step 4: Press Enter to navigate
    steps.push(this.createStep(
      4,
      "GUI_INTERACTION",
      "Navigate to YouTube",
      this.getPredefinedScript('press_enter'),
      { delayAfter: 4000 } // Wait longer for YouTube to load
    ));

    // Step 5: Visual guidance to find and click search box
    steps.push(this.createStep(
      5,
      "VISUAL_GUIDANCE",
      `Find YouTube search box and click it`,
      "VISUAL_GUIDANCE_PLACEHOLDER",
      { 
        delayAfter: 1000,
        visualTask: `play ${searchQuery} on youtube`,
        visualStep: "Find and click YouTube search box"
      }
    ));

    // Step 6: Type search query using visual guidance
    steps.push(this.createStep(
      6,
      "VISUAL_GUIDANCE", 
      `Type "${searchQuery}" in search box`,
      "VISUAL_GUIDANCE_PLACEHOLDER",
      { 
        delayAfter: 1000,
        visualTask: `play ${searchQuery} on youtube`,
        visualStep: `Type "${searchQuery}" in the search box`
      }
    ));

    // Step 7: Press Enter or click search button
    steps.push(this.createStep(
      7,
      "VISUAL_GUIDANCE",
      "Execute search",
      "VISUAL_GUIDANCE_PLACEHOLDER",
      { 
        delayAfter: 3000,
        visualTask: `play ${searchQuery} on youtube`,
        visualStep: "Press Enter or click search button to execute search"
      }
    ));

    // Step 8: Click on first video result
    steps.push(this.createStep(
      8,
      "VISUAL_GUIDANCE",
      "Click on first video",
      "VISUAL_GUIDANCE_PLACEHOLDER",
      { 
        delayAfter: 2000,
        visualTask: `play ${searchQuery} on youtube`,
        visualStep: "Click on the first video in search results",
        continueOnError: true
      }
    ));

    return steps;
  }

  // Generate Google search steps with visual guidance
  async generateGoogleSearchSteps(searchQuery) {
    const steps = [];
    
    // Step 1: Open Safari
    steps.push(this.createStep(
      1,
      "APP_LAUNCH",
      "Open Safari browser",
      this.getPredefinedScript('open_safari'),
      { delayAfter: 2000 }
    ));

    // Step 2: Focus address bar
    steps.push(this.createStep(
      2,
      "GUI_INTERACTION",
      "Focus address bar",
      this.getPredefinedScript('focus_address_bar'),
      { delayAfter: 500 }
    ));

    // Step 3: Type Google URL
    steps.push(this.createStep(
      3,
      "GUI_INTERACTION",
      "Navigate to Google",
      this.getPredefinedScript('type_text', { text: "google.com" }),
      { delayAfter: 500 }
    ));

    // Step 4: Press Enter to navigate
    steps.push(this.createStep(
      4,
      "GUI_INTERACTION",
      "Navigate to Google",
      this.getPredefinedScript('press_enter'),
      { delayAfter: 3000 }
    ));

    // Step 5: Visual guidance to find and use search box
    steps.push(this.createStep(
      5,
      "VISUAL_GUIDANCE",
      `Find Google search box and click it`,
      "VISUAL_GUIDANCE_PLACEHOLDER",
      { 
        delayAfter: 1000,
        visualTask: `search for ${searchQuery} on google`,
        visualStep: "Find and click Google search box"
      }
    ));

    // Step 6: Type search query
    steps.push(this.createStep(
      6,
      "VISUAL_GUIDANCE",
      `Type "${searchQuery}" in search box`,
      "VISUAL_GUIDANCE_PLACEHOLDER",
      { 
        delayAfter: 1000,
        visualTask: `search for ${searchQuery} on google`,
        visualStep: `Type "${searchQuery}" in the search box`
      }
    ));

    // Step 7: Execute search
    steps.push(this.createStep(
      7,
      "VISUAL_GUIDANCE",
      "Execute search",
      "VISUAL_GUIDANCE_PLACEHOLDER",
      { 
        delayAfter: 2000,
        visualTask: `search for ${searchQuery} on google`,
        visualStep: "Press Enter or click search button to execute search"
      }
    ));

    return steps;
  }

  // Update the existing generateWebBrowsingSteps to use visual guidance when needed
  async generateWebBrowsingSteps(url, searchQuery = null) {
    if (url === "youtube.com" && searchQuery) {
      return await this.generateYouTubeSteps(searchQuery);
    }
    
    if (url === "google.com" && searchQuery) {
      return await this.generateGoogleSearchSteps(searchQuery);
    }

    // Fallback to original method for other URLs
    const steps = [];
    
    // Step 1: Open Safari
    steps.push(this.createStep(
      1,
      "APP_LAUNCH",
      "Open Safari browser",
      this.getPredefinedScript('open_safari'),
      { delayAfter: 2000 }
    ));

    // Step 2: Focus address bar
    steps.push(this.createStep(
      2,
      "GUI_INTERACTION",
      "Focus address bar",
      this.getPredefinedScript('focus_address_bar'),
      { delayAfter: 500 }
    ));

    // Step 3: Type URL
    steps.push(this.createStep(
      3,
      "GUI_INTERACTION",
      `Type URL: ${url}`,
      this.getPredefinedScript('type_text', { text: url }),
      { delayAfter: 500 }
    ));

    // Step 4: Press Enter
    steps.push(this.createStep(
      4,
      "GUI_INTERACTION",
      "Navigate to URL",
      this.getPredefinedScript('press_enter'),
      { delayAfter: 3000 }
    ));

    return steps;
  }
}

module.exports = AtomicScriptGenerator; 