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
