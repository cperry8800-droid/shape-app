// A SPLIT IS ONE MILE, NEVER A RANGE OF THEM.
//
// WHY THIS FILE EXISTS: Session details' "Split by split" table reported an
// 18.2-mile long run as THREE splits — `Miles 1–6 · 8:55/mi`, `Miles 7–12`,
// `Miles 13–18` — and the pace bar chart drew three bars beside a thirty-point
// pace line from the same session. Nothing was broken in the model: `bsPaceSplits`
// prefers a post's hand-written `breakdown` over its trace, and those rows were
// authored as RANGES, so a six-mile summary was read as one six-mile split.
//
// ⚠ THE DEFECT IS IN THE DATA, AND THAT IS WHY THE GUARD IS HERE RATHER THAN IN
// `bsPaceSplits`. No live post can produce a range label — `bsBuildBreakdown`
// labels from the provider's own row or `Split N`, `rawSplits` outranks the
// breakdown anyway, and the trace fallback labels `Mile N` by construction — so
// teaching the model to unpick `Miles 1–6` would be unreachable code guarding
// against the author of the next demo post. This fails that author instead.
//
// The corpus is DERIVED from the source, not listed: every array-of-string-rows
// in the client module whose middle cell is a pace on every row IS a split table,
// and nothing else in that file has that shape. So a table added later is covered
// with nobody remembering this file exists — and the count is asserted, because a
// sweep that quietly stops matching passes vacuously.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { bsPaceSplits } from '../mobile-app/src/services/paceSplits.mjs';
import { bsIbSplitTable } from '../mobile-app/src/services/instrumentBoard.mjs';

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
// A pace cell: M:SS with a distance unit (run/swim), a bare M:SS lap time, or mph.
const PACE = /^\d+:\d{2}(\/(mi|km|100m))?$|mph/i;
// A RANGE: two numbers joined by any dash or a spelled-out span. Deliberately not
// a list of the spellings `Miles 1–6` can take — `Mile 1 to 6` is the same claim.
const RANGE = /\d\s*(?:[-–—]|\bto\b|\bthru\b|\bthrough\b)\s*\d/i;
const MILE = /^Miles?\s+(\d+)$/i;
// A trailing part-mile row. ⚠ IT MUST BE UNDER A MILE: `Last 1.2` on a 3.2-mile
// run covers mile 3 AND a fifth of mile 4 — the same range claim, one row long,
// and the shape this guard's own first run caught still shipping.
const TAIL = /^Last\s+(0?\.\d+)$/i;

function splitTables() {
  const ast = parse(readFileSync(SRC, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'ArrayExpression' && n.elements.length >= 2
      && n.elements.every((e) => e && e.type === 'ArrayExpression'
        && e.elements.length >= 2 && e.elements.length <= 3
        && e.elements.every((c) => c && c.type === 'StringLiteral'))) {
      const rows = n.elements.map((e) => e.elements.map((c) => c.value));
      if (rows.every((r) => PACE.test(r[1]))) out.push({ line: n.loc.start.line, rows });
    }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  return out;
}

// The two rules, lifted out so the positive control below runs the SAME code the
// corpus does — a control that re-states the rule proves nothing about the rule.
function rangeLabels(rows) { return rows.map((r) => r[0]).filter((l) => RANGE.test(l)); }
function mileFault(rows) {
  const miles = rows.map((r) => r[0]).map((l) => (MILE.exec(l) || [])[1]).filter(Boolean).map(Number);
  if (!miles.length) return null; // not a mile table (laps, reps, 500m splits)
  const want = miles.map((_, i) => i + 1);
  if (String(miles) !== String(want)) return `miles run ${miles.join(',')} — want ${want.join(',')}`;
  // Anything that is not a `Mile N` may only be the trailing part-mile row.
  const extra = rows.map((r) => r[0]).filter((l) => !MILE.test(l));
  if (extra.length > 1) return `extra rows: ${extra.join(' | ')}`;
  if (extra.length === 1 && !TAIL.test(extra[0])) return `not a part-mile tail: ${extra[0]}`;
  if (extra.length === 1 && rows[rows.length - 1][0] !== extra[0]) return `part-mile row is not last: ${extra[0]}`;
  return null;
}

test('the split-table sweep reaches a real corpus (it cannot pass by finding nothing)', () => {
  const tables = splitTables();
  assert.ok(tables.length >= 8, `found only ${tables.length} split tables in ${SRC}`);
  const mile = tables.filter((t) => t.rows.some((r) => MILE.test(r[0])));
  assert.ok(mile.length >= 5, `found only ${mile.length} mile tables`);
  // The reported one: the 18.2-mile long run. If this stops being found, the
  // sweep has drifted off the very table the file was written for.
  assert.ok(mile.some((t) => t.rows.length === 19), 'the 18.2 mi long run is not in the corpus');
});

test('no split row covers a range of miles', () => {
  for (const t of splitTables()) {
    assert.deepEqual(rangeLabels(t.rows), [], `${SRC}:${t.line} — range labels`);
  }
});

test('a mile table enumerates consecutive miles, with at most a trailing part-mile', () => {
  for (const t of splitTables()) {
    assert.equal(mileFault(t.rows), null, `${SRC}:${t.line}`);
  }
});

test('the shipped model renders every mile row, capped at 6 with the link agreeing', () => {
  for (const t of splitTables()) {
    if (!t.rows.some((r) => MILE.test(r[0]))) continue;
    // Exactly how BSActivityDetail maps a breakdown into the model.
    const m = bsPaceSplits({
      providerSplits: t.rows.map((r) => ({ label: r[0], pace: r[1], hr: /bpm/.test(String(r[2])) ? r[2] : undefined })),
      sport: 'run',
    });
    assert.equal(m.source, 'provider', `${SRC}:${t.line}`);
    assert.equal(m.splits.length, t.rows.length, `${SRC}:${t.line} — rows dropped by the model`);
    const st = bsIbSplitTable(m.splits);
    assert.equal(st.total, t.rows.length, `${SRC}:${t.line}`);
    assert.equal(st.shown.length, Math.min(6, t.rows.length), `${SRC}:${t.line}`);
    // The link reads "All N splits ›" only when there is more to see.
    assert.equal(st.truncated, t.rows.length > 6, `${SRC}:${t.line}`);
    // Per-mile HR is what the note column buys; a mile table that lost it would
    // render Split/Pace alone and nobody would notice.
    assert.equal(st.cols.hr, true, `${SRC}:${t.line} — no HR column`);
  }
});

test('POSITIVE CONTROL — the retired range rows fail both rules', () => {
  const retired = [
    ['Miles 1–6', '8:55/mi', 'Warm-up'],
    ['Miles 7–12', '8:44/mi', 'Steady'],
    ['Miles 13–18', '8:31/mi', 'Negative split'],
  ];
  assert.equal(rangeLabels(retired).length, 3);
  assert.ok(mileFault([['Mile 1', '9:00/mi', ''], ['Miles 2–3', '8:50/mi', '']]));
  // …and the spellings a dash-only check would wave through.
  assert.equal(rangeLabels([['Mile 1 to 6', '8:55/mi', '']]).length, 1);
  assert.equal(rangeLabels([['Miles 1 — 6', '8:55/mi', '']]).length, 1);
  // …and a tail that swallows a whole mile, which carries no dash at all.
  assert.ok(mileFault([['Mile 1', '8:12/mi', ''], ['Mile 2', '7:58/mi', ''], ['Last 1.2', '7:39/mi', '']]));
  // …while the shapes that are legitimately not ranges pass.
  assert.deepEqual(rangeLabels([['Mile 10', '8:00/mi', ''], ['Last 0.2', '8:18/mi', '']]), []);
  assert.equal(mileFault([['Lap 1', '8:00/mi', ''], ['Lap 2', '8:00/mi', '']]), null);
});
