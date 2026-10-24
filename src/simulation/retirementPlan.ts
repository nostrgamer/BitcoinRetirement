import { purchasePrice, retirementValuationPrice, withdrawalBasisLabel, withdrawalPrice, WithdrawalPath } from '../models/PricePath';
import { BitcoinPowerLaw } from '../models/PowerLaw';
import { SmartWithdrawalStrategy } from '../utils/SmartWithdrawalStrategy';
import { formatPrice } from '../utils/format';

export const RETIREMENT_YEARS = 50;

export interface PlanInputs {
  bitcoinAmount: number;
  cashAmount: number;
  annualWithdrawal: number;
  /** Retirement starts on January 1 of (current year + this many years). */
  yearsUntilRetirement: number;
  monthlySavingsEnabled: boolean;
  monthlySavingsAmount: number;
}

export interface SavingsMonth {
  date: string;
  timestamp: number;
  year: number;
  price: number;
  cashInvested: number;
  bitcoinPurchased: number;
  totalBitcoinPurchased: number;
  totalCashInvested: number;
}

export interface SimulationRow {
  year: number;
  phase: 'ACCUMULATION' | 'RETIREMENT START' | 'WITHDRAWAL';
  /** Withdrawal price, or the average purchase price for accumulation years. */
  bitcoinPrice: number;
  fairValue: number;
  priceBasis: string;
  annualWithdrawal: number;
  fundedWithdrawal: number;
  withdrawalShortfall: number;
  activity: string;
  cashUsed: number;
  bitcoinSold: number;
  cashInvested: number;
  bitcoinPurchased: number;
  remainingCash: number;
  remainingBitcoin: number;
  remainingBitcoinValue: number;
  totalRemainingValue: number;
}

export interface RetirementSimulation {
  rows: SimulationRow[];
  /** Consecutive fully funded annual withdrawals. A partly funded year does not count. */
  fullyFundedYears: number;
  /** True when all 50 withdrawals were fully funded. */
  passes: boolean;
}

export interface RetirementPlan {
  retirementStartYear: number;
  savings: SavingsMonth[];
  projectedBitcoin: number;
  totalCashInvested: number;
  bitcoinAtRetirement: number;
  /** Price used to value holdings at the start of retirement. */
  valuationPrice: number;
  accumulationRows: SimulationRow[];
  stress: RetirementSimulation;
  floorForever: RetirementSimulation;
}

export const hasPlanAssets = (inputs: PlanInputs): boolean =>
  inputs.bitcoinAmount > 0 || inputs.cashAmount > 0 || (inputs.monthlySavingsEnabled && inputs.monthlySavingsAmount > 0);

/** Monthly purchases from the first of next month through December of the year before retirement. */
export const projectSavings = (monthlyAmount: number, now: Date, retirementStartYear: number): SavingsMonth[] => {
  const months: SavingsMonth[] = [];
  if (monthlyAmount <= 0) return months;

  let totalBitcoinPurchased = 0;
  let totalCashInvested = 0;
  const retirementStart = new Date(retirementStartYear, 0, 1).getTime();
  for (let date = new Date(now.getFullYear(), now.getMonth() + 1, 1); date.getTime() < retirementStart;
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1)) {
    const price = purchasePrice(date);
    const bitcoinPurchased = monthlyAmount / price;
    totalBitcoinPurchased += bitcoinPurchased;
    totalCashInvested += monthlyAmount;
    months.push({
      date: `${date.getFullYear()}-${`0${date.getMonth() + 1}`.slice(-2)}-01`,
      timestamp: date.getTime(),
      year: date.getFullYear(),
      price,
      cashInvested: monthlyAmount,
      bitcoinPurchased,
      totalBitcoinPurchased,
      totalCashInvested
    });
  }
  return months;
};

export const simulateRetirement = (params: {
  bitcoin: number;
  cash: number;
  annualWithdrawal: number;
  startYear: number;
  path: WithdrawalPath;
}): RetirementSimulation => {
  const rows: SimulationRow[] = [];
  let remainingBitcoin = Math.max(0, params.bitcoin);
  let remainingCash = Math.max(0, params.cash);
  let fullyFundedYears = 0;
  let stillFunded = true;

  if (params.annualWithdrawal <= 0) return { rows, fullyFundedYears: 0, passes: false };

  for (let offset = 0; offset < RETIREMENT_YEARS; offset++) {
    const year = params.startYear + offset;
    const date = new Date(year, 0, 1);
    const fairValue = BitcoinPowerLaw.calculateFairValue(date);
    const bitcoinPrice = withdrawalPrice(year, offset, params.path);

    const decision = SmartWithdrawalStrategy.calculateWithdrawal({
      currentBitcoinPrice: bitcoinPrice,
      currentDate: date,
      availableCash: remainingCash,
      availableBitcoin: remainingBitcoin,
      withdrawalNeeded: params.annualWithdrawal
    });

    remainingCash = Math.max(0, remainingCash - decision.useCashAmount);
    remainingBitcoin = Math.max(0, remainingBitcoin - decision.useBitcoinAmount);
    if (stillFunded && decision.isFullyFunded) fullyFundedYears += 1;
    else stillFunded = false;

    // The strategy names its preference ("Cash First…"); say plainly when no cash was left to use.
    let activity = decision.useCashAmount === 0 && decision.useBitcoinAmount > 0 && /cash/i.test(decision.strategy)
      ? 'Bitcoin Only (no cash left)'
      : decision.strategy;
    if (decision.useCashAmount > 0 && decision.useBitcoinAmount > 0) {
      const cashPercent = Math.round((decision.useCashAmount / Math.max(decision.fundedWithdrawalAmount, 0.01)) * 100);
      activity = `${decision.strategy} (${cashPercent}% cash / ${100 - cashPercent}% BTC)`;
    }
    if (decision.withdrawalShortfall > 0) {
      activity += ` (SHORTFALL ${formatPrice(decision.withdrawalShortfall)})`;
    } else if (remainingBitcoin <= 0 && remainingCash <= 0) {
      activity += ' (DEPLETED)';
    }

    const remainingBitcoinValue = remainingBitcoin * bitcoinPrice;
    rows.push({
      year,
      phase: offset === 0 ? 'RETIREMENT START' : 'WITHDRAWAL',
      bitcoinPrice,
      fairValue,
      priceBasis: withdrawalBasisLabel(offset, params.path),
      annualWithdrawal: params.annualWithdrawal,
      fundedWithdrawal: decision.fundedWithdrawalAmount,
      withdrawalShortfall: decision.withdrawalShortfall,
      activity,
      cashUsed: decision.useCashAmount,
      bitcoinSold: decision.useBitcoinAmount,
      cashInvested: 0,
      bitcoinPurchased: 0,
      remainingCash,
      remainingBitcoin,
      remainingBitcoinValue,
      totalRemainingValue: remainingBitcoinValue + remainingCash
    });

    // Stop once a withdrawal cannot be fully funded; later rows would be misleading.
    if (!decision.isFullyFunded || (remainingBitcoin <= 0 && remainingCash <= 0)) break;
  }

  return { rows, fullyFundedYears, passes: fullyFundedYears >= RETIREMENT_YEARS };
};

const accumulationRows = (savings: SavingsMonth[], startingBitcoin: number, cash: number): SimulationRow[] => {
  const byYear = new Map<number, SavingsMonth[]>();
  savings.forEach(month => byYear.set(month.year, [...(byYear.get(month.year) || []), month]));
  return Array.from(byYear.entries()).map(([year, months]) => {
    const cashInvested = months.reduce((sum, m) => sum + m.cashInvested, 0);
    const bitcoinPurchased = months.reduce((sum, m) => sum + m.bitcoinPurchased, 0);
    const remainingBitcoin = startingBitcoin + months[months.length - 1].totalBitcoinPurchased;
    const averagePrice = cashInvested / bitcoinPurchased;
    return {
      year,
      phase: 'ACCUMULATION' as const,
      bitcoinPrice: averagePrice,
      fairValue: BitcoinPowerLaw.calculateFairValue(new Date(year, 0, 1)),
      priceBasis: 'Fair value (monthly buys)',
      annualWithdrawal: 0,
      fundedWithdrawal: 0,
      withdrawalShortfall: 0,
      activity: `Investing $${Math.round(cashInvested).toLocaleString()} over ${months.length} month${months.length === 1 ? '' : 's'}`,
      cashUsed: 0,
      bitcoinSold: 0,
      cashInvested,
      bitcoinPurchased,
      remainingCash: cash,
      remainingBitcoin,
      remainingBitcoinValue: remainingBitcoin * averagePrice,
      totalRemainingValue: remainingBitcoin * averagePrice + cash
    };
  });
};

export const buildRetirementPlan = (inputs: PlanInputs, now: Date, livePrice: number): RetirementPlan => {
  const currentYear = now.getFullYear();
  const retirementStartYear = currentYear + Math.max(0, Math.floor(inputs.yearsUntilRetirement));
  const savings = inputs.monthlySavingsEnabled ? projectSavings(inputs.monthlySavingsAmount, now, retirementStartYear) : [];
  const last = savings[savings.length - 1];
  const projectedBitcoin = last ? last.totalBitcoinPurchased : 0;
  const bitcoinAtRetirement = inputs.bitcoinAmount + projectedBitcoin;
  const simulate = (path: WithdrawalPath) => simulateRetirement({
    bitcoin: bitcoinAtRetirement,
    cash: inputs.cashAmount,
    annualWithdrawal: inputs.annualWithdrawal,
    startYear: retirementStartYear,
    path
  });

  return {
    retirementStartYear,
    savings,
    projectedBitcoin,
    totalCashInvested: last ? last.totalCashInvested : 0,
    bitcoinAtRetirement,
    valuationPrice: retirementValuationPrice(retirementStartYear, currentYear, livePrice),
    accumulationRows: accumulationRows(savings, inputs.bitcoinAmount, inputs.cashAmount),
    stress: simulate('stress'),
    floorForever: simulate('floorForever')
  };
};

/**
 * What-if: the earliest year from `firstYear` through `lastYear` in which retiring with today's
 * BTC and cash (no future savings) would have passed the same 50-year test as the main verdict.
 */
export const firstPassingYear = (
  bitcoin: number,
  cash: number,
  annualWithdrawal: number,
  firstYear: number,
  lastYear: number
): number | null => {
  if (annualWithdrawal <= 0 || (bitcoin <= 0 && cash <= 0)) return null;
  for (let year = firstYear; year <= lastYear; year++) {
    if (simulateRetirement({ bitcoin, cash, annualWithdrawal, startYear: year, path: 'stress' }).passes) return year;
  }
  return null;
};
