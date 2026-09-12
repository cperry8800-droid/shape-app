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
// ⚠ THE DASH IS A UNICODE PROPERTY, NOT THREE CHARACTERS I HAPPENED TO TYPE. The
// first cut read `[-–—]`, which misses the non-breaking hyphen (U+2011) an editor
// or a paste substitutes silently — and `Miles 1‑6` does not match MILE either,
// so such a table read as "not a mile table" and walked through BOTH rules with
// the suite green. `\p{Pd}` is every dash punctuation mark; U+2212 is the minus
// sign, which is a math symbol rather than punctuation and so is named as well.
const RANGE = /\d\s*(?:[\p{Pd}\u2212]|\bto\b|\bthru\b|\bthrough\b)\s*\d/iu;
const MILE = /^Miles?\s+(\d+)$/i;
// A trailing part-mile row. ⚠ IT MUST BE UNDER A MILE: `Last 1.2` on a 3.2-mile
// run covers mile 3 AND a fifth of mile 4 — the same range claim, one row long,
// and the shape this guard's own first run caught still shipping.
const TAIL = /^Last\s+(0?\.\d+)$/i;

function splitTables(src) {
  const ast = parse(src === undefined ? readFileSync(SRC, 'utf8') : src, { sourceType: 'module', plugins: ['jsx'] });
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    // ⚠ `>= 1`, NOT `>= 2`: a floor of two excludes a ONE-ROW table, and a short
    // activity authored as the single row `[['Miles 1–1.2', '8:00/mi', …]]` is
    // exactly the regression this file exists to catch. The corpus floors below
    // stay satisfied either way, so the bad row would have been added in silence.
    if (n.type === 'ArrayExpression' && n.elements.length >= 1
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

// ── A SPLIT MAY NOT BEAT THE POST'S OWN HEADLINE ────────────────────────────
// A stat grid's `Best pace` and the split table sit on the SAME screen, so a
// split faster than the stated best makes the page contradict itself — and the
// board reads that row as `bestIdx` and draws it full height, which is the page
// pointing at the contradiction. Codex found exactly this on the first cut of
// this PR: Drew's grid said 8:24/mi while a new `Last 0.2` row said 8:18/mi.
// The rule is ONE-DIRECTIONAL. A stated best FASTER than every split is fine —
// it is the fastest instantaneous reading, and an average over a whole split can
// never reach it (Lena's swim is that shape today). What cannot happen is a
// split, which is an average, beating it.
function postsWithBestPace() {
  const ast = parse(readFileSync(SRC, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const out = [];
  const arr2 = (v) => (v && v.type === 'ArrayExpression'
    ? v.elements.filter((e) => e && e.type === 'ArrayExpression').map((e) => e.elements.map((c) => c && c.value))
    : []);
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'ObjectExpression') {
      const p = {};
      for (const q of n.properties) if (q.type === 'ObjectProperty' && q.key) p[q.key.name || q.key.value] = q.value;
      if (p.stats && p.breakdown && p.breakdown.type === 'ObjectExpression') {
        let rows = [];
        for (const q of p.breakdown.properties) if (q.key && q.key.name === 'rows') rows = arr2(q.value);
        const best = (arr2(p.stats).find((r) => /best\s*pace/i.test(String(r[0]))) || [])[1];
        if (best && rows.length && rows.every((r) => PACE.test(r[1]))) {
          out.push({ line: n.loc.start.line, who: (p.who && p.who.value) || '?', best, rows });
        }
      }
    }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  return out;
}

// M:SS[/unit] → { secs, unit }. Returns null for anything else (mph, bare text),
// so a post whose two sides are not comparable is reported rather than compared.
function paceSecs(v) {
  const m = /^(\d+):(\d{2})(\/\S+)?$/.exec(String(v || '').trim());
  return m ? { secs: Number(m[1]) * 60 + Number(m[2]), unit: m[3] || '' } : null;
}

function bestPaceFault(best, rows) {
  const b = paceSecs(best);
  if (!b) return `unreadable Best pace: ${best}`;
  for (const r of rows) {
    const sp = paceSecs(r[1]);
    if (!sp) continue;
    // Comparing a /mi split against a /100m best would be nonsense passing as a check.
    if (sp.unit !== b.unit) return `${r[0]} is "${sp.unit}" but Best pace is "${b.unit}"`;
    if (sp.secs < b.secs) return `split ${r[0]} ${r[1]} beats the stated Best pace ${best}`;
  }
  return null;
}

test('no split is faster than the post’s own stated Best pace', () => {
  const posts = postsWithBestPace();
  // A sweep that finds nothing passes vacuously.
  assert.ok(posts.length >= 3, `found only ${posts.length} posts carrying a Best pace`);
  for (const p of posts) {
    assert.equal(bestPaceFault(p.best, p.rows), null, `${SRC}:${p.line} ${p.who}`);
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
  // …and the dash spellings a three-character class waves through: the
  // non-breaking hyphen, the figure dash, the horizontal bar, the minus sign.
  for (const d of ['\u2011', '\u2012', '\u2015', '\u2212']) {
    assert.equal(rangeLabels([[`Miles 1${d}6`, '8:55/mi', '']]).length, 1, `dash U+${d.codePointAt(0).toString(16)}`);
  }
  // …while the shapes that are legitimately not ranges pass.
  assert.deepEqual(rangeLabels([['Mile 10', '8:00/mi', ''], ['Last 0.2', '8:18/mi', '']]), []);
  assert.equal(mileFault([['Lap 1', '8:00/mi', ''], ['Lap 2', '8:00/mi', '']]), null);
});

test('POSITIVE CONTROL — the WALKER reaches a one-row table, and the rule fires on it', () => {
  // Driven through the real walker over a synthetic source, because the floor
  // that excluded this shape lives in the WALKER rather than in the rules — a
  // control that called `rangeLabels` directly would pass with the floor back at
  // 2 and so prove nothing about the gap this is written for.
  const one = splitTables("const a = { breakdown: { rows: [['Miles 1\u20131.2', '8:00/mi', '150 bpm']] } };");
  assert.equal(one.length, 1, 'the walker skipped a one-row split table');
  assert.equal(rangeLabels(one[0].rows).length, 1, 'the range rule did not fire on it');
  // …and the ordinary multi-row shape still reaches it, so the floor was widened
  // rather than swapped for something that only accepts singletons.
  const two = splitTables("const a = [['Mile 1', '8:00/mi', ''], ['Mile 2', '7:58/mi', '']];");
  assert.equal(two.length, 1);
});

test('POSITIVE CONTROL — the best-pace rule catches both ways it can be broken', () => {
  const rows = [['Mile 1', '8:30/mi', ''], ['Mile 2', '8:24/mi', ''], ['Last 0.2', '8:18/mi', '']];
  // The shipped defect: a tail averaging faster than the headline statistic.
  assert.match(bestPaceFault('8:24/mi', rows), /beats the stated Best pace/);
  // A stated best FASTER than every split is legitimate — the instantaneous reading.
  assert.equal(bestPaceFault('8:10/mi', rows), null);
  // Equality is the ordinary case and must not read as a fault.
  assert.equal(bestPaceFault('8:18/mi', rows), null);
  // Two units are not comparable, and a silent numeric compare would pass here.
  assert.match(bestPaceFault('1:33/100m', rows), /but Best pace is/);
});
