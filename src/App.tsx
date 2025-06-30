import React from 'react';
import BitcoinChart from './components/BitcoinChart';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Bitcoin Retirement Calculator</h1>
        <p>Bitcoin Price vs Power Law Analysis</p>
      </header>
      <main>
        <BitcoinChart />
      </main>
    </div>
  );
}

export default App; 