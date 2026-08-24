# ESPN Companion Live Validation

Run these checks in disposable ESPN mock drafts. Do not use a real league draft for initial validation.

## Direct-mode full mock

1. Reload extension version 0.8.2 and refresh ESPN plus The War Room.
2. Start a mock with the same teams, slot, and rounds configured in the popup.
3. Confirm the popup says `Draft detected · Direct` after the first completed pick.
4. At picks 1, 10, the first turn, midpoint, your final pick, and draft end, record copied diagnostics.
5. Confirm Captured equals completed ESPN picks, Applied equals Captured, Unmatched is zero, and Mine follows ESPN's exact team ownership.
6. At draft end, confirm the War Room says `Draft complete`, the full roster is Mine, and the final report opens.

## Board-fallback full mock

1. In a new disposable mock, open ESPN's Board or Pick History view.
2. Temporarily use the popup only when the structured connection reports unavailable or a reproducible test setup forces Screen mode; do not alter ESPN credentials or extension permissions.
3. Confirm the popup says `Draft detected · Screen` and never claims Direct.
4. Rescan at the same checkpoints used above and save copied diagnostics.
5. Confirm numbered picks remain sequential, Taken/Mine ownership follows snake position, and Captured/Applied remain equal with zero unmatched names.
6. Confirm the terminal Board slot produces `Draft complete` and the War Room final report.

## Pass record

Record the date, ESPN mock URL identifiers (league and season only), teams/slot/rounds, extension version, mode, final counts, unmatched names, and copied diagnostics. Remove any personal league or team names before sharing a report.
