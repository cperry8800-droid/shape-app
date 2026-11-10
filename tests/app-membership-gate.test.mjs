// An account is the app's gate, and the membership decides the paid features only (owner,
// 2026-11-10: a signed-in adult account that has not paid is a free account and gets in; the
// signed-out Preview and Browse are gone). Signed in is still not a member (client-onboarding
// review H1, 2026-10-14): the membership answer is read for the paid features, and every
// membership checkout in the app goes through one door that comes back to the app and re-checks
// (M1). The rules are pure (memberGate.mjs); the wiring is checked in the shipping source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const { bsAccountGate, bsPaidFlags, bsMembershipAfter, bsMembershipSeed, bsPollMembership } = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/memberGate.mjs')).href);

test('the gate: an account is in, paid or not; a session with no account is not', () => {
  const ready = { isApprovedCoach: false, authReady: true, signedIn: true };
  assert.deepEqual(bsAccountGate({ ...ready, membership: { loading: false, active: false } }), { allowed: true, loading: false }, 'a free account is in the app');
  assert.deepEqual(bsAccountGate({ ...ready, membership: { loading: false, active: true } }), { allowed: true, loading: false });
  assert.deepEqual(bsAccountGate({ ...ready, membership: { loading: false, active: false, pastDue: true } }), { allowed: true, loading: false }, 'past due is free: still in');
  assert.deepEqual(bsAccountGate({ ...ready, signedIn: false, membership: { loading: false, active: false } }), { allowed: false, loading: false }, 'no account: the welcome');
  assert.deepEqual(bsAccountGate({ ...ready, membership: { loading: true, active: false } }), { allowed: true, loading: true }, 'held while a first answer is on its way (it also says whether this is a minor)');
  assert.equal(bsAccountGate({ isApprovedCoach: false, authReady: false, signedIn: true, membership: { loading: false, active: true } }).loading, true, 'held until the session restores');
  assert.deepEqual(bsAccountGate({ isApprovedCoach: true, authReady: false, signedIn: true, membership: { loading: true, active: false } }), { allowed: true, loading: false }, 'an approved coach is in at once');
});

test('the flags: ShapeCanChat is any account, ShapePaid the paid features, ShapeNora assistant Nora, unknown until answered', () => {
  const m = (o) => ({ loading: false, ...o });
  const f = (o) => ({ noraPreview: null, ...o });
  assert.deepEqual(bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ active: false, nora: false }) }), f({ canChat: true, paid: false, pastDue: false, nora: false }), 'a free account messages its coaches');
  // ⚠ A seeded answer with no lookup heard yet (a cold launch whose lookup failed): Nora is unknown,
  // which never locks a free week (Codex P2 on #2675). The paid features still read the seed.
  assert.deepEqual(bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ active: false, nora: undefined, pastDue: undefined }) }), f({ canChat: true, paid: false, pastDue: false, nora: undefined }), 'unheard: Nora unknown, never false');
  assert.deepEqual(bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ active: true }) }), f({ canChat: true, paid: true, pastDue: false, nora: true }));
  assert.deepEqual(bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ active: false, pastDue: true, nora: false }) }), f({ canChat: true, paid: false, pastDue: true, nora: false }));
  assert.deepEqual(bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ active: true, pastDue: true }) }).pastDue, false, 'a member is never past due on screen');
  assert.deepEqual(bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: { loading: true, active: false } }), f({ canChat: true, paid: undefined, pastDue: false, nora: undefined }), 'unknown: nothing locks a member on a cold launch');
  assert.deepEqual(bsPaidFlags({ signedIn: true, isApprovedCoach: true, membership: { loading: true } }), f({ canChat: true, paid: true, pastDue: false, nora: true }), 'an approved coach has the paid features');
  assert.deepEqual(bsPaidFlags({ signedIn: false, isApprovedCoach: false, membership: m({ active: false }) }), f({ canChat: false, paid: undefined, pastDue: false, nora: undefined }), 'no account: no composer');
  const week = { startedAt: '2026-11-08T00:00:00Z', endsAt: '2026-11-15T00:00:00Z', active: true };
  assert.deepEqual(bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ active: false, nora: true, noraPreview: week }) }), { canChat: true, paid: false, pastDue: false, nora: true, noraPreview: week }, 'a free week gives Nora, never the rest');
});

test('a lookup: a real answer replaces what was known; a failed one keeps it, and admits nobody new', () => {
  assert.equal(bsMembershipAfter(null, true), true);
  assert.equal(bsMembershipAfter(true, false), false, 'a lapsed membership is a lapsed membership');
  assert.equal(bsMembershipAfter(true, null), true, 'a failed lookup never locks out a confirmed member');
  assert.equal(bsMembershipAfter(false, null), false);
  assert.equal(bsMembershipAfter(null, null), false, 'and never admits an account with nothing on record');
});

test('the boot seed is this account\'s own answer or nothing', () => {
  assert.equal(bsMembershipSeed({ stored: '1', storedUid: 'u1', lastUid: 'u1' }), true);
  assert.equal(bsMembershipSeed({ stored: '0', storedUid: 'u1', lastUid: 'u1' }), false);
  assert.equal(bsMembershipSeed({ stored: '1', storedUid: 'u1', lastUid: 'u2' }), null, 'another account on this device is not this one');
  assert.equal(bsMembershipSeed({ stored: '1', storedUid: null, lastUid: 'u1' }), null, 'an answer from before it was recorded per account counts for nobody');
  assert.equal(bsMembershipSeed({ stored: 'x', storedUid: 'u1', lastUid: 'u1' }), null);
  assert.equal(bsMembershipSeed({ stored: 'a', storedUid: 'u1', lastUid: 'u1' }), null, 'a known minor seeds nothing: the launch holds for the answer');
});

test('the shell uses those rules, asks /api/me/membership, and re-checks when it matters', () => {
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /const \{ allowed: accountAllowed, loading: gateLoading \} = bsAccountGate\(\{ isApprovedCoach, authReady, signedIn, membership \}\);/);
  assert.match(main, /const admitted = accountAllowed && !ageBlocked;/, 'a known minor is not admitted');
  assert.match(main, /window\.ShapeMembershipApi\?\.lookup\?\.\(\)/);
  assert.match(main, /const active = bsMembershipAfter\(known, answer\);\n\s+setMembership\(heard\n\s+\? \{ loading: false, active, ageRestricted, pastDue: !active && pastDue, nora: active \|\| nora, noraPreview, includedWithCoach: active && includedWithCoach \}/);
  assert.match(main, /localStorage\.setItem\('shape\.member', ageRestricted \? 'a' : answer \? '1' : '0'\)/);
  assert.match(main, /window\.addEventListener\('shape:membership-recheck', onRecheck\);/);
  assert.match(main, /document\.addEventListener\('visibilitychange', onVisible\);/);
  assert.match(main, /localStorage\.removeItem\('shape\.memberUid'\)/, 'signing out forgets whose answer it was');
  assert.match(main, /localStorage\.setItem\('shape\.memberUid', uid\)/);
  assert.doesNotMatch(main, /fetch\(\s*['"`]\/api\/stripe\/subscription/, 'that read calls coaches and admins inactive and a failure "inactive"');
  // The flags every screen reads, from the same answer.
  assert.match(main, /const paidFlags = bsPaidFlags\(\{ signedIn, isApprovedCoach, membership \}\);/);
  // Until a lookup answers on this account, Nora and past due are unknown, not false: a failed
  // lookup on a cold launch neither locks a free week nor sends a past-due account to Join.
  assert.match(main, /let heard = false;/);
  assert.match(main, /if \(d\) \{\n\s+heard = true;/);
  assert.match(main, /: \{ loading: false, active, ageRestricted, pastDue: undefined, nora: active \? true : undefined, noraPreview: null, includedWithCoach: false \}\);/);
  assert.match(main, /window\.ShapeCanChat = paidFlags\.canChat;\n\s+window\.ShapePaid = paidFlags\.paid;\n\s+window\.ShapePastDue = paidFlags\.pastDue;\n\s+window\.ShapeNora = paidFlags\.nora;\n\s+window\.ShapeNoraPreview = paidFlags\.noraPreview;\n\s+window\.ShapeIncludedWithCoach = includedWithCoach;\n\s+window\.dispatchEvent\(new Event\('shape:canchat'\)\);\n\s+window\.dispatchEvent\(new Event\('shape:paid'\)\);/);
  // The signed-out Preview and Browse are gone, and every way back to them.
  for (const gone of [/previewMode|setPreviewMode/, /browseMode|setBrowseMode/, /BSPreviewBanner/, /shape:exitPreview/, /bannerDismissed|noticeDismissed/, /onBrowse/, /onPreview/, /paywall\.preview/]) {
    assert.doesNotMatch(main, gone, `the shell still carries ${gone}`);
  }
  // Codex on #2353: computeMembership's rule, a coach role (dietitians included) as the primary
  // role or among roles[], passes as a coach.
  assert.match(main, /const realRoles = \[realRole, \.\.\.\(Array\.isArray\(authState\?\.profile\?\.roles\) \? authState\.profile\.roles : \[\]\)\];/);
  assert.match(main, /const isApprovedCoach = realRoles\.some\(\(r\) => r === 'trainer' \|\| r === 'nutritionist' \|\| r === 'dietitian'\);/);
});

test('one checkout door: the backend posts returnTo, opens the system browser natively, and re-checks on close', () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  const check = be.slice(be.indexOf('const MEMBERSHIP_LOOKUP_MS = 8000;'), be.indexOf('async function startMembershipCheckout('));
  assert.match(check, /shapeApiFetch\('\/api\/me\/membership', \{ cache: 'no-store', \.\.\.\(ctl \? \{ signal: ctl\.signal \} : \{\}\) \}\)/);
  assert.match(check, /if \(!res\.ok\) return null;/, 'a refused lookup is unknown, not a non-member');
  const start = be.slice(be.indexOf('async function startMembershipCheckout('), be.indexOf('// Open Stripe Checkout so Apple Pay'));
  assert.match(start, /const back = _isNative \? '\/membership\/done' : '\/m\/';/);
  assert.match(start, /body: JSON\.stringify\(\{ returnTo: back, cancelPath: back, plan: plan === 'annual' \? 'annual' : 'monthly' \}\)/, 'the plan the member picked (monthly by default)');
  assert.match(start, /const opened = await openCheckoutUrl\(data\.url, \{ onClose: \(\) => \{ try \{ window\.dispatchEvent\(new CustomEvent\('shape:membership-recheck', \{ detail: \{ poll: true \} \}\)\); \} catch \(e\) \{\} \} \}\);\n\s+return opened \? \{ ok: true \} : \{ ok: false, status: 0, code: 'browser_failed', error: null \};/);
  assert.match(start, /if \(data && data\.code === 'already_member'\) \{\n\s+try \{ window\.dispatchEvent\(new Event\('shape:membership-recheck'\)\); \} catch \(e\) \{\}/);
  assert.match(be, /window\.ShapeMembershipApi = \{ check: checkMembership, lookup: lookupMembership, startCheckout: startMembershipCheckout, plans: membershipPlans \};/);
  assert.match(be, /if \(payload\.url && !\(await openCheckoutUrl\(payload\.url\)\)\) \{\n\s+throw new Error\('Unable to open Stripe checkout\.'\);/, 'the coach checkout says so too');
  // every app entry to the membership checkout uses the door; the shell starts none of its own now
  // (a new account is a free account: no checkout on create).
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.doesNotMatch(main, /bsmStartCheckout|startCheckout\(/, 'the shell sends nobody to the checkout');
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /const openUpgradeCheckout = async \(\) => \{\n\s+if \(window\.bsRequireAccount && !window\.bsRequireAccount\('become a Shape member'\)\) return;\n\s+await bsStartPlatformCheckout\(\);/);
  assert.match(client, /async function bsStartPlatformCheckout\(\) \{[\s\S]*?const r = await api\.startCheckout\(\{ plan \}\);\n\s+if \(r\.ok \|\| r\.code === 'already_member'\) return;[\s\S]{0,200}if \(r\.code === 'payment_past_due'\) \{ if \(!\(await bsOpenBillingPortal\(\)\)\) fail\(\); return; \}/, 'a past-due account is sent to update its card, not sold a second membership');
  const lock = read('mobile-app/src/broadsheet/BSPaidLock.jsx');
  assert.match(lock, /export async function bsPaidJoin\(\) \{[\s\S]*?const r = await api\.startCheckout\(\{ plan \}\);[\s\S]*?if \(r && r\.code === 'payment_past_due'\) return \{ ok: await bsOpenBillingPortal\(\) \};/);
  for (const [name, src] of [['main', main], ['client', client], ['the lock', lock]]) {
    assert.doesNotMatch(src, /\/api\/stripe\/platform-checkout/, `${name}: no second door`);
  }
});

// lookupMembership and checkMembership, lifted from the shipping file and run against a scripted fetch.
function liftCheckMembership({ respond, lookupMs = 30, name = 'checkMembership' }) {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const start = src.indexOf('async function lookupMembership(');
  assert.ok(start > 0, 'lookupMembership exists');
  const checkAt = src.indexOf('async function checkMembership(', start);
  assert.ok(checkAt > 0, 'checkMembership follows it');
  const end = src.indexOf('\n}\n', checkAt) + 2;
  const signals = [];
  const shapeApiFetch = (path, init) => { signals.push(init.signal); return respond(init); };
  return { fn: new Function('state', 'shapeApiFetch', 'MEMBERSHIP_LOOKUP_MS', `${src.slice(start, end)}; return ${name};`)({ user: { id: 'u1' } }, shapeApiFetch, lookupMs), signals };
}

test('a membership lookup that never answers is unknown after its time, and is called off', async () => {
  // Codex on #2353: a half-open connection left the app on its hold, and the website blank, for good.
  const hung = liftCheckMembership({ respond: () => new Promise(() => {}) });
  const t0 = Date.now();
  assert.equal(await hung.fn(), null, 'unknown: the gate keeps this account\'s last answer');
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(hung.signals[0].aborted, true, 'the request itself is aborted');
  const member = liftCheckMembership({ respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: true }) }) });
  assert.equal(await member.fn(), true);
  assert.equal(member.signals[0].aborted, false);
  const refused = liftCheckMembership({ respond: async () => ({ ok: false }) });
  assert.equal(await refused.fn(), null);
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /const MEMBERSHIP_LOOKUP_MS = 8000;/);
});

// openCheckoutUrl, lifted from the shipping file and run against a scripted system browser.
function liftOpenCheckout({ native = true, openRejects = false } = {}) {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const start = src.indexOf('async function openCheckoutUrl(');
  assert.ok(start > 0, 'openCheckoutUrl exists');
  const end = src.indexOf('\n}\n', start) + 2;
  const listeners = [];
  const opened = [];
  const assigned = [];
  const Browser = {
    addListener: async (name, cb) => { const h = { name, cb, removed: false, remove: () => { h.removed = true; } }; listeners.push(h); return h; },
    open: async ({ url }) => { if (openRejects) throw new Error('no browser'); opened.push(url); },
  };
  const window = { Capacitor: { Plugins: { Browser } }, location: { assign: (u) => assigned.push(u) } };
  const Capacitor = { isNativePlatform: () => native };
  const fn = new Function('window', 'Capacitor', `${src.slice(start, end)}; return openCheckoutUrl;`)(window, Capacitor);
  return { fn, listeners, opened, assigned };
}

test('opening the checkout: the system browser natively, a close re-checks once, and a browser that will not open is reported', async () => {
  const ok = liftOpenCheckout();
  let closes = 0;
  assert.equal(await ok.fn('https://checkout.stripe.test/a', { onClose: () => { closes += 1; } }), true);
  assert.deepEqual(ok.opened, ['https://checkout.stripe.test/a']);
  ok.listeners[0].cb();
  assert.equal(closes, 1);
  assert.equal(ok.listeners[0].removed, true, 'one close, one call: the listener removes itself');
  // Codex on #2353: a rejected open used to read as success and leave the listener behind.
  const broken = liftOpenCheckout({ openRejects: true });
  assert.equal(await broken.fn('https://checkout.stripe.test/b', { onClose: () => {} }), false);
  assert.equal(broken.listeners[0].removed, true, 'it never opened, so its close listener is taken back');
  const web = liftOpenCheckout({ native: false });
  assert.equal(await web.fn('https://checkout.stripe.test/c'), true);
  assert.deepEqual(web.assigned, ['https://checkout.stripe.test/c'], 'the website build navigates');
});

test('coach checkout in the app: the error carries the route\'s flags, and hiring a coach needs no membership', () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  assert.match(be, /err\.code = payload\.code \|\| null;\n\s+err\.reason = payload\.reason \|\| null;\n\s+throw err;/);
  const mk = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  // Owner, 2026-11-10: browsing, booking and hiring coaches are free; /api/stripe/checkout-session
  // takes any signed-in adult account, so the membership-first panel and its $5 door are gone.
  assert.doesNotMatch(mk, /error\?\.code === 'membership_required'/, 'the coach checkout still meets a membership-first panel');
  assert.doesNotMatch(mk, /current\.join|join: true|ShapeMembershipApi/, 'the marketplace still sells the membership in a coach checkout');
  // The coach's own refusals are still said on the panel.
  assert.match(mk, /problem: \{ kind: 'payment', message: error\?\.message \|\| tr\('marketplace:listing\.checkoutErrorBody'/);
});

test('the installed app\'s checkout lands on a page that says what happened', async () => {
  const require_ = createRequire(join(ROOT, 'package.json'));
  const React = require_('react');
  globalThis.React = React; // the classic JSX transform the loader compiles with
  const { renderToStaticMarkup } = require_('react-dom/server');
  const page = await loadRealModule(join(ROOT, 'src/app/membership/done/page.tsx'), { typescript: true, registry: new Map([['react', React]]) });
  const html = async (member) => renderToStaticMarkup(await page.default({ searchParams: Promise.resolve(member ? { member } : {}) }));
  assert.match(await html('joined'), /Your Shape membership is active\./);
  assert.match(await html('pending'), /Your payment is still clearing\./);
  assert.match(await html(null), /No payment was taken\./);
  for (const m of ['joined', 'pending', null]) assert.match(await html(m), /Close this page to go back to the Shape app/);
});

test('#2353\'s moved item: a known minor is told so before the membership offer, in the app', async () => {
  const minor = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: false, ageRestricted: true }) }) });
  const rest = { nora: false, noraPreview: null, includedWithCoach: false };
  assert.deepEqual(await minor.fn(), { member: false, ageRestricted: true, pastDue: false, ...rest });
  const adult = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: true }) }) });
  assert.deepEqual(await adult.fn(), { member: true, ageRestricted: false, pastDue: false, ...rest, nora: true });
  const due = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: false, pastDue: true }) }) });
  assert.deepEqual(await due.fn(), { member: false, ageRestricted: false, pastDue: true, ...rest }, 'a failed renewal is past due');
  const week = { startedAt: '2026-11-08T00:00:00Z', endsAt: '2026-11-15T00:00:00Z', active: true };
  const preview = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: false, nora: true, noraPreview: week }) }) });
  assert.deepEqual(await preview.fn(), { member: false, ageRestricted: false, pastDue: false, nora: true, noraPreview: week, includedWithCoach: false }, 'a free week of Nora');
  const coached = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: true, includedWithCoach: true }) }) });
  assert.equal((await coached.fn()).includedWithCoach, true, 'membership with coaching');
  const paidDue = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: true, pastDue: true }) }) });
  assert.equal((await paidDue.fn()).pastDue, false, 'a member is never past due');
  const failed = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: false }) });
  assert.equal(await failed.fn(), null, 'unknown, not an adult and not a minor');
  const check = liftCheckMembership({ respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: false, ageRestricted: true }) }) });
  assert.equal(await check.fn(), false, 'check still answers the membership alone');

  // The shell: the age message comes before the welcome and the app, at both places they are drawn.
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /const ageBlocked = signedIn && !!\(membership && membership\.ageRestricted === true\);/);
  const gate = main.slice(main.indexOf("{stage === 'gate' && ("), main.indexOf("{stage === 'daily' &&"));
  const app = main.slice(main.indexOf("{stage === 'app' && ("));
  for (const [where, part] of [['the gate', gate], ['the app', app]]) {
    const age = part.indexOf('<BSDobGate blocked="age_restricted" onLogout={handleLogout} />');
    assert.ok(age > 0, `${where}: the age message is drawn`);
    assert.ok(age < part.indexOf('<BSWelcome'), `${where}: before the welcome`);
  }
  assert.ok(app.indexOf('<BSDobGate blocked="age_restricted"') < app.indexOf('<App onLogout'), 'a known minor never reaches the app');
  const dob = read('mobile-app/src/broadsheet/BSDobGate.jsx');
  assert.match(dob, /if \(blocked === 'age_restricted'\) \{[\s\S]*?tr\('dob\.errUnder18', \{ defaultValue: 'Shape is for adults 18 and over\.' \}\)[\s\S]*?onClick=\{onLogout\}/);
  assert.ok(dob.indexOf("if (blocked === 'age_restricted')") < dob.indexOf('if (blocked) {'), 'checked before the generic blocked screen');
});

test('#2353\'s moved item: after the checkout\'s browser closes, the app keeps asking for a minute', async () => {
  const flush = () => new Promise((r) => setImmediate(r));
  const scripted = (answers) => {
    const timers = [];
    let calls = 0;
    const run = async () => answers[Math.min(calls++, answers.length - 1)];
    const opts = { tries: 20, everyMs: 3000, schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, unschedule: () => {} };
    return { run, opts, timers, calls: () => calls };
  };
  // Paid a moment after the browser closed: the third ask finds it, and asking stops.
  const late = scripted([false, false, true]);
  bsPollMembership(late.run, late.opts);
  for (let i = 0; i < 5; i += 1) { await flush(); const t = late.timers.shift(); if (t) { assert.equal(t.ms, 3000); t.fn(); } }
  await flush();
  assert.equal(late.calls(), 3, 'stops at the first yes');
  // Never paid (closed unpaid): twenty asks, then it stops.
  const never = scripted([false]);
  bsPollMembership(never.run, never.opts);
  for (let i = 0; i < 30; i += 1) { await flush(); const t = never.timers.shift(); if (t) t.fn(); }
  await flush();
  assert.equal(never.calls(), 20, 'bounded');
  // Stopped (signed out, or a new poll): no more asks.
  const stopped = scripted([false]);
  const stop = bsPollMembership(stopped.run, stopped.opts);
  await flush();
  stop();
  const t = stopped.timers.shift();
  if (t) t.fn();
  await flush();
  assert.equal(stopped.calls(), 1);

  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /if \(e && e\.detail && e\.detail\.poll\) \{\n\s+stopPoll\(\);\n\s+stopPoll = bsPollMembership\(run, \{ tries: BSM_MEMBERSHIP_POLL_TRIES, everyMs: BSM_MEMBERSHIP_POLL_MS \}\);/);
  assert.match(main, /const BSM_MEMBERSHIP_POLL_MS = 3000;\nconst BSM_MEMBERSHIP_POLL_TRIES = 20;/);
  assert.match(main, /cancelled = true;\n\s+stopPoll\(\);/, 'the poll stops with the effect');
});
