const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBackground(storedState) {
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
      getManifest: () => ({version: '0.8.6'}),
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
  const context = vm.createContext({chrome, console, Date, Promise, Object, Number, String, Boolean, Math, URL});
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'background.js'), 'utf8');
  vm.runInContext(source, context);
  context.listeners = listeners;
  return context;
}

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
