// Free accounts in the app (owner, 2026-11-10). An account is required, and a signed-in adult
// account that has not paid is a FREE account that gets in: logging, Home, programs, the
// leaderboards (ranked; the full board and exact rank are paid), coaches and messaging them, and
// help-desk Nora. The membership ($5 a month or $48 a year, or one that comes with coaching, or an
// approved coach, or an admin) adds the paid features: assistant Nora and her voice, Shape Radio,
// the AI helpers, Cook Mode's voice and the points Store. Past due (the renewal failed, Stripe
// retrying) is treated as free, and told to update the card. Assistant Nora is paid only: a free
// account meets her lock (there is no free week of her).
// The weekly recap is free and shareable; the AI weekly readout stays paid.
//
// The pure rules are memberGate.mjs's; the lock every paid feature draws is BSPaidLock.jsx, driven
// here for real; the wiring of each surface is checked in the shipping source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require_ = createRequire(join(ROOT, 'package.json'));
const React = require_('react');
globalThis.React = React;
const { renderToStaticMarkup } = require_('react-dom/server');

const MAIN = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
// The first-run screens Main draws (BSFirstRun.jsx, the redraw of 2026-11-13): the welcome among them.
const FIRST_RUN = read('mobile-app/src/broadsheet/BSFirstRun.jsx');
const WELCOME_SCREEN = FIRST_RUN.slice(FIRST_RUN.indexOf('export function BSWelcomeScreen('), FIRST_RUN.indexOf('// ── CHECK YOUR EMAIL'));
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const RADIO = read('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx');
const BACKEND = read('mobile-app/src/services/shapeBackend.js');
const CATALOGS = join(ROOT, 'mobile-app/src/i18n/catalogs');
const LOCALES = readdirSync(CATALOGS).filter((d) => !d.startsWith('.'));
const cat = (loc, ns) => JSON.parse(readFileSync(join(CATALOGS, loc, `${ns}.json`), 'utf8'));

const gate = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/memberGate.mjs')).href);

// ── The window the lock reads at call time: the en catalogs through an interpolating t, a theme,
// a plate that passes its children through, and the shell's flags (set per test). ────────────────
const EN = {};
for (const ns of ['common', 'onboarding', 'settings', 'feed', 'score', 'cook']) EN[ns] = cat('en', ns);
// A small ICU: `{n, plural, one {…} other {…}}` (with #) and `{name}`.
const icu = (v, opts) => String(v)
  .replace(/\{(\w+), plural,((?:[^{}]|\{[^{}]*\})*)\}/g, (m, n, body) => {
    const forms = {}; for (const f of body.matchAll(/(\w+) \{([^{}]*)\}/g)) forms[f[1]] = f[2];
    const val = Number(opts[n]);
    return (val === 1 && forms.one != null ? forms.one : forms.other).replace(/#/g, String(val));
  })
  .replace(/\{(\w+)\}/g, (m, n) => (opts[n] != null ? String(opts[n]) : m));
const t = (key, opts = {}) => {
  const [ns, k] = key.includes(':') ? key.split(':') : ['common', key];
  const v = (EN[ns] && EN[ns][k]) ?? opts.defaultValue ?? key;
  return icu(v, opts);
};
const THEME = new Proxy({ MONO: 'mono', DISPLAY: 'display', BODY: 'body', INK: '#111', INK70: '#555', INK50: '#777', PAPER: '#fff', PAPER2: '#eee', RULE: '#ccc', HAIR: '#ddd', AMBER: '#c8881a', padX: 18, isLight: true },
  { get: (o, k) => (k in o ? o[k] : '#000') });
const store = new Map();
const W = {
  useBS: () => THEME,
  BSPlate: ({ children, c }) => React.createElement('div', { 'data-plate': c }, children),
  ShapeI18n: { t },
  ShapeLocale: { subscribe: () => () => {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  location: { href: '' },
};
globalThis.window = W;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const LOCK = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSPaidLock.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });
const html = (el) => renderToStaticMarkup(el);
const text = (el) => html(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const FLAGS = ['ShapePaid', 'ShapePastDue', 'ShapeAuth', 'ShapeNora', 'ShapeIncludedWithCoach'];
const withFlags = (flags, fn) => {
  const prev = Object.fromEntries(FLAGS.map((k) => [k, W[k]]));
  Object.assign(W, flags);
  try { return fn(); } finally { Object.assign(W, prev); }
};

const PAST_DUE = 'Your payment didn’t go through. Update your card to get Shape Radio and Nora back.';

test('a 402 says which lock it is: payment_past_due is past due, membership_required (or none) is the upgrade', () => {
  assert.equal(gate.bsPaidLockOf('payment_past_due'), 'pastDue');
  assert.equal(gate.bsPaidLockOf('membership_required'), 'free');
  assert.equal(gate.bsPaidLockOf('something_else'), null);
  assert.equal(gate.bsPaidLockFrom(402, { code: 'payment_past_due' }), 'pastDue');
  assert.equal(gate.bsPaidLockFrom(402, { code: 'membership_required' }), 'free');
  assert.equal(gate.bsPaidLockFrom(402, null), 'free', 'a paid refusal with no code is still the upgrade');
  assert.equal(gate.bsPaidLockFrom(401, { code: 'membership_required' }), null, 'signed out is not a membership question');
  assert.equal(gate.bsPaidLockFrom(200, {}), null);
  // The shell's flags: only an explicit false locks, so a member is never locked on a cold launch.
  assert.equal(gate.bsPaidLockNow({ paid: undefined, pastDue: false }), null);
  assert.equal(gate.bsPaidLockNow({ paid: true, pastDue: true }), null);
  assert.equal(gate.bsPaidLockNow({ paid: false, pastDue: false }), 'free');
  assert.equal(gate.bsPaidLockNow({ paid: false, pastDue: true }), 'pastDue');
  assert.equal(withFlags({ ShapePaid: false, ShapePastDue: true }, () => LOCK.bsPaidLockRead()), 'pastDue');
  assert.equal(withFlags({ ShapePaid: undefined, ShapePastDue: undefined }, () => LOCK.bsPaidLockRead()), null);
});

test('a free account and a member are both in the app; ShapeCanChat is true for a free account', () => {
  const ready = { isApprovedCoach: false, authReady: true, signedIn: true };
  assert.equal(gate.bsAccountGate({ ...ready, membership: { loading: false, active: false } }).allowed, true);
  assert.equal(gate.bsAccountGate({ ...ready, membership: { loading: false, active: false, pastDue: true } }).allowed, true);
  const free = gate.bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: { loading: false, active: false } });
  assert.equal(free.canChat, true, 'messaging a coach is free');
  assert.equal(free.paid, false);
  // The shell: a session with no account meets the welcome; every account falls through to <App>.
  const app = MAIN.slice(MAIN.indexOf("{stage === 'app' && ("), MAIN.indexOf('{noraHere && noraSheet'));
  assert.ok(app.indexOf(') : !accountAllowed ? (') > 0 && app.indexOf(') : !accountAllowed ? (') < app.indexOf('<BSWelcome'), 'only a session with no account meets the welcome');
  assert.equal((app.match(/<App onLogout=/g) || []).length, 1, 'one app, for every account: no preview copy of it');
  assert.doesNotMatch(app, /memberAllowed|BSPaywall/, 'no membership wall in front of the app');
  // The DOB check, the time-zone question and the same-day skip key on the account, not the membership.
  assert.match(MAIN, /if \(!authReady \|\| !authUserId \|\| !accountAllowed\) return undefined;/);
  assert.match(MAIN, /return bsLaunchRoute\(\{ stamp, uid, todayLocal: bsLocalDay\(\), signedIn: !!uid \}\);/);
  assert.doesNotMatch(MAIN, /memberCached/);
});

test('signed out: the welcome offers Create account and Sign in, says what membership adds, and has no Preview', () => {
  // Main's BSWelcome hands the price and the two doors to the first-run screen that draws it.
  const welcome = MAIN.slice(MAIN.indexOf('function BSWelcome('), MAIN.indexOf('// ⚠ PHONE NOTIFICATIONS ARE ASKED'));
  assert.match(welcome, /<BSWelcomeScreen price=\{BS_PRICE\} onCreate=\{onCreate\} onSignIn=\{onSignIn\} \/>/);
  assert.match(WELCOME_SCREEN, /<button type="button" data-auth-create="" onClick=\{onCreate\}[^>]*>\{tr\('fr\.welcome\.create'\)\}<\/button>/);
  assert.match(WELCOME_SCREEN, /<button type="button" data-auth-signin="" onClick=\{onSignIn\}[^>]*>\{tr\('fr\.signIn'\)\}<\/button>/);
  assert.match(WELCOME_SCREEN, /\{tr\('welcome\.membership', \{ price \}\)\}/);
  for (const src of [welcome, WELCOME_SCREEN]) assert.doesNotMatch(src, /preview|Preview|onJoin|startCheckout/, 'no Preview, and no checkout before there is an account');
  assert.match(EN.onboarding['welcome.membership'], /Nora/);
  assert.match(EN.onboarding['welcome.membership'], /Shape Radio/);
  assert.match(EN.onboarding['welcome.membership'], /\{price\}/);
  // Gone everywhere in the app: the preview modes, the banner, the composer's door back to the paywall.
  for (const f of readdirSync(join(ROOT, 'mobile-app/src/broadsheet')).filter((n) => /\.jsx?$/.test(n))) {
    const src = read(`mobile-app/src/broadsheet/${f}`);
    assert.doesNotMatch(src, /shape:exitPreview|BSPreviewBanner|previewMode|browseMode|onBrowse=/, `${f} still carries the signed-out preview`);
  }
  // The preview-only words are out of every catalog, and the welcome's are in every one.
  for (const loc of LOCALES) {
    const on = cat(loc, 'onboarding');
    for (const k of ['paywall.preview', 'paywall.createJoin', 'preview.title', 'preview.body', 'preview.join', 'preview.dismiss']) assert.ok(!(k in on), `${loc}: ${k} is read by nothing now`);
    for (const k of ['fr.welcome.titlePre', 'fr.welcome.titleAccent', 'fr.welcome.sub', 'fr.welcome.create', 'fr.signIn', 'welcome.membership']) assert.ok(String(on[k] || '').trim(), `${loc}: ${k}`);
    assert.match(on['welcome.membership'], /\{price\}/, `${loc}: the price is interpolated, never baked in`);
  }
  // A new account is a free account: creating one goes into the app, not to the checkout.
  const login = MAIN.slice(MAIN.indexOf('function BSLogin('), MAIN.indexOf('function BSWelcome('));
  assert.doesNotMatch(login, /startCheckout|bsmStartCheckout/);
});

test('the lock: a free account is told what membership adds and offered Join; a past-due one the card line and Update your card', () => {
  const free = text(React.createElement(LOCK.BSPaidLock, { lock: 'free', feature: 'radio' }));
  assert.match(free, /Members · \$5\/mo/);
  assert.match(free, /Shape Radio comes with membership\./);
  assert.match(free, /\$5 a month adds Nora, Shape Radio and the AI helpers\./);
  assert.match(free, /Join · \$5\/mo →/);
  assert.doesNotMatch(free, /Update your card|didn’t go through/);
  const due = text(React.createElement(LOCK.BSPaidLock, { lock: 'pastDue', feature: 'radio' }));
  assert.ok(due.includes(PAST_DUE), due);
  assert.match(due, /Payment didn’t go through/);
  assert.match(due, /Update your card →/);
  assert.doesNotMatch(due, /Join|comes with membership/, 'a past-due member is never shown the Join prompt');
  // Every feature has its own line, and a compact lock is one line and the button.
  for (const f of ['radio', 'voice', 'actions', 'readout', 'cookVoice', 'recipeImport', 'draft', 'store', 'leaderboard']) {
    const line = LOCK.bsPaidFeatureLine(t, f);
    assert.ok(line && !/^common:/.test(line) && line !== EN.common['paid.feature.any'], `${f} has no line of its own`);
    assert.ok(text(React.createElement(LOCK.BSPaidLock, { lock: 'free', feature: f, compact: true })).includes(line), f);
  }
  assert.equal(LOCK.bsPaidFeatureLine(t, 'leaderboard'), 'See your exact rank and the full board with membership.');
  assert.equal(html(React.createElement(LOCK.BSPaidLock, { lock: null, feature: 'radio' })), '', 'not locked: nothing');
  // The button is a 44px target, and the glyph is an SVG, not an emoji.
  assert.match(html(React.createElement(LOCK.BSPaidLock, { lock: 'free', feature: 'store', compact: true })), /min-height:44px/);
  assert.doesNotMatch(read('mobile-app/src/broadsheet/BSPaidLock.jsx'), /🔒/);
});

test('the lock\'s action: Update your card opens the billing portal; Join the one checkout door, and the portal for a past-due 409', async () => {
  const calls = [];
  let checkout = { ok: true };
  const prev = { api: W.ShapeApi, mem: W.ShapeMembershipApi, auth: W.ShapeAuth };
  W.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  W.ShapeApi = { fetch: async (path, init) => { calls.push({ path, body: init && init.body }); return { ok: true, json: async () => ({ url: 'https://billing.stripe.test/s' }) }; } };
  W.ShapeMembershipApi = { startCheckout: async () => { calls.push({ path: 'checkout' }); return checkout; } };
  try {
    assert.deepEqual(await LOCK.bsPaidGo('pastDue'), { ok: true });
    assert.deepEqual(calls.shift(), { path: '/api/stripe/billing-portal', body: JSON.stringify({ returnPath: '/m/' }) });
    assert.equal(W.location.href, 'https://billing.stripe.test/s');
    assert.deepEqual(await LOCK.bsPaidGo('free'), { ok: true });
    assert.deepEqual(calls.splice(0), [{ path: 'checkout' }]);
    // The server refuses a past-due account a second membership: the card is updated instead.
    checkout = { ok: false, status: 409, code: 'payment_past_due' };
    assert.deepEqual(await LOCK.bsPaidGo('free'), { ok: true });
    assert.deepEqual(calls.map((c) => c.path), ['checkout', '/api/stripe/billing-portal']);
    calls.length = 0;
    checkout = { ok: false, status: 409, code: 'checkout_in_progress' };
    assert.deepEqual(await LOCK.bsPaidJoin(), { ok: false, code: 'checkout_in_progress' });
  } finally { W.ShapeApi = prev.api; W.ShapeMembershipApi = prev.mem; W.ShapeAuth = prev.auth; }
  // The app's other doors say the same: Settings' plan card and the shell's checkout helper.
  assert.match(CLIENT, /if \(r\.code === 'payment_past_due'\) \{ if \(!\(await bsOpenBillingPortal\(\)\)\) fail\(\); return; \}/);
});

test('Home: a past-due account gets one row with Update your card, put away for the day; a free account gets none', () => {
  const day = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const auth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  store.clear();
  const shown = withFlags({ ShapePaid: false, ShapePastDue: true, ShapeAuth: auth }, () => text(React.createElement(LOCK.BSPastDueNotice)));
  assert.ok(shown.includes(PAST_DUE));
  assert.match(shown, /Update your card →/);
  assert.equal(withFlags({ ShapePaid: false, ShapePastDue: false, ShapeAuth: auth }, () => html(React.createElement(LOCK.BSPastDueNotice))), '', 'a free account has nothing to update');
  assert.equal(withFlags({ ShapePaid: true, ShapePastDue: false, ShapeAuth: auth }, () => html(React.createElement(LOCK.BSPastDueNotice))), '');
  store.set('shape.pastDueSeen', `u1:${day}`);
  assert.equal(withFlags({ ShapePaid: false, ShapePastDue: true, ShapeAuth: auth }, () => html(React.createElement(LOCK.BSPastDueNotice))), '', 'put away for today');
  store.set('shape.pastDueSeen', 'u1:2000-01-01');
  assert.notEqual(withFlags({ ShapePaid: false, ShapePastDue: true, ShapeAuth: auth }, () => html(React.createElement(LOCK.BSPastDueNotice))), '', 'back the next day');
  store.set('shape.pastDueSeen', `u2:${day}`);
  assert.notEqual(withFlags({ ShapePaid: false, ShapePastDue: true, ShapeAuth: auth }, () => html(React.createElement(LOCK.BSPastDueNotice))), '', 'another account\'s dismissal is not this one\'s');
  store.clear();
  assert.equal(gate.bsPastDueNoticeShown({ pastDue: true, uid: 'u1', day: '2026-11-10', stamp: 'u1:2026-11-10' }), false);
  assert.equal(gate.bsPastDueNoticeShown({ pastDue: true, uid: 'u1', day: '2026-11-11', stamp: 'u1:2026-11-10' }), true);
  // Home draws it as a row under the score line (Home adds no plates).
  const home = CLIENT.slice(CLIENT.indexOf('function BSClientHome('), CLIENT.indexOf('<BSHomeDeck radio='));
  assert.match(home, /<BSHomeScoreQuote [^\n]*\/>\n[\s\S]{0,300}<BSPastDueNotice \/>/);
});

test('Settings: the plan card reads Free account and Join, or Payment didn’t go through and Update your card; Account reads Free / Member / Past due', () => {
  const card = CLIENT.slice(CLIENT.indexOf('const planCard = isCoachRole ? null : (() => {'), CLIENT.indexOf('// ── THE SIX DOORS ──'));
  assert.match(card, /const planPastDue = !hasSub && !coachIncluded && !!\(plan && plan\.pastDue === true\);/);
  assert.match(card, /planPastDue \? tr\('settings:plan\.pastDue'/);
  assert.match(card, /tr\('settings:plan\.free', \{ defaultValue: 'Free account' \}\)/);
  assert.match(card, /planPastDue \? tr\('common:paid\.updateCard'/);
  assert.match(card, /: tr\('onboarding:paywall\.join', \{ price: '\$5'/, 'a free account is offered Join');
  assert.match(card, /onClick=\{\(hasSub \|\| planPastDue\) \? openBillingPortal : openUpgradeCheckout\}/, 'past due goes to the portal, never a second checkout');
  assert.match(card, /tr\('common:paid\.pastDue'/);
  const meta = CLIENT.slice(CLIENT.indexOf("title: 'Account',"), CLIENT.indexOf("title: 'Health integrations',"));
  assert.match(meta, /\(plan\.active \|\| coachIncluded\)\s*\? tr\('settings:account\.metaMember'[\s\S]*?plan\.pastDue === true\s*\? tr\('settings:account\.metaPastDue'[\s\S]*?: tr\('settings:account\.metaFree'/);
  // Shape Radio's rows say when it is locked.
  assert.equal((CLIENT.match(/\{ l: 'Shape Radio', r: radioRowMeta, action: \(\) => setShowRadio\(true\) \}/g) || []).length, 2);
});

test('Radio, the Store, the AI helpers and the full board read ShapePaid; assistant Nora reads ShapeNora', () => {
  // Radio: the example signal, the first-launch ask, Home's console and the Radio page's key.
  assert.match(RADIO, /function useBSRadioPreview\(\) \{\n\s+const \[v, setV\] = useStateBR\(\(\) => \(typeof window !== 'undefined' \? window\.ShapePaid === false : false\)\);/);
  assert.match(RADIO, /if \(!radioPaidYes\) return undefined; \/\/ not a known member/, 'a free account is never invited to listen');
  assert.match(RADIO, /if \(!r\.showPrompt \|\| lock\) return null;/);
  assert.match(RADIO, /const lock = bsRadioSignedIn\(\) \? paidLock : null;/);
  assert.match(RADIO, /\{lockNow \? <BSPaidLock lock=\{lockNow\} feature="radio"/);
  // Cook Mode's voice is assistant Nora's, a paid feature.
  assert.match(CLIENT, /function useBSCookVoiceGate\(\) \{\n\s+const signedIn = useBSCanChat\(\);\n\s+const lock = useBSNoraLock\(\);\n\s+return \{ voiceMember: signedIn && !lock, lock: signedIn \? lock : null \};/);
  assert.equal((CLIENT.match(/const \{ voiceMember, lock: voiceLock \} = useBSCookVoiceGate\(\);/g) || []).length, 3, 'one dish, the board and the prep session');
  assert.doesNotMatch(CLIENT, /const voiceMember = useBSCanChat\(\);/);
  // Nora's voice (Talk, Listen, auto-speak and dictation) and her action cards.
  const sheet = CLIENT.slice(CLIENT.indexOf('function BSNoraSheet('), CLIENT.indexOf('// Chat tab for ALL roles'));
  assert.match(sheet, /const voiceLock = useBSNoraLock\(\);/);
  assert.match(sheet, /if \(bsNoraLockRead\(\)\) return; \/\/ auto-speak/);
  const composer = CLIENT.slice(CLIENT.indexOf('function BSMessageComposer('), CLIENT.indexOf('// When pinned, render through a portal'));
  assert.match(composer, /const noraLock = useBSNoraLock\(\);\n\s+const paidLock = voice \? noraLock : null;/);
  assert.match(composer, /else if \(r\.status === 402\) \{ setVoiceErr\(null\); setVoiceLock\(bsNoraLockFromCode\(r\.code\)\); bsPaidRefused\(\); \}/);
  assert.doesNotMatch(composer, /Sign in to use voice — or type your question\.'\);\n[^\n]*402/, 'a signed-in free account is not told to sign in');
  const card = CLIENT.slice(CLIENT.indexOf('function BSNoraProposal('), CLIENT.indexOf('// Whether this session can send messages'));
  assert.match(card, /const flagLock = useBSNoraLock\(\);/);
  assert.match(card, /if \(flagLock\) \{ setLock\(flagLock\); return; \}/);
  assert.match(card, /\{lock && <BSPaidLock lock=\{lock\} feature="actions" compact/);
  // The weekly readout: a locked teaser, never nothing.
  const readout = CLIENT.slice(CLIENT.indexOf('function BSWeeklyReadoutCard('), CLIENT.indexOf('function bsProgressWeight('));
  assert.match(readout, /<BSPaidLock lock=\{readoutLock\} feature="readout" compact \/>/);
  assert.match(readout, /const flagLock = useBSNoraLock\(\);/);
  // The AI helpers and the Store read ShapePaid.
  const recipeSheet = CLIENT.slice(CLIENT.indexOf('function BSMyRecipeSheet('), CLIENT.indexOf('function BSMyRecipeSheet(') + 2500);
  assert.match(recipeSheet, /const flagLock = useBSPaidLock\(\);/);
  const builder = CLIENT.slice(CLIENT.indexOf('function BSWorkoutBuilder('), CLIENT.indexOf('function BSWorkoutBuilder(') + 4000);
  assert.match(builder, /const flagLock = useBSPaidLock\(\);/);
  // The AI helpers: recipe import (text / photo) and the program draft; hand-built stays free.
  const recipe = CLIENT.slice(CLIENT.indexOf('function BSMyRecipeSheet('), CLIENT.indexOf('const editIng = (i, key, val) =>'));
  assert.match(recipe, /const r = \(api && !importLock\) \? await api\(paste\) : null;/, 'a free account\'s paste is split on the phone');
  assert.match(CLIENT, /\{importLock \? <BSPaidLock lock=\{importLock\} feature="recipeImport" compact/);
  assert.match(CLIENT, /\{draftLock && <BSPaidLock lock=\{draftLock\} feature="draft"/);
  assert.match(CLIENT, /\{!draftLock && <button onClick=\{runDraft\}/);
  // The Store.
  assert.match(CLIENT, /const purchasesLocked = !!storeLock;/);
  assert.match(CLIENT, /\{storeLock && <BSPaidLock lock=\{storeLock\} feature="store"/);
  assert.doesNotMatch(CLIENT, /useBSMembership/);
});

test('messaging is free: the composer locks only a session with no account, and asks it to sign in', () => {
  assert.match(CLIENT, /function useBSCanChat\(\) \{\n\s+const \[v, setV\] = useStateBSC\(\(\) => \(typeof window !== 'undefined' \? window\.ShapeCanChat !== false : true\)\);/);
  assert.match(CLIENT, /const lockedField = <BSSignInToSend t=\{t\} pinned=\{pinned\} square=\{mag\} arrow=\{mag \|\| tray\} \/>;/);
  assert.doesNotMatch(CLIENT, /Join Shape to send messages/);
  const signIn = text(React.createElement(LOCK.BSSignInToSend, { t: THEME }));
  assert.equal(signIn, 'Sign in to send messages');
  for (const loc of LOCALES) assert.ok(String(cat(loc, 'feed')['composer.signInToSend'] || '').trim(), `${loc}: composer.signInToSend`);
});

test('the backend carries a paid refusal\'s lock to every caller', () => {
  assert.match(BACKEND, /if \(res\.status === 402\) failed\.lock = code === 'payment_past_due' \? 'pastDue' : 'free';/, 'speak');
  assert.match(BACKEND, /\.\.\.\(payload && typeof payload\.code === 'string' \? \{ code: payload\.code \} : \{\}\),/, 'transcribe (only when there is a code)');
  assert.match(BACKEND, /if \(res\.status === 402\) \{ _draftLock = d && d\.code === 'payment_past_due' \? 'pastDue' : 'free'; return null; \}/, 'the program draft');
  assert.match(BACKEND, /window\.ShapeTrainingAI = \{ draft: draftTrainingProgram, get lastLock\(\) \{ return _draftLock; \} \};/);
  assert.match(BACKEND, /return \{ locked: b && b\.code === 'payment_past_due' \? 'pastDue' : 'free' \};/, 'the readout');
  assert.match(BACKEND, /if \(res\.status === 402\) return \{ ok: false, draft: null, reason: payload && payload\.code === 'payment_past_due' \? 'payment_past_due' : 'membership_required' \};/, 'recipe import');
  assert.equal((BACKEND.match(/if \(!res\.ok\) throw bsStoreError\(res, data, '/g) || []).length, 3, 'the Store\'s three writes');
  assert.equal((BACKEND.match(/if \(!res\.ok\) throw bsNoraActionError\(res, payload, /g) || []).length, 2, 'Confirm and Undo');
  assert.match(BACKEND, /pastDue: d\.member !== true && d\.pastDue === true,\n\s+\/\/[^\n]*\n\s+nora: d\.member === true \|\| d\.nora === true,\n\s+\/\/[^\n]*\n\s+includedWithCoach: d\.member === true && d\.includedWithCoach === true,/);
  assert.doesNotMatch(BACKEND, /noraPreview/, 'the membership read carries no free week');
});

test('the leaderboards (like Strava): a free account is ranked; the full board, the exact rank and its history are paid', () => {
  const lb = read('mobile-app/src/broadsheet/BSLeaderboard.jsx');
  assert.match(lb, /const fullBoard = coach \|\| d\.fullBoard !== false;/, 'a board from before the field reads as full');
  assert.match(lb, /d\.locked === 'past_due' \? 'pastDue'\n\s+: d\.locked === 'free_account' \? 'free'/);
  // Outside the top 10: their points, and the lock where the rank would be.
  assert.match(lb, /const outsideTop = !fullBoard && !!me && \(me\.rank === null \|\| me\.rank === undefined\) && me\.inTop !== true && \(Number\(me\.points\) \|\| 0\) > 0;/);
  assert.match(lb, /\{shown\(me\)\} <span style=\{mono\(8\.5, t\.INK50\)\}>\{tr\('score:board\.pts'/);
  assert.match(lb, /<BSPaidLock lock=\{boardLock\} feature="leaderboard" compact style=\{\{ marginTop: 8 \}\} \/>/);
  // No movement on the top-10 board: rank history is paid.
  assert.match(lb, /const moved = fullBoard && !climb && me\.moved \?/);
  // A free account is ranked, so its privacy switches apply: nothing hides or disables them.
  assert.doesNotMatch(lb, /notRanked|off=\{|switchesMembers/);
  assert.doesNotMatch(CLIENT, /switchesMembers/);
  for (const loc of LOCALES) assert.ok(!('board.switchesMembers' in cat(loc, 'score')), `${loc}: board.switchesMembers is read by nothing now`);
  assert.equal(EN.common['paid.feature.leaderboard'], 'See your exact rank and the full board with membership.');
});

test('assistant Nora is paid only: a free account meets her lock, and nothing of a free week is left', () => {
  // The shell's flags: a member always has her; a free account never does (the server's `nora` is
  // `member` now, and a `noraPreview` it may still send is read by nothing).
  const m = (o) => ({ loading: false, active: false, ...o });
  const week = { startedAt: '2026-11-08T12:00:00Z', endsAt: '2026-11-15T12:00:00Z', active: true };
  assert.equal(gate.bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ active: true }) }).nora, true, 'a server with no field: a member has her');
  assert.deepEqual(gate.bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ nora: false }) }), { canChat: true, paid: false, pastDue: false, nora: false }, 'a free account: no Nora');
  assert.deepEqual(gate.bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({ nora: false, noraPreview: week }) }), { canChat: true, paid: false, pastDue: false, nora: false }, 'a stray free week gives nothing');
  assert.equal(gate.bsPaidFlags({ signedIn: true, isApprovedCoach: false, membership: m({}) }).nora, undefined, 'no lookup heard: unknown, which never locks (Codex P2 on #2675)');
  // Her lock: Join for a free account, Update your card for a past-due one; unknown never locks.
  assert.equal(gate.bsNoraLockNow({ nora: true }), null);
  assert.equal(gate.bsNoraLockNow({ nora: undefined }), null, 'unknown: never locked');
  assert.equal(gate.bsNoraLockNow({ nora: false }), 'free');
  assert.equal(gate.bsNoraLockNow({ nora: false, pastDue: true }), 'pastDue');
  assert.equal(gate.bsNoraLockNow({ nora: false, noraPreview: { ...week, active: false } }), 'free', 'no ended-week lock');
  assert.equal(gate.bsNoraLockOf('membership_required'), 'free');
  assert.equal(gate.bsNoraLockOf('payment_past_due'), 'pastDue');
  assert.equal(gate.bsNoraLockOf('something_else'), null);
  assert.equal(withFlags({ ShapeNora: false, ShapePastDue: false }, () => LOCK.bsNoraLockRead()), 'free');
  assert.equal(withFlags({ ShapeNora: false, ShapePastDue: true }, () => LOCK.bsNoraLockRead()), 'pastDue');
  assert.equal(withFlags({ ShapeNora: undefined, ShapePastDue: false }, () => LOCK.bsNoraLockRead()), null);
  assert.equal(withFlags({ ShapeNora: true, ShapePastDue: false }, () => LOCK.bsNoraLockRead()), null);
  assert.equal(LOCK.bsNoraLockFromCode('membership_required'), 'free');
  assert.equal(LOCK.bsNoraLockFromCode('payment_past_due'), 'pastDue');
  assert.equal(LOCK.bsNoraLockFromCode(undefined), 'free', 'a 402 with no code is the upgrade');
  // A free account's lock on her voice is the plain upgrade, with Join.
  const free = text(React.createElement(LOCK.BSPaidLock, { lock: 'free', feature: 'voice' }));
  assert.match(free, /Talking to Nora comes with membership\./);
  assert.match(free, /Join · \$5\/mo →/);
  assert.doesNotMatch(free, /free week/i);
  assert.equal(LOCK.bsPaidSentence(t, 'free', 'cookVoice'), 'Nora reading the steps aloud comes with membership. $5 a month adds Nora, Shape Radio and the AI helpers.');
  // The free week's helpers, notice, line and flag are gone.
  for (const k of ['bsNoraPreviewOf', 'bsNoraDaysLeft', 'bsNoraPreviewStamp', 'bsNoraPreviewNoticeShown']) assert.ok(!(k in gate), `memberGate.mjs still exports ${k}`);
  for (const k of ['BSNoraPreviewNotice', 'useBSNoraPreview', 'bsNoraPreviewRead', 'bsNoraDaysLine', 'bsNoraEndedLine']) assert.ok(!(k in LOCK), `BSPaidLock.jsx still exports ${k}`);
  const APP = [MAIN, CLIENT, BACKEND, read('mobile-app/src/broadsheet/BSPaidLock.jsx'), read('mobile-app/src/broadsheet/BSNoraTalk.jsx'), read('mobile-app/src/services/memberGate.mjs')].join('\n');
  assert.doesNotMatch(APP, /noraPreview|NoraPreview|noraWeek|noraEnded|NoraDays|noraDaysLeft|free week/i);
  assert.match(MAIN, /window\.ShapeNora = paidFlags\.nora;\n\s+window\.ShapeIncludedWithCoach = includedWithCoach;/);
  for (const loc of LOCALES) {
    const stale = Object.keys(cat(loc, 'common')).filter((k) => k === 'paid.noraEnded' || k.startsWith('paid.noraWeek.'));
    assert.deepEqual(stale, [], `${loc}: the free week's copy is gone`);
  }
});

test('Join picks Monthly or Annual from the real plans, and the plan reaches the checkout', async () => {
  assert.equal(LOCK.bsPlanMoney(500), '$5');
  assert.equal(LOCK.bsPlanMoney(4800), '$48');
  assert.equal(LOCK.bsPlanMoney(4999), '$49.99');
  assert.equal(LOCK.bsPlanSavingPct({ monthly: { priceCents: 500 }, annual: { priceCents: 4800 } }), 20);
  assert.equal(LOCK.bsPlanSavingPct({ monthly: { priceCents: 500 }, annual: null }), null);
  assert.equal(LOCK.bsPlanSavingPct({ monthly: { priceCents: 500 }, annual: { priceCents: 6000 } }), null, 'no saving, no badge');
  assert.equal(LOCK.bsPlanPriceLabel(t, 4800, 'year'), '$48 / year');
  assert.equal(LOCK.bsPlanPriceLabel(t, 500, 'month'), '$5 / month');
  // With no picker mounted (or monthly alone), Join is monthly at once.
  const prev = { host: W.__bsPlanPicker, api: W.ShapeMembershipApi, auth: W.ShapeAuth };
  W.__bsPlanPicker = null;
  assert.equal(await LOCK.bsPickPlan(), 'monthly');
  const asked = [];
  W.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  W.ShapeMembershipApi = { startCheckout: async (o) => { asked.push(o); return { ok: true }; } };
  try {
    W.__bsPlanPicker = (resolve) => resolve('annual');
    assert.deepEqual(await LOCK.bsPaidJoin(), { ok: true });
    assert.deepEqual(asked, [{ plan: 'annual' }]);
    W.__bsPlanPicker = (resolve) => resolve(null);
    assert.deepEqual(await LOCK.bsPaidJoin(), { ok: false, cancelled: true }, 'closing the picker starts nothing');
    assert.equal(asked.length, 1);
    // A membership that comes with coaching is a member already: nothing is sold.
    W.ShapeMembershipApi = { startCheckout: async () => ({ ok: false, status: 409, code: 'already_member', includedWithCoach: true }) };
    W.__bsPlanPicker = (resolve) => resolve('monthly');
    assert.deepEqual(await LOCK.bsPaidJoin(), { ok: true });
  } finally { W.__bsPlanPicker = prev.host; W.ShapeMembershipApi = prev.api; W.ShapeAuth = prev.auth; }
  // The backend: the plan rides the checkout, and the plans are read from their route.
  assert.match(BACKEND, /body: JSON\.stringify\(\{ returnTo: back, cancelPath: back, plan: plan === 'annual' \? 'annual' : 'monthly' \}\),/);
  assert.match(BACKEND, /const res = await shapeApiFetch\('\/api\/membership\/plans', \{ cache: 'no-store' \}\);/);
  assert.match(BACKEND, /window\.ShapeMembershipApi = \{ check: checkMembership, lookup: lookupMembership, startCheckout: startMembershipCheckout, plans: membershipPlans \};/);
  // The picker is portaled into the phone and mounted by the shell; Settings' Join uses it too.
  const lockSrc = read('mobile-app/src/broadsheet/BSPaidLock.jsx');
  assert.match(lockSrc, /document\.getElementById\('bs-phone-surface'\)[\s\S]{0,80}createPortal\(sheet, hostEl\)/);
  assert.match(MAIN, /<BSPlanPickerHost \/>/);
  assert.match(CLIENT, /const plan = await bsPickPlan\(\);\n\s+if \(!plan\) return;\n\s+const r = await api\.startCheckout\(\{ plan \}\);/);
  // Settings prints the interval: the subscription carries none, so annual is the plan whose price it
  // is (when that is not also the monthly price), as the website reads it.
  assert.match(CLIENT, /const interval = annualCents != null && annualCents !== monthlyCents && cents === annualCents \? 'year' : 'month';/);
  assert.doesNotMatch(CLIENT, /plan\.interval/);
  assert.match(CLIENT, /const priceLabel = bsPlanPriceLabel\(tr, cents, interval\) \|\| /);
  assert.match(CLIENT, /tr\('settings:plan\.renewsYearly'/);
});

test('membership with coaching: Settings says so, offers no Join, and a member with their own plan may cancel it', () => {
  const card = CLIENT.slice(CLIENT.indexOf('const planCard = isCoachRole ? null : (() => {'), CLIENT.indexOf('// ── THE SIX DOORS ──'));
  assert.match(card, /const viaCoach = coachIncluded && !hasSub;/);
  assert.match(card, /viaCoach \? tr\('settings:plan\.includedCoach'/);
  assert.match(card, /tr\('settings:plan\.includedCoachBody'/);
  assert.match(card, /\{viaCoach \? null : <button type="button" data-settings-plan-action=/, 'no Join for an account whose coaching includes membership');
  assert.match(card, /\{hasSub && coachIncluded \? <div data-settings-plan-coach-own=""[^>]*>\{tr\('settings:plan\.includedCoachOwn'/);
  assert.match(CLIENT, /const coachIncluded = useBSIncludedWithCoach\(\);/);
  assert.match(MAIN, /window\.ShapeIncludedWithCoach = includedWithCoach;/);
  // A member by coaching has the paid features, so no lock (and no Join) reaches them.
  assert.equal(gate.bsPaidLockNow({ paid: true, pastDue: false }), null);
});

test('the weekly recap is free and shareable, shows only real figures, and lives on Progress and on Home on Mondays', async () => {
  const REC = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSWeekRecap.jsx'), { registry: new Map([['react', React]]) });
  // mealDays is days a meal was logged (never a count of meals); daysActive days with a workout or a log.
  const d = { weekStart: '2026-11-02', weekEnd: '2026-11-08', workouts: 4, activeMinutes: null, mealDays: 0, daysActive: 5, points: 1240, streak: 6 };
  const figs = REC.bsWeekRecapFigures(t, d);
  assert.deepEqual(figs.map(([k]) => k), ['workouts', 'daysActive', 'points', 'streak'], 'a null or 0 figure is left out');
  assert.deepEqual(REC.bsWeekRecapFigures(t, { ...d, mealDays: 3 }).map(([, label]) => label).slice(1, 3), ['Meal days', 'Days active']);
  const model = REC.bsWeekRecapShareModel(t, d, { who: 'Ana P.', tierLine: 'Ridge', locale: 'en-US' });
  assert.equal(model.title, 'Your week');
  assert.deepEqual(model.heroStat, ['Workouts', '4']);
  assert.deepEqual(model.stats, [['Days active', '5'], ['Points', '1,240'], ['Day streak', '6']]);
  assert.equal(model.dateLine, 'Nov 2 – Nov 8');
  assert.equal(REC.bsWeekRecapShareModel(t, { ...d, workouts: 0, daysActive: 0, points: 0, streak: 0 }), null, 'nothing to share: no image');
  const noWorkouts = REC.bsWeekRecapShareModel(t, { ...d, workouts: 0 }, { locale: 'en-US' });
  assert.equal(noWorkouts.heroStat[0], 'Days active', 'the first real figure leads when there were no workouts');
  assert.match(BACKEND, /mealDays: n\(d\.mealDays\),\n\s+daysActive: n\(d\.daysActive\)/, 'the route\'s own field names');
  assert.doesNotMatch(BACKEND + read('mobile-app/src/broadsheet/BSWeekRecap.jsx'), /mealsLogged|daysLogged/);
  // Monday in the account's zone.
  const prevZone = W.ShapeTimezone;
  assert.equal(typeof REC.bsIsRecapDay(Date.parse('2026-11-09T15:00:00Z')), 'boolean');
  W.ShapeTimezone = prevZone;
  // The backend reads the route; Progress draws the card, Home the row on Mondays.
  assert.match(BACKEND, /const res = await shapeApiFetch\(`\/api\/client\/weekly-recap\?week=\$\{w\}`, \{ cache: 'no-store' \}\);/);
  assert.match(CLIENT, /\{signedIn \? <BSWeekRecap who=\{bsMyName\(\)\} \/> : null\}\n\s+<BSWeeklyReadoutCard isSelf=\{signedIn\} \/>/);
  assert.match(CLIENT, /\{bsHomeSignedIn && bsIsRecapDay\(\) \? <BSWeekRecap who=\{bsMyName\(\)\} variant="row" \/> : null\}/);
  // shareCard.mjs is the website's too: imported, not changed.
  const recSrc = read('mobile-app/src/broadsheet/BSWeekRecap.jsx');
  assert.match(recSrc, /import \{ bsShareCardModel, bsShareCardImage \} from '\.\.\/\.\.\/\.\.\/public\/newdesign\/shareCard\.mjs';/);
  for (const loc of LOCALES) {
    const c = cat(loc, 'common');
    for (const k of ['recap.title', 'recap.workouts', 'recap.activeMinutes', 'recap.mealDays', 'recap.daysActive', 'recap.points', 'recap.streak', 'recap.share', 'recap.empty', 'recap.shareFailed']) assert.ok(String(c[k] || '').trim(), `${loc}: ${k}`);
  }
});

test('every new lock key is in all 13 catalogs, with its placeholders', () => {
  assert.equal(LOCALES.length, 13);
  const KEYS = {
    common: ['paid.eyebrow', 'paid.eyebrowPastDue', 'paid.pastDue', 'paid.freeBody', 'paid.updateCard', 'paid.opening', 'paid.failed', 'paid.notNow', 'paid.hideToday', 'paid.short',
      'paid.feature.radio', 'paid.feature.voice', 'paid.feature.actions', 'paid.feature.readout', 'paid.feature.cookVoice', 'paid.feature.recipeImport', 'paid.feature.draft', 'paid.feature.store', 'paid.feature.leaderboard', 'paid.feature.any',
      'paid.plans.eyebrow', 'paid.plans.title', 'paid.plans.body', 'paid.plans.monthly', 'paid.plans.annual', 'paid.plans.perMonth', 'paid.plans.perYear', 'paid.plans.save',
      'recap.title', 'recap.lastWeek', 'recap.workouts', 'recap.activeMinutes', 'recap.mealDays', 'recap.daysActive', 'recap.points', 'recap.streak', 'recap.share', 'recap.sharing', 'recap.shareFailed', 'recap.empty'],
    settings: ['plan.free', 'plan.pastDue', 'plan.subFree', 'plan.subPaid', 'account.metaPastDue', 'plan.renewsYearly', 'plan.includedCoach', 'plan.includedCoachBody', 'plan.includedCoachOwn'],
  };
  for (const loc of LOCALES) {
    for (const [ns, keys] of Object.entries(KEYS)) {
      const c = cat(loc, ns);
      const en = cat('en', ns);
      for (const k of keys) {
        assert.ok(String(c[k] || '').trim(), `${loc}/${ns}: ${k}`);
        for (const ph of (en[k].match(/\{\w+\}/g) || [])) assert.ok(c[k].includes(ph), `${loc}/${ns}: ${k} lost ${ph}`);
      }
    }
    // The membership copy it replaces is gone with the screens that read it.
    for (const k of ['plan.inactive', 'plan.subActive', 'plan.subInactive', 'plan.activate', 'plan.join']) assert.ok(!(k in cat(loc, 'settings')), `${loc}: settings ${k}`);
  }
  // The owner's own sentence, verbatim in English.
  assert.equal(EN.common['paid.pastDue'], PAST_DUE);
});

// ⚠ LAST IN THE FILE ON PURPOSE: the client harness makes `window` the global object for good, and
// every test above drives BSPaidLock against its own window.
test('community channels are free: a free account (ShapePaid false) opens the channel list and sends in a channel', async () => {
  // No channel path reads a paid flag (owner, 2026-11-10: browse, join, create and post are free).
  const PAID = /useBSPaidLock|useBSNoraLock|bsPaidLockRead|bsNoraLockRead|ShapePaid|ShapeNora/;
  const fnBody = (name) => {
    const at = CLIENT.indexOf(`\nfunction ${name}(`);
    assert.ok(at > 0, `${name} is gone`);
    return CLIENT.slice(at, CLIENT.indexOf('\nfunction ', at + 10));
  };
  for (const name of ['BSClientFeed', 'BSChatThread', 'BSWallYourBest', 'BSWallPostSheet']) assert.doesNotMatch(fnBody(name), PAID, `${name} reads a paid flag`);
  const feed = fnBody('BSClientFeed');
  assert.match(feed, /const refreshChannels = React\.useCallback\(\(\) => \{\n\s+if \(!window\.ShapeChannels\?\.list\) return;\n\s+window\.ShapeChannels\.list\(\)/, 'the channel list is read for every account');
  for (const call of ['window.ShapeChannels?.create?.(', 'window.ShapeChannels?.join?.(']) assert.ok(feed.includes(call), `${call} is not reached`);
  // The composer a channel sends with: open for a free account, a mic only on Nora's own.
  const composer = CLIENT.slice(CLIENT.indexOf('function BSMessageComposer('), CLIENT.indexOf('// When pinned, render through a portal'));
  assert.match(composer, /const paidLock = voice \? noraLock : null;/);
  const { loadBroadsheet, drive } = await import('./helpers/broadsheet-mount.mjs');
  const { BSMessageComposer } = await loadBroadsheet(['BSMessageComposer']);
  Object.assign(globalThis, { ShapeCanChat: true, ShapePaid: false, ShapePastDue: false, ShapeNora: false });
  let sent = 0;
  const d = drive(BSMessageComposer, { value: 'Hello channel', onChange() {}, onSend: () => { sent += 1; }, mag: true });
  assert.ok(d.nodes().some((n) => n.type === 'textarea'), 'a free account has no field to type in');
  const send = d.nodes().find((n) => n.type === 'button' && n.props['aria-label'] === 'Send');
  assert.ok(send && !send.props.disabled, 'a free account cannot send');
  send.props.onClick();
  assert.equal(sent, 1);
  assert.ok(!d.nodes().some((n) => typeof n.type === 'function' && n.type.name === 'BSSignInToSend'), 'a free account is asked to sign in');
  // Only a session with no account meets the sign-in bar.
  globalThis.ShapeCanChat = false;
  const none = drive(BSMessageComposer, { value: 'Hello channel', onChange() {}, onSend() {}, mag: true });
  assert.ok(none.nodes().some((n) => typeof n.type === 'function' && n.type.name === 'BSSignInToSend'));
  // And the free lists name channels, never the membership's.
  // The welcome's tiles (redrawn 2026-11-13): the community among the free parts, each read through its
  // own key; only Music (Shape Radio, the membership's) carries the membership line's ✦.
  assert.match(WELCOME_SCREEN, /\['people', tr\('fr\.welcome\.tileCommunity'\)\],/);
  assert.match(WELCOME_SCREEN, /\['music', tr\('fr\.welcome\.tileMusic'\), true\],/);
  assert.equal((WELCOME_SCREEN.match(/, true\],/g) || []).length, 1, 'one tile, Music, is marked as the membership\'s');
  for (const loc of LOCALES) {
    assert.ok(String(cat(loc, 'onboarding')['fr.welcome.tileCommunity'] || '').trim(), `${loc}: fr.welcome.tileCommunity`);
    assert.ok(String(cat(loc, 'common')['paid.freeWithAccount'] || '').trim(), `${loc}: paid.freeWithAccount`);
  }
  for (const k of ['paid.freeBody', 'paid.plans.body', 'paid.feature.any']) assert.doesNotMatch(EN.common[k], /channel|communit/i, `${k} sells channels as a perk`);
  assert.doesNotMatch(EN.onboarding['welcome.membership'], /channel|communit/i);
  for (const k of ['plan.subPaid', 'plan.subFree', 'plan.includedCoachBody']) assert.doesNotMatch(EN.settings[k], /channel|communit/i, `${k} sells channels as a perk`);
  assert.doesNotMatch(cat('en', 'notice')['welcome.body'], /communit/i, 'the membership welcome says it opens the community');
  assert.match(read('mobile-app/src/broadsheet/BSPaidLock.jsx'), /data-bs-plans-free=""[^>]*>\{bsFreeWithAccountLine\(tr\)\}/, 'the plan picker says what stays free');
  assert.match(CLIENT, /\{member \? null : <div data-settings-plan-free=""[^>]*>\{bsFreeWithAccountLine\(tr\)\}<\/div>\}/, 'Settings says what stays free');
});
