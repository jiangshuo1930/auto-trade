/* ═══════════════ app.js · Vue 3 应用 + WebSocket 实时链路 ═══════════════
   链路：Python 后端 → WS 归一化消息 → 单一 Store → 各可视化组件
         （组件不直连 WS，保证数据一致性；断线自动重连，失败降级本地模拟） */

'use strict';

const AGENTS = [
  { id:'chief',   name:'CHIEF',   icon:'👑', color:'#f2f2f7', role:'PORTFOLIO COMMAND', sub:'sync 24/7 wall' },
  { id:'scan',    name:'SCAN',    icon:'📡', color:'#00ff9d', role:'ALT SCANNER',       sub:'scanned 1790 alts' },
  { id:'vet',     name:'VET',     icon:'🧠', color:'#4d8dff', role:'DEEP RESEARCH',     sub:'Grok 4:20 (DeepSearch)' },
  { id:'social',  name:'SOCIAL',  icon:'🔥', color:'#ff7a45', role:'SENTIMENT FEED',    sub:'socials feed sweep' },
  { id:'size',    name:'SIZE',    icon:'🧮', color:'#e8e2f2', role:'POSITION SIZING',   sub:'kelly × 0.6' },
  { id:'fills',   name:'FILLS',   icon:'⚡', color:'#00ff9d', role:'EXECUTION DESK',    sub:'+9259 today' },
  { id:'risk',    name:'RISK',    icon:'🛡️', color:'#ff4d4d', role:'RISK GATE',         sub:'risk vault · 4/4' },
  { id:'crawler', name:'CRAWLER', icon:'🕷️', color:'#ff9f43', role:'ON-CHAIN CRAWLER',  sub:'crawled alt socials' },
];

const TICKS = [
  'BUY PILLS, SELL VIBES', 'SOL - SVNE', '<b>74.4%</b> WIN RATE 15D', 'GROK BRAIN ONLINE',
  'CRAWLER FOUND <i>2,845</i> MEMPOOL TXS', 'RISK GATE <b>4/4</b> PASS', '<i>PAPER MODE</i> · SQLITE PERSIST',
  'FILLS DESK <b>+9259</b> TODAY', 'NEW PAIR SNIFFED ON RAYDIUM', 'JEV ENGINE <b>V4.2</b> · LAT 9ms',
];

/* ══════════ WebSocket 客户端（自动重连 + 本地降级） ══════════ */
class Link {
  constructor(handlers){ this.h = handlers; this.ws = null; this.tries = 0; this.retry = null; this.mode = 'down'; }
  url(){ return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; }
  connect(){
    this.h.onStatus({ label:'CONNECTING', cls:'mock', msg:'connecting to python ws' });
    try { this.ws = new WebSocket(this.url()); } catch(e){ this.fail(); return; }
    this.ws.onopen = () => {
      this.tries = 0;
      this.h.onStatus({ label:'WS LIVE', cls:'live', msg:'python backend stream' });
    };
    this.ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch(e){ return; }
      this.h.onMsg(m);
    };
    this.ws.onclose = () => this.fail();
    this.ws.onerror = () => { try{ this.ws.close(); }catch(e){} };
  }
  fail(){
    this.tries++;
    this.ws = null;
    if(this.tries >= 3){
      this.h.onStatus({ label:'LOCAL SIM', cls:'mock', msg:'backend offline → local simulator' });
      if(!this.sim){ this.sim = new LocalSim(this.h); this.sim.start(); }
      return;
    }
    this.h.onStatus({ label:'RECONNECT', cls:'down', msg:'retry #' + this.tries });
    clearTimeout(this.retry);
    this.retry = setTimeout(()=>this.connect(), 1500 * this.tries);
  }
}

/* ══════════ 本地模拟器（后端未启动时保持界面鲜活） ══════════ */
class LocalSim {
  constructor(h){ this.h = h; this.sym = 'SOL/USDT'; }
  rnd(a){ return a[Math.floor(Math.random()*a.length)]; }
  start(){
    const n = 150, now = Date.now();
    let px = 148.6;
    const candles = [];
    for(let i=n; i>0; i--){
      const drift = Math.sin(i/14)*1.1 + (Math.random()-0.47)*2.6;
      const o = px, c = px*(1+(Math.random()-0.5)/160);
      candles.push({ t: now - i*60000, o, h: Math.max(o,c)*(1+Math.random()/240),
                     l: Math.min(o,c)*(1-Math.random()/240), c, v: .4+Math.random()*1.7 });
      px = c;
    }
    let eq = 41200;
    const curve = Array.from({length:170}, (_,i)=>{ eq += (Math.random()-.42)*420 + (i>120 ? 260 : 0); return eq; });
    curve[curve.length-1] = 74698.82;

    const agents = {};
    AGENTS.forEach(a => agents[a.name] = { phase:'IDLE', text:'', t:0 });

    this.h.onMsg({ type:'snapshot', data:{
      candles, sym:this.sym, px, agents,
      equity:{ equity:74698.82, start:41200, curve, pos:0, cash:74698.82, avg_px:0, realized:0, unrealized:0 },
      decisions:[], fills:[],
      meta:{ lat:9, load:74.4, source:'local', day:15, signals:259, risk:'NORMAL', db:{ticks:0,decisions:0,fills:0} },
    }});

    this.timer = setInterval(()=>{
      const last = candles[candles.length-1];
      last.c = Math.max(1, last.c*(1+(Math.random()-.5)/260));
      last.h = Math.max(last.h, last.c); last.l = Math.min(last.l, last.c);
      eq = Math.max(eq*0.98, 74698.82 + Math.sin(Date.now()/9000)*140 + (Math.random()-.5)*120);
      curve.push(eq); if(curve.length>240) curve.shift();
      this.h.onMsg({ type:'tick', data:{ px:last.c, candle:last, equity:{ equity:eq, start:41200, curve, pos:0, cash:eq },
        meta:{ lat:Math.round(6+Math.random()*8), load:40+Math.random()*50, source:'local', day:15, signals:259+Math.floor(Math.random()*9) } }});
      if(Math.random() < .55){
        const d = { bot:this.rnd(AGENTS).name, sym:this.sym,
          act: Math.random()<.45?'BUY':(Math.random()<.7?'SELL':'HOLD'),
          conf:+(54+Math.random()*42).toFixed(1), size:(.4+Math.random()*4).toFixed(2)+'M',
          reason:'local sim', px:last.c, ts:Date.now(), signals:259, risk:'NORMAL' };
        this.h.onMsg({ type:'decision', data:d });
        if(d.act!=='HOLD' && Math.random()<.5){
          this.h.onMsg({ type:'fill', data:{ sym:d.sym, side:d.act, qty:+(10+Math.random()*300).toFixed(1),
            px:+(last.c*(1+(Math.random()-.5)/300)).toFixed(3), fee:1.2,
            pnl:+((Math.random()*8)-2.6).toFixed(2), ts:Date.now() }});
        }
      }
      if(Math.random()<.4){
        const a = this.rnd(AGENTS);
        agents[a.name] = { phase:'TYPING', text: this.rnd([
          'scanning 1,790 alts on SOL','deep-searching tokenomics','sweeping CT heatmap',
          'kelly sizing $BONK 2.1M','slicing TWAP over 40 ticks','VaR 1.1% / limit 2.0% ✓',
          'crawling 2,845 mempool txs','rebalancing sleeve weights' ]), t:Date.now() };
        this.h.onMsg({ type:'agents', data: agents });
        setTimeout(()=>{ agents[a.name] = { phase:'DONE', text:agents[a.name].text, t:Date.now() };
          this.h.onMsg({ type:'agents', data: agents }); }, 2200);
      }
    }, 620);
  }
}

/* ══════════ Vue 应用 ══════════ */
Vue.createApp({
  data(){
    return {
      AGENTS,
      candles: [], equity: { equity: 0, start: 50000, curve: [] },
      agentStates: {}, meta: { lat:0, load:0, source:'—', day:15, signals:0, sym:'SOL/USDT', risk:'NORMAL', db:{ticks:0,decisions:0,fills:0} },
      logs: [], lastInd: null, marks: [],
      pulse: {}, typedMap: {}, tip: { show:false, x:0, y:0, id:'', name:'', icon:'', role:'', phase:'', text:'', color:'#ff2d78' },
      linkState: { label:'BOOT', cls:'mock', msg:'' },
      clock: '--:--:-- UTC', sessionLabel: 'SESSION --:--', fillPnl: 0, logSeq: 0,
    };
  },
  computed: {
    tickerHtml(){
      const one = TICKS.map(t => `<span>✦ ${t}</span>`).join('');
      return one + one;
    },
    sourceLabel(){
      const s = this.meta.source;
      return s === 'binance' ? 'BINANCE · 1m LIVE'
           : s === 'yahoo'   ? 'YAHOO · 1m'
           : s === 'local'   ? 'LOCAL SIM'
           : 'SYNTH FEED';
    },
    cards(){
      const f = this.agentStates;
      const tickCount = (this.meta.db && this.meta.db.ticks) || 0;
      const vals = {
        chief:  { value:'PITCH = QPRS', unit:'' },
        scan:   { value:(0.4 + Math.abs(Math.sin(Date.now()/7000))*0.3).toFixed(2), unit:'HIT RATE' },
        vet:    { value:'GROK 4:20', unit:'MODEL' },
        social: { value:(0.3 + Math.abs(Math.cos(Date.now()/9000))*0.4).toFixed(2), unit:'SENTIMENT' },
        size:   { value:'$6,124', unit:'KELLY ×0.6' },
        fills:  { value:'CHT 2.33M', unit:(this.fillPnl>=0?'+':'') + this.fillPnl.toFixed(0) },
        risk:   { value:'VAR ' + (this.meta.risk === 'HIGH' ? '2.4' : '1.1'), unit:this.meta.risk === 'HIGH' ? 'GATE HOLD' : '4/4 PASS' },
        crawler:{ value:tickCount.toLocaleString(), unit:'TICKS' },
      };
      return AGENTS.map(a => ({ ...a, ...(vals[a.id] || { value:'—', unit:'' }) }));
    },
    balanceSub(){
      const e = this.equity;
      const pnl = (e.realized || 0) + (e.unrealized || 0);
      return `POS ${(e.pos||0).toFixed(2)} · PNL ${pnl>=0?'+':''}${pnl.toFixed(2)} · WINRATE 68.4%`;
    },
    indicators(){
      const i = this.lastInd || { rsi:58.2, atr_pct:1.52, mom:0.84, vol_z:1.1, ema_fast:0, ema_slow:0 };
      return [
        { k:'CHOP', v:(i.atr_pct*40).toFixed(2), cls:'' },
        { k:'RSI 14', v:i.rsi.toFixed(1), cls:i.rsi>60?'up':(i.rsi<40?'dn':'') },
        { k:'MOM', v:(i.mom>=0?'+':'')+i.mom.toFixed(2)+'%', cls:i.mom>=0?'up':'dn' },
        { k:'ATR%', v:i.atr_pct.toFixed(2), cls:'' },
        { k:'VOL Z', v:i.vol_z.toFixed(2), cls:i.vol_z>0?'up':'dn' },
        { k:'EMA F', v:(i.ema_fast||0).toFixed(2), cls:'cy' },
        { k:'EMA S', v:(i.ema_slow||0).toFixed(2), cls:'cy' },
        { k:'SIGNALS', v:this.meta.signals, cls:'' },
        { k:'RISK', v:this.meta.risk, cls:this.meta.risk==='HIGH'?'dn':'up' },
      ];
    },
    params(){
      const e = this.equity, db = this.meta.db || { ticks: 0, fills: 0 };
      return [
        { k:'stg_massive_flip_sol_1m', v:'16,500', cls:'g' },
        { k:'sol_auctions_x25_sol_1m', v:'41,400', cls:'g' },
        { k:'sol_rugpull_24h',         v:'4,200',  cls:'p' },
        { k:'sol_raydisk_5m',          v:'0.05',   cls:'' },
        { k:'sol_vb_lamb_24h',         v:'8,125',  cls:'g' },
        { k:'x55_sol_lambda_sol_1m',   v:'18,524', cls:'g' },
        { k:'mempool_ingest_24h',      v:db.ticks.toLocaleString(), cls:'g' },
        { k:'kelly_clip_15d',          v:'$6,124', cls:'g' },
        { k:'paper_fills',             v:db.fills, cls:'g' },
      ];
    },
    uptimeLabel(){
      const s = Math.floor((Date.now() - this._t0) / 1000) + 15 * 86400 + 3600 + 241;
      const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
      return `${d}d ${h}h ${m}min ${s % 60}s`;
    },
  },
  methods: {
    st(id){ return this.agentStates[id] || { phase:'IDLE', text:'' }; },
    typed(id){ const n = this.typedMap[id] || 0; const t = this.st(id).text || ''; return t.slice(0, n); },
    usd(v){ return '$' + (v||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }); },

    /* ---- WS 消息归一化（唯一入口） ---- */
    handle(m){
      const d = m.data;
      if(m.type === 'snapshot'){
        this.candles = d.candles || [];
        this.equity = d.equity || this.equity;
        this.agentStates = d.agents || {};
        this.meta = { ...this.meta, ...(d.meta||{}), sym: d.sym };
        (d.decisions||[]).forEach(x => this.addLog(x.bot, this.decMsg(x), x.act));
        (d.fills||[]).forEach(x => this.addLog(x.bot||'FILLS', this.fillMsg(x), x.pnl>=0?'ok':'sell'));
      }
      else if(m.type === 'tick'){
        if(d.candle){
          const last = this.candles[this.candles.length-1];
          if(last && d.candle.t === last.t) Object.assign(last, d.candle);
          else this.candles.push({ ...d.candle });
          if(this.candles.length > 260) this.candles.shift();
        }
        this.equity = { ...this.equity, ...(d.equity||{}) };
        this.meta = { ...this.meta, ...(d.meta||{}) };
      }
      else if(m.type === 'decision') this.onDecision(d);
      else if(m.type === 'fill') this.onFill(d);
      else if(m.type === 'agents') this.agentStates = d;
    },
    onDecision(d){
      this.meta = { ...this.meta, signals: d.signals || this.meta.signals, risk: d.risk || this.meta.risk };
      if(d.ind) this.lastInd = d.ind;
      this.addLog(d.bot, this.decMsg(d), d.act === 'BUY' ? 'buy' : d.act === 'SELL' ? 'sell' : 'hold');
      // Agent 直接标注图表：找最近一根 K 线
      const idx = Math.max(0, this.candles.length - 1);
      this.marks.unshift({ act:d.act, idx });
      this.marks = this.marks.slice(0, 16);
    },
    onFill(f){
      this.fillPnl = (this.fillPnl||0) + (f.pnl||0);
      this.addLog('FILLS', this.fillMsg(f), f.pnl >= 0 ? 'ok' : 'sell');
      if(f.equity) this.equity = { ...this.equity, equity: f.equity };
    },
    decMsg(d){
      const cls = d.act === 'BUY' ? 'buy' : d.act === 'SELL' ? 'sell' : 'hold';
      return `<span class="${cls}">[${d.act}]</span> ${d.sym} conf <span class="ok">${d.conf}%</span> size ${d.size}` +
             (d.reason ? ` <span class="dim">· ${d.reason}</span>` : '');
    },
    fillMsg(f){
      const up = f.pnl >= 0;
      return `<span class="dim">FILL</span> ${f.side} ${f.qty} @ ${f.px} <span class="${up?'ok':'sell'}">${up?'+':''}${(f.pnl||0).toFixed(2)}</span>`;
    },
    addLog(bot, msg, cls){
      const now = new Date();
      const t = [now.getHours(), now.getMinutes(), now.getSeconds()].map(x=>String(x).padStart(2,'0')).join(':');
      this.logs = [{ id: ++this.logSeq, t, bot, msg, cls: cls === 'buy' ? 'buy' : cls === 'sell' ? 'sell' : (cls||'') }, ...this.logs].slice(0, 40);
    },
    tickClock(){
      const n = new Date();
      this.clock = [n.getUTCHours(), n.getUTCMinutes(), n.getUTCSeconds()].map(x=>String(x).padStart(2,'0')).join(':') + ' UTC';
      this.sessionLabel = 'SESSION ' + String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
    },
    fitStage(){
      const s = Math.min(innerWidth/1920, innerHeight/1080);
      document.getElementById('app').style.transform = `scale(${s})`;
    },
    onHover(bot){
      if(!bot){ this.tip.show = false; return; }
      const a = AGENTS.find(x=>x.id===bot.id), s = this.st(bot.id);
      this.tip = { show:true, x:bot.x+18, y:bot.y, id:bot.id, name:a.name, icon:a.icon,
                   role:a.role, phase:s.phase, text:s.text || 'standing by', color:a.color };
    },
  },
  mounted(){
    window.__vm = this;                       // 调试探针（不影响功能）
    this._t0 = Date.now();
    this.tickClock();
    setInterval(()=>this.tickClock(), 1000);
    this.fitStage();
    addEventListener('resize', ()=>this.fitStage());

    // 打字机
    setInterval(()=>{
      Object.entries(this.agentStates).forEach(([id, s])=>{
        if(s.phase === 'TYPING'){
          this.typedMap[id] = Math.min((this.typedMap[id]||0) + 2, (s.text||'').length);
        } else if(s.phase === 'IDLE'){ this.typedMap[id] = 0; }
        else { this.typedMap[id] = (s.text||'').length; }
      });
    }, 70);

    // 场景
    Scene3D.init(document.getElementById('sceneHost'), AGENTS, b => this.onHover(b));

    // WS
    const link = new Link({
      onMsg: m => this.handle(m),
      onStatus: s => { this.linkState = s; },
    });
    link.connect();

    // 图表循环
    const klineCv = document.getElementById('klineChart');
    const balCv = document.getElementById('balanceChart');
    let last = 0;
    const loop = t => {
      requestAnimationFrame(loop);
      if(t - last < 33) return;
      last = t;
      drawBalance(balCv, this.equity.curve || [],
        (this.equity.curve || []).map((_, i) => 0.25 + ((i * 7919) % 97) / 97));
      drawKline(klineCv, this.candles, this.marks);
      Scene3D.update({ candles: this.candles, agents: this.agentStates });
    };
    requestAnimationFrame(loop);
  },
}).mount('#app');
