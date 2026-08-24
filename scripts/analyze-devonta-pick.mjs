import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const {chromium} = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..');
const server = http.createServer((request, response) => {
  const relative = request.url === '/' ? 'index.html' : request.url.split('?')[0].replace(/^\//, '');
  fs.readFile(path.join(root, relative), (error, data) => {
    response.statusCode = error ? 404 : 200;
    response.end(error ? 'not found' : data);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
const page = await browser.newPage({viewport:{width:1280,height:900}});
await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'load'});
await page.waitForSelector('tr.draftrow');

const result = await page.evaluate(() => {
  const picks = [
    'Jaxon Smith-Njigba', 'Bijan Robinson', 'Jahmyr Gibbs', "Ja'Marr Chase",
    'Puka Nacua', 'Christian McCaffrey', 'Jonathan Taylor', 'Amon-Ra St. Brown',
    'CeeDee Lamb', 'James Cook III', 'Justin Jefferson', 'Derrick Henry',
    'Trey McBride', 'Drake London', 'Rashee Rice', 'Saquon Barkley',
    "De'Von Achane", 'Chase Brown', 'Ashton Jeanty', 'Omarion Hampton',
    'Brock Bowers', 'Jeremiyah Love', 'Breece Hall', 'Kenneth Walker III',
    'Javonte Williams', 'A.J. Brown', 'Josh Jacobs', 'Chris Olave',
    'Malik Nabers', 'Emeka Egbuka', 'Nico Collins', 'Davante Adams',
    'George Pickens', 'Garrett Wilson', 'Josh Allen', 'Cam Skattebo',
    'Rome Odunze'
  ];
  const mine = new Set(['Justin Jefferson', 'Drake London', 'Josh Allen']);
  document.getElementById('pcTeams').value = '12';
  document.getElementById('pcSlot').value = '11';
  document.getElementById('pcRounds').value = '16';
  picks.forEach((name, index) => {
    const row = findDraftRowByExpertName(name);
    if (!row) throw new Error(`Missing fixture player: ${name}`);
    row.classList.add(mine.has(name) ? 'drafted-mine' : 'drafted-other');
    row.setAttribute('data-pick', String(index + 1));
  });
  const state = buildLiveDraftDebugState();
  const names = ['DeVonta Smith', 'Kyren Williams', 'Travis Etienne Jr.', 'Bucky Irving', 'TreVeyon Henderson', 'Tyler Warren'];
  const compact = player => player && ({
    name:player.name, position:player.position, ecr:player.ecr, adp:player.adp,
    espnRank:player.row ? Number(player.row.getAttribute('data-espn-rank')) || null : null,
    final:Number(player.finalScore.toFixed(2)), base:Number(player.baseScore.toFixed(2)),
    strategy:Number(player.cappedStrategyAdjustment.toFixed(2)), guardrail:Number(player.guardrailAdjustment.toFixed(2)),
    tier:Number(player.tierScore.toFixed(2)), rank:Number(player.rankScore.toFixed(2)),
    vorp:Number(player.vorpScore.toFixed(2)), scarcity:Number(player.scarcityScore.toFixed(2)),
    need:Number(player.rosterNeedScore.toFixed(2)), timing:Number(player.timingScore.toFixed(2)),
    construction:Number(player.rosterConstructionScore.toFixed(2)),
    phaseConstruction:Number(player.phaseAdjustedRosterConstructionScore.toFixed(2)),
    tierCliff:Number(player.phaseAdjustedTierCliffScore.toFixed(2)),
    draftAwareVorp:Number(player.phaseAdjustedDraftAwareVorpScore.toFixed(2)),
    dynamic:Number(player.dynamicStrategyAdjustment.toFixed(2)),
    recommendationPriority:Number((player.recommendationPriorityScore ?? player.finalScore).toFixed(2))
    ,survival:Number((player.recommendationSurvival ?? 0).toFixed(2))
  });
  const candidates = names.map(name => compact(state.scored.find(player => player.name === name))).filter(Boolean);
  const pick38 = {
    currentPick:state.context.currentPick,
    nextPick:state.context.nextPick,
    rosterCounts:state.context.rosterCounts,
    rosterNeeds:state.context.rosterNeeds,
    recommendation:compact(state.scored[0]),
    topTen:state.scored.slice(0, 10).map(compact),
    candidates
  };

  document.querySelectorAll('tr.draftrow').forEach(row => {
    row.classList.remove('drafted-mine', 'drafted-other');
    row.removeAttribute('data-pick');
  });
  const rosterAtPick86 = [
    ['Justin Jefferson', 11], ['Drake London', 14], ['Josh Allen', 35],
    ['DeVonta Smith', 38], ['TreVeyon Henderson', 59], ['Jameson Williams', 62],
    ['Tucker Kraft', 83]
  ];
  const mineAt86 = new Set(rosterAtPick86.map(([name]) => name));
  getDraftAssistantPlayers()
    .filter(player => player.ecr != null && player.ecr <= 85 && !mineAt86.has(player.name) && player.name !== 'Chris Godwin Jr.')
    .forEach((player, index) => {
      player.row.classList.add('drafted-other');
      player.row.setAttribute('data-pick', String(index + 1));
    });
  rosterAtPick86.forEach(([name, pick]) => {
    const row = findDraftRowByExpertName(name);
    row.classList.remove('drafted-other');
    row.classList.add('drafted-mine');
    row.setAttribute('data-pick', String(pick));
  });
  let syntheticPick = getCompletedDraftPickCount();
  getDraftAssistantPlayers()
    .filter(player => player.available && player.name !== 'Chris Godwin Jr.')
    .slice(0, Math.max(0, 85 - syntheticPick))
    .forEach(player => {
      player.row.classList.add('drafted-other');
      player.row.setAttribute('data-pick', String(++syntheticPick));
    });
  const godwinState = buildLiveDraftDebugState();
  const godwin = godwinState.scored.find(player => player.name === 'Chris Godwin Jr.');
  const godwinRank = godwinState.scored.findIndex(player => player.name === 'Chris Godwin Jr.') + 1;
  const pick86 = {
    currentPick:godwinState.context.currentPick,
    rosterCounts:godwinState.context.rosterCounts,
    recommendation:compact(godwinState.scored[0]),
    godwinRank,
    godwin:compact(godwin),
    godwinMarket:getMarketTimingDetails(godwin, godwinState.context),
    godwinThreat:calculateOpponentDraftThreat(godwin, godwinState.context),
    godwinMarketCell:findDraftRowByExpertName('Chris Godwin Jr.').children[4].textContent.trim(),
    godwinValueCell:findDraftRowByExpertName('Chris Godwin Jr.').children[5].textContent.trim(),
    marketHeader:document.querySelector('#big-table thead th:nth-child(5)').textContent.trim(),
    topTen:godwinState.scored.slice(0, 10).map(compact)
  };
  return {pick38, pick86};
});

assert.equal(result.pick38.recommendation.name, 'Kyren Williams', JSON.stringify(result.pick38.topTen));
assert.notEqual(result.pick86.recommendation.name, 'Chris Godwin Jr.', JSON.stringify(result.pick86.topTen));
assert.equal(result.pick86.godwinMarket.source, 'ESPN board');
assert.equal(result.pick86.godwinMarket.marketRank, 127);
assert.equal(result.pick86.godwinMarketCell, '#127');
assert.equal(result.pick86.godwinValueCell, '+54.0');
assert.equal(result.pick86.marketHeader, 'ESPN Mkt');
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
await browser.close();
server.close();
