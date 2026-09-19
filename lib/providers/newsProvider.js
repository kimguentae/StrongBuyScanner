// ============================================================
// newsProvider — Finnhub 뉴스 (미국 + 한국)
// 무료 60 req/min, 한국 종목도 지원
// ============================================================

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

async function getNews(stock) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  // 심볼 구성
  let symbol;
  if (stock.country === 'US') {
    symbol = stock.ticker;
  } else if (stock.country === 'KR') {
    const suffix = stock.exchange === 'KOSDAQ' ? 'KQ' : 'KS';
    symbol = `${stock.ticker}.${suffix}`;
  } else {
    return [];
  }

  // 최근 7일
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub news HTTP ${res.status}`);

  const arr = await res.json();
  if (!Array.isArray(arr)) return [];

  return arr.slice(0, 5).map(item => ({
    title: item.headline,
    date: new Date(item.datetime * 1000).toISOString().slice(0, 10).replace(/-/g, '.'),
    source: item.source || 'Finnhub',
    url: item.url
  })).filter(n => n.title && n.url);
}

module.exports = { getNews };