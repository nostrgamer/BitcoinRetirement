import { useCallback, useEffect, useState } from 'react';
import { BitcoinAPI } from '../services/BitcoinAPI';
import { BitcoinPriceData, BitcoinQuote } from '../types/Bitcoin';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export interface MarketData {
  history: BitcoinPriceData[];
  quote: BitcoinQuote | null;
  historyComplete: boolean;
  /** True only until the first load finishes; refreshes never blank the page. */
  initialLoading: boolean;
  /** True while a background refresh is in flight. */
  refreshing: boolean;
  error: string | null;
  reload: () => void;
}

export const useMarketData = (): MarketData => {
  const [history, setHistory] = useState<BitcoinPriceData[]>([]);
  const [quote, setQuote] = useState<BitcoinQuote | null>(null);
  const [historyComplete, setHistoryComplete] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await BitcoinAPI.getMarketData();
      setHistory(data.history);
      setQuote(data.quote);
      setHistoryComplete(data.historyComplete);
      setError(null);
    } catch (err) {
      console.error('Error loading chart data:', err);
      // Keep showing the last good data on a failed background refresh.
      setError(prev => prev ?? 'Failed to load chart data. Please try again.');
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { history, quote, historyComplete, initialLoading, refreshing, error, reload: load };
};
