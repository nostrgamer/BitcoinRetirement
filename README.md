# Bitcoin Retirement Calculator

A web application that visualizes Bitcoin price against the Power Law model to help with retirement planning decisions.

## Features

- **Real-time Bitcoin Price**: Fetches current Bitcoin price from CoinGecko API
- **Power Law Model**: Calculates Bitcoin's "fair value" using the power law formula
- **Interactive Chart**: Displays both actual Bitcoin price and power law model over time
- **Price Analysis**: Shows whether Bitcoin is currently above or below fair value
- **Responsive Design**: Works on desktop and mobile devices

## Power Law Model

The app uses the Bitcoin Power Law model which suggests that Bitcoin's price follows a mathematical relationship with time:

```
Price = A × (days_since_genesis)^B
```

Where:
- A ≈ 10^-15.5 (coefficient)
- B ≈ 5.84 (exponent)
- days_since_genesis is calculated from Bitcoin's genesis block (January 3, 2009)

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd BitcoinRetire
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

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm run build` - Builds the app for production
- `npm test` - Launches the test runner
- `npm run eject` - Ejects from Create React App (one-way operation)

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Recharts** - Data visualization
- **CoinGecko API** - Bitcoin price data

## Project Structure

```
src/
├── components/
│   └── BitcoinChart.tsx     # Main chart component
├── models/
│   └── PowerLaw.ts          # Power law calculations
├── services/
│   └── BitcoinAPI.ts        # API service for Bitcoin data
├── types/
│   └── Bitcoin.ts           # TypeScript interfaces
├── App.tsx                  # Main app component
└── index.tsx               # App entry point
```

## Future Enhancements

This is the foundation for a more comprehensive Bitcoin retirement calculator. Future features may include:

- Portfolio input (Bitcoin, cash, other assets)
- Monthly expense tracking
- Asset allocation recommendations
- Monte Carlo simulations
- Retirement timeline projections

## License

This project is open source and available under the [MIT License](LICENSE).

## Disclaimer

This tool is for educational and informational purposes only. It does not constitute financial advice. Always consult with a qualified financial advisor before making investment decisions. 