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
import { ChartDataPoint, RetirementInputs, RetirementStatus, PowerLawMetrics, MonthlySavingsInputs, SavingsProjection } from '../types/Bitcoin';

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
    bitcoinAmount: 1.0,
    cashAmount: 10000,
    annualWithdrawal: 60000
  });
  const [monthlySavingsInputs, setMonthlySavingsInputs] = useState<MonthlySavingsInputs>({
    monthlySavingsAmount: 1000,
    yearsToRetirement: 10,
    enabled: false,
    doubleDownInBearMarkets: false
  });
  const [retirementStatus, setRetirementStatus] = useState<RetirementStatus | null>(null);
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
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading chart data:', err);
      setError('Failed to load chart data. Please try again.');
    } finally {
      setLoading(false);
    }
  };



  const calculateMonthlySavingsProjection = () => {
    if (!monthlySavingsInputs.enabled || monthlySavingsInputs.monthlySavingsAmount <= 0 || monthlySavingsInputs.yearsToRetirement <= 0) {
      return [];
    }

    const projection: SavingsProjection[] = [];
    const startDate = new Date();
    let totalBitcoinAccumulated = 0;
    let totalCashInvested = 0;
    let currentMonthlySavings = monthlySavingsInputs.monthlySavingsAmount;

    // Calculate for each month over the specified years
    for (let year = 0; year < monthlySavingsInputs.yearsToRetirement; year++) {
      // Apply 4% wage growth at the start of each year (official inflation rate)
      if (year > 0) {
        currentMonthlySavings *= 1.04; // 4% annual wage growth
      }

      // Determine if this year is a bear market (every 4th year starting from year 3)
      // Align with simulation cycles: year 3, 7, 11, etc. are bear markets
      const cycleYear = year % 4;
      const isBearMarketYear = cycleYear === 3;
      
      for (let month = 0; month < 12; month++) {
        const projectionDate = new Date(startDate);
        projectionDate.setFullYear(startDate.getFullYear() + year);
        projectionDate.setMonth(startDate.getMonth() + month);

        // Calculate Bitcoin fair value for this future date
        const bitcoinFairValue = BitcoinPowerLaw.calculateFairValue(projectionDate);
        
        // Determine actual monthly savings amount for this month
        let actualMonthlySavings = currentMonthlySavings;
        if (monthlySavingsInputs.doubleDownInBearMarkets && isBearMarketYear) {
          actualMonthlySavings = currentMonthlySavings * 2; // Double down during bear markets!
          
          // Debug logging for bear market doubling
          if (month === 0) { // Only log once per year
            console.log(`🐻 MONTHLY SAVINGS DEBUG - Year ${year + 1} (${new Date().getFullYear() + year}):
              Cycle Year: ${cycleYear}
              Is Bear Market: ${isBearMarketYear}
              Base Monthly Amount: $${Math.round(currentMonthlySavings)}
              Doubled Monthly Amount: $${Math.round(actualMonthlySavings)}
              Expected Yearly Total: $${Math.round(actualMonthlySavings * 12)}`);
          }
        }
        
        // Calculate how much Bitcoin can be purchased with this month's savings
        const bitcoinPurchased = actualMonthlySavings / bitcoinFairValue;
        totalBitcoinAccumulated += bitcoinPurchased;
        totalCashInvested += actualMonthlySavings;

        projection.push({
          year: year + 1,
          month: month + 1,
          monthlySavingsAmount: actualMonthlySavings,
          bitcoinFairValue: bitcoinFairValue,
          bitcoinPurchased: bitcoinPurchased,
          totalBitcoinAccumulated: totalBitcoinAccumulated,
          totalCashInvested: totalCashInvested
        });
      }
    }

    return projection;
  };

  // Memoize the monthly savings projection calculation
  const savingsProjection = useMemo(() => {
    return calculateMonthlySavingsProjection();
  }, [monthlySavingsInputs.enabled, monthlySavingsInputs.monthlySavingsAmount, monthlySavingsInputs.yearsToRetirement, monthlySavingsInputs.doubleDownInBearMarkets]);

  const calculateRetirementStatus = () => {
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
    
    // Calculate SWR based on market conditions only (not portfolio size)
    const marketConditions = calculateMarketBasedSWR(bitcoinPriceAtRetirement, evaluationYear);
    
    // Bitcoin has crash risk and needs SWR based on Power Law position
    const BITCOIN_SWR = marketConditions.bitcoinRate; // Based on Power Law position only
    
    // Cash doesn't have "SWR" - it has inflation decay (~6%/year) but no overnight crash risk
    // For retirement planning, we can use cash as needed since it's stable
    // The "safe withdrawal" concept only applies to the Bitcoin portion
    
    // Calculate sustainable annual withdrawal
    // Only Bitcoin provides sustainable annual income (based on Power Law growth)
    // Cash is a one-time buffer, not sustainable annual income
    const bitcoinSafeWithdrawal = bitcoinValue * BITCOIN_SWR;
    const sustainableAnnualWithdrawal = bitcoinSafeWithdrawal; // Only Bitcoin is sustainable annually
    const effectiveSWR = sustainableAnnualWithdrawal / totalAssets;
    
        // Debug logging for withdrawal calculation
    console.log(`🔢 Sustainable Annual Withdrawal Calculation:
      Base Bitcoin Holdings: ${retirementInputs.bitcoinAmount.toFixed(4)} BTC
      Projected Bitcoin from Savings: ${projectedBitcoin.toFixed(4)} BTC
      Total Bitcoin Holdings: ${totalBitcoinHoldings.toFixed(4)} BTC
      Bitcoin Value: $${bitcoinValue.toLocaleString()}
      Cash Holdings: $${retirementInputs.cashAmount.toLocaleString()}
      Total Assets: $${totalAssets.toLocaleString()}
      
      Bitcoin SWR: ${(BITCOIN_SWR * 100).toFixed(1)}%
      Bitcoin Sustainable Annual Withdrawal: $${bitcoinSafeWithdrawal.toLocaleString()}
      Cash: $${retirementInputs.cashAmount.toLocaleString()} (ONE-TIME buffer, not annual income)
      
      Total Sustainable Annual Withdrawal: $${sustainableAnnualWithdrawal.toLocaleString()}
      Effective SWR: ${(effectiveSWR * 100).toFixed(1)}%
      
      IMPORTANT: Cash is NOT sustainable annual income - it depletes if used!`);
     
         // Test if withdrawal amount passes Bear Market Test at retirement date
    // Using the original withdrawal amount (not inflation-adjusted)
    const bearMarketTestResult = testBearMarketSurvival(bitcoinPriceAtRetirement, evaluationYear, totalBitcoinHoldings, retirementInputs.annualWithdrawal, retirementInputs.cashAmount);
    
    // Check if we can retire: Either sustainable withdrawal covers needs, OR Bear Market Test passes with cash strategy
    const canRetireWithSustainableIncome = sustainableAnnualWithdrawal >= retirementInputs.annualWithdrawal;
    const canRetireWithBearMarketStrategy = bearMarketTestResult.passes;
    
    // Smart retirement strategy simulation
    const retirementSimulation = simulateSmartRetirement();
    
    setRetirementStatus({
      canRetire: canRetireWithSustainableIncome || canRetireWithBearMarketStrategy,
      totalAssets,
      safeWithdrawalRate: effectiveSWR,
      retirementDate: retirementSimulation.retirementDate,
      retirementDataPoint: retirementSimulation.retirementDataPoint,
      riskLevel: marketConditions.riskLevel,
      powerLawMetrics: marketConditions.powerLawMetrics
    });
  };

  useEffect(() => {
    if (currentPrice && chartData.length > 0) {
      calculateRetirementStatus();
      calculateHistoricalRetirementDate();
    }
  }, [retirementInputs, monthlySavingsInputs, currentPrice, chartData, savingsProjection]);

  const calculateHistoricalRetirementDate = () => {
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
      const bitcoinValue = totalBitcoinHoldings * dataPoint.actualPrice;
      const totalAssets = bitcoinValue + retirementInputs.cashAmount;
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
  };

  const calculateBearMarketSWR = (bitcoinPrice: number, year: number, bitcoinHoldings: number, annualWithdrawal: number, cashHoldings: number = 0) => {
    // Note: This function is deprecated - new logic treats cash as buffer, not SWR-based asset
    // Kept for compatibility with existing retirement simulation code
    
    // Calculate Power Law bands for the given date
    const targetDate = new Date(year, 0, 1);
    const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
    const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
    const ceilingValue = BitcoinPowerLaw.calculateUpperBound(targetDate);
    
    // Determine position in Power Law bands
    const fairValueRatio = bitcoinPrice / fairValue;
    const floorRatio = bitcoinPrice / floorValue;
    const ceilingRatio = bitcoinPrice / ceilingValue;
    
    // Determine risk level for display
    let riskLevel: string;
    if (ceilingRatio >= 1.0) {
      riskLevel = "🔴 EXTREME RISK - Above Power Law Ceiling";
    } else if (fairValueRatio >= 1.8) {
      riskLevel = "🟠 VERY HIGH RISK - Approaching Ceiling";
    } else if (fairValueRatio >= 1.4) {
      riskLevel = "🟡 HIGH RISK - Overextended";
    } else if (fairValueRatio >= 1.1) {
      riskLevel = "🟢 MODERATE RISK - Fair Value Zone";
    } else if (fairValueRatio >= 0.8) {
      riskLevel = "🔵 LOW RISK - Undervalued";
    } else if (floorRatio >= 1.2) {
      riskLevel = "🟣 VERY LOW RISK - Deep Value";
    } else {
      riskLevel = "🚀 MINIMAL RISK - At Power Law Floor";
    }
    
    // Realistic Bear Market Test with Cash Strategy: Can we survive using both Bitcoin and cash strategically?
    // Scenario: 60% crash for 1 year, then gradual recovery to fair value over 2 years
    // Strategy: Use cash during bear market to preserve Bitcoin, only sell Bitcoin when necessary
    
    const bearMarketSurvivalTest = (): boolean => {
      if (bitcoinHoldings <= 0 || annualWithdrawal <= 0) return false;
      
      let remainingBitcoin = bitcoinHoldings;
              // Use the actual cash holdings passed to the function
        let remainingCash = Math.max(0, cashHoldings);
      
      // Year 1: Evolving crash severity - less severe as Bitcoin matures
      const floorRatio = calculateEvolvingFloorRatio(year);
      const crashPrice = fairValue * floorRatio; // Use evolving floor instead of static 60% drop
      
      // Smart strategy: Use cash first during the crash
      if (remainingCash >= annualWithdrawal) {
        // Can cover entirely with cash - no Bitcoin sales needed!
        remainingCash -= annualWithdrawal;
      } else {
        // Use all remaining cash, then sell Bitcoin for the rest
        const cashUsed = remainingCash;
        const bitcoinNeeded = annualWithdrawal - cashUsed;
        remainingCash = 0;
        
        const year1BitcoinSold = bitcoinNeeded / crashPrice;
        remainingBitcoin -= year1BitcoinSold;
        
        if (remainingBitcoin <= 0) {
          return false; // Ran out of Bitcoin
        }
      }
      
      // Year 2: Gradual recovery - continue strategic cash/Bitcoin usage
      const year2Date = new Date(year + 1, 0, 1);
      const year2FairValue = BitcoinPowerLaw.calculateFairValue(year2Date);
      const year2Price = year2FairValue * 0.7; // Still below fair value but recovering
      
      // Smart strategy: Still prefer cash if available, but Bitcoin prices are better
      if (remainingCash >= annualWithdrawal) {
        // Can still cover with cash
        remainingCash -= annualWithdrawal;
      } else {
        // Use remaining cash + Bitcoin
        const cashUsed = remainingCash;
        const bitcoinNeeded = annualWithdrawal - cashUsed;
        remainingCash = 0;
        
        const year2BitcoinSold = bitcoinNeeded / year2Price;
        remainingBitcoin -= year2BitcoinSold;
        
        if (remainingBitcoin <= 0) {
          return false; // Ran out of Bitcoin
        }
      }
      
      // Year 3: Full recovery to fair value - check long-term sustainability
      const year3Date = new Date(year + 2, 0, 1);
      const year3FairValue = BitcoinPowerLaw.calculateFairValue(year3Date);
      const year3BitcoinValue = remainingBitcoin * year3FairValue;
      const year3TotalPortfolio = year3BitcoinValue + remainingCash;
      
      // Check if we can sustain ongoing withdrawals
      const year4Date = new Date(year + 3, 0, 1);
      const year4FairValue = BitcoinPowerLaw.calculateFairValue(year4Date);
      const rawPowerLawGrowthRate = (year4FairValue - year3FairValue) / year3FairValue;
      
      // Use raw Power Law growth rate as designed (no artificial floors)
      const powerLawGrowthRate = rawPowerLawGrowthRate;
      
      // Use 70% of Power Law growth rate as sustainable withdrawal rate on Bitcoin portion
      const sustainableWithdrawalRate = powerLawGrowthRate * 0.7;
      const sustainableBitcoinWithdrawal = year3BitcoinValue * sustainableWithdrawalRate;
      
      // Add cash withdrawal capacity (can withdraw up to 10% of remaining cash annually)
      const sustainableCashWithdrawal = remainingCash * 0.10;
      const totalSustainableWithdrawal = sustainableBitcoinWithdrawal + sustainableCashWithdrawal;
      
      return totalSustainableWithdrawal >= annualWithdrawal;
    };
    
    // Test if we can survive the bear market scenario with current withdrawal needs
    const canSurviveBearMarket = bearMarketSurvivalTest();
    
    // Calculate current portfolio value and implied SWR
    const currentPortfolioValue = bitcoinHoldings * bitcoinPrice;
    const impliedSWR = currentPortfolioValue > 0 ? annualWithdrawal / currentPortfolioValue : 0;
    
    // If we can survive the bear market test, use the implied SWR, otherwise use conservative rate
    let optimalSWR: number;
    if (canSurviveBearMarket) {
      // Can survive bear market test - use implied SWR but cap it reasonably
      optimalSWR = Math.min(impliedSWR, 0.15); // Cap at 15%
    } else {
      // Can't survive bear market test - use conservative 4% rate
      // If the full bear market test fails, we should be very conservative
      optimalSWR = 0.04; // Use traditional 4% rate as fallback
    }
    
    // Cap at reasonable maximum (15%) even if math allows higher
    const cappedSWR = Math.min(optimalSWR, 0.15);
    
    console.log(`Bear Market SWR Analysis for ${year}:
      Bitcoin Price: $${bitcoinPrice.toLocaleString()}
      Fair Value: $${fairValue.toLocaleString()} (${fairValueRatio.toFixed(2)}x)
      Floor Value: $${floorValue.toLocaleString()} (${floorRatio.toFixed(2)}x)
      Ceiling Value: $${ceilingValue.toLocaleString()} (${ceilingRatio.toFixed(2)}x)
      Bitcoin Holdings: ${bitcoinHoldings.toFixed(4)} BTC
      Annual Withdrawal: $${annualWithdrawal.toLocaleString()}
      Current Portfolio Value: $${currentPortfolioValue.toLocaleString()}
      Implied SWR: ${(impliedSWR * 100).toFixed(1)}%
      Can Survive Bear Market Test: ${canSurviveBearMarket}
      Final SWR: ${(cappedSWR * 100).toFixed(1)}%
      ${riskLevel}
      Test: Survives 60% crash + 2-year recovery + Power Law growth`);
    
    return {
      cashRate: 0.10, // Deprecated: kept for compatibility
      bitcoinRate: cappedSWR,
      floorSurvivalRate: optimalSWR,
      riskLevel: riskLevel,
      powerLawMetrics: {
        fairValueRatio,
        floorRatio,
        ceilingRatio,
        fairValue,
        floorValue,
        ceilingValue
      }
    };
  };

  const calculateMarketBasedSWR = (bitcoinPrice: number, year: number) => {
    // Calculate Power Law bands for the given date
    const targetDate = new Date(year, 0, 1);
    const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
    const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
    const ceilingValue = BitcoinPowerLaw.calculateUpperBound(targetDate);
    
    // Determine position in Power Law bands
    const fairValueRatio = bitcoinPrice / fairValue;
    const floorRatio = bitcoinPrice / floorValue;
    const ceilingRatio = bitcoinPrice / ceilingValue;
    
    // Determine risk level for display
    let riskLevel: string;
    if (ceilingRatio >= 1.0) {
      riskLevel = "🔴 EXTREME RISK - Above Power Law Ceiling";
    } else if (fairValueRatio >= 1.8) {
      riskLevel = "🟠 VERY HIGH RISK - Approaching Ceiling";
    } else if (fairValueRatio >= 1.4) {
      riskLevel = "🟡 HIGH RISK - Overextended";
    } else if (fairValueRatio >= 1.1) {
      riskLevel = "🟢 MODERATE RISK - Fair Value Zone";
    } else if (fairValueRatio >= 0.8) {
      riskLevel = "🔵 LOW RISK - Undervalued";
    } else if (floorRatio >= 1.2) {
      riskLevel = "🟣 VERY LOW RISK - Deep Value";
    } else {
      riskLevel = "🚀 MINIMAL RISK - At Power Law Floor";
    }
    
    // Calculate Power Law-based Bitcoin SWR (based on market conditions only)
    // Calculate annual growth rate by comparing this year's fair value to next year's
    const nextYearDate = new Date(year + 1, 0, 1);
    const currentFairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
    const nextYearFairValue = BitcoinPowerLaw.calculateFairValue(nextYearDate);
    const rawPowerLawGrowthRate = (nextYearFairValue - currentFairValue) / currentFairValue;
    
    // Use raw Power Law growth rate as designed (no artificial floors)
    const powerLawGrowthRate = rawPowerLawGrowthRate;
    
    // Apply 70% safety factor and cap at 15% maximum
    const uncappedBitcoinSWR = powerLawGrowthRate * 0.7;
    const bitcoinSWR = Math.min(uncappedBitcoinSWR, 0.15); // Cap at 15% maximum
    
    // Debug logging
    console.log(`📊 SWR Calculation Debug for ${year}:
      Bitcoin Price: $${bitcoinPrice.toLocaleString()}
      Current Fair Value: $${currentFairValue.toLocaleString()}
      Next Year Fair Value: $${nextYearFairValue.toLocaleString()}
      Raw Power Law Growth Rate: ${(rawPowerLawGrowthRate * 100).toFixed(1)}%
      Power Law Growth Rate: ${(powerLawGrowthRate * 100).toFixed(1)}%
      70% Safety Factor: ${(uncappedBitcoinSWR * 100).toFixed(1)}%
      Final Bitcoin SWR: ${(bitcoinSWR * 100).toFixed(1)}%
      Fair Value Ratio: ${fairValueRatio.toFixed(2)}x
      Risk Level: ${riskLevel}`)
    
    return {
      bitcoinRate: bitcoinSWR,
      riskLevel,
      powerLawMetrics: {
        fairValue,
        floorValue,
        ceilingValue,
        fairValueRatio,
        floorRatio,
        ceilingRatio
      }
    };
  };

  const testBearMarketSurvival = (bitcoinPrice: number, year: number, bitcoinHoldings: number, annualWithdrawal: number, cashHoldings: number = 0) => {
    if (bitcoinHoldings <= 0 || annualWithdrawal <= 0) return { passes: false };
    
    // Bear Market Test: 60% crash for 1 year, then gradual recovery over 2 years
    // Strategy: Use cash during bear market to preserve Bitcoin
    
    let remainingBitcoin = bitcoinHoldings;
    let remainingCash = Math.max(0, cashHoldings);
    
    const targetDate = new Date(year, 0, 1);
    const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
    
    // Year 1: Evolving crash severity - less severe as Bitcoin matures
    const floorRatio = calculateEvolvingFloorRatio(year);
    const crashPrice = fairValue * floorRatio; // Use evolving floor instead of static 60% drop
    
    // Smart strategy: Use cash first during the crash
    if (remainingCash >= annualWithdrawal) {
      // Can cover entirely with cash - no Bitcoin sales needed!
      remainingCash -= annualWithdrawal;
    } else {
      // Use all remaining cash, then sell Bitcoin for the rest
      const remainingNeeded = annualWithdrawal - remainingCash;
      remainingCash = 0;
      const bitcoinToSell = remainingNeeded / crashPrice;
      remainingBitcoin -= bitcoinToSell;
      
      if (remainingBitcoin < 0) return { passes: false }; // Ran out of Bitcoin in year 1
    }
    
    // Year 2: Recovery year - gradual recovery using evolving floor
    const recoveryPrice = (fairValue * floorRatio + fairValue) / 2; // Halfway between floor and fair value
    if (remainingCash >= annualWithdrawal) {
      remainingCash -= annualWithdrawal;
    } else {
      const remainingNeeded = annualWithdrawal - remainingCash;
      remainingCash = 0;
      const bitcoinToSell = remainingNeeded / recoveryPrice;
      remainingBitcoin -= bitcoinToSell;
      
      if (remainingBitcoin < 0) return { passes: false }; // Ran out of Bitcoin in year 2
    }
    
    // Year 3: Back to fair value - check long-term sustainability
    const sustainablePrice = fairValue;
    // Calculate Power Law growth rate for sustainability check
    const nextYearDate = new Date(year + 1, 0, 1);
    const currentFairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
    const nextYearFairValue = BitcoinPowerLaw.calculateFairValue(nextYearDate);
    const rawPowerLawGrowthRate = (nextYearFairValue - currentFairValue) / currentFairValue;
    
          // Use raw Power Law growth rate as designed (no artificial floors)
      const powerLawGrowthRate = rawPowerLawGrowthRate;
    const conservativeSWR = powerLawGrowthRate * 0.7; // 70% of growth rate for safety
    
    const remainingBitcoinValue = remainingBitcoin * sustainablePrice;
    // Cash is available as buffer - for sustainability check, assume it can cover some ongoing needs
    // but primarily Bitcoin should provide the sustainable income
    const sustainableAnnualWithdrawal = remainingBitcoinValue * conservativeSWR + remainingCash * 0.05; // Very conservative 5% on remaining cash
    
    return {
      passes: sustainableAnnualWithdrawal >= annualWithdrawal,
      remainingBitcoin,
      remainingCash
    };
  };

  const simulateSmartRetirement = () => {
    if (retirementInputs.bitcoinAmount <= 0 || chartData.length === 0) {
      return { canRetire: false };
    }

    const monthlyWithdrawal = retirementInputs.annualWithdrawal / 12;
    
    // Start simulation from today
    const today = new Date();
    const currentDataPoint = chartData.find(point => 
      point.actualPrice !== null && 
      Math.abs(new Date(point.date).getTime() - today.getTime()) < 30 * 24 * 60 * 60 * 1000 // Within 30 days
    ) || chartData[chartData.length - 1];
    
    if (!currentDataPoint) return { canRetire: false };
    
    // Current portfolio state
    let remainingCash = retirementInputs.cashAmount;
    let remainingBitcoin = retirementInputs.bitcoinAmount;
    let currentBitcoinPrice = currentPrice || currentDataPoint.powerLawPrice;
    
    // Check if we can retire today using Bear Market Test
    const currentYear = today.getFullYear();
    const currentRates = calculateBearMarketSWR(currentBitcoinPrice, currentYear, remainingBitcoin, retirementInputs.annualWithdrawal, remainingCash);
    
    // Calculate weighted safe withdrawal rate based on asset allocation
    const bitcoinValue = remainingBitcoin * currentBitcoinPrice;
    const totalCurrentValue = remainingCash + bitcoinValue;
    const bitcoinWeight = bitcoinValue / totalCurrentValue;
    const cashWeight = remainingCash / totalCurrentValue;
    
    const blendedWithdrawalRate = (bitcoinWeight * currentRates.bitcoinRate) + (cashWeight * currentRates.cashRate);
    const safeAnnualWithdrawal = totalCurrentValue * blendedWithdrawalRate;
    
    if (safeAnnualWithdrawal >= retirementInputs.annualWithdrawal) {
      return { canRetire: true };
    }

    // Simulate future months to find retirement date
    const futureData = chartData.filter(point => new Date(point.date) > today).sort((a, b) => a.timestamp - b.timestamp);
    
    for (let i = 0; i < futureData.length; i++) {
      const dataPoint = futureData[i];
      const bitcoinPrice = dataPoint.powerLawPrice;
      const currentSimulationYear = new Date(dataPoint.date).getFullYear();
      
      // Calculate months between data points (approximately)
      const monthsElapsed = i === 0 ? 1 : 
        Math.max(1, Math.round((dataPoint.timestamp - futureData[i-1].timestamp) / (30 * 24 * 60 * 60 * 1000)));
      
      // Smart spending strategy for each month in this period
      for (let month = 0; month < monthsElapsed && (remainingCash > 0 || remainingBitcoin > 0); month++) {
        const portfolioValue = remainingCash + (remainingBitcoin * bitcoinPrice);
        
        // Calculate dynamic withdrawal rates for this year using Bear Market Test
        const yearRates = calculateBearMarketSWR(bitcoinPrice, currentSimulationYear, remainingBitcoin, retirementInputs.annualWithdrawal, remainingCash);
        const bitcoinWeight = (remainingBitcoin * bitcoinPrice) / portfolioValue;
        const cashWeight = remainingCash / portfolioValue;
        const blendedRate = (bitcoinWeight * yearRates.bitcoinRate) + (cashWeight * yearRates.cashRate);
        
        // Check if we can retire at this point
        if (portfolioValue * blendedRate >= retirementInputs.annualWithdrawal) {
          console.log(`Smart retirement simulation found retirement date: ${dataPoint.date}
            Remaining cash: $${remainingCash.toLocaleString()}
            Remaining Bitcoin: ${remainingBitcoin.toFixed(4)} BTC
            Bitcoin price: $${bitcoinPrice.toLocaleString()}
            Portfolio value: $${portfolioValue.toLocaleString()}
            Blended withdrawal rate: ${(blendedRate * 100).toFixed(2)}%
            Safe annual withdrawal: $${(portfolioValue * blendedRate).toLocaleString()}`);
          
          return {
            canRetire: false, // Will be true when we find the date
            retirementDate: dataPoint.date,
            retirementDataPoint: dataPoint
          };
        }
        
                 // Smart spending strategy:
         // Determine if Bitcoin is above or below fair value
         // For future projections, we'll assume Bitcoin cycles around fair value
         // We'll use a simple model: Bitcoin is "below fair value" 60% of the time, "above" 40% of the time
         const currentFairValueRatio = currentPrice && currentDataPoint ? currentPrice / currentDataPoint.powerLawPrice : 1;
         const isCurrentlyBelowFair = currentFairValueRatio < 1;
         
         // For future dates, simulate market cycles
         // Assume Bitcoin spends more time below fair value (accumulation phase) than above (distribution phase)
         const daysSinceToday = Math.floor((dataPoint.timestamp - today.getTime()) / (24 * 60 * 60 * 1000));
         const cyclePosition = (daysSinceToday % 1460) / 1460; // 4-year cycle
         const isBelowFairValue = isCurrentlyBelowFair ? 
           (cyclePosition < 0.7) : // If currently below, assume 70% of time below fair
           (cyclePosition < 0.5);  // If currently above, assume 50% of time below fair
         
         if (isBelowFairValue) {
           // Below fair value - spend cash first (HODLing strategy)
           if (remainingCash >= monthlyWithdrawal) {
             remainingCash -= monthlyWithdrawal;
           } else {
             // Not enough cash, must sell Bitcoin
             const cashShortfall = monthlyWithdrawal - remainingCash;
             const bitcoinToSell = cashShortfall / bitcoinPrice;
             remainingCash = 0;
             remainingBitcoin = Math.max(0, remainingBitcoin - bitcoinToSell);
           }
         } else {
           // Above fair value - sell Bitcoin first (taking profits)
           const bitcoinToSell = monthlyWithdrawal / bitcoinPrice;
           if (remainingBitcoin >= bitcoinToSell) {
             remainingBitcoin -= bitcoinToSell;
           } else {
             // Not enough Bitcoin, use remaining Bitcoin + cash
             const bitcoinValue = remainingBitcoin * bitcoinPrice;
             const cashNeeded = monthlyWithdrawal - bitcoinValue;
             remainingBitcoin = 0;
             remainingCash = Math.max(0, remainingCash - cashNeeded);
           }
         }
        
        // If we run out of both assets, retirement is not possible
        if (remainingCash <= 0 && remainingBitcoin <= 0) {
          return { canRetire: false };
        }
      }
    }
    
    // If we made it through the entire simulation with assets remaining, 
    // but never hit the safe withdrawal threshold, return the last viable date
    if (remainingCash > 0 || remainingBitcoin > 0) {
      const lastDataPoint = futureData[futureData.length - 1];
      const finalPortfolioValue = remainingCash + (remainingBitcoin * lastDataPoint.powerLawPrice);
      const finalYear = new Date(lastDataPoint.date).getFullYear();
      const finalRates = calculateBearMarketSWR(lastDataPoint.powerLawPrice, finalYear, remainingBitcoin, retirementInputs.annualWithdrawal, remainingCash);
      
      const finalBitcoinWeight = (remainingBitcoin * lastDataPoint.powerLawPrice) / finalPortfolioValue;
      const finalCashWeight = remainingCash / finalPortfolioValue;
      const finalBlendedRate = (finalBitcoinWeight * finalRates.bitcoinRate) + (finalCashWeight * finalRates.cashRate);
      
      if (finalPortfolioValue * finalBlendedRate >= retirementInputs.annualWithdrawal) {
        return {
          canRetire: false,
          retirementDate: lastDataPoint.date,
          retirementDataPoint: lastDataPoint
        };
      }
    }
    
    return { canRetire: false };
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

  const getRiskExplanation = (fairValueRatio: number): string => {
    if (fairValueRatio >= 2.0) {
      return "Above Power Law ceiling - SWR calculated to survive realistic 60% crash bear market. Historical data shows major corrections from this level. Bear Market Test provides robust protection.";
    } else if (fairValueRatio >= 1.8) {
      return "Approaching Power Law ceiling - SWR stress-tested against 60% crash scenario. This level has historically led to significant corrections. Bear Market methodology ensures cycle protection.";
    } else if (fairValueRatio >= 1.4) {
      return "Significantly above fair value - Bear Market Test applied. Historically leads to 40-60% corrections. SWR designed to survive 2-year recovery cycle.";
    } else if (fairValueRatio >= 1.1) {
      return "Near fair value - Bear Market SWR calculated. Normal volatility expected, but protected against realistic crash and recovery scenarios.";
    } else if (fairValueRatio >= 0.8) {
      return "Below fair value - Bear Market Test still applied for protection. Even from this safer position, SWR ensures bear market cycle survival.";
    } else if (fairValueRatio >= 0.5) {
      return "Deep value territory - Bear Market methodology provides conservative protection. Excellent risk/reward with stress-testing against cycle downturns.";
    } else {
      return "Near Power Law floor - Bear Market Test ensures sustainability from this strong position. Protection against any realistic market scenario.";
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
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const calculateActualBitcoinSWR = (bitcoinPrice: number): string => {
    const currentYear = new Date().getFullYear();
    const marketConditions = calculateMarketBasedSWR(bitcoinPrice, currentYear);
    return (marketConditions.bitcoinRate * 100).toFixed(1);
  };

  const calculateActualBitcoinSWRDecimal = (bitcoinPrice: number): number => {
    const currentYear = new Date().getFullYear();
    const marketConditions = calculateMarketBasedSWR(bitcoinPrice, currentYear);
    
    // Override with 50-year simulation test if we have sufficient inputs
    if (retirementInputs.bitcoinAmount > 0 && retirementInputs.annualWithdrawal > 0) {
      const simulation = simulate50YearWithdrawals();
      const simulationSucceeds = simulation.length >= 50 && 
        simulation[simulation.length - 1].remainingBitcoin > 0 &&
        simulation[simulation.length - 1].totalRemainingValue > 0;
      
      if (!simulationSucceeds) {
        // If 50-year simulation fails, reduce SWR significantly
        const yearsUntilDepletion = simulation.findIndex(s => s.remainingBitcoin <= 0 && s.remainingCash <= 0);
        const depletionYear = yearsUntilDepletion > 0 ? yearsUntilDepletion + 1 : simulation.length;
        
        // Reduce SWR based on how far short we fall of 50 years
        const shortfallFactor = Math.max(0.1, depletionYear / 50);
        return marketConditions.bitcoinRate * shortfallFactor;
      }
    }
    
    return marketConditions.bitcoinRate;
  };

  // Calculate evolving floor ratio - starts at 42% (58% drawdown) and gradually increases to 80% (20% drawdown)
  const calculateEvolvingFloorRatio = (year: number): number => {
    const yearsSinceStart = year - 2025; // Years since Bitcoin maturity baseline
    const maturityFactor = Math.min(yearsSinceStart / 30, 1); // 30-year transition to full maturity
    
    // Start at 42% floor (58% drawdown), end at 80% floor (20% drawdown)
    const startFloor = 0.42;
    const endFloor = 0.80;
    
    return startFloor + (endFloor - startFloor) * maturityFactor;
  };
  
  // Calculate evolving bull multiplier - starts high and decreases as Bitcoin matures  
  const calculateEvolvingBullMultiplier = (year: number): number => {
    const yearsSinceStart = year - 2025;
    const maturityFactor = Math.min(yearsSinceStart / 30, 1);
    
    // Start at 2.0x fair value, end at 1.3x fair value (less extreme cycles)
    const startMultiplier = 2.0;
    const endMultiplier = 1.3;
    
    return startMultiplier - (startMultiplier - endMultiplier) * maturityFactor;
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
    const inflationRate = 0.08; // 8% annual inflation

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
          
          // Add realistic cycles during accumulation phase too
          // Simulate 4-year cycles: Recovery -> Bull -> Peak -> Bear
          const cycleYear = year % 4;
          const isBearMarketYear = cycleYear === 3;
          let cyclePrice;
          let cyclePhase = '';
          
          switch (cycleYear) {
            case 0: // Recovery year - between floor and fair
              const recoveryFloorRatio = calculateEvolvingFloorRatio(simulationYear);
              cyclePrice = (bitcoinFairValue * recoveryFloorRatio + bitcoinFairValue) / 2;
              cyclePhase = 'Recovery';
              break;
            case 1: // Bull run - above fair value (but less extreme over time)
              const bullMultiplier = calculateEvolvingBullMultiplier(simulationYear);
              cyclePrice = bitcoinFairValue * bullMultiplier;
              cyclePhase = `Bull (${bullMultiplier.toFixed(1)}x Fair)`;
              break;
            case 2: // Peak/correction - back to fair value
              cyclePrice = bitcoinFairValue;
              cyclePhase = 'Peak/Correction';
              break;
            case 3: // Bear market - drop to evolved floor
              const bearFloorRatio = calculateEvolvingFloorRatio(simulationYear);
              cyclePrice = bitcoinFairValue * bearFloorRatio;
              cyclePhase = `Bear (${Math.round(bearFloorRatio * 100)}% Floor)`;
              break;
            default:
              cyclePrice = bitcoinFairValue;
              cyclePhase = 'Fair Value';
          }
          
          // Debug logging for bear market years
          if (isBearMarketYear) {
            console.log(`🐻 BEAR MARKET DEBUG - Year ${simulationYear}:
              Year Data Cash Invested: $${yearData.cashInvested.toLocaleString()}
              Year Data Bitcoin Purchased: ${yearData.bitcoinPurchased.toFixed(6)} BTC
              Cycle Year: ${cycleYear}
              Bitcoin Fair Value: $${bitcoinFairValue.toLocaleString()}
              Cycle Price: $${cyclePrice.toLocaleString()}
              Expected Bitcoin (cash/price): ${(yearData.cashInvested / cyclePrice).toFixed(6)} BTC
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
      
      // Simulate Bitcoin cycle phases (4-year cycles)
      const cycleYear = year % 4;
      let bitcoinPrice;
      let cyclePhase = '';
      
            if (year === 0) {
        // For retirement year (year 0 of simulation), use fair value at retirement date
        bitcoinPrice = BitcoinPowerLaw.calculateFairValue(targetDate);
        cyclePhase = 'Retirement Start (Fair Value)';
      } else {
        // Simulate 4-year cycles with evolving volatility - less extreme as Bitcoin matures
        const adjustedCycleYear = (year - 1) % 4;
         switch (adjustedCycleYear) {
           case 0: // Bear market - drop to evolving floor (years 1, 5, 9, etc.)
             const bearFloorRatio = calculateEvolvingFloorRatio(currentSimulationYear);
             bitcoinPrice = fairValue * bearFloorRatio;
             cyclePhase = `Bear (${Math.round(bearFloorRatio * 100)}% Floor)`;
             break;
           case 1: // Recovery year - between floor and fair (years 2, 6, 10, etc.)
             const recoveryFloorRatio = calculateEvolvingFloorRatio(currentSimulationYear);
             bitcoinPrice = (fairValue * recoveryFloorRatio + fairValue) / 2;
             cyclePhase = 'Recovery';
             break;
           case 2: // Bull run - above fair value but less extreme over time (years 3, 7, 11, etc.)
             const bullMultiplier = calculateEvolvingBullMultiplier(currentSimulationYear);
             bitcoinPrice = fairValue * bullMultiplier;
             cyclePhase = `Bull (${bullMultiplier.toFixed(1)}x Fair)`;
             break;
           case 3: // Peak/correction - at fair value (years 4, 8, 12, etc.)
             bitcoinPrice = fairValue;
             cyclePhase = 'Peak/Correction';
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
      let bitcoinPrice_atSale = bitcoinPrice;
      
      // Determine actual withdrawal amount for this year
      let actualWithdrawal = annualWithdrawal;
      
      if (year === 0) {
        // Retirement start - show totals before any withdrawals (matches retirement analysis display)
        withdrawalSource = 'Retirement Start (No Withdrawal Yet)';
        // Keep remainingBitcoin and remainingCash unchanged to show starting amounts
        actualWithdrawal = 0; // No withdrawal in retirement start year
      } else {
        // Determine strategy: use cash when below fair value, Bitcoin when above
        const shouldUseCash = priceToFairRatio < 1.0 && remainingCash > 0;

        if (shouldUseCash && remainingCash >= actualWithdrawal) {
          // Use cash entirely
          cashUsed = actualWithdrawal;
          remainingCash -= cashUsed;
          withdrawalSource = 'Cash (HODL)';
        } else if (shouldUseCash && remainingCash > 0) {
          // Use remaining cash + some Bitcoin
          cashUsed = remainingCash;
          const bitcoinNeeded = actualWithdrawal - cashUsed;
          bitcoinSold = bitcoinNeeded / bitcoinPrice;
          remainingCash = 0;
          remainingBitcoin -= bitcoinSold;
          withdrawalSource = `Cash + Bitcoin (${(cashUsed/actualWithdrawal*100).toFixed(0)}%/${(100-cashUsed/actualWithdrawal*100).toFixed(0)}%)`;
        } else {
          // Use Bitcoin entirely
          bitcoinSold = actualWithdrawal / bitcoinPrice;
          remainingBitcoin -= bitcoinSold;
          withdrawalSource = 'Bitcoin';
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
        <h2>Bitcoin Price vs Power Law Model</h2>
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

      {/* Retirement Calculator Inputs */}
      <div className="retirement-section">
        <h3>🏠 Smart Bitcoin Retirement Calculator</h3>
        <div className="strategy-explanation">
          <p>📈 <strong>Smart Strategy:</strong> Use cash when Bitcoin is below fair value (preserve Bitcoin), sell Bitcoin when above fair value (take profits). 
          <br/><strong>50-Year Simulator:</strong> Models realistic 4-year Bitcoin cycles with bear markets, recovery, and bull phases. Cash loses value to inflation.
          <br/><strong>Real Test:</strong> Shows exact year-by-year withdrawals, asset depletion risks, and whether your retirement actually survives 50 years.
          <br/><strong>Starting from Zero:</strong> Enter 0 BTC if you're just beginning your stacking journey - monthly savings will build your stack!</p>
        </div>
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
            />
            <span className="input-unit">USD</span>
          </div>
        </div>

        {/* Monthly Savings Component */}
        <div className="monthly-savings-section">
          <div className="savings-header">
            <h4>💰 Monthly Savings (Still Earning)</h4>
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
              <div className="savings-explanation">
                <p>📈 <strong>Assumptions:</strong> Monthly savings increase 4% annually (official inflation/wage growth). Bitcoin purchases at Power Law fair value each month (harder to earn sats over time).</p>
              </div>
              
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
                    <span>🐻 Double Down in Bear Markets</span>
                  </label>
                  <p className="strategy-explanation">
                    <strong>Smart Strategy:</strong> During every 4th year (bear market cycle), double your monthly savings to buy 2x more Bitcoin when prices are low. This supercharges long-term accumulation.
                  </p>
                </div>
              </div>

              {/* Savings Projection Summary */}
              {savingsProjection.length > 0 && (
                <div className="savings-summary">
                  <h5>📊 Savings Projection Summary</h5>
                  
                  {monthlySavingsInputs.doubleDownInBearMarkets && (
                    <div className="bear-market-info">
                      <p><strong>🐻 Bear Market Strategy Active:</strong> Doubling savings every 4th year (years with cycle year 0) to maximize Bitcoin accumulation during low prices!</p>
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
            
            <div style={{ 
              padding: '15px',
              background: 'rgba(247, 147, 26, 0.1)',
              border: '1px solid rgba(247, 147, 26, 0.3)',
              borderRadius: '8px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, color: '#e8e8e8', fontSize: '0.9rem' }}>
                <strong>Strategy:</strong> Use cash during bear markets to preserve Bitcoin, sell Bitcoin during bull markets. 
                Analysis based on 50-year simulation with realistic Bitcoin cycles and inflation.
              </p>
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
                        <span className="projection-label">💰 Total Assets (Including Projections):</span>
                        <span className="projection-value">
                                                  {formatPrice(
                          (retirementInputs.bitcoinAmount + (monthlySavingsInputs.enabled && savingsProjection.length > 0 ? savingsProjection[savingsProjection.length - 1].totalBitcoinAccumulated : 0)) * currentPrice + 
                          retirementInputs.cashAmount
                        )}
                        </span>
                      </div>
                    <div className="projection-item">
                      <span className="projection-label">📅 Annual Withdrawal Need:</span>
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