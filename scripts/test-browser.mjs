import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..');
const server = process.env.WAR_ROOM_URL ? null : http.createServer((request, response) => {
  const relative = request.url === '/' ? 'index.html' : request.url.split('?')[0].replace(/^\//, '');
  fs.readFile(path.join(root, relative), (error, data) => { response.statusCode = error ? 404 : 200; response.end(error ? 'not found' : data); });
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const appUrl = process.env.WAR_ROOM_URL || `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
const page = await browser.newPage({viewport:{width:1280,height:900}});
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', error => errors.push(error.message));
await page.goto(appUrl, {waitUntil:'load'});
await page.waitForSelector('tr.draftrow');
await page.waitForSelector('.recommendation-card');

const startup = await page.evaluate(() => ({
  dataset: FANTASYPROS_2026_DATASET.length,
  rows: document.querySelectorAll('tr.draftrow').length,
  controls: document.querySelectorAll('.rank-controls').length,
  duplicates: FANTASYPROS_2026_DATASET.length - new Set(FANTASYPROS_2026_DATASET.map(p => canonicalExpertPlayerName(p.name))).size
}));
assert.deepEqual(startup, {dataset:717, rows:717, controls:0, duplicates:0});
const recommendationCard = page.locator('.recommendation-card');
assert.equal(await recommendationCard.getAttribute('open'), null);
assert.equal(await page.locator('.recommendation-card-summary .recommendation-player b').count(), 1);
assert.equal(await page.locator('.recommendation-one-line').count(), 1);
await page.locator('.recommendation-card-summary').click();
assert.equal(await recommendationCard.getAttribute('open'), '');
assert.equal(await page.locator('.recommendation-factor').count(), 4);
assert.equal(await page.getByRole('progressbar').count(), 4);
const recommendationRender = await page.evaluate(() => {
  const element = document.getElementById('recommended-pick-text');
  const card = element.querySelector('.recommendation-card');
  const shared = buildLiveDraftDebugState();
  const started = performance.now();
  for (let index = 0; index < 10; index++) updateRecommendedPick(shared);
  return {
    sameCard: card === element.querySelector('.recommendation-card'),
    stayedOpen: element.querySelector('.recommendation-card').open,
    totalMs: performance.now() - started
  };
});
assert.equal(recommendationRender.sameCard, true);
assert.equal(recommendationRender.stayedOpen, true);

const first = page.locator('tr.draftrow').first();
const t0 = performance.now();
await first.click();
const markingMs = performance.now() - t0;
assert.equal(await first.evaluate(row => row.classList.contains('drafted-other')), true);
await first.click();
assert.equal(await first.evaluate(row => row.classList.contains('drafted-other')), false);
await page.getByRole('button', {name:'Mine', exact:true}).click();
await first.press('Enter');
assert.equal(await first.evaluate(row => row.classList.contains('drafted-mine')), true);
assert.equal(await page.getByRole('button', {name:'Taken', exact:true}).getAttribute('aria-pressed'), 'true');
await page.locator('body').press('m');
assert.equal(await page.getByRole('button', {name:'Mine', exact:true}).getAttribute('aria-pressed'), 'true');
await page.locator('body').press('M');
assert.equal(await page.getByRole('button', {name:'Taken', exact:true}).getAttribute('aria-pressed'), 'true');
await page.getByPlaceholder('Search player or team...').fill('m');
assert.equal(await page.getByRole('button', {name:'Taken', exact:true}).getAttribute('aria-pressed'), 'true');
await page.getByPlaceholder('Search player or team...').fill('');

const sessionBefore = await page.locator('#draftSessionSelect option').count();
await page.getByRole('button', {name:'New Draft'}).click();
assert.equal(await page.locator('#draftSessionSelect option').count(), sessionBefore + 1);
assert.equal(await page.locator('tr.drafted-mine,tr.drafted-other').count(), 0);
const draftToDelete = await page.locator('#draftSessionSelect').inputValue();
await page.getByRole('button', {name:'Delete selected draft'}).click();
assert.equal(await page.getByRole('button', {name:/Confirm deletion of/}).innerText(), 'Confirm Delete');
await page.getByRole('button', {name:/Confirm deletion of/}).click();
assert.equal(await page.locator('#draftSessionSelect option').count(), sessionBefore);
assert.notEqual(await page.locator('#draftSessionSelect').inputValue(), draftToDelete);
assert.equal(await page.evaluate(id => localStorage.getItem('draft-state-v1:' + id), draftToDelete), null);
if (sessionBefore === 1) {
  const lastDraftId = await page.locator('#draftSessionSelect').inputValue();
  await page.getByRole('button', {name:'Delete selected draft'}).click();
  await page.getByRole('button', {name:/Confirm deletion of/}).click();
  assert.equal(await page.locator('#draftSessionSelect option').count(), 1);
  assert.equal(await page.locator('#draftSessionSelect option').innerText(), 'Draft 1');
  assert.notEqual(await page.locator('#draftSessionSelect').inputValue(), lastDraftId);
  assert.equal(await page.locator('tr.drafted-mine,tr.drafted-other').count(), 0);
}

const strategyPolish = await page.evaluate(() => {
  const originalSettings = {teams:LEAGUE_SIZE, slot:MY_DRAFT_SLOT, rounds:TOTAL_ROUNDS};
  document.getElementById('pcTeams').value = '12';
  document.getElementById('pcSlot').value = '11';
  document.getElementById('pcRounds').value = '16';
  LEAGUE_SIZE = 12;
  MY_DRAFT_SLOT = 11;
  TOTAL_ROUNDS = 16;
  const byeAdjustment = calculateByeWeekCongestionAdjustment(
    {position:'WR', bye:'10'},
    {currentPick:110, teams:12, rosterByeCounts:{'10':4}}
  );
  const rows = Array.from(document.querySelectorAll('tr.draftrow')).slice(0, 16);
  rows.forEach((row, index) => {
    row.classList.add('drafted-mine');
    if (index < 11) row.setAttribute('data-pick', String(index + 1));
  });
  latestEspnSyncMeta = {draftComplete:true, expectedCompleted:192, numberedPicks:11};
  window.latestEspnSyncMeta = latestEspnSyncMeta;
  const state = getDraftAssistantState();
  const completion = getDraftCompletionStatus(state);
  updatePickCounter();
  const counter = document.getElementById('pick-counter-text').textContent;
  const report = buildFinalDraftSummaryHtml([
    {name:'WR One',position:'WR',pick:11,ecr:6,adp:8,bye:'10',ecrValue:5,marketValue:3},
    {name:'WR Two',position:'WR',pick:14,ecr:10,adp:17,bye:'11',ecrValue:4,marketValue:-3},
    {name:'WR Three',position:'WR',pick:35,ecr:24,adp:35,bye:'10',ecrValue:11,marketValue:0},
    {name:'QB One',position:'QB',pick:38,ecr:28,adp:53,bye:'11',ecrValue:10,marketValue:15},
    {name:'RB One',position:'RB',pick:59,ecr:54,adp:55,bye:'10',ecrValue:5,marketValue:-4},
    {name:'RB Two',position:'RB',pick:62,ecr:60,adp:50,bye:'11',ecrValue:2,marketValue:-12},
    {name:'TE One',position:'TE',pick:83,ecr:72,adp:73,bye:'10',ecrValue:11,marketValue:-10},
    {name:'RB Three',position:'RB',pick:86,ecr:70,adp:73,bye:'11',ecrValue:16,marketValue:-13},
    {name:'WR Four',position:'WR',pick:110,ecr:73,adp:100,bye:'10',ecrValue:37,marketValue:-10}
  ], {QB:1,RB:3,WR:4,TE:1,K:0,DST:0}, 7, 11.2, 'A+');
  rows.forEach(row => {
    row.classList.remove('drafted-mine');
    row.removeAttribute('data-pick');
  });
  latestEspnSyncMeta = {draftComplete:false, expectedCompleted:0, numberedPicks:0};
  window.latestEspnSyncMeta = latestEspnSyncMeta;
  document.getElementById('pcTeams').value = String(originalSettings.teams);
  document.getElementById('pcSlot').value = String(originalSettings.slot);
  document.getElementById('pcRounds').value = String(originalSettings.rounds);
  LEAGUE_SIZE = originalSettings.teams;
  MY_DRAFT_SLOT = originalSettings.slot;
  TOTAL_ROUNDS = originalSettings.rounds;
  return {byeAdjustment, completion, counter, report};
});
assert.equal(strategyPolish.byeAdjustment, -6);
assert.equal(strategyPolish.completion.provisional, true);
assert.match(strategyPolish.counter, /Draft appears complete/);
assert.match(strategyPolish.counter, /11 of 192 numbered picks synced/);
assert.match(strategyPolish.report, /PROVISIONAL FINAL REPORT/);
assert.match(strategyPolish.report, /WR foundation/);
assert.match(strategyPolish.report, /Bye-week concentration/);
assert.match(strategyPolish.report, /first RB to <b>Round 5/);

const completedCounter = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('tr.draftrow')).slice(0, 160);
  rows.forEach((row, index) => {
    row.classList.add(index % 16 === 9 ? 'drafted-mine' : 'drafted-other');
    row.setAttribute('data-pick', String(index + 1));
  });
  updatePickCounter();
  const counter = document.getElementById('pick-counter-text').textContent;
  rows.forEach(row => {
    row.classList.remove('drafted-mine', 'drafted-other');
    row.removeAttribute('data-pick');
  });
  return counter;
});
assert.match(completedCounter, /Draft complete/);
assert.match(completedCounter, /160 picks/);
const auditPortfolio = await page.evaluate(() => getRecommendationAuditPortfolioSummary());
assert.equal(typeof auditPortfolio.reviewReady, 'boolean');
assert.equal(typeof auditPortfolio.strongReviewSample, 'boolean');
assert.equal(auditPortfolio.reviewReady, false);

await page.getByRole('button', {name:/My Draft/}).click();
assert.equal(await page.locator('#myteam-panel').getAttribute('aria-hidden'), 'false');
assert.match(await page.locator('#myteam-starter-count').innerText(), /\/ 9 starters/);

await page.setViewportSize({width:390,height:844});
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const overflowElements = await page.evaluate(() => [...document.querySelectorAll('body *')].map(el => ({tag:el.tagName, id:el.id, cls:el.className, right:Math.round(el.getBoundingClientRect().right), width:Math.round(el.getBoundingClientRect().width)})).filter(item => item.right > document.documentElement.clientWidth + 1).sort((a,b) => b.right-a.right).slice(0,10));
assert.equal(mobileOverflow, 0, JSON.stringify(overflowElements));

await page.addScriptTag({url:'developer-tools.js'});
const suites = await page.evaluate(async () => {
  const capture = async fn => await fn();
  return {
    draft: await capture(() => runDraftEngineTests({quiet:true})),
    turn: await capture(() => runTurnPackageTests()),
    explanation: await capture(() => runRecommendationExplanationTests()),
    sanity: await capture(() => runCalculationSanityTests()),
    thresholds: await capture(() => runRecommendationThresholdTests()),
    roadmap: await capture(() => runFantasyProsRoadmapSimulations()),
    espn: await capture(() => runEspnSyncContractTests())
  };
});
const auditSummary = await page.evaluate(() => {
  const original = recommendationAudit;
  recommendationAudit = [
    {resolved:true, calibrationEligible:true, survived:true},
    {resolved:true, calibrationEligible:true, survived:false},
    {resolved:true, calibrationEligible:false, noisyDraft:true, survived:false}
  ];
  const summary = getRecommendationAuditSummary();
  recommendationAudit = original;
  return summary;
});
assert.equal(auditSummary.calibrationEligible, 2);
assert.equal(auditSummary.noisyDraftDecisions, 1);
assert.equal(auditSummary.observedSurvivalRate, 50);
assert.equal(auditSummary.minimumSampleReached, false);
const auditClassification = await page.evaluate(() => {
  const entry = {decisionPick:1, nextPick:20};
  const normal = Array.from({length:18}, (_, index) => ({pick:index + 2, ecr:index + 2}));
  const noisy = normal.map((item, index) => ({pick:item.pick, ecr:index < 7 ? item.pick + 40 : item.ecr}));
  return {
    selected: classifyRecommendationAuditOutcome(entry, 1, normal),
    incomplete: classifyRecommendationAuditOutcome(entry, null, normal.slice(0, 2)),
    noisy: classifyRecommendationAuditOutcome(entry, null, noisy),
    drafted: classifyRecommendationAuditOutcome(entry, 10, normal)
  };
});
assert.equal(auditClassification.selected.censored, true);
assert.equal(auditClassification.selected.calibrationEligible, false);
assert.equal(auditClassification.incomplete.incomplete, true);
assert.equal(auditClassification.incomplete.calibrationEligible, false);
assert.equal(auditClassification.noisy.noisyDraft, true);
assert.equal(auditClassification.noisy.calibrationEligible, false);
assert.equal(auditClassification.drafted.survived, false);
assert.equal(auditClassification.drafted.calibrationEligible, true);
const auditDeduped = await page.evaluate(() => {
  const original = recommendationAudit;
  recommendationAudit = [];
  const state = buildLiveDraftDebugState();
  const primary = state.scored[0];
  const base = calculateDraftRecommendation(primary, state.scored, state.context);
  updateRecommendationAudit(Object.assign({}, base, {recommendation:'CONSIDER'}), primary, state);
  updateRecommendationAudit(Object.assign({}, base, {recommendation:'DRAFT'}), primary, state);
  const result = {length:recommendationAudit.length, action:recommendationAudit[0] && recommendationAudit[0].action};
  recommendationAudit = original;
  return result;
});
assert.equal(auditDeduped.length, 1);
assert.equal(auditDeduped.action, 'DRAFT');

await browser.close();
if (server) await new Promise(resolve => server.close(resolve));
if (errors.length) throw new Error('Browser console errors: ' + errors.join(' | '));
const suiteSummary = Object.fromEntries(Object.entries(suites).map(([name, result]) => [name, {passed:result.passed, failed:result.failed, total:result.total}]));
Object.entries(suites).forEach(([name, result]) => {
  assert.equal(result.failed || 0, 0, name + ': ' + JSON.stringify((result.results || []).filter(item => !item.passed)));
});
console.log(JSON.stringify({startup, markingMs:Number(markingMs.toFixed(1)), cachedRecommendationRenderMs:Number(recommendationRender.totalMs.toFixed(1)), mobileOverflow, suites:suiteSummary}, null, 2));
