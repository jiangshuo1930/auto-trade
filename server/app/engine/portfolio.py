"""组合与风控层：把信号变成持仓，把持仓变成净值。

职责
----
* 目标权重合成（信号 → 仓位比例）
* 风控闸门（单标的集中度 / 总仓位 / 回撤熔断 / 冷却期）
* 成交模拟（手续费 + 滑点 + 冲击成本）
* 净值曲线、绩效归因、事件日志
"""
from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque

from ..config import Settings, settings
from .factors import SymbolSignal


@dataclass
class Position:
    symbol: str
    qty: float = 0.0
    avg_price: float = 0.0
    entry_ts: float = 0.0
    realized: float = 0.0

    def market_value(self, price: float) -> float:
        return self.qty * price

    def unrealized(self, price: float) -> float:
        return (price - self.avg_price) * self.qty

    def unrealized_pct(self, price: float) -> float:
        if self.avg_price <= 0 or self.qty == 0:
            return 0.0
        return (price / self.avg_price - 1.0) * 100.0 * (1 if self.qty > 0 else -1)


@dataclass
class RiskGate:
    """风控闸门状态。"""

    name: str
    cn: str
    ok: bool
    detail: str


@dataclass
class Event:
    ts: float
    kind: str          # SIGNAL / EXEC / RISK / MODEL
    level: str         # info / warn / danger
    text: str

    def to_dict(self) -> dict:
        return {"ts": self.ts, "kind": self.kind, "level": self.level, "text": self.text}


class Portfolio:
    def __init__(self, cfg: Settings = settings) -> None:
        self.cfg = cfg
        self.cash = cfg.equity_start
        self.positions: dict[str, Position] = {}
        self.equity_history: Deque[tuple[float, float]] = deque(maxlen=4000)
        self.events: Deque[Event] = deque(maxlen=cfg.event_buffer)
        self.peak_equity = cfg.equity_start
        self.start_equity = cfg.equity_start
        self.trades = 0
        self.wins = 0
        self.losses = 0
        self.fees_paid = 0.0
        self.gross_exposure = 0.0
        self.net_exposure = 0.0
        self.frozen_until = 0.0
        self.cooldown: dict[str, float] = {}
        self.last_signal: dict[str, SymbolSignal] = {}
        self.target_w: dict[str, float] = {}

    # ---------------- 事件 ----------------
    def log(self, kind: str, text: str, level: str = "info") -> None:
        self.events.appendleft(Event(time.time(), kind, level, text))

    # ---------------- 目标权重 ----------------
    def build_targets(self, signals: dict[str, SymbolSignal]) -> dict[str, float]:
        """按 alpha 强度分配目标权重，多头为正向敞口。

        采用「风险平价 + 信号强度」混合：强度决定相对排序，
        波动率与相关标的数量决定总预算，避免一次性打满仓位。
        """
        longs = [s for s in signals.values() if s.action == "LONG"]
        shorts = [s for s in signals.values() if s.action == "SHORT"]
        targets: dict[str, float] = {}

        def allocate(group: list[SymbolSignal], sign: float, budget: float) -> None:
            if not group:
                return
            weights = []
            for s in group:
                # 波动越大，同样信号分配越少仓位
                vol_pen = 1.0 / (1.0 + max(s.atr_pct, 0.05) * 6.0)
                weights.append(abs(s.alpha) * s.confidence * vol_pen)
            total = sum(weights) or 1.0
            for s, w0 in zip(group, weights):
                w = budget * (w0 / total) * sign
                w = max(-self.cfg.max_position_pct, min(self.cfg.max_position_pct, w))
                if s.confidence >= 0.5:
                    targets[s.symbol] = w

        n_sides = (1 if longs else 0) + (1 if shorts else 0)
        if n_sides:
            # 总预算按信号活跃度自适应，最多 max_gross_pct
            active = len(longs) + len(shorts)
            commit = min(1.0, 0.55 + 0.09 * active)
            per_side = self.cfg.max_gross_pct * commit / n_sides
            allocate(longs, 1.0, per_side)
            allocate(shorts, -1.0, per_side)
        return targets

    # ---------------- 风控闸门 ----------------
    def risk_gates(self, equity: float, prices: dict[str, float]) -> list[RiskGate]:
        dd = (self.peak_equity - equity) / self.peak_equity if self.peak_equity > 0 else 0.0
        gross = sum(abs(p.market_value(prices.get(s, p.avg_price)))
                    for s, p in self.positions.items()) / max(equity, 1e-9)
        max_single = 0.0
        for s, p in self.positions.items():
            mv = abs(p.market_value(prices.get(s, p.avg_price)))
            max_single = max(max_single, mv / max(equity, 1e-9))
        return [
            RiskGate("drawdown", "回撤熔断", dd < self.cfg.max_drawdown_stop,
                     f"当前回撤 {dd*100:.2f}%，阈值 {self.cfg.max_drawdown_stop*100:.0f}%"),
            RiskGate("gross", "总仓位", gross <= self.cfg.max_gross_pct + 0.02,
                     f"总敞口 {gross*100:.1f}%，上限 {self.cfg.max_gross_pct*100:.0f}%"),
            RiskGate("concentration", "集中度", max_single <= self.cfg.max_position_pct + 0.02,
                     f"最大单标的 {max_single*100:.1f}%，上限 {self.cfg.max_position_pct*100:.0f}%"),
            RiskGate("cooldown", "冷却期", time.time() >= self.frozen_until,
                     "熔断冷却中" if time.time() < self.frozen_until else "无冻结"),
        ]

    # ---------------- 估值 ----------------
    def equity(self, prices: dict[str, float]) -> float:
        mv = 0.0
        for s, p in self.positions.items():
            mv += p.qty * prices.get(s, p.avg_price)
        return self.cash + mv

    # ---------------- 撮合 ----------------
    def _fill(self, symbol: str, delta_qty: float, price: float) -> float:
        """按 delta 调整仓位，返回手续费。"""
        if abs(delta_qty) < 1e-12:
            return 0.0
        notional = abs(delta_qty) * price
        slip = self.cfg.slippage_bps / 10_000.0
        exec_price = price * (1 + slip if delta_qty > 0 else 1 - slip)
        fee = notional * self.cfg.fee_bps / 10_000.0
        pos = self.positions.setdefault(symbol, Position(symbol))
        old_qty = pos.qty
        new_qty = old_qty + delta_qty
        # 已实现盈亏
        if old_qty != 0 and (delta_qty * old_qty) < 0:
            closed = min(abs(delta_qty), abs(old_qty)) * (1 if old_qty > 0 else -1)
            pnl = (exec_price - pos.avg_price) * closed
            pos.realized += pnl
            if pnl > 0:
                self.wins += 1
            else:
                self.losses += 1
            self.trades += 1
        # 均价更新
        if abs(new_qty) < 1e-12:
            pos.qty = 0.0
            pos.avg_price = 0.0
            self.positions.pop(symbol, None)
        else:
            if old_qty == 0 or (old_qty * delta_qty) > 0:
                total_cost = pos.avg_price * abs(old_qty) + exec_price * abs(delta_qty)
                pos.qty = new_qty
                pos.avg_price = total_cost / abs(new_qty)
                if old_qty == 0:
                    pos.entry_ts = time.time()
            else:
                pos.qty = new_qty
        self.cash -= delta_qty * exec_price + fee
        self.fees_paid += fee
        return fee

    def rebalance(self, targets: dict[str, float], prices: dict[str, float],
                  signals: dict[str, SymbolSignal]) -> None:
        equity = self.equity(prices)
        gates = self.risk_gates(equity, prices)

        # 回撤熔断 → 全部平仓并冻结
        dd_gate = next(g for g in gates if g.name == "drawdown")
        if not dd_gate.ok:
            if self.positions:
                self.log("RISK", f"回撤 {dd_gate.detail}，触发熔断，强制清仓并冻结 5 分钟", "danger")
                for s in list(self.positions):
                    px = prices.get(s, self.positions[s].avg_price)
                    self._fill(s, -self.positions[s].qty, px)
            self.frozen_until = time.time() + 300
            self.peak_equity = max(self.peak_equity * 0.94, equity)
            return

        if time.time() < self.frozen_until:
            return

        for sym, w in targets.items():
            px = prices.get(sym)
            if not px:
                continue
            pos = self.positions.get(sym)
            cur_w = (pos.qty * px / equity) if pos else 0.0
            diff_w = w - cur_w
            if abs(diff_w) < 0.012:          # 死区，避免过度交易
                continue
            notional = diff_w * equity
            qty = notional / px
            # 冷却：同一标的平仓后 20s 内不反向
            if pos and pos.qty * qty < 0 and self.cooldown.get(sym, 0) > time.time():
                continue
            before = pos.qty if pos else 0.0
            fee = self._fill(sym, qty, px)
            if fee:
                side = "买入" if qty > 0 else "卖出"
                self.log("EXEC", f"{side} {sym} {abs(qty):.6f} @ {px:,.2f}｜"
                                 f"目标权重 {w*100:+.1f}%（原 {cur_w*100:+.1f}%）｜费 ${fee:.2f}")
            if before * qty < 0:
                self.cooldown[sym] = time.time() + 20

        # 平掉不再有信号的仓位
        for sym, pos in list(self.positions.items()):
            if sym not in targets and abs(pos.qty) > 1e-12:
                px = prices.get(sym, pos.avg_price)
                self._fill(sym, -pos.qty, px)
                self.log("EXEC", f"清仓 {sym} @ {px:,.2f}（信号消失）")

        self._mark(equity, prices)

    def _mark(self, equity: float, prices: dict[str, float]) -> None:
        self.peak_equity = max(self.peak_equity, equity)
        ts = time.time()
        if not self.equity_history or ts - self.equity_history[-1][0] > 2.0:
            self.equity_history.append((ts, equity))
        gross = sum(abs(p.market_value(prices.get(s, p.avg_price)))
                    for s, p in self.positions.items())
        net = sum(p.market_value(prices.get(s, p.avg_price))
                  for s, p in self.positions.items())
        self.gross_exposure = gross / max(equity, 1e-9)
        self.net_exposure = net / max(equity, 1e-9)

    # ---------------- 绩效 ----------------
    def metrics(self, equity: float) -> dict:
        # 采样点间隔不均，按 5 分钟滚动重采样后再算收益，避免高频噪声放大夏普
        curve = [(ts, v) for ts, v in self.equity_history]
        rets: list[float] = []
        if len(curve) >= 12:
            bucket: dict[int, float] = {}
            for ts, v in curve:
                bucket[int(ts // 300)] = v          # 每 5 分钟取最后值
            keys = sorted(bucket)
            vals = [bucket[k] for k in keys]
            rets = [vals[i] / vals[i - 1] - 1 for i in range(1, len(vals)) if vals[i - 1] > 0]
        if len(rets) > 2:
            mu = sum(rets) / len(rets)
            sd = math.sqrt(sum((r - mu) ** 2 for r in rets) / (len(rets) - 1))
            # 5 分钟采样 → 年化因子
            ann = math.sqrt(365 * 24 * 12)
            sharpe = (mu / sd * ann) if sd > 1e-12 else 0.0
            sharpe = max(-9.99, min(9.99, sharpe))
        else:
            sharpe = 0.0
        mdd = 0.0
        peak = self.start_equity
        for v in [v for _, v in curve]:
            peak = max(peak, v)
            mdd = max(mdd, (peak - v) / peak)
        total = self.trades
        win_rate = self.wins / total if total else 0.0
        return {
            "equity": equity,
            "start": self.start_equity,
            "pnl": equity - self.start_equity,
            "pnlPct": (equity / self.start_equity - 1) * 100,
            "cash": self.cash,
            "sharpe": sharpe,
            "mdd": mdd * 100,
            "winRate": win_rate * 100,
            "trades": total,
            "fees": self.fees_paid,
            "gross": self.gross_exposure * 100,
            "net": self.net_exposure * 100,
        }
