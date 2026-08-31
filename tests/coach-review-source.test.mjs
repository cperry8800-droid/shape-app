// The coach review queue: each role must read ITS OWN source, and the two
// states the nutrition day genuinely cannot support must be stated rather than
// faked.
//
// ⚠ THE DEFECT THIS EXISTS FOR: BSWorkoutReviewPage called
// window.ShapeWorkoutLogs.listSessions() UNCONDITIONALLY, so a live
// nutritionist's whole "Client review." feature served the trainer's
// workout_sessions. The nutrition shape existed only in the demo rows — which
// is exactly why nothing caught it: signed out, the page looked right.
//
// ⚠ AND THE RATCHET DEFENDS ALMOST NONE OF IT. A source swap moves
// tests/i18n-surface-inventory.test.mjs by ZERO strings; reverting the role
// branch leaves that guard, tsc, the build and every other test GREEN. So this
// file is the deliverable, not a formality.
//
// It is a SOURCE guard because the page is a component in a ~7k-line
// browser-global module with no import seam (the house pattern from
// tests/integrations-name-token.test.mjs). Comments are stripped first: the
// rationale written at each site quotes the very expressions banned here, and
// this repo has burned that trap more than once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const EN = 'mobile-app/src/i18n/catalogs/en/coach.json';

/** The review page's own body, brace-matched from its declaration. */
function reviewPage() {
  const src = stripComments(readFileSync(PROS, 'utf8'));
  const marker = 'function BSWorkoutReviewPage(';
  const at = src.indexOf(marker);
  assert.ok(at >= 0, 'BSWorkoutReviewPage not found — re-anchor this guard');
  assert.equal(src.indexOf(marker, at + 1), -1, 'BSWorkoutReviewPage is declared twice — the extract would be ambiguous');
  // Brace-match from the body's `{`, NOT the first `{` after the marker — that
  // one is the DESTRUCTURED PARAMETER, and anchoring there yields a two-word
  // fragment every later assertion is then wrongly about.
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error('unbalanced braces in BSWorkoutReviewPage');
}

test('a nutritionist reads meal-log days; a trainer reads workout sessions', () => {
  const body = reviewPage();
  // Guard-the-guard: an empty/mis-anchored extract would pass every ban below.
  assert.ok(body.length > 2000, 'extract too small — the anchor is wrong');

  assert.match(body, /ShapeNutritionLogs\?\.\s*listClientDays/, 'the nutritionist path must read meal-log days');
  assert.match(body, /ShapeWorkoutLogs\?\.\s*listSessions/, 'the trainer path must read workout sessions');

  // The two calls must be the two arms of ONE role branch. An unconditional
  // workout read — the shipped defect — has no `isNutri` between them.
  const nut = body.indexOf('ShapeNutritionLogs');
  const wk = body.indexOf('ShapeWorkoutLogs');
  const lo = Math.min(nut, wk);
  const hi = Math.max(nut, wk);
  assert.ok(hi - lo < 400, 'the two sources are far apart — they are no longer one branch');
  assert.match(body.slice(Math.max(0, lo - 200), hi), /isNutri/, 'the source must be chosen by role');
});

test('the day composer is PROBED, not asserted — and both halves move together', () => {
  const body = reviewPage();
  // The schema half (2026-08-31-nutrition-day-review-notes.sql) can be applied
  // either side of a deploy, so `notesBlocked` must come from asking the
  // schema. Both halves must hold: the composer hidden AND the writer
  // refusing. Half of this passing is the dangerous state — a visible composer
  // over a refusing writer strands the coach's words, a hidden composer over a
  // working writer hides a shipped feature.
  assert.match(body, /selected\.notesBlocked\s*\?/, 'the composer must be gated on notesBlocked');
  assert.match(body, /if\s*\(\s*selected\.notesBlocked\s*\)\s*return/, 'saveNote must refuse a blocked row');

  const backend = stripComments(readFileSync(BACKEND, 'utf8'));
  // The shipped defect this replaces: a hardcoded `true` that outlived the
  // schema it described, so the composer stayed hidden after the migration ran.
  assert.doesNotMatch(backend, /notesBlocked:\s*(true|false)\b/, 'notesBlocked is hardcoded again — it must be derived from the schema probe');
  assert.match(backend, /notesBlocked:\s*!/, 'notesBlocked must be derived from the probe');
  assert.match(backend, /async function dayNotesSupported\s*\(/, 'the schema probe must exist');
  // A probe that cached every failure would hide the composer for the rest of
  // the session on one network blip; only the undefined-column answer settles.
  assert.match(backend, /42703/, 'the probe must distinguish a missing column from a transient failure');
});

test('a day note is keyed by (client, day) and never carries a session', () => {
  const backend = stripComments(readFileSync(BACKEND, 'utf8'));
  const at = backend.indexOf('async function addCoachWorkoutReviewNote(');
  assert.ok(at > 0, 'addCoachWorkoutReviewNote not found — re-anchor this guard');
  const writer = backend.slice(at, at + 2400);

  // The NATURAL key. daily_health_snapshot is UPSERTed on
  // (user_id, snapshot_date), so its row id is a ROW identity — a note keyed to
  // it is cascaded away the moment a writer replaces rather than updates.
  assert.match(writer, /client_id:\s*clientId/, 'a day note must carry client_id');
  assert.match(writer, /snapshot_date:\s*snapshotDate/, 'a day note must carry snapshot_date');
  assert.match(writer, /session_id:\s*null/, 'a day note must null its session_id — the DB CHECK allows exactly one subject');
  // The same XOR the CHECK enforces, refused here so we never send a row it
  // will reject.
  assert.match(writer, /!sessionId\s*&&\s*!day/, 'the writer must refuse a subject-less note');
  assert.match(writer, /sessionId\s*&&\s*day/, 'the writer must refuse a two-subject note');

  // The render must hand over the day, not the snapshot row id.
  const body = reviewPage();
  const sub = body.slice(body.indexOf('const noteSubject'));
  assert.ok(sub.length > 60, 'noteSubject not found — re-anchor');
  const decl = sub.slice(0, sub.indexOf(';'));
  assert.match(decl, /snapshotDate:\s*selected\.loggedOn/, 'the day subject must be the calendar day, not the snapshot row id');
  assert.doesNotMatch(decl, /(clientId|snapshotDate):\s*selected\.id\b/, 'the snapshot row id is being used as a day key');
});

test('per-meal detail is not persisted, so the day says that rather than rendering nothing', () => {
  const body = reviewPage();
  // Meal logging accumulates into day TOTALS (add_meal_macros); no per-meal row
  // is kept. An empty list would read as "this client logged nothing".
  assert.match(body, /hasMeals/, 'the render must know whether per-meal rows exist');
  assert.match(body, /coach:review\.mealsNotStored['"]/, 'a live day must state that only totals are stored');
});

test('the stored session status is a TOKEN — never rendered raw', () => {
  const body = reviewPage();
  // workout_sessions.status is text NOT NULL DEFAULT 'completed', CHECK'd to
  // planned|active|completed|abandoned|reviewed. Printing it is the token/label
  // class; the label is resolved, the token is not.
  assert.match(body, /const statusLabel\s*=/, 'the status token must resolve through one label map');
  assert.doesNotMatch(body, /\{\s*(selected|session|row)\.status\s*\|\|/, 'a render site is spelling the status fallback itself again');
  assert.doesNotMatch(body, /\$\{\s*(selected|session|row)\.status\s*\}/, 'the raw stored token is being interpolated as copy');
});

test('every status the CHECK allows has an authored label', () => {
  // DERIVED from the resolver in the shipped source, not a hand-typed list: a
  // sixth token added later fails here rather than rendering as itself forever.
  const body = reviewPage();
  const map = body.slice(body.indexOf('const REVIEW_STATUS'));
  const keys = [...map.slice(0, map.indexOf('};')).matchAll(/'(coach:review\.st[A-Za-z]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 5, `expected the five CHECK'd statuses, found ${keys.length}`);
  const en = JSON.parse(readFileSync(EN, 'utf8'));
  for (const k of keys) {
    const short = k.slice('coach:'.length);
    assert.ok(en[short] && String(en[short]).trim(), `${k} has no authored en value`);
  }
});

test('a nutrition day never claims a workout word', () => {
  const body = reviewPage();
  const at = body.indexOf('const rowStatus');
  assert.ok(at > 0, 'rowStatus not found — re-anchor');
  const line = body.slice(at, body.indexOf('\n', at));
  assert.match(line, /nutrition\s*\?/, 'the nutrition branch must decide its own status');
  // The day states WHEN it is; 'completed' is a workout word and a logged day
  // is not a finished anything.
  assert.match(line, /dayLabel/, 'a nutrition day with no stored status must state its date');
});
