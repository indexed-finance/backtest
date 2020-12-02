export const last = <T>(arr: T[]): T => arr[arr.length - 1];
export const sum = (arr: number[]): number => arr.reduce((t, n) => t+n, 0);
export const avg = (arr: number[]): number => sum(arr) / arr.length;

export const stdDev = (arr: number[]): number => {
  const mean = avg(arr);
  const dev = arr.map((n) => n - mean);
  const sqrDev = dev.map((d) => d**2);
  const sqrDevSum = sum(sqrDev);
  return Math.sqrt(sqrDevSum / arr.length);
}

/* const varianceAsPercent = (arr: number[]): number[] => {
  const diffs = [];
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1];
    const diff = arr[i] - prev;
    const diffAsPct = (diff / prev) * 100;
    diffs.push(diffAsPct);
  }
  return diffs;
}
 */
export const volatility = (arr: number[]): number => {
  return parseFloat(((stdDev(arr) / avg(arr)) * 100).toFixed(2));
};

const arr = [
  99,
  100,
  101,
  102,
  98,
]
console.log(volatility(arr) * 100)