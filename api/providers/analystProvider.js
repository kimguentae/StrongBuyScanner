// ============================================================
// analystProvider — Analyst Recommendation
// 🇺🇸 미국: Finnhub (/stock/recommendation)
// 🇰🇷 한국: 네이버 금융 (front-api/stock/domestic/consensus)
// ============================================================

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const NAVER_BASE = 'https://m.stock.naver.com/front-api/stock/domestic/consensus';

async function getAnalystData(stock) {
  if (stock.country === 'US') {
    return await getFinnhubData(stock);
  }
  if (stock.country === 'KR') {
    return await getNaverData(stock);
  }
  return null;
}

// ------------------------------------------------------------
// 🇺🇸 Finnhub
// ------------------------------------------------------------
async function getFinnhubData(stock) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const symbol = stock.country === 'US' ? stock.ticker : `${stock.ticker}.KS`;
  const url = `${FINNHUB_BASE}/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);

  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const latest = arr[0];

  return {
    symbol: stock.ticker,
    strongBuy: latest.strongBuy ?? 0,
    buy: latest.buy ?? 0,
    hold: latest.hold ?? 0,
    sell: latest.sell ?? 0,
    strongSell: latest.strongSell ?? 0,
    period: latest.period,
    source: 'Finnhub',
    recommendation: deriveFromCounts(latest)
  };
}

// Finnhub 개수 기반 종합 판정 (가중 평균)
function deriveFromCounts(r) {
  const sb = r.strongBuy || 0;
  const b  = r.buy || 0;
  const h  = r.hold || 0;
  const s  = r.sell || 0;
  const ss = r.strongSell || 0;
  const total = sb + b + h + s + ss;
  if (total === 0) return null;

  const weighted = (sb * 5 + b * 4 + h * 3 + s * 2 + ss * 1) / total;
  return weightedToGrade(weighted);
}

function weightedToGrade(w) {
  if (w >= 4.5) return 'Strong Buy';
  if (w >= 3.5) return 'Buy';
  if (w >= 2.5) return 'Hold';
  if (w >= 1.5) return 'Sell';
  return 'Strong Sell';
}

// ------------------------------------------------------------
// 🇰🇷 네이버 금융
// 응답: { isSuccess, result: { consensusInfo: { recommMean, priceTargetMean, createDate } } }
// ------------------------------------------------------------
async function getNaverData(stock) {
  const url = `${NAVER_BASE}?code=${encodeURIComponent(stock.ticker)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StrongBuyScanner/1.0)',
      'Referer': 'https://m.stock.naver.com/'
    }
  });

  if (!res.ok) throw new Error(`Naver HTTP ${res.status}`);

  const json = await res.json();

  if (!json || !json.isSuccess) return null;

  const info = json.result?.consensusInfo;
  if (!info || info.recommMean == null) return null;

  const score = Number(info.recommMean);

  return {
    symbol: stock.ticker,
    recommendation: weightedToGrade(score),   // 4 → "Buy"
    score: score,
    targetPrice: info.priceTargetMean,
    period: info.createDate,
    source: 'Naver Finance'
  };
}

module.exports = { getAnalystData };