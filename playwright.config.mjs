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
  reporter: 'list',
  use: {
    browserName: 'chromium',
    headless: true,
    launchOptions: executablePath ? { executablePath } : {},
  },
});
