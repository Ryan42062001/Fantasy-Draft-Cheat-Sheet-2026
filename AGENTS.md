# Fantasy Draft Cheat Sheet 2026 — Codex Project Guide

## Project purpose
This repository is a 2026 fantasy football draft companion. It provides a ranked player board, live draft-state tracking, roster tracking, recommendation logic, VORP/scarcity calculations, next-pick survival logic, autosave/persistence, and regression/debug tooling.

Primary league assumptions currently used in the project:
- 10 teams
- PPR
- 16 rounds
- Snake draft
- Roster: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX, 1 K, 1 DST

## Source-of-truth ranking policy
The old custom 2026 expert ranking dataset is NOT authoritative and should be discarded/replaced.

Use FantasyPros 2026 PPR data as the ranking authority:
- FantasyPros PPR ECR = player value / board rank / VORP / scarcity / tier logic
- FantasyPros PPR ADP = market cost / survival-to-next-pick / reach-value / timing logic

Never invent player rankings, ADP, teams, bye weeks, or tier assignments when source data is absent.

The source exports used for the new master dataset are:
- `FantasyPros_2026_Draft_ALL_Rankings.csv`
- `FantasyPros_2026_Overall_ADP_Rankings.csv`

A generated master dataset was built with:
- 520 ECR-ranked players
- 197 additional ADP-only players
- 717 total players
- QB 102
- RB 170
- WR 242
- TE 115
- K 56
- DST 32
- zero duplicate canonical names in the generated dataset

For ADP-only players:
- `ecr` must remain `null`
- `source` should be `ADP_ONLY`
- they may be appended as deep searchable depth
- do not treat their synthetic board-placement rank as ECR

## Semantic tier model
The project is migrating away from visible letter grades as the conceptual model.

Desired semantic tiers:
- ELITE
- PREMIUM
- CORE
- VALUE
- UPSIDE
- DEPTH
- LATE
- DEEP

For compatibility during migration, legacy DOM/internal tier IDs may temporarily remain:
- Sp -> ELITE
- S -> PREMIUM
- A -> CORE
- B -> VALUE
- C -> UPSIDE
- D -> DEPTH
- E -> LATE
- F -> DEEP

Do not casually rename `tbody-Sp`, `tbody-S`, etc. until all engine dependencies are migrated. The current engine still uses these IDs in edit controls, tier movement, autosave order, and tier scoring.

FantasyPros source-tier grouping used in the generated dataset:
- FP tiers 1-2 -> ELITE
- FP tiers 3-4 -> PREMIUM
- FP tiers 5-6 -> CORE
- FP tiers 7-8 -> VALUE
- FP tiers 9-10 -> UPSIDE
- FP tiers 11-12 -> DEPTH
- FP tiers 13-14 -> LATE
- FP tiers 15-16 -> DEEP

Preserve the raw `fantasyProsTier` field so semantic mappings can be changed later without rebuilding source data.

## Existing architecture that should be preserved
The project already has working logic around:
- `build2026ExpertBoardStructure()`
- `apply2026ExpertRankings()`
- `findDraftRowByExpertName()`
- `canonicalExpertPlayerName()` / player-name normalization
- `ensureExpertPlayerExists()`
- `createExpertPlayerRow()`
- `updateExpertPlayerRowMetadata()`
- `syncRankData()`
- `saveState()` / `loadState()`
- `triggerAllBoardUpdates()`
- `getDraftAssistantPlayers()`
- `getPlayerTierValue()`
- `calculateDraftRecommendation()`
- `calculateNextPickSurvival()`
- `testDraftPlayer()`
- `testDraftPlayerAtPick()`
- `runDraftEngineTests()`
- `runTurnPackageTests()`
- `runRecommendationExplanationTests()`

Autosave/load architecture was previously fixed so the authoritative dataset rebuilds the board structure BEFORE `loadState()` restores drafted/taken state. Saved legacy board ordering should not override the authoritative expert/FantasyPros order.

## Current code organization
- `index.html` contains the UI and eight tier containers, but no static player rows; `script.js` constructs the authoritative board before `loadState()`.
- `script.js` contains production board, persistence, recommendation, and live-state logic.
- `developer-tools.js` contains regression tests and draft simulations and is loaded on demand from the console; developer controls are intentionally hidden from the draft-day UI.
- Normal scoring diagnostics are quiet by default. Set `DEBUG_DRAFT_SCORING = true` when detailed console traces are needed.
- Board construction indexes existing rows once by canonical name and appends players in tier-level document fragments; preserve this batched path when changing initialization.

## Important past bugs / lessons
1. A previous custom dataset badly mis-ranked players (example: Alvin Kamara was around #57). Do not reuse or trust that custom board.
2. Structural DOM changes originally did not survive refresh because autosave only stored state/order, not row definitions. The current architecture rebuilds the authoritative board on startup before restoring saved draft state.
3. `testDraftPlayerAtPick()` simulates prior picks by marking higher-ranked players taken. A player ranked above the simulated pick may correctly be unavailable; do not interpret that as a lookup failure.
4. Player-name matching should use canonical normalization, not raw lowercase equality.
5. Existing visible/internal letter tiers are still coupled to engine scoring. Migrate carefully instead of renaming everything at once.
6. Do not manually transcribe hundreds of player rows when source CSVs or generated data are available. Prefer programmatic generation/validation.

## Current validation baseline
Before the FantasyPros migration, the project passed:
- `runDraftEngineTests()` -> 152/152
- `runTurnPackageTests()` -> 5/5
- `runRecommendationExplanationTests()` -> 8/8
- total: 165/165 passing

The prior 205-player expert board also passed persistence/order audits, but that dataset is obsolete and should not be treated as ranking authority.

## Current migration roadmap
Treat this as the living roadmap. Update this file as phases are completed.

### FantasyPros 2026 ranking-system migration
- [x] Choose FantasyPros PPR ECR as player-value source of truth
- [x] Choose FantasyPros PPR ADP as market/timing source
- [x] Obtain FantasyPros 2026 ALL Rankings CSV
- [x] Obtain FantasyPros 2026 Overall ADP CSV
- [x] Build 717-player merged master dataset concept
- [x] Define semantic tier architecture
- [x] Rebuild/verify master dataset directly from CSV files in the repo/workspace (do not trust manually pasted partial chunks)
- [x] Install authoritative 717-player dataset into the app
- [x] Make QB/RB/WR/TE/K/DST all authoritative from FantasyPros dataset
- [x] Remove old special handling that preserves stale K/DST rows separately
- [x] Populate row metadata for ECR, ADP, ADP rank, FantasyPros tier, semantic tier, source, positional rank
- [x] Verify page refresh reconstructs all 717 players automatically
- [x] Run board integrity audit: 717 board rows, 0 missing, 0 unexpected, 0 duplicates
- [x] Update visible section labels to ELITE / PREMIUM / CORE / VALUE / UPSIDE / DEPTH / LATE / DEEP while preserving internal IDs initially
- [x] Improve organization for large board: collapse LATE and DEEP by default; keep search across all players
- [x] Organize K and DST cleanly instead of dumping them into generic DEEP/F logic
- [x] Wire ADP into `calculateNextPickSurvival()` / timing calculations
- [x] Keep ECR as the value signal for board rank, VORP, scarcity, and recommendation value
- [x] Replace legacy tier-score assumptions with semantic consensus-tier scoring after distribution review
- [x] Fix any recommendation-decision inconsistencies exposed by simulations (example previously observed: negative score gap but still `DRAFT`)
- [x] Re-run all 165 regression tests; target 165/165
- [x] Run realistic draft recommendation simulations at early, middle, turn, and late picks
- [x] Perform mobile/UI audit after the 717-player board is stable
- [x] Mark ranking system complete

Completion evidence (2026-08-22):
- CSV rebuild: 520 ECR + 197 ADP-only = 717 players; QB 102 / RB 170 / WR 242 / TE 115 / K 56 / DST 32; 0 duplicate canonical names
- Board audit after refresh: 717/717 rows; 0 missing; 0 unexpected; 0 board duplicates; 0 dataset duplicates
- Regression suites: 152/152 draft engine + 5/5 turn package + 8/8 recommendation explanations = 165/165
- Recommendation scenarios: early / middle / turn / late = 4/4 clean, with 0 decision inconsistencies
- Responsive audit: 390px / 768px / default viewport; no page overflow; collapsed-tier search and all-position filters verified

## Acceptance criteria for the FantasyPros migration
Do not call the migration complete until all of these are true:

1. Dataset integrity
   - 717 total dataset players expected from the current generated merge unless regenerated source files produce a legitimately different count
   - no duplicate canonical names
   - ECR-only vs ADP-only status is explicit
   - no fabricated ECR values

2. Board integrity
   - board player count equals dataset count
   - 0 missing players
   - 0 unexpected players
   - 0 duplicate canonical names
   - refresh preserves/rebuilds the exact authoritative population

3. Ranking semantics
   - ECR drives player value/rank
   - ADP drives market timing/survival
   - raw FantasyPros tier is retained
   - semantic tier is explicit

4. Draft state
   - `mine` / `taken` / `available` states survive refresh
   - league size, slot, rounds, and draft state continue to load correctly
   - authoritative rankings are not overridden by stale saved custom order

5. Tests
   - 152/152 draft engine tests
   - 5/5 turn package tests
   - 8/8 recommendation explanation tests
   - total 165/165

6. Recommendation behavior
   - no obvious cases where the engine says `DRAFT` for a player while clearly scoring a materially better available alternative higher without an explicit strategic reason
   - elite QB/TE logic should not blindly overpower stronger RB/WR values
   - next-pick survival should use ADP/market information where available

## Codex working style for this repo
- Inspect the current repository before editing; do not assume chat-era code snippets are the latest version.
- Prefer small, reviewable commits/patches.
- Run available tests after each meaningful migration step.
- Preserve working behavior unless the roadmap explicitly requires a change.
- When changing ranking logic, explain which input is ECR, which is ADP, and which is derived locally.
- If source data contradicts an old hard-coded ranking, source data wins.
- Avoid broad refactors unrelated to the current roadmap.
- Update the roadmap checkboxes in this file as work is completed.

## Next maintenance cycle
- Refresh the two source CSVs and rerun `scripts/build-fantasypros-2026.mjs` when FantasyPros publishes material ranking changes.
- Re-run migration verification, roadmap simulations, persistence checks, and responsive checks after each data refresh.
- Treat recommendation tuning as a separate evidence-driven phase; preserve ECR as value and ADP as market timing.

## Draft-day cleanup and reliability
- [x] Replace stale tier copy with neutral FantasyPros semantic-tier descriptions and live player counts
- [x] Keep custom-board editing opt-in and create rank controls only while editing
- [x] Add explicit Taken/Mine marking mode with Taken default, one-shot Mine, toggle-to-clear, keyboard support, autosave, and ESPN compatibility
- [x] Add an `M` keyboard shortcut to toggle Taken/Mine mode while avoiding form fields, dialogs, modifiers, key repeat, and Custom Board mode
- [x] Add isolated saved draft sessions, safe legacy-save migration, session-scoped final-report state, New Draft controls, and ESPN `draftKey` routing
- [x] Improve navigation, player-row, tab, dialog, focus, Escape, and screen-reader semantics
- [x] Centralize league, roster, tier, FLEX, and recommendation-cap configuration in `war-room-config.js`
- [x] Commit a hash/count-protected FantasyPros dataset baseline with explicit `baseline:accept` workflow
- [x] Add root syntax/dataset/extension/browser test entry points and GitHub Actions coverage
- [ ] Validate structured Direct mode and Board fallback in a live 2026 ESPN football mock draft

Verification (2026-08-22):
- Board/runtime audit: 717 dataset players, 717 rows, 0 duplicate canonical names, and 0 normal-startup rank-control sets
- Canonical regressions: 152/152 draft engine + 5/5 turn package + 8/8 recommendation explanations = 165/165
- Calculation sanity: 12/12; ESPN website reconciliation: 12/12; extension API/parser/manifest/ledger: 33/33
- Manual Taken/Mine workflow, one-shot Mine reset, New Draft isolation, configured 9-starter rendering, and 390 × 844 no-overflow checks passed in headless Chrome
- Player marking plus immediate UI assertion measured 203.3 ms end-to-end in the final browser automation run; the application continues to defer draft-intelligence scoring
- Normal startup creates 0 `.rank-controls`; editing controls remain lazy for the 717-player board
- Live ESPN mock-draft validation remains intentionally unverified.

## Calculation model audit
- [x] Keep ADP-only depth out of ECR, VORP, scarcity, tier-cliff, and recommendation-value pools
- [x] Stop substituting ECR when FantasyPros ADP is missing; use neutral unknown-market survival
- [x] Center next-pick survival on ADP with a smooth, monotonic probability curve
- [x] Remove duplicate next-pick projection from base replacement level and keep it in draft-aware VORP only
- [x] Make scarcity measure current local positional ECR depth instead of duplicating replacement-level VORP
- [x] Normalize roster need to the documented 0–100 score scale
- [x] Preserve useful ECR differentiation through late rounds instead of reducing every rank after 67 to zero
- [x] Prevent derived strategy nudges from inverting authoritative same-position ECR order
- [x] Cache the shared position-scarcity calculation once per scoring pass
- [x] Add controlled calculation sanity scenarios and rerun the canonical regression suites
- [x] Cap opportunity/strategy adjustments to ±15 while retaining hard roster guardrails separately
- [x] Expose base value, capped strategy impact, guardrails, and final score as reconciled diagnostics
- [x] Add explicit recommendation boundary tests around score-gap and confidence thresholds
- [x] Store recommendation audit observations per draft session without changing weights automatically
- [x] Exclude noisy decision windows with at least 35% major ECR reaches from calibration summaries
- [x] Require at least 10 eligible resolved decisions before treating audit survival rates as a useful sample
- [x] Treat a recommended player selected at the decision pick as censored instead of a survival failure
- [x] Exclude audit outcomes with less than 80% intervening-pick coverage
- [x] Deduplicate recommendation observations by pick and player when the displayed action changes

Completion evidence (2026-08-22):
- Canonical regressions: 152/152 draft engine + 5/5 turn package + 8/8 recommendation explanations = 165/165
- Calculation sanity suite: 11/11 (authority separation, ADP survival, late ECR scoring, roster need, scarcity, replacement stability, same-position ordering)
- Recommendation simulations: early / middle / turn / late = 4/4 clean with finite factor scores and no decision inconsistencies
- Post-budget verification: calculation sanity 14/14, threshold boundaries 8/8, roadmap scenarios 4/4, and canonical regressions 165/165
- Audit verification: session isolation retained; noisy observations excluded; 50% observed survival correctly calculated from one success and one failure while the noisy fixture is ignored
- Audit edge verification: selected-now, incomplete, noisy, observed-failure, and action-update/deduplication fixtures all pass

## Draft report UX
- [x] Combine My Team and Draft Summary into one My Draft panel with Summary and Lineup views
- [x] Track draft-pick metadata in autosave so value results survive refresh
- [x] Show live roster construction, ECR value, ADP timing, insights, and pick history
- [x] Show FLEX explicitly in both Summary and Lineup roster views
- [x] Show a one-time final report after the draft with evidence-based strengths and improvements
- [x] Preserve the final-pick Taken-to-Mine interaction before opening the report
- [x] Share one live engine-state calculation across scarcity and recommendation widgets
- [x] Let player status paint immediately while draft intelligence refreshes in the background
- [x] Simplify Recommended Pick into a compact primary decision with expandable strategy details
- [x] Combine position availability and tier/scarcity alerts into one Board Pressure widget
- [x] Remove developer test controls from the visible draft-day interface
- [x] Replace the word-heavy Recommended Pick panel with a decision-first collapsed card
- [x] Keep player, action, confidence, one-line rationale, and next-pick survival useful while collapsed
- [x] Move up to three reasons, four factor bars, the best alternative, next action, and raw scoring behind progressive disclosure
- [x] Render turn picks as a compact two-player package instead of repeated prose

Recommended Pick verification (2026-08-22):
- Browser regression confirms the card starts collapsed with a visible player and one-line decision summary
- Expanded state exposes exactly four factors: ECR value, roster need, scarcity, and ADP timing
- Canonical regressions remain 165/165; calculation sanity 12/12; roadmap scenarios 4/4; ESPN website contract 12/12
- 390 × 844 viewport retains zero horizontal overflow

## Draft-day decision polish
- [x] Replace full-pool availability counts with ECR-relevant depth, best available, tier-cliff distance, and ADP-based next-pick survival
- [x] Add round-aware roster guidance for starter timing, FLEX, K/DST endgame planning, and crowded bye weeks
- [x] Add a true draft-complete mode that retires live pressure/recommendation work and surfaces the final report plus an ECR-backed waiver watch
- [x] Show the FantasyPros source snapshot date and freshness status in the live header

## Interface identity and polish
- [x] Rebrand the site masthead as **The War Room**
- [x] Replace the stale hard-coded pick subtitle with draft-setting-safe command-center copy
- [x] Keep the compact masthead responsive while preserving the mobile sticky-toolbar behavior

## ESPN draft companion
- [x] Define a versioned ESPN-to-War-Room snapshot contract
- [x] Add full-snapshot reconciliation for Mine / Taken / corrected picks
- [x] Preserve existing board updates and autosave after synchronized picks
- [x] Add suffix-tolerant player matching and ESPN D/ST reconciliation
- [x] Build a narrowly permissioned Manifest V3 companion package under `extensions/espn-companion`
- [x] Add connection health, captured/applied/unmatched counts, rescan, and guarded reset controls
- [x] Add parser, manifest, and website reconciliation regression suites
- [x] Prefer ESPN's structured draft-detail records and exact team IDs over inferred DOM ownership
- [x] Retain Pick History and Board-table parsing as an automatic fallback
- [x] Add the live ESPN display formats and Board selectors observed during mock-draft testing
- [ ] Validate structured Direct mode and the Board fallback in a live 2026 ESPN football mock draft

Current verification (2026-08-22):
- Existing War Room regressions: 165/165
- ESPN website reconciliation contract: 12/12
- Extension API, parser, manifest, and ledger tests: 33/33
- Companion 0.6.0 uses structured ESPN pick/team IDs when available, retains partial structured authority in Hybrid mode, exposes direct-feed diagnostics, keeps the user-set league size authoritative, and suppresses visible ESPN rows explicitly labeled DRAFTED when pick history lags
- Live ESPN mock-draft validation remains required because ESPN does not publish a stable draft-room DOM contract

## User roster recommendation preferences
- [x] Hard-cap the recommendation pool at one QB
- [x] Hard-cap the recommendation pool at one TE
- [x] Keep additional QBs and TEs visible/searchable on the board without recommending them
- [x] Preserve FantasyPros ECR/ADP authority for every still-eligible player

Preference verification (2026-08-22):
- Calculation sanity suite: 12/12, including QB1/TE1 recommendation eligibility and QB2/TE2 exclusion

Completion evidence (2026-08-22):
- Clean draft UI: 717 rows, visible 2026-08-21 FantasyPros freshness badge, decision-focused Board Pressure, no console errors
- Mid-draft UI: roster plan renders in My Draft Summary and FLEX remains visible
- Draft-complete UI: Board Pressure hidden, live recommendation replaced, final report opens with six waiver-watch players
- Responsive audit: 390 × 844 viewport, no horizontal page overflow
- Regression suites: 152/152 draft engine + 5/5 turn package + 8/8 recommendation explanations = 165/165

## Performance optimization
- [x] Profile startup, immediate player-state painting, and deferred recommendation refreshes on the 717-player board
- [x] Cache the authoritative draft-row collection, canonical player lookup index, and stable display names
- [x] Share draft state, roster counts, phase weights, tier-drop lookups, and market pools across each scoring pass
- [x] Cache repeated late-availability calculations without changing ECR/ADP authority boundaries
- [x] Avoid serializing authoritative board order during autosave while retaining the legacy no-dataset fallback
- [x] Preserve deferred draft intelligence so Taken/Mine state paints before recommendation work
- [x] Re-run board integrity, canonical regressions, calculation sanity, roadmap simulations, and ESPN sync tests

Performance evidence (2026-08-22):
- Before: live-state scoring was roughly 635–745 ms per refresh and the deferred full refresh was roughly 779–885 ms
- After: repeated player clicks painted interactively in an 11.0 ms median; live-state scoring was 120.9 ms median; the full deferred refresh was 276.3 ms median
- Integrity/regressions: 717/717 board rows with 0 missing / unexpected / duplicates; canonical 165/165; calculation sanity 12/12; roadmap scenarios 4/4; ESPN website contract 12/12; extension tests 33/33
