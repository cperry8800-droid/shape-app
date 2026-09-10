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

// ── the derived zero (CodeRabbit, #2028) ────────────────────────────────────
// ⚠ `myPoints` IS 0 IN THE UNREAD AND SETTLING STATES, and every tier derivation below
// it reads that as a real rank: the ladder marked **Raw** as "YOU ARE HERE" and printed
// a bare `0`, the shortest-path card promised "750 points stand between you and Tempo",
// the week's-gains card rendered a fabricated **+36** with an invented activity
// breakdown, and the how-it-works panel highlighted the first rung as the member's own.
// A zero under a "Shape Score" heading is a measurement; it has to read as a failure.
//
// The three-audience split is `live` (their own numbers) · `demo` (the signed-out
// preview, honestly labelled) · everything else (nothing). These guards pin that EVERY
// site derived from `myPoints` asks whether the standing is known, not whether it is
// live — because `demo` may show invented figures and `unread` may not.
const CLEAN_SCORE = stripComments(SCORE);
const between = (a, b) => CLEAN_SCORE.slice(CLEAN_SCORE.indexOf(a), CLEAN_SCORE.indexOf(b, CLEAN_SCORE.indexOf(a)));

test('there is ONE named gate for "we know this member\'s standing"', () => {
  assert.match(CLEAN_SCORE, /const standingKnown = !!live \|\| demo;/,
    'the gate is gone, or is spelled in a way each site can drift from');
});

test('the tier ladder shows the member no position it has not read', () => {
  const ladder = between('const isCurrent =', 'This week\'s gains');
  // "YOU ARE HERE" is only ever drawn on a known standing
  assert.match(ladder, /const isCurrent = standingKnown && i === currentIdx;/);
  // the points readout says what happened instead of printing 0
  assert.match(ladder, /standingKnown \? myPoints\.toLocaleString\(\)/);
  assert.ok(!/<span>\{myPoints\.toLocaleString\(\)\}<\/span>/.test(ladder), 'the bare points readout is back');
  // ⚠ AND THE PROGRESS BAR IS NOT DRAWN AT ALL. At 0 points a bar is not merely
  // unknown — it reads as "you have earned nothing".
  assert.match(ladder, /\{standingKnown && \(\s*<div style=\{\{ height: 6/);
});

test("this week's gains is the preview's invented week, and only the preview sees it", () => {
  const gains = between("{ key: \"gains\"", '{ key: "path"');
  assert.match(gains, /live \? "\+" \+ live\.week_gain : demo \? "\+36" : "—"/,
    'a failed read still shows a fabricated weekly gain');
  // the workout / PR / community rows are demo-only, not "not live"
  assert.match(gains, /\{demo && \(/, 'the fabricated activity rows are gated on !live again');
  assert.ok(!/\{!live && \(/.test(gains), '`!live` covers three states and only one of them may see this');
});

test('the shortest path quotes no distance from a standing nobody read', () => {
  const path = between('{ key: "path"', '{ key: "ledger"');
  assert.match(path, /!standingKnown/, 'the distance is computed regardless of whether the standing is known');
  // and the eyebrow does not name a tier it cannot place the member below
  assert.match(path, /SHORTEST PATH\{standingKnown && nextTier \? " TO "/);
});

test('the how-it-works panel highlights nothing when the standing is unknown', () => {
  assert.match(CLEAN_SCORE, /<ClientScoreHowItWorks tiers=\{tiers\} currentTier=\{standingKnown \? currentTier\[0\] : null\} \/>/);
  // and the panel itself already treats null as "highlight nothing" — it lives in
  // clientScoreRecord.jsx, so the claim is checked THERE rather than assumed
  const RECORD = stripComments(readFileSync(new URL('../public/newdesign/clientScoreRecord.jsx', import.meta.url), 'utf8'));
  assert.match(RECORD, /function ClientScoreHowItWorks\(\{ tiers, currentTier \}\)/);
  assert.match(RECORD, /const here = currentTier && t\[0\] === currentTier;/);
});

test('the hero reports the failure BEFORE it reports a zero', () => {
  // ⚠ ORDER IS THE WHOLE GUARD HERE. `(!demo && myPoints === 0)` renders "Your first
  // logged workout … opens this" — a claim that the member has earned nothing — and it
  // is true of an unread member too. It must sit AFTER the settling and unread arms.
  const sub = between('subtitle={settling ?', 'actions={');
  const iSettling = sub.indexOf('settling ?');
  const iUnread = sub.indexOf('unread ?');
  const iZero = sub.indexOf('myPoints === 0');
  assert.ok(iSettling >= 0 && iUnread > iSettling && iZero > iUnread,
    'a member whose score could not be read is told they have never earned a point');
  assert.match(CLEAN_SCORE, /title=\{settling \? "—" : unread \? "—" : myPoints\.toLocaleString\(\)\}/);
});

test('every site that reads a tier derivation is gated — swept, not enumerated', () => {
  // ⚠ CODERABBIT FOUND THREE OF THESE AND A SWEEP FOUND TWO MORE. Enumerating the sites
  // that were wrong on the day is not the same as knowing the class is closed, so this
  // walks every line that reads one of the derivations and requires it to be inside a
  // guarded expression. A new widget that prints `myPoints` raw fails here.
  //
  // ⚠ IT IS A HEURISTIC NET, AND SAYING SO IS THE POINT. The gate legitimately sits on
  // an ENCLOSING expression rather than on the line that reads the value — my first cut
  // demanded it on the same line and flagged three correct sites. The window is the
  // enclosing widget (or the hero), which is the scope a gate actually governs. The real
  // proof is the headless render of the unread state; this catches it at authoring time.
  const DERIVED = ['myPoints', 'ptsToNext', 'progressPct', 'currentIdx', 'currentTier'];
  const GATE = /standingKnown|\bdemo\b|\blive\b|\bunread\b|\bsettling\b/;
  const lines = CLEAN_SCORE.split('\n');
  const declEnd = lines.findIndex((l) => l.includes('const staticBreakdown'));
  assert.ok(declEnd > 0, 'the derivation block moved');
  // widget boundaries: each `{ key: "…"` starts a new render scope
  const starts = [declEnd];
  lines.forEach((l, i) => { if (i > declEnd && /^\s*\{ key: "/.test(l)) starts.push(i); });
  assert.ok(starts.length >= 5, 'only ' + (starts.length - 1) + ' widget scopes found');
  const scopeStart = (i) => { let s = declEnd; for (const k of starts) if (k <= i) s = k; return s; };
  let checked = 0; const bad = [];
  for (let i = declEnd; i < lines.length; i++) {
    const l = lines[i];
    if (!DERIVED.some((d) => new RegExp('\\b' + d + '\\b').test(l))) continue;
    checked += 1;
    const window = lines.slice(scopeStart(i), i + 1).join('\n');
    if (GATE.test(window)) continue;
    bad.push((i + 1) + ': ' + l.trim().slice(0, 110));
  }
  assert.ok(checked >= 8, 'the sweep scanned only ' + checked + ' lines');
  assert.deepEqual(bad, [], 'these read a tier derivation with no audience gate anywhere in their widget:\n  ' + bad.join('\n  '));
});
