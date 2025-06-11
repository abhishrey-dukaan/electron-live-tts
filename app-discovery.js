const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

class AppDiscovery {
  constructor() {
    this.apps = [];
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }
    console.log("🔍 Initializing App Discovery...");
    try {
      this.apps = await this.findInstalledApps();
      this.initialized = true;
      console.log(`✅ App Discovery initialized with ${this.apps.length} applications found.`);
    } catch (error) {
      console.error("❌ Error initializing App Discovery:", error);
      this.initialized = false;
    }
  }

  findInstalledApps() {
    return new Promise((resolve, reject) => {
      const appDirectories = [
        "/Applications",
        "/System/Applications",
        "/System/Applications/Utilities",
        path.join(process.env.HOME, "Applications"),
      ];

      const command = `mdfind 'kMDItemContentType == "com.apple.application-bundle"' -onlyin ${appDirectories.join(" -onlyin ")}`;

      exec(command, (err, stdout, stderr) => {
        if (err) {
          console.error("Error using mdfind, falling back to fs.readdir:", err);
          return this.fallbackFindApps(appDirectories).then(resolve).catch(reject);
        }
        if (stderr) {
          console.error("mdfind stderr:", stderr);
        }

        const appPaths = stdout.trim().split("\n");
        const apps = appPaths
          .map((appPath) => {
            if (!appPath) return null;
            const appName = path.basename(appPath, ".app");
            return {
              name: appName,
              path: appPath,
              launchCommand: `open -a "${appPath}"`,
            };
          })
          .filter(Boolean); // Filter out any null entries

        resolve(apps);
      });
    });
  }

  async fallbackFindApps(appDirectories) {
    console.log("... Using fallback app discovery method ...");
    let allApps = new Set();

    for (const dir of appDirectories) {
        try {
            if (fs.existsSync(dir)) {
                const files = await fs.promises.readdir(dir);
                files.forEach(file => {
                    if (file.endsWith('.app')) {
                        const appName = file.replace('.app', '');
                        const appPath = path.join(dir, file);
                        allApps.add(JSON.stringify({
                            name: appName,
                            path: appPath,
                            launchCommand: `open -a "${appPath}"`
                        }));
                    }
                });
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error);
        }
    }

    return Array.from(allApps).map(item => JSON.parse(item));
  }


  findApp(searchTerm) {
    if (!this.initialized) {
      console.warn("App Discovery not initialized. Call init() first.");
      return null;
    }

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    
    // 1. Exact match
    let found = this.apps.find(app => app.name.toLowerCase() === lowerCaseSearchTerm);
    if (found) return found;

    // 2. Starts with
    found = this.apps.find(app => app.name.toLowerCase().startsWith(lowerCaseSearchTerm));
    if (found) return found;

    // 3. Includes
    found = this.apps.find(app => app.name.toLowerCase().includes(lowerCaseSearchTerm));
    if (found) return found;

    return null;
  }

  launch(app) {
     return new Promise((resolve, reject) => {
        if (!app || !app.path) {
            return reject(new Error("Invalid app object provided."));
        }
        
        const command = `open -a "${app.path}"`;
        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error launching ${app.name}:`, err);
                return reject(err);
            }
            if (stderr) {
                 console.warn(`Stderr while launching ${app.name}:`, stderr);
            }
            console.log(`${app.name} launched successfully.`);
            resolve(stdout);
        });
     });
  }

  quit(app) {
    return new Promise((resolve, reject) => {
        if (!app || !app.name) {
            return reject(new Error("Invalid app object provided."));
        }

        const command = `osascript -e 'quit app "${app.name}"'`;
        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error quitting ${app.name}:`, err);
                // AppleScript returns an error if the app isn't running, which we can ignore.
                if (err.message.includes("is not running")) {
                    console.log(`${app.name} was not running.`);
                    return resolve();
                }
                return reject(err);
            }
            if (stderr) {
                console.warn(`Stderr while quitting ${app.name}:`, stderr);
            }
            console.log(`${app.name} quit successfully.`);
            resolve(stdout);
        });
    });
  }

}

module.exports = AppDiscovery; 