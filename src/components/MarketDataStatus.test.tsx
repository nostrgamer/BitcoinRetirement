import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarketDataStatus from './MarketDataStatus';

describe('MarketDataStatus', () => {
  it('renders live provenance and the actual observation timestamp', () => {
    const markup = renderToStaticMarkup(<MarketDataStatus quote={{
      price: 101000,
      observedAt: Date.parse('2026-08-15T11:59:00.000Z'),
      source: 'Coinbase Exchange BTC-USD',
      status: 'live',
      stale: false
    }} />);

    expect(markup).toContain('Live market quote');
    expect(markup).toContain('Source: Coinbase Exchange BTC-USD');
    expect(markup).toContain('Observed:');
    expect(markup).not.toContain('Fresh market data is unavailable');
  });

  it('visibly labels stale fallback data without calling it live', () => {
    const markup = renderToStaticMarkup(<MarketDataStatus quote={{
      price: 93381,
      observedAt: Date.parse('2024-12-31T00:00:00.000Z'),
      source: 'Bundled historical CSV',
      status: 'fallback',
      stale: true
    }} />);

    expect(markup).toContain('Fallback historical quote');
    expect(markup).toContain('Source: Bundled historical CSV');
    expect(markup).toContain('Fresh market data is unavailable');
    expect(markup).not.toContain('Live market quote');
  });
});
