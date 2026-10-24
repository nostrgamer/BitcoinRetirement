'use strict';

const { BASELINE_END_MS } = require('./baseline');

const COINBASE_BASE_URL = 'https://api.exchange.coinbase.com';
const HISTORY_WINDOW_DAYS = 290;
const MAX_HISTORY_WINDOWS = 4;
const HISTORY_BUDGET_MS = 8000; // stay well inside the Netlify function time limit
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

// Number of 290-day windows needed to cover everything after the bundled CSV baseline.
function windowsNeeded(nowMs, baselineEndMs) {
  return Math.max(1, Math.ceil((nowMs - baselineEndMs) / (HISTORY_WINDOW_DAYS * DAY_MS)));
}

function historyUrls(nowMs, count) {
  return Array.from({ length: count }, (_, index) => {
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

async function fetchCoinbaseData({
  fetchImpl = fetch,
  nowMs = Date.now(),
  timeoutMs = 4500,
  baselineEndMs = BASELINE_END_MS,
  budgetMs = HISTORY_BUDGET_MS
} = {}) {
  const startedAt = Date.now();
  const tickerPromise = fetchJson(fetchImpl, `${COINBASE_BASE_URL}/products/BTC-USD/ticker`, timeoutMs)
    .then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));

  const needed = windowsNeeded(nowMs, baselineEndMs);
  const urls = historyUrls(nowMs, Math.min(needed, MAX_HISTORY_WINDOWS));
  const byTimestamp = new Map();
  let allWindowsOk = needed <= MAX_HISTORY_WINDOWS;

  // Sequential, newest window first, so a slow upstream costs at most one timeout per window.
  for (const url of urls) {
    if (Date.now() - startedAt > budgetMs) {
      allWindowsOk = false;
      break;
    }
    try {
      const candles = normalizeCandles(await fetchJson(fetchImpl, url, timeoutMs), nowMs);
      if (candles.length === 0) allWindowsOk = false;
      candles.forEach(item => byTimestamp.set(item.timestamp, item));
    } catch {
      allWindowsOk = false;
    }
  }

  const tickerResult = await tickerPromise;
  const current = tickerResult.status === 'fulfilled' ? normalizeTicker(tickerResult.value, nowMs) : null;
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
    status: current && history.length > 0 ? 'live' : fallbackCurrent || history.length > 0 ? 'partial' : 'fallback',
    coverage: {
      from: history.length > 0 ? history[0].date : null,
      to: history.length > 0 ? history[history.length - 1].date : null,
      complete: allWindowsOk && history.length > 0
    }
  };
}

module.exports = {
  fetchCoinbaseData,
  historyUrls,
  windowsNeeded,
  normalizeCandles,
  normalizeTicker
};
