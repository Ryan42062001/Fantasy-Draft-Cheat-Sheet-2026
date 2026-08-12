/**
 * FANTASY DRAFT CHEAT SHEET 2026
 * Real-time draft companion with live recommendations, autosave, and position tracking
 */

// ==== CONFIGURATION ====
var LEAGUE_SIZE = 10;
var MY_DRAFT_SLOT = 10;
var TOTAL_ROUNDS = 16;
var ROSTER_SLOTS = {QB:1, RB:2, WR:2, TE:1, FLEX:1, DST:1, K:1};
var BENCH_SLOTS = {QB:0, RB:2, WR:5, TE:0, K:0, DST:0};
var AUTOSAVE_KEY = 'draft-state-v1';
var AUTOSAVE_ENABLED_KEY = 'draft-autosave-enabled-v1';
var TEAM_COLORS = {
  ARI:'#97233F', ATL:'#A71930', BAL:'#241773', BUF:'#00338D', CAR:'#0085CA',
  CHI:'#0B162A', CIN:'#FB4F14', CLE:'#FF3C00', DAL:'#003594', DEN:'#FB4F14',
  DET:'#0076B6', GB:'#203731', HOU:'#03202F', IND:'#002C5F', JAX:'#101820',
  KC:'#E31837', LAC:'#0080C6', LAR:'#003594', LV:'#A5ACAF', MIA:'#008E97',
  MIN:'#4F2683', NE:'#002244', NO:'#D3BC8D', NYG:'#0B2265', NYJ:'#125740',
  PHI:'#004C54', PIT:'#FFB612', SEA:'#69BE28', SF:'#AA0000', TB:'#D50A0A',
  TEN:'#4B92DB', WAS:'#5A1414'
};
var TIER_IDS = ['Sp','S','A','B','C','D','E','F'];
var TIER_LABELS = {Sp:'S+', S:'S', A:'A', B:'B', C:'C', D:'D', E:'E', F:'F'};

// ==== INTERNAL STATE ====
var currentPosFilter = 'ALL';
var resetArmed = false;
var resetArmTimer = null;
var _saveTimer = null;
var appObserver = null;
var searchMatches = [];
var currentSearchIndex = -1;
window.ORIGINAL_ORDER = [];

// ==== SAFE UTILITY CALLERS ====
function safeCall(fnName) {
  if (typeof window[fnName] === 'function') {
    try { window[fnName](); } catch(e) { console.warn('SafeCall failed for ' + fnName, e); }
  }
}

// ==== CORE DASHBOARD & RECOMMENDER UPDATES ====
function updateMyTeam() {
  var myTeamContainer = document.getElementById('roster-list');
  var needsContainer = document.getElementById('needs-row');
  var starterCountElement = document.getElementById('myteam-starter-count');

  if (!myTeamContainer) return;

  var counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  var players = [];

  document.querySelectorAll('tr.draftrow.drafted-mine').forEach(function(row) {
    var name = row.getAttribute('data-name') || 'Unknown Player';
    var pos = row.getAttribute('data-pos') || 'N/A';

    if (counts[pos] !== undefined) {
      counts[pos]++;
    }

    players.push({
      name: name,
      pos: pos,
      row: row
    });
  });

  /* ---- Assign players to starting slots ---- */

  var starters = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    FLEX: [],
    K: [],
    DST: []
  };

  /*
   * Fill the dedicated starting positions first.
   */
  players.forEach(function(player) {

    if (player.pos === 'QB' && starters.QB.length < 1) {
      starters.QB.push(player);
    }

    else if (player.pos === 'RB' && starters.RB.length < 2) {
      starters.RB.push(player);
    }

    else if (player.pos === 'WR' && starters.WR.length < 2) {
      starters.WR.push(player);
    }

    else if (player.pos === 'TE' && starters.TE.length < 1) {
      starters.TE.push(player);
    }

    else if (player.pos === 'K' && starters.K.length < 1) {
      starters.K.push(player);
    }

    else if (player.pos === 'DST' && starters.DST.length < 1) {
      starters.DST.push(player);
    }
  });

  /*
   * Any extra RB/WR/TE goes into FLEX.
   */
  players.forEach(function(player) {

    var isDedicatedStarter =
      starters.QB.includes(player) ||
      starters.RB.includes(player) ||
      starters.WR.includes(player) ||
      starters.TE.includes(player) ||
      starters.K.includes(player) ||
      starters.DST.includes(player);

    if (
      !isDedicatedStarter &&
      starters.FLEX.length < 1 &&
      ['RB', 'WR', 'TE'].includes(player.pos)
    ) {
      starters.FLEX.push(player);
    }
  });

  /* ---- Calculate total starters ---- */

  var totalStarters =
    starters.QB.length +
    starters.RB.length +
    starters.WR.length +
    starters.TE.length +
    starters.FLEX.length +
    starters.K.length +
    starters.DST.length;

  /* ---- Update starter counter ---- */

  if (starterCountElement) {
    starterCountElement.textContent =
      totalStarters + ' / 9 starters';
  }

  /* ---- Update My Team button ---- */

  var myTeamButton = document.querySelector('.myteam-toggle');

  if (myTeamButton) {
    var panel = document.getElementById('myteam-panel');
    var isOpen = panel && panel.classList.contains('open');

    myTeamButton.innerText =
      (isOpen ? 'Hide My Team' : 'My Team') +
      ' · ' +
      totalStarters +
      '/9';
  }

  /* ---- Roster needs ---- */

  if (needsContainer) {
    var needs = [];

    if (counts.QB < 1) {
      needs.push(
        '<span class="roster-need roster-need-open">QB ' +
        counts.QB + '/1</span>'
      );
    } else {
      needs.push(
        '<span class="roster-need roster-need-filled">QB ✓</span>'
      );
    }

    if (counts.RB < 2) {
      needs.push(
        '<span class="roster-need roster-need-open">RB ' +
        counts.RB + '/2</span>'
      );
    } else {
      needs.push(
        '<span class="roster-need roster-need-filled">RB ✓</span>'
      );
    }

    if (counts.WR < 2) {
      needs.push(
        '<span class="roster-need roster-need-open">WR ' +
        counts.WR + '/2</span>'
      );
    } else {
      needs.push(
        '<span class="roster-need roster-need-filled">WR ✓</span>'
      );
    }

    if (counts.TE < 1) {
      needs.push(
        '<span class="roster-need roster-need-open">TE ' +
        counts.TE + '/1</span>'
      );
    } else {
      needs.push(
        '<span class="roster-need roster-need-filled">TE ✓</span>'
      );
    }

    if (starters.FLEX.length < 1) {
      needs.push(
        '<span class="roster-need roster-need-open">FLEX 0/1</span>'
      );
    } else {
      needs.push(
        '<span class="roster-need roster-need-filled">FLEX ✓</span>'
      );
    }

    if (counts.K < 1) {
      needs.push(
        '<span class="roster-need roster-need-open">K ' +
        counts.K + '/1</span>'
      );
    } else {
      needs.push(
        '<span class="roster-need roster-need-filled">K ✓</span>'
      );
    }

    if (counts.DST < 1) {
      needs.push(
        '<span class="roster-need roster-need-open">DST ' +
        counts.DST + '/1</span>'
      );
    } else {
      needs.push(
        '<span class="roster-need roster-need-filled">DST ✓</span>'
      );
    }

    needsContainer.innerHTML = needs.join('');
  }

  /* ---- Build starting lineup display ---- */

  function slotHTML(label, player, positionClass) {

    if (player) {
      return (
        '<div class="starter-slot filled">' +
          '<span class="starter-position ' + positionClass + '">' +
            label +
          '</span>' +
          '<span class="starter-player">' +
            player.name +
          '</span>' +
          '<span class="starter-check">✓</span>' +
        '</div>'
      );
    }

    return (
      '<div class="starter-slot empty">' +
        '<span class="starter-position ' + positionClass + '">' +
          label +
        '</span>' +
        '<span class="starter-player empty-player">' +
          '—' +
        '</span>' +
        '<span class="starter-missing">OPEN</span>' +
      '</div>'
    );
  }

  var lineupHTML =
    '<div class="starting-lineup">' +
      '<div class="starting-lineup-title">STARTERS</div>' +

      slotHTML('QB', starters.QB[0], 'pos-QB') +

      slotHTML('RB', starters.RB[0], 'pos-RB') +
      slotHTML('RB', starters.RB[1], 'pos-RB') +

      slotHTML('WR', starters.WR[0], 'pos-WR') +
      slotHTML('WR', starters.WR[1], 'pos-WR') +

      slotHTML('TE', starters.TE[0], 'pos-TE') +

      slotHTML('FLEX', starters.FLEX[0], 'pos-FLEX') +

      slotHTML('K', starters.K[0], 'pos-K') +

      slotHTML('DST', starters.DST[0], 'pos-DST') +

    '</div>';

  /*
   * Add the starting lineup above the existing roster list.
   */
  var existingRosterHTML = '';

  players.forEach(function(player) {
    existingRosterHTML +=
      '<div class="team-player-card">' +
        '<span class="pos-pill pos-' + player.pos + '">' +
          player.pos +
        '</span>' +
        '<span class="team-player-name">' +
          player.name +
        '</span>' +
      '</div>';
  });

  myTeamContainer.innerHTML =
    lineupHTML +
    '<div class="roster-divider">ALL DRAFTED PLAYERS</div>' +
    (existingRosterHTML ||
      '<div class="empty-roster">No players drafted yet.</div>');
}

function toggleMyTeam() {
  var panel = document.getElementById('myteam-panel');
  var button = document.querySelector('.myteam-toggle');

  if (!panel) return;

  var isOpen = panel.classList.toggle('open');

  if (isOpen) {
    updateMyTeam();
  } else {
    var starterCountElement =
      document.getElementById('myteam-starter-count');

    var starterText = starterCountElement
      ? starterCountElement.textContent
      : '0 / 9 starters';

    var shortCount = starterText.replace(' starters', '');

    if (button) {
      button.classList.remove('active');
      button.innerText = 'My Team · ' + shortCount;
    }
  }

  if (button && isOpen) {
    var currentCount =
      document.getElementById('myteam-starter-count');

    var countText = currentCount
      ? currentCount.textContent.replace(' starters', '')
      : '0 / 9';

    button.classList.add('active');
    button.innerText = 'Hide My Team · ' + countText;
  }
}

function updateBestAvailable() {
  var container = document.getElementById('best-available-list');
  if (container) container.innerHTML = '';
}

function updateRemaining() { safeCall('updateRemainingCustom'); }

// ==== REAL-TIME DRAFT POSITION & PICK COUNTER ====
function getMyPickNumbers() {
  var pcTeams = document.getElementById('pcTeams');
  var pcSlot = document.getElementById('pcSlot');
  var pcRounds = document.getElementById('pcRounds');

  var leagueSize = Math.max(1, parseInt(pcTeams ? pcTeams.value : LEAGUE_SIZE, 10) || 10);
  var mySlot = Math.max(1, parseInt(pcSlot ? pcSlot.value : MY_DRAFT_SLOT, 10) || 10);
  var totalRounds = Math.max(1, parseInt(pcRounds ? pcRounds.value : TOTAL_ROUNDS, 10) || 16);

  if (mySlot > leagueSize) mySlot = leagueSize;

  var myPicks = [];
  for (var round = 1; round <= totalRounds; round++) {
    var pickInRound = (round % 2 !== 0) ? mySlot : (leagueSize - mySlot + 1);
    var overallPick = (round - 1) * leagueSize + pickInRound;
    myPicks.push(overallPick);
  }
  return myPicks;
}

function updatePickCounter() {
  var pcTeams = document.getElementById('pcTeams');
  var pcRounds = document.getElementById('pcRounds');
  var counter = document.getElementById('pick-counter-text');

  if (!counter) return;

  var teams = Math.max(
    2,
    parseInt(pcTeams ? pcTeams.value : LEAGUE_SIZE, 10) || LEAGUE_SIZE
  );

  var rounds = Math.max(
    1,
    parseInt(pcRounds ? pcRounds.value : TOTAL_ROUNDS, 10) || TOTAL_ROUNDS
  );

  var totalPicks = teams * rounds;

  // Every player marked Taken or Mine counts as one completed pick.
  var completedPicks = document.querySelectorAll(
    'tr.draftrow.drafted-mine, tr.draftrow.drafted-other'
  ).length;

  var currentPick = Math.min(completedPicks + 1, totalPicks);

  var myPicks = getMyPickNumbers();

  // Find the next pick belonging to you.
  var nextMyPick = null;

  for (var i = 0; i < myPicks.length; i++) {
    if (myPicks[i] >= currentPick) {
      nextMyPick = myPicks[i];
      break;
    }
  }

  if (currentPick > totalPicks) {
    counter.innerHTML =
      'Draft complete &middot; <b>' + totalPicks + ' picks</b>';

    return;
  }

  if (nextMyPick === currentPick) {
    counter.innerHTML =
      'Pick <b>' + currentPick + '</b> of ' + totalPicks +
      ' &middot; <span style="color:#8fd4a0;font-weight:900;">YOUR PICK!</span>';

  } else if (nextMyPick !== null) {
    var picksUntilNext = nextMyPick - currentPick;

    counter.innerHTML =
      'Pick <b>' + currentPick + '</b> of ' + totalPicks +
      ' &middot; your next pick: <b>#' + nextMyPick + '</b>' +
      ' <span style="color:#a9c2ab;">(' + picksUntilNext +
      ' pick' + (picksUntilNext === 1 ? '' : 's') + ' away)</span>';

  } else {
    counter.innerHTML =
      'Pick <b>' + currentPick + '</b> of ' + totalPicks +
      ' &middot; no more picks';
  }
}

function updateNextPickDisplay() {
  var totalDrafted = document.querySelectorAll('tr.draftrow.drafted-mine, tr.draftrow.drafted-other').length;
  var currentOverallPick = totalDrafted + 1;
  var myScheduledPicks = getMyPickNumbers();

  var nextPickOverall = myScheduledPicks.find(function(pick) {
    return pick >= currentOverallPick;
  });

  var nextPickElement = document.getElementById('next-pick-display') || document.getElementById('pick-counter');
  if (nextPickElement) {
    if (nextPickOverall) {
      var picksAway = nextPickOverall - currentOverallPick;
      nextPickElement.innerText = picksAway === 0 
        ? "ON THE CLOCK!" 
        : "Next Pick: #" + nextPickOverall + " (" + picksAway + " pick" + (picksAway > 1 ? "s" : "") + " away)";
    } else {
      nextPickElement.innerText = "Draft Complete";
    }
  }
}

function updateNextPickMarker() {
  var existingMarker = document.getElementById('next-pick-marker');
  if (existingMarker) existingMarker.remove();

  var takenCount = document.querySelectorAll('tr.draftrow.drafted-mine, tr.draftrow.drafted-other').length;
  var currentOverallPick = takenCount + 1;
  var myPicks = getMyPickNumbers();

  var nextUserPick = myPicks.find(function(pick) {
    return pick >= currentOverallPick;
  });

  if (!nextUserPick) return;

  var picksAway = nextUserPick - currentOverallPick;
  var rows = Array.from(document.querySelectorAll('tr.draftrow:not(.hidden-row)'));
  var targetRow = null;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.classList.contains('drafted-mine') || row.classList.contains('drafted-other')) continue;
    
    var rkCell = row.children[0];
    var rk = parseInt(rkCell ? rkCell.innerText.replace(/Rd\d+/, '').trim() : '0', 10);
    
    if (rk >= nextUserPick) {
      targetRow = row;
      break;
    }
  }

  if (!targetRow) {
    targetRow = rows.find(function(r) {
      return !r.classList.contains('drafted-mine') && !r.classList.contains('drafted-other');
    });
  }

  if (!targetRow) return;

  var marker = document.createElement('tr');
  marker.id = 'next-pick-marker';
  
  var td = document.createElement('td');
  td.colSpan = targetRow.children.length || 6;
  
  var label = picksAway === 0 
    ? '🚨 YOUR PICK IS ON THE CLOCK (Pick #' + nextUserPick + ')' 
    : '🎯 ESTIMATED NEXT PICK: Pick #' + nextUserPick + ' (' + picksAway + ' pick' + (picksAway > 1 ? 's' : '') + ' away)';
    
  td.innerHTML = '<div class="next-pick-line"><span>' + label + '</span></div>';
  marker.appendChild(td);

  targetRow.parentNode.insertBefore(marker, targetRow);
}

function updateScarcityAlerts() { safeCall('updateScarcityAlertsCustom'); }
function addEditControls() { safeCall('addEditControlsCustom'); }

function updatePickSettings() {
  var pcTeams = document.getElementById('pcTeams');
  var pcSlot = document.getElementById('pcSlot');
  var pcRounds = document.getElementById('pcRounds');

  if (pcTeams && pcTeams.value) LEAGUE_SIZE = parseInt(pcTeams.value, 10) || 10;
  if (pcSlot && pcSlot.value) MY_DRAFT_SLOT = parseInt(pcSlot.value, 10) || 10;
  if (pcRounds && pcRounds.value) TOTAL_ROUNDS = parseInt(pcRounds.value, 10) || 16;

  triggerAllBoardUpdates();
  scheduleSave();
}

function jumpTo(id){
  var el = document.getElementById(id);
  if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); }
}

function setPosFilter(pos, btn){
  currentPosFilter = pos;
  document.querySelectorAll('.filterbtn').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  applyFilters();
}

function updateDraftDayDashboard(){
  var container = document.getElementById('draft-day-dashboard');
  if(!container) return;
  
  var draftedCounts = {QB:0, RB:0, WR:0, TE:0, K:0, DST:0};
  var totalByPos = {QB:0, RB:0, WR:0, TE:0, K:0, DST:0};
  
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var pos = row.getAttribute('data-pos');
    if(pos && totalByPos[pos] !== undefined) totalByPos[pos]++;
    if(row.classList.contains('drafted-mine') || row.classList.contains('drafted-other')){
      if(pos && draftedCounts[pos] !== undefined) draftedCounts[pos]++;
    }
  });
  
  var html = '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap:8px;">';
  ['QB','RB','WR','TE','K','DST'].forEach(function(pos){
    var left = totalByPos[pos] - draftedCounts[pos];
    var pct = totalByPos[pos] > 0 ? Math.round((left / totalByPos[pos]) * 100) : 0;
    var urgency = pct > 50 ? 'plenty' : pct > 25 ? 'fair' : pct > 10 ? 'limited' : 'scarce';
    var color = urgency === 'plenty' ? '#5fa87c' : urgency === 'fair' ? '#e0c98a' : urgency === 'limited' ? '#e0a83f' : '#c1554b';
    html += '<div style="background:rgba(255,255,255,0.06); border: 1px solid '+color+'; border-radius:8px; padding:8px; text-align:center;">';
    html += '<div style="font-weight:900; color:'+color+'; font-size:0.9rem;">'+pos+'</div>';
    html += '<div style="font-size:0.75rem; color:#a9c2ab;">'+left+' left</div>';
    html += '<div style="font-size:0.65rem; color:#7d947f;">('+pct+'%)</div>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function triggerAllBoardUpdates() {
  updateMyTeam();
  updateRemaining();
  updateBestAvailable();
  updatePickCounter();
  updateNextPickDisplay();
  updateNextPickMarker();
  updateScarcityAlerts();
  updateRecommendedPick();
  updateDraftDayDashboard();
  addRoundMarkers();
}

function toggleDraft(row){
  if(!row || document.body.classList.contains('edit-mode')) return;

  if(row.classList.contains('drafted-other')){
    // Taken → Mine
    row.classList.remove('drafted-other');
    row.classList.add('drafted-mine');

  } else if(row.classList.contains('drafted-mine')){
    // Mine → Available
    row.classList.remove('drafted-mine');

  } else {
    // Available → Taken
    row.classList.add('drafted-other');
  }

  triggerAllBoardUpdates();
  scheduleSave();
}

function resetBoard(){
  var btn = document.getElementById('resetBtn');
  if(!resetArmed){
    resetArmed = true;
    if(btn) {
      btn.innerText = 'Tap again to confirm';
      btn.classList.add('armed');
    }
    resetArmTimer = setTimeout(function(){
      resetArmed = false;
      if(btn) {
        btn.innerText = 'Reset all';
        btn.classList.remove('armed');
      }
    }, 3000);
    return;
  }
  clearTimeout(resetArmTimer);
  resetArmed = false;
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    row.classList.remove('drafted-mine','drafted-other');
  });
  triggerAllBoardUpdates();
  if(btn) {
    btn.innerText = 'Reset all';
    btn.classList.remove('armed');
  }
  scheduleSave();
}

function saveState(){
  try{
    var state = {};
    document.querySelectorAll('tr.draftrow').forEach(function(row){
      var name = row.getAttribute('data-name');
      if(name) {
        if(row.classList.contains('drafted-mine')) state[name] = 'mine';
        else if(row.classList.contains('drafted-other')) state[name] = 'taken';
      }
    });
    var order = [];
    document.querySelectorAll('tbody.tier-group').forEach(function(tbody){
      var tid = tbody.id.replace('tbody-','');
      tbody.querySelectorAll('tr.draftrow').forEach(function(row){
        var name = row.getAttribute('data-name');
        if(name) order.push({n: name, t: tid});
      });
    });
    var payload = { savedAt: new Date().toISOString(), teams: LEAGUE_SIZE, slot: MY_DRAFT_SLOT, rounds: TOTAL_ROUNDS, state: state, order: order };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    flashSaveIndicator('Saved', '#8fd4a0');
    var diagEl = document.getElementById('storage-diag'); if(diagEl) diagEl.innerHTML = 'Autosave: On (last saved '+ new Date().toLocaleTimeString()+')';
    return true;
  } catch(e){
    console.error('Autosave failed', e);
    flashSaveIndicator('Autosave failed', '#e08a8a');
    var diagEl = document.getElementById('storage-diag'); if(diagEl) diagEl.innerHTML = '<b>Autosave failed.</b>';
    return false;
  }
}

function scheduleSave(){
  if(!isAutosaveEnabled()) return;
  if(_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function(){ saveState(); _saveTimer = null; }, 400);
}

function isAutosaveEnabled(){
  try{
    var val = localStorage.getItem(AUTOSAVE_ENABLED_KEY);
    if(val === null) return true;
    return val === '1';
  }catch(e){ return false; }
}

function setAutosaveEnabled(enabled){
  try{ localStorage.setItem(AUTOSAVE_ENABLED_KEY, enabled ? '1' : '0'); }catch(e){}
  var btn = document.getElementById('autosaveToggle'); if(btn){ btn.classList.toggle('active', enabled); btn.innerText = enabled ? 'Autosave On' : 'Autosave Off'; }
  var diagEl = document.getElementById('storage-diag'); if(diagEl){ diagEl.innerHTML = enabled ? 'Autosave: On' : 'Autosave: Off'; }
}

function toggleAutosave(){
  setAutosaveEnabled(!isAutosaveEnabled());
  var btn = document.getElementById('autosaveToggle');
  if(btn){
    var enabled = isAutosaveEnabled();
    btn.innerText = enabled ? 'Autosave On' : 'Autosave Off';
    btn.style.background = enabled ? 'rgba(95,168,124,0.25)' : 'rgba(193,85,75,0.25)';
    btn.style.borderColor = enabled ? '#5fa87c' : '#c1554b';
  }
}

function loadState(){
  applyTeamColors();
  window.ORIGINAL_ORDER = [];
  document.querySelectorAll('tbody.tier-group').forEach(function(tbody){
    var tid = tbody.id.replace('tbody-','');
    tbody.querySelectorAll('tr.draftrow').forEach(function(row){
      var name = row.getAttribute('data-name');
      if(name) window.ORIGINAL_ORDER.push({n: name, t: tid});
    });
  });

  var enabled = isAutosaveEnabled();
  setAutosaveEnabled(enabled);
  var diagEl = document.getElementById('storage-diag');
  
  try{
    if(enabled){
      var raw = localStorage.getItem(AUTOSAVE_KEY);
      if(raw){
        var payload = JSON.parse(raw);
        var pcTeams = document.getElementById('pcTeams'); if(payload.teams && pcTeams) pcTeams.value = payload.teams;
        var pcSlot = document.getElementById('pcSlot'); if(payload.slot && pcSlot) pcSlot.value = payload.slot;
        var pcRounds = document.getElementById('pcRounds'); if(payload.rounds && pcRounds) pcRounds.value = payload.rounds;
        
        if (pcTeams && pcTeams.value) LEAGUE_SIZE = parseInt(pcTeams.value, 10) || 10;
        if (pcSlot && pcSlot.value) MY_DRAFT_SLOT = parseInt(pcSlot.value, 10) || 10;
        if (pcRounds && pcRounds.value) TOTAL_ROUNDS = parseInt(pcRounds.value, 10) || 16;

        if(payload.order){ applyCustomOrder(payload.order, true); }
        
        if(payload.state) {
          document.querySelectorAll('tr.draftrow').forEach(function(row){
            var name = row.getAttribute('data-name');
            row.classList.remove('drafted-mine','drafted-other');
            if(name && payload.state[name] === 'mine') row.classList.add('drafted-mine');
            else if(name && payload.state[name] === 'taken') row.classList.add('drafted-other');
          });
        }
        if(diagEl) diagEl.innerHTML = 'Autosave: restored backup from '+(payload.savedAt||'previous session');
      } else {
        if(diagEl) diagEl.innerHTML = 'Autosave: No prior backup found.';
      }
    } else {
      if(diagEl) diagEl.innerHTML = 'Autosave is disabled.';
    }
  } catch(e){
    console.error('Restore from autosave failed', e);
    if(diagEl) diagEl.innerHTML = '<b>Autosave restore failed.</b>';
  }
  
  addEditControls();
  triggerAllBoardUpdates();
}

function flashSaveIndicator(text, color){
  var el = document.getElementById('save-indicator');
  if(!el) return;
  el.style.color = color;
  el.innerText = text;
  setTimeout(function(){ el.innerText=''; }, 2000);
}

function syncEditControls(){
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var select = row.querySelector('.rank-controls select');
    if(!select) return;
    var currentTbody = row.closest('tbody.tier-group');
    if(currentTbody){
      select.value = currentTbody.id.replace('tbody-','');
    }
  });
}

// ==== EDIT RANKS ====

function toggleEditMode(){
  var isEditing = document.body.classList.toggle('edit-mode');
  var btn = document.getElementById('editRanksBtn');

  if(btn){
    btn.innerHTML = isEditing
      ? '&#10003; Done Editing'
      : '&#9998; Edit Ranks';

    btn.classList.toggle('editing', isEditing);
  }

  if(isEditing){
    addEditControlsCustom();
  } else {
    document.querySelectorAll('.rank-controls').forEach(function(el){
      el.remove();
    });
  }
}

function addEditControlsCustom(){
  document.querySelectorAll('tr.draftrow').forEach(function(row){

    if(row.querySelector('.rank-controls')) return;

    var playerCell = row.querySelector('.pname');
    if(!playerCell) return;

    var controls = document.createElement('span');
    controls.className = 'rank-controls';

    var upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'rank-move-btn';
    upBtn.innerHTML = '&#9650;';
    upBtn.title = 'Move player up';
    upBtn.onclick = function(e){
      e.stopPropagation();
      moveRowUp(row);
    };

    var downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'rank-move-btn';
    downBtn.innerHTML = '&#9660;';
    downBtn.title = 'Move player down';
    downBtn.onclick = function(e){
      e.stopPropagation();
      moveRowDown(row);
    };

    var select = document.createElement('select');
    select.title = 'Move player to tier';

    TIER_IDS.forEach(function(tierId){
      var option = document.createElement('option');
      option.value = tierId;
      option.textContent = TIER_LABELS[tierId];
      select.appendChild(option);
    });

    var currentTbody = row.closest('tbody.tier-group');
    if(currentTbody){
      select.value = currentTbody.id.replace('tbody-', '');
    }

    select.onchange = function(e){
      e.stopPropagation();
      moveRowToTier(row, select.value);
    };

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    controls.appendChild(select);

    playerCell.appendChild(controls);
  });
}

function moveRowUp(row){
  if(!row || !row.parentElement) return;

  var previous = row.previousElementSibling;

  while(previous && !previous.classList.contains('draftrow')){
    previous = previous.previousElementSibling;
  }

  if(previous){
    row.parentElement.insertBefore(row, previous);
    syncEditControls();
    triggerAllBoardUpdates();
    scheduleSave();
  }
}

function moveRowDown(row){
  if(!row || !row.parentElement) return;

  var next = row.nextElementSibling;

  while(next && !next.classList.contains('draftrow')){
    next = next.nextElementSibling;
  }

  if(next){
    row.parentElement.insertBefore(next, row);
    syncEditControls();
    triggerAllBoardUpdates();
    scheduleSave();
  }
}

function moveRowToTier(row, tierId){
  if(!row) return;

  var targetTbody = document.getElementById('tbody-' + tierId);
  if(!targetTbody) return;

  var currentTbody = row.closest('tbody.tier-group');

  if(currentTbody === targetTbody){
    syncEditControls();
    return;
  }

  // Insert immediately after the tier divider
  var divider = targetTbody.querySelector('.tier-divider-row');

  if(divider){
    divider.after(row);
  } else {
    targetTbody.appendChild(row);
  }

  syncEditControls();
  triggerAllBoardUpdates();
  scheduleSave();
}

function applyCustomOrder(orderArray, skipSave){
  if(!orderArray || !orderArray.length) return;
  var rowMap = {};
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var name = row.getAttribute('data-name');
    if(name) rowMap[name] = row;
  });
  orderArray.forEach(function(entry){
    var row = rowMap[entry.n];
    var targetTbody = document.getElementById('tbody-' + entry.t);
    if(row && targetTbody){
      targetTbody.appendChild(row);
    }
  });
  addEditControls();
  syncEditControls();
  if(!skipSave) {
    triggerAllBoardUpdates();
    scheduleSave();
  }
}

function resetRanks(){
  if(!window.ORIGINAL_ORDER || !window.ORIGINAL_ORDER.length){
    flashSaveIndicator('Nothing to reset', '#e08a8a');
    return;
  }

  applyCustomOrder(window.ORIGINAL_ORDER);

  syncEditControls();

  flashSaveIndicator('Ranks reset', '#8fd4a0');
}

function applyTeamColors(){
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var teamCell = row.children[3];
    if(!teamCell || teamCell.querySelector('.team-dot')) return;
    var teamText = teamCell.childNodes[0] ? teamCell.childNodes[0].textContent.trim() : '';
    var color = TEAM_COLORS[teamText];
    if(color){
      var dot = document.createElement('span');
      dot.className = 'team-dot';
      dot.style.background = color;
      teamCell.insertBefore(dot, teamCell.firstChild);
    }
  });
}

function updateRecommendedPick(){
  var el = document.getElementById('recommended-pick-text');
  if(!el) return;

  var counts = {QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
  document.querySelectorAll('tr.draftrow.drafted-mine').forEach(function(row){
    var pos = row.getAttribute('data-pos');
    if(pos && counts[pos] !== undefined) counts[pos]++;
  });
  var totalDrafted = document.querySelectorAll('tr.draftrow.drafted-mine').length;
  if(totalDrafted === 0){
    el.innerHTML = 'Tap a player to start tracking your team, and I\'ll suggest your best picks here.';
    return;
  }

  var needOrder = [];
  ['QB','RB','WR','TE'].forEach(function(p){
    var startersNeeded = Math.max(0, (ROSTER_SLOTS[p]||0) - (counts[p]||0));
    if(startersNeeded > 0) needOrder.push({type:'starter', pos:p, count:startersNeeded});
  });

  ['QB','RB','WR','TE','K','DST'].forEach(function(p){
    var filledBench = Math.max(0, (counts[p]||0) - (ROSTER_SLOTS[p]||0));
    var benchLeft = (BENCH_SLOTS[p]||0) - filledBench;
    if(benchLeft > 0) needOrder.push({type:'bench', pos:p, count:benchLeft});
  });

  var candidates = [];
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    if(row.classList.contains('drafted-mine') || row.classList.contains('drafted-other')) return;
    var pos = row.getAttribute('data-pos') || 'N/A';
    var rkCell = row.children[0];
    var rawRk = rkCell ? rkCell.innerText.replace(/Rd\d+/, '').trim() : '';
    var rk = parseInt(rawRk, 10) || 9999;
    var nameCell = row.querySelector('.pname');
    var name = nameCell ? nameCell.childNodes[0].textContent.trim() : (row.getAttribute('data-name') || 'Unknown');
    var round = Math.ceil(rk / LEAGUE_SIZE);
    candidates.push({row:row, pos:pos, rk:rk, name:name, round:round});
  });

  var suggested = [];
  for(var i=0; i<candidates.length && suggested.length<3; i++){
    var c = candidates[i];
    var satisfies = false;
    for(var j=0; j<needOrder.length; j++){
      if(needOrder[j].pos === c.pos){ satisfies = true; break; }
    }
    if(needOrder.length === 0 || satisfies){
      suggested.push(c);
    }
  }

  if(suggested.length < 3){
    for(var k=0; k<candidates.length && suggested.length<3; k++){
      var candidate = candidates[k];
      var isAlreadySuggested = suggested.some(function(item){ return item.name === candidate.name; });
      if(!isAlreadySuggested) {
        suggested.push(candidate);
      }
    }
  }

  if(suggested.length === 0){
    el.innerHTML = 'No available players to recommend.';
    return;
  }

  var html = '<div style="text-align:left;">';
  html += '<div style="font-size:0.82rem;color:#a9c2ab;margin-bottom:6px;">Top 3 picks for your roster construction</div>';
  suggested.forEach(function(s, idx){
    var reason = '';
    var startersNeeded = Math.max(0, (ROSTER_SLOTS[s.pos]||0) - (counts[s.pos]||0));
    var filledBench = Math.max(0, (counts[s.pos]||0) - (ROSTER_SLOTS[s.pos]||0));
    var benchLeft = (BENCH_SLOTS[s.pos]||0) - filledBench;
    if(startersNeeded > 0){ reason = 'fills a <b>'+s.pos+'</b> starter need'; }
    else if(benchLeft > 0){ reason = 'good bench fit ('+benchLeft+' slots left)'; }
    else { reason = 'best available'; }
    html += '<div style="padding:6px 8px;border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,0.02);">';
    html += '<div style="font-weight:900;">'+(idx+1)+'. '+s.name+' <span class="pos-pill pos-'+s.pos+'" style="margin-left:8px;">'+s.pos+'</span></div>';
    html += '<div style="font-size:0.72rem;color:#a9c2ab;">#'+s.rk+' overall &middot; Rd'+s.round+' &middot; '+reason+'</div>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function addRoundMarkers(){
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var rkCell = row.children[0];
    if(!rkCell) return;
    var rk = parseInt(rkCell.innerText.replace(/Rd\d+/, '').trim(), 10);
    if(!rk) return;
    var round = Math.ceil(rk / LEAGUE_SIZE);
    var existing = rkCell.querySelector('.round-tag');
    if(existing){
      existing.innerText = 'Rd'+round;
    } else {
      var tag = document.createElement('div');
      tag.className = 'round-tag';
      tag.innerText = 'Rd'+round;
      rkCell.appendChild(tag);
    }
  });
}

function removeExportImportButtons() {
  if (appObserver) appObserver.disconnect();

  var selectors = [
    '#exportBtn', '#importBtn', '#export-panel', '#import-panel',
    '.export-btn', '.import-btn', '.export-toggle', '.import-toggle',
    '[onclick*="Export"]', '[onclick*="import"]', '[onclick*="ExportImport"]',
    '[data-action="export"]', '[data-action="import"]'
  ];

  document.querySelectorAll(selectors.join(',')).forEach(function(el) {
    el.remove();
  });

  document.querySelectorAll('button, a.btn, div.btn').forEach(function(btn) {
    var txt = (btn.innerText || btn.textContent || '').toLowerCase();
    if (txt.includes('export') || txt.includes('import')) {
      btn.remove();
    }
  });

  if (appObserver) {
    appObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function setupSearchUI() {
  var searchInput = document.getElementById('searchBox');
  if (!searchInput) return;

  var parent = searchInput.parentElement;
  var container;
  
  if (!parent.classList.contains('dynamic-search-wrapper')) {
    container = document.createElement('div');
    container.className = 'dynamic-search-wrapper';
    parent.insertBefore(container, searchInput);
    container.appendChild(searchInput);
  } else {
    container = parent;
  }

  if (!document.getElementById('searchMatchCount')) {
    var countSpan = document.createElement('span');
    countSpan.id = 'searchMatchCount';
    countSpan.innerText = '0/0';
    container.appendChild(countSpan);
  }

  if (!document.getElementById('searchPrevBtn')) {
    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.id = 'searchPrevBtn';
    prevBtn.className = 'dyn-navbtn';
    prevBtn.innerHTML = '&#9650;';
    prevBtn.disabled = true;
    prevBtn.onclick = function() { navigateSearch(-1); };
    container.appendChild(prevBtn);
  }

  if (!document.getElementById('searchNextBtn')) {
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.id = 'searchNextBtn';
    nextBtn.className = 'dyn-navbtn';
    nextBtn.innerHTML = '&#9660;';
    nextBtn.disabled = true;
    nextBtn.onclick = function() { navigateSearch(1); };
    container.appendChild(nextBtn);
  }

  searchInput.oninput = applyFilters;
}

function applyFilters() {
  var searchInput = document.getElementById('searchBox');
  var countEl = document.getElementById('searchMatchCount');
  var prevBtn = document.getElementById('searchPrevBtn');
  var nextBtn = document.getElementById('searchNextBtn');

  document.querySelectorAll('tr.draftrow').forEach(function(row) {
    row.classList.remove('search-highlight');
    var pos = row.getAttribute('data-pos');
    var matchesPos = (typeof currentPosFilter === 'undefined' || currentPosFilter === 'ALL' || pos === currentPosFilter);
    if (matchesPos) {
      row.classList.remove('hidden-row');
    } else {
      row.classList.add('hidden-row');
    }
  });

  searchMatches = [];
  currentSearchIndex = -1;

  if (!searchInput) return;
  var q = searchInput.value.toLowerCase().trim();

  if (q.length < 2) {
    if (countEl) countEl.innerText = '0/0';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    updateNextPickMarker();
    return;
  }

  var rows = document.querySelectorAll('tr.draftrow:not(.hidden-row)');
  rows.forEach(function(row) {
    var name = (row.getAttribute('data-name') || row.innerText || '').toLowerCase();
    if (name.indexOf(q) !== -1) {
      searchMatches.push(row);
    }
  });

  if (searchMatches.length > 0) {
    currentSearchIndex = 0;
    if (countEl) countEl.innerText = '1/' + searchMatches.length;
    if (prevBtn) prevBtn.disabled = (searchMatches.length <= 1);
    if (nextBtn) nextBtn.disabled = (searchMatches.length <= 1);
    scrollToCurrentMatch();
  } else {
    if (countEl) countEl.innerText = '0/0';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  }

  updateNextPickMarker();
}

function navigateSearch(direction) {
  if (searchMatches.length <= 1) return;

  currentSearchIndex = (currentSearchIndex + direction + searchMatches.length) % searchMatches.length;

  var countEl = document.getElementById('searchMatchCount');
  if (countEl) {
    countEl.innerText = (currentSearchIndex + 1) + '/' + searchMatches.length;
  }

  scrollToCurrentMatch();
}

function scrollToCurrentMatch() {
  if (currentSearchIndex < 0 || currentSearchIndex >= searchMatches.length) return;

  var targetRow = searchMatches[currentSearchIndex];
  if (!targetRow || !document.body.contains(targetRow)) {
    searchMatches.splice(currentSearchIndex, 1);
    if (searchMatches.length === 0) {
      currentSearchIndex = -1;
      return;
    }
    currentSearchIndex = currentSearchIndex % searchMatches.length;
    targetRow = searchMatches[currentSearchIndex];
  }

  if (!targetRow) return;

  searchMatches.forEach(function(row) {
    row.classList.remove('search-highlight');
  });

  var headerOffset = 130;
  var elementPosition = targetRow.getBoundingClientRect().top + window.pageYOffset;
  var offsetPosition = elementPosition - headerOffset;

  window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth'
  });

  targetRow.classList.add('search-highlight');
  setTimeout(function() {
    targetRow.classList.remove('search-highlight');
  }, 2500);
}

// ==== INITIALIZATION RUNNER ====
function initApp() {
  setupSearchUI();
  
  ['pcTeams', 'pcSlot', 'pcRounds'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', updatePickSettings);
      el.addEventListener('input', updatePickSettings);
    }
  });

  loadState();
}

// ==== SINGLE DOM READY LISTENER ====
document.addEventListener('DOMContentLoaded', function() {
  
  // 1. Initialize core application state safely
  try {
    initApp();
  } catch (err) {
    console.error("Initialization failed inside initApp():", err);
  }

  // 2. Safely clean buttons once without MutationObserver loops
  removeExportImportButtons();

  });
  
  /* =========================================================
   DRAFT ASSISTANT — STAGE 1 DATA LAYER
   ========================================================= */

function getDraftAssistantState() {
  var teams = parseInt(document.getElementById('pcTeams')?.value) || 10;
  var rounds = parseInt(document.getElementById('pcRounds')?.value) || 16;
  var draftSlot = parseInt(document.getElementById('pcSlot')?.value) || 1;

  var totalPicks = teams * rounds;

  /*
   * Find the current overall pick from the existing draft counter.
   * If the existing function/state is available, use it.
   */
  var completedPicks = document.querySelectorAll(
  'tr.draftrow.drafted-mine, tr.draftrow.drafted-other'
).length;

var currentPick = Math.min(
  completedPicks + 1,
  totalPicks
);

  /*
   * Determine the user's picks using snake-draft logic.
   */
  var myPicks = [];

  for (var round = 1; round <= rounds; round++) {
    var pickInRound;

    if (round % 2 === 1) {
      pickInRound = draftSlot;
    } else {
      pickInRound = teams - draftSlot + 1;
    }

    myPicks.push((round - 1) * teams + pickInRound);
  }

  var myNextPick = null;

  for (var i = 0; i < myPicks.length; i++) {
    if (myPicks[i] >= currentPick) {
      myNextPick = myPicks[i];
      break;
    }
  }

  var picksUntilMyTurn =
    myNextPick === null ? null : myNextPick - currentPick;

  return {
    teams: teams,
    rounds: rounds,
    draftSlot: draftSlot,
    totalPicks: totalPicks,
    currentPick: currentPick,
    myNextPick: myNextPick,
    picksUntilMyTurn: picksUntilMyTurn,
    onClock: picksUntilMyTurn === 0,
    myPicks: myPicks
  };
}


/* ---------------------------------------------------------
   ROSTER STATE
   --------------------------------------------------------- */

function getDraftAssistantRosterState() {
  var counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  document.querySelectorAll(
    'tr.draftrow.drafted-mine'
  ).forEach(function(row) {

    var pos = row.getAttribute('data-pos');

    if (counts[pos] !== undefined) {
      counts[pos]++;
    }
  });

  var required = {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    K: 1,
    DST: 1
  };

  var needs = {};

  Object.keys(required).forEach(function(pos) {
    needs[pos] = counts[pos] < required[pos];
  });

  /*
   * FLEX logic:
   *
   * FLEX requires ONE additional RB/WR/TE beyond
   * the normal 2 RB / 2 WR / 1 TE starting requirements.
   *
   * Therefore:
   *
   * 2 RB + 2 WR + 1 TE = FLEX filled
   *
   * 2 RB + 1 WR + 1 TE = FLEX still open
   */
  var flexEligiblePlayers =
    counts.RB + counts.WR + counts.TE;

  var requiredFlexEligiblePlayers = 5;

  needs.FLEX =
    flexEligiblePlayers < requiredFlexEligiblePlayers;

  return {
    counts: counts,
    required: required,
    needs: needs,
    flexEligiblePlayers: flexEligiblePlayers,
    requiredFlexEligiblePlayers: requiredFlexEligiblePlayers
  };
}


/* ---------------------------------------------------------
   AVAILABLE PLAYERS
   --------------------------------------------------------- */

function getDraftAssistantPlayers() {
  var players = [];

  document.querySelectorAll('tr.draftrow').forEach(function(row) {

    var status = 'available';

    if (row.classList.contains('drafted-mine')) {
  status = 'mine';
} else if (row.classList.contains('drafted-other')) {
  status = 'taken';
}

    /*
     * Get player name and position from the existing row.
     */
    var name =
      row.getAttribute('data-name') ||
      row.querySelector('.player-name')?.textContent?.trim() ||
      'Unknown Player';

    var position =
      row.getAttribute('data-pos') ||
      '';

    /*
     * Rank is taken from the existing row rather than
     * creating a second ranking database.
     */
    var rankText =
      row.getAttribute('data-rank') ||
      row.querySelector('.rank')?.textContent ||
      row.cells[0]?.textContent ||
      '';

    var rank = parseInt(
      String(rankText).replace(/[^\d]/g, '')
    );

    /*
     * Tier comes from the existing tier class when available.
     */
    var tier = '';

    row.classList.forEach(function(className) {
      if (className.indexOf('tier-') === 0) {
        tier = className.replace('tier-', '');
      }
    });

    players.push({
      row: row,
      name: name,
      position: position,
      rank: isNaN(rank) ? null : rank,
      tier: tier,
      status: status,
      available: status === 'available'
    });
  });

  return players;
}


/* ---------------------------------------------------------
   PHONE-FRIENDLY DEBUG PANEL
   --------------------------------------------------------- */

function debugDraftAssistant() {
  var draft = getDraftAssistantState();
  var roster = getDraftAssistantRosterState();
  var players = getDraftAssistantPlayers();

  var availablePlayers = players.filter(function(player) {
    return player.available;
  });

  var panel = document.getElementById(
    'draft-assistant-debug-panel'
  );

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'draft-assistant-debug-panel';

    panel.style.cssText =
      'position:fixed;' +
      'left:10px;' +
      'right:10px;' +
      'bottom:10px;' +
      'z-index:99999;' +
      'background:#111;' +
      'color:#fff;' +
      'padding:16px;' +
      'border-radius:12px;' +
      'font-family:Arial,sans-serif;' +
      'font-size:14px;' +
      'line-height:1.5;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.4);' +
      'max-height:80vh;' +
      'overflow:auto;';

    document.body.appendChild(panel);
  }

  var flexStatus =
    roster.needs.FLEX
      ? 'OPEN'
      : 'FILLED';

  var clockStatus =
    draft.onClock
      ? 'YES'
      : 'NO';

  panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<strong style="font-size:18px;">🧪 Draft Assistant Debug</strong>' +
      '<button onclick="document.getElementById(\'draft-assistant-debug-panel\').remove()" ' +
      'style="background:none;border:0;color:white;font-size:24px;">&times;</button>' +
    '</div>' +

    '<hr>' +

    '<strong>Draft State</strong><br>' +
    'Teams: ' + draft.teams + '<br>' +
    'Rounds: ' + draft.rounds + '<br>' +
    'Draft Slot: ' + draft.draftSlot + '<br>' +
    'Total Picks: ' + draft.totalPicks + '<br>' +
    'Current Pick: ' + draft.currentPick + '<br>' +
    'My Next Pick: ' + (draft.myNextPick ?? 'None') + '<br>' +
    'Picks Until My Turn: ' +
      (draft.picksUntilMyTurn ?? 'None') + '<br>' +
    'On Clock: <strong>' + clockStatus + '</strong>' +

    '<hr>' +

    '<strong>Roster</strong><br>' +
    'QB: ' + roster.counts.QB + '/1<br>' +
    'RB: ' + roster.counts.RB + '/2<br>' +
    'WR: ' + roster.counts.WR + '/2<br>' +
    'TE: ' + roster.counts.TE + '/1<br>' +
    'FLEX: <strong>' + flexStatus + '</strong><br>' +
    'K: ' + roster.counts.K + '/1<br>' +
    'DST: ' + roster.counts.DST + '/1' +

    '<hr>' +

    '<strong>Players</strong><br>' +
    'Total Player Rows: ' + players.length + '<br>' +
    'Available: ' + availablePlayers.length + '<br>' +
    'Mine: ' +
      players.filter(function(p) {
        return p.status === 'mine';
      }).length + '<br>' +
    'Taken: ' +
      players.filter(function(p) {
        return p.status === 'taken';
      }).length;
}