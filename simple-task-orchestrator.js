const { exec } = require('child_process');

class SimpleTaskOrchestrator {
  constructor() {
    this.isExecuting = false;
  }

  async executeTask(transcript) {
    console.log(`📥 Simple task: "${transcript}"`);
    
    const command = transcript.toLowerCase().trim();
    
    // Basic keyboard commands
    if (command.includes('press tab') || command === 'tab') {
      return this.executeAppleScript('tell application "System Events" to keystroke "tab"');
    }
    
    if (command.includes('press enter') || command.includes('click ok') || command.includes('click okay')) {
      return this.executeAppleScript('tell application "System Events" to keystroke return');
    }
    
    if (command.includes('press escape') || command.includes('click cancel')) {
      return this.executeAppleScript('tell application "System Events" to key code 53');
    }
    
    if (command.includes('press space')) {
      return this.executeAppleScript('tell application "System Events" to keystroke " "');
    }
    
    // Browser navigation
    if (command.includes('go to youtube') || command.includes('open youtube')) {
      return this.openYouTube();
    }
    
    // Search commands - simple approach
    if (command.includes('search for')) {
      const searchTerm = command.replace('search for', '').trim();
      return this.searchYouTube(searchTerm);
    }
    
    // Volume controls
    if (command.includes('volume up') || command.includes('increase volume')) {
      return this.executeShell('osascript -e "set volume output volume (output volume of (get volume settings) + 10)"');
    }
    
    if (command.includes('volume down') || command.includes('decrease volume')) {
      return this.executeShell('osascript -e "set volume output volume (output volume of (get volume settings) - 10)"');
    }
    
    if (command.includes('mute')) {
      return this.executeShell('osascript -e "set volume with output muted"');
    }
    
    // System commands
    if (command.includes('take screenshot')) {
      return this.executeAppleScript('tell application "System Events" to keystroke "3" using {shift down, command down}');
    }
    
    if (command.includes('minimize window')) {
      return this.executeAppleScript('tell application "System Events" to keystroke "m" using command down');
    }
    
    return { success: false, error: `Unknown command: "${transcript}"` };
  }

  async openYouTube() {
    console.log('🎥 Opening YouTube in Safari...');
    return this.executeShell('open -a "Safari" "https://www.youtube.com"');
  }
  
  async searchYouTube(searchTerm) {
    console.log(`🔍 Searching YouTube for: ${searchTerm}`);
    
    // First activate Safari
    await this.executeAppleScript('tell application "Safari" to activate');
    await this.delay(1000);
    
    // Click in search area and type
    await this.executeAppleScript('tell application "System Events" to keystroke "f" using command down');
    await this.delay(500);
    await this.executeAppleScript(`tell application "System Events" to keystroke "${searchTerm}"`);
    await this.delay(500);
    await this.executeAppleScript('tell application "System Events" to key code 36'); // Enter
    
    return { success: true, message: `Searched for: ${searchTerm}` };
  }

  async executeAppleScript(script) {
    console.log(`[AppleScript] ${script}`);
    
    return new Promise((resolve) => {
      // Properly escape quotes
      const escapedScript = script.replace(/"/g, '\\"');
      exec(`osascript -e "${escapedScript}"`, (error, stdout, stderr) => {
        if (error) {
          console.error('[AppleScript] Error:', error.message);
          resolve({ success: false, error: error.message });
        } else {
          console.log('[AppleScript] Success');
          resolve({ success: true, message: 'Command executed successfully' });
        }
      });
    });
  }
  
  async executeShell(command) {
    console.log(`[Shell] ${command}`);
    
    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('[Shell] Error:', error.message);
          resolve({ success: false, error: error.message });
        } else {
          console.log('[Shell] Success');
          resolve({ success: true, message: stdout.trim() || 'Command executed successfully' });
        }
      });
    });
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SimpleTaskOrchestrator; 