import { PoolToken, ReweighData, ReindexData } from "./types";
import { TokenCategory } from "./TokenCategory";
import { bdiv, bmul, bnum, BONE, MIN_WEIGHT } from "../utils/bmath";
import { BalancerPool } from "./BalancerPool";
import { HodlPool } from "./HodlPool";
import { formatBalance, toTokenAmount } from "../utils/bignumber";
import { PoolValueLog } from "../types";
import { tokenMeta } from "../tokens/price-util";


const REWEIGH_MODULO_DIVISOR = 4;
const REWEIGH_DELAY = 604800;
const WEIGHT_MULTIPLIER = BONE.times(25)

interface Pool {
  tokens: PoolToken[];
}

type PoolTokenLog = {
  symbol: string;
  balance: number;
}

type PoolBalanceLog = {
  timestamp: number;
  balances: { [key: string]: number };
}

export type PoolOptions = {
  type: 'balancer' | 'hodl';
  reweigh: boolean;
  swapFee: number;
  size: number;
  dailyJoinVolume: number;
  dailySwapVolume: number;
  initialValue: number;
  minimumTraderProfit: number;
}

let testIndex = 0;

export default class PoolController {
  public step = 1;
  public lastReweigh: number = 0;
  public reweighIndex: number = 0;
  public valueLogs: PoolValueLog[] = [];
  // public balanceLogs: PoolBalanceLog[] = [];

  writeLogs(): void {
    const usdMarketCap = this.pool.marketCap;
    const totalSupply = parseFloat(formatBalance(this.pool.totalSupply, 18, 4));

    this.valueLogs.push({
      timestamp: this.category.getTimeByStep(this.step),
      usdValue: usdMarketCap / totalSupply
    });
    // this.writeBalanceLog()
  }

  // writeBalanceLog() {
  //   const allTokens = this.category.tokens;
  //   const log = { timestamp: this.category.getTimeByStep(this.step), balances: {} };
  //   for (let token of allTokens) {
  //     const poolToken = this.pool.tokenBySymbol(token);
  //     if (poolToken) {
  //       let weight;
  //       if (this.pool instanceof BalancerPool) {
  //         // weight = poolToken.targetDenorm.div(this.pool.totalDenorm);
  //         weight = (parseFloat(formatBalance(poolToken.balance, poolToken.decimals, 10)) * poolToken.usdPrice)// / this.pool.marketCap;
  //       } else {
  //         weight = (parseFloat(formatBalance(poolToken.balance, poolToken.decimals, 10)) * poolToken.usdPrice)// / this.pool.marketCap;
  //       }
  //       log.balances[token] = weight;
  //       //parseFloat(formatBalance(poolToken.balance, poolToken.decimals, 4)) * poolToken.usdPrice;
  //     } else {
  //       log.balances[token] = 0;
  //     }
  //   }
  //   this.balanceLogs.push(log);
  // }

  constructor(
    public category: TokenCategory,
    public pool: BalancerPool | HodlPool,
    public options: PoolOptions
  ) {
    this.lastReweigh = category.getTimeByStep(0);
  }

  static create(category: TokenCategory, options: PoolOptions): PoolController {
    const tokens = category.getInitialPoolTokens(options.initialValue, options.size);
    const name = options.type == 'balancer' ? (options.reweigh ? 'index' : 'balancer') : 'hodl';
    console.log(`POOL ${name} ORIGINAL TOKENS`);
    console.log(tokens.map(t => t.symbol));
    let pool: BalancerPool | HodlPool;
    const totalSupply = toTokenAmount(100, 18);
    if (options.type == 'balancer') {
      const poolOpts = {
        doReweigh: options.reweigh,
        minReweighDelay: 3600,
        weightChangePercent: BONE.div(100),
        swapFee: BONE.times(options.swapFee),
        minimumTraderProfit: options.minimumTraderProfit
      };
      pool = new BalancerPool(tokens, category.getTimeByStep(0), totalSupply, poolOpts);
    } else {
      pool = new HodlPool(tokens, totalSupply, options.reweigh);
    }
    return new PoolController(category, pool, options);
  }

  get shouldReweigh() {
    const timestamp = this.category.getTimeByStep(this.step);
    const elapsed = timestamp - this.lastReweigh;
    return elapsed >= REWEIGH_DELAY;
  }

  get reweighType(): null | 'reweigh' | 'reindex' {
    if (!this.shouldReweigh) return null;
    const remainder = ((++this.reweighIndex) % REWEIGH_MODULO_DIVISOR);
    if (remainder == 0) return 'reindex';
    return 'reweigh';
  }

  updatePoolTokenPrices() {
    const tokens = this.pool.tokenSymbols;
    const prices = this.category.getPrices(this.step, tokens);
    tokens.forEach((token, i) => {
      this.pool.tokenBySymbol(token).usdPrice = prices[i].usdPrice;
    })
  }

  reindexPool() {
    const marketCap = this.pool.marketCap;
    const tokens = this.category.getTopTokens(this.step, this.options.size);
    const weights = this.category.getWeights(this.step, tokens.map(t => t.symbol));
    const reindexData: ReindexData = {};
    tokens.forEach((token, i) => {
      const minimumBalance = toTokenAmount((marketCap / 100) / token.usdPrice, token.decimals);
      reindexData[token.symbol] = {
        symbol: token.symbol,
        usdPrice: token.usdPrice,
        decimals: token.decimals,
        minimumBalance,
        targetDenorm: weights[i].times(WEIGHT_MULTIPLIER),
        weight: weights[i]
      };
    });
    this.pool.reindexTokens(reindexData);
  }

  reweighPool() {
    const marketCap = this.pool.marketCap;
    let symbols: string[];
    if (this.pool instanceof BalancerPool) {
      symbols = this.pool.currentDesiredTokens.map(t => t.symbol);
    } else {
      symbols = this.pool.tokenSymbols;
    }
    const reweighData: ReweighData = {};
    const weights = this.category.getWeights(this.step, symbols);
    const prices = this.category.getPrices(this.step, symbols);
    
    symbols.forEach((symbol, i) => {
      const minimumBalance = toTokenAmount((marketCap / 100) / prices[i].usdPrice, tokenMeta[symbol].decimals);
      reweighData[symbol] = {
        minimumBalance,
        weight: weights[i],
        targetDenorm: weights[i].times(WEIGHT_MULTIPLIER),
      };
    });
    this.pool.reweighTokens(reweighData);
  }

  reweigh() {
    if (!this.options.reweigh) return;
    const _type = this.reweighType;
    if (_type == null) return;
    else if (_type == 'reindex') this.reindexPool();
    else this.reweighPool();
  }

  tick() {
    this.step++;
    this.updatePoolTokenPrices();
    this.reweigh();

    if (this.pool instanceof BalancerPool) {
      const dailyJoinVolume = this.pool.totalSupply.times(this.options.dailyJoinVolume / 24);
      this.pool.joinPool(dailyJoinVolume);
      const hourlySwapVolume = this.options.dailySwapVolume / 24;
      const tokens = this.pool.tokens;
      const hourlySwapValuePerToken = (hourlySwapVolume * this.pool.marketCap * this.options.swapFee) / tokens.length;
      for (let token of tokens) {
        const amount = toTokenAmount(hourlySwapValuePerToken / token.usdPrice, token.decimals);
        // bmul(toTokenAmount(hourlySwapValuePerToken / token.usdPrice, token.decimals), this.pool.swapFee);

        // // const usedBalance = this.pool.usedBalance(token);
        // // const swapFee = bmul(usedBalance, this.pool.swapFee).times(hourlySwapVolume);
        // if (this.step == 10) {
        //   console.log(`TAKING FEES ${formatBalance(swapFee, token.decimals, 10)} ${token.symbol}`);
        //   console.log(`Fee should be ${hourlySwapVolume * 100}% of the balance, which is ${formatBalance(token.balance, token.decimals, 10)}`);
        // }
        // token.balance = token.balance.plus(swapFee);
        token.balance = token.balance.plus(amount);
        if (this.options.reweigh) {
          if (!token.ready && token.balance.gt(token.minimumBalance)) {
            console.log(`UPDATING INPUT TOKEN BECAUSE OF SWAP FEES`)
            this.pool.updateInputToken(token);
          } else if (token.denorm.gt(token.targetDenorm)) {
            this.pool.adjustTokenWeightOut(token);
          } else if (token.targetDenorm.gt(token.denorm)) {
            this.pool.updateInputToken(token);
          }
        }
      }
      this.pool.timestamp = this.category.getTimeByStep(this.step);
      this.pool.arb();
    }
    this.writeLogs();
  }

  static async test(category: TokenCategory, options: PoolOptions): Promise<PoolValueLog[]> {
    const controller = PoolController.create(category, options);
    const len = category.prices.length;
    while (controller.step < len - 1) {
      controller.tick();
    }
    // let name: string;
    // if (options.type == 'balancer') {
    //   if (options.reweigh) {
    //     name = 'index'
    //   } else {
    //     name = 'balancer'
    //   }
    // } else {
    //   name = 'hodl'
    // }
    // const logs = controller.balanceLogs;

    
    // require('fs').writeFileSync(
    //   require('path').join(__dirname, 'h', `${name}.json`),
    //   JSON.stringify(logs)
    // );
    // if (controller.pool instanceof BalancerPool) {
    //   require('fs').writeFileSync(
    //     require('path').join(__dirname, 'h', `${name}-rebalances.json`),
    //     JSON.stringify(controller.pool.rebalanceLogs)
    //   );
    // }
    return controller.valueLogs;
  }
}