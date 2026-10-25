import { BASELINE_URL, BitcoinAPI, hasHistoryGap, mergeHistoricalData } from './BitcoinAPI';
import historicalStats from '../models/historicalStats.json';

const csv = `date,price,timestamp
2024-12-30,92000,1735516800000
2024-12-31,93000,1735603200000`;

const response = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => String(body)
}) as Response;

describe('BitcoinAPI same-origin market data', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('merges only validated newer observations, deduplicated and sorted by timestamp', () => {
    const baseline = BitcoinAPI.parseCSVData(csv);
    const merged = mergeHistoricalData(baseline, [
      { date: '2024-12-31', price: 99999, timestamp: 1735603200000 },
      { date: '2025-01-02', price: 95000, timestamp: 1735776000000 },
      { date: '2025-01-01', price: 94000, timestamp: 1735689600000 },
      { date: '2025-01-02', price: 96000, timestamp: 1735776000000 },
      { date: 'invalid', price: -1, timestamp: 1735862400000 }
    ]);

    expect(merged.map(item => item.timestamp)).toEqual([
      1735516800000,
      1735603200000,
      1735689600000,
      1735776000000
    ]);
    expect(merged[3].price).toBe(96000);
    expect(merged[1].price).toBe(93000);
  });

  it('uses a fresh same-origin quote and supplements bundled history', async () => {
    const observedAt = Date.now() - 60_000;
    globalThis.fetch = jest.fn(async input => {
      const url = String(input);
      if (url.includes('.csv')) return response(csv);
      return response({
        current: { price: 101000, observedAt, source: 'Coinbase Exchange BTC-USD', status: 'live' },
        history: [{ date: '2025-01-01', price: 94000, timestamp: 1735689600000 }],
        servedAt: Date.now(),
        status: 'live'
      });
    }) as jest.Mock;

    const result = await BitcoinAPI.getMarketData();

    expect(result.quote).toMatchObject({ price: 101000, status: 'live', stale: false });
    expect(result.history).toHaveLength(3);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/bitcoin-data', expect.objectContaining({ signal: expect.anything() }));
  });

  it('keeps the calculator usable with an explicit baseline fallback on function failure', async () => {
    globalThis.fetch = jest.fn(async input => {
      if (String(input).includes('.csv')) return response(csv);
      throw new Error('function unavailable');
    }) as jest.Mock;

    const result = await BitcoinAPI.getMarketData();

    expect(result.quote).toEqual({
      price: 93000,
      observedAt: 1735603200000,
      source: 'Bundled historical CSV',
      status: 'fallback',
      stale: true
    });
  });

  it('rejects malformed function observations and labels the baseline fallback', async () => {
    globalThis.fetch = jest.fn(async input => {
      if (String(input).includes('.csv')) return response(csv);
      return response({
        current: { price: 'not-a-price', observedAt: 'now', source: '', status: 'live' },
        history: [{ price: -10, timestamp: 1735689600000 }]
      });
    }) as jest.Mock;

    const result = await BitcoinAPI.getMarketData();
    expect(result.history).toHaveLength(2);
    expect(result.quote.status).toBe('fallback');
    expect(result.quote.source).toBe('Bundled historical CSV');
  });
});

describe('baseline CSV and stale caches', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  const DAY = 86400000;
  const day = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
  const csvThrough = (...dates: string[]) =>
    ['date,price,timestamp', ...dates.map(d => `${d},50000,${day(d)}`)].join('\n');
  const STALE = csvThrough('2024-12-30', '2024-12-31'); // the pre-refresh CSV
  const FRESH = csvThrough('2026-09-29', '2026-09-30');
  // Newer function: complete by its own baseline, history from Jan 2026.
  const liveFromJan2026 = {
    current: { price: 80000, observedAt: Date.now(), source: 'Coinbase Exchange BTC-USD', status: 'live' },
    history: [day('2026-01-09'), day('2026-09-30'), day('2026-10-01')].map(t => ({ date: '', price: 80000, timestamp: t })),
    servedAt: Date.now(),
    status: 'live',
    coverage: { from: '2026-01-09', to: '2026-10-01', complete: true }
  };
  const mockFetch = (csvBodies: string[]) => {
    const csvCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (input, init) => {
      const url = String(input);
      if (url.includes('.csv')) {
        csvCalls.push({ url, init });
        return response(csvBodies[Math.min(csvCalls.length - 1, csvBodies.length - 1)]);
      }
      return response(liveFromJan2026);
    }) as jest.Mock;
    return csvCalls;
  };

  it('requests the CSV at a URL versioned by its content hash', async () => {
    const csvCalls = mockFetch([FRESH]);
    await BitcoinAPI.getMarketData();
    expect(csvCalls).toHaveLength(1);
    expect(csvCalls[0].url).toBe(`/bitcoin-historical-data.csv?v=${historicalStats.csvVersion}`);
    expect(BASELINE_URL).toBe(csvCalls[0].url);
  });

  it('a stale cached CSV is refetched bypassing the cache, and the history joins up', async () => {
    const csvCalls = mockFetch([STALE, FRESH]);
    const result = await BitcoinAPI.getMarketData();
    expect(csvCalls).toHaveLength(2);
    expect(csvCalls[1].init).toMatchObject({ cache: 'reload' });
    expect(result.historyComplete).toBe(true);
    expect(result.historyGapAfter).toBeNull();
    expect(result.history[0].timestamp).toBe(day('2026-09-29'));
  });

  it('if the refetch is still stale, history is reported incomplete despite the server saying complete', async () => {
    const csvCalls = mockFetch([STALE, STALE]);
    const result = await BitcoinAPI.getMarketData();
    expect(csvCalls).toHaveLength(2);
    expect(result.historyComplete).toBe(false);
    expect(result.historyGapAfter).toBe(day('2024-12-31')); // the chart breaks here
  });

  it('a stalled refetch times out: loaded data is still returned, flagged incomplete', async () => {
    jest.useFakeTimers();
    try {
      let csvCalls = 0;
      globalThis.fetch = jest.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('.csv')) {
          csvCalls += 1;
          if (csvCalls === 1) return Promise.resolve(response(STALE));
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          });
        }
        return Promise.resolve(response(liveFromJan2026));
      }) as jest.Mock;

      const pending = BitcoinAPI.getMarketData();
      for (let i = 0; i < 50 && csvCalls < 2; i++) await Promise.resolve();
      expect(csvCalls).toBe(2);
      jest.advanceTimersByTime(7000);
      const result = await pending;
      expect(result.historyComplete).toBe(false);
      expect(result.quote.price).toBe(80000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a refetch whose body stalls also times out', async () => {
    jest.useFakeTimers();
    try {
      let csvCalls = 0;
      globalThis.fetch = jest.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('.csv')) {
          csvCalls += 1;
          if (csvCalls === 1) return Promise.resolve(response(STALE));
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            })
          } as unknown as Response);
        }
        return Promise.resolve(response(liveFromJan2026));
      }) as jest.Mock;

      const pending = BitcoinAPI.getMarketData();
      for (let i = 0; i < 50 && csvCalls < 2; i++) await Promise.resolve();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      jest.advanceTimersByTime(7000);
      const result = await pending;
      expect(result.historyComplete).toBe(false);
      expect(result.historyGapAfter).toBe(day('2024-12-31'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('detects a gap only when live data starts more than a day after the CSV ends', () => {
    const base = BitcoinAPI.parseCSVData(FRESH);
    const at = (iso: string) => [{ date: iso, price: 1, timestamp: day(iso) }];
    expect(hasHistoryGap(base, at('2026-10-01'))).toBe(false);
    expect(hasHistoryGap(base, at('2026-10-02'))).toBe(true);
    expect(hasHistoryGap(base, [])).toBe(false); // no live data: nothing to join
    expect(day('2026-10-02') - day('2026-09-30')).toBe(2 * DAY);
  });
});
