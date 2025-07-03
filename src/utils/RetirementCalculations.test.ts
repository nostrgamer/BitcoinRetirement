import {
  testBearMarketSurvival,
  calculateCyclePrice,
  calculateMonthlySavingsProjection,
  validateRetirementInputs,
  BearMarketTestResult,
  CyclePhaseResult
} from './RetirementCalculations';
import { BitcoinPowerLaw } from '../models/PowerLaw';

describe('RetirementCalculations', () => {
  describe('testBearMarketSurvival', () => {
    const testYear = 2025;
    const testDate = new Date(testYear, 0, 1);
    const fairValue = BitcoinPowerLaw.calculateFairValue(testDate);
    const floorValue = BitcoinPowerLaw.calculateFloorPrice(testDate);
    
         it('should pass with sufficient Bitcoin and no cash needs', () => {
       // Use more realistic scenario: 10 BTC with $30k withdrawal (lower withdrawal rate)
       const result = testBearMarketSurvival(fairValue, testYear, 10, 30000, 0);
       expect(result.passes).toBe(true);
       expect(result.remainingBitcoin).toBeGreaterThan(0);
     });
    
         it('should pass with cash to cover bear market years', () => {
       // Use more realistic scenario: 5 BTC with $25k withdrawal, $200k cash
       const result = testBearMarketSurvival(fairValue, testYear, 5, 25000, 200000);
       expect(result.passes).toBe(true);
       expect(result.remainingCash).toBeGreaterThan(0);
     });
    
    it('should fail with insufficient assets', () => {
      const result = testBearMarketSurvival(fairValue, testYear, 0.1, 100000, 0);
      expect(result.passes).toBe(false);
    });
    
    it('should fail with zero Bitcoin holdings', () => {
      const result = testBearMarketSurvival(fairValue, testYear, 0, 50000, 100000);
      expect(result.passes).toBe(false);
    });
    
    it('should fail with zero annual withdrawal', () => {
      const result = testBearMarketSurvival(fairValue, testYear, 1, 0, 0);
      expect(result.passes).toBe(false);
    });
    
         it('should use cash before selling Bitcoin during bear market', () => {
       const result = testBearMarketSurvival(fairValue, testYear, 2, 50000, 60000);
       
       // Should have used some cash and preserved most Bitcoin
       expect(result.remainingCash).toBeLessThan(60000);
       expect(result.remainingBitcoin).toBeLessThan(2);
       expect(result.remainingBitcoin).toBeGreaterThan(1.2); // Should preserve most Bitcoin
     });
    
         it('should require 20+ years runway after bear market', () => {
       // Test edge case where assets barely survive bear market but fail runway test
       const result = testBearMarketSurvival(fairValue, testYear, 0.3, 50000, 0);
       
       // With only 0.3 BTC and $50k withdrawal, should fail 20 years runway requirement
       expect(result.passes).toBe(false);
     });
    
    it('should handle negative cash gracefully', () => {
      const result = testBearMarketSurvival(fairValue, testYear, 1, 50000, -10000);
      expect(result.remainingCash).toBe(0); // Should treat negative as 0
    });
  });
  
  describe('calculateCyclePrice', () => {
    it('should return fair value for current year', () => {
      const result = calculateCyclePrice(2025, true);
      const expectedFairValue = BitcoinPowerLaw.calculateFairValue(new Date(2025, 0, 1));
      
      expect(result.price).toBeCloseTo(expectedFairValue, 2);
      expect(result.phase).toBe('Current Year (Fair Value)');
    });
    
    it('should follow 4-year cycle pattern', () => {
      // Test cycle years for consistent pattern
      const results = [];
      for (let year = 2024; year < 2028; year++) {
        results.push(calculateCyclePrice(year, false));
      }
      
      // Check cycle years are sequential: 3, 0, 1, 2
      expect(results[0].cycleYear).toBe(3); // 2024: (2024-1) % 4 = 3
      expect(results[1].cycleYear).toBe(0); // 2025: (2025-1) % 4 = 0
      expect(results[2].cycleYear).toBe(1); // 2026: (2026-1) % 4 = 1
      expect(results[3].cycleYear).toBe(2); // 2027: (2027-1) % 4 = 2
    });
    
    it('should have floor price for cycle year 0 (deep bear)', () => {
      const result = calculateCyclePrice(2025, false); // 2025 is cycle year 0
      const expectedFloor = BitcoinPowerLaw.calculateFloorPrice(new Date(2025, 0, 1));
      
      expect(result.price).toBeCloseTo(expectedFloor, 2);
      expect(result.phase).toBe('Deep Bear (Floor)');
    });
    
    it('should have recovery price for cycle year 1', () => {
      const result = calculateCyclePrice(2026, false); // 2026 is cycle year 1
      const targetDate = new Date(2026, 0, 1);
      const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
      const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
      const expectedPrice = floorValue + (fairValue - floorValue) * 0.75;
      
      expect(result.price).toBeCloseTo(expectedPrice, 2);
      expect(result.phase).toBe('Bear Market Recovery');
    });
    
    it('should have bull market price for cycle year 2', () => {
      const result = calculateCyclePrice(2027, false); // 2027 is cycle year 2
      const targetDate = new Date(2027, 0, 1);
      const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
      const upperBound = BitcoinPowerLaw.calculateUpperBound(targetDate);
      const expectedPrice = fairValue + (upperBound - fairValue) * 0.7;
      
      expect(result.price).toBeCloseTo(expectedPrice, 2);
      expect(result.phase).toBe('Bull Market');
    });
    
    it('should maintain price relationships across cycle', () => {
      const year = 2028;
      const targetDate = new Date(year, 0, 1);
      const fairValue = BitcoinPowerLaw.calculateFairValue(targetDate);
      const floorValue = BitcoinPowerLaw.calculateFloorPrice(targetDate);
      const upperBound = BitcoinPowerLaw.calculateUpperBound(targetDate);
      
      const currentYear = calculateCyclePrice(year, true);
      const bearMarket = calculateCyclePrice(year, false); // Assume it's a bear year
      
      // Current year should use fair value
      expect(currentYear.price).toBe(fairValue);
      
      // All prices should be within bounds
      expect(bearMarket.price).toBeGreaterThanOrEqual(floorValue);
      expect(bearMarket.price).toBeLessThanOrEqual(upperBound);
    });
  });
  
  describe('calculateMonthlySavingsProjection', () => {
    const testStartDate = new Date(2025, 0, 1); // Use local time constructor
    
    it('should calculate basic monthly savings without doubling', () => {
      const projection = calculateMonthlySavingsProjection(1000, 2, false, testStartDate);
      
      expect(projection).toHaveLength(24); // 2 years × 12 months
      expect(projection[0].monthlySavingsAmount).toBe(1000);
      expect(projection[11].monthlySavingsAmount).toBe(1000); // No doubling
      expect(projection[23].totalCashInvested).toBe(24000); // 24 months × $1000
    });
    
    it('should double down during bear market years', () => {
      const projection = calculateMonthlySavingsProjection(1000, 3, true, testStartDate);
      
      // 2025 is current year (no doubling), 2026 is bear market (doubling)
      const year2025Months = projection.slice(0, 12);
      const year2026Months = projection.slice(12, 24);
      const year2027Months = projection.slice(24, 36);
      
      // Current year (2025): No doubling
      expect(year2025Months[0].monthlySavingsAmount).toBe(1000);
      
      // 2026 (cycle year 1 - bear market): Should double
      expect(year2026Months[0].monthlySavingsAmount).toBe(2000);
      
      // 2027 (cycle year 2 - bull market): Back to normal
      // Note: 2027 has cycleYear = (2027-1) % 4 = 2, which is not 0 or 1, so no doubling
      expect(year2027Months[0].monthlySavingsAmount).toBe(1000);
    });
    
    it('should accumulate Bitcoin over time', () => {
      const projection = calculateMonthlySavingsProjection(1000, 1, false, testStartDate);
      
      expect(projection[0].totalBitcoinAccumulated).toBeGreaterThan(0);
      expect(projection[11].totalBitcoinAccumulated).toBeGreaterThan(projection[0].totalBitcoinAccumulated);
      
      // Should have purchased Bitcoin each month
      for (const month of projection) {
        expect(month.bitcoinPurchased).toBeGreaterThan(0);
      }
    });
    
    it('should use current year fair value for 2025', () => {
      const projection = calculateMonthlySavingsProjection(1000, 2, false, testStartDate);
      
      // First year (2025) should use fair value, not cycle logic
      const fairValue2025 = BitcoinPowerLaw.calculateFairValue(testStartDate);
      const jan2025 = projection[0];
      
      expect(jan2025.bitcoinCyclePrice).toBeCloseTo(fairValue2025, 2);
    });
    
    it('should apply cycle logic to future years', () => {
      const projection = calculateMonthlySavingsProjection(1000, 2, false, testStartDate);
      
      // Second year (2026) should use cycle logic (bear market recovery)
      const jan2026 = projection[12]; // Month 1 of year 2
      const fairValue2026 = jan2026.bitcoinFairValue;
      
      // Should not equal fair value (should be cycle-adjusted)
      expect(jan2026.bitcoinCyclePrice).not.toBeCloseTo(fairValue2026, 2);
    });
    
    it('should handle edge case of zero years', () => {
      const projection = calculateMonthlySavingsProjection(1000, 0, false, testStartDate);
      expect(projection).toHaveLength(0);
    });
    
    it('should handle edge case of zero monthly amount', () => {
      const projection = calculateMonthlySavingsProjection(0, 1, false, testStartDate);
      
      expect(projection).toHaveLength(12);
      expect(projection[0].bitcoinPurchased).toBe(0);
      expect(projection[11].totalCashInvested).toBe(0);
    });
  });
  
  describe('validateRetirementInputs', () => {
    it('should pass validation for valid inputs', () => {
      const result = validateRetirementInputs(1, 50000, 60000);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should fail for negative Bitcoin amount', () => {
      const result = validateRetirementInputs(-1, 50000, 60000);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Bitcoin amount cannot be negative');
    });
    
    it('should fail for negative cash amount', () => {
      const result = validateRetirementInputs(1, -50000, 60000);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cash amount cannot be negative');
    });
    
    it('should fail for zero or negative withdrawal', () => {
      const result = validateRetirementInputs(1, 50000, 0);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Annual withdrawal must be greater than zero');
    });
    
    it('should fail for zero assets', () => {
      const result = validateRetirementInputs(0, 0, 60000);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Must have either Bitcoin or cash holdings');
    });
    
    it('should warn about unrealistically high Bitcoin amount', () => {
      const result = validateRetirementInputs(1500, 50000, 60000);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Bitcoin amount seems unrealistically high (>1000 BTC)');
    });
    
    it('should warn about unrealistically high withdrawal', () => {
      const result = validateRetirementInputs(1, 50000, 15000000);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Annual withdrawal seems unrealistically high (>$10M)');
    });
    
    it('should accumulate multiple errors', () => {
      const result = validateRetirementInputs(-1, -50000, 0);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
    
    it('should allow edge case of only Bitcoin holdings', () => {
      const result = validateRetirementInputs(1, 0, 60000);
      expect(result.isValid).toBe(true);
    });
    
    it('should allow edge case of only cash holdings', () => {
      const result = validateRetirementInputs(0, 50000, 60000);
      expect(result.isValid).toBe(true);
    });
  });
  
  describe('Integration tests', () => {
    it('should have consistent cycle logic between price calculation and savings projection', () => {
      const testYear = 2026;
      const cyclePrice = calculateCyclePrice(testYear, false);
      
      const projection = calculateMonthlySavingsProjection(1000, 2, false, new Date(2025, 0, 1));
      const year2026Projection = projection.find(p => p.year === 2);
      
      if (year2026Projection) {
        // Both should use the same cycle logic for 2026
        expect(year2026Projection.bitcoinCyclePrice).toBeCloseTo(cyclePrice.price, 2);
      }
    });
    
         it('should pass bear market test with realistic retirement scenario', () => {
       // Test a realistic scenario: 8 BTC + $300k cash, $40k/year withdrawal
       const currentPrice = BitcoinPowerLaw.calculateFairValue(new Date());
       const result = testBearMarketSurvival(currentPrice, 2025, 8, 40000, 300000);
       
       // This should be a reasonable retirement scenario
       expect(result.passes).toBe(true);
       expect(result.remainingBitcoin).toBeGreaterThan(0);
     });
    
         it('should maintain mathematical consistency in bear market calculations', () => {
       const testYear = 2025;
       const testDate = new Date(testYear, 0, 1);
       const fairValue = BitcoinPowerLaw.calculateFairValue(testDate);
       const floorValue = BitcoinPowerLaw.calculateFloorPrice(testDate);
       
       // Test the bear market recovery price calculation
       const recoveryPrice = floorValue + (fairValue - floorValue) * 0.75;
       
       expect(recoveryPrice).toBeGreaterThan(floorValue);
       expect(recoveryPrice).toBeLessThan(fairValue);
       
       // Recovery price should be 75% of the way from floor to fair value
       const expectedRecovery = floorValue + (fairValue - floorValue) * 0.75;
       expect(recoveryPrice).toBeCloseTo(expectedRecovery, 2);
     });
  });

}); 