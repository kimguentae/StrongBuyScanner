// ============================================================
// priceStructure — 가격·차트 구조 분석
// 추세 / 스윙 고점·저점 / 지지선 / 저항선 / 캔들 패턴
// 기존 OHLCV 데이터(candles)를 재사용. 외부 API 호출 없음.
// ============================================================

// ------------------------------------------------------------
// 메인 함수
// ------------------------------------------------------------
function analyzePriceStructure(candles) {
  // 데이터 부족 처리
  if (!Array.isArray(candles) || candles.length < 20) {
    return {
      status: 'insufficient_data',
      message: '분석 데이터 부족 (최소 20일 필요)',
      trend: null,
      supports: [],
      resistances: [],
      swings: { highs: [], lows: [] },
      candles: null
    };
  }

  // ATR(14) 계산 (지지/저항 tolerance 용도)
  const atr14 = calcATR(candles, 14);

  // 스윙 고점/저점 (N=3)
  const swings = findSwings(candles, 3);

  // 추세 판단
  const trend = determineTrend(swings);

  // 지지선 (스윙 저점 그룹화)
  const supports = findSupportResistanceLevels(
    swings.lows, candles, atr14, 'support'
  );

  // 저항선 (스윙 고점 그룹화)
  const resistances = findSupportResistanceLevels(
    swings.highs, candles, atr14, 'resistance'
  );

  // 현재가
  const currentPrice = candles[candles.length - 1].close;

  // 현재가와 지지/저항 거리
  const nearestSupport = findNearest(supports, currentPrice, 'below');
  const nearestResistance = findNearest(resistances, currentPrice, 'above');

  // 캔들 패턴
  const candlePattern = analyzeCandlePattern(candles);

  // 돌파/이탈 판단
  const breakout = analyzeBreakout(
    candles, nearestSupport, nearestResistance, atr14
  );

  return {
    status: 'ok',
    currentPrice: round2(currentPrice),
    atr14: atr14 != null ? round2(atr14) : null,
    trend,
    swings: {
      highs: swings.highs.slice(-5).map(s => ({
        date: s.date,
        price: round2(s.price)
      })),
      lows: swings.lows.slice(-5).map(s => ({
        date: s.date,
        price: round2(s.price)
      })),
      totalHighs: swings.highs.length,
      totalLows: swings.lows.length
    },
    supports: supports.slice(0, 3),
    resistances: resistances.slice(0, 3),
    nearestSupport,
    nearestResistance,
    candlePattern,
    breakout
  };
}

// ------------------------------------------------------------
// ATR (14)
// ------------------------------------------------------------
function calcATR(candles, period) {
  if (candles.length < period + 1) return null;

  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }

  // 초기 period 평균
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Wilder smoothing
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
  }

  return atr;
}

// ------------------------------------------------------------
// 스윙 고점/저점 찾기 (N=3)
// 좌우 3개 캔들과 비교
// ------------------------------------------------------------
function findSwings(candles, n = 3) {
  const highs = [];
  const lows = [];

  for (let i = n; i < candles.length - n; i++) {
    const curr = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    // 좌우 n개와 비교
    for (let j = 1; j <= n; j++) {
      if (candles[i - j].high >= curr.high) isSwingHigh = false;
      if (candles[i + j].high >= curr.high) isSwingHigh = false;
      if (candles[i - j].low <= curr.low) isSwingLow = false;
      if (candles[i + j].low <= curr.low) isSwingLow = false;
    }

    if (isSwingHigh) {
      highs.push({ index: i, date: curr.date, price: curr.high });
    }
    if (isSwingLow) {
      lows.push({ index: i, date: curr.date, price: curr.low });
    }
  }

  return { highs, lows };
}

// ------------------------------------------------------------
// 추세 판단 (Higher High + Higher Low / Lower High + Lower Low)
// ------------------------------------------------------------
function determineTrend(swings) {
  const highs = swings.highs;
  const lows = swings.lows;

  // 최소 2개씩 필요
  if (highs.length < 2 || lows.length < 2) {
    return {
      direction: 'unknown',
      message: '스윙 포인트 부족 (추세 판단 불가)',
      detail: null
    };
  }

  const h1 = highs[highs.length - 2].price; // 이전 고점
  const h2 = highs[highs.length - 1].price; // 최근 고점
  const l1 = lows[lows.length - 2].price;   // 이전 저점
  const l2 = lows[lows.length - 1].price;   // 최근 저점

  const higherHigh = h2 > h1;
  const higherLow = l2 > l1;
  const lowerHigh = h2 < h1;
  const lowerLow = l2 < l1;

  if (higherHigh && higherLow) {
    return {
      direction: 'up',
      label: '상승 추세',
      message: 'Higher High + Higher Low',
      detail: {
        prevHigh: round2(h1),
        currHigh: round2(h2),
        prevLow: round2(l1),
        currLow: round2(l2)
      }
    };
  }

  if (lowerHigh && lowerLow) {
    return {
      direction: 'down',
      label: '하락 추세',
      message: 'Lower High + Lower Low',
      detail: {
        prevHigh: round2(h1),
        currHigh: round2(h2),
        prevLow: round2(l1),
        currLow: round2(l2)
      }
    };
  }

  return {
    direction: 'sideways',
    label: '횡보 / 혼조',
    message: '명확한 방향성 없음',
    detail: {
      prevHigh: round2(h1),
      currHigh: round2(h2),
      prevLow: round2(l1),
      currLow: round2(l2)
    }
  };
}

// ------------------------------------------------------------
// 지지선 / 저항선 그룹화
// ------------------------------------------------------------
function findSupportResistanceLevels(swings, candles, atr14, type) {
  if (!swings || swings.length === 0) return [];

  const currentPrice = candles[candles.length - 1].close;

  // Tolerance = max(ATR14 × 0.5, 현재가 × 0.015)
  const tolerance = Math.max(
    atr14 != null ? atr14 * 0.5 : 0,
    currentPrice * 0.015
  );

  // 가격 순 정렬
  const sorted = [...swings].sort((a, b) => a.price - b.price);

  // 그룹화
  const groups = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const lastPrice = current[current.length - 1].price;
    if (Math.abs(sorted[i].price - lastPrice) <= tolerance) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  if (current.length > 0) groups.push(current);

  // 각 그룹을 지지/저항 레벨로 변환
  const levels = groups.map(group => {
    const prices = group.map(g => g.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const testCount = group.length;
    const lastDate = group[group.length - 1].date;

    // 강도 분류
    let strength, strengthLabel;
    if (testCount >= 3) {
      strength = 'major';
      strengthLabel = '주요';
    } else if (testCount === 2) {
      strength = 'medium';
      strengthLabel = '보통';
    } else {
      strength = 'weak';
      strengthLabel = '약한';
    }

    return {
      price: round2(avgPrice),
      testCount,
      strength,
      strengthLabel,
      lastDate
    };
  });

  // 지지: 현재가 아래, 저항: 현재가 위
  let filtered;
  if (type === 'support') {
    filtered = levels
      .filter(l => l.price < currentPrice)
      .sort((a, b) => b.price - a.price); // 현재가에 가까운 순
  } else {
    filtered = levels
      .filter(l => l.price > currentPrice)
      .sort((a, b) => a.price - b.price); // 현재가에 가까운 순
  }

  // 각 레벨에 거리 정보 추가
  return filtered.map(level => {
    const distance = Math.abs(currentPrice - level.price);
    const distancePct = (distance / currentPrice) * 100;

    // 근접 판단
    let proximity, proximityLabel;
    if (distancePct <= 1) {
      proximity = 'very_near';
      proximityLabel = '매우 가까움';
    } else if (distancePct <= 2) {
      proximity = 'near';
      proximityLabel = '가까움';
    } else if (distancePct <= 3) {
      proximity = 'close';
      proximityLabel = '근접';
    } else {
      proximity = 'far';
      proximityLabel = '거리 있음';
    }

    return {
      ...level,
      distance: round2(distance),
      distancePct: round2(distancePct),
      proximity,
      proximityLabel
    };
  });
}

// ------------------------------------------------------------
// 가장 가까운 지지/저항 찾기
// ------------------------------------------------------------
function findNearest(levels, currentPrice, direction) {
  if (!levels || levels.length === 0) return null;

  // 이미 정렬되어 있음 (supports: 현재가 아래, resistances: 현재가 위)
  return levels[0] || null;
}

// ------------------------------------------------------------
// 캔들 패턴 분석 (최근 캔들)
// ------------------------------------------------------------
function analyzeCandlePattern(candles) {
  if (candles.length < 2) return null;

  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const body = Math.abs(current.close - current.open);
  const range = current.high - current.low;
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;

  // Range가 0이면 계산 불가
  if (range === 0) return { pattern: 'none', message: '캔들 데이터 이상' };

  // 최근 20개 평균 body
  const recentCandles = candles.slice(-21, -1); // 현재 제외 20개
  const avgBody = recentCandles.length > 0
    ? recentCandles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / recentCandles.length
    : 0;

  // 패턴 판정
  const isBullish = current.close > current.open;
  const isBearish = current.close < current.open;

  // 도지
  if (body / range <= 0.10) {
    return {
      pattern: 'doji',
      label: '도지',
      meaning: '시가와 종가가 거의 같음 — 매수·매도 균형',
      note: '추세 전환 가능성을 시사할 수 있으나 단독 신호로 판단하지 않습니다.'
    };
  }

  // 장대양봉
  if (isBullish && body / range >= 0.70 && body > avgBody) {
    return {
      pattern: 'marubozu_bull',
      label: '장대양봉',
      meaning: '강한 매수세로 시가 대비 큰 폭 상승',
      note: '거래량이 함께 증가하면 신뢰도가 높아집니다.'
    };
  }

  // 장대음봉
  if (isBearish && body / range >= 0.70 && body > avgBody) {
    return {
      pattern: 'marubozu_bear',
      label: '장대음봉',
      meaning: '강한 매도세로 시가 대비 큰 폭 하락',
      note: '거래량이 함께 증가하면 하락 압력이 강해질 수 있습니다.'
    };
  }

  // 상승 장악형
  if (
    prev.close < prev.open &&       // 이전 음봉
    current.close > current.open && // 현재 양봉
    current.open <= prev.close &&   // 현재 시가가 이전 종가 이하
    current.close >= prev.open      // 현재 종가가 이전 시가 이상
  ) {
    return {
      pattern: 'bullish_engulfing',
      label: '상승 장악형',
      meaning: '이전 음봉을 현재 양봉이 완전히 감쌈 — 반등 신호',
      note: '지지선 근처에서 발생하면 신뢰도가 높아집니다.'
    };
  }

  // 하락 장악형
  if (
    prev.close > prev.open &&       // 이전 양봉
    current.close < current.open && // 현재 음봉
    current.open >= prev.close &&   // 현재 시가가 이전 종가 이상
    current.close <= prev.open      // 현재 종가가 이전 시가 이하
  ) {
    return {
      pattern: 'bearish_engulfing',
      label: '하락 장악형',
      meaning: '이전 양봉을 현재 음봉이 완전히 감쌈 — 하락 신호',
      note: '저항선 근처에서 발생하면 신뢰도가 높아집니다.'
    };
  }

  // 망치형
  if (
    lowerWick >= body * 2 &&
    upperWick <= body * 0.5 &&
    body > 0
  ) {
    return {
      pattern: 'hammer',
      label: '망치형',
      meaning: '아래쪽 긴 꼬리 — 저가 매수세 유입 가능성',
      note: '하락 추세 이후 지지선 근처에서 발생하면 의미가 커집니다.'
    };
  }

  // 역망치형
  if (
    upperWick >= body * 2 &&
    lowerWick <= body * 0.5 &&
    body > 0
  ) {
    return {
      pattern: 'inverted_hammer',
      label: '역망치형',
      meaning: '위쪽 긴 꼬리 — 매도 압력 or 반등 시도',
      note: '단독으로 매수 신호로 판단하지 않습니다.'
    };
  }

  // 기본
  return {
    pattern: 'normal',
    label: isBullish ? '양봉' : '음봉',
    meaning: isBullish ? '상승 마감' : '하락 마감',
    note: null
  };
}

// ------------------------------------------------------------
// 돌파 / 이탈 판단
// ------------------------------------------------------------
function analyzeBreakout(candles, nearestSupport, nearestResistance, atr14) {
  if (candles.length < 2 || atr14 == null) {
    return { type: 'none', message: '데이터 부족' };
  }

  const current = candles[candles.length - 1];
  const close = current.close;

  // 저항 돌파
  if (nearestResistance) {
    const threshold = nearestResistance.price + atr14 * 0.2;
    if (close > threshold) {
      return {
        type: 'resistance_breakout',
        label: '저항 돌파',
        resistancePrice: round2(nearestResistance.price),
        closePrice: round2(close),
        threshold: round2(threshold)
      };
    }
  }

  // 지지 이탈
  if (nearestSupport) {
    const threshold = nearestSupport.price - atr14 * 0.2;
    if (close < threshold) {
      return {
        type: 'support_breakdown',
        label: '지지 이탈',
        supportPrice: round2(nearestSupport.price),
        closePrice: round2(close),
        threshold: round2(threshold)
      };
    }
  }

  return { type: 'none', message: null };
}

// ------------------------------------------------------------
// 유틸
// ------------------------------------------------------------
function round2(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

module.exports = { analyzePriceStructure };