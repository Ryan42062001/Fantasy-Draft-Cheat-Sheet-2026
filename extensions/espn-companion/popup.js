'use strict';

var settingsDirty = false;

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
  var config = status.config || {};
  var espn = status.espn || {};
  var warRoom = status.warRoom || {};
  var picks = Array.isArray(status.picks) ? status.picks : [];

  setOnline('espn-dot', espn.connected && espn.draftPage);
  setOnline('war-room-dot', warRoom.connected);
  document.getElementById('espn-status').textContent = espn.draftPage
    ? 'Draft detected · ' + (espn.method === 'api' ? 'Direct' : 'Screen')
    : espn.connected ? 'ESPN open' : 'Not connected';
  document.getElementById('war-room-status').textContent = warRoom.connected
    ? 'Connected'
    : 'Not connected';
  document.getElementById('captured-count').textContent = picks.length;
  document.getElementById('applied-count').textContent = Number(warRoom.applied) || 0;
  document.getElementById('unmatched-count').textContent = Number(warRoom.unmatched) || 0;
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
  else if (!espn.connected || !warRoom.connected) {
    message.textContent = 'Open both the ESPN draft room and The War Room, then press Rescan ESPN.';
  } else if (Number(warRoom.unmatched) > 0) {
    message.textContent = 'Some ESPN names did not match the FantasyPros board. Use manual marking for those picks and report the names.';
  } else if (espn.draftPage && picks.length === 0) {
    message.textContent = Number(espn.visibleCandidates) > 0
      ? 'Draft detected, but no completed pick rows parsed yet. Press Rescan after a pick is made.'
      : 'Draft detected, but its pick log was not visible to the reader. Press Rescan or refresh ESPN once.';
  } else {
    message.textContent = espn.method === 'api'
      ? 'Direct ESPN data connected. Team ownership and pick numbers come from ESPN.'
      : 'Screen fallback active. Open ESPN’s Board tab once if any completed picks are missing.';
  }
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

document.getElementById('open-tab').addEventListener('click', function() {
  chrome.tabs.create({url: chrome.runtime.getURL('popup.html')});
  window.close();
});

refresh();
setInterval(refresh, 1000);
