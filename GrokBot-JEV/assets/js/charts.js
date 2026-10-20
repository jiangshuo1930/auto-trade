/* ═══════════════ charts.js · Canvas2D 高刷图表（K线 / 资产曲线） ═══════════════ */
'use strict';

const C2D = {
  fit(cv){
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if(!r.width || !r.height) return null;
    if(cv.width !== Math.round(r.width*dpr) || cv.height !== Math.round(r.height*dpr)){
      cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx, w:r.width, h:r.height};
  },
  glow(ctx, color, blur){ ctx.shadowColor = color; ctx.shadowBlur = blur; },
  unglow(ctx){ ctx.shadowBlur = 0; }
};

/* ---------- K 线 + 均线 + 成交量 + Agent 信号标记 ---------- */
function drawKline(cv, candles, marks){
  const f = C2D.fit(cv); if(!f || !candles || candles.length < 3) return;
  const {ctx, w, h} = f;
  const cs = candles.slice(-120), n = cs.length;
  const volH = h*0.20, padT = 8, padR = 58;
  const ch = h - volH - padT - 4, cw = w - padR;
  const lo = Math.min(...cs.map(c=>c.l)), hi = Math.max(...cs.map(c=>c.h));
  const pad = (hi-lo)*0.08;
  const Y = p => padT + ch - (p-lo+pad)/(hi-lo+pad*2)*ch;
  const BW = cw/n;

  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = 'rgba(255,45,120,.10)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for(let i=1;i<5;i++){ const y = padT+ch*i/5; ctx.moveTo(0,y); ctx.lineTo(cw,y); }
  ctx.stroke();

  // 量
  const vmax = Math.max(...cs.map(c=>c.v)) || 1;
  cs.forEach((c,i)=>{
    const vh = (c.v/vmax)*volH*0.92;
    ctx.fillStyle = c.c>=c.o ? 'rgba(0,255,157,.30)' : 'rgba(255,45,120,.30)';
    ctx.fillRect(i*BW+0.5, h-4-vh, Math.max(1, BW-1.2), vh);
  });

  // 均线
  const ma = p => { const out=[]; let s=0;
    cs.forEach((c,i)=>{ s += c.c; if(i>=p){ out.push(s/p); s -= cs[i-p].c; } else out.push(null); });
    return out; };
  const line = (arr,color)=>{ ctx.strokeStyle=color; ctx.lineWidth=1.2; ctx.beginPath(); let mv=false;
    arr.forEach((v,i)=>{ if(v==null){mv=false;return;} const x=i*BW+BW/2, y=Y(v);
      mv?ctx.lineTo(x,y):(ctx.moveTo(x,y),mv=true); }); ctx.stroke(); };
  line(ma(12), 'rgba(37,211,240,.75)');
  line(ma(34), 'rgba(255,209,102,.65)');

  // 蜡烛
  cs.forEach((c,i)=>{
    const up = c.c>=c.o, x = i*BW + BW/2;
    ctx.strokeStyle = ctx.fillStyle = up ? '#00ff9d' : '#ff2d78';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
    const yo=Y(c.o), yc=Y(c.c), bw2 = Math.max(1.4, BW*0.62);
    ctx.fillRect(x-bw2/2, Math.min(yo,yc), bw2, Math.max(1.2, Math.abs(yc-yo)));
  });

  // Agent 信号标记（Agent 直接操作图表）
  (marks||[]).slice(0,16).forEach(m=>{
    if(m.idx == null || m.idx < 0 || m.idx >= n) return;
    const i = m.idx, x = i*BW+BW/2, buy = m.act==='BUY';
    const y = buy ? Y(cs[i].l)+12 : Y(cs[i].h)-12;
    ctx.fillStyle = buy ? '#00ff9d' : (m.act==='SELL' ? '#ff2d78' : '#ffd166');
    C2D.glow(ctx, ctx.fillStyle, 7);
    ctx.beginPath();
    ctx.moveTo(x, y + (buy?-5:5));
    ctx.lineTo(x-4.5, y + (buy?4:-4));
    ctx.lineTo(x+4.5, y + (buy?4:-4));
    ctx.closePath(); ctx.fill(); C2D.unglow(ctx);
  });

  // 最新价
  const lc = cs[n-1].c, ly = Y(lc);
  ctx.strokeStyle = 'rgba(0,255,157,.5)'; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(0,ly); ctx.lineTo(cw,ly); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#00ff9d'; ctx.fillRect(cw+2, ly-8, padR-6, 16);
  ctx.fillStyle = '#04140c'; ctx.font = 'bold 10px Consolas,monospace';
  ctx.fillText(lc.toFixed(2), cw+6, ly+3.5);
}

/* ---------- 资产曲线（呼吸辉光 + 量能） ---------- */
function drawBalance(cv, curve, vols){
  const f = C2D.fit(cv); if(!f || !curve || curve.length < 3) return;
  const {ctx, w, h} = f;
  const n = curve.length, volH = h*0.26, padT = 10;
  const ch = h - volH - padT - 4;
  const lo = Math.min(...curve)*0.998, hi = Math.max(...curve)*1.002;
  const X = i => i/(n-1)*w;
  const Y = v => padT + ch - (v-lo)/(hi-lo||1)*ch;

  ctx.clearRect(0,0,w,h);
  const vs = (vols && vols.length === n) ? vols : curve.map((_,i)=> 0.4+Math.abs(Math.sin(i/3)));
  const vmax = Math.max(...vs) || 1;
  vs.forEach((v,i)=>{
    const vh = v/vmax*volH;
    ctx.fillStyle = 'rgba(0,255,157,.20)';
    ctx.fillRect(X(i)-1.4, h-3-vh, 2.8, vh);
  });

  const grad = ctx.createLinearGradient(0,padT,0,padT+ch);
  grad.addColorStop(0,'rgba(0,255,157,.30)'); grad.addColorStop(1,'rgba(0,255,157,0)');
  ctx.beginPath(); ctx.moveTo(0,h-3);
  curve.forEach((v,i)=>ctx.lineTo(X(i),Y(v)));
  ctx.lineTo(w,h-3); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();

  ctx.strokeStyle='#00ff9d'; ctx.lineWidth=1.8;
  C2D.glow(ctx,'#00ff9d', 8 + Math.sin(Date.now()/500)*4);
  ctx.beginPath();
  curve.forEach((v,i)=> i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v)));
  ctx.stroke(); C2D.unglow(ctx);

  const ex = X(n-1), ey = Y(curve[n-1]);
  ctx.fillStyle='#eafff5'; C2D.glow(ctx,'#00ff9d',12);
  ctx.beginPath(); ctx.arc(ex-1,ey,3,0,7); ctx.fill(); C2D.unglow(ctx);
}
