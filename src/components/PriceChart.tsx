import React, { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BitcoinPowerLaw } from '../models/PowerLaw';
import { monthLabel, retirementYearStart, withdrawalPrice } from '../models/PricePath';
import { RETIREMENT_YEARS, RetirementPlan } from '../simulation/retirementPlan';
import { BitcoinPriceData, BitcoinQuote, ChartDataPoint } from '../types/Bitcoin';
import { formatPrice } from '../utils/format';
import MarketDataStatus from './MarketDataStatus';

const MIN_PROJECTION_YEARS = 10;
const PROJECTION_STEP_DAYS = 30;
/** Consecutive observations further apart than this are a gap, not just sparse data. */
const GAP_BREAK_DAYS = 10;
const DAY_MS = 86400000;

interface PriceChartProps {
  history: BitcoinPriceData[];
  quote: BitcoinQuote;
  historyComplete: boolean;
  refreshing: boolean;
  plan: RetirementPlan | null;
}

const powerLawPoint = (date: Date, actualPrice: number | null): ChartDataPoint => ({
  date: date.toISOString().split('T')[0],
  actualPrice,
  powerLawPrice: BitcoinPowerLaw.calculateFairValue(date),
  powerLawFloor: BitcoinPowerLaw.calculateFloorPrice(date),
  powerLawUpperBound: BitcoinPowerLaw.calculateUpperBound(date),
  timestamp: date.getTime()
});

/** Chart points for the price history, with a null-price break wherever days are missing. */
export const historyPoints = (history: BitcoinPriceData[]): ChartDataPoint[] => {
  const points: ChartDataPoint[] = [];
  history.forEach((item, index) => {
    const previous = history[index - 1];
    if (previous && item.timestamp - previous.timestamp > GAP_BREAK_DAYS * DAY_MS) {
      points.push({ ...powerLawPoint(new Date(previous.timestamp + DAY_MS), null), missingHistory: true });
    }
    points.push(powerLawPoint(new Date(item.timestamp), item.price));
  });
  return points;
};

/** Stress-path price for the retirement year containing `timestamp`, or null outside retirement. */
const planPriceFor = (timestamp: number, plan: RetirementPlan): number | null => {
  const date = new Date(timestamp);
  const start = plan.retirementStart;
  if (date.getTime() < start.getTime()) return null;
  const months = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
  const offset = Math.floor(months / 12);
  return offset < RETIREMENT_YEARS ? withdrawalPrice(retirementYearStart(start, offset), offset) : null;
};

const formatTooltipDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const valueOf = (key: string) => payload.find((entry: any) => entry.dataKey === key)?.value ?? null;
  const actual = valueOf('actualPrice');
  const fair = valueOf('powerLawPrice');

  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{`Date: ${formatTooltipDate(label)}`}</p>
      {payload
        .filter((entry: any) => entry.value !== null && entry.value !== undefined)
        .map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>{`${entry.name}: ${formatPrice(entry.value)}`}</p>
        ))}
      {actual !== null && fair && (
        <>
          <p className="tooltip-ratio">{`Fair Value Ratio: ${(actual / fair).toFixed(2)}x`}</p>
          <p className="tooltip-ratio">{`Floor Ratio: ${(actual / (fair * 0.42)).toFixed(2)}x`}</p>
          <p className="tooltip-ratio">{`Upper Bound Ratio (2x): ${(actual / (fair * 2)).toFixed(2)}x`}</p>
        </>
      )}
      {actual === null && (payload[0]?.payload?.missingHistory
        ? <p className="tooltip-future">No price data for this period</p>
        : <p className="tooltip-future">📈 Future Projection</p>)}
    </div>
  );
};

const PriceChart: React.FC<PriceChartProps> = ({ history, quote, historyComplete, refreshing, plan }) => {
  const now = new Date();
  const fairValue = BitcoinPowerLaw.calculateFairValue(now);
  const floorValue = BitcoinPowerLaw.calculateFloorPrice(now);
  const upperBound = BitcoinPowerLaw.calculateUpperBound(now);
  const priceRatio = quote.price / fairValue;
  const floorRatio = quote.price / floorValue;
  const upperBoundRatio = quote.price / upperBound;

  // Default view projects 10 years; the full retirement is one click away (a 50-year
  // projection squeezes the price history into a sliver).
  const [showFullRetirement, setShowFullRetirement] = useState(false);
  const lastWithdrawal = plan ? retirementYearStart(plan.retirementStart, RETIREMENT_YEARS - 1) : null;
  // The chart runs to the end of the last retirement year.
  const planEnd = plan ? retirementYearStart(plan.retirementStart, RETIREMENT_YEARS).getTime() - 86400000 : 0;
  const lastHistoryYear = history.length > 0 ? new Date(history[history.length - 1].timestamp).getFullYear() : now.getFullYear();
  const planExtendsBeyondDefault = lastWithdrawal !== null && lastWithdrawal.getFullYear() > lastHistoryYear + MIN_PROJECTION_YEARS;
  const horizonPlanEnd = showFullRetirement ? planEnd : 0;

  const chartData = useMemo(() => {
    const points = historyPoints(history);
    if (history.length > 0) {
      const lastTimestamp = history[history.length - 1].timestamp;
      const end = Math.max(
        new Date(lastTimestamp).setFullYear(new Date(lastTimestamp).getFullYear() + MIN_PROJECTION_YEARS),
        horizonPlanEnd
      );
      for (let t = lastTimestamp + PROJECTION_STEP_DAYS * 86400000; t <= end; t += PROJECTION_STEP_DAYS * 86400000) {
        points.push(powerLawPoint(new Date(t), null));
      }
    }
    // Values below a cent break the log scale (very early dates).
    return points.filter(point => (point.actualPrice ?? point.powerLawPrice) >= 0.01);
  }, [history, horizonPlanEnd]);

  const horizonEndYear = chartData.length > 0 ? new Date(chartData[chartData.length - 1].timestamp).getFullYear() : null;

  const chartDataWithPlan = useMemo(
    () => chartData.map(point => ({ ...point, withdrawalPlanPrice: plan ? planPriceFor(point.timestamp, plan) : null })),
    [chartData, plan]
  );

  return (
    <>
      <div className="chart-header">
        <h2>Bitcoin Price and Power Law Model</h2>
        <MarketDataStatus quote={quote} historyComplete={historyComplete} />
        {refreshing && <span className="refresh-indicator" role="status">Refreshing price data…</span>}
        <div className="current-stats">
          <div className="stat">
            <span className="stat-label">Current Price:</span>
            <span className="stat-value">{formatPrice(quote.price)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Published 2026 Power Law:</span>
            <span className="stat-value">{formatPrice(fairValue)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Upper Bound (2x Fair Value):</span>
            <span className="stat-value">{formatPrice(upperBound)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Floor Value (0.42x):</span>
            <span className="stat-value">{formatPrice(floorValue)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Fair Value Ratio:</span>
            <span className={`stat-value ${priceRatio > 1 ? 'above-fair' : 'below-fair'}`}>
              {priceRatio.toFixed(2)}x {priceRatio > 1 ? '(Above)' : '(Below)'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Upper Bound Ratio:</span>
            <span className={`stat-value ${upperBoundRatio > 0.7 ? 'above-fair' : 'below-fair'}`}>
              {upperBoundRatio.toFixed(2)}x {upperBoundRatio > 0.7 ? '(Near Peak)' : '(Below Peak)'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Floor Ratio:</span>
            <span className={`stat-value ${floorRatio > 1 ? 'above-fair' : 'below-fair'}`}>
              {floorRatio.toFixed(2)}x {floorRatio > 1 ? '(Above Floor)' : '(Below Floor)'}
            </span>
          </div>
        </div>
      </div>

      {plan && planExtendsBeyondDefault && (
        <div className="horizon-toggle-row">
          <button type="button" className="horizon-toggle" onClick={() => setShowFullRetirement(value => !value)}>
            {showFullRetirement ? 'Show next 10 years' : `Show full retirement (through ${lastWithdrawal ? monthLabel(lastWithdrawal) : ''})`}
          </button>
        </div>
      )}
      <div className="chart-wrapper" data-testid="price-chart" data-horizon-end={horizonEndYear ?? undefined}>
        <ResponsiveContainer width="100%" height={700}>
          <LineChart data={chartDataWithPlan} margin={{ top: 20, right: 30, left: 60, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={timestamp => new Date(timestamp).getFullYear().toString()}
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 12 }}
            />
            <YAxis scale="log" domain={['dataMin', 'dataMax']} tickFormatter={formatPrice} tick={{ fontSize: 12 }} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="actualPrice" stroke="#f7931a" strokeWidth={2} dot={false} connectNulls={false} name="Actual Bitcoin Price" />
            <Line type="monotone" dataKey="powerLawPrice" stroke="#2196f3" strokeWidth={2} dot={false} strokeDasharray="5 5" name="Published Santostasi/Perrenod 2026" />
            <Line type="monotone" dataKey="powerLawFloor" stroke="#4caf50" strokeWidth={2} dot={false} strokeDasharray="3 3" name="Power Law Floor (0.42x)" />
            <Line type="monotone" dataKey="powerLawUpperBound" stroke="#ff5722" strokeWidth={2} dot={false} strokeDasharray="7 3" name="Power Law Upper Bound (2x)" />
            {plan && (
              <Line type="monotone" dataKey="withdrawalPlanPrice" stroke="#9c27b0" strokeWidth={2} dot={false} connectNulls={false} name="Retirement Stress Path" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default PriceChart;
