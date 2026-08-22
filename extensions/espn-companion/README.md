# The War Room — ESPN Draft Companion

Manifest V3 Chrome extension that reads the visible ESPN fantasy-football draft history and reconciles completed picks into The War Room.

## Current status

This is a testable first version. The War Room bridge, persistence, popup, draft-slot mapping, name reconciliation, and parser fixtures are implemented. ESPN changes its draft-room markup without publishing an integration contract, so the DOM adapter must be validated in an ESPN mock draft before relying on it for a real draft.

The extension does **not** read or store ESPN passwords, cookies, or authentication tokens. It only reads draft information rendered in the ESPN tab.

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
9. After any extension code update, return to `chrome://extensions` and press **Reload** on the companion card. Version 0.2.0 can inject its reader into an ESPN tab that was already open.

Chrome displays an extension popup over the upper-right corner of the current page. It is not part of ESPN and closes as soon as you click the draft room. Use **Open controls in a tab** if you want status to stay visible without covering ESPN. The extension-icon badge shows the captured-pick count while the popup is closed.

## How synchronization works

```text
ESPN draft DOM
  -> espn-content.js
  -> background.js (validated, deduplicated pick ledger)
  -> war-room-content.js
  -> window message contract
  -> applyEspnDraftSnapshot() in The War Room
  -> existing board updates + autosave
```

- Overall picks are deduplicated and stored by the extension.
- Snake-draft team slots are derived from overall pick and league size.
- The configured War Room draft slot determines `Mine` versus `Taken`.
- The website reconciles the complete ESPN snapshot instead of blindly replaying clicks.
- FantasyPros canonical-name matching is used first, with suffix-tolerant and DST matching fallbacks.
- ESPN-sourced rows carry `data-sync-source="espn"`, allowing a later full snapshot to repair missed or corrected picks.

## Draft-night safeguards

- Keep manual marking available as a fallback.
- Verify the Captured, Applied, and Unmatched counts after the first few mock-draft picks.
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
