"""全局配置：标的、纸面交易参数、SQLite 路径"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # .../GrokBot-JEV
DATA_DIR = ROOT / "server" / "data_store"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "jev_trades.db"

WEB_DIR = ROOT                                     # 静态资源根

SYMBOLS = ["SOL-USD", "BTC-USD", "ETH-USD", "DOGE-USD", "WIF-USD"]
PRIMARY = "SOL-USD"

START_CASH = 50_000.0
MAX_POS_PCT = 0.25          # 单标的仓位上限
FEE_BPS = 4.0               # 手续费 4bps
SLIP_BPS = 2.0              # 滑点 2bps

TICK_MS = 600               # WS 推送节拍
CANDLE_SEC = 60
HISTORY = 150               # 初始 K 线根数

YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1m&range=1d"
HTTP_TIMEOUT = 6
