'use strict';

var STORAGE_KEY = 'warRoomEspnCompanionStateV1';
var WAR_ROOM_URLS = [
  'http://127.0.0.1/*',
  'http://localhost/*',
  'https://ryan42062001.github.io/Fantasy-Draft-Cheat-Sheet-2026/*'
];
var ESPN_URLS = [
  'https://fantasy.espn.com/*',
  'https://www.espn.com/fantasy/*'
];

var state = {
  config: {teams: 10, draftSlot: 1, rounds: 16},
  picksByNumber: {},
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
      state.picksByNumber = Object.assign({}, stored.picksByNumber || {});
      state.ledgerTeams = Number(stored.ledgerTeams) || null;
      state.espn = Object.assign({}, state.espn, stored.espn || {});
      state.warRoom = Object.assign({}, state.warRoom, stored.warRoom || {});

      // Pick numbers parsed from R#/P# notation depend on league size. Older
      // ledgers did not record which team count produced them, so discard them
      // once rather than risk replaying incorrectly numbered selections.
      if (state.ledgerTeams !== Number(state.config.teams)) {
        state.picksByNumber = {};
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

function queryTabs(urls) {
  return chrome.tabs.query({url: urls}).catch(function() { return []; });
}

function sendTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function sendTabQuiet(tabId, message) {
  return sendTab(tabId, message).catch(function() {});
}

function injectEspnReader(tab) {
  if (!tab || !tab.id) return Promise.resolve();
  return chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true},
    files: ['espn-parser.js', 'espn-content.js']
  }).then(function() {
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

function broadcastWarRoom(force, applyConfig) {
  var picks = getPicks();
  return queryTabs(WAR_ROOM_URLS).then(function(tabs) {
    state.warRoom.connected = tabs.length > 0;
    return Promise.all(tabs.map(function(tab) {
      return sendTabQuiet(tab.id, {
        type: 'WAR_ROOM_SNAPSHOT',
        snapshot: {
          version: 1,
          picks: picks,
          force: Boolean(force),
          config: applyConfig ? Object.assign({}, state.config) : null
        }
      });
    }));
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
  (Array.isArray(picks) ? picks : []).forEach(function(pick) {
    var overallPick = Number(pick && pick.overallPick);
    var playerName = String(pick && pick.playerName || '').trim();
    if (!Number.isInteger(overallPick) || overallPick < 1 || overallPick > 400 || !playerName) return;
    state.picksByNumber[String(overallPick)] = {
      overallPick: overallPick,
      playerName: playerName.slice(0, 100),
      position: String(pick.position || '').slice(0, 4),
      espnPlayerId: pick.espnPlayerId == null ? null : String(pick.espnPlayerId).slice(0, 40)
    };
  });
  state.ledgerTeams = Number(state.config.teams);
  state.espn.captured = getPicks().length;
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
    state.ledgerTeams = next.teams;
    state.espn.captured = 0;
    state.espn.visibleCaptured = 0;
  }

  return {teamsChanged: teamsChanged};
}

function syncConfigAndReconcile(config, sendResponse) {
  var change = updateConfig(config);
  return storageSave()
    .then(sendConfigToEspn)
    .then(function() { return broadcastWarRoom(true, true); })
    .then(function() {
      return change.teamsChanged ? ensureReadersInOpenEspnTabs(true) : null;
    })
    .then(function() {
      if (typeof sendResponse === 'function') sendResponse(statusSnapshot());
    });
}

function statusSnapshot() {
  return {
    config: state.config,
    picks: getPicks(),
    espn: state.espn,
    warRoom: state.warRoom
  };
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  ready.then(function() {
    if (!message || !message.type) return null;

    if (message.type === 'ESPN_CONTENT_READY') {
      state.espn.connected = true;
      state.espn.lastSeenAt = new Date().toISOString();
      state.espn.lastUrl = message.url || state.espn.lastUrl || null;
      if (sender.tab) sendTabQuiet(sender.tab.id, {type: 'COMPANION_CONFIG', config: state.config});
      return storageSave();
    }

    if (message.type === 'ESPN_HEARTBEAT') {
      state.espn.connected = true;
      if (message.draftPage || message.topFrame) {
        state.espn.draftPage = Boolean(message.draftPage);
      }
      state.espn.lastSeenAt = new Date().toISOString();
      state.espn.lastUrl = message.url || state.espn.lastUrl || null;
      if (Number.isFinite(Number(message.captured))) {
        state.espn.visibleCaptured = Number(message.captured);
      }
      if (Number.isFinite(Number(message.candidates))) {
        state.espn.visibleCandidates = Number(message.candidates);
      }
      return storageSave();
    }

    if (message.type === 'ESPN_PICKS_FOUND') {
      mergePicks(message.picks);
      state.espn.connected = true;
      state.espn.draftPage = true;
      state.espn.lastSeenAt = new Date().toISOString();
      return storageSave().then(function() { return broadcastWarRoom(false); });
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
            : 'ESPN companion connected'
        });
        sendTabQuiet(sender.tab.id, {
          type: 'WAR_ROOM_SNAPSHOT',
          snapshot: {version: 1, picks: getPicks()}
        });
      }
      return storageSave();
    }

    if (message.type === 'WAR_ROOM_ACK') {
      var result = message.result || {};
      state.warRoom.connected = true;
      state.warRoom.applied = Number(result.applied) || 0;
      state.warRoom.unmatched = Array.isArray(result.unmatched) ? result.unmatched.length : 0;
      state.warRoom.lastSeenAt = new Date().toISOString();
      if (message.settings) {
        var settingsChange = updateConfig(message.settings);
        if (settingsChange.teamsChanged) {
          return storageSave()
            .then(sendConfigToEspn)
            .then(function() { return broadcastWarRoom(true, true); })
            .then(function() { return ensureReadersInOpenEspnTabs(true); });
        }
      }
      return storageSave().then(sendConfigToEspn);
    }

    if (message.type === 'GET_STATUS') {
      sendResponse(statusSnapshot());
      return null;
    }

    if (message.type === 'UPDATE_CONFIG') {
      return syncConfigAndReconcile(message.config, sendResponse);
    }

    if (message.type === 'RESCAN') {
      return ensureReadersInOpenEspnTabs(true)
        .then(function() { sendResponse(statusSnapshot()); });
    }

    if (message.type === 'RESET_PICKS') {
      state.picksByNumber = {};
      state.ledgerTeams = Number(state.config.teams);
      state.espn.captured = 0;
      return storageSave()
        .then(function() { return broadcastWarRoom(true); })
        .then(function() { sendResponse(statusSnapshot()); });
    }

    return null;
  }).catch(function(error) {
    sendResponse({error: error && error.message ? error.message : String(error)});
  });

  return true;
});

chrome.runtime.onInstalled.addListener(function() {
  ready.then(function() { return ensureReadersInOpenEspnTabs(true); }).catch(function() {});
});

chrome.runtime.onStartup.addListener(function() {
  ready.then(function() { return ensureReadersInOpenEspnTabs(true); }).catch(function() {});
});

chrome.tabs.onRemoved.addListener(function() {
  ready.then(function() {
    return Promise.all([queryTabs(ESPN_URLS), queryTabs(WAR_ROOM_URLS)]);
  }).then(function(results) {
    state.espn.connected = results[0].length > 0;
    state.warRoom.connected = results[1].length > 0;
    return storageSave();
  }).catch(function() {});
});
