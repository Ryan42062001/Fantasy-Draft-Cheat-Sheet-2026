const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const capture = require('../espn-live-capture.js');

test('recursively extracts tolerant pick candidates', () => {
  const picks = capture.extractPickCandidates({state:{history:[{
    overallPickNumber: 14, playerId: 123, teamId: 2,
    player: {displayName:'Player One', defaultPositionId:3}
  }]}}, {source:'react', teams:12});
  assert.deepEqual(picks.map(pick => ({pick:pick.overallPick,id:pick.playerId,name:pick.playerName,pos:pick.position,source:pick.source})), [
    {pick:14,id:'123',name:'Player One',pos:'WR',source:'react'}
  ]);
});

test('derives overall pick from round and round-pick when teams are known', () => {
  const pick = capture.normalizeCandidate({round:3, roundPickNumber:4, athleteId:88}, {source:'fetch', teams:12});
  assert.equal(pick.overallPick, 28);
});

test('parses websocket-style JSON frames and rejects malformed or binary inputs', () => {
  assert.equal(capture.extractPickCandidates('{"pick":{"overallPick":2,"athleteId":9}}', {source:'websocket'}).length, 1);
  assert.equal(capture.extractPickCandidates('not json', {source:'websocket'}).length, 0);
  assert.equal(capture.parsePayload(new Uint8Array([1,2,3])), null);
});

test('matching player IDs deduplicate observations and accumulate sources', () => {
  const first = capture.reconcileObservation(null, {overallPick:7,playerId:'42',source:'websocket',observedAt:'a'}).entry;
  const second = capture.reconcileObservation(first, {overallPick:7,playerId:'42',playerName:'Known Player',source:'react',observedAt:'b'});
  assert.equal(second.conflict, null);
  assert.equal(second.entry.playerName, 'Known Player');
  assert.deepEqual(second.entry.confirmedSources.sort(), ['react','websocket']);
});

test('disagreeing player IDs create a visible conflict without silent overwrite', () => {
  const first = capture.reconcileObservation(null, {overallPick:7,playerId:'42',playerName:'One',source:'react'}).entry;
  const second = capture.reconcileObservation(first, {overallPick:7,playerId:'99',playerName:'Two',source:'dom'});
  assert.equal(second.entry.playerId, '42');
  assert.equal(second.entry.conflicting, true);
  assert.equal(second.conflict.incomingPlayerId, '99');
});

test('higher-confidence structured observation can replace a conflicting DOM name', () => {
  const first = capture.reconcileObservation(null, {overallPick:8,playerName:'Wrong Name',source:'dom'}).entry;
  const second = capture.reconcileObservation(first, {overallPick:8,playerId:'55',playerName:'Right Name',source:'fetch'});
  assert.equal(second.entry.playerName, 'Right Name');
  assert.equal(second.entry.conflicting, true);
});

test('sanitized telemetry strips queries and credential-like field names', () => {
  const telemetry = capture.sanitizeTelemetry({
    source:'fetch', sourceDetail:'https://fantasy.espn.com/api/live?espn_s2=secret&SWID=secret',
    payload:{picks:[],Authorization:'secret',cookie:'secret',draftId:1}
  });
  const text = JSON.stringify(telemetry);
  assert.equal(telemetry.sourceDetail, 'fantasy.espn.com/api/live');
  assert.deepEqual(telemetry.fields, ['draftId','picks']);
  assert.doesNotMatch(text, /secret|espn_s2|SWID|Authorization|cookie/i);
});

test('sanitized replay reconstructs a player-ID-first ledger after reload', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'live-capture-replay.json'), 'utf8'));
  const ledger = {};
  fixture.events.forEach(event => {
    capture.extractPickCandidates(event.payload, {
      source:event.source, sourceDetail:event.sourceDetail, teams:fixture.teams
    }).forEach(observation => {
      ledger[observation.overallPick] = capture.reconcileObservation(ledger[observation.overallPick], observation).entry;
    });
  });
  assert.equal(Object.keys(ledger).length, 2);
  assert.equal(ledger[37].playerId, '4430807');
  assert.equal(ledger[37].playerName, 'Fixture Player');
  assert.deepEqual(ledger[37].confirmedSources.sort(), ['react','websocket']);
  assert.equal(ledger[38].position, 'RB');
});

test('observer source is read-only and installs all three network hooks plus bounded React scans', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'espn-live-observer.js'), 'utf8');
  assert.match(source, /new Proxy\(NativeWebSocket/);
  assert.match(source, /response\.clone\(\)\.text\(\)/);
  assert.match(source, /addEventListener\('loadend'/);
  assert.match(source, /setInterval\(function\(\) \{ scanReact/);
  assert.doesNotMatch(source, /nativeFetch\.apply\([^;]*method\s*:\s*['"](?:POST|PUT|DELETE)|nativeSend\.apply\([^;]*pick/i);
});
