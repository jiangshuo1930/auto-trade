"""FastAPI 应用入口：REST + WebSocket 推送 + 静态前端托管。"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import SYMBOL_LABEL, settings
from .data.feed import MarketFeed
from .engine.agent import TradingAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)-12s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("qno")

WEB_DIR = Path(__file__).resolve().parents[2] / "web"

feed = MarketFeed()
agent = TradingAgent(feed)


class Hub:
    """WebSocket 广播中心：单连接断开不影响其他客户端。"""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.dropped = 0

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)
        log.info("客户端接入，当前 %d 个", len(self.clients))

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def broadcast(self, payload: dict) -> None:
        if not self.clients:
            return
        text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)
            self.dropped += 1


hub = Hub()


async def _pusher() -> None:
    """按固定频率把最新快照推给所有客户端。"""
    interval = 1.0 / max(settings.push_hz, 1.0)
    while True:
        t0 = time.perf_counter()
        try:
            if hub.clients:
                await hub.broadcast(agent.snapshot())
        except Exception:  # noqa: BLE001
            log.exception("推送异常")
        await asyncio.sleep(max(0.0, interval - (time.perf_counter() - t0)))


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    await feed.start()
    await agent.start()
    pusher = asyncio.create_task(_pusher(), name="ws-pusher")
    log.info("服务就绪 → http://%s:%d", settings.host, settings.port)
    try:
        yield
    finally:
        pusher.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await pusher
        await agent.stop()
        await feed.stop()


app = FastAPI(title="Quant Neural Ops", version="1.0.0", lifespan=lifespan)


# ---------------- REST ----------------
@app.get("/api/health")
async def health() -> dict:
    return {
        "ok": True,
        "feedConnected": feed.connected,
        "synthetic": feed.synthetic,
        "clients": len(hub.clients),
        "cycles": agent.cycles,
        "uptime": round(time.time() - agent.started_at, 1),
    }


@app.get("/api/snapshot")
async def snapshot() -> JSONResponse:
    return JSONResponse(agent.snapshot())


@app.get("/api/symbols")
async def symbols() -> dict:
    return {"symbols": [{"symbol": s, "label": SYMBOL_LABEL.get(s, s)} for s in settings.symbols]}


@app.get("/api/candles/{symbol}")
async def candles(symbol: str, limit: int = 200) -> JSONResponse:
    st = feed.states.get(symbol.upper())
    if not st:
        return JSONResponse({"error": "unknown symbol"}, status_code=404)
    data = [[c.ts, c.open, c.high, c.low, c.close, c.volume] for c in list(st.candles)[-limit:]]
    return JSONResponse({"symbol": symbol.upper(), "interval": settings.kline_interval, "candles": data})


# ---------------- WebSocket ----------------
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await hub.connect(ws)
    try:
        await ws.send_text(json.dumps(agent.snapshot(), ensure_ascii=False))
        while True:
            # 客户端心跳/指令通道（当前仅用于保活）
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(ws)
    except Exception:  # noqa: BLE001
        hub.disconnect(ws)


# ---------------- 静态前端 ----------------
if WEB_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")
