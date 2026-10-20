"""全局配置。"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env_float(key: str, default: float) -> float:
    try:
        return float(os.getenv(key, default))
    except (TypeError, ValueError):
        return default


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, default))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Settings:
    """运行参数，均可通过环境变量覆盖。"""

    # ---- 行情 ----
    symbols: tuple[str, ...] = (
        "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
        "XRPUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT",
    )
    kline_interval: str = "1m"
    kline_limit: int = 300              # 每标的预热 K 线数量
    ws_url: str = "wss://stream.binance.com:9443/stream"
    rest_base: str = "https://api.binance.com"
    reconnect_base: float = 1.0
    reconnect_max: float = 30.0

    # ---- 引擎 ----
    tick_hz: float = 2.0                # 决策引擎评估频率
    equity_start: float = 100_000.0
    fee_bps: float = 4.0                # 单边手续费 (bp)
    slippage_bps: float = 1.5
    max_position_pct: float = 0.18      # 单标的仓位上限
    max_gross_pct: float = 0.65         # 总仓位上限
    max_drawdown_stop: float = 0.12     # 组合回撤熔断
    risk_per_trade: float = 0.008       # 单笔风险预算（净值占比）

    # ---- 服务 ----
    host: str = os.getenv("QNO_HOST", "127.0.0.1")
    port: int = _env_int("QNO_PORT", 8777)
    push_hz: float = _env_float("QNO_PUSH_HZ", 4.0)
    event_buffer: int = 400
    allow_offline: bool = os.getenv("QNO_OFFLINE", "1") != "0"   # 网络失败时用合成行情

    @property
    def stream_url(self) -> str:
        streams = "/".join(
            f"{s.lower()}@aggTrade" for s in self.symbols
        ) + "/" + "/".join(
            f"{s.lower()}@kline_{self.kline_interval}" for s in self.symbols
        )
        return f"{self.ws_url}?streams={streams}"


settings = Settings()

# 展示用中文名
SYMBOL_LABEL: dict[str, str] = {
    "BTCUSDT": "BTC/USDT",
    "ETHUSDT": "ETH/USDT",
    "SOLUSDT": "SOL/USDT",
    "BNBUSDT": "BNB/USDT",
    "XRPUSDT": "XRP/USDT",
    "DOGEUSDT": "DOGE/USDT",
    "AVAXUSDT": "AVAX/USDT",
    "LINKUSDT": "LINK/USDT",
}
