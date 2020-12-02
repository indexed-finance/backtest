import { BigNumber } from "../utils/bignumber";
import { TimeSeriesPrice } from "../types";

export function computeWeights(marketCaps: BigNumber[], sqrt: boolean = true): BigNumber[] {
  let sum = new BigNumber(0);
  for (let marketCap of marketCaps) {
    let val = sqrt ? marketCap.sqrt() : marketCap;
    sum = sum.plus(val);
  }
  const weights: BigNumber[] = [];
  for (let marketCap of marketCaps) {
    let val = sqrt ? marketCap.sqrt() : marketCap;
    weights.push(val.div(sum));
  }
  return weights;
}