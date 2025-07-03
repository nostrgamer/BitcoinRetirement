# Bitcoin Retirement Calculator

A comprehensive retirement planning tool that uses Bitcoin's Power Law model to help you plan for financial independence. Calculate retirement timelines, analyze portfolio sustainability, and optimize your Bitcoin accumulation strategy.

## Features

### Power Law Analysis
- **Interactive Bitcoin Chart**: Historical price data from 2012 with Power Law overlay
- **Fair Value Analysis**: Shows current Bitcoin price relative to mathematical fair value
- **Support & Resistance**: Displays Power Law floor (support) and upper bound (resistance) levels
- **Future Projections**: 8-year Power Law projections for long-term planning

### Retirement Planning
- **Portfolio Input**: Enter your Bitcoin holdings, cash reserves, and annual expenses
- **Withdrawal Simulation**: 50-year Monte Carlo-style simulation using realistic Bitcoin cycles
- **Bear Market Testing**: Conservative 20-year bear market survival analysis
- **Retirement Timeline**: Calculate when you can achieve financial independence

### Savings Strategy
- **Monthly Savings Projection**: Model Bitcoin accumulation over time
- **Bear Market Strategy**: Optional 2x savings during bear markets for accelerated growth
- **Cycle-Aware Pricing**: Uses realistic Bitcoin cycle prices for accurate projections
- **Real-Time Updates**: Live Bitcoin price integration for current analysis

## Privacy & Data Storage

**Your Privacy is Protected**

This application is designed with Bitcoin privacy principles in mind:

- **No Data Storage**: Your inputs are never stored, saved, or transmitted to any server
- **Client-Side Only**: All calculations happen locally in your browser
- **No User Tracking**: No analytics, cookies, or user tracking of any kind
- **No Personal Data**: The app doesn't collect, store, or transmit any personal information
- **Works Offline**: Once loaded, the app works without internet (except for live price updates)
- **Open Source**: Full transparency - you can verify the code yourself

**What Data is Used:**
- Historical Bitcoin price data (included in the app, publicly available)
- Current Bitcoin price (fetched from CoinGecko API for display only)
- Your inputs (Bitcoin holdings, expenses) - processed locally, never transmitted

**Your financial information stays on your device and is never shared.**

## Power Law Model

The calculator uses Bitcoin's Power Law model, which suggests that Bitcoin's price follows a mathematical relationship with time:

```
Price = A × (days_since_genesis)^B
```

Where:
- A = 1.01 × 10^-17 (coefficient)
- B = 5.82 (exponent)
- days_since_genesis is calculated from Bitcoin's genesis block (January 3, 2009)

Additional levels:
- **Floor Price**: 42% of fair value (support level)
- **Upper Bound**: 200% of fair value (resistance level)

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/nostrgamer/BitcoinRetirement.git
cd BitcoinRetirement
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### Building for Production

```bash
npm run build
```

The build folder will be ready for deployment to any static hosting service.

## Technology Stack

- **React 18** with TypeScript for type safety
- **Recharts** for interactive data visualization
- **CoinGecko API** for real-time Bitcoin price data
- **CSV Data** for comprehensive historical price data (2012-present)

## Project Structure

```
src/
├── components/
│   └── BitcoinChart.tsx     # Main chart and retirement calculator
├── models/
│   └── PowerLaw.ts          # Power Law calculations and projections
├── services/
│   └── BitcoinAPI.ts        # API service for Bitcoin data
├── types/
│   └── Bitcoin.ts           # TypeScript interfaces
├── App.tsx                  # Main app component
└── index.tsx               # App entry point
public/
└── bitcoin-historical-data.csv  # Historical price data (2012-present)
```

## Testing

Run the test suite:
```bash
npm test
```

The project includes comprehensive tests for:
- Power Law mathematical accuracy
- Retirement calculation business logic
- Bear market survival scenarios
- Monthly savings projections

## License

This project is open source and available under the [MIT License](LICENSE).

**Verify the Code**: As a privacy-focused tool for Bitcoiners, you can inspect the source code to verify that no user data is collected or transmitted. The code is fully transparent and auditable.

## Disclaimer

This tool is for educational and informational purposes only. It does not constitute financial advice. Always consult with a qualified financial advisor before making investment decisions.

**Privacy Notice**: This application does not store, transmit, or share any of your personal or financial information. All calculations are performed locally in your browser to protect your privacy. 