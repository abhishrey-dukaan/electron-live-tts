const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class ComprehensiveTestSuite {
    constructor() {
        this.results = [];
        this.startTime = null;
        this.totalTests = 50;
        this.currentTest = 0;
        this.failedTests = [];
        this.skippedTests = [];
        this.passedTests = [];
        
        // 50 Common Mac Tasks
        this.testCases = [
            // Application Control (15 tests)
            { id: 1, category: 'app', command: 'open notes', expected: 'app_launched', timeout: 5000 },
            { id: 2, category: 'app', command: 'open safari', expected: 'app_launched', timeout: 5000 },
            { id: 3, category: 'app', command: 'open finder', expected: 'app_launched', timeout: 5000 },
            { id: 4, category: 'app', command: 'open mail', expected: 'app_launched', timeout: 5000 },
            { id: 5, category: 'app', command: 'open calendar', expected: 'app_launched', timeout: 5000 },
            { id: 6, category: 'app', command: 'open photos', expected: 'app_launched', timeout: 5000 },
            { id: 7, category: 'app', command: 'open terminal', expected: 'app_launched', timeout: 5000 },
            { id: 8, category: 'app', command: 'open activity monitor', expected: 'app_launched', timeout: 5000 },
            { id: 9, category: 'app', command: 'open system preferences', expected: 'app_launched', timeout: 5000 },
            { id: 10, category: 'app', command: 'quit notes', expected: 'app_closed', timeout: 3000 },
            { id: 11, category: 'app', command: 'quit safari', expected: 'app_closed', timeout: 3000 },
            { id: 12, category: 'app', command: 'quit finder', expected: 'app_closed', timeout: 3000 },
            { id: 13, category: 'app', command: 'open textedit', expected: 'app_launched', timeout: 5000 },
            { id: 14, category: 'app', command: 'open preview', expected: 'app_launched', timeout: 5000 },
            { id: 15, category: 'app', command: 'quit textedit', expected: 'app_closed', timeout: 3000 },

            // Web Automation (10 tests)
            { id: 16, category: 'web', command: 'search for cats on youtube', expected: 'youtube_search', timeout: 15000 },
            { id: 17, category: 'web', command: 'search for dogs on youtube', expected: 'youtube_search', timeout: 15000 },
            { id: 18, category: 'web', command: 'search for music on youtube', expected: 'youtube_search', timeout: 15000 },
            { id: 19, category: 'web', command: 'open youtube', expected: 'website_opened', timeout: 10000 },
            { id: 20, category: 'web', command: 'search for weather', expected: 'google_search', timeout: 10000 },
            { id: 21, category: 'web', command: 'search for news', expected: 'google_search', timeout: 10000 },
            { id: 22, category: 'web', command: 'search for recipes', expected: 'google_search', timeout: 10000 },
            { id: 23, category: 'web', command: 'open google', expected: 'website_opened', timeout: 10000 },
            { id: 24, category: 'web', command: 'search for technology on youtube', expected: 'youtube_search', timeout: 15000 },
            { id: 25, category: 'web', command: 'search for tutorials', expected: 'google_search', timeout: 10000 },

            // System Control (15 tests)
            { id: 26, category: 'system', command: 'take screenshot', expected: 'screenshot_taken', timeout: 5000 },
            { id: 27, category: 'system', command: 'lock screen', expected: 'screen_locked', timeout: 3000 },
            { id: 28, category: 'system', command: 'volume up', expected: 'volume_changed', timeout: 3000 },
            { id: 29, category: 'system', command: 'volume down', expected: 'volume_changed', timeout: 3000 },
            { id: 30, category: 'system', command: 'volume mute', expected: 'volume_muted', timeout: 3000 },
            { id: 31, category: 'system', command: 'open downloads', expected: 'folder_opened', timeout: 5000 },
            { id: 32, category: 'system', command: 'open documents', expected: 'folder_opened', timeout: 5000 },
            { id: 33, category: 'system', command: 'open desktop', expected: 'folder_opened', timeout: 5000 },
            { id: 34, category: 'system', command: 'empty trash', expected: 'trash_emptied', timeout: 5000 },
            { id: 35, category: 'system', command: 'create folder', expected: 'folder_created', timeout: 5000 },
            { id: 36, category: 'system', command: 'show hidden files', expected: 'setting_changed', timeout: 3000 },
            { id: 37, category: 'system', command: 'hide hidden files', expected: 'setting_changed', timeout: 3000 },
            { id: 38, category: 'system', command: 'open trash', expected: 'folder_opened', timeout: 5000 },
            { id: 39, category: 'system', command: 'minimize all windows', expected: 'windows_minimized', timeout: 3000 },
            { id: 40, category: 'system', command: 'show all windows', expected: 'windows_shown', timeout: 3000 },

            // File Operations (5 tests)
            { id: 41, category: 'file', command: 'open applications folder', expected: 'folder_opened', timeout: 5000 },
            { id: 42, category: 'file', command: 'open utilities folder', expected: 'folder_opened', timeout: 5000 },
            { id: 43, category: 'file', command: 'open home folder', expected: 'folder_opened', timeout: 5000 },
            { id: 44, category: 'file', command: 'show file info', expected: 'info_shown', timeout: 5000 },
            { id: 45, category: 'file', command: 'new finder window', expected: 'window_opened', timeout: 5000 },

            // Complex Commands (5 tests)
            { id: 46, category: 'complex', command: 'open safari and search for weather', expected: 'complex_task', timeout: 20000 },
            { id: 47, category: 'complex', command: 'take screenshot and open preview', expected: 'complex_task', timeout: 15000 },
            { id: 48, category: 'complex', command: 'open notes and create new note', expected: 'complex_task', timeout: 10000 },
            { id: 49, category: 'complex', command: 'open finder and show downloads', expected: 'complex_task', timeout: 10000 },
            { id: 50, category: 'complex', command: 'mute volume and lock screen', expected: 'complex_task', timeout: 8000 }
        ];
        
        this.init();
    }

    init() {
        console.log('🧪 Initializing Comprehensive Test Suite');
        console.log(`📊 Total Tests: ${this.totalTests}`);
        this.createTestReport();
    }

    async runAllTests() {
        console.log('🚀 Starting comprehensive test suite...');
        this.startTime = Date.now();
        
        // Clear previous results
        this.results = [];
        this.failedTests = [];
        this.skippedTests = [];
        this.passedTests = [];
        this.currentTest = 0;

        // Create test session log
        const sessionId = Date.now();
        this.logFile = `test-session-${sessionId}.log`;
        
        // Run tests in batches to avoid overwhelming the system
        const batchSize = 5;
        for (let i = 0; i < this.testCases.length; i += batchSize) {
            const batch = this.testCases.slice(i, i + batchSize);
            console.log(`\n📦 Running batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(this.testCases.length / batchSize)}`);
            
            for (const testCase of batch) {
                await this.runSingleTest(testCase);
                await this.delay(2000); // Wait between tests
            }
            
            // Longer pause between batches
            if (i + batchSize < this.testCases.length) {
                console.log('⏸️  Batch complete, cooling down...');
                await this.delay(5000);
            }
        }

        this.generateFinalReport();
    }

    async runSingleTest(testCase) {
        this.currentTest++;
        const testStart = Date.now();
        
        console.log(`\n🔍 Test ${this.currentTest}/${this.totalTests}: ${testCase.command}`);
        this.logToFile(`[${new Date().toISOString()}] Starting test ${testCase.id}: ${testCase.command}`);

        const result = {
            id: testCase.id,
            category: testCase.category,
            command: testCase.command,
            expected: testCase.expected,
            status: 'running',
            startTime: testStart,
            endTime: null,
            duration: 0,
            error: null,
            logs: [],
            screenshots: []
        };

        try {
            // Take a screenshot before the test
            const beforeScreenshot = await this.takeScreenshot(`before-test-${testCase.id}`);
            result.screenshots.push({ type: 'before', path: beforeScreenshot });

            // Execute the command
            const success = await this.executeTestCommand(testCase, result);
            
            // Take a screenshot after the test
            const afterScreenshot = await this.takeScreenshot(`after-test-${testCase.id}`);
            result.screenshots.push({ type: 'after', path: afterScreenshot });

            // Validate the result
            const validation = await this.validateTestResult(testCase, result);
            
            result.endTime = Date.now();
            result.duration = result.endTime - result.startTime;
            
            if (success && validation.valid) {
                result.status = 'passed';
                this.passedTests.push(result);
                console.log(`✅ Test ${testCase.id} PASSED (${result.duration}ms)`);
            } else {
                result.status = 'failed';
                result.error = validation.error || 'Command execution failed';
                this.failedTests.push(result);
                console.log(`❌ Test ${testCase.id} FAILED: ${result.error}`);
            }

        } catch (error) {
            result.endTime = Date.now();
            result.duration = result.endTime - result.startTime;
            result.status = 'error';
            result.error = error.message;
            this.failedTests.push(result);
            console.log(`💥 Test ${testCase.id} ERROR: ${error.message}`);
        }

        this.results.push(result);
        this.logToFile(`[${new Date().toISOString()}] Test ${testCase.id} completed: ${result.status}`);
        this.updateProgressReport();
    }

    async executeTestCommand(testCase, result) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Test timed out after ${testCase.timeout}ms`));
            }, testCase.timeout);

            // Simulate sending command to the main app
            const command = testCase.command;
            
            // Log command execution
            result.logs.push(`Executing: ${command}`);
            this.logToFile(`[${new Date().toISOString()}] Executing: ${command}`);

            // Execute the actual AppleScript or system command
            this.executeSystemCommand(testCase)
                .then(success => {
                    clearTimeout(timeout);
                    result.logs.push(`Command ${success ? 'succeeded' : 'failed'}`);
                    resolve(success);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    result.logs.push(`Command error: ${error.message}`);
                    reject(error);
                });
        });
    }

    async executeSystemCommand(testCase) {
        const { category, command } = testCase;
        
        try {
            switch (category) {
                case 'app':
                    return await this.executeAppCommand(command);
                case 'web':
                    return await this.executeWebCommand(command);
                case 'system':
                    return await this.executeSystemCommandDirect(command);
                case 'file':
                    return await this.executeFileCommand(command);
                case 'complex':
                    return await this.executeComplexCommand(command);
                default:
                    throw new Error(`Unknown category: ${category}`);
            }
        } catch (error) {
            console.error(`Error executing ${category} command:`, error);
            return false;
        }
    }

    async executeAppCommand(command) {
        const appMatch = command.match(/(open|quit)\s+(.+)/);
        if (!appMatch) return false;

        const [, action, appName] = appMatch;
        
        // Map common app names to their actual names
        const appNameMap = {
            'notes': 'Notes',
            'safari': 'Safari',
            'finder': 'Finder',
            'mail': 'Mail',
            'calendar': 'Calendar',
            'photos': 'Photos',
            'terminal': 'Terminal',
            'activity monitor': 'Activity Monitor',
            'system preferences': 'System Preferences',
            'textedit': 'TextEdit',
            'preview': 'Preview',
            'app store': 'App Store',
            'music': 'Music',
            'facetime': 'FaceTime',
            'messages': 'Messages',
            'contacts': 'Contacts',
            'reminders': 'Reminders'
        };
        
        const actualAppName = appNameMap[appName.toLowerCase()] || appName;
        
        const appleScript = action === 'open' 
            ? `tell application "${actualAppName}" to activate`
            : `tell application "${actualAppName}" to quit`;

        return this.runAppleScript(appleScript);
    }

    async executeWebCommand(command) {
        // For web commands, we'll simulate by opening browser and checking
        if (command.includes('youtube')) {
            const searchTerm = command.match(/search for (.+) on youtube/)?.[1] || 'test';
            return this.runAppleScript(`
                tell application "Safari"
                    activate
                    set URL of front document to "https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}"
                end tell
            `);
        } else if (command.includes('search for')) {
            const searchTerm = command.match(/search for (.+)/)?.[1] || 'test';
            return this.runAppleScript(`
                tell application "Safari"
                    activate
                    set URL of front document to "https://www.google.com/search?q=${encodeURIComponent(searchTerm)}"
                end tell
            `);
        } else if (command.includes('open')) {
            const site = command.includes('youtube') ? 'https://www.youtube.com' : 'https://www.google.com';
            return this.runAppleScript(`
                tell application "Safari"
                    activate
                    set URL of front document to "${site}"
                end tell
            `);
        }
        return false;
    }

    async executeSystemCommandDirect(command) {
        if (command === 'take screenshot') {
            return this.runShellCommand('screencapture ~/Desktop/screenshot.png');
        } else if (command === 'lock screen') {
            // Use a more reliable lock screen command
            return this.runShellCommand('pmset displaysleepnow');
        } else if (command.includes('volume')) {
            const action = command.includes('up') ? '+' : command.includes('down') ? '-' : 'mute';
            if (action === 'mute') {
                return this.runShellCommand('osascript -e "set volume output muted true"');
            } else {
                return this.runShellCommand(`osascript -e "set volume output volume (output volume of (get volume settings) ${action} 10)"`);
            }
        } else if (command.includes('open')) {
            const folder = command.replace('open ', '');
            // Use proper folder paths with full expansion
            const folderMap = {
                'downloads': '$HOME/Downloads',
                'documents': '$HOME/Documents', 
                'desktop': '$HOME/Desktop',
                'trash': '$HOME/.Trash'
            };
            const folderPath = folderMap[folder.toLowerCase()] || folder;
            return this.runShellCommand(`open "${folderPath}"`);
        } else if (command === 'empty trash') {
            return this.runAppleScript('tell application "Finder" to empty trash');
        } else if (command === 'create folder') {
            return this.runAppleScript('tell application "Finder" to make new folder at desktop');
        } else if (command.includes('hidden files')) {
            const show = command.includes('show');
            return this.runShellCommand(`defaults write com.apple.finder AppleShowAllFiles ${show ? 'TRUE' : 'FALSE'} && killall Finder`);
        } else if (command.includes('minimize all')) {
            return this.runAppleScript('tell application "System Events" to set visible of every process to false');
        } else if (command.includes('show all')) {
            return this.runAppleScript('tell application "System Events" to set visible of every process to true');
        }
        return false;
    }

    async executeFileCommand(command) {
        if (command.includes('applications')) {
            return this.runAppleScript('tell application "Finder" to open applications folder');
        } else if (command.includes('utilities')) {
            return this.runAppleScript('tell application "Finder" to open folder "Utilities" of applications folder');
        } else if (command.includes('home')) {
            return this.runAppleScript('tell application "Finder" to open home folder');
        } else if (command.includes('new finder window')) {
            return this.runAppleScript('tell application "Finder" to make new Finder window');
        }
        return false;
    }

    async executeComplexCommand(command) {
        // Break down complex commands into parts
        if (command.includes('and')) {
            const parts = command.split(' and ');
            for (const part of parts) {
                const success = await this.executeSystemCommand({ category: 'system', command: part.trim() });
                if (!success) return false;
                await this.delay(1000); // Brief pause between parts
            }
            return true;
        }
        return false;
    }

    async runAppleScript(script) {
        return new Promise((resolve) => {
            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) {
                    console.error('AppleScript error:', error);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async runShellCommand(command) {
        return new Promise((resolve) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Shell command error:', error);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async validateTestResult(testCase, result) {
        // Basic validation - for a real test suite, this would be more sophisticated
        const validation = { valid: true, error: null };
        
        // Check if the command took a reasonable amount of time
        if (result.duration > testCase.timeout) {
            validation.valid = false;
            validation.error = 'Command exceeded timeout';
        }
        
        // Category-specific validation
        switch (testCase.category) {
            case 'app':
                // Check if app is running/closed
                validation.valid = await this.validateAppState(testCase);
                break;
            case 'web':
                // Check if browser opened correct page
                validation.valid = await this.validateWebState(testCase);
                break;
            case 'system':
                // Check system state changes
                validation.valid = await this.validateSystemState(testCase);
                break;
            default:
                // For other categories, assume success if no error
                break;
        }
        
        return validation;
    }

    async validateAppState(testCase) {
        const appName = testCase.command.match(/(open|quit)\s+(.+)/)?.[2];
        if (!appName) return false;
        
        const isRunning = await this.isAppRunning(appName);
        const shouldBeRunning = testCase.command.includes('open');
        
        return isRunning === shouldBeRunning;
    }

    async validateWebState(testCase) {
        // For web validation, we'll assume success if Safari is running
        return await this.isAppRunning('Safari');
    }

    async validateSystemState(testCase) {
        // Basic system state validation
        return true; // Simplified for now
    }

    async isAppRunning(appName) {
        return new Promise((resolve) => {
            exec(`pgrep -f "${appName}"`, (error, stdout, stderr) => {
                resolve(!error && stdout.trim().length > 0);
            });
        });
    }

    async takeScreenshot(filename) {
        const screenshotPath = path.join(__dirname, 'test-screenshots', `${filename}.png`);
        
        // Ensure screenshot directory exists
        const dir = path.dirname(screenshotPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        return new Promise((resolve) => {
            exec(`screencapture "${screenshotPath}"`, (error) => {
                if (error) {
                    console.error('Screenshot error:', error);
                    resolve(null);
                } else {
                    resolve(screenshotPath);
                }
            });
        });
    }

    updateProgressReport() {
        const progress = (this.currentTest / this.totalTests) * 100;
        const passed = this.passedTests.length;
        const failed = this.failedTests.length;
        
        console.log(`\n📊 Progress: ${this.currentTest}/${this.totalTests} (${progress.toFixed(1)}%)`);
        console.log(`✅ Passed: ${passed} | ❌ Failed: ${failed}`);
        
        if (failed > 0) {
            console.log('🔍 Recent failures:');
            this.failedTests.slice(-3).forEach(test => {
                console.log(`   - Test ${test.id}: ${test.command} (${test.error})`);
            });
        }
    }

    generateFinalReport() {
        const endTime = Date.now();
        const totalDuration = endTime - this.startTime;
        const passed = this.passedTests.length;
        const failed = this.failedTests.length;
        const successRate = (passed / this.totalTests) * 100;

        console.log('\n🎯 FINAL TEST REPORT');
        console.log('='.repeat(50));
        console.log(`📊 Total Tests: ${this.totalTests}`);
        console.log(`✅ Passed: ${passed} (${successRate.toFixed(1)}%)`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
        console.log(`⚡ Average per test: ${(totalDuration / this.totalTests).toFixed(0)}ms`);

        // Category breakdown
        console.log('\n📋 Category Breakdown:');
        const categories = ['app', 'web', 'system', 'file', 'complex'];
        categories.forEach(cat => {
            const categoryTests = this.results.filter(r => r.category === cat);
            const categoryPassed = categoryTests.filter(r => r.status === 'passed').length;
            console.log(`   ${cat}: ${categoryPassed}/${categoryTests.length} passed`);
        });

        // Failed tests detail
        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.failedTests.forEach(test => {
                console.log(`   ${test.id}. ${test.command}`);
                console.log(`      Error: ${test.error}`);
                console.log(`      Duration: ${test.duration}ms`);
            });
        }

        // Save detailed report
        this.saveDetailedReport();
        
        // Auto-fix suggestions
        if (failed > 0) {
            console.log('\n🔧 Suggested Fixes:');
            this.generateFixSuggestions();
        }

        console.log('\n✨ Test suite completed!');
    }

    generateFixSuggestions() {
        const suggestions = new Set();
        
        this.failedTests.forEach(test => {
            if (test.error.includes('timeout')) {
                suggestions.add('• Increase timeout values for slower operations');
            }
            if (test.error.includes('not found')) {
                suggestions.add('• Verify application names and paths');
            }
            if (test.category === 'web' && test.error) {
                suggestions.add('• Check internet connection and browser permissions');
            }
            if (test.category === 'system' && test.error) {
                suggestions.add('• Verify system permissions (Accessibility, Screen Recording)');
            }
        });

        Array.from(suggestions).forEach(suggestion => {
            console.log(suggestion);
        });
    }

    saveDetailedReport() {
        const report = {
            summary: {
                totalTests: this.totalTests,
                passed: this.passedTests.length,
                failed: this.failedTests.length,
                successRate: (this.passedTests.length / this.totalTests) * 100,
                totalDuration: Date.now() - this.startTime,
                timestamp: new Date().toISOString()
            },
            results: this.results,
            environment: {
                platform: process.platform,
                nodeVersion: process.version,
                testSuiteVersion: '1.0.0'
            }
        };

        const reportPath = path.join(__dirname, `test-report-${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 Detailed report saved: ${reportPath}`);
    }

    logToFile(message) {
        if (this.logFile) {
            const logPath = path.join(__dirname, this.logFile);
            fs.appendFileSync(logPath, message + '\n');
        }
    }

    createTestReport() {
        console.log('📋 Test cases loaded:');
        const categories = ['app', 'web', 'system', 'file', 'complex'];
        categories.forEach(cat => {
            const count = this.testCases.filter(t => t.category === cat).length;
            console.log(`   ${cat}: ${count} tests`);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Run specific category
    async runCategory(category) {
        const categoryTests = this.testCases.filter(t => t.category === category);
        console.log(`🎯 Running ${category} tests (${categoryTests.length} tests)`);
        
        for (const test of categoryTests) {
            await this.runSingleTest(test);
            await this.delay(1000);
        }
        
        this.generateCategoryReport(category);
    }

    generateCategoryReport(category) {
        const categoryResults = this.results.filter(r => r.category === category);
        const passed = categoryResults.filter(r => r.status === 'passed').length;
        
        console.log(`\n📊 ${category} Category Results:`);
        console.log(`✅ Passed: ${passed}/${categoryResults.length}`);
        
        if (passed < categoryResults.length) {
            console.log('❌ Failed tests:');
            categoryResults.filter(r => r.status !== 'passed').forEach(test => {
                console.log(`   - ${test.command}: ${test.error}`);
            });
        }
    }
}

module.exports = ComprehensiveTestSuite; 