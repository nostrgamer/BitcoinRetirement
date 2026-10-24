import { BitcoinPowerLaw } from '../models/PowerLaw';
import {
  FLOOR_RATIO,
  LONG_RUN_RATIO,
  RECOVERY_RATIO,
  retirementStartDate,
  retirementValuationPrice,
  retirementYearStart,
  withdrawalBasisLabel,
  withdrawalRatio
} from '../models/PricePath';
import { buildRetirementPlan, firstPassingYear, hasPlanAssets, projectSavings, simulateRetirement } from './retirementPlan';

const fv = (date: Date) => BitcoinPowerLaw.calculateFairValue(date);

/** Smallest BTC holding (no cash) that passes all 50 years, found by bisection. */
const btcNeeded = (annualWithdrawal: number, startDate: Date, path: 'stress' | 'floorForever') => {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (simulateRetirement({ bitcoin: mid, cash: 0, annualWithdrawal, startDate, path }).passes) hi = mid;
    else lo = mid;
  }
  return hi;
};

describe('withdrawal price path', () => {
  it('opens with 3 floor years, 1 recovery year, then 0.76x fair value', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(offset => withdrawalRatio(offset))).toEqual([
      0.42, 0.42, 0.42, RECOVERY_RATIO, 0.76, 0.76, 0.76
    ]);
    expect(RECOVERY_RATIO).toBeCloseTo(0.855, 10);
    expect(LONG_RUN_RATIO).toBe(0.76);
  });

  it('never prices a retirement year above fair value', () => {
    for (let offset = 0; offset < 50; offset++) {
      expect(withdrawalRatio(offset)).toBeLessThan(1);
    }
  });

  it('floor-forever prices every year at the floor', () => {
    for (let offset = 0; offset < 50; offset++) {
      expect(withdrawalRatio(offset, 'floorForever')).toBe(FLOOR_RATIO);
    }
  });

  it('labels each year by its price basis', () => {
    expect([0, 1, 2, 3, 4].map(offset => withdrawalBasisLabel(offset))).toEqual([
      'Floor (stress year 1)',
      'Floor (stress year 2)',
      'Floor (stress year 3)',
      'Recovery',
      'Long-run (0.76×)'
    ]);
  });
});

describe('reference fixtures ($60k/yr for 50 years, BTC only)', () => {
  it('stress path from 1 Jan 2027 needs 2.97 BTC', () => {
    expect(btcNeeded(60000, new Date(2027, 0, 1), 'stress')).toBeCloseTo(2.974, 2);
  });

  it('floor-forever from 1 Jan 2027 needs 3.81 BTC', () => {
    expect(btcNeeded(60000, new Date(2027, 0, 1), 'floorForever')).toBeCloseTo(3.805, 2);
  });

  it('stress path from 1 Nov 2026 needs 3.12 BTC', () => {
    expect(btcNeeded(60000, new Date(2026, 10, 1), 'stress')).toBeCloseTo(3.116, 2);
  });
});

describe('simulateRetirement: fully funded year count', () => {
  const run = (bitcoin: number, cash: number, path: 'stress' | 'floorForever' = 'stress') =>
    simulateRetirement({ bitcoin, cash, annualWithdrawal: 60000, startDate: new Date(2027, 0, 1), path });

  it('BTC only: counts years until the first shortfall', () => {
    const result = run(1, 0);
    expect(result.passes).toBe(false);
    expect(result.fullyFundedYears).toBe(result.rows.length - 1);
    expect(result.rows[result.rows.length - 1].withdrawalShortfall).toBeGreaterThan(0);
  });

  it('cash only: lasts exactly cash / withdrawal years', () => {
    const result = run(0, 180000);
    expect(result.fullyFundedYears).toBe(3);
    expect(result.rows).toHaveLength(3); // depleted exactly at the end of year 3
  });

  it('cash running out mid-withdrawal is topped up from BTC', () => {
    const result = run(1, 90000);
    expect(result.rows[1].cashUsed).toBeCloseTo(30000, 6);
    expect(result.rows[1].bitcoinSold).toBeGreaterThan(0);
    expect(result.rows[1].withdrawalShortfall).toBe(0);
  });

  it('a first-year shortfall counts zero funded years', () => {
    const result = run(0.01, 0);
    expect(result.fullyFundedYears).toBe(0);
    expect(result.rows).toHaveLength(1);
  });

  it('enough assets pass all 50 years', () => {
    const result = run(3, 0);
    expect(result.passes).toBe(true);
    expect(result.fullyFundedYears).toBe(50);
    expect(result.rows).toHaveLength(50);
  });

  it.each([
    [0.5, 0], [1, 100000], [2, 0], [0, 500000], [2.5, 50000], [5, 0]
  ])('floor-forever never outlasts the stress path (%f BTC, $%i cash)', (bitcoin, cash) => {
    expect(run(bitcoin, cash, 'floorForever').fullyFundedYears).toBeLessThanOrEqual(run(bitcoin, cash).fullyFundedYears);
  });

  it('returns a failing result for a zero withdrawal', () => {
    expect(simulateRetirement({ bitcoin: 1, cash: 0, annualWithdrawal: 0, startDate: new Date(2027, 0, 1), path: 'stress' }).passes).toBe(false);
  });
});

describe('savings projection date convention', () => {
  const now = new Date(2026, 9, 24); // 24 Oct 2026

  it('retirement starts on the first of next month, plus N years', () => {
    expect(retirementStartDate(now, 0)).toEqual(new Date(2026, 10, 1));
    expect(retirementStartDate(now, 10)).toEqual(new Date(2036, 10, 1));
    expect(retirementStartDate(new Date(2026, 11, 15), 0)).toEqual(new Date(2027, 0, 1)); // December rolls over
    expect(retirementYearStart(new Date(2026, 10, 1), 49)).toEqual(new Date(2075, 10, 1));
  });

  it('buys monthly from next month until the month before retirement: 12 purchases per year', () => {
    const start = retirementStartDate(now, 10);
    const months = projectSavings(1000, now, start);
    expect(months).toHaveLength(120);
    expect(months[0].date).toBe('2026-11-01');
    expect(months[months.length - 1].date).toBe('2036-10-01');
    expect(months.every(m => m.timestamp < start.getTime())).toBe(true);
  });

  it('prices every purchase at that month’s fair value', () => {
    const months = projectSavings(1000, now, retirementStartDate(now, 2));
    months.forEach(m => expect(m.price).toBeCloseTo(BitcoinPowerLaw.calculateFairValue(new Date(m.timestamp)), 6));
  });

  it('projected BTC equals the sum of the purchases', () => {
    const plan = buildRetirementPlan({
      bitcoinAmount: 0.5, cashAmount: 0, annualWithdrawal: 60000,
      yearsUntilRetirement: 10, monthlySavingsEnabled: true, monthlySavingsAmount: 1000
    }, now, 90000);
    const sum = plan.savings.reduce((total, m) => total + m.bitcoinPurchased, 0);
    expect(plan.projectedBitcoin).toBeCloseTo(sum, 12);
    expect(plan.bitcoinAtRetirement).toBeCloseTo(0.5 + sum, 12);
    expect(plan.retirementStart).toEqual(new Date(2036, 10, 1));
    expect(plan.stress.rows[0].periodLabel).toBe('Nov 2036 – Oct 2037');
    expect(plan.accumulationRows).toHaveLength(10);
    expect(plan.accumulationRows[9].periodLabel).toBe('Nov 2035 – Oct 2036');
  });

  it('retiring now means no purchases', () => {
    expect(projectSavings(1000, now, retirementStartDate(now, 0))).toHaveLength(0);
  });
});

describe('valuation price contexts', () => {
  it('uses the live price when retiring now', () => {
    expect(retirementValuationPrice(new Date(2026, 10, 1), true, 83500)).toBe(83500);
  });

  it('uses fair value on the retirement start date otherwise', () => {
    expect(retirementValuationPrice(new Date(2036, 10, 1), false, 83500)).toBeCloseTo(fv(new Date(2036, 10, 1)), 6);
  });

  it('withdrawals use the stress path, not the live price', () => {
    const plan = buildRetirementPlan({
      bitcoinAmount: 3, cashAmount: 0, annualWithdrawal: 60000,
      yearsUntilRetirement: 0, monthlySavingsEnabled: false, monthlySavingsAmount: 0
    }, new Date(2026, 9, 24), 83500);
    expect(plan.stress.rows[0].bitcoinPrice).toBeCloseTo(fv(new Date(2026, 10, 1)) * 0.42, 6);
    expect(plan.valuationPrice).toBe(83500);
  });
});

describe('verdict does not depend on the market price at retirement', () => {
  const inputs = {
    bitcoinAmount: 2.95, cashAmount: 50000, annualWithdrawal: 60000,
    yearsUntilRetirement: 0, monthlySavingsEnabled: false, monthlySavingsAmount: 0
  };
  const now = new Date(2026, 9, 24);
  const fairToday = BitcoinPowerLaw.calculateFairValue(now);

  it.each([
    ['at the floor', 0.42],
    ['at fair value', 1],
    ['at a cycle top (2x)', 2],
    ['in a 2013-style bubble (11x)', 11]
  ])('same withdrawals and verdict when the live price is %s', (_label, ratio) => {
    const baseline = buildRetirementPlan(inputs, now, fairToday * 0.42);
    const plan = buildRetirementPlan(inputs, now, fairToday * ratio);
    expect(plan.stress).toEqual(baseline.stress);
    expect(plan.floorForever).toEqual(baseline.floorForever);
  });
});

describe('plan assets', () => {
  it('cash-only portfolios get a verdict', () => {
    const inputs = {
      bitcoinAmount: 0, cashAmount: 4000000, annualWithdrawal: 60000,
      yearsUntilRetirement: 0, monthlySavingsEnabled: false, monthlySavingsAmount: 0
    };
    expect(hasPlanAssets(inputs)).toBe(true);
    expect(buildRetirementPlan(inputs, new Date(2026, 9, 24), 83500).stress.passes).toBe(true);
  });
});

describe('historical what-if', () => {
  it('returns the earliest passing year, and every earlier year fails', () => {
    const passes = (startYear: number) =>
      simulateRetirement({ bitcoin: 5, cash: 0, annualWithdrawal: 60000, startDate: new Date(startYear, 0, 1), path: 'stress' }).passes;
    const year = firstPassingYear(5, 0, 60000, 2012, 2026);
    expect(year).not.toBeNull();
    for (let earlier = 2012; earlier < (year as number); earlier++) expect(passes(earlier)).toBe(false);
    expect(passes(year as number)).toBe(true);
  });

  it('returns null when no year passes', () => {
    expect(firstPassingYear(0.01, 0, 60000, 2012, 2026)).toBeNull();
  });
});
