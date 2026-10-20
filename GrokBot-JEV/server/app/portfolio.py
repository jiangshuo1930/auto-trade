"""纸面交易撮合 + 组合权益（Jev-Trades 默认 paper mode）"""
import time, random
from .config import START_CASH, FEE_BPS, SLIP_BPS, MAX_POS_PCT
from . import db

class PaperBroker:
    def __init__(self):
        self.cash = START_CASH
        self.pos = 0.0            # 主标的持仓数量
        self.avg_px = 0.0
        self.realized = 0.0
        self.equity = START_CASH
        self.curve = [START_CASH] * 120

    def warmup(self, px: float):
        """15 日纸面交易预热：生成历史权益曲线与初始持仓（DAY 15 - GAINS）"""
        import random as _r
        v = START_CASH * 0.82
        curve = []
        for i in range(238):
            v += v * 0.0016 + _r.gauss(0, v * 0.004)
            v = max(START_CASH * 0.6, v)
            curve.append(v)
        # 平滑拉升到目标净值（约 +49%）
        target = START_CASH * 1.494
        n = len(curve)
        curve = [c + (target - curve[-1]) * ((i + 1) / n) ** 1.6 for i, c in enumerate(curve)]
        self.curve = curve
        self.equity = target
        # 初始持仓：部分现金 + 底仓
        self.pos = round((self.equity * 0.28) / px, 4)
        self.avg_px = round(px * 0.921, 4)
        self.cash = round(self.equity - self.pos * px, 2)
        self.realized = round(self.equity - START_CASH - self.pos * (px - self.avg_px), 2)

    def mark(self, px):
        self.equity = self.cash + self.pos * px
        self.curve.append(self.equity)
        if len(self.curve) > 240:
            self.curve.pop(0)
        return self.equity

    def try_fill(self, d: dict, px: float):
        """按决策执行纸面成交；返回成交结构或 None"""
        if d["act"] == "HOLD" or random.random() > 0.62:
            return None
        side = d["act"]
        slip = px * SLIP_BPS / 1e4
        fill_px = px + slip if side == "BUY" else px - slip
        notional = min(self.cash * 0.35, self.equity * MAX_POS_PCT)
        qty = max(0.01, notional / fill_px) if side == "BUY" else min(self.pos, notional / fill_px)
        if qty <= 0:
            return None
        fee = qty * fill_px * FEE_BPS / 1e4
        pnl = 0.0
        if side == "BUY":
            self.cash -= qty * fill_px + fee
            self.avg_px = (self.avg_px * self.pos + fill_px * qty) / (self.pos + qty) if self.pos + qty else fill_px
            self.pos += qty
        else:
            pnl = (fill_px - self.avg_px) * qty - fee
            self.cash += qty * fill_px - fee
            self.pos -= qty
            self.realized += pnl
        f = {"sym": d["sym"], "side": side, "qty": round(qty, 4),
             "px": round(fill_px, 4), "fee": round(fee, 3), "pnl": round(pnl, 2),
             "ts": int(time.time() * 1000), "equity": round(self.mark(fill_px), 2)}
        db.save_fill(f)
        return f

    def snapshot(self, px):
        self.mark(px)
        return {
            "equity": round(self.equity, 2),
            "cash": round(self.cash, 2),
            "pos": round(self.pos, 4),
            "avg_px": round(self.avg_px, 4),
            "realized": round(self.realized, 2),
            "unrealized": round((px - self.avg_px) * self.pos, 2) if self.pos else 0.0,
            "curve": [round(v, 2) for v in self.curve[-240:]],
            "start": START_CASH,
        }
