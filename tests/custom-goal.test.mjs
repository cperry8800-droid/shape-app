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
const { BSClientGoals, BSIntentStep, BSMeGoalCard, BSGoalsContract } = await loadBroadsheet(['BSClientGoals', 'BSIntentStep', 'BSMeGoalCard', 'BSGoalsContract'], RUN_EFFECTS);

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

// ── The Goal card and Home's Goal door read a goal that isn't about weight in words ──
// (owner, 2026-10-20: "Show the goal's words"). "Run my first 10k" with no weight target read
// "Set the terms." and asked for a start and target weight; Home showed no door at all.
// The harness renders one component at a time, so the Goal page's card is driven as itself.
const NO_TARGET = { title: '', start: '', now: '', target: '', unit: 'kg', by: null, why: '' };
// The card and the door read weights in the member's unit; this suite's member is on Metric.
Object.assign(globalThis.useBS(), { weightUnit: 'kg', kgToDisplay: (kg) => (kg == null ? null : Number(kg)) });
const noop = () => {};
// i18next fills a string's {placeholders}; with no catalog loaded, the default text stands in.
const fillingTr = { t: (key, o) => (o && typeof o.defaultValue === 'string' ? o.defaultValue.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m)) : key) };
function goalCard(data, overall = NO_TARGET, view = 'cover') {
  signIn({});
  globalThis.window.ShapeI18n = fillingTr;
  return drive(BSGoalsContract, { overall, data, heat: '#c0533b', view, onOpenView: noop, onBack: noop, onLog: noop, onEditTargets: noop, onOpenProgress: noop, onAddGoal: noop, onEditGoal: noop, onEditHeadline: noop });
}
const wordsOf = (d) => d.nodes().find((n) => n.props && 'data-goal-words' in n.props);
const redacted = (d) => d.nodes().some((n) => n.props && n.props.label === 'No goal set yet');
const bars = (d) => d.nodes().filter((n) => n.props && n.props.role === 'img').length;

test("a goal that isn't about weight reads in words on the Goal card, with no weight read", () => {
  const d = goalCard({ primaryGoal: 'Run my first 10k' });
  assert.ok(wordsOf(d), 'the card reads in words');
  assert.match(textOf(wordsOf(d)), /^Your targets carry this one\./);
  assert.match(textOf(wordsOf(d)), /“Run my first 10k” isn’t a weight goal, so there’s no weight bar\./);
  assert.doesNotMatch(d.text, /Set the terms\./, 'no weight prompt as its read');
  assert.doesNotMatch(d.text, /To go|Current|Pace/, 'no weight figures');
  assert.equal(bars(d), 0, 'no weight bar');
  assert.equal(redacted(d), false, 'and no "No goal set yet": the member has a goal');
  // A listed goal that isn't about weight reads in its own label.
  assert.match(textOf(wordsOf(goalCard({ primaryGoal: 'strength' }))), /“Get stronger” isn’t a weight goal/);
});

test("the terms door and page read a goal in words too, never \"No goal set yet\" (Codex on #2416)", () => {
  const termsDoor = (d) => d.nodes().find((n) => n.props && n.props['data-goal-door'] === 'terms');
  const cover = goalCard({ primaryGoal: 'Run my first 10k' });
  assert.match(textOf(termsDoor(cover)), /Add your why/);
  assert.doesNotMatch(textOf(termsDoor(cover)), /Set the terms/);
  assert.match(textOf(termsDoor(goalCard({ primaryGoal: 'Run my first 10k' }, { ...NO_TARGET, why: 'For my dad' }))), /Your why/);
  const terms = goalCard({ primaryGoal: 'Run my first 10k' }, NO_TARGET, 'terms');
  assert.equal(redacted(terms), false);
  assert.match(textOf(wordsOf(terms)), /“Run my first 10k” isn’t a weight goal, so it has no weight milestones\./);
  assert.ok(terms.nodes().some((n) => n.props && n.props.label === 'Edit targets'), 'and the way to add a weight target');
  // A weight goal with no target still asks for one there.
  assert.equal(redacted(goalCard({ primaryGoal: 'fat_loss' }, NO_TARGET, 'terms')), true);
  assert.match(textOf(termsDoor(goalCard({ primaryGoal: 'fat_loss' }))), /Set the terms/);
});

test('a weight target set as well brings the weight read back', () => {
  const d = goalCard({ primaryGoal: 'Run my first 10k' }, { title: 'Race weight', start: 80, now: 78, target: 75, unit: 'kg' });
  assert.equal(wordsOf(d), undefined);
  assert.match(d.text, /To go/);
  assert.equal(bars(d), 1, 'the weight bar');
});

test('a weight goal with no target still asks for one, as before', () => {
  for (const primaryGoal of ['fat_loss', 'muscle', 'recomp', 'maintain', 'tone', '', 'Lose fat']) {
    const d = goalCard({ primaryGoal });
    assert.equal(wordsOf(d), undefined, primaryGoal);
    assert.match(d.text, /Set the terms\./, primaryGoal);
    assert.equal(redacted(d), true, primaryGoal);
  }
});

async function homeDoor(docs) {
  signIn(docs);
  globalThis.window.ShapeI18n = fillingTr;
  const d = drive(BSMeGoalCard, { onOpen: noop });
  await settle();
  d.render();
  return d.nodes().find((n) => n.props && n.props.tourId === 'hero-goal');
}

test("Home's Goal door opens on the goal's words when there is no weight to read", async () => {
  const door = await homeDoor({ client_goals: { primaryGoal: 'Run my first 10k' } });
  assert.ok(door, 'a door, though no weight goal is set');
  assert.equal(door.props.figureText, 'Run my first 10k', 'the words are spoken too');
  assert.equal(textOf(door.props.figure), 'Run my first 10k');
  assert.equal(door.props.figure.props.style.textOverflow, 'ellipsis', 'cut to fit the row');
  assert.equal(door.props.pct, undefined, 'no bar');
  assert.equal(door.props.status, undefined, 'and no "to go"');
});

test("Home's Goal door: a weight goal with no target stays hidden; a weight target shows the bar", async () => {
  assert.equal(await homeDoor({ client_goals: { primaryGoal: 'fat_loss' } }), undefined);
  const door = await homeDoor({ client_goals: { primaryGoal: 'Run my first 10k', overall: { start: 80, now: 78, target: 75, unit: 'kg' } } });
  assert.equal(door.props.figure, '40%');
  assert.equal(door.props.pct, 40);
});

test("Home's Goal door reads a target in either direction, as the Goal page does (Codex on #2416)", async () => {
  // A build: 70 → 75 kg, now 72. It read "—" and 0% on Home, and a goal in words lost the bar.
  const build = { start: 70, now: 72, target: 75, unit: 'kg' };
  for (const primaryGoal of ['Run my first 10k', 'muscle']) {
    const door = await homeDoor({ client_goals: { primaryGoal, overall: build } });
    assert.equal(door.props.figure, '40%', primaryGoal);
    assert.equal(door.props.pct, 40, primaryGoal);
    assert.equal(door.props.status, '3 kg to go', primaryGoal);
  }
  // Past a build's target is a hit, never a negative amount to go.
  const past = await homeDoor({ client_goals: { primaryGoal: 'muscle', overall: { ...build, now: 76 } } });
  assert.equal(past.props.status, 'goal hit ✓');
  assert.equal(past.props.pct, 100);
});

test('the door speaks a figure drawn as an element through figureText', async () => {
  const { BSShelfDoor } = await loadBroadsheet(['BSShelfDoor'], RUN_EFFECTS);
  const d = drive(BSShelfDoor, { eyebrow: 'Goal', figure: { type: 'span', props: { children: 'Run my first 10k' } }, figureText: 'Run my first 10k', onOpen: noop });
  assert.equal(d.nodes().find((n) => n.type === 'button').props['aria-label'], 'Goal Run my first 10k');
});
