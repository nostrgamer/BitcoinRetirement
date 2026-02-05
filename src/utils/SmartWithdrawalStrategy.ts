import { BitcoinPowerLaw } from '../models/PowerLaw';

export interface WithdrawalDecision {
  useCashAmount: number;
  useBitcoinAmount: number;
  strategy: string;
  reasoning: string;
  fairValueRatio: number;
  recommendedAction: 'HODL_BITCOIN' | 'SPEND_BITCOIN' | 'BALANCED' | 'EMERGENCY_ONLY';
}

export interface WithdrawalContext {
  currentBitcoinPrice: number;
  currentDate: Date;
  availableCash: number;
  availableBitcoin: number;
  withdrawalNeeded: number;
  emergencyMode?: boolean;
}

/**
 * Smart Withdrawal Strategy based on Power Law Fair Value Analysis
 * 
 * Key insights from historical analysis:
 * - Bitcoin spends 54.4% of time below fair value (good time to preserve Bitcoin)
 * - Bitcoin spends 44.5% of time above fair value (good time to spend Bitcoin)
 * - Extreme ratios: 13.02x high, 0.42x low
 * - Mean reversion tendency over long periods
 */
export class SmartWithdrawalStrategy {
  
  /**
   * Determine optimal withdrawal strategy based on Power Law position
   */
  static calculateWithdrawal(context: WithdrawalContext): WithdrawalDecision {
    const { 
      currentBitcoinPrice, 
      currentDate, 
      availableCash, 
      availableBitcoin, 
      withdrawalNeeded,
      emergencyMode = false
    } = context;

    const fairValue = BitcoinPowerLaw.calculateFairValue(currentDate);
    const floorValue = BitcoinPowerLaw.calculateFloorPrice(currentDate);
    const upperBound = BitcoinPowerLaw.calculateUpperBound(currentDate);
    const fairValueRatio = currentBitcoinPrice / fairValue;
    
    // Emergency mode: use whatever is available
    if (emergencyMode) {
      return this.emergencyWithdrawal(context, fairValueRatio);
    }

    // Determine strategy based on Power Law position
    return this.calculateOptimalStrategy(
      fairValueRatio, 
      currentBitcoinPrice,
      fairValue,
      floorValue,
      upperBound,
      availableCash,
      availableBitcoin,
      withdrawalNeeded
    );
  }

  private static calculateOptimalStrategy(
    fairValueRatio: number,
    currentPrice: number,
    fairValue: number,
    floorValue: number,
    upperBound: number,
    availableCash: number,
    availableBitcoin: number,
    withdrawalNeeded: number
  ): WithdrawalDecision {
    
    const bitcoinValue = availableBitcoin * currentPrice;
    const totalAssets = availableCash + bitcoinValue;

    // Strategy zones based on historical analysis
    if (fairValueRatio <= 0.5) {
      // Extreme undervaluation (like 2015 crash to 0.42x)
      return this.extremeUndervaluedStrategy(availableCash, availableBitcoin, withdrawalNeeded, fairValueRatio, currentPrice);
      
    } else if (fairValueRatio <= 0.8) {
      // Significantly undervalued (common in bear markets)
      return this.undervaluedStrategy(availableCash, availableBitcoin, withdrawalNeeded, fairValueRatio, currentPrice);
      
    } else if (fairValueRatio <= 1.2) {
      // Near fair value (±20% - historically 1.1% of time spent exactly at fair value)
      return this.fairValueStrategy(availableCash, availableBitcoin, withdrawalNeeded, fairValueRatio, currentPrice);
      
    } else if (fairValueRatio <= 2.5) {
      // Moderately overvalued (common in bull markets)
      return this.overvaluedStrategy(availableCash, availableBitcoin, withdrawalNeeded, fairValueRatio, currentPrice);
      
    } else if (fairValueRatio <= 5.0) {
      // Significantly overvalued (bubble territory)
      return this.bubbleStrategy(availableCash, availableBitcoin, withdrawalNeeded, fairValueRatio, currentPrice);
      
    } else {
      // Extreme bubble (like 2013's 13x fair value)
      return this.extremeBubbleStrategy(availableCash, availableBitcoin, withdrawalNeeded, fairValueRatio, currentPrice);
    }
  }

  private static extremeUndervaluedStrategy(
    availableCash: number, 
    availableBitcoin: number, 
    withdrawalNeeded: number, 
    fairValueRatio: number,
    currentPrice: number
  ): WithdrawalDecision {
    // Bitcoin is extremely cheap - preserve it at all costs
    if (availableCash >= withdrawalNeeded) {
      return {
        useCashAmount: withdrawalNeeded,
        useBitcoinAmount: 0,
        strategy: 'Cash Only (Extreme HODL)',
        reasoning: `Bitcoin is extremely undervalued at ${fairValueRatio.toFixed(2)}x fair value. Historical low was 0.42x. Use all available cash to preserve Bitcoin for inevitable recovery.`,
        fairValueRatio,
        recommendedAction: 'HODL_BITCOIN'
      };
    } else {
      // Use all cash first, minimize Bitcoin sales
      const bitcoinNeeded = (withdrawalNeeded - availableCash) / currentPrice;
      return {
        useCashAmount: availableCash,
        useBitcoinAmount: bitcoinNeeded,
        strategy: 'Cash First, Minimal Bitcoin',
        reasoning: `Bitcoin extremely undervalued (${fairValueRatio.toFixed(2)}x). Using all ${availableCash.toLocaleString()} cash first, selling minimal Bitcoin.`,
        fairValueRatio,
        recommendedAction: 'HODL_BITCOIN'
      };
    }
  }

  private static undervaluedStrategy(
    availableCash: number, 
    availableBitcoin: number, 
    withdrawalNeeded: number, 
    fairValueRatio: number,
    currentPrice: number
  ): WithdrawalDecision {
    // Bitcoin is significantly undervalued - strongly prefer cash
    const cashRatio = Math.min(1.0, availableCash / withdrawalNeeded);
    const preferredCashUsage = withdrawalNeeded * Math.max(0.8, cashRatio); // Use at least 80% cash if available
    
    if (availableCash >= preferredCashUsage) {
      const bitcoinNeeded = Math.max(0, (withdrawalNeeded - preferredCashUsage) / currentPrice);
      return {
        useCashAmount: preferredCashUsage,
        useBitcoinAmount: bitcoinNeeded,
        strategy: bitcoinNeeded > 0 ? 'Mostly Cash (80%+)' : 'Cash Only',
        reasoning: `Bitcoin undervalued at ${fairValueRatio.toFixed(2)}x fair value. Historically spends 54.4% of time below 1.0x. Preserve Bitcoin for recovery.`,
        fairValueRatio,
        recommendedAction: 'HODL_BITCOIN'
      };
    } else {
      // Use all available cash, rest from Bitcoin
      const bitcoinNeeded = (withdrawalNeeded - availableCash) / currentPrice;
      return {
        useCashAmount: availableCash,
        useBitcoinAmount: bitcoinNeeded,
        strategy: 'Cash First, Some Bitcoin',
        reasoning: `Bitcoin undervalued but limited cash. Using all $${availableCash.toLocaleString()} cash first.`,
        fairValueRatio,
        recommendedAction: 'HODL_BITCOIN'
      };
    }
  }

  private static fairValueStrategy(
    availableCash: number, 
    availableBitcoin: number, 
    withdrawalNeeded: number, 
    fairValueRatio: number,
    currentPrice: number
  ): WithdrawalDecision {
    // Near fair value - balanced approach
    const totalValue = availableCash + (availableBitcoin * currentPrice);
    const cashRatio = availableCash / totalValue;
    const bitcoinRatio = 1 - cashRatio;
    
    // Use assets proportionally, but slightly favor cash to maintain Bitcoin exposure
    const preferredCashUsage = Math.min(availableCash, withdrawalNeeded * Math.min(0.6, cashRatio * 1.2));
    const bitcoinUsage = Math.max(0, (withdrawalNeeded - preferredCashUsage) / currentPrice);
    
    return {
      useCashAmount: preferredCashUsage,
      useBitcoinAmount: bitcoinUsage,
      strategy: 'Balanced Withdrawal',
      reasoning: `Bitcoin near fair value (${fairValueRatio.toFixed(2)}x). Using balanced approach with slight cash preference to maintain Bitcoin exposure.`,
      fairValueRatio,
      recommendedAction: 'BALANCED'
    };
  }

  private static overvaluedStrategy(
    availableCash: number, 
    availableBitcoin: number, 
    withdrawalNeeded: number, 
    fairValueRatio: number,
    currentPrice: number
  ): WithdrawalDecision {
    // Bitcoin is overvalued - prefer to spend Bitcoin
    const bitcoinValue = availableBitcoin * currentPrice;
    
    if (bitcoinValue >= withdrawalNeeded) {
      // Can cover entirely with Bitcoin
      const bitcoinNeeded = withdrawalNeeded / currentPrice;
      return {
        useCashAmount: 0,
        useBitcoinAmount: bitcoinNeeded,
        strategy: 'Bitcoin Only (Take Profits)',
        reasoning: `Bitcoin overvalued at ${fairValueRatio.toFixed(2)}x fair value. Good time to take profits while preserving cash for future opportunities.`,
        fairValueRatio,
        recommendedAction: 'SPEND_BITCOIN'
      };
    } else {
      // Use significant Bitcoin portion, supplement with cash
      const maxBitcoinUsage = Math.min(availableBitcoin, (withdrawalNeeded * 0.8) / currentPrice);
      const cashNeeded = Math.max(0, withdrawalNeeded - (maxBitcoinUsage * currentPrice));
      
      return {
        useCashAmount: Math.min(availableCash, cashNeeded),
        useBitcoinAmount: maxBitcoinUsage,
        strategy: 'Mostly Bitcoin (80%+)',
        reasoning: `Bitcoin overvalued at ${fairValueRatio.toFixed(2)}x. Taking profits while Bitcoin is above fair value.`,
        fairValueRatio,
        recommendedAction: 'SPEND_BITCOIN'
      };
    }
  }

  private static bubbleStrategy(
    availableCash: number, 
    availableBitcoin: number, 
    withdrawalNeeded: number, 
    fairValueRatio: number,
    currentPrice: number
  ): WithdrawalDecision {
    // Bitcoin in bubble territory - aggressively take profits
    const bitcoinNeeded = withdrawalNeeded / currentPrice;
    
    return {
      useCashAmount: 0,
      useBitcoinAmount: Math.min(availableBitcoin, bitcoinNeeded),
      strategy: 'Bitcoin Only (Bubble Profits)',
      reasoning: `Bitcoin in bubble territory at ${fairValueRatio.toFixed(2)}x fair value. Aggressively taking profits. Historical analysis shows mean reversion is likely.`,
      fairValueRatio,
      recommendedAction: 'SPEND_BITCOIN'
    };
  }

  private static extremeBubbleStrategy(
    availableCash: number, 
    availableBitcoin: number, 
    withdrawalNeeded: number, 
    fairValueRatio: number,
    currentPrice: number
  ): WithdrawalDecision {
    // Extreme bubble like 2013's 13x - maximum profit taking
    const bitcoinNeeded = withdrawalNeeded / currentPrice;
    
    return {
      useCashAmount: 0,
      useBitcoinAmount: Math.min(availableBitcoin, bitcoinNeeded),
      strategy: 'Bitcoin Only (Extreme Bubble)',
      reasoning: `Bitcoin in extreme bubble at ${fairValueRatio.toFixed(2)}x fair value! Historical high was 13.02x in 2013. Take maximum profits immediately - major correction likely.`,
      fairValueRatio,
      recommendedAction: 'SPEND_BITCOIN'
    };
  }

  private static emergencyWithdrawal(
    context: WithdrawalContext, 
    fairValueRatio: number
  ): WithdrawalDecision {
    const { availableCash, availableBitcoin, withdrawalNeeded, currentBitcoinPrice } = context;
    
    if (availableCash >= withdrawalNeeded) {
      return {
        useCashAmount: withdrawalNeeded,
        useBitcoinAmount: 0,
        strategy: 'Emergency Cash',
        reasoning: 'Emergency withdrawal using available cash to preserve Bitcoin.',
        fairValueRatio,
        recommendedAction: 'EMERGENCY_ONLY'
      };
    } else {
      const bitcoinNeeded = (withdrawalNeeded - availableCash) / currentBitcoinPrice;
      return {
        useCashAmount: availableCash,
        useBitcoinAmount: bitcoinNeeded,
        strategy: 'Emergency Mixed',
        reasoning: 'Emergency withdrawal using all available assets.',
        fairValueRatio,
        recommendedAction: 'EMERGENCY_ONLY'
      };
    }
  }

  /**
   * Get strategic recommendations for portfolio rebalancing
   */
  static getRebalancingAdvice(
    currentPrice: number, 
    currentDate: Date, 
    bitcoinHoldings: number, 
    cashHoldings: number
  ): string {
    const fairValue = BitcoinPowerLaw.calculateFairValue(currentDate);
    const ratio = currentPrice / fairValue;
    const bitcoinValue = bitcoinHoldings * currentPrice;
    const totalValue = bitcoinValue + cashHoldings;
    const bitcoinPercentage = (bitcoinValue / totalValue) * 100;

    if (ratio <= 0.6) {
      return `🔥 EXTREME BUYING OPPORTUNITY: Bitcoin at ${ratio.toFixed(2)}x fair value. Consider increasing Bitcoin allocation if possible. Current: ${bitcoinPercentage.toFixed(0)}% Bitcoin.`;
    } else if (ratio <= 0.8) {
      return `📈 GOOD BUYING OPPORTUNITY: Bitcoin undervalued at ${ratio.toFixed(2)}x fair value. Consider maintaining or increasing Bitcoin allocation. Current: ${bitcoinPercentage.toFixed(0)}% Bitcoin.`;
    } else if (ratio <= 1.2) {
      return `⚖️ FAIR VALUE ZONE: Bitcoin near fair value (${ratio.toFixed(2)}x). Balanced allocation appropriate. Current: ${bitcoinPercentage.toFixed(0)}% Bitcoin.`;
    } else if (ratio <= 2.5) {
      return `💰 PROFIT TAKING ZONE: Bitcoin overvalued at ${ratio.toFixed(2)}x fair value. Consider taking some profits. Current: ${bitcoinPercentage.toFixed(0)}% Bitcoin.`;
    } else if (ratio <= 5.0) {
      return `🚨 BUBBLE TERRITORY: Bitcoin significantly overvalued at ${ratio.toFixed(2)}x. Strong profit-taking recommended. Current: ${bitcoinPercentage.toFixed(0)}% Bitcoin.`;
    } else {
      return `🔴 EXTREME BUBBLE: Bitcoin at ${ratio.toFixed(2)}x fair value! Historical high was 13x. Aggressive profit-taking advised. Current: ${bitcoinPercentage.toFixed(0)}% Bitcoin.`;
    }
  }
}
