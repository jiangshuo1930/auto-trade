/* ============================================================
   NEURAL STAGE — 量化策略神经图谱
   ─────────────────────────────────────────────────────────────
   空间结构：
     · 中央：一团大型神经网络核心（多层神经元 + 密集层间连线 + 呼吸核心体）
     · 四周：水母 = 策略信号终端，环绕轨道分布
     · 蜘蛛：从神经核心的出口抓取「数据包」，携带飞向目标水母完成投喂
   数据流向：神经核心 ——发射——▶ 数据包（漂浮待捕） ——蜘蛛抓取——▶ 水母（信号点亮）
   结构参考 neural-creator-dashboard（水母/触须/面包屑/弹簧）
   蜘蛛与触手引擎来自 prompt-spider-ui
   原生 Canvas/JS，无框架依赖
   ============================================================ */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fract = v => v - Math.floor(v);
  const seeded = s => fract(Math.sin(s * 127.1 + 311.7) * 43758.5453123);

  const T = {
    gold: '#e6cf98', silver: '#e4e4e0', lav: '#c3bcf2', mint: '#ace0cf',
    cyan: '#acd6e8', rose: '#e3b3c4', up: '#ff7385', down: '#6be3ad',
  };

  /* ── 策略（水母终端）：环绕神经核心分布 ─────────────────────── */
  const STRATEGIES = [
    {
      id: 'momentum', name: '动量突破', en: 'MOMENTUM', color: '#acd6e8',
      angle: -128, nav: 1.2847, pnl: '+86,420', sharpe: 2.71,
      state: 'RUNNING', band: 'CTA 主线', gears: '中频·5m',
      symbols: 'IC / IM / IF', hold: '18 标的',
    },
    {
      id: 'meanrev', name: '均值回归', en: 'MEAN-REV', color: '#c3bcf2',
      angle: -52, nav: 1.1624, pnl: '+31,260', sharpe: 2.18,
      state: 'RUNNING', band: '统计套利', gears: '高频·15s',
      symbols: 'ETF 篮子', hold: '42 对',
    },
    {
      id: 'flow', name: '资金流跟随', en: 'FLOW-FOLLOW', color: '#ace0cf',
      angle: 24, nav: 1.0938, pnl: '+12,880', sharpe: 1.86,
      state: 'OBSERVE', band: '题材轮动', gears: '中频·30m',
      symbols: '主板 A', hold: '11 标的',
    },
    {
      id: 'arb', name: '跨期套利', en: 'ARB', color: '#e3b3c4',
      angle: 104, nav: 1.0512, pnl: '+7,940', sharpe: 1.62,
      state: 'RUNNING', band: '基差交易', gears: '高频·3s',
      symbols: 'IF 跨月', hold: '6 组',
    },
    {
      id: 'vol', name: '波动率对冲', en: 'VOL-HEDGE', color: '#e6cf98',
      angle: 172, nav: 1.1986, pnl: '+22,310', sharpe: 2.34,
      state: 'RUNNING', band: '保护性', gears: '低频·1D',
      symbols: 'IO 期权', hold: '9 腿',
    },
  ];

  /* ── 信号标签：水母被投喂时点亮的内容 ── */
  const SIGNAL_WORDS = {
    momentum: ['动量因子 IC 0.082', '跳空缺口回补', '突破前高 60D', '波动率抬升'],
    meanrev: ['价差 Z = -2.4σ', '协整对回归', '拥挤度回落', '半衰期 3.2 日'],
    flow: ['主力净流入 +2.1亿', '北向加仓', '板块轮动加速', '量价背离'],
    arb: ['基差收敛 +18bp', '跨月价差走阔', '交割月临近', '隐含利率 2.1%'],
    vol: ['IV 曲面偏斜', 'Gamma 敞口升', '尾部风险溢价', '对冲比率 0.42'],
  };

  /* ── 神经核心层定义（每层神经元数 / 半径比例 / 颜色）── */
  const LAYERS = [
    { n: 30, r: 0.92, col: '#acd6e8', label: 'INPUT' },
    { n: 36, r: 0.70, col: '#c3bcf2', label: 'HIDDEN-1' },
    { n: 36, r: 0.50, col: '#ace0cf', label: 'HIDDEN-2' },
    { n: 24, r: 0.32, col: '#e6cf98', label: 'ATTN' },
    { n: 14, r: 0.16, col: '#e3b3c4', label: 'OUTPUT' },
  ];

  const byId = id => STRATEGIES.find(s => s.id === id);
  const MAX_LEVEL = 4;
  const STATE_TXT = { RUNNING: '运行中', OBSERVE: '观察中', PAUSED: '已暂停' };

  class NeuralStage {
    constructor(canvas, opts = {}) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.onModule = opts.onModule || (() => {});
      this.onItem = opts.onItem || (() => {});
      this.onBack = opts.onBack || (() => {});
      this.onSignal = opts.onSignal || (() => {});

      this.t = 0;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = 0; this.H = 0;
      this.stage = 'hub';
      this.mod = null;
      this.sel = null;
      this.hoverMod = null;
      this.hoverSig = null;
      this.hoverSpider = null;
      this.time = 0;
      this.t0 = performance.now();
      this.level = 2;

      this.initSprings();
      this.initCore();
      this.initSpiders();
      this.initPackets();
      this.buildJellyDom();
      this.resize();
      this.bind();
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ── 弹簧 ── */
    initSprings() {
      const sp = x => ({ x, v: 0 });
      this.s = {
        coreS: sp(80), coreO: sp(0), coreRot: sp(0),
        mods: Object.fromEntries(STRATEGIES.map(m => [m.id, {
          x: sp(0), y: sp(0), s: sp(20), o: sp(0), lo: sp(0), hi: sp(0), feed: sp(0),
        }])),
      };
    }

    /* ── 神经核心：分层神经元（极坐标随机分布，带轻微自转）── */
    /* ── 神经核心：伪 3D 球体星云 ──
       140 个神经元分布在 5 层球壳上，整体绕 Y 轴自转 + 倾角透视投影；
       深度决定尺寸/亮度/遮挡次序，外圈两道吸积环粒子流 + 周期冲击波 */
    initCore() {
      this.core = { x: 0, y: 0, r: 200 };
      this.tilt = -0.42;                    // 绕 X 轴倾角
      this.neurons = [];
      LAYERS.forEach((L, li) => {
        for (let i = 0; i < L.n; i++) {
          // 球面均匀分布：纬度 acos(2u-1)，经度均匀
          const th = Math.acos(2 * seeded(li * 51 + i * 7.3) - 1);
          const ph = seeded(li * 97 + i * 13.7) * TAU;
          const rr = L.r * (0.90 + seeded(i * 31 + li * 7) * 0.18);
          this.neurons.push({
            li, i, th, ph, rr,
            col: L.col,
            size: 1.4 + seeded(i * 17 + li * 3) * 1.9 + (li === 4 ? 1.2 : 0),
            spin: (0.06 + seeded(i + li * 11) * 0.09) * (li % 2 ? -1 : 1),
            pulsePhase: seeded(i * 5 + li * 19) * TAU,
            pulseSpeed: 1.4 + seeded(i + li) * 1.6,
          });
        }
      });
      // 层间连接
      this.links = [];
      for (let li = 0; li < LAYERS.length - 1; li++) {
        const A = this.neurons.filter(n => n.li === li);
        const B = this.neurons.filter(n => n.li === li + 1);
        const count = Math.floor(A.length * (li === 0 ? 2.4 : 1.8));
        for (let k = 0; k < count; k++) {
          const a = A[Math.floor(seeded(k * 3.1 + li * 23) * A.length)];
          const b = B[Math.floor(seeded(k * 7.7 + li * 41) * B.length)];
          this.links.push({
            a, b, w: 0.25 + seeded(k + li * 5) * 0.75,
            phase: seeded(k * 11 + li) * TAU,
            speed: 0.5 + seeded(k + li * 3) * 1.1,
          });
        }
      }
      // 同层近邻连接
      for (let li = 0; li < LAYERS.length; li++) {
        const A = this.neurons.filter(n => n.li === li);
        for (let k = 0; k < A.length; k++) {
          const a = A[k], b = A[(k + 3 + li) % A.length];
          if (Math.abs(a.ph - b.ph) < 1.2) {
            this.links.push({
              a, b, w: 0.2 + seeded(k * 13 + li * 9) * 0.4,
              phase: seeded(k + li * 31) * TAU,
              speed: 0.4 + seeded(k * 5 + li) * 0.8,
              intra: true,
            });
          }
        }
      }
      // 球内漂浮粒子（3D）
      this.coreParticles = Array.from({ length: 80 }, (_, i) => {
        const th = Math.acos(2 * seeded(i * 3.3 + 5) - 1);
        const ph = seeded(i * 5.1) * TAU;
        return {
          th, ph, rr: Math.cbrt(seeded(i * 7.9)) * 0.92,
          sp: (0.08 + seeded(i * 2.7) * 0.22) * (i % 2 ? -1 : 1),
          size: 0.8 + seeded(i * 9.1) * 1.4,
          phase: seeded(i * 4.7) * TAU,
        };
      });
      /* ── 星爆射线（THE ORB 风格，来自章鱼视频拆解）──
         数百条射线从核心放射：左半面金色粗密（活跃发射），右半面银白细疏（待机）；
         射线端点粒子呼吸闪烁，光点沿射线流动 */
      this.rays = [];
      const RN = 460;
      for (let i = 0; i < RN; i++) {
        const a = seeded(i * 5.7) * TAU;                       // 全向
        const left = Math.cos(a) < 0;                          // 左半面
        const lenP = left
          ? 0.42 + Math.pow(seeded(i * 11.3), 0.8) * 0.72      // 左：长且幂律散布
          : 0.30 + Math.pow(seeded(i * 11.3), 1.6) * 0.44;     // 右：短
        this.rays.push({
          a, len: lenP,
          w: left ? 0.5 + seeded(i * 3.1) * 0.9 : 0.3 + seeded(i * 3.1) * 0.45,
          col: left
            ? (seeded(i * 7.7) > 0.42 ? '#e6cf98' : seeded(i * 2.3) > 0.5 ? '#c3bcf2' : '#ff7385')
            : (seeded(i * 7.7) > 0.55 ? '#e4e4e0' : '#acd6e8'),
          breathSpeed: 0.7 + seeded(i * 9.1) * 1.4,
          breathPhase: seeded(i * 4.3) * TAU,
          flowSpeed: 0.18 + seeded(i * 6.1) * 0.4,
          flowPhase: seeded(i * 8.9) * TAU,
          bend: (seeded(i * 13.7) - 0.5) * 0.22,               // 射线微弯
          glow: left && seeded(i * 17.3) > 0.78,               // 少数金色高亮射线
        });
      }
      // 粉紫纠缠弧（entanglement arcs，环绕 ORB 的透明大椭圆弧）
      this.arcs = Array.from({ length: 3 }, (_, i) => ({
        rx: 1.18 + seeded(i * 3.7) * 0.35, ry: 0.30 + seeded(i * 5.1) * 0.30,
        rot: (seeded(i * 7.9) - 0.5) * 2.2, spin: 0.14 + seeded(i * 2.9) * 0.12,
        col: i % 2 ? '#c3bcf2' : '#e3b3c4',
        dash: 26 + seeded(i * 4.1) * 40,
      }));

      // 冲击波
      this.shocks = [];
      this.nextShockAt = 2.0;
    }

    /* 3D → 2D 投影（自转 + 倾角 + 透视） */
    project(vx, vy, vz) {
      const ct = Math.cos(this.tilt), st = Math.sin(this.tilt);
      const Y = vy * ct - vz * st;
      const Z = vy * st + vz * ct;
      const persp = 1.45 / (1.45 - Z * 0.55);
      return {
        x: this.core.x + vx * this.core.r * persp,
        y: this.core.y + Y * this.core.r * persp * 0.96,
        Z, persp,
      };
    }

    /* ── 蜘蛛：从神经核心取数，送到各水母 ── */
    initSpiders() {
      const N = 3;   // 3 只蜘蛛往返搬运（比水母少，形成争抢感）
      this.spiders = Array.from({ length: N }, (_, i) => ({
        i,
        x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0,
        state: 'idle',        // idle | toCore | grab | toJelly | feed
        target: null,         // 目标水母 id
        packet: null,         // 携带的数据包
        dwell: 0,
        probes: [],
        caught: 0,
        orbit: (i / N) * TAU,
      }));
      this.sigCount = 0;
      this.feeds = [];        // 投喂特效
    }

    /* ── 数据包：由神经核心周期性发射，向外漂移等待蜘蛛抓取 ── */
    initPackets() {
      this.packets = [];
      this.nextEmitAt = 1.2;
      this.packetSeq = 0;
    }

    emitPacket() {
      const n = this.neurons[Math.floor(Math.random() * this.neurons.length)];
      const P = this.neuronPos(n);
      const ang = Math.atan2(P.y - this.core.y, P.x - this.core.x) + (Math.random() - 0.5) * 0.9;
      // 目标水母：随机挑一个，决定数据包「归属」
      const target = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
      const words = SIGNAL_WORDS[target.id];
      this.packets.push({
        id: ++this.packetSeq,
        x: P.x, y: P.y, vx: Math.cos(ang) * 0.9, vy: Math.sin(ang) * 0.9,
        born: this.time, life: 9,
        own: target.id,
        word: words[Math.floor(Math.random() * words.length)],
        short: words[Math.floor(Math.random() * words.length)].slice(0, 6),
        color: target.color,
        claimed: null,
      });
    }

    neuronPos(n) {
      const ph = n.ph + this.time * n.spin;
      const sx = Math.sin(n.th) * Math.cos(ph) * n.rr;
      const sy = Math.cos(n.th) * n.rr;
      const sz = Math.sin(n.th) * Math.sin(ph) * n.rr;
      const P = this.project(sx, sy, sz);
      P.depth = P.Z;           // -1 前 / +1 后
      return P;
    }

    resize() {
      const r = this.cv.parentElement.getBoundingClientRect();
      this.W = r.width; this.H = r.height;
      this.cv.width = Math.round(r.width * this.dpr);
      this.cv.height = Math.round(r.height * this.dpr);
      this.cv.style.width = r.width + 'px';
      this.cv.style.height = r.height + 'px';
    }

    bind() {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.cv.parentElement);

      this.cv.addEventListener('mousemove', e => {
        const r = this.cv.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        this.mouse = { x, y };
        this.hitTest(x, y);
      });
      this.cv.addEventListener('mouseleave', () => {
        this.hoverMod = null; this.hoverSpider = null;
        this.cv.style.cursor = 'default';
      });
      this.cv.addEventListener('click', () => {
        if (this.hoverMod) this.enterModule(this.hoverMod);
      });
      window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && this.mod) this.leaveModule();
      });
    }

    hitTest(x, y) {
      // 水母命中由 DOM button（.jelly/.jelly-label）处理；这里只做蜘蛛悬停
      this.hoverSpider = this.spiders.some(sp => Math.hypot(x - sp.x, y - sp.y) < 30) ? true : null;
    }

    enterModule(id) {
      this.mod = id; this.stage = 'module';
      this.onModule(id);
    }
    leaveModule() {
      this.mod = null; this.stage = 'hub';
      this.onModule(null);
    }
    setLevel(n) { this.level = clamp(n, 1, MAX_LEVEL); }

    /* ══════════════ 布局 ══════════════
       总览：神经核心居中，5 个水母环绕；聚焦：核心缩小让位，水母排成一列供细看 */
    layout() {
      const W = this.W, H = this.H, t = this.time;
      const focus = this.mod;
      const cx = W * 0.5, cy = H * 0.5;
      const res = { cx, cy, mods: {} };

      if (!focus) {
        const R = clamp(Math.min(W, H) * 0.30, 150, 250);
        res.core = { x: cx, y: cy, r: R };
        const ringX = Math.min(W * 0.38, 430), ringY = Math.min(H * 0.40, 300);
        STRATEGIES.forEach((m, i) => {
          // 自由巡游轨迹（章鱼视频拆解）：慢速大椭圆 + 角速度不均（走走停停）+ 大幅垂直漂浮
          const base = m.angle * Math.PI / 180;
          const w = 0.045 + i * 0.011;                        // 约 2 分钟一圈
          const a = base + t * w + 0.38 * Math.sin(t * 0.29 + i * 2.1);  // 停顿节律
          const rr = 0.72 + 0.30 * (0.5 + 0.5 * Math.sin(t * 0.11 + i * 1.6));  // 半径伸缩
          const bob = Math.sin(t * 0.45 + i * 2.3) * 26;      // 深呼吸式垂直漂
          res.mods[m.id] = {
            x: cx + Math.cos(a) * ringX * rr,
            y: cy + Math.sin(a) * ringY * rr + bob,
            s: clamp(Math.min(W, H) * 0.105, 82, 132),
            o: 1, idx: i,
          };
        });
      } else {
        // 聚焦：核心缩到左侧成「动力源」，水母竖向排开
        const R = clamp(Math.min(W, H) * 0.15, 90, 140);
        res.core = { x: Math.max(R + 40, W * 0.11), y: cy, r: R };
        const n = STRATEGIES.length;
        const gap = Math.min((H - 150) / n, 118);
        const colX = res.core.x + R + clamp(W * 0.15, 110, 210);
        STRATEGIES.forEach((m, i) => {
          const sel = m.id === focus;
          const k = i - (n - 1) / 2;
          res.mods[m.id] = {
            x: colX + (sel ? 8 : 0),
            y: cy + k * gap + Math.sin(t * 0.9 + i * 2) * 3,
            s: sel ? clamp(Math.min(W, H) * 0.115, 86, 124) : clamp(Math.min(W, H) * 0.070, 54, 76),
            o: sel ? 1 : 0.42, idx: i,
          };
        });
      }
      return res;
    }

    /* ══════════════ 循环 ══════════════ */
    loop(now) {
      const dt = Math.max(0, Math.min(1 / 30, (now - this.last) / 1000));
      this.last = now;
      this.time += dt;
      this.t = (now - this.t0) / 1000;
      this.step(dt);
      this.render();
      requestAnimationFrame(this.loop);
    }

    step(dt) {
      const S = this.s, L = this.layout();
      this.L = L;
      const k = 62;
      const spring = (st, target, kk = k) => {
        const c = 2 * Math.sqrt(kk);
        st.v += (-kk * (st.x - target) - c * st.v) * dt;
        st.x += st.v * dt;
        return st.x;
      };
      const intro = this.t < 2.2;

      // 核心
      this.core.x = L.core.x; this.core.y = L.core.y;
      this.core.r = spring(S.coreS, L.core.r, 34);
      this.coreO = spring(S.coreO, this.t < 0.3 ? 0 : 1, 26);

      STRATEGIES.forEach((m, i) => {
        const st = S.mods[m.id], tg = L.mods[m.id];
        const gated = intro && this.t < 0.7 + i * 0.16;
        st.x.x = spring(st.x, gated ? L.cx : tg.x);
        st.y.x = spring(st.y, gated ? L.cy : tg.y);
        st.s.x = spring(st.s, gated ? 18 : tg.s);
        st.o.x = spring(st.o, gated ? 0 : tg.o, 38);
        st.lo.x = spring(st.lo, gated ? 0 : tg.o, 38);
        st.hi.x = spring(st.hi, this.hoverMod === m.id || this.mod === m.id ? 1 : 0, 60);
        st.feed.x = spring(st.feed, 0, 6);
      });

      // 视差
      this.parX = lerp(this.parX || 0, ((this.mouse ? this.mouse.x : this.W / 2) - this.W / 2) * 0.014, Math.min(dt * 3, 1));
      this.parY = lerp(this.parY || 0, ((this.mouse ? this.mouse.y : this.H / 2) - this.H / 2) * 0.012, Math.min(dt * 3, 1));

      this.stepPackets(dt);
      this.stepSpiders(dt);
      this.feeds = this.feeds.filter(f => this.time - f.t0 < 1.4);
    }

    /* ── 数据包：核心发射 → 向外漂移 → 老化消失 ── */
    stepPackets(dt) {
      this.nextEmitAt -= dt;
      if (this.nextEmitAt <= 0) {
        this.emitPacket();
        this.nextEmitAt = (this.emitRate || 1.0) * (0.75 + Math.random() * 0.6);
      }
      const R = this.core.r;
      for (const p of this.packets) {
        if (p.claimed) continue;
        // 漂移 + 缓慢旋转
        const dx = p.x - this.core.x, dy = p.y - this.core.y;
        const d = Math.hypot(dx, dy) || 1;
        const tangent = { x: -dy / d, y: dx / d };
        const outward = d < R * 1.28 ? 24 : -6;
        p.vx += (dx / d * outward + tangent.x * 14) * dt;
        p.vy += (dy / d * outward + tangent.y * 14) * dt;
        p.vx *= 0.988; p.vy *= 0.988;
        p.x += p.vx * dt * 60 * 0.016;
        p.y += p.vy * dt * 60 * 0.016;
      }
      this.packets = this.packets.filter(p => this.time - p.born < p.life && (!p.claimed || this.time - p.claimed < 0.4));
      if (this.packets.length > 26) this.packets.splice(0, this.packets.length - 26);
    }

    /* ══════════════ 蜘蛛 ══════════════
       状态机：idle(在核心边缘待命) → grab(冲向数据包抓取) → toJelly(携带飞向水母)
                → feed(触手把数据投入水母) → idle                              */
    stepSpiders(dt) {
      const R = this.core.r;
      for (const sp of this.spiders) {
        sp.orbit += dt * (sp.state === 'idle' ? 0.55 : 0.2);
        // 待命位置：核心外沿
        const idleR = R * 1.12;
        let tx = this.core.x + Math.cos(sp.orbit) * idleR;
        let ty = this.core.y + Math.sin(sp.orbit) * idleR * 0.9;

        if (sp.state === 'idle') {
          // 找最近未被认领的数据包
          let best = null, bd = 1e9;
          for (const p of this.packets) {
            if (p.claimed) continue;
            const d = Math.hypot(p.x - sp.x || p.x - tx, p.y - sp.y || p.y - ty);
            if (d < bd) { bd = d; best = p; }
          }
          if (best && bd < 999) {
            best.claimed = sp.i;
            sp.packet = best;
            sp.state = 'grab';
          }
        } else if (sp.state === 'grab' && sp.packet) {
          const p = sp.packet;
          tx = p.x; ty = p.y;
          if (Math.hypot(tx - sp.x, ty - sp.y) < 26) {
            // 触手抓取动作
            sp.probes.push({
              index: sp.caught++, word: p.short || 'DATA',
              target: { x: p.x, y: p.y },
              width: Math.max(34, (p.short || 'DATA').length * 9),
              launchTime: this.time, score: 0.88, label: '取数',
            });
            // 决定投喂目标：优先数据包归属的水母；若已被喂满则随机
            const tgt = byId(p.own) || STRATEGIES[0];
            sp.target = tgt.id;
            sp.packet.caught = true;
            sp.state = 'toJelly';
          }
        } else if (sp.state === 'toJelly') {
          const st = this.s.mods[sp.target];
          if (!st) { sp.state = 'idle'; sp.packet = null; continue; }
          // 悬停在水母下方（触手朝上）
          tx = st.x.x;
          ty = st.y.x + st.s.x * 0.55 + 26;
          if (Math.hypot(tx - sp.x, ty - sp.y) < 34) {
            // 投喂：把数据包交给水母
            const p = sp.packet;
            if (p) {
              this.feeds.push({
                t0: this.time, x: st.x.x, y: st.y.x,
                color: p.color, word: p.word, target: sp.target,
              });
              const ss = this.s.mods[sp.target];
              if (ss) ss.feed.x = 1;
              this.fedCount = this.fedCount || {};
              this.fedCount[sp.target] = (this.fedCount[sp.target] || 0) + 1;
              this.sigCount++;
              this.onSignal({ id: sp.target, name: byId(sp.target).name, word: p.word, short: p.short || p.word.slice(0, 6) });
              p.claimed = sp.i;
              this.packets = this.packets.filter(x => x !== p);
            }
            sp.packet = null;
            sp.state = 'idle';
            sp.dwell = 0.4 + Math.random() * 0.5;
          }
        } else if (sp.state === 'idle' && sp.dwell > 0) {
          sp.dwell -= dt;
        }

        const dx = tx - sp.x, dy = ty - sp.y;
        const dist = Math.hypot(dx, dy) || 1;
        const maxSpeed = sp.state === 'grab' ? 420 : sp.state === 'toJelly' ? 330 : 150;
        const speed = Math.min(dist * 3.2, maxSpeed);
        sp.vx = lerp(sp.vx, dx / dist * speed, Math.min(dt * 6, 1));
        sp.vy = lerp(sp.vy, dy / dist * speed, Math.min(dt * 6, 1));
        sp.x += sp.vx * dt; sp.y += sp.vy * dt;

        sp.probes = sp.probes.filter(e => this.time < e.launchTime + 0.8);
      }
    }

    /* ══════════════ 渲染 ══════════════ */
    render() {
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.W, this.H);
      this.drawBackdrop(c);
      this.drawCore(c);
      this.drawPackets(c);
      this.drawThreads(c);
      this.drawMembranes(c);
      this.drawSpiderLayer(c);
      this.drawFeeds(c);
    }

    /* ── 背景 ── */
    drawBackdrop(c) {
      const W = this.W, H = this.H;
      c.save();
      c.globalAlpha = 0.35 + 0.1 * Math.sin(this.time * 0.4);
      for (let i = 0; i < 24; i++) {
        const y = (i / 24) * H;
        const amp = 12 + seeded(i) * 24;
        c.strokeStyle = `rgba(228,228,222,${0.012 + seeded(i + 5) * 0.016})`;
        c.lineWidth = 0.6;
        c.beginPath();
        for (let x = 0; x <= W; x += 26) {
          const yy = y + Math.sin(x * 0.006 + i * 0.9 + this.time * 0.2) * amp;
          x === 0 ? c.moveTo(x, yy) : c.lineTo(x, yy);
        }
        c.stroke();
      }
      for (let i = 0; i < 160; i++) {
        const px = seeded(i + 3) * W, py = seeded(i + 77) * H;
        const tw = 0.3 + 0.6 * Math.abs(Math.sin(this.time * 0.7 + i * 1.7));
        c.fillStyle = `rgba(228,228,222,${(0.025 + seeded(i + 11) * 0.10) * tw})`;
        c.beginPath(); c.arc(px, py, 0.7 + seeded(i + 21) * 1.1, 0, TAU); c.fill();
      }
      c.restore();
    }

    /* ══════════════ 中央神经网络 ══════════════ */
    drawCore(c) {
      const { x, y, r } = this.core;
      const o = clamp(this.coreO || 0);
      if (o < 0.01) return;
      const px = this.parX || 0, py = this.parY || 0;
      const t = this.time;
      c.save();
      c.globalAlpha = o;
      c.translate(px, py);
      c.globalCompositeOperation = 'lighter';

      /* 1. 深空外晕（三色径向，金/青/紫） */
      const halo = c.createRadialGradient(x, y, r * 0.05, x, y, r * 1.9);
      halo.addColorStop(0, 'rgba(240,224,178,0.26)');
      halo.addColorStop(0.30, 'rgba(172,214,232,0.11)');
      halo.addColorStop(0.62, 'rgba(195,188,242,0.045)');
      halo.addColorStop(1, 'rgba(140,150,160,0)');
      c.fillStyle = halo;
      c.beginPath(); c.arc(x, y, r * 1.9, 0, TAU); c.fill();


      /* 3. ★ 星爆射线主体（THE ORB）：左半金粗密 / 右半银细疏，端点粒子呼吸 */
      {
        // 预烘焙射线几何：核心起点 → 微弯二次曲线 → 端点
        for (const ry of this.rays) {
          const ca = Math.cos(ry.a), sa = Math.sin(ry.a);
          const breathe = 0.55 + 0.45 * Math.sin(t * ry.breathSpeed + ry.breathPhase);
          const L = r * ry.len * (0.92 + 0.08 * Math.sin(t * 0.5 + ry.breathPhase));
          const x1 = x + ca * r * 0.045, y1 = y + sa * r * 0.045;
          const x2 = x + ca * L, y2 = y + sa * L;
          // 垂直微弯
          const mx = x + ca * L * 0.5 - sa * ry.bend * L;
          const my = y + sa * L * 0.5 + ca * ry.bend * L;
          const al = (ry.glow ? 0.42 : 0.16) * breathe + 0.05;
          c.strokeStyle = hexA(ry.col, al);
          c.lineWidth = ry.w * (0.7 + 0.5 * breathe) * (ry.glow ? 1.6 : 1);
          c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx, my, x2, y2); c.stroke();

          // 端点粒子（呼吸亮点）
          const es = (ry.glow ? 2.6 : 1.5) * (0.7 + 0.5 * breathe);
          const g = c.createRadialGradient(x2, y2, 0, x2, y2, es * 3.2);
          g.addColorStop(0, hexA(ry.col, 0.85 * breathe + 0.1));
          g.addColorStop(0.35, hexA(ry.col, 0.3 * breathe));
          g.addColorStop(1, hexA(ry.col, 0));
          c.fillStyle = g;
          c.beginPath(); c.arc(x2, y2, es * 3.2, 0, TAU); c.fill();
          c.fillStyle = `rgba(255,255,250,${0.5 + 0.5 * breathe})`;
          c.beginPath(); c.arc(x2, y2, es * 0.55, 0, TAU); c.fill();

          // 沿射线流动的光点
          if (ry.glow || seeded(ry.flowPhase * 100) > 0.5) {
            const u = fract(t * ry.flowSpeed + ry.flowPhase);
            const P = quad({ x: x1, y: y1 }, { x: mx, y: my }, { x: x2, y: y2 }, u);
            const fa = Math.sin(u * Math.PI) * (ry.glow ? 0.9 : 0.45);
            const g2 = c.createRadialGradient(P.x, P.y, 0, P.x, P.y, 3.6);
            g2.addColorStop(0, `rgba(255,252,240,${fa})`);
            g2.addColorStop(1, hexA(ry.col, 0));
            c.fillStyle = g2;
            c.beginPath(); c.arc(P.x, P.y, 3.6, 0, TAU); c.fill();
          }
        }
      }

      /* 4. 粉紫纠缠弧（entanglement arcs，缓慢旋转的透明大椭圆） */
      for (const A of this.arcs) {
        c.strokeStyle = hexA(A.col, 0.10);
        c.lineWidth = 1;
        c.setLineDash([A.dash * 0.3, A.dash]);
        c.lineDashOffset = -t * A.spin * 200;
        c.beginPath();
        c.ellipse(x, y, r * A.rx, r * A.ry, A.rot + t * A.spin, 0, TAU);
        c.stroke();
        c.setLineDash([]);
      }

      /* 5. 核内星点（保留少量神经元作为 ORB 内部的稀疏星尘） */
      for (let i = 0; i < this.neurons.length; i += 2) {
        const n = this.neurons[i];
        const P = this.neuronPos(n);
        const pulse = 0.5 + 0.5 * Math.sin(t * n.pulseSpeed + n.pulsePhase);
        c.fillStyle = hexA(n.col, 0.10 + 0.22 * pulse);
        c.beginPath(); c.arc(P.x, P.y, n.size * P.persp * 0.6, 0, TAU); c.fill();
      }

      /* 6. 水母锁定光束：被悬停/投喂中的水母方向射出一条亮光束（f_014 特征） */
      {
        const target = this.hoverMod || (this.spiders.find(sp => sp.state === 'toJelly') || {}).target;
        if (target) {
          const st = this.s.mods[target];
          if (st) {
            const dx = st.x.x - x, dy = st.y.x - y, d = Math.hypot(dx, dy) || 1;
            const ex = x + dx / d * r * 1.12, ey = y + dy / d * r * 1.12;
            const pulse = 0.6 + 0.4 * Math.sin(t * 5);
            const bx = (byId(target) || {}).color || '#e6cf98';
            c.strokeStyle = hexA(bx, 0.55 * pulse);
            c.lineWidth = 1.6;
            c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
            const g = c.createRadialGradient(ex, ey, 0, ex, ey, 14);
            g.addColorStop(0, hexA(bx, 0.8 * pulse));
            g.addColorStop(1, hexA(bx, 0));
            c.fillStyle = g;
            c.beginPath(); c.arc(ex, ey, 14, 0, TAU); c.fill();
          }
        }
      }


      /* 7. 中央呼吸亮核 + 十字光芒 */
      const beat = 1 + 0.055 * Math.sin(t * 1.5);
      const core = c.createRadialGradient(x, y, 0, x, y, r * 0.30 * beat);
      core.addColorStop(0, 'rgba(255,253,244,0.60)');
      core.addColorStop(0.35, 'rgba(236,217,166,0.24)');
      core.addColorStop(1, 'rgba(236,217,166,0)');
      c.fillStyle = core;
      c.beginPath(); c.arc(x, y, r * 0.30 * beat, 0, TAU); c.fill();
      // 四向光针
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + t * 0.12;
        const len = r * (0.52 + 0.10 * Math.sin(t * 1.2 + k * 1.7));
        const gx = c.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
        gx.addColorStop(0, 'rgba(236,217,166,0.30)');
        gx.addColorStop(1, 'rgba(236,217,166,0)');
        c.strokeStyle = gx;
        c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        c.stroke();
      }

      /* 8. 周期冲击波（每 ~4s 一道，自内向外扫过整个球体） */
      this.nextShockAt -= 1 / 60;
      if (this.nextShockAt <= 0) { this.shocks.push({ t0: t }); this.nextShockAt = 3.6 + Math.random() * 1.4; }
      this.shocks = this.shocks.filter(s2 => t - s2.t0 < 1.6);
      for (const s2 of this.shocks) {
        const u = (t - s2.t0) / 1.6;
        const rr = r * (0.12 + u * 1.35);
        const al = Math.sin(u * Math.PI) * 0.5;
        c.strokeStyle = `rgba(236,217,166,${al * 0.7})`;
        c.lineWidth = 1.8 * (1 - u * 0.6);
        c.beginPath(); c.arc(x, y, rr, 0, TAU); c.stroke();
        c.strokeStyle = `rgba(172,214,232,${al * 0.35})`;
        c.lineWidth = 1;
        c.beginPath(); c.arc(x, y, rr * 0.92, 0, TAU); c.stroke();
      }

      /* 10. 外环刻度 + 流光弧 */
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = 'rgba(228,228,222,0.13)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, r * 1.02, 0, TAU); c.stroke();
      for (let i = 0; i < 72; i++) {
        const a = i / 72 * TAU + t * 0.04;
        const long = i % 6 === 0;
        const r1 = r * (long ? 1.055 : 1.035), r2 = r * 1.075;
        c.strokeStyle = long ? 'rgba(230,207,152,0.35)' : 'rgba(228,228,222,0.14)';
        c.lineWidth = long ? 1 : 0.7;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        c.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
        c.stroke();
      }
      c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const a0 = t * (k ? 0.34 : 0.5) + k * Math.PI;
        const g2 = c.createLinearGradient(x, y, x + Math.cos(a0) * r * 1.12, y + Math.sin(a0) * r * 1.12);
        g2.addColorStop(0, 'rgba(230,207,152,0)');
        g2.addColorStop(0.5, 'rgba(230,207,152,0.5)');
        g2.addColorStop(1, 'rgba(230,207,152,0)');
        c.strokeStyle = g2;
        c.lineWidth = 1.6;
        c.beginPath(); c.arc(x, y, r * 1.10, a0 - 0.75, a0 + 0.75); c.stroke();
      }

      /* 11. 中央标识 */
      c.globalCompositeOperation = 'source-over';
      if (r > 70) {
        c.textAlign = 'center';
        c.font = '600 11px Consolas, monospace';
        c.fillStyle = 'rgba(240,238,230,0.85)';
        c.fillText('NEURAL CORE', x, y - 2);
        c.font = '400 8px Consolas, monospace';
        c.fillStyle = 'rgba(200,198,188,0.5)';
        c.fillText(`ENGINE v4.2 · ${this.neurons.length}N · LIVE`, x, y + 12);
        c.textAlign = 'left';
      }
      c.restore();
    }

    /* ── 数据包：核心发射出来的数据块 ── */
    drawPackets(c) {
      const px = this.parX || 0, py = this.parY || 0;
      c.save();
      c.translate(px, py);
      for (const p of this.packets) {
        if (p.claimed) continue;
        const age = this.time - p.born;
        const fadeIn = clamp(age / 0.5);
        const fadeOut = clamp((p.life - age) / 1.2);
        const al = fadeIn * fadeOut;
        if (al < 0.02) continue;
        const blink = 0.72 + 0.28 * Math.sin(this.time * 4 + p.id);
        c.globalAlpha = al;
        // 光点
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
        g.addColorStop(0, `rgba(255,255,250,${0.95 * blink})`);
        g.addColorStop(0.32, hexA(p.color, 0.55 * blink));
        g.addColorStop(1, hexA(p.color, 0));
        c.fillStyle = g;
        c.beginPath(); c.arc(p.x, p.y, 12, 0, TAU); c.fill();
        // 菱形包体
        c.save();
        c.translate(p.x, p.y);
        c.rotate(this.time * 1.2 + p.id);
        c.strokeStyle = hexA(p.color, 0.9);
        c.lineWidth = 1;
        const s = 4.2;
        c.beginPath();
        c.moveTo(0, -s); c.lineTo(s, 0); c.lineTo(0, s); c.lineTo(-s, 0); c.closePath();
        c.stroke();
        c.restore();
        // 数据流尾巴
        c.strokeStyle = hexA(p.color, 0.28 * al);
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 8, p.y - p.vy * 8);
        c.stroke();
        c.globalAlpha = 1;
      }
      c.restore();
    }

    /* ── 丝线：核心 → 各个水母（能量供给通道） ── */
    drawThreads(c) {
      const L = this.L;
      if (!L) return;
      const px = this.parX || 0, py = this.parY || 0;
      c.save();
      c.translate(px, py);
      STRATEGIES.forEach((m, i) => {
        const st = this.s.mods[m.id];
        if (!st || st.o.x < 0.05) return;
        const o = clamp(st.o.x);
        const dx = st.x.x - this.core.x, dy = st.y.x - this.core.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        const x1 = this.core.x + ux * this.core.r * 1.06;
        const y1 = this.core.y + uy * this.core.r * 1.06;
        const x2 = st.x.x - ux * st.s.x * 0.34;
        const y2 = st.y.x - uy * st.s.x * 0.30;
        const bend = 22 * Math.sin(this.time * 0.45 + i * 1.3);
        const c1x = x1 + dx * 0.36 - uy * bend;
        const c1y = y1 + dy * 0.36 + ux * bend;
        const c2x = x1 + dx * 0.72 + uy * bend * 0.5;
        const c2y = y1 + dy * 0.72 - ux * bend * 0.5;
        const active = this.hoverMod === m.id || this.mod === m.id;
        const feed = clamp(st.feed.x);

        // 光晕
        c.strokeStyle = m.color;
        c.globalAlpha = o * (active ? 0.16 : 0.07) + feed * 0.22;
        c.lineWidth = 5 + feed * 5;
        c.beginPath(); c.moveTo(x1, y1); c.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2); c.stroke();
        // 核心丝
        c.globalAlpha = o * (active ? 0.85 : 0.38) + feed * 0.4;
        c.lineWidth = active ? 1.3 : 0.85;
        c.beginPath(); c.moveTo(x1, y1); c.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2); c.stroke();

        // 脉冲：全部由核心向外（发射方向）
        const n = 3;
        for (let k = 0; k < n; k++) {
          const u = fract(this.time * 0.26 + k / n + i * 0.11);
          const P = bez3({ x: x1, y: y1 }, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x: x2, y: y2 }, u);
          const al = o * Math.sin(u * Math.PI) * (active ? 1 : 0.62);
          const g = c.createRadialGradient(P.x, P.y, 0, P.x, P.y, 6);
          g.addColorStop(0, `rgba(255,252,240,${al})`);
          g.addColorStop(0.4, hexA(m.color, al * 0.7));
          g.addColorStop(1, hexA(m.color, 0));
          c.fillStyle = g;
          c.beginPath(); c.arc(P.x, P.y, 6, 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
      });
      c.restore();
    }

    /* ── 水母（信号终端）：原版视频水母 DOM 同步 ──────────────
       jellyfish.mp4 逐帧绘入 canvas（neural-creator-dashboard 原版做法），
       mix-blend screen + 每策略 hue-rotate 染色；canvas 侧只叠加投喂光效 */
    buildJellyDom() {
      const layer = document.getElementById('jellyLayer');
      if (!layer) { this.jellyEls = null; return; }
      const FILTERS = {
        momentum: 'hue-rotate(158deg) saturate(1.05)',
        meanrev: 'hue-rotate(215deg) saturate(1.1)',
        flow: 'hue-rotate(118deg) saturate(1)',
        arb: 'hue-rotate(300deg) saturate(.9)',
        vol: 'hue-rotate(38deg) saturate(1.15)',
      };
      const FLIP = { momentum: 1, meanrev: -1, flow: 1, arb: -1, vol: 1 };
      this.jellyEls = {};
      layer.innerHTML = '';
      STRATEGIES.forEach((m, i) => {
        const btn = document.createElement('button');
        btn.className = 'jelly';
        btn.setAttribute('aria-label', `${m.name} ${m.en}`);
        btn.innerHTML = `
          <div class="jelly-inner" style="filter:${FILTERS[m.id] || 'none'}">
            <video class="vsrc" src="assets/media/jellyfish.mp4" poster="assets/media/jellyfish.jpg"
              muted loop playsInline autoplay preload="auto"></video>
            <canvas class="vid"></canvas>
          </div>`;
        const video = btn.querySelector('video');
        video.addEventListener('loadedmetadata', () => { video.currentTime = (i * 1.37) % 6; });
        btn.addEventListener('click', () => this.enterModule(m.id));
        btn.addEventListener('pointerenter', () => { this.hoverMod = m.id; });
        btn.addEventListener('pointerleave', () => { if (!this.mod) this.hoverMod = null; });

        const lab = document.createElement('div');
        lab.className = 'jelly-label';
        lab.style.setProperty('--mod', m.color);
        lab.innerHTML = `
          <span class="jl-icon">◇</span>
          <span class="jl-count">${m.sharpe.toFixed(2)}</span>
          <span class="jl-name">${m.name}<em>${m.en}</em></span>
          <span class="jl-sub">${m.band} · <b>${m.pnl}</b></span>`;
        lab.addEventListener('click', () => this.enterModule(m.id));
        lab.addEventListener('pointerenter', () => { this.hoverMod = m.id; });
        lab.addEventListener('pointerleave', () => { if (!this.mod) this.hoverMod = null; });

        this.jellyEls[m.id] = {
          btn, label: lab, flip: FLIP[m.id] || 1,
          video, canvas: btn.querySelector('canvas'),
          inner: btn.querySelector('.jelly-inner'),
          pair: { stamp: -1, ready: false },
        };
        layer.appendChild(btn);
        layer.appendChild(lab);
      });
    }

    /* 原版 paintVideo：视频帧 → canvas（object-fit: cover 等效，兼容不合成 video 的内置浏览器） */
    paintJellyVideo(je) {
      const { video, canvas, pair } = je;
      if (!video || !canvas) return;
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
      const resized = canvas.width !== W || canvas.height !== H;
      if (resized) { canvas.width = W; canvas.height = H; }
      const ready = video.readyState >= 2 && video.videoWidth;
      let src = video, sw0 = video.videoWidth, sh0 = video.videoHeight;
      if (!ready) {
        if (!video.__poster) { const img = new Image(); img.src = video.poster; video.__poster = img; }
        if (!video.__poster.naturalWidth) return;
        src = video.__poster; sw0 = src.naturalWidth; sh0 = src.naturalHeight;
      }
      const stamp = ready ? video.currentTime : -1;
      if (!resized && stamp === pair.stamp && ready === pair.ready) return;
      pair.stamp = stamp; pair.ready = ready;
      const k = Math.max(W / sw0, H / sh0), sw = W / k, sh = H / k;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(src, (sw0 - sw) / 2, (sh0 - sh) / 2, sw, sh, 0, 0, W, H);
    }

    syncJellyDom() {
      const E = this.jellyEls;
      if (!E) return;
      STRATEGIES.forEach((m, i) => {
        const st = this.s.mods[m.id];
        const je = E[m.id];
        if (!st || !je) return;
        const x = st.x.x + (this.parX || 0), y = st.y.x + (this.parY || 0), s = st.s.x;
        const o = clamp(st.o.x);
        je.btn.style.transform = `translate3d(${x - s / 2}px,${y - s * 0.375}px,0) scale(${s / 200})`;
        je.btn.style.opacity = o;
        je.btn.classList.toggle('active', this.mod === m.id || this.hoverMod === m.id);
        je.inner.style.transform = `rotate(${Math.sin(this.time * 0.6 + i) * 5}deg) scaleX(${je.flip})`;
        this.paintJellyVideo(je);

        const lab = je.label;
        if (lab) {
          const lw = lab.offsetWidth, lh = lab.offsetHeight;
          const hub = !this.mod;
          const lx = hub ? x - lw / 2 : x + s * 0.5 + 10;
          const ly = hub ? y + s * 0.36 : y - lh / 2;
          lab.style.transform = `translate3d(${lx}px,${ly}px,0)`;
          lab.style.opacity = clamp(st.lo.x * (o > 0.4 ? 1 : 0), 0, 1);
          lab.classList.toggle('active', this.mod === m.id || this.hoverMod === m.id);
        }
      });
    }

    /* ── 水母层：DOM 同步 + canvas 投喂能量光叠加 ── */
    drawMembranes(c) {
      this.syncJellyDom();
      const px = this.parX || 0, py = this.parY || 0;
      c.save();
      c.translate(px, py);
      STRATEGIES.forEach((m) => {
        const st = this.s.mods[m.id];
        if (!st || st.o.x < 0.2) return;
        const feed = clamp(st.feed.x);
        if (feed < 0.03) return;
        const s = st.s.x;
        const g = c.createRadialGradient(st.x.x, st.y.x, 0, st.x.x, st.y.x, s * 0.85);
        g.addColorStop(0, hexA(m.color, 0.38 * feed));
        g.addColorStop(1, hexA(m.color, 0));
        c.fillStyle = g;
        c.beginPath(); c.arc(st.x.x, st.y.x, s * 0.85, 0, TAU); c.fill();
      });
      c.restore();
    }


    /* ── 蜘蛛层 ── */
    drawSpiderLayer(c) {
      if (!window.SpiderCore) return;
      const { drawSpider, drawProbes } = window.SpiderCore;
      const px = this.parX || 0, py = this.parY || 0;
      c.save();
      c.translate(px, py);

      for (const sp of this.spiders) {
        const sx = sp.px, sy = sp.py;
        sp.px = sp.x; sp.py = sp.y;
        const moving = sp.state === 'grab' || sp.state === 'toJelly';
        const scale = 0.78 * (1 + (moving ? 0.06 : 0));

        // 落点光晕
        const g = c.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 40);
        g.addColorStop(0, 'rgba(172,224,207,0.10)');
        g.addColorStop(1, 'rgba(172,224,207,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(sp.x, sp.y, 40, 0, TAU); c.fill();

        // 搬运中的数据包（挂在蜘蛛下方）
        if (sp.packet && sp.state === 'toJelly') {
          const p = sp.packet;
          const gx = sp.x, gy = sp.y + 26;
          const pulse = 0.7 + 0.3 * Math.sin(this.time * 6);
          const gg = c.createRadialGradient(gx, gy, 0, gx, gy, 14);
          gg.addColorStop(0, `rgba(255,255,250,${0.95 * pulse})`);
          gg.addColorStop(0.35, hexA(p.color, 0.6 * pulse));
          gg.addColorStop(1, hexA(p.color, 0));
          c.fillStyle = gg;
          c.beginPath(); c.arc(gx, gy, 14, 0, TAU); c.fill();
          // 与蜘蛛的连接丝
          c.strokeStyle = hexA(p.color, 0.5);
          c.lineWidth = 0.8;
          c.beginPath(); c.moveTo(sp.x, sp.y + 12); c.lineTo(gx, gy - 6); c.stroke();
          // 标签
          if (p.short) {
            c.font = '500 8.5px Consolas, monospace';
            c.textAlign = 'center';
            c.fillStyle = hexA(p.color, 0.9);
            c.fillText(p.short, gx, gy + 22);
            c.textAlign = 'left';
          }
        }

        // 触手
        const pts = drawProbes(c, {
          time: this.time, body: { x: sp.x, y: sp.y },
          events: sp.probes, maxVisible: 4, accent: '#ace0cf',
        });

        // 本体
        c.save();
        c.translate(sp.x, sp.y);
        c.scale(scale, scale);
        c.translate(-sp.x, -sp.y);
        drawSpider(c, {
          x: sp.x, y: sp.y,
          vx: (sp.x - sx) * 60, vy: (sp.y - sy) * 60,
          time: this.time + sp.i * 1.7, phase: 0,
          activeProbes: pts.length,
        });
        c.restore();
      }
      c.restore();
    }

    /* ── 投喂特效：数据包融入水母 + 信号词浮出 ── */
    drawFeeds(c) {
      const px = this.parX || 0, py = this.parY || 0;
      c.save();
      c.translate(px, py);
      for (const f of this.feeds) {
        const age = this.time - f.t0;
        const u = clamp(age / 1.4);
        const al = Math.sin(u * Math.PI);
        // 冲击波环
        const rr = 10 + u * 70;
        c.strokeStyle = hexA(f.color, al * 0.55);
        c.lineWidth = 1.6 * (1 - u);
        c.beginPath(); c.arc(f.x, f.y, rr, 0, TAU); c.stroke();
        c.strokeStyle = hexA(f.color, al * 0.25);
        c.beginPath(); c.arc(f.x, f.y, rr * 0.72, 0, TAU); c.stroke();
        // 信号词浮出
        c.globalAlpha = al;
        c.font = '500 10px Inter, "PingFang SC", sans-serif';
        const tw = c.measureText(f.word).width + 14;
        const yy = f.y - 26 - u * 26;
        c.fillStyle = 'rgba(12,13,13,0.86)';
        roundRect(c, f.x - tw / 2, yy - 9, tw, 18, 5); c.fill();
        c.strokeStyle = hexA(f.color, 0.7);
        c.lineWidth = 0.8;
        roundRect(c, f.x - tw / 2, yy - 9, tw, 18, 5); c.stroke();
        c.fillStyle = hexA(f.color, 1);
        c.textAlign = 'center';
        c.fillText(f.word, f.x, yy + 3);
        c.textAlign = 'left';
        c.globalAlpha = 1;
      }
      c.restore();
    }
  }

  /* ── 工具 ── */
  function bez3(p0, p1, p2, p3, u) {
    const m = 1 - u;
    return {
      x: m ** 3 * p0.x + 3 * m * m * u * p1.x + 3 * m * u * u * p2.x + u ** 3 * p3.x,
      y: m ** 3 * p0.y + 3 * m * m * u * p1.y + 3 * m * u * u * p2.y + u ** 3 * p3.y,
    };
  }
  function quad(p0, p1, p2, u) {
    const m = 1 - u;
    return { x: m * m * p0.x + 2 * m * u * p1.x + u * u * p2.x, y: m * m * p0.y + 2 * m * u * p1.y + u * u * p2.y };
  }
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${clamp(a, 0, 1)})`;
  }

  window.NeuralStage = NeuralStage;
  window.NEURAL_STRATEGIES = STRATEGIES;
  window.NEURAL_SIGNAL_WORDS = SIGNAL_WORDS;
})();
