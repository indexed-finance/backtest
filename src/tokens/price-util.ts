import fs from 'fs';
import path from 'path';
import { getUniswapTokenPrices } from './uniswap-subgraph';
import { TokenPrice, TimeSeriesPrices, TimeSeriesVolatility } from './types';
import { avg, last, volatility } from '../utils/misc';

const tokenMeta = require('./data/tokens.json');
const pricesPath = path.join(__dirname, 'data', 'prices');
if (!fs.existsSync(pricesPath)) {
  fs.mkdirSync(pricesPath);
}

type PricePartial = { usdPrice: number };

export { tokenMeta };

export const getMovingAveragePrice = (prices: PricePartial[], days: number, index: number): number => {
  const startAt = Math.max(index - days, 0);
  const lastPrices = prices.slice(startAt, index + 1);
  return avg(lastPrices.map(p => p.usdPrice));
}

const DAY = 86400;

// function interpolatePrices(prices: TokenPrice[]): TokenPrice[] {
//   let daysInRange = (prices[prices.length - 1].timestamp - prices[0].timestamp) / DAY;
//   const pricesByTimestamp: { [key: string]: TokenPrice } = prices.reduce((obj, price) => ({ ...obj, [price.timestamp]: price }), {});
//   let firstTimestamp = prices[0].timestamp;
//   let lastFilledIndex = 0;
//   for (let dayIndex = 1; dayIndex < daysInRange; dayIndex++) {
//     const timestamp = firstTimestamp + (DAY * dayIndex);
//     if (!pricesByTimestamp[timestamp]) {
//       const nextTime = +Object.keys(pricesByTimestamp).find(k => +(k) > timestamp);
//       const lastPrice = pricesByTimestamp[Object.keys(pricesByTimestamp)[lastFilledIndex]];
//       const elapsedDays = (nextTime - lastPrice.timestamp) / DAY;
//       const nextPrice = pricesByTimestamp[nextTime];
//       const priceDiff = (nextPrice.usdPrice - lastPrice.usdPrice) / elapsedDays;
//       const mcapDiff = (nextPrice.marketCap - lastPrice.marketCap) / elapsedDays;
//       const index = (timestamp - lastPrice.timestamp) / DAY;
//       pricesByTimestamp[timestamp] = {
//         timestamp,
//         marketCap: lastPrice.marketCap + (mcapDiff * index),
//         usdPrice: lastPrice.usdPrice + (priceDiff * index)
//       };
//     } else {
//       lastFilledIndex = dayIndex;
//     }
//   }
//   return Object.keys(pricesByTimestamp).map(k => pricesByTimestamp[k]);
// }
function interpolatePrices(prices: TokenPrice[]): TokenPrice[] {
  let hoursInRange = (prices[prices.length - 1].timestamp - prices[0].timestamp) / 3600;
  const pricesByTimestamp: { [key: string]: TokenPrice } = prices.reduce((obj, price) => ({ ...obj, [price.timestamp]: price }), {});
  let firstTimestamp = prices[0].timestamp;
  let lastFilledIndex = 0;
  for (let hourIndex = 1; hourIndex < hoursInRange; hourIndex++) {
    const timestamp = firstTimestamp + (3600 * hourIndex);
    if (!pricesByTimestamp[timestamp]) {
      const nextTime = +Object.keys(pricesByTimestamp).find(k => +(k) > timestamp);
      const lastPrice = pricesByTimestamp[Object.keys(pricesByTimestamp)[lastFilledIndex]];
      const elapsedHours = (nextTime - lastPrice.timestamp) / 3600;
      const nextPrice = pricesByTimestamp[nextTime];
      const priceDiff = (nextPrice.usdPrice - lastPrice.usdPrice) / elapsedHours;
      const mcapDiff = (nextPrice.marketCap - lastPrice.marketCap) / elapsedHours;
      const index = (timestamp - lastPrice.timestamp) / 3600;
      pricesByTimestamp[timestamp] = {
        timestamp,
        marketCap: lastPrice.marketCap + (mcapDiff * index),
        usdPrice: lastPrice.usdPrice + (priceDiff * index)
      };
    } else {
      lastFilledIndex = hourIndex;
    }
  }
  return Object.keys(pricesByTimestamp).map(k => pricesByTimestamp[k]);
}


async function getOrLoadTokenPrices(token: string): Promise<TokenPrice[]> {
  const tokenPricePath = path.join(pricesPath, `${token}.json`);
  if (fs.existsSync(tokenPricePath)) {
    return require(tokenPricePath);
  }
  const rawPrices = await getUniswapTokenPrices(token);
  const { totalSupply } = tokenMeta[token];
  const preprocessed = rawPrices.map(
    ({ priceUSD, date }) => ({ timestamp: date, usdPrice: priceUSD, marketCap: priceUSD * totalSupply })
  );
  const processed = interpolatePrices(preprocessed);
  fs.writeFileSync(tokenPricePath, JSON.stringify(processed));
  return processed;
}

export async function getTokenPrices(tokens: string[]): Promise<TimeSeriesPrices[]> {
  const pricesBySymbol: { [key: string ]: TokenPrice[] } = (
    await Promise.all(tokens.map(getOrLoadTokenPrices))
  ).reduce(
    (obj, prices, i) => ({ ...obj, [tokens[i]]: prices }),
    {}
  );
  const newestFirstPrice = Math.max(...tokens.map((token) => pricesBySymbol[token][0].timestamp));
  const oldestLastPrice = Math.min(...tokens.map((token) => last(pricesBySymbol[token]).timestamp));
  for (let token of tokens) {
    pricesBySymbol[token] = pricesBySymbol[token].filter(
      (p) => (p.timestamp >= newestFirstPrice && p.timestamp <= oldestLastPrice)
    );
  }
  const timeSeriesData: { [key: string]: TimeSeriesPrices } = {};
  for (let token of tokens) {
    const prices = pricesBySymbol[token];
    const totalSupply = tokenMeta[token].totalSupply;
    prices.forEach((price, i) => {
      const { timestamp } = price;
      if (!timeSeriesData[timestamp]) {
        timeSeriesData[timestamp] = { timestamp, prices: {} }
      }
      const twapUsdPrice = getMovingAveragePrice(prices, 7 * 24, i);
      const twapMarketCap = twapUsdPrice * totalSupply;
      timeSeriesData[timestamp].prices[token] = { ...price, twapMarketCap, twapUsdPrice };
    });
  }
  let keys = Object.keys(timeSeriesData);
  return keys.map(timestamp => timeSeriesData[timestamp]);
}

export async function getVolatility(tokens: string[], movingAverageDays: number): Promise<TimeSeriesVolatility> {
  const volMap: TimeSeriesVolatility = {
    timestamps: [],
    volatilityByToken: {}
  };
  const prices = await getTokenPrices(tokens);
  const maHours = movingAverageDays * 24;
  for (let token of tokens) {
    const maVolatility: number[] = [];
    const tokenPrices = prices.map(p => p.prices[token].usdPrice);
    for (let i = 0; i < prices.length; i++) {
      const startAt = Math.max(i - maHours, 0);
      const lastPrices = tokenPrices.slice(startAt, i + 1);
      const vol = volatility(lastPrices);
      maVolatility.push(vol);
    }
    volMap.volatilityByToken[token] = maVolatility;
  }
  volMap.timestamps = prices.map(p => p.timestamp);
  return volMap;
}