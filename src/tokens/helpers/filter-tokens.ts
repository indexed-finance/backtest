const tokens = require('../data/tokens1.json');
const latestPrices = require('../data/latest-prices.json');

import fs from 'fs';
import path from 'path';

async function test() {
  const symbols = Object.keys(tokens);
  const preSorted = [];
  for (let symbol of symbols) {
    const token = tokens[symbol];
    const { totalSupply } = token;
    const price = latestPrices[symbol];
    const marketCap = totalSupply * price;
    if (price > 0 && marketCap >= 1000000) {
      preSorted.push({ ...token, marketCap, price })
    }
  }
  preSorted.sort((a, b) => b.marketCap - a.marketCap);
  const tokenList = preSorted.map(({ name, symbol }) => ({ name, symbol }));
  
  fs.writeFileSync(
    path.join(__dirname, 'filtered-list.json'),
    JSON.stringify(tokenList)
  );
}

test()