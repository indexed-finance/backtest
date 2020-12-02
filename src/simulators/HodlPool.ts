import { BigNumber, formatBalance, toTokenAmount } from "../utils/bignumber";
import { PoolValueLog } from '../types';
import { bnum, BONE } from "../utils/bmath";
import { PoolToken, ReindexData, ReweighData } from "./types";

export type HodlPoolConfig = {
  tokens: string[];
  initialValue: number;
  reweigh: boolean;
}

export class HodlPool {
  lastUpdateForToken: { [key: string]: number } = {};
  public valueLogs: PoolValueLog[] = [];
  step: number = 1;
  lastReweigh: number;

  get marketCap(): number {
    return this.tokens.reduce((total, token) => {
      // .times(token.usdPrice)
      const balance = parseFloat(formatBalance(token.balance, token.decimals, 10));
      const value = balance * token.usdPrice;
      return total + value;
    }, 0);
  }

  get tokenSymbols(): string[] {
    return this.tokens.map(t => t.symbol);
  }

  getTokenIndex(symbol: string): number {
    for (let i = 0; i < this.tokens.length; i++) {
      if (this.tokens[i].symbol == symbol) return i;
    }
  }

  tokenBySymbol(symbol: string): PoolToken {
    return this.tokens.find(t => t.symbol == symbol);
  }

  constructor(
    public tokens: PoolToken[],
    public totalSupply: BigNumber,
    public reweigh: boolean
  ) {}

  reweighTokens(reweighData: ReweighData) {
    if (!this.reweigh) return;
    const totalValue = this.marketCap;
    const symbols = Object.keys(reweighData);
    const weights = symbols.map(s => reweighData[s].weight);
    weights.forEach((weight, i) => {
      const tokenValue = weight.times(totalValue);
      const token = this.tokens[i];
      const balance = tokenValue.div(token.usdPrice);
      token.balance = toTokenAmount(balance, token.decimals);
    });
  }

  reindexTokens(reindexData: ReindexData) {
    const symbols = Object.keys(reindexData);
    const currentSymbols = [...this.tokenSymbols];
    const usedSymbols = {};
    const totalValue = this.marketCap;
    this.tokens = [];
    for (let symbol of symbols) {
      usedSymbols[symbol] = true;
    }
    for (let symbol of currentSymbols) {
      if (!usedSymbols[symbol]) {
        const i = this.getTokenIndex(symbol);
        delete this.tokens[i];
        const lastToken = this.tokens.pop();
        this.tokens[i] = lastToken;
      }
    }
    for (let symbol of symbols) {
      const { decimals, weight, usdPrice } = reindexData[symbol];
      const tokenValue = weight.times(totalValue);
      const balance = tokenValue.div(usdPrice);
      this.tokens.push({
        decimals,
        symbol,
        targetDenorm: bnum(0),
        denorm: bnum(0),
        balance: toTokenAmount(balance, decimals),
        minimumBalance: bnum(0),
        usdPrice
      });
    }
  }
}

// export async function testHodlPool(options: HodlPoolConfig): Promise<PoolValueLog[]> {
//   const symbols = options.tokens;
//   const tokenPrices = await getTimeSeriesPrices(symbols);
//   const firstPrices = symbols.map(s => tokenPrices[0].prices[s]);
//   const initialWeights = computeWeights(firstPrices.map(p => p.marketCap));
//   const tokens: PoolToken[] = [];
//   for (let i = 0; i < symbols.length; i++) {
//     const symbol = symbols[i];
//     const initialPrice = firstPrices[i];
//     const weight = initialWeights[i];
//     const denorm = weight.times(WEIGHT_MULTIPLIER);
//     const tokenValue = weight.times(options.initialValue);
//     const balance = tokenValue.div(initialPrice.usdPrice);
//     const token: PoolToken = {
//       symbol,
//       decimals: tokenData[symbol].decimals,
//       totalSupply: initialPrice.totalSupply,
//       marketCap: initialPrice.marketCap,
//       balance: toTokenAmount(balance, tokenData[symbol].decimals),
//       denorm,
//       targetDenorm: denorm,
//       minimumBalance: bnum(0),
//       usdPrice: initialPrice.usdPrice,
//       ready: true,
//     };
//     tokens.push(token);
//   }
//   const pool = new HodlPool(
//     tokens,
//     tokenPrices,
//     BONE.times(100),
//     tokenPrices[0].timestamp,
//     options.reweigh
//   );
//   pool.execute();
//   return pool.valueLogs;
// }