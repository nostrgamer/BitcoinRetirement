export const formatPrice = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  } else {
    return `$${value.toFixed(2)}`;
  }
};

/** Whole dollars with separators, e.g. $49,596. */
export const formatUsd = (value: number): string => `$${Math.round(value).toLocaleString('en-US')}`;

export const formatBtc = (value: number, decimals = 3): string => `${value.toFixed(decimals)} BTC`;
