# Bitcoin Retirement Calculator

A web application that visualizes Bitcoin price against the Power Law model to help with retirement planning decisions.

## Features

- **Real-time Bitcoin Price**: Fetches current Bitcoin price from CoinGecko API
- **Power Law Model**: Calculates Bitcoin's "fair value" using the power law formula
- **Interactive Chart**: Displays both actual Bitcoin price and power law model over time
- **Price Analysis**: Shows whether Bitcoin is currently above or below fair value
- **Responsive Design**: Works on desktop and mobile devices

## Privacy & Data Storage

**🔒 Your Privacy is Protected**

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

# Power Law Mode

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

**Verify the Code**: As a privacy-focused tool for Bitcoiners, you can inspect the source code to verify that no user data is collected or transmitted. The code is fully transparent and auditable.

## Disclaimer

This tool is for educational and informational purposes only. It does not constitute financial advice. Always consult with a qualified financial advisor before making investment decisions.

**Privacy Notice**: This application does not store, transmit, or share any of your personal or financial information. All calculations are performed locally in your browser to protect your privacy. 