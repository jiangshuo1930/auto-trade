/* ============================================================
   panels.js — 各面板动态
   跑马灯 / CORE MODEL / LIFE OF A DECISION / ENTANGLEMENT MAP
   / CURVE / DECISION STACK / SIX AGENTS / STATE BUILDER
   ============================================================ */
(function () {
  'use strict';
  const A = window.APP;
  const { $, rnd, ri, rf, num, nowT, clamp, lerp } = A;

  /* ============================================================
     1. 顶部跑马灯
     ============================================================ */
  (function () {
    const track = $('tkTrack');
    const kinds = ['curve', '1h', 'entry', 'labels', 'lord'];
    function item(kind) {
      const t = rnd(A.TOKENS);
      if (kind === 'curve') {
        return `<span><i class="gd">CURVE</i> <b>${t}</b> <i class="up">${ri(6, 92)}%</i></span>`;
      }
      if (kind === '1h') {
        const v = rf(-42, 68);
        return `<span><i class="dn">1H</i> <b>${t}</b> <i class="${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</i></span>`;
      }
      if (kind === 'entry') {
        return `<span><i>ENTRY</i> <b>${t}</b> <i>· net EV +${rf(3, 14).toFixed(1)}% · ${rf(0.05, 0.6).toFixed(2)} SOL</i></span>`;
      }
      if (kind === 'labels') {
        return `<span><i>LABELS</i> <b>${num(1300 + ri(0, 60))}</b> <i>· measured today</i></span>`;
      }
      return `<span><i>LORD</i> <b>${t}</b> <i class="up">${ri(4, 88)}%</i></span>`;
    }
    function build() {
      const arr = [];
      for (let i = 0; i < 18; i++) arr.push(item(kinds[i % kinds.length]));
      return arr.join('');
    }
    track.innerHTML = build() + build();
    let x = 0, last = performance.now(), half = 0;
    function measure() { half = track.scrollWidth / 2; }
    measure();
    setInterval(() => { track.innerHTML = build() + build(); measure(); }, 42000);
    (function loop(now) {
      const dt = Math.min(0.06, (now - last) / 1000); last = now;
      x -= 62 * dt;
      if (half && -x >= half) x += half;
      track.style.transform = 'translate3d(' + x + 'px,0,0)';
      requestAnimationFrame(loop);
    })(last);
  })();

  /* ============================================================
     2. CORE MODEL —— 大数字 / 波形 / 散点
     ============================================================ */
  let trainN = 1318;
  (function () {
    const el = $('trainNum');
    setInterval(() => {
      trainN += ri(1, 3);
      el.textContent = num(trainN);
      const lb = $('orbLabels'); if (lb) lb.textContent = num(trainN);
      $('cEvents').textContent = ri(38, 48);
      $('cVeto').textContent = ri(66, 79) + '%';
      if (Math.random() < 0.4) $('cOpen').textContent = ri(1, 4) + ' / 6';
      $('cInPlay').textContent = rf(1.0, 2.4).toFixed(1) + '%';
      $('cLimit').textContent = ri(11, 18) + '%';
    }, 1500);

    /* 波形 */
    const wv = $('waveCv');
    let s = A.fitCanvas(wv);
    window.addEventListener('resize', () => { s = A.fitCanvas(wv); });
    const N = 96, hist = new Array(N).fill(0.5);
    let ph = 0;
    (function draw(now) {
      ph += 0.045;
      hist.shift(); hist.push(0.5 + 0.32 * Math.sin(ph * 0.7) + 0.18 * Math.sin(ph * 2.3 + 1.1) + rf(-0.04, 0.04));
      const c = s.c, w = s.w, h = s.h;
      c.clearRect(0, 0, w, h);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(172,214,232,.55)');
      g.addColorStop(1, 'rgba(172,214,232,0)');
      c.beginPath();
      for (let i = 0; i < N; i++) {
        const x = i / (N - 1) * w, y = h * (1 - clamp(hist[i], 0.05, 0.95));
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = 'rgba(172,214,232,.85)'; c.lineWidth = 1.4; c.stroke();
      c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = g; c.fill();
      requestAnimationFrame(draw);
    })(0);

    /* 散点 */
    const sc = $('scatCv');
    let s2 = A.fitCanvas(sc);
    window.addEventListener('resize', () => { s2 = A.fitCanvas(sc); });
    const dots = Array.from({ length: 90 }, () => ({
      x: Math.random(), y: Math.random(), s: Math.random() < 0.2 ? 2.6 : 1.4,
      col: rnd(['#acd6e8', '#6be3ad', '#ff7385', '#e6cf98', '#c3bcf2']),
      ph: Math.random() * 7,
    }));
    (function draw(now) {
      const t = now / 1000, c = s2.c, w = s2.w, h = s2.h;
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        c.beginPath(); c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); c.stroke();
      }
      for (const d of dots) {
        const pl = 0.5 + 0.5 * Math.sin(t * 2 + d.ph);
        c.globalAlpha = 0.35 + 0.6 * pl; c.fillStyle = d.col;
        c.beginPath(); c.arc(d.x * w, d.y * h, d.s, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
      requestAnimationFrame(draw);
    })(0);
  })();

  /* ============================================================
     3. LIFE OF A DECISION —— 日志流
     ============================================================ */
  const LIFE = [
    { k: '[JDG]', c: 'c-cy', t: () => 'followed wallet · P(edge) ' + rf(.72, .96).toFixed(2) + ' · ' + ri(3, 9) + ' in this coin · bundle ' + ri(2, 6) + '% · snipers ' + ri(1, 4) + '%' },
    { k: '[ORB]', c: 'c-rd', t: () => 'state · TP ' + rf(.28, .54).toFixed(2) + ' (±' + rf(.2, .5).toFixed(2) + ') · stop ' + rf(.15, .3).toFixed(2) + ' · 60 min ' + rf(.18, .32).toFixed(2) + ' · amplitude ' + rf(.8, 1.6).toFixed(2) },
    { k: '[QNT]', c: 'c-gd', t: () => 'net EV +' + rf(4, 19).toFixed(1) + '% · size ' + rf(.1, .7).toFixed(2) + ' SOL · fill ' + rf(1, 5).toFixed(1) + 'M tokens · curve ' + ri(40, 70) + '% · fee 1.5%' },
    { k: '[GRD]', c: 'c-rd', t: () => 'PASS · 0 red flags · bundle ' + ri(2, 8) + '% · snipers ' + ri(1, 6) + '% · LP burned · mint revoked · creator clean' },
    { k: '[EXE]', c: 'c-gn', t: () => 'Jito bundle landed · slot +' + ri(2, 9) + ' · tip 0.000' + ri(3, 9) + ' SOL · ' + ri(9, 14) + '/14 bundles landed' },
    { k: '[/]', c: 'c-mt', t: () => 'trade entry · decision record written · pump.fun · curve ' + ri(40, 70) + '% · size ' + rf(.1, .6).toFixed(2) + ' SOL' },
    { k: '[REC]', c: 'c-gd', t: () => 'DECISION RECORD · TRADE ENTRY · pump.fun · curve ' + ri(40, 70) + '% · ' + num(1300 + ri(0, 40)) + ' labels', hl: 1 },
    { k: '[FST]', c: 'c-gd', t: () => 'fast-forward 60 minutes · outcome ' + rnd(['WIN', 'LOSS', 'TIME']) + ' · ' + (Math.random() < .6 ? '+' : '-') + rf(.1, 1.4).toFixed(2) + ' SOL · curve ' + ri(50, 90) + '%', hl: 1 },
    { k: '[MSR]', c: 'c-pu', t: () => 'SL · -30% first at ' + ri(12, 40) + ' min → training set · ' + ri(12, 60) + ' buyers · ' + ri(2, 9) + ' share one funder' },
    { k: '[TRC]', c: 'c-mt', t: () => 'orb trace RUN-00' + ri(80000, 89999) + ' · frac-buy · wallet W.' + ri(1000, 9999) + ' · ' + rf(.5, 3).toFixed(2) + ' SOL' },
    { k: '[TRG]', c: 'c-cy', t: () => 'followed wallet ' + rnd(A.TOKENS) + ' bought ' + rf(.5, 3).toFixed(2) + ' SOL · curve ' + ri(40, 80) + '% · ' + ri(10, 60) + ' buyers' },
    { k: '[DEC]', c: 'c-pu', t: () => ri(12, 60) + ' buyers · ' + ri(2, 9) + ' share one funder · bundle ' + ri(2, 8) + '% · snipers ' + ri(1, 5) + '% · LP 100% burned' },
    { k: '[OUT]', c: 'c-gn', t: () => 'outcome: ' + rnd(['WIN', 'LOSS', 'TIME']) + ' · ' + (Math.random() < .55 ? '+' : '-') + rf(.1, 1.4).toFixed(2) + ' SOL · curve ' + ri(40, 80) + '% · held ' + ri(8, 55) + ' min' },
    { k: '[SET]', c: 'c-gd', t: () => 'set forward 60 minutes · teaching sample · amplitude × model score · 1DG 1.3B candles' },
    { k: '[SOL]', c: 'c-cy', t: () => 'sold ' + rf(.1, .8).toFixed(2) + ' SOL (±' + rf(.02, .2).toFixed(2) + ') · ' + rf(1, 4).toFixed(2) + 'M tokens · slippage 0.4% · fee 0.0011 SOL' },
  ];
  (function () {
    const log = $('lifeLog');
    let runs = 49, entry = 10, block = 4, skip = 27;
    function head() {
      $('lifeHead').textContent = 'RUNS ' + runs + ' · ENTRY ' + entry + ' · BLOCK ' + block + ' · SKIP ' + skip;
    }
    function push(it) {
      it = it || rnd(LIFE);
      const row = document.createElement('div');
      row.className = 'row' + (it.hl ? ' hl' : '');
      row.innerHTML = '<span class="dot">·</span><span class="k ' + it.c + '">' + it.k + '</span><span class="tx">' + it.t() + '</span>';
      log.prepend(row);
      while (log.children.length > 11) log.lastChild.remove();
      runs++;
      if (it.k === '[REC]') entry++;
      if (it.k === '[GRD]') block++;
      if (it.k === '[JDG]') skip++;
      head();
    }
    for (let i = 0; i < 11; i++) push();
    head();
    setInterval(push, 1050);
    window.__lifePush = push;
  })();

  /* ============================================================
     4. ENTANGLEMENT MAP —— 雷达圈 + 聚簇 + 粉色纠缠线
     ============================================================ */
  (function () {
    const cv = $('entCv');
    let s = A.fitCanvas(cv);
    window.addEventListener('resize', () => { s = A.fitCanvas(cv); });
    const LABELS = ['$TURJET', '$PELOSA-B7', '$SLIK', '$TONDOG', '$STONDOG', '$MENOL',
      '$ZAPMAX', '$RIZRAT', '$FLUPUP', '$DONBIT', '$SHOPOWL', '$HOGOWL'];
    const clusters = Array.from({ length: 4 }, (_, i) => ({
      a: i / 4 * Math.PI * 2 + 0.4, d: 0.42 + (i % 2) * 0.2, r: 0.20 + (i % 2) * 0.08,
      n: 110 + ri(0, 70), sp: rf(-.05, .05),
    }));
    const nodes = LABELS.map((nm, i) => ({
      nm, ci: i % clusters.length, a: Math.random() * 7, d: .45 + Math.random() * .55,
      ph: Math.random() * 7, big: i < 2,
    }));
    const edges = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++)
        if (Math.random() < .78) edges.push({ i, j, c: Math.random() < .68 ? '#ff7385' : '#c3bcf2', ph: Math.random() * 7 });
    (function draw(now) {
      const t = now / 1000, c = s.c, w = s.w, h = s.h;
      const cx = w * .5, cy = h * .46, R = Math.min(w, h) * .46;
      c.clearRect(0, 0, w, h);

      /* 雷达圈 */
      for (let i = 1; i <= 4; i++) {
        c.strokeStyle = 'rgba(172,214,232,' + (i === 4 ? .20 : .10) + ')';
        c.lineWidth = i === 4 ? 1.4 : 1;
        c.beginPath(); c.arc(cx, cy, R * i / 4, 0, 7); c.stroke();
      }
      /* 刻度 */
      c.strokeStyle = 'rgba(172,214,232,.16)';
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2;
        const r1 = R * .96, r2 = R;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        c.stroke();
      }
      /* 扫描扇形 */
      const sw = (t * .55) % (Math.PI * 2);
      const gg = c.createRadialGradient(cx, cy, 0, cx, cy, R);
      gg.addColorStop(0, 'rgba(172,214,232,.10)');
      gg.addColorStop(1, 'rgba(172,214,232,0)');
      c.fillStyle = gg;
      c.beginPath(); c.moveTo(cx, cy);
      c.arc(cx, cy, R, sw - .5, sw); c.closePath(); c.fill();

      /* 聚簇微点 */
      const pos = nodes.map(n => {
        const cl = clusters[n.ci];
        const ox = cx + Math.cos(cl.a + t * cl.sp) * R * cl.d;
        const oy = cy + Math.sin(cl.a + t * cl.sp) * R * cl.d;
        return { x: ox + Math.cos(n.a + t * .12) * R * .28, y: oy + Math.sin(n.a + t * .12) * R * .22 };
      });
      for (let ci = 0; ci < clusters.length; ci++) {
        const cl = clusters[ci];
        const ox = cx + Math.cos(cl.a + t * cl.sp) * R * cl.d;
        const oy = cy + Math.sin(cl.a + t * cl.sp) * R * cl.d;
        for (let k = 0; k < cl.n; k++) {
          const a = (k * 2.399 + t * cl.sp * 6) % 7;
          const rr = Math.pow((k * 7919 % 100) / 100, .62) * cl.r * R;
          const x = ox + Math.cos(a) * rr, y = oy + Math.sin(a * 1.3) * rr * .92;
          const isW = k % 5 === 0;
          c.fillStyle = isW ? 'rgba(255,130,146,.95)' : 'rgba(236,242,236,.85)';
          c.globalAlpha = .45 + .5 * Math.abs(Math.sin(t * 1.6 + k));
          c.beginPath(); c.arc(x, y, isW ? 2.0 : 1.35, 0, 7); c.fill();
        }
      }
      c.globalAlpha = 1;

      /* 纠缠线 */
      for (const e of edges) {
        const p1 = pos[e.i], p2 = pos[e.j];
        c.strokeStyle = e.c;
        c.globalAlpha = .42 + .40 * Math.abs(Math.sin(t * .8 + e.ph));
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
        /* 流动光点 */
        const f = (t * .35 + e.ph) % 1;
        c.globalAlpha = .8;
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(lerp(p1.x, p2.x, f), lerp(p1.y, p2.y, f), 1.2, 0, 7); c.fill();
      }
      c.globalAlpha = 1;

      /* 节点 + 标签 */
      c.font = '11.5px Consolas';
      nodes.forEach((n, i) => {
        const p = pos[i];
        const pl = .5 + .5 * Math.sin(t * 2 + n.ph);
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(p.x, p.y, (n.big ? 2.8 : 2) * (.85 + .35 * pl), 0, 7); c.fill();
        c.strokeStyle = n.big ? 'rgba(255,115,133,.75)' : 'rgba(255,255,255,.4)';
        c.beginPath(); c.arc(p.x, p.y, n.big ? 7 : 4.5, 0, 7); c.stroke();
        c.fillStyle = 'rgba(206,214,206,.9)';
        c.fillText(n.nm, p.x + 9, p.y + 3);
      });
      requestAnimationFrame(draw);
    })(0);
  })();

  /* ============================================================
     5. WHERE A BUY LANDS ON THE CURVE
     ============================================================ */
  (function () {
    const cv = $('curveCv');
    let s = A.fitCanvas(cv);
    window.addEventListener('resize', () => { s = A.fitCanvas(cv); });
    const AX = { l: 52, r: 18, t: 14, b: 26 };
    const fy = x => Math.pow(Math.E, x * 3.0) / Math.pow(Math.E, 3.0);
    (function draw(now) {
      const t = now / 1000, c = s.c, w = s.w, h = s.h;
      const iw = w - AX.l - AX.r, ih = h - AX.t - AX.b;
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(150,175,165,.06)'; c.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = AX.t + ih * i / 4;
        c.beginPath(); c.moveTo(AX.l, y); c.lineTo(AX.l + iw, y); c.stroke();
      }
      c.fillStyle = 'rgba(96,106,96,.75)'; c.font = '10.5px Consolas';
      c.fillText('160K', 4, AX.t + 4);
      c.fillText('140K', 4, AX.t + ih / 2 + 4);
      c.fillText('120K', 4, AX.t + ih + 4);
      c.fillText('LAUNCH → CURVE', AX.l, h - 6);

      /* 面积 + 曲线 */
      c.beginPath();
      for (let i = 0; i <= 120; i++) {
        const x = i / 120, y = fy(x);
        const px = AX.l + x * iw, py = AX.t + (1 - y) * ih;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.strokeStyle = 'rgba(95,207,158,.85)'; c.lineWidth = 1.3;
      c.shadowColor = 'rgba(107,227,173,.30)'; c.shadowBlur = 4;
      c.stroke();
      c.shadowBlur = 0;
      c.lineTo(AX.l + iw, AX.t + ih); c.lineTo(AX.l, AX.t + ih); c.closePath();
      const g = c.createLinearGradient(0, AX.t, 0, AX.t + ih);
      g.addColorStop(0, 'rgba(107,227,173,.14)'); g.addColorStop(1, 'rgba(107,227,173,0)');
      c.fillStyle = g; c.fill();

      /* 入场标记 */
      const ex = .16, epx = AX.l + ex * iw, epy = AX.t + (1 - fy(ex)) * ih;
      c.strokeStyle = 'rgba(195,188,242,.45)'; c.setLineDash([3, 4]);
      c.beginPath(); c.moveTo(epx, epy); c.lineTo(epx, AX.t + ih); c.stroke();
      c.beginPath(); c.moveTo(epx, epy); c.lineTo(AX.l, epy); c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#fff'; c.shadowColor = '#c3bcf2'; c.shadowBlur = 12;
      c.beginPath(); c.arc(epx, epy, 4, 0, 7); c.fill(); c.shadowBlur = 0;
      c.fillStyle = 'rgba(195,188,242,.95)'; c.font = '11px Consolas';
      c.fillText('ENTRY', epx + 8, epy - 8);

      /* 沿曲线的流动光点 */
      const fx = (t * .11) % 1, fpx = AX.l + fx * iw, fpy = AX.t + (1 - fy(fx)) * ih;
      const rg = c.createRadialGradient(fpx, fpy, 0, fpx, fpy, 16);
      rg.addColorStop(0, 'rgba(210,255,235,.95)'); rg.addColorStop(1, 'rgba(210,255,235,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(fpx, fpy, 16, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(fpx, fpy, 2.4, 0, 7); c.fill();
      requestAnimationFrame(draw);
    })(0);

    /* 右侧数据表 */
    const tbl = $('curveTbl');
    function render() {
      const mc = rf(4.2, 6.4).toFixed(1);
      $('curveMc').textContent = 'MARKET CAP $' + mc + 'K';
      $('curvePct').textContent = ri(8, 22) + '%';
      const rows = [
        ['hd', 'MARKET CAP', 'LATE', '$' + mc + 'K'],
        ['', 'AT 5 SOL', '32.5K', '-' + rf(5, 9).toFixed(1) + '%'],
        ['now', 'NOW 3 SOL', '24.1K', '-' + rf(17, 22).toFixed(1) + '%'],
        ['', 'AT 40 SOL', '5.1M', '-' + rf(11, 15).toFixed(1) + '%'],
        ['gd', 'QUANT WAITS · ENTRY 44 SOL IN', '', ''],
        ['', '33 SOL TO GO · 1.1X SOL SIZE', '', ''],
        ['dim', 'TP +60% · STOP -15% · FEE 1.5%', '', ''],
      ];
      tbl.innerHTML = rows.map(r =>
        `<div class="tr ${r[0]}"><span>${r[1]}</span><span>${r[2]}</span><b>${r[3]}</b></div>`).join('');
    }
    render();
    setInterval(render, 2600);
  })();

  /* ============================================================
     6. DECISION STACK
     ============================================================ */
  (function () {
    const list = $('stackList');
    let entry = 3, skip = 42, block = 9;
    const SUBS = {
      skip: () => 'EV BELOW +' + ri(2, 4) + '% AFTER COSTS',
      block: () => rnd(['BUNDLED · 45% BUYERS ONE FUNDER', 'CREATOR · 3 RUGS', 'LP NOT BURNED', 'SNIPED IN SLOT 0']),
      fair: () => 'EV +' + rf(.5, 1.6).toFixed(1) + '% AFTER COSTS · PASS',
      trade: () => 'PASSED QUANT · VALID TO EXECUTE',
    };
    const KK = { skip: 'SKIP · OUT', block: 'BLOCK · GATE', fair: 'FAIR · OUT', trade: 'TRADE ENTRY' };
    function push() {
      const r = Math.random();
      const kind = r < .13 ? 'trade' : r < .34 ? 'block' : r < .60 ? 'fair' : 'skip';
      const el = document.createElement('div');
      el.className = 'stk k-' + kind;
      const conf = kind === 'trade' ? rf(.7, .92) : rf(.2, .68);
      el.innerHTML =
        '<div class="l1"><span class="kk">' + KK[kind] + '</span>' +
        '<span class="nm">' + rnd(A.TOKENS) + '</span>' +
        '<span class="conf">' + conf.toFixed(2) + '</span></div>' +
        '<div class="l2"><span>' + SUBS[kind]() + '</span><span>' + ri(4, 8) + '/8 VOTES</span></div>' +
        '<div class="bar"><i style="width:' + (conf * 100).toFixed(0) + '%"></i></div>';
      list.prepend(el);
      while (list.children.length > 11) list.lastChild.remove();
      if (kind === 'trade') entry++;
      if (kind === 'skip') skip++;
      if (kind === 'block') block++;
      $('stackHead').textContent = 'ENTRY ' + entry + ' · SKIP ' + skip + ' · BLOCK ' + block;
      if (kind === 'trade' && window.__lifePush) {
        window.__lifePush({ k: '[REC]', c: 'c-gd', hl: 1, t: () => 'TRADE ENTRY · decision record written · pump.fun' });
      }
    }
    for (let i = 0; i < 8; i++) push();
    setInterval(push, 1900);
  })();

  /* ============================================================
     7. SIX AGENTS
     ============================================================ */
  (function () {
    const ICON = {
      scout: '<circle cx="12" cy="12" r="5.2" fill="none" stroke="COL" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="COL"/><path d="M12 1.6v3.2M12 19.2v3.2M1.6 12h3.2M19.2 12h3.2" stroke="COL" stroke-width="1.4"/>',
      carto: '<circle cx="12" cy="12" r="8.2" fill="none" stroke="COL" stroke-width="1.4"/><path d="M3.8 12h16.4M12 3.8c3.4 3.4 3.4 13 0 16.4M12 3.8c-3.4 3.4-3.4 13 0 16.4" fill="none" stroke="COL" stroke-width="1.1"/>',
      judge: '<path d="M12 2.4v19" stroke="COL" stroke-width="1.6"/><path d="M4.6 6.6h14.8" stroke="COL" stroke-width="1.4"/><path d="M2 6.6h5.2l-2.6 6.4zM16.8 6.6H22l-2.6 6.4z" fill="COL" opacity=".9"/>',
      quant: '<path d="M5 19V9M12 19V4M19 19v-6" stroke="COL" stroke-width="3" stroke-linecap="round"/>',
      guard: '<path d="M12 2.2l7.6 3.2v6.2c0 4.4-3.2 7.6-7.6 9.6-4.4-2-7.6-5.2-7.6-9.6V5.4z" fill="COL" opacity=".22"/><path d="M12 2.2l7.6 3.2v6.2c0 4.4-3.2 7.6-7.6 9.6-4.4-2-7.6-5.2-7.6-9.6V5.4z" fill="none" stroke="COL" stroke-width="1.4"/><path d="M9 12.2l2.2 2.2 4-4.4" fill="none" stroke="COL" stroke-width="1.6"/>',
      exec: '<path d="M13.4 1.8L4.6 13.6h5.6L8.4 22.2 19.4 10h-5.8z" fill="COL" opacity=".92"/>',
    };
    const AGENTS = [
      { nm: 'SCOUT', role: 'SCT · K&P', sub: 'SIGNALS STREAMED', sub2: '4 / 6 OPEN · 12 FEEDS', n: 44, col: '#6be3ad', ic: 'scout' },
      { nm: 'CARTOGRAPHER', role: 'MAP', sub: 'NEW WALLETS / MIN', sub2: '133 WALLETS · 12 LAUNCH', n: 1241, col: '#ff7385', ic: 'carto' },
      { nm: 'JUDGE', role: 'JDG', sub: 'SIGNAL STRENGTH', sub2: '0.92 P(EDGE) · 4 IN COIN', n: 32, col: '#acd6e8', ic: 'judge' },
      { nm: 'QUANT', role: 'QNT', sub: 'FRESH WALLETS', sub2: 'NET EV +8.3% · 0.12 SOL', n: 87, col: '#e6cf98', ic: 'quant' },
      { nm: 'GUARD', role: 'GRD', sub: 'BLOCK RATE', sub2: '0 RED FLAGS · BUNDLE 4%', n: '72%', col: '#c3bcf2', ic: 'guard' },
      { nm: 'EXECUTOR', role: 'EXE', sub: '18 FLOP · LIMIT 15%', sub2: 'JITO · 14/14 LANDED', n: '2.9%', col: '#e4e4e0', ic: 'exec' },
    ];
    const row = $('agentsRow');
    row.innerHTML = AGENTS.map((a, i) =>
      '<div class="agent" data-i="' + i + '" style="border-top:2px solid ' + a.col + '">' +
      '<div class="ic" style="color:' + a.col + '"><svg viewBox="0 0 24 24">' + ICON[a.ic].replace(/COL/g, a.col) + '</svg></div>' +
      '<div class="role">' + a.role + '</div>' +
      '<div class="nm">' + a.nm + '</div>' +
      '<div class="n">' + (typeof a.n === 'number' ? num(a.n) : a.n) + '</div>' +
      '<div class="sub">' + a.sub + '</div>' +
      '<div class="sub2">' + a.sub2 + '</div><div class="ul"></div></div>').join('');

    setInterval(() => {
      AGENTS.forEach((a, i) => {
        if (typeof a.n === 'number') {
          a.n += ri(0, 2);
          row.children[i].querySelector('.n').textContent = num(a.n);
        }
      });
      const hot = ri(0, 5);
      Array.from(row.children).forEach(el => el.classList.remove('hot'));
      row.children[hot].classList.add('hot');
      $('treeIn').textContent = num(trainN);
      $('treeOut').textContent = ri(300, 322);
      $('bookTag').textContent = 'MODEL BOOK · ' + ri(1, 4) + ' / 6 OPEN';
    }, 2400);

    /* 主干流光线 */
    const tc = $('treeCv');
    let ts = A.fitCanvas(tc);
    window.addEventListener('resize', () => { ts = A.fitCanvas(tc); });
    (function draw(now) {
      const t = now / 1000, c = ts.c, w = ts.w, h = ts.h;
      c.clearRect(0, 0, w, h);
      const y = h / 2;
      c.strokeStyle = 'rgba(172,214,232,.30)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      for (let i = 0; i < 6; i++) {
        const x = ((t * 70 + i * w / 6) % w);
        const g = c.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, 'rgba(172,214,232,.9)'); g.addColorStop(1, 'rgba(172,214,232,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill();
      }
      requestAnimationFrame(draw);
    })(0);

    /* LAST ACTIONS */
    const actLog = $('actLog');
    const ACTS = [
      { b: 'SCT', c: 'b-sct', t: () => 'labeled slot 371,644.85 · TP +60% first' },
      { b: 'EXE', c: 'b-exe', t: () => 'jito bundle landed · tip 0.0005 SOL' },
      { b: 'JDG', c: 'b-jdg', t: () => 'skip · EV +0.3% after costs' },
      { b: 'QNT', c: 'b-qnt', t: () => 'followed buy · 0.63 SOL' },
      { b: 'QNT', c: 'b-qnt', t: () => 'scored a setup · EV +8.2% · passes' },
      { b: 'GRD', c: 'b-grd', t: () => 'blocked · 45% of buyers share one funder' },
      { b: 'MAP', c: 'b-sct', t: () => 'bundle on ' + rnd(A.TOKENS) + ': ' + ri(8, 22) + ' wallets in slot 0' },
    ];
    function pushAct() {
      const it = rnd(ACTS);
      const d = document.createElement('div');
      d.className = 'row';
      d.innerHTML = '<span class="t">' + nowT() + '</span><span class="badge ' + it.c + '">' + it.b + '</span><span>' + it.t() + '</span>';
      actLog.prepend(d);
      while (actLog.children.length > 12) actLog.lastChild.remove();
    }
    for (let i = 0; i < 12; i++) pushAct();
    setInterval(pushAct, 1500);
  })();

  /* ============================================================
     8. STATE BUILDER
     ============================================================ */
  (function () {
    const IF = [
      { k: 'JDG', n: 'FOLLOWED WALLETS IN', g: 0 },
      { k: 'SCT', n: 'NEW BUYERS / MIN', g: 0 },
      { k: 'SCT', n: 'BUYS ÷ SELLS', g: 0 },
      { k: 'MAP', n: 'FRESH WALLETS', g: 1 },
      { k: 'MAP', n: 'BUYERS ON ONE FUNDER', g: 1 },
      { k: 'MAP', n: 'LAUNCH-SLOT BUNDLE', g: 1 },
      { k: 'SCT', n: 'CURVE POSITION', g: 0 },
      { k: 'JDG', n: 'CREATOR REPUTATION', g: 0 },
      { k: 'SCT', n: 'SOCIAL VELOCITY', g: 0 },
    ];
    const box = $('ifRows');
    box.innerHTML = IF.map(o =>
      '<div class="if-row"><div class="r1"><span class="kk">' + o.k + '</span>' +
      '<span class="lb">' + o.n + '</span><b>0.00</b></div>' +
      '<div class="rb' + (o.g ? ' g' : '') + '"><i style="width:0%"></i></div></div>').join('');

    function tick() {
      Array.from(box.children).forEach(r => {
        const v = rf(.05, .95);
        r.querySelector('b').textContent = (Math.random() < .5 ? '-' : '+') + v.toFixed(2);
        r.querySelector('.rb i').style.width = (v * 100) + '%';
      });
      const tp = rf(.18, .42), tm = rf(.24, .46), sl = rf(.28, .5);
      const sum = tp + tm + sl;
      const T = tp / sum, M = tm / sum, S = sl / sum;
      $('mTp').style.width = (T * 100) + '%'; $('mTpV').textContent = T.toFixed(2);
      $('mTm').style.width = (M * 100) + '%'; $('mTmV').textContent = M.toFixed(2);
      $('mSl').style.width = (S * 100) + '%'; $('mSlV').textContent = S.toFixed(2);
      $('pTp').textContent = T.toFixed(2);
      $('ioPlus').textContent = '+' + rf(.05, .4).toFixed(2) + ' REINFORCE';
      $('ioMinus').textContent = '-' + rf(.05, .5).toFixed(2) + ' CANCEL';
      $('guardTag').textContent = rnd(['GUARD SCAN', 'GUARD PASS', 'GUARD HOLD']);
      $('guardBody').textContent = 'EDGE ' + (Math.random() < .5 ? '-' : '+') + rf(0, 14).toFixed(1) +
        '% · COSTS 3.0% · NET EV ' + (Math.random() < .6 ? '+' : '-') + rf(1, 14).toFixed(1) + '%';
      $('stateMode').textContent = rnd(['LIQUID RUSHER', 'RESEARCH MODE', 'GATE HOLD']);
      window.__pState = { T: T, M: M, S: S };
    }
    tick();
    setInterval(tick, 2300);

    /* 三角状态空间 */
    const cv = $('triCv');
    let s = A.fitCanvas(cv);
    window.addEventListener('resize', () => { s = A.fitCanvas(cv); });
    let cx = .33, cy = .33, cz = .34;
    let tx = .33, ty = .33, tz = .34;
    (function draw(now) {
      const t = now / 1000, c = s.c, w = s.w, h = s.h;
      if (window.__pState && Math.random() < .02) {
        tx = window.__pState.T; ty = window.__pState.M; tz = window.__pState.S;
      }
      cx = lerp(cx, tx, .06); cy = lerp(cy, ty, .06); cz = lerp(cz, tz, .06);
      const sum = cx + cy + cz; cx /= sum; cy /= sum; cz /= sum;

      c.clearRect(0, 0, w, h);
      const pad = 14;
      const P = [[w / 2, pad], [pad, h - pad], [w - pad, h - pad]];
      /* 网格 */
      c.strokeStyle = 'rgba(195,188,242,.14)'; c.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const k = i / 5;
        c.beginPath();
        c.moveTo(lerp(P[0][0], P[1][0], k), lerp(P[0][1], P[1][1], k));
        c.lineTo(lerp(P[0][0], P[2][0], k), lerp(P[0][1], P[2][1], k));
        c.stroke();
        c.beginPath();
        c.moveTo(lerp(P[1][0], P[0][0], k), lerp(P[1][1], P[0][1], k));
        c.lineTo(lerp(P[1][0], P[2][0], k), lerp(P[1][1], P[2][1], k));
        c.stroke();
        c.beginPath();
        c.moveTo(lerp(P[2][0], P[0][0], k), lerp(P[2][1], P[0][1], k));
        c.lineTo(lerp(P[2][0], P[1][0], k), lerp(P[2][1], P[1][1], k));
        c.stroke();
      }
      /* 三角边 */
      c.strokeStyle = 'rgba(255,115,133,.75)'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(P[0][0], P[0][1]); c.lineTo(P[1][0], P[1][1]);
      c.lineTo(P[2][0], P[2][1]); c.closePath(); c.stroke();

      /* 状态点 */
      const x = P[0][0] * cx + P[1][0] * cy + P[2][0] * cz;
      const y = P[0][1] * cx + P[1][1] * cy + P[2][1] * cz;
      const g = c.createRadialGradient(x, y, 0, x, y, 26);
      g.addColorStop(0, 'rgba(255,245,215,.85)'); g.addColorStop(.4, 'rgba(195,188,242,.30)');
      g.addColorStop(1, 'rgba(195,188,242,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 26, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill();

      c.font = '11px Consolas'; c.fillStyle = 'rgba(123,132,123,.9)';
      c.textAlign = 'center';
      c.fillText('TP', P[0][0], P[0][1] - 2);
      c.textAlign = 'left'; c.fillText('SL', P[1][0] - 4, P[1][1] + 12);
      c.textAlign = 'right'; c.fillText('TIME', P[2][0] + 4, P[2][1] + 12);
      c.textAlign = 'left';
      requestAnimationFrame(draw);
    })(0);
  })();
})();


