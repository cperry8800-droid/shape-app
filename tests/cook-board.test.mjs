// The burners-and-tracks cook screen's logic: where each dish is on the stove, one lane per
// dish on a shared clock, the slice of the clock shown, and the ready time. Pure functions,
// driven here without React; the screen only draws what these return.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bsTrackLanes, bsTrackWindow, bsCookNowMin, bsCookFinishAt, bsPlanEnd, bsHobOccupancy, bsEventMinutes,
  bsDishColor, bsDishColors, bsHeroHue, bsColorGap, BS_DISH_COLORS, BS_DISH_MIN_GAP, bsInkOn, bsContrast, BS_DISH_MIN_CONTRAST, BS_HOB_MAX,
} from '../mobile-app/src/services/cookBoard.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import { BS_ORCH } from '../mobile-app/src/services/cookOrchestrator.mjs';

const MIN = 60000;
const ev = (iid, stepIndex, at, min, station, extra = {}) => ({ iid, recipe: `r${iid}`, title: `Dish ${iid}`, stepIndex, text: `Step ${stepIndex} of dish ${iid}.`, at, min, passive: false, station, ...extra });

test('lanes: one per dish instance, in the order dishes first appear, with step numbers per lane', () => {
  const tl = [ev(0, 0, 0, 5, 'board'), ev(1, 0, 5, 4, 'stove'), ev(0, 1, 9, 10, 'stove', { passive: true }), ev(1, 1, 19, 3, 'board')];
  const lanes = bsTrackLanes(tl, 2);
  assert.deepEqual(lanes.map((l) => l.iid), [0, 1]);
  assert.deepEqual(lanes[0].blocks.map((b) => [b.stepNo, b.of, b.at, b.end, b.hold, b.past, b.current]),
    [[1, 2, 0, 5, false, true, false], [2, 2, 9, 19, true, false, true]]);
  assert.deepEqual(lanes[1].blocks.map((b) => [b.stepNo, b.past]), [[1, true], [2, false]]);
  // Two copies of one recipe are two pans, so two lanes.
  const twin = bsTrackLanes([{ ...ev(0, 0, 0, 3, 'stove'), recipe: 'same' }, { ...ev(1, 0, 0, 3, 'stove'), recipe: 'same' }]);
  assert.equal(twin.length, 2);
  // A step with no authored length takes the planner's stand-in, the same figure progress uses.
  assert.equal(bsTrackLanes([{ ...ev(0, 0, 4, undefined, 'board') }])[0].blocks[0].end, 4 + BS_ORCH.activeStepMin);
  assert.equal(bsEventMinutes({ min: 0 }), BS_ORCH.activeStepMin);
  assert.deepEqual(bsTrackLanes(null), []);
});

test('now: real minutes since the start with a clock, the current step\'s planned minute without one', () => {
  const tl = [ev(0, 0, 0, 5, 'board'), ev(0, 1, 12, 5, 'board')];
  const now = 1_000_000_000;
  assert.equal(bsCookNowMin({ anchor: now - 7 * MIN, now, timeline: tl, cursor: 1 }), 7);
  for (const anchor of [undefined, null, NaN, 'x']) assert.equal(bsCookNowMin({ anchor, now, timeline: tl, cursor: 1 }), 12, String(anchor));
  assert.equal(bsCookNowMin({ now, timeline: [], cursor: 0 }), 0);
});

test('window: a phone shows a moving slice around now, a wide screen shows the whole cook', () => {
  const tl = [ev(0, 0, 0, 5, 'board'), ev(0, 1, 70, 20, 'stove')];
  assert.equal(bsPlanEnd(tl), 90);
  const phone = bsTrackWindow({ timeline: tl, nowMin: 30 });
  assert.ok(phone.from <= 30 && phone.to > 30 + 30, JSON.stringify(phone));
  assert.equal(phone.to - phone.from, 46);
  assert.ok(bsTrackWindow({ timeline: tl, nowMin: 0 }).from >= -2, 'never opens far before minute zero');
  const wide = bsTrackWindow({ timeline: tl, nowMin: 30, wide: true });
  assert.ok(wide.from <= 0 && wide.to >= 90, JSON.stringify(wide));
  // Running over the plan keeps now on screen.
  assert.ok(bsTrackWindow({ timeline: tl, nowMin: 120, wide: true }).to >= 120);
});

test('ready around: the planned finish, pushed back by lateness; a serve time wins; never invented', () => {
  const tl = [ev(0, 0, 0, 5, 'board'), ev(0, 1, 10, 20, 'stove')];
  const anchor = 1_000_000_000;
  // On time at the second step: the planned end, 30 minutes after the start.
  assert.equal(bsCookFinishAt({ anchor, now: anchor + 10 * MIN, timeline: tl, cursor: 1 }), anchor + 30 * MIN);
  // Working through the step's own twenty minutes is on time, however far into it.
  assert.equal(bsCookFinishAt({ anchor, now: anchor + 18 * MIN, timeline: tl, cursor: 1 }), anchor + 30 * MIN);
  assert.equal(bsCookFinishAt({ anchor, now: anchor + 30 * MIN, timeline: tl, cursor: 1 }), anchor + 30 * MIN);
  // Still at it eight minutes past its end: eight minutes later.
  assert.equal(bsCookFinishAt({ anchor, now: anchor + 38 * MIN, timeline: tl, cursor: 1 }), anchor + 38 * MIN);
  // Ahead of plan is not a reason to promise an earlier dinner.
  assert.equal(bsCookFinishAt({ anchor, now: anchor + 2 * MIN, timeline: tl, cursor: 1 }), anchor + 30 * MIN);
  assert.equal(bsCookFinishAt({ anchor, now: anchor, timeline: tl, cursor: 1, serveAt: anchor + 99 * MIN }), anchor + 99 * MIN);
  // No clock: now plus what is left from the current step.
  assert.equal(bsCookFinishAt({ now: anchor, timeline: tl, cursor: 1 }), anchor + 20 * MIN);
  assert.equal(bsCookFinishAt({ now: anchor, timeline: [], cursor: 0 }), null);
});

test('stove: the current step stands at the first free burner, and says which', () => {
  const tl = [ev(0, 0, 0, 5, 'stove'), ev(1, 0, 5, 5, 'board')];
  const o = bsHobOccupancy({ timeline: tl, cursor: 0, kitchen: { stove: 2 } });
  assert.equal(o.burners, 2);
  assert.deepEqual(o.stove.map((s) => [s.iid, s.kind]), [[0, 'now']]);
  assert.deepEqual(o.where, { station: 'stove', n: 1 });
  const b = bsHobOccupancy({ timeline: tl, cursor: 1, kitchen: { stove: 2 } });
  assert.deepEqual(b.where, { station: 'board', n: 1 });
});

test('stove: a running hold keeps its burner and counts down; a finished one says so', () => {
  const now = 1_000_000_000;
  const tl = [ev(0, 0, 0, 20, 'stove', { passive: true }), ev(1, 0, 0, 4, 'board')];
  const timers = [{ id: 7, iid: 0, recipeKey: 'r0', title: 'Dish 0', station: 'stove', stepIndex: 0, endsAt: now + 90 * 1000 }];
  const o = bsHobOccupancy({ timeline: tl, cursor: 1, timers, now, kitchen: { stove: 1 } });
  assert.deepEqual(o.stove.map((s) => [s.iid, s.kind, s.left, s.up, s.timerId]), [[0, 'hold', 90, false, 7]]);
  assert.deepEqual(o.board.map((s) => [s.iid, s.kind]), [[1, 'now']]);
  const rung = bsHobOccupancy({ timeline: tl, cursor: 1, timers: [{ ...timers[0], endsAt: now - 1 }], now });
  assert.deepEqual(rung.stove.map((s) => [s.kind, s.up, s.left]), [['hold', true, 0]]);
  // A soft convenience countdown never claims a station.
  const soft = bsHobOccupancy({ timeline: tl, cursor: 1, timers: [{ ...timers[0], soft: true, station: null }], now });
  assert.equal(soft.stove.length, 0);
});

test('stove: a dish\'s simmer and its next step are one pan, drawn once and marked as the current step', () => {
  const now = 1_000_000_000;
  const tl = [ev(0, 0, 0, 10, 'stove', { passive: true }), ev(0, 1, 10, 3, 'stove')];
  const timers = [{ id: 1, iid: 0, title: 'Dish 0', station: 'stove', stepIndex: 0, endsAt: now + 60000 }];
  const o = bsHobOccupancy({ timeline: tl, cursor: 1, timers, now, kitchen: { stove: 2 } });
  assert.equal(o.stove.length, 1, `one pan, one burner: ${JSON.stringify(o.stove)}`);
  assert.equal(o.stove[0].now, true);
  assert.deepEqual(o.where, { station: 'stove', n: 1 });
});

test('stove: a pan its last step left on the heat stays drawn until its next step, and only then', () => {
  const tl = [ev(0, 0, 0, 4, 'stove'), ev(1, 0, 4, 3, 'board'), ev(0, 1, 7, 3, 'stove')];
  const between = bsHobOccupancy({ timeline: tl, cursor: 1, kitchen: { stove: 1 } });
  assert.deepEqual(between.stove.map((s) => [s.iid, s.kind]), [[0, 'heat']]);
  // A step the recipe says may wait off the heat takes the pan off.
  const paused = bsHobOccupancy({ timeline: [{ ...tl[0], maxPause: 5 }, tl[1], tl[2]], cursor: 1, kitchen: { stove: 1 } });
  assert.equal(paused.stove.length, 0);
  // A dish with nothing left to do is off the stove.
  const done = bsHobOccupancy({ timeline: [tl[0], tl[1]], cursor: 1, kitchen: { stove: 1 } });
  assert.equal(done.stove.length, 0);
});

test('stove: a second pan (`also`) takes a second burner; more pans than rings are counted, not dropped', () => {
  const tl = [ev(0, 0, 0, 5, 'stove', { also: ['stove'] })];
  const two = bsHobOccupancy({ timeline: tl, cursor: 0, kitchen: { stove: 2 } });
  assert.equal(two.stove.length, 2);
  const one = bsHobOccupancy({ timeline: tl, cursor: 0, kitchen: { stove: 1 } });
  assert.equal(one.stove.length, 1);
  assert.equal(one.overflow.stove, 1);
  // Eight burners draw four rings.
  assert.equal(bsHobOccupancy({ timeline: tl, cursor: 0, kitchen: { stove: 8 } }).burners, BS_HOB_MAX.stove);
  // Junk kitchen figures read as one of each, like the planner.
  const junk = bsHobOccupancy({ timeline: tl, cursor: 0, kitchen: { stove: 'x', oven: -3 } });
  assert.equal(junk.burners, 1); assert.equal(junk.ovens, 1);
});

test('dish colours read on every paper the app ships, and the text on them reads too', () => {
  // The papers are READ from the theme source, so a paper added later is covered here with
  // nobody remembering this test exists.
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheet.jsx', import.meta.url), 'utf8');
  const papers = [...src.matchAll(/^\s*(\w+):\s*\{\s*paper: '(#[0-9a-f]{6})', paper2: '(#[0-9a-f]{6})'.*?light: (true|false)/gim)]
    .map((m) => ({ name: m[1], paper: m[2], paper2: m[3], light: m[4] === 'true' }));
  assert.ok(papers.length >= 18, `read only ${papers.length} papers from the theme; the pattern has drifted`);
  for (const p of papers) {
    for (const surface of [p.paper, p.paper2]) {
      const cs = [0, 1, 2, 3, 4, 5].map((i) => bsDishColor(i, p.light, surface));
      assert.equal(new Set(cs).size, cs.length, `${p.name}: two dishes share a colour`);
      for (const c of cs) {
        assert.ok(bsContrast(c, surface) >= BS_DISH_MIN_CONTRAST, `${p.name} ${surface}: ${c} is ${bsContrast(c, surface).toFixed(2)}:1`);
        assert.ok(bsContrast(c, bsInkOn(c)) >= 4.5, `${p.name}: text on ${c} reads ${bsContrast(c, bsInkOn(c)).toFixed(2)}:1`);
      }
    }
  }
  // Order is identity: the same index is the same colour on the same paper.
  assert.equal(bsDishColor(7, false, '#181612'), bsDishColor(1, false, '#181612'));
});

// The papers, READ from the theme source so a paper added later is covered with nobody
// remembering these tests exist.
const PAPERS = (() => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheet.jsx', import.meta.url), 'utf8');
  return [...src.matchAll(/^\s*(\w+):\s*\{\s*paper: '(#[0-9a-f]{6})', paper2: '(#[0-9a-f]{6})'.*?light: (true|false)/gim)]
    .map((m) => ({ name: m[1], paper: m[2], paper2: m[3], light: m[4] === 'true' }));
})();
const hueOf = (title) => bsHeroHue((SHAPE_KITCHEN_RECIPES.find((r) => r.title === title) || {}).hero);

test('a dish wears its own card\'s hue, as the approved preview drew it', () => {
  // The preview's pair: the steak hash in its card's red, the chicken in its card's amber —
  // on the dark paper exactly the colours the preview showed, since both already read there.
  const steak = hueOf('Steak and sweet potato hash');
  const chicken = hueOf('One-pan chicken and rice');
  assert.equal(steak, '#c95a3c');
  assert.equal(chicken, '#e8b06a');
  const dark = PAPERS.find((p) => !p.light);
  assert.ok(dark, 'the theme has no dark paper — this test cannot run');
  assert.deepEqual(bsDishColors([steak, chicken], false, dark.paper2), ['#c95a3c', '#e8b06a']);
  // On a light paper the same hues, darkened only as far as it takes to read.
  const light = PAPERS.find((p) => p.light);
  const [s2, c2] = bsDishColors([steak, chicken], true, light.paper2);
  assert.notEqual(s2, c2);
  assert.ok(bsColorGap(s2, BS_DISH_COLORS.light[0]) > 0 && bsColorGap(s2, steak) < bsColorGap(s2, '#1d6a96'),
    `the steak lost its own hue on ${light.name}: ${s2}`);
  // A card with no colour in it has no hue to wear.
  assert.equal(bsHeroHue('linear-gradient(135deg, #1a1612 0%, #1a1612 100%)'), null);
  assert.equal(bsHeroHue(undefined), null);
});

test('two dishes never share a colour: a hue too close to one already on screen takes the fixed set', () => {
  const chicken = hueOf('One-pan chicken and rice');
  const salmon = hueOf('Sheet-pan salmon, sweet potato and broccoli');
  assert.ok(chicken && salmon, 'catalog no longer has these two — repin this test, do not delete it');
  assert.ok(bsColorGap(chicken, salmon) < BS_DISH_MIN_GAP, 'guard the guard: these two card hues must be near-identical');
  for (const p of PAPERS) {
    const cs = bsDishColors([chicken, salmon, null, null], p.light, p.paper2);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      assert.ok(bsColorGap(cs[i], cs[j]) >= BS_DISH_MIN_GAP, `${p.name}: dishes ${i} and ${j} read alike (${cs[i]} / ${cs[j]})`);
    }
  }
  // A dish with no card (a member's own recipe) takes the fixed set; the same list gives the
  // same colours every time, so a dish keeps its colour from setup through the cook.
  const bone = PAPERS.find((p) => p.light);
  assert.deepEqual(bsDishColors([null], bone.light, bone.paper2), [bsDishColor(0, bone.light, bone.paper2)]);
  assert.deepEqual(bsDishColors([chicken, salmon], bone.light, bone.paper2), bsDishColors([chicken, salmon], bone.light, bone.paper2));
});

test('every catalog dish\'s colour reads on every paper, and so does the number printed on it', () => {
  const hues = SHAPE_KITCHEN_RECIPES.map((r) => bsHeroHue(r.hero)).filter(Boolean);
  assert.ok(hues.length >= 90, `read only ${hues.length} card hues from the catalog`);
  assert.ok(PAPERS.length >= 18, `read only ${PAPERS.length} papers from the theme; the pattern has drifted`);
  for (const p of PAPERS) {
    for (const surface of [p.paper, p.paper2]) {
      for (const h of hues) {
        const [c] = bsDishColors([h], p.light, surface);
        assert.ok(bsContrast(c, surface) >= BS_DISH_MIN_CONTRAST, `${p.name} ${surface}: ${h} → ${c} is ${bsContrast(c, surface).toFixed(2)}:1`);
        assert.ok(bsContrast(c, bsInkOn(c)) >= 4.5, `${p.name}: text on ${c} (from ${h}) reads ${bsContrast(c, bsInkOn(c)).toFixed(2)}:1`);
      }
    }
  }
});

test('lanes carry each step\'s recipe step, which a replan does not renumber', () => {
  // A Serve replan rebuilds the timeline, so the cursor index a timer was started at stops
  // pointing at its block. The recipe's own step number does not move.
  const lanes = bsTrackLanes([ev(3, 4, 0, 5, 'stove'), ev(3, 5, 5, 5, 'board')], 0);
  assert.deepEqual(lanes[0].blocks.map((b) => [b.idx, b.step]), [[0, 4], [1, 5]]);
});

test('stove: a step waiting for its station is not drawn standing at it', () => {
  // Dish 1's step needs the only burner, which dish 0's running timer holds. The step cannot
  // start, so it stands nowhere yet: no second pan on burner 1, no "more on the heat".
  const now = 1_000_000_000;
  const tl = [ev(0, 0, 0, 20, 'stove', { passive: true }), ev(1, 0, 0, 5, 'stove')];
  const timers = [{ id: 1, iid: 0, title: 'Dish 0', station: 'stove', stepIndex: 0, endsAt: now + 60000 }];
  const waiting = bsHobOccupancy({ timeline: tl, cursor: 1, timers, now, kitchen: { stove: 1 }, current: false });
  assert.deepEqual(waiting.stove.map((s) => [s.iid, s.kind]), [[0, 'hold']]);
  assert.equal(waiting.overflow.stove, 0);
  assert.equal(waiting.where, null);
  // The control: drawn, the same step would claim a burner the kitchen does not have.
  assert.equal(bsHobOccupancy({ timeline: tl, cursor: 1, timers, now, kitchen: { stove: 1 } }).overflow.stove, 1);
  // A pan its own last step left on the heat is still drawn while the next step waits.
  const pan = [ev(1, 0, 0, 4, 'stove'), ev(0, 0, 4, 20, 'oven', { passive: true }), ev(1, 1, 24, 3, 'oven')];
  const held = [{ id: 2, iid: 0, title: 'Dish 0', station: 'oven', stepIndex: 1, endsAt: now + 60000 }];
  const o = bsHobOccupancy({ timeline: pan, cursor: 2, timers: held, now, kitchen: { stove: 1, oven: 1 }, current: false });
  assert.deepEqual(o.stove.map((s) => [s.iid, s.kind]), [[1, 'heat']]);
});
