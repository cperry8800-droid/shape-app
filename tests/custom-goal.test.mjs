// tests/custom-goal.test.mjs
//
// A MEMBER CAN WRITE THEIR OWN GOAL (owner, 2026-10-20: "make sure user can make custom
// goals"). The Goals page's picker and the first-run goal step listed twelve goals and
// nothing else, so a goal outside the list could not be set at all. Both now carry
// "Your own goal": the words are saved as the member typed them (tidied) to
// client_goals.primaryGoal and to the profile's client_identity.goal mirror, and a
// listed goal typed by its name ("lose fat") is saved as that goal's token.
//
// These mount the shipped components with a react impl whose effects run, over a fake
// shapeDb, so the load → pick → save path is the one production takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, textOf, SHIM } from './helpers/broadsheet-mount.mjs';

globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
// The picker portals into #bs-phone-surface, else document.body; the harness's
// createPortal hands the sheet back in place, so a body to name is all it needs.
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null, body: {} };

const RUN_EFFECTS = { ...SHIM, useEffect(fn) { fn(); } };
const { BSClientGoals, BSIntentStep } = await loadBroadsheet(['BSClientGoals', 'BSIntentStep'], RUN_EFFECTS);

const settle = () => new Promise((r) => setTimeout(r, 0));

function fakeDb(docs) {
  const saves = [];
  return {
    saves,
    docs,
    async getUserGoals(k) { return k in docs ? JSON.parse(JSON.stringify(docs[k])) : {}; },
    async saveUserGoals(k, v) { saves.push([k, JSON.parse(JSON.stringify(v))]); docs[k] = JSON.parse(JSON.stringify(v)); return { ok: true }; },
  };
}

function signIn(docs) {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-a' } }) };
  globalThis.window.ShapeProgress = { train: async () => null, nutrition: async () => null, progress: async () => null };
  globalThis.window.__bsToast = () => {};
  const db = fakeDb(docs);
  globalThis.window.shapeDb = db;
  return db;
}

const h1 = (d) => { const n = d.nodes().find((x) => x.type === 'h1'); return n ? textOf(n) : null; };
const radios = (d) => d.nodes().filter((n) => n.props && n.props.role === 'radio');
const ownRow = (d) => radios(d).find((n) => textOf(n).startsWith('Your own goal'));
const ownInput = (d) => d.nodes().find((n) => n.type === 'input' && n.props['aria-label'] === 'Your goal, in your words');
const press = (d, node) => { node.props.onClick({ preventDefault() {}, stopPropagation() {} }); d.render(); };
const lastSave = (db, key) => { const hit = db.saves.filter(([k]) => k === key).pop(); return hit ? hit[1] : null; };

async function goalsPage(docs) {
  const db = signIn(docs);
  const d = drive(BSClientGoals, { onBack() {} });
  await settle();
  d.render();
  return { d, db };
}

test('a goal in the member\'s own words is the page title, and the picker shows it checked', async () => {
  const { d } = await goalsPage({ client_goals: { primaryGoal: 'Run my first 10k', share: true }, client_identity: { goal: 'Run my first 10k' } });
  assert.equal(h1(d), 'Run my first 10k.');
  d.click('Edit');
  const rows = radios(d);
  assert.equal(rows.length, 13, 'twelve listed goals and the own-words row');
  assert.equal(rows.filter((n) => n.props['aria-checked']).length, 1, 'exactly one row is checked');
  assert.equal(ownRow(d).props['aria-checked'], true);
  assert.match(textOf(ownRow(d)), /Run my first 10k/, 'the row shows the member\'s words');
  assert.equal(ownInput(d), undefined, 'the field stays closed until the row is tapped');
});

test('the member writes a goal of their own and it is saved as they typed it, tidied', async () => {
  const { d, db } = await goalsPage({ client_goals: { primaryGoal: 'fat_loss', share: true, training: [{ t: 'Squat 100 kg', cur: 80, tgt: 100 }] }, client_identity: { goal: 'Lose fat', bio: 'Hi' } });
  assert.equal(h1(d), 'Lose fat.');
  d.click('Edit');
  assert.equal(ownRow(d).props['aria-checked'], false, 'a listed goal leaves the own-words row unchecked');
  press(d, ownRow(d));
  const input = ownInput(d);
  assert.ok(input, 'tapping the row opens the field');
  assert.equal(input.props.value, '', 'with a listed goal on file the field starts empty');
  assert.equal(input.props.maxLength, 60);
  input.props.onChange({ target: { value: '   Swim   a mile\nwithout stopping  ' } });
  d.render();
  d.click('Set goal');
  await settle();
  d.render();
  const goals = lastSave(db, 'client_goals');
  assert.equal(goals.primaryGoal, 'Swim a mile without stopping');
  assert.equal(goals.share, true, 'the rest of the goals document is kept');
  assert.deepEqual(goals.training, [{ t: 'Squat 100 kg', cur: 80, tgt: 100 }]);
  assert.deepEqual(lastSave(db, 'client_identity'), { goal: 'Swim a mile without stopping', bio: 'Hi' }, 'the profile shows the same words');
  assert.equal(radios(d).length, 0, 'the picker closes once it is set');
  assert.equal(h1(d), 'Swim a mile without stopping.');
});

test('a listed goal typed by its name is saved as that goal, in every language', async () => {
  const { d, db } = await goalsPage({ client_goals: { primaryGoal: 'Run my first 10k' }, client_identity: { goal: 'Run my first 10k' } });
  d.click('Edit');
  press(d, ownRow(d));
  assert.equal(ownInput(d).props.value, 'Run my first 10k', 'the field opens with the member\'s words');
  ownInput(d).props.onChange({ target: { value: '  LOSE fat ' } });
  d.render();
  d.click('Set goal');
  await settle();
  assert.equal(lastSave(db, 'client_goals').primaryGoal, 'fat_loss', 'the token, so a later session in any language matches its row');
  assert.equal(lastSave(db, 'client_identity').goal, 'Lose fat', 'the profile takes the label, never the token');
  d.render();
  d.click('Edit');
  assert.equal(ownRow(d).props['aria-checked'], false);
  assert.equal(radios(d).find((n) => textOf(n).startsWith('Lose fat')).props['aria-checked'], true);
});

test('a blank goal cannot be set, by the button or by Enter', async () => {
  const { d, db } = await goalsPage({ client_goals: { primaryGoal: 'muscle' }, client_identity: {} });
  d.click('Edit');
  press(d, ownRow(d));
  ownInput(d).props.onChange({ target: { value: '   \n  ' } });
  d.render();
  const save = d.nodes().find((n) => n.type === 'button' && textOf(n) === 'Set goal');
  assert.equal(save.props.disabled, true, 'Set goal is off while the field holds only spaces');
  ownInput(d).props.onKeyDown({ key: 'Enter', preventDefault() {} });
  await settle();
  assert.equal(db.saves.length, 0, 'nothing was written');
  assert.equal(radios(d).length, 13, 'the picker is still open');
});

test('closing the picker closes the field, so it reopens on the list', async () => {
  const { d } = await goalsPage({ client_goals: { primaryGoal: 'muscle' }, client_identity: {} });
  d.click('Edit');
  press(d, ownRow(d));
  assert.ok(ownInput(d));
  d.click('Close');
  assert.equal(radios(d).length, 0);
  d.click('Edit');
  assert.equal(ownInput(d), undefined);
});

test('a goal that ends in its own stop gets no second one', async () => {
  const { d } = await goalsPage({ client_goals: { primaryGoal: 'Get fit!' }, client_identity: {} });
  assert.equal(h1(d), 'Get fit!');
});

test('the first-run goal step takes a goal in the member\'s own words', async () => {
  const db = signIn({ client_goals: { share: true }, client_identity: { bio: 'Hi' }, client_onboarding: { step: 1 } });
  const d = drive(BSIntentStep, { onDone() {} });
  assert.equal(ownInput(d), undefined, 'the field is closed until the chip is tapped');
  d.click('＋ Your own goal');
  assert.ok(ownInput(d), 'the chip opens the field');
  const save = () => d.nodes().find((n) => n.type === 'button' && textOf(n) === 'Set goal');
  assert.equal(save().props.disabled, true, 'nothing typed, nothing to set');
  ownInput(d).props.onChange({ target: { value: ' Climb  Kilimanjaro ' } });
  d.render();
  assert.equal(save().props.disabled, false);
  d.click('Set goal');
  await settle();
  d.render();
  assert.deepEqual(lastSave(db, 'client_goals'), { share: true, primaryGoal: 'Climb Kilimanjaro' });
  assert.deepEqual(lastSave(db, 'client_identity'), { bio: 'Hi', goal: 'Climb Kilimanjaro' });
  assert.equal(lastSave(db, 'client_onboarding').intentSeen, true);
  assert.match(d.text, /someone who shows up/, 'an own goal takes the general line, never a raw key');
});
