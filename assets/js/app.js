/* ============================================================
   app.js — 舞台缩放 / 通用工具 / 全局数据源
   设计画布：1866 × 2246（与视频逐帧测绘一致）
   ============================================================ */
(function () {
  'use strict';

  const STAGE_W = 1866, STAGE_H = 2246;

  /* ---------- 舞台自适应缩放 ---------- */
  const stage = document.getElementById('stage');
  function fit() {
    const k = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.transform = 'scale(' + k + ')';
    window.__K = k;
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------- 工具 ---------- */
  const rnd = a => a[(Math.random() * a.length) | 0];
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const rf = (a, b) => a + Math.random() * (b - a);
  const pad = n => String(n).padStart(2, '0');
  const nowT = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const num = n => n.toLocaleString('en-US');
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---------- 币种池 ---------- */
  const TOKENS = ['$TURDOG', '$SNOOCOIN', '$MOGIET', '$SHNUNT', '$ZAPMOON', '$PEBDOG', '$SLOINU',
    '$SHONUT', '$TOMCAT', '$SHPOMPW', '$DOLLDLORD', '$SNERMOOD', '$SYOLPUP', '$STONOGG',
    '$ZAPMAX', '$SLUXINU', '$HOPONL', '$RIZRAT', '$PEDDOG', '$TURJET', '$BOMBIT', '$FLUPUP',
    '$LOXINU', '$RUNTOAD', '$TONDOG', '$MOGONCL', '$MOGJET', '$HOGOWL', '$DONBIT', '$SHOPOWL'];

  /* ---------- 画布高清适配 ---------- */
  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const k = window.__K || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, r.width / k), h = Math.max(1, r.height / k);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, c: c };
  }

  /* ---------- 面板停靠点（来自视频逐帧追踪的归一化坐标） ---------- */
  const DOCKS = {
    core:   { x: 0.130 * STAGE_W, y: 0.135 * STAGE_H, sel: '#pnCore' },
    life:   { x: 0.400 * STAGE_W, y: 0.085 * STAGE_H, sel: '#pnLife' },
    ent:    { x: 0.849 * STAGE_W, y: 0.129 * STAGE_H, sel: '#pnEnt' },
    curve:  { x: 0.570 * STAGE_W, y: 0.215 * STAGE_H, sel: '#pnCurve' },
    orbL:   { x: 0.072 * STAGE_W, y: 0.486 * STAGE_H, sel: '#pnOrb' },
    orbC:   { x: 0.550 * STAGE_W, y: 0.365 * STAGE_H, sel: '#pnOrb' },
    stack:  { x: 0.822 * STAGE_W, y: 0.479 * STAGE_H, sel: '#pnStack' },
    agents: { x: 0.360 * STAGE_W, y: 0.860 * STAGE_H, sel: '#pnAgents' },
    state:  { x: 0.720 * STAGE_W, y: 0.855 * STAGE_H, sel: '#pnState' },
  };
  /* 每个停靠点的"数据口"（数据块被投放/取走的位置，稍偏离生物本体） */
  const PORTS = {
    core:   { x: 0.088 * STAGE_W, y: 0.185 * STAGE_H },
    life:   { x: 0.470 * STAGE_W, y: 0.115 * STAGE_H },
    ent:    { x: 0.900 * STAGE_W, y: 0.205 * STAGE_H },
    curve:  { x: 0.640 * STAGE_W, y: 0.245 * STAGE_H },
    orbL:   { x: 0.155 * STAGE_W, y: 0.520 * STAGE_H },
    orbC:   { x: 0.610 * STAGE_W, y: 0.400 * STAGE_H },
    stack:  { x: 0.885 * STAGE_W, y: 0.530 * STAGE_H },
    agents: { x: 0.410 * STAGE_W, y: 0.890 * STAGE_H },
    state:  { x: 0.780 * STAGE_W, y: 0.885 * STAGE_H },
  };

  window.APP = {
    STAGE_W, STAGE_H, DOCKS, PORTS,
    rnd, ri, rf, pad, nowT, num, lerp, clamp, fitCanvas, TOKENS,
    $: id => document.getElementById(id),
    els: {},
  };
})();
