import { expect, test } from '@playwright/test';

function makeHistoricalCsv(): string {
  const rows = ['date,price,timestamp'];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 420);

  for (let i = 0; i <= 420; i += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    const timestamp = date.getTime();
    rows.push(`${date.toISOString().split('T')[0]},100000,${timestamp}`);
  }

  return rows.join('\n');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/bitcoin-historical-data.csv', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: makeHistoricalCsv()
    });
  });

  await page.route('https://api.coingecko.com/api/v3/simple/price?**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ bitcoin: { usd: 100000 } })
    });
  });

  await page.route('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?**', async route => {
    const now = Date.now();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prices: [
          [now - 4 * 24 * 60 * 60 * 1000, 100000],
          [now - 3 * 24 * 60 * 60 * 1000, 100000],
          [now - 2 * 24 * 60 * 60 * 1000, 100000],
          [now - 1 * 24 * 60 * 60 * 1000, 100000],
          [now, 100000]
        ]
      })
    });
  });
});

test('underfunded withdrawals are surfaced as shortfalls, not counted as fully funded retirement income', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Retirement Inputs')).toBeVisible();

  // This scenario intentionally runs out of assets before a full 50-year retirement.
  // The regression guard is that the UI must show the shortfall instead of recording
  // the requested annual withdrawal as if it had been fully funded.
  await page.getByLabel(/Bitcoin Holdings/i).fill('0.01');
  await page.getByLabel(/Cash Holdings/i).fill('50000');
  await page.getByLabel(/Annual Withdrawal Needed/i).fill('10000');
  await page.getByLabel(/^Years Until Retirement/i).fill('0');

  await expect(page.getByText(/Withdrawal shortfall detected/i)).toBeVisible();
  await expect(page.getByText(/50-Year Simulation: FAILED/i)).toBeVisible();
  await expect(page.getByText(/shortfall/i).first()).toBeVisible();
  await expect(page.getByText(/Ready to Retire!/i)).toHaveCount(0);
});
