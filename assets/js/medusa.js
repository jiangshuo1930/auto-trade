/* ============================================================
   medusa.js — MEDUSA 章鱼（机械水母）
   · 程序化绘制：钟形伞盖 + 3 道环带 + 球顶 + 8 根分节触手
   · 行为状态机：SEEK → GRAB(取数据块) → CARRY(携带) → WRITE(投放)
   · 航线：8 个面板停靠点之间沿贝塞尔弧线飞行，不穿越面板内部
   · 数据块：3~5 枚发光小方块，挂在触手末端，飞行时拖曳摆动
   ============================================================ */
(function () {
  'use strict';
  const A = window.APP;
  const { DOCKS, PORTS, rf, ri, rnd, clamp, lerp } = A;

  const cv = document.getElementById('medusaLayer');
  const chipLayer = document.getElementById('medusaChips');
  if (!cv) return;
  const c = cv.getContext('2d');

  /* ---------- 画布分辨率：跟随实际显示尺寸，避免超大后备缓冲 ---------- */
  let VW = A.STAGE_W, VH = A.STAGE_H, SCALE = 1;
  function resize() {
    const k = (window.__K || 1) * (window.devicePixelRatio || 1);
    SCALE = Math.min(2, Math.max(0.4, k));
    cv.width = Math.round(A.STAGE_W * SCALE);
    cv.height = Math.round(A.STAGE_H * SCALE);
    VW = cv.width / SCALE; VH = cv.height / SCALE;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ============================================================
     绘制：单只 MEDUSA（局部坐标，原点=伞盖中心）
     ============================================================ */
  /* ------------------------------------------------------------
     机械乌贼 / Sentinel 造型
     头部：实心金属钟罩（横向环箍 + 纵向装甲缝 + 镜面高光 + 边缘光）
     颈部：6 枚红色传感器阵列
     触手：8 根分节机械臂，上粗下细，末端分叉钩爪 + 发光节点
     ------------------------------------------------------------ */
  function drawMedusa(ctx, W, t, o) {
    const bend = o.bend || 0;             // 速度引起的向后拖曳
    const glow = o.glow === undefined ? 1 : o.glow;
    const seed = o.seed || 0;
    const active = o.active || 0;         // 0..1 传感器亮度

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const bellW = W;
    const bellH = W * 0.62;               // 钟罩高（扁钟罩）
    const rimY = bellH * 0.34;            // 钟罩下沿
    const topY = -bellH * 0.78;

    /* ================= 1. 触手（在头后面） ================= */
    const NT = 8;
    const segs = 10;
    o.ends = o.ends || [];
    const rootY = rimY + bellH * 0.10;

    for (let i = 0; i < NT; i++) {
      const u = i / (NT - 1) - 0.5;                       // -0.5 .. 0.5
      const bx = u * bellW * 0.84;
      const by = rootY - Math.abs(u) * bellW * 0.02;
      const len = bellW * (1.95 - Math.abs(u) * 0.42);     // 触手长度
      const ph = i * 0.68 + seed;
      const sway = Math.sin(t * 1.15 + ph) * 0.075 + Math.sin(t * 2.05 + ph * 1.7) * 0.030;

      /* 贝塞尔控制点：向外散开 + 向后拖曳 */
      const spread = u * bellW * 0.62;
      const c1x = bx + spread * 0.45 + sway * bellW * 0.30 + bend * bellW * 0.22;
      const c1y = by + len * 0.34;
      const c2x = bx + spread * 1.05 + sway * bellW * 0.85 + bend * bellW * 0.55;
      const c2y = by + len * 0.72;
      const ex = bx + spread * 1.35 + sway * bellW * 1.20 + bend * bellW * 0.80;
      const ey = by + len;

      /* --- 锥形主体：采样成多边形 --- */
      const N = 20;
      const Lp = [], Rp = [];
      const w0 = bellW * 0.034, wTip = bellW * 0.002;
      for (let k = 0; k <= N; k++) {
        const tt = k / N;
        const px = cubic(bx, c1x, c2x, ex, tt);
        const py = cubic(by, c1y, c2y, ey, tt);
        const dx = cubic(bx, c1x, c2x, ex, Math.min(1, tt + 0.01)) - px;
        const dy = cubic(by, c1y, c2y, ey, Math.min(1, tt + 0.01)) - py;
        const dl = Math.hypot(dx, dy) || 1;
        const nx = -dy / dl, ny = dx / dl;
        const ww = w0 * Math.pow(1 - tt, 1.50) + wTip;
        Lp.push([px + nx * ww, py + ny * ww]);
        Rp.push([px - nx * ww, py - ny * ww]);
      }
      ctx.beginPath();
      ctx.moveTo(Lp[0][0], Lp[0][1]);
      for (let k = 1; k <= N; k++) ctx.lineTo(Lp[k][0], Lp[k][1]);
      for (let k = N; k >= 0; k--) ctx.lineTo(Rp[k][0], Rp[k][1]);
      ctx.closePath();
      const tg = ctx.createLinearGradient(bx - w0, by, bx + w0, ey);
      tg.addColorStop(0, 'rgba(255,255,255,' + (0.98 * glow) + ')');
      tg.addColorStop(0.32, 'rgba(196,208,204,' + (0.94 * glow) + ')');
      tg.addColorStop(0.72, 'rgba(112,124,122,' + (0.86 * glow) + ')');
      tg.addColorStop(1, 'rgba(34,42,42,' + (0.88 * glow) + ')');
      ctx.fillStyle = tg;
      ctx.fill();

      /* --- 亮边（左上受光） --- */
      ctx.beginPath();
      for (let k = 0; k <= N; k++) k ? ctx.lineTo(Lp[k][0], Lp[k][1]) : ctx.moveTo(Lp[0][0], Lp[0][1]);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * glow) + ')';
      ctx.lineWidth = Math.max(0.8, bellW * 0.008);
      ctx.stroke();

      /* --- 分节：关节环 --- */
      for (let sIdx = 1; sIdx < segs; sIdx++) {
        const tt = sIdx / segs;
        const px = cubic(bx, c1x, c2x, ex, tt);
        const py = cubic(by, c1y, c2y, ey, tt);
        const dx = cubic(bx, c1x, c2x, ex, Math.min(1, tt + 0.01)) - px;
        const dy = cubic(by, c1y, c2y, ey, Math.min(1, tt + 0.01)) - py;
        const dl = Math.hypot(dx, dy) || 1;
        const nx = -dy / dl, ny = dx / dl;
        const ww = (w0 * Math.pow(1 - tt, 1.50) + wTip) * 1.42;
        const ang2 = Math.atan2(dy, dx);
        /* 套管：短圆柱（两端略鼓），有厚度 */
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang2);
        const cw = ww * 1.55, ch = ww * 0.92;
        const cg = ctx.createLinearGradient(0, -ch, 0, ch);
        cg.addColorStop(0, 'rgba(244,250,246,' + (0.95 * glow) + ')');
        cg.addColorStop(0.40, 'rgba(186,198,194,' + (0.95 * glow) + ')');
        cg.addColorStop(1, 'rgba(62,72,72,' + (0.95 * glow) + ')');
        ctx.fillStyle = cg;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-cw * 0.5, -ch, cw, ch * 2, ch * 0.6);
        else ctx.rect(-cw * 0.5, -ch, cw, ch * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,26,26,' + (0.55 * glow) + ')';
        ctx.lineWidth = Math.max(0.7, bellW * 0.005);
        ctx.stroke();
        /* 套管两端的暗缝 */
        ctx.strokeStyle = 'rgba(18,24,24,' + (0.7 * glow) + ')';
        ctx.lineWidth = Math.max(0.9, bellW * 0.006);
        ctx.beginPath();
        ctx.moveTo(-cw * 0.5, -ch); ctx.lineTo(-cw * 0.5, ch);
        ctx.moveTo(cw * 0.5, -ch); ctx.lineTo(cw * 0.5, ch);
        ctx.stroke();
        ctx.restore();
      }

      /* --- 末端：分叉钩爪 + 发光节点 --- */
      const dxE = ex - cubic(bx, c1x, c2x, ex, 0.94);
      const dyE = ey - cubic(by, c1y, c2y, ey, 0.94);
      const aE = Math.atan2(dyE, dxE);
      const hookL = bellW * 0.115;
      ctx.strokeStyle = 'rgba(238,244,240,' + (0.92 * glow) + ')';
      ctx.lineWidth = Math.max(1.3, bellW * 0.011);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.quadraticCurveTo(
          ex + Math.cos(aE + sgn * 0.42) * hookL * 0.75,
          ey + Math.sin(aE + sgn * 0.42) * hookL * 0.75,
          ex + Math.cos(aE + sgn * 1.15) * hookL,
          ey + Math.sin(aE + sgn * 1.15) * hookL);
        ctx.stroke();
      }
      /* 末端尖刺（实心倒钩） */
      ctx.fillStyle = 'rgba(240,246,242,' + (0.95 * glow) + ')';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + Math.cos(aE + 0.30) * hookL * 1.55, ey + Math.sin(aE + 0.30) * hookL * 1.55);
      ctx.lineTo(ex + Math.cos(aE - 0.30) * hookL * 0.55, ey + Math.sin(aE - 0.30) * hookL * 0.55);
      ctx.closePath();
      ctx.fill();

      /* 末端发光节点 */
      const nodeR = Math.max(2.2, bellW * 0.024);
      const ng = ctx.createRadialGradient(ex, ey, 0, ex, ey, nodeR * 2.6);
      ng.addColorStop(0, 'rgba(255,255,255,' + (0.85 * glow) + ')');
      ng.addColorStop(0.4, 'rgba(255,70,90,' + (0.35 * (0.35 + 0.65 * active) * glow) + ')');
      ng.addColorStop(1, 'rgba(255,70,90,0)');
      ctx.fillStyle = ng;
      ctx.beginPath(); ctx.arc(ex, ey, nodeR * 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,236,236,' + (0.9 * glow) + ')';
      ctx.beginPath(); ctx.arc(ex, ey, nodeR * 0.62, 0, 7); ctx.fill();

      o.ends[i] = { x: ex, y: ey };
    }

    /* ================= 2. 颈部连接件 ================= */
    const neckW = bellW * 0.30, neckH = bellH * 0.20;
    const ng2 = ctx.createLinearGradient(-neckW, 0, neckW, 0);
    ng2.addColorStop(0, 'rgba(210,218,214,' + (0.95 * glow) + ')');
    ng2.addColorStop(0.45, 'rgba(120,132,130,' + (0.92 * glow) + ')');
    ng2.addColorStop(1, 'rgba(44,52,52,' + (0.92 * glow) + ')');
    ctx.fillStyle = ng2;
    ctx.beginPath();
    ctx.moveTo(-neckW, rimY - bellH * 0.02);
    ctx.lineTo(-neckW * 0.82, rootY);
    ctx.lineTo(neckW * 0.82, rootY);
    ctx.lineTo(neckW, rimY - bellH * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * glow) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* ================= 3. 头部：实心金属钟罩 ================= */
    /* 外形 */
    function headPath() {
      ctx.beginPath();
      ctx.moveTo(-bellW * 0.46, rimY);
      ctx.bezierCurveTo(-bellW * 0.50, topY + bellH * 0.30, -bellW * 0.34, topY, 0, topY);
      ctx.bezierCurveTo(bellW * 0.34, topY, bellW * 0.50, topY + bellH * 0.30, bellW * 0.46, rimY);
      ctx.lineTo(-bellW * 0.46, rimY);
      ctx.closePath();
    }

    /* 金属渐变填充 */
    headPath();
    const hg = ctx.createLinearGradient(-bellW * 0.42, topY, bellW * 0.42, rimY);
    hg.addColorStop(0, 'rgba(255,255,255,' + glow + ')');
    hg.addColorStop(0.20, 'rgba(238,246,242,' + (0.98 * glow) + ')');
    hg.addColorStop(0.52, 'rgba(150,162,160,' + (0.97 * glow) + ')');
    hg.addColorStop(0.82, 'rgba(58,68,68,' + (0.97 * glow) + ')');
    hg.addColorStop(1, 'rgba(22,28,28,' + (0.97 * glow) + ')');
    ctx.fillStyle = hg;
    ctx.fill();

    /* 右半暗部（体积感） */
    ctx.save();
    headPath(); ctx.clip();
    const sh = ctx.createLinearGradient(0, 0, bellW * 0.5, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(0.62, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = sh;
    ctx.fillRect(-bellW * 0.5, topY, bellW, bellH * 1.2);

    /* 径向明暗：左上亮、边缘暗 */
    const rg2 = ctx.createRadialGradient(
      -bellW * 0.18, topY + bellH * 0.20, bellW * 0.02,
      -bellW * 0.05, topY + bellH * 0.42, bellW * 0.62);
    rg2.addColorStop(0, 'rgba(255,255,255,.55)');
    rg2.addColorStop(0.30, 'rgba(255,255,255,.10)');
    rg2.addColorStop(0.62, 'rgba(0,0,0,.12)');
    rg2.addColorStop(1, 'rgba(0,0,0,.74)');
    ctx.fillStyle = rg2;
    ctx.fillRect(-bellW * 0.5, topY, bellW, bellH * 1.2);

    /* 底部阴影（下沿压暗） */
    const bs = ctx.createLinearGradient(0, topY + bellH * 0.52, 0, rimY);
    bs.addColorStop(0, 'rgba(0,0,0,0)');
    bs.addColorStop(1, 'rgba(0,0,0,.58)');
    ctx.fillStyle = bs;
    ctx.fillRect(-bellW * 0.5, topY + bellH * 0.52, bellW, bellH * 0.6);

    /* 顶部横向环箍（3 道深槽） */
    for (let r = 0; r < 3; r++) {
      const f = 0.22 + r * 0.24;
      const yy = topY + bellH * f;
      const hw2 = bellW * 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - f * 1.35, 2))) * 0.98;
      /* 深槽 */
      ctx.strokeStyle = 'rgba(26,32,32,.85)';
      ctx.lineWidth = Math.max(1.6, bellW * 0.016);
      ctx.beginPath(); ctx.ellipse(0, yy, Math.max(4, hw2), hw2 * 0.15, 0, 0.02, Math.PI - 0.02); ctx.stroke();
      /* 槽下高光 */
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = Math.max(1, bellW * 0.008);
      ctx.beginPath(); ctx.ellipse(0, yy + bellW * 0.016, Math.max(4, hw2 * 0.99), hw2 * 0.15, 0, 0.02, Math.PI - 0.02); ctx.stroke();
    }

    /* 下半部纵向装甲缝（6 条） */
    for (let m = -3; m <= 3; m++) {
      if (m === 0) continue;
      const k = m / 3.4;
      ctx.strokeStyle = 'rgba(24,30,30,.55)';
      ctx.lineWidth = Math.max(0.8, bellW * 0.007);
      ctx.beginPath();
      ctx.moveTo(k * bellW * 0.30, topY + bellH * 0.46);
      ctx.lineTo(k * bellW * 0.455, rimY);
      ctx.stroke();
    }
    /* 一道水平腰线 */
    ctx.strokeStyle = 'rgba(20,26,26,.7)';
    ctx.lineWidth = Math.max(1.2, bellW * 0.010);
    ctx.beginPath();
    ctx.moveTo(-bellW * 0.415, topY + bellH * 0.46);
    ctx.lineTo(bellW * 0.415, topY + bellH * 0.46);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.40)';
    ctx.lineWidth = Math.max(0.8, bellW * 0.006);
    ctx.beginPath();
    ctx.moveTo(-bellW * 0.415, topY + bellH * 0.475);
    ctx.lineTo(bellW * 0.415, topY + bellH * 0.475);
    ctx.stroke();

    /* 镜面高光（左上不规则块） */
    /* 硬边高光碎片 */
    ctx.fillStyle = 'rgba(255,255,255,' + glow + ')';
    ctx.beginPath();
    ctx.moveTo(-bellW * 0.29, topY + bellH * 0.24);
    ctx.lineTo(-bellW * 0.12, topY + bellH * 0.14);
    ctx.lineTo(-bellW * 0.10, topY + bellH * 0.21);
    ctx.lineTo(-bellW * 0.27, topY + bellH * 0.31);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * glow) + ')';
    ctx.beginPath();
    ctx.moveTo(-bellW * 0.36, topY + bellH * 0.40);
    ctx.lineTo(-bellW * 0.22, topY + bellH * 0.34);
    ctx.lineTo(-bellW * 0.21, topY + bellH * 0.38);
    ctx.lineTo(-bellW * 0.35, topY + bellH * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.45 * glow) + ')';
    ctx.beginPath();
    ctx.ellipse(-bellW * 0.05, topY + bellH * 0.13, bellW * 0.055, bellW * 0.022, -0.42, 0, 7);
    ctx.fill();
    /* 纯白镜面核（金属反光点） */
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.ellipse(-bellW * 0.175, topY + bellH * 0.195, bellW * 0.048, bellW * 0.019, -0.42, 0, 7);
    ctx.fill();
    ctx.restore();

    /* 轮廓 + 左缘光 */
    headPath();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.30 * glow) + ')';
    ctx.lineWidth = Math.max(1, bellW * 0.010);
    ctx.stroke();
    const rim = ctx.createLinearGradient(-bellW * 0.5, 0, bellW * 0.5, 0);
    rim.addColorStop(0, 'rgba(200,238,248,.95)');
    rim.addColorStop(0.35, 'rgba(255,255,255,.30)');
    rim.addColorStop(1, 'rgba(255,120,150,.75)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.3, bellW * 0.014);
    ctx.beginPath();
    ctx.moveTo(-bellW * 0.46, rimY);
    ctx.bezierCurveTo(-bellW * 0.50, topY + bellH * 0.30, -bellW * 0.34, topY, 0, topY);
    ctx.stroke();

    /* 下沿椭圆（收口） */
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 * glow) + ')';
    ctx.lineWidth = Math.max(1.2, bellW * 0.012);
    ctx.beginPath();
    ctx.ellipse(0, rimY, bellW * 0.455, bellW * 0.072, 0, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(18,24,24,.75)';
    ctx.lineWidth = Math.max(1, bellW * 0.009);
    ctx.beginPath();
    ctx.ellipse(0, rimY + bellW * 0.012, bellW * 0.44, bellW * 0.068, 0, 0, Math.PI);
    ctx.stroke();

    /* ================= 4. 传感器阵列（6 枚红点） ================= */
    const senY = rimY + bellH * 0.055;
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (0.18 + 0.64 * k / 5);
      const rr = bellW * 0.20;
      const px = Math.cos(a) * rr;
      const py = senY + Math.sin(a) * rr * 0.28;
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3.1 + k * 0.9 + seed));
      const lit = 0.35 + 0.65 * pulse * (0.4 + 0.6 * active);
      const g3 = ctx.createRadialGradient(px, py, 0, px, py, bellW * 0.055);
      g3.addColorStop(0, 'rgba(255,120,130,' + (0.85 * lit * glow) + ')');
      g3.addColorStop(0.45, 'rgba(255,40,64,' + (0.45 * lit * glow) + ')');
      g3.addColorStop(1, 'rgba(255,40,64,0)');
      ctx.fillStyle = g3;
      ctx.beginPath(); ctx.arc(px, py, bellW * 0.055, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,226,226,' + (0.85 * lit * glow) + ')';
      ctx.beginPath(); ctx.arc(px, py, Math.max(1.1, bellW * 0.013), 0, 7); ctx.fill();
    }

    ctx.restore();
  }

  function cubic(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }

  /* ============================================================
     航线：8 个停靠点（视频中出现的停靠位置）
     ============================================================ */
  const PREFS = [
    ['ent', 'stack', 'orbC', 'life', 'core', 'orbL'],
    ['core', 'orbL', 'curve', 'orbC', 'agents', 'life'],
    ['stack', 'orbC', 'state', 'ent', 'curve', 'orbC'],
    ['agents', 'orbC', 'life', 'curve', 'state', 'orbL'],
  ];
  /* 停靠点预订表：同一时刻一个停靠点只停一只 */
  const OCCUPIED = {};

  const NAME = ['MEDUSA-01', 'MEDUSA-02', 'MEDUSA-03', 'MEDUSA-04'];
  const TOK = A.TOKENS;

  /* ============================================================
     MEDUSA 实体
     ============================================================ */
  class Medusa {
    constructor(i) {
      this.i = i;
      this.name = NAME[i];
      this.prefs = PREFS[i];
      this.pi = 0;
      this.route = this.prefs;
      this.w = [152, 136, 160, 128][i];
      this.seed = i * 2.1;
      this.pos = { x: DOCKS[this.route[0]].x + rf(-40, 40), y: DOCKS[this.route[0]].y + rf(-40, 40) };
      this.vel = { x: 0, y: 0 };
      this.tilt = 0;
      this.state = 'seek';
      this.timer = 0;
      this.cubes = [];
      this.beam = 0;
      this.path = null;
      this.from = null; this.to = null;
      this.hover = rf(0, 6);
      this.chip = document.createElement('div');
      this.chip.className = 'mchip';
      chipLayer.appendChild(this.chip);
      this.setChip('SEEK');
      this.dockKey = this.prefs[0];
      OCCUPIED[this.prefs[0]] = i;
      this.wait = rf(0.2, 3.0);
      this.planNext();
    }

    setChip(st, extra) {
      this.chip.innerHTML = this.name + ' · <span class="st">' + st + (extra ? ' ' + extra : '') + '</span>';
      this.chip.className = 'mchip' + (st === 'CARRY' ? ' carry' : st === 'GRAB' ? ' grab' : st === 'READ' ? ' read' : '');
    }

    /* 规划下一段：从偏好序列里挑一个"没被别的水母占用"的停靠点 */
    planNext() {
      const hereKey = this.dockKey || this.prefs[0];
      let nextKey = null;
      for (let k = 0; k < this.prefs.length; k++) {
        const cand = this.prefs[(this.pi + k) % this.prefs.length];
        if (cand === hereKey) continue;
        if (OCCUPIED[cand] && OCCUPIED[cand] !== this.i) continue;
        nextKey = cand;
        this.pi = (this.pi + k + 1) % this.prefs.length;
        break;
      }
      if (!nextKey) nextKey = this.prefs[(this.pi = (this.pi + 1) % this.prefs.length)];

      /* 释放旧停靠点，预订新停靠点 */
      if (OCCUPIED[hereKey] === this.i) delete OCCUPIED[hereKey];
      OCCUPIED[nextKey] = this.i;

      this.srcKey = hereKey;
      this.dstKey = nextKey;
      this.from = { x: this.pos.x, y: this.pos.y };
      this.to = { x: DOCKS[nextKey].x, y: DOCKS[nextKey].y };
      const mx = (this.from.x + this.to.x) / 2, my = (this.from.y + this.to.y) / 2;
      const dx = this.to.x - this.from.x, dy = this.to.y - this.from.y;
      const L = Math.hypot(dx, dy) || 1;
      const side = (this.i % 2 ? 1 : -1);
      const bow = Math.min(300, L * 0.32) * side;
      this.ctrl = { x: mx - dy / L * bow, y: my + dx / L * bow };
      this.t = 0;
      this.dur = clamp(L / 215, 1.1, 4.2);
      this.state = 'seek';
      this.setChip('SEEK');
    }

    /* 生成数据块（挂在触手末端） */
    spawnCubes(n) {
      this.cubes = [];
      for (let k = 0; k < n; k++) {
        this.cubes.push({
          x: this.pos.x, y: this.pos.y, px: this.pos.x, py: this.pos.y,
          vx: 0, vy: 0, s: rf(7, 11), ph: rf(0, 7),
          slot: 1 + k * 2, free: false, a: 0,
        });
      }
    }

    update(dt, t) {
      this.timer += dt;
      const st = this.state;

      if (st === 'seek') {
        if (this.wait > 0) {
          this.wait -= dt;
          this.pos.x += Math.sin(t * 0.9 + this.seed) * 9 * dt;
          this.pos.y += Math.cos(t * 1.1 + this.seed) * 12 * dt;
          this.t = 0;
        } else {
        this.t = Math.min(1, this.t + dt / this.dur);
        const e = easeInOut(this.t);
        const nx = quad(this.from.x, this.ctrl.x, this.to.x, e);
        const ny = quad(this.from.y, this.ctrl.y, this.to.y, e);
        this.vel.x = (nx - this.pos.x) / Math.max(dt, 1e-3);
        this.vel.y = (ny - this.pos.y) / Math.max(dt, 1e-3);
        this.pos.x = nx; this.pos.y = ny;
        if (this.t >= 1) {
          this.state = 'grab'; this.timer = 0; this.beam = 1;
          this.dockKey = this.dstKey;
          this.setChip('GRAB');
          this.spawnCubes(ri(3, 5));
          flashPanel(this.dstKey);
          this.readMax = rf(4, 18);
          this.readVal = 0;
        }
        }
      } else if (st === 'grab') {
        /* 停在停靠点，数据块从面板数据口"吸"到触手末端 */
        this.hoverAt(dt, t);
        this.readVal = Math.min(this.readMax, this.readVal + dt * this.readMax / 1.1);
        this.setChip('READ', this.readVal.toFixed(1) + ' KB');
        this.beam = Math.max(0, this.beam - dt * 1.6);
        if (this.timer > 1.25) {
          this.state = 'carry'; this.timer = 0;
          this.setChip('CARRY');
          this.planNext();
          this.state = 'carry';
          this.setChip('CARRY');
        }
      } else if (st === 'carry') {
        this.t = Math.min(1, this.t + dt / this.dur);
        const e = easeInOut(this.t);
        const nx = quad(this.from.x, this.ctrl.x, this.to.x, e);
        const ny = quad(this.from.y, this.ctrl.y, this.to.y, e);
        this.vel.x = (nx - this.pos.x) / Math.max(dt, 1e-3);
        this.vel.y = (ny - this.pos.y) / Math.max(dt, 1e-3);
        this.pos.x = nx; this.pos.y = ny;
        if (this.t >= 1) {
          this.state = 'write'; this.timer = 0;
          this.setChip('WRITE');
          flashPanel(this.dstKey);
          this.deliver();
        }
      } else if (st === 'write') {
        this.hoverAt(dt, t);
        if (this.timer > 0.9) {
          this.state = 'seek'; this.timer = 0;
          this.planNext();
        }
      }

      /* 倾角跟随速度 */
      const sp = Math.hypot(this.vel.x, this.vel.y);
      const targetTilt = clamp(this.vel.x / 900, -0.30, 0.30);
      this.tilt = lerp(this.tilt, targetTilt, Math.min(1, dt * 5));

      /* 数据块物理 */
      const ends = this._ends || [];
      this.cubes.forEach((b, k) => {
        const attach = this.state !== 'write';
        b.a = lerp(b.a || 0, attach ? 1 : 0, Math.min(1, dt * 6));
        if (attach) {
          const e2 = ends[b.slot % 8] || ends[0];
          const tx = this.pos.x + (e2 ? e2.x : 0) + Math.sin(t * 2.4 + b.ph) * 5;
          const ty = this.pos.y + (e2 ? e2.y : 0) + 6;
          b.vx += (tx - b.x) * 22 * dt;
          b.vy += (ty - b.y) * 22 * dt;
          b.vx *= 0.86; b.vy *= 0.86;
          b.x += b.vx * dt; b.y += b.vy * dt;
        } else {
          const port = PORTS[this.dstKey];
          b.vx += (port.x - b.x) * 6 * dt;
          b.vy += (port.y - b.y) * 6 * dt;
          b.vx *= 0.92; b.vy *= 0.92;
          b.x += b.vx * dt; b.y += b.vy * dt;
        }
      });

      /* chip 跟随 */
      this.chip.style.transform = 'translate3d(' + this.pos.x + 'px,' + (this.pos.y - this.w * 0.62) + 'px,0) translate(-50%,-50%)';
      this.chip.style.opacity = 0.95;
    }

    hoverAt(dt, t) {
      const d = DOCKS[this.dstKey];
      this.pos.x = lerp(this.pos.x, d.x + Math.sin(t * 0.9 + this.seed) * 7, Math.min(1, dt * 4));
      this.pos.y = lerp(this.pos.y, d.y + Math.cos(t * 1.1 + this.seed) * 9, Math.min(1, dt * 4));
      this.vel.x *= 0.9; this.vel.y *= 0.9;
    }

    deliver() {
      const tok = rnd(TOK);
      if (window.__lifePush) {
        window.__lifePush({
          k: '[TRC]', c: 'c-mt', hl: 0,
          t: () => this.name + ' wrote ' + tok + ' → ' + labelOf(this.dstKey) + ' · ' + ri(4, 40) + 'K',
        });
      }
      const ob = document.getElementById('orbObs');
      if (ob) ob.textContent = (parseInt(ob.textContent, 10) || 312) + 1;
      const ou = document.getElementById('orbOut');
      if (ou) ou.textContent = (parseInt(ou.textContent, 10) || 309) + 1;
    }

    draw(ctx, t) {
      const sp = Math.hypot(this.vel.x, this.vel.y);
      const bend = clamp(sp / 900, 0, 0.42) * (this.vel.x > 0 ? -1 : 1);
      const bob = Math.sin(t * 1.5 + this.seed) * 3;
      const pulse = 1 + Math.sin(t * 2.2 + this.seed) * 0.035;

      /* 光束（读数时） */
      if (this.beam > 0.01) {
        const p = PORTS[this.dstKey];
        ctx.save();
        const g = ctx.createLinearGradient(this.pos.x, this.pos.y, p.x, p.y);
        g.addColorStop(0, 'rgba(172,214,232,' + (0.55 * this.beam) + ')');
        g.addColorStop(1, 'rgba(230,207,152,' + (0.10 * this.beam) + ')');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([9, 7]);
        ctx.lineDashOffset = -t * 90;
        ctx.beginPath(); ctx.moveTo(this.pos.x, this.pos.y + this.w * 0.2); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.restore();
      }

      /* 生物本体 */
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y + bob);
      ctx.rotate(this.tilt);
      ctx.scale(pulse, 2 - pulse);
      /* 外发光 */
      ctx.shadowColor = 'rgba(150,200,220,.42)';
      ctx.shadowBlur = 16;
      const ends = [];
      const act = (this.state === 'read' || this.state === 'grab') ? 1 : 0.35;
      drawMedusa(ctx, this.w, t, { seed: this.seed, bend: bend, glow: 1, ends: ends, active: act });
      ctx.shadowBlur = 0;
      ctx.restore();
      this._ends = ends;

      /* 数据块 */
      this.cubes.forEach((b, k) => {
        if (b.a < 0.03) return;
        const s = b.s * (0.85 + 0.15 * Math.sin(t * 3 + b.ph));
        ctx.save();
        ctx.globalAlpha = b.a;
        /* 光晕 */
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, s * 2.6);
        g.addColorStop(0, 'rgba(255,238,190,.85)');
        g.addColorStop(0.45, 'rgba(230,207,152,.35)');
        g.addColorStop(1, 'rgba(230,207,152,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, s * 2.6, 0, 7); ctx.fill();
        /* 立方体（等距三面） */
        const h = s * 0.5;
        ctx.translate(b.x, b.y);
        ctx.rotate(t * 0.8 + b.ph);
        ctx.fillStyle = 'rgba(255,248,224,.95)';
        ctx.fillRect(-h * 0.7, -h * 0.7, h * 1.4, h * 1.4);
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-h * 0.7, -h * 0.7, h * 1.4, h * 1.4);
        ctx.fillStyle = 'rgba(230,207,152,.75)';
        ctx.fillRect(-h * 0.7, -h * 0.7, h * 1.4, h * 0.42);
        ctx.restore();
      });
    }
  }

  function quad(a, b, cc, t) {
    const mt = 1 - t;
    return mt * mt * a + 2 * mt * t * b + t * t * cc;
  }
  function easeInOut(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  const LABEL = {
    core: 'CORE MODEL', life: 'LIFE OF A DECISION', ent: 'ENTANGLEMENT MAP',
    curve: 'BUY CURVE', orbL: 'THE ORB', orbC: 'THE ORB', stack: 'DECISION STACK',
    agents: 'SIX AGENTS', state: 'STATE BUILDER',
  };
  function labelOf(k) { return LABEL[k] || k; }

  /* 面板闪光 */
  const flashT = {};
  function flashPanel(key) {
    const sel = DOCKS[key] && DOCKS[key].sel;
    if (!sel) return;
    const el = document.querySelector(sel);
    if (!el) return;
    el.classList.add('flash');
    clearTimeout(flashT[key]);
    flashT[key] = setTimeout(() => el.classList.remove('flash'), 900);
  }

  /* ---------- 启动 ---------- */
  const medusas = [0, 1, 2, 3].map(i => new Medusa(i));

  /* ?warp=N —— 启动时快进 N 秒（调试/截图用） */
  (function warp() {
    const m = /[?&]warp=(\d+(?:\.\d+)?)/.exec(location.search);
    if (!m) return;
    const secs = Math.min(600, parseFloat(m[1]) || 0);
    const step = 1 / 30;
    for (let k = 0; k < secs / step; k++) {
      const tt = k * step;
      for (const md of medusas) md.update(step, tt);
    }
  })();

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    c.clearRect(0, 0, VW, VH);
    for (const m of medusas) {
      m.update(dt, t);
      m.draw(c, t);
    }
    requestAnimationFrame(loop);
  })(last);
})();
