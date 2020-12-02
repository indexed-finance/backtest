import { BigNumber, toTokenAmount } from "../utils/bignumber";
import { TimeSeriesPrice, TimeSeriesPrices } from "../tokens/types";
import { sum } from '../utils/misc';
import { bnum, BONE } from "../utils/bmath";
import { getTokenPrices, tokenMeta } from '../tokens/price-util';
import { PoolToken } from "./types";

type TokenPartial = {
  symbol: string;
  usdPrice: number;
  decimals: number;
}

const WEIGHT_MULTIPLIER = BONE.times(25)

export class TokenCategory {
  constructor(
    public tokens: string[],
    public prices: TimeSeriesPrices[]
  ) {}

  static async create(allTokens: string[]): Promise<TokenCategory> {
    const timeSeriesPrices = await getTokenPrices(allTokens);
    return new TokenCategory(allTokens, timeSeriesPrices);
  }

  getTimeByStep(step: number): number {
    return this.prices[step].timestamp;
  }

  tokenPrice(step: number, token: string): number {
    return this.prices[step].prices[token].usdPrice;
  }

  getPrices(step: number, tokens: string[]): TimeSeriesPrice[] {
    return tokens.map(t => this.prices[step].prices[t]);
  }

  getTopTokens(step: number, size: number): TokenPartial[] {
    const tokensAndMcaps: { token: string, marketCap: number }[] = this.tokens.reduce(
      (arr, token) => ([
        ...arr,
        { token, marketCap: this.prices[step].prices[token].twapMarketCap }
      ]), []
    );
    tokensAndMcaps.sort((a, b) => (b.marketCap - a.marketCap));
    return tokensAndMcaps.slice(0, size).map(({ token }) => ({
      symbol: token,
      usdPrice: this.tokenPrice(step, token),
      decimals: tokenMeta[token].decimals
    }));
  }

  getWeights(step: number, tokens: string[]): BigNumber[] {
    const mcaps = tokens.map((token) => this.prices[step].prices[token].twapMarketCap);
    const sqrts = mcaps.map(m => Math.sqrt(m));
    const sumSqrts = sum(sqrts);
    const weights = sqrts.map(sq => bnum(sq / sumSqrts));
    return weights;
  }

  getInitialPoolTokens(initialValue: number, size: number): PoolToken[] {
    const poolTokens: PoolToken[] = [];
    const topTokens = this.getTopTokens(0, size);
    const weights = this.getWeights(0, topTokens.map(t => t.symbol));
    const denorms = weights.map(w => w.times(WEIGHT_MULTIPLIER));
    for (let i = 0; i < size; i++) {
      const { symbol, decimals, usdPrice } = topTokens[i];
      const weight = weights[i];
      const denorm = denorms[i];
      const balance = toTokenAmount(weight.times(initialValue).div(usdPrice), decimals);
      // console.log(`INITIAL POOL TOKEN ${balance} ${symbol} (${weight.times(100).toNumber()}%) :: $${weight.times(initialValue).toNumber()}`)
      const token: PoolToken = {
        symbol,
        decimals,
        usdPrice,
        denorm,
        targetDenorm: denorm,
        balance,
        minimumBalance: bnum(0),
        ready: true
      };
      poolTokens.push(token);
    }
    return poolTokens;
  }
}

