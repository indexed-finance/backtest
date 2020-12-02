const allTokens = require('./1inch-tokens.json');

const getColor = ({address}) => {
  const str = address.slice(2);
  const r = parseInt(str.slice(0, 2), 16);
  const g = parseInt(str.slice(2, 4), 16);
  const b = parseInt(str.slice(4, 6), 16);
  const color = `rgb(${r},${g},${b})`;
  return color;
}

allTokens.map(token => {
  token.color = getColor(token);
  delete token.chainId;
});