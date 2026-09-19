// ============================================================
// /api/scanner — 메인 스캔 엔드포인트
// config는 URL query로 전달 (body 파싱 문제 회피)
// ============================================================

const { getMarketData }     = require('../lib/providers/marketProvider');
const { getTechnicalData }  = require('../lib/providers/technicalProvider');
const { getAnalystData }    = require('../lib/providers/analystProvider');
const { getNews }           = require('../lib/providers/newsProvider');
const { calcTechnicalScore, gradeFromScore } = require('../lib/engine/technicalScore');
const { checkHardGates, checkAnalystStrongBuy } = require('../lib/engine/strongBuy');
const { getUniverse }       = require('../lib/universe');
const { cacheGet, cacheSet } = require('../lib/cache');

const CACHE_TTL = 60 * 60;
const CONCURRENCY = 2;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let force = false;
  let clientConfig = null;

  // === URL query에서 config 읽기 (body 파싱 문제 회피) ===
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    force = url.searchParams.get('force') === '1';
    const cfgParam = url.searchParams.get('config');
    if (cfgParam) {
      clientConfig = JSON.parse(decodeURIComponent(cfgParam));
    }
  } catch (e) {
    console.warn('[scanner] query parse error:', e.message);
  }

  try {
    // 캐시 키에 config 해시 포함 (설정 다르면 다른 캐시)
    const cfgHash = clientConfig 
      ? `${clientConfig.strongBuyThreshold}_${JSON.stringify(clientConfig.hardGates)}` 
      : 'default';
    const cacheKey = `scanner:${cfgHash}`;

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

    const results = await runWithConcurrency(
      universe,
      CONCURRENCY,
      (stock) => analyzeOne(stock, clientConfig)
    );

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

async function analyzeOne(stock, clientConfig) {
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
    const market = await safe(() => getMarketData(stock));
    if (market && market.price != null) {
      base.price = formatPrice(market.price, stock.country);
    }

    let tech = null;
    if (market) {
      tech = await safe(() => getTechnicalData(market));
    }

    if (tech) {
      const config = clientConfig || getConfigFromRequest();
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

    const analyst = await safe(() => getAnalystData(stock));
    if (analyst && analyst.recommendation) {
      base.analyst = checkAnalystStrongBuy(analyst)
        ? 'STRONG_BUY'
        : analyst.recommendation;
      base.analystDetail = analyst;
    }

    const news = await safe(() => getNews(stock));
    if (Array.isArray(news)) {
      base.news = news.slice(0, 5);
    }

    return base;
  } catch (err) {
    console.warn(`[scanner] ${stock.ticker} failed:`, err.message);
    return base;
  }
}

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
  return require('../lib/engine/defaultConfig');
}