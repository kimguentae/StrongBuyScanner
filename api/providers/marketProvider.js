// ============================================================
// marketProvider — 국가별 라우터
// 🇺🇸 미국 → Stooq (무료, 무제한)
// 🇰🇷 한국 → Yahoo Finance (비공식, 무료)
// ============================================================

const { getStooqData } = require('./stooqProvider');
const { getYahooData } = require('./yahooProvider');

async function getMarketData(stock) {
  if (stock.country === 'US') {
    return await getStooqData(stock);
  }
  if (stock.country === 'KR') {
    return await getYahooData(stock);
  }
  throw new Error(`Unsupported country: ${stock.country}`);
}

module.exports = { getMarketData };