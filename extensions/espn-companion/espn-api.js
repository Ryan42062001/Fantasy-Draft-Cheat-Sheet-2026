(function(root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WarRoomEspnApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var POSITION_BY_ID = {1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST'};

  function normalizePosition(value) {
    if (POSITION_BY_ID[Number(value)]) return POSITION_BY_ID[Number(value)];
    var normalized = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (normalized === 'DEF' || normalized === 'DST' || normalized === 'D') return 'DST';
    return ['QB', 'RB', 'WR', 'TE', 'K'].indexOf(normalized) >= 0 ? normalized : '';
  }

  function parseLeagueContext(url) {
    try {
      var parsed = new URL(String(url || ''));
      var leagueId = parsed.searchParams.get('leagueId');
      var seasonId = parsed.searchParams.get('seasonId') || String(new Date().getFullYear());
      var teamId = parsed.searchParams.get('teamId');
      if (!/^\d+$/.test(String(leagueId || '')) || !/^\d{4}$/.test(String(seasonId || ''))) return null;
      return {
        leagueId: String(leagueId),
        seasonId: String(seasonId),
        teamId: /^\d+$/.test(String(teamId || '')) ? String(teamId) : null
      };
    } catch (error) {
      return null;
    }
  }

  function buildDraftDetailUrl(context) {
    if (!context) return '';
    return 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/' +
      encodeURIComponent(context.seasonId) + '/segments/0/leagues/' +
      encodeURIComponent(context.leagueId) +
      '?view=mDraftDetail&view=mTeam&view=kona_player_info';
  }

  function buildPlayerLookupUrl(context) {
    if (!context) return '';
    return 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/' +
      encodeURIComponent(context.seasonId) +
      '/players?scoringPeriodId=0&view=players_wl';
  }

  function addDirectoryEntry(directory, raw) {
    raw = raw || {};
    var player = raw.player || raw.athlete || raw;
    var id = player.id || player.playerId || raw.playerId || raw.id;
    var name = player.fullName || player.displayName || player.name || raw.playerName;
    var position = normalizePosition(
      player.defaultPositionId || player.positionId || player.position || raw.position
    );
    if (id != null && name && position) {
      directory[String(id)] = {playerName: String(name).trim(), position: position};
    }
  }

  function buildPlayerDirectory(payload, seed) {
    var directory = Object.assign({}, seed || {});
    var collections = [
      Array.isArray(payload) ? payload : null,
      payload && payload.players,
      payload && payload.playerPool,
      payload && payload.athletes
    ];
    collections.forEach(function(collection) {
      (Array.isArray(collection) ? collection : []).forEach(function(entry) {
        addDirectoryEntry(directory, entry);
      });
    });
    return directory;
  }

  function draftPickCollection(payload) {
    if (payload && payload.draftDetail && Array.isArray(payload.draftDetail.picks)) {
      return {present: true, picks: payload.draftDetail.picks};
    }
    if (payload && payload.draft && Array.isArray(payload.draft.picks)) {
      return {present: true, picks: payload.draft.picks};
    }
    if (payload && Array.isArray(payload.picks)) return {present: true, picks: payload.picks};
    return {present: false, picks: []};
  }

  function extractDraftSnapshot(payload, context, seedDirectory) {
    var directory = buildPlayerDirectory(payload || {}, seedDirectory);
    var collection = draftPickCollection(payload || {});
    var rawPicks = collection.picks.filter(function(pick) {
      return Number(pick && (pick.overallPickNumber || pick.overallPick || pick.pickNumber)) > 0;
    });
    var unresolved = [];
    var picks = [];

    rawPicks.forEach(function(rawPick) {
      var playerId = rawPick.playerId || rawPick.athleteId ||
        (rawPick.player && rawPick.player.id);
      var directoryPlayer = playerId == null ? null : directory[String(playerId)];
      var playerName = rawPick.playerName || rawPick.athleteName ||
        (rawPick.player && (rawPick.player.fullName || rawPick.player.displayName)) ||
        (directoryPlayer && directoryPlayer.playerName);
      var position = normalizePosition(
        rawPick.position || rawPick.positionId ||
        (rawPick.player && (rawPick.player.defaultPositionId || rawPick.player.position)) ||
        (directoryPlayer && directoryPlayer.position)
      );
      var overallPick = Number(rawPick.overallPickNumber || rawPick.overallPick || rawPick.pickNumber);
      var teamId = rawPick.teamId == null ? null : String(rawPick.teamId);

      if (!playerName || !position) {
        unresolved.push({overallPick: overallPick, playerId: playerId == null ? null : String(playerId)});
        return;
      }

      picks.push({
        overallPick: overallPick,
        playerName: String(playerName).trim(),
        position: position,
        teamId: teamId,
        isMine: Boolean(context && context.teamId && teamId === String(context.teamId)),
        espnPlayerId: playerId == null ? null : String(playerId),
        method: 'api'
      });
    });

    picks.sort(function(a, b) { return a.overallPick - b.overallPick; });
    return {
      rawCount: rawPicks.length,
      feedPresent: collection.present,
      complete: collection.present && unresolved.length === 0,
      picks: picks,
      unresolved: unresolved,
      directory: directory
    };
  }

  return {
    normalizePosition: normalizePosition,
    parseLeagueContext: parseLeagueContext,
    buildDraftDetailUrl: buildDraftDetailUrl,
    buildPlayerLookupUrl: buildPlayerLookupUrl,
    buildPlayerDirectory: buildPlayerDirectory,
    extractDraftSnapshot: extractDraftSnapshot
  };
});
