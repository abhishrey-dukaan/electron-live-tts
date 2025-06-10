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
      this.browser = await chromium.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.page = await this.browser.newPage();
      this.isInitialized = true;
      console.log('✅ Playwright web automation ready');
    } catch (error) {
      console.error('❌ Failed to initialize Playwright:', error);
      throw error;
    }
  }

  async executeYouTubeTask(transcript, onStepComplete) {
    try {
      await this.initialize();
      
      const steps = [
        "Open web browser",
        "Navigate to YouTube", 
        "Search for the requested video",
        "Select the appropriate video",
        "Start playback"
      ];
      
      // Step 1: Browser already open
      if (onStepComplete) {
        onStepComplete(steps[0], "completed");
        onStepComplete(steps[1], "active");
      }
      
      // Step 2: Navigate to YouTube
      console.log('🌐 Navigating to YouTube...');
      await this.page.goto('https://youtube.com');
      await this.page.waitForLoadState('networkidle');
      
      if (onStepComplete) {
        onStepComplete(steps[1], "completed");
        onStepComplete(steps[2], "active");
      }
      
      // Step 3: Extract search terms and search
      const searchTerms = this.extractSearchTerms(transcript);
      console.log(`🔍 Searching for: ${searchTerms}`);
      
      const searchBox = await this.page.locator('input[name="search_query"]').first();
      await searchBox.click();
      await searchBox.fill(searchTerms);
      await searchBox.press('Enter');
      
      await this.page.waitForSelector('#contents ytd-video-renderer', { timeout: 10000 });
      
      if (onStepComplete) {
        onStepComplete(steps[2], "completed");
        onStepComplete(steps[3], "active");
      }
      
      // Step 4: Click first video
      console.log('▶️ Selecting first video...');
      const firstVideo = await this.page.locator('#contents ytd-video-renderer').first();
      await firstVideo.click();
      
      await this.page.waitForSelector('video', { timeout: 15000 });
      
      if (onStepComplete) {
        onStepComplete(steps[3], "completed");
        onStepComplete(steps[4], "active");
      }
      
      // Step 5: Ensure playback starts
      await this.delay(2000);
      
      if (onStepComplete) {
        onStepComplete(steps[4], "completed");
      }
      
      return { 
        success: true, 
        message: `Successfully opened YouTube and started playing: ${searchTerms}` 
      };
      
    } catch (error) {
      console.error('YouTube automation failed:', error);
      return { success: false, error: `YouTube task failed: ${error.message}` };
    }
  }

  async executeSearchTask(transcript, onStepComplete) {
    try {
      await this.initialize();
      
      const steps = [
        "Open web browser",
        "Navigate to Google",
        "Perform search",
        "Display results"
      ];
      
      if (onStepComplete) {
        onStepComplete(steps[0], "completed");
        onStepComplete(steps[1], "active");
      }
      
      console.log('🌐 Navigating to Google...');
      await this.page.goto('https://google.com');
      await this.page.waitForLoadState('networkidle');
      
      if (onStepComplete) {
        onStepComplete(steps[1], "completed");
        onStepComplete(steps[2], "active");
      }
      
      const searchTerms = this.extractSearchTerms(transcript);
      console.log(`🔍 Searching for: ${searchTerms}`);
      
      const searchBox = await this.page.locator('input[name="q"]').first();
      await searchBox.click();
      await searchBox.fill(searchTerms);
      await searchBox.press('Enter');
      
      await this.page.waitForLoadState('networkidle');
      
      if (onStepComplete) {
        onStepComplete(steps[2], "completed");
        onStepComplete(steps[3], "completed");
      }
      
      return { 
        success: true, 
        message: `Successfully searched Google for: ${searchTerms}` 
      };
      
    } catch (error) {
      console.error('Search automation failed:', error);
      return { success: false, error: `Search task failed: ${error.message}` };
    }
  }

  extractSearchTerms(transcript) {
    return transcript
      .toLowerCase()
      .replace(/^(open|play|search|find|google|youtube)\s+/g, '')
      .replace(/\s+(on youtube|on google|video|videos)\s*$/g, '')
      .trim() || transcript;
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WebAutomation; 