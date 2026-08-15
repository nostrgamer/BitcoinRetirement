import { fetchCoinbaseData } from '../../netlify/functions/lib/bitcoin-data';
import { createHandler } from '../../netlify/functions/bitcoin-data';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body
});

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

    const result = await fetchCoinbaseData({ fetchImpl: fetchImpl as unknown as typeof fetch, nowMs, timeoutMs: 50 });

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

describe('Netlify Bitcoin data HTTP handler', () => {
  it('returns cacheable JSON for validated market data', async () => {
    const payload = {
      current: { price: 100000, observedAt: 1786795200000, source: 'Coinbase Exchange BTC-USD', status: 'live' as const },
      history: [{ date: '2026-08-15', price: 100000, timestamp: 1786752000000 }],
      servedAt: 1786795200000,
      status: 'live' as const
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
      status: 'fallback'
    }))();
    expect(result.statusCode).toBe(200);
    expect(result.headers['Cache-Control']).toContain('s-maxage=30');
  });
});
