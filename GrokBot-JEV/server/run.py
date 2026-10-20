"""启动入口：python server/run.py"""
import sys, pathlib, webbrowser
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import uvicorn
from app.config import DB_PATH

if __name__ == "__main__":
    print(f"[GROKBOT+JEV] sqlite → {DB_PATH}")
    print("[GROKBOT+JEV] http://127.0.0.1:8788  (ws://127.0.0.1:8788/ws)")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8788, log_level="info")
