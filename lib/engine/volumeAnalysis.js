// ============================================================
// volumeAnalysis — 거래량 분석
// SMA20 / 거래량 비율 / 거래량 변화율 / 가격-거래량 관계
// 기존 OHLCV 데이터(candles)를 재사용. 외부 API 호출 없음.
// ============================================================

function analyzeVolume(candles) {
  if (!Array.isArray(candles) || candles.length < 21) {
    return {
      status: 'insufficient_data',
      message: '거래량 분석 데이터 부족 (최소 21일 필요)'
    };
  }

  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const currentVolume = current.volume || 0;
  if (currentVolume <= 0) {
    return {
      status: 'no_volume',
      message: '거래량 데이터 없음'
    };
  }

  // SMA20 (현재 캔들 제외 최근 20일)
  const recent20 = candles.slice(-21, -1);
  const volumeSMA20 = recent20.reduce((sum, c) => sum + (c.volume || 0), 0) / recent20.length;

  if (volumeSMA20 <= 0) {
    return {
      status: 'no_volume',
      message: '평균 거래량 계산 불가'
    };
  }

  // 거래량 비율
  const volumeRatio = currentVolume / volumeSMA20;

  // 거래량 변화율 (%)
  const volumeChangePct = (volumeRatio - 1) * 100;

  // 거래량 상태
  let volumeStatus, volumeStatusLabel;
  if (volumeRatio < 0.7) {
    volumeStatus = 'low';
    volumeStatusLabel = '거래량 감소';
  } else if (volumeRatio < 1.3) {
    volumeStatus = 'normal';
    volumeStatusLabel = '평균 수준';
  } else if (volumeRatio < 2.0) {
    volumeStatus = 'high';
    volumeStatusLabel = '거래량 증가';
  } else {
    volumeStatus = 'surge';
    volumeStatusLabel = '거래량 급증';
  }

  // 가격 변화
  const priceChange = current.close - prev.close;
  const priceUp = priceChange > 0;
  const priceDown = priceChange < 0;

  // 가격-거래량 관계
  let priceVolumeRelation = null;
  if (priceUp && volumeRatio >= 1.3) {
    priceVolumeRelation = {
      type: 'up_with_volume',
      label: '상승 + 거래량 증가',
      meaning: '상승 움직임에 거래 참여가 증가하고 있음'
    };
  } else if (priceUp && volumeRatio < 0.7) {
    priceVolumeRelation = {
      type: 'up_without_volume',
      label: '상승 + 거래량 감소',
      meaning: '가격 상승과 거래량의 괴리 가능성'
    };
  } else if (priceDown && volumeRatio >= 1.3) {
    priceVolumeRelation = {
      type: 'down_with_volume',
      label: '하락 + 거래량 증가',
      meaning: '하락 움직임에 거래 참여가 증가 — 매도 압력'
    };
  } else if (priceDown && volumeRatio < 0.7) {
    priceVolumeRelation = {
      type: 'down_without_volume',
      label: '하락 + 거래량 감소',
      meaning: '하락이지만 거래량 감소 — 약한 하락'
    };
  } else {
    priceVolumeRelation = {
      type: 'neutral',
      label: '평균 수준',
      meaning: '가격과 거래량 모두 특이 신호 없음'
    };
  }

  // 거래량 배수 (2배, 3배 등)
  let multiplier = null;
  if (volumeRatio >= 3.0) multiplier = '3배 이상';
  else if (volumeRatio >= 2.0) multiplier = '2배 이상';
  else if (volumeRatio >= 1.5) multiplier = '1.5배 이상';

  return {
    status: 'ok',
    currentVolume,
    volumeSMA20: Math.round(volumeSMA20),
    volumeRatio: round2(volumeRatio),
    volumeChangePct: round2(volumeChangePct),
    volumeStatus,
    volumeStatusLabel,
    multiplier,
    priceChange: round2(priceChange),
    priceChangePct: round2((priceChange / prev.close) * 100),
    priceVolumeRelation
  };
}

function round2(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

module.exports = { analyzeVolume };