import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { BitcoinAPI } from '../services/BitcoinAPI';
import { BitcoinPowerLaw } from '../models/PowerLaw';
import { BitcoinQuote, ChartDataPoint, RetirementInputs, MonthlySavingsInputs } from '../types/Bitcoin';
import { SmartWithdrawalStrategy } from '../utils/SmartWithdrawalStrategy';
import MarketDataStatus from './MarketDataStatus';
import { formatPrice } from '../utils/format';
import {
  findHistoricalRetirementDate,
  legacyChartPlanPrice,
  projectSavingsLegacy,
  simulateLegacyPlan
} from '../simulation/legacyPlan';


const BitcoinChart: React.FC = () => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentFairValue, setCurrentFairValue] = useState<number | null>(null);
  const [currentFloorValue, setCurrentFloorValue] = useState<number | null>(null);
  const [currentUpperBound, setCurrentUpperBound] = useState<number | null>(null);
  const [marketQuote, setMarketQuote] = useState<BitcoinQuote | null>(null);
  const [historyComplete, setHistoryComplete] = useState<boolean>(true);

  // Retirement functionality state
  const [retirementInputs, setRetirementInputs] = useState<RetirementInputs>({
    bitcoinAmount: 0.1,
    cashAmount: 10000,
    annualWithdrawal: 60000,
    yearsUntilRetirement: 0
  });
  const [monthlySavingsInputs, setMonthlySavingsInputs] = useState<MonthlySavingsInputs>({
    monthlySavingsAmount: 500,
    yearsToRetirement: 10,
    enabled: false,
    doubleDownInBearMarkets: false
  });

  useEffect(() => {
    loadChartData();

    // Auto-refresh every 5 minutes to keep data current
    const refreshInterval = setInterval(() => {
      loadChartData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  const loadChartData = async () => {
    try {
      setLoading(true);
      setError(null);

      const marketData = await BitcoinAPI.getMarketData();
      const historicalPrices = marketData.history;
      setCurrentPrice(marketData.quote.price);
      setMarketQuote(marketData.quote);
      setHistoryComplete(marketData.historyComplete);

      // Calculate current fair value, floor, and upper bound
      const fairValue = BitcoinPowerLaw.calculateFairValue(new Date());
      const floorValue = BitcoinPowerLaw.calculateFloorPrice(new Date());
      const upperBound = BitcoinPowerLaw.calculateUpperBound(new Date());
      setCurrentFairValue(fairValue);
      setCurrentFloorValue(floorValue);
      setCurrentUpperBound(upperBound);

      // Combine actual prices with power law data (fair value, floor, and upper bound)
      const combinedData: ChartDataPoint[] = historicalPrices.map(priceData => {
        const date = new Date(priceData.timestamp);
        const powerLawPrice = BitcoinPowerLaw.calculateFairValue(date);
        const powerLawFloor = BitcoinPowerLaw.calculateFloorPrice(date);
        const powerLawUpperBound = BitcoinPowerLaw.calculateUpperBound(date);

        return {
          date: priceData.date,
          actualPrice: priceData.price,
          powerLawPrice: powerLawPrice,
          powerLawFloor: powerLawFloor,
          powerLawUpperBound: powerLawUpperBound,
          timestamp: priceData.timestamp
        };
      });

      // Add future power law projections (10 years ahead)
      if (historicalPrices.length > 0) {
        const lastDataDate = new Date(historicalPrices[historicalPrices.length - 1].timestamp);
        const futureProjections: ChartDataPoint[] = [];


        // Generate data points for the next 10 years to match historical spacing
        const daysPer10Years = 10 * 365; // ~3650 days
        for (let dayOffset = 1; dayOffset <= daysPer10Years; dayOffset += 30) { // Every 30 days for performance
          const futureDate = new Date(lastDataDate);
          futureDate.setDate(futureDate.getDate() + dayOffset);

          const powerLawPrice = BitcoinPowerLaw.calculateFairValue(futureDate);
          const powerLawFloor = BitcoinPowerLaw.calculateFloorPrice(futureDate);
          const powerLawUpperBound = BitcoinPowerLaw.calculateUpperBound(futureDate);

          futureProjections.push({
            date: futureDate.toISOString().split('T')[0],
            actualPrice: null as any, // No actual price for future dates
            powerLawPrice: powerLawPrice,
            powerLawFloor: powerLawFloor,
            powerLawUpperBound: powerLawUpperBound,
            timestamp: futureDate.getTime()
          });
        }

        combinedData.push(...futureProjections);
      }

      // Sort by timestamp to ensure proper chart ordering
      combinedData.sort((a, b) => a.timestamp - b.timestamp);

      // Filter out data points with Power Law values that are too small for log scale
      // This can happen with very early Bitcoin dates where the Power Law model produces tiny values
      const filteredData = combinedData.filter(d => {
        // Keep all data points where actual price exists and is reasonable for log scale
        if (d.actualPrice !== null && d.actualPrice >= 0.01) {
          return true;
        }
        // For future projections (actualPrice is null), keep if Power Law values are reasonable
        if (d.actualPrice === null && d.powerLawPrice >= 0.01) {
          return true;
        }
        // Filter out points with very small values that cause log scale issues
        return false;
      });

      setChartData(filteredData);
    } catch (err) {
      console.error('Error loading chart data:', err);
      setError('Failed to load chart data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const savingsProjection = useMemo(
    () => projectSavingsLegacy(monthlySavingsInputs, new Date()),
    [monthlySavingsInputs]
  );

  const projectedBitcoin = monthlySavingsInputs.enabled && savingsProjection.length > 0
    ? savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated
    : 0;

  const historicalRetirementDate = useMemo(() => {
    const hasAssets = retirementInputs.bitcoinAmount > 0 || (monthlySavingsInputs.enabled && monthlySavingsInputs.monthlySavingsAmount > 0);
    if (!currentPrice || chartData.length === 0 || !hasAssets || retirementInputs.annualWithdrawal <= 0) return null;
    return findHistoricalRetirementDate(
      chartData,
      retirementInputs.bitcoinAmount + projectedBitcoin,
      retirementInputs.annualWithdrawal,
      retirementInputs.cashAmount
    );
  }, [currentPrice, chartData, retirementInputs, monthlySavingsInputs, projectedBitcoin]);

  const handleInputChange = (field: keyof RetirementInputs, value: number) => {
    setRetirementInputs(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSavingsInputChange = (field: keyof MonthlySavingsInputs, value: number | boolean) => {
    setMonthlySavingsInputs(prev => ({
      ...prev,
      [field]: value
    }));
  };


  const formatTooltipDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const simulationRows = useMemo(
    () => currentPrice ? simulateLegacyPlan(retirementInputs, monthlySavingsInputs, savingsProjection, new Date().getFullYear()) : [],
    [currentPrice, retirementInputs, monthlySavingsInputs, savingsProjection]
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const actualPriceEntry = payload.find((entry: any) => entry.dataKey === 'actualPrice');
      const fairValueEntry = payload.find((entry: any) => entry.dataKey === 'powerLawPrice');
      const floorEntry = payload.find((entry: any) => entry.dataKey === 'powerLawFloor');
      const upperBoundEntry = payload.find((entry: any) => entry.dataKey === 'powerLawUpperBound');

      return (
        <div className="chart-tooltip">
          <p className="tooltip-label">{`Date: ${formatTooltipDate(label)}`}</p>
          {payload.map((entry: any, index: number) => {
            // Skip null actual price entries (future projections)
            if (entry.dataKey === 'actualPrice' && entry.value === null) {
              return null;
            }
            // Skip null withdrawal plan price
            if (entry.dataKey === 'withdrawalPlanPrice' && (entry.value === null || entry.value === undefined)) {
              return null;
            }
            return (
              <p key={index} style={{ color: entry.color }}>
                {`${entry.name}: ${formatPrice(entry.value)}`}
              </p>
            );
          })}
          {actualPriceEntry && actualPriceEntry.value !== null && fairValueEntry && (
            <p className="tooltip-ratio">
              {`Fair Value Ratio: ${(actualPriceEntry.value / fairValueEntry.value).toFixed(2)}x`}
            </p>
          )}
          {actualPriceEntry && actualPriceEntry.value !== null && floorEntry && (
            <p className="tooltip-ratio">
              {`Floor Ratio: ${(actualPriceEntry.value / floorEntry.value).toFixed(2)}x`}
            </p>
          )}
          {actualPriceEntry && actualPriceEntry.value !== null && upperBoundEntry && (
            <p className="tooltip-ratio">
              {`Upper Bound Ratio (2x): ${(actualPriceEntry.value / upperBoundEntry.value).toFixed(2)}x`}
            </p>
          )}
          {!actualPriceEntry || actualPriceEntry.value === null ? (
            <p className="tooltip-future">📈 Future Projection</p>
          ) : null}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="chart-container">
        <div className="loading">Loading Bitcoin data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chart-container">
        <div className="error">
          {error}
          <button onClick={loadChartData}>Retry</button>
        </div>
      </div>
    );
  }

  const priceRatio = currentPrice && currentFairValue ? currentPrice / currentFairValue : 0;
  const floorRatio = currentPrice && currentFloorValue ? currentPrice / currentFloorValue : 0;
  const upperBoundRatio = currentPrice && currentUpperBound ? currentPrice / currentUpperBound : 0;
  const isAboveFairValue = priceRatio > 1;
  const isAboveFloor = floorRatio > 1;
  const isNearUpperBound = upperBoundRatio > 0.7; // Consider "near" at 70% of 2x fair value

  // Projected price line: anchor to retirement start year (from "Years until retirement"); bear starts there
  const simulationForChart = simulationRows;
  const currentYear = new Date().getFullYear();
  const yearsToRetirementForChart = monthlySavingsInputs.enabled ? monthlySavingsInputs.yearsToRetirement : 0;
  const chartRetirementStartYear = currentYear + Math.max(retirementInputs.yearsUntilRetirement, yearsToRetirementForChart);

  const chartDataWithPlan: ChartDataPoint[] = chartData.map(pt => ({
    ...pt,
    withdrawalPlanPrice: simulationForChart.length > 0 ? legacyChartPlanPrice(new Date(pt.timestamp).getFullYear(), chartRetirementStartYear) : null
  }));
  const showPlanLine = simulationForChart.length > 0;

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h2>Bitcoin Price and Power Law Model</h2>
        {marketQuote && <MarketDataStatus quote={marketQuote} historyComplete={historyComplete} />}
        {currentPrice && currentFairValue && currentFloorValue && currentUpperBound && (
          <div className="current-stats">
            <div className="stat">
              <span className="stat-label">Current Price:</span>
              <span className="stat-value">{formatPrice(currentPrice)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Published 2026 Power Law:</span>
              <span className="stat-value">{formatPrice(currentFairValue)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Upper Bound (2x Fair Value):</span>
              <span className="stat-value">{formatPrice(currentUpperBound)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Floor Value (0.42x):</span>
              <span className="stat-value">{formatPrice(currentFloorValue)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Fair Value Ratio:</span>
              <span className={`stat-value ${isAboveFairValue ? 'above-fair' : 'below-fair'}`}>
                {priceRatio.toFixed(2)}x {isAboveFairValue ? '(Above)' : '(Below)'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Upper Bound Ratio:</span>
              <span className={`stat-value ${isNearUpperBound ? 'above-fair' : 'below-fair'}`}>
                {upperBoundRatio.toFixed(2)}x {isNearUpperBound ? '(Near Peak)' : '(Below Peak)'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Floor Ratio:</span>
              <span className={`stat-value ${isAboveFloor ? 'above-fair' : 'below-fair'}`}>
                {floorRatio.toFixed(2)}x {isAboveFloor ? '(Above Floor)' : '(Below Floor)'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Chart moved before inputs */}
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={700}>
          <LineChart data={chartDataWithPlan} margin={{ top: 20, right: 30, left: 60, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(timestamp) => {
                const date = new Date(timestamp);
                return date.getFullYear().toString();
              }}
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              scale="log"
              domain={['dataMin', 'dataMax']} // Dynamic range - data is now pre-filtered to avoid log scale issues
              tickFormatter={formatPrice}
              tick={{ fontSize: 12 }}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="actualPrice"
              stroke="#f7931a"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              name="Actual Bitcoin Price"
            />
            <Line
              type="monotone"
              dataKey="powerLawPrice"
              stroke="#2196f3"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              name="Published Santostasi/Perrenod 2026"
            />
            <Line
              type="monotone"
              dataKey="powerLawFloor"
              stroke="#4caf50"
              strokeWidth={2}
              dot={false}
              strokeDasharray="3 3"
              name="Power Law Floor (0.42x)"
            />
            <Line
              type="monotone"
              dataKey="powerLawUpperBound"
              stroke="#ff5722"
              strokeWidth={2}
              dot={false}
              strokeDasharray="7 3"
              name="Power Law Upper Bound (2x)"
            />
            {showPlanLine && (
              <Line
                type="monotone"
                dataKey="withdrawalPlanPrice"
                stroke="#9c27b0"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                name="50-Year Plan (Projected Prices)"
              />
            )}

          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Retirement Calculator Inputs */}
      <div className="retirement-section">
        <h3>Retirement Inputs</h3>
        <div className="retirement-inputs">
          <div className="input-group">
            <label htmlFor="bitcoinAmount">Bitcoin Holdings:</label>
            <input
              id="bitcoinAmount"
              type="number"
              value={retirementInputs.bitcoinAmount}
              onChange={(e) => handleInputChange('bitcoinAmount', parseFloat(e.target.value) || 0)}
              step="0.01"
              min="0"
              placeholder="0 (if just starting)"
            />
            <span className="input-unit">BTC</span>
          </div>

          <div className="input-group">
            <label htmlFor="cashAmount">Cash Holdings:</label>
            <input
              id="cashAmount"
              type="number"
              value={retirementInputs.cashAmount}
              onChange={(e) => handleInputChange('cashAmount', parseFloat(e.target.value) || 0)}
              step="1000"
              min="0"
              placeholder="Enter cash amount"
            />
            <span className="input-unit">USD</span>
          </div>

          <div className="input-group">
            <label htmlFor="annualWithdrawal">Annual Withdrawal Needed:</label>
            <input
              id="annualWithdrawal"
              type="number"
              value={retirementInputs.annualWithdrawal}
              onChange={(e) => handleInputChange('annualWithdrawal', parseFloat(e.target.value) || 0)}
              step="1000"
              min="0"
              placeholder="Enter annual needs"
              title="This calculator uses Net Present Value (NPV) - enter amounts in today's purchasing power. No inflation adjustments are made as the Power Law model operates in real terms."
            />
            <span className="input-unit">USD</span>
          </div>

          <div className="input-group">
            <label htmlFor="yearsUntilRetirement">Years Until Retirement:</label>
            <input
              id="yearsUntilRetirement"
              type="number"
              value={retirementInputs.yearsUntilRetirement}
              onChange={(e) => handleInputChange('yearsUntilRetirement', Math.max(0, parseInt(e.target.value, 10) || 0))}
              step="1"
              min="0"
              max="50"
              placeholder="0 = retire now"
              title="When you plan to start retirement (withdrawals). Sets the starting year for the 50-year table and chart projected prices."
            />
            <span className="input-unit">years</span>
          </div>
        </div>

        {/* Monthly Savings Component */}
        <div className="monthly-savings-section">
          <div className="savings-header">
            <h4>Monthly Savings (Still Earning)</h4>
            <label className="savings-toggle">
              <input
                type="checkbox"
                checked={monthlySavingsInputs.enabled}
                onChange={(e) => handleSavingsInputChange('enabled', e.target.checked)}
              />
              <span>Enable Monthly Savings Projection</span>
            </label>
          </div>

          {monthlySavingsInputs.enabled && (
            <>

              <div className="savings-inputs">
                <div className="input-group">
                  <label htmlFor="monthlySavingsAmount">Monthly Savings Amount:</label>
                  <input
                    id="monthlySavingsAmount"
                    type="number"
                    value={monthlySavingsInputs.monthlySavingsAmount}
                    onChange={(e) => handleSavingsInputChange('monthlySavingsAmount', parseFloat(e.target.value) || 0)}
                    step="100"
                    min="0"
                    placeholder="Enter monthly savings"
                  />
                  <span className="input-unit">USD/month</span>
                </div>

                <div className="input-group">
                  <label htmlFor="yearsToRetirement">Years Until Retirement:</label>
                  <input
                    id="yearsToRetirement"
                    type="number"
                    value={monthlySavingsInputs.yearsToRetirement}
                    onChange={(e) => handleSavingsInputChange('yearsToRetirement', parseFloat(e.target.value) || 0)}
                    step="1"
                    min="1"
                    max="40"
                    placeholder="Years to save"
                  />
                  <span className="input-unit">years</span>
                </div>

                <div className="input-group strategy-option">
                  <label className="savings-toggle bear-market-toggle">
                    <input
                      type="checkbox"
                      checked={monthlySavingsInputs.doubleDownInBearMarkets}
                      onChange={(e) => handleSavingsInputChange('doubleDownInBearMarkets', e.target.checked)}
                    />
                    <span>Double Down in Bear Markets</span>
                  </label>
                </div>
              </div>

              {/* Savings Projection Summary */}
              {savingsProjection.length > 0 && (
                <div className="savings-summary">
                  <h5>📊 Savings Projection Summary</h5>

                  {monthlySavingsInputs.doubleDownInBearMarkets && (
                    <div className="bear-market-info">
                      <p><strong>Bear Market Strategy Active:</strong> Doubling savings during the first two years of each modeled 4-year cycle (cycle years 0 and 1) to maximize Bitcoin accumulation during lower-price periods.</p>
                    </div>
                  )}

                  <div className="summary-stats">
                    <div className="stat-item">
                      <span className="stat-label">Additional Bitcoin Accumulated:</span>
                      <span className="stat-value">
                        {savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated.toFixed(4)} BTC
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Total Cash Invested:</span>
                      <span className="stat-value">
                        ${savingsProjection[savingsProjection.length - 1].totalCashInvested.toLocaleString()}
                        {monthlySavingsInputs.doubleDownInBearMarkets && (
                          <small> (includes bear market doubling)</small>
                        )}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Average Purchase Price:</span>
                      <span className="stat-value">
                        ${(savingsProjection[savingsProjection.length - 1].totalCashInvested /
                           savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated).toLocaleString()}
                      </span>
                    </div>
                    <div className="stat-item total">
                      <span className="stat-label">Total Bitcoin Holdings (Current + Projected):</span>
                      <span className="stat-value">
                        {(retirementInputs.bitcoinAmount + savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated).toFixed(4)} BTC
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>

      {/* Retirement Analysis - based on 50-year simulation */}
      {(() => {
        const hasAssets = retirementInputs.bitcoinAmount > 0 || (monthlySavingsInputs.enabled && monthlySavingsInputs.monthlySavingsAmount > 0);
        return hasAssets && retirementInputs.annualWithdrawal > 0 && currentPrice !== null;
      })() && currentPrice && (() => {
        const simulation = simulationRows;
        if (simulation.length === 0) return null;

        const withdrawalRows = simulation.filter(row => row.phase !== 'ACCUMULATION');
        const allWithdrawalsFullyFunded = withdrawalRows.length >= 50 &&
          withdrawalRows.every(row => (row.withdrawalShortfall || 0) <= 0);
        const firstWithdrawalShortfall = withdrawalRows.find(row => (row.withdrawalShortfall || 0) > 0);
        const simulationSucceeds = allWithdrawalsFullyFunded &&
          simulation[simulation.length - 1].remainingBitcoin > 0 &&
          simulation[simulation.length - 1].totalRemainingValue > 0;

        return (
          <div className="retirement-status">
            <div className="status-header">
              <h4>📊 Retirement Analysis</h4>
              <div className={`status-indicator ${simulationSucceeds ? 'can-retire' : 'cannot-retire'}`}>
                {simulationSucceeds ? '✅ Ready to Retire!' : '⏳ Keep Building...'}
              </div>


              {firstWithdrawalShortfall && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  background: 'rgba(255, 71, 87, 0.12)',
                  border: '1px solid #ff4757',
                  borderRadius: '8px',
                  color: '#f0f0f0'
                }}>
                  ⚠️ Withdrawal shortfall detected in {firstWithdrawalShortfall.year}: requested {formatPrice(firstWithdrawalShortfall.annualWithdrawal)}, funded {formatPrice(firstWithdrawalShortfall.fundedWithdrawal || 0)}, shortfall {formatPrice(firstWithdrawalShortfall.withdrawalShortfall || 0)}.
                </div>
              )}

            </div>

            {/* Historical Retirement Information */}
            {historicalRetirementDate && (
              <div className="historical-retirement-info">
                <h5>✨ Historical Retirement Opportunity</h5>
                <p className="historical-note">
                  <strong>You could have first retired on:</strong> {new Date(historicalRetirementDate.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })} when Bitcoin was ${formatPrice(historicalRetirementDate.actualPrice || 0)} 📈
                  {monthlySavingsInputs.enabled && (
                    <><br/><em>(This calculation includes your full savings plan: {retirementInputs.bitcoinAmount > 0 ? `current ${retirementInputs.bitcoinAmount.toFixed(3)} BTC + ` : ''}projected {savingsProjection.length > 0 ? savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated.toFixed(3) : '0'} BTC from monthly savings)</em></>
                  )}
                </p>

              </div>
            )}

            <div className="status-details">
              <div className="asset-breakdown">
                {retirementInputs.bitcoinAmount > 0 && (
                  <div className="asset-item">
                    <span className="asset-label">Current Bitcoin Holdings:</span>
                    <span className="asset-value">
                      {formatPrice(retirementInputs.bitcoinAmount * currentPrice)}
                      <small> ({retirementInputs.bitcoinAmount.toFixed(3)} BTC × {formatPrice(currentPrice)})</small>
                    </span>
                  </div>
                )}
                {monthlySavingsInputs.enabled && savingsProjection.length > 0 && (() => {
                  const currentYear = new Date().getFullYear();
                  const retirementYear = currentYear + Math.max(retirementInputs.yearsUntilRetirement, monthlySavingsInputs.yearsToRetirement);
                  const retirementDate = new Date(retirementYear, 0, 1);
                  const bitcoinPriceAtRetirement = BitcoinPowerLaw.calculateFairValue(retirementDate);

                  return (
                    <>
                      <div className="asset-item">
                        <span className="asset-label">Projected Bitcoin from Savings:</span>
                        <span className="asset-value">
                          {savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated.toFixed(4)} BTC
                          <small> (from ${monthlySavingsInputs.monthlySavingsAmount}/month × {monthlySavingsInputs.yearsToRetirement} years)</small>
                        </span>
                      </div>
                      <div className="asset-item">
                        <span className="asset-label">Total Bitcoin at Retirement ({retirementYear}):</span>
                        <span className="asset-value">
                          {(retirementInputs.bitcoinAmount + savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated).toFixed(4)} BTC
                          <small> × ${formatPrice(bitcoinPriceAtRetirement)} = {formatPrice((retirementInputs.bitcoinAmount + savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated) * bitcoinPriceAtRetirement)}</small>
                        </span>
                      </div>
                    </>
                  );
                })()}
                <div className="asset-item">
                  <span className="asset-label">Cash Holdings:</span>
                  <span className="asset-value">{formatPrice(retirementInputs.cashAmount)}</span>
                </div>
                <div className="asset-item total">
                  <span className="asset-label">Total Assets:</span>
                  <span className="asset-value">
                    {formatPrice(
                      (retirementInputs.bitcoinAmount + (monthlySavingsInputs.enabled && savingsProjection.length > 0 ? savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated : 0)) * currentPrice +
                      retirementInputs.cashAmount
                    )}
                  </span>
                </div>
              </div>

              <div className="withdrawal-analysis">
                <div className="withdrawal-item">
                  <span className="withdrawal-label">Annual Withdrawal Need:</span>
                  <span className="withdrawal-value">{formatPrice(retirementInputs.annualWithdrawal)}</span>
                </div>
                <div className="withdrawal-item">
                  <span className="withdrawal-label">Cash Buffer Available:</span>
                  <span className="withdrawal-value">{formatPrice(retirementInputs.cashAmount)} (one-time emergency fund)</span>
                </div>
              </div>

              {simulationSucceeds ? (
                <div className="already-retired">
                  <div className="celebration-message">
                    {(() => {
                      const effectiveYears = Math.max(retirementInputs.yearsUntilRetirement, monthlySavingsInputs.enabled ? monthlySavingsInputs.yearsToRetirement : 0);
                      return (
                        <>
                          <h4>🎉 Congratulations! {effectiveYears > 0 ? `You can retire in ${effectiveYears} year${effectiveYears === 1 ? '' : 's'}!` : 'You can retire today!'}</h4>
                          <p>The 50-year simulation confirms your assets will sustain your retirement with realistic Bitcoin cycles{effectiveYears > 0 ? ` starting ${new Date().getFullYear() + effectiveYears}` : ''}!</p>
                        </>
                      );
                    })()}
                  </div>
                  <div className="current-status">
                                          <div className="projection-item">
                        <span className="projection-label">Total Assets (Including Projections):</span>
                        <span className="projection-value">
                                                  {formatPrice(
                          (retirementInputs.bitcoinAmount + (monthlySavingsInputs.enabled && savingsProjection.length > 0 ? savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated : 0)) * currentPrice +
                          retirementInputs.cashAmount
                        )}
                        </span>
                      </div>
                    <div className="projection-item">
                      <span className="projection-label">Annual Withdrawal Need:</span>
                      <span className="projection-value">{formatPrice(retirementInputs.annualWithdrawal)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="projected-retirement">
                  <p className="projection-note">
                    Your current assets won't sustain 50 years of withdrawals based on realistic Bitcoin cycles as modeled by the Power Law. Consider increasing Bitcoin holdings or reducing annual withdrawal needs. Check the detailed 50-year simulation below for exact timing.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Smart Withdrawal Strategy Advice */}
      {currentPrice && currentFairValue && retirementInputs.bitcoinAmount > 0 && (
        <div className="strategy-advice">
          <h4>🧠 Smart Withdrawal Strategy</h4>
          <div className="advice-content">
            <p>{SmartWithdrawalStrategy.getRebalancingAdvice(
              currentPrice,
              new Date(),
              retirementInputs.bitcoinAmount,
              retirementInputs.cashAmount
            )}</p>

            {/* Current withdrawal decision preview */}
            {retirementInputs.annualWithdrawal > 0 && (() => {
              const previewDecision = SmartWithdrawalStrategy.calculateWithdrawal({
                currentBitcoinPrice: currentPrice,
                currentDate: new Date(),
                availableCash: retirementInputs.cashAmount,
                availableBitcoin: retirementInputs.bitcoinAmount,
                withdrawalNeeded: retirementInputs.annualWithdrawal
              });

              return (
                <div className="withdrawal-preview">
                  <h5>If withdrawing ${retirementInputs.annualWithdrawal.toLocaleString()} today:</h5>
                  <div className="preview-details">
                    <div className="preview-item">
                      <span className="preview-label">Strategy:</span>
                      <span className="preview-value">{previewDecision.strategy}</span>
                    </div>
                    <div className="preview-item">
                      <span className="preview-label">Cash Used:</span>
                      <span className="preview-value">${previewDecision.useCashAmount.toLocaleString()}</span>
                    </div>
                    <div className="preview-item">
                      <span className="preview-label">Bitcoin Sold:</span>
                      <span className="preview-value">{previewDecision.useBitcoinAmount.toFixed(4)} BTC</span>
                    </div>
                    {previewDecision.withdrawalShortfall > 0 && (
                      <div className="preview-item">
                        <span className="preview-label">Withdrawal Shortfall:</span>
                        <span className="preview-value">{formatPrice(previewDecision.withdrawalShortfall)}</span>
                      </div>
                    )}
                    <div className="preview-reasoning">
                      <strong>Reasoning:</strong> {previewDecision.reasoning}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 50-Year Simulation Validation */}
      {(() => {
        const hasAssets = retirementInputs.bitcoinAmount > 0 || (monthlySavingsInputs.enabled && monthlySavingsInputs.monthlySavingsAmount > 0);
        return hasAssets && retirementInputs.annualWithdrawal > 0;
      })() && (() => {
        const simulation = simulationRows;
        if (simulation.length === 0) return null;

        const withdrawalRows = simulation.filter(s => s.phase !== 'ACCUMULATION');
        const allWithdrawalsFullyFunded = withdrawalRows.length >= 50 &&
          withdrawalRows.every(s => (s.withdrawalShortfall || 0) <= 0);
        const firstWithdrawalShortfall = withdrawalRows.find(s => (s.withdrawalShortfall || 0) > 0);
        const simulationSucceeds = allWithdrawalsFullyFunded &&
          simulation[simulation.length - 1].remainingBitcoin > 0 &&
          simulation[simulation.length - 1].totalRemainingValue > 0;
        const yearsUntilDepletion = simulation.findIndex(s => s.remainingBitcoin <= 0 && s.remainingCash <= 0);
        const actualYearsLasting = yearsUntilDepletion > 0 ? yearsUntilDepletion + 1 : simulation.length;

        if (simulationSucceeds) {
          return (
            <div style={{
              marginTop: '20px',
              padding: '15px',
              background: 'linear-gradient(135deg, rgba(46, 213, 115, 0.1), rgba(255, 255, 255, 0.05))',
              border: '2px solid #2ed573',
              borderRadius: '12px'
            }}>
              <h5 style={{ color: '#2ed573', margin: '0 0 10px 0' }}>
                ✅ 50-Year Simulation: PASSED
              </h5>
              <p style={{ color: '#f0f0f0', margin: 0 }}>
                Comprehensive simulation confirms assets will last the full 50 years with realistic Bitcoin cycles as modeled by the Power Law.
              </p>
            </div>
          );
        } else {
          return (
            <div style={{
              marginTop: '20px',
              padding: '15px',
              background: 'linear-gradient(135deg, rgba(255, 71, 87, 0.1), rgba(255, 255, 255, 0.05))',
              border: '2px solid #ff4757',
              borderRadius: '12px'
            }}>
              <h5 style={{ color: '#ff4757', margin: '0 0 10px 0' }}>
                ⚠️ 50-Year Simulation: FAILED
              </h5>
              <p style={{ color: '#f0f0f0', marginBottom: '10px' }}>
                {firstWithdrawalShortfall ? (
                  <strong>Withdrawal shortfall in year {firstWithdrawalShortfall.year}: requested {formatPrice(firstWithdrawalShortfall.annualWithdrawal)}, funded {formatPrice(firstWithdrawalShortfall.fundedWithdrawal || 0)}.</strong>
                ) : (
                  <strong>Assets will be depleted in year {actualYearsLasting}</strong>
                )} when accounting for realistic Bitcoin cycles.
              </p>
              <p style={{ color: '#f0f0f0', margin: 0 }}>
                <strong>Action needed:</strong> {actualYearsLasting < 40 ?
                  'Either increase Bitcoin holdings significantly or reduce annual withdrawal needs.' :
                  'Either add more Bitcoin or slightly reduce annual withdrawal needs to reach 50-year sustainability.'
                }
              </p>
            </div>
          );
        }
      })()}

      {/* 50-Year Withdrawal Projection Table */}
      {(() => {
        const hasAssets = retirementInputs.bitcoinAmount > 0 || (monthlySavingsInputs.enabled && monthlySavingsInputs.monthlySavingsAmount > 0);
        return hasAssets && retirementInputs.annualWithdrawal > 0;
      })() && (
        <div className="retirement-projection">
          <h3 style={{ color: '#f7931a', textAlign: 'center', marginBottom: '20px' }}>
            {monthlySavingsInputs.enabled ? 'Full Life Plan: Accumulation + 50-Year Retirement' : '50-Year Withdrawal Projection'}
          </h3>

          {(() => {
            const simulation = simulationRows;

            if (simulation.length === 0) {
              return <p style={{ textAlign: 'center', color: '#999' }}>Enter Bitcoin and withdrawal amounts to see projection</p>;
            }

            // Get final year of withdrawal phase (not accumulation phase)
            const withdrawalPhase = simulation.filter(s => s.phase !== 'ACCUMULATION');
            const finalYear = withdrawalPhase[withdrawalPhase.length - 1] || simulation[simulation.length - 1];
            const yearsUntilDepletion = withdrawalPhase.findIndex(s => s.remainingBitcoin <= 0 && s.remainingCash <= 0);
            const totalSimulationYears = simulation.length;

            return (
              <>
                <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(247, 147, 26, 0.1), rgba(255, 255, 255, 0.05))',
                    border: '1px solid rgba(247, 147, 26, 0.3)',
                    borderRadius: '12px',
                    padding: '15px',
                    display: 'inline-block'
                  }}>
                    <h4 style={{ color: '#f7931a', margin: '0 0 10px 0' }}>
                      Final Results - {finalYear.year}
                      {monthlySavingsInputs.enabled ? ` (${withdrawalPhase.length} years of retirement)` : ` (${totalSimulationYears} years total)`}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                      <div>
                        <div style={{ color: '#f7931a', fontWeight: 'bold' }}>Remaining Bitcoin</div>
                        <div style={{ fontSize: '1.2em', color: 'white' }}>
                          {finalYear.remainingBitcoin.toFixed(3)} BTC
                        </div>
                        <div style={{ color: '#999', fontSize: '0.9em' }}>
                          ≈ ${finalYear.remainingBitcoinValue.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#f7931a', fontWeight: 'bold' }}>Remaining Cash</div>
                        <div style={{ fontSize: '1.2em', color: 'white' }}>
                          ${finalYear.remainingCash.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#f7931a', fontWeight: 'bold' }}>Total Value</div>
                        <div style={{ fontSize: '1.2em', color: 'white' }}>
                          ${finalYear.totalRemainingValue.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {yearsUntilDepletion > 0 && (
                      <div style={{ marginTop: '10px', color: '#ff6b6b' }}>
                        ⚠️ Assets depleted in year {yearsUntilDepletion + 1}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{
                  maxHeight: '600px',
                  overflowY: 'auto',
                  border: '1px solid rgba(247, 147, 26, 0.3)',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.3)'
                }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.9em'
                  }}>
                    <thead style={{
                      position: 'sticky',
                      top: 0,
                      background: 'rgba(247, 147, 26, 0.2)',
                      borderBottom: '2px solid #f7931a'
                    }}>
                      <tr>
                        <th style={{ padding: '12px 8px', color: '#f7931a', fontWeight: 'bold', textAlign: 'left', minWidth: '60px' }}>Year</th>
                        <th style={{ padding: '12px 8px', color: '#f7931a', fontWeight: 'bold', textAlign: 'center', minWidth: '80px' }}>Phase</th>
                        <th style={{ padding: '12px 8px', color: '#f7931a', fontWeight: 'bold', textAlign: 'center', minWidth: '100px' }}>Cycle</th>
                        <th style={{ padding: '12px 8px', color: '#f7931a', fontWeight: 'bold', textAlign: 'right', minWidth: '100px' }}>BTC Price</th>
                        <th style={{ padding: '12px 8px', color: '#f7931a', fontWeight: 'bold', textAlign: 'right', minWidth: '100px' }}>Cash Flow</th>
                        <th style={{ padding: '12px 8px', color: '#f7931a', fontWeight: 'bold', textAlign: 'left', minWidth: '120px' }}>Activity</th>
                        <th style={{ padding: '12px 8px', color: '#f7931a', fontWeight: 'bold', textAlign: 'right', minWidth: '80px' }}>BTC Δ</th>
                        <th style={{ padding: '12px 8px', color: '#f7931a', fontWeight: 'bold', textAlign: 'right', minWidth: '80px' }}>Total BTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulation.map((row, index) => {
                        const isRetirementStart = row.phase === 'RETIREMENT START';
                        const isAccumulation = row.phase === 'ACCUMULATION';
                        const cashFlow = isAccumulation ?
                          (row.totalCashInvested ?
                            row.totalCashInvested - (index > 0 && simulation[index-1].totalCashInvested ? simulation[index-1].totalCashInvested : 0)
                            : 0) :
                          (row.fundedWithdrawal ?? row.annualWithdrawal);
                        const btcDelta = isAccumulation ?
                          (row.bitcoinPurchased ? `+${row.bitcoinPurchased.toFixed(4)}` : '+0') :
                          (row.bitcoinSold > 0 ? `-${row.bitcoinSold.toFixed(4)}` : '0');

                        return (
                          <tr key={index} style={{
                            borderBottom: '1px solid rgba(247, 147, 26, 0.2)',
                            backgroundColor: isRetirementStart ? 'rgba(156, 39, 176, 0.3)' : // Purple highlight for retirement start
                                           index % 2 === 0 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)',
                            border: isRetirementStart ? '2px solid #9c27b0' : 'none'
                          }}>
                            <td style={{
                              padding: '10px 8px',
                              color: isRetirementStart ? '#e1bee7' : '#f0f0f0',
                              fontWeight: 'bold',
                              fontSize: isRetirementStart ? '1.1em' : '1em'
                            }}>
                              {row.year} {isRetirementStart ? '🏠' : ''}
                            </td>
                            <td style={{
                              padding: '10px 8px',
                              textAlign: 'center',
                              color: isAccumulation ? '#2ed573' : isRetirementStart ? '#e1bee7' : '#ffa502',
                              fontSize: '0.8em',
                              fontWeight: 'bold'
                            }}>
                              {isAccumulation ? '💰 SAVE' : isRetirementStart ? '🏠 RETIRE' : '💸 SPEND'}
                            </td>
                            <td style={{
                              padding: '10px 8px',
                              textAlign: 'center',
                              color: row.cyclePhase.includes('Bear') ? '#ff4757' :
                                     row.cyclePhase.includes('Bull') ? '#2ed573' :
                                     row.cyclePhase.includes('Recovery') ? '#ffa502' : '#ddd',
                              fontSize: '0.8em',
                              fontWeight: 'bold'
                            }}>
                              {row.cyclePhase}
                            </td>
                            <td style={{ padding: '10px 8px', color: '#f0f0f0', textAlign: 'right' }}>
                              ${row.bitcoinPrice.toLocaleString()}
                            </td>
                            <td style={{
                              padding: '10px 8px',
                              color: isAccumulation ? '#2ed573' : '#ff6b6b',
                              textAlign: 'right',
                              fontSize: '0.9em',
                              fontWeight: 'bold'
                            }}>
                              {isAccumulation ? '+' : '-'}${Math.abs(cashFlow).toLocaleString()}
                              {!isAccumulation && (row.withdrawalShortfall || 0) > 0 && (
                                <div style={{ color: '#ff4757', fontSize: '0.8em' }}>
                                  shortfall ${(row.withdrawalShortfall || 0).toLocaleString()}
                                </div>
                              )}
                            </td>
                            <td style={{
                              padding: '10px 8px',
                              color: isAccumulation ? '#2ed573' : (row.withdrawalSource.includes('Cash') ? '#2ed573' : '#ffa502'),
                              fontSize: '0.85em',
                              fontWeight: 'bold'
                            }}>
                              {row.withdrawalSource}
                            </td>
                            <td style={{
                              padding: '10px 8px',
                              color: isAccumulation ? '#2ed573' : '#ff6b6b',
                              textAlign: 'right',
                              fontWeight: 'bold'
                            }}>
                              {btcDelta}
                            </td>
                            <td style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              color: row.remainingBitcoin > 0 ? '#f0f0f0' : '#ff4757',
                              fontWeight: row.remainingBitcoin <= 0 ? 'bold' : 'normal'
                            }}>
                              {row.remainingBitcoin.toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{
                  marginTop: '15px',
                  padding: '15px',
                  background: 'rgba(247, 147, 26, 0.1)',
                  borderRadius: '8px',
                  fontSize: '0.9em',
                  color: '#ccc'
                }}>
                  <div style={{ marginBottom: '10px' }}>
                    <strong>📋 Table Guide:</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                    <div>
                      <strong>💰 SAVE Phase:</strong> Monthly savings buy Bitcoin at Power Law fair value each year
                      <br/><strong>🏠 RETIRE Phase:</strong> {monthlySavingsInputs.enabled ? 'Retirement transition year (highlighted in purple)' : 'Immediate retirement'}
                      <br/><strong>💸 SPEND Phase:</strong> Smart withdrawals over 50 years
                    </div>
                    <div>
                      <strong>Strategy:</strong> Use cash during 🔴 bear markets, sell Bitcoin during 🟢 bull markets
                      <br/><strong>BTC Δ:</strong> + means buying Bitcoin, - means selling Bitcoin
                      <br/><strong>Cash Impact:</strong> Cash loses value to inflation, but withdrawal needs stay constant
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default BitcoinChart;
