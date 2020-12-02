# Indexed Backtesting

Library for backtesting various pool strategies including Balancer, Set and Indexed.

A pool should be configured with:
- Daily volume range as a percent
- Swap fee
- Underlying assets the pool can select from
- Size of the pool
- Historical price data for the underlying assets over the backtest period.

Library should be able to produce the following as time-series data:
- Impermanent loss suffered by the pool
- Fees generated
- Token allocations
- Pool value