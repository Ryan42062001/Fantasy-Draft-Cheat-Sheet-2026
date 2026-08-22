const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../espn-parser.js');

test('parses a labeled overall ESPN pick', () => {
  assert.deepEqual(
    parser.parsePickText('Pick 1\nJa\'Marr Chase\nWR - CIN', {teams: 10}),
    {
      overallPick: 1,
      playerName: "Ja'Marr Chase",
      position: 'WR',
      teamSlot: 1,
      espnPlayerId: null
    }
  );
});

test('converts round.pick notation to overall pick', () => {
  const result = parser.parsePickText('2.01\nJahmyr Gibbs\nRB DET', {teams: 10});
  assert.equal(result.overallPick, 11);
  assert.equal(result.teamSlot, 10);
  assert.equal(result.playerName, 'Jahmyr Gibbs');
});

test('parses inline player and position text', () => {
  const result = parser.parsePickText('#20 - Brock Bowers · TE · LV', {teams: 10});
  assert.equal(result.overallPick, 20);
  assert.equal(result.playerName, 'Brock Bowers');
  assert.equal(result.position, 'TE');
  assert.equal(result.teamSlot, 1);
});

test('normalizes ESPN defense notation', () => {
  const result = parser.parsePickText('Pick 155\nHouston Texans D/ST\nD/ST - HOU', {teams: 10});
  assert.equal(result.position, 'DST');
  assert.equal(result.playerName, 'Houston Texans');
});

test('parses ESPN classic pick-history formatting without including the team', () => {
  const result = parser.parsePickText(
    '1. (1) Ja\'Marr Chase (CIN - WR)',
    {teams: 10}
  );
  assert.equal(result.overallPick, 1);
  assert.equal(result.playerName, "Ja'Marr Chase");
  assert.equal(result.position, 'WR');
});

test('parses the live ESPN recent-pick card format', () => {
  const result = parser.parsePickText(
    "CeeDee Lamb / DAL WR\nR1, P11 - Ryan's Rowdy Team",
    {teams: 12}
  );
  assert.equal(result.overallPick, 11);
  assert.equal(result.playerName, 'CeeDee Lamb');
  assert.equal(result.position, 'WR');
  assert.equal(result.teamSlot, 11);
});

test('parses the live ESPN central pick-history row format', () => {
  const result = parser.parsePickText(
    "11\nCeeDee Lamb\nDAL\nWR\nRyan's Rowdy Team\n293.5",
    {teams: 12}
  );
  assert.equal(result.overallPick, 11);
  assert.equal(result.playerName, 'CeeDee Lamb');
  assert.equal(result.position, 'WR');
});

test('does not mistake the on-clock autopick suggestion for a completed pick', () => {
  assert.equal(
    parser.parsePickText('ON THE CLOCK: PICK 14\nYour autopick would be: James Cook II / BUF RB', {teams: 12}),
    null
  );
});

test('detailed scan returns diagnostics for an unavailable document', () => {
  assert.deepEqual(parser.scanDocumentDetailed(null, {teams: 10}), {
    candidateCount: 0,
    picks: []
  });
});

test('prefers data attributes and extracts ESPN player id', () => {
  const result = parser.parsePickText(
    'Pick 7\nSelected player\nRB - DET',
    {teams: 10},
    {'data-player-name': 'Jahmyr Gibbs', 'data-player-id': '4427366'}
  );
  assert.equal(result.playerName, 'Jahmyr Gibbs');
  assert.equal(result.espnPlayerId, '4427366');
});

test('rejects available-player text without a completed pick number', () => {
  assert.equal(parser.parsePickText('Ja\'Marr Chase\nWR - CIN\nAdd to queue', {teams: 10}), null);
});

test('snake slot mapping handles both turns', () => {
  assert.equal(parser.snakeTeamSlot(10, 10), 10);
  assert.equal(parser.snakeTeamSlot(11, 10), 10);
  assert.equal(parser.snakeTeamSlot(20, 10), 1);
  assert.equal(parser.snakeTeamSlot(21, 10), 1);
});
