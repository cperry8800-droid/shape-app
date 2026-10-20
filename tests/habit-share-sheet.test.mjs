// The habit row's share button and its sheet (Shared habits, owner 2026-10-20), MOUNTED in jsdom
// with the shipping module. The sheet lists the people the member is connected to, saves exactly
// the ones ticked through ShapeHabitWatch.set (set_habit_watchers), and says so when it cannot
// load, when sharing is not switched on yet (the migration has not run), or when there is no one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.localStorage = W.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

const habitsCat = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/habits.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => {
    const [ns, k] = key.split(':');
    const msg = ns === 'habits' ? habitsCat[k] : undefined;
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
  intlLocale: () => 'en',
};
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', RUST: '#c0533b', BLUE: '#4a7bd0', padX: 18, isLight: true };
W.useBS = () => theme;
globalThis.useBS = W.useBS;

const H = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetHabits.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSHabitShareSheet, BSHabitRow };',
});

const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  await flush();
  const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent) || re.test(b.getAttribute('aria-label') || ''));
  const click = async (re) => { const b = btn(re); assert.ok(b, `no button ${re} in: ${host.textContent.slice(0, 300)}`); await React.act(async () => { b.click(); }); await flush(); };
  return { host, text: () => host.textContent, btn, click, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const HABIT = { id: 'h1', name: 'Walk 10k steps', type: 'do', history: [] };
function api({ candidates, set } = {}) {
  const calls = { set: [], toasts: [], saved: 0, closed: 0 };
  W.ShapeHabitWatch = {
    candidates: candidates || (async () => ({ kind: 'ready', people: [{ userId: 'u-ben', name: 'Ben Ode' }, { userId: 'u-cat', name: 'Cat Ray' }] })),
    set: set || (async (id, ids) => { calls.set.push([id, ids]); return { kind: 'ready', watchers: ids }; }),
  };
  W.__bsToast = (m, k) => calls.toasts.push([m, k]);
  return calls;
}
const sheet = (calls, current = []) => React.createElement(H.BSHabitShareSheet, { habit: HABIT, accent: '#0a8f87', current, onClose: () => { calls.closed += 1; }, onSaved: () => { calls.saved += 1; } });

test('the sheet saves exactly the people ticked, and says how many', async () => {
  const calls = api();
  const m = await mount(sheet(calls));
  assert.match(m.text(), /Who hears if you miss it/);
  assert.match(m.text(), /At 8 pm your time/);
  await m.click(/^Cat Ray/);
  await m.click(/^Save$/);
  assert.deepEqual(calls.set, [['h1', ['u-cat']]]);
  assert.deepEqual(calls.toasts.at(-1), ['Shared with 1 person', 'ok']);
  assert.equal(calls.saved, 1);
  assert.equal(calls.closed, 1);
  await m.close();
});

test('unticking everyone stops sharing', async () => {
  const calls = api();
  const m = await mount(sheet(calls, ['u-ben']));
  assert.equal(m.btn(/^Ben Ode/).getAttribute('aria-checked'), 'true');
  await m.click(/^Ben Ode/);
  await m.click(/^Save$/);
  assert.deepEqual(calls.set, [['h1', []]]);
  assert.deepEqual(calls.toasts.at(-1), ['Not shared', 'ok']);
  await m.close();
});

test('someone picked earlier and no longer connected stays listed, so saving can drop them', async () => {
  const calls = api();
  const m = await mount(sheet(calls, ['u-gone']));
  assert.match(m.text(), /No longer connected/);
  await m.click(/^No longer connected/);
  await m.click(/^Save$/);
  assert.deepEqual(calls.set, [['h1', []]]);
  await m.close();
});

test('a failed load says so and retries; not switched on, and no one to pick, say so too', async () => {
  let n = 0;
  const calls = api({ candidates: async () => (n++ === 0 ? { kind: 'error' } : { kind: 'ready', people: [{ userId: 'u-ben', name: 'Ben Ode' }] }) });
  let m = await mount(sheet(calls));
  assert.match(m.text(), /Couldn't load your people\./);
  assert.ok(m.btn(/^Save$/).disabled, 'nothing to save until the list loads');
  await m.click(/^Retry$/);
  assert.match(m.text(), /Ben Ode/);
  await m.close();

  api({ candidates: async () => ({ kind: 'not_ready' }) });
  m = await mount(sheet(calls));
  assert.match(m.text(), /Sharing habits isn't switched on yet\./);
  assert.ok(m.btn(/^Save$/).disabled);
  await m.close();

  api({ candidates: async () => ({ kind: 'ready', people: [] }) });
  m = await mount(sheet(calls));
  assert.match(m.text(), /Follow someone, or accept a follower/);
  await m.close();
});

test('a refused save keeps the sheet open and says it did not save', async () => {
  const calls = api({ set: async () => ({ kind: 'error', message: 'You can only share a habit with people you follow or who follow you.' }) });
  const m = await mount(sheet(calls));
  await m.click(/^Ben Ode/);
  await m.click(/^Save$/);
  assert.deepEqual(calls.toasts.at(-1), ['Could not save. Try again.', 'err']);
  assert.equal(calls.closed, 0);
  assert.equal(calls.saved, 0);
  await m.close();
});

test('the row shows the share button only once sharing has read, with the count when shared', async () => {
  api();
  const row = (watchers) => React.createElement(H.BSHabitRow, { habit: HABIT, accent: '#0a8f87', onToggle() {}, onRemove() {}, watchers });
  let m = await mount(row(null));
  assert.equal(m.btn(/Share this habit|Shared with/), undefined, 'no share button before the watchers have read');
  await m.close();
  m = await mount(row([]));
  assert.ok(m.btn(/^Share this habit$/));
  await m.close();
  m = await mount(row(['u-ben', 'u-cat']));
  const b = m.btn(/Shared with 2 people/);
  assert.ok(b && b.textContent.includes('2'));
  await m.click(/Shared with 2 people/);
  assert.match(m.text(), /Who hears if you miss it/, 'the button opens the sheet');
  await m.close();
});

test('the page offers sharing only when the watchers read as ready', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetHabits.jsx'), 'utf8');
  assert.match(src, /setWatch\(r && r\.kind === 'ready' \? r\.byHabit : null\)/);
  assert.match(src, /watchers=\{watch \? \(watch\[h\.id\] \|\| \[\]\) : null\}/);
});

// The data layer (shapeBackend.js): every call answers a state. A missing function or table
// (the migration has not run) is "not_ready", which keeps the button hidden; anything else that
// fails is "error", never an empty list read as "no one".
test('ShapeHabitWatch answers ready, not_ready, anon or error, never a failure dressed as no one', async () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const at = src.indexOf('function habitWatchMissing(');
  const end = src.indexOf('window.ShapeHabitWatch =', at);
  assert.ok(at > 0 && end > at);
  const make = (supabase, state = { user: { id: 'ann' } }) =>
    new Function('supabase', 'state', `${src.slice(at, end)}\nreturn { habitWatchCandidates, habitWatchList, habitWatchSet };`)(supabase, state);
  const rpcSays = (answer) => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, range: async () => answer };
    return { rpc: async () => answer, from: () => chain };
  };

  const ok = make(rpcSays({ data: [{ user_id: 'u-ben', full_name: 'Ben Ode' }, { user_id: 'u-x', full_name: null }], error: null }));
  assert.deepEqual(await ok.habitWatchCandidates(), { kind: 'ready', people: [{ userId: 'u-ben', name: 'Ben Ode' }, { userId: 'u-x', name: 'Shape member' }] });
  // By code alone (a message that names nothing), and by message alone (a code we do not list).
  for (const error of [{ code: 'PGRST202', message: '' }, { code: 'PGRST205', message: '' }, { code: '42883', message: '' }, { code: '42P01', message: '' },
    { code: '', message: 'Could not find the table habit_watchers in the schema cache' }]) {
    const api = make(rpcSays({ data: null, error }));
    assert.deepEqual(await api.habitWatchCandidates(), { kind: 'not_ready' }, error.message);
    assert.deepEqual(await api.habitWatchList(), { kind: 'not_ready' }, error.message);
  }
  const down = make(rpcSays({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }));
  assert.deepEqual(await down.habitWatchCandidates(), { kind: 'error' });
  assert.deepEqual(await down.habitWatchList(), { kind: 'error' });
  assert.equal((await down.habitWatchSet('h1', ['u-ben'])).kind, 'error');
  assert.deepEqual(await make(rpcSays({ data: [], error: null }), { user: null }).habitWatchCandidates(), { kind: 'anon' });

  const rows = make(rpcSays({ data: [{ habit_id: 'h1', watcher_id: 'u-ben' }, { habit_id: 'h1', watcher_id: 'u-cat' }, { habit_id: 'h2', watcher_id: 'u-ben' }], error: null }));
  assert.deepEqual(await rows.habitWatchList(), { kind: 'ready', byHabit: { h1: ['u-ben', 'u-cat'], h2: ['u-ben'] } });
  // Codex on #2413: past PostgREST's 1,000-row cap, one request read 1,000 rows and the rest of the
  // habits as unshared, so saving one dropped its people. 60 habits × 20 people, under the cap.
  const people = Array.from({ length: 20 }, (_, i) => `w${String(i).padStart(2, '0')}`);
  const habits = Array.from({ length: 60 }, (_, i) => `h${String(i).padStart(2, '0')}`);
  const big = make(fakeSupabase({ maxRows: 1000, tables: { habit_watchers: habits.flatMap((h) => people.map((w) => ({ habit_id: h, owner_id: 'ann', watcher_id: w }))) } }));
  const read = await big.habitWatchList();
  assert.equal(read.kind, 'ready');
  assert.equal(Object.keys(read.byHabit).length, 60, 'every habit');
  assert.ok(Object.values(read.byHabit).every((ws) => ws.length === 20), 'with all 20 people');
  let sent = null;
  const setter = make({ rpc: async (name, args) => { sent = [name, args]; return { data: args.p_watchers, error: null }; } });
  assert.deepEqual(await setter.habitWatchSet('h1', ['u-ben', 'u-ben', 'u-cat']), { kind: 'ready', watchers: ['u-ben', 'u-cat'] });
  assert.deepEqual(sent, ['set_habit_watchers', { p_habit: 'h1', p_watchers: ['u-ben', 'u-cat'] }], 'one id once');
});
