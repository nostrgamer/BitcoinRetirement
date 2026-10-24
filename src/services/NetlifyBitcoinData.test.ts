import { fetchCoinbaseData, windowsNeeded } from '../../netlify/functions/lib/bitcoin-data';
import { createHandler } from '../../netlify/functions/bitcoin-data';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Netlify Bitcoin data function core', () => {
  const nowMs = Date.parse('2026-08-15T12:00:00.000Z');

  it('returns validated live provenance and sorted, deduplicated daily history', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.endsWith('/ticker')) {
        return jsonResponse({ price: '101234.50', time: '2026-08-15T11:59:00.000Z' });
      }
      return jsonResponse([
        [1786665600, 90000, 102000, 91000, 100000, 12],
        [1786579200, 89000, 99000, 90000, 98000, 15],
        [1786665600, 90000, 102000, 91000, 100500, 12],
        ['bad', 0, 0, 0, -1, 0]
      ]);
    });

    const result = await fetchCoinbaseData({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowMs,
      timeoutMs: 50,
      baselineEndMs: nowMs - 800 * DAY_MS
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.current).toEqual({
      price: 101234.5,
      observedAt: Date.parse('2026-08-15T11:59:00.000Z'),
      source: 'Coinbase Exchange BTC-USD',
      status: 'live'
    });
    expect(result.history.map((item: { timestamp: number }) => item.timestamp)).toEqual([
      1786579200000,
      1786665600000
    ]);
    expect(result.history[1].price).toBe(100500);
    expect(result.status).toBe('live');
  });

  it('gracefully falls back when upstream requests fail', async () => {
    const result = await fetchCoinbaseData({
      fetchImpl: (async () => jsonResponse({}, false, 503)) as unknown as typeof fetch,
      nowMs,
      timeoutMs: 50
    });

    expect(result).toMatchObject({ current: null, history: [], status: 'fallback' });
  });

  it('rejects malformed upstream payloads', async () => {
    const result = await fetchCoinbaseData({
      fetchImpl: (async (url: string) => url.endsWith('/ticker')
        ? jsonResponse({ price: '-4', time: 'not-a-date' })
        : jsonResponse({ unexpected: true })) as unknown as typeof fetch,
      nowMs,
      timeoutMs: 50
    });

    expect(result).toMatchObject({ current: null, history: [], status: 'fallback' });
  });

  it('bounds timeouts and returns fallback instead of throwing', async () => {
    const fetchImpl = (_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });

    const startedAt = Date.now();
    const result = await fetchCoinbaseData({ fetchImpl: fetchImpl as unknown as typeof fetch, nowMs, timeoutMs: 10 });

    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(result).toMatchObject({ current: null, history: [], status: 'fallback' });
  });
});

describe('History coverage after the bundled baseline', () => {
  const nowMs = Date.parse('2026-08-15T12:00:00.000Z');

  // One candle per day for the requested window, so coverage is continuous when every window succeeds.
  const dailyCandles = (url: string) => {
    const params = new URL(url).searchParams;
    const start = Date.parse(params.get('start') as string);
    const end = Date.parse(params.get('end') as string);
    const candles = [];
    for (let t = Math.ceil(start / DAY_MS) * DAY_MS; t <= end; t += DAY_MS) {
      candles.push([t / 1000, 1, 1, 1, 50000, 1]);
    }
    return candles;
  };

  const fetchFor = (failWindowIndex?: number) => {
    let windowIndex = -1;
    return jest.fn(async (url: string) => {
      if (url.endsWith('/ticker')) return jsonResponse({ price: '50000', time: '2026-08-15T11:59:00.000Z' });
      windowIndex += 1;
      if (windowIndex === failWindowIndex) return jsonResponse({}, false, 503);
      return jsonResponse(dailyCandles(url));
    });
  };

  const maxGapDays = (history: Array<{ timestamp: number }>) =>
    history.slice(1).reduce((gap, item, i) => Math.max(gap, (item.timestamp - history[i].timestamp) / DAY_MS), 0);

  it.each([
    // expected calls = 1 ticker + ceil(days / 290) windows, capped at 4 windows
    [300, 3, true],
    [900, 5, true],
    [1500, 5, false]
  ])('baseline ending %i days ago makes %i upstream calls', async (daysAgo, expectedCalls, complete) => {
    const fetchImpl = fetchFor();
    const result = await fetchCoinbaseData({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowMs,
      timeoutMs: 50,
      baselineEndMs: nowMs - daysAgo * DAY_MS
    });

    expect(fetchImpl).toHaveBeenCalledTimes(expectedCalls);
    expect(result.coverage.complete).toBe(complete);
    if (complete) {
      expect(maxGapDays(result.history)).toBeLessThanOrEqual(2);
      expect(Date.parse(result.coverage.from as string)).toBeLessThanOrEqual(nowMs - daysAgo * DAY_MS + DAY_MS);
    }
  });

  it('marks coverage incomplete but still merges the other windows when one window fails', async () => {
    const result = await fetchCoinbaseData({
      fetchImpl: fetchFor(1) as unknown as typeof fetch,
      nowMs,
      timeoutMs: 50,
      baselineEndMs: nowMs - 800 * DAY_MS
    });

    expect(result.coverage.complete).toBe(false);
    expect(result.history.length).toBeGreaterThan(500);
  });

  it('needs at least one window even when the baseline is current', () => {
    expect(windowsNeeded(nowMs, nowMs)).toBe(1);
    expect(windowsNeeded(nowMs, nowMs - 291 * DAY_MS)).toBe(2);
  });
});

describe('Netlify Bitcoin data HTTP handler', () => {
  it('returns cacheable JSON for validated market data', async () => {
    const payload = {
      current: { price: 100000, observedAt: 1786795200000, source: 'Coinbase Exchange BTC-USD', status: 'live' as const },
      history: [{ date: '2026-08-15', price: 100000, timestamp: 1786752000000 }],
      servedAt: 1786795200000,
      status: 'live' as const,
      coverage: { from: '2026-08-15', to: '2026-08-15', complete: true }
    };
    const result = await createHandler(async () => payload)();

    expect(result.statusCode).toBe(200);
    expect(result.headers['Content-Type']).toContain('application/json');
    expect(result.headers['Cache-Control']).toContain('s-maxage=300');
    expect(JSON.parse(result.body)).toEqual(payload);
  });

  it('uses a short cache policy for graceful fallback responses', async () => {
    const result = await createHandler(async () => ({
      current: null,
      history: [],
      servedAt: 1786795200000,
      status: 'fallback',
      coverage: { from: null, to: null, complete: false }
    }))();
    expect(result.statusCode).toBe(200);
    expect(result.headers['Cache-Control']).toContain('s-maxage=30');
  });
});
