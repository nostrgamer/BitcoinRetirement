import { PlanInputs } from './retirementPlan';

/** Raw text from the input fields, so empty and malformed entries can be reported. */
export interface RawPlanInputs {
  bitcoinAmount: string;
  cashAmount: string;
  annualWithdrawal: string;
  yearsUntilRetirement: string;
  monthlySavingsEnabled: boolean;
  monthlySavingsAmount: string;
}

export interface ValidationResult {
  /** Blocking: the analysis is hidden until these are fixed. */
  errors: string[];
  /** Non-blocking: shown, calculations still run. */
  warnings: string[];
  inputs: PlanInputs | null;
}

export const MAX_YEARS_UNTIL_RETIREMENT = 50;
export const LARGE_BITCOIN_WARNING = 1000;
export const LARGE_WITHDRAWAL_WARNING = 10_000_000;

const parseAmount = (raw: string, label: string, errors: string[]): number => {
  const text = raw.trim();
  if (text === '') {
    errors.push(`${label} is required (enter 0 if none).`);
    return NaN;
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    errors.push(`${label} must be a number.`);
    return NaN;
  }
  if (value < 0) {
    errors.push(`${label} cannot be negative.`);
    return NaN;
  }
  return value;
};

export const validatePlanInputs = (raw: RawPlanInputs): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const bitcoinAmount = parseAmount(raw.bitcoinAmount, 'Bitcoin holdings', errors);
  const cashAmount = parseAmount(raw.cashAmount, 'Cash holdings', errors);
  const annualWithdrawal = parseAmount(raw.annualWithdrawal, 'Annual withdrawal', errors);
  const years = parseAmount(raw.yearsUntilRetirement, 'Years until retirement', errors);
  const monthlySavingsAmount = raw.monthlySavingsEnabled
    ? parseAmount(raw.monthlySavingsAmount, 'Monthly savings', errors)
    : 0;

  if (annualWithdrawal === 0) errors.push('Annual withdrawal must be greater than zero.');
  if (Number.isFinite(years) && (!Number.isInteger(years) || years > MAX_YEARS_UNTIL_RETIREMENT)) {
    errors.push(`Years until retirement must be a whole number from 0 to ${MAX_YEARS_UNTIL_RETIREMENT}.`);
  }
  if (bitcoinAmount === 0 && cashAmount === 0 && !(monthlySavingsAmount > 0)) {
    errors.push('Enter some Bitcoin, cash, or a monthly savings amount.');
  }
  if (bitcoinAmount > LARGE_BITCOIN_WARNING) warnings.push('Bitcoin holdings above 1,000 BTC. Double-check the amount.');
  if (annualWithdrawal > LARGE_WITHDRAWAL_WARNING) warnings.push('Annual withdrawal above $10M. Double-check the amount.');

  return {
    errors,
    warnings,
    inputs: errors.length > 0 ? null : {
      bitcoinAmount,
      cashAmount,
      annualWithdrawal,
      yearsUntilRetirement: years,
      monthlySavingsEnabled: raw.monthlySavingsEnabled,
      monthlySavingsAmount
    }
  };
};
