import { BitcoinPowerLaw } from './PowerLaw';

describe('BitcoinPowerLaw', () => {
  // Test dates
  const genesisDate = new Date('2009-01-03T18:15:05Z');
  const testDate2024 = new Date('2024-01-01');
  const testDate2025 = new Date('2025-01-01');
  
  describe('getDaysSinceGenesis', () => {
    it('should return 1 for genesis date', () => {
      const days = BitcoinPowerLaw.getDaysSinceGenesis(genesisDate);
      expect(days).toBe(1); // Ensures at least 1 day to avoid calculation issues
    });
    
    it('should return positive number for dates after genesis', () => {
      const days = BitcoinPowerLaw.getDaysSinceGenesis(testDate2024);
      expect(days).toBeGreaterThan(5000); // Should be well over 5000 days
    });
    
    it('should return at least 1 even for dates before genesis', () => {
      const beforeGenesis = new Date('2008-01-01');
      const days = BitcoinPowerLaw.getDaysSinceGenesis(beforeGenesis);
      expect(days).toBe(1);
    });
  });
  
  describe('calculateFairValue', () => {
    it('should return positive price for any date', () => {
      const price = BitcoinPowerLaw.calculateFairValue(testDate2024);
      expect(price).toBeGreaterThan(0);
    });
    
    it('should return increasing prices over time', () => {
      const price2024 = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const price2025 = BitcoinPowerLaw.calculateFairValue(testDate2025);
      expect(price2025).toBeGreaterThan(price2024);
    });
    
    it('should return realistic price for 2024', () => {
      const price = BitcoinPowerLaw.calculateFairValue(testDate2024);
      // Should be in reasonable range for 2024 (roughly $50k-$200k)
      expect(price).toBeGreaterThan(30000);
      expect(price).toBeLessThan(500000);
    });
    
    it('should use correct power law formula', () => {
      const testDate = new Date('2020-01-01');
      const days = BitcoinPowerLaw.getDaysSinceGenesis(testDate);
      const expectedPrice = 1.01e-17 * Math.pow(days, 5.82);
      const actualPrice = BitcoinPowerLaw.calculateFairValue(testDate);
      expect(actualPrice).toBeCloseTo(expectedPrice, 2);
    });
  });
  
  describe('calculateFloorPrice', () => {
    it('should return 42% of fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const floorPrice = BitcoinPowerLaw.calculateFloorPrice(testDate2024);
      expect(floorPrice).toBeCloseTo(fairValue * 0.42, 2);
    });
    
    it('should always be less than fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const floorPrice = BitcoinPowerLaw.calculateFloorPrice(testDate2024);
      expect(floorPrice).toBeLessThan(fairValue);
    });
  });
  
  describe('calculateUpperBound', () => {
    it('should return 2x fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const upperBound = BitcoinPowerLaw.calculateUpperBound(testDate2024);
      expect(upperBound).toBeCloseTo(fairValue * 2.0, 2);
    });
    
    it('should always be greater than fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const upperBound = BitcoinPowerLaw.calculateUpperBound(testDate2024);
      expect(upperBound).toBeGreaterThan(fairValue);
    });
  });
  
  describe('isPriceAboveFairValue', () => {
    it('should return true when price is above fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const result = BitcoinPowerLaw.isPriceAboveFairValue(fairValue * 1.5, testDate2024);
      expect(result).toBe(true);
    });
    
    it('should return false when price is below fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const result = BitcoinPowerLaw.isPriceAboveFairValue(fairValue * 0.5, testDate2024);
      expect(result).toBe(false);
    });
  });
  
  describe('getPriceToFairValueRatio', () => {
    it('should return 1.0 when price equals fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const ratio = BitcoinPowerLaw.getPriceToFairValueRatio(fairValue, testDate2024);
      expect(ratio).toBeCloseTo(1.0, 2);
    });
    
    it('should return 2.0 when price is double fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const ratio = BitcoinPowerLaw.getPriceToFairValueRatio(fairValue * 2, testDate2024);
      expect(ratio).toBeCloseTo(2.0, 2);
    });
    
    it('should return 0.5 when price is half fair value', () => {
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate2024);
      const ratio = BitcoinPowerLaw.getPriceToFairValueRatio(fairValue * 0.5, testDate2024);
      expect(ratio).toBeCloseTo(0.5, 2);
    });
  });
  
  describe('generatePowerLawData', () => {
    it('should generate data for date range', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');
      const data = BitcoinPowerLaw.generatePowerLawData(startDate, endDate, 1);
      
      expect(data).toHaveLength(3); // 3 days inclusive
      expect(data[0].date).toBe('2024-01-01');
      expect(data[1].date).toBe('2024-01-02');
      expect(data[2].date).toBe('2024-01-03');
    });
    
    it('should have increasing fair values over time', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');
      const data = BitcoinPowerLaw.generatePowerLawData(startDate, endDate, 1);
      
      expect(data[1].fairValue).toBeGreaterThan(data[0].fairValue);
      expect(data[2].fairValue).toBeGreaterThan(data[1].fairValue);
    });
    
    it('should include timestamp for each entry', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-01');
      const data = BitcoinPowerLaw.generatePowerLawData(startDate, endDate, 1);
      
      expect(data[0].timestamp).toBe(startDate.getTime());
    });
  });
  
  describe('Edge cases and validation', () => {
    it('should handle very early dates gracefully', () => {
      const earlyDate = new Date('2009-01-01'); // Before genesis
      const price = BitcoinPowerLaw.calculateFairValue(earlyDate);
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThan(1); // Should be very small
    });
    
    it('should handle far future dates', () => {
      const futureDate = new Date('2050-01-01');
      const price = BitcoinPowerLaw.calculateFairValue(futureDate);
      expect(price).toBeGreaterThan(0);
      expect(price).toBeGreaterThan(1000000); // Should be very large
    });
    
    it('should maintain consistent relationships between bounds', () => {
      const testDate = new Date('2024-06-01');
      const floorPrice = BitcoinPowerLaw.calculateFloorPrice(testDate);
      const fairValue = BitcoinPowerLaw.calculateFairValue(testDate);
      const upperBound = BitcoinPowerLaw.calculateUpperBound(testDate);
      
      expect(floorPrice).toBeLessThan(fairValue);
      expect(fairValue).toBeLessThan(upperBound);
      expect(upperBound).toBe(fairValue * 2);
      expect(floorPrice).toBeCloseTo(fairValue * 0.42, 2);
    });
  });
}); 