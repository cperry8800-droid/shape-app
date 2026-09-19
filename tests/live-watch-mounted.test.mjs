import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test' });
globalThis.window = dom.window; globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { default: Watch } = await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/BSLiveWorkoutWatch.jsx', import.meta.url)), { registry: new Map([['react', React]]) });
const theme = { INK: '#fff', INK70: '#bbb', HAIR: '#444', RULE: '#555', PAPER2: '#222', DISPLAY: 'serif', MONO: 'monospace', padX: 18 };
const tr = (_key, opts) => String(opts.defaultValue).replace(/\{(\w+)\}/g, (_, k) => opts[k] ?? k);
const snapshot = () => ({ status: 'live', lastSyncedAt: Date.now(), publicRow: null, coachRow: {
  expires_at: new Date(Date.now() + 60000).toISOString(), started_at: new Date(Date.now() - 30000).toISOString(), updated_at: new Date().toISOString(),
  payload: { v: 1, title: 'Actual session', loadUnit: 'kg', curIdx: 0, resting: false, setsTotal: 3, setsDone: 1, exercises: [
    { n: 'Row', total: 3, done: 1, sets: [{ done: false, load: '', reps: '', rpe: '' }, { done: true, load: '70', reps: '8', rpe: '7' }, { done: false, load: '', reps: '', rpe: '' }] },
  ] },
} });
let root, observer, props, authCallback, currentOwner, sends;
const button = label => [...document.querySelectorAll('button')].find(b => b.textContent === label);
async function mount(options = {}) {
  currentOwner = 'coach-a'; sends = [];
  window.ShapeAuth = { getCachedState: () => ({ user: { id: currentOwner } }), client: { auth: { onAuthStateChange(cb) { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; } } } };
  window.ShapeLiveProgress = { watch(id, cb) { observer = cb; cb(snapshot()); return () => {}; } };
  window.ShapeCoachFeed = { async sendCue(args) { sends.push(args); return { ok: true }; } };
  props = { client: 'Test client', clientId: 'client-a', t: theme, tr, ...options };
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Watch, props)));
}
async function unmount() { await React.act(async () => root.unmount()); }
async function type(text) {
  await React.act(async () => {
    const el = document.querySelector('input');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, text);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
test('actual workout title, unit and out-of-order set identity are rendered accurately', async () => {
  await mount();
  assert.match(document.body.textContent, /Actual session/);
  assert.match(document.body.textContent, /Weight \(kg\)/);
  const rows = [...document.querySelectorAll('tbody tr')];
  assert.deepEqual(rows.map(r => r.dataset.completed), ['false', 'true', 'false']);
  assert.match(rows[1].textContent, /2 ✓7087/);
  assert.equal(document.querySelectorAll('tbody input, tbody button').length, 0);
  assert.equal(button('Send').disabled, true);
  await unmount();
});
test('send awaits persistence, rejects duplicate clicks and preserves draft on failure', async () => {
  await mount(); await type('Keep your back steady');
  let reject;
  window.ShapeCoachFeed.sendCue = args => { sends.push(args); return new Promise((_, no) => { reject = no; }); };
  await React.act(async () => { button('Send').click(); button('Send').click(); });
  assert.equal(sends.length, 1);
  assert.match(document.body.textContent, /Sending…/);
  assert.doesNotMatch(document.body.textContent, /Sent to Test client/);
  await React.act(async () => reject(Error('offline')));
  assert.equal(document.querySelector('input').value, 'Keep your back steady');
  assert.match(document.body.textContent, /Could not send/);
  window.ShapeCoachFeed.sendCue = async () => ({ ok: true });
  await React.act(async () => button('Send').click());
  assert.match(document.body.textContent, /Sent to Test client/);
  assert.equal(document.querySelector('input').value, '');
  await unmount();
});
test('preset cue reaches backend once and unavailable connection disables sending', async () => {
  await mount();
  await React.act(async () => button('Slow the eccentric').click());
  assert.deepEqual(sends, [{ clientId: 'client-a', text: 'Slow the eccentric', role: 'trainer' }]);
  await React.act(async () => observer({ ...snapshot(), status: 'reconnecting' }));
  assert.match(document.body.textContent, /Reconnecting/);
  assert.equal(button('Slow the eccentric').disabled, true);
  await React.act(async () => observer({ status: 'idle', publicRow: null, coachRow: null }));
  assert.equal(document.querySelector('table'), null);
  assert.doesNotMatch(document.body.textContent, /Upper Pull|Barbell/);
  await unmount();
});
test('switching client or account discards held numbers and late send success', async () => {
  await mount(); await type('For A'); let resolve;
  window.ShapeCoachFeed.sendCue = () => new Promise(ok => { resolve = ok; });
  await React.act(async () => button('Send').click());
  window.ShapeLiveProgress.watch = (id, cb) => { observer = cb; cb({ status: 'idle', coachRow: null, publicRow: null }); return () => {}; };
  await React.act(async () => root.render(React.createElement(Watch, { ...props, client: 'Client B', clientId: 'client-b' })));
  await React.act(async () => resolve({ ok: true }));
  assert.doesNotMatch(document.body.textContent, /For A|Actual session/);
  await React.act(async () => { currentOwner = 'coach-b'; authCallback('SIGNED_IN', { user: { id: currentOwner } }); });
  assert.equal(document.querySelector('input').value, '');
  assert.equal(button('Slow the eccentric').disabled, true);
  await unmount();
});
test('demo cue is explicitly a preview and performs no write', async () => {
  await mount({ clientId: null });
  await React.act(async () => button('Hold this weight').click());
  assert.equal(sends.length, 0);
  assert.match(document.body.textContent, /Preview only/);
  assert.doesNotMatch(document.body.textContent, /Sent to/);
  await unmount();
});
