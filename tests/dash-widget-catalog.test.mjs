// The widget catalogue (review 2026-09-21): an always-visible "＋ Add widget" control on
// every DashGrid tab, optional widgets that stay off the board until added, and the
// seven Today widgets a coach can add — every one derived from state the page already
// holds. Run: node --test
//
// ⚠ WHY THE CONTROL EXISTS. Measured on the coach Today before this change: seven cards,
// every card's chrome (⠿ ⚙ ×) at opacity 0 until hover, and the only way to bring a
// card back a chip bar that renders only AFTER something has been hidden. A member who
// never hovered never learned the board was theirs to arrange. A dashboard that can be
// customized but does not say so is, to most of its users, one that cannot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { stripComments } from './helpers/strip-comments.mjs';

// Run a snippet against the shipped module in a CHILD process under a named zone.
// ⚠ V8 CACHES THE TIMEZONE, so re-assigning process.env.TZ mid-run does not reliably
// move it — and CI runs in UTC, where no day is 23 or 25 hours long and a DST defect
// passes every test. A guard that thinks it changed zone and did not is a guard that
// tested UTC twice.
function inZone(zone, expr) {
  const code = `const s = require(${JSON.stringify(new URL('../public/newdesign/dashSignals.js', import.meta.url).pathname)}); process.stdout.write(JSON.stringify(${expr}));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }));
}

const require_ = createRequire(import.meta.url);
const DashSignals = require_('../public/newdesign/dashSignals.js');
const GRID_RAW = readFileSync(new URL('../public/newdesign/dashGrid.jsx', import.meta.url), 'utf8');
const GRID = stripComments(GRID_RAW);
const TODAY = stripComments(readFileSync(new URL('../public/newdesign/dashToday.jsx', import.meta.url), 'utf8'));

// Brace-match a named function out of a source file, skipping its parameter list.
function fn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'no function ' + name);
  let p = 0, k = src.indexOf('(', at);
  for (; k < src.length; k++) { const c = src[k]; if (c === '(') p++; else if (c === ')') { p--; if (!p) { k++; break; } } }
  let d = 0, seen = false;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  const out = src.slice(at, k);
  assert.ok(out.length > name.length + 40, 'fn(' + name + ') stopped at the parameter list');
  return out;
}

// ── the control ──────────────────────────────────────────────────────────────
test('the catalogue is rendered by DashGrid itself, outside the faded chrome, on every tab', () => {
  const grid = fn(GRID, 'DashGrid');
  // rendered above the grid element, unconditionally — not inside a `hidden.length` gate
  const at = grid.indexOf('<DgCatalog ');
  assert.ok(at > 0, 'DashGrid no longer renders the catalogue');
  const gridEl = grid.indexOf('className="grid-stack dash-gridstack"');
  assert.ok(at < gridEl, 'the catalogue is not above the grid');
  // ⚠ THE COMPONENT'S OWN `return (`, not chrome()'s — that one is earlier in the body
  // and carries the chrome class by definition, which is exactly the string this
  // assertion must not find between the return and the catalogue.
  const before = grid.slice(grid.lastIndexOf('return ('), at);
  assert.ok(!/hidden(Defaults|Chips)?\.length > 0 &&/.test(before), 'the catalogue is gated on something having been hidden');
  assert.ok(!/dash-wchrome/.test(before), 'the catalogue sits inside the hover-only chrome');
  // and it is fed the rows helper plus the three actions, never a copy of them
  assert.match(grid, /<DgCatalog rows=\{dgCatalogRows\(widgets, hidden\)\} onAdd=\{restore\} onRemove=\{hide\} onReset=\{reset\} \/>/);
});

test('the card chrome is faded, not invisible, until hover', () => {
  // ⚠ opacity:0 was measured on every card of the coach Today; a drag handle nobody can
  // see is a drag handle nobody uses. It is faded now and lights on hover / focus-within.
  const css = GRID_RAW.slice(GRID_RAW.indexOf('s.textContent = `'), GRID_RAW.indexOf('`;', GRID_RAW.indexOf('s.textContent = `')));
  assert.match(css, /\.dash-wchrome\{opacity:\.4;transition:opacity \.12s\}/, 'the chrome is invisible at rest again');
  assert.match(css, /\.grid-stack-item:hover \.dash-wchrome,[^{]*:focus-within \.dash-wchrome\{opacity:1\}/);
  assert.match(css, /@media \(hover:none\)\{\.dash-wchrome\{opacity:1\}\}/, 'a touch screen has no hover — the chrome must be fully visible there');
});

test('the catalogue offers Add only where restore() would accept it, and never for an empty widget', () => {
  const cat = fn(GRID, 'DgCatalog');
  assert.match(cat, /const addable = rows\.filter\(\(r\) => r\.canAdd\)/);
  assert.match(cat, /const onBoard = rows\.filter\(\(r\) => r\.on\)/);
  assert.match(cat, /const waiting = rows\.filter\(\(r\) => r\.empty\)/);
  // an empty widget is listed with its reason and NO control
  assert.match(cat, /waiting\.map\(\(r\) => item\(r, null\)\)/, 'an empty widget got a control');
  // the label says what the control does: a plus while there is something to add
  // the source writes the plus as the literal U+FF0B glyph; the escape form is accepted too
  assert.match(cat, /const label = addable\.length \? "(?:\\uFF0B|\uFF0B) Add widget" : "Widgets"/);
  // it is a real dialog for assistive tech, and it carries the reset
  assert.match(cat, /aria-haspopup="dialog"/);
  assert.match(cat, /role="dialog" aria-label="Widgets"/);
  assert.match(cat, /Reset layout/);
  // and the panel is portaled through the SAME placement hook as the ⚙, at its own width
  assert.match(cat, /useDgPanel\(open, setOpen, boxRef, panelRef, DG_CATALOG_W\)/);
  assert.match(cat, /ReactDOM\.createPortal\(/);
});

test('every write goes through the split, so `hidden` and `added` cannot disagree', () => {
  const grid = fn(GRID, 'DashGrid');
  // persistFromGrid and hide() both write through dgSplitHidden against the CURRENT catalogue
  const persistFrom = grid.slice(grid.indexOf('const persistFromGrid'), grid.indexOf('\n  };', grid.indexOf('const persistFromGrid')));
  assert.match(persistFrom, /\.\.\.dgSplitHidden\(hiddenRef\.current, /, 'persistFromGrid does not write through the split');
  // ⚠ EVERY CALL CARRIES THE SAVED `added` FORWARD, asserted as the ARITY rather than as
  // one spelling of the arguments — an equivalent rewrite passes, and dropping the third
  // argument fails. Without it the split rebuilds `added` from the CURRENT catalogue, so a
  // page on an older build erases an optional widget the member turned on somewhere newer.
  const splitCalls = grid.match(/\.\.\.dgSplitHidden\(([^)]*)\)/g) || [];
  assert.ok(splitCalls.length >= 2, 'the split call sites moved — this guard is reading nothing');
  for (const c of splitCalls) {
    assert.equal(c.split(',').length, 3, 'a dgSplitHidden call drops the saved `added`: ' + c);
  }
  // hide() and restore() both write through persistVisibility — the ONE place a visibility
  // change is persisted — and neither reads the live grid itself.
  const hide = grid.slice(grid.indexOf('const hide ='), grid.indexOf('\n  };', grid.indexOf('const hide =')));
  assert.match(hide, /persistVisibility\(nextHidden\)/, 'hide() does not write through persistVisibility');
  assert.ok(!/grid\.save\(/.test(hide), 'hide() reads the live grid itself — on a phone that is the one-column projection');
  const restore = grid.slice(grid.indexOf('const restore ='), grid.indexOf('\n  };', grid.indexOf('const restore =')));
  assert.match(restore, /persistVisibility\(nextHidden\)/, 'restore() does not write through persistVisibility');
  assert.ok(!/persistFromGrid\(\)/.test(restore), 'restore() writes through persistFromGrid, which refuses a collapsed grid and drops the `added` write with it');
  // ⚠ persistVisibility carries the SAVED items forward when the grid is collapsed to one
  // column: a phone must be able to add and remove widgets (the split moves) without ever
  // writing the projection GridStack is showing it (the items must not).
  const pv = grid.slice(grid.indexOf('const persistVisibility ='), grid.indexOf('\n  };', grid.indexOf('const persistVisibility =')));
  assert.match(pv, /\.\.\.dgSplitHidden\(nextHidden, /, 'persistVisibility does not write through the split');
  assert.match(pv, /grid\.getColumn\(\) === 12/, 'persistVisibility never asks the column count');
  assert.match(pv, /live \? dgMergeLayoutItems\(live, saved, declaredKeysRef\.current\) : \(\(saved && Array\.isArray\(saved\.items\)\) \? saved\.items : \[\]\)/, 'a collapsed grid must carry the SAVED items forward, never its own projection');
  // no write anywhere still spells `hidden: <list>` — that shape would drop `added`
  assert.ok(!/persist\(\{[^}]*\bhidden:\s*(hiddenRef\.current|nextHidden)/.test(grid), 'a write bypasses the split');
  // reset() returns to the DEFAULT board: every optional widget off, and it writes both lists empty
  const reset = grid.slice(grid.indexOf('const reset ='), grid.indexOf('\n  };', grid.indexOf('const reset =')));
  assert.match(reset, /const layout = dgResolveGridLayout\(null, widgets\);/);
  assert.match(reset, /hiddenRef\.current = layout\.hidden;/, 'reset() clears the effective list — which would put every optional widget ON the board');
  assert.match(reset, /setHidden\(layout\.hidden\)/);
  assert.match(reset, /persist\(\{ items: \[\], hidden: \[\], added: \[\] \}\)/);
  // the catalogue ref is kept in step on every render
  assert.match(grid, /widgetsRef\.current = widgets;/);
});

test('the layout write is debounced and a document identical to the last one written is not re-sent', () => {
  // ⚠ MEASURED ON MAIN with a stubbed store: 24 whole-document upserts per page load
  // before anyone touched anything, 22 more per hide — one per GridStack `change`. The
  // document itself is still updated synchronously; only the write is coalesced.
  const grid = fn(GRID, 'DashGrid');
  const persist = grid.slice(grid.indexOf('const persist = '), grid.indexOf('\n  };', grid.indexOf('const persist = ')));
  assert.match(persist, /saveTimerRef\.current = setTimeout\(flushSave, DG_SAVE_DEBOUNCE_MS\)/, 'persist writes on every GridStack event');
  assert.ok(!/saveUserGoals/.test(persist), 'persist calls the store directly');
  assert.match(persist, /docRef\.current = \{ \.\.\.docRef\.current, \[role\]: r \};/, 'the document is no longer updated synchronously');
  const flush = grid.slice(grid.indexOf('const flushSave = '), grid.indexOf('\n  };', grid.indexOf('const flushSave = ')));
  assert.match(flush, /if \(json === lastSavedRef\.current\) return;/, 'an identical document is re-sent');
  assert.match(flush, /lastSavedRef\.current = null/, 'a failed save does not clear the memory, so the same change can never be re-sent');
  assert.match(GRID, /const DG_SAVE_DEBOUNCE_MS = \d+;/);
  // ⚠ AND A FAILED WRITE IS RETRIED, because the debounce took away the accidental ones.
  // On main a failure was covered by the next of twenty-two writes; coalesced to a single
  // settled write, one failure leaves the arrangement unsaved until the member happens to
  // touch the grid again. Bounded, re-reading the CURRENT document rather than replaying a
  // snapshot, superseded by a newer change, and stopped at teardown.
  assert.match(GRID, /const DG_SAVE_RETRY_MS = \[[^\]]+\];/, 'the retry budget is gone');
  const budget = new Function('return ' + (GRID.match(/const DG_SAVE_RETRY_MS = (\[[^\]]+\]);/) || [])[1])();
  assert.ok(Array.isArray(budget) && budget.length >= 1 && budget.every((n) => typeof n === 'number' && n > 0),
    'the retry budget must be a non-empty list of positive delays');
  assert.match(flush, /setTimeout\(flushSave, wait\)/, 'a failed save schedules no retry');
  assert.match(flush, /if \(goneRef\.current \|\| wait == null \|\| saveTimerRef\.current\) return;/,
    'the retry runs after teardown, past its budget, or on top of a newer write');
  assert.match(flush, /else retryRef\.current = 0;/, 'a successful save does not restore the budget');
  assert.match(persist, /retryRef\.current = 0;/, 'a new change does not get a fresh retry budget');
  // the retry re-reads the document rather than replaying the snapshot it failed on
  assert.ok(!/setTimeout\(\(\) => [^)]*json/.test(flush), 'the retry replays a stale snapshot');
  // teardown stops it — set BEFORE the final flush, and re-armed on the next tab
  assert.match(grid, /goneRef\.current = true;[\s\S]{0,200}if \(saveTimerRef\.current\) flushSave\(\);/,
    'teardown does not stop the retry before its own final flush');
  assert.match(grid, /goneRef\.current = false;/, 'goneRef is never re-armed — the first tab change disables every retry');
  // a pending write is flushed when the grid is torn down (tab change) and when the page hides
  assert.match(grid, /window\.addEventListener\("pagehide", onHide\)/);
  assert.match(grid, /if \(saveTimerRef\.current\) flushSave\(\);\s*try \{ if \(gridRef\.current\) gridRef\.current\.destroy/);
});

test('keyboard: focus enters the catalogue panel on open and returns to the button on close', () => {
  const cat = fn(GRID, 'DgCatalog');
  assert.match(cat, /panelRef\.current\.querySelector\("button, a\[href\], select, input, textarea"\)/);
  assert.match(cat, /first\.focus\(\)/);
  assert.match(cat, /boxRef\.current\.querySelector\("button"\)/);
  assert.match(cat, /\}, \[open, box\]\);/);
});

test("every control the Today page draws clears the repo's 24px floor", () => {
  // ⚠ MEASURED IN CHROMIUM, NOT READ: at 1440 the pulse's pin flag came back 20x27 and the
  // business summary's link 233x12 — both pre-existing, both on the page this change asserts
  // a floor for. A guard covering only the widgets added here would be a claim about seven
  // elements on a page with two that fail. WCAG 2.5.8 AA is 24px, never Apple's 44pt.
  assert.match(fn(TODAY, 'TriagePulsePanel'), /padding: "7px 4px", minWidth: 24,/, "the pulse's pin flag is under the floor again");
  assert.match(fn(TODAY, 'DashBusinessSummary'), /\.\.\.DASH_MONO_LINK, marginTop: 12/, 'the business link is under the floor again');
  // ⚠ AND THE TOKEN IS DECLARED ABOVE EVERY CONSUMER. A module-scope `const` is not hoisted,
  // so a consumer above it is safe only while nothing calls that function during evaluation —
  // a fact about the call graph, not about the line. (The same fix LB_TO_KG_BACKEND needed.)
  assert.ok(TODAY.indexOf('const DASH_MONO_LINK') < TODAY.indexOf('function DashBusinessSummary'), 'DASH_MONO_LINK is declared below a consumer');
  assert.ok(TODAY.indexOf('const DASH_INK50') < TODAY.indexOf('const DASH_MONO_EYEBROW'), 'DASH_INK50 is declared below the token that reads it');
});

test('in-card text links carry the 24px hit area the chrome has', () => {
  assert.match(TODAY, /const DASH_MONO_LINK = \{ \.\.\.DASH_MONO_EYEBROW, display: "inline-flex", alignItems: "center", minHeight: 24, margin: "-5px 0"/);
  assert.match(fn(TODAY, 'DashProgramsEndingPanel'), /style=\{\{ \.\.\.DASH_MONO_LINK, color: "#2ee0c4" \}\}>Write the next \{noun\} →<\/a>/);
  assert.match(fn(TODAY, 'DashRosterStatusPanel'), /minHeight: 24, margin: "-5px 0" \}\}>Open the roster →<\/a>/);
});

// ── the pure rows helper, driven through the shipped copy ────────────────────
test('dgCatalogRows: a hidden default is addable, an un-added optional is addable, an empty one is neither', () => {
  const rows = new Function(fn(GRID, 'dgCatalogRows') + '\nreturn dgCatalogRows;')();
  const ws = [
    { key: 'pulse', title: 'Client attention', blurb: 'who' },
    { key: 'week', title: 'Week ahead', optional: true, blurb: 'seven days' },
    { key: 'movers', title: 'Top movers', optional: true, empty: true, emptyWhy: 'appears once clients share a score' },
  ];
  const out = rows(ws, ['pulse', 'week', 'movers']);
  assert.deepEqual(out.map((r) => [r.key, r.on, r.canAdd, r.empty]), [['pulse', false, true, false], ['week', false, true, false], ['movers', false, false, true]]);
  assert.equal(out[2].why, 'appears once clients share a score');
  assert.equal(out[1].blurb, 'seven days');
});

// ── the Today wiring ─────────────────────────────────────────────────────────
const OPTIONAL = ['week', 'status', 'movers', 'anniversaries', 'revenue', 'ending', 'notes'];

test('the seven optional Today widgets are declared optional, with a blurb, and stay in the array', () => {
  const page = fn(TODAY, 'CoachDashboardPage');
  const arr = page.slice(page.indexOf('const gridWidgets = ['), page.indexOf('\n  ];', page.indexOf('const gridWidgets = [')));
  for (const key of OPTIONAL) {
    const at = arr.indexOf('{ key: "' + key + '"');
    assert.ok(at > 0, key + ' is not declared on the Today grid');
    const entry = arr.slice(at, arr.indexOf('render: () =>', at));
    assert.match(entry, /optional: true/, key + ' is not optional — it would land on every coach\'s board unasked');
    assert.match(entry, /blurb: "[^"]{10,}"/, key + ' has no catalogue blurb');
  }
  // ⚠ NONE OF THEM IS REGISTERED CONDITIONALLY — the class tests/dashboard-widget-visibility
  // closes for every page; restated here for the seven because the AST sweep reports a
  // line number, not a key.
  for (const key of OPTIONAL) assert.ok(!new RegExp('\\?\\s*\\{ key: "' + key + '"').test(arr), key + ' is registered conditionally');
});

test('the data widgets declare emptiness from the SAME derivation their panel renders', () => {
  const page = fn(TODAY, 'CoachDashboardPage');
  // derived once per render, above the array…
  for (const [name, fnName] of [['weekAhead', 'dashWeekAhead'], ['rosterStatus', 'dashRosterStatus'], ['movers', 'dashTopMovers'], ['tenureMarks', 'dashTenureMilestones'], ['revenue', 'dashRevenueByClient'], ['ending', 'dashProgramsEnding']]) {
    assert.match(page, new RegExp('const ' + name + ' = sigOk \\? DashSignals\\.' + fnName + '\\('), name + ' is not derived through the stale-module guard');
  }
  // …and each entry's `empty` reads that value, so the catalogue and the card agree
  const arr = page.slice(page.indexOf('const gridWidgets = ['));
  assert.match(arr, /key: "week"[^}]*empty: !weekAhead/);
  assert.match(arr, /key: "status"[^}]*empty: !rosterStatus/);
  assert.match(arr, /key: "movers"[^}]*empty: !movers \|\| movers\.known === 0/);
  assert.match(arr, /key: "anniversaries"[^}]*empty: !tenureMarks \|\| tenureMarks\.total === 0 \|\| tenureMarks\.unknown === tenureMarks\.total/);
  assert.match(arr, /key: "revenue"[^}]*empty: !revenue \|\| revenue\.total === 0/);
  assert.match(arr, /key: "ending"[^}]*empty: !ending \|\| ending\.total === 0 \|\| ending\.unknown === ending\.total/);
  // ⚠ THE GUARD IS A FEATURE TEST, NOT A VERSION STRING. dashSignals.js is a plain
  // <script> with a hand-typed ?v=, so a cached copy can predate these functions; the
  // widgets degrade to `empty` with a reason rather than throwing at render.
  assert.match(page, /const sigOk = \["dashWeekAhead", "dashRosterStatus", "dashTopMovers", "dashTenureMilestones", "dashRevenueByClient", "dashProgramsEnding"\]\s*\.every\(\(fn\) => typeof DashSignals\[fn\] === "function"\)/);
  for (const name of ['dashWeekAhead', 'dashRosterStatus', 'dashTopMovers', 'dashTenureMilestones', 'dashRevenueByClient', 'dashProgramsEnding']) {
    assert.equal(typeof DashSignals[name], 'function', name + ' is not exported by dashSignals.js');
  }
});

test('the two shells ask for the signals module under a key newer than the derivations', () => {
  // ⚠ THE PRECOMPILE REWRITES text/babel TAGS ONLY, so this plain <script>'s cache key is
  // whatever a human last typed. Both shells that render Today must ask for a copy that
  // carries dashWeekAhead & co, or the widgets degrade to empty on a warm cache.
  for (const f of ['TrainerApp.html', 'NutritionistApp.html']) {
    const html = readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8');
    const m = /dashSignals\.js\?v=(\d{8})/.exec(html);
    assert.ok(m, f + ' does not load dashSignals.js with a dated key');
    assert.ok(Number(m[1]) >= 20260921, f + ' asks for a signals module older than the catalogue widgets (' + m[1] + ')');
  }
});

test('in-card links route inside the shell, and the notes write through the account store', () => {
  const href = new Function(fn(TODAY, 'dashTabHref') + '\nreturn dashTabHref;')();
  // no shell on this window → the shell document, never a bare hash into nowhere
  assert.equal(href('week', 'trainer'), 'TrainerApp.html#week');
  assert.equal(href('plans', 'nutritionist'), 'NutritionistApp.html#plans');
  // the two panels that link out of a card go through it — a raw legacy href would cost
  // two page loads from inside the shell (the R19 sweep)
  assert.match(fn(TODAY, 'DashRosterStatusPanel'), /href=\{dashTabHref\("clients", role\)\}/);
  assert.match(fn(TODAY, 'DashProgramsEndingPanel'), /href=\{dashTabHref\(plans, role\)\}/);
  // ⚠ QUICK ACTIONS IS GONE BY RULING (owner, 2026-09-21: "drop the ones you said drop") —
  // five of its six links were the sidebar. It must not come back as a widget.
  assert.ok(!/DashQuickActionsPanel|key: "actions"/.test(TODAY), 'the Quick actions widget is back');
  // the notes panel: one attempt per draft, debounced, through the store's apply — and an
  // emptied note DELETES the key rather than storing ""
  const notes = fn(TODAY, 'DashNotesPanel');
  assert.match(notes, /askedRef\.current = \{ acct: acct, text: text \};/, 'the attempt is not recorded against the account that made it');
  assert.match(notes, /if \(\w+\.trim\(\) === ""\) delete out\[key\]; else out\[key\] = \w+;/, 'an emptied note must DELETE the key, not store ""');
  assert.match(notes, /const writable = kind === "ready" \|\| kind === "error";/);
  assert.match(notes, /setTimeout\(\(\) => writeNote\(mine\), 700\)/, 'the 700ms typing debounce moved');
  // ⚠ THE PENDING WRITE IS CLEARED BEFORE THE EFFECT DECIDES, or a draft the member typed
  // and then typed BACK to its stored value stays pending and is flushed over the note on
  // unmount — the flush below would undo an edit rather than save one.
  assert.match(notes, /pendingRef\.current = null;[\s\S]{0,120}if \(mine == null \|\| !writable\)/,
    'the pending write is not cleared before the effect decides what is pending');
  // ⚠ A DIFFERENT ACCOUNT — INCLUDING SIGNED OUT — GETS A CLEAN SLATE, and the draft carries
  // the account it was typed under rather than being cleared by a ref compared during render.
  // The retired shape failed twice: it only fired on a non-null change, so a sign-out left the
  // previous coach's note in the box, and a render-phase ref leaks from work React discards
  // (#2046). Both are asserted as ABSENCES, because re-introducing either is the regression.
  assert.match(notes, /draft\.acct == null \|\| draft\.acct === acct/, 'the draft no longer carries its account');
  assert.ok(!/knownRef/.test(notes), 'the render-phase account ref is back');
  assert.ok(!/setDraft\(null\)/.test(notes), 'the draft is cleared by a render-phase setState again');
  // ⚠ AND THE PENDING WRITE SURVIVES LEAVING THE SCREEN. Hiding the widget unmounts this
  // panel and so does switching tab; the draft lives nowhere else.
  assert.match(notes, /window\.addEventListener\("pagehide", flush\)/, 'a note edited inside the debounce is lost on pagehide');
  assert.match(notes, /removeEventListener\("pagehide", flush\); flush\(\);/, 'the unmount flush is gone — hiding the widget loses the last 700ms of typing');
});

// ── the derivations ──────────────────────────────────────────────────────────
const at = (y, m, d, h) => new Date(y, m - 1, d, h || 12);

test('week ahead: seven local days from today, counts and earliest time per day, unreadable dates counted', () => {
  const now = at(2026, 9, 21, 15);
  const events = [
    { date: '2026-09-21', time: '09:00' }, { date: '2026-09-21', time: '07:30' },
    { date: '2026-09-27', time: '10:00' },            // the last day of the window
    { date: '2026-09-28', time: '08:00' },            // day 8 — outside
    { date: '2026-09-20', time: '08:00' },            // yesterday — outside
    { date: 'not a date', time: '08:00' }, { time: '11:00' }, null,
  ];
  const w = DashSignals.dashWeekAhead(events, now);
  assert.equal(w.days.length, 7);
  assert.deepEqual(w.days.map((d) => d.date), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  assert.deepEqual(w.days.map((d) => d.count), [2, 0, 0, 0, 0, 0, 1]);
  assert.equal(w.days[0].first, '07:30', 'the earliest time, not the first seen');
  assert.equal(w.days[0].today, true);
  assert.equal(w.days[0].dow, 'Mon');
  assert.equal(w.total, 3);
  assert.equal(w.skipped, 3, 'entries with no readable date are counted, not dropped silently');
  assert.equal(w.busiest.date, '2026-09-21');
  // a time that is not HH:MM never becomes `first`
  assert.equal(DashSignals.dashWeekAhead([{ date: '2026-09-21', time: 'noon' }], now).days[0].first, null);
  // an empty calendar is seven empty days, not an error
  assert.deepEqual(DashSignals.dashWeekAhead(null, now).days.map((d) => d.count), [0, 0, 0, 0, 0, 0, 0]);
});

test('week ahead crosses a DST fall-back on the calendar, not on the clock', () => {
  // ⚠ 2026-11-01 is the US fall-back: the local day is 25 hours long. A window built by
  // adding 86,400,000 ms per day lands on 2026-11-01 twice and never reaches the 5th.
  // Driven in New York; UTC has no such day and would pass the defect.
  const days = inZone('America/New_York', 's.dashWeekAhead([], new Date(2026, 9, 30, 12)).days.map(function (d) { return d.date; })');
  assert.deepEqual(days, ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  // …and the control: the zone really is in force in the child, or the test above is UTC in disguise
  assert.equal(inZone('America/New_York', 'new Date(2026, 10, 1, 12).getTimezoneOffset()'), 300);
  assert.equal(inZone('America/New_York', 'new Date(2026, 9, 31, 12).getTimezoneOffset()'), 240);
});

test('roster by status buckets the pulse by severity, counts the new, and is null when the feed is', () => {
  const feed = [
    { client: { profile: { name: 'A', isNew: true } }, severity: 'red' },
    { client: { profile: { name: 'B' } }, severity: 'amber' },
    { client: { profile: { name: 'C' } }, severity: 'green' },
    { client: { profile: { name: 'D' } }, severity: 'unknown' },
    { client: { profile: { name: 'E' } }, severity: 'purple' },   // not a severity this build knows
    { client: null, severity: 'red' },
  ];
  const s = DashSignals.dashRosterStatus(feed);
  assert.deepEqual([s.red, s.amber, s.green, s.unknown], [['A', 'Client'], ['B'], ['C'], ['D', 'E']]);
  assert.equal(s.fresh, 1);
  assert.equal(s.total, 6);
  assert.equal(DashSignals.dashRosterStatus(null), null);
  assert.deepEqual(DashSignals.dashRosterStatus([]).total, 0);
  // ⚠ 'fresh' and 'total' are counts, not buckets: a severity spelled like one of them
  // must not push a name into a number.
  const odd = DashSignals.dashRosterStatus([{ client: { profile: { name: 'X' } }, severity: 'total' }]);
  assert.equal(odd.total, 1);
  assert.deepEqual(odd.unknown, ['X']);
});

test('top movers use the roster cell\'s own reading: two COMPLETE weeks, the partial week never a delta', () => {
  const hist = (pts, partialLast) => pts.map((p, i) => ({ weekOf: 'w' + i, points: p, partial: partialLast && i === pts.length - 1 }));
  const clients = [
    { profile: { id: 1, name: 'Up A' }, shapeScoreHistory: hist([50, 60, 70]) },          // +10
    { profile: { id: 2, name: 'Up B' }, shapeScoreHistory: hist([50, 60, 62, 20], true) }, // +2 (the 20 is the partial week)
    { profile: { id: 3, name: 'Down' }, shapeScoreHistory: hist([80, 60]) },              // −20
    { profile: { id: 4, name: 'Flat' }, shapeScoreHistory: hist([60, 60]) },              // 0 — neither
    { profile: { id: 5, name: 'One week' }, shapeScoreHistory: hist([60]) },              // no delta
    { profile: { id: 6, name: 'Unshared' }, shapeScoreHistory: null },
    null,
  ];
  const m = DashSignals.dashTopMovers(clients, 3);
  assert.deepEqual(m.up.map((x) => [x.name, x.delta]), [['Up A', 10], ['Up B', 2]]);
  assert.deepEqual(m.down.map((x) => [x.name, x.delta]), [['Down', -20]]);
  assert.equal(m.up[1].partial, true, 'the points shown for Up B are this week so far, and say so');
  assert.equal(m.up[1].points, 20);
  assert.equal(m.known, 4, 'clients with two complete weeks');
  assert.equal(m.total, 7);
  // n caps each side
  assert.equal(DashSignals.dashTopMovers(clients, 1).up.length, 1);
  assert.deepEqual(DashSignals.dashTopMovers([], 3), { up: [], down: [], known: 0, total: 0 });
});

test('anniversaries: the NEXT tenure mark per client, within the horizon, unreadable starts counted', () => {
  const now = at(2026, 9, 21);
  const day = (n) => { const d = new Date(now.getTime()); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const clients = [
    { profile: { name: 'Year' }, payments: { joinedAt: day(363) } },        // 1 year in 2 days
    { profile: { name: 'Today' }, payments: { joinedAt: day(30) } },        // 1 month today
    { profile: { name: 'Far' }, payments: { joinedAt: day(100) } },         // 6 months in 80 days — past the horizon
    { profile: { name: 'Legend' }, payments: { joinedAt: day(3000) } },     // past the last mark
    { profile: { name: 'Future' }, payments: { joinedAt: day(-3) } },       // a start date in the future is unreadable
    { profile: { name: 'None' }, payments: {} },
    { profile: { name: 'Bad' }, payments: { joinedAt: 'yesterday-ish' } },
    { profile: { name: 'Zero' }, payments: { joinedAt: 0 } },               // falsy, and not a date
  ];
  const r = DashSignals.dashTenureMilestones(clients, now, 30);
  assert.deepEqual(r.soon.map((h) => [h.name, h.label, h.inDays, h.on]), [['Today', '1 month', 0, '2026-09-21'], ['Year', '1 year', 2, '2026-09-23']]);
  assert.deepEqual([r.later.name, r.later.label, r.later.inDays], ['Far', '6 months', 80]);
  assert.equal(r.unknown, 4, 'Future, None, Bad and Zero');
  assert.equal(r.beyond, 1);
  assert.equal(r.total, 8);
  // a client exactly ON a mark is "today", and the day after is on to the next mark
  assert.equal(DashSignals.dashTenureMilestones([{ profile: { name: 'X' }, payments: { joinedAt: day(31) } }], now).soon.length, 0);
  assert.equal(DashSignals.dashTenureMilestones([{ profile: { name: 'X' }, payments: { joinedAt: day(31) } }], now).later.label, '3 months');
});

test('anniversaries count tenure on the local calendar across a spring-forward', () => {
  // ⚠ Joined 2026-02-14, asked on 2026-03-16: exactly 30 calendar days, and the US
  // spring-forward (2026-03-08) sits inside the span with NO fall-back to cancel it, so a
  // millisecond quotient reads 29 days 23 hours, floors to 29, and the one-month mark
  // lands tomorrow instead of today. Driven in New York.
  // ⚠ A FULL YEAR IS THE WRONG FIXTURE FOR THIS — the first draft of this test asked about
  // 2025-03-01 → 2026-03-01 and its control read 365, because a whole year contains BOTH
  // transitions and the hour lost in March comes back in November. The defect only shows
  // on a span that crosses one transition and not the other, which is exactly the
  // 30 / 90 / 180-day marks in spring and autumn.
  const r = inZone('America/New_York', "s.dashTenureMilestones([{ profile: { name: 'X' }, payments: { joinedAt: '2026-02-14' } }], new Date(2026, 2, 16, 12), 30)");
  assert.deepEqual(r.soon.map((h) => [h.label, h.inDays, h.on]), [['1 month', 0, '2026-03-16']]);
  assert.equal(inZone('America/New_York', 's._internals.calDays(new Date(2026, 1, 14), new Date(2026, 2, 16))'), 30);
  assert.equal(inZone('America/New_York', 's._internals.calDays(new Date(2026, 2, 7, 23), new Date(2026, 2, 9, 1))'), 2, 'a 23-hour day is still one day');
  // and the millisecond quotient the fix replaced really does come up short there — the
  // positive control, without which a UTC run of this file would prove nothing
  assert.equal(inZone('America/New_York', 's._internals.daysBetween(new Date(2026, 1, 14), new Date(2026, 2, 16))'), 29);
  // the zone really moved: 2026-03-08 is the transition, so the offsets differ either side
  assert.equal(inZone('America/New_York', 'new Date(2026, 1, 14, 12).getTimezoneOffset()'), 300);
  assert.equal(inZone('America/New_York', 'new Date(2026, 2, 16, 12).getTimezoneOffset()'), 240);
  // and a whole year is exact either way — the control that says WHY the fixture above is a month
  assert.equal(inZone('America/New_York', 's._internals.daysBetween(new Date(2025, 2, 1), new Date(2026, 2, 1))'), 365);
});

test('programs ending: whole weeks after this one, the last week first, paused and blockless counted apart', () => {
  const c = (name, program) => ({ profile: { name, id: name.toLowerCase() }, program });
  const r = DashSignals.dashProgramsEnding([
    c('Cut', { name: 'Cut', week: 12, weeks: 12 }),            // last week → 0 left
    c('Base', { name: 'Base', week: 11, weeks: 12 }),          // 1 left
    c('Long', { name: 'Long', week: 9, weeks: 12 }),           // 3 left — inside the default horizon
    c('Mid', { name: 'Mid', week: 8, weeks: 12 }),             // 4 left — later
    c('Rest', { name: 'Rest', week: 12, weeks: 12, paused: true }),
    c('None', null),
    c('Bad', { name: 'Bad', week: 3, weeks: 0 }),              // a block with no length is unknown, not "ending"
    c('Str', { name: 'Str', week: '7', weeks: '8' }),          // numeric strings are numbers
  ]);
  assert.deepEqual(r.soon.map((x) => [x.name, x.left, x.week, x.weeks]), [['Cut', 0, 12, 12], ['Base', 1, 11, 12], ['Str', 1, 7, 8], ['Long', 3, 9, 12]]);
  assert.deepEqual([r.later, r.paused, r.unknown, r.total, r.weeks], [1, 1, 2, 8, 3]);
  // the horizon is a parameter, and a tighter one drops the 3-left client
  assert.deepEqual(DashSignals.dashProgramsEnding([c('Long', { week: 9, weeks: 12 })], 2).soon, []);
  assert.equal(DashSignals.dashProgramsEnding([c('Long', { week: 9, weeks: 12 })], 2).later, 1);
  // a week past the length is clamped, never negative; an empty roster is empty, not unknown
  assert.equal(DashSignals.dashProgramsEnding([c('Over', { week: 14, weeks: 12 })]).soon[0].left, 0);
  assert.deepEqual(DashSignals.dashProgramsEnding([]), { soon: [], later: 0, paused: 0, unknown: 0, total: 0, weeks: 3 });
  // the demo roster lights it: two clients inside three weeks, nobody dropped
  const demo = DashSignals.dashProgramsEnding(DashSignals.buildMockClients());
  assert.ok(demo.soon.length >= 1 && demo.soon.length + demo.later + demo.paused + demo.unknown === demo.total);
});

test('revenue by client: a null read is COUNTED, a zero is a value, the rest sort by amount', () => {
  const clients = [
    { profile: { name: 'Big' }, payments: { mrrCents: 18000 } },
    { profile: { name: 'Mid' }, payments: { mrrCents: 9000 } },
    { profile: { name: 'Free' }, payments: { mrrCents: 0 } },
    { profile: { name: 'Failed' }, payments: { mrrCents: null } },
    { profile: { name: 'Odd' }, payments: { mrrCents: [] } },              // Number([]) is 0 — refused, not measured
    { profile: { name: 'Neg' }, payments: { mrrCents: -5 } },
    { profile: { name: 'Nopay' } },
  ];
  const r = DashSignals.dashRevenueByClient(clients, 5);
  assert.deepEqual(r.rows.map((x) => [x.name, x.cents]), [['Big', 18000], ['Mid', 9000], ['Free', 0]]);
  assert.equal(r.rows[0].share, 18000 / 27000);
  assert.equal(r.known, 3);
  assert.equal(r.unknown, 4, 'Failed, Odd, Neg and Nopay are unread, never $0');
  assert.equal(r.sumCents, 27000);
  assert.equal(r.total, 7);
  // n caps the rows but not the sum or the count
  const top1 = DashSignals.dashRevenueByClient(clients, 1);
  assert.equal(top1.rows.length, 1);
  assert.equal(top1.known, 3);
  assert.equal(top1.sumCents, 27000);
  assert.deepEqual(DashSignals.dashRevenueByClient(undefined).rows, []);
});

test('the demo roster lights every data widget, so the signed-out preview shows what each one is', () => {
  // ⚠ A PREVIEW THAT LISTS "nothing to show yet" FOR EVERY OPTIONAL WIDGET WOULD BE A
  // CATALOGUE OF EMPTY BOXES. buildMockClients carries score histories, join dates and
  // subscriptions on purpose; if a persona loses one of them, this is where it shows.
  const now = new Date();
  const clients = DashSignals.buildMockClients(now);
  const feed = DashSignals.getTriageFeed('trainer', clients, now);
  assert.ok(DashSignals.dashRosterStatus(feed).total >= 5);
  assert.ok(DashSignals.dashTopMovers(clients).known >= 3, 'the demo personas no longer carry two complete weeks of score');
  const rev = DashSignals.dashRevenueByClient(clients);
  assert.equal(rev.unknown, 0, 'a demo persona lost its subscription row');
  assert.ok(rev.sumCents > 0);
  const marks = DashSignals.dashTenureMilestones(clients, now);
  assert.equal(marks.unknown, 0, 'a demo persona lost its join date');
});
