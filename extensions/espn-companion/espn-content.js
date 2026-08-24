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
  var pageRequestSequence = 0;
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

  function requestPageJson(url, headers) {
    return new Promise(function(resolve, reject) {
      var requestId = 'war-room-' + Date.now().toString(36) + '-' + (++pageRequestSequence).toString(36);
      var timeout = setTimeout(function() {
        window.removeEventListener('message', onResponse);
        reject(new Error('ESPN page connection timed out'));
      }, 4500);

      function onResponse(event) {
        var message = event && event.data;
        if (event.source !== window || !message ||
            message.channel !== 'WAR_ROOM_ESPN_PAGE_RESPONSE' || message.requestId !== requestId) return;
        clearTimeout(timeout);
        window.removeEventListener('message', onResponse);
        if (!message.ok) {
          var error = new Error(message.error || 'ESPN page connection failed');
          error.httpStatus = Number(message.status) || 0;
          reject(error);
          return;
        }
        resolve({
          payload: message.payload,
          httpStatus: Number(message.status) || 200,
          role: message.role || null,
          transport: 'page'
        });
      }

      window.addEventListener('message', onResponse);
      window.postMessage({
        channel: 'WAR_ROOM_ESPN_PAGE_REQUEST',
        requestId: requestId,
        url: url,
        headers: headers || {}
      }, '*');
    });
  }

  function requestStructuredJson(url, headers) {
    return requestPageJson(url, headers).catch(function(pageError) {
      return fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        headers: Object.assign({'Accept': 'application/json'}, headers || {})
      }).then(function(response) {
        if (!response.ok) {
          var error = new Error('ESPN draft feed returned HTTP ' + response.status);
          error.httpStatus = response.status;
          throw error;
        }
        return response.json().then(function(payload) {
          return {
            payload: payload,
            httpStatus: response.status,
            role: response.headers.get('X-Fantasy-Role') || null,
            transport: 'content',
            pageError: pageError && pageError.message ? pageError.message : String(pageError)
          };
        });
      }).catch(function(contentError) {
        throw new Error(
          'Authenticated page connection: ' +
          (pageError && pageError.message ? pageError.message : String(pageError)) +
          '; extension fallback: ' +
          (contentError && contentError.message ? contentError.message : String(contentError))
        );
      });
    });
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
    var draftShape = parser.detectDraftShape ? parser.detectDraftShape(document, config) : {};
    var draftOptions = {draftComplete: Boolean(draftShape.draftComplete)};
    apiScanInFlight = requestStructuredJson(api.buildDraftDetailUrl(context)).then(function(response) {
      var telemetry = {
        httpStatus: response.httpStatus,
        role: response.role,
        transport: response.transport,
        pageError: response.pageError || null
      };
      return {payload: response.payload, telemetry: telemetry};
    }).then(function(result) {
      var payload = result.payload;
      var initial = api.extractDraftSnapshot(payload, context, directory, draftOptions);
      if (initial.complete || !initial.unresolved.length) {
        return {payload: payload, snapshot: initial, telemetry: result.telemetry};
      }
      var unresolvedIds = initial.unresolved.map(function(item) { return item.playerId; }).filter(Boolean);
      if (!unresolvedIds.length) {
        return {payload: payload, snapshot: initial, telemetry: result.telemetry};
      }
      return requestStructuredJson(api.buildPlayerLookupUrl(context), {
        'X-Fantasy-Filter': JSON.stringify({filterIds: {value: unresolvedIds}})
      }).then(function(lookup) {
        var expandedDirectory = api.buildPlayerDirectory(lookup.payload, initial.directory);
        if (lookup.transport === 'content') result.telemetry.transport = 'content';
        return {
          payload: payload,
          snapshot: api.extractDraftSnapshot(payload, context, expandedDirectory, draftOptions),
          telemetry: result.telemetry
        };
      }).catch(function(error) {
        return {
          payload: payload,
          snapshot: initial,
          telemetry: result.telemetry,
          lookupError: error && error.message ? error.message : String(error)
        };
      });
    }).then(function(resolved) {
      var snapshot = resolved.snapshot;
      var shape = parser.detectDraftShape ? parser.detectDraftShape(document, config) : {};
      var feedAssessment = api.assessStructuredFeed(
        snapshot,
        shape.currentPick,
        Number(config.teams) * Number(config.rounds),
        shape.draftComplete
      );
      var expectedCompleted = feedAssessment.expectedCompleted;
      var structuredBehind = feedAssessment.behind;
      var effectiveComplete = feedAssessment.effectiveComplete;
      var signature = JSON.stringify({
        picks: snapshot.picks,
        unresolved: snapshot.unresolved,
        rawPickNumbers: snapshot.rawPickNumbers,
        expectedCompleted: expectedCompleted
      });
      if (snapshot.feedPresent && !structuredBehind && (force || signature !== lastApiSignature)) {
        lastApiSignature = signature;
        send({
          type: 'ESPN_STRUCTURED_PICKS',
          picks: snapshot.picks,
          rawCount: snapshot.rawCount,
          scheduledCount: snapshot.scheduledCount,
          openSlotCount: snapshot.openSlotCount,
          rawPickNumbers: snapshot.rawPickNumbers,
          unresolved: snapshot.unresolved,
          pickFields: snapshot.pickFields,
          complete: effectiveComplete,
          url: location.href
        });
      }
      send({
        type: 'ESPN_API_STATUS',
        available: snapshot.feedPresent,
        complete: effectiveComplete,
        behind: structuredBehind,
        expectedCompleted: expectedCompleted,
        httpStatus: resolved.telemetry.httpStatus,
        role: resolved.telemetry.role,
        transport: resolved.telemetry.transport,
        rawCount: snapshot.rawCount,
        scheduledCount: snapshot.scheduledCount,
        openSlotCount: snapshot.openSlotCount,
        resolved: snapshot.picks.length,
        unresolved: snapshot.unresolved.length,
        pickFields: snapshot.pickFields,
        error: !snapshot.feedPresent
          ? 'ESPN response did not contain draftDetail.picks'
          : structuredBehind
            ? 'Structured feed is behind (' + snapshot.rawCount + ' of ' + expectedCompleted +
              ' completed picks); using visible Pick History.'
            : resolved.lookupError || null,
        url: location.href
      });
      // A partial structured feed remains useful, but the visible table must
      // still run so it can supply names for only the unresolved pick slots.
      lastApiAvailable = effectiveComplete;
      return effectiveComplete;
    }).catch(function(error) {
      send({
        type: 'ESPN_API_STATUS',
        available: false,
        transport: 'none',
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
      : {picks: parser.scanDocument(document, config), candidateCount: 0, rejectedCount: 0, scannedNodeCount: 0};
    var picks = scanResult.picks;
    var unavailablePlayers = parser.scanDraftedPlayerLabels
      ? parser.scanDraftedPlayerLabels(document)
      : [];
    var shape = parser.detectDraftShape ? parser.detectDraftShape(document, config) : {};
    var signature = JSON.stringify({picks: picks, unavailablePlayers: unavailablePlayers});
    if (force || signature !== lastSignature) {
      lastSignature = signature;
      send({
        type: 'ESPN_PICKS_FOUND',
        picks: picks,
        unavailablePlayers: unavailablePlayers,
        pickCount: picks.length,
        candidates: scanResult.candidateCount,
        rejected: scanResult.rejectedCount,
        scannedNodes: scanResult.scannedNodeCount,
        currentPick: shape.currentPick,
        topFrame: topFrame,
        url: location.href
      });
    }
    send({
      type: 'ESPN_HEARTBEAT',
      draftPage: true,
      captured: picks.length,
      candidates: scanResult.candidateCount,
      rejected: scanResult.rejectedCount,
      detectedTeams: shape.teams,
      detectedRounds: shape.rounds,
      currentPick: shape.currentPick,
      draftComplete: shape.draftComplete,
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
        var shape = parser.detectDraftShape ? parser.detectDraftShape(document, config) : {};
        send({
          type: 'ESPN_HEARTBEAT',
          draftPage: true,
          topFrame: topFrame,
          apiAvailable: true,
          detectedTeams: shape.teams,
          detectedRounds: shape.rounds,
          currentPick: shape.currentPick,
          draftComplete: shape.draftComplete,
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
      return mutation.type === 'characterData' ||
        (mutation.addedNodes && mutation.addedNodes.length);
    });
    if (relevant) scheduleScan(false);
  });

  observer.observe(document.documentElement, {childList: true, characterData: true, subtree: true});
  scheduleScan(true);
  setInterval(function() { scan(false); }, 3000);
})();
