export interface BitcoinPriceData {
  date: string;
  price: number;
  timestamp: number;
}

export interface PowerLawData {
  date: string;
  fairValue: number;
  timestamp: number;
}

export interface ChartDataPoint {
  date: string;
  actualPrice: number | null;
  powerLawPrice: number;
  powerLawFloor: number;
  powerLawUpperBound: number;
  timestamp: number;
  /** Projected price from 50-year withdrawal plan (when retirement inputs are set) */
  withdrawalPlanPrice?: number | null;
}

export interface RetirementInputs {
  bitcoinAmount: number;
  cashAmount: number;
  annualWithdrawal: number;
  yearsUntilRetirement: number;
}

export interface MonthlySavingsInputs {
  monthlySavingsAmount: number;
  yearsToRetirement: number;
  enabled: boolean;
  doubleDownInBearMarkets: boolean;
}

export interface SavingsProjection {
  year: number;
  month: number;
  monthlySavingsAmount: number;
  bitcoinFairValue: number;
  bitcoinCyclePrice: number;
  bitcoinPurchased: number;
  totalBitcoinAccumulated: number;
  totalCashInvested: number;
}

export interface PowerLawMetrics {
  fairValueRatio: number;
  floorRatio: number;
  ceilingRatio: number;
  fairValue: number;
  floorValue: number;
  ceilingValue: number;
}

export interface RetirementStatus {
  canRetire: boolean;
  totalAssets: number;
  safeWithdrawalRate: number;
  retirementDate?: string;
  retirementDataPoint?: ChartDataPoint;
  riskLevel?: string;
  powerLawMetrics?: PowerLawMetrics;
} 