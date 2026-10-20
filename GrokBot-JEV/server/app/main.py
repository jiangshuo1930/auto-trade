"""FastAPI 应用：静态前端 + /ws 实时推送 + REST 快照
   启动： python server/run.py  →  http://127.0.0.1:8788
"""
import asyncio, time, random, logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import WEB_DIR, PRIMARY, TICK_MS, HISTORY
from . import db
from .feed import MarketFeed
from .jev import JevEngine
from .portfolio import PaperBroker
from .hub import hub

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("main")

feed = MarketFeed()
broker = PaperBroker()
engine = JevEngine(feed)
STATE = {"lat": 9, "load": 74.4, "source": "synth", "day": 15, "started": time.time()}


def snapshot():
    cs = feed.candles[-HISTORY:]
    return {
        "candles": cs,
        "sym": feed.sym.replace("-", "/"),
        "px": round(feed.price, 4),
        "equity": broker.snapshot(feed.price),
        "agents": engine.agent_states(),
        "decisions": list(reversed(db.recent("decisions", 26))),
        "fills": list(reversed(db.recent("fills", 26))),
        "meta": {**STATE, "signals": engine.signals, "risk": engine.risk_level,
                 "db": db.stats(), "seq": hub.seq},
    }


async def pump():
    """主推送循环：tick → 决策 → 状态，全部走 hub 广播"""
    while True:
        await asyncio.sleep(TICK_MS / 1000)
        STATE["lat"] = max(4, round(random.gauss(9, 2)))
        STATE["load"] = max(38, min(98, STATE["load"] + random.uniform(-3, 3)))
        await hub.broadcast("tick", {
            "px": round(feed.price, 4),
            "candle": feed.candles[-1],
            "equity": broker.snapshot(feed.price),
            "meta": {**STATE, "signals": engine.signals, "risk": engine.risk_level},
        })
        # 决策注入（JEV / Grok）
        if random.random() < 0.55:
            d = engine.decide()
            if d:
                d["ts"] = int(time.time() * 1000)
                db.save_decision(d)
                await hub.broadcast("decision", d)
                f = broker.try_fill(d, feed.price)
                if f:
                    await hub.broadcast("fill", f)
                    db.save_equity(f["equity"])
        # Agent 状态
        if hub.seq % 6 == 0:
            await hub.broadcast("agents", engine.agent_states())


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    await feed.bootstrap()
    STATE["source"] = feed.source
    broker.warmup(feed.price)
    broker.mark(feed.price)
    task = asyncio.create_task(pump())
    log.info("engine started source=%s px=%.3f", feed.source, feed.price)
    yield
    task.cancel()


app = FastAPI(title="GROKBOT + JEV", lifespan=lifespan)


@app.get("/api/state")
async def api_state():
    return snapshot()


@app.get("/api/health")
async def health():
    return {"ok": True, "source": feed.source, "px": feed.price, "clients": len(hub.clients),
            "db": db.stats(), "uptime": round(time.time() - STATE["started"])}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    await hub.send(ws, "snapshot", snapshot())
    try:
        while True:
            await ws.receive_text()             # 心跳 / 控制指令（预留）
    except WebSocketDisconnect:
        hub.disconnect(ws)
    except Exception:
        hub.disconnect(ws)


@app.get("/")
async def index():
    return FileResponse(WEB_DIR / "index.html")


app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="static")
