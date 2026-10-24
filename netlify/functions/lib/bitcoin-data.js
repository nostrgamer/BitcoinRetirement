'use strict';

const { BASELINE_END_MS } = require('./baseline');

const COINBASE_BASE_URL = 'https://api.exchange.coinbase.com';
const HISTORY_WINDOW_DAYS = 290;
const MAX_HISTORY_WINDOWS = 4;
// Total time for all history requests; must stay below the browser's 7-second request timeout
// (src/services/BitcoinAPI.ts) so a slow upstream yields partial data instead of a client abort.
const HISTORY_BUDGET_MS = 6000;
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

// True when every completed UTC day after the baseline has a daily close. Coinbase stamps
// daily candles at 00:00 UTC; today's candle is still open, so it isn't required.
function coversEveryDay(byTimestamp, baselineEndMs, nowMs) {
  const firstDay = Math.floor(baselineEndMs / DAY_MS) * DAY_MS + DAY_MS;
  const lastCompletedDay = Math.floor(nowMs / DAY_MS) * DAY_MS - DAY_MS;
  for (let day = firstDay; day <= lastCompletedDay; day += DAY_MS) {
    if (!byTimestamp.has(day)) return false;
  }
  return true;
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
  const deadline = Date.now() + budgetMs;
  const tickerPromise = fetchJson(fetchImpl, `${COINBASE_BASE_URL}/products/BTC-USD/ticker`, Math.min(timeoutMs, budgetMs))
    .then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));

  const needed = windowsNeeded(nowMs, baselineEndMs);
  const urls = historyUrls(nowMs, Math.min(needed, MAX_HISTORY_WINDOWS));
  const byTimestamp = new Map();
  let allWindowsOk = needed <= MAX_HISTORY_WINDOWS;

  // Sequential, newest window first; every request is cut off at the shared deadline.
  for (const url of urls) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      allWindowsOk = false;
      break;
    }
    try {
      const candles = normalizeCandles(await fetchJson(fetchImpl, url, Math.min(timeoutMs, remainingMs)), nowMs);
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
      complete: allWindowsOk && history.length > 0 && coversEveryDay(byTimestamp, baselineEndMs, nowMs)
    }
  };
}

module.exports = {
  fetchCoinbaseData,
  coversEveryDay,
  historyUrls,
  windowsNeeded,
  normalizeCandles,
  normalizeTicker
};
