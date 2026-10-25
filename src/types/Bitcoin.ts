export interface BitcoinPriceData {
  date: string;
  price: number;
  timestamp: number;
}

export type MarketDataStatus = 'live' | 'cached' | 'fallback';

export interface BitcoinQuote {
  price: number;
  observedAt: number;
  source: string;
  status: MarketDataStatus;
  stale: boolean;
}

export interface SameOriginMarketDataResponse {
  current: {
    price: number;
    observedAt: number;
    source: string;
    status: MarketDataStatus;
  } | null;
  history: BitcoinPriceData[];
  servedAt: number;
  status: MarketDataStatus | 'partial';
  coverage?: {
    from: string | null;
    to: string | null;
    complete: boolean;
  };
}

export interface MarketDataResult {
  history: BitcoinPriceData[];
  quote: BitcoinQuote;
  /** False when the server reported a gap between the bundled history and today. */
  historyComplete: boolean;
  /** Timestamp of the last bundled observation when live history doesn't continue from it; the chart breaks there. */
  historyGapAfter: number | null;
}

export interface ChartDataPoint {
  date: string;
  actualPrice: number | null;
  powerLawPrice: number;
  powerLawFloor: number;
  powerLawUpperBound: number;
  timestamp: number;
  /** Price on the retirement stress path for this point's calendar year (when retirement inputs are valid) */
  withdrawalPlanPrice?: number | null;
  /** Break marker inserted where price history is missing, so the line isn't drawn across the gap */
  missingHistory?: boolean;
}
