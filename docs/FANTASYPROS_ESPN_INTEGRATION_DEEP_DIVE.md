# FantasyPros Refresh and ESPN Direct Sync — Technical Deep Dive

Audience: War Room maintainers  
Date: 2026-08-24  
Scope: FantasyPros 2026 NFL PPR draft-ranking refresh and ESPN live draft pick synchronization.

## Executive answer

The FantasyPros refresh must use two documented concepts that the earlier implementation missed:

1. Request the **2026 expert directory**, because its `accuracy_draft_season` identifies the completed **2025 Draft Accuracy** season.
2. Select the finalized 2025 Top-20 members using nested `accuracy_draft.ALL` when present, with the official finalized expert names as a guarded fallback when the live directory omits that per-expert field. Pass the current API expert IDs as the colon-delimited `filters` value to the 2026 PPR consensus endpoint.

The API returns the currently publishing subset. In live validation it supplied the accuracy season but omitted usable per-expert overall ranks, so the implementation also matches against the official finalized Top-20 names and still obtains transient IDs from the API. The selected active Top-20 subset can be cached for 24 hours. Therefore, the first refresh after cache expiry uses two requests; subsequent ranking refreshes use one. The consensus response remains untrusted until it reports at least one active selected expert and 100–600 unique, valid NFL draft players.

For ESPN, the best practical Direct architecture is still passive observation inside ESPN's MAIN JavaScript world at `document_start`, followed by player-ID-first reconciliation in the extension background ledger. Chrome's normal `webRequest` API can observe a WebSocket handshake but cannot inspect its individual messages. The more powerful `chrome.debugger` route would add an intrusive permission and visible debugger attachment. The companion therefore keeps fetch, XHR, WebSocket, React-state, authenticated REST, and DOM fallback sources, and now also decodes text-bearing binary WebSocket frames and observes EventSource messages.

## FantasyPros API contract

### Expert discovery

Official endpoint:

`GET /public/v2/json/nfl/{season}/rankings/experts`

The documented response includes `accuracy_draft_season`, an expert collection, and each expert's nested `accuracy_draft` object. For the War Room's “2025 Draft Accuracy → Top 20 Overall” policy, the request season is 2026, `accuracy_draft_season` must equal 2025, and the ordering field is `accuracy_draft.ALL`.

Source: [FantasyPros Public API 2.0 — Experts](https://api.fantasypros.com/public/v2/docs/)

### Consensus rankings

Official endpoint:

`GET /public/v2/json/nfl/2026/consensus-rankings`

Required/used parameters:

- `position=ALL`
- `scoring=PPR`
- `type=DRAFT`
- `week=0`
- `filters=<colon-delimited expert IDs>`
- `experts=show`

The documented response includes `players`, `total_experts`, `expert_name`, `experts_available`, `last_updated`, scoring, position, and ranking type. `filters` accepts FantasyPros expert IDs, not webpage checkbox or DOM identifiers.

Source: [FantasyPros Public API 2.0 — Consensus Rankings](https://api.fantasypros.com/public/v2/docs/)

### Validation and quota behavior

The extension validates before applying:

- expert accuracy season is exactly 2025;
- every selected expert has a 2025 overall draft-accuracy rank from 1–20, validated by API rank or official finalized name (the live page produced a 10-expert consensus on 2026-08-24);
- current consensus contains 1–20 selected active experts;
- player population is between 100 and 600;
- each accepted row has an integer ECR rank, name, and supported position;
- canonical player names contain no duplicates.

The user's key dashboard reports a 50-request daily allowance. FantasyPros' public documentation describes the API as free and limited but does not publish that account-specific number in the endpoint reference. The 24-hour expert cache reduces normal ranking updates to one request and avoids spending quota rediscovering the active historical-preset subset on every click.

## Why the earlier attempts failed

- The first implementation treated a Top-20 preset as requiring 20 currently publishing experts.
- The next implementation used webpage-derived identifiers as API expert IDs; the API returned only 10 ranked players, and the population guard correctly rejected it.
- The original expert parser did not read `accuracy_draft.ALL` and called the 2025 expert path rather than validating the 2025 accuracy season from the 2026 response.
- All failed attempts stopped before modifying the authoritative local overlay.

## ESPN Direct-mode architecture

### Current source order

1. Page-world WebSocket, fetch, XHR, and EventSource observations
2. Bounded React state inspection
3. Authenticated ESPN REST snapshot/recovery
4. Visible Pick History and Board parsing

All observations enter one ledger keyed by overall pick and ESPN player ID. Higher-confidence structured observations can resolve lower-confidence name-only DOM evidence; conflicting player IDs remain visible instead of being overwritten silently.

### Why not `chrome.webRequest`

Chrome documents that `webRequest` can observe the WebSocket handshake but **not individual messages** after the connection is established. It therefore cannot replace the page-world socket observer for live picks.

Source: [Chrome Extensions `webRequest` API](https://developer.chrome.com/docs/extensions/reference/api/webRequest)

### Why not `chrome.debugger`

Chrome's debugger API can instrument network activity and access response bodies, but it requires the powerful `debugger` permission and attaches debugging machinery to the tab. That tradeoff is too intrusive for an ordinary fantasy-draft companion when passive page-world observation and a DOM fallback are available.

Sources: [Chrome `debugger` API](https://developer.chrome.com/docs/extensions/reference/api/debugger), [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/permissions-list)

### Direct-mode improvements in 0.9.8

- Decode JSON carried in WebSocket `Blob`, `ArrayBuffer`, and typed-array messages without changing ESPN's socket `binaryType`.
- Observe EventSource/server-sent-event messages when ESPN uses them.
- Retain fetch, XHR, React, REST, and DOM sources.
- Keep narrow host permissions; do not add `debugger` or broad web-request permissions.

Chrome documents that MAIN-world scripts can share the page's JavaScript environment, and `document_start` runs before page scripts. MDN documents that WebSocket messages may arrive as strings, blobs, or array buffers depending on `binaryType`.

Sources: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [MDN WebSocket `binaryType`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/binaryType)

## Remaining limitations

- ESPN does not publish a stable public draft-room event contract. Live validation remains necessary after material ESPN frontend changes.
- Practice drafts may expose different or delayed REST data from public human mocks and real leagues.
- If ESPN moves draft events into an opaque worker transport or encrypted/proprietary binary protocol, passive page hooks may still need source-specific decoding.
- DOM fallback remains necessary and should not be presented as Direct.

## Broader FantasyPros API opportunity audit

The remaining documented endpoints were evaluated against draft-day usefulness, request cost, overlap with existing signals, and implementation risk.

### Highest value: player directory with ESPN external IDs

`GET /public/v2/json/nfl/players?ecr=included&external_ids=espn&show=pos_rank`

This is the strongest next addition. One cached request can provide FantasyPros player IDs, current names/teams/positions, PPR rank metadata, and ESPN external IDs. Joining those IDs to the existing 717-player board would reduce suffix/name ambiguity and allow ESPN structured picks to resolve by ID before canonical-name fallback. It should be refreshed sparingly—such as once per day or only on explicit request—because the full directory is much more stable than ECR.

Source: [FantasyPros Public API 2.0 — Players](https://api.fantasypros.com/public/v2/docs/)

### Useful but secondary: injuries and breaking news

- `GET /nfl/injuries?year=2026&week=0` can provide status, injury type, update date, and probability fields when supplied.
- `GET /nfl/news?category=injury&limit=100&order_by=updated` can provide recent injury reports and FantasyPros impact summaries.

These should appear as compact warnings or expanded player context, not automatically override ECR. Current ECR already incorporates expert reactions to news, and injury feeds can be incomplete or preseason-specific. A manual, daily-cached “Refresh Draft Alerts” action is preferable to spending requests on every ranking update.

Source: [FantasyPros Public API 2.0 — News and Injuries](https://api.fantasypros.com/public/v2/docs/)

### Potentially useful later: preseason PPR projections

`GET /nfl/2026/projections?positions=QB:RB:WR:TE:K:DST&week=0`

Projections could explain *why* similarly ranked players differ—volume, receptions, touchdowns—but should not become a second hidden ranking system. They are better suited to expanded player details or tie-break explanations after the ranking refresh is reliable.

Source: [FantasyPros Public API 2.0 — NFL Projections](https://api.fantasypros.com/public/v2/docs/)

### Low priority or rejected for draft day

- **Compare Players:** redundant with the War Room's existing recommendation comparison and costs additional requests for only 2–4 players.
- **Historical player points:** useful for post-season analysis, but less predictive and less relevant than current ECR/projections on draft day.
- **Articles:** useful reading, but too noisy for the live command center and duplicates links available on FantasyPros.
- **Unfiltered news polling:** too request-heavy and distracting under a 50-request daily allowance.

### Recommended quota budget

- Ranking refresh with valid cached expert preset: 1 request.
- Active preset rediscovery: 1 additional request no more than once every 24 hours.
- Player directory / ESPN ID bridge: 1 request, cached for 24 hours.
- Draft alerts: 1 injury request only when explicitly requested, cached for the session/day.
- Keep a reserve of at least 40 requests; do not poll any FantasyPros endpoint automatically.

## Claim-to-source ledger

| Claim | Primary source | Access note |
|---|---|---|
| Expert responses expose `accuracy_draft_season` and nested draft accuracy | FantasyPros Public API 2.0, Experts | Official live API documentation, accessed 2026-08-24 |
| Consensus filters are colon-delimited expert IDs and responses expose expert/player metadata | FantasyPros Public API 2.0, Consensus Rankings | Official live API documentation, accessed 2026-08-24 |
| `webRequest` cannot inspect individual established WebSocket messages | Chrome for Developers, `webRequest` | Official Chrome documentation, accessed 2026-08-24 |
| MAIN-world `document_start` scripts can run in page context before page scripts | Chrome for Developers, Content scripts | Official Chrome documentation, accessed 2026-08-24 |
| WebSocket binary data may be Blob or ArrayBuffer | MDN, WebSocket `binaryType` | Standards-oriented web platform documentation, accessed 2026-08-24 |
| Debugger access requires a powerful extension permission | Chrome for Developers, Debugger and permissions | Official Chrome documentation, accessed 2026-08-24 |
