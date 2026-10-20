/* ============================================================
   DATA — 模拟行情/因子/订单簿数据源
   ============================================================ */
(function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  const Assets = [
    { code: '000300.SH', name: '沪深300', base: 3842.6, chg: 0.82 },
    { code: '000905.SH', name: '中证500', base: 5718.4, chg: 1.36 },
    { code: '399006.SZ', name: '创业板指', base: 2104.7, chg: -0.47 },
    { code: '588000.SH', name: '科创50', base: 947.3, chg: 2.14 },
    { code: '512880.SH', name: '证券ETF', base: 1.284, chg: 0.63 },
    { code: 'AU2412', name: '沪金主连', base: 618.42, chg: 0.29 },
    { code: 'IF2412', name: 'IF 股指', base: 3864.2, chg: 0.91 },
    { code: 'RB2501', name: '螺纹钢', base: 3412, chg: -1.12 },
  ];

  const FactorGroups = ['动量', '价值', '质量', '情绪', '波动', '流动性', '宏观'];

  const Events = [
    { tp: 'SIG', tx: '<b>动量因子</b> 触发多头开仓' },
    { tp: 'RISK', tx: '组合 <b>Beta</b> 偏离阈值，自动降杠杆' },
    { tp: 'EXEC', tx: '拆单完成 <b>1,240</b> 手，滑点 0.3bp' },
    { tp: 'MODEL', tx: '注意力权重热更新 → <b>v4.2.7-rc3</b>' },
    { tp: 'SIG', tx: '<b>波动率</b> 因子转负，切换防御模式' },
    { tp: 'EXEC', tx: 'TWAP 执行中 <b>62%</b> 进度' },
    { tp: 'RISK', tx: '单票集中度 <b>8.4%</b> 接近上限' },
    { tp: 'MODEL', tx: 'LSTM 隐状态重置完成' },
    { tp: 'SIG', tx: '<b>资金流</b> 因子连续 3 期转正' },
    { tp: 'EXEC', tx: '限价单成交 <b>000905.SH</b> @5718.4' },
    { tp: 'RISK', tx: '回撤熔断线 <b>-6%</b> 未触发' },
    { tp: 'MODEL', tx: '在线学习样本 <b>12,840</b> 条入库' },
  ];

  window.DATA = {
    rnd, clamp, Assets, FactorGroups, Events,

    // 生成权益曲线
    equity(n = 180, start = 1.0) {
      const out = [];
      let v = start;
      for (let i = 0; i < n; i++) {
        v *= 1 + rnd(-0.006, 0.0088);
        out.push(+v.toFixed(4));
      }
      return out;
    },

    // 基准曲线（更低波动）
    benchmark(n = 180, start = 1.0) {
      const out = [];
      let v = start;
      for (let i = 0; i < n; i++) {
        v *= 1 + rnd(-0.0042, 0.0046);
        out.push(+v.toFixed(4));
      }
      return out;
    },

    // 订单簿深度
    orderbook(mid = 68420, depth = 26) {
      const bids = [], asks = [];
      let bp = mid, ap = mid;
      for (let i = 0; i < depth; i++) {
        bp -= rnd(4, 14);
        ap += rnd(4, 14);
        bids.push([+bp.toFixed(1), rnd(0.4, 8) * (1 + i * 0.14)]);
        asks.push([+ap.toFixed(1), rnd(0.4, 8) * (1 + i * 0.14)]);
      }
      return { bids, asks };
    },

    // 因子强度散点（x=IC 强度, y=稳定性, size=覆盖度）
    factorScatter() {
      const arr = [];
      FactorGroups.forEach((g, gi) => {
        for (let i = 0; i < 11; i++) {
          arr.push({
            g,
            v: [rnd(-0.14, 0.22), rnd(0.2, 0.96), rnd(8, 34), gi]
          });
        }
      });
      return arr;
    },
  };
})();
