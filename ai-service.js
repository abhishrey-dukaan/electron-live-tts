const https = require("https");

class AIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async getOSAScript(transcription) {
    if (typeof transcription !== "string") {
      return { error: "Transcription must be a string" };
    }

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
    };

    // Simplified prompt that focuses on directly generating runnable AppleScript
    const systemPrompt = `You are an expert at converting natural language requests into executable AppleScript commands. 
    
Your task is to generate a complete, ready-to-run AppleScript that accomplishes the user's request.

DO NOT output JSON. Output ONLY the runnable AppleScript code with NO markdown formatting or explanation.

Guidelines:
- Begin with necessary "tell application" blocks
- Include proper error handling where appropriate
- Ensure all "tell" blocks have matching "end tell" statements
- Use proper AppleScript syntax and conventions
- The output should be copy-pastable directly into an AppleScript file or Terminal
- For opening applications, use "tell application" blocks
- For system interactions, use "tell application \\"System Events\\""
- Always wrap string literals in double quotes and escape them properly

If the request cannot be automated with AppleScript, simply respond with: "ERROR: [brief explanation]"`;

    const data = JSON.stringify({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcription },
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
              response.choices &&
              response.choices.length > 0 &&
              response.choices[0].message
            ) {
              const script = response.choices[0].message.content.trim();

              // If the response starts with ERROR:, pass it through as an error
              if (script.startsWith("ERROR:")) {
                resolve({ error: script.substring(6).trim() });
              } else {
                // Format the script for execution
                const formattedScript = `osascript -e '${script.replace(
                  /'/g,
                  "'\\''"
                )}'`;

                // Return the script as a single step
                resolve({
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
