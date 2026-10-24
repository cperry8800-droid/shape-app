// The coach app's Grocery Lists, MOUNTED in jsdom with the shipping BSProGroceryLists.
//
// ⚠ A NEW COACH READ THREE MADE-UP CLIENTS. The sample lists (Riley Kim, Sara Mendez,
// Ava Brooks) stood in whenever the coach had no lists OR the read failed, each with a
// Send button. They are the signed-out preview only now; a signed-in coach sees their
// own lists, an honest empty line, or "Couldn't load your lists."
//
// Owner, 2026-10-20: trainers keep personal lists only (a trainer's client list delivered
// nothing, and its notice told the client a meal plan had been loaded); nutritionists keep
// personal lists and client lists, and a client is picked from their linked clients so
// Send can deliver (a typed name never could). Plus: "Sent" only when it arrived, a list
// leaves the screen only once the server removed it, and the masthead keeps one hairline.
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
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.localStorage = W.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

const coach = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/coach.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => {
    const msg = coach[key.replace(/^coach:/, '')];
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
  intlLocale: () => 'en',
};

const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', AMBER: '#d8b25a', RUST: '#c0533b', GREEN: '#5fa96e', BLUE: '#4a7bd0', padX: 18, isLight: true };
W.useBS = () => theme;
W.BSPage = ({ children }) => React.createElement('div', null, children);
W.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);
let mastProps = null;
W.BSMasthead = (p) => { mastProps = p; return React.createElement('header', null, p.title); };
for (const chrome of ['BSPageHeader', 'BSBackButton', 'BSAvatar', 'BSFacetAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen', 'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage', 'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}
W.BSTStationHead = ({ label }) => React.createElement('div', null, String(label));

const PROS = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSProGroceryLists };',
});

const SAMPLE = /Riley Kim|Sara Mendez|Ava Brooks|Big-plate day|Low-FODMAP|My weekly prep/;
const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// A coach session: who is signed in, what the services answer, and what they were asked.
function services({ signedIn = true, lists = [], roster = [], push = true, remove = true } = {}) {
  const calls = { create: [], update: [], remove: [], push: [], toasts: [] };
  W.ShapeAuth = { getCachedState: () => (signedIn ? { user: { id: 'coach-1' } } : {}) };
  W.ShapeGroceryLists = {
    list: async () => (typeof lists === 'function' ? lists() : lists),
    create: async (b) => { calls.create.push(b); return { id: 'new' }; },
    update: async (b) => { calls.update.push(b); return b; },
    remove: async (id) => { calls.remove.push(id); return remove; },
    push: async (b) => { calls.push.push(b); return push; },
    notify: async () => { throw new Error('the bare notice is never a delivery'); },
  };
  W.ShapeAssign = { clients: async (role, opts) => { calls.rosterArgs = [role, opts]; if (roster === false) throw new Error('down'); return roster; } };
  W.__bsToast = (msg, kind) => calls.toasts.push([msg, kind]);
  W.bsAskConfirm = async () => true;
  return calls;
}

async function mount(isNutri) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(PROS.BSProGroceryLists, { t: theme, isNutri, onBack: () => {} })); });
  await flush();
  const buttons = () => [...host.querySelectorAll('button')];
  const button = (re) => buttons().find((b) => re.test(b.textContent));
  const click = async (re) => { const b = button(re); assert.ok(b, `no button matching ${re} in: ${host.textContent.slice(0, 300)}`); await React.act(async () => { b.click(); }); await flush(); };
  const type = async (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? W.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? W.HTMLSelectElement.prototype : W.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    await React.act(async () => { el.dispatchEvent(new W.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  return { host, text: () => host.textContent, button, click, type, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}

const real = (over) => ({ id: 'd3f1c2aa-0000-4000-8000-000000000001', name: 'Sunday shop', client_id: null, client_name: null, status: 'ready', items: [{ name: 'Oats', aisle: 'Grains' }], ...over });

test('a signed-in nutritionist with no lists reads an honest empty line, never the samples', async () => {
  services({ lists: [] });
  const m = await mount(true);
  assert.doesNotMatch(m.text(), SAMPLE);
  assert.match(m.text(), /0 client lists/);
  assert.match(m.text(), /No client lists yet/);
  await m.close();
});

test('a failed read says so, with a retry, and still shows no samples', async () => {
  let answer = null;
  services({ lists: () => answer });
  const m = await mount(true);
  assert.doesNotMatch(m.text(), SAMPLE);
  assert.match(m.text(), /Couldn't load your lists\./);
  answer = [real({ name: 'Back again', client_id: 'u-ana', client_name: 'Ana Reyes' })];
  await m.click(/^Retry$/);
  assert.match(m.text(), /Back again/);
  assert.doesNotMatch(m.text(), /Couldn't load/);
  await m.close();
});

test('signed out, the preview still shows its samples', async () => {
  services({ signedIn: false });
  const m = await mount(true);
  assert.match(m.text(), /Riley Kim/);
  await m.close();
});

test('a trainer has personal lists only: no Clients tab, no client option, no Send', async () => {
  services({ lists: [real(), real({ id: 'b2', name: 'Old client list', client_id: 'u9', client_name: 'Dana Fox' })] });
  const m = await mount(false);
  assert.match(m.text(), /2 lists/);
  assert.equal(m.button(/^Clients/), undefined, 'a trainer has no Clients tab');
  assert.match(m.text(), /Old client list/, "a trainer's older client list stays visible");
  assert.equal(m.button(/^Send to (?!a member)/), undefined, 'a trainer has no Send to a client');
  await m.click(/New grocery list/);
  assert.equal(m.button(/For a client/), undefined, 'a trainer cannot make a client list');
  await m.close();
});

test("a nutritionist's client list picks a linked client, and carries their id so Send can deliver", async () => {
  const calls = services({ lists: [], roster: [{ userId: 'u-ana', name: 'Ana Reyes' }, { userId: 'u-ben', name: 'Ben Tal' }] });
  const m = await mount(true);
  await m.click(/New grocery list/);
  assert.deepEqual(calls.rosterArgs, ['nutritionist', { strict: true }]);
  await m.type(m.host.querySelector('input'), 'Cut week');
  await m.type(m.host.querySelector('textarea'), 'Spinach\nTempeh');
  // Without a client picked, nothing is created.
  await m.click(/^Create list$/);
  assert.equal(calls.create.length, 0);
  assert.equal(calls.toasts.at(-1)[0], 'Pick a client');
  await m.type(m.host.querySelector('select'), 'u-ben');
  await m.click(/^Create list$/);
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].clientId, 'u-ben');
  assert.equal(calls.create[0].clientName, 'Ben Tal');
  assert.deepEqual(calls.create[0].items.map((i) => i.name), ['Spinach', 'Tempeh']);
  await m.close();
});

test("the client picker says when the roster couldn't load", async () => {
  services({ lists: [], roster: false });
  const m = await mount(true);
  await m.click(/New grocery list/);
  assert.match(m.text(), /Couldn't load your clients\./);
  await m.close();
});

test('Send marks a list Sent only when it reached the client', async () => {
  const fail = services({ lists: [real({ client_id: 'u-ana', client_name: 'Ana Reyes' })], push: false });
  let m = await mount(true);
  await m.click(/^Send to Ana/);
  assert.equal(fail.push.length, 1);
  assert.equal(fail.update.length, 0, 'a failed delivery must not be marked Sent');
  assert.deepEqual(fail.toasts.at(-1), ['Could not send', 'err']);
  await m.close();

  const ok = services({ lists: [real({ client_id: 'u-ana', client_name: 'Ana Reyes' })], push: true });
  m = await mount(true);
  await m.click(/^Send to Ana/);
  assert.deepEqual(ok.update, [{ id: real().id, status: 'sent' }]);
  assert.equal(ok.toasts.at(-1)[1], 'ok');
  await m.close();
});

test('a list whose id starts with "d" is really deleted, and stays when the delete fails', async () => {
  const calls = services({ lists: [real()], remove: false });
  let m = await mount(true);
  await m.click(/^Mine/);
  await m.click(/^Delete$/);
  assert.deepEqual(calls.remove, [real().id], 'a real uuid starting with "d" was taken for a sample');
  assert.match(m.text(), /Sunday shop/, 'the list left the screen though the server kept it');
  await m.close();

  const ok = services({ lists: [real()], remove: true });
  m = await mount(true);
  await m.click(/^Mine/);
  await m.click(/^Delete$/);
  assert.deepEqual(ok.remove, [real().id]);
  assert.doesNotMatch(m.text(), /Sunday shop/);
  await m.close();
});

test('the masthead keeps one hairline, not the heavy rule and double rule', async () => {
  services({ lists: [] });
  const m = await mount(true);
  assert.equal(mastProps.thinRule, true);
  assert.equal(mastProps.showDoubleRule, false);
  await m.close();
});

// Owner, 2026-10-24 ("every member / yes coaches as well"): any coach list goes to any member in a
// message, through the same picker and message members send with (BSPostSendSheet, from the client module).
test('a coach sends any list to a member, through the members\' send sheet', async () => {
  const opened = [];
  W.BSPostSendSheet = ({ post, onClose }) => { opened.push(post); return React.createElement('div', { 'data-send-sheet': '' }, React.createElement('button', { onClick: onClose }, 'Close sheet')); };
  try {
    for (const isNutri of [false, true]) {
      opened.length = 0;
      services({ lists: [real({ items: [{ name: 'Oats', aisle: 'Grains' }, { name: 'Kale', aisle: 'Produce' }] }), real({ id: 'e2', name: 'Nothing yet', items: [] }), real({ id: 'c3', name: 'Ana week', client_id: 'u-ana', client_name: 'Ana Reyes' })] });
      const m = await mount(isNutri);
      if (isNutri) await m.click(/^Mine/);
      const sends = () => [...m.host.querySelectorAll('[data-bs-grocery-send]')];
      // Every list with items has one: a trainer sees all their lists (an older client list too), a
      // nutritionist's Mine tab the personal ones. The empty list has none.
      assert.equal(sends().length, isNutri ? 1 : 2);
      assert.equal(sends()[0].textContent, 'Send to a member →');
      await React.act(async () => { sends()[0].click(); });
      await flush();
      assert.deepEqual(opened, [{ grocery: { name: 'Sunday shop', items: [{ n: 'Oats', a: 'Grains' }, { n: 'Kale', a: 'Produce' }] } }]);
      assert.ok(m.host.querySelector('[data-send-sheet]'));
      await m.click(/^Close sheet$/);
      assert.ok(!m.host.querySelector('[data-send-sheet]'), 'closing the sheet closes it');
      if (isNutri) {
        // A client list keeps Send to that client, and goes to any member too.
        await m.click(/^Clients/);
        assert.ok(m.button(/^Send to Ana/));
        assert.equal(sends().length, 1);
      }
      await m.close();
    }
  } finally { delete W.BSPostSendSheet; }
});
