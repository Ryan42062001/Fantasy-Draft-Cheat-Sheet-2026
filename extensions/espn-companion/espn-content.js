(function() {
  'use strict';

  if (globalThis.__warRoomEspnContentV1) return;
  globalThis.__warRoomEspnContentV1 = true;

  var parser = globalThis.WarRoomEspnParser;
  var api = globalThis.WarRoomEspnApi;
  if (!parser || !api || !globalThis.chrome || !chrome.runtime) return;

  var scanTimer = null;
  var lastSignature = '';
  var config = {teams: 10, draftSlot: 1};
  var lastApiScanAt = 0;
  var lastApiSignature = '';
  var lastApiAvailable = false;
  var apiScanInFlight = null;
  var topFrame = false;
  try { topFrame = window.top === window; } catch (error) {}

  function send(message) {
    try {
      var response = chrome.runtime.sendMessage(message);
      if (response && typeof response.catch === 'function') response.catch(function() {});
    } catch (error) {}
  }

  function isDraftPage() {
    return /draft/i.test(location.pathname + location.search + document.title) ||
      /on the clock|draft room|draft board/i.test(document.body ? document.body.innerText.slice(0, 5000) : '');
  }

  function scanStructuredDraft(force) {
    if (!topFrame || !isDraftPage()) return Promise.resolve(false);
    var context = api.parseLeagueContext(location.href);
    if (!context) return Promise.resolve(false);
    var now = Date.now();
    if (!force && (apiScanInFlight || now - lastApiScanAt < 1800)) {
      return apiScanInFlight || Promise.resolve(lastApiAvailable);
    }

    lastApiScanAt = now;
    var directory = parser.scanPlayerDirectory ? parser.scanPlayerDirectory(document) : {};
    apiScanInFlight = fetch(api.buildDraftDetailUrl(context), {
      credentials: 'include',
      cache: 'no-store',
      headers: {'Accept': 'application/json'}
    }).then(function(response) {
      if (!response.ok) throw new Error('ESPN draft feed returned ' + response.status);
      return response.json();
    }).then(function(payload) {
      var initial = api.extractDraftSnapshot(payload, context, directory);
      if (initial.complete || !initial.unresolved.length) {
        return {payload: payload, snapshot: initial};
      }
      var unresolvedIds = initial.unresolved.map(function(item) { return item.playerId; }).filter(Boolean);
      if (!unresolvedIds.length) return {payload: payload, snapshot: initial};
      return fetch(api.buildPlayerLookupUrl(context), {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'X-Fantasy-Filter': JSON.stringify({filterIds: {value: unresolvedIds}})
        }
      }).then(function(response) {
        if (!response.ok) throw new Error('ESPN player lookup returned ' + response.status);
        return response.json();
      }).then(function(players) {
        var expandedDirectory = api.buildPlayerDirectory(players, initial.directory);
        return {payload: payload, snapshot: api.extractDraftSnapshot(payload, context, expandedDirectory)};
      }).catch(function() {
        return {payload: payload, snapshot: initial};
      });
    }).then(function(resolved) {
      var snapshot = resolved.snapshot;
      var signature = JSON.stringify(snapshot.picks);
      if (snapshot.complete && (force || signature !== lastApiSignature)) {
        lastApiSignature = signature;
        send({
          type: 'ESPN_STRUCTURED_PICKS',
          picks: snapshot.picks,
          rawCount: snapshot.rawCount,
          url: location.href
        });
      }
      send({
        type: 'ESPN_API_STATUS',
        available: snapshot.complete,
        rawCount: snapshot.rawCount,
        resolved: snapshot.picks.length,
        unresolved: snapshot.unresolved.length,
        url: location.href
      });
      lastApiAvailable = snapshot.complete;
      return snapshot.complete;
    }).catch(function(error) {
      send({
        type: 'ESPN_API_STATUS',
        available: false,
        error: error && error.message ? error.message : String(error),
        url: location.href
      });
      lastApiAvailable = false;
      return false;
    }).finally(function() {
      apiScanInFlight = null;
    });
    return apiScanInFlight;
  }

  function scanVisibleDraft(force) {
    var scanResult = parser.scanDocumentDetailed
      ? parser.scanDocumentDetailed(document, config)
      : {picks: parser.scanDocument(document, config), candidateCount: 0};
    var picks = scanResult.picks;
    var signature = JSON.stringify(picks);
    if (force || signature !== lastSignature) {
      lastSignature = signature;
      send({type: 'ESPN_PICKS_FOUND', picks: picks, url: location.href});
    }
    send({
      type: 'ESPN_HEARTBEAT',
      draftPage: true,
      captured: picks.length,
      candidates: scanResult.candidateCount,
      topFrame: topFrame,
      url: location.href
    });
  }

  function scan(force) {
    scanTimer = null;
    if (!isDraftPage()) {
      send({type: 'ESPN_HEARTBEAT', draftPage: false, topFrame: topFrame, url: location.href});
      return;
    }

    scanStructuredDraft(force).then(function(directAvailable) {
      if (directAvailable) {
        send({
          type: 'ESPN_HEARTBEAT',
          draftPage: true,
          topFrame: topFrame,
          apiAvailable: true,
          url: location.href
        });
        return;
      }
      scanVisibleDraft(force);
    });
  }

  function scheduleScan(force) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(function() { scan(force); }, 350);
  }

  chrome.runtime.onMessage.addListener(function(message) {
    if (!message) return;
    if (message.type === 'COMPANION_CONFIG') {
      config = Object.assign({}, config, message.config || {});
      scheduleScan(true);
    }
    if (message.type === 'RESCAN_ESPN') scheduleScan(true);
  });

  send({type: 'ESPN_CONTENT_READY', url: location.href});

  var observer = new MutationObserver(function(mutations) {
    var relevant = mutations.some(function(mutation) {
      return mutation.addedNodes && mutation.addedNodes.length;
    });
    if (relevant) scheduleScan(false);
  });

  observer.observe(document.documentElement, {childList: true, subtree: true});
  scheduleScan(true);
  setInterval(function() { scan(false); }, 10000);
})();
