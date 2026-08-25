# ESPN Companion Live Validation

Run these checks in disposable ESPN mock drafts. Do not use a real league draft for initial validation.

ESPN's mock clock is 30 seconds. Make the user-slot pick before it expires. A timeout both selects a player and leaves the team in Autopick mode; manually disable Autopick immediately before continuing any ownership or recommendation validation.

## Structured live-capture full mock

1. Reload extension version 0.9.2 and refresh ESPN plus The War Room before entering the draft room. Loading before the draft starts is important because WebSocket observation begins at document start.
2. Start a mock with the same teams, slot, and rounds configured in the popup.
3. Confirm the popup says `Draft detected · Live capture` after the first completed pick and that either Structured page state or Network observation is active.
4. At picks 1, 10, the first turn, midpoint, your final pick, and draft end, record copied diagnostics.
5. Confirm Captured equals completed ESPN picks, Applied equals Captured, Unmatched is zero, conflicts are zero, and Mine follows ESPN's exact team ownership.
6. At draft end, confirm the War Room says `Draft complete`, the full roster is Mine, and the final report opens.

## Board-fallback full mock

1. In a new disposable mock, open ESPN's Board or Pick History view.
2. Temporarily use the popup only when the structured connection reports unavailable or a reproducible test setup forces Screen mode; do not alter ESPN credentials or extension permissions.
3. Confirm the popup says `Draft detected · Board fallback` and does not claim structured live capture.
4. Rescan at the same checkpoints used above and save copied diagnostics.
5. Confirm numbered picks remain sequential, Taken/Mine ownership follows snake position, and Captured/Applied remain equal with zero unmatched names.
6. Confirm the terminal Board slot produces `Draft complete` and the War Room final report.

## Live-person public mock comparison

1. Join a disposable public snake PPR mock that contains at least one other live manager; do not use a real league draft.
2. Keep Companion 0.9.2, ESPN, and The War Room open with matching teams, slot, and rounds.
3. Copy diagnostics before pick one, after the first completed pick, near pick 10, and after the draft. Make each user pick before ESPN's 30-second timeout.
4. Record the `Capture method`, structured/network/fallback source status, confirmed/conflict/unresolved-ID counts, plus REST resolved/raw/unresolved and HTTP/transport.
5. Confirm the acknowledged snapshot size catches up to Captured. A smaller late acknowledgment must never lower Applied, and one forced resend should close a trailing acknowledgment.
6. Compare these results with the all-Auto practice behavior without assuming that public and league-specific ESPN feeds use the same backend timing.

## Pass record

Record the date, ESPN mock URL identifiers (league and season only), teams/slot/rounds, extension version, mode, final counts, unmatched names, and copied diagnostics. Remove any personal league or team names before sharing a report.

### 2026-08-24 — Board/Pick History fallback passed

- ESPN mock: league `819737502`, season `2026`
- Settings: 12 teams, slot 5, 16 rounds
- Installed companion: 0.8.7
- Connection observed by the website: DOM/Pick History fallback for every synchronized row; structured Direct never became authoritative
- Early state: one temporary unmatched player was recovered by accumulated rescans
- Midpoint: 140/140 applied, zero unmatched
- Final state: 192/192 numbered picks synchronized, 16 Mine, zero unmatched
- Completion: `Draft complete · 192 picks` rendered and the final report opened

Result: Board/Pick History fallback is live-validated. Structured live capture remains open and must not be reported as passed.
