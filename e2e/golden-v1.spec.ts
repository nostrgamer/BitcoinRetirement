import { expect, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Golden v1: the legacy (pre-refactor) 50-year table, captured from the running UI at a pinned date.
// GOLDEN_WRITE=1 records the file; otherwise the current UI must reproduce it exactly.
const GOLDEN_FILE = path.join(__dirname, '..', 'golden', 'v1-legacy.json');
const PINNED_NOW = new Date('2026-10-24T12:00:00Z');

const PORTFOLIOS = [
  { name: 'A', bitcoin: '1', cash: '100000', withdrawal: '60000' },
  { name: 'B', bitcoin: '3', cash: '0', withdrawal: '60000' },
  { name: 'C', bitcoin: '0.5', cash: '200000', withdrawal: '40000' }
];

type Case = { id: string; portfolio: typeof PORTFOLIOS[number]; savings: boolean; doubling: boolean; offset: number };

const CASES: Case[] = PORTFOLIOS.flatMap(portfolio =>
  [false, true].flatMap(savings =>
    [false, true].flatMap(doubling =>
      [0, 5].map(offset => ({
        id: `${portfolio.name}-sav${savings ? 1 : 0}-dbl${doubling ? 1 : 0}-off${offset}`,
        portfolio, savings, doubling, offset
      }))
    )
  )
);

function fixedCsv(): string {
  const rows = ['date,price,timestamp'];
  const start = Date.UTC(2024, 0, 1);
  for (let day = 0; day <= 1000; day += 1) {
    const timestamp = start + day * 86400000;
    rows.push(`${new Date(timestamp).toISOString().split('T')[0]},100000,${timestamp}`);
  }
  return rows.join('\n');
}

async function mockData(page: Page) {
  await page.clock.setFixedTime(PINNED_NOW);
  await page.route('**/bitcoin-historical-data.csv', route =>
    route.fulfill({ status: 200, contentType: 'text/csv', body: fixedCsv() }));
  await page.route('**/api/bitcoin-data', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        current: { price: 110000, observedAt: PINNED_NOW.getTime(), source: 'Test fixture', status: 'live' },
        history: [],
        servedAt: PINNED_NOW.getTime(),
        status: 'partial'
      })
    }));
}

async function captureCase(page: Page, c: Case) {
  await page.getByLabel(/Bitcoin Holdings/i).fill(c.portfolio.bitcoin);
  await page.getByLabel(/Cash Holdings/i).fill(c.portfolio.cash);
  await page.getByLabel(/Annual Withdrawal Needed/i).fill(c.portfolio.withdrawal);
  await page.locator('#yearsUntilRetirement').fill(String(c.offset));

  const savingsToggle = page.getByLabel(/Enable Monthly Savings Projection/i);
  if ((await savingsToggle.isChecked()) !== c.savings) await savingsToggle.click();
  if (c.savings) {
    await page.getByLabel(/Monthly Savings Amount/i).fill('1000');
    await page.locator('#yearsToRetirement').fill(String(c.offset));
    const doublingToggle = page.getByLabel(/Double Down in Bear Markets/i);
    if ((await doublingToggle.isChecked()) !== c.doubling) await doublingToggle.click();
  }

  const table = page.locator('.retirement-projection table tbody tr');
  await expect(table.first()).toBeVisible();
  const rows = await table.evaluateAll(trs => trs.map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim()).join(' | ')));
  const verdict = (await page.getByText(/50-Year Simulation: (PASSED|FAILED)/).textContent())?.trim();
  return { verdict, rows };
}

test('legacy 50-year table matches golden v1', async ({ page }) => {
  test.setTimeout(240_000);
  await mockData(page);
  await page.goto('/');
  await expect(page.getByText('Retirement Inputs')).toBeVisible();

  const captured: Record<string, unknown> = {};
  for (const c of CASES) {
    // Reload per case so no state leaks between scenarios.
    await page.goto('/');
    await expect(page.getByText('Retirement Inputs')).toBeVisible();
    captured[c.id] = await captureCase(page, c);
  }

  if (process.env.GOLDEN_WRITE) {
    fs.mkdirSync(path.dirname(GOLDEN_FILE), { recursive: true });
    fs.writeFileSync(GOLDEN_FILE, JSON.stringify(captured, null, 2) + '\n');
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));
  expect(Object.keys(captured)).toHaveLength(24);
  expect(captured).toEqual(golden);
});
