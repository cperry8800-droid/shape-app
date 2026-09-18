import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { coachWorkoutDraftKey } from '../mobile-app/src/services/coachWorkoutLibrary.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const registry = new Map([['react', React]]);
const Future = await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/BSWorkoutFutureUpdates.jsx', import.meta.url)), { registry: new Map(registry) });
registry.set('./BSWorkoutFutureUpdates.jsx', Future);
const { default: Editor } = await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/BSWorkoutDocumentEditor.jsx', import.meta.url)), { registry });
const theme = { INK: '#fff', INK50: '#bbb', RULE: '#555', PAPER: '#111', RUST: '#f88', MONO: 'monospace', DISPLAY: 'serif', BODY: 'sans-serif' };
const tr = (_key, options) => options.defaultValue.replace(/\{(\w+)\}/g, (_all, name) => options[name] ?? name);
const plan = () => ({ id: 'same-id', name: 'Strength', detail: { revision: 4, builder: { weeks: [{ days: [{ id: 'day-a', name: 'Lower', blocks: [{ kind: 'main', rows: [{ id: 'row-a', name: 'Squat', sets: 3, reps: '5', cue: 'Brace', video: 'https://example.test/squat.mp4' }] }] }] }] } } });
const button = (text) => [...document.querySelectorAll('button')].find((node) => node.textContent === text);
async function inputLabel(text, value) {
  const label = [...document.querySelectorAll('label')].find((node) => node.firstChild?.textContent === text);
  const input = label.querySelector('input');
  await React.act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
async function mount(Component, props = {}) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Component, { plan: plan(), plans: [], t: theme, tr, onClose() {}, ...props })));
  return root;
}
window.ShapeAuth = { getCachedState: () => ({ user: { id: 'coach-a' } }) };

test('editor retains same-ID draft and all prescription fields after failed save, then clears only after success', async () => {
  localStorage.clear(); let fail = true; const saved = [];
  const root = await mount(Editor, { onSave: async (row) => { saved.push(row); if (fail) throw new Error('Changed on another device'); } });
  await inputLabel('Name', 'Strength updated');
  await React.act(async () => button('Save draft').click());
  const key = coachWorkoutDraftKey('coach-a', 'same-id');
  assert.match(document.body.textContent, /Changed on another device/);
  const draft = JSON.parse(localStorage.getItem(key));
  assert.equal(draft.name, 'Strength updated');
  assert.equal(draft.detail.revision, 4);
  assert.equal(saved[0].id, 'same-id');
  assert.equal(saved[0].detail.builder.weeks[0].days[0].blocks[0].rows[0].cue, 'Brace');
  assert.equal(saved[0].detail.builder.weeks[0].days[0].blocks[0].rows[0].video, 'https://example.test/squat.mp4');
  fail = false; await React.act(async () => button('Save draft').click());
  assert.equal(localStorage.getItem(key), null);
  await React.act(async () => root.unmount());
});

test('new draft has one persistent creation identity across reload and failed retries', async () => {
  localStorage.clear(); const unsaved = plan(); delete unsaved.id;
  let root = await mount(Editor, { plan: unsaved, onSave: async () => { throw new Error('Offline'); } });
  const key = coachWorkoutDraftKey('coach-a', null, 'workout');
  const first = JSON.parse(localStorage.getItem(key));
  assert.match(first.creationId, /^[0-9a-f-]{36}$/);
  await React.act(async () => button('Save draft').click());
  await React.act(async () => root.unmount());
  const attempts = [];
  root = await mount(Editor, { plan: unsaved, onSave: async (row) => { attempts.push(row); throw new Error('Offline'); } });
  await React.act(async () => button('Save draft').click());
  assert.equal(attempts[0].creationId, first.creationId);
  await React.act(async () => root.unmount());
});

test('saving freezes edits until completion and a conflict can be retained as a new draft copy', async () => {
  localStorage.clear(); let reject; const writes = [];
  const root = await mount(Editor, { onSave: async (row) => { writes.push(row); if (writes.length === 1) await new Promise((_resolve, rejectSave) => { reject = rejectSave; }); } });
  await inputLabel('Name', 'Revised');
  await React.act(async () => button('Save draft').click());
  assert.equal(document.querySelector('fieldset').disabled, true);
  await inputLabel('Name', 'Late change');
  assert.equal(JSON.parse(localStorage.getItem(coachWorkoutDraftKey('coach-a', 'same-id'))).name, 'Revised');
  await React.act(async () => reject(new Error('Changed on another device')));
  await React.act(async () => button('Save as new copy').click());
  assert.equal(writes[1].id, undefined);
  assert.equal(writes[1].published, false);
  assert.equal(writes[1].expectedOwnerId, 'coach-a');
  assert.match(writes[1].creationId, /^[a-f0-9-]{36}$/);
  assert.equal(writes[1].name, 'Revised (copy)');
  await React.act(async () => root.unmount());
});

test('new mobile templates save privately until explicit Publish, and published edits preserve that state', async () => {
  localStorage.clear(); const writes = []; const unsaved = plan(); delete unsaved.id;
  let root = await mount(Editor, { plan: unsaved, onSave: async (row) => writes.push(row) });
  await React.act(async () => button('Save draft').click());
  assert.equal(writes[0].published, false);
  await React.act(async () => root.unmount());
  root = await mount(Editor, { plan: { ...plan(), published: false }, onSave: async (row) => writes.push(row) });
  await React.act(async () => button('Publish template').click());
  assert.equal(writes[1].published, true);
  assert.equal(writes[1].id, 'same-id');
  await React.act(async () => root.unmount());
  root = await mount(Editor, { plan: { ...plan(), published: true }, onSave: async (row) => writes.push(row) });
  assert.equal(button('Publish template'), undefined);
  await React.act(async () => button('Save changes').click());
  assert.equal(writes[2].published, true);
  await React.act(async () => root.unmount());
});

test('an upload attaches only to its selected row when website-copied weeks reuse row IDs', async () => {
  localStorage.clear(); const copied = plan();
  copied.detail.builder.weeks.push(JSON.parse(JSON.stringify(copied.detail.builder.weeks[0])));
  let finish, saved;
  window.ShapeCoachMedia = { upload: async () => new Promise((resolve) => { finish = () => resolve({ url: 'https://example.test/new.mp4', type: 'video', name: 'New demo' }); }) };
  const root = await mount(Editor, { plan: copied, onSave: async (row) => { saved = row; } });
  await React.act(async () => button('Upload video').click());
  const picker = document.querySelector('input[type=file]');
  Object.defineProperty(picker, 'files', { value: [new window.File(['clip'], 'new.mp4', { type: 'video/mp4' })], configurable: true });
  await React.act(async () => picker.dispatchEvent(new window.Event('change', { bubbles: true })));
  assert.equal(document.querySelector('fieldset').disabled, true);
  await React.act(async () => finish());
  assert.equal(document.querySelector('fieldset').disabled, false);
  await React.act(async () => button('Save draft').click());
  assert.equal(saved.detail.builder.weeks[0].days[0].blocks[0].rows[0].video, 'https://example.test/new.mp4');
  assert.equal(saved.detail.builder.weeks[1].days[0].blocks[0].rows[0].video, 'https://example.test/squat.mp4');
  await React.act(async () => root.unmount());
});

test('future updates require explicit selection and retain only failed groups for retry', async () => {
  const base = { title: 'Lower', before: { title: 'Lower old', exercises: [] }, payload: { exercises: [{ name: 'Squat', reps: '5' }] } };
  const calls = []; let fail = true;
  window.ShapeCoachPlans = {
    assignments: async () => ({ assignments: [{ ...base, id: 'a', clientId: 'one', scheduledDate: '2026-09-21' }, { ...base, id: 'b', clientId: 'two', scheduledDate: '2026-09-21' }] }),
    updateAssignments: async (body) => { calls.push(body); if (body.clientId === 'two' && fail) throw new Error('Week held for review'); },
  };
  window.ShapeAssign = { clients: async () => [{ userId: 'one', name: 'Avery' }, { userId: 'two', name: 'Jordan' }] };
  const root = await mount(Future.default);
  assert.equal(button('Update 0 selected workouts').disabled, true);
  assert.match(document.body.textContent, /Avery/);
  await React.act(async () => [...document.querySelectorAll('input[type=checkbox]')].forEach((input) => input.click()));
  await React.act(async () => button('Update 2 selected workouts').click());
  assert.match(document.body.textContent, /1 workouts updated/);
  assert.match(document.body.textContent, /Week held for review/);
  assert.equal(document.querySelectorAll('input[type=checkbox]').length, 1);
  fail = false; await React.act(async () => button('Update 1 selected workouts').click());
  assert.deepEqual(calls.map((row) => row.clientId), ['one', 'two', 'two']);
  assert.deepEqual(calls[0].assignmentPreconditions, [base.before]);
  assert.match(document.body.textContent, /2 workouts updated/);
  await React.act(async () => root.unmount());
});
