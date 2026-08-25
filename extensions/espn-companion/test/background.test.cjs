const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBackground(storedState, overrides = {}) {
  const listeners = {message: [], installed: [], startup: [], removed: []};
  const chrome = {
    storage: {
      local: {
        get: async key => ({[key]: storedState}),
        set: async () => {}
      }
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {}
    },
    runtime: {
      getManifest: () => ({version: '0.9.11'}),
      onMessage: {addListener: listener => listeners.message.push(listener)},
      onInstalled: {addListener: listener => listeners.installed.push(listener)},
      onStartup: {addListener: listener => listeners.startup.push(listener)}
    },
    tabs: {
      query: async () => [],
      sendMessage: async () => {},
      onRemoved: {addListener: listener => listeners.removed.push(listener)}
    },
    scripting: {executeScript: async () => {}}
  };
  const context = vm.createContext({
    chrome, console, Date, Promise, Object, Number, String, Boolean, Math, URL,
    fetch: overrides.fetch,
    setTimeout, clearTimeout, AbortController
  });
  const captureSource = fs.readFileSync(path.resolve(__dirname, '..', 'espn-live-capture.js'), 'utf8');
  vm.runInContext(captureSource, context);
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'background.js'), 'utf8');
  vm.runInContext(source, context);
  context.listeners = listeners;
  return context;
}

test('extracts the documented 2025 draft-accuracy Top 20 from the 2026 expert response', async () => {
  const context = loadBackground(null);
  await context.ready;
  const experts = Array.from({length: 23}, (_, index) => ({
    expert_id: String(9000 + index),
    name: `Expert ${index + 1}`,
    accuracy_draft: {ALL: index + 1}
  })).reverse();
  const selected = context.extractFantasyProsTop20Experts({accuracy_draft_season: 2025, experts});
  assert.equal(selected.length, 20);
  assert.equal(selected[0].rank, 1);
  assert.equal(selected[19].rank, 20);
});

test('accepts the currently active subset of the historical Top-20 preset', async () => {
  const context = loadBackground(null);
  await context.ready;
  const ranks = [2, 3, 5, 6, 8, 11, 14, 17, 20, 24];
  const experts = ranks.map((rank, index) => ({expert_id: String(7000 + index), accuracy_draft: {ALL: rank}}));
  const selected = context.extractFantasyProsTop20Experts({accuracy_draft_season: 2025, experts});
  assert.deepEqual(Array.from(selected, expert => expert.rank), ranks.slice(0, 9));
});

test('recovers active Top-20 membership by official expert name when accuracy fields are omitted', async () => {
  const context = loadBackground(null);
  await context.ready;
  const experts = [
    {expert_id: '2743', name: 'Seth Miller'},
    {expert_id: '5626', name: 'Michael Bobal - The 33rd Team'},
    {expert_id: '3585', name: 'Ryan Weisse'},
    {expert_id: '4160', name: 'Kyle Senra'}
  ];
  const selected = context.extractFantasyProsTop20Experts({accuracy_draft_season: 2025, experts});
  assert.deepEqual(Array.from(selected, expert => [expert.id, expert.rank]), [
    ['2743', 1], ['5626', 3], ['3585', 7]
  ]);
});

test('preserves expert IDs supplied as object keys in the live directory shape', async () => {
  const context = loadBackground(null);
  await context.ready;
  const experts = {
    2743: {name: 'Seth Miller'},
    5626: {expert_display_name: 'Michael Bobal - The 33rd Team'},
    3585: 'Ryan Weisse',
    4160: {name: 'Kyle Senra'}
  };
  const selected = context.extractFantasyProsTop20Experts({accuracy_draft_season: 2025, experts});
  assert.deepEqual(Array.from(selected, expert => [expert.id, expert.rank]), [
    ['2743', 1], ['5626', 3], ['3585', 7]
  ]);
});

test('records credential-safe expert-directory parsing diagnostics', async () => {
  const context = loadBackground(null);
  await context.ready;
  const diagnostics = context.newFantasyProsDiagnostics();
  const payload = {
    accuracy_draft_season: 2025,
    experts: {
      2743: {name: 'Seth Miller'},
      5626: {expert_display_name: 'Michael Bobal - The 33rd Team'},
      4160: {name: 'Kyle Senra'}
    }
  };
  const selected = context.extractFantasyProsTop20Experts(payload, diagnostics.expertDirectory);
  assert.equal(selected.length, 2);
  assert.equal(diagnostics.expertDirectory.directoryCount, 3);
  assert.equal(diagnostics.expertDirectory.nameMatches, 2);
  assert.equal(diagnostics.expertDirectory.selectedCount, 2);
  assert.deepEqual(Array.from(diagnostics.expertDirectory.selectedExperts, expert => expert.id), ['2743', '5626']);
  assert.doesNotMatch(JSON.stringify(diagnostics), /x-api-key|authorization|cookie/i);
});

test('uses the verified preset IDs only for an explicitly limited empty expert directory', async () => {
  const context = loadBackground(null);
  await context.ready;
  const diagnostics = context.newFantasyProsDiagnostics();
  const selected = context.fantasyProsLimitedTierFallbackExperts({
    accuracy_draft_season: 2025,
    public_api_limited: true,
    experts: {},
    count: 0
  }, diagnostics.expertDirectory);
  assert.equal(selected.length, 9);
  assert.deepEqual(Array.from(selected, expert => expert.id), ['3585','2598','4179','2743','690','1080','381','4404','4224']);
  assert.equal(diagnostics.expertDirectory.limitedTier, true);
  assert.equal(diagnostics.expertDirectory.fallbackUsed, true);
  assert.match(diagnostics.expertDirectory.fallbackReason, /public_api_limited=true/);
});

test('does not use the limited-tier fallback for an ordinary empty directory', async () => {
  const context = loadBackground(null);
  await context.ready;
  const diagnostics = context.newFantasyProsDiagnostics();
  assert.equal(context.fantasyProsLimitedTierFallbackExperts({
    accuracy_draft_season: 2025,
    public_api_limited: false,
    experts: {}
  }, diagnostics.expertDirectory), null);
  assert.equal(diagnostics.expertDirectory.fallbackUsed, false);
});

test('failed refresh diagnostics identify the stage and actionable next step', async () => {
  const context = loadBackground(null);
  await context.ready;
  const diagnostics = context.newFantasyProsDiagnostics();
  diagnostics.stage = 'consensus-validation';
  diagnostics.requestsUsed = 2;
  context.finishFantasyProsDiagnostics(diagnostics, new Error('No active experts returned'));
  assert.equal(diagnostics.status, 'error');
  assert.equal(diagnostics.result.updated, false);
  assert.match(diagnostics.result.nextStep, /selected expert and player counts/i);
  assert.equal(context.statusSnapshot().fantasyPros.attemptId, diagnostics.attemptId);
});

test('request telemetry records safe HTTP metadata without exposing the API key', async () => {
  const secret = 'fp_test_super_secret_key_123456';
  const context = loadBackground(null, {
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({last_updated:'2026-08-24', players:[]})
    })
  });
  await context.ready;
  const telemetry = {};
  const payload = await context.fantasyProsFetchJson(
    'nfl/2026/consensus-rankings', secret, {position:'ALL', scoring:'PPR'}, telemetry
  );
  assert.equal(payload.last_updated, '2026-08-24');
  assert.equal(telemetry.endpoint, '/public/v2/json/nfl/2026/consensus-rankings');
  assert.equal(telemetry.httpStatus, 200);
  assert.equal(telemetry.responseShape, 'object');
  assert.deepEqual(Array.from(telemetry.topLevelKeys), ['last_updated', 'players']);
  assert.doesNotMatch(JSON.stringify(telemetry), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(telemetry), /x-api-key/i);
});

test('diagnostic errors redact credential-like values', async () => {
  const context = loadBackground(null);
  await context.ready;
  const safe = context.fantasyProsSafeError(new Error('api_key=secret-value token:another-secret HTTP 401'));
  assert.doesNotMatch(safe, /secret-value|another-secret/);
  assert.match(safe, /\[redacted\]/);
});

test('rejects an expert response from the wrong draft-accuracy season', async () => {
  const context = loadBackground(null);
  await context.ready;
  assert.throws(
    () => context.extractFantasyProsTop20Experts({accuracy_draft_season: 2024, experts: []}),
    /expected 2025/
  );
});

test('counts only requested experts included in a consensus response', async () => {
  const context = loadBackground(null);
  await context.ready;
  const requested = [{id: '11'}, {id: '22'}, {id: '33'}];
  assert.equal(context.fantasyProsActiveExpertCount({experts_available: {included: [11, 33, 99]}}, requested), 2);
});

test('discards a legacy pick ledger whose league-size provenance is unknown', async () => {
  const context = loadBackground({
    config: {teams: 12, draftSlot: 11, rounds: 16},
    picksByNumber: {'10': {overallPick: 10, playerName: 'Justin Jefferson', position: 'WR'}},
    espn: {captured: 1}
  });
  await context.ready;
  assert.equal(context.getPicks().length, 0);
  assert.equal(context.state.ledgerTeams, 12);
});

test('changing team count clears picks parsed with the prior draft math', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.config = {teams: 10, draftSlot: 10, rounds: 16};
  context.state.ledgerTeams = 10;
  context.state.picksByNumber = {'10': {overallPick: 10, playerName: 'Justin Jefferson', position: 'WR'}};
  const change = context.updateConfig({teams: 12, draftSlot: 11, rounds: 16});
  assert.equal(change.teamsChanged, true);
  assert.equal(context.getPicks().length, 0);
  assert.equal(context.state.ledgerTeams, 12);
});

test('changing only the user slot preserves correctly numbered captured picks', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.config = {teams: 12, draftSlot: 10, rounds: 16};
  context.state.ledgerTeams = 12;
  context.state.picksByNumber = {'11': {overallPick: 11, playerName: 'CeeDee Lamb', position: 'WR'}};
  const change = context.updateConfig({teams: 12, draftSlot: 11, rounds: 16});
  assert.equal(change.teamsChanged, false);
  assert.equal(context.getPicks().length, 1);
  assert.equal(context.state.config.draftSlot, 11);
});

test('opening a different ESPN draft clears the previous mock ledger', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.draftKey = '2026:111';
  context.state.picksByNumber = {'1': {overallPick: 1, playerName: 'Ja\'Marr Chase', position: 'WR'}};
  context.state.espn.draftComplete = true;
  context.state.espn.currentPick = 161;
  context.state.espn.expectedCompleted = 160;
  assert.equal(
    context.activateDraft('https://fantasy.espn.com/football/draft?leagueId=222&seasonId=2026&teamId=14'),
    true
  );
  assert.equal(context.state.draftKey, '2026:222');
  assert.equal(context.getPicks().length, 0);
  assert.equal(context.state.espn.draftComplete, false);
  assert.equal(context.state.espn.currentPick, null);
  assert.equal(context.state.espn.expectedCompleted, 0);
});

test('public mock pages receive a stable draft key without a league id', async () => {
  const context = loadBackground(null);
  await context.ready;
  const url = 'https://fantasy.espn.com/football/mockdraft?draftId=public-room-42&seasonId=2026';
  const first = context.draftKeyFromUrl(url);
  const second = context.draftKeyFromUrl(url);
  assert.match(first, /^page:2026:/);
  assert.equal(first, second);
});

test('live observations reconcile through the background ledger and expose conflicts', async () => {
  const context = loadBackground(null);
  await context.ready;
  const listener = context.listeners.message[0];
  const url = 'https://fantasy.espn.com/football/mockdraft?draftId=fixture&seasonId=2026';
  listener({type:'ESPN_LIVE_OBSERVATIONS', source:'websocket', url, observations:[{
    overallPick:1, playerId:'10', espnPlayerId:'10', playerName:'Player One', position:'WR', source:'websocket'
  }], telemetry:{source:'websocket',sourceDetail:'fantasy.espn.com/ws',candidateCount:1}, counters:{sockets:1}}, {}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  listener({type:'ESPN_LIVE_OBSERVATIONS', source:'dom', url, observations:[{
    overallPick:1, playerId:'20', espnPlayerId:'20', playerName:'Wrong Player', position:'RB', source:'dom'
  }], telemetry:{source:'dom',candidateCount:1}}, {}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.getPicks().length, 1);
  assert.equal(context.getPicks()[0].espnPlayerId, '10');
  assert.equal(context.state.espn.liveCapture.conflicts, 1);
  assert.equal(context.state.conflictsByPick['1'].incomingPlayerId, '20');
});

test('an embedded ESPN frame cannot clear a completed-draft heartbeat', async () => {
  const context = loadBackground(null);
  await context.ready;
  const listener = context.listeners.message[0];

  listener({type: 'ESPN_HEARTBEAT', topFrame: true, draftPage: true, draftComplete: true}, {}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.state.espn.draftComplete, true);

  listener({type: 'ESPN_HEARTBEAT', topFrame: false, draftPage: true, draftComplete: false}, {}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.state.espn.draftComplete, true);
});

test('terminal heartbeat reconciles expected progress to the configured final pick', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.config = {teams: 12, draftSlot: 5, rounds: 16};
  context.listeners.message[0]({
    type: 'ESPN_HEARTBEAT', topFrame: true, draftPage: true,
    draftComplete: true, currentPick: 192
  }, {}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.state.espn.currentPick, 192);
  assert.equal(context.state.espn.expectedCompleted, 192);
});

test('screen reconciliation rejects a false pick beyond the configured draft total', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.config = {teams: 12, draftSlot: 5, rounds: 16};
  context.mergePicks([
    {overallPick: 192, playerName: 'Final Valid Player', position: 'DST', method: 'dom'},
    {overallPick: 193, playerName: 'False Terminal Candidate', position: 'WR', method: 'dom'}
  ]);
  assert.equal(context.getPicks().length, 1);
  assert.equal(context.getPicks()[0].overallPick, 192);
});

test('post-draft 404 retains the last successful structured API evidence', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.espn.draftComplete = true;
  context.state.espn.apiAvailable = true;
  context.state.espn.apiComplete = true;
  context.state.espn.apiHttpStatus = 200;
  context.state.espn.apiResolved = 192;
  context.state.espn.apiRawCount = 192;
  context.state.espn.lastSuccessfulApiAt = '2026-08-24T03:20:00.000Z';
  context.state.espn.lastSuccessfulApiResolved = 192;
  context.state.espn.lastSuccessfulApiRawCount = 192;
  context.state.espn.lastSuccessfulApiHttpStatus = 200;

  context.listeners.message[0]({
    type: 'ESPN_API_STATUS', available: false, complete: false,
    httpStatus: 404, error: 'ESPN draft feed returned HTTP 404'
  }, {}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(context.state.espn.apiAvailable, true);
  assert.equal(context.state.espn.apiComplete, true);
  assert.equal(context.state.espn.apiResolved, 192);
  assert.equal(context.state.espn.apiPostDraftUnavailable, true);
  assert.match(context.state.espn.apiError, /retained the last successful structured snapshot/);
  assert.equal(context.state.espn.lastApiAttemptHttpStatus, 404);
});

test('smaller frame heartbeats cannot lower shared pick progress', async () => {
  const context = loadBackground(null);
  await context.ready;
  const listener = context.listeners.message[0];
  listener({type: 'ESPN_HEARTBEAT', topFrame: true, draftPage: true, currentPick: 142, captured: 132, candidates: 150}, {frameId: 0}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  listener({type: 'ESPN_HEARTBEAT', topFrame: false, draftPage: true, currentPick: 66, captured: 65, candidates: 70}, {frameId: 3}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.state.espn.currentPick, 142);
  assert.equal(context.state.espn.expectedCompleted, 141);
  assert.equal(context.state.espn.visibleCaptured, 132);
  assert.equal(context.state.espn.visibleCandidates, 150);
  assert.equal(context.state.espn.screenFrames['0'].picks, 132);
  assert.equal(context.state.espn.screenFrames['3'].picks, 65);
});

test('clearing captured picks also clears completion progress', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.espn.draftComplete = true;
  context.state.espn.currentPick = 161;
  context.state.espn.expectedCompleted = 160;

  context.listeners.message[0]({type: 'RESET_PICKS'}, {}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(context.state.espn.draftComplete, false);
  assert.equal(context.state.espn.currentPick, null);
  assert.equal(context.state.espn.expectedCompleted, 0);
});

test('partial structured data preserves screen names only for unresolved pick slots', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.picksByNumber = {
    '1': {overallPick: 1, playerName: 'Wrong Screen Name', position: 'WR', method: 'dom'},
    '2': {overallPick: 2, playerName: 'Screen Resolved Name', position: 'RB', method: 'dom'},
    '3': {overallPick: 3, playerName: 'Stale Pick', position: 'WR', method: 'dom'}
  };
  context.reconcileStructuredPicks(
    [{overallPick: 1, playerName: 'Direct Name', position: 'WR', teamId: '7', isMine: false, method: 'api'}],
    [1, 2],
    [{overallPick: 2, playerId: '99', teamId: '14', isMine: true}],
    false
  );
  const picks = context.getPicks();
  assert.equal(context.state.espn.method, 'hybrid');
  assert.deepEqual(context.state.espn.unresolvedPickNumbers, [2]);
  assert.equal(context.state.espn.unresolvedPickMetadata['2'].teamId, '14');
  assert.equal(context.state.espn.unresolvedPickMetadata['2'].isMine, true);
  assert.equal(picks.length, 2);
  assert.equal(picks[0].playerName, 'Direct Name');
  assert.equal(picks[0].method, 'api');
  assert.equal(picks[1].playerName, 'Screen Resolved Name');
});

test('hybrid name supplementation retains ESPN team ownership', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.espn.unresolvedPickNumbers = [2];
  context.state.espn.unresolvedPickMetadata = {
    '2': {teamId: '14', isMine: true}
  };
  context.mergeUnresolvedScreenPicks([
    {overallPick: 1, playerName: 'Ignored Player', position: 'WR', isMine: false},
    {overallPick: 2, playerName: 'Resolved Player', position: 'RB', isMine: null}
  ]);
  const picks = context.getPicks();
  assert.equal(picks.length, 1);
  assert.equal(picks[0].playerName, 'Resolved Player');
  assert.equal(picks[0].teamId, '14');
  assert.equal(picks[0].isMine, true);
  assert.equal(picks[0].method, 'hybrid');
});

test('complete structured data replaces stale screen picks', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.picksByNumber = {
    '1': {overallPick: 1, playerName: 'Stale Pick', position: 'WR', method: 'dom'}
  };
  context.reconcileStructuredPicks([], [], [], true);
  assert.equal(context.state.espn.method, 'api');
  assert.equal(context.getPicks().length, 0);
});

test('accumulates explicitly drafted labels as a late-round availability safeguard', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.mergeUnavailablePlayers([
    {playerName: 'Jalen Coker', position: 'WR', espnPlayerId: '123'},
    {playerName: 'Jalen Coker', position: 'WR', espnPlayerId: '123'}
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.getUnavailablePlayers())),
    [{playerName: 'Jalen Coker', position: 'WR', espnPlayerId: '123'}]
  );
});

test('reinjects a stale War Room bridge before delivering a snapshot', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.draftKey = '2026:222';
  context.state.picksByNumber = {
    '1': {overallPick: 1, playerName: 'Ja\'Marr Chase', position: 'WR'}
  };
  let sends = 0;
  let injections = 0;
  context.chrome.tabs.query = async () => [{id: 44}];
  context.chrome.tabs.sendMessage = async (tabId, message) => {
    sends += 1;
    if (sends === 1) throw new Error('Receiving end does not exist');
    assert.equal(tabId, 44);
    assert.equal(message.snapshot.draftKey, '2026:222');
  };
  context.chrome.scripting.executeScript = async details => {
    injections += 1;
    assert.equal(Array.from(details.files).join(','), 'war-room-content.js');
  };

  const deliveries = await context.broadcastWarRoom(true);
  assert.deepEqual(Array.from(deliveries), [true]);
  assert.equal(sends, 2);
  assert.equal(injections, 1);
  assert.equal(context.state.warRoom.connected, true);
  assert.equal(context.state.warRoom.deliveryError, null);
});

test('does not report a matching War Room tab as connected when delivery fails', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.chrome.tabs.query = async () => [{id: 45}];
  context.chrome.tabs.sendMessage = async () => { throw new Error('No receiver'); };
  context.chrome.scripting.executeScript = async () => { throw new Error('Injection blocked'); };

  const deliveries = await context.broadcastWarRoom(true);
  assert.deepEqual(Array.from(deliveries), [false]);
  assert.equal(context.state.warRoom.connected, false);
  assert.match(context.state.warRoom.deliveryError, /Refresh the War Room tab/);
});

test('tab removal rechecks bridge delivery instead of trusting a matching URL', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.warRoom.connected = true;
  context.chrome.tabs.query = async query => Array.from(query.url).some(url => url.includes('github.io'))
    ? [{id: 46}]
    : [];
  context.chrome.tabs.sendMessage = async () => { throw new Error('No receiver'); };
  context.chrome.scripting.executeScript = async () => { throw new Error('Injection blocked'); };
  context.listeners.removed[0]();
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.state.warRoom.connected, false);
  assert.match(context.state.warRoom.deliveryError, /Refresh the War Room tab/);
});

test('a passive War Room acknowledgment cannot clear captured picks or overwrite popup settings', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.config = {teams: 12, draftSlot: 11, rounds: 16};
  context.state.ledgerTeams = 12;
  context.state.picksByNumber = {
    '1': {overallPick: 1, playerName: 'Ja\'Marr Chase', position: 'WR', method: 'api'}
  };

  context.listeners.message[0]({
    type: 'WAR_ROOM_ACK',
    result: {captured: 1, applied: 1, unmatched: []},
    settings: {teams: 10, draftSlot: 1, rounds: 16},
    requiredExtensionVersion: '0.8.2'
  }, {tab: {id: 44}}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(context.state.config.teams, 12);
  assert.equal(context.state.config.draftSlot, 11);
  assert.equal(context.getPicks().length, 1);
  assert.equal(context.state.warRoom.reportedSettings.teams, 10);
  assert.equal(context.state.warRoom.requiredExtensionVersion, '0.8.2');
});

test('late acknowledgments cannot lower applied progress and a trailing snapshot is resent once', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.config = {teams: 12, draftSlot: 5, rounds: 16};
  context.state.ledgerTeams = 12;
  for (let pick = 1; pick <= 192; pick++) {
    context.state.picksByNumber[String(pick)] = {
      overallPick: pick, playerName: 'Player ' + pick, position: 'WR', method: 'dom'
    };
  }
  let deliveries = 0;
  context.chrome.tabs.query = async query => Array.from(query.url).some(url => url.includes('github.io'))
    ? [{id: 44}]
    : [];
  context.chrome.tabs.sendMessage = async () => { deliveries++; };
  const listener = context.listeners.message[0];

  listener({type: 'WAR_ROOM_ACK', result: {captured: 192, applied: 192, unmatched: []}}, {tab: {id: 44}}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.state.warRoom.applied, 192);
  assert.equal(context.state.warRoom.acknowledgedCaptured, 192);

  listener({type: 'WAR_ROOM_ACK', result: {captured: 133, applied: 133, unmatched: []}}, {tab: {id: 44}}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.state.warRoom.applied, 192);
  assert.equal(context.state.warRoom.acknowledgedCaptured, 192);
  assert.equal(deliveries, 0);

  context.state.warRoom.applied = 133;
  context.state.warRoom.acknowledgedCaptured = 133;
  listener({type: 'WAR_ROOM_ACK', result: {captured: 133, applied: 133, unmatched: []}}, {tab: {id: 44}}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(deliveries, 1);
  assert.equal(context.state.warRoom.lastRetryCaptured, 192);

  listener({type: 'WAR_ROOM_ACK', result: {captured: 133, applied: 133, unmatched: []}}, {tab: {id: 44}}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(deliveries, 1);
});

test('an explicit War Room settings update becomes authoritative and preserves same-size picks', async () => {
  const context = loadBackground(null);
  await context.ready;
  context.state.config = {teams: 12, draftSlot: 10, rounds: 16};
  context.state.ledgerTeams = 12;
  context.state.picksByNumber = {
    '11': {overallPick: 11, playerName: 'CeeDee Lamb', position: 'WR', method: 'dom'}
  };

  context.listeners.message[0]({
    type: 'WAR_ROOM_SETTINGS_UPDATE',
    config: {teams: 12, draftSlot: 11, rounds: 18},
    requiredExtensionVersion: '0.8.8'
  }, {tab: {id: 44}}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(context.state.config.draftSlot, 11);
  assert.equal(context.state.config.rounds, 18);
  assert.equal(context.getPicks().length, 1);
  assert.equal(context.state.warRoom.requiredExtensionVersion, '0.8.8');
});
