import { useMemo, useState } from 'react';
import { buildRetirementPlan, firstPassingYear, RetirementPlan } from '../simulation/retirementPlan';
import { RawPlanInputs, validatePlanInputs, ValidationResult } from '../simulation/validation';

export interface RetirementPlanState {
  raw: RawPlanInputs;
  setField: <K extends keyof RawPlanInputs>(field: K, value: RawPlanInputs[K]) => void;
  validation: ValidationResult;
  plan: RetirementPlan | null;
  /** What-if: earliest year retiring with today's holdings (no future savings) would have passed. */
  historicalYear: number | null;
}

const DEFAULT_INPUTS: RawPlanInputs = {
  bitcoinAmount: '0.1',
  cashAmount: '10000',
  annualWithdrawal: '60000',
  yearsUntilRetirement: '0',
  monthlySavingsEnabled: false,
  monthlySavingsAmount: '500'
};

export const useRetirementPlan = (livePrice: number | null, firstHistoryYear: number | null): RetirementPlanState => {
  const [raw, setRaw] = useState<RawPlanInputs>(DEFAULT_INPUTS);
  const validation = useMemo(() => validatePlanInputs(raw), [raw]);

  const plan = useMemo(() => {
    if (!validation.inputs || livePrice === null) return null;
    return buildRetirementPlan(validation.inputs, new Date(), livePrice);
  }, [validation.inputs, livePrice]);

  const historicalYear = useMemo(() => {
    if (!validation.inputs || firstHistoryYear === null) return null;
    const { bitcoinAmount, cashAmount, annualWithdrawal } = validation.inputs;
    return firstPassingYear(bitcoinAmount, cashAmount, annualWithdrawal, firstHistoryYear, new Date().getFullYear());
  }, [validation.inputs, firstHistoryYear]);

  const setField = <K extends keyof RawPlanInputs>(field: K, value: RawPlanInputs[K]) =>
    setRaw(prev => ({ ...prev, [field]: value }));

  return { raw, setField, validation, plan, historicalYear };
};
