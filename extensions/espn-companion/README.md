# The War Room — ESPN Draft Companion

Manifest V3 Chrome extension that reads the visible ESPN fantasy-football draft history and reconciles completed picks into The War Room.

## Current status

The companion uses ESPN's structured draft-detail response through the authenticated ESPN page as its primary source and the visible Pick History/Board as a fallback. The War Room bridge, persistence, popup, exact ESPN team-ID ownership, name reconciliation, and parser fixtures are implemented. Live mock validation is still required before relying on it for a real draft.

The extension does **not** read or store ESPN passwords, cookies, or authentication tokens. The browser attaches the existing ESPN session to a narrowly scoped draft-detail request, and the extension stores only normalized completed picks.

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
ESPN authenticated page connection (primary) or Pick History/Board DOM (fallback)
  -> espn-page-bridge.js / espn-api.js / espn-content.js
  -> background.js (validated, deduplicated pick ledger)
  -> war-room-content.js
  -> window message contract
  -> applyEspnDraftSnapshot() in The War Room
  -> existing board updates + autosave
```

- Overall picks are deduplicated and stored by the extension.
- Direct mode uses ESPN's actual team ID to determine `Mine` versus `Taken`.
- Direct mode fetches structured draft and player records in ESPN's page context; it does not require the Board tab.
- Screen fallback derives snake-draft team slots from overall pick and league size.
- The popup lists the exact captured pick numbers and players currently classified as `Mine`.
- The website reconciles the complete ESPN snapshot instead of blindly replaying clicks.
- FantasyPros canonical-name matching is used first, with suffix-tolerant and DST matching fallbacks.
- ESPN-sourced rows carry `data-sync-source="espn"`, allowing a later full snapshot to repair missed or corrected picks.

## Draft-night safeguards

- Keep manual marking available as a fallback.
- Verify the Captured, Applied, and Unmatched counts after the first few mock-draft picks.
- If Captured is greater than Applied, press **Rescan ESPN**. Version 0.8.11 makes acknowledgments monotonic per draft and resends a trailing snapshot once, in addition to terminal-pick caps, post-draft structured evidence retention, stale-version reporting, and clipboard fallback. It also lets the website request a fresh ESPN PPR board-rank and ADP scan. FantasyPros ECR remains the value authority.
- Use **Copy diagnostics** to capture the installed/required versions, connection method, sync counts, completion state, and structured API status without exposing ESPN credentials.
- Follow `LIVE_VALIDATION.md` for the two remaining full-draft checks: Direct mode and forced Board fallback.
- Prefer a popup status of **Draft detected · Direct**. If it says **Screen**, open ESPN's Board tab once and press Rescan.
- In Screen mode, the popup compares captured picks with ESPN's on-clock pick and warns when the fallback is behind.
- The ESPN data connection panel reports the structured endpoint's HTTP status, ESPN role, resolved count, unresolved count, and exact request error. **Hybrid** means Direct owns numbering/team identity while Screen supplies unresolved player names.
- If ESPN's pick-history view falls behind, any visible player row explicitly labeled **DRAFTED** is suppressed from War Room recommendations without guessing its pick number or ownership.
- If Unmatched is nonzero, manually mark that player and record the exact ESPN display name so an alias or selector fixture can be added.
- Use **Clear captured picks** only before starting a new mock or real draft.

## Test

From this directory:

```powershell
npm test
```

The tests cover ESPN pick text variants, round-to-overall conversion, snake turns, defenses, player IDs, and rejection of undrafted queue/player-list text.

## Why this is currently a monorepo package

The extension and website share a versioned sync message contract. Keeping them together for the first version prevents protocol drift and makes end-to-end testing easier. The folder contains no imports from the parent repository and can be moved into a separate repository later if it is published independently.
