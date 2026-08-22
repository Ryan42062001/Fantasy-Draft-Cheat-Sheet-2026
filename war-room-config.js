/**
 * Shared War Room configuration.
 *
 * Keep league and semantic-tier defaults here so the board, roster summary,
 * recommendation engine, persistence, and tests consume the same values.
 */
var WAR_ROOM_CONFIG = {
  league: {
    teams: 10,
    draftSlot: 10,
    rounds: 16,
    scoring: 'PPR',
    draftType: 'SNAKE'
  },
  rosterSlots: {QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1},
  benchSlots: {QB: 0, RB: 2, WR: 5, TE: 0, K: 0, DST: 0},
  recommendationPositionCaps: {QB: 1, TE: 1},
  strategyAdjustmentBudget: {min: -15, max: 15},
  tierIds: ['Sp', 'S', 'A', 'B', 'C', 'D', 'E', 'F'],
  tierLabels: {
    Sp: 'ELITE',
    S: 'PREMIUM',
    A: 'CORE',
    B: 'VALUE',
    C: 'UPSIDE',
    D: 'DEPTH',
    E: 'LATE',
    F: 'DEEP'
  },
  tierFantasyProsRanges: {
    Sp: 'FantasyPros tiers 1–2',
    S: 'FantasyPros tiers 3–4',
    A: 'FantasyPros tiers 5–6',
    B: 'FantasyPros tiers 7–8',
    C: 'FantasyPros tiers 9–10',
    D: 'FantasyPros tiers 11–12',
    E: 'FantasyPros tiers 13–14',
    F: 'ADP depth and FantasyPros tiers 15–16'
  }
};

var LEAGUE_SIZE = WAR_ROOM_CONFIG.league.teams;
var MY_DRAFT_SLOT = WAR_ROOM_CONFIG.league.draftSlot;
var TOTAL_ROUNDS = WAR_ROOM_CONFIG.league.rounds;
var ROSTER_SLOTS = WAR_ROOM_CONFIG.rosterSlots;
var BENCH_SLOTS = WAR_ROOM_CONFIG.benchSlots;
var RECOMMENDATION_POSITION_CAPS = WAR_ROOM_CONFIG.recommendationPositionCaps;
var TIER_IDS = WAR_ROOM_CONFIG.tierIds;
var TIER_LABELS = WAR_ROOM_CONFIG.tierLabels;

function getConfiguredStarterSlots(position) {
  return Math.max(0, Number(ROSTER_SLOTS[position]) || 0);
}

function getConfiguredStarterTotal() {
  return Object.keys(ROSTER_SLOTS).reduce(function(total, position) {
    return total + getConfiguredStarterSlots(position);
  }, 0);
}

function getConfiguredFlexEligibleThreshold() {
  return getConfiguredStarterSlots('RB') +
    getConfiguredStarterSlots('WR') +
    getConfiguredStarterSlots('TE') +
    getConfiguredStarterSlots('FLEX');
}

function getConfiguredStarterLimits() {
  return {QB:getConfiguredStarterSlots('QB'), RB:getConfiguredStarterSlots('RB'), WR:getConfiguredStarterSlots('WR'), TE:getConfiguredStarterSlots('TE'), FLEX:getConfiguredStarterSlots('FLEX'), K:getConfiguredStarterSlots('K'), DST:getConfiguredStarterSlots('DST')};
}

function getConfiguredDedicatedStarterLimits() {
  var limits = getConfiguredStarterLimits();
  delete limits.FLEX;
  return limits;
}
