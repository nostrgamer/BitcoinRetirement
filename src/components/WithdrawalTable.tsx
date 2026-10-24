import React from 'react';
import { RETIREMENT_YEARS, RetirementPlan } from '../simulation/retirementPlan';
import { formatUsd } from '../utils/format';

const basisClass = (basis: string): string => {
  if (basis.startsWith('Floor')) return 'basis-floor';
  if (basis.startsWith('Recovery')) return 'basis-recovery';
  if (basis.startsWith('Long-run')) return 'basis-long-run';
  return 'basis-fair';
};

const WithdrawalTable: React.FC<{ plan: RetirementPlan }> = ({ plan }) => {
  const rows = [...plan.accumulationRows, ...plan.stress.rows];
  const withdrawalRows = plan.stress.rows;
  const finalRow = withdrawalRows[withdrawalRows.length - 1];
  const hasAccumulation = plan.accumulationRows.length > 0;

  return (
    <div className="retirement-projection">
      <h3 className="projection-title">
        {hasAccumulation ? `Full Life Plan: Accumulation + ${RETIREMENT_YEARS}-Year Retirement` : `${RETIREMENT_YEARS}-Year Withdrawal Projection`}
      </h3>

      <div className="final-results-wrapper">
        <div className="final-results">
          <h4>Final Results after {withdrawalRows.length} year{withdrawalRows.length === 1 ? '' : 's'} of retirement ({finalRow.periodLabel})</h4>
          <div className="final-results-grid">
            <div>
              <div className="final-label">Remaining Bitcoin</div>
              <div className="final-value">{finalRow.remainingBitcoin.toFixed(3)} BTC</div>
              <div className="final-sub">≈ {formatUsd(finalRow.remainingBitcoinValue)}</div>
            </div>
            <div>
              <div className="final-label">Remaining Cash</div>
              <div className="final-value">{formatUsd(finalRow.remainingCash)}</div>
            </div>
            <div>
              <div className="final-label">Total Value</div>
              <div className="final-value">{formatUsd(finalRow.totalRemainingValue)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="projection-table-wrapper">
        <table className="projection-table">
          <thead>
            <tr>
              <th className="col-left">Date</th>
              <th>Phase</th>
              <th>Price Basis</th>
              <th className="col-right">BTC Price</th>
              <th className="col-right">Cash Flow</th>
              <th className="col-left">Activity</th>
              <th className="col-right">BTC Δ</th>
              <th className="col-right">Total BTC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isStart = row.phase === 'RETIREMENT START';
              const isAccumulation = row.phase === 'ACCUMULATION';
              const rowClass = isStart ? 'row-retirement-start' : index % 2 === 0 ? 'row-even' : 'row-odd';
              return (
                <tr key={`${row.phase}-${row.timestamp}`} className={rowClass} data-phase={row.phase}>
                  <td className="cell-year">{row.periodLabel} {isStart ? '🏠' : ''}</td>
                  <td className={`cell-phase ${isAccumulation ? 'phase-save' : isStart ? 'phase-retire' : 'phase-spend'}`}>
                    {isAccumulation ? '💰 SAVE' : isStart ? '🏠 RETIRE' : '💸 SPEND'}
                  </td>
                  <td className={`cell-basis ${basisClass(row.priceBasis)}`}>{row.priceBasis}</td>
                  <td className="col-right">{formatUsd(row.bitcoinPrice)}</td>
                  <td className={`col-right cell-flow ${isAccumulation ? 'flow-in' : 'flow-out'}`}>
                    {isAccumulation ? `+${formatUsd(row.cashInvested)}` : `-${formatUsd(row.fundedWithdrawal)}`}
                    {row.withdrawalShortfall > 0 && <div className="cell-shortfall">shortfall {formatUsd(row.withdrawalShortfall)}</div>}
                  </td>
                  <td className={`cell-activity ${isAccumulation || row.activity.includes('Cash') ? 'activity-cash' : 'activity-btc'}`}>
                    {isStart ? `Retirement Start — ${row.activity}` : row.activity}
                  </td>
                  <td className={`col-right ${isAccumulation ? 'flow-in' : 'flow-out'}`}>
                    {isAccumulation ? `+${row.bitcoinPurchased.toFixed(4)}` : row.bitcoinSold > 0 ? `-${row.bitcoinSold.toFixed(4)}` : '0'}
                  </td>
                  <td className={`col-right ${row.remainingBitcoin > 0 ? '' : 'cell-depleted'}`}>{row.remainingBitcoin.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="table-guide">
        <div className="table-guide-title"><strong>📋 Table Guide:</strong></div>
        <div className="table-guide-grid">
          <div>
            <strong>💰 SAVE:</strong> monthly savings buy Bitcoin at the Power Law fair value; BTC Price shows the average purchase price for those 12 months.
            <br /><strong>🏠 RETIRE:</strong> first year of retirement (highlighted in purple).
            <br /><strong>💸 SPEND:</strong> one withdrawal on the first day of each 12-month period, covering that period's spending.
          </div>
          <div>
            <strong>Stress path:</strong> 3 years at the floor (0.42× fair value), 1 recovery year (0.855×), then 0.76× fair value.
            <br /><strong>Strategy:</strong> spend cash when Bitcoin is cheap relative to fair value, sell Bitcoin when it isn't.
            <br /><strong>BTC Δ:</strong> + means buying Bitcoin, − means selling Bitcoin.
          </div>
        </div>
      </div>
    </div>
  );
};

export default WithdrawalTable;
