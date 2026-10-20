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
  function drawMedusa(ctx, W, t, o) {
    const bend = o.bend || 0;
    const glow = o.glow === undefined ? 1 : o.glow;
    const seed = o.seed || 0;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const bellW = W, bellH = W * 0.54;         // 矮胖钟形
    const topY = -bellH * 0.86;
    const rimY = bellH * 0.10;
    const coreH = bellH * 0.42;

    /* 伞盖在某高度处的半宽 */
    function hwAt(f) { return bellW * 0.5 * Math.sqrt(Math.max(0, 1 - (1 - f) * (1 - f))); }
    function yAt(f) { return topY + (rimY - topY) * f; }

    /* ---------- 1. 触手：分节机械臂（先画） ---------- */
    const NT = 10;
    o.ends = o.ends || [];
    const baseY = rimY + coreH;
    for (let i = 0; i < NT; i++) {
      const u = i / (NT - 1) - 0.5;
      const bx = u * bellW * 0.26;
      const by = baseY - Math.abs(u) * bellW * 0.03;
      const len = bellW * (0.92 - Math.abs(u) * 0.26);
      const segs = 4;
      const segLen = len / segs;
      const ph = i * 0.7 + seed;
      const sway = Math.sin(t * 1.25 + ph) * 0.055 + Math.sin(t * 2.1 + ph * 1.6) * 0.022;
      let ang = Math.PI / 2 + u * 0.85;
      let px = bx, py = by;

      ctx.strokeStyle = 'rgba(226,236,232,' + (0.86 * glow) + ')';
      ctx.lineWidth = Math.max(2.0, bellW * 0.026);
      for (let sIdx = 0; sIdx < segs; sIdx++) {
        ang += sway * (sIdx + 1) * 0.30 + bend * (sIdx + 1) * 0.22 + u * 0.10;
        const nx = px + Math.cos(ang) * segLen;
        const ny = py + Math.sin(ang) * segLen;
        /* 管身 */
        ctx.strokeStyle = 'rgba(222,232,228,' + ((0.80 - sIdx * 0.09) * glow) + ')';
        ctx.lineWidth = Math.max(1.8, bellW * (0.028 - sIdx * 0.0035));
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
        /* 亮边 */
        ctx.strokeStyle = 'rgba(255,255,255,' + ((0.42 - sIdx * 0.06) * glow) + ')';
        ctx.lineWidth = Math.max(0.8, bellW * 0.008);
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ang - 1.57) * bellW * 0.011, py + Math.sin(ang - 1.57) * bellW * 0.011);
        ctx.lineTo(nx + Math.cos(ang - 1.57) * bellW * 0.009, ny + Math.sin(ang - 1.57) * bellW * 0.009);
        ctx.stroke();
        /* 关节球 */
        ctx.fillStyle = 'rgba(246,250,248,' + (0.90 * glow) + ')';
        ctx.beginPath(); ctx.arc(nx, ny, Math.max(1.6, bellW * (0.019 - sIdx * 0.0022)), 0, 7); ctx.fill();
        px = nx; py = ny;
      }

      /* 末端方形数据接口 */
      const sq = Math.max(5, bellW * 0.072);
      const g2 = ctx.createRadialGradient(px, py, 0, px, py, sq * 2.1);
      g2.addColorStop(0, 'rgba(255,255,255,' + (0.55 * glow) + ')');
      g2.addColorStop(0.5, 'rgba(230,207,152,' + (0.22 * glow) + ')');
      g2.addColorStop(1, 'rgba(230,207,152,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(px, py, sq * 2.1, 0, 7); ctx.fill();
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang - Math.PI / 2);
      ctx.fillStyle = 'rgba(250,252,250,' + (0.96 * glow) + ')';
      ctx.fillRect(-sq / 2, -sq / 2, sq, sq);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * glow) + ')';
      ctx.lineWidth = 1;
      ctx.strokeRect(-sq / 2, -sq / 2, sq, sq);
      ctx.fillStyle = 'rgba(60,70,68,' + (0.85 * glow) + ')';
      ctx.fillRect(-sq * 0.22, -sq * 0.22, sq * 0.44, sq * 0.44);
      ctx.restore();

      o.ends[i] = { x: px, y: py };
    }

    /* ---------- 2. 中心核心：垂直圆柱 ---------- */
    const coreW = bellW * 0.15;
    const coreG = ctx.createLinearGradient(-coreW, 0, coreW, 0);
    coreG.addColorStop(0, 'rgba(120,132,130,' + (0.55 * glow) + ')');
    coreG.addColorStop(0.35, 'rgba(226,236,232,' + (0.85 * glow) + ')');
    coreG.addColorStop(1, 'rgba(96,108,106,' + (0.55 * glow) + ')');
    ctx.fillStyle = coreG;
    ctx.beginPath();
    ctx.moveTo(-coreW, rimY - bellH * 0.06);
    ctx.lineTo(-coreW * 0.82, baseY);
    ctx.lineTo(coreW * 0.82, baseY);
    ctx.lineTo(coreW, rimY - bellH * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.40 * glow) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
    /* 核心环 */
    for (let r = 1; r <= 2; r++) {
      const yy = rimY + (baseY - rimY) * r / 3;
      ctx.strokeStyle = 'rgba(255,255,255,' + ((0.30 - r * 0.06) * glow) + ')';
      ctx.beginPath(); ctx.ellipse(0, yy, coreW * (1 - r * 0.06), coreW * 0.28, 0, 0, 7); ctx.stroke();
    }
    /* 底部基座环 */
    ctx.strokeStyle = 'rgba(240,248,244,' + (0.55 * glow) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, baseY, coreW * 1.05, coreW * 0.34, 0, 0, 7); ctx.stroke();

    /* ---------- 3. 伞盖：堆叠椭圆环 + 线框 ---------- */
    /* 半透明填充 */
    ctx.beginPath();
    ctx.moveTo(-bellW * 0.5, rimY);
    ctx.bezierCurveTo(-bellW * 0.50, topY + bellH * 0.06, -bellW * 0.24, topY, 0, topY);
    ctx.bezierCurveTo(bellW * 0.24, topY, bellW * 0.50, topY + bellH * 0.06, bellW * 0.5, rimY);
    ctx.bezierCurveTo(bellW * 0.30, rimY + bellH * 0.20, -bellW * 0.30, rimY + bellH * 0.20, -bellW * 0.5, rimY);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, topY, 0, rimY);
    fill.addColorStop(0, 'rgba(226,240,238,' + (0.24 * glow) + ')');
    fill.addColorStop(0.55, 'rgba(170,190,188,' + (0.14 * glow) + ')');
    fill.addColorStop(1, 'rgba(110,130,130,' + (0.08 * glow) + ')');
    ctx.fillStyle = fill;
    ctx.fill();

    /* 横向堆叠环（5 道，越往下越宽） */
    const FR = [0.26, 0.46, 0.64, 0.82, 1.0];
    for (let r = 0; r < FR.length; r++) {
      const f = FR[r];
      const yy = yAt(f), hw = hwAt(f);
      ctx.strokeStyle = 'rgba(255,255,255,' + ((0.46 + r * 0.07) * glow) + ')';
      ctx.lineWidth = r === FR.length - 1 ? 2.0 : 1.2;
      ctx.beginPath();
      ctx.ellipse(0, yy, hw, hw * 0.17, 0, 0, Math.PI);
      ctx.stroke();
      /* 环带下沿阴影 */
      ctx.strokeStyle = 'rgba(60,74,72,' + (0.35 * glow) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, yy + hw * 0.055, hw * 0.985, hw * 0.16, 0, 0, Math.PI);
      ctx.stroke();
    }

    /* 纵向经线 */
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.20 * glow) + ')';
    ctx.lineWidth = 0.9;
    for (let m = -3; m <= 3; m++) {
      const k = m / 3;
      ctx.beginPath();
      ctx.moveTo(0, topY);
      ctx.bezierCurveTo(k * bellW * 0.26, topY + bellH * 0.30, k * bellW * 0.50, rimY - bellH * 0.26, k * bellW * 0.50, rimY);
      ctx.stroke();
    }

    /* 顶部平顶帽 */
    ctx.beginPath();
    ctx.ellipse(0, topY, bellW * 0.13, bellW * 0.045, 0, 0, 7);
    ctx.fillStyle = 'rgba(244,250,248,' + (0.75 * glow) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * glow) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* 块状高光（左上 2 块） */
    ctx.fillStyle = 'rgba(255,255,255,' + (0.30 * glow) + ')';
    ctx.beginPath();
    ctx.ellipse(-bellW * 0.24, topY + bellH * 0.34, bellW * 0.115, bellW * 0.038, -0.34, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.16 * glow) + ')';
    ctx.beginPath();
    ctx.ellipse(-bellW * 0.10, topY + bellH * 0.60, bellW * 0.075, bellW * 0.024, -0.34, 0, 7);
    ctx.fill();

    /* 轮廓 + 边缘光 */
    const rim = ctx.createLinearGradient(-bellW * 0.5, 0, bellW * 0.5, 0);
    rim.addColorStop(0, 'rgba(172,214,232,.95)');
    rim.addColorStop(0.45, 'rgba(255,255,255,.85)');
    rim.addColorStop(1, 'rgba(255,150,196,.85)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.2, bellW * 0.016);
    ctx.beginPath();
    ctx.moveTo(-bellW * 0.5, rimY);
    ctx.bezierCurveTo(-bellW * 0.50, topY + bellH * 0.06, -bellW * 0.24, topY, 0, topY);
    ctx.bezierCurveTo(bellW * 0.24, topY, bellW * 0.50, topY + bellH * 0.06, bellW * 0.5, rimY);
    ctx.stroke();

    /* 伞沿椭圆 */
    ctx.strokeStyle = 'rgba(230,244,248,' + (0.60 * glow) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, rimY, bellW * 0.5, bellW * 0.086, 0, 0, Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  function cubic(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }

  /* ============================================================
     航线：8 个停靠点（视频中出现的停靠位置）
     ============================================================ */
  const ROUTES = [
    ['ent', 'orbC', 'stack', 'orbC'],
    ['core', 'orbL', 'life', 'orbC'],
    ['stack', 'orbC', 'agents', 'orbC'],
    ['curve', 'orbC', 'state', 'orbC'],
  ];

  const NAME = ['MEDUSA-01', 'MEDUSA-02', 'MEDUSA-03', 'MEDUSA-04'];
  const TOK = A.TOKENS;

  /* ============================================================
     MEDUSA 实体
     ============================================================ */
  class Medusa {
    constructor(i) {
      this.i = i;
      this.name = NAME[i];
      this.route = ROUTES[i];
      this.ri = 0;
      this.w = [206, 178, 232, 166][i];
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
      this.planNext();
    }

    setChip(st, extra) {
      this.chip.innerHTML = this.name + ' · <span class="st">' + st + (extra ? ' ' + extra : '') + '</span>';
      this.chip.className = 'mchip' + (st === 'CARRY' ? ' carry' : st === 'GRAB' ? ' grab' : st === 'READ' ? ' read' : '');
    }

    /* 规划下一段：当前所在停靠点 → 下一个停靠点 */
    planNext() {
      const hereKey = this.route[this.ri % this.route.length];
      this.ri++;
      const nextKey = this.route[this.ri % this.route.length];
      this.srcKey = hereKey;
      this.dstKey = nextKey;
      this.from = { x: this.pos.x, y: this.pos.y };
      this.to = { x: DOCKS[nextKey].x, y: DOCKS[nextKey].y };
      /* 弧线：中点向垂直方向偏移，避免贴着面板直飞 */
      const mx = (this.from.x + this.to.x) / 2, my = (this.from.y + this.to.y) / 2;
      const dx = this.to.x - this.from.x, dy = this.to.y - this.from.y;
      const L = Math.hypot(dx, dy) || 1;
      const side = (this.i % 2 ? 1 : -1);
      const bow = Math.min(320, L * 0.34) * side;
      this.ctrl = { x: mx - dy / L * bow, y: my + dx / L * bow };
      this.t = 0;
      this.dur = clamp(L / 210, 1.1, 4.2);
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
        this.t = Math.min(1, this.t + dt / this.dur);
        const e = easeInOut(this.t);
        const nx = quad(this.from.x, this.ctrl.x, this.to.x, e);
        const ny = quad(this.from.y, this.ctrl.y, this.to.y, e);
        this.vel.x = (nx - this.pos.x) / Math.max(dt, 1e-3);
        this.vel.y = (ny - this.pos.y) / Math.max(dt, 1e-3);
        this.pos.x = nx; this.pos.y = ny;
        if (this.t >= 1) {
          this.state = 'grab'; this.timer = 0; this.beam = 1;
          this.setChip('GRAB');
          this.spawnCubes(ri(3, 5));
          flashPanel(this.dstKey);
          this.readMax = rf(4, 18);
          this.readVal = 0;
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
      ctx.shadowColor = 'rgba(190,215,230,.55)';
      ctx.shadowBlur = 26;
      const ends = [];
      drawMedusa(ctx, this.w, t, { seed: this.seed, bend: bend, glow: 1, ends: ends });
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
