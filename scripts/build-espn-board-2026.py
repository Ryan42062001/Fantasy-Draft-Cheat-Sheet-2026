import json
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
payload = {
    "meta": {
        "title": "2026 ESPN Fantasy Football Draft Kit - PPR Top 300 Cheat Sheet",
        "sourceFile": source.name,
        "playerCount": len(players),
    },
    "players": players,
}
output.write_text("window.ESPN_2026_PPR_BOARD = " + json.dumps(payload, indent=2) + ";\n", encoding="utf-8")
print(f"Wrote {len(players)} ESPN board ranks to {output}")
