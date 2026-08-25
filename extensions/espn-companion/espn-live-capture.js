(function(root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WarRoomEspnLiveCapture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var POSITION_BY_ID = {1:'QB', 2:'RB', 3:'WR', 4:'TE', 5:'K', 16:'DST'};
  var SOURCE_CONFIDENCE = {react:90, websocket:90, eventsource:88, fetch:85, xhr:85, rest:80, dom:60, name:40};
  var BLOCKED_KEYS = /cookie|authorization|espn_s2|swid|credential|token|secret|session/i;

  function normalizePosition(value) {
    if (POSITION_BY_ID[Number(value)]) return POSITION_BY_ID[Number(value)];
    var text = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (text === 'DEF' || text === 'DST' || text === 'D') return 'DST';
    return ['QB','RB','WR','TE','K'].indexOf(text) >= 0 ? text : '';
  }

  function safeNumber(value) {
    var number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function safeId(value) {
    if (value == null) return null;
    var text = String(value).trim();
    return /^[A-Za-z0-9._:-]{1,80}$/.test(text) ? text : null;
  }

  function safeUrl(value) {
    try {
      var parsed = new URL(String(value || ''), 'https://fantasy.espn.com');
      return parsed.hostname + parsed.pathname.slice(0, 240);
    } catch (error) { return ''; }
  }

  function canonicalName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/\s+(jr|sr|ii|iii|iv)$/i, '');
  }

  function topLevelFields(value) {
    if (!value || typeof value !== 'object') return [];
    return Object.keys(value).filter(function(key) { return !BLOCKED_KEYS.test(key); }).sort().slice(0, 30);
  }

  function parsePayload(value) {
    if (value && typeof value === 'object') {
      if (typeof ArrayBuffer !== 'undefined' &&
          (value instanceof ArrayBuffer || ArrayBuffer.isView && ArrayBuffer.isView(value))) return null;
      return value;
    }
    if (typeof value !== 'string' || value.length > 2000000) return null;
    var text = value.trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch (error) {}
    var starts = [text.indexOf('{'), text.indexOf('[')].filter(function(index) { return index >= 0; });
    if (!starts.length) return null;
    var start = Math.min.apply(null, starts);
    var end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (end <= start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); } catch (error) { return null; }
  }

  function normalizeCandidate(raw, options) {
    raw = raw || {};
    options = options || {};
    var player = raw.player || raw.athlete || raw.proPlayer || {};
    var overallPick = safeNumber(raw.overallPickNumber || raw.overallPick || raw.pickNumber || raw.overall);
    var round = safeNumber(raw.roundId || raw.round || raw.roundNumber);
    var roundPick = safeNumber(raw.roundPickNumber || raw.roundPick || raw.pickInRound);
    var teams = safeNumber(options.teams);
    if (!overallPick && round && roundPick && teams) overallPick = (round - 1) * teams + roundPick;
    var playerId = safeId(raw.playerId || raw.athleteId || player.id || player.playerId);
    var playerName = raw.playerName || raw.athleteName || raw.fullName || raw.displayName ||
      player.fullName || player.displayName || player.name;
    playerName = typeof playerName === 'string' ? playerName.trim().slice(0, 100) : '';
    var position = normalizePosition(raw.defaultPositionId || raw.positionId || raw.position ||
      player.defaultPositionId || player.positionId || player.position);
    if (!overallPick || (!playerId && !playerName)) return null;
    return {
      overallPick: overallPick,
      playerId: playerId,
      teamId: safeId(raw.teamId || raw.rosterId || raw.nominatingTeamId),
      playerName: playerName || null,
      position: position || null,
      round: round,
      roundPick: roundPick,
      source: String(options.source || 'network').slice(0, 20),
      sourceDetail: String(options.sourceDetail || '').slice(0, 260),
      observedAt: options.observedAt || new Date().toISOString()
    };
  }

  function extractPickCandidates(payload, options) {
    options = options || {};
    var root = parsePayload(payload);
    if (!root || typeof root !== 'object') return [];
    var queue = [{value:root, depth:0}];
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var results = [];
    var visited = 0;
    var maxObjects = Math.max(50, Math.min(10000, Number(options.maxObjects) || 3000));
    var maxDepth = Math.max(2, Math.min(10, Number(options.maxDepth) || 7));
    var maxCandidates = Math.max(1, Math.min(1000, Number(options.maxCandidates) || 300));

    while (queue.length && visited < maxObjects && results.length < maxCandidates) {
      var item = queue.shift();
      var value = item.value;
      if (!value || typeof value !== 'object') continue;
      if (seen) {
        if (seen.has(value)) continue;
        seen.add(value);
      }
      visited++;
      var candidate = !Array.isArray(value) ? normalizeCandidate(value, options) : null;
      if (candidate) results.push(candidate);
      if (item.depth >= maxDepth) continue;
      Object.keys(value).slice(0, 100).forEach(function(key) {
        if (BLOCKED_KEYS.test(key)) return;
        var child;
        try { child = value[key]; } catch (error) { return; }
        if (child && typeof child === 'object') queue.push({value:child, depth:item.depth + 1});
      });
    }

    var unique = {};
    results.forEach(function(candidate) {
      var key = candidate.overallPick + '|' + (candidate.playerId || canonicalName(candidate.playerName));
      if (!unique[key]) unique[key] = candidate;
    });
    return Object.keys(unique).map(function(key) { return unique[key]; });
  }

  function samePlayer(left, right) {
    if (left.playerId && right.playerId) return String(left.playerId) === String(right.playerId);
    var leftName = canonicalName(left.playerName);
    var rightName = canonicalName(right.playerName);
    return Boolean(leftName && rightName && leftName === rightName &&
      (!left.position || !right.position || left.position === right.position));
  }

  function sourceConfidence(source) {
    return SOURCE_CONFIDENCE[String(source || '').toLowerCase()] || 40;
  }

  function reconcileObservation(existing, incoming) {
    if (!incoming) return {entry:existing || null, conflict:null};
    var now = incoming.observedAt || new Date().toISOString();
    if (!existing) {
      return {entry:Object.assign({}, incoming, {
        confirmedSources:[incoming.source], firstSeenAt:now, lastSeenAt:now, conflicting:false
      }), conflict:null};
    }
    var sources = Array.from(new Set((existing.confirmedSources || [existing.source]).concat(incoming.source).filter(Boolean)));
    if (samePlayer(existing, incoming)) {
      return {entry:Object.assign({}, existing, {
        playerId:existing.playerId || incoming.playerId,
        playerName:existing.playerName || incoming.playerName,
        position:existing.position || incoming.position,
        teamId:existing.teamId || incoming.teamId,
        round:existing.round || incoming.round,
        roundPick:existing.roundPick || incoming.roundPick,
        confirmedSources:sources,
        lastSeenAt:now
      }), conflict:null};
    }
    var incomingWins = sourceConfidence(incoming.source) > sourceConfidence(existing.source);
    var winner = incomingWins ? incoming : existing;
    var conflict = {
      overallPick:Number(incoming.overallPick || existing.overallPick),
      existingPlayerId:existing.playerId || null,
      incomingPlayerId:incoming.playerId || null,
      existingName:existing.playerName || null,
      incomingName:incoming.playerName || null,
      sources:sources,
      observedAt:now
    };
    return {entry:Object.assign({}, winner, {
      confirmedSources:sources, firstSeenAt:existing.firstSeenAt || now,
      lastSeenAt:now, conflicting:true, conflict:conflict
    }), conflict:conflict};
  }

  function sanitizeTelemetry(input) {
    input = input || {};
    return {
      source:String(input.source || '').slice(0, 20),
      sourceDetail:safeUrl(input.sourceDetail || input.url),
      fields:(Array.isArray(input.fields) ? input.fields : topLevelFields(input.payload))
        .filter(function(key) { return !BLOCKED_KEYS.test(String(key)); }).map(String).slice(0, 30),
      candidateCount:Math.max(0, Number(input.candidateCount) || 0),
      observedAt:input.observedAt || new Date().toISOString()
    };
  }

  return {
    normalizePosition:normalizePosition,
    parsePayload:parsePayload,
    normalizeCandidate:normalizeCandidate,
    extractPickCandidates:extractPickCandidates,
    reconcileObservation:reconcileObservation,
    sourceConfidence:sourceConfidence,
    sanitizeTelemetry:sanitizeTelemetry,
    safeUrl:safeUrl,
    topLevelFields:topLevelFields,
    canonicalName:canonicalName
  };
});
