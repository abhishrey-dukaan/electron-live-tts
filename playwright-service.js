const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * PlaywrightService class for web automation and browser tasks
 */
class PlaywrightService {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.downloadedFiles = [];
    this.downloadsPath = path.join(__dirname, 'downloads');
    this.screenshotsPath = path.join(__dirname, 'screenshots');
    this.isInitialized = false;
    this.defaultTimeout = 30000; // 30 seconds
  }

  /**
   * Initialize the browser and context
   */
  async init(browserType = 'chromium', options = {}) {
    try {
      // Ensure directories exist
      if (!fs.existsSync(this.downloadsPath)) {
        fs.mkdirSync(this.downloadsPath, { recursive: true });
      }
      if (!fs.existsSync(this.screenshotsPath)) {
        fs.mkdirSync(this.screenshotsPath, { recursive: true });
      }

      console.log(`🌐 Initializing ${browserType} browser...`);
      
      // Select browser
      let browserLauncher;
      switch (browserType.toLowerCase()) {
        case 'firefox':
          browserLauncher = firefox;
          break;
        case 'webkit':
        case 'safari':
          browserLauncher = webkit;
          break;
        case 'chromium':
        case 'chrome':
        default:
          browserLauncher = chromium;
          break;
      }

      // Launch browser
      this.browser = await browserLauncher.launch({
        headless: options.headless !== false, // Default to headless
        ...options
      });

      // Create context with download handling
      this.context = await this.browser.newContext({
        acceptDownloads: true,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // Set default timeouts
      this.context.setDefaultTimeout(this.defaultTimeout);

      // Handle downloads
      this.context.on('page', page => {
        page.on('download', async download => {
          const filename = download.suggestedFilename();
          const filepath = path.join(this.downloadsPath, filename);
          await download.saveAs(filepath);
          this.downloadedFiles.push({
            filename,
            filepath,
            url: download.url(),
            timestamp: new Date()
          });
          console.log(`📁 Downloaded: ${filename}`);
        });
      });

      // Create initial page
      this.page = await this.context.newPage();
      this.isInitialized = true;
      
      console.log('✅ Playwright service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Playwright service:', error);
      throw error;
    }
  }

  /**
   * Ensure the service is initialized
   */
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  /**
   * Execute a web task based on type and parameters
   */
  async executeWebTask(taskType, params = {}) {
    await this.ensureInitialized();

    try {
      switch (taskType.toLowerCase()) {
        case 'navigate':
        case 'go':
          return await this.navigateToUrl(params.url);
        
        case 'search':
          return await this.searchGoogle(params.query);
        
        case 'download':
          return await this.downloadFile(params.url, params.filename);
        
        case 'screenshot':
          return await this.takeScreenshot(params.filename);
        
        case 'click':
          return await this.clickElement(params.selector);
        
        case 'type':
        case 'input':
          return await this.typeText(params.selector, params.text);
        
        case 'submit':
          return await this.submitForm(params.selector);
        
        case 'scroll':
          return await this.scroll(params.direction, params.amount);
        
        case 'wait':
          return await this.waitForElement(params.selector);
        
        case 'extract':
          return await this.extractText(params.selector);
        
        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }
    } catch (error) {
      console.error(`❌ Web task failed: ${taskType}`, error);
      return {
        success: false,
        error: error.message,
        taskType
      };
    }
  }

  /**
   * Navigate to a specific URL
   */
  async navigateToUrl(url) {
    await this.ensureInitialized();

    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      console.log(`🌐 Navigating to: ${url}`);
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      
      return {
        success: true,
        message: `Successfully navigated to ${url}`,
        url: this.page.url()
      };
    } catch (error) {
      console.error(`❌ Navigation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        url
      };
    }
  }

  /**
   * Search Google for a query
   */
  async searchGoogle(query) {
    await this.ensureInitialized();

    try {
      console.log(`🔍 Searching Google for: ${query}`);
      
      // Navigate to Google
      await this.page.goto('https://www.google.com');
      
      // Accept cookies if present
      try {
        await this.page.click('button:has-text("Accept all")', { timeout: 2000 });
      } catch (e) {
        // Ignore if not found
      }
      
      // Find and fill search box
      const searchBox = await this.page.locator('input[name="q"]');
      await searchBox.fill(query);
      await searchBox.press('Enter');
      
      // Wait for results
      await this.page.waitForSelector('#search', { timeout: 10000 });
      
      return {
        success: true,
        message: `Search completed for: ${query}`,
        url: this.page.url(),
        query
      };
    } catch (error) {
      console.error(`❌ Google search failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        query
      };
    }
  }

  /**
   * Download a file from a URL
   */
  async downloadFile(url, filename = null) {
    await this.ensureInitialized();

    try {
      console.log(`📁 Downloading file from: ${url}`);
      
      if (!filename) {
        filename = path.basename(url) || `download_${Date.now()}`;
      }
      
      const filepath = path.join(this.downloadsPath, filename);
      
      // Navigate and trigger download
      await this.page.goto(url);
      
      // Wait a bit for download to complete
      await this.page.waitForTimeout(2000);
      
      return {
        success: true,
        message: `File downloaded: ${filename}`,
        filename,
        filepath,
        url
      };
    } catch (error) {
      console.error(`❌ Download failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        url,
        filename
      };
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot(filename = null) {
    await this.ensureInitialized();

    try {
      if (!filename) {
        filename = `screenshot_${Date.now()}.png`;
      }
      
      if (!filename.endsWith('.png')) {
        filename += '.png';
      }
      
      const filepath = path.join(this.screenshotsPath, filename);
      
      console.log(`📸 Taking screenshot: ${filename}`);
      await this.page.screenshot({ 
        path: filepath, 
        fullPage: true 
      });
      
      return {
        success: true,
        message: `Screenshot saved: ${filename}`,
        filename,
        filepath
      };
    } catch (error) {
      console.error(`❌ Screenshot failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filename
      };
    }
  }

  /**
   * Click an element by selector
   */
  async clickElement(selector) {
    await this.ensureInitialized();

    try {
      console.log(`🖱️ Clicking element: ${selector}`);
      await this.page.click(selector);
      
      return {
        success: true,
        message: `Clicked element: ${selector}`,
        selector
      };
    } catch (error) {
      console.error(`❌ Click failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        selector
      };
    }
  }

  /**
   * Type text into an element
   */
  async typeText(selector, text) {
    await this.ensureInitialized();

    try {
      console.log(`⌨️ Typing into element: ${selector}`);
      await this.page.fill(selector, text);
      
      return {
        success: true,
        message: `Text entered into ${selector}`,
        selector,
        text
      };
    } catch (error) {
      console.error(`❌ Type failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        selector,
        text
      };
    }
  }

  /**
   * Submit a form
   */
  async submitForm(selector = 'form') {
    await this.ensureInitialized();

    try {
      console.log(`📤 Submitting form: ${selector}`);
      await this.page.press(selector, 'Enter');
      
      return {
        success: true,
        message: `Form submitted: ${selector}`,
        selector
      };
    } catch (error) {
      console.error(`❌ Form submission failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        selector
      };
    }
  }

  /**
   * Scroll the page
   */
  async scroll(direction = 'down', amount = 500) {
    await this.ensureInitialized();

    try {
      const scrollAmount = direction === 'up' ? -amount : amount;
      await this.page.evaluate((amount) => {
        window.scrollBy(0, amount);
      }, scrollAmount);
      
      return {
        success: true,
        message: `Scrolled ${direction} by ${amount}px`,
        direction,
        amount
      };
    } catch (error) {
      console.error(`❌ Scroll failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        direction,
        amount
      };
    }
  }

  /**
   * Wait for an element to appear
   */
  async waitForElement(selector, timeout = this.defaultTimeout) {
    await this.ensureInitialized();

    try {
      console.log(`⏳ Waiting for element: ${selector}`);
      await this.page.waitForSelector(selector, { timeout });
      
      return {
        success: true,
        message: `Element found: ${selector}`,
        selector
      };
    } catch (error) {
      console.error(`❌ Wait failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        selector
      };
    }
  }

  /**
   * Extract text from an element
   */
  async extractText(selector) {
    await this.ensureInitialized();

    try {
      console.log(`📝 Extracting text from: ${selector}`);
      const text = await this.page.textContent(selector);
      
      return {
        success: true,
        message: `Text extracted from ${selector}`,
        selector,
        text: text?.trim() || ''
      };
    } catch (error) {
      console.error(`❌ Text extraction failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        selector
      };
    }
  }

  /**
   * Get list of downloaded files
   */
  getDownloadedFiles() {
    return this.downloadedFiles;
  }

  /**
   * Clear downloaded files list
   */
  clearDownloadedFiles() {
    this.downloadedFiles = [];
  }

  /**
   * Get current page URL
   */
  getCurrentUrl() {
    return this.page ? this.page.url() : null;
  }

  /**
   * Get current page title
   */
  async getCurrentTitle() {
    if (!this.page) return null;
    return await this.page.title();
  }

  /**
   * Close the browser and clean up
   */
  async close() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      this.isInitialized = false;
      console.log('✅ Playwright service closed');
    } catch (error) {
      console.error('❌ Error closing Playwright service:', error);
    }
  }
}

module.exports = PlaywrightService; 