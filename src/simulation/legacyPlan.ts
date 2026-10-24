import { BitcoinPowerLaw } from '../models/PowerLaw';
import { ChartDataPoint, MonthlySavingsInputs, RetirementInputs, SavingsProjection } from '../types/Bitcoin';
import { SmartWithdrawalStrategy } from '../utils/SmartWithdrawalStrategy';
import { formatPrice } from '../utils/format';

export interface SimulationRow {
  year: number;
  yearNumber: number;
  phase: 'ACCUMULATION' | 'RETIREMENT START' | 'WITHDRAWAL';
  bitcoinPrice: number;
  fairValue: number;
  priceToFairRatio: number;
  cyclePhase: string;
  annualWithdrawal: number;
  fundedWithdrawal?: number;
  withdrawalShortfall?: number;
  isWithdrawalFullyFunded?: boolean;
  withdrawalSource: string;
  cashUsed: number;
  bitcoinSold: number;
  bitcoinPurchased: number;
  remainingCash: number;
  remainingBitcoin: number;
  remainingBitcoinValue: number;
  totalRemainingValue: number;
  totalCashInvested: number;
}

/** Calendar-year cycle price used by the accumulation phase (cycle year = (year - 1) % 4). */
const calendarCyclePrice = (date: Date, cycleYear: number): { price: number; phase: string } => {
  const fairValue = BitcoinPowerLaw.calculateFairValue(date);
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(date);
  const upperBound = BitcoinPowerLaw.calculateUpperBound(date);
  switch (cycleYear) {
    case 0: return { price: floorValue, phase: 'Deep Bear (Floor)' };
    case 1: return { price: floorValue + (fairValue - floorValue) * 0.75, phase: 'Bear Market Recovery' };
    case 2: return { price: fairValue + (upperBound - fairValue) * 0.7, phase: 'Bull Market' };
    case 3: return { price: fairValue + (upperBound - fairValue) * 0.3, phase: 'Bull Peak & Correction' };
    default: return { price: fairValue, phase: 'Fair Value' };
  }
};

/** Retirement-anchored price: offsets 0,1 = floor; 2 = recovery; then (offset - 3) % 4 cycle. */
export const legacyWithdrawalPhase = (year: number, offset: number): { price: number; phase: string } => {
  const targetDate = new Date(year, 0, 1);
  const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
  if (offset === 0 || offset === 1) {
    return { price: floorValue, phase: offset === 0 ? 'Retirement Start (Deep Bear — Year 1)' : 'Deep Bear (Floor) — Year 2' };
  }
  if (offset === 2) {
    return { price: floorValue + (fairValue - floorValue) * 0.75, phase: 'Bear Market Recovery' };
  }
  return calendarCyclePrice(targetDate, (offset - 3) % 4);
};

export const legacyChartPlanPrice = (year: number, retirementStartYear: number): number | null =>
  year < retirementStartYear ? null : legacyWithdrawalPhase(year, year - retirementStartYear).price;

export const projectSavingsLegacy = (inputs: MonthlySavingsInputs, startDate: Date): SavingsProjection[] => {
  if (!inputs.enabled || inputs.monthlySavingsAmount <= 0 || inputs.yearsToRetirement <= 0) {
    return [];
  }

  const projection: SavingsProjection[] = [];
  let totalBitcoinAccumulated = 0;
  let totalCashInvested = 0;

  for (let year = 0; year < inputs.yearsToRetirement; year++) {
    for (let month = 0; month < 12; month++) {
      const projectionDate = new Date(startDate);
      projectionDate.setFullYear(startDate.getFullYear() + year);
      projectionDate.setMonth(startDate.getMonth() + month);

      const actualYear = projectionDate.getFullYear();
      const cycleYear = (actualYear - 1) % 4;
      const isBearMarketYear = cycleYear === 0 || cycleYear === 1;
      const bitcoinFairValue = BitcoinPowerLaw.calculateFairValue(projectionDate);
      const bitcoinCyclePrice = actualYear === startDate.getFullYear()
        ? bitcoinFairValue
        : calendarCyclePrice(projectionDate, cycleYear).price;

      const actualMonthlySavings = inputs.doubleDownInBearMarkets && isBearMarketYear
        ? inputs.monthlySavingsAmount * 2
        : inputs.monthlySavingsAmount;

      const bitcoinPurchased = actualMonthlySavings / bitcoinCyclePrice;
      totalBitcoinAccumulated += bitcoinPurchased;
      totalCashInvested += actualMonthlySavings;

      projection.push({
        year: year + 1,
        month: month + 1,
        date: projectionDate.toISOString().split('T')[0],
        actualYear,
        timestamp: projectionDate.getTime(),
        monthlySavingsAmount: actualMonthlySavings,
        bitcoinFairValue,
        bitcoinCyclePrice,
        bitcoinPurchased,
        totalBitcoinAccumulated,
        totalCashInvested
      });
    }
  }

  return projection;
};

/** Legacy bear-market heuristic: 2 years at floor, 1 recovery year, then 20 years of runway at fair value. */
export const legacyBearMarketTest = (
  year: number,
  bitcoinHoldings: number,
  annualWithdrawal: number,
  cashHoldings: number = 0
): { passes: boolean; remainingBitcoin: number; remainingCash: number } => {
  if (bitcoinHoldings <= 0 || annualWithdrawal <= 0) return { passes: false, remainingBitcoin: 0, remainingCash: 0 };

  let remainingBitcoin = bitcoinHoldings;
  let remainingCash = Math.max(0, cashHoldings);
  const targetDate = new Date(year, 0, 1);
  const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
  const recoveryPrice = floorValue + (fairValue - floorValue) * 0.75;

  for (const price of [floorValue, floorValue, recoveryPrice]) {
    if (remainingCash >= annualWithdrawal) {
      remainingCash -= annualWithdrawal;
    } else {
      const remainingNeeded = annualWithdrawal - remainingCash;
      remainingCash = 0;
      remainingBitcoin -= remainingNeeded / price;
      if (remainingBitcoin < 0) return { passes: false, remainingBitcoin: 0, remainingCash: 0 };
    }
  }

  const yearsOfRunway = (remainingBitcoin * fairValue + remainingCash) / annualWithdrawal;
  return { passes: yearsOfRunway >= 20, remainingBitcoin, remainingCash };
};

/** Most recent historical data point at which the legacy bear-market test passes. */
export const findHistoricalRetirementDate = (
  chartData: ChartDataPoint[],
  totalBitcoinHoldings: number,
  annualWithdrawal: number,
  cashAmount: number
): ChartDataPoint | null => {
  const historicalData = chartData.filter(point => point.actualPrice !== null && point.actualPrice > 0).reverse();
  for (const dataPoint of historicalData) {
    const year = new Date(dataPoint.date).getFullYear();
    if (legacyBearMarketTest(year, totalBitcoinHoldings, annualWithdrawal, cashAmount).passes) {
      return dataPoint;
    }
  }
  return null;
};

export const legacyRetirementStartYear = (
  retirementInputs: RetirementInputs,
  monthlySavingsInputs: MonthlySavingsInputs,
  currentYear: number
): number => {
  const yearsToRetirement = monthlySavingsInputs.enabled ? monthlySavingsInputs.yearsToRetirement : 0;
  return currentYear + Math.max(retirementInputs.yearsUntilRetirement, yearsToRetirement);
};

export const simulateLegacyPlan = (
  retirementInputs: RetirementInputs,
  monthlySavingsInputs: MonthlySavingsInputs,
  savingsProjection: SavingsProjection[],
  currentYear: number
): SimulationRow[] => {
  const hasAssets = retirementInputs.bitcoinAmount > 0 || (monthlySavingsInputs.enabled && monthlySavingsInputs.monthlySavingsAmount > 0);
  if (!hasAssets || retirementInputs.annualWithdrawal <= 0) {
    return [];
  }

  const simulation: SimulationRow[] = [];
  const yearsToRetirement = monthlySavingsInputs.enabled ? monthlySavingsInputs.yearsToRetirement : 0;
  const retirementStartYear = legacyRetirementStartYear(retirementInputs, monthlySavingsInputs, currentYear);

  const lastSavings = savingsProjection.length > 0 ? savingsProjection[savingsProjection.length - 1] : null;
  const projectedBitcoin = monthlySavingsInputs.enabled && lastSavings ? lastSavings.totalBitcoinAccumulated : 0;
  const totalCashInvested = monthlySavingsInputs.enabled && lastSavings ? lastSavings.totalCashInvested : 0;

  const accumulatedBitcoin = retirementInputs.bitcoinAmount + projectedBitcoin;
  let cumulativeCashInvested = 0;

  if (monthlySavingsInputs.enabled && yearsToRetirement > 0) {
    const yearlyAggregation: { [year: number]: { bitcoinPurchased: number; cashInvested: number; endingBitcoin: number } } = {};
    for (const monthData of savingsProjection) {
      const entry = yearlyAggregation[monthData.actualYear] ||= { bitcoinPurchased: 0, cashInvested: 0, endingBitcoin: 0 };
      entry.bitcoinPurchased += monthData.bitcoinPurchased;
      entry.cashInvested += monthData.monthlySavingsAmount;
      entry.endingBitcoin = retirementInputs.bitcoinAmount + monthData.totalBitcoinAccumulated;
    }

    for (let year = 0; year < yearsToRetirement; year++) {
      const simulationYear = currentYear + year;
      const targetDate = new Date(simulationYear, 0, 1);
      const bitcoinFairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
      const yearData = yearlyAggregation[simulationYear];
      if (!yearData) continue;

      cumulativeCashInvested += yearData.cashInvested;
      const cycleYear = (simulationYear - 1) % 4;
      const isBearMarketYear = cycleYear === 0 || cycleYear === 1;
      const { price: cyclePrice, phase: cyclePhase } = year === 0
        ? { price: bitcoinFairValue, phase: 'Current Year (Fair Value)' }
        : calendarCyclePrice(targetDate, cycleYear);

      let withdrawalSource = `Investing $${Math.round(yearData.cashInvested).toLocaleString()}/year`;
      if (monthlySavingsInputs.doubleDownInBearMarkets && isBearMarketYear) {
        withdrawalSource += ' 🐻 (2x Bear Market!)';
      }

      simulation.push({
        year: simulationYear,
        yearNumber: year + 1,
        phase: 'ACCUMULATION',
        bitcoinPrice: cyclePrice,
        fairValue: bitcoinFairValue,
        priceToFairRatio: cyclePrice / bitcoinFairValue,
        cyclePhase,
        annualWithdrawal: 0,
        withdrawalSource,
        cashUsed: 0,
        bitcoinSold: 0,
        bitcoinPurchased: yearData.bitcoinPurchased,
        remainingCash: retirementInputs.cashAmount,
        remainingBitcoin: yearData.endingBitcoin,
        remainingBitcoinValue: yearData.endingBitcoin * cyclePrice,
        totalRemainingValue: yearData.endingBitcoin * cyclePrice + retirementInputs.cashAmount,
        totalCashInvested: cumulativeCashInvested
      });
    }

    if (cumulativeCashInvested === 0) {
      cumulativeCashInvested = totalCashInvested;
    }
  }

  let remainingBitcoin = accumulatedBitcoin;
  let remainingCash = retirementInputs.cashAmount;
  const annualWithdrawal = retirementInputs.annualWithdrawal;

  for (let year = 0; year < 50; year++) {
    const currentSimulationYear = retirementStartYear + year;
    const targetDate = new Date(currentSimulationYear, 0, 1);
    const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
    const { price: bitcoinPrice, phase: cyclePhase } = legacyWithdrawalPhase(currentSimulationYear, year);

    const withdrawalDecision = SmartWithdrawalStrategy.calculateWithdrawal({
      currentBitcoinPrice: bitcoinPrice,
      currentDate: targetDate,
      availableCash: remainingCash,
      availableBitcoin: remainingBitcoin,
      withdrawalNeeded: annualWithdrawal
    });

    const cashUsed = withdrawalDecision.useCashAmount;
    const bitcoinSold = withdrawalDecision.useBitcoinAmount;
    const fundedWithdrawal = withdrawalDecision.fundedWithdrawalAmount;
    const withdrawalShortfall = withdrawalDecision.withdrawalShortfall;
    remainingCash = Math.max(0, remainingCash - cashUsed);
    remainingBitcoin = Math.max(0, remainingBitcoin - bitcoinSold);

    let withdrawalSource = withdrawalDecision.strategy;
    if (cashUsed > 0 && bitcoinSold > 0) {
      const fundedAmount = Math.max(fundedWithdrawal, 0.01);
      const cashPercent = (cashUsed / fundedAmount * 100).toFixed(0);
      const bitcoinPercent = (100 - parseFloat(cashPercent)).toFixed(0);
      withdrawalSource = `${withdrawalDecision.strategy} (${cashPercent}%/${bitcoinPercent}%)`;
    }
    if (withdrawalShortfall > 0) {
      withdrawalSource += ` (SHORTFALL ${formatPrice(withdrawalShortfall)})`;
    } else if (remainingBitcoin <= 0 && remainingCash <= 0) {
      withdrawalSource += ' (DEPLETED)';
    }
    if (year === 0) {
      withdrawalSource = 'Retirement Start — ' + withdrawalSource;
    }

    const remainingBitcoinValue = remainingBitcoin * bitcoinPrice;
    simulation.push({
      year: currentSimulationYear,
      yearNumber: yearsToRetirement + year + 1,
      phase: year === 0 ? 'RETIREMENT START' : 'WITHDRAWAL',
      bitcoinPrice,
      fairValue,
      priceToFairRatio: bitcoinPrice / fairValue,
      cyclePhase,
      annualWithdrawal,
      fundedWithdrawal,
      withdrawalShortfall,
      isWithdrawalFullyFunded: withdrawalDecision.isFullyFunded,
      withdrawalSource,
      cashUsed,
      bitcoinSold,
      bitcoinPurchased: 0,
      remainingCash,
      remainingBitcoin,
      remainingBitcoinValue,
      totalRemainingValue: remainingBitcoinValue + remainingCash,
      totalCashInvested: cumulativeCashInvested
    });

    // Stop once a withdrawal cannot be fully funded; subsequent rows would be misleading.
    if (withdrawalShortfall > 0 || (remainingBitcoin <= 0 && remainingCash <= 0)) {
      break;
    }
  }

  return simulation;
};
