/* ============================================================
   CHARTS — ECharts 图表封装
   净值曲线 / 信号排序 / 因子热力 / 因子雷达 / 迷你走势
   ============================================================ */
(function () {
  'use strict';

  const C = {
    cy: '#22d3ee', vi: '#8b5cf6', mi: '#2dd4bf',
    up: '#ff4d5e', dn: '#12d18e', am: '#fbbf24',
    t1: '#a5c1d8', t2: '#5d7590', t3: '#37495e',
    line: 'rgba(86,206,255,0.12)',
  };
  const baseText = { fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 9 };

  const Charts = {};

  // ─────────── 迷你走势（原生 canvas，轻量） ───────────
  Charts.spark = function (canvas, data, color) {
    if (!canvas || !data || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 100, h = canvas.clientHeight || 18;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...data), max = Math.max(...data);
    const rng = max - min || 1;
    const px = i => (i / (data.length - 1)) * w;
    const py = v => h - 2 - ((v - min) / rng) * (h - 4);

    // 填充
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + '55');
    g.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(px(0), py(data[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(px(i), py(data[i]));
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();

    // 线
    ctx.beginPath();
    ctx.moveTo(px(0), py(data[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(px(i), py(data[i]));
    ctx.strokeStyle = color; ctx.lineWidth = 1.1;
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    ctx.stroke(); ctx.shadowBlur = 0;

    // 末点
    ctx.beginPath();
    ctx.arc(px(data.length - 1), py(data[data.length - 1]), 1.6, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  };

  // ─────────── 净值曲线 ───────────
  let eqChart = null;
  Charts.equity = function (el, points, startEquity, range) {
    if (!eqChart) eqChart = echarts.init(el, null, { renderer: 'canvas' });
    if (!points || points.length < 2) {
      eqChart.clear();
      eqChart.setOption({
        title: { text: '等待净值数据…', left: 'center', top: 'middle', textStyle: { ...baseText, color: C.t3, fontSize: 11 } },
      });
      return;
    }
    let pts = points;
    if (range && range !== 'all') {
      const span = range === '1h' ? 3600 : 900;
      const now = pts[pts.length - 1][0];
      pts = pts.filter(p => p[0] >= now - span);
      if (pts.length < 2) pts = points.slice(-2);
    }
    const data = pts.map(p => [p[0] * 1000, p[1]]);
    const vals = pts.map(p => p[1]);
    const up = vals[vals.length - 1] >= startEquity;
    const main = up ? C.up : C.dn;

    eqChart.setOption({
      animation: false,
      grid: { left: 8, right: 58, top: 14, bottom: 20, containLabel: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(6,13,24,0.94)',
        borderColor: 'rgba(34,211,238,0.35)',
        borderWidth: 1,
        padding: [6, 9],
        textStyle: { ...baseText, color: C.t1, fontSize: 10 },
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(34,211,238,0.5)', width: 1 } },
        formatter(ps) {
          const [t, v] = ps[0].data;
          const pnl = v - startEquity;
          const rate = (v / startEquity - 1) * 100;
          return `<div style="color:#5d7590;font-size:9px">${FMT.clock(t / 1000)}</div>
            <div style="font-size:13px;color:#eafaff;margin:2px 0">${FMT.money(v)}</div>
            <div style="color:${pnl >= 0 ? C.up : C.dn};font-size:10px">${FMT.signed(pnl)} (${FMT.pct(rate)})</div>`;
        },
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: C.line } },
        axisTick: { show: false },
        axisLabel: { ...baseText, color: C.t3, hideOverlap: true, formatter: v => FMT.clock(v / 1000).slice(0, 5) },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        position: 'right',
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...baseText, color: C.t3, formatter: v => '$' + FMT.compact(v) },
        splitLine: { lineStyle: { color: 'rgba(86,206,255,0.06)', type: 'dashed' } },
      },
      series: [{
        type: 'line',
        data,
        showSymbol: false,
        smooth: 0.22,
        lineStyle: { color: main, width: 1.8, shadowColor: main, shadowBlur: 10 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: (up ? 'rgba(255,77,94,0.34)' : 'rgba(18,209,142,0.32)') },
            { offset: 1, color: 'rgba(8,16,30,0)' },
          ]),
        },
        markLine: {
          silent: true, symbol: 'none', animation: false,
          data: [{ yAxis: startEquity }],
          lineStyle: { color: 'rgba(165,193,216,0.35)', type: 'dashed', width: 1 },
          label: { ...baseText, color: C.t2, formatter: '成本线', position: 'insideStartTop' },
        },
      }],
    }, true);
  };

  // ─────────── 信号排序（横向柱 + 置信度点） ───────────
  let alphaChart = null;
  let currentSymbol = null;
  Charts.alpha = function (el, signals, onSelect) {
    if (!alphaChart) {
      alphaChart = echarts.init(el, null, { renderer: 'canvas' });
      alphaChart.on('click', p => {
        if (p.componentType === 'series' && p.name) { currentSymbol = p.name; onSelect(p.name); }
      });
    }
    if (!signals || !signals.length) return;
    const names = signals.map(s => s.label);
    const alpha = signals.map(s => +(s.alpha * 100).toFixed(2));
    const conf = signals.map(s => +(s.confidence * 100).toFixed(1));

    alphaChart.setOption({
      animationDuration: 380,
      animationDurationUpdate: 380,
      grid: { left: 6, right: 34, top: 22, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(34,211,238,0.06)' } },
        backgroundColor: 'rgba(6,13,24,0.94)',
        borderColor: 'rgba(34,211,238,0.35)',
        textStyle: { ...baseText, color: C.t1, fontSize: 10 },
        formatter(ps) {
          const s = signals[ps[0].dataIndex];
          return `<div style="color:#eafaff;margin-bottom:3px">${s.label} · ${s.action}</div>
            <div>α 得分 <b style="color:${s.alpha >= 0 ? C.up : C.dn}">${(s.alpha * 100).toFixed(2)}</b></div>
            <div>置信度 ${(s.confidence * 100).toFixed(0)}%</div>
            <div style="color:#5d7590;max-width:220px;white-space:normal;line-height:1.4;margin-top:2px">${s.reason}</div>`;
        },
      },
      xAxis: {
        type: 'value',
        min: -55, max: 55,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { ...baseText, color: C.t3, formatter: v => v },
        splitLine: { lineStyle: { color: 'rgba(86,206,255,0.05)' } },
      },
      yAxis: {
        type: 'category',
        data: names,
        inverse: true,
        axisLine: { lineStyle: { color: 'rgba(86,206,255,0.14)' } },
        axisTick: { show: false },
        axisLabel: { ...baseText, color: C.t1, fontSize: 10, margin: 8 },
      },
      series: [
        {
          name: 'α',
          type: 'bar',
          data: alpha.map((v, i) => ({
            value: Math.abs(v),
            raw: v,
            itemStyle: { color: v >= 0 ? C.up : C.dn, opacity: 0.82 },
          })),
          barWidth: 9,
          label: {
            show: true,
            position: 'right',
            ...baseText, fontSize: 9, color: C.t1,
            formatter: p => (p.data.raw >= 0 ? '+' : '') + p.data.raw.toFixed(1),
          },
          markLine: {
            silent: true, symbol: 'none',
            data: [{ xAxis: 16 }, { xAxis: -16 }],
            lineStyle: { color: 'rgba(251,191,36,0.45)', type: 'dashed', width: 1 },
            label: { show: false },
          },
        },
      ],
    }, false);

    // 用堆叠负值技巧实现左右分离
    alphaChart.setOption({
      series: [{
        name: 'α',
        type: 'bar',
        data: alpha.map((v, i) => ({
          value: v,
          raw: v,
          itemStyle: { color: v >= 0 ? C.up : C.dn, opacity: 0.85, borderRadius: v >= 0 ? [0, 2, 2, 0] : [2, 0, 0, 2] },
        })),
        barWidth: 9,
        label: {
          show: true,
          ...baseText, fontSize: 9, color: C.t1,
          formatter: p => (p.data.raw >= 0 ? '+' : '') + p.data.raw.toFixed(1),
        },
        markLine: {
          silent: true, symbol: 'none', animation: false,
          data: [{ xAxis: 16 }, { xAxis: -16 }, { xAxis: 0, lineStyle: { color: 'rgba(165,193,216,0.3)' } }],
          lineStyle: { color: 'rgba(251,191,36,0.4)', type: 'dashed', width: 1 },
          label: { show: false },
        },
        markArea: { silent: true, data: [] },
      }, {
        name: '置信度',
        type: 'scatter',
        data: conf.map((c, i) => [0, i, c]),
        symbolSize: 4,
        itemStyle: { color: 'rgba(34,211,238,0.85)', shadowColor: C.cy, shadowBlur: 6 },
        tooltip: { show: false },
      }],
    });
  };

  // ─────────── 因子热力矩阵 ───────────
  let factorChart = null;
  Charts.factorHeat = function (el, signals) {
    if (!factorChart) factorChart = echarts.init(el, null, { renderer: 'canvas' });
    if (!signals || !signals.length) return;
    const factors = signals[0].factors.map(f => f.cn);
    const rows = signals.map(s => s.label);
    const cells = [];
    signals.forEach((s, y) => s.factors.forEach((f, x) => {
      cells.push([x, rows.length - 1 - y, +f.score.toFixed(3)]);
    }));
    factorChart.setOption({
      animation: false,
      grid: { left: 4, right: 8, top: 22, bottom: 4, containLabel: true },
      tooltip: {
        backgroundColor: 'rgba(6,13,24,0.95)',
        borderColor: 'rgba(34,211,238,0.35)',
        textStyle: { ...baseText, color: C.t1, fontSize: 10 },
        formatter: p => {
          const s = signals[rows.length - 1 - p.data[1]];
          const f = s.factors[p.data[0]];
          return `<div style="color:#eafaff">${s.label} · ${f.cn}</div>
            <div>得分 <b style="color:${f.score >= 0 ? C.up : C.dn}">${f.score.toFixed(3)}</b> ｜ 权重 ${(f.weight * 100).toFixed(0)}%</div>
            <div style="color:#5d7590;max-width:200px;white-space:normal">${f.detail}</div>`;
        },
      },
      xAxis: {
        type: 'category', data: factors, position: 'top',
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { ...baseText, color: C.t2, fontSize: 9 },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category', data: [...rows].reverse(),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { ...baseText, color: C.t1, fontSize: 9 },
      },
      visualMap: {
        min: -1, max: 1,
        calculable: false, orient: 'horizontal',
        left: 'center', bottom: 0, itemWidth: 8, itemHeight: 52,
        inRange: {
          color: ['#0f9c72', '#124a52', '#0b1220', '#5c2430', '#ff4d5e'],
        },
        textStyle: { ...baseText, color: C.t3, fontSize: 8 },
        text: ['+1', '-1'],
      },
      series: [{
        type: 'heatmap',
        data: cells,
        itemStyle: { borderColor: 'rgba(4,7,14,0.85)', borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: C.cy, borderWidth: 1, shadowBlur: 8, shadowColor: C.cy } },
        progressive: 0,
      }],
    }, true);
  };

  // ─────────── 因子雷达（选中标的） ───────────
  Charts.factorRadar = function (el, signal) {
    if (!factorChart) factorChart = echarts.init(el, null, { renderer: 'canvas' });
    if (!signal) return;
    const fs = signal.factors;
    factorChart.setOption({
      animationDuration: 350,
      tooltip: {
        backgroundColor: 'rgba(6,13,24,0.95)',
        borderColor: 'rgba(34,211,238,0.35)',
        textStyle: { ...baseText, color: C.t1, fontSize: 10 },
      },
      radar: {
        center: ['50%', '54%'],
        radius: '66%',
        indicator: fs.map(f => ({ name: f.cn, max: 1, min: -1 })),
        axisName: { ...baseText, color: C.t2, fontSize: 9 },
        splitLine: { lineStyle: { color: 'rgba(86,206,255,0.12)' } },
        splitArea: { areaStyle: { color: ['rgba(34,211,238,0.02)', 'rgba(34,211,238,0.05)'] } },
        axisLine: { lineStyle: { color: 'rgba(86,206,255,0.12)' } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: fs.map(f => +f.score.toFixed(3)),
          name: signal.label,
          areaStyle: { color: 'rgba(34,211,238,0.16)' },
          lineStyle: { color: C.cy, width: 1.5, shadowColor: C.cy, shadowBlur: 8 },
          itemStyle: { color: C.cy, borderColor: '#04070e', borderWidth: 1 },
          symbolSize: 3,
        }],
      }],
    }, true);
  };

  Charts.resize = function () {
    [eqChart, alphaChart, factorChart].forEach(c => c && c.resize());
  };

  window.Charts = Charts;
  window.CHART_COLORS = C;
})();
