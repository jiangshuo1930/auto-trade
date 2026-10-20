/* 数值格式化工具 */
(function () {
  'use strict';

  const nf = (v, d = 2) => Number(v).toLocaleString('en-US', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

  window.FMT = {
    money(v, d = 2) {
      if (!isFinite(v)) return '—';
      return (v < 0 ? '-$' : '$') + nf(Math.abs(v), d);
    },
    plain(v, d = 2) {
      if (!isFinite(v)) return '—';
      return nf(v, d);
    },
    signed(v, d = 2) {
      if (!isFinite(v)) return '—';
      return (v >= 0 ? '+' : '') + nf(v, d);
    },
    pct(v, d = 2) {
      if (!isFinite(v)) return '—';
      return (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
    },
    /** 自适应价格精度：大数 2 位，小币种更多位 */
    price(v) {
      if (!isFinite(v)) return '—';
      if (v >= 1000) return nf(v, 2);
      if (v >= 10) return nf(v, 3);
      if (v >= 1) return nf(v, 4);
      return nf(v, 5);
    },
    qty(v) {
      if (!isFinite(v)) return '—';
      const a = Math.abs(v);
      if (a >= 100) return nf(v, 2);
      if (a >= 1) return nf(v, 4);
      return nf(v, 6);
    },
    compact(v) {
      if (!isFinite(v)) return '—';
      const a = Math.abs(v);
      if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
      if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
      if (a >= 1e3) return (v / 1e3).toFixed(2) + 'K';
      return nf(v, 1);
    },
    clock(ts) {
      const d = new Date(ts * 1000);
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },
    hms(sec) {
      const s = Math.floor(sec);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    },
    /** 高亮事件文本中的数字与标的代码 */
    highlight(text) {
      return String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/([A-Z]{2,10}USDT|[\d,]+\.?\d*%?)/g, '<em>$1</em>');
    },
  };
})();
