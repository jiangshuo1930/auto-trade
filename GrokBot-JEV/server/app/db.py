"""SQLite 持久化：ticks / decisions / fills / equity（Jev-Trades 纸面交易落库）"""
import sqlite3, threading, json, time
from .config import DB_PATH

_lock = threading.Lock()
_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_conn.execute("PRAGMA journal_mode=WAL;")

SCHEMA = """
CREATE TABLE IF NOT EXISTS ticks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, sym TEXT, px REAL);
CREATE TABLE IF NOT EXISTS candles(
  id INTEGER PRIMARY KEY AUTOINCREMENT, sym TEXT, ts INTEGER, o REAL, h REAL, l REAL, c REAL, v REAL,
  UNIQUE(sym, ts));
CREATE TABLE IF NOT EXISTS decisions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, bot TEXT, sym TEXT, act TEXT,
  conf REAL, size REAL, risk TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS fills(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, sym TEXT, side TEXT,
  qty REAL, px REAL, fee REAL, pnl REAL);
CREATE TABLE IF NOT EXISTS equity(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, value REAL);
CREATE INDEX IF NOT EXISTS ix_ticks_ts ON ticks(ts);
"""

def init():
    with _lock:
        _conn.executescript(SCHEMA)
        _conn.commit()

def _exec(sql, args=()):
    with _lock:
        _conn.execute(sql, args)
        _conn.commit()

def save_tick(sym, px):
    _exec("INSERT INTO ticks(ts,sym,px) VALUES(?,?,?)", (time.time(), sym, px))

def save_candle(sym, c):
    _exec("INSERT OR REPLACE INTO candles(sym,ts,o,h,l,c,v) VALUES(?,?,?,?,?,?,?)",
          (sym, int(c["t"]), c["o"], c["h"], c["l"], c["c"], c["v"]))

def save_decision(d):
    _exec("INSERT INTO decisions(ts,bot,sym,act,conf,size,risk,reason) VALUES(?,?,?,?,?,?,?,?)",
          (time.time(), d["bot"], d["sym"], d["act"], d["conf"], d["size"], d["risk"], d["reason"]))

def save_fill(f):
    _exec("INSERT INTO fills(ts,sym,side,qty,px,fee,pnl) VALUES(?,?,?,?,?,?,?)",
          (time.time(), f["sym"], f["side"], f["qty"], f["px"], f["fee"], f["pnl"]))

def save_equity(v):
    _exec("INSERT INTO equity(ts,value) VALUES(?,?)", (time.time(), v))

def recent(table, n=40):
    with _lock:
        cur = _conn.execute(f"SELECT * FROM {table} ORDER BY id DESC LIMIT ?", (n,))
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

def stats():
    with _lock:
        t = _conn.execute("SELECT COUNT(*) FROM ticks").fetchone()[0]
        d = _conn.execute("SELECT COUNT(*) FROM decisions").fetchone()[0]
        f = _conn.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
    return {"ticks": t, "decisions": d, "fills": f}
