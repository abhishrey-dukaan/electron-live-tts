const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

class PlaywrightService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.downloadedFiles = [];
  }

  async launchBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: false });
      this.context = await this.browser.newContext({ acceptDownloads: true });
      this.page = await this.context.newPage();
      
      this.page.on('download', async (download) => {
        const suggestedFilename = download.suggestedFilename();
        const downloadPath = path.join(__dirname, 'downloads', suggestedFilename);
        await download.saveAs(downloadPath);
        this.downloadedFiles.push(downloadPath);
        console.log(`📥 Download finished: ${downloadPath}`);
      });
    }
  }

  async navigateToUrl(url) {
    try {
      await this.launchBrowser();
      await this.page.goto(url, { waitUntil: 'networkidle' });
      return { success: true, message: `Navigated to ${url}` };
    } catch (error) {
      console.error(`Error navigating to ${url}:`, error);
      return { success: false, error: error.message };
    }
  }

  async searchGoogle(query) {
    try {
      await this.navigateToUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
      return { success: true, message: `Searched Google for "${query}"` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  async takeScreenshot(filename) {
    try {
        await this.launchBrowser();
        const screenshotPath = path.join(__dirname, 'test-screenshots', `${filename || `screenshot-${Date.now()}`}.png`);
        await this.page.screenshot({ path: screenshotPath });
        return { success: true, path: screenshotPath };
    } catch (error) {
        console.error('Error taking screenshot:', error);
        return { success: false, error: error.message };
    }
  }

  async downloadFile(url, filename) {
    try {
        await this.launchBrowser();
        const downloadPromise = this.page.waitForEvent('download');
        await this.page.goto(url);
        const download = await downloadPromise;
        const downloadPath = path.join(__dirname, 'downloads', filename || download.suggestedFilename());
        await download.saveAs(downloadPath);
        this.downloadedFiles.push(downloadPath);
        return { success: true, path: downloadPath };
    } catch(error) {
        console.error('Error downloading file:', error);
        return { success: false, error: error.message };
    }
  }

  getDownloadedFiles() {
    return this.downloadedFiles;
  }
  
  async executeWebTask(taskType, params) {
    switch(taskType) {
        case 'navigate':
            return await this.navigateToUrl(params.url);
        case 'search':
            return await this.searchGoogle(params.query);
        case 'screenshot':
            return await this.takeScreenshot(params.filename);
        case 'download':
            return await this.downloadFile(params.url, params.filename);
        default:
            return { success: false, error: 'Unknown web task' };
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.context = null;
      this.downloadedFiles = [];
    }
  }
}

module.exports = PlaywrightService; 