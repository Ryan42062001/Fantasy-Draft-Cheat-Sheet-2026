const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../espn-page-bridge.js');

test('allows only narrowly scoped ESPN football API endpoints', () => {
  assert.equal(bridge.isAllowedApiUrl('https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1840797277?view=mDraftDetail'), true);
  assert.equal(bridge.isAllowedApiUrl('https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/players?view=players_wl'), true);
  assert.equal(bridge.isAllowedApiUrl('https://example.com/apis/v3/games/ffl/seasons/2026/players'), false);
  assert.equal(bridge.isAllowedApiUrl('https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/2026/players'), false);
});

test('forwards only the bounded Fantasy filter header', () => {
  assert.deepEqual(bridge.buildHeaders({
    Authorization: 'secret',
    Cookie: 'secret',
    'X-Fantasy-Filter': '{"filterIds":{"value":[1]}}'
  }), {
    Accept: 'application/json',
    'X-Fantasy-Filter': '{"filterIds":{"value":[1]}}'
  });
});
