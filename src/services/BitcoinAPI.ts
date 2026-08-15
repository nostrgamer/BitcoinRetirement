import {
  BitcoinPriceData,
  BitcoinQuote,
  MarketDataResult,
  MarketDataStatus,
  SameOriginMarketDataResponse
} from '../types/Bitcoin';

const BASELINE_URL = '/bitcoin-historical-data.csv';
const MARKET_DATA_URL = '/api/bitcoin-data';
const REQUEST_TIMEOUT_MS = 7000;
const LIVE_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;

const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const normalizeObservation = (value: unknown): BitcoinPriceData | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<BitcoinPriceData>;
  if (!isFinitePositive(candidate.price) || !isValidTimestamp(candidate.timestamp)) return null;

  const date = new Date(candidate.timestamp);
  if (Number.isNaN(date.getTime())) return null;

  return {
    date: date.toISOString().split('T')[0],
    price: candidate.price,
    timestamp: candidate.timestamp
  };
};

export const mergeHistoricalData = (
  baseline: BitcoinPriceData[],
  recent: BitcoinPriceData[]
): BitcoinPriceData[] => {
  const validBaseline = baseline.map(normalizeObservation).filter((item): item is BitcoinPriceData => item !== null);
  const latestBaselineTimestamp = validBaseline.reduce((latest, item) => Math.max(latest, item.timestamp), 0);
  const validRecent = recent
    .map(normalizeObservation)
    .filter((item): item is BitcoinPriceData => item !== null && item.timestamp > latestBaselineTimestamp);

  const byTimestamp = new Map<number, BitcoinPriceData>();
  [...validBaseline, ...validRecent].forEach(item => byTimestamp.set(item.timestamp, item));
  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
};

const fetchWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json,text/csv' } });
  } finally {
    clearTimeout(timeout);
  }
};

export class BitcoinAPI {
  static parseCSVData(csvText: string): BitcoinPriceData[] {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length <= 1) return [];

    const headers = lines[0].toLowerCase().split(',');
    const dateIndex = Math.max(headers.findIndex(header => header.includes('date')), 0);
    const priceIndex = Math.max(headers.findIndex(header => header.includes('price')), 1);
    const timestampIndex = headers.findIndex(header => header.includes('timestamp'));

    const data = lines.slice(1).map(line => {
      const values = line.split(',');
      const date = new Date(values[dateIndex]?.trim());
      const price = Number(values[priceIndex]?.trim());
      const csvTimestamp = timestampIndex >= 0 ? Number(values[timestampIndex]?.trim()) : NaN;
      return normalizeObservation({
        date: Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0],
        price,
        timestamp: Number.isFinite(csvTimestamp) ? csvTimestamp : date.getTime()
      });
    }).filter((item): item is BitcoinPriceData => item !== null);

    return mergeHistoricalData(data, []);
  }

  private static async loadBaseline(): Promise<BitcoinPriceData[]> {
    const response = await fetch(BASELINE_URL, { headers: { Accept: 'text/csv' } });
    if (!response.ok) throw new Error(`Bundled history returned HTTP ${response.status}`);
    const baseline = this.parseCSVData(await response.text());
    if (baseline.length === 0) throw new Error('Bundled history did not contain valid observations');
    return baseline;
  }

  private static async loadSameOriginData(): Promise<SameOriginMarketDataResponse> {
    const response = await fetchWithTimeout(MARKET_DATA_URL);
    if (!response.ok) throw new Error(`Market data endpoint returned HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error('Market data endpoint returned an invalid payload');
    return payload as SameOriginMarketDataResponse;
  }

  static async getMarketData(): Promise<MarketDataResult> {
    const baseline = await this.loadBaseline();
    let remote: SameOriginMarketDataResponse | null = null;

    try {
      remote = await this.loadSameOriginData();
    } catch {
      // The deterministic bundled baseline remains usable without noisy browser errors.
    }

    const remoteHistory = remote?.history;
    const recent = Array.isArray(remoteHistory)
      ? remoteHistory.map(normalizeObservation).filter((item): item is BitcoinPriceData => item !== null)
      : [];
    const history = mergeHistoricalData(baseline, recent);
    const latestHistory = history[history.length - 1];
    const remoteQuote = remote?.current;

    let quote: BitcoinQuote;
    if (
      remoteQuote &&
      isFinitePositive(remoteQuote.price) &&
      isValidTimestamp(remoteQuote.observedAt) &&
      typeof remoteQuote.source === 'string' &&
      remoteQuote.source.trim().length > 0
    ) {
      const age = Math.max(0, Date.now() - remoteQuote.observedAt);
      const status: MarketDataStatus = remoteQuote.status === 'live' && age <= LIVE_QUOTE_MAX_AGE_MS
        ? 'live'
        : 'cached';
      quote = {
        price: remoteQuote.price,
        observedAt: remoteQuote.observedAt,
        source: remoteQuote.source,
        status,
        stale: status !== 'live'
      };
    } else {
      const isRecentSupplement = latestHistory.timestamp > baseline[baseline.length - 1].timestamp;
      quote = {
        price: latestHistory.price,
        observedAt: latestHistory.timestamp,
        source: isRecentSupplement ? 'Coinbase Exchange daily close' : 'Bundled historical CSV',
        status: isRecentSupplement ? 'cached' : 'fallback',
        stale: true
      };
    }

    return { history, quote };
  }
}
