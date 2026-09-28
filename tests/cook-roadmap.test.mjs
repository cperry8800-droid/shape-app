import test from 'node:test';
import assert from 'node:assert/strict';
import { bsSoloRoadmap, bsBoardRoadmap, bsRoadmapPercent, bsVisibleCookPercent } from '../mobile-app/src/services/cookRoadmap.mjs';
import { drive, loadBroadsheet, pressable } from './helpers/broadsheet-mount.mjs';
const MOD = await loadBroadsheet(['BSCookMode', 'BSPrepCook', 'BSPrepSession']);
const recipe = { title:'Rice', tier:1, steps:['Rinse rice.', 'Simmer for 20 minutes.', 'Serve.'], stepMeta:[{min:2},{min:20, passive:true,station:'stove'},{min:2}], ingredients:[] };
// The progress and the list of every step live in the All steps sheet, opened from the
// "Ready around" button in the top bar (class `fin`). Each row carries its state.
const openSteps = (s) => s.click('', (n) => /\bfin\b/.test(String(n.props.className || '')));
const stepStates = (s) => s.nodes().filter((n) => n.type === 'li' && n.props['data-state']).map((n) => n.props['data-state']);
const pctOf = (s) => Number((s.text.match(/(\d+)% done/) || [])[1]);

test('roadmap distinguishes skipped, current and running steps, including near-finished timers', () => {
  const rows = bsSoloRoadmap(recipe, {phase:'method', stepIdx:2, visited:{1:true}, skippedSteps:{0:true}, timers:[{stepIdx:1,endsAt:1000}], now:999});
  assert.deepEqual(rows.map(r=>r.state), ['skipped','holding','current']);
  assert.equal(rows[2].current,true);
  assert.equal(bsVisibleCookPercent(99.99,rows),99);
  const finished = bsSoloRoadmap(recipe,{phase:'plated',visited:{0:true,1:true,2:true},timers:[{stepIdx:1,endsAt:1000}],now:1000});
  assert.equal(bsRoadmapPercent(finished),100);
  const untimed = bsSoloRoadmap({...recipe,stepMeta:[]},{phase:'mise'});
  assert.ok(untimed.every(r=>!r.timed), 'fallback weights must not become authored duration claims');
});

test('board roadmap follows the replanned order and retains hold ownership by original step', () => {
  const timeline = [
    {iid:4,recipe:'rice',title:'Rice',stepIndex:1,text:'Simmer.',at:0,min:20},
    {iid:8,recipe:'salad',title:'Salad',stepIndex:0,text:'Toss.',at:2,min:3},
    {iid:4,recipe:'rice',title:'Rice',stepIndex:2,text:'Plate.',at:20,min:2},
  ];
  const holds=[{iid:4,recipeStep:1,stepIndex:99,endsAt:60000}];
  const rows=bsBoardRoadmap(timeline,1,holds,0);
  assert.deepEqual(rows.map(r=>r.state),['holding','current','upcoming']);
  assert.equal(rows[0].id,'4:1'); assert.equal(rows[1].dish,'Salad');
  assert.deepEqual(bsBoardRoadmap(timeline,3,holds,60000).map(r=>r.state),['done','done','done']);
});

test('the All steps sheet opens and closes without moving the cook', () => {
  const s = drive(MOD.BSCookMode, { cookable: recipe, onClose() {} });
  s.click('Start cooking');
  assert.equal(stepStates(s).length, 0, 'the sheet is not mounted until it is opened');
  openSteps(s);
  assert.deepEqual(stepStates(s), ['current', 'upcoming', 'upcoming']);
  assert.equal(s.nodes().filter((n) => n.props && n.props['aria-current'] === 'step').length, 1);
  assert.equal(pctOf(s), 0, 'nothing is cooked yet');
  s.click('Back to cooking');
  assert.equal(stepStates(s).length, 0, 'Back to cooking unmounts the sheet');
  openSteps(s);
  assert.deepEqual(stepStates(s), ['current', 'upcoming', 'upcoming'], 'opening the sheet changed nothing');
});

test('solo player passes real completion and skip state to the All steps sheet', () => {
  const s = drive(MOD.BSCookMode, { cookable: recipe, onClose() {} });
  s.click('Start cooking'); s.click('Skip');
  openSteps(s);
  assert.deepEqual(stepStates(s), ['skipped', 'current', 'upcoming']);
  s.click('Back to cooking');
  s.click('Done · next step');
  openSteps(s);
  assert.deepEqual(stepStates(s), ['skipped', 'done', 'current']);
  assert.ok(pctOf(s) > 0 && pctOf(s) < 100, `a part-cooked dish reads between 0 and 100 - got ${pctOf(s)}`);
});

test('board passes live timer state and preserves its roadmap in the finish handoff', () => {
  const timeline = [{ iid: 0, recipe: 'rice', title: 'Rice', stepIndex: 0, text: 'Chill for 20 minutes.', at: 0, min: 20, passive: true, station: 'off' }];
  let finish;
  const s = drive(MOD.BSPrepCook, { items: [{ key: 'rice', cookable: recipe }], timeline, onClose() {}, onRecipePrepped() {}, onDone: (...args) => { finish = args; } });
  s.click('Start {t} timer');
  assert.equal(finish[1].timeline[0].text, timeline[0].text);
  const wrap = bsBoardRoadmap(finish[1].timeline, 1, finish[0], Date.now());
  assert.equal(wrap[0].state, 'holding'); assert.ok(bsRoadmapPercent(wrap) < 100);
});

test('sequential handoff retains step outcomes and timer identity for the whole-session roadmap', () => {
  const s = drive(MOD.BSPrepSession, { program: [], catalog: true, onClose() {} });
  s.click('Greek yogurt power bowl', pressable); s.click('Cottage cheese protein toast', pressable);
  s.click('Set up your kitchen'); s.click('One after another'); s.click('Next: ingredients'); s.click('Start cooking');
  const first = s.nodes().find((n) => n.type === MOD.BSCookMode);
  const firstKey = first.props.prep.items[0].key;
  const state = { visited: { 0: true }, skippedSteps: { 1: true } };
  first.props.prep.onPrepped([{ id: 1, stepIdx: 0, endsAt: Date.now() + 60000, total: 60 }], state);
  s.render(); s.click('Start this dish');
  const second = s.nodes().find((n) => n.type === MOD.BSCookMode);
  assert.deepEqual(second.props.prep.progress[firstKey], state);
  assert.equal(second.props.prep.carried[0].dishIndex, 0);
  const rows = bsSoloRoadmap(second.props.cookable, { phase: 'method', stepIdx: 0 }, second.props.prep);
  assert.equal(rows[0].state, 'holding'); assert.equal(rows[1].state, 'skipped');
  assert.ok(rows.some((r) => r.dish === second.props.cookable.title && r.current));
});

test('the All steps sheet is a named modal dialog, mounted only while open', () => {
  const s = drive(MOD.BSCookMode, { cookable: recipe, onClose() {} });
  s.click('Start cooking');
  const dialog = () => s.nodes().find((n) => n.props && n.props.role === 'dialog' && n.props['aria-label'] === 'All steps');
  assert.ok(!dialog(), 'closed: the sheet is not in the tree');
  openSteps(s);
  assert.ok(dialog(), 'open: the sheet is a dialog named for what it lists');
  assert.equal(dialog().props['aria-modal'], 'true');
  s.click('Back to cooking');
  assert.ok(!dialog(), 'closed again: the sheet unmounts');
});
