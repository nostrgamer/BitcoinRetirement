// Bitcoin Genesis Block timestamp: January 3, 2009, 18:15:05 UTC
const BITCOIN_GENESIS_TIMESTAMP = 1231006505000; // milliseconds

// Power Law parameters - User's formula
// Formula: Price = A × (days_since_genesis)^B
const POWER_LAW_A = 1.01e-17; // Coefficient: 1.01E-17
const POWER_LAW_B = 5.82; // Exponent: 5.82

export class BitcoinPowerLaw {
  /**
   * Calculate the power law fair value for a given date
   * Formula: Price = A × (days_since_genesis)^B
   */
  static calculateFairValue(date: Date): number {
    const daysSinceGenesis = this.getDaysSinceGenesis(date);
    const fairValue = POWER_LAW_A * Math.pow(daysSinceGenesis, POWER_LAW_B);
    return fairValue;
  }

  /**
   * Calculate the power law floor price (support level)
   * Formula: Floor = Fair Value × 0.42
   */
  static calculateFloorPrice(date: Date): number {
    const fairValue = this.calculateFairValue(date);
    return fairValue * 0.42;
  }

  /**
   * Calculate the power law upper bound (resistance level)
   * Based on Giovanni Santostasi's research showing cycle tops around 2x fair value
   * This is a simpler, more established approach than exponential decay models
   */
  static calculateUpperBound(date: Date): number {
    const fairValue = this.calculateFairValue(date);
    // Giovanni's research shows cycle tops typically occur around 2x fair value
    return fairValue * 2.0;
  }

  /**
   * Get days since Bitcoin genesis block
   */
  static getDaysSinceGenesis(date: Date): number {
    const millisecondsSinceGenesis = date.getTime() - BITCOIN_GENESIS_TIMESTAMP;
    const daysSinceGenesis = millisecondsSinceGenesis / (1000 * 60 * 60 * 24);
    return Math.max(1, daysSinceGenesis); // Ensure at least 1 day to avoid issues
  }

  /**
   * Generate power law data for a date range
   */
  static generatePowerLawData(startDate: Date, endDate: Date, intervalDays: number = 1): Array<{date: string, fairValue: number, timestamp: number}> {
    const data: Array<{date: string, fairValue: number, timestamp: number}> = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const fairValue = this.calculateFairValue(currentDate);
      data.push({
        date: currentDate.toISOString().split('T')[0],
        fairValue: fairValue,
        timestamp: currentDate.getTime()
      });

      // Move to next interval
      currentDate.setDate(currentDate.getDate() + intervalDays);
    }

    return data;
  }

  /**
   * Check if current price is above or below fair value
   */
  static isPriceAboveFairValue(currentPrice: number, date: Date = new Date()): boolean {
    const fairValue = this.calculateFairValue(date);
    return currentPrice > fairValue;
  }

  /**
   * Get the ratio of current price to fair value
   */
  static getPriceToFairValueRatio(currentPrice: number, date: Date = new Date()): number {
    const fairValue = this.calculateFairValue(date);
    return currentPrice / fairValue;
  }
} 