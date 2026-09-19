// ============================================================
// marketProvider — Yahoo Finance 단일 provider
// 🇺🇸 미국 + 🇰🇷 한국 모두 Yahoo Finance
// ============================================================

const { getYahooData } = require('./yahooProvider');

async function getMarketData(stock) {
  return await getYahooData(stock);
}

module.exports = { getMarketData };