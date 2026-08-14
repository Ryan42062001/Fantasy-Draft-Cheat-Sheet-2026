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

function syncRankData(){

  var overallRank = 1;

  var positionRanks = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  document.querySelectorAll('tbody.tier-group').forEach(function(tbody){

    tbody.querySelectorAll('tr.draftrow').forEach(function(row){

      var position =
        row.getAttribute('data-pos');

      /*
       * Update overall rank.
       */
      row.setAttribute(
        'data-rank',
        String(overallRank)
      );

      /*
       * Update visible overall rank.
       */
      var rankCell = row.children[0];

      if(rankCell){

        var roundTag =
          rankCell.querySelector('.round-tag');

        rankCell.textContent =
          String(overallRank);

        if(roundTag){
          rankCell.appendChild(roundTag);
        }
      }

      /*
       * Update positional rank.
       */
      if(positionRanks[position] !== undefined){

        positionRanks[position]++;

        var posRank =
          positionRanks[position];

        var posRankLabel =
          row.querySelector('.posrk');

        if(posRankLabel){

  posRankLabel.textContent =
  position + posRank;
}
      }

      overallRank++;

    });

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

  syncRankData();
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

  syncRankData();
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

syncRankData();
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

syncRankData();
addEditControls();
syncEditControls();
  if(!skipSave) {
    triggerAllBoardUpdates();
    scheduleSave();
  }
}

function resetRanks(){

  if(!confirm(
    'Reset all custom player rankings?\n\n' +
    'This will undo ALL of your manual rank and tier adjustments.\n\n' +
    'Your player draft/taken status will not be affected.'
  )){
    return;
  }

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
    var rankText = row.getAttribute('data-rank') || '';

if (!rankText) {
  var rankCell = row.children[0];

  if (rankCell) {
    var rankClone = rankCell.cloneNode(true);

    // Remove the round marker that our existing code adds.
    var roundTag = rankClone.querySelector('.round-tag');

    if (roundTag) {
      roundTag.remove();
    }

    rankText = rankClone.textContent || '';
  }
}

var rankMatch = String(rankText).match(/\d+/);
var rank = rankMatch ? parseInt(rankMatch[0], 10) : null;

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

/* =========================================================
   DRAFT ASSISTANT — STAGE 2
   FANTASY VORP + POSITIONAL SCARCITY
   ========================================================= */

/*
 * Positions that matter for the core VORP calculation.
 *
 * K and DST are intentionally excluded for now.
 * We'll give them separate late-round logic later.
 */
var VORP_POSITIONS = ['QB', 'RB', 'WR', 'TE'];


/*
 * Get current league settings.
 */
function getVorpLeagueSettings() {

  var teams =
    parseInt(document.getElementById('pcTeams')?.value) || 10;

  return {
    teams: teams,

    rounds:
      parseInt(document.getElementById('pcRounds')?.value) || 16,

    draftSlot:
      parseInt(document.getElementById('pcSlot')?.value) || 1,

    QB: teams * 1,
    RB: teams * 2,
    WR: teams * 2,
    TE: teams * 1,

    FLEX: teams * 1
  };
}


/*
 * Return only available QB/RB/WR/TE players.
 */
function getAvailableVorpPlayers(players) {

  return players
    .filter(function(player) {

      return player.available &&
        VORP_POSITIONS.includes(player.position) &&
        player.rank;
    })
    .sort(function(a, b) {

      return a.rank - b.rank;
    });
}


/*
 * Get available players at one position.
 */
function getAvailableAtPosition(players, position) {

  return players
    .filter(function(player) {

      return player.available &&
        player.position === position &&
        player.rank;
    })
    .sort(function(a, b) {

      return a.rank - b.rank;
    });
}


/*
 * Calculate the FLEX replacement pool.
 *
 * FLEX can be RB / WR / TE.
 *
 * IMPORTANT:
 * We don't simply call the 10th-best player
 * the FLEX replacement.
 *
 * We first account for the dedicated position
 * requirements and then look at the remaining
 * RB/WR/TE pool.
 */
function calculateFlexPool(players, settings) {

  var rb =
    getAvailableAtPosition(players, 'RB');

  var wr =
    getAvailableAtPosition(players, 'WR');

  var te =
    getAvailableAtPosition(players, 'TE');

  /*
   * Remove the players needed to fill dedicated
   * RB / WR / TE starting spots.
   */
  var remainingRB =
    rb.slice(settings.RB);

  var remainingWR =
    wr.slice(settings.WR);

  var remainingTE =
    te.slice(settings.TE);

  var flexPool =
    remainingRB
      .concat(remainingWR)
      .concat(remainingTE)
      .sort(function(a, b) {

        return a.rank - b.rank;
      });

  return flexPool;
}


/*
 * Calculate replacement players.
 */
function calculateReplacementLevels(players) {

  var settings =
    getVorpLeagueSettings();

  var draftState =
    getDraftAssistantState();

  /*
   * -------------------------------------------------------
   * DRAFT-AWARE REPLACEMENT LEVELS
   * -------------------------------------------------------
   *
   * Instead of using a fixed roster-count replacement
   * player, estimate who would realistically remain by
   * the time we pick again.
   *
   * Example:
   *
   * Current pick = 25
   * My next pick = 32
   *
   * There are 7 picks before I select again.
   *
   * We therefore project that the best ~7 currently
   * available players may disappear before our next pick.
   */

  var picksUntilMyTurn =
    Number(
      draftState.picksUntilMyTurn
    ) || 0;


  /*
   * Build position pools.
   */

  var positionPools = {};

  ['QB', 'RB', 'WR', 'TE'].forEach(function(position) {

    positionPools[position] =
      players
        .filter(function(player) {

          return player &&
            player.available &&
            player.position === position &&
            player.rank !== undefined &&
            player.rank !== null &&
            player.rank !== '';

        })
        .slice()
        .sort(function(a, b) {

          return Number(a.rank) -
                 Number(b.rank);

        });

  });


  /*
   * -------------------------------------------------------
   * PROJECTED AVAILABLE POOL
   * -------------------------------------------------------
   *
   * We don't know exactly which players opponents will
   * select, so use overall ranking as the baseline
   * projection.
   *
   * We remove the highest-ranked currently available
   * players equal to the number of picks before our next
   * selection.
   */

  var projectedPlayers =
    players
      .filter(function(player) {

        return player &&
          player.available &&
          VORP_POSITIONS.includes(
            player.position
          ) &&
          player.rank !== undefined &&
          player.rank !== null &&
          player.rank !== '';

      })
      .slice()
      .sort(function(a, b) {

        return Number(a.rank) -
               Number(b.rank);

      });


  /*
   * Do not remove the entire pool.
   *
   * This is only a projection of the players most
   * likely to disappear before our next pick.
   */
  var projectedGoneCount =
    Math.min(
      picksUntilMyTurn,
      projectedPlayers.length
    );


  var projectedGone =
    projectedPlayers.slice(
      0,
      projectedGoneCount
    );


  /*
   * Build a quick lookup of projected players
   * who are expected to disappear.
   */

  var projectedGoneNames = {};

  projectedGone.forEach(function(player) {

    projectedGoneNames[
      String(player.name).toLowerCase()
    ] = true;

  });


  /*
   * Build replacement pools after the projected
   * upcoming picks.
   */

  var projectedPositionPools = {};

  ['QB', 'RB', 'WR', 'TE'].forEach(function(position) {

    projectedPositionPools[position] =
      positionPools[position]
        .filter(function(player) {

          return !projectedGoneNames[
            String(player.name).toLowerCase()
          ];

        });

  });


  /*
   * -------------------------------------------------------
   * DEDICATED POSITION REPLACEMENTS
   * -------------------------------------------------------
   *
   * The replacement player is now the best player
   * projected to remain at that position after our
   * next selection window.
   */

  var replacement = {};

  ['QB', 'RB', 'WR', 'TE'].forEach(function(position) {

    var pool =
      projectedPositionPools[position];

    replacement[position] =
      pool[0] || null;

  });


  /*
   * -------------------------------------------------------
   * FLEX REPLACEMENT
   * -------------------------------------------------------
   *
   * FLEX can be RB / WR / TE.
   *
   * Combine those positions and select the best
   * projected remaining player.
   */

  var flexPool = [];

  ['RB', 'WR', 'TE'].forEach(function(position) {

    flexPool =
      flexPool.concat(
        projectedPositionPools[position]
      );

  });


  flexPool.sort(function(a, b) {

    return Number(a.rank) -
           Number(b.rank);

  });


  replacement.FLEX =
    flexPool[0] || null;


  /*
   * -------------------------------------------------------
   * DEBUG
   * -------------------------------------------------------
   */

  console.log(
    'DRAFT-AWARE REPLACEMENT LEVELS:',
    {
      currentPick:
        draftState.currentPick,

      nextPick:
        draftState.myNextPick,

      picksUntilMyTurn:
        picksUntilMyTurn,

      replacements:
        {
          QB:
            replacement.QB &&
            replacement.QB.name,

          RB:
            replacement.RB &&
            replacement.RB.name,

          WR:
            replacement.WR &&
            replacement.WR.name,

          TE:
            replacement.TE &&
            replacement.TE.name,

          FLEX:
            replacement.FLEX &&
            replacement.FLEX.name
        }
    }
  );


  return replacement;
}

/*
 * =========================================================
 * REFINED POSITION REPLACEMENT QUALITY
 * =========================================================
 *
 * Prevents extreme replacement gaps from creating
 * unrealistic VORP values.
 *
 * The goal is to identify the next realistic fantasy-
 * relevant player at the position rather than simply
 * using the first available player far down the board.
 */

function calculateRefinedReplacementRank(
  player,
  players,
  context
){

  if(!player || !Array.isArray(players)){
    return 999;
  }

  var position =
    player.position ||
    player.pos ||
    'N/A';

  var playerRank =
    Number(
      player.rank ||
      player.rk ||
      999
    );

  /*
   * -------------------------------------------------------
   * 1. GET AVAILABLE PLAYERS AT POSITION
   * -------------------------------------------------------
   */

  var positionPlayers =
    players
      .filter(function(p){

        if(!p) return false;

        var pPosition =
          p.position ||
          p.pos ||
          'N/A';

        if(pPosition !== position){
          return false;
        }

        /*
         * Ignore players already drafted.
         */
        if(p.available === false){
          return false;
        }

        var rank =
          Number(
            p.rank ||
            p.rk ||
            999
          );

        return rank > playerRank;

      })
      .sort(function(a,b){

        return (
          Number(a.rank || a.rk || 999) -
          Number(b.rank || b.rk || 999)
        );

      });

  if(!positionPlayers.length){
    return 999;
  }

  /*
   * -------------------------------------------------------
   * 2. POSITION-SPECIFIC REALISTIC WINDOW
   * -------------------------------------------------------
   *
   * We don't want a TE ranked #112 to become the
   * replacement for a TE ranked #15 simply because
   * there are no other available TEs nearby.
   *
   * Different positions have different replacement
   * behavior.
   */

  var maxGap = 40;

  if(position === 'QB'){
    maxGap = 50;
  }

  if(position === 'RB'){
    maxGap = 45;
  }

  if(position === 'WR'){
    maxGap = 50;
  }

  if(position === 'TE'){
    maxGap = 55;
  }

  /*
   * -------------------------------------------------------
   * 3. FIND REALISTIC REPLACEMENT
   * -------------------------------------------------------
   */

  var realisticReplacement =
    positionPlayers.find(function(p){

      var rank =
        Number(
          p.rank ||
          p.rk ||
          999
        );

      return (
        rank - playerRank <= maxGap
      );

    });

  /*
   * If there is no player inside the realistic
   * window, use a capped fallback rather than
   * allowing an enormous replacement gap.
   */

  if(realisticReplacement){

    return Number(
      realisticReplacement.rank ||
      realisticReplacement.rk ||
      999
    );

  }

  return playerRank + maxGap;
}

/*
 * Find the effective replacement player for
 * a RB / WR / TE.
 *
 * A RB/WR/TE can be replaced through either:
 *
 * 1. Their dedicated position
 * 2. FLEX
 */

function getEffectiveReplacement(
  player,
  replacements
) {

  if (!player || !replacements) {
    return null;
  }

  var position =
    player.position ||
    player.pos ||
    null;

  /*
   * -------------------------------------------------------
   * POSITION-SPECIFIC REPLACEMENT
   * -------------------------------------------------------
   *
   * VORP and positional scarcity should compare a player
   * against the replacement level at HIS position.
   *
   * FLEX is intentionally NOT used here.
   *
   * Example:
   *
   * Brock Bowers (TE)
   *      ↓
   * TE replacement
   *
   * NOT:
   *
   * Brock Bowers (TE)
   *      ↓
   * Rhamondre Stevenson (RB)
   *
   * FLEX value will be handled separately by the
   * Decision Engine.
   */

  if (
    position === 'QB' ||
    position === 'RB' ||
    position === 'WR' ||
    position === 'TE'
  ) {

    return (
      replacements[position] ||
      null
    );

  }

  return null;
}

function calculateTierCliffOpportunity(player, context){

  if(!player || !context || !context.tierCliffs){
    return 0;
  }

  var position =
    player.position ||
    player.pos ||
    'N/A';

  var cliff =
    context.tierCliffs[position];

  /*
   * No meaningful cliff at this position.
   */
  if(!cliff ||
     !cliff.beforePlayer ||
     !cliff.afterPlayer){

    return 0;
  }

  /*
   * Only meaningful cliffs should create
   * draft urgency.
   */
  if(cliff.severity !== 'HIGH' &&
     cliff.severity !== 'MODERATE'){

    return 0;
  }

  /*
   * Only reward the player who is actually
   * sitting immediately above the cliff.
   */
  var cliffPlayer =
    cliff.beforePlayer;

  if(!cliffPlayer ||
     player.name !== cliffPlayer.name){

    return 0;
  }

  /*
   * Stronger cliffs receive a larger bonus.
   *
   * HIGH     = +5
   * MODERATE = +3
   */
  if(cliff.severity === 'HIGH'){
    return 5;
  }

  if(cliff.severity === 'MODERATE'){
    return 3;
  }

  return 0;
}

/*
 * Calculate positional VORP.
 *
 * Lower rank = better player.
 *
 * VORP is based on the gap between the player's
 * rank and his effective replacement player.
 */
function calculateFantasyVorp(
  player,
  replacement
) {

  if (!player || !player.rank) {
    return 0;
  }

  /*
   * Base player value.
   *
   * Overall rank is our primary indication of
   * how good the player actually is.
   *
   * The curve is intentionally nonlinear so
   * elite players receive more separation.
   */
  var rank =
    Number(player.rank);

  var baseValue =
    100 / Math.sqrt(rank);


  /*
   * Replacement value.
   *
   * This tells us how much value is available
   * at the position later in the draft.
   */
  var replacementValue = 0;

  if (replacement && replacement.rank) {

    replacementValue =
      100 / Math.sqrt(
        Number(replacement.rank)
      );
  }


  /*
   * Positional advantage.
   *
   * This is the actual VORP component.
   */
  var positionalAdvantage =
    Math.max(
      0,
      baseValue - replacementValue
    );


  /*
   * Convert to a useful fantasy scale.
   *
   * We intentionally DO NOT cap this at 100.
   *
   * Elite players should be separated from
   * merely good players.
   */
  var vorp =
    positionalAdvantage * 10;


  /*
   * Small premium for extremely highly ranked
   * players.
   *
   * This prevents an elite overall player from
   * being buried simply because his position
   * has depth.
   */
  if (rank <= 5) {

    vorp += 15;

  } else if (rank <= 10) {

    vorp += 10;

  } else if (rank <= 20) {

    vorp += 5;
  }


  return vorp;
}

/*
 * Calculate tier/drop-off information.
 *
 * This uses the existing tier information from
 * the player's row whenever available.
 */
function calculateTierDrop(
  player,
  players
) {

  if (!player || !player.rank) {
    return {
      score: 0,
      nextPlayer: null,
      rankGap: 0
    };
  }

  var samePosition =
    players
      .filter(function(p) {

        return p.available &&
          p.position === player.position &&
          p.rank &&
          p.rank > player.rank;
      })
      .sort(function(a, b) {

        return a.rank - b.rank;
      });

  var nextPlayer =
    samePosition[0] || null;

  if (!nextPlayer) {
    return {
      score: 100,
      nextPlayer: null,
      rankGap: 0
    };
  }

  var rankGap =
    nextPlayer.rank - player.rank;

  /*
   * A larger gap means a larger drop-off.
   */
  var score =
    Math.min(
      100,
      rankGap * 10
    );

  return {
    score: score,
    nextPlayer: nextPlayer,
    rankGap: rankGap
  };
}

function calculatePositionTierCliff(
  position,
  players,
  vorpProfiles
) {

  if (!position || !players) {
    return {
      position: position || 'N/A',
      severity: 'NONE',
      cliffScore: 0,
      beforePlayer: null,
      afterPlayer: null,
      fromTier: null,
      toTier: null,
      tierGap: 0,
      rankGap: 0,
      playersBeforeCliff: 0,
      playersAfterCliff: 0
    };
  }


  /*
   * -------------------------------------------------------
   * GET AVAILABLE PLAYERS AT THIS POSITION
   * -------------------------------------------------------
   */

  var positionPlayers =
    players
      .filter(function(player) {

        return player &&
          player.available &&
          player.position === position &&
          player.rank;

      })
      .sort(function(a, b) {

        return (
          Number(a.rank) || 9999
        ) -
        (
          Number(b.rank) || 9999
        );

      });


  /*
   * Only examine the top available players.
   *
   * This keeps distant late-round tier changes
   * from becoming the most important cliff.
   */

  var LOOKAHEAD = 12;

  positionPlayers =
    positionPlayers.slice(
      0,
      LOOKAHEAD
    );


  if (positionPlayers.length < 2) {

    return {
      position: position,
      severity: 'NONE',
      cliffScore: 0,
      beforePlayer: null,
      afterPlayer: null,
      fromTier: null,
      toTier: null,
      tierGap: 0,
      rankGap: 0,
      playersBeforeCliff: 0,
      playersAfterCliff: 0
    };

  }


  /*
   * -------------------------------------------------------
   * GET TIER VALUE
   * -------------------------------------------------------
   *
   * Use the same tier system already used by
   * the Decision Engine.
   */

  var tierRank = {

    'Sp': 0,
    'S': 1,
    'A': 2,
    'B': 3,
    'C': 4,
    'D': 5,
    'F': 6

  };


  function getTierId(player) {

    try {

      var tier =
        getPlayerTierValue(
          player
        );

      if (tier && tier.id) {

        return tier.id;

      }

    } catch (e) {}

    return (
      player.tier ||
      null
    );

  }


  /*
   * -------------------------------------------------------
   * FIND TIER TRANSITIONS
   * -------------------------------------------------------
   *
   * A tier cliff only exists when the actual
   * player tier changes.
   */

  var cliffs = [];


  for (
    var i = 0;
    i < positionPlayers.length - 1;
    i++
  ) {

    var beforePlayer =
      positionPlayers[i];

    var afterPlayer =
      positionPlayers[i + 1];


    var fromTier =
      getTierId(
        beforePlayer
      );

    var toTier =
      getTierId(
        afterPlayer
      );


    /*
     * If we cannot determine either tier,
     * don't guess.
     */

    if (
      !fromTier ||
      !toTier
    ) {

      continue;

    }


    /*
     * Same tier = no cliff.
     */

    if (
      fromTier === toTier
    ) {

      continue;

    }


    var fromValue =
      tierRank[fromTier];

    var toValue =
      tierRank[toTier];


    /*
     * Ignore unknown tier IDs.
     */

    if (
      fromValue === undefined ||
      toValue === undefined
    ) {

      continue;

    }


    /*
     * We only care about a DROP in quality.
     *
     * Example:
     *
     * A → B = real cliff
     *
     * B → A = not a cliff
     */

    var tierGap =
      toValue - fromValue;


    if (tierGap <= 0) {

      continue;

    }


    var rankGap =
      (
        Number(afterPlayer.rank) || 0
      ) -
      (
        Number(beforePlayer.rank) || 0
      );


    cliffs.push({

      beforePlayer:
        beforePlayer,

      afterPlayer:
        afterPlayer,

      fromTier:
        fromTier,

      toTier:
        toTier,

      tierGap:
        tierGap,

      rankGap:
        rankGap,

      index:
        i

    });

  }


  /*
   * -------------------------------------------------------
   * NO TIER CLIFF
   * -------------------------------------------------------
   */

  if (!cliffs.length) {

    return {
      position: position,
      severity: 'NONE',
      cliffScore: 0,
      beforePlayer: null,
      afterPlayer: null,
      fromTier: null,
      toTier: null,
      tierGap: 0,
      rankGap: 0,
      playersBeforeCliff: 0,
      playersAfterCliff: 0
    };

  }


  /*
   * -------------------------------------------------------
   * SCORE EACH TIER CLIFF
   * -------------------------------------------------------
   *
   * We care about three things:
   *
   * 1. How many tiers did we fall?
   * 2. How large is the rank gap?
   * 3. How early is the cliff?
   *
   * The earlier cliff gets additional importance.
   */

  cliffs.forEach(function(cliff) {

    var tierScore =
      Math.min(
        60,
        cliff.tierGap * 30
      );


    var rankScore =
      Math.min(
        25,
        Math.max(
          0,
          cliff.rankGap * 2
        )
      );


    /*
     * Earlier cliffs matter more.
     *
     * The first available transition gets
     * the strongest opportunity multiplier.
     */

    var positionMultiplier =
      Math.max(
        0.5,
        1 -
        (
          cliff.index * 0.08
        )
      );


    cliff.cliffScore =
      Math.min(
        100,
        (
          tierScore +
          rankScore
        ) *
        positionMultiplier
      );

  });


  /*
   * -------------------------------------------------------
   * SELECT THE MOST IMPORTANT CLIFF
   * -------------------------------------------------------
   */

  cliffs.sort(function(a, b) {

    return (
      b.cliffScore -
      a.cliffScore
    );

  });


  var selectedCliff =
    cliffs[0];


  /*
   * -------------------------------------------------------
   * COUNT PLAYERS AROUND CLIFF
   * -------------------------------------------------------
   */

  var playersBeforeCliff =
    selectedCliff.index + 1;

  var playersAfterCliff =
    positionPlayers.length -
    playersBeforeCliff;


  /*
   * -------------------------------------------------------
   * SEVERITY
   * -------------------------------------------------------
   */

  var severity =
    'LOW';


  if (
    selectedCliff.cliffScore >= 70
  ) {

    severity =
      'HIGH';

  } else if (
    selectedCliff.cliffScore >= 40
  ) {

    severity =
      'MODERATE';

  }


  /*
   * -------------------------------------------------------
   * DEBUG
   * -------------------------------------------------------
   */

  console.log(
    'POSITION TIER CLIFF:',
    position,
    'before =',
    selectedCliff.beforePlayer.name,
    'tier =',
    selectedCliff.fromTier,
    'after =',
    selectedCliff.afterPlayer.name,
    'tier =',
    selectedCliff.toTier,
    'tierGap =',
    selectedCliff.tierGap,
    'rankGap =',
    selectedCliff.rankGap,
    'score =',
    selectedCliff.cliffScore,
    'severity =',
    severity
  );


  return {

    position:
      position,

    severity:
      severity,

    cliffScore:
      selectedCliff.cliffScore,

    beforePlayer:
      selectedCliff.beforePlayer,

    afterPlayer:
      selectedCliff.afterPlayer,

    fromTier:
      selectedCliff.fromTier,

    toTier:
      selectedCliff.toTier,

    tierGap:
      selectedCliff.tierGap,

    rankGap:
      selectedCliff.rankGap,

    playersBeforeCliff:
      playersBeforeCliff,

    playersAfterCliff:
      playersAfterCliff

  };

}

/*
 * Calculate positional scarcity.
 *
 * This looks at how many usable players remain
 * before the replacement level.
 */
function calculatePositionScarcity(
  player,
  players,
  replacements
) {

  console.log(
  'SCARCITY INPUT:',
  player.name,
  'rank =',
  player.rank,
  'position =',
  player.position || player.pos
);

  if (!player || !player.rank) {
    return 0;
  }

  var replacement =
    getEffectiveReplacement(
      player,
      replacements
    );

  console.log(
  'SCARCITY REPLACEMENT:',
  player.name,
  replacement
);

  if (!replacement) {
    return 0;
  }

  var gap =
    replacement.rank - player.rank;

  console.log(
  'SCARCITY CALC:',
  player.name,
  'replacement.rank =',
  replacement.rank,
  'player.rank =',
  player.rank,
  'gap =',
  gap,
  'result =',
  Math.min(100, Math.max(0, gap * 2))
);

  /*
   * Larger gap = greater scarcity/value.
   */
  return Math.min(
    100,
    Math.max(
      0,
      gap * 2
    )
  );
}


/*
 * Calculate late-round availability.
 *
 * This is the piece that helps us recognize:
 *
 * "There are still plenty of comparable QBs/TEs,
 * so don't draft one early."
 */
function calculateLateAvailability(
  player,
  players,
  context
) {

  if (!player || !player.position) {
    return 0;
  }

  /*
   * -------------------------------------------------------
   * BASIC VALIDATION
   * -------------------------------------------------------
   */

  var playerRank =
    Number(player.rank) || 9999;

  var nextPick =
    Number(
      context &&
      context.nextPick
    ) || 0;

  var currentPick =
    Number(
      context &&
      context.currentPick
    ) || 0;


  /*
   * If we don't know the draft position,
   * don't make an availability prediction.
   */

  if (
    !nextPick ||
    !currentPick ||
    nextPick <= currentPick
  ) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * PICKS UNTIL WE PICK AGAIN
   * -------------------------------------------------------
   */

  var picksUntilNext =
    nextPick - currentPick;


  /*
   * -------------------------------------------------------
   * HIGHER-RANKED PLAYERS AT SAME POSITION
   * -------------------------------------------------------
   */

  var samePosition =
    players.filter(function(p) {

      return p &&
        p.available &&
        p.position === player.position &&
        p.rank;

    });


  var higherRanked =
    samePosition.filter(function(p) {

      return (
        Number(p.rank) < playerRank
      );

    }).length;


  /*
   * -------------------------------------------------------
   * COMPARABLE PLAYERS
   * -------------------------------------------------------
   *
   * Players reasonably close to this player's
   * ranking.
   */

  var comparable =
  samePosition.filter(function(p) {

    var rank =
      Number(p.rank) || 9999;

    return (
      p !== player &&
      rank >= playerRank &&
      rank <= playerRank + 20
    );

  }).length;


  /*
   * -------------------------------------------------------
   * BASE AVAILABILITY RISK
   * -------------------------------------------------------
   *
   * More picks before our next selection means
   * greater risk.
   */

    /*
   * -------------------------------------------------------
   * AVAILABILITY RISK
   * -------------------------------------------------------
   *
   * Estimate whether this specific player is likely
   * to be drafted before our next selection.
   *
   * Overall player rank is the primary signal.
   */

  var risk =
    0;


  /*
   * -------------------------------------------------------
   * BASE RANK RISK
   * -------------------------------------------------------
   *
   * Elite players are naturally much more likely
   * to disappear before our next pick.
   */

  if (playerRank <= 12) {

  risk += 55;

} else if (playerRank <= 18) {

  risk += 50;

} else if (playerRank <= 24) {

  risk += 45;

} else if (playerRank <= 32) {

  risk += 38;

} else if (playerRank <= 40) {

  risk += 32;

} else if (playerRank <= 50) {

  risk += 25;

} else if (playerRank <= 65) {

  risk += 18;

} else if (playerRank <= 80) {

  risk += 12;

} else if (playerRank <= 110) {

  risk += 5;

} else {

  risk += 0;

}


  /*
   * -------------------------------------------------------
   * PICKS UNTIL NEXT SELECTION
   * -------------------------------------------------------
   */

  if (picksUntilNext >= 12) {

    risk += 20;

  } else if (picksUntilNext >= 8) {

    risk += 14;

  } else if (picksUntilNext >= 5) {

    risk += 8;

  } else if (picksUntilNext >= 3) {

    risk += 4;

  }


  /*
   * -------------------------------------------------------
   * COMPARABLE PLAYER DEPTH
   * -------------------------------------------------------
   *
   * If several similar players remain available,
   * the specific player is less likely to be selected.
   */

  if (comparable >= 8) {

    risk -= 20;

  } else if (comparable >= 5) {

    risk -= 12;

  } else if (comparable >= 3) {

    risk -= 6;

  }


  /*
   * -------------------------------------------------------
   * POSITIONAL PRESSURE
   * -------------------------------------------------------
   *
   * A player becomes more vulnerable when there
   * are few comparable alternatives.
   */

  if (comparable <= 1) {

  if (picksUntilNext >= 12) {

    risk += 10;

  } else if (picksUntilNext >= 8) {

    risk += 6;

  } else if (picksUntilNext >= 5) {

    risk += 2;

  }

} else if (comparable === 2) {

  if (picksUntilNext >= 8) {

    risk += 4;

  } else if (picksUntilNext >= 5) {

    risk += 2;

  }

}

    console.log(
    'AVAILABILITY RISK:',
    player.name,
    'position =',
    player.position,
    'rank =',
    player.rank,
    'picksUntilNext =',
    picksUntilNext,
    'higherRanked =',
    higherRanked,
    'comparable =',
    comparable,
    'risk =',
    risk
  );

  return Math.max(
    0,
    Math.min(
      100,
      risk
    )
  );

}

function detectDraftRuns(){

  var rows =
    Array.from(
      document.querySelectorAll(
        'tr.draftrow.drafted-mine, tr.draftrow.drafted-other'
      )
    );

  /*
   * -------------------------------------------------------
   * 1. RECENT PICK WINDOW
   * -------------------------------------------------------
   *
   * We examine the most recent 8 picks.
   *
   * This keeps the detector responsive without allowing
   * old draft activity to distort the current state.
   */

  var recentCount = 8;

  var recentRows =
    rows.slice(-recentCount);


  /*
   * -------------------------------------------------------
   * 2. POSITION DATA
   * -------------------------------------------------------
   */

  var positions = [
    'QB',
    'RB',
    'WR',
    'TE'
  ];

  var runs = {};

  positions.forEach(function(position){

    runs[position] = {

      count: 0,

      strength: 'NONE',

      averageRank: null,

      qualityScore: 0,

      recencyScore: 0,

      runScore: 0

    };

  });


  /*
   * -------------------------------------------------------
   * 3. ANALYZE RECENT PICKS
   * -------------------------------------------------------
   */

  recentRows.forEach(function(row,index){

    var position =
      row.getAttribute('data-pos');

    if(
      !position ||
      !runs[position]
    ){
      return;
    }


    runs[position].count++;


    /*
     * Try to identify the player's overall rank.
     *
     * We intentionally support several possible
     * attributes because draft-board markup can vary.
     */

    var rank =
      Number(
        row.getAttribute('data-rank') ||
        row.getAttribute('data-overall') ||
        row.getAttribute('data-rk') ||
        999
      );


    /*
     * Store rank information temporarily.
     */

    if(!runs[position].ranks){

      runs[position].ranks = [];

    }

    if(rank < 999){

      runs[position].ranks.push(rank);

    }


    /*
     * -------------------------------------------------------
     * RECENCY
     * -------------------------------------------------------
     *
     * Newer picks receive more weight.
     *
     * index 0 = oldest pick in the window
     * higher index = more recent
     */

    var recencyWeight =
      (index + 1) /
      recentRows.length;

    runs[position].recencyScore +=
      recencyWeight;

  });


  /*
   * -------------------------------------------------------
   * 4. CALCULATE RUN STRENGTH
   * -------------------------------------------------------
   */

  positions.forEach(function(position){

    var run =
      runs[position];


    if(run.count >= 5){

      run.strength =
        'STRONG';

    } else if(run.count >= 4){

      run.strength =
        'MODERATE';

    } else if(run.count >= 3){

      run.strength =
        'LIGHT';

    } else {

      run.strength =
        'NONE';

    }


    /*
     * Average player rank involved in the run.
     */

    if(
      run.ranks &&
      run.ranks.length
    ){

      var rankTotal =
        run.ranks.reduce(
          function(total,rank){
            return total + rank;
          },
          0
        );

      run.averageRank =
        rankTotal /
        run.ranks.length;

    }


    /*
     * -------------------------------------------------------
     * 5. QUALITY SCORE
     * -------------------------------------------------------
     *
     * A run involving highly-ranked players is more
     * meaningful than a run involving late-round players.
     *
     * Lower average rank = stronger quality.
     */

    if(run.averageRank !== null){

      run.qualityScore =
        Math.max(
          0,
          Math.min(
            100,
            100 -
            ((run.averageRank - 1) * 1.5)
          )
        );

    }


    /*
     * -------------------------------------------------------
     * 6. RUN SCORE
     * -------------------------------------------------------
     *
     * Frequency is the primary signal.
     * Quality and recency provide secondary context.
     */

    var frequencyScore =
      Math.min(
        100,
        (run.count / recentRows.length) * 100
      );


    run.runScore =
  (
    frequencyScore * 0.50
  ) +
  (
    run.qualityScore * 0.35
  ) +
  (
    (
      recentRows.length > 0
        ? (run.recencyScore /
           recentRows.length) * 100
        : 0
    ) * 0.15
  );


    /*
     * Remove temporary rank array from the public
     * result to keep the object clean.
     */

    delete run.ranks;

  });


  /*
   * -------------------------------------------------------
   * 7. FIND PRIMARY RUN
   * -------------------------------------------------------
   *
   * Preserve the old behavior:
   * one primary run is returned for the existing
   * calculateDraftRunOpportunity() function.
   */

  var rankedPositions =
    positions
      .slice()
      .sort(function(a,b){

        return (
          runs[b].runScore -
          runs[a].runScore
        );

      });


  var topPosition =
    rankedPositions[0];

  var topRun =
    runs[topPosition];


  var isRun =
    topRun &&
    topRun.count >= 3;


  /*
   * -------------------------------------------------------
   * 8. RETURN
   * -------------------------------------------------------
   */

  return {

    /*
     * Existing compatibility fields.
     */

    isRun:
      isRun,

    position:
      isRun
        ? topPosition
        : null,

    count:
      isRun
        ? topRun.count
        : 0,

    strength:
      isRun
        ? topRun.strength
        : 'NONE',


    /*
     * New detailed run information.
     */

    runs:
      runs,

    recentCount:
      recentRows.length,

    /*
     * Helpful debugging information.
     */

    counts:
      positions.reduce(
        function(result,position){

          result[position] =
            runs[position].count;

          return result;

        },
        {
          QB: 0,
          RB: 0,
          WR: 0,
          TE: 0,
          K: 0,
          DST: 0
        }
      )

  };

}

function calculateDraftRunOpportunity(player, context){

  if(!player || !context || !context.draftRuns){
    return 0;
  }

  var position =
    player.position ||
    player.pos ||
    'N/A';

  var run = context.draftRuns;

  if(!run.isRun){
    return 0;
  }

  var runPosition = run.position;
  var strength = run.strength;

  if(strength !== 'STRONG' &&
     strength !== 'MODERATE'){
    return 0;
  }

  if(position === runPosition){
    return 0;
  }

  var need = 0;

  if(context.rosterNeeds &&
     context.rosterNeeds[position] !== undefined){

    need =
      Number(context.rosterNeeds[position]) || 0;
  }

  if(position === 'RB' ||
     position === 'WR' ||
     position === 'TE'){

    var flexNeed =
      Number(
        context.rosterNeeds.FLEX
      ) || 0;

    need = Math.max(
      need,
      flexNeed
    );
  }

  var opportunityScore = 0;

  if(strength === 'STRONG'){

    opportunityScore =
      need > 0 ? 3 : 2;

  } else {

    opportunityScore =
      need > 0 ? 2 : 1;

  }

  return opportunityScore;
}
 
function calculateVorpProfile(
  player,
  players,
  replacements
) {

  var replacement =
    getEffectiveReplacement(
      player,
      replacements
    );

  var vorp =
    calculateFantasyVorp(
      player,
      replacement
    );

  var tierDrop =
    calculateTierDrop(
      player,
      players
    );

  var scarcity =
    calculatePositionScarcity(
      player,
      players,
      replacements
    );

  console.log(
  'VORP SCARCITY HANDOFF:',
  player.name,
  'calculated scarcity =',
  scarcity
);

  var draftState =
  getDraftAssistantState();

var lateAvailability =
  calculateLateAvailability(
    player,
    players,
    {
      currentPick:
        draftState.currentPick,

      nextPick:
        draftState.myNextPick
    }
  );

  console.log(
  'VORP SCARCITY RETURN:',
  player.name,
  'scarcity =',
  scarcity
);
  
  return {

    player: player,

    vorp: vorp,

    tierDrop:
      tierDrop.score,

    tierDropRankGap:
      tierDrop.rankGap,

    scarcity:
      scarcity,

    lateAvailability:
      lateAvailability,

    replacement:
      replacement,

    nextPlayer:
      tierDrop.nextPlayer
  };
}


/*
 * Calculate Stage 2 for all available players.
 */
function calculateAllFantasyVorp(players) {

  var available =
    getAvailableVorpPlayers(
      players
    );

  var replacements =
    calculateReplacementLevels(
      available
    );

  var profiles =
    available.map(function(player) {

      return calculateVorpProfile(
        player,
        available,
        replacements
      );
    });

  console.log(
  'VORP PROFILE TEST:',
  profiles.slice(0, 5).map(function(p){
    return {
      name: p.player.name,
      scarcity: p.scarcity
    };
  })
);

  return {

    settings:
      getVorpLeagueSettings(),

    replacements:
      replacements,

    profiles:
      profiles
  };
}


/* =========================================================
   STAGE 2 DEBUG
   ========================================================= */

function debugVorp() {

  var players =
    getDraftAssistantPlayers();

  var result =
    calculateAllFantasyVorp(
      players
    );

  var panel =
    document.getElementById(
      'draft-assistant-vorp-panel'
    );

  if (!panel) {

    panel =
      document.createElement('div');

    panel.id =
      'draft-assistant-vorp-panel';

    panel.style.cssText =
      'position:fixed;' +
      'left:10px;' +
      'right:10px;' +
      'bottom:10px;' +
      'z-index:100000;' +
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


  var html =
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<strong style="font-size:18px;">📊 VORP Debug</strong>' +

      '<button onclick="document.getElementById(\'draft-assistant-vorp-panel\').remove()" ' +
      'style="background:none;border:0;color:white;font-size:24px;">&times;</button>' +

    '</div>' +

    '<hr>' +

    '<strong>League Settings</strong><br>' +

    'Teams: ' +
      result.settings.teams +

    '<br>QB Starters: ' +
      result.settings.QB +

    '<br>RB Starters: ' +
      result.settings.RB +

    '<br>WR Starters: ' +
      result.settings.WR +

    '<br>TE Starters: ' +
      result.settings.TE +

    '<br>FLEX Starters: ' +
      result.settings.FLEX +

    '<hr>' +

    '<strong>Replacement Levels</strong><br>';


['QB', 'RB', 'WR', 'TE'].forEach(function(position) {

  var replacement =
    result.replacements[position];

  if (replacement) {

    var pool =
      result.profiles
        .filter(function(profile) {

          return profile.player.position === position &&
            profile.player.available &&
            profile.player.rank;
        })
        .sort(function(a, b) {

          return Number(a.player.rank) -
                 Number(b.player.rank);
        });

    var positionalRank =
      pool.findIndex(function(profile) {

        return profile.player.name ===
          replacement.name;
      }) + 1;

    html +=
      position +
      ': ' +
      replacement.name +
      ' — ' +
      position +
      ' #' +
      positionalRank +
      ' — Overall #' +
      replacement.rank +
      '<br>';

  } else {

    html +=
      position +
      ': None<br>';
  }

});


  var flexReplacement =
  result.replacements.FLEX;

if (flexReplacement) {

  var flexPool =
    result.profiles
      .filter(function(profile) {

        return (
          profile.player.position === 'RB' ||
          profile.player.position === 'WR' ||
          profile.player.position === 'TE'
        ) &&
        profile.player.available &&
        profile.player.rank;
      })
      .sort(function(a, b) {

        return Number(a.player.rank) -
               Number(b.player.rank);
      });

  var flexRank =
    flexPool.findIndex(function(profile) {

      return profile.player.name ===
        flexReplacement.name;
    }) + 1;

  html +=
    'FLEX: ' +
    flexReplacement.name +
    ' — FLEX #' +
    flexRank +
    ' — Overall #' +
    flexReplacement.rank +
    '<hr>' +

    '<strong>Top VORP Players</strong><br>';

} else {

  html +=
    'FLEX: None<hr>' +
    '<strong>Top VORP Players</strong><br>';
}

    '<hr>' +

    '<strong>Top VORP Players</strong><br>';


  var topProfiles =
    result.profiles
      .slice()
      .sort(function(a,b) {

        return b.vorp - a.vorp;
      })
      .slice(0,10);


  topProfiles.forEach(
    function(profile,index) {

      html +=

        (index + 1) +
        '. ' +

        profile.player.name +

        ' — ' +

        profile.player.position +

        ' #' +

        profile.player.rank +

        ' — VORP: ' +

        profile.vorp.toFixed(1) +

        '<br>' +

        '&nbsp;&nbsp;Scarcity: ' +

        profile.scarcity.toFixed(1) +

        ' | Tier Drop: ' +

        profile.tierDrop.toFixed(1) +

        '<br>' +

        '&nbsp;&nbsp;Late Availability: ' +

        profile.lateAvailability +

        '<br>';
    }
  );


  panel.innerHTML =
    html;
}

/* =========================================================
   DRAFT DECISION ENGINE — STAGE 1
   Calculates a contextual score for each available player.
   Does NOT change the recommendation widget yet.
   ========================================================= */

function getPlayerTierValue(player){
  var row = player.row || player;
  var tierId = '';

  if(row){
    var tbody = row.closest('tbody.tier-group');

    if(tbody){
      tierId = tbody.id.replace('tbody-', '');
    }
  }

  var tierValues = {
  'Sp': 100,
  'S': 92,
  'A': 78,
  'B': 62,
  'C': 45,
  'D': 30,
  'E': 15,
  'F': 5,

  'tier-Sp': 100,
  'tier-S': 92,
  'tier-A': 78,
  'tier-B': 62,
  'tier-C': 45,
  'tier-D': 30,
  'tier-E': 15,
  'tier-F': 5
};

  return {
    id: tierId,
    score: tierValues[tierId] || 5
  };
}

function calculateDraftNeed(player, context) {

  if(!player || !context){
    return 0;
  }

  var pos = player.position || player.pos;

  if(!pos){
    return 0;
  }

  var rosterNeeds =
    context.rosterNeeds || {};

  /*
   * Number of starting spots still needed
   * at this position.
   */
  var startersNeeded =
    Number(rosterNeeds[pos]) || 0;

  /*
   * Normalize need to a 0-100 scale.
   *
   * More unfilled starting spots = higher need.
   * This is intentionally capped so roster need
   * never overwhelms elite player value.
   */
  var needScore =
    Math.min(
      100,
      startersNeeded * 25
    );

  return needScore;
}

function calculateDraftScarcity(player, context){

  if(!player){
    return 0;
  }

  /*
   * The VORP engine already calculates
   * positional scarcity for each player.
   * Reuse that value instead of calculating
   * it a second time.
   */
  return Number(
    player.scarcity || 0
  );
}

function calculateDraftDecisionScore(player, context){

  if(!player) return null;

  context = context || {};

  var position =
    player.position ||
    player.pos ||
    'N/A';

  var rank =
    Number(player.rank || player.rk || 9999);

  var vorp =
    Number(player.vorp || 0);

  /*
   * -------------------------------------------------------
   * 1. CUSTOM RANK VALUE
   * -------------------------------------------------------
   *
   * Earlier overall rankings receive more value.
   */

  var rankScore =
    Math.max(0, 100 - ((rank - 1) * 1.5));

  rankScore =
    Math.min(100, rankScore);


  /*
   * -------------------------------------------------------
   * 2. TIER VALUE
   * -------------------------------------------------------
   */

  var tier =
    getPlayerTierValue(player);

  var tierScore =
    tier.score;


  /*
   * -------------------------------------------------------
   * 3. VORP VALUE
   * -------------------------------------------------------
   */

  var vorpMax =
  Number(context.vorpMax || 1);

var vorpScore =
  Math.max(
    0,
    Math.min(
      100,
      (vorp / vorpMax) * 100
    )
  );


  /*
   * -------------------------------------------------------
   * 4. POSITIONAL SCARCITY
   * -------------------------------------------------------
   */

  var scarcityScore =
  calculateDraftScarcity(
    player,
    context
  );

  /*
 * -------------------------------------------------------
 * 5. ROSTER NEED
 * -------------------------------------------------------
 */

var rosterNeedScore =
  calculateDraftNeed(
    player,
    context
  );

if(context.rosterNeeds &&
   context.rosterNeeds[position] !== undefined){

  var dedicatedNeed =
    Number(context.rosterNeeds[position]) || 0;

  var flexNeed =
    Number(context.rosterNeeds.FLEX) || 0;

  /*
   * RB / WR / TE can fill either their
   * dedicated position or FLEX.
   *
   * Do not add the two together because
   * one player can only fill one roster spot.
   */
  if(position === 'RB' ||
     position === 'WR' ||
     position === 'TE'){

    rosterNeedScore =
      Math.max(
        dedicatedNeed,
        flexNeed
      );

  } else {

    rosterNeedScore =
      dedicatedNeed;

  }
}


  /*
   * -------------------------------------------------------
   * 6. DRAFT TIMING
   * -------------------------------------------------------
   */

var draftState =
  getDraftAssistantState();

var lateAvailability =
  calculateLateAvailability(
    player,
    context.players || [],
    {
      currentPick:
        draftState.currentPick,

      nextPick:
        draftState.myNextPick
    }
  );

var timingScore =
  lateAvailability;

console.log(
  'TIMING SCORE:',
  player.name,
  'lateAvailability =',
  lateAvailability,
  'timingScore =',
  timingScore
);


/*
 * -------------------------------------------------------
 * 6.5. STRATEGY ADJUSTMENT
 * -------------------------------------------------------
 */

var strategyScore = 0;

if (
  context.strategy &&
  context.strategy.targetPosition
) {

  var targetPosition =
    context.strategy.targetPosition;

  if (position === targetPosition) {

    strategyScore = 4;

  }

}


/*
 * -------------------------------------------------------
 * RUN OPPORTUNITY
 * -------------------------------------------------------
 */

var runOpportunityScore =
  calculateDraftRunOpportunity(
    player,
    context
  );

console.log(
  'RUN OPPORTUNITY SCORE:',
  player.name,
  'position =',
  position,
  'runOpportunityScore =',
  runOpportunityScore
);


/*
 * -------------------------------------------------------
 * TIER CLIFF OPPORTUNITY
 * -------------------------------------------------------
 */

var tierCliffOpportunityScore =
  calculateTierCliffOpportunity(
    player,
    context
  );

console.log(
  'TIER CLIFF OPPORTUNITY:',
  player.name,
  'position =',
  position,
  'tierCliffOpportunityScore =',
  tierCliffOpportunityScore
);


/*
 * -------------------------------------------------------
 * 7. FINAL WEIGHTED SCORE
 * -------------------------------------------------------
 */

var finalScore =
    (tierScore * 0.35) +
    (rankScore * 0.25) +
    (vorpScore * 0.20) +
    (scarcityScore * 0.10) +
    (rosterNeedScore * 0.05) +
    (timingScore * 0.05);


/*
 * -------------------------------------------------------
 * STRATEGY ADJUSTMENTS
 * -------------------------------------------------------
 */

finalScore += strategyScore;
finalScore += tierCliffOpportunityScore;
finalScore += runOpportunityScore;

  console.log(
  'STRATEGY SCORE DEBUG:',
  player.name,
  'position =', position,
  'targetPosition =',
  context.strategy &&
  context.strategy.targetPosition,
  'strategyScore =',
  strategyScore
);

  return {

    name:
      player.name || 'Unknown',

    position:
      position,

    rank:
      rank,

    tier:
      tier.id,

    tierScore:
      tierScore,

    rankScore:
      rankScore,

    vorpScore:
      vorpScore,

    scarcityScore:
      scarcityScore,

    rosterNeedScore:
      rosterNeedScore,

    timingScore:
      timingScore,

    strategyScore:
  strategyScore,

runOpportunityScore:
  runOpportunityScore,

    tierCliffOpportunityScore:
  tierCliffOpportunityScore,

    tierCliffOpportunityScore:
  tierCliffOpportunityScore,

finalScore:
  finalScore

  };
}

function calculateDraftRecommendation(
  player,
  scoredPlayers,
  context
){

  if(!player){
    return {
      recommendation: 'PASS',
      confidence: 0,
      reason: 'No player provided.'
    };
  }

  scoredPlayers =
    Array.isArray(scoredPlayers)
      ? scoredPlayers
      : [];

  context =
    context || {};

  /*
   * -------------------------------------------------------
   * 1. CURRENT PLAYER
   * -------------------------------------------------------
   */

  var currentScore =
    Number(player.finalScore) || 0;


  /*
   * -------------------------------------------------------
   * 2. NEXT BEST PLAYER
   * -------------------------------------------------------
   *
   * Find the best alternative that is not
   * the player being evaluated.
   */

  var alternatives =
    scoredPlayers
      .filter(function(candidate){

        return candidate &&
          candidate.name !== player.name;

      })
      .sort(function(a,b){

        return (
          Number(b.finalScore || 0) -
          Number(a.finalScore || 0)
        );

      });


  var alternative =
    alternatives.length
      ? alternatives[0]
      : null;


  /*
   * -------------------------------------------------------
   * 3. SCORE GAP
   * -------------------------------------------------------
   */

  var alternativeScore =
    alternative
      ? Number(alternative.finalScore) || 0
      : 0;

  var scoreGap =
    currentScore -
    alternativeScore;


  /*
   * -------------------------------------------------------
   * 4. RECOMMENDATION LEVEL
   * -------------------------------------------------------
   */

  var recommendation =
    'CONSIDER';

  if(scoreGap >= 8){

    recommendation =
      'DRAFT';

  } else if(scoreGap >= 4){

    recommendation =
      'LEAN DRAFT';

  } else if(scoreGap <= -4){

    recommendation =
      'PASS';

  }


  /*
   * -------------------------------------------------------
   * 5. CONFIDENCE
   * -------------------------------------------------------
   *
   * Score separation is the primary confidence
   * signal.
   */

  var confidence =
    50;

  if(scoreGap >= 10){

    confidence = 95;

  } else if(scoreGap >= 8){

    confidence = 90;

  } else if(scoreGap >= 6){

    confidence = 80;

  } else if(scoreGap >= 4){

    confidence = 70;

  } else if(scoreGap >= 2){

    confidence = 60;

  } else if(scoreGap > -2){

    confidence = 50;

  } else if(scoreGap > -4){

    confidence = 35;

  } else {

    confidence = 20;

  }


  /*
   * -------------------------------------------------------
   * 6. CONTEXTUAL URGENCY
   * -------------------------------------------------------
   *
   * Timing, tier cliffs, and draft runs can
   * strengthen a recommendation.
   */

  var urgencyBonus = 0;

  var timing =
    Number(player.timingScore) || 0;

  var tierCliff =
    Number(
      player.tierCliffOpportunityScore
    ) || 0;

  var runOpportunity =
    Number(
      player.runOpportunityScore
    ) || 0;


  if(timing >= 70){

    urgencyBonus += 2;

  } else if(timing >= 50){

    urgencyBonus += 1;

  }


  if(tierCliff >= 5){

    urgencyBonus += 2;

  } else if(tierCliff >= 3){

    urgencyBonus += 1;

  }


  if(runOpportunity >= 3){

    urgencyBonus += 1;

  }


  /*
   * -------------------------------------------------------
   * 7. FINAL CONFIDENCE
   * -------------------------------------------------------
   */

  confidence =
    Math.min(
      99,
      confidence + urgencyBonus
    );


  /*
   * -------------------------------------------------------
   * 8. PRIMARY REASON
   * -------------------------------------------------------
   */

  var reason =
    'Best overall draft value';


  if(
    player.tierScore >= 90 &&
    player.vorpScore >= 80
  ){

    reason =
      'Elite tier and VORP value';

  } else if(
    player.vorpScore >= 80
  ){

    reason =
      'Elite value over replacement';

  } else if(
    player.tierScore >= 90
  ){

    reason =
      'Elite player tier';

  } else if(
    tierCliff >= 5
  ){

    reason =
      'Major tier cliff opportunity';

  } else if(
    timing >= 70
  ){

    reason =
      'High availability risk';

  } else if(
    player.scarcityScore >= 90
  ){

    reason =
      'Strong positional scarcity';

  } else if(
    player.rosterNeedScore >= 50
  ){

    reason =
      'Fills an important roster need';

  }


  /*
   * -------------------------------------------------------
   * 9. BUILD HUMAN-READABLE SUMMARY
   * -------------------------------------------------------
   */

  var summary =
    recommendation +
    ' ' +
    player.name;

  if(alternative){

    summary +=
      ' by ' +
      Math.abs(scoreGap).toFixed(1) +
      ' points over ' +
      alternative.name;

  }


  return {

    recommendation:
      recommendation,

    confidence:
      confidence,

    scoreGap:
      scoreGap,

    alternative:
      alternative,

    reason:
      reason,

    urgencyBonus:
      urgencyBonus,

    summary:
      summary

  };

}

function generateDecisionExplanation(result, comparisonResult) {

  if (!result) {
    return null;
  }

  var reasons = [];
  var positives = [];
  var concerns = [];

  /*
   * -------------------------------------------------------
   * 1. TIER
   * -------------------------------------------------------
   */

  if (result.tierScore >= 90) {

    positives.push(
      'Elite tier value'
    );

  } else if (result.tierScore >= 75) {

    positives.push(
      'Strong tier value'
    );

  } else if (result.tierScore < 50) {

    concerns.push(
      'Lower player tier'
    );
  }


  /*
   * -------------------------------------------------------
   * 2. OVERALL RANK
   * -------------------------------------------------------
   */

  if (result.rank <= 10) {

    positives.push(
      'Top-10 overall player'
    );

  } else if (result.rank <= 20) {

    positives.push(
      'Strong overall ranking'
    );

  } else if (result.rank >= 40) {

    concerns.push(
      'Lower overall ranking'
    );
  }


  /*
   * -------------------------------------------------------
   * 3. VORP
   * -------------------------------------------------------
   */

  if (result.vorpScore >= 90) {

    positives.push(
      'Elite VORP'
    );

  } else if (result.vorpScore >= 75) {

    positives.push(
      'Strong VORP'
    );

  } else if (result.vorpScore < 40) {

    concerns.push(
      'Limited VORP'
    );
  }


  /*
   * -------------------------------------------------------
   * 4. SCARCITY
   * -------------------------------------------------------
   */

  if (result.scarcityScore >= 90) {

    positives.push(
      'Position is highly scarce'
    );

  } else if (result.scarcityScore >= 75) {

    positives.push(
      'Good positional scarcity'
    );

  } else if (result.scarcityScore < 40) {

    concerns.push(
      'Position has relatively low scarcity'
    );
  }


  /*
   * -------------------------------------------------------
   * 5. ROSTER NEED
   * -------------------------------------------------------
   */

  if (result.rosterNeedScore >= 2) {

    positives.push(
      'Strong roster need'
    );

  } else if (result.rosterNeedScore >= 1) {

    positives.push(
      'Fills an open roster need'
    );

  } else {

    concerns.push(
      'Does not fill an immediate roster need'
    );
  }


  /*
 * -------------------------------------------------------
 * 6. TIMING
 * -------------------------------------------------------
 */

if (result.timingScore >= 70) {

  positives.push(
    'Very high chance of being gone before the next pick'
  );

} else if (result.timingScore >= 50) {

  positives.push(
    'High chance of being gone before the next pick'
  );

} else if (result.timingScore >= 30) {

  positives.push(
    'Moderate draft-timing pressure'
  );

}


  /*
   * -------------------------------------------------------
   * 7. COMPARISON
   * -------------------------------------------------------
   */

  if (comparisonResult) {

    var scoreDifference =
      Number(result.finalScore || 0) -
      Number(comparisonResult.finalScore || 0);

    if (scoreDifference > 5) {

      reasons.push(
        'Clear advantage over ' +
        comparisonResult.name
      );

    } else if (scoreDifference > 2) {

      reasons.push(
        'Moderate advantage over ' +
        comparisonResult.name
      );

    } else if (scoreDifference > 0) {

      reasons.push(
        'Slight advantage over ' +
        comparisonResult.name
      );

    } else {

      reasons.push(
        'Very close decision'
      );
    }
  }


  /*
   * -------------------------------------------------------
   * 8. PRIMARY REASON
   * -------------------------------------------------------
   */

  var primaryReason =
    'Best overall combination of draft value';

  var strongestValue = -1;

  var factors = [
    {
      name: 'tier',
      value: result.tierScore,
      text: 'elite tier value'
    },
    {
      name: 'rank',
      value: result.rankScore,
      text: 'strong overall ranking'
    },
    {
      name: 'VORP',
      value: result.vorpScore,
      text: 'excellent value over replacement'
    },
    {
      name: 'scarcity',
      value: result.scarcityScore,
      text: 'strong positional scarcity'
    },
    {
      name: 'need',
      value: result.rosterNeedScore,
      text: 'roster need'
    },
    {
      name: 'timing',
      value: result.timingScore,
      text: 'draft timing'
    }
  ];

  factors.forEach(function(factor) {

    if (factor.value > strongestValue) {

      strongestValue =
        factor.value;

      primaryReason =
        factor.text;
    }

  });


  return {

    primaryReason:
      primaryReason,

    reasons:
      reasons,

    positives:
      positives,

    concerns:
      concerns

  };
}

function calculateDecisionRosterNeeds(){

  var counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  document
    .querySelectorAll(
      'tr.draftrow.drafted-mine'
    )
    .forEach(function(row){

      var pos =
        row.getAttribute('data-pos');

      if(pos && counts[pos] !== undefined){
        counts[pos]++;
      }

    });

  var needs = {};

  /*
   * Dedicated starting-position needs.
   */
  ['QB','RB','WR','TE','K','DST']
    .forEach(function(pos){

      var starters =
        Number(ROSTER_SLOTS[pos]) || 0;

      var filled =
        counts[pos] || 0;

      needs[pos] =
        Math.max(
          0,
          starters - filled
        );

    });


  /*
   * FLEX need.
   *
   * FLEX can be RB / WR / TE.
   */

  var dedicatedRB =
    Math.min(
      counts.RB,
      Number(ROSTER_SLOTS.RB) || 0
    );

  var dedicatedWR =
    Math.min(
      counts.WR,
      Number(ROSTER_SLOTS.WR) || 0
    );

  var dedicatedTE =
    Math.min(
      counts.TE,
      Number(ROSTER_SLOTS.TE) || 0
    );


  /*
   * Number of RB/WR/TE players currently
   * occupying dedicated starting slots.
   */
  var dedicatedEligible =
    dedicatedRB +
    dedicatedWR +
    dedicatedTE;


  /*
   * Total RB/WR/TE players on roster.
   */
  var totalEligible =
    counts.RB +
    counts.WR +
    counts.TE;


  /*
   * RB/WR/TE players available beyond
   * the dedicated starting requirements.
   */
  var flexFilled =
    Math.max(
      0,
      totalEligible -
      dedicatedEligible
    );


  var flexSlots =
    Number(ROSTER_SLOTS.FLEX) || 0;


  needs.FLEX =
    Math.max(
      0,
      flexSlots - flexFilled
    );

  console.log("ROSTER NEEDS:", needs);

  return needs;
}

function calculateDraftStrategy() {

  var counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  document
    .querySelectorAll(
      'tr.draftrow.drafted-mine'
    )
    .forEach(function(row){

      var pos =
        row.getAttribute('data-pos');

      if(pos && counts[pos] !== undefined){
        counts[pos]++;
      }

    });


  var rbSlots =
    Number(ROSTER_SLOTS.RB) || 2;

  var wrSlots =
    Number(ROSTER_SLOTS.WR) || 2;

  var teSlots =
    Number(ROSTER_SLOTS.TE) || 1;

  var flexSlots =
    Number(ROSTER_SLOTS.FLEX) || 1;

  var qbSlots =
    Number(ROSTER_SLOTS.QB) || 1;


  /*
   * -------------------------------------------------------
   * STARTER REQUIREMENTS
   * -------------------------------------------------------
   */

  var rbNeed =
    Math.max(
      0,
      rbSlots - counts.RB
    );

  var wrNeed =
    Math.max(
      0,
      wrSlots - counts.WR
    );

  var teNeed =
    Math.max(
      0,
      teSlots - counts.TE
    );

  var qbNeed =
    Math.max(
      0,
      qbSlots - counts.QB
    );


  /*
   * -------------------------------------------------------
   * FLEX STATUS
   * -------------------------------------------------------
   */

  var dedicatedRB =
    Math.min(
      counts.RB,
      rbSlots
    );

  var dedicatedWR =
    Math.min(
      counts.WR,
      wrSlots
    );

  var dedicatedTE =
    Math.min(
      counts.TE,
      teSlots
    );

  var dedicatedEligible =
    dedicatedRB +
    dedicatedWR +
    dedicatedTE;

  var totalEligible =
    counts.RB +
    counts.WR +
    counts.TE;

  var flexFilled =
    Math.max(
      0,
      totalEligible -
      dedicatedEligible
    );

  var flexNeed =
    Math.max(
      0,
      flexSlots - flexFilled
    );


  /*
   * -------------------------------------------------------
   * POSITIONAL BALANCE
   * -------------------------------------------------------
   *
   * Positive = position still needs attention.
   * Negative = position is already well stocked.
   */

  var rbPressure =
    rbNeed;

  var wrPressure =
    wrNeed;

  var tePressure =
    teNeed;

  var qbPressure =
    qbNeed;


  /*
   * FLEX creates additional value for RB/WR/TE.
   */

  if(flexNeed > 0){

    rbPressure += flexNeed;
    wrPressure += flexNeed;
    tePressure += flexNeed;

  }


  /*
   * -------------------------------------------------------
   * DETERMINE GENERAL TARGET
   * -------------------------------------------------------
   */

  var targetPosition = null;
  var targetPressure = -1;

  [
    {
      position: 'RB',
      pressure: rbPressure
    },
    {
      position: 'WR',
      pressure: wrPressure
    },
    {
      position: 'TE',
      pressure: tePressure
    },
    {
      position: 'QB',
      pressure: qbPressure
    }
  ].forEach(function(item){

    if(item.pressure > targetPressure){

      targetPressure =
        item.pressure;

      targetPosition =
        item.position;

    }

  });


  /*
   * -------------------------------------------------------
   * STRATEGY TYPE
   * -------------------------------------------------------
   */

  var strategy =
    'BEST VALUE';

  if(targetPressure >= 2){

    strategy =
      'FILL NEED';

  } else if(targetPressure === 1){

    strategy =
      'LEAN ' +
      targetPosition;

  }


  /*
   * -------------------------------------------------------
   * FLEX STATUS DESCRIPTION
   * -------------------------------------------------------
   */

  var flexStatus;

  if(flexNeed > 0){

    flexStatus =
      'FLEX spot still open';

  } else {

    flexStatus =
      'FLEX currently covered';

  }


  return {

    counts:
      counts,

    needs: {

      QB: qbNeed,
      RB: rbNeed,
      WR: wrNeed,
      TE: teNeed,
      FLEX: flexNeed

    },

    pressure: {

      QB: qbPressure,
      RB: rbPressure,
      WR: wrPressure,
      TE: tePressure

    },

    targetPosition:
      targetPosition,

    targetPressure:
      targetPressure,

    strategy:
      strategy,

    flexStatus:
      flexStatus

  };

}

function generateDraftStrategyExplanation(strategy) {

  if(!strategy){
    return null;
  }

  var counts =
    strategy.counts || {};

  var needs =
    strategy.needs || {};

  var target =
    strategy.targetPosition;

  var explanation = '';

  var priority = [];

  /*
   * -------------------------------------------------------
   * ROSTER STATUS
   * -------------------------------------------------------
   */

  if(needs.QB > 0){

    priority.push(
      'QB'
    );

  }

  if(needs.RB > 0){

    priority.push(
      'RB'
    );

  }

  if(needs.WR > 0){

    priority.push(
      'WR'
    );

  }

  if(needs.TE > 0){

    priority.push(
      'TE'
    );

  }

  if(needs.FLEX > 0){

    priority.push(
      'FLEX'
    );

  }


  /*
   * -------------------------------------------------------
   * STRATEGY EXPLANATION
   * -------------------------------------------------------
   */

  if(strategy.strategy === 'FILL NEED'){

    explanation =
      'Your roster has an open starting spot at ' +
      target +
      '. Prioritize this position unless a significantly better value falls.';

  } else if(strategy.strategy === 'LEAN QB'){

    explanation =
      'Your RB/WR/TE starting spots are covered. ' +
      'QB is your only immediate starting-position need, ' +
      'so lean QB without forcing the pick.';

  } else if(
    strategy.strategy.indexOf('LEAN ') === 0
  ){

    explanation =
      'Your roster is mostly balanced. ' +
      'Lean toward ' +
      target +
      ', but continue taking the best value available.';

  } else {

    explanation =
      'Your starting roster is balanced. ' +
      'Prioritize the best player value rather than forcing a position.';

  }


  /*
   * -------------------------------------------------------
   * FLEX
   * -------------------------------------------------------
   */

  if(needs.FLEX > 0){

    explanation +=
      ' You still need another RB/WR/TE for FLEX coverage.';

  } else {

    explanation +=
      ' Your FLEX is already covered.';

  }


  /*
   * -------------------------------------------------------
   * PRIORITY POSITIONS
   * -------------------------------------------------------
   */

  var priorityText =
    priority.length
      ? priority.join(', ')
      : 'None';


  return {

    text:
      explanation,

    priority:
      priority,

    priorityText:
      priorityText

  };

}

function debugDecisionEngine(){

  var players =
    getDraftAssistantPlayers();

  var available =
    players.filter(function(player){
      return player.available;
    });

  var vorpResult =
  calculateAllFantasyVorp(players);

  var tierCliffs = {};

[
  'QB',
  'RB',
  'WR',
  'TE'
].forEach(function(position) {

  tierCliffs[position] =
    calculatePositionTierCliff(
      position,
      players,
      vorpResult.profiles
    );

});

console.log(
  'TIER CLIFF DEBUG:',
  tierCliffs
);
  
  console.log(
  'TIER CLIFF DETAILS:',
  JSON.stringify(
    tierCliffs,
    null,
    2
  )
);

  var draftState = getDraftAssistantState();

  var draftRuns =
  detectDraftRuns();

console.log(
  'DRAFT RUN DEBUG:',
  draftRuns
);

  var draftStrategy =
  calculateDraftStrategy();

var strategyExplanation =
  generateDraftStrategyExplanation(
    draftStrategy
  );

var context = {

  players:
    players,

  teams:
    Number(
      document.getElementById('pcTeams')?.value
    ) || 10,

  rosterSettings: {
  QB: Number(ROSTER_SLOTS.QB) || 1,
  RB: Number(ROSTER_SLOTS.RB) || 2,
  WR: Number(ROSTER_SLOTS.WR) || 2,
  TE: Number(ROSTER_SLOTS.TE) || 1,
  FLEX: Number(ROSTER_SLOTS.FLEX) || 1
},

  availablePlayers:
  available,

replacements:
  vorpResult.replacements,

  currentPick:
    draftState.currentPick,

  nextPick:
    draftState.myNextPick,

  rosterNeeds:
  calculateDecisionRosterNeeds(),

  strategy:
    draftStrategy,

  draftRuns:
    draftRuns,

  tierCliffs:
    tierCliffs,

  strategyExplanation:
    strategyExplanation

};

var vorpMax = Math.max.apply(
  null,
  vorpResult.profiles.map(function(profile){
    return Number(profile.vorp) || 0;
  })
);

context.vorpMax = vorpMax;

  context.vorpProfiles =
  vorpResult.profiles;
  
  var scored =
  vorpResult.profiles
    .filter(function(profile){
      return profile.player &&
             profile.player.available;
    })
    .map(function(profile){

      var player =
  Object.assign(
    {},
    profile.player,
    {
      vorp:
        profile.vorp,

      scarcity:
        profile.scarcity
    }
  );

console.log(
  'SCARCITY DEBUG:',
  player.name,
  'profile.scarcity =',
  profile.scarcity,
  'player.scarcity =',
  player.scarcity
);

var runOpportunity =
  calculateDraftRunOpportunity(
    player,
    context
  );

console.log(
  'RUN OPPORTUNITY:',
  player.name,
  'position =',
  player.position,
  'runPosition =',
  context.draftRuns &&
  context.draftRuns.position,
  'opportunity =',
  runOpportunity
);

console.log(
  'STRATEGY EXPLANATION:',
  context.strategyExplanation
);

return calculateDraftDecisionScore(
  player,
  context
);

    });


  scored.sort(function(a,b){
    return b.finalScore - a.finalScore;
  });

  /*
 * -------------------------------------------------------
 * PICK RECOMMENDATION
 * -------------------------------------------------------
 */

var topPlayer =
  scored.length
    ? scored[0]
    : null;

var draftRecommendation =
  calculateDraftRecommendation(
    topPlayer,
    scored,
    context
  );

console.log(
  'DRAFT RECOMMENDATION:',
  draftRecommendation
);


  /*
 * -------------------------------------------------------
 * GENERATE DECISION EXPLANATIONS
 * -------------------------------------------------------
 *
 * Compare each player against the next-best player.
 */

scored.forEach(function(player, index){

  var nextPlayer =
    scored[index + 1] || null;

  player.explanation =
    generateDecisionExplanation(
      player,
      nextPlayer
    );

});


  var panel =
    document.getElementById(
      'draft-decision-debug-panel'
    );


  if(!panel){

    panel =
      document.createElement('div');

    panel.id =
      'draft-decision-debug-panel';

    panel.style.cssText =
      'position:fixed;' +
      'left:10px;' +
      'right:10px;' +
      'bottom:10px;' +
      'z-index:100001;' +
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


  var html =
    '<div style="display:flex;' +
    'justify-content:space-between;' +
    'align-items:center;">' +

      '<strong style="font-size:18px;">' +
      '🧠 Decision Engine' +
      '</strong>' +

      '<button onclick="' +
      "document.getElementById('draft-decision-debug-panel').remove()" +
      '" style="background:none;border:0;' +
      'color:white;font-size:24px;">' +
      '&times;' +
      '</button>' +

    '</div>' +

    '<hr>' +

    '<strong>Top Decision Scores</strong><br><br>';


  scored
    .slice(0,10)
    .forEach(function(player,index){

      html +=

        '<div style="' +
        'padding:8px;' +
        'margin-bottom:6px;' +
        'background:rgba(255,255,255,.04);' +
        'border-radius:8px;">' +

        '<strong>' +
        (index + 1) +
        '. ' +
        player.name +
        '</strong>' +

        '<br>' +

        player.position +
        ' #' +
        player.rank +
        ' · ' +
        player.tier +

        '<br>' +

        '<strong>Decision Score: ' +
        player.finalScore.toFixed(1) +
        '</strong>' +

        '<br>' +

        'Tier: ' +
        player.tierScore.toFixed(1) +

        ' · Rank: ' +
        player.rankScore.toFixed(1) +

        ' · VORP: ' +
        player.vorpScore.toFixed(1) +

        '<br>' +

        'Scarcity: ' +
player.scarcityScore.toFixed(1) +

' · Need: ' +
player.rosterNeedScore.toFixed(1) +

' · Timing: ' +
player.timingScore.toFixed(1) +

' · Run Opportunity: ' +
player.runOpportunityScore.toFixed(1) +

' · Tier Cliff: ' +
player.tierCliffOpportunityScore.toFixed(1) +

'<br><br>' +

'<strong>Why:</strong> ' +
player.explanation.primaryReason +

'<br>' +

(player.explanation.reasons.length
  ? player.explanation.reasons.join(' · ')
  : '') +

(player.explanation.positives.length
  ? '<br><span style="color:#7CFF7C;">✓ ' +
    player.explanation.positives.join(' · ') +
    '</span>'
  : '') +

(player.explanation.concerns.length
  ? '<br><span style="color:#FFB86C;">⚠ ' +
    player.explanation.concerns.join(' · ') +
    '</span>'
  : '') +

'</div>';

    });

  console.log(
  'DRAFT STRATEGY:',
  context.strategy
);

  panel.innerHTML =
    html;
}
