import json
import csv
import os
import urllib.request

MCP_URL = "http://127.0.0.1:3001/mcp"
BATCH_SIZE = 200
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def mcp_call(session_id, method, params):
    """Make an MCP tool call, return (new_session_id, parsed_result_or_None)."""
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "tools/call",
            "params": {"name": method, "arguments": params},
        },
        ensure_ascii=False,
    ).encode("utf-8")

    req = urllib.request.Request(
        MCP_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )
    if session_id:
        req.add_header("mcp-session-id", session_id)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            new_sid = session_id
            if not session_id:
                new_sid = resp.headers.get("mcp-session-id", "")
            text = resp.read().decode("utf-8")

            for line in text.splitlines():
                line = line.strip()
                if line.startswith("data:"):
                    try:
                        data = json.loads(line[5:].strip())
                        if "result" in data and data["result"] and "content" in data["result"]:
                            for c in data["result"]["content"]:
                                if c.get("type") == "text":
                                    return new_sid, json.loads(c["text"])
                    except (json.JSONDecodeError, KeyError):
                        continue
            return new_sid, None
    except Exception as e:
        print(f"  MCP error: {e}", flush=True)
        return session_id, None


def mcp_init():
    """Initialize MCP session, return session_id."""
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": "init",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "timeline-export", "version": "1"},
            },
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        MCP_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        sid = resp.headers.get("mcp-session-id", "")
        return sid


def extract_val(cell):
    """Extract display string from cell."""
    if not cell:
        return ""
    v = cell.get("value", {})
    if isinstance(v, dict):
        raw = v.get("raw", "")
        if isinstance(raw, dict):
            return raw.get("formatted", str(raw))
        return str(raw) if raw not in (None, "") else ""
    return str(v) if v is not None else ""


def extract_link_id(cell):
    """Extract link row_id."""
    if not cell:
        return -1
    v = cell.get("value", {})
    if isinstance(v, dict):
        return v.get("row_id", -1)
    return -1


def extract_bool(cell):
    if not cell:
        return False
    v = cell.get("value", {})
    if isinstance(v, dict):
        return v.get("raw", False)
    return False


def extract_int(cell):
    if not cell:
        return 0
    v = cell.get("value", {})
    if isinstance(v, dict):
        return int(v.get("raw", 0))
    return 0


# ---- Step 1: Init ----
print("Initializing EXDViewer MCP...", flush=True)
sid = mcp_init()
print(f"Session: {sid[:20]}...", flush=True)

# ---- Step 2: Load ActionCategory ----
print("\nLoading ActionCategory...", flush=True)
categories = {}
offset = 0
while True:
    sid, result = mcp_call(sid, "query_rows", {"name": "ActionCategory", "limit": BATCH_SIZE, "offset": offset})
    if result is None:
        break
    rows = result.get("rows", [])
    for row in rows:
        categories[row.get("row_id", 0)] = extract_val(row.get("f_0"))
    offset += len(rows)
    if len(rows) < BATCH_SIZE:
        break

print(f"ActionCategory: {len(categories)} entries", flush=True)

# ActionCategory table IDs:
# 1=自动攻击, 2=魔法, 3=战技, 4=能力, 5=道具, 6=采集, 7=制作, 8=任务, 9=极限技, 10=系统, 11=坐骑, 12=特殊, 13=场景
# spell_type: 0=魔法, 1=能力, 2=战技, 3=其他
CAT_TO_TYPE = {2: 0, 3: 2, 4: 1}
CAT_TO_TYPE_DEFAULT = 3

# ---- Step 3: Export Action ----
print("\nExporting Action table (filtering IsPlayerAction=true, no PvP, ClassJob>0)...", flush=True)
actions = []
offset = 0
page = 0
total_scanned = 0

while True:
    sid, result = mcp_call(sid, "query_rows", {"name": "Action", "limit": BATCH_SIZE, "offset": offset})
    if result is None:
        break
    rows = result.get("rows", [])
    if not rows:
        break

    page += 1
    total_scanned += len(rows)

    for row in rows:
        is_player = extract_bool(row.get("f_69"))
        is_pvp = extract_bool(row.get("f_58"))
        classjob_id = extract_link_id(row.get("f_36"))

        if not is_player:
            continue
        if is_pvp:
            continue
        if classjob_id < 0:
            continue

        name = extract_val(row.get("f_0"))
        cat_id = extract_link_id(row.get("f_15"))
        cast_type = extract_int(row.get("f_21"))
        row_id = row.get("row_id", 0)

        spell_type = CAT_TO_TYPE.get(cat_id, CAT_TO_TYPE_DEFAULT)
        cat_name = categories.get(cat_id, "")

        actions.append(
            {
                "id": row_id,
                "name": name,
                "category_id": cat_id,
                "category_name": cat_name,
                "spell_type": spell_type,
                "cast_type": cast_type,
                "classjob_id": classjob_id,
            }
        )

    offset += len(rows)
    if page % 40 == 0:
        print(f"  Page {page}: scanned {total_scanned}, exported {len(actions)}...", flush=True)

    if len(rows) < BATCH_SIZE:
        break

print(f"\nExported {len(actions)} player actions (scanned {total_scanned} rows)", flush=True)

# ---- Step 4: Write CSV ----
os.makedirs(OUTPUT_DIR, exist_ok=True)
csv_path = os.path.join(OUTPUT_DIR, "actions.csv")
with open(csv_path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["id", "name", "category_id", "category_name", "spell_type", "cast_type", "classjob_id"])
    w.writeheader()
    w.writerows(actions)
print(f"CSV: {csv_path}", flush=True)

# ---- Step 5: Write JSON lookup ----
json_path = os.path.join(OUTPUT_DIR, "actions.json")
lookup = {}
for a in actions:
    lookup[str(a["id"])] = {"n": a["name"], "c": a["category_id"], "cn": a["category_name"], "t": a["spell_type"], "ct": a["cast_type"]}
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(lookup, f, ensure_ascii=False, separators=(",", ":"))
print(f"JSON: {json_path} ({len(lookup)} entries)", flush=True)
print("Done!", flush=True)
