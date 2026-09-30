// deckAudio buffer decks — the pure half: meta normalisation and the start arithmetic that
// puts track bar `fromBar` on master bar `atBar` (on time, cued, and joining late). The
// Web Audio half is proven on rendered audio in dist/buffer-deck-test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBufferMeta, planBufferStart, BUFFER_TRIM, BUFFER_TARGET_LUFS } from '../src/deckAudio.mjs';

const SRC = readFileSync(new URL('../src/deckAudio.mjs', import.meta.url), 'utf8');
const ENGINE = 124;
const T0 = 0.05;
const BAR = 240 / ENGINE;
const barTime = (b) => T0 + b * BAR;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Context time at which buffer second `b` sounds under a plan (what the source node does).
const soundsAt = (p, b) => p.startT + (b - p.offset) / p.rate;

test('normalizeBufferMeta: beatSec is always 60/bpm, lengthBars derived, bad bpm refused', () => {
  const m = normalizeBufferMeta({ bpm: 121.3, beatSec: 0.5, downbeatSec: 0.187 }, 60);
  assert.equal(m.beatSec, 60 / 121.3);
  assert.equal(m.lengthBars, Math.floor((60 - 0.187) / (240 / 121.3)));
  assert.equal(m.downbeatSec, 0.187);
  assert.equal(normalizeBufferMeta({ bpm: 120, lengthBars: 12 }, 60).lengthBars, 12);
  assert.equal(normalizeBufferMeta({ bpm: 120, downbeatSec: null }, 60).downbeatSec, 0);
  for (const bad of [{}, { bpm: 0 }, { bpm: -120 }, { bpm: 'x' }, { bpm: NaN }, null]) assert.equal(normalizeBufferMeta(bad, 60), null);
  assert.equal(normalizeBufferMeta({ bpm: 120 }, 0), null);
});

test('on time: buffer downbeat of fromBar sounds exactly on barTime(atBar)', () => {
  const meta = normalizeBufferMeta({ bpm: 121.3, downbeatSec: 0.187 }, 64);
  for (const [atBar, fromBar] of [[0, 0], [8, 0], [8, 3], [2.5, 1.25]]) {
    const p = planBufferStart({ engineBpm: ENGINE, t0: T0, meta, duration: 64, now: 0, atBar, fromBar });
    assert.equal(p.late, false);
    assert.equal(p.ok, true);
    assert.equal(p.rate, Math.fround(ENGINE / 121.3));
    assert.ok(Math.abs(p.offset - (0.187 + fromBar * 4 * 60 / 121.3)) < 1e-12);
    assert.ok(Math.abs(p.startT - barTime(atBar)) < 1e-12);
    assert.ok(Math.abs(soundsAt(p, p.cue) - barTime(atBar)) < 1e-12);
  }
});

test('every buffer beat lands on the master grid (float32 rate drift < 20 µs over 120 s)', () => {
  const R = mulberry32(0x5eed);
  let worst = 0, checked = 0, lateJoins = 0;
  for (let i = 0; i < 400; i += 1) {
    const trackBpm = 100 + R() * 40;
    const db = R() * 1.2;
    const dur = 130;
    const meta = normalizeBufferMeta({ bpm: trackBpm, downbeatSec: db }, dur);
    const atBar = Math.floor(R() * 12);
    const fromBar = Math.floor(R() * 8);
    const now = R() < 0.5 ? 0 : barTime(atBar + R() * 3);   // half of them join late
    const p = planBufferStart({ engineBpm: ENGINE, t0: T0, meta, duration: dur, now, atBar, fromBar });
    if (!p.ok) continue;
    if (p.late) lateJoins += 1;
    for (let k = fromBar * 4; ; k += 1) {
      const b = db + k * meta.beatSec;
      if (b > dur || b - p.cue > 120) break;
      if (b < p.offset) continue;                     // before a late join: never sounds
      const masterBeat = atBar * 4 + (k - fromBar * 4);
      const want = T0 + masterBeat * (60 / ENGINE);
      worst = Math.max(worst, Math.abs(soundsAt(p, b) - want));
      checked += 1;
    }
  }
  console.log(`grid sweep: ${checked} beats, ${lateJoins} late joins, worst ${(worst * 1e6).toFixed(3)} µs`);
  assert.ok(checked > 20000 && lateJoins > 100, `vacuous sweep: ${checked} beats / ${lateJoins} late joins`);
  assert.ok(worst < 20e-6, `worst grid error ${worst * 1e6} µs`);
});

test('late join: starts lead after now, offset advanced, still on the grid; flagged', () => {
  const meta = normalizeBufferMeta({ bpm: 126.8, downbeatSec: 0.052 }, 61);
  const now = barTime(5.37);
  const p = planBufferStart({ engineBpm: ENGINE, t0: T0, meta, duration: 61, now, atBar: 4, fromBar: 3, lead: 0.03 });
  assert.equal(p.late, true);
  assert.ok(Math.abs(p.startT - (now + 0.03)) < 1e-12);
  // the buffer position at startT is exactly where the grid says track bar 3 + 1.37+ is
  const trackBarAtStart = (p.offset - meta.downbeatSec) / (4 * meta.beatSec);
  assert.ok(Math.abs(trackBarAtStart - (3 + (p.startT - barTime(4)) / BAR)) < 1e-6);
  assert.ok(Math.abs(soundsAt(p, p.cue) - barTime(4)) < 1e-9);   // the grid map is unchanged
});

test('a start inside the lead joins late rather than being scheduled in the past', () => {
  const meta = normalizeBufferMeta({ bpm: 120, downbeatSec: 0 }, 60);
  const p = planBufferStart({ engineBpm: ENGINE, t0: T0, meta, duration: 60, now: barTime(4) - 0.01, atBar: 4, lead: 0.03 });
  assert.equal(p.late, true);
  assert.ok(p.startT >= barTime(4) - 0.01 + 0.03 - 1e-12);
});

test('default atBar = the next bar line at least `lead` ahead', () => {
  const meta = normalizeBufferMeta({ bpm: 120, downbeatSec: 0 }, 60);
  const p = planBufferStart({ engineBpm: ENGINE, t0: T0, meta, duration: 60, now: barTime(3) - 0.02, lead: 0.03 });
  assert.equal(p.atBar, 4);
  assert.equal(p.late, false);
  const q = planBufferStart({ engineBpm: ENGINE, t0: T0, meta, duration: 60, now: barTime(3) - 0.05, lead: 0.03 });
  assert.equal(q.atBar, 3);
});

test('cue past the end is refused; a negative downbeat pre-rolls instead of seeking < 0', () => {
  const meta = normalizeBufferMeta({ bpm: 120, downbeatSec: 0 }, 10);
  assert.equal(planBufferStart({ engineBpm: ENGINE, t0: T0, meta, duration: 10, now: 0, atBar: 0, fromBar: 6 }).ok, false);
  const neg = normalizeBufferMeta({ bpm: 120, downbeatSec: -0.1 }, 10);
  const p = planBufferStart({ engineBpm: ENGINE, t0: T0, meta: neg, duration: 10, now: 0, atBar: 2, fromBar: 0 });
  assert.equal(p.offset, 0);
  assert.ok(Math.abs(soundsAt(p, -0.1) - barTime(2)) < 1e-12);
});

test('endT is where the buffer runs out at the float32 rate', () => {
  const meta = normalizeBufferMeta({ bpm: 121.3, downbeatSec: 0.187 }, 64);
  const p = planBufferStart({ engineBpm: ENGINE, t0: T0, meta, duration: 64, now: 0, atBar: 0 });
  assert.ok(Math.abs(p.endT - (p.startT + (64 - p.offset) / Math.fround(ENGINE / 121.3))) < 1e-12);
});

test('trim defaults: BUFFER_TRIM maps a -8 LUFS master onto BUFFER_TARGET_LUFS', () => {
  assert.ok(Math.abs(20 * Math.log10(BUFFER_TRIM) - (BUFFER_TARGET_LUFS + 8)) < 1e-9);
  assert.ok(BUFFER_TRIM > 0 && BUFFER_TRIM < 1);
});

test('contract: no Math.random, no Date.now / performance.now in the module', () => {
  const code = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /Math\.random/);
  assert.doesNotMatch(code, /Date\.now|performance\.now/);
});
