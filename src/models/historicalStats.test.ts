/// <reference types="node" />
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BitcoinPowerLaw } from './PowerLaw';
import { LONG_RUN_RATIO } from './PricePath';
import historicalStats from './historicalStats.json';

// Recomputes src/models/historicalStats.json from the bundled CSV so displayed figures cannot go stale.
// Definition: denominator = all CSV rows; ratio = price / fair value at the row timestamp;
// below = strictly < 1, above = strictly > 1; ratios to 2 decimals, percentages to 1 decimal.
describe('historicalStats.json matches the bundled price history', () => {
  const csv = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'bitcoin-historical-data.csv'), 'utf8');
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => {
    const [date, price, timestamp] = line.split(',');
    return { date, ratio: Number(price) / BitcoinPowerLaw.calculateFairValue(new Date(Number(timestamp))) };
  });
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const pct = (count: number) => Math.round((count / rows.length) * 1000) / 10;

  it('csvVersion is the content hash of the CSV (it versions the CSV URL)', () => {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'bitcoin-historical-data.csv'));
    expect(historicalStats.csvVersion).toBe(crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12));
  });

  it('every CSV row is a valid observation (a blank or malformed row corrupts the median)', () => {
    expect(rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.ratio) && r.ratio > 0)).toBe(true);
  });

  it('the long-run withdrawal ratio stays below the historical median (conservative)', () => {
    expect(LONG_RUN_RATIO).toBeLessThan(historicalStats.medianRatio);
  });

  it('covers every row through the last CSV date', () => {
    expect(historicalStats.observations).toBe(rows.length);
    expect(historicalStats.through).toBe(rows[rows.length - 1].date);
  });

  it('has the right extremes and dates', () => {
    const min = rows.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    const max = rows.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    expect(historicalStats.minRatio).toBe(round2(min.ratio));
    expect(historicalStats.minDate).toBe(min.date);
    expect(historicalStats.maxRatio).toBe(round2(max.ratio));
    expect(historicalStats.maxDate).toBe(max.date);
  });

  it('has the right time below and above fair value', () => {
    expect(historicalStats.percentBelowFairValue).toBe(pct(rows.filter(r => r.ratio < 1).length));
    expect(historicalStats.percentAboveFairValue).toBe(pct(rows.filter(r => r.ratio > 1).length));
  });
});
