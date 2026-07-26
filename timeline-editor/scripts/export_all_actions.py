"""Export the full FFXIV Action table (player + boss/NPC skills) to data/actions.json.

The PR timeline editor needs boss cast/effect names for anchor sync rules, which
the player-only export (export_actions.py) does not cover.

Sources, tried in order:
  1. Installed game client via exd_reader (default) — authoritative, always
     matches the client version, no external service needed.
  2. EXDViewer MCP at http://127.0.0.1:3001/mcp — only listens once EXDViewer's
     setup wizard has been completed.
  3. ffxiv-datamining-cn Action.csv — public dump, several patches behind.

Output (compact, keyed by action id):
  { "<id>": { "n": name, "c": categoryId, "t": spellType, "ct": castType, "p": isPlayerAction } }

  t (spell_type): 0=魔法 1=能力 2=战技 3=其他
  p: 1 for player actions (IsPlayerAction && !IsPvP && ClassJob >= 0)

Usage:
  python -X utf8 scripts/export_all_actions.py                 # auto-detect game path
  python -X utf8 scripts/export_all_actions.py --game "C:/Games/FFXIV"
  python -X utf8 scripts/export_all_actions.py --source mcp
  python -X utf8 scripts/export_all_actions.py --source csv [path/to/Action.csv]
"""
import argparse
import csv
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

MCP_URL = "http://127.0.0.1:3001/mcp"
CSV_URL = "https://raw.githubusercontent.com/thewakingsands/ffxiv-datamining-cn/master/Action.csv"
BATCH_SIZE = 200
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# ActionCategory row id -> spell_type
CAT_TO_TYPE = {2: 0, 3: 2, 4: 1}
CAT_TO_TYPE_DEFAULT = 3

# Action.exh column indices.
# Verified against the installed 7.x client by cross-checking 1171 ids exported
# earlier through EXDViewer: Name/ActionCategory/CastType matched 100%, and
# col 68 is True for every player action and false for every boss action sampled
# from the real timelines. EXH column order drifts between patches — re-run
# scripts/probe_action_columns.py logic if a future patch breaks the mapping.
COL_NAME = 0
COL_CATEGORY = 3
COL_CLASSJOB = 10
COL_CAST_TYPE = 28
COL_IS_PLAYER = 68


def default_game_paths():
    """Common CN/global install locations, plus XIVLauncherCN's configured path."""
    candidates = []
    cfg = os.path.join(os.environ.get("APPDATA", ""), "XIVLauncherCN", "launcherConfigV3.json")
    if os.path.exists(cfg):
        try:
            with open(cfg, encoding="utf-8-sig") as f:
                game_path = json.load(f).get("GamePath")
            if game_path:
                candidates.append(game_path)
        except Exception:
            pass
    candidates += [
        r"C:\Games\最终幻想XIV",
        r"C:\Program Files (x86)\SquareEnix\FINAL FANTASY XIV - A Realm Reborn",
        r"C:\Program Files (x86)\SNDA\FFXIV",
    ]
    return candidates


# ---------------------------------------------------------------- game client

def try_game(game_path=None):
    """Read Action straight out of the installed client. Returns {id: record} or None."""
    from exd_reader import GameData

    paths = [game_path] if game_path else default_game_paths()
    for path in paths:
        if not path or not os.path.isdir(os.path.join(path, "game", "sqpack", "ffxiv")):
            continue
        print(f"  读取游戏本体：{path}", flush=True)
        gd = GameData(path)
        columns = [COL_NAME, COL_CATEGORY, COL_CLASSJOB, COL_CAST_TYPE, COL_IS_PLAYER]
        rows = gd.read_sheet("Action", columns, language=5)

        actions = {}
        for row_id, values in rows.items():
            raw_name = values[0]
            name = raw_name.decode("utf-8", "replace") if isinstance(raw_name, bytes) else str(raw_name or "")
            if not name:
                continue
            category = int(values[1] or 0)
            actions[str(row_id)] = {
                "n": name,
                "c": category,
                "t": CAT_TO_TYPE.get(category, CAT_TO_TYPE_DEFAULT),
                "ct": int(values[3] or 0),
                "p": 1 if bool(values[4]) else 0,
            }
        if actions:
            return actions
    print("  未找到已安装的游戏客户端", flush=True)
    return None


# ---------------------------------------------------------------- EXDViewer MCP

def mcp_post(payload, session_id=None, timeout=30):
    req = urllib.request.Request(
        MCP_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"},
        method="POST",
    )
    if session_id:
        req.add_header("mcp-session-id", session_id)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.headers.get("mcp-session-id", session_id), resp.read().decode("utf-8")


def mcp_parse(text):
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        try:
            data = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        for chunk in (data.get("result") or {}).get("content", []):
            if chunk.get("type") == "text":
                try:
                    return json.loads(chunk["text"])
                except json.JSONDecodeError:
                    return None
    return None


def cell_raw(cell):
    if not cell:
        return None
    value = cell.get("value")
    if isinstance(value, dict):
        raw = value.get("raw")
        return raw.get("formatted", "") if isinstance(raw, dict) else raw
    return value


def cell_link_id(cell):
    if not cell:
        return -1
    value = cell.get("value")
    return value.get("row_id", -1) if isinstance(value, dict) else -1


def try_mcp():
    try:
        sid, _ = mcp_post({
            "jsonrpc": "2.0", "id": "init", "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "timeline-export", "version": "2"}},
        }, timeout=5)
    except Exception as err:
        print(f"  EXDViewer MCP 不可用（需先在 EXDViewer 中完成设置向导）：{err}", flush=True)
        return None

    print("  EXDViewer MCP 已连接，导出 Action 表...", flush=True)
    actions, offset, page = {}, 0, 0
    while True:
        sid, result = mcp_post({
            "jsonrpc": "2.0", "id": "1", "method": "tools/call",
            "params": {"name": "query_rows",
                       "arguments": {"name": "Action", "limit": BATCH_SIZE, "offset": offset}},
        }, sid)
        result = mcp_parse(result)
        if result is None:
            break
        rows = result.get("rows", [])
        if not rows:
            break
        for row in rows:
            name = cell_raw(row.get("f_0")) or ""
            if not name:
                continue
            cat = cell_link_id(row.get("f_15"))
            classjob = cell_link_id(row.get("f_36"))
            actions[str(row.get("row_id", 0))] = {
                "n": name,
                "c": cat,
                "t": CAT_TO_TYPE.get(cat, CAT_TO_TYPE_DEFAULT),
                "ct": int(cell_raw(row.get("f_21")) or 0),
                "p": 1 if (bool(cell_raw(row.get("f_69"))) and not bool(cell_raw(row.get("f_58"))) and classjob >= 0) else 0,
            }
        offset += len(rows)
        page += 1
        if page % 40 == 0:
            print(f"    已扫描 {offset} 行，收录 {len(actions)}", flush=True)
        if len(rows) < BATCH_SIZE:
            break
    return actions or None


# ---------------------------------------------------------------- CSV fallback

def col_index(header_row, wanted):
    for i, name in enumerate(header_row):
        if name == wanted:
            return i
    return -1


def try_csv(csv_path=None):
    if csv_path and os.path.exists(csv_path):
        print(f"  使用本地 CSV：{csv_path}", flush=True)
        raw = open(csv_path, "rb").read()
    else:
        print(f"  下载 {CSV_URL} ...", flush=True)
        with urllib.request.urlopen(CSV_URL, timeout=180) as resp:
            raw = resp.read()

    rows = list(csv.reader(raw.decode("utf-8-sig").splitlines()))
    if len(rows) < 4:
        raise RuntimeError("CSV 结构异常")
    names = rows[1]
    idx = {k: col_index(names, k) for k in
           ("Name", "ActionCategory", "CastType", "IsPlayerAction", "IsPvP", "ClassJob")}
    if idx["Name"] < 0 or idx["ActionCategory"] < 0:
        raise RuntimeError(f"CSV 缺少必需列: {idx}")

    def cell(row, key, default=""):
        i = idx[key]
        return row[i] if 0 <= i < len(row) else default

    actions = {}
    for row in rows[3:]:
        if not row or not row[0].strip().isdigit():
            continue
        name = cell(row, "Name").strip()
        if not name:
            continue
        try:
            cat = int(cell(row, "ActionCategory", "0") or 0)
        except ValueError:
            cat = 0
        try:
            classjob = int(cell(row, "ClassJob", "-1") or -1)
        except ValueError:
            classjob = -1
        try:
            cast_type = int(cell(row, "CastType", "0") or 0)
        except ValueError:
            cast_type = 0
        is_player = cell(row, "IsPlayerAction").strip().lower() == "true"
        is_pvp = cell(row, "IsPvP").strip().lower() == "true"
        actions[row[0].strip()] = {
            "n": name, "c": cat,
            "t": CAT_TO_TYPE.get(cat, CAT_TO_TYPE_DEFAULT),
            "ct": cast_type,
            "p": 1 if (is_player and not is_pvp and classjob >= 0) else 0,
        }
    return actions


# ---------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description="导出全量 Action 表（含 Boss/NPC 技能）")
    parser.add_argument("--source", choices=["auto", "game", "mcp", "csv"], default="auto")
    parser.add_argument("--game", help="游戏安装目录（含 game/sqpack）")
    parser.add_argument("csv_path", nargs="?", help="本地 Action.csv（--source csv 时可选）")
    args = parser.parse_args()

    print("导出全量 Action 表（含 Boss/NPC 技能）", flush=True)
    actions = None
    if args.source in ("auto", "game"):
        try:
            actions = try_game(args.game)
        except Exception as err:
            print(f"  读取游戏本体失败：{err}", flush=True)
    if not actions and args.source in ("auto", "mcp"):
        actions = try_mcp()
    if not actions and args.source in ("auto", "csv"):
        actions = try_csv(args.csv_path)
    if not actions:
        raise SystemExit("所有数据源均不可用")

    player = sum(1 for a in actions.values() if a["p"])
    print(f"\n共 {len(actions)} 条技能（玩家技能 {player} 条，其余为 Boss/NPC/系统技能）", flush=True)

    os.makedirs(OUT_DIR, exist_ok=True)
    json_path = os.path.join(OUT_DIR, "actions.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(actions, f, ensure_ascii=False, separators=(",", ":"))
    print(f"已写入 {json_path} ({os.path.getsize(json_path) / 1048576:.2f} MB)", flush=True)


if __name__ == "__main__":
    main()
