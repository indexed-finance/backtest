import { PoolValueLog } from "../types";

export type Dataset = {
  label: string;
  fill: boolean;
  data: number[];
  pointRadius: number;
  backgroundColor: string;
  borderColor: string;
};

export const toDataset = (label: string, color: string, values: number[]) => ({
  label,
  fill: false,
  pointRadius: 0.5,
  data: values,
  backgroundColor: color,
  borderColor: color
});

export const toLabels = (timestamps: number[]): string[] => timestamps
  .map(t => new Date(t * 1000))
  .map((d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`);

export const logsToDataset = (logs: PoolValueLog[], color: string, label: string): Dataset => {
  const values = logs.map(l => l.usdValue);
  return {
    label,
    fill: false,
    pointRadius: 0.5,
    data: values,
    backgroundColor: color,
    borderColor: color
  };
}