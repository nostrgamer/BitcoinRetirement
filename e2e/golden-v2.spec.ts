import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { mockMarket, setInputs } from './fixtures';

// Golden v2: the stress-path model's full table and verdicts at a pinned date.
// GOLDEN_WRITE=1 records the file; otherwise the UI must reproduce it exactly.
// Any change to these numbers must name its reason in the commit/PR.
const GOLDEN_FILE = path.join(__dirname, '..', 'golden', 'v2-stress-path.json');

const PORTFOLIOS = [
  { name: 'A', bitcoin: '1', cash: '100000', withdrawal: '60000' },
  { name: 'B', bitcoin: '3', cash: '0', withdrawal: '60000' },
  { name: 'C', bitcoin: '0.5', cash: '200000', withdrawal: '40000' }
];

const CASES = [
  ...PORTFOLIOS.flatMap(p => [false, true].flatMap(savings => [0, 5, 40].map(years => ({
    id: `${p.name}-sav${savings ? 1 : 0}-yrs${years}`,
    inputs: { bitcoin: p.bitcoin, cash: p.cash, withdrawal: p.withdrawal, years: String(years), savings: savings ? '1000' : undefined }
  })))),
  { id: 'cash-only-short', inputs: { bitcoin: '0', cash: '500000', withdrawal: '60000', years: '0', savings: undefined } },
  { id: 'cash-only-long', inputs: { bitcoin: '0', cash: '5000000', withdrawal: '60000', years: '0', savings: undefined } }
];

test('stress-path tables match golden v2', async ({ page }) => {
  test.setTimeout(240_000);
  await mockMarket(page);
  const captured: Record<string, unknown> = {};
  for (const c of CASES) {
    await page.goto('/');
    await expect(page.getByText('Retirement Inputs')).toBeVisible();
    await setInputs(page, c.inputs);
    await expect(page.locator('.projection-table tbody tr').first()).toBeVisible();
    captured[c.id] = {
      verdict: (await page.locator('.simulation-verdict h5').textContent())?.trim(),
      floorForever: (await page.getByTestId('floor-forever-years').textContent())?.trim(),
      totalAssets: (await page.getByTestId('total-assets').textContent())?.trim(),
      rows: await page.locator('.projection-table tbody tr').evaluateAll(trs => trs.map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim()).join(' | ')))
    };
  }

  if (process.env.GOLDEN_WRITE) {
    fs.mkdirSync(path.dirname(GOLDEN_FILE), { recursive: true });
    fs.writeFileSync(GOLDEN_FILE, JSON.stringify(captured, null, 2) + '\n');
  }
  expect(Object.keys(captured)).toHaveLength(20);
  expect(captured).toEqual(JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')));
});
