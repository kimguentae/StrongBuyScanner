// ============================================================
// analystProvider — Analyst Recommendation
// Twelve Data Basic에는 Analyst 데이터 없음 (Ultra 전용)
// → Finnhub 무료 플랜 recommendation_trends 사용
//   https://finnhub.io/docs/api/recommendation-trends
// ============================================================

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

async function getAnalystData(stock) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    // Key가 없으면 N/A 반환 (Strong Buy 판정에서 제외됨)
    return null;
  }

  // Finnhub은 미국 종목 위주. 한국은 지원 여부 확인 필요.
  const symbol = stock.country === 'US' ? stock.ticker : `${stock.ticker}.KS`;

  const url = `${FINNHUB_BASE}/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);

  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;

  // 가장 최근 데이터 (period 기준)
  const latest = arr[0];

  return {
    symbol: stock.ticker,
    strongBuy: latest.strongBuy ?? null,
    buy: latest.buy ?? null,
    hold: latest.hold ?? null,
    sell: latest.sell ?? null,
    strongSell: latest.strongSell ?? null,
    period: latest.period,
    // 종합 추천은 개수 기반으로 판정 (앱의 Analyst Strong Buy 규칙)
    recommendation: deriveRecommendation(latest)
  };
}

// Strong Buy 개수 기반 종합 판정
// Finnhub recommendation_trends는 카운트만 제공하므로 여기서 종합 라벨을 만든다.
// 이건 "임의 생성"이 아니라 API가 제공한 카운트의 가중 평균.
function deriveRecommendation(r) {
  const sb = r.strongBuy || 0;
  const b  = r.buy || 0;
  const h  = r.hold || 0;
  const s  = r.sell || 0;
  const ss = r.strongSell || 0;
  const total = sb + b + h + s + ss;
  if (total === 0) return null;

  // 가중치: Strong Buy=5, Buy=4, Hold=3, Sell=2, Strong Sell=1
  const weighted = (sb * 5 + b * 4 + h * 3 + s * 2 + ss * 1) / total;

  if (weighted >= 4.5) return 'Strong Buy';
  if (weighted >= 3.5) return 'Buy';
  if (weighted >= 2.5) return 'Hold';
  if (weighted >= 1.5) return 'Sell';
  return 'Strong Sell';
}

module.exports = { getAnalystData };