// A coach's referral link lands someone new on the coach's profile (owner, 2026-10-18).
//
// Business → "Bring your clients · 0% commission" shares
// /newdesign/MemberProfile.html?u=<coach>&ref=<token>&role=<trainer|nutritionist>. The people it
// brings are mostly not Shape members yet, and two things turned them away: Subscribe answered a
// signed-out visitor with "Not signed in." and nothing to press, and the profile opened on
// Activity under a "View coaching" button that left for the Marketplace, which lists every other
// coach. Both website modules are mounted and driven here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const React = require('react');
const { JSDOM, VirtualConsole } = require('jsdom');
const { parse } = require('@babel/parser');

const REF = '0b6f3c1e-8a2d-4c5b-9e7f-1a2b3c4d5e6f';
const LINK = `/newdesign/MemberProfile.html?u=coach-1&ref=${REF}&role=trainer`;
// jsdom cannot navigate; it reports each attempt here, which is how a test sees one happen.
const navigations = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { if (/navigation/i.test(String(e && e.message))) navigations.push(e.message); else console.error(e); });
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test' + LINK, virtualConsole: vc });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { createRoot } = require('react-dom/client');
const visit = (path) => dom.reconfigure({ url: 'https://shape.test' + path });
const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

// livingShared.jsx is a classic browser script: livingDesktop.jsx reads its top-level names as
// globals. Export every one of them, so the desktop module meets the real ones.
const SHARED = join(ROOT, 'public/newdesign/livingShared.jsx');
const sharedNames = parse(readFileSync(SHARED, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }).program.body
  .flatMap((n) => (n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration' ? n.declarations.map((x) => x.id && x.id.name).filter(Boolean) : []));
const shared = await loadRealModule(SHARED, { appendExports: `Object.assign(exports, { ${sharedNames.join(', ')} });` });

// ── The storefront: Subscribe, signed out ─────────────────────────────────────────────────────
async function storefront({ path = LINK, signedIn = false, atCapacity = false, answers = {} } = {}) {
  visit(path);
  const q = (data) => { const o = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o, maybeSingle: async () => ({ data, error: null }), then: (r) => Promise.resolve({ data: [], error: null }).then(r) }; return o; };
  window.shapeDb = {
    getUser: async () => (signedIn ? { id: 'member-1' } : null),
    client: {
      from: (t) => q(t === 'trainers' ? { id: 7, name: 'Tom Trainer', at_capacity: atCapacity, capacity_resume_at: null } : null),
      rpc: async () => ({ data: [], error: null }),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    },
  };
  globalThis.fetch = async (url) => {
    const key = Object.keys(answers).find((k) => String(url).includes(k));
    if (!key) return { ok: true, status: 200, json: async () => ({}) };
    const a = Array.isArray(answers[key]) ? answers[key].shift() : answers[key];
    return { ok: a.status < 300, status: a.status, json: async () => a.body };
  };
  const root = createRoot(document.getElementById('root'));
  const d = { uid: 'coach-1', name: 'Tom Trainer', role: 'trainer', offerings: [], reviews: [], certs: [] };
  await React.act(async () => root.render(React.createElement(shared.LvCoachBlocks, { d, view: 'coaching' })));
  await settle();
  return {
    press: async (label) => { const b = button(label); assert.ok(b, label + ' is not on the page'); await React.act(async () => b.click()); await settle(); },
    text: () => document.getElementById('root').textContent,
    prompt: () => document.querySelector('[data-needs-account]'),
    href: (sel) => { const a = document.querySelector(sel); return a ? a.getAttribute('href') : null; },
    unmount: () => React.act(async () => root.unmount()),
  };
}

// signup.jsx's own same-site check on `next`, lifted and run (login.jsx restates the same rule).
// The file has CRLF line ends, so the body ends at the first "\n}".
const SIGNUP = readFileSync(join(ROOT, 'public/newdesign/signup.jsx'), 'utf8');
const SU_AT = SIGNUP.indexOf('function suSafeNext()');
assert.ok(SU_AT > 0, 'suSafeNext moved');
const suSafeNext = (search) => new Function('window', SIGNUP.slice(SU_AT, SIGNUP.indexOf('\n}', SU_AT) + 2) + '\nreturn suSafeNext();')({ location: { search } });

test('a signed-out visitor who presses Subscribe is offered Join Shape and Log in, never a bare "Not signed in."', async () => {
  const p = await storefront({ answers: { '/api/stripe/checkout-session': { status: 401, body: { error: 'Not signed in.' } } } });
  await p.press('Subscribe');
  assert.ok(p.prompt(), 'no account prompt after a 401');
  assert.equal(p.prompt().getAttribute('role'), 'alert');
  assert.match(p.prompt().textContent, /You need a Shape account to subscribe to Tom\. Join Shape or log in, and you’ll come back here\./);
  assert.doesNotMatch(p.text(), /Not signed in/, 'the dead-end sentence is gone');
  const join = p.href('[data-account-join]');
  const login = p.href('[data-account-login]');
  assert.equal(join, '/newdesign/SignupClient.html?next=' + encodeURIComponent(LINK));
  assert.equal(login, '/newdesign/Login.html?next=' + encodeURIComponent(LINK));
  for (const href of [join, login]) {
    const next = new URL(href, 'https://shape.test').searchParams.get('next');
    assert.equal(next, LINK, 'next carries the whole page address');
    const back = new URL(next, 'https://shape.test').searchParams;
    assert.equal(back.get('u'), 'coach-1');
    assert.equal(back.get('ref'), REF, 'the referral survives the trip');
    assert.equal(back.get('role'), 'trainer');
    assert.equal(suSafeNext(new URL(href, 'https://shape.test').search), LINK, 'the signup page takes it as a same-site return');
  }
  await p.unmount();
});

test('sign-up\'s own sign-in links keep the return path, so confirming an email still leads back to the coach', () => {
  const at = SIGNUP.indexOf('function suLoginHref()');
  assert.ok(at > 0, 'suLoginHref moved');
  const body = SIGNUP.slice(SU_AT, SIGNUP.indexOf('\n}', SU_AT) + 2) + SIGNUP.slice(at, SIGNUP.indexOf('\n}', at) + 2);
  const loginHref = (search) => new Function('window', body + '\nreturn suLoginHref();')({ location: { search } });
  const join = new URL('/newdesign/SignupClient.html?next=' + encodeURIComponent(LINK), 'https://shape.test');
  assert.equal(loginHref(join.search), 'Login.html?next=' + encodeURIComponent(LINK));
  assert.equal(new URL(loginHref(join.search), join).searchParams.get('next'), LINK);
  assert.equal(loginHref(''), 'Login.html', 'no return path: plain sign-in');
  assert.equal(loginHref('?next=' + encodeURIComponent('//evil.example')), 'Login.html', 'an off-site return is never carried');
  // "Sign in" (an existing account), "Go to sign in" (confirm your email) and the form's "Log in".
  assert.equal((SIGNUP.match(/<a href=\{suLoginHref\(\)\}/g) ?? []).length, 3);
  assert.doesNotMatch(SIGNUP, /<a href="Login\.html"/);
});

test('a visitor who has to confirm their email is still brought back: sign-up keeps the way back for that account, its first sign-in reads it once (Codex on #2399)', () => {
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const at = SIGNUP.indexOf('function suRememberNext(uid)');
  assert.ok(at > 0, 'suRememberNext moved');
  const remember = (search, now, uid) => new Function('window', 'localStorage', 'Date', 'uid', SIGNUP.slice(SU_AT, SIGNUP.indexOf('\n}', SU_AT) + 2) + SIGNUP.slice(at, SIGNUP.indexOf('\n}', at) + 2) + '\nsuRememberNext(uid);')({ location: { search } }, localStorage, { now: () => now }, uid);
  assert.match(SIGNUP, /\} else if \(data && data\.user && !data\.session\) \{\s+suRememberNext\(data\.user\.id\);\s+setConfirmEmail\(true\);/, 'kept for the new account when sign-up asks for the email confirmation');

  // login.jsx's own step, lifted and run after its ?next= check, with the session it signs in.
  const LOGIN = readFileSync(join(ROOT, 'public/newdesign/login.jsx'), 'utf8').replace(/\r\n/g, '\n');
  const from = LOGIN.indexOf('    // The first sign-in after a confirmed email');
  const to = LOGIN.indexOf('    window.location.href = nextDashboard;', from);
  assert.ok(from > 0 && to > from, 'login.jsx\'s kept-return step moved');
  const land = (search, now, uid) => new Function('window', 'localStorage', 'Date', 'session', `let nextDashboard = '/newdesign/ClientDashboard.html';\n${LOGIN.slice(from, to)}\nreturn nextDashboard;`)({ location: { search } }, localStorage, { now: () => now }, { user: { id: uid } });
  const DASH = '/newdesign/ClientDashboard.html';

  const back = '?next=' + encodeURIComponent(LINK);
  remember(back, 1000, 'new-member');
  assert.deepEqual(JSON.parse(store.get('shape.signupNext')), { next: LINK, at: 1000, uid: 'new-member' });
  // A shared browser: someone else signs in first. They go to their own dashboard, and the way back waits.
  assert.equal(land('', 2000, 'someone-else'), DASH);
  assert.equal(store.has('shape.signupNext'), true, 'another account leaves it be');
  assert.equal(land('', 1000 + 3600000, 'new-member'), LINK, 'the new member\'s confirmation sign-in goes back to the coach');
  assert.equal(store.has('shape.signupNext'), false, 'read once, then forgotten');
  assert.equal(land('', 1000 + 3600000, 'new-member'), DASH, 'the next sign-in is an ordinary one');

  remember(back, 1000, 'new-member');
  assert.equal(land('?next=%2Fnewdesign%2FRadio.html', 2000, 'new-member'), DASH, 'a ?next= on the address is login.jsx\'s own check, ahead of this one');
  assert.equal(store.has('shape.signupNext'), false);
  remember(back, 1000, 'new-member');
  assert.equal(land('', 1000 + 3 * 86400000, 'someone-else'), DASH, 'kept two days, not longer');
  assert.equal(store.has('shape.signupNext'), false, 'an expired entry is cleared by any sign-in');
  store.set('shape.signupNext', JSON.stringify({ next: '//evil.example', at: 5, uid: 'new-member' }));
  assert.equal(land('', 6, 'new-member'), DASH, 'never off-site');
  store.set('shape.signupNext', JSON.stringify({ next: LINK, at: 5 }));
  assert.equal(land('', 6, 'new-member'), DASH, 'an entry with no account is no one\'s');
  store.clear();
  remember('', 1000, 'new-member');
  assert.equal(store.has('shape.signupNext'), false, 'a sign-up with no way back keeps nothing');
  remember(back, 1000, undefined);
  assert.equal(store.has('shape.signupNext'), false, 'nor one with no account id');
});

test('pressing Subscribe again clears the account prompt, and the next answer shows its own', async () => {
  const p = await storefront({ answers: { '/api/stripe/checkout-session': [
    { status: 401, body: { error: 'Not signed in.' } },
    { status: 402, body: { error: 'Shape membership required.', code: 'membership_required' } },
  ] } });
  await p.press('Subscribe');
  assert.ok(p.prompt());
  await p.press('Subscribe');
  assert.equal(p.prompt(), null, 'reset with the other prompts at the top of subscribe');
  assert.match(p.text(), /Coaching is for Shape members/);
  await p.unmount();
});

test('the waiting list: a Join that answers 401 gets the same way in', async () => {
  const p = await storefront({ signedIn: true, atCapacity: true, answers: {
    '/api/waitlist/mine': { status: 200, body: { entries: [], clientOf: [] } },
    '/api/waitlist/join': { status: 401, body: { error: 'Not signed in.' } },
  } });
  await p.press('Join the waiting list');
  assert.ok(p.prompt(), 'no account prompt after the waiting list 401');
  assert.match(p.prompt().textContent, /You need a Shape account to join Tom’s waiting list\./);
  assert.doesNotMatch(p.text(), /Not signed in/);
  assert.equal(p.href('[data-account-join]'), '/newdesign/SignupClient.html?next=' + encodeURIComponent(LINK));
  assert.equal(p.href('[data-account-login]'), '/newdesign/Login.html?next=' + encodeURIComponent(LINK));
  await p.unmount();
});

test('the waiting list, signed out: Join Shape and the sign-in link both come back here with the referral (Codex on #2399)', async () => {
  const p = await storefront({ atCapacity: true });
  const box = document.querySelector('[data-waitlist-account]');
  assert.ok(box, 'the signed-out choices are gone');
  assert.match(box.textContent, /A Shape account holds your place on the list\./);
  const join = box.querySelector('[data-account-join]');
  const login = box.querySelector('[data-account-login]');
  assert.match(join.textContent, /Join Shape/, 'a new client is offered an account, not only a sign-in');
  assert.equal(join.getAttribute('href'), '/newdesign/SignupClient.html?next=' + encodeURIComponent(LINK));
  assert.match(login.textContent, /Sign in to join the list/);
  assert.equal(login.getAttribute('href'), '/newdesign/Login.html?next=' + encodeURIComponent(LINK));
  assert.ok(!button('Join the waiting list'), 'no Join button that 401s');
  await p.unmount();
});

// ── The profile: which tab it opens on, and View coaching ─────────────────────────────────────
Object.assign(globalThis, shared, {
  // Drawn by livingSignal.jsx / livingTerrain.jsx on the page; nothing here reads them.
  SignalSigil: () => null, TerrainContours: () => null, TerrainRidge: () => null,
  // The real storefront is driven above; here only which view the tab asked for matters.
  LvCoachBlocks: ({ view }) => React.createElement('div', { 'data-coach-blocks': view }),
});
const { DesktopProfile } = await loadRealModule(join(ROOT, 'public/newdesign/livingDesktop.jsx'), { appendExports: 'exports.DesktopProfile = DesktopProfile;' });
let scrolledTo = null;
window.Element.prototype.scrollIntoView = function () { scrolledTo = this.id; };

async function profile({ path, persona = 'trainer', variant = 'public' }) {
  visit(path);
  window.shapeDb = undefined;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DesktopProfile, {
    direction: persona === 'client' ? 'terrain' : 'signal', persona, variant, chrome: false,
    coachingHref: '/newdesign/Marketplace.html', follow: { followers: 0, following: 0, posts: 0 }, onMessage: () => {}, onFollow: () => {},
  })));
  return {
    selected: () => { const t = document.querySelector('[role="tab"][aria-selected="true"]'); return t ? t.textContent.trim() : null; },
    blocks: () => { const b = document.querySelector('[data-coach-blocks]'); return b ? b.getAttribute('data-coach-blocks') : null; },
    unmount: () => React.act(async () => root.unmount()),
  };
}

test('a coach\'s profile opened from a referral link opens on Coaching', async () => {
  const p = await profile({ path: LINK });
  assert.equal(p.selected(), 'Coaching');
  assert.equal(p.blocks(), 'coaching', 'the storefront with Subscribe is on screen');
  await p.unmount();
});

test('without a referral it opens on Activity, as before; a member\'s profile ignores the referral', async () => {
  const plain = await profile({ path: '/newdesign/MemberProfile.html?u=coach-1&role=trainer' });
  assert.equal(plain.selected(), 'Activity');
  assert.equal(plain.blocks(), null);
  await plain.unmount();
  const member = await profile({ path: LINK, persona: 'client' });
  assert.equal(member.selected(), 'Activity', 'a member has no Coaching tab to open');
  await member.unmount();
});

test('View coaching switches to this coach\'s Coaching tab and scrolls to it, instead of leaving for the Marketplace', async () => {
  const p = await profile({ path: '/newdesign/MemberProfile.html?u=coach-1&role=trainer' });
  assert.equal(p.selected(), 'Activity');
  const before = navigations.length;
  scrolledTo = null;
  await React.act(async () => button('View coaching').click());
  assert.equal(p.selected(), 'Coaching');
  assert.equal(p.blocks(), 'coaching');
  await React.act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  assert.equal(scrolledTo, 'dk-tabs', 'scrolled to the tab row');
  assert.equal(navigations.length, before, 'the page did not navigate');
  await p.unmount();
});

test('the locked view has no Coaching tab, so View coaching still goes to coachingHref', async () => {
  const p = await profile({ path: LINK, variant: 'locked' });
  assert.equal(p.selected(), null, 'no tabs on the locked view');
  const before = navigations.length;
  await React.act(async () => button('View coaching').click());
  assert.equal(navigations.length, before + 1, 'it navigated');
  await p.unmount();
});
