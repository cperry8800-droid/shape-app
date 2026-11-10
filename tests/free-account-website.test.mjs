// A free account and a paid membership, on the website (owner, 2026-11-10).
//
// An account is required, and a signed-in adult who has not paid is a FREE account: logging,
// their dashboard, the programs they build, seeing the leaderboards, hiring and messaging coaches,
// reviews and help-desk Nora. The $5 membership (or an approved coach's role, or an admin's) adds
// assistant Nora (action cards, voice, the weekly readout), Shape Radio, the AI helpers, Cook Mode
// voice, the points Store and being ranked on the leaderboards. No free trials. A renewal that
// failed is PAST DUE: free until the card is updated, told so at every paid feature, with "Update
// your card", which opens Shape's billing portal (POST /api/stripe/billing-portal).
//
// These run the shipped website code, lifted out of its classic scripts: the shell's membership
// door and lock (pageShell.jsx), the client dashboard's routes (ClientApp.html), its past-due
// notice and Today pill (dashClient.jsx), Settings' membership row (clientMeSettings.jsx), the
// radio's refusals (radioInstrument.jsx, radio.jsx) and Nora's action card (chatWidget.jsx).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core'), preset = require('next/dist/compiled/babel/preset-react');
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const slice = (src, from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `the code between "${from}" and "${to}" moved`);
  return src.slice(a, b);
};
const jsx = (code) => babel.transformSync(code, { presets: [preset], babelrc: false, configFile: false }).code;
const PAST_DUE = 'Your payment didn’t go through. Update your card to get Shape Radio and Nora back.';

const SHELL = read('public/newdesign/pageShell.jsx');
const DASH = read('public/newdesign/dashClient.jsx');
const SETTINGS = read('public/newdesign/clientMeSettings.jsx');
const RADIO = read('public/newdesign/radioInstrument.jsx');
const RADIO_PAGE = read('public/newdesign/radio.jsx');
const CHAT = read('public/newdesign/chatWidget.jsx');
const APP = read('public/newdesign/ClientApp.html');

// ── a page to draw into ─────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/ClientApp.html' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(el));
  await flush();
  return { host, text: () => host.textContent, unmount: () => act(async () => root.unmount()) };
}
const click = async (el) => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const button = (host, re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));

// A stand-in for the page's window: where it is, and where it was sent.
function fakeWindow(extra = {}) {
  const w = {
    location: { pathname: '/newdesign/ClientApp.html', search: '', hash: '#today', href: '', reload() { w.reloaded = true; }, replace(u) { w.replaced = u; } },
    alert(m) { (w.alerts = w.alerts || []).push(m); },
    ...extra,
  };
  return w;
}
// Scripted routes: { '/api/x': (init) => ({ status, body }) }, every call recorded.
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push([url, init.method || 'GET', init.body ? JSON.parse(init.body) : null]);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    const r = key ? routes[key](init) : { status: 404, body: {} };
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body };
  };
  f.calls = calls;
  return f;
}

// The shell's membership door, its billing portal, the lock kinds and the lock itself.
const KIT_SRC = jsx(slice(SHELL, '// ── The $5 membership checkout, from any page', 'Object.assign(window, {\n  ShapeMembership:'));
function kit(win, fetchImpl) {
  return new Function('React', 'window', 'fetch', 'mono', 'sans', KIT_SRC
    + '\nreturn { shapeStartMembership, shapeOpenBillingPortal, shapeLockKind, shapeNoraLock, shapeHasPaid, shapeHasNora, shapeNoraDaysLeft, shapeReadMembership, shapeMembershipPeek, shapeReadPlans, shapeMoney, shapeAnnualSaving, useShapeMembership, useShapePlans, ShapePaidLock, SHAPE_PAST_DUE_LINE, SHAPE_NORA_ENDED_LINE, SHAPE_COACH_INCLUDED_LINE };')(React, win, fetchImpl, 'mono', 'sans');
}
// window.ShapeMembership as pageShell.jsx publishes it, over a given window and fetch.
function publish(win, fetchImpl) {
  const k = kit(win, fetchImpl);
  win.ShapeMembership = {
    start: k.shapeStartMembership, portal: k.shapeOpenBillingPortal, read: k.shapeReadMembership, peek: k.shapeMembershipPeek,
    lockKind: k.shapeLockKind, noraLock: k.shapeNoraLock, hasPaid: k.shapeHasPaid, hasNora: k.shapeHasNora, noraDaysLeft: k.shapeNoraDaysLeft,
    plans: k.shapeReadPlans, money: k.shapeMoney, annualSaving: k.shapeAnnualSaving,
    pastDueLine: k.SHAPE_PAST_DUE_LINE, noraEndedLine: k.SHAPE_NORA_ENDED_LINE, coachIncludedLine: k.SHAPE_COACH_INCLUDED_LINE,
  };
  win.ShapePaidLock = k.ShapePaidLock;
  win.useShapeMembership = k.useShapeMembership;
  win.useShapePlans = k.useShapePlans;
  return k;
}
const PLANS = { monthly: { priceCents: 500, interval: 'month' }, annual: { priceCents: 4800, interval: 'year' } };
const ENDED = 'Your free week with Nora has ended. Join to keep her.';

// ── the shell ───────────────────────────────────────────────────────────────────────────────
test('shell: which prompt a locked paid feature shows, from a 402 code or a membership answer', () => {
  const { shapeLockKind: kind, SHAPE_PAST_DUE_LINE } = kit(fakeWindow(), async () => ({}));
  assert.equal(SHAPE_PAST_DUE_LINE, PAST_DUE, 'the owner\'s words');
  assert.equal(kind('payment_past_due'), 'pastdue');
  assert.equal(kind('membership_required'), 'join');
  assert.equal(kind({ signedIn: false }), 'signin');
  assert.equal(kind({ signedIn: true, member: false, pastDue: false }), 'join', 'a free account');
  assert.equal(kind({ signedIn: true, member: false, pastDue: true }), 'pastdue', 'past due is free, and told why');
  assert.equal(kind({ signedIn: true, member: true, pastDue: false }), null, 'a member is not locked');
  assert.equal(kind({ signedIn: true, member: false, coach: true }), null, 'an approved coach has the paid features');
  assert.equal(kind({ unknown: true }), null, 'an answer that never came locks nothing');
  assert.equal(kind(null), null);
  assert.equal(kind('something_else'), null);
});

test('shell: a past-due account\'s checkout (409 payment_past_due) opens the billing portal, never a second membership', async () => {
  const w = fakeWindow();
  const f = fakeFetch({
    '/api/stripe/platform-checkout': () => ({ status: 409, body: { code: 'payment_past_due', error: 'Past due.' } }),
    '/api/stripe/billing-portal': () => ({ status: 200, body: { url: 'https://billing.stripe.test/session' } }),
  });
  const { shapeStartMembership } = kit(w, f);
  assert.equal(await shapeStartMembership('/newdesign/Radio.html'), null, 'the page is navigating away');
  assert.deepEqual(f.calls.map((c) => [c[0], c[1]]), [['/api/stripe/platform-checkout', 'POST'], ['/api/stripe/billing-portal', 'POST']]);
  assert.deepEqual(f.calls[1][2], { returnPath: '/newdesign/Radio.html' }, 'back to the page it came from');
  assert.equal(w.location.href, 'https://billing.stripe.test/session');
  // Any other refusal is still said, with its code.
  const g = fakeFetch({ '/api/stripe/platform-checkout': () => ({ status: 409, body: { code: 'already_member', error: 'Already a member.' } }) });
  assert.deepEqual(await kit(fakeWindow(), g).shapeStartMembership(), { error: 'Already a member.', code: 'already_member' });
  // A portal that won't open says so.
  const h = fakeFetch({ '/api/stripe/billing-portal': () => ({ status: 500, body: { error: 'No billing account.' } }) });
  assert.deepEqual(await kit(fakeWindow(), h).shapeOpenBillingPortal('/x'), { error: 'No billing account.', code: null });
});

test('shell: the lock says the owner\'s line and Update your card when past due, and Join for a free account', async () => {
  const w = fakeWindow();
  const f = fakeFetch({
    '/api/stripe/billing-portal': () => ({ status: 200, body: { url: 'https://billing.stripe.test/p' } }),
    '/api/stripe/platform-checkout': () => ({ status: 200, body: { url: 'https://checkout.stripe.test/c' } }),
  });
  const { ShapePaidLock } = kit(w, f);
  const past = await mount(React.createElement(ShapePaidLock, { kind: 'pastdue', feature: 'Shape Radio', returnTo: '/newdesign/Radio.html' }));
  assert.match(past.text(), new RegExp(PAST_DUE.replace(/\./g, '\\.')));
  await click(button(past.host, /Update your card/));
  assert.deepEqual(f.calls.at(-1), ['/api/stripe/billing-portal', 'POST', { returnPath: '/newdesign/Radio.html' }]);
  assert.equal(w.location.href, 'https://billing.stripe.test/p');
  await past.unmount();

  const free = await mount(React.createElement(ShapePaidLock, { kind: 'join', feature: 'Shape Radio', returnTo: '/newdesign/Radio.html' }));
  assert.match(free.text(), /Shape Radio is part of Shape membership, \$5 a month\./);
  assert.ok(!free.text().includes(PAST_DUE));
  await click(button(free.host, /^Join$/));
  assert.equal(f.calls.at(-1)[0], '/api/stripe/platform-checkout');
  assert.equal(f.calls.at(-1)[2].returnTo, '/newdesign/Radio.html');
  await free.unmount();

  const out = await mount(React.createElement(ShapePaidLock, { kind: 'signin', feature: 'Shape Radio' }));
  assert.equal(out.host.querySelector('a').getAttribute('href'), '/newdesign/Pricing.html', 'a visitor is sent to make an account');
  await out.unmount();
  const none = await mount(React.createElement(ShapePaidLock, { kind: null }));
  assert.equal(none.text(), '', 'nothing locked, nothing drawn');
  await none.unmount();
});

test('shell: coaching includes the membership, and its checkout says so instead of selling one', async () => {
  const k = kit(fakeWindow(), async () => ({}));
  assert.equal(k.shapeLockKind({ signedIn: true, member: false, includedWithCoach: true }), null, 'paid features while the coaching pays');
  assert.equal(k.shapeHasPaid({ signedIn: true, includedWithCoach: true }), true);
  assert.equal(k.SHAPE_COACH_INCLUDED_LINE, 'Membership is included while you’re coached on Shape.');
  const f = fakeFetch({ '/api/stripe/platform-checkout': () => ({ status: 409, body: { code: 'already_member', includedWithCoach: true } }) });
  assert.deepEqual(await kit(fakeWindow(), f).shapeStartMembership('/x'), { error: k.SHAPE_COACH_INCLUDED_LINE, code: 'already_member', includedWithCoach: true });
});

test('shell: the yearly plan — start() passes it, the lock offers both at the real prices, and monthly only when there is no yearly plan', async () => {
  const w = fakeWindow();
  let plans = PLANS;
  const f = fakeFetch({
    '/api/membership/plans': () => ({ status: 200, body: plans }),
    '/api/stripe/platform-checkout': () => ({ status: 200, body: { url: 'https://checkout.stripe.test/c' } }),
  });
  const k = kit(w, f);
  await k.shapeStartMembership('/newdesign/Radio.html', { plan: 'annual' });
  assert.deepEqual(f.calls.at(-1)[2], { returnTo: '/newdesign/Radio.html', cancelPath: '/newdesign/Radio.html', plan: 'annual' });
  await k.shapeStartMembership('/a', '/newdesign/Pricing.html');
  assert.deepEqual(f.calls.at(-1)[2], { returnTo: '/a', cancelPath: '/newdesign/Pricing.html' }, 'the older call: a cancel path, no plan (the server\'s monthly default)');
  assert.equal(k.shapeAnnualSaving(PLANS), 20, '$48 against twelve $5 months');
  assert.equal(k.shapeAnnualSaving({ monthly: PLANS.monthly, annual: null }), null);
  assert.equal(k.shapeMoney(4800), '$48');
  assert.equal(k.shapeMoney(499), '$4.99');
  const v = await mount(React.createElement(k.ShapePaidLock, { kind: 'join', feature: 'Shape Radio', returnTo: '/newdesign/Radio.html' }));
  assert.match(v.text(), /Shape Radio is part of Shape membership, \$5 a month or \$48 a year\./);
  assert.ok(button(v.host, /Join · \$5\/mo/), 'monthly, at its price');
  await click(button(v.host, /\$48\/yr · save 20%/));
  assert.equal(f.calls.at(-1)[0], '/api/stripe/platform-checkout');
  assert.equal(f.calls.at(-1)[2].plan, 'annual');
  await v.unmount();
  // No yearly plan set up: monthly only.
  plans = { monthly: PLANS.monthly, annual: null };
  const only = await mount(React.createElement(kit(fakeWindow(), f).ShapePaidLock, { kind: 'join', feature: 'Shape Radio' }));
  assert.ok(!button(only.host, /\/yr/), 'a yearly plan that is not set up is offered');
  assert.match(only.text(), /\$5 a month\./);
  await only.unmount();
});

test('shell: assistant Nora is on `nora` (the free week too); a week that ran out says so', async () => {
  const k = kit(fakeWindow(), async () => ({}));
  const WEEK = { startedAt: '2026-11-08T10:00:00Z', endsAt: new Date(Date.now() + 2.5 * 86400000).toISOString(), active: true };
  const OVER = { startedAt: '2026-10-01T10:00:00Z', endsAt: '2026-10-08T10:00:00Z', active: false };
  assert.equal(k.shapeHasNora({ ...FREE, nora: true, noraPreview: WEEK }), true, 'the free week opens Nora');
  assert.equal(k.shapeHasPaid({ ...FREE, nora: true, noraPreview: WEEK }), false, '…and nothing else');
  assert.equal(k.shapeLockKind({ ...FREE, nora: true, noraPreview: WEEK }), 'join', 'Radio, the Store and the full board stay locked');
  assert.equal(k.shapeNoraLock({ ...FREE, nora: true, noraPreview: WEEK }), null);
  assert.equal(k.shapeNoraDaysLeft({ ...FREE, noraPreview: WEEK }), 3);
  assert.equal(k.shapeNoraLock({ ...FREE, nora: false, noraPreview: OVER }), 'ended');
  assert.equal(k.shapeNoraLock({ ...FREE, nora: false, noraPreview: OVER, pastDue: true }), 'pastdue', 'past due says past due');
  assert.equal(k.shapeNoraLock({ ...FREE, nora: false, noraPreview: null }), 'join');
  assert.equal(k.shapeNoraLock('membership_required', { ...FREE, noraPreview: OVER }), 'ended', 'a 402, read against the answer in hand');
  assert.equal(k.shapeNoraLock('membership_required', { ...FREE, noraPreview: null }), 'join');
  assert.equal(k.shapeNoraLock('payment_past_due', { ...FREE, noraPreview: OVER }), 'pastdue');
  assert.equal(k.shapeHasNora({ ...FREE, member: true }), true, 'an answer without `nora` reads the paid features');
  const v = await mount(React.createElement(k.ShapePaidLock, { kind: 'ended', feature: 'Nora\'s weekly read' }));
  assert.ok(v.text().includes(ENDED), v.text());
  assert.ok(button(v.host, /^Join$/));
  await v.unmount();
});

// ── the client dashboard ────────────────────────────────────────────────────────────────────
// ClientApp.html's own script, run against stand-in pages: which one a route draws.
const APP_SRC = jsx(slice(APP, 'window.__shapeDashShell = "client";', '</script>\n<script src="globalChatButton.js'));
const page = (name) => () => React.createElement('section', { 'data-page': name }, name);
async function clientApp(hash, membership) {
  const host = document.createElement('div');
  host.id = 'root';
  document.body.appendChild(host);
  delete window.__shapeClientMembership;
  delete window.ShapeDashNotice;
  window.history.replaceState(null, '', '/newdesign/ClientApp.html' + hash);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(url);
    if (url.startsWith('/api/me/membership')) return { ok: true, status: 200, json: async () => membership };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  let root = null;
  const ReactDOM = { createRoot: (el) => { root = createRoot(el); return root; } };
  const Notice = page('ClientMembershipNotice');
  const names = ['ClientDashboardPage', 'ClientProgressPage', 'ClientWorkoutsPage', 'ClientNutritionPage', 'ClientLibraryPage', 'ClientTeamPage', 'ClientScorePage', 'ClientHabitsPage', 'ClientGoalsPage', 'LiveProfilePage', 'ClientMeSettings', 'ClientJoinPage', 'ClientAgeRestrictedPage'];
  const pages = names.map(page);
  const DashFrame = ({ children }) => React.createElement('div', null, children);
  await act(async () => {
    new Function('React', 'ReactDOM', 'window', 'document', 'fetch', 'ChatWidget', 'clientChatTabs', 'clientNavItems', 'clientPayoutCard', 'DashFrame', 'ClientMembershipNotice', ...names, APP_SRC)(
      React, ReactDOM, window, document, fetchImpl, () => null, [], () => [], null, DashFrame, Notice, ...pages);
  });
  await flush();
  const drawn = [...host.querySelectorAll('[data-page]')].map((n) => n.getAttribute('data-page'));
  const out = { drawn, calls, held: window.__shapeClientMembership, notice: window.ShapeDashNotice === Notice };
  await act(async () => root.unmount());
  host.remove();
  return out;
}
const FREE = { signedIn: true, member: false, coach: false, ageRestricted: false, pastDue: false, status: null };

test('client app: a free account draws the route it asked for, never a join panel in front of it', async () => {
  for (const [hash, want] of [['#today', 'ClientDashboardPage'], ['#workouts', 'ClientWorkoutsPage'], ['#nutrition', 'ClientNutritionPage'], ['#team', 'ClientTeamPage'], ['#score', 'ClientScorePage']]) {
    const r = await clientApp(hash, FREE);
    assert.ok(r.drawn.includes(want), `${hash} drew ${r.drawn.join(', ')}`);
    assert.ok(!r.drawn.includes('ClientJoinPage'), `${hash}: the join panel is back in front of a free account`);
  }
  const r = await clientApp('#today', FREE);
  assert.ok(r.calls.includes('/api/me/membership'));
  assert.equal(r.held.pastDue, false);
  assert.ok(r.notice, 'the shell\'s notice is not set for DashFrame to draw');
});

test('client app: past due draws the routes too, and says pastDue on window; the membership page and the age page', async () => {
  const past = await clientApp('#workouts', { ...FREE, pastDue: true, status: 'past_due' });
  assert.deepEqual(past.drawn, ['ClientWorkoutsPage']);
  assert.equal(past.held.pastDue, true, 'the paid features\' prompts and the notice read it here');
  const missing = await clientApp('#today', { signedIn: true, member: false });
  assert.equal(missing.held.pastDue, false, 'a missing field is not a failed renewal');
  assert.deepEqual((await clientApp('#membership', FREE)).drawn, ['ClientJoinPage'], 'what membership adds, from a locked feature');
  assert.deepEqual((await clientApp('#today', { ...FREE, ageRestricted: true })).drawn, ['ClientAgeRestrictedPage']);
  assert.ok((await clientApp('#settings', { ...FREE, ageRestricted: true })).drawn.includes('ClientMeSettings'), 'Settings stays open to a minor');
  const member = await clientApp('#today', { ...FREE, member: true });
  assert.deepEqual(member.drawn, ['ClientDashboardPage']);
});

// dashClient.jsx's notice (the shell's one place for it) and the Today pill.
const NOTICE_SRC = jsx(slice(DASH, 'function dclHasPaid(m)', 'function ClientJoinPage()'));
function notice(win) {
  return new Function('React', 'window', 'fetch', 'DCL_TEAL', 'DCL_MONO', NOTICE_SRC + '\nreturn ClientMembershipNotice;')(React, win, win.fetch, 'teal', 'mono');
}
test('past-due notice: the owner\'s line and Update your card, on every client route; nothing for a member or a free account', async () => {
  const f = fakeFetch({ '/api/stripe/billing-portal': () => ({ status: 200, body: { url: 'https://billing.stripe.test/n' } }) });
  const w = fakeWindow({ fetch: f, __shapeClientMembership: { ...FREE, pastDue: true } });
  w.location.hash = '#nutrition';
  w.location.pathname = '/newdesign/ClientApp.html';
  publish(w, f);
  const Notice = notice(w);
  const v = await mount(React.createElement(Notice));
  assert.ok(v.host.querySelector('[data-membership-notice="pastdue"]'));
  assert.ok(v.text().includes(PAST_DUE), v.text());
  await click(button(v.host, /Update your card/));
  assert.deepEqual(f.calls.at(-1), ['/api/stripe/billing-portal', 'POST', { returnPath: '/newdesign/ClientApp.html#nutrition' }], 'back to the route it was on');
  assert.equal(w.location.href, 'https://billing.stripe.test/n');
  await v.unmount();
  for (const m of [FREE, { ...FREE, member: true }, { ...FREE, coach: true, pastDue: true }, { signedIn: false }, { unknown: true }]) {
    const quiet = fakeWindow({ fetch: f, __shapeClientMembership: m });
    publish(quiet, f);
    const q = await mount(React.createElement(notice(quiet)));
    assert.equal(q.text(), '', JSON.stringify(m) + ' drew a notice');
    await q.unmount();
  }
});

test('pending membership: the notice waits for the payment to clear, then reloads on the same route as joined', async () => {
  let member = false;
  const f = fakeFetch({ '/api/me/membership': () => ({ status: 200, body: { ...FREE, member } }) });
  const w = fakeWindow({ fetch: f, __shapeClientMembership: FREE });
  w.location.search = '?member=pending';
  w.location.hash = '#workouts';
  publish(w, f);
  const v = await mount(React.createElement(notice(w)));
  assert.match(v.text(), /Confirming your membership/);
  member = true;
  await act(async () => { await new Promise((r) => setTimeout(r, 3100)); });
  await flush();
  assert.equal(w.replaced, '/newdesign/ClientApp.html?member=joined#workouts');
  await v.unmount();
});

test('Today pill: Member, Free or Past due — from the shell\'s answer first, the subscription read after', () => {
  const pill = new Function('DCL_TEAL', 'DCL_INK50', 'DCL_RED', slice(DASH, 'function dclMemberPill(acct, sub)', '\n}\n') + '\n}\nreturn dclMemberPill;')('teal', 'ink', 'red');
  assert.equal(pill(FREE, null).kind, 'free');
  assert.equal(pill(FREE, null).text, 'Free');
  assert.equal(pill(FREE, null).href, '#membership', 'Free opens what the membership adds');
  assert.equal(pill({ ...FREE, pastDue: true }, null).text, 'Past due');
  assert.equal(pill({ ...FREE, pastDue: true }, null).href, '#membership');
  assert.equal(pill({ ...FREE, member: true }, null).text, 'Member');
  assert.equal(pill({ ...FREE, coach: true }, null).text, 'Member', 'a coach\'s paid features');
  assert.equal(pill({ unknown: true }, { active: true }).text, 'Member', 'the subscription when the shell has no answer');
  assert.equal(pill(null, { active: false, pastDue: true }).text, 'Past due');
  assert.equal(pill(null, { active: false }).text, 'Free');
  assert.equal(pill(null, null).kind, 'unread', 'no answer is never "Free"');
});

test('membership page: lists only what the membership adds, and says the rest is free', () => {
  const perks = slice(DASH, 'const DCL_JOIN_PERKS = [', '];');
  for (const paid of ['Nora as your assistant', 'Shape Radio', 'Store', 'The full leaderboard and your exact rank']) assert.ok(perks.includes(paid), paid);
  assert.doesNotMatch(perks, /A place on the leaderboards/, 'being ranked is free now');
  for (const free of ['meal logging', 'Meal logging', 'Build your own workouts', 'Subscribe to trainers', 'Shape Kitchen']) assert.ok(!perks.includes(free), `${free} is free now, and listed as a perk`);
  assert.match(DASH, /const DCL_FREE_WITH_ACCOUNT = "Free with your account, membership or not: [^"]*hiring and messaging coaches/);
  assert.doesNotMatch(DASH, /Start your membership to use it/, 'the account works without it');
  assert.match(DASH, /pastDue \? "Your payment didn’t go through\."/);
});

test('membership page: monthly and yearly at the real prices, coaching that includes it, and the free week with Nora', async () => {
  const src = jsx(slice(DASH, 'const DCL_JOIN_PERKS = [', '// ── Your week:'));
  const draw = async (m, plansBody) => {
    const f = fakeFetch({
      '/api/membership/plans': () => (plansBody ? { status: 200, body: plansBody } : { status: 404, body: {} }),
      '/api/stripe/platform-checkout': () => ({ status: 200, body: { url: 'https://checkout.stripe.test/m' } }),
    });
    const w = fakeWindow({ fetch: f, __shapeClientMembership: m });
    publish(w, f);
    const Page = new Function('React', 'window', 'fetch', 'DCL_TEAL', 'DCL_INK50', 'DCL_RED', 'DCL_MONO', 'serif', 'DashFrame', 'clientNavItems', src + '\nreturn ClientJoinPage;')(
      React, w, f, 'teal', 'ink', 'red', 'mono', 'serif', ({ children }) => React.createElement('div', null, children), () => []);
    const v = await mount(React.createElement(Page));
    return { v, f, w };
  };
  const free = await draw(FREE, PLANS);
  assert.ok(button(free.v.host, /^Monthly · \$5\/mo$/));
  await click(button(free.v.host, /^Annual · \$48\/yr · save 20%$/));
  assert.deepEqual(free.f.calls.at(-1)[2], { returnTo: '/newdesign/ClientApp.html#today', cancelPath: '/newdesign/ClientApp.html#today', plan: 'annual' });
  assert.match(free.v.text(), /Try Nora free for a week after your first three workouts — no card\./, 'the free week is offered before it has happened');
  assert.match(free.v.text(), /Membership is included while you're coached on Shape\./);
  await free.v.unmount();
  const monthlyOnly = await draw(FREE, null);
  assert.ok(button(monthlyOnly.v.host, /Start membership · \$5\/month/), 'no plans answer: the monthly start');
  assert.ok(!button(monthlyOnly.v.host, /Annual/));
  await monthlyOnly.v.unmount();
  const week = await draw({ ...FREE, nora: true, noraPreview: { startedAt: 'a', endsAt: new Date(Date.now() + 4.2 * 86400000).toISOString(), active: true } }, PLANS);
  assert.match(week.v.text(), /Your free week with Nora: 5 days left\./);
  await week.v.unmount();
  const over = await draw({ ...FREE, nora: false, noraPreview: { startedAt: 'a', endsAt: '2026-10-08T00:00:00Z', active: false } }, PLANS);
  assert.ok(over.v.text().includes(ENDED));
  assert.doesNotMatch(over.v.text(), /Try Nora free for a week/, 'the week is once per account');
  await over.v.unmount();
  const coached = await draw({ ...FREE, includedWithCoach: true }, PLANS);
  assert.match(coached.v.text(), /Your coaching includes membership\./);
  assert.ok(!button(coached.v.host, /Monthly|Annual|Start membership/), 'no Join prompts for an account its coaching covers');
  await coached.v.unmount();
});

test('free week with Nora: told once when it first appears, with the days left; never to a member', async () => {
  const WEEK = { startedAt: '2026-11-09T08:00:00Z', endsAt: new Date(Date.now() + 6.4 * 86400000).toISOString(), active: true };
  const store = new Map();
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const w = fakeWindow({ fetch: fakeFetch({}), localStorage: ls, __shapeClientMembership: { ...FREE, nora: true, noraPreview: WEEK } });
  publish(w, w.fetch);
  const v = await mount(React.createElement(notice(w)));
  assert.ok(v.host.querySelector('[data-membership-notice="nora-week"]'));
  assert.match(v.text(), /You've unlocked a free week of Nora as your assistant/);
  assert.match(v.text(), /7 days left, no card needed\./);
  await click(button(v.host, /Got it/));
  assert.equal(v.text(), '', 'closed');
  assert.equal(store.get('shape.noraWeek.told.' + WEEK.startedAt), '1');
  await v.unmount();
  const again = await mount(React.createElement(notice(w)));
  assert.equal(again.text(), '', 'once: not told again on the next route');
  await again.unmount();
  const paid = fakeWindow({ fetch: fakeFetch({}), localStorage: new Map(), __shapeClientMembership: { ...FREE, member: true, nora: true, noraPreview: WEEK } });
  paid.localStorage = { getItem: () => null, setItem() {} };
  publish(paid, paid.fetch);
  const m = await mount(React.createElement(notice(paid)));
  assert.equal(m.text(), '', 'a member is not told about a free week');
  await m.unmount();
});

// ── Settings: Plan & billing ────────────────────────────────────────────────────────────────
const PLAN_SRC = slice(SETTINGS, 'async function openShapeBilling()', 'function PlanBillingCard(');
function plan(win) {
  return new Function('window', 'fetch', PLAN_SRC + '\nreturn { planMemberRow, planInterval, openShapeBilling };')(win, win.fetch);
}
const money = (c) => (typeof c === 'number' ? '$' + c / 100 + ' / month' : '$5 / month');
test('Settings: past due reads "Payment didn\'t go through", and UPDATE CARD and MANAGE open the billing portal, not /pricing', async () => {
  const calls = [];
  const w = fakeWindow({ ShapeMembership: { portal: async (p) => { calls.push(['portal', p]); return null; }, start: async (p) => { calls.push(['start', p]); return null; }, pastDueLine: PAST_DUE } });
  const { planMemberRow, openShapeBilling } = plan(w);
  const past = planMemberRow({ active: false, pastDue: true, status: 'past_due', priceCents: 500 }, true, money, null, FREE);
  assert.equal(past.value, "Payment didn't go through");
  assert.equal(past.action, 'UPDATE CARD');
  assert.equal(past.desc, PAST_DUE);
  assert.equal(past.pastDue, true);
  await past.onAction();
  assert.deepEqual(calls.at(-1), ['portal', '/newdesign/ClientApp.html#settings']);
  const active = planMemberRow({ active: true, pastDue: false, priceCents: 500 }, true, money, 'Dec 1, 2026', { ...FREE, member: true });
  assert.equal(active.value, '$5 / month · renews Dec 1, 2026');
  assert.equal(active.action, 'MANAGE');
  assert.equal(active.onAction, openShapeBilling, 'MANAGE opens the portal');
  const free = planMemberRow(null, true, money, null, FREE);
  assert.equal(free.value, 'Free');
  assert.equal(free.action, 'JOIN');
  free.onAction();
  assert.equal(w.location.href, '/newdesign/ClientApp.html#membership', 'JOIN opens the membership page, which offers monthly and yearly');
  assert.match(free.desc, /Your account is free\. The membership adds Nora as your assistant, Shape Radio, the points Store and the full leaderboard with your exact rank/);
  assert.equal(planMemberRow('unread', true, money, null, null).action, undefined, 'a read that failed is never offered JOIN');
  assert.match(planMemberRow('unread', true, money, null, null).value, /Couldn't check/);
  assert.equal(planMemberRow(undefined, true, money, null, null).value, 'Checking…');
  // The card hands the subscription answer over as that, and the card on file's UPDATE is the portal too.
  assert.match(SETTINGS, /setSub\(!d \|\| typeof d\.active !== "boolean" \? "unread" : \(d\.active \|\| d\.pastDue === true\) \? d : null\)/);
  assert.match(SETTINGS, /<Row label="Payment method" value=\{pmValue\} action=\{\(pm && pm\.hasMethod\) \|\| hasSub \? "UPDATE" : undefined\} onAction=\{\(pm && pm\.hasMethod\) \|\| hasSub \? openShapeBilling : undefined\} \/>/);
  assert.doesNotMatch(slice(SETTINGS, 'function PlanBillingCard(', 'function ConnectedAppsCard('), /window\.location\.href = "\/pricing"/, 'a member\'s MANAGE or UPDATE goes to /pricing again');
});

test('Settings: the plan\'s interval, and "Included with your coaching"', () => {
  const w = fakeWindow({ ShapeMembership: { pastDueLine: PAST_DUE } });
  const { planMemberRow, planInterval, openShapeBilling } = plan(w);
  assert.equal(planInterval({ priceCents: 4800, interval: 'year' }, null), 'year');
  assert.equal(planInterval({ priceCents: 500, interval: 'month' }, PLANS), 'month');
  assert.equal(planInterval({ priceCents: 4800 }, PLANS), 'year', 'no interval said: the yearly plan\'s price matched');
  assert.equal(planInterval({ priceCents: 500 }, PLANS), 'month');
  const yearly = (c) => '$' + c / 100 + ' / year';
  assert.equal(planMemberRow({ active: true, priceCents: 4800, interval: 'year' }, true, yearly, 'Nov 10, 2027', { ...FREE, member: true }).value, '$48 / year · renews Nov 10, 2027');
  const coached = planMemberRow(null, true, money, null, { ...FREE, includedWithCoach: true });
  assert.equal(coached.value, 'Included with your coaching');
  assert.equal(coached.action, undefined, 'no Join for an account its coaching covers');
  assert.equal(coached.desc, 'Membership is included while you’re coached on Shape.');
  const both = planMemberRow({ active: true, priceCents: 500 }, true, money, 'Dec 1, 2026', { ...FREE, includedWithCoach: true, member: true });
  assert.equal(both.value, 'Included with your coaching');
  assert.equal(both.desc, 'Your coaching includes membership; you can cancel your own plan.');
  assert.equal(both.action, 'MANAGE');
  assert.equal(both.onAction, openShapeBilling);
});

// ── Your week ───────────────────────────────────────────────────────────────────────────────
test('your week: honest figures (no zeros, no nulls), and Share draws the canonical story card', async () => {
  const SC = await import('../public/newdesign/shareCard.mjs');
  const src = jsx(slice(DASH, '// ── Your week:', '// A signed-in account the server knows to be under 18'));
  let recap = { weekStart: '2026-11-03', weekEnd: '2026-11-09', workouts: 3, activeMinutes: null, mealDays: 4, daysActive: 5, points: 240, streak: 0 };
  const shared = [];
  const w = fakeWindow({ ShapeShareCard: { bsShareCardModel: SC.bsShareCardModel, bsShareCardImage: async (m) => { shared.push(m); return { ok: true, mode: 'downloaded' }; } } });
  const f = fakeFetch({ '/api/client/weekly-recap': () => ({ status: 200, body: recap }) });
  const mod = new Function('React', 'window', 'fetch', 'DCL_TEAL', 'DCL_INK50', 'DCL_MONO', 'serif', src + '\nreturn { ClientWeekRecapCard, dclRecapFigures };')(React, w, f, 'teal', 'ink', 'mono', 'serif');
  assert.deepEqual(mod.dclRecapFigures(recap), [['Workouts', '3'], ['Meal days', '4'], ['Days active', '5'], ['Points', '+240']], 'null minutes and a 0 streak are left out');
  const v = await mount(React.createElement(mod.ClientWeekRecapCard, { week: 'last', who: 'Sam', tierLine: 'Tempo tier' }));
  assert.equal(f.calls[0][0], '/api/client/weekly-recap?week=last');
  assert.match(v.text(), /Your week · Last week/);
  assert.doesNotMatch(v.text(), /Active min|Day streak/);
  await click(button(v.host, /Share/));
  assert.equal(shared.length, 1);
  assert.equal(shared[0].title, 'Your week');
  assert.deepEqual(shared[0].heroStat, ['Workouts', '3']);
  assert.deepEqual(shared[0].stats, [['Meal days', '4'], ['Days active', '5'], ['Points', '+240']]);
  assert.equal(shared[0].who, 'Sam');
  assert.equal(shared[0].tierLine, 'TEMPO TIER');
  assert.match(shared[0].dateLine, /^Week of /);
  assert.match(v.text(), /Saved the image\./);
  await v.unmount();
  recap = { weekStart: '2026-11-10', weekEnd: '2026-11-16', workouts: 0, activeMinutes: 0, mealDays: 0, daysActive: 0, points: 0, streak: 0 };
  const empty = await mount(React.createElement(mod.ClientWeekRecapCard, { week: 'current' }));
  assert.match(empty.text(), /Nothing logged this week yet\./);
  assert.ok(!button(empty.host, /Share/), 'an empty week offers nothing to share');
  await empty.unmount();
  // Where it is drawn: the Progress page always, and Today on Mondays.
  const PROG = read('public/newdesign/dashProgress.jsx');
  assert.match(PROG, /\{ key: "weekRecap", title: "Your week", size: "half", empty: source !== "live", render: \(\) => \(window\.ClientWeekRecapCard \? <window\.ClientWeekRecapCard week="current"/);
  assert.match(DASH, /\{live && new Date\(\)\.getDay\(\) === 1 && \(\n\s+<div style=\{\{ marginBottom: 16 \}\}><ClientWeekRecapCard week="last"/);
});

// ── Pricing ─────────────────────────────────────────────────────────────────────────────────
test('pricing: monthly and yearly, the free week with Nora, and coaching that includes the membership', () => {
  const P = read('public/newdesign/pricing.jsx');
  for (const s of ['$5/mo', '$5/month', '$48/year']) assert.ok(P.includes(s), s);
  assert.match(P, /const NORA_WEEK_LINE = "Try Nora free for a week after your first three workouts — no card\.";/);
  assert.match(P, /const COACH_INCLUDED_LINE = "Membership is included while you’re coached on Shape\.";/);
  assert.match(P, /window\.ShapeMembership\.start\(home, \{ plan: plan \|\| null, cancelTo: "\/newdesign\/Pricing\.html" \}\)/);
  assert.match(P, /onClick=\{\(e\) => startPlatformCheckout\(e, "annual"\)\}/);
  assert.match(P, /"The full leaderboard and your exact rank"/);
  assert.doesNotMatch(P, /No trials\./, 'the free week with Nora is not a trial, and the page no longer says there are none');
});


// ── Shape Radio ─────────────────────────────────────────────────────────────────────────────
test('radio: a 402 is said as the membership, or as the card that didn\'t go through, never "press again"', async () => {
  const play = slice(RADIO, 'if (r.status === 451)', 'const cfg = await r.json();');
  assert.match(play, /if \(r\.status === 402\) \{\n\s+const why = await r\.json\(\)\.catch\(\(\) => null\);\n\s+if \(!isCurrent\(\)\) return false;\n\s+if \(why && why\.code === "payment_past_due"\) \{ setRefusal\("pastdue"\); return false; \}\n\s+setRefusal\("membership"\);\n\s+return false;\n\s+\}/);
  assert.ok(play.indexOf('if (r.status === 402)') < play.indexOf('if (!r.ok) { setRefusal("unavailable"); return false; }'), 'the 402 is read before the generic refusal');
  const deck = slice(RADIO, '{st.refusal === "membership" && (', '{st.refusal === "unavailable" && (');
  assert.match(deck, /Shape Radio is part of membership/);
  assert.match(deck, /onClick=\{\(\) => rdMembershipDoor\(false\)\}/);
  assert.match(deck, /\{st\.refusal === "pastdue" && \([\s\S]*\{RD_PAST_DUE_LINE\}[\s\S]*onClick=\{\(\) => rdMembershipDoor\(true\)\}[^>]*>Update your card/);
  // The doors, driven: the checkout or the portal, both back to Radio.
  const doorSrc = slice(RADIO, 'const RD_PAST_DUE_LINE', '// How long the stream plays');
  const calls = [];
  const w = fakeWindow({ ShapeMembership: { start: async (p) => { calls.push(['start', p]); return null; }, portal: async (p) => { calls.push(['portal', p]); return null; } } });
  const door = new Function('window', doorSrc + '\nreturn { rdMembershipDoor, RD_PAST_DUE_LINE };')(w);
  assert.equal(door.RD_PAST_DUE_LINE, PAST_DUE);
  await door.rdMembershipDoor(true);
  await door.rdMembershipDoor(false);
  assert.deepEqual(calls, [['portal', '/newdesign/Radio.html'], ['start', '/newdesign/Radio.html']]);
  const bare = fakeWindow();
  await new Function('window', doorSrc + '\nreturn rdMembershipDoor;')(bare)(false);
  assert.equal(bare.location.href, '/newdesign/Pricing.html', 'without the shell, the pricing page');
});

test('radio: the membership pitch shows only to an account without the station', async () => {
  const src = jsx(slice(RADIO_PAGE, 'function RadioJoin()', 'function RadioPage()'));
  const draw = async (m) => {
    const w = fakeWindow();
    const f = fakeFetch({ '/api/stripe/billing-portal': () => ({ status: 200, body: { url: 'https://billing.stripe.test/r' } }) });
    publish(w, f);
    w.useShapeMembership = () => m;
    const RadioJoin = new Function('React', 'window', 'RdReveal', 'RD_DISP', 'RD_SANS', 'RD_CREAM', 'RD_TEAL', 'RD_HOT', src + '\nreturn RadioJoin;')(React, w, ({ children }) => children, 'd', 's', 'c', 't', 'h');
    const v = await mount(React.createElement(RadioJoin));
    return { v, w, f };
  };
  for (const m of [null, { unknown: true }, { ...FREE, member: true }, { ...FREE, coach: true }]) {
    const { v } = await draw(m);
    assert.equal(v.text(), '', JSON.stringify(m) + ': a member, or an answer still out, is pitched the station');
    await v.unmount();
  }
  const free = await draw(FREE);
  assert.match(free.v.text(), /Part of Shape membership\./);
  assert.match(free.v.text(), /Your Shape account stays free without it, and membership is included while you’re coached on Shape\./);
  assert.ok(button(free.v.host, /Join · \$5\/month/));
  await free.v.unmount();
  const past = await draw({ ...FREE, pastDue: true });
  assert.match(past.v.text(), /Your payment didn’t go through\./);
  await click(button(past.v.host, /Update your card/));
  assert.deepEqual(past.f.calls.at(-1), ['/api/stripe/billing-portal', 'POST', { returnPath: '/newdesign/Radio.html' }]);
  await past.v.unmount();
  const out = await draw({ signedIn: false });
  assert.equal(out.v.host.querySelector('a').getAttribute('href'), '/newdesign/Landing.html');
  await out.v.unmount();
});

// ── Nora's action card ──────────────────────────────────────────────────────────────────────
const CARD_SRC = jsx(slice(CHAT, 'const cwIsLine =', 'function ChatWidget(props)'));
function card(fetchImpl, win) {
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return new Function('React', 'window', 'fetch', 'localStorage', 'TEAL', 'TEAL_BRIGHT', 'PAPER', 'sans', 'cwHexA', 'CustomEvent', CARD_SRC + '\nreturn CwProposalCard;')(
    React, win, fetchImpl, localStorage, 'teal', 'teal', 'paper', 'sans', () => 'rgba(0,0,0,0.1)', dom.window.CustomEvent);
}
test('Nora\'s card: a 402 from Confirm shows the upgrade or the past-due line, not the raw refusal and Try again', async () => {
  const OVER = { startedAt: 'a', endsAt: '2026-10-08T00:00:00Z', active: false };
  for (const [code, says, act_, held] of [
    ['membership_required', /Nora making changes for you is part of Shape membership, \$5 a month\./, /^Join$/, FREE],
    ['payment_past_due', new RegExp(PAST_DUE.replace(/\./g, '\\.')), /Update your card/, FREE],
    // The free week with Nora is over: the card says so (owner, 2026-11-10).
    ['membership_required', new RegExp(ENDED.replace(/\./g, '\\.')), /^Join$/, { ...FREE, nora: false, noraPreview: OVER }],
  ]) {
    const f = fakeFetch({ '/api/ai/proposals/confirm': () => ({ status: 402, body: { error: 'Shape membership required.', code } }) });
    const w = fakeWindow({ dispatchEvent: () => true, addEventListener() {}, removeEventListener() {}, __shapeClientMembership: held });
    publish(w, f);
    const Card = card(f, w);
    const v = await mount(React.createElement(Card, { a: { token: 'tok-' + code, action: 'update_goal', summary: 'Set your goal to 180 lb', diff: [] } }));
    await click(button(v.host, /Confirm/));
    assert.ok(v.host.querySelector('[data-nora-card-locked]'), code + ': no lock');
    assert.match(v.text(), says);
    assert.ok(!/Shape membership required\./.test(v.text()), 'the route\'s raw refusal is shown');
    assert.ok(!button(v.host, /Try again|Confirm/), 'a retry that cannot work is offered');
    assert.ok(button(v.host, act_), 'no way in');
    await v.unmount();
  }
  // Undo's 402 the same way.
  assert.match(CHAT, /await post\("\/api\/ai\/audit\/undo", \{ auditId \}\);[\s\S]{0,300}if \(e && e\.lock\) \{ setLock\(e\.lock\); return; \}/);
  assert.match(CHAT, /failed\.lock = res\.status === 402 \? \(data\.code === "payment_past_due" \? "pastdue" : "join"\) : null;/);
});

test('Nora in the chat: voice is on `nora` (the free week too), with the days left while it runs and "ended" after', () => {
  const at = CHAT.indexOf('const [account, setAccount] = React.useState(null);');
  const check = CHAT.slice(at, CHAT.indexOf('const [voiceGate, setVoiceGate]', at));
  assert.match(check, /setMember\(!!\(md && md\.signedIn === true && \(typeof md\.nora === "boolean" \? md\.nora : paid\)\)\);/);
  assert.match(check, /const paid = !!\(md && \(md\.member === true \|\| md\.coach === true \|\| md\.includedWithCoach === true\)\);/);
  assert.match(check, /setNoraWeek\(md && md\.signedIn === true && !paid && md\.noraPreview/, 'a member\'s own Nora is no free week');
  assert.match(CHAT, /\{member === true && noraWeekLeft != null && \(\n\s+<div data-nora-week-left[^>]*>\n\s+\{noraWeekLeft\} \{noraWeekLeft === 1 \? "day" : "days"\} left with Nora/);
  assert.match(CHAT, /<span>\{pastDue \? CW_PAST_DUE_LINE : noraWeekEnded \? CW_NORA_ENDED_LINE : "Voice chat with Nora unlocks with membership\."\}<\/span>/);
  assert.match(CHAT, /const CW_NORA_ENDED_LINE = "Your free week with Nora has ended\. Join to keep her\.";/);
});
