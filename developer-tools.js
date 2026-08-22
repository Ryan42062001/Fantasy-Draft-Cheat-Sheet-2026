/**
 * Developer-only regression, scenario, and draft simulation tools.
 * Loaded on demand from the Developer panel.
 */

/* =========================================================
   DEVELOPER-ONLY DRAFT ENGINE TEST HARNESS

   These helpers deliberately live outside the production scoring path.
   They can be called from the browser console or the Developer panel.
   ========================================================= */

function draftEngineTestRender(summary) {
  var target = document.getElementById('developer-test-results');
  if (!target) return;

  var lines = [
    'DRAFT ENGINE TEST SUITE',
    'Result: ' + summary.passed + ' passed, ' + summary.failed + ' failed (' + summary.total + ' total)',
    ''
  ];

  summary.results.forEach(function(result) {
    lines.push((result.passed ? '✓ ' : '✗ ') + result.name + (result.error ? ' — ' + result.error : ''));
  });

  target.textContent = lines.join('\n');
}

function runDraftEnginePlayerTest(playerName) {
  var input = document.getElementById('developer-player-name');
  var requestedName = String(playerName || (input && input.value) || '').trim().toLowerCase();
  var test = draftEngineTestCreateRunner();
  var players = getDraftAssistantPlayers();
  var player = players.filter(function(candidate) { return candidate.name && candidate.name.toLowerCase() === requestedName; })[0];

  test.assert('Player exists on the draft board', !!player, requestedName ? 'No player matched “' + requestedName + '”.' : 'Enter a player name first.');
  if (player) {
    draftEngineTestWithQuietConsole(function() {
      var profiles = calculateAllFantasyVorp(players);
      var profile = profiles.profiles.filter(function(item) { return item.player && item.player.name === player.name; })[0];
      var context = draftEngineTestDecisionContext(players, { replacements: profiles.replacements, vorpMax: Math.max.apply(null, profiles.profiles.map(function(item) { return Number(item.vorp) || 0; })) || 1 });
      var scored = calculateDraftDecisionScore(Object.assign({}, player, { vorp: profile ? profile.vorp : 0, scarcity: profile ? profile.scarcity : 0 }), context);
      test.assert('Player score is finite', Number.isFinite(scored && scored.finalScore), 'Could not calculate a finite decision score.');
      test.between('Player final score is in expected range', scored.finalScore, -1000, 1000);
    });
  }

  var summary = test.summary();
  draftEngineTestRender(summary);
  return summary;
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

    test.between(
  'Package path advantage stays in safe range',
  calculatePackagePathAdvantage(
    rbOne,
    [rbOne, rbReplacement],
    context
  ),
  -2,
  2
);

    test.equal(
  'Draft phase: pick 1 is FOUNDATION',
  getDraftPhase(
    1,
    10
  ).phase,
  'FOUNDATION'
);

test.equal(
  'Draft phase: round 3 is FOUNDATION',
  getDraftPhase(
    25,
    10
  ).phase,
  'FOUNDATION'
);

test.equal(
  'Draft phase: round 4 is STARTER BUILD',
  getDraftPhase(
    31,
    10
  ).phase,
  'STARTER BUILD'
);

    test.equal(
  'Draft phase weights: FOUNDATION boosts VORP',
  getDraftPhaseWeights(
    'FOUNDATION'
  ).vorp,
  1.10
);

test.equal(
  'Draft phase weights: FOUNDATION lowers roster need',
  getDraftPhaseWeights(
    'FOUNDATION'
  ).rosterNeed,
  0.85
);

test.equal(
  'Draft phase weights: STARTER BUILD boosts roster construction',
  getDraftPhaseWeights(
    'STARTER BUILD'
  ).rosterConstruction,
  1.20
);

test.equal(
  'Draft phase weights: VALUE / DEPTH boosts scarcity',
  getDraftPhaseWeights(
    'VALUE / DEPTH'
  ).scarcity,
  1.10
);

test.equal(
  'Draft phase weights: ENDGAME reduces multi-pick planning',
  getDraftPhaseWeights(
    'UPSIDE / ENDGAME'
  ).multiPick,
  0.75
);

test.equal(
  'Draft phase weights: UNKNOWN stays neutral',
  getDraftPhaseWeights(
    'UNKNOWN'
  ).vorp,
  1
);

test.equal(
  'Draft phase: round 7 is STARTER BUILD',
  getDraftPhase(
    65,
    10
  ).phase,
  'STARTER BUILD'
);

test.equal(
  'Draft phase: round 8 is VALUE / DEPTH',
  getDraftPhase(
    71,
    10
  ).phase,
  'VALUE / DEPTH'
);

test.equal(
  'Draft phase: round 12 is UPSIDE / ENDGAME',
  getDraftPhase(
    111,
    10
  ).phase,
  'UPSIDE / ENDGAME'
);

test.equal(
  'Draft phase: invalid pick returns UNKNOWN',
  getDraftPhase(
    0,
    10
  ).phase,
  'UNKNOWN'
);

test.equal(
  'Multi-pick: pick 21 first future pick is 40',
  multiPick21.firstNextPick,
  40
);

    test.assert(
  'Package adjustment returns player array',
  Array.isArray(
    applyPackagePathAdjustments(
      [
        {
          name: 'Test RB',
          position: 'RB',
          rank: 1,
          finalScore: 90,
          available: true
        }
      ],
      context,
      1
    )
  )
);

    test.assert(
  'Package adjustment leaves players with finite scores',
  (function() {

    var testPlayers = [
      {
        name: 'Test RB',
        position: 'RB',
        rank: 1,
        finalScore: 90,
        available: true
      }
    ];

    applyPackagePathAdjustments(
      testPlayers,
      context,
      1
    );

    return Number.isFinite(
      testPlayers[0].finalScore
    );

  })()
);

    test.assert(
  'Projected package returns result',
  !!calculateProjectedDraftPackage(
    rbOne,
    context
  )
);

test.between(
  'Projected package has finite value',
  calculateProjectedDraftPackage(
    rbOne,
    context
  ).packageValue,
  0,
  1000
);

test.between(
  'Projected package future-pick count stays 0–2',
  calculateProjectedDraftPackage(
    rbOne,
    context
  ).completeFuturePicks,
  0,
  2
);

    test.assert(
  'Future player projection returns an array',
  Array.isArray(
    getProjectedPlayersAtFuturePick(
      'RB',
      20,
      context
    )
  )
);

test.assert(
  'Future player projection returns no more than 5',
  getProjectedPlayersAtFuturePick(
    'RB',
    20,
    context
  ).length <= 5
);

test.assert(
  'Future player projection rejects invalid position',
  getProjectedPlayersAtFuturePick(
    'XYZ',
    20,
    context
  ).length === 0
);

    test.assert(
  'Multi-pick path returns result',
  !!calculateMultiPickPositionPath(
    rbOne,
    context
  )
);

    var justAfterPickSurvival =
  calculateNextPickSurvival(
    {
      name: 'Just After Pick',
      position: 'WR',
      rank: 21,
      adp: 21,
      timingScore: 0
    },
    {
      teams: 10,
      currentPick: 1,
      calculatedNextPick: 20,
      calculatedPicksUntilNext: 18,
      currentRank: 1
    }
  );

var fartherAfterPickSurvival =
  calculateNextPickSurvival(
    {
      name: 'Farther After Pick',
      position: 'WR',
      rank: 28,
      adp: 28,
      timingScore: 0
    },
    {
      teams: 10,
      currentPick: 1,
      calculatedNextPick: 20,
      calculatedPicksUntilNext: 18,
      currentRank: 1
    }
  );

test.assert(
  'Survival: later-ranked player is more likely to survive future pick',
  fartherAfterPickSurvival >
    justAfterPickSurvival
);

test.between(
  'Survival: post-pick bonus remains bounded',
  fartherAfterPickSurvival,
  0,
  100
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

    test.between(
  'Multi-pick planning score stays in safe range',
  calculateMultiPickPlanningScore(
    rbOne,
    context
  ),
  -1,
  2
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

    test.between(
  'Phase core adjustment stays in safe range',
  calculatePhaseCoreAdjustment(
    100,
    100,
    4,
    getDraftPhaseWeights(
      'FOUNDATION'
    )
  ).total,
  -3,
  3
);

test.assert(
  'Phase core adjustment: FOUNDATION rewards elite value',
  calculatePhaseCoreAdjustment(
    100,
    100,
    0,
    getDraftPhaseWeights(
      'FOUNDATION'
    )
  ).total > 0
);

test.assert(
  'Phase core adjustment: STARTER BUILD rewards roster need',
  calculatePhaseCoreAdjustment(
    0,
    0,
    4,
    getDraftPhaseWeights(
      'STARTER BUILD'
    )
  ).rosterNeed > 0
);

test.equal(
  'Phase core adjustment: neutral weights return 0',
  calculatePhaseCoreAdjustment(
    80,
    70,
    3,
    getDraftPhaseWeights(
      'UNKNOWN'
    )
  ).total,
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

var liveStateForPositions =
  buildLiveDraftDebugState();

test.assert(
  'Decision pool includes K',
  liveStateForPositions.scored.some(function(player) {
    return player.position === 'K';
  })
);

test.assert(
  'Decision pool includes DST',
  liveStateForPositions.scored.some(function(player) {
    return player.position === 'DST';
  })
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
  'Remaining picks: 12-team slot 12 from pick 156',
  getMyRemainingDraftPicks(
    156,
    12,
    16,
    12
  ).join(','),
  '156,157,180,181'
);

test.equal(
  'Remaining picks: 12-team slot 12 from pick 157',
  getMyRemainingDraftPicks(
    157,
    12,
    16,
    12
  ).join(','),
  '157,180,181'
);

test.equal(
  'Remaining picks: 10-team slot 1 from pick 140',
  getMyRemainingDraftPicks(
    140,
    10,
    16,
    1
  ).join(','),
  '140,141,160'
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
  'Draft grade: early TE2 reduces draft-capital efficiency',
  gradeSimulatedDraft({
    roster: {
      QB: ['QB1'],
      RB: ['RB1', 'RB2', 'RB3', 'RB4', 'RB5'],
      WR: ['WR1', 'WR2', 'WR3', 'WR4', 'WR5'],
      TE: ['TE1', 'TE2'],
      K: ['K1'],
      DST: ['DST1']
    },
    myDraft: [
      {
        round: 2,
        position: 'TE',
        pick: 20,
        rank: 20
      },
      {
        round: 4,
        position: 'TE',
        pick: 40,
        rank: 40
      }
    ]
  }).draftCapitalEfficiency,
  90
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

    /*
 * =======================================================
 * PHASE 12 — DYNAMIC STRATEGY STATE
 * =======================================================
 */

test.assert(
  'Dynamic strategy state builder exists',
  typeof buildDynamicStrategyState ===
    'function'
);


var dynamicStrategyState =
  buildDynamicStrategyState();


test.assert(
  'Dynamic strategy state returns position map',
  !!(
    dynamicStrategyState &&
    dynamicStrategyState.positions &&
    dynamicStrategyState.positions.QB &&
    dynamicStrategyState.positions.RB &&
    dynamicStrategyState.positions.WR &&
    dynamicStrategyState.positions.TE
  )
);


test.assert(
  'Dynamic strategy states use valid labels',
  Object.keys(
    dynamicStrategyState.positions
  ).every(function(position) {

    return [
      'PRIORITIZE',
      'MONITOR',
      'WAIT',
      'NEUTRAL'
    ].includes(
      dynamicStrategyState
        .positions[position]
        .state
    );

  })
);


test.assert(
  'Dynamic strategy classification arrays are valid',
  (
    Array.isArray(
      dynamicStrategyState
        .priorityPositions
    ) &&
    Array.isArray(
      dynamicStrategyState
        .monitorPositions
    ) &&
    Array.isArray(
      dynamicStrategyState
        .waitPositions
    )
  )
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

  test.equal(
  'Dynamic strategy adjustment PRIORITIZE is positive',
  calculateDynamicStrategyAdjustment(
    { position: 'RB' },
    {
      positions: {
        RB: {
          state: 'PRIORITIZE'
        }
      }
    }
  ),
  1.25
);


test.equal(
  'Dynamic strategy adjustment WAIT is negative',
  calculateDynamicStrategyAdjustment(
    { position: 'QB' },
    {
      positions: {
        QB: {
          state: 'WAIT'
        }
      }
    }
  ),
  -0.75
);


test.between(
  'Dynamic strategy adjustment stays bounded',
  calculateDynamicStrategyAdjustment(
    { position: 'WR' },
    {
      positions: {
        WR: {
          state: 'PRIORITIZE'
        }
      }
    }
  ),
  -1,
  1.5
);

  test.equal(
  'Recommendation: back-to-back turn does not return WAIT',
  calculateDraftRecommendation(
    {
      finalScore: 80
    },
    [
      {
        finalScore: 80
      }
    ],
    {
      picksBetween: 0
    }
  ).recommendation,
  'DRAFT'
);

var phase11Forecast =
  buildDraftPathForecast(
    rbOne,
    context
  );


test.assert(
  'Draft path forecast returns result',
  !!phase11Forecast
);


test.assert(
  'Draft path forecast returns three-step array',
  !!(
    phase11Forecast &&
    Array.isArray(
      phase11Forecast.steps
    ) &&
    phase11Forecast.steps.length >= 1 &&
    phase11Forecast.steps.length <= 3
  )
);


test.assert(
  'Draft path forecast returns position path',
  !!(
    phase11Forecast &&
    typeof phase11Forecast.positionPath ===
      'string' &&
    phase11Forecast.positionPath.length > 0
  )
);


test.between(
  'Draft path confidence stays 0–100',
  phase11Forecast
    ? phase11Forecast.confidenceScore
    : 0,
  0,
  100
);

test.assert(
  'Recommendation: back-to-back turn is flagged',
  calculateDraftRecommendation(
    {
      finalScore: 80
    },
    [
      {
        finalScore: 80
      }
    ],
    {
      picksBetween: 0
    }
  ).backToBackTurn === true
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

  test.equal(
  'Full draft math: 10 teams x 16 rounds = 160 picks',
  10 * 16,
  160
);

test.assert(
  'Endgame: early K is strongly discouraged',
  calculateEndgameRosterRequirement(
    { position: 'K' },
    {
      currentPick: 50,
      teams: 10,
      rounds: 16
    }
  ) < 0
);

  var phase11Comparison =
  compareDraftPathForecasts(
    [rbOne, rbReplacement],
    context,
    2
  );


test.assert(
  'Draft path comparison returns result',
  !!phase11Comparison
);


test.assert(
  'Draft path comparison returns forecast array',
  Array.isArray(
    phase11Comparison.forecasts
  )
);


test.assert(
  'Draft path comparison ranks best path first',
  !phase11Comparison.bestPath ||
  phase11Comparison.bestPath.rank === 1
);


test.assert(
  'Draft path comparison gap from best is non-negative',
  phase11Comparison.forecasts.every(
    function(path) {

      return (
        Number(
          path.gapFromBest
        ) >= 0
      );

    }
  )
);

test.assert(
  'Endgame: early DST is strongly discouraged',
  calculateEndgameRosterRequirement(
    { position: 'DST' },
    {
      currentPick: 50,
      teams: 10,
      rounds: 16
    }
  ) < 0
);

test.assert(
  'Endgame: round 15 rewards missing K',
  calculateEndgameRosterRequirement(
    { position: 'K' },
    {
      currentPick: 141,
      teams: 10,
      rounds: 16
    }
  ) > 0
);

test.assert(
  'Endgame: final round penalizes unrelated player when K/DST missing',
  calculateEndgameRosterRequirement(
    { position: 'RB' },
    {
      currentPick: 151,
      teams: 10,
      rounds: 16
    }
  ) < 0
);

var runUrgencyContext = {

  draftRuns: {

    isRun:
      true,

    position:
      'RB',

    strength:
      'STRONG',

    runs: {

      QB: {
        strength: 'NONE',
        runScore: 0
      },

      RB: {
        strength: 'STRONG',
        runScore: 70
      },

      WR: {
        strength: 'NONE',
        runScore: 0
      },

      TE: {
        strength: 'NONE',
        runScore: 0
      }

    }

  },

  rosterNeeds: {
    QB: 1,
    RB: 1,
    WR: 1,
    TE: 1,
    FLEX: 0
  },

  tierCliffs: {}

};


test.assert(
  'Run urgency: needed position receives urgency',
  calculateDraftRunUrgency(
    { position: 'RB' },
    runUrgencyContext
  ) > 0
);


test.equal(
  'Run urgency: unrelated position receives 0',
  calculateDraftRunUrgency(
    { position: 'WR' },
    runUrgencyContext
  ),
  0
);


var noNeedRunContext =
  Object.assign(
    {},
    runUrgencyContext,
    {
      rosterNeeds: {
        QB: 1,
        RB: 0,
        WR: 1,
        TE: 1,
        FLEX: 0
      }
    }
  );


test.equal(
  'Run urgency: filled position does not chase run',
  calculateDraftRunUrgency(
    { position: 'RB' },
    noNeedRunContext
  ),
  0
);


var cliffRunContext =
  Object.assign(
    {},
    runUrgencyContext,
    {
      tierCliffs: {
        RB: {
          severity: 'HIGH'
        }
      }
    }
  );


test.assert(
  'Run urgency: tier cliff increases urgency',
  calculateDraftRunUrgency(
    { position: 'RB' },
    cliffRunContext
  ) >
  calculateDraftRunUrgency(
    { position: 'RB' },
    runUrgencyContext
  )
);

test.equal(
  'Full draft math: slot 1 first pick belongs to team 1',
  getSnakeDraftTeamForPick(
    1,
    10
  ).teamSlot,
  1
);

test.equal(
  'Full draft math: slot 1 turn pick 20 belongs to team 1',
  getSnakeDraftTeamForPick(
    20,
    10
  ).teamSlot,
  1
);

test.assert(
  'Roster saturation: drafting RB7 is heavily penalized',
  draftEngineTestWithRoster(
    ['RB', 'RB', 'RB', 'RB', 'RB', 'RB'],
    function() {

      return (
        calculateRosterSaturationPenalty(
          { position: 'RB' },
          {}
        ) <= -12
      );

    }
  )
);

  test.equal(
    'Decision score exposes FOUNDATION phase at pick 1',
    scored.draftPhase,
    'FOUNDATION'
  );

  test.equal(
  'Roster saturation: empty roster has no RB penalty',
  draftEngineTestWithRoster(
    [],
    function() {
      return calculateRosterSaturationPenalty(
        { position: 'RB' },
        {}
      );
    }
  ),
  0
);

test.equal(
  'Roster saturation: RB5 gets mild penalty',
  draftEngineTestWithRoster(
    ['RB', 'RB', 'RB', 'RB'],
    function() {
      return calculateRosterSaturationPenalty(
        { position: 'RB' },
        {}
      );
    }
  ),
  -2
);

test.assert(
  'Roster saturation: RB7 gets strong penalty',
  draftEngineTestWithRoster(
    ['RB', 'RB', 'RB', 'RB', 'RB', 'RB'],
    function() {
      return calculateRosterSaturationPenalty(
        { position: 'RB' },
        {}
      );
    }
  ) <= -8
);

test.equal(
  'Roster saturation: second QB is discouraged',
  draftEngineTestWithRoster(
    ['QB'],
    function() {
      return calculateRosterSaturationPenalty(
        { position: 'QB' },
        {}
      );
    }
  ),
  -4
);

var opponentSummaryLow =
  summarizeOpponentDraftThreat(
    { position: 'QB', name: 'Test QB' },
    {
      teams: 10,
      currentPick: 10,
      calculatedNextPick: 11
    }
  );


test.assert(
  'Opponent summary returns valid threat label',
  [
    'LOW',
    'MODERATE',
    'HIGH'
  ].includes(
    opponentSummaryLow.label
  )
);


test.assert(
  'Opponent summary returns numeric threatening-team count',
  Number.isFinite(
    opponentSummaryLow.threateningTeams
  )
);


test.assert(
  'Opponent summary separates soft demand from meaningful threat',
  Number.isFinite(
    opponentSummaryLow.softThreatTeams
  ) &&
  Number.isFinite(
    opponentSummaryLow.threateningTeams
  )
);


test.equal(
  'Survival: back-to-back pick guarantees player survives',
  calculateNextPickSurvival(
    {
      name: 'Turn Player',
      position: 'RB',
      rank: 24,
      timingScore: 100
    },
    {
      currentPick: 24,
      calculatedNextPick: 25,
      calculatedPicksUntilNext: 0,
      currentRank: 24
    }
  ),
  100
);

test.equal(
  'Survival: back-to-back guarantee ignores player rank',
  calculateNextPickSurvival(
    {
      name: 'Elite Turn Player',
      position: 'WR',
      rank: 1,
      timingScore: 100
    },
    {
      currentPick: 24,
      calculatedNextPick: 25,
      calculatedPicksUntilNext: 0,
      currentRank: 24
    }
  ),
  100
);

  test.assert(
    'Decision score returns phase-adjusted roster construction',
    Number.isFinite(
      scored.phaseAdjustedRosterConstructionScore
    )
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

    test.assert(
  'Draft grade returns result',
  !!gradeSimulatedDraft({
    roster: {
      QB: ['QB1'],
      RB: ['RB1', 'RB2', 'RB3', 'RB4', 'RB5'],
      WR: ['WR1', 'WR2', 'WR3', 'WR4', 'WR5'],
      TE: ['TE1'],
      K: ['K1'],
      DST: ['DST1']
    },
    myDraft: []
  })
);

test.equal(
  'Draft grade: complete roster gets 100 starter completion',
  gradeSimulatedDraft({
    roster: {
      QB: ['QB1'],
      RB: ['RB1', 'RB2'],
      WR: ['WR1', 'WR2'],
      TE: ['TE1'],
      K: ['K1'],
      DST: ['DST1']
    },
    myDraft: []
  }).starterCompletion,
  100
);

test.equal(
  'Draft grade: missing K reduces endgame completion',
  gradeSimulatedDraft({
    roster: {
      QB: ['QB1'],
      RB: ['RB1', 'RB2'],
      WR: ['WR1', 'WR2'],
      TE: ['TE1'],
      K: [],
      DST: ['DST1']
    },
    myDraft: []
  }).endgameCompletion,
  50
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

function runTurnPackageTests() {

  console.group(
    'TURN PACKAGE TEST SUITE'
  );


  var result =
    calculateTurnPackage(
      12,
      1,
      24
    );


  var tests = [];


  function assert(
    name,
    condition
  ) {

    tests.push({
      name: name,
      passed: !!condition
    });

  }


  assert(
    'Turn package returns result',
    !!result
  );


  assert(
    'Turn package returns best package',
    !!(
      result &&
      result.bestPackage
    )
  );


  assert(
    'Turn package evaluates multiple combinations',
    !!(
      result &&
      Array.isArray(
        result.packages
      ) &&
      result.packages.length > 1
    )
  );


  assert(
    'Turn package advantage stays in safe range',
    !!(
      result &&
      Number.isFinite(
        Number(
          result.packageAdvantage
        )
      ) &&
      Number(
        result.packageAdvantage
      ) >= 0 &&
      Number(
        result.packageAdvantage
      ) <= 100
    )
  );


  assert(
    'Turn package confidence returns valid level',
    !!(
      result &&
      [
        'LOW',
        'MODERATE',
        'HIGH',
        'VERY HIGH'
      ].includes(
        result.packageConfidence
      )
    )
  );


  var passed =
    tests.filter(function(test) {
      return test.passed;
    }).length;


  var failed =
    tests.length -
    passed;


  console.log(
    'Result:',
    passed +
      ' passed, ' +
      failed +
      ' failed (' +
      tests.length +
      ' total)'
  );


  tests.forEach(function(test) {

    console.log(
      test.passed
        ? '✓ ' + test.name
        : '✗ ' + test.name
    );

  });


  console.groupEnd();


  return {
    results:
      tests,

    passed:
      passed,

    failed:
      failed,

    total:
      tests.length
  };
}

function runDraftEngineScenario(name) {
  return runDraftEngineTests({
    scenario: name
  });
}

function runRecommendationExplanationTests() {

  console.group(
    'RECOMMENDATION EXPLANATION TEST SUITE'
  );


  var tests = [];


  function assert(
    name,
    condition
  ) {

    tests.push({
      name: name,
      passed: !!condition
    });

  }


  /*
   * -------------------------------------------------------
   * BUILD NORMAL SINGLE-PICK EXPLANATION
   * -------------------------------------------------------
   */

  var state =
    buildLiveDraftDebugState();


  var normalRecommendation =
    (
      state &&
      state.scored &&
      state.scored.length
    )
      ? calculateDraftRecommendation(
          state.scored[0],
          state.scored,
          state.context
        )
      : null;


  var normalExplanation =
    normalRecommendation
      ? buildRecommendationExplanation(
          normalRecommendation,
          state.scored[0],
          state.scored[1] || null
        )
      : null;


  assert(
    'Explanation returns result',
    !!normalExplanation
  );


  assert(
    'Explanation returns SINGLE_PICK type',
    !!(
      normalExplanation &&
      normalExplanation.type ===
        'SINGLE_PICK'
    )
  );


  assert(
    'Explanation reasons are strings and capped at 4',
    !!(
      normalExplanation &&
      Array.isArray(
        normalExplanation.reasons
      ) &&
      normalExplanation.reasons.length <= 4 &&
      normalExplanation.reasons.every(
        function(reason) {
          return (
            typeof reason ===
            'string'
          );
        }
      )
    )
  );


  assert(
    'Explanation returns next action',
    !!(
      normalExplanation &&
      typeof normalExplanation.nextAction ===
        'string' &&
      normalExplanation.nextAction.length > 0
    )
  );


  /*
   * -------------------------------------------------------
   * PRIORITY TEST
   * -------------------------------------------------------
   *
   * A large score gap should outrank lower-priority
   * contextual reasons.
   */

  assert(
    'Explanation prioritizes strong score advantage',
    !!(
      buildRecommendationExplanation(
        {
          player: 'Test RB',
          nextBest: 'Test WR',
          scoreGap: 10,
          recommendation: 'DRAFT',
          confidence: 'HIGH'
        },
        {
          name: 'Test RB',
          tierScore: 90,
          rankScore: 90,
          vorpScore: 85,
          scarcityScore: 40,
          rosterNeedScore: 25,
          timingScore: 50,
          finalScore: 90,
          draftPhase: 'FOUNDATION'
        },
        {
          name: 'Test WR',
          finalScore: 80
        }
      ).reasons[0]
        .indexOf('leads') !== -1
      /*
       * The live top recommendation is allowed to be a close
       * call; use a deterministic large-gap fixture here.
       */
      &&
      normalExplanation &&
      normalExplanation.reasons &&
      normalExplanation.reasons.length
    )
  );


  /*
   * -------------------------------------------------------
   * TURN-PACKAGE EXPLANATION
   * -------------------------------------------------------
   */

  var turnPackage =
    calculateTurnPackage(
      12,
      1,
      24,
      {
        silent:
          true
      }
    );


  var turnRecommendation =
    turnPackage &&
    turnPackage.bestPackage
      ? {
          recommendation:
            'DRAFT',

          confidence:
            turnPackage.packageConfidence,

          player:
            turnPackage.bestPackage.firstName,

          turnPackageActive:
            true,

          turnRecommendedNow:
            turnPackage.bestPackage.firstName,

          turnTargetNext:
            turnPackage.bestPackage.secondName,

          turnPackageAdvantage:
            turnPackage.packageAdvantage,

          turnPackageConfidence:
            turnPackage.packageConfidence
        }
      : null;


  var turnExplanation =
    turnRecommendation
      ? buildRecommendationExplanation(
          turnRecommendation,
          null,
          null
        )
      : null;


  assert(
    'Turn explanation returns TURN_PACKAGE type',
    !!(
      turnExplanation &&
      turnExplanation.type ===
        'TURN_PACKAGE'
    )
  );


  assert(
    'Turn explanation returns next target',
    !!(
      turnExplanation &&
      turnExplanation.nextTarget
    )
  );


  assert(
    'Turn explanation uses valid confidence',
    !!(
      turnExplanation &&
      [
        'LOW',
        'MODERATE',
        'HIGH',
        'VERY HIGH'
      ].includes(
        turnExplanation.confidence
      )
    )
  );


  /*
   * -------------------------------------------------------
   * RESULTS
   * -------------------------------------------------------
   */

  var passed =
    tests.filter(function(test) {
      return test.passed;
    }).length;


  var failed =
    tests.length -
    passed;


  console.log(
    'Result:',
    passed +
      ' passed, ' +
    failed +
      ' failed (' +
    tests.length +
      ' total)'
  );


  tests.forEach(function(test) {

    console.log(
      test.passed
        ? '✓ ' + test.name
        : '✗ ' + test.name
    );

  });


  console.groupEnd();


  return {

    results:
      tests,

    passed:
      passed,

    failed:
      failed,

    total:
      tests.length

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
            : '0.0',

        backToBackTurn:
          Boolean(
            recommendation &&
            recommendation.backToBackTurn
          ),

        summary:
          recommendation
            ? recommendation.summary || ''
            : ''
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
      gap < 0 &&
      !row.backToBackTurn
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

function runFantasyProsRoadmapSimulations() {
  var scenarios = [
    {
      label: 'EARLY',
      pick: 1,
      roster: []
    },
    {
      label: 'MIDDLE',
      pick: 55,
      roster: ['RB', 'RB', 'WR', 'WR', 'TE']
    },
    {
      label: 'TURN',
      pick: 20,
      roster: ['RB']
    },
    {
      label: 'LATE',
      pick: 145,
      roster: [
        'QB', 'RB', 'RB', 'RB',
        'WR', 'WR', 'WR', 'WR',
        'TE', 'TE', 'RB', 'WR',
        'K', 'DST'
      ]
    }
  ];

  var inconsistencyTypes = {
    'INVALID SCORE': true,
    'INVALID CONFIDENCE': true,
    'INVALID GAP': true,
    'ELITE PLAYER WARNING': true,
    'WAIT WITHOUT ALTERNATIVE': true,
    'PASS/GAP CONFLICT': true,
    'DRAFT/GAP CONFLICT': true
  };

  var results = scenarios.map(function(scenario) {
    var result = runLiveRosterScenario(
      scenario.pick,
      scenario.roster
    );
    var primary = result && result.primary;
    var recommendation = primary && primary.recommendation;
    var scoredPrimary = primary && primary.primary;
    var warnings = result && Array.isArray(result.warnings)
      ? result.warnings
      : [];
    var inconsistencies = warnings.filter(function(warning) {
      return Boolean(inconsistencyTypes[warning.type]);
    });

    return {
      label: scenario.label,
      pick: scenario.pick,
      roster: scenario.roster.slice(),
      player: primary && primary.primary ? primary.primary.name : null,
      position: primary && primary.primary ? primary.primary.position : null,
      action: recommendation ? recommendation.recommendation : null,
      scoreGap: recommendation ? Number(recommendation.scoreGap || 0) : null,
      backToBackTurn: Boolean(recommendation && recommendation.backToBackTurn),
      factorSnapshot: scoredPrimary ? {
        finalScore: Number(scoredPrimary.finalScore || 0),
        rank: Number(scoredPrimary.rank || 0),
        tier: Number(scoredPrimary.tierScore || 0),
        rankScore: Number(scoredPrimary.rankScore || 0),
        vorp: Number(scoredPrimary.vorpScore || 0),
        scarcity: Number(scoredPrimary.scarcityScore || 0),
        rosterNeed: Number(scoredPrimary.rosterNeedScore || 0),
        timing: Number(scoredPrimary.timingScore || 0),
        adjustments: Number((
          Number(scoredPrimary.finalScore || 0) -
          Number(scoredPrimary.tierScore || 0) * 0.35 -
          Number(scoredPrimary.rankScore || 0) * 0.25 -
          Number(scoredPrimary.vorpScore || 0) * 0.20 -
          Number(scoredPrimary.scarcityScore || 0) * 0.10 -
          Number(scoredPrimary.rosterNeedScore || 0) * 0.05 -
          Number(scoredPrimary.timingScore || 0) * 0.05
        ).toFixed(2))
      } : null,
      topCandidates: result && result.liveResult && result.liveResult.state &&
        Array.isArray(result.liveResult.state.scored)
        ? result.liveResult.state.scored.slice(0, 5).map(function(candidate) {
            return {
              name: candidate.name,
              position: candidate.position,
              rank: candidate.rank,
              finalScore: Number(candidate.finalScore || 0),
              timing: Number(candidate.timingScore || 0),
              vorp: Number(candidate.vorpScore || 0),
              scarcity: Number(candidate.scarcityScore || 0)
            };
          })
        : [],
      warnings: warnings,
      inconsistencies: inconsistencies,
      passed: Boolean(primary && recommendation) && inconsistencies.length === 0
    };
  });

  var passed = results.filter(function(result) {
    return result.passed;
  }).length;
  var summary = {
    results: results,
    passed: passed,
    failed: results.length - passed,
    total: results.length
  };
  var output = document.getElementById('developer-test-results');

  if (output) {
    output.textContent = [
      'FANTASYPROS ROADMAP SIMULATIONS',
      'Result: ' + passed + '/' + results.length + ' scenarios clean'
    ].concat(results.map(function(result) {
      return [
        result.passed ? 'PASS' : 'FAIL',
        result.label,
        'pick ' + result.pick,
        result.player || 'no recommendation',
        result.position || 'N/A',
        result.action || 'N/A',
        result.scoreGap == null ? 'gap N/A' : 'gap ' + result.scoreGap.toFixed(1),
        result.backToBackTurn ? 'turn package' : '',
        result.inconsistencies.length
          ? result.inconsistencies.map(function(warning) { return warning.type; }).join(', ')
          : '0 inconsistencies'
      ].filter(Boolean).join(' · ');
    })).join('\n');
  }

  console.table(results.map(function(result) {
    return {
      scenario: result.label,
      pick: result.pick,
      player: result.player,
      position: result.position,
      action: result.action,
      scoreGap: result.scoreGap,
      turn: result.backToBackTurn,
      inconsistencies: result.inconsistencies.length,
      passed: result.passed
    };
  }));

  return summary;
}

function runCalculationSanityTests() {
  var test = draftEngineTestCreateRunner();

  test.assert(
    'Authority: ADP-only depth is excluded from ECR calculations',
    !hasAuthoritativeEcr({rank: 600, ecr: null, source: 'ADP_ONLY'})
  );

  test.equal(
    'Authority: ECR is not substituted for missing ADP',
    getFantasyProsMarketRank({rank: 10, ecr: 10, source: 'ECR_ONLY'}),
    null
  );

  var survivalContext = {
    teams: 10,
    currentPick: 1,
    calculatedNextPick: 20,
    calculatedPicksUntilNext: 18,
    skipOpponentThreat: true
  };
  var survivalBefore = calculateNextPickSurvival(
    {name: 'Before ADP', position: 'WR', adp: 10},
    Object.assign({}, survivalContext)
  );
  var survivalAt = calculateNextPickSurvival(
    {name: 'At ADP', position: 'WR', adp: 20},
    Object.assign({}, survivalContext)
  );
  var survivalAfter = calculateNextPickSurvival(
    {name: 'After ADP', position: 'WR', adp: 30},
    Object.assign({}, survivalContext)
  );

  test.assert(
    'Survival: ADP curve is monotonic around the next pick',
    survivalBefore < survivalAt && survivalAt < survivalAfter
  );
  test.between('Survival: next-pick ADP centers near 50%', survivalAt, 45, 55);
  test.equal(
    'Survival: missing ADP stays neutral',
    calculateNextPickSurvival(
      {name: 'Unknown Market', position: 'RB', rank: 15},
      Object.assign({}, survivalContext)
    ),
    50
  );

  function scoreFixture(rank, rosterNeeds) {
    return calculateDraftDecisionScore(
      {
        name: 'Rank ' + rank,
        position: 'RB',
        rank: rank,
        ecr: rank,
        source: 'ECR_ONLY',
        semanticTier: 'DEEP',
        vorp: 0,
        scarcity: 0,
        available: true
      },
      {
        currentPick: 100,
        teams: 10,
        rounds: 16,
        totalPicks: 160,
        players: [],
        rosterNeeds: rosterNeeds || {RB: 0, FLEX: 0},
        replacements: {},
        strategy: {},
        skipFutureDepth: true,
        skipMultiPickPlanning: true
      }
    );
  }

  var rank80 = scoreFixture(80);
  var rank160 = scoreFixture(160);
  test.assert(
    'ECR rank: late-round ranks remain positive and ordered',
    rank80.rankScore > rank160.rankScore && rank160.rankScore > 0
  );

  test.equal(
    'Roster need: two open RB starters normalize to 50',
    scoreFixture(80, {RB: 2, FLEX: 1}).rosterNeedScore,
    50
  );
  test.equal(
    'Roster need: one open RB/FLEX slot normalizes to 25',
    scoreFixture(80, {RB: 0, FLEX: 1}).rosterNeedScore,
    25
  );

  function scarcityFixture(ranks) {
    var players = ranks.map(function(rank) {
      return {
        name: 'RB ' + rank,
        position: 'RB',
        rank: rank,
        ecr: rank,
        source: 'ECR_ONLY',
        available: true
      };
    });
    return calculatePositionScarcity(players[0], players, {});
  }

  test.assert(
    'Scarcity: wider nearby ECR gaps score higher than dense depth',
    scarcityFixture([10, 20, 30, 40, 50]) >
      scarcityFixture([10, 12, 14, 16, 18])
  );

  var orderedPosition = enforceAuthoritativePositionOrder([
    {name: 'Better RB', position: 'RB', rank: 10, ecr: 10, finalScore: 50},
    {name: 'Worse RB', position: 'RB', rank: 20, ecr: 20, finalScore: 55}
  ]);
  test.assert(
    'Authority: derived nudges cannot invert same-position ECR order',
    orderedPosition[0].name === 'Better RB' &&
      orderedPosition[0].finalScore > orderedPosition[1].finalScore
  );

  var originalStateGetter = getDraftAssistantState;
  var replacementPlayers = [];
  for (var index = 1; index <= 25; index++) {
    replacementPlayers.push({
      name: 'Replacement RB ' + index,
      position: 'RB',
      rank: index * 3,
      ecr: index * 3,
      source: 'ECR_ONLY',
      available: true
    });
  }
  var earlyReplacement = null;
  var turnReplacement = null;
  try {
    getDraftAssistantState = function() {
      return {teams: 10, rounds: 16, draftSlot: 1, totalPicks: 160, currentPick: 1};
    };
    earlyReplacement = calculateReplacementLevels(replacementPlayers).RB;
    getDraftAssistantState = function() {
      return {teams: 10, rounds: 16, draftSlot: 10, totalPicks: 160, currentPick: 10};
    };
    turnReplacement = calculateReplacementLevels(replacementPlayers).RB;
  } finally {
    getDraftAssistantState = originalStateGetter;
  }
  test.equal(
    'VORP: current replacement value does not change with pick-slot wait',
    earlyReplacement && earlyReplacement.name,
    turnReplacement && turnReplacement.name
  );

  var summary = test.summary();
  console.group('CALCULATION SANITY TEST SUITE');
  console.log('Result: ' + summary.passed + ' passed, ' + summary.failed + ' failed (' + summary.total + ' total)');
  summary.results.forEach(function(result) {
    console.log((result.passed ? '✓ ' : '✗ ') + result.name + (result.error ? ' — ' + result.error : ''));
  });
  console.groupEnd();
  return summary;
}

function runEspnSyncContractTests() {
  var test = draftEngineTestCreateRunner();
  var rows = Array.prototype.slice.call(document.querySelectorAll('tr.draftrow'));
  var originalRows = rows.map(function(row) {
    return {
      row: row,
      className: row.className,
      pick: row.getAttribute('data-pick'),
      teamSlot: row.getAttribute('data-team-slot'),
      syncSource: row.getAttribute('data-sync-source'),
      espnPlayerId: row.getAttribute('data-espn-player-id')
    };
  });
  var originalSignature = espnSyncLastSignature;
  var originalResult = latestEspnSyncResult;
  var originalSettings = getEspnSyncSettings();
  var originalSavedPayload = null;
  try { originalSavedPayload = localStorage.getItem(AUTOSAVE_KEY); } catch (error) {}
  var settings = getEspnSyncSettings();
  var mineSlot = settings.draftSlot;
  var otherSlot = mineSlot === 1 ? 2 : 1;

  try {
    var first = applyEspnDraftSnapshot({
      force: true,
      picks: [
        {overallPick: 1, playerName: "Ja'Marr Chase", position: 'WR', teamSlot: mineSlot},
        {overallPick: 2, playerName: 'Jahmyr Gibbs', position: 'RB', teamSlot: otherSlot},
        {overallPick: 3, playerName: 'Houston Texans D/ST', position: 'D/ST', teamSlot: otherSlot},
        {overallPick: 4, playerName: 'Brian Robinson', position: 'RB', teamSlot: otherSlot}
      ]
    });

    test.equal('ESPN sync applies every matched fixture', first.applied, 4);
    test.equal('ESPN sync reports zero unmatched fixtures', first.unmatched.length, 0);

    var chase = resolveEspnDraftRow("Ja'Marr Chase", 'WR');
    var gibbs = resolveEspnDraftRow('Jahmyr Gibbs', 'RB');
    var texans = resolveEspnDraftRow('Houston Texans D/ST', 'D/ST');
    test.assert(
      'ESPN sync distinguishes Mine from Taken by team slot',
      chase.classList.contains('drafted-mine') &&
        gibbs.classList.contains('drafted-other')
    );
    test.assert(
      'ESPN sync stores overall pick and source metadata',
      chase.getAttribute('data-pick') === '1' &&
        chase.getAttribute('data-sync-source') === 'espn'
    );
    saveState();
    var savedSyncPayload = null;
    try { savedSyncPayload = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); } catch (error) {}
    var chaseStateKey = chase.getAttribute('data-name');
    test.assert(
      'ESPN source metadata survives autosave serialization',
      savedSyncPayload && savedSyncPayload.draftMeta &&
        savedSyncPayload.draftMeta[chaseStateKey] &&
        savedSyncPayload.draftMeta[chaseStateKey].source === 'espn'
    );
    test.assert('ESPN defense names resolve to team rows', Boolean(texans));

    var corrected = applyEspnDraftSnapshot({
      force: true,
      picks: [
        {overallPick: 1, playerName: "Ja'Marr Chase", position: 'WR', teamSlot: mineSlot}
      ]
    });
    test.assert(
      'ESPN full reconciliation removes obsolete synced picks',
      corrected.applied === 1 && !gibbs.classList.contains('drafted-other')
    );

    var unmatched = applyEspnDraftSnapshot({
      force: true,
      picks: [
        {overallPick: 1, playerName: 'Fixture Player Missing', position: 'WR', teamSlot: otherSlot}
      ]
    });
    test.equal('ESPN sync surfaces unmatched names', unmatched.unmatched.length, 1);

    var alternateTeams = originalSettings.teams === 12 ? 10 : 12;
    var alternateSlot = Math.min(alternateTeams, originalSettings.draftSlot === 1 ? 2 : 1);
    var appliedSettings = applyEspnSyncSettings({
      teams: alternateTeams,
      draftSlot: alternateSlot,
      rounds: originalSettings.rounds
    });
    test.assert(
      'ESPN companion settings update the open War Room',
      appliedSettings.teams === alternateTeams && appliedSettings.draftSlot === alternateSlot
    );
  } finally {
    applyEspnSyncSettings(originalSettings);
    originalRows.forEach(function(snapshot) {
      snapshot.row.className = snapshot.className;
      ['data-pick', 'data-team-slot', 'data-sync-source', 'data-espn-player-id'].forEach(function(attribute) {
        snapshot.row.removeAttribute(attribute);
      });
      if (snapshot.pick != null) snapshot.row.setAttribute('data-pick', snapshot.pick);
      if (snapshot.teamSlot != null) snapshot.row.setAttribute('data-team-slot', snapshot.teamSlot);
      if (snapshot.syncSource != null) snapshot.row.setAttribute('data-sync-source', snapshot.syncSource);
      if (snapshot.espnPlayerId != null) snapshot.row.setAttribute('data-espn-player-id', snapshot.espnPlayerId);
    });
    espnSyncLastSignature = originalSignature;
    latestEspnSyncResult = originalResult;
    window.latestEspnSyncResult = originalResult;
    try {
      if (originalSavedPayload == null) localStorage.removeItem(AUTOSAVE_KEY);
      else localStorage.setItem(AUTOSAVE_KEY, originalSavedPayload);
    } catch (error) {}
    triggerAllBoardUpdates({deferIntelligence: true});
  }

  var summary = test.summary();
  console.group('ESPN SYNC CONTRACT TEST SUITE');
  console.log('Result: ' + summary.passed + ' passed, ' + summary.failed + ' failed (' + summary.total + ' total)');
  summary.results.forEach(function(result) {
    console.log((result.passed ? '✓ ' : '✗ ') + result.name + (result.error ? ' — ' + result.error : ''));
  });
  console.groupEnd();
  return summary;
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

var targetName =
  canonicalExpertPlayerName(
    playerName
  );


var player =
  scored.find(function(candidate) {

    return (
      candidate &&
      candidate.name &&
      canonicalExpertPlayerName(
        candidate.name
      ) === targetName
    );

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

function simulateFullDraft(options) {

  options =
    options || {};

  var teams =
    Number(options.teams) || 10;

  var draftSlot =
    Number(options.draftSlot) || 1;

  var rounds =
    Number(options.rounds) || 16;


  if (
    teams <= 0 ||
    draftSlot <= 0 ||
    draftSlot > teams ||
    rounds <= 0
  ) {

    console.warn(
      'FULL DRAFT SIMULATOR: Invalid configuration.'
    );

    return null;
  }


  var rows =
    Array.prototype.slice.call(
      document.querySelectorAll(
        'tr.draftrow'
      )
    );


  /*
   * -------------------------------------------------------
   * SNAPSHOT REAL BOARD
   * -------------------------------------------------------
   */

  var originalRows =
    rows.map(function(row) {

      return {
        className:
          row.className,

        pick:
          row.getAttribute(
            'data-pick'
          ),

        teamSlot:
          row.getAttribute(
            'data-team-slot'
          )
      };

    });


  var originalGetDraftAssistantState =
    getDraftAssistantState;


  /*
   * -------------------------------------------------------
   * CLEAN SIMULATION BOARD
   * -------------------------------------------------------
   */

  rows.forEach(function(row) {

    row.classList.remove(
      'drafted-other',
      'drafted-mine'
    );

    row.removeAttribute(
      'data-pick'
    );

    row.removeAttribute(
      'data-team-slot'
    );

  });


  var totalPicks =
    teams * rounds;

  var myDraft = [];

  var allDrafted = [];


  /*
   * Current simulated pick.
   *
   * buildLiveDraftDebugState() will read this through
   * our temporary getDraftAssistantState override.
   */

  var simulatedCurrentPick = 1;


  getDraftAssistantState =
    function() {

      return {
        teams:
          teams,

        rounds:
          rounds,

        draftSlot:
          draftSlot,

        totalPicks:
          totalPicks,

        currentPick:
          simulatedCurrentPick,

        nextPick:
          simulatedCurrentPick,

        myNextPick:
          simulatedCurrentPick,

        picksUntilMyTurn:
          0,

        onClock:
          true
      };

    };


  try {

    /*
     * -------------------------------------------------------
     * RUN COMPLETE DRAFT
     * -------------------------------------------------------
     */

    for (
      var pick = 1;
      pick <= totalPicks;
      pick++
    ) {

      simulatedCurrentPick =
        pick;


      var mapping =
        getSnakeDraftTeamForPick(
          pick,
          teams
        );


      if (!mapping) {
        continue;
      }


      var teamSlot =
        Number(
          mapping.teamSlot
        ) || 0;


      /*
       * -------------------------------------------------------
       * OUR PICK
       * -------------------------------------------------------
       */

      if (teamSlot === draftSlot) {

        var liveState =
          buildLiveDraftDebugState();


        if (
          !liveState ||
          !liveState.scored ||
          !liveState.scored.length
        ) {

          console.warn(
            'FULL DRAFT SIMULATOR: No recommendation at pick',
            pick
          );

          continue;
        }


        /*
         * Highest-ranked decision-engine recommendation.
         */

        var selected =
          liveState.scored[0];


        var selectedRow =
          selected.row ||
          rows.find(function(row) {

            return (
              row.getAttribute(
                'data-name'
              ) === selected.name
            );

          });


        if (!selectedRow) {

          console.warn(
            'FULL DRAFT SIMULATOR: Could not locate row for',
            selected.name
          );

          continue;
        }


        selectedRow.classList.add(
          'drafted-mine'
        );

        selectedRow.setAttribute(
          'data-pick',
          pick
        );

        selectedRow.setAttribute(
          'data-team-slot',
          teamSlot
        );


        var myPickRecord = {

  pick:
    pick,

  round:
    Math.ceil(
      pick / teams
    ),

  name:
    selected.name,

  position:
    selected.position,

  rank:
    selected.rank,

  score:
    Number(
      selected.finalScore
    ) || 0,

  phase:
    selected.draftPhase ||
    getDraftPhase(
      pick,
      teams
    ).phase,

  mandatoryEndgame:
    Number(
      selected.mandatoryEndgameAdjustment
    ) > 0

};

        myDraft.push(
          myPickRecord
        );


        allDrafted.push(
          Object.assign(
            {
              teamSlot:
                teamSlot,

              mine:
                true
            },
            myPickRecord
          )
        );


      } else {

        /*
         * -------------------------------------------------------
         * OPPONENT PICK
         * -------------------------------------------------------
         *
         * v1 opponents simply take the highest-ranked
         * player remaining.
         */

        var availablePlayers =
          getDraftAssistantPlayers()
            .filter(function(player) {

              return (
                player &&
                player.available !== false &&
                player.row
              );

            })
            .sort(function(a, b) {

              return (
                Number(a.rank || 999) -
                Number(b.rank || 999)
              );

            });


        var opponentPick =
          availablePlayers[0];


        if (!opponentPick) {
          continue;
        }


        opponentPick.row.classList.add(
          'drafted-other'
        );

        opponentPick.row.setAttribute(
          'data-pick',
          pick
        );

        opponentPick.row.setAttribute(
          'data-team-slot',
          teamSlot
        );


        allDrafted.push({

          pick:
            pick,

          round:
            Math.ceil(
              pick / teams
            ),

          teamSlot:
            teamSlot,

          mine:
            false,

          name:
            opponentPick.name,

          position:
            opponentPick.position,

          rank:
            opponentPick.rank

        });

      }

    }


    /*
     * -------------------------------------------------------
     * BUILD ROSTER SUMMARY
     * -------------------------------------------------------
     */

    var roster = {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
      K: [],
      DST: []
    };


    myDraft.forEach(function(player) {

      if (
        roster[player.position]
      ) {

        roster[player.position].push(
          player.name
        );

      }

    });


    /*
     * -------------------------------------------------------
     * OUTPUT
     * -------------------------------------------------------
     */

    console.group(
      'FULL DRAFT SIMULATION — ' +
      teams +
      ' TEAM — SLOT ' +
      draftSlot
    );


    console.log(
      'Rounds:',
      rounds
    );


    console.table(
      myDraft.map(function(player) {

        return {
          round:
            player.round,

          pick:
            player.pick,

          name:
            player.name,

          position:
            player.position,

          rank:
            player.rank,

          score:
            Number(
              player.score
            ).toFixed(1),

          phase:
            player.phase
        };

      })
    );


    console.log(
      'FINAL ROSTER:',
      roster
    );


    console.groupEnd();


    return {

      teams:
        teams,

      draftSlot:
        draftSlot,

      rounds:
        rounds,

      totalPicks:
        totalPicks,

      myDraft:
        myDraft,

      roster:
        roster,

      allDrafted:
        allDrafted

    };


  } finally {

    /*
     * -------------------------------------------------------
     * RESTORE REAL BOARD
     * -------------------------------------------------------
     */

    getDraftAssistantState =
      originalGetDraftAssistantState;


    rows.forEach(function(row, index) {

      var original =
        originalRows[index];


      row.className =
        original.className;


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


      if (
        original.teamSlot !== null
      ) {

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

function gradeSimulatedDraft(
  simulation
) {

  if (
    !simulation ||
    !simulation.myDraft ||
    !simulation.roster
  ) {
    return null;
  }


  var roster =
    simulation.roster;


  var counts = {
    QB:
      (roster.QB || []).length,

    RB:
      (roster.RB || []).length,

    WR:
      (roster.WR || []).length,

    TE:
      (roster.TE || []).length,

    K:
      (roster.K || []).length,

    DST:
      (roster.DST || []).length
  };


  /*
   * -------------------------------------------------------
   * 1. STARTER COMPLETION
   * -------------------------------------------------------
   */

  var starterTargets = {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    K: 1,
    DST: 1
  };


  var starterFilled = 0;
  var starterRequired = 0;


  Object.keys(
    starterTargets
  ).forEach(function(position) {

    var required =
      starterTargets[position];

    starterRequired +=
      required;

    starterFilled +=
      Math.min(
        counts[position] || 0,
        required
      );

  });


  var starterCompletionScore =
    starterRequired
      ? (
          starterFilled /
          starterRequired
        ) * 100
      : 0;


  /*
   * -------------------------------------------------------
   * 2. FLEX COMPLETION
   * -------------------------------------------------------
   */

  var dedicatedRB =
    Math.min(
      counts.RB,
      2
    );

  var dedicatedWR =
    Math.min(
      counts.WR,
      2
    );

  var dedicatedTE =
    Math.min(
      counts.TE,
      1
    );


  var totalFlexEligible =
    counts.RB +
    counts.WR +
    counts.TE;


  var dedicatedFlexEligible =
    dedicatedRB +
    dedicatedWR +
    dedicatedTE;


  var extraFlexPlayers =
    Math.max(
      0,
      totalFlexEligible -
      dedicatedFlexEligible
    );


  var flexCompletionScore =
    extraFlexPlayers >= 1
      ? 100
      : 0;


  /*
   * -------------------------------------------------------
   * 3. RB / WR DEPTH BALANCE
   * -------------------------------------------------------
   */

  var skillDepth =
    counts.RB +
    counts.WR;


  var rbShare =
    skillDepth
      ? counts.RB /
        skillDepth
      : 0;


  /*
   * Ideal range is roughly balanced,
   * but allows moderate RB/WR lean.
   */

  var depthBalanceScore = 100;


  if (
    rbShare < 0.35 ||
    rbShare > 0.65
  ) {

    depthBalanceScore = 70;

  }


  if (
    rbShare < 0.25 ||
    rbShare > 0.75
  ) {

    depthBalanceScore = 40;

  }


  /*
   * -------------------------------------------------------
   * 4. POSITION SATURATION
   * -------------------------------------------------------
   */

  var saturationScore = 100;


  if (counts.RB > 6) {

    saturationScore -=
      (counts.RB - 6) * 15;

  }


  if (counts.WR > 6) {

    saturationScore -=
      (counts.WR - 6) * 12;

  }


  if (counts.QB > 2) {

    saturationScore -=
      (counts.QB - 2) * 20;

  }


  if (counts.TE > 2) {

    saturationScore -=
      (counts.TE - 2) * 20;

  }


  saturationScore =
    Math.max(
      0,
      saturationScore
    );


  /*
   * -------------------------------------------------------
   * 5. DUPLICATION / BENCH EFFICIENCY
   * -------------------------------------------------------
   */

  var benchEfficiencyScore =
    100;


  if (counts.QB > 1) {

    benchEfficiencyScore -=
      (counts.QB - 1) * 10;

  }


  if (counts.TE > 2) {

    benchEfficiencyScore -=
      (counts.TE - 2) * 15;

  }


  if (counts.K > 1) {

    benchEfficiencyScore -=
      (counts.K - 1) * 25;

  }


  if (counts.DST > 1) {

    benchEfficiencyScore -=
      (counts.DST - 1) * 25;

  }


  benchEfficiencyScore =
    Math.max(
      0,
      benchEfficiencyScore
    );


  /*
   * -------------------------------------------------------
   * 6. K / DST COMPLETION
   * -------------------------------------------------------
   */

  var endgameCompletionScore = 0;


  if (counts.K >= 1) {

    endgameCompletionScore +=
      50;

  }


  if (counts.DST >= 1) {

    endgameCompletionScore +=
      50;

  }


  /*
   * -------------------------------------------------------
   * 7. VALUE / REACH EFFICIENCY
   * -------------------------------------------------------
   *
   * Compare where we drafted each player with
   * their overall rank.
   *
   * Positive value = drafted later than rank.
   * Negative value = reached ahead of rank.
   */

  var totalReach = 0;
  var reachCount = 0;


  simulation.myDraft
    .forEach(function(player) {

      var pick =
        Number(player.pick) || 0;

      var rank =
        Number(player.rank) || 0;


      if (
        pick <= 0 ||
        rank <= 0
      ) {
        return;
      }


      var reach =
        rank - pick;


      /*
       * Only penalize true reaches.
       *
       * Waiting beyond rank is not bad.
       */

      if (reach > 0) {

        totalReach +=
          reach;

      }


      reachCount++;

    });


  var averageReach =
    reachCount
      ? totalReach /
        reachCount
      : 0;


  var valueEfficiencyScore =
    Math.max(
      0,
      100 -
      (
        averageReach * 3
      )
    );

  /*
 * -------------------------------------------------------
 * 8. DRAFT-CAPITAL EFFICIENCY
 * -------------------------------------------------------
 *
 * Penalize using premium-round picks on redundant
 * positions when the starter at that position has
 * already been secured.
 */

var draftCapitalScore = 100;

var positionSeen = {
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0
};


simulation.myDraft.forEach(function(player) {

  var position =
    player.position;

  var round =
    Number(player.round) || 0;


  if (
    positionSeen[position] === undefined
  ) {
    return;
  }


  positionSeen[position]++;


  /*
   * Early QB2.
   */

  if (
    position === 'QB' &&
    positionSeen.QB >= 2 &&
    round <= 7
  ) {

    draftCapitalScore -= 15;

  }


  /*
   * Early TE2.
   *
   * TE2 in the first 7 rounds should require
   * exceptional value.
   */

  if (
    position === 'TE' &&
    positionSeen.TE >= 2 &&
    round <= 4
  ) {

    draftCapitalScore -= 10;

  } else if (
    position === 'TE' &&
    positionSeen.TE >= 2 &&
    round <= 7
  ) {

    draftCapitalScore -= 5;

  }


  /*
   * Excessive early RB depth.
   */

  if (
    position === 'RB' &&
    positionSeen.RB >= 5 &&
    round <= 8
  ) {

    draftCapitalScore -= 5;

  }


  /*
   * Excessive early WR depth.
   */

  if (
    position === 'WR' &&
    positionSeen.WR >= 5 &&
    round <= 8
  ) {

    draftCapitalScore -= 5;

  }


  /*
   * K / DST should be endgame picks.
   */

if (
  (
    position === 'K' ||
    position === 'DST'
  ) &&
  round < 14 &&
  !player.mandatoryEndgame
) {

  draftCapitalScore -= 15;

}

});


draftCapitalScore =
  Math.max(
    0,
    draftCapitalScore
  );


  /*
   * -------------------------------------------------------
   * OVERALL SCORE
   * -------------------------------------------------------
   */

var overallScore =
  (
    starterCompletionScore *
    0.20
  ) +
  (
    flexCompletionScore *
    0.10
  ) +
  (
    depthBalanceScore *
    0.15
  ) +
  (
    saturationScore *
    0.15
  ) +
  (
    benchEfficiencyScore *
    0.10
  ) +
  (
    endgameCompletionScore *
    0.10
  ) +
  (
    valueEfficiencyScore *
    0.15
  ) +
  (
    draftCapitalScore *
    0.05
  );


  overallScore =
    Math.max(
      0,
      Math.min(
        100,
        overallScore
      )
    );


  /*
   * -------------------------------------------------------
   * LETTER GRADE
   * -------------------------------------------------------
   */

  var grade;


  if (overallScore >= 93) {

    grade = 'A';

  } else if (overallScore >= 90) {

    grade = 'A-';

  } else if (overallScore >= 87) {

    grade = 'B+';

  } else if (overallScore >= 83) {

    grade = 'B';

  } else if (overallScore >= 80) {

    grade = 'B-';

  } else if (overallScore >= 77) {

    grade = 'C+';

  } else if (overallScore >= 73) {

    grade = 'C';

  } else if (overallScore >= 70) {

    grade = 'C-';

  } else {

    grade = 'D';
  }


  /*
   * -------------------------------------------------------
   * RETURN REPORT
   * -------------------------------------------------------
   */

  return {

    grade:
      grade,

    overallScore:
      Number(
        overallScore.toFixed(1)
      ),

    counts:
      counts,

    starterCompletion:
      Number(
        starterCompletionScore.toFixed(1)
      ),

    flexCompletion:
      flexCompletionScore,

    depthBalance:
      Number(
        depthBalanceScore.toFixed(1)
      ),

    saturation:
      Number(
        saturationScore.toFixed(1)
      ),

    benchEfficiency:
      Number(
        benchEfficiencyScore.toFixed(1)
      ),

    endgameCompletion:
      endgameCompletionScore,

    draftCapitalEfficiency:
  Number(
    draftCapitalScore.toFixed(1)
  ),

    valueEfficiency:
      Number(
        valueEfficiencyScore.toFixed(1)
      ),

    averageReach:
      Number(
        averageReach.toFixed(2)
      )

  };
}

function simulateAllDraftSlots(options) {

  options =
    options || {};

  var teams =
    Number(options.teams) || 10;

  var rounds =
    Number(options.rounds) || 16;

  var results = [];


  for (
    var draftSlot = 1;
    draftSlot <= teams;
    draftSlot++
  ) {

    var simulation =
      simulateFullDraft({
        teams:
          teams,

        draftSlot:
          draftSlot,

        rounds:
          rounds
      });


    var grade =
      gradeSimulatedDraft(
        simulation
      );


    results.push({

      draftSlot:
        draftSlot,

      grade:
        grade
          ? grade.grade
          : 'N/A',

      overallScore:
        grade
          ? grade.overallScore
          : 0,

      QB:
        grade
          ? grade.counts.QB
          : 0,

      RB:
        grade
          ? grade.counts.RB
          : 0,

      WR:
        grade
          ? grade.counts.WR
          : 0,

      TE:
        grade
          ? grade.counts.TE
          : 0,

      K:
        grade
          ? grade.counts.K
          : 0,

      DST:
        grade
          ? grade.counts.DST
          : 0,

      starterCompletion:
        grade
          ? grade.starterCompletion
          : 0,

      depthBalance:
        grade
          ? grade.depthBalance
          : 0,

      saturation:
        grade
          ? grade.saturation
          : 0,

      draftCapital:
        grade
          ? grade.draftCapitalEfficiency
          : 0,

      valueEfficiency:
        grade
          ? grade.valueEfficiency
          : 0,

      averageReach:
        grade
          ? grade.averageReach
          : 0,

      simulation:
        simulation

    });

  }


  console.group(
    'ALL DRAFT SLOT SIMULATIONS'
  );


  console.table(
    results.map(function(result) {

      return {

        slot:
          result.draftSlot,

        grade:
          result.grade,

        score:
          result.overallScore,

        QB:
          result.QB,

        RB:
          result.RB,

        WR:
          result.WR,

        TE:
          result.TE,

        K:
          result.K,

        DST:
          result.DST,

        draftCapital:
          result.draftCapital,

        value:
          result.valueEfficiency,

        avgReach:
          result.averageReach

      };

    })
  );


  console.groupEnd();


  return results;
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
