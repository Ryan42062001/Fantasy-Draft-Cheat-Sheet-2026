const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('uses Manifest V3 with a service worker', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.version, '0.8.5');
});

test('popup exposes version and copyable connection diagnostics', () => {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  assert.match(html, /id="extension-version"/);
  assert.match(html, /id="version-warning"/);
  assert.match(html, /id="copy-diagnostics"/);
  assert.match(script, /Captured\/applied\/unmatched/);
  assert.match(script, /API available\/complete/);
  assert.match(script, /Missing numbered picks/);
  assert.match(script, /Screen frames/);
});

test('requests only storage and host-restricted reinjection permission', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'scripting']);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.equal(manifest.permissions.includes('cookies'), false);
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
