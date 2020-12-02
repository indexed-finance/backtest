import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import bodyparser from 'body-parser';
import { Dataset } from './utils/datasets';
import { PoolValueLog } from './types';
import { getMovingAverages, simulateWeights, simulatePools } from './simulators';
import { PoolOptions } from './simulators/PoolController';
import { getVolatility, tokenMeta } from './tokens/price-util';
import { toDataset, toLabels } from './utils/datasets';
import { startRedirectServer } from 'httpRedirect';
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyparser.json());

const PORT = +(process.env.PORT) || 3001;

app.post('/price-datasets', async function(req, res) {
  const { tokens } = req.body;
  const data = await getMovingAverages(tokens);
  res.json(data);
});

app.post('/weight-datasets', async function(req, res) {
  const { tokens, size } = req.body;
  console.log(`Getting weights for tokens ${size}`);
  console.log(tokens)
  const data = await simulateWeights({ tokens, size });
  res.json(data);
});

const logsToDataset = (logs: PoolValueLog[], color: string, label: string): Dataset => {
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

app.post('/volatility', async function(req, res) {
  const { tokens } = req.body;
  const volatilityMap = await getVolatility(tokens, 7);
  const labels = toLabels(volatilityMap.timestamps);
  const datasets: Dataset[] = [];
  tokens.forEach((token) => {
    datasets.push(toDataset(`${token} Volatility`, tokenMeta[token].color, volatilityMap.volatilityByToken[token]));
  });
  res.json({ datasets, labels });
})

app.post('/backtest', async function (req, res) {
  const {
    tokens, swapFee, initialValue,
    dailyJoinVolume, dailySwapVolume,
    hodl, index, balancer, size,
    minimumTraderProfit
  } = req.body;
  const poolOptions = {
    tokens,
    dailyJoinVolume: dailyJoinVolume / 100,
    dailySwapVolume: dailySwapVolume / 100,
    swapFee: swapFee / 100,
    initialValue,
    minimumTraderProfit: minimumTraderProfit || 5
  };
  let poolLogs: undefined | PoolValueLog[];
  let balancerLogs: undefined | PoolValueLog[];
  let hodlLogs: undefined | PoolValueLog[];
  const pools: PoolOptions[] = [];

  if (index) {
    pools.push({ type: 'balancer', reweigh: true, size, ...poolOptions });
  }
  if (balancer) {
    pools.push({ type: 'balancer', reweigh: false, size, ...poolOptions });
  }
  if (hodl) {
    pools.push({ type: 'hodl', reweigh: true, size, ...poolOptions });
  }
  const poolValueLogs = await simulatePools({ tokens, pools });
  if (index) poolLogs = poolValueLogs.shift();
  if (balancer) balancerLogs = poolValueLogs.shift();
  if (hodl) hodlLogs = poolValueLogs.shift();

  const datasets = [];
  const labels = [poolLogs,balancerLogs,hodlLogs].filter(x=>x)[0]
    .map(p => new Date(p.timestamp * 1000))
    .map((d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`);

  const colorBest = 'rgb(31, 122, 31)';
  const colorHodl = 'rgb(0, 45, 179)';
  const colorSecond = 'rgb(255, 0, 102)';

  if (index && balancer) {
    const balEndValue = balancerLogs[balancerLogs.length - 1].usdValue;
    const indexEndValue = poolLogs[poolLogs.length - 1].usdValue;
    let [balancerColor, indexColor] = balEndValue > indexEndValue ? [colorBest, colorSecond] : [colorSecond, colorBest];
    datasets.push(logsToDataset(balancerLogs, balancerColor, 'Balancer Pool'));
    datasets.push(logsToDataset(poolLogs, indexColor, 'Index Pool'));
  } else if (index) {
    datasets.push(logsToDataset(poolLogs, colorBest, 'Index Pool'));
  } else if (balancer) {
    datasets.push(logsToDataset(balancerLogs, colorBest, 'Balancer Pool'));
  }
  if (hodl) {
    datasets.push(logsToDataset(hodlLogs, colorHodl, 'Simple Rebalancer'));
  }
  res.json({ datasets, labels });
});


const root = path.join(__dirname, 'public');
app.use(express.static(root));


app.get('*', function (req, res) {
  res.sendFile('index.html', { root });
});

if (PORT == 443) {
  // Certificate
  const privateKey = fs.readFileSync('/etc/letsencrypt/live/backtest.indexed.finance/privkey.pem', 'utf8');
  const certificate = fs.readFileSync('/etc/letsencrypt/live/backtest.indexed.finance/cert.pem', 'utf8');
  const ca = fs.readFileSync('/etc/letsencrypt/live/backtest.indexed.finance/chain.pem', 'utf8');

  const credentials = {
    key: privateKey,
    cert: certificate,
    ca
  };
  const server = https.createServer(credentials, app);
  server.listen(PORT, () => console.log(`listening on port ${PORT}`));
  startRedirectServer();

} else {
  app.listen(PORT, () => console.log(`listening on port ${PORT}`))
}