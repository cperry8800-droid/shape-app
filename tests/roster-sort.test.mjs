// Roster sorting (review 2026-09-09, R15 · the control R16's memory was waiting on).
//
// ⚠ EVERY RULE HERE IS ABOUT ORDERING A COLUMN THAT CONTAINS THREE KINDS OF THING: a
// measured value, a measured ZERO, and "we could not read it". The cells render them
// as "$1.2k/mo", "$0/mo" and "Not shared", and the whole point of a comparator is that
// it never sees those strings — sorting the labels puts $999 above $1.2k and files an
// unreadable client as the cheapest one on the roster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = readFileSync(new URL('../public/newdesign/dashRoster.jsx', import.meta.url), 'utf8');

function fn(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let d = 0, seen = false, k = at;
  for (; k < SRC.length; k++) { const c = SRC[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  return SRC.slice(at, k);
}
const CONSTS = SRC.slice(SRC.indexOf('const DASH_ROSTER_SORTS'), SRC.indexOf('// A stable, unknown-last comparator'));
// A minimal stand-in for the two collaborators, so the SHIPPED comparators run.
const DashSignals = { scoreWeekReading: (h) => (Array.isArray(h) && h.length ? { points: h[h.length - 1].points } : null) };
// ⚠ THE REAL `dashDaysSince`, NOT A RESTATEMENT OF IT. This was a one-line local copy
// — `Math.max(0, Math.floor((NOW - Date.parse(d)) / 86400000))` — and it kept returning
// NaN for an unreadable date after the shipped one was fixed to return null, so the
// suite was asserting against a function nobody ships. A guard that runs its own version
// of the code under test is measuring nothing.
const dashDaysSince = new Function('return ' + fn('dashDaysSince').replace('function dashDaysSince', 'function') + ';')();
const { DASH_ROSTER_SORTS, DASH_ROSTER_SORT_KEYS, dashRosterSorted } = new Function(
  'DashSignals', 'dashDaysSince',
  CONSTS + '\n' + fn('dashRosterSorted') + '\nreturn { DASH_ROSTER_SORTS, DASH_ROSTER_SORT_KEYS, dashRosterSorted };'
)(DashSignals, dashDaysSince);

test('the suite is running the shipped comparators', () => {
  assert.equal(typeof dashRosterSorted, 'function');
  assert.ok(DASH_ROSTER_SORT_KEYS.length >= 8, 'the sort map lifted as a stub');
  assert.ok(DASH_ROSTER_SORT_KEYS.includes('triage'));
});

const rec = (name, over) => ({ client: { profile: { name }, ...over } });
const names = (rows) => rows.map((r) => r.client.profile.name);
const pay = (o) => ({ payments: { mrrCents: null, joinedAt: null, lastSessionAt: null, ...o } });

// ── the rule the whole thing exists for ─────────────────────────────────────
test('an unknown sorts LAST in BOTH directions — it is not a small value', () => {
  // ⚠ SORTING REVENUE ASCENDING MUST NOT PRESENT A CLIENT WHOSE SUBSCRIPTIONS READ
  // FAILED AS THE ONE WHO PAYS LEAST. "Not shared" is a statement about the read.
  const rows = [
    rec('rich', pay({ mrrCents: 120000 })),
    rec('unknown-a', { payments: null }),
    rec('poor', pay({ mrrCents: 999 })),
    rec('unknown-b', pay({ mrrCents: null })),
  ];
  assert.deepEqual(names(dashRosterSorted(rows, 'revenue', 'desc')), ['rich', 'poor', 'unknown-a', 'unknown-b']);
  assert.deepEqual(names(dashRosterSorted(rows, 'revenue', 'asc')), ['poor', 'rich', 'unknown-a', 'unknown-b']);
});

test('a measured ZERO is a value, and sorts as one', () => {
  // A client on no paid plan is a real answer about a real client (the roster renders
  // "$0/mo", not "Not shared"), so ascending must put them first — and descending must
  // put them last of the KNOWN rows, still ahead of every unknown.
  const rows = [rec('zero', pay({ mrrCents: 0 })), rec('unknown', { payments: null }), rec('paid', pay({ mrrCents: 9900 }))];
  assert.deepEqual(names(dashRosterSorted(rows, 'revenue', 'asc')), ['zero', 'paid', 'unknown']);
  assert.deepEqual(names(dashRosterSorted(rows, 'revenue', 'desc')), ['paid', 'zero', 'unknown']);
});

test('comparators read the VALUE, never the rendered label', () => {
  // ⚠ THE THREE ORDERINGS A STRING SORT GETS WRONG, each pinned against the cell text
  // the roster actually draws for that row.
  // "$999" vs "$1.2k": text puts $999 first descending.
  const money = [rec('k', pay({ mrrCents: 120000 })), rec('hundreds', pay({ mrrCents: 99900 }))];
  assert.deepEqual(names(dashRosterSorted(money, 'revenue', 'desc')), ['k', 'hundreds']);
  // "9mo" vs "2.0y": text puts 9mo first descending.
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const tenure = [rec('nine-months', pay({ joinedAt: day(270) })), rec('two-years', pay({ joinedAt: day(730) }))];
  assert.deepEqual(names(dashRosterSorted(tenure, 'tenure', 'desc')), ['two-years', 'nine-months']);
  // "9d" vs "30d": text puts 9d first descending.
  const stale = [rec('nine', pay({ lastSessionAt: day(9) })), rec('thirty', pay({ lastSessionAt: day(30) }))];
  assert.deepEqual(names(dashRosterSorted(stale, 'consult', 'desc')), ['thirty', 'nine']);
});

test('"Never contacted" is the STALEST, not an unknown', () => {
  // ⚠ THE DISTINCTION THE CONTACT CELL ALREADY MAKES, carried into the ordering: a
  // thread that exists and has never been used is a KNOWN fact about the coach's own
  // inbox — and it is exactly the client the sort is meant to surface. Filing them
  // with the unreadable rows would bury them.
  const rows = [
    rec('recent', { lastContact: { trainer: new Date(Date.now() - 86400000).toISOString() } }),
    rec('never', { lastContact: { trainer: null } }),
    rec('no-thread', {}),
    rec('old', { lastContact: { trainer: new Date(Date.now() - 40 * 86400000).toISOString() } }),
  ];
  assert.deepEqual(names(dashRosterSorted(rows, 'contact', 'desc')), ['never', 'old', 'recent', 'no-thread']);
  assert.deepEqual(names(dashRosterSorted(rows, 'contact', 'asc')), ['recent', 'old', 'never', 'no-thread']);
  // and the role decides which leg is read
  const near = new Date(Date.now() - 86400000).toISOString();
  const far = new Date(Date.now() - 70 * 86400000).toISOString();
  const both = [rec('n', { lastContact: { trainer: near, nutritionist: far } }),
                rec('t', { lastContact: { trainer: far, nutritionist: near } })];
  assert.deepEqual(names(dashRosterSorted(both, 'contact', 'desc', 'trainer')), ['t', 'n']);
  assert.deepEqual(names(dashRosterSorted(both, 'contact', 'desc', 'nutritionist')), ['n', 't']);
});

test('the sort is STABLE, so ties keep the order the engine put them in', () => {
  // ⚠ THE TRIAGE ORDER IS THE SEVERITY ORDER. An unstable sort would shuffle a block of
  // equal-revenue clients on every render and lose the one signal the roster leads with.
  const rows = ['a', 'b', 'c', 'd'].map((n) => rec(n, pay({ mrrCents: 5000 })));
  assert.deepEqual(names(dashRosterSorted(rows, 'revenue', 'desc')), ['a', 'b', 'c', 'd']);
  assert.deepEqual(names(dashRosterSorted(rows, 'revenue', 'asc')), ['a', 'b', 'c', 'd']);
  // unknowns keep their order too
  const unk = ['x', 'y', 'z'].map((n) => rec(n, { payments: null }));
  assert.deepEqual(names(dashRosterSorted(unk, 'revenue', 'desc')), ['x', 'y', 'z']);
});

test('the default and a retired key both pass the rows through untouched', () => {
  // ⚠ A KEY THIS BUILD NO LONGER HAS MUST NOT EMPTY OR SCRAMBLE THE ROSTER. The
  // remembered value is validated at the hook too, but a table handed a stale key
  // directly has to survive it.
  const rows = [rec('c', pay({ mrrCents: 1 })), rec('a', pay({ mrrCents: 9 })), rec('b', pay({ mrrCents: 5 }))];
  for (const k of ['triage', 'retired-column', undefined, null, '']) {
    assert.deepEqual(names(dashRosterSorted(rows, k, 'desc')), ['c', 'a', 'b'], String(k));
  }
  // and it is the same array, not a copy that lost a row
  assert.equal(dashRosterSorted(rows, 'triage', 'desc').length, 3);
  assert.deepEqual(names(dashRosterSorted([], 'revenue', 'desc')), []);
});

test('name sorts alphabetically and case-insensitively', () => {
  const rows = [rec('zoe'), rec('Ada'), rec('bo')];
  assert.deepEqual(names(dashRosterSorted(rows, 'name', 'asc')), ['Ada', 'bo', 'zoe']);
  assert.deepEqual(names(dashRosterSorted(rows, 'name', 'desc')), ['zoe', 'bo', 'Ada']);
});

test('every value column has a comparator and every comparator answers null for an empty record', () => {
  // ⚠ A COMPARATOR THAT THROWS ON A SPARSE RECORD TAKES THE WHOLE ROSTER DOWN, and the
  // live record is nullable in every leg by design.
  const bare = rec('bare', {});
  let checked = 0;
  for (const [k, spec] of Object.entries(DASH_ROSTER_SORTS)) {
    if (!spec) { assert.equal(k, 'triage'); continue; }
    checked += 1;
    assert.equal(typeof spec.of, 'function', k + ' has no comparator');
    assert.ok(spec.dir === 'asc' || spec.dir === 'desc', k + ' has no natural direction');
    assert.ok(spec.label, k + ' has no label');
    const v = spec.of(bare, 'trainer');
    assert.ok(v == null || typeof v === 'string', k + ' invented a value for an empty record: ' + v);
  }
  assert.ok(checked >= 8, 'only ' + checked + ' comparators were checked');
});

// ── a date we cannot read (CodeRabbit, #2031) ───────────────────────────
test('dashDaysSince has ONE shape for "no answer" — null, never NaN', () => {
  // ⚠ IT USED TO HAVE TWO: null for a falsy input and NaN for an unparseable one,
  // because `Math.max(0, Math.floor(NaN))` is NaN. Every caller then had to remember the
  // second case separately and three of the four did not, so a malformed date rendered
  // as **"NaNd ago"** on the roster. `dashTenureLabel` had the guard, with a comment
  // explaining exactly this — which is the tell: a lesson written at one call site is
  // not a fix for the other three.
  const since = new Function('return ' + fn('dashDaysSince').replace('function dashDaysSince', 'function') + ';')();
  for (const bad of [null, undefined, '', 'not-a-date', 'garbage', {}, [], NaN]) {
    assert.equal(since(bad), null, JSON.stringify(bad) + ' produced ' + since(bad));
  }
  assert.equal(typeof since(new Date().toISOString()), 'number');
  assert.equal(since(new Date(Date.now() - 3 * 86400000).toISOString()), 3);
});

test('every date cell renders an honest empty rather than the arithmetic that failed', () => {
  // Driven through the shipped label functions, so a NaN anywhere shows up as text.
  const labels = new Function(
    fn('dashDaysSince') + '\n' + fn('dashLastLogLabel') + '\n' + fn('dashConsultLabel') + '\n' +
    fn('dashContactLabel') + '\n' + fn('dashTenureLabel') +
    '\nreturn { dashLastLogLabel, dashConsultLabel, dashContactLabel, dashTenureLabel };')();
  const BAD = 'not-a-date';
  const cases = [
    ['lastLog', labels.dashLastLogLabel({ foodLogs: { lastLoggedOn: BAD, daysLogged7d: null } })],
    ['consult', labels.dashConsultLabel({ payments: { lastSessionAt: BAD } })],
    ['contact', labels.dashContactLabel({ lastContact: { trainer: BAD } }, 'trainer')],
    ['tenure', labels.dashTenureLabel({ payments: { joinedAt: BAD } })],
  ];
  for (const [name, v] of cases) {
    assert.ok(v && typeof v.text === 'string', name + ' returned no label');
    assert.ok(!/NaN|null|undefined/.test(v.text), name + ' rendered "' + v.text + '"');
    assert.equal(v.text, 'Not shared', name + ' rendered "' + v.text + '"');
    assert.equal(v.dim, true, name + ' is not marked as an unknown');
  }
  // ⚠ AND "No consults yet" / "Never" ARE THE WRONG EMPTIES FOR AN UNREADABLE STAMP.
  // A stamp we cannot parse means the thing DID happen and we cannot say when; saying
  // it never happened is a different claim, and the wrong one. Both keep their honest
  // empty for the case they are actually about.
  assert.equal(labels.dashConsultLabel({ payments: { lastSessionAt: null } }).text, 'No consults yet');
  assert.equal(labels.dashContactLabel({ lastContact: { trainer: null } }, 'trainer').text, 'Never');
  assert.equal(labels.dashContactLabel({}, 'trainer').text, 'Not shared');
  // and a readable date still reads
  const today = new Date().toISOString();
  assert.equal(labels.dashConsultLabel({ payments: { lastSessionAt: today } }).text, 'Today');
  assert.equal(labels.dashLastLogLabel({ foodLogs: { lastLoggedOn: today } }).text, 'Today');
});

test('an unreadable date still sorts LAST, through the same one shape', () => {
  const rows = [rec('good', pay({ lastSessionAt: new Date(Date.now() - 5 * 86400000).toISOString() })), rec('bad', pay({ lastSessionAt: 'not-a-date' }))];
  assert.deepEqual(names(dashRosterSorted(rows, 'consult', 'desc')), ['good', 'bad']);
  assert.deepEqual(names(dashRosterSorted(rows, 'consult', 'asc')), ['good', 'bad']);
});

// ── the wiring ──────────────────────────────────────────────────────────────
const clean = stripComments(SRC);

test('every column head names a comparator that exists, and the free-text ones name none', () => {
  // ⚠ DERIVED FROM THE VIEWS, so a column added later without a key is caught here
  // rather than by a coach clicking a header that does nothing.
  const views = new Function('return ' + clean.slice(clean.indexOf('const DASH_ROSTER_VIEWS = {') + 'const DASH_ROSTER_VIEWS = '.length,
    clean.indexOf('\n};', clean.indexOf('const DASH_ROSTER_VIEWS')) + 2).replace(/cells:\s*\(rec, role\) => \[[\s\S]*?\],/g, ''))();
  let heads = 0, sortable = 0;
  for (const role of ['trainer', 'nutritionist']) {
    assert.ok(Array.isArray(views[role].heads), role + ' has no heads');
    for (const h of views[role].heads) {
      assert.ok(Array.isArray(h), role + ' head is not a [label, key] pair: ' + h);
      heads += 1;
      if (h[1] == null) continue;
      sortable += 1;
      assert.ok(Object.prototype.hasOwnProperty.call(DASH_ROSTER_SORTS, h[1]), role + '/' + h[0] + ' names a comparator that does not exist: ' + h[1]);
      assert.equal(DASH_ROSTER_SORTS[h[1]].label, h[0], 'the head and its comparator disagree about the label: ' + h[0]);
    }
  }
  assert.ok(heads >= 13 && sortable >= 11, 'the sweep scanned ' + heads + ' heads / ' + sortable + ' sortable');
  // GOAL PHASE and PROGRAM are free text — ordering them alphabetically answers nothing
  const unsorted = [].concat(views.trainer.heads, views.nutritionist.heads).filter((h) => h[1] == null).map((h) => h[0]);
  assert.deepEqual(unsorted.sort(), ['GOAL PHASE', 'PROGRAM']);
});

test('a column with no comparator renders as text, never as a dead button', () => {
  const head = clean.slice(clean.indexOf('const headCell ='), clean.indexOf('return (', clean.indexOf('const headCell =')) + 400);
  assert.match(head, /if \(!k \|\| !onSort\) return <span key=\{label\}>\{label\}<\/span>;/);
  // and a caller that offers no sorting gets the table it always had.
  // ⚠ THE INVARIANT IS THAT THE TABLE TAKES THE SORT AS PROPS, not the exact list of them:
  // pinning the whole signature failed this test — which is about DEAD BUTTONS — when the
  // drawer's preference store was threaded through as one more prop.
  const sig = clean.slice(clean.indexOf('function DashRosterTable({'), clean.indexOf(')', clean.indexOf('function DashRosterTable({')) + 1);
  for (const prop of ['triage', 'role', 'filter', 'query', 'sort', 'sortDir', 'onSort']) {
    assert.match(sig, new RegExp('[{,]\\s*' + prop + '\\s*[,}]'), 'DashRosterTable no longer takes ' + prop + ': ' + sig);
  }
  assert.match(clean, /const rows = dashRosterSorted\(filtered, sort, sortDir, role\);/);
  // the arrow marks only the active column
  assert.match(clean, /opacity: on \? 1 : 0/);
});

test('both roster pages offer the sort and remember it', () => {
  for (const f of ['trainerClientsPage.jsx', 'nutritionistClientsPage.jsx']) {
    const s = stripComments(readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8'));
    // ⚠ THE ALLOWLIST IS THE SORT MAP'S OWN KEYS, not a second list beside it.
    assert.match(s, /useRememberedChoice\(prefs, "rosterSort", DASH_ROSTER_SORT_KEYS, "triage"\)/, f);
    assert.match(s, /useRememberedChoice\(prefs, "rosterSortDir", \["asc", "desc"\], "desc"\)/, f);
    assert.match(s, /sort=\{sort\} sortDir=\{sortDir\} onSort=\{onSort\}/, f);
    // triage is the default, so a coach who never touches a header sees no change
    assert.ok(!/"rosterSort",\s*DASH_ROSTER_SORT_KEYS,\s*"(?!triage)/.test(s), f + ': the default is no longer the engine order');
  }
});

test('the key list is DERIVED from the sort map', () => {
  assert.match(clean, /const DASH_ROSTER_SORT_KEYS = Object\.keys\(DASH_ROSTER_SORTS\);/);
  assert.deepEqual(DASH_ROSTER_SORT_KEYS, Object.keys(DASH_ROSTER_SORTS));
});
