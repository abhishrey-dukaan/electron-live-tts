const https = require("https");

class AIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.customSystemPrompt = null;
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

  async getOSAScript(transcription) {
    if (typeof transcription !== "string") {
      return { error: "Transcription must be a string" };
    }

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

    // Use custom system prompt if available, otherwise use default
    const basePrompt = this.getSystemPrompt();
    const systemPrompt = `${basePrompt}

Current user command: "${transcription}"

Generate the AppleScript to accomplish this task:`;

    const data = JSON.stringify({
      model: "claude-3-sonnet-20240229",
      max_tokens: 2048,
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
              resolve({ error: response.error.message });
            } else if (
              response.content &&
              response.content.length > 0 &&
              response.content[0].text
            ) {
              const script = response.content[0].text.trim();

              // If the response starts with ERROR:, pass it through as an error
              if (script.startsWith("ERROR:")) {
                resolve({ error: script.substring(6).trim() });
              } else {
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
                resolve({
                  success: true,
                  steps: [
                    {
                      stepNumber: 1,
                      script: formattedScript,
                    },
                  ],
                });
              }
            } else {
              resolve({ error: "Unexpected API response format" });
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
}

module.exports = AIService;
