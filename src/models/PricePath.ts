import { BitcoinPowerLaw } from './PowerLaw';

/** Power Law floor as a fraction of fair value. */
export const FLOOR_RATIO = 0.42;
/** Retirement opens with this many consecutive years priced at the floor. */
export const STRESS_FLOOR_YEARS = 3;
/** Recovery year: 75% of the way from the floor back to fair value (0.855x). */
export const RECOVERY_RATIO = FLOOR_RATIO + (1 - FLOOR_RATIO) * 0.75;
/**
 * Every later year: 0.76x fair value, the median price / fair value ratio from 2012 through
 * September 2026 (owner decision 2026-10-24, chosen over the 2012–2024 median of 0.84 as more conservative). Deliberately a fixed constant: refreshing the price history
 * must not silently change the model.
 */
export const LONG_RUN_RATIO = 0.76;

export type WithdrawalPath = 'stress' | 'floorForever';

/** Price / fair value ratio for retirement year `offset` (0 = first year of retirement). */
export const withdrawalRatio = (offset: number, path: WithdrawalPath = 'stress'): number => {
  if (path === 'floorForever' || offset < STRESS_FLOOR_YEARS) return FLOOR_RATIO;
  if (offset === STRESS_FLOOR_YEARS) return RECOVERY_RATIO;
  return LONG_RUN_RATIO;
};

export const withdrawalBasisLabel = (offset: number, path: WithdrawalPath = 'stress'): string => {
  if (path === 'floorForever') return 'Floor';
  if (offset < STRESS_FLOOR_YEARS) return `Floor (stress year ${offset + 1})`;
  if (offset === STRESS_FLOOR_YEARS) return 'Recovery';
  return 'Long-run (0.76×)';
};

/** Price used for a withdrawal taken on `date` (the start of retirement year `offset`). */
export const withdrawalPrice = (date: Date, offset: number, path: WithdrawalPath = 'stress'): number =>
  BitcoinPowerLaw.calculateFairValue(date) * withdrawalRatio(offset, path);

/** Monthly savings buy at that month's fair value. */
export const purchasePrice = (date: Date): number => BitcoinPowerLaw.calculateFairValue(date);

/**
 * Price used to value holdings at the start of retirement: the live price when retiring now
 * (next month), otherwise fair value on the retirement start date.
 */
export const retirementValuationPrice = (retirementStart: Date, retiringNow: boolean, livePrice: number): number =>
  retiringNow ? livePrice : BitcoinPowerLaw.calculateFairValue(retirementStart);

/** Retirement starts on the first of next month, plus `yearsUntilRetirement` years. */
export const retirementStartDate = (now: Date, yearsUntilRetirement: number): Date =>
  new Date(now.getFullYear() + yearsUntilRetirement, now.getMonth() + 1, 1);

/** Start of retirement year `offset` (anniversaries of the start date). */
export const retirementYearStart = (start: Date, offset: number): Date =>
  new Date(start.getFullYear() + offset, start.getMonth(), 1);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (date: Date): string => `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
