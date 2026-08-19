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
      calculateFuturePositionDepth(
        {
          position:
            pos,

          rank:
            Number(player.rank) || 999,

          name:
            '__SECOND_PATH_' + pos
        },
        context
      );


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

      var teamSlot =
        Number(
          row.getAttribute(
            'data-team-slot'
          )
        ) || 0;


      if (
        !position ||
        !teamSlot ||
        !rosters[teamSlot] ||
        rosters[teamSlot][position] === undefined
      ) {
        return;
      }


      rosters[
        teamSlot
      ][position]++;

    });


  return rosters;
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


      var mapping =
        getSnakeDraftTeamForPick(
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


  return Math.round(
    threatScore
  );
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

function toggleDraft(row) {

  if (
    !row ||
    document.body.classList.contains('edit-mode')
  ) {
    return;
  }


  /*
   * -------------------------------------------------------
   * TAKEN -> MINE
   * -------------------------------------------------------
   *
   * Keep the original draft pick / team metadata.
   */

  if (
    row.classList.contains('drafted-other')
  ) {

    row.classList.remove(
      'drafted-other'
    );

    row.classList.add(
      'drafted-mine'
    );


  /*
   * -------------------------------------------------------
   * MINE -> AVAILABLE
   * -------------------------------------------------------
   *
   * Player is no longer drafted, so remove the
   * stored draft-history metadata.
   */

  } else if (
    row.classList.contains('drafted-mine')
  ) {

    row.classList.remove(
      'drafted-mine'
    );

    row.removeAttribute(
      'data-pick'
    );

    row.removeAttribute(
      'data-team-slot'
    );


  /*
   * -------------------------------------------------------
   * AVAILABLE -> TAKEN
   * -------------------------------------------------------
   *
   * Record the current pick and which team owns it.
   */

  } else {

    var draftState =
      getDraftAssistantState();

    var currentPick =
      Number(
        draftState.currentPick
      ) || 0;

    var teams =
      Number(
        draftState.teams
      ) || 10;

    var mapping =
      getSnakeDraftTeamForPick(
        currentPick,
        teams
      );


    row.classList.add(
      'drafted-other'
    );


    if (currentPick > 0) {

      row.setAttribute(
        'data-pick',
        currentPick
      );

    }


    if (
      mapping &&
      mapping.teamSlot
    ) {

      row.setAttribute(
        'data-team-slot',
        mapping.teamSlot
      );

    }

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
   * We then make the replacement level draft-aware by
   * projecting players who are likely to disappear before
   * our next selection.
   */


  /*
   * -------------------------------------------------------
   * PICKS UNTIL NEXT TURN
   * -------------------------------------------------------
   */

var currentPick =
  Number(draftState.currentPick) || 0;

var teams =
  Number(draftState.teams) || 10;

var draftWindow =
  calculateMyNextDraftPick(
    currentPick,
    teams
  );

var nextPick =
  draftWindow.nextPick;

var picksUntilNext =
  draftWindow.picksBetween;

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
   * PROJECT PLAYERS TAKEN BEFORE OUR NEXT PICK
   * -------------------------------------------------------
   *
   * Use overall ranking as the baseline projection.
   *
   * This does NOT mean these exact players will be taken.
   * It simply gives the engine a deterministic estimate.
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


  var projectedGoneCount =
  Math.min(
    picksUntilNext,
    projectedPlayers.length
  );


  var projectedGone =
    projectedPlayers.slice(
      0,
      projectedGoneCount
    );


  /*
   * Build lookup of projected players.
   */

  var projectedGoneNames = {};

  projectedGone.forEach(function(player) {

    projectedGoneNames[
      String(player.name).toLowerCase()
    ] = true;

  });


  /*
   * -------------------------------------------------------
   * PROJECTED POSITION POOLS
   * -------------------------------------------------------
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

  console.log(
  'DRAFT-AWARE REPLACEMENT LEVELS:',
  {
    currentPick:
      currentPick,

    nextPick:
      nextPick,

    picksUntilNext:
      picksUntilNext,

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


  console.log(
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

  if (!player || !player.rank) {
    return 0;
  }

  var replacement =
    getEffectiveReplacement(
      player,
      replacements
    );

  if (!replacement || !replacement.rank) {
    return 0;
  }

  var playerRank =
    Number(player.rank);

  var replacementRank =
    Number(replacement.rank);

  /*
   * -------------------------------------------------------
   * RELATIVE POSITIONAL SCARCITY
   * -------------------------------------------------------
   *
   * Measure how much of the positional player pool exists
   * between this player and the replacement level.
   *
   * A player sitting much farther above replacement gets
   * a higher scarcity score.
   *
   * Unlike the old model, this does NOT simply multiply
   * the rank gap by 2 and immediately cap most elite
   * players at 100.
   */

  var gap =
    replacementRank -
    playerRank;

  if (gap <= 0) {
    return 0;
  }

  /*
   * Express the player's distance above replacement
   * as a percentage of the entire replacement range.
   *
   * Example:
   *
   * Gibbs:
   *   replacement = 73
   *   player = 1
   *
   *   72 / 72 = 100
   *
   * Chase:
   *   replacement = 63
   *   player = 3
   *
   *   60 / 62 ≈ 96.8
   *
   * Bowers:
   *   replacement = 112
   *   player = 15
   *
   *   97 / 111 ≈ 87.4
   */

  var maximumGap =
    replacementRank - 1;

  if (maximumGap <= 0) {
    return 0;
  }

  var scarcity =
    (
      gap /
      maximumGap
    ) * 100;

  scarcity =
    Math.max(
      0,
      Math.min(
        100,
        scarcity
      )
    );

  console.log(
    'SCARCITY CALC:',
    player.name,
    'position =',
    player.position || player.pos,
    'playerRank =',
    playerRank,
    'replacement =',
    replacement.name,
    'replacementRank =',
    replacementRank,
    'gap =',
    gap,
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


  /*
   * -------------------------------------------------------
   * DRAFT STATE
   * -------------------------------------------------------
   */

  var draftState =
    getDraftAssistantState();


  /*
   * -------------------------------------------------------
   * LATE AVAILABILITY
   * -------------------------------------------------------
   */

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
      {
        players:
          players,

        replacements:
          replacements
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

function calculateDraftAwareVorpOpportunity(player, context){

  console.log(
    'DRAFT-AWARE ENTER:',
    player && player.name,
    {
      hasContext: !!context,
      hasReplacements: !!(
        context &&
        context.replacements
      ),
      hasPlayers: !!(
        context &&
        context.players &&
        context.players.length
      ),
      playerPosition:
        player &&
        player.position
    }
  );

  if(!player || !context){
    console.log('DRAFT-AWARE EXIT: missing player/context');
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
  getDraftAssistantState();

var currentPick =
  Number(draftState.currentPick) || 0;

var teams =
  Number(draftState.teams) || 10;

var draftWindow =
  calculateMyNextDraftPick(
    currentPick,
    teams
  );

var nextPick =
  draftWindow.nextPick;

var picksUntilNext =
  draftWindow.picksBetween;

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
    players
      .filter(function(candidate){

        return candidate &&
          candidate.available &&
          (candidate.position ||
           candidate.pos) === position &&
          candidate.rank;

      })
      .sort(function(a,b){

        return Number(a.rank) -
               Number(b.rank);

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
  var pressureSampleSize =
    Math.min(
      100,
      players.length
    );


  var pressureSample =
    players
      .filter(function(candidate){

        return candidate &&
          candidate.available &&
          candidate.rank &&
          VORP_POSITIONS.includes(
            candidate.position
          );

      })
      .slice()
      .sort(function(a,b){

        return Number(a.rank) -
               Number(b.rank);

      })
      .slice(
        0,
        pressureSampleSize
      );


  var positionCount =
    pressureSample.filter(function(candidate){

      return (
        candidate.position ===
        position
      );

    }).length;


  var positionShare =
    pressureSample.length > 0
      ? positionCount /
        pressureSample.length
      : 0;


  /*
   * Don't allow the estimate to become absurdly
   * aggressive or conservative.
   *
   * Minimum 5%
   * Maximum 45%
   */
  positionShare =
    Math.max(
      0.05,
      Math.min(
        0.45,
        positionShare
      )
    );


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


  console.log(
    'DRAFT PRESSURE:',
    player.name,
    'position =',
    position,
    'positionShare =',
    positionShare,
    'picksUntilNext =',
    picksUntilNext,
    'expectedLoss =',
    expectedLoss
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


  console.log(
    'DRAFT-AWARE VORP:',
    player.name,
    'position =',
    position,
    'currentReplacement =',
    currentReplacement.name,
    currentRank,
    'futureReplacement =',
    futureReplacement.name,
    futureRank,
    'rankDrop =',
    rankDrop,
    'playerAdvantage =',
    playerAdvantage,
    'opportunityScore =',
    opportunityScore
  );


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

  console.log(
  'STRATEGY INPUT DEBUG:',
  player.name,
  {
    position: position,
    hasStrategy: !!context.strategy,
    targetPosition:
      context.strategy
        ? context.strategy.targetPosition
        : undefined,
    targetPressure:
      context.strategy
        ? context.strategy.targetPressure
        : undefined,
    strategy:
      context.strategy
        ? context.strategy.strategy
        : undefined
  }
);

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

/*
 * -------------------------------------------------------
 * DRAFT-AWARE VORP OPPORTUNITY
 * -------------------------------------------------------
 */

var draftAwareVorpOpportunityScore =
  calculateDraftAwareVorpOpportunity(
    player,
    context
  );

console.log(
  'DRAFT-AWARE VORP OPPORTUNITY:',
  player.name,
  'score =',
  draftAwareVorpOpportunityScore
);



console.log(
  'TIER CLIFF OPPORTUNITY:',
  player.name,
  'position =',
  position,
  'tierCliffOpportunityScore =',
  tierCliffOpportunityScore
);

  var rosterConstructionScore =
  calculateRosterConstructionValue(
    player,
    context
  );

  var futureDepthOpportunityScore =
  calculateFutureDepthOpportunity(
    player,
    context
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
finalScore += draftAwareVorpOpportunityScore;
finalScore += rosterConstructionScore;
finalScore += futureDepthOpportunityScore;

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

draftAwareVorpOpportunityScore:
  draftAwareVorpOpportunityScore,

    futureDepthOpportunityScore:
  futureDepthOpportunityScore,

    rosterConstructionScore:
  rosterConstructionScore,

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
        !candidate.rank
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
  Number(context.calculatedNextPick) || 0;

var draftState =
  getDraftAssistantState();

var draftWindow =
  calculateMyNextDraftPick(
    Number(draftState.currentPick) || 0,
    Number(draftState.teams) || 0
  );

var picksUntilNext =
  Number(draftWindow.picksBetween) || 0;

var rank =
  Number(candidate.rank) || 999;

var timing =
  Number(candidate.timingScore) || 0;
  
  /*
   * Start with a neutral survival estimate.
   */

 var startingSurvival = 100;

var rankPressure =
  nextPick
    ? nextPick - rank
    : 0;

var rankPenalty =
  rankPressure > 0
    ? -(rankPressure * 7)
    : 0;

var timingPenalty =
  -(timing * 0.10);

  var opponentThreat =
  calculateOpponentDraftThreat(
    candidate,
    context
  );

var opponentThreatPenalty =
  -(opponentThreat * 0.15);

var rankDistance =
  rank -
  (Number(context.currentRank) || 0);

var rankDistancePenalty =
  rankDistance <= 2
    ? -5
    : rankDistance <= 4
      ? -3
      : 0;

var pickDistancePenalty =
  -Math.min(
    15,
    picksUntilNext * 0.5
  );

var survival =
  startingSurvival +
  rankPenalty +
  timingPenalty +
  opponentThreatPenalty +
  rankDistancePenalty +
  pickDistancePenalty;

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

      timingScore:
        timing,

      startingSurvival:
        startingSurvival,

      rankPressure:
        rankPressure,

      rankPenalty:
        rankPenalty,

      timingPenalty:
        timingPenalty,

      rankDistance:
        rankDistance,

      rankDistancePenalty:
        rankDistancePenalty,

      pickDistancePenalty:
        pickDistancePenalty,

      opponentThreat:
  opponentThreat,

opponentThreatPenalty:
  opponentThreatPenalty,

      finalSurvival:
        survival
    }
  );

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
    Number(player.finalScore) || 0;

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

  console.log(
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
    ? Number(nextPlayer.finalScore) || 0
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

  var decision =
    calculateRecommendationDecision(
      player,
      nextPlayer,
      scoreGap,
      confidenceScore,
      context
    );


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

function debugDecisionEngine(playerName){

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

  var draftWindow =
  calculateMyNextDraftPick(
    draftState.currentPick,
    Number(
      document.getElementById('pcTeams')?.value
    ) || 10
  );

var nextPick =
  draftWindow.nextPick;

var calculatedPicksUntilNext =
  draftWindow.picksBetween;
  
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
  nextPick,

 picksUntilMyTurn:
  calculatedPicksUntilNext,

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
 * If a specific player was requested,
 * use that player for recommendation testing.
 * Otherwise use the top-scoring player.
 */

var selectedPlayer = null;

if (playerName) {

  selectedPlayer =
    scored.find(function(player){

      return player.name &&
        player.name.toLowerCase() ===
        playerName.toLowerCase();

    }) || null;

} else {

  selectedPlayer =
    scored.length
      ? scored[0]
      : null;

}

  context.currentRank =
  selectedPlayer
    ? Number(selectedPlayer.rank) || 999
    : 999;

console.log(
  'SELECTED DECISION PLAYER:',
  selectedPlayer
    ? selectedPlayer.name
    : null
);

var testAlternatives =
  selectedPlayer
    ? calculateNextPickAlternatives(
        selectedPlayer,
        scored,
        context
      )
    : [];

  console.log(
    '%c[DRAFT DEBUG] NEXT PICK PIPELINE',
    'color:#00ff88;font-weight:bold;',
    {
      player:
        selectedPlayer
          ? selectedPlayer.name
          : null,

      teams:
        context.teams,

      currentPick:
        context.currentPick,

      suppliedNextPick:
        context.nextPick,

      calculatedNextPick:
        context.calculatedNextPick,

      picksBetween:
        context.calculatedPicksUntilNext,

      currentRank:
        context.currentRank
    }
  );
  
var recommendation =
  selectedPlayer
    ? calculateDraftRecommendation(
        selectedPlayer,
        scored,
        context
      )
    : null;

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

' · Draft VORP: ' +
player.draftAwareVorpOpportunityScore.toFixed(1) +

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

/* =========================================================
   DEVELOPER-ONLY DRAFT ENGINE TEST HARNESS Tester
   ========================================================= */

function draftEngineTestCreateRunner() {
  var results = [];

  function add(name, passed, error) {
    results.push({
      name: name,
      passed: !!passed,
      error: error || ''
    });
  }

  return {
    assert: function(name, condition, error) {
      add(name, condition, condition ? '' : (error || 'Assertion returned false.'));
    },

    equal: function(name, actual, expected) {

  var passed =
    actual === expected;

  add(
    name,
    passed,
    passed
      ? ''
      : 'Expected ' + expected +
        ', received ' + actual + '.'
  );

},

    between: function(name, value, min, max) {

  var passed =
    Number.isFinite(value) &&
    value >= min &&
    value <= max;

  add(
    name,
    passed,
    passed
      ? ''
      : 'Expected ' + min +
        '–' + max +
        ', received ' + value + '.'
  );

},

    run: function(name, fn) {
      try {
        fn();
      } catch (error) {
        add(
          name,
          false,
          error && error.message ? error.message : String(error)
        );
      }
    },

    summary: function() {
      var passed = results.filter(function(result) {
        return result.passed;
      }).length;

      return {
        results: results,
        passed: passed,
        failed: results.length - passed,
        total: results.length
      };
    }
  };
}

function draftEngineTestWithQuietConsole(fn) {
  var originalLog = console.log;
  var originalGroup = console.group;
  var originalGroupEnd = console.groupEnd;
  var originalTable = console.table;

  console.log = console.group = console.groupEnd = console.table = function() {};

  try {
    return fn();
  } finally {
    console.log = originalLog;
    console.group = originalGroup;
    console.groupEnd = originalGroupEnd;
    console.table = originalTable;
  }
}

function draftEngineTestPlayers() {
  var players = [];

  ['RB', 'WR', 'TE', 'QB'].forEach(function(position, positionIndex) {
    for (var index = 1; index <= 30; index++) {
      players.push({
        name: position + ' Test ' + index,
        position: position,
        rank: (index * 4) + positionIndex,
        available: true,
        tier: index <= 5 ? 'Sp' : (index <= 12 ? 'S' : 'A')
      });
    }
  });

  return players.sort(function(a, b) {
    return a.rank - b.rank;
  });
}

function draftEngineTestWithRoster(positions, fn) {
  var rows = Array.prototype.slice.call(
    document.querySelectorAll('tr.draftrow')
  );

  var originalClasses = rows.map(function(row) {
    return row.className;
  });

  var byPosition = {};

  rows.forEach(function(row) {
    var position = row.getAttribute('data-pos');

    if (!byPosition[position]) {
      byPosition[position] = [];
    }

    byPosition[position].push(row);
    row.classList.remove('drafted-mine', 'drafted-other');
  });

  try {
    (positions || []).forEach(function(position) {
      var row = (byPosition[position] || []).shift();

      if (row) {
        row.classList.add('drafted-mine');
      }
    });

    return fn();
  } finally {
    rows.forEach(function(row, index) {
      row.className = originalClasses[index];
    });
  }
}

function draftEngineTestDecisionContext(players, overrides) {
  var available = players.filter(function(player) {
    return player.available !== false;
  });

  var replacements = {};

  ['QB', 'RB', 'WR', 'TE'].forEach(function(position) {
    replacements[position] = available
      .filter(function(player) {
        return player.position === position;
      })
      .slice(-1)[0];
  });

  return Object.assign({
    players: available,
    availablePlayers: available,
    replacements: replacements,
    teams: 10,
    currentPick: 1,
    calculatedNextPick: 20,
calculatedPicksUntilNext: 18,
    nextPick: 20,
    currentRank: 1,
    vorpMax: 100,
    rosterNeeds: {
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1
    },
    strategy: {
      targetPosition: 'RB'
    },
    draftRuns: {
      isRun: false
    },
    tierCliffs: {}
  }, overrides || {});
}

function runDraftEngineTests(options) {
  options = options || {};

  var test = draftEngineTestCreateRunner();
  var players = draftEngineTestPlayers();

  var rbPlayers = players.filter(function(player) {
    return player.position === 'RB';
  });

  var rbOne = rbPlayers[0];
  var rbReplacement = rbPlayers[12];

  var context = draftEngineTestDecisionContext(players, {
    replacements: {
      RB: rbReplacement,
      WR: players.filter(function(player) {
        return player.position === 'WR';
      })[12],
      TE: players.filter(function(player) {
        return player.position === 'TE';
      })[12],
      QB: players.filter(function(player) {
        return player.position === 'QB';
      })[12]
    }
  });

  draftEngineTestWithQuietConsole(function() {
    test.equal(
      'Tier cliff: missing context returns 0',
      calculateTierCliffOpportunity(rbOne, {}),
      0
    );

    var cliff = {
      RB: {
        severity: 'HIGH',
        beforePlayer: rbOne,
        afterPlayer: rbReplacement
      }
    };

    test.equal(
  'Opponent map: pick 1 belongs to team 1',
  getSnakeDraftTeamForPick(
    1,
    10
  ).teamSlot,
  1
);

    var multiPick21 =
  calculateMyNextTwoDraftPicks(
    21,
    10
  );

test.equal(
  'Multi-pick: pick 21 first future pick is 40',
  multiPick21.firstNextPick,
  40
);

    test.assert(
  'Multi-pick path returns result',
  !!calculateMultiPickPositionPath(
    rbOne,
    context
  )
);

test.assert(
  'Multi-pick path returns future positions',
  !!(
    calculateMultiPickPositionPath(
      rbOne,
      context
    ).firstFuturePosition
  )
);

test.equal(
  'Multi-pick: pick 21 second future pick is 41',
  multiPick21.secondNextPick,
  41
);


var multiPick40 =
  calculateMyNextTwoDraftPicks(
    40,
    10
  );

test.equal(
  'Multi-pick: pick 40 first future pick is 41',
  multiPick40.firstNextPick,
  41
);

test.equal(
  'Multi-pick: pick 40 second future pick is 60',
  multiPick40.secondNextPick,
  60
);


var multiPick1 =
  calculateMyNextTwoDraftPicks(
    1,
    10
  );

test.equal(
  'Multi-pick: pick 1 first future pick is 20',
  multiPick1.firstNextPick,
  20
);

test.equal(
  'Multi-pick: pick 1 second future pick is 21',
  multiPick1.secondNextPick,
  21
);

    test.equal(
  'Opponent demand: 0 RBs creates strong RB demand',
  calculateOpponentPositionDemand(
    {
      QB: 0,
      RB: 0,
      WR: 2,
      TE: 1
    },
    'RB'
  ),
  3
);

test.equal(
  'Opponent demand: 1 RB creates starter RB demand',
  calculateOpponentPositionDemand(
    {
      QB: 0,
      RB: 1,
      WR: 2,
      TE: 1
    },
    'RB'
  ),
  2
);

test.equal(
  'Opponent demand: 2 RBs with FLEX open creates RB flex demand',
  calculateOpponentPositionDemand(
    {
      QB: 0,
      RB: 2,
      WR: 2,
      TE: 1
    },
    'RB'
  ),
  1
);

test.between(
  'Future depth opportunity stays in safe range',
  calculateFutureDepthOpportunity(
    rbOne,
    context
  ),
  -1,
  2.5
);

test.equal(
  'Opponent demand: 3 RBs creates only depth RB demand',
  calculateOpponentPositionDemand(
    {
      QB: 0,
      RB: 3,
      WR: 2,
      TE: 1
    },
    'RB'
  ),
  0.5
);

    test.between(
  'Future depth: result stays 0–100',
  calculateFuturePositionDepth(
    rbOne,
    context
  ),
  0,
  100
);

test.equal(
  'Future depth: missing player returns 0',
  calculateFuturePositionDepth(
    null,
    context
  ),
  0
);

test.equal(
  'Future depth: missing player pool returns 0',
  calculateFuturePositionDepth(
    rbOne,
    {
      teams: 10,
      currentPick: 1
    }
  ),
  0
);

    test.equal(
  'Roster construction: dedicated RB need adds value',
  calculateRosterConstructionValue(
    { position: 'RB' },
    {
      rosterNeeds: {
        QB: 0,
        RB: 1,
        WR: 0,
        TE: 0,
        FLEX: 0
      }
    }
  ),
  3
);

test.equal(
  'Roster construction: FLEX-only RB adds small value',
  calculateRosterConstructionValue(
    { position: 'RB' },
    {
      rosterNeeds: {
        QB: 0,
        RB: 0,
        WR: 0,
        TE: 0,
        FLEX: 1
      }
    }
  ),
  1
);

test.equal(
  'Roster construction: empty QB starter gets strong value',
  calculateRosterConstructionValue(
    { position: 'QB' },
    {
      rosterNeeds: {
        QB: 1,
        RB: 0,
        WR: 0,
        TE: 0,
        FLEX: 1
      }
    }
  ),
  4
);

test.equal(
  'Roster construction: filled QB is penalized',
  calculateRosterConstructionValue(
    { position: 'QB' },
    {
      rosterNeeds: {
        QB: 0,
        RB: 0,
        WR: 0,
        TE: 0,
        FLEX: 1
      }
    }
  ),
  -2
);

test.equal(
  'Roster construction: filled RB with filled FLEX is penalized',
  calculateRosterConstructionValue(
    { position: 'RB' },
    {
      rosterNeeds: {
        QB: 0,
        RB: 0,
        WR: 0,
        TE: 0,
        FLEX: 0
      }
    }
  ),
  -2
);

test.equal(
  'Opponent demand: empty QB creates moderate QB demand',
  calculateOpponentPositionDemand(
    {
      QB: 0,
      RB: 2,
      WR: 2,
      TE: 1
    },
    'QB'
  ),
  1.5
);

test.equal(
  'Opponent demand: filled QB creates very low backup demand',
  calculateOpponentPositionDemand(
    {
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1
    },
    'QB'
  ),
  0.25
);

test.equal(
  'Opponent demand: empty TE creates moderate TE demand',
  calculateOpponentPositionDemand(
    {
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 0
    },
    'TE'
  ),
  1.5
);

test.equal(
  'Opponent map: pick 10 belongs to team 10',
  getSnakeDraftTeamForPick(
    10,
    10
  ).teamSlot,
  10
);

test.equal(
  'Opponent map: pick 11 belongs to team 10',
  getSnakeDraftTeamForPick(
    11,
    10
  ).teamSlot,
  10
);

test.equal(
  'Opponent map: pick 20 belongs to team 1',
  getSnakeDraftTeamForPick(
    20,
    10
  ).teamSlot,
  1
);

test.equal(
  'Opponent map: pick 21 belongs to team 1',
  getSnakeDraftTeamForPick(
    21,
    10
  ).teamSlot,
  1
);

test.equal(
  'Opponent map: pick 30 belongs to team 10',
  getSnakeDraftTeamForPick(
    30,
    10
  ).teamSlot,
  10
);

    var pick21ThreatWindow =
  getTeamsPickingBeforeMyNextTurn(
    21,
    40,
    10
  );

test.equal(
  'Opponent window: pick 21 to 40 has 18 picks',
  pick21ThreatWindow.picks.length,
  18
);

test.equal(
  'Opponent window: team 2 picks twice before pick 40',
  pick21ThreatWindow.teamPickCounts[2],
  2
);

test.equal(
  'Opponent window: team 10 picks twice before pick 40',
  pick21ThreatWindow.teamPickCounts[10],
  2
);

test.equal(
  'Opponent window: team 1 does not pick before pick 40',
  pick21ThreatWindow.teamPickCounts[1] || 0,
  0
);


var turnThreatWindow =
  getTeamsPickingBeforeMyNextTurn(
    20,
    21,
    10
  );

test.equal(
  'Opponent window: pick 20 to 21 has 0 picks',
  turnThreatWindow.picks.length,
  0
);

    test.equal(
      'Tier cliff: high cliff awards 5',
      calculateTierCliffOpportunity(rbOne, { tierCliffs: cliff }),
      5
    );

    test.equal(
      'Tier cliff: non-cliff player awards 0',
      calculateTierCliffOpportunity(rbReplacement, { tierCliffs: cliff }),
      0
    );

    var runContext = {
      draftRuns: {
        isRun: true,
        position: 'WR',
        strength: 'STRONG'
      },
      rosterNeeds: {
        RB: 1,
        WR: 1,
        FLEX: 0
      }
    };

    test.equal(
      'Draft run: same-position player awards 0',
      calculateDraftRunOpportunity({ position: 'WR' }, runContext),
      0
    );

    test.equal(
      'Draft run: needed alternate position awards 3',
      calculateDraftRunOpportunity({ position: 'RB' }, runContext),
      3
    );

    var draftAware = calculateDraftAwareVorpOpportunity(rbOne, context);

    test.between(
      'Draft-aware VORP stays in range',
      draftAware,
      0,
      5
    );

    test.assert(
      'Draft-aware VORP rewards player above replacement',
      draftAware > 0,
      'Expected a positive wait-risk bonus.'
    );

    test.equal(
      'Draft-aware VORP: missing replacements returns 0',
      calculateDraftAwareVorpOpportunity(rbOne, { players: players }),
      0
    );

    var safeSurvival = calculateNextPickSurvival(
      { name: 'Late Player', rank: 200, timingScore: 0 },
      {
  currentPick: 1,
  calculatedNextPick: 20,
  calculatedPicksUntilNext: 18,
  currentRank: 1
}
    );

    var riskySurvival = calculateNextPickSurvival(
  { name: 'Early Player', rank: 1, timingScore: 100 },
  {
    currentPick: 1,
    calculatedNextPick: 20,
    calculatedPicksUntilNext: 18,
    currentRank: 1
  }
);

  var snakeCases = [
  { currentPick: 1, teams: 10, nextPick: 20, picksBetween: 18 },
  { currentPick: 10, teams: 10, nextPick: 11, picksBetween: 0 },
  { currentPick: 11, teams: 10, nextPick: 30, picksBetween: 18 },
  { currentPick: 20, teams: 10, nextPick: 21, picksBetween: 0 },
  { currentPick: 21, teams: 10, nextPick: 40, picksBetween: 18 }
];

snakeCases.forEach(function(testCase) {

  var result =
    calculateMyNextDraftPick(
      testCase.currentPick,
      testCase.teams
    );

  test.equal(
    'Snake pick ' +
    testCase.currentPick +
    ' → next pick ' +
    testCase.nextPick,
    result.nextPick,
    testCase.nextPick
  );

  test.equal(
    'Snake pick ' +
    testCase.currentPick +
    ' → picks between ' +
    testCase.picksBetween,
    result.picksBetween,
    testCase.picksBetween
  );

});  

    test.between('Late-player survival is 0–100', safeSurvival, 0, 100);
    test.between('Early-player survival is 0–100', riskySurvival, 0, 100);

    test.assert(
      'Late player is no less likely to survive',
      safeSurvival >= riskySurvival
    );

    var realPlayers =
  getDraftAssistantPlayers();

var realRb =
  realPlayers.find(function(player) {
    return player &&
      player.available &&
      player.position === 'RB' &&
      player.row;
  });

var scored =
  realRb
    ? calculateDraftDecisionScore(
        Object.assign(
          {},
          realRb,
          {
            vorp: 50,
            scarcity: 40
          }
        ),
        Object.assign(
          {},
          context,
          {
            players:
              realPlayers
          }
        )
      )
    : null;

    test.assert(
  'Decision score returns a result',
  !!scored
);

if (scored) {

  test.between(
    'Decision final score is finite',
    scored.finalScore,
    -1000,
    1000
  );

  test.between(
    'Decision tier score is 0–100',
    scored.tierScore,
    0,
    100
  );

  test.between(
    'Decision rank score is 0–100',
    scored.rankScore,
    0,
    100
  );

}

    var recommendationPlayers = [
      {
        name: 'Alpha',
        position: 'RB',
        rank: 1,
        finalScore: 90,
        tierScore: 95,
        vorpScore: 90,
        timingScore: 10,
        scarcityScore: 30,
        rosterNeedScore: 2,
        available: true
      },
      {
        name: 'Beta',
        position: 'WR',
        rank: 8,
        finalScore: 85,
        tierScore: 80,
        vorpScore: 70,
        timingScore: 10,
        scarcityScore: 30,
        rosterNeedScore: 2,
        available: true
      }
    ];

    test.run(
  'Recommendation integration',
  function() {

    var recommendation =
      calculateDraftRecommendation(
        recommendationPlayers[0],
        recommendationPlayers,
        {
          teams: 10,
          currentPick: 1,
          nextPick: 20,
          calculatedNextPick: 20,
          calculatedPicksUntilNext: 18,
          currentRank: 1
        }
      );

    test.assert(
      'Recommendation returns decision text',
      !!(
        recommendation &&
        recommendation.recommendation
      )
    );

    test.assert(
      'Recommendation returns finite confidence',
      Number.isFinite(
        recommendation &&
        recommendation.confidenceScore
      )
    );

  }
);

    test.equal(
  'Recommendation: strong advantage drafts',
  calculateRecommendationDecision(
    {
      finalScore: 95,
      vorpScore: 100,
      tierScore: 100
    },
    {
      finalScore: 70,
      nextPickSurvivalScore: 80,
      survivalAdjustedScore: 56
    },
    25,
    85,
    {}
  ).recommendation,
  'DRAFT'
);

test.equal(
  'Recommendation: safe alternative waits',
  calculateRecommendationDecision(
    {
      finalScore: 75,
      vorpScore: 65,
      tierScore: 78
    },
    {
      finalScore: 74,
      nextPickSurvivalScore: 90,
      survivalAdjustedScore: 72
    },
    1,
    45,
    {}
  ).recommendation,
  'WAIT'
);

test.equal(
  'Recommendation: close uncertain case considers',
  calculateRecommendationDecision(
    {
      finalScore: 75,
      vorpScore: 70,
      tierScore: 78
    },
    {
      finalScore: 73,
      nextPickSurvivalScore: 50,
      survivalAdjustedScore: 55
    },
    2,
    40,
    {}
  ).recommendation,
  'CONSIDER'
);

test.equal(
  'Recommendation: clearly inferior player passes',
  calculateRecommendationDecision(
    {
      finalScore: 60,
      vorpScore: 50,
      tierScore: 62
    },
    {
      finalScore: 75,
      nextPickSurvivalScore: 70,
      survivalAdjustedScore: 65
    },
    -15,
    60,
    {}
  ).recommendation,
  'PASS'
);

  test.equal(
  'Scenario recommendation: elite player with weak future option drafts',
  calculateRecommendationDecision(
    {
      name: 'Elite RB',
      finalScore: 96,
      vorpScore: 100,
      tierScore: 100,
      timingScore: 0,
      tierCliffOpportunityScore: 0,
      runOpportunityScore: 0,
      draftAwareVorpOpportunityScore: 2.5,
      strategyScore: 4
    },
    {
      name: 'Future RB',
      finalScore: 68,
      nextPickSurvivalScore: 90,
      survivalAdjustedScore: 61
    },
    28,
    83,
    {}
  ).recommendation,
  'DRAFT'
);

test.equal(
  'Scenario recommendation: close safe alternative waits',
  calculateRecommendationDecision(
    {
      name: 'Current WR',
      finalScore: 74,
      vorpScore: 70,
      tierScore: 78,
      timingScore: 0,
      tierCliffOpportunityScore: 0,
      runOpportunityScore: 0,
      draftAwareVorpOpportunityScore: 1,
      strategyScore: 0
    },
    {
      name: 'Future WR',
      finalScore: 73,
      nextPickSurvivalScore: 90,
      survivalAdjustedScore: 70
    },
    1,
    45,
    {}
  ).recommendation,
  'WAIT'
);

test.equal(
  'Scenario recommendation: tier cliff can prevent waiting',
  calculateRecommendationDecision(
    {
      name: 'Cliff Player',
      finalScore: 76,
      vorpScore: 75,
      tierScore: 85,
      timingScore: 20,
      tierCliffOpportunityScore: 5,
      runOpportunityScore: 0,
      draftAwareVorpOpportunityScore: 2,
      strategyScore: 0
    },
    {
      name: 'Future Player',
      finalScore: 74,
      nextPickSurvivalScore: 85,
      survivalAdjustedScore: 70
    },
    2,
    55,
    {}
  ).recommendation,
  'CONSIDER'
);

test.equal(
  'Scenario recommendation: poor player passes despite roster need',
  calculateRecommendationDecision(
    {
      name: 'Weak Need Player',
      finalScore: 58,
      vorpScore: 45,
      tierScore: 62,
      timingScore: 0,
      tierCliffOpportunityScore: 0,
      runOpportunityScore: 0,
      draftAwareVorpOpportunityScore: 0,
      strategyScore: 4
    },
    {
      name: 'Strong Alternative',
      finalScore: 72,
      nextPickSurvivalScore: 75,
      survivalAdjustedScore: 65
    },
    -14,
    60,
    {}
  ).recommendation,
  'PASS'
);
  });

  var scenarios = [
    { name: 'empty-roster', roster: [], expectedNeed: 'RB' },
    { name: 'rb-need', roster: ['QB', 'WR', 'WR', 'TE'], expectedNeed: 'RB' },
    { name: 'wr-need', roster: ['QB', 'RB', 'RB', 'TE'], expectedNeed: 'WR' },
    {
      name: 'balanced-roster',
      roster: ['QB', 'RB', 'RB', 'RB', 'WR', 'WR', 'TE'],
      expectedNeed: null
    }
  ];

  scenarios
    .filter(function(scenario) {
      return !options.scenario || options.scenario === scenario.name;
    })
    .forEach(function(scenario) {
      draftEngineTestWithRoster(scenario.roster, function() {
        var strategy = calculateDraftStrategy();

        if (scenario.expectedNeed) {
          test.assert(
            'Scenario: ' + scenario.name + ' targets ' + scenario.expectedNeed,
            strategy.targetPosition === scenario.expectedNeed,
            'Received ' + strategy.targetPosition + '.'
          );
        } else {
          test.assert(
            'Scenario: balanced roster fills dedicated starters',
            strategy.needs.QB === 0 &&
            strategy.needs.RB === 0 &&
            strategy.needs.WR === 0 &&
            strategy.needs.TE === 0
          );
        }
      });
    });

  var summary = test.summary();

  console.group('DRAFT ENGINE TEST SUITE');
  console.log(
    'Result: ' +
    summary.passed +
    ' passed, ' +
    summary.failed +
    ' failed (' +
    summary.total +
    ' total)'
  );

  summary.results.forEach(function(result) {
    console.log(
      (result.passed ? '✓ ' : '✗ ') +
      result.name +
      (result.error ? ' — ' + result.error : '')
    );
  });

  console.groupEnd();

  return summary;
}

function runDraftEngineScenario(name) {
  return runDraftEngineTests({
    scenario: name
  });
}

function buildLiveDraftDebugState() {

  var players =
    getDraftAssistantPlayers();

  var available =
    players.filter(function(player) {
      return player && player.available;
    });

  var vorpResult =
    calculateAllFantasyVorp(players);

  var draftState =
    getDraftAssistantState();

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
    calculateDraftStrategy();

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

  var context = {

    players:
      players,

    availablePlayers:
      available,

    teams:
      teams,

    currentPick:
      draftState.currentPick,

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
      calculateDecisionRosterNeeds(),

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
          profile.player.available;

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

  scored.sort(function(a, b) {
    return (
      Number(b.finalScore || 0) -
      Number(a.finalScore || 0)
    );
  });

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

function runLiveDraftRecommendationTests() {

  var state =
    buildLiveDraftDebugState();

  var context =
    state.context;

  var scored =
    state.scored;

  var rows = [];

  scored
    .slice(0, 10)
    .forEach(function(player) {

      context.currentRank =
        Number(player.rank) || 999;

      var recommendation =
        calculateDraftRecommendation(
          player,
          scored,
          context
        );

      rows.push({
        name:
          player.name,

        position:
          player.position,

        rank:
          player.rank,

        score:
          Number(player.finalScore || 0)
            .toFixed(1),

        recommendation:
          recommendation
            ? recommendation.recommendation
            : 'N/A',

        confidence:
          recommendation
            ? recommendation.confidence
            : 'N/A',

        confidenceScore:
          recommendation
            ? recommendation.confidenceScore
            : 0,

        nextBest:
          recommendation
            ? recommendation.nextBest
            : null,

        nextBestScore:
          recommendation
            ? Number(
                recommendation.nextBestScore || 0
              ).toFixed(1)
            : '0.0',

        scoreGap:
          recommendation
            ? Number(
                recommendation.scoreGap || 0
              ).toFixed(1)
            : '0.0'
      });

    });


  console.group(
    'LIVE DRAFT RECOMMENDATIONS'
  );

  console.log(
    'Current Pick:',
    state.draftState.currentPick,
    'Next Pick:',
    state.draftWindow.nextPick,
    'Picks Between:',
    state.draftWindow.picksBetween
  );

  console.table(rows);

  console.groupEnd();


  return {
    state:
      state,

    recommendations:
      rows
  };
}

function analyzeLiveDraftRecommendations(liveResult) {

  if (
    !liveResult ||
    !Array.isArray(liveResult.recommendations)
  ) {

    console.warn(
      'LIVE DRAFT WARNING ANALYZER: No recommendation data.'
    );

    return [];
  }

  var recommendations =
    liveResult.recommendations;

  var warnings = [];


  /*
   * -------------------------------------------------------
   * 1. MISSING / INVALID SCORES
   * -------------------------------------------------------
   */

  recommendations.forEach(function(row) {

    var score =
      Number(row.score);

    var confidence =
      Number(row.confidenceScore);

    var gap =
      Number(row.scoreGap);


    if (!Number.isFinite(score)) {

      warnings.push({
        player: row.name,
        type: 'INVALID SCORE',
        message:
          'Final decision score is missing or invalid.'
      });

    }


    if (
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 100
    ) {

      warnings.push({
        player: row.name,
        type: 'INVALID CONFIDENCE',
        message:
          'Confidence score is outside 0–100.'
      });

    }


    if (!Number.isFinite(gap)) {

      warnings.push({
        player: row.name,
        type: 'INVALID GAP',
        message:
          'Recommendation score gap is invalid.'
      });

    }

  });


  /*
   * -------------------------------------------------------
   * 2. ELITE PLAYER PASS / WAIT
   * -------------------------------------------------------
   *
   * Top-ranked players should rarely receive PASS.
   */

  recommendations.forEach(function(row) {

    var rank =
      Number(row.rank) || 999;

    if (
      rank <= 10 &&
      (
        row.recommendation === 'PASS' ||
        row.recommendation === 'WAIT'
      )
    ) {

      warnings.push({
        player: row.name,
        type: 'ELITE PLAYER WARNING',
        message:
          'Top-10 player received ' +
          row.recommendation +
          '. Review recommendation logic.'
      });

    }

  });


  /*
   * -------------------------------------------------------
   * 3. WAIT WITHOUT ALTERNATIVE
   * -------------------------------------------------------
   */

  recommendations.forEach(function(row) {

    if (
      row.recommendation === 'WAIT' &&
      !row.nextBest
    ) {

      warnings.push({
        player: row.name,
        type: 'WAIT WITHOUT ALTERNATIVE',
        message:
          'Player was told to WAIT but no next-pick alternative exists.'
      });

    }

  });


  /*
   * -------------------------------------------------------
   * 4. PASS DESPITE LARGE POSITIVE GAP
   * -------------------------------------------------------
   */

  recommendations.forEach(function(row) {

    var gap =
      Number(row.scoreGap) || 0;

    if (
      row.recommendation === 'PASS' &&
      gap >= 5
    ) {

      warnings.push({
        player: row.name,
        type: 'PASS/GAP CONFLICT',
        message:
          'PASS recommendation conflicts with a +' +
          gap.toFixed(1) +
          ' score advantage.'
      });

    }

  });


  /*
   * -------------------------------------------------------
   * 5. DRAFT DESPITE NEGATIVE GAP
   * -------------------------------------------------------
   */

  recommendations.forEach(function(row) {

    var gap =
      Number(row.scoreGap) || 0;

    if (
      row.recommendation === 'DRAFT' &&
      gap < 0
    ) {

      warnings.push({
        player: row.name,
        type: 'DRAFT/GAP CONFLICT',
        message:
          'DRAFT recommendation has a negative score gap.'
      });

    }

  });


  /*
   * -------------------------------------------------------
   * 6. SAME NEXT-BEST PLAYER DOMINATING
   * -------------------------------------------------------
   *
   * This is not automatically wrong.
   *
   * But if nearly every candidate points to the exact
   * same next-pick alternative, we want to inspect it.
   */

  var nextBestCounts = {};

  recommendations.forEach(function(row) {

    if (!row.nextBest) {
      return;
    }

    nextBestCounts[row.nextBest] =
      (nextBestCounts[row.nextBest] || 0) + 1;

  });


  Object.keys(nextBestCounts)
    .forEach(function(name) {

      var count =
        nextBestCounts[name];

      if (
        recommendations.length >= 5 &&
        count / recommendations.length >= 0.8
      ) {

        warnings.push({
          player: name,
          type: 'ALTERNATIVE CONCENTRATION',
          message:
            name +
            ' is the next-best alternative for ' +
            count +
            ' of ' +
            recommendations.length +
            ' top candidates.'
        });

      }

    });


  /*
   * -------------------------------------------------------
   * 7. EVERYONE IS DRAFT
   * -------------------------------------------------------
   */

  var draftCount =
    recommendations.filter(function(row) {
      return row.recommendation === 'DRAFT';
    }).length;

  if (
    recommendations.length >= 5 &&
    draftCount === recommendations.length
  ) {

    warnings.push({
      player: 'ALL',
      type: 'RECOMMENDATION CONCENTRATION',
      message:
        'Every displayed player received DRAFT. ' +
        'This may indicate overly aggressive thresholds.'
    });

  }


  /*
   * -------------------------------------------------------
   * OUTPUT
   * -------------------------------------------------------
   */

  console.group(
    'LIVE DRAFT SANITY WARNINGS'
  );

  if (!warnings.length) {

    console.log(
      '✓ No sanity warnings detected.'
    );

  } else {

    console.table(warnings);

  }

  console.groupEnd();


  return warnings;
}

function getPrimaryDraftRecommendation(
  liveResult
) {

  if (
    !liveResult ||
    !liveResult.state ||
    !Array.isArray(liveResult.state.scored) ||
    !liveResult.state.scored.length
  ) {

    console.warn(
      'PRIMARY PICK: No scored players available.'
    );

    return null;
  }

  var state =
    liveResult.state;

  var scored =
    state.scored;

  var context =
    state.context;


  /*
   * -------------------------------------------------------
   * TOP CURRENT PLAYERS
   * -------------------------------------------------------
   */

  var primaryPlayer =
    scored[0] || null;

  var secondPlayer =
    scored[1] || null;

  var thirdPlayer =
    scored[2] || null;


  if (!primaryPlayer) {
    return null;
  }


  /*
   * -------------------------------------------------------
   * CURRENT-PLAYER GAPS
   * -------------------------------------------------------
   *
   * These are different from the next-pick score gap.
   *
   * This answers:
   *
   * "How much better is my #1 option RIGHT NOW
   * than my #2 option RIGHT NOW?"
   */

  var primaryScore =
    Number(
      primaryPlayer.finalScore
    ) || 0;

  var secondScore =
    secondPlayer
      ? Number(
          secondPlayer.finalScore
        ) || 0
      : 0;

  var thirdScore =
    thirdPlayer
      ? Number(
          thirdPlayer.finalScore
        ) || 0
      : 0;

  var gapToSecond =
    secondPlayer
      ? primaryScore - secondScore
      : 0;

  var gapToThird =
    thirdPlayer
      ? primaryScore - thirdScore
      : 0;


  /*
   * -------------------------------------------------------
   * GET PRIMARY PLAYER'S WAITING DECISION
   * -------------------------------------------------------
   */

  context.currentRank =
    Number(
      primaryPlayer.rank
    ) || 999;

  var recommendation =
    calculateDraftRecommendation(
      primaryPlayer,
      scored,
      context
    );


  /*
   * -------------------------------------------------------
   * DETERMINE HOW CLOSE #2 IS
   * -------------------------------------------------------
   */

  var alternativeLabel =
    'CLEAR SECOND';

  if (gapToSecond <= 1) {

    alternativeLabel =
      'NEAR TIE';

  } else if (gapToSecond <= 3) {

    alternativeLabel =
      'CLOSE ALTERNATIVE';

  } else if (gapToSecond <= 6) {

    alternativeLabel =
      'SECONDARY OPTION';

  }


  /*
   * -------------------------------------------------------
   * PRIMARY PICK CONFIDENCE
   * -------------------------------------------------------
   *
   * This measures confidence in WHO to draft,
   * not merely whether the player should be drafted now.
   */

  var pickConfidence =
    'LOW';

  if (gapToSecond >= 8) {

    pickConfidence =
      'VERY HIGH';

  } else if (gapToSecond >= 5) {

    pickConfidence =
      'HIGH';

  } else if (gapToSecond >= 2) {

    pickConfidence =
      'MODERATE';

  }


  /*
   * -------------------------------------------------------
   * OUTPUT
   * -------------------------------------------------------
   */

  console.group(
    'PRIMARY DRAFT RECOMMENDATION'
  );

  console.log(
    'Draft Window:',
    {
      currentPick:
        state.draftState.currentPick,

      nextPick:
        state.draftWindow.nextPick,

      picksBetween:
        state.draftWindow.picksBetween
    }
  );


  console.table([
    {
      role:
        'PRIMARY',

      name:
        primaryPlayer.name,

      position:
        primaryPlayer.position,

      rank:
        primaryPlayer.rank,

      score:
        primaryScore.toFixed(1),

      recommendation:
        recommendation
          ? recommendation.recommendation
          : 'N/A'
    },

    secondPlayer
      ? {
          role:
            alternativeLabel,

          name:
            secondPlayer.name,

          position:
            secondPlayer.position,

          rank:
            secondPlayer.rank,

          score:
            secondScore.toFixed(1),

          recommendation:
            ''
        }
      : null,

    thirdPlayer
      ? {
          role:
            'THIRD',

          name:
            thirdPlayer.name,

          position:
            thirdPlayer.position,

          rank:
            thirdPlayer.rank,

          score:
            thirdScore.toFixed(1),

          recommendation:
            ''
        }
      : null

  ].filter(Boolean));


  console.log(
    'Gap to #2:',
    gapToSecond.toFixed(1)
  );

  console.log(
    'Gap to #3:',
    gapToThird.toFixed(1)
  );

  console.log(
    'Primary Pick Confidence:',
    pickConfidence
  );

  console.log(
    'Wait-vs-Draft Recommendation:',
    recommendation
      ? recommendation.recommendation
      : 'N/A'
  );

  console.log(
    'Best projected next-pick option:',
    recommendation
      ? recommendation.nextBest
      : null
  );

  console.groupEnd();


  return {

    primary:
      primaryPlayer,

    second:
      secondPlayer,

    third:
      thirdPlayer,

    gapToSecond:
      gapToSecond,

    gapToThird:
      gapToThird,

    alternativeLabel:
      alternativeLabel,

    pickConfidence:
      pickConfidence,

    recommendation:
      recommendation

  };
}

function runLiveDraftScenario(pick) {

  pick =
    Number(pick) || 0;

  if (pick <= 0) {

    console.warn(
      'LIVE DRAFT SCENARIO: Invalid pick.',
      pick
    );

    return null;
  }


  /*
   * -------------------------------------------------------
   * SAVE CURRENT DRAFT STATE
   * -------------------------------------------------------
   *
   * We temporarily simulate another current pick,
   * run the live engine, then restore the real state.
   */

  var originalGetDraftAssistantState =
    getDraftAssistantState;


  /*
   * -------------------------------------------------------
   * BUILD SIMULATED STATE
   * -------------------------------------------------------
   */

  var realState =
    originalGetDraftAssistantState();

  var teams =
    Number(realState.teams) || 10;

  var draftWindow =
    calculateMyNextDraftPick(
      pick,
      teams
    );


  /*
   * Temporarily override the state getter so every
   * draft-aware function sees the simulated pick.
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


  var liveResult = null;
  var warnings = [];


  try {

    /*
     * -------------------------------------------------------
     * RUN REAL LIVE ENGINE
     * -------------------------------------------------------
     */

var simulatedOutput =
  draftEngineWithSimulatedPriorPicks(
    pick,
    function() {

      var result =
        runLiveDraftRecommendationTests();

      var resultWarnings =
        analyzeLiveDraftRecommendations(
          result
        );

      return {
        liveResult:
          result,

        warnings:
          resultWarnings
      };

    }
  );

liveResult =
  simulatedOutput.liveResult;

warnings =
  simulatedOutput.warnings;

var primaryRecommendation =
  getPrimaryDraftRecommendation(
    liveResult
  );


    /*
     * -------------------------------------------------------
     * SCENARIO SUMMARY
     * -------------------------------------------------------
     */

    console.group(
      'LIVE DRAFT SCENARIO — PICK ' + pick
    );

    console.log(
      'Teams:',
      teams
    );

    console.log(
      'Current Pick:',
      pick
    );

    console.log(
      'Next Pick:',
      draftWindow.nextPick
    );

    console.log(
      'Picks Between:',
      draftWindow.picksBetween
    );


    if (
      liveResult &&
      Array.isArray(
        liveResult.recommendations
      )
    ) {

      console.table(
        liveResult.recommendations
          .slice(0, 10)
          .map(function(row) {

            return {

              name:
                row.name,

              position:
                row.position,

              rank:
                row.rank,

              score:
                row.score,

              recommendation:
                row.recommendation,

              confidence:
                row.confidence,

              nextBest:
                row.nextBest,

              scoreGap:
                row.scoreGap

            };

          })
      );

    }


    console.log(
      'Warnings:',
      warnings.length
    );

    console.groupEnd();

  } finally {

    /*
     * -------------------------------------------------------
     * ALWAYS RESTORE REAL DRAFT STATE
     * -------------------------------------------------------
     */

    getDraftAssistantState =
      originalGetDraftAssistantState;

  }


  /*
   * -------------------------------------------------------
   * RETURN
   * -------------------------------------------------------
   */

  return {

    pick:
      pick,

    teams:
      teams,

    nextPick:
      draftWindow.nextPick,

    picksBetween:
      draftWindow.picksBetween,

    liveResult:
      liveResult,

    warnings:
      warnings,

    primaryRecommendation:
  primaryRecommendation,

  };
}

function runLiveRosterScenario(
  pick,
  rosterPositions
) {

  pick =
    Number(pick) || 0;

  rosterPositions =
    Array.isArray(rosterPositions)
      ? rosterPositions
      : [];


  if (pick <= 0) {

    console.warn(
      'LIVE ROSTER SCENARIO: Invalid pick.'
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
   * Simulate the current pick.
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

          return draftEngineWithSimulatedRoster(
            rosterPositions,
            function() {

              var liveResult =
                runLiveDraftRecommendationTests();

              var primary =
                getPrimaryDraftRecommendation(
                  liveResult
                );

              var warnings =
                analyzeLiveDraftRecommendations(
                  liveResult
                );


              console.group(
                'LIVE ROSTER SCENARIO — PICK ' +
                pick
              );

              console.log(
                'Simulated roster:',
                rosterPositions
              );

              console.log(
                'Roster needs:',
                liveResult.state.context.rosterNeeds
              );

              console.log(
                'Strategy:',
                liveResult.state.context.strategy
              );

              console.groupEnd();


              return {
                liveResult:
                  liveResult,

                primary:
                  primary,

                warnings:
                  warnings,

                rosterPositions:
                  rosterPositions
              };

            }
          );

        }
      );

  } finally {

    getDraftAssistantState =
      originalGetDraftAssistantState;

  }


  return result;
}

function testDraftPlayer(playerName) {

  if (!playerName) {
    console.warn(
      'PLAYER TEST: No player name provided.'
    );
    return null;
  }

  var state =
    buildLiveDraftDebugState();

  var scored =
    state.scored;

  var context =
    state.context;

  var player =
    scored.find(function(candidate) {

      return candidate &&
        candidate.name &&
        candidate.name.toLowerCase() ===
          String(playerName).toLowerCase();

    });


  if (!player) {

    console.warn(
      'PLAYER TEST: Player not found:',
      playerName
    );

    return null;

  }


  context.currentRank =
    Number(player.rank) || 999;


  var alternatives =
    calculateNextPickAlternatives(
      player,
      scored,
      context
    );


  alternatives.forEach(function(candidate) {

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
        Number(
          candidate.nextPickSurvivalScore
        ) || 0
      ) / 100;

  });


  alternatives.sort(function(a, b) {

    return (
      Number(
        b.survivalAdjustedScore || 0
      ) -
      Number(
        a.survivalAdjustedScore || 0
      )
    );

  });


  var recommendation =
    calculateDraftRecommendation(
      player,
      scored,
      context
    );


  console.group(
    'PLAYER DRAFT TEST — ' +
    player.name
  );


  console.log(
    'Draft Window:',
    {
      currentPick:
        state.draftState.currentPick,

      nextPick:
        state.draftWindow.nextPick,

      picksBetween:
        state.draftWindow.picksBetween
    }
  );


  console.table([
    {
      name:
        player.name,

      position:
        player.position,

      rank:
        player.rank,

      finalScore:
        Number(
          player.finalScore || 0
        ).toFixed(1),

      tier:
        Number(
          player.tierScore || 0
        ).toFixed(1),

      vorp:
        Number(
          player.vorpScore || 0
        ).toFixed(1),

      scarcity:
        Number(
          player.scarcityScore || 0
        ).toFixed(1),

      need:
        Number(
          player.rosterNeedScore || 0
        ).toFixed(1),

      timing:
        Number(
          player.timingScore || 0
        ).toFixed(1),

      draftAware:
        Number(
          player.draftAwareVorpOpportunityScore || 0
        ).toFixed(1)
    }
  ]);


  console.log(
    'Recommendation:',
    recommendation
  );


  console.log(
    'Top Next-Pick Alternatives:'
  );


  console.table(
    alternatives
      .slice(0, 8)
      .map(function(candidate) {

        return {

          name:
            candidate.name,

          position:
            candidate.position,

          rank:
            candidate.rank,

          score:
            Number(
              candidate.finalScore || 0
            ).toFixed(1),

          survival:
            Number(
              candidate.nextPickSurvivalScore || 0
            ).toFixed(1),

          adjusted:
            Number(
              candidate.survivalAdjustedScore || 0
            ).toFixed(1)

        };

      })
  );


  console.groupEnd();


  return {
    player:
      player,

    recommendation:
      recommendation,

    alternatives:
      alternatives,

    state:
      state
  };
}

function testDraftPlayerAtPick(
  playerName,
  pick
) {

  pick =
    Number(pick) || 0;

  if (!playerName || pick <= 0) {
    console.warn(
      'PLAYER PICK TEST: Invalid player or pick.'
    );
    return null;
  }

  var originalGetDraftAssistantState =
    getDraftAssistantState;

  var realState =
    originalGetDraftAssistantState();

  var teams =
    Number(realState.teams) || 10;

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

    console.group(
      'PLAYER PICK TEST — ' +
      playerName +
      ' @ PICK ' +
      pick
    );

result =
  draftEngineWithSimulatedPriorPicks(
    pick,
    function() {

      return testDraftPlayer(
        playerName
      );

    }
  );

    console.groupEnd();

  } finally {

    getDraftAssistantState =
      originalGetDraftAssistantState;

  }

  return result;
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

function draftEngineWithSimulatedRoster(
  positions,
  fn
) {

  positions =
    Array.isArray(positions)
      ? positions
      : [];

  var rows =
    Array.prototype.slice.call(
      document.querySelectorAll('tr.draftrow')
    );

  var originalClasses =
    rows.map(function(row) {
      return row.className;
    });


  /*
   * Group currently available rows by position.
   */

  var byPosition = {};

  rows.forEach(function(row) {

    var position =
      row.getAttribute('data-pos');

    if (!byPosition[position]) {
      byPosition[position] = [];
    }

    /*
     * Only use players who haven't already been
     * removed by the prior-picks simulator.
     */

    if (
      !row.classList.contains('drafted-other') &&
      !row.classList.contains('drafted-mine')
    ) {

      byPosition[position].push(row);

    }

  });


  /*
   * Mark players as belonging to our simulated roster.
   */

  positions.forEach(function(position) {

    var row =
      (byPosition[position] || []).shift();

    if (row) {
      row.classList.add(
        'drafted-mine'
      );
    }

  });


  try {

    return fn();

  } finally {

    rows.forEach(function(row, index) {
      row.className =
        originalClasses[index];
    });

  }
}
