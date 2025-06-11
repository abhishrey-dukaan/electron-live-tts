const { exec } = require('child_process');

// Test commands
const commands = [
  {
    name: "Volume Up",
    command: "osascript -e 'set volume output volume ((output volume of (get volume settings)) + 20)'",
    type: "applescript"
  },
  {
    name: "Take Screenshot",
    command: "screencapture -i ~/Desktop/test-screenshot-$(date +%Y%m%d-%H%M%S).png",
    type: "shell"
  },
  {
    name: "Create Test Folder",
    command: 'osascript -e \'tell application "Finder" to make new folder at desktop with properties {name:"TestFolder-" & (do shell script "date +%s")}\'',
    type: "applescript"
  },
  {
    name: "Open Safari and Navigate",
    command: 'osascript -e \'tell application "Safari" to activate\' -e \'delay 1\' -e \'tell application "System Events"\' -e \'keystroke "l" using command down\' -e \'delay 0.5\' -e \'keystroke "github.com"\' -e \'key code 36\' -e \'end tell\'',
    type: "applescript"
  },
  {
    name: "Show Desktop",
    command: 'osascript -e \'tell application "System Events" to key code 103 using {command down, option down}\'',
    type: "applescript"
  },
  {
    name: "Open Notes and Create Note",
    command: 'osascript -e \'tell application "Notes" to activate\' -e \'delay 1\' -e \'tell application "System Events"\' -e \'keystroke "n" using command down\' -e \'delay 0.5\' -e \'keystroke "Test note created at " & (current date)\' -e \'end tell\'',
    type: "applescript"
  },
  {
    name: "Search Spotlight",
    command: 'osascript -e \'tell application "System Events"\' -e \'keystroke space using command down\' -e \'delay 0.5\' -e \'keystroke "calculator"\' -e \'delay 0.5\' -e \'key code 36\' -e \'end tell\'',
    type: "applescript"
  },
  {
    name: "Volume Down",
    command: "osascript -e 'set volume output volume ((output volume of (get volume settings)) - 20)'",
    type: "applescript"
  },
  {
    name: "Create and Write to File",
    command: 'echo "Test file created at $(date)" > ~/Desktop/test-file-$(date +%s).txt',
    type: "shell"
  },
  {
    name: "System Information",
    command: 'osascript -e \'tell application "System Events" to display dialog "System Info:\n" & "Memory: " & (do shell script "vm_stat | awk \\"/free/ {print \\\\$3}\\"") & " pages free\n" & "CPU: " & (do shell script "sysctl -n machdep.cpu.brand_string") & "\n" & "OS Version: " & (do shell script "sw_vers -productVersion")\'',
    type: "applescript"
  },
  {
    name: "Open Safari and Search Multiple Tabs",
    command: `osascript -e '
      tell application "Safari"
        activate
        make new document
        set URL of document 1 to "https://github.com"
        delay 1
        make new document
        set URL of document 2 to "https://google.com"
        delay 1
        make new document
        set URL of document 3 to "https://apple.com"
      end tell'`,
    type: "applescript"
  },
  {
    name: "Create Project Structure",
    command: `mkdir -p ~/Desktop/test-project/{src,tests,docs}/{components,utils,styles} && 
              touch ~/Desktop/test-project/README.md && 
              echo "# Test Project\\nCreated at $(date)" > ~/Desktop/test-project/README.md`,
    type: "shell"
  },
  {
    name: "Smart Window Management",
    command: `osascript -e '
      tell application "System Events"
        -- First arrange Safari windows
        tell application "Safari" to activate
        delay 1
        tell process "Safari"
          repeat with w in windows
            try
              set {x, y} to position of w
              if x > 0 and y > 0 then
                set position of w to {0, 0}
                set size of w to {800, 600}
                exit repeat
              end if
            end try
          end repeat
        end tell
        
        -- Then arrange Finder windows
        tell application "Finder" to activate
        delay 1
        tell process "Finder"
          repeat with w in windows
            try
              set position of w to {800, 0}
              set size of w to {800, 600}
              exit repeat
            end try
          end repeat
        end tell
      end tell'`,
    type: "applescript"
  },
  {
    name: "Advanced Screenshot Workflow",
    command: 'if screencapture -i ~/Desktop/temp_screenshot.png; then\n' +
             '  if [ -f ~/Desktop/temp_screenshot.png ]; then\n' +
             '    echo "Screenshot captured successfully"\n' +
             '    sips -Z 1024 ~/Desktop/temp_screenshot.png --out ~/Desktop/resized_screenshot.png && \n' +
             '    sips -s format jpeg ~/Desktop/resized_screenshot.png --out ~/Desktop/final_screenshot.jpg && \n' +
             '    rm ~/Desktop/temp_screenshot.png ~/Desktop/resized_screenshot.png &&\n' +
             '    echo "Screenshot processed and saved as final_screenshot.jpg"\n' +
             '  else\n' +
             '    echo "Screenshot capture was cancelled"\n' +
             '  fi\n' +
             'else\n' +
             '  echo "Screenshot capture failed"\n' +
             'fi',
    type: "shell"
  },
  {
    name: "Smart Workspace Setup",
    command: `osascript -e '
      tell application "System Events"
        -- Create new desktop space
        keystroke "n" using {control down, command down}
        delay 1
        
        -- Open and arrange apps
        tell application "Safari" to activate
        delay 1
        tell application "Terminal" to activate
        delay 1
        tell application "Notes" to activate
        delay 1
        
        -- Arrange windows using Mission Control
        key code 126 using {control down}
        delay 1
        
        -- Move back to main space
        key code 124 using {control down}
      end tell'`,
    type: "applescript"
  },
  {
    name: "Advanced File Organization",
    command: `mkdir -p ~/Desktop/organized/{images,documents,scripts} && 
              find ~/Desktop -maxdepth 1 -type f \\( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \\) -exec mv {} ~/Desktop/organized/images/ \\; && 
              find ~/Desktop -maxdepth 1 -type f \\( -name "*.pdf" -o -name "*.doc" -o -name "*.txt" \\) -exec mv {} ~/Desktop/organized/documents/ \\; && 
              find ~/Desktop -maxdepth 1 -type f \\( -name "*.sh" -o -name "*.js" -o -name "*.py" \\) -exec mv {} ~/Desktop/organized/scripts/ \\;`,
    type: "shell"
  },
  {
    name: "Smart System Report",
    command: `osascript -e '
      set reportPath to (path to desktop folder as text) & "system_report.txt"
      set reportContent to ""
      
      -- Get system info
      set cpuInfo to do shell script "sysctl -n machdep.cpu.brand_string"
      set memInfo to do shell script "vm_stat | awk \\"/free/ {print \\\\$3}\\""
      set diskInfo to do shell script "df -h / | tail -n 1 | awk \\"{print \\\\$4}\\""
      set osInfo to do shell script "sw_vers -productVersion"
      
      -- Get running apps
      tell application "System Events"
        set runningApps to name of every process where background only is false
      end tell
      
      -- Create report
      set reportContent to "System Report - " & (current date) & "
CPU: " & cpuInfo & "
Memory Free: " & memInfo & " pages
Disk Space: " & diskInfo & " available
OS Version: " & osInfo & "

Running Applications:
" & runningApps & "

Network Interfaces:
" & (do shell script "ifconfig | grep inet")
      
      -- Save report
      do shell script "echo " & quoted form of reportContent & " > " & quoted form of POSIX path of reportPath
      
      -- Show notification
      display notification "System report saved to Desktop" with title "Report Generated"'`,
    type: "applescript"
  },
  {
    name: "Advanced Productivity Setup",
    command: `osascript -e '
      -- Set up work environment
      tell application "Reminders"
        tell list "Reminders"
          make new reminder with properties {name:"Start work session", due date:current date}
          make new reminder with properties {name:"Take a break", due date:(current date) + 3600}
        end tell
      end tell
      
      tell application "Notes"
        tell account "iCloud"
          make new note with properties {name:"Work Session - " & (current date as string), body:"Goals for this session:\\n- "}
        end tell
      end tell
      
      tell application "Calendar"
        tell calendar "Home"
          make new event with properties {summary:"Focus Time", start date:current date, end date:(current date) + 7200}
        end tell
      end tell
      
      tell application "System Events"
        -- Toggle Do Not Disturb (different for different macOS versions)
        try
          tell process "Control Center"
            click menu bar item "Focus" of menu bar 1
            delay 0.5
            click button "Do Not Disturb" of window 1
          end tell
        end try
        
        -- Show notification
        display notification "Work environment ready" with title "Productivity Setup" subtitle "Focus mode activated"
      end tell'`,
    type: "applescript"
  }
];

// Execute commands with delay
async function runCommands() {
  for (const cmd of commands) {
    console.log(`\n📝 Executing: ${cmd.name}`);
    try {
      const result = await new Promise((resolve, reject) => {
        exec(cmd.command, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout);
          }
        });
      });
      console.log(`✅ Success: ${cmd.name}`);
      if (result) console.log(result);
      // Wait 5 seconds between commands
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`❌ Error executing ${cmd.name}:`, error.message);
    }
  }
}

// Run the test
console.log('🚀 Starting advanced automation tests...');
runCommands().then(() => {
  console.log('\n✨ All tests completed!');
}).catch(console.error); 