"""多因子信号引擎。

设计原则
--------
* 纯函数式指标计算，不依赖 numpy 之外的重库，便于单测与回测复用。
* 每个因子输出 [-1, 1] 的标准化得分，加权聚合为综合 alpha。
* 信号附带完整的因子贡献明细，前端可直接展开查看推理链路。
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


# ============================================================
# 基础指标
# ============================================================
def ema(values: list[float], period: int) -> list[float]:
    if not values:
        return []
    k = 2.0 / (period + 1.0)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def sma(values: list[float], period: int) -> float:
    if not values:
        return 0.0
    tail = values[-period:]
    return sum(tail) / len(tail)


def stdev(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    m = sum(values) / n
    return math.sqrt(sum((v - m) ** 2 for v in values) / (n - 1))


def rsi(values: list[float], period: int = 14) -> float:
    if len(values) < period + 1:
        return 50.0
    gains = losses = 0.0
    for i in range(-period, 0):
        d = values[i] - values[i - 1]
        if d >= 0:
            gains += d
        else:
            losses -= d
    if losses == 0:
        return 100.0 if gains > 0 else 50.0
    rs = (gains / period) / (losses / period)
    return 100.0 - 100.0 / (1.0 + rs)


def atr(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> float:
    n = min(len(highs), len(lows), len(closes))
    if n < 2:
        return 0.0
    trs = []
    for i in range(max(1, n - period), n):
        tr = max(highs[i] - lows[i],
                 abs(highs[i] - closes[i - 1]),
                 abs(lows[i] - closes[i - 1]))
        trs.append(tr)
    return sum(trs) / len(trs) if trs else 0.0


def zscore_last(values: list[float], lookback: int = 60) -> float:
    tail = values[-lookback:]
    if len(tail) < 5:
        return 0.0
    mu = sum(tail) / len(tail)
    sd = stdev(tail)
    if sd <= 1e-12:
        return 0.0
    return (values[-1] - mu) / sd


def _tanh(x: float) -> float:
    return math.tanh(x)


# ============================================================
# 因子定义
# ============================================================
@dataclass
class FactorScore:
    name: str
    cn: str
    score: float          # [-1, 1]
    weight: float
    detail: str

    @property
    def contrib(self) -> float:
        return self.score * self.weight


@dataclass
class SymbolSignal:
    symbol: str
    price: float
    alpha: float                       # 综合得分 [-1,1]
    confidence: float                  # 置信度 [0,1]
    action: str                        # LONG / SHORT / FLAT
    factors: list[FactorScore] = field(default_factory=list)
    atr_pct: float = 0.0
    volatility: float = 0.0
    reason: str = ""


# 因子权重（合计 1.0）
WEIGHTS: dict[str, float] = {
    "trend": 0.24,      # 多周期均线趋势
    "momentum": 0.20,   # 动量 / ROC
    "reversion": 0.14,  # 均值回归
    "volatility": 0.12, # 波动率状态
    "flow": 0.16,       # 盘口资金流
    "volume": 0.09,     # 量能确认
    "structure": 0.05,  # 高低点结构
}


class FactorEngine:
    """把一条 K 线序列 + 微观盘口数据折算成因子得分。"""

    def evaluate(
        self,
        symbol: str,
        price: float,
        closes: list[float],
        highs: list[float],
        lows: list[float],
        volumes: list[float],
        buy_ratio: float,
    ) -> SymbolSignal:
        factors: list[FactorScore] = []
        if len(closes) < 30:
            return SymbolSignal(symbol, price, 0.0, 0.0, "FLAT",
                                atr_pct=0.0, reason="K线数据不足，保持空仓观察")

        # ---- 1. 趋势：EMA12 / EMA48 距离 + 斜率 ----
        e_fast = ema(closes, 12)
        e_slow = ema(closes, 48)
        spread = (e_fast[-1] - e_slow[-1]) / max(e_slow[-1], 1e-9)
        slope = (e_fast[-1] - e_fast[-8]) / max(e_fast[-8], 1e-9) if len(e_fast) > 8 else 0.0
        trend = _tanh(spread * 55 + slope * 24)
        factors.append(FactorScore("trend", "趋势", trend, WEIGHTS["trend"],
                                   f"EMA12-EMA48 价差 {spread*100:+.2f}%，斜率 {slope*100:+.2f}%"))

        # ---- 2. 动量：多周期 ROC 加权 ----
        rocs = []
        for lb, w in ((5, 0.5), (15, 0.3), (40, 0.2)):
            if len(closes) > lb:
                rocs.append((closes[-1] / closes[-1 - lb] - 1.0) * w)
        roc = sum(rocs)
        momentum = _tanh(roc * 42)
        factors.append(FactorScore("momentum", "动量", momentum, WEIGHTS["momentum"],
                                   f"加权 ROC {roc*100:+.2f}%（5/15/40 周期）"))

        # ---- 3. 均值回归：布林带位置反转 ----
        mid = sma(closes, 20)
        sd = stdev(closes[-20:])
        if sd > 0:
            z = (closes[-1] - mid) / sd
            # 偏离过度 → 反向计分
            reversion = _tanh(-z * 0.55)
            rdetail = f"价格偏离 20 均线 {z:+.2f}σ"
        else:
            reversion, rdetail = 0.0, "波动过小，回归因子失效"
        factors.append(FactorScore("reversion", "均值回归", reversion,
                                   WEIGHTS["reversion"], rdetail))

        # ---- 4. 波动率：低波动偏多头，异常高波动降分 ----
        rets = [closes[i] / closes[i - 1] - 1 for i in range(max(1, len(closes) - 60), len(closes))]
        vol = stdev(rets) * 100
        vol_norm = _tanh((0.45 - vol) * 2.6)
        factors.append(FactorScore("volatility", "波动率", vol_norm, WEIGHTS["volatility"],
                                   f"60 期收益波动 {vol:.3f}%，ATR 占比待算"))

        # ---- 5. 资金流：主动买盘占比 ----
        flow = _tanh((buy_ratio - 0.5) * 4.2)
        factors.append(FactorScore("flow", "资金流", flow, WEIGHTS["flow"],
                                   f"60 秒主动买盘占比 {buy_ratio*100:.1f}%"))

        # ---- 6. 量能确认：近 5 期量能相对基准 ----
        if len(volumes) >= 25:
            v_now = sma(volumes, 5)
            v_base = sma(volumes[:-5], 20) if len(volumes) > 25 else sma(volumes, 20)
            vr = v_now / v_base if v_base > 0 else 1.0
            price_dir = 1 if closes[-1] >= closes[-6] else -1
            volume_score = _tanh((vr - 1.0) * 1.9) * price_dir
            vdetail = f"量比 {vr:.2f}，价量{'同向' if price_dir > 0 else '背离'}"
        else:
            volume_score, vdetail = 0.0, "量能样本不足"
        factors.append(FactorScore("volume", "量能", volume_score, WEIGHTS["volume"], vdetail))

        # ---- 7. 结构：突破近期高低点 ----
        window = closes[-30:]
        hi, lo = max(window), min(window)
        pos = (closes[-1] - lo) / (hi - lo) if hi > lo else 0.5
        structure = _tanh((pos - 0.5) * 2.4)
        factors.append(FactorScore("structure", "结构", structure, WEIGHTS["structure"],
                                   f"30 期区间位置 {pos*100:.0f}%"))

        alpha = sum(f.contrib for f in factors)
        alpha = max(-1.0, min(1.0, alpha))

        # ---- 置信度：|alpha| 强度 + 因子一致性 ----
        same = sum(1 for f in factors if f.score * alpha > 0)
        agreement = same / len(factors)
        strength = min(abs(alpha) / 0.55, 1.0)
        confidence = max(0.0, min(1.0, 0.52 * strength + 0.48 * agreement))

        # ---- ATR ----
        atr_v = atr(highs, lows, closes, 14)
        atr_pct = atr_v / price * 100 if price > 0 else 0.0
        factors[3].detail = f"60 期收益波动 {vol:.3f}%，ATR {atr_pct:.2f}%"

        if alpha > 0.16 and confidence > 0.42:
            action = "LONG"
        elif alpha < -0.16 and confidence > 0.42:
            action = "SHORT"
        else:
            action = "FLAT"

        top = sorted(factors, key=lambda f: abs(f.contrib), reverse=True)[:2]
        reason = "主导因子：" + "、".join(f"{t.cn}({t.score:+.2f})" for t in top)
        if action == "FLAT":
            reason = f"信号未达阈值（α={alpha:+.3f}）｜" + reason

        return SymbolSignal(symbol, price, alpha, confidence, action,
                            factors, atr_pct, vol, reason)
