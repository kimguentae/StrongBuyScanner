// ============================================================
// technicalScore — 기술 점수 계산 엔진
// 입력: tech 데이터 + config
// 출력: { score, breakdown, grade }
// ============================================================

function calcTechnicalScore(tech, config) {
  const breakdown = {
    ma: scoreMA(tech, config),
    macd: scoreMACD(tech, config),
    rsi: scoreRSI(tech.rsi, config),
    adx: scoreADX(tech, config),
    bb: scoreBB(tech, config)
  };

  const score = breakdown.ma.score + breakdown.macd.score +
                breakdown.rsi.score + breakdown.adx.score +
                breakdown.bb.score;

  return { score, breakdown };
}

function gradeFromScore(score, config) {
  const t = config.strongBuyThreshold;
  if (score >= t) return 'STRONG_BUY';
  if (score >= 65) return 'BUY';
  if (score >= 45) return 'HOLD';
  if (score >= 25) return 'SELL';
  return 'STRONG_SELL';
}

function scoreMA(tech, cfg) {
  let score = 0;
  const conditions = [];

  if (tech.ma20 != null) {
    const pass = tech.price > tech.ma20;
    conditions.push({ label: '현재가 > MA20', pass });
    if (pass) score += cfg.maPoints.ma20;
  }
  if (tech.ma50 != null) {
    const pass = tech.price > tech.ma50;
    conditions.push({ label: '현재가 > MA50', pass });
    if (pass) score += cfg.maPoints.ma50;
  }
  if (tech.ma200 != null) {
    const pass = tech.price > tech.ma200;
    conditions.push({ label: '현재가 > MA200', pass });
    if (pass) score += cfg.maPoints.ma200;
  }

  return { score, max: cfg.weights.ma, conditions };
}

function scoreMACD(tech, cfg) {
  let score = 0;
  const conditions = [];

  if (tech.macd != null && tech.macdSignal != null) {
    const pass = tech.macd > tech.macdSignal;
    conditions.push({ label: 'MACD > Signal', pass });
    if (pass) score += cfg.macdPoints.signal;
  }
  if (tech.macd != null) {
    const pass = tech.macd > 0;
    conditions.push({ label: 'MACD > 0', pass });
    if (pass) score += cfg.macdPoints.zero;
  }
  if (tech.macdHist != null) {
    const pass = tech.macdHist > 0;
    conditions.push({ label: 'Histogram > 0', pass });
    if (pass) score += cfg.macdPoints.hist;
  }

  return { score, max: cfg.weights.macd, conditions };
}

function scoreRSI(rsi, cfg) {
  if (rsi == null) return { score: 0, max: cfg.weights.rsi, value: null };
  const band = cfg.rsiBands.find(b => rsi >= b.min && rsi < b.max);
  return {
    score: band ? band.score : 0,
    max: cfg.weights.rsi,
    value: rsi
  };
}

function scoreADX(tech, cfg) {
  if (tech.adx == null) {
    return { score: 0, max: cfg.weights.adx, value: null, conditions: [] };
  }
  const band = cfg.adxBands.find(b => tech.adx >= b.min && tech.adx < b.max);
  const conditions = [];

  if (tech.plusDI != null && tech.minusDI != null) {
    conditions.push({
      label: '+DI > -DI',
      pass: tech.plusDI > tech.minusDI
    });
  }

  return {
    score: band ? band.score : 0,
    max: cfg.weights.adx,
    value: tech.adx,
    conditions
  };
}

function scoreBB(tech, cfg) {
  if (tech.bbUpper == null || tech.bbLower == null || tech.bbUpper <= tech.bbLower) {
    return { score: 0, max: cfg.weights.bb, position: null };
  }
  const pos = (tech.price - tech.bbLower) / (tech.bbUpper - tech.bbLower);
  const band = cfg.bbBands.find(b => pos >= b.min && pos < b.max);
  return {
    score: band ? band.score : 0,
    max: cfg.weights.bb,
    position: pos
  };
}

module.exports = { calcTechnicalScore, gradeFromScore };