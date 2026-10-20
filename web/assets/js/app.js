/* ============================================================
   APP — WebSocket 数据接入 / 渲染 / 交互
   ============================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = {
    snap: null,
    range: 'all',
    fxMode: 'heat',
    selected: null,
    lastLogKey: '',
    ws: null,
    retry: 0,
    reconnectTimer: null,
  };

  // ══════════ 时钟 ══════════
  function tickClock() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    $('clk').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    $('clkD').textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${wd}`;
  }
  setInterval(tickClock, 1000); tickClock();

  // ══════════ 连接 ══════════
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    state.ws = ws;

    ws.onopen = () => {
      state.retry = 0;
      setConn('wait', '已连接');
      // 心跳保活
      clearInterval(ws._hb);
      ws._hb = setInterval(() => {
        if (ws.readyState === 1) ws.send('ping');
      }, 15000);
    };

    ws.onmessage = ev => {
      try {
        const data = JSON.parse(ev.data);
        if (data.ts) render(data);
      } catch (e) { /* 忽略非 JSON */ }
    };

    ws.onclose = () => {
      clearInterval(ws._hb);
      setConn('off', '连接断开');
      const delay = Math.min(1000 * Math.pow(1.8, state.retry++), 15000);
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connect, delay);
    };

    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }

  function setConn(kind, text) {
    const led = $('connState').querySelector('.led');
    led.className = 'led' + (kind === 'wait' ? '' : kind === 'warn' ? ' warn' : kind === 'off' ? ' off' : '');
    $('modeLabel').textContent = text;
  }

  // ══════════ 主渲染 ══════════
  function render(d) {
    state.snap = d;
    renderHeader(d);
    renderKpi(d.metrics);
    renderPulse(d.market);
    renderGates(d.risk);
    renderLog(d.events);
    renderPositions(d.positions);
    renderEngine(d);
    Charts.equity($('eqChart'), d.equityCurve, d.metrics.start, state.range);

    // 信号选择保持
    if (!state.selected && d.signals.length) state.selected = d.signals[0].symbol;
    const sel = d.signals.find(s => s.symbol === state.selected) || d.signals[0];
    if (sel && !state._userPicked) state.selected = sel.symbol;

    Charts.alpha($('alphaChart'), d.signals, sym => {
      state.selected = sym;
      state._userPicked = true;
      const s = state.snap.signals.find(x => x.symbol === sym);
      renderFactorDetail(s);
      highlightPulse();
      if (state.fxMode === 'radar') Charts.factorRadar($('factorChart'), s);
    });

    $('sigTag').textContent = `${d.signals.filter(s => s.action !== 'FLAT').length} 活跃信号`;

    if (state.fxMode === 'heat') Charts.factorHeat($('factorChart'), d.signals);
    else Charts.factorRadar($('factorChart'), sel);

    renderFactorDetail(sel);
    highlightPulse();
  }

  // ── 顶栏 ──
  function renderHeader(d) {
    const m = d.metrics;
    $('topEquity').textContent = FMT.money(m.equity, 0);
    const pnlEl = $('topPnl');
    pnlEl.textContent = FMT.pct(m.pnlPct);
    pnlEl.className = m.pnl >= 0 ? 'up' : 'down';

    const modeMap = { LIVE: ['', '实时行情'], SYNTHETIC: ['warn', '模拟行情'], RECONNECTING: ['warn', '重连中'] };
    const [k, t] = modeMap[d.mode] || ['warn', d.mode];
    setConn(k, t);
  }

  // ── KPI ──
  function renderKpi(m) {
    setVal('kEquity', FMT.money(m.equity, 2));
    $('kEquityS').textContent = `本金 ${FMT.money(m.start, 0)}`;

    const pnl = $('kPnl');
    pnl.textContent = FMT.money(m.pnl, 2);
    pnl.className = 'v ' + (m.pnl >= 0 ? 'up' : 'down');
    $('kPnlS').textContent = `${FMT.pct(m.pnlPct)} ｜ 费 ${FMT.money(m.fees, 2)}`;

    setVal('kSharpe', m.sharpe.toFixed(2));
    $('kSharpe').className = 'v ' + (m.sharpe >= 0 ? '' : 'down');
    setVal('kMdd', m.mdd.toFixed(2) + '%');
    setVal('kWin', m.winRate.toFixed(1) + '%');
    $('kWinS').textContent = `${m.trades} 笔平仓`;
  }

  function setVal(id, v) {
    const el = $(id);
    if (el.textContent !== v) {
      el.textContent = v;
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  // ── 市场脉搏 ──
  function renderPulse(market) {
    const box = $('pulseList');
    if (!box._rows) {
      box.innerHTML = '';
      box._rows = {};
      market.symbols.forEach(s => {
        const row = document.createElement('div');
        row.className = 'pulse-row';
        row.dataset.sym = s.symbol;
        row.innerHTML = `
          <div class="nm">${s.symbol.replace('USDT', '')}</div>
          <canvas class="spark"></canvas>
          <div class="px">—</div>
          <div class="chg">—</div>`;
        box.appendChild(row);
        box._rows[s.symbol] = row;
      });
    }
    market.symbols.forEach(s => {
      const row = box._rows[s.symbol];
      if (!row) return;
      row.querySelector('.px').textContent = FMT.price(s.price);
      const chg = row.querySelector('.chg');
      chg.textContent = FMT.pct(s.change24h);
      chg.className = 'chg ' + (s.change24h >= 0 ? 'up' : 'dn');
      const cv = row.querySelector('canvas');
      Charts.spark(cv, s.spark, s.change24h >= 0 ? '#ff4d5e' : '#12d18e');
    });
    $('pulseTag').textContent = market.synthetic ? '模拟源' : `${market.symbols.length} 标的`;
  }

  function highlightPulse() {
    const box = $('pulseList');
    if (!box._rows) return;
    Object.entries(box._rows).forEach(([sym, row]) => {
      row.classList.toggle('sel', sym === state.selected);
    });
  }

  // ── 风控闸门 ──
  function renderGates(gates) {
    const box = $('gateList');
    if (!box._init) {
      box._init = true;
      box.innerHTML = '';
      gates.forEach(g => {
        const el = document.createElement('div');
        el.className = 'gate';
        el.dataset.n = g.name;
        el.innerHTML = `<div class="g-top"><span class="k">${g.cn}</span><span class="st">PASS</span></div>
                        <div class="d">—</div>`;
        box.appendChild(el);
      });
    }
    let ok = 0;
    gates.forEach(g => {
      const el = box.querySelector(`[data-n="${g.name}"]`);
      if (!el) return;
      if (g.ok) ok++;
      el.classList.toggle('bad', !g.ok);
      el.querySelector('.st').textContent = g.ok ? 'PASS' : 'BLOCK';
      el.querySelector('.d').textContent = g.detail;
    });
    const tag = $('gateTag');
    tag.textContent = `${ok} / ${gates.length}`;
    tag.className = 'tag ' + (ok === gates.length ? 'green' : 'red');
  }

  // ── 决策日志 ──
  function renderLog(events) {
    const box = $('logList');
    if (!events || !events.length) return;
    const key = events.length + '|' + events[0].ts;
    if (key === state.lastLogKey) return;
    state.lastLogKey = key;
    box.innerHTML = events.slice(0, 40).map(e => {
      const lv = e.level === 'danger' ? 'danger' : e.level === 'warn' ? 'warn' : '';
      return `<div class="log-item">
        <span class="tm">${FMT.clock(e.ts)}</span>
        <span class="kd ${lv}">${e.kind}</span>
        <span class="tx">${FMT.highlight(e.text)}</span>
      </div>`;
    }).join('');
    $('logCount').textContent = events.length;
  }

  // ── 持仓 ──
  function renderPositions(ps) {
    const box = $('posList');
    $('posTag').textContent = ps.length + ' 个';
    if (!ps.length) {
      box.innerHTML = '<div class="pos-empty">当前空仓 · Agent 等待信号达阈值</div>';
      return;
    }
    const maxN = Math.max(...ps.map(p => Math.abs(p.notional)), 1);
    box.innerHTML = ps.map(p => {
      const cls = p.upnl >= 0 ? 'up' : 'dn';
      const w = Math.abs(p.notional) / maxN * 100;
      return `<div class="pos-row">
        <div class="nm">${p.label.replace('/USDT', '')}<span class="side ${p.side === 'LONG' ? 'L' : 'S'}">${p.side === 'LONG' ? '多' : '空'}</span></div>
        <div class="bar"><i class="${p.side === 'LONG' ? '' : 's'}" style="width:${w.toFixed(1)}%"></i></div>
        <div class="px" style="font-family:var(--mono);font-size:9.5px;color:#a5c1d8;text-align:right">${FMT.money(p.notional, 0)}</div>
        <div class="pnl ${cls}">${FMT.pct(p.upnlPct)}</div>
      </div>`;
    }).join('');
  }

  // ── 引擎 ──
  function renderEngine(d) {
    const e = d.engine, m = d.metrics;
    $('eCycle').textContent = FMT.compact(e.cycles);
    $('eMs').textContent = e.cycleMs.toFixed(1) + 'ms';
    $('eMsg').textContent = FMT.compact(e.msgCount);
    $('eGross').textContent = m.gross.toFixed(0) + '%';
    $('eNet').textContent = m.net.toFixed(0) + '%';
    $('eCash').textContent = FMT.money(m.cash, 0);
  }

  // ── 因子明细 ──
  function renderFactorDetail(s) {
    const box = $('factorDetail');
    if (!s) { box.innerHTML = '<div class="fd-empty">暂无信号</div>'; return; }
    const act = s.action === 'LONG'
      ? '<span style="color:#ff4d5e">做多</span>'
      : s.action === 'SHORT' ? '<span style="color:#12d18e">做空</span>'
        : '<span style="color:#5d7590">观望</span>';
    const rows = s.factors.map(f => {
      const pct = Math.abs(f.score) * 50;
      const left = f.score >= 0 ? 50 : 50 - pct;
      const color = f.score >= 0 ? 'rgba(255,77,94,.8)' : 'rgba(18,209,142,.8)';
      return `<div class="fd-row">
        <div class="l"><span>${f.cn}</span><b style="color:${f.score >= 0 ? '#ff4d5e' : '#12d18e'}">${f.score >= 0 ? '+' : ''}${f.score.toFixed(2)}</b></div>
        <div class="t"><i style="left:${left}%;width:${pct}%;background:${color};box-shadow:0 0 6px ${color}"></i></div>
      </div>`;
    }).join('');
    box.innerHTML = `
      <div class="fd-head">
        <div class="n">${s.label} ${act}</div>
        <div class="a">α ${(s.alpha * 100).toFixed(2)} ｜ 置信 ${(s.confidence * 100).toFixed(0)}% ｜ ATR ${s.atrPct.toFixed(2)}%</div>
      </div>
      <div class="fd-reason">${s.reason}</div>
      ${rows}`;
  }

  // ══════════ 交互 ══════════
  function bindUI() {
    // 净值区间
    $('eqSeg').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      $('eqSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      state.range = b.dataset.r;
      if (state.snap) Charts.equity($('eqChart'), state.snap.equityCurve, state.snap.metrics.start, state.range);
    });

    // 因子视图
    $('fxSeg').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      $('fxSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      state.fxMode = b.dataset.m;
      if (!state.snap) return;
      if (state.fxMode === 'heat') Charts.factorHeat($('factorChart'), state.snap.signals);
      else {
        const s = state.snap.signals.find(x => x.symbol === state.selected) || state.snap.signals[0];
        Charts.factorRadar($('factorChart'), s);
      }
    });

    // 点击行情行选中标的
    $('pulseList').addEventListener('click', e => {
      const row = e.target.closest('.pulse-row');
      if (!row || !state.snap) return;
      state.selected = row.dataset.sym;
      state._userPicked = true;
      const s = state.snap.signals.find(x => x.symbol === state.selected);
      renderFactorDetail(s);
      highlightPulse();
      if (state.fxMode === 'radar') Charts.factorRadar($('factorChart'), s);
    });

    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        Charts.resize();
        if (state.snap) renderPulse(state.snap.market);
      }, 120);
    });
  }

  // ══════════ 启动 ══════════
  bindUI();
  connect();
  // 首帧占位
  setTimeout(() => {
    if (!state.snap) {
      Charts.equity($('eqChart'), null, 100000, 'all');
      setConn('warn', '等待数据');
    }
  }, 1200);
})();
