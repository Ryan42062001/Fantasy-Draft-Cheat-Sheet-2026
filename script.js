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
var window.ORIGINAL_ORDER = [];

// ==== POSITION FILTERING ====
function jumpTo(id){
  var el = document.getElementById(id);
  if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); }
}

function setPosFilter(pos, btn){
  currentPosFilter = pos;
  document.querySelectorAll('.filterbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

// ==== DRAFT DAY DASHBOARD ====
// Quick position scarcity summary for decision-making on the clock
function updateDraftDayDashboard(){
  var container = document.getElementById('draft-day-dashboard');
  if(!container) return;
  
  var draftedCounts = {QB:0, RB:0, WR:0, TE:0, K:0, DST:0};
  var totalByPos = {QB:0, RB:0, WR:0, TE:0, K:0, DST:0};
  
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var pos = row.getAttribute('data-pos');
    if(totalByPos[pos] !== undefined) totalByPos[pos]++;
    if(row.classList.contains('drafted-mine') || row.classList.contains('drafted-other')){
      if(draftedCounts[pos] !== undefined) draftedCounts[pos]++;
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

var ROSTER_SLOTS = {QB:1, RB:2, WR:2, TE:1, FLEX:1, DST:1, K:1};
// Bench slots per position (configured by user). Defaults set per request: qb:0, RB:2, WR:5
var BENCH_SLOTS = {QB:0, RB:2, WR:5, TE:0, K:0, DST:0};

function toggleDraft(row){
  if(document.body.classList.contains('edit-mode')) return;
  // 3-state cycle: available → drafted by me (green) → drafted by other (gray) → available
  if(row.classList.contains('drafted-mine')){
    row.classList.remove('drafted-mine');
    row.classList.add('drafted-other');
  } else if(row.classList.contains('drafted-other')){
    row.classList.remove('drafted-other');
  } else {
    row.classList.add('drafted-mine');
  }
  updateMyTeam();
  updateRemaining();
  updateBestAvailable();
  updatePickCounter();
  updateScarcityAlerts();
  updateRecommendedPick();
  updateDraftDayDashboard();
  addRoundMarkers();
  scheduleSave();
}

var resetArmed = false;
var resetArmTimer = null;
function resetBoard(){
  var btn = document.getElementById('resetBtn');
  if(!resetArmed){
    resetArmed = true;
    btn.innerText = 'Tap again to confirm';
    btn.classList.add('armed');
    resetArmTimer = setTimeout(function(){
      resetArmed = false;
      btn.innerText = 'Reset all';
      btn.classList.remove('armed');
    }, 3000);
    return;
  }
  clearTimeout(resetArmTimer);
  resetArmed = false;
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    row.classList.remove('drafted-mine','drafted-other');
  });
  updateMyTeam();
  updateRemaining();
  updateBestAvailable();
  updatePickCounter();
  updateScarcityAlerts();
  updateRecommendedPick();
  addRoundMarkers();
  btn.innerText = 'Reset all';
  btn.classList.remove('armed');
  updateDraftDayDashboard();
  scheduleSave();
}

// ---- CHECKLIST ITEM 1: auto-save progress ----
// REMOVED FOR GOOD (2026-08-02, session 4): user confirmed the storage
// errors happen on BOTH mobile and desktop/laptop — this settles the open
// question from earlier sessions. It is not a mobile-only quirk; window.storage
// is not functioning in this environment/session, full stop. Removed all
// automatic storage calls (saveState, loadState's storage.get, and the
// testStorageCapability self-test) rather than keep generating visible
// platform-level error toasts on every tap. Export/Import is now the sole,
// permanent persistence mechanism for this file — this is final, not a
// placeholder. Do not re-add window.storage calls without first confirming
// (via a fresh, isolated test) that the underlying platform issue is fixed.

// Autosave utilities (localStorage with graceful fallback)
var AUTOSAVE_KEY = 'draft-state-v1';
var AUTOSAVE_ENABLED_KEY = 'draft-autosave-enabled-v1';
var _saveTimer = null;

function saveState(){
  try{
    var state = {};
    document.querySelectorAll('tr.draftrow').forEach(function(row){
      var name = row.getAttribute('data-name');
      if(row.classList.contains('drafted-mine')) state[name] = 'mine';
      else if(row.classList.contains('drafted-other')) state[name] = 'taken';
    });
    var order = [];
    document.querySelectorAll('tbody.tier-group').forEach(function(tbody){
      var tid = tbody.id.replace('tbody-','');
      tbody.querySelectorAll('tr.draftrow').forEach(function(row){ order.push({n: row.getAttribute('data-name'), t: tid}); });
    });
    var payload = { savedAt: new Date().toISOString(), teams: LEAGUE_SIZE, slot: MY_DRAFT_SLOT, rounds: TOTAL_ROUNDS, state: state, order: order };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    flashSaveIndicator('Saved', '#8fd4a0');
    var diagEl = document.getElementById('storage-diag'); if(diagEl) diagEl.innerHTML = 'Autosave: On (last saved '+ new Date().toLocaleTimeString()+')';
    return true;
  } catch(e){
    console.error('Autosave failed', e);
    flashSaveIndicator('Autosave failed', '#e08a8a');
    var diagEl = document.getElementById('storage-diag'); if(diagEl) diagEl.innerHTML = '<b>Autosave failed — use Export to back up your picks.</b>';
    return false;
  }
}

function scheduleSave(){
  if(!isAutosaveEnabled()) return;
  if(_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function(){ saveState(); _saveTimer = null; }, 400);
}

function isAutosaveEnabled(){
  try{ return localStorage.getItem(AUTOSAVE_ENABLED_KEY) === '1'; }catch(e){ return false; }
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
  updateMyTeam();
  updateRemaining();
  updateBestAvailable();
  updatePickCounter();
  updateScarcityAlerts();
  updateRecommendedPick();
  addRoundMarkers();
  applyTeamColors();
  window.ORIGINAL_ORDER = [];
  document.querySelectorAll('tbody.tier-group').forEach(function(tbody){
    var tid = tbody.id.replace('tbody-','');
    tbody.querySelectorAll('tr.draftrow').forEach(function(row){ window.ORIGINAL_ORDER.push({n: row.getAttribute('data-name'), t: tid}); });
  });
  addEditControls();

  var enabled = isAutosaveEnabled();
  setAutosaveEnabled(enabled);
  var diagEl = document.getElementById('storage-diag');
  try{
    if(enabled){
      var raw = localStorage.getItem(AUTOSAVE_KEY);
      if(raw){
        var payload = JSON.parse(raw);
        if(payload.teams) document.getElementById('pcTeams').value = payload.teams;
        if(payload.slot) document.getElementById('pcSlot').value = payload.slot;
        if(payload.rounds) document.getElementById('pcRounds').value = payload.rounds;
        updatePickSettings();
        if(payload.order){ applyCustomOrder(payload.order); }
        document.querySelectorAll('tr.draftrow').forEach(function(row){
          var name = row.getAttribute('data-name');
          row.classList.remove('drafted-mine','drafted-other');
          if(payload.state && payload.state[name] === 'mine') row.classList.add('drafted-mine');
          else if(payload.state && payload.state[name] === 'taken') row.classList.add('drafted-other');
        });
        updateMyTeam(); updateRemaining(); updateBestAvailable(); updatePickCounter(); updateScarcityAlerts(); updateRecommendedPick(); addRoundMarkers();
        if(diagEl) diagEl.innerHTML = 'Autosave: restored backup from '+(payload.savedAt||'previous session');
      } else {
        if(diagEl) diagEl.innerHTML = 'Autosave: No prior backup found.';
      }
    } else {
      if(diagEl) diagEl.innerHTML = 'Autosave is disabled. Use Export to back up your picks.';
    }
  } catch(e){
    console.error('Restore from autosave failed', e);
    if(diagEl) diagEl.innerHTML = '<b>Autosave restore failed — use Export to back up your picks.</b>';
  }
}
window.addEventListener('DOMContentLoaded', loadState);


function toggleExportImport(){
  var panel = document.getElementById('export-panel');
  panel.classList.toggle('open');
}

function doExport(){
  var state = {};
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var name = row.getAttribute('data-name');
    if(row.classList.contains('drafted-mine')) state[name] = 'mine';
    else if(row.classList.contains('drafted-other')) state[name] = 'taken';
  });
  var order = [];
  document.querySelectorAll('tbody.tier-group').forEach(function(tbody){
    var tid = tbody.id.replace('tbody-','');
    tbody.querySelectorAll('tr.draftrow').forEach(function(row){
      order.push({n: row.getAttribute('data-name'), t: tid});
    });
  });
  var payload = {
    savedAt: new Date().toISOString(),
    teams: LEAGUE_SIZE, slot: MY_DRAFT_SLOT, rounds: TOTAL_ROUNDS,
    state: state,
    order: order
  };
  document.getElementById('exportBox').value = JSON.stringify(payload);
}

function copyExport(){
  var box = document.getElementById('exportBox');
  if(!box.value){ doExport(); }
  box.select();
  box.setSelectionRange(0, 999999);
  try{
    navigator.clipboard.writeText(box.value).then(function(){
      flashSaveIndicator('Copied!', '#8fd4a0');
    }).catch(function(){
      flashSaveIndicator('Select + copy manually', '#e08a8a');
    });
  } catch(e){
    flashSaveIndicator('Select + copy manually', '#e08a8a');
  }
}

function flashSaveIndicator(text, color){
  var el = document.getElementById('save-indicator');
  if(!el) return;
  el.style.color = color;
  el.innerText = text;
  setTimeout(function(){ el.innerText=''; }, 2000);
}

// Reorders rows into their saved tiers, in saved sequence. Used by both
// Import (restoring someone else's/your own prior export) and Reset Ranks
// (restoring the original pre-edit order captured at page load).
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

function applyCustomOrder(orderArray){
  if(!orderArray || !orderArray.length) return;
  var rowMap = {};
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    rowMap[row.getAttribute('data-name')] = row;
  });
  orderArray.forEach(function(entry){
    var row = rowMap[entry.n];
    var targetTbody = document.getElementById('tbody-' + entry.t);
    if(row && targetTbody){
      targetTbody.appendChild(row); // appending in saved sequence reconstructs saved order
    }
  });
  addEditControls(); // in case any row is missing controls (shouldn't happen, but cheap safety net)
  syncEditControls(); // re-sync every row's tier-select dropdown to its actual current tier
  updateBestAvailable();
  updateRecommendedPick();
  updateScarcityAlerts();
  addRoundMarkers();
  scheduleSave();
}

function doImport(){
  var raw = document.getElementById('importBox').value.trim();
  var statusEl = document.getElementById('import-status');
  if(!raw){ statusEl.innerHTML = '&#9888; Paste an exported code first.'; statusEl.style.color='#e08a8a'; return; }
  try{
    var payload = JSON.parse(raw);
    var state = payload.state || payload; // tolerate raw state objects too
    if(payload.teams){ document.getElementById('pcTeams').value = payload.teams; }
    if(payload.slot){ document.getElementById('pcSlot').value = payload.slot; }
    if(payload.rounds){ document.getElementById('pcRounds').value = payload.rounds; }
    updatePickSettings();
    if(payload.order){ applyCustomOrder(payload.order); }
    document.querySelectorAll('tr.draftrow').forEach(function(row){
      var name = row.getAttribute('data-name');
      row.classList.remove('drafted-mine','drafted-other');
      if(state[name] === 'mine') row.classList.add('drafted-mine');
      else if(state[name] === 'taken') row.classList.add('drafted-other');
    });
    updateMyTeam();
    updateRemaining();
    updateBestAvailable();
    updatePickCounter();
    updateScarcityAlerts();
    updateRecommendedPick();
    addRoundMarkers();
    statusEl.innerHTML = '&#9989; Imported successfully — board updated.';
    statusEl.style.color = '#8fd4a0';
    scheduleSave();
  } catch(e){
    statusEl.innerHTML = '&#10060; Could not read that code — make sure you pasted the full export text.';
    statusEl.style.color = '#e08a8a';
    console.log('Import failed:', e);
  }
}

function resetRanks(){
  if(!window.ORIGINAL_ORDER || !window.ORIGINAL_ORDER.length){
    flashSaveIndicator('Nothing to reset', '#e08a8a');
    return;
  }
  applyCustomOrder(window.ORIGINAL_ORDER);
  flashSaveIndicator('Ranks reset', '#8fd4a0');
}

// ---- FEATURE A: team color accents ----
var TEAM_COLORS = {
  ARI:'#97233F', ATL:'#A71930', BAL:'#241773', BUF:'#00338D', CAR:'#0085CA',
  CHI:'#0B162A', CIN:'#FB4F14', CLE:'#FF3C00', DAL:'#003594', DEN:'#FB4F14',
  DET:'#0076B6', GB:'#203731', HOU:'#03202F', IND:'#002C5F', JAX:'#101820',
  KC:'#E31837', LAC:'#0080C6', LAR:'#003594', LV:'#A5ACAF', MIA:'#008E97',
  MIN:'#4F2683', NE:'#002244', NO:'#D3BC8D', NYG:'#0B2265', NYJ:'#125740',
  PHI:'#004C54', PIT:'#FFB612', SEA:'#69BE28', SF:'#AA0000', TB:'#D50A0A',
  TEN:'#4B92DB', WAS:'#5A1414'
};
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

// ---- FEATURE: recommended pick (needs + best available combined) ----
function updateRecommendedPick(){
  var el = document.getElementById('recommended-pick-text');
  if(!el) return;

  // Count current roster by position
  var counts = {QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
  document.querySelectorAll('tr.draftrow.drafted-mine').forEach(function(row){
    var pos = row.getAttribute('data-pos');
    if(counts[pos] !== undefined) counts[pos]++;
  });
  var totalDrafted = document.querySelectorAll('tr.draftrow.drafted-mine').length;
  if(totalDrafted === 0){
    el.innerHTML = 'Tap a player to start tracking your team, and I\'ll suggest your best picks here.';
    return;
  }

  // Build per-position needs: starters first, then bench spots
  var needOrder = [];
  ['QB','RB','WR','TE'].forEach(function(p){
    var startersNeeded = Math.max(0, (ROSTER_SLOTS[p]||0) - (counts[p]||0));
    if(startersNeeded > 0) needOrder.push({type:'starter', pos:p, count:startersNeeded});
  });
  // bench remaining per position
  ['QB','RB','WR','TE','K','DST'].forEach(function(p){
    var filledBench = Math.max(0, (counts[p]||0) - (ROSTER_SLOTS[p]||0));
    var benchLeft = (BENCH_SLOTS[p]||0) - filledBench;
    if(benchLeft > 0) needOrder.push({type:'bench', pos:p, count:benchLeft});
  });

  // Fallback: if no specific need, prefer best available across all positions
  var candidates = [];
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    if(row.classList.contains('drafted-mine') || row.classList.contains('drafted-other')) return;
    var pos = row.getAttribute('data-pos');
    var rk = parseInt(row.children[0].innerText.trim(),10) || 9999;
    var nameCell = row.querySelector('.pname');
    var name = nameCell ? nameCell.childNodes[0].textContent.trim() : row.getAttribute('data-name');
    var round = Math.ceil(rk / LEAGUE_SIZE);
    candidates.push({row:row, pos:pos, rk:rk, name:name, round:round});
  });

  var suggested = [];
  // respect DOM order (candidates already in DOM order) and fill by needs
  for(var i=0;i<candidates.length && suggested.length<3;i++){
    var c = candidates[i];
    // check if this candidate satisfies any outstanding starter need
    var satisfies = false;
    for(var j=0;j<needOrder.length;j++){
      var need = needOrder[j];
      if(need.pos === c.pos){ satisfies = true; break; }
    }
    if(needOrder.length === 0 || satisfies){
      suggested.push(c);
    }
  }
  // If still not enough, pad with the next best available regardless of pos
  if(suggested.length < 3){
    for(var i=0;i<candidates.length && suggested.length<3;i++){
      if(!suggested.includes(candidates[i])) suggested.push(candidates[i]);
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
    // label as Starter or Bench candidate based on simple heuristic
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

// ---- FEATURE: round markers next to rank ----
function addRoundMarkers(){
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var rkCell = row.children[0];
    var rk = parseInt(rkCell.innerText.trim(), 10);
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

// ---- FEATURE: Edit Ranks (reorder within tier, move between tiers) ----
var TIER_IDS = ['Sp','S','A','B','C','D','E','F'];
var TIER_LABELS = {Sp:'S+', S:'S', A:'A', B:'B', C:'C', D:'D', E:'E', F:'F'};

function toggleEditMode(){
  document.body.classList.toggle('edit-mode');
  var btn = document.getElementById('editRanksBtn');
  if(btn) btn.classList.toggle('active');
}

function addEditControls(){
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var rkCell = row.children[0];
    if(rkCell.querySelector('.rank-controls')) return; // already added

    var wrap = document.createElement('div');
    wrap.className = 'rank-controls';

    var upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.innerText = '\u25B2';
    upBtn.title = 'Move up within tier';
    upBtn.addEventListener('click', function(e){ e.stopPropagation(); moveRowUp(row); });

    var downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.innerText = '\u25BC';
    downBtn.title = 'Move down within tier';
    downBtn.addEventListener('click', function(e){ e.stopPropagation(); moveRowDown(row); });

    var select = document.createElement('select');
    select.title = 'Move to a different tier';
    TIER_IDS.forEach(function(tid){
      var opt = document.createElement('option');
      opt.value = tid;
      opt.innerText = TIER_LABELS[tid];
      select.appendChild(opt);
    });
    var currentTbody = row.closest('tbody.tier-group');
    if(currentTbody){
      var currentTid = currentTbody.id.replace('tbody-','');
      select.value = currentTid;
    }
    select.addEventListener('click', function(e){ e.stopPropagation(); });
    select.addEventListener('change', function(e){
      e.stopPropagation();
      moveRowToTier(row, select.value);
    });

    wrap.appendChild(upBtn);
    wrap.appendChild(downBtn);
    wrap.appendChild(select);
    rkCell.appendChild(wrap);
  });
}

function refreshAfterRankEdit(){
  updateBestAvailable();
  updateRecommendedPick();
  updateScarcityAlerts();
  scheduleSave();
}

function moveRowUp(row){
  var prev = row.previousElementSibling;
  if(prev && prev.classList.contains('draftrow')){
    row.parentNode.insertBefore(row, prev);
    refreshAfterRankEdit();
  }
}

function moveRowDown(row){
  var next = row.nextElementSibling;
  if(next && next.classList.contains('draftrow')){
    row.parentNode.insertBefore(next, row);
    refreshAfterRankEdit();
  }
}

function moveRowToTier(row, targetTid){
  var targetTbody = document.getElementById('tbody-' + targetTid);
  if(targetTbody){
    targetTbody.appendChild(row); // lands at the end of that tier; use up/down to fine-position
    refreshAfterRankEdit();
  }
}


function updateBestAvailable(){
  var byPos = {QB:[], RB:[], WR:[], TE:[]};
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    if(row.classList.contains('drafted-mine') || row.classList.contains('drafted-other')) return;
    var pos = row.getAttribute('data-pos');
    if(!byPos[pos]) return;
    if(byPos[pos].length >= 3) return; // DOM order already reflects tier + any manual edits — just take first 3
    var nameCell = row.querySelector('.pname');
    var name = nameCell ? nameCell.childNodes[0].textContent.trim() : row.getAttribute('data-name');
    var rkText = row.children[0].childNodes[0] ? row.children[0].childNodes[0].textContent.trim() : '?';
    byPos[pos].push({rk:rkText, name:name});
  });
  var html = '';
  ['QB','RB','WR','TE'].forEach(function(pos){
    var top3 = byPos[pos];
    html += '<div class="ba-col"><div class="ba-pos-label">'+pos+'</div>';
    if(top3.length === 0){
      html += '<div class="ba-player" style="opacity:0.5;">none left</div>';
    } else {
      top3.forEach(function(p){
        html += '<div class="ba-player">#'+p.rk+' '+p.name+'</div>';
      });
    }
    html += '</div>';
  });
  var el = document.getElementById('best-available');
  if(el) el.innerHTML = html;
}

// ---- CHECKLIST ITEM 3: pick counter / next-pick tracker ----
// Generalized snake-draft math — works for any team count / draft slot / round count.
// Reads live from the Teams / Your Pick # / Rounds inputs in the widget (defaults 10/10/16 for this league).
var LEAGUE_SIZE = 10;
var MY_DRAFT_SLOT = 10;
var TOTAL_ROUNDS = 16;

function updatePickSettings(){
  var teamsEl = document.getElementById('pcTeams');
  var slotEl = document.getElementById('pcSlot');
  var roundsEl = document.getElementById('pcRounds');
  LEAGUE_SIZE = Math.max(2, parseInt(teamsEl.value,10) || 10);
  MY_DRAFT_SLOT = Math.min(LEAGUE_SIZE, Math.max(1, parseInt(slotEl.value,10) || 1));
  TOTAL_ROUNDS = Math.max(1, parseInt(roundsEl.value,10) || 16);
  updatePickCounter();
  addRoundMarkers();
}

function getMyPickNumbers(rounds){
  var picks = [];
  for(var r = 1; r <= rounds; r++){
    // Odd rounds go in normal order (slot N = pick N of the round).
    // Even rounds reverse (slot N = pick [teams - N + 1] of the round).
    var pickInRound = (r % 2 === 1) ? MY_DRAFT_SLOT : (LEAGUE_SIZE - MY_DRAFT_SLOT + 1);
    var overallPick = (r - 1) * LEAGUE_SIZE + pickInRound;
    picks.push(overallPick);
  }
  return picks;
}

function updatePickCounter(){
  var totalPicksMade = document.querySelectorAll('tr.draftrow.drafted-mine, tr.draftrow.drafted-other').length;
  var currentPick = totalPicksMade + 1;
  var myPicks = getMyPickNumbers(TOTAL_ROUNDS);
  var totalDraftPicks = LEAGUE_SIZE * TOTAL_ROUNDS;
  var nextMyPick = myPicks.find(function(p){ return p >= currentPick; });
  var el = document.getElementById('pick-counter-text');
  if(!el) return;
  if(!nextMyPick || currentPick > totalDraftPicks){
    el.innerHTML = 'Draft appears complete (pick '+Math.min(totalPicksMade,totalDraftPicks)+' of '+totalDraftPicks+' logged).';
    return;
  }
  var picksAway = nextMyPick - currentPick;
  var youAreUp = (nextMyPick === currentPick);
  if(youAreUp){
    el.innerHTML = '&#128680; <b>You are on the clock — pick #'+currentPick+'</b>';
  } else {
    el.innerHTML = 'Pick #'+currentPick+' of '+totalDraftPicks+' league-wide &middot; your next pick: <b>#'+nextMyPick+'</b> (in '+picksAway+' picks)';
  }
}

// ---- CHECKLIST ITEM 4: scarcity alerts ----
function updateScarcityAlerts(){
  var container = document.getElementById('scarcity-alerts');
  if(!container) return;
  var alerts = [];
  // Clear prior visual flags on tier dividers
  document.querySelectorAll('tr.tier-divider-row').forEach(function(div){ div.classList.remove('scarcity-warning'); });

  document.querySelectorAll('tbody.tier-group').forEach(function(block){
    var tierName = block.getAttribute('data-tier-name') || '';
    var posCounts = {};
    block.querySelectorAll('tr.draftrow').forEach(function(row){
      var pos = row.getAttribute('data-pos');
      if(!['QB','RB','WR','TE'].includes(pos)) return;
      if(!posCounts[pos]) posCounts[pos] = {total:0, left:0};
      posCounts[pos].total++;
      if(!row.classList.contains('drafted-mine') && !row.classList.contains('drafted-other')){
        posCounts[pos].left++;
      }
    });

    // Find the tier divider row for visual flagging
    var divider = block.querySelector('tr.tier-divider-row');
    var tierFlagged = false;

    Object.keys(posCounts).forEach(function(pos){
      var c = posCounts[pos];
      // Alert rules: when a tier had meaningful depth and is nearly out,
      // show an inline alert and visually flag the tier divider for RB/QB/TE
      if(c.total >= 3 && c.left <= 2 && c.left > 0){
        alerts.push('&#9888; Only <b>'+c.left+' '+pos+'</b> left in tier "'+tierName+'"');
        if(['QB','RB','TE'].includes(pos)) tierFlagged = true;
      } else if(c.total >= 3 && c.left === 0){
        alerts.push('&#10060; <b>'+pos+'</b> is fully drafted in tier "'+tierName+'"');
        if(['QB','RB','TE'].includes(pos)) tierFlagged = true;
      }
    });

    if(tierFlagged && divider){
      divider.classList.add('scarcity-warning');
    }
  });
  container.innerHTML = alerts.slice(0,6).map(function(a){ return '<div class="scarcity-note">'+a+'</div>'; }).join('');
}

function updateRemaining(){
  var total = document.querySelectorAll('tr.draftrow').length;
  var mine = document.querySelectorAll('tr.draftrow.drafted-mine').length;
  var other = document.querySelectorAll('tr.draftrow.drafted-other').length;
  var left = total - mine - other;
  var el = document.getElementById('remaining-status');
  if(mine === 0 && other === 0){
    el.innerText = 'All ' + total + ' players available';
  } else {
    el.innerHTML = left + ' available &middot; <span style="color:#8fd4a0;">' + mine + ' yours</span> &middot; <span style="color:#e08a8a;">' + other + ' taken</span>';
  }
}

// ---- FEATURE C: post-draft summary + grade ----
function toggleSummary(){
  var panel = document.getElementById('summary-panel');
  panel.classList.toggle('open');
  if(panel.classList.contains('open')) updateDraftSummary();
}

function updateDraftSummary(){
  var el = document.getElementById('summary-content');
  if(!el) return;
  var drafted = document.querySelectorAll('tr.draftrow.drafted-mine');
  if(drafted.length === 0){
    el.innerHTML = '<span style="color:#a9c2ab;font-size:0.8rem;">Draft some players first — this fills in once you have a team.</span>';
    return;
  }

  var posCounts = {QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
  var byeCounts = {};
  var valSum = 0, valCount = 0, bestPick = null, worstPick = null;
  drafted.forEach(function(row){
    var pos = row.getAttribute('data-pos');
    var bye = row.getAttribute('data-bye');
    var name = row.querySelector('.pname') ? row.querySelector('.pname').childNodes[0].textContent.trim() : row.getAttribute('data-name');
    if(posCounts[pos] !== undefined) posCounts[pos]++;
    if(bye && bye !== '-'){ byeCounts[bye] = (byeCounts[bye]||0)+1; }
    if(row.children.length >= 6){
      var v = parseFloat(row.children[5].innerText.trim().replace('+',''));
      if(!isNaN(v)){
        valSum += v; valCount++;
        if(!bestPick || v > bestPick.v) bestPick = {v:v, name:name};
        if(!worstPick || v < worstPick.v) worstPick = {v:v, name:name};
      }
    }
  });

  var avgVal = valCount ? (valSum/valCount) : 0;
  var grade, gradeColor;
  if(avgVal >= 8){ grade='A+'; gradeColor='#8fd4a0'; }
  else if(avgVal >= 4){ grade='A'; gradeColor='#8fd4a0'; }
  else if(avgVal >= 1){ grade='B+'; gradeColor='#5fa8d9'; }
  else if(avgVal >= -1){ grade='B'; gradeColor='#5fa8d9'; }
  else if(avgVal >= -4){ grade='C'; gradeColor='#e0c98a'; }
  else { grade='D'; gradeColor='#e08a8a'; }

  var html = '<div style="text-align:center;">';
  html += '<div class="grade-badge" style="background:'+gradeColor+'22;color:'+gradeColor+';border:2px solid '+gradeColor+';">'+grade+'</div>';
  html += '<div style="font-size:0.8rem;color:#c9d9c9;">'+drafted.length+' players drafted &middot; avg pick value '+(avgVal>=0?'+':'')+avgVal.toFixed(1)+'</div></div>';

  html += '<div class="summary-section"><h3>Positional Breakdown</h3>';
  ['QB','RB','WR','TE','K','DST'].forEach(function(p){
    html += '<div class="summary-row"><span>'+p+'</span><span>'+posCounts[p]+'</span></div>';
  });
  html += '</div>';

  html += '<div class="summary-section"><h3>Bye Week Spread</h3>';
  var byeKeys = Object.keys(byeCounts).sort(function(a,b){ return parseInt(a)-parseInt(b); });
  if(byeKeys.length === 0){
    html += '<span style="color:#a9c2ab;font-size:0.75rem;">No bye data yet.</span>';
  } else {
    byeKeys.forEach(function(b){
      var warn = byeCounts[b] >= 3;
      html += '<div class="summary-row"><span>Week '+b+'</span><span'+(warn?' style="color:#e08a8a;font-weight:800;"':'')+'>'+byeCounts[b]+' player'+(byeCounts[b]>1?'s':'')+(warn?' &#9888;':'')+'</span></div>';
    });
  }
  html += '</div>';

  if(bestPick || worstPick){
    html += '<div class="summary-section"><h3>Value Highlights</h3>';
    if(bestPick) html += '<div class="summary-row"><span>&#128142; Best value</span><span style="color:#8fd4a0;">'+bestPick.name+' (+'+bestPick.v+')</span></div>';
    if(worstPick) html += '<div class="summary-row"><span>&#9888; Biggest reach</span><span style="color:#e08a8a;">'+worstPick.name+' ('+worstPick.v+')</span></div>';
    html += '</div>';
  }

  el.innerHTML = html;
}

function toggleMyTeam(){
  var panel = document.getElementById('myteam-panel');
  panel.classList.toggle('open');
  updateMyTeam();
}

function updateMyTeam(){
  var drafted = document.querySelectorAll('tr.draftrow.drafted-mine');
  var counts = {QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
  var byeCounts = {};
  var rosterHtml = '';
  var valSum = 0, valCount = 0, bestValPick = null, worstValPick = null;
  drafted.forEach(function(row){
    var pos = row.getAttribute('data-pos');
    var name = row.querySelector('.pname') ? row.querySelector('.pname').childNodes[0].textContent.trim() : row.getAttribute('data-name');
    var bye = row.getAttribute('data-bye');
    if(counts[pos] !== undefined){ counts[pos]++; }
    if(bye && bye !== '-'){ byeCounts[bye] = (byeCounts[bye]||0)+1; }
    rosterHtml += '<div class="rl-row"><span>'+name+'</span><span>'+pos+' &middot; Bye '+bye+'</span></div>';
    // Value tracking: full board rows have Val in column index 5; tail-table rows (rank 141+) don't have this column
    if(row.children.length >= 6){
      var valText = row.children[5].innerText.trim();
      var v = parseFloat(valText.replace('+',''));
      if(!isNaN(v)){
        valSum += v; valCount++;
        if(!bestValPick || v > bestValPick.v){ bestValPick = {v:v, name:name}; }
        if(!worstValPick || v < worstValPick.v){ worstValPick = {v:v, name:name}; }
      }
    }
  });

  // Build starters + bench summary
  var needsHtml = '';
  var positions = ['QB','RB','WR','TE','DST','K'];
  positions.forEach(function(p){
    var have = counts[p] || 0;
    var startersRequired = ROSTER_SLOTS[p] || 0;
    var startersHave = Math.min(have, startersRequired);
    var startersNeeded = Math.max(0, startersRequired - have);
    var benchConfigured = BENCH_SLOTS[p] || 0;
    var benchFilled = Math.max(0, have - startersRequired);
    var benchNeeded = Math.max(0, benchConfigured - benchFilled);
    var starterClass = startersNeeded === 0 ? ' filled' : '';
    var benchClass = benchNeeded === 0 && benchConfigured>0 ? ' filled' : '';
    needsHtml += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">';
    needsHtml += '<div class="need-pill'+starterClass+'">'+p+' starters: '+startersHave+'/'+startersRequired+'</div>';
    if(benchConfigured > 0){
      needsHtml += '<div class="need-pill'+benchClass+'">Bench: '+benchFilled+'/'+benchConfigured+'</div>';
    }
    needsHtml += '</div>';
  });

  document.getElementById('needs-row').innerHTML = needsHtml || '<span style="color:#a9c2ab;font-size:0.75rem;">No players drafted yet — tap a row once (green) to add it here.</span>';

  var byeWarn = '';
  for(var b in byeCounts){
    if(byeCounts[b] >= 3){
      byeWarn += '&#9888; '+byeCounts[b]+' players share Bye Week '+b+' — check your bench depth that week.<br>';
    }
  }
  document.getElementById('bye-warning').innerHTML = byeWarn ? '<div class="bye-warn">'+byeWarn+'</div>' : '';

  document.getElementById('roster-list').innerHTML = rosterHtml || '';

  // ---- FEATURE B: draft value tracker ----
  var vtEl = document.getElementById('value-tracker');
  if(vtEl){
    if(valCount === 0){
      vtEl.innerHTML = '<span style="color:#a9c2ab;">No value data yet — picks from the deep waiver tier (rank 141+) do not carry a Val score.</span>';
    } else {
      var avgVal = (valSum / valCount);
      var avgColor = avgVal >= 0 ? '#8fd4a0' : '#e08a8a';
      var avgLabel = avgVal >= 10 ? 'excellent value' : avgVal >= 3 ? 'good value' : avgVal >= -3 ? 'fair value' : 'reaching a bit';
      var html = 'Avg pick value: <b style="color:'+avgColor+';">'+(avgVal>=0?'+':'')+avgVal.toFixed(1)+'</b> ('+avgLabel+')';
      if(bestValPick && bestValPick.v > 0){
        html += '<br><span style="color:#8fd4a0;">&#128142; Best value: '+bestValPick.name+' (+'+bestValPick.v+')</span>';
      }
      if(worstValPick && worstValPick.v < 0){
        html += '<br><span style="color:#e08a8a;">&#9888; Biggest reach: '+worstValPick.name+' ('+worstValPick.v+')</span>';
      }
      vtEl.innerHTML = html;
    }
  }

  // ---- FEATURE: need-highlighting on board rows ----
  var neededPositions = new Set();
  // highlight positions where starters still missing
  if((counts.QB||0) < (ROSTER_SLOTS.QB||0)) neededPositions.add('QB');
  if((counts.RB||0) < (ROSTER_SLOTS.RB||0)) neededPositions.add('RB');
  if((counts.WR||0) < (ROSTER_SLOTS.WR||0)) neededPositions.add('WR');
  if((counts.TE||0) < (ROSTER_SLOTS.TE||0)) neededPositions.add('TE');
  // If starters are all filled, highlight bench-eligible positions with bench slots left
  if(neededPositions.size === 0){
    ['RB','WR','TE'].forEach(function(p){
      var benchFilled = Math.max(0, (counts[p]||0) - (ROSTER_SLOTS[p]||0));
      var benchLeft = (BENCH_SLOTS[p]||0) - benchFilled;
      if(benchLeft > 0) neededPositions.add(p);
    });
  }
  document.querySelectorAll('tr.draftrow').forEach(function(row){
    var pos = row.getAttribute('data-pos');
    var isDrafted = row.classList.contains('drafted-mine') || row.classList.contains('drafted-other');
    if(!isDrafted && neededPositions.has(pos)){
      row.classList.add('need-highlight');
    } else {
      row.classList.remove('need-highlight');
    }
  });
}

function sortTable(tableId, colIdx, type){
  var table = document.getElementById(tableId);
  var tbody = table;
  var rows = Array.prototype.slice.call(table.querySelectorAll('tr.draftrow'));
  var asc = table.getAttribute('data-sort-col') != colIdx || table.getAttribute('data-sort-dir') !== 'asc';
  rows.sort(function(a,b){
    var av = a.children[colIdx].innerText.trim();
    var bv = b.children[colIdx].innerText.trim();
    if(type === 'num'){
      av = parseFloat(av) || 0; bv = parseFloat(bv) || 0;
    } else if(type === 'val'){
      av = parseFloat(av.replace('+','')) || 0; bv = parseFloat(bv.replace('+','')) || 0;
    }
    if(av < bv) return asc ? -1 : 1;
    if(av > bv) return asc ? 1 : -1;
    return 0;
  });
  rows.forEach(function(r){ table.appendChild(r); });
  table.setAttribute('data-sort-col', colIdx);
  table.setAttribute('data-sort-dir', asc ? 'asc' : 'desc');
}
// ==== KEYBOARD SHORTCUTS ====
// Quick draft-day shortcuts for fast interactions on the clock
document.addEventListener('keydown', function(e){
  // Ctrl+S / Cmd+S: toggle autosave (for power users who want manual control)
  if((e.ctrlKey || e.metaKey) && e.key === 's'){
    e.preventDefault();
    toggleAutosave();
  }
  // Ctrl+M / Cmd+M: toggle My Team panel
  if((e.ctrlKey || e.metaKey) && e.key === 'm'){
    e.preventDefault();
    toggleMyTeam();
  }
  // Ctrl+E / Cmd+E: toggle Export/Import
  if((e.ctrlKey || e.metaKey) && e.key === 'e'){
    e.preventDefault();
    toggleExportImport();
  }
  // Number keys 1-6: quick position filter shortcuts
  var posShortcuts = {
    '0': 'ALL',
    '1': 'QB',
    '2': 'RB',
    '3': 'WR',
    '4': 'TE',
    '5': 'K',
    '6': 'DST'
  };
  if(posShortcuts[e.key]){
    e.preventDefault();
    var pos = posShortcuts[e.key];
    var btn = Array.from(document.querySelectorAll('.filterbtn')).find(b => b.getAttribute('data-pos') === pos);
    if(btn) setPosFilter(pos, btn);
  }
});

// ==== PAGE INITIALIZATION ====
// Restore draft state from localStorage and initialize dashboard on load
window.addEventListener('load', function(){
  loadState();
  updateDraftDayDashboard();
  updateBestAvailable();
  updatePickCounter();
  updateMyTeam();
  addRoundMarkers();
  // Ensure autosave button reflects current state
  var btn = document.getElementById('autosaveToggle');
  if(btn){
    btn.innerText = isAutosaveEnabled() ? 'Autosave On' : 'Autosave Off';
    btn.style.background = isAutosaveEnabled() ? 'rgba(95,168,124,0.25)' : 'rgba(193,85,75,0.25)';
    btn.style.borderColor = isAutosaveEnabled() ? '#5fa87c' : '#c1554b';
  }
});
