import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { saveCoachNote, coachNoteDraftKey } from '../mobile-app/src/services/coachNotes.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test' });
globalThis.window = dom.window; globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); const { createRoot } = require('react-dom/client');
const { default: Note } = await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/BSCoachNote.jsx', import.meta.url)), { registry: new Map([['react', React]]) });
const theme = { INK: '#fff', INK70: '#aaa', RULE: '#555', PAPER2: '#222', RUST: '#f88', DISPLAY: 'serif', MONO: 'monospace' };
const tr = (_k, o) => o.defaultValue;
function backend(initial = {}) {
  let doc = structuredClone(initial); const writes = []; let fail = false; let race = null;
  const client = { from(table) {
    assert.equal(table, 'user_goals');
    let update, where = {};
    const q = { eq(k, v) { where[k] = v; return q; },
      select() { return q; },
      maybeSingle: async () => { if (fail) throw Error('Offline'); return { data: { data: structuredClone(doc) } }; },
      update(v) { update = v.data; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (fail) throw Error('Offline');
        if (race) { const fn = race; race = null; fn(doc); }
        if (where.data !== JSON.stringify(doc)) return { data: [] };
        writes.push({ uid: where.user_id, data: update }); doc = structuredClone(update); return { data: [{ user_id: where.user_id }] };
      }).then(resolve, reject); },
    }; return q;
  } };
  return { client, writes, get doc() { return doc; }, set fail(v) { fail = v; }, set race(v) { race = v; } };
}
const args = b => ({ client: b.client, uid: 'coach-a', clientId: 'client-a', text: 'Updated', baseText: 'Initial', currentUid: () => 'coach-a' });
test('notes share the website document, preserve other clients and retry unrelated contention', async () => {
  const b = backend({ 'client-a': { text: 'Initial' }, 'client-b': { text: 'B' } });
  b.race = d => { d['client-b'].text = 'B updated on website'; };
  assert.equal((await saveCoachNote(args(b))).ok, true);
  assert.equal(b.doc['client-b'].text, 'B updated on website');
  assert.equal(b.doc['client-a'].text, 'Updated');
});
test('same-client changes conflict and never overwrite the website version', async () => {
  const b = backend({ 'client-a': { text: 'Initial' } });
  b.race = d => { d['client-a'].text = 'Website change'; };
  assert.deepEqual(await saveCoachNote(args(b)), { conflict: true, latestText: 'Website change' });
  assert.equal(b.writes.length, 0);
});
test('account changes during a read cannot write either account', async () => {
  const b = backend({ 'client-a': { text: 'Initial' } }); let calls = 0;
  assert.deepEqual(await saveCoachNote({ ...args(b), currentUid: () => ++calls === 1 ? 'coach-a' : 'coach-b' }), { accountChanged: true });
  assert.equal(b.writes.length, 0);
});
const button = text => [...document.querySelectorAll('button')].find(n => n.textContent.includes(text));
async function mount(b) {
  window.ShapeAuth = { getCachedState: () => ({ user: { id: 'coach-a' } }), client: b.client };
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Note, { clientId: 'client-a', t: theme, tr })));
  await React.act(async () => button('COACH NOTE').click());
  return root;
}
async function type(text) {
  await React.act(async () => {
    const el = document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, text);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
test('failed saves retain an account/client draft, recovered after closing the screen', async () => {
  window.localStorage.clear(); const b = backend({ 'client-a': { text: 'Initial' } });
  let root = await mount(b); await type('Keep this');
  b.fail = true; await React.act(async () => button('Save note').click());
  assert.match(document.body.textContent, /Could not save or load/);
  assert.equal(JSON.parse(window.localStorage.getItem(coachNoteDraftKey('coach-a', 'client-a'))).text, 'Keep this');
  await React.act(async () => root.unmount()); b.fail = false; root = await mount(b);
  assert.equal(document.querySelector('textarea').value, 'Keep this');
  await React.act(async () => button('Save note').click());
  assert.equal(b.doc['client-a'].text, 'Keep this');
  assert.equal(window.localStorage.getItem(coachNoteDraftKey('coach-a', 'client-a')), null);
  await React.act(async () => root.unmount());
});
test('a recovered conflict shows both versions and requires an explicit replacement', async () => {
  window.localStorage.clear(); const b = backend({ 'client-a': { text: 'Website' } });
  window.localStorage.setItem(coachNoteDraftKey('coach-a', 'client-a'), JSON.stringify({ text: 'My draft', baseText: 'Earlier' }));
  const root = await mount(b);
  assert.equal(document.querySelector('textarea').value, 'My draft');
  assert.match(document.body.textContent, /Saved version: Website/);
  assert.equal(button('Save note').disabled, true);
  await React.act(async () => button('Replace with my draft').click());
  assert.equal(b.doc['client-a'].text, 'My draft');
  await React.act(async () => root.unmount());
});
