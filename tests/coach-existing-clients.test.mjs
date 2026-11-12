// A coach's existing clients, the only clients Shape takes no cut from (owner, 2026-11-12: "Shape takes
// 15% cut on clients that sign up through Shape. Existing clients, Shape takes no cut from.").
//   * the app's service (mobile-app/src/services/coachExistingClients.mjs): what it sends and how it
//     reads each answer, a failed read never "an empty list";
//   * the checkout resolver (src/lib/coach-origin.ts): the RPC's coach_existing is 0% with no referral;
//   * the editor (mobile-app/src/broadsheet/BSCoachExistingClients.jsx), mounted in jsdom from the
//     shipping code, and the Add-a-client sheet that holds it, whose invite no longer writes a 0% tag.
// The database half is tests/coach-existing-clients-sql.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import {
  ADD_BATCH, addExistingClients, looksLikeEmail, readExistingClients, removeExistingClient, splitEmails,
} from '../mobile-app/src/services/coachExistingClients.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// A client whose rpc answers from `answer(name, args)`, recording each call.
function fakeClient(answer) {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push([name, args]); return answer(name, args, calls.length); } };
}
const LIST = { closes_at: '2027-01-11T00:00:00+00:00', open: true, emails: [{ email: 'a@example.com', added_at: '2026-11-12T10:00:00+00:00' }] };

// ── The service ───────────────────────────────────────────────────────────────

test('splitEmails takes what a coach pastes: any separator, trimmed, lowercased, once each', () => {
  assert.deepEqual(splitEmails(' A@Example.com, b@example.com;c@example.com\n\nd@example.com  a@example.com '),
    ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']);
  assert.deepEqual(splitEmails(''), []);
  assert.deepEqual(splitEmails(null), []);
  assert.equal(looksLikeEmail('a@example.com'), true);
  for (const bad of ['not-an-email', 'a@b', '@example.com', 'a@@b.co', 'x'.repeat(250) + '@b.co', null]) assert.equal(looksLikeEmail(bad), false, String(bad));
});

test('readExistingClients: the list, or why not, and never an empty list for a failed read', async () => {
  const ok = fakeClient(() => ({ data: LIST, error: null }));
  assert.deepEqual(await readExistingClients(ok, 'trainer', 4), { ok: true, ready: true, list: {
    closesAt: '2027-01-11T00:00:00+00:00', open: true, emails: [{ email: 'a@example.com', addedAt: '2026-11-12T10:00:00+00:00' }] } });
  assert.deepEqual(ok.calls, [['get_coach_existing_clients', { p_provider_role: 'trainer', p_provider_id: 4 }]]);
  // Before the migration runs: the function is not there yet.
  assert.deepEqual(await readExistingClients(fakeClient(() => ({ data: null, error: { code: 'PGRST202', message: 'x' } })), 'trainer', 4), { ok: true, ready: false });
  assert.deepEqual(await readExistingClients(fakeClient(() => ({ data: null, error: { code: '42501', message: 'not your provider row' } })), 'trainer', 4), { ok: false, error: 'refused' });
  assert.deepEqual(await readExistingClients(fakeClient(() => { throw new Error('offline'); }), 'trainer', 4), { ok: false, error: 'failed' });
  assert.deepEqual(await readExistingClients(fakeClient(() => ({ data: { emails: [] }, error: null })), 'trainer', 4), { ok: false, error: 'failed' }, 'no close date is not a list');
  assert.deepEqual(await readExistingClients(null, 'trainer', 4), { ok: false, error: 'failed' });
});

test('addExistingClients sends 200 at a time and says what the batches before a failure added', async () => {
  // The database's own limit (add_coach_existing_clients), so no batch is refused for its size.
  assert.equal(ADD_BATCH, 200);
  assert.match(read('supabase-migrations/2026-11-12-coach-existing-clients.sql'), /if coalesce\(cardinality\(p_emails\), 0\) > 200 then/);
  const emails = Array.from({ length: ADD_BATCH + 1 }, (_, i) => `p${i}@example.com`);
  const ok = fakeClient((_n, args) => ({ data: { added: args.p_emails.length, invalid: args.p_emails.length === 1 ? ['x'] : [] }, error: null }));
  assert.deepEqual(await addExistingClients(ok, 'nutritionist', 9, emails), { ok: true, added: ADD_BATCH + 1, invalid: ['x'] });
  assert.deepEqual(ok.calls.map(([n, a]) => [n, a.p_provider_role, a.p_provider_id, a.p_emails.length]), [
    ['add_coach_existing_clients', 'nutritionist', 9, ADD_BATCH], ['add_coach_existing_clients', 'nutritionist', 9, 1]]);
  const closed = fakeClient((_n, _a, i) => (i === 1 ? { data: { added: 200, invalid: [] }, error: null } : { data: null, error: { code: 'P0001', message: 'existing_client_list_closed' } }));
  assert.deepEqual(await addExistingClients(closed, 'trainer', 4, emails), { ok: false, error: 'closed', added: 200, invalid: [] });
  assert.equal((await addExistingClients(fakeClient(() => ({ data: null, error: { code: 'PGRST202' } })), 'trainer', 4, ['a@b.co'])).error, 'unavailable');
  assert.equal((await addExistingClients(fakeClient(() => ({ data: null, error: { code: '42501' } })), 'trainer', 4, ['a@b.co'])).error, 'refused');
  assert.equal((await addExistingClients(fakeClient(() => { throw new Error('offline'); }), 'trainer', 4, ['a@b.co'])).error, 'failed');
});

test('removeExistingClient: removed or not, and a closed list says so', async () => {
  const ok = fakeClient(() => ({ data: true, error: null }));
  assert.deepEqual(await removeExistingClient(ok, 'trainer', 4, 'a@example.com'), { ok: true, removed: true });
  assert.deepEqual(ok.calls, [['remove_coach_existing_client', { p_provider_role: 'trainer', p_provider_id: 4, p_email: 'a@example.com' }]]);
  assert.deepEqual(await removeExistingClient(fakeClient(() => ({ data: false, error: null })), 'trainer', 4, 'a@example.com'), { ok: true, removed: false });
  assert.deepEqual(await removeExistingClient(fakeClient(() => ({ data: null, error: { code: 'P0001', message: 'existing_client_list_closed' } })), 'trainer', 4, 'a@example.com'), { ok: false, error: 'closed' });
});

// ── The checkout resolver ─────────────────────────────────────────────────────

const origin = await loadRealModule(join(ROOT, 'src/lib/coach-origin.ts'), {
  typescript: true,
  registry: new Map([['./coach-origin.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-origin.mjs')).href)]]),
});

test('the resolver: an existing client is 0% with no referral; an in-flight tag keeps its id; anything else 15%', async () => {
  const resolve = (answer) => origin.resolveCoachCheckoutOrigin({ caller: { rpc: async () => answer }, providerRole: 'trainer', providerId: 4 });
  const quiet = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await resolve({ data: [{ origin: 'coach_existing', referral_id: 'ref-should-not-ride' }], error: null }), { origin: 'coach_existing', feeBps: 0, referralId: null });
    assert.deepEqual(await resolve({ data: [{ origin: 'coach_invite', referral_id: 'ref-1' }], error: null }), { origin: 'coach_invite', feeBps: 0, referralId: 'ref-1' });
    assert.deepEqual(await resolve({ data: [{ origin: 'marketplace', referral_id: null }], error: null }), { origin: 'marketplace', feeBps: 1500, referralId: null });
    assert.deepEqual(await resolve({ data: [{ origin: 'coach_brought', referral_id: null }], error: null }), { origin: 'marketplace', feeBps: 1500, referralId: null }, 'a name it does not know');
    assert.deepEqual(await resolve({ data: null, error: { message: 'gone' } }), { origin: 'marketplace', feeBps: 1500, referralId: null }, 'fail toward Shape\'s fee');
  } finally { console.warn = quiet; }
});

// ── The editor, mounted ───────────────────────────────────────────────────────

const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');
const service = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/coachExistingClients.mjs')).href);
const MOD = 'mobile-app/src/broadsheet/BSCoachExistingClients.jsx';
const code = babel.transformSync(read(MOD), { presets: [presetReact], plugins: [commonjs], babelrc: false, configFile: false }).code;
const mod = { exports: {} };
new Function('require', 'module', 'exports', 'window', code)((n) => {
  if (n === 'react') return React;
  if (n === '../services/coachExistingClients.mjs') return service;
  throw new Error('unexpected import ' + n);
}, mod, mod.exports, W);
const { BSCoachExistingClients } = mod.exports;

const T = { INK: '#111', INK50: '#777', INK70: '#555', PAPER: '#fff' };
const KIT = {
  head: (l) => React.createElement('h3', null, l),
  callout: (_tone, _mark, words, key) => React.createElement('div', { 'data-callout': key }, words),
  tile: {}, pill: () => ({}), heatFill: { bg: '#000', fg: '#fff' }, amber: '#a70', tealText: '#077', inkA: () => 'rgba(0,0,0,0.1)', sans: 'sans',
};
const COACH = '33333333-3333-4333-8333-333333333333';
let db = null;
W.ShapeAuth = { getCachedState: () => ({ user: { id: COACH } }), get client() { return db; } };
// The app's i18n fills a message's arguments; a stand-in that does only that, over the English defaults.
W.ShapeI18n = { locale: 'en-US', t: (_key, opts) => String(opts?.defaultValue ?? '').replace(/\{(\w+)\}/g, (m, k) => (opts && opts[k] != null ? String(opts[k]) : m)) };
async function mount(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(BSCoachExistingClients, { role: 'trainer', providerId: 4, t: T, kit: KIT, ...props })); });
  return { host, root, done: async () => { await React.act(async () => { root.unmount(); }); host.remove(); } };
}
const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const typeInto = async (el, value) => {
  const set = Object.getOwnPropertyDescriptor(W.HTMLTextAreaElement.prototype, 'value').set;
  await React.act(async () => { set.call(el, value); el.dispatchEvent(new W.Event('input', { bubbles: true })); });
};

test('the editor reads the coach\'s list, adds to it while open, and draws what the database answered', async () => {
  let rows = [...LIST.emails];
  const sent = [];
  db = fakeClient((name, args) => {
    if (name === 'get_coach_existing_clients') return { data: { ...LIST, emails: rows }, error: null };
    if (name === 'add_coach_existing_clients') {
      sent.push(args.p_emails);
      rows = rows.concat(args.p_emails.filter(looksLikeEmail).map((email) => ({ email, added_at: null })));
      return { data: { added: args.p_emails.filter(looksLikeEmail).length, invalid: args.p_emails.filter((e) => !looksLikeEmail(e)) }, error: null };
    }
    if (name === 'remove_coach_existing_client') { rows = rows.filter((r) => r.email !== args.p_email); return { data: true, error: null }; }
    return { data: null, error: { code: 'x' } };
  });
  const m = await mount();
  await settle();
  assert.equal(m.host.querySelector('[data-existing-clients]').getAttribute('data-existing-clients'), 'ready');
  assert.match(m.host.textContent, /Clients you coached before Shape pay no Shape fee\. List them by the email they use on Shape\. You can add or remove people until .*2027.*; after that the list is fixed\./);
  assert.deepEqual([...m.host.querySelectorAll('[data-existing-list] li span')].map((s) => s.textContent), ['a@example.com']);
  const add = m.host.querySelector('[data-existing-add]');
  assert.equal(add.disabled, true, 'nothing typed, nothing to add');
  await typeInto(m.host.querySelector('textarea'), 'B@Example.com, not-an-email');
  assert.match(m.host.textContent, /These aren’t emails and will be skipped: not-an-email/);
  await React.act(async () => { m.host.querySelector('[data-existing-add]').click(); });
  await settle();
  assert.deepEqual(sent, [['b@example.com', 'not-an-email']]);
  assert.match(m.host.textContent, /Added ✓ \(1\)/);
  assert.match(m.host.textContent, /Skipped, not an email or your own: not-an-email/);
  assert.deepEqual([...m.host.querySelectorAll('[data-existing-list] li span')].map((s) => s.textContent), ['a@example.com', 'b@example.com'], 'read again after the write');
  assert.equal(m.host.querySelector('textarea').value, '', 'the draft clears once it is saved');
  // Remove one.
  await React.act(async () => { m.host.querySelector('button[aria-label="Remove a@example.com"]').click(); });
  await settle();
  assert.deepEqual([...m.host.querySelectorAll('[data-existing-list] li span')].map((s) => s.textContent), ['b@example.com']);
  await m.done();
});

test('a closed list still shows who is on it, and offers nothing to add or remove', async () => {
  db = fakeClient(() => ({ data: { ...LIST, open: false, closes_at: '2026-11-01T00:00:00+00:00' }, error: null }));
  const m = await mount();
  await settle();
  assert.match(m.host.textContent, /Your list closed on .*, and the people on it still pay no Shape fee\./);
  assert.equal(m.host.querySelector('textarea'), null);
  assert.equal(m.host.querySelector('button[aria-label^="Remove"]'), null);
  assert.deepEqual([...m.host.querySelectorAll('[data-existing-list] li span')].map((s) => s.textContent), ['a@example.com']);
  await m.done();
});

test('a list the database refuses as closed mid-edit says so on the page', async () => {
  db = fakeClient((name) => (name === 'get_coach_existing_clients'
    ? { data: LIST, error: null }
    : { data: null, error: { code: 'P0001', message: 'existing_client_list_closed' } }));
  const m = await mount();
  await settle();
  await typeInto(m.host.querySelector('textarea'), 'new@example.com');
  await React.act(async () => { m.host.querySelector('[data-existing-add]').click(); });
  await settle();
  assert.match(m.host.querySelector('[data-callout="existingSave"]').textContent, /Your list has closed, so nothing more can be added or removed\./);
  await m.done();
});

test('a failed read says so with a retry, never an empty list; before the migration the section is not drawn', async () => {
  let fail = true;
  db = fakeClient(() => (fail ? { data: null, error: { code: '500', message: 'down' } } : { data: LIST, error: null }));
  const m = await mount();
  await settle();
  assert.match(m.host.textContent, /Couldn’t read your list just now\./);
  assert.doesNotMatch(m.host.textContent, /No one on your list yet/);
  fail = false;
  await React.act(async () => { [...m.host.querySelectorAll('button')].find((b) => b.textContent === 'Try again').click(); });
  await settle();
  assert.deepEqual([...m.host.querySelectorAll('[data-existing-list] li span')].map((s) => s.textContent), ['a@example.com']);
  await m.done();
  db = fakeClient(() => ({ data: null, error: { code: 'PGRST202', message: 'no function' } }));
  const pre = await mount();
  await settle();
  assert.equal(pre.host.innerHTML, '');
  await pre.done();
});

// ── The Add-a-client sheet ────────────────────────────────────────────────────

test('the Add-a-client sheet holds the list, its invite writes no 0% tag, and its link note says 15%', () => {
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /import \{ BSCoachExistingClients \} from '\.\/BSCoachExistingClients\.jsx';/);
  assert.match(pros, /<BSCoachExistingClients key=\{role \+ ':' \+ mine\.providerId\} role=\{role\} providerId=\{mine\.providerId\}/);
  const sheet = pros.slice(pros.indexOf('function BSProAddClientSheet('), pros.indexOf('function BSTrainerClients('));
  assert.doesNotMatch(sheet, /ShapeReferrals\?\.forClient|create_coach_referral\(|Retry 0% tag|byoPitch|noTagNote/);
  assert.match(sheet, /tr\('coach:addClient\.feeNote', \{ defaultValue: 'Clients who sign up through Shape pay Shape’s 15%, whether they found you here or came from your invite or link\./);
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /window\.ShapeReferrals = \{ link: coachReferralLink \};/);
  assert.doesNotMatch(backend, /rpc\('create_coach_referral'/);
  const editor = read(MOD);
  assert.doesNotMatch(editor, /from '\.\/iosAppBroadsheet/, 'never an import back into a role module');
});

// ── The Terms ─────────────────────────────────────────────────────────────────

test('the Terms state the fee as charged: 15% on every client who signs up through Shape, 0% on the existing-client list', () => {
  const terms = read('public/terms.html').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  assert.match(terms, /Clients who sign up through Shape — 15%\. When a client signs up with you through Shape, whether they found you on the Shape marketplace or came from your own invite or link, we take a 15% platform fee/);
  assert.match(terms, /Your existing clients — 0%\. When a client you coached before joining Shape is on your existing-client list \(the clients you list in the app by the email they use on Shape, within 60 days of joining Shape\), we take no platform fee/);
  assert.doesNotMatch(terms, /Clients you brought yourself — 0%|through your invite or your referral link, within the attribution window/);
  // A row keeps the rate it was made at, which is what honours the tags already sent.
  assert.match(terms, /The fee rate that applied when a subscription or purchase was created is the rate that governs it/);
  assert.match(terms, /Last updated — November 12, 2026/);
});
