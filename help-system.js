const { ipcRenderer } = require('electron');

class HelpSystem {
    constructor() {
        this.commands = {
            'application': [
                { command: 'open [app]', example: 'open slack', description: 'Launch any application' },
                { command: 'quit [app]', example: 'quit chrome', description: 'Close any application' },
                { command: 'switch to [app]', example: 'switch to finder', description: 'Switch to running app' }
            ],
            'web': [
                { command: 'search for [query] on youtube', example: 'search for cats on youtube', description: 'Search and play YouTube videos' },
                { command: 'search for [query]', example: 'search for weather', description: 'Google search for anything' },
                { command: 'open [website]', example: 'open reddit.com', description: 'Navigate to any website' }
            ],
            'system': [
                { command: 'take screenshot', example: 'take screenshot', description: 'Capture your screen' },
                { command: 'lock screen', example: 'lock screen', description: 'Lock your Mac' },
                { command: 'volume [up/down/mute]', example: 'volume up', description: 'Control system volume' }
            ],
            'files': [
                { command: 'open downloads', example: 'open downloads', description: 'Open Downloads folder' },
                { command: 'open documents', example: 'open documents', description: 'Open Documents folder' },
                { command: 'create folder [name]', example: 'create folder named MyFolder', description: 'Create new folder on desktop with specified name' }
            ]
        };
        
        this.achievements = [
            { id: 'first_command', name: 'First Steps', description: 'Execute your first voice command', icon: '🎯', unlocked: false },
            { id: 'app_master', name: 'App Master', description: 'Control 5 different applications', icon: '📱', unlocked: false, progress: 0, target: 5 },
            { id: 'web_wizard', name: 'Web Wizard', description: 'Complete 3 web automation tasks', icon: '🌐', unlocked: false, progress: 0, target: 3 },
            { id: 'system_admin', name: 'System Admin', description: 'Use 5 system commands', icon: '⚙️', unlocked: false, progress: 0, target: 5 },
            { id: 'speed_demon', name: 'Speed Demon', description: 'Execute 10 commands in one session', icon: '⚡', unlocked: false, progress: 0, target: 10 },
            { id: 'power_user', name: 'Power User', description: 'Unlock all other achievements', icon: '👑', unlocked: false }
        ];
        
        this.userStats = {
            totalCommands: 0,
            successfulCommands: 0,
            appCommands: 0,
            webCommands: 0,
            systemCommands: 0,
            sessionCommands: 0,
            uniqueApps: new Set(),
            streak: 0,
            lastUsed: null
        };
        
        this.contextHistory = [];
        this.suggestions = [];
        this.isVisible = false;
        
        this.init();
    }

    init() {
        this.loadUserData();
        this.createHelpUI();
        this.bindEvents();
        this.startContextualHelp();
    }

    loadUserData() {
        const saved = localStorage.getItem('voicemac-user-stats');
        if (saved) {
            const data = JSON.parse(saved);
            this.userStats = { ...this.userStats, ...data };
            this.userStats.uniqueApps = new Set(data.uniqueApps || []);
        }

        const savedAchievements = localStorage.getItem('voicemac-achievements');
        if (savedAchievements) {
            this.achievements = JSON.parse(savedAchievements);
        }
    }

    saveUserData() {
        const statsToSave = {
            ...this.userStats,
            uniqueApps: Array.from(this.userStats.uniqueApps)
        };
        localStorage.setItem('voicemac-user-stats', JSON.stringify(statsToSave));
        localStorage.setItem('voicemac-achievements', JSON.stringify(this.achievements));
    }

    createHelpUI() {
        // Create help overlay
        const helpOverlay = document.createElement('div');
        helpOverlay.id = 'help-overlay';
        helpOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 hidden';
        helpOverlay.innerHTML = `
            <div class="flex items-center justify-center min-h-screen p-4">
                <div class="bg-gray-900 rounded-2xl p-6 max-w-4xl w-full max-h-screen overflow-y-auto">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-white">VoiceMac Help & Commands</h2>
                        <button id="close-help" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                    </div>
                    
                    <div class="grid md:grid-cols-3 gap-6">
                        <!-- Commands Panel -->
                        <div class="md:col-span-2">
                            <div class="mb-6">
                                <div class="flex space-x-2 mb-4">
                                    <button class="command-tab px-4 py-2 rounded-lg bg-purple-600 text-white" data-tab="all">All</button>
                                    <button class="command-tab px-4 py-2 rounded-lg bg-gray-700 text-gray-300" data-tab="application">Apps</button>
                                    <button class="command-tab px-4 py-2 rounded-lg bg-gray-700 text-gray-300" data-tab="web">Web</button>
                                    <button class="command-tab px-4 py-2 rounded-lg bg-gray-700 text-gray-300" data-tab="system">System</button>
                                    <button class="command-tab px-4 py-2 rounded-lg bg-gray-700 text-gray-300" data-tab="files">Files</button>
                                </div>
                                <div id="commands-list" class="space-y-3">
                                    <!-- Commands will be populated here -->
                                </div>
                            </div>
                        </div>
                        
                        <!-- Stats & Achievements Panel -->
                        <div>
                            <div class="bg-gray-800 rounded-xl p-4 mb-4">
                                <h3 class="text-lg font-semibold text-white mb-3">Your Progress</h3>
                                <div class="space-y-2 text-sm">
                                    <div class="flex justify-between text-gray-300">
                                        <span>Commands Used:</span>
                                        <span class="text-white font-semibold">${this.userStats.totalCommands}</span>
                                    </div>
                                    <div class="flex justify-between text-gray-300">
                                        <span>Success Rate:</span>
                                        <span class="text-green-400 font-semibold">${this.getSuccessRate()}%</span>
                                    </div>
                                    <div class="flex justify-between text-gray-300">
                                        <span>Apps Controlled:</span>
                                        <span class="text-blue-400 font-semibold">${this.userStats.uniqueApps.size}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="bg-gray-800 rounded-xl p-4">
                                <h3 class="text-lg font-semibold text-white mb-3">Achievements</h3>
                                <div id="achievements-list" class="space-y-2">
                                    <!-- Achievements will be populated here -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(helpOverlay);

        // Create floating help button
        const helpButton = document.createElement('button');
        helpButton.id = 'help-button';
        helpButton.className = 'fixed bottom-4 right-4 w-12 h-12 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center text-white shadow-lg z-40 transition-all duration-300';
        helpButton.innerHTML = '?';
        helpButton.title = 'Help & Commands';
        document.body.appendChild(helpButton);

        // Create suggestion tooltip
        const suggestionTooltip = document.createElement('div');
        suggestionTooltip.id = 'suggestion-tooltip';
        suggestionTooltip.className = 'fixed bottom-20 right-4 bg-gray-900 text-white p-3 rounded-lg shadow-lg z-40 hidden max-w-xs';
        document.body.appendChild(suggestionTooltip);

        this.populateCommands();
        this.populateAchievements();
    }

    bindEvents() {
        document.getElementById('help-button').addEventListener('click', () => {
            this.toggleHelp();
        });

        document.getElementById('close-help').addEventListener('click', () => {
            this.hideHelp();
        });

        document.getElementById('help-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'help-overlay') {
                this.hideHelp();
            }
        });

        // Command tab switching
        document.querySelectorAll('.command-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchCommandTab(tab.dataset.tab);
            });
        });

        // Listen for command execution events
        ipcRenderer.on('command-executed', (event, data) => {
            this.trackCommand(data);
        });

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F1' || (e.metaKey && e.key === '/')) {
                e.preventDefault();
                this.toggleHelp();
            }
        });
    }

    populateCommands(category = 'all') {
        const commandsList = document.getElementById('commands-list');
        commandsList.innerHTML = '';

        const categoriesToShow = category === 'all' ? Object.keys(this.commands) : [category];

        categoriesToShow.forEach(cat => {
            if (!this.commands[cat]) return;

            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'text-purple-400 font-semibold text-sm uppercase tracking-wide mb-2';
            categoryHeader.textContent = cat.replace('_', ' ');
            if (category === 'all') commandsList.appendChild(categoryHeader);

            this.commands[cat].forEach(cmd => {
                const commandItem = document.createElement('div');
                commandItem.className = 'bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors cursor-pointer';
                commandItem.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="font-mono text-green-400 text-sm">"${cmd.example}"</div>
                            <div class="text-gray-300 text-xs mt-1">${cmd.description}</div>
                        </div>
                        <button class="try-command text-purple-400 hover:text-purple-300 text-xs ml-2" data-command="${cmd.example}">
                            Try It
                        </button>
                    </div>
                `;
                commandsList.appendChild(commandItem);
            });
        });

        // Add try command listeners
        document.querySelectorAll('.try-command').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.tryCommand(btn.dataset.command);
            });
        });
    }

    populateAchievements() {
        const achievementsList = document.getElementById('achievements-list');
        achievementsList.innerHTML = '';

        this.achievements.forEach(achievement => {
            const achievementItem = document.createElement('div');
            achievementItem.className = `flex items-center space-x-2 p-2 rounded-lg ${
                achievement.unlocked ? 'bg-green-900 bg-opacity-50' : 'bg-gray-700'
            }`;
            
            const progressBar = achievement.target ? 
                `<div class="w-full bg-gray-600 rounded-full h-1 mt-1">
                    <div class="bg-purple-600 h-1 rounded-full" style="width: ${(achievement.progress / achievement.target) * 100}%"></div>
                </div>` : '';

            achievementItem.innerHTML = `
                <div class="text-lg">${achievement.icon}</div>
                <div class="flex-1">
                    <div class="text-white text-xs font-semibold">${achievement.name}</div>
                    <div class="text-gray-400 text-xs">${achievement.description}</div>
                    ${progressBar}
                </div>
                ${achievement.unlocked ? '<div class="text-green-400 text-xs">✓</div>' : ''}
            `;
            
            achievementsList.appendChild(achievementItem);
        });
    }

    switchCommandTab(category) {
        // Update tab appearance
        document.querySelectorAll('.command-tab').forEach(tab => {
            if (tab.dataset.tab === category) {
                tab.className = 'command-tab px-4 py-2 rounded-lg bg-purple-600 text-white';
            } else {
                tab.className = 'command-tab px-4 py-2 rounded-lg bg-gray-700 text-gray-300';
            }
        });

        this.populateCommands(category);
    }

    toggleHelp() {
        if (this.isVisible) {
            this.hideHelp();
        } else {
            this.showHelp();
        }
    }

    showHelp() {
        document.getElementById('help-overlay').classList.remove('hidden');
        this.isVisible = true;
        this.updateStats();
    }

    hideHelp() {
        document.getElementById('help-overlay').classList.add('hidden');
        this.isVisible = false;
    }

    async tryCommand(command) {
        this.hideHelp();
        
        // Show notification
        this.showNotification(`Trying command: "${command}"`, 'info');
        
        try {
            await ipcRenderer.invoke('execute-tutorial-command', command);
        } catch (error) {
            console.error('Error trying command:', error);
            this.showNotification('Command failed. Make sure permissions are granted.', 'error');
        }
    }

    trackCommand(data) {
        this.userStats.totalCommands++;
        this.userStats.sessionCommands++;
        
        if (data.success) {
            this.userStats.successfulCommands++;
        }

        // Track command type
        if (data.type === 'application') {
            this.userStats.appCommands++;
            if (data.app) {
                this.userStats.uniqueApps.add(data.app);
            }
        } else if (data.type === 'web') {
            this.userStats.webCommands++;
        } else if (data.type === 'system') {
            this.userStats.systemCommands++;
        }

        this.userStats.lastUsed = new Date().toISOString();
        this.checkAchievements();
        this.saveUserData();
        this.updateContextualSuggestions(data);
    }

    checkAchievements() {
        let newUnlocks = [];

        // First Steps
        if (!this.achievements[0].unlocked && this.userStats.successfulCommands >= 1) {
            this.achievements[0].unlocked = true;
            newUnlocks.push(this.achievements[0]);
        }

        // App Master
        this.achievements[1].progress = this.userStats.uniqueApps.size;
        if (!this.achievements[1].unlocked && this.userStats.uniqueApps.size >= 5) {
            this.achievements[1].unlocked = true;
            newUnlocks.push(this.achievements[1]);
        }

        // Web Wizard
        this.achievements[2].progress = this.userStats.webCommands;
        if (!this.achievements[2].unlocked && this.userStats.webCommands >= 3) {
            this.achievements[2].unlocked = true;
            newUnlocks.push(this.achievements[2]);
        }

        // System Admin
        this.achievements[3].progress = this.userStats.systemCommands;
        if (!this.achievements[3].unlocked && this.userStats.systemCommands >= 5) {
            this.achievements[3].unlocked = true;
            newUnlocks.push(this.achievements[3]);
        }

        // Speed Demon
        this.achievements[4].progress = this.userStats.sessionCommands;
        if (!this.achievements[4].unlocked && this.userStats.sessionCommands >= 10) {
            this.achievements[4].unlocked = true;
            newUnlocks.push(this.achievements[4]);
        }

        // Power User (all others unlocked)
        const otherAchievements = this.achievements.slice(0, -1);
        if (!this.achievements[5].unlocked && otherAchievements.every(a => a.unlocked)) {
            this.achievements[5].unlocked = true;
            newUnlocks.push(this.achievements[5]);
        }

        // Show achievement notifications
        newUnlocks.forEach(achievement => {
            this.showAchievementNotification(achievement);
        });

        if (this.isVisible) {
            this.populateAchievements();
        }
    }

    updateContextualSuggestions(lastCommand) {
        this.contextHistory.push(lastCommand);
        if (this.contextHistory.length > 10) {
            this.contextHistory.shift();
        }

        // Generate suggestions based on context
        this.suggestions = this.generateSmartSuggestions();
        this.showSuggestionTooltip();
    }

    generateSmartSuggestions() {
        const suggestions = [];
        const recent = this.contextHistory.slice(-3);

        // Pattern-based suggestions
        if (recent.some(cmd => cmd.type === 'application' && cmd.action === 'open')) {
            suggestions.push({
                text: 'Try "quit [app]" to close the app you just opened',
                priority: 0.8
            });
        }

        if (recent.some(cmd => cmd.type === 'web')) {
            suggestions.push({
                text: 'Search for something else on YouTube',
                priority: 0.7
            });
        }

        // Skill progression suggestions
        if (this.userStats.appCommands > 5 && this.userStats.webCommands < 2) {
            suggestions.push({
                text: 'Try web automation: "search for [topic] on youtube"',
                priority: 0.9
            });
        }

        if (this.userStats.totalCommands > 10 && this.userStats.systemCommands < 2) {
            suggestions.push({
                text: 'Try system commands: "take screenshot" or "lock screen"',
                priority: 0.9
            });
        }

        return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 3);
    }

    showSuggestionTooltip() {
        if (this.suggestions.length === 0) return;

        const tooltip = document.getElementById('suggestion-tooltip');
        const suggestion = this.suggestions[0];
        
        tooltip.innerHTML = `
            <div class="text-xs font-semibold text-purple-400 mb-1">💡 Suggestion</div>
            <div class="text-sm">${suggestion.text}</div>
        `;
        
        tooltip.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            tooltip.classList.add('hidden');
        }, 5000);
    }

    startContextualHelp() {
        // Monitor user activity and provide contextual help
        setInterval(() => {
            if (this.userStats.sessionCommands === 0 && Date.now() - (new Date(this.userStats.lastUsed || 0)).getTime() > 30000) {
                this.showHelpPrompt();
            }
        }, 30000);
    }

    showHelpPrompt() {
        if (this.userStats.totalCommands < 5) {
            this.showNotification('Need help? Click the ? button or press F1 for commands', 'info');
        }
    }

    getSuccessRate() {
        if (this.userStats.totalCommands === 0) return 100;
        return Math.round((this.userStats.successfulCommands / this.userStats.totalCommands) * 100);
    }

    updateStats() {
        const statsElements = document.querySelectorAll('#help-overlay [data-stat]');
        statsElements.forEach(el => {
            const stat = el.dataset.stat;
            if (this.userStats[stat] !== undefined) {
                el.textContent = this.userStats[stat];
            }
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 
            type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600'
        }`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            notification.style.transition = 'transform 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    showAchievementNotification(achievement) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
        notification.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="text-2xl">${achievement.icon}</div>
                <div>
                    <div class="font-bold">Achievement Unlocked!</div>
                    <div class="text-sm">${achievement.name}</div>
                </div>
            </div>
        `;

        document.body.appendChild(notification);

        // Animate in
        notification.style.transform = 'translate(-50%, -100%)';
        setTimeout(() => {
            notification.style.transform = 'translate(-50%, 0)';
            notification.style.transition = 'transform 0.5s ease';
        }, 100);

        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translate(-50%, -100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 500);
        }, 4000);
    }

    // Reset session stats (called when app starts)
    resetSession() {
        this.userStats.sessionCommands = 0;
        this.saveUserData();
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HelpSystem;
} 