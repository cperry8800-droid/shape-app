// NINE BARS FIT WHERE THREE DID, OR THEY SCROLL — THEY NEVER CLIP.
//
// The website's community card carried the same three ranges the app's Session
// details lost (`Miles 1–3 / 4–6 / 7–8` on an 8.4 mi run). Replacing them with
// nine per-mile rows is a DATA change; what makes it safe is a LAYOUT change,
// because these columns are `flex: 1` and their width is the card's divided by
// the row count. Measured in Chromium before the fix: at 390px each column was
// 31px and **all nine** under-labels were clipped ("141 BPM" needs 36px,
// "LAST 0.4" needs 48).
//
// ⚠ THE RANGE RULE ITSELF LIVES IN `session-splits-per-mile.test.mjs`, which now
// sweeps this file too. This suite is only about the things that are specific to
// THIS renderer: the hoisted unit, the shared scroller, and the column floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = 'public/newdesign/dashboardCommunity.jsx';
const src = () => readFileSync(SRC, 'utf8');

test('the pace unit is hoisted off the bars and stated once above the strip', () => {
  const s = src();
  // ⚠ A label that fits over three bars collides over nine: "7:52/mi" measures
  // ~58px of serif 15 against a 48px column. Stripping the suffix leaves "7:52"
  // at ~28px and loses nothing, because the eyebrow carries the unit.
  assert.match(s, /const paceUnit = isPace \? /, 'the unit is no longer derived from the rows');
  assert.match(s, /const barLabel = /, 'the bar label is no longer the raw cell');
  assert.match(s, /\{barLabel\(r\[1\]\)\}/, 'the bar still renders the raw cell');
  // …and the unit reaches the eyebrow even when there is no Best-pace chip to
  // carry it, or the strip would show bare figures with no unit anywhere.
  assert.match(s, /bestPaceStat \? accentChip\("Best " \+ bestPaceStat\[1\]\) : \(paceUnit \? greyChip\(paceUnit\) : null\)/,
    'a strip with no best-pace chip must still state its unit');
  // ⚠ PACE ONLY. A strength row's "225 lb × 3" has no repeated suffix to hoist,
  // and stripping one would mangle it.
  assert.match(s, /isPace \? \(String\(rows\[0\]\[1\]\)\.match/, 'the hoist must be gated on isPace');
});

test('both rows share ONE scroller, with a floor under every column', () => {
  const s = src();
  assert.match(s, /const DC_SPLIT_MIN_COL = \d+;/, 'the column floor is not named');
  const floor = Number(/const DC_SPLIT_MIN_COL = (\d+);/.exec(s)[1]);
  // The widest label either row puts in a column, measured: "LAST 0.4" at 48px.
  assert.ok(floor >= 48, `floor ${floor} is under the widest measured label (48px)`);
  // ⚠ ONE SCROLLER, NOT TWO. Two would drift out of step the moment either was
  // scrolled, and the bars would stop sitting over their own labels.
  const scrollers = s.match(/overflowX: "auto"/g) || [];
  assert.equal(scrollers.length, 1, `expected exactly one scroller in the strip, found ${scrollers.length}`);
  // Both rows carry the same minWidth, which is what keeps them aligned.
  const mins = s.match(/minWidth: DC_SPLIT_MIN_COL \* rows\.length \+ 10 \* \(rows\.length - 1\)/g) || [];
  assert.equal(mins.length, 2, `both rows must share the floor; found ${mins.length}`);
  // ⚠ AND THE BAR IS NOT HIDDEN. This page has already paid for a hidden
  // horizontal scroller once — the availability grid, where 1p–8p were
  // unreachable with nothing on screen saying so.
  assert.ok(!/scrollbarWidth: "none"/.test(s) && !/::-webkit-scrollbar/.test(s),
    'the split strip must not hide its scrollbar');
});

test('the note column is a reading, not an adjective', () => {
  const s = src();
  // The third cell renders UNDER each bar on this surface, so it is visible copy
  // rather than the app's parse-only column — "Warm-up"/"Steady"/"Negative split"
  // said nothing a reader could use. Per-mile HR does.
  const rows = /breakdown: \{ label: "Mile splits", rows: \[(.+?)\] \} \} \},/.exec(s);
  assert.ok(rows, 'the Mile splits breakdown was not found');
  const cells = [...rows[1].matchAll(/\["([^"]+)", "([^"]+)", "([^"]+)"\]/g)];
  assert.equal(cells.length, 9, `expected 9 per-mile rows, found ${cells.length}`);
  for (const [, label, pace, note] of cells) {
    assert.match(note, /^\d+ bpm$/, `${label} carries "${note}" rather than a heart rate`);
    assert.match(pace, /^\d+:\d{2}\/mi$/, `${label} carries "${pace}"`);
  }
  // …and it must not wrap, or a two-line note would push the row out of step.
  assert.match(s, /color: i === bestIdx \? TEAL_BRIGHT : "rgba\(242,237,228,0\.4\)", marginTop: 3, whiteSpace: "nowrap"/,
    'the note must be nowrap inside its column');
});

test('the rows reconcile against the post’s OWN stat grid', () => {
  // ⚠ THE SAME DISCIPLINE THE APP'S FIVE RUNS WERE HELD TO. A split table that
  // does not add up to the time printed above it is a fabrication wearing more
  // rows than the one it replaced.
  const s = src();
  // ⚠ THE CAPTURE MUST SPAN THE WHOLE ARRAY. A lazy `(.+?)` up to `],` stops at
  // the FIRST pair, and the stats then parse to an empty object — which reads as
  // "the post has no Distance" rather than "the regex stopped early".
  const post = /\{ kind: "run", who: "Jonah W\.".*?stats: \[((?:\["[^"]+", "[^"]+"\](?:, )?)+)\]/s.exec(s);
  assert.ok(post, 'the run post was not found');
  const stats = Object.fromEntries([...post[1].matchAll(/\["([^"]+)", "([^"]+)"\]/g)].map((m) => [m[1], m[2]]));
  // Guard the guard: an extraction that quietly returns nothing would make every
  // assertion below vacuous.
  for (const k of ['Distance', 'Avg pace', 'Best pace', 'Time', 'Avg HR', 'Max HR']) {
    assert.ok(stats[k], `the stat grid did not parse — no ${k}`);
  }
  const rows = [...(/breakdown: \{ label: "Mile splits", rows: \[(.+?)\] \} \} \},/.exec(s)[1])
    .matchAll(/\["([^"]+)", "(\d+):(\d{2})\/mi", "(\d+) bpm"\]/g)]
    .map((m) => ({ label: m[1], sec: Number(m[2]) * 60 + Number(m[3]), hr: Number(m[4]) }));
  assert.equal(rows.length, 9);

  const dist = parseFloat(stats.Distance);
  // The tail's distance comes from its own label, so the arithmetic uses the
  // rows rather than a constant that could drift from them.
  const tailD = Number(/^Last ([\d.]+)$/.exec(rows[8].label)[1]);
  assert.equal(rows.slice(0, 8).length + tailD, dist, 'the rows do not cover the stated distance');
  const total = rows.slice(0, 8).reduce((a, r) => a + r.sec, 0) + rows[8].sec * tailD;
  const hms = (x) => `${Math.floor(x / 3600)}:${String(Math.floor((x % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(x) % 60).padStart(2, '0')}`;
  const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
  assert.equal(hms(total), stats.Time, 'the splits do not add up to the stated time');
  assert.equal(`${mmss(total / dist)}/mi`, stats['Avg pace'], 'the splits do not average to the stated pace');

  const best = Math.min(...rows.map((r) => r.sec));
  assert.equal(`${mmss(best)}/mi`, stats['Best pace'], 'the fastest split is not the stated best pace');
  // ⚠ The rule #2055 established, applied here: an average over a whole split
  // can never beat the session's fastest instantaneous reading.
  const bestSec = Number(/(\d+):(\d{2})/.exec(stats['Best pace'])[1]) * 60 + Number(/(\d+):(\d{2})/.exec(stats['Best pace'])[2]);
  for (const r of rows) assert.ok(r.sec >= bestSec, `${r.label} beats the stated Best pace`);

  const avgHr = (rows.slice(0, 8).reduce((a, r) => a + r.hr, 0) + rows[8].hr * tailD) / (8 + tailD);
  assert.ok(Math.abs(avgHr - parseFloat(stats['Avg HR'])) <= 1, `avg HR ${avgHr.toFixed(2)} vs ${stats['Avg HR']}`);
  const maxHr = Math.max(...rows.map((r) => r.hr));
  assert.ok(maxHr <= parseFloat(stats['Max HR']), `a split HR of ${maxHr} exceeds the stated max ${stats['Max HR']}`);
});
