// The per-set RPE reaching Session details (review 2026-09-11, §4 defect 2).
//
// ⚠ THE NOTE COLUMN OF A BREAKDOWN ROW IS READ TWICE, AND THAT IS THE WHOLE DEFECT.
// `BSSdBars` lifts `RPE <n>` out of `row[2]` to draw its dial and renders whatever is
// left as the sub-label. `bsBuildBreakdown` wrote the set's DURATION into that column
// and nothing else, so `setLogs[].rpe` — a number the member taps in the live logger,
// stamped on the post by `shapeBackend.js` — never reached the page: the dial drew on
// every demo card and on no real set.
//
// These tests drive the SHIPPED builder and the SHIPPED parser against each other, so
// an equivalent rewrite of either passes and a real regression in either fails. Pinning
// the spelling of the note string would pin whatever that spelling is wrong about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadBroadsheet, drive, THEME } from './helpers/broadsheet-mount.mjs';

const CLIENT = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8'));
const PROS = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8'));

// Lift a whole function body by brace-matching, skipping the PARAMETER list first — a
// destructured parameter opens and closes the count on its own and hands back the bare
// signature, after which every assertion against it is vacuously true (#2032).
function grab(src, name, what = 'function') {
  const at = src.indexOf(what + ' ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let p = 0, k = src.indexOf('(', at);
  for (; k < src.length; k++) { const c = src[k]; if (c === '(') p++; else if (c === ')') { p--; if (!p) { k++; break; } } }
  let d = 0, seen = false;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  const body = src.slice(at, k);
  assert.ok(body.length > name.length + 60, 'grab(' + name + ') returned ' + body.length + ' chars — it stopped at the parameter list');
  return body;
}

const build = new Function(
  grab(CLIENT, 'bsSetSeconds') + '\n' + grab(CLIENT, 'bsSetRpeToken') + '\n' + grab(CLIENT, 'bsBuildBreakdown') +
  '\nreturn { bsBuildBreakdown, bsSetSeconds, bsSetRpeToken };')();

// The renderer's own two reads of the note column, lifted rather than restated: the
// dial's value, and the string that becomes the sub-label under the set label.
const BARS = grab(CLIENT, 'BSSdBars');
const rpeOfSrc = BARS.match(/const rpeOf = [^\n]+/);
const restSrc = BARS.match(/const rest = String\(r\[2\][^\n]+/);
assert.ok(rpeOfSrc && restSrc, 'BSSdBars no longer reads the note column the way this guard assumes');
const render = new Function('r', rpeOfSrc[0] + '\n' + restSrc[0].replace(/;$/, ';') + '\nreturn { rpe: rpeOf(r[2]), sub: rest };');

const setLog = (over = {}) => ({
  moveName: 'Back squat', setNumber: 1, completed: true,
  targetLoad: '225 lb', targetReps: 3, actualLoad: '245 lb', actualReps: 3,
  rpe: 8, unit: 'lb', setDurationSeconds: 42, restBeforeSeconds: 150, ...over,
});
const post = (...logs) => ({ rawMetrics: { setLogs: logs } });
const rowOf = (...logs) => build.bsBuildBreakdown(post(...logs)).rows[0];

test('the suite is running the shipped builder, not a restatement', () => {
  assert.equal(typeof build.bsBuildBreakdown, 'function');
  assert.equal(typeof build.bsSetRpeToken, 'function');
  assert.ok(rpeOfSrc[0].includes('rpe'), 'the dial parser lifted as a stub');
});

test('a live set carries its RPE to the dial, and the duration still reaches the sub-label', () => {
  const r = rowOf(setLog());
  const drawn = render(r);
  assert.equal(drawn.rpe, 8, 'the dial reads no RPE from a set the member rated 8');
  assert.match(drawn.sub, /42s/, 'the set duration left the sub-label');
});

test('rest before the set rides beside the duration', () => {
  const drawn = render(rowOf(setLog()));
  assert.match(drawn.sub, /rest 2:30/, 'rest before the set is not on the row');
});

test('an UNRATED set draws no dial — 0 is not a rating and null is not a 0', () => {
  // ⚠ `Number(null)`, `Number('')` and `Number(false)` are ALL 0 and ALL finite, so a
  // `Number.isFinite` guard alone renders a confident RPE 0 dial for a set nobody rated.
  for (const rpe of [null, undefined, '', 0, '0', 'n/a', NaN, false]) {
    const drawn = render(rowOf(setLog({ rpe })));
    assert.equal(drawn.rpe, null, 'a dial was drawn for rpe=' + JSON.stringify(rpe));
    assert.doesNotMatch(drawn.sub, /rpe/i, 'an RPE token leaked into the sub-label for rpe=' + JSON.stringify(rpe));
  }
});

test('an unrated set keeps the duration and rest it does have', () => {
  const drawn = render(rowOf(setLog({ rpe: null })));
  assert.match(drawn.sub, /42s/);
  assert.match(drawn.sub, /rest 2:30/);
  assert.doesNotMatch(drawn.sub, /^\s*·/, 'the empty RPE slot left a leading separator');
});

test('an absent duration or rest is absent, never a measured zero', () => {
  for (const v of [null, undefined, '', 0, NaN]) {
    const drawn = render(rowOf(setLog({ setDurationSeconds: v, restBeforeSeconds: v })));
    assert.equal(drawn.rpe, 8, 'the RPE went with the duration');
    assert.equal(drawn.sub, '', 'an absent duration/rest rendered as ' + JSON.stringify(drawn.sub));
  }
});

test('half-point ratings survive, and floating point does not print nine decimals', () => {
  assert.equal(render(rowOf(setLog({ rpe: 8.5 }))).rpe, 8.5);
  assert.equal(build.bsSetRpeToken(0.1 + 0.2), 'RPE 0.3');
});

test('the member and their coach spell one duration one way', () => {
  // The coach's session review prints the SAME set's seconds through its own formatter
  // (`formatReviewSeconds`). Two spellings of one number on two screens is the
  // disagreement this file keeps post-morteming, so they are driven against each other.
  const coach = new Function(grab(PROS, 'formatReviewSeconds') + '\nreturn formatReviewSeconds;')();
  for (const s of [1, 9, 42, 59, 60, 61, 90, 125, 150, 599, 600, 3600]) {
    assert.equal(build.bsSetSeconds(s), coach(s), 'the two surfaces disagree at ' + s + 's');
  }
});

test('the sub-label stays inside the column it is drawn in', () => {
  // Measured in Chromium against BSSdBars' own styles: the 76px sub-label at MONO 6.5px
  // /0.04em holds ~18 characters. The longest realistic pair is a minutes-long set after
  // a minutes-long rest; it must not need the ellipsis.
  const drawn = render(rowOf(setLog({ rpe: 9, setDurationSeconds: 125, restBeforeSeconds: 180 })));
  assert.equal(drawn.rpe, 9);
  assert.ok(drawn.sub.length <= 18, 'the sub-label is ' + drawn.sub.length + ' chars: ' + drawn.sub);
});

test('the RPE token leads, so cutting it cannot leave a doubled separator', () => {
  // The renderer strips the token and then only a LEADING or TRAILING '·'. A token in
  // the middle of the list therefore renders '42s ·  · rest 2:30' — two separators and
  // a hole. Ordering is the fix, so the order is what is asserted.
  const sub = render(rowOf(setLog())).sub;
  assert.doesNotMatch(sub, /·\s*·/, 'the sub-label has a doubled separator: ' + JSON.stringify(sub));
  assert.doesNotMatch(sub, /^\s*·|·\s*$/, 'the sub-label starts or ends on a separator: ' + JSON.stringify(sub));
  assert.equal(sub.trim(), sub, 'the sub-label has loose whitespace: ' + JSON.stringify(sub));
});

test('the RPE is the only thing lifted out — a move named with an R is untouched', () => {
  const r = rowOf(setLog({ moveName: 'Rope pull' }), setLog({ moveName: 'Back squat', setNumber: 2 }));
  assert.match(r[0], /Rope pull/, 'the label lost its move name');
  assert.equal(render(r).rpe, 8);
});

test('an incomplete set is still filtered out, and splits are untouched', () => {
  assert.equal(build.bsBuildBreakdown(post(setLog(), setLog({ setNumber: 2, completed: false }))).rows.length, 1);
  const splits = build.bsBuildBreakdown({ rawMetrics: { splits: [{ label: 'Mile 1', pace: '7:42', hr: 148 }] } });
  assert.equal(splits.label, 'Splits');
  assert.deepEqual(splits.rows[0], ['Mile 1', '7:42', '148 bpm']);
});

test('a post with neither sets nor splits still yields no section', () => {
  assert.equal(build.bsBuildBreakdown({ rawMetrics: {} }), null);
  assert.equal(build.bsBuildBreakdown(null), null);
});

// -- the end of the chain: the SHIPPED renderer, mounted -----------------------
// Every test above drives the builder and the renderer's two reads of the note column
// separately. This one mounts the real `BSSdBars` on the real builder's real output and
// asks the only question that matters: is there a dial on the set the member rated?
test('a live set renders its dial; the set beside it with no rating renders none', async () => {
  const { BSSdBars } = await loadBroadsheet(['BSSdBars']);
  const built = build.bsBuildBreakdown(post(
    setLog({ setNumber: 1, rpe: 8 }),
    setLog({ setNumber: 2, rpe: null, actualLoad: '255 lb', setDurationSeconds: 38, restBeforeSeconds: null }),
  ));
  const perf = built.rows.map((r) => { const m = String(r[1]).match(/[\d.]+/); return m ? +m[0] : 0; });
  const a = drive(BSSdBars, { rows: built.rows, perf, bestIdx: perf.indexOf(Math.max(...perf)), heat: '#34d6c5', t: THEME, muted: '#777' });
  const dials = a.nodes().map((n) => n.props['aria-label']).filter((l) => typeof l === 'string' && /^RPE /.test(l));
  assert.deepEqual(dials, ['RPE 8'], 'the rated set got no dial, or the unrated one got one: ' + JSON.stringify(dials));
  assert.match(a.text, /42s · rest 2:30/, 'the sub-label lost the duration and rest');
  assert.doesNotMatch(a.text, /RPE/, 'the RPE token printed as text instead of being drawn as the dial');
});
