// ============================================================
// STRONG BUY SCANNER — Frontend (app.js) v11
// Phase 5: 상세 화면 UI 전면 개편
//   - 점수 원형 게이지 (Analyst 0~100 통일)
//   - 지지/저항 현재가 옆 표시
//   - WHY 요약 카드형
//   - 가격구조 / 거래량 카드형
// ============================================================

const DEFAULT_CONFIG = {
  weights: { ma: 30, macd: 20, rsi: 15, adx: 15, bb: 20 },
  strongBuyThreshold: 80,
  analystMinGrade: 'BUY',
  allowAnalystNA: true,
  hardGates: { ma50: true, ma200: true, macd: true, adx: true, di: true, adxMin: 20 },
  maPoints: { ma20: 10, ma50: 10, ma200: 10 },
  macdPoints: { signal: 10, zero: 5, hist: 5 },
  rsiBands: [
    { min: 75, max: Infinity, score: 0 }, { min: 70, max: 75, score: 8 },
    { min: 65, max: 70, score: 13 }, { min: 55, max: 65, score: 15 },
    { min: 50, max: 55, score: 12 }, { min: 40, max: 50, score: 7 },
    { min: 0, max: 40, score: 3 }
  ],
  adxBands: [
    { min: 30, max: Infinity, score: 15 }, { min: 25, max: 30, score: 13 },
    { min: 20, max: 25, score: 9 }, { min: 15, max: 20, score: 5 },
    { min: 0, max: 15, score: 2 }
  ],
  bbBands: [
    { min: 0.75, max: 0.90, score: 20 }, { min: 0.60, max: 0.75, score: 17 },
    { min: 0.50, max: 0.60, score: 13 }, { min: 0.45, max: 0.50, score: 8 },
    { min: 0.20, max: 0.45, score: 4 }, { min: 0.00, max: 0.20, score: 0 }
  ]
};

const ANALYST_GRADE_RANK = {
  STRONG_BUY: 3, BUY: 2, HOLD: 1, SELL: 0, STRONG_SELL: 0, 'N/A': -1
};

// ============================================================
// Storage
// ============================================================
const Storage = {
  FAV_KEY: 'strongBuyScanner.favorites',
  HISTORY_KEY: 'strongBuyScanner.history',
  HISTORY_MAX_DAYS: 30,

  getFavorites() {
    try {
      return JSON.parse(localStorage.getItem(this.FAV_KEY) || '[]');
    } catch (e) { return []; }
  },

  isFavorite(symbol) {
    return this.getFavorites().includes(symbol);
  },

  toggleFavorite(symbol) {
    const favs = this.getFavorites();
    const idx = favs.indexOf(symbol);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(symbol);
    localStorage.setItem(this.FAV_KEY, JSON.stringify(favs));
    return favs.includes(symbol);
  },

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '{}');
    } catch (e) { return {}; }
  },

  saveHistory(data) {
    const history = this.getHistory();
    const today = new Date().toISOString().slice(0, 10);
    if (!history[today]) history[today] = {};

    for (const d of data) {
      if (d.technical === 'STRONG_BUY') {
        history[today][d.symbol] = {
          name: d.name,
          score: d.technicalScore,
          analyst: d.analyst
        };
      }
    }

    const dates = Object.keys(history).sort();
    if (dates.length > this.HISTORY_MAX_DAYS) {
      const remove = dates.slice(0, dates.length - this.HISTORY_MAX_DAYS);
      remove.forEach(d => delete history[d]);
    }

    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
  },

  getSBSince(symbol) {
    const history = this.getHistory();
    const dates = Object.keys(history).sort().reverse();
    let consecutive = 0;
    let since = null;

    for (const date of dates) {
      if (history[date][symbol]) {
        consecutive++;
        since = date;
      } else {
        break;
      }
    }

    if (consecutive === 0) return null;
    return { days: consecutive, startDate: since };
  },

  clearAll() {
    localStorage.removeItem(this.FAV_KEY);
    localStorage.removeItem(this.HISTORY_KEY);
  }
};

// ============================================================
// App
// ============================================================
const App = {
  SETTINGS_PASSWORD: '1234',
  AUTH_KEY: 'strongBuyScanner.auth',
  AUTH_TTL: 60 * 60 * 1000,

  filter: 'all',
  search: '',
  data: [],
  config: null,
  currentDetail: null,
  currentChartDays: 90,
  chart: null,
  chartSeries: {},
  lastUpdated: null,
  loading: false,
  _lastRefresh: 0,

  init() {
    this.config = Settings.load();
    Settings.renderAll();
    this.loadData();
  },

  setFilter(f) {
    this.filter = f;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === f);
    });
    this.renderMain();
  },

  setSearch(v) {
    this.search = v.trim().toLowerCase();
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = v ? 'block' : 'none';
    this.renderMain();
  },

  clearSearch() {
    this.search = '';
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    this.renderMain();
  },

  async navigate(screen) {
    if (screen === 'settings') {
      const ok = await this.requireSettingsAuth();
      if (!ok) return;
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${screen}`);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.screen === screen);
    });
    if (screen === 'main') {
      this.currentDetail = null;
      this.destroyChart();
    }
    if (screen === 'settings') Settings.renderSummary();
    window.scrollTo({ top: 0, behavior: 'instant' });
  },

  goBack() { this.navigate('main'); },

  async loadData(forceRefresh = false) {
    if (this.loading) return;
    this.loading = true;

    const list = document.getElementById('strongBuyList');
    if (list) {
      list.innerHTML = `
        <div class="skeleton-list">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>`;
    }
    document.getElementById('errorBanner').classList.add('hidden');

    try {
      let url = '/api/scanner';
      if (forceRefresh) {
        const cfgStr = encodeURIComponent(JSON.stringify(this.config));
        url += `?force=1&config=${cfgStr}`;
      }
      const res = await fetch(url, { method: 'GET' });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      this.data = (json.results || []).map(d => this.recomputeAnalyst(d));
      this.lastUpdated = json.updatedAt || null;

      Storage.saveHistory(this.data);

      const el = document.getElementById('lastUpdated');
      if (el) el.textContent = `Last updated ${this.lastUpdated || '—'}`;
      this.renderMain();
      Settings.renderDataStats();
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

  recomputeAnalyst(d) {
    if (d.analyst) {
      d.analyst = String(d.analyst).toUpperCase().replace(/\s+/g, '_');
    }
    if (d.analystDetail) {
      let weighted = 0;
      const a = d.analystDetail;
      if (a.strongBuy != null) {
        const sb = a.strongBuy || 0, b = a.buy || 0, h = a.hold || 0;
        const s = a.sell || 0, ss = a.strongSell || 0;
        const total = sb + b + h + s + ss;
        weighted = total > 0 ? (sb * 5 + b * 4 + h * 3 + s * 2 + ss * 1) / total : 0;
      } else if (a.score != null) {
        weighted = Number(a.score);
      }
      d.analystWeighted = weighted;
    }
    return d;
  },

  refresh() {
    const now = Date.now();
    const elapsed = now - this._lastRefresh;
    if (this._lastRefresh && elapsed < 60000) {
      const remain = Math.ceil((60000 - elapsed) / 1000);
      App.alert(`너무 자주 새로고침했습니다.\n${remain}초 후 다시 시도하세요.`, '⏱️ 잠시만요');
      return;
    }
    this._lastRefresh = now;
    this.loadData(true);
  },

  getFiltered() {
    let result = this.data;

    if (this.filter === 'US' || this.filter === 'KR') {
      result = result.filter(d => d.flag === this.filter);
    } else if (this.filter === 'fav') {
      const favs = Storage.getFavorites();
      result = result.filter(d => favs.includes(d.symbol));
    }

    if (this.search) {
      result = result.filter(d =>
        d.name.toLowerCase().includes(this.search) ||
        d.symbol.toLowerCase().includes(this.search)
      );
    }

    return result;
  },

  renderMain() {
    const list = document.getElementById('strongBuyList');
    const dontBuyList = document.getElementById('dontBuyList');
    const dontBuySection = document.getElementById('dontBuySection');
    if (!list) return;

    const filtered = this.getFiltered();
    const minGrade = this.config.analystMinGrade || 'BUY';
    const minRank = ANALYST_GRADE_RANK[minGrade] ?? 2;
    const allowNA = !!this.config.allowAnalystNA;

    const isStrongBuy = d => {
      if (d.technical !== 'STRONG_BUY') return false;
      if (allowNA && (!d.analyst || d.analyst === 'N/A')) return true;
      const rank = ANALYST_GRADE_RANK[d.analyst] ?? -1;
      return rank >= minRank;
    };

    const strongBuys = filtered.filter(isStrongBuy);
    const dontBuys = filtered.filter(d => !isStrongBuy(d));

    const gradeOrder = { BUY: 4, HOLD: 3, SELL: 2, STRONG_SELL: 1, 'N/A': 0 };
    dontBuys.sort((a, b) => {
      const ga = gradeOrder[a.technical] ?? 0;
      const gb = gradeOrder[b.technical] ?? 0;
      if (ga !== gb) return gb - ga;
      return (b.technicalScore || 0) - (a.technicalScore || 0);
    });

    this.renderSummaryBar(strongBuys, filtered);

    const sectionLabel = document.getElementById('sectionLabel');
    if (sectionLabel) {
      let label = '🔥 STRONG BUY';
      if (this.filter === 'fav') label = '⭐ 즐겨찾기';
      if (this.search) label += ` — "${this.search}"`;
      sectionLabel.textContent = label;
    }

    if (strongBuys.length === 0) {
      let msg = '조건을 만족하는 Strong Buy 종목이 없습니다.';
      if (this.filter === 'fav' && Storage.getFavorites().length === 0) {
        msg = '즐겨찾기한 종목이 없습니다.<br>종목 옆 ☆를 눌러 추가하세요.';
      } else if (this.search) {
        msg = `"${this.search}"에 해당하는 종목이 없습니다.`;
      }
      list.innerHTML = `<div class="empty-state">${msg}</div>`;
    } else {
      const favs = Storage.getFavorites();
      list.innerHTML = strongBuys.map(d => this.renderStockItem(d, favs)).join('');
    }

    if (!dontBuyList || !dontBuySection) return;

    if (dontBuys.length === 0) {
      dontBuySection.style.display = 'none';
    } else {
      dontBuySection.style.display = '';
      const countEl = document.getElementById('dontBuyCount');
      if (countEl) countEl.textContent = `${dontBuys.length}개`;

      const favs = Storage.getFavorites();
      dontBuyList.innerHTML = dontBuys.map(d => this.renderStockItem(d, favs, true)).join('');
    }
  },

  renderStockItem(d, favs, showGrade = false) {
    const isFav = favs.includes(d.symbol);
    const sbSince = Storage.getSBSince(d.symbol);
    let sinceBadge = '';
    if (sbSince && sbSince.days >= 2) {
      sinceBadge = `<span class="stock-sb-badge">${sbSince.days}일째</span>`;
    } else if (sbSince && sbSince.days === 1) {
      sinceBadge = `<span class="stock-sb-badge new">NEW</span>`;
    }

    let gradeBadge = '';
    if (showGrade && d.technical) {
      const grade = d.technical.toLowerCase().replace('_', '-');
      gradeBadge = `<span class="grade-badge grade-${grade}">${this.gradeLabel(d.technical)}</span>`;
    }

    const scoreMini = showGrade && d.technicalScore != null
      ? `<span class="stock-score-mini">${Math.round(d.technicalScore)}</span>`
      : '';

    return `
      <div class="stock-item" onclick="App.showDetail('${this.escapeAttr(d.symbol)}')">
        <span class="stock-flag">${d.flag === 'US' ? '🇺🇸' : '🇰🇷'}</span>
        <span class="stock-name">${this.escapeHtml(d.name)}${sinceBadge}</span>
        ${gradeBadge}
        ${scoreMini}
        <span class="stock-price">${d.price ? this.escapeHtml(d.price) : ''}</span>
        <button class="stock-fav-btn ${isFav ? 'active' : ''}"
                onclick="event.stopPropagation(); App.toggleFavInline('${this.escapeAttr(d.symbol)}')"
                title="즐겨찾기">${isFav ? '★' : '☆'}</button>
      </div>`;
  },

  renderSummaryBar(strongBuys, filtered) {
    const el = document.getElementById('summaryBar');
    if (!el) return;
    const usCount = strongBuys.filter(d => d.flag === 'US').length;
    const krCount = strongBuys.filter(d => d.flag === 'KR').length;
    const totalTech = filtered.filter(d => d.technical === 'STRONG_BUY').length;
    const favCount = Storage.getFavorites().length;
    el.innerHTML = `
      <div class="summary-chip">🔥 <span class="num">${strongBuys.length}</span></div>
      <div class="summary-chip">🇺🇸 <span class="num">${usCount}</span></div>
      <div class="summary-chip">🇰🇷 <span class="num">${krCount}</span></div>
      <div class="summary-chip">⭐ <span class="num">${favCount}</span></div>
      <div class="summary-chip">Tech SB <span class="num">${totalTech}</span></div>
    `;
  },

  toggleFavInline(symbol) {
    const isFav = Storage.toggleFavorite(symbol);
    this.showToast(isFav ? '⭐ 즐겨찾기 추가' : '즐겨찾기 해제');
    this.renderMain();
  },

  toggleFav() {
    if (!this.currentDetail) return;
    const symbol = this.currentDetail.symbol;
    const isFav = Storage.toggleFavorite(symbol);
    this.showToast(isFav ? '⭐ 즐겨찾기 추가' : '즐겨찾기 해제');
    this.updateFavButton(symbol);
  },

  updateFavButton(symbol) {
    const btn = document.getElementById('detailFavBtn');
    if (!btn) return;
    const isFav = Storage.isFavorite(symbol);
    btn.textContent = isFav ? '★' : '☆';
    btn.classList.toggle('active', isFav);
  },

  showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--surface2);color:var(--text);padding:12px 20px;border-radius:10px;border:1px solid var(--border);font-size:14px;font-weight:500;z-index:9999;opacity:0;transition:all 0.25s;pointer-events:none;`;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 1500);
  },

  // ============================================================
  // 커스텀 모달
  // ============================================================
  _showModal({ type = 'info', title, message, confirmText = '확인', cancelText, onConfirm, onCancel }) {
    return new Promise(resolve => {
      const existing = document.querySelector('.modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const hasCancel = !!cancelText;

      overlay.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">${this.escapeHtml(title || '')}</div>
          <div class="modal-message">${this.escapeHtml(message || '')}</div>
          <div class="modal-actions">
            ${hasCancel ? `<button class="modal-btn secondary" data-action="cancel">${this.escapeHtml(cancelText)}</button>` : ''}
            <button class="modal-btn ${type === 'danger' ? 'danger' : 'primary'}" data-action="confirm">${this.escapeHtml(confirmText)}</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const close = (result) => {
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 150);
        resolve(result);
      };

      overlay.querySelector('[data-action="confirm"]').onclick = () => {
        if (onConfirm) onConfirm();
        close(true);
      };

      if (hasCancel) {
        overlay.querySelector('[data-action="cancel"]').onclick = () => {
          if (onCancel) onCancel();
          close(false);
        };
      }

      overlay.onclick = (e) => {
        if (e.target === overlay) {
          if (onCancel) onCancel();
          close(false);
        }
      };

      const onEsc = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onEsc);
          if (onCancel) onCancel();
          close(false);
        }
      };
      document.addEventListener('keydown', onEsc);
    });
  },

  alert(message, title = '알림') {
    return this._showModal({ type: 'info', title, message, confirmText: '확인' });
  },

  confirm(message, title = '확인', { type = 'warn', confirmText = '확인', cancelText = '취소' } = {}) {
    return this._showModal({ type, title, message, confirmText, cancelText });
  },

  // ============================================================
  // 설정 잠금
  // ============================================================
  isSettingsUnlocked() {
    try {
      const raw = localStorage.getItem(this.AUTH_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data.expiresAt > Date.now();
    } catch (e) { return false; }
  },

  unlockSettings() {
    const data = { expiresAt: Date.now() + this.AUTH_TTL };
    localStorage.setItem(this.AUTH_KEY, JSON.stringify(data));
  },

  lockSettings() {
    localStorage.removeItem(this.AUTH_KEY);
  },

  async requireSettingsAuth() {
    if (this.isSettingsUnlocked()) return true;
    const password = await this._showPasswordModal();
    if (password === null) return false;

    if (password === this.SETTINGS_PASSWORD) {
      this.unlockSettings();
      this.showToast('🔓 설정 잠금 해제');
      return true;
    } else {
      await this.alert('비밀번호가 틀렸습니다.', '🔒 인증 실패');
      return false;
    }
  },

  _showPasswordModal() {
    return new Promise(resolve => {
      const existing = document.querySelector('.modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      overlay.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">🔒 설정 잠금</div>
          <div class="modal-message">설정에 접근하려면 비밀번호를 입력하세요.</div>
          <input type="password" id="settingsPasswordInput" class="modal-input"
                 placeholder="비밀번호" autocomplete="off">
          <div class="modal-actions">
            <button class="modal-btn secondary" data-action="cancel">취소</button>
            <button class="modal-btn primary" data-action="confirm">확인</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('#settingsPasswordInput');
      setTimeout(() => input.focus(), 100);

      const close = (result) => {
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 150);
        resolve(result);
      };

      const submit = () => close(input.value);

      overlay.querySelector('[data-action="confirm"]').onclick = submit;
      overlay.querySelector('[data-action="cancel"]').onclick = () => close(null);

      input.onkeydown = (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') close(null);
      };

      overlay.onclick = (e) => {
        if (e.target === overlay) close(null);
      };
    });
  },

  // ============================================================
  // 상세 화면
  // ============================================================
  showDetail(symbol) {
    const d = this.data.find(x => x.symbol === symbol);
    if (!d) return;
    this.currentDetail = d;

    // 기본 정보
    document.getElementById('detailName').textContent = d.name;
    document.getElementById('detailTicker').textContent = d.symbol;
    document.getElementById('detailPrice').textContent = d.price || 'N/A';

    // 즐겨찾기 버튼
    this.updateFavButton(symbol);

    // SB 배지 (헤더, 별 옆)
    const sbHeaderEl = document.getElementById('sbSinceHeader');
    const sbSince = Storage.getSBSince(symbol);
    if (sbSince && sbSince.days >= 1) {
      if (sbSince.days === 1) {
        sbHeaderEl.innerHTML = `<span class="sb-since-badge-inner new">🆕 NEW</span>`;
      } else {
        sbHeaderEl.innerHTML = `<span class="sb-since-badge-inner">🔥 ${sbSince.days}일째</span>`;
      }
      sbHeaderEl.style.display = '';
    } else {
      sbHeaderEl.innerHTML = '';
      sbHeaderEl.style.display = 'none';
    }

    // 지지/저항 (현재가 옆)
    this.renderSupportResistance(d.priceStructure);

    // 점수 카드 (Analyst / Technical)
    this.renderScoreCards(d);

    // WHY 카드
    this.renderWhyCards(d);

    // 가격 구조
    this.renderPriceStructure(d.priceStructure);

    // 거래량
    this.renderVolumeAnalysis(d.volumeAnalysis);

    // 뉴스
    this.renderNews(d.news);

    this.navigate('detail');

    this.currentChartDays = 90;
    this.loadChart(90);
  },

  // ------------------------------------------------------------
  // 지지/저항 (현재가 옆)
  // ------------------------------------------------------------
  renderSupportResistance(ps) {
    const el = document.getElementById('supportResistanceRow');
    if (!el) return;

    if (!ps || ps.status !== 'ok') {
      el.innerHTML = '';
      return;
    }

    const items = [];

    if (ps.nearestResistance) {
      const r = ps.nearestResistance;
      items.push(`
        <div class="sr-chip sr-resistance">
          <span class="sr-icon">↑</span>
          <span class="sr-label">저항</span>
          <span class="sr-price">${this.escapeHtml(String(r.price))}</span>
          <span class="sr-dist">+${r.distancePct.toFixed(1)}%</span>
        </div>
      `);
    }

    if (ps.nearestSupport) {
      const s = ps.nearestSupport;
      items.push(`
        <div class="sr-chip sr-support">
          <span class="sr-icon">↓</span>
          <span class="sr-label">지지</span>
          <span class="sr-price">${this.escapeHtml(String(s.price))}</span>
          <span class="sr-dist">-${s.distancePct.toFixed(1)}%</span>
        </div>
      `);
    }

    el.innerHTML = items.join('');
  },

  // ------------------------------------------------------------
  // 점수 카드 (Analyst / Technical 원형 게이지)
  // ------------------------------------------------------------
  renderScoreCards(d) {
    // Analyst 0~100 환산 (등급 매핑)
    let analystScore100 = null;
    let analystGrade = d.analyst || 'N/A';

    if (d.analystWeighted != null && d.analystWeighted > 0) {
      analystScore100 = this.weightedToScore100(d.analystWeighted);
      analystGrade = this.weightedToGradeKey(d.analystWeighted);
    }

    // Technical
    const technicalScore100 = d.technicalScore != null ? Math.round(d.technicalScore) : null;
    const technicalGrade = d.technical || 'N/A';

    // Analyst 카드
    this.updateScoreCard({
      cardEl: 'analystCard',
      ringEl: 'analystRing',
      numEl: 'analystScoreNum',
      badgeEl: 'analystGradeBadge',
      score: analystScore100,
      grade: analystGrade
    });

    // Technical 카드
    this.updateScoreCard({
      cardEl: 'technicalCard',
      ringEl: 'technicalRing',
      numEl: 'technicalScoreNum',
      badgeEl: 'technicalGradeBadge',
      score: technicalScore100,
      grade: technicalGrade
    });

    // Analyst 상세 (게이지 아래 카운트)
    const detailEl = document.getElementById('detailAnalystDetail');
    if (detailEl) {
      detailEl.innerHTML = d.analystDetail ? this.renderAnalystCounts(d.analystDetail) : '';
    }
  },

  updateScoreCard({ cardEl, ringEl, numEl, badgeEl, score, grade }) {
    const card = document.getElementById(cardEl);
    const ring = document.getElementById(ringEl);
    const num = document.getElementById(numEl);
    const badge = document.getElementById(badgeEl);
    if (!card || !ring || !num || !badge) return;

    // 게이지 채우기
    const circumference = 2 * Math.PI * 42; // r=42
    const pct = score != null ? Math.max(0, Math.min(100, score)) : 0;
    const offset = circumference * (1 - pct / 100);

    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${offset}`;

    // 색상 클래스
    const gradeKey = String(grade || 'N/A').toUpperCase().replace(/\s+/g, '_');
    const colorClass = this.gradeColorClass(gradeKey);
    card.className = 'score-card ' + colorClass;
    ring.className.baseVal = 'ring-fill ' + colorClass;
    badge.className = 'score-grade-badge ' + colorClass;

    num.textContent = score != null ? Math.round(score) : '—';
    badge.textContent = this.gradeLabelEnglish(gradeKey);
  },

  gradeColorClass(gradeKey) {
    switch (gradeKey) {
      case 'STRONG_BUY':  return 'grade-strong-buy';
      case 'BUY':         return 'grade-buy';
      case 'HOLD':        return 'grade-hold';
      case 'SELL':        return 'grade-sell';
      case 'STRONG_SELL': return 'grade-strong-sell';
      default:            return 'grade-na';
    }
  },

  // 0~100 환산 (구간 매핑)
  weightedToScore100(w) {
    if (w >= 4.5) return 95;  // Strong Buy
    if (w >= 3.5) return 80;  // Buy
    if (w >= 2.5) return 60;  // Hold
    if (w >= 1.5) return 40;  // Sell
    return 20;                // Strong Sell
  },

  weightedToGradeKey(w) {
    if (w >= 4.5) return 'STRONG_BUY';
    if (w >= 3.5) return 'BUY';
    if (w >= 2.5) return 'HOLD';
    if (w >= 1.5) return 'SELL';
    return 'STRONG_SELL';
  },

  gradeLabelEnglish(grade) {
    switch (grade) {
      case 'STRONG_BUY':  return 'STRONG BUY';
      case 'BUY':         return 'BUY';
      case 'HOLD':        return 'HOLD';
      case 'SELL':        return 'SELL';
      case 'STRONG_SELL': return 'STRONG SELL';
      default:            return 'N/A';
    }
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

  renderAnalystCounts(a) {
    if (!a) return '';

    // 카운트 (미국)
    if (a.strongBuy != null) {
      return `
        <div class="analyst-counts">
          <span><b>${a.strongBuy}</b> SB</span>
          <span><b>${a.buy}</b> B</span>
          <span><b>${a.hold}</b> H</span>
          <span><b>${a.sell}</b> S</span>
          <span><b>${a.strongSell}</b> SS</span>
        </div>
        ${a.targetPrice ? `<div class="analyst-target">목표주가 ${Number(a.targetPrice).toLocaleString()}</div>` : ''}
      `;
    }

    // 한국 (score만 있음)
    if (a.targetPrice) {
      return `<div class="analyst-target">목표주가 ${Number(a.targetPrice).toLocaleString()}원</div>`;
    }

    return '';
  },

  // ------------------------------------------------------------
  // WHY 카드 (5개 지표 간단 요약)
  // ------------------------------------------------------------
  renderWhyCards(d) {
    const el = document.getElementById('whyCards');
    if (!el) return;

    if (!d.breakdown) {
      el.innerHTML = '<div class="empty-state">기술적 분석 데이터 없음</div>';
      return;
    }

    const b = d.breakdown;
    const cards = [];

    // MA
    if (b.ma && b.ma.conditions) {
      const passCount = b.ma.conditions.filter(c => c.pass).length;
      let icon, label, desc, tone;
      if (passCount === 3) { icon = '📈'; tone = 'good'; desc = '3/3 이평선 위'; }
      else if (passCount === 2) { icon = '📈'; tone = 'ok'; desc = '2/3 이평선 위'; }
      else if (passCount === 1) { icon = '📉'; tone = 'warn'; desc = '1/3 이평선 위'; }
      else { icon = '📉'; tone = 'bad'; desc = '이평선 아래'; }
      label = 'MA';
      cards.push(this.whyCard(icon, label, desc, `${b.ma.score}/${b.ma.max}`, tone));
    }

    // MACD
    if (b.macd && b.macd.conditions) {
      const passCount = b.macd.conditions.filter(c => c.pass).length;
      let icon, desc, tone;
      if (passCount === 3) { icon = '⚡'; tone = 'good'; desc = '강한 상승 신호'; }
      else if (passCount >= 1) { icon = '⚡'; tone = 'ok'; desc = '일부 상승 신호'; }
      else { icon = '⚠️'; tone = 'bad'; desc = '약세 신호'; }
      cards.push(this.whyCard(icon, 'MACD', desc, `${b.macd.score}/${b.macd.max}`, tone));
    }

    // RSI
    if (b.rsi && b.rsi.value != null) {
      const rsi = b.rsi.value;
      let icon, desc, tone;
      if (rsi >= 55 && rsi <= 65) { icon = '💪'; tone = 'good'; desc = `${rsi.toFixed(1)} 건강`; }
      else if (rsi > 70) { icon = '🔥'; tone = 'warn'; desc = `${rsi.toFixed(1)} 과열`; }
      else if (rsi > 50) { icon = '💪'; tone = 'ok'; desc = `${rsi.toFixed(1)} 완만`; }
      else if (rsi >= 40) { icon = '😐'; tone = 'ok'; desc = `${rsi.toFixed(1)} 중립`; }
      else { icon = '📉'; tone = 'bad'; desc = `${rsi.toFixed(1)} 약세`; }
      cards.push(this.whyCard(icon, 'RSI', desc, `${b.rsi.score}/${b.rsi.max}`, tone));
    }

    // ADX
    if (b.adx && b.adx.value != null) {
      const adx = b.adx.value;
      let icon, desc, tone;
      if (adx >= 25) { icon = '🎯'; tone = 'good'; desc = `${adx.toFixed(1)} 강한 추세`; }
      else if (adx >= 20) { icon = '🎯'; tone = 'ok'; desc = `${adx.toFixed(1)} 추세 형성`; }
      else { icon = '😐'; tone = 'warn'; desc = `${adx.toFixed(1)} 추세 약함`; }
      cards.push(this.whyCard(icon, 'ADX', desc, `${b.adx.score}/${b.adx.max}`, tone));
    }

    // BB
    if (b.bb && b.bb.position != null) {
      const pos = b.bb.position * 100;
      let icon, desc, tone;
      if (pos >= 75 && pos <= 90) { icon = '📊'; tone = 'good'; desc = `${pos.toFixed(0)}% 상단 근처`; }
      else if (pos > 90) { icon = '🔥'; tone = 'warn'; desc = `${pos.toFixed(0)}% 상단 돌파`; }
      else if (pos >= 50) { icon = '📊'; tone = 'ok'; desc = `${pos.toFixed(0)}% 중앙 위`; }
      else if (pos >= 20) { icon = '📊'; tone = 'ok'; desc = `${pos.toFixed(0)}% 하단 쪽`; }
      else { icon = '📉'; tone = 'bad'; desc = `${pos.toFixed(0)}% 하단`; }
      cards.push(this.whyCard(icon, 'BB', desc, `${b.bb.score}/${b.bb.max}`, tone));
    }

    // Analyst 추가 카드
    if (d.analystWeighted != null && d.analystWeighted > 0) {
      const w = d.analystWeighted;
      const gradeKey = this.weightedToGradeKey(w);
      const label = this.gradeLabelEnglish(gradeKey);
      let tone = 'ok';
      if (gradeKey === 'STRONG_BUY' || gradeKey === 'BUY') tone = 'good';
      else if (gradeKey === 'SELL' || gradeKey === 'STRONG_SELL') tone = 'bad';
      cards.push(this.whyCard('✅', 'Analyst', label, w.toFixed(2), tone));
    } else if (d.analyst === 'N/A') {
      cards.push(this.whyCard('ℹ️', 'Analyst', '데이터 없음', 'N/A', 'warn'));
    }

    el.innerHTML = cards.join('');
  },

  whyCard(icon, label, desc, score, tone) {
    return `
      <div class="why-card tone-${tone}">
        <div class="why-card-icon">${icon}</div>
        <div class="why-card-body">
          <div class="why-card-label">${this.escapeHtml(label)}</div>
          <div class="why-card-desc">${this.escapeHtml(desc)}</div>
        </div>
        <div class="why-card-score">${this.escapeHtml(score)}</div>
      </div>
    `;
  },

  // ------------------------------------------------------------
  // 가격 구조 (카드형)
  // ------------------------------------------------------------
  renderPriceStructure(ps) {
    const el = document.getElementById('priceStructureContent');
    if (!el) return;

    if (!ps || ps.status !== 'ok') {
      el.innerHTML = `<div class="empty-state">${ps?.message || '가격·차트 구조 데이터 없음'}</div>`;
      return;
    }

    const cards = [];

    // 1) 추세
    if (ps.trend) {
      const trendClass = {
        up: 'tone-good',
        down: 'tone-bad',
        sideways: 'tone-warn',
        unknown: ''
      }[ps.trend.direction] || '';

      const trendIcon = {
        up: '📈',
        down: '📉',
        sideways: '➡️'
      }[ps.trend.direction] || '';

      let detailHtml = '';
      if (ps.trend.detail) {
        const dd = ps.trend.detail;
        detailHtml = `
          <div class="ps-mini-detail">
            고점 ${this.escapeHtml(String(dd.prevHigh))} → ${this.escapeHtml(String(dd.currHigh))}<br>
            저점 ${this.escapeHtml(String(dd.prevLow))} → ${this.escapeHtml(String(dd.currLow))}
          </div>`;
      }

      cards.push(`
        <div class="info-card ${trendClass}">
          <div class="info-card-head">
            <span class="info-card-icon">${trendIcon}</span>
            <span class="info-card-label">추세</span>
          </div>
          <div class="info-card-value">${this.escapeHtml(ps.trend.label || '—')}</div>
          ${ps.trend.message ? `<div class="info-card-sub">${this.escapeHtml(ps.trend.message)}</div>` : ''}
          ${detailHtml}
        </div>
      `);
    }

    // 2) 지지선
    if (ps.nearestSupport) {
      const s = ps.nearestSupport;
      const strengthTone = s.strength === 'major' ? 'tone-good' : s.strength === 'medium' ? 'tone-warn' : '';
      cards.push(`
        <div class="info-card tone-support">
          <div class="info-card-head">
            <span class="info-card-icon">🟢</span>
            <span class="info-card-label">지지선</span>
          </div>
          <div class="info-card-value">${this.escapeHtml(String(s.price))}</div>
          <div class="info-card-sub">
            테스트 <b>${s.testCount}회</b> · <span class="${strengthTone}">${this.escapeHtml(s.strengthLabel)}</span>
          </div>
          <div class="info-card-dist">현재가 -${s.distancePct.toFixed(2)}%</div>
        </div>
      `);
    }

    // 3) 저항선
    if (ps.nearestResistance) {
      const r = ps.nearestResistance;
      const strengthTone = r.strength === 'major' ? 'tone-good' : r.strength === 'medium' ? 'tone-warn' : '';
      cards.push(`
        <div class="info-card tone-resistance">
          <div class="info-card-head">
            <span class="info-card-icon">🔴</span>
            <span class="info-card-label">저항선</span>
          </div>
          <div class="info-card-value">${this.escapeHtml(String(r.price))}</div>
          <div class="info-card-sub">
            테스트 <b>${r.testCount}회</b> · <span class="${strengthTone}">${this.escapeHtml(r.strengthLabel)}</span>
          </div>
          <div class="info-card-dist">현재가 +${r.distancePct.toFixed(2)}%</div>
        </div>
      `);
    }

    // 4) 캔들 패턴
    if (ps.candlePattern && ps.candlePattern.pattern !== 'none') {
      const candleIcon = {
        marubozu_bull: '🕯️', marubozu_bear: '🕯️',
        bullish_engulfing: '🕯️', bearish_engulfing: '🕯️',
        hammer: '🔨', inverted_hammer: '🔨', doji: '➖'
      }[ps.candlePattern.pattern] || '🕯️';

      const candleTone = {
        marubozu_bull: 'tone-good',
        bullish_engulfing: 'tone-good',
        hammer: 'tone-good',
        marubozu_bear: 'tone-bad',
        bearish_engulfing: 'tone-bad',
        inverted_hammer: 'tone-warn',
        doji: 'tone-warn'
      }[ps.candlePattern.pattern] || '';

      cards.push(`
        <div class="info-card ${candleTone}">
          <div class="info-card-head">
            <span class="info-card-icon">${candleIcon}</span>
            <span class="info-card-label">최근 캔들</span>
          </div>
          <div class="info-card-value">${this.escapeHtml(ps.candlePattern.label)}</div>
          ${ps.candlePattern.meaning ? `<div class="info-card-sub">${this.escapeHtml(ps.candlePattern.meaning)}</div>` : ''}
        </div>
      `);
    }

    // 5) 돌파/이탈
    if (ps.breakout && ps.breakout.type !== 'none') {
      const isUp = ps.breakout.type === 'resistance_breakout';
      cards.push(`
        <div class="info-card ${isUp ? 'tone-good' : 'tone-bad'} info-card-breakout">
          <div class="info-card-value">${this.escapeHtml(ps.breakout.label)}</div>
          <div class="info-card-sub">종가 ${this.escapeHtml(String(ps.breakout.closePrice))}</div>
        </div>
      `);
    }

    el.innerHTML = cards.length
      ? `<div class="info-card-grid">${cards.join('')}</div>`
      : '<div class="empty-state">가격 구조 분석 데이터 부족</div>';
  },

  // ------------------------------------------------------------
  // 거래량 (카드 + 바 게이지)
  // ------------------------------------------------------------
  renderVolumeAnalysis(vol) {
    const el = document.getElementById('volumeAnalysisContent');
    if (!el) return;

    if (!vol || vol.status !== 'ok') {
      el.innerHTML = `<div class="empty-state">${vol?.message || '거래량 분석 데이터 없음'}</div>`;
      return;
    }

    // 거래량 비율 → 바 게이지 (0.5~3.0 매핑, 100% 기준)
    const ratio = vol.volumeRatio || 1;
    const barPct = Math.min(100, Math.max(0, (ratio / 3) * 100));

    const toneMap = {
      low: 'tone-bad',
      normal: 'tone-neutral',
      high: 'tone-warn',
      surge: 'tone-good'
    };
    const tone = toneMap[vol.volumeStatus] || 'tone-neutral';

    const relToneMap = {
      up_with_volume: 'tone-good',
      up_without_volume: 'tone-warn',
      down_with_volume: 'tone-bad',
      down_without_volume: 'tone-neutral',
      neutral: 'tone-neutral'
    };
    const relTone = relToneMap[vol.priceVolumeRelation?.type] || 'tone-neutral';

    el.innerHTML = `
      <div class="info-card ${tone}">
        <div class="info-card-head">
          <span class="info-card-icon">📊</span>
          <span class="info-card-label">거래량</span>
        </div>
        <div class="vol-bar-wrap">
          <div class="vol-bar">
            <div class="vol-bar-fill ${tone}" style="width:${barPct}%"></div>
            <div class="vol-bar-marker" style="left:33.3%"></div>
            <div class="vol-bar-marker" style="left:66.6%"></div>
          </div>
          <div class="vol-bar-scale">
            <span>0.5x</span>
            <span>1x</span>
            <span>2x</span>
            <span>3x</span>
          </div>
        </div>
        <div class="vol-bar-main">
          <span class="vol-bar-ratio">${ratio.toFixed(2)}x</span>
          <span class="vol-bar-status">${this.escapeHtml(vol.volumeStatusLabel)}${vol.multiplier ? ` · ${this.escapeHtml(vol.multiplier)}` : ''}</span>
        </div>
        <div class="info-card-sub">
          현재 ${this.formatNumber(vol.currentVolume)} · 평균 ${this.formatNumber(vol.volumeSMA20)}
        </div>
      </div>

      <div class="info-card ${relTone}">
        <div class="info-card-head">
          <span class="info-card-icon">🔗</span>
          <span class="info-card-label">가격-거래량 관계</span>
        </div>
        <div class="info-card-value">${this.escapeHtml(vol.priceVolumeRelation?.label || '—')}</div>
        ${vol.priceVolumeRelation?.meaning ? `<div class="info-card-sub">${this.escapeHtml(vol.priceVolumeRelation.meaning)}</div>` : ''}
      </div>
    `;
  },

  formatNumber(n) {
    if (n == null) return '—';
    return Math.round(n).toLocaleString('ko-KR');
  },

  // ------------------------------------------------------------
  // 뉴스
  // ------------------------------------------------------------
  renderNews(news) {
    const el = document.getElementById('newsList');
    if (!el) return;
    if (!news || news.length === 0) { el.innerHTML = '<div class="news-empty">뉴스 데이터 없음</div>'; return; }
    el.innerHTML = news.slice(0, 5).map(n => `
      <div class="news-item" onclick="window.open('${this.escapeAttr(n.url)}', '_blank')">
        <div class="news-title">${this.escapeHtml(n.title)}</div>
        <div class="news-meta">
          <span>${this.escapeHtml(n.date || '')}</span>
          <span>${this.escapeHtml(n.source || '')}</span>
          <a class="news-link" href="${this.escapeAttr(n.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">원문 보기 ↗</a>
        </div>
      </div>`).join('');
  },

  // ============================================================
  // 차트
  // ============================================================
  async loadChart(days) {
    if (!this.currentDetail) return;
    this.currentChartDays = days;

    document.querySelectorAll('.chart-controls button').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.days, 10) === days);
    });

    const container = document.getElementById('priceChart');
    if (!container) return;
    container.innerHTML = `
      <div class="chart-loading">
        <div class="spinner"></div>
        <div style="margin-top:12px;font-size:13px;color:var(--text-dim)">차트 로딩 중...</div>
      </div>`;

    try {
      const res = await fetch(`/api/chart?symbol=${encodeURIComponent(this.currentDetail.symbol)}&days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      this.renderChart(json);
    } catch (err) {
      console.error('Chart failed:', err);
      container.innerHTML = `<div class="empty-state">차트를 불러오지 못했습니다.<br>${this.escapeHtml(err.message)}</div>`;
    }
  },

  destroyChart() {
    if (this.chart) {
      try { this.chart.remove(); } catch (e) {}
      this.chart = null;
      this.chartSeries = {};
    }
  },

  renderChart(data) {
    const container = document.getElementById('priceChart');
    if (!container) return;
    this.destroyChart();
    container.innerHTML = '';

    if (typeof LightweightCharts === 'undefined') {
      container.innerHTML = '<div class="empty-state">차트 라이브러리를 불러오지 못했습니다.</div>';
      return;
    }

    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 320,
      layout: { background: { color: '#14141f' }, textColor: '#e8e8f0', fontSize: 11 },
      grid: { vertLines: { color: '#2a2a40' }, horzLines: { color: '#2a2a40' } },
      timeScale: { borderColor: '#2a2a40', timeVisible: false },
      rightPriceScale: { borderColor: '#2a2a40', scaleMargins: { top: 0.1, bottom: 0.3 } },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#6c5ce7', width: 1, style: 2 },
        horzLine: { color: '#6c5ce7', width: 1, style: 2 }
      }
    });
    this.chart = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00d68f', downColor: '#ff3d71',
      borderUpColor: '#00d68f', borderDownColor: '#ff3d71',
      wickUpColor: '#00d68f', wickDownColor: '#ff3d71'
    });
    candleSeries.setData(data.candles.map(c => ({
      time: c.date, open: c.open, high: c.high, low: c.low, close: c.close
    })));
    this.chartSeries.candles = candleSeries;

    if (data.ma20 && data.ma20.length) {
      const s = chart.addLineSeries({ color: '#ffaa00', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(data.ma20);
      this.chartSeries.ma20 = s;
    }
    if (data.ma50 && data.ma50.length) {
      const s = chart.addLineSeries({ color: '#6c5ce7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(data.ma50);
      this.chartSeries.ma50 = s;
    }
    if (data.ma200 && data.ma200.length) {
      const s = chart.addLineSeries({ color: '#ff3d71', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(data.ma200);
      this.chartSeries.ma200 = s;
    }

    if (data.bbUpper && data.bbUpper.length) {
      const sU = chart.addLineSeries({ color: '#00d68f44', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      sU.setData(data.bbUpper);
      const sL = chart.addLineSeries({ color: '#00d68f44', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      sL.setData(data.bbLower);
      this.chartSeries.bbUpper = sU;
      this.chartSeries.bbLower = sL;
    }

    const volumeSeries = chart.addHistogramSeries({
      color: '#2a2a40',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume'
    });
    volumeSeries.setData(data.candles.map(c => ({
      time: c.date,
      value: c.volume,
      color: c.close >= c.open ? '#00d68f33' : '#ff3d7133'
    })));
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    this.chartSeries.volume = volumeSeries;

    chart.timeScale().fitContent();
    this.applyChartToggles();
  },

  applyChartToggles() {
    const maOn = document.getElementById('toggleMA')?.checked;
    const bbOn = document.getElementById('toggleBB')?.checked;
    const setVisible = (s, v) => { if (s) s.applyOptions({ visible: v }); };
    setVisible(this.chartSeries.ma20, maOn);
    setVisible(this.chartSeries.ma50, maOn);
    setVisible(this.chartSeries.ma200, maOn);
    setVisible(this.chartSeries.bbUpper, bbOn);
    setVisible(this.chartSeries.bbLower, bbOn);
  },

  async clearAllHistory() {
    const ok = await App.confirm(
      '모든 즐겨찾기와 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
      '⚠️ 모든 기록 삭제',
      { type: 'danger', confirmText: '삭제', cancelText: '취소' }
    );
    if (!ok) return;
    Storage.clearAll();
    this.renderMain();
    Settings.renderDataStats();
    this.showToast('🗑️ 모든 기록이 삭제되었습니다');
  },

  escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  },

  escapeAttr(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      return this.mergeDeep(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), JSON.parse(raw));
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
  },

  save() {
    const cfg = this.readFromUI();
    const errors = this.validate(cfg);
    if (errors.length) {
      App.alert('설정 오류:\n' + errors.join('\n'), '⚠️ 확인이 필요해요');
      return;
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cfg));
    App.config = cfg;
    App.data = (App.data || []).map(d => App.recomputeAnalyst(d));
    App.renderMain();
    this.renderSummary();

    App.alert('설정이 저장되었습니다.\n잠시 후 자동 새로고침됩니다.', '✅ 저장 완료');
    setTimeout(() => App.loadData(true), 800);
  },

  async reset() {
    const ok = await App.confirm(
      '모든 설정을 기본값으로 복원하시겠습니까?',
      '🔄 기본값 복원',
      { type: 'warn', confirmText: '복원', cancelText: '취소' }
    );
    if (!ok) return;
    localStorage.removeItem(this.STORAGE_KEY);
    App.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    App.data = (App.data || []).map(d => App.recomputeAnalyst(d));
    this.renderAll();
    App.renderMain();
    setTimeout(() => App.loadData(true), 500);
  },

  validate(cfg) {
    const errors = [];
    const wSum = cfg.weights.ma + cfg.weights.macd + cfg.weights.rsi + cfg.weights.adx + cfg.weights.bb;
    if (wSum !== 100) errors.push(`지표별 배점 합계가 ${wSum}입니다. 100이어야 합니다.`);
    const maSum = cfg.maPoints.ma20 + cfg.maPoints.ma50 + cfg.maPoints.ma200;
    if (maSum !== cfg.weights.ma) errors.push(`MA 세부 점수 합(${maSum})이 MA 배점(${cfg.weights.ma})과 다릅니다.`);
    const macdSum = cfg.macdPoints.signal + cfg.macdPoints.zero + cfg.macdPoints.hist;
    if (macdSum !== cfg.weights.macd) errors.push(`MACD 세부 점수 합(${macdSum})이 MACD 배점(${cfg.weights.macd})과 다릅니다.`);
    if (cfg.strongBuyThreshold < 0 || cfg.strongBuyThreshold > 100) errors.push('Technical Strong Buy 기준은 0~100.');
    const rsiErr = this.checkBandOverlap(cfg.rsiBands, 'RSI'); if (rsiErr) errors.push(rsiErr);
    const adxErr = this.checkBandOverlap(cfg.adxBands, 'ADX'); if (adxErr) errors.push(adxErr);
    const bbErr = this.checkBandOverlap(cfg.bbBands, 'Bollinger'); if (bbErr) errors.push(bbErr);
    return errors;
  },

  checkBandOverlap(bands, label) {
    const sorted = [...bands].sort((a, b) => a.min - b.min);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].min < sorted[i - 1].max) {
        return `${label} 구간 겹침: [${sorted[i-1].min}, ${sorted[i-1].max}] ↔ [${sorted[i].min}, ${sorted[i].max}]`;
      }
    }
    return null;
  },

  renderAll() {
    const c = this.load();
    document.getElementById('cfg-weight-ma').value = c.weights.ma;
    document.getElementById('cfg-weight-macd').value = c.weights.macd;
    document.getElementById('cfg-weight-rsi').value = c.weights.rsi;
    document.getElementById('cfg-weight-adx').value = c.weights.adx;
    document.getElementById('cfg-weight-bb').value = c.weights.bb;

    const sbT = document.getElementById('cfg-strongbuy-threshold');
    sbT.value = c.strongBuyThreshold;
    document.getElementById('cfg-strongbuy-threshold-val').textContent = c.strongBuyThreshold;

    document.getElementById('cfg-analyst-min-grade').value = c.analystMinGrade || 'BUY';
    document.getElementById('cfg-allow-analyst-na').checked = !!c.allowAnalystNA;

    document.getElementById('gate-ma50').checked = c.hardGates.ma50;
    document.getElementById('gate-ma200').checked = c.hardGates.ma200;
    document.getElementById('gate-macd').checked = c.hardGates.macd;
    document.getElementById('gate-adx').checked = c.hardGates.adx;
    document.getElementById('gate-di').checked = c.hardGates.di;
    document.getElementById('gate-adx-value').value = c.hardGates.adxMin;

    document.getElementById('cfg-ma20').value = c.maPoints.ma20;
    document.getElementById('cfg-ma50').value = c.maPoints.ma50;
    document.getElementById('cfg-ma200').value = c.maPoints.ma200;
    document.getElementById('cfg-macd-signal').value = c.macdPoints.signal;
    document.getElementById('cfg-macd-zero').value = c.macdPoints.zero;
    document.getElementById('cfg-macd-hist').value = c.macdPoints.hist;

    this.renderBands('rsiBands', c.rsiBands, 'rsi');
    this.renderBands('adxBands', c.adxBands, 'adx');
    this.renderBands('bbBands', c.bbBands, 'bb');

    this.updateTotalDisplay();
    this.renderSummary();
    this.renderDataStats();
  },

  renderSummary() {
    const el = document.getElementById('settingsSummary');
    if (!el) return;
    const c = this.load();
    const gradeLabel = { STRONG_BUY: 'Strong Buy만', BUY: 'Buy 이상', HOLD: 'Hold 이상' }[c.analystMinGrade] || c.analystMinGrade;
    el.innerHTML = `
      <div class="settings-summary-title">현재 설정</div>
      <div class="settings-summary-grid">
        <div class="summary-item"><span class="label">Technical SB</span><span class="value green">${c.strongBuyThreshold}점+</span></div>
        <div class="summary-item"><span class="label">메인 최소등급</span><span class="value">${gradeLabel}</span></div>
        <div class="summary-item"><span class="label">N/A 허용</span><span class="value ${c.allowAnalystNA ? 'green' : ''}">${c.allowAnalystNA ? 'ON' : 'OFF'}</span></div>
      </div>`;
  },

  renderDataStats() {
    const favEl = document.getElementById('favCount');
    const histEl = document.getElementById('historyCount');
    if (favEl) {
      const favs = Storage.getFavorites();
      favEl.textContent = `${favs.length}개 종목`;
    }
    if (histEl) {
      const history = Storage.getHistory();
      const days = Object.keys(history).length;
      histEl.textContent = `${days}일 기록`;
    }
  },

  renderBands(containerId, bands, type) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const sorted = [...bands].sort((a, b) => b.min - a.min);
    el.innerHTML = sorted.map((b, i) => {
      const minStr = b.min === -Infinity ? '-∞' : b.min;
      const maxStr = b.max === Infinity ? '∞' : b.max;
      return `<div class="band-row" data-type="${type}" data-index="${i}">
        <label>${minStr} ~ ${maxStr}</label>
        <input type="number" class="band-score-input" value="${b.score}" min="0">
        <span>점</span>
      </div>`;
    }).join('');
  },

  updateTotalDisplay() {
    const get = id => parseInt(document.getElementById(id)?.value) || 0;
    const total = get('cfg-weight-ma') + get('cfg-weight-macd') + get('cfg-weight-rsi') + get('cfg-weight-adx') + get('cfg-weight-bb');
    const el = document.getElementById('cfg-weight-total');
    if (el) {
      el.textContent = total;
      el.style.color = total === 100 ? 'var(--green)' : 'var(--red)';
    }
  },

  readFromUI() {
    const num = id => { const v = parseInt(document.getElementById(id)?.value); return isNaN(v) ? 0 : v; };
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
      weights: { ma: num('cfg-weight-ma'), macd: num('cfg-weight-macd'), rsi: num('cfg-weight-rsi'), adx: num('cfg-weight-adx'), bb: num('cfg-weight-bb') },
      strongBuyThreshold: num('cfg-strongbuy-threshold'),
      analystMinGrade: select('cfg-analyst-min-grade'),
      allowAnalystNA: bool('cfg-allow-analyst-na'),
      hardGates: { ma50: bool('gate-ma50'), ma200: bool('gate-ma200'), macd: bool('gate-macd'), adx: bool('gate-adx'), di: bool('gate-di'), adxMin: num('gate-adx-value') },
      maPoints: { ma20: num('cfg-ma20'), ma50: num('cfg-ma50'), ma200: num('cfg-ma200') },
      macdPoints: { signal: num('cfg-macd-signal'), zero: num('cfg-macd-zero'), hist: num('cfg-macd-hist') },
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

document.addEventListener('DOMContentLoaded', () => App.init());