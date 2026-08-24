# The War Room

The War Room is the fantasy draft tool I wanted beside me during an ESPN draft: one screen for the board, my roster, the next turn, and the decisions that actually matter.

It is built for redraft PPR leagues. FantasyPros expert consensus rankings establish player value, while ESPN board rank and ADP help estimate whether a player is likely to make it back. The recommendation engine keeps those jobs separate—market behavior can change the timing of a pick, but it does not rewrite the player rankings.

[Open The War Room](https://ryan42062001.github.io/Fantasy-Draft-Cheat-Sheet-2026/)

## What it does

- Tracks every player as available, taken, or mine
- Builds a live roster and highlights remaining starter needs
- Recommends a pick using ECR value, roster construction, scarcity, and market timing
- Estimates next-turn survival using ESPN board rank and ESPN ADP when available
- Handles snake-draft settings from 2–20 teams and 5–30 rounds
- Saves separate draft sessions in the browser
- Produces a post-draft report with value, lineup, and waiver-watch notes
- Syncs ESPN mock and live drafts through the optional Chrome companion

## Ranking approach

The board is intentionally opinionated about which source answers which question.

| Question | Source |
| --- | --- |
| How good is the player? | FantasyPros Top-20 Draft Experts PPR ECR |
| What if a deeper player is missing? | Broader FantasyPros PPR ECR |
| When will ESPN rooms take him? | ESPN default PPR board rank, then ESPN PPR ADP |
| What if ESPN market data is unavailable? | FantasyPros PPR ADP |

The generated dataset currently contains 717 searchable players. ADP-only players remain searchable depth; the app does not invent an ECR for them.

## Using the board

1. Set the league size, draft slot, and number of rounds in **Draft Position**.
2. Leave **Taken** selected for normal picks. Choose **Mine**—or press `M`—before selecting your own player.
3. Open **My Draft** to check lineup construction, pick history, value, and bye-week concentration.
4. Expand **Recommended Pick** or **Board Pressure** when you want the supporting detail.

Everything is stored locally in the browser. **New Draft** creates an isolated session, and **Delete Draft** removes only the selected session after confirmation.

## ESPN Companion

The Chrome companion can read the open ESPN draft room and send a complete pick snapshot to The War Room. Draft settings can be changed from either the website or extension; the two stay synchronized.

To install it locally:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `extensions/espn-companion` from this repository.
5. Refresh both ESPN and The War Room after installing a new version.

The popup reports whether it is using ESPN's structured feed or the visible draft board fallback. **Copy diagnostics** creates a credential-free troubleshooting report. More detail is in [the companion guide](extensions/espn-companion/README.md).

## Running locally

The project is a static site, so any basic local server works:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

Install the development dependency and run the full verification suite with:

```powershell
npm install
npm test
```

The test suite checks JavaScript syntax, the protected FantasyPros dataset baseline, the Chrome companion, board integrity, recommendation scenarios, persistence, ESPN reconciliation, and responsive behavior.

## Project map

```text
index.html                         Page structure and draft-day controls
style.css                         Responsive interface and visual system
script.js                         Board, state, scoring, and recommendation logic
war-room-config.js                League and recommendation configuration
fantasypros-2026-data.js          Generated browser dataset
developer-tools.js                Simulations and regression diagnostics
data/                              Ranking sources and generated master data
scripts/                           Dataset builder and automated browser tests
extensions/espn-companion/        Chrome extension for live ESPN sync
AGENTS.md                          Ranking policy, architecture notes, and roadmap
```

## Updating rankings

Use **Update Rankings** in The War Room toolbar for the two live-market maintenance paths:

- Import a current FantasyPros Top-20 PPR expert CSV. The import replaces only the primary expert overlay, validates every player against the broader ECR pool, and retains broad ECR for deeper players.
- Ask Companion 0.8.8 or newer to refresh ESPN PPR board rank and ADP from an open ESPN draft page.

The browser stores a validated FantasyPros overlay locally. **Restore bundled rankings** returns to the repository snapshot. ESPN market data changes survival timing only; it never replaces FantasyPros ECR as player value.

Source CSVs live in `data/`. After replacing the FantasyPros exports, rebuild and validate the board:

```powershell
node scripts/build-fantasypros-2026.mjs
npm run test:dataset
npm run test:browser
```

The baseline is hash-protected so an accidental ranking change fails loudly instead of quietly changing draft behavior.

## A note on recommendations

This is a draft assistant, not a projection of the season. Injuries, depth-chart changes, league scoring, and personal risk tolerance still matter. The app explains why it prefers a player and keeps recommendation-audit evidence from completed mocks, but it never tunes its own weights automatically.

Built for draft day, tested with ESPN mocks, and always meant to leave the final call with the person on the clock.
