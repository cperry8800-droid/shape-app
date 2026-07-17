// Guards for the two defect classes this surface actually shipped:
//
//  1. DYNAMIC KEYS ARE INVISIBLE TO STATIC TOOLING. `tr('score:tab.' + k, …)` is
//     built by concatenation, so a literal-key sync regex cannot see it — that
//     shipped 4 English tabs (#1759) and 5 English penalty rows (#1761). These
//     tests read the key families out of the SOURCE and assert every key the code
//     can construct exists in en/score.json.
//
//  2. THE scoreHistory TWINS DRIFT. `.mjs` and `.ts` hand-mirror the same row
//     shaping; `source_kind` had to be added to both (#1761). CodeRabbit asked for
//     a parity test — this is it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const EN = JSON.parse(read('mobile-app/src/i18n/catalogs/en/score.json'));

const between = (src, startRe, endRe) => {
  const m = src.match(startRe);
  assert.ok(m, `anchor not found: ${startRe}`);
  const rest = src.slice(m.index + m[0].length);
  const e = rest.match(endRe);
  assert.ok(e, `end anchor not found: ${endRe}`);
  return decomment(rest.slice(0, e.index));
};

test('every score: key the code BUILDS dynamically exists in en (the #1759/#1761 defect)', () => {
  const missing = [];

  // ledger.kind.<source_kind> — from _BS_LEDGER_KINDS
  const kinds = [...between(CLIENT, /_BS_LEDGER_KINDS = new Set\(\[/, /\]\)/).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 14, `expected the full static-note kind set, got ${kinds.length}`);
  for (const k of kinds) if (!(`ledger.kind.${k}` in EN)) missing.push(`ledger.kind.${k}`);

  // ledger.cat.<category> — from _BS_SCORE_CATEGORY_LABELS (the row-note fallback)
  const cats = [...between(CLIENT, /_BS_SCORE_CATEGORY_LABELS = \{/, /\n\};/).matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.ok(cats.length >= 11, `expected every ledger category, got ${cats.length}`);
  for (const c of cats) if (!(`ledger.cat.${c}` in EN)) missing.push(`ledger.cat.${c}`);

  // record.cat.<category> — the by-source CHART labels. A DIFFERENT vocabulary
  // from ledger.cat.* ('Workouts' vs 'Workout logged'): reusing one for the other
  // rendered row-notes in the chart, in English (Codex, #1761).
  const recCats = [...between(read('mobile-app/src/services/scoreHistory.mjs'), /RECORD_CATEGORY_LABELS = \{/, /\n\};/).matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  for (const c of recCats) if (!(`record.cat.${c}` in EN)) missing.push(`record.cat.${c}`);

  // record.filter.<key> — The Record's history chips
  const filters = [...between(CLIENT, /const filters = \[/, /\];/).matchAll(/\['([a-z]+)'/g)].map((m) => m[1]);
  for (const f of filters) if (!(`record.filter.${f}` in EN)) missing.push(`record.filter.${f}`);

  // tab.<key> — the Score page's 4 tabs
  for (const k of ['tiers', 'rewards', 'points', 'ledger']) if (!(`tab.${k}` in EN)) missing.push(`tab.${k}`);

  assert.deepEqual(missing, [], `en/score.json is missing dynamically-built keys: ${missing.join(', ')}`);
});

test('ledger.cat.* and record.cat.* stay DISTINCT vocabularies', () => {
  // If these ever collapse to the same strings, someone has "deduped" the row-note
  // labels into the chart labels (or vice-versa) — the exact Codex #1761 finding.
  assert.equal(EN['record.cat.workouts'], 'Workouts');
  assert.equal(EN['ledger.cat.workouts'], 'Workout logged');
  assert.notEqual(EN['record.cat.nutrition'], EN['ledger.cat.nutrition']);
});

// An object key follows a `{` or a `,` — NOT merely a line start. The .ts twin
// packs several fields per line (`category: r.category, label: …`), so a
// line-anchored match silently reports false drift. Comments must be stripped
// first or a `// note` between the comma and the key breaks the match.
const OBJ_KEY = /[{,]\s*(\w+):/g;
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('scoreHistory twins emit the same history-row shape', () => {
  const mjs = read('mobile-app/src/services/scoreHistory.mjs');
  const ts = read('src/lib/scoreHistory.ts');
  const shape = (src) => {
    const body = '{' + between(src, /dayMap\.get\(d\)(?:!)?\.push\(\{/, /\n\s*\}\);/);
    return [...body.matchAll(OBJ_KEY)].map((m) => m[1]).sort();
  };
  assert.deepEqual(shape(mjs), shape(ts), 'scoreHistory.mjs and src/lib/scoreHistory.ts emit different history-row fields');
  assert.ok(shape(mjs).includes('source_kind'), 'source_kind must ride through — the UI localizes off it');

  // the TS type must declare what the object literal emits, or tsc rejects it
  const type = ts.match(/export type HistoryRow = \{([^}]*)\}/);
  assert.ok(type, 'HistoryRow type not found');
  for (const f of shape(mjs)) {
    assert.ok(new RegExp(`\\b${f}\\b`).test(type[1]), `HistoryRow type is missing "${f}"`);
  }
});

test('RECORD_CATEGORY_LABELS twins agree', () => {
  const labels = (src) => {
    const body = '{' + between(src, /RECORD_CATEGORY_LABELS[^=]*= \{/, /\n\};/);
    return [...body.matchAll(/[{,]\s*(\w+): '([^']+)'/g)].map((m) => `${m[1]}=${m[2]}`).sort();
  };
  assert.deepEqual(
    labels(read('mobile-app/src/services/scoreHistory.mjs')),
    labels(read('src/lib/scoreHistory.ts')),
    'RECORD_CATEGORY_LABELS drifted between the .mjs and .ts twins',
  );
});
