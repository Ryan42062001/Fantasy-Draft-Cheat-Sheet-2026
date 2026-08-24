const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../espn-api.js');

test('reads league, season, and exact user team identity from the ESPN draft URL', () => {
  assert.deepEqual(
    api.parseLeagueContext('https://fantasy.espn.com/football/draft?leagueId=1840797277&seasonId=2026&teamId=14'),
    {leagueId: '1840797277', seasonId: '2026', teamId: '14'}
  );
});

test('builds the narrowly scoped ESPN draft-detail request', () => {
  const url = api.buildDraftDetailUrl({leagueId: '1840797277', seasonId: '2026'});
  assert.match(url, /^https:\/\/lm-api-reads\.fantasy\.espn\.com\/apis\/v3\/games\/ffl\/seasons\/2026\//);
  assert.match(url, /view=mDraftDetail/);
});

test('uses ESPN teamId instead of inferred snake position for Mine', () => {
  const snapshot = api.extractDraftSnapshot({
    draftDetail: {
      picks: [
        {overallPickNumber: 10, teamId: 7, playerId: 1},
        {overallPickNumber: 11, teamId: 14, playerId: 2}
      ]
    },
    players: [
      {player: {id: 1, fullName: 'Justin Jefferson', defaultPositionId: 3}},
      {player: {id: 2, fullName: 'CeeDee Lamb', defaultPositionId: 3}}
    ]
  }, {teamId: '14'}, {});

  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.picks[0].isMine, false);
  assert.equal(snapshot.picks[1].isMine, true);
  assert.equal(snapshot.picks[1].playerName, 'CeeDee Lamb');
});

test('does not claim structured authority until every ESPN pick resolves', () => {
  const snapshot = api.extractDraftSnapshot({
    draftDetail: {picks: [{overallPickNumber: 1, teamId: 4, playerId: 999}]}
  }, {teamId: '4'}, {});
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.rawCount, 1);
  assert.equal(snapshot.unresolved.length, 1);
  assert.deepEqual(snapshot.rawPickNumbers, [1]);
  assert.equal(snapshot.unresolved[0].teamId, '4');
  assert.equal(snapshot.unresolved[0].isMine, true);
});

test('treats a valid empty ESPN draft feed as authoritative before pick one', () => {
  const snapshot = api.extractDraftSnapshot({
    draftDetail: {picks: []}
  }, {teamId: '14'}, {});
  assert.equal(snapshot.feedPresent, true);
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.rawCount, 0);
  assert.deepEqual(snapshot.picks, []);
});

test('ignores preloaded future draft slots and resolves only completed picks', () => {
  const scheduled = Array.from({length: 192}, (_, index) => ({
    overallPickNumber: index + 1,
    teamId: (index % 12) + 1,
    playerId: index < 10 ? index + 101 : -1
  }));
  const players = Array.from({length: 10}, (_, index) => ({
    player: {id: index + 101, fullName: `Player ${index + 1}`, defaultPositionId: index % 2 ? 2 : 3}
  }));
  const snapshot = api.extractDraftSnapshot(
    {draftDetail: {picks: scheduled}, players},
    {teamId: '11'},
    {}
  );
  assert.equal(snapshot.scheduledCount, 192);
  assert.deepEqual(snapshot.pickFields, ['overallPickNumber', 'playerId', 'teamId']);
  assert.equal(snapshot.openSlotCount, 182);
  assert.equal(snapshot.rawCount, 10);
  assert.equal(snapshot.picks.length, 10);
  assert.equal(snapshot.unresolved.length, 0);
  assert.equal(snapshot.complete, true);
  assert.deepEqual(snapshot.rawPickNumbers, [1,2,3,4,5,6,7,8,9,10]);
});

test('treats an empty structured feed as lagging when ESPN is on pick 11', () => {
  assert.deepEqual(
    api.assessStructuredFeed({feedPresent: true, complete: true, rawCount: 0}, 11),
    {expectedCompleted: 10, behind: true, effectiveComplete: false}
  );
  assert.deepEqual(
    api.assessStructuredFeed({feedPresent: true, complete: true, rawCount: 10}, 11),
    {expectedCompleted: 10, behind: false, effectiveComplete: true}
  );
});

test('retains unresolved scheduled slots when the draft is complete', () => {
  const payload = {draftDetail: {picks: [
    {overallPickNumber: 1, playerId: 101, teamId: 1},
    {overallPickNumber: 2, playerId: 102, teamId: 2},
    {overallPickNumber: 3, playerId: -1, teamId: 3}
  ]}};
  const directory = {
    '101': {playerName: 'First Player', position: 'WR'},
    '102': {playerName: 'Second Player', position: 'RB'}
  };
  const snapshot = api.extractDraftSnapshot(
    payload,
    {teamId: '3'},
    directory,
    {draftComplete: true}
  );
  assert.equal(snapshot.rawCount, 3);
  assert.deepEqual(snapshot.rawPickNumbers, [1, 2, 3]);
  assert.equal(snapshot.picks.length, 2);
  assert.equal(snapshot.unresolved.length, 1);
  assert.equal(snapshot.unresolved[0].overallPick, 3);
  assert.equal(snapshot.unresolved[0].isMine, true);
  assert.deepEqual(
    api.assessStructuredFeed(snapshot, null, 3, true),
    {expectedCompleted: 3, behind: false, effectiveComplete: false}
  );
});
