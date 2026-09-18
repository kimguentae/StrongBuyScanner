// ============================================================
// yahooProvider — 한국 주식 일봉 OHLCV (비공식 API)
// 무료, API 키 불필요
// ============================================================

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function getYahooData(stock) {
  if (stock.country !== 'KR') {
    throw new Error('yahooProvider only supports KR stocks');
  }

  // KOSPI: .KS, KOSDAQ: .KQ
  const suffix = stock.exchange === 'KOSDAQ' ? 'KQ' : 'KS';
  const symbol = `${stock.ticker}.${suffix}`;

  // MA200 계산을 위해 2년치 요청
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=2y`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StrongBuyScanner/1.0)'
    }
  });

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const json = await res.json();

  const result = json?.chart?.result?.[0];
  if (!result) {
    const errMsg = json?.chart?.error?.description || 'no result';
    throw new Error(`Yahoo: ${errMsg}`);
  }

  const timestamps = result.timestamp;
  const quote = result.indicators?.quote?.[0];

  if (!timestamps || !quote) {
    throw new Error('Yahoo: missing data arrays');
  }

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];

    // null 값 스킵 (휴장일, 결측치)
    if (o == null || h == null || l == null || c == null) continue;

    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);

    candles.push({
      date,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v || 0
    });
  }

  if (candles.length < 200) {
    throw new Error(`Yahoo: insufficient history (${candles.length} bars)`);
  }

  const latest = candles[candles.length - 1];

  return {
    symbol: stock.ticker,
    price: latest.close,
    currency: result.meta?.currency || 'KRW',
    candles,
    updatedAt: latest.date
  };
}

module.exports = { getYahooData };