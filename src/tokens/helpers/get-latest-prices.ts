import fs from 'fs';
import path from 'path';
import { getLastTokenPrices } from '../uniswap-subgraph';

const tokensPath = path.join(__dirname, '..', 'data', 'tokens1.json');
const pricesPath = path.join(__dirname, '..', 'data', 'latest-prices.json');

const allTokens = require(tokensPath);

const symbols = Object.keys(allTokens);

async function getPrices() {
  const chunkSize = 25;
  const ret = {};
  const proms = [];
  for (let i = 0; i < symbols.length; i += chunkSize) {
    proms.push(
      getLastTokenPrices(symbols.slice(i, i + chunkSize)).then((data) => {
        Object.assign(ret, data)
      })
    );
  }
  await Promise.all(proms);
  fs.writeFileSync(pricesPath, JSON.stringify(ret));
}

getPrices()