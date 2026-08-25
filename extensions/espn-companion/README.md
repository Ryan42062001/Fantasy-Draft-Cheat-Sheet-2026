# The War Room — ESPN Draft Companion

Manifest V3 Chrome extension that passively observes ESPN fantasy-football draft state and reconciles completed picks into The War Room.

## Current status

Version 0.9.3 observes structured data ESPN's own page receives through WebSocket, fetch, XHR, and bounded React-state inspection. A unified ledger reconciles those observations by overall pick and ESPN player ID. ESPN's REST draft-detail response is retained as a snapshot/recovery source, and visible Pick History/Board parsing remains the final fallback. This architecture is implemented and replay-tested, but structured live capture still requires a disposable live-mock validation before it should be relied on for a real draft.

The extension does **not** read or store ESPN passwords, cookies, authentication headers, or tokens. Page observers are read-only: they do not create draft actions, alter ESPN payloads, or make duplicate live-data requests. Only normalized pick candidates and sanitized structural telemetry cross into extension storage.

## Install locally

1. In Chrome, open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extensions/espn-companion` folder.
5. Open The War Room from either:
   - `http://127.0.0.1:8765/`
   - `http://localhost:8765/`
   - `https://ryan42062001.github.io/Fantasy-Draft-Cheat-Sheet-2026/`
6. Open an ESPN fantasy-football mock or live draft in another Chrome tab.
7. Open the extension popup. Confirm that both ESPN and The War Room show as connected.
8. Press **Rescan ESPN** after the draft room finishes loading.
9. After any extension code update, return to `chrome://extensions` and press **Reload** on the companion card. The popup shows the installed version and warns when the open War Room requires a newer build.

Chrome displays an extension popup over the upper-right corner of the current page. It is not part of ESPN and closes as soon as you click the draft room. Use **Open controls in a tab** if you want status to stay visible without covering ESPN. The extension-icon badge shows the captured-pick count while the popup is closed.

## How synchronization works

```text
ESPN WebSocket / fetch / XHR / React state (structured live capture)
  -> espn-live-observer.js (MAIN world, passive observation)
  -> espn-live-capture.js (normalization and sanitized telemetry)
  -> espn-content.js
ESPN REST draft snapshot + Pick History/Board DOM (recovery/fallback)
  -> espn-page-bridge.js / espn-api.js / espn-parser.js
  -> background.js (ID-first, conflict-aware unified pick ledger)
  -> war-room-content.js
  -> window message contract
  -> applyEspnDraftSnapshot() in The War Room
  -> existing board updates + autosave
```

- Overall picks are deduplicated across all sources and stored by the extension.
- Matching ESPN player IDs confirm an observation; disagreements are retained as visible conflicts instead of silently overwritten.
- Structured sources use ESPN's actual team ID to determine `Mine` versus `Taken` when it is present.
- REST snapshots can recover structured records but are no longer treated as proof that the live feed is authoritative.
- Board fallback derives snake-draft team slots from overall pick and league size.
- The popup lists the exact captured pick numbers and players currently classified as `Mine`.
- The website reconciles the complete ESPN snapshot instead of blindly replaying clicks.
- ESPN player ID is used first when the website has learned it; FantasyPros canonical-name, suffix-tolerant, and DST matching are fallbacks.
- ESPN-sourced rows carry `data-sync-source="espn"`, allowing a later full snapshot to repair missed or corrected picks.

## Draft-night safeguards

- Keep manual marking available as a fallback.
- Verify the Captured, Applied, and Unmatched counts after the first few mock-draft picks.
- If Captured is greater than Applied, press **Rescan ESPN**. Version 0.9.0 keeps acknowledgments monotonic, forces a React-state rescan, and resends one trailing snapshot while retaining the terminal-pick and post-draft safeguards from 0.8.11.
- Use **Copy diagnostics** to capture the installed/required versions, connection method, sync counts, completion state, and structured API status without exposing ESPN credentials.
- Follow `LIVE_VALIDATION.md` for the two remaining full-draft checks: Direct mode and forced Board fallback.
- Prefer **Draft detected · Live capture** with Structured page state or Network observation active. If only **Board fallback** is active, open ESPN's Board or Pick History tab once and press Rescan.
- The Live capture panel distinguishes structured page state, network observation, Board fallback, and confirmed/conflicting picks. REST status remains available in diagnostics as supporting evidence.
- If ESPN's pick-history view falls behind, any visible player row explicitly labeled **DRAFTED** is suppressed from War Room recommendations without guessing its pick number or ownership.
- If Unmatched is nonzero, manually mark that player and record the exact ESPN display name so an alias or selector fixture can be added.
- Use **Clear captured picks** only before starting a new mock or real draft.

## FantasyPros API key

Version 0.9.3 adds a masked key field, a read-only access test, and a guarded Top-20 expert refresh through FantasyPros' official 2026 PPR API. The key is stored separately in `chrome.storage.local`; it is never returned by status requests, copied diagnostics, or War Room snapshots. Use **Remove** to delete it from extension storage. The update is rejected unless exactly 20 prior-season draft experts and 100–600 unique, position-valid players are returned; CSV import remains available as fallback. API and bridge failures are returned to the ranking modal, and each request times out instead of leaving the interface indefinitely busy.

## Test

From this directory:

```powershell
npm test
```

The tests cover ESPN pick text variants, round-to-overall conversion, snake turns, defenses, player IDs, and rejection of undrafted queue/player-list text.

## Why this is currently a monorepo package

The extension and website share a versioned sync message contract. Keeping them together for the first version prevents protocol drift and makes end-to-end testing easier. The folder contains no imports from the parent repository and can be moved into a separate repository later if it is published independently.
