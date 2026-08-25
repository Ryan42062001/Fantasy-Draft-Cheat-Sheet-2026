# FantasyPros Refresh and ESPN Direct Sync — Technical Deep Dive

Audience: War Room maintainers  
Date: 2026-08-24  
Scope: FantasyPros 2026 NFL PPR draft-ranking refresh and ESPN live draft pick synchronization.

## Executive answer

The FantasyPros refresh must use two documented concepts that the earlier implementation missed:

1. Request the **2026 expert directory**, because its `accuracy_draft_season` identifies the completed **2025 Draft Accuracy** season.
2. Rank experts by the nested `accuracy_draft.ALL` value, select ranks 1–20, and pass those API expert IDs as the colon-delimited `filters` value to the 2026 PPR consensus endpoint.

The historical Top-20 membership can be cached for seven days. Therefore, the first refresh after cache expiry uses two requests; subsequent ranking refreshes use one. The consensus response remains untrusted until it reports at least one active selected expert and 100–600 unique, valid NFL draft players.

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
- exactly 20 historical accuracy-ranked experts are discovered;
- current consensus contains 1–20 selected active experts;
- player population is between 100 and 600;
- each accepted row has an integer ECR rank, name, and supported position;
- canonical player names contain no duplicates.

The user's key dashboard reports a 50-request daily allowance. FantasyPros' public documentation describes the API as free and limited but does not publish that account-specific number in the endpoint reference. The seven-day expert cache reduces normal ranking updates to one request and avoids spending quota rediscovering a historical preset on every click.

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

### Direct-mode improvements in 0.9.6

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

## Claim-to-source ledger

| Claim | Primary source | Access note |
|---|---|---|
| Expert responses expose `accuracy_draft_season` and nested draft accuracy | FantasyPros Public API 2.0, Experts | Official live API documentation, accessed 2026-08-24 |
| Consensus filters are colon-delimited expert IDs and responses expose expert/player metadata | FantasyPros Public API 2.0, Consensus Rankings | Official live API documentation, accessed 2026-08-24 |
| `webRequest` cannot inspect individual established WebSocket messages | Chrome for Developers, `webRequest` | Official Chrome documentation, accessed 2026-08-24 |
| MAIN-world `document_start` scripts can run in page context before page scripts | Chrome for Developers, Content scripts | Official Chrome documentation, accessed 2026-08-24 |
| WebSocket binary data may be Blob or ArrayBuffer | MDN, WebSocket `binaryType` | Standards-oriented web platform documentation, accessed 2026-08-24 |
| Debugger access requires a powerful extension permission | Chrome for Developers, Debugger and permissions | Official Chrome documentation, accessed 2026-08-24 |

