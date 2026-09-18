// ============================================================
// /api/scanner — 메인 스캔 엔드포인트
// 역할: 종목 유니버스 로드 → 각 종목 병렬 분석 → 결과 반환
// ============================================================

const { getMarketData }     = require('./providers/marketProvider');
const { getTechnicalData }  = require('./providers/technicalProvider');
const { getAnalystData }    = require('./providers/analystProvider');
const { getNews }           = require('./providers/newsProvider');
const { calcTechnicalScore, gradeFromScore } = require('./engine/technicalScore');
const { checkHardGates, checkAnalystStrongBuy } = require('./engine/strongBuy');
const { getUniverse }       = require('./universe');
const { cacheGet, cacheSet } = require('./cache');

// 캐시 TTL (초) — 무료 API 한도 고려
const CACHE_TTL = 15 * 60; // 15분

module.exports = async (req, res) => {
  // CORS (개인용이지만 명시)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const force = req.method === 'POST' && req.body && req.body.force === true;

  try {
    const cacheKey = 'scanner:all';
    if (!force) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return res.status(200).json(cached);
      }
    }

    const universe = getUniverse(); // 활성 종목만
    if (!universe.length) {
      return res.status(200).json({
        results: [],
        updatedAt: formatNow(),
        message: '활성화된 종목이 없습니다.'
      });
    }

    // 병렬 처리 (동시성 제한)
    const results = await runWithConcurrency(universe, 5, analyzeOne);

    const payload = {
      results: results.filter(Boolean),
      updatedAt: formatNow()
    };

    await cacheSet(cacheKey, payload, CACHE_TTL);

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[scanner] fatal:', err);
    return res.status(500).json({
      error: '스캔 실패: ' + (err.message || 'unknown'),
      updatedAt: formatNow()
    });
  }
};

// ------------------------------------------------------------
// 개별 종목 분석 파이프라인
// ------------------------------------------------------------
async function analyzeOne(stock) {
  const base = {
    symbol: stock.ticker,
    name: stock.name,
    flag: stock.country,     // 'US' | 'KR'
    price: null,
    analyst: 'N/A',
    technical: 'N/A',
    technicalScore: null,
    breakdown: null,
    news: []
  };

  try {
    // 1. 시장 데이터 (현재가 + OHLCV)
    const market = await safe(() => getMarketData(stock));
    if (market && market.price != null) {
      base.price = formatPrice(market.price, stock.country);
    }

    // 2. 기술 지표 데이터
    const tech = await safe(() => getTechnicalData(stock));
    if (!tech) {
      base.technical = 'N/A';
    } else {
      // 3. 점수 계산 (엔진)
      const config = getConfigFromRequest(); // 클라이언트 설정을 받을 수도, 기본값 사용
      const { score, breakdown } = calcTechnicalScore(tech, config);
      base.technicalScore = score;
      base.breakdown = breakdown;

      // 4. Hard Gate 검사
      const gates = checkHardGates(tech, config);
      const grade = gradeFromScore(score, config);

      if (grade === 'STRONG_BUY' && gates.pass) {
        base.technical = 'STRONG_BUY';
      } else if (grade === 'N/A') {
        base.technical = 'N/A';
      } else {
        base.technical = grade;
      }
    }

    // 5. Analyst 데이터
    const analyst = await safe(() => getAnalystData(stock));
    if (analyst && analyst.recommendation) {
      base.analyst = checkAnalystStrongBuy(analyst)
        ? 'STRONG_BUY'
        : analyst.recommendation;
      base.analystDetail = analyst;
    } else {
      base.analyst = 'N/A';
    }

    // 6. 뉴스 (Strong Buy 판정과 무관, 참고용)
    const news = await safe(() => getNews(stock));
    if (Array.isArray(news)) {
      base.news = news.slice(0, 5);
    }

    return base;
  } catch (err) {
    console.warn(`[scanner] ${stock.ticker} failed:`, err.message);
    // 종목 하나 실패해도 다른 종목은 정상 반환
    return base;
  }
}

// ------------------------------------------------------------
// 유틸
// ------------------------------------------------------------
async function safe(fn) {
  try { return await fn(); } catch (e) {
    console.warn('[safe]', e.message);
    return null;
  }
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

function formatPrice(price, country) {
  if (price == null) return null;
  if (country === 'KR') {
    return Math.round(price).toLocaleString('ko-KR') + '원';
  }
  return '$' + price.toFixed(2);
}

function formatNow() {
  const d = new Date();
  // 한국 시간 기준
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}.${pad(kst.getUTCMonth() + 1)}.${pad(kst.getUTCDate())} ` +
         `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

function getConfigFromRequest() {
  // 현재 버전에서는 서버측 기본값 사용.
  // 클라이언트 설정을 반영하고 싶다면 요청 body로 전달.
  return require('./engine/defaultConfig');
}