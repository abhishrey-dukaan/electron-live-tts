const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * AppDiscovery class for discovering and managing applications on macOS
 */
class AppDiscovery {
  constructor() {
    this.applications = new Map();
    this.lastScanTime = null;
    this.scanInterval = 300000; // 5 minutes in milliseconds
    this.isInitialized = false;
  }

  /**
   * Initialize the app discovery system
   */
  async init() {
    try {
      console.log('🔍 Initializing app discovery...');
      await this.scanApplications();
      this.isInitialized = true;
      console.log(`✅ App discovery initialized with ${this.applications.size} applications`);
    } catch (error) {
      console.error('❌ Failed to initialize app discovery:', error);
      throw error;
    }
  }

  /**
   * Scan for applications on the system
   */
  async scanApplications() {
    const appPaths = [
      '/Applications',
      '/System/Applications',
      '/System/Library/CoreServices',
      path.join(process.env.HOME, 'Applications')
    ];

    const allApps = new Map();

    for (const appPath of appPaths) {
      if (fs.existsSync(appPath)) {
        const apps = await this.scanDirectory(appPath);
        apps.forEach((app, name) => {
          if (!allApps.has(name) || app.priority > (allApps.get(name).priority || 0)) {
            allApps.set(name, app);
          }
        });
      }
    }

    // Add common system applications
    const systemApps = this.getSystemApplications();
    systemApps.forEach((app, name) => {
      allApps.set(name, app);
    });

    this.applications = allApps;
    this.lastScanTime = Date.now();
  }

  /**
   * Scan a directory for applications
   */
  async scanDirectory(dirPath) {
    return new Promise((resolve) => {
      const apps = new Map();
      
      fs.readdir(dirPath, (err, files) => {
        if (err) {
          console.warn(`Warning: Could not read directory ${dirPath}:`, err.message);
          resolve(apps);
          return;
        }

        files.forEach(file => {
          if (file.endsWith('.app')) {
            const appName = file.replace('.app', '');
            const fullPath = path.join(dirPath, file);
            
            // Determine priority based on location
            let priority = 1;
            if (dirPath === '/Applications') priority = 3;
            else if (dirPath === '/System/Applications') priority = 2;
            else if (dirPath.includes('CoreServices')) priority = 1;

            apps.set(appName.toLowerCase(), {
              name: appName,
              path: fullPath,
              bundle: file,
              priority: priority,
              type: 'application'
            });

            // Add common aliases
            const aliases = this.getAppAliases(appName.toLowerCase());
            aliases.forEach(alias => {
              apps.set(alias, {
                name: appName,
                path: fullPath,
                bundle: file,
                priority: priority,
                type: 'application',
                alias: true
              });
            });
          }
        });

        resolve(apps);
      });
    });
  }

  /**
   * Get common aliases for applications
   */
  getAppAliases(appName) {
    const aliases = {
      'google chrome': ['chrome', 'browser'],
      'safari': ['browser'],
      'firefox': ['browser'],
      'arc': ['browser'],
      'visual studio code': ['vscode', 'vs code', 'code'],
      'microsoft word': ['word'],
      'microsoft excel': ['excel'],
      'microsoft powerpoint': ['powerpoint'],
      'adobe photoshop': ['photoshop'],
      'adobe illustrator': ['illustrator'],
      'final cut pro': ['final cut'],
      'logic pro': ['logic'],
      'system preferences': ['preferences', 'settings'],
      'activity monitor': ['task manager'],
      'terminal': ['command line', 'cmd'],
      'finder': ['file manager'],
      'mail': ['email'],
      'messages': ['imessage'],
      'facetime': ['video call'],
      'music': ['itunes'],
      'tv': ['apple tv'],
      'photos': ['photo'],
      'preview': ['pdf viewer'],
      'calculator': ['calc'],
      'calendar': ['cal'],
      'contacts': ['address book'],
      'notes': ['note'],
      'reminders': ['reminder'],
      'maps': ['map'],
      'weather': [],
      'clock': ['time'],
      'stocks': ['stock'],
      'news': [],
      'voice memos': ['voice memo', 'recorder'],
      'home': ['homekit'],
      'shortcuts': ['automator'],
      'disk utility': ['disk'],
      'keychain access': ['keychain'],
      'console': ['log viewer'],
      'bluetooth screen lock': ['bluetooth lock']
    };

    return aliases[appName] || [];
  }

  /**
   * Get system applications that might not be in standard app directories
   */
  getSystemApplications() {
    const systemApps = new Map();

    const coreServices = [
      { name: 'Finder', bundle: 'Finder.app', path: '/System/Library/CoreServices/Finder.app' },
      { name: 'Dock', bundle: 'Dock.app', path: '/System/Library/CoreServices/Dock.app' },
      { name: 'Spotlight', bundle: 'Spotlight.app', path: '/System/Library/CoreServices/Spotlight.app' }
    ];

    coreServices.forEach(app => {
      if (fs.existsSync(app.path)) {
        systemApps.set(app.name.toLowerCase(), {
          name: app.name,
          path: app.path,
          bundle: app.bundle,
          priority: 2,
          type: 'system'
        });
      }
    });

    return systemApps;
  }

  /**
   * Find an application by name or alias
   */
  findApp(searchTerm) {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return null;
    }

    const normalizedSearch = searchTerm.toLowerCase().trim();
    
    // Direct match
    if (this.applications.has(normalizedSearch)) {
      return this.applications.get(normalizedSearch);
    }

    // Partial match
    const partialMatches = Array.from(this.applications.entries())
      .filter(([name, app]) => 
        name.includes(normalizedSearch) || 
        app.name.toLowerCase().includes(normalizedSearch)
      )
      .sort((a, b) => b[1].priority - a[1].priority);

    if (partialMatches.length > 0) {
      return partialMatches[0][1];
    }

    // Fuzzy match for common typos
    const fuzzyMatches = Array.from(this.applications.entries())
      .filter(([name, app]) => this.fuzzyMatch(normalizedSearch, name))
      .sort((a, b) => b[1].priority - a[1].priority);

    if (fuzzyMatches.length > 0) {
      return fuzzyMatches[0][1];
    }

    return null;
  }

  /**
   * Simple fuzzy matching for common typos
   */
  fuzzyMatch(search, target) {
    if (Math.abs(search.length - target.length) > 2) return false;
    
    let searchIndex = 0;
    let targetIndex = 0;
    let mistakes = 0;
    
    while (searchIndex < search.length && targetIndex < target.length) {
      if (search[searchIndex] === target[targetIndex]) {
        searchIndex++;
        targetIndex++;
      } else {
        mistakes++;
        if (mistakes > 2) return false;
        
        // Try skipping one character in search
        if (searchIndex + 1 < search.length && search[searchIndex + 1] === target[targetIndex]) {
          searchIndex += 2;
          targetIndex++;
        }
        // Try skipping one character in target
        else if (targetIndex + 1 < target.length && search[searchIndex] === target[targetIndex + 1]) {
          searchIndex++;
          targetIndex += 2;
        }
        // Character substitution
        else {
          searchIndex++;
          targetIndex++;
        }
      }
    }
    
    return mistakes <= 2;
  }

  /**
   * Launch an application
   */
  async launch(app) {
    if (!app) {
      return { success: false, error: 'No app provided' };
    }

    return new Promise((resolve) => {
      const command = `open -a "${app.name}"`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Failed to launch ${app.name}:`, error);
          resolve({ 
            success: false, 
            error: `Failed to launch ${app.name}: ${error.message}` 
          });
        } else {
          console.log(`✅ Launched ${app.name}`);
          resolve({ 
            success: true, 
            message: `Successfully launched ${app.name}` 
          });
        }
      });
    });
  }

  /**
   * Quit an application
   */
  async quit(app) {
    if (!app) {
      return { success: false, error: 'No app provided' };
    }

    return new Promise((resolve) => {
      const command = `osascript -e 'tell application "${app.name}" to quit'`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Failed to quit ${app.name}:`, error);
          resolve({ 
            success: false, 
            error: `Failed to quit ${app.name}: ${error.message}` 
          });
        } else {
          console.log(`✅ Quit ${app.name}`);
          resolve({ 
            success: true, 
            message: `Successfully quit ${app.name}` 
          });
        }
      });
    });
  }

  /**
   * Check if a re-scan is needed
   */
  needsRescan() {
    if (!this.lastScanTime) return true;
    return Date.now() - this.lastScanTime > this.scanInterval;
  }

  /**
   * Get all discovered applications
   */
  getAllApps() {
    return Array.from(this.applications.values())
      .filter(app => !app.alias)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get application count
   */
  getAppCount() {
    return Array.from(this.applications.values())
      .filter(app => !app.alias).length;
  }

  /**
   * Force refresh application list
   */
  async refresh() {
    await this.scanApplications();
  }
}

module.exports = AppDiscovery; 