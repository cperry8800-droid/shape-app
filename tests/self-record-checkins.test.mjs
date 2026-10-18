// The member's own engine record carries their weekly check-in history.
//
// ⚠ THE DEFECT. shapeSignals.selfRecord read `window.ShapeCheckins.list`, which never
// existed — shapeBackend.js exports `submit`, `mine` and `weekOf`. The read was
// guarded, so it quietly answered null and the record never carried a check-in: the
// engine's checkin_overdue could not fire, not as the Home lead and not as a push
// (the server rebuilds candidates from this same record), while the score cron charged
// −7 for every missed week. Here the REAL module is loaded and run against the REAL
// engine, with only the data layer stubbed, so the fix is proven by the flag it lets
// fire rather than by the spelling of a function name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const engine = require_('../public/newdesign/dashSignals.js');

const local = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mondayWeeksAgo = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * n);
  return local(d);
};

let uid = 'member-a';
let prefOn = true;
let rows = [];
let fail = false;
const reads = [];
globalThis.window = {
  ShapeAuth: { getCachedState: () => ({ user: uid ? { id: uid } : null }) },
  ShapeCheckinPref: { on: () => prefOn },
  ShapeCheckins: {
    mine: async (limit) => { reads.push(limit); if (fail) throw new Error('offline'); return rows; },
    weekOf: () => mondayWeeksAgo(0),
  },
  DashSignals: engine,
};
await loadRealModule(fileURLToPath(new URL('../mobile-app/src/services/shapeSignals.js', import.meta.url)), {
  registry: new Map([['../../../public/newdesign/dashSignals.js', {}]]),
});

const flagsOf = (rec) => engine.evaluateClient(rec, new Date(), 'client').flags.map((f) => f.key);
const reset = () => { uid = 'member-a'; prefOn = true; rows = []; fail = false; reads.length = 0; };

test('the record carries the newest weekly check-in, and three missed weeks lead the day', async () => {
  reset();
  rows = [{ week_of: mondayWeeksAgo(3) }];
  const rec = await window.ShapeSignals.selfRecord();
  assert.deepEqual(reads, [1], 'the self record did not read the check-ins through ShapeCheckins.mine');
  assert.deepEqual(rec.checkIn, { lastWeekOf: mondayWeeksAgo(3) }, 'the newest check-in did not reach the record');
  assert.ok(flagsOf(rec).includes('checkin_overdue'), 'three missed weeks raised no checkin_overdue flag');
  assert.equal(window.ShapeSignals.directive(rec).lever, 'checkin', 'a three-week gap is not the member\'s one move');
});

test('a check-in this week raises nothing', async () => {
  reset();
  rows = [{ week_of: mondayWeeksAgo(0) }];
  const rec = await window.ShapeSignals.selfRecord();
  assert.deepEqual(rec.checkIn, { lastWeekOf: mondayWeeksAgo(0) });
  assert.ok(!flagsOf(rec).includes('checkin_overdue'), 'a member who checked in this week is told it is overdue');
});

test('with Check-ins off, the leg is not read at all', async () => {
  reset();
  prefOn = false;
  rows = [{ week_of: mondayWeeksAgo(3) }];
  const rec = await window.ShapeSignals.selfRecord();
  assert.deepEqual(reads, [], 'the check-ins were read for a member who turned them off');
  assert.equal(rec.checkIn, undefined);
  assert.ok(!flagsOf(rec).includes('checkin_overdue'), 'a member who turned check-ins off is nagged about one');
});

test('signed out, or a read that failed, leaves the leg unset rather than guessing', async () => {
  reset();
  uid = null;
  rows = [{ week_of: mondayWeeksAgo(3) }];
  let rec = await window.ShapeSignals.selfRecord();
  assert.deepEqual(reads, [], 'a signed-out preview read check-ins');
  assert.equal(rec.checkIn, undefined);

  reset();
  fail = true;
  rec = await window.ShapeSignals.selfRecord();
  assert.equal(rec.checkIn, undefined, 'a failed read was taken as a known check-in state');
  // A member with no check-in at all keeps the self view's own rule: no "first check-in" nag.
  reset();
  rows = [];
  rec = await window.ShapeSignals.selfRecord();
  assert.equal(rec.checkIn, undefined);
});

test('nothing in the app asks for ShapeCheckins.list again', () => {
  const walk = (dir, out = []) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { if (n !== 'i18n') walk(p, out); } else if (/\.(jsx?|mjs)$/.test(n)) out.push(p);
    }
    return out;
  };
  const backend = readFileSync('mobile-app/src/services/shapeBackend.js', 'utf8');
  assert.match(backend, /window\.ShapeCheckins = \{ submit: checkinSubmit, mine: checkinMine, weekOf: bsWeekOfMonday \};/,
    'ShapeCheckins changed shape — re-check every reader of it');
  for (const f of walk('mobile-app/src')) {
    assert.doesNotMatch(stripComments(readFileSync(f, 'utf8')), /ShapeCheckins\.list\b/, `${f} reads ShapeCheckins.list, which does not exist`);
  }
});
