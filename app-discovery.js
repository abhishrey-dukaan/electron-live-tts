const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class AppDiscovery {
  constructor() {
    this.applications = new Map();
    this.isInitialized = false;
    this.supportedPlatform = process.platform === 'darwin'; // Currently only macOS
  }

  async init() {
    if (!this.supportedPlatform) {
      console.log('⚠️ App Discovery: Currently only supported on macOS');
      this.isInitialized = true;
      return;
    }

    try {
      console.log('🔍 App Discovery: Scanning installed applications...');
      await this.scanApplications();
      this.isInitialized = true;
      console.log(`✅ App Discovery: Found ${this.applications.size} applications`);
    } catch (error) {
      console.error('❌ App Discovery initialization failed:', error);
      this.isInitialized = true; // Set to true anyway to prevent blocking
    }
  }

  async scanApplications() {
    if (!this.supportedPlatform) return;

    // Scan common application directories on macOS
    const appDirs = [
      '/Applications',
      '/System/Applications',
      path.join(process.env.HOME, 'Applications')
    ];

    for (const dir of appDirs) {
      if (fs.existsSync(dir)) {
        await this.scanDirectory(dir);
      }
    }

    // Add some common applications manually
    this.addCommonApplications();
  }

  async scanDirectory(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        if (item.endsWith('.app')) {
          const appName = item.replace('.app', '');
          const fullPath = path.join(dirPath, item);
          
          // Extract app info
          const appInfo = {
            name: appName,
            path: fullPath,
            aliases: this.generateAliases(appName),
            isInstalled: true
          };
          
          this.applications.set(appName.toLowerCase(), appInfo);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not scan directory ${dirPath}:`, error.message);
    }
  }

  generateAliases(appName) {
    const aliases = [appName.toLowerCase()];
    
    // Add common aliases
    const aliasMap = {
      'Google Chrome': ['chrome', 'browser'],
      'Safari': ['safari', 'browser'],
      'Firefox': ['firefox', 'browser'],
      'Arc': ['arc', 'browser'],
      'Visual Studio Code': ['vscode', 'code', 'vs code'],
      'Terminal': ['terminal', 'shell', 'command line'],
      'Finder': ['finder', 'file manager', 'files'],
      'Notes': ['notes', 'note'],
      'Mail': ['mail', 'email'],
      'Messages': ['messages', 'imessage', 'text'],
      'Calendar': ['calendar', 'cal'],
      'Photos': ['photos', 'pictures'],
      'Music': ['music', 'apple music'],
      'Spotify': ['spotify', 'music'],
      'Discord': ['discord', 'chat'],
      'Slack': ['slack', 'chat'],
      'Calculator': ['calculator', 'calc'],
      'System Preferences': ['preferences', 'settings', 'system preferences'],
      'Activity Monitor': ['activity monitor', 'task manager'],
      'Keychain Access': ['keychain', 'passwords'],
      'TextEdit': ['textedit', 'text editor', 'notepad']
    };

    if (aliasMap[appName]) {
      aliases.push(...aliasMap[appName]);
    }

    // Add variations
    aliases.push(appName.toLowerCase().replace(/\s+/g, ''));
    aliases.push(appName.toLowerCase().replace(/\s+/g, '-'));

    return [...new Set(aliases)]; // Remove duplicates
  }

  addCommonApplications() {
    // Add system applications that might not be in /Applications
    const systemApps = [
      { name: 'Finder', path: '/System/Library/CoreServices/Finder.app' },
      { name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app' },
      { name: 'System Preferences', path: '/System/Applications/System Preferences.app' },
      { name: 'Calculator', path: '/System/Applications/Calculator.app' },
      { name: 'TextEdit', path: '/System/Applications/TextEdit.app' },
      { name: 'Preview', path: '/System/Applications/Preview.app' },
      { name: 'QuickTime Player', path: '/System/Applications/QuickTime Player.app' },
      { name: 'Activity Monitor', path: '/System/Applications/Utilities/Activity Monitor.app' },
      { name: 'Keychain Access', path: '/System/Applications/Utilities/Keychain Access.app' }
    ];

    for (const app of systemApps) {
      if (fs.existsSync(app.path)) {
        const appInfo = {
          name: app.name,
          path: app.path,
          aliases: this.generateAliases(app.name),
          isInstalled: true,
          isSystem: true
        };
        this.applications.set(app.name.toLowerCase(), appInfo);
      }
    }
  }

  findApplication(query) {
    if (!this.isInitialized || !this.supportedPlatform) {
      return null;
    }

    const searchQuery = query.toLowerCase().trim();
    
    // First, try exact name match
    if (this.applications.has(searchQuery)) {
      return this.applications.get(searchQuery);
    }

    // Then, search through aliases
    for (const [name, app] of this.applications) {
      if (app.aliases.some(alias => alias === searchQuery)) {
        return app;
      }
    }

    // Finally, try partial matches
    for (const [name, app] of this.applications) {
      if (name.includes(searchQuery) || app.aliases.some(alias => alias.includes(searchQuery))) {
        return app;
      }
    }

    return null;
  }

  async openApplication(appName) {
    if (!this.supportedPlatform) {
      throw new Error('App opening not supported on this platform');
    }

    const app = this.findApplication(appName);
    
    if (!app) {
      // Try to open by name anyway
      return new Promise((resolve, reject) => {
        exec(`open -a "${appName}"`, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Failed to open ${appName}: ${error.message}`));
          } else {
            resolve({ success: true, message: `Opened ${appName}` });
          }
        });
      });
    }

    return new Promise((resolve, reject) => {
      exec(`open "${app.path}"`, (error, stdout, stderr) => {
        if (error) {
          // Fallback to opening by name
          exec(`open -a "${app.name}"`, (fallbackError, fallbackStdout, fallbackStderr) => {
            if (fallbackError) {
              reject(new Error(`Failed to open ${app.name}: ${fallbackError.message}`));
            } else {
              resolve({ success: true, message: `Opened ${app.name}` });
            }
          });
        } else {
          resolve({ success: true, message: `Opened ${app.name}` });
        }
      });
    });
  }

  async quitApplication(appName) {
    if (!this.supportedPlatform) {
      throw new Error('App quitting not supported on this platform');
    }

    const app = this.findApplication(appName);
    const targetName = app ? app.name : appName;

    return new Promise((resolve, reject) => {
      exec(`osascript -e 'tell application "${targetName}" to quit'`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to quit ${targetName}: ${error.message}`));
        } else {
          resolve({ success: true, message: `Quit ${targetName}` });
        }
      });
    });
  }

  getApplicationList() {
    if (!this.isInitialized) return [];
    
    return Array.from(this.applications.values()).map(app => ({
      name: app.name,
      aliases: app.aliases,
      isSystem: app.isSystem || false
    }));
  }

  isApplicationInstalled(appName) {
    return this.findApplication(appName) !== null;
  }

  // Get suggestions for partial app names
  getSuggestions(partialName) {
    if (!this.isInitialized || !partialName) return [];

    const query = partialName.toLowerCase();
    const suggestions = [];

    for (const [name, app] of this.applications) {
      if (name.includes(query) || app.aliases.some(alias => alias.includes(query))) {
        suggestions.push({
          name: app.name,
          aliases: app.aliases.filter(alias => alias.includes(query))
        });
      }
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }
}

module.exports = AppDiscovery; 