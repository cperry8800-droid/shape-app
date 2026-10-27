// A coach is told why their listing is not in the marketplace, and can set the rates it needs.
// Owner, 2026-10-13: "fix all issues", among them #2318's registered "a hidden coach is not told
// on their dashboard" and "a deep link into the app marketplace for a hidden coach does not open
// the sheet". The approval email told a coach to "set your prices", and no page let them: a coach
// approved without a rate stayed out of the marketplace for good.
//
//   · src/lib/listing-readiness.mjs: the three conditions of provider_listing_ready_row, read
//     back to the coach as steps, and the rate a coach may type;
//   · /api/coach/listing: the coach's own listing (GET) and its rates (POST), as the coach;
//   · the website: the Profile page's Rates card and the Business page's notice, mounted in jsdom;
//   · the app: the Me page's notice and the Rates page, mounted in jsdom, and the marketplace's
//     word when a deep link names a coach who is not listed.
//
// ⚠ EVERY DOM CHECK COMPARES A BOOLEAN OR A STRING, never a node (tests/assert-dom-value.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { LISTING_STEPS, listingMissing, parseRate } from '../src/lib/listing-readiness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');

// ── The rule ────────────────────────────────────────────────────────────────
test('the steps are the database rule, condition for condition', () => {
  const sql = read('supabase-migrations/2026-10-12-coach-listing-ready.sql').replace(/--[^\n]*/g, '');
  const body = sql.slice(sql.indexOf('create or replace function public.provider_listing_ready_row()'), sql.indexOf('revoke all on function public.provider_listing_ready_row()'));
  // If this rule changes, listingMissing has to change with it.
  assert.match(body, /new\.listing_ready :=\s+coalesce\(new\.price, 0\) > 0\s+and coalesce\(new\.stripe_account_status, ''\) = 'active'\s+and \(\s+btrim\(coalesce\(new\.listing_media ->> 'portrait', ''\)\) <> ''\s+or btrim\(coalesce\(v_avatar, ''\)\) <> ''\s+\);/);
  assert.deepEqual(LISTING_STEPS, ['price', 'payouts', 'photo']);
  const ready = { price: 120, stripeAccountStatus: 'active', portrait: 'https://x/p.jpg', avatar: null };
  assert.deepEqual(listingMissing(ready), []);
  assert.deepEqual(listingMissing({ ...ready, portrait: null, avatar: 'https://x/a.jpg' }), [], 'the profile photo stands in');
  assert.deepEqual(listingMissing({ ...ready, price: '120.00' }), [], 'numeric arrives as a string');
  for (const price of [null, undefined, 0, '0.00', -5, 'abc']) assert.deepEqual(listingMissing({ ...ready, price }), ['price'], String(price));
  for (const status of [null, 'pending', 'restricted', 'ACTIVE', ' active']) assert.deepEqual(listingMissing({ ...ready, stripeAccountStatus: status }), ['payouts'], String(status));
  for (const blank of [null, '', '   ']) assert.deepEqual(listingMissing({ ...ready, portrait: blank, avatar: blank }), ['photo'], JSON.stringify(blank));
  // btrim strips spaces only: a tab is a photo to the database, so it is one here.
  assert.deepEqual(listingMissing({ ...ready, portrait: '\t', avatar: null }), []);
  assert.deepEqual(listingMissing({}), ['price', 'payouts', 'photo'], 'in the order the coach is told them');
});

test('a rate is dollars with at most two decimals, above zero and below 100,000', () => {
  for (const [typed, value] of [['120', 120], ['$120', 120], ['1,200', 1200], [' 95.5 ', 95.5], ['60.25', 60.25], [80, 80], ['99999.99', 99999.99]]) {
    assert.equal(parseRate(typed), value, JSON.stringify(typed));
  }
  for (const bad of ['', '   ', null, undefined, '0', '0.00', '-5', '12.345', '1e3', 'abc', '12..5', '100000', '.5', 'Infinity', NaN]) {
    assert.equal(parseRate(bad), null, JSON.stringify(bad));
  }
});

// ── The route ───────────────────────────────────────────────────────────────
const COACH = { id: '44444444-4444-4444-8444-444444444444' };

// A chain that records each call and answers from `tables`; `.update()` merges into the rows.
function fakeDb(tables, { failRead = null, failWrite = false } = {}) {
  const calls = [];
  const from = (table) => {
    const call = { table, ops: [] };
    calls.push(call);
    let update = null;
    const answer = () => {
      if (failRead === table) return { data: null, error: { message: 'boom' } };
      if (update) {
        if (failWrite) return { data: null, error: { message: 'write failed' } };
        const rows = (tables[table] || []).map((r) => Object.assign(r, update));
        return { data: rows, error: null };
      }
      return { data: tables[table] || [], error: null };
    };
    const q = {
      select: (...a) => { call.ops.push(['select', ...a]); return q; },
      eq: (...a) => { call.ops.push(['eq', ...a]); return q; },
      order: (...a) => { call.ops.push(['order', ...a]); return q; },
      limit: (...a) => { call.ops.push(['limit', ...a]); return q; },
      update: (patch) => { call.ops.push(['update', patch]); update = patch; return q; },
      maybeSingle: () => Promise.resolve(failRead === table ? { data: null, error: { message: 'boom' } } : { data: (tables[table] || [])[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve(answer()).then(res, rej),
    };
    return q;
  };
  return { calls, client: { from } };
}

async function loadRoute(db, user = COACH) {
  const nextServer = require_('next/server');
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  return loadRealModule(join(ROOT, 'src/app/api/coach/listing/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => db.client }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/listing-readiness.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/listing-readiness.mjs')).href)],
    ]),
  });
}
const get = async (route) => { const r = await route.GET(new Request('https://shape.test/api/coach/listing')); return { status: r.status, body: await r.json() }; };
const post = async (route, body) => {
  const r = await route.POST(new Request('https://shape.test/api/coach/listing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const trainerRow = () => ({ id: 7, price: null, session_price: null, stripe_account_status: 'active', listing_media: { portrait: null }, listing_ready: false, suspended_at: null });

test('GET: signed out is 401; a trainer is told their listing and what it needs, as themselves', async () => {
  assert.equal((await get(await loadRoute(fakeDb({}), null))).status, 401);
  const db = fakeDb({ trainers: [trainerRow()], nutritionists: [], profiles: [{ avatar_url: null }] });
  const { status, body } = await get(await loadRoute(db));
  assert.equal(status, 200);
  assert.deepEqual(body, { listings: [{ role: 'trainer', id: 7, ready: false, suspended: false, missing: ['price', 'photo'], monthly: null, oneTime: null }] });
  const t = db.calls.find((c) => c.table === 'trainers');
  assert.deepEqual(t.ops.find((o) => o[0] === 'eq'), ['eq', 'owner_id', COACH.id], 'only the coach\'s own row');
  assert.match(t.ops.find((o) => o[0] === 'select')[1], /session_price/);
  assert.match(t.ops.find((o) => o[0] === 'select')[1], /suspended_at/);
  assert.match(db.calls.find((c) => c.table === 'nutritionists').ops.find((o) => o[0] === 'select')[1], /meal_plan_price/);
});

test('GET: the database\'s verdict is the one shown, the profile photo counts, and a failed read is 500', async () => {
  const row = { ...trainerRow(), price: '120.00', session_price: '60.00', listing_ready: true };
  const { body } = await get(await loadRoute(fakeDb({ trainers: [row], profiles: [{ avatar_url: 'https://x/a.jpg' }] })));
  assert.deepEqual(body.listings[0], { role: 'trainer', id: 7, ready: true, suspended: false, missing: [], monthly: 120, oneTime: 60 });
  // The marketplace filters on the column, so a row the database has not marked ready is not
  // called ready, whatever the steps say.
  const unmarked = await get(await loadRoute(fakeDb({ trainers: [{ ...row, listing_ready: false }], profiles: [{ avatar_url: 'https://x/a.jpg' }] })));
  assert.deepEqual([unmarked.body.listings[0].ready, unmarked.body.listings[0].missing], [false, []]);
  const failed = await get(await loadRoute(fakeDb({ trainers: [row] }, { failRead: 'nutritionists' })));
  assert.equal(failed.status, 500);
  assert.ok(!('listings' in failed.body), 'never a partial answer read as "no listing"');
});

test('POST: refuses what is not a role or a rate, and saves the rates on the coach\'s own row', async () => {
  const db = fakeDb({ trainers: [trainerRow()], profiles: [{ avatar_url: null }] });
  const route = await loadRoute(db);
  for (const body of [{ role: 'admin', monthly: 120 }, { monthly: 120 }, { role: 'trainer', monthly: '' }, { role: 'trainer', monthly: '0' }, { role: 'trainer', monthly: '12.345' }, { role: 'trainer', monthly: 120, oneTime: 'abc' }]) {
    const r = await post(route, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(typeof r.body.error, 'string');
  }
  assert.equal(db.calls.filter((c) => c.ops.some((o) => o[0] === 'update')).length, 0, 'nothing written for a refused request');
  const saved = await post(route, { role: 'trainer', monthly: '$120', oneTime: '60' });
  assert.equal(saved.status, 200);
  const write = db.calls.find((c) => c.ops.some((o) => o[0] === 'update'));
  assert.equal(write.table, 'trainers');
  assert.deepEqual(write.ops.find((o) => o[0] === 'update')[1], { price: 120, session_price: 60 });
  assert.deepEqual(write.ops.find((o) => o[0] === 'eq'), ['eq', 'owner_id', COACH.id]);
  assert.deepEqual(saved.body.listing, { role: 'trainer', id: 7, ready: false, suspended: false, missing: ['photo'], monthly: 120, oneTime: 60 });
  // An empty single price clears it.
  await post(route, { role: 'trainer', monthly: 120, oneTime: '' });
  assert.deepEqual(db.calls.filter((c) => c.ops.some((o) => o[0] === 'update')).at(-1).ops.find((o) => o[0] === 'update')[1], { price: 120, session_price: null });
});

test('POST: a nutritionist\'s single price is the consult column; no row is 404, a failed write 500', async () => {
  const db = fakeDb({ nutritionists: [{ id: 9, price: null, meal_plan_price: null, stripe_account_status: null, listing_media: null, listing_ready: false }], profiles: [] });
  const r = await post(await loadRoute(db), { role: 'nutritionist', monthly: 150, oneTime: 80 });
  assert.equal(r.status, 200);
  assert.deepEqual(db.calls.find((c) => c.table === 'nutritionists').ops.find((o) => o[0] === 'update')[1], { price: 150, meal_plan_price: 80 });
  assert.equal((await post(await loadRoute(fakeDb({ trainers: [] })), { role: 'trainer', monthly: 120 })).status, 404);
  assert.equal((await post(await loadRoute(fakeDb({ trainers: [trainerRow()] }, { failWrite: true })), { role: 'trainer', monthly: 120 })).status, 500);
});

test('the route is in the War Room and the readiness rule is the one the route reads', () => {
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/coach\/listing', 'GET,POST'\]/);
  assert.match(read('src/app/api/coach/listing/route.ts'), /import \{ listingMissing, parseRate \} from '@\/lib\/listing-readiness\.mjs';/);
});

// ── A jsdom page ────────────────────────────────────────────────────────────
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const { createRoot } = require_('react-dom/client');
const { act } = React;

// The shipping source between two markers, compiled and evaluated with the names it reads.
function slice(path, from, to, scope, names) {
  const src = read(path);
  const start = src.indexOf(from);
  const end = src.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${path}: the slice ${from} … ${to} must stay where this test reads it`);
  const { code } = babel.transformSync(src.slice(start, end), { presets: [presetReact], babelrc: false, configFile: false });
  const keys = Object.keys(scope);
  return new Function(...keys, `${code}\nreturn { ${names.join(', ')} };`)(...keys.map((k) => scope[k]));
}

async function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, unmount: () => act(() => root.unmount()) };
}
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const byText = (host, sel, re) => [...host.querySelectorAll(sel)].find((n) => re.test(n.textContent));
// React's own setter, so a typed value reaches onChange.
function type(input, value) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const a = typeof answers === 'function' ? answers(url, init) : answers[init.method || 'GET'];
    return { ok: a.status < 400, status: a.status, json: async () => a.body };
  };
  return { calls, fn };
}

// ── The website ─────────────────────────────────────────────────────────────
test('website Profile: the Rates card says what the listing needs and saves the rates through the route', async () => {
  const listing = { role: 'trainer', id: 7, ready: false, missing: ['price', 'payouts'], monthly: null, oneTime: null };
  const f = fakeFetch({
    GET: { status: 200, body: { listings: [listing] } },
    POST: { status: 200, body: { listing: { ...listing, missing: ['payouts'], monthly: 120, oneTime: 60 } } },
  });
  window.TEAL_BRIGHT = '#2ee0c4';
  const { CoachListingRatesCard, listingStepsLine } = slice('public/newdesign/dashProfileExtras.jsx', 'const LISTING_STEP_TEXT', '// Marketplace listing photos', { React, window, fetch: f.fn }, ['CoachListingRatesCard', 'listingStepsLine']);
  assert.equal(listingStepsLine(['price', 'payouts', 'photo']), 'your monthly rate, payouts set up (Business → Set up payouts) and a photo (below, or your profile photo)');
  const { host, unmount } = await mount(React.createElement(CoachListingRatesCard));
  await settle();
  assert.equal(f.calls[0].url, '/api/coach/listing');
  const status = host.querySelector('[role="status"]');
  assert.equal(text(status).includes("Members can't find you yet. Your listing appears in the marketplace once it has your monthly rate and payouts set up"), true, text(status));
  const [monthly, oneTime] = host.querySelectorAll('input');
  assert.equal(oneTime.getAttribute('aria-label'), 'Single session price in dollars', 'the trainer page\'s one-time price');
  await act(async () => { type(monthly, '120'); type(oneTime, '60'); });
  await act(async () => { byText(host, 'button', /Save rates/).click(); });
  await settle();
  assert.deepEqual(f.calls.at(-1), { url: '/api/coach/listing', method: 'POST', body: { role: 'trainer', monthly: '120', oneTime: '60' } });
  assert.equal(text(host).includes('Rates saved'), true);
  assert.equal(text(host.querySelector('[role="status"]')).includes('payouts set up') && !text(host.querySelector('[role="status"]')).includes('monthly rate'), true, 'the notice follows the saved listing');
  await unmount();
});

test('website Profile: a refused rate shows the route\'s words; signed out and not approved say so', async () => {
  const listing = { role: 'trainer', id: 7, ready: true, missing: [], monthly: 120, oneTime: null };
  const f = fakeFetch({ GET: { status: 200, body: { listings: [listing] } }, POST: { status: 400, body: { error: 'Enter your monthly rate in dollars, for example 120.' } } });
  const { CoachListingRatesCard } = slice('public/newdesign/dashProfileExtras.jsx', 'const LISTING_STEP_TEXT', '// Marketplace listing photos', { React, window, fetch: f.fn }, ['CoachListingRatesCard']);
  const a = await mount(React.createElement(CoachListingRatesCard));
  await settle();
  assert.equal(text(a.host).includes('Your listing is in the marketplace.'), true);
  assert.equal(a.host.querySelector('input').value, '120', 'the saved rate is filled in');
  await act(async () => { byText(a.host, 'button', /Save rates/).click(); });
  await settle();
  assert.equal(text(a.host).includes('Enter your monthly rate in dollars, for example 120.'), true);
  await a.unmount();
  for (const [answer, words] of [[{ status: 401, body: {} }, 'Sign in as a coach to set your rates.'], [{ status: 200, body: { listings: [] } }, 'Your listing appears once your coach application is approved.'], [{ status: 500, body: {} }, "Couldn't load your listing"]]) {
    const g = fakeFetch({ GET: answer });
    const { CoachListingRatesCard: Card } = slice('public/newdesign/dashProfileExtras.jsx', 'const LISTING_STEP_TEXT', '// Marketplace listing photos', { React, window, fetch: g.fn }, ['CoachListingRatesCard']);
    const m = await mount(React.createElement(Card));
    await settle();
    assert.equal(text(m.host).includes(words), true, `${answer.status}: ${text(m.host)}`);
    await m.unmount();
  }
  // The capacity card (task #10) sits between the rates and the photos.
  assert.match(read('public/newdesign/dashProfileExtras.jsx'), /<CoachCredentialsCard \/><CoachListingRatesCard \/><CoachCapacityCard \/><CoachListingMediaCard \/>/);
});

test('GET: a listing staff suspended says so (owner: "suspended until futher review")', async () => {
  const row = { ...trainerRow(), price: '120.00', listing_ready: false, suspended_at: '2026-10-13T18:00:00Z' };
  const { body } = await get(await loadRoute(fakeDb({ trainers: [row], profiles: [{ avatar_url: 'https://x/a.jpg' }] })));
  assert.deepEqual([body.listings[0].suspended, body.listings[0].ready], [true, false]);
});

const SUSPENDED_LINE = "Your listing is suspended until further review. Members can't find or subscribe to you while it is.";

test('a suspended coach whose listing is otherwise complete reads Suspended, never Live (Codex on #2399)', async () => {
  // listing_ready counts the price, payouts and photo, not staff's suspension, so the route can send both.
  const f = fakeFetch({ GET: { status: 200, body: { listings: [{ role: 'trainer', id: 7, ready: true, suspended: true, missing: [], monthly: 120, oneTime: null }] } } });
  const { CoachListingRatesCard } = slice('public/newdesign/dashProfileExtras.jsx', 'const LISTING_STEP_TEXT', '// Marketplace listing photos', { React, window, fetch: f.fn }, ['CoachListingRatesCard']);
  const card = await mount(React.createElement(CoachListingRatesCard));
  await settle();
  assert.equal(text(card.host.querySelector('[role="status"]')), '!' + SUSPENDED_LINE);
  assert.equal(text(card.host.querySelector('[data-px-pill]')), 'Suspended');
  assert.equal(text(card.host).includes('Your listing is in the marketplace.'), false);
  assert.equal(text(card.host).includes('Live'), false);
  await card.unmount();
});

test('a suspended coach is told it, with no steps to fix, on the website and in the app', async () => {
  const listing = { ready: false, suspended: true, missing: ['price', 'payouts', 'photo'] };
  const shellWindow = { dashShellHref: (href) => href };
  const { DbzListingNotice } = slice('public/newdesign/dashBusiness.jsx', 'const DBZ_LISTING_STEP', '// ── The page', { React, window: shellWindow, DBZ_AMBER: '#d8a23a', DBZ_INK: '#f2ede4', DBZ_TEAL: '#2ee0c4' }, ['DbzListingNotice']);
  const web = await mount(React.createElement(DbzListingNotice, { role: 'trainer', listing }));
  assert.equal(text(web.host), `Suspended${SUSPENDED_LINE}`);
  assert.ok(!web.host.querySelector('a'), 'no link to steps that would not lift it');
  await web.unmount();

  const f = fakeFetch({ GET: { status: 200, body: { listings: [{ role: 'trainer', id: 7, ...listing, monthly: 120, oneTime: null }] } } });
  const { CoachListingRatesCard } = slice('public/newdesign/dashProfileExtras.jsx', 'const LISTING_STEP_TEXT', '// Marketplace listing photos', { React, window, fetch: f.fn }, ['CoachListingRatesCard']);
  const card = await mount(React.createElement(CoachListingRatesCard));
  await settle();
  assert.equal(text(card.host).includes(SUSPENDED_LINE), true, text(card.host));
  assert.equal(text(card.host).includes("Members can't find you yet"), false);
  await card.unmount();

  const { BSListingNotice } = appSlice();
  const app = await mount(React.createElement(BSListingNotice, { listing, onRates() {}, onPayouts() {}, onPhotos() {} }));
  assert.equal(text(app.host), `Suspended${SUSPENDED_LINE}`);
  assert.equal(app.host.querySelectorAll('button').length, 0, 'no step actions');
  await app.unmount();
});

test('website Business: the notice names the missing steps and links to the Profile page in the shell', async () => {
  const shellWindow = { dashShellHref: (href) => (href === 'NutritionistProfile.html' ? '#profile' : href) };
  const { DbzListingNotice } = slice('public/newdesign/dashBusiness.jsx', 'const DBZ_LISTING_STEP', '// ── The page', { React, window: shellWindow, DBZ_AMBER: '#d8a23a', DBZ_INK: '#f2ede4', DBZ_TEAL: '#2ee0c4' }, ['DbzListingNotice']);
  const { host, unmount } = await mount(React.createElement(DbzListingNotice, { role: 'nutritionist', listing: { ready: false, missing: ['price', 'payouts', 'photo'] } }));
  assert.equal(text(host).includes("Members can't find or subscribe to you until your listing has your monthly rate, payouts set up (below) and a photo."), true, text(host));
  assert.equal(host.querySelector('a').getAttribute('href'), '#profile', 'an in-shell switch, not a second page load');
  await unmount();
  const page = read('public/newdesign/dashBusiness.jsx');
  assert.match(page, /\{isLive && listing && !listing\.ready && <DbzListingNotice listing=\{listing\} role=\{role\} \/>\}/);
  assert.match(page, /fetch\("\/api\/coach\/listing", \{ credentials: "same-origin", cache: "no-store" \}\)/);
});

// ── The app ─────────────────────────────────────────────────────────────────
const THEME = new Proxy({ isLight: true, padX: 18, MONO: 'mono', DISPLAY: 'display' }, { get: (t, k) => (k in t ? t[k] : '#123456') });
// Settings → Your practice in the client module, where the listing tools live.
function settingsPractice() {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const i = client.indexOf("{detail === 'practice' && (<>");
  return client.slice(i, client.indexOf('{capacity && isCoachRole && (', i));
}
const tr = (key, opts = {}) => String(opts.defaultValue ?? key).replace(/\{(\w+)\}/g, (_, k) => (k in opts ? String(opts[k]) : `{${k}}`));
function appSlice(scope = {}) {
  return slice('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', 'const BS_LISTING_STEP_KEYS', 'function BS_CONSOLE_SAMPLE(', {
    React, window, useBS: () => THEME, useShapeTr: () => tr, useStateBSP: React.useState,
    BSPage: ({ children }) => React.createElement('main', null, children),
    BSBackButton: ({ onClick, label }) => React.createElement('button', { type: 'button', onClick }, label),
    BS_MAST_TOP_CSS: '0px',
    ...scope,
  }, ['BSListingNotice', 'BSCoachRatesPage', 'bsRatesLine']);
}

test('app Your practice: the notice lists each missing step with the action that fixes it', async () => {
  const { BSListingNotice } = appSlice();
  const hits = [];
  const { host, unmount } = await mount(React.createElement(BSListingNotice, {
    listing: { ready: false, missing: ['price', 'payouts', 'photo'] },
    onRates: () => hits.push('rates'), onPayouts: () => hits.push('payouts'), onPhotos: () => hits.push('photos'),
  }));
  assert.equal(host.querySelector('[role="status"]') != null, true);
  assert.equal(text(host).includes("Members can't find or subscribe to you until your listing has:"), true);
  for (const [label, hit] of [['Set rates', 'rates'], ['Set up payouts', 'payouts'], ['Add a photo', 'photos']]) {
    await act(async () => { byText(host, 'button', new RegExp(label)).click(); });
    assert.equal(hits.at(-1), hit, label);
  }
  await unmount();
  // The host is Settings → Your practice (the old coach Me page that held these was never
  // rendered; owner, 2026-10-17: "Move to Your practice"). The pros module hands the tools over
  // on window, and Settings reads them at call time.
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /Object\.assign\(window, \{ BSTrainerApp, BSNutritionistApp, BSCoachRatesPage, BSListingNotice, BSProListingMediaSheet, BSProMonthlyOfferSheet, bsRatesLine \}\);/);
  assert.doesNotMatch(pros, /function BSProMe\(|function BSCoachGoalPlanPage\(/, 'the dead pages are gone');
  const practice = settingsPractice();
  assert.match(practice, /\{isCoachRole && myListing && !myListing\.ready && window\.BSListingNotice && \(\(\) => \{/);
  assert.match(practice, /<Notice listing=\{myListing\} onRates=\{\(\) => setShowRates\(true\)\} onPhotos=\{\(\) => setListingSheet\('photos'\)\} onPayouts=\{startPayoutSetup\} \/>/);
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /const get = isCoachRole && window\.ShapeCoachListing && window\.ShapeCoachListing\.getMine;/);
  assert.match(client, /if \(showRates && window\.BSCoachRatesPage\) \{\n\s+const RatesPage = window\.BSCoachRatesPage;\n\s+return <RatesPage role=\{coachRole\} listing=\{myListing\}/);
});

// ── A dietitian's practice is the nutritionist one (Codex on #2483) ──────────
test('app Your practice: a dietitian gets the practice rows, on the nutritionist listing, hours and rates', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const line = client.match(/\n\s+const coachRole = (tweaks\.role === 'trainer'[^\n]+);\n\s+const isCoachRole = !!coachRole;/);
  assert.ok(line, 'Settings derives one practice role');
  const coachRole = (role) => new Function('tweaks', `return ${line[1]};`)({ role });
  assert.equal(coachRole('trainer'), 'trainer');
  assert.equal(coachRole('nutritionist'), 'nutritionist');
  assert.equal(coachRole('dietitian'), 'nutritionist');
  for (const r of ['client', 'shape_radio', undefined]) assert.equal(coachRole(r), null, String(r));
  // Every practice surface reads that role, never the raw account role.
  assert.match(client, /setMyListing\(list\.find\(\(l\) => l\.role === coachRole\) \|\| null\);/);
  assert.match(client, /window\.ShapeConnect\?\.startOnboarding\?\.\(\{ role: coachRole \}\)/);
  assert.match(client, /window\.ShapeBookings\?\.getCapacity\?\.\(\{ role: coachRole \}\)/);
  assert.match(client, /return <BSCoachHoursPage role=\{coachRole \|\| 'trainer'\}/);
  assert.match(client, /return <BSCoachBusinessPage role=\{coachRole \|\| 'trainer'\}/);
  assert.equal((client.match(/return <Sheet role=\{coachRole\} accent=\{coachRole === 'nutritionist'/g) || []).length, 2, 'the photo and offer sheets');
  assert.match(client, /tweaks\.role === 'dietitian' \? tr\('coach:role\.dietitian'/, 'and the plan line names a dietitian as one');
  assert.match(client, /const kind = role === 'trainer' \? 'TRAINER' : \(role === 'nutritionist' \|\| role === 'dietitian'\) \? 'NUTRI' : 'CLIENT';/, 'and Public profile opens the coach profile');
});

test('app Rates: saves through ShapeCoachListing, follows the saved listing, and says when a rate is refused', async () => {
  const sent = [];
  let refuse = 0;
  window.ShapeCoachListing = { saveRates: async (args) => { sent.push(args); if (refuse) { const e = new Error('no'); e.status = refuse; throw e; } return { role: 'nutritionist', ready: true, missing: [], monthly: 150, oneTime: 80 }; } };
  const { BSCoachRatesPage, bsRatesLine } = appSlice();
  const savedListings = [];
  const listing = { role: 'nutritionist', ready: false, missing: ['price'], monthly: null, oneTime: null };
  const { host, unmount } = await mount(React.createElement(BSCoachRatesPage, { role: 'nutritionist', listing, onBack() {}, onSaved: (l) => savedListings.push(l), onPhotos() {}, onPayouts() {} }));
  assert.equal(text(host).includes('Single consult · $ · optional'), true);
  assert.equal(byText(host, 'button', /Set rates/) == null, true, 'no button to the page the coach is on');
  const [monthly, oneTime] = host.querySelectorAll('input');
  await act(async () => { type(monthly, '150'); type(oneTime, '80'); });
  await act(async () => { byText(host, 'button', /Save rates/).click(); });
  await settle();
  assert.deepEqual(sent.at(-1), { role: 'nutritionist', monthly: '150', oneTime: '80' });
  assert.equal(savedListings.at(-1).monthly, 150);
  assert.equal(text(host).includes('Rates saved'), true);
  refuse = 400;
  await act(async () => { byText(host, 'button', /Save rates/).click(); });
  await settle();
  assert.equal(text(host).includes('Enter your rates in dollars, for example 120.'), true);
  refuse = 500;
  await act(async () => { byText(host, 'button', /Save rates/).click(); });
  await settle();
  assert.equal(text(host).includes('Could not save your rates. Please try again.') && !text(host).includes('for example 120'), true, 'a failed save is not called a bad rate');
  await unmount();
  assert.equal(bsRatesLine({ role: 'trainer', monthly: null }, tr), 'Not set: your listing needs a monthly rate');
  assert.equal(bsRatesLine({ role: 'nutritionist', monthly: 150, oneTime: 80 }, tr), '$150/mo · $80/consult');
  assert.equal(bsRatesLine({ role: 'trainer', monthly: 95.5, oneTime: null }, tr), '$95.5/mo');
});

test('app: the backend door and the marketplace\'s word for a deep link to a coach who is not listed', () => {
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /window\.ShapeCoachListing = \{\s+getMine: getMyCoachListings,\s+saveRates: saveMyCoachRates,\s+publicByOwner: publicListingByOwner,\s+\};/);
  assert.match(backend, /fetch\(`\$\{apiBaseUrl\}\/api\/coach\/listing`, \{\s+method: 'POST',/);
  const market = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(market, /if \(hit\) \{ setOpen\(hit\); setOpenNo\(null\); setDeepMiss\(false\); \} else setDeepMiss\(true\);\s+if \(onCoachConsumed\) onCoachConsumed\(\);/);
  assert.match(market, /\{deepMiss \? \(\s+<div role="status"[\s\S]{0,400}tr\('marketplace:dir\.coachNotOpen'/);
  assert.match(market, /onClick=\{\(\) => setDeepMiss\(false\)\}/);
});

// ── A photo can be the last step (Codex on #2324) ──────────────────────────
test('website Profile: a photo saved below re-reads the readiness and keeps the rates as typed', async () => {
  let ready = false;
  const f = fakeFetch(() => ({ status: 200, body: { listings: [{ role: 'trainer', id: 7, ready, missing: ready ? [] : ['photo'], monthly: 120, oneTime: null }] } }));
  const { CoachListingRatesCard } = slice('public/newdesign/dashProfileExtras.jsx', 'const LISTING_STEP_TEXT', '// Marketplace listing photos', { React, window, fetch: f.fn }, ['CoachListingRatesCard']);
  const { host, unmount } = await mount(React.createElement(CoachListingRatesCard));
  await settle();
  assert.equal(text(host.querySelector('[role="status"]')).includes('a photo'), true);
  const [monthly] = host.querySelectorAll('input');
  await act(async () => { type(monthly, '150'); });
  ready = true;
  await act(async () => { window.dispatchEvent(new window.Event('shape:listing-changed')); });
  await settle();
  assert.equal(f.calls.length, 2, 'read again');
  assert.equal(text(host.querySelector('[role="status"]')).includes('Your listing is in the marketplace.'), true);
  assert.equal(host.querySelector('input').value, '150', 'the rate being typed is kept');
  await unmount();
  const src = read('public/newdesign/dashProfileExtras.jsx');
  const media = src.slice(src.indexOf('function CoachListingMediaCard()'));
  assert.match(media, /flash\("Listing saved ✓"\);\s+\/\/[^\n]*\n\s+try \{ window\.dispatchEvent\(new Event\("shape:listing-changed"\)\); \} catch \(_\) \{\}/, 'the photo card announces a save');
});

test('app Your practice: the listing is read again when the photo sheet closes', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /\}\)\.catch\(\(\) => \{ if \(on\) setListingRead\('error'\); \}\);\s+return \(\) => \{ on = false; \};\s+\}, \[tweaks\.role, listingReads\]\);/);
  assert.match(settingsPractice(), /onClose=\{\(\) => \{ setListingSheet\(null\); setListingReads\(\(n\) => n \+ 1\); \}\} \/>;/);
});

test('app Your practice: a signed-in coach\'s Rates row says what was read, and never a sample rate', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /setMyListing\(list\.find\(\(l\) => l\.role === coachRole\) \|\| null\);\s+setListingRead\('live'\);\s+\}\)\.catch\(\(\) => \{ if \(on\) setListingRead\('error'\); \}\);/);
  assert.match(client, /const ratesRow = listingRead === 'live'\s+\? \{ l: tr\('coach:rates\.row'[\s\S]{0,80}?desc: myListing && window\.bsRatesLine \? window\.bsRatesLine\(myListing, tr\) : tr\('coach:rates\.rowSubNoListing'/);
  assert.match(client, /: listingRead === 'error'\s+\? \{ l: tr\('coach:rates\.row'[\s\S]{0,200}?tr\('coach:rates\.rowSubError'[\s\S]{0,120}?action: \(\) => setListingReads\(\(n\) => n \+ 1\) \}/);
  // Signed out (a preview), there is nothing to read and no sample rate either: the row opens the
  // rates page, which says the listing appears once an application is approved.
  assert.match(client, /: \{ l: tr\('coach:rates\.row', \{ defaultValue: 'Rates' \}\), r: tr\('settings:action\.edit', \{ defaultValue: 'Edit' \}\), action: \(\) => setShowRates\(true\) \};/);
  assert.match(client, /const practiceRows = \[\n[^\n]*settings:more\.publicProfile[^\n]*\n\s+ratesRow,\n[^\n]*coach:listing\.row[^\n]*setListingSheet\('photos'\) \},\n[^\n]*coach:offer\.row[^\n]*setListingSheet\('offer'\) \},/);
  const backend = read('mobile-app/src/services/shapeBackend.js');
  const getMine = backend.slice(backend.indexOf('async function getMyCoachListings()'), backend.indexOf('async function saveMyCoachRates('));
  assert.match(getMine, /if \(!response\.ok \|\| !Array\.isArray\(payload\.listings\)\) throw new Error/, 'a failed read is an error, not "no listing"');
  assert.match(getMine, /return payload\.listings;/);
});

test('a failed profile read is not "add a photo": GET is a 500, a POST saves and leaves the steps unknown', async () => {
  const row = { ...trainerRow(), price: 120, listing_ready: false, stripe_account_status: 'pending' };
  const failed = await get(await loadRoute(fakeDb({ trainers: [row], profiles: [{ avatar_url: 'https://x/a.jpg' }] }, { failRead: 'profiles' })));
  assert.equal(failed.status, 500);
  const db = fakeDb({ trainers: [row], profiles: [{ avatar_url: 'https://x/a.jpg' }] }, { failRead: 'profiles' });
  const saved = await post(await loadRoute(db), { role: 'trainer', monthly: 130 });
  assert.equal(saved.status, 200, 'the rates were saved');
  assert.deepEqual([saved.body.listing.monthly, saved.body.listing.ready, saved.body.listing.missing], [130, false, null]);
  // Read, the same coach is told only what is really missing.
  const ok = await get(await loadRoute(fakeDb({ trainers: [row], profiles: [{ avatar_url: 'https://x/a.jpg' }] })));
  assert.deepEqual(ok.body.listings[0].missing, ['payouts']);
});
