// Where a new account came from (owner, 2026-10-13: "track signups by source too"): the rules
// (src/lib/signup-source.mjs), their classic-script copy (public/signup-source.js) held equal to
// them, the consent gate on remembering a first touch, and every sign-up path sending it.
// Run: node --test tests/signup-source.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as S from '../src/lib/signup-source.mjs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const NOW = Date.UTC(2026, 9, 13, 12);
const DAY = 86400000;
// A made-up id for a coach's referral link (public/supabase.js keeps the real one as shape.coachRef).
const REF_ID = '0f9c7a52-8a3e-4b1d-9c55-1d2e3f4a5b6c';

// ── The rules ────────────────────────────────────────────────────────────────────────────
test('a referrer is the outside site’s host, one name per site, never this site', () => {
  const own = 'theshapecommunity.com';
  assert.equal(S.referrerHost('https://www.google.com/search?q=shape', own), 'google.com');
  assert.equal(S.referrerHost('https://l.instagram.com/?u=x', own), 'instagram.com');
  assert.equal(S.referrerHost('https://lm.facebook.com/l.php', own), 'facebook.com');
  assert.equal(S.referrerHost('https://m.youtube.com/watch', own), 'youtube.com');
  assert.equal(S.referrerHost('https://theshapecommunity.com/newdesign/index.html', own), '', 'this site');
  assert.equal(S.referrerHost('https://www.theshapecommunity.com/x', `www.${own}`), '', 'this site, either spelling');
  assert.equal(S.referrerHost('https://app.theshapecommunity.com/x', own), '', 'this site’s subdomains');
  assert.equal(S.referrerHost('https://notshapecommunity.com/x', own), 'notshapecommunity.com', 'a look-alike is not this site');
  for (const bad of ['', 'not a url', 'android-app://com.google.android.gm', 'javascript:alert(1)', null]) assert.equal(S.referrerHost(bad, own), '', String(bad));
});

test('a page view’s source: its utm tags or its outside referrer; a direct visit has none', () => {
  const t = S.touchFrom({ search: '?utm_source=Instagram&utm_medium=social&utm_campaign=Launch%20Week&x=1', referrer: '', host: 'theshapecommunity.com', path: '/newdesign/index.html?utm_source=x', now: NOW });
  assert.deepEqual(t, { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'launch week', landing: '/newdesign/index.html', at: new Date(NOW).toISOString() });
  assert.deepEqual(S.touchFrom({ referrer: 'https://www.google.com/', host: 'theshapecommunity.com', path: '/', now: NOW }), { referrer: 'google.com', landing: '/', at: new Date(NOW).toISOString() });
  assert.equal(S.touchFrom({ search: '?ref=x', referrer: 'https://theshapecommunity.com/a', host: 'theshapecommunity.com', path: '/', now: NOW }), null, 'direct');
  assert.equal(S.touchFrom({ search: `?utm_source=${'x'.repeat(200)}`, path: '/', now: NOW }).utm_source.length, 60, 'clipped');
  assert.equal(S.touchFrom({ search: '?utm_source=a%00b%1F', path: '/', now: NOW }).utm_source, 'ab', 'control characters dropped');
});

test('only the known fields survive, each in its allowed shape', () => {
  assert.deepEqual(S.cleanSource({ utm_source: ' TikTok ', referrer: 'x.com', landing: '/a', at: '2026-10-01T00:00:00Z', coach_ref: true, surface: 'app', platform: 'ios', evil: 'y', nested: { a: 1 } }),
    { utm_source: 'tiktok', referrer: 'x.com', landing: '/a', at: '2026-10-01T00:00:00.000Z', coach_ref: true, surface: 'app', platform: 'ios' });
  assert.deepEqual(S.cleanSource({ coach_ref: 'true', surface: 'admin', platform: 'windows', landing: 'https://evil.example/', at: 'soon' }), null, 'nothing valid left');
  assert.deepEqual(S.cleanSource({ landing: '/has space' }), null);
  for (const bad of [null, 'x', 1, [], [{ utm_source: 'a' }]]) assert.equal(S.cleanSource(bad), null);
});

test('a remembered first touch lasts 90 days and is never from the future', () => {
  const at = (ms) => JSON.stringify({ utm_source: 'google', at: new Date(ms).toISOString() });
  assert.equal(S.readStored(at(NOW - 89 * DAY), NOW).utm_source, 'google');
  assert.equal(S.readStored(at(NOW - 91 * DAY), NOW), null, 'expired');
  assert.equal(S.readStored(at(NOW + DAY), NOW), null, 'from the future');
  assert.equal(S.readStored(JSON.stringify({ utm_source: 'google' }), NOW), null, 'no date');
  assert.equal(S.readStored('{not json', NOW), null);
  assert.equal(S.readStored(null, NOW), null);
  const stored = { utm_source: 'a', at: 'x' };
  assert.equal(S.nextStored(stored, { utm_source: 'b' }), stored, 'the first touch wins');
  assert.deepEqual(S.nextStored(null, { utm_source: 'b' }), { utm_source: 'b' });
  assert.equal(S.nextStored(null, null), null);
});

test('a coach’s referral link counts while public/supabase.js still holds it (30 days)', () => {
  const ref = (ms, token = REF_ID) => JSON.stringify({ token, at: ms, bound: false });
  assert.equal(S.coachRefLive(ref(NOW - 29 * DAY), NOW), true);
  assert.equal(S.coachRefLive(ref(NOW - 31 * DAY), NOW), false);
  assert.equal(S.coachRefLive(ref(NOW, 'not-a-uuid'), NOW), false);
  assert.equal(S.coachRefLive(null, NOW), false);
  assert.match(read('public/supabase.js'), /var COACH_REF_KEY = 'shape\.coachRef';/, 'the key the coach referral is kept under');
});

test('remembering a first touch follows the app’s consent rule', () => {
  const allow = (consent, gpc, timeZone) => S.trackingAllowed({ consent, gpc, timeZone });
  assert.equal(allow(null, false, 'America/New_York'), true, 'no choice, outside the EEA/UK');
  assert.equal(allow(null, false, 'Europe/London'), false, 'no choice, EEA/UK');
  assert.equal(allow('accept', false, 'Europe/Paris'), true, 'accepted');
  assert.equal(allow('reject', false, 'America/Chicago'), false, 'rejected, anywhere');
  assert.equal(allow('accept', true, 'America/Chicago'), false, 'Global Privacy Control wins over everything');
  assert.equal(allow(null, false, ''), false, 'unknown region: blocked');
  // The same order the app's analytics.js uses.
  const app = read('mobile-app/src/services/analytics.js');
  assert.ok(app.indexOf('globalPrivacyControl === true) return true') < app.indexOf("if (c === 'reject') return true;"));
  assert.ok(app.indexOf("if (c === 'reject') return true;") < app.indexOf("if (c === 'accept') return false;"));
});

test('a sign-up saves the remembered touch, else its own page’s, plus where it happened', () => {
  const stored = { utm_source: 'instagram', at: new Date(NOW).toISOString() };
  const current = { referrer: 'google.com', at: new Date(NOW).toISOString() };
  assert.deepEqual(S.forSignup({ stored, current, surface: 'website' }), { utm_source: 'instagram', at: stored.at, surface: 'website' });
  assert.deepEqual(S.forSignup({ stored: null, current, coachRef: true, surface: 'website' }), { referrer: 'google.com', at: current.at, coach_ref: true, surface: 'website' });
  assert.deepEqual(S.forSignup({ surface: 'app', platform: 'android' }), { surface: 'app', platform: 'android' });
  assert.deepEqual(S.forSignup({ surface: 'website', platform: 'windows' }), { surface: 'website' });
  assert.deepEqual(S.forSignup(), { surface: 'website' });
});

test('the root redirect carries a link’s tags and a coach’s ref, and nothing else', () => {
  assert.equal(S.carriedQuery({ utm_source: 'instagram', utm_campaign: ['launch', 'x'], ref: REF_ID, next: '/evil', q: 'x' }), `?utm_source=instagram&utm_campaign=launch&ref=${REF_ID}`);
  assert.equal(S.carriedQuery({ utm_source: '  ' }), '');
  assert.equal(S.carriedQuery(undefined), '');
  assert.equal(S.carriedQuery({ utm_source: 'x'.repeat(300) }).length, '?utm_source='.length + 100);
  const page = read('src/app/page.tsx');
  assert.match(page, /redirect\(`\/newdesign\/index\.html\$\{carriedQuery\(await searchParams\)\}`\);/);
});

// ── The browser copy ─────────────────────────────────────────────────────────────────────
function loadMirror({ search = '', referrer = '', host = 'theshapecommunity.com', path = '/newdesign/index.html', storage = {}, gpc = false, timeZone = 'America/New_York', now } = {}) {
  const store = { ...storage };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const window = { localStorage, location: { search, host, pathname: path }, document: { referrer }, navigator: { globalPrivacyControl: gpc } };
  const RealDate = Date;
  const FakeDate = now == null ? RealDate : class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  };
  const sandbox = { window, URL, URLSearchParams, Date: FakeDate, Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) } };
  vm.createContext(sandbox);
  vm.runInContext(read('public/signup-source.js'), sandbox, { filename: 'public/signup-source.js' });
  assert.ok(window.shapeSignupSource && window.shapeSignupSource.rules, 'public/signup-source.js registers window.shapeSignupSource');
  return { api: window.shapeSignupSource, store };
}

test('the browser copy answers exactly as the module does', () => {
  const R = loadMirror().api.rules;
  assert.equal(R.SOURCE_KEY, S.SOURCE_KEY);
  assert.equal(R.COACH_REF_KEY, S.COACH_REF_KEY);
  const own = 'theshapecommunity.com';
  const json = (v) => JSON.parse(JSON.stringify(v)); // across the vm boundary
  const cases = {
    referrerHost: [['https://www.google.com/x', own], ['https://l.instagram.com/', own], [`https://${own}/a`, own], ['https://a.theshapecommunity.com', own], ['nope', own], ['ftp://x.com', own], ['https://notshapecommunity.com', own]],
    touchFrom: [[{ search: '?utm_source=A&utm_medium=B&utm_campaign=C', path: '/x?y', now: NOW }], [{ referrer: 'https://www.bing.com/', host: own, path: '/', now: NOW }], [{ referrer: `https://${own}/`, host: own, now: NOW }], [{ search: `?utm_campaign=${'Z'.repeat(99)}`, path: 'no-slash', now: NOW }]],
    cleanSource: [[{ utm_source: ' X ', landing: '/a b', at: '2026-01-01', coach_ref: true, surface: 'app', platform: 'web', junk: 1 }], [{ coach_ref: 'yes', surface: 'x' }], [null], [[]], [{ referrer: 'a'.repeat(99) }]],
    readStored: [[JSON.stringify({ utm_source: 'g', at: new Date(NOW - DAY).toISOString() }), NOW], [JSON.stringify({ utm_source: 'g', at: new Date(NOW - 100 * DAY).toISOString() }), NOW], [JSON.stringify({ utm_source: 'g', at: new Date(NOW + 2 * DAY).toISOString() }), NOW], ['{', NOW]],
    coachRefLive: [[JSON.stringify({ token: REF_ID, at: NOW - DAY }), NOW], [JSON.stringify({ token: REF_ID, at: NOW - 40 * DAY }), NOW], [JSON.stringify({ token: 'x', at: NOW }), NOW], ['', NOW]],
    trackingAllowed: [[{ consent: null, gpc: false, timeZone: 'America/Denver' }], [{ consent: null, timeZone: 'Europe/Berlin' }], [{ consent: 'accept', timeZone: 'Europe/Berlin' }], [{ consent: 'reject', timeZone: 'Asia/Tokyo' }], [{ consent: 'accept', gpc: true, timeZone: 'Asia/Tokyo' }], [{}]],
    forSignup: [[{ stored: { utm_source: 'a', at: '2026-01-01T00:00:00.000Z' }, current: { referrer: 'b' }, surface: 'website' }], [{ current: { referrer: 'b' }, coachRef: true }], [{ surface: 'app', platform: 'ios' }], [{ platform: 'bad' }], [{}]],
    clip: [['  MiXeD  '], ['a'.repeat(80)], ['x', 3], [null]],
  };
  for (const [fn, list] of Object.entries(cases)) {
    for (const args of list) assert.deepEqual(json(R[fn](...args)), json(S[fn](...args)), `${fn}(${JSON.stringify(args).slice(0, 80)})`);
  }
});

test('on a page: a first touch is remembered only as consent allows, and the first one wins', () => {
  const tagged = { search: '?utm_source=instagram', path: '/newdesign/index.html', now: NOW };
  const yes = loadMirror({ ...tagged });
  assert.equal(JSON.parse(yes.store['shape.signupSource']).utm_source, 'instagram', 'outside the EEA/UK with no choice: remembered');
  const eu = loadMirror({ ...tagged, timeZone: 'Europe/Dublin' });
  assert.equal(eu.store['shape.signupSource'], undefined, 'EEA/UK with no choice: not remembered');
  const euYes = loadMirror({ ...tagged, timeZone: 'Europe/Dublin', storage: { 'shape.consent.v1': 'accept' } });
  assert.ok(euYes.store['shape.signupSource'], 'EEA/UK after accepting: remembered');
  const earlier = JSON.stringify({ utm_source: 'tiktok', at: new Date(NOW - 3 * DAY).toISOString() });
  const gpc = loadMirror({ ...tagged, gpc: true, storage: { 'shape.signupSource': earlier } });
  assert.equal(gpc.store['shape.signupSource'], undefined, 'Global Privacy Control: nothing kept, and what was kept is dropped');
  const later = loadMirror({ ...tagged, storage: { 'shape.signupSource': earlier } });
  assert.equal(JSON.parse(later.store['shape.signupSource']).utm_source, 'tiktok', 'the first touch is kept');
  const direct = loadMirror({ path: '/', now: NOW });
  assert.equal(direct.store['shape.signupSource'], undefined, 'a direct visit remembers nothing');
});

test('on a page: a sign-up gets the remembered touch, else the page’s own, and a coach link', () => {
  const earlier = JSON.stringify({ utm_source: 'tiktok', at: new Date(NOW - 3 * DAY).toISOString() });
  const page = loadMirror({ referrer: 'https://www.google.com/', path: '/newdesign/signup.html', now: NOW, storage: { 'shape.signupSource': earlier } });
  assert.equal(JSON.parse(JSON.stringify(page.api.forSignup('website'))).utm_source, 'tiktok');
  const eu = loadMirror({ referrer: 'https://www.google.com/', path: '/newdesign/signup.html', timeZone: 'Europe/Rome', now: NOW, storage: { 'shape.signupSource': earlier, 'shape.coachRef': JSON.stringify({ token: REF_ID, at: NOW - DAY }) } });
  assert.deepEqual(JSON.parse(JSON.stringify(eu.api.forSignup('website'))), { referrer: 'google.com', landing: '/newdesign/signup.html', at: new Date(NOW).toISOString(), coach_ref: true, surface: 'website' },
    'without consent the remembered touch is not read; the sign-up page’s own referrer and the coach link still are');
  // Consent withdrawn after the page loaded (a "reject" in the banner): the remembered touch is
  // still on the device until the next page load, and the sign-up must not read it.
  const late = loadMirror({ search: '?utm_source=tiktok', path: '/newdesign/signup.html', now: NOW });
  assert.ok(late.store['shape.signupSource'], 'remembered on load');
  late.store['shape.consent.v1'] = 'reject';
  assert.equal(JSON.parse(JSON.stringify(late.api.forSignup('website'))).utm_source, 'tiktok', 'the page’s own link still counts');
  assert.equal(JSON.parse(JSON.stringify(late.api.forSignup('website'))).at, new Date(NOW).toISOString());
  late.store['shape.signupSource'] = JSON.stringify({ utm_source: 'instagram', at: new Date(NOW - DAY).toISOString() });
  assert.equal(JSON.parse(JSON.stringify(late.api.forSignup('website'))).utm_source, 'tiktok', 'a remembered touch is not read once consent is withdrawn');
});

test('the page reader the Next form and the app use answers exactly as the browser script does', () => {
  const RealIntl = globalThis.Intl;
  const cases = [
    { search: '?utm_source=instagram&utm_campaign=Launch', path: '/m/', now: NOW },
    { referrer: 'https://www.google.com/', path: '/signup', now: NOW, storage: { 'shape.signupSource': JSON.stringify({ utm_source: 'tiktok', at: new Date(NOW - DAY).toISOString() }) } },
    { referrer: 'https://www.google.com/', path: '/signup', timeZone: 'Europe/Paris', now: NOW, storage: { 'shape.signupSource': JSON.stringify({ utm_source: 'tiktok', at: new Date(NOW - DAY).toISOString() }), 'shape.coachRef': JSON.stringify({ token: REF_ID, at: NOW - DAY }) } },
    { search: '?utm_source=x', path: '/', gpc: true, now: NOW },
    { path: '/', now: NOW },
  ];
  try {
    for (const c of cases) {
      globalThis.Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: c.timeZone || 'America/New_York' }) }) };
      // The browser script, on a page set up this way (it captures on load).
      const page = loadMirror(c);
      const want = JSON.parse(JSON.stringify(page.api.forSignup('app', 'ios')));
      // The module's reader, on an identical page that has also captured on load.
      const store = { ...(c.storage || {}) };
      const win = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        location: { search: c.search || '', host: 'theshapecommunity.com', pathname: c.path },
        document: { referrer: c.referrer || '' },
        navigator: { globalPrivacyControl: c.gpc === true },
      };
      const realNow = Date.now;
      Date.now = () => NOW;
      try {
        S.captureFromWindow(win);
        assert.deepEqual(store['shape.signupSource'] ?? null, page.store['shape.signupSource'] ?? null, `the same thing remembered: ${JSON.stringify(c).slice(0, 60)}`);
        assert.deepEqual(S.sourceFromWindow(win, 'app', 'ios'), want, `the same sign-up source: ${JSON.stringify(c).slice(0, 60)}`);
      } finally {
        Date.now = realNow;
      }
    }
  } finally {
    globalThis.Intl = RealIntl;
  }
  assert.deepEqual(S.sourceFromWindow({}, 'website'), { surface: 'website' }, 'a page with nothing readable is still a website sign-up');
  // Consent withdrawn after the first touch was remembered: the sign-up does not read it.
  const kept = { 'shape.signupSource': JSON.stringify({ utm_source: 'tiktok', at: new Date(Date.now() - DAY).toISOString() }), 'shape.consent.v1': 'reject' };
  const win = { localStorage: { getItem: (k) => kept[k] ?? null, setItem() {}, removeItem() {} }, location: { search: '', host: 'theshapecommunity.com', pathname: '/signup' }, document: { referrer: '' }, navigator: {} };
  assert.deepEqual(S.sourceFromWindow(win, 'website'), { surface: 'website' });
  kept['shape.consent.v1'] = 'accept';
  assert.equal(S.sourceFromWindow(win, 'website').utm_source, 'tiktok', 'and does with consent');
});

// ── Every way in sends it ────────────────────────────────────────────────────────────────
test('every sign-up path saves signup_source with the new account', () => {
  assert.match(read('public/newdesign/signup.jsx'), /signup_source: \(window\.shapeSignupSource && window\.shapeSignupSource\.forSignup\("website"\)\) \|\| \{ surface: "website" \},/);
  assert.match(read('public/supabase.js'), /signup_source: \(window\.shapeSignupSource && window\.shapeSignupSource\.forSignup\('website'\)\) \|\| \{ surface: 'website' \}/);
  const app = read('mobile-app/src/services/shapeBackend.js');
  // Codex, #2325: the app in a browser at /m/ keeps a tagged link's source, not only "the app".
  assert.match(app, /signup_source: typeof window !== 'undefined' \? sourceFromWindow\(window, 'app', signupPlatform\(\)\) : \{ surface: 'app', platform: signupPlatform\(\) \},/);
  assert.match(app, /^if \(typeof window !== 'undefined'\) captureFromWindow\(window\);$/m, 'and remembers the first touch on load');
  assert.match(app, /return p === 'ios' \|\| p === 'android' \? p : 'web';/);
  const form = read('src/app/signup/SignupForm.tsx');
  // Codex, #2325: read as the form is sent, never on mount (the script may not have loaded yet).
  assert.match(form, /async function signupAction\(_prev: State, formData: FormData\): Promise<State> \{\n[^]*?formData\.set\('signup_source', JSON\.stringify\(sourceFromWindow\(window, 'website'\)\)\);\n\s+const result = await signup\(formData\);/);
  assert.doesNotMatch(form, /name="signup_source"/, 'no field fixed at mount');
  const action = read('src/app/login/actions.ts');
  assert.match(action, /data: \{ role, date_of_birth: dob, signup_source: signupSourceFrom\(formData\) \},/);
  assert.match(action, /return cleanSource\(\{ \.\.\.\(raw && typeof raw === 'object' && !Array\.isArray\(raw\) \? raw : \{\}\), surface: 'website' \}\) \?\? \{ surface: 'website' \};/, 'the server cleans what the browser sent');
});

test('the script loads wherever a visitor can land', () => {
  assert.match(read('public/newdesign/pageShell.jsx'), /s\.src = "\/signup-source\.js";/, 'the shared shell (68 pages)');
  // Codex, #2325: signup-client.html and the older root pages load supabase.js, not the shell.
  assert.match(read('public/supabase.js'), /s\.src = '\/signup-source\.js';/, 'supabase.js loads it too');
  assert.match(read('public/signup-client.html'), /<script src="supabase\.js"><\/script>/, 'which signup-client.html loads');
  for (const f of ['public/newdesign/TrainerPublic.html', 'public/newdesign/NutritionistPublic.html']) {
    const html = read(f);
    const tag = html.indexOf('<script src="/signup-source.js"></script>');
    assert.ok(tag > 0, `${f} loads it`);
    assert.ok(tag < html.indexOf('location.replace') || html.indexOf('location.replace') < 0, `${f}: before its redirect`);
    assert.ok(tag < html.indexOf('<script>\n// Superseded'), `${f}: synchronously, before the redirect script`);
  }
  assert.match(read('public/newdesign/consultation.html'), /<script defer src="\/signup-source\.js"><\/script>/);
  assert.match(read('src/app/layout.tsx'), /<Script src="\/signup-source\.js" strategy="afterInteractive" \/>/, 'the Next pages, /signup among them');
});

test('the cookie banner says its choice covers this, in the words it records, and acts on it at once', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  // Codex, #2325: an Accept on the landing page keeps its link (gone after the next click), a
  // Reject drops what was kept.
  assert.match(shell, /function record\(choice\) \{\n\s+try \{ localStorage\.setItem\(KEY, choice\); \} catch \(e\) \{\}\n(\s+\/\/.*\n)+\s+try \{ if \(window\.shapeSignupSource\) window\.shapeSignupSource\.capture\(\); \} catch \(e\) \{\}/);
  const recorded = /var BANNER_COPY = "([^"]+)";/.exec(shell)[1];
  const shown = /txt\.appendChild\(document\.createTextNode\("([^"]+)"\)\);/.exec(shell)[1] + 'Privacy Policy.';
  assert.equal(shown, recorded, 'what is shown is what is recorded');
  assert.match(recorded, /whether we remember which link brought you to Shape/);
});
