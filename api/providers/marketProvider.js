// ============================================================
// marketProvider — OHLCV 260일치 1회 호출
// 이 데이터로 현재가 + 모든 기술지표를 앱 내부에서 계산
// ============================================================

const TWELVE_BASE = 'https://api.twelvedata.com';

/**
 * 종목의 일봉 OHLCV 260개 반환
 * 반환: [{ date, open, high, low, close, volume }, ...] (과거 → 최신 순)
 */
async function getMarketData(stock) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY missing');

  const symbol = normalizeSymbol(stock);

  const qs = new URLSearchParams({
    symbol,
    interval: '1day',
    outputsize: '260',
    apikey: key
  });

  const url = `${TWELVE_BASE}/time_series?${qs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);

  const json = await res.json();

  if (json.status === 'error' || json.code) {
    throw new Error(json.message || `Twelve Data error code ${json.code}`);
  }

  if (!json.values || !Array.isArray(json.values)) {
    throw new Error('Twelve Data: values missing');
  }

  const candles = json.values
    .map(v => ({
      date: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || '0')
    }))
    .filter(c =>
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
    )
    .reverse();

  if (candles.length < 200) {
    throw new Error(`Twelve Data: insufficient history (${candles.length} bars)`);
  }

  const latest = candles[candles.length - 1];

  return {
    symbol: stock.ticker,
    price: latest.close,
    currency: stock.country === 'KR' ? 'KRW' : 'USD',
    candles,
    updatedAt: latest.date
  };
}

function normalizeSymbol(stock) {
  if (stock.country === 'KR') return `${stock.ticker}:KRX`;
  return stock.ticker;
}

module.exports = { getMarketData };