/**
 * FANTASY DRAFT CHEAT SHEET 2026
 * Real-time draft companion with live recommendations, autosave, and position tracking
 */

// ==== CONFIGURATION ====
var AUTOSAVE_KEY = 'draft-state-v1';
var AUTOSAVE_ENABLED_KEY = 'draft-autosave-enabled-v1';
var FINAL_SUMMARY_SHOWN_KEY = 'draft-final-summary-shown-v1';
var DRAFT_SESSION_REGISTRY_KEY = 'war-room-draft-sessions-v1';
var ACTIVE_DRAFT_SESSION_KEY = 'war-room-active-draft-session-v1';
var activeDraftSessionId = 'legacy';
var DEBUG_DRAFT_SCORING = false;
var TEAM_COLORS = {
  ARI:'#97233F', ATL:'#A71930', BAL:'#241773', BUF:'#00338D', CAR:'#0085CA',
  CHI:'#0B162A', CIN:'#FB4F14', CLE:'#FF3C00', DAL:'#003594', DEN:'#FB4F14',
  DET:'#0076B6', GB:'#203731', HOU:'#03202F', IND:'#002C5F', JAX:'#101820',
  KC:'#E31837', LAC:'#0080C6', LAR:'#003594', LV:'#A5ACAF', MIA:'#008E97',
  MIN:'#4F2683', NE:'#002244', NO:'#D3BC8D', NYG:'#0B2265', NYJ:'#125740',
  PHI:'#004C54', PIT:'#FFB612', SEA:'#69BE28', SF:'#AA0000', TB:'#D50A0A',
  TEN:'#4B92DB', WAS:'#5A1414'
};

// ==== INTERNAL STATE ====
var currentPosFilter = 'ALL';
var resetArmed = false;
var resetArmTimer = null;
var deleteDraftArmed = false;
var deleteDraftArmTimer = null;
var _saveTimer = null;
var _finalSummaryTimer = null;
var draftMarkMode = 'taken';
var lastFocusedElementBeforeModal = null;
var customBoardEnabled = false;
var recommendationAudit = [];
var searchMatches = [];
var currentSearchIndex = -1;
var developerToolsPromise = null;
var _draftRowsCache = null;
var _draftRowsByCanonicalNameCache = null;
window.ORIGINAL_ORDER = [];

function invalidateDraftRowCaches() {
  _draftRowsCache = null;
  _draftRowsByCanonicalNameCache = null;
}

function getCachedDraftRows() {
  if (!_draftRowsCache) {
    _draftRowsCache = Array.prototype.slice.call(
      document.querySelectorAll('tr.draftrow')
    );
  }
  return _draftRowsCache;
}

function isDraftEngineDebugEnabled() {
  return DEBUG_DRAFT_SCORING || Boolean(
    typeof DRAFT_DEBUG !== 'undefined' && DRAFT_DEBUG
  );
}

function draftScoringLog() {
  if (!isDraftEngineDebugEnabled()) return;
  console.log.apply(console, arguments);
}

function loadDeveloperTools() {
  if (typeof window.runDraftEngineTests === 'function') {
    return Promise.resolve();
  }

  if (!developerToolsPromise) {
    developerToolsPromise = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'developer-tools.js?v=20260822-8';
      script.onload = resolve;
      script.onerror = function() {
        developerToolsPromise = null;
        reject(new Error('Developer tools failed to load.'));
      };
      document.head.appendChild(script);
    });
  }

  return developerToolsPromise;
}

function runDeveloperTool(functionName, args) {
  return loadDeveloperTools()
    .then(function() {
      var tool = window[functionName];
      if (typeof tool !== 'function') {
        throw new Error('Developer tool is unavailable: ' + functionName);
      }
      return tool.apply(window, Array.isArray(args) ? args : []);
    })
    .catch(function(error) {
      var output = document.getElementById('developer-test-results');
      if (output) output.textContent = error.message;
      console.error(error);
      return null;
    });
}

// ==== SAFE UTILITY CALLERS ====
function safeCall(fnName) {
  if (typeof window[fnName] === 'function') {
    try { window[fnName](); } catch(e) { console.warn('SafeCall failed for ' + fnName, e); }
  }
}

// ==== CORE DASHBOARD & RECOMMENDER UPDATES ====
function updateMyTeam() {
  var starterLimits = getConfiguredStarterLimits();
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
  var byeCounts = {};

  var players = [];

  document.querySelectorAll('tr.draftrow.drafted-mine').forEach(function(row) {
    var name = row.getAttribute('data-name') || 'Unknown Player';
    var pos = row.getAttribute('data-pos') || 'N/A';

    if (counts[pos] !== undefined) {
      counts[pos]++;
    }
    var bye = String(row.getAttribute('data-bye') || '').trim();
    if (bye && bye !== '--' && bye !== '-' && bye !== '0') {
      byeCounts[bye] = (byeCounts[bye] || 0) + 1;
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

    if (player.pos === 'QB' && starters.QB.length < starterLimits.QB) {
      starters.QB.push(player);
    }

    else if (player.pos === 'RB' && starters.RB.length < starterLimits.RB) {
      starters.RB.push(player);
    }

    else if (player.pos === 'WR' && starters.WR.length < starterLimits.WR) {
      starters.WR.push(player);
    }

    else if (player.pos === 'TE' && starters.TE.length < starterLimits.TE) {
      starters.TE.push(player);
    }

    else if (player.pos === 'K' && starters.K.length < starterLimits.K) {
      starters.K.push(player);
    }

    else if (player.pos === 'DST' && starters.DST.length < starterLimits.DST) {
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
      starters.FLEX.length < starterLimits.FLEX &&
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
      totalStarters + ' / ' + getConfiguredStarterTotal() + ' starters';
  }

  /* ---- Update My Team button ---- */

  var myTeamButton = document.querySelector('.myteam-toggle');

  if (myTeamButton) {
    var panel = document.getElementById('myteam-panel');
    var isOpen = panel && panel.classList.contains('open');

    myTeamButton.innerText =
      (isOpen ? 'Hide My Draft' : 'My Draft') +
      ' · ' +
      players.length;
  }

  var lineupPanel = document.getElementById('lineup-panel');
  var shouldRenderLineup = Boolean(
    document.getElementById('myteam-panel')?.classList.contains('open') &&
    lineupPanel?.classList.contains('active')
  );

  if (!shouldRenderLineup) return;

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
  panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

  if (isOpen) {
    updateMyTeam();
    updateDraftSummary();
    var closeButton = panel.querySelector('.close-btn');
    if (closeButton) closeButton.focus();
  }

  if (button) {
    var draftedCount = document.querySelectorAll('tr.draftrow.drafted-mine').length;
    button.classList.toggle('active', isOpen);
    button.innerText = (isOpen ? 'Hide My Draft' : 'My Draft') + ' · ' + draftedCount;
  }
}

function setDraftHubView(view) {
  var selectedView = view === 'lineup' ? 'lineup' : 'summary';

  document.querySelectorAll('.draft-hub-view').forEach(function(panel) {
    var isActive = panel.id === selectedView + '-panel';
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  document.querySelectorAll('.draft-hub-tab').forEach(function(tab) {
    var isSelected = tab.id === 'draft-' + selectedView + '-tab';
    tab.classList.toggle('active', isSelected);
    tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    tab.setAttribute('tabindex', isSelected ? '0' : '-1');
  });

  if (selectedView === 'summary') updateDraftSummary();
  if (selectedView === 'lineup') updateMyTeam();
}

function escapeSummaryHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDraftRowDisplayName(row) {
  var cachedName = row && row.getAttribute('data-display-name');
  if (cachedName) return cachedName;
  var playerCell = row && row.querySelector('.pname');
  if (!playerCell) return row ? row.getAttribute('data-name') || 'Unknown player' : 'Unknown player';

  var clone = playerCell.cloneNode(true);
  clone.querySelectorAll('.posrk, .mobile-handcuff, .rank-controls').forEach(function(element) {
    element.remove();
  });

  var displayName = (clone.textContent || '').replace(/\s+/g, ' ').trim() || 'Unknown player';
  if (row && displayName !== 'Unknown player') row.setAttribute('data-display-name', displayName);
  return displayName;
}

function getDraftSummaryGrade(averageEcrValue) {
  if (averageEcrValue == null || !Number.isFinite(averageEcrValue)) return '—';
  if (averageEcrValue >= 10) return 'A+';
  if (averageEcrValue >= 5) return 'A';
  if (averageEcrValue >= 0) return 'B';
  if (averageEcrValue >= -5) return 'C';
  if (averageEcrValue >= -10) return 'D';
  return 'F';
}

function formatDraftSummaryDelta(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return (value > 0 ? '+' : '') + value.toFixed(1);
}

function getCompletedDraftPickCount() {
  return document.querySelectorAll(
    'tr.draftrow.drafted-mine[data-pick], tr.draftrow.drafted-other[data-pick]'
  ).length;
}

function getDraftCompletionStatus(state) {
  state = state || getDraftAssistantState();
  var numberedPicks = getCompletedDraftPickCount();
  var myRosterCount = document.querySelectorAll('tr.draftrow.drafted-mine').length;
  var authoritative = state.totalPicks > 0 && numberedPicks >= state.totalPicks;
  var externalComplete = Boolean(window.latestEspnSyncMeta && window.latestEspnSyncMeta.draftComplete);
  var provisional = !authoritative && externalComplete && myRosterCount >= state.rounds;
  return {
    complete: authoritative || provisional,
    authoritative: authoritative,
    provisional: provisional,
    externalComplete: externalComplete,
    numberedPicks: numberedPicks,
    myRosterCount: myRosterCount
  };
}

function isDraftComplete(state) {
  return getDraftCompletionStatus(state).complete;
}

function getRosterByeCounts(rows) {
  var counts = {};
  (rows || []).forEach(function(row) {
    var bye = String(row && row.getAttribute ? row.getAttribute('data-bye') || '' : row && row.bye || '').trim();
    if (bye && bye !== '--' && bye !== '-' && bye !== '0') counts[bye] = (counts[bye] || 0) + 1;
  });
  return counts;
}

function buildTimedRosterGuidance(state, positionCounts, flexFilled, myRows) {
  var round = Math.min(state.rounds, Math.max(1, Math.ceil(state.currentPick / state.teams)));
  var phase = getDraftPhase(state.currentPick, state.teams).phase;
  var remainingSelections = state.myPicks.filter(function(pick) {
    return pick >= state.currentPick;
  }).length;
  var openCore = [];
  if (positionCounts.QB < 1) openCore.push('QB');
  if (positionCounts.RB < 2) openCore.push('RB' + (positionCounts.RB === 0 ? ' ×2' : ''));
  if (positionCounts.WR < 2) openCore.push('WR' + (positionCounts.WR === 0 ? ' ×2' : ''));
  if (positionCounts.TE < 1) openCore.push('TE');
  if (!flexFilled) openCore.push('FLEX');

  var primary = '';
  var secondary = '';
  var tone = 'steady';

  if (isDraftComplete(state)) {
    primary = 'Your draft is complete. Review the final report and save the best undrafted ECR values to your waiver watch.';
    secondary = 'The live recommendation and pressure tools are now retired for this draft.';
  } else if (round <= 3) {
    primary = positionCounts.RB + positionCounts.WR < 2
      ? 'Build the RB/WR foundation with your next selection unless an elite value falls.'
      : 'Your foundation is taking shape; keep following the strongest ECR value.';
    secondary = 'QB and TE can wait when their current tiers remain healthy. Save K and DST for the final two rounds.';
  } else if (round <= 7) {
    if (positionCounts.WR >= 3 && positionCounts.RB < 2) {
      primary = 'Excellent WR advantage; RB workload stability is now the priority when values are close.';
      tone = 'watch';
    } else if (openCore.length) {
      primary = 'Starter-build window: address ' + openCore.slice(0, 3).join(', ') + ' within your next two selections.';
      tone = 'watch';
    } else {
      primary = 'Your offensive starters are covered; add RB/WR value and upside.';
    }
    secondary = 'Continue saving K and DST for the final two rounds.';
  } else if (round <= 11) {
    if (openCore.length) {
      primary = 'Do not let the starter window close: prioritize ' + openCore.join(', ') + ' now.';
      tone = 'urgent';
    } else {
      primary = 'Starter structure is secure. Build RB/WR depth and high-upside bench value.';
    }
    secondary = 'Reserve the endgame for K/DST unless a required starter is still open.';
  } else {
    var endgameNeeds = [];
    if (positionCounts.K < 1) endgameNeeds.push('K');
    if (positionCounts.DST < 1) endgameNeeds.push('DST');
    if (openCore.length) {
      primary = 'Immediate roster warning: fill ' + openCore.join(', ') + ' before the draft ends.';
      tone = 'urgent';
    } else if (endgameNeeds.length && remainingSelections <= endgameNeeds.length) {
      primary = 'Use your remaining ' + remainingSelections + ' selection' + (remainingSelections === 1 ? '' : 's') + ' on ' + endgameNeeds.join(' and ') + '.';
      tone = 'urgent';
    } else if (endgameNeeds.length) {
      primary = 'Endgame plan: reserve your final ' + endgameNeeds.length + ' pick' + (endgameNeeds.length === 1 ? '' : 's') + ' for ' + endgameNeeds.join(' and ') + '.';
      tone = 'watch';
    } else {
      primary = 'Required starters are covered. Finish with upside and injury-away RB/WR depth.';
    }
    secondary = 'Avoid low-upside bench duplicates when a clearer path to opportunity is available.';
  }

  var byeCounts = getRosterByeCounts(myRows);
  var crowdedByes = Object.keys(byeCounts).filter(function(bye) {
    return byeCounts[bye] >= 3;
  }).sort(function(a, b) {
    return byeCounts[b] - byeCounts[a];
  });
  if (crowdedByes.length) {
    secondary = 'Bye-week watch: ' + crowdedByes.slice(0, 2).map(function(bye) {
      return byeCounts[bye] + ' players in Week ' + bye;
    }).join(' · ') + '. ' + secondary;
    var maxByeCount = byeCounts[crowdedByes[0]];
    tone = maxByeCount >= 5 ? 'urgent' : tone === 'urgent' ? tone : 'watch';
  }

  return (
    '<div class="roster-guidance roster-guidance-' + tone + '">' +
      '<div class="roster-guidance-heading"><span>ROSTER PLAN</span><b>Round ' + round + ' · ' + escapeSummaryHtml(phase) + '</b></div>' +
      '<strong>' + escapeSummaryHtml(primary) + '</strong>' +
      '<small>' + escapeSummaryHtml(secondary) + '</small>' +
    '</div>'
  );
}

function updateDataFreshnessIndicator() {
  var element = document.getElementById('data-freshness');
  if (!element) return;
  var meta = typeof FANTASYPROS_2026_DATASET_META !== 'undefined'
    ? FANTASYPROS_2026_DATASET_META
    : null;
  var snapshotDate = meta && meta.sourceSnapshotDate ? new Date(meta.sourceSnapshotDate + 'T00:00:00') : null;

  if (!snapshotDate || Number.isNaN(snapshotDate.getTime())) {
    element.className = 'data-freshness data-freshness-unknown';
    element.textContent = 'FantasyPros snapshot date unavailable';
    return;
  }

  var ageDays = Math.max(0, Math.floor((Date.now() - snapshotDate.getTime()) / 86400000));
  var status = ageDays <= 7 ? 'Fresh' : ageDays <= 21 ? 'Review soon' : 'Update recommended';
  var tone = ageDays <= 7 ? 'fresh' : ageDays <= 21 ? 'review' : 'stale';
  element.className = 'data-freshness data-freshness-' + tone;
  element.textContent = (meta && meta.localOverride ? 'FantasyPros local update · ' : 'FantasyPros PPR · ') + snapshotDate.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  }) + ' · ' + status;
}

function updateDraftSummary() {
  var content = document.getElementById('summary-content');
  var countBadge = document.getElementById('summary-pick-count');
  if (!content) return;

  var state = getDraftAssistantState();
  var allDraftedCount = getCompletedDraftPickCount();
  var summaryPanel = document.getElementById('summary-panel');
  var shouldRenderSummary = Boolean(
    document.getElementById('myteam-panel')?.classList.contains('open') &&
    summaryPanel?.classList.contains('active')
  );

  if (!shouldRenderSummary && allDraftedCount < state.totalPicks) return;

  var myRows = Array.prototype.slice.call(
    document.querySelectorAll('tr.draftrow.drafted-mine')
  );
  var positionCounts = {QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0};

  var picks = myRows.map(function(row, index) {
    var position = row.getAttribute('data-pos') || '';
    if (positionCounts[position] !== undefined) positionCounts[position]++;

    var pick = Number(row.getAttribute('data-pick')) || null;
    var ecr = getDraftRowNumber(row, 'data-ecr');
    var adp = getDraftRowNumber(row, 'data-adp');

    return {
      name: getDraftRowDisplayName(row),
      position: position,
      bye: String(row.getAttribute('data-bye') || '').trim(),
      pick: pick,
      ecr: ecr,
      adp: adp,
      ecrValue: pick != null && ecr != null ? pick - ecr : null,
      marketValue: pick != null && adp != null ? pick - adp : null,
      originalIndex: index
    };
  });

  picks.sort(function(a, b) {
    if (a.pick == null && b.pick == null) return a.originalIndex - b.originalIndex;
    if (a.pick == null) return 1;
    if (b.pick == null) return -1;
    return a.pick - b.pick;
  });

  var starterLimits = getConfiguredStarterLimits();
  var flexFilled = Math.min(starterLimits.FLEX,
    Math.max(0, positionCounts.RB - starterLimits.RB) +
    Math.max(0, positionCounts.WR - starterLimits.WR) +
    Math.max(0, positionCounts.TE - starterLimits.TE)
  );
  var startersFilled =
    Math.min(positionCounts.QB, starterLimits.QB) +
    Math.min(positionCounts.RB, starterLimits.RB) +
    Math.min(positionCounts.WR, starterLimits.WR) +
    Math.min(positionCounts.TE, starterLimits.TE) +
    flexFilled +
    Math.min(positionCounts.K, starterLimits.K) +
    Math.min(positionCounts.DST, starterLimits.DST);

  var knownEcrValues = picks.filter(function(player) {
    return player.ecrValue != null;
  });
  var averageEcrValue = knownEcrValues.length
    ? knownEcrValues.reduce(function(total, player) { return total + player.ecrValue; }, 0) / knownEcrValues.length
    : null;
  var grade = getDraftSummaryGrade(averageEcrValue);
  var progress = state.totalPicks
    ? Math.min(100, Math.round((allDraftedCount / state.totalPicks) * 100))
    : 0;
  var currentRound = Math.min(
    state.rounds,
    Math.max(1, Math.ceil(state.currentPick / state.teams))
  );

  if (countBadge) countBadge.textContent = picks.length + (picks.length === 1 ? ' pick' : ' picks');

  var completion = getDraftCompletionStatus(state);
  var progressCopy = completion.externalComplete && !completion.authoritative
    ? 'Draft appears complete · ' + completion.numberedPicks + ' of ' + state.totalPicks + ' numbered picks synced'
    : allDraftedCount + ' of ' + state.totalPicks + ' overall picks complete';

  var html =
    '<div class="summary-progress-row">' +
      '<div><strong>Round ' + currentRound + ' of ' + state.rounds + '</strong>' +
        '<span>' + progressCopy + '</span></div>' +
      '<span>' + progress + '%</span>' +
    '</div>' +
    '<div class="summary-progress-track"><span style="width:' + progress + '%"></span></div>' +
    '<div class="summary-stat-grid">' +
      '<div class="summary-stat"><span>My roster</span><strong>' + picks.length + ' / ' + state.rounds + '</strong><small>players drafted</small></div>' +
      '<div class="summary-stat"><span>Starting lineup</span><strong>' + startersFilled + ' / ' + getConfiguredStarterTotal() + '</strong><small>slots filled</small></div>' +
      '<div class="summary-stat summary-grade"><span>ECR value grade</span><strong>' + grade + '</strong><small>' +
        (averageEcrValue == null ? 'record pick numbers to grade' : formatDraftSummaryDelta(averageEcrValue) + ' picks vs ECR on average') +
      '</small></div>' +
    '</div>';

  html += buildTimedRosterGuidance(state, positionCounts, flexFilled, myRows);

  if (!picks.length) {
    html +=
      '<div class="summary-empty">' +
        '<div class="summary-empty-icon">&#127944;</div>' +
        '<strong>Your draft story starts with your first pick.</strong>' +
        '<span>Mark a drafted player as <b>Mine</b> and this report will build automatically.</span>' +
      '</div>';
    content.innerHTML = html;
    return;
  }

  var positionTargets = getConfiguredDedicatedStarterLimits();
  html += '<div class="summary-section"><h3>Roster construction</h3><div class="summary-position-grid">';
  ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].forEach(function(position) {
    var count = positionCounts[position];
    var target = positionTargets[position];
    var statusClass = count >= target ? 'filled' : 'open';
    html +=
      '<div class="summary-position ' + statusClass + '">' +
        '<span class="pos-pill pos-' + position + '">' + position + '</span>' +
        '<strong>' + count + '</strong><small>starter target ' + target + '</small>' +
      '</div>';
  });
  html +=
    '<div class="summary-position ' + (flexFilled ? 'filled' : 'open') + '">' +
      '<span class="pos-pill pos-FLEX">FLEX</span>' +
      '<strong>' + flexFilled + '</strong><small>starter target 1</small>' +
    '</div>';
  html += '</div></div>';

  var bestValue = knownEcrValues.filter(function(player) { return player.ecrValue > 0; })
    .sort(function(a, b) { return b.ecrValue - a.ecrValue; })[0] || null;
  var biggestReach = knownEcrValues.filter(function(player) { return player.ecrValue < 0; })
    .sort(function(a, b) { return a.ecrValue - b.ecrValue; })[0] || null;
  var knownMarketValues = picks.filter(function(player) { return player.marketValue != null; });
  var marketWins = knownMarketValues.filter(function(player) { return player.marketValue > 0; }).length;
  var openStarterLabels = [];
  Object.keys(positionTargets).forEach(function(position) {
    var missing = Math.max(0, positionTargets[position] - positionCounts[position]);
    if (missing) openStarterLabels.push(position + (missing > 1 ? ' ×' + missing : ''));
  });
  if (!flexFilled) openStarterLabels.push('FLEX');

  html +=
    '<div class="summary-section"><h3>Draft insights</h3><div class="summary-insights">' +
      '<div><span>Best consensus value</span><strong>' +
        (bestValue ? escapeSummaryHtml(bestValue.name) + ' (' + formatDraftSummaryDelta(bestValue.ecrValue) + ')' : 'No value picks yet') +
      '</strong></div>' +
      '<div><span>Largest reach vs ECR</span><strong>' +
        (biggestReach ? escapeSummaryHtml(biggestReach.name) + ' (' + formatDraftSummaryDelta(biggestReach.ecrValue) + ')' : 'No reaches yet') +
      '</strong></div>' +
      '<div><span>Picked after market ADP</span><strong>' + marketWins + ' of ' + knownMarketValues.length + '</strong></div>' +
      '<div><span>Open starter slots</span><strong>' +
        (openStarterLabels.length ? openStarterLabels.join(', ') : 'Starting lineup complete') +
      '</strong></div>' +
    '</div></div>';

  html +=
    '<div class="summary-section"><div class="summary-section-heading"><h3>My picks</h3>' +
      '<span>Positive value means you drafted the player later than consensus.</span></div>' +
      '<div class="summary-picks-table-wrap"><table class="summary-picks-table"><thead><tr>' +
        '<th>Pick</th><th>Player</th><th>Pos</th><th>ECR</th><th>ADP</th><th>Value</th>' +
      '</tr></thead><tbody>';

  picks.forEach(function(player) {
    var valueClass = player.ecrValue == null ? 'neutral' : player.ecrValue >= 0 ? 'positive' : 'negative';
    html +=
      '<tr><td>' + (player.pick == null ? '—' : '#' + player.pick) + '</td>' +
      '<td><strong>' + escapeSummaryHtml(player.name) + '</strong></td>' +
      '<td><span class="pos-pill pos-' + escapeSummaryHtml(player.position) + '">' + escapeSummaryHtml(player.position) + '</span></td>' +
      '<td>' + (player.ecr == null ? '—' : player.ecr.toFixed(0)) + '</td>' +
      '<td>' + (player.adp == null ? '—' : player.adp.toFixed(1)) + '</td>' +
      '<td class="summary-value ' + valueClass + '">' + formatDraftSummaryDelta(player.ecrValue) + '</td></tr>';
  });
  html += '</tbody></table></div></div>';

  var finalSummaryData = {
    picks: picks,
    positionCounts: positionCounts,
    startersFilled: startersFilled,
    averageEcrValue: averageEcrValue,
    grade: grade
  };
  window.latestFinalDraftSummaryData = finalSummaryData;

  if (completion.complete) {
    html += '<button class="summary-final-report-btn" onclick="showFinalDraftSummary()">View final draft report</button>';
  }

  content.innerHTML = html;
  maybeShowFinalDraftSummary(
    state,
    picks,
    positionCounts,
    startersFilled,
    averageEcrValue,
    grade
  );
}

function toggleSummary() {
  var hub = document.getElementById('myteam-panel');
  if (!hub) return;

  if (!hub.classList.contains('open')) hub.classList.add('open');
  setDraftHubView('summary');
  updateMyTeam();
  hub.scrollIntoView({behavior: 'smooth', block: 'start'});
}

function getFinalDraftAlternative(player) {
  if (!player || player.pick == null || player.ecr == null) return null;

  return getDraftAssistantPlayers()
    .filter(function(candidate) {
      if (!candidate || !candidate.row || candidate.ecr == null) return false;
      var candidatePick = Number(candidate.row.getAttribute('data-pick')) || null;
      return candidatePick != null &&
        candidatePick > player.pick &&
        candidate.ecr < player.ecr &&
        candidate.name !== player.name;
    })
    .sort(function(a, b) { return a.ecr - b.ecr; })[0] || null;
}

function getFinalWaiverWatch(limit) {
  var pool = getDraftAssistantPlayers()
    .filter(function(player) {
      return player && player.available && player.ecr != null &&
        ['QB', 'RB', 'WR', 'TE'].indexOf(player.position) >= 0;
    })
    .sort(function(a, b) {
      return Number(a.ecr) - Number(b.ecr);
    });
  var rosterCounts = {QB:0, RB:0, WR:0, TE:0};
  var lockedQuarterback = false;
  getCachedDraftRows().filter(function(row) {
    return row.classList.contains('drafted-mine');
  }).forEach(function(row) {
    var position = String(row.getAttribute('data-pos') || '').toUpperCase();
    if (rosterCounts[position] != null) rosterCounts[position]++;
    if (position === 'QB') {
      var ecr = getDraftRowNumber(row, 'data-ecr');
      if (ecr != null && ecr <= 36) lockedQuarterback = true;
    }
  });
  var target = Math.max(1, Number(limit) || 6);
  var quotas = {
    RB: rosterCounts.RB < 4 ? 3 : 2,
    WR: rosterCounts.WR < 5 ? 3 : 2,
    TE: 1,
    QB: lockedQuarterback ? 0 : 1
  };
  var selected = [];
  ['RB', 'WR', 'TE', 'QB'].forEach(function(position) {
    pool.filter(function(player) { return player.position === position; })
      .slice(0, quotas[position])
      .forEach(function(player) {
        if (selected.length < target) selected.push(player);
      });
  });
  if (selected.length < target) {
    pool.forEach(function(player) {
      if (selected.length >= target || selected.indexOf(player) >= 0) return;
      if (player.position === 'QB' && lockedQuarterback) return;
      selected.push(player);
    });
  }
  return selected.sort(function(a, b) { return Number(a.ecr) - Number(b.ecr); }).slice(0, target);
}

function getWaiverWatchRole(player) {
  if (!player) return '';
  if (player.position === 'RB') return 'RB depth';
  if (player.position === 'WR') return 'WR upside';
  if (player.position === 'TE') return 'TE contingency';
  if (player.position === 'QB') return 'Streaming QB';
  return '';
}

function buildWaiverWatchHtml(players, compact) {
  if (!players || !players.length) {
    return '<div class="waiver-watch-empty">No undrafted ECR-ranked skill players remain.</div>';
  }

  return '<div class="waiver-watch-list ' + (compact ? 'compact' : '') + '">' + players.map(function(player) {
    var name = player.row ? getDraftRowDisplayName(player.row) : player.name;
    return (
      '<div class="waiver-watch-player">' +
        '<span class="pos-pill pos-' + escapeSummaryHtml(player.position) + '">' + escapeSummaryHtml(player.position) + '</span>' +
        '<strong>' + escapeSummaryHtml(name) + '</strong>' +
        '<small>' + escapeSummaryHtml(getWaiverWatchRole(player)) + ' · ECR ' + Number(player.ecr).toFixed(0) + (player.adp != null ? ' · ADP ' + Number(player.adp).toFixed(1) : '') + '</small>' +
      '</div>'
    );
  }).join('') + '</div>';
}

function buildFinalDraftSummaryHtml(picks, positionCounts, startersFilled, averageEcrValue, grade) {
  var knownValues = picks.filter(function(player) { return player.ecrValue != null; });
  var knownMarket = picks.filter(function(player) { return player.marketValue != null; });
  var averageMarketValue = knownMarket.length
    ? knownMarket.reduce(function(total, player) { return total + player.marketValue; }, 0) / knownMarket.length
    : null;
  var bestValue = knownValues.slice().sort(function(a, b) { return b.ecrValue - a.ecrValue; })[0] || null;
  var materialReaches = knownValues.filter(function(player) {
    return player.ecrValue <= -5 && player.position !== 'K' && player.position !== 'DST';
  })
    .sort(function(a, b) { return a.ecrValue - b.ecrValue; });
  var strengths = [];
  var improvements = [];
  var waiverWatch = getFinalWaiverWatch(6);
  var completion = getDraftCompletionStatus();
  var byeCounts = getRosterByeCounts(picks);
  var crowdedByes = Object.keys(byeCounts).filter(function(bye) {
    return byeCounts[bye] >= 3;
  }).sort(function(a, b) { return byeCounts[b] - byeCounts[a]; });
  var openingPicks = picks.slice().sort(function(a, b) {
    return Number(a.pick || 9999) - Number(b.pick || 9999);
  }).slice(0, 4);
  var openingWrCount = openingPicks.filter(function(player) { return player.position === 'WR'; }).length;
  var firstRb = picks.filter(function(player) { return player.position === 'RB' && player.pick != null; })
    .sort(function(a, b) { return a.pick - b.pick; })[0] || null;

  if (bestValue && bestValue.ecrValue > 0) {
    strengths.push(
      '<b>' + escapeSummaryHtml(bestValue.name) + '</b> was your best value at ' +
      formatDraftSummaryDelta(bestValue.ecrValue) + ' picks versus ECR.'
    );
  }

  if (averageEcrValue != null && averageEcrValue >= 0) {
    strengths.push('Your roster beat FantasyPros ECR by <b>' + formatDraftSummaryDelta(averageEcrValue) + ' picks per selection</b> on average.');
  }

  if (averageMarketValue != null && averageMarketValue >= 0) {
    strengths.push('You generally waited for market value, drafting players <b>' + formatDraftSummaryDelta(averageMarketValue) + ' picks after ADP</b> on average.');
  }

  if (startersFilled === getConfiguredStarterTotal()) {
    strengths.push('You completed every starting-lineup slot.');
  }

  if (positionCounts.RB >= 3 && positionCounts.WR >= 3) {
    strengths.push('You built usable depth at both RB and WR.');
  }

  if (openingWrCount >= 3) {
    strengths.push('Your opening created an elite <b>WR foundation</b> with three receivers in the first four selections.');
  }

  if (firstRb && Math.ceil(firstRb.pick / Math.max(1, LEAGUE_SIZE)) >= 5) {
    improvements.push('The WR-heavy opening pushed your first RB to <b>Round ' +
      Math.ceil(firstRb.pick / Math.max(1, LEAGUE_SIZE)) +
      '</b>. The depth is useful, but the room depends more on uncertain workloads than an early anchor RB would.');
  }

  if (crowdedByes.length) {
    var severeByes = crowdedByes.filter(function(bye) { return byeCounts[bye] >= 5; });
    improvements.push('Bye-week concentration: <b>' + crowdedByes.slice(0, 3).map(function(bye) {
      return byeCounts[bye] + ' players in Week ' + bye;
    }).join(' and ') + '</b>.' + (severeByes.length
      ? ' Five-player clusters can remove several starters at once.'
      : ' Monitor lineup coverage before adding another player from those weeks.'));
  }

  materialReaches.slice(0, 3).forEach(function(player) {
    var alternative = getFinalDraftAlternative(player);
    var advice =
      '<b>' + escapeSummaryHtml(player.name) + ' at #' + player.pick + '</b> was ' +
      Math.abs(player.ecrValue).toFixed(0) + ' picks ahead of ECR.';

    if (alternative) {
      advice += ' <b>' + escapeSummaryHtml(alternative.name) + '</b> (ECR #' + alternative.ecr.toFixed(0) +
        ') was still available and would have followed consensus value more closely.';
    } else {
      advice += ' Waiting longer or taking a higher-ECR option would have reduced the reach.';
    }

    improvements.push(advice);
  });

  var starterLimits = getConfiguredStarterLimits();
  var requiredCounts = getConfiguredDedicatedStarterLimits();
  var missing = [];
  Object.keys(requiredCounts).forEach(function(position) {
    var shortfall = Math.max(0, requiredCounts[position] - positionCounts[position]);
    if (shortfall) missing.push(position + (shortfall > 1 ? ' ×' + shortfall : ''));
  });
  if (startersFilled < getConfiguredStarterTotal()) {
    var flexMissing = Math.max(0,
      starterLimits.FLEX - Math.min(starterLimits.FLEX,
        Math.max(0, positionCounts.RB - starterLimits.RB) +
        Math.max(0, positionCounts.WR - starterLimits.WR) +
        Math.max(0, positionCounts.TE - starterLimits.TE)
      )
    );
    if (flexMissing) missing.push('FLEX');
  }
  if (missing.length) {
    improvements.push('Your starting lineup finished with open needs at <b>' + missing.join(', ') + '</b>.');
  }

  ['K', 'DST'].forEach(function(position) {
    var selection = picks.find(function(player) {
      return player.position === position && player.pick != null;
    });
    var selectedRound = selection
      ? Math.ceil(selection.pick / Math.max(1, LEAGUE_SIZE))
      : null;
    if (selection && selectedRound < Math.max(1, TOTAL_ROUNDS - 1)) {
      improvements.push('<b>' + position + ' was selected in Round ' +
        selectedRound +
        '.</b> Waiting until the final two rounds usually preserves more upside at RB/WR.');
    } else if (selection) {
      strengths.push('You reserved <b>' + position + ' for Round ' + selectedRound +
        '</b>, preserving earlier selections for skill-position value.');
    }
  });

  if (!strengths.length) {
    strengths.push('You completed the draft and created a full record that can guide your next one.');
  }
  if (!improvements.length) {
    improvements.push('No major ECR reaches or starter-construction issues were detected. Your next edge is monitoring news and working waivers.');
  }

  var headline = grade === 'A+' || grade === 'A'
    ? 'Excellent value draft'
    : grade === 'B'
      ? 'Strong, disciplined draft'
      : grade === 'C'
        ? 'Solid roster with value left on the table'
        : grade === '—'
          ? 'Draft complete'
          : 'A few reaches held this draft back';

  return (
    '<div class="final-summary-kicker">' + (completion.provisional ? 'PROVISIONAL FINAL REPORT' : 'DRAFT COMPLETE') + '</div>' +
    '<div class="final-summary-title-row">' +
      '<div><h2 id="final-summary-title">&#127942; ' + headline + '</h2>' +
        '<p>Measured against FantasyPros 2026 PPR ECR for value and ESPN PPR ADP for timing when connected, with FantasyPros ADP fallback.</p></div>' +
      '<div class="final-grade"><span>VALUE<br>GRADE</span><strong>' + grade + '</strong></div>' +
    '</div>' +
    '<div class="final-summary-stats">' +
      '<div><span>Roster</span><strong>' + picks.length + ' picks</strong></div>' +
      '<div><span>Starters</span><strong>' + startersFilled + ' / ' + getConfiguredStarterTotal() + '</strong></div>' +
      '<div><span>Avg. vs ECR</span><strong>' + formatDraftSummaryDelta(averageEcrValue) + '</strong></div>' +
      '<div><span>Avg. vs ADP</span><strong>' + formatDraftSummaryDelta(averageMarketValue) + '</strong></div>' +
    '</div>' +
    '<div class="final-feedback-grid">' +
      '<section><h3>&#10003; What went well</h3><ul>' + strengths.map(function(item) { return '<li>' + item + '</li>'; }).join('') + '</ul></section>' +
      '<section class="improve"><h3>&#8593; What to improve</h3><ul>' + improvements.map(function(item) { return '<li>' + item + '</li>'; }).join('') + '</ul></section>' +
    '</div>' +
    '<section class="final-waiver-watch"><div><h3>Waiver watch</h3><p>Best undrafted skill-position players by FantasyPros PPR ECR.</p></div>' +
      buildWaiverWatchHtml(waiverWatch, false) + '</section>' +
    '<div class="final-summary-note">' + (completion.provisional
      ? 'ESPN reports the draft complete and your full roster is known, but some opponent pick numbers are still syncing. '
      : '') + 'This is a process review, not a season prediction. Injuries, roles, and waiver moves will change the final outcome.</div>' +
    '<button class="final-summary-done" onclick="closeFinalDraftSummary()">Back to my draft</button>'
  );
}

function openFinalDraftSummary(picks, positionCounts, startersFilled, averageEcrValue, grade) {
  var modal = document.getElementById('final-summary-modal');
  var content = document.getElementById('final-summary-content');
  if (!modal || !content) return;

  content.innerHTML = buildFinalDraftSummaryHtml(
    picks,
    positionCounts,
    startersFilled,
    averageEcrValue,
    grade
  );
  lastFocusedElementBeforeModal = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('final-summary-open');
  var dialog = modal.querySelector('.final-summary-dialog');
  if (dialog) dialog.focus();
}

function closeFinalDraftSummary() {
  var modal = document.getElementById('final-summary-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('final-summary-open');
  if (lastFocusedElementBeforeModal && document.contains(lastFocusedElementBeforeModal)) {
    lastFocusedElementBeforeModal.focus();
  }
  lastFocusedElementBeforeModal = null;
}

function showFinalDraftSummary() {
  var data = window.latestFinalDraftSummaryData;
  if (!data) return;
  openFinalDraftSummary(
    data.picks,
    data.positionCounts,
    data.startersFilled,
    data.averageEcrValue,
    data.grade
  );
}

function updateDraftCompletionMode(state) {
  state = state || getDraftAssistantState();
  var complete = isDraftComplete(state);
  document.body.classList.toggle('draft-complete-mode', complete);
  return complete;
}

function renderDraftCompleteRecommendation(element) {
  var waiverWatch = getFinalWaiverWatch(5);
  window.latestDraftRecommendation = null;
  window.latestDraftExplanation = null;
  element.innerHTML =
    '<div class="draft-complete-card">' +
      '<div class="draft-complete-kicker">DRAFT COMPLETE</div>' +
      '<div class="draft-complete-heading"><div><strong>Your board is final.</strong><span>Live pick advice is closed so you can focus on the roster you built.</span></div>' +
        '<button onclick="showFinalDraftSummary()">View final report</button></div>' +
      '<div class="draft-complete-waivers"><b>Waiver watch</b><small>Best undrafted players by PPR ECR</small>' +
        buildWaiverWatchHtml(waiverWatch, true) + '</div>' +
    '</div>';
}

function maybeShowFinalDraftSummary(state, picks, positionCounts, startersFilled, averageEcrValue, grade) {
  var completion = getDraftCompletionStatus(state);
  var isComplete = completion.complete;
  var lastPickRow = document.querySelector(
    'tr.draftrow.drafted-other[data-pick="' + state.totalPicks + '"]'
  );
  var lastPickStillNeedsMineStatus = Boolean(
    lastPickRow &&
    Number(lastPickRow.getAttribute('data-team-slot')) === Number(state.draftSlot)
  );

  if (!isComplete || lastPickStillNeedsMineStatus) {
    if (_finalSummaryTimer) {
      clearTimeout(_finalSummaryTimer);
      _finalSummaryTimer = null;
    }
    closeFinalDraftSummary();
    try { localStorage.removeItem(getDraftSessionFinalKey()); } catch (error) {}
    return;
  }

  var alreadyShown = false;
  try { alreadyShown = localStorage.getItem(getDraftSessionFinalKey()) === '1'; } catch (error) {}
  if (alreadyShown) return;

  if (_finalSummaryTimer) clearTimeout(_finalSummaryTimer);
  _finalSummaryTimer = setTimeout(function() {
    _finalSummaryTimer = null;
    var latest = window.latestFinalDraftSummaryData;
    if (!latest) return;

    try { localStorage.setItem(getDraftSessionFinalKey(), '1'); } catch (error) {}
    openFinalDraftSummary(
      latest.picks,
      latest.positionCounts,
      latest.startersFilled,
      latest.averageEcrValue,
      latest.grade
    );
  }, 900);
}

function updateBestAvailable() {
  var container = document.getElementById('best-available-list');
  if (container) container.innerHTML = '';
}

function calculateMyNextDraftPick(currentPick, teams) {

  currentPick =
    Number(currentPick) || 0;

  teams =
    Number(teams) || 10;

  if (!currentPick || !teams) {
    return {
      nextPick: 0,
      picksBetween: 0
    };
  }

  var currentRound =
    Math.ceil(
      currentPick / teams
    );

  var pickInRound =
    ((currentPick - 1) % teams) + 1;

  var draftSlot;

  /*
   * Convert the current pick back into the user's
   * original draft slot.
   *
   * Odd rounds:
   * slot 1 picks first, slot 10 picks last.
   *
   * Even rounds:
   * slot 10 picks first, slot 1 picks last.
   */
  if (currentRound % 2 === 1) {

    draftSlot =
      pickInRound;

  } else {

    draftSlot =
      teams - pickInRound + 1;

  }


  /*
   * Calculate that same draft slot's pick
   * in the next round.
   */

  var nextRound =
    currentRound + 1;

  var nextPickInRound;

  if (nextRound % 2 === 1) {

    nextPickInRound =
      draftSlot;

  } else {

    nextPickInRound =
      teams - draftSlot + 1;

  }

  var nextPick =
    ((nextRound - 1) * teams) +
    nextPickInRound;


  var picksBetween =
    Math.max(
      0,
      nextPick - currentPick - 1
    );


  return {
    nextPick: nextPick,
    picksBetween: picksBetween
  };
}

function calculateMyNextTwoDraftPicks(
  currentPick,
  teams
) {

  currentPick =
    Number(currentPick) || 0;

  teams =
    Number(teams) || 10;

  if (
    currentPick <= 0 ||
    teams <= 0
  ) {

    return {
      firstNextPick: 0,
      secondNextPick: 0,
      picksBetweenFirst: 0,
      picksBetweenSecond: 0
    };

  }


  /*
   * -------------------------------------------------------
   * FIRST FUTURE PICK
   * -------------------------------------------------------
   */

  var firstWindow =
    calculateMyNextDraftPick(
      currentPick,
      teams
    );

  var firstNextPick =
    Number(
      firstWindow.nextPick
    ) || 0;


  /*
   * -------------------------------------------------------
   * SECOND FUTURE PICK
   * -------------------------------------------------------
   *
   * Treat our first future selection as the new
   * current pick, then calculate again.
   */

  var secondWindow =
    firstNextPick
      ? calculateMyNextDraftPick(
          firstNextPick,
          teams
        )
      : {
          nextPick: 0,
          picksBetween: 0
        };


  var secondNextPick =
    Number(
      secondWindow.nextPick
    ) || 0;


  return {

    firstNextPick:
      firstNextPick,

    secondNextPick:
      secondNextPick,

    picksBetweenFirst:
      Number(
        firstWindow.picksBetween
      ) || 0,

    picksBetweenSecond:
      Number(
        secondWindow.picksBetween
      ) || 0

  };
}

function calculateMultiPickPositionPath(
  player,
  context
) {

  if (!player) {
    return null;
  }

  context =
    context || {};

  var position =
    player.position ||
    player.pos ||
    null;

  if (
    !position ||
    !['QB', 'RB', 'WR', 'TE'].includes(position)
  ) {
    return null;
  }

  var currentPick =
    Number(context.currentPick) || 0;

  var teams =
    Number(context.teams) || 10;

  var futurePicks =
    calculateMyNextTwoDraftPicks(
      currentPick,
      teams
    );

  var needs =
    Object.assign(
      {},
      context.rosterNeeds ||
      calculateDecisionRosterNeeds()
    );


  /*
   * -------------------------------------------------------
   * SIMULATE TAKING CURRENT PLAYER
   * -------------------------------------------------------
   */

  if (
    Number(needs[position]) > 0
  ) {

    needs[position] =
      Math.max(
        0,
        Number(needs[position]) - 1
      );

  } else if (
    (
      position === 'RB' ||
      position === 'WR' ||
      position === 'TE'
    ) &&
    Number(needs.FLEX) > 0
  ) {

    needs.FLEX =
      Math.max(
        0,
        Number(needs.FLEX) - 1
      );

  }


  /*
   * -------------------------------------------------------
   * SCORE FUTURE POSITION PRIORITIES
   * -------------------------------------------------------
   */

var positions =
  ['QB', 'RB', 'WR', 'TE'];


/*
 * -------------------------------------------------------
 * CACHE FUTURE POSITION DEPTH
 * -------------------------------------------------------
 *
 * Positional depth does not change between the first
 * and second future-pick priority calculations.
 * Calculate it once per position and reuse it.
 */

var futureDepthByPosition = {};


positions.forEach(function(pos) {

  futureDepthByPosition[pos] =
    calculateFuturePositionDepth(
      {
        position:
          pos,

        rank:
          Number(player.rank) || 999,

        name:
          '__PATH_' + pos
      },
      context
    );

});


var priorities =
  positions.map(function(pos) {

      var need =
        Number(needs[pos]) || 0;

      var flexNeed =
        Number(needs.FLEX) || 0;

      var priority = 0;


      /*
       * Dedicated starter need.
       */

      priority +=
        need * 3;


      /*
       * FLEX need.
       */

      if (
        flexNeed > 0 &&
        (
          pos === 'RB' ||
          pos === 'WR' ||
          pos === 'TE'
        )
      ) {

        priority += 1;

      }


      /*
       * Future depth.
       *
       * Thin positions deserve more priority.
       */

var depth =
  Number(
    futureDepthByPosition[pos]
  ) || 0;

      var depthUrgency =
        Math.max(
          0,
          100 - depth
        ) / 25;

      priority +=
        depthUrgency;


      return {
        position:
          pos,

        need:
          need,

        flexNeed:
          flexNeed,

        futureDepth:
          depth,

        priority:
          priority
      };

    });


  priorities.sort(function(a, b) {

    return (
      Number(b.priority) -
      Number(a.priority)
    );

  });


 /*
 * -------------------------------------------------------
 * FIRST FUTURE POSITION
 * -------------------------------------------------------
 */

var firstFuturePosition =
  priorities[0]
    ? priorities[0].position
    : null;


/*
 * -------------------------------------------------------
 * SIMULATE FIRST FUTURE PICK
 * -------------------------------------------------------
 *
 * After choosing the first future position, update
 * the remaining roster needs before deciding what
 * the SECOND future position should be.
 */

var secondNeeds =
  Object.assign(
    {},
    needs
  );

if (firstFuturePosition) {

  if (
    Number(
      secondNeeds[firstFuturePosition]
    ) > 0
  ) {

    secondNeeds[firstFuturePosition] =
      Math.max(
        0,
        Number(
          secondNeeds[firstFuturePosition]
        ) - 1
      );

  } else if (
    (
      firstFuturePosition === 'RB' ||
      firstFuturePosition === 'WR' ||
      firstFuturePosition === 'TE'
    ) &&
    Number(secondNeeds.FLEX) > 0
  ) {

    secondNeeds.FLEX =
      Math.max(
        0,
        Number(secondNeeds.FLEX) - 1
      );

  }

}


/*
 * -------------------------------------------------------
 * SECOND FUTURE PRIORITIES
 * -------------------------------------------------------
 */

var secondPriorities =
  positions.map(function(pos) {

    var need =
      Number(
        secondNeeds[pos]
      ) || 0;

    var flexNeed =
      Number(
        secondNeeds.FLEX
      ) || 0;

    var priority = 0;


    /*
     * Dedicated starter need.
     */

    priority +=
      need * 3;


    /*
     * FLEX need.
     */

    if (
      flexNeed > 0 &&
      (
        pos === 'RB' ||
        pos === 'WR' ||
        pos === 'TE'
      )
    ) {

      priority += 1;

    }


    /*
     * Future positional depth.
     */

var depth =
  Number(
    futureDepthByPosition[pos]
  ) || 0;


    var depthUrgency =
      Math.max(
        0,
        100 - depth
      ) / 25;


    priority +=
      depthUrgency;


    return {

      position:
        pos,

      need:
        need,

      flexNeed:
        flexNeed,

      futureDepth:
        depth,

      priority:
        priority

    };

  });


secondPriorities.sort(function(a, b) {

  return (
    Number(b.priority) -
    Number(a.priority)
  );

});


var secondFuturePosition =
  secondPriorities[0]
    ? secondPriorities[0].position
    : null;


/*
 * -------------------------------------------------------
 * RETURN PATH
 * -------------------------------------------------------
 */

return {

  currentPosition:
    position,

  firstNextPick:
    futurePicks.firstNextPick,

  secondNextPick:
    futurePicks.secondNextPick,

  firstFuturePosition:
    firstFuturePosition,

  secondFuturePosition:
    secondFuturePosition,

  firstPriorities:
    priorities,

  secondPriorities:
    secondPriorities,

  needsAfterCurrentPick:
    needs,

  needsAfterFirstFuturePick:
    secondNeeds

};

}

function getProjectedPlayersAtFuturePick(
  position,
  futurePick,
  context
) {

  context =
    context || {};

  position =
    position || null;

  futurePick =
    Number(futurePick) || 0;


  if (
    !position ||
    !['QB', 'RB', 'WR', 'TE'].includes(position) ||
    futurePick <= 0
  ) {

    return [];

  }


  /*
   * -------------------------------------------------------
   * PLAYER POOL
   * -------------------------------------------------------
   */

  var players =
    context.players ||
    context.availablePlayers ||
    [];

  if (!Array.isArray(players)) {
    return [];
  }


  /*
   * -------------------------------------------------------
   * CURRENT DRAFT STATE
   * -------------------------------------------------------
   */

  var currentPick =
    Number(context.currentPick) || 0;

  var currentRank =
    Number(context.currentRank) || 0;


  /*
   * -------------------------------------------------------
   * CANDIDATES AT POSITION
   * -------------------------------------------------------
   */

  var candidates =
    players
      .filter(function(player) {

        if (!player) {
          return false;
        }

        var playerPosition =
          player.position ||
          player.pos;

        return (
          player.available !== false &&
          playerPosition === position &&
          Number(player.rank) > 0
        );

      })
      .map(function(player) {

        /*
         * Reuse the survival engine.
         *
         * We temporarily tell it that the requested
         * futurePick is our next selection.
         */

        var survivalContext =
          Object.assign(
            {},
            context,
            {
              currentPick:
                currentPick,

              calculatedNextPick:
                futurePick,

              nextPick:
                futurePick,

              currentRank:
                currentRank
            }
          );


        var survival =
          calculateNextPickSurvival(
            player,
            survivalContext
          );


        /*
         * We may receive raw players or already-scored
         * players. Use the strongest available score.
         */

  var playerScore =
  Number(player.finalScore);


/*
 * -------------------------------------------------------
 * REUSE EXISTING ENGINE SCORE
 * -------------------------------------------------------
 */

if (
  !Number.isFinite(playerScore) &&
  context.scoredByName &&
  player.name
) {

  var cachedScoredPlayer =
    context.scoredByName[
      String(player.name).toLowerCase()
    ];

  if (cachedScoredPlayer) {

    playerScore =
      Number(
        cachedScoredPlayer.finalScore
      );

  }

}


/*
 * -------------------------------------------------------
 * LIGHTWEIGHT FALLBACK
 * -------------------------------------------------------
 *
 * Do NOT run the full decision engine here.
 *
 * If a scored version isn't available, use rank as a
 * cheap fallback. This prevents future projections from
 * recursively invoking large parts of the engine.
 */

if (!Number.isFinite(playerScore)) {

  var rank =
    Number(player.rank) || 999;

  playerScore =
    Math.max(
      0,
      100 - ((rank - 1) * 1.5)
    );

}

        /*
         * Survival-adjusted future value.
         */

        var projectedValue =
          playerScore *
          (
            Number(survival) || 0
          ) /
          100;


        return {

          name:
            player.name,

          position:
            position,

          rank:
            Number(player.rank) || 999,

          score:
            playerScore,

          survival:
            survival,

          projectedValue:
            projectedValue,

          player:
            player

        };

      });


  /*
   * -------------------------------------------------------
   * REALISTIC FUTURE OPTIONS
   * -------------------------------------------------------
   *
   * Extremely unlikely survivors should not be treated
   * as meaningful future options.
   */

  candidates =
    candidates.filter(function(candidate) {

      return (
        Number(candidate.survival) >= 20
      );

    });


  /*
   * -------------------------------------------------------
   * SORT BY PROJECTED FUTURE VALUE
   * -------------------------------------------------------
   */

  candidates.sort(function(a, b) {

    return (
      Number(b.projectedValue) -
      Number(a.projectedValue)
    );

  });


  /*
   * Keep the strongest few.
   */

  return candidates.slice(0, 5);
}

function getProjectedDraftPackageCached(
  player,
  context
) {

  if (!player) {
    return null;
  }

  context =
    context || {};

  /*
   * Store the cache on the context itself.
   *
   * A new live draft state creates a new context,
   * so the cache naturally resets whenever the
   * draft state is rebuilt.
   */

  if (!context.packageProjectionCache) {

    context.packageProjectionCache = {};

  }


  var key =
    String(
      player.name || ''
    ).toLowerCase();


  if (!key) {
    return null;
  }


  /*
   * Already calculated during this engine pass.
   */

  if (
    Object.prototype.hasOwnProperty.call(
      context.packageProjectionCache,
      key
    )
  ) {

    return context.packageProjectionCache[key];

  }


  /*
   * Calculate once.
   */

  var result =
    calculateProjectedDraftPackage(
      player,
      context
    );


  context.packageProjectionCache[key] =
    result;


  return result;
}

function calculateProjectedDraftPackage(
  player,
  context
) {

  if (!player) {
    return null;
  }

  context =
    context || {};

  var path =
    calculateMultiPickPositionPath(
      player,
      context
    );

  if (!path) {
    return null;
  }


  /*
   * -------------------------------------------------------
   * CURRENT PLAYER VALUE
   * -------------------------------------------------------
   */

 var currentScore =
  Number(player.finalScore);

if (!Number.isFinite(currentScore)) {

  /*
   * Real live player:
   * use the full decision engine.
   */

  if (
    player.row &&
    typeof player.row.closest === 'function'
  ) {

    var scoredCurrent =
      calculateDraftDecisionScore(
        player,
        context
      );

    currentScore =
      scoredCurrent
        ? Number(scoredCurrent.finalScore) || 0
        : 0;

  } else {

    /*
     * Synthetic/test player:
     * use a lightweight rank-based fallback.
     */

    var currentRank =
      Number(player.rank) || 999;

    currentScore =
      Math.max(
        0,
        100 - ((currentRank - 1) * 1.5)
      );

  }

}


  /*
   * -------------------------------------------------------
   * FIRST FUTURE PICK
   * -------------------------------------------------------
   */

  var firstOptions =
    getProjectedPlayersAtFuturePick(
      path.firstFuturePosition,
      path.firstNextPick,
      context
    ).filter(function(option) {
      return canonicalExpertPlayerName(option && option.name) !==
        canonicalExpertPlayerName(player.name);
    });

  var firstPlayer =
    firstOptions.length
      ? firstOptions[0]
      : null;


  /*
   * -------------------------------------------------------
   * SECOND FUTURE PICK
   * -------------------------------------------------------
   */

  var secondOptions =
    getProjectedPlayersAtFuturePick(
      path.secondFuturePosition,
      path.secondNextPick,
      context
    ).filter(function(option) {
      return canonicalExpertPlayerName(option && option.name) !==
        canonicalExpertPlayerName(player.name);
    });


  /*
   * The player selected at the first future pick
   * cannot also be selected at the second future pick.
   */

  if (firstPlayer) {

    secondOptions =
      secondOptions.filter(function(option) {

        return (
          option.name !==
          firstPlayer.name
        );

      });

  }


  var secondPlayer =
    secondOptions.length
      ? secondOptions[0]
      : null;


  /*
   * -------------------------------------------------------
   * PACKAGE VALUES
   * -------------------------------------------------------
   */

  var firstProjectedValue =
    firstPlayer
      ? Number(
          firstPlayer.projectedValue
        ) || 0
      : 0;

  var secondProjectedValue =
    secondPlayer
      ? Number(
          secondPlayer.projectedValue
        ) || 0
      : 0;


  var packageValue =
    currentScore +
    firstProjectedValue +
    secondProjectedValue;


  /*
   * -------------------------------------------------------
   * PACKAGE COMPLETENESS
   * -------------------------------------------------------
   *
   * Missing a realistic player at a future selection
   * should reduce our confidence in the path.
   */

  var completeFuturePicks = 0;

  if (firstPlayer) {
    completeFuturePicks++;
  }

  if (secondPlayer) {
    completeFuturePicks++;
  }


  return {

    currentPlayer:
      player.name,

    currentPosition:
      player.position ||
      player.pos,

    currentScore:
      currentScore,

    firstPick:
      path.firstNextPick,

    firstPosition:
      path.firstFuturePosition,

    firstPlayer:
      firstPlayer
        ? firstPlayer.name
        : null,

    firstPlayerScore:
      firstPlayer
        ? firstPlayer.score
        : 0,

    firstSurvival:
      firstPlayer
        ? firstPlayer.survival
        : 0,

    firstProjectedValue:
      firstProjectedValue,

    secondPick:
      path.secondNextPick,

    secondPosition:
      path.secondFuturePosition,

    secondPlayer:
      secondPlayer
        ? secondPlayer.name
        : null,

    secondPlayerScore:
      secondPlayer
        ? secondPlayer.score
        : 0,

    secondSurvival:
      secondPlayer
        ? secondPlayer.survival
        : 0,

    secondProjectedValue:
      secondProjectedValue,

    completeFuturePicks:
      completeFuturePicks,

    packageValue:
      packageValue,

    path:
      path

  };
}

/*
 * =======================================================
 * PHASE 11 — DRAFT PATH FORECAST
 * =======================================================
 *
 * Converts the existing projected-package machinery into
 * one standardized, UI-friendly draft path.
 *
 * This does NOT create new scoring logic.
 */
function buildDraftPathForecast(
  player,
  context
) {

  if (!player) {
    return null;
  }


  context =
    context || {};


  var projectedPackage =
    getProjectedDraftPackageCached(
      player,
      context
    );


  if (!projectedPackage) {
    return null;
  }


  /*
   * -------------------------------------------------------
   * CURRENT PICK
   * -------------------------------------------------------
   */

  var currentPick =
    Number(
      context.currentPick
    ) || 0;


  var currentPosition =
    player.position ||
    player.pos ||
    projectedPackage.currentPosition ||
    null;


  /*
   * -------------------------------------------------------
   * PATH CONFIDENCE
   * -------------------------------------------------------
   *
   * Confidence describes how believable the FUTURE path is.
   *
   * It is deliberately separate from recommendation
   * confidence.
   */

  var firstSurvival =
    Number(
      projectedPackage.firstSurvival
    ) || 0;


  var secondSurvival =
    Number(
      projectedPackage.secondSurvival
    ) || 0;


  var completeFuturePicks =
    Number(
      projectedPackage.completeFuturePicks
    ) || 0;


  var averageFutureSurvival =
    0;


  if (completeFuturePicks === 2) {

    averageFutureSurvival =
      (
        firstSurvival +
        secondSurvival
      ) / 2;

  } else if (
    completeFuturePicks === 1
  ) {

    averageFutureSurvival =
      firstSurvival ||
      secondSurvival;

  }


  var confidenceScore =
    averageFutureSurvival;


  /*
   * Missing projected selections should lower confidence.
   */

  if (completeFuturePicks === 1) {

    confidenceScore -= 20;

  } else if (
    completeFuturePicks === 0
  ) {

    confidenceScore = 0;

  }


  confidenceScore =
    Math.max(
      0,
      Math.min(
        100,
        confidenceScore
      )
    );


  var confidence =
    confidenceScore >= 75
      ? 'HIGH'
      : confidenceScore >= 50
        ? 'MODERATE'
        : 'LOW';


  /*
   * -------------------------------------------------------
   * PATH STEPS
   * -------------------------------------------------------
   */

  var steps = [
    {
      order:
        1,

      pick:
        currentPick,

      player:
        player.name || null,

      position:
        currentPosition,

      projected:
        false,

      score:
        Number(
          projectedPackage.currentScore
        ) || 0,

      survival:
        100
    }
  ];


  if (
    projectedPackage.firstPick
  ) {

    steps.push({
      order:
        2,

      pick:
        Number(
          projectedPackage.firstPick
        ) || 0,

      player:
        projectedPackage.firstPlayer ||
        null,

      position:
        projectedPackage.firstPosition ||
        null,

      projected:
        true,

      score:
        Number(
          projectedPackage.firstPlayerScore
        ) || 0,

      survival:
        firstSurvival,

      projectedValue:
        Number(
          projectedPackage.firstProjectedValue
        ) || 0
    });

  }


  if (
    projectedPackage.secondPick
  ) {

    steps.push({
      order:
        3,

      pick:
        Number(
          projectedPackage.secondPick
        ) || 0,

      player:
        projectedPackage.secondPlayer ||
        null,

      position:
        projectedPackage.secondPosition ||
        null,

      projected:
        true,

      score:
        Number(
          projectedPackage.secondPlayerScore
        ) || 0,

      survival:
        secondSurvival,

      projectedValue:
        Number(
          projectedPackage.secondProjectedValue
        ) || 0
    });

  }


  /*
   * -------------------------------------------------------
   * PATH LABEL
   * -------------------------------------------------------
   */

  var positionPath =
    steps
      .map(function(step) {

        return (
          step.position ||
          '?'
        );

      })
      .join(' → ');


  return {

    currentPlayer:
      player.name || null,

    currentPosition:
      currentPosition,

    currentPick:
      currentPick,

    positionPath:
      positionPath,

    steps:
      steps,

    packageValue:
      Number(
        projectedPackage.packageValue
      ) || 0,

    completeFuturePicks:
      completeFuturePicks,

    averageFutureSurvival:
      Number(
        averageFutureSurvival.toFixed(1)
      ),

    confidenceScore:
      Number(
        confidenceScore.toFixed(1)
      ),

    confidence:
      confidence,

    firstPick:
      projectedPackage.firstPick,

    firstPlayer:
      projectedPackage.firstPlayer,

    firstPosition:
      projectedPackage.firstPosition,

    firstSurvival:
      firstSurvival,

    secondPick:
      projectedPackage.secondPick,

    secondPlayer:
      projectedPackage.secondPlayer,

    secondPosition:
      projectedPackage.secondPosition,

    secondSurvival:
      secondSurvival,

    rawPackage:
      projectedPackage

  };

}

function debugDraftPathForecast() {

  var state =
    buildLiveDraftDebugState();


  if (
    !state ||
    !state.scored ||
    !state.scored.length
  ) {

    console.warn(
      'No live recommendation state available.'
    );

    return null;

  }


  var topPlayers =
    state.scored.slice(
      0,
      3
    );


  var forecasts =
    topPlayers
      .map(function(player) {

        return buildDraftPathForecast(
          player,
          state.context
        );

      })
      .filter(Boolean);


  console.table(
    forecasts.map(function(path) {

      return {

        current:
          path.currentPlayer,

        path:
          path.positionPath,

        nextPick:
          path.firstPick,

        nextPlayer:
          path.firstPlayer,

        nextSurvival:
          path.firstSurvival,

        secondPick:
          path.secondPick,

        secondPlayer:
          path.secondPlayer,

        secondSurvival:
          path.secondSurvival,

        packageValue:
          Number(
            path.packageValue
          ).toFixed(1),

        confidence:
          path.confidence
      };

    })
  );


  window.latestDraftPathForecasts =
    forecasts;


  return forecasts;

}

function compareDraftPathForecasts(
  scoredPlayers,
  context,
  limit
) {

  scoredPlayers =
    Array.isArray(scoredPlayers)
      ? scoredPlayers
      : [];

  context =
    context || {};

  limit =
    Number(limit) || 3;


  var candidates =
    scoredPlayers
      .filter(function(player) {

        return (
          player &&
          player.available !== false
        );

      })
      .slice(
        0,
        Math.max(
          limit,
          1
        )
      );


  var forecasts =
    candidates
      .map(function(player) {

        return buildDraftPathForecast(
          player,
          context
        );

      })
      .filter(Boolean);


  forecasts.sort(function(a, b) {

    return (
      Number(b.packageValue || 0) -
      Number(a.packageValue || 0)
    );

  });


  var bestPackageValue =
    forecasts.length
      ? Number(
          forecasts[0].packageValue
        ) || 0
      : 0;


  forecasts.forEach(
    function(path, index) {

      var nextPath =
        forecasts[index + 1] ||
        null;


      path.rank =
        index + 1;


      path.gapFromBest =
        Number(
          (
            bestPackageValue -
            Number(
              path.packageValue || 0
            )
          ).toFixed(2)
        );


      path.gapToNext =
        nextPath
          ? Number(
              (
                Number(
                  path.packageValue || 0
                ) -
                Number(
                  nextPath.packageValue || 0
                )
              ).toFixed(2)
            )
          : 0;


      path.isBestPath =
        index === 0;

    }
  );


  return {

    bestPath:
      forecasts.length
        ? forecasts[0]
        : null,

    forecasts:
      forecasts,

    count:
      forecasts.length

  };

}

function debugDraftPathComparison() {

  var state =
    buildLiveDraftDebugState();


  if (
    !state ||
    !state.scored ||
    !state.scored.length
  ) {

    console.warn(
      'No live scored players available.'
    );

    return null;

  }


  var comparison =
    compareDraftPathForecasts(
      state.scored,
      state.context,
      3
    );


  console.table(
    comparison.forecasts.map(
      function(path) {

        return {

          rank:
            path.rank,

          current:
            path.currentPlayer,

          path:
            path.positionPath,

          packageValue:
            Number(
              path.packageValue
            ).toFixed(1),

          gapFromBest:
            Number(
              path.gapFromBest
            ).toFixed(1),

          gapToNext:
            Number(
              path.gapToNext
            ).toFixed(1),

          confidence:
            path.confidence,

          avgFutureSurvival:
            Number(
              path.averageFutureSurvival
            ).toFixed(1)

        };

      }
    )
  );


  window.latestDraftPathComparison =
    comparison;


  return comparison;

}

function buildDynamicStrategyAudit(
  suppliedState
) {

  var state =
    suppliedState ||
    buildLiveDraftDebugState();


  if (
    !state ||
    !state.context
  ) {

    return null;

  }


  var context =
    state.context;


  var positions =
    ['QB', 'RB', 'WR', 'TE'];


  /*
   * -------------------------------------------------------
   * TIER / SCARCITY STATE
   * -------------------------------------------------------
   */

  var profiles =
    state.vorpResult &&
    Array.isArray(
      state.vorpResult.profiles
    )
      ? state.vorpResult.profiles
      : [];


  var scarcityState =
    buildLiveTierScarcityState(
      state.players || [],
      profiles
    );


  /*
   * -------------------------------------------------------
   * POSITION AUDIT
   * -------------------------------------------------------
   */

  var positionAudit =
    {};


  positions.forEach(
    function(position) {

      var scarcity =
        scarcityState &&
        scarcityState.positions
          ? scarcityState.positions[
              position
            ]
          : null;


      var rosterNeed =
        context.rosterNeeds
          ? Number(
              context.rosterNeeds[
                position
              ]
            ) || 0
          : 0;


      var run =
        context.draftRuns &&
        context.draftRuns.runs
          ? context.draftRuns.runs[
              position
            ]
          : null;


      positionAudit[position] = {

        position:
          position,

        rosterNeed:
          rosterNeed,

        scarcityStatus:
          scarcity
            ? scarcity.status
            : 'UNKNOWN',

        scarcity:
          scarcity
            ? Number(
                scarcity.scarcity || 0
              )
            : 0,

        cliffSeverity:
          scarcity
            ? scarcity.cliffSeverity ||
              'NONE'
            : 'NONE',

        playersBeforeCliff:
          scarcity
            ? Number(
                scarcity.playersBeforeCliff ||
                0
              )
            : 0,

        runStrength:
          run
            ? run.strength ||
              'NONE'
            : 'NONE',

        runCount:
          run
            ? Number(
                run.count || 0
              )
            : 0

      };

    }
  );


  /*
   * -------------------------------------------------------
   * CURRENT DRAFT INFORMATION
   * -------------------------------------------------------
   */

  var currentPick =
    Number(
      context.currentPick
    ) || 0;


  var teams =
    Number(
      context.teams
    ) || 10;


  var round =
    currentPick > 0
      ? Math.ceil(
          currentPick /
          teams
        )
      : 0;


  /*
   * -------------------------------------------------------
   * CURRENT BEST PATH
   * -------------------------------------------------------
   */

  var pathComparison =
    compareDraftPathForecasts(
      state.scored || [],
      context,
      3
    );


  var bestPath =
    pathComparison
      ? pathComparison.bestPath
      : null;


  /*
   * -------------------------------------------------------
   * RETURN READ-ONLY AUDIT
   * -------------------------------------------------------
   */

  return {

    currentPick:
      currentPick,

    round:
      round,

    draftPhase:
      state.scored &&
      state.scored[0]
        ? state.scored[0].draftPhase ||
          null
        : null,

    rosterNeeds:
      context.rosterNeeds || {},

    draftRun:
      context.draftRuns || null,

    positions:
      positionAudit,

    bestPath:
      bestPath
        ? {
            player:
              bestPath.currentPlayer,

            position:
              bestPath.currentPosition,

            path:
              bestPath.positionPath,

            packageValue:
              bestPath.packageValue,

            futureSurvival:
              bestPath.averageFutureSurvival,

            confidence:
              bestPath.confidence
          }
        : null

  };

}

function buildDynamicStrategyState(
  suppliedAudit
) {

  var audit =
    suppliedAudit ||
    buildDynamicStrategyAudit();


  if (!audit) {
    return null;
  }


  var positions =
    ['QB', 'RB', 'WR', 'TE'];


  var strategyState = {
    currentPick:
      audit.currentPick,

    round:
      audit.round,

    draftPhase:
      audit.draftPhase,

    positions: {},

    priorityPositions: [],

    waitPositions: [],

    monitorPositions: []
  };


  positions.forEach(
    function(position) {

      var item =
        audit.positions[
          position
        ];


      if (!item) {
        return;
      }


      var state =
        'NEUTRAL';


      var reasons = [];


      /*
       * -------------------------------------------------------
       * STRONG PRIORITY SIGNALS
       * -------------------------------------------------------
       */

      if (
        item.scarcityStatus ===
          'CRITICAL CLIFF' ||
        item.scarcityStatus ===
          'HIGH SCARCITY'
      ) {

        state =
          'PRIORITIZE';

        reasons.push(
          item.scarcityStatus
        );

      }


      if (
        item.runStrength ===
          'STRONG' &&
        item.rosterNeed > 0
      ) {

        state =
          'PRIORITIZE';

        reasons.push(
          'strong positional run'
        );

      }


      /*
       * -------------------------------------------------------
       * STARTER-BUILD NEED
       * -------------------------------------------------------
       */

      if (
        audit.draftPhase ===
          'STARTER BUILD' &&
        item.rosterNeed >= 2 &&
        state !== 'PRIORITIZE'
      ) {

        state =
          'PRIORITIZE';

        reasons.push(
          'multiple starter needs remain'
        );

      }


      /*
       * -------------------------------------------------------
       * BEST PATH SIGNAL
       * -------------------------------------------------------
       */

      if (
        audit.bestPath &&
        audit.bestPath.position ===
          position
      ) {

        if (
          state === 'NEUTRAL'
        ) {

          state =
            'PRIORITIZE';

        }

        reasons.push(
          'best projected draft path starts here'
        );

      }


      /*
       * -------------------------------------------------------
       * MONITOR
       * -------------------------------------------------------
       */

if (
  state === 'NEUTRAL' &&
  item.rosterNeed > 0 &&
  (
    item.scarcityStatus ===
      'TIER CLOSING' ||
    item.scarcity >= 75
  )
) {

  state =
    'MONITOR';

  reasons.push(
    'need remains with emerging pressure'
  );

}


      /*
       * -------------------------------------------------------
       * WAIT
       * -------------------------------------------------------
       */

      if (
        state === 'NEUTRAL' &&
        item.rosterNeed > 0 &&
        item.scarcityStatus ===
          'HEALTHY DEPTH'
      ) {

        state =
          'WAIT';

        reasons.push(
          'healthy positional depth'
        );

      }


      /*
       * -------------------------------------------------------
       * SATISFIED POSITION
       * -------------------------------------------------------
       */

      if (
        item.rosterNeed <= 0
      ) {

        state =
          'WAIT';

        reasons = [
          'starter need satisfied'
        ];

      }


      strategyState.positions[
        position
      ] = {

        position:
          position,

        state:
          state,

        reasons:
          reasons,

        rosterNeed:
          item.rosterNeed,

        scarcity:
          item.scarcity,

        scarcityStatus:
          item.scarcityStatus,

        cliffSeverity:
          item.cliffSeverity,

        runStrength:
          item.runStrength

      };


      if (
        state === 'PRIORITIZE'
      ) {

        strategyState
          .priorityPositions
          .push(position);

      } else if (
        state === 'MONITOR'
      ) {

        strategyState
          .monitorPositions
          .push(position);

      } else if (
        state === 'WAIT'
      ) {

        strategyState
          .waitPositions
          .push(position);

      }

    }
  );


  return strategyState;

}

function debugDynamicStrategyAudit() {

  var audit =
    buildDynamicStrategyAudit();


  if (!audit) {

    console.warn(
      'Dynamic strategy audit unavailable.'
    );

    return null;

  }


  console.log(
    'DYNAMIC STRATEGY AUDIT:',
    {
      currentPick:
        audit.currentPick,

      round:
        audit.round,

      draftPhase:
        audit.draftPhase,

      rosterNeeds:
        audit.rosterNeeds,

      bestPath:
        audit.bestPath
    }
  );


  console.table(
    Object.keys(
      audit.positions
    ).map(function(position) {

      var item =
        audit.positions[
          position
        ];


      return {

        position:
          position,

        need:
          item.rosterNeed,

        scarcityStatus:
          item.scarcityStatus,

        scarcity:
          Number(
            item.scarcity
          ).toFixed(1),

        cliff:
          item.cliffSeverity,

        beforeCliff:
          item.playersBeforeCliff,

        run:
          item.runStrength,

        runCount:
          item.runCount

      };

    })
  );


  window.latestDynamicStrategyAudit =
    audit;


  return audit;

}

function debugDynamicStrategyState() {

  var state =
    buildDynamicStrategyState();


  if (!state) {

    console.warn(
      'Dynamic strategy state unavailable.'
    );

    return null;

  }


  console.table(
    Object.keys(
      state.positions
    ).map(function(position) {

      var item =
        state.positions[
          position
        ];


      return {

        position:
          position,

        strategy:
          item.state,

        need:
          item.rosterNeed,

        scarcity:
          Number(
            item.scarcity
          ).toFixed(1),

        scarcityStatus:
          item.scarcityStatus,

        cliff:
          item.cliffSeverity,

        run:
          item.runStrength,

        reasons:
          item.reasons.join(
            '; '
          )

      };

    })
  );


  window.latestDynamicStrategyState =
    state;


  return state;

}

function calculatePackagePathAdvantage(
  player,
  scoredPlayers,
  context
) {

  if (!player) {
    return 0;
  }

  scoredPlayers =
    Array.isArray(scoredPlayers)
      ? scoredPlayers
      : [];

  context =
    context || {};


var currentPackage =
  getProjectedDraftPackageCached(
    player,
    context
  );

  if (!currentPackage) {
    return 0;
  }


  /*
   * Compare against the strongest realistic
   * alternative starting players.
   */

  var alternatives =
    scoredPlayers
      .filter(function(candidate) {

        return candidate &&
          candidate.name !== player.name &&
          candidate.available !== false;

      })
      .slice(0, 5);


  if (!alternatives.length) {
    return 0;
  }


  var alternativeValues =
    alternatives
      .map(function(candidate) {

var pkg =
  getProjectedDraftPackageCached(
    candidate,
    context
  );

        return pkg
          ? Number(pkg.packageValue) || 0
          : 0;

      })
      .filter(function(value) {
        return value > 0;
      });


  if (!alternativeValues.length) {
    return 0;
  }


  var bestAlternativePackage =
    Math.max.apply(
      null,
      alternativeValues
    );


  var packageGap =
    (
      Number(currentPackage.packageValue) || 0
    ) -
    bestAlternativePackage;


  /*
   * -------------------------------------------------------
   * NORMALIZE
   * -------------------------------------------------------
   *
   * Roughly:
   *
   * +10 package advantage → +2
   *  +5 package advantage → +1
   *   0                   →  0
   *  -5                   → -1
   * -10                   → -2
   */

  var score =
    packageGap / 5;


  score =
    Math.max(
      -2,
      Math.min(
        2,
        score
      )
    );


  return Number(
    score.toFixed(2)
  );
}

function applyPackagePathAdjustments(
  scoredPlayers,
  context,
  limit
) {

  scoredPlayers =
    Array.isArray(scoredPlayers)
      ? scoredPlayers
      : [];

  context =
    context || {};

  limit =
    Number(limit) || 8;


  /*
   * -------------------------------------------------------
   * ONLY DEEP-PLAN REALISTIC CURRENT PICKS
   * -------------------------------------------------------
   *
   * There is no reason to run expensive package planning
   * for every player on the board.
   */

  scoredPlayers.forEach(function(player, index) {

    /*
     * Default for players outside the planning window.
     */

    player.packagePathAdvantageScore =
      0;


    if (index >= limit) {
      return;
    }


    var advantage =
      calculatePackagePathAdvantage(
        player,
        scoredPlayers,
        context
      );


    player.packagePathAdvantageScore =
      advantage;


    /*
     * Small bounded adjustment.
     */

    player.finalScore +=
      advantage;

  });


  /*
   * Re-sort after package adjustments.
   */

  scoredPlayers.sort(function(a, b) {

    return (
      Number(b.finalScore || 0) -
      Number(a.finalScore || 0)
    );

  });


  return scoredPlayers;
}

function enforceAuthoritativePositionOrder(scoredPlayers) {
  scoredPlayers = Array.isArray(scoredPlayers) ? scoredPlayers : [];

  VORP_POSITIONS.forEach(function(position) {
    var positionPlayers = scoredPlayers
      .filter(function(player) {
        return player && player.position === position &&
          hasAuthoritativeEcr(player) && Number.isFinite(Number(player.finalScore));
      })
      .slice()
      .sort(function(a, b) { return Number(a.rank) - Number(b.rank); });

    var previousScore = null;
    positionPlayers.forEach(function(player) {
      var score = Number(player.finalScore);
      player.authorityOrderAdjustment = 0;

      if (previousScore != null && score >= previousScore) {
        var adjustedScore = previousScore - 0.01;
        player.authorityOrderAdjustment = Number((adjustedScore - score).toFixed(2));
        player.finalScore = adjustedScore;
        score = adjustedScore;
      }

      previousScore = score;
    });
  });

  scoredPlayers.sort(function(a, b) {
    return Number(b.finalScore || 0) - Number(a.finalScore || 0);
  });

  return scoredPlayers;
}

function applyMarketAwareRecommendationPriority(scoredPlayers, context) {
  scoredPlayers = Array.isArray(scoredPlayers) ? scoredPlayers : [];
  context = context || {};
  var corePositions = ['QB', 'RB', 'WR', 'TE'];
  var ecrPlayers = scoredPlayers.filter(function(player) {
    return player && corePositions.includes(player.position) && hasAuthoritativeEcr(player);
  }).slice().sort(function(a, b) {
    return Number(a.ecr || a.rank) - Number(b.ecr || b.rank);
  });
  var bestEcrPlayer = ecrPlayers[0] || null;
  var bestEcrRank = bestEcrPlayer ? Number(bestEcrPlayer.ecr || bestEcrPlayer.rank) : null;
  var bestEcrSurvival = bestEcrPlayer
    ? calculateNextPickSurvival(bestEcrPlayer, context)
    : 50;

  scoredPlayers.forEach(function(player) {
    var survival = calculateNextPickSurvival(player, context);
    var timingAdjustment = Math.max(-6, Math.min(6, (50 - survival) * 0.12));
    var round = Math.ceil(
      (Number(context.currentPick) || 1) /
      Math.max(1, Number(context.teams) || 10)
    );
    var zeroRbStarterBuild = round >= 4 &&
      Number(context.rosterCounts && context.rosterCounts.RB) === 0 &&
      Number(context.rosterCounts && context.rosterCounts.WR) >= 2;
    var rosterPriorityAdjustment = zeroRbStarterBuild
      ? player.position === 'RB' ? 3 : player.position === 'WR' ? -3 : 0
      : 0;
    player.recommendationSurvival = survival;
    player.marketPriorityAdjustment = Number(timingAdjustment.toFixed(2));
    player.rosterPriorityAdjustment = rosterPriorityAdjustment;
    player.recommendationPriorityScore = Number(player.finalScore || 0) +
      timingAdjustment + rosterPriorityAdjustment;
    player.marketEcrGuardrail = false;
  });

  if (bestEcrPlayer && bestEcrSurvival < 35) {
    var bestPriority = Number(bestEcrPlayer.recommendationPriorityScore) || 0;
    var currentPick = Number(context.currentPick) || 0;
    var protectionGap = bestEcrRank <= 12 && currentPick - bestEcrRank >= 4 ? 5 : 8;
    scoredPlayers.forEach(function(player) {
      if (!player || player === bestEcrPlayer || !corePositions.includes(player.position)) return;
      var ecrRank = Number(player.ecr || player.rank);
      if (!Number.isFinite(ecrRank) || ecrRank - bestEcrRank < protectionGap) return;
      var fillsOpenStarter = Number(context.rosterNeeds && context.rosterNeeds[player.position]) > 0 &&
        Number(context.rosterNeeds && context.rosterNeeds[bestEcrPlayer.position]) <= 0;
      var materiallyBetterForRoster = bestEcrRank > 12 && fillsOpenStarter &&
        Number(player.recommendationPriorityScore || 0) >=
          Number(bestEcrPlayer.recommendationPriorityScore || 0) + 2;
      if (materiallyBetterForRoster) return;
      // Positional value may break close ECR ties, but another urgent player
      // cannot use the same market signal to jump a materially better,
      // already-overdue ECR value.
      if (player.recommendationPriorityScore >= bestPriority) {
        player.recommendationPriorityScore = bestPriority - 0.01;
        player.marketEcrGuardrail = true;
      }
    });
  }

  corePositions.forEach(function(position) {
    var positionPlayers = scoredPlayers.filter(function(player) {
      return player && player.position === position && hasAuthoritativeEcr(player);
    }).slice().sort(function(a, b) {
      return Number(a.ecr || a.rank) - Number(b.ecr || b.rank);
    });
    var previousPriority = null;
    positionPlayers.forEach(function(player) {
      player.marketAuthorityOrderAdjustment = 0;
      if (previousPriority != null && player.recommendationPriorityScore >= previousPriority) {
        var adjustedPriority = previousPriority - 0.01;
        player.marketAuthorityOrderAdjustment = Number(
          (adjustedPriority - player.recommendationPriorityScore).toFixed(2)
        );
        player.recommendationPriorityScore = adjustedPriority;
      }
      previousPriority = player.recommendationPriorityScore;
    });
  });

  scoredPlayers.sort(function(a, b) {
    return Number(b.recommendationPriorityScore || 0) - Number(a.recommendationPriorityScore || 0) ||
      Number(b.finalScore || 0) - Number(a.finalScore || 0);
  });
  return scoredPlayers;
}

function alignRecommendationActionWithMarketTiming(decision, player, backToBackTurn) {
  if (!decision || !player) return decision;
  var survival = Number(player.recommendationSurvival);
  if (!Number.isFinite(survival)) return decision;
  var hasMandatoryGuardrail = Number(player.endgameRosterRequirementScore) > 0 ||
    Number(player.mandatoryEndgameAdjustment) > 0;

  if (survival <= 25 &&
      (decision.recommendation === 'WAIT' || decision.recommendation === 'PASS')) {
    decision.recommendation = 'CONSIDER';
    decision.summary = 'This player is unlikely to survive to your next selection.';
  }
  if (survival >= 70 && decision.recommendation === 'DRAFT' &&
      !backToBackTurn && !hasMandatoryGuardrail) {
    decision.recommendation = 'CONSIDER';
    decision.summary = 'Strong option, but the ADP market suggests this player may survive.';
  }
  return decision;
}

function calculateMultiPickPlanningScore(
  player,
  context
) {

  if (!player) {
    return 0;
  }

  var path =
    calculateMultiPickPositionPath(
      player,
      context
    );

  if (!path) {
    return 0;
  }

  var position =
    player.position ||
    player.pos ||
    null;

  if (!position) {
    return 0;
  }


  var score = 0;


  /*
   * -------------------------------------------------------
   * 1. PATH DIVERSITY
   * -------------------------------------------------------
   *
   * Keep this smaller than before.
   */

  if (
    path.firstFuturePosition &&
    path.firstFuturePosition !== position
  ) {
    score += 0.40;
  }

  if (
    path.secondFuturePosition &&
    path.secondFuturePosition !== position
  ) {
    score += 0.25;
  }

  if (
    path.firstFuturePosition &&
    path.secondFuturePosition &&
    path.firstFuturePosition !==
      path.secondFuturePosition
  ) {
    score += 0.25;
  }


  /*
   * -------------------------------------------------------
   * 2. FIRST FUTURE PICK QUALITY
   * -------------------------------------------------------
   *
   * A strong priority means there is a clear,
   * useful roster-building move available next.
   */

  var firstPriority =
    path.firstPriorities &&
    path.firstPriorities.length
      ? Number(
          path.firstPriorities[0].priority
        ) || 0
      : 0;

  score +=
    Math.min(
      0.50,
      firstPriority / 20
    );


  /*
   * -------------------------------------------------------
   * 3. SECOND FUTURE PICK QUALITY
   * -------------------------------------------------------
   */

  var secondPriority =
    path.secondPriorities &&
    path.secondPriorities.length
      ? Number(
          path.secondPriorities[0].priority
        ) || 0
      : 0;

  score +=
    Math.min(
      0.40,
      secondPriority / 20
    );


  /*
   * -------------------------------------------------------
   * 4. PATH BALANCE
   * -------------------------------------------------------
   *
   * Reward paths where there are multiple viable
   * options rather than one desperate position need.
   */

  if (
    path.firstPriorities &&
    path.firstPriorities.length >= 2
  ) {

    var firstGap =
      Number(
        path.firstPriorities[0].priority
      ) -
      Number(
        path.firstPriorities[1].priority
      );

    if (firstGap <= 1) {
      score += 0.20;
    }

  }


  if (
    path.secondPriorities &&
    path.secondPriorities.length >= 2
  ) {

    var secondGap =
      Number(
        path.secondPriorities[0].priority
      ) -
      Number(
        path.secondPriorities[1].priority
      );

    if (secondGap <= 1) {
      score += 0.20;
    }

  }


  /*
   * -------------------------------------------------------
   * 5. CONCENTRATION PENALTY
   * -------------------------------------------------------
   */

  if (
    path.firstFuturePosition === position &&
    path.secondFuturePosition === position
  ) {
    score -= 1;
  }


  /*
   * -------------------------------------------------------
   * CLAMP
   * -------------------------------------------------------
   */

  score =
    Math.max(
      -1,
      Math.min(
        2,
        score
      )
    );


  return Number(
    score.toFixed(2)
  );
}

function getSnakeDraftTeamForPick(
  pick,
  teams
) {

  pick =
    Number(pick) || 0;

  teams =
    Number(teams) || 10;

  if (
    pick <= 0 ||
    teams <= 0
  ) {

    return null;

  }


  /*
   * -------------------------------------------------------
   * ROUND
   * -------------------------------------------------------
   */

  var round =
    Math.ceil(
      pick / teams
    );


  /*
   * Pick position inside the round:
   *
   * 1 through teams
   */

  var pickInRound =
    ((pick - 1) % teams) + 1;


  /*
   * -------------------------------------------------------
   * SNAKE TEAM SLOT
   * -------------------------------------------------------
   *
   * Odd rounds:
   *
   * Pick 1  -> Team 1
   * Pick 2  -> Team 2
   * ...
   * Pick 10 -> Team 10
   *
   * Even rounds:
   *
   * Pick 11 -> Team 10
   * Pick 12 -> Team 9
   * ...
   * Pick 20 -> Team 1
   */

  var teamSlot;

  if (
    round % 2 === 1
  ) {

    teamSlot =
      pickInRound;

  } else {

    teamSlot =
      teams -
      pickInRound +
      1;

  }


  return {
    pick:
      pick,

    round:
      round,

    pickInRound:
      pickInRound,

    teamSlot:
      teamSlot
  };
}

function getTeamsPickingBeforeMyNextTurn(
  currentPick,
  nextPick,
  teams
) {

  currentPick =
    Number(currentPick) || 0;

  nextPick =
    Number(nextPick) || 0;

  teams =
    Number(teams) || 10;

  if (
    currentPick <= 0 ||
    nextPick <= currentPick ||
    teams <= 0
  ) {

    return {
      picks: [],
      teamPickCounts: {}
    };

  }

  var picks = [];

  var teamPickCounts = {};


  /*
   * -------------------------------------------------------
   * PICKS BETWEEN OUR CURRENT PICK AND NEXT PICK
   * -------------------------------------------------------
   */

  for (
    var pick = currentPick + 1;
    pick < nextPick;
    pick++
  ) {

    var mapping =
      getSnakeDraftTeamForPick(
        pick,
        teams
      );

    if (!mapping) {
      continue;
    }

    picks.push(mapping);

    var teamSlot =
      mapping.teamSlot;

    teamPickCounts[teamSlot] =
      (teamPickCounts[teamSlot] || 0) + 1;

  }


  return {
    picks:
      picks,

    teamPickCounts:
      teamPickCounts
  };
}

function calculateOpponentRosterNeeds(
  roster
) {

  roster =
    roster || {};

  var qbSlots =
    Number(ROSTER_SLOTS.QB) || 1;

  var rbSlots =
    Number(ROSTER_SLOTS.RB) || 2;

  var wrSlots =
    Number(ROSTER_SLOTS.WR) || 2;

  var teSlots =
    Number(ROSTER_SLOTS.TE) || 1;


  return {

    QB:
      Math.max(
        0,
        qbSlots -
        (Number(roster.QB) || 0)
      ),

    RB:
      Math.max(
        0,
        rbSlots -
        (Number(roster.RB) || 0)
      ),

    WR:
      Math.max(
        0,
        wrSlots -
        (Number(roster.WR) || 0)
      ),

    TE:
      Math.max(
        0,
        teSlots -
        (Number(roster.TE) || 0)
      )

  };
}

function calculateOpponentPositionDemand(
  roster,
  position
) {

  roster =
    roster || {};

  position =
    position || null;

  if (
    !position ||
    !['QB', 'RB', 'WR', 'TE'].includes(position)
  ) {
    return 0;
  }


  var qbSlots =
    Number(ROSTER_SLOTS.QB) || 1;

  var rbSlots =
    Number(ROSTER_SLOTS.RB) || 2;

  var wrSlots =
    Number(ROSTER_SLOTS.WR) || 2;

  var teSlots =
    Number(ROSTER_SLOTS.TE) || 1;

  var flexSlots =
    Number(ROSTER_SLOTS.FLEX) || 1;


  var counts = {
    QB:
      Number(roster.QB) || 0,

    RB:
      Number(roster.RB) || 0,

    WR:
      Number(roster.WR) || 0,

    TE:
      Number(roster.TE) || 0
  };


  /*
 * -------------------------------------------------------
 * QB
 * -------------------------------------------------------
 *
 * In a 1-QB league, an empty QB starter is a real need,
 * but it should not create the same draft pressure as
 * multiple open RB/WR starter spots.
 */

if (position === 'QB') {

  if (counts.QB < qbSlots) {
    return 1.5;
  }

  /*
   * Once the starting QB is filled, backup-QB demand
   * should be very low.
   */

  if (counts.QB === qbSlots) {
    return 0.25;
  }

  return 0;
}


  /*
   * -------------------------------------------------------
   * DEDICATED STARTER NEED
   * -------------------------------------------------------
   */

  var requiredSlots = {
    RB: rbSlots,
    WR: wrSlots,
    TE: teSlots
  };

  if (
    counts[position] <
    requiredSlots[position]
  ) {

    var missing =
      requiredSlots[position] -
      counts[position];

    /*
     * Missing multiple dedicated starters
     * = strongest demand.
     */

    if (position === 'TE') {

  if (missing >= 1) {
    return 1.5;
  }

}

if (missing >= 2) {
  return 3;
}

return 2;
  }


  /*
   * -------------------------------------------------------
   * FLEX / DEPTH DEMAND
   * -------------------------------------------------------
   *
   * Once dedicated starters are filled, RB/WR/TE
   * can still be attractive for FLEX.
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
      flexSlots -
      flexFilled
    );


  if (flexNeed > 0) {

    /*
     * RB and WR should get stronger FLEX demand
     * than TE because they are usually deeper
     * and more commonly used in FLEX.
     */

    if (
      position === 'RB' ||
      position === 'WR'
    ) {
      return 1;
    }

    if (position === 'TE') {
      return 0.5;
    }

  }


  /*
   * -------------------------------------------------------
   * BENCH / DEPTH DEMAND
   * -------------------------------------------------------
   *
   * Keep this low. This is only a soft threat.
   */

  if (
    position === 'RB' ||
    position === 'WR'
  ) {

    if (
      counts[position] <=
      requiredSlots[position] + 1
    ) {
      return 0.5;
    }

  }


  return 0;
}

function getDraftedRosterByTeam(
  teams
) {

  teams =
    Number(teams) || 10;

  var rosters = {};

  for (
    var team = 1;
    team <= teams;
    team++
  ) {

    rosters[team] = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0
    };

  }


  /*
   * Look at every drafted player row.
   *
   * We need each row's draft pick number so we can
   * determine which team owned that selection.
   */

  document
    .querySelectorAll(
      'tr.draftrow.drafted-other, ' +
      'tr.draftrow.drafted-mine'
    )
    .forEach(function(row) {

      var position =
        row.getAttribute(
          'data-pos'
        );

      if (
        !position ||
        rosters[1][position] === undefined
      ) {
        return;
      }


      /*
       * Try to recover the draft pick from the row.
       *
       * We'll support a few likely attributes so the
       * helper is resilient to your existing markup.
       */

      var pick =
        Number(
          row.getAttribute('data-pick') ||
          row.getAttribute('data-draft-pick') ||
          row.dataset.pick ||
          row.dataset.draftPick
        ) || 0;


      /*
       * If the row doesn't store its actual draft pick,
       * skip it for now.
       */

      if (!pick) {
        return;
      }


      var recordedTeamSlot = Number(row.getAttribute('data-team-slot')) || 0;
      var mapping = recordedTeamSlot
        ? {teamSlot: recordedTeamSlot}
        : getSnakeDraftTeamForPick(
            pick,
            teams
          );

      if (
        !mapping ||
        !mapping.teamSlot ||
        !rosters[mapping.teamSlot]
      ) {
        return;
      }


      rosters[
        mapping.teamSlot
      ][position]++;

    });


  return rosters;
}

function getOpponentNeedsByTeam(
  teams
) {

  teams =
    Number(teams) || 10;

  var rosters =
    getDraftedRosterByTeam(
      teams
    );

  var needs = {};

  Object.keys(rosters)
    .forEach(function(teamSlot) {

      needs[teamSlot] =
        calculateOpponentRosterNeeds(
          rosters[teamSlot]
        );

    });

  return {
    rosters:
      rosters,

    needs:
      needs
  };
}

function calculateOpponentDraftThreat(
  player,
  context
) {

  if (!player) {
    return 0;
  }

  context =
    context || {};

  var position =
    player.position ||
    player.pos ||
    null;

  if (
    !position ||
    !['QB', 'RB', 'WR', 'TE'].includes(position)
  ) {
    return 0;
  }

  var teams =
    Number(context.teams) || 10;

  var currentPick =
    Number(context.currentPick) || 0;

  var nextPick =
    Number(
      context.calculatedNextPick ||
      context.nextPick
    ) || 0;

  if (
    currentPick <= 0 ||
    nextPick <= currentPick
  ) {
    return 0;
  }

  /*
 * -------------------------------------------------------
 * OPPONENT THREAT CACHE
 * -------------------------------------------------------
 *
 * Threat is identical for players at the same position
 * when the draft window is identical.
 */

if (!context.opponentThreatCache) {

  context.opponentThreatCache =
    {};

}


var threatCacheKey =
  [
    teams,
    currentPick,
    nextPick,
    position
  ].join('|');


if (
  context.opponentThreatCache[
    threatCacheKey
  ] !== undefined
) {

  return context.opponentThreatCache[
    threatCacheKey
  ];

}


  var window =
    getTeamsPickingBeforeMyNextTurn(
      currentPick,
      nextPick,
      teams
    );

  var opponentData =
    getOpponentNeedsByTeam(
      teams
    );


  var threatPoints = 0;
  var maxThreatPoints = 0;


  Object.keys(
    window.teamPickCounts
  ).forEach(function(teamSlot) {

    var pickCount =
      Number(
        window.teamPickCounts[teamSlot]
      ) || 0;

    var needs =
      opponentData.needs[teamSlot];

    if (!needs) {
      return;
    }

var roster =
  opponentData.rosters[teamSlot] || {};

var positionDemand =
  calculateOpponentPositionDemand(
    roster,
    position
  );


    /*
     * Each opportunity that opponent has to draft
     * before our next turn adds exposure.
     */

    maxThreatPoints +=
      pickCount * 3;


    /*
     * Dedicated need:
     *
     * Need 2 = strong threat
     * Need 1 = moderate threat
     * Need 0 = low direct threat
     */

threatPoints +=
  pickCount *
  positionDemand;

  });


  if (maxThreatPoints <= 0) {
    return 0;
  }


  /*
   * Convert to 0–100.
   */

  var threatScore =
    (
      threatPoints /
      maxThreatPoints
    ) * 100;


  threatScore =
    Math.max(
      0,
      Math.min(
        100,
        threatScore
      )
    );


var roundedThreatScore =
  Math.round(
    threatScore
  );


context.opponentThreatCache[
  threatCacheKey
] =
  roundedThreatScore;


return roundedThreatScore;
}

function getOpponentDraftThreatDetails(
  player,
  context
) {

  if (!player) {
    return {
      position: null,
      overallThreat: 0,
      teams: []
    };
  }

  context =
    context || {};

  var position =
    player.position ||
    player.pos ||
    null;

  var teams =
    Number(context.teams) || 10;

  var currentPick =
    Number(context.currentPick) || 0;

  var nextPick =
    Number(
      context.calculatedNextPick ||
      context.nextPick
    ) || 0;


  if (
    !position ||
    currentPick <= 0 ||
    nextPick <= currentPick
  ) {

    return {
      position: position,
      overallThreat: 0,
      teams: []
    };
  }


  var window =
    getTeamsPickingBeforeMyNextTurn(
      currentPick,
      nextPick,
      teams
    );

  var opponentData =
    getOpponentNeedsByTeam(
      teams
    );

  var rows = [];


  Object.keys(
    window.teamPickCounts
  ).forEach(function(teamSlot) {

    var roster =
      opponentData.rosters[teamSlot] || {};

    var pickCount =
      Number(
        window.teamPickCounts[teamSlot]
      ) || 0;

    var demand =
      calculateOpponentPositionDemand(
        roster,
        position
      );

    var threatContribution =
      pickCount * demand;


    rows.push({
      teamSlot:
        Number(teamSlot),

      picksBeforeNextTurn:
        pickCount,

      QB:
        Number(roster.QB) || 0,

      RB:
        Number(roster.RB) || 0,

      WR:
        Number(roster.WR) || 0,

      TE:
        Number(roster.TE) || 0,

      position:
        position,

      demand:
        demand,

      threatContribution:
        threatContribution
    });

  });


  rows.sort(function(a, b) {

    return (
      Number(b.threatContribution) -
      Number(a.threatContribution)
    );

  });


  var overallThreat =
    calculateOpponentDraftThreat(
      player,
      context
    );


  return {
    player:
      player.name || null,

    position:
      position,

    currentPick:
      currentPick,

    nextPick:
      nextPick,

    picksBetween:
      window.picks.length,

    overallThreat:
      overallThreat,

    teams:
      rows
  };
}

function summarizeOpponentDraftThreat(
  player,
  context
) {

  var details =
    getOpponentDraftThreatDetails(
      player,
      context
    );


  if (
    !details ||
    !Array.isArray(details.teams)
  ) {

    return {
      position: null,
      overallThreat: 0,
      threateningTeams: 0,
      strongThreatTeams: 0,
      picksAtRisk: 0,
      label: 'LOW',
      summary: ''
    };

  }


/*
 * -------------------------------------------------------
 * MEANINGFUL OPPONENT DEMAND
 * -------------------------------------------------------
 *
 * Very small demand values represent soft bench/depth
 * interest and should not be described as a team that
 * is likely to take the position.
 */

var threateningTeams =
  details.teams.filter(function(team) {

    return (
      Number(team.demand) >= 1
    );

  });


var strongThreatTeams =
  details.teams.filter(function(team) {

    return (
      Number(team.demand) >= 2
    );

  });


var softThreatTeams =
  details.teams.filter(function(team) {

    var demand =
      Number(team.demand) || 0;

    return (
      demand > 0 &&
      demand < 1
    );

  });


  var picksAtRisk =
    threateningTeams.reduce(
      function(total, team) {

        return (
          total +
          (
            Number(
              team.picksBeforeNextTurn
            ) || 0
          )
        );

      },
      0
    );


  var overallThreat =
    Number(
      details.overallThreat
    ) || 0;


  var label =
    overallThreat >= 65
      ? 'HIGH'
      : overallThreat >= 35
        ? 'MODERATE'
        : 'LOW';


  var position =
    details.position ||
    null;


  var summary = '';


  if (position) {

    if (label === 'HIGH') {

      summary =
  threateningTeams.length +
  ' teams picking before your next turn have meaningful ' +
  position +
  ' demand. Waiting is risky.';

    } else if (label === 'MODERATE') {

      summary =
  threateningTeams.length +
  ' teams picking before your next turn have meaningful ' +
  position +
  ' demand. Waiting is risky.';

    } else {

      summary =
        'Most teams before your next pick show limited ' +
        position +
        ' demand.';

    }

  }


  return {

    player:
      details.player || null,

    position:
      position,

    currentPick:
      details.currentPick || 0,

    nextPick:
      details.nextPick || 0,

    picksBetween:
      details.picksBetween || 0,

    overallThreat:
      overallThreat,

    threateningTeams:
      threateningTeams.length,

    softThreatTeams:
  softThreatTeams.length,

    strongThreatTeams:
      strongThreatTeams.length,

    picksAtRisk:
      picksAtRisk,

    label:
      label,

    summary:
      summary,

    teams:
      details.teams

  };

}

function debugOpponentDraftThreat(
  playerName,
  context
) {

  var players =
    getDraftAssistantPlayers();

  var player =
    players.find(function(candidate) {

      return candidate &&
        candidate.name &&
        candidate.name.toLowerCase() ===
          String(playerName).toLowerCase();

    });


  if (!player) {

    console.warn(
      'OPPONENT THREAT DEBUG: Player not found:',
      playerName
    );

    return null;

  }


  if (!context) {

    var state =
      buildLiveDraftDebugState();

    context =
      state.context;

  }


  var details =
    getOpponentDraftThreatDetails(
      player,
      context
    );


  console.group(
    'OPPONENT DRAFT THREAT — ' +
    player.name
  );


  console.log(
    'Window:',
    {
      currentPick:
        details.currentPick,

      nextPick:
        details.nextPick,

      picksBetween:
        details.picksBetween,

      position:
        details.position,

      overallThreat:
        details.overallThreat
    }
  );


  console.table(
    details.teams
  );


  console.groupEnd();


  return details;
}

function debugOpponentThreatAtPick(
  playerName,
  pick
) {

  pick =
    Number(pick) || 0;

  if (!playerName || pick <= 0) {

    console.warn(
      'OPPONENT THREAT AT PICK: Invalid player or pick.'
    );

    return null;
  }


  var originalGetDraftAssistantState =
    getDraftAssistantState;

  var realState =
    originalGetDraftAssistantState();

  var teams =
    Number(realState.teams) || 10;


  /*
   * Temporarily simulate the requested current pick.
   */

  getDraftAssistantState =
    function() {

      var simulatedState =
        Object.assign(
          {},
          realState
        );

      simulatedState.currentPick =
        pick;

      simulatedState.myNextPick =
        pick;

      simulatedState.onClock =
        true;

      simulatedState.picksUntilMyTurn =
        0;

      return simulatedState;

    };


  var result = null;


  try {

    result =
      draftEngineWithSimulatedPriorPicks(
        pick,
        function() {

          var state =
            buildLiveDraftDebugState();

          var player =
            state.players.find(function(candidate) {

              return candidate &&
                candidate.name &&
                candidate.name.toLowerCase() ===
                  String(playerName).toLowerCase();

            });


          if (!player) {

            console.warn(
              'OPPONENT THREAT AT PICK: Player not found:',
              playerName
            );

            return null;
          }


          var details =
            getOpponentDraftThreatDetails(
              player,
              state.context
            );


          console.group(
            'OPPONENT THREAT AT PICK ' +
            pick +
            ' — ' +
            player.name
          );


          console.log(
            'Window:',
            {
              currentPick:
                details.currentPick,

              nextPick:
                details.nextPick,

              picksBetween:
                details.picksBetween,

              position:
                details.position,

              overallThreat:
                details.overallThreat
            }
          );


          console.table(
            details.teams
          );


          console.groupEnd();


          return {
            state:
              state,

            player:
              player,

            details:
              details
          };

        }
      );

  } finally {

    getDraftAssistantState =
      originalGetDraftAssistantState;

  }


  return result;
}

function debugTurnDecisionScenario(
  teams,
  draftSlot,
  firstPick
) {

  teams =
    Number(teams) || 12;

  draftSlot =
    Number(draftSlot) || 1;

  firstPick =
    Number(firstPick) || 1;


  var myPicks =
    getMyRemainingDraftPicks(
      firstPick,
      teams,
      16,
      draftSlot
    );


  if (
    !myPicks ||
    myPicks.length < 2
  ) {

    console.warn(
      'TURN DEBUG: Could not find two picks.'
    );

    return null;

  }


  var pickA =
    myPicks[0];

  var pickB =
    myPicks[1];


  /*
   * -------------------------------------------------------
   * BUILD ONE SIMULATED PICK STATE
   * -------------------------------------------------------
   */

  function buildPickResult(
    pick,
    selectedBeforeThisPick
  ) {

    return draftEngineWithSimulatedPriorPicks(
      pick,
      function() {

        var selectedRow = null;
        var originalClass = null;


        if (
          selectedBeforeThisPick &&
          selectedBeforeThisPick.name
        ) {

          selectedRow =
            Array.prototype.slice.call(
              document.querySelectorAll(
                'tr.draftrow'
              )
            )
            .find(function(row) {

              return (
                row.getAttribute(
                  'data-name'
                ) ===
                selectedBeforeThisPick.name
              );

            });


          if (selectedRow) {

            originalClass =
              selectedRow.className;

            selectedRow.classList.remove(
              'drafted-other'
            );

            selectedRow.classList.add(
              'drafted-mine'
            );

            selectedRow.setAttribute(
              'data-pick',
              selectedBeforeThisPick.pick
            );

            selectedRow.setAttribute(
              'data-team-slot',
              draftSlot
            );

          }

        }


        var originalStateGetter =
          getDraftAssistantState;

        var baseState =
          originalStateGetter();


        getDraftAssistantState =
          function() {

            return Object.assign(
              {},
              baseState,
              {
                teams:
                  teams,

                draftSlot:
                  draftSlot,

                currentPick:
                  pick,

                rounds:
                  16
              }
            );

          };


        try {

          var state =
            buildLiveDraftDebugState();


          if (
            !state ||
            !state.scored ||
            !state.scored.length
          ) {

            return null;

          }


var primary =
  state.scored[0];

recommendation =
  attachLiveTurnPackage(
    recommendation,
    state.context
  );


          var nextPickInfo =
            calculateMyNextDraftPick(
              pick,
              teams
            );


          return {

            pick:
              pick,

            primary:
              primary,

            recommendation:
              recommendation,

            nextPick:
              nextPickInfo
                ? nextPickInfo.nextPick
                : null,

            picksBetween:
              nextPickInfo
                ? nextPickInfo.picksBetween
                : null

          };


        } finally {

          getDraftAssistantState =
            originalStateGetter;


          if (
            selectedRow &&
            originalClass !== null
          ) {

            selectedRow.className =
              originalClass;

          }

        }

      }
    );
  }


  /*
   * -------------------------------------------------------
   * FIRST PICK
   * -------------------------------------------------------
   */

  var first =
    buildPickResult(
      pickA,
      null
    );


  if (!first) {

    console.warn(
      'TURN DEBUG: Could not build first pick.'
    );

    return null;

  }


  /*
   * -------------------------------------------------------
   * SECOND PICK
   * -------------------------------------------------------
   */

  var second =
    buildPickResult(
      pickB,
      {
        name:
          first.primary.name,

        pick:
          pickA
      }
    );


  if (!second) {

    console.warn(
      'TURN DEBUG: Could not build second pick.'
    );

    return null;

  }


  /*
   * -------------------------------------------------------
   * OUTPUT
   * -------------------------------------------------------
   */

  var output = [
    {
      stage:
        'FIRST PICK',

      pick:
        first.pick,

      primary:
        first.primary.name,

      position:
        first.primary.position,

      score:
        Number(
          first.primary.finalScore
        ).toFixed(1),

      nextPick:
        first.nextPick,

      picksBetween:
        first.picksBetween,

      recommendation:
        first.recommendation
          ? first.recommendation.recommendation
          : null,

      confidence:
        first.recommendation
          ? first.recommendation.confidence
          : null
    },

    {
      stage:
        'SECOND PICK',

      pick:
        second.pick,

      primary:
        second.primary.name,

      position:
        second.primary.position,

      score:
        Number(
          second.primary.finalScore
        ).toFixed(1),

      nextPick:
        second.nextPick,

      picksBetween:
        second.picksBetween,

      recommendation:
        second.recommendation
          ? second.recommendation.recommendation
          : null,

      confidence:
        second.recommendation
          ? second.recommendation.confidence
          : null
    }
  ];


  console.group(
    'TURN DECISION DEBUG — ' +
    teams +
    ' TEAM — SLOT ' +
    draftSlot
  );


  console.table(
    output
  );


  console.log(
    'RAW FIRST:',
    first
  );

  console.log(
    'RAW SECOND:',
    second
  );


  console.groupEnd();


  return {
    teams:
      teams,

    draftSlot:
      draftSlot,

    firstPick:
      first,

    secondPick:
      second,

    table:
      output
  };
}

function debugTurnSequencingAdvice(
  teams,
  draftSlot,
  currentPick
) {

  teams =
    Number(teams) || 12;

  draftSlot =
    Number(draftSlot) || 1;

  currentPick =
    Number(currentPick) || 1;


  return draftEngineWithSimulatedPriorPicks(
    currentPick,
    function() {

      /*
       * -------------------------------------------------------
       * TEMPORARILY EXPOSE CORRECT DRAFT STATE
       * -------------------------------------------------------
       */

      var originalStateGetter =
        getDraftAssistantState;

      var baseState =
        originalStateGetter();


      getDraftAssistantState =
        function() {

          return Object.assign(
            {},
            baseState,
            {
              teams:
                teams,

              draftSlot:
                draftSlot,

              currentPick:
                currentPick,

              rounds:
                16
            }
          );

        };


      try {

        var state =
          buildLiveDraftDebugState();


        if (
          !state ||
          !state.scored ||
          !state.scored.length
        ) {

          console.warn(
            'TURN SEQUENCING: No scored players.'
          );

          return null;

        }


        var primary =
          state.scored[0];


        var recommendation =
          calculateDraftRecommendation(
            primary,
            state.scored,
            state.context
          );

        var nextPickInfo =
          calculateMyNextDraftPick(
            currentPick,
            teams
          );


        var nextPick =
          nextPickInfo
            ? Number(nextPickInfo.nextPick)
            : 0;


        /*
         * -------------------------------------------------------
         * TOP CURRENT OPTIONS
         * -------------------------------------------------------
         */

        var topCandidates =
          state.scored
            .slice(0, 10)
            .map(function(player) {

              var survival =
                nextPick
                  ? calculateNextPickSurvival(
                      player,
                      Object.assign(
                        {},
                        state.context,
                        {
                          calculatedNextPick:
                            nextPick,

                          nextPick:
                            nextPick
                        }
                      )
                    )
                  : 0;


              return {

                name:
                  player.name,

                position:
                  player.position,

                rank:
                  player.rank,

                score:
                  Number(
                    player.finalScore
                  ) || 0,

                survival:
                  Number(
                    survival
                  ) || 0,

                player:
                  player

              };

            });


        /*
         * -------------------------------------------------------
         * SAFE-TO-WAIT PLAYER
         * -------------------------------------------------------
         *
         * Start with the engine's primary recommendation.
         */

        var waitTarget =
          topCandidates[0];


        /*
         * -------------------------------------------------------
         * WHO SHOULD WE TAKE FIRST?
         * -------------------------------------------------------
         *
         * If the primary is likely to survive to the immediate
         * next pick, look for a strong alternative that is LESS
         * likely to survive.
         */

        var takeNowOptions =
          topCandidates
            .filter(function(candidate) {

              if (
                !candidate ||
                candidate.name ===
                  waitTarget.name
              ) {

                return false;

              }


              /*
               * Candidate should be reasonably close
               * in current value.
               */

              var scoreGap =
                waitTarget.score -
                candidate.score;


              return (
                scoreGap <= 8 &&
                candidate.survival <
                  waitTarget.survival
              );

            })
            .sort(function(a, b) {

              /*
               * Prefer players with strong current score
               * AND high danger of disappearing.
               */

              var aUrgency =
                a.score +
                (
                  (100 - a.survival) *
                  0.15
                );


              var bUrgency =
                b.score +
                (
                  (100 - b.survival) *
                  0.15
                );


              return (
                bUrgency -
                aUrgency
              );

            });


        var draftNow =
          takeNowOptions.length
            ? takeNowOptions[0]
            : waitTarget;


        /*
         * -------------------------------------------------------
         * OUTPUT
         * -------------------------------------------------------
         */

        console.group(
          'TURN SEQUENCING ADVICE — ' +
          teams +
          ' TEAM — SLOT ' +
          draftSlot +
          ' — PICK ' +
          currentPick
        );


        console.log(
          'Window:',
          {
            currentPick:
              currentPick,

            nextPick:
              nextPick,

            picksBetween:
              nextPickInfo
                ? nextPickInfo.picksBetween
                : null
          }
        );


        console.table(
          topCandidates.map(function(candidate) {

            return {

              name:
                candidate.name,

              position:
                candidate.position,

              rank:
                candidate.rank,

              score:
                candidate.score.toFixed(1),

              survival:
                candidate.survival.toFixed(1),

              scoreGap:
                (
                  waitTarget.score -
                  candidate.score
                ).toFixed(1)

            };

          })
        );


        console.log(
          'PRIMARY:',
          waitTarget.name
        );


        console.log(
          'ENGINE RECOMMENDATION:',
          recommendation
            ? recommendation.recommendation
            : null
        );


        console.log(
          'DRAFT NOW:',
          draftNow.name
        );


        console.log(
          'THEN TARGET:',
          draftNow.name !==
            waitTarget.name
              ? waitTarget.name
              : null
        );


        console.groupEnd();


        return {

          currentPick:
            currentPick,

          nextPick:
            nextPick,

          picksBetween:
            nextPickInfo
              ? nextPickInfo.picksBetween
              : null,

          primary:
            waitTarget,

          recommendation:
            recommendation,

          draftNow:
            draftNow,

          thenTarget:
            draftNow.name !==
              waitTarget.name
                ? waitTarget
                : null,

          candidates:
            topCandidates

        };


      } finally {

        getDraftAssistantState =
          originalStateGetter;

      }

    }
  );
}

function calculateTurnPackage(
  teams,
  draftSlot,
  currentPick,
  options
) {

  options =
    options || {};

  teams =
    Number(teams) || 12;

  draftSlot =
    Number(draftSlot) || 1;

  currentPick =
    Number(currentPick) || 1;


  /*
   * -------------------------------------------------------
   * 1. VERIFY THIS IS ACTUALLY A BACK-TO-BACK TURN
   * -------------------------------------------------------
   */

  var nextPickInfo =
    calculateMyNextDraftPick(
      currentPick,
      teams
    );


  if (
    !nextPickInfo ||
    Number(nextPickInfo.picksBetween) !== 0
  ) {

    console.warn(
      'TURN PACKAGE: Current pick is not part of a back-to-back turn.',
      {
        currentPick:
          currentPick,

        nextPick:
          nextPickInfo
            ? nextPickInfo.nextPick
            : null,

        picksBetween:
          nextPickInfo
            ? nextPickInfo.picksBetween
            : null
      }
    );

    return null;
  }


  var secondPick =
    Number(
      nextPickInfo.nextPick
    ) || 0;


  /*
   * -------------------------------------------------------
   * 2. BUILD FIRST-PICK STATE
   * -------------------------------------------------------
   */

  return draftEngineWithSimulatedPriorPicks(
    currentPick,
    function() {

      var originalStateGetter =
        getDraftAssistantState;

      var baseState =
        originalStateGetter();


      getDraftAssistantState =
        function() {

          return Object.assign(
            {},
            baseState,
            {
              teams:
                teams,

              draftSlot:
                draftSlot,

              currentPick:
                currentPick,

              rounds:
                16
            }
          );

        };


      try {

        var firstState =
          buildLiveDraftDebugState();


        if (
          !firstState ||
          !firstState.scored ||
          !firstState.scored.length
        ) {

          console.warn(
            'TURN PACKAGE: Could not build first-pick state.'
          );

          return null;
        }


        /*
         * -------------------------------------------------------
         * 3. ONLY TEST THE TOP FIRST-PICK CANDIDATES
         * -------------------------------------------------------
         *
         * We do not need to simulate the entire player pool.
         * The top 8 is enough for package comparison and keeps
         * this debug tool reasonably fast.
         */

        var firstCandidates =
          firstState.scored
            .slice(0, 8);


        var packages =
          [];


        /*
         * -------------------------------------------------------
         * 4. SIMULATE EACH POSSIBLE FIRST PLAYER
         * -------------------------------------------------------
         */

        firstCandidates.forEach(function(firstPlayer) {

          if (
            !firstPlayer ||
            !firstPlayer.name
          ) {

            return;
          }


          var selectedRow =
            firstPlayer.row || null;

          var originalClass =
            selectedRow
              ? selectedRow.className
              : null;

          var originalPick =
            selectedRow
              ? selectedRow.getAttribute(
                  'data-pick'
                )
              : null;

          var originalTeamSlot =
            selectedRow
              ? selectedRow.getAttribute(
                  'data-team-slot'
                )
              : null;


          /*
           * Temporarily mark first player as OUR pick.
           */

          if (selectedRow) {

            selectedRow.classList.remove(
              'drafted-other'
            );

            selectedRow.classList.add(
              'drafted-mine'
            );

            selectedRow.setAttribute(
              'data-pick',
              currentPick
            );

            selectedRow.setAttribute(
              'data-team-slot',
              draftSlot
            );

          }


          try {

            /*
             * ---------------------------------------------------
             * 5. BUILD SECOND-PICK STATE AFTER PLAYER A
             * ---------------------------------------------------
             */

            getDraftAssistantState =
              function() {

                return Object.assign(
                  {},
                  baseState,
                  {
                    teams:
                      teams,

                    draftSlot:
                      draftSlot,

                    currentPick:
                      secondPick,

                    rounds:
                      16
                  }
                );

              };


            var secondState =
              buildLiveDraftDebugState();


            if (
              !secondState ||
              !secondState.scored ||
              !secondState.scored.length
            ) {

              return;
            }


            /*
 * ---------------------------------------------------
 * 6. FIND TOP SECOND-PICK CANDIDATES
 * ---------------------------------------------------
 *
 * Evaluate several possible second selections instead
 * of assuming the highest-scoring player is always the
 * best turn partner.
 */

var secondCandidates =
  secondState.scored
    .filter(function(candidate) {

      return (
        candidate &&
        candidate.name &&
        candidate.name !==
          firstPlayer.name
      );

    })
    .slice(0, 4);


if (!secondCandidates.length) {

  return;

}


/*
 * ---------------------------------------------------
 * 7. BUILD EACH TWO-PLAYER PACKAGE
 * ---------------------------------------------------
 */

secondCandidates.forEach(function(secondPlayer) {

  var firstScore =
    Number(
      firstPlayer.finalScore
    ) || 0;


  var secondScore =
    Number(
      secondPlayer.finalScore
    ) || 0;


  /*
   * Small diversity bonus.
   *
   * Keep this intentionally small because roster
   * construction is already represented in the
   * second player's rescored finalScore.
   */

  var positionDiversityBonus =
    (
      firstPlayer.position !==
      secondPlayer.position
    )
      ? 1.5
      : 0;


  /*
   * Small structural bonus for premium singleton
   * positions. Again, keep this tiny to avoid
   * double-counting positional value.
   */

  var structuralBonus =
    0;


  if (
    firstPlayer.position === 'QB' ||
    secondPlayer.position === 'QB'
  ) {

    structuralBonus +=
      0.5;

  }


  if (
    firstPlayer.position === 'TE' ||
    secondPlayer.position === 'TE'
  ) {

    structuralBonus +=
      0.5;

  }


  /*
   * -------------------------------------------------
   * PACKAGE SCORE
   * -------------------------------------------------
   */

  var packageScore =
    firstScore +
    secondScore +
    positionDiversityBonus +
    structuralBonus;


  packages.push({

    firstPlayer:
      firstPlayer,

    secondPlayer:
      secondPlayer,

    firstName:
      firstPlayer.name,

    firstPosition:
      firstPlayer.position,

    firstScore:
      firstScore,

    secondName:
      secondPlayer.name,

    secondPosition:
      secondPlayer.position,

    secondScore:
      secondScore,

    positionDiversityBonus:
      positionDiversityBonus,

    structuralBonus:
      structuralBonus,

    packageScore:
      packageScore

  });

});


          } finally {

            /*
             * ---------------------------------------------------
             * RESTORE PLAYER ROW
             * ---------------------------------------------------
             */

            if (selectedRow) {

              selectedRow.className =
                originalClass;


              if (originalPick !== null) {

                selectedRow.setAttribute(
                  'data-pick',
                  originalPick
                );

              } else {

                selectedRow.removeAttribute(
                  'data-pick'
                );

              }


              if (
                originalTeamSlot !== null
              ) {

                selectedRow.setAttribute(
                  'data-team-slot',
                  originalTeamSlot
                );

              } else {

                selectedRow.removeAttribute(
                  'data-team-slot'
                );

              }

            }

          }

        });


        /*
         * -------------------------------------------------------
         * 9. SORT PACKAGES
         * -------------------------------------------------------
         */

        packages.sort(function(a, b) {

          return (
            Number(b.packageScore) -
            Number(a.packageScore)
          );

        });


        var bestPackage =
          packages.length
            ? packages[0]
            : null;

        var secondBestPackage =
  packages.length > 1
    ? packages[1]
    : null;


var packageAdvantage =
  (
    bestPackage &&
    secondBestPackage
  )
    ? (
        Number(bestPackage.packageScore) -
        Number(secondBestPackage.packageScore)
      )
    : 0;


var packageConfidence =
  'LOW';


if (packageAdvantage >= 6) {

  packageConfidence =
    'VERY HIGH';

} else if (packageAdvantage >= 4) {

  packageConfidence =
    'HIGH';

} else if (packageAdvantage >= 2) {

  packageConfidence =
    'MODERATE';

}


        /*
         * -------------------------------------------------------
         * 10. DEBUG OUTPUT
         * -------------------------------------------------------
         */
      if (!options.silent) {
        console.group(
          'TURN PACKAGE DEBUG — ' +
          teams +
          ' TEAM — SLOT ' +
          draftSlot +
          ' — PICKS ' +
          currentPick +
          '/' +
          secondPick
        );


        console.table(
          packages
            .slice(0, 10)
            .map(function(pkg) {

              return {

                pick1:
                  pkg.firstName,

                pos1:
                  pkg.firstPosition,

                score1:
                  pkg.firstScore.toFixed(1),

                pick2:
                  pkg.secondName,

                pos2:
                  pkg.secondPosition,

                score2:
                  pkg.secondScore.toFixed(1),

                diversity:
                  pkg.positionDiversityBonus.toFixed(1),

                structural:
                  pkg.structuralBonus.toFixed(1),

                packageScore:
                  pkg.packageScore.toFixed(1)

              };

            })
        );


if (bestPackage) {

  console.log(
    'BEST TURN PACKAGE:',
    {
      pick1:
        bestPackage.firstName,

      pick1Position:
        bestPackage.firstPosition,

      pick2:
        bestPackage.secondName,

      pick2Position:
        bestPackage.secondPosition,

      packageScore:
        Number(
          bestPackage.packageScore
        ).toFixed(1),

      packageAdvantage:
        Number(
          packageAdvantage
        ).toFixed(1),

      confidence:
        packageConfidence
    }
  );

}

console.groupEnd();

} // closes if (!options.silent)


return {

  teams:
    teams,

  draftSlot:
    draftSlot,

  firstPick:
    currentPick,

  secondPick:
    secondPick,

  bestPackage:
    bestPackage,

  secondBestPackage:
    secondBestPackage,

  packageAdvantage:
    packageAdvantage,

  packageConfidence:
    packageConfidence,

  packages:
    packages

};


} finally {

  getDraftAssistantState =
    originalStateGetter;

}

    }
  );
}

function attachLiveTurnPackage(
  recommendation,
  context
) {

  if (
    !recommendation ||
    !context
  ) {

    return recommendation;

  }


  var teams =
    Number(
      context.teams
    ) || 10;


  var draftSlot =
    Number(
      context.draftSlot
    ) || 1;


  var currentPick =
    Number(
      context.currentPick
    ) || 0;


  if (currentPick <= 0) {

    return recommendation;

  }


  /*
   * -------------------------------------------------------
   * CHECK WHETHER THIS IS A TRUE BACK-TO-BACK TURN
   * -------------------------------------------------------
   */

  var nextPickInfo =
    calculateMyNextDraftPick(
      currentPick,
      teams
    );


  if (
    !nextPickInfo ||
    Number(
      nextPickInfo.picksBetween
    ) !== 0
  ) {

    recommendation.turnPackage =
      null;

    recommendation.turnPackageActive =
      false;

    return recommendation;

  }


  /*
   * -------------------------------------------------------
   * BUILD TURN PACKAGE ONCE
   * -------------------------------------------------------
   */

  var turnPackage =
    calculateTurnPackage(
      teams,
      draftSlot,
      currentPick
    );


  if (
    !turnPackage ||
    !turnPackage.bestPackage
  ) {

    recommendation.turnPackage =
      null;

    recommendation.turnPackageActive =
      false;

    return recommendation;

  }


  var best =
    turnPackage.bestPackage;


  /*
   * -------------------------------------------------------
   * EXPOSE TURN INTELLIGENCE
   * -------------------------------------------------------
   */

  recommendation.turnPackageActive =
    true;


  recommendation.turnPackage =
    turnPackage;


  recommendation.turnPick1 =
    best.firstName;


  recommendation.turnPick1Position =
    best.firstPosition;


  recommendation.turnPick2 =
    best.secondName;


  recommendation.turnPick2Position =
    best.secondPosition;


  recommendation.turnPackageScore =
    Number(
      best.packageScore
    ) || 0;


  recommendation.turnPackageAdvantage =
    Number(
      turnPackage.packageAdvantage
    ) || 0;


  recommendation.turnPackageConfidence =
    turnPackage.packageConfidence ||
    'LOW';


  /*
   * The live recommendation should point toward
   * the optimal FIRST player of the turn.
   */

  recommendation.turnRecommendedNow =
    best.firstName;


  recommendation.turnTargetNext =
    best.secondName;


  return recommendation;
}

  /*
   * -------------------------------------------------------
   * BUILD A DEBUG STATE FOR EACH PICK
   * -------------------------------------------------------
   */

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
  var completedPicks = getCompletedDraftPickCount();
  var completion = getDraftCompletionStatus({totalPicks: totalPicks, rounds: rounds});

  if (completion.authoritative) {
    counter.innerHTML =
      'Draft complete &middot; <b>' + totalPicks + ' picks</b>';
    return;
  }

  if (completion.externalComplete && !completion.authoritative) {
    counter.innerHTML =
      'Draft appears complete &middot; <b>' + completedPicks + ' of ' + totalPicks +
      ' numbered picks synced</b>' +
      (completion.myRosterCount >= rounds ? ' &middot; provisional report ready' : '');
    return;
  }

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
  var totalDrafted = getCompletedDraftPickCount();
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

  var takenCount = getCompletedDraftPickCount();
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
    
    var rk = Number(row.getAttribute('data-rank')) ||
      Number(row.getAttribute('data-board-rank')) || 0;
    
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

function updateScarcityAlerts(liveState) {
  if (typeof updateScarcityAlertsCustom !== 'function') return;
  try {
    updateScarcityAlertsCustom(liveState);
  } catch (error) {
    console.warn('Scarcity alert update failed', error);
  }
}

function updateScarcityAlertsCustom(sharedLiveState) {

  var container =
    document.getElementById(
      'scarcity-alerts'
    );


  if (!container) {
    return;
  }


  /*
   * -------------------------------------------------------
   * BUILD CURRENT ENGINE STATE
   * -------------------------------------------------------
   */

  var liveState =
    sharedLiveState || buildLiveDraftDebugState();


  if (
    !liveState ||
    !liveState.players
  ) {

    container.innerHTML =
      '';

    return;
  }


  var profiles =
    liveState.vorpResult &&
    Array.isArray(
      liveState.vorpResult.profiles
    )
      ? liveState.vorpResult.profiles
      : [];


  var scarcityState =
    buildLiveTierScarcityState(
      liveState.players,
      profiles
    );


  if (!scarcityState) {

    container.innerHTML =
      '';

    return;
  }


  updateDraftDayDashboard(liveState, scarcityState);

  var activeAlerts = Array.isArray(scarcityState.alerts)
    ? scarcityState.alerts
    : [];


  /*
   * -------------------------------------------------------
   * ALERT HELPERS
   * -------------------------------------------------------
   */

  function getAlertSymbol(status) {

    if (
      status ===
      'CRITICAL CLIFF'
    ) {

      return '&#128680;';

    }


    if (
      status ===
      'TIER CLOSING'
    ) {

      return '&#9888;';

    }


    if (
      status ===
      'HIGH SCARCITY'
    ) {

      return '&#9888;';

    }


    return '&#9651;';

  }


  function buildAlertText(alert) {

    if (!alert) {
      return '';
    }


    var position =
      alert.position ||
      'N/A';


    /*
     * -------------------------------------------------------
     * CRITICAL CLIFF
     * -------------------------------------------------------
     */

    if (
      alert.status ===
      'CRITICAL CLIFF'
    ) {

      return (
        alert.playersBeforeCliff +
        ' ' +
        position +
        (
          alert.playersBeforeCliff === 1
            ? ''
            : 's'
        ) +
        ' remain before the ' +
        (
          alert.fromTier ||
          '?'
        ) +
        ' &rarr; ' +
        (
          alert.toTier ||
          '?'
        ) +
        ' tier drop'
      );

    }


    /*
     * -------------------------------------------------------
     * TIER CLOSING
     * -------------------------------------------------------
     */

    if (
      alert.status ===
      'TIER CLOSING'
    ) {

      return (
        alert.playersBeforeCliff +
        ' ' +
        position +
        (
          alert.playersBeforeCliff === 1
            ? ''
            : 's'
        ) +
        ' remain before the ' +
        (
          alert.fromTier ||
          '?'
        ) +
        ' &rarr; ' +
        (
          alert.toTier ||
          '?'
        ) +
        ' tier drop'
      );

    }


    /*
     * -------------------------------------------------------
     * HIGH SCARCITY
     * -------------------------------------------------------
     */

    if (
      alert.status ===
      'HIGH SCARCITY'
    ) {

      return (
        (
          alert.bestAvailableName ||
          'Best available player'
        ) +
        ' leads a thin ' +
        position +
        ' pool'
      );

    }


    /*
     * -------------------------------------------------------
     * LIMITED DEPTH
     * -------------------------------------------------------
     */

    return (
      position +
      ' depth is becoming limited'
    );

  }


  /*
   * -------------------------------------------------------
   * RENDER
   * -------------------------------------------------------
   */

var html =
  '<div class="board-alerts-header">' +
    '<span>LIVE TIER ALERTS</span>' +
    '<b>' + (activeAlerts.length ? activeAlerts.length + ' active' : 'Board stable') + '</b>' +
  '</div>' +
  '<div class="board-alerts-grid">';


  activeAlerts
    .slice(0, 4)
    .forEach(function(alert) {

      html +=
        '<div class="board-alert-card">' +

          '<div style="' +
            'font-size:0.71rem;' +
            'font-weight:900;' +
            'letter-spacing:0.03em;' +
            'color:#e0c98a;' +
          '">' +

            getAlertSymbol(
              alert.status
            ) +

            ' ' +

            alert.position +

            ' &middot; ' +

            alert.status +

          '</div>' +


          '<div style="' +
            'font-size:0.69rem;' +
            'line-height:1.35;' +
            'color:#a9c2ab;' +
            'margin-top:3px;' +
          '">' +

            buildAlertText(
              alert
            ) +

          '</div>' +

        '</div>';

    });

  if (!activeAlerts.length) {
    html +=
      '<div class="board-alert-card board-alert-calm">' +
        '<div><b>&#10003; No urgent tier cliffs right now</b></div>' +
        '<small>The board still has workable depth across the main positions.</small>' +
      '</div>';
  }

  /*
 * -------------------------------------------------------
 * HEALTHY DEPTH SIGNAL
 * -------------------------------------------------------
 *
 * Warnings tell us where we may need to act.
 *
 * This gives one useful counter-signal showing a
 * position where waiting remains reasonable.
 */

var healthyPositions =
  ['QB', 'RB', 'WR', 'TE']
    .map(function(position) {

      return (
        scarcityState.positions[
          position
        ] || null
      );

    })
    .filter(function(positionState) {

      return (
        positionState &&
        positionState.status ===
          'HEALTHY DEPTH'
      );

    });


/*
 * Prefer the position with the LOWEST scarcity.
 *
 * Lower scarcity means greater positional depth and
 * therefore the strongest "safe to wait" signal.
 */

healthyPositions.sort(
  function(a, b) {

    return (
      Number(a.scarcity || 0) -
      Number(b.scarcity || 0)
    );

  }
);


var healthiestPosition =
  healthyPositions[0] ||
  null;


if (healthiestPosition) {

  html +=
    '<div class="board-alert-card board-alert-calm">' +

      '<div style="' +
        'font-size:0.71rem;' +
        'font-weight:900;' +
        'letter-spacing:0.03em;' +
        'color:#a9c2ab;' +
      '">' +

        '&#10003; ' +
        healthiestPosition.position +
        ' &middot; DEPTH HEALTHY' +

      '</div>' +


      '<div style="' +
        'font-size:0.69rem;' +
        'line-height:1.35;' +
        'color:#8faa92;' +
        'margin-top:3px;' +
      '">' +

        'Waiting at ' +
        healthiestPosition.position +
        ' remains reasonable' +

      '</div>' +

    '</div>';

}

html += '</div>';

container.innerHTML =
  html;


  /*
   * Useful for console inspection.
   */

  window.latestTierScarcityState =
    scarcityState;

}
function addEditControls() { safeCall('addEditControlsCustom'); }

function updatePickSettings() {
  var pcTeams = document.getElementById('pcTeams');
  var pcSlot = document.getElementById('pcSlot');
  var pcRounds = document.getElementById('pcRounds');

  if (pcTeams && pcTeams.value) LEAGUE_SIZE = parseInt(pcTeams.value, 10) || 10;
  if (pcSlot && pcSlot.value) MY_DRAFT_SLOT = parseInt(pcSlot.value, 10) || 10;
  if (pcRounds && pcRounds.value) TOTAL_ROUNDS = parseInt(pcRounds.value, 10) || 16;

  renderAutoDraftTeamToggles();
  triggerAllBoardUpdates({deferIntelligence: true});
  scheduleSave();
  publishEspnSyncSettingsUpdate();
}

function jumpTo(id){
  var el = document.getElementById(id);
  if(el){
    var tierGroup = el.closest('tbody.tier-group');
    if(tierGroup) setTierSectionCollapsed(tierGroup, false);
    el.scrollIntoView({behavior:'smooth', block:'start'});
  }
}

function updateTierCollapseButton(tierGroup) {
  if (!tierGroup) return;

  var button = tierGroup.querySelector('.tier-collapse-btn');
  if (!button) return;

  var collapsed = tierGroup.classList.contains('is-collapsed');
  var playerCount = tierGroup.querySelectorAll('tr.draftrow').length;
  button.textContent = (collapsed ? 'Show ' : 'Hide ') + playerCount;
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function setTierSectionCollapsed(tierGroup, collapsed) {
  if (!tierGroup) return;
  tierGroup.classList.toggle('is-collapsed', Boolean(collapsed));
  if (!collapsed) tierGroup.classList.remove('is-temporarily-expanded');
  updateTierCollapseButton(tierGroup);
  if (typeof refreshDraftRowAccessibility === 'function') refreshDraftRowAccessibility();
}

function toggleTierSection(tierGroup) {
  setTierSectionCollapsed(
    tierGroup,
    !tierGroup.classList.contains('is-collapsed')
  );
}

function initializeTierSectionOrganization() {
  document.querySelectorAll('tbody.tier-group').forEach(function(tierGroup) {
    var dividerInner = tierGroup.querySelector('.tier-divider-row .divider-inner');

    if (dividerInner && !dividerInner.querySelector('.tier-collapse-btn')) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'tier-collapse-btn';
      button.setAttribute('aria-label', 'Toggle ' + (tierGroup.getAttribute('data-tier-name') || 'tier') + ' players');
      button.onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        toggleTierSection(tierGroup);
      };
      dividerInner.appendChild(button);
    }

    var tierId = tierGroup.id.replace('tbody-', '');
    var subtitle = tierGroup.querySelector('.divider-sub');
    var playerCount = tierGroup.querySelectorAll('tr.draftrow').length;
    if (subtitle && WAR_ROOM_CONFIG.tierFantasyProsRanges[tierId]) {
      subtitle.textContent = WAR_ROOM_CONFIG.tierFantasyProsRanges[tierId] + ' · ' + playerCount + ' players';
    }
    setTierSectionCollapsed(tierGroup, tierId === 'E' || tierId === 'F');
  });
}

function updateTierFilterExpansion(query) {
  var hasSearch = Boolean(query && query.length >= 2);
  var hasPositionFilter = Boolean(
    document.querySelector('tr.draftrow.hidden-row')
  );

  document.querySelectorAll('tbody.tier-group.is-collapsed').forEach(function(tierGroup) {
    var hasRelevantPlayer = Array.prototype.some.call(
      tierGroup.querySelectorAll('tr.draftrow'),
      function(row) {
        if (row.classList.contains('hidden-row')) return false;
        if (!hasSearch) return hasPositionFilter;
        var name = (row.getAttribute('data-name') || row.innerText || '').toLowerCase();
        return name.indexOf(query) !== -1;
      }
    );

    tierGroup.classList.toggle(
      'is-temporarily-expanded',
      (hasSearch || hasPositionFilter) && hasRelevantPlayer
    );
  });
}

function setPosFilter(pos, btn){
  currentPosFilter = pos;
  document.querySelectorAll('.filterbtn').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  applyFilters();
}

function updateDraftDayDashboard(liveState, scarcityState){
  var container = document.getElementById('draft-day-dashboard');
  if(!container) return;

  if (!liveState || !Array.isArray(liveState.players) || !scarcityState) {
    container.innerHTML = '<div class="board-pressure-loading">Measuring the live board…</div>';
    return;
  }

  var state = liveState.draftState || getDraftAssistantState();
  var context = liveState.context || {};
  var positions = scarcityState.positions || {};
  var draftableCutoff = state.totalPicks;
  
  var html =
    '<div class="board-pressure-section-label"><span>DECISION WINDOW</span><b>ECR top ' + draftableCutoff + ' remaining</b></div>' +
    '<div class="board-pressure-grid">';
  ['QB','RB','WR','TE','K','DST'].forEach(function(pos){
    var available = liveState.players.filter(function(player) {
      return player && player.available && player.position === pos;
    }).sort(function(a, b) {
      return (Number(a.ecr) || Number(a.rank) || 9999) - (Number(b.ecr) || Number(b.rank) || 9999);
    });
    var relevant = available.filter(function(player) {
      return player.ecr != null && (
        pos === 'K' || pos === 'DST' || Number(player.ecr) <= draftableCutoff
      );
    });
    var positionState = positions[pos] || null;
    var best = positionState && positionState.bestAvailable ? positionState.bestAvailable : available[0] || null;
    var survival = best ? Math.round(calculateNextPickSurvival(best, context)) : 0;
    var status = positionState ? positionState.status : 'ENDGAME';
    var urgency = status === 'CRITICAL CLIFF' || survival < 25
      ? 'scarce'
      : status === 'TIER CLOSING' || status === 'HIGH SCARCITY' || survival < 50
        ? 'limited'
        : survival < 75 ? 'fair' : 'plenty';
    var playerName = best && best.row ? getDraftRowDisplayName(best.row) : best && best.name ? best.name : 'None';
    var cliffText = positionState && positionState.playersBeforeCliff > 0
      ? positionState.playersBeforeCliff + ' before tier drop'
      : pos === 'K' || pos === 'DST' ? 'Endgame position' : 'No immediate cliff';
    html += '<div class="board-pressure-card pressure-'+urgency+'">';
    html += '<div><span class="pos-pill pos-'+pos+'">'+pos+'</span><b>'+relevant.length+(pos === 'K' || pos === 'DST' ? ' ranked' : ' relevant')+'</b></div>';
    html += '<strong class="pressure-best">'+escapeSummaryHtml(playerName)+'</strong>';
    html += '<div class="board-pressure-meter"><span style="width:'+survival+'%"></span></div>';
    html += '<small>'+survival+'% next-pick survival · '+escapeSummaryHtml(cliffText)+'</small>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

var _draftIntelligenceTimer = null;

function publishBoardUpdateTimings(timings) {
  window.latestBoardUpdateTimings = timings;
  document.documentElement.setAttribute(
    'data-last-board-update-timings',
    JSON.stringify(timings)
  );
}

function triggerAllBoardUpdates(options) {
  options = options || {};
  var timings = {};
  var totalStart = performance.now();

  function timedUpdate(name, update) {
    var startedAt = performance.now();
    update();
    timings[name] = Number((performance.now() - startedAt).toFixed(1));
  }

  timedUpdate('myTeam', updateMyTeam);
  timedUpdate('draftSummary', updateDraftSummary);
  timedUpdate('remaining', updateRemaining);
  timedUpdate('bestAvailable', updateBestAvailable);
  timedUpdate('pickCounter', updatePickCounter);
  timedUpdate('marketValues', refreshDynamicMarketValueCells);
  timedUpdate('nextPickDisplay', updateNextPickDisplay);
  timedUpdate('nextPickMarker', updateNextPickMarker);
  timedUpdate('roundMarkers', addRoundMarkers);
  var draftComplete = false;
  timedUpdate('completionMode', function() {
    draftComplete = updateDraftCompletionMode();
  });

  timings.interactive = Number((performance.now() - totalStart).toFixed(1));
  publishBoardUpdateTimings(timings);

  function updateDraftIntelligence() {
    var intelligenceStart = performance.now();
    var sharedLiveState = null;

    if (draftComplete) {
      timedUpdate('recommendation', updateRecommendedPick);
      timings.intelligence = Number((performance.now() - intelligenceStart).toFixed(1));
      timings.total = Number((performance.now() - totalStart).toFixed(1));
      publishBoardUpdateTimings(timings);
      document.body.classList.remove('draft-intelligence-updating');
      var completedRecommendationBox = document.getElementById('recommended-pick-box');
      if (completedRecommendationBox) completedRecommendationBox.removeAttribute('aria-busy');
      return;
    }

    timedUpdate('liveDraftState', function() {
      sharedLiveState = buildLiveDraftDebugState();
    });

    timedUpdate('scarcityAlerts', function() {
      updateScarcityAlerts(sharedLiveState);
    });
    timedUpdate('recommendation', function() {
      updateRecommendedPick(sharedLiveState);
    });

    timings.intelligence = Number((performance.now() - intelligenceStart).toFixed(1));
    timings.total = Number((performance.now() - totalStart).toFixed(1));
    publishBoardUpdateTimings(timings);
    document.body.classList.remove('draft-intelligence-updating');
    var recommendationBox = document.getElementById('recommended-pick-box');
    if (recommendationBox) recommendationBox.removeAttribute('aria-busy');
  }

  if (!options.deferIntelligence) {
    if (_draftIntelligenceTimer) {
      clearTimeout(_draftIntelligenceTimer);
      _draftIntelligenceTimer = null;
    }
    updateDraftIntelligence();
    return;
  }

  if (_draftIntelligenceTimer) clearTimeout(_draftIntelligenceTimer);
  document.body.classList.add('draft-intelligence-updating');
  var recommendationBox = document.getElementById('recommended-pick-box');
  if (recommendationBox) recommendationBox.setAttribute('aria-busy', 'true');

  /* Let the row state paint immediately and coalesce rapid Taken/Mine clicks. */
  _draftIntelligenceTimer = setTimeout(function() {
    _draftIntelligenceTimer = null;
    updateDraftIntelligence();
  }, 120);
}

/* =========================================================
   ESPN COMPANION SYNC CONTRACT — VERSION 1

   The browser extension posts validated draft snapshots into
   this page. ESPN remains the draft-history authority while
   FantasyPros remains the ranking/value authority.
   ========================================================= */

var ESPN_SYNC_CHANNEL = 'the-war-room:espn-sync:v1';
var ESPN_COMPANION_MIN_VERSION = '0.9.3';
var espnSyncLastSignature = null;
var latestEspnSyncResult = null;
var espnSettingsEditedAt = 0;
var latestEspnSyncMeta = {draftComplete: false, expectedCompleted: 0, numberedPicks: 0, marketAdpCount: 0, marketRankCount: 0, marketUpdatedAt: null};
window.latestEspnSyncMeta = latestEspnSyncMeta;

function normalizeEspnSyncPosition(position) {
  var value = String(position || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (value === 'DEF' || value === 'D' || value === 'DST') return 'DST';
  return ['QB', 'RB', 'WR', 'TE', 'K'].indexOf(value) >= 0 ? value : '';
}

function normalizeEspnSyncName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bd\s*\/\s*st\b|\bdst\b|\bdefense\b|\bdef\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveEspnDraftRow(playerName, position) {
  var direct = findDraftRowByExpertName(playerName);
  if (direct) return direct;

  var normalizedName = normalizeEspnSyncName(playerName);
  var normalizedPosition = normalizeEspnSyncPosition(position);
  if (!normalizedName) return null;

  var candidates = Array.prototype.slice.call(
    document.querySelectorAll('tr.draftrow')
  ).filter(function(row) {
    return !normalizedPosition || row.getAttribute('data-pos') === normalizedPosition;
  });

  var exact = candidates.find(function(row) {
    return normalizeEspnSyncName(row.getAttribute('data-name')) === normalizedName;
  });
  if (exact) return exact;

  if (normalizedPosition !== 'DST') return null;

  var inputTokens = normalizedName.split(' ').filter(function(token) {
    return token.length >= 4;
  });
  var dstMatches = candidates.filter(function(row) {
    var rowTokens = normalizeEspnSyncName(row.getAttribute('data-name')).split(' ');
    return inputTokens.some(function(token) { return rowTokens.indexOf(token) >= 0; });
  });

  return dstMatches.length === 1 ? dstMatches[0] : null;
}

function sanitizeEspnDraftPick(rawPick, totalPicks) {
  rawPick = rawPick || {};
  var overallPick = Number(rawPick.overallPick || rawPick.pick);
  var playerName = String(rawPick.playerName || rawPick.name || '').trim();
  var teamSlot = Number(rawPick.teamSlot);

  if (!Number.isInteger(overallPick) || overallPick < 1 || overallPick > totalPicks) return null;
  if (!playerName || playerName.length > 100) return null;

  return {
    overallPick: overallPick,
    playerName: playerName,
    position: normalizeEspnSyncPosition(rawPick.position),
    teamSlot: Number.isInteger(teamSlot) && teamSlot > 0 ? teamSlot : null,
    teamId: rawPick.teamId == null ? null : String(rawPick.teamId).slice(0, 40),
    isMine: typeof rawPick.isMine === 'boolean' ? rawPick.isMine : null,
    method: String(rawPick.method || 'dom').slice(0, 12),
    espnPlayerId: rawPick.espnPlayerId == null
      ? null
      : String(rawPick.espnPlayerId).slice(0, 40)
  };
}

function updateEspnSyncStatus(status, detail) {
  var badge = document.getElementById('espn-sync-status');
  if (!badge) return;

  badge.hidden = false;
  badge.className = 'espn-sync-status';
  if (status === 'syncing') badge.classList.add('espn-sync-status-syncing');
  if (status === 'error') badge.classList.add('espn-sync-status-error');
  badge.textContent = detail || 'ESPN companion connected';
}

function getEspnSyncSettings() {
  var state = getDraftAssistantState();
  return {
    teams: state.teams,
    rounds: state.rounds,
    draftSlot: state.draftSlot,
    totalPicks: state.totalPicks
  };
}

function publishEspnSyncSettingsUpdate() {
  var targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  espnSettingsEditedAt = Date.now();
  window.postMessage({
    channel: ESPN_SYNC_CHANNEL,
    type: 'SETTINGS_UPDATE',
    settings: getEspnSyncSettings(),
    requiredExtensionVersion: ESPN_COMPANION_MIN_VERSION
  }, targetOrigin);
}

var autoDraftTeamSlots = [];

function sanitizeAutoDraftTeamSlots(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(Number).filter(function(slot) {
    return Number.isInteger(slot) && slot >= 1 && slot <= LEAGUE_SIZE && slot !== MY_DRAFT_SLOT;
  }))).sort(function(a, b) { return a - b; });
}

function renderAutoDraftTeamToggles() {
  var target = document.getElementById('auto-draft-team-toggles');
  if (!target) return;
  autoDraftTeamSlots = sanitizeAutoDraftTeamSlots(autoDraftTeamSlots);
  var markup = [];
  for (var slot = 1; slot <= LEAGUE_SIZE; slot++) {
    if (slot === MY_DRAFT_SLOT) continue;
    var active = autoDraftTeamSlots.indexOf(slot) >= 0;
    markup.push('<button type="button" class="auto-draft-team-toggle" data-team-slot="' + slot +
      '" aria-pressed="' + active + '" onclick="toggleAutoDraftTeam(' + slot + ')">Team ' + slot + (active ? ' · Auto' : '') + '</button>');
  }
  target.innerHTML = markup.join('');
}

function toggleAutoDraftTeam(slot) {
  slot = Number(slot);
  var index = autoDraftTeamSlots.indexOf(slot);
  if (index >= 0) autoDraftTeamSlots.splice(index, 1);
  else autoDraftTeamSlots.push(slot);
  autoDraftTeamSlots = sanitizeAutoDraftTeamSlots(autoDraftTeamSlots);
  renderAutoDraftTeamToggles();
  triggerAllBoardUpdates({deferIntelligence: true});
  scheduleSave();
}

window.toggleAutoDraftTeam = toggleAutoDraftTeam;

function applyEspnSyncSettings(config) {
  config = config || {};
  // A snapshot already in flight can arrive just after the user edits the page.
  // Hold the local values briefly while the companion persists and rebroadcasts them.
  if (espnSettingsEditedAt && Date.now() - espnSettingsEditedAt < 1500) {
    return getEspnSyncSettings();
  }
  var teams = Math.max(2, Math.min(20, Number(config.teams) || LEAGUE_SIZE));
  var rounds = Math.max(1, Math.min(30, Number(config.rounds) || TOTAL_ROUNDS));
  var draftSlot = Math.max(1, Math.min(teams, Number(config.draftSlot) || MY_DRAFT_SLOT));
  var pcTeams = document.getElementById('pcTeams');
  var pcSlot = document.getElementById('pcSlot');
  var pcRounds = document.getElementById('pcRounds');
  var changed = Number(pcTeams && pcTeams.value) !== teams ||
    Number(pcSlot && pcSlot.value) !== draftSlot ||
    Number(pcRounds && pcRounds.value) !== rounds;

  if (pcTeams) pcTeams.value = String(teams);
  if (pcSlot) {
    pcSlot.max = String(teams);
    pcSlot.value = String(draftSlot);
  }
  if (pcRounds) pcRounds.value = String(rounds);

  LEAGUE_SIZE = teams;
  MY_DRAFT_SLOT = draftSlot;
  TOTAL_ROUNDS = rounds;

  if (changed) {
    triggerAllBoardUpdates({deferIntelligence: true});
    scheduleSave();
  }

  return getEspnSyncSettings();
}

function publishEspnSyncAck(result) {
  var targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  window.postMessage({
    channel: ESPN_SYNC_CHANNEL,
    type: 'SYNC_ACK',
    result: result || latestEspnSyncResult,
    settings: getEspnSyncSettings(),
    requiredExtensionVersion: ESPN_COMPANION_MIN_VERSION
  }, targetOrigin);
}

function applyEspnDraftSnapshot(snapshot) {
  snapshot = snapshot || {};
  if (snapshot.draftKey) selectEspnDraftSession(snapshot.draftKey);
  if (snapshot.config) applyEspnSyncSettings(snapshot.config);
  var settings = getEspnSyncSettings();
  var incoming = Array.isArray(snapshot.picks) ? snapshot.picks : [];
  var incomingUnavailable = Array.isArray(snapshot.unavailablePlayers)
    ? snapshot.unavailablePlayers
    : [];
  var incomingMarketAdp = Array.isArray(snapshot.marketAdp) ? snapshot.marketAdp : [];
  incomingMarketAdp.forEach(function(player) {
    var row = findDraftRowByExpertName(player && player.playerName);
    var espnAdp = Number(player && player.adp);
    var espnRank = Number(player && player.rank);
    if (!row) return;
    if (Number.isFinite(espnAdp) && espnAdp > 0) row.setAttribute('data-espn-adp', String(espnAdp));
    if (Number.isFinite(espnRank) && espnRank > 0) row.setAttribute('data-espn-rank', String(espnRank));
    updateDraftRowMarketCell(row);
    updateDraftRowNoteCell(row);
    updateDraftRowValueCell(row);
  });
  var picksByNumber = new Map();

  incoming.forEach(function(rawPick) {
    var pick = sanitizeEspnDraftPick(rawPick, settings.totalPicks);
    if (pick && !picksByNumber.has(pick.overallPick)) {
      picksByNumber.set(pick.overallPick, pick);
    }
  });

  var picks = Array.from(picksByNumber.values()).sort(function(a, b) {
    return a.overallPick - b.overallPick;
  });
  latestEspnSyncMeta = {
    draftComplete: Boolean(snapshot.draftComplete),
    expectedCompleted: Number(snapshot.expectedCompleted) || 0,
    numberedPicks: picks.length,
    marketAdpCount: incomingMarketAdp.filter(function(player) {
      return Boolean(findDraftRowByExpertName(player && player.playerName)) && Number(player && player.adp) > 0;
    }).length,
    marketRankCount: incomingMarketAdp.filter(function(player) {
      return Boolean(findDraftRowByExpertName(player && player.playerName)) && Number(player && player.rank) > 0;
    }).length,
    marketUpdatedAt: snapshot.marketUpdatedAt || null
  };
  window.latestEspnSyncMeta = latestEspnSyncMeta;
  var signature = JSON.stringify({
    draftSlot: settings.draftSlot,
    teams: settings.teams,
    draftComplete: latestEspnSyncMeta.draftComplete,
    expectedCompleted: latestEspnSyncMeta.expectedCompleted,
    picks: picks.map(function(pick) {
      return [pick.overallPick, pick.espnPlayerId, pick.playerName, pick.position, pick.teamSlot, pick.teamId, pick.isMine];
    }),
    unavailablePlayers: incomingUnavailable.map(function(player) {
      return [String(player.playerName || ''), normalizeEspnSyncPosition(player.position)];
    }),
    marketAdp: incomingMarketAdp.map(function(player) {
      return [String(player.playerName || ''), Number(player.rank) || null, Number(player.adp) || null];
    })
  });

  if (signature === espnSyncLastSignature && !snapshot.force) {
    publishEspnSyncAck(latestEspnSyncResult);
    return latestEspnSyncResult;
  }

  document.querySelectorAll('tr.draftrow[data-sync-source="espn"]').forEach(function(row) {
    row.classList.remove('drafted-mine', 'drafted-other');
    row.removeAttribute('data-pick');
    row.removeAttribute('data-team-slot');
    row.removeAttribute('data-team-id');
    row.removeAttribute('data-sync-method');
    row.removeAttribute('data-sync-source');
    row.removeAttribute('data-espn-player-id');
    row.removeAttribute('data-team-id');
    row.removeAttribute('data-sync-method');
  });

  var applied = 0;
  var mine = 0;
  var unmatched = [];
  var usedRows = new Set();

  function resolveSnapshotRow(pick) {
    if (pick && pick.espnPlayerId) {
      var escapedId = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(String(pick.espnPlayerId))
        : String(pick.espnPlayerId).replace(/["\\]/g, '\\$&');
      var idRow = document.querySelector('tr.draftrow[data-espn-player-id="' + escapedId + '"]');
      if (idRow) return idRow;
    }
    return resolveEspnDraftRow(pick && pick.playerName, pick && pick.position);
  }

  picks.forEach(function(pick) {
    var row = resolveSnapshotRow(pick);
    if (!row || usedRows.has(row)) {
      unmatched.push({
        overallPick: pick.overallPick,
        playerName: pick.playerName,
        position: pick.position
      });
      return;
    }

    usedRows.add(row);
    row.classList.remove('drafted-mine', 'drafted-other');
    var isMine = typeof pick.isMine === 'boolean'
      ? pick.isMine
      : Number(pick.teamSlot) === Number(settings.draftSlot);
    row.classList.add(isMine ? 'drafted-mine' : 'drafted-other');
    row.setAttribute('data-pick', String(pick.overallPick));
    if (pick.teamSlot) row.setAttribute('data-team-slot', String(pick.teamSlot));
    if (pick.teamId) row.setAttribute('data-team-id', pick.teamId);
    row.setAttribute('data-sync-method', pick.method);
    row.setAttribute('data-sync-source', 'espn');
    if (pick.espnPlayerId) row.setAttribute('data-espn-player-id', pick.espnPlayerId);
    applied++;
    if (isMine) mine++;
  });

  var unavailableApplied = 0;
  incomingUnavailable.forEach(function(player) {
    var playerName = String(player && player.playerName || '').trim();
    var position = normalizeEspnSyncPosition(player && player.position);
    if (!playerName || !position) return;
    var row = resolveEspnDraftRow(playerName, position);
    if (!row || usedRows.has(row) || row.classList.contains('drafted-mine')) return;
    usedRows.add(row);
    row.classList.remove('drafted-mine');
    row.classList.add('drafted-other');
    row.setAttribute('data-sync-source', 'espn');
    row.setAttribute('data-sync-method', 'drafted-label');
    if (player.espnPlayerId) {
      row.setAttribute('data-espn-player-id', String(player.espnPlayerId).slice(0, 40));
    }
    unavailableApplied++;
  });

  espnSyncLastSignature = signature;
  latestEspnSyncResult = {
    captured: picks.length,
    applied: applied,
    mine: mine,
    unmatched: unmatched,
    unavailableApplied: unavailableApplied,
    latestPick: picks.length ? picks[picks.length - 1].overallPick : 0,
    syncedAt: new Date().toISOString()
  };
  window.latestEspnSyncResult = latestEspnSyncResult;

  if (unmatched.length) {
    updateEspnSyncStatus(
      'error',
      'ESPN Sync · ' + applied + ' applied · ' + unmatched.length + ' unmatched'
    );
  } else {
    updateEspnSyncStatus(
      'connected',
      'ESPN Sync · ' + applied + ' picks' +
        (unavailableApplied ? ' · ' + unavailableApplied + ' drafted labels' : '') +
        ' · Market 300/' + latestEspnSyncMeta.marketAdpCount
    );
  }

  triggerAllBoardUpdates({deferIntelligence: true});
  scheduleSave();
  renderRankingsRefreshStatus();
  publishEspnSyncAck(latestEspnSyncResult);
  return latestEspnSyncResult;
}

window.addEventListener('message', function(event) {
  if (event.source !== window || !event.data || event.data.channel !== ESPN_SYNC_CHANNEL) return;

  if (event.data.type === 'EXTENSION_STATUS') {
    var installedVersion = String(event.data.extensionVersion || '').trim();
    var versionParts = function(value) {
      return String(value || '').split('.').map(function(part) { return parseInt(part, 10) || 0; });
    };
    var installedParts = versionParts(installedVersion);
    var requiredParts = versionParts(ESPN_COMPANION_MIN_VERSION);
    var outdated = false;
    for (var versionIndex = 0; versionIndex < Math.max(installedParts.length, requiredParts.length); versionIndex++) {
      if ((installedParts[versionIndex] || 0) === (requiredParts[versionIndex] || 0)) continue;
      outdated = (installedParts[versionIndex] || 0) < (requiredParts[versionIndex] || 0);
      break;
    }
    updateEspnSyncStatus(
      outdated ? 'error' : event.data.status === 'scanning' ? 'syncing' : 'connected',
      outdated
        ? 'ESPN Companion ' + (installedVersion || 'unknown') + ' is outdated · reload version ' + ESPN_COMPANION_MIN_VERSION
        : (event.data.detail || 'ESPN companion connected') + (installedVersion ? ' · v' + installedVersion : '')
    );
    publishEspnSyncAck(latestEspnSyncResult);
  }

  if (event.data.type === 'PICKS_SNAPSHOT') {
    applyEspnDraftSnapshot(event.data.snapshot);
  }
  if (event.data.type === 'FANTASYPROS_RANKINGS_UPDATE') {
    applyFantasyProsApiUpdate(event.data.update);
  }
  if (event.data.type === 'FANTASYPROS_REFRESH_RESULT') {
    var refreshResult = event.data.result || {};
    if (refreshResult.error) setRankingsRefreshMessage(refreshResult.error, 'error');
    else if (refreshResult.updated) {
      setRankingsRefreshMessage('Validated ' + refreshResult.players + ' players from ' + refreshResult.experts + ' experts. Applying update…', 'success');
    } else setRankingsRefreshMessage('The companion returned no ranking update.', 'error');
  }
});

window.WarRoomEspnSync = {
  version: 1,
  applySnapshot: applyEspnDraftSnapshot,
  applySettings: applyEspnSyncSettings,
  resolvePlayer: resolveEspnDraftRow,
  settings: getEspnSyncSettings
};

function setDraftMarkMode(mode) {
  draftMarkMode = mode === 'mine' ? 'mine' : 'taken';
  document.querySelectorAll('.mark-mode-btn').forEach(function(button) {
    var active = button.getAttribute('data-mark-mode') === draftMarkMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  refreshDraftRowAccessibility();
}

function shouldIgnoreDraftMarkShortcut(event) {
  var target = event && event.target;
  if (!target) return false;
  return Boolean(
    event.ctrlKey || event.metaKey || event.altKey ||
    target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') ||
    document.body.classList.contains('edit-mode')
  );
}

function setupDraftMarkModeShortcut() {
  if (document.body.getAttribute('data-mark-shortcut-ready') === 'true') return;
  document.body.setAttribute('data-mark-shortcut-ready', 'true');
  document.addEventListener('keydown', function(event) {
    if (String(event.key || '').toLowerCase() !== 'm' || event.repeat || shouldIgnoreDraftMarkShortcut(event)) return;
    event.preventDefault();
    setDraftMarkMode(draftMarkMode === 'mine' ? 'taken' : 'mine');
    var announcer = document.getElementById('draft-action-announcer');
    if (announcer) announcer.textContent = 'Player marking mode changed to ' + draftMarkMode + '.';
  });
}

function clearDraftRowMetadata(row) {
  ['data-pick', 'data-team-slot', 'data-sync-source', 'data-espn-player-id',
    'data-team-id', 'data-sync-method'].forEach(function(attribute) {
    row.removeAttribute(attribute);
  });
}

function assignManualDraftMetadata(row, isMine) {
  var draftState = getDraftAssistantState();
  var currentPick = Number(row.getAttribute('data-pick')) || Number(draftState.currentPick) || 0;
  var teams = Number(draftState.teams) || LEAGUE_SIZE || 10;
  var mapping = getSnakeDraftTeamForPick(currentPick, teams);

  row.removeAttribute('data-sync-source');
  row.removeAttribute('data-espn-player-id');
  row.removeAttribute('data-team-id');
  row.removeAttribute('data-sync-method');

  if (currentPick > 0) row.setAttribute('data-pick', String(currentPick));
  if (isMine) {
    row.setAttribute('data-team-slot', String(Number(draftState.draftSlot) || MY_DRAFT_SLOT || 1));
  } else if (mapping && mapping.teamSlot) {
    row.setAttribute('data-team-slot', String(mapping.teamSlot));
  }
}

function getDraftRowStatus(row) {
  if (row.classList.contains('drafted-mine')) return 'mine';
  if (row.classList.contains('drafted-other')) return 'taken';
  return 'available';
}

function updateDraftRowAccessibility(row) {
  if (!row) return;
  var name = getDraftRowDisplayName(row);
  var position = row.getAttribute('data-pos') || '';
  var status = getDraftRowStatus(row);
  var action = status === draftMarkMode
    ? 'clear this status'
    : 'mark as ' + (draftMarkMode === 'mine' ? 'Mine' : 'Taken');
  row.setAttribute('aria-label', [name, position, status, 'Press Enter to ' + action].filter(Boolean).join('. '));
}

function isDraftRowKeyboardVisible(row) {
  if (!row || row.classList.contains('hidden-row')) return false;
  var tier = row.closest('tbody.tier-group');
  return !tier || !tier.classList.contains('is-collapsed') || tier.classList.contains('is-temporarily-expanded');
}

function refreshDraftRowAccessibility(preferredRow) {
  var rows = getCachedDraftRows();
  var visibleRows = rows.filter(isDraftRowKeyboardVisible);
  var focusRow = preferredRow && visibleRows.indexOf(preferredRow) >= 0
    ? preferredRow
    : visibleRows[0] || null;

  rows.forEach(function(row) {
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', row === focusRow ? '0' : '-1');
    updateDraftRowAccessibility(row);
  });
}

function announceDraftAction(row) {
  var announcer = document.getElementById('draft-action-announcer');
  if (!announcer || !row) return;
  var status = getDraftRowStatus(row);
  announcer.textContent = getDraftRowDisplayName(row) + ' marked ' + status + '.';
}

function setupDraftBoardInteractions() {
  var table = document.getElementById('big-table');
  if (!table || table.getAttribute('data-interactions-ready') === 'true') return;
  table.setAttribute('data-interactions-ready', 'true');

  table.addEventListener('click', function(event) {
    if (event.target.closest('button, select, input, a')) return;
    var row = event.target.closest('tr.draftrow');
    if (row) toggleDraft(row);
  });

  table.addEventListener('keydown', function(event) {
    var row = event.target.closest('tr.draftrow');
    if (!row) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleDraft(row);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    var visibleRows = getCachedDraftRows().filter(isDraftRowKeyboardVisible);
    var index = visibleRows.indexOf(row);
    var direction = event.key === 'ArrowDown' ? 1 : -1;
    var next = visibleRows[Math.max(0, Math.min(visibleRows.length - 1, index + direction))];
    if (next) {
      refreshDraftRowAccessibility(next);
      next.focus();
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      var auditModal = document.getElementById('mock-audit-modal');
      if (auditModal && auditModal.classList.contains('open')) {
        event.preventDefault();
        closeMockAudit();
        return;
      }
      var modal = document.getElementById('final-summary-modal');
      if (modal && modal.classList.contains('open')) {
        event.preventDefault();
        closeFinalDraftSummary();
      }
    }
  });
}

function toggleDraft(row) {
  if (!row || document.body.classList.contains('edit-mode')) return;

  var currentStatus = getDraftRowStatus(row);
  var desiredStatus = draftMarkMode;

  row.classList.remove('drafted-mine', 'drafted-other');
  if (currentStatus === desiredStatus) {
    clearDraftRowMetadata(row);
  } else {
    row.classList.add(desiredStatus === 'mine' ? 'drafted-mine' : 'drafted-other');
    assignManualDraftMetadata(row, desiredStatus === 'mine');
  }

  updateDraftRowAccessibility(row);
  announceDraftAction(row);
  if (desiredStatus === 'mine') setDraftMarkMode('taken');
  triggerAllBoardUpdates({deferIntelligence: true});
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
    row.removeAttribute('data-pick');
    row.removeAttribute('data-team-slot');
    row.removeAttribute('data-sync-source');
    row.removeAttribute('data-espn-player-id');
    row.removeAttribute('data-team-id');
    row.removeAttribute('data-sync-method');
  });
  try { localStorage.removeItem(getDraftSessionFinalKey()); } catch(e) {}
  closeFinalDraftSummary();
  triggerAllBoardUpdates();
  if(btn) {
    btn.innerText = 'Reset all';
    btn.classList.remove('armed');
  }
  scheduleSave();
}

function getDraftSessionStateKey(id) { return AUTOSAVE_KEY + ':' + String(id || activeDraftSessionId); }
function getDraftSessionFinalKey(id) { return FINAL_SUMMARY_SHOWN_KEY + ':' + String(id || activeDraftSessionId); }

function readDraftSessionRegistry() {
  try {
    var parsed = JSON.parse(localStorage.getItem(DRAFT_SESSION_REGISTRY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) { return []; }
}

function writeDraftSessionRegistry(sessions) {
  localStorage.setItem(DRAFT_SESSION_REGISTRY_KEY, JSON.stringify(sessions));
}

function initializeDraftSessions() {
  var sessions = readDraftSessionRegistry();
  if (!sessions.length) {
    var legacyState = localStorage.getItem(AUTOSAVE_KEY);
    activeDraftSessionId = 'legacy';
    sessions = [{id:'legacy', name:legacyState ? 'Imported Draft' : 'Draft 1', createdAt:new Date().toISOString()}];
    if (legacyState) localStorage.setItem(getDraftSessionStateKey('legacy'), legacyState);
    if (localStorage.getItem(FINAL_SUMMARY_SHOWN_KEY) === '1') localStorage.setItem(getDraftSessionFinalKey('legacy'), '1');
    writeDraftSessionRegistry(sessions);
  } else {
    activeDraftSessionId = localStorage.getItem(ACTIVE_DRAFT_SESSION_KEY) || sessions[0].id;
    if (!sessions.some(function(session) { return session.id === activeDraftSessionId; })) activeDraftSessionId = sessions[0].id;
  }
  localStorage.setItem(ACTIVE_DRAFT_SESSION_KEY, activeDraftSessionId);
  renderDraftSessionSelector();
}

function renderDraftSessionSelector() {
  var select = document.getElementById('draftSessionSelect');
  if (!select) return;
  select.innerHTML = '';
  readDraftSessionRegistry().forEach(function(session) {
    var option = document.createElement('option');
    option.value = session.id;
    option.textContent = session.name;
    option.selected = session.id === activeDraftSessionId;
    select.appendChild(option);
  });
}

function clearDraftStateFromBoard() {
  getCachedDraftRows().forEach(function(row) {
    row.classList.remove('drafted-mine', 'drafted-other');
    clearDraftRowMetadata(row);
  });
  customBoardEnabled = false;
  recommendationAudit = [];
}

function switchDraftSession(id) {
  if (!id || id === activeDraftSessionId) return;
  resetDeleteDraftButton();
  saveState();
  activeDraftSessionId = id;
  localStorage.setItem(ACTIVE_DRAFT_SESSION_KEY, id);
  clearDraftStateFromBoard();
  loadState();
  renderDraftSessionSelector();
}

function createNewDraftSession(options) {
  options = options || {};
  resetDeleteDraftButton();
  saveState();
  var id = options.id || ('draft-' + Date.now().toString(36));
  var sessions = readDraftSessionRegistry();
  var existing = sessions.find(function(session) { return session.id === id; });
  if (!existing) {
    sessions.push({id:id, name:options.name || ('Draft ' + (sessions.length + 1)), createdAt:new Date().toISOString(), draftKey:options.draftKey || null});
    writeDraftSessionRegistry(sessions);
  }
  activeDraftSessionId = id;
  localStorage.setItem(ACTIVE_DRAFT_SESSION_KEY, id);
  clearDraftStateFromBoard();
  renderDraftSessionSelector();
  triggerAllBoardUpdates();
  saveState();
  return id;
}

function resetDeleteDraftButton() {
  deleteDraftArmed = false;
  if (deleteDraftArmTimer) clearTimeout(deleteDraftArmTimer);
  deleteDraftArmTimer = null;
  var button = document.getElementById('deleteDraftBtn');
  if (button) {
    button.textContent = 'Delete Draft';
    button.classList.remove('armed');
    button.setAttribute('aria-label', 'Delete selected draft');
  }
}

function deleteActiveDraftSession() {
  var sessions = readDraftSessionRegistry();
  var activeSession = sessions.find(function(session) { return session.id === activeDraftSessionId; });
  if (!activeSession) return;

  var button = document.getElementById('deleteDraftBtn');
  if (!deleteDraftArmed) {
    deleteDraftArmed = true;
    if (button) {
      button.textContent = 'Confirm Delete';
      button.classList.add('armed');
      button.setAttribute('aria-label', 'Confirm deletion of ' + activeSession.name);
    }
    deleteDraftArmTimer = setTimeout(resetDeleteDraftButton, 3000);
    return;
  }

  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  var deletedId = activeSession.id;
  var remainingSessions = sessions.filter(function(session) { return session.id !== deletedId; });
  localStorage.removeItem(getDraftSessionStateKey(deletedId));
  localStorage.removeItem(getDraftSessionFinalKey(deletedId));

  if (!remainingSessions.length) {
    var replacementId = 'draft-' + Date.now().toString(36);
    remainingSessions.push({id:replacementId, name:'Draft 1', createdAt:new Date().toISOString()});
  }
  writeDraftSessionRegistry(remainingSessions);
  activeDraftSessionId = remainingSessions[0].id;
  localStorage.setItem(ACTIVE_DRAFT_SESSION_KEY, activeDraftSessionId);

  var replacementState = localStorage.getItem(getDraftSessionStateKey(activeDraftSessionId));
  if (replacementState) localStorage.setItem(AUTOSAVE_KEY, replacementState);
  else localStorage.removeItem(AUTOSAVE_KEY);

  resetDeleteDraftButton();
  closeFinalDraftSummary();
  clearDraftStateFromBoard();
  loadState();
  renderDraftSessionSelector();
  var announcer = document.getElementById('draft-action-announcer');
  if (announcer) announcer.textContent = activeSession.name + ' deleted. ' + remainingSessions[0].name + ' is now active.';
}

function selectEspnDraftSession(draftKey) {
  var safeKey = String(draftKey || '').trim().slice(0, 120);
  if (!safeKey) return;
  var sessions = readDraftSessionRegistry();
  var match = sessions.find(function(session) { return session.draftKey === safeKey; });
  var id = match ? match.id : createNewDraftSession({id:'espn-' + canonicalExpertPlayerName(safeKey), name:'ESPN Draft', draftKey:safeKey});
  if (id !== activeDraftSessionId) switchDraftSession(id);
}

function saveState(){
  try{
    var state = {};
    var draftMeta = {};
    getCachedDraftRows().forEach(function(row){
      var name = row.getAttribute('data-name');
      if(name) {
        if(row.classList.contains('drafted-mine')) state[name] = 'mine';
        else if(row.classList.contains('drafted-other')) state[name] = 'taken';

        if(state[name]) {
          var pick = Number(row.getAttribute('data-pick')) || null;
          var teamSlot = Number(row.getAttribute('data-team-slot')) || null;
          var source = row.getAttribute('data-sync-source') || null;
          var espnPlayerId = row.getAttribute('data-espn-player-id') || null;
          if(pick || teamSlot || source || espnPlayerId) {
            draftMeta[name] = {
              pick: pick,
              teamSlot: teamSlot,
              source: source,
              espnPlayerId: espnPlayerId
            };
          }
        }
      }
    });
    var hasAuthoritativeBoard =
      typeof EXPERT_RANKINGS_2026 !== 'undefined' &&
      Array.isArray(EXPERT_RANKINGS_2026) &&
      EXPERT_RANKINGS_2026.length > 0;
    var order = [];

    /* Persist authoritative-board ordering only when the user explicitly
     * enables Custom Board mode. The snapshot date prevents stale overrides
     * from silently replacing a future FantasyPros refresh. */
    if (customBoardEnabled || !hasAuthoritativeBoard) {
      document.querySelectorAll('tbody.tier-group').forEach(function(tbody){
        var tid = tbody.id.replace('tbody-','');
        tbody.querySelectorAll('tr.draftrow').forEach(function(row){
          var name = row.getAttribute('data-name');
          if(name) order.push({n: name, t: tid});
        });
      });
    }
    var payload = {
      version: 2,
      savedAt: new Date().toISOString(),
      datasetSnapshotDate: typeof FANTASYPROS_2026_DATASET_META !== 'undefined'
        ? FANTASYPROS_2026_DATASET_META.sourceSnapshotDate || null
        : null,
      customBoard: customBoardEnabled,
      teams: LEAGUE_SIZE,
      slot: MY_DRAFT_SLOT,
      rounds: TOTAL_ROUNDS,
      recommendationAudit: recommendationAudit,
      autoDraftTeamSlots: autoDraftTeamSlots.slice(),
      state: state,
      draftMeta: draftMeta,
      order: order
    };
    var serializedPayload = JSON.stringify(payload);
    localStorage.setItem(getDraftSessionStateKey(), serializedPayload);
    /* Compatibility mirror for older companion/tests. Session loading never
     * reads this key after migration, so drafts remain isolated. */
    localStorage.setItem(AUTOSAVE_KEY, serializedPayload);
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
      var raw = localStorage.getItem(getDraftSessionStateKey());
      if(raw){
        var payload = JSON.parse(raw);
        var pcTeams = document.getElementById('pcTeams'); if(payload.teams && pcTeams) pcTeams.value = payload.teams;
        var pcSlot = document.getElementById('pcSlot'); if(payload.slot && pcSlot) pcSlot.value = payload.slot;
        var pcRounds = document.getElementById('pcRounds'); if(payload.rounds && pcRounds) pcRounds.value = payload.rounds;
        
        if (pcTeams && pcTeams.value) LEAGUE_SIZE = parseInt(pcTeams.value, 10) || 10;
        if (pcSlot && pcSlot.value) MY_DRAFT_SLOT = parseInt(pcSlot.value, 10) || 10;
        if (pcRounds && pcRounds.value) TOTAL_ROUNDS = parseInt(pcRounds.value, 10) || 16;
        recommendationAudit = Array.isArray(payload.recommendationAudit)
          ? payload.recommendationAudit.slice(-200)
          : [];
        autoDraftTeamSlots = sanitizeAutoDraftTeamSlots(payload.autoDraftTeamSlots);

        var datasetSnapshotDate = typeof FANTASYPROS_2026_DATASET_META !== 'undefined'
          ? FANTASYPROS_2026_DATASET_META.sourceSnapshotDate || null
          : null;
        var hasExpertBoard = typeof EXPERT_RANKINGS_2026 !== 'undefined' &&
          Array.isArray(EXPERT_RANKINGS_2026) && EXPERT_RANKINGS_2026.length > 0;
        var customSnapshotMatches = Boolean(
          payload.customBoard &&
          payload.datasetSnapshotDate &&
          payload.datasetSnapshotDate === datasetSnapshotDate
        );

        customBoardEnabled = customSnapshotMatches;
        if (payload.order && payload.order.length && (customSnapshotMatches || !hasExpertBoard)) {
          applyCustomOrder(payload.order, true);
        }
        
        if(payload.state) {
          document.querySelectorAll('tr.draftrow').forEach(function(row){
            var name = row.getAttribute('data-name');
            row.classList.remove('drafted-mine','drafted-other');
            row.removeAttribute('data-pick');
            row.removeAttribute('data-team-slot');
            row.removeAttribute('data-sync-source');
            row.removeAttribute('data-espn-player-id');
            if(name && payload.state[name] === 'mine') row.classList.add('drafted-mine');
            else if(name && payload.state[name] === 'taken') row.classList.add('drafted-other');

            var metadata = name && payload.draftMeta ? payload.draftMeta[name] : null;
            if(metadata && Number(metadata.pick) > 0) row.setAttribute('data-pick', String(metadata.pick));
            if(metadata && Number(metadata.teamSlot) > 0) row.setAttribute('data-team-slot', String(metadata.teamSlot));
            if(metadata && metadata.source === 'espn') row.setAttribute('data-sync-source', 'espn');
            if(metadata && metadata.espnPlayerId) row.setAttribute('data-espn-player-id', String(metadata.espnPlayerId));
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
  
  updateCustomBoardUi();
  refreshDraftRowAccessibility();
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

/* =========================================================
   FANTASYPROS 2026 AUTHORITATIVE BOARD

   PPR ECR supplies rank/value/tier inputs.
   ESPN PPR ADP supplies live market timing when available; FantasyPros PPR
   ADP remains the player-level fallback.
   ========================================================= */

/*
 * =========================================================
 * FANTASYPROS 2026 MASTER DATASET
 * Snapshot: 2026-08-21
 * League target: 10-team Full PPR
 *
 * EXPERT_RANKINGS_2026 remains as an internal compatibility
 * name while the generated FantasyPros dataset is authoritative.
 * =========================================================
 */

var FANTASYPROS_LOCAL_OVERRIDE_KEY = 'warRoomFantasyProsTop20OverrideV1';
var EMBEDDED_FANTASYPROS_2026_DATASET =
  typeof FANTASYPROS_2026_DATASET !== 'undefined' && Array.isArray(FANTASYPROS_2026_DATASET)
    ? FANTASYPROS_2026_DATASET.slice()
    : [];

function loadFantasyProsLocalOverride() {
  try {
    var raw = localStorage.getItem(FANTASYPROS_LOCAL_OVERRIDE_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.players)) return null;
    if (parsed.players.length !== EMBEDDED_FANTASYPROS_2026_DATASET.length) return null;
    var names = new Set(parsed.players.map(function(player) {
      return String(player && player.canonicalName || '').trim();
    }).filter(Boolean));
    if (names.size !== parsed.players.length) return null;
    return parsed;
  } catch (error) {
    console.warn('Stored FantasyPros update could not be loaded:', error);
    return null;
  }
}

var activeFantasyProsLocalOverride = loadFantasyProsLocalOverride();
if (activeFantasyProsLocalOverride && typeof FANTASYPROS_2026_DATASET_META !== 'undefined') {
  FANTASYPROS_2026_DATASET_META = Object.assign({}, FANTASYPROS_2026_DATASET_META, {
    sourceSnapshotDate: activeFantasyProsLocalOverride.sourceSnapshotDate,
    top20EcrPlayers: activeFantasyProsLocalOverride.top20Count,
    localOverride: true,
    localOverrideFile: activeFantasyProsLocalOverride.sourceFile,
    localOverrideImportedAt: activeFantasyProsLocalOverride.importedAt
  });
}

var EXPERT_RANKINGS_2026 = activeFantasyProsLocalOverride
  ? activeFantasyProsLocalOverride.players
  : EMBEDDED_FANTASYPROS_2026_DATASET;

function normalizeExpertPlayerName(name) {

  return String(name || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

}


/*
 * ---------------------------------------------------------
 * EXPERT NAME ALIASES
 * ---------------------------------------------------------
 *
 * These are the same NFL player represented differently
 * between the old board and the professional consensus.
 */
var EXPERT_PLAYER_ALIASES_2026 = {

  "tre' harris": "tre harris",

  "brian robinson":
    "brian robinson jr",

  "chigoziem okonkwo":
    "chig okonkwo",

  "adonai mitchell":
    "ad mitchell",

  "isaac teslaa":
    "isaac tezlaw"

};


function canonicalExpertPlayerName(name) {

  var normalized =
    normalizeExpertPlayerName(name);

  return (
    EXPERT_PLAYER_ALIASES_2026[
      normalized
    ] ||
    normalized
  );

}


function findDraftRowByExpertName(name) {

  var canonical =
    canonicalExpertPlayerName(name);

  if (!_draftRowsByCanonicalNameCache) {
    _draftRowsByCanonicalNameCache = indexDraftRowsByExpertName();
  }

  return _draftRowsByCanonicalNameCache.get(canonical) || null;

}

function indexDraftRowsByExpertName() {
  var rowsByName = new Map();

  document.querySelectorAll('tr.draftrow').forEach(function(row) {
    var canonical = canonicalExpertPlayerName(
      row.getAttribute('data-name')
    );

    if (canonical && !rowsByName.has(canonical)) {
      rowsByName.set(canonical, row);
    }
  });

  return rowsByName;
}


/*
 * =========================================================
 * FANTASYPROS BOARD HELPERS
 * =========================================================
 */

function getFantasyProsValueVsAdp(player) {

  if (
    !player ||
    player.ecr == null ||
    player.adp == null
  ) {
    return null;
  }

  return Number(player.adp) - Number(player.ecr);

}

function updateDraftRowMarketCell(row) {
  if (!row || !row.children[4]) return;
  var cell = row.children[4];
  var espnRank = getDraftRowNumber(row, 'data-espn-rank');
  var espnAdp = getDraftRowNumber(row, 'data-espn-adp');
  var fantasyProsAdp = getDraftRowNumber(row, 'data-adp');

  if (espnRank != null && espnAdp != null) {
    cell.textContent = '#' + espnRank.toFixed(0) + ' / ' + espnAdp.toFixed(1);
    cell.title = 'ESPN default board rank / live ESPN PPR ADP';
  } else if (espnRank != null) {
    cell.textContent = '#' + espnRank.toFixed(0);
    cell.title = 'ESPN default PPR board rank; live ESPN ADP is not available';
  } else if (espnAdp != null) {
    cell.textContent = espnAdp.toFixed(1);
    cell.title = 'Live ESPN PPR ADP';
  } else {
    cell.textContent = fantasyProsAdp != null ? fantasyProsAdp.toFixed(1) : '--';
    cell.title = fantasyProsAdp != null
      ? 'FantasyPros PPR ADP fallback; ESPN market rank is unavailable'
      : 'No market rank available';
  }
}

function updateDraftRowNoteCell(row) {
  if (!row) return;
  var cell = row.querySelector('.notecell');
  if (!cell) return;
  var source = row.getAttribute('data-player-source') || '';
  var ecr = getDraftRowNumber(row, 'data-ecr');
  var espnRank = getDraftRowNumber(row, 'data-espn-rank');
  var espnAdp = getDraftRowNumber(row, 'data-espn-adp');
  var fantasyProsAdp = getDraftRowNumber(row, 'data-adp');
  var parts = [];

  if (ecr != null) parts.push('FantasyPros PPR ECR #' + ecr.toFixed(0));
  else if (source === 'ADP_ONLY') parts.push('FantasyPros ADP depth player; no current ECR');

  if (espnRank != null) parts.push('ESPN board #' + espnRank.toFixed(0));
  if (espnAdp != null) parts.push('live ESPN ADP ' + espnAdp.toFixed(1));
  else if (espnRank != null) parts.push('live ESPN ADP unavailable');
  else if (fantasyProsAdp != null) parts.push('FantasyPros ADP fallback ' + fantasyProsAdp.toFixed(1));

  cell.textContent = parts.length ? parts.join(' · ') : 'No current ranking or market data.';
}

function updateDraftRowValueCell(row) {
  if (!row || !row.children[5]) return;
  var cell = row.children[5];
  var ecr = getDraftRowNumber(row, 'data-ecr');
  var player = {
    espnRank: getDraftRowNumber(row, 'data-espn-rank'),
    espnAdp: getDraftRowNumber(row, 'data-espn-adp'),
    adp: getDraftRowNumber(row, 'data-adp'),
    realTimeAdp: getDraftRowNumber(row, 'data-realtime-adp'),
    adpRank: getDraftRowNumber(row, 'data-adp-rank')
  };
  var state = getDraftAssistantState();
  var market = getMarketTimingDetails(player, {
    currentPick: state.currentPick,
    nextPick: state.myNextPick,
    calculatedNextPick: state.myNextPick,
    teams: state.teams
  });
  var marketRank = Number(market.marketRank);
  var value = ecr != null && Number.isFinite(marketRank) ? marketRank - ecr : null;

  cell.textContent = value == null
    ? '—'
    : (value > 0 ? '+' : '') + value.toFixed(1);
  cell.className = value == null || value === 0
    ? 'valzero'
    : value > 0 ? 'valpos' : 'valneg';
  cell.setAttribute('data-sortval', value == null ? '0' : String(value));
  cell.title = value == null
    ? 'Value unavailable because ECR or market position is missing'
    : market.source + ' ' + marketRank.toFixed(1) + ' minus FantasyPros ECR ' +
      ecr.toFixed(0) + ' = ' + (value > 0 ? '+' : '') + value.toFixed(1);
}

function refreshDynamicMarketValueCells() {
  document.querySelectorAll('tr.draftrow[data-espn-adp]:not([data-espn-adp=""])')
    .forEach(updateDraftRowValueCell);
}


function createExpertPlayerRow(player) {

  var row =
    document.createElement('tr');

  row.className =
    'draftrow';

  row.setAttribute(
    'data-name',
    normalizeExpertPlayerName(
      player.name
    )
  );

  row.setAttribute(
    'data-display-name',
    String(player.name || '').trim()
  );

  updateFantasyProsRowDataAttributes(
    row,
    player
  );

  row.setAttribute('role', 'button');
  row.setAttribute('tabindex', '-1');


  var displayName =
    String(
      player.name || ''
    ).trim();


  var adpText =
    player.adp != null
      ? Number(player.adp).toFixed(1)
      : '--';


  var valueVsAdp =
    getFantasyProsValueVsAdp(player);


  var valueText =
    valueVsAdp == null
      ? '—'
      : (
          valueVsAdp > 0
            ? '+'
            : ''
        ) + valueVsAdp.toFixed(1);


  var valueClass =
    valueVsAdp == null || valueVsAdp === 0
      ? 'valzero'
      : valueVsAdp > 0
        ? 'valpos'
        : 'valneg';


  row.innerHTML =
    '<td>--</td>' +

    '<td class="pname">' +
      displayName +
      ' <span class="posrk">' +
        player.pos +
        (
          player.posRank != null
            ? player.posRank
            : '--'
        ) +
      '</span>' +
    '</td>' +

    '<td>' +
      '<span class="pos-pill pos-' +
        player.pos +
      '">' +
        player.pos +
      '</span>' +
    '</td>' +

    '<td>' +
      (player.team || 'FA') +
      ' <span class="sos sos-neu">-</span>' +
    '</td>' +

    '<td>' +
      adpText +
    '</td>' +

    '<td class="' + valueClass + '" data-sortval="' +
      (valueVsAdp == null ? 0 : valueVsAdp) + '">' +
      valueText +
    '</td>' +

    '<td>' +
      (player.bye || '--') +
    '</td>' +

    '<td class="hc">' +
      (player.handcuff || '—') +
    '</td>' +

    '<td class="notecell">' +
      '' +
    '</td>';

  updateDraftRowMarketCell(row);
  updateDraftRowNoteCell(row);
  updateDraftRowValueCell(row);


  return row;

}


function updateFantasyProsRowDataAttributes(
  row,
  player
) {

  if (!row || !player) {
    return;
  }


  row.setAttribute(
    'data-pos',
    player.pos || ''
  );

  row.setAttribute(
    'data-bye',
    player.bye || ''
  );

  row.setAttribute(
    'data-board-rank',
    player.boardRank != null
      ? String(player.boardRank)
      : String(player.rank || '')
  );

  row.setAttribute(
    'data-ecr',
    player.ecr != null
      ? String(player.ecr)
      : ''
  );

  row.setAttribute(
    'data-adp',
    player.adp != null
      ? String(player.adp)
      : ''
  );

  row.setAttribute(
    'data-adp-rank',
    player.adpRank != null
      ? String(player.adpRank)
      : ''
  );

  row.setAttribute(
    'data-realtime-adp',
    player.realTimeAdp != null
      ? String(player.realTimeAdp)
      : ''
  );

  var espnBoardPlayer = getEspnBoardPlayer(player.name, player.pos, player.team);
  row.setAttribute(
    'data-espn-rank',
    espnBoardPlayer ? String(espnBoardPlayer.rank) : ''
  );

  row.setAttribute(
    'data-fantasypros-tier',
    player.fantasyProsTier != null
      ? String(player.fantasyProsTier)
      : ''
  );

  row.setAttribute(
    'data-consensus-tier',
    player.consensusTier || 'DEEP'
  );

  row.setAttribute(
    'data-semantic-tier',
    player.semanticTier ||
      player.consensusTier ||
      'DEEP'
  );

  row.setAttribute(
    'data-player-source',
    player.source || 'ECR'
  );

  row.setAttribute(
    'data-pos-rank',
    player.posRank != null
      ? String(player.posRank)
      : ''
  );

  row.classList.toggle(
    'special-teams-row',
    player.pos === 'K' || player.pos === 'DST'
  );

}

var espnBoardByCanonicalName = null;
var espnBoardByPositionTeam = null;

function canonicalEspnBoardName(name) {
  return canonicalExpertPlayerName(name).replace(/\s+(?:jr|sr|ii|iii|iv)$/i, '');
}

function getEspnBoardPlayer(name, position, team) {
  if (!espnBoardByCanonicalName) {
    espnBoardByCanonicalName = {};
    espnBoardByPositionTeam = {};
    var board = window.ESPN_2026_PPR_BOARD;
    (board && Array.isArray(board.players) ? board.players : []).forEach(function(player) {
      espnBoardByCanonicalName[canonicalEspnBoardName(player.name)] = player;
      var positionTeamKey = String(player.position || '') + '|' + String(player.team || '');
      if (!espnBoardByPositionTeam[positionTeamKey]) espnBoardByPositionTeam[positionTeamKey] = [];
      espnBoardByPositionTeam[positionTeamKey].push(player);
    });
  }
  var named = espnBoardByCanonicalName[canonicalEspnBoardName(name)];
  if (named) return named;
  if (String(position || '') !== 'DST') return null;
  var matches = espnBoardByPositionTeam[String(position || '') + '|' + String(team || '')] || [];
  return matches.length === 1 ? matches[0] : null;
}


function updateExpertPlayerRowMetadata(
  row,
  player
) {

  if (!row || !player) {
    return;
  }


  updateFantasyProsRowDataAttributes(
    row,
    player
  );

  row.setAttribute(
    'data-name',
    normalizeExpertPlayerName(
      player.name
    )
  );

  row.setAttribute(
    'data-display-name',
    String(player.name || '').trim()
  );


  var playerCell =
    row.querySelector('.pname');

  if (playerCell) {

    var posRank =
      playerCell.querySelector('.posrk');

    var firstTextNode =
      Array.from(
        playerCell.childNodes
      ).find(function(node) {

        return node.nodeType ===
          Node.TEXT_NODE;

      });

    if (firstTextNode) {

      firstTextNode.textContent =
        String(player.name || '').trim() +
        ' ';

    }

    if (posRank) {

      posRank.textContent =
        player.pos +
        (
          player.posRank != null
            ? player.posRank
            : '--'
        );

    }

  }


  var posPill =
    row.querySelector('.pos-pill');

  if (posPill) {

    posPill.className =
      'pos-pill pos-' +
      player.pos;

    posPill.textContent =
      player.pos;

  }


  var teamCell =
    row.children[3];

  if (teamCell) {

    var sos =
      teamCell.querySelector('.sos');

    teamCell.textContent =
      player.team || 'FA';

    if (sos) {

      teamCell.appendChild(
        document.createTextNode(' ')
      );

      teamCell.appendChild(sos);

    }

  }


  updateDraftRowMarketCell(row);
  updateDraftRowNoteCell(row);
  updateDraftRowValueCell(row);


  var byeCell =
    row.children[6];

  if (byeCell) {

    byeCell.textContent =
      player.bye || '--';

  }


}

function ensureExpertPlayerExists(player, rowsByName) {

  var canonical = canonicalExpertPlayerName(player.name);
  var existing = rowsByName instanceof Map
    ? rowsByName.get(canonical) || null
    : findDraftRowByExpertName(player.name);

  if (existing) {

    updateExpertPlayerRowMetadata(
      existing,
      player
    );

    return {
      row: existing,
      added: false
    };

  }


  var newRow =
    createExpertPlayerRow(
      player
    );

  if (rowsByName instanceof Map) {
    rowsByName.set(canonical, newRow);
  }


  return {
    row: newRow,
    added: true
  };

}


function getExpertTierBody(tier) {

  return (
    document.getElementById(
      'tbody-' + tier
    ) ||
    document.getElementById(
      'tbody-F'
    )
  );

}


/*
 * =========================================================
 * REMOVE ANY PLAYER OUTSIDE FANTASYPROS MASTER DATASET
 * =========================================================
 *
 * FantasyPros is now authoritative for:
 *
 * QB / RB / WR / TE / K / DST
 */
function removePlayersOutsideExpertDataset() {

  var supportedPositions =
    ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];


  var expertNames =
    new Set(
      EXPERT_RANKINGS_2026.map(
        function(player) {

          return canonicalExpertPlayerName(
            player.name
          );

        }
      )
    );


  var removed = [];


  Array.from(
    document.querySelectorAll(
      'tr.draftrow'
    )
  ).forEach(function(row) {

    var position =
      row.getAttribute(
        'data-pos'
      );


    if (
      !supportedPositions.includes(
        position
      )
    ) {

      return;

    }


    var name =
      row.getAttribute(
        'data-name'
      );


    if (
      !expertNames.has(
        canonicalExpertPlayerName(
          name
        )
      )
    ) {

      removed.push(name);

      row.remove();

    }

  });


  return removed;

}


/*
 * =========================================================
 * BUILD AUTHORITATIVE FANTASYPROS 2026 BOARD
 * =========================================================
 */
function build2026ExpertBoardStructure() {

  if (
    !Array.isArray(EXPERT_RANKINGS_2026) ||
    !EXPERT_RANKINGS_2026.length
  ) {

    console.warn(
      'FantasyPros 2026 master dataset unavailable.'
    );

    return null;

  }


  invalidateDraftRowCaches();

  var removedPlayers =
    removePlayersOutsideExpertDataset();

  var rowsByName =
    indexDraftRowsByExpertName();

  var tierFragments = {};

  TIER_IDS.forEach(function(tierId) {
    tierFragments[tierId] = document.createDocumentFragment();
  });


  var reused = 0;
  var added = 0;
  var errors = [];


  EXPERT_RANKINGS_2026.forEach(
    function(player) {

      try {

        var result =
          ensureExpertPlayerExists(
            player,
            rowsByName
          );


        if (
          !result ||
          !result.row
        ) {

          errors.push(
            player.name
          );

          return;

        }


        var tbody =
          getExpertTierBody(
            player.tier
          );


        if (!tbody) {

          errors.push(
            player.name +
            ' — missing legacy tier ' +
            player.tier
          );

          return;

        }


        /*
         * Dataset is already rank ordered.
         * appendChild() gives us deterministic order.
         */
        var targetTier = tierFragments[player.tier]
          ? player.tier
          : 'F';

        tierFragments[targetTier].appendChild(
          result.row
        );


        if (result.added) {

          added++;

        } else {

          reused++;

        }

      } catch (err) {

        console.error(
          'FantasyPros board initialization failed:',
          player.name,
          err
        );


        errors.push(
          player.name
        );

      }

    }
  );

  TIER_IDS.forEach(function(tierId) {
    var tbody = getExpertTierBody(tierId);
    if (tbody) tbody.appendChild(tierFragments[tierId]);
  });

  invalidateDraftRowCaches();
  getCachedDraftRows();
  _draftRowsByCanonicalNameCache = indexDraftRowsByExpertName();


  if (
    typeof syncRankData ===
    'function'
  ) {

    syncRankData();

  }


  var ecrRows =
    EXPERT_RANKINGS_2026.filter(
      function(player) {

        return player.ecr != null;

      }
    ).length;


  var adpOnlyRows =
    EXPERT_RANKINGS_2026.length -
    ecrRows;


  var totalRows =
    document.querySelectorAll(
      'tr.draftrow'
    ).length;


  var result = {

    datasetPlayers:
      EXPERT_RANKINGS_2026.length,

    ecrPlayers:
      ecrRows,

    adpOnlyPlayers:
      adpOnlyRows,

    reused:
      reused,

    added:
      added,

    removed:
      removedPlayers,

    totalRows:
      totalRows,

    errors:
      errors

  };


  console.log(
    'FantasyPros 2026 board initialized:',
    result
  );


  return result;

}


/*
 * =========================================================
 * MANUAL RE-APPLY
 * =========================================================
 */
function apply2026ExpertRankings() {

  console.log(
    '===================================='
  );

  console.log(
    'APPLYING FANTASYPROS 2026 MASTER BOARD'
  );

  console.log(
    '===================================='
  );


  var result =
    build2026ExpertBoardStructure();


  if (!result) {
    return null;
  }


  if (
    typeof syncEditControls ===
    'function'
  ) {

    syncEditControls();

  }


  if (
    typeof triggerAllBoardUpdates ===
    'function'
  ) {

    triggerAllBoardUpdates();

  }


  if (
    typeof saveState ===
    'function'
  ) {

    try {

      saveState();

    } catch (err) {

      console.warn(
        'FantasyPros board applied, but saveState failed:',
        err
      );

    }

  }


  return result;

}

/*
 * =========================================================
 * FANTASYPROS 2026 MASTER BOARD AUDIT
 * =========================================================
 */
function auditFantasyPros2026Board() {

  var rows =
    Array.from(
      document.querySelectorAll(
        'tr.draftrow'
      )
    );


  var boardMap =
    new Map();


  rows.forEach(function(row) {

    var key =
      canonicalExpertPlayerName(
        row.getAttribute(
          'data-name'
        )
      );


    if (!boardMap.has(key)) {

      boardMap.set(
        key,
        []
      );

    }


    boardMap.get(key).push(row);

  });


  var expected =
    EXPERT_RANKINGS_2026.map(
      function(player) {

        return canonicalExpertPlayerName(
          player.name
        );

      }
    );


  var expectedSet =
    new Set(expected);


  var datasetMap =
    new Map();


  expected.forEach(function(name) {

    datasetMap.set(
      name,
      (datasetMap.get(name) || 0) + 1
    );

  });


  var datasetDuplicates =
    Array.from(
      datasetMap.entries()
    ).filter(function(entry) {

      return entry[1] > 1;

    }).map(function(entry) {

      return entry[0];

    });


  var missing =
    expected.filter(
      function(name) {

        return !boardMap.has(name);

      }
    );


  var unexpected =
    Array.from(
      boardMap.keys()
    ).filter(
      function(name) {

        return !expectedSet.has(name);

      }
    );


  var duplicates =
    Array.from(
      boardMap.entries()
    ).filter(
      function(entry) {

        return entry[1].length > 1;

      }
    ).map(
      function(entry) {

        return entry[0];

      }
    );


  var positionCounts = {};


  rows.forEach(function(row) {

    var pos =
      row.getAttribute(
        'data-pos'
      ) || 'UNKNOWN';


    positionCounts[pos] =
      (
        positionCounts[pos] || 0
      ) + 1;

  });


  var ecrCount =
    rows.filter(
      function(row) {

        return (
          row.getAttribute(
            'data-ecr'
          ) || ''
        ) !== '';

      }
    ).length;


  var adpOnlyCount =
    rows.filter(
      function(row) {

        return (
          row.getAttribute(
            'data-player-source'
          ) === 'ADP_ONLY'
        );

      }
    ).length;


  var expectedPositionCounts =
    typeof FANTASYPROS_2026_DATASET_META !== 'undefined' &&
    FANTASYPROS_2026_DATASET_META.positionCounts
      ? FANTASYPROS_2026_DATASET_META.positionCounts
      : {};


  var positionCountsMatch =
    Object.keys(
      expectedPositionCounts
    ).every(function(position) {

      return (
        positionCounts[position] || 0
      ) === expectedPositionCounts[position];

    });


  var result = {

    datasetPlayers:
      EXPERT_RANKINGS_2026.length,

    boardPlayers:
      rows.length,

    exactCount:
      rows.length ===
      EXPERT_RANKINGS_2026.length,

    ecrRows:
      ecrCount,

    adpOnlyRows:
      adpOnlyCount,

    missingCount:
      missing.length,

    unexpectedCount:
      unexpected.length,

    duplicateCount:
      duplicates.length,

    datasetDuplicateCount:
      datasetDuplicates.length,

    positionCountsMatch:
      positionCountsMatch,

    positionCounts:
      positionCounts,

    missing:
      missing,

    unexpected:
      unexpected,

    duplicates:
      duplicates,

    datasetDuplicates:
      datasetDuplicates

  };


  result.passed =
    result.exactCount &&
    result.missingCount === 0 &&
    result.unexpectedCount === 0 &&
    result.duplicateCount === 0 &&
    result.datasetDuplicateCount === 0 &&
    result.positionCountsMatch;


  console.log(
    '=== FANTASYPROS 2026 MASTER BOARD AUDIT ==='
  );

  console.log(result);

  return result;

}


function runFantasyProsMigrationVerification() {
  if (typeof window.runDraftEngineTests !== 'function') {
    return loadDeveloperTools().then(runFantasyProsMigrationVerification);
  }

  var boardAudit =
    auditFantasyPros2026Board();

  var draftEngine =
    runDraftEngineTests();

  var turnPackage =
    runTurnPackageTests();

  var recommendationExplanation =
    runRecommendationExplanationTests();

  var totalPassed =
    draftEngine.passed +
    turnPackage.passed +
    recommendationExplanation.passed;

  var totalFailed =
    draftEngine.failed +
    turnPackage.failed +
    recommendationExplanation.failed;

  var result = {
    boardAudit: boardAudit,
    draftEngine: draftEngine,
    turnPackage: turnPackage,
    recommendationExplanation:
      recommendationExplanation,
    totalPassed: totalPassed,
    totalFailed: totalFailed,
    totalTests: totalPassed + totalFailed,
    passed:
      boardAudit.passed &&
      totalFailed === 0
  };

  window.FANTASYPROS_2026_LAST_VERIFICATION =
    result;

  var target =
    document.getElementById(
      'developer-test-results'
    );

  if (target) {
    target.textContent = [
      'FANTASYPROS 2026 MIGRATION VERIFICATION',
      'Board: ' +
        boardAudit.boardPlayers +
        '/' +
        boardAudit.datasetPlayers +
        ' rows',
      'Missing: ' + boardAudit.missingCount,
      'Unexpected: ' + boardAudit.unexpectedCount,
      'Board duplicates: ' +
        boardAudit.duplicateCount,
      'Dataset duplicates: ' +
        boardAudit.datasetDuplicateCount,
      'Draft engine: ' +
        draftEngine.passed +
        '/' +
        draftEngine.total,
      'Turn package: ' +
        turnPackage.passed +
        '/' +
        turnPackage.total,
      'Recommendation explanations: ' +
        recommendationExplanation.passed +
        '/' +
        recommendationExplanation.total,
      'Total: ' +
        totalPassed +
        '/' +
        result.totalTests,
      'Result: ' +
        (result.passed ? 'PASS' : 'FAIL')
    ].join('\n');
  }

  console.info(
    '[FantasyPros 2026 Migration Verification]',
    result
  );

  return result;
}

// ==== EDIT RANKS ====

function updateCustomBoardUi() {
  var button = document.getElementById('editRanksBtn');
  if (!button || document.body.classList.contains('edit-mode')) return;
  button.innerHTML = customBoardEnabled
    ? '&#9998; Edit Custom Board'
    : '&#9998; Customize Board';
  button.classList.toggle('customized', customBoardEnabled);
}

function toggleEditMode(){
  var isEditing = document.body.classList.toggle('edit-mode');
  var btn = document.getElementById('editRanksBtn');

  if(btn){
    btn.innerHTML = isEditing
      ? '&#10003; Done Editing'
      : (customBoardEnabled ? '&#9998; Edit Custom Board' : '&#9998; Customize Board');

    btn.classList.toggle('editing', isEditing);
  }

  if(isEditing){
    customBoardEnabled = true;
    addEditControlsCustom();
  } else {
    document.querySelectorAll('.rank-controls').forEach(function(el){
      el.remove();
    });
    scheduleSave();
  }
  updateCustomBoardUi();
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
if (document.body.classList.contains('edit-mode')) addEditControls();
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

  customBoardEnabled = false;
  document.body.classList.remove('edit-mode');
  document.querySelectorAll('.rank-controls').forEach(function(element) {
    element.remove();
  });

  syncEditControls();
  updateCustomBoardUi();
  scheduleSave();

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

function clampRecommendationFactor(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function getCompactRecommendationReason(explanation, survival) {
  var reasons = explanation && Array.isArray(explanation.reasons) ? explanation.reasons : [];
  if (reasons.length) return String(reasons[0]).replace(/<[^>]*>/g, '').slice(0, 105);
  if (survival < 30) return 'Strong value with a low chance of reaching your next pick';
  if (survival >= 70) return 'Good option, but the market suggests you may be able to wait';
  return 'Best available fit for value, roster construction, and timing';
}

function buildCompactFactorHtml(label, value) {
  var score = Math.round(clampRecommendationFactor(value));
  return '<div class="recommendation-factor"><span><b>' + escapeSummaryHtml(label) + '</b><em>' + score + '</em></span>' +
    '<div class="recommendation-factor-track" role="progressbar" aria-label="' + escapeSummaryHtml(label) +
    '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + score + '"><i style="width:' + score + '%"></i></div></div>';
}

function buildMarketTimingDetailsHtml(player, context) {
  var market = getMarketTimingDetails(player, context);
  var nextPick = Number(context && (context.calculatedNextPick || context.nextPick)) || 0;
  var currentPick = Number(context && context.currentPick) || 0;
  var parts = [];
  if (market.espnRank != null) parts.push('ESPN board <b>#' + market.espnRank.toFixed(0) + '</b>');
  if (market.espnAdp != null) parts.push('ESPN ADP <b>' + market.espnAdp.toFixed(1) + '</b>');
  if (market.source === 'FantasyPros ADP fallback' && market.marketRank != null) parts.push('FantasyPros ADP <b>' + market.marketRank.toFixed(1) + '</b>');
  if (market.espnRank != null && market.espnAdp != null) parts.push('weights <b>' + Math.round(market.boardWeight * 100) + '/' + Math.round(market.adpWeight * 100) + '</b>');
  if (market.autoOpponentPicks) parts.push('confirmed Auto picks before next turn <b>' + market.autoOpponentPicks + '/' + market.totalOpponentPicks + '</b>');
  if (market.marketRank != null) parts.push('estimated market pick <b>' + market.marketRank.toFixed(1) + '</b>');
  if (nextPick) parts.push('next pick <b>#' + nextPick + '</b> (' + Math.max(0, nextPick - currentPick) + ' away)');
  return '<details class="recommendation-score-details recommendation-market-details"><summary>Why this survival?</summary><div>' +
    (parts.length ? parts.join(' · ') : 'No ESPN or FantasyPros market data is available for this player.') +
    '</div><small>' + escapeSummaryHtml(market.source) + '</small></details>';
}

function renderCompactRecommendationCard(element, recommendation, explanation, primary, state) {
  var action = String(recommendation.recommendation || 'CONSIDER').toUpperCase();
  var actionClass = action.toLowerCase().replace(/[^a-z]+/g, '-');
  var confidenceScore = Math.round(clampRecommendationFactor(recommendation.confidenceScore));
  var confidenceLabel = explanation.confidence || recommendation.confidence || 'LOW';
  var survival = Math.round(clampRecommendationFactor(calculateNextPickSurvival(primary, state.context)));
  var reason = getCompactRecommendationReason(explanation, survival);
  var reasons = (Array.isArray(explanation.reasons) ? explanation.reasons : []).slice(0, 3);
  var alternative = state.scored[1] || null;
  var scoreGap = alternative ? Number(primary.finalScore || 0) - Number(alternative.finalScore || 0) : 0;
  var team = primary.team || (primary.row && primary.row.getAttribute('data-team')) || '';
  var isTurn = explanation.type === 'TURN_PACKAGE' && recommendation.turnPackageActive;
  var summaryTitle = isTurn
    ? escapeSummaryHtml(recommendation.turnRecommendedNow || primary.name) + ' + ' + escapeSummaryHtml(recommendation.turnTargetNext || 'Best available')
    : escapeSummaryHtml(primary.name);
  var summaryPositions = isTurn
    ? [recommendation.turnPick1Position, recommendation.turnPick2Position].filter(Boolean).join(' + ')
    : primary.position + (team ? ' · ' + team : '');
  var summaryReason = isTurn ? 'Best back-to-back package with no opponent pick between' : reason;

  var details = '<div class="recommendation-expanded">';
  if (isTurn) {
    details += '<div class="recommendation-turn-grid"><div><small>1 · DRAFT NOW</small><b>' +
      escapeSummaryHtml(recommendation.turnRecommendedNow || primary.name) + '</b><span>' + escapeSummaryHtml(recommendation.turnPick1Position || '') + '</span></div>' +
      '<div><small>2 · TARGET NEXT</small><b>' + escapeSummaryHtml(recommendation.turnTargetNext || 'Best available') + '</b><span>' +
      escapeSummaryHtml(recommendation.turnPick2Position || '') + '</span></div></div>';
  }
  if (reasons.length) {
    details += '<section class="recommendation-why"><h3>Why this pick</h3><ul>' + reasons.map(function(item) {
      return '<li>' + escapeSummaryHtml(String(item).replace(/<[^>]*>/g, '')) + '</li>';
    }).join('') + '</ul></section>';
  }
  details += '<section class="recommendation-factors"><h3>Decision factors</h3><div class="recommendation-factor-grid">' +
    buildCompactFactorHtml('ECR value', primary.rankScore) +
    buildCompactFactorHtml('Roster need', primary.rosterNeedScore) +
    buildCompactFactorHtml('Scarcity', primary.scarcityScore) +
    buildCompactFactorHtml('ADP timing', primary.timingScore) + '</div></section>';
  if (alternative && !isTurn) {
    details += '<div class="recommendation-alternative"><span>Best alternative</span><b>' + escapeSummaryHtml(alternative.name) +
      ' · ' + escapeSummaryHtml(alternative.position) + '</b><small>' + (scoreGap >= 0 ? '+' : '') + scoreGap.toFixed(1) + ' score gap</small></div>';
  }
  if (explanation.nextAction) details += '<div class="recommendation-next"><span>Next</span>' + escapeSummaryHtml(explanation.nextAction) + '</div>';
  details += buildMarketTimingDetailsHtml(primary, state.context);
  details += '<details class="recommendation-score-details"><summary>Scoring details</summary><div>Base value <b>' + Number(primary.baseScore || 0).toFixed(1) +
    '</b> · Strategy impact <b>' + (Number(primary.cappedStrategyAdjustment || 0) >= 0 ? '+' : '') + Number(primary.cappedStrategyAdjustment || 0).toFixed(1) +
    '</b> · Guardrails <b>' + (Number(primary.guardrailAdjustment || 0) >= 0 ? '+' : '') + Number(primary.guardrailAdjustment || 0).toFixed(1) +
    '</b> · Final <b>' + Number(primary.finalScore || 0).toFixed(1) + '</b> · Survival <b>' + survival + '%</b>' +
    (isTurn ? ' · Package advantage <b>+' + Number(recommendation.turnPackageAdvantage || 0).toFixed(1) + '</b>' : '') + '</div></details></div>';

  var markup = '<details class="recommendation-card" data-action="' + actionClass + '"><summary class="recommendation-card-summary">' +
    '<span class="recommendation-action">' + escapeSummaryHtml(isTurn ? 'TURN PLAN' : action) + '</span>' +
    '<span class="recommendation-player"><b>' + summaryTitle + '</b><small>' + escapeSummaryHtml(summaryPositions) + '</small></span>' +
    '<span class="recommendation-confidence"><b>' + confidenceScore + '%</b><small>' + escapeSummaryHtml(confidenceLabel) + '</small></span>' +
    '<span class="recommendation-chevron" aria-hidden="true">⌄</span>' +
    '<span class="recommendation-one-line">' + escapeSummaryHtml(summaryReason) + '<b>' + survival + '% survival</b></span>' +
    '</summary>' + details + '</details>';
  if (element._recommendationMarkup === markup) return;
  var wasOpen = Boolean(element.querySelector('.recommendation-card[open]'));
  element.innerHTML = markup;
  element._recommendationMarkup = markup;
  if (wasOpen) {
    var refreshedCard = element.querySelector('.recommendation-card');
    if (refreshedCard) refreshedCard.open = true;
  }
}

function classifyRecommendationAuditOutcome(entry, draftedAt, intervening) {
  intervening = Array.isArray(intervening) ? intervening : [];
  var expectedIntervening = Math.max(0, Number(entry.nextPick) - Number(entry.decisionPick) - 1);
  var coverage = expectedIntervening === 0 ? 1 : Math.min(1, intervening.length / expectedIntervening);
  var majorReaches = intervening.filter(function(item) {
    return item.ecr != null && item.ecr - item.pick >= 30;
  }).length;
  var reachRatio = intervening.length ? majorReaches / intervening.length : 0;
  var selectedNow = draftedAt === Number(entry.decisionPick);
  var incomplete = coverage < 0.8;
  var noisyDraft = !incomplete && intervening.length >= 3 && reachRatio >= 0.35;
  var survived = selectedNow || incomplete ? null : draftedAt == null || draftedAt >= Number(entry.nextPick);
  return {
    survived: survived,
    outcome: selectedNow ? 'SELECTED_NOW' : incomplete ? 'INCOMPLETE' : survived ? 'SURVIVED' : 'DRAFTED_BEFORE_NEXT',
    actualDraftPick: draftedAt,
    expectedInterveningPicks: expectedIntervening,
    interveningPicks: intervening.length,
    pickCoverage: Number(coverage.toFixed(3)),
    majorReachCount: majorReaches,
    noisyDraft: noisyDraft,
    incomplete: incomplete,
    censored: selectedNow,
    calibrationEligible: !selectedNow && !incomplete && !noisyDraft
  };
}

function updateRecommendationAudit(recommendation, primary, state) {
  if (!recommendation || !primary || !state || !state.context) return;
  var decisionPick = Number(state.context.currentPick) || 0;
  var nextPick = Number(state.context.calculatedNextPick || state.context.nextPick) || 0;
  if (decisionPick < 1 || nextPick <= decisionPick) return;

  var changed = false;
  var readyEntries = recommendationAudit.filter(function(entry) {
    return !entry.resolved && decisionPick >= entry.nextPick;
  });
  var draftedPickSnapshot = readyEntries.length ? getCachedDraftRows().map(function(candidateRow) {
    return {
      row: candidateRow,
      pick: Number(candidateRow.getAttribute('data-pick')) || null,
      ecr: getDraftRowNumber(candidateRow, 'data-ecr')
    };
  }) : [];

  readyEntries.forEach(function(entry) {
    var row = findDraftRowByExpertName(entry.player);
    var draftedAt = row ? Number(row.getAttribute('data-pick')) || null : null;
    var intervening = draftedPickSnapshot.filter(function(item) {
      return item.pick > entry.decisionPick && item.pick < entry.nextPick;
    });
    var classification = classifyRecommendationAuditOutcome(entry, draftedAt, intervening);
    entry.resolved = true;
    Object.keys(classification).forEach(function(key) { entry[key] = classification[key]; });
    entry.resolvedAt = new Date().toISOString();
    changed = true;
  });

  var key = decisionPick + '|' + canonicalExpertPlayerName(primary.name);
  var existingEntry = recommendationAudit.find(function(entry) { return entry.key === key; });
  if (existingEntry) {
    var latestValues = {
      action: recommendation.recommendation,
      scoreGap: Number(recommendation.scoreGap) || 0,
      confidence: Number(recommendation.confidenceScore) || 0,
      baseScore: Number(primary.baseScore) || 0,
      strategyAdjustment: Number(primary.cappedStrategyAdjustment) || 0,
      guardrailAdjustment: Number(primary.guardrailAdjustment) || 0
    };
    Object.keys(latestValues).forEach(function(field) {
      if (existingEntry[field] !== latestValues[field]) {
        existingEntry[field] = latestValues[field];
        changed = true;
      }
    });
    if (changed) existingEntry.updatedAt = new Date().toISOString();
  } else {
    var marketDetails = getMarketTimingDetails(primary, state.context);
    recommendationAudit.push({
      key: key,
      recordedAt: new Date().toISOString(),
      decisionPick: decisionPick,
      nextPick: nextPick,
      player: primary.name,
      position: primary.position,
      ecr: primary.ecr == null ? Number(primary.rank) || null : Number(primary.ecr),
      adp: primary.adp == null ? null : Number(primary.adp),
      espnBoardRank: marketDetails.espnRank,
      espnAdp: marketDetails.espnAdp,
      marketSource: marketDetails.source,
      marketEstimate: marketDetails.marketRank,
      boardWeight: marketDetails.boardWeight,
      draftPhase: decisionPick <= 36 ? 'EARLY' : decisionPick <= 96 ? 'MIDDLE' : 'LATE',
      predictedSurvival: Math.round(clampRecommendationFactor(calculateNextPickSurvival(primary, state.context))),
      action: recommendation.recommendation,
      scoreGap: Number(recommendation.scoreGap) || 0,
      confidence: Number(recommendation.confidenceScore) || 0,
      baseScore: Number(primary.baseScore) || 0,
      strategyAdjustment: Number(primary.cappedStrategyAdjustment) || 0,
      guardrailAdjustment: Number(primary.guardrailAdjustment) || 0,
      byeWeek: primary.bye || null,
      byeWeekAdjustment: Number(primary.byeWeekCongestionAdjustment) || 0,
      resolved: false
    });
    if (recommendationAudit.length > 200) recommendationAudit = recommendationAudit.slice(-200);
    changed = true;
  }
  if (changed) scheduleSave();
}

function getRecommendationAuditSummary() {
  var resolved = recommendationAudit.filter(function(entry) { return entry.resolved; });
  var eligible = resolved.filter(function(entry) { return entry.calibrationEligible; });
  return {
    total: recommendationAudit.length,
    resolved: resolved.length,
    calibrationEligible: eligible.length,
    noisyDraftDecisions: resolved.filter(function(entry) { return entry.noisyDraft; }).length,
    incompleteDecisions: resolved.filter(function(entry) { return entry.incomplete; }).length,
    censoredDecisions: resolved.filter(function(entry) { return entry.censored; }).length,
    observedSurvivalRate: eligible.length
      ? Math.round(eligible.filter(function(entry) { return entry.survived; }).length / eligible.length * 100)
      : null,
    minimumSampleReached: eligible.length >= 10,
    entries: recommendationAudit.slice()
  };
}

function getRecommendationAuditPortfolioSummary() {
  var drafts = readDraftSessionRegistry().map(function(session) {
    try {
      var payload = JSON.parse(localStorage.getItem(getDraftSessionStateKey(session.id)) || 'null');
      if (!payload) return null;
      var totalPicks = Math.max(2, Number(payload.teams) || 10) * Math.max(1, Number(payload.rounds) || 16);
      var numberedPicks = Object.keys(payload.draftMeta || {}).filter(function(name) {
        return Number(payload.draftMeta[name] && payload.draftMeta[name].pick) > 0;
      }).length;
      var resolved = (Array.isArray(payload.recommendationAudit) ? payload.recommendationAudit : [])
        .filter(function(entry) { return entry && entry.resolved; });
      var eligible = resolved.filter(function(entry) { return entry.calibrationEligible; });
      var noisy = resolved.filter(function(entry) { return entry.noisyDraft; }).length;
      var noiseRate = resolved.length ? noisy / resolved.length : 0;
      var complete = numberedPicks >= totalPicks;
      var clean = complete && eligible.length > 0 && noiseRate < 0.35;
      var calibrationByPhase = {};
      ['EARLY', 'MIDDLE', 'LATE'].forEach(function(phase) {
        var phaseEntries = eligible.filter(function(entry) { return entry.draftPhase === phase; });
        calibrationByPhase[phase] = {
          decisions: phaseEntries.length,
          predicted: phaseEntries.length ? Math.round(phaseEntries.reduce(function(sum, entry) { return sum + Number(entry.predictedSurvival || 0); }, 0) / phaseEntries.length) : null,
          observed: phaseEntries.length ? Math.round(phaseEntries.filter(function(entry) { return entry.survived; }).length / phaseEntries.length * 100) : null
        };
      });
      return {
        id: session.id,
        name: session.name,
        complete: complete,
        clean: clean,
        numberedPicks: numberedPicks,
        totalPicks: totalPicks,
        eligibleDecisions: eligible.length,
        noisyDecisions: noisy,
        qbDecisions: eligible.filter(function(entry) { return entry.position === 'QB'; }).length,
        teDecisions: eligible.filter(function(entry) { return entry.position === 'TE'; }).length,
        byePenaltyDecisions: eligible.filter(function(entry) { return Number(entry.byeWeekAdjustment) < 0; }).length,
        calibrationByPhase: calibrationByPhase
      };
    } catch (error) { return null; }
  }).filter(Boolean);
  var cleanDrafts = drafts.filter(function(draft) { return draft.clean; });
  var phaseCalibration = {};
  ['EARLY', 'MIDDLE', 'LATE'].forEach(function(phase) {
    var rows = cleanDrafts.map(function(draft) { return draft.calibrationByPhase[phase]; }).filter(function(row) { return row && row.decisions; });
    var decisions = rows.reduce(function(sum, row) { return sum + row.decisions; }, 0);
    phaseCalibration[phase] = {
      decisions: decisions,
      predicted: decisions ? Math.round(rows.reduce(function(sum, row) { return sum + row.predicted * row.decisions; }, 0) / decisions) : null,
      observed: decisions ? Math.round(rows.reduce(function(sum, row) { return sum + row.observed * row.decisions; }, 0) / decisions) : null
    };
  });
  return {
    savedDrafts: drafts.length,
    completedDrafts: drafts.filter(function(draft) { return draft.complete; }).length,
    cleanCompletedMocks: cleanDrafts.length,
    reviewReady: cleanDrafts.length >= 10,
    strongReviewSample: cleanDrafts.length >= 20,
    remainingUntilReview: Math.max(0, 10 - cleanDrafts.length),
    qbDecisions: cleanDrafts.reduce(function(sum, draft) { return sum + draft.qbDecisions; }, 0),
    teDecisions: cleanDrafts.reduce(function(sum, draft) { return sum + draft.teDecisions; }, 0),
    byePenaltyDecisions: cleanDrafts.reduce(function(sum, draft) { return sum + draft.byePenaltyDecisions; }, 0),
    phaseCalibration: phaseCalibration,
    drafts: drafts
  };
}

window.getRecommendationAuditPortfolioSummary = getRecommendationAuditPortfolioSummary;

function buildRecommendationAuditExport() {
  var portfolio = getRecommendationAuditPortfolioSummary();
  var draftById = {};
  portfolio.drafts.forEach(function(draft) { draftById[draft.id] = draft; });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scoringAutoAdjusted: false,
    reviewThresholds: {minimumCleanMocks: 10, strongSampleCleanMocks: 20},
    summary: portfolio,
    drafts: readDraftSessionRegistry().map(function(session) {
      try {
        var payload = JSON.parse(localStorage.getItem(getDraftSessionStateKey(session.id)) || 'null');
        if (!payload) return null;
        return {
          id: session.id,
          name: session.name,
          createdAt: session.createdAt || null,
          savedAt: payload.savedAt || null,
          auditStatus: draftById[session.id] || null,
          decisions: Array.isArray(payload.recommendationAudit) ? payload.recommendationAudit : []
        };
      } catch (error) { return null; }
    }).filter(Boolean)
  };
}

function escapeCsvCell(value) {
  var text = value == null ? '' : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function recommendationAuditCsv(report) {
  var headers = ['draft','clean','complete','decisionPick','nextPick','phase','player','position','ecr','fantasyProsAdp','espnBoardRank','espnAdp','marketSource','marketEstimate','boardWeight','predictedSurvival','survived','outcome','pickCoverage','noisy','byeWeek','byePenalty'];
  var rows = [headers.map(escapeCsvCell).join(',')];
  report.drafts.forEach(function(draft) {
    (draft.decisions || []).forEach(function(entry) {
      rows.push([
        draft.name, draft.auditStatus && draft.auditStatus.clean,
        draft.auditStatus && draft.auditStatus.complete, entry.decisionPick,
        entry.nextPick, entry.draftPhase, entry.player, entry.position, entry.ecr, entry.adp,
        entry.espnBoardRank, entry.espnAdp, entry.marketSource, entry.marketEstimate, entry.boardWeight,
        entry.predictedSurvival, entry.survived, entry.outcome, entry.pickCoverage,
        entry.noisyDraft, entry.byeWeek, entry.byeWeekAdjustment
      ].map(escapeCsvCell).join(','));
    });
  });
  return rows.join('\r\n');
}

function downloadAuditFile(filename, content, type) {
  var url = URL.createObjectURL(new Blob([content], {type: type}));
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 0);
}

function exportRecommendationAudit(format) {
  saveState();
  var report = buildRecommendationAuditExport();
  var stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    downloadAuditFile('war-room-mock-audit-' + stamp + '.csv', recommendationAuditCsv(report), 'text/csv;charset=utf-8');
  } else {
    downloadAuditFile('war-room-mock-audit-' + stamp + '.json', JSON.stringify(report, null, 2), 'application/json');
  }
}

function renderMockAudit() {
  var target = document.getElementById('mock-audit-content');
  if (!target) return;
  var summary = getRecommendationAuditPortfolioSummary();
  var progress = Math.min(100, summary.cleanCompletedMocks / 10 * 100);
  var draftRows = summary.drafts.length ? summary.drafts.map(function(draft) {
    return '<tr><td>' + escapeSummaryHtml(draft.name) + '</td><td>' +
      (draft.clean ? 'Clean' : draft.complete ? 'Complete · excluded' : 'Incomplete') + '</td><td>' +
      draft.numberedPicks + '/' + draft.totalPicks + '</td><td>' + draft.eligibleDecisions + '</td><td>' +
      draft.qbDecisions + '</td><td>' + draft.teDecisions + '</td><td>' + draft.byePenaltyDecisions + '</td></tr>';
  }).join('') : '<tr><td colspan="7">No saved mock evidence yet.</td></tr>';
  target.innerHTML =
    '<div class="mock-audit-grid">' +
      '<div class="mock-audit-card"><small>Clean mocks</small><b>' + summary.cleanCompletedMocks + ' / 10</b></div>' +
      '<div class="mock-audit-card"><small>Completed drafts</small><b>' + summary.completedDrafts + '</b></div>' +
      '<div class="mock-audit-card"><small>QB / TE decisions</small><b>' + summary.qbDecisions + ' / ' + summary.teDecisions + '</b></div>' +
      '<div class="mock-audit-card"><small>Bye penalties</small><b>' + summary.byePenaltyDecisions + '</b></div>' +
    '</div><div class="mock-audit-grid mock-audit-calibration">' + ['EARLY','MIDDLE','LATE'].map(function(phase) {
      var row = summary.phaseCalibration[phase];
      return '<div class="mock-audit-card"><small>' + phase + ' survival</small><b>' +
        (row.decisions ? row.predicted + '% predicted / ' + row.observed + '% observed' : 'No clean sample') +
        '</b><span>' + row.decisions + ' decisions</span></div>';
    }).join('') + '</div><div class="mock-audit-progress" aria-label="Mock review progress"><span style="width:' + progress + '%"></span></div>' +
    '<p class="mock-audit-status' + (summary.reviewReady ? ' ready' : '') + '">' +
      (summary.reviewReady
        ? (summary.strongReviewSample ? 'Strong 20-mock sample reached. Ready for a full scoring review.' : 'Ten clean mocks reached. Ready for an initial evidence review.')
        : summary.remainingUntilReview + ' more clean completed mock' + (summary.remainingUntilReview === 1 ? '' : 's') + ' needed before review.') +
      ' No weights are changed automatically.</p>' +
    '<div class="mock-audit-table-wrap"><table class="mock-audit-table"><thead><tr><th>Draft</th><th>Status</th><th>Picks</th><th>Eligible</th><th>QB</th><th>TE</th><th>Bye</th></tr></thead><tbody>' + draftRows + '</tbody></table></div>';
}

function openMockAudit() {
  saveState();
  renderMockAudit();
  var modal = document.getElementById('mock-audit-modal');
  if (!modal) return;
  lastFocusedElementBeforeModal = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('final-summary-open');
  var dialog = modal.querySelector('.mock-audit-dialog');
  if (dialog) dialog.focus();
}

function closeMockAudit() {
  var modal = document.getElementById('mock-audit-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('final-summary-open');
  if (lastFocusedElementBeforeModal && document.contains(lastFocusedElementBeforeModal)) lastFocusedElementBeforeModal.focus();
}

window.buildRecommendationAuditExport = buildRecommendationAuditExport;

function parseFantasyProsCsvText(text) {
  var rows = [];
  var row = [];
  var field = '';
  var quoted = false;
  String(text || '').split('').forEach(function(char, index, chars) {
    if (quoted) {
      if (char === '"' && chars[index + 1] === '"') {
        field += '"';
        chars[index + 1] = '';
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  });
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (!rows.length) return [];
  var headers = rows.shift().map(function(header) { return header.replace(/^\uFEFF/, '').trim(); });
  return rows.filter(function(values) { return values.some(Boolean); }).map(function(values) {
    var result = {};
    headers.forEach(function(header, index) { result[header] = values[index] == null ? '' : values[index]; });
    return result;
  });
}

function fantasyProsCsvValue(row, names) {
  var keys = Object.keys(row || {});
  var wanted = names.map(function(name) { return String(name).toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  var key = keys.find(function(candidate) {
    return wanted.indexOf(String(candidate).toUpperCase().replace(/[^A-Z0-9]/g, '')) >= 0;
  });
  return key ? String(row[key] || '').trim() : '';
}

function fantasyProsTierMapping(rawTier, fallback) {
  var tier = Number(rawTier);
  var mappings = [
    {min:1,max:2,legacy:'Sp',semantic:'ELITE'}, {min:3,max:4,legacy:'S',semantic:'PREMIUM'},
    {min:5,max:6,legacy:'A',semantic:'CORE'}, {min:7,max:8,legacy:'B',semantic:'VALUE'},
    {min:9,max:10,legacy:'C',semantic:'UPSIDE'}, {min:11,max:12,legacy:'D',semantic:'DEPTH'},
    {min:13,max:14,legacy:'E',semantic:'LATE'}, {min:15,max:16,legacy:'F',semantic:'DEEP'}
  ];
  return mappings.find(function(mapping) { return tier >= mapping.min && tier <= mapping.max; }) || {
    legacy: fallback.tier, semantic: fallback.semanticTier || fallback.consensusTier, min: tier, max: tier
  };
}

function buildFantasyProsTop20Override(rows, file) {
  var rankedRows = rows.map(function(row) {
    var rank = Number(fantasyProsCsvValue(row, ['RK', 'RANK']));
    var name = fantasyProsCsvValue(row, ['PLAYER NAME', 'PLAYER']);
    return {row: row, rank: rank, name: name};
  }).filter(function(item) { return Number.isInteger(item.rank) && item.rank > 0 && item.name; })
    .sort(function(a, b) { return a.rank - b.rank; });
  if (rankedRows.length < 100 || rankedRows.length > 600) {
    throw new Error('Expected a Top-20 experts export with 100–600 ranked players; found ' + rankedRows.length + '.');
  }

  var baseByName = new Map(EMBEDDED_FANTASYPROS_2026_DATASET.map(function(player) {
    return [canonicalExpertPlayerName(player.name), player];
  }));
  var seen = new Set();
  var imported = rankedRows.map(function(item) {
    var key = canonicalExpertPlayerName(item.name);
    if (seen.has(key)) throw new Error('Duplicate player in the FantasyPros export: ' + item.name);
    seen.add(key);
    var existing = baseByName.get(key);
    if (!existing || existing.ecr == null) throw new Error('Ranked player is not on the broader ECR board: ' + item.name);
    var rawPosition = fantasyProsCsvValue(item.row, ['POS', 'POSITION']).toUpperCase().replace('D/ST', 'DST');
    var positionMatch = rawPosition.match(/^([A-Z]+)(\d+)?$/);
    if (!positionMatch || positionMatch[1] !== existing.pos) {
      throw new Error('Position mismatch for ' + item.name + ': expected ' + existing.pos + ', received ' + (rawPosition || 'blank') + '.');
    }
    var rawTier = Number(fantasyProsCsvValue(item.row, ['TIERS', 'TIER']));
    var mapping = fantasyProsTierMapping(rawTier, existing);
    return Object.assign({}, existing, {
      name: item.name,
      team: fantasyProsCsvValue(item.row, ['TEAM']) || existing.team,
      bye: fantasyProsCsvValue(item.row, ['BYE WEEK', 'BYE']) || existing.bye,
      posRank: positionMatch[2] ? Number(positionMatch[2]) : existing.posRank,
      fantasyProsTier: Number.isFinite(rawTier) && rawTier > 0 ? rawTier : existing.fantasyProsTier,
      consensusTier: mapping.semantic,
      semanticTier: mapping.semantic,
      tier: mapping.legacy,
      ecrSource: 'TOP20_EXPERTS',
      sourceEcrRank: item.rank
    });
  });

  var broadFallback = EMBEDDED_FANTASYPROS_2026_DATASET.filter(function(player) {
    return player.ecr != null && !seen.has(canonicalExpertPlayerName(player.name));
  }).map(function(player) { return Object.assign({}, player, {ecrSource:'BROAD_ECR_FALLBACK'}); });
  var adpOnly = EMBEDDED_FANTASYPROS_2026_DATASET.filter(function(player) { return player.ecr == null; })
    .map(function(player) { return Object.assign({}, player); });
  var ecrPlayers = imported.concat(broadFallback);
  var players = ecrPlayers.concat(adpOnly).map(function(player, index) {
    var ranked = index < ecrPlayers.length;
    return Object.assign({}, player, {
      rank: index + 1,
      boardRank: index + 1,
      ecr: ranked ? index + 1 : null
    });
  });
  if (players.length !== EMBEDDED_FANTASYPROS_2026_DATASET.length) throw new Error('The merged board did not preserve all players.');

  var modified = new Date(file && file.lastModified || Date.now());
  var sourceSnapshotDate = [modified.getFullYear(), String(modified.getMonth() + 1).padStart(2, '0'), String(modified.getDate()).padStart(2, '0')].join('-');
  return {
    version: 1,
    importedAt: new Date().toISOString(),
    sourceSnapshotDate: sourceSnapshotDate,
    sourceFile: String(file && file.name || 'FantasyPros Top-20 PPR CSV').slice(0, 160),
    top20Count: imported.length,
    players: players
  };
}

function setRankingsRefreshMessage(message, tone) {
  var target = document.getElementById('rankings-refresh-message');
  if (!target) return;
  target.className = 'rankings-refresh-message' + (tone ? ' ' + tone : '');
  target.textContent = message || '';
}

function renderRankingsRefreshStatus() {
  var fantasyPros = document.getElementById('fantasypros-refresh-status');
  var espn = document.getElementById('espn-rankings-refresh-status');
  if (fantasyPros) {
    var meta = typeof FANTASYPROS_2026_DATASET_META !== 'undefined' ? FANTASYPROS_2026_DATASET_META : {};
    fantasyPros.textContent = meta.localOverride
      ? 'Local update active · ' + (meta.top20EcrPlayers || 0) + ' Top-20 ranked players · ' + (meta.sourceSnapshotDate || 'date unknown')
      : 'Embedded baseline · ' + (meta.top20EcrPlayers || 0) + ' Top-20 ranked players · ' + (meta.sourceSnapshotDate || 'date unknown');
  }
  if (espn) {
    var updated = latestEspnSyncMeta.marketUpdatedAt ? new Date(latestEspnSyncMeta.marketUpdatedAt).toLocaleString() : 'not refreshed this session';
    espn.textContent = 'ESPN board ' + (latestEspnSyncMeta.marketRankCount || 0) + ' players · ADP ' +
      (latestEspnSyncMeta.marketAdpCount || 0) + ' players · ' + updated;
  }
}

function openRankingsRefresh() {
  renderRankingsRefreshStatus();
  setRankingsRefreshMessage('', '');
  var modal = document.getElementById('rankings-refresh-modal');
  if (!modal) return;
  lastFocusedElementBeforeModal = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('final-summary-open');
  var dialog = modal.querySelector('.rankings-refresh-dialog');
  if (dialog) dialog.focus();
}

function closeRankingsRefresh() {
  var modal = document.getElementById('rankings-refresh-modal');
  if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
  document.body.classList.remove('final-summary-open');
  if (lastFocusedElementBeforeModal && document.contains(lastFocusedElementBeforeModal)) lastFocusedElementBeforeModal.focus();
}

function importFantasyProsTop20File() {
  var input = document.getElementById('fantasyprosTop20File');
  var file = input && input.files && input.files[0];
  if (!file) { setRankingsRefreshMessage('Choose the official FantasyPros Top-20 PPR experts CSV first.', 'error'); return; }
  setRankingsRefreshMessage('Validating ' + file.name + '…', 'working');
  file.text().then(function(text) {
    var override = buildFantasyProsTop20Override(parseFantasyProsCsvText(text), file);
    saveState();
    localStorage.setItem(FANTASYPROS_LOCAL_OVERRIDE_KEY, JSON.stringify(override));
    setRankingsRefreshMessage('Validated ' + override.top20Count + ' Top-20 ECR players. Reloading the authoritative board…', 'success');
    setTimeout(function() { window.location.reload(); }, 500);
  }).catch(function(error) {
    setRankingsRefreshMessage(error && error.message ? error.message : String(error), 'error');
  });
}

function requestFantasyProsApiRefresh() {
  window.postMessage({channel:ESPN_SYNC_CHANNEL, type:'FANTASYPROS_REFRESH_REQUEST'}, window.location.origin === 'null' ? '*' : window.location.origin);
  setRankingsRefreshMessage('Requesting the official Top-20 PPR expert update…', 'working');
  setTimeout(function() {
    var target = document.getElementById('rankings-refresh-message');
    if (target && target.classList.contains('working')) {
      setRankingsRefreshMessage('No response from the companion after 15 seconds. Reload extension 0.9.3 and refresh this page.', 'error');
    }
  }, 15000);
}

function applyFantasyProsApiUpdate(update) {
  try {
    if (!update || Number(update.expertCount) !== 20 || !Array.isArray(update.rows)) {
      throw new Error('The companion did not provide a validated Top-20 rankings update.');
    }
    var override = buildFantasyProsTop20Override(update.rows, {
      name:'FantasyPros API · Top-20 PPR experts',
      lastModified:Date.parse(update.receivedAt) || Date.now()
    });
    saveState();
    localStorage.setItem(FANTASYPROS_LOCAL_OVERRIDE_KEY, JSON.stringify(override));
    setRankingsRefreshMessage('Validated ' + override.top20Count + ' API-ranked players from 20 experts. Reloading…', 'success');
    setTimeout(function() { window.location.reload(); }, 500);
  } catch (error) {
    setRankingsRefreshMessage(error && error.message ? error.message : String(error), 'error');
  }
}

function resetFantasyProsRankingOverride() {
  if (!activeFantasyProsLocalOverride) { setRankingsRefreshMessage('The embedded FantasyPros baseline is already active.', ''); return; }
  saveState();
  localStorage.removeItem(FANTASYPROS_LOCAL_OVERRIDE_KEY);
  setRankingsRefreshMessage('Restoring the checked-in FantasyPros baseline…', 'success');
  setTimeout(function() { window.location.reload(); }, 350);
}

function requestEspnRankingsRefresh() {
  var targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  window.postMessage({channel: ESPN_SYNC_CHANNEL, type: 'RANKINGS_REFRESH_REQUEST'}, targetOrigin);
  setRankingsRefreshMessage('Refresh requested. Keep the ESPN draft tab open while the companion reads board rank and PPR ADP.', 'working');
}

function updateRecommendedPick(sharedLiveState) {

  var el =
    document.getElementById(
      'recommended-pick-text'
    );


  if (!el) {

    return;

  }

  if (isDraftComplete()) {
    el._recommendationMarkup = null;
    renderDraftCompleteRecommendation(el);
    return;
  }


  /*
   * -------------------------------------------------------
   * BUILD LIVE DRAFT ENGINE STATE
   * -------------------------------------------------------
   */

  var state =
    sharedLiveState || buildLiveDraftDebugState();


  if (
    !state ||
    !state.scored ||
    !state.scored.length
  ) {

    el._recommendationMarkup = null;
    el.innerHTML =
      'No available players to recommend.';

    return;

  }


  /*
   * -------------------------------------------------------
   * PRIMARY ENGINE RECOMMENDATION
   * -------------------------------------------------------
   */

  var primary =
    state.scored[0];


  var recommendation =
    calculateDraftRecommendation(
      primary,
      state.scored,
      state.context
    );


  if (!recommendation) {

    el._recommendationMarkup = null;
    el.innerHTML =
      'Unable to build a recommendation.';

    return;

  }


  /*
   * -------------------------------------------------------
   * PHASE 6 — TURN PACKAGE INTELLIGENCE
   * -------------------------------------------------------
   */

recommendation =
  attachLiveTurnPackage(
    recommendation,
    state.context
  );


window.latestDraftRecommendation =
  recommendation;


var liveExplanation =
  buildRecommendationExplanation(
    recommendation,
    state.scored[0],
    state.scored[1] || null
  );


window.latestDraftExplanation =
  liveExplanation;

  /*
   * -------------------------------------------------------
   * PHASE 8 — ON-THE-CLOCK UI
   * -------------------------------------------------------
   */

  if (!liveExplanation) {

    el._recommendationMarkup = null;
    el.innerHTML =
      'Unable to build recommendation explanation.';

    return;

  }

  renderCompactRecommendationCard(el, recommendation, liveExplanation, primary, state);
  updateRecommendationAudit(recommendation, primary, state);
  return;


}

function buildPickContextHtml(
  state
) {

  if (
    !state ||
    !state.context
  ) {

    return '';

  }


  var teams =
    Number(
      state.context.teams
    ) ||
    Number(LEAGUE_SIZE) ||
    10;


  var currentPick =
    Number(
      state.context.currentPick
    ) || 0;


  var currentRound =
    currentPick > 0
      ? Math.ceil(
          currentPick / teams
        )
      : 0;


  var nextPick =
    Number(
      state.context.calculatedNextPick ||
      state.context.nextPick
    ) || 0;


  var picksBetween =
    Number(
      state.context.calculatedPicksUntilNext
    );


  /*
   * -------------------------------------------------------
   * FALLBACK TO SNAKE-PICK CALCULATION
   * -------------------------------------------------------
   */

  if (
    !nextPick ||
    !Number.isFinite(picksBetween)
  ) {

    var nextPickInfo =
      calculateMyNextDraftPick(
        currentPick,
        teams
      );


    if (nextPickInfo) {

      nextPick =
        Number(
          nextPickInfo.nextPick
        ) || nextPick;


      picksBetween =
        Number(
          nextPickInfo.picksBetween
        );

    }

  }


  if (!Number.isFinite(picksBetween)) {

    picksBetween =
      0;

  }


  var betweenLabel =
    picksBetween === 1
      ? '1 pick between'
      : picksBetween +
        ' picks between';


  /*
   * -------------------------------------------------------
   * BUILD UI
   * -------------------------------------------------------
   */

  var output =
    '<div style="' +
      'font-size:0.69rem;' +
      'color:#a9c2ab;' +
      'margin-bottom:9px;' +
      'line-height:1.35;' +
    '">';


  if (currentPick > 0) {

    output +=
      'Pick <b>#' +
      currentPick +
      '</b>';

  }


  if (currentRound > 0) {

    output +=
      ' &middot; Round <b>' +
      currentRound +
      '</b>';

  }


  if (nextPick > 0) {

    output +=
      ' &middot; Next <b>#' +
      nextPick +
      '</b>';

  }


  if (currentPick > 0) {

    output +=
      ' &middot; ' +
      betweenLabel;

  }


  output +=
    '</div>';


  return output;

}

function buildUrgencyIndicatorHtml(
  recommendation,
  primary,
  state
) {

  if (
    !recommendation ||
    !primary ||
    !state ||
    !state.context
  ) {

    return '';

  }

  if (
    recommendation.turnPackageActive
  ) {

    return (
      '<div style="' +
        'font-size:0.69rem;' +
        'font-weight:900;' +
        'margin-bottom:9px;' +
        'color:#a9c2ab;' +
      '">' +
        '&#10003; TURN SAFE &middot; no opponent picks between selections' +
      '</div>'
    );

  }

  var timingScore =
    Number(
      primary.timingScore
    ) || 0;

  var tierCliffScore =
    Number(
      primary.tierCliffOpportunityScore
    ) || 0;

  var scarcityScore =
    Number(
      primary.scarcityScore
    ) || 0;

  var picksBetween =
    Number(
      state.context.calculatedPicksUntilNext
    );

  if (!Number.isFinite(picksBetween)) {

    var teams =
      Number(
        state.context.teams
      ) || 10;

    var currentPick =
      Number(
        state.context.currentPick
      ) || 0;

    var nextPickInfo =
      calculateMyNextDraftPick(
        currentPick,
        teams
      );

    picksBetween =
      nextPickInfo
        ? Number(
            nextPickInfo.picksBetween
          )
        : 0;

  }

  var label =
    'LOW RISK TO WAIT';

  var symbol =
    '&#10003;';

  if (tierCliffScore >= 5) {

    label =
      'TIER CLIFF — ACT NOW';

    symbol =
      '&#9888;';

  } else if (timingScore >= 70) {

    label =
      'HIGH RISK TO WAIT';

    symbol =
      '&#9888;';

  } else if (
    timingScore >= 50 ||
    (
      scarcityScore >= 90 &&
      picksBetween >= 10
    )
  ) {

    label =
      'MODERATE RISK TO WAIT';

    symbol =
      '&#9888;';

  }

  return (
    '<div style="' +
      'font-size:0.69rem;' +
      'font-weight:900;' +
      'margin-bottom:9px;' +
      'color:#a9c2ab;' +
    '">' +
      symbol +
      ' ' +
      label +
    '</div>'
  );

}

function buildDraftIntelligenceHtml(
  primary,
  state
) {

  if (
    !primary ||
    !state ||
    !state.context
  ) {

    return '';

  }


  var context =
    state.context;


  var output =
    '';


  /*
   * -------------------------------------------------------
   * OPPONENT THREAT
   * -------------------------------------------------------
   *
   * Only show this when opponents actually pick before
   * our next selection.
   */

  var picksBetween =
    Number(
      context.calculatedPicksUntilNext
    );


  if (!Number.isFinite(picksBetween)) {

    var teams =
      Number(context.teams) || 10;

    var currentPick =
      Number(context.currentPick) || 0;

    var nextPickInfo =
      calculateMyNextDraftPick(
        currentPick,
        teams
      );


    picksBetween =
      nextPickInfo
        ? Number(
            nextPickInfo.picksBetween
          ) || 0
        : 0;

  }


  if (picksBetween > 0) {

    var threatSummary =
      summarizeOpponentDraftThreat(
        primary,
        context
      );


    if (
      threatSummary &&
      threatSummary.position
    ) {

      var threatLabel =
        threatSummary.label ||
        'LOW';


      var threatSymbol =
        threatLabel === 'HIGH'
          ? '&#9888;'
          : threatLabel === 'MODERATE'
            ? '&#9651;'
            : '&#10003;';


      output +=
        '<div style="' +
          'font-size:0.68rem;' +
          'line-height:1.35;' +
          'margin-bottom:5px;' +
          'color:#a9c2ab;' +
        '">' +

          threatSymbol +
          ' <b>OPPONENTS</b> &middot; ' +

          threatSummary.threateningTeams +
' team' +
(
  threatSummary.threateningTeams === 1
    ? ''
    : 's'
) +

' could target ' +
threatSummary.position +
' before your next pick' +

' &middot; ' +
threatLabel +
' DEMAND' +

        '</div>';

    }

  }


  /*
   * -------------------------------------------------------
   * LIVE POSITIONAL RUN
   * -------------------------------------------------------
   */

  var draftRuns =
    context.draftRuns;


  if (
    draftRuns &&
    draftRuns.isRun &&
    draftRuns.position
  ) {

    var runPosition =
      draftRuns.position;


    var runCount =
      Number(
        draftRuns.count
      ) || 0;


    var runStrength =
      draftRuns.strength ||
      'NONE';


    var startPick =
      Number(
        draftRuns.recentStartPick
      ) || 0;


    var endPick =
      Number(
        draftRuns.recentEndPick
      ) || 0;


    output +=
      '<div style="' +
        'font-size:0.68rem;' +
        'line-height:1.35;' +
        'margin-bottom:5px;' +
        'color:#a9c2ab;' +
      '">' +

        '&#9889; <b>' +
        runPosition +
        ' RUN</b> &middot; ' +

        runCount +
        ' ' +
        runPosition +
        (
          runCount === 1
            ? ''
            : 's'
        ) +
        ' taken' +

        (
          startPick > 0 &&
          endPick > 0
            ? ' in picks ' +
              startPick +
              '&ndash;' +
              endPick
            : ''
        ) +

        ' &middot; ' +
        runStrength +

      '</div>';

  }

  /*
 * -------------------------------------------------------
 * TIER & SCARCITY INTELLIGENCE
 * -------------------------------------------------------
 *
 * Only show information for the recommended player's
 * position.
 *
 * This keeps the On-the-Clock card focused instead of
 * reproducing the full Tier & Scarcity alert panel.
 */

var primaryPosition =
  primary.position ||
  primary.pos ||
  null;


if (
  primaryPosition &&
  ['QB', 'RB', 'WR', 'TE'].includes(
    primaryPosition
  )
) {

  var profiles =
    state.vorpResult &&
    Array.isArray(
      state.vorpResult.profiles
    )
      ? state.vorpResult.profiles
      : [];


  var playerPool =
    Array.isArray(
      state.players
    )
      ? state.players
      : [];


  var tierScarcityState =
    buildLiveTierScarcityState(
      playerPool,
      profiles
    );


  var positionState =
    tierScarcityState &&
    tierScarcityState.positions
      ? tierScarcityState.positions[
          primaryPosition
        ]
      : null;


  if (positionState) {

    /*
     * -------------------------------------------------------
     * CRITICAL CLIFF
     * -------------------------------------------------------
     */

    if (
      positionState.status ===
      'CRITICAL CLIFF'
    ) {

      output +=
        '<div style="' +
          'font-size:0.68rem;' +
          'line-height:1.35;' +
          'margin-bottom:5px;' +
          'color:#a9c2ab;' +
        '">' +

          '&#128680; <b>' +
          primaryPosition +
          ' CLIFF</b> &middot; ' +

          positionState.playersBeforeCliff +
          ' player' +
          (
            positionState.playersBeforeCliff === 1
              ? ''
              : 's'
          ) +
          ' remain before ' +

          (
            positionState.fromTier ||
            '?'
          ) +
          ' &rarr; ' +
          (
            positionState.toTier ||
            '?'
          ) +

          ' &middot; CRITICAL' +

        '</div>';


    /*
     * -------------------------------------------------------
     * TIER CLOSING
     * -------------------------------------------------------
     */

    } else if (
      positionState.status ===
      'TIER CLOSING'
    ) {

      output +=
        '<div style="' +
          'font-size:0.68rem;' +
          'line-height:1.35;' +
          'margin-bottom:5px;' +
          'color:#a9c2ab;' +
        '">' +

          '&#9888; <b>' +
          primaryPosition +
          ' TIER CLOSING</b> &middot; ' +

          positionState.playersBeforeCliff +
          ' player' +
          (
            positionState.playersBeforeCliff === 1
              ? ''
              : 's'
          ) +
          ' remain before the ' +

          (
            positionState.fromTier ||
            '?'
          ) +
          ' &rarr; ' +
          (
            positionState.toTier ||
            '?'
          ) +
          ' drop' +

        '</div>';


    /*
     * -------------------------------------------------------
     * HIGH SCARCITY
     * -------------------------------------------------------
     */

    } else if (
      positionState.status ===
      'HIGH SCARCITY'
    ) {

      output +=
        '<div style="' +
          'font-size:0.68rem;' +
          'line-height:1.35;' +
          'margin-bottom:5px;' +
          'color:#a9c2ab;' +
        '">' +

          '&#9888; <b>' +
          primaryPosition +
          ' SCARCITY</b> &middot; ' +

          'high-value ' +
          primaryPosition +
          ' depth is thin' +

        '</div>';


    /*
     * -------------------------------------------------------
     * LIMITED DEPTH
     * -------------------------------------------------------
     */

    } else if (
      positionState.status ===
      'LIMITED DEPTH'
    ) {

      output +=
        '<div style="' +
          'font-size:0.68rem;' +
          'line-height:1.35;' +
          'margin-bottom:5px;' +
          'color:#a9c2ab;' +
        '">' +

          '&#9651; <b>' +
          primaryPosition +
          ' DEPTH</b> &middot; ' +

          'remaining quality is becoming limited' +

        '</div>';


    /*
     * -------------------------------------------------------
     * HEALTHY DEPTH
     * -------------------------------------------------------
     */

    } else if (
      positionState.status ===
      'HEALTHY DEPTH'
    ) {

      output +=
        '<div style="' +
          'font-size:0.68rem;' +
          'line-height:1.35;' +
          'margin-bottom:5px;' +
          'color:#a9c2ab;' +
        '">' +

          '&#10003; <b>' +
          primaryPosition +
          ' DEPTH</b> &middot; ' +

          'waiting remains reasonable' +

        '</div>';

    }

  }

}

  if (!output) {

    return '';

  }


  return (
    '<div style="' +
      'margin-bottom:9px;' +
      'padding:7px 9px;' +
      'border-radius:8px;' +
      'background:rgba(255,255,255,0.025);' +
      'border:1px solid rgba(255,255,255,0.05);' +
    '">' +
      output +
    '</div>'
  );

}

var roundMarkerCache = {
  leagueSize: null,
  rowCount: 0,
  firstRow: null,
  lastRow: null
};


function addRoundMarkers(
  force
) {

  var rows =
    document.querySelectorAll(
      'tr.draftrow'
    );


  var firstRow =
    rows.length
      ? rows[0]
      : null;


  var lastRow =
    rows.length
      ? rows[
          rows.length - 1
        ]
      : null;


  /*
   * -------------------------------------------------------
   * FAST EXIT
   * -------------------------------------------------------
   *
   * Draft status changes do not affect player rounds.
   * If the rows and league size are unchanged, there is
   * nothing to recalculate.
   */

  if (
    !force &&
    roundMarkerCache.leagueSize ===
      LEAGUE_SIZE &&
    roundMarkerCache.rowCount ===
      rows.length &&
    roundMarkerCache.firstRow ===
      firstRow &&
    roundMarkerCache.lastRow ===
      lastRow
  ) {

    return;

  }


  roundMarkerCache.leagueSize =
    LEAGUE_SIZE;

  roundMarkerCache.rowCount =
    rows.length;

  roundMarkerCache.firstRow =
    firstRow;

  roundMarkerCache.lastRow =
    lastRow;


  rows.forEach(function(row) {

    var rkCell =
      row.children[0];


    if (!rkCell) {

      return;

    }


    /*
     * Use textContent instead of innerText.
     *
     * innerText can trigger expensive layout calculations.
     */

    var rawRank =
      rkCell.textContent ||
      '';


    var rk =
      parseInt(
        rawRank
          .replace(
            /Rd\d+/g,
            ''
          )
          .trim(),
        10
      );


    if (!rk) {

      return;

    }


    var round =
      Math.ceil(
        rk / LEAGUE_SIZE
      );

    /*
 * Players ranked beyond the league's actual
 * draft length are depth/watch-list players,
 * not a real draft round.
 */
if (round > TOTAL_ROUNDS) {

  var oldTag =
    rkCell.querySelector(
      '.round-tag'
    );

  if (oldTag) {
    oldTag.remove();
  }

  delete rkCell.dataset.roundMarker;

  return;
}

    /*
     * Store the current round on the cell so we avoid
     * rewriting the DOM if nothing changed.
     */

    if (
      Number(
        rkCell.dataset.roundMarker
      ) === round
    ) {

      return;

    }


    var existing =
      rkCell.querySelector(
        '.round-tag'
      );


    if (!existing) {

      existing =
        document.createElement(
          'div'
        );

      existing.className =
        'round-tag';


      rkCell.appendChild(
        existing
      );

    }


    existing.textContent =
      'Rd' + round;


    rkCell.dataset.roundMarker =
      String(round);

  });

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
    updateTierFilterExpansion('');
    updateNextPickMarker();
    refreshDraftRowAccessibility();
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

  updateTierFilterExpansion(q);
  updateNextPickMarker();
  refreshDraftRowAccessibility(searchMatches[0] || null);
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
  updateDataFreshnessIndicator();

  var draftSettingsDetails = document.getElementById('draft-settings-details');
  if (draftSettingsDetails) {
    draftSettingsDetails.open = !window.matchMedia('(max-width: 768px)').matches;
  }

  var boardPressureDetails = document.getElementById('board-pressure-details');
  if (boardPressureDetails) {
    boardPressureDetails.open = !window.matchMedia('(max-width: 768px)').matches;
  }

  ['pcTeams', 'pcSlot', 'pcRounds'].forEach(function(id) {
    var el = document.getElementById(id);

    if (el) {
      el.addEventListener('change', updatePickSettings);
      el.addEventListener('input', updatePickSettings);
    }
  });


  /*
   * Build the authoritative 2026 expert board
   * BEFORE restoring saved draft state.
   */
  build2026ExpertBoardStructure();

  initializeTierSectionOrganization();
  setupDraftBoardInteractions();
  setupDraftMarkModeShortcut();
  initializeDraftSessions();


  /*
   * Restore league settings and drafted/taken
   * state onto the rebuilt board.
   */
  loadState();
  renderAutoDraftTeamToggles();
  refreshDraftRowAccessibility();

}

function runAppInitialization() {

  try {
    initApp();
  } catch (err) {
    console.error(
      'Initialization failed inside initApp():',
      err
    );
  }

}


/*
 * Run initialization whether this script loads
 * before or after DOMContentLoaded.
 */
if (document.readyState === 'loading') {

  document.addEventListener(
    'DOMContentLoaded',
    runAppInitialization,
    { once: true }
  );

} else {

  runAppInitialization();

}
  
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
  var completedPicks = getCompletedDraftPickCount();

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

function getDraftPhase(
  currentPick,
  teams
) {

  currentPick =
    Number(currentPick) || 0;

  teams =
    Number(teams) || 10;

  if (
    currentPick <= 0 ||
    teams <= 0
  ) {

    return {
      round: 0,
      phase: 'UNKNOWN'
    };

  }


  /*
   * -------------------------------------------------------
   * CURRENT ROUND
   * -------------------------------------------------------
   */

  var round =
    Math.ceil(
      currentPick / teams
    );


  /*
   * -------------------------------------------------------
   * DRAFT PHASE
   * -------------------------------------------------------
   *
   * FOUNDATION
   *   Rounds 1–3
   *
   * STARTER BUILD
   *   Rounds 4–7
   *
   * VALUE / DEPTH
   *   Rounds 8–11
   *
   * UPSIDE / ENDGAME
   *   Round 12+
   */

  var phase;

  if (round <= 3) {

    phase =
      'FOUNDATION';

  } else if (round <= 7) {

    phase =
      'STARTER BUILD';

  } else if (round <= 11) {

    phase =
      'VALUE / DEPTH';

  } else {

    phase =
      'UPSIDE / ENDGAME';

  }


  return {
    round:
      round,

    phase:
      phase
  };
}

function getDraftPhaseWeights(
  phase
) {

  phase =
    phase || 'UNKNOWN';


  /*
   * All values are multipliers.
   *
   * 1.00 = neutral
   * >1.00 = emphasize
   * <1.00 = de-emphasize
   */

  var weights = {
    vorp:
      1,

    scarcity:
      1,

    rosterNeed:
      1,

    rosterConstruction:
      1,

    futureDepth:
      1,

    tierCliff:
      1,

    draftAwareVorp:
      1,

    multiPick:
      1
  };


  if (phase === 'FOUNDATION') {

    weights.vorp =
      1.10;

    weights.scarcity =
      1.05;

    weights.rosterNeed =
      0.85;

    weights.rosterConstruction =
      0.90;

    weights.futureDepth =
      1.05;

    weights.tierCliff =
      1.10;


  } else if (phase === 'STARTER BUILD') {

    weights.vorp =
      1.00;

    weights.scarcity =
      1.00;

    weights.rosterNeed =
      1.15;

    weights.rosterConstruction =
      1.20;

    weights.futureDepth =
      1.10;

    weights.tierCliff =
      1.05;


  } else if (phase === 'VALUE / DEPTH') {

    weights.vorp =
      1.10;

    weights.scarcity =
      1.10;

    weights.rosterNeed =
      1.10;

    weights.rosterConstruction =
      1.00;

    weights.futureDepth =
      1.10;

    weights.draftAwareVorp =
      1.10;


  } else if (phase === 'UPSIDE / ENDGAME') {

    weights.vorp =
      1.15;

    weights.scarcity =
      1.05;

    weights.rosterNeed =
      0.95;

    weights.rosterConstruction =
      0.90;

    weights.futureDepth =
      0.90;

    weights.multiPick =
      0.75;

  }


  return weights;
}

function getMyRemainingDraftPicks(
  currentPick,
  teams,
  rounds,
  draftSlot
) {

  currentPick =
    Number(currentPick) || 0;

  teams =
    Number(teams) || 10;

  rounds =
    Number(rounds) || 16;

  draftSlot =
    Number(draftSlot) || 1;

  var totalPicks =
    teams * rounds;

  var picks = [];

  for (
    var pick = currentPick;
    pick <= totalPicks;
    pick++
  ) {

    var mapping =
      getSnakeDraftTeamForPick(
        pick,
        teams
      );

    if (
      mapping &&
      Number(mapping.teamSlot) ===
        draftSlot
    ) {

      picks.push(
        pick
      );

    }

  }

  return picks;
}

function getMandatoryEndgamePositions(
  context
) {

  context =
    context || {};


  /*
   * Cache this during one scoring pass.
   */

  if (
    Array.isArray(
      context._mandatoryEndgamePositions
    )
  ) {

    return context._mandatoryEndgamePositions;

  }


  var state =
    context.draftState ||
    getDraftAssistantState();

  var currentPick =
    Number(context.currentPick) ||
    Number(state.currentPick) ||
    0;

  var teams =
    Number(context.teams) ||
    Number(state.teams) ||
    10;

  var rounds =
    Number(context.rounds) ||
    Number(state.rounds) ||
    16;

  var draftSlot =
    Number(context.draftSlot) ||
    Number(state.draftSlot) ||
    1;


  if (
    currentPick <= 0
  ) {

    context._mandatoryEndgamePositions = [];

    return [];
  }


  /*
   * -------------------------------------------------------
   * WHICH REQUIRED POSITIONS ARE MISSING?
   * -------------------------------------------------------
   */

  var counts = context.rosterCounts || getDraftAssistantRosterState().counts;


  var missing = [];

  if (counts.K <= 0) {
    missing.push('K');
  }

  if (counts.DST <= 0) {
    missing.push('DST');
  }


  if (!missing.length) {

    context._mandatoryEndgamePositions = [];

    return [];

  }


  /*
   * -------------------------------------------------------
   * OUR REMAINING PICKS
   * -------------------------------------------------------
   */

  var remainingPicks =
    getMyRemainingDraftPicks(
      currentPick,
      teams,
      rounds,
      draftSlot
    );


  if (!remainingPicks.length) {

    context._mandatoryEndgamePositions = [];

    return [];

  }


  /*
   * Future opportunities AFTER the current selection.
   */

  var futurePicks =
    remainingPicks.slice(1);


  /*
   * -------------------------------------------------------
   * POSITION AVAILABILITY DEADLINES
   * -------------------------------------------------------
   *
   * Because simulator opponents draft roughly by rank,
   * use the latest-ranked remaining K/DST as the last
   * reasonable point where that position can survive.
   */

  var players =
    context.players ||
    getDraftAssistantPlayers();


  var deadlines =
    missing
      .map(function(position) {

        var available =
          players
            .filter(function(player) {

              return (
                player &&
                player.available !== false &&
                player.position === position &&
                Number(player.rank) > 0
              );

            });


        if (!available.length) {

          return {
            position:
              position,

            deadline:
              currentPick
          };

        }


        var latestRank =
          Math.max.apply(
            null,
            available.map(function(player) {

              return (
                Number(player.rank) || 0
              );

            })
          );


        return {
          position:
            position,

          deadline:
            Math.max(
              currentPick,
              latestRank
            )
        };

      })
      .sort(function(a, b) {

        return (
          Number(a.deadline) -
          Number(b.deadline)
        );

      });


  /*
   * -------------------------------------------------------
   * CAN ALL MISSING POSITIONS WAIT?
   * -------------------------------------------------------
   *
   * Try assigning each missing required position to
   * one of our FUTURE picks before its availability
   * deadline.
   *
   * If that schedule cannot work, the current pick
   * must be reserved.
   */

  var futureIndex = 0;

  var futureSchedulePossible =
    true;


  for (
    var i = 0;
    i < deadlines.length;
    i++
  ) {

    var requirement =
      deadlines[i];


    if (
      futureIndex >=
      futurePicks.length
    ) {

      futureSchedulePossible =
        false;

      break;
    }


    if (
      Number(
        futurePicks[futureIndex]
      ) <=
      Number(
        requirement.deadline
      )
    ) {

      futureIndex++;

    } else {

      futureSchedulePossible =
        false;

      break;

    }

  }


  if (futureSchedulePossible) {

    context._mandatoryEndgamePositions = [];

    return [];

  }


  /*
   * -------------------------------------------------------
   * CURRENT PICK MUST BE RESERVED
   * -------------------------------------------------------
   *
   * Choose the position(s) with the earliest deadline.
   */

  var earliestDeadline =
    Number(
      deadlines[0].deadline
    );


  var mandatory =
    deadlines
      .filter(function(item) {

        return (
          Number(item.deadline) ===
          earliestDeadline
        );

      })
      .map(function(item) {

        return item.position;

      });


  context._mandatoryEndgamePositions =
    mandatory;


  return mandatory;
}

function calculateMandatoryEndgameAdjustment(
  player,
  context
) {

  if (!player) {
    return 0;
  }


  var mandatory =
    getMandatoryEndgamePositions(
      context
    );


  if (!mandatory.length) {
    return 0;
  }


  var position =
    player.position ||
    player.pos;


  /*
   * This is intentionally decisive.
   *
   * Once we've reached the last safe opportunity,
   * roster completion is no longer optional.
   */

  if (
    mandatory.indexOf(
      position
    ) !== -1
  ) {

    return 100;

  }


  return -100;
}

function calculatePhaseCoreAdjustment(
  vorpScore,
  scarcityScore,
  rosterNeedScore,
  phaseWeights
) {

  phaseWeights =
    phaseWeights || {};

  vorpScore =
    Number(vorpScore) || 0;

  scarcityScore =
    Number(scarcityScore) || 0;

  rosterNeedScore =
    Number(rosterNeedScore) || 0;


  /*
   * -------------------------------------------------------
   * PHASE CORE ADJUSTMENT
   * -------------------------------------------------------
   *
   * Important:
   *
   * Do NOT directly multiply the full score.
   *
   * Instead, only apply the amount that differs
   * from a neutral 1.00 multiplier.
   *
   * This keeps draft phase as a nudge rather than
   * allowing it to overwhelm the core engine.
   */


  var vorpAdjustment =
    vorpScore *
    (
      (Number(phaseWeights.vorp) || 1) -
      1
    ) *
    0.20;


  var scarcityAdjustment =
    scarcityScore *
    (
      (Number(phaseWeights.scarcity) || 1) -
      1
    ) *
    0.20;


  /*
   * Roster need is usually already a smaller score,
   * so give it slightly more sensitivity.
   */

  var rosterNeedAdjustment =
    rosterNeedScore *
    (
      (Number(phaseWeights.rosterNeed) || 1) -
      1
    ) *
    0.50;


  var totalAdjustment =
    vorpAdjustment +
    scarcityAdjustment +
    rosterNeedAdjustment;


  /*
   * -------------------------------------------------------
   * SAFETY CLAMP
   * -------------------------------------------------------
   */

  totalAdjustment =
    Math.max(
      -3,
      Math.min(
        3,
        totalAdjustment
      )
    );


  return {
    total:
      Number(
        totalAdjustment.toFixed(2)
      ),

    vorp:
      Number(
        vorpAdjustment.toFixed(2)
      ),

    scarcity:
      Number(
        scarcityAdjustment.toFixed(2)
      ),

    rosterNeed:
      Number(
        rosterNeedAdjustment.toFixed(2)
      )
  };
}


/* ---------------------------------------------------------
   ROSTER STATE
   --------------------------------------------------------- */

function getDraftAssistantRosterState() {
  var starterLimits = getConfiguredStarterLimits();
  var counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };
  var byeCounts = {};

  document.querySelectorAll(
    'tr.draftrow.drafted-mine'
  ).forEach(function(row) {

    var pos = row.getAttribute('data-pos');

    if (counts[pos] !== undefined) {
      counts[pos]++;
    }
    var bye = String(row.getAttribute('data-bye') || '').trim();
    if (bye && bye !== '--' && bye !== '-' && bye !== '0') {
      byeCounts[bye] = (byeCounts[bye] || 0) + 1;
    }
  });

  var required = getConfiguredDedicatedStarterLimits();

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

  var requiredFlexEligiblePlayers = getConfiguredFlexEligibleThreshold();

  needs.FLEX =
    flexEligiblePlayers < requiredFlexEligiblePlayers;

  return {
    counts: counts,
    required: required,
    needs: needs,
    flexEligiblePlayers: flexEligiblePlayers,
    requiredFlexEligiblePlayers: requiredFlexEligiblePlayers,
    byeCounts: byeCounts
  };
}


/* ---------------------------------------------------------
   AVAILABLE PLAYERS
   --------------------------------------------------------- */

function getDraftRowNumber(row, attributeName) {
  var rawValue = row.getAttribute(attributeName);

  if (rawValue == null || rawValue === '') {
    return null;
  }

  var value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function getDraftAssistantPlayers() {
  var players = [];
  var starterLimits = {
    QB: getConfiguredStarterSlots('QB'),
    RB: getConfiguredStarterSlots('RB'),
    WR: getConfiguredStarterSlots('WR'),
    TE: getConfiguredStarterSlots('TE'),
    FLEX: getConfiguredStarterSlots('FLEX'),
    K: getConfiguredStarterSlots('K'),
    DST: getConfiguredStarterSlots('DST')
  };

  getCachedDraftRows().forEach(function(row) {

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
      getDraftRowDisplayName(row) ||
      row.getAttribute('data-name') ||
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
var boardRank = rankMatch ? parseInt(rankMatch[0], 10) : null;
var ecr = getDraftRowNumber(row, 'data-ecr');
var adp = getDraftRowNumber(row, 'data-adp');
var adpRank = getDraftRowNumber(row, 'data-adp-rank');
var realTimeAdp = getDraftRowNumber(row, 'data-realtime-adp');
var espnAdp = getDraftRowNumber(row, 'data-espn-adp');
var espnRank = getDraftRowNumber(row, 'data-espn-rank');
var rank = ecr != null ? ecr : boardRank;

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
      boardRank: boardRank,
      ecr: ecr,
      adp: adp,
      adpRank: adpRank,
      realTimeAdp: realTimeAdp,
      espnAdp: espnAdp,
      espnRank: espnRank,
      bye: String(row.getAttribute('data-bye') || '').trim(),
      fantasyProsTier: getDraftRowNumber(row, 'data-fantasypros-tier'),
      semanticTier: row.getAttribute('data-semantic-tier') ||
        row.getAttribute('data-consensus-tier') ||
        '',
      source: row.getAttribute('data-player-source') || '',
      posRank: getDraftRowNumber(row, 'data-pos-rank'),
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

function hasAuthoritativeEcr(player) {
  if (!player) return false;

  var ecr = Number(player.ecr);
  if (Number.isFinite(ecr) && ecr > 0) return true;

  /* Unit-test fixtures predate source metadata; production ADP-only rows do not. */
  return player.source !== 'ADP_ONLY' && Number(player.rank) > 0;
}

function isRecommendationRosterEligible(player, rosterCounts) {
  if (!player) return false;
  var position = player.position || player.pos || '';
  var cap = Number(RECOMMENDATION_POSITION_CAPS[position]);
  if (!Number.isFinite(cap)) return true;
  return (Number(rosterCounts && rosterCounts[position]) || 0) < cap;
}


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
        player.rank &&
        hasAuthoritativeEcr(player);
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
        player.rank &&
        hasAuthoritativeEcr(player);
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

  /*
   * -------------------------------------------------------
   * REPLACEMENT LEVEL MODEL
   * -------------------------------------------------------
   *
   * Replacement level represents the player we expect
   * to be available at the edge of the league's starting
   * demand.
   *
   * Example in a 10-team league:
   *
   * QB  = 10 starters
   * RB  = 20 starters
   * WR  = 20 starters
   * TE  = 10 starters
   *
   * FLEX is shared between RB / WR / TE and is handled
   * separately below.
   *
   * Waiting risk is modeled separately by
   * calculateDraftAwareVorpOpportunity().
   */

  /*
   * -------------------------------------------------------
   * BUILD POSITION POOLS
   * -------------------------------------------------------
   */

  var positionPools = {};

  ['QB', 'RB', 'WR', 'TE'].forEach(function(position) {

    positionPools[position] =
      players
        .filter(function(player) {

          return player &&
            player.available &&
            player.position === position &&
            hasAuthoritativeEcr(player) &&
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
   * VORP is a current player-value measurement. Keep the
   * replacement pool anchored to currently available ECR
   * players; the separate draft-aware opportunity model is
   * responsible for projecting losses before the next pick.
   */
  var projectedPositionPools = {};

  ['QB', 'RB', 'WR', 'TE'].forEach(function(position) {
    projectedPositionPools[position] = (positionPools[position] || []).slice();
  });


  /*
   * -------------------------------------------------------
   * POSITION REPLACEMENT LEVELS
   * -------------------------------------------------------
   *
   * IMPORTANT:
   *
   * We do NOT use pool[0].
   *
   * The replacement index is based on league demand.
   *
   * settings.QB = 10
   * settings.RB = 20
   * settings.WR = 20
   * settings.TE = 10
   *
   * Since arrays are zero-indexed, the replacement player
   * is at index demand - 1.
   */

  var replacement = {};

  ['QB', 'RB', 'WR', 'TE'].forEach(function(position) {

    var pool =
      projectedPositionPools[position] || [];

    var demand =
      Number(settings[position]) || 0;

    var replacementIndex =
      Math.max(
        0,
        demand - 1
      );

    replacement[position] =
      pool[replacementIndex] ||
      pool[pool.length - 1] ||
      null;

  });


  /*
   * -------------------------------------------------------
   * FLEX REPLACEMENT
   * -------------------------------------------------------
   *
   * FLEX is shared by RB / WR / TE.
   *
   * We don't want the best RB/WR/TE.
   *
   * Instead, approximate the FLEX replacement by taking
   * the player around the combined starting-demand edge.
   */

  var flexPool = [];

  ['RB', 'WR', 'TE'].forEach(function(position) {

    flexPool =
      flexPool.concat(
        projectedPositionPools[position] || []
      );

  });

  flexPool.sort(function(a, b) {

    return Number(a.rank) -
           Number(b.rank);

  });


  /*
   * The base RB/WR/TE demand already represents the
   * dedicated starting positions.
   *
   * FLEX adds one additional eligible player per team.
   */

  var flexDemand =
    Number(settings.FLEX) || 0;

  var flexIndex =
    (
      Number(settings.RB) || 0
    ) +
    (
      Number(settings.WR) || 0
    ) +
    (
      Number(settings.TE) || 0
    ) +
    flexDemand -
    1;

  flexIndex =
    Math.max(
      0,
      flexIndex
    );


  replacement.FLEX =
    flexPool[flexIndex] ||
    flexPool[flexPool.length - 1] ||
    null;


  /*
   * -------------------------------------------------------
   * DEBUG
   * -------------------------------------------------------
   */

  draftScoringLog(
  'CURRENT REPLACEMENT LEVELS:',
  {
    settings:
      settings,

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

  if (
    !player ||
    !player.rank ||
    !replacement ||
    !replacement.rank
  ) {
    return 0;
  }

  var playerRank =
    Number(player.rank);

  var replacementRank =
    Number(replacement.rank);

  if (
    playerRank <= 0 ||
    replacementRank <= 0 ||
    playerRank >= replacementRank
  ) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * RANK-BASED VORP
   * -------------------------------------------------------
   *
   * We do not have fantasy-point projections in the player
   * data, so use positional rank distance as a proxy.
   *
   * Larger distance above replacement =
   * greater value over replacement.
   */


  var rankGap =
    replacementRank -
    playerRank;


  /*
   * Maximum possible gap within this position.
   *
   * A rank-1 player receives the maximum VORP
   * available for that position.
   */

  var maximumGap =
    replacementRank - 1;


  if (maximumGap <= 0) {
    return 0;
  }


  /*
   * Normalize to 0-100.
   */

  var vorp =
    (
      rankGap /
      maximumGap
    ) * 100;


  /*
   * -------------------------------------------------------
   * ELITE SEPARATION
   * -------------------------------------------------------
   *
   * Give the very top players a small additional
   * distinction without allowing the number to explode.
   */

  if (playerRank <= 3) {

    vorp += 5;

  } else if (playerRank <= 5) {

    vorp += 3;

  } else if (playerRank <= 10) {

    vorp += 1;

  }


  /*
   * Clamp.
   */

  vorp =
    Math.max(
      0,
      Math.min(
        100,
        vorp
      )
    );


  draftScoringLog(
    'RANK-BASED VORP:',
    player.name,
    'position =',
    player.position,
    'playerRank =',
    playerRank,
    'replacementRank =',
    replacementRank,
    'rankGap =',
    rankGap,
    'vorp =',
    vorp
  );


  return vorp;
}
/*
 * Calculate tier/drop-off information.
 *
 * This uses the existing tier information from
 * the player's row whenever available.
 */
function calculateTierDrop(player, players, sharedContext) {
  if (!player || !player.rank) {
    return {score: 0, nextPlayer: null, rankGap: 0};
  }

  var cacheKey = String(player.name || '').toLowerCase();
  var nextPlayer;

  if (
    sharedContext &&
    sharedContext.tierDropNextByName &&
    Object.prototype.hasOwnProperty.call(sharedContext.tierDropNextByName, cacheKey)
  ) {
    nextPlayer = sharedContext.tierDropNextByName[cacheKey];
  } else {
    nextPlayer = players
      .filter(function(candidate) {
        return candidate.available &&
          candidate.position === player.position &&
          candidate.rank &&
          hasAuthoritativeEcr(candidate) &&
          candidate.rank > player.rank;
      })
      .sort(function(a, b) { return a.rank - b.rank; })[0] || null;
  }

  if (!nextPlayer) {
    return {score: 100, nextPlayer: null, rankGap: 0};
  }

  var rankGap = nextPlayer.rank - player.rank;
  return {
    score: Math.min(100, rankGap * 10),
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
          player.rank &&
          hasAuthoritativeEcr(player);

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

  var tierRank = SEMANTIC_TIER_ORDER;


  function getTierId(player) {

    try {

      var tier =
        getPlayerTierValue(
          player
        );

      if (tier && tier.semanticTier) {

        return tier.semanticTier;

      }

    } catch (e) {}

    return (
      LEGACY_TO_SEMANTIC_TIER[player.tier] ||
      player.semanticTier ||
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

  draftScoringLog(
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
 * =======================================================
 * PHASE 10 — LIVE TIER & SCARCITY STATE
 * =======================================================
 *
 * Builds a single standardized snapshot describing the
 * current health of QB, RB, WR, and TE.
 *
 * IMPORTANT:
 *
 * This function does NOT create new scoring logic.
 *
 * It consumes the tier-cliff and VORP/scarcity information
 * already produced by the Draft Decision Engine.
 *
 * The UI can later consume this object without needing to
 * understand how tier cliffs or scarcity are calculated.
 */
function buildLiveTierScarcityState(
  players,
  vorpProfiles
) {

  players =
    Array.isArray(players)
      ? players
      : [];

  vorpProfiles =
    Array.isArray(vorpProfiles)
      ? vorpProfiles
      : [];


  var positions = [
    'QB',
    'RB',
    'WR',
    'TE'
  ];


  var state = {
    positions: {},
    alerts: [],
    generatedAtPick: null
  };


  /*
   * -------------------------------------------------------
   * CURRENT PICK
   * -------------------------------------------------------
   */

  try {

    var draftState =
      getDraftAssistantState();

    state.generatedAtPick =
      draftState &&
      Number(
        draftState.currentPick
      )
        ? Number(
            draftState.currentPick
          )
        : null;

  } catch (e) {

    state.generatedAtPick =
      null;

  }


  /*
   * -------------------------------------------------------
   * BUILD EACH POSITION
   * -------------------------------------------------------
   */

  positions.forEach(function(position) {

    var availableAtPosition =
      players
        .filter(function(player) {

          return (
            player &&
            player.available !== false &&
            (
              player.position ||
              player.pos
            ) === position
          );

        })
        .slice()
        .sort(function(a, b) {

          return (
            (Number(a.rank) || 9999) -
            (Number(b.rank) || 9999)
          );

        });


    /*
     * -------------------------------------------------------
     * TIER CLIFF
     * -------------------------------------------------------
     */

    var cliff =
      calculatePositionTierCliff(
        position,
        players,
        vorpProfiles
      );


    /*
     * -------------------------------------------------------
     * BEST AVAILABLE PLAYER
     * -------------------------------------------------------
     */

    var bestAvailable =
      availableAtPosition[0] ||
      null;


    /*
     * -------------------------------------------------------
     * SCARCITY
     * -------------------------------------------------------
     *
     * Reuse the scarcity value already calculated by the
     * VORP engine for the best available player.
     */

    var scarcity =
      0;


    if (bestAvailable) {

      var bestProfile =
        vorpProfiles.find(
          function(profile) {

            if (
              !profile ||
              !profile.player
            ) {
              return false;
            }

            return (
              profile.player ===
                bestAvailable ||
              (
                profile.player.name &&
                bestAvailable.name &&
                profile.player.name ===
                  bestAvailable.name
              )
            );

          }
        );


      if (bestProfile) {

        scarcity =
          Number(
            bestProfile.scarcity
          ) || 0;

      } else {

        /*
         * Some callers may pass player objects that already
         * contain the calculated scarcity value.
         */

        scarcity =
          Number(
            bestAvailable.scarcity
          ) || 0;

      }

    }


    /*
     * -------------------------------------------------------
     * CLIFF INFORMATION
     * -------------------------------------------------------
     */

    var severity =
      cliff &&
      cliff.severity
        ? cliff.severity
        : 'NONE';


    var playersBeforeCliff =
      cliff &&
      Number.isFinite(
        Number(
          cliff.playersBeforeCliff
        )
      )
        ? Number(
            cliff.playersBeforeCliff
          )
        : 0;


    var beforePlayer =
      cliff &&
      cliff.beforePlayer
        ? cliff.beforePlayer
        : null;


    var afterPlayer =
      cliff &&
      cliff.afterPlayer
        ? cliff.afterPlayer
        : null;


    /*
     * -------------------------------------------------------
     * STATUS
     * -------------------------------------------------------
     *
     * This is intentionally descriptive rather than a new
     * draft-score adjustment.
     */

    var status =
  'HEALTHY DEPTH';


/*
 * -------------------------------------------------------
 * CRITICAL CLIFF
 * -------------------------------------------------------
 *
 * Reserve this for genuinely severe, immediate drops.
 */

if (
  severity === 'HIGH' &&
  playersBeforeCliff <= 2
) {

  status =
    'CRITICAL CLIFF';


/*
 * -------------------------------------------------------
 * HIGH-SEVERITY TIER CLOSING
 * -------------------------------------------------------
 */

} else if (
  severity === 'HIGH'
) {

  status =
    'TIER CLOSING';


/*
 * -------------------------------------------------------
 * MODERATE TIER CLOSING
 * -------------------------------------------------------
 *
 * A moderate tier transition should only become a
 * live alert when the position is ALSO meaningfully
 * scarce.
 *
 * This prevents healthy positions such as QB from
 * generating an alert just because the next player
 * happens to be in a lower tier.
 */

} else if (
  severity === 'MODERATE' &&
  playersBeforeCliff <= 3 &&
  scarcity >= 75
) {

  status =
    'TIER CLOSING';


/*
 * -------------------------------------------------------
 * PURE SCARCITY
 * -------------------------------------------------------
 */

} else if (
  scarcity >= 90
) {

  status =
    'HIGH SCARCITY';

} else if (
  scarcity >= 75
) {

  status =
    'LIMITED DEPTH';

}


    /*
     * -------------------------------------------------------
     * POSITION SNAPSHOT
     * -------------------------------------------------------
     */

    var positionState = {

      position:
        position,

      availableCount:
        availableAtPosition.length,

      bestAvailable:
        bestAvailable,

      bestAvailableName:
        bestAvailable &&
        bestAvailable.name
          ? bestAvailable.name
          : null,

      scarcity:
        Number(
          scarcity.toFixed(2)
        ),

      cliffSeverity:
        severity,

      cliffScore:
        cliff
          ? Number(
              cliff.cliffScore
            ) || 0
          : 0,

      playersBeforeCliff:
        playersBeforeCliff,

      playersAfterCliff:
        cliff
          ? Number(
              cliff.playersAfterCliff
            ) || 0
          : 0,

      fromTier:
        cliff
          ? cliff.fromTier
          : null,

      toTier:
        cliff
          ? cliff.toTier
          : null,

      beforePlayer:
        beforePlayer,

      beforePlayerName:
        beforePlayer &&
        beforePlayer.name
          ? beforePlayer.name
          : null,

      afterPlayer:
        afterPlayer,

      afterPlayerName:
        afterPlayer &&
        afterPlayer.name
          ? afterPlayer.name
          : null,

      status:
        status

    };


    state.positions[position] =
      positionState;


    /*
     * -------------------------------------------------------
     * ALERT COLLECTION
     * -------------------------------------------------------
     *
     * Only meaningful pressure states become alerts.
     *
     * HEALTHY DEPTH intentionally stays out of the alert
     * collection. We can display healthy positions
     * separately in Phase 10B.
     */

    if (
      status !==
      'HEALTHY DEPTH'
    ) {

      state.alerts.push(
        positionState
      );

    }

  });


  /*
   * -------------------------------------------------------
   * ALERT PRIORITY
   * -------------------------------------------------------
   */

  var statusPriority = {

    'CRITICAL CLIFF': 5,
    'TIER CLOSING': 4,
    'HIGH SCARCITY': 3,
    'LIMITED DEPTH': 2,
    'HEALTHY DEPTH': 1

  };


  state.alerts.sort(
    function(a, b) {

      var aPriority =
        statusPriority[
          a.status
        ] || 0;

      var bPriority =
        statusPriority[
          b.status
        ] || 0;


      if (
        aPriority !==
        bPriority
      ) {

        return (
          bPriority -
          aPriority
        );

      }


      /*
       * Same alert category:
       * prefer the stronger cliff/scarcity signal.
       */

      var aPressure =
        Math.max(
          Number(a.cliffScore) || 0,
          Number(a.scarcity) || 0
        );

      var bPressure =
        Math.max(
          Number(b.cliffScore) || 0,
          Number(b.scarcity) || 0
        );


      return (
        bPressure -
        aPressure
      );

    }
  );


  return state;

}

function debugTierScarcityState() {

  var liveState =
    buildLiveDraftDebugState();

  if (
    !liveState ||
    !liveState.players
  ) {

    console.warn(
      'Unable to build live draft state.'
    );

    return null;

  }


  var profiles =
    liveState.vorpResult &&
    Array.isArray(
      liveState.vorpResult.profiles
    )
      ? liveState.vorpResult.profiles
      : [];


  var tierScarcityState =
    buildLiveTierScarcityState(
      liveState.players,
      profiles
    );


  console.group(
    'PHASE 10 — TIER & SCARCITY'
  );


  console.log(
    'Generated at pick:',
    tierScarcityState.generatedAtPick
  );


  [
    'QB',
    'RB',
    'WR',
    'TE'
  ].forEach(function(position) {

    var result =
      tierScarcityState
        .positions[position];

    if (!result) {
      return;
    }


    console.log(
      position,
      {
        status:
          result.status,

        bestAvailable:
          result.bestAvailableName,

        scarcity:
          result.scarcity,

        cliffSeverity:
          result.cliffSeverity,

        cliffScore:
          result.cliffScore,

        playersBeforeCliff:
          result.playersBeforeCliff,

        tierTransition:
          (
            result.fromTier ||
            'N/A'
          ) +
          ' → ' +
          (
            result.toTier ||
            'N/A'
          ),

        beforePlayer:
          result.beforePlayerName,

        afterPlayer:
          result.afterPlayerName,

        available:
          result.availableCount
      }
    );

  });


  console.log(
    'ACTIVE ALERTS:',
    tierScarcityState.alerts
  );


  console.groupEnd();


  window.latestTierScarcityState =
    tierScarcityState;


  return tierScarcityState;

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

  if (!player || !player.rank || !hasAuthoritativeEcr(player) || !Array.isArray(players)) {
    return 0;
  }

  /*
   * -------------------------------------------------------
   * LOCAL ECR DEPTH
   * -------------------------------------------------------
   *
   * VORP already measures distance above replacement.
   * Scarcity should answer a different question: how large
   * is the ECR drop across the best few options currently
   * available at this position?
   *
   * Every candidate at a position receives the same pool-
   * pressure score. This prevents a lower-ECR player from
   * leapfrogging a better player at the same position merely
   * because the lower player happens to sit above a local gap.
   */

  var positionPlayers = players
    .filter(function(candidate) {
      return candidate && candidate.available !== false &&
        candidate.position === player.position &&
        candidate.rank &&
        hasAuthoritativeEcr(candidate);
    })
    .slice()
    .sort(function(a, b) {
      return Number(a.rank) - Number(b.rank);
    })
    .slice(0, 5);

  if (positionPlayers.length < 2) return 100;

  var gaps = [];
  for (var index = 1; index < positionPlayers.length; index++) {
    gaps.push(Math.max(0, Math.min(20,
      Number(positionPlayers[index].rank) - Number(positionPlayers[index - 1].rank)
    )));
  }

  var immediateGap = gaps[0] || 0;
  var averageGap = gaps.reduce(function(total, gap) { return total + gap; }, 0) / gaps.length;
  var scarcity = (immediateGap * 8) + (averageGap * 4);

  scarcity =
    Math.max(
      0,
      Math.min(
        100,
        scarcity
      )
    );

  draftScoringLog(
    'SCARCITY CALC:',
    player.name,
    'position =',
    player.position || player.pos,
    'bestAvailableEcrGap =',
    immediateGap,
    'averageNearbyEcrGap =',
    averageGap,
    'scarcity =',
    scarcity
  );

  return scarcity;
}


/*
 * Calculate late-round availability.
 *
 * This is the piece that helps us recognize:
 *
 * "There are still plenty of comparable QBs/TEs,
 * so don't draft one early."
 */
function getFantasyProsMarketRank(player, context) {
  return getMarketTimingDetails(player, context).marketRank;
}

function getMarketTimingDetails(player, context) {
  var espnRank = Number(player && player.espnRank);
  var espnAdp = Number(player && player.espnAdp);
  if (Number.isFinite(espnRank) && espnRank > 0) {
    if (Number.isFinite(espnAdp) && espnAdp > 0) {
      var currentPick = Number(context && context.currentPick) || 1;
      var boardWeight = currentPick <= 36 ? 0.75 : currentPick <= 96 ? 0.65 : 0.5;
      var nextPick = Number(context && (context.calculatedNextPick || context.nextPick)) || 0;
      var draftWindow = getTeamsPickingBeforeMyNextTurn(currentPick, nextPick, Number(context && context.teams) || LEAGUE_SIZE);
      var totalOpponentPicks = draftWindow.picks.length;
      var autoOpponentPicks = draftWindow.picks.filter(function(pick) {
        return autoDraftTeamSlots.indexOf(Number(pick.teamSlot)) >= 0;
      }).length;
      var autoPickShare = totalOpponentPicks ? autoOpponentPicks / totalOpponentPicks : 0;
      boardWeight = boardWeight + autoPickShare * (0.9 - boardWeight);
      return {
        marketRank: espnRank * boardWeight + espnAdp * (1 - boardWeight),
        source: 'ESPN board + ESPN ADP', espnRank: espnRank, espnAdp: espnAdp,
        boardWeight: boardWeight, adpWeight: 1 - boardWeight,
        autoOpponentPicks: autoOpponentPicks, totalOpponentPicks: totalOpponentPicks
      };
    }
    return {marketRank: espnRank, source: 'ESPN board', espnRank: espnRank, espnAdp: null, boardWeight: 1, adpWeight: 0};
  }
  var candidates = [
    player && player.espnAdp,
    player && player.adp,
    player && player.realTimeAdp,
    player && player.adpRank
  ];

  for (var index = 0; index < candidates.length; index++) {
    var value = Number(candidates[index]);

    if (Number.isFinite(value) && value > 0) {
      return {
        marketRank: value,
        source: index === 0 ? 'ESPN ADP' : 'FantasyPros ADP fallback',
        espnRank: null, espnAdp: index === 0 ? value : null,
        boardWeight: 0, adpWeight: 1
      };
    }
  }

  return {marketRank: null, source: 'Unknown market', espnRank: null, espnAdp: null, boardWeight: 0, adpWeight: 0};
}

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
    getFantasyProsMarketRank(player, context);

  /* Missing ADP is unknown timing, not permission to substitute ECR. */
  if (!Number.isFinite(playerRank)) {
    return 0;
  }

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

  var cache = context && context.lateAvailabilityCache;
  var cacheKey = String(player.name || '').toLowerCase() + '|' +
    player.position + '|' + playerRank + '|' + currentPick + '|' + nextPick;

  if (cache && Object.prototype.hasOwnProperty.call(cache, cacheKey)) {
    return cache[cacheKey];
  }


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

  var samePosition = context && context.marketPools && context.marketPools[player.position]
    ? context.marketPools[player.position]
    : players.filter(function(p) {

      return p &&
        p.available &&
        p.position === player.position &&
        Number.isFinite(getFantasyProsMarketRank(p, context));

    });


  var higherRanked =
    samePosition.filter(function(p) {

      return (
        getFantasyProsMarketRank(p, context) < playerRank
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
      getFantasyProsMarketRank(p, context);

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

    draftScoringLog(
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

  var result = Math.max(
    0,
    Math.min(
      100,
      risk
    )
  );

  if (cache) cache[cacheKey] = result;
  return result;

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
 * TRUE DRAFT ORDER
 * -------------------------------------------------------
 *
 * The board itself is sorted by player rank, not by
 * when players were drafted.
 *
 * Use each row's stored draft-pick number so positional
 * runs are based on the actual most recent selections.
 */

var draftedRows =
  rows
    .map(function(row) {

      var pick =
        Number(
          row.getAttribute('data-pick') ||
          row.getAttribute('data-draft-pick') ||
          row.dataset.pick ||
          row.dataset.draftPick
        ) || 0;


      return {
        row:
          row,

        pick:
          pick
      };

    })
    .filter(function(entry) {

      return (
        entry.row &&
        entry.pick > 0
      );

    })
    .sort(function(a, b) {

      return (
        Number(a.pick) -
        Number(b.pick)
      );

    });


var recentCount =
  8;


var recentRows =
  draftedRows
    .slice(-recentCount)
    .map(function(entry) {

      return entry.row;

    });


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

recentStartPick:
  draftedRows.length
    ? draftedRows[
        Math.max(
          0,
          draftedRows.length -
          recentRows.length
        )
      ].pick
    : 0,

recentEndPick:
  draftedRows.length
    ? draftedRows[
        draftedRows.length - 1
      ].pick
    : 0,

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

function calculateDraftRunUrgency(
  player,
  context
) {

  if (
    !player ||
    !context ||
    !context.draftRuns
  ) {
    return 0;
  }


  var position =
    player.position ||
    player.pos ||
    null;


  if (
    !position ||
    !['QB', 'RB', 'WR', 'TE'].includes(
      position
    )
  ) {
    return 0;
  }


  var draftRuns =
    context.draftRuns;


  /*
   * -------------------------------------------------------
   * POSITION-SPECIFIC RUN
   * -------------------------------------------------------
   *
   * Unlike Run Opportunity, urgency cares about a run
   * AT THE PLAYER'S OWN POSITION.
   */

  var positionRun =
    draftRuns.runs &&
    draftRuns.runs[position]
      ? draftRuns.runs[position]
      : null;


  if (!positionRun) {
    return 0;
  }


  var strength =
    positionRun.strength ||
    'NONE';


  if (
    strength !== 'STRONG' &&
    strength !== 'MODERATE'
  ) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * ROSTER NEED
   * -------------------------------------------------------
   */

  var dedicatedNeed =
    context.rosterNeeds
      ? Number(
          context.rosterNeeds[position]
        ) || 0
      : 0;


  var flexNeed =
    context.rosterNeeds
      ? Number(
          context.rosterNeeds.FLEX
        ) || 0
      : 0;


  var effectiveNeed =
    dedicatedNeed;


  if (
    position === 'RB' ||
    position === 'WR' ||
    position === 'TE'
  ) {

    effectiveNeed =
      Math.max(
        dedicatedNeed,
        flexNeed
      );

  }


  /*
   * If our roster is already satisfied at the position,
   * don't chase a run just because everyone else is.
   */

  if (effectiveNeed <= 0) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * BASE RUN PRESSURE
   * -------------------------------------------------------
   */

  var urgencyScore =
    strength === 'STRONG'
      ? 2
      : 1;


  /*
   * -------------------------------------------------------
   * TIER-CLIFF PRESSURE
   * -------------------------------------------------------
   *
   * A run is much more important if the remaining tier
   * is also about to collapse.
   */

  var tierCliff =
    context.tierCliffs &&
    context.tierCliffs[position]
      ? context.tierCliffs[position]
      : null;


  if (tierCliff) {

    var severity =
      tierCliff.severity ||
      'NONE';


    if (severity === 'HIGH') {

      urgencyScore += 2;

    } else if (
      severity === 'MODERATE'
    ) {

      urgencyScore += 1;

    }

  }


  /*
   * -------------------------------------------------------
   * RUN SCORE CONFIRMATION
   * -------------------------------------------------------
   *
   * Particularly concentrated runs get a small extra
   * bump, but never enough to dominate player quality.
   */

  var runScore =
    Number(
      positionRun.runScore
    ) || 0;


  if (runScore >= 65) {
    urgencyScore += 0.5;
  }


  /*
   * -------------------------------------------------------
   * CLAMP
   * -------------------------------------------------------
   */

  urgencyScore =
    Math.max(
      0,
      Math.min(
        4,
        urgencyScore
      )
    );


  return Number(
    urgencyScore.toFixed(2)
  );

}
 

function calculateVorpProfile(
  player,
  players,
  replacements,
  draftState,
  draftAwareContext
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
      players,
      draftAwareContext
    );

  var cachedScarcity = draftAwareContext &&
    draftAwareContext.positionScarcityScores &&
    draftAwareContext.positionScarcityScores[player.position];
  var scarcity = Number.isFinite(Number(cachedScarcity))
    ? Number(cachedScarcity)
    : calculatePositionScarcity(player, players, replacements);


/*
 * -------------------------------------------------------
 * DRAFT STATE
 * -------------------------------------------------------
 *
 * Prefer the shared draft-state snapshot supplied by the
 * caller. Only rebuild it when this function is used
 * independently.
 */

draftState =
  draftState ||
  getDraftAssistantState();


  /*
   * -------------------------------------------------------
   * LATE AVAILABILITY
   * -------------------------------------------------------
   */

  var lateAvailability = calculateLateAvailability(
    player,
    players,
    draftAwareContext || {
      currentPick: draftState.currentPick,
      nextPick: calculateMyNextDraftPick(
        Number(draftState.currentPick) || 0,
        Number(draftState.teams) || 10
      ).nextPick
    }
  );


  /*
   * -------------------------------------------------------
   * DRAFT-AWARE VORP OPPORTUNITY
   * -------------------------------------------------------
   *
   * Measures how much positional value could disappear
   * before our next pick.
   */

var draftAwareVorpOpportunity =
  calculateDraftAwareVorpOpportunity(
    player,
    draftAwareContext || {
      players:
        players,

      replacements:
        replacements,

      draftState:
        draftState
    }
  );


  /*
   * -------------------------------------------------------
   * RETURN PROFILE
   * -------------------------------------------------------
   */

  return {

    player:
      player,

    vorp:
      vorp,

    draftAware:
      draftAwareVorpOpportunity,

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
function calculateAllFantasyVorp(players, suppliedDraftState) {

  var available =
    getAvailableVorpPlayers(
      players
    );

  var replacements =
    calculateReplacementLevels(
      available
    );

  /*
 * -------------------------------------------------------
 * SHARED DRAFT STATE
 * -------------------------------------------------------
 *
 * Every VORP profile in this batch sees the same draft
 * state, so calculate it once instead of once per player.
 */

var draftState =
  suppliedDraftState ||
  getDraftAssistantState();


/*
 * -------------------------------------------------------
 * SHARED DRAFT-AWARE VORP DATA
 * -------------------------------------------------------
 *
 * Every profile in this batch uses the same available
 * player pool and draft window.
 *
 * Build the expensive sorted positional pools and
 * pressure sample once rather than once per player.
 */

var draftWindow =
  calculateMyNextDraftPick(
    Number(draftState.currentPick) || 0,
    Number(draftState.teams) || 10
  );


var draftAwarePositionPools = {};


['QB', 'RB', 'WR', 'TE'].forEach(
  function(position) {

    draftAwarePositionPools[position] =
      available
        .filter(function(candidate) {

          return (
            candidate &&
            candidate.available !== false &&
            (
              candidate.position ||
              candidate.pos
            ) === position &&
            candidate.rank
          );

        })
        .slice()
        .sort(function(a, b) {

          return (
            Number(a.rank) -
            Number(b.rank)
          );

        });

  }
);


var pressureSampleSize =
  Math.min(
    100,
    available.length
  );


var draftAwarePressureSample =
  available
    .filter(function(candidate) {

      return (
        candidate &&
        candidate.available !== false &&
        candidate.rank &&
        VORP_POSITIONS.includes(
          candidate.position
        )
      );

    })
    .slice()
    .sort(function(a, b) {

      return (
        Number(a.rank) -
        Number(b.rank)
      );

    })
    .slice(
      0,
      pressureSampleSize
    );


var draftAwarePositionShares = {};


['QB', 'RB', 'WR', 'TE'].forEach(
  function(position) {

    var positionCount =
      draftAwarePressureSample
        .filter(function(candidate) {

          return (
            candidate.position ===
            position
          );

        })
        .length;


    var positionShare =
      draftAwarePressureSample.length > 0
        ? positionCount /
          draftAwarePressureSample.length
        : 0;


    draftAwarePositionShares[position] =
      Math.max(
        0.05,
        Math.min(
          0.45,
          positionShare
        )
      );

  }
);

var tierDropNextByName = {};
var vorpMarketPools = {};

['QB', 'RB', 'WR', 'TE'].forEach(function(position) {
  var positionPool = draftAwarePositionPools[position] || [];

  positionPool.forEach(function(player, index) {
    tierDropNextByName[String(player.name || '').toLowerCase()] =
      positionPool[index + 1] || null;
  });

  vorpMarketPools[position] = positionPool.filter(function(player) {
    return Number.isFinite(getFantasyProsMarketRank(player));
  });
});

var decisionMarketPools = {};
['QB', 'RB', 'WR', 'TE', 'K', 'DST'].forEach(function(position) {
  decisionMarketPools[position] = players.filter(function(player) {
    return player &&
      player.available !== false &&
      player.position === position &&
      Number.isFinite(getFantasyProsMarketRank(player));
  });
});

var positionScarcityScores = {};

['QB', 'RB', 'WR', 'TE'].forEach(function(position) {
  var positionPool = draftAwarePositionPools[position] || [];
  positionScarcityScores[position] = positionPool.length
    ? calculatePositionScarcity(positionPool[0], available, replacements)
    : 0;
});


var sharedDraftAwareContext = {

  players:
    available,

  replacements:
    replacements,

  draftState:
    draftState,

  draftWindow:
    draftWindow,

  positionPools:
    draftAwarePositionPools,

  pressureSample:
    draftAwarePressureSample,

  positionShares:
    draftAwarePositionShares,

  tierDropNextByName:
    tierDropNextByName,

  marketPools:
    vorpMarketPools,

  lateAvailabilityCache:
    {},

  currentPick:
    Number(draftState.currentPick) || 0,

  nextPick:
    Number(draftWindow.nextPick) || 0,

  positionScarcityScores:
    positionScarcityScores

};


var profiles =
  available.map(function(player) {

    return calculateVorpProfile(
      player,
      available,
      replacements,
      draftState,
      sharedDraftAwareContext
    );

  });

  return {

    settings:
      getVorpLeagueSettings(),

    replacements:
      replacements,

    profiles:
      profiles,

    marketPools:
      decisionMarketPools,

    lateAvailabilityCache:
      sharedDraftAwareContext.lateAvailabilityCache

  };

}

function calculateDraftAwareVorpOpportunity(player, context){

  if(!player || !context){
    return 0;
  }

  /*
   * -------------------------------------------------------
   * PURPOSE
   * -------------------------------------------------------
   *
   * Measures how much positional value could disappear
   * between the current pick and the user's next pick.
   *
   * This is NOT the player's normal VORP.
   *
   * Normal VORP:
   *   "How much better is this player than replacement?"
   *
   * Draft-aware VORP:
   *   "How dangerous is it to wait until my next pick?"
   */


  var position =
    player.position ||
    player.pos ||
    'N/A';


  /*
   * We need draft-aware replacement levels.
   */
  if(!context.replacements){
    return 0;
  }


  var currentReplacement =
    context.replacements[position] || null;


  /*
   * No replacement information means we cannot
   * calculate a meaningful opportunity cost.
   */
  if(!currentReplacement ||
     !currentReplacement.rank){

    return 0;
  }


  /*
   * -------------------------------------------------------
   * NEXT-PICK REPLACEMENT
   * -------------------------------------------------------
   *
   * Calculate what the replacement level could look like
   * after the upcoming picks before our next selection.
   *
   * We use the existing player pool from context.
   */

  var players =
    context.players ||
    context.availablePlayers ||
    [];


  if(!players.length){
    return 0;
  }


var draftState =
  context.draftState ||
  getDraftAssistantState();


var currentPick =
  Number(
    draftState.currentPick
  ) || 0;


var teams =
  Number(
    draftState.teams
  ) || 10;


var draftWindow =
  context.draftWindow ||
  calculateMyNextDraftPick(
    currentPick,
    teams
  );


var nextPick =
  Number(
    draftWindow.nextPick
  ) || 0;


var picksUntilNext =
  Number(
    draftWindow.picksBetween
  ) || 0;

  /*
   * If we're already on the clock, there is no waiting
   * period to penalize.
   */
  if(picksUntilNext <= 0){
    return 0;
  }


  /*
   * -------------------------------------------------------
   * POSITIONAL POOL
   * -------------------------------------------------------
   */

var positionPool =
  context.positionPools &&
  context.positionPools[position]
    ? context.positionPools[position]
    : players
        .filter(function(candidate) {

          return (
            candidate &&
            candidate.available !== false &&
            (
              candidate.position ||
              candidate.pos
            ) === position &&
            candidate.rank
          );

        })
        .slice()
        .sort(function(a, b) {

          return (
            Number(a.rank) -
            Number(b.rank)
          );

        });


  if(!positionPool.length){
    return 0;
  }


  /*
   * Find the current replacement player inside
   * the available positional pool.
   */
  var replacementIndex =
    positionPool.findIndex(function(candidate){

      return (
        candidate.name ===
        currentReplacement.name
      );

    });


  if(replacementIndex < 0){
    return 0;
  }


  /*
   * -------------------------------------------------------
   * ESTIMATE DRAFT PRESSURE
   * -------------------------------------------------------
   *
   * We don't assume every pick before our turn is
   * this position.
   *
   * Instead, estimate how many players at this
   * position are likely to disappear.
   *
   * The player's current rank helps determine how
   * exposed the position is.
   */

  /*
   * -------------------------------------------------------
   * POSITION-SPECIFIC DRAFT PRESSURE
   * -------------------------------------------------------
   *
   * Not every pick between now and our next selection
   * will be this position.
   *
   * Estimate how many players at THIS position are
   * realistically likely to disappear.
   */


  var comparableCount =
    positionPool.filter(function(candidate){

      return Number(candidate.rank) <=
             Number(currentReplacement.rank);

    }).length;


  /*
   * Estimate the proportion of the upcoming draft
   * that this position represents.
   *
   * We look at the top available players and determine
   * how frequently this position occurs.
   */
 var positionShare;


if (
  context.positionShares &&
  Number.isFinite(
    Number(
      context.positionShares[position]
    )
  )
) {

  positionShare =
    Number(
      context.positionShares[position]
    );

} else {

  var pressureSampleSize =
    Math.min(
      100,
      players.length
    );


  var pressureSample =
    players
      .filter(function(candidate) {

        return (
          candidate &&
          candidate.available !== false &&
          candidate.rank &&
          VORP_POSITIONS.includes(
            candidate.position
          )
        );

      })
      .slice()
      .sort(function(a, b) {

        return (
          Number(a.rank) -
          Number(b.rank)
        );

      })
      .slice(
        0,
        pressureSampleSize
      );


  var positionCount =
    pressureSample
      .filter(function(candidate) {

        return (
          candidate.position ===
          position
        );

      })
      .length;


  positionShare =
    pressureSample.length > 0
      ? positionCount /
        pressureSample.length
      : 0;


  positionShare =
    Math.max(
      0.05,
      Math.min(
        0.45,
        positionShare
      )
    );

}


  /*
   * Expected number of players from this position
   * drafted before our next pick.
   */
  var expectedLoss =
    Math.min(
      comparableCount,
      Math.max(
        1,
        Math.round(
          picksUntilNext *
          positionShare
        )
      )
    );

  /*
   * -------------------------------------------------------
   * FUTURE REPLACEMENT
   * -------------------------------------------------------
   *
   * Move replacement level down by the estimated
   * number of players likely to disappear.
   */

  var futureReplacementIndex =
    Math.min(
      replacementIndex + expectedLoss,
      positionPool.length - 1
    );


  var futureReplacement =
    positionPool[
      futureReplacementIndex
    ];


  if(!futureReplacement ||
     !futureReplacement.rank){

    return 0;
  }


  /*
   * -------------------------------------------------------
   * VALUE DROP
   * -------------------------------------------------------
   *
   * Convert the replacement movement into a
   * draft-aware opportunity score.
   */

  var currentRank =
    Number(currentReplacement.rank);

  var futureRank =
    Number(futureReplacement.rank);


  var rankDrop =
    futureRank - currentRank;


  if(rankDrop <= 0){
    return 0;
  }


  /*
   * Scale the opportunity.
   *
   * 0-10 rank drop  = small opportunity
   * 11-20           = moderate
   * 21+             = strong
   */

  
  /*
   * -------------------------------------------------------
   * DRAFT-AWARE OPPORTUNITY SCORE
   * -------------------------------------------------------
   *
   * The replacement drop tells us how much positional
   * inventory may disappear.
   *
   * But we also need to know whether THIS PLAYER is
   * valuable enough to justify protecting that inventory.
   *
   * We therefore combine:
   *
   *   1. Replacement rank drop
   *   2. Player's position above replacement
   *   3. How much of that value is exposed by waiting
   *
   * Result: 0-5 bonus.
   */


  /*
   * How much positional value disappears?
   *
   * 71 ranks = extremely meaningful
   * 30 ranks = meaningful
   * 10 ranks = small
   */
  var replacementDropScore =
    Math.min(
      1,
      rankDrop / 50
    );


  /*
   * How far above the current replacement is
   * this specific player?
   *
   * Example:
   *
   * Player #1
   * Replacement #73
   * = 72 ranks above replacement
   *
   * Player #60
   * Replacement #73
   * = only 13 ranks above replacement
   *
   * This prevents every player above replacement
   * from automatically receiving the same bonus.
   */
  var playerAdvantage =
    Math.max(
      0,
      currentRank - Number(player.rank)
    );


  /*
   * Normalize the player's positional advantage.
   *
   * 50+ ranks above replacement = maximum exposure
   */
  var playerAdvantageScore =
    Math.min(
      1,
      playerAdvantage / 50
    );


  /*
   * Combine the two factors.
   */
  var opportunityStrength =
    replacementDropScore *
    playerAdvantageScore;


  /*
   * Convert to 0-5 scale.
   */
  var opportunityScore =
    opportunityStrength * 5;


  /*
   * Round to two decimals so the decision engine
   * gets useful differentiation.
   */
  opportunityScore =
    Math.round(
      opportunityScore * 100
    ) / 100;


  /*
   * Don't give meaningful opportunity credit to
   * players at or below replacement.
   */
  if (
    Number(player.rank) >= currentRank
  ) {

    opportunityScore = 0;

  }

  return opportunityScore;

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

var LEGACY_TO_SEMANTIC_TIER = {
  'Sp': 'ELITE',
  'S': 'PREMIUM',
  'A': 'CORE',
  'B': 'VALUE',
  'C': 'UPSIDE',
  'D': 'DEPTH',
  'E': 'LATE',
  'F': 'DEEP'
};

var SEMANTIC_TO_LEGACY_TIER = {
  ELITE: 'Sp',
  PREMIUM: 'S',
  CORE: 'A',
  VALUE: 'B',
  UPSIDE: 'C',
  DEPTH: 'D',
  LATE: 'E',
  DEEP: 'F'
};

/*
 * Semantic scores are intentionally gradual across the 717-player
 * distribution. Legacy IDs remain an implementation detail for DOM,
 * edit-order, and persistence compatibility.
 */
var SEMANTIC_TIER_SCORES = {
  ELITE: 100,
  PREMIUM: 92,
  CORE: 82,
  VALUE: 70,
  UPSIDE: 56,
  DEPTH: 40,
  LATE: 24,
  DEEP: 8
};

var SEMANTIC_TIER_ORDER = {
  ELITE: 0,
  PREMIUM: 1,
  CORE: 2,
  VALUE: 3,
  UPSIDE: 4,
  DEPTH: 5,
  LATE: 6,
  DEEP: 7
};

function getPlayerTierValue(player){
  var row = player && (player.row || player);
  var tierId = '';
  var semanticTier = '';

  if (row && typeof row.getAttribute === 'function') {
    semanticTier = row.getAttribute('data-semantic-tier') ||
      row.getAttribute('data-consensus-tier') || '';
  }

  if (row && typeof row.closest === 'function') {
    var tbody = row.closest('tbody.tier-group');

    if (tbody) {
      tierId = tbody.id.replace('tbody-', '');
    }
  }

  if (!tierId && player && player.tier) {
    tierId = String(player.tier).replace('tier-', '');
  }

  if (!semanticTier && player) {
    semanticTier = player.semanticTier || player.consensusTier || '';
  }

  semanticTier = String(
    semanticTier || LEGACY_TO_SEMANTIC_TIER[tierId] || 'DEEP'
  ).toUpperCase();

  if (!SEMANTIC_TIER_SCORES.hasOwnProperty(semanticTier)) {
    semanticTier = LEGACY_TO_SEMANTIC_TIER[tierId] || 'DEEP';
  }

  tierId = tierId || SEMANTIC_TO_LEGACY_TIER[semanticTier] || 'F';

  return {
    id: tierId,
    semanticTier: semanticTier,
    score: SEMANTIC_TIER_SCORES[semanticTier]
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

  var draftPhase = context.draftPhase ||
  getDraftPhase(
    Number(context.currentPick) || 0,
    Number(context.teams) || 10
  );

var phaseWeights = context.phaseWeights ||
  getDraftPhaseWeights(
    draftPhase.phase
  );

  /*
 * -------------------------------------------------------
 * PHASE 12 — DYNAMIC STRATEGY ADJUSTMENT
 * -------------------------------------------------------
 *
 * Read only the prebuilt strategy snapshot from context.
 *
 * Never build live draft state from inside the scoring
 * engine, which would create recursion.
 */

var dynamicStrategyAdjustment =
  calculateDynamicStrategyAdjustment(
    player,
    context.dynamicStrategyState ||
    null
  );

  var endgameRosterRequirementScore =
  calculateEndgameRosterRequirement(
    player,
    context
  );

var mandatoryEndgameAdjustment =
  calculateMandatoryEndgameAdjustment(
    player,
    context
  );

var rosterSaturationPenalty =
  calculateRosterSaturationPenalty(
    player,
    context
  );

  var position =
    player.position ||
    player.pos ||
    'N/A';

  var rank =
    Number(player.rank || player.rk || 9999);

  var vorp =
  Number(
    player.vorp ||
    context.vorp ||
    0
  );

  /*
   * -------------------------------------------------------
   * 1. CUSTOM RANK VALUE
   * -------------------------------------------------------
   *
   * Earlier overall rankings receive more value.
   */

  var rankDecay = Math.max(
    60,
    (Number(context.totalPicks) ||
      (Number(context.teams) * Number(context.rounds)) ||
      160) / 2
  );
  var rankScore = Math.max(
    0,
    Math.min(100, 100 * Math.exp(-Math.max(0, rank - 1) / rankDecay))
  );


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
      Math.min(100, Math.max(dedicatedNeed, flexNeed) * 25);

  } else {

    rosterNeedScore =
      Math.min(100, dedicatedNeed * 25);

  }
}


  /*
   * -------------------------------------------------------
 * 6. DRAFT TIMING
   * -------------------------------------------------------
   */

var draftState =
  context.draftState ||
  getDraftAssistantState();

var lateAvailability = calculateLateAvailability(
  player,
  context.players || [],
  context
);

var timingScore =
  lateAvailability;

if (DEBUG_DRAFT_SCORING) {

  console.log(
    'TIMING SCORE:',
    player.name,
    'lateAvailability =',
    lateAvailability,
    'timingScore =',
    timingScore
  );

}


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

  var runUrgencyScore =
  calculateDraftRunUrgency(
    player,
    context
  );


if (DEBUG_DRAFT_SCORING) {
console.log(
  'RUN OPPORTUNITY SCORE:',
  player.name,
  'position =',
  position,
  'runOpportunityScore =',
  runOpportunityScore
);
}


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

/*
 * -------------------------------------------------------
 * DRAFT-AWARE VORP OPPORTUNITY
 * -------------------------------------------------------
 */

  var phaseCoreAdjustment =
  calculatePhaseCoreAdjustment(
    vorpScore,
    scarcityScore,
    rosterNeedScore,
    phaseWeights
  );

var draftAwareVorpOpportunityScore =
  Number(
    player.draftAware
  );


if (
  !Number.isFinite(
    draftAwareVorpOpportunityScore
  )
) {

  draftAwareVorpOpportunityScore =
    calculateDraftAwareVorpOpportunity(
      player,
      context
    );

}

if (DEBUG_DRAFT_SCORING) {

  console.log(
    'DRAFT-AWARE VORP OPPORTUNITY:',
    player.name,
    'score =',
    draftAwareVorpOpportunityScore
  );

}


if (DEBUG_DRAFT_SCORING) {
console.log(
  'TIER CLIFF OPPORTUNITY:',
  player.name,
  'position =',
  position,
  'tierCliffOpportunityScore =',
  tierCliffOpportunityScore
);
}

  var rosterConstructionScore =
  calculateRosterConstructionValue(
    player,
    context
  );

var byeWeekCongestionAdjustment =
  calculateByeWeekCongestionAdjustment(
    player,
    context
  );

var futureDepthOpportunityScore =
  context.skipFutureDepth
    ? 0
    : calculateFutureDepthOpportunity(
        player,
        context
      );

var multiPickPlanningScore =
  context.skipMultiPickPlanning
    ? 0
    : calculateMultiPickPlanningScore(
        player,
        context
      );

  /*
 * -------------------------------------------------------
 * DRAFT-PHASE ADJUSTMENTS
 * -------------------------------------------------------
 *
 * Apply phase multipliers to supporting signals.
 * Keep the underlying raw scores intact for debugging.
 */

var phaseAdjustedRosterConstructionScore =
  rosterConstructionScore *
  phaseWeights.rosterConstruction;

var phaseAdjustedFutureDepthScore =
  futureDepthOpportunityScore *
  phaseWeights.futureDepth;

var phaseAdjustedMultiPickScore =
  multiPickPlanningScore *
  phaseWeights.multiPick;

var phaseAdjustedTierCliffScore =
  tierCliffOpportunityScore *
  phaseWeights.tierCliff;

var phaseAdjustedDraftAwareVorpScore =
  draftAwareVorpOpportunityScore *
  phaseWeights.draftAwareVorp;


/*
 * -------------------------------------------------------
 * 7. FINAL WEIGHTED SCORE
 * -------------------------------------------------------
 */

var baseScore =
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

var rawStrategyAdjustment =
  strategyScore + dynamicStrategyAdjustment + phaseAdjustedTierCliffScore +
  phaseCoreAdjustment.total + runOpportunityScore + runUrgencyScore +
  phaseAdjustedDraftAwareVorpScore + phaseAdjustedRosterConstructionScore +
  phaseAdjustedFutureDepthScore + phaseAdjustedMultiPickScore +
  byeWeekCongestionAdjustment;
var adjustmentBudget = WAR_ROOM_CONFIG.strategyAdjustmentBudget || {min:-15, max:15};
var cappedStrategyAdjustment = Math.max(
  Number(adjustmentBudget.min) || -15,
  Math.min(Number(adjustmentBudget.max) || 15, rawStrategyAdjustment)
);
/* Hard roster guardrails remain outside the opportunity budget. They may
 * decisively promote required endgame positions or reject roster-breaking choices. */
var guardrailAdjustment = endgameRosterRequirementScore + mandatoryEndgameAdjustment + rosterSaturationPenalty;
var finalScore = baseScore + cappedStrategyAdjustment + guardrailAdjustment;

if (DEBUG_DRAFT_SCORING) {
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
}

  return {

    name:
      player.name || 'Unknown',

    position:
      position,

    rank:
      rank,

    ecr:
      player.ecr == null ? null : Number(player.ecr),

    adp:
      player.adp == null ? null : Number(player.adp),

    adpRank:
      player.adpRank == null ? null : Number(player.adpRank),

    realTimeAdp:
      player.realTimeAdp == null ? null : Number(player.realTimeAdp),

    espnRank:
      player.espnRank == null ? null : Number(player.espnRank),

    espnAdp:
      player.espnAdp == null ? null : Number(player.espnAdp),

    team:
      player.team || null,

    source:
      player.source || null,

    row:
      player.row || null,

    tier:
      tier.id,

    semanticTier:
      tier.semanticTier,

    tierScore:
      tierScore,

    rankScore:
      rankScore,

    vorpScore:
      vorpScore,

    phaseCoreAdjustment:
  phaseCoreAdjustment.total,

phaseCoreVorpAdjustment:
  phaseCoreAdjustment.vorp,

phaseCoreScarcityAdjustment:
  phaseCoreAdjustment.scarcity,

phaseCoreRosterNeedAdjustment:
  phaseCoreAdjustment.rosterNeed,

    rosterSaturationPenalty:
  rosterSaturationPenalty,

  endgameRosterRequirementScore:
  endgameRosterRequirementScore,

  mandatoryEndgameAdjustment:
  mandatoryEndgameAdjustment,

    scarcityScore:
      scarcityScore,

    rosterNeedScore:
      rosterNeedScore,

    draftPhase:
  draftPhase.phase,

draftRound:
  draftPhase.round,

phaseWeights:
  phaseWeights,

phaseAdjustedRosterConstructionScore:
  phaseAdjustedRosterConstructionScore,

phaseAdjustedFutureDepthScore:
  phaseAdjustedFutureDepthScore,

phaseAdjustedMultiPickScore:
  phaseAdjustedMultiPickScore,

phaseAdjustedTierCliffScore:
  phaseAdjustedTierCliffScore,

phaseAdjustedDraftAwareVorpScore:
  phaseAdjustedDraftAwareVorpScore,

    timingScore:
      timingScore,

baseScore:
  baseScore,

rawStrategyAdjustment:
  rawStrategyAdjustment,

cappedStrategyAdjustment:
  cappedStrategyAdjustment,

guardrailAdjustment:
  guardrailAdjustment,

strategyScore:
  strategyScore,

dynamicStrategyAdjustment:
  dynamicStrategyAdjustment,

runOpportunityScore:
  runOpportunityScore,

  runUrgencyScore:
  runUrgencyScore,

tierCliffOpportunityScore:
  tierCliffOpportunityScore,

draftAwareVorpOpportunityScore:
  draftAwareVorpOpportunityScore,

    multiPickPlanningScore:
  multiPickPlanningScore,

    futureDepthOpportunityScore:
  futureDepthOpportunityScore,

    rosterConstructionScore:
  rosterConstructionScore,

    byeWeekCongestionAdjustment:
  byeWeekCongestionAdjustment,

finalScore:
  finalScore

  };
}

function calculateRecommendationDecision(
  player,
  alternative,
  scoreGap,
  confidenceScore,
  context
) {

  if (!player) {
    return {
      recommendation: 'PASS',
      reason: 'No player provided.'
    };
  }

  context = context || {};

  var playerScore =
    Number(player.finalScore) || 0;

  var gap =
    Number(scoreGap) || 0;

  var confidence =
    Number(confidenceScore) || 0;


  /*
   * -------------------------------------------------------
   * PLAYER STRENGTH
   * -------------------------------------------------------
   */

  var vorp =
    Number(player.vorpScore) || 0;

  var tier =
    Number(player.tierScore) || 0;

  var timing =
    Number(player.timingScore) || 0;

  var cliff =
    Number(
      player.tierCliffOpportunityScore
    ) || 0;

  var run =
    Number(
      player.runOpportunityScore
    ) || 0;

  var draftAware =
    Number(
      player.draftAwareVorpOpportunityScore
    ) || 0;

  var strategy =
    Number(
      player.strategyScore
    ) || 0;


  /*
   * -------------------------------------------------------
   * ALTERNATIVE VALUE
   * -------------------------------------------------------
   */

  var alternativeRawScore =
    alternative
      ? Number(alternative.finalScore) || 0
      : 0;

  var alternativeSurvival =
    alternative
      ? Number(
          alternative.nextPickSurvivalScore
        ) || 0
      : 0;

  var alternativeAdjustedScore =
    alternative
      ? Number(
          alternative.survivalAdjustedScore
        ) || 0
      : 0;


  /*
   * -------------------------------------------------------
   * VALUE / URGENCY FLAGS
   * -------------------------------------------------------
   */

  var strongValue =
    (
      vorp >= 80 ||
      tier >= 90
    );

  var eliteValue =
    (
      vorp >= 90 &&
      tier >= 90
    );

  var urgent =
    (
      timing >= 70 ||
      cliff >= 5 ||
      run >= 3 ||
      draftAware >= 3
    );

  var strategicNeed =
    strategy >= 3;


  /*
   * -------------------------------------------------------
   * WAIT SAFETY
   * -------------------------------------------------------
   *
   * A strong surviving alternative makes waiting safer.
   */

  var safeToWait =
    (
      alternative &&
      alternativeSurvival >= 75 &&
      alternativeAdjustedScore >=
        (playerScore - 8)
    );


  /*
   * -------------------------------------------------------
   * DRAFT URGENCY
   * -------------------------------------------------------
   *
   * Waiting is dangerous when the alternative is weak
   * or unlikely to survive.
   */

  var dangerousToWait =
    (
      !alternative ||
      alternativeSurvival <= 40 ||
      alternativeAdjustedScore <=
        (playerScore - 15)
    );


  /*
   * -------------------------------------------------------
   * RECOMMENDATION
   * -------------------------------------------------------
   */

  var recommendation =
    'CONSIDER';


  /*
   * PASS
   *
   * Current player is clearly inferior.
   */

  if (
    gap <= -8
  ) {

    recommendation =
      'PASS';


  } else if (
    gap <= -4 &&
    confidence >= 40 &&
    !urgent
  ) {

    recommendation =
      'PASS';


  /*
   * DRAFT
   *
   * Strong advantage or dangerous to wait.
   */

  } else if (
    gap >= 8 &&
    confidence >= 65
  ) {

    recommendation =
      'DRAFT';


  } else if (
    gap >= 5 &&
    confidence >= 55 &&
    (
      strongValue ||
      urgent ||
      dangerousToWait
    )
  ) {

    recommendation =
      'DRAFT';


  } else if (
    eliteValue &&
    dangerousToWait &&
    confidence >= 50
  ) {

    recommendation =
      'DRAFT';


  } else if (
    strategicNeed &&
    gap >= 3 &&
    confidence >= 45
  ) {

    recommendation =
      'DRAFT';


  /*
   * WAIT
   *
   * Current player is fine, but the next-pick option is
   * good enough and likely enough to survive that forcing
   * the pick is unnecessary.
   */

  } else if (
    gap <= 3 &&
    safeToWait &&
    !urgent
  ) {

    recommendation =
      'WAIT';


  } else if (
    gap < 0 &&
    alternativeSurvival >= 65 &&
    !urgent
  ) {

    recommendation =
      'WAIT';


  /*
   * CONSIDER
   *
   * Close / ambiguous case.
   */

  } else {

    recommendation =
      'CONSIDER';

  }


  return {

    recommendation:
      recommendation,

    scoreGap:
      gap,

    confidenceScore:
      confidence,

    strongValue:
      strongValue,

    eliteValue:
      eliteValue,

    urgent:
      urgent,

    strategicNeed:
      strategicNeed,

    safeToWait:
      safeToWait,

    dangerousToWait:
      dangerousToWait,

    alternativeRawScore:
      alternativeRawScore,

    alternativeSurvival:
      alternativeSurvival,

    alternativeAdjustedScore:
      alternativeAdjustedScore

  };
}

function draftDebugSection(title, data) {

  if (!isDraftEngineDebugEnabled()) {
    return;
  }

  if (
    typeof DRAFT_DEBUG !== 'undefined' &&
    DRAFT_DEBUG &&
    typeof DRAFT_DEBUG.reset === 'function'
  ) {
    DRAFT_DEBUG.reset();
  }

  console.group('[DRAFT ENGINE] ' + title);

  if (Array.isArray(data)) {
    console.table(data);
  } else {
    console.log(data);
  }

  console.groupEnd();

}

function calculateNextPickAlternatives(
  player,
  scoredPlayers,
  context
) {

  if (!player) {
    return [];
  }

  scoredPlayers =
    Array.isArray(scoredPlayers)
      ? scoredPlayers
      : [];

  context =
    context || {};


  /*
   * -------------------------------------------------------
   * AVAILABLE ALTERNATIVES
   * -------------------------------------------------------
   */

  var availablePlayers =
    scoredPlayers.filter(function(candidate) {

      return candidate &&
        candidate.name !== player.name &&
        candidate.available !== false;

    });


  /*
   * -------------------------------------------------------
   * CURRENT DRAFT STATE
   * -------------------------------------------------------
   */

  var currentPick =
    Number(context.currentPick) || 0;

  var teams =
    Number(context.teams) || 10;


  /*
   * -------------------------------------------------------
   * CALCULATE ACTUAL NEXT PICK
   * -------------------------------------------------------
   *
   * Use the centralized, tested snake-draft helper.
   *
   * This avoids maintaining duplicate snake math
   * in multiple functions.
   */

  var draftWindow =
    calculateMyNextDraftPick(
      currentPick,
      teams
    );

  var calculatedNextPick =
    Number(draftWindow.nextPick) || 0;

  var calculatedPicksBetween =
    Number(draftWindow.picksBetween) || 0;


  /*
   * context.nextPick may already contain a valid
   * future pick.
   *
   * However, when we are currently on the clock,
   * context.nextPick may equal currentPick.
   *
   * In that case we must use the calculated
   * snake-draft next pick instead.
   */

  var suppliedNextPick =
    Number(context.nextPick) || 0;

  var nextPick =
    (
      suppliedNextPick &&
      suppliedNextPick !== currentPick
    )
      ? suppliedNextPick
      : calculatedNextPick;


  /*
   * -------------------------------------------------------
   * PICKS BETWEEN NOW AND NEXT TURN
   * -------------------------------------------------------
   */

  var picksBetween =
    nextPick === calculatedNextPick
      ? calculatedPicksBetween
      : Math.max(
          0,
          nextPick - currentPick - 1
        );


  /*
   * -------------------------------------------------------
   * RANK WINDOW
   * -------------------------------------------------------
   *
   * Look around the player's likely availability
   * at the next pick.
   */

  var rankWindow =
    Math.max(
      5,
      Math.ceil(
        Math.max(
          1,
          picksBetween
        ) * 0.35
      )
    );


  var currentRank =
    Number(player.rank) || 999;


  /*
   * -------------------------------------------------------
   * FIND REALISTIC ALTERNATIVES
   * -------------------------------------------------------
   */

  var alternatives =
    availablePlayers.filter(function(candidate) {

      var candidateRank =
        Number(candidate.rank) || 999;


      /*
       * Never consider someone ranked above or equal
       * to the player currently being evaluated.
       */

      if (
        candidateRank <= currentRank
      ) {

        return false;

      }


      /*
       * Look around the actual next-pick range.
       */

      var distanceFromNextPick =
        Math.abs(
          candidateRank -
          nextPick
        );

      return (
        distanceFromNextPick <=
        rankWindow
      );

    });


  /*
   * -------------------------------------------------------
   * INITIAL NEXT-PICK SURVIVAL ESTIMATE
   * -------------------------------------------------------
   *
   * This provides an initial estimate.
   *
   * calculateDraftRecommendation() later applies the
   * more complete calculateNextPickSurvival() model.
   */

  alternatives.forEach(function(candidate) {

    var candidateRank =
      Number(candidate.rank) || 999;

    var survivalScore =
      100;


    if (nextPick) {

      /*
       * Players ranked before our next pick become
       * increasingly unlikely to survive.
       */

      var distance =
        nextPick -
        candidateRank;

      if (distance > 0) {

        survivalScore -=
          distance * 8;

      }


      /*
       * Players ranked at or beyond our next pick
       * receive a small survival boost.
       */

      if (
        candidateRank >= nextPick
      ) {

        survivalScore += 15;

      }

    }


    candidate.nextPickSurvivalScore =
      Math.max(
        0,
        Math.min(
          100,
          survivalScore
        )
      );

  });


  /*
   * -------------------------------------------------------
   * SORT BY CURRENT DECISION SCORE
   * -------------------------------------------------------
   */

  alternatives.sort(function(a, b) {

    return (
      Number(b.finalScore || 0) -
      Number(a.finalScore || 0)
    );

  });


  /*
   * Keep only the strongest realistic alternatives.
   */

  alternatives =
    alternatives.slice(0, 8);


  /*
   * -------------------------------------------------------
   * HAND OFF NEXT-PICK WINDOW
   * -------------------------------------------------------
   *
   * calculateNextPickSurvival() uses these values.
   */

  context.calculatedNextPick =
    nextPick;

  context.calculatedPicksUntilNext =
    picksBetween;


  /*
   * -------------------------------------------------------
   * DEBUG
   * -------------------------------------------------------
   */

  if (
    typeof DRAFT_DEBUG !== 'undefined' &&
    DRAFT_DEBUG &&
    typeof DRAFT_DEBUG.add === 'function'
  ) {

    DRAFT_DEBUG.add(
      'NEXT PICK',
      {
        player:
          player.name,

        teams:
          teams,

        currentPick:
          currentPick,

        suppliedNextPick:
          suppliedNextPick,

        calculatedNextPick:
          calculatedNextPick,

        nextPick:
          nextPick,

        picksBetween:
          picksBetween,

        rankWindow:
          rankWindow
      }
    );

  }


  return alternatives;
}

function calculateFuturePositionDepth(
  player,
  context
) {

  if (!player) {
    return 0;
  }

  context =
    context || {};

  var position =
    player.position ||
    player.pos ||
    null;

  if (
    !position ||
    !['QB', 'RB', 'WR', 'TE'].includes(position)
  ) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * PLAYER POOL
   * -------------------------------------------------------
   */

  var players =
    context.players ||
    context.availablePlayers ||
    [];

  if (!players.length) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * NEXT PICK WINDOW
   * -------------------------------------------------------
   */

  var currentPick =
    Number(context.currentPick) || 0;

  var teams =
    Number(context.teams) || 10;

  var draftWindow =
    calculateMyNextDraftPick(
      currentPick,
      teams
    );

  var nextPick =
    Number(
      context.calculatedNextPick ||
      context.nextPick ||
      draftWindow.nextPick
    ) || 0;

  if (!nextPick) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * AVAILABLE PLAYERS AT THIS POSITION
   * -------------------------------------------------------
   */

 var currentPlayerRank =
  Number(player.rank) || 999;

var positionPool =
  players
    .filter(function(candidate) {

      if (
        !candidate ||
        candidate.available === false ||
        (
          candidate.position ||
          candidate.pos
        ) !== position ||
        candidate.name === player.name ||
        !candidate.rank ||
        !hasAuthoritativeEcr(candidate)
      ) {
        return false;
      }

      /*
       * Future alternatives must be ranked AFTER
       * the player we're considering now.
       *
       * A player ranked ahead of Burrow cannot be
       * treated as a future Burrow alternative.
       */
      return (
        Number(candidate.rank) >
        currentPlayerRank
      );

    })
    .slice()
    .sort(function(a, b) {

      return (
        Number(a.rank) -
        Number(b.rank)
      );

    });

  if (!positionPool.length) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * PROJECT LIKELY SURVIVORS
   * -------------------------------------------------------
   *
   * Run the existing survival model against players
   * from the same position.
   */

  var projected =
    positionPool.map(function(candidate) {

      var candidateForSurvival =
        Object.assign(
          {},
          candidate
        );

      var survival =
        calculateNextPickSurvival(
          candidateForSurvival,
          Object.assign(
            {},
            context,
            {
              calculatedNextPick:
                nextPick,

              currentRank:
                Number(player.rank) || 999
            }
          )
        );

      return {
        player:
          candidate,

        survival:
          survival
      };

    });


 /*
 * -------------------------------------------------------
 * QUALITY-WEIGHTED FUTURE DEPTH
 * -------------------------------------------------------
 *
 * Count alone is not enough.
 *
 * Five mediocre players surviving should not equal
 * five high-quality alternatives.
 */

var realisticOptions =
  projected
    .filter(function(item) {

      return (
        Number(item.survival) >= 35
      );

    })
    .map(function(item) {

      var candidateRank =
        Number(item.player.rank) || 999;

      var currentRank =
        Number(player.rank) || 999;


      /*
       * Rank quality relative to the player being
       * considered now.
       *
       * Small rank drop = strong future quality.
       */

      var rankDrop =
        Math.max(
          0,
          candidateRank - currentRank
        );


      var rankQuality =
        Math.max(
          0,
          100 - (rankDrop * 3)
        );


      /*
       * Combine player quality and probability
       * of actually surviving.
       */

      var futureValue =
        (
          rankQuality * 0.60
        ) +
        (
          Number(item.survival) * 0.40
        );


      return {
        player:
          item.player,

        survival:
          item.survival,

        rankDrop:
          rankDrop,

        rankQuality:
          rankQuality,

        futureValue:
          futureValue
      };

    })
    .sort(function(a, b) {

      return (
        Number(b.futureValue) -
        Number(a.futureValue)
      );

    });


if (!realisticOptions.length) {
  return 0;
}


/*
 * -------------------------------------------------------
 * USE THE BEST THREE FUTURE OPTIONS
 * -------------------------------------------------------
 *
 * We care much more about the quality of the first few
 * alternatives than whether 10 mediocre players survive.
 */

var topOptions =
  realisticOptions.slice(0, 3);

var totalFutureValue =
  topOptions.reduce(
    function(total, item) {

      return (
        total +
        Number(item.futureValue || 0)
      );

    },
    0
  );


var averageFutureValue =
  totalFutureValue /
  topOptions.length;


/*
 * Small bonus for having multiple realistic options.
 */

var depthBonus =
  Math.min(
    10,
    Math.max(
      0,
      realisticOptions.length - 1
    ) * 2
  );


var depthScore =
  averageFutureValue +
  depthBonus;


/*
 * Clamp 0–100.
 */

depthScore =
  Math.max(
    0,
    Math.min(
      100,
      depthScore
    )
  );


return Math.round(
  depthScore
);

}

function calculateFutureDepthOpportunity(
  player,
  context
) {

  var depth =
    calculateFuturePositionDepth(
      player,
      context
    );

  /*
   * -------------------------------------------------------
   * FUTURE DEPTH OPPORTUNITY
   * -------------------------------------------------------
   *
   * Low future depth:
   *   stronger reason to draft now.
   *
   * High future depth:
   *   safer to wait.
   *
   * Keep this intentionally small so it does not
   * overpower VORP, tiers, scarcity, or roster need.
   */

  var score = 0;


  if (depth <= 25) {

    score = 2.5;

  } else if (depth <= 40) {

    score = 1.75;

  } else if (depth <= 55) {

    score = 1;

  } else if (depth <= 70) {

    score = 0.25;

  } else if (depth <= 85) {

    score = -0.5;

  } else {

    score = -1;

  }


  return score;
}

function calculateNextPickSurvival(
  candidate,
  context
) {

  if (!candidate) {
    return 0;
  }

  context =
    context || {};

var currentPick =
  Number(context.currentPick) || 0;


var nextPick =
  Number(
    context.calculatedNextPick ||
    context.nextPick
  ) || 0;


/*
 * -------------------------------------------------------
 * REUSE PRECOMPUTED DRAFT WINDOW
 * -------------------------------------------------------
 *
 * The live draft context already knows how many picks
 * occur before our next selection. Do not rebuild the
 * draft state thousands of times during survival
 * projections.
 */

var picksUntilNext =
  Number(
    context.calculatedPicksUntilNext
  );


if (!Number.isFinite(picksUntilNext)) {

  var teams =
    Number(context.teams) || 10;


  var draftWindow =
    calculateMyNextDraftPick(
      currentPick,
      teams
    );


  picksUntilNext =
    draftWindow
      ? Number(
          draftWindow.picksBetween
        ) || 0
      : 0;

}

  /*
 * -------------------------------------------------------
 * BACK-TO-BACK PICK GUARANTEE
 * -------------------------------------------------------
 */

var picksBetween =
  Number(
    context.calculatedPicksUntilNext
  );


if (
  !Number.isFinite(picksBetween)
) {

  picksBetween =
    Math.max(
      0,
      nextPick -
      currentPick -
      1
    );

}


if (picksBetween <= 0) {

  return 100;

}

var rank =
  getFantasyProsMarketRank(candidate, context);

/* No ESPN or FantasyPros ADP means market survival is unknown. */
if (!Number.isFinite(rank)) {
  return 50;
}

  /*
 * -------------------------------------------------------
 * SURVIVAL RESULT CACHE
 * -------------------------------------------------------
 *
 * Survival is recalculated thousands of times with the
 * same player/window inputs during one engine refresh.
 * Cache those duplicate calculations on the current
 * draft context.
 *
 * Disable cache while DRAFT_DEBUG is active so debugging
 * still records every calculation.
 */

var survivalCacheEnabled =
  !(
    typeof DRAFT_DEBUG !== 'undefined' &&
    DRAFT_DEBUG &&
    typeof DRAFT_DEBUG.add === 'function'
  );


if (
  survivalCacheEnabled &&
  !context.nextPickSurvivalCache
) {

  context.nextPickSurvivalCache =
    {};

}


var position =
  candidate.position ||
  candidate.pos ||
  'N/A';


var survivalCacheKey =
  [
    position,
    rank,
    currentPick,
    nextPick,
    picksBetween
  ].join('|');


if (
  survivalCacheEnabled &&
  Object.prototype.hasOwnProperty.call(
    context.nextPickSurvivalCache,
    survivalCacheKey
  )
) {

  return context.nextPickSurvivalCache[
    survivalCacheKey
  ];

}
  
/*
 * ESPN ADP is the center of the market distribution when the companion has
 * supplied it; otherwise FantasyPros ADP is the player-level fallback.
 * A candidate with ADP equal to our next pick starts at 50%
 * survival; each ADP step later raises survival smoothly.
 */
var marketDistance = rank - nextPick;
var marketSpread = Math.max(5, Math.min(10, picksBetween * 0.5));
var marketSurvival = 100 / (1 + Math.exp(-marketDistance / marketSpread));

var opponentThreat = context.skipOpponentThreat
  ? 0
  : calculateOpponentDraftThreat(
      candidate,
      context
    );

var opponentThreatPenalty =
  -(opponentThreat * 0.15);

var survival =
  marketSurvival +
  opponentThreatPenalty;

/*
 * -------------------------------------------------------
 * CLAMP
 * -------------------------------------------------------
 */

survival =
  Math.max(
    0,
    Math.min(
      100,
      survival
    )
  );

  if (
  typeof DRAFT_DEBUG !== 'undefined' &&
  DRAFT_DEBUG &&
  typeof DRAFT_DEBUG.add === 'function'
) {

  DRAFT_DEBUG.add(
    'SURVIVAL',
    {
      player:
        candidate.name,

      currentPick:
        currentPick,

      nextPick:
        nextPick,

      picksUntilNext:
        picksUntilNext,

      candidateRank:
        rank,

      marketDistance:
        marketDistance,

      marketSpread:
        marketSpread,

      marketSurvival:
        marketSurvival,

      opponentThreat:
  opponentThreat,

opponentThreatPenalty:
  opponentThreatPenalty,

      finalSurvival:
        survival
    }
  );

}

  if (survivalCacheEnabled) {

  context.nextPickSurvivalCache[
    survivalCacheKey
  ] =
    survival;

}


return survival;
}

function calculateRecommendationConfidence(
  player,
  nextPlayer,
  context
) {

  if (!player) {
    return 0;
  }

  context = context || {};

  var confidence = 0;

  var score =
    Number(player.recommendationPriorityScore);

  if (!Number.isFinite(score)) {
    score = Number(player.finalScore) || 0;
  }

  var nextScore =
    nextPlayer
      ? Number(nextPlayer.finalScore) || 0
      : 0;

  var scoreGap =
    score - nextScore;


  /*
   * -------------------------------------------------------
   * 1. SCORE GAP
   * -------------------------------------------------------
   */

  if (scoreGap >= 10) {

    confidence += 30;

  } else if (scoreGap >= 7) {

    confidence += 25;

  } else if (scoreGap >= 5) {

    confidence += 20;

  } else if (scoreGap >= 3) {

    confidence += 15;

  } else if (scoreGap >= 1) {

    confidence += 8;

  }


  /*
   * -------------------------------------------------------
   * 2. VORP ADVANTAGE
   * -------------------------------------------------------
   */

  var playerVorp =
    Number(player.vorpScore) || 0;

  var nextVorp =
    nextPlayer
      ? Number(nextPlayer.vorpScore) || 0
      : 0;

  var vorpDifference =
    playerVorp - nextVorp;

  if (vorpDifference >= 20) {

    confidence += 20;

  } else if (vorpDifference >= 10) {

    confidence += 15;

  } else if (vorpDifference >= 5) {

    confidence += 10;

  } else if (vorpDifference >= 2) {

    confidence += 5;

  }


  /*
   * -------------------------------------------------------
   * 3. TIER ADVANTAGE
   * -------------------------------------------------------
   */

  var playerTier =
    Number(player.tierScore) || 0;

  var nextTier =
    nextPlayer
      ? Number(nextPlayer.tierScore) || 0
      : 0;

  var tierDifference =
    playerTier - nextTier;

  if (tierDifference >= 20) {

    confidence += 15;

  } else if (tierDifference >= 10) {

    confidence += 10;

  } else if (tierDifference >= 5) {

    confidence += 6;

  } else if (tierDifference >= 2) {

    confidence += 3;

  }


  /*
   * -------------------------------------------------------
   * 4. TIMING
   * -------------------------------------------------------
   */

  var timing =
    Number(player.timingScore) || 0;

  if (timing >= 80) {

    confidence += 10;

  } else if (timing >= 65) {

    confidence += 7;

  } else if (timing >= 50) {

    confidence += 4;

  }


  /*
   * -------------------------------------------------------
   * 5. SCARCITY
   * -------------------------------------------------------
   */

  var scarcity =
    Number(player.scarcityScore) || 0;

  if (scarcity >= 80) {

    confidence += 10;

  } else if (scarcity >= 60) {

    confidence += 7;

  } else if (scarcity >= 40) {

    confidence += 4;

  }


  /*
   * -------------------------------------------------------
   * 6. ROSTER NEED
   * -------------------------------------------------------
   */

  var need =
    Number(player.rosterNeedScore) || 0;

  if (need >= 3) {

    confidence += 5;

  } else if (need >= 2) {

    confidence += 3;

  }


  /*
   * -------------------------------------------------------
   * 7. DRAFT-AWARE VORP
   * -------------------------------------------------------
   */

  var draftAware =
    Number(
      player.draftAwareVorpOpportunityScore
    ) || 0;

  if (draftAware >= 8) {

    confidence += 10;

  } else if (draftAware >= 5) {

    confidence += 7;

  } else if (draftAware >= 3) {

    confidence += 4;

  }


  /*
   * -------------------------------------------------------
   * 8. TIER CLIFF
   * -------------------------------------------------------
   */

  var tierCliff =
    Number(
      player.tierCliffOpportunityScore
    ) || 0;

  if (tierCliff >= 8) {

    confidence += 10;

  } else if (tierCliff >= 5) {

    confidence += 7;

  } else if (tierCliff >= 3) {

    confidence += 4;

  }


  /*
   * -------------------------------------------------------
   * 9. NEXT-PICK SURVIVAL
   * -------------------------------------------------------
   */

  if (nextPlayer) {

    var survival =
      Number(
        nextPlayer.nextPickSurvivalScore
      ) || 0;

    if (survival >= 80) {

      confidence += 5;

    } else if (survival >= 60) {

      confidence += 3;

    }

  }


  /*
   * -------------------------------------------------------
   * CAP
   * -------------------------------------------------------
   */

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(confidence)
    )
  );

}

function calculateDraftRecommendation(
  player,
  scoredPlayers,
  context
) {

  if (!player) {
    return null;
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

  var score =
    Number(player.finalScore) || 0;


  /*
   * -------------------------------------------------------
   * 2. NEXT BEST PLAYER
   * -------------------------------------------------------
   *
   * scoredPlayers should already be sorted with
   * the highest-scoring player first.
   */

  var nextPickAlternatives =
  calculateNextPickAlternatives(
    player,
    scoredPlayers,
    context
  );

  nextPickAlternatives.forEach(function(candidate) {

  candidate.nextPickSurvivalScore =
    calculateNextPickSurvival(
      candidate,
      context
    );

  candidate.survivalAdjustedScore =
    (
      Number(candidate.finalScore) || 0
    ) *
    (
      Number(candidate.nextPickSurvivalScore) || 0
    ) / 100;

});

  draftScoringLog(
  'NEXT PICK OPPORTUNITY:',
  player.name,
  nextPickAlternatives.map(function(candidate) {

    return {
      name: candidate.name,
      rank: candidate.rank,
      finalScore:
        Number(candidate.finalScore) || 0,
      survival:
        Number(candidate.nextPickSurvivalScore) || 0,
      survivalAdjustedScore:
        Number(
          candidate.survivalAdjustedScore
        ) || 0
    };

  })
);

var nextPlayer =
  nextPickAlternatives.length
    ? nextPickAlternatives
        .slice()
        .sort(function(a, b) {

          return (
            Number(b.survivalAdjustedScore || 0) -
            Number(a.survivalAdjustedScore || 0)
          );

        })[0]
    : null;

  draftDebugSection(
  'NEXT PICK WINNER',
  [{
    currentPlayer:
      player.name,

    nextPlayer:
      nextPlayer
        ? nextPlayer.name
        : null,

    rawScore:
      nextPlayer
        ? Number(nextPlayer.finalScore) || 0
        : 0,

    survival:
      nextPlayer
        ? Number(nextPlayer.nextPickSurvivalScore) || 0
        : 0,

    survivalAdjustedScore:
      nextPlayer
        ? Number(nextPlayer.survivalAdjustedScore) || 0
        : 0
  }]
);

var nextPickFallback =
  nextPlayer;

var nextScore =
  nextPlayer
    ? Number.isFinite(Number(nextPlayer.recommendationPriorityScore))
      ? Number(nextPlayer.recommendationPriorityScore)
      : Number(nextPlayer.finalScore) || 0
    : 0;

var rawScoreGap =
  score - nextScore;

var scoreGap =
  rawScoreGap;


  /*
   * -------------------------------------------------------
   * 5. CONFIDENCE SCORE
   * -------------------------------------------------------
   */

  var confidenceScore =
    calculateRecommendationConfidence(
      player,
      nextPlayer,
      context
    );


  /*
   * -------------------------------------------------------
   * 6. CONFIDENCE LEVEL
   * -------------------------------------------------------
   */

  var confidence =
    'LOW';

  if (confidenceScore >= 80) {

    confidence =
      'VERY HIGH';

  } else if (confidenceScore >= 65) {

    confidence =
      'HIGH';

  } else if (confidenceScore >= 45) {

    confidence =
      'MODERATE';
  }


 /*
 * -------------------------------------------------------
 * 7. DECISION LAYER
 * -------------------------------------------------------
 */

var picksBetween =
  Number(
    context.calculatedPicksUntilNext
  );


if (!Number.isFinite(picksBetween)) {

  picksBetween =
    Number(
      context.picksBetween
    );

}


if (!Number.isFinite(picksBetween)) {

  var currentPick =
    Number(
      context.currentPick
    ) || 0;

  var nextPick =
    Number(
      context.calculatedNextPick ||
      context.nextPick
    ) || 0;


  if (
    currentPick > 0 &&
    nextPick > 0
  ) {

    picksBetween =
      Math.max(
        0,
        nextPick -
        currentPick -
        1
      );

  }

}


var backToBackTurn =
  (
    Number.isFinite(picksBetween) &&
    picksBetween === 0
  );


var decision =
  calculateRecommendationDecision(
    player,
    nextPlayer,
    scoreGap,
    confidenceScore,
    context
  );

var urgentEcrLeader =
  Number(player.recommendationSurvival) < 35 &&
  scoredPlayers.some(function(candidate) {
    return candidate && candidate.marketEcrGuardrail;
  });

if (
  urgentEcrLeader &&
  decision &&
  (decision.recommendation === 'WAIT' || decision.recommendation === 'PASS')
) {
  decision.recommendation = 'CONSIDER';
  decision.summary = 'This stronger ECR value is unlikely to survive while the positional alternative can wait.';
}

alignRecommendationActionWithMarketTiming(decision, player, backToBackTurn);

if (
  decision &&
  decision.recommendation === 'DRAFT' &&
  scoreGap < 0 &&
  !backToBackTurn
) {
  decision.recommendation = 'CONSIDER';
  decision.summary = 'Board pressure is high, but a stronger available option still leads the recommendation.';
}


/*
 * -------------------------------------------------------
 * BACK-TO-BACK TURN OVERRIDE
 * -------------------------------------------------------
 */

if (
  backToBackTurn &&
  decision &&
  decision.recommendation !== 'PASS'
) {

  decision.recommendation =
    'DRAFT';

  decision.summary =
    'Back-to-back pick: treat this as a two-pick turn package rather than a wait decision.';

}


  /*
   * -------------------------------------------------------
   * 8. PRIMARY REASON
   * -------------------------------------------------------
   */

  var reason =
    'Best overall draft value';


  if (
    Number(player.tierScore) >= 90 &&
    Number(player.vorpScore) >= 80
  ) {

    reason =
      'Elite tier and VORP value';

  } else if (
    Number(player.vorpScore) >= 80
  ) {

    reason =
      'Elite value over replacement';

  } else if (
    Number(player.tierScore) >= 90
  ) {

    reason =
      'Elite player tier';

  } else if (
    Number(player.tierCliffOpportunityScore) >= 5
  ) {

    reason =
      'Major tier cliff opportunity';

  } else if (
    Number(player.timingScore) >= 70
  ) {

    reason =
      'High availability risk';

  } else if (
    Number(player.scarcityScore) >= 90
  ) {

    reason =
      'Strong positional scarcity';

  } else if (
    Number(player.rosterNeedScore) >= 2
  ) {

    reason =
      'Fills an important roster need';
  }


  /*
   * -------------------------------------------------------
   * 9. CLOSE ALTERNATIVE
   * -------------------------------------------------------
   */

  var closeAlternative =
    null;

  if (
    nextPlayer &&
    Math.abs(scoreGap) < 2
  ) {

    closeAlternative =
      nextPlayer.name;
  }


  /*
   * -------------------------------------------------------
   * 10. DEBUG
   * -------------------------------------------------------
   */

  draftDebugSection(
  'PLAYER SCORE: ' + player.name,
  [{
    player:
      player.name,

    position:
      player.position,

    rank:
      Number(player.rank) || 999,

    finalScore:
      Number(player.finalScore) || 0,

    tierScore:
      Number(player.tierScore) || 0,

    vorpScore:
      Number(player.vorpScore) || 0,

    timingScore:
      Number(player.timingScore) || 0,

    scarcityScore:
      Number(player.scarcityScore) || 0,

    rosterNeedScore:
      Number(player.rosterNeedScore) || 0,

    draftAwareVorp:
      Number(
        player.draftAwareVorpOpportunityScore
      ) || 0,

    tierCliff:
      Number(
        player.tierCliffOpportunityScore
      ) || 0
  }]
);
  
  draftDebugSection(
  'DECISION: ' + player.name,
  [{
    player:
      player.name,

    position:
      player.position,

    playerScore:
      score,

    nextPlayer:
      nextPlayer
        ? nextPlayer.name
        : null,

    nextPlayerRawScore:
      nextScore,

    nextPlayerSurvival:
      nextPlayer
        ? Number(
            nextPlayer.nextPickSurvivalScore
          ) || 0
        : 0,

    nextPlayerAdjustedScore:
      nextPlayer
        ? Number(
            nextPlayer.survivalAdjustedScore
          ) || 0
        : 0,

    scoreGap:
      scoreGap,

    confidenceScore:
      confidenceScore,

    confidence:
      confidence,

backToBackTurn:
  backToBackTurn,

    recommendation:
      decision.recommendation,

    reason:
      reason
  }]
);


  /*
   * -------------------------------------------------------
   * 11. RETURN
   * -------------------------------------------------------
   */

  return {

    player:
      player.name,

    position:
      player.position,

    score:
      score,

    nextBest:
      nextPlayer
        ? nextPlayer.name
        : null,

    nextBestScore:
      nextScore,

    scoreGap:
      scoreGap,

    confidence:
      confidence,

    confidenceScore:
      confidenceScore,

    recommendation:
      decision.recommendation,

    backToBackTurn:
  backToBackTurn,

    reason:
      reason,

    urgencyBonus:
      decision.urgencyBonus || 0,

    summary:
      decision.summary,

    closeAlternative:
      closeAlternative
  };
}

function buildRecommendationExplanation(
  recommendation,
  playerResult,
  comparisonResult
) {

  if (!recommendation) {

    return null;

  }


  var action =
    recommendation.recommendation ||
    'CONSIDER';


  var confidence =
    recommendation.confidence ||
    'LOW';


  var player =
    recommendation.player ||
    'Best available player';


var reasons = [];


function addReason(
  text,
  priority
) {

  if (!text) {

    return;

  }


  reasons.push({

    text:
      text,

    priority:
      Number(priority) || 0

  });

}


  /*
   * -------------------------------------------------------
   * TURN-PACKAGE EXPLANATION
   * -------------------------------------------------------
   */

  if (
    recommendation.turnPackageActive &&
    recommendation.turnRecommendedNow &&
    recommendation.turnTargetNext
  ) {

    var turnNow =
      recommendation.turnRecommendedNow;


    var turnNext =
      recommendation.turnTargetNext;


    var advantage =
      Number(
        recommendation.turnPackageAdvantage
      ) || 0;


    addReason(
  turnNow +
  ' + ' +
  turnNext +
  ' is the strongest two-pick turn package.',
  100
);


addReason(
  turnNext +
  ' is guaranteed to remain available at your next pick because no opponent selects between the two picks.',
  95
);


if (advantage > 0) {

  addReason(
    'This package leads the next-best turn option by ' +
    advantage.toFixed(1) +
    ' points.',
    90
  );

}


    return {

      type:
        'TURN_PACKAGE',

      action:
        'DRAFT',

      headline:
        'Draft ' +
        turnNow,

      player:
        turnNow,

      confidence:
        recommendation.turnPackageConfidence ||
        confidence,

      reasons:
  reasons
    .slice()
    .sort(function(a, b) {

      return (
        Number(b.priority) -
        Number(a.priority)
      );

    })
    .slice(0, 4)
    .map(function(reason) {

      return reason.text;

    }),

      nextAction:
        'Target ' +
        turnNext +
        ' with your next pick.',

      nextTarget:
        turnNext

    };

  }


  /*
   * -------------------------------------------------------
   * NORMAL SINGLE-PICK EXPLANATION
   * -------------------------------------------------------
   */

/*
 * -------------------------------------------------------
 * DEEP ENGINE EXPLANATION
 * -------------------------------------------------------
 */

var deepExplanation =
  playerResult
    ? generateDecisionExplanation(
        playerResult,
        comparisonResult || null
      )
    : null;


if (
  deepExplanation &&
  deepExplanation.primaryReason
) {

addReason(
  'Primary edge: ' +
  deepExplanation.primaryReason +
  '.',
  80
);

} else if (recommendation.reason) {

  addReason(
    recommendation.reason + '.',
    80
  );

}

/*
 * -------------------------------------------------------
 * DRAFT PHASE CONTEXT
 * -------------------------------------------------------
 */

if (
  playerResult &&
  playerResult.draftPhase
) {

  if (
    playerResult.draftPhase ===
    'FOUNDATION'
  ) {

    addReason(
      'Foundation phase favors elite talent and value over forcing positional need.',
      55
    );

  } else if (
    playerResult.draftPhase ===
    'STARTER BUILD'
  ) {

    addReason(
      'Starter-build phase increases the importance of filling strong lineup needs.',
      55
    );

  } else if (
    playerResult.draftPhase ===
    'VALUE / DEPTH'
  ) {

    addReason(
      'Value/depth phase puts more weight on scarcity and remaining positional value.',
      50
    );

  } else if (
    playerResult.draftPhase ===
    'UPSIDE / ENDGAME'
  ) {

    addReason(
      'Endgame phase prioritizes upside, roster completion, and remaining positional requirements.',
      60
    );

  }

}

/*
 * -------------------------------------------------------
 * SPECIAL STRATEGIC SIGNALS
 * -------------------------------------------------------
 */

if (playerResult) {

  if (
    Number(
      playerResult.tierCliffOpportunityScore
    ) >= 5
  ) {

    addReason(
  'A significant tier cliff makes this player more valuable to take now.',
  95
);

  }


  if (
    Number(
      playerResult.scarcityScore
    ) >= 90
  ) {

    addReason(
  'This position currently has elite scarcity value.',
  70
);

  }


  if (
    Number(
      playerResult.rosterSaturationPenalty
    ) < 0
  ) {

    addReason(
  'Roster saturation reduces the value of adding another player at this position.',
  85
);

  }


  if (
    Number(
      playerResult.timingScore
    ) >= 70
  ) {

    addReason(
  'There is high risk this player will be gone before your next selection.',
  90
);

  }

}

 var scoreGap =
  Number(
    recommendation.scoreGap
  );


if (
  Number.isFinite(scoreGap) &&
  recommendation.nextBest
) {

  if (scoreGap >= 8) {

    addReason(
      player +
      ' leads ' +
      recommendation.nextBest +
      ' by ' +
      scoreGap.toFixed(1) +
      ' points.',
      88
    );

  } else if (scoreGap >= 3) {

    addReason(
      player +
      ' holds a meaningful advantage over ' +
      recommendation.nextBest +
      '.',
      72
    );

  } else if (Math.abs(scoreGap) < 3) {

    addReason(
      recommendation.nextBest +
      ' is a close alternative.',
      50
    );

  }

}

 /*
 * -------------------------------------------------------
 * DECISION-SPECIFIC EXPLANATION
 * -------------------------------------------------------
 */

if (action === 'DRAFT') {

  if (
    recommendation.confidence ===
      'VERY HIGH' ||
    recommendation.confidence ===
      'HIGH'
  ) {

    addReason(
      'The current value is strong enough that waiting is not recommended.',
      75
    );

  }

} else if (action === 'WAIT') {

  if (recommendation.nextBest) {

    addReason(
      'Comparable value should still be available at your next selection.',
      82
    );

  }

} else if (action === 'PASS') {

  addReason(
    'The current player does not provide enough value relative to the alternatives.',
    95
  );

} else if (action === 'CONSIDER') {

  addReason(
    'The decision is close enough that roster construction and draft strategy should break the tie.',
    65
  );

}


  /*
   * -------------------------------------------------------
   * NEXT ACTION
   * -------------------------------------------------------
   */

  var nextAction = '';


  if (action === 'DRAFT') {

    nextAction =
      'Take ' +
      player +
      ' now.';

  } else if (action === 'WAIT') {

    nextAction =
      'Wait and reassess at your next pick.';

  } else if (action === 'PASS') {

    nextAction =
      'Pass and move to the next-best option.';

  } else {

    nextAction =
      'Compare the close alternatives before making the pick.';

  }


  return {

    type:
      'SINGLE_PICK',

    action:
      action,

    headline:
      action.charAt(0) +
      action.slice(1).toLowerCase() +
      ' ' +
      player,

    player:
      player,

    confidence:
      confidence,

   reasons:
  reasons
    .slice()
    .sort(function(a, b) {

      return (
        Number(b.priority) -
        Number(a.priority)
      );

    })
    .slice(0, 4)
    .map(function(reason) {

      return reason.text;

    }),

    nextAction:
      nextAction,

    nextTarget:
      recommendation.nextBest ||
      null

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

  if (result.rosterNeedScore >= 50) {

    positives.push(
      'Strong roster need'
    );

  } else if (result.rosterNeedScore >= 25) {

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

function calculateDecisionRosterNeeds(suppliedCounts){

  var counts = suppliedCounts || {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  if (!suppliedCounts) document
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

  draftScoringLog('ROSTER NEEDS:', needs);

  return needs;
}

function calculateRosterConstructionValue(
  player,
  context
) {

  if (!player) {
    return 0;
  }

  context =
    context || {};

  var position =
    player.position ||
    player.pos ||
    null;

  if (
    !position ||
    !['QB', 'RB', 'WR', 'TE'].includes(position)
  ) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * CURRENT ROSTER NEEDS
   * -------------------------------------------------------
   */

  var needs =
    context.rosterNeeds ||
    calculateDecisionRosterNeeds();


  var dedicatedNeed =
    Number(needs[position]) || 0;

  var flexNeed =
    Number(needs.FLEX) || 0;


  /*
   * -------------------------------------------------------
   * BASE ROSTER-CONSTRUCTION VALUE
   * -------------------------------------------------------
   *
   * This score is intentionally small.
   *
   * It should influence the decision,
   * not overpower tier / VORP / ranking.
   */

  var value = 0;


  /*
   * Dedicated starting slot still open.
   */

  if (dedicatedNeed > 0) {

    value += 3;

  }


  /*
   * FLEX still open.
   *
   * Only RB / WR / TE qualify.
   */

  if (
    flexNeed > 0 &&
    (
      position === 'RB' ||
      position === 'WR' ||
      position === 'TE'
    )
  ) {

    value += 1;

  }


  /*
   * -------------------------------------------------------
   * STARTER PRIORITY
   * -------------------------------------------------------
   *
   * Filling a true starter vacancy should matter more
   * than simply adding FLEX/depth.
   */

  if (
    dedicatedNeed > 0 &&
    position === 'QB'
  ) {

    value += 1;

  }


  /*
   * -------------------------------------------------------
   * OVERSTOCK PROTECTION
   * -------------------------------------------------------
   *
   * If the dedicated position is already filled and
   * FLEX is also covered, reduce the value of adding
   * another player at that position.
   */

  if (
    dedicatedNeed <= 0 &&
    (
      position === 'QB' ||
      flexNeed <= 0
    )
  ) {

    value -= 2;

  }

  /* Once the starter-build phase begins, a zero-RB roster with an already
   * filled WR requirement needs a modest tie-breaker. This remains bounded
   * support: it cannot erase a meaningful ECR/value gap by itself. */
  var counts = context.rosterCounts || {};
  var round = Math.ceil(
    (Number(context.currentPick) || 1) /
    Math.max(1, Number(context.teams) || 10)
  );
  if (round >= 4 && Number(counts.RB) === 0 && Number(counts.WR) >= 2) {
    if (position === 'RB') value += 2;
    if (position === 'WR') value -= 2;
  }


  /*
   * -------------------------------------------------------
   * CLAMP
   * -------------------------------------------------------
   *
   * Keep roster construction as a supporting signal.
   */

  value =
    Math.max(
      -2,
      Math.min(
        5,
        value
      )
    );


  return value;
}

function calculateByeWeekCongestionAdjustment(player, context) {
  player = player || {};
  context = context || {};
  var bye = String(player.bye || (player.row && player.row.getAttribute('data-bye')) || '').trim();
  if (!bye || bye === '--' || bye === '-' || bye === '0') return 0;

  var byeCounts = context.rosterByeCounts ||
    (getDraftAssistantRosterState().byeCounts || {});
  var existing = Number(byeCounts[bye]) || 0;
  if (existing < 3) return 0;

  var adjustment = existing === 3 ? -2 : existing === 4 ? -9 : -12;
  var round = Math.ceil((Number(context.currentPick) || 1) / Math.max(1, Number(context.teams) || 10));
  if (round <= 4) adjustment *= 0.5;
  else if (round <= 7) adjustment *= 0.75;

  var position = player.position || player.pos;
  if (existing >= 4 && (position === 'QB' || position === 'TE')) adjustment -= 1;
  return Math.max(-12, Number(adjustment.toFixed(2)));
}

function calculateRosterSaturationPenalty(
  player,
  context
) {

  if (!player) {
    return 0;
  }

  context =
    context || {};

  var position =
    player.position ||
    player.pos ||
    null;

  if (
    !position ||
    !['QB', 'RB', 'WR', 'TE'].includes(position)
  ) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * CURRENT ROSTER COUNTS
   * -------------------------------------------------------
   */

  var counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0
  };


  document
    .querySelectorAll(
      'tr.draftrow.drafted-mine'
    )
    .forEach(function(row) {

      var pos =
        row.getAttribute(
          'data-pos'
        );

      if (
        pos &&
        counts[pos] !== undefined
      ) {

        counts[pos]++;

      }

    });


  var currentCount =
    Number(
      counts[position]
    ) || 0;


  /*
   * -------------------------------------------------------
   * POSITION SATURATION
   * -------------------------------------------------------
   *
   * Negative numbers are penalties.
   *
   * These are intentionally soft until the roster
   * becomes clearly overstocked.
   */

  var penalty = 0;


if (position === 'RB') {

  /*
   * RB1-RB4:
   * normal roster construction.
   *
   * RB5:
   * mild depth penalty.
   *
   * RB6:
   * meaningful saturation.
   *
   * RB7+:
   * must be exceptional value.
   */

  if (currentCount >= 7) {

    penalty = -16;

  } else if (currentCount === 6) {

    penalty = -12;

  } else if (currentCount === 5) {

    penalty = -6;

  } else if (currentCount === 4) {

    penalty = -2;

  }

} else if (position === 'WR') {

    if (currentCount >= 7) {

      penalty = -10;

    } else if (currentCount === 6) {

      penalty = -6;

    } else if (currentCount === 5) {

      penalty = -3;

    }


  } else if (position === 'QB') {

    if (currentCount >= 2) {

      penalty = -10;

    } else if (currentCount === 1) {

      penalty = -4;

    }


  } else if (position === 'TE') {

    if (currentCount >= 3) {

      penalty = -10;

    } else if (currentCount === 2) {

      penalty = -6;

    } else if (currentCount === 1) {

      penalty = -2;

    }

  }


  /*
   * -------------------------------------------------------
   * BENCH BALANCE
   * -------------------------------------------------------
   *
   * If one position is heavily stocked while the other
   * main FLEX position is thin, increase the penalty.
   */

if (
  position === 'RB'
) {

  /*
   * If RB depth is substantially ahead of WR depth,
   * discourage further concentration.
   */

  var rbWrDifference =
    counts.RB - counts.WR;


  if (
    counts.RB >= 5 &&
    rbWrDifference >= 3
  ) {

    penalty -= 4;

  } else if (
    counts.RB >= 5 &&
    rbWrDifference >= 2
  ) {

    penalty -= 2;

  }

}


  if (
    position === 'WR' &&
    counts.WR >= 5 &&
    counts.RB <= 2
  ) {

    penalty -= 3;

  }


  return penalty;
}

function calculateEndgameRosterRequirement(
  player,
  context
) {

  if (!player) {
    return 0;
  }

  context =
    context || {};

  var position =
    player.position ||
    player.pos ||
    null;

  var currentPick =
    Number(context.currentPick) || 0;

  var teams =
    Number(context.teams) || 10;

  var rounds =
    Number(context.rounds) ||
    Number(
      context.draftState && context.draftState.rounds
    ) ||
    Number(getDraftAssistantState().rounds) ||
    16;


  if (
    !position ||
    currentPick <= 0 ||
    teams <= 0 ||
    rounds <= 0
  ) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * CURRENT ROUND
   * -------------------------------------------------------
   */

  var round =
    Math.ceil(
      currentPick / teams
    );


  /*
   * -------------------------------------------------------
   * CURRENT ROSTER COUNTS
   * -------------------------------------------------------
   */

  var counts = context.rosterCounts || getDraftAssistantRosterState().counts;


  var kNeeded =
    counts.K <= 0;

  var dstNeeded =
    counts.DST <= 0;


  /*
   * -------------------------------------------------------
   * ENDGAME TIMING
   * -------------------------------------------------------
   *
   * We want K/DST late, not early.
   */

  var finalRound =
    rounds;

  var secondLastRound =
    Math.max(
      1,
      rounds - 1
    );

  var thirdLastRound =
    Math.max(
      1,
      rounds - 2
    );


  var adjustment = 0;


  /*
   * -------------------------------------------------------
   * TOO EARLY
   * -------------------------------------------------------
   *
   * Strongly discourage K/DST before the final
   * few rounds.
   */

  if (
    round < thirdLastRound
  ) {

    if (
      position === 'K' ||
      position === 'DST'
    ) {

      adjustment -= 15;

    }

    return adjustment;
  }


  /*
   * -------------------------------------------------------
   * THIRD-LAST ROUND
   * -------------------------------------------------------
   *
   * They may begin entering consideration, but should
   * not dominate yet.
   */

  if (
    round === thirdLastRound
  ) {

    if (
      position === 'K' &&
      kNeeded
    ) {
      adjustment += 2;
    }

    if (
      position === 'DST' &&
      dstNeeded
    ) {
      adjustment += 2;
    }

  }


  /*
   * -------------------------------------------------------
   * SECOND-LAST ROUND
   * -------------------------------------------------------
   *
   * Missing K/DST now becomes important.
   */

  if (
    round === secondLastRound
  ) {

    if (
      position === 'K' &&
      kNeeded
    ) {
      adjustment += 12;
    }

    if (
      position === 'DST' &&
      dstNeeded
    ) {
      adjustment += 12;
    }


    /*
     * Discourage another bench skill player while
     * both required endgame positions are still empty.
     */

    if (
      kNeeded &&
      dstNeeded &&
      position !== 'K' &&
      position !== 'DST'
    ) {

      adjustment -= 8;

    }

  }


  /*
   * -------------------------------------------------------
   * FINAL ROUND
   * -------------------------------------------------------
   */

  if (
    round >= finalRound
  ) {

    if (
      kNeeded &&
      position === 'K'
    ) {

      adjustment += 25;

    }

    if (
      dstNeeded &&
      position === 'DST'
    ) {

      adjustment += 25;

    }


    /*
     * If one required position remains unfilled,
     * heavily penalize unrelated selections.
     */

    if (
      (kNeeded || dstNeeded) &&
      position !== 'K' &&
      position !== 'DST'
    ) {

      adjustment -= 20;

    }


    /*
     * Do not reward duplicate K/DST.
     */

    if (
      position === 'K' &&
      !kNeeded
    ) {

      adjustment -= 20;

    }

    if (
      position === 'DST' &&
      !dstNeeded
    ) {

      adjustment -= 20;

    }

  }


  return adjustment;
}

function calculateDraftStrategy(suppliedCounts) {

  var counts = suppliedCounts || {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  if (!suppliedCounts) document
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

  /*
 * -------------------------------------------------------
 * DETERMINE GENERAL TARGET
 * -------------------------------------------------------
 *
 * Prefer true dedicated starter needs over pressure that
 * exists only because the FLEX spot is still open.
 */

var targetPosition = null;
var targetPressure = -1;
var targetDedicatedNeed = -1;

[
  {
    position: 'RB',
    pressure: rbPressure,
    dedicatedNeed: rbNeed
  },
  {
    position: 'WR',
    pressure: wrPressure,
    dedicatedNeed: wrNeed
  },
  {
    position: 'TE',
    pressure: tePressure,
    dedicatedNeed: teNeed
  },
  {
    position: 'QB',
    pressure: qbPressure,
    dedicatedNeed: qbNeed
  }
].forEach(function(item) {

  /*
   * Higher pressure always wins.
   */
  if (item.pressure > targetPressure) {

    targetPressure =
      item.pressure;

    targetDedicatedNeed =
      item.dedicatedNeed;

    targetPosition =
      item.position;

    return;
  }

  /*
   * If pressure is tied, prefer the position that still
   * has an actual dedicated starter vacancy.
   *
   * Example:
   *
   * RB pressure = 1 only because FLEX is open
   * QB pressure = 1 because QB starter is empty
   *
   * QB should win.
   */
  if (
    item.pressure === targetPressure &&
    item.dedicatedNeed > targetDedicatedNeed
  ) {

    targetDedicatedNeed =
      item.dedicatedNeed;

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

function calculateDynamicStrategyAdjustment(
  player,
  strategyState
) {

  if (
    !player ||
    !strategyState ||
    !strategyState.positions
  ) {

    return 0;

  }


  var position =
    player.position ||
    player.pos ||
    null;


  if (!position) {
    return 0;
  }


  var positionState =
    strategyState.positions[
      position
    ];


  if (!positionState) {
    return 0;
  }


  var state =
    positionState.state ||
    'NEUTRAL';


  var adjustment = 0;


  if (
    state === 'PRIORITIZE'
  ) {

    adjustment =
      1.25;

  } else if (
    state === 'MONITOR'
  ) {

    adjustment =
      0.50;

  } else if (
    state === 'WAIT'
  ) {

    adjustment =
      -0.75;

  }


  /*
   * Keep Phase 12 intentionally bounded.
   */

  adjustment =
    Math.max(
      -1,
      Math.min(
        1.5,
        adjustment
      )
    );


  return adjustment;

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

/* =========================================================
   LIVE DRAFT STATE AND SAFE SCENARIO STATE HELPERS
   ========================================================= */

function buildLiveDraftDebugState() {

  var players =
    getDraftAssistantPlayers();


  var available =
    players.filter(function(player) {
      return player && player.available;
    });

  var rosterState = getDraftAssistantRosterState();
  var rosterCounts = rosterState.counts;


  var draftState =
    getDraftAssistantState();

  var vorpResult =
    calculateAllFantasyVorp(players, draftState);

  var teams =
    Number(draftState.teams) || 10;

  var draftWindow =
    calculateMyNextDraftPick(
      draftState.currentPick,
      teams
    );

  var draftRuns =
    detectDraftRuns();

  var draftStrategy =
    calculateDraftStrategy(rosterCounts);

  var tierCliffs = {};

  ['QB', 'RB', 'WR', 'TE'].forEach(
    function(position) {

      tierCliffs[position] =
        calculatePositionTierCliff(
          position,
          players,
          vorpResult.profiles
        );

    }
  );

  var vorpMax =
    Math.max.apply(
      null,
      vorpResult.profiles.map(function(profile) {
        return Number(profile.vorp) || 0;
      })
    );

  var rosterNeeds =
  calculateDecisionRosterNeeds(rosterCounts);

  var draftPhase =
    getDraftPhase(draftState.currentPick, teams);

  var context = {

    players:
      players,

    availablePlayers:
      available,

    teams:
      teams,

    rounds:
      Number(draftState.rounds) || 16,

    totalPicks:
      Number(draftState.totalPicks) || (teams * 16),

    currentPick:
      draftState.currentPick,

    draftSlot:
      Number(draftState.draftSlot) || 1,

    draftState:
      draftState,

    skipMultiPickPlanning:
      true,

    skipFutureDepth:
      true,

    draftPhase:
      draftPhase,

    phaseWeights:
      getDraftPhaseWeights(draftPhase.phase),

    marketPools:
      vorpResult.marketPools || {},

    lateAvailabilityCache:
      vorpResult.lateAvailabilityCache || {},

    nextPickSurvivalCache:
  {},

opponentThreatCache:
  {},

    nextPick:
      draftWindow.nextPick,

    calculatedNextPick:
      draftWindow.nextPick,

    calculatedPicksUntilNext:
      draftWindow.picksBetween,

    picksUntilMyTurn:
      draftWindow.picksBetween,

    replacements:
      vorpResult.replacements,

    rosterNeeds:
  rosterNeeds,

    rosterCounts:
      rosterCounts,

    rosterByeCounts:
      rosterState.byeCounts || {},

    strategy:
      draftStrategy,

    draftRuns:
      draftRuns,

    tierCliffs:
      tierCliffs,

    vorpMax:
      vorpMax,

    vorpProfiles:
      vorpResult.profiles

  };

  var scored =
    vorpResult.profiles
      .filter(function(profile) {

        return profile &&
          profile.player &&
          profile.player.available &&
          isRecommendationRosterEligible(profile.player, rosterCounts);

      })
      .map(function(profile) {

        var player =
          Object.assign(
            {},
            profile.player,
            {
              vorp:
                profile.vorp,

              scarcity:
                profile.scarcity,

              draftAware:
                profile.draftAware
            }
          );

        return calculateDraftDecisionScore(
          player,
          context
        );

      });
  
  /*
 * -------------------------------------------------------
 * ADD K / DST TO DECISION POOL
 * -------------------------------------------------------
 *
 * K and DST are not part of the VORP profile system,
 * but they still need to enter the decision engine so
 * late-round roster requirements can select them.
 */

players
  .filter(function(player) {

    return (
      player &&
      player.available &&
      hasAuthoritativeEcr(player) &&
      (
        player.position === 'K' ||
        player.position === 'DST'
      )
    );

  })
  .forEach(function(player) {

    /*
     * Give special-teams players neutral fantasy-value
     * inputs. Their timing and endgame requirement logic
     * will determine when they become viable.
     */

    var specialTeamsPlayer =
      Object.assign(
        {},
        player,
        {
          vorp:
            0,

          scarcity:
            0,

          draftAware:
            0
        }
      );


    var scoredSpecialTeams =
      calculateDraftDecisionScore(
        specialTeamsPlayer,
        context
      );


    if (scoredSpecialTeams) {

      scored.push(
        scoredSpecialTeams
      );

    }

  });

scored.sort(function(a, b) {

  return (
    Number(b.finalScore || 0) -
    Number(a.finalScore || 0)
  );

});

/*
 * -------------------------------------------------------
 * PHASE 12 — DYNAMIC STRATEGY SNAPSHOT
 * -------------------------------------------------------
 *
 * Build strategy only after the initial scoring pass.
 *
 * This avoids recursion because the supplied state is
 * reused instead of building a new live draft state.
 */

var dynamicStrategyAudit =
  buildDynamicStrategyAudit({
    players:
      players,

    available:
      available,

    vorpResult:
      vorpResult,

    draftState:
      draftState,

    draftWindow:
      draftWindow,

    context:
      context,

    scored:
      scored
  });


var dynamicStrategyState =
  buildDynamicStrategyState(
    dynamicStrategyAudit
  );


context.dynamicStrategyState =
  dynamicStrategyState;

/*
 * -------------------------------------------------------
 * EXPENSIVE MULTI-PICK SECOND PASS
 * -------------------------------------------------------
 *
 * Only the strongest first-pass candidates need the
 * expensive multi-pick planning calculation.
 */

context.skipMultiPickPlanning =
  false;

context.skipFutureDepth =
  false;


var multiPickShortlist =
  scored.slice(0, 20);


multiPickShortlist.forEach(
  function(scoredPlayer) {

    if (
      !scoredPlayer ||
      !scoredPlayer.name
    ) {

      return;

    }


    var playerName =
      String(
        scoredPlayer.name
      ).toLowerCase();


    var profile =
      vorpResult.profiles.find(
        function(candidateProfile) {

          return (
            candidateProfile &&
            candidateProfile.player &&
            candidateProfile.player.name &&
            String(
              candidateProfile.player.name
            ).toLowerCase() ===
              playerName
          );

        }
      );


    if (!profile) {

      return;

    }


    var sourcePlayer =
      Object.assign(
        {},
        profile.player,
        {
          vorp:
            profile.vorp,

          scarcity:
            profile.scarcity,

          draftAware:
            profile.draftAware
        }
      );


    var rescoredPlayer =
      calculateDraftDecisionScore(
        sourcePlayer,
        context
      );


    if (!rescoredPlayer) {

      return;

    }


    var existingIndex =
      scored.findIndex(
        function(candidate) {

          return (
            candidate &&
            candidate.name &&
            String(
              candidate.name
            ).toLowerCase() ===
              playerName
          );

        }
      );


    if (existingIndex >= 0) {

      scored[existingIndex] =
        rescoredPlayer;

    }

  }
);


/*
 * The expensive adjustment can change the order,
 * so rank the pool again.
 */

scored.sort(function(a, b) {

  return (
    Number(b.finalScore || 0) -
    Number(a.finalScore || 0)
  );

});

/*
 * Cache base scored players for projection lookup.
 */

context.scoredPlayers =
  scored;

context.scoredByName = {};

scored.forEach(function(player) {

  if (
    !player ||
    !player.name
  ) {
    return;
  }

  context.scoredByName[
    String(player.name).toLowerCase()
  ] = player;

});


/*
 * -------------------------------------------------------
 * MULTI-PICK PACKAGE SECOND PASS
 * -------------------------------------------------------
 */

applyPackagePathAdjustments(
  scored,
  context,
  8
);

/* A worse ECR option cannot dominate a better available player
 * at the same position solely because of derived strategy nudges. */
enforceAuthoritativePositionOrder(scored);

/* ECR remains the value authority while ADP determines whether that value
 * is urgent now or is likely to remain available at the next selection. */
applyMarketAwareRecommendationPriority(scored, context);

  return {
    players:
      players,

    available:
      available,

    vorpResult:
      vorpResult,

    draftState:
      draftState,

    draftWindow:
      draftWindow,

    context:
      context,

    scored:
      scored
  };
}


function draftEngineWithSimulatedPriorPicks(
  pick,
  fn
) {

  pick =
    Number(pick) || 0;

  if (pick <= 0) {
    return fn();
  }

  var rows =
    Array.prototype.slice.call(
      document.querySelectorAll('tr.draftrow')
    );

  var originalClasses =
    rows.map(function(row) {
      return row.className;
    });

  var originalPickAttributes =
  rows.map(function(row) {

    return {
      pick:
        row.getAttribute('data-pick'),

      teamSlot:
        row.getAttribute('data-team-slot')
    };

  });


  /*
   * -------------------------------------------------------
   * RESET TEMPORARY DRAFT MARKERS
   * -------------------------------------------------------
   */

  rows.forEach(function(row) {

    row.classList.remove(
      'drafted-mine',
      'drafted-other'
    );

  });


  /*
   * -------------------------------------------------------
   * BUILD RANKED PLAYER LIST
   * -------------------------------------------------------
   */

  var players =
    getDraftAssistantPlayers()
      .filter(function(player) {

        return player &&
          player.row &&
          player.rank;

      })
      .slice()
      .sort(function(a, b) {

        return (
          Number(a.rank) -
          Number(b.rank)
        );

      });


  /*
   * -------------------------------------------------------
   * SIMULATE PICKS BEFORE CURRENT PICK
   * -------------------------------------------------------
   *
   * Pick 11 means picks 1–10 have already happened.
   */

 var playersToRemove =
  Math.max(
    0,
    pick - 1
  );

var teams =
  Number(
    getDraftAssistantState().teams
  ) || 10;

players
  .slice(0, playersToRemove)
  .forEach(function(player, index) {

    if (!player.row) {
      return;
    }

    var simulatedPick =
      index + 1;

    var mapping =
      getSnakeDraftTeamForPick(
        simulatedPick,
        teams
      );

    player.row.classList.add(
      'drafted-other'
    );

    player.row.setAttribute(
      'data-pick',
      simulatedPick
    );

    if (
      mapping &&
      mapping.teamSlot
    ) {

      player.row.setAttribute(
        'data-team-slot',
        mapping.teamSlot
      );

    }

  });


  try {

    return fn();

  } finally {

    /*
     * -------------------------------------------------------
     * ALWAYS RESTORE REAL BOARD
     * -------------------------------------------------------
     */

    rows.forEach(function(row, index) {

      row.className =
        originalClasses[index];

      var original =
  originalPickAttributes[index];

if (original.pick !== null) {

  row.setAttribute(
    'data-pick',
    original.pick
  );

} else {

  row.removeAttribute(
    'data-pick'
  );

}

if (original.teamSlot !== null) {

  row.setAttribute(
    'data-team-slot',
    original.teamSlot
  );

} else {

  row.removeAttribute(
    'data-team-slot'
  );

}

    });

  }
}
