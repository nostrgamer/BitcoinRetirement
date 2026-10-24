import { expect, test } from '@playwright/test';
import { fairValue, LIVE_PRICE, mockMarket, retirementYear, setInputs, usd } from './fixtures';

const withdrawalRows = (page: import('@playwright/test').Page) =>
  page.locator('.projection-table tbody tr:not([data-phase="ACCUMULATION"])');

test.describe('retirement plan (stress path model)', () => {
  test.beforeEach(async ({ page }) => {
    await mockMarket(page);
    await page.goto('/');
    await expect(page.getByText('Retirement Inputs')).toBeVisible();
  });

  test('first four withdrawal rows, including RETIRE, follow the stress path', async ({ page }) => {
    await setInputs(page, { bitcoin: '3', cash: '0', withdrawal: '60000', years: '0' });
    const rows = withdrawalRows(page);
    const expected = [
      ['Floor (stress year 1)', 0.42],
      ['Floor (stress year 2)', 0.42],
      ['Floor (stress year 3)', 0.42],
      ['Recovery', 0.855],
      ['Long-run (0.84×)', 0.84]
    ] as const;
    for (let i = 0; i < expected.length; i++) {
      const cells = rows.nth(i).locator('td');
      await expect(cells.nth(0)).toContainText(`Nov ${2026 + i}`);
      await expect(cells.nth(1)).toHaveText(i === 0 ? '🏠 RETIRE' : '💸 SPEND');
      await expect(cells.nth(2)).toHaveText(expected[i][0]);
      await expect(cells.nth(3)).toHaveText(usd(fairValue(retirementYear(i)) * expected[i][1]));
    }
    await expect(page.locator('.projection-table')).not.toContainText(/Cycle|Bear|Bull/);
  });

  test('3.1 BTC at $60k/yr retiring now (Nov 2026) passes; the floor-forever line shows a year count', async ({ page }) => {
    await setInputs(page, { bitcoin: '3.1', cash: '0', withdrawal: '60000', years: '0' });
    await expect(page.getByText(/starting Nov 2026/)).toBeVisible();
    await expect(page.getByText('✅ Ready to Retire!')).toBeVisible();
    await expect(page.getByTestId('floor-forever-years')).toHaveText(/^\d+ years?$/);
  });

  test('3.0 BTC retiring now fails under the stress path (needs ~3.04)', async ({ page }) => {
    await setInputs(page, { bitcoin: '3', cash: '0', withdrawal: '60000', years: '0' });
    await expect(page.getByText(/50-Year Simulation: FAILED/)).toBeVisible();
  });

  test('cash-only portfolio gets a verdict', async ({ page }) => {
    await setInputs(page, { bitcoin: '0', cash: '180000', withdrawal: '60000', years: '0' });
    await expect(page.getByText(/50-Year Simulation: FAILED/)).toBeVisible();
    await expect(page.getByText(/3 of 50 withdrawals are fully funded/)).toBeVisible();
  });

  test('Bitcoin-at-retirement value and Total Assets agree (no cash)', async ({ page }) => {
    for (const years of ['0', '10']) {
      await setInputs(page, { bitcoin: '2', cash: '0', withdrawal: '60000', years });
      const valueText = await page.getByTestId('bitcoin-at-retirement-value').textContent();
      const product = (valueText || '').split('=').pop()?.trim();
      await expect(page.getByTestId('total-assets')).toHaveText(product as string);
    }
    // Retiring now values BTC at the live price; later starts use fair value on the start date.
    await setInputs(page, { bitcoin: '2', cash: '0', withdrawal: '60000', years: '10' });
    await expect(page.getByTestId('bitcoin-at-retirement-value')).toContainText('fair value on 1 Nov 2036');
    await setInputs(page, { bitcoin: '2', cash: '0', withdrawal: '60000', years: '0' });
    await expect(page.getByTestId('bitcoin-at-retirement-value')).toContainText('current price');
    await expect(page.getByTestId('bitcoin-at-retirement-value')).toContainText(`$${(2 * LIVE_PRICE / 1000).toFixed(0)}K`);
  });

  test('chart shows 10 years by default and the full retirement on request', async ({ page }) => {
    const horizon = async () => Number(await page.getByTestId('price-chart').getAttribute('data-horizon-end'));
    await setInputs(page, { bitcoin: '3', cash: '0', withdrawal: '60000', years: '0' });
    expect(await horizon()).toBeLessThanOrEqual(2037);
    await page.getByRole('button', { name: /Show full retirement \(through Nov 2075\)/ }).click();
    for (const years of [0, 10, 40, 50]) {
      await setInputs(page, { bitcoin: '3', cash: '0', withdrawal: '60000', years: String(years) });
      expect(await horizon()).toBeGreaterThanOrEqual(2026 + years + 49);
    }
    await page.getByRole('button', { name: 'Show next 10 years' }).click();
    expect(await horizon()).toBeLessThanOrEqual(2037);
  });

  test('savings: one retirement-years input, no Double Down, purchases stop at retirement', async ({ page }) => {
    await expect(page.getByLabel(/Years Until Retirement/i)).toHaveCount(1);
    await setInputs(page, { bitcoin: '0.5', cash: '0', withdrawal: '60000', years: '10', savings: '1000' });
    await expect(page.getByText(/Double Down/i)).toHaveCount(0);
    await expect(page.getByText('$120,000 over 120 months')).toBeVisible(); // Nov 2026 – Oct 2036
    const saveRows = page.locator('.projection-table tbody tr[data-phase="ACCUMULATION"]');
    await expect(saveRows).toHaveCount(10);
    await expect(saveRows.first().locator('td').first()).toContainText('Nov 2026 – Oct 2027');
    await expect(saveRows.last().locator('td').first()).toContainText('Nov 2035 – Oct 2036');
    await expect(withdrawalRows(page).first().locator('td').first()).toContainText('Nov 2036');
  });

  test('historical what-if shows a year computed from current holdings only', async ({ page }) => {
    await setInputs(page, { bitcoin: '5', cash: '0', withdrawal: '60000', years: '0', savings: '5000' });
    await expect(page.getByTestId('historical-year')).toHaveText(/^20\d\d$/);
    await expect(page.getByText(/no future savings/)).toBeVisible();
  });

  test('validation: blocking errors hide the analysis; large values only warn', async ({ page }) => {
    await setInputs(page, { bitcoin: '1', cash: '0', withdrawal: '', years: '0' });
    await expect(page.getByRole('alert')).toContainText('Annual withdrawal is required');
    await expect(page.locator('.retirement-status')).toHaveCount(0);

    await setInputs(page, { bitcoin: '1', cash: '0', withdrawal: '60000', years: '2.5' });
    await expect(page.getByRole('alert')).toContainText('whole number');

    await setInputs(page, { bitcoin: '1000.01', cash: '0', withdrawal: '60000', years: '0' });
    await expect(page.getByText(/above 1,000 BTC/)).toBeVisible();
    await expect(page.locator('.retirement-status')).toHaveCount(1);
  });

  test('page text: no "$$", no inflation or real-terms wording', async ({ page }) => {
    await setInputs(page, { bitcoin: '1', cash: '50000', withdrawal: '60000', years: '5', savings: '500' });
    await expect(page.locator('.retirement-status')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('$$');
    expect(html).not.toMatch(/inflation|real terms|purchasing power/i);
    // Whole-dollar prices in the table (no "$49,595.656"-style decimals).
    await expect(page.locator('.projection-table')).not.toContainText(/\$[\d,]+\.\d/);
  });
});

test('5-minute refresh keeps inputs, focus and scroll position', async ({ page }) => {
  const calls = await mockMarket(page, { installClock: true });
  await page.goto('/');
  await expect(page.getByText('Retirement Inputs')).toBeVisible();
  await setInputs(page, { bitcoin: '1.234', cash: '5000', withdrawal: '60000', years: '3' });
  await page.locator('#cashAmount').focus();
  await page.evaluate(() => window.scrollTo(0, 900));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const callsBefore = calls.api;

  await page.clock.runFor(5 * 60 * 1000 + 1000);
  await expect.poll(() => calls.api).toBeGreaterThan(callsBefore);
  await expect(page.getByText('Loading Bitcoin data...')).toHaveCount(0);

  await expect(page.locator('#bitcoinAmount')).toHaveValue('1.234');
  await expect(page.locator('#cashAmount')).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});
