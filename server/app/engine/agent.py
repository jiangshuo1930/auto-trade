"""Agent 编排层：行情 → 因子 → 信号 → 风控 → 组合，并对外输出统一快照。"""
from __future__ import annotations

import asyncio
import logging
import time

from ..config import SYMBOL_LABEL, Settings, settings
from ..data.feed import MarketFeed
from .factors import FactorEngine, SymbolSignal
from .portfolio import Portfolio

log = logging.getLogger("qno.agent")


class TradingAgent:
    def __init__(self, feed: MarketFeed, cfg: Settings = settings) -> None:
        self.cfg = cfg
        self.feed = feed
        self.engine = FactorEngine()
        self.portfolio = Portfolio(cfg)
        self.signals: dict[str, SymbolSignal] = {}
        self.started_at = time.time()
        self.cycles = 0
        self.last_cycle_ms = 0.0
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._prices: dict[str, float] = {}

    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop(), name="trading-agent")
        self.portfolio.log("MODEL", "Agent 引擎启动｜因子 7 通道 · 风控 4 闸门 · 冷却 20s", "info")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    async def _loop(self) -> None:
        interval = 1.0 / max(self.cfg.tick_hz, 0.2)
        while not self._stop.is_set():
            t0 = time.perf_counter()
            try:
                self.tick()
            except Exception:  # noqa: BLE001
                log.exception("决策循环异常")
            self.last_cycle_ms = (time.perf_counter() - t0) * 1000
            await asyncio.sleep(interval)

    # ---------------- 单次决策 ----------------
    def tick(self) -> None:
        prices: dict[str, float] = {}
        sigs: dict[str, SymbolSignal] = {}
        for sym, st in self.feed.states.items():
            q = st.quote
            if q.price <= 0:
                continue
            prices[sym] = q.price
            closes = st.closes()
            highs = [c.high for c in st.candles]
            lows = [c.low for c in st.candles]
            vols = [c.volume for c in st.candles]
            sig = self.engine.evaluate(sym, q.price, closes, highs, lows, vols,
                                       st.buy_ratio())
            sigs[sym] = sig

            prev = self.signals.get(sym)
            if prev and prev.action != sig.action and sig.action != "FLAT":
                arrow = "多" if sig.action == "LONG" else "空"
                self.portfolio.log(
                    "SIGNAL",
                    f"{SYMBOL_LABEL.get(sym, sym)} 转向 {arrow}｜α={sig.alpha:+.3f} "
                    f"置信 {sig.confidence*100:.0f}%｜{sig.reason}",
                    "info" if sig.action == "LONG" else "warn",
                )
            elif prev is None and sig.action != "FLAT":
                arrow = "多" if sig.action == "LONG" else "空"
                self.portfolio.log("SIGNAL",
                                   f"{SYMBOL_LABEL.get(sym, sym)} 首次触发 {arrow}信号"
                                   f"（α={sig.alpha:+.3f}）")

        if not prices:
            return
        self.signals = sigs
        self._prices = prices
        targets = self.portfolio.build_targets(sigs)
        self.portfolio.rebalance(targets, prices, sigs)
        self.portfolio.target_w = targets
        self.cycles += 1

    # ---------------- 对外快照 ----------------
    def snapshot(self) -> dict:
        equity = self.portfolio.equity(self._prices)
        pf = self.portfolio
        m = pf.metrics(equity)
        now = time.time()

        positions = []
        for sym, p in pf.positions.items():
            px = self._prices.get(sym, p.avg_price)
            positions.append({
                "symbol": sym,
                "label": SYMBOL_LABEL.get(sym, sym),
                "side": "LONG" if p.qty > 0 else "SHORT",
                "qty": p.qty,
                "avgPrice": p.avg_price,
                "price": px,
                "notional": p.qty * px,
                "upnl": p.unrealized(px),
                "upnlPct": p.unrealized_pct(px),
                "realized": p.realized,
                "holdSec": now - p.entry_ts if p.entry_ts else 0,
                "targetW": pf.target_w.get(sym, 0.0) * 100,
            })
        positions.sort(key=lambda x: abs(x["notional"]), reverse=True)

        sig_list = []
        for s in sorted(self.signals.values(), key=lambda x: abs(x.alpha), reverse=True):
            sig_list.append({
                "symbol": s.symbol,
                "label": SYMBOL_LABEL.get(s.symbol, s.symbol),
                "alpha": s.alpha,
                "confidence": s.confidence,
                "action": s.action,
                "price": s.price,
                "atrPct": s.atr_pct,
                "vol": s.volatility,
                "reason": s.reason,
                "factors": [
                    {"name": f.name, "cn": f.cn, "score": f.score,
                     "weight": f.weight, "contrib": f.contrib, "detail": f.detail}
                    for f in s.factors
                ],
            })

        curve = [(ts, v) for ts, v in pf.equity_history][-900:]
        return {
            "ts": now,
            "uptime": now - self.started_at,
            "mode": "SYNTHETIC" if self.feed.synthetic else ("LIVE" if self.feed.connected else "RECONNECTING"),
            "market": self.feed.snapshot(),
            "metrics": m,
            "positions": positions,
            "signals": sig_list,
            "risk": [
                {"name": g.name, "cn": g.cn, "ok": g.ok, "detail": g.detail}
                for g in pf.risk_gates(equity, self._prices)
            ],
            "equityCurve": [[ts, round(v, 2)] for ts, v in curve],
            "events": [e.to_dict() for e in list(pf.events)[:60]],
            "engine": {
                "cycles": self.cycles,
                "cycleMs": round(self.last_cycle_ms, 2),
                "msgCount": self.feed.msgs,
                "reconnects": self.feed.reconnects,
                "factorCount": 7,
                "symbolCount": len(self.signals),
            },
        }
