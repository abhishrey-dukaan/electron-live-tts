const { ipcRenderer } = require('electron');

class OnboardingManager {
    constructor() {
        this.currentStep = 1;
        this.permissions = {
            microphone: false,
            accessibility: false,
            screen: false
        };
        this.tutorialTasks = [
            {
                id: 'app-control',
                command: 'open notes',
                description: 'Open the Notes app',
                completed: false
            },
            {
                id: 'web-automation',
                command: 'search for cute cats on youtube',
                description: 'Search YouTube for videos',
                completed: false
            },
            {
                id: 'system-control',
                command: 'take screenshot',
                description: 'Take a screenshot',
                completed: false
            }
        ];
        this.currentTaskIndex = 0;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkExistingPermissions();
    }

    bindEvents() {
        // Welcome screen
        document.getElementById('start-setup').addEventListener('click', () => {
            this.showSetupScreen();
        });

        // Permission buttons
        document.getElementById('grant-microphone').addEventListener('click', () => {
            this.requestMicrophonePermission();
        });

        document.getElementById('grant-accessibility').addEventListener('click', () => {
            this.openAccessibilitySettings();
        });

        document.getElementById('grant-screen').addEventListener('click', () => {
            this.openScreenRecordingSettings();
        });

        // Tutorial
        document.getElementById('continue-to-tutorial').addEventListener('click', () => {
            this.goToTutorial();
        });

        document.getElementById('start-listening').addEventListener('click', () => {
            this.startTutorialListening();
        });

        document.getElementById('skip-tutorial').addEventListener('click', () => {
            this.goToPreferences();
        });

        // Preferences
        document.getElementById('continue-to-preferences').addEventListener('click', () => {
            this.goToPreferences();
        });

        document.getElementById('finish-setup').addEventListener('click', () => {
            this.completeSetup();
        });

        // Completion
        document.getElementById('launch-app').addEventListener('click', () => {
            this.launchApp();
        });

        // Listen for permission status updates
        ipcRenderer.on('permission-status-update', (event, data) => {
            this.updatePermissionStatus(data.type, data.granted);
        });

        // Listen for tutorial command results
        ipcRenderer.on('tutorial-command-result', (event, data) => {
            this.handleTutorialResult(data);
        });
    }

    showSetupScreen() {
        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
    }

    async checkExistingPermissions() {
        try {
            const permissions = await ipcRenderer.invoke('check-permissions');
            Object.keys(permissions).forEach(type => {
                this.updatePermissionStatus(type, permissions[type]);
            });
        } catch (error) {
            console.error('Error checking permissions:', error);
        }
    }

    async requestMicrophonePermission() {
        try {
            const granted = await ipcRenderer.invoke('request-microphone-permission');
            this.updatePermissionStatus('microphone', granted);
        } catch (error) {
            console.error('Error requesting microphone permission:', error);
        }
    }

    openAccessibilitySettings() {
        ipcRenderer.invoke('open-accessibility-settings');
        // Show instructions
        this.showPermissionInstructions('accessibility');
    }

    openScreenRecordingSettings() {
        ipcRenderer.invoke('open-screen-recording-settings');
        // Show instructions
        this.showPermissionInstructions('screen');
    }

    showPermissionInstructions(type) {
        const instructions = {
            accessibility: 'Please enable VoiceMac in System Preferences > Security & Privacy > Accessibility',
            screen: 'Please enable VoiceMac in System Preferences > Security & Privacy > Screen Recording'
        };

        // Show modal or notification with instructions
        this.showNotification(instructions[type], 'info');
    }

    updatePermissionStatus(type, granted) {
        this.permissions[type] = granted;
        const statusElement = document.getElementById(`${type === 'microphone' ? 'mic' : type}-status`);
        
        if (granted) {
            statusElement.className = 'w-8 h-8 rounded-full bg-green-500 flex items-center justify-center';
            statusElement.innerHTML = '<span class="text-white text-sm">✓</span>';
        } else {
            statusElement.className = 'w-8 h-8 rounded-full bg-red-500 flex items-center justify-center';
            statusElement.innerHTML = '<span class="text-white text-sm">✗</span>';
        }

        // Update continue button state
        this.updateContinueButton();
    }

    updateContinueButton() {
        const continueBtn = document.getElementById('continue-to-tutorial');
        const allGranted = Object.values(this.permissions).every(p => p);
        
        continueBtn.disabled = !allGranted;
        if (allGranted) {
            continueBtn.classList.remove('disabled:opacity-50', 'disabled:cursor-not-allowed');
        }
    }

    goToTutorial() {
        this.updateStepIndicator(2);
        this.hideAllSteps();
        document.getElementById('tutorial-step').classList.remove('hidden');
        document.getElementById('step-title').textContent = 'Interactive Tutorial';
        this.currentStep = 2;
        this.startTutorial();
    }

    startTutorial() {
        if (this.currentTaskIndex >= this.tutorialTasks.length) {
            document.getElementById('continue-to-preferences').classList.remove('hidden');
            return;
        }

        const task = this.tutorialTasks[this.currentTaskIndex];
        const content = document.getElementById('tutorial-content');
        
        content.innerHTML = `
            <div class="text-6xl mb-4">🎯</div>
            <h3 class="text-xl font-semibold mb-4">Tutorial ${this.currentTaskIndex + 1}/3</h3>
            <p class="mb-2 opacity-90">Try saying:</p>
            <p class="mb-6 text-lg"><span class="bg-white bg-opacity-20 px-3 py-1 rounded-lg font-mono">"${task.command}"</span></p>
            <button id="tutorial-listen-btn" class="bg-red-500 hover:bg-red-600 px-6 py-3 rounded-xl text-white font-semibold">
                🎤 Start Listening
            </button>
        `;

        document.getElementById('tutorial-listen-btn').addEventListener('click', () => {
            this.startTutorialListening();
        });
    }

    async startTutorialListening() {
        const btn = document.getElementById('tutorial-listen-btn') || document.getElementById('start-listening');
        btn.textContent = '🔴 Listening...';
        btn.disabled = true;

        try {
            await ipcRenderer.invoke('start-tutorial-listening');
        } catch (error) {
            console.error('Error starting tutorial listening:', error);
            btn.textContent = '🎤 Try Again';
            btn.disabled = false;
        }
    }

    handleTutorialResult(data) {
        if (data.success) {
            this.markTaskCompleted(this.currentTaskIndex);
            this.currentTaskIndex++;
            
            setTimeout(() => {
                if (this.currentTaskIndex < this.tutorialTasks.length) {
                    this.startTutorial();
                } else {
                    this.completeTutorial();
                }
            }, 2000);
        } else {
            this.showTutorialError(data.error);
        }
    }

    markTaskCompleted(index) {
        this.tutorialTasks[index].completed = true;
        const taskElements = document.querySelectorAll('.tutorial-task');
        if (taskElements[index]) {
            taskElements[index].classList.remove('opacity-50');
            taskElements[index].classList.add('bg-green-500', 'bg-opacity-20');
            taskElements[index].innerHTML += '<div class="text-green-400 mt-2">✓</div>';
        }

        this.showNotification('Great job! Task completed successfully!', 'success');
    }

    showTutorialError(error) {
        this.showNotification(`Let's try that again: ${error}`, 'warning');
        const btn = document.getElementById('tutorial-listen-btn');
        if (btn) {
            btn.textContent = '🎤 Try Again';
            btn.disabled = false;
        }
    }

    completeTutorial() {
        document.getElementById('tutorial-content').innerHTML = `
            <div class="text-6xl mb-4">🎉</div>
            <h3 class="text-xl font-semibold mb-4">Tutorial Complete!</h3>
            <p class="mb-6 opacity-90">You've mastered the basics of VoiceMac</p>
            <div class="text-green-400 text-lg font-semibold">All tasks completed!</div>
        `;
        
        document.getElementById('continue-to-preferences').classList.remove('hidden');
    }

    goToPreferences() {
        this.updateStepIndicator(3);
        this.hideAllSteps();
        document.getElementById('preferences-step').classList.remove('hidden');
        document.getElementById('step-title').textContent = 'Preferences';
        this.currentStep = 3;
    }

    completeSetup() {
        this.updateStepIndicator(4);
        this.hideAllSteps();
        document.getElementById('completion-step').classList.remove('hidden');
        document.getElementById('step-title').textContent = 'Setup Complete';
        this.currentStep = 4;

        // Save user preferences
        this.savePreferences();
    }

    savePreferences() {
        const experience = document.querySelector('input[name="experience"]:checked').value;
        const enableAI = document.getElementById('enable-ai').checked;
        const enableSuggestions = document.getElementById('enable-suggestions').checked;

        const preferences = {
            experience,
            enableAI,
            enableSuggestions,
            onboardingCompleted: true,
            completedAt: new Date().toISOString()
        };

        ipcRenderer.invoke('save-onboarding-preferences', preferences);
    }

    async launchApp() {
        await ipcRenderer.invoke('launch-main-app');
        window.close();
    }

    updateStepIndicator(step) {
        // Reset all steps
        for (let i = 1; i <= 4; i++) {
            const stepEl = document.getElementById(`step-${i}`);
            stepEl.className = 'step-indicator w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold';
            
            if (i < step) {
                stepEl.classList.add('step-completed');
            } else if (i === step) {
                stepEl.classList.add('step-active');
            } else {
                stepEl.classList.add('bg-white', 'bg-opacity-20');
            }
        }
    }

    hideAllSteps() {
        document.querySelectorAll('.step-content').forEach(step => {
            step.classList.add('hidden');
        });
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${
            type === 'success' ? 'bg-green-500' : 
            type === 'warning' ? 'bg-yellow-500' : 
            type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Animate in
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.transition = 'transform 0.3s ease';
        }, 10);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Initialize onboarding when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new OnboardingManager();
}); 