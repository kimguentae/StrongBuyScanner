// ============================================================
// /api/scanner — 메인 스캔 엔드포인트
// ============================================================

const { getMarketData }     = require('./providers/marketProvider');
const { getTechnicalData }  = require('./providers/technicalProvider');
const { getAnalystData }    = require('./providers/analystProvider');
const { getNews }           = require('./providers/newsProvider');
const { calcTechnicalScore, gradeFromScore } = require('./engine/technicalScore');
const { checkHardGates, checkAnalystStrongBuy } = require('./engine/strongBuy');
const { getUniverse }       = require('./universe');
const { cacheGet, cacheSet } = require('./cache');

// 30분 캐시 (Twelve Data 800/day 여유 확보)
const CACHE_TTL = 30 * 60;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let force = false;
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      force = body && body.force === true;
    } catch (e) { /* ignore */ }
  }

  try {
    const cacheKey = 'scanner:all';
    if (!force) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cached);
      }
    }

    const universe = getUniverse();
    if (!universe.length) {
      return res.status(200).json({
        results: [],
        updatedAt: formatNow(),
        message: '활성화된 종목이 없습니다.'
      });
    }

    // 동시성 3 (Twelve Data 무료 8 req/min 고려)
    const results = await runWithConcurrency(universe, 3, analyzeOne);

    const payload = {
      results: results.filter(Boolean),
      updatedAt: formatNow()
    };

    await cacheSet(cacheKey, payload, CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
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
// 개별 종목 분석
// ------------------------------------------------------------
async function analyzeOne(stock) {
  const base = {
    symbol: stock.ticker,
    name: stock.name,
    flag: stock.country,
    price: null,
    analyst: 'N/A',
    technical: 'N/A',
    technicalScore: null,
    breakdown: null,
    news: []
  };

  try {
    // 1) OHLCV 1회 호출
    const market = await safe(() => getMarketData(stock));
    if (market && market.price != null) {
      base.price = formatPrice(market.price, stock.country);
    }

    // 2) 내부 계산 (외부 API 호출 없음)
    let tech = null;
    if (market) {
      tech = await safe(() => getTechnicalData(market));
    }

    if (!tech) {
      base.technical = 'N/A';
    } else {
      const config = getConfigFromRequest();
      const { score, breakdown } = calcTechnicalScore(tech, config);
      base.technicalScore = score;
      base.breakdown = breakdown;

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

    // 3) Analyst (Finnhub)
    const analyst = await safe(() => getAnalystData(stock));
    if (analyst && analyst.recommendation) {
      base.analyst = checkAnalystStrongBuy(analyst)
        ? 'STRONG_BUY'
        : analyst.recommendation;
      base.analystDetail = analyst;
    } else {
      base.analyst = 'N/A';
    }

    // 4) 뉴스 (Alpha Vantage, 미국만)
    const news = await safe(() => getNews(stock));
    if (Array.isArray(news)) base.news = news.slice(0, 5);

    return base;
  } catch (err) {
    console.warn(`[scanner] ${stock.ticker} failed:`, err.message);
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
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}.${pad(kst.getUTCMonth() + 1)}.${pad(kst.getUTCDate())} ` +
         `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

function getConfigFromRequest() {
  return require('./engine/defaultConfig');
}