'use strict';

if (typeof importScripts === 'function') importScripts('espn-live-capture.js');
var liveCapture = globalThis.WarRoomEspnLiveCapture;

var STORAGE_KEY = 'warRoomEspnCompanionStateV2';
var FANTASYPROS_KEY_STORAGE = 'warRoomFantasyProsApiKeyV1';
var FANTASYPROS_PRESET_CACHE_MS = 24 * 60 * 60 * 1000;
var FANTASYPROS_2025_DRAFT_ACCURACY_TOP20 = [
  'Seth Miller', 'Guilherme Gianni', 'Michael Bobal', 'Jason Willan', 'Marc Shannep',
  'Joey Wright', 'Ryan Weisse', 'Kevin Steele', 'Jody Smith', 'Tim Heaney',
  'Todd D Clark', 'Adam Stark', 'Sean Koerner', 'Mason Riney', 'Shane Hallam',
  'Justin Weigal', 'Nick Mariano', 'Jared Smola', 'Nic Bodiford', 'Trevor Land'
];
// FantasyPros' limited public tier can return an empty expert directory even
// though filtered consensus rankings remain available. These nine IDs were
// confirmed by the 2026 consensus response for the user's finalized 2025
// Draft Accuracy Top-20 preset on 2026-08-24. They are used only when the API
// explicitly marks the empty directory as limited, and the resulting
// consensus response must independently confirm active experts before use.
var FANTASYPROS_TOP20_LIMITED_TIER_FALLBACK_IDS = [
  '3585', '2598', '4179', '2743', '690', '1080', '381', '4404', '4224'
];
var WAR_ROOM_URLS = [
  'http://127.0.0.1/*',
  'http://localhost/*',
  'https://ryan42062001.github.io/Fantasy-Draft-Cheat-Sheet-2026/*'
];
var ESPN_URLS = [
  'https://fantasy.espn.com/*',
  'https://www.espn.com/fantasy/*'
];

function getExtensionVersion() {
  return chrome.runtime.getManifest().version;
}

var state = {
  config: {teams: 10, draftSlot: 1, rounds: 16},
  draftKey: null,
  picksByNumber: {},
  conflictsByPick: {},
  unresolvedPlayerIdsByPick: {},
  unavailablePlayersByKey: {},
  marketAdpByName: {},
  fantasyProsDiagnostics: null,
  ledgerTeams: null,
  espn: {connected: false, draftPage: false, captured: 0, lastSeenAt: null},
  warRoom: {connected: false, applied: 0, unmatched: 0, lastSeenAt: null}
};

function storageGet() {
  return chrome.storage.local.get(STORAGE_KEY).then(function(result) {
    var stored = result && result[STORAGE_KEY];
    if (stored && typeof stored === 'object') {
      state = Object.assign({}, state, stored);
      state.config = Object.assign({teams: 10, draftSlot: 1, rounds: 16}, stored.config || {});
      state.draftKey = stored.draftKey || null;
      state.picksByNumber = Object.assign({}, stored.picksByNumber || {});
      state.conflictsByPick = Object.assign({}, stored.conflictsByPick || {});
      state.unresolvedPlayerIdsByPick = Object.assign({}, stored.unresolvedPlayerIdsByPick || {});
      state.unavailablePlayersByKey = Object.assign({}, stored.unavailablePlayersByKey || {});
      state.marketAdpByName = Object.assign({}, stored.marketAdpByName || {});
      state.fantasyProsDiagnostics = stored.fantasyProsDiagnostics && typeof stored.fantasyProsDiagnostics === 'object'
        ? stored.fantasyProsDiagnostics : null;
      state.ledgerTeams = Number(stored.ledgerTeams) || null;
      state.espn = Object.assign({}, state.espn, stored.espn || {});
      state.warRoom = Object.assign({}, state.warRoom, stored.warRoom || {});

      // Pick numbers parsed from R#/P# notation depend on league size. Older
      // ledgers did not record which team count produced them, so discard them
      // once rather than risk replaying incorrectly numbered selections.
      if (!state.draftKey || state.ledgerTeams !== Number(state.config.teams)) {
        state.picksByNumber = {};
        state.conflictsByPick = {};
        state.unresolvedPlayerIdsByPick = {};
        state.unavailablePlayersByKey = {};
        state.ledgerTeams = Number(state.config.teams);
        state.espn.captured = 0;
        state.espn.visibleCaptured = 0;
      }
    }
  });
}

function storageSave() {
  var payload = {};
  payload[STORAGE_KEY] = state;
  return chrome.storage.local.set(payload).then(updateActionBadge);
}

function updateActionBadge() {
  var count = getPicks().length;
  var text = count > 999 ? '999+' : count > 0 ? String(count) : '';
  return Promise.all([
    chrome.action.setBadgeText({text: text}),
    chrome.action.setBadgeBackgroundColor({color: '#2f7d4a'})
  ]).catch(function() {});
}

var ready = storageGet().catch(function() {});
ready.then(updateActionBadge).catch(function() {});

function snakeTeamSlot(overallPick, teams) {
  overallPick = Number(overallPick);
  teams = Number(teams) || 10;
  if (!Number.isInteger(overallPick) || overallPick < 1) return null;
  var round = Math.ceil(overallPick / teams);
  var pickInRound = ((overallPick - 1) % teams) + 1;
  return round % 2 === 1 ? pickInRound : teams - pickInRound + 1;
}

function getPicks() {
  return Object.keys(state.picksByNumber)
    .map(function(key) { return state.picksByNumber[key]; })
    .filter(Boolean)
    .sort(function(a, b) { return Number(a.overallPick) - Number(b.overallPick); })
    .map(function(pick) {
      return Object.assign({}, pick, {
        teamSlot: snakeTeamSlot(pick.overallPick, state.config.teams)
      });
    });
}

function unavailablePlayerKey(player) {
  return String(player && player.playerName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() + '|' + String(player && player.position || '').toUpperCase();
}

function mergeUnavailablePlayers(players) {
  (Array.isArray(players) ? players : []).forEach(function(player) {
    var playerName = String(player && player.playerName || '').trim();
    var position = String(player && player.position || '').toUpperCase();
    if (!playerName || ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].indexOf(position) < 0) return;
    var normalized = {
      playerName: playerName.slice(0, 100),
      position: position,
      espnPlayerId: player.espnPlayerId == null ? null : String(player.espnPlayerId).slice(0, 40)
    };
    state.unavailablePlayersByKey[unavailablePlayerKey(normalized)] = normalized;
  });
}

function getUnavailablePlayers() {
  return Object.keys(state.unavailablePlayersByKey || {}).map(function(key) {
    return state.unavailablePlayersByKey[key];
  }).filter(Boolean);
}

function queryTabs(urls) {
  return chrome.tabs.query({url: urls}).catch(function() { return []; });
}

function sendTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function sendTabQuiet(tabId, message) {
  return sendTab(tabId, message).catch(function() {});
}

function injectWarRoomBridge(tab) {
  if (!tab || !tab.id) return Promise.resolve(false);
  return chrome.scripting.executeScript({
    target: {tabId: tab.id},
    files: ['war-room-content.js']
  }).then(function() {
    return true;
  }).catch(function() {
    return false;
  });
}

function deliverWarRoomSnapshot(tab, message) {
  if (!tab || !tab.id) return Promise.resolve(false);
  return sendTab(tab.id, message)
    .then(function() { return true; })
    .catch(function() {
      // Reloading or updating an unpacked extension invalidates the content
      // script in an already-open tab. Reinject the bridge before retrying so
      // a matching URL is not mistaken for a working connection.
      return injectWarRoomBridge(tab).then(function(injected) {
        if (!injected) return false;
        return sendTab(tab.id, message).then(function() { return true; }).catch(function() { return false; });
      });
    });
}

function injectEspnReader(tab) {
  if (!tab || !tab.id) return Promise.resolve();
  return chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true},
    files: ['espn-live-capture.js', 'espn-live-observer.js', 'espn-page-bridge.js'],
    world: 'MAIN',
    injectImmediately: true
  }).catch(function() {}).then(function() { return chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true},
    files: ['espn-live-capture.js', 'espn-api.js', 'espn-parser.js', 'espn-content.js']
  }); }).then(function() {
    return sendTabQuiet(tab.id, {type: 'COMPANION_CONFIG', config: state.config});
  }).catch(function() {});
}

function ensureEspnReader(tab, force) {
  if (!tab || !tab.id) return Promise.resolve();
  return sendTab(tab.id, {type: force ? 'RESCAN_ESPN' : 'COMPANION_CONFIG', config: state.config})
    .catch(function() { return injectEspnReader(tab); });
}

function ensureReadersInOpenEspnTabs(force) {
  return queryTabs(ESPN_URLS).then(function(tabs) {
    return Promise.all(tabs.map(function(tab) { return ensureEspnReader(tab, force); }));
  });
}

function broadcastWarRoom(force) {
  var picks = getPicks();
  return queryTabs(WAR_ROOM_URLS).then(function(tabs) {
    var message = {
        type: 'WAR_ROOM_SNAPSHOT',
        snapshot: {
          version: 1,
          extensionVersion: getExtensionVersion(),
          draftKey: state.draftKey,
          draftComplete: Boolean(state.espn.draftComplete),
          expectedCompleted: Number(state.espn.expectedCompleted) || 0,
          picks: picks,
          unavailablePlayers: getUnavailablePlayers(),
          marketAdp: Object.keys(state.marketAdpByName || {}).map(function(key) { return state.marketAdpByName[key]; }),
          marketUpdatedAt: state.espn.marketAdpAt || null,
          force: Boolean(force),
          config: Object.assign({}, state.config)
        }
      };
    return Promise.all(tabs.map(function(tab) {
      return deliverWarRoomSnapshot(tab, message);
    })).then(function(deliveries) {
      state.warRoom.connected = deliveries.some(Boolean);
      state.warRoom.deliveryError = tabs.length > 0 && !state.warRoom.connected
        ? 'War Room tab found, but the sync bridge could not be reached. Refresh the War Room tab.'
        : null;
      if (state.warRoom.connected) state.warRoom.lastDeliveredAt = new Date().toISOString();
      return deliveries;
    });
  });
}

function sendConfigToEspn() {
  return queryTabs(ESPN_URLS).then(function(tabs) {
    return Promise.all(tabs.map(function(tab) {
      return sendTabQuiet(tab.id, {type: 'COMPANION_CONFIG', config: state.config});
    }));
  });
}

function mergePicks(picks) {
  var totalPicks = Math.max(1, Number(state.config.teams) * Number(state.config.rounds));
  (Array.isArray(picks) ? picks : []).forEach(function(pick) {
    var overallPick = Number(pick && pick.overallPick);
    var playerName = String(pick && pick.playerName || '').trim();
    var playerId = pick && (pick.espnPlayerId || pick.playerId);
    if (!Number.isInteger(overallPick) || overallPick < 1 || overallPick > totalPicks) return;
    if (!playerName) {
      if (playerId != null) state.unresolvedPlayerIdsByPick[String(overallPick)] = String(playerId).slice(0, 40);
      return;
    }
    delete state.unresolvedPlayerIdsByPick[String(overallPick)];
    var source = String(pick.source || (pick.method === 'api' ? 'rest' : pick.method || 'dom')).slice(0, 20);
    var incoming = {
      overallPick: overallPick,
      playerName: playerName.slice(0, 100),
      position: String(pick.position || '').slice(0, 4),
      teamId: pick.teamId == null ? null : String(pick.teamId).slice(0, 40),
      isMine: typeof pick.isMine === 'boolean' ? pick.isMine : null,
      method: source.slice(0, 12),
      source: source,
      playerId: playerId == null ? null : String(playerId).slice(0, 40),
      espnPlayerId: playerId == null ? null : String(playerId).slice(0, 40),
      observedAt:pick.observedAt || new Date().toISOString()
    };
    var existing = state.picksByNumber[String(overallPick)] || null;
    var reconciled = liveCapture.reconcileObservation(existing, incoming);
    var entry = reconciled.entry;
    entry.espnPlayerId = entry.playerId || entry.espnPlayerId || null;
    entry.method = String(entry.source || entry.method || 'dom').slice(0, 12);
    state.picksByNumber[String(overallPick)] = entry;
    if (reconciled.conflict) state.conflictsByPick[String(overallPick)] = reconciled.conflict;
  });
  state.ledgerTeams = Number(state.config.teams);
  state.espn.captured = getPicks().length;
}

function draftKeyFromUrl(url) {
  try {
    var parsed = new URL(String(url || ''));
    var leagueId = parsed.searchParams.get('leagueId');
    var seasonId = parsed.searchParams.get('seasonId');
    if (/^\d+$/.test(String(leagueId || ''))) {
      return String(seasonId || 'unknown') + ':' + String(leagueId);
    }
    var roomId = parsed.searchParams.get('draftId') || parsed.searchParams.get('mockDraftId') ||
      parsed.searchParams.get('roomId');
    var identity = roomId || parsed.hostname + parsed.pathname;
    var hash = 2166136261;
    for (var index = 0; index < identity.length; index++) {
      hash ^= identity.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return 'page:' + String(seasonId || 'unknown') + ':' + (hash >>> 0).toString(36);
  } catch (error) {
    return null;
  }
}

function resetEspnDraftProgress() {
  state.espn.captured = 0;
  state.espn.visibleCaptured = 0;
  state.espn.visibleCandidates = 0;
  state.espn.visibleRejected = 0;
  state.espn.currentPick = null;
  state.espn.expectedCompleted = 0;
  state.espn.draftComplete = false;
  state.espn.screenFrames = {};
  state.espn.apiPickFields = [];
  state.espn.liveCapture = {sources:{}, counters:{}, observations:0, candidates:0, latestPick:0};
  state.conflictsByPick = {};
  state.unresolvedPlayerIdsByPick = {};
}

function recordScreenFrame(sender, message) {
  var frameId = sender && Number.isInteger(sender.frameId) ? sender.frameId : -1;
  var key = String(frameId);
  if (!state.espn.screenFrames || typeof state.espn.screenFrames !== 'object') {
    state.espn.screenFrames = {};
  }
  var previous = state.espn.screenFrames[key] || {};
  state.espn.screenFrames[key] = {
    frameId: frameId,
    topFrame: Boolean(message.topFrame),
    picks: Math.max(Number(previous.picks) || 0, Number(message.captured) || Number(message.pickCount) || 0),
    candidates: Math.max(Number(previous.candidates) || 0, Number(message.candidates) || 0),
    rejected: Math.max(Number(previous.rejected) || 0, Number(message.rejected) || 0),
    parseFailureSamples: Array.isArray(message.parseFailureSamples)
      ? message.parseFailureSamples.slice(0, 8).map(function(value) { return String(value).slice(0, 180); })
      : previous.parseFailureSamples || [],
    currentPick: Math.max(Number(previous.currentPick) || 0, Number(message.currentPick) || 0),
    urlPath: String(message.url || '').replace(/^https?:\/\/[^/]+/i, '').slice(0, 160),
    lastSeenAt: new Date().toISOString()
  };
}

function activateDraft(url) {
  var nextKey = draftKeyFromUrl(url);
  if (!nextKey) return false;
  var changed = state.draftKey !== nextKey;
  if (changed) {
    state.draftKey = nextKey;
    state.picksByNumber = {};
    state.unavailablePlayersByKey = {};
    state.ledgerTeams = Number(state.config.teams);
    resetEspnDraftProgress();
    state.espn.structuredAt = null;
    state.espn.method = null;
    state.espn.apiAvailable = false;
    state.espn.apiComplete = false;
    state.espn.apiHttpStatus = null;
    state.espn.apiRole = null;
    state.espn.apiRawCount = 0;
    state.espn.apiResolved = 0;
    state.espn.apiUnresolved = 0;
    state.espn.apiError = null;
    state.espn.unresolvedPickNumbers = [];
    state.espn.unresolvedPickMetadata = {};
    state.warRoom.applied = 0;
    state.warRoom.unmatched = 0;
    state.warRoom.acknowledgedCaptured = 0;
    state.warRoom.lastRetryCaptured = null;
  }
  return changed;
}

function replacePicks(picks, method) {
  state.picksByNumber = {};
  mergePicks(picks);
  state.espn.method = method || 'api';
  state.espn.structuredAt = new Date().toISOString();
}

function reconcileStructuredPicks(picks, rawPickNumbers, unresolved, complete) {
  var previous = state.picksByNumber;
  var structured = {};
  (Array.isArray(picks) ? picks : []).forEach(function(pick) {
    structured[String(Number(pick.overallPick))] = pick;
  });
  var rawNumbers = (Array.isArray(rawPickNumbers) ? rawPickNumbers : [])
    .map(Number)
    .filter(function(number) {
      return Number.isInteger(number) && number > 0 &&
        number <= Number(state.config.teams) * Number(state.config.rounds);
    });
  var next = {};
  rawNumbers.forEach(function(number) {
    var key = String(number);
    if (structured[key]) next[key] = structured[key];
    else if (previous[key]) next[key] = previous[key];
  });
  state.picksByNumber = next;
  mergePicks(picks);
  state.espn.unresolvedPickNumbers = (Array.isArray(unresolved) ? unresolved : [])
    .map(function(item) { return Number(item && item.overallPick); })
    .filter(function(number) { return Number.isInteger(number) && number > 0; });
  state.espn.unresolvedPickMetadata = {};
  (Array.isArray(unresolved) ? unresolved : []).forEach(function(item) {
    var number = Number(item && item.overallPick);
    if (!Number.isInteger(number) || number < 1) return;
    state.espn.unresolvedPickMetadata[String(number)] = {
      teamId: item.teamId == null ? null : String(item.teamId),
      isMine: typeof item.isMine === 'boolean' ? item.isMine : null
    };
  });
  state.espn.method = complete ? 'api' : 'hybrid';
  state.espn.structuredAt = new Date().toISOString();
}

function mergeUnresolvedScreenPicks(picks) {
  var unresolvedNumbers = new Set(state.espn.unresolvedPickNumbers || []);
  var unresolvedMetadata = state.espn.unresolvedPickMetadata || {};
  mergePicks((Array.isArray(picks) ? picks : []).filter(function(pick) {
    return unresolvedNumbers.has(Number(pick && pick.overallPick));
  }).map(function(pick) {
    var metadata = unresolvedMetadata[String(Number(pick.overallPick))] || {};
    return Object.assign({}, pick, {
      teamId: metadata.teamId == null ? pick.teamId : metadata.teamId,
      isMine: typeof metadata.isMine === 'boolean' ? metadata.isMine : pick.isMine,
      method: 'hybrid'
    });
  }));
}

function structuredFeedIsFresh() {
  var timestamp = Date.parse(state.espn.structuredAt || '');
  return Number.isFinite(timestamp) && Date.now() - timestamp < 20000;
}

function liveCaptureIsFresh() {
  var timestamp = Date.parse(state.espn.liveStructuredAt || '');
  return Number.isFinite(timestamp) && Date.now() - timestamp < 20000;
}

function updateConfig(config) {
  config = config || {};
  var previousTeams = Number(state.config.teams);
  var teams = Math.max(2, Math.min(20, Number(config.teams) || previousTeams || 10));
  var next = {
    teams: teams,
    draftSlot: Math.max(1, Math.min(teams, Number(config.draftSlot) || state.config.draftSlot || 1)),
    rounds: Math.max(1, Math.min(30, Number(config.rounds) || state.config.rounds || 16))
  };
  var teamsChanged = previousTeams !== next.teams;

  state.config = next;
  if (teamsChanged) {
    state.picksByNumber = {};
    state.unavailablePlayersByKey = {};
    state.ledgerTeams = next.teams;
    resetEspnDraftProgress();
  }

  return {teamsChanged: teamsChanged};
}

function syncConfigAndReconcile(config, sendResponse) {
  var change = updateConfig(config);
  return storageSave()
    .then(sendConfigToEspn)
    .then(function() { return broadcastWarRoom(true); })
    .then(function() {
      return change.teamsChanged ? ensureReadersInOpenEspnTabs(true) : null;
    })
    .then(function() {
      if (typeof sendResponse === 'function') sendResponse(statusSnapshot());
    });
}

function statusSnapshot() {
  return {
    extensionVersion: getExtensionVersion(),
    config: state.config,
    picks: getPicks(),
    espn: state.espn,
    warRoom: state.warRoom,
    fantasyPros: state.fantasyProsDiagnostics || null
  };
}

function fantasyProsKeyStatus() {
  return chrome.storage.local.get(FANTASYPROS_KEY_STORAGE).then(function(result) {
    return {configured:Boolean(String(result && result[FANTASYPROS_KEY_STORAGE] || '').trim())};
  });
}

function saveFantasyProsKey(rawKey) {
  var key = String(rawKey || '').trim();
  if (key.length < 12 || key.length > 300 || /\s/.test(key)) {
    return Promise.reject(new Error('That does not look like a valid FantasyPros API key.'));
  }
  var payload = {};
  payload[FANTASYPROS_KEY_STORAGE] = key;
  return chrome.storage.local.set(payload).then(function() { return {configured:true}; });
}

function testFantasyProsKey() {
  return chrome.storage.local.get(FANTASYPROS_KEY_STORAGE).then(function(result) {
    var key = String(result && result[FANTASYPROS_KEY_STORAGE] || '').trim();
    if (!key) throw new Error('Save your FantasyPros API key first.');
    var url = 'https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings' +
      '?position=ALL&scoring=PPR&type=DRAFT&week=0';
    return fetch(url, {method:'GET', headers:{'x-api-key':key}, credentials:'omit', cache:'no-store'});
  }).then(function(response) {
    return response.text().then(function(text) {
      var payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch (error) {}
      if (!response.ok) {
        var detail = payload && (payload.message || payload.error) || ('HTTP ' + response.status);
        throw new Error('FantasyPros rejected the request: ' + String(detail).slice(0, 140));
      }
      var players = payload && Array.isArray(payload.players) ? payload.players : [];
      var rankings = payload && payload.rankings && typeof payload.rankings === 'object'
        ? Object.keys(payload.rankings).length : 0;
      return {
        configured:true, connected:true, httpStatus:response.status,
        players:players.length, rankingGroups:rankings,
        lastUpdated:String(payload && (payload.last_updated || payload.lastUpdated) || '').slice(0, 60) || null
      };
    });
  });
}

function fantasyProsPayloadShape(payload) {
  if (Array.isArray(payload)) return 'array';
  if (payload === null) return 'null';
  return typeof payload;
}

function fantasyProsSafeError(error) {
  return String(error && error.message ? error.message : error || 'Unknown error')
    .replace(/\b(api[_ -]?key|authorization|cookie|access[_ -]?token|token)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 300);
}

function fantasyProsNextStep(stage) {
  if (stage === 'api-key') return 'Save and test the FantasyPros API key in the extension popup, then retry once.';
  if (stage === 'expert-directory-request') return 'Wait a few minutes and retry once. If it repeats, copy these diagnostics; FantasyPros did not return the expert directory successfully.';
  if (stage === 'expert-directory-parse') return 'Copy these diagnostics. FantasyPros changed or omitted the 2025 Draft Accuracy expert-directory fields and the parser needs an update.';
  if (stage === 'consensus-request') return 'Wait a few minutes and retry once. If it repeats, copy these diagnostics; the filtered consensus request failed.';
  if (stage === 'consensus-validation') return 'Copy these diagnostics. Check selected expert and player counts before changing the parser or preset.';
  if (stage === 'player-validation') return 'Copy these diagnostics. FantasyPros returned rankings, but too many rows were missing a valid rank, name, or supported position.';
  if (stage === 'war-room-delivery') return 'Keep The War Room open, reload its tab, and retry once. If it repeats, reload the extension and copy these diagnostics.';
  return 'Copy these diagnostics before retrying so the failed stage and response counts are preserved.';
}

function newFantasyProsDiagnostics() {
  return {
    schemaVersion:1,
    attemptId:'fp-' + Date.now().toString(36),
    extensionVersion:getExtensionVersion(),
    startedAt:new Date().toISOString(),
    completedAt:null,
    durationMs:null,
    status:'running',
    stage:'starting',
    requestsUsed:0,
    credentialConfigured:false,
    cache:{used:false, ageMinutes:null, presetSize:0},
    expertDirectory:{request:null, accuracySeason:null, payloadShape:null, topLevelKeys:[], directoryCount:0, nameMatches:0, rankMatches:0, selectedCount:0, selectedExperts:[], missingPresetNames:[], limitedTier:false, fallbackUsed:false, fallbackReason:null},
    consensus:{request:null, payloadShape:null, topLevelKeys:[], reportedExperts:0, activeExpertCount:0, rawPlayerCount:0, validPlayerCount:0, rejected:{invalidRank:0, missingName:0, unsupportedPosition:0}, duplicateCount:0, duplicateSamples:[], lastUpdated:null},
    delivery:{warRoomTabs:0, attempted:0, delivered:0},
    result:{updated:false, error:null, nextStep:null}
  };
}

function finishFantasyProsDiagnostics(diagnostics, error) {
  diagnostics.completedAt = new Date().toISOString();
  diagnostics.durationMs = Math.max(0, Date.now() - Date.parse(diagnostics.startedAt));
  diagnostics.status = error ? 'error' : 'success';
  diagnostics.result.updated = !error;
  diagnostics.result.error = error ? fantasyProsSafeError(error) : null;
  diagnostics.result.nextStep = error ? fantasyProsNextStep(diagnostics.stage) : 'No action needed. The validated rankings were delivered to The War Room.';
  state.fantasyProsDiagnostics = diagnostics;
  return diagnostics;
}

function fantasyProsFetchJson(path, key, params, requestDiagnostics) {
  var url = new URL('https://api.fantasypros.com/public/v2/json/' + path.replace(/^\//, ''));
  Object.keys(params || {}).forEach(function(name) { url.searchParams.set(name, params[name]); });
  var requestStarted = Date.now();
  if (requestDiagnostics) {
    requestDiagnostics.endpoint = '/public/v2/json/' + path.replace(/^\//, '');
    requestDiagnostics.startedAt = new Date(requestStarted).toISOString();
    requestDiagnostics.httpStatus = null;
    requestDiagnostics.durationMs = null;
    requestDiagnostics.responseShape = null;
    requestDiagnostics.responseSizeBytes = 0;
    requestDiagnostics.error = null;
  }
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timeout = setTimeout(function() { if (controller) controller.abort(); }, 12000);
  return fetch(url.toString(), {
    method:'GET', headers:{'x-api-key':key}, credentials:'omit', cache:'no-store',
    signal:controller ? controller.signal : undefined
  }).then(function(response) {
    if (requestDiagnostics) requestDiagnostics.httpStatus = response.status;
    return response.text().then(function(text) {
      var payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch (error) {}
      if (requestDiagnostics) {
        requestDiagnostics.responseShape = fantasyProsPayloadShape(payload);
        requestDiagnostics.responseSizeBytes = String(text || '').length;
        requestDiagnostics.topLevelKeys = payload && typeof payload === 'object' && !Array.isArray(payload)
          ? Object.keys(payload).slice(0, 25) : [];
      }
      if (!response.ok) {
        var detail = payload && (payload.message || payload.error) || ('HTTP ' + response.status);
        throw new Error('FantasyPros rejected the request: ' + String(detail).slice(0, 140));
      }
      if (!payload || typeof payload !== 'object') throw new Error('FantasyPros returned an empty rankings response.');
      return payload;
    });
  }).catch(function(error) {
    if (error && error.name === 'AbortError') error = new Error('FantasyPros did not respond within 12 seconds. Try again shortly.');
    if (requestDiagnostics) requestDiagnostics.error = fantasyProsSafeError(error);
    throw error;
  }).finally(function() {
    clearTimeout(timeout);
    if (requestDiagnostics) requestDiagnostics.durationMs = Math.max(0, Date.now() - requestStarted);
  });
}

function fantasyProsObjectList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && (value.expert_id || value.expertId || value.id)) return [value];
  if (value && typeof value === 'object') return Object.keys(value).map(function(key) { return value[key]; });
  return [];
}

function fantasyProsExpertList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && (value.expert_id || value.expertId || value.expertID || value.id)) return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).map(function(key) {
    var expert = value[key];
    if (typeof expert === 'string') return {expert_id:key, name:expert};
    if (!expert || typeof expert !== 'object') return null;
    if (expert.expert_id || expert.expertId || expert.expertID || expert.id) return expert;
    return Object.assign({expert_id:key}, expert);
  }).filter(Boolean);
}

function fantasyProsDraftAccuracyRank(expert) {
  var draft = expert && (expert.accuracy_draft || expert.accuracyDraft) || {};
  var rank = Number(draft.ALL || draft.all || expert && (expert.accuracy_draft_rank || expert.draft_rank));
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function fantasyProsExpertNameKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fantasyProsPresetRankByName(name) {
  var key = fantasyProsExpertNameKey(name);
  for (var index = 0; index < FANTASYPROS_2025_DRAFT_ACCURACY_TOP20.length; index += 1) {
    var presetKey = fantasyProsExpertNameKey(FANTASYPROS_2025_DRAFT_ACCURACY_TOP20[index]);
    if (key === presetKey || key.indexOf(presetKey + ' ') === 0) return index + 1;
  }
  return null;
}

function extractFantasyProsTop20Experts(payload, diagnostics) {
  var accuracySeason = Number(payload && (payload.accuracy_draft_season || payload.accuracyDraftSeason));
  var directory = fantasyProsExpertList(payload && payload.experts);
  if (diagnostics) {
    diagnostics.accuracySeason = Number.isFinite(accuracySeason) ? accuracySeason : null;
    diagnostics.payloadShape = fantasyProsPayloadShape(payload);
    diagnostics.topLevelKeys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 25) : [];
    diagnostics.directoryCount = directory.length;
    diagnostics.nameMatches = directory.filter(function(expert) {
      return fantasyProsPresetRankByName(expert && (expert.name || expert.expert_name || expert.expertName || expert.expert_display_name || expert.display_name));
    }).length;
    diagnostics.rankMatches = directory.filter(function(expert) {
      var rank = fantasyProsDraftAccuracyRank(expert);
      return rank !== null && rank <= 20;
    }).length;
  }
  if (accuracySeason !== 2025) {
    throw new Error('FantasyPros returned draft-accuracy season ' + (accuracySeason || 'unknown') + '; expected 2025. No rankings were changed.');
  }
  var experts = directory.map(function(expert) {
    var name = String(expert && (expert.name || expert.expert_name || expert.expertName || expert.expert_display_name || expert.display_name) || '').trim();
    var accuracyRank = fantasyProsDraftAccuracyRank(expert);
    var presetRank = fantasyProsPresetRankByName(name);
    return {
      id:String(expert && (expert.expert_id || expert.expertId || expert.expertID || expert.id) || '').trim(),
      name:name,
      rank:accuracyRank !== null && accuracyRank <= 20 ? accuracyRank : presetRank
    };
  }).filter(function(expert) { return expert.id && expert.rank !== null && expert.rank <= 20; })
    .sort(function(a, b) { return a.rank - b.rank || Number(a.id) - Number(b.id); })
    .slice(0, 20);
  var uniqueIds = {};
  experts.forEach(function(expert) { uniqueIds[expert.id] = true; });
  if (diagnostics) {
    diagnostics.selectedCount = experts.length;
    diagnostics.selectedExperts = experts.map(function(expert) {
      return {id:expert.id, name:expert.name || 'name unavailable', rank:expert.rank};
    });
    var selectedNames = {};
    experts.forEach(function(expert) { selectedNames[fantasyProsExpertNameKey(expert.name)] = true; });
    diagnostics.missingPresetNames = FANTASYPROS_2025_DRAFT_ACCURACY_TOP20.filter(function(name) {
      return !selectedNames[fantasyProsExpertNameKey(name)];
    }).slice(0, 20);
  }
  if (!experts.length || Object.keys(uniqueIds).length !== experts.length) {
    var namedMatches = directory.filter(function(expert) {
      return fantasyProsPresetRankByName(expert && (expert.name || expert.expert_name || expert.expertName || expert.expert_display_name || expert.display_name));
    }).length;
    var rankedMatches = directory.filter(function(expert) {
      var rank = fantasyProsDraftAccuracyRank(expert);
      return rank !== null && rank <= 20;
    }).length;
    throw new Error('FantasyPros returned ' + directory.length + ' active experts but no usable Top-20 set (' + namedMatches + ' name / ' + rankedMatches + ' rank matches); no rankings were changed.');
  }
  return experts;
}

function fantasyProsLimitedTierFallbackExperts(payload, diagnostics) {
  var directory = fantasyProsExpertList(payload && payload.experts);
  var limited = Boolean(payload && payload.public_api_limited);
  var accuracySeason = Number(payload && (payload.accuracy_draft_season || payload.accuracyDraftSeason));
  if (diagnostics) diagnostics.limitedTier = limited;
  if (!limited || directory.length) return null;
  if (accuracySeason !== 2025) {
    throw new Error('FantasyPros limited the expert directory and returned draft-accuracy season ' + (accuracySeason || 'unknown') + '; expected 2025. No rankings were changed.');
  }
  var experts = FANTASYPROS_TOP20_LIMITED_TIER_FALLBACK_IDS.map(function(id) {
    return {id:id, name:'Verified Top-20 contributor', rank:null};
  });
  if (diagnostics) {
    diagnostics.accuracySeason = accuracySeason;
    diagnostics.payloadShape = fantasyProsPayloadShape(payload);
    diagnostics.topLevelKeys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 25) : [];
    diagnostics.directoryCount = 0;
    diagnostics.selectedCount = experts.length;
    diagnostics.selectedExperts = experts.map(function(expert) { return Object.assign({}, expert); });
    diagnostics.missingPresetNames = FANTASYPROS_2025_DRAFT_ACCURACY_TOP20.slice();
    diagnostics.fallbackUsed = true;
    diagnostics.fallbackReason = 'FantasyPros returned an empty expert directory with public_api_limited=true; using the nine active preset IDs verified on 2026-08-24, subject to consensus validation.';
  }
  return experts;
}

function cachedFantasyProsTop20Experts() {
  var cache = state.fantasyProsTop20Preset;
  var age = Date.now() - Number(cache && cache.observedAt || 0);
  if (!cache || Number(cache.accuracySeason) !== 2025 || !Array.isArray(cache.experts) || cache.experts.length < 1 || cache.experts.length > 20 || age < 0 || age > FANTASYPROS_PRESET_CACHE_MS) return null;
  return cache.experts;
}

function fantasyProsActiveExpertCount(rankings, requestedExperts) {
  var requested = {};
  requestedExperts.forEach(function(expert) { requested[String(expert.id)] = true; });
  var included = rankings && rankings.experts_available && Array.isArray(rankings.experts_available.included)
    ? rankings.experts_available.included : [];
  var includedCount = included.filter(function(id) { return requested[String(id)]; }).length;
  var namedCount = rankings && rankings.expert_name && typeof rankings.expert_name === 'object'
    ? Object.keys(rankings.expert_name).filter(function(id) { return requested[String(id)]; }).length : 0;
  var reported = Number(rankings && rankings.total_experts);
  return includedCount || namedCount || (Number.isFinite(reported) ? reported : 0);
}

async function refreshFantasyProsRankings() {
  var diagnostics = newFantasyProsDiagnostics();
  var key = '';
  var selectedExperts = null;
  state.fantasyProsDiagnostics = diagnostics;

  try {
    await storageSave();
    diagnostics.stage = 'api-key';
    var storedKey = await chrome.storage.local.get(FANTASYPROS_KEY_STORAGE);
    key = String(storedKey && storedKey[FANTASYPROS_KEY_STORAGE] || '').trim();
    if (!key) throw new Error('Save your FantasyPros API key first.');
    diagnostics.credentialConfigured = true;

    selectedExperts = cachedFantasyProsTop20Experts();
    if (selectedExperts) {
      var cacheAge = Date.now() - Number(state.fantasyProsTop20Preset && state.fantasyProsTop20Preset.observedAt || 0);
      diagnostics.cache.used = true;
      diagnostics.cache.ageMinutes = Math.max(0, Math.round(cacheAge / 60000));
      diagnostics.cache.presetSize = selectedExperts.length;
      diagnostics.expertDirectory.selectedCount = selectedExperts.length;
      diagnostics.expertDirectory.selectedExperts = selectedExperts.map(function(expert) {
        return {id:String(expert.id), name:String(expert.name || 'name unavailable'), rank:Number(expert.rank) || null};
      });
    } else {
      diagnostics.stage = 'expert-directory-request';
      diagnostics.requestsUsed += 1;
      diagnostics.expertDirectory.request = {};
      var expertPayload = await fantasyProsFetchJson('nfl/2026/rankings/experts', key, {
        position:'ALL', type:'DRAFT', scoring:'PPR', include_overall:'true'
      }, diagnostics.expertDirectory.request);
      diagnostics.stage = 'expert-directory-parse';
      selectedExperts = fantasyProsLimitedTierFallbackExperts(expertPayload, diagnostics.expertDirectory) ||
        extractFantasyProsTop20Experts(expertPayload, diagnostics.expertDirectory);
      state.fantasyProsTop20Preset = {
        accuracySeason:2025,
        observedAt:Date.now(),
        experts:selectedExperts
      };
      diagnostics.cache.presetSize = selectedExperts.length;
      await storageSave();
    }

    diagnostics.stage = 'consensus-request';
    diagnostics.requestsUsed += 1;
    diagnostics.consensus.request = {};
    var rankings = await fantasyProsFetchJson('nfl/2026/consensus-rankings', key, {
      position:'ALL', scoring:'PPR', type:'DRAFT', week:'0', experts:'show',
      filters:selectedExperts.map(function(expert) { return expert.id; }).join(':')
    }, diagnostics.consensus.request);
    diagnostics.consensus.payloadShape = fantasyProsPayloadShape(rankings);
    diagnostics.consensus.topLevelKeys = rankings && typeof rankings === 'object' ? Object.keys(rankings).slice(0, 25) : [];
    diagnostics.consensus.reportedExperts = Number(rankings && rankings.total_experts) || 0;
    diagnostics.consensus.lastUpdated = String(rankings && (rankings.last_updated || rankings.lastUpdated) || '').slice(0, 60) || null;
    var consensusExpertNames = rankings && rankings.expert_name && typeof rankings.expert_name === 'object'
      ? rankings.expert_name : {};
    selectedExperts.forEach(function(expert) {
      var liveName = String(consensusExpertNames[String(expert.id)] || '').trim();
      if (liveName) expert.name = liveName;
    });
    diagnostics.expertDirectory.selectedExperts = selectedExperts.map(function(expert) {
      return {id:String(expert.id), name:String(expert.name || 'name unavailable'), rank:Number(expert.rank) || null};
    });

    diagnostics.stage = 'consensus-validation';
    var expertCount = fantasyProsActiveExpertCount(rankings, selectedExperts);
    diagnostics.consensus.activeExpertCount = expertCount;
    if (expertCount < 1 || expertCount > 20) {
      throw new Error('FantasyPros did not return the active experts in the 2025 Draft Accuracy Top-20 preset; no rankings were changed.');
    }

    diagnostics.stage = 'player-validation';
    var players = fantasyProsObjectList(rankings.players || rankings.rankings);
    diagnostics.consensus.rawPlayerCount = players.length;
    var rows = players.map(function(player) {
      var rank = Number(player && (player.rank_ecr || player.ecr || player.rank));
      var name = String(player && (player.player_name || player.playerName || player.name) || '').trim();
      var position = String(player && (player.player_position_id || player.player_position || player.position_id || player.position) || '').toUpperCase().replace('D/ST','DST');
      var posRank = String(player && (player.pos_rank || player.position_rank) || '');
      if (!/^\d+$/.test(String(rank))) { diagnostics.consensus.rejected.invalidRank += 1; return null; }
      if (!name) { diagnostics.consensus.rejected.missingName += 1; return null; }
      if (!/^(QB|RB|WR|TE|K|DST)$/.test(position)) { diagnostics.consensus.rejected.unsupportedPosition += 1; return null; }
      return {
        RK:String(rank), TIERS:String(Number(player.tier) || ''), 'PLAYER NAME':name,
        TEAM:String(player.player_team_id || player.team || ''),
        POS:posRank && posRank.toUpperCase().indexOf(position) === 0 ? posRank : position,
        'BYE WEEK':String(player.player_bye_week || player.bye_week || '')
      };
    }).filter(Boolean).sort(function(a, b) { return Number(a.RK) - Number(b.RK); });
    diagnostics.consensus.validPlayerCount = rows.length;
    if (rows.length < 100 || rows.length > 600) throw new Error('FantasyPros returned ' + rows.length + ' ranked players; no rankings were changed.');
    var canonical = {};
    rows.forEach(function(row) {
      var keyName = row['PLAYER NAME'].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (canonical[keyName]) {
        diagnostics.consensus.duplicateCount += 1;
        if (diagnostics.consensus.duplicateSamples.length < 8) diagnostics.consensus.duplicateSamples.push(row['PLAYER NAME']);
      }
      canonical[keyName] = true;
    });
    if (diagnostics.consensus.duplicateCount) throw new Error('FantasyPros returned duplicate players, including ' + diagnostics.consensus.duplicateSamples[0] + '.');

    var update = {
      rows:rows, presetSize:20, expertCount:expertCount, playerCount:rows.length,
      lastUpdated:diagnostics.consensus.lastUpdated,
      receivedAt:new Date().toISOString()
    };
    diagnostics.stage = 'war-room-delivery';
    var tabs = await queryTabs(WAR_ROOM_URLS);
    diagnostics.delivery.warRoomTabs = tabs.length;
    if (!tabs.length) throw new Error('Open The War Room before refreshing FantasyPros rankings.');
    await Promise.all(tabs.map(function(tab) {
      diagnostics.delivery.attempted += 1;
      return injectWarRoomBridge(tab).then(function() {
        return sendTab(tab.id, {type:'WAR_ROOM_FANTASYPROS_RANKINGS', update:update});
      }).then(function() { diagnostics.delivery.delivered += 1; });
    }));

    diagnostics.stage = 'complete';
    finishFantasyProsDiagnostics(diagnostics, null);
    await storageSave();
    return {
      connected:true, updated:true, players:rows.length, experts:expertCount, presetSize:20,
      lastUpdated:update.lastUpdated, diagnostics:diagnostics
    };
  } catch (error) {
    finishFantasyProsDiagnostics(diagnostics, error);
    await storageSave().catch(function() {});
    var wrapped = new Error(fantasyProsSafeError(error));
    wrapped.fantasyProsDiagnostics = diagnostics;
    throw wrapped;
  }
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  ready.then(function() {
    if (!message || !message.type) return null;

    if (message.type === 'ESPN_CONTENT_READY') {
      var newDraft = activateDraft(message.url);
      state.espn.connected = true;
      state.espn.lastSeenAt = new Date().toISOString();
      state.espn.lastUrl = message.url || state.espn.lastUrl || null;
      if (sender.tab) sendTabQuiet(sender.tab.id, {type: 'COMPANION_CONFIG', config: state.config});
      return storageSave().then(function() {
        return newDraft ? broadcastWarRoom(true) : null;
      });
    }

    if (message.type === 'ESPN_HEARTBEAT') {
      recordScreenFrame(sender, message);
      state.espn.connected = true;
      if (message.draftPage || message.topFrame) {
        state.espn.draftPage = Boolean(message.draftPage);
      }
      state.espn.lastSeenAt = new Date().toISOString();
      state.espn.lastUrl = message.url || state.espn.lastUrl || null;
      if (Number.isFinite(Number(message.captured))) {
        state.espn.visibleCaptured = Math.max(Number(state.espn.visibleCaptured) || 0, Number(message.captured));
      }
      if (Number.isFinite(Number(message.candidates))) {
        state.espn.visibleCandidates = Math.max(Number(state.espn.visibleCandidates) || 0, Number(message.candidates));
      }
      if (Number.isFinite(Number(message.currentPick)) && Number(message.currentPick) > 0) {
        state.espn.currentPick = Math.max(Number(state.espn.currentPick) || 0, Number(message.currentPick));
        state.espn.expectedCompleted = Math.max(
          Number(state.espn.expectedCompleted) || 0,
          Number(message.currentPick) - 1
        );
      }
      // Readers run in every ESPN frame. A child frame may positively detect
      // completion, but it must not clear a completed state reported by the
      // top frame or another frame that can see the terminal board slot.
      if (message.topFrame || message.draftComplete) {
        state.espn.draftComplete = Boolean(message.draftComplete);
        if (message.draftComplete) {
          var terminalPickCount = Number(state.config.teams) * Number(state.config.rounds);
          state.espn.currentPick = Math.max(Number(state.espn.currentPick) || 0, terminalPickCount);
          state.espn.expectedCompleted = Math.max(Number(state.espn.expectedCompleted) || 0, terminalPickCount);
        }
      }
      var detectedRounds = Number(message.detectedRounds);
      var shouldUpdateRounds = Number.isInteger(detectedRounds) && detectedRounds >= 1 &&
        detectedRounds !== Number(state.config.rounds);
      if (shouldUpdateRounds) {
        updateConfig({
          teams: state.config.teams,
          draftSlot: state.config.draftSlot,
          rounds: detectedRounds
        });
        return storageSave()
          .then(sendConfigToEspn)
          .then(function() { return broadcastWarRoom(true); });
      }
      return storageSave();
    }

    if (message.type === 'ESPN_PICKS_FOUND') {
      activateDraft(message.url);
      recordScreenFrame(sender, message);
      mergeUnavailablePlayers(message.unavailablePlayers);
      if (liveCaptureIsFresh()) {
        mergePicks(message.picks);
        return storageSave().then(function() { return broadcastWarRoom(false); });
      }
      if (structuredFeedIsFresh() && state.espn.method === 'api') {
        return storageSave().then(function() { return broadcastWarRoom(false); });
      }
      if (structuredFeedIsFresh() && state.espn.method === 'hybrid') {
        mergeUnresolvedScreenPicks(message.picks);
      } else {
        mergePicks(message.picks);
        state.espn.method = 'dom';
      }
      state.espn.connected = true;
      state.espn.draftPage = true;
      state.espn.lastSeenAt = new Date().toISOString();
      state.espn.visibleRejected = Math.max(Number(state.espn.visibleRejected) || 0, Number(message.rejected) || 0);
      return storageSave().then(function() { return broadcastWarRoom(false); });
    }

    if (message.type === 'ESPN_LIVE_OBSERVATIONS') {
      activateDraft(message.url);
      var observations = Array.isArray(message.observations) ? message.observations.slice(0, 500) : [];
      mergePicks(observations);
      var source = String(message.source || 'network').slice(0, 20);
      var telemetry = liveCapture.sanitizeTelemetry(message.telemetry || {source:source});
      var live = state.espn.liveCapture && typeof state.espn.liveCapture === 'object'
        ? state.espn.liveCapture
        : {sources:{}, counters:{}, observations:0, candidates:0, latestPick:0};
      live.sources = Object.assign({}, live.sources || {});
      live.sources[source] = {
        active:true,
        lastSeenAt:new Date().toISOString(),
        sourceDetail:telemetry.sourceDetail,
        fields:telemetry.fields,
        candidateCount:Number(telemetry.candidateCount) || observations.length
      };
      live.counters = Object.assign({}, live.counters || {}, message.counters || {});
      live.observations = (Number(live.observations) || 0) + 1;
      live.candidates = (Number(live.candidates) || 0) + observations.length;
      observations.forEach(function(observation) {
        live.latestPick = Math.max(Number(live.latestPick) || 0, Number(observation.overallPick) || 0);
      });
      live.conflicts = Object.keys(state.conflictsByPick || {}).length;
      live.unresolvedPlayerIds = Object.keys(state.unresolvedPlayerIdsByPick || {}).length;
      state.espn.liveCapture = live;
      state.espn.liveStructuredAt = new Date().toISOString();
      state.espn.method = source === 'react' ? 'structured' : 'network';
      state.espn.connected = true;
      state.espn.draftPage = true;
      state.espn.lastSeenAt = new Date().toISOString();
      return storageSave().then(function() { return broadcastWarRoom(observations.length > 0); });
    }

    if (message.type === 'ESPN_STRUCTURED_PICKS') {
      activateDraft(message.url);
      reconcileStructuredPicks(
        message.picks,
        message.rawPickNumbers,
        message.unresolved,
        Boolean(message.complete)
      );
      state.espn.connected = true;
      state.espn.draftPage = true;
      state.espn.apiAvailable = true;
      state.espn.apiComplete = Boolean(message.complete);
      state.espn.apiRawCount = Number(message.rawCount) || getPicks().length;
      state.espn.apiScheduledCount = Number(message.scheduledCount) || state.espn.apiRawCount;
      state.espn.apiOpenSlots = Number(message.openSlotCount) || 0;
      state.espn.lastSuccessfulApiAt = new Date().toISOString();
      state.espn.lastSuccessfulApiResolved = getPicks().length;
      state.espn.lastSuccessfulApiRawCount = state.espn.apiRawCount;
      state.espn.lastSuccessfulApiHttpStatus = Number(message.httpStatus) || state.espn.apiHttpStatus || 200;
      state.espn.lastSeenAt = new Date().toISOString();
      return storageSave().then(function() { return broadcastWarRoom(true); });
    }

    if (message.type === 'ESPN_API_STATUS') {
      var terminalNotFound = !message.available && Number(message.httpStatus) === 404 &&
        Boolean(state.espn.draftComplete) && Boolean(state.espn.lastSuccessfulApiAt);
      state.espn.lastApiAttemptAt = new Date().toISOString();
      state.espn.lastApiAttemptHttpStatus = Number(message.httpStatus) || null;
      state.espn.lastApiAttemptError = message.error ? String(message.error).slice(0, 160) : null;
      if (terminalNotFound) {
        state.espn.apiPostDraftUnavailable = true;
        state.espn.apiError = 'ESPN closed the temporary draft feed after completion; retained the last successful structured snapshot.';
        return storageSave();
      }
      state.espn.apiPostDraftUnavailable = false;
      state.espn.apiAvailable = Boolean(message.available);
      state.espn.apiComplete = Boolean(message.complete);
      state.espn.apiHttpStatus = Number(message.httpStatus) || null;
      state.espn.apiRole = message.role ? String(message.role).slice(0, 40) : null;
      state.espn.apiTransport = message.transport ? String(message.transport).slice(0, 20) : null;
      state.espn.apiRawCount = Number(message.rawCount) || 0;
      state.espn.apiScheduledCount = Number(message.scheduledCount) || state.espn.apiRawCount;
      state.espn.apiOpenSlots = Number(message.openSlotCount) || 0;
      state.espn.apiResolved = Number(message.resolved) || 0;
      state.espn.apiUnresolved = Number(message.unresolved) || 0;
      state.espn.apiExpectedCompleted = Number(message.expectedCompleted) || 0;
      state.espn.expectedCompleted = Math.max(
        Number(state.espn.expectedCompleted) || 0,
        Number(message.expectedCompleted) || 0
      );
      if (Number(message.expectedCompleted) > 0) {
        state.espn.currentPick = Math.max(
          Number(state.espn.currentPick) || 0,
          Number(message.expectedCompleted) + 1
        );
      }
      state.espn.apiBehind = Boolean(message.behind);
      state.espn.apiPickFields = Array.isArray(message.pickFields)
        ? message.pickFields.slice(0, 20).map(String)
        : [];
      state.espn.apiError = message.error ? String(message.error).slice(0, 160) : null;
      if (message.available) {
        state.espn.lastSuccessfulApiAt = new Date().toISOString();
        state.espn.lastSuccessfulApiResolved = Number(message.resolved) || 0;
        state.espn.lastSuccessfulApiRawCount = Number(message.rawCount) || 0;
        state.espn.lastSuccessfulApiHttpStatus = Number(message.httpStatus) || 200;
      }
      if (message.behind) {
        state.espn.structuredAt = null;
        state.espn.method = 'dom';
      }
      if (!message.available && !structuredFeedIsFresh()) state.espn.method = 'dom';
      return storageSave();
    }

    if (message.type === 'ESPN_MARKET_ADP') {
      (Array.isArray(message.players) ? message.players : []).slice(0, 2000).forEach(function(player) {
        var name = String(player && player.playerName || '').trim();
        var adp = Number(player && player.adp);
        var rank = Number(player && player.rank);
        if (!name || ((!Number.isFinite(adp) || adp <= 0) && (!Number.isFinite(rank) || rank <= 0))) return;
        state.marketAdpByName[name.toLowerCase()] = {
          playerName: name.slice(0, 100),
          position: String(player.position || '').slice(0, 4),
          adp: Number.isFinite(adp) && adp > 0 && adp <= 500 ? adp : null,
          rank: Number.isFinite(rank) && rank > 0 && rank <= 2000 ? rank : null
        };
      });
      state.espn.marketAdpCount = Object.keys(state.marketAdpByName).length;
      state.espn.marketAdpAt = new Date().toISOString();
      return storageSave().then(function() { return broadcastWarRoom(true); });
    }

    if (message.type === 'WAR_ROOM_READY') {
      state.warRoom.connected = true;
      state.warRoom.lastSeenAt = new Date().toISOString();
      if (sender.tab) {
        sendTabQuiet(sender.tab.id, {
          type: 'WAR_ROOM_STATUS',
          status: state.espn.draftPage ? 'connected' : 'scanning',
          detail: state.espn.draftPage
            ? 'ESPN Sync · ' + getPicks().length + ' picks'
            : 'ESPN companion connected',
          extensionVersion: getExtensionVersion()
        });
        sendTabQuiet(sender.tab.id, {
          type: 'WAR_ROOM_SNAPSHOT',
          snapshot: {
            version: 1,
            extensionVersion: getExtensionVersion(),
            draftKey: state.draftKey,
            draftComplete: Boolean(state.espn.draftComplete),
            expectedCompleted: Number(state.espn.expectedCompleted) || 0,
            picks: getPicks(),
            unavailablePlayers: getUnavailablePlayers(),
            marketAdp: Object.keys(state.marketAdpByName || {}).map(function(key) { return state.marketAdpByName[key]; }),
            marketUpdatedAt: state.espn.marketAdpAt || null,
            config: Object.assign({}, state.config)
          }
        });
      }
      return storageSave();
    }

    if (message.type === 'WAR_ROOM_ACK') {
      var result = message.result || {};
      var acknowledgedCaptured = Number(result.captured) || 0;
      var previousAcknowledged = Number(state.warRoom.acknowledgedCaptured) || 0;
      var ledgerCaptured = getPicks().length;
      state.warRoom.connected = true;
      state.warRoom.lastSeenAt = new Date().toISOString();
      if (acknowledgedCaptured >= previousAcknowledged) {
        state.warRoom.acknowledgedCaptured = acknowledgedCaptured;
        state.warRoom.applied = Number(result.applied) || 0;
        state.warRoom.unmatched = Array.isArray(result.unmatched) ? result.unmatched.length : 0;
      }
      state.warRoom.requiredExtensionVersion = message.requiredExtensionVersion ||
        state.warRoom.requiredExtensionVersion || null;
      // The popup's saved settings are authoritative. A passive page ACK can
      // arrive before its persisted draft settings finish loading; accepting
      // those transient values here used to clear both Direct and Board picks.
      // Keep the page-reported values only as diagnostics.
      state.warRoom.reportedSettings = message.settings
        ? Object.assign({}, message.settings)
        : null;
      var effectiveAcknowledged = Math.max(previousAcknowledged, acknowledgedCaptured);
      var shouldRetry = effectiveAcknowledged < ledgerCaptured &&
        Number(state.warRoom.lastRetryCaptured) !== ledgerCaptured;
      if (shouldRetry) state.warRoom.lastRetryCaptured = ledgerCaptured;
      return storageSave().then(function() {
        return shouldRetry ? broadcastWarRoom(true) : null;
      });
    }

    if (message.type === 'WAR_ROOM_SETTINGS_UPDATE') {
      state.warRoom.connected = true;
      state.warRoom.lastSeenAt = new Date().toISOString();
      state.warRoom.requiredExtensionVersion = message.requiredExtensionVersion ||
        state.warRoom.requiredExtensionVersion || null;
      return syncConfigAndReconcile(message.config, sendResponse);
    }

    if (message.type === 'WAR_ROOM_RANKINGS_REFRESH') {
      return ensureReadersInOpenEspnTabs(true)
        .then(function() { return broadcastWarRoom(true); })
        .then(function() { if (typeof sendResponse === 'function') sendResponse(statusSnapshot()); });
    }

    if (message.type === 'GET_STATUS') {
      sendResponse(statusSnapshot());
      return null;
    }

    if (message.type === 'GET_FANTASYPROS_KEY_STATUS') {
      return fantasyProsKeyStatus().then(sendResponse);
    }

    if (message.type === 'SAVE_FANTASYPROS_KEY') {
      return saveFantasyProsKey(message.key).then(sendResponse);
    }

    if (message.type === 'REMOVE_FANTASYPROS_KEY') {
      return chrome.storage.local.remove(FANTASYPROS_KEY_STORAGE).then(function() { sendResponse({configured:false}); });
    }

    if (message.type === 'TEST_FANTASYPROS_KEY') {
      return testFantasyProsKey().then(sendResponse);
    }

    if (message.type === 'REFRESH_FANTASYPROS_RANKINGS' || message.type === 'WAR_ROOM_FANTASYPROS_REFRESH') {
      return refreshFantasyProsRankings().then(sendResponse);
    }

    if (message.type === 'UPDATE_CONFIG') {
      return syncConfigAndReconcile(message.config, sendResponse);
    }

    if (message.type === 'RESCAN') {
      return ensureReadersInOpenEspnTabs(true)
        .then(function() { return broadcastWarRoom(true); })
        .then(function() { sendResponse(statusSnapshot()); });
    }

    if (message.type === 'RESET_PICKS') {
      state.picksByNumber = {};
      state.unavailablePlayersByKey = {};
      state.ledgerTeams = Number(state.config.teams);
      resetEspnDraftProgress();
      return storageSave()
        .then(function() { return broadcastWarRoom(true); })
        .then(function() { sendResponse(statusSnapshot()); });
    }

    return null;
  }).catch(function(error) {
    var response = {error: error && error.message ? error.message : String(error)};
    if (message && (message.type === 'REFRESH_FANTASYPROS_RANKINGS' || message.type === 'WAR_ROOM_FANTASYPROS_REFRESH')) {
      response.diagnostics = error && error.fantasyProsDiagnostics || state.fantasyProsDiagnostics || null;
    }
    sendResponse(response);
  });

  return true;
});

chrome.runtime.onInstalled.addListener(function() {
  ready.then(function() {
    return Promise.all([ensureReadersInOpenEspnTabs(true), broadcastWarRoom(true)]);
  }).catch(function() {});
});

chrome.runtime.onStartup.addListener(function() {
  ready.then(function() {
    return Promise.all([ensureReadersInOpenEspnTabs(true), broadcastWarRoom(true)]);
  }).catch(function() {});
});

chrome.tabs.onRemoved.addListener(function() {
  ready.then(function() {
    return Promise.all([queryTabs(ESPN_URLS), queryTabs(WAR_ROOM_URLS)]);
  }).then(function(results) {
    state.espn.connected = results[0].length > 0;
    if (!results[1].length) {
      state.warRoom.connected = false;
      state.warRoom.deliveryError = null;
      return storageSave();
    }
    // A matching URL is not proof that the content bridge survived an
    // extension reload or tab lifecycle change. Verify actual delivery.
    return broadcastWarRoom(false).then(storageSave);
  }).catch(function() {});
});
