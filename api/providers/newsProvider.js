// ============================================================
// newsProvider — Alpha Vantage NEWS_SENTIMENT
// 뉴스는 Strong Buy 판정에 절대 반영하지 않음 (참고 전용)
// 감성 분석 값(sentiment)도 사용하지 않음
// ============================================================

const ALPHA_BASE = 'https://www.alphavantage.co/query';

async function getNews(stock) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return [];

  // 한국 종목은 Alpha Vantage가 커버하지 않을 수 있음
  // ticker 형식 확인 필요: 미국은 "NVDA", 한국은 미지원 가능성 높음
  const tickerParam = stock.country === 'US' ? stock.ticker : null;
  if (!tickerParam) return [];

  const url = `${ALPHA_BASE}?function=NEWS_SENTIMENT&tickers=${tickerParam}&limit=10&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);

  const json = await res.json();
  if (!json.feed || !Array.isArray(json.feed)) return [];

  return json.feed.slice(0, 5).map(item => ({
    title: item.title,
    date: formatDate(item.time_published),
    source: item.source || 'Unknown',
    url: item.url
  }));
}

function formatDate(str) {
  // "20260918T153000" → "2026.09.18"
  if (!str || str.length < 8) return '';
  return `${str.slice(0, 4)}.${str.slice(4, 6)}.${str.slice(6, 8)}`;
}

module.exports = { getNews };