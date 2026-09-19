// ============================================================
// /api/chart — 종목 캔들 차트 데이터
// GET /api/chart?symbol=005930&days=90
// ============================================================

const { getYahooChartData } = require('../lib/providers/yahooProvider');
const { getAllUniverse } = require('../lib/universe');
const { cacheGet, cacheSet } = require('../lib/cache');

const CACHE_TTL = 30 * 60;  // 30분

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const symbol = url.searchParams.get('symbol');
  const days = parseInt(url.searchParams.get('days') || '90', 10);

  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const cacheKey = `chart:${symbol}:${days}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // universe에서 종목 찾기
    const universe = getAllUniverse();
    const stock = universe.find(s => s.ticker === symbol);
    if (!stock) return res.status(404).json({ error: 'symbol not found' });

    const data = await getYahooChartData(stock, Math.min(Math.max(days, 30), 365));

    await cacheSet(cacheKey, data, CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (err) {
    console.error('[chart]', err);
    return res.status(500).json({ error: err.message || 'unknown' });
  }
};