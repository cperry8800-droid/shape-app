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
const { bsMemberGate, bsMembershipAfter, bsMembershipSeed } = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/memberGate.mjs')).href);

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
  assert.match(main, /window\.ShapeMembershipApi\?\.check\?\.\(\)/);
  assert.match(main, /setMembership\(\{ loading: false, active: bsMembershipAfter\(known, answer\) \}\);/);
  assert.match(main, /window\.addEventListener\('shape:membership-recheck', onRecheck\);/);
  assert.match(main, /document\.addEventListener\('visibilitychange', onVisible\);/);
  assert.match(main, /localStorage\.removeItem\('shape\.memberUid'\)/, 'signing out forgets whose answer it was');
  assert.match(main, /localStorage\.setItem\('shape\.memberUid', uid\)/);
  assert.doesNotMatch(main, /fetch\(\s*['"`]\/api\/stripe\/subscription/, 'that read calls coaches and admins inactive and a failure "inactive"');
  assert.match(main, /setPreviewMode\(false\);/, 'a previewer who signs in is not previewing (L2)');
  // Codex on #2353: a dietitian is a coach (roles.mjs, membership-core.ts) and passes as one.
  assert.match(main, /const isApprovedCoach = realRole === 'trainer' \|\| realRole === 'nutritionist' \|\| realRole === 'dietitian';/);
});

test('one checkout door: the backend posts returnTo, opens the system browser natively, and re-checks on close', () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  const check = be.slice(be.indexOf('async function checkMembership('), be.indexOf('async function startMembershipCheckout('));
  assert.match(check, /shapeApiFetch\('\/api\/me\/membership', \{ cache: 'no-store' \}\)/);
  assert.match(check, /if \(!res\.ok\) return null;/, 'a refused lookup is unknown, not a non-member');
  const start = be.slice(be.indexOf('async function startMembershipCheckout('), be.indexOf('// Open Stripe Checkout so Apple Pay'));
  assert.match(start, /const back = _isNative \? '\/membership\/done' : '\/m\/';/);
  assert.match(start, /body: JSON\.stringify\(\{ returnTo: back, cancelPath: back \}\)/);
  assert.match(start, /openCheckoutUrl\(data\.url, \{ onClose: \(\) => \{ try \{ window\.dispatchEvent\(new Event\('shape:membership-recheck'\)\); \} catch \(e\) \{\} \} \}\);/);
  assert.match(start, /if \(data && data\.code === 'already_member'\) \{\n\s+try \{ window\.dispatchEvent\(new Event\('shape:membership-recheck'\)\); \} catch \(e\) \{\}/);
  assert.match(be, /window\.ShapeMembershipApi = \{ check: checkMembership, startCheckout: startMembershipCheckout \};/);
  assert.match(be, /Browser\.addListener\('browserFinished', \(\) => \{\n\s+try \{ onClose\(\); \} catch \(e\) \{\}\n\s+try \{ if \(sub && sub\.remove\) sub\.remove\(\); \} catch \(e\) \{\}/, 'the close listener removes itself');
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

test('coach checkout in the app: the error carries the route\'s flags, and the marketplace offers the membership', () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  assert.match(be, /err\.code = payload\.code \|\| null;\n\s+err\.reason = payload\.reason \|\| null;\n\s+throw err;/);
  const mk = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(mk, /if \(error\?\.code === 'membership_required'\) \{\n\s+setAction\(\{\n\s+\.\.\.current,\n\s+join: true,/);
  assert.match(mk, /if \(current && current\.join\) \{ window\.ShapeMembershipApi\?\.startCheckout\?\.\(\); return; \}/);
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
