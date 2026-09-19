import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
const shipping = source.slice(source.indexOf('async function sendWorkoutCoachCue('), source.indexOf('// ─── Pro Console API'));
const start = '2026-09-19T12:00:00.000Z';
const row = (text, seconds = 10, extras = {}) => ({ id: 'focus-one', client_id: 'client-a', provider_id: 'coach-a', provider_role: 'trainer', text, sent_at: new Date(Date.parse(start) + seconds * 1000).toISOString(), ...extras });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function service({ apiBaseUrl = '' } = {}) {
  const win = new EventTarget(); const doc = new EventTarget(); doc.visibilityState = 'visible';
  const state = { user: { id: 'client-a' }, session: { access_token: 'test-token' } };
  const requests = [], queries = [], intervals = new Map(), deadlines = new Map(), channels = [];
  let data = [], error = null, response = { ok: true, json: async () => ({ ok: true }) }, pendingRead = null;
  const supabase = {
    from(table) {
      const filters = {};
      const query = {
        select(columns) { queries.push({ table, columns, filters }); return query; },
        eq(key, value) { filters[key] = value; return query; },
        gte(key, value) { filters[`${key}>=`] = value; return query; },
        abortSignal(signal) { filters.signal = signal; return query; },
        order() { return pendingRead || Promise.resolve({ data, error }); },
      };
      return query;
    },
    channel(name) {
      const channel = { name, removed: false,
        on(_kind, filter, callback) { channel.filter = filter; channel.change = callback; return channel; },
        subscribe(callback) { channel.status = callback; return channel; },
      };
      channels.push(channel); return channel;
    },
    removeChannel(channel) { channel.removed = true; },
  };
  const context = vm.createContext({ window: win, document: doc, state, supabase, apiBaseUrl,
    providerDiscipline: role => role === 'dietitian' ? 'nutritionist' : role,
    sessionsAuthHeaders: extra => ({ ...extra, Authorization: `Bearer ${state.session.access_token}` }),
    fetch: async (url, opts) => { requests.push({ url, ...opts }); return response; },
    setInterval: callback => { const id = intervals.size + 1; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
    AbortController,
    setTimeout: callback => { const id = deadlines.size + 1; deadlines.set(id, callback); return id; },
    clearTimeout: id => deadlines.delete(id),
    fetchCoachConsoleFeed() {}, subscribeCoachConsoleFeed() {},
  });
  vm.runInContext(shipping, context);
  return { api: win.ShapeCoachFeed, state, requests, queries, channels, intervals, deadlines,
    set data(value) { data = value; }, set error(value) { error = value; },
    set response(value) { response = value; }, set pendingRead(value) { pendingRead = value; },
    poll: async () => { for (const callback of intervals.values()) callback(); await flush(); },
    identity: () => win.dispatchEvent(new Event('shape:identity')),
    online: () => win.dispatchEvent(new Event('online')),
  };
}

test('coach sends real authenticated JSON on web and native; nutrition credentials use the existing role endpoint', async () => {
  for (const base of ['', 'https://shape.test']) {
    const s = service({ apiBaseUrl: base });
    assert.equal((await s.api.sendCue({ clientId: ' client-b ', text: ' Brace ', role: 'dietitian' })).ok, true);
    assert.equal(s.requests[0].url, `${base}/api/nutritionist/console`);
    assert.equal(s.requests[0].headers.Authorization, 'Bearer test-token');
    assert.equal(s.requests[0].headers['Content-Type'], 'application/json');
    assert.ok(s.requests[0].signal instanceof AbortSignal);
    assert.equal(s.deadlines.size, 0);
    assert.deepEqual(JSON.parse(s.requests[0].body), { action: 'focus', clientId: 'client-b', text: 'Brace' });
  }
});

test('unauthenticated, invalid and failed sends cannot report success', async () => {
  const s = service();
  s.state.session = null;
  await assert.rejects(s.api.sendCue({ clientId: 'b', text: 'Brace' }), /Sign in/);
  assert.equal(s.requests.length, 0);
  s.state.session = { access_token: 'test-token' };
  for (const payload of [{ clientId: 'b', text: '' }, { clientId: 'b', text: 'x', role: 'client' }, { clientId: 'b', text: 'x'.repeat(501) }]) await assert.rejects(s.api.sendCue(payload));
  assert.equal(s.requests.length, 0);
  for (const response of [{ ok: false, json: async () => ({ error: 'Access denied' }) }, { ok: true, json: async () => ({}) }, { ok: true, json: async () => { throw Error('bad json'); } }, { then(_resolve, reject) { reject(Error('Offline')); } }]) {
    s.response = response;
    await assert.rejects(s.api.sendCue({ clientId: 'b', text: 'Brace' }));
  }
});

test('a send resolving after account change cannot confirm success in the new account', async () => {
  const s = service(); let resolve;
  s.response = { ok: true, json: () => new Promise(done => { resolve = done; }) };
  const send = s.api.sendCue({ clientId: 'b', text: 'Brace' }); await flush();
  s.state.user = { id: 'other' }; resolve({ ok: true });
  await assert.rejects(send, /Account changed/);
});

test('a stalled send and client read have deadlines and the receiver can recover on its next poll', async () => {
  const sender = service();
  sender.response = { ok: true, json: () => new Promise((_resolve, reject) => sender.requests[0].signal.addEventListener('abort', () => reject(Error('Aborted')))) };
  const sending = sender.api.sendCue({ clientId: 'b', text: 'Brace' }); await flush();
  for (const deadline of sender.deadlines.values()) deadline();
  await assert.rejects(sending);
  assert.equal(sender.deadlines.size, 0);

  const receiver = service(), cues = [], statuses = []; let reject;
  receiver.pendingRead = new Promise((_resolve, fail) => { reject = fail; });
  const stop = receiver.api.subscribeWorkoutCues({ userId: 'client-a', startedAt: start, onCue: cue => cues.push(cue), onStatus: status => statuses.push(status) });
  receiver.queries[0].filters.signal.addEventListener('abort', () => reject(Error('Aborted')));
  for (const deadline of receiver.deadlines.values()) deadline(); await flush();
  assert.equal(statuses.at(-1), 'error');
  receiver.pendingRead = null; receiver.data = [row('Recovered cue')]; await receiver.poll();
  assert.equal(cues.at(-1).text, 'Recovered cue'); stop();
});

test('session receives only its own new cues, deduplicates polling and recovers a missed websocket update', async () => {
  const s = service(), cues = [], statuses = [];
  s.data = [row('Old workout', -1), row('Other client', 30, { client_id: 'client-b' }), row('Brace')];
  const stop = s.api.subscribeWorkoutCues({ userId: 'client-a', startedAt: start, onCue: cue => cues.push(cue), onStatus: status => statuses.push(status) });
  await flush();
  assert.deepEqual(cues.map(cue => cue.text), ['Brace']);
  assert.equal(s.queries[0].filters.client_id, 'client-a');
  assert.equal(s.queries[0].filters['sent_at>='], start);
  assert.equal(s.channels[0].filter.filter, 'client_id=eq.client-a');
  await s.poll(); assert.equal(cues.length, 1);
  s.error = { message: 'Offline' }; await s.poll();
  assert.equal(statuses.at(-1), 'error'); assert.equal(cues.length, 1);
  s.error = null; s.data = [row('Slow down', 25)]; await s.poll();
  assert.deepEqual(cues.map(cue => cue.text), ['Brace', 'Slow down']);
  assert.equal(statuses.at(-1), 'ready');
  stop(); assert.equal(s.intervals.size, 0); assert.equal(s.channels[0].removed, true);
});

test('reconnect and foreground recovery re-read cues without resurrecting a dismissed version', async () => {
  const s = service(), cues = [];
  const stop = s.api.subscribeWorkoutCues({ userId: 'client-a', startedAt: start, onCue: cue => cues.push(cue) });
  await flush();
  s.data = [row('Rest longer')]; s.channels[0].status('SUBSCRIBED'); await flush();
  assert.equal(cues.length, 1);
  s.online(); await flush(); assert.equal(cues.length, 1);
  s.data = [row('Hold this weight', 20)]; s.online(); await flush();
  assert.equal(cues.at(-1).text, 'Hold this weight'); stop();
});

test('account switch clears the visible cue and invalidates pending reads and old subscriptions', async () => {
  const s = service(), cues = []; let resolve;
  s.data = [row('Brace')];
  s.api.subscribeWorkoutCues({ userId: 'client-a', startedAt: start, onCue: cue => cues.push(cue) });
  await flush();
  s.pendingRead = new Promise(done => { resolve = done; });
  s.channels[0].change(); await flush();
  const pendingSignal = s.queries.at(-1).filters.signal;
  s.state.user = { id: 'client-b' }; s.identity();
  assert.equal(pendingSignal.aborted, true);
  resolve({ data: [row('Old account pending response')], error: null }); await flush();
  assert.equal(cues.at(-1), null); assert.equal(cues.length, 2);
  assert.equal(s.intervals.size, 0); assert.equal(s.channels[0].removed, true);
  s.api.subscribeWorkoutCues({ userId: 'client-a', startedAt: start, onCue: cue => cues.push(cue) });
  assert.equal(s.channels.length, 1);
});

test('client banner announces the real cue, stays visible, dismisses and unsubscribes on unmount', async () => {
  const require = createRequire(import.meta.url);
  const React = require('react'); const { createRoot } = require('react-dom/client');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const jsx = client.slice(client.indexOf('function BSWorkoutCoachCue('), client.indexOf('function BSSession('));
  const babel = require('next/dist/compiled/babel/core');
  const { code } = babel.transformSync(jsx, { presets: [require('next/dist/compiled/babel/preset-react')], babelrc: false, configFile: false });
  const strings = JSON.parse(readFileSync(new URL('../mobile-app/src/i18n/catalogs/en/session.json', import.meta.url), 'utf8'));
  const Banner = new Function('React', 'useStateBSC', 'useBS', 'useShapeTr', `${code}; return BSWorkoutCoachCue;`)(React, React.useState, () => ({ MONO: 'monospace' }), () => key => strings[key.split(':')[1]]);
  let callback, stopped = 0;
  window.ShapeCoachFeed = { subscribeWorkoutCues(args) { callback = args.onCue; assert.equal(args.userId, 'client-a'); return () => { stopped++; }; } };
  const root = createRoot(document.getElementById('root'));
  const identity = { userId: 'client-a', sessionId: 'workout-one', startedAt: start };
  await React.act(async () => root.render(React.createElement(Banner, { identity })));
  await React.act(async () => callback(row('Brace before the next rep')));
  assert.equal(document.querySelector('[role="status"]').textContent, 'Coach cueBrace before the next rep');
  await React.act(async () => root.render(React.createElement(Banner, { identity })));
  assert.match(document.body.textContent, /Brace before/);
  await React.act(async () => document.querySelector('button[aria-label="Dismiss coach cue"]').click());
  assert.equal(document.querySelector('[role="status"]'), null);
  await React.act(async () => callback(row('Rest longer', 20)));
  assert.match(document.body.textContent, /Rest longer/);
  await React.act(async () => callback(null));
  assert.equal(document.querySelector('[role="status"]'), null);
  await React.act(async () => root.unmount()); assert.equal(stopped, 1);
  dom.window.close();
});
