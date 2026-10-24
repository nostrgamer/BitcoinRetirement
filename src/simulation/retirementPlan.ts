import {
  monthLabel,
  purchasePrice,
  retirementStartDate,
  retirementValuationPrice,
  retirementYearStart,
  withdrawalBasisLabel,
  withdrawalPrice,
  WithdrawalPath
} from '../models/PricePath';
import { BitcoinPowerLaw } from '../models/PowerLaw';
import { SmartWithdrawalStrategy } from '../utils/SmartWithdrawalStrategy';
import { formatPrice } from '../utils/format';

export const RETIREMENT_YEARS = 50;

export interface PlanInputs {
  bitcoinAmount: number;
  cashAmount: number;
  annualWithdrawal: number;
  /** Retirement starts on the first of next month, plus this many years. */
  yearsUntilRetirement: number;
  monthlySavingsEnabled: boolean;
  monthlySavingsAmount: number;
}

export interface SavingsMonth {
  date: string;
  timestamp: number;
  price: number;
  cashInvested: number;
  bitcoinPurchased: number;
  totalBitcoinPurchased: number;
  totalCashInvested: number;
}

export interface SimulationRow {
  /** Start of the 12-month period this row covers. */
  timestamp: number;
  /** The 12 months the row covers, e.g. "Nov 2026 – Oct 2027": funded by a withdrawal, or saved into. */
  periodLabel: string;
  phase: 'ACCUMULATION' | 'RETIREMENT START' | 'WITHDRAWAL';
  /** Withdrawal price, or the average purchase price for savings years. */
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
  retirementStart: Date;
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

const isoDate = (date: Date): string =>
  `${date.getFullYear()}-${`0${date.getMonth() + 1}`.slice(-2)}-${`0${date.getDate()}`.slice(-2)}`;

/** Monthly purchases on the first of each month, from next month until retirement starts. */
export const projectSavings = (monthlyAmount: number, now: Date, retirementStart: Date): SavingsMonth[] => {
  const months: SavingsMonth[] = [];
  if (monthlyAmount <= 0) return months;

  let totalBitcoinPurchased = 0;
  let totalCashInvested = 0;
  for (let date = new Date(now.getFullYear(), now.getMonth() + 1, 1); date.getTime() < retirementStart.getTime();
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1)) {
    const price = purchasePrice(date);
    const bitcoinPurchased = monthlyAmount / price;
    totalBitcoinPurchased += bitcoinPurchased;
    totalCashInvested += monthlyAmount;
    months.push({
      date: isoDate(date),
      timestamp: date.getTime(),
      price,
      cashInvested: monthlyAmount,
      bitcoinPurchased,
      totalBitcoinPurchased,
      totalCashInvested
    });
  }
  return months;
};

/** One withdrawal at the start of each retirement year, priced on that date. */
export const simulateRetirement = (params: {
  bitcoin: number;
  cash: number;
  annualWithdrawal: number;
  startDate: Date;
  path: WithdrawalPath;
}): RetirementSimulation => {
  const rows: SimulationRow[] = [];
  let remainingBitcoin = Math.max(0, params.bitcoin);
  let remainingCash = Math.max(0, params.cash);
  let fullyFundedYears = 0;
  let stillFunded = true;

  if (params.annualWithdrawal <= 0) return { rows, fullyFundedYears: 0, passes: false };

  for (let offset = 0; offset < RETIREMENT_YEARS; offset++) {
    const date = retirementYearStart(params.startDate, offset);
    const fairValue = BitcoinPowerLaw.calculateFairValue(date);
    const bitcoinPrice = withdrawalPrice(date, offset, params.path);

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
      timestamp: date.getTime(),
      periodLabel: `${monthLabel(date)} – ${monthLabel(new Date(date.getFullYear() + 1, date.getMonth() - 1, 1))}`,
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

/** Savings grouped into 12-month blocks that line up with the retirement years. */
const accumulationRows = (savings: SavingsMonth[], startingBitcoin: number, cash: number): SimulationRow[] => {
  const rows: SimulationRow[] = [];
  for (let i = 0; i < savings.length; i += 12) {
    const months = savings.slice(i, i + 12);
    const first = new Date(months[0].timestamp);
    const last = new Date(months[months.length - 1].timestamp);
    const cashInvested = months.reduce((sum, m) => sum + m.cashInvested, 0);
    const bitcoinPurchased = months.reduce((sum, m) => sum + m.bitcoinPurchased, 0);
    const remainingBitcoin = startingBitcoin + months[months.length - 1].totalBitcoinPurchased;
    const averagePrice = cashInvested / bitcoinPurchased;
    rows.push({
      timestamp: first.getTime(),
      periodLabel: `${monthLabel(first)} – ${monthLabel(last)}`,
      phase: 'ACCUMULATION',
      bitcoinPrice: averagePrice,
      fairValue: BitcoinPowerLaw.calculateFairValue(first),
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
    });
  }
  return rows;
};

export const buildRetirementPlan = (inputs: PlanInputs, now: Date, livePrice: number): RetirementPlan => {
  const years = Math.max(0, Math.floor(inputs.yearsUntilRetirement));
  const retirementStart = retirementStartDate(now, years);
  const savings = inputs.monthlySavingsEnabled ? projectSavings(inputs.monthlySavingsAmount, now, retirementStart) : [];
  const last = savings[savings.length - 1];
  const projectedBitcoin = last ? last.totalBitcoinPurchased : 0;
  const bitcoinAtRetirement = inputs.bitcoinAmount + projectedBitcoin;
  const simulate = (path: WithdrawalPath) => simulateRetirement({
    bitcoin: bitcoinAtRetirement,
    cash: inputs.cashAmount,
    annualWithdrawal: inputs.annualWithdrawal,
    startDate: retirementStart,
    path
  });

  return {
    retirementStart,
    savings,
    projectedBitcoin,
    totalCashInvested: last ? last.totalCashInvested : 0,
    bitcoinAtRetirement,
    valuationPrice: retirementValuationPrice(retirementStart, years === 0, livePrice),
    accumulationRows: accumulationRows(savings, inputs.bitcoinAmount, inputs.cashAmount),
    stress: simulate('stress'),
    floorForever: simulate('floorForever')
  };
};

/**
 * What-if: the earliest year from `firstYear` through `lastYear` in which retiring on January 1
 * with today's BTC and cash (no future savings) would have passed the same 50-year test.
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
    const result = simulateRetirement({ bitcoin, cash, annualWithdrawal, startDate: new Date(year, 0, 1), path: 'stress' });
    if (result.passes) return year;
  }
  return null;
};
