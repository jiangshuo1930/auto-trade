"""端到端冒烟测试：不依赖网络，验证 引擎→组合→快照 全链路。"""
from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.data.feed import MarketFeed
from app.engine.agent import TradingAgent


def make_synthetic_feed() -> MarketFeed:
    feed = MarketFeed()
    feed._seed_synthetic()
    # 补齐每标的微观盘口数据，模拟活跃交易
    for st in feed.states.values():
        now = feed.states[st.symbol].quote.changed_at
        for i in range(120):
            ts = now - i * 0.5
            prev = st.quote.price * (1 + random.gauss(0, 0.0004))
            st.push_trade(ts, prev, random.uniform(0.1, 2))
    return feed


def main() -> int:
    random.seed(7)
    feed = make_synthetic_feed()
    agent = TradingAgent(feed)

    # 推进 600 个决策周期，模拟 5 分钟实盘
    for _ in range(600):
        feed._synthetic_step_once = None  # 占位，实际用 tick 直接驱动
        # 推进行情价格微动
        for st in feed.states.values():
            q = st.quote
            q.price *= 1 + random.gauss(0, 0.0008)
            st.push_trade(__import__('time').time(), q.price, random.uniform(0.1, 2))
        agent.tick()

    snap = agent.snapshot()
    m = snap["metrics"]
    print("mode:", snap["mode"])
    print("equity: %.2f  pnl: %+.2f (%+.2f%%)" % (m["equity"], m["pnl"], m["pnlPct"]))
    print("sharpe: %.2f  mdd: %.2f%%  win: %.1f%%  trades: %d" %
          (m["sharpe"], m["mdd"], m["winRate"], m["trades"]))
    print("gross: %.1f%%  net: %.1f%%  cash: %.0f" % (m["gross"], m["net"], m["cash"]))
    print("positions:", [(p["label"], p["side"], round(p["notional"])) for p in snap["positions"]])
    print("signals:", [(s["label"], s["action"], round(s["alpha"], 3)) for s in snap["signals"][:4]])
    print("equity points:", len(snap["equityCurve"]), " events:", len(snap["events"]))
    print("risk:", [(g["cn"], g["ok"]) for g in snap["risk"]])

    # 基本断言
    assert m["equity"] > 0, "净值必须为正"
    assert m["gross"] <= settings.max_gross_pct * 100 + 3, "总敞口超限"
    assert len(snap["signals"]) == len(settings.symbols), "信号覆盖所有标的"
    assert all(len(s["factors"]) == 7 for s in snap["signals"]), "每信号 7 因子"
    print("\nSMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
