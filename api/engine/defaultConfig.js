// ============================================================
// 서버 측 기본 설정값
// 클라이언트 설정을 반영하려면 요청 body로 config를 받아 병합
// ============================================================

module.exports = {
  weights: { ma: 30, macd: 20, rsi: 15, adx: 15, bb: 20 },
  strongBuyThreshold: 80,
  hardGates: {
    ma50: true, ma200: true, macd: true, adx: true, di: true,
    adxMin: 20
  },
  maPoints: { ma20: 10, ma50: 10, ma200: 10 },
  macdPoints: { signal: 10, zero: 5, hist: 5 },
  rsiBands: [
    { min: 75, max: Infinity, score: 0 },
    { min: 70, max: 75, score: 8 },
    { min: 65, max: 70, score: 13 },
    { min: 55, max: 65, score: 15 },
    { min: 50, max: 55, score: 12 },
    { min: 40, max: 50, score: 7 },
    { min: 0, max: 40, score: 3 }
  ],
  adxBands: [
    { min: 30, max: Infinity, score: 15 },
    { min: 25, max: 30, score: 13 },
    { min: 20, max: 25, score: 9 },
    { min: 15, max: 20, score: 5 },
    { min: 0, max: 15, score: 2 }
  ],
  bbBands: [
    { min: 0.75, max: 0.90, score: 20 },
    { min: 0.60, max: 0.75, score: 17 },
    { min: 0.50, max: 0.60, score: 13 },
    { min: 0.45, max: 0.50, score: 8 },
    { min: 0.20, max: 0.45, score: 4 },
    { min: 0.00, max: 0.20, score: 0 }
  ]
};