// The cook screen's tracks, drawn as rails (owner's pick A, 2026-10-08): one rail per dish,
// a bar per step with no digits on it, and a line per dish naming what it is doing.
//
// WHY. The strip under the stove fitted a 45-minute cook into ~340px, so every 3-minute
// step was a 15px chip that could carry only its step number, and the dish's name sat on
// top of its first chip. Measured in the app on the owner's own cook (beef bowl, banana
// oats, cottage cheese): "1 2 3 4 5 6 / 1 2 3 4 5 / 1 2 3 4" and nothing else. The rails
// say the same thing in words: "Step 1 of 6", "Starts 8:29", "Hands-off 14:32".
//
// The status rules are pure (bsTrackLaneStatus, services/cookBoard.mjs) and are driven
// first. Then the shipping bsCkTracks is called and its markup read, because the defects
// a redraw invites live in the drawing: a digit left on a bar, a running timer faded as
// done, a ready time the top bar does not show, a ruler time drawn under a label.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { IntlMessageFormat } from 'intl-messageformat';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';
import { bsTrackLanes, bsTrackLaneStatus } from '../mobile-app/src/services/cookBoard.mjs';

const require_ = createRequire(import.meta.url);
const React = require_('react');
const { renderToStaticMarkup } = require_('react-dom/server');

// ── the status rules ────────────────────────────────────────────────────────

const ev = (iid, stepIndex, at, min, extra = {}) => ({ iid, recipe: `r${iid}`, title: `Dish ${iid}`, stepIndex, at, min, text: `step ${stepIndex + 1}`, ...extra });
// The owner's cook, one dish after another, every step the planner's 3-minute stand-in.
const SERIAL = [
  ...[0, 1, 2, 3, 4, 5].map((k) => ev(0, k, k * 3, 3)),
  ...[0, 1, 2, 3, 4].map((k) => ev(1, k, 18 + k * 3, 3)),
  ...[0, 1, 2, 3].map((k) => ev(2, k, 33 + k * 3, 3)),
];

test('a lane says its step, its timer, when it starts or that it is done', () => {
  const at0 = bsTrackLanes(SERIAL, 0);
  assert.deepEqual(bsTrackLaneStatus(at0[0]), { kind: 'step', n: 1, of: 6 });
  assert.deepEqual(bsTrackLaneStatus(at0[1]), { kind: 'starts', at: 18 });
  assert.deepEqual(bsTrackLaneStatus(at0[2]), { kind: 'starts', at: 33 });
  const at7 = bsTrackLanes(SERIAL, 7);
  assert.deepEqual(bsTrackLaneStatus(at7[0]), { kind: 'done' });
  assert.deepEqual(bsTrackLaneStatus(at7[1]), { kind: 'step', n: 2, of: 5 });
  // A dish whose steps are split by another dish's: begun, so its next step is "next".
  const split = bsTrackLanes([ev(0, 0, 0, 3), ev(1, 0, 3, 3), ev(0, 1, 6, 3)], 1);
  assert.deepEqual(bsTrackLaneStatus(split[0]), { kind: 'next', at: 6 });
  assert.deepEqual(bsTrackLaneStatus({ blocks: [] }), { kind: 'done' });
  assert.deepEqual(bsTrackLaneStatus(null), { kind: 'done' });
});

test('a running timer is said, and the step in front of the cook wins over it', () => {
  const tl = [ev(0, 0, 0, 3), ev(0, 1, 3, 18, { passive: true }), ev(1, 0, 3, 3), ev(1, 1, 6, 3)];
  const lanes = bsTrackLanes(tl, 2);
  const timerOf = (b) => (b.step === 1 && b.hold ? { left: 872, up: false } : null);
  assert.deepEqual(bsTrackLaneStatus(lanes[0], { timerOf }), { kind: 'hold', left: 872 });
  assert.deepEqual(bsTrackLaneStatus(lanes[0], { timerOf: () => ({ left: 0, up: true }) }), { kind: 'up' });
  // Dish 1 holds the cursor: its step is what it says, whatever timer it also has.
  assert.deepEqual(bsTrackLaneStatus(lanes[1], { timerOf: () => ({ left: 30, up: false }) }), { kind: 'step', n: 1, of: 2 });
});

test('the plated screen counts each dish\'s steps', () => {
  const lanes = bsTrackLanes(SERIAL, SERIAL.length);
  assert.deepEqual(lanes.map((l) => bsTrackLaneStatus(l, { fit: true })), [{ kind: 'count', n: 6 }, { kind: 'count', n: 5 }, { kind: 'count', n: 4 }]);
});

// ── the drawing ─────────────────────────────────────────────────────────────

const { bsCkTracks, bsCkClockShort } = await loadBroadsheet(['bsCkTracks', 'bsCkClockShort'], React);
// The translator the cook screens get, minus the catalogs: the English default, formatted.
const tr = (_key, o = {}) => new IntlMessageFormat(o.defaultValue, 'en').format(o);
const COLORS = ['#e8b06a', '#7cc4f0', '#b8a0f5'];
const ANCHOR = new Date(2026, 9, 8, 8, 11).getTime();
const unescape = (t) => (t == null ? t : t.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
const draw = (props) => {
  const html = renderToStaticMarkup(bsCkTracks({
    tr, width: 366, anchor: ANCHOR, span: 45, colorOf: (ln) => COLORS[ln.iid], onOpen() {}, ...props,
  }));
  const lanes = [...html.matchAll(/<div class="lane"[\s\S]*?(?=<div class="lane"|<span class="flag|<span class="endl|<span class="ph)/g)].map((m) => m[0]);
  const lane = (s) => ({
    name: unescape((s.match(/<span class="nm">([^<]*)</) || [])[1]),
    status: (s.match(/<span class="st ([a-z]+)">([^<]*)</) || []).slice(1).map(unescape),
    bars: [...s.matchAll(/<span class="(sb[^"]*)" style="left:([-\d.e]+)px;width:([\d.e]+)px"><\/span>/g)].map((m) => ({ cls: m[1].split(' '), left: +m[2], width: +m[3] })),
    rail: /<span class="rail"/.test(s),
  });
  const marks = [...html.matchAll(/<b style="left:([-\d.e]+)px">([^<]*)<\/b>/g)].map((m) => ({ x: +m[1], text: m[2] }));
  const ph = html.match(/<span class="(ph[^"]*)" style="left:([-\d.e]+)px"><b>([^<]*)<\/b>/);
  const endl = html.match(/<span class="endl" style="left:([-\d.e]+)px">([^<]*)</);
  return { html, lanes: lanes.map(lane), marks, ph: ph && { cls: ph[1], x: +ph[2], text: unescape(ph[3]) }, endl: endl && { x: +endl[1], text: unescape(endl[2]) } };
};

test('no bar carries a digit, or anything else: the words are on the dish\'s own line', () => {
  const d = draw({ lanes: bsTrackLanes(SERIAL, 0), nowMin: 0 });
  assert.equal(d.lanes.length, 3);
  assert.equal(d.lanes.reduce((n, l) => n + l.bars.length, 0), 15, 'one bar per step');
  assert.doesNotMatch(d.html, /<span class="sb[^"]*"[^>]*>[^<]/, 'a bar has text in it');
  assert.deepEqual(d.lanes.map((l) => l.name), ['Dish 0', 'Dish 1', 'Dish 2']);
  assert.deepEqual(d.lanes.map((l) => l.status), [
    ['step', 'Step 1 of 6'],
    ['starts', `Starts ${bsCkClockShort(ANCHOR + 18 * 60000)}`],
    ['starts', `Starts ${bsCkClockShort(ANCHOR + 33 * 60000)}`],
  ]);
  assert.ok(d.lanes.every((l) => l.rail), 'every dish has its rail');
  assert.deepEqual(d.lanes[0].bars.filter((b) => b.cls.includes('cur')).length, 1, 'the step in front of the cook is ringed');
  assert.equal(d.ph.text, 'Now');
});

test('the dishes are drawn where the plan puts them, inside the strip', () => {
  const d = draw({ lanes: bsTrackLanes(SERIAL, 0), nowMin: 0 });
  const ppm = (366 - 40) / 45;
  assert.equal(d.ph.x, 14);
  assert.ok(Math.abs(d.lanes[1].bars[0].left - (14 + 18 * ppm + 1)) < 0.01, 'the oats start at minute 18');
  for (const l of d.lanes) for (const b of l.bars) assert.ok(b.left >= 0 && b.left + b.width <= 366, `a bar outside the strip: ${b.left}+${b.width}`);
});

test('done steps fade, but a hold whose timer is still running does not', () => {
  const tl = [ev(0, 0, 0, 3), ev(0, 1, 3, 18, { passive: true }), ev(1, 0, 3, 3), ev(1, 1, 6, 3)];
  const timerOf = (b, ln) => (ln.iid === 0 && b.hold ? { left: 872, up: false } : null);
  const d = draw({ lanes: bsTrackLanes(tl, 2), nowMin: 3, span: 21, timerOf });
  const [first, hold] = d.lanes[0].bars;
  assert.ok(first.cls.includes('past'));
  assert.ok(!hold.cls.includes('past'), 'a running timer was drawn as done');
  assert.ok(hold.cls.includes('hold') && hold.cls.includes('live'));
  assert.deepEqual(d.lanes[0].status, ['hold', 'Hands-off 14:32']);
  // Once its time is up it is just a past step again, and the line says so.
  const up = draw({ lanes: bsTrackLanes(tl, 2), nowMin: 3, span: 21, timerOf: (b, ln) => (ln.iid === 0 && b.hold ? { left: 0, up: true } : null) });
  assert.ok(up.lanes[0].bars[1].cls.includes('past'));
  assert.deepEqual(up.lanes[0].status, ['up', "Time's up"]);
});

test('the ruler\'s end says the top bar\'s ready time, and only when it is given', () => {
  const lanes = bsTrackLanes(SERIAL, 0);
  const readyAt = ANCHOR + 47 * 60000; // running two minutes late: the top bar's time, not the plan's end
  const d = draw({ lanes, nowMin: 0, readyAt });
  assert.equal(d.endl.text, `Ready ${bsCkClockShort(readyAt)}`);
  assert.equal(d.endl.x, 14 + 45 * ((366 - 40) / 45), 'it sits on the end line');
  assert.equal(draw({ lanes, nowMin: 0 }).endl, null, 'no ready time handed in, none drawn');
  assert.equal(draw({ lanes, nowMin: 45, fit: true, readyAt }).endl, null, 'the plated screen has no ready time');
  // Near the end the playhead's label needs the room, and the top bar already says it.
  assert.equal(draw({ lanes: bsTrackLanes(SERIAL, 14), nowMin: 42, readyAt }).endl, null);
});

test('a ruler time is never drawn under the playhead\'s label or the ready label', () => {
  const lanes = bsTrackLanes(SERIAL, 0);
  for (const nowMin of [0, 3, 9, 14, 20, 27, 33]) {
    const d = draw({ lanes: bsTrackLanes(SERIAL, Math.round(nowMin / 3)), nowMin, readyAt: ANCHOR + 45 * 60000 });
    const phR = d.ph.x + 6 + d.ph.text.length * 7.4 + 4;
    for (const m of d.marks) {
      const half = (m.text.length * 6.2) / 2;
      assert.ok(m.x + half + 4 <= d.ph.x - 2 || m.x - half - 4 >= phR, `"${m.text}" at ${m.x} runs under Now (${d.ph.x}–${phR}) at minute ${nowMin}`);
      if (d.endl) {
        const endL = d.endl.x - 6 - d.endl.text.length * 7 - 4;
        assert.ok(m.x + half + 4 <= endL, `"${m.text}" at ${m.x} runs under "${d.endl.text}" at minute ${nowMin}`);
      }
      assert.ok(m.x - half >= 2 && m.x + half <= 364, `"${m.text}" is cut by the edge`);
    }
  }
  assert.ok(draw({ lanes, nowMin: 0 }).marks.length >= 3, 'the guard is about something: the ruler draws times');
});

test('the plated screen ends on Plated and counts each dish\'s steps', () => {
  const d = draw({ lanes: bsTrackLanes(SERIAL, SERIAL.length), nowMin: 45, fit: true });
  assert.equal(d.ph.text, 'Plated');
  assert.equal(d.ph.cls, 'ph end');
  assert.equal(d.ph.x, 366 - 12);
  assert.deepEqual(d.lanes.map((l) => l.status), [['count', '6 steps'], ['count', '5 steps'], ['count', '4 steps']]);
  assert.ok(d.lanes.every((l) => l.bars.every((b) => !b.cls.includes('past') && !b.cls.includes('cur'))), 'the plated screen marks no step done or current');
});

test('a step authored absurdly long still draws a bounded ruler', () => {
  const t0 = Date.now();
  const d = draw({ lanes: bsTrackLanes([ev(0, 0, 0, 1e308)], 0), nowMin: 0, span: 1e308 });
  assert.ok(d.marks.length <= 200);
  assert.ok(Date.now() - t0 < 2000, 'the ruler walked minute by minute');
});

test('without a clock a dish says how many minutes until it starts', () => {
  const d = draw({ lanes: bsTrackLanes(SERIAL, 0), nowMin: 0, anchor: NaN });
  assert.deepEqual(d.lanes.map((l) => l.status), [['step', 'Step 1 of 6'], ['starts', 'In 18 min'], ['starts', 'In 33 min']]);
  assert.ok(d.marks.every((m) => /^\d+$/.test(m.text)), 'the ruler counts minutes when there is no clock');
});

test('a dish already begun names its next step\'s time', () => {
  // Dish 0's steps are split by dish 1's: once begun, its line says "Next", not "Starts".
  const tl = [ev(0, 0, 0, 3), ev(1, 0, 3, 3), ev(0, 1, 6, 3)];
  const d = draw({ lanes: bsTrackLanes(tl, 1), nowMin: 3, span: 9 });
  assert.deepEqual(d.lanes[0].status, ['next', `Next ${bsCkClockShort(ANCHOR + 6 * 60000)}`]);
  assert.deepEqual(d.lanes[1].status, ['step', 'Step 1 of 1']);
});

test('the plated screen rings no step, whatever cursor it is handed', () => {
  const d = draw({ lanes: bsTrackLanes(SERIAL, 3), nowMin: 45, fit: true });
  assert.ok(d.lanes.every((l) => l.bars.every((b) => !b.cls.includes('cur') && !b.cls.includes('past'))));
});

test('a ruler time at the very left edge is left out, not cut', () => {
  // The ruler steps every 10 minutes at this width, so a clock starting on the ten puts a
  // mark on minute 0, the strip's left end. (8:15 would start the marks at 8:20 and test
  // nothing; the first mutation round said so.)
  const anchor = new Date(2026, 9, 8, 8, 10).getTime();
  for (const [nowMin, fit] of [[27, false], [45, true]]) {
    const d = draw({ lanes: bsTrackLanes(SERIAL, fit ? SERIAL.length : 9), nowMin, fit, anchor });
    assert.ok(!d.marks.some((m) => m.text === bsCkClockShort(anchor)), `"${bsCkClockShort(anchor)}" drawn half off the strip (fit: ${fit})`);
    assert.ok(d.marks.length >= 2, 'the ruler still draws its other times');
  }
});
