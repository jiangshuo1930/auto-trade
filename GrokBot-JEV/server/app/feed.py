"""行情接入：Binance Vision 1m K 线（主）→ Yahoo Finance（备）→ 合成（兜底）
   生产环境可直接换成交易所 WS / 链上 RPC，接口不变。"""
import json, time, math, random, urllib.request, asyncio, logging
from . import db
from .config import SYMBOLS, PRIMARY, YAHOO, HTTP_TIMEOUT, HISTORY, CANDLE_SEC

log = logging.getLogger("feed")

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"}


def _get(url: str, timeout: float = HTTP_TIMEOUT):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def fetch_binance(sym: str, limit: int = 260) -> list[dict]:
    """Binance 公共行情镜像（免鉴权）：SOL-USD → SOLUSDT"""
    pair = sym.replace("-", "") + "T" if not sym.endswith("USDT") else sym
    url = f"https://data-api.binance.vision/api/v3/klines?symbol={pair}&interval=1m&limit={limit}"
    try:
        rows = _get(url)
        return [{"t": r[0], "o": float(r[1]), "h": float(r[2]), "l": float(r[3]),
                 "c": float(r[4]), "v": float(r[5]) / 1e6} for r in rows]
    except Exception as e:
        log.warning("binance fetch failed %s: %s", sym, e)
        return []


def fetch_candles_yahoo(sym: str, rng: str = "1d") -> list[dict]:
    """备用源：Yahoo 1m K 线（部分地区 403，失败自动落 synth）"""
    url = YAHOO.format(sym=sym).replace("range=1d", f"range={rng}")
    try:
        js = _get(url)
        res = js["chart"]["result"][0]
        q = res["indicators"]["quote"][0]
        out = []
        for i, ts in enumerate(res["timestamp"]):
            o, h, l, c, v = q["open"][i], q["high"][i], q["low"][i], q["close"][i], q["volume"][i]
            if None in (o, h, l, c):
                continue
            out.append({"t": ts * 1000, "o": o, "h": h, "l": l, "c": c, "v": (v or 0) / 1e6})
        return out[-260:]
    except Exception as e:
        log.warning("yahoo fetch failed %s: %s", sym, e)
        return []


def synth_candles(px0: float, n: int = HISTORY) -> list[dict]:
    """离线回退：随机游走 K 线（保证界面永远有数据）"""
    t = int(time.time() * 1000) - n * CANDLE_SEC * 1000
    px, out = px0, []
    for i in range(n):
        drift = math.sin(i / 14) * 1.1 + (random.random() - 0.47) * 2.6
        o = px
        c = px * (1 + (random.random() - 0.5) / 160)
        px = c
        h = max(o, c) * (1 + random.random() / 240)
        l = min(o, c) * (1 - random.random() / 240)
        out.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": 0.4 + random.random() * 1.7})
        t += CANDLE_SEC * 1000
    return out


class MarketFeed:
    """维护主标的 K 线，按 TICK_MS 推进并回调 on_tick"""

    def __init__(self):
        self.sym = PRIMARY
        self.candles: list[dict] = []
        self.source = "synth"
        self.on_tick = None
        self.on_candle = None

    async def bootstrap(self):
        loop = asyncio.get_running_loop()
        data = await loop.run_in_executor(None, fetch_binance, self.sym)
        if data:
            self.source = "binance"
        else:
            data = await loop.run_in_executor(None, fetch_candles_yahoo, self.sym)
            if data:
                self.source = "yahoo"
        if not data:
            data = synth_candles(148.0)
            self.source = "synth"
        self.candles = data
        for c in self.candles[-80:]:
            db.save_candle(self.sym, c)
        log.info("bootstrap %s source=%s bars=%d px=%.3f", self.sym, self.source, len(self.candles), self.price)

    @property
    def price(self):
        return self.candles[-1]["c"] if self.candles else 148.0

    def _push_candle(self):
        c = {"t": int(time.time() // CANDLE_SEC) * CANDLE_SEC * 1000,
             "o": self.price, "h": self.price, "l": self.price, "c": self.price, "v": 0.01}
        self.candles.append(c)
        if len(self.candles) > 280:
            self.candles.pop(0)
        if self.on_candle:
            self.on_candle(c)

    async def run(self):
        refresh_at = time.time() + 120
        while True:
            await asyncio.sleep(0.6)
            last = self.candles[-1]
            # 微幅均值回归 tick
            vol = 0.0004 if self.source in ("binance", "yahoo") else 0.0016
            drift = (self.price - last["o"]) * -0.02
            last["c"] = max(0.01, last["c"] * (1 + drift + random.gauss(0, vol)))
            last["h"] = max(last["h"], last["c"])
            last["l"] = min(last["l"], last["c"])
            last["v"] += random.random() * 0.03
            if time.time() * 1000 - last["t"] > CANDLE_SEC * 1000:
                self._push_candle()
            db.save_tick(self.sym, last["c"])
            if self.on_tick:
                await self.on_tick(last)

            if time.time() > refresh_at:
                refresh_at = time.time() + 120
                loop = asyncio.get_running_loop()
                data = await loop.run_in_executor(None, fetch_binance, self.sym)
                if not data:
                    data = await loop.run_in_executor(None, fetch_candles_yahoo, self.sym)
                if data and len(data) > 20 and abs(data[-1]["c"] / self.price - 1) < 0.25:
                    # 真实数据校准尾部，不打断前端节奏
                    self.candles[-len(data):] = data[-len(self.candles):] if len(data) >= len(self.candles) else self.candles[:len(self.candles)-len(data)] + data
                    for c in data[-40:]:
                        db.save_candle(self.sym, c)
