import React from 'react';
import { RetirementPlan } from '../simulation/retirementPlan';
import { RawPlanInputs, ValidationResult } from '../simulation/validation';
import { formatBtc, formatUsd } from '../utils/format';

interface RetirementInputsPanelProps {
  raw: RawPlanInputs;
  setField: <K extends keyof RawPlanInputs>(field: K, value: RawPlanInputs[K]) => void;
  validation: ValidationResult;
  plan: RetirementPlan | null;
}

const NumberField: React.FC<{
  id: keyof RawPlanInputs;
  label: string;
  unit: string;
  value: string;
  step: string;
  placeholder: string;
  title?: string;
  onChange: (value: string) => void;
}> = ({ id, label, unit, value, step, placeholder, title, onChange }) => (
  <div className="input-group">
    <label htmlFor={id}>{label}</label>
    <input
      id={id}
      type="number"
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value)}
      step={step}
      min="0"
      placeholder={placeholder}
      title={title}
    />
    <span className="input-unit">{unit}</span>
  </div>
);

const RetirementInputsPanel: React.FC<RetirementInputsPanelProps> = ({ raw, setField, validation, plan }) => (
  <div className="retirement-section">
    <h3>Retirement Inputs</h3>
    <div className="retirement-inputs">
      <NumberField id="bitcoinAmount" label="Bitcoin Holdings:" unit="BTC" step="0.01" placeholder="0 (if just starting)"
        value={raw.bitcoinAmount} onChange={v => setField('bitcoinAmount', v)} />
      <NumberField id="cashAmount" label="Cash Holdings:" unit="USD" step="1000" placeholder="Enter cash amount"
        value={raw.cashAmount} onChange={v => setField('cashAmount', v)} />
      <NumberField id="annualWithdrawal" label="Annual Withdrawal Needed:" unit="USD" step="1000" placeholder="Enter annual needs"
        title="Enter your annual spending in dollars. Bitcoin prices come from the Power Law curve."
        value={raw.annualWithdrawal} onChange={v => setField('annualWithdrawal', v)} />
      <NumberField id="yearsUntilRetirement" label="Years Until Retirement:" unit="years" step="1" placeholder="0 = retire now"
        title="Retirement starts on the first of next month, plus this many years. Monthly savings (if enabled) run until then."
        value={raw.yearsUntilRetirement} onChange={v => setField('yearsUntilRetirement', v)} />
    </div>

    {validation.errors.length > 0 && (
      <ul className="validation-messages validation-errors" role="alert">
        {validation.errors.map(message => <li key={message}>{message}</li>)}
      </ul>
    )}
    {validation.warnings.length > 0 && (
      <ul className="validation-messages validation-warnings">
        {validation.warnings.map(message => <li key={message}>{message}</li>)}
      </ul>
    )}

    <div className="monthly-savings-section">
      <div className="savings-header">
        <h4>Monthly Savings (Still Earning)</h4>
        <label className="savings-toggle">
          <input
            type="checkbox"
            checked={raw.monthlySavingsEnabled}
            onChange={e => setField('monthlySavingsEnabled', e.target.checked)}
          />
          <span>Enable Monthly Savings Projection</span>
        </label>
      </div>

      {raw.monthlySavingsEnabled && (
        <>
          <div className="savings-inputs">
            <NumberField id="monthlySavingsAmount" label="Monthly Savings Amount:" unit="USD/month" step="100" placeholder="Enter monthly savings"
              value={raw.monthlySavingsAmount} onChange={v => setField('monthlySavingsAmount', v)} />
          </div>
          <p className="savings-explanation">
            Buys Bitcoin at the Power Law fair value each month until retirement starts.
          </p>

          {plan && plan.savings.length > 0 && (
            <div className="savings-summary">
              <h5>📊 Savings Projection Summary</h5>
              <div className="summary-stats">
                <div className="stat-item">
                  <span className="stat-label">Additional Bitcoin Accumulated:</span>
                  <span className="stat-value">{formatBtc(plan.projectedBitcoin, 4)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Cash Invested:</span>
                  <span className="stat-value">{formatUsd(plan.totalCashInvested)} over {plan.savings.length} months</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Average Purchase Price:</span>
                  <span className="stat-value">{formatUsd(plan.totalCashInvested / plan.projectedBitcoin)}</span>
                </div>
                <div className="stat-item total">
                  <span className="stat-label">Total Bitcoin Holdings (Current + Projected):</span>
                  <span className="stat-value">{formatBtc(plan.bitcoinAtRetirement, 4)}</span>
                </div>
              </div>
            </div>
          )}
          {plan && plan.savings.length === 0 && (
            <p className="savings-explanation">Retirement starts next month, so there are no months left to save.</p>
          )}
        </>
      )}
    </div>
  </div>
);

export default RetirementInputsPanel;
