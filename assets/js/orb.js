/* ============================================================
   orb.js — THE ORB
   左：7 条 OBSERVABLES 折线（数值 / 标签 / 实时游走）
   右：金色粒子球 + 环绕轨道环（视频中的核心视觉）
   ============================================================ */
(function () {
  'use strict';
  const A = window.APP;
  const { $, rf, ri, clamp } = A;

  const OBS = [
    { nm: 'LAUNCH RATE',     sub: 'NEW TIPPING / MIN',          v: () => rf(9, 19).toFixed(1) + '/h', col: '#6be3ad', tag: 'SCT', big: true },
    { nm: 'CURVE INFLOW',    sub: 'SOL INTO CURVE / MIN',       v: () => ri(120, 240) + ' SOL',       col: '#e6cf98', tag: 'SOC' },
    { nm: 'FOLLOWED FLOW',   sub: 'FOLLOWED SLOT / H',          v: () => ri(0, 14) + '',              col: '#acd6e8', tag: 'SOC' },
    { nm: 'BUNDLED SHARE',   sub: 'BUNDLE IN THE LAUNCH SLOT',  v: () => rf(8, 48).toFixed(1) + '%',  col: '#ff7385', tag: 'MAP' },
    { nm: 'CREATOR RISK',    sub: 'FROM LETHAL CREATORS',       v: () => ri(22, 52) + '%',            col: '#e6cf98', tag: 'MAP' },
    { nm: 'GRADUATION RATE', sub: 'CURVES COMPLETED / H',       v: () => rf(0.01, 0.9).toFixed(2) + '%', col: '#c3bcf2', tag: 'SCT' },
    { nm: 'MARKET PHASE',    sub: 'ADPT OPEN / TOT',            v: () => rf(6, 14).toFixed(1) + '%',  col: '#ace0cf', tag: 'SCT' },
  ];

  const cv = $('orbCv');
  let S = A.fitCanvas(cv);
  window.addEventListener('resize', () => { S = A.fitCanvas(cv); });

  /* 每个 observable 的游走序列 */
  const SER = OBS.map(() => {
    const n = 46, arr = [];
    let v = 0.5;
    for (let k = 0; k < n; k++) { v = clamp(v + rf(-.16, .16), .08, .92); arr.push(v); }
    return arr;
  });
  const VALS = OBS.map(o => o.v());
  setInterval(() => {
    OBS.forEach((o, i) => {
      SER[i].shift();
      SER[i].push(clamp(SER[i][SER[i].length - 1] + rf(-.16, .16), .08, .92));
      if (Math.random() < .5) VALS[i] = o.v();
    });
    const st = $('orbStates'), co = $('orbCollapse');
    if (st) st.textContent = (1400 + ri(0, 40)).toLocaleString('en-US') + ' STATES';
    if (co) co.textContent = (280 + ri(0, 60)) + ' NEAR COLLAPSE';
  }, 1200);

  /* ---- 金色粒子球 ---- */
  const P = [];
  const NP = 6200;
  for (let i = 0; i < NP; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const x = r * Math.cos(th), y = u * 0.58, z = r * Math.sin(th);
    const rad = 0.78 + Math.random() * 0.24;
    P.push({
      x: x * rad, y: y * rad, z: z * rad,
      s: Math.random() < .08 ? 3.2 : (Math.random() < .38 ? 1.9 : 1.25),
      g: Math.random() < .16 ? 1 : 0,
      ph: Math.random() * 7,
    });
  }
  /* 轨道环（环上串珠） */
  const RINGS = [
    { tilt: 0.28, spin: 0.32, r: 1.02, n: 90 },
    { tilt: -0.42, spin: -0.24, r: 1.16, n: 70 },
    { tilt: 0.72, spin: 0.18, r: 0.86, n: 60 },
    { tilt: 0.05, spin: -0.36, r: 1.30, n: 50 },
  ];

  (function draw(now) {
    const t = now / 1000, c = S.c, w = S.w, h = S.h;
    c.clearRect(0, 0, w, h);

    /* ---------- 左列 ---------- */
    const LX = 16, RW = Math.min(430, w * 0.34);
    const top = 14, rowH = (h - top - 16) / OBS.length;
    OBS.forEach((o, i) => {
      const y = top + rowH * i;
      c.font = '17px Consolas';
      c.fillStyle = '#eef2ec';
      c.fillText(o.nm, LX, y + 18);
      c.font = '12px Consolas';
      c.fillStyle = 'rgba(108,118,110,1)';
      c.fillText(o.sub, LX, y + 35);
      c.font = (o.big ? '27px' : '24px') + ' Consolas';
      c.fillStyle = o.col;
      c.shadowColor = o.col; c.shadowBlur = 14;
      c.fillText(VALS[i], LX + 14, y + rowH - 12);
      c.shadowBlur = 0;
      const tag = o.tag;
      c.font = '12px Consolas';
      const tw = c.measureText(tag).width + 14;
      c.strokeStyle = 'rgba(150,175,165,.45)';
      c.strokeRect(LX + 152, y + rowH - 28, tw, 19);
      c.fillStyle = 'rgba(150,160,150,1)';
      c.fillText(tag, LX + 159, y + rowH - 13);

      const sx = LX + 210, sw = RW - 210;
      const arr = SER[i], n = arr.length;
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const px = sx + k / (n - 1) * sw;
        const py = y + 8 + (1 - arr[k]) * (rowH - 20);
        k ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.strokeStyle = o.col; c.lineWidth = 1.3;
      c.globalAlpha = .9; c.stroke(); c.globalAlpha = 1;
      const ex = sx + sw, ey = y + 8 + (1 - arr[n - 1]) * (rowH - 20);
      c.fillStyle = o.col;
      c.beginPath(); c.arc(ex, ey, 2, 0, 7); c.fill();
      c.strokeStyle = o.col; c.globalAlpha = .18; c.lineWidth = 1;
      c.beginPath(); c.moveTo(ex, ey);
      c.bezierCurveTo(ex + 90, ey, ex + 200, y + 60, ex + 330, y + 110);
      c.stroke(); c.globalAlpha = 1;
    });

    c.strokeStyle = 'rgba(150,175,165,.14)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(RW + 24, 0); c.lineTo(RW + 24, h); c.stroke();

    /* ---------- 金色粒子球 ---------- */
    const ox = RW + 24 + (w - RW - 24) * 0.50;
    const oy = h * 0.47;
    const R = Math.min((w - RW - 40) * 0.56, h * 0.50);

    const halo = c.createRadialGradient(ox, oy, R * .1, ox, oy, R * 1.5);
    halo.addColorStop(0, 'rgba(230,207,152,.16)');
    halo.addColorStop(.5, 'rgba(230,207,152,.05)');
    halo.addColorStop(1, 'rgba(230,207,152,0)');
    c.fillStyle = halo;
    c.beginPath(); c.arc(ox, oy, R * 1.5, 0, 7); c.fill();

    /* 放射光丝 */
    for (let i = 0; i < 90; i++) {
      const a2 = i / 90 * Math.PI * 2 + Math.sin(t * .2 + i) * .06;
      const r1 = R * .35, r2 = R * (1.02 + (i % 5) * .10);
      const g2 = c.createLinearGradient(ox + Math.cos(a2) * r1, oy + Math.sin(a2) * r1,
        ox + Math.cos(a2) * r2, oy + Math.sin(a2) * r2);
      g2.addColorStop(0, 'rgba(255,236,180,.30)');
      g2.addColorStop(1, 'rgba(230,207,152,0)');
      c.strokeStyle = g2; c.lineWidth = i % 7 === 0 ? 1.4 : .7;
      c.beginPath();
      c.moveTo(ox + Math.cos(a2) * r1, oy + Math.sin(a2) * r1);
      c.lineTo(ox + Math.cos(a2) * r2, oy + Math.sin(a2) * r2);
      c.stroke();
    }

    const ca = Math.cos(t * .22), sa = Math.sin(t * .22);
    const cb = Math.cos(t * .13), sb = Math.sin(t * .13);
    for (let i = 0; i < NP; i++) {
      const p = P[i];
      let x = p.x * ca - p.z * sa;
      let z = p.x * sa + p.z * ca;
      const y = p.y * cb - z * sb;
      z = p.y * sb + z * cb;
      const persp = 1 / (1.9 - z * .55);
      const px = ox + x * R * persp * 1.25;
      const py = oy + y * R * persp * 1.25;
      const a = clamp(.20 + persp * .95, .12, .95);
      const tw = .72 + .28 * Math.sin(t * 2.4 + p.ph);
      c.fillStyle = p.g
        ? 'rgba(255,236,180,' + (a * tw) + ')'
        : 'rgba(230,207,152,' + (a * .85 * tw) + ')';
      const s = p.s * persp * 2.3;
      c.beginPath(); c.arc(px, py, Math.max(.5, s), 0, 7); c.fill();
    }

    /* 邻近粒子星座连线（只取采样，控制开销） */
    c.strokeStyle = 'rgba(230,207,152,.16)';
    c.lineWidth = 0.7;
    const SAMPLE = [];
    for (let i = 0; i < NP; i += 21) {
      const p = P[i];
      let x = p.x * ca - p.z * sa;
      let z = p.x * sa + p.z * ca;
      const y = p.y * cb - z * sb;
      z = p.y * sb + z * cb;
      const persp = 1 / (1.9 - z * .55);
      SAMPLE.push([ox + x * R * persp * 1.25, oy + y * R * persp * 1.25]);
    }
    for (let i = 0; i < SAMPLE.length; i++) {
      for (let j = i + 1; j < Math.min(SAMPLE.length, i + 7); j++) {
        const dx = SAMPLE[i][0] - SAMPLE[j][0], dy = SAMPLE[i][1] - SAMPLE[j][1];
        if (dx * dx + dy * dy < 4200) {
          c.beginPath();
          c.moveTo(SAMPLE[i][0], SAMPLE[i][1]);
          c.lineTo(SAMPLE[j][0], SAMPLE[j][1]);
          c.stroke();
        }
      }
    }

    RINGS.forEach(rg => {
      const ang = t * rg.spin;
      const ct = Math.cos(rg.tilt), st = Math.sin(rg.tilt);
      c.strokeStyle = 'rgba(230,207,152,.14)'; c.lineWidth = 1;
      c.beginPath();
      for (let k = 0; k <= 64; k++) {
        const a2 = k / 64 * Math.PI * 2;
        const x = Math.cos(a2) * rg.r, z = Math.sin(a2) * rg.r;
        const y2 = -z * st, z2 = z * ct;
        const x3 = x * Math.cos(ang) - z2 * Math.sin(ang);
        const z3 = x * Math.sin(ang) + z2 * Math.cos(ang);
        const persp = 1 / (1.9 - z3 * .55);
        const px = ox + x3 * R * persp * 1.25, py = oy + y2 * R * persp * 1.25;
        k ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
      for (let k = 0; k < rg.n; k++) {
        const a2 = (k / rg.n) * Math.PI * 2 + ang;
        const x = Math.cos(a2) * rg.r, z = Math.sin(a2) * rg.r;
        const y2 = -z * st, z2 = z * ct;
        const x3 = x * Math.cos(ang) - z2 * Math.sin(ang);
        const z3 = x * Math.sin(ang) + z2 * Math.cos(ang);
        const persp = 1 / (1.9 - z3 * .55);
        const px = ox + x3 * R * persp * 1.25, py = oy + y2 * R * persp * 1.25;
        c.fillStyle = 'rgba(255,240,200,' + clamp(.25 + persp * .8, .1, .95) + ')';
        c.beginPath(); c.arc(px, py, Math.max(.6, 1.5 * persp), 0, 7); c.fill();
      }
    });

    const core = c.createRadialGradient(ox, oy, 0, ox, oy, R * .34);
    core.addColorStop(0, 'rgba(255,250,235,.42)');
    core.addColorStop(.4, 'rgba(230,207,152,.16)');
    core.addColorStop(1, 'rgba(230,207,152,0)');
    c.fillStyle = core;
    c.beginPath(); c.arc(ox, oy, R * .34, 0, 7); c.fill();

    for (let i = 0; i < 90; i++) {
      const a2 = i * 2.399 + t * .05;
      const rr = R * (1.1 + (i % 7) * .07);
      const px = ox + Math.cos(a2) * rr, py = oy + Math.sin(a2 * 1.3) * rr * .62;
      c.fillStyle = 'rgba(230,240,235,' + (.10 + .18 * Math.abs(Math.sin(t + i))) + ')';
      c.beginPath(); c.arc(px, py, .8, 0, 7); c.fill();
    }

    requestAnimationFrame(draw);
  })(0);
})();

