'use strict';

const { fetchCoinbaseData } = require('./lib/bitcoin-data');

const LIVE_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';
const FALLBACK_CACHE = 'public, max-age=15, s-maxage=30, stale-if-error=600';

function createHandler(fetchData = fetchCoinbaseData) {
  return async function handler() {
    const data = await fetchData();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': data.status === 'fallback' ? FALLBACK_CACHE : LIVE_CACHE
      },
      body: JSON.stringify(data)
    };
  };
}

module.exports = { createHandler, handler: createHandler() };
