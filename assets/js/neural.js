/* ============================================================
   NEURAL CORE — 3D 透视神经网络渲染引擎
   纯 Canvas2D 手写 3D 投影：旋转层结构 + 前向传播粒子流
   ============================================================ */
(function () {
  'use strict';

  const C = {
    cyan: '34,211,238',
    blue: '59,130,246',
    violet: '139,92,246',
    mint: '45,212,191',
    up: '255,77,94',
    down: '18,209,142',
    amber: '251,191,36',
    line: '86,206,255',
  };

  // 网络结构：层维度（视觉上等距透视排列）
  const LAYERS = [
    { n: 6, name: '行情输入', en: 'INPUT', size: 'TICK/OHLCV' },
    { n: 9, name: '因子编码', en: 'ENCODE', size: '128 因子' },
    { n: 12, name: '时序卷积', en: 'TCN', size: '256 通道' },
    { n: 14, name: '注意力', en: 'ATTN', size: '8×Head' },
    { n: 12, name: '记忆单元', en: 'LSTM', size: '512 cell' },
    { n: 10, name: '特征融合', en: 'FUSION', size: '1024 维' },
    { n: 7, name: '策略头', en: 'POLICY', size: '3 分支' },
    { n: 3, name: '执行输出', en: 'ACTION', size: 'BUY/HOLD/SELL' },
  ];

  class NeuralCore {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.t = 0;
      this.rot = 0;
      this.pulses = [];
      this.impulses = [];
      this.nodes = [];
      this.hover = { x: -1e9, y: -1e9 };
      this.activeLayer = 0;
      this.phaseTimer = 0;
      this.buildGraph();
      this.resize();
      this.bind();
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ---------- 构建节点与边 ---------- */
    buildGraph() {
      this.nodes = [];
      this.edges = [];
      const L = LAYERS.length;
      LAYERS.forEach((cfg, li) => {
        const depth = li / (L - 1); // 0..1
        for (let i = 0; i < cfg.n; i++) {
          this.nodes.push({
            layer: li,
            idx: i,
            cfg,
            // 局部坐标：层沿 Z 排列，层内节点在 XY 平面
            lx: 0,
            lz: (depth - 0.5) * 2,          // -1..1
            ly: (i - (cfg.n - 1) / 2) / Math.max(cfg.n - 1, 1),
            // 层内轻微随机椭圆偏移，避免排列死板
            jitterR: 0.62 + Math.random() * 0.38,
            act: Math.random() * 0.4,
            target: 0,
            phase: Math.random() * Math.PI * 2,
            r: 0,
            sx: 0, sy: 0, sz: 0, scale: 1,
          });
        }
      });

      // 相邻层全连接（限制 fan-out 以保持性能与视觉干净）
      for (let li = 0; li < L - 1; li++) {
        const a = this.nodes.filter(n => n.layer === li);
        const b = this.nodes.filter(n => n.layer === li + 1);
        a.forEach(na => {
          const k = Math.min(b.length, li === 0 ? 3 : 2);
          const picked = new Set();
          while (picked.size < k) picked.add(Math.floor(Math.random() * b.length));
          picked.forEach(j => {
            this.edges.push({
              a: na, b: b[j],
              w: 0.25 + Math.random() * 0.75,
              kind: (li === 5 || li === 6) ? 'attn' : 'flow',
            });
          });
        });
      }
    }

    resize() {
      const r = this.cv.parentElement.getBoundingClientRect();
      this.w = r.width;
      this.h = r.height;
      this.cv.width = r.width * this.dpr;
      this.cv.height = r.height * this.dpr;
      this.cv.style.width = r.width + 'px';
      this.cv.style.height = r.height + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.cx = this.w / 2;
      this.cy = this.h / 2 + this.h * 0.03;
      this.R = Math.min(this.w, this.h) * 0.52;
    }

    bind() {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.cv.parentElement);
      window.addEventListener('mousemove', e => {
        const r = this.cv.getBoundingClientRect();
        this.hover.x = e.clientX - r.left;
        this.hover.y = e.clientY - r.top;
      });
      window.addEventListener('mouseleave', () => { this.hover.x = -1e9; });
    }

    /* ---------- 3D 投影 ---------- */
    project(node, rot) {
      // 层沿 Z 轴旋转（绕 Y 轴），并做轻微俯仰
      const cosY = Math.cos(rot), sinY = Math.sin(rot);
      const pitch = -0.22;
      const cosX = Math.cos(pitch), sinX = Math.sin(pitch);

      // 层内环形排布
      const ang = (node.idx / node.cfg.n) * Math.PI * 2 + node.layer * 0.5;
      const ringR = 0.34 + node.jitterR * 0.14;
      let x = Math.cos(ang) * ringR;
      let y = Math.sin(ang) * ringR * 0.92;
      let z = node.lz * 1.55;

      // 绕 Y 旋转
      let x1 = x * cosY - z * sinY;
      let z1 = x * sinY + z * cosY;
      // 绕 X 俯仰
      let y1 = y * cosX - z1 * sinX;
      let z2 = y * sinX + z1 * cosX;

      const persp = 2.6 / (2.6 + z2 * 0.55);
      node.sx = this.cx + x1 * this.R * persp;
      node.sy = this.cy + y1 * this.R * persp * 1.0;
      node.sz = z2;
      node.scale = persp;
      return node;
    }

    /* ---------- 激活波 ---------- */
    fire(layer) {
      this.nodes.filter(n => n.layer === layer).forEach((n, i) => {
        setTimeout(() => { n.target = 0.75 + Math.random() * 0.25; }, i * 22);
      });
    }

    spawnPulse() {
      const li = Math.floor(Math.random() * (LAYERS.length - 1));
      const from = this.nodes.filter(n => n.layer === li);
      const to = from.length ? this.edges.filter(e => e.a.layer === li) : [];
      if (!to.length) return;
      const e = to[Math.floor(Math.random() * to.length)];
      this.pulses.push({ e, p: 0, sp: 0.012 + Math.random() * 0.018, hue: Math.random() < 0.18 ? 'up' : (Math.random() < 0.2 ? 'down' : 'cyan') });
      if (this.pulses.length > 190) this.pulses.shift();
    }

    /* ---------- 主循环 ---------- */
    loop(now) {
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.t += dt;
      this.rot += dt * 0.135;

      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      // 阶段推进（每 2.4s 前向一层）
      this.phaseTimer += dt;
      if (this.phaseTimer > 0.72) {
        this.phaseTimer = 0;
        this.activeLayer = (this.activeLayer + 1) % LAYERS.length;
        this.fire(this.activeLayer);
        if (this.onPhase) this.onPhase(this.activeLayer, LAYERS[this.activeLayer]);
      }
      const spawnRate = 5;
      for (let i = 0; i < spawnRate; i++) this.spawnPulse();

      // 投影所有节点
      this.nodes.forEach(n => {
        this.project(n, this.rot);
        n.act += ((n.target || 0) - n.act) * Math.min(dt * 5.5, 1);
        n.target *= 0.985;
      });

      // 排序：远到近
      const sorted = this.nodes.slice().sort((a, b) => b.sz - a.sz);
      const nodeDraw = new Map();

      // ---- 1. 连线 ----
      ctx.lineCap = 'round';
      this.edges.forEach(e => {
        const A = e.a, B = e.b;
        const depth = (A.sz + B.sz) / 2;
        const fade = 0.5 + (1 - Math.min(Math.abs(depth) / 1.6, 1)) * 0.5;
        const act = Math.max(A.act, B.act);
        const isAttn = e.kind === 'attn';
        const rgb = isAttn ? C.violet : C.line;
        const baseA = (isAttn ? 0.085 : 0.06) * fade + act * (isAttn ? 0.22 : 0.18);
        ctx.strokeStyle = `rgba(${rgb},${baseA})`;
        ctx.lineWidth = (isAttn ? 0.55 : 0.4) * (0.6 + A.scale * 0.45);
        ctx.beginPath();
        // 轻微曲线，增强神经联结质感
        const mx = (A.sx + B.sx) / 2 + (B.sy - A.sy) * 0.055;
        const my = (A.sy + B.sy) / 2 - (B.sx - A.sx) * 0.055;
        ctx.moveTo(A.sx, A.sy);
        ctx.quadraticCurveTo(mx, my, B.sx, B.sy);
        ctx.stroke();
        e._mx = mx; e._my = my;
      });

      // ---- 2. 粒子流 ----
      this.pulses.forEach(p => {
        p.p += p.sp;
        const A = p.e.a, B = p.e.b;
        if (p.p >= 1) {
          B.target = Math.max(B.target, 0.55);
          p.dead = true;
          return;
        }
        const u = p.p, iu = 1 - u;
        const mx = p.e._mx, my = p.e._my;
        const x = iu * iu * A.sx + 2 * iu * u * mx + u * u * B.sx;
        const y = iu * iu * A.sy + 2 * iu * u * my + u * u * B.sy;
        const rgb = p.hue === 'up' ? C.up : p.hue === 'down' ? C.down : C.cyan;
        const a = Math.sin(u * Math.PI) * 0.95;
        const sz = 1.15 * (0.6 + (A.scale + B.scale) / 2 * 0.5);
        // 拖尾
        const g = ctx.createRadialGradient(x, y, 0, x, y, sz * 4.5);
        g.addColorStop(0, `rgba(${rgb},${a})`);
        g.addColorStop(0.35, `rgba(${rgb},${a * 0.35})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, sz * 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
        ctx.beginPath();
        ctx.arc(x, y, sz * 0.55, 0, Math.PI * 2);
        ctx.fill();
      });
      this.pulses = this.pulses.filter(p => !p.dead);

      // ---- 3. 节点 ----
      sorted.forEach(n => {
        const far = Math.min(Math.max((n.sz + 1.6) / 3.2, 0), 1);
        const depthA = 0.32 + (1 - far) * 0.68;
        const baseR = (2.5 + n.act * 3.4) * n.scale * (n.layer === 7 ? 1.35 : 1);
        const active = n.layer === this.activeLayer;

        if (active || n.act > 0.25) {
          const gr = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, baseR * 5.5);
          gr.addColorStop(0, `rgba(${C.cyan},${(0.3 + n.act * 0.45) * depthA})`);
          gr.addColorStop(1, `rgba(${C.cyan},0)`);
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, baseR * 5.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // 内核
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, Math.max(baseR * 0.62, 0.7), 0, Math.PI * 2);
        const lac = 0.5 + n.act * 0.5;
        ctx.fillStyle = `rgba(210,248,255,${(0.35 + n.act * 0.6) * depthA})`;
        ctx.fill();

        // 圆环
        if (n.scale > 0.72) {
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, baseR, 0, Math.PI * 2);
          ctx.strokeStyle = active
            ? `rgba(${C.cyan},${0.55 * depthA})`
            : `rgba(${C.line},${(0.13 + n.act * 0.3) * depthA})`;
          ctx.lineWidth = active ? 0.9 : 0.55;
          ctx.stroke();
        }
        nodeDraw.set(n, { r: baseR, depthA });
      });

      // ---- 4. 层标签环（每层当前激活层的虚线环） ----
      const cur = this.nodes.filter(n => n.layer === this.activeLayer);
      if (cur.length) {
        const s = cur.reduce((acc, n) => {
          acc.x += n.sx / cur.length;
          acc.y += n.sy / cur.length;
          acc.r += n.scale / cur.length;
          return acc;
        }, { x: 0, y: 0, r: 0 });
        const rr = this.R * 0.45 * s.r;
        ctx.save();
        ctx.setLineDash([3, 6]);
        ctx.strokeStyle = `rgba(${C.cyan},${0.16 + Math.sin(this.t * 3) * 0.06})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, rr, rr * 0.92, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      requestAnimationFrame(this.loop);
    }
  }

  window.NeuralCore = NeuralCore;
  window.NEURAL_LAYERS = LAYERS;
})();
