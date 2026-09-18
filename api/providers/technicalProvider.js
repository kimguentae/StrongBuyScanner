// ============================================================
// technicalProvider — OHLCV에서 내부 계산
// 외부 API 호출 없음. marketProvider의 candles를 사용.
// ============================================================

const { computeIndicators } = require('../engine/indicators');

/**
 * @param {Object} marketData - getMarketData()의 반환값
 *   { symbol, price, currency, candles, updatedAt }
 * @returns 기술지표 객체 (technicalScore.js 입력 형식)
 */
async function getTechnicalData(marketData) {
  if (!marketData || !Array.isArray(marketData.candles)) {
    return null;
  }

  if (marketData.candles.length < 200) {
    return null;
  }

  const indicators = computeIndicators(marketData.candles);
  if (!indicators) return null;

  return {
    symbol: marketData.symbol,
    price: indicators.price,
    ma20: indicators.ma20,
    ma50: indicators.ma50,
    ma200: indicators.ma200,
    macd: indicators.macd,
    macdSignal: indicators.macdSignal,
    macdHist: indicators.macdHist,
    rsi: indicators.rsi,
    adx: indicators.adx,
    plusDI: indicators.plusDI,
    minusDI: indicators.minusDI,
    bbUpper: indicators.bbUpper,
    bbMiddle: indicators.bbMiddle,
    bbLower: indicators.bbLower
  };
}

module.exports = { getTechnicalData };