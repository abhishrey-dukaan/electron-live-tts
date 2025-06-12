const { chromium } = require('playwright');

class WebAutomation {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      console.log('🎭 Initializing Playwright for web automation...');
      this.browser = await chromium.launch({ headless: false });
      this.page = await this.browser.newPage();
      this.isInitialized = true;
      console.log('✅ Playwright web automation ready');
    } catch (error) {
      console.error('❌ Failed to initialize Playwright:', error);
      throw error;
    }
  }

  async executeWebTask(steps, onStepComplete) {
    await this.initialize();
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[Playwright] Executing step ${i + 1}/${steps.length}: ${step.action} on "${step.selector}"`);

      try {
        if (onStepComplete) {
          onStepComplete(`Executing: ${step.action} on ${step.selector}`, "active");
        }

        switch (step.action) {
          case 'navigate':
            await this.page.goto(step.url, { waitUntil: 'networkidle' });
            break;
          case 'click':
            await this.page.waitForSelector(step.selector, { timeout: 10000 });
            await this.page.click(step.selector);
            break;
          case 'type':
            await this.page.waitForSelector(step.selector, { timeout: 10000 });
            await this.page.type(step.selector, step.text, { delay: 50 });
            break;
          case 'press':
            await this.page.press(step.selector, step.key);
            break;
          case 'wait':
            await this.page.waitForTimeout(step.duration || 1000);
            break;
          default:
            throw new Error(`Unsupported Playwright action: ${step.action}`);
        }

        if (onStepComplete) {
          onStepComplete(`Completed: ${step.action} on ${step.selector}`, "completed");
        }
      } catch (error) {
        console.error(`[Playwright] Error at step ${i + 1}:`, error);
        if (onStepComplete) {
          onStepComplete(`Failed: ${step.action} - ${error.message}`, "failed");
        }
        throw new Error(`Playwright execution failed at step ${i + 1}: ${error.message}`);
      }
    }
    
    return { success: true, message: 'Web task completed successfully.' };
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isInitialized = false;
      console.log('🎭 Web automation browser closed');
    }
  }
}

module.exports = WebAutomation; 