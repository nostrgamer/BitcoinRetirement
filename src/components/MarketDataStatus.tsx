import React from 'react';
import { BitcoinQuote } from '../types/Bitcoin';

export const marketDataStatusLabel = (quote: BitcoinQuote): string => {
  if (quote.status === 'live') return 'Live market quote';
  if (quote.status === 'cached') return 'Cached / stale market quote';
  return 'Fallback historical quote';
};

const MarketDataStatus: React.FC<{ quote: BitcoinQuote }> = ({ quote }) => (
  <div className={`market-data-status market-data-status--${quote.status}`} role="status">
    <span className="market-data-badge">{marketDataStatusLabel(quote)}</span>
    <span>
      Source: {quote.source} · Observed: {new Date(quote.observedAt).toLocaleString()}
    </span>
    {quote.stale && (
      <span className="market-data-warning">
        Fresh market data is unavailable; calculations remain usable with the labeled observation above.
      </span>
    )}
  </div>
);

export default MarketDataStatus;
