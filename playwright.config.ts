import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium-browser';
const launchOptions = fs.existsSync(chromiumExecutable)
  ? { executablePath: chromiumExecutable }
  : undefined;

const port = process.env.PLAYWRIGHT_PORT || '3100';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    launchOptions
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER ? undefined : {
    command: `BROWSER=none HOST=127.0.0.1 PORT=${port} npm start`,
    url: `http://127.0.0.1:${port}`,
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
