// The app's cancel step for a coach plan (owner, 2026-11-05: "3 - user types response"), MOUNTED:
// mobile-app/src/broadsheet/BSCancelPlan.jsx in the real broadsheet chrome, against a scripted
// ShapeApi, reading the real English settings catalog. One optional question in the member's own
// words; the plan is cancelled at its period's end through POST /api/stripe/cancel-plan; the
// question never blocks it. And the client's billing rows send members here, not to the portal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body><div id="bs-phone-surface"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');
const ReactDOM = require_('react-dom');

// The English catalog the app ships: a key missing from it fails here rather than falling back.
const CATALOG = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/settings.json'), 'utf8'));
window.ShapeI18n = {
  t: (key, opts = {}) => {
    const k = key.replace(/^settings:/, '');
    assert.ok(key.startsWith('settings:') && k in CATALOG, `${key} is not in the English settings catalog`);
    return new IntlMessageFormat(CATALOG[k], 'en-US').format(opts);
  },
  intlLocale: () => 'en-US',
};

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const CP = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCancelPlan.jsx'), { registry: new Map([['react', React], ['react-dom', ReactDOM]]) });
const inChrome = (el) => React.createElement(window.BSProvider, { paperMode: 'paper' }, el);

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  const surface = document.getElementById('bs-phone-surface');
  return { text: () => surface.textContent.replace(/\s+/g, ' '), surface, unmount: () => act(async () => root.unmount()) };
}
const click = async (el) => { assert.ok(el, 'no such button'); await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const button = (host, re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
const type = async (el, v) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
};

function api(answer) {
  const calls = [];
  window.ShapeApi = { fetch: async (path, init) => {
    calls.push([path, init && init.method, init && init.body ? JSON.parse(init.body) : null]);
    const a = typeof answer === 'function' ? answer(path, init) : answer;
    return { ok: a.status < 300, status: a.status, json: async () => a.body };
  } };
  return calls;
}
const PLAN = { subscriptionId: '77777777-7777-4777-8777-777777777777', providerRole: 'trainer', providerId: 4, name: 'Maya Okafor', renewsAt: '2026-11-30T12:00:00.000Z', ending: false, endsAt: null };

test('the sheet asks one optional question, says who reads it, and cancels at the period\'s end', async () => {
  const calls = api({ status: 200, body: { ok: true, endsAt: '2026-11-30T12:00:00.000Z', reasonSaved: true } });
  const done = [];
  const m = await mount(inChrome(React.createElement(CP.BSCancelPlanSheet, { plan: PLAN, onClose: () => {}, onDone: (e) => done.push(e) })));
  assert.match(m.text(), /Cancel your plan with Maya Okafor\?/);
  assert.match(m.text(), /You keep it until November 30\. It won't renew after that\./);
  assert.match(m.text(), /Why are you leaving\? \(optional\)/);
  assert.match(m.text(), /Only Maya Okafor and Shape will read this\./);
  const box = m.surface.querySelector('textarea');
  assert.equal(box.getAttribute('maxlength'), '500');
  await type(box, '  Budget. Back in the fall.  ');
  await click(button(m.surface, /^Cancel plan$/));
  assert.deepEqual(calls, [['/api/stripe/cancel-plan', 'POST', { subscriptionId: PLAN.subscriptionId, reason: 'Budget. Back in the fall.' }]]);
  assert.deepEqual(done, ['2026-11-30T12:00:00.000Z']);
  assert.match(m.text(), /Plan cancelled.*Your plan with Maya Okafor ends on November 30\. It won't renew\./);
  await m.unmount();
});

test('an empty answer still cancels; a failure changes nothing and says so; a disconnected coach sends the member to support', async () => {
  const quiet = api({ status: 200, body: { ok: true, endsAt: null, reasonSaved: true } });
  const m = await mount(inChrome(React.createElement(CP.BSCancelPlanSheet, { plan: PLAN, onClose: () => {}, onDone: () => {} })));
  await click(button(m.surface, /^Cancel plan$/));
  assert.equal(quiet[0][2].reason, undefined, 'no answer is sent as none');
  assert.match(m.text(), /Plan cancelled/);
  await m.unmount();

  api({ status: 502, body: { error: 'x' } });
  const f = await mount(inChrome(React.createElement(CP.BSCancelPlanSheet, { plan: PLAN, onClose: () => {}, onDone: () => { throw new Error('not done'); } })));
  await click(button(f.surface, /^Cancel plan$/));
  assert.match(f.text(), /Couldn't cancel just now\. Nothing changed; try again\./);
  assert.doesNotMatch(f.text(), /Plan cancelled/);
  await f.unmount();

  api({ status: 409, body: { reason: 'coach_disconnected', error: 'server words' } });
  const d = await mount(inChrome(React.createElement(CP.BSCancelPlanSheet, { plan: PLAN, onClose: () => {}, onDone: () => {} })));
  await click(button(d.surface, /^Cancel plan$/));
  assert.match(d.text(), /Contact Shape support/);
  await d.unmount();
});

test('a coach with no name on file: whole sentences of their own, never a fallback noun in the wrong case', async () => {
  api({ status: 200, body: { ok: true, endsAt: null } });
  const m = await mount(inChrome(React.createElement(CP.BSCancelPlanSheet, { plan: { ...PLAN, name: null, renewsAt: null }, onClose: () => {}, onDone: () => {} })));
  assert.match(m.text(), /Cancel your coaching plan\?/);
  assert.match(m.text(), /You keep it until the end of this billing period/);
  assert.match(m.text(), /Only your coach and Shape will read this\./);
  await click(button(m.surface, /^Cancel plan$/));
  assert.match(m.text(), /Your coaching plan ends at the end of this billing period\. It won't renew\./);
  await m.unmount();
});

test('the client\'s billing rows offer the step for every open coach plan, and the portal on a coach\'s account no longer cancels', () => {
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /import \{ BSCancelPlanSheet, useBSCoachPlansToCancel, bsCancelDate \} from '\.\/BSCancelPlan\.jsx';/);
  assert.match(client, /\.\.\.plansToCancel\.map\(\(p\) => \(\{[\s\S]{0,700}action: p\.ending \? undefined : \(\) => setCancelPlan\(p\),/);
  assert.match(client, /\{cancelPlan && <BSCancelPlanSheet plan=\{cancelPlan\}/);
  const mod = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSCancelPlan.jsx'), 'utf8');
  assert.doesNotMatch(mod, /from '\.\/iosAppBroadsheetClient/, 'never an import back into the client');
  assert.match(readFileSync(join(ROOT, 'src/lib/coach-checkout.ts'), 'utf8'), /subscription_cancel: \{ enabled: false \}/);
  // Every key the sheet asks for is in all 13 locales (i18n-catalog-complete holds the rest).
  for (const k of [...mod.matchAll(/tr\('settings:([a-zA-Z.]+)'/g)].map((x) => x[1])) assert.ok(k in CATALOG, k);
});
