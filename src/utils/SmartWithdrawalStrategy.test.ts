/**
 * Edge-case tests for Smart Withdrawal Strategy:
 * - Zero / insufficient assets or withdrawal
 * - Boundary fair-value ratios (0.5, 0.8, 1.2, 2.5, 5.0)
 * - Emergency mode
 * - Withdrawal amount equals cash + (BTC sold × price)
 */

import { SmartWithdrawalStrategy, WithdrawalContext } from './SmartWithdrawalStrategy';
import { BitcoinPowerLaw } from '../models/PowerLaw';

const defaultContext: WithdrawalContext = {
  currentBitcoinPrice: 100000,
  currentDate: new Date(2026, 0, 1),
  availableCash: 50000,
  availableBitcoin: 1,
  withdrawalNeeded: 40000
};

function makeContext(overrides: Partial<WithdrawalContext>): WithdrawalContext {
  return { ...defaultContext, ...overrides };
}

describe('SmartWithdrawalStrategy', () => {
  const testDate = new Date(2026, 0, 1);
  const fairValue = BitcoinPowerLaw.calculateFairValue(testDate);

  describe('Edge cases: zero or insufficient assets', () => {
    it('withdrawalNeeded zero: returns amounts that sum to zero or minimal', () => {
      const ctx = makeContext({
        currentBitcoinPrice: fairValue,
        currentDate: testDate,
        withdrawalNeeded: 0,
        availableCash: 10000,
        availableBitcoin: 0.5
      });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      const totalUsed = r.useCashAmount + r.useBitcoinAmount * ctx.currentBitcoinPrice;
      expect(totalUsed).toBe(0);
    });

    it('availableCash and availableBitcoin zero: returns a decision without throwing', () => {
      const ctx = makeContext({
        currentBitcoinPrice: fairValue,
        currentDate: testDate,
        availableCash: 0,
        availableBitcoin: 0,
        withdrawalNeeded: 50000
      });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      expect(r).toBeDefined();
      expect(r.recommendedAction).toBeDefined();
      // With no assets, fairValueStrategy can produce NaN (0/0); caller should validate assets
      expect(typeof r.useCashAmount).toBe('number');
      expect(typeof r.useBitcoinAmount).toBe('number');
    });

    it('withdrawal amount equals useCashAmount + useBitcoinAmount × price when assets suffice', () => {
      const ctx = makeContext({
        currentBitcoinPrice: fairValue,
        currentDate: testDate,
        availableCash: 100000,
        availableBitcoin: 2,
        withdrawalNeeded: 60000
      });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      const totalUsed = r.useCashAmount + r.useBitcoinAmount * ctx.currentBitcoinPrice;
      expect(totalUsed).toBeCloseTo(ctx.withdrawalNeeded, 0);
    });
  });

  describe('Boundary fair-value ratios', () => {
    it('ratio 0.5 (extreme undervalued): prefers cash, HODL_BITCOIN', () => {
      const price = fairValue * 0.5;
      const ctx = makeContext({ currentBitcoinPrice: price, currentDate: testDate });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      expect(r.recommendedAction).toBe('HODL_BITCOIN');
      expect(r.fairValueRatio).toBeCloseTo(0.5, 2);
      if (ctx.availableCash >= ctx.withdrawalNeeded) {
        expect(r.useCashAmount).toBe(ctx.withdrawalNeeded);
        expect(r.useBitcoinAmount).toBe(0);
      }
    });

    it('ratio 0.8 (undervalued): prefers cash', () => {
      const price = fairValue * 0.8;
      const ctx = makeContext({ currentBitcoinPrice: price, currentDate: testDate, availableCash: 100000 });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      expect(r.recommendedAction).toBe('HODL_BITCOIN');
      expect(r.useCashAmount).toBeGreaterThan(0);
    });

    it('ratio just above 1.2 (overvalued): prefers Bitcoin spend', () => {
      const price = fairValue * 1.25;
      const ctx = makeContext({
        currentBitcoinPrice: price,
        currentDate: testDate,
        availableCash: 100000,
        availableBitcoin: 2
      });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      expect(r.recommendedAction).toBe('SPEND_BITCOIN');
      const totalUsed = r.useCashAmount + r.useBitcoinAmount * price;
      expect(totalUsed).toBeCloseTo(ctx.withdrawalNeeded, 0);
    });

    it('ratio 2.5 (bubble): Bitcoin-only or mostly Bitcoin', () => {
      const price = fairValue * 2.5;
      const ctx = makeContext({
        currentBitcoinPrice: price,
        currentDate: testDate,
        availableCash: 100000,
        availableBitcoin: 1
      });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      expect(r.recommendedAction).toBe('SPEND_BITCOIN');
      expect(r.useBitcoinAmount).toBeGreaterThan(0);
    });

    it('ratio > 5 (extreme bubble): Bitcoin only, SPEND_BITCOIN', () => {
      const price = fairValue * 6;
      const ctx = makeContext({
        currentBitcoinPrice: price,
        currentDate: testDate,
        availableCash: 100000,
        availableBitcoin: 1,
        withdrawalNeeded: 50000
      });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      expect(r.recommendedAction).toBe('SPEND_BITCOIN');
      expect(r.useCashAmount).toBe(0);
      expect(r.useBitcoinAmount).toBeGreaterThan(0);
    });
  });

  describe('Emergency mode', () => {
    it('emergencyMode true: uses cash first when available', () => {
      const ctx = makeContext({
        currentBitcoinPrice: fairValue * 2,
        currentDate: testDate,
        availableCash: 60000,
        availableBitcoin: 1,
        withdrawalNeeded: 40000,
        emergencyMode: true
      });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      expect(r.recommendedAction).toBe('EMERGENCY_ONLY');
      expect(r.useCashAmount).toBe(40000);
      expect(r.useBitcoinAmount).toBe(0);
    });

    it('emergencyMode true with insufficient cash: uses cash then Bitcoin', () => {
      const ctx = makeContext({
        currentBitcoinPrice: fairValue,
        currentDate: testDate,
        availableCash: 20000,
        availableBitcoin: 1,
        withdrawalNeeded: 50000,
        emergencyMode: true
      });
      const r = SmartWithdrawalStrategy.calculateWithdrawal(ctx);
      expect(r.recommendedAction).toBe('EMERGENCY_ONLY');
      expect(r.useCashAmount).toBe(20000);
      expect(r.useBitcoinAmount).toBeCloseTo((50000 - 20000) / ctx.currentBitcoinPrice, 2);
    });
  });

  describe('getRebalancingAdvice', () => {
    it('returns string for zero total value (avoids divide by zero)', () => {
      const advice = SmartWithdrawalStrategy.getRebalancingAdvice(
        fairValue,
        testDate,
        0,
        0
      );
      expect(typeof advice).toBe('string');
      expect(advice.length).toBeGreaterThan(0);
    });

    it('returns string for normal allocation', () => {
      const advice = SmartWithdrawalStrategy.getRebalancingAdvice(
        fairValue,
        testDate,
        1,
        50000
      );
      expect(typeof advice).toBe('string');
      expect(advice).toMatch(/fair value|undervalued|overvalued|Bubble|Bitcoin/i);
    });
  });
});
