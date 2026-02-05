import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { ChartDataPoint, RetirementInputs, MonthlySavingsInputs, SavingsProjection } from '../types/Bitcoin';
import { SmartWithdrawalStrategy } from '../utils/SmartWithdrawalStrategy';


const BitcoinChart: React.FC = () => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentFairValue, setCurrentFairValue] = useState<number | null>(null);
  const [currentFloorValue, setCurrentFloorValue] = useState<number | null>(null);
  const [currentUpperBound, setCurrentUpperBound] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Retirement functionality state
  const [retirementInputs, setRetirementInputs] = useState<RetirementInputs>({
    bitcoinAmount: 0.1,
    cashAmount: 10000,
    annualWithdrawal: 60000
  });
  const [monthlySavingsInputs, setMonthlySavingsInputs] = useState<MonthlySavingsInputs>({
    monthlySavingsAmount: 500,
    yearsToRetirement: 10,
    enabled: false,
    doubleDownInBearMarkets: false
  });
  const [historicalRetirementDate, setHistoricalRetirementDate] = useState<ChartDataPoint | null>(null);

  useEffect(() => {
    loadChartData();
    
    // Auto-refresh every 5 minutes to keep data current
    const refreshInterval = setInterval(() => {
      console.log('Auto-refreshing Bitcoin data...');
      loadChartData();
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(refreshInterval);
  }, []);

  const loadChartData = async () => {
    try {
      setLoading(true);
      setError(null);

              // Fetch historical Bitcoin prices from CSV (2012-present) + recent API data
      const historicalPrices = await BitcoinAPI.getHistoricalDataWithCSV();
      
              // Get current price from API
      try {
        console.log('Fetching current Bitcoin price from API...');
        const current = await BitcoinAPI.getCurrentPrice();
        console.log(`Current Bitcoin price from API: $${current.toLocaleString()}`);
        setCurrentPrice(current);
      } catch (error) {
        console.log('API current price failed, trying alternative approach...');
        
        // Try to get the most recent price from the historical data (could be from API supplement)
        if (historicalPrices.length > 0) {
          const latestPrice = historicalPrices[historicalPrices.length - 1].price;
          setCurrentPrice(latestPrice);
          console.log(`Using latest historical price: $${latestPrice.toLocaleString()}`);
        } else {
          // If no historical data, try a simple fallback API call
          try {
            console.log('Trying alternative API endpoint...');
            const alternativeResponse = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=BTC');
            const alternativeData = await alternativeResponse.json();
            const alternativePrice = parseFloat(alternativeData.data.rates.USD);
            if (!isNaN(alternativePrice)) {
              setCurrentPrice(alternativePrice);
              console.log(`Using alternative API price: $${alternativePrice.toLocaleString()}`);
            }
          } catch (alternativeError) {
            console.log('All price sources failed, using Power Law fair value as estimate');
            const fallbackPrice = BitcoinPowerLaw.calculateFairValue(new Date());
            setCurrentPrice(fallbackPrice);
            console.log(`Using Power Law fair value as fallback: $${fallbackPrice.toLocaleString()}`);
          }
        }
      }

      // Calculate current fair value, floor, and upper bound
      const fairValue = BitcoinPowerLaw.calculateFairValue(new Date());
      const floorValue = BitcoinPowerLaw.calculateFloorPrice(new Date());
      const upperBound = BitcoinPowerLaw.calculateUpperBound(new Date());
      setCurrentFairValue(fairValue);
      setCurrentFloorValue(floorValue);
      setCurrentUpperBound(upperBound);

      // Debug: Check what historical data we received
      console.log(`Chart received ${historicalPrices.length} historical price points`);
      if (historicalPrices.length > 0) {
        const pre2020Count = historicalPrices.filter(d => new Date(d.date).getFullYear() < 2020).length;
        console.log(`Pre-2020 data in chart: ${pre2020Count} points`);
        console.log(`First data point: ${historicalPrices[0].date} - $${historicalPrices[0].price}`);
        console.log(`Last data point: ${historicalPrices[historicalPrices.length - 1].date} - $${historicalPrices[historicalPrices.length - 1].price}`);
      }

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
        
        console.log(`Adding 8 years of future power law projections starting from ${lastDataDate.toISOString().split('T')[0]}`);
        
        // Generate daily data points for the next 8 years to match historical spacing
        const daysPer8Years = 10 * 365; // ~3650 days
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

      console.log(`Filtered ${combinedData.length - filteredData.length} data points with values too small for log scale`);
      console.log(`Final chart data: ${filteredData.length} points`);
      if (filteredData.length > 0) {
        const pre2020Final = filteredData.filter(d => new Date(d.date).getFullYear() < 2020);
        const year2025Data = filteredData.filter(d => new Date(d.date).getFullYear() === 2025);
        const year2026Data = filteredData.filter(d => new Date(d.date).getFullYear() === 2026);
        
        console.log(`Pre-2020 data: ${pre2020Final.length} points`);
        console.log(`2025 data: ${year2025Data.length} points`);
        console.log(`2026 data: ${year2026Data.length} points`);
        console.log(`First chart point: ${filteredData[0].date} - Actual: $${filteredData[0].actualPrice}`);
        console.log(`Last chart point: ${filteredData[filteredData.length - 1].date} - Actual: $${filteredData[filteredData.length - 1].actualPrice}`);
        
        // Show some 2025 data if available
        if (year2025Data.length > 0) {
          console.log(`Sample 2025 data: ${year2025Data[0].date} - $${year2025Data[0].actualPrice}`);
        }
      }

      setChartData(filteredData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading chart data:', err);
      setError('Failed to load chart data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculateMonthlySavingsProjection = useCallback(() => {
    if (!monthlySavingsInputs.enabled || monthlySavingsInputs.monthlySavingsAmount <= 0 || monthlySavingsInputs.yearsToRetirement <= 0) {
      return [];
    }

    const projection: SavingsProjection[] = [];
    const startDate = new Date();
    let totalBitcoinAccumulated = 0;
    let totalCashInvested = 0;
    let currentMonthlySavings = monthlySavingsInputs.monthlySavingsAmount;

    // Calculate for each month over the specified years
    // Using Net Present Value approach - no wage growth adjustments
    for (let year = 0; year < monthlySavingsInputs.yearsToRetirement; year++) {

      // Determine if this year is a bear market using realistic cycle model
      // Bear market: first 2 years of each 4-year cycle
      // Align with actual calendar years to match withdrawal simulation
      const actualYear = startDate.getFullYear() + year;
      const cycleYear = (actualYear - 1) % 4; // 0, 1, 2, 3 within each 4-year cycle (same as withdrawal logic)
      const isBearMarketYear = cycleYear === 0 || cycleYear === 1; // Bear market in years 0 and 1
      
      for (let month = 0; month < 12; month++) {
        const projectionDate = new Date(startDate);
        projectionDate.setFullYear(startDate.getFullYear() + year);
        projectionDate.setMonth(startDate.getMonth() + month);

        // Calculate Bitcoin fair value for this future date
        const bitcoinFairValue = BitcoinPowerLaw.calculateFairValue(projectionDate);
        
        // Calculate realistic Bitcoin price based on cycle position (same logic as withdrawal simulation)
        let bitcoinCyclePrice;
        
        if (year === 0) {
          // For current year, use fair value (same as withdrawal simulation)
          bitcoinCyclePrice = bitcoinFairValue;
        } else {
          // For future years, apply cycle logic
          const floorValue = BitcoinPowerLaw.calculateFloorPrice(projectionDate);
          const upperBound = BitcoinPowerLaw.calculateUpperBound(projectionDate);
          
          switch (cycleYear) {
            case 0: // Year 1 of cycle: Deep bear market at floor
              bitcoinCyclePrice = floorValue;
              break;
            case 1: // Year 2 of cycle: Bear market recovery
              bitcoinCyclePrice = floorValue + (bitcoinFairValue - floorValue) * 0.75;
              break;
            case 2: // Year 3 of cycle: Bull market
              bitcoinCyclePrice = bitcoinFairValue + (upperBound - bitcoinFairValue) * 0.7;
              break;
            case 3: // Year 4 of cycle: Bull peak and correction
              bitcoinCyclePrice = bitcoinFairValue + (upperBound - bitcoinFairValue) * 0.3;
              break;
            default:
              bitcoinCyclePrice = bitcoinFairValue;
          }
        }
        
        // Determine actual monthly savings amount for this month
        let actualMonthlySavings = currentMonthlySavings;
        if (monthlySavingsInputs.doubleDownInBearMarkets && isBearMarketYear) {
          actualMonthlySavings = currentMonthlySavings * 2; // Double down during bear markets!
          
          // Debug logging for bear market doubling
          if (month === 0) { // Only log once per year
            console.log(`MONTHLY SAVINGS DEBUG - Year ${actualYear}:
              Cycle Year: ${cycleYear} (of 4-year cycle)
              Is Bear Market: ${isBearMarketYear}
              Base Monthly Amount: $${Math.round(currentMonthlySavings)}
              Doubled Monthly Amount: $${Math.round(actualMonthlySavings)}
              Expected Yearly Total: $${Math.round(actualMonthlySavings * 12)}
              Bitcoin Fair Value: $${bitcoinFairValue.toLocaleString()}
              Bitcoin Cycle Price: $${bitcoinCyclePrice.toLocaleString()}`);
          }
        }
        
        // Calculate how much Bitcoin can be purchased with this month's savings (using realistic cycle price)
        const bitcoinPurchased = actualMonthlySavings / bitcoinCyclePrice;
        totalBitcoinAccumulated += bitcoinPurchased;
        totalCashInvested += actualMonthlySavings;

        projection.push({
          year: year + 1,
          month: month + 1,
          monthlySavingsAmount: actualMonthlySavings,
          bitcoinFairValue: bitcoinFairValue,
          bitcoinCyclePrice: bitcoinCyclePrice,
          bitcoinPurchased: bitcoinPurchased,
          totalBitcoinAccumulated: totalBitcoinAccumulated,
          totalCashInvested: totalCashInvested
        });
      }
    }

    return projection;
  }, [monthlySavingsInputs.enabled, monthlySavingsInputs.monthlySavingsAmount, monthlySavingsInputs.yearsToRetirement, monthlySavingsInputs.doubleDownInBearMarkets]);

  // Memoize the monthly savings projection calculation
  const savingsProjection = useMemo(() => {
    return calculateMonthlySavingsProjection();
  }, [calculateMonthlySavingsProjection]);

  const calculateRetirementStatus = useCallback(() => {
    if (!currentPrice) return;

    // Use memoized monthly savings projection
    const projectedBitcoin = monthlySavingsInputs.enabled && savingsProjection.length > 0 
      ? savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated 
      : 0;
    
    const totalBitcoinHoldings = retirementInputs.bitcoinAmount + projectedBitcoin;
    
    // If monthly savings are enabled, evaluate retirement readiness at the planned retirement date
    const currentYear = new Date().getFullYear();
    const yearsToRetirement = monthlySavingsInputs.enabled ? monthlySavingsInputs.yearsToRetirement : 0;
    const evaluationYear = currentYear + yearsToRetirement;
    const evaluationDate = new Date(evaluationYear, 0, 1);
    
    // Calculate Bitcoin value at retirement date (not today)
    const bitcoinPriceAtRetirement = monthlySavingsInputs.enabled 
      ? BitcoinPowerLaw.calculateFairValue(evaluationDate)
      : currentPrice;
    
    const bitcoinValue = totalBitcoinHoldings * bitcoinPriceAtRetirement;
    const totalAssets = bitcoinValue + retirementInputs.cashAmount;

    console.log(`Retirement Status Evaluation:
      Evaluation Year: ${evaluationYear} (${yearsToRetirement} years from now)
      Bitcoin Price at Retirement: $${bitcoinPriceAtRetirement.toLocaleString()}
      Total Bitcoin Holdings: ${totalBitcoinHoldings.toFixed(4)} BTC
      Bitcoin Value at Retirement: $${bitcoinValue.toLocaleString()}
      Total Assets: $${totalAssets.toLocaleString()}`);
    
    // Test if withdrawal amount passes Bear Market Test at retirement date
    const bearMarketTestResult = testBearMarketSurvival(bitcoinPriceAtRetirement, evaluationYear, totalBitcoinHoldings, retirementInputs.annualWithdrawal, retirementInputs.cashAmount);
    
    console.log(`Retirement Analysis:
      Total Bitcoin Holdings: ${totalBitcoinHoldings.toFixed(4)} BTC
      Bitcoin Value: $${bitcoinValue.toLocaleString()}
      Cash Holdings: $${retirementInputs.cashAmount.toLocaleString()}
      Total Assets: $${totalAssets.toLocaleString()}
      Annual Withdrawal Need: $${retirementInputs.annualWithdrawal.toLocaleString()}
      Bear Market Test: ${bearMarketTestResult.passes ? 'PASSED' : 'FAILED'}`);
    
    // Results are logged above for debugging - no need to store in state
  }, [currentPrice, savingsProjection, monthlySavingsInputs.enabled, monthlySavingsInputs.yearsToRetirement, retirementInputs.bitcoinAmount, retirementInputs.annualWithdrawal, retirementInputs.cashAmount]);

  useEffect(() => {
    if (currentPrice && chartData.length > 0) {
      calculateRetirementStatus();
      calculateHistoricalRetirementDate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retirementInputs, monthlySavingsInputs, currentPrice, chartData, savingsProjection]);

  const calculateHistoricalRetirementDate = useCallback(() => {
    // Only calculate if we have withdrawal needs and either starting Bitcoin OR monthly savings plan
    const hasAssets = retirementInputs.bitcoinAmount > 0 || (monthlySavingsInputs.enabled && monthlySavingsInputs.monthlySavingsAmount > 0);
    if (!currentPrice || chartData.length === 0 || !hasAssets || retirementInputs.annualWithdrawal <= 0) {
      setHistoricalRetirementDate(null);
      return;
    }

    // Use the same logic as current retirement analysis for consistency
    // Include monthly savings projections in historical calculation
    const projectedBitcoin = monthlySavingsInputs.enabled && savingsProjection.length > 0 
      ? savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated 
      : 0;
    const totalBitcoinHoldings = retirementInputs.bitcoinAmount + projectedBitcoin;

    // Go backwards through historical data to find when they could have first retired
    // Only check actual price data (not future projections)
    const historicalData = chartData.filter(point => point.actualPrice !== null && point.actualPrice > 0).reverse();
    
    for (const dataPoint of historicalData) {
      // TypeScript type guard - we know actualPrice is not null due to filter above
      if (dataPoint.actualPrice === null) continue;
      
      // Use total Bitcoin holdings (original + projected from monthly savings)
      const year = new Date(dataPoint.date).getFullYear();
      
      // Test if they could retire at this historical point using Bear Market Test
      // This matches the logic used in current retirement analysis
      const bearMarketTestResult = testBearMarketSurvival(
        dataPoint.actualPrice, 
        year, 
        totalBitcoinHoldings, 
        retirementInputs.annualWithdrawal, 
        retirementInputs.cashAmount
      );
      
      // Use the same retirement criteria as current analysis
      if (bearMarketTestResult.passes) {
        setHistoricalRetirementDate(dataPoint);
        console.log(`Historical retirement date found: ${dataPoint.date} with Bitcoin at $${dataPoint.actualPrice.toLocaleString()}
          Total Bitcoin holdings: ${totalBitcoinHoldings.toFixed(4)} BTC (including ${projectedBitcoin.toFixed(4)} from monthly savings)
          Bear Market Test: PASSED`);
        return;
      }
    }
    
    // If no historical date found where they could retire
    setHistoricalRetirementDate(null);
    console.log('No historical retirement date found - Bear Market Test failed for all historical prices');
  }, [currentPrice, chartData, retirementInputs.bitcoinAmount, monthlySavingsInputs.enabled, monthlySavingsInputs.monthlySavingsAmount, retirementInputs.annualWithdrawal, savingsProjection, retirementInputs.cashAmount]);

  const testBearMarketSurvival = (bitcoinPrice: number, year: number, bitcoinHoldings: number, annualWithdrawal: number, cashHoldings: number = 0) => {
    if (bitcoinHoldings <= 0 || annualWithdrawal <= 0) return { passes: false };
    
    // Bear Market Test: Realistic 24-month bear market based on historical cycles
    // Strategy: Use cash during bear market to preserve Bitcoin
    
    let remainingBitcoin = bitcoinHoldings;
    let remainingCash = Math.max(0, cashHoldings);
    
    const targetDate = new Date(year, 0, 1);
    const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
    const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
    
    // Year 1: Deep bear market at Power Law floor (first 12 months)
    const deepBearPrice = floorValue;
    
    // Smart strategy: Use cash first during the crash
    if (remainingCash >= annualWithdrawal) {
      // Can cover entirely with cash - no Bitcoin sales needed!
      remainingCash -= annualWithdrawal;
    } else {
      // Use all remaining cash, then sell Bitcoin for the rest
      const remainingNeeded = annualWithdrawal - remainingCash;
      remainingCash = 0;
      const bitcoinToSell = remainingNeeded / deepBearPrice;
      remainingBitcoin -= bitcoinToSell;
      
      if (remainingBitcoin < 0) return { passes: false }; // Ran out of Bitcoin in year 1
    }
    
    // Year 2: Bear market recovery (second 12 months) - price between floor and fair value
    const bearRecoveryPrice = floorValue + (fairValue - floorValue) * 0.75; // 75% of way to fair value
    if (remainingCash >= annualWithdrawal) {
      remainingCash -= annualWithdrawal;
    } else {
      const remainingNeeded = annualWithdrawal - remainingCash;
      remainingCash = 0;
      const bitcoinToSell = remainingNeeded / bearRecoveryPrice;
      remainingBitcoin -= bitcoinToSell;
      
      if (remainingBitcoin < 0) return { passes: false }; // Ran out of Bitcoin in year 2
    }
    
    // Year 3: Back to fair value - check if remaining portfolio can last at least 20 more years
    const sustainablePrice = fairValue;
    const remainingBitcoinValue = remainingBitcoin * sustainablePrice;
    const totalRemainingValue = remainingBitcoinValue + remainingCash;
    
    // Simple sustainability check: Can the remaining portfolio last at least 20 years?
    // This is conservative but ensures long-term retirement security
    const yearsOfRunway = totalRemainingValue / annualWithdrawal;
    const minimumYearsRequired = 20; // Must survive bear market PLUS have 20 years runway
    
    return {
      passes: yearsOfRunway >= minimumYearsRequired,
      remainingBitcoin,
      remainingCash
    };
  };

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
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const simulate50YearWithdrawals = () => {
    // Only simulate if we have withdrawal needs and either starting Bitcoin OR monthly savings plan
    const hasAssets = retirementInputs.bitcoinAmount > 0 || (monthlySavingsInputs.enabled && monthlySavingsInputs.monthlySavingsAmount > 0);
    if (!currentPrice || !hasAssets || retirementInputs.annualWithdrawal <= 0) {
      return [];
    }

    const simulation = [];
    const currentYear = new Date().getFullYear();
    const yearsToRetirement = monthlySavingsInputs.enabled ? monthlySavingsInputs.yearsToRetirement : 0;
    const retirementStartYear = currentYear + yearsToRetirement;

    // Phase 1: Accumulation Phase (if monthly savings enabled)
    // Use the same calculation as retirement analysis for consistency
    const projectedBitcoin = monthlySavingsInputs.enabled && savingsProjection.length > 0 
      ? savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated 
      : 0;
    const totalCashInvested = monthlySavingsInputs.enabled && savingsProjection.length > 0 
      ? savingsProjection[savingsProjection.length - 1].totalCashInvested 
      : 0;
    
    let accumulatedBitcoin = retirementInputs.bitcoinAmount + projectedBitcoin;
    let cumulativeCashInvested = 0; // Track cumulative cash for table display
    
    if (monthlySavingsInputs.enabled && yearsToRetirement > 0) {
      // Group monthly projections by year for display
      const yearlyAggregation: {[year: number]: {bitcoinPurchased: number, cashInvested: number, endingBitcoin: number}} = {};
      
      // Process savings projection data to create yearly summaries
      for (const monthData of savingsProjection) {
        const actualYear = currentYear + monthData.year - 1; // Convert to actual year (monthData.year starts at 1, but we want year 0-based)
        if (!yearlyAggregation[actualYear]) {
          yearlyAggregation[actualYear] = {bitcoinPurchased: 0, cashInvested: 0, endingBitcoin: 0};
        }
        yearlyAggregation[actualYear].bitcoinPurchased += monthData.bitcoinPurchased;
        yearlyAggregation[actualYear].cashInvested += monthData.monthlySavingsAmount; // This is the actual monthly amount (including doubling)
        yearlyAggregation[actualYear].endingBitcoin = retirementInputs.bitcoinAmount + monthData.totalBitcoinAccumulated;
      }
      
      // Create simulation entries for each year using aggregated data with realistic cycles
      for (let year = 0; year < yearsToRetirement; year++) {
        const simulationYear = currentYear + year;
        const targetDate = new Date(simulationYear, 0, 1);
        const bitcoinFairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
        const yearData = yearlyAggregation[simulationYear];
        
        if (yearData) {
          cumulativeCashInvested += yearData.cashInvested;
          
          // Realistic Bitcoin cycles based on historical data:
          // 4-year cycles with proper phase distribution
          // Bear market: ~2 years, Bull market: ~1.5 years, Correction: ~0.5 years
          
          // Align with actual calendar years to match withdrawal simulation
          const cycleYear = (simulationYear - 1) % 4; // 0, 1, 2, 3 within each 4-year cycle (same as withdrawal logic)
          const isBearMarketYear = cycleYear === 0 || cycleYear === 1; // Bear market in years 0 and 1
          const cycleDate = new Date(simulationYear, 0, 1);
          const floorValue = BitcoinPowerLaw.calculateFloorPrice(cycleDate);
          const upperBound = BitcoinPowerLaw.calculateUpperBound(cycleDate);
          let cyclePrice;
          let cyclePhase = '';
          
          if (year === 0) {
            // For current year (2025), use fair value (same as withdrawal simulation)
            cyclePrice = bitcoinFairValue;
            cyclePhase = 'Current Year (Fair Value)';
          } else {
            // For future years, apply cycle logic
            switch (cycleYear) {
              case 0: // Year 1 of cycle: Deep bear market at floor
                cyclePrice = floorValue;
                cyclePhase = 'Deep Bear (Floor)';
                break;
              case 1: // Year 2 of cycle: Bear market recovery
                cyclePrice = floorValue + (bitcoinFairValue - floorValue) * 0.75;
                cyclePhase = 'Bear Market Recovery';
                break;
              case 2: // Year 3 of cycle: Bull market
                cyclePrice = bitcoinFairValue + (upperBound - bitcoinFairValue) * 0.7;
                cyclePhase = 'Bull Market';
                break;
              case 3: // Year 4 of cycle: Bull peak and correction
                cyclePrice = bitcoinFairValue + (upperBound - bitcoinFairValue) * 0.3;
                cyclePhase = 'Bull Peak & Correction';
                break;
              default:
                cyclePrice = bitcoinFairValue;
                cyclePhase = 'Fair Value';
            }
          }
          
          // Debug logging for all years to verify cycle alignment
          if (year === 0) { // Only log first year to verify alignment
            console.log(`🔄 CYCLE ALIGNMENT DEBUG - Year ${simulationYear}:
              Cycle Year: ${cycleYear} (of 4-year cycle) - ${cyclePhase}
              Bitcoin Fair Value: $${bitcoinFairValue.toLocaleString()}
              Bitcoin Cycle Price: $${cyclePrice.toLocaleString()}
              Is Bear Market: ${isBearMarketYear}
              Double Down Enabled: ${monthlySavingsInputs.doubleDownInBearMarkets}`);
          }
          
          // Create withdrawal source description with bear market indicator
          let withdrawalSource = `Investing $${Math.round(yearData.cashInvested).toLocaleString()}/year`;
          if (monthlySavingsInputs.doubleDownInBearMarkets && isBearMarketYear) {
            withdrawalSource += ' 🐻 (2x Bear Market!)';
          }
          
          simulation.push({
            year: simulationYear,
            yearNumber: year + 1,
            phase: 'ACCUMULATION',
            bitcoinPrice: cyclePrice,
            fairValue: bitcoinFairValue,
            priceToFairRatio: cyclePrice / bitcoinFairValue,
            cyclePhase: cyclePhase,
            annualWithdrawal: 0,
            withdrawalSource: withdrawalSource,
            cashUsed: 0,
            bitcoinSold: 0,
            bitcoinPurchased: yearData.bitcoinPurchased,
            remainingCash: retirementInputs.cashAmount,
            remainingBitcoin: yearData.endingBitcoin,
            remainingBitcoinValue: yearData.endingBitcoin * cyclePrice,
            totalRemainingValue: yearData.endingBitcoin * cyclePrice + retirementInputs.cashAmount,
            totalCashInvested: cumulativeCashInvested // Cumulative total for cash flow calculation
          });
        }
      }
      
      // Set final cumulative total for retirement phase display
      if (cumulativeCashInvested === 0) {
        cumulativeCashInvested = totalCashInvested; // Use final total if no accumulation phase
      }
    }

    // Phase 2: Withdrawal Phase (50 years of retirement)
    let remainingBitcoin = accumulatedBitcoin; // Now uses the same calculation as retirement analysis
    let remainingCash = retirementInputs.cashAmount;
    const baseAnnualWithdrawal = retirementInputs.annualWithdrawal;

    console.log(`50-Year Simulation:
      Accumulation Phase: ${yearsToRetirement} years
      Starting Bitcoin: ${retirementInputs.bitcoinAmount.toFixed(4)} BTC
      Projected Bitcoin from Savings: ${projectedBitcoin.toFixed(4)} BTC
      Total Bitcoin at retirement: ${accumulatedBitcoin.toFixed(4)} BTC
      Cash at retirement: $${remainingCash.toLocaleString()}
      Total Cash Invested: $${totalCashInvested.toLocaleString()}`);

    for (let year = 0; year < 50; year++) {
      const currentSimulationYear = retirementStartYear + year;
      const targetDate = new Date(currentSimulationYear, 0, 1);
      
      // Use the original withdrawal amount (not inflation-adjusted)
      // The Power Law model operates in its original context
      const annualWithdrawal = baseAnnualWithdrawal;
      
      // Calculate Bitcoin fair value
      const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
      
      // Simulate simple Bitcoin cycle phases (4-year cycles using standard Power Law bands)
      let bitcoinPrice;
      let cyclePhase = '';
      
      if (year === 0) {
        // For retirement year (year 0 of simulation), use fair value at retirement date
        bitcoinPrice = fairValue;
        cyclePhase = 'Retirement Start (Fair Value)';
      } else {
        // Realistic Bitcoin cycles based on historical data:
        // 4-year cycles with proper phase distribution
        // Bear market: ~2 years, Bull market: ~1.5 years, Correction: ~0.5 years
        
        const cycleYear = (year - 1) % 4; // 0, 1, 2, 3 within each 4-year cycle
        const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
        const upperBound = BitcoinPowerLaw.calculateUpperBound(targetDate);
        
        switch (cycleYear) {
          case 0: // Year 1 of cycle: Deep bear market at floor
            bitcoinPrice = floorValue;
            cyclePhase = 'Deep Bear (Floor)';
            break;
          case 1: // Year 2 of cycle: Bear market recovery
            bitcoinPrice = floorValue + (fairValue - floorValue) * 0.75;
            cyclePhase = 'Bear Market Recovery';
            break;
          case 2: // Year 3 of cycle: Bull market
            bitcoinPrice = fairValue + (upperBound - fairValue) * 0.7;
            cyclePhase = 'Bull Market';
            break;
          case 3: // Year 4 of cycle: Bull peak and correction
            bitcoinPrice = fairValue + (upperBound - fairValue) * 0.3;
            cyclePhase = 'Bull Peak & Correction';
            break;
          default:
            bitcoinPrice = fairValue;
            cyclePhase = 'Fair Value';
        }
      }
      
      // Calculate price ratio for all years
      const priceToFairRatio = bitcoinPrice / fairValue;
      
      // For retirement start year (year 0), show amounts BEFORE any withdrawals to match retirement analysis
      let withdrawalSource = '';
      let cashUsed = 0;
      let bitcoinSold = 0;
      
      // Determine actual withdrawal amount for this year
      let actualWithdrawal = annualWithdrawal;
      
      if (year === 0) {
        // Retirement start - show totals before any withdrawals (matches retirement analysis display)
        withdrawalSource = 'Retirement Start (No Withdrawal Yet)';
        // Keep remainingBitcoin and remainingCash unchanged to show starting amounts
        actualWithdrawal = 0; // No withdrawal in retirement start year
      } else {
        // Use enhanced Smart Withdrawal Strategy based on Power Law analysis
        const withdrawalDecision = SmartWithdrawalStrategy.calculateWithdrawal({
          currentBitcoinPrice: bitcoinPrice,
          currentDate: targetDate,
          availableCash: remainingCash,
          availableBitcoin: remainingBitcoin,
          withdrawalNeeded: actualWithdrawal
        });

        cashUsed = withdrawalDecision.useCashAmount;
        bitcoinSold = withdrawalDecision.useBitcoinAmount;
        remainingCash -= cashUsed;
        remainingBitcoin -= bitcoinSold;
        
        // Enhanced withdrawal source with strategy reasoning
        if (withdrawalDecision.useCashAmount > 0 && withdrawalDecision.useBitcoinAmount > 0) {
          const cashPercent = (cashUsed / actualWithdrawal * 100).toFixed(0);
          const bitcoinPercent = (100 - parseFloat(cashPercent)).toFixed(0);
          withdrawalSource = `${withdrawalDecision.strategy} (${cashPercent}%/${bitcoinPercent}%)`;
        } else if (withdrawalDecision.useCashAmount > 0) {
          withdrawalSource = withdrawalDecision.strategy;
        } else {
          withdrawalSource = withdrawalDecision.strategy;
        }

        // Check if we ran out of assets
        if (remainingBitcoin < 0) {
          remainingBitcoin = 0;
          withdrawalSource += ' (DEPLETED)';
        }
      }

      const remainingBitcoinValue = remainingBitcoin * bitcoinPrice;
      const totalRemainingValue = remainingBitcoinValue + remainingCash;

      simulation.push({
        year: currentSimulationYear,
        yearNumber: yearsToRetirement + year + 1, // Continue numbering from accumulation phase
        phase: year === 0 ? 'RETIREMENT START' : 'WITHDRAWAL',
        bitcoinPrice: bitcoinPrice,
        fairValue: fairValue,
        priceToFairRatio: priceToFairRatio,
        cyclePhase: cyclePhase,
        annualWithdrawal: actualWithdrawal,
        withdrawalSource: withdrawalSource,
        cashUsed: cashUsed,
        bitcoinSold: bitcoinSold,
        bitcoinPurchased: 0,
        remainingCash: remainingCash,
        remainingBitcoin: remainingBitcoin,
        remainingBitcoinValue: remainingBitcoinValue,
        totalRemainingValue: totalRemainingValue,
        totalCashInvested: cumulativeCashInvested // Use final cumulative total for retirement phase
      });

      // Stop simulation if depleted
      if (remainingBitcoin <= 0 && remainingCash <= 0) {
        break;
      }
    }

    return simulation;
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
        <h2>Bitcoin Price and Power Law Model</h2>
        {lastUpdated && (
          <div style={{ 
            fontSize: '12px', 
            color: '#999', 
            marginBottom: '10px' 
          }}>
            Last updated: {lastUpdated.toLocaleString()}
          </div>
        )}
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

      {/* Chart moved before inputs */}
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={700}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 60, bottom: 40 }}>
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
                      <p><strong>Bear Market Strategy Active:</strong> Doubling savings every 4th year (years with cycle year 0) to maximize Bitcoin accumulation during low prices!</p>
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
        const simulation = simulate50YearWithdrawals();
        if (simulation.length === 0) return null;
        
        const simulationSucceeds = simulation.length >= 50 && 
          simulation[simulation.length - 1].remainingBitcoin > 0 &&
          simulation[simulation.length - 1].totalRemainingValue > 0;
        
        return (
          <div className="retirement-status">
            <div className="status-header">
              <h4>📊 Retirement Analysis</h4>
              <div className={`status-indicator ${simulationSucceeds ? 'can-retire' : 'cannot-retire'}`}>
                {simulationSucceeds ? '✅ Ready to Retire!' : '⏳ Keep Building...'}
              </div>
              

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
                  const retirementYear = currentYear + monthlySavingsInputs.yearsToRetirement;
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
                    <h4>🎉 Congratulations! {monthlySavingsInputs.enabled ? `You can retire in ${monthlySavingsInputs.yearsToRetirement} year${monthlySavingsInputs.yearsToRetirement === 1 ? '' : 's'}!` : 'You can retire today!'}</h4>
                    <p>The 50-year simulation confirms your assets will sustain your retirement with realistic Bitcoin cycles{monthlySavingsInputs.enabled ? ` starting ${new Date().getFullYear() + monthlySavingsInputs.yearsToRetirement}` : ''}!</p>
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
        const simulation = simulate50YearWithdrawals();
        if (simulation.length === 0) return null;
        
        const simulationSucceeds = simulation.length >= 50 && 
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
                <strong>Assets will be depleted in year {actualYearsLasting}</strong> when accounting for realistic Bitcoin cycles.
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
            const simulation = simulate50YearWithdrawals();
            
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
                          row.annualWithdrawal;
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