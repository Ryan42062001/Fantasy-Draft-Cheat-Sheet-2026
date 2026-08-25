const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('uses Manifest V3 with a service worker', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.version, '0.9.10');
});

test('popup exposes version and copyable connection diagnostics', () => {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  assert.match(html, /id="extension-version"/);
  assert.match(html, /id="version-warning"/);
  assert.match(html, /id="copy-diagnostics"/);
  assert.match(html, /id="fantasypros-key"/);
  assert.match(script, /SAVE_FANTASYPROS_KEY/);
  assert.match(script, /REFRESH_FANTASYPROS_RANKINGS/);
  assert.match(script, /Captured\/applied\/unmatched/);
  assert.match(script, /API available\/complete/);
  assert.match(script, /Missing numbered picks/);
  assert.match(script, /Screen frames/);
  assert.match(script, /page reported stale/);
  assert.match(script, /API last successful\/status/);
  assert.match(script, /Acknowledged snapshot size/);
  assert.match(script, /Live sources active/);
  assert.match(script, /Ledger confirmed\/conflicts\/unresolved IDs/);
  assert.match(script, /FantasyPros ranking refresh diagnostics/);
  assert.match(script, /Requests used this attempt/);
  assert.match(script, /API key and headers excluded/);
  assert.match(script, /Recommended next step/);
  assert.match(script, /document\.execCommand\('copy'\)/);
});

test('War Room bridge forwards explicit website draft-setting edits', () => {
  const script = fs.readFileSync(path.join(root, 'war-room-content.js'), 'utf8');
  assert.match(script, /SETTINGS_UPDATE/);
  assert.match(script, /WAR_ROOM_SETTINGS_UPDATE/);
});

test('War Room bridge forwards an explicit ESPN rankings refresh request', () => {
  const script = fs.readFileSync(path.join(root, 'war-room-content.js'), 'utf8');
  assert.match(script, /RANKINGS_REFRESH_REQUEST/);
  assert.match(script, /WAR_ROOM_RANKINGS_REFRESH/);
});

test('requests only storage and host-restricted reinjection permission', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'scripting']);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.equal(manifest.host_permissions.includes('https://api.fantasypros.com/public/v2/json/*'), true);
});

test('ESPN reader reaches embedded draft-room frames', () => {
  const espnScript = manifest.content_scripts.find(script => script.js.includes('espn-content.js'));
  assert.equal(espnScript.all_frames, true);
  assert.equal(espnScript.match_about_blank, true);
});

test('authenticated ESPN bridge runs in the page main world before readers', () => {
  const bridge = manifest.content_scripts.find(script => script.js.includes('espn-page-bridge.js'));
  assert.equal(bridge.world, 'MAIN');
  assert.equal(bridge.run_at, 'document_start');
  assert.equal(bridge.all_frames, true);
});

test('War Room bridge forwards FantasyPros API updates without credentials', () => {
  const script = fs.readFileSync(path.join(root, 'war-room-content.js'), 'utf8');
  assert.match(script, /FANTASYPROS_REFRESH_REQUEST/);
  assert.match(script, /WAR_ROOM_FANTASYPROS_RANKINGS/);
  assert.match(script, /FANTASYPROS_REFRESH_RESULT/);
  assert.doesNotMatch(script, /x-api-key/i);
});

test('FantasyPros refresh discovers and caches the documented draft-accuracy Top 20', () => {
  const script = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  assert.match(script, /presetSize:20/);
  assert.match(script, /accuracy_draft_season/);
  assert.match(script, /accuracy_draft/);
  assert.match(script, /fantasyProsTop20Preset/);
  assert.match(script, /experts:'show'/);
  assert.match(script, /nfl\/2026\/rankings\/experts/);
  assert.doesNotMatch(script, /FANTASYPROS_TOP20_ACTIVE_EXPERT_IDS/);
  assert.match(script, /fantasyProsDiagnostics/);
  assert.match(script, /responseSizeBytes/);
  assert.match(script, /requestsUsed/);
});

test('read-only live observer runs in the page main world at document start', () => {
  const observer = manifest.content_scripts.find(script => script.js.includes('espn-live-observer.js'));
  assert.equal(observer.world, 'MAIN');
  assert.equal(observer.run_at, 'document_start');
  assert.equal(observer.js.indexOf('espn-live-capture.js') < observer.js.indexOf('espn-live-observer.js'), true);
});

test('live observer decodes binary WebSocket frames and observes event streams', () => {
  const script = fs.readFileSync(path.join(root, 'espn-live-observer.js'), 'utf8');
  assert.match(script, /data instanceof root\.Blob/);
  assert.match(script, /root\.TextDecoder/);
  assert.match(script, /installEventSource/);
  assert.match(script, /eventSourceMessages/);
});

test('all declared extension files exist', () => {
  const files = new Set([
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap(script => script.js)
  ]);
  for (const file of files) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});
