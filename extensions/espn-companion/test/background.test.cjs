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
  assert.equal(
    context.activateDraft('https://fantasy.espn.com/football/draft?leagueId=222&seasonId=2026&teamId=14'),
    true
  );
  assert.equal(context.state.draftKey, '2026:222');
  assert.equal(context.getPicks().length, 0);
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
