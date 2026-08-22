import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const dataDir = path.join(repoRoot, 'data');
const ecrPath = path.join(dataDir, 'FantasyPros_2026_Draft_ALL_Rankings.csv');
const adpPath = path.join(dataDir, 'FantasyPros_2026_Overall_ADP_Rankings.csv');
const jsonPath = path.join(dataDir, 'fantasypros-2026-master.json');
const runtimePath = path.join(repoRoot, 'fantasypros-2026-data.js');
const SOURCE_SNAPSHOT_DATE = '2026-08-21';

const SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
const EXPECTED = {
  ecrPlayers: 520,
  adpOnlyPlayers: 197,
  totalPlayers: 717,
  positionCounts: { QB: 102, RB: 170, WR: 242, TE: 115, K: 56, DST: 32 }
};

const TIER_MAP = [
  { min: 1, max: 2, legacy: 'Sp', semantic: 'ELITE' },
  { min: 3, max: 4, legacy: 'S', semantic: 'PREMIUM' },
  { min: 5, max: 6, legacy: 'A', semantic: 'CORE' },
  { min: 7, max: 8, legacy: 'B', semantic: 'VALUE' },
  { min: 9, max: 10, legacy: 'C', semantic: 'UPSIDE' },
  { min: 11, max: 12, legacy: 'D', semantic: 'DEPTH' },
  { min: 13, max: 14, legacy: 'E', semantic: 'LATE' },
  { min: 15, max: 16, legacy: 'F', semantic: 'DEEP' }
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''));
  return rows
    .filter((values) => values.some((value) => value !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function readCsv(filePath) {
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function canonicalName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ dst$/, '');
}

function parsePosition(positionRank) {
  const match = String(positionRank || '').trim().match(/^([A-Z]+)(\d+)?$/);
  if (!match) {
    throw new Error(`Invalid position rank: ${positionRank}`);
  }
  return { pos: match[1], posRank: match[2] ? Number(match[2]) : null };
}

function parseOptionalNumber(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === '-') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseRealTimeAdp(value) {
  const match = String(value || '').trim().match(/^\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function tierForFantasyProsTier(rawTier) {
  const tier = Number(rawTier);
  const mapping = TIER_MAP.find((entry) => tier >= entry.min && tier <= entry.max);
  if (!mapping) throw new Error(`Unsupported FantasyPros tier: ${rawTier}`);
  return mapping;
}

function parseAdpIdentity(rawValue, position) {
  const value = String(rawValue || '').trim();

  if (position === 'DST') {
    const match = value.match(/^(.*?)\s+\(([^)]*)\)$/);
    if (!match) throw new Error(`Cannot parse DST ADP identity: ${value}`);
    return {
      name: match[1].replace(/\s+DST$/, '').trim(),
      team: null,
      bye: match[2] || '-'
    };
  }

  const activeMatch = value.match(/^(.*?)\s{2,}([A-Z]{2,3})\s+\(([^)]*)\)$/);
  if (activeMatch) {
    return {
      name: activeMatch[1].trim(),
      team: activeMatch[2],
      bye: activeMatch[3] || '-'
    };
  }

  return { name: value, team: 'FA', bye: '-' };
}

function countByPosition(players) {
  return players.reduce((counts, player) => {
    counts[player.pos] = (counts[player.pos] || 0) + 1;
    return counts;
  }, {});
}

function findDuplicateCanonicalNames(players) {
  const counts = new Map();
  players.forEach((player) => {
    const key = canonicalName(player.name);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([name]) => name);
}

function assertEqual(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

const rawEcrRows = readCsv(ecrPath);
const rankedEcrRows = rawEcrRows.filter((row) => /^\d+$/.test(row.RK) && row['PLAYER NAME']);
const rawAdpRows = readCsv(adpPath);

const adpPlayers = rawAdpRows.map((row) => {
  const position = parsePosition(row.POS);
  const identity = parseAdpIdentity(row['Player (Bye)'], position.pos);
  return {
    adpRank: Number(row.Rank),
    adp: parseOptionalNumber(row.AVG),
    realTimeAdp: parseRealTimeAdp(row['Real-Time']),
    name: identity.name,
    team: identity.team,
    bye: identity.bye,
    pos: position.pos,
    posRank: position.posRank
  };
});

const supportedAdpPlayers = adpPlayers.filter((player) => SUPPORTED_POSITIONS.has(player.pos));
const adpByName = new Map(supportedAdpPlayers.map((player) => [canonicalName(player.name), player]));

const ecrPlayers = rankedEcrRows.map((row) => {
  const position = parsePosition(row.POS);
  const fantasyProsTier = Number(row.TIERS);
  const tier = tierForFantasyProsTier(fantasyProsTier);
  const adp = adpByName.get(canonicalName(row['PLAYER NAME'])) || null;

  return {
    rank: Number(row.RK),
    boardRank: Number(row.RK),
    ecr: Number(row.RK),
    adp: adp ? adp.adp : null,
    adpRank: adp ? adp.adpRank : null,
    realTimeAdp: adp ? adp.realTimeAdp : null,
    name: row['PLAYER NAME'].trim(),
    canonicalName: canonicalName(row['PLAYER NAME']),
    pos: position.pos,
    posRank: position.posRank,
    team: row.TEAM || 'FA',
    bye: row.BYE || '-',
    fantasyProsTier,
    consensusTier: tier.semantic,
    semanticTier: tier.semantic,
    tier: tier.legacy,
    source: adp ? 'ECR_AND_ADP' : 'ECR_ONLY'
  };
});

const ecrNames = new Set(ecrPlayers.map((player) => player.canonicalName));
const adpOnlyPlayers = supportedAdpPlayers
  .filter((player) => !ecrNames.has(canonicalName(player.name)))
  .sort((left, right) => left.adpRank - right.adpRank)
  .map((player, index) => ({
    rank: ecrPlayers.length + index + 1,
    boardRank: ecrPlayers.length + index + 1,
    ecr: null,
    adp: player.adp,
    adpRank: player.adpRank,
    realTimeAdp: player.realTimeAdp,
    name: player.name,
    canonicalName: canonicalName(player.name),
    pos: player.pos,
    posRank: player.posRank,
    team: player.team || 'FA',
    bye: player.bye || '-',
    fantasyProsTier: null,
    consensusTier: 'DEEP',
    semanticTier: 'DEEP',
    tier: 'F',
    source: 'ADP_ONLY'
  }));

const players = [...ecrPlayers, ...adpOnlyPlayers];
const duplicates = findDuplicateCanonicalNames(players);
const positionCounts = countByPosition(players);

assertEqual('ranked ECR player count', ecrPlayers.length, EXPECTED.ecrPlayers);
assertEqual('ADP-only player count', adpOnlyPlayers.length, EXPECTED.adpOnlyPlayers);
assertEqual('master player count', players.length, EXPECTED.totalPlayers);
assertEqual('canonical duplicate names', duplicates, []);
Object.entries(EXPECTED.positionCounts).forEach(([position, expectedCount]) => {
  assertEqual(`${position} player count`, positionCounts[position] || 0, expectedCount);
});
assertEqual('board ranks', players.map((player) => player.rank), Array.from({ length: players.length }, (_, index) => index + 1));

const metadata = {
  generatedFrom: [path.basename(ecrPath), path.basename(adpPath)],
  sourceSnapshotDate: SOURCE_SNAPSHOT_DATE,
  ecrPlayers: ecrPlayers.length,
  adpOnlyPlayers: adpOnlyPlayers.length,
  totalPlayers: players.length,
  excludedAdpPositions: countByPosition(adpPlayers.filter((player) => !SUPPORTED_POSITIONS.has(player.pos))),
  positionCounts,
  duplicateCanonicalNames: duplicates.length
};

fs.writeFileSync(jsonPath, `${JSON.stringify({ metadata, players }, null, 2)}\n`, 'utf8');
fs.writeFileSync(
  runtimePath,
  `/* Generated by scripts/build-fantasypros-2026.mjs. Do not edit manually. */\n` +
    `var FANTASYPROS_2026_DATASET_META = ${JSON.stringify(metadata, null, 2)};\n` +
    `var FANTASYPROS_2026_DATASET = ${JSON.stringify(players, null, 2)};\n`,
  'utf8'
);

console.log(JSON.stringify(metadata, null, 2));
