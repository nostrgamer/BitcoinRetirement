import { BitcoinPriceData } from '../types/Bitcoin';

export class BitcoinAPI {
  private static readonly COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
  

  
  /**
   * Fetch current Bitcoin price
   */
  static async getCurrentPrice(): Promise<number> {
    try {
      const response = await fetch(`${this.COINGECKO_BASE_URL}/simple/price?ids=bitcoin&vs_currencies=usd`);
      const data = await response.json();
      return data.bitcoin.usd;
    } catch (error) {
      console.error('Error fetching current Bitcoin price:', error);
      throw new Error('Failed to fetch current Bitcoin price');
    }
  }

  /**
   * Fetch historical Bitcoin price data
   * @param days Number of days of history to fetch (max 365 for free API)
   */
  static async getHistoricalPrices(days: number = 365): Promise<BitcoinPriceData[]> {
    try {
      // Limit to 365 days for free API
      const limitedDays = Math.min(days, 365);
      
      const response = await fetch(
        `${this.COINGECKO_BASE_URL}/coins/bitcoin/market_chart?vs_currency=usd&days=${limitedDays}&interval=daily`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Transform the data format
      const priceData: BitcoinPriceData[] = data.prices.map((item: [number, number]) => {
        const [timestamp, price] = item;
        const date = new Date(timestamp);
        
        return {
          date: date.toISOString().split('T')[0],
          price: price,
          timestamp: timestamp
        };
      });
      
      return priceData;
    } catch (error) {
      console.error('Error fetching historical Bitcoin prices:', error);
      throw new Error('Failed to fetch historical Bitcoin prices');
    }
  }

  /**
   * Load historical data from CSV and supplement with recent API data
   */
  static async getHistoricalDataWithCSV(): Promise<BitcoinPriceData[]> {
    try {
      console.log('Loading Bitcoin historical data from CSV...');
      
      // Try to load CSV data first
      const response = await fetch('/bitcoin-historical-data.csv');
      
      if (response.ok) {
        const csvText = await response.text();
        const csvData = this.parseCSVData(csvText);
        
        if (csvData.length > 0) {
          console.log(`Loaded ${csvData.length} data points from CSV (${csvData[0]?.date} to ${csvData[csvData.length - 1]?.date})`);
          
          // Check if CSV data is recent (within 7 days)
          const latestCsvDate = new Date(csvData[csvData.length - 1].date);
          const today = new Date();
          const daysSinceLastData = Math.floor((today.getTime() - latestCsvDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceLastData <= 7) {
            console.log(`CSV data is current (${daysSinceLastData} days old)`);
            return csvData;
          }
          
          // Supplement with recent API data
          console.log(`CSV data is ${daysSinceLastData} days old, fetching recent data...`);
          try {
            const recentData = await this.getHistoricalPrices(Math.min(daysSinceLastData + 5, 30));
            
            // Combine CSV with recent API data (remove overlaps)
            const combinedData = [...csvData];
            recentData.forEach(apiPoint => {
              const existsInCsv = csvData.some(csvPoint => csvPoint.date === apiPoint.date);
              if (!existsInCsv) {
                combinedData.push(apiPoint);
              }
            });
            
            combinedData.sort((a, b) => a.timestamp - b.timestamp);
            console.log(`Combined dataset: ${combinedData.length} total data points`);
            return combinedData;
          } catch (apiError) {
            console.log('Recent API data failed, using CSV only');
            return csvData;
          }
        }
      }
      
      console.log('CSV not found, falling back to extended API data...');
      return this.getExtendedHistoricalPrices();
      
    } catch (error) {
      console.error('Error loading CSV data:', error);
      return this.getExtendedHistoricalPrices();
    }
  }

  /**
   * Parse CSV data into BitcoinPriceData format
   */
  private static parseCSVData(csvText: string): BitcoinPriceData[] {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return [];
    
    const headers = lines[0].toLowerCase().split(',');
    console.log('CSV Headers:', headers);
    
    // Find column indices
    let dateIndex = headers.findIndex(h => h.includes('date'));
    let priceIndex = headers.findIndex(h => h.includes('price'));
    let timestampIndex = headers.findIndex(h => h.includes('timestamp'));
    
    if (dateIndex === -1) dateIndex = 0;
    if (priceIndex === -1) priceIndex = 1;
    
    const priceData: BitcoinPriceData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',');
        if (values.length >= Math.max(dateIndex, priceIndex) + 1) {
          const dateStr = values[dateIndex].trim();
          const priceStr = values[priceIndex].trim();
          
          const date = new Date(dateStr);
          const price = parseFloat(priceStr);
          
          if (!isNaN(date.getTime()) && !isNaN(price) && price > 0) {
            let timestamp = date.getTime();
            
            // Use timestamp from CSV if available
            if (timestampIndex !== -1 && values[timestampIndex]) {
              const csvTimestamp = parseInt(values[timestampIndex].trim());
              if (!isNaN(csvTimestamp)) {
                timestamp = csvTimestamp;
              }
            }
            
            priceData.push({
              date: date.toISOString().split('T')[0],
              price: price,
              timestamp: timestamp
            });
          }
        }
      } catch (error) {
        continue; // Skip malformed lines
      }
    }
    
    return priceData.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Fetch extended historical data using browser-friendly APIs
   */
  static async getExtendedHistoricalPrices(): Promise<BitcoinPriceData[]> {
    try {
      console.log('Trying extended Bitcoin price data...');
      let backupData: BitcoinPriceData[] | null = null;
      
      // Try CryptoCompare with extended limit first (often works best for longer periods)
      console.log('Trying CryptoCompare API with extended limit...');
      try {
        // Try getting even more historical data from CryptoCompare
        const cryptoCompareResponse = await fetch(
          `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000&toTs=${Math.floor(Date.now() / 1000)}`
        );
        
        if (cryptoCompareResponse.ok) {
          const cryptoData = await cryptoCompareResponse.json();
          console.log(`CryptoCompare extended: Got ${cryptoData.Data?.Data ? cryptoData.Data.Data.length : 0} data points`);
          
          if (cryptoData.Data?.Data && cryptoData.Data.Data.length > 1000) {
            const priceData: BitcoinPriceData[] = cryptoData.Data.Data.map((item: any) => {
              const date = new Date(item.time * 1000);
              return {
                date: date.toISOString().split('T')[0],
                price: item.close,
                timestamp: item.time * 1000
              };
            });
            
            const startDate = priceData[0]?.date;
            const endDate = priceData[priceData.length - 1]?.date;
            console.log(`Successfully got ${priceData.length} data points from CryptoCompare extended (from ${startDate} to ${endDate})`);
            
            // Check if we got data back to 2017-2018 (that would include the 2017 peak)
            if (startDate && new Date(startDate).getFullYear() <= 2018) {
              console.log('🎉 Got 2017-2018 data including the cycle peak!');
              return priceData;
            } else {
              console.log(`CryptoCompare only goes back to ${startDate}, storing as backup and continuing to try Yahoo Finance for 2017 data...`);
              backupData = priceData; // Store as backup
            }
          }
        } else {
          console.log('CryptoCompare response not ok or insufficient data');
        }
      } catch (cryptoError) {
        console.log('CryptoCompare extended failed:', cryptoError);
      }

      // Try Alternative APIs that are more CORS-friendly
      console.log('Trying CORS-friendly crypto APIs...');
      
      // Try CoinAPI.io (often CORS-friendly)
      try {
        console.log('Trying CoinAPI.io for historical data...');
        const coinApiResponse = await fetch(
          `https://rest.coinapi.io/v1/ohlcv/BITSTAMP_SPOT_BTC_USD/history?period_id=1DAY&time_start=2017-01-01T00:00:00&time_end=${new Date().toISOString()}&limit=3000`
        );
        
        if (coinApiResponse.ok) {
          const coinApiData = await coinApiResponse.json();
          console.log(`CoinAPI.io: Got ${coinApiData.length} data points`);
          
          if (coinApiData.length > 1000) {
            const priceData: BitcoinPriceData[] = coinApiData.map((item: any) => {
              const date = new Date(item.time_period_start);
              return {
                date: date.toISOString().split('T')[0],
                price: item.price_close,
                timestamp: date.getTime()
              };
            });
            
            const startDate = priceData[0]?.date;
            const endDate = priceData[priceData.length - 1]?.date;
            console.log(`Successfully got ${priceData.length} data points from CoinAPI.io (from ${startDate} to ${endDate})`);
            
            if (startDate && new Date(startDate).getFullYear() <= 2018) {
              console.log('🎉 CoinAPI.io got 2017-2018 data including the cycle peak!');
            }
            
            return priceData;
          }
        }
      } catch (coinApiError) {
        console.log('CoinAPI.io failed:', coinApiError);
      }

      // Try CoinMarketCap (sometimes CORS-friendly for historical)
      try {
        console.log('Trying alternative CoinGecko endpoint with longer range...');
        // Try different date range approach
        const response = await fetch(
          `${this.COINGECKO_BASE_URL}/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily`
        );
        
        if (response.ok) {
          const data = await response.json();
          console.log(`CoinGecko max: Got ${data.prices ? data.prices.length : 0} data points`);
          
          if (data.prices && data.prices.length > 1500) {
            const priceData: BitcoinPriceData[] = data.prices.map((item: [number, number]) => {
              const [timestamp, price] = item;
              const date = new Date(timestamp);
              
              return {
                date: date.toISOString().split('T')[0],
                price: price,
                timestamp: timestamp
              };
            });
            
            const startDate = priceData[0]?.date;
            const endDate = priceData[priceData.length - 1]?.date;
            console.log(`Successfully got ${priceData.length} data points from CoinGecko max (from ${startDate} to ${endDate})`);
            
            if (startDate && new Date(startDate).getFullYear() <= 2018) {
              console.log('🎉 CoinGecko max got 2017-2018 data including the cycle peak!');
            }
            
            return priceData;
          }
        }
      } catch (geckoMaxError) {
        console.log('CoinGecko max failed:', geckoMaxError);
      }

      // Try CryptoCompare with weekly data for longer history
      console.log('Trying CryptoCompare weekly data for extended history...');
      try {
        // Weekly data often goes back much further than daily
        const cryptoWeeklyResponse = await fetch(
          `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000&aggregate=7`
        );
        
        if (cryptoWeeklyResponse.ok) {
          const cryptoWeeklyData = await cryptoWeeklyResponse.json();
          console.log(`CryptoCompare weekly: Got ${cryptoWeeklyData.Data?.Data ? cryptoWeeklyData.Data.Data.length : 0} data points`);
          
          if (cryptoWeeklyData.Data?.Data && cryptoWeeklyData.Data.Data.length > 1000) {
            const priceData: BitcoinPriceData[] = cryptoWeeklyData.Data.Data.map((item: any) => {
              const date = new Date(item.time * 1000);
              return {
                date: date.toISOString().split('T')[0],
                price: item.close,
                timestamp: item.time * 1000
              };
            });
            
            const startDate = priceData[0]?.date;
            const endDate = priceData[priceData.length - 1]?.date;
            console.log(`Successfully got ${priceData.length} weekly data points from CryptoCompare (from ${startDate} to ${endDate})`);
            
            // Check if we got 2017-2018 data
            if (startDate && new Date(startDate).getFullYear() <= 2018) {
              console.log('🎉 CryptoCompare weekly got 2017-2018 data including the cycle peak!');
            }
            
            return priceData;
          }
        }
      } catch (cryptoWeeklyError) {
        console.log('CryptoCompare weekly failed:', cryptoWeeklyError);
      }
      
      // If we have backup data from earlier CryptoCompare attempt, use it
      if (backupData && backupData.length > 0) {
        console.log(`Using CryptoCompare backup data (${backupData.length} points from ${backupData[0]?.date} to ${backupData[backupData.length-1]?.date})`);
        return backupData;
      }
      
      // Try CryptoCompare API second (good CORS support)
      console.log('Trying CryptoCompare API...');
      try {
        const cryptoCompareResponse = await fetch(
          `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000`
        );
        
        if (cryptoCompareResponse.ok) {
          const cryptoData = await cryptoCompareResponse.json();
          console.log(`CryptoCompare API: Got ${cryptoData.Data?.Data ? cryptoData.Data.Data.length : 0} data points`);
          
          if (cryptoData.Data?.Data && cryptoData.Data.Data.length > 365) {
            const priceData: BitcoinPriceData[] = cryptoData.Data.Data.map((item: any) => {
              const date = new Date(item.time * 1000);
              return {
                date: date.toISOString().split('T')[0],
                price: item.close,
                timestamp: item.time * 1000
              };
            });
            
            console.log(`Successfully got ${priceData.length} data points from CryptoCompare`);
            return priceData;
          }
        }
      } catch (cryptoError) {
        console.log('CryptoCompare failed:', cryptoError);
      }
      
      // Try using CORS proxy for CoinCap
      console.log('Trying CoinCap via CORS proxy...');
      try {
        const startDate = new Date('2017-01-01').getTime();
        const endDate = new Date().getTime();
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const targetUrl = `https://api.coincap.io/v2/assets/bitcoin/history?interval=d1&start=${startDate}&end=${endDate}`;
        
        const response = await fetch(proxyUrl + targetUrl);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`CoinCap via proxy: Got ${data.data ? data.data.length : 0} data points`);
          
          if (data.data && data.data.length > 365) {
            const priceData: BitcoinPriceData[] = data.data.map((item: any) => {
              const date = new Date(item.time);
              return {
                date: date.toISOString().split('T')[0],
                price: parseFloat(item.priceUsd),
                timestamp: item.time
              };
            });
            
            console.log(`Successfully got ${priceData.length} data points from CoinCap via proxy`);
            return priceData;
          }
        }
      } catch (coinCapError) {
        console.log('CoinCap via proxy failed:', coinCapError);
      }
      
      // Try CoinGecko with longer period using different endpoint
      console.log('Trying CoinGecko range API...');
      try {
        const startTimestamp = Math.floor(new Date('2017-01-01').getTime() / 1000);
        const endTimestamp = Math.floor(new Date().getTime() / 1000);
        
        const response = await fetch(
          `${this.COINGECKO_BASE_URL}/coins/bitcoin/market_chart/range?vs_currency=usd&from=${startTimestamp}&to=${endTimestamp}`
        );
        
        if (response.ok) {
          const data = await response.json();
          console.log(`CoinGecko range API: Got ${data.prices ? data.prices.length : 0} data points`);
          
          if (data.prices && data.prices.length > 365) {
            const priceData: BitcoinPriceData[] = data.prices.map((item: [number, number]) => {
              const [timestamp, price] = item;
              const date = new Date(timestamp);
              
              return {
                date: date.toISOString().split('T')[0],
                price: price,
                timestamp: timestamp
              };
            });
            
            console.log(`Successfully got ${priceData.length} data points from CoinGecko range API`);
            return priceData;
          }
        }
      } catch (geckoError) {
        console.log('CoinGecko range API failed:', geckoError);
      }
      
      console.log('All extended APIs failed, falling back to CoinGecko 365 days');
      return this.getHistoricalPrices(365);
      
    } catch (error) {
      console.error('Error fetching extended historical Bitcoin prices:', error);
      return this.getHistoricalPrices(365);
    }
  }
} 