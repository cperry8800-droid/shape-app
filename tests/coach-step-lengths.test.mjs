// A coach's meal-plan step carries the minutes its own text states, even when the coach left it
// hands-on, so the client's cook timeline draws it that long.
//
// ⚠ THE DEFECT, REGISTERED BY #2256, #2263 AND #2270. bsAuthorStep turned a coach's step into a
// hands-off window when the coach picked a station, and into bare text otherwise; a bare step has
// no length, so the planner charged it the assumed 3 minutes (cookOrchestrator.mjs, stepCost). A
// coach's "Simmer 20 minutes, stirring" drew as 3. A coach's last step lost its minutes too: a
// final oven window is dropped (a live-fire hold cannot be a dish's last step), and it was
// dropped to bare text, so "Bake 20 minutes" at the end of a plan drew as 3.
//
// Now a step with no window carries its stated minutes, attended: per side counts both sides,
// a range its low end, and a storage or make-ahead time ("refrigerate up to 4 hours") is not
// counted at all, which is why the planner reads no prose at plan time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bsAuthorStep, bsStepPerSide, bsCookableFromMeal } from '../mobile-app/src/services/cookable.mjs';
import { bsOrchestrate, BS_COOK_MODE } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsTrackLanes } from '../mobile-app/src/services/cookBoard.mjs';

const minOf = (text, station = null) => {
  const s = bsAuthorStep(text, station);
  assert.equal(s.passive === true, false, `"${text}" became a window`);
  return s.min ?? null;
};

test('a hands-on step carries the minutes it states, attended', () => {
  assert.deepEqual(bsAuthorStep('Simmer 20 minutes, stirring now and then.', null),
    { t: 'Simmer 20 minutes, stirring now and then.', min: 20, passive: false });
  assert.equal(minOf('Bake 1 hour, then rest 10 minutes.'), 60, 'the first time it states');
  assert.equal(minOf('Rest 240 seconds.'), 4, 'exactly 4 minutes counts');
  assert.equal(minOf('Rest 210 seconds.'), null, 'under 4 minutes the planner\'s 3 is close enough');
  assert.equal(minOf('Chop everything small.'), null, 'no stated time, no minutes');
});

// ⚠ Codex, on the first head: "Bake 1 hour 15 minutes" stored 60, so the plan moved on a quarter
// of an hour early. A smaller unit straight after a larger one is the same time.
test('an hour-and-minute time is one time; two actions are two', () => {
  assert.equal(minOf('Bake 1 hour 15 minutes, until golden.'), 75);
  assert.equal(minOf('Simmer 1 hour and 10 minutes.'), 70);
  assert.equal(minOf('Bake 1 hr 5 min.'), 65);
  assert.equal(minOf('Bake 1 hour, then rest 15 minutes.'), 60, 'the first action\'s time');
  assert.equal(minOf('Rest 5 minutes 10 minutes.'), 5, 'the same unit twice is not one time');
  assert.equal(minOf('Cook 2 minutes 30 seconds.'), null, '2.5 minutes: under 4');
  assert.equal(minOf('Cook 3 minutes 30 seconds a side.'), 7, 'both sides of 3.5 minutes');
  // A window reads it the same way.
  assert.deepEqual(bsAuthorStep('Bake 1 hour 15 minutes, covered.', 'oven'),
    { t: 'Bake 1 hour 15 minutes, covered.', min: 75, passive: true, station: 'oven' });
});

test('a step timed per side is both sides', () => {
  assert.equal(minOf('Sear 4 minutes a side, until it releases.'), 8);
  assert.equal(minOf('Sear 4 min/side over medium-high.'), 8);
  assert.equal(minOf('Cook 3 minutes on each side.'), 6);
  assert.equal(minOf('Grill 5 minutes per side.'), 10);
  assert.equal(minOf('Flip and cook 4 minutes on the other side.'), 4, 'one side is one side');
  assert.equal(minOf('Scatter the walnuts over the granola side, then rest 5 minutes.'), 5, 'a "side" that is not the time\'s');
});

test('a range is its low end', () => {
  assert.equal(minOf('Simmer 8 to 10 minutes, until thick.'), 8);
  assert.equal(minOf('Simmer 8–10 minutes, until thick.'), 8);
  assert.equal(minOf('Braise 1 to 2 hours.'), 60, 'in the range\'s own unit');
  assert.equal(minOf('Simmer 3 to 5 minutes.'), null, 'the cook may be done at 3');
});

test('a storage, make-ahead or decimal time is never counted as work', () => {
  for (const text of [
    'Blend until smooth, or cover and refrigerate up to 4 hours before drinking.',
    'Keeps 3 days in the fridge; reheat 5 minutes.',
    'Soak the beans 4 hours.',
    'Marinate 30 minutes.',
    'Freeze 30 minutes, then slice.',
    'Make ahead: bake 20 minutes and store.',
    'Leave the oats overnight, then simmer 5 minutes.',
    'Simmer 1.5 hours.',
  ]) assert.deepEqual(bsAuthorStep(text, null), { t: text }, text);
  // "keep" is a cooking word, not storage.
  assert.equal(minOf('Keep the lid on and simmer 20 minutes.'), 20);
});

test('a station the coach picked stays on a step that cannot be hands-off', () => {
  // Too short to walk away from, but timed per side: attended on that burner.
  assert.deepEqual(bsAuthorStep('Cook 3 minutes on each side.', 'stove'),
    { t: 'Cook 3 minutes on each side.', min: 6, passive: false, station: 'stove' });
  // A window is unchanged.
  assert.deepEqual(bsAuthorStep('Simmer 15 minutes, lid on.', 'stove'),
    { t: 'Simmer 15 minutes, lid on.', min: 15, passive: true, station: 'stove' });
  // A station the board does not know is not carried.
  assert.equal('station' in bsAuthorStep('Simmer 15 minutes.', 'microwave'), false);
});

// A HANDS-OFF PICK READS THE TIME THE SAME WAY (owner, 2026-10-08: "can you fix this?"). The
// window used to take the parser's first figure, so "sear 4 minutes a side" on the stove became a
// four-minute hold that hid the turn behind its timer (the cook screen shows no step text during
// a hold), and "simmer 8 to 10 minutes" a ten-minute one that returned the cook two minutes late.
// These are the catalog's own window rules (tests/shape-kitchen-data.test.mjs: nothing to turn
// during a hold, a range is its low end), applied where a coach writes the step.
test('a hands-off pick on a per-side step is never a window: attended, both sides, on that station', () => {
  for (const [text, min] of [
    ['Sear 4 minutes a side, until it releases.', 8],
    ['Sear 4 min/side over medium-high.', 8],
    ['Grill 5 minutes per side.', 10],
    ['Cook it 6 minutes on each side.', 12],
  ]) {
    assert.deepEqual(bsAuthorStep(text, 'stove'), { t: text, min, passive: false, station: 'stove' }, text);
    assert.equal(bsStepPerSide(text), true, text);
  }
  // The editor's hint names exactly this case, and nothing else.
  for (const text of ['Simmer 15 minutes, lid on.', 'Flip and cook 4 minutes on the other side.', 'Scatter it over the granola side, then rest 5 minutes.', 'Sear 1.5 minutes a side.', 'Plate it.', '', null]) {
    assert.equal(bsStepPerSide(text), false, String(text));
  }
});

test('a hands-off range is a window from its low end; one starting under 4 minutes has none', () => {
  assert.deepEqual(bsAuthorStep('Simmer 8 to 10 minutes, lid on.', 'stove'),
    { t: 'Simmer 8 to 10 minutes, lid on.', min: 8, passive: true, station: 'stove' });
  assert.deepEqual(bsAuthorStep('Roast 18–20 minutes.', 'oven'),
    { t: 'Roast 18–20 minutes.', min: 18, passive: true, station: 'oven' }, 'the en-dash form, as before');
  assert.equal(bsAuthorStep('Braise 1 to 2 hours, covered.', 'oven').min, 60, 'in the range\'s own unit');
  assert.deepEqual(bsAuthorStep('Simmer 3 to 5 minutes.', 'stove'), { t: 'Simmer 3 to 5 minutes.' }, 'the cook may be needed at 3');
  // A plain window is untouched.
  assert.deepEqual(bsAuthorStep('Chill 30 minutes.', 'off'), { t: 'Chill 30 minutes.', min: 30, passive: true, station: 'off' });
});

test('a coach\'s meal draws each step as long as it says, its last bake included', () => {
  // The assign path (iosAppBroadsheetPros.jsx) runs every step through bsAuthorStep: a plain
  // string with no station, an object with the station the coach picked.
  const authored = [
    ['Pat the chicken dry and season it.', null],
    ['Sear 4 minutes a side, until it releases.', null],
    ['Simmer the sauce 12 minutes, stirring now and then.', null],
    ['Spoon it over and bake 20 minutes.', 'oven'],
  ].map(([t, st]) => bsAuthorStep(t, st));
  assert.equal(authored[3].passive, true, 'the coach marked the bake hands-off');
  const c = bsCookableFromMeal({ id: 'coach-1', title: 'Coach chicken', kcal: 600, steps: authored }, []);
  assert.deepEqual(c.stepMeta.map((m) => m.min), [null, 8, 12, 20]);
  assert.deepEqual(c.stepMeta.map((m) => m.passive), [false, false, false, false], 'a dish\'s last step is never a live-fire hold');
  assert.equal(c.stepMeta[3].station, 'oven', 'the oven stays busy for the bake');
  const { timeline } = bsOrchestrate([{ key: 'c', title: c.title, steps: c.steps, stepMeta: c.stepMeta }], { mode: BS_COOK_MODE.SEQUENCE });
  const [lane] = bsTrackLanes(timeline, 0);
  assert.deepEqual(lane.blocks.map((b) => b.end - b.at), [3, 8, 12, 20]);
});

test('the coach editor keeps a dropped last window\'s minutes when it publishes', () => {
  // The editor drops a live-fire last window at publish, as cookable.mjs does when the client
  // opens the meal. Both keep the minutes and station.
  const src = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', 'utf8');
  assert.match(src, /if \(li >= 0 && ds\[li\]\.passive === true && ds\[li\]\.station !== 'off'\) ds\[li\] = \{ \.\.\.ds\[li\], passive: false \};/);
});
