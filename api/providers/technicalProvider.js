// ============================================================
// technicalProvider — MA / MACD / RSI / ADX / Bollinger
// Twelve Data의 technical indicators 엔드포인트 사용
// OHLCV를 직접 받아 내부 계산하는 방식으로 대체 가능
// ============================================================

const TWELVE_BASE = 'https://api.twelvedata.com';

async function getTechnicalData(stock) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY missing');

  const symbol = normalizeSymbol(stock);

  // 필요한 지표를 한 번에 요청 (Twelve Data는 개별 엔드포인트)
  // 호출 수 절약을 위해 병렬로 5개 요청
  const [sma20, sma50, sma200, macd, rsi, adx, bb] = await Promise.all([
    fetchIndicator('sma',   symbol, key, { time_period: 20 }),
    fetchIndicator('sma',   symbol, key, { time_period: 50 }),
    fetchIndicator('sma',   symbol, key, { time_period: 200 }),
    fetchIndicator('macd',  symbol, key, { fast_period: 12, slow_period: 26, signal_period: 9 }),
    fetchIndicator('rsi',   symbol, key, { time_period: 14 }),
    fetchIndicator('adx',   symbol, key, { time_period: 14 }),
    fetchIndicator('bbands',symbol, key, { time_period: 20, sd: 2 })
  ]);

  // quote에서 현재가도 필요 (별도 marketProvider에서 가져오지만 여기서도 참조 가능)
  const quote = await fetchQuote(symbol, key);
  const price = parseFloat(quote.close || quote.price);

  return {
    symbol: stock.ticker,
    price,
    ma20: sma20?.values?.[0]?.sma ? parseFloat(sma20.values[0].sma) : null,
    ma50: sma50?.values?.[0]?.sma ? parseFloat(sma50.values[0].sma) : null,
    ma200: sma200?.values?.[0]?.sma ? parseFloat(sma200.values[0].sma) : null,
    macd: macd?.values?.[0]?.macd ? parseFloat(macd.values[0].macd) : null,
    macdSignal: macd?.values?.[0]?.macd_signal ? parseFloat(macd.values[0].macd_signal) : null,
    macdHist: macd?.values?.[0]?.macd_hist ? parseFloat(macd.values[0].macd_hist) : null,
    rsi: rsi?.values?.[0]?.rsi ? parseFloat(rsi.values[0].rsi) : null,
    adx: adx?.values?.[0]?.adx ? parseFloat(adx.values[0].adx) : null,
    plusDI: adx?.values?.[0]?.plus_di ? parseFloat(adx.values[0].plus_di) : null,
    minusDI: adx?.values?.[0]?.minus_di ? parseFloat(adx.values[0].minus_di) : null,
    bbUpper: bb?.values?.[0]?.upper_band ? parseFloat(bb.values[0].upper_band) : null,
    bbMiddle: bb?.values?.[0]?.middle_band ? parseFloat(bb.values[0].middle_band) : null,
    bbLower: bb?.values?.[0]?.lower_band ? parseFloat(bb.values[0].lower_band) : null
  };
}

async function fetchIndicator(name, symbol, key, params) {
  const qs = new URLSearchParams({
    symbol,
    interval: '1day',
    apikey: key,
    ...params
  });
  const url = `${TWELVE_BASE}/${name}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status === 'error' || json.code) return null;
  return json;
}

async function fetchQuote(symbol, key) {
  const url = `${TWELVE_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function normalizeSymbol(stock) {
  if (stock.country === 'KR') return `${stock.ticker}:KRX`;
  return stock.ticker;
}

module.exports = { getTechnicalData };