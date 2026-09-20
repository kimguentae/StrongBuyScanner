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

// ============================================================
// 확장: 가격·차트 구조 + 거래량 분석 통합
// 기존 getTechnicalData는 그대로 유지, 새 함수 추가
// ============================================================

const { analyzePriceStructure } = require('../engine/priceStructure');
const { analyzeVolume } = require('../engine/volumeAnalysis');

/**
 * 기존 보조지표 + 가격·차트 구조 + 거래량을 한 번에 반환
 * 기존 OHLCV(candles)를 재사용. 추가 API 호출 없음.
 */
async function getFullTechnicalData(marketData) {
  // 1. 기존 보조지표 (그대로)
  const base = await getTechnicalData(marketData);
  if (!base) return null;

  // 2. 가격·차트 구조 (신규)
  let priceStructure = null;
  try {
    priceStructure = analyzePriceStructure(marketData.candles);
  } catch (e) {
    priceStructure = {
      status: 'error',
      message: '가격 구조 분석 실패: ' + e.message
    };
  }

  // 3. 거래량 분석 (신규)
  let volumeAnalysis = null;
  try {
    volumeAnalysis = analyzeVolume(marketData.candles);
  } catch (e) {
    volumeAnalysis = {
      status: 'error',
      message: '거래량 분석 실패: ' + e.message
    };
  }

  return {
    ...base,              // 기존 보조지표 (그대로)
    priceStructure,       // 신규
    volumeAnalysis        // 신규
  };
}

module.exports = { getTechnicalData, getFullTechnicalData };