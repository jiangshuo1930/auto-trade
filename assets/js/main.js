/* ============================================================
   main.js — 面板数据驱动（逐帧复刻自视频）
   跑马灯 / LIFE OF A DECISION / ENTANGLEMENT MAP / BUY CURVE
   / DECISION STACK / SIX AGENTS / STATE BUILDER / CORE MODEL
   ============================================================ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const rnd = a => a[(Math.random() * a.length) | 0];
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pad = n => String(n).padStart(2, '0');
  const nowT = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

  const TOKENS = ['$TURDOG', '$SNOOCOIN', '$MOGIET', '$SHNUNT', '$ZAPMOON', '$PEBDOG', '$SLOINU', '$SHONUT', '$TOMCAT', '$SHPOMPW', '$DOLLDLORD', '$SNERMOOD', '$SYOLPUP', '$STONOGG', '$ZAPMAX', '$SLUXINU'];

  /* ============ 顶部跑马灯 ============ */
  (function () {
    const items = [];
    for (let i = 0; i < 14; i++) {
      const up = Math.random() > 0.35;
      items.push(`<span><b>${rnd(TOKENS)}</b> <i class="${up ? 'up' : 'dn'}">${up ? '+' : '-'}${(Math.random() * 40).toFixed(1)}%</i></span>`);
    }
    $('tkTrack').innerHTML = items.join('') + items.join('');
  })();

  /* ============ CORE MODEL 计数 ============ */
  let events = 39, veto = 73, openN = 2, blocks = 6, skips = 35, entries = 22;
  setInterval(() => {
    window.__trainN = (window.__trainN || 1327) + ri(1, 4);
    $('trainNum').textContent = window.__trainN.toLocaleString('en-US');
    $('orbLabels').textContent = window.__trainN.toLocaleString('en-US');
    if (Math.random() < 0.4) { events += Math.random() < 0.6 ? 1 : 0; $('cEvents').textContent = events; }
    if (Math.random() < 0.3) { veto = clampN(veto + ri(-2, 2), 60, 90); $('cVeto').textContent = veto + '%'; }
    if (Math.random() < 0.15) { openN = openN >= 6 ? 1 : openN + 1; $('cOpen').textContent = openN + ' / 6'; $('bookTag').textContent = 'MODEL BOOK · ' + openN + ' / 6 OPEN'; }
    if (Math.random() < 0.4) $('cInPlay').textContent = (1 + Math.random() * 2).toFixed(1) + '%';
    if (Math.random() < 0.4) $('cLimit').textContent = ri(8, 19) + '%';
  }, 1400);

  /* ============ CORE MODEL 散点 ============ */
  (function () {
    const cv = $('scatCv'), c = cv.getContext('2d');
    function size() {
      const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      cv.width = r.width * d; cv.height = r.height * d; c.setTransform(d, 0, 0, d, 0, 0);
    }
    new ResizeObserver(size).observe(cv); size();
    const dots = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(), s: Math.random() < 0.18 ? 2.2 : 1.2,
      col: Math.random() < 0.4 ? '#acd6e8' : Math.random() < 0.5 ? '#6be3ad' : Math.random() < 0.5 ? '#ff7385' : '#e6cf98',
      ph: Math.random() * 7,
    }));
    function draw(ms) {
      const t = ms / 1000;
      const w = cv.width / (Math.min(devicePixelRatio || 1, 2)), h = cv.height / (Math.min(devicePixelRatio || 1, 2));
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); c.stroke(); }
      for (const d of dots) {
        const pl = 0.5 + 0.5 * Math.sin(t * 2 + d.ph);
        c.fillStyle = d.col; c.globalAlpha = 0.4 + 0.5 * pl;
        c.beginPath(); c.arc(d.x * w, d.y * h, d.s, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  /* ============ LIFE OF A DECISION（徽章行） ============ */
  const LIFE_TPL = [
    { b: 'IND', cls: 'b-ind', t: () => `followed wallet · [Pledge] 0.92 · ${ri(4, 12)} in this coin` },
    { b: 'OMI', cls: 'b-omi', t: () => `state · TP +0.54 (s) 0.40 · SL -0.22 · ${ri(2, 6)}o min 0.25` },
    { b: 'PAY', cls: 'b-pay', t: () => `buy order · size 0.22 SOL · 38.4% block profit-takers` },
    { b: 'OMI', cls: 'b-omi', t: () => `PASS · 0 red flags · bundle 4% · snipers 3` },
    { b: 'EX', cls: 'b-ex', t: () => `Jito bundle landed · slot ${ri(3, 9)} · tp 0.00055 SOL` },
    { b: 'EX', cls: 'b-ex', t: () => `trade entry · decision record written` },
    { b: 'REC', cls: 'b-rec hl', t: () => `TP DISTRIBUTION RECORD · pump.fun · curve 53%` },
    { b: 'REC', cls: 'b-rec hl', t: () => `fast-forward 60 seconds · teaching set` },
    { b: 'OMI', cls: 'b-omi', t: () => `SL · -30% first at 27 min · training set` },
    { b: 'EX', cls: 'b-ex', t: () => `qrioojgol-5 orb trace 0B4-084199 · frac-buy` },
    { b: 'REC', cls: 'b-rec hl', t: () => `followed wallet AI099 bough 2.87 SOL · curve 57%` },
    { b: 'IND', cls: 'b-ind', t: () => `bundle int ${ri(2, 9)}-dot · wallets share one funder · bundle 4%` },
  ];
  const lifeLog = $('lifeLog');
  function pushLife(item) {
    const it = item || rnd(LIFE_TPL);
    const row = document.createElement('div');
    row.className = 'row' + (it.cls && it.cls.includes('hl') ? ' hl' : '');
    row.innerHTML = `<span class="badge ${it.cls}">${it.b}</span><span class="k">${it.t()}</span>`;
    lifeLog.prepend(row);
    while (lifeLog.children.length > 12) lifeLog.lastChild.remove();
  }
  for (let i = 0; i < 6; i++) pushLife();
  setInterval(pushLife, 900);

  /* ============ ENTANGLEMENT MAP（星团云：微点聚簇 + 标签大节点） ============ */
  (function () {
    const cv = $('entCv'), c = cv.getContext('2d');
    const LABELS = ['$CHADWICK', '$TURBOGET', '$YODEL', '$SBLORD', '$MOGIET', '$PEBDOG'];
    // 3 个聚簇中心 + 大节点
    const clusters = Array.from({ length: 3 }, (_, i) => ({
      x: 0.3 + i * 0.22 + Math.random() * 0.08, y: 0.32 + (i % 2) * 0.3 + Math.random() * 0.06,
      r: 0.14 + Math.random() * 0.06, n: 40 + ri(0, 25), sp: (Math.random() - 0.5) * 0.02,
    }));
    const big = LABELS.map((nm, i) => {
      return { nm, ci: i % clusters.length, a: Math.random() * 7, d: 0.4 + Math.random() * 0.7, s: 2.2, ph: Math.random() * 7 };
    });
    const edges = [];
    for (let i = 0; i < big.length; i++)
      for (let j = i + 1; j < big.length; j++)
        if (Math.random() < 0.55) edges.push({ i, j, col: Math.random() < 0.6 ? '#ff7385' : '#e8e8e2', ph: Math.random() * 7 });
    function size() {
      const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      cv.width = r.width * d; cv.height = r.height * d; c.setTransform(d, 0, 0, d, 0, 0);
    }
    new ResizeObserver(size).observe(cv); size();
    function draw(ms) {
      const t = ms / 1000;
      const w = cv.width / (Math.min(devicePixelRatio || 1, 2)), h = cv.height / (Math.min(devicePixelRatio || 1, 2));
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
      c.clearRect(0, 0, w, h);
      // 外环
      c.strokeStyle = 'rgba(140,170,160,.1)'; c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, R * 1.04, 0, 7); c.stroke();
      // 聚簇微点云
      for (const cl of clusters) {
        const ox = cx + (cl.x - 0.5) * w * 1.1 + Math.sin(t * cl.sp * 8) * 4;
        const oy = cy + (cl.y - 0.5) * h * 1.1;
        for (let k = 0; k < cl.n; k++) {
          const a = (k * 2.399 + t * cl.sp) % 7;
          const d = Math.pow((k * 7919 % 100) / 100, 0.6) * cl.r * R;
          const x = ox + Math.cos(a) * d, y = oy + Math.sin(a * 1.3) * d * 0.9;
          const wallet = k % 5 === 0;
          c.fillStyle = wallet ? 'rgba(255,115,133,.8)' : 'rgba(230,235,230,.55)';
          c.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.5 + k));
          c.beginPath(); c.arc(x, y, wallet ? 1.3 : 0.8, 0, 7); c.fill();
        }
      }
      c.globalAlpha = 1;
      // 大节点位置
      const pos = big.map(B => {
        const cl = clusters[B.ci];
        const ox = cx + (cl.x - 0.5) * w * 1.1;
        const oy = cy + (cl.y - 0.5) * h * 1.1;
        return { x: ox + Math.cos(B.a + t * 0.05) * B.d * R * 0.5, y: oy + Math.sin(B.a + t * 0.05) * B.d * R * 0.4, B };
      });
      // 边
      for (const e of edges) {
        const p1 = pos[e.i], p2 = pos[e.j];
        c.strokeStyle = e.col; c.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(t * 0.7 + e.ph));
        c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
      }
      c.globalAlpha = 1;
      // 大节点 + 标签
      for (const p of pos) {
        const pl = 0.5 + 0.5 * Math.sin(t * 2 + p.B.ph);
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(p.x, p.y, 2 * (0.8 + 0.4 * pl), 0, 7); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.4)';
        c.beginPath(); c.arc(p.x, p.y, 4.5, 0, 7); c.stroke();
        c.fillStyle = 'rgba(200,205,198,.85)'; c.font = '7.5px Consolas';
        c.fillText(p.B.nm, p.x + 7, p.y + 2);
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  /* ============ BUY CURVE ============ */
  (function () {
    const cv = $('curveCv'), c = cv.getContext('2d');
    const AX = { l: 34, r: 14, t: 10, b: 18 };
    function size() {
      const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      cv.width = r.width * d; cv.height = r.height * d; c.setTransform(d, 0, 0, d, 0, 0);
    }
    new ResizeObserver(size).observe(cv); size();
    const fy = x => Math.pow(Math.E, x * 3.2) / Math.pow(Math.E, 3.2);
    function draw(ms) {
      const t = ms / 1000;
      const w = cv.width / (Math.min(devicePixelRatio || 1, 2)), h = cv.height / (Math.min(devicePixelRatio || 1, 2));
      const iw = w - AX.l - AX.r, ih = h - AX.t - AX.b;
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(140,170,160,.08)'; c.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = AX.t + ih * i / 4;
        c.beginPath(); c.moveTo(AX.l, y); c.lineTo(AX.l + iw, y); c.stroke();
      }
      c.fillStyle = 'rgba(110,118,110,.8)'; c.font = '8px Consolas';
      c.fillText('1.40K', 2, AX.t + 4); c.fillText('1.24K', 2, AX.t + ih / 2);
      c.fillText('1.08K', 2, AX.t + ih); c.fillText('LOW', AX.l, h - 5);
      c.fillText('ATH', AX.l + iw - 22, h - 5); c.fillText('RUG', AX.l + iw / 2 - 10, h - 5);
      c.beginPath();
      for (let i = 0; i <= 80; i++) {
        const x = i / 80, y = fy(x);
        const px = AX.l + x * iw, py = AX.t + (1 - y) * ih;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.strokeStyle = '#6be3ad'; c.lineWidth = 1.4; c.stroke();
      c.lineTo(AX.l + iw, AX.t + ih); c.lineTo(AX.l, AX.t + ih); c.closePath();
      const g = c.createLinearGradient(0, AX.t, 0, AX.t + ih);
      g.addColorStop(0, 'rgba(107,227,173,.22)'); g.addColorStop(1, 'rgba(107,227,173,0)');
      c.fillStyle = g; c.fill();
      const mk = (x, name, col) => {
        const px = AX.l + x * iw, py = AX.t + (1 - fy(x)) * ih;
        c.strokeStyle = col; c.setLineDash([2, 3]);
        c.beginPath(); c.moveTo(px, py); c.lineTo(px, AX.t + ih); c.stroke(); c.setLineDash([]);
        c.fillStyle = col; c.beginPath(); c.arc(px, py, 2.4, 0, 7); c.fill();
        c.font = '8px Consolas'; c.textAlign = 'center';
        c.fillText(name, px, AX.t + ih + 10); c.textAlign = 'left';
      };
      mk(0.16, 'ENTRY', '#acd6e8'); mk(0.52, 'TP', '#6be3ad'); mk(0.30, 'SL', '#ff7385');
      const gx = (t * 0.06) % 1;
      const gpx = AX.l + gx * iw, gpy = AX.t + (1 - fy(gx)) * ih;
      const gg = c.createRadialGradient(gpx, gpy, 0, gpx, gpy, 10);
      gg.addColorStop(0, 'rgba(255,240,200,.9)'); gg.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = gg; c.beginPath(); c.arc(gpx, gpy, 10, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(gpx, gpy, 2, 0, 7); c.fill();
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  /* ============ LAST ACTIONS（时间 + 类型徽章行） ============ */
  const actLog = $('actLog');
  const ACTS = [
    { b: 'SET', cls: 'b-set', t: () => `induced slot 371,644.851` },
    { b: 'IND', cls: 'b-ind', t: () => `skip · EV +8.4% after costs` },
    { b: 'EX', cls: 'b-ex', t: () => `Jito bundle [ landed · tip 0.00055 SOL` },
    { b: 'IND', cls: 'b-ind', t: () => `no answer by ${rnd(TOKENS)} · EV +2.7% · passes` },
    { b: 'SET', cls: 'b-set', t: () => `blocked [BUNDLED] · 40% of buyers share one funder` },
    { b: 'REC', cls: 'b-rec', t: () => `scored setup · EV +8.2% · passable` },
  ];
  function pushAct() {
    const it = rnd(ACTS);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="t">${nowT()}</span><span class="badge ${it.cls}">${it.b}</span><span>${it.t()}</span>`;
    actLog.prepend(row);
    while (actLog.children.length > 6) actLog.lastChild.remove();
  }
  for (let i = 0; i < 5; i++) pushAct();

  /* ============ DECISION STACK ============ */
  const stackList = $('stackList');
  const SUBS = {
    skip: () => `EV ${rnd(['+0.6%', '+1.2%', '-0.3%'])} AFTER COSTS · 10/14`,
    block: () => `${rnd(['BUNDLED', 'CREATOR', 'LP BURNED', 'SNIPED'])} · ${ri(40, 65)}% ${rnd(['buyers share one funder', 'wallets funded same block'])}`,
    fair: () => `EV ${rnd(['+0.6%', '+1.1%'])} AFTER COSTS · PASS`,
    trade: () => `PASSING TO EXECUTION`,
  };
  function pushStack() {
    const r = Math.random();
    const kind = r < 0.14 ? 'trade' : r < 0.34 ? 'block' : r < 0.62 ? 'fair' : 'skip';
    const tok = rnd(TOKENS);
    const conf = (0.2 + Math.random() * 0.68);
    const head = { skip: 'SKIP · OUT', block: 'BLOCK · GATE', fair: 'FAIR · OUT', trade: 'TRADE ENTRY' }[kind];
    const el = document.createElement('div');
    el.className = 'stk k-' + kind;
    const kk = { skip: 'SKIP · QNT', block: 'BLOCK · C4D', fair: 'SKIP · QNT', trade: 'TRADE · ENTRY' }[kind];
    const ub = (20 + Math.random() * 70).toFixed(0);
    el.innerHTML = `
      <div class="l1"><span class="kk">${kk}</span><span class="nm">${tok}</span><span class="conf">${conf.toFixed(2)}</span></div>
      <div class="l2"><span>${SUBS[kind]()}</span><span>6/8 VOTES</span></div>
      <div class="ubar"><i style="width:${ub}%"></i></div>
      <div class="bar"><i style="width:${(conf * 100).toFixed(0)}%"></i></div>`;
    stackList.prepend(el);
    stackList.querySelectorAll('.stk').forEach((s, i) => s.classList.toggle('top', i === 0));
    while (stackList.children.length > 10) stackList.lastChild.remove();
    if (kind === 'trade') entries++;
    if (kind === 'skip') skips++;
    if (kind === 'block') blocks++;
    $('stackHead').textContent = `ENTRY ${entries} · SKIP ${skips} · BLOCK ${blocks}`;
    $('lifeHead').textContent = `NUNS ${ri(55, 90)} · ENTRY ${entries} · BLOCK ${blocks} · SKIP ${skips}`;
    if (Math.random() < 0.5) pushAct(kind, tok);
  }
  pushStack();
  setInterval(pushStack, 2100);

  /* ============ SIX AGENTS（图标盒 + 角色缩写 + 黄线） ============ */
  const AGENTS = [
    { nm: 'SCOUT', role: 'SCT · K&P', sub: 'SIGNALS STREAMED', n: 44, col: '#6be3ad', icon: '<circle cx="12" cy="12" r="6" fill="none" stroke="COL" stroke-width="1.4"/><circle cx="12" cy="12" r="1.8" fill="COL"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="COL"/>' },
    { nm: 'CARTOGRAPHER', role: 'RAP', sub: 'NEW WALLETS / MIN', n: 1252, col: '#ff7385', icon: '<circle cx="12" cy="12" r="8" fill="none" stroke="COL"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" fill="none" stroke="COL"/>' },
    { nm: 'JUDGE', role: 'JDG', sub: 'SIGNAL STRENGTH', n: 36, col: '#acd6e8', icon: '<path d="M12 3v18M5 8l7-3 7 3" fill="none" stroke="COL" stroke-width="1.3"/><path d="M3 8h5l-2.5 6zM16 8h5l-2.5 6z" fill="none" stroke="COL"/>' },
    { nm: 'QUANT', role: 'QNT', sub: 'FRESH WALLETS', n: 94, col: '#e6cf98', icon: '<path d="M6 18V9M12 18V4M18 18v-6" stroke="COL" stroke-width="2.4"/>' },
    { nm: 'GUARD', role: 'GKD', sub: 'BUYERS ON ONE FUNDER', n: '73%', col: '#c3bcf2', icon: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" fill="none" stroke="COL" stroke-width="1.3"/><path d="M9.5 12l2 2 3.5-4" fill="none" stroke="COL"/>' },
    { nm: 'EXECUTOR', role: 'EXE', sub: 'CURVE POSITION', n: '1.7%', col: '#e4e4e0', icon: '<path d="M13 2L5 13h5l-1 9 8-11h-5z" fill="none" stroke="COL" stroke-width="1.3"/>' },
  ];
  const agentsRow = $('agentsRow');
  agentsRow.innerHTML = AGENTS.map((a, i) => `
    <div class="agent" data-i="${i}" style="border-top:2px solid ${a.col}">
      <div class="ic" style="color:${a.col}"><svg viewBox="0 0 24 24">${a.icon.replace(/COL/g, a.col)}</svg></div>
      <div class="role">${a.role}</div>
      <div class="nm">${a.nm}</div>
      <div class="n">${typeof a.n === 'number' ? a.n.toLocaleString('en-US') : a.n}</div>
      <div class="sub">${a.sub}</div>
      <div class="ul"></div>
    </div>`).join('');
  setInterval(() => {
    AGENTS.forEach((a, i) => {
      if (typeof a.n === 'number') {
        a.n += ri(0, 2);
        agentsRow.children[i].querySelector('.n').textContent = a.n.toLocaleString('en-US');
      }
    });
    const hot = ri(0, 5);
    agentsRow.querySelectorAll('.agent').forEach(el => el.classList.remove('hot'));
    agentsRow.children[hot].classList.add('hot');
    $('treeIn').textContent = (1310 + ri(0, 30)).toLocaleString('en-US');
    $('treeOut').textContent = ri(305, 320);
  }, 2600);


  /* ============ STATE BUILDER ============ */
  const IF = [
    { k: 'JOG', n: 'FOLLOWED WALLETS IN', g: 0 },
    { k: 'SET', n: 'NEW MINTERS / MIN', g: 1 },
    { k: 'RAP', n: 'REPLY GUYS / MIN', g: 0 },
    { k: 'MAP', n: 'BUYERS ON ONE FUNDER', g: 0 },
    { k: 'MAP', n: 'LAUNCH SLOT BUNDLE', g: 1 },
    { k: 'INT', n: 'SOCIAL SIGNALS', g: 0 },
  ];
  $('ifRows').innerHTML = IF.map(o => `
    <div class="if-row"><div class="r1"><span class="kk">${o.k}</span><span>${o.n}</span><b>0.44</b></div>
    <div class="rb${o.g ? ' g' : ''}"><i style="width:44%"></i></div></div>`).join('');
  setInterval(() => {
    document.querySelectorAll('#ifRows .if-row').forEach(row => {
      const v = 0.1 + Math.random() * 0.8;
      row.querySelector('b').textContent = v.toFixed(2);
      row.querySelector('.rb i').style.width = (v * 100) + '%';
    });
    const tp = 0.2 + Math.random() * 0.4, tm = 0.3 + Math.random() * 0.4, sl = 0.2 + Math.random() * 0.35;
    $('mTp').style.width = tp * 100 + '%'; $('mTpV').textContent = tp.toFixed(2);
    $('mTm').style.width = tm * 100 + '%'; $('mTmV').textContent = tm.toFixed(2);
    $('mSl').style.width = sl * 100 + '%'; $('mSlV').textContent = sl.toFixed(2);
    $('pTp').textContent = tp.toFixed(2);
    $('stateFt').firstElementChild.textContent = Math.random() < 0.5 ? 'GUARD PASS' : 'GUARD SCAN';
    $('stateMode').textContent = rnd(['LIQUID RUSHER', 'RESEARCH MODE', 'GATE HOLD']);
  }, 2400);

  /* ============ STATE SPACE 三角 ============ */
  (function () {
    const cv = $('triCv'), c = cv.getContext('2d');
    function size() {
      const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
      cv.width = r.width * d; cv.height = r.height * d; c.setTransform(d, 0, 0, d, 0, 0);
    }
    new ResizeObserver(size).observe(cv); size();
    function draw(ms) {
      const t = ms / 1000;
      const w = cv.width / (Math.min(devicePixelRatio || 1, 2)), h = cv.height / (Math.min(devicePixelRatio || 1, 2));
      c.clearRect(0, 0, w, h);
      const p = [[w / 2, 8], [8, h - 8], [w - 8, h - 8]];
      c.strokeStyle = 'rgba(140,170,160,.3)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(p[0][0], p[0][1]); c.lineTo(p[1][0], p[1][1]); c.lineTo(p[2][0], p[2][1]); c.closePath(); c.stroke();
      c.strokeStyle = 'rgba(140,170,160,.08)';
      for (let i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(p[0][0] + (p[1][0] - p[0][0]) * i / 4, p[0][1] + (p[1][1] - p[0][1]) * i / 4);
        c.lineTo(p[0][0] + (p[2][0] - p[0][0]) * i / 4, p[0][1] + (p[2][1] - p[0][1]) * i / 4);
        c.stroke();
      }
      c.fillStyle = 'rgba(110,118,110,.8)'; c.font = '8px Consolas'; c.textAlign = 'center';
      c.fillText('S', p[0][0], p[0][1] + 12); c.fillText('R', p[1][0] + 8, p[1][1] - 2); c.fillText('T', p[2][0] - 8, p[2][1] - 2);
      const a = 0.5 + 0.4 * Math.sin(t * 0.5), b = 0.5 + 0.4 * Math.cos(t * 0.37);
      const cc = Math.max(0, 1 - a - b);
      const x = p[0][0] * a + p[1][0] * b + p[2][0] * cc;
      const y = p[0][1] * a + p[1][1] * b + p[2][1] * cc;
      const g = c.createRadialGradient(x, y, 0, x, y, 12);
      g.addColorStop(0, 'rgba(255,240,200,.8)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 12, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill();
      c.textAlign = 'left';
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  /* ============ MEDUSA CARRY 回调 ============ */
  window.__onMedusaCarry = function (token, panel) {
    pushLife({ b: 'REC', cls: 'b-rec hl', t: () => `${token} read from ${panel.toUpperCase()} · carried to stack` });
  };

  /* ============ ORB 计数 ============ */
  let obs = 312, out = 309;
  setInterval(() => {
    obs += ri(0, 3); out += Math.random() < 0.8 ? ri(0, 2) : 0;
    $('orbObs').textContent = obs; $('orbOut').textContent = out;
    $('orbStates').textContent = (1318 + ri(0, 20)).toLocaleString('en-US') + ' STATES';
    $('orbCollapse').textContent = (300 + ri(0, 60)) + ' NEAR COLLAPSE';
  }, 1800);
})();
