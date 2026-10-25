# Bitcoin Retirement Calculator

A retirement planning tool built on Bitcoin's Power Law. Enter your Bitcoin, cash and annual spending, and the calculator tests whether your assets fund 50 years of withdrawals through a deliberately harsh opening stretch.

## Features

### Power Law chart
- **Price history** from 2012 to today with the Power Law fair value, floor (0.42×) and upper bound (2×)
- **Live quote** from Coinbase, with the data source and age shown next to the price
- **Projection** far enough ahead to cover your whole retirement, with your stress path drawn on the chart

### Retirement test
- **Inputs:** Bitcoin holdings, cash, annual withdrawal, years until retirement
- **50-year verdict:** every annual withdrawal must be fully funded on the stress path (below)
- **Floor-forever stress line:** how many years your assets would last if Bitcoin stayed at the floor every year
- **Historical what-if:** the first year your *current* holdings would have passed the same test
- **Smart withdrawals:** cash is spent first when Bitcoin is cheap relative to fair value, and Bitcoin is sold when it isn't

### Monthly savings
- Optional monthly purchases until retirement, bought at the Power Law fair value each month

## The model

### Power Law
The central curve is the published Santostasi/Perrenod 2026 benchmark:

```
log10 P(t) = -16.509 + 5.690 log10(t)
```

- `P(t)` is the benchmark Bitcoin price in USD
- `t` is days since the Genesis block (January 3, 2009, 18:15:05 UTC)

Bands: **floor** = 0.42 × fair value, **upper bound** = 2 × fair value.

### Withdrawals: the stress path

| Retirement year | Bitcoin price used |
|---|---|
| 1–3 | Floor (0.42 × fair value) |
| 4 | Recovery (0.855 × fair value, 75% of the way from floor to fair value) |
| 5–50 | 0.76 × fair value (about 10% below the historical median price-to-fair-value ratio of 0.84, 2012 through September 2026) |

No retirement year is priced above fair value. Retirement starts on the first of next month, plus the years until retirement (set 0 years on 24 October and retirement starts 1 November). Each retirement year has one withdrawal, taken on its first day to cover the next 12 months and priced at that date's fair value times the ratio above.

The first years matter most: on this path roughly 80% of all the Bitcoin a retiree ever sells goes in the first five years, when prices are lowest. That's why the path opens with three floor years.

### Savings
Monthly savings buy Bitcoin at that month's fair value, on the first of each month from next month until retirement starts: 12 purchases per year of saving.

### Scope
- No taxes are modeled.
- Cash earns nothing.
- The stress path is a planning rule, not a forecast.

## Privacy

- **No data storage:** your inputs are never saved or sent anywhere
- **Client-side only:** all calculations run in your browser
- **No tracking:** no analytics, no cookies
- **Open source:** you can verify all of this in the code

**Data the app uses:**
- Historical Bitcoin prices, bundled with the app (`public/bitcoin-historical-data.csv`)
- The current price and recent daily closes from Coinbase, fetched through the site's own `/api/bitcoin-data` function, so your browser contacts no third party
- Your inputs, processed locally and never transmitted

## Getting started

### Prerequisites
- Node.js 22
- npm

### Install and run
```bash
git clone https://github.com/nostrgamer/BitcoinRetirement.git
cd BitcoinRetirement
npm ci
npm start
```
Open [http://localhost:3000](http://localhost:3000). Without the Netlify function running, the app uses the bundled price history.

### Production build
```bash
npm run build
```
Deploys to Netlify as configured in `netlify.toml` (static site + `netlify/functions/bitcoin-data.js`).

### Refreshing the price history
The bundled CSV is extended from Coinbase daily closes. Run this roughly once a year:
```bash
node scripts/refresh-history.mjs
```
It appends closes through the last full month, then regenerates `netlify/functions/lib/baseline.js` (which tells the function how far back to fetch) and `src/models/historicalStats.json` (the historical figures shown in the app). The function can bridge up to four 290-day windows (about 3 years) past the CSV; beyond that the app shows "Price history incomplete".

## Testing

All verification runs locally:
```bash
./VERIFY.sh            # npm ci, type check, unit tests, build, Playwright
./VERIFY.sh --skip-install
```
Set `PLAYWRIGHT_PORT` if port 3210 is taken. The Playwright suite includes a golden test (`golden/v2-stress-path.json`) that locks the full 50-year table for 20 scenarios at a pinned date. Any change to those numbers has to be deliberate.

## Project structure

```
src/
├── components/
│   ├── BitcoinChart.tsx          # Page: composes the pieces below
│   ├── PriceChart.tsx            # Stats header + Power Law chart + stress-path line
│   ├── RetirementInputsPanel.tsx # Inputs, validation messages, savings
│   ├── RetirementAnalysis.tsx    # Verdict, floor-forever line, what-if, assets
│   ├── WithdrawalTable.tsx       # Year-by-year table
│   └── MarketDataStatus.tsx      # Quote source / freshness badge
├── hooks/
│   ├── useMarketData.ts          # Loads and refreshes price data
│   └── useRetirementPlan.ts      # Inputs → validated plan
├── models/
│   ├── PowerLaw.ts               # Power Law curve and bands
│   ├── PricePath.ts              # Stress path, purchase and valuation prices
│   └── historicalStats.json      # Generated historical figures
├── simulation/
│   ├── retirementPlan.ts         # Savings projection + 50-year simulation
│   └── validation.ts             # Input validation
├── services/BitcoinAPI.ts        # Bundled CSV + /api/bitcoin-data
└── utils/                        # Withdrawal strategy, formatting
netlify/functions/                # Same-origin Coinbase proxy
scripts/refresh-history.mjs       # Price history refresh
public/bitcoin-historical-data.csv
```

## License

Free and open source software, released under the [MIT License](LICENSE).

## Disclaimer

This tool is for educational and informational purposes only and is not financial advice.
