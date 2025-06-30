export interface BitcoinPriceData {
  date: string;
  price: number;
  timestamp: number;
}

export interface PowerLawData {
  date: string;
  fairValue: number;
  timestamp: number;
}

export interface ChartDataPoint {
  date: string;
  actualPrice: number | null;
  powerLawPrice: number;
  powerLawFloor: number;
  powerLawUpperBound: number;
  timestamp: number;
} 