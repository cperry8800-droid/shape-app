// The Score page must not show a member someone else's numbers (review 2026-09-09,
// R13/C3), and the Goal pages must not name a quarter that has ended (V3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SCORE = readFileSync(new URL('../public/newdesign/clientScore.jsx', import.meta.url), 'utf8');
const SHELL = readFileSync(new URL('../public/newdesign/trainerDashboard.jsx', import.meta.url), 'utf8');
const TGOAL = readFileSync(new URL('../public/newdesign/trainerGoalPage.jsx', import.meta.url), 'utf8');
const NGOAL = readFileSync(new URL('../public/newdesign/nutritionistGoalPage.jsx', import.meta.url), 'utf8');

function fn(src, name, deps) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let d = 0, seen = false, k = at;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  const names = Object.keys(deps || {});
  return new Function(...names, src.slice(at, k) + '\nreturn ' + name + ';')(...names.map((n) => deps[n]));
}

test('the goal quarter is computed, never typed', () => {
  // ⚠ THIS EYEBROW READ "YOUR GOALS · Q2 2026" IN SEPTEMBER — a page about the current
  // quarter naming one that had ended, beside goals dated from today.
  const q = fn(SHELL, 'goalQuarterLabel');
  for (const [iso, want] of [
    ['2026-01-01T12:00:00', 'YOUR GOALS · Q1 2026'],
    ['2026-03-31T12:00:00', 'YOUR GOALS · Q1 2026'],
    ['2026-04-01T12:00:00', 'YOUR GOALS · Q2 2026'],
    ['2026-09-10T12:00:00', 'YOUR GOALS · Q3 2026'],
    ['2026-12-31T12:00:00', 'YOUR GOALS · Q4 2026'],
    ['2027-01-01T12:00:00', 'YOUR GOALS · Q1 2027'],
  ]) assert.equal(q(new Date(iso)), want, iso);
  for (const [name, src] of [['trainerGoalPage', TGOAL], ['nutritionistGoalPage', NGOAL]]) {
    const s = stripComments(src);
    assert.match(s, /eyebrow=\{goalQuarterLabel\(\)\}/, name + ' still types its quarter');
    assert.ok(!/Q[1-4] 20\d\d/.test(s), name + ' carries a frozen quarter literal');
  }
});

test('only a signed-out visitor may see the demo score', () => {
  // ⚠ `live` STAYS NULL WHEN THE FETCH FAILS, so the old ternary showed a member whose
  // request 500'd — or who had simply never earned a point — 1,284 points, a fabricated
  // eight-line breakdown and someone else's ledger, with nothing saying so.
  const src = stripComments(SCORE);
  assert.match(src, /const demo = state\.kind === "anon";/);
  assert.match(src, /const unread = state\.kind === "error";/);
  // every invented figure is now gated on `demo`
  for (const [what, re] of [
    ['the points total', /const myPoints = live \? live\.points_total : demo \? 1284 : 0;/],
    ['the breakdown', /: demo \? staticBreakdown : \[\];/],
    ['the ledger', /: demo \? staticLedger : \[\];/],
    ['the momentum', /: demo \? \{ value: 72, bonusThisWeek: false \} : null;/],
  ]) assert.match(src, re, what + ' is not gated on a signed-out visitor');
  // and nothing reaches for a demo literal outside that gate
  assert.ok(!/: staticBreakdown;/.test(src) && !/: staticLedger;/.test(src), 'a demo list is still an unconditional fallback');
});

test('the page asks ONE question, and the route answers it', () => {
  // ⚠ A FIRST CUT GATED THIS ON `useSignedIn` AND THAT WAS WORSE THAN THE DEFECT: a slow
  // or failed getUser() leaves that hook unresolved by design, so the page sat on
  // "Reading your standing…" forever — measured in a browser, on all four states
  // including the signed-out marketing page. /api/client/score already separates them.
  const src = stripComments(SCORE);
  assert.ok(!/useSignedIn\(\)/.test(src), 'the page gates its render on an auth hook again');
  assert.match(src, /r\.status === 401 \|\| r\.status === 403/, '401 is not read as "nobody is signed in"');
  assert.match(src, /if \(!r\.ok\) return \{ kind: "error" \};/);
  // a 2xx body that is not a score is unreadable, not a zero
  assert.match(src, /typeof d\.points_total === "number" \? \{ kind: "ready", data: d \} : \{ kind: "error" \}/);
  // three states, and the hero shows a dash rather than a number nobody read
  assert.match(src, /title=\{settling \? "—" : unread \? "—" :/);
});

test('the twelve-week line reads the record, and declares itself empty', () => {
  // R13 asks for a 12-week sparkline from score_ledger. `/api/client/score-record`'s
  // `3m` range is week-bucketed by the same aggregation twin the mobile app reads, so
  // there is no second definition of a member's history.
  const src = stripComments(SCORE);
  assert.match(src, /csrRead\("\/api\/client\/score-record", csrRecordShaped\)/);
  assert.match(src, /ranges && r\.data\.ranges\["3m"\]/);
  assert.match(src, /series\.slice\(-12\)/, 'the line is not capped at twelve weeks');
  // ⚠ `empty`, so DashGrid removes the item rather than leaving a slot — and TWO points
  // is the minimum a line can join.
  assert.match(src, /key: "trend12"[\s\S]{0,160}empty: !\(Array\.isArray\(trend\) && trend\.length >= 2\)/);
});

test('an empty breakdown and an empty ledger say which kind of empty they are', () => {
  const src = stripComments(SCORE);
  for (const phrase of ['Nothing banked yet', 'No entries yet', "Couldn't read your breakdown", "Couldn't read your ledger", 'Reading your breakdown', 'Reading your ledger']) {
    assert.ok(src.includes(phrase), 'missing the "' + phrase + '" state');
  }
  // the hero distinguishes a measured zero from an unread one
  assert.match(src, /\(!demo && myPoints === 0\) \? "Your first logged workout/);
});
