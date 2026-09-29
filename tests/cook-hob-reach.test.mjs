// Every running countdown has a Done the cook can reach (Copilot, third round on #2179).
//
// The stove drawing makes a burner or the oven a button while a timer runs there, so the cook
// can call a dish early. The board, the resting spot, a "+N" and a pan past the burners drawn
// are pictures, and the card used to leave out every timer with a station — so a resting timer
// ("press the tofu 10 minutes") had no Done and no keyboard action until it ran out.
// bsHobTappable is the one answer for both: what the stove offers as a button, and so what the
// card does NOT have to carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SRC, drive, textOf, flatten as flattenNode, loadBroadsheet, importSibling } from './helpers/broadsheet-mount.mjs';
import { bsHobOccupancy, bsHobTappable } from '../mobile-app/src/services/cookBoard.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const MOD = await loadBroadsheet(['BSCookMode', 'BSPrepCook']);
const { SHAPE_KITCHEN_RECIPES } = await importSibling('shapeKitchenData.js');
const { bsCookableFromRecipe } = await importSibling('..', 'services', 'cookable.mjs');
const { bsOrchestrate, BS_COOK_MODE } = await importSibling('..', 'services', 'cookOrchestrator.mjs');

const NOW = 1_800_000_000_000;
const hold = (id, station, extra = {}) => ({ id, iid: 0, recipeKey: 'r', title: 'Dish', station, stepIndex: 0, endsAt: NOW + 60_000, ...extra });
const occOf = (timers, stove = 4) => bsHobOccupancy({ timeline: [], cursor: 0, timers, now: NOW, kitchen: { stove, oven: 1 }, current: false });

test('bsHobTappable: burners and the oven are buttons; the board, resting and the extras are not', () => {
  const occ = occOf([hold(1, 'stove'), hold(2, 'oven'), hold(3, 'off'), hold(4, 'board')]);
  assert.deepEqual([...bsHobTappable(occ)].sort(), [1, 2]);
  // Guard the guard: the untappable ones ARE drawn, so leaving them off the card leaves them nowhere.
  assert.ok(occ.off.some((o) => o.timerId === 3) && occ.board.some((o) => o.timerId === 4),
    'the resting and board holds must be drawn for this test to mean anything');
});

test('bsHobTappable: a finished hold, a hold with no id, and a pan past the burners drawn are not buttons', () => {
  const up = occOf([hold(1, 'stove', { endsAt: NOW - 1 })]);
  assert.equal(bsHobTappable(up).size, 0, 'a hold whose time is up is announced by its alarm, not tapped');
  const carried = occOf([hold(null, 'stove')]);
  assert.equal(bsHobTappable(carried).size, 0, 'a hold with no id (handed up from an earlier dish) is a picture');
  // Six burners, five pans: the stove draws four, the fifth is only "+1 more on the heat".
  const many = occOf([1, 2, 3, 4, 5].map((i) => hold(i, 'stove')), 6);
  assert.equal(many.overflow.stove, 1, 'guard the guard: one pan must overflow the burners drawn');
  assert.deepEqual([...bsHobTappable(many)].sort(), [1, 2, 3, 4]);
  // A pan on a burner AND something resting (two claims) is reachable through its burner.
  const both = occOf([hold(7, 'stove', { also: ['off'] })]);
  assert.deepEqual([...bsHobTappable(both)], [7]);
  assert.equal(bsHobTappable(null).size, 0);
  // The step in front of the cook, and a pan still on the heat, are drawn on a burner with no
  // timer: nothing to call early, so no button.
  const tl = [{ iid: 0, title: 'Dish', stepIndex: 0, text: 'Sear', at: 0, min: 4, station: 'stove' }];
  const now = bsHobOccupancy({ timeline: tl, cursor: 0, timers: [], now: NOW, kitchen: { stove: 4, oven: 1 }, current: true });
  assert.ok(now.stove.some((o) => o.kind === 'now'), 'guard the guard: the current step must be on a burner');
  assert.equal(bsHobTappable(now).size, 0, 'the step in front of the cook has no timer to call early');
});

// The stove's own drawing and the card must agree, so the stove asks the same question.
test('the stove draws a zone as a button exactly when bsHobTappable says so, and both screens use it for the card', () => {
  const src = stripComments(readFileSync(SRC, 'utf8'));
  const hob = src.slice(src.indexOf('function bsCkHob('), src.indexOf('const bsCkHobOff'));
  assert.match(hob, /bsHobTappable\(occ\)/, 'bsCkHob no longer asks bsHobTappable which zones are buttons');
  for (const name of ['BSCookMode', 'BSPrepCook']) {
    const at = src.indexOf(`function ${name}(`);
    const next = src.indexOf('\nfunction ', at + 10);
    const body = src.slice(at, next);
    assert.match(body, /bsHobTappable\(occ\)/, `${name} no longer asks bsHobTappable which timers the stove carries`);
    assert.match(body, /cardRunning\.map\(/, `${name} no longer lists the card's running timers`);
  }
});

const pressTofu = () => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === 'Crispy tofu grain bowl');
  assert.ok(r, 'catalog no longer has the crispy tofu bowl — repin this test to another resting step, do not delete it');
  const c = bsCookableFromRecipe(r);
  assert.equal(c.stepMeta[0].station, 'off', 'guard the guard: the first step must be a resting step');
  return c;
};
const curStep = (s) => {
  const p = s.nodes().find((n) => n.type === 'p' && /(^|\s)step(\s|$)/.test(String((n.props && n.props.className) || '')));
  return p ? textOf(p) : '';
};
const doneIn = (row) => flattenNode(row).find((n) => n.type === 'button' && n.props.onClick && /Done/.test(textOf(n)));

test('one dish: a resting timer gets its Done on the card, and it works', () => {
  const s = drive(MOD.BSCookMode, { cookable: pressTofu(), onClose() {} });
  if (s.buttons().some((b) => b.label.startsWith('Next: ingredients'))) s.click('Next: ingredients');
  if (s.buttons().some((b) => b.label.startsWith('Start cooking'))) s.click('Start cooking');
  s.click('', (n) => n.props.className === 'tbtn');
  const rows = () => s.nodes().filter((n) => /^s\d+$/.test(String(n.key || '')));
  assert.equal(rows().length, 1, `the running press has no row on the card: ${s.text.slice(0, 300)}`);
  assert.match(textOf(rows()[0]), /Resting/, 'the row must say where the timer is');
  // Guard the guard: the stove's resting spot is a picture, so the card is the only way to Done.
  const rst = s.nodes().find((n) => typeof n.props?.className === 'string' && /(^|\s)rst(\s|$)/.test(n.props.className));
  assert.ok(rst && rst.type !== 'button', 'the resting spot is expected to be a picture here');
  const btn = doneIn(rows()[0]);
  assert.ok(btn, 'the resting timer row has no Done');
  btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
  s.render();
  assert.equal(rows().length, 0, 'Done on the resting timer did not clear it');
});

test('one dish: a burner timer stays on its burner and is not repeated on the card', () => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => {
    const c = bsCookableFromRecipe(x);
    return c && c.stepMeta && c.stepMeta[0] && c.stepMeta[0].station === 'stove' && c.stepMeta[0].passive && /\d+\s*min/i.test(c.steps[0]);
  });
  assert.ok(r, 'no catalog recipe opens on a timed burner step any more — repin this test');
  const s = drive(MOD.BSCookMode, { cookable: bsCookableFromRecipe(r), onClose() {} });
  if (s.buttons().some((b) => b.label.startsWith('Next: ingredients'))) s.click('Next: ingredients');
  if (s.buttons().some((b) => b.label.startsWith('Start cooking'))) s.click('Start cooking');
  s.click('', (n) => n.props.className === 'tbtn');
  const zone = s.nodes().find((n) => n.type === 'button' && typeof n.props.className === 'string' && /(^|\s)zb1(\s|$)/.test(n.props.className));
  assert.ok(zone, 'the burner holding the running timer must be a button');
  assert.equal(s.nodes().filter((n) => /^s\d+$/.test(String(n.key || ''))).length, 0,
    'a burner timer is reachable on the stove; the card must not list it twice');
});

test('a prep session: a resting hold nothing is waiting on gets its Done on the card', () => {
  // The tofu presses on the resting spot while the cook moves on to the shrimp, so nothing is
  // WAITING on the press (no blocker row carries its Done): the card's list is the only place.
  const tofu = pressTofu();
  const shrimpR = SHAPE_KITCHEN_RECIPES.find((x) => x.title === 'Shrimp and quinoa harvest bowl');
  assert.ok(shrimpR, 'catalog no longer has the shrimp quinoa bowl — repin this test, do not delete it');
  const plan = bsOrchestrate([tofu, bsCookableFromRecipe(shrimpR)], { mode: BS_COOK_MODE.TOGETHER, kitchen: { stove: 4, oven: 1 } });
  const [first, second] = plan.timeline;
  assert.ok(first && first.station === 'off' && first.passive && second && second.iid !== first.iid,
    `guard the guard: the plan must open on the press and then move to the other dish: ${JSON.stringify(plan.timeline.slice(0, 2))}`);
  const s = drive(MOD.BSPrepCook, { items: [], timeline: plan.timeline, kitchen: { stove: 4, oven: 1 }, onClose() {}, onRecipePrepped() {}, onDone() {} });
  // A hands-off step's own button starts its countdown and moves the cook on ("Start … timer ·
  // keep going"); the countdown is the press itself, on the resting spot.
  s.click('Start');
  assert.ok(!/Press the tofu/.test(curStep(s)), `guard the guard: the cook must have moved on from the press: ${curStep(s)}`);
  assert.equal(s.nodes().filter((n) => String(n.key || '') === 'wait').length, 0,
    'guard the guard: nothing should be waiting on the press here');
  const rows = s.nodes().filter((n) => /^s\d+$/.test(String(n.key || '')) && /Resting/.test(textOf(n)));
  assert.equal(rows.length, 1, `the running press has no Done anywhere: ${s.text.slice(0, 400)}`);
  const btn = doneIn(rows[0]);
  assert.ok(btn, 'the resting hold row has no Done');
  btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
  s.render();
  assert.equal(s.nodes().filter((n) => /^s\d+$/.test(String(n.key || '')) && /Resting/.test(textOf(n))).length, 0,
    'Done on the resting hold did not clear it');
});

test('a prep session: a resting hold the next step waits on keeps ONE Done, on the waiting row', () => {
  // One dish: the press blocks its own next step, so the "waiting on" row carries its Done and
  // the card's list must not carry a second one for the same timer.
  const plan = bsOrchestrate([pressTofu()], { mode: BS_COOK_MODE.SEQUENCE, kitchen: { stove: 4, oven: 1 } });
  const s = drive(MOD.BSPrepCook, { items: [], timeline: plan.timeline, kitchen: { stove: 4, oven: 1 }, onClose() {}, onRecipePrepped() {}, onDone() {} });
  s.click('Start');
  const wait = s.nodes().find((n) => String(n.key || '') === 'wait');
  assert.ok(wait && doneIn(wait), `guard the guard: the next step must be waiting on the press, with a Done: ${s.text.slice(0, 400)}`);
  const listed = s.nodes().filter((n) => /^s\d+$/.test(String(n.key || '')));
  assert.equal(listed.length, 0, 'the press is on the waiting row AND in the card list: two Done buttons for one timer');
});
