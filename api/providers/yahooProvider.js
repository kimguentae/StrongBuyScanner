// ============================================================
// yahooProvider — 미국 + 한국 주식 일봉 OHLCV
// 무료, API 키 불필요, 2년치 데이터 제공
// ============================================================

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function getYahooData(stock) {
  let symbol;

  if (stock.country === 'US') {
    symbol = stock.ticker;
  } else if (stock.country === 'KR') {
    const suffix = stock.exchange === 'KOSDAQ' ? 'KQ' : 'KS';
    symbol = `${stock.ticker}.${suffix}`;
  } else {
    throw new Error(`Unsupported country: ${stock.country}`);
  }

  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=2y`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StrongBuyScanner/1.0)'
    }
  });

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json = await res.json();

  const result = json?.chart?.result?.[0];
  if (!result) {
    const errMsg = json?.chart?.error?.description || 'no result';
    throw new Error(`Yahoo: ${errMsg}`);
  }

  const timestamps = result.timestamp;
  const quote = result.indicators?.quote?.[0];

  if (!timestamps || !quote) {
    throw new Error('Yahoo: missing data arrays');
  }

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];

    if (o == null || h == null || l == null || c == null) continue;

    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);

    candles.push({
      date,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v || 0
    });
  }

  if (candles.length < 200) {
    throw new Error(`Yahoo: insufficient history (${candles.length} bars)`);
  }

  const latest = candles[candles.length - 1];

  return {
    symbol: stock.ticker,
    price: latest.close,
    currency: result.meta?.currency || (stock.country === 'KR' ? 'KRW' : 'USD'),
    candles,
    updatedAt: latest.date
  };
}

// ============================================================
// 차트용 경량 데이터 (기간별 OHLCV + MA + BB)
// ============================================================
async function getYahooChartData(stock, days = 90) {
  let symbol;
  if (stock.country === 'US') {
    symbol = stock.ticker;
  } else if (stock.country === 'KR') {
    const suffix = stock.exchange === 'KOSDAQ' ? 'KQ' : 'KS';
    symbol = `${stock.ticker}.${suffix}`;
  } else {
    throw new Error(`Unsupported country: ${stock.country}`);
  }

  // 여유있게 2배 + 60일 더 요청 (MA200 계산용)
  const range = days <= 90 ? '6mo' : days <= 180 ? '1y' : '2y';
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StrongBuyScanner/1.0)' }
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo: no chart data');

  const timestamps = result.timestamp;
  const quote = result.indicators?.quote?.[0];
  if (!timestamps || !quote) throw new Error('Yahoo: missing arrays');

  const allCandles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i];
    const c = quote.close?.[i], v = quote.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    allCandles.push({ date, open: o, high: h, low: l, close: c, volume: v || 0 });
  }

  // MA20/50/200 계산 (전체 데이터로)
  const closes = allCandles.map(c => c.close);
  const ma20All = smaArray(closes, 20);
  const ma50All = smaArray(closes, 50);
  const ma200All = smaArray(closes, 200);

  // BB (20, 2σ)
  const bbAll = bollingerArray(closes, 20, 2);

  // 최근 days 개만 자름
  const startIdx = Math.max(0, allCandles.length - days);

  const candles = allCandles.slice(startIdx);
  const ma20 = [], ma50 = [], ma200 = [];
  const bbUpper = [], bbLower = [], bbMiddle = [];

  for (let i = startIdx; i < allCandles.length; i++) {
    const d = allCandles[i].date;
    if (ma20All[i] != null) ma20.push({ time: d, value: round2(ma20All[i]) });
    if (ma50All[i] != null) ma50.push({ time: d, value: round2(ma50All[i]) });
    if (ma200All[i] != null) ma200.push({ time: d, value: round2(ma200All[i]) });
    if (bbAll[i]) {
      bbUpper.push({ time: d, value: round2(bbAll[i].upper) });
      bbMiddle.push({ time: d, value: round2(bbAll[i].middle) });
      bbLower.push({ time: d, value: round2(bbAll[i].lower) });
    }
  }

  return {
    symbol: stock.ticker,
    name: stock.name,
    currency: result.meta?.currency || (stock.country === 'KR' ? 'KRW' : 'USD'),
    candles,
    ma20, ma50, ma200,
    bbUpper, bbMiddle, bbLower
  };
}

function smaArray(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function bollingerArray(values, period, mult) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    out[i] = { middle: mean, upper: mean + mult * sd, lower: mean - mult * sd };
  }
  return out;
}

function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { getYahooData, getYahooChartData };