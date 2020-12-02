import { BigNumber } from "./utils/bignumber.js";

export type TokenPartial = {
  symbol: string;
  name: string;
  decimals: number;
}

export type PoolToken = {
  symbol: string;
  ready?: boolean;
  usdPrice: number;
  decimals: number;
  balance: BigNumber;
  minimumBalance: BigNumber;
  denorm: BigNumber;
  targetDenorm: BigNumber;
  marketCap: BigNumber;
  totalSupply: BigNumber;
};

export type ReweighLog = {
  timestamp: number;
  symbol: string;
  weight: number;
};

export type PoolValueLog = {
  timestamp: number;
  usdValue: number;
};

export type TokenPrice = {
  timestamp: number;
  totalSupply: BigNumber;
  usdPrice: number;
  marketCap: BigNumber;
};

export type TimeSeriesPrice = {
  totalSupply: BigNumber;
  usdPrice: number;
  marketCap: BigNumber;
}

export type TimeSeriesPrices = {
  timestamp: number;
  prices: { [key: string]: TimeSeriesPrice };
}

export type UniswapTokenPrice = {
  date: number;
  priceUSD: number;
}