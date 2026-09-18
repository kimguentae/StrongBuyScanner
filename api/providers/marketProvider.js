// ============================================================
// marketProvider — 현재가 / OHLCV
// 미국: Twelve Data
// 한국: Twelve Data (무료 범위 확인 필요) 또는 KIS Open API
// ============================================================

const TWELVE_BASE = 'https://api.twelvedata.com';

async function getMarketData(stock) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY missing');

  const symbol = normalizeSymbol(stock);

  const url = `${TWELVE_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const json = await res.json();

  if (json.status === 'error' || json.code) {
    throw new Error(json.message || 'Twelve Data error');
  }

  return {
    symbol: stock.ticker,
    price: parseFloat(json.close || json.price),
    previousClose: parseFloat(json.previous_close),
    open: parseFloat(json.open),
    high: parseFloat(json.high),
    low: parseFloat(json.low),
    volume: parseInt(json.volume, 10),
    currency: json.currency || (stock.country === 'KR' ? 'KRW' : 'USD'),
    updatedAt: json.datetime || new Date().toISOString()
  };
}

function normalizeSymbol(stock) {
  if (stock.country === 'KR') {
    // Twelve Data는 한국 종목을 "005930:KRX" 또는 "005930.KS" 형태로 지원할 수 있음
    // 실제 무료 플랜 지원 여부는 반드시 문서 확인 필요
    return `${stock.ticker}:KRX`;
  }
  return stock.ticker;
}

module.exports = { getMarketData };
