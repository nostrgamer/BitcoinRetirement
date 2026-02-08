/**
 * Tests for retirement logic used in BitcoinChart:
 * - Bear Market Test (2 years at floor, 1 year recovery, 20-year runway)
 * - 50-year simulation cycle prices (year 0,1 = floor; 2 = recovery; 3+ = 4-year cycle)
 * - Chart projected price formula (same anchor and sequence)
 */

import { BitcoinPowerLaw } from '../models/PowerLaw';

// Replicate the Bear Market Test logic from BitcoinChart (2 years at floor, then recovery, then 20-year runway)
function bearMarketTest(
  year: number,
  bitcoinHoldings: number,
  annualWithdrawal: number,
  cashHoldings: number = 0
): { passes: boolean; remainingBitcoin: number; remainingCash: number } {
  if (bitcoinHoldings <= 0 || annualWithdrawal <= 0) return { passes: false, remainingBitcoin: 0, remainingCash: 0 };

  let remainingBitcoin = bitcoinHoldings;
  let remainingCash = Math.max(0, cashHoldings);
  const targetDate = new Date(year, 0, 1);
  const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
  const deepBearPrice = floorValue;

  // Year 1 at floor
  if (remainingCash >= annualWithdrawal) {
    remainingCash -= annualWithdrawal;
  } else {
    const need = annualWithdrawal - remainingCash;
    remainingCash = 0;
    remainingBitcoin -= need / deepBearPrice;
    if (remainingBitcoin < 0) return { passes: false, remainingBitcoin: 0, remainingCash: 0 };
  }
  // Year 2 at floor
  if (remainingCash >= annualWithdrawal) {
    remainingCash -= annualWithdrawal;
  } else {
    const need = annualWithdrawal - remainingCash;
    remainingCash = 0;
    remainingBitcoin -= need / deepBearPrice;
    if (remainingBitcoin < 0) return { passes: false, remainingBitcoin: 0, remainingCash: 0 };
  }
  // Year 3 recovery
  const bearRecoveryPrice = floorValue + (fairValue - floorValue) * 0.75;
  if (remainingCash >= annualWithdrawal) {
    remainingCash -= annualWithdrawal;
  } else {
    const need = annualWithdrawal - remainingCash;
    remainingCash = 0;
    remainingBitcoin -= need / bearRecoveryPrice;
    if (remainingBitcoin < 0) return { passes: false, remainingBitcoin: 0, remainingCash: 0 };
  }

  const totalRemainingValue = remainingBitcoin * fairValue + remainingCash;
  const yearsOfRunway = totalRemainingValue / annualWithdrawal;
  const minimumYearsRequired = 20;

  return {
    passes: yearsOfRunway >= minimumYearsRequired,
    remainingBitcoin,
    remainingCash
  };
}

// Replicate 50-year simulation price for withdrawal year index (0 = first year of retirement)
function getWithdrawalPhasePrice(retirementStartYear: number, yearIndex: number): { price: number; phase: string } {
  const targetDate = new Date(retirementStartYear + yearIndex, 0, 1);
  const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
  const upperBound = BitcoinPowerLaw.calculateUpperBound(targetDate);

  if (yearIndex === 0 || yearIndex === 1) {
    return { price: floorValue, phase: yearIndex === 0 ? 'Retirement Start (Deep Bear — Year 1)' : 'Deep Bear (Floor) — Year 2' };
  }
  if (yearIndex === 2) {
    const price = floorValue + (fairValue - floorValue) * 0.75;
    return { price, phase: 'Bear Market Recovery' };
  }
  const cycleYear = (yearIndex - 3) % 4;
  switch (cycleYear) {
    case 0:
      return { price: floorValue, phase: 'Deep Bear (Floor)' };
    case 1:
      return { price: floorValue + (fairValue - floorValue) * 0.75, phase: 'Bear Market Recovery' };
    case 2:
      return { price: fairValue + (upperBound - fairValue) * 0.7, phase: 'Bull Market' };
    case 3:
      return { price: fairValue + (upperBound - fairValue) * 0.3, phase: 'Bull Peak & Correction' };
    default:
      return { price: fairValue, phase: 'Fair Value' };
  }
}

// Chart plan price: anchor year = chartRetirementStartYear, same sequence (0,1=floor; 2=recovery; 3+=cycle)
function getChartPlanPriceForYear(year: number, chartRetirementStartYear: number): number | null {
  if (year < chartRetirementStartYear) return null;
  const targetDate = new Date(year, 0, 1);
  const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
  const upperBound = BitcoinPowerLaw.calculateUpperBound(targetDate);
  const offset = year - chartRetirementStartYear;

  if (offset === 0 || offset === 1) return floorValue;
  if (offset === 2) return floorValue + (fairValue - floorValue) * 0.75;
  const cycleYear = (offset - 3) % 4;
  switch (cycleYear) {
    case 0: return floorValue;
    case 1: return floorValue + (fairValue - floorValue) * 0.75;
    case 2: return fairValue + (upperBound - fairValue) * 0.7;
    case 3: return fairValue + (upperBound - fairValue) * 0.3;
    default: return fairValue;
  }
}

describe('RetirementLogic (chart/table)', () => {
  const testYear = 2026;

  describe('Bear Market Test (2 years at floor, 1 recovery, 20-year runway)', () => {
    it('fails with zero Bitcoin', () => {
      const r = bearMarketTest(testYear, 0, 60000, 100000);
      expect(r.passes).toBe(false);
    });

    it('fails with zero annual withdrawal', () => {
      const r = bearMarketTest(testYear, 1, 0, 0);
      expect(r.passes).toBe(false);
    });

    it('uses cash before selling Bitcoin', () => {
      const r = bearMarketTest(testYear, 2, 50000, 100000);
      expect(r.remainingCash).toBeLessThan(100000);
      expect(r.remainingBitcoin).toBeLessThan(2);
      expect(r.remainingBitcoin).toBeGreaterThan(0);
    });

    it('passes with enough cash to cover 2 years at floor and sufficient BTC for 20-year runway', () => {
      // Cash covers 2 years; year 3 uses recovery (some BTC sold). Need enough BTC so remaining value ≥ 20× withdrawal
      const r = bearMarketTest(testYear, 10, 30000, 120000); // 10 BTC, 30k/yr, 120k cash (covers 2 years)
      expect(r.passes).toBe(true);
      expect(r.remainingBitcoin).toBeGreaterThan(0);
      expect(r.remainingBitcoin).toBeLessThanOrEqual(10);
    });

    it('requires 20+ years runway after bear market', () => {
      const r = bearMarketTest(testYear, 0.2, 80000, 0);
      expect(r.passes).toBe(false);
    });

    it('passes with sufficient Bitcoin and no cash', () => {
      const r = bearMarketTest(testYear, 10, 30000, 0);
      expect(r.passes).toBe(true);
      expect(r.remainingBitcoin).toBeGreaterThan(0);
    });

    it('recovery price is between floor and fair value', () => {
      const d = new Date(testYear, 0, 1);
      const fair = BitcoinPowerLaw.calculateFairValue(d);
      const floor = BitcoinPowerLaw.calculateFloorPrice(d);
      const recovery = floor + (fair - floor) * 0.75;
      expect(recovery).toBeGreaterThan(floor);
      expect(recovery).toBeLessThan(fair);
    });
  });

  describe('50-year simulation cycle prices', () => {
    const startYear = 2026;

    it('year 0 and 1 are at Power Law floor', () => {
      const y0 = getWithdrawalPhasePrice(startYear, 0);
      const y1 = getWithdrawalPhasePrice(startYear, 1);
      const floor0 = BitcoinPowerLaw.calculateFloorPrice(new Date(startYear, 0, 1));
      const floor1 = BitcoinPowerLaw.calculateFloorPrice(new Date(startYear + 1, 0, 1));
      expect(y0.price).toBeCloseTo(floor0, 2);
      expect(y1.price).toBeCloseTo(floor1, 2);
    });

    it('year 2 is recovery (75% from floor to fair)', () => {
      const y2 = getWithdrawalPhasePrice(startYear, 2);
      const d = new Date(startYear + 2, 0, 1);
      const fair = BitcoinPowerLaw.calculateFairValue(d);
      const floor = BitcoinPowerLaw.calculateFloorPrice(d);
      const expected = floor + (fair - floor) * 0.75;
      expect(y2.price).toBeCloseTo(expected, 2);
      expect(y2.phase).toBe('Bear Market Recovery');
    });

    it('years 3–6 repeat floor, recovery, bull, peak', () => {
      const y3 = getWithdrawalPhasePrice(startYear, 3);
      const y4 = getWithdrawalPhasePrice(startYear, 4);
      const y5 = getWithdrawalPhasePrice(startYear, 5);
      const y6 = getWithdrawalPhasePrice(startYear, 6);
      expect(y3.phase).toBe('Deep Bear (Floor)');
      expect(y4.phase).toBe('Bear Market Recovery');
      expect(y5.phase).toBe('Bull Market');
      expect(y6.phase).toBe('Bull Peak & Correction');
    });

    it('cycle repeats every 4 years after year 2', () => {
      const y7 = getWithdrawalPhasePrice(startYear, 7);
      const y8 = getWithdrawalPhasePrice(startYear, 8);
      expect(y7.phase).toBe('Deep Bear (Floor)');
      expect(y8.phase).toBe('Bear Market Recovery');
    });

    it('bull price is above fair value', () => {
      const y5 = getWithdrawalPhasePrice(startYear, 5);
      const d = new Date(startYear + 5, 0, 1);
      const fair = BitcoinPowerLaw.calculateFairValue(d);
      expect(y5.price).toBeGreaterThan(fair);
    });

    it('peak price is above fair value, below upper bound', () => {
      const y6 = getWithdrawalPhasePrice(startYear, 6);
      const d = new Date(startYear + 6, 0, 1);
      const fair = BitcoinPowerLaw.calculateFairValue(d);
      const upper = BitcoinPowerLaw.calculateUpperBound(d);
      expect(y6.price).toBeGreaterThan(fair);
      expect(y6.price).toBeLessThanOrEqual(upper);
    });
  });

  describe('Chart projected price (same anchor and sequence)', () => {
    const anchorYear = 2027;

    it('returns null for years before anchor', () => {
      expect(getChartPlanPriceForYear(anchorYear - 1, anchorYear)).toBeNull();
      expect(getChartPlanPriceForYear(2020, anchorYear)).toBeNull();
    });

    it('anchor year and next year are floor', () => {
      const p0 = getChartPlanPriceForYear(anchorYear, anchorYear);
      const p1 = getChartPlanPriceForYear(anchorYear + 1, anchorYear);
      const floor0 = BitcoinPowerLaw.calculateFloorPrice(new Date(anchorYear, 0, 1));
      const floor1 = BitcoinPowerLaw.calculateFloorPrice(new Date(anchorYear + 1, 0, 1));
      expect(p0).toBeCloseTo(floor0, 2);
      expect(p1).toBeCloseTo(floor1, 2);
    });

    it('chart plan matches withdrawal phase price for same year', () => {
      const chartPrice = getChartPlanPriceForYear(anchorYear + 3, anchorYear);
      const tablePrice = getWithdrawalPhasePrice(anchorYear, 3);
      expect(chartPrice).toBeCloseTo(tablePrice.price, 2);
    });
  });

  describe('Power Law consistency (floor < fair < upper)', () => {
    it('holds for retirement start year 2026 and 2030', () => {
      for (const y of [2026, 2030]) {
        const d = new Date(y, 0, 1);
        const floor = BitcoinPowerLaw.calculateFloorPrice(d);
        const fair = BitcoinPowerLaw.calculateFairValue(d);
        const upper = BitcoinPowerLaw.calculateUpperBound(d);
        expect(floor).toBeLessThan(fair);
        expect(fair).toBeLessThan(upper);
        expect(floor).toBeCloseTo(fair * 0.42, 2);
        expect(upper).toBeCloseTo(fair * 2, 2);
      }
    });
  });
});
