/* ============================================================
   SPIDER STAGE — 策略运行可视化场景（v2 美化版）
   蜘蛛沿策略日志巡检抓取信号词，词条飞入放射蛛网，
   分流到 多头/空头/观望 三张策略卡
   ============================================================ */
(function () {
  'use strict';
  const { drawSpider, drawProbes, clamp, finite, mix } = window.SpiderCore;

  const W = 1200, H = 800;
  const TAU = Math.PI * 2;
  const fract = v => v - Math.floor(v);
  const seeded = s => fract(Math.sin(s * 127.1 + 311.7) * 43758.5453123);

  const COL = {
    panel: 'rgba(10,17,30,0.86)',
    panelTop: 'rgba(15,26,44,0.95)',
    border: 'rgba(86,206,255,0.14)',
    border2: 'rgba(86,206,255,0.30)',
    text: '#dceaf4',
    muted: '#6b8299',
    dim: '#3a4f66',
    long: '#ff4d5e',
    short: '#12d18e',
    watch: '#fbbf24',
    pink: '#f23c83',
    cyan: '#22d3ee',
  };
  const ROUTES = [
    { key: 'long', label: '做多', en: 'GO LONG', desc: '动量确认 · 开仓' },
    { key: 'short', label: '做空', en: 'GO SHORT', desc: '趋势反转 · 平仓' },
    { key: 'watch', label: '观望', en: 'STAND ASIDE', desc: '信号弱 · 等待' },
  ];
  const routeColor = k => k === 'long' ? COL.long : k === 'short' ? COL.short : COL.watch;
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };

  const LOG_TPL = [
    ['动量因子', 'breakout', '突破'], ['均值回归', 'revert', '回归'],
    ['波动率锥', 'squeeze', '收敛'], ['资金流', 'inflow', '流入'],
    ['风险敞口', 'var95', '超限'], ['趋势强度', 'adx', '增强'],
    ['订单失衡', 'imbalance', '反向'], ['拥挤度', 'crowding', '过热'],
    ['跨期价差', 'spread', '走阔'], ['情绪指数', 'sentiment', '转暖'],
  ];
  const QUESTIONS = ['趋势持续性?', '拥挤度校验?', '回撤预算内?', '流动性充足?', '相关性过高?', '波动率过滤?', '信号衰减?'];

  class SpiderStage {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.t = 0;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.scale = 1; this.ox = 0; this.oy = 0;

      this.spider = { x: 320, y: 400, vx: 0, vy: 0, px: 320, py: 400 };
      this.currentTarget = null;
      this.dwellTimer = 0;

      this.tokens = [];
      this.decisions = [];
      this.flights = [];
      this.probeEvents = [];
      this.arrivals = [];     // 网上到达波纹
      this.counts = { long: 0, short: 0, watch: 0 };
      this.ordinal = 0;
      this.tokenIndex = 0;
      this.rowIndex = 0;
      this.scroll = 0;
      this.nextRowAt = 0;

      this.onDecision = null;
      this.resize(); this.bind();
      for (let i = 0; i < 30; i++) this.appendRow(true);
      this.scroll = Math.max(0, this.rowIndex - 27);
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ---------------- 布局几何 ---------------- */
    resize() {
      const r = this.cv.parentElement.getBoundingClientRect();
      this.cv.width = Math.round(r.width * this.dpr);
      this.cv.height = Math.round(r.height * this.dpr);
      this.cv.style.width = r.width + 'px';
      this.cv.style.height = r.height + 'px';
      this.scale = Math.min(r.width / W, r.height / H);
      this.ox = (r.width - W * this.scale) / 2;
      this.oy = (r.height - H * this.scale) / 2;
    }
    bind() {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.cv.parentElement);
    }

    get LOG() { return { x: 22, y: 64, w: 300, h: 672 }; }
    // 蛛网：放射网，中心点
    get WEB() { return { cx: 700, cy: 300, rx: 210, ry: 205 }; }
    get CARDS() { return { x: 936, y: 78, w: 240, h: 138, gap: 28 }; }
    get STREAM() { return { x: 352, y: 560, w: 800, h: 176 }; }

    /* 蛛网槽位：极坐标环绕分布（slot → 圈层+角度） */
    slotPos(slot) {
      const rings = [0.42, 0.68, 0.94];
      const ring = rings[slot % 3];
      const per = Math.floor(this.TOTAL / 3);
      const idx = Math.floor(slot / 3) + (slot % 3) * per;
      const ang = -Math.PI / 2 + idx / this.TOTAL * TAU;
      return {
        x: this.WEB.cx + Math.cos(ang) * this.WEB.rx * ring,
        y: this.WEB.cy + Math.sin(ang) * this.WEB.ry * ring,
        ang, ring,
      };
    }
    get TOTAL() { return 120; }

    /* ---------------- 数据生成 ---------------- */
    appendRow(initial = false) {
      const tpl = LOG_TPL[Math.floor(Math.random() * LOG_TPL.length)];
      const roll = Math.random();
      const route = roll < 0.44 ? 'long' : roll < 0.78 ? 'short' : 'watch';
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      const ts = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      const words = [tpl[0], tpl[2]];
      words.forEach((word, i) => this.tokens.push({
        index: this.tokenIndex++, word, row: this.rowIndex, col: i,
        route, score: 0.6 + Math.random() * 0.38,
        label: i === 0 ? '因子校验' : '信号确认',
      }));
      (this.rows = this.rows || []).push({ row: this.rowIndex, ts, factor: tpl[0], sig: tpl[2], route });
      this.rowIndex++;
    }

    rowPoint(row) { return this.LOG.y + 42 + (row - this.scroll) * 21 + 10; }
    tokenPoint(token) {
      return { x: this.LOG.x + 196 + token.col * 52, y: this.rowPoint(token.row) };
    }

    /* ---------------- 事件推进 ---------------- */
    scheduleNext() {
      const token = this.currentTarget;
      const pt = this.tokenPoint(token);
      const launch = this.t + 0.3;
      this.probeEvents.push({
        index: token.index, word: token.word, target: { x: pt.x, y: pt.y - 4 },
        width: Math.max(30, token.word.length * 12.5), launchTime: launch,
        score: token.score, label: token.label,
      });
      const slot = this.routeSlot(token.index);
      const decision = {
        index: token.index, slot, route: token.route, score: token.score,
        time: launch, launchTime: launch, word: token.word,
        question: QUESTIONS[token.index % QUESTIONS.length],
        ordinal: this.ordinal++,
      };
      this.decisions.push(decision);
      this.counts[token.route]++;
      this.flights.push(decision);
      if (this.onDecision) this.onDecision(decision);
      this.currentTarget = null;
    }

    pickTarget() {
      const routedIdx = new Set(this.decisions.map(d => d.index));
      const visible = this.tokens.filter(tk => {
        const y = this.rowPoint(tk.row);
        return y > this.LOG.y + 70 && y < this.LOG.y + this.LOG.h - 50 && !routedIdx.has(tk.index);
      });
      if (!visible.length) { this.currentTarget = null; return; }
      visible.sort((a, b) => {
        const pa = this.tokenPoint(a), pb = this.tokenPoint(b);
        return Math.hypot(pa.x - this.spider.x, pa.y - this.spider.y) - Math.hypot(pb.x - this.spider.x, pb.y - this.spider.y);
      });
      this.currentTarget = visible[Math.floor(Math.random() * Math.min(4, visible.length))];
    }

    routeSlot(index) {
      let seed = (index * 2654435761) >>> 0;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % this.TOTAL;
    }

    /* ---------------- 主循环 ---------------- */
    loop(now) {
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.t += dt;
      this.step(dt);
      this.render();
      requestAnimationFrame(this.loop);
    }

    step(dt) {
      this.nextRowAt -= dt;
      if (this.nextRowAt <= 0) { this.appendRow(); this.nextRowAt = 2.0 + Math.random() * 1.6; }
      const maxScroll = Math.max(0, this.rowIndex - 26);
      this.scroll += (maxScroll - this.scroll) * Math.min(dt * 1.1, 0.2);

      if (!this.currentTarget) this.pickTarget();
      if (this.currentTarget && this.dwellTimer <= 0) {
        const pt = this.tokenPoint(this.currentTarget);
        const anchor = { x: pt.x + 96, y: pt.y + 4 };
        const dx = anchor.x - this.spider.x, dy = anchor.y - this.spider.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 14) {
          const sp = Math.min(dist * 2.2, 230);
          this.spider.vx = mix(this.spider.vx, dx / dist * sp, Math.min(dt * 4, 1));
          this.spider.vy = mix(this.spider.vy, dy / dist * sp, Math.min(dt * 4, 1));
        } else {
          this.scheduleNext();
          this.dwellTimer = 0.5 + Math.random() * 0.6;
        }
      } else {
        this.spider.vx *= 0.9; this.spider.vy *= 0.9;
      }
      if (this.dwellTimer > 0) { this.dwellTimer -= dt; this.spider.vx *= 0.88; this.spider.vy *= 0.88; }
      this.spider.x += this.spider.vx * dt;
      this.spider.y += this.spider.vy * dt;
      this.spider.x = clamp(this.spider.x, this.LOG.x + 70, this.LOG.x + this.LOG.w + 40);
      this.spider.y = clamp(this.spider.y, this.LOG.y + 76, this.LOG.y + this.LOG.h - 44);

      this.probeEvents = this.probeEvents.filter(e => this.t < e.launchTime + 0.85);
      this.flights = this.flights.filter(f => {
        const age = this.t - f.launchTime;
        if (age > 1.15 && !f.arrived) { this.arrivals.push({ slot: f.slot, route: f.route, t: this.t }); f.arrived = true; }
        return age < 1.15;
      });
      this.arrivals = this.arrivals.filter(a => this.t - a.t < 1.2);
    }

    /* ---------------- 通用绘制 ---------------- */
    render() {
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.cv.width / this.dpr, this.cv.height / this.dpr);
      c.save();
      c.translate(this.ox, this.oy);
      c.scale(this.scale, this.scale);

      this.drawWeb(c);
      this.drawLogPanel(c);
      this.drawFlights(c);
      this.drawSpiderAndProbes(c);
      this.drawRouteCards(c);
      this.drawStream(c);

      c.restore();
    }

    /* 面板：微圆角 + 顶部光晕标题 */
    panel(c, x, y, w, h, title, right, accent) {
      const r = 6;
      c.beginPath();
      c.moveTo(x + r, y + .5); c.lineTo(x + w - r, y + .5); c.arcTo(x + w - .5, y + .5, x + w - .5, y + r, r);
      c.lineTo(x + w - .5, y + h - r); c.arcTo(x + w - .5, y + h - .5, x + w - r, y + h - .5, r);
      c.lineTo(x + r, y + h - .5); c.arcTo(x + .5, y + h - .5, x + .5, y + h - r, r);
      c.lineTo(x + .5, y + r); c.arcTo(x + .5, y + .5, x + r, y + .5, r);
      c.closePath();
      c.fillStyle = COL.panel; c.fill();
      c.strokeStyle = COL.border; c.lineWidth = 1; c.stroke();

      // 标题带：左侧发光点 + 标题
      const ac = accent || COL.cyan;
      c.save();
      c.beginPath(); c.rect(x + 1, y + 1, w - 2, 24); c.clip();
      const g = c.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, rgba(ac, 0.10));
      g.addColorStop(1, rgba(ac, 0.0));
      c.fillStyle = g; c.fillRect(x, y, w, 25);
      c.restore();
      c.strokeStyle = 'rgba(86,206,255,0.10)';
      c.beginPath(); c.moveTo(x + 1, y + 25.5); c.lineTo(x + w - 1, y + 25.5); c.stroke();

      c.fillStyle = rgba(ac, 0.9);
      c.beginPath(); c.arc(x + 14, y + 12.5, 2.2, 0, TAU); c.fill();
      c.fillStyle = rgba(ac, 0.25);
      c.beginPath(); c.arc(x + 14, y + 12.5, 5, 0, TAU); c.fill();
      c.font = '10px Consolas, monospace';
      c.fillStyle = '#9cc3d8';
      c.fillText(title, x + 24, y + 16);
      if (right) {
        c.textAlign = 'right'; c.fillStyle = '#4d6478';
        c.fillText(right, x + w - 12, y + 16); c.textAlign = 'left';
      }
    }

    /* ---------------- 蛛网（放射结构） ---------------- */
    drawWeb(c) {
      const { cx, cy, rx, ry } = this.WEB;
      c.save();

      // 放射骨架：14 根辐条
      const spokes = 14;
      for (let i = 0; i < spokes; i++) {
        const ang = i / spokes * TAU + Math.sin(this.t * 0.13 + i) * 0.012;
        const sway = Math.sin(this.t * 0.9 + i * 2.3) * 3;
        c.beginPath();
        c.moveTo(cx + Math.cos(ang) * 8, cy + Math.sin(ang) * 8);
        c.quadraticCurveTo(
          cx + Math.cos(ang) * rx * 0.55 + sway, cy + Math.sin(ang) * ry * 0.55 + sway * 0.6,
          cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry,
        );
        c.strokeStyle = 'rgba(120,170,195,0.20)';
        c.lineWidth = 0.8;
        c.stroke();
      }
      // 同心环（带下垂弧度）
      for (let ring = 1; ring <= 7; ring++) {
        const rr = ring / 7.6;
        c.beginPath();
        for (let a = 0; a <= 64; a++) {
          const ang = a / 64 * TAU;
          const droop = Math.sin(ang * 2 + this.t * 0.4 + ring) * 2.4;
          const x = cx + Math.cos(ang) * rx * rr;
          const y = cy + Math.sin(ang) * ry * rr + droop;
          a === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.strokeStyle = `rgba(120,175,200,${0.10 + 0.07 * Math.sin(this.t * 0.7 + ring)})`;
        c.lineWidth = 0.6;
        c.stroke();
      }

      // 槽位点：已路由的亮起
      const routed = new Map(this.decisions.map(d => [d.slot, d]));
      for (let slot = 0; slot < this.TOTAL; slot++) {
        const pos = this.slotPos(slot);
        const d = routed.get(slot);
        if (d) {
          const color = routeColor(d.route);
          c.fillStyle = rgba(color, 0.85);
          c.beginPath(); c.arc(pos.x, pos.y, 2.6, 0, TAU); c.fill();
          c.fillStyle = rgba(color, 0.16);
          c.beginPath(); c.arc(pos.x, pos.y, 6.5, 0, TAU); c.fill();
        } else {
          c.fillStyle = 'rgba(110,150,175,0.45)';
          c.beginPath(); c.arc(pos.x, pos.y, 1.4, 0, TAU); c.fill();
        }
      }

      // 到达波纹
      for (const a of this.arrivals) {
        const p = (this.t - a.t) / 1.2;
        const pos = this.slotPos(a.slot);
        c.strokeStyle = rgba(routeColor(a.route), (1 - p) * 0.55);
        c.lineWidth = 1;
        c.beginPath(); c.arc(pos.x, pos.y, 3 + p * 14, 0, TAU); c.stroke();
      }

      // 中心核心：策略引擎徽标
      const pulse = 1 + Math.sin(this.t * 2.6) * 0.1;
      const cg = c.createRadialGradient(cx, cy, 0, cx, cy, 22 * pulse);
      cg.addColorStop(0, 'rgba(34,211,238,0.5)');
      cg.addColorStop(0.6, 'rgba(34,211,238,0.12)');
      cg.addColorStop(1, 'rgba(34,211,238,0)');
      c.fillStyle = cg;
      c.beginPath(); c.arc(cx, cy, 22 * pulse, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(34,211,238,0.7)'; c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, 9, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(34,211,238,0.3)'; c.lineWidth = 0.6;
      c.beginPath(); c.arc(cx, cy, 14, 0, TAU); c.stroke();
      c.fillStyle = '#c8ecf6';
      c.font = '8px Consolas, monospace';
      c.textAlign = 'center';
      c.fillText('CORE', cx, cy + 3);
      c.textAlign = 'left';

      // 网区角标
      c.fillStyle = '#3d5568';
      c.font = '9px Consolas, monospace';
      c.fillText(`SLOT NET · ${this.decisions.length} routed / ${this.TOTAL}`, this.WEB.cx - 200, this.WEB.cy - this.WEB.ry - 14);
      c.restore();
    }

    /* ---------------- 日志面板 ---------------- */
    drawLogPanel(c) {
      const L = this.LOG;
      this.panel(c, L.x, L.y, L.w, L.h, 'STRATEGY SIGNAL LOG', '实时', COL.cyan);
      c.save();
      c.beginPath(); c.rect(L.x + 2, L.y + 26, L.w - 4, L.h - 28); c.clip();

      const routedIdx = new Set(this.decisions.map(d => d.index));
      const firstRow = Math.max(0, Math.floor(this.scroll) - 1);
      const lastRow = Math.min(this.rowIndex - 1, Math.ceil(this.scroll) + 28);
      c.font = '11px "Microsoft YaHei", Consolas, monospace';
      for (let row = firstRow; row <= lastRow; row++) {
        const info = this.rows[row];
        if (!info) continue;
        const y = this.rowPoint(row);
        if (y < L.y + 40 || y > L.y + L.h - 8) continue;

        // 行分隔微弱斑马纹
        if (row % 2 === 0) {
          c.fillStyle = 'rgba(120,180,210,0.028)';
          c.fillRect(L.x + 4, y - 10, L.w - 8, 20);
        }
        // 时间戳
        c.font = '8.5px Consolas, monospace';
        c.fillStyle = '#33495e';
        c.fillText(info.ts, L.x + 12, y + 2.5);
        // 因子名
        c.font = '11px "Microsoft YaHei", Consolas, monospace';
        c.fillStyle = '#8fadc2';
        c.fillText(info.factor, L.x + 52, y + 2.5);
        // 信号词：描边胶囊（未路由淡、路由后实色）
        const tk = this.tokens.find(t => t.row === row && t.col === 1);
        if (tk) {
          const routed = routedIdx.has(tk.index);
          const recent = this.decisions.some(d => d.index === tk.index && this.t - d.launchTime < 0.2);
          const color = routeColor(tk.route);
          const bx = L.x + 196, bw = 34, bh = 16, by = y - 8;
          c.beginPath();
          c.roundRect ? c.roundRect(bx, by, bw, bh, 3) : c.rect(bx, by, bw, bh);
          if (recent) {
            c.fillStyle = COL.pink; c.fill();
            c.fillStyle = '#14060c';
          } else if (routed) {
            c.fillStyle = rgba(color, 0.16); c.fill();
            c.strokeStyle = rgba(color, 0.75); c.lineWidth = 0.9; c.stroke();
            c.fillStyle = color;
          } else {
            c.strokeStyle = 'rgba(110,150,175,0.30)'; c.lineWidth = 0.8; c.stroke();
            c.fillStyle = '#9db4c6';
          }
          c.font = '10.5px "Microsoft YaHei", Consolas, monospace';
          c.textAlign = 'center';
          c.fillText(info.sig, bx + bw / 2, y + 3.5);
          c.textAlign = 'left';
          // 路由色点
          if (routed && !recent) {
            c.fillStyle = rgba(color, 0.9);
            c.beginPath(); c.arc(bx + bw + 8, y, 2, 0, TAU); c.fill();
          }
        }
      }

      // 上下渐隐
      let fade = c.createLinearGradient(0, L.y + 26, 0, L.y + 64);
      fade.addColorStop(0, 'rgba(6,10,18,0.95)'); fade.addColorStop(1, 'rgba(6,10,18,0)');
      c.fillStyle = fade; c.fillRect(L.x + 2, L.y + 26, L.w - 4, 38);
      fade = c.createLinearGradient(0, L.y + L.h - 52, 0, L.y + L.h - 2);
      fade.addColorStop(0, 'rgba(6,10,18,0)'); fade.addColorStop(1, 'rgba(6,10,18,0.95)');
      c.fillStyle = fade; c.fillRect(L.x + 2, L.y + L.h - 52, L.w - 4, 50);
      c.restore();
    }

    /* ---------------- 飞行词条 ---------------- */
    drawFlights(c) {
      c.save();
      c.beginPath(); c.rect(0, 0, W, H); c.clip();
      for (const f of this.flights) {
        const token = this.tokens.find(tk => tk.index === f.index);
        const origin = token ? this.tokenPoint(token) : { x: 200, y: 400 };
        const age = (this.t - f.launchTime) / 1.08;
        const progress = clamp(age);
        const eased = 1 - (1 - progress) ** 3;
        const end = this.slotPos(f.slot);
        const dx = end.x - origin.x, dy = end.y - origin.y;
        const bend = Math.sin(f.ordinal * 2.399) * 22;
        const cA = { x: origin.x + dx / 3, y: origin.y + dy * .2 + bend };
        const cB = { x: origin.x + dx * 2 / 3, y: end.y - dy * .2 + bend };
        const m = 1 - eased;
        const px = m ** 3 * origin.x + 3 * m * m * eased * cA.x + 3 * m * eased * eased * cB.x + eased ** 3 * end.x;
        const py = m ** 3 * origin.y + 3 * m * m * eased * cA.y + 3 * m * eased * eased * cB.y + eased ** 3 * end.y;
        const color = routeColor(f.route);

        c.globalAlpha = Math.min(1, progress * 12, (1 - progress) * 9);
        c.strokeStyle = rgba('#f23c83', 0.4); c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(origin.x, origin.y);
        c.bezierCurveTo(cA.x, cA.y, cB.x, cB.y, end.x, end.y); c.stroke();

        // 词条胶囊
        c.font = '10.5px "Microsoft YaHei", Consolas, monospace';
        const tw = c.measureText(f.word).width + 10;
        c.fillStyle = rgba(color, 0.92);
        c.beginPath();
        c.roundRect ? c.roundRect(px - tw / 2, py - 9, tw, 18, 3) : c.rect(px - tw / 2, py - 9, tw, 18);
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.6; c.stroke();
        c.fillStyle = '#0a121d';
        c.textAlign = 'center';
        c.fillText(f.word, px, py + 3.5);
        c.font = '8px Consolas, monospace';
        c.fillStyle = 'rgba(210,225,235,0.75)';
        c.fillText(`p ${f.score.toFixed(2)}`, px, py - 13);
        c.textAlign = 'left';

        if (progress > .72) {
          c.strokeStyle = rgba('#f23c83', 0.3); c.lineWidth = 1;
          c.beginPath(); c.arc(end.x, end.y, 4 + (progress - .72) * 15, 0, TAU); c.stroke();
        }
        c.globalAlpha = 1;
      }
      c.restore();
    }

    /* ---------------- 蜘蛛与触手 ---------------- */
    drawSpiderAndProbes(c) {
      const L = this.LOG;
      c.save();
      c.beginPath(); c.rect(L.x - 10, L.y + 22, L.w + 130, L.h - 22); c.clip();
      const probePoints = drawProbes(c, {
        time: this.t, body: this.spider, events: this.probeEvents,
        maxVisible: 10, accent: COL.pink,
      });
      const sx = this.spider.px, sy = this.spider.py;
      this.spider.px = this.spider.x; this.spider.py = this.spider.y;
      drawSpider(c, {
        x: this.spider.x, y: this.spider.y,
        vx: (this.spider.x - sx) * 60, vy: (this.spider.y - sy) * 60,
        time: this.t, phase: 0, activeProbes: probePoints.length,
      });
      c.restore();
    }

    /* ---------------- 策略分支卡 ---------------- */
    drawRouteCards(c) {
      const C = this.CARDS;
      ROUTES.forEach((route, i) => {
        const x = C.x, y = C.y + i * (C.h + C.gap), w = C.w, h = C.h;
        const color = routeColor(route.key);
        const recent = this.decisions.some(d => d.route === route.key && this.t - d.launchTime < .3);
        const count = this.counts[route.key];
        const total = Math.max(1, this.decisions.length);
        const share = count / total;

        // 底板
        c.beginPath();
        const r = 6;
        c.moveTo(x + r, y + .5); c.lineTo(x + w - r, y + .5); c.arcTo(x + w - .5, y + .5, x + w - .5, y + r, r);
        c.lineTo(x + w - .5, y + h - r); c.arcTo(x + w - .5, y + h - .5, x + w - r, y + h - .5, r);
        c.lineTo(x + r, y + h - .5); c.arcTo(x + .5, y + h - .5, x + .5, y + h - r, r);
        c.lineTo(x + .5, y + r); c.arcTo(x + .5, y + .5, x + r, y + .5, r);
        c.closePath();
        c.fillStyle = 'rgba(9,15,26,0.92)'; c.fill();
        c.strokeStyle = rgba(color, recent ? 0.95 : 0.4);
        c.lineWidth = recent ? 1.6 : 1;
        c.stroke();

        // 左侧能量条（占比）
        const barW = 4;
        c.fillStyle = rgba(color, 0.18);
        c.fillRect(x + 1, y + 8, barW, h - 16);
        c.fillStyle = color;
        c.fillRect(x + 1, y + h - 8 - (h - 16) * share, barW, (h - 16) * share);

        // 对角纹理
        c.save();
        c.beginPath(); c.rect(x + 10, y + 1, w - 11, h - 2); c.clip();
        c.strokeStyle = rgba(color, 0.05); c.lineWidth = 1;
        for (let d = -h; d < w; d += 9) {
          c.beginPath(); c.moveTo(x + 10 + d, y + h); c.lineTo(x + 10 + d + h, y); c.stroke();
        }
        c.restore();

        // 激活光晕
        if (recent) {
          c.save();
          c.shadowColor = color; c.shadowBlur = 18;
          c.strokeStyle = rgba(color, 0.5);
          c.beginPath(); c.roundRect ? c.roundRect(x - 3, y - 3, w + 6, h + 6, 8) : c.rect(x - 3, y - 3, w + 6, h + 6);
          c.stroke();
          c.restore();
        }

        // 内容
        c.font = '9px Consolas, monospace';
        c.fillStyle = rgba(color, 0.85);
        c.fillText(route.en, x + 20, y + 24);
        c.font = '600 16px "Microsoft YaHei", sans-serif';
        c.fillStyle = '#eef7fd';
        c.fillText(route.label, x + 20, y + 52);
        c.font = '9.5px "Microsoft YaHei", sans-serif';
        c.fillStyle = '#68879c';
        c.fillText(route.desc, x + 20, y + h - 16);

        // 占比条
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(x + 20, y + h - 34, w - 40, 3);
        c.fillStyle = color;
        c.fillRect(x + 20, y + h - 34, (w - 40) * share, 3);

        // 大数字
        c.font = '700 36px Consolas, monospace';
        c.textAlign = 'right';
        c.fillStyle = color;
        c.fillText(count, x + w - 16, y + 66);
        c.font = '8.5px Consolas, monospace';
        c.fillStyle = 'rgba(150,175,195,0.6)';
        c.fillText(`${(share * 100).toFixed(0)}%`, x + w - 16, y + 82);
        c.textAlign = 'left';
      });
    }

    /* ---------------- 决策流 ---------------- */
    drawStream(c) {
      const S = this.STREAM;
      this.panel(c, S.x, S.y, S.w, S.h, 'DECISION STREAM', 'word · question · p · route', COL.pink);
      const last = this.decisions.slice(-6);
      c.save();
      c.beginPath(); c.rect(S.x + 1, S.y + 26, S.w - 2, S.h - 28); c.clip();
      last.forEach((item, index) => {
        const y = S.y + 52 + index * 21;
        const color = routeColor(item.route);
        const isLast = index === last.length - 1;
        if (isLast) {
          c.fillStyle = rgba('#f23c83', 0.07);
          c.fillRect(S.x + 4, y - 14, S.w - 8, 20);
          c.strokeStyle = rgba('#f23c83', 0.25); c.lineWidth = 0.6;
          c.beginPath(); c.moveTo(S.x + 4, y + 6.5); c.lineTo(S.x + S.w - 4, y + 6.5); c.stroke();
        }
        c.font = '9px Consolas, monospace';
        c.fillStyle = '#3f566c';
        c.fillText(`${finite(item.time, 0).toFixed(2).padStart(5, '0')}s`, S.x + 16, y + 3);

        // 路由色点 + 词
        c.fillStyle = color;
        c.beginPath(); c.arc(S.x + 68, y - 1, 2.4, 0, TAU); c.fill();
        c.font = '11px "Microsoft YaHei", Consolas, monospace';
        c.fillStyle = isLast ? '#f0f8fd' : '#c3d6e2';
        c.fillText(item.word, S.x + 80, y + 3);

        c.font = '9.5px Consolas, monospace';
        c.fillStyle = '#68879c';
        c.fillText(item.question, S.x + 170, y + 3);
        c.fillStyle = rgba(color, 0.85);
        c.fillText(`p ${item.score.toFixed(3)}`, S.x + 330, y + 3);
        c.fillStyle = rgba(color, 0.95);
        c.fillText(`→ ${item.route === 'long' ? '做多' : item.route === 'short' ? '做空' : '观望'}`, S.x + 430, y + 3);

        // 置信度微条
        c.fillStyle = 'rgba(255,255,255,0.05)';
        c.fillRect(S.x + 510, y - 4, 240, 2.5);
        c.fillStyle = rgba(color, 0.7);
        c.fillRect(S.x + 510, y - 4, 240 * item.score, 2.5);
      });
      if (!last.length) {
        c.fillStyle = '#5d7590';
        c.font = '10px Consolas, monospace';
        c.fillText('awaiting first signal_', S.x + 16, S.y + 48);
      }
      c.restore();
    }
  }

  window.SpiderStage = SpiderStage;
})();
