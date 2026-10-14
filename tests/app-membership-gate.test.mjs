// The app's paywall decides on the membership, not on being signed in (client-onboarding
// review H1, 2026-10-14), and every membership checkout in the app goes through one door that
// comes back to the app and re-checks (M1). The rules are pure (memberGate.mjs); the wiring is
// checked in the shipping source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const { bsMemberGate, bsMembershipAfter, bsMembershipSeed, bsPollMembership } = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/memberGate.mjs')).href);

test('the gate: signed in is not enough; a member, or an approved coach, is in', () => {
  const ready = { isApprovedCoach: false, authReady: true };
  assert.deepEqual(bsMemberGate({ ...ready, membership: { loading: false, active: false } }), { allowed: false, loading: false }, 'a signed-in non-member meets the paywall');
  assert.deepEqual(bsMemberGate({ ...ready, membership: { loading: false, active: true } }), { allowed: true, loading: false });
  assert.deepEqual(bsMemberGate({ ...ready, membership: { loading: true, active: false } }), { allowed: false, loading: true }, 'held while the lookup runs, never decided early');
  assert.deepEqual(bsMemberGate({ isApprovedCoach: false, authReady: false, membership: { loading: false, active: true } }).loading, true, 'held until the session restores');
  assert.deepEqual(bsMemberGate({ isApprovedCoach: true, authReady: false, membership: { loading: true, active: false } }), { allowed: true, loading: false }, 'an approved coach is a member by role');
  assert.equal(bsMemberGate({ ...ready, membership: { loading: false, active: 'yes' } }).allowed, false, 'only a real true admits');
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
});

test('the shell uses those rules, asks /api/me/membership, and re-checks when it matters', () => {
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /const \{ allowed: memberAllowed, loading: memberGateLoading \} = bsMemberGate\(\{ isApprovedCoach, authReady, membership \}\);/);
  assert.doesNotMatch(main, /isApprovedCoach \|\| signedIn \|\|/, 'the old gate let every signed-in account in');
  assert.match(main, /window\.ShapeMembershipApi\?\.lookup\?\.\(\)/);
  assert.match(main, /const active = bsMembershipAfter\(known, answer\);\n\s+setMembership\(\{ loading: false, active, ageRestricted \}\);/);
  assert.match(main, /window\.addEventListener\('shape:membership-recheck', onRecheck\);/);
  assert.match(main, /document\.addEventListener\('visibilitychange', onVisible\);/);
  assert.match(main, /localStorage\.removeItem\('shape\.memberUid'\)/, 'signing out forgets whose answer it was');
  assert.match(main, /localStorage\.setItem\('shape\.memberUid', uid\)/);
  assert.doesNotMatch(main, /fetch\(\s*['"`]\/api\/stripe\/subscription/, 'that read calls coaches and admins inactive and a failure "inactive"');
  assert.match(main, /setPreviewMode\(false\);/, 'a previewer who signs in is not previewing (L2)');
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
  assert.match(start, /body: JSON\.stringify\(\{ returnTo: back, cancelPath: back \}\)/);
  assert.match(start, /const opened = await openCheckoutUrl\(data\.url, \{ onClose: \(\) => \{ try \{ window\.dispatchEvent\(new CustomEvent\('shape:membership-recheck', \{ detail: \{ poll: true \} \}\)\); \} catch \(e\) \{\} \} \}\);\n\s+return opened \? \{ ok: true \} : \{ ok: false, status: 0, code: 'browser_failed', error: null \};/);
  assert.match(start, /if \(data && data\.code === 'already_member'\) \{\n\s+try \{ window\.dispatchEvent\(new Event\('shape:membership-recheck'\)\); \} catch \(e\) \{\}/);
  assert.match(be, /window\.ShapeMembershipApi = \{ check: checkMembership, lookup: lookupMembership, startCheckout: startMembershipCheckout \};/);
  assert.match(be, /if \(payload\.url && !\(await openCheckoutUrl\(payload\.url\)\)\) \{\n\s+throw new Error\('Unable to open Stripe checkout\.'\);/, 'the coach checkout says so too');
  // every app entry to the membership checkout uses the door
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /async function bsmStartCheckout\(\) \{[\s\S]*?const r = await api\.startCheckout\(\);/);
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /const openUpgradeCheckout = async \(\) => \{\n\s+if \(window\.bsRequireAccount && !window\.bsRequireAccount\('become a Shape member'\)\) return;\n\s+await bsStartPlatformCheckout\(\);/);
  assert.match(client, /async function bsStartPlatformCheckout\(\) \{[\s\S]*?const r = await api\.startCheckout\(\);/);
  for (const [name, src] of [['main', main], ['client', client]]) {
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

test('coach checkout in the app: the error carries the route\'s flags, and the marketplace offers the membership', () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  assert.match(be, /err\.code = payload\.code \|\| null;\n\s+err\.reason = payload\.reason \|\| null;\n\s+throw err;/);
  const mk = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(mk, /if \(error\?\.code === 'membership_required'\) \{\n\s+setAction\(\{\n\s+\.\.\.current,\n\s+join: true,/);
  // Codex on #2353: a failed membership checkout says so on the panel; a member goes back to the coach.
  assert.match(mk, /try \{ r = await window\.ShapeMembershipApi\?\.startCheckout\?\.\(\); \} finally \{ setCheckoutBusy\(false\); \}\n\s+if \(r && r\.ok\) return;/);
  assert.match(mk, /if \(r && r\.code === 'already_member' && current\.back\) \{ setAction\(current\.back\); return; \}/);
  assert.match(mk, /setAction\(\{ \.\.\.current, body: message, cta: tr\('marketplace:listing\.tryAgain'[^)]*\), problem: \{ kind: 'payment', message \} \}\);/);
  assert.match(mk, /join: true,\n\s+back: current,/);
  assert.match(mk, /cta: tr\('onboarding:paywall\.join', \{ price: '\$5' \}\),/, 'the paywall\'s own translated words');
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
  assert.deepEqual(await minor.fn(), { member: false, ageRestricted: true });
  const adult = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: true }) }) });
  assert.deepEqual(await adult.fn(), { member: true, ageRestricted: false });
  const failed = liftCheckMembership({ name: 'lookupMembership', respond: async () => ({ ok: false }) });
  assert.equal(await failed.fn(), null, 'unknown, not an adult and not a minor');
  const check = liftCheckMembership({ respond: async () => ({ ok: true, json: async () => ({ signedIn: true, member: false, ageRestricted: true }) }) });
  assert.equal(await check.fn(), false, 'check still answers the membership alone');

  // The shell: the age message comes before the paywall, at both places the paywall is drawn.
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /const ageBlocked = signedIn && !!\(membership && membership\.ageRestricted === true\);/);
  const gate = main.slice(main.indexOf("{stage === 'gate' && ("), main.indexOf("{stage === 'daily' &&"));
  const app = main.slice(main.indexOf("{stage === 'app' && ("));
  for (const [where, part] of [['the gate', gate], ['the app', app]]) {
    const age = part.indexOf('<BSDobGate blocked="age_restricted" onLogout={handleLogout} />');
    assert.ok(age > 0, `${where}: the age message is drawn`);
    assert.ok(age < part.indexOf('<BSPaywall'), `${where}: before the paywall`);
  }
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
