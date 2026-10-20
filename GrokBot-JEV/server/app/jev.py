"""JEV 决策引擎：多因子打分 → 结构化决策（BUY / SELL / HOLD + 置信度 + 风险等级）
   生产中替换为 Grok / JEV 模型调用即可，入参出参保持一致。"""
import math, random
from .config import SYMBOLS

def ema(vals, n):
    if not vals:
        return 0.0
    k = 2 / (n + 1)
    e = vals[0]
    for v in vals[1:]:
        e = v * k + e * (1 - k)
    return e

def rsi(closes, n=14):
    if len(closes) < n + 1:
        return 50.0
    gains = losses = 0.0
    for i in range(-n, 0):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    if losses == 0:
        return 100.0
    rs = gains / losses
    return 100 - 100 / (1 + rs)

def atr(candles, n=14):
    if len(candles) < n + 1:
        return 0.0
    trs = []
    for i in range(-n, 0):
        h, l, pc = candles[i]["h"], candles[i]["l"], candles[i - 1]["c"]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    return sum(trs) / len(trs)

def vol_z(candles, n=20):
    vs = [c["v"] for c in candles[-n:]]
    if len(vs) < 4:
        return 0.0
    m = sum(vs) / len(vs)
    sd = (sum((v - m) ** 2 for v in vs) / len(vs)) ** 0.5 or 1e-9
    return (vs[-1] - m) / sd

def score(candles):
    closes = [c["c"] for c in candles]
    px = closes[-1]
    fast, slow = ema(closes[-12:], 12), ema(closes[-48:], 48)
    mom = (px / closes[-8] - 1) * 100 if len(closes) > 8 else 0.0
    r = rsi(closes)
    a = atr(candles)
    vz = vol_z(candles)
    trend = 1.0 if fast > slow else -1.0
    f = {
        "momentum": max(-1, min(1, mom / 1.8)),
        "trend": trend * 0.8,
        "rsi_rev": max(-1, min(1, (50 - r) / 28)),
        "volume": max(-1, min(1, vz / 2.2)),
    }
    raw = 0.38 * f["momentum"] + 0.27 * f["trend"] + 0.2 * f["rsi_rev"] + 0.15 * f["volume"]
    return raw, {"rsi": r, "atr": a, "atr_pct": a / px * 100 if px else 0, "mom": mom, "vol_z": vz,
                 "ema_fast": fast, "ema_slow": slow}

class JevEngine:
    """轮询产出决策：CHIEF 统筹、SCAN 扫描、VET 尽调、RISK 闸门、SIZE 仓位"""

    BOTS = ["CHIEF", "SCAN", "VET", "SOCIAL", "SIZE", "FILLS", "RISK", "CRAWLER"]

    def __init__(self, feed):
        self.feed = feed
        self.signals = 259
        self.last_act = None
        self.risk_level = "NORMAL"

    def decide(self) -> dict:
        cs = self.feed.candles[-90:]
        if len(cs) < 20:
            return None
        raw, ind = score(cs)
        conf = min(97.0, 52 + abs(raw) * 42 + random.uniform(0, 6))
        act = "HOLD"
        if raw > 0.22:
            act = "BUY"
        elif raw < -0.22:
            act = "SELL"
        # 风控闸门：波动超限 → 降级 / 否决
        risk = "NORMAL"
        if ind["atr_pct"] > 3.2:
            risk = "HIGH"
            if act != "HOLD" and random.random() < 0.5:
                act = "HOLD"
        if conf < 58 and act != "HOLD":
            act = "HOLD"
        bot = random.choice(self.BOTS) if act != "HOLD" else random.choice(["CHIEF", "SCAN", "VET", "SOCIAL"])
        size = round(min(6.0, 0.6 + abs(raw) * 6.5), 2)
        reasons = {
            "BUY": f"mom {ind['mom']:+.2f}% · ema_fast>slow · vol_z {ind['vol_z']:+.1f}",
            "SELL": f"rsi {ind['rsi']:.0f} · mom {ind['mom']:+.2f}% · trend flip",
            "HOLD": f"signal {raw:+.2f} below threshold · atr {ind['atr_pct']:.2f}%",
        }
        self.signals += 1
        self.risk_level = risk
        d = {
            "bot": bot, "sym": self.feed.sym.replace("-", "/"), "act": act,
            "conf": round(conf, 1), "size": f"{size}M", "risk": risk,
            "reason": reasons[act], "px": round(self.feed.price, 4),
            "ts": None, "ind": {k: round(v, 3) for k, v in ind.items()},
            "signals": self.signals,
        }
        self.last_act = act
        return d

    def agent_states(self):
        """Agent 实时状态：typing / done / idle（驱动卡片打字机与场景光环）"""
        out = {}
        for b in self.BOTS:
            r = random.random()
            phase = "TYPING" if r < 0.45 else ("DONE" if r < 0.62 else "IDLE")
            out[b] = {"phase": phase, "text": random.choice(DUTIES[b]), "t": random.random() * 99}
        return out

DUTIES = {
    "CHIEF": ["allocating capital across 12 venues", "rebalancing sleeve weights", "reviewing sub-agent votes"],
    "SCAN": ["scanning 1,790 alts on SOL", "momentum burst: WIF +6.2%", "queueing candidates to VET"],
    "VET": ["deep-searching tokenomics", "contract audit: 3 flags", "vetting liquidity depth"],
    "SOCIAL": ["sweeping CT heatmap", "hive sentiment: 71 greed", "influencer delta +2.4σ"],
    "SIZE": ["kelly sizing $BONK 2.1M", "vol target 18% → clip 3.4M", "exposure locked"],
    "FILLS": ["slicing TWAP over 40 ticks", "fill 128k @ 0.0311 ✓", "slippage 4.2bps — in band"],
    "RISK": ["VaR 1.1% / limit 2.0% ✓", "correlation spike flagged", "kill-switch armed"],
    "CRAWLER": ["crawling 2,845 mempool txs", "whale moved 410k SOL", "new pair: sniffing LP"],
}
