import json
import hashlib
import re
import sys
from pathlib import Path

import pdfplumber

source = Path(sys.argv[1] if len(sys.argv) > 1 else "ESPN ADP Rankings.pdf")
output = Path(sys.argv[2] if len(sys.argv) > 2 else "espn-2026-board-data.js")
pattern = re.compile(r"(\d+)\. \(((?:QB|RB|WR|TE|K|DST)\d+)\) (.*?), ([A-Z]{2,3}) \$(\d+) (\d+)")

with pdfplumber.open(source) as pdf:
    text = "\n".join(page.extract_text() or "" for page in pdf.pages)

by_rank = {}
for rank, pos_rank, name, team, auction, bye in pattern.findall(text):
    rank = int(rank)
    if 1 <= rank <= 300 and rank not in by_rank:
        by_rank[rank] = {
            "rank": rank,
            "name": name.strip(),
            "position": re.sub(r"\d+$", "", pos_rank),
            "positionRank": pos_rank,
            "team": team,
            "auctionValue": int(auction),
            "bye": int(bye),
        }

missing = sorted(set(range(1, 301)) - set(by_rank))
if missing:
    raise RuntimeError(f"Missing ESPN board ranks: {missing}")

players = [by_rank[rank] for rank in range(1, 301)]
previous = None
if output.exists():
    try:
        previous = json.loads(output.read_text(encoding="utf-8").split("=", 1)[1].rsplit(";", 1)[0])
    except (ValueError, IndexError):
        previous = None
payload = {
    "meta": {
        "title": "2026 ESPN Fantasy Football Draft Kit - PPR Top 300 Cheat Sheet",
        "sourceFile": source.name,
        "season": 2026,
        "format": "PPR Top 300 default board",
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "playerCount": len(players),
    },
    "players": players,
}
output.write_text("window.ESPN_2026_PPR_BOARD = " + json.dumps(payload, indent=2) + ";\n", encoding="utf-8")
print(f"Wrote {len(players)} ESPN board ranks to {output}")
if previous:
    old = {player["name"]: player["rank"] for player in previous.get("players", [])}
    movers = sorted(((abs(old[player["name"]] - player["rank"]), player["name"], old[player["name"]], player["rank"])
                     for player in players if player["name"] in old and old[player["name"]] != player["rank"]), reverse=True)
    print("Largest rank changes: " + (", ".join(f"{name} {before}->{after}" for _, name, before, after in movers[:10]) or "none"))
