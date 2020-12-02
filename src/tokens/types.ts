export type TokenPrice = {
  timestamp: number;
  marketCap: number;
  usdPrice: number;
};

export type TimeSeriesPrice = {
  timestamp: number;
  marketCap: number;
  usdPrice: number;
  twapMarketCap: number;
  twapUsdPrice: number;
}

export type TimeSeriesPrices = {
  timestamp: number;
  prices: { [key: string]: TimeSeriesPrice };
}

export type TimeSeriesVolatility = {
  timestamps: number[];
  volatilityByToken: { [key: string]: number[] }
}