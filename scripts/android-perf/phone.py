from pathlib import Path
import csv, json, math, re, sqlite3, subprocess, sys, time, tempfile, os
from io import BytesIO
# the adb binary, the device and the app package come from the environment, so the scripts run on any machine
ADB = os.environ.get("ADB") or (os.environ.get("LOCALAPPDATA", "") + "/Android/Sdk/platform-tools/adb.exe")
SER = os.environ["ANDROID_SERIAL"]
PKG = os.environ.get("PERF_PACKAGE", "com.nerdlin.blockerino.perf")
HERE = Path(__file__).parent
def run(*args, data=None, check=True):
    return subprocess.run([ADB, "-s", SER, *args], check=check, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
def sh(*args, **kw): return run("shell", *args, **kw).decode(errors="replace")
def snap(path=None):
    raw = run("exec-out", "screencap", "-p")
    if path: Path(path).write_bytes(raw)
    return raw
def board_cells(mode):
    return 8 if mode == "classic" else 10
def build_db(mode, scenario, skin="piece_circuit_terminal"):
    n = board_cells(mode)
    cell = lambda t=0: {"blockType": t, "color": {"r": 94, "g": 114, "b": 145}, "hoveredBreakColor": {"r": 0, "g": 0, "b": 0}}
    body = {
        "gameMode": mode,
        "board": [[cell() for _ in range(n)] for _ in range(n)],
        "hand": [{"matrix": [[1, 0], [1, 1], [1, 0]], "distributionPoints": 1, "color": {"r": 36, "g": 217, "b": 149}} for _ in range(3 if n == 8 else 5)],
        "score": 0, "combo": 0, "lastBrokenLine": 0, "handCount": 0,
    }
    if scenario == "line":
        for b in body["board"][-1][:-1]: b["blockType"] = 4
        body["hand"][0]["matrix"] = [[1]]
        body["score"], body["combo"] = 100, 3
    p = HERE / f"{mode}_{scenario}.sqlite"
    if p.exists():
        try: p.unlink()
        except OSError: p = HERE / f'{mode}_{scenario}_{int(time.time())}.sqlite'
    db = sqlite3.connect(p)
    with db:
        db.execute("CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.execute("PRAGMA user_version=1")
        for k, v in {
            "FIRST_RUN_DONE": "true", "APP_LANGUAGE": "ru",
            "SHOP_STATE_V1": json.dumps({"balance": 250, "ownedItemIds": [skin], "equipped": {"piece_skin": skin}, "starterGrantClaimed": True}),
            "ACTIVE_GAME": json.dumps(body),
        }.items():
            db.execute("INSERT OR REPLACE INTO catalystLocalStorage VALUES (?,?)", (k, v))
    db.close()
    return p
def seed(mode, scenario, skin="piece_circuit_terminal"):
    p = build_db(mode, scenario, skin)
    sh("am", "force-stop", PKG)
    sh("run-as", PKG, "mkdir", "-p", "databases")
    sh("run-as", PKG, "rm", "-f", "databases/RKStorage-wal", "databases/RKStorage-shm", "databases/RKStorage-journal")
    run("exec-in", "run-as " + PKG + " sh -c 'cat > databases/RKStorage'", data=p.read_bytes())
    sh("am", "start", "-W", "-n", PKG + "/com.nerdlin.blockerino.MainActivity")
def state():
    d = Path(tempfile.mkdtemp())
    for name in ("RKStorage", "RKStorage-wal", "RKStorage-shm"):
        raw = run("exec-out", "run-as", PKG, "cat", "databases/" + name, check=False)
        if raw and b"run-as:" not in raw[:40]: (d / name).write_bytes(raw)
    db = sqlite3.connect(d / "RKStorage")
    row = db.execute("select value from catalystLocalStorage where key='ACTIVE_GAME'").fetchone()
    db.close()
    if not row: return None
    g = json.loads(row[0])
    filled = sum(1 for r in g["board"] for c in r if c["blockType"] == 4)
    return (g["score"], g["combo"], filled)
def mark(*args):
    out = sh("CLASSPATH=/data/local/tmp/blockerino-framemark-qa.jar app_process /system/bin FrameMarkQA " + " ".join(str(x) for x in args))
    m = {k: int(v) for k, v in re.findall(r"(begin|end) ([0-9]+)", out)}
    assert set(m) == {"begin", "end"}, out
    return m
WIN = 1_800_000_000
def stats(raw, marks, pre=50_000_000):
    low, high = marks["end"] - (marks["end"] - marks["begin"]) - pre, marks["end"] + WIN
    seen = {}
    for block in raw.split("---PROFILEDATA---"):
        ls = block.strip().splitlines()
        if not ls or not ls[0].startswith("Flags,"): continue
        for r in csv.DictReader(ls):
            try:
                iv, fc, dl, fl = int(r["IntendedVsync"]), int(r["FrameCompleted"]), int(r["FrameDeadline"]), int(r["Flags"])
                if not (low <= iv <= high and fl == 0 and 0 < fc - iv < 5_000_000_000): continue
                seen[iv] = ((fc - iv) / 1e6, dl > iv and fc > dl)
            except (KeyError, ValueError, TypeError): continue
    v = list(seen.values()); t = sorted(x[0] for x in v)
    q = lambda p: round(t[math.ceil(p * len(t)) - 1], 1) if t else None
    return {"frames": len(v), "jank": sum(x[1] for x in v), "p50": q(.5), "p95": q(.95), "p99": q(.99), "max": q(1), "over33": sum(x > 33.4 for x in t), "over50": sum(x > 50 for x in t)}
def phase(name, marks):
    time.sleep(WIN / 1e9 + .2)
    raw = sh("dumpsys", "gfxinfo", PKG, "framestats")
    s = stats(raw, marks)
    print(json.dumps({"phase": name, **s}), flush=True)
    return s

import threading
class Collector:
    """gfxinfo keeps only the last 120 frames; an app that renders continuously overwrites them in two seconds,
    so the frames of a scenario are collected by polling and merged by IntendedVsync."""
    def __init__(self):
        self.rows = {}; self.stop = False
        self.t = threading.Thread(target=self.loop, daemon=True)
    def start(self):
        sh("dumpsys", "gfxinfo", PKG, "reset"); self.t.start(); return self
    def loop(self):
        while not self.stop:
            try: self.take(sh("dumpsys", "gfxinfo", PKG, "framestats"))
            except Exception: pass
            time.sleep(0.25)
    def take(self, raw):
        for block in raw.split("---PROFILEDATA---"):
            ls = block.strip().splitlines()
            if not ls or not ls[0].startswith("Flags,"): continue
            for r in csv.DictReader(ls):
                try:
                    v = {k: int(x) for k, x in r.items() if k and x}
                except ValueError: continue
                if v.get("Flags") == 0 and 0 < v["FrameCompleted"] - v["IntendedVsync"] < 5_000_000_000: self.rows[v["IntendedVsync"]] = v
    def finish(self):
        time.sleep(0.4); self.stop = True; self.t.join(); self.take(sh("dumpsys", "gfxinfo", PKG, "framestats"))
        return self.rows
def summarize(rows, lo, hi):
    sel = [v for iv, v in rows.items() if lo <= iv <= hi]
    t = sorted((v["FrameCompleted"] - v["IntendedVsync"]) / 1e6 for v in sel)
    miss = sum(1 for v in sel if v["FrameDeadline"] > v["IntendedVsync"] and v["FrameCompleted"] > v["FrameDeadline"])
    q = lambda p: round(t[math.ceil(p * len(t)) - 1], 1) if t else None
    return {"frames": len(sel), "miss": miss, "p50": q(.5), "p95": q(.95), "p99": q(.99), "max": q(1), "over33": sum(x > 33.4 for x in t), "over50": sum(x > 50 for x in t), "overrun_ms": round(sum(max(0, x - 16.7) for x in t))}
