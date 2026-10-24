import { BitcoinPowerLaw } from './PowerLaw';

/** Power Law floor as a fraction of fair value. */
export const FLOOR_RATIO = 0.42;
/** Retirement opens with this many consecutive years priced at the floor. */
export const STRESS_FLOOR_YEARS = 3;
/** Recovery year: 75% of the way from the floor back to fair value (0.855x). */
export const RECOVERY_RATIO = FLOOR_RATIO + (1 - FLOOR_RATIO) * 0.75;
/**
 * Every later year: 0.84x fair value, the median price / fair value ratio over 2012–2024
 * (owner decision 2026-10-24). Deliberately a fixed constant: refreshing the price history
 * must not silently change the model.
 */
export const LONG_RUN_RATIO = 0.84;

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
  return 'Long-run (0.84× fair value)';
};

/** Price used for the withdrawal in a given calendar year (withdrawals happen on January 1). */
export const withdrawalPrice = (year: number, offset: number, path: WithdrawalPath = 'stress'): number =>
  BitcoinPowerLaw.calculateFairValue(new Date(year, 0, 1)) * withdrawalRatio(offset, path);

/** Monthly savings buy at that month's fair value. */
export const purchasePrice = (date: Date): number => BitcoinPowerLaw.calculateFairValue(date);

/**
 * Price used to value holdings at the start of retirement: the live price when retiring this
 * year, otherwise fair value on January 1 of the retirement year.
 */
export const retirementValuationPrice = (retirementStartYear: number, currentYear: number, livePrice: number): number =>
  retirementStartYear <= currentYear ? livePrice : BitcoinPowerLaw.calculateFairValue(new Date(retirementStartYear, 0, 1));
