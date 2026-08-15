import { expect, Page, test } from '@playwright/test';

const artifactDir = process.env.TASK_ARTIFACT_DIR;

function captureUnexpectedErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message: { type: () => string; text: () => string }) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error: Error) => errors.push(`page: ${error.message}`));
  return errors;
}

test('desktop loads live data through the same-origin function with provenance', async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_LIVE_DATA, 'Requires the local Netlify same-origin function server');
  const errors = captureUnexpectedErrors(page);
  const thirdPartyDataRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:8888' && /coin|crypto|api/i.test(url.hostname)) {
      thirdPartyDataRequests.push(request.url());
    }
  });

  await page.goto('/');

  await expect(page.getByText('Live market quote')).toBeVisible();
  await expect(page.getByText(/Source: Coinbase Exchange BTC-USD · Observed:/)).toBeVisible();
  await expect(page.getByText('Current Price:')).toBeVisible();
  await expect(page.getByText(/Last updated:/)).toHaveCount(0);
  expect(thirdPartyDataRequests).toEqual([]);
  expect(errors).toEqual([]);

  if (artifactDir) {
    await page.screenshot({ path: `${artifactDir}/desktop-live-data.png`, fullPage: true });
  }
});

test('mobile renders provenance without horizontal page overflow', async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_LIVE_DATA, 'Requires the local Netlify same-origin function server');
  const errors = captureUnexpectedErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByText(/Source: Coinbase Exchange BTC-USD · Observed:/)).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  expect(errors).toEqual([]);

  if (artifactDir) {
    await page.screenshot({ path: `${artifactDir}/mobile-live-data.png`, fullPage: true });
  }
});

test('function outage visibly uses the bundled historical fallback', async ({ page }) => {
  const errors = captureUnexpectedErrors(page);
  await page.route('**/api/bitcoin-data', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ current: null, history: [], status: 'fallback', servedAt: Date.now() })
  }));

  await page.goto('/');

  await expect(page.getByText('Fallback historical quote')).toBeVisible();
  await expect(page.getByText(/Source: Bundled historical CSV · Observed:/)).toBeVisible();
  await expect(page.getByText(/Fresh market data is unavailable/)).toBeVisible();
  expect(errors).toEqual([]);
});
