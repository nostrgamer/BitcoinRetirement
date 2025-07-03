import { BitcoinPowerLaw } from '../models/PowerLaw';

export interface BearMarketTestResult {
  passes: boolean;
  remainingBitcoin: number;
  remainingCash: number;
}

export interface CyclePhaseResult {
  price: number;
  phase: string;
  cycleYear: number;
}

/**
 * Test if a portfolio can survive a realistic 24-month bear market
 * Strategy: Use cash during bear market to preserve Bitcoin
 */
export const testBearMarketSurvival = (
  bitcoinPrice: number, 
  year: number, 
  bitcoinHoldings: number, 
  annualWithdrawal: number, 
  cashHoldings: number = 0
): BearMarketTestResult => {
  if (bitcoinHoldings <= 0 || annualWithdrawal <= 0) {
    return { passes: false, remainingBitcoin: 0, remainingCash: 0 };
  }
  
  let remainingBitcoin = bitcoinHoldings;
  let remainingCash = Math.max(0, cashHoldings);
  
  const targetDate = new Date(year, 0, 1);
  const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
  
  // Year 1: Deep bear market at Power Law floor
  const deepBearPrice = floorValue;
  
  // Smart strategy: Use cash first during the crash
  if (remainingCash >= annualWithdrawal) {
    remainingCash -= annualWithdrawal;
  } else {
    const remainingNeeded = annualWithdrawal - remainingCash;
    remainingCash = 0;
    const bitcoinToSell = remainingNeeded / deepBearPrice;
    remainingBitcoin -= bitcoinToSell;
    
    if (remainingBitcoin < 0) {
      return { passes: false, remainingBitcoin: 0, remainingCash: 0 };
    }
  }
  
  // Year 2: Bear market recovery - price between floor and fair value
  const bearRecoveryPrice = floorValue + (fairValue - floorValue) * 0.75;
  if (remainingCash >= annualWithdrawal) {
    remainingCash -= annualWithdrawal;
  } else {
    const remainingNeeded = annualWithdrawal - remainingCash;
    remainingCash = 0;
    const bitcoinToSell = remainingNeeded / bearRecoveryPrice;
    remainingBitcoin -= bitcoinToSell;
    
    if (remainingBitcoin < 0) {
      return { passes: false, remainingBitcoin: 0, remainingCash: 0 };
    }
  }
  
  // Year 3: Back to fair value - check runway
  const sustainablePrice = fairValue;
  const remainingBitcoinValue = remainingBitcoin * sustainablePrice;
  const totalRemainingValue = remainingBitcoinValue + remainingCash;
  
  const yearsOfRunway = totalRemainingValue / annualWithdrawal;
  const minimumYearsRequired = 20; // Conservative requirement
  
  return {
    passes: yearsOfRunway >= minimumYearsRequired,
    remainingBitcoin,
    remainingCash
  };
};

/**
 * Calculate realistic Bitcoin price for a given year based on 4-year cycles
 */
export const calculateCyclePrice = (
  year: number, 
  isCurrentYear: boolean = false
): CyclePhaseResult => {
  const targetDate = new Date(year, 0, 1);
  const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
  
  if (isCurrentYear) {
    return {
      price: fairValue,
      phase: 'Current Year (Fair Value)',
      cycleYear: (year - 1) % 4
    };
  }
  
  const cycleYear = (year - 1) % 4;
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
  const upperBound = BitcoinPowerLaw.calculateUpperBound(targetDate);
  
  switch (cycleYear) {
    case 0: // Deep bear market
      return {
        price: floorValue,
        phase: 'Deep Bear (Floor)',
        cycleYear
      };
    case 1: // Bear market recovery
      return {
        price: floorValue + (fairValue - floorValue) * 0.75,
        phase: 'Bear Market Recovery',
        cycleYear
      };
    case 2: // Bull market
      return {
        price: fairValue + (upperBound - fairValue) * 0.7,
        phase: 'Bull Market',
        cycleYear
      };
    case 3: // Bull peak and correction
      return {
        price: fairValue + (upperBound - fairValue) * 0.3,
        phase: 'Bull Peak & Correction',
        cycleYear
      };
    default:
      return {
        price: fairValue,
        phase: 'Fair Value',
        cycleYear
      };
  }
};

/**
 * Calculate monthly savings projection with realistic cycle pricing
 */
export const calculateMonthlySavingsProjection = (
  monthlySavingsAmount: number,
  yearsToRetirement: number,
  doubleDownInBearMarkets: boolean = false,
  startDate: Date = new Date()
): Array<{
  year: number;
  month: number;
  monthlySavingsAmount: number;
  bitcoinFairValue: number;
  bitcoinCyclePrice: number;
  bitcoinPurchased: number;
  totalBitcoinAccumulated: number;
  totalCashInvested: number;
}> => {
  const projection = [];
  let totalBitcoinAccumulated = 0;
  let totalCashInvested = 0;
  let currentMonthlySavings = monthlySavingsAmount;

  for (let year = 0; year < yearsToRetirement; year++) {
    const actualYear = startDate.getFullYear() + year;
    const cycleYear = (actualYear - 1) % 4;
    // Bear market only in years 0 and 1 of each 4-year cycle, but NOT in current year
    const isBearMarketYear = year > 0 && (cycleYear === 0 || cycleYear === 1);
    
    for (let month = 0; month < 12; month++) {
      const projectionDate = new Date(startDate);
      projectionDate.setFullYear(startDate.getFullYear() + year);
      projectionDate.setMonth(startDate.getMonth() + month);

      const bitcoinFairValue = BitcoinPowerLaw.calculateFairValue(projectionDate);
      
      // Calculate realistic Bitcoin price based on cycle position
      let bitcoinCyclePrice;
      
      if (year === 0) {
        // For current year, use fair value (same as component logic)
        bitcoinCyclePrice = bitcoinFairValue;
      } else {
        // For future years, apply cycle logic
        const cycleResult = calculateCyclePrice(actualYear, false);
        bitcoinCyclePrice = cycleResult.price;
      }
      
      // Apply bear market doubling
      let actualMonthlySavings = currentMonthlySavings;
      if (doubleDownInBearMarkets && isBearMarketYear) {
        actualMonthlySavings = currentMonthlySavings * 2;
      }
      
      const bitcoinPurchased = actualMonthlySavings / bitcoinCyclePrice;
      totalBitcoinAccumulated += bitcoinPurchased;
      totalCashInvested += actualMonthlySavings;

      projection.push({
        year: year + 1,
        month: month + 1,
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

/**
 * Validate retirement inputs for edge cases
 */
export const validateRetirementInputs = (
  bitcoinAmount: number,
  cashAmount: number,
  annualWithdrawal: number
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (bitcoinAmount < 0) {
    errors.push('Bitcoin amount cannot be negative');
  }
  
  if (cashAmount < 0) {
    errors.push('Cash amount cannot be negative');
  }
  
  if (annualWithdrawal <= 0) {
    errors.push('Annual withdrawal must be greater than zero');
  }
  
  if (bitcoinAmount === 0 && cashAmount === 0) {
    errors.push('Must have either Bitcoin or cash holdings');
  }
  
  // Check for unrealistic values
  if (bitcoinAmount > 1000) {
    errors.push('Bitcoin amount seems unrealistically high (>1000 BTC)');
  }
  
  if (annualWithdrawal > 10000000) {
    errors.push('Annual withdrawal seems unrealistically high (>$10M)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}; 