'use strict';

var settingsDirty = false;
var latestStatus = null;
var PACKAGED_WEBSITE_REQUIREMENT = '0.9.8';
var reportedRequiredVersion = null;
var requiredVersion = PACKAGED_WEBSITE_REQUIREMENT;

function compareVersions(left, right) {
  var a = String(left || '').split('.').map(function(part) { return parseInt(part, 10) || 0; });
  var b = String(right || '').split('.').map(function(part) { return parseInt(part, 10) || 0; });
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0) ? -1 : 1;
  }
  return 0;
}

function send(message) {
  return chrome.runtime.sendMessage(message).catch(function(error) {
    return {error: error && error.message ? error.message : String(error)};
  });
}

function setOnline(id, online) {
  document.getElementById(id).classList.toggle('online', Boolean(online));
}

function render(status) {
  status = status || {};
  latestStatus = status;
  var config = status.config || {};
  var espn = status.espn || {};
  var warRoom = status.warRoom || {};
  var picks = Array.isArray(status.picks) ? status.picks : [];
  var liveCapture = espn.liveCapture || {};
  var liveSources = liveCapture.sources || {};
  var extensionVersion = status.extensionVersion || chrome.runtime.getManifest().version;
  reportedRequiredVersion = warRoom.requiredExtensionVersion || null;
  requiredVersion = compareVersions(reportedRequiredVersion, PACKAGED_WEBSITE_REQUIREMENT) >= 0
    ? reportedRequiredVersion
    : PACKAGED_WEBSITE_REQUIREMENT;
  document.getElementById('extension-version').textContent = 'Installed v' + extensionVersion;
  var versionWarning = document.getElementById('version-warning');
  var outdated = requiredVersion && compareVersions(extensionVersion, requiredVersion) < 0;
  versionWarning.hidden = !outdated;
  versionWarning.textContent = outdated
    ? 'Update required: The War Room expects v' + requiredVersion + ' or newer. Reload the unpacked extension.'
    : '';

  setOnline('espn-dot', espn.connected && espn.draftPage);
  setOnline('war-room-dot', warRoom.connected);
  document.getElementById('espn-status').textContent = espn.draftPage
    ? 'Draft detected · ' + (espn.method === 'structured' || espn.method === 'network'
      ? 'Live capture' : espn.method === 'api' ? 'REST snapshot' : espn.method === 'hybrid' ? 'Hybrid recovery' : 'Board fallback')
    : espn.connected ? 'ESPN open' : 'Not connected';
  document.getElementById('war-room-status').textContent = warRoom.connected
    ? 'Connected'
    : warRoom.deliveryError ? 'Bridge error' : 'Not connected';
  document.getElementById('captured-count').textContent = picks.length;
  document.getElementById('applied-count').textContent = Number(warRoom.applied) || 0;
  document.getElementById('unmatched-count').textContent = Number(warRoom.unmatched) || 0;
  var structuredActive = Boolean(liveSources.react && liveSources.react.active);
  var networkActive = ['websocket','fetch','xhr'].some(function(source) {
    return Boolean(liveSources[source] && liveSources[source].active);
  });
  var fallbackActive = espn.method === 'dom' || Number(espn.visibleCandidates) > 0;
  function captureStatus(id, active, label) {
    var element = document.getElementById(id);
    element.textContent = active ? label || 'Active' : 'Inactive';
    element.classList.toggle('active', active);
  }
  captureStatus('structured-status', structuredActive);
  captureStatus('network-status', networkActive);
  captureStatus('fallback-status', fallbackActive);
  document.getElementById('confirmed-status').textContent = picks.length;
  var directParts = [];
  if (espn.apiHttpStatus) directParts.push('HTTP ' + espn.apiHttpStatus);
  if (espn.apiTransport === 'page') directParts.push('authenticated page connection');
  else if (espn.apiTransport === 'content') directParts.push('extension request fallback');
  if (espn.apiRole) directParts.push('role ' + espn.apiRole);
  if (espn.apiAvailable) {
    directParts.push((Number(espn.apiResolved) || 0) + '/' + (Number(espn.apiRawCount) || 0) + ' picks resolved');
    if (Number(espn.apiUnresolved) > 0) directParts.push(espn.apiUnresolved + ' supplemented from screen');
    if (Number(espn.apiOpenSlots) > 0) directParts.push(espn.apiOpenSlots + ' future slots ignored');
  }
  if (espn.apiError) directParts.push(espn.apiError);
  document.getElementById('direct-status').textContent = directParts.length
    ? directParts.join(' · ')
    : 'No structured response received yet.';
  var draftSlot = Number(config.draftSlot) || 1;
  var minePicks = picks.filter(function(pick) {
    return typeof pick.isMine === 'boolean'
      ? pick.isMine
      : Number(pick.teamSlot) === draftSlot;
  });
  document.getElementById('mine-audit').textContent = minePicks.length
    ? 'Marked Mine: ' + minePicks.slice(-4).map(function(pick) {
      return '#' + pick.overallPick + ' ' + pick.playerName;
    }).join(' · ')
    : 'No captured picks belong to slot ' + draftSlot + ' yet.';
  if (!settingsDirty) {
    document.getElementById('teams').value = Number(config.teams) || 10;
    document.getElementById('draft-slot').value = Number(config.draftSlot) || 1;
    document.getElementById('rounds').value = Number(config.rounds) || 16;
  }

  var message = document.getElementById('message');
  if (status.error) message.textContent = status.error;
  else if (outdated) message.textContent = 'This extension is older than the open War Room. Reload it on chrome://extensions before drafting.';
  else if (warRoom.deliveryError) message.textContent = warRoom.deliveryError;
  else if (!espn.connected || !warRoom.connected) {
    message.textContent = 'Open both the ESPN draft room and The War Room, then press Rescan ESPN.';
  } else if (Number(warRoom.unmatched) > 0) {
    message.textContent = 'Some ESPN names did not match the FantasyPros board. Use manual marking for those picks and report the names.';
  } else if (espn.draftPage && picks.length === 0) {
    message.textContent = Number(espn.visibleCandidates) > 0
      ? 'Draft detected, but no completed pick rows parsed yet. Press Rescan after a pick is made.'
      : 'Draft detected, but its pick log was not visible to the reader. Press Rescan or refresh ESPN once.';
  } else if (
    espn.method !== 'api' && espn.method !== 'structured' && espn.method !== 'network' &&
    Number(espn.expectedCompleted) > 0 &&
    picks.length < Number(espn.expectedCompleted)
  ) {
    message.textContent = 'Screen fallback is behind (' + picks.length + ' of ' +
      Number(espn.expectedCompleted) + ' completed picks). Open ESPN’s Board tab and press Rescan.';
  } else if (picks.length > 0 && Number(warRoom.applied) < picks.length) {
    message.textContent = 'ESPN captured ' + picks.length + ' picks, but the War Room has acknowledged only ' +
      (Number(warRoom.applied) || 0) + '. Refresh the War Room tab, then press Rescan ESPN.';
  } else {
    message.textContent = espn.method === 'structured' || espn.method === 'network'
      ? 'Live capture is observing ESPN read-only structured data. Board fallback remains available for recovery.'
      : espn.method === 'api'
      ? 'A REST snapshot is available. Live capture or Board fallback still determines real-time reliability.'
      : espn.method === 'hybrid'
        ? 'Hybrid sync active. ESPN supplies pick ownership and numbering; the visible table fills unresolved names.'
      : 'Screen fallback active. Open ESPN’s Board tab once if any completed picks are missing.';
  }
}

function buildDiagnostics(status) {
  status = status || {};
  var espn = status.espn || {};
  var warRoom = status.warRoom || {};
  var picks = Array.isArray(status.picks) ? status.picks : [];
  var liveCapture = espn.liveCapture || {};
  var liveSources = liveCapture.sources || {};
  var fallbackActive = espn.method === 'dom' || Number(espn.visibleCandidates) > 0;
  var expectedCompleted = Number(espn.expectedCompleted) || 0;
  var capturedNumbers = new Set(picks.map(function(pick) { return Number(pick.overallPick); }));
  var missingNumbers = [];
  for (var pickNumber = 1; pickNumber <= expectedCompleted; pickNumber++) {
    if (!capturedNumbers.has(pickNumber)) missingNumbers.push(pickNumber);
  }
  var frameSummary = Object.keys(espn.screenFrames || {}).map(function(key) {
    var frame = espn.screenFrames[key] || {};
    return 'frame ' + frame.frameId + (frame.topFrame ? ' top' : '') +
      ': picks ' + (Number(frame.picks) || 0) + ', candidates ' + (Number(frame.candidates) || 0) +
      ', rejected ' + (Number(frame.rejected) || 0) + ', current ' + (Number(frame.currentPick) || 0);
  }).join(' | ');
  var parseFailures = Object.keys(espn.screenFrames || {}).reduce(function(samples, key) {
    return samples.concat((espn.screenFrames[key] && espn.screenFrames[key].parseFailureSamples) || []);
  }, []).slice(0, 8);
  return [
    'The War Room ESPN Companion diagnostics',
    'Generated: ' + new Date().toISOString(),
    'Extension: ' + (status.extensionVersion || chrome.runtime.getManifest().version),
    'War Room requires: ' + (requiredVersion || 'not reported') +
      (reportedRequiredVersion && reportedRequiredVersion !== requiredVersion
        ? ' (page reported stale ' + reportedRequiredVersion + ')'
        : ''),
    'Capture method: ' + (espn.method || 'none'),
    'ESPN connected/draft page: ' + Boolean(espn.connected) + '/' + Boolean(espn.draftPage),
    'War Room connected: ' + Boolean(warRoom.connected),
    'Captured/applied/unmatched: ' + picks.length + '/' + (Number(warRoom.applied) || 0) + '/' + (Number(warRoom.unmatched) || 0),
    'Acknowledged snapshot size: ' + (Number(warRoom.acknowledgedCaptured) || 0),
    'Draft complete: ' + Boolean(espn.draftComplete),
    'Current/expected completed: ' + (espn.currentPick || 'unknown') + '/' + expectedCompleted,
    'Missing numbered picks: ' + (missingNumbers.length ? missingNumbers.slice(0, 80).join(',') + (missingNumbers.length > 80 ? '…' : '') : 'none'),
    'Screen frames: ' + (frameSummary || 'none reported'),
    'Unique candidates/unresolved-or-duplicate: ' + (Number(espn.visibleCandidates) || 0) + '/' + (Number(espn.visibleRejected) || 0),
    'Unparseable row samples: ' + (parseFailures.length ? parseFailures.join(' || ') : 'none'),
    'Live sources active: react=' + Boolean(liveSources.react && liveSources.react.active) +
      ', websocket=' + Boolean(liveSources.websocket && liveSources.websocket.active) +
      ', fetch=' + Boolean(liveSources.fetch && liveSources.fetch.active) +
      ', xhr=' + Boolean(liveSources.xhr && liveSources.xhr.active) + ', board=' + fallbackActive,
    'Live source counters: sockets=' + (Number(liveCapture.counters && liveCapture.counters.sockets) || 0) +
      ', socket messages=' + (Number(liveCapture.counters && liveCapture.counters.socketMessages) || 0) +
      ', fetch responses=' + (Number(liveCapture.counters && liveCapture.counters.fetchResponses) || 0) +
      ', xhr responses=' + (Number(liveCapture.counters && liveCapture.counters.xhrResponses) || 0) +
      ', React scans=' + (Number(liveCapture.counters && liveCapture.counters.reactScans) || 0),
    'Live observations/candidates/latest: ' + (Number(liveCapture.observations) || 0) + '/' +
      (Number(liveCapture.candidates) || 0) + '/' + (Number(liveCapture.latestPick) || 0),
    'Ledger confirmed/conflicts/unresolved IDs: ' + picks.length + '/' +
      (Number(liveCapture.conflicts) || 0) + '/' + (Number(liveCapture.unresolvedPlayerIds) || 0),
    'API available/complete: ' + Boolean(espn.apiAvailable) + '/' + Boolean(espn.apiComplete),
    'API HTTP/transport/role: ' + (espn.apiHttpStatus || 'none') + '/' + (espn.apiTransport || 'none') + '/' + (espn.apiRole || 'none'),
    'API last successful/status: ' + (espn.lastSuccessfulApiAt || 'none') + '/' +
      (espn.lastSuccessfulApiHttpStatus || 'none') + ' · ' +
      (Number(espn.lastSuccessfulApiResolved) || 0) + ' resolved',
    'API resolved/raw/unresolved: ' + (Number(espn.apiResolved) || 0) + '/' + (Number(espn.apiRawCount) || 0) + '/' + (Number(espn.apiUnresolved) || 0),
    'ESPN market ADP players: ' + (Number(espn.marketAdpCount) || 0),
    'API scheduled/open slots: ' + (Number(espn.apiScheduledCount) || 0) + '/' + (Number(espn.apiOpenSlots) || 0),
    'API pick fields: ' + (Array.isArray(espn.apiPickFields) && espn.apiPickFields.length ? espn.apiPickFields.join(',') : 'none'),
    'Acknowledgment lag: ' + Math.max(0, picks.length - (Number(warRoom.applied) || 0)) + ' pick(s)',
    'API error: ' + (espn.apiError || 'none'),
    'Delivery error: ' + (warRoom.deliveryError || 'none')
  ].join('\n');
}

function refresh() {
  send({type: 'GET_STATUS'}).then(render);
}

['teams', 'draft-slot', 'rounds'].forEach(function(id) {
  document.getElementById(id).addEventListener('input', function() {
    settingsDirty = true;
  });
});

document.getElementById('save-settings').addEventListener('click', function() {
  send({
    type: 'UPDATE_CONFIG',
    config: {
      teams: Number(document.getElementById('teams').value),
      draftSlot: Number(document.getElementById('draft-slot').value),
      rounds: Number(document.getElementById('rounds').value)
    }
  }).then(function(status) {
    settingsDirty = false;
    render(status);
  });
});

document.getElementById('rescan').addEventListener('click', function() {
  send({type: 'RESCAN'}).then(function(status) {
    render(status);
    setTimeout(refresh, 700);
  });
});

document.getElementById('reset').addEventListener('click', function(event) {
  var button = event.currentTarget;
  if (button.dataset.armed !== '1') {
    button.dataset.armed = '1';
    button.textContent = 'Click again to clear';
    setTimeout(function() {
      button.dataset.armed = '0';
      button.textContent = 'Clear captured picks';
    }, 3000);
    return;
  }
  button.dataset.armed = '0';
  button.textContent = 'Clear captured picks';
  send({type: 'RESET_PICKS'}).then(render);
});

document.getElementById('copy-diagnostics').addEventListener('click', function(event) {
  var button = event.currentTarget;
  var diagnostics = buildDiagnostics(latestStatus);
  var copyPromise = navigator.clipboard && navigator.clipboard.writeText
    ? navigator.clipboard.writeText(diagnostics)
    : Promise.reject(new Error('Clipboard API unavailable'));
  copyPromise.catch(function() {
    var textarea = document.createElement('textarea');
    textarea.value = diagnostics;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    var copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard fallback failed');
  }).then(function() {
    button.textContent = 'Diagnostics copied';
    setTimeout(function() { button.textContent = 'Copy diagnostics'; }, 1800);
  }).catch(function() {
    button.textContent = 'Copy failed';
    setTimeout(function() { button.textContent = 'Copy diagnostics'; }, 1800);
  });
});

document.getElementById('open-tab').addEventListener('click', function() {
  chrome.tabs.create({url: chrome.runtime.getURL('popup.html')});
  window.close();
});

function renderFantasyProsKeyStatus(result, message) {
  var target = document.getElementById('fantasypros-key-status');
  target.className = 'key-status' + (result && result.error ? ' error' : result && result.connected ? ' success' : '');
  if (message) target.textContent = message;
  else if (result && result.error) target.textContent = result.error;
  else if (result && result.connected) {
    target.textContent = 'Connected · HTTP ' + result.httpStatus + ' · ' + result.players + ' players' +
      (result.lastUpdated ? ' · updated ' + result.lastUpdated : '');
  } else target.textContent = result && result.configured ? 'Key saved locally · access not tested yet.' : 'No API key saved.';
}

document.getElementById('save-fantasypros-key').addEventListener('click', function() {
  var input = document.getElementById('fantasypros-key');
  send({type:'SAVE_FANTASYPROS_KEY', key:input.value}).then(function(result) {
    if (!result.error) input.value = '';
    renderFantasyProsKeyStatus(result);
  });
});

document.getElementById('test-fantasypros-key').addEventListener('click', function() {
  renderFantasyProsKeyStatus(null, 'Testing official 2026 PPR access…');
  send({type:'TEST_FANTASYPROS_KEY'}).then(renderFantasyProsKeyStatus);
});

document.getElementById('refresh-fantasypros').addEventListener('click', function() {
  renderFantasyProsKeyStatus(null, 'Downloading and validating Top-20 PPR rankings…');
  send({type:'REFRESH_FANTASYPROS_RANKINGS'}).then(function(result) {
    if (result.error) return renderFantasyProsKeyStatus(result);
    renderFantasyProsKeyStatus({connected:true, httpStatus:200, players:result.players, lastUpdated:result.lastUpdated},
      'Updated ' + result.players + ' players from ' + result.experts + ' experts. The War Room is reloading.');
  });
});

document.getElementById('remove-fantasypros-key').addEventListener('click', function() {
  send({type:'REMOVE_FANTASYPROS_KEY'}).then(renderFantasyProsKeyStatus);
});

send({type:'GET_FANTASYPROS_KEY_STATUS'}).then(renderFantasyProsKeyStatus);

refresh();
setInterval(refresh, 1000);
