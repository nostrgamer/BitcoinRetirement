import { BitcoinAPI, mergeHistoricalData } from './BitcoinAPI';

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
      if (url.endsWith('.csv')) return response(csv);
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
      if (String(input).endsWith('.csv')) return response(csv);
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
      if (String(input).endsWith('.csv')) return response(csv);
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
