import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as validate from '../public/newdesign/liveProgress.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
globalThis.React = React;
globalThis.Card = ({ children, style }) => React.createElement('div', { style }, children);
globalThis.DashPage = ({ children }) => React.createElement('main', {}, children);
globalThis.trainerNavItems = globalThis.nutriNavItems = () => [];
globalThis.trainerPayoutCard = globalThis.nutriPayoutCard = {};
const { createRoot } = require('react-dom/client');
const { CoachLiveWorkoutPanel: Panel } = await loadRealModule(fileURLToPath(new URL('../public/newdesign/coachLiveWorkout.jsx', import.meta.url)), { appendExports: 'export { CoachLiveWorkoutPanel };' });
const clientA = '11111111-1111-4111-8111-111111111111';
const clientB = '22222222-2222-4222-8222-222222222222';
const payload = () => ({ v: 1, curIdx: 0, resting: false, setsDone: 1, setsTotal: 2, loadUnit: 'kg', exercises: [{ n: 'Barbell row', done: 1, total: 2, sets: [{ load: '70', reps: '8', rpe: '8.5', done: true }, { load: '999', reps: '99', rpe: '9', done: false }] }] });
const row = () => ({ payload: payload(), started_at: new Date(Date.now() - 65000).toISOString(), updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString() });
const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
async function setup(initial = {}, { initialOwner = 'coach', bridgeOwner = null } = {}) {
  const observers = [];
  const authObservers = new Set();
  window.shapeDb = { client: { auth: { onAuthStateChange(callback) { authObservers.add(callback); callback('INITIAL_SESSION', initialOwner ? { user: { id: initialOwner } } : null); return { data: { subscription: { unsubscribe() { authObservers.delete(callback); } } } }; } } }, getSession: async () => {
    if (bridgeOwner) for (const callback of authObservers) callback('SIGNED_IN', { user: { id: bridgeOwner } });
    return { user: { id: bridgeOwner || initialOwner } };
  } };
  const loadRuntime = async () => ({ ...validate, watchLiveWorkout: options => { const observer = { ...options, stopped: false }; observers.push(observer); options.onChange({ status: 'connecting', publicRow: null, coachRow: null, ...initial }); return () => { observer.stopped = true; }; } });
  const root = createRoot(document.getElementById('root'));
  const render = async props => React.act(async () => root.render(React.createElement(Panel, { clientId: clientA, clientName: 'Avery', role: 'trainer', loadRuntime, ...props })));
  await render();
  return { root, render, observers, auth: async (eventName, owner) => React.act(async () => { for (const callback of authObservers) callback(eventName, owner ? { user: { id: owner } } : null); }), emit: async state => React.act(async () => observers.at(-1).onChange({ publicRow: null, coachRow: null, ...state })), close: async () => React.act(async () => root.unmount()) };
}

test('desktop monitor distinguishes loading, empty, stale and recovered live snapshots', async () => {
  const ui = await setup();
  assert.match(document.body.textContent, /Connecting to workout/);
  await ui.emit({ status: 'idle' });
  assert.match(document.body.textContent, /No active workout available/);
  assert.equal(document.querySelector('table'), null);
  await ui.emit({ status: 'stale', coachRow: row() });
  assert.match(document.body.textContent, /Updates paused/);
  assert.ok(button('Retry connection'));
  await ui.emit({ status: 'live', coachRow: row() });
  assert.match(document.body.textContent, /1 \/ 2 sets completed/);
  assert.match(document.body.textContent, /Load \(kg\)/);
  assert.match(document.body.textContent, /7088.5Done/);
  assert.doesNotMatch(document.body.textContent, /999/); // Unfinished prefills are never actuals.
  assert.equal(button('Send cue').disabled, true);
  await ui.close();
});

test('public-only progress does not invent set readings and cooking never renders as a workout', async () => {
  const ui = await setup();
  const publicRow = row(); publicRow.payload = validate.bsValidLivePayload(publicRow.payload);
  await ui.emit({ status: 'live', publicRow });
  assert.match(document.body.textContent, /No load, reps or RPE readings available/);
  assert.equal(document.querySelector('table'), null);
  publicRow.payload = { v: 1, kind: 'cooking', title: 'Dinner' };
  await ui.emit({ status: 'live', publicRow });
  assert.match(document.body.textContent, /No active workout available/);
  assert.doesNotMatch(document.body.textContent, /Dinner/);
  await ui.close();
});

test('cue send checks server acceptance, retains failed drafts, and prevents duplicates while pending', async () => {
  const ui = await setup({ status: 'live', coachRow: row() });
  let resolve; const writes = [];
  globalThis.fetch = (url, options) => { writes.push({ url, ...options }); return new Promise(done => { resolve = done; }); };
  await React.act(async () => button('Hold this weight').click());
  await React.act(async () => { button('Send cue').click(); document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  assert.equal(writes.length, 1);
  assert.equal(document.querySelector('input').disabled, true);
  assert.doesNotMatch(document.body.textContent, /Cue saved for/);
  await React.act(async () => resolve({ ok: false, json: async () => ({ error: 'Client access changed.' }) }));
  assert.equal(document.querySelector('input').value, 'Hold this weight');
  assert.match(document.querySelector('[role=alert]').textContent, /Client access changed/);
  await React.act(async () => button('Send cue').click());
  await React.act(async () => resolve({ ok: true, json: async () => ({ ok: true }) }));
  assert.deepEqual(JSON.parse(writes[1].body), { clientId: clientA, action: 'focus', text: 'Hold this weight' });
  assert.equal(writes[1].credentials, 'same-origin');
  assert.equal(writes[1].url, '/api/trainer/console');
  assert.equal(document.querySelector('input').value, '');
  assert.match(document.body.textContent, /Cue saved for Avery/);
  await ui.close();
});

test('switching clients retires the observer and ignores a late cue response', async () => {
  const ui = await setup({ status: 'live', coachRow: row() });
  let resolve; let signal;
  globalThis.fetch = (_url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); };
  await React.act(async () => button('Slow the eccentric').click());
  await React.act(async () => button('Send cue').click());
  const previous = ui.observers[0];
  await ui.render({ clientId: clientB, clientName: 'Jordan', role: 'nutritionist' });
  assert.equal(previous.stopped, true);
  assert.equal(signal.aborted, true);
  await React.act(async () => { previous.onChange({ status: 'live', coachRow: { ...row(), payload: { ...payload(), exercises: [{ ...payload().exercises[0], n: 'Old client exercise' }] } } }); resolve({ ok: true, json: async () => ({ ok: true }) }); });
  assert.doesNotMatch(document.body.textContent, /Old client exercise|Cue saved for Avery/);
  await ui.emit({ status: 'live', coachRow: row() });
  globalThis.fetch = async (url) => { assert.equal(url, '/api/nutritionist/console'); return { ok: true, json: async () => ({ ok: true }) }; };
  await React.act(async () => button('One more set').click());
  await React.act(async () => button('Send cue').click());
  assert.match(document.body.textContent, /Cue saved for Jordan/);
  await ui.close();
});

test('token refresh preserves a pending cue; account change aborts it and ignores its late success', async () => {
  const ui = await setup({ status: 'live', coachRow: row() });
  let resolve; let signal;
  globalThis.fetch = (_url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); };
  await React.act(async () => button('Hold this weight').click());
  await React.act(async () => button('Send cue').click());
  await ui.auth('TOKEN_REFRESHED', 'coach');
  assert.equal(signal.aborted, false);
  assert.equal(document.querySelector('input').value, 'Hold this weight');
  assert.ok(button('Saving…'));
  await ui.auth('SIGNED_IN', 'different-coach');
  assert.equal(signal.aborted, true);
  assert.equal(document.querySelector('input'), null);
  assert.match(document.body.textContent, /Your account changed/);
  await React.act(async () => resolve({ ok: true, json: async () => ({ ok: true }) }));
  await ui.emit({ status: 'live', coachRow: row() });
  assert.doesNotMatch(document.body.textContent, /Cue saved|Hold this weight|Barbell row/);
  await ui.close();
});

test('the initial cookie-session bridge enables coaching without being treated as an account change', async () => {
  const ui = await setup({ status: 'live', coachRow: row() }, { initialOwner: null, bridgeOwner: 'coach' });
  assert.doesNotMatch(document.body.textContent, /Your account changed/);
  assert.equal(button('One more set').disabled, false);
  await ui.auth('TOKEN_REFRESHED', 'coach');
  assert.equal(button('One more set').disabled, false);
  await ui.close();
});

test('sign-out clears successful cue feedback and the next draft', async () => {
  const ui = await setup({ status: 'live', coachRow: row() });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  await React.act(async () => button('One more set').click());
  await React.act(async () => button('Send cue').click());
  assert.match(document.body.textContent, /Cue saved for Avery/);
  await React.act(async () => button('Lengthen your rest').click());
  await ui.auth('SIGNED_OUT', null);
  assert.doesNotMatch(document.body.textContent, /Cue saved|Lengthen your rest/);
  assert.equal(document.querySelector('input'), null);
  await ui.close();
});

test('stale, reconnecting and public-only snapshots disable cue submission and presets', async () => {
  const ui = await setup({ status: 'live', coachRow: row() });
  await React.act(async () => button('Hold this weight').click());
  let writes = 0; globalThis.fetch = async () => { writes++; return { ok: true, json: async () => ({ ok: true }) }; };
  for (const status of ['stale', 'reconnecting']) {
    await ui.emit({ status, coachRow: row() });
    assert.equal(button('Send cue').disabled, true);
    assert.equal(button('One more set').disabled, true);
    await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  }
  const publicRow = row(); publicRow.payload = validate.bsValidLivePayload(publicRow.payload);
  await ui.emit({ status: 'live', publicRow });
  assert.equal(button('Send cue').disabled, true);
  assert.equal(button('One more set').disabled, true);
  await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(writes, 0);
  await ui.emit({ status: 'live', coachRow: row() });
  assert.equal(document.querySelector('input').value, 'Hold this weight');
  assert.equal(button('Send cue').disabled, false);
  await ui.close();
});

const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
for (const role of ['Trainer', 'Nutritionist']) {
  const source = readFileSync(new URL(`../public/newdesign/${role}LiveConsole.html`, import.meta.url), 'utf8');
  const inline = [...source.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n').replace(/ReactDOM\.createRoot[\s\S]*?;\s*$/, '');
  const code = babel.transformSync(inline, { presets: [presetReact], babelrc: false, configFile: false }).code;
  const Console = new Function('React', `${code}\nreturn ${role}LiveConsolePage;`)(React);
  test(`${role} console renders a real empty roster and a failed request without sample clients`, async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ [`is${role}`]: true, clients: [] }) });
    let root = createRoot(document.getElementById('root'));
    await React.act(async () => root.render(React.createElement(Console)));
    assert.match(document.body.textContent, /No clients yet/);
    assert.doesNotMatch(document.body.textContent, /Charlie|Sent to|Demo preview/);
    await React.act(async () => root.unmount());
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'Service unavailable' }) });
    root = createRoot(document.getElementById('root'));
    await React.act(async () => root.render(React.createElement(Console)));
    assert.match(document.body.textContent, /Service unavailable/);
    assert.ok(button('Retry'));
    assert.doesNotMatch(document.body.textContent, /Charlie|Demo preview/);
    await React.act(async () => root.unmount());
  });
  test(`${role} focus handler reports failure rather than success`, async () => {
    const start = inline.indexOf('  const sendFocus = async () => {');
    const end = inline.indexOf('\n  };', start) + 5;
    assert.ok(start >= 0 && end > start);
    const notices = [];
    const fn = new Function('focus', 'focusRequest', 'setFocusSending', 'fetch', 'clientId', 'flash', 'firstName', 'client', inline.slice(start, end).replace('  const sendFocus = ', 'return '))('Test cue', { current: false }, () => {}, async () => ({ ok: false, json: async () => ({ error: 'Offline' }) }), clientA, message => notices.push(message), value => value, { name: 'Avery' });
    await fn();
    assert.deepEqual(notices, ['Offline']);
  });
}

test('every desktop client and console loads the shared panel before rendering its consumer', () => {
  for (const page of ['TrainerApp', 'NutritionistApp', 'TrainerClient', 'NutritionistClient', 'TrainerLiveConsole', 'NutritionistLiveConsole']) {
    const html = readFileSync(new URL(`../public/newdesign/${page}.html`, import.meta.url), 'utf8');
    assert.ok(html.includes('coachLiveWorkout.jsx'), page);
    assert.ok(html.includes('/supabase.js'), page);
    assert.ok(html.indexOf('coachLiveWorkout.jsx') < html.indexOf(page.endsWith('LiveConsole') ? `function ${page}Page` : 'coachClientDetail.jsx'), page);
  }
});
