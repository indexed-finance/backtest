import { BigNumber, formatBalance, toTokenAmount } from "../utils/bignumber";
import { PoolToken, ReindexData, ReweighData } from "./types";
import {
  BONE, MIN_WEIGHT,
  bdiv, bnum, bmul, bsub,
  calcSingleInGivenPoolOut, calcAllInGivenPoolOut,
  calcOutGivenIn, calcSpotPrice, calcInGivenPrice, calcInGivenOut
} from "../utils/bmath";

function getExternalPriceAsBNum(
  priceIn: number,
  decimalsIn: number,
  priceOut: number,
  decimalsOut: number
) {
  const baseValue = bnum(1);
  const equalValueIn = toTokenAmount(baseValue.div(priceIn), decimalsIn).times(BONE);
  const equalValueOut = toTokenAmount(baseValue.div(priceOut), decimalsOut).times(BONE);
  return bdiv(equalValueIn, equalValueOut);
}

type RebalanceLog = {
  token: string;
  direction: 'up' | 'down';
  oldWeight: number;
  newWeight: number;
}

type PoolConfig = {
  doReweigh: boolean;
  swapFee: BigNumber;
  minReweighDelay: number;
  weightChangePercent: BigNumber;
  minimumTraderProfit: number;
}

export class BalancerPool {
  lastUpdateForToken: { [key: string]: number } = {};
  public rebalanceLogs: RebalanceLog[] = [];

  get doReweigh(): boolean {
    return this.options.doReweigh;
  }

  get swapFee(): BigNumber {
    return this.options.swapFee;
  }

  get totalDenorm(): BigNumber {
    return this.tokens.reduce((total, token) => total.plus(token.denorm), bnum(0));
  }

  get currentDesiredTokens(): PoolToken[] {
    return this.tokens.filter(t => t.targetDenorm.gt(0));
  }

  get tokenSymbols(): string[] {
    return this.tokens.map(t => t.symbol);
  }

  get marketCap(): number {
    return this.tokens.reduce((total, token) => {
      // .times(token.usdPrice)
      const balance = parseFloat(formatBalance(token.balance, token.decimals, 10));
      const value = balance * token.usdPrice;
      return total + value;
    }, 0);
  }

  tokenBySymbol(symbol: string): PoolToken {
    return this.tokens.find(t => t.symbol == symbol);
  }

  getTokenIndex(symbol: string): number {
    for (let i = 0; i < this.tokens.length; i++) {
      if (this.tokens[i].symbol == symbol) return i;
    }
  }

  constructor(
    public tokens: PoolToken[],
    public timestamp: number,
    public totalSupply: BigNumber,
    public options: PoolConfig
  ) {
    for (let token of tokens) {
      this.lastUpdateForToken[token.symbol] = timestamp;
    }
  }

  usedBalance(token: PoolToken): BigNumber {
    return token.ready ? token.balance : token.minimumBalance;
  }

  usedDenorm(token: PoolToken): BigNumber {
    if (!this.doReweigh) return token.denorm;
    if (token.ready) {
      return token.denorm;
    }
    const realToMinRatio = bdiv(
      bsub(token.minimumBalance, token.balance),
      token.minimumBalance
    );
    const weightPremium = bmul(MIN_WEIGHT.div(10), realToMinRatio);
    return MIN_WEIGHT.plus(weightPremium);
  }

  reweighTokens(reweighData: ReweighData) {
    if (!this.doReweigh) return;
    const symbols = Object.keys(reweighData);
    for (let symbol of symbols) {
      let { targetDenorm, minimumBalance } = reweighData[symbol];
      if (targetDenorm.lt(MIN_WEIGHT)) {
        targetDenorm = MIN_WEIGHT;
      }
      const token = this.tokenBySymbol(symbol);
      token.targetDenorm = targetDenorm;
      if (!token.ready) {
        token.minimumBalance = minimumBalance;
      }
    }
  }

  reindexTokens(reindexData: ReindexData) {
    if (!this.doReweigh) return;
    const symbols = Object.keys(reindexData);
    const currentSymbols = [...this.tokenSymbols];
    const usedSymbols = {};
    for (let symbol of symbols) {
      const curToken = this.tokenBySymbol(symbol);
      const { minimumBalance, targetDenorm, decimals, usdPrice } = reindexData[symbol];
      usedSymbols[symbol] = true;
      if (!curToken) {
        const token: PoolToken = {
          balance: bnum(0),
          minimumBalance,
          denorm: bnum(0),
          targetDenorm,
          ready: false,
          usdPrice,
          decimals,
          symbol
        };
        this.tokens.push(token);
      } else {
        curToken.targetDenorm = targetDenorm;
        curToken.usdPrice = usdPrice;
        if (!curToken.ready) {
          curToken.minimumBalance = minimumBalance;
        }
      }
    }
    for (let symbol of currentSymbols) {
      if (!usedSymbols[symbol]) {
        const curToken = this.tokenBySymbol(symbol);
        curToken.targetDenorm = bnum(0);
      }
    }
  }

  updateInputToken(tokenIn: PoolToken) {
    if (!this.doReweigh) return;
    if (tokenIn.ready) {
      return this.adjustTokenWeightIn(tokenIn);
    }
    if (tokenIn.balance.gt(tokenIn.minimumBalance)) {
      tokenIn.ready = true;
      const additionalBalance = bsub(tokenIn.balance, tokenIn.minimumBalance);
      const balRatio = bdiv(additionalBalance, tokenIn.minimumBalance);
      tokenIn.denorm = MIN_WEIGHT.plus(bmul(MIN_WEIGHT, balRatio));
      this.lastUpdateForToken[tokenIn.symbol] = this.timestamp;
      tokenIn.minimumBalance = bnum(0);
      const newWeight = tokenIn.denorm.div(this.totalDenorm).times(100).toNumber();
      const log: RebalanceLog = { oldWeight: 0, newWeight, direction: 'up', token: tokenIn.symbol };
      this.rebalanceLogs.push(log);
    }
  }

  adjustTokenWeightIn(tokenIn: PoolToken) {
    if (!this.doReweigh) return;
    const timeElapsed = this.timestamp - this.lastUpdateForToken[tokenIn.symbol];
    if (
      tokenIn.denorm.gte(tokenIn.targetDenorm) ||
      !tokenIn.ready ||
      timeElapsed < this.options.minReweighDelay
    ) return;
    const oldWeight = tokenIn.denorm.div(this.totalDenorm).times(100).toNumber();
    const maxDiff = bmul(tokenIn.denorm, this.options.weightChangePercent);
    const diff = bsub(tokenIn.targetDenorm, tokenIn.denorm);
    if (diff.gt(maxDiff)) {
      tokenIn.denorm = tokenIn.denorm.plus(maxDiff);
    } else {
      tokenIn.denorm = tokenIn.targetDenorm;
    }
    const newWeight = tokenIn.denorm.div(this.totalDenorm).times(100).toNumber();
    const log: RebalanceLog = { oldWeight, newWeight, direction: 'up', token: tokenIn.symbol };
    this.rebalanceLogs.push(log);
    this.lastUpdateForToken[tokenIn.symbol] = this.timestamp;

  }

  removeToken(token: PoolToken) {
    const index = this.getTokenIndex(token.symbol);
    const value = parseFloat(formatBalance(token.balance, token.decimals, 10)) * token.usdPrice;
    const redeemedValue = value * 0.98;
    const lastToken = this.tokens.pop();
    this.tokens[index] = lastToken;
    const totalDenorm = this.totalDenorm;
    for (let token of this.tokens) {
      const weight = token.denorm.div(totalDenorm);
      const swapOutput = weight.times(redeemedValue).div(token.usdPrice);
      const exact = toTokenAmount(swapOutput, token.decimals);
      token.balance = token.balance.plus(exact);
    }
  }

  adjustTokenWeightOut(tokenIn: PoolToken) {
    if (!this.doReweigh) return;
    const timeElapsed = this.timestamp - this.lastUpdateForToken[tokenIn.symbol];
    if (
      tokenIn.targetDenorm.gte(tokenIn.denorm) ||
      !tokenIn.ready ||
      timeElapsed < this.options.minReweighDelay
    ) return;
    const oldWeight = tokenIn.denorm.div(this.totalDenorm).times(100).toNumber();
    const maxDiff = bmul(tokenIn.denorm, this.options.weightChangePercent);
    const diff = bsub(tokenIn.denorm, tokenIn.targetDenorm);
    if (diff.gt(maxDiff)) {
      tokenIn.denorm = tokenIn.denorm.minus(maxDiff);
    } else {
      tokenIn.denorm = tokenIn.targetDenorm;
    }
    const newWeight = tokenIn.denorm.div(this.totalDenorm).times(100).toNumber();
    const log: RebalanceLog = { oldWeight, newWeight, direction: 'down', token: tokenIn.symbol };
    this.rebalanceLogs.push(log);
    // Add handling for unbind token
    this.lastUpdateForToken[tokenIn.symbol] = this.timestamp;
    if (tokenIn.denorm.lt(MIN_WEIGHT)) {
      this.removeToken(tokenIn);
    }
  }

  swapExactTokensForTokens(
    tokenIn: PoolToken,
    tokenOut: PoolToken,
    amountIn: BigNumber
  ): BigNumber {
    if (!tokenOut.ready) throw Error('Out not ready!');
    if (amountIn.gt(this.usedBalance(tokenIn).div(2))) throw Error('ERR_MAX_IN');
    const amountOut = this.calcOutGivenIn(tokenIn, tokenOut, amountIn);
    if (amountOut.gt(tokenOut.balance.div(3))) throw Error('ERR_MAX_OUT');
    if (amountIn.lte(0)) throw Error('Can not swap 0 tokens.');
    tokenIn.balance = tokenIn.balance.plus(amountIn);
    tokenOut.balance = tokenOut.balance.minus(amountOut);
    this.updateInputToken(tokenIn);
    this.adjustTokenWeightOut(tokenOut);

    return amountOut;
  }

  joinSwapPoolAmountOut(tokenIn: PoolToken, poolAmountOut: BigNumber): BigNumber {
    const amountIn = calcSingleInGivenPoolOut(
      this.usedBalance(tokenIn),
      this.usedDenorm(tokenIn),
      this.totalSupply,
      this.totalDenorm,
      poolAmountOut,
      this.swapFee  
    );
    if (amountIn.gt(this.usedBalance(tokenIn).div(2))) throw Error('ERR_MAX_IN');
    this.totalSupply = this.totalSupply.plus(poolAmountOut);
    tokenIn.balance = tokenIn.balance.plus(amountIn);
    this.updateInputToken(tokenIn);
    return amountIn;
  }

  joinPool(poolAmountOut: BigNumber): BigNumber[] {
    const tokenAmountsIn = calcAllInGivenPoolOut(
      this.tokens.map(t => this.usedBalance(t)),
      this.totalSupply,
      poolAmountOut
    );
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      token.balance = token.balance.plus(tokenAmountsIn[i]);
    }
    this.totalSupply = this.totalSupply.plus(poolAmountOut);
    return tokenAmountsIn;
  }

  calcOutGivenIn(tokenIn: PoolToken, tokenOut: PoolToken, amountIn: BigNumber): BigNumber {
    return calcOutGivenIn(
      this.usedBalance(tokenIn),
      this.usedDenorm(tokenIn),
      tokenOut.balance,
      tokenOut.denorm,
      amountIn,
      this.swapFee
    );
  }

  swapMaxProfit(tokenIn: PoolToken, tokenOut: PoolToken): number {
    const marketPrice = calcSpotPrice(
      this.usedBalance(tokenIn),
      this.usedDenorm(tokenIn),
      tokenOut.balance,
      tokenOut.denorm,
      bnum(0)
    );
    
    const externalPrice = getExternalPriceAsBNum(tokenIn.usdPrice, tokenIn.decimals, tokenOut.usdPrice, tokenOut.decimals);
    const buyPrice = bdiv(marketPrice, BONE.minus(this.swapFee));
    const targetPrice = bmul(externalPrice, BONE.minus(this.swapFee));
    if (targetPrice.gt(buyPrice)) {
      let amountIn = calcInGivenPrice(
        this.usedBalance(tokenIn),
        this.usedDenorm(tokenIn),
        tokenOut.balance,
        tokenOut.denorm,
        targetPrice,
        this.swapFee
      );
      if (amountIn.lte(0)) {
        return 0;
      }
      if (amountIn.gt(this.usedBalance(tokenIn).div(2))) {
        // console.log(`Had to reduce because in exceeded maximum`)
        amountIn = this.usedBalance(tokenIn).div(2);
      }
      let amountOut = this.calcOutGivenIn(tokenIn, tokenOut, amountIn);
      if (amountOut.gt(tokenOut.balance.div(3))) {
        // console.log(`Had to reduce because out exceeded maximum`)
        amountOut = tokenOut.balance.div(4);
        amountIn = calcInGivenOut(
          this.usedBalance(tokenIn),
          this.usedDenorm(tokenIn),
          tokenOut.balance,
          tokenOut.denorm,
          amountOut,
          this.swapFee
        );
        amountOut = this.calcOutGivenIn(tokenIn, tokenOut, amountIn);
      }
      const valueIn = parseFloat(formatBalance(amountIn.times(tokenIn.usdPrice), tokenIn.decimals, 10));
      const valueOut = parseFloat(formatBalance(amountOut.times(tokenOut.usdPrice), tokenOut.decimals, 10));
      if (valueIn >= valueOut) {
        return 0;
      }
      const profit = valueOut - valueIn;
      if (profit < this.options.minimumTraderProfit) return 0;
      this.swapExactTokensForTokens(tokenIn, tokenOut, amountIn);
      return profit;
    }
    return 0;
  }

  arb() {
    let profit = new BigNumber(0);
    for (let i = 0 ; i < this.tokens.length; i++) {
      for (let j = 0; j < this.tokens.length; j++) {
        if (j == i) continue;
        const tokenIn = this.tokens[i];
        const tokenOut = this.tokens[j];
        if (!tokenOut.ready) continue;
        let newProfit = this.swapMaxProfit(tokenIn, tokenOut);
        profit = profit.plus(newProfit);
        if (newProfit > 1000) {
          console.log(
            `NEW PROFIT ${newProfit} | Swapped ${tokenIn.symbol} for ${tokenOut.symbol} |` +
            `Weights In ${tokenIn.denorm.div(this.totalDenorm).times(100).toNumber()}% :: Out ${tokenOut.denorm.div(this.totalDenorm).times(100).toNumber()}%`
          )
        }
        while (newProfit != 0) {
          newProfit = this.swapMaxProfit(tokenIn, tokenOut);
          profit = profit.plus(newProfit);
        }
      }
    }
  }
}