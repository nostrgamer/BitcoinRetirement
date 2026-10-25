import React, { useMemo } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { useRetirementPlan } from '../hooks/useRetirementPlan';
import PriceChart from './PriceChart';
import RetirementAnalysis from './RetirementAnalysis';
import RetirementInputsPanel from './RetirementInputsPanel';
import WithdrawalTable from './WithdrawalTable';

const BitcoinChart: React.FC = () => {
  const market = useMarketData();
  const livePrice = market.quote ? market.quote.price : null;
  const firstHistoryYear = useMemo(
    () => (market.history.length > 0 ? new Date(market.history[0].timestamp).getFullYear() : null),
    [market.history]
  );
  const { raw, setField, validation, plan, historicalYear } = useRetirementPlan(livePrice, firstHistoryYear);

  if (market.initialLoading) {
    return (
      <div className="chart-container">
        <div className="loading">Loading Bitcoin data...</div>
      </div>
    );
  }

  if (!market.quote || market.history.length === 0) {
    return (
      <div className="chart-container">
        <div className="error">
          {market.error || 'Failed to load chart data. Please try again.'}
          <button onClick={market.reload}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <PriceChart
        history={market.history}
        quote={market.quote}
        historyComplete={market.historyComplete}
        historyGapAfter={market.historyGapAfter}
        refreshing={market.refreshing}
        plan={plan}
      />
      <RetirementInputsPanel raw={raw} setField={setField} validation={validation} plan={plan} />
      {plan && validation.inputs && livePrice !== null && (
        <>
          <RetirementAnalysis inputs={validation.inputs} plan={plan} livePrice={livePrice} historicalYear={historicalYear} />
          <WithdrawalTable plan={plan} />
        </>
      )}
    </div>
  );
};

export default BitcoinChart;
