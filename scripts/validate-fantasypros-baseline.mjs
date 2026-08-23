import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'data', 'fantasypros-2026-baseline.json');
const runtimePath = path.join(root, 'fantasypros-2026-data.js');
const context = {};
vm.runInNewContext(fs.readFileSync(runtimePath, 'utf8'), context);
const meta = context.FANTASYPROS_2026_DATASET_META;
const files = [
  'FantasyPros_2026_Draft_Top20_Rankings.csv',
  'FantasyPros_2026_Draft_ALL_Rankings.csv',
  'FantasyPros_2026_Overall_ADP_Rankings.csv'
];

function normalizedTextHash(filePath) {
  const normalized = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

const hashes = Object.fromEntries(files.map(name => [name, normalizedTextHash(path.join(root, 'data', name))]));
hashes['fantasypros-2026-data.js'] = normalizedTextHash(runtimePath);
const current = {sourceSnapshotDate:meta.sourceSnapshotDate, top20EcrPlayers:meta.top20EcrPlayers, broadEcrFallbackPlayers:meta.broadEcrFallbackPlayers, ecrPlayers:meta.ecrPlayers, adpOnlyPlayers:meta.adpOnlyPlayers, totalPlayers:meta.totalPlayers, positionCounts:meta.positionCounts, duplicateCanonicalNames:meta.duplicateCanonicalNames, files:hashes};
if (process.argv.includes('--accept')) {
  fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
  console.log('Accepted new FantasyPros baseline. Review and commit the baseline diff explicitly.');
  process.exit(0);
}
const expected = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
if (JSON.stringify(current) !== JSON.stringify(expected)) {
  console.error('FantasyPros dataset differs from the committed baseline. Review the source update, then run npm run baseline:accept.');
  process.exit(1);
}
console.log(`FantasyPros baseline valid: ${meta.totalPlayers} players, ${meta.duplicateCanonicalNames} duplicates.`);
