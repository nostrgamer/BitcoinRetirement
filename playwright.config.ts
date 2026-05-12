import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium-browser';
const launchOptions = fs.existsSync(chromiumExecutable)
  ? { executablePath: chromiumExecutable }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
    launchOptions
  },
  webServer: {
    command: 'BROWSER=none HOST=127.0.0.1 PORT=3100 npm start',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
