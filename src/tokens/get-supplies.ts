import { Provider } from '@ethersproject/providers';
import { CallInput, MultiCall } from '@indexed-finance/multicall';
import { Interface } from 'ethers/lib/utils';
import { formatBalance } from '../utils/bignumber';
import { bnum } from '../utils/bmath';

const ABI = [{
  "inputs": [],
  "name": "totalSupply",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}];

type TokenPartial = { address: string; decimals: number; };

export async function getTokenSupplies(tokens: TokenPartial[], provider: Provider): Promise<number[]> {
  const iface = new Interface(ABI);
  const multi = new MultiCall(provider);
  const calls: CallInput[] = [];
  for (let token of tokens) {
    calls.push({ target: token.address, function: 'totalSupply' });
  }
  const response = await multi.multiCall(iface, calls);
  const arr: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const supply = bnum(response[i]);
    const converted = formatBalance(supply, tokens[i].decimals, 4);
    arr.push(parseFloat(converted));
  }
  return arr;
}