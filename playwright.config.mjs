import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const localChrome = process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : undefined;
const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE
  || (localChrome && existsSync(localChrome) ? localChrome : undefined);

export default defineConfig({
  testDir: './browser',
  workers: 1,
  fullyParallel: false,
  // On CI, failures also become GitHub annotations, which are readable without signing in.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { headless: true },
  // Screenshot baselines are per browser and platform; small anti-aliasing noise is allowed.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' } },
  projects: [
    // The whole suite runs in Chromium.
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: executablePath ? { executablePath } : {} } },
    // The judge path also runs in Firefox and WebKit: tests tagged @cross-browser.
    { name: 'firefox', use: { browserName: 'firefox' }, grep: /@cross-browser/, grepInvert: /@visual/ },
    { name: 'webkit', use: { browserName: 'webkit' }, grep: /@cross-browser/, grepInvert: /@visual/ },
  ],
});
