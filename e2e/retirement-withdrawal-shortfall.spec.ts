import { expect, test } from '@playwright/test';
import { mockMarket } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockMarket(page);
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
