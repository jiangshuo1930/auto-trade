# auto-trade · 自动量化交易终端

一组面向加密市场（币安现货 / 永续）的「可视化量化交易」Demo：纯前端终端大屏 + Python 量化引擎 + 交易 Agent 指挥中心。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `index.html` + `assets/` | **MEDUSA QUANT TERMINAL** — 四象限交易终端大屏（纯静态，无需后端） |
| `web/` | **QNO · 交易 Agent 指挥中心** — 前端，通过 WebSocket 接收 `server/` 的实时快照 |
| `server/` | **QNO 量化引擎** — FastAPI：币安行情接入、7 因子打分、组合与风控、交易 Agent 决策 |
| `GrokBot-JEV/` | **GROKBOT + JEV · AI Agent 交易室** — Vue3 + three.js 三维交易室，独立 FastAPI 后端（SQLite 记账） |

---

## 1. MEDUSA QUANT TERMINAL（静态大屏）

直接用浏览器打开根目录的 `index.html` 即可，无构建、无依赖安装。

- 布局：CORE MODEL / LIFE OF A DECISION / ENTANGLEMENT MAP / BUY CURVE / THE ORB / DECISION STACK / SIX AGENTS / STATE BUILDER + LIVE FEED 跑马灯
- 视觉：`assets/js/orb.js` 中央星爆与神经光束，`assets/js/medusa.js` 水母读盘 Agent，`assets/js/panels.js` 面板渲染
- 依赖：`assets/vendor/echarts.min.js`、`topojson.min.js`、`china.json`（均已本地化）

## 2. QNO · 交易 Agent 指挥中心

后端启动（Python 3.10+）：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install fastapi "uvicorn[standard]"
python -m uvicorn server.app.main:app --host 127.0.0.1 --port 8777
```

然后访问 <http://127.0.0.1:8777>（`server/app/main.py` 会自动托管 `web/` 静态文件）。

接口：

- `GET /api/health` — 行情连接状态、客户端数、已跑决策周期
- `GET /api/snapshot` — 最新完整快照（净值、持仓、信号、事件、风控）
- `GET /api/symbols` — 标的列表
- `GET /api/candles/{symbol}?limit=200` — 该标的 K 线
- `WS /ws` — 按 `QNO_PUSH_HZ`（默认 4Hz）推送快照

可调环境变量：`QNO_HOST`、`QNO_PORT`、`QNO_PUSH_HZ`、`QNO_OFFLINE`（`0` 关闭离线合成行情）。

引擎要点：

- `server/app/data/feed.py` — 币安 WebSocket 聚合流接入，断线重连，网络不可用时回落合成行情
- `server/app/engine/factors.py` — 每个标的 7 因子打分
- `server/app/engine/portfolio.py` — 仓位、手续费/滑点、回撤熔断
- `server/app/engine/agent.py` — 决策循环与快照组装

冒烟测试（无需联网）：

```powershell
python server/tests/test_smoke.py
```

## 3. GROKBOT + JEV · AI Agent 交易室

```powershell
pip install -r GrokBot-JEV/server/requirements.txt
python GrokBot-JEV/server/run.py
```

访问 <http://127.0.0.1:8788>。后端使用 SQLite（`server/data_store/`，已加入 `.gitignore`）记录 JEV 交易流水。

---

## 免责声明

本项目仅用于技术演示与界面研究，所有行情、指标与「交易决策」均为模拟，不构成任何投资建议。
