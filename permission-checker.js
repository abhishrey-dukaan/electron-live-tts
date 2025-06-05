const { exec } = require("child_process");

class PermissionChecker {
  constructor() {
    this.permissionCallbacks = {};
  }

  // Set callbacks for permission status updates
  setCallbacks(callbacks) {
    this.permissionCallbacks = callbacks;
  }

  // Check all required permissions
  async checkAllPermissions() {
    const permissions = {
      accessibility: await this.checkAccessibilityPermission(),
      screenRecording: await this.checkScreenRecordingPermission(),
      inputMonitoring: await this.checkInputMonitoringPermission(),
      automation: await this.checkAutomationPermission(),
      cliclick: await this.checkCliclickInstallation()
    };

    const allGranted = Object.values(permissions).every(p => p.granted);
    
    return {
      allGranted,
      permissions,
      summary: this.getPermissionSummary(permissions)
    };
  }

  // Check Accessibility Permission (required for System Events)
  async checkAccessibilityPermission() {
    return new Promise((resolve) => {
      // Test if we can use System Events by trying a simple operation
      const testScript = `osascript -e 'tell application "System Events" to get name of every application process whose visible is true'`;
      
      exec(testScript, (error, stdout, stderr) => {
        if (error) {
          // Check if it's specifically an accessibility permission error
          if (error.message.includes('not allowed assistive access') || 
              error.message.includes('accessibility') ||
              stderr.includes('not allowed assistive access')) {
            resolve({
              granted: false,
              required: true,
              name: "Accessibility",
              description: "Required for keyboard shortcuts, mouse clicks, and GUI automation",
              error: "Accessibility permission denied",
              instruction: "Open System Preferences → Security & Privacy → Privacy → Accessibility and add this app"
            });
          } else {
            // Other error, might still have permission
            resolve({
              granted: true,
              required: true,
              name: "Accessibility", 
              description: "Required for keyboard shortcuts, mouse clicks, and GUI automation",
              warning: "Permission check inconclusive but likely granted"
            });
          }
        } else {
          resolve({
            granted: true,
            required: true,
            name: "Accessibility",
            description: "Required for keyboard shortcuts, mouse clicks, and GUI automation"
          });
        }
      });
    });
  }

  // Check Screen Recording Permission (required for screenshots)
  async checkScreenRecordingPermission() {
    return new Promise((resolve) => {
      // Try to take a test screenshot
      const testCommand = 'screencapture -x /tmp/voicemac_permission_test.png 2>&1';
      
      exec(testCommand, (error, stdout, stderr) => {
        // Clean up test file
        exec('rm -f /tmp/voicemac_permission_test.png', () => {});
        
        if (error || stderr.includes('not authorized')) {
          resolve({
            granted: false,
            required: true,
            name: "Screen Recording",
            description: "Required for taking screenshots during automation failures",
            error: "Screen recording permission denied",
            instruction: "Open System Preferences → Security & Privacy → Privacy → Screen Recording and add this app"
          });
        } else {
          resolve({
            granted: true,
            required: true,
            name: "Screen Recording",
            description: "Required for taking screenshots during automation failures"
          });
        }
      });
    });
  }

  // Check Input Monitoring Permission (may be required for cliclick)
  async checkInputMonitoringPermission() {
    return new Promise((resolve) => {
      // Test cliclick mouse position command which requires input monitoring
      const testCommand = 'cliclick p 2>&1';
      
      exec(testCommand, (error, stdout, stderr) => {
        if (error || stderr.includes('not authorized') || stderr.includes('Input Monitoring')) {
          resolve({
            granted: false,
            required: true,
            name: "Input Monitoring", 
            description: "Required for precise mouse control and text input automation",
            error: "Input monitoring permission denied",
            instruction: "Open System Preferences → Security & Privacy → Privacy → Input Monitoring and add Terminal or this app"
          });
        } else if (stdout.includes(',')) {
          // cliclick p returns coordinates like "123,456"
          resolve({
            granted: true,
            required: true,
            name: "Input Monitoring",
            description: "Required for precise mouse control and text input automation"
          });
        } else {
          resolve({
            granted: false,
            required: true,
            name: "Input Monitoring",
            description: "Required for precise mouse control and text input automation",
            warning: "Permission status unclear - may need to be granted manually"
          });
        }
      });
    });
  }

  // Check Automation Permission (for controlling specific apps)
  async checkAutomationPermission() {
    return new Promise((resolve) => {
      // Test automation permission by trying to control Finder
      const testScript = `osascript -e 'tell application "Finder" to get name'`;
      
      exec(testScript, (error, stdout, stderr) => {
        if (error && (error.message.includes('not allowed') || 
                     stderr.includes('not allowed to send keystrokes'))) {
          resolve({
            granted: false,
            required: true,
            name: "Automation",
            description: "Required for controlling applications like browsers, Finder, etc.",
            error: "Automation permission denied for some applications",
            instruction: "When prompted, allow VoiceMac to control applications like Safari, Chrome, Finder, etc."
          });
        } else {
          resolve({
            granted: true,
            required: true,
            name: "Automation",
            description: "Required for controlling applications like browsers, Finder, etc."
          });
        }
      });
    });
  }

  // Check if cliclick is properly installed
  async checkCliclickInstallation() {
    return new Promise((resolve) => {
      exec('which cliclick', (error, stdout, stderr) => {
        if (error) {
          resolve({
            granted: false,
            required: true,
            name: "cliclick",
            description: "Command-line tool for precise mouse and keyboard control",
            error: "cliclick not installed",
            instruction: "Install cliclick using: brew install cliclick"
          });
        } else {
          // cliclick is installed, test if it works
          exec('cliclick -V', (versionError, versionStdout) => {
            if (versionError) {
              resolve({
                granted: false,
                required: true,
                name: "cliclick",
                description: "Command-line tool for precise mouse and keyboard control",
                error: "cliclick installed but not working properly",
                instruction: "Reinstall cliclick using: brew reinstall cliclick"
              });
            } else {
              resolve({
                granted: true,
                required: true,
                name: "cliclick",
                description: "Command-line tool for precise mouse and keyboard control",
                version: versionStdout.trim()
              });
            }
          });
        }
      });
    });
  }

  // Get a summary of permission status
  getPermissionSummary(permissions) {
    const total = Object.keys(permissions).length;
    const granted = Object.values(permissions).filter(p => p.granted).length;
    const denied = Object.values(permissions).filter(p => !p.granted).length;

    return {
      total,
      granted,
      denied,
      percentage: Math.round((granted / total) * 100)
    };
  }

  // Open System Preferences to specific privacy section
  async openPrivacySettings(section = 'Accessibility') {
    const sectionMap = {
      'Accessibility': 'Privacy_Accessibility',
      'Screen Recording': 'Privacy_ScreenCapture',
      'Input Monitoring': 'Privacy_ListenEvent'
    };

    const prefPane = sectionMap[section] || 'Privacy_Accessibility';
    const command = `open "x-apple.systempreferences:com.apple.preference.security?${prefPane}"`;
    
    return new Promise((resolve) => {
      exec(command, (error) => {
        if (error) {
          console.error('Failed to open System Preferences:', error);
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  // Install cliclick if not present
  async installCliclick() {
    return new Promise((resolve) => {
      // Check if brew is installed first
      exec('which brew', (brewError) => {
        if (brewError) {
          resolve({
            success: false,
            error: "Homebrew not installed. Please install Homebrew first: /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
          });
          return;
        }

        // Install cliclick using brew
        exec('brew install cliclick', (error, stdout, stderr) => {
          if (error) {
            resolve({
              success: false,
              error: `Failed to install cliclick: ${error.message}`,
              stderr: stderr
            });
          } else {
            resolve({
              success: true,
              message: "cliclick installed successfully",
              output: stdout
            });
          }
        });
      });
    });
  }

  // Notify about permission changes
  notifyPermissionChange(permissionName, granted) {
    if (this.permissionCallbacks.onPermissionChange) {
      this.permissionCallbacks.onPermissionChange(permissionName, granted);
    }
  }

  // Get detailed instructions for each permission
  getDetailedInstructions() {
    return {
      accessibility: {
        title: "Enable Accessibility Access",
        steps: [
          "Open System Preferences → Security & Privacy",
          "Click on the Privacy tab",
          "Select 'Accessibility' from the left sidebar",
          "Click the lock icon and enter your password",
          "Add VoiceMac or Terminal to the list",
          "Ensure the checkbox next to the app is checked"
        ],
        importance: "Critical - Required for all keyboard shortcuts and GUI automation"
      },
      screenRecording: {
        title: "Allow Screen Recording",
        steps: [
          "Open System Preferences → Security & Privacy",
          "Click on the Privacy tab", 
          "Select 'Screen Recording' from the left sidebar",
          "Click the lock icon and enter your password",
          "Add VoiceMac or Terminal to the list",
          "Restart the app if prompted"
        ],
        importance: "Important - Needed for taking screenshots when automation fails"
      },
      inputMonitoring: {
        title: "Enable Input Monitoring",
        steps: [
          "Open System Preferences → Security & Privacy",
          "Click on the Privacy tab",
          "Select 'Input Monitoring' from the left sidebar", 
          "Click the lock icon and enter your password",
          "Add VoiceMac or Terminal to the list",
          "Restart the app if prompted"
        ],
        importance: "Critical - Required for precise mouse control and text input"
      },
      automation: {
        title: "Allow App Automation",
        steps: [
          "When prompted, click 'OK' to allow VoiceMac to control other applications",
          "If no prompt appears, the permission may already be granted",
          "For specific apps, go to System Preferences → Security & Privacy → Privacy → Automation",
          "Ensure VoiceMac has checkboxes enabled for Safari, Chrome, Finder, etc."
        ],
        importance: "Critical - Required for controlling browsers and other applications"
      },
      cliclick: {
        title: "Install cliclick",
        steps: [
          "Install Homebrew if not already installed:",
          "/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"",
          "Install cliclick using Homebrew:",
          "brew install cliclick",
          "Verify installation: cliclick -V"
        ],
        importance: "Critical - Required for precise mouse movements and clicks"
      }
    };
  }
}

module.exports = PermissionChecker; 