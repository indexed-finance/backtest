import { BigNumber } from '../utils/bignumber';

export type PoolToken = {
  symbol: string;
  ready?: boolean;
  usdPrice: number;
  decimals: number;
  balance: BigNumber;
  minimumBalance: BigNumber;
  denorm: BigNumber;
  targetDenorm: BigNumber;
};

export type TokenWeightUpdate = {
  targetDenorm: BigNumber;
  weight: BigNumber;
  minimumBalance: BigNumber;
};

export type ReweighData = {
  [key: string]: TokenWeightUpdate;
}

export type TokenReindexUpdate = {
  minimumBalance: BigNumber;
  targetDenorm: BigNumber;
  weight: BigNumber;
  usdPrice: number;
  decimals: number;
  symbol: string;
}

export type ReindexData = {
  [key: string]: TokenReindexUpdate;
}