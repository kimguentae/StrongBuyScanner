// ============================================================
// strongBuy — Hard Gate 검사 + Analyst Strong Buy 판정
// ============================================================

const DEFAULT_HARD_GATES = {
  ma50: true,
  ma200: true,
  macd: true,
  adx: true,
  di: true,
  adxMin: 20
};

function checkHardGates(tech, config) {
  // config 또는 config.hardGates가 없으면 기본값 사용 (500 에러 방지)
  const g = (config && config.hardGates) || DEFAULT_HARD_GATES;
  const failures = [];

  if (g.ma50 && tech.ma50 != null) {
    if (!(tech.price > tech.ma50)) failures.push('현재가 ≤ MA50');
  }
  if (g.ma200 && tech.ma200 != null) {
    if (!(tech.price > tech.ma200)) failures.push('현재가 ≤ MA200');
  }
  if (g.macd && tech.macd != null && tech.macdSignal != null) {
    if (!(tech.macd > tech.macdSignal)) failures.push('MACD ≤ Signal');
  }
  if (g.adx && tech.adx != null) {
    if (tech.adx < g.adxMin) failures.push(`ADX < ${g.adxMin}`);
  }
  if (g.di && tech.plusDI != null && tech.minusDI != null) {
    if (!(tech.plusDI > tech.minusDI)) failures.push('+DI ≤ -DI');
  }

  return { pass: failures.length === 0, failures };
}

function checkAnalystStrongBuy(analyst) {
  if (!analyst || !analyst.recommendation) return false;
  return analyst.recommendation === 'Strong Buy';
}

module.exports = { checkHardGates, checkAnalystStrongBuy };