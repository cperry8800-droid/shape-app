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
    + '\nreturn { shapeStartMembership, shapeOpenBillingPortal, shapeLockKind, shapeNoraLock, shapeHasPaid, shapeHasNora, shapeReadMembership, shapeMembershipPeek, shapeReadPlans, shapeMoney, shapeAnnualSaving, useShapeMembership, useShapePlans, ShapePaidLock, SHAPE_PAST_DUE_LINE, SHAPE_COACH_INCLUDED_LINE };')(React, win, fetchImpl, 'mono', 'sans');
}
// window.ShapeMembership as pageShell.jsx publishes it, over a given window and fetch.
function publish(win, fetchImpl) {
  const k = kit(win, fetchImpl);
  win.ShapeMembership = {
    start: k.shapeStartMembership, portal: k.shapeOpenBillingPortal, read: k.shapeReadMembership, peek: k.shapeMembershipPeek,
    lockKind: k.shapeLockKind, noraLock: k.shapeNoraLock, hasPaid: k.shapeHasPaid, hasNora: k.shapeHasNora,
    plans: k.shapeReadPlans, money: k.shapeMoney, annualSaving: k.shapeAnnualSaving,
    pastDueLine: k.SHAPE_PAST_DUE_LINE, coachIncludedLine: k.SHAPE_COACH_INCLUDED_LINE,
  };
  win.ShapePaidLock = k.ShapePaidLock;
  win.useShapeMembership = k.useShapeMembership;
  win.useShapePlans = k.useShapePlans;
  return k;
}
const PLANS = { monthly: { priceCents: 500, interval: 'month' }, annual: { priceCents: 4800, interval: 'year' } };
// The free week with Nora is gone (owner, 2026-11-10): its words must not come back.
const ENDED = 'Your free week with Nora has ended. Join to keep her.';
const FREE_WEEK = /free week|free for a week|three workouts|days? left with Nora/i;

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

test('shell: assistant Nora is on `nora`, the paid features; a free account sees Join, and there is no free week', async () => {
  const k = kit(fakeWindow(), async () => ({}));
  // An answer from before the free week was dropped, still carrying one: read as nothing.
  const OVER = { startedAt: '2026-10-01T10:00:00Z', endsAt: '2026-10-08T10:00:00Z', active: false };
  assert.equal(k.shapeHasNora({ ...FREE, nora: false }), false, 'a free account has no assistant Nora');
  assert.equal(k.shapeHasNora({ ...FREE, member: true, nora: true }), true);
  assert.equal(k.shapeNoraLock({ ...FREE, nora: false }), 'join', 'a signed-in free account sees Join');
  assert.equal(k.shapeNoraLock({ ...FREE, nora: false, noraPreview: OVER }), 'join', 'a week in the answer is no "ended" lock');
  assert.equal(k.shapeNoraLock({ ...FREE, nora: false, pastDue: true }), 'pastdue', 'past due says past due');
  assert.equal(k.shapeNoraLock({ ...FREE, member: true, nora: true }), null, 'a member is not locked');
  assert.equal(k.shapeNoraLock({ signedIn: false }), 'signin');
  assert.equal(k.shapeNoraLock({ unknown: true }), null);
  assert.equal(k.shapeNoraLock('membership_required'), 'join', 'a 402 reads as its code');
  assert.equal(k.shapeNoraLock('payment_past_due'), 'pastdue');
  assert.equal(k.shapeHasNora({ ...FREE, member: true }), true, 'an answer without `nora` reads the paid features');
  assert.doesNotMatch(SHELL, /noraPreview|shapeNoraDaysLeft|noraDaysLeft|SHAPE_NORA_ENDED_LINE|noraEndedLine|"ended"/, 'the free week is back in the shell');
  assert.doesNotMatch(SHELL, FREE_WEEK);
  const gone = await mount(React.createElement(k.ShapePaidLock, { kind: 'ended', feature: 'Nora\'s weekly read' }));
  assert.equal(gone.text(), '', 'no "ended" lock is drawn');
  await gone.unmount();
  const v = await mount(React.createElement(k.ShapePaidLock, { kind: 'join', feature: 'Nora\'s weekly read' }));
  assert.match(v.text(), /Nora's weekly read is part of Shape membership, \$5 a month\./);
  assert.ok(!v.text().includes(ENDED), v.text());
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

test('membership page: monthly and yearly at the real prices, coaching that includes it, and no free week with Nora', async () => {
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
  assert.doesNotMatch(free.v.text(), FREE_WEEK, 'the free week with Nora is offered again');
  assert.ok(!free.v.host.querySelector('[data-nora-week]'));
  assert.match(free.v.text(), /Membership is included while you're coached on Shape\./);
  await free.v.unmount();
  const monthlyOnly = await draw(FREE, null);
  assert.ok(button(monthlyOnly.v.host, /Start membership · \$5\/month/), 'no plans answer: the monthly start');
  assert.ok(!button(monthlyOnly.v.host, /Annual/));
  await monthlyOnly.v.unmount();
  // An answer still carrying a week (from before it was dropped) says nothing about one, and joins.
  for (const noraPreview of [{ startedAt: 'a', endsAt: new Date(Date.now() + 4.2 * 86400000).toISOString(), active: true }, { startedAt: 'a', endsAt: '2026-10-08T00:00:00Z', active: false }]) {
    const old = await draw({ ...FREE, nora: false, noraPreview }, PLANS);
    assert.doesNotMatch(old.v.text(), FREE_WEEK);
    assert.ok(!old.v.text().includes(ENDED));
    assert.ok(!old.v.host.querySelector('[data-nora-week]'));
    assert.ok(button(old.v.host, /^Monthly · \$5\/mo$/), 'a free account joins');
    await old.v.unmount();
  }
  const coached = await draw({ ...FREE, includedWithCoach: true }, PLANS);
  assert.match(coached.v.text(), /Your coaching includes membership\./);
  assert.ok(!button(coached.v.host, /Monthly|Annual|Start membership/), 'no Join prompts for an account its coaching covers');
  await coached.v.unmount();
});

test('no free week with Nora (owner, 2026-11-10): the notice tells a free account nothing about one', async () => {
  const WEEK = { startedAt: '2026-11-09T08:00:00Z', endsAt: new Date(Date.now() + 6.4 * 86400000).toISOString(), active: true };
  // An answer still carrying a week (from before it was dropped), for a free account and a member.
  for (const m of [{ ...FREE, nora: false, noraPreview: WEEK }, { ...FREE, member: true, nora: true, noraPreview: WEEK }]) {
    const w = fakeWindow({ fetch: fakeFetch({}), localStorage: { getItem: () => null, setItem() {} }, __shapeClientMembership: m });
    publish(w, w.fetch);
    const v = await mount(React.createElement(notice(w)));
    assert.equal(v.text(), '', JSON.stringify(m) + ' was told about a free week');
    assert.ok(!v.host.querySelector('[data-membership-notice="nora-week"]'));
    await v.unmount();
  }
  assert.doesNotMatch(DASH, /noraPreview|noraWeek|NORA_WEEK|NoraDaysLeft|nora-week|Join to keep her/);
  assert.doesNotMatch(DASH, FREE_WEEK);
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

// ── The Store's own figures ─────────────────────────────────────────────────────────────────
test('store: every signed-in account reads its own balance and locker; the sample ones are for a visitor only (Codex P2 on #2675)', () => {
  const S = read('public/newdesign/store.jsx');
  assert.match(S, /useEStore\(\(\) => \{ if \(gate\.signedIn\) reloadStore\(\); \}, \[gate\.signedIn\]\);/, 'loaded for every signed-in account, locked or not');
  assert.doesNotMatch(S, /if \(gate\.allowed\) reloadStore\(\)/);
  assert.match(S, /const liveBalance = store\.balance == null \? \(gate\.signedIn \? null : BALANCE\) : store\.balance;/, 'no sample 940 for an account');
  assert.match(S, /\{balance == null \? "—" : balance\.toLocaleString\(\)\}/);
  assert.match(S, /if \(signedIn && !live\) return null;/, 'no sample codes in an account\'s locker');
  assert.match(S, /<UnlockedCoupons redemptions=\{store\.redemptions\} signedIn=\{!!gate\.signedIn\} \/>/);
  // The read itself is an account's: no membership is asked for on GET.
  const route = read('src/app/api/store/redeem/route.ts');
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST') > 0 ? route.indexOf('export async function POST') : undefined);
  assert.doesNotMatch(get, /requireMembership\(/);
});

// ── Pricing ─────────────────────────────────────────────────────────────────────────────────
test('pricing: monthly and yearly, no free week with Nora, and coaching that includes the membership', () => {
  const P = read('public/newdesign/pricing.jsx');
  for (const s of ['$5/mo', '$5/month', '$48/year']) assert.ok(P.includes(s), s);
  assert.doesNotMatch(P, /NORA_WEEK_LINE/);
  assert.doesNotMatch(P, FREE_WEEK, 'the free week with Nora is offered again');
  assert.match(P, /const COACH_INCLUDED_LINE = "Membership is included while you’re coached on Shape\.";/);
  assert.match(P, /window\.ShapeMembership\.start\(home, \{ plan: plan \|\| null, cancelTo: "\/newdesign\/Pricing\.html" \}\)/);
  assert.match(P, /onClick=\{\(e\) => startPlatformCheckout\(e, "annual"\)\}/);
  assert.match(P, /"The full leaderboard and your exact rank"/);
  // ⚠ No yearly button before the plans say there is one (Codex P2 on #2675): while they are read,
  // or when they did not answer, a year would be offered that the checkout refuses.
  assert.match(P, /const annual = plans \? plans\.annual : null;/);
  assert.match(P, /const saving = plans && M && M\.annualSaving \? M\.annualSaving\(plans\) : null;/);
});


// ⚠ NO YEARLY CLAIM BEFORE THE PLANS SAY THERE IS ONE (Codex P2 on #2675, after the card's own fix):
// the hero, the FAQ and the homepage's member card said $48 a year with STRIPE_PLATFORM_ANNUAL_PRICE_ID
// unset, when the checkout refuses a year. Drawn with no yearly plan, with one, and while unread.
test('pricing and the homepage: the yearly price is said only once the plans say it is set up', async () => {
  const P = read('public/newdesign/pricing.jsx');
  const L = read('public/newdesign/landing.jsx');
  const PRICING_SRC = jsx(slice(P, 'const PRICING_FAQ = [', 'const REDUCED_PR')
    + slice(P, 'function PricingHero()', 'function PricingCard()')
    + slice(P, 'function PricingFAQ()', 'function PricingCTA()'));
  const LANDING_SRC = jsx(slice(L, 'const ROLES = [', 'const REDUCED =') + slice(L, 'function RoleCard(', 'function RoleGrid()'));
  const draw = async (plans) => {
    const w = fakeWindow();
    const f = fakeFetch({ '/api/membership/plans': () => (plans === 'down' ? { status: 503, body: {} } : { status: 200, body: plans }) });
    publish(w, f);
    const { PricingHero, PricingFAQ } = new Function('React', 'window', 'serif', 'mono', 'sans', 'TEAL', 'INK', PRICING_SRC + '\nreturn { PricingHero, PricingFAQ };')(React, w, 'serif', 'mono', 'sans', 'teal', 'ink');
    const { ROLES, RoleCard } = new Function('React', 'window', 'serif', 'mono', 'sans', 'TEAL', 'TEAL_BRIGHT', 'INK', 'RUST', 'REDUCED', LANDING_SRC + '\nreturn { ROLES, RoleCard };')(React, w, 'serif', 'mono', 'sans', 'teal', 'teal2', 'ink', 'rust', true);
    const member = ROLES.find((r) => r.key === 'client');
    const v = await mount(React.createElement('div', null,
      React.createElement(PricingHero), React.createElement(PricingFAQ), React.createElement(RoleCard, { role: member, index: 0, total: 4 })));
    const out = v.text();
    await v.unmount();
    return out;
  };
  for (const none of [{ monthly: PLANS.monthly, annual: null }, 'down']) {
    const t = await draw(none);
    assert.doesNotMatch(t, /\$48|a year|\/ year|yearly plan/i, `a year is promised with ${JSON.stringify(none)}: ` + t.slice(0, 400));
    assert.match(t, /The membership, \$5 a month, adds Nora as your assistant/);
    assert.match(t, /Free account · \$5 \/ month membership/);
  }
  const yes = await draw(PLANS);
  assert.doesNotMatch(yes, FREE_WEEK, 'the hero, the FAQ or the homepage card offers the free week with Nora');
  assert.match(yes, /The membership, \$5 a month or \$48 a year, adds Nora as your assistant/);
  assert.match(yes, /Is there a yearly plan\?/);
  assert.match(yes, /Free account · \$5 \/ month or \$48 \/ year membership/);
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
    // No free week (owner, 2026-11-10): an answer still carrying an ended one is a plain Join.
    ['membership_required', /Nora making changes for you is part of Shape membership, \$5 a month\./, /^Join$/, { ...FREE, nora: false, noraPreview: OVER }],
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
    assert.ok(!v.text().includes(ENDED), 'the free week\'s "ended" line');
    await v.unmount();
  }
  // Undo's 402 the same way.
  assert.match(CHAT, /await post\("\/api\/ai\/audit\/undo", \{ auditId \}\);[\s\S]{0,300}if \(e && e\.lock\) \{ setLock\(e\.lock\); return; \}/);
  assert.match(CHAT, /failed\.lock = res\.status === 402 \? \(data\.code === "payment_past_due" \? "pastdue" : "join"\) : null;/);
});

test('Nora in the chat: voice is on `nora`, the paid features; a signed-in free account sees Join, and there is no free week', () => {
  const at = CHAT.indexOf('const [account, setAccount] = React.useState(null);');
  const check = CHAT.slice(at, CHAT.indexOf('const [voiceGate, setVoiceGate]', at));
  assert.match(check, /setMember\(!!\(md && md\.signedIn === true && \(typeof md\.nora === "boolean" \? md\.nora : paid\)\)\);/);
  assert.match(check, /const paid = !!\(md && \(md\.member === true \|\| md\.coach === true \|\| md\.includedWithCoach === true\)\);/);
  assert.doesNotMatch(check, /noraWeek|noraPreview/, 'the chat reads a free week again');
  assert.doesNotMatch(CHAT, /noraWeekLeft|noraWeekEnded|data-nora-week-left|CW_NORA_ENDED_LINE/);
  assert.doesNotMatch(CHAT, FREE_WEEK);
  assert.match(CHAT, /data-nora-voice-locked=\{pastDue \? "pastdue" : account === "in" \? "join" : "signin"\}/, 'a signed-in free account\'s voice note is Join');
  assert.match(CHAT, /<span[^>]*>\{pastDue \? CW_PAST_DUE_LINE : "Voice chat with Nora unlocks with membership\."\}<\/span>/);
});
