import fetch from 'isomorphic-fetch';
import { UniswapTokenPrice } from '../types';
import { RateLimiter } from '../utils/rate-limit';

const tokenData = require('./data/tokens.json');

const SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2'

const limiter = new RateLimiter(2, 1500);

const executeQuery = async (query: string, url: string = SUBGRAPH_URL): Promise<any> => {
  const opts = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query
    }),
  };

  const response = await limiter.rateLimit<any[], any>(fetch, url, opts)
  const { data } = await response.json();
  return data;
}

const tokenDayData = `{
  date
  priceUSD
}`

const tokenPricesQuery = (address: string, skip?: number) => {
  const filter = `(first: 1000${skip ? `, skip: ${skip}` : ''}, where: { token: "${address}", priceUSD_gt: 0 })`;
  return `
  {
    tokenDayDatas${filter} ${tokenDayData}
  }`;
};

async function queryPrices(address: string, skip?: number) {
  try {
    let { tokenDayDatas: newPrices } = await executeQuery(tokenPricesQuery(address, skip));
    if (!newPrices) {
      console.log(tokenPricesQuery(address, skip));
      throw Error(`GOT NULL RESULT FOR QUERY`);
    }
    if (!newPrices.length) {
      console.log(tokenPricesQuery(address, skip));
      console.log('GOT EMPTY RESULT FOR QUERY')
    }
    return newPrices;
  } catch (err) {
    console.log(`Caught Error During Query:`);
    console.log(err.message);
    console.log(`Trying Again!`);
    let { tokenDayDatas: newPrices } = await executeQuery(tokenPricesQuery(address, skip));
    return newPrices;
  }
}

const parseTokenPrices = (prices: any[]): UniswapTokenPrice[] => prices.map((p) => ({
  date: parseInt(p.date), priceUSD: parseFloat(p.priceUSD)
}));

export async function getUniswapTokenPrices(symbol: string): Promise<UniswapTokenPrice[]> {
  console.log(`Querying token prices for ${symbol}`)
  const { address } = tokenData[symbol];
  let allPrices = [];
  let newPrices = await queryPrices(address);
  let skip = 1000;
  allPrices = [...newPrices];
  while (newPrices.length == 1000) {
    newPrices = await queryPrices(address, skip);
    skip += 1000;
    allPrices = [...allPrices, ...newPrices];
  }
  const prices = parseTokenPrices(allPrices);
  return prices;
}

export async function getLastTokenPrices(symbols: string[]): Promise<{ [key: string]: number }> {
  const toFilter = (address: string) => `(first: 1, where: { token: "${address.toLowerCase()}" }, orderBy: date, orderDirection: desc)`;
  const aliasedQueries = [];
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const { address } = tokenData[symbol];
    const filter = toFilter(address);
    // Prefix alias with X so symbols with numeric character do not throw errs
    const query = `X${symbol}: tokenDayDatas${filter} {
      priceUSD
    }`;
    aliasedQueries.push(query);
  }
  const query = ['{', ...aliasedQueries, '}'].join('\n');
  const data = await executeQuery(query);
  const ret: {[key: string]: number} = {};
  for (let symbol of symbols) {
    const priceReturned = data[`X${symbol}`][0];
    if (priceReturned) {
      ret[symbol] = parseFloat(priceReturned.priceUSD);
    }
  }
  return ret;
}