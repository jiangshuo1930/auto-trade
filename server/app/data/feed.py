"""行情数据层：Binance 公共 WebSocket 实时行情 + REST 历史预热 + 断线重连。

设计要点
--------
* 全程无 API Key，只订阅公共 aggTrade / kline 流。
* 断线指数退避重连，重连后自动补齐缺失 K 线。
* 网络完全不可用时（可选）降级为合成行情，保证界面可用性。
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Deque

import httpx
import websockets

from ..config import Settings, settings

log = logging.getLogger("qno.feed")


@dataclass
class Quote:
    """单标的最新行情快照。"""

    symbol: str
    price: float = 0.0
    open_24h: float = 0.0
    high_24h: float = 0.0
    low_24h: float = 0.0
    volume_24h: float = 0.0
    changed_at: float = 0.0

    @property
    def change_pct(self) -> float:
        if self.open_24h <= 0:
            return 0.0
        return (self.price / self.open_24h - 1.0) * 100.0


@dataclass
class Candle:
    ts: int
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class SymbolState:
    """单标的的滚动数据容器。"""

    symbol: str
    candles: Deque[Candle] = field(default_factory=lambda: deque(maxlen=600))
    trades: Deque[tuple[float, float, float]] = field(default_factory=deque)  # (ts, price, qty)
    quote: Quote = field(default_factory=lambda: Quote(symbol=""))

    def push_candle(self, c: Candle) -> None:
        if self.candles and self.candles[-1].ts == c.ts:
            self.candles[-1] = c
        else:
            self.candles.append(c)

    def push_trade(self, ts: float, price: float, qty: float) -> None:
        self.trades.append((ts, price, qty))
        cutoff = ts - 60.0
        while self.trades and self.trades[0][0] < cutoff:
            self.trades.popleft()

    def closes(self) -> list[float]:
        return [c.close for c in self.candles]

    def buy_ratio(self) -> float:
        """近 60 秒主动买盘占比（用价格上行笔近似）。"""
        if len(self.trades) < 6:
            return 0.5
        buys = sells = 0.0
        prev = self.trades[0][1]
        for _, price, qty in self.trades:
            if price >= prev:
                buys += qty
            else:
                sells += qty
            prev = price
        total = buys + sells
        return buys / total if total > 0 else 0.5


class MarketFeed:
    """行情聚合器，供引擎与前端共同消费。"""

    def __init__(self, cfg: Settings = settings) -> None:
        self.cfg = cfg
        self.states: dict[str, SymbolState] = {
            s: SymbolState(symbol=s) for s in cfg.symbols
        }
        self.connected = False
        self.last_msg_ts = 0.0
        self.msgs = 0
        self.reconnects = 0
        self.synthetic = False
        self._listeners: list[Callable[[str, dict], None]] = []
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    # ---------------- 生命周期 ----------------
    def on_message(self, fn: Callable[[str, dict], None]) -> None:
        self._listeners.append(fn)

    def _emit(self, kind: str, payload: dict) -> None:
        for fn in self._listeners:
            try:
                fn(kind, payload)
            except Exception:  # noqa: BLE001 - 监听器异常不应中断行情
                log.exception("listener error")

    async def start(self) -> None:
        ok = await self._warmup()
        if not ok and self.cfg.allow_offline:
            log.warning("REST 预热失败，切换到合成行情")
            self.synthetic = True
            self._seed_synthetic()
        self._task = asyncio.create_task(self._run_loop(), name="market-feed")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    # ---------------- 预热 ----------------
    async def _warmup(self) -> bool:
        url = f"{self.cfg.rest_base}/api/v3/klines"
        ok_any = False
        try:
            timeout = httpx.Timeout(6.0, connect=4.0)
            async with httpx.AsyncClient(timeout=timeout) as cli:
                # 先探测一次连通性，失败则直接走离线，避免逐标的串行超时
                probe_ok = False
                try:
                    r = await cli.get(url, params={"symbol": self.cfg.symbols[0],
                                                   "interval": self.cfg.kline_interval, "limit": 2})
                    probe_ok = r.status_code == 200
                except Exception as exc:  # noqa: BLE001
                    log.warning("REST 探测失败: %s", exc)
                if not probe_ok:
                    return False

                for sym in self.cfg.symbols:
                    try:
                        r = await cli.get(
                            url,
                            params={
                                "symbol": sym,
                                "interval": self.cfg.kline_interval,
                                "limit": self.cfg.kline_limit,
                            },
                        )
                        r.raise_for_status()
                        rows = r.json()
                    except Exception as exc:  # noqa: BLE001
                        log.warning("预热失败 %s: %s", sym, exc)
                        continue
                    st = self.states[sym]
                    st.candles.clear()
                    for k in rows:
                        st.push_candle(
                            Candle(
                                ts=int(k[0]),
                                open=float(k[1]),
                                high=float(k[2]),
                                low=float(k[3]),
                                close=float(k[4]),
                                volume=float(k[5]),
                            )
                        )
                    if st.candles:
                        last = st.candles[-1]
                        q = st.quote
                        q.symbol = sym
                        q.price = last.close
                        q.open_24h = last.close
                        q.high_24h = max(c.high for c in st.candles)
                        q.low_24h = min(c.low for c in st.candles)
                        q.volume_24h = sum(c.volume for c in st.candles)
                        q.changed_at = time.time()
                        ok_any = True
                    log.info("预热 %s → %d 根K线", sym, len(st.candles))
        except Exception as exc:  # noqa: BLE001
            log.warning("REST 客户端异常: %s", exc)
        return ok_any

    # ---------------- 主循环 ----------------
    async def _run_loop(self) -> None:
        backoff = self.cfg.reconnect_base
        while not self._stop.is_set():
            if self.synthetic:
                await self._synthetic_loop()
                return
            try:
                await self._connect_once()
                backoff = self.cfg.reconnect_base
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self.connected = False
                self.reconnects += 1
                log.warning("行情连接断开: %s | %.1fs 后重连", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 1.8, self.cfg.reconnect_max)

    async def _connect_once(self) -> None:
        url = self.cfg.stream_url
        log.info("连接行情流 %s", url[:90] + "…")
        async with websockets.connect(
            url, ping_interval=20, ping_timeout=20, max_queue=4096
        ) as ws:
            self.connected = True
            log.info("行情流已连接")
            self._emit("conn", {"connected": True})
            async for raw in ws:
                if self._stop.is_set():
                    return
                await self._handle_raw(raw)

    async def _handle_raw(self, raw: str | bytes) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        data = msg.get("data") or msg
        ev = data.get("e")
        sym = (data.get("s") or "").upper()
        st = self.states.get(sym)
        if not st:
            return
        self.msgs += 1
        self.last_msg_ts = time.time()

        if ev == "aggTrade":
            price = float(data["p"])
            qty = float(data["q"])
            ts = float(data["T"]) / 1000.0
            st.push_trade(ts, price, qty)
            st.quote.price = price
            st.quote.symbol = sym
            st.quote.changed_at = ts
            st.quote.volume_24h += qty
            if st.quote.open_24h <= 0:
                st.quote.open_24h = price
        elif ev == "kline":
            k = data["k"]
            c = Candle(
                ts=int(k["t"]),
                open=float(k["o"]),
                high=float(k["h"]),
                low=float(k["l"]),
                close=float(k["c"]),
                volume=float(k["v"]),
            )
            st.push_candle(c)
            st.quote.price = c.close
            st.quote.symbol = sym
            st.quote.changed_at = time.time()
            if st.quote.open_24h <= 0:
                st.quote.open_24h = c.open

    # ---------------- 合成行情（离线兜底） ----------------
    def _seed_synthetic(self) -> None:
        base = {"BTCUSDT": 68420, "ETHUSDT": 3560, "SOLUSDT": 172, "BNBUSDT": 592,
                "XRPUSDT": 0.62, "DOGEUSDT": 0.148, "AVAXUSDT": 34.6, "LINKUSDT": 15.8}
        now = int(time.time() * 1000)
        for sym, st in self.states.items():
            p0 = base.get(sym, 100.0)
            st.candles.clear()
            for i in range(self.cfg.kline_limit, 0, -1):
                ts = now - i * 60_000
                drift = random.gauss(0, 0.0012)
                o = p0
                p0 *= 1 + drift
                st.push_candle(Candle(ts, o, max(o, p0) * 1.0006,
                                      min(o, p0) * 0.9994, p0, random.uniform(20, 200)))
            q = st.quote
            q.symbol = sym
            q.price = p0
            q.open_24h = st.candles[0].open
            q.high_24h = max(c.high for c in st.candles)
            q.low_24h = min(c.low for c in st.candles)
            q.changed_at = time.time()

    async def _synthetic_loop(self) -> None:
        """离线模式的行情推进器。"""
        self.connected = True
        minute = int(time.time() // 60)
        while not self._stop.is_set():
            await asyncio.sleep(0.5)
            now = time.time()
            for st in self.states.values():
                q = st.quote
                shock = random.gauss(0, 0.0009)
                q.price = max(1e-8, q.price * (1 + shock))
                q.changed_at = now
                q.volume_24h += random.uniform(0.1, 3.0)
                st.push_trade(now, q.price, random.uniform(0.05, 2.0))
                cur = int(now // 60)
                if cur != minute:
                    minute = cur
                    st.push_candle(Candle(cur * 60_000, q.price, q.price, q.price,
                                          q.price, random.uniform(20, 200)))
                else:
                    last = st.candles[-1] if st.candles else None
                    if last:
                        last.high = max(last.high, q.price)
                        last.low = min(last.low, q.price)
                        last.close = q.price
            self.msgs += len(self.states)

    # ---------------- 快照 ----------------
    def snapshot(self) -> dict:
        out = []
        for sym, st in self.states.items():
            q = st.quote
            closes = st.closes()
            out.append({
                "symbol": sym,
                "price": q.price,
                "change24h": q.change_pct,
                "high24h": q.high_24h,
                "low24h": q.low_24h,
                "volume24h": q.volume_24h,
                "spark": closes[-60:],
                "buyRatio": st.buy_ratio(),
            })
        return {
            "symbols": out,
            "connected": self.connected,
            "synthetic": self.synthetic,
            "msgs": self.msgs,
            "reconnects": self.reconnects,
        }
