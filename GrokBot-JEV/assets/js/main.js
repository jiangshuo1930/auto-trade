/* ═══════════════ main.js · 状态分发 + 交互 + 主循环 ═══════════════ */

'use strict';

/* ---------- scale-to-fit（1920×1080 设计稿） ---------- */
function fitStage(){
  const s = Math.min(innerWidth/1920, innerHeight/1080);
  document.getElementById('app').style.transform = `scale(${s})`;
}
addEventListener('resize', fitStage); fitStage();

/* ---------- 顶栏 ---------- */
const TICKS_HTML = (()=>{
  const arr = TICKS.concat(TICKS);
  return arr.map(t=>`<span>✦ ${t}</span>`).join('');
})();
document.getElementById('tickerTrack').innerHTML = TICKS_HTML + TICKS_HTML;

setInterval(()=>{
  const n = new Date();
  document.getElementById('utcClock').textContent =
    String(n.getUTCHours()).padStart(2,'0')+':'+String(n.getUTCMinutes()).padStart(2,'0')+':'+String(n.getUTCSeconds()).padStart(2,'0')+' UTC';
  document.getElementById('sceneClock').textContent = 'SESSION '+String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
},1000);

/* ---------- Agent 卡片 ---------- */
const cardsEl = document.getElementById('cards');
cardsEl.innerHTML = AGENTS.map((a,i)=>`
  <div class="acard ${a.wide?'wide':''}" id="card-${a.id}" style="--c:${a.color};--i:${i}">
    <div class="hd">
      <div class="ava">${a.icon}</div>
      <div><div class="nm">${a.name}</div><div class="rl">${a.role} · ${a.sub}</div></div>
    </div>
    <div class="val">${a.val}<small id="cv-${a.id}"></small></div>
    <div class="st" id="cs-${a.id}"><span class="idle">IDLE</span></div>
  </div>`).join('');

/* ---------- Bot 悬浮提示 ---------- */
const tip = document.getElementById('botTip');
let hoverBot = null;
const sceneCv = document.getElementById('scene');
sceneCv.addEventListener('mousemove', e=>{
  const r = sceneCv.getBoundingClientRect();
  const mx = e.clientX-r.left, my = e.clientY-r.top;
  let hit = null;
  for(const [id,s] of Object.entries(Scene.botScreens)){
    if((mx-s.x)**2 + (my-s.y)**2 < s.r*s.r){ hit = id; break; }
  }
  hoverBot = hit;
  if(hit){
    const a = AGENTS.find(x=>x.id===hit), st = agentState[hit];
    tip.style.display='block';
    tip.style.setProperty('--c', a.color);
    tip.style.left = Math.min(mx+18, 1690)+'px';
    tip.style.top  = Math.max(my-90, 6)+'px';
    tip.innerHTML = `<h4>${a.icon} ${a.name} · ${st.phase}</h4>
      <div class="row"><span>ROLE</span><b>${a.role}</b></div>
      <div class="row"><span>LOAD</span><b>${(st.phase!=='IDLE'?68+Math.random()*30:8+Math.random()*10).toFixed(1)}%</b></div>
      <div class="row"><span>STATUS</span><b>${st.text||'standing by'}</b></div>`;
    sceneCv.style.cursor='pointer';
  } else { tip.style.display='none'; sceneCv.style.cursor='crosshair'; }
});
sceneCv.addEventListener('mouseleave', ()=>{ tip.style.display='none'; hoverBot=null; });

/* ---------- 底部：指标读数 & 策略参数 ---------- */
const IND = [
  ['CHOP','61.71','cy'],['RSI 14','58.2','up'],['MACD','+0.84','up'],
  ['ATR','2.31',''],['BBW','7.4%','dn'],['VOL Δ','+18%','up'],
  ['FUNDING','0.0091%',''],['OI','2.33M','up'],['LIQ 24H','$4.1M','dn'],
];
document.getElementById('anaInd').innerHTML =
  IND.map(i=>`<div>${i[0]}<b class="${i[2]}">${i[1]}</b></div>`).join('');

const PARAMS = [
  ['mode','PAPER','p'],['venue','RAYDIUM+JUP',''],['max_pos','$6,124','g'],
  ['kelly','0.6',''],['slippage','4.2bps','g'],['stop','-1.8%','p'],
  ['tp','+4.5%','g'],['VaR limit','2.0%','p'],['uptime','15d 04h','g'],
];
document.getElementById('stratParams').innerHTML =
  PARAMS.map(p=>`<div>${p[0]}<b class="${p[2]}">${p[1]}</b></div>`).join('');

/* ---------- 决策日志流 ---------- */
const logEl = document.getElementById('stratLog');
function logLine(cls, html){
  const d = new Date();
  const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  const div = document.createElement('div');
  div.className = 'ln';
  div.innerHTML = `<span class="t">${t}</span> <span class="bot">${cls}</span> ${html}`;
  logEl.prepend(div);
  while(logEl.children.length > 40) logEl.lastChild.remove();
}

/* ---------- 事件订阅（等价 WS 推送分发） ---------- */
bus.on('decision', d=>{
  const cls = d.act==='BUY'?'buy':d.act==='SELL'?'sell':'hold';
  logLine(d.bot, `<span class="${cls}">[${d.act}]</span> ${d.sym} conf <span class="ok">${d.conf}%</span> size ${d.size}`);
  document.getElementById('anaCount').textContent = store.signals + ' SIGNALS';
});
bus.on('fill', f=>{
  const up = f.pnl>=0;
  logLine(f.bot, `<span class="dim">FILL</span> ${f.side} ${f.qty} @ ${f.px} <span class="${up?'ok':'sell'}">${up?'+':''}${f.pnl.toFixed(2)}%</span>`);
});
bus.on('tick', ()=>{
  document.getElementById('latVal').textContent = store.lat+'ms';
  document.getElementById('loadFill').style.width = store.load.toFixed(0)+'%';
  document.getElementById('bpEquity').textContent = '$'+store.balance[store.balance.length-1].toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('bpMeta').textContent = `APY 214% · WINRATE 68.4% · DAY ${store.day}`;
  // 卡片状态
  AGENTS.forEach(a=>{
    const st = agentState[a.id], card = document.getElementById('card-'+a.id);
    card.classList.toggle('live', st.phase!=='IDLE');
    const el = document.getElementById('cs-'+a.id);
    if(st.phase==='IDLE'){ el.innerHTML = '<span class="idle" style="color:var(--dim)">IDLE · standby</span>'; }
    else if(st.phase==='TYPING'){
      el.innerHTML = `<b>${st.text.slice(0, st.typing)}</b><span class="cursor"></span>`;
    } else {
      el.innerHTML = `<b>✓ ${st.text}</b>`;
    }
  });
});
bus.on('slow', ()=>{});

/* ---------- 决策 → K 线标记缓存 ---------- */
let kMarks = [];
bus.on('decision', d=>{
  kMarks.push({ act:d.act, age:0, sym:d.sym });
  kMarks = kMarks.slice(-20);
});
bus.on('tick', ()=>{ kMarks.forEach(m=>m.age++); });

/* ---------- 主循环 ---------- */
let last = 0;
function loop(t){
  requestAnimationFrame(loop);
  if(t - last < 33) return;          // ~30fps
  last = t;
  Scene.draw(t);
  drawBalance(document.getElementById('balanceChart'));
  drawKline(document.getElementById('klineChart'), kMarks);
}

/* ---------- 启动 ---------- */
MockFeed.start();
Scene.init();
// 预填日志
for(let i=0;i<8;i++) pushDecision();
requestAnimationFrame(loop);
