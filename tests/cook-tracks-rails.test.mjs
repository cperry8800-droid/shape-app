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
  // A timer on a step the cook works at (a sear, 3 min a side) is a timer, never hands-off.
  assert.deepEqual(bsTrackLaneStatus(lanes[0], { timerOf: (b) => (b.step === 0 ? { left: 150, up: false } : null) }), { kind: 'timer', left: 150 });
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
  // A hands-on step's timer, left running while the cook moves to another dish.
  const sear = draw({ lanes: bsTrackLanes(tl, 2), nowMin: 3, span: 21, timerOf: (b, ln) => (ln.iid === 0 && !b.hold ? { left: 150, up: false } : null) });
  assert.deepEqual(sear.lanes[0].status, ['timer', 'Timer 2:30']);
  assert.ok(!sear.lanes[0].bars[0].cls.includes('past'), 'a running timer on a hands-on step was drawn as done');
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

// ── the website's captions ──────────────────────────────────────────────────
// The website's timeline is wide enough to say what each step is, which the old chips did
// ("1 · Heat the oven to") and the first rails did not. So on the website each bar is captioned
// with its step's opening words, in the room before the dish's next step; the phone, 32px a
// lane, keeps the bars bare.

const { bsCkFirstWords, BS_CK_CAP_MIN } = await loadBroadsheet(['bsCkFirstWords', 'BS_CK_CAP_MIN'], React);

test('a caption is the step\'s opening words: a lead-in gives way, a range stays whole, a cut never dangles', () => {
  assert.equal(bsCkFirstWords('Heat the oven to 425°F and line a sheet pan with parchment.'), 'Heat the oven to 425°F');
  assert.equal(bsCkFirstWords('Meanwhile, pat the salmon dry and rub it with a little oil.'), 'Pat the salmon dry and rub');
  assert.equal(bsCkFirstWords('While it roasts, make the couscous.'), 'Make the couscous');
  assert.equal(bsCkFirstWords('Assemble the bowls, then serve.'), 'Assemble the bowls', '"As" is a lead-in only as a word of its own');
  assert.equal(bsCkFirstWords('Once it boils, add the pasta.'), 'Add the pasta');
  // A leading "Now" or "Then" opens the instruction itself, which must not be skipped for the
  // clause after it ("Honey scorches in about a minute", in the demo plan's salmon bowl).
  assert.equal(bsCkFirstWords('Now spoon half the glaze over and give it a final 30 seconds. Honey scorches in about a minute.'), 'Spoon half the glaze');
  assert.equal(bsCkFirstWords('Then add the garlic and stir.'), 'Add the garlic and stir');
  assert.equal(bsCkFirstWords('Finally, scatter the herbs.'), 'Scatter the herbs');
  assert.equal(bsCkFirstWords('Now.'), 'Now', 'a step that is only the word keeps it');
  assert.equal(bsCkFirstWords('Roast another 12–15 minutes, until the broccoli edges char.'), 'Roast another 12–15 minutes');
  assert.equal(bsCkFirstWords('Stir the frozen peas into the rice and cover.'), 'Stir the frozen peas');
  assert.equal(bsCkFirstWords('Warm the peanut butter for 10 seconds.'), 'Warm the peanut butter');
  assert.equal(bsCkFirstWords('Nestle the chicken back in, skin side up.'), 'Nestle the chicken back in', 'a clause that ends on "in" by itself keeps it');
  assert.equal(bsCkFirstWords('Add 1.5 cups of stock. Simmer.'), 'Add 1.5 cups of stock', 'a decimal point is not the end of a sentence');
  assert.equal(bsCkFirstWords('Whisk'), 'Whisk');
  assert.equal(bsCkFirstWords(''), '');
  assert.equal(bsCkFirstWords(null), '');
});

const caps = (html) => [...html.matchAll(/<span class="(cap[^"]*)" style="left:([-\d.e]+)px;width:([\d.e]+)px">([^<]*)<\/span>/g)]
  .map((m) => ({ cls: m[1].split(' '), left: +m[2], width: +m[3], text: unescape(m[4]) }));

test('on the website each bar is captioned, in the room before the dish\'s next step', () => {
  const W = 1216; // the 1280px website layout's track, measured
  const at3 = bsTrackLanes(SERIAL, 3);
  const phone = draw({ lanes: at3, nowMin: 9, width: W });
  assert.equal(caps(phone.html).length, 0, 'a caption without `words`: the phone has no room for one');
  assert.match(phone.html, /<div class="tl"/);
  const d = draw({ lanes: at3, nowMin: 9, width: W, words: true });
  assert.match(d.html, /<div class="tl words"/, 'the class that gives the website\'s lanes their caption row');
  const c = caps(d.html);
  const bars = d.lanes.flatMap((l) => l.bars);
  assert.equal(c.length, bars.length, 'one caption per bar');
  assert.deepEqual(c.slice(0, 3).map((x) => x.text), ['Step 1', 'Step 2', 'Step 3']);
  for (let i = 0; i < c.length; i++) assert.equal(c[i].left, bars[i].left, 'a caption starts under its bar');
  // Within a dish, a caption ends before the next bar begins; the last one inside the strip.
  for (const l of d.lanes) {
    const lc = caps(d.html).filter((x) => l.bars.some((b) => b.left === x.left));
    for (let i = 0; i < lc.length; i++) {
      const end = lc[i].left + lc[i].width;
      if (i + 1 < lc.length) assert.ok(end <= lc[i + 1].left - 4, `caption ${i} runs into the next: ${end} vs ${lc[i + 1].left}`);
      else assert.ok(end <= W, `the last caption runs past the strip: ${end}`);
    }
  }
  assert.deepEqual(c.slice(0, 4).map((x) => x.cls.filter((k) => k !== 'cap')), [['past'], ['past'], ['past'], ['cur']]);
});

test('a caption runs on past its bar into the gap before the next step, and is left out where there is no room', () => {
  const tl = [ev(0, 0, 0, 3, { text: 'Heat the oven to 425°F and line a pan.' }), ev(0, 1, 10, 3, { text: 'Roast 25 minutes.' })];
  const d = draw({ lanes: bsTrackLanes(tl, 0), nowMin: 0, span: 13, width: 600, words: true });
  const [heat] = caps(d.html);
  assert.equal(heat.text, 'Heat the oven to 425°F');
  assert.ok(heat.width > d.lanes[0].bars[0].width * 2, `held to its bar (${heat.width}) with seven empty minutes after it`);
  // A 45-minute cook in 366px leaves a 3-minute step ~22px before the next one: no caption. A
  // dish's last step has the rest of the cook after it, so the first two dishes keep theirs.
  const narrow = draw({ lanes: bsTrackLanes(SERIAL, 0), nowMin: 0, words: true });
  assert.deepEqual(caps(narrow.html).map((x) => x.text), ['Step 6', 'Step 5'], `a caption in under ${BS_CK_CAP_MIN}px`);
  assert.ok(caps(narrow.html).every((x) => x.width >= BS_CK_CAP_MIN));
  // A step that runs past the strip's end (a span shorter than the plan) has its caption cut
  // at the edge with an ellipsis, not at the strip's overflow mid-letter.
  const long = [ev(0, 0, 0, 3, { text: 'Heat the oven.' }), ev(0, 1, 10, 40, { text: 'Roast until deep brown.' })];
  const past = draw({ lanes: bsTrackLanes(long, 0), nowMin: 0, span: 13, width: 600, words: true });
  const roast = caps(past.html).find((x) => x.text === 'Roast until deep brown');
  assert.ok(roast && roast.left + roast.width <= 600, `the caption runs past the strip: ${roast && roast.left + roast.width}`);
});

test('every cook screen hands the timeline its layout, and the website\'s lanes make room for a caption', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');
  const calls = src.match(/(?<!function )bsCkTracks\(\{[^\n]*\}\)/g) || [];
  assert.equal(calls.length, 3, 'a cook screen was added or removed: check it passes `words`');
  for (const call of calls) assert.match(call, /words: layout\.web \}\)/, `a cook screen draws the timeline without its layout: ${call.slice(0, 60)}`);
  const lane = src.match(/^\.bsck\.web \.cD \.dtl \.tl\.words \.lane\{height:(\d+)px\}$/m);
  const cap = src.match(/^\.bsck \.cB \.tl \.cap\{position:absolute;top:(\d+)px;/m);
  const cur = src.match(/^\.bsck\.web \.cD \.dtl \.tl \.sb\.cur\{top:(\d+)px;height:(\d+)px;/m);
  assert.ok(lane && cap && cur, 'a rule the caption row rests on is gone');
  assert.ok(+cap[1] >= +cur[1] + +cur[2] + 4, 'a caption sits under the ring of the step in front of the cook');
  assert.ok(+lane[1] >= +cap[1] + 15, 'the lane is too short for its caption row');
});
