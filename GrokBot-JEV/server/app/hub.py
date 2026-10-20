"""WebSocket Hub：连接管理 + 归一化广播（前端只订阅这里，不各自连源）"""
import json, asyncio, logging
from fastapi import WebSocket

log = logging.getLogger("hub")

class Hub:
    def __init__(self):
        self.clients: set[WebSocket] = set()
        self.seq = 0

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.add(ws)
        log.info("client connected, total=%d", len(self.clients))

    def disconnect(self, ws: WebSocket):
        self.clients.discard(ws)

    async def broadcast(self, type_: str, data):
        self.seq += 1
        msg = json.dumps({"type": type_, "seq": self.seq, "ts": asyncio.get_event_loop().time(), "data": data},
                         ensure_ascii=False, default=str)
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send(self, ws: WebSocket, type_: str, data):
        await ws.send_text(json.dumps({"type": type_, "data": data}, ensure_ascii=False, default=str))

hub = Hub()
