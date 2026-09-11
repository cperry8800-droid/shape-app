// The per-card ⚙ and the Trend chart's time window (review 2026-09-09, R15).
//
// ⚠ THE WINDOW IS A REAL FILTER OVER REAL DATES, which is the only reason it may exist.
// `/api/client/progress` already serves every point with its `date` and the card threw
// the dates away on the way to the plot, so the control costs no route change and
// invents nothing. A window built by asking the server for "the last 30 days" of a
// series it does not bucket that way would have been a number nobody measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const GRID = stripComments(readFileSync(new URL('../public/newdesign/dashGrid.jsx', import.meta.url), 'utf8'));
const PROG = stripComments(readFileSync(new URL('../public/newdesign/dashProgress.jsx', import.meta.url), 'utf8'));
const ROUTE = readFileSync(new URL('../src/app/api/client/progress/route.ts', import.meta.url), 'utf8');

function body(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let p = 0, k = src.indexOf('(', at);
  for (; k < src.length; k++) { const c = src[k]; if (c === '(') p++; else if (c === ')') { p--; if (!p) { k++; break; } } }
  let d = 0, seen = false;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  const out = src.slice(at, k);
  assert.ok(out.length > name.length + 40, 'body(' + name + ') stopped at the parameter list');
  return out;
}

// ── the gear ────────────────────────────────────────────────────────────────
const groups = new Function(body(GRID, 'dgSettingGroups') + '\nreturn dgSettingGroups;')();

test('a card with nothing to configure gets no gear', () => {
  // ⚠ R18's RULE AGAIN: a control that opens an empty panel costs more trust than an
  // absent one.
  const pick = () => {};
  assert.deepEqual(groups(undefined), []);
  assert.deepEqual(groups({}), []);
  assert.deepEqual(groups({ settings: [] }), []);
  assert.deepEqual(groups({ settings: 'nope' }), []);
  // a group with ONE option is a label wearing a control
  assert.deepEqual(groups({ settings: [{ key: 'w', options: [{ v: 'a' }], onPick: pick }] }), []);
  // a group that cannot act on a pick is decoration
  assert.deepEqual(groups({ settings: [{ key: 'w', options: [{ v: 'a' }, { v: 'b' }] }] }), []);
  // and a real one survives
  assert.equal(groups({ settings: [{ key: 'w', options: [{ v: 'a' }, { v: 'b' }], onPick: pick }] }).length, 1);
});

test('an open panel is pinned visible, not left to :focus-within', () => {
  // ⚠ THE POPOVER LIVES INSIDE `.dash-wchrome`, which is `opacity: 0` until the grid item
  // is `:hover` or `:focus-within` — so a member who opens the gear and moves toward the
  // panel (which hangs BELOW the gear, often past the item's own box) leaves the hover
  // area and the panel they are reaching for disappears. Chromium happens to cover it,
  // because clicking a <button> focuses it; SAFARI DOES NOT focus a button on click.
  //
  // Measured A/B in Chromium with focus blurred, which is how Safari's behaviour
  // reproduces: with the pin, the chrome's computed opacity is "1"; without it, "0" —
  // the panel invisible while still open.
  const comp = body(GRID, 'DgCardSettings');
  assert.match(comp, /boxRef\.current\.closest\(".dash-wchrome"\)/, 'the open panel is not pinned visible');
  assert.match(comp, /el\.style\.opacity = "1";/);
  // and it is RESTORED, not left forced — otherwise every card whose gear was ever opened
  // keeps its chrome lit for the life of the page.
  assert.match(comp, /const prev = el\.style\.opacity;/);
  assert.match(comp, /return \(\) => \{ el\.style\.opacity = prev; \};/);
});

test('the gear and its panel read the SAME list', () => {
  // Named once, so a card can never render a ⚙ that opens nothing — the failure mode
  // this repo has already paid for on the hidden-cards bar, where the bar's visibility
  // and its contents were two different expressions.
  const chrome = GRID.slice(GRID.indexOf('const chrome = (key)'), GRID.indexOf('return (\n    <div>'));
  assert.match(chrome, /dgSettingGroups\(w\)\.length > 0 && <DgCardSettings groups=\{dgSettingGroups\(w\)\} \/>/);
});

// ── the window ──────────────────────────────────────────────────────────────
const WINDOWS = JSON.parse(
  /const DPR_WINDOWS = (\[[\s\S]*?\]);/.exec(PROG)[1]
    .replace(/(\w+):/g, '"$1":').replace(/'/g, '"').replace(/,(\s*[\]}])/g, '$1'));
const windowed = new Function('return ' + body(PROG, 'dprWindowed').replace(/^function dprWindowed/, 'function'))();
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('the default window is ALL, so a member who never opens the gear sees no change', () => {
  assert.match(PROG, /useRememberedChoice\(prefs, "progressTrendWindow", DPR_WINDOW_KEYS, "all"\)/);
  assert.equal(WINDOWS[WINDOWS.length - 1].v, 'all');
  assert.equal(WINDOWS[WINDOWS.length - 1].days, null);
  assert.deepEqual(WINDOWS.map((w) => w.v), ['7d', '30d', '90d', 'all']);
});

test('ALL keeps every dated point', () => {
  const pts = [{ date: day(400), value: 1 }, { date: day(10), value: 2 }, { date: day(0), value: 3 }];
  assert.equal(windowed(pts, null).length, 3);
});

test('the window is anchored on the NEWEST point, not on today', () => {
  // ⚠ THIS IS THE WHOLE HONESTY OF THE CONTROL. Anchored on today, a member who stopped
  // logging five weeks ago picks 30D and gets an EMPTY chart — which reads as "you have
  // no weight data" rather than "nothing in the last 30 days". Anchored on their last
  // entry, 30D means "the last 30 days you logged", which is the question someone
  // looking at their own trend is actually asking.
  const stale = [{ date: day(70), value: 1 }, { date: day(50), value: 2 }, { date: day(40), value: 3 }];
  assert.equal(windowed(stale, 30).length, 3, 'a member who paused lost their whole chart');
  assert.equal(windowed(stale, 7).length, 1, 'the 7d window still narrows, relative to the last entry');
});

test('a narrower window keeps strictly fewer or equal points, and never reorders', () => {
  const pts = [];
  for (let i = 120; i >= 0; i -= 5) pts.push({ date: day(i), value: i });
  // DPR_WINDOWS is declared NARROWEST FIRST, so each keeps at least as many as the one
  // before it. (The first draft of this walked the same list asserting the opposite and
  // failed on correct code — the list's order is part of its contract.)
  let prev = -1;
  for (const w of WINDOWS) {
    const got = windowed(pts, w.days);
    assert.ok(got.length >= prev, w.v + ' kept FEWER than the narrower window before it');
    prev = got.length;
    assert.deepEqual(got.map((p) => p.date), pts.filter((p) => got.includes(p)).map((p) => p.date), w.v + ' reordered the series');
  }
  assert.equal(prev, pts.length, 'the widest window dropped points');
  assert.equal(windowed(pts, 7).length, 2);
});

test('rows with no usable date or value are dropped, and an undated series is not windowed away', () => {
  assert.deepEqual(windowed(null, 30), []);
  assert.deepEqual(windowed([{ date: day(1), value: 'x' }], 30), []);
  assert.deepEqual(windowed([{ value: 5 }], 30), []);   // no date at all: not a point
  // every date unparseable -> no anchor exists, so the series passes through rather than
  // silently emptying the chart
  const junk = [{ date: 'not-a-date', value: 1 }, { date: 'also-not', value: 2 }];
  assert.equal(windowed(junk, 7).length, 2);
});

test('an emptied window says the window did it, not "log more data"', () => {
  // ⚠ Telling a member with two years of weigh-ins to log more, because they picked 7D,
  // is the honest-data rule pointed the wrong way.
  assert.match(PROG, /const windowHidSome = activeWindow\.days != null && activeAll\.length >= 2 && activeSeries\.length < 2;/);
  assert.match(PROG, /windowHidSome\s*\?\s*"Nothing logged in the last "/);
  assert.match(PROG, /:\s*live \? "Log more "/);
});

const deltaLabel = new Function(body(PROG, 'dprDeltaLabel') + '\nreturn dprDeltaLabel;')();
const ALLW = WINDOWS[WINDOWS.length - 1], W7 = WINDOWS[0];
const lb = { fmt: (v) => Math.round(v) };

test('a delta that rounds to zero does not carry a sign', () => {
  // ⚠ THE WINDOW IS WHAT MADE THIS REACHABLE. `fmt` rounds, so a real move of −0.25 lb
  // rendered "−0" — a sign attached to a zero, claiming a direction the number beside it
  // cannot support. Over ALL the raw delta is rarely small enough to round away; over 7D
  // it often is. A change that makes a state reachable owes that state a definition.
  assert.match(deltaLabel(-0.25, lb, W7, false), /^no change over 7d logged$/);
  assert.match(deltaLabel(0.4, lb, W7), /^no change over 7d logged$/);
  assert.match(deltaLabel(0, lb, ALLW), /^no change since start$/);
  // and a real move still reads as one, in both directions
  assert.equal(deltaLabel(-10, lb, ALLW), '−10 since start');
  assert.equal(deltaLabel(3.6, lb, W7), '+4 over 7d logged');
  // a fractional formatter keeps its precision rather than being rounded to the rule
  const pct = { fmt: (v) => v.toFixed(1) };
  assert.equal(deltaLabel(-0.25, pct, ALLW), '−0.3 since start');
});

const winLabel = new Function(body(PROG, 'dprWindowLabel') + '\nreturn dprWindowLabel;')();

test('"ALL" does not claim to be all when the history is capped', () => {
  // ⚠ CODEX ON THIS PR, AND IT IS MY OWN DOING. Both history reads in
  // /api/client/progress are bounded, so for a member past that cap the earliest point on
  // the chart is the SERVER'S CUTOFF — and I shipped a control literally labelled ALL over
  // that window with a delta reading "since start". The mislabel pre-dates the control;
  // the control is what made the claim explicit, and a change that makes a claim explicit
  // owns it.
  assert.equal(deltaLabel(-10, lb, ALLW, false), '−10 since start');
  assert.equal(deltaLabel(-10, lb, ALLW, true), '−10 since the earliest shown');
  // a bounded window already names its own span, so the cap changes nothing there
  assert.equal(deltaLabel(-10, lb, W7, true), '−10 over 7d logged');
  assert.equal(deltaLabel(-10, lb, W7, false), '−10 over 7d logged');
  // and the ⚙ says it BEFORE the choice is made, not only after
  assert.equal(winLabel(ALLW, false), 'ALL');
  assert.equal(winLabel(ALLW, true), 'MAX');
  for (const w of WINDOWS.filter((x) => x.days != null)) {
    assert.equal(winLabel(w, true), w.label, 'a bounded window was relabelled by the cap');
  }
});

test('the cap is named once in the route and reported to the client', () => {
  // A page that offers an "ALL" window is making a claim about it, and the client cannot
  // check that claim from the payload unless the payload carries it.
  assert.match(ROUTE, /const HISTORY_CAP = \d+;/);
  assert.equal((ROUTE.match(/\.limit\(HISTORY_CAP\)/g) || []).length, 2, 'a history read is still capped by a bare number');
  assert.match(ROUTE, /historyCapped: snaps\.length >= HISTORY_CAP \|\| weighIns\.length >= HISTORY_CAP/);
  // and the card only trusts it on a live payload — the demo series is short by construction
  assert.match(PROG, /const historyCapped = !!\(live && progress && progress\.historyCapped\);/);
});

test('the delta names the span it was taken over', () => {
  // "since start" meant the start of the series; under a window it is the start of the
  // WINDOW, and a delta that does not say which span it covers is a number you cannot check.
  assert.equal(deltaLabel(-10, lb, ALLW).endsWith(' since start'), true);
  assert.equal(deltaLabel(-10, lb, W7).endsWith(' over 7d logged'), true);
  // and the eyebrow says which window is in force, so the chart is never silently narrowed
  assert.match(PROG, /trend\{activeWindow\.days == null \? "" : " · " \+ activeWindow\.label\}/);
});

test('the tab list is NOT windowed', () => {
  // Hiding a tab because the current window is thin would flicker the buttons in and out
  // as the member changes the window — and the tab list is about what they have EVER
  // logged, which the window does not change.
  assert.match(PROG, /const availableTabs = DPR_TREND_TABS\.filter\(\(t\) => \(series\[t\.k\] \|\| \[\]\)\.length >= 2\)/);
});

// ── the route the window reads ──────────────────────────────────────────────
test('every capped progress query keeps the NEWEST rows', () => {
  // ⚠ TWO OF THEM KEPT THE OLDEST. `daily_health_snapshot` and `client_weigh_ins` both
  // ordered ascending and capped at 400, so a member past ~13 months of daily rows was
  // served their oldest 400 days and never this year's — on a page whose whole framing is
  // "eight weeks ago next to today". The sets query in the same file was fixed for
  // exactly this and carries the lesson in its own comment; these two never got it. A
  // time window over a truncated-to-the-oldest series renders empty for the members who
  // have logged the most.
  // ⚠ THE LIMIT MAY BE A NAMED CONSTANT, NOT A LITERAL. The first version of this matched
  // `.limit(<digits>)` only, so naming the cap `HISTORY_CAP` — which the round that
  // reported the cap to the client had to do — dropped two of the three queries out of the
  // sweep and left it silently checking one. A guard that derives its corpus has to accept
  // every spelling the corpus can legitimately take.
  const caps = [...ROUTE.matchAll(/\.order\('([a-z_]+)',\s*\{\s*ascending:\s*(true|false)\s*\}\)\s*\n\s*\.limit\(([A-Za-z_$][\w$]*|\d+)\)/g)];
  assert.ok(caps.length >= 3, 'expected the capped queries, found ' + caps.length);
  for (const [, col, asc, n] of caps) {
    assert.equal(asc, 'false', `.order('${col}', ascending: true).limit(${n}) keeps the OLDEST rows`);
  }
  // and the two that consumers need ascending are re-sorted rather than left reversed
  assert.match(ROUTE, /const snaps = \(snapRows \?\? \[\]\)\.slice\(\)\.reverse\(\);/);
  assert.match(ROUTE, /const weighIns = \(\(weighRows \?\? \[\]\) as Array<Record<string, unknown>>\)\.slice\(\)\.reverse\(\);/);
});
