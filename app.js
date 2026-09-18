// ============================================================
// STRONG BUY SCANNER — Frontend (app.js)
// ============================================================

// ------------------------------------------------------------
// 기본 설정값
// ------------------------------------------------------------
const DEFAULT_CONFIG = {
  weights: { ma: 30, macd: 20, rsi: 15, adx: 15, bb: 20 },
  strongBuyThreshold: 80,
  analystStrongBuyThreshold: 4.5,
  analystMinGrade: 'STRONG_BUY',
  hardGates: {
    ma50: true,
    ma200: true,
    macd: true,
    adx: true,
    di: true,
    adxMin: 20
  },
  maPoints: { ma20: 10, ma50: 10, ma200: 10 },
  macdPoints: { signal: 10, zero: 5, hist: 5 },
  rsiBands: [
    { min: 75, max: Infinity, score: 0 },
    { min: 70, max: 75, score: 8 },
    { min: 65, max: 70, score: 13 },
    { min: 55, max: 65, score: 15 },
    { min: 50, max: 55, score: 12 },
    { min: 40, max: 50, score: 7 },
    { min: 0, max: 40, score: 3 }
  ],
  adxBands: [
    { min: 30, max: Infinity, score: 15 },
    { min: 25, max: 30, score: 13 },
    { min: 20, max: 25, score: 9 },
    { min: 15, max: 20, score: 5 },
    { min: 0, max: 15, score: 2 }
  ],
  bbBands: [
    { min: 0.75, max: 0.90, score: 20 },
    { min: 0.60, max: 0.75, score: 17 },
    { min: 0.50, max: 0.60, score: 13 },
    { min: 0.45, max: 0.50, score: 8 },
    { min: 0.20, max: 0.45, score: 4 },
    { min: 0.00, max: 0.20, score: 0 }
  ]
};

// Analyst 가중 평균 → 등급
const ANALYST_GRADE_RANK = {
  STRONG_BUY: 3,
  BUY: 2,
  HOLD: 1,
  SELL: 0,
  STRONG_SELL: 0,
  'N/A': -1
};

function analystWeightedAverage(detail) {
  if (!detail) return 0;
  const sb = detail.strongBuy || 0;
  const b  = detail.buy || 0;
  const h  = detail.hold || 0;
  const s  = detail.sell || 0;
  const ss = detail.strongSell || 0;
  const total = sb + b + h + s + ss;
  if (total === 0) return 0;
  return (sb * 5 + b * 4 + h * 3 + s * 2 + ss * 1) / total;
}

function analystGradeFromWeighted(w) {
  if (w >= 4.5) return 'STRONG_BUY';
  if (w >= 3.5) return 'BUY';
  if (w >= 2.5) return 'HOLD';
  if (w >= 1.5) return 'SELL';
  return 'STRONG_SELL';
}

// ============================================================
// App
// ============================================================
const App = {
  filter: 'all',
  data: [],
  config: null,
  currentDetail: null,
  lastUpdated: null,
  loading: false,

  init() {
    this.config = Settings.load();
    Settings.renderAll();
    this.bindNav();
    this.loadData();
  },

  bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.navigate(btn.dataset.screen);
      });
    });
  },

  setFilter(f) {
    this.filter = f;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === f);
    });
    this.renderMain();
  },

  navigate(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${screen}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.screen === screen);
    });

    if (screen === 'main') this.currentDetail = null;
    window.scrollTo({ top: 0, behavior: 'instant' });
  },

  goBack() {
    this.navigate('main');
  },

  // --------------------------------------------------------
  // 데이터 로드
  // --------------------------------------------------------
  async loadData(forceRefresh = false) {
    if (this.loading) return;
    this.loading = true;

    const list = document.getElementById('strongBuyList');
    if (list) list.innerHTML = '<div class="loading-state">데이터를 불러오는 중...</div>';
    document.getElementById('errorBanner').classList.add('hidden');

    try {
      const res = await fetch('/api/scanner', {
        method: forceRefresh ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: forceRefresh
          ? JSON.stringify({ force: true, config: this.config })
          : undefined
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (json.error) throw new Error(json.error);

      // 클라이언트 측 Analyst 재판정 (설정 반영)
      this.data = (json.results || []).map(d => this.recomputeAnalyst(d));
      this.lastUpdated = json.updatedAt || null;

      const el = document.getElementById('lastUpdated');
      if (el) el.textContent = `Last updated ${this.lastUpdated || '—'}`;

      this.renderMain();
    } catch (err) {
      console.error('Load failed:', err);
      const banner = document.getElementById('errorBanner');
      if (banner) {
        banner.classList.remove('hidden');
        const span = banner.querySelector('span');
        if (span) span.textContent = `⚠️ 데이터 업데이트 실패 — ${err.message}`;
      }
      if (list) list.innerHTML = '<div class="empty-state">데이터를 불러오지 못했습니다.</div>';
    } finally {
      this.loading = false;
    }
  },

  // 서버가 준 analystDetail을 클라이언트 설정 기준으로 재판정
  recomputeAnalyst(d) {
    if (!d.analystDetail) return d;
    const threshold = this.config.analystStrongBuyThreshold ?? 4.5;
    const w = analystWeightedAverage(d.analystDetail);
    const grade = (w >= threshold) ? 'STRONG_BUY' : analystGradeFromWeighted(w);
    return { ...d, analyst: grade, analystWeighted: w };
  },

  refresh() {
    this.loadData(true);
  },

  getFiltered() {
    if (this.filter === 'all') return this.data;
    return this.data.filter(d => d.flag === this.filter);
  },

  // --------------------------------------------------------
  // 메인 렌더
  // --------------------------------------------------------
  renderMain() {
    const list = document.getElementById('strongBuyList');
    if (!list) return;

    const filtered = this.getFiltered();
    const minGrade = this.config.analystMinGrade || 'STRONG_BUY';
    const minRank = ANALYST_GRADE_RANK[minGrade] ?? 3;

    const strongBuys = filtered.filter(d => {
      if (d.technical !== 'STRONG_BUY') return false;
      const rank = ANALYST_GRADE_RANK[d.analyst] ?? -1;
      return rank >= minRank;
    });

    if (strongBuys.length === 0) {
      list.innerHTML = '<div class="empty-state">조건을 만족하는 Strong Buy 종목이 없습니다.</div>';
      return;
    }

    list.innerHTML = strongBuys.map(d => `
      <div class="stock-item" onclick="App.showDetail('${this.escapeAttr(d.symbol)}')">
        <span class="stock-flag">${d.flag === 'US' ? '🇺🇸' : '🇰🇷'}</span>
        <span class="stock-name">${this.escapeHtml(d.name)}</span>
        <span class="stock-price">${d.price ? this.escapeHtml(d.price) : ''}</span>
        <span class="stock-fire">🔥</span>
      </div>
    `).join('');
  },

  // --------------------------------------------------------
  // 상세
  // --------------------------------------------------------
  showDetail(symbol) {
    const d = this.data.find(x => x.symbol === symbol);
    if (!d) return;

    this.currentDetail = d;

    document.getElementById('detailName').textContent = d.name;
    document.getElementById('detailTicker').textContent = d.symbol;
    document.getElementById('detailPrice').textContent = d.price || 'N/A';

    // Analyst
    const analystEl = document.getElementById('detailAnalyst');
    if (d.analyst === 'STRONG_BUY') {
      analystEl.textContent = '🟢 Strong Buy';
      analystEl.className = 'indicator-value green';
    } else if (!d.analyst || d.analyst === 'N/A') {
      analystEl.textContent = 'N/A';
      analystEl.className = 'indicator-value';
    } else {
      analystEl.textContent = this.gradeLabel(d.analyst);
      analystEl.className = 'indicator-value yellow';
    }

    // Analyst 세부 (개수)
    const detailEl = document.getElementById('detailAnalystDetail');
    if (d.analystDetail && detailEl) {
      const a = d.analystDetail;
      const w = d.analystWeighted != null ? d.analystWeighted.toFixed(2) : '—';
      detailEl.innerHTML = `
        <div class="analyst-counts">
          <span>Strong Buy ${a.strongBuy ?? 0}</span>
          <span>Buy ${a.buy ?? 0}</span>
          <span>Hold ${a.hold ?? 0}</span>
          <span>Sell ${a.sell ?? 0}</span>
          <span>Strong Sell ${a.strongSell ?? 0}</span>
        </div>
        <div class="analyst-weighted">가중 평균 ${w}</div>
      `;
    } else if (detailEl) {
      detailEl.innerHTML = '';
    }

    // Technical 등급
    const techEl = document.getElementById('detailTechnicalGrade');
    if (d.technical === 'STRONG_BUY') {
      techEl.textContent = '🟢 Strong Buy';
      techEl.className = 'indicator-value green';
    } else if (!d.technical || d.technical === 'N/A') {
      techEl.textContent = 'N/A';
      techEl.className = 'indicator-value';
    } else {
      techEl.textContent = this.gradeLabel(d.technical);
      techEl.className = 'indicator-value yellow';
    }

    const scoreEl = document.getElementById('detailTechnicalScore');
    scoreEl.textContent = d.technicalScore != null
      ? `${Math.round(d.technicalScore)} / 100`
      : 'N/A';

    this.renderBreakdown(d.breakdown);
    this.renderNews(d.news);

    this.navigate('detail');
    this.currentDetail = d;
  },

  gradeLabel(grade) {
    switch (grade) {
      case 'STRONG_BUY':  return 'Strong Buy';
      case 'BUY':         return 'Buy';
      case 'HOLD':        return 'Hold';
      case 'SELL':        return 'Sell';
      case 'STRONG_SELL': return 'Strong Sell';
      default:            return grade || 'N/A';
    }
  },

  renderBreakdown(b) {
    const el = document.getElementById('detailBreakdown');
    if (!el) return;

    if (!b) {
      el.innerHTML = '<div class="empty-state">기술적 분석 데이터 없음</div>';
      return;
    }

    const items = [];

    if (b.ma) {
      const conds = (b.ma.conditions || []).map(c =>
        `<div class="condition-row">
          <span class="condition-check ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '✗'}</span>
          <span>${this.escapeHtml(c.label)}</span>
        </div>`
      ).join('');
      items.push(`
        <div class="breakdown-item">
          <div class="breakdown-header">
            <span class="breakdown-name">MA</span>
            <span class="breakdown-score">${b.ma.score} / ${b.ma.max}</span>
          </div>
          <div class="breakdown-conditions">${conds}</div>
        </div>
      `);
    }

    if (b.macd) {
      const conds = (b.macd.conditions || []).map(c =>
        `<div class="condition-row">
          <span class="condition-check ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '✗'}</span>
          <span>${this.escapeHtml(c.label)}</span>
        </div>`
      ).join('');
      items.push(`
        <div class="breakdown-item">
          <div class="breakdown-header">
            <span class="breakdown-name">MACD</span>
            <span class="breakdown-score">${b.macd.score} / ${b.macd.max}</span>
          </div>
          <div class="breakdown-conditions">${conds}</div>
        </div>
      `);
    }

    if (b.rsi) {
      items.push(`
        <div class="breakdown-item">
          <div class="breakdown-header">
            <span class="breakdown-name">RSI</span>
            <span class="breakdown-score">${b.rsi.score} / ${b.rsi.max}</span>
          </div>
          <div class="breakdown-conditions">
            <div class="condition-row">
              <span>RSI ${b.rsi.value != null ? b.rsi.value.toFixed(1) : 'N/A'}</span>
            </div>
          </div>
        </div>
      `);
    }

    if (b.adx) {
      const conds = (b.adx.conditions || []).map(c =>
        `<div class="condition-row">
          <span class="condition-check ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '✗'}</span>
          <span>${this.escapeHtml(c.label)}</span>
        </div>`
      ).join('');
      items.push(`
        <div class="breakdown-item">
          <div class="breakdown-header">
            <span class="breakdown-name">ADX</span>
            <span class="breakdown-score">${b.adx.score} / ${b.adx.max}</span>
          </div>
          <div class="breakdown-conditions">
            <div class="condition-row">
              <span>ADX ${b.adx.value != null ? b.adx.value.toFixed(1) : 'N/A'}</span>
            </div>
            ${conds}
          </div>
        </div>
      `);
    }

    if (b.bb) {
      items.push(`
        <div class="breakdown-item">
          <div class="breakdown-header">
            <span class="breakdown-name">BOLLINGER</span>
            <span class="breakdown-score">${b.bb.score} / ${b.bb.max}</span>
          </div>
          <div class="breakdown-conditions">
            <div class="condition-row">
              <span>밴드 내 위치 ${b.bb.position != null ? (b.bb.position * 100).toFixed(1) + '%' : 'N/A'}</span>
            </div>
          </div>
        </div>
      `);
    }

    el.innerHTML = items.length
      ? items.join('')
      : '<div class="empty-state">기술적 분석 데이터 없음</div>';
  },

  renderNews(news) {
    const el = document.getElementById('newsList');
    if (!el) return;

    if (!news || news.length === 0) {
      el.innerHTML = '<div class="news-empty">뉴스 데이터 없음</div>';
      return;
    }

    el.innerHTML = news.slice(0, 5).map(n => `
      <div class="news-item" onclick="window.open('${this.escapeAttr(n.url)}', '_blank')">
        <div class="news-title">${this.escapeHtml(n.title)}</div>
        <div class="news-meta">
          <span>${this.escapeHtml(n.date || '')}</span>
          <span>${this.escapeHtml(n.source || '')}</span>
          <a class="news-link"
             href="${this.escapeAttr(n.url)}"
             target="_blank"
             rel="noopener noreferrer"
             onclick="event.stopPropagation()">원문 보기 ↗</a>
        </div>
      </div>
    `).join('');
  },

  escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  },

  escapeAttr(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};

// ============================================================
// Settings
// ============================================================
const Settings = {
  STORAGE_KEY: 'strongBuyScanner.config',

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      const parsed = JSON.parse(raw);
      return this.mergeDeep(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), parsed);
    } catch (e) {
      console.warn('Config load failed', e);
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
  },

  save() {
    const cfg = this.readFromUI();
    const errors = this.validate(cfg);
    if (errors.length) {
      alert('설정 오류:\n' + errors.join('\n'));
      return;
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cfg));
    App.config = cfg;
    // 데이터에 재판정 반영
    App.data = (App.data || []).map(d => App.recomputeAnalyst(d));
    App.renderMain();
    alert('설정이 저장되었습니다.');
    App.loadData(true);
  },

  reset() {
    if (!confirm('모든 설정을 기본값으로 복원하시겠습니까?')) return;
    localStorage.removeItem(this.STORAGE_KEY);
    App.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.renderAll();
    App.data = (App.data || []).map(d => App.recomputeAnalyst(d));
    App.renderMain();
    alert('기본값으로 복원되었습니다.');
    App.loadData(true);
  },

  validate(cfg) {
    const errors = [];

    const wSum = cfg.weights.ma + cfg.weights.macd + cfg.weights.rsi +
                 cfg.weights.adx + cfg.weights.bb;
    if (wSum !== 100) errors.push(`지표별 배점 합계가 ${wSum}입니다. 100이어야 합니다.`);

    const maSum = cfg.maPoints.ma20 + cfg.maPoints.ma50 + cfg.maPoints.ma200;
    if (maSum !== cfg.weights.ma) errors.push(`MA 세부 점수 합(${maSum})이 MA 배점(${cfg.weights.ma})과 다릅니다.`);

    const macdSum = cfg.macdPoints.signal + cfg.macdPoints.zero + cfg.macdPoints.hist;
    if (macdSum !== cfg.weights.macd) errors.push(`MACD 세부 점수 합(${macdSum})이 MACD 배점(${cfg.weights.macd})과 다릅니다.`);

    const rsiErr = this.checkBandOverlap(cfg.rsiBands, 'RSI');
    if (rsiErr) errors.push(rsiErr);

    const adxErr = this.checkBandOverlap(cfg.adxBands, 'ADX');
    if (adxErr) errors.push(adxErr);

    const bbErr = this.checkBandOverlap(cfg.bbBands, 'Bollinger');
    if (bbErr) errors.push(bbErr);

    if (cfg.strongBuyThreshold < 0 || cfg.strongBuyThreshold > 100) {
      errors.push('Technical Strong Buy 기준은 0~100 사이여야 합니다.');
    }

    if (cfg.analystStrongBuyThreshold < 1 || cfg.analystStrongBuyThreshold > 5) {
      errors.push('Analyst Strong Buy 기준은 1~5 사이여야 합니다.');
    }

    return errors;
  },

  checkBandOverlap(bands, label) {
    const sorted = [...bands].sort((a, b) => a.min - b.min);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].min < sorted[i - 1].max) {
        return `${label} 구간이 겹칩니다: [${sorted[i-1].min}, ${sorted[i-1].max}] ↔ [${sorted[i].min}, ${sorted[i].max}]`;
      }
    }
    return null;
  },
  renderAll() {
    const c = this.load();

    // 배점
    document.getElementById('cfg-weight-ma').value = c.weights.ma;
    document.getElementById('cfg-weight-macd').value = c.weights.macd;
    document.getElementById('cfg-weight-rsi').value = c.weights.rsi;
    document.getElementById('cfg-weight-adx').value = c.weights.adx;
    document.getElementById('cfg-weight-bb').value = c.weights.bb;

    // Strong Buy 기준
    document.getElementById('cfg-strongbuy-threshold').value = c.strongBuyThreshold;
    document.getElementById('cfg-analyst-strongbuy').value = c.analystStrongBuyThreshold ?? 4.5;
    document.getElementById('cfg-analyst-min-grade').value = c.analystMinGrade || 'STRONG_BUY';

    // Hard Gate
    document.getElementById('gate-ma50').checked = c.hardGates.ma50;
    document.getElementById('gate-ma200').checked = c.hardGates.ma200;
    document.getElementById('gate-macd').checked = c.hardGates.macd;
    document.getElementById('gate-adx').checked = c.hardGates.adx;
    document.getElementById('gate-di').checked = c.hardGates.di;
    document.getElementById('gate-adx-value').value = c.hardGates.adxMin;

    // MA 세부
    document.getElementById('cfg-ma20').value = c.maPoints.ma20;
    document.getElementById('cfg-ma50').value = c.maPoints.ma50;
    document.getElementById('cfg-ma200').value = c.maPoints.ma200;

    // MACD 세부
    document.getElementById('cfg-macd-signal').value = c.macdPoints.signal;
    document.getElementById('cfg-macd-zero').value = c.macdPoints.zero;
    document.getElementById('cfg-macd-hist').value = c.macdPoints.hist;

    // 밴드 UI
    this.renderBands('rsiBands', c.rsiBands, 'rsi');
    this.renderBands('adxBands', c.adxBands, 'adx');
    this.renderBands('bbBands', c.bbBands, 'bb');

    this.bindWeightInputs();
    this.updateTotalDisplay();
  },

  renderBands(containerId, bands, type) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const sorted = [...bands].sort((a, b) => b.min - a.min);

    el.innerHTML = sorted.map((b, i) => {
      const minStr = b.min === -Infinity ? '-∞' : b.min;
      const maxStr = b.max === Infinity ? '∞' : b.max;
      return `
        <div class="band-row" data-type="${type}" data-index="${i}">
          <label>${minStr} ~ ${maxStr}</label>
          <input type="number" class="band-score-input" value="${b.score}" min="0">
          <span>점</span>
        </div>
      `;
    }).join('');
  },

  bindWeightInputs() {
    const ids = ['cfg-weight-ma', 'cfg-weight-macd', 'cfg-weight-rsi',
                 'cfg-weight-adx', 'cfg-weight-bb'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.oninput = () => this.updateTotalDisplay();
    });
  },

  updateTotalDisplay() {
    const get = id => parseInt(document.getElementById(id)?.value) || 0;
    const total = get('cfg-weight-ma') + get('cfg-weight-macd') +
                  get('cfg-weight-rsi') + get('cfg-weight-adx') + get('cfg-weight-bb');
    const el = document.getElementById('cfg-weight-total');
    if (el) {
      el.textContent = total;
      el.style.color = total === 100 ? 'var(--green)' : 'var(--red)';
    }
  },

  readFromUI() {
    const num = id => {
      const v = parseInt(document.getElementById(id)?.value);
      return isNaN(v) ? 0 : v;
    };
    const floatNum = id => {
      const v = parseFloat(document.getElementById(id)?.value);
      return isNaN(v) ? 0 : v;
    };
    const bool = id => document.getElementById(id)?.checked ?? false;
    const select = id => document.getElementById(id)?.value ?? '';

    const readBands = (containerId, originalBands) => {
      const rows = document.querySelectorAll(`#${containerId} .band-row`);
      const sorted = [...originalBands].sort((a, b) => b.min - a.min);
      const result = [];
      rows.forEach((row, i) => {
        const score = parseInt(row.querySelector('.band-score-input').value) || 0;
        result.push({ min: sorted[i].min, max: sorted[i].max, score });
      });
      return result.sort((a, b) => a.min - b.min);
    };

    const currentCfg = this.load();

    return {
      weights: {
        ma: num('cfg-weight-ma'),
        macd: num('cfg-weight-macd'),
        rsi: num('cfg-weight-rsi'),
        adx: num('cfg-weight-adx'),
        bb: num('cfg-weight-bb')
      },
      strongBuyThreshold: num('cfg-strongbuy-threshold'),
      analystStrongBuyThreshold: floatNum('cfg-analyst-strongbuy'),
      analystMinGrade: select('cfg-analyst-min-grade'),
      hardGates: {
        ma50: bool('gate-ma50'),
        ma200: bool('gate-ma200'),
        macd: bool('gate-macd'),
        adx: bool('gate-adx'),
        di: bool('gate-di'),
        adxMin: num('gate-adx-value')
      },
      maPoints: {
        ma20: num('cfg-ma20'),
        ma50: num('cfg-ma50'),
        ma200: num('cfg-ma200')
      },
      macdPoints: {
        signal: num('cfg-macd-signal'),
        zero: num('cfg-macd-zero'),
        hist: num('cfg-macd-hist')
      },
      rsiBands: readBands('rsiBands', currentCfg.rsiBands),
      adxBands: readBands('adxBands', currentCfg.adxBands),
      bbBands: readBands('bbBands', currentCfg.bbBands)
    };
  },

  mergeDeep(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = this.mergeDeep(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
};

// ============================================================
// Bootstrap
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});