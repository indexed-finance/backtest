import { InfuraProvider } from '@ethersproject/providers';
import { getTokenSupplies } from '../get-supplies';
import fs from 'fs';
import path from 'path';

const filePath = path.join(__dirname, '..', 'data', 'comp-list.json')

const allTokens = require(filePath);

const provider = new InfuraProvider('mainnet', '442bad44b92344b7b5294e4329190fea');

const symbols = Object.keys(allTokens);

async function queryChunk(start: number, size: number) {
  const chunkSymbols = symbols.slice(start, start + size);
  const tokenPartials = chunkSymbols.map(s => allTokens[s]);
  console.log(tokenPartials)
  const supplies = await getTokenSupplies(tokenPartials, provider);
  for (let i = 0; i < supplies.length; i++) {
    const symbol = symbols[start + i];
    allTokens[symbol].totalSupply = supplies[i];
  }
}

async function fillTotalSupplies() {
  const chunkSize = 5;
  const proms = [];
  for (let i = 0; i < symbols.length; i += chunkSize) {
    console.log(`CHUNK ${i} to ${i + chunkSize}`)
    proms.push(queryChunk(i, chunkSize));
  }
  await Promise.all(proms);
  fs.writeFileSync(
    filePath,
    JSON.stringify(allTokens, null, 2)
  );
}

fillTotalSupplies()