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
  const context = vm.createContext({chrome, console, Date, Promise, Object, Number, String, Boolean, Math});
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
