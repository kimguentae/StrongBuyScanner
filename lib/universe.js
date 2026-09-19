// ============================================================
// 종목 유니버스 — 약 60개 (미국 30 + 한국 30)
// 사용자가 설정에서 수정 가능하도록 구조화
// ============================================================

const DEFAULT_UNIVERSE = [
  // ---------- 🇺🇸 미국 30 ----------
  { country: 'US', name: 'NVIDIA',      ticker: 'NVDA',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Microsoft',   ticker: 'MSFT',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Apple',       ticker: 'AAPL',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Amazon',      ticker: 'AMZN',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Alphabet',    ticker: 'GOOGL', exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Meta',        ticker: 'META',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Tesla',       ticker: 'TSLA',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Broadcom',    ticker: 'AVGO',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'AMD',         ticker: 'AMD',   exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Netflix',     ticker: 'NFLX',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Adobe',       ticker: 'ADBE',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Salesforce',  ticker: 'CRM',   exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Oracle',      ticker: 'ORCL',  exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Qualcomm',    ticker: 'QCOM',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Texas Instr.',ticker: 'TXN',   exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Costco',      ticker: 'COST',  exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'JPMorgan',    ticker: 'JPM',   exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Visa',        ticker: 'V',     exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Mastercard',  ticker: 'MA',    exchange: 'NYSE',   active: true },
  { country: 'US', name: 'UnitedHealth',ticker: 'UNH',   exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Eli Lilly',   ticker: 'LLY',   exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Johnson & J.',ticker: 'JNJ',   exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Exxon Mobil', ticker: 'XOM',   exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Chevron',     ticker: 'CVX',   exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Procter & G.',ticker: 'PG',    exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Coca-Cola',   ticker: 'KO',    exchange: 'NYSE',   active: true },
  { country: 'US', name: 'PepsiCo',     ticker: 'PEP',   exchange: 'NASDAQ', active: true },
  { country: 'US', name: 'Walmart',     ticker: 'WMT',   exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Home Depot',  ticker: 'HD',    exchange: 'NYSE',   active: true },
  { country: 'US', name: 'Bank of Am.', ticker: 'BAC',   exchange: 'NYSE',   active: true },

  // ---------- 🇰🇷 한국 30 ----------
  { country: 'KR', name: '삼성전자',        ticker: '005930', exchange: 'KRX', active: true },
  { country: 'KR', name: 'SK하이닉스',      ticker: '000660', exchange: 'KRX', active: true },
  { country: 'KR', name: '현대차',          ticker: '005380', exchange: 'KRX', active: true },
  { country: 'KR', name: '기아',            ticker: '000270', exchange: 'KRX', active: true },
  { country: 'KR', name: 'LG에너지솔루션',  ticker: '373220', exchange: 'KRX', active: true },
  { country: 'KR', name: '삼성바이오로직스',ticker: '207940', exchange: 'KRX', active: true },
  { country: 'KR', name: 'POSCO홀딩스',     ticker: '005490', exchange: 'KRX', active: true },
  { country: 'KR', name: 'NAVER',           ticker: '035420', exchange: 'KRX', active: true },
  { country: 'KR', name: '카카오',          ticker: '035720', exchange: 'KRX', active: true },
  { country: 'KR', name: '셀트리온',        ticker: '068270', exchange: 'KRX', active: true },
  { country: 'KR', name: '삼성SDI',         ticker: '006400', exchange: 'KRX', active: true },
  { country: 'KR', name: 'LG화학',          ticker: '051910', exchange: 'KRX', active: true },
  { country: 'KR', name: '삼성물산',        ticker: '028260', exchange: 'KRX', active: true },
  { country: 'KR', name: 'KB금융',          ticker: '105560', exchange: 'KRX', active: true },
  { country: 'KR', name: '신한지주',        ticker: '055550', exchange: 'KRX', active: true },
  { country: 'KR', name: '하나금융지주',    ticker: '086790', exchange: 'KRX', active: true },
  { country: 'KR', name: '삼성생명',        ticker: '032830', exchange: 'KRX', active: true },
  { country: 'KR', name: 'SK이노베이션',    ticker: '096770', exchange: 'KRX', active: true },
  { country: 'KR', name: 'SK텔레콤',        ticker: '017670', exchange: 'KRX', active: true },
  { country: 'KR', name: 'KT',              ticker: '030200', exchange: 'KRX', active: true },
  { country: 'KR', name: 'LG전자',          ticker: '066570', exchange: 'KRX', active: true },
  { country: 'KR', name: '삼성전기',        ticker: '009150', exchange: 'KRX', active: true },
  { country: 'KR', name: '삼성SDS',         ticker: '018260', exchange: 'KRX', active: true },
  { country: 'KR', name: '한화에어로스페이스', ticker: '012450', exchange: 'KRX', active: true },
  { country: 'KR', name: 'HD현대중공업',    ticker: '329180', exchange: 'KRX', active: true },
  { country: 'KR', name: '대한항공',        ticker: '003490', exchange: 'KRX', active: true },
  { country: 'KR', name: '아모레퍼시픽',    ticker: '090430', exchange: 'KRX', active: true },
  { country: 'KR', name: 'LG생활건강',      ticker: '051900', exchange: 'KRX', active: true },
  { country: 'KR', name: '한국전력',        ticker: '015760', exchange: 'KRX', active: true },
  { country: 'KR', name: '두산에너빌리티',  ticker: '034020', exchange: 'KRX', active: true }
];

let runtimeUniverse = JSON.parse(JSON.stringify(DEFAULT_UNIVERSE));

function getUniverse() {
  return runtimeUniverse.filter(s => s.active);
}

function getAllUniverse() {
  return runtimeUniverse;
}

function setUniverse(list) {
  runtimeUniverse = list;
}

module.exports = { getUniverse, getAllUniverse, setUniverse, DEFAULT_UNIVERSE };