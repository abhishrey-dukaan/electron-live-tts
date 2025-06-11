const { devices } = require('@playwright/test');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './',
  testMatch: ['comprehensive-test.js'],
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  retries: 2,
  workers: 1, // Run tests sequentially
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-report' }],
    ['json', { outputFile: 'test-results/test-results.json' }]
  ],
  use: {
    screenshot: 'only-on-failure',
    video: {
      mode: 'retain-on-failure',
      size: { width: 1280, height: 720 }
    },
    trace: 'retain-on-failure'
  },
  outputDir: 'test-results',
  preserveOutput: 'always',
  projects: [
    {
      name: 'electron',
      testMatch: /.*\.js/
    }
  ]
}

module.exports = config; 