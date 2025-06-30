import React, { useState, useEffect } from 'react';
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
import { ChartDataPoint } from '../types/Bitcoin';

const BitcoinChart: React.FC = () => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentFairValue, setCurrentFairValue] = useState<number | null>(null);
  const [currentFloorValue, setCurrentFloorValue] = useState<number | null>(null);
  const [currentUpperBound, setCurrentUpperBound] = useState<number | null>(null);

  useEffect(() => {
    loadChartData();
  }, []);

  const loadChartData = async () => {
    try {
      setLoading(true);
      setError(null);

              // Fetch historical Bitcoin prices from CSV (2012-present) + recent API data
      const historicalPrices = await BitcoinAPI.getHistoricalDataWithCSV();
      
              // Get current price from API
      try {
        const current = await BitcoinAPI.getCurrentPrice();
        setCurrentPrice(current);
      } catch (error) {
        console.log('API current price failed, using latest historical price');
        if (historicalPrices.length > 0) {
          const latestPrice = historicalPrices[historicalPrices.length - 1].price;
          setCurrentPrice(latestPrice);
          console.log(`Using latest historical price: $${latestPrice}`);
        }
      }

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

      // Add future power law projections (8 years ahead)
      if (historicalPrices.length > 0) {
        const lastDataDate = new Date(historicalPrices[historicalPrices.length - 1].timestamp);
        const futureProjections: ChartDataPoint[] = [];
        
        console.log(`Adding 8 years of future power law projections starting from ${lastDataDate.toISOString().split('T')[0]}`);
        
        // Generate daily data points for the next 8 years to match historical spacing
        const daysPer8Years = 8 * 365; // ~2920 days
        for (let dayOffset = 1; dayOffset <= daysPer8Years; dayOffset += 30) { // Every 30 days for performance
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
        
        console.log(`Added ${futureProjections.length} future projection points (every 30 days for 8 years)`);
        combinedData.push(...futureProjections);
      }

      // Sort by timestamp to ensure proper chart ordering
      combinedData.sort((a, b) => a.timestamp - b.timestamp);

      setChartData(combinedData);
    } catch (err) {
      console.error('Error loading chart data:', err);
      setError('Failed to load chart data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };



  const formatTooltipDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

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

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h2>Bitcoin Price vs Power Law Model</h2>
        {currentPrice && currentFairValue && currentFloorValue && currentUpperBound && (
          <div className="current-stats">
            <div className="stat">
              <span className="stat-label">Current Price:</span>
              <span className="stat-value">{formatPrice(currentPrice)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Fair Value (Power Law):</span>
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
      
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={700}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 60, bottom: 100 }}>
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
              domain={['dataMin', 'dataMax']} // Dynamic range to accommodate future projections
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
              name="Power Law Fair Value"
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
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BitcoinChart; 