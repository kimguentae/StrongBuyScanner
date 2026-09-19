// ============================================================
// indicators — 순수 기술지표 계산 (외부 API 호출 없음)
// 입력: candles [{ date, open, high, low, close, volume }]
// 출력: { ma20, ma50, ma200, macd, macdSignal, macdHist,
//         rsi, adx, plusDI, minusDI, bbUpper, bbMiddle, bbLower }
// 표준 계산법 (Wilder's smoothing, EMA) 준수
// ============================================================

function computeIndicators(candles) {
  if (!Array.isArray(candles) || candles.length < 200) return null;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const price = closes[closes.length - 1];

  // ---- SMA ----
  const ma20  = sma(closes, 20);
  const ma50  = sma(closes, 50);
  const ma200 = sma(closes, 200);

  // ---- MACD (12, 26, 9) ----
  const macdResult = macd(closes, 12, 26, 9);

  // ---- RSI (14) ----
  const rsiValue = rsi(closes, 14);

  // ---- ADX / +DI / -DI (14) ----
  const adxResult = adx(highs, lows, closes, 14);

  // ---- Bollinger Bands (20, 2σ) ----
  const bbResult = bollinger(closes, 20, 2);

  return {
    price,
    ma20,
    ma50,
    ma200,
    macd: macdResult ? macdResult.macd : null,
    macdSignal: macdResult ? macdResult.signal : null,
    macdHist: macdResult ? macdResult.hist : null,
    rsi: rsiValue,
    adx: adxResult ? adxResult.adx : null,
    plusDI: adxResult ? adxResult.plusDI : null,
    minusDI: adxResult ? adxResult.minusDI : null,
    bbUpper: bbResult ? bbResult.upper : null,
    bbMiddle: bbResult ? bbResult.middle : null,
    bbLower: bbResult ? bbResult.lower : null
  };
}

// ------------------------------------------------------------
// SMA
// ------------------------------------------------------------
function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i];
  }
  return sum / period;
}

// ------------------------------------------------------------
// EMA (지수이동평균)
// 반환: 배열 (values와 같은 길이, 초기 period-1개는 null)
// ------------------------------------------------------------
function ema(values, period) {
  if (values.length < period) return null;

  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);

  // 초기값: 첫 period개의 SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prevEma = sum / period;
  out[period - 1] = prevEma;

  for (let i = period; i < values.length; i++) {
    const currEma = values[i] * k + prevEma * (1 - k);
    out[i] = currEma;
    prevEma = currEma;
  }

  return out;
}

// ------------------------------------------------------------
// MACD (fast=12, slow=26, signal=9)
// ------------------------------------------------------------
function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null;

  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);

  // MACD 라인 = EMA(fast) - EMA(slow)
  const macdLine = closes.map((_, i) => {
    if (emaFast[i] == null || emaSlow[i] == null) return null;
    return emaFast[i] - emaSlow[i];
  });

  // MACD 라인의 유효 구간만 추출 (앞부분 null 제거)
  const firstValid = macdLine.findIndex(v => v != null);
  const validMacd = macdLine.slice(firstValid);

  // Signal = EMA(macdLine, 9)
  const signalLine = ema(validMacd, signalPeriod);
  const signalFull = new Array(closes.length).fill(null);
  for (let i = 0; i < signalLine.length; i++) {
    signalFull[firstValid + i] = signalLine[i];
  }

  const lastIdx = closes.length - 1;
  const m = macdLine[lastIdx];
  const s = signalFull[lastIdx];
  if (m == null || s == null) return null;

  return {
    macd: m,
    signal: s,
    hist: m - s
  };
}

// ------------------------------------------------------------
// RSI (Wilder's smoothing, period=14)
// ------------------------------------------------------------
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;

  // 초기 period 구간의 평균 상승/하락
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gainSum += diff;
    else lossSum += -diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  // 나머지 구간 Wilder smoothing
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// ------------------------------------------------------------
// ADX / +DI / -DI (Wilder, period=14)
// ------------------------------------------------------------
function adx(highs, lows, closes, period = 14) {
  const n = closes.length;
  if (n < period * 2 + 1) return null;

  // TR, +DM, -DM 계산
  const tr   = new Array(n).fill(0);
  const plusDM  = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const h = highs[i];
    const l = lows[i];
    const pc = closes[i - 1];

    tr[i] = Math.max(
      h - l,
      Math.abs(h - pc),
      Math.abs(l - pc)
    );

    const upMove   = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    plusDM[i]  = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
  }

  // Wilder smoothing
  const smooth = (arr) => {
    const out = new Array(n).fill(null);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += arr[i];
    out[period] = sum;
    for (let i = period + 1; i < n; i++) {
      out[i] = out[i - 1] - (out[i - 1] / period) + arr[i];
    }
    return out;
  };

  const smoothTR  = smooth(tr);
  const smoothPDM = smooth(plusDM);
  const smoothMDM = smooth(minusDM);

  // +DI, -DI
  const plusDIArr  = new Array(n).fill(null);
  const minusDIArr = new Array(n).fill(null);
  const dxArr      = new Array(n).fill(null);

  for (let i = period; i < n; i++) {
    if (smoothTR[i] == null || smoothTR[i] === 0) continue;
    const pdi = (smoothPDM[i] / smoothTR[i]) * 100;
    const mdi = (smoothMDM[i] / smoothTR[i]) * 100;
    plusDIArr[i]  = pdi;
    minusDIArr[i] = mdi;

    const sum = pdi + mdi;
    if (sum === 0) continue;
    dxArr[i] = (Math.abs(pdi - mdi) / sum) * 100;
  }

  // ADX = DX의 Wilder smoothed 평균
  let adxVal = null;
  let adxSum = 0;
  let count = 0;

  // 첫 period 구간의 DX 평균
  for (let i = period; i < period * 2 && i < n; i++) {
    if (dxArr[i] != null) {
      adxSum += dxArr[i];
      count++;
    }
  }
  if (count === 0) return null;
  adxVal = adxSum / count;

  // 이후 Wilder smoothing
  for (let i = period * 2; i < n; i++) {
    if (dxArr[i] == null) continue;
    adxVal = (adxVal * (period - 1) + dxArr[i]) / period;
  }

  return {
    adx: adxVal,
    plusDI: plusDIArr[n - 1],
    minusDI: minusDIArr[n - 1]
  };
}

// ------------------------------------------------------------
// Bollinger Bands (period=20, stdDev=2)
// ------------------------------------------------------------
function bollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);

  return {
    middle: mean,
    upper: mean + mult * sd,
    lower: mean - mult * sd
  };
}

module.exports = { computeIndicators };