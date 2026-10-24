// Train's Burned this week (owner, 2026-10-24), MOUNTED in jsdom with the shipping module: the
// week's total and daily average from the member's rows, "—" and a way to connect when nothing is
// tracked, a failed read that can be tried again, and the preview's sample week marked as one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsHwIso, bsHwWeekDays } from '../mobile-app/src/services/homeWeek.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
globalThis.CustomEvent = W.CustomEvent;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

const cat = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/session.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => { const [ns, k] = key.split(':'); const msg = ns === 'session' ? cat[k] : undefined; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); },
  intlLocale: () => 'en-US',
};
W.useBS = () => ({ MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK70: '#555', INK50: '#777', HAIR: '#ddd', RULE: '#ccc', ACCENT: '#0a8f87', padX: 18, sectGap: 22, isLight: true });

const M = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainBurn.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
});

const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(M.BSTrainBurn)); });
  await flush();
  const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
  return { host, text: () => host.textContent, btn, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const signIn = () => { W.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) }; };
const monday = bsHwWeekDays(bsHwIso(new Date()))[0];

test('signed in: the week’s total, its daily average, and where it came from', async () => {
  signIn();
  const asked = [];
  W.ShapeBurn = { week: async (wk) => { asked.push(wk); return { ok: true, snaps: [{ snapshot_date: monday, calories: 1200, sources: { calories: 'apple_health' } }], acts: [] }; } };
  const m = await mount();
  assert.deepEqual(asked, [monday], 'reads the strip’s own week, Monday first');
  assert.match(m.text(), /Burned this week/);
  assert.match(m.text(), /1,200kcal burned/);
  assert.match(m.text(), /1,200\/day · 1 day/);
  assert.match(m.text(), /From Apple Health/);
  assert.equal(m.host.querySelectorAll('[role="img"] > div').length, 7, 'a bar a day');
  await m.close();
});

test('nothing tracked reads "—" and offers to connect, never 0', async () => {
  signIn();
  W.ShapeBurn = { week: async () => ({ ok: true, snaps: [], acts: [] }) };
  let opened = 0;
  W.addEventListener('shape:openIntegrations', () => { opened += 1; });
  const m = await mount();
  assert.match(m.text(), /—kcal burned/);
  assert.doesNotMatch(m.text(), /\b0 ?kcal/);
  assert.match(m.text(), /Connect Apple Health, Strava or a watch/);
  await React.act(async () => { m.btn(/Connect/).click(); });
  assert.equal(opened, 1, 'Connect opens the integrations');
  await m.close();
});

test('a failed read says so and can be tried again', async () => {
  signIn();
  let calls = 0;
  W.ShapeBurn = { week: async () => { calls += 1; return calls === 1 ? { ok: false } : { ok: true, snaps: [], acts: [{ started_at: new Date().toISOString(), calories: 450, source: 'strava' }] }; } };
  const m = await mount();
  assert.match(m.text(), /Couldn’t read your activity/);
  await React.act(async () => { m.btn(/Retry/).click(); });
  await flush();
  assert.equal(calls, 2);
  assert.match(m.text(), /450kcal burned/);
  assert.match(m.text(), /From Strava/);
  await m.close();
});

test('signed out shows the preview’s sample week, marked as one', async () => {
  W.ShapeAuth = { getCachedState: () => ({ user: null }) };
  W.ShapeBurn = { week: async () => { throw new Error('signed-out preview must not read'); } };
  const m = await mount();
  assert.match(m.text(), /Sample week/);
  assert.doesNotMatch(m.text(), /—kcal/);
  await m.close();
});
