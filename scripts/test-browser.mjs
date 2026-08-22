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

const sessionBefore = await page.locator('#draftSessionSelect option').count();
await page.getByRole('button', {name:'New Draft'}).click();
assert.equal(await page.locator('#draftSessionSelect option').count(), sessionBefore + 1);
assert.equal(await page.locator('tr.drafted-mine,tr.drafted-other').count(), 0);

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

await browser.close();
if (server) await new Promise(resolve => server.close(resolve));
if (errors.length) throw new Error('Browser console errors: ' + errors.join(' | '));
const suiteSummary = Object.fromEntries(Object.entries(suites).map(([name, result]) => [name, {passed:result.passed, failed:result.failed, total:result.total}]));
Object.entries(suites).forEach(([name, result]) => {
  assert.equal(result.failed || 0, 0, name + ': ' + JSON.stringify((result.results || []).filter(item => !item.passed)));
});
console.log(JSON.stringify({startup, markingMs:Number(markingMs.toFixed(1)), mobileOverflow, suites:suiteSummary}, null, 2));
