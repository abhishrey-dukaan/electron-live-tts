#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class FixedTestRunner {
    constructor() {
        this.results = [];
        this.startTime = null;
        this.totalTests = 40; // Focusing on core tests
        this.currentTest = 0;
        this.failedTests = [];
        this.passedTests = [];
        
        // Core test cases with fixes
        this.testCases = [
            // Application Control (15 tests)
            { id: 1, category: 'app', command: 'open notes', expected: 'app_launched', timeout: 8000 },
            { id: 2, category: 'app', command: 'open safari', expected: 'app_launched', timeout: 8000 },
            { id: 3, category: 'app', command: 'open finder', expected: 'app_launched', timeout: 8000 },
            { id: 4, category: 'app', command: 'open mail', expected: 'app_launched', timeout: 8000 },
            { id: 5, category: 'app', command: 'open calendar', expected: 'app_launched', timeout: 8000 },
            { id: 6, category: 'app', command: 'open photos', expected: 'app_launched', timeout: 8000 },
            { id: 7, category: 'app', command: 'open terminal', expected: 'app_launched', timeout: 8000 },
            { id: 8, category: 'app', command: 'open activity monitor', expected: 'app_launched', timeout: 8000 },
            { id: 9, category: 'app', command: 'open system preferences', expected: 'app_launched', timeout: 8000 },
            { id: 10, category: 'app', command: 'open textedit', expected: 'app_launched', timeout: 8000 },
            { id: 11, category: 'app', command: 'open preview', expected: 'app_launched', timeout: 8000 },
            { id: 12, category: 'app', command: 'quit notes', expected: 'app_closed', timeout: 5000 },
            { id: 13, category: 'app', command: 'quit safari', expected: 'app_closed', timeout: 5000 },
            { id: 14, category: 'app', command: 'quit textedit', expected: 'app_closed', timeout: 5000 },
            { id: 15, category: 'app', command: 'quit preview', expected: 'app_closed', timeout: 5000 },

            // System Control (15 tests)
            { id: 16, category: 'system', command: 'take screenshot', expected: 'screenshot_taken', timeout: 8000 },
            { id: 17, category: 'system', command: 'lock screen', expected: 'screen_locked', timeout: 5000 },
            { id: 18, category: 'system', command: 'volume up', expected: 'volume_changed', timeout: 5000 },
            { id: 19, category: 'system', command: 'volume down', expected: 'volume_changed', timeout: 5000 },
            { id: 20, category: 'system', command: 'volume mute', expected: 'volume_muted', timeout: 5000 },
            { id: 21, category: 'system', command: 'open downloads', expected: 'folder_opened', timeout: 8000 },
            { id: 22, category: 'system', command: 'open documents', expected: 'folder_opened', timeout: 8000 },
            { id: 23, category: 'system', command: 'open desktop', expected: 'folder_opened', timeout: 8000 },
            { id: 24, category: 'system', command: 'empty trash', expected: 'trash_emptied', timeout: 8000 },
            { id: 25, category: 'system', command: 'create folder', expected: 'folder_created', timeout: 8000 },
            { id: 26, category: 'system', command: 'show hidden files', expected: 'setting_changed', timeout: 5000 },
            { id: 27, category: 'system', command: 'hide hidden files', expected: 'setting_changed', timeout: 5000 },
            { id: 28, category: 'system', command: 'open trash', expected: 'folder_opened', timeout: 8000 },
            { id: 29, category: 'system', command: 'minimize all windows', expected: 'windows_minimized', timeout: 5000 },
            { id: 30, category: 'system', command: 'show all windows', expected: 'windows_shown', timeout: 5000 },

            // Web Automation (10 tests)
            { id: 31, category: 'web', command: 'search for cats on youtube', expected: 'youtube_search', timeout: 15000 },
            { id: 32, category: 'web', command: 'search for dogs on youtube', expected: 'youtube_search', timeout: 15000 },
            { id: 33, category: 'web', command: 'search for music on youtube', expected: 'youtube_search', timeout: 15000 },
            { id: 34, category: 'web', command: 'open youtube', expected: 'website_opened', timeout: 10000 },
            { id: 35, category: 'web', command: 'search for weather', expected: 'google_search', timeout: 10000 },
            { id: 36, category: 'web', command: 'search for news', expected: 'google_search', timeout: 10000 },
            { id: 37, category: 'web', command: 'search for recipes', expected: 'google_search', timeout: 10000 },
            { id: 38, category: 'web', command: 'open google', expected: 'website_opened', timeout: 10000 },
            { id: 39, category: 'web', command: 'search for technology on youtube', expected: 'youtube_search', timeout: 15000 },
            { id: 40, category: 'web', command: 'search for tutorials', expected: 'google_search', timeout: 10000 }
        ];
    }

    async runAllTests() {
        console.log('🚀 Starting Fixed Comprehensive Test Suite...');
        console.log(`📊 Total Tests: ${this.totalTests}`);
        this.startTime = Date.now();
        
        // Clear previous results
        this.results = [];
        this.failedTests = [];
        this.passedTests = [];
        this.currentTest = 0;

        // Run tests by category
        const categories = ['app', 'system', 'web'];
        
        for (const category of categories) {
            await this.runCategory(category);
            if (category !== 'web') {
                console.log('⏸️  Category complete, cooling down...');
                await this.delay(3000);
            }
        }

        this.generateFinalReport();
    }

    async runCategory(category) {
        const categoryTests = this.testCases.filter(t => t.category === category);
        console.log(`\n🎯 Running ${category} Category (${categoryTests.length} tests)`);
        
        for (const testCase of categoryTests) {
            await this.runSingleTest(testCase);
            await this.delay(1500);
        }
        
        this.generateCategoryReport(category);
    }

    async runSingleTest(testCase) {
        this.currentTest++;
        const testStart = Date.now();
        
        console.log(`\n🔍 Test ${this.currentTest}/${this.totalTests}: ${testCase.command}`);

        const result = {
            id: testCase.id,
            category: testCase.category,
            command: testCase.command,
            expected: testCase.expected,
            status: 'running',
            startTime: testStart,
            endTime: null,
            duration: 0,
            error: null
        };

        try {
            const success = await this.executeCommand(testCase);
            
            result.endTime = Date.now();
            result.duration = result.endTime - result.startTime;
            
            if (success) {
                result.status = 'passed';
                this.passedTests.push(result);
                console.log(`✅ Test ${testCase.id} PASSED (${result.duration}ms)`);
            } else {
                result.status = 'failed';
                result.error = 'Command execution failed';
                this.failedTests.push(result);
                console.log(`❌ Test ${testCase.id} FAILED: Command execution failed`);
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
        this.updateProgressReport();
    }

    async executeCommand(testCase) {
        const { category, command } = testCase;
        
        try {
            switch (category) {
                case 'app':
                    return await this.executeAppCommand(command);
                case 'web':
                    return await this.executeWebCommand(command);
                case 'system':
                    return await this.executeSystemCommand(command);
                default:
                    throw new Error(`Unknown category: ${category}`);
            }
        } catch (error) {
            console.error(`Error executing ${category} command:`, error.message);
            return false;
        }
    }

    async executeAppCommand(command) {
        const appMatch = command.match(/(open|quit)\s+(.+)/);
        if (!appMatch) return false;

        const [, action, appName] = appMatch;
        
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
            'preview': 'Preview'
        };
        
        const actualAppName = appNameMap[appName.toLowerCase()] || appName;
        
        const appleScript = action === 'open' 
            ? `tell application "${actualAppName}" to activate`
            : `tell application "${actualAppName}" to quit`;

        return this.runAppleScript(appleScript);
    }

    async executeWebCommand(command) {
        try {
            const webAutomation = require('./web-automation.js');
            
            if (command.includes('youtube')) {
                const searchTerm = command.match(/search for (.+) on youtube/)?.[1] || 'test';
                return await webAutomation.searchYouTube(searchTerm);
            } else if (command.includes('search for')) {
                const searchTerm = command.match(/search for (.+)/)?.[1] || 'test';
                return await webAutomation.searchGoogle(searchTerm);
            } else if (command.includes('open')) {
                const site = command.includes('youtube') ? 'https://www.youtube.com' : 'https://www.google.com';
                return await webAutomation.openWebsite(site);
            }
        } catch (error) {
            console.error('Web automation error:', error.message);
            return false;
        }
        return false;
    }

    async executeSystemCommand(command) {
        if (command === 'take screenshot') {
            const screenshotPath = path.join(os.homedir(), 'Desktop', `test-screenshot-${Date.now()}.png`);
            return this.runShellCommand(`screencapture "${screenshotPath}"`);
        } else if (command === 'lock screen') {
            return this.runShellCommand('pmset displaysleepnow');
        } else if (command.includes('volume')) {
            const action = command.includes('up') ? '+' : command.includes('down') ? '-' : 'mute';
            if (action === 'mute') {
                return this.runShellCommand('osascript -e "set volume output muted true"');
            } else {
                const currentVolume = action === '+' ? '(output volume of (get volume settings) + 10)' : '(output volume of (get volume settings) - 10)';
                return this.runShellCommand(`osascript -e "set volume output volume ${currentVolume}"`);
            }
        } else if (command.includes('open')) {
            const folder = command.replace('open ', '');
            const folderMap = {
                'downloads': path.join(os.homedir(), 'Downloads'),
                'documents': path.join(os.homedir(), 'Documents'), 
                'desktop': path.join(os.homedir(), 'Desktop'),
                'trash': path.join(os.homedir(), '.Trash')
            };
            const folderPath = folderMap[folder.toLowerCase()] || folder;
            return this.runShellCommand(`open "${folderPath}"`);
        } else if (command === 'empty trash') {
            return this.runAppleScript('tell application "Finder" to empty trash');
        } else if (command === 'create folder') {
            const folderName = `TestFolder-${Date.now()}`;
            const folderPath = path.join(os.homedir(), 'Desktop', folderName);
            return this.runShellCommand(`mkdir "${folderPath}"`);
        } else if (command.includes('hidden files')) {
            const show = command.includes('show');
            return this.runShellCommand(`defaults write com.apple.finder AppleShowAllFiles ${show ? 'TRUE' : 'FALSE'} && killall Finder`);
        } else if (command.includes('minimize all')) {
            return this.runAppleScript('tell application "System Events" to set visible of every process whose visible is true to false');
        } else if (command.includes('show all')) {
            return this.runAppleScript('tell application "System Events" to set visible of every process to true');
        }
        return false;
    }

    async runAppleScript(script) {
        return new Promise((resolve) => {
            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) {
                    console.error('AppleScript error:', error.message);
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
                    console.error('Shell command error:', error.message);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    updateProgressReport() {
        const progress = (this.currentTest / this.totalTests) * 100;
        const passed = this.passedTests.length;
        const failed = this.failedTests.length;
        
        console.log(`📊 Progress: ${this.currentTest}/${this.totalTests} (${progress.toFixed(1)}%)`);
        console.log(`✅ Passed: ${passed} | ❌ Failed: ${failed}`);
        
        if (failed > 0) {
            console.log('🔍 Recent failures:');
            this.failedTests.slice(-3).forEach(test => {
                console.log(`   - Test ${test.id}: ${test.command} (${test.error})`);
            });
        }
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

        // Category breakdown
        console.log('\n📋 Category Breakdown:');
        const categories = ['app', 'system', 'web'];
        categories.forEach(cat => {
            const categoryTests = this.results.filter(r => r.category === cat);
            const categoryPassed = categoryTests.filter(r => r.status === 'passed').length;
            console.log(`   ${cat}: ${categoryPassed}/${categoryTests.length} passed`);
        });

        // Failed tests summary
        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.failedTests.forEach(test => {
                console.log(`   - ${test.command}: ${test.error}`);
            });
        }

        console.log('\n✨ Test run completed!');
        this.saveReport();
    }

    saveReport() {
        const report = {
            summary: {
                totalTests: this.totalTests,
                passed: this.passedTests.length,
                failed: this.failedTests.length,
                successRate: (this.passedTests.length / this.totalTests) * 100,
                totalDuration: Date.now() - this.startTime,
                timestamp: new Date().toISOString()
            },
            results: this.results
        };

        const reportPath = path.join(__dirname, `fixed-test-report-${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`📄 Report saved: ${reportPath}`);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the tests if this file is executed directly
if (require.main === module) {
    const runner = new FixedTestRunner();
    runner.runAllTests().catch(console.error);
}

module.exports = FixedTestRunner; 