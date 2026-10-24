import { Page } from '@playwright/test';

export const PINNED_NOW = new Date('2026-10-24T12:00:00Z');
export const LIVE_PRICE = 83500;

const GENESIS_MS = 1231006505000;
/** Fair value on a local-time date, as the app computes it. */
export const fairValue = (date: Date) =>
  10 ** (-16.509 + 5.690 * Math.log10((date.getTime() - GENESIS_MS) / 86400000));

/** With the clock pinned to 24 Oct 2026, retiring now starts 1 Nov 2026; `offset` counts retirement years. */
export const retirementYear = (offset: number, yearsUntilRetirement = 0) =>
  new Date(2026 + yearsUntilRetirement + offset, 10, 1);

export const usd = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;

function fixedCsv(): string {
  const rows = ['date,price,timestamp'];
  const start = Date.UTC(2012, 0, 1);
  for (let day = 0; start + day * 86400000 <= Date.UTC(2026, 8, 30); day += 7) {
    const timestamp = start + day * 86400000;
    rows.push(`${new Date(timestamp).toISOString().split('T')[0]},50000,${timestamp}`);
  }
  return rows.join('\n');
}

/** Deterministic data: pinned clock, fixed CSV, fixed live quote. Returns a counter of API calls. */
export async function mockMarket(page: Page, { installClock = false } = {}) {
  const calls = { api: 0 };
  if (installClock) await page.clock.install({ time: PINNED_NOW });
  else await page.clock.setFixedTime(PINNED_NOW);
  await page.route('**/bitcoin-historical-data.csv', route =>
    route.fulfill({ status: 200, contentType: 'text/csv', body: fixedCsv() }));
  await page.route('**/api/bitcoin-data', route => {
    calls.api += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        current: { price: LIVE_PRICE, observedAt: PINNED_NOW.getTime(), source: 'Test fixture', status: 'live' },
        history: [],
        servedAt: PINNED_NOW.getTime(),
        status: 'partial',
        coverage: { from: null, to: null, complete: true }
      })
    });
  });
  return calls;
}

export async function setInputs(page: Page, values: { bitcoin?: string; cash?: string; withdrawal?: string; years?: string; savings?: string }) {
  if (values.bitcoin !== undefined) await page.locator('#bitcoinAmount').fill(values.bitcoin);
  if (values.cash !== undefined) await page.locator('#cashAmount').fill(values.cash);
  if (values.withdrawal !== undefined) await page.locator('#annualWithdrawal').fill(values.withdrawal);
  if (values.years !== undefined) await page.locator('#yearsUntilRetirement').fill(values.years);
  const toggle = page.getByLabel(/Enable Monthly Savings Projection/i);
  if (values.savings !== undefined) {
    if (!(await toggle.isChecked())) await toggle.click();
    await page.locator('#monthlySavingsAmount').fill(values.savings);
  } else if (await toggle.isChecked()) {
    await toggle.click();
  }
}
