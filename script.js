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
window.ORIGINAL_ORDER = [];

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

// ==== SEARCH STATE ====
var searchMatches = [];
var currentSearchIndex = -1;

function applyFilters() {
  var searchInput = document.getElementById('searchBox');
  var countEl = document.getElementById('searchMatchCount');
  var prevBtn = document.getElementById('searchPrevBtn');
  var nextBtn = document.getElementById('searchNextBtn');

  // 1. Maintain position filters across all rows & clear existing search highlights
  document.querySelectorAll('tr.draftrow').forEach(function(row) {
    row.classList.remove('search-highlight');
    var pos = row.getAttribute('data-pos');
    var matchesPos = (currentPosFilter === 'ALL' || pos === currentPosFilter);
    if (matchesPos) {
      row.classList.remove('hidden-row');
    } else {
      row.classList.add('hidden-row');
    }
  });

  // Reset match tracking state
  searchMatches = [];
  currentSearchIndex = -1;

  if (!searchInput) return;
  var q = searchInput.value.toLowerCase().trim();

  // Reset controls if search query is cleared or under 2 characters
  if (q.length < 2) {
    if (countEl) countEl.innerText = '0/0';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  // 2. Gather all visible matching rows in DOM order
  var rows = document.querySelectorAll('tr.draftrow:not(.hidden-row)');
  for (var i = 0; i < rows.length; i++) {
    var name = (rows[i].getAttribute('data-name') || '').toLowerCase();
    if (name.indexOf(q) !== -1) {
      searchMatches.push(rows[i]);
    }
  }

  // 3. Update counter & enable/disable navigation buttons
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
}

function navigateSearch(direction) {
  if (searchMatches.length <= 1) return;

  // Cycle index forwards or backwards
  currentSearchIndex = (currentSearchIndex + direction + searchMatches.length) % searchMatches.length;

  var countEl = document.getElementById('searchMatchCount');
  if (countEl) {
    countEl.innerText = (currentSearchIndex + 1) + '/' + searchMatches.length;
  }

  scrollToCurrentMatch();
}

function scrollToCurrentMatch() {
  if (currentSearchIndex < 0 || currentSearchIndex >= searchMatches.length) return;

  // Remove highlight from all prior matches
  searchMatches.forEach(function(row) {
    row.classList.remove('search-highlight');
  });

  var targetRow = searchMatches[currentSearchIndex];
  if (!targetRow) return;

  var headerOffset = 140;
  var elementPosition = targetRow.getBoundingClientRect().top + window.pageYOffset;
  var offsetPosition = elementPosition - headerOffset;

  window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth'
  });

  var parentWrapper = targetRow.closest('div');
  if (parentWrapper && parentWrapper.scrollHeight > parentWrapper.clientHeight) {
    var parentRect = parentWrapper.getBoundingClientRect();
    var targetRect = targetRow.getBoundingClientRect();
    parentWrapper.scrollTo({
      top: parentWrapper.scrollTop + (targetRect.top - parentRect.top) - headerOffset,
      behavior: 'smooth'
    });
  }

  targetRow.classList.add('search-highlight');
  setTimeout(function() {
    targetRow.classList.remove('search-highlight');
  }, 2000);
}

// ==== DRAFT DAY DASHBOARD ====
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

function toggleDraft(row){
  if(document.body.classList.contains('edit-mode')) return;
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
  updateNextPickMarker();
  updateScarcityAlerts();
  updateRecommendedPick();
  updateDraftDayDashboard();
  addRoundMarkers();
  scheduleSave();
}

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
  updateNextPickMarker();
  updateScarcityAlerts();
  updateRecommendedPick();
  updateDraftDayDashboard();
  addRoundMarkers();
  btn.innerText = 'Reset all';
  btn.classList.remove('armed');
  scheduleSave();
}

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
        updateMyTeam(); updateRemaining(); updateBestAvailable(); updatePickCounter(); updateNextPickMarker(); updateScarcityAlerts(); updateRecommendedPick(); addRoundMarkers();
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
      targetTbody.appendChild(row);
    }
  });
  addEditControls();
  syncEditControls();
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
    var state = payload.state || payload;
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
    if(counts[pos] !== undefined) counts[pos]++;
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
    var pos = row.getAttribute('data-pos');
    var rk = parseInt(row.children[0].innerText.trim(),10) || 9999;
    var nameCell = row.querySelector('.pname');
    var name = nameCell ? nameCell.childNodes[0].textContent.trim() : row.getAttribute('data-name');
    var round = Math.ceil(rk / LEAGUE_SIZE);
    candidates.push({row:row, pos:pos, rk:rk, name:name, round:round});
  });

  var suggested = [];
  for(var i=0;i<candidates.length && suggested.length<3;i++){
    var c = candidates[i];
    var satisfies = false;
    for(var j=0;j<needOrder.length;j++){
      var need = needOrder[j];
      if(need.pos === c.pos){ satisfies = true; break; }
    }
    if(needOrder.length === 0 || satisfies){
      suggested.push(c);
    }
  }

  // FIX #5: Check name/attribute string rather than object reference equity
  if(suggested.length < 3){
    for(var i=0; i<candidates.length && suggested.length<3; i++){
      var candidate = candidates[i];
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
    var rk = parseInt(rkCell.innerText.trim(), 10);
    if(!rk) return;
    var round = Math.ceil(rk / LEAGUE_SIZE);
    var existing = rkCell.querySelector('.round-tag');
    if(existing){
      existing.innerText = 'Rd'+round;
    } else {
      // FIX #2: Clear text node drift when injecting elements
      var tag = document.createElement('div');
      tag.className = 'round-tag';
      tag.innerText = 'Rd'+round;
      rkCell.appendChild(tag);
    }
  });
}

// ==== GLOBAL SEARCH STATE ====
var searchMatches = [];
var currentSearchIndex = -1;

// ==== DOM INITIALIZATION & OBSERVER ====
document.addEventListener('DOMContentLoaded', function() {
  removeExportImportButtons();
  setupSearchUI();
  
  // Continuous DOM observer to destroy buttons loaded asynchronously or post-DOM
  var observer = new MutationObserver(function() {
    removeExportImportButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});

// ==== REMOVE EXPORT/IMPORT CONTROLS ====
function removeExportImportButtons() {
  // Broad selector targeting panels, triggers, and action attributes
  var selectors = [
    '#exportBtn', '#importBtn', '#export-panel', '#import-panel',
    '.export-btn', '.import-btn', '.export-toggle', '.import-toggle',
    '[onclick*="Export"]', '[onclick*="import"]', '[onclick*="ExportImport"]',
    '[data-action="export"]', '[data-action="import"]'
  ];

  document.querySelectorAll(selectors.join(',')).forEach(function(el) {
    el.remove();
  });

  // Fallback text query for standard buttons and link elements
  document.querySelectorAll('button, a.btn, div.btn').forEach(function(btn) {
    var txt = (btn.innerText || btn.textContent || '').toLowerCase();
    if (txt.includes('export') || txt.includes('import')) {
      btn.remove();
    }
  });
}

// ==== SEARCH UI INJECTION ====
function setupSearchUI() {
  var searchInput = document.getElementById('searchBox');
  if (!searchInput) return;

  var parent = searchInput.parentElement;
  
  if (!parent.classList.contains('dynamic-search-wrapper')) {
    var container = document.createElement('div');
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

// ==== SEARCH & FILTERING LOGIC ====
function applyFilters() {
  var searchInput = document.getElementById('searchBox');
  var countEl = document.getElementById('searchMatchCount');
  var prevBtn = document.getElementById('searchPrevBtn');
  var nextBtn = document.getElementById('searchNextBtn');

  // Reset row visibility and search highlights
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
    if (typeof updateNextPickMarker === 'function') updateNextPickMarker();
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

  // Re-calculate and re-apply pick line indicator after filtering
  if (typeof updateNextPickMarker === 'function') {
    updateNextPickMarker();
  }
}

// ==== MULTI-MATCH NAVIGATION CONTROLLER ====
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

  searchMatches.forEach(function(row) {
    row.classList.remove('search-highlight');
  });

  var targetRow = searchMatches[currentSearchIndex];
  if (!targetRow) return;

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
