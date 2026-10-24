import React from 'react';
import { monthLabel } from '../models/PricePath';
import { RETIREMENT_YEARS, RetirementPlan } from '../simulation/retirementPlan';
import { PlanInputs } from '../simulation/retirementPlan';
import { SmartWithdrawalStrategy } from '../utils/SmartWithdrawalStrategy';
import { formatBtc, formatPrice, formatUsd } from '../utils/format';

interface RetirementAnalysisProps {
  inputs: PlanInputs;
  plan: RetirementPlan;
  livePrice: number;
  historicalYear: number | null;
}

const RetirementAnalysis: React.FC<RetirementAnalysisProps> = ({ inputs, plan, livePrice, historicalYear }) => {
  const yearsAway = inputs.yearsUntilRetirement;
  const startLabel = monthLabel(plan.retirementStart);
  const { stress, floorForever } = plan;
  const firstShortfall = stress.rows.find(row => row.withdrawalShortfall > 0);
  const lastRow = stress.rows[stress.rows.length - 1];
  const totalAssets = plan.bitcoinAtRetirement * plan.valuationPrice + inputs.cashAmount;
  const valuationLabel = yearsAway > 0 ? `fair value on 1 ${startLabel}` : 'current price';

  return (
    <>
      <div className="retirement-status">
        <div className="status-header">
          <h4>📊 Retirement Analysis</h4>
          <div className={`status-indicator ${stress.passes ? 'can-retire' : 'cannot-retire'}`}>
            {stress.passes ? '✅ Ready to Retire!' : '⏳ Keep Building...'}
          </div>
          {firstShortfall && (
            <div className="shortfall-banner">
              ⚠️ Withdrawal shortfall detected in {firstShortfall.periodLabel}: requested {formatPrice(firstShortfall.annualWithdrawal)},
              funded {formatPrice(firstShortfall.fundedWithdrawal)}, shortfall {formatPrice(firstShortfall.withdrawalShortfall)}.
            </div>
          )}
        </div>

        <div className="floor-forever">
          <h5>🧱 Stress test: floor forever</h5>
          <p>
            If Bitcoin stayed at the Power Law floor (0.42× fair value) every year, your assets would last{' '}
            <strong data-testid="floor-forever-years">
              {floorForever.passes ? `all ${RETIREMENT_YEARS} years` : `${floorForever.fullyFundedYears} year${floorForever.fullyFundedYears === 1 ? '' : 's'}`}
            </strong>.
          </p>
        </div>

        {historicalYear !== null && (
          <div className="historical-retirement-info">
            <h5>✨ Historical What-If</h5>
            <p className="historical-note">
              With your current holdings ({formatBtc(inputs.bitcoinAmount)} and {formatUsd(inputs.cashAmount)} cash, no future savings),
              this plan would first have passed in <strong data-testid="historical-year">{historicalYear}</strong>.
            </p>
          </div>
        )}

        <div className="status-details">
          <div className="asset-breakdown">
            {inputs.bitcoinAmount > 0 && (
              <div className="asset-item">
                <span className="asset-label">Current Bitcoin Holdings:</span>
                <span className="asset-value">
                  {formatPrice(inputs.bitcoinAmount * livePrice)}
                  <small> ({formatBtc(inputs.bitcoinAmount)} × {formatPrice(livePrice)} today)</small>
                </span>
              </div>
            )}
            {plan.savings.length > 0 && (
              <div className="asset-item">
                <span className="asset-label">Projected Bitcoin from Savings:</span>
                <span className="asset-value">
                  {formatBtc(plan.projectedBitcoin, 4)}
                  <small> ({formatUsd(inputs.monthlySavingsAmount)}/month × {plan.savings.length} months)</small>
                </span>
              </div>
            )}
            <div className="asset-item">
              <span className="asset-label">Bitcoin at Retirement ({startLabel}):</span>
              <span className="asset-value" data-testid="bitcoin-at-retirement-value">
                {formatBtc(plan.bitcoinAtRetirement, 4)}
                <small> × {formatPrice(plan.valuationPrice)} ({valuationLabel}) = {formatPrice(plan.bitcoinAtRetirement * plan.valuationPrice)}</small>
              </span>
            </div>
            <div className="asset-item">
              <span className="asset-label">Cash Holdings:</span>
              <span className="asset-value">{formatPrice(inputs.cashAmount)}</span>
            </div>
            <div className="asset-item total">
              <span className="asset-label">Total Assets at Retirement:</span>
              <span className="asset-value" data-testid="total-assets">{formatPrice(totalAssets)}</span>
            </div>
          </div>

          <div className="withdrawal-analysis">
            <div className="withdrawal-item">
              <span className="withdrawal-label">Annual Withdrawal Need:</span>
              <span className="withdrawal-value">{formatPrice(inputs.annualWithdrawal)}</span>
            </div>
            <div className="withdrawal-item">
              <span className="withdrawal-label">Cash Buffer Available:</span>
              <span className="withdrawal-value">{formatPrice(inputs.cashAmount)} (spent first in low-price years)</span>
            </div>
          </div>

          {stress.passes ? (
            <div className="already-retired">
              <div className="celebration-message">
                <h4>🎉 Congratulations! {yearsAway > 0 ? `You can retire in ${yearsAway} year${yearsAway === 1 ? '' : 's'}!` : 'You can retire now!'}</h4>
                <p>
                  Your assets fund all {RETIREMENT_YEARS} years on the stress path (3 years at the floor, a recovery year,
                  then 0.84× fair value), starting {startLabel}.
                </p>
              </div>
            </div>
          ) : (
            <div className="projected-retirement">
              <p className="projection-note">
                Your assets won't fund {RETIREMENT_YEARS} years of withdrawals on the stress path. Consider adding Bitcoin or
                cash, saving longer, or reducing annual withdrawals. The table below shows the exact year.
              </p>
            </div>
          )}
        </div>
      </div>

      {inputs.bitcoinAmount > 0 && (() => {
        const preview = SmartWithdrawalStrategy.calculateWithdrawal({
          currentBitcoinPrice: livePrice,
          currentDate: new Date(),
          availableCash: inputs.cashAmount,
          availableBitcoin: inputs.bitcoinAmount,
          withdrawalNeeded: inputs.annualWithdrawal
        });
        return (
          <div className="strategy-advice">
            <h4>🧠 Smart Withdrawal Strategy</h4>
            <div className="advice-content">
              <p>{SmartWithdrawalStrategy.getRebalancingAdvice(livePrice, new Date(), inputs.bitcoinAmount, inputs.cashAmount)}</p>
              <div className="withdrawal-preview">
                <h5>If withdrawing {formatUsd(inputs.annualWithdrawal)} today:</h5>
                <div className="preview-details">
                  <div className="preview-item">
                    <span className="preview-label">Strategy:</span>
                    <span className="preview-value">{preview.strategy}</span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-label">Cash Used:</span>
                    <span className="preview-value">{formatUsd(preview.useCashAmount)}</span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-label">Bitcoin Sold:</span>
                    <span className="preview-value">{formatBtc(preview.useBitcoinAmount, 4)}</span>
                  </div>
                  {preview.withdrawalShortfall > 0 && (
                    <div className="preview-item">
                      <span className="preview-label">Withdrawal Shortfall:</span>
                      <span className="preview-value">{formatPrice(preview.withdrawalShortfall)}</span>
                    </div>
                  )}
                  <div className="preview-reasoning">
                    <strong>Reasoning:</strong> {preview.reasoning}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className={`simulation-verdict ${stress.passes ? 'simulation-verdict--pass' : 'simulation-verdict--fail'}`}>
        <h5>{stress.passes ? `✅ ${RETIREMENT_YEARS}-Year Simulation: PASSED` : `⚠️ ${RETIREMENT_YEARS}-Year Simulation: FAILED`}</h5>
        {stress.passes ? (
          <p>All {RETIREMENT_YEARS} annual withdrawals are fully funded on the stress path.</p>
        ) : (
          <p>
            <strong>
              {firstShortfall
                ? `Withdrawal shortfall in ${firstShortfall.periodLabel}: requested ${formatPrice(firstShortfall.annualWithdrawal)}, funded ${formatPrice(firstShortfall.fundedWithdrawal)}.`
                : `Assets are depleted after the ${lastRow.periodLabel} withdrawal.`}
            </strong>{' '}
            {stress.fullyFundedYears} of {RETIREMENT_YEARS} withdrawals are fully funded.
          </p>
        )}
      </div>
    </>
  );
};

export default RetirementAnalysis;
