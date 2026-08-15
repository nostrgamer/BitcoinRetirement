'use strict';

const COINBASE_BASE_URL = 'https://api.exchange.coinbase.com';
const HISTORY_WINDOW_DAYS = 290;
const HISTORY_WINDOW_COUNT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PRICE = 10000000;

const isPrice = value => Number.isFinite(value) && value > 0 && value < MAX_PRICE;
const isTimestamp = (value, nowMs) => Number.isFinite(value) && value > 1230940800000 && value <= nowMs + 5 * 60 * 1000;

async function fetchJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BitcoinRetirement/1.0'
      }
    });
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTicker(payload, nowMs) {
  const price = Number(payload && payload.price);
  const observedAt = Date.parse(payload && payload.time);
  if (!isPrice(price) || !isTimestamp(observedAt, nowMs)) return null;
  return { price, observedAt, source: 'Coinbase Exchange BTC-USD', status: 'live' };
}

function normalizeCandles(payload, nowMs) {
  if (!Array.isArray(payload)) return [];
  const byTimestamp = new Map();
  payload.forEach(candle => {
    if (!Array.isArray(candle) || candle.length < 5) return;
    const timestamp = Number(candle[0]) * 1000;
    const price = Number(candle[4]);
    if (!isTimestamp(timestamp, nowMs) || !isPrice(price)) return;
    byTimestamp.set(timestamp, {
      date: new Date(timestamp).toISOString().split('T')[0],
      price,
      timestamp
    });
  });
  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function historyUrls(nowMs) {
  return Array.from({ length: HISTORY_WINDOW_COUNT }, (_, index) => {
    const end = new Date(nowMs - index * HISTORY_WINDOW_DAYS * DAY_MS);
    const start = new Date(end.getTime() - HISTORY_WINDOW_DAYS * DAY_MS);
    const query = new URLSearchParams({
      granularity: '86400',
      start: start.toISOString(),
      end: end.toISOString()
    });
    return `${COINBASE_BASE_URL}/products/BTC-USD/candles?${query}`;
  });
}

async function fetchCoinbaseData({ fetchImpl = fetch, nowMs = Date.now(), timeoutMs = 4500 } = {}) {
  const tickerPromise = fetchJson(fetchImpl, `${COINBASE_BASE_URL}/products/BTC-USD/ticker`, timeoutMs);
  const candlePromises = historyUrls(nowMs).map(url => fetchJson(fetchImpl, url, timeoutMs));
  const [tickerResult, ...candleResults] = await Promise.allSettled([tickerPromise, ...candlePromises]);

  const current = tickerResult.status === 'fulfilled' ? normalizeTicker(tickerResult.value, nowMs) : null;
  const byTimestamp = new Map();
  candleResults.forEach(result => {
    if (result.status !== 'fulfilled') return;
    normalizeCandles(result.value, nowMs).forEach(item => byTimestamp.set(item.timestamp, item));
  });
  const history = Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);

  let fallbackCurrent = current;
  if (!fallbackCurrent && history.length > 0) {
    const latest = history[history.length - 1];
    fallbackCurrent = {
      price: latest.price,
      observedAt: latest.timestamp,
      source: 'Coinbase Exchange daily close',
      status: 'cached'
    };
  }

  return {
    current: fallbackCurrent,
    history,
    servedAt: nowMs,
    status: current && history.length > 0 ? 'live' : fallbackCurrent || history.length > 0 ? 'partial' : 'fallback'
  };
}

module.exports = {
  fetchCoinbaseData,
  historyUrls,
  normalizeCandles,
  normalizeTicker
};
