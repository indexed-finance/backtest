import { tokenMeta } from "../tokens/price-util";
import PoolController, { PoolOptions } from "./PoolController";
import { TokenCategory } from "./TokenCategory";
import { Dataset, toDataset, toLabels, logsToDataset } from '../utils/datasets';
import { PoolValueLog } from "../types";
import { TimeSeriesPrice } from '../tokens/types';

export type PoolSimOptions = {
  tokens: string[];
  pools: PoolOptions[];
}

export async function getMovingAverages(tokens: string[]): Promise<{ /* marketcapDatasets: Dataset[], */ priceDatasets: Dataset[], labels: string[] }> {
  const category = await TokenCategory.create(tokens);
  let len = category.prices.length;
  const priceDatasets: Dataset[] = [];
  const marketcapDatasets: Dataset[] = [];
  const tokenPrices: { [key: string]: number[] } = {};
  const tokenMarketCaps: { [key: string]: number[] } = {};
  tokens.forEach((token) => {
    tokenPrices[token] = [];
    tokenMarketCaps[token] = [];
  });
  const originalPrices: { [key: string]: number } = {};
  // const originalMarketCaps: { [key: string]: number } = {};

  const processPrices = (prices: TimeSeriesPrice[], i: number) => {
    prices.forEach((price, j) => {
      const token = tokens[j];
      if (i == 0) {
        originalPrices[token] = price.usdPrice;
        // originalMarketCaps[token] = price.marketCap;
      } else {
        const originalPrice = originalPrices[token];
        // const originalMarketCap = originalMarketCaps[token];
        tokenPrices[token].push(((price.usdPrice - originalPrice) / originalPrice) * 100);
        // tokenMarketCaps[token].push(((price.marketCap - originalMarketCap) / originalMarketCap) * 100);
      }
    });
  }

  for (let i = 0; i < len; i++) {
    const prices = category.getPrices(i, tokens);
    processPrices(prices, i);
  }
  for (let token of tokens) {
    const color = tokenMeta[token].color;
    const marketcapDataset = toDataset(`${token} Market Cap (% Change)`, color, tokenMarketCaps[token]);
    const priceDataset = toDataset(`${token} Price (% Change)`, color, tokenPrices[token]);
    marketcapDatasets.push(marketcapDataset);
    priceDatasets.push(priceDataset);
  }
  const labels = toLabels(category.prices.slice(1).map(p => p.timestamp));
  return { priceDatasets, /* marketcapDatasets, */ labels };
}

export async function simulatePools(options: PoolSimOptions): Promise<PoolValueLog[][]> {
  const category = await TokenCategory.create(options.tokens);
  const proms: Promise<PoolValueLog[]>[] = [];
  for (let pool of options.pools) {
    proms.push(PoolController.test(category, pool));
  }
  return Promise.all(proms);
}

export type WeightSimOptions = {
  tokens: string[];
  size: number;
}

const REWEIGH_DELAY = 604800;

export async function simulateWeights(options: WeightSimOptions): Promise<{ datasets: Dataset[], labels: string[] }> {
  const category = await TokenCategory.create(options.tokens);
  let reweighIndex = 0;
  let lastReweigh = category.prices[0].timestamp;
  let step = 1;
  const weights: { [key: string]: number[] } = options.tokens.reduce(
    (obj, token) => ({ ...obj, [token]: [] }), {}
  );
  let tokens: string[] = category.getTopTokens(0, options.size).map(t => t.symbol);
  const updateWeights = () => {
    const newWeights = category.getWeights(step, tokens);
    options.tokens.forEach((token, i) => {
      let ind = tokens.indexOf(token);
      if (ind >= 0)  {
        weights[token].push(newWeights[ind].toNumber())
      } else {
        weights[token].push(0);
      }
    });
  }
  updateWeights();

  const reweighTimestamps: number[] = [lastReweigh];

  for (; step < category.prices.length; step++) {
    const { timestamp } = category.prices[step];
    const elapsed = timestamp - lastReweigh;
    if (elapsed >= REWEIGH_DELAY) {
      if (((++reweighIndex) % 4) == 0) {
        tokens = category.getTopTokens(step, options.size).map(t => t.symbol);
      }
      lastReweigh = timestamp;
      reweighTimestamps.push(timestamp);
      updateWeights();
    }
  }
  const datasets: Dataset[] = [];
  const labels = toLabels(reweighTimestamps)

  for (let token of options.tokens) {
    const color = tokenMeta[token].color;
    const tokenWeights = weights[token].map(w => w * 100);
    const dataset = toDataset(`${token} Weight (%)`, color, tokenWeights);
    datasets.push(dataset);
  }

  return { datasets, labels };
}