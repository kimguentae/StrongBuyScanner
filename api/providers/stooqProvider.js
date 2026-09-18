// ============================================================
// stooqProvider — 미국 주식 일봉 OHLCV
// 무료, API 키 불필요, CSV 응답
// ============================================================

const STOOQ_BASE = 'https://stooq.com/q/d/l/';

async function getStooqData(stock) {
  if (stock.country !== 'US') {
    throw new Error('stooqProvider only supports US stocks');
  }

  const symbol = `${stock.ticker.toLowerCase()}.us`;
  const url = `${STOOQ_BASE}?s=${encodeURIComponent(symbol)}&i=d`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);

  const text = await res.text();

  if (!text || text.startsWith('No data') || !text.includes(',')) {
    throw new Error('Stooq: no data returned');
  }

  const lines = text.trim().split('\n');
  const header = lines[0].split(',');
  if (header[0] !== 'Date') {
    throw new Error('Stooq: unexpected format');
  }

  const candles = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 5) continue;

    const [date, open, high, low, close, volume] = parts;
    const o = parseFloat(open);
    const h = parseFloat(high);
    const l = parseFloat(low);
    const c = parseFloat(close);
    const v = parseFloat(volume || '0');

    if (!Number.isFinite(o) || !Number.isFinite(c)) continue;

    candles.push({ date, open: o, high: h, low: l, close: c, volume: v });
  }

  if (candles.length < 200) {
    throw new Error(`Stooq: insufficient history (${candles.length} bars)`);
  }

  const latest = candles[candles.length - 1];

  return {
    symbol: stock.ticker,
    price: latest.close,
    currency: 'USD',
    candles,
    updatedAt: latest.date
  };
}

module.exports = { getStooqData };