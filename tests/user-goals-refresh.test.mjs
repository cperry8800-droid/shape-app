// tests/user-goals-refresh.test.mjs
//
// Codex on #2566 (P2): after an account-setup card is confirmed or undone, the app refreshed only
// client_settings, so every mounted screen holding its own copy of client_training_prefs,
// client_nutrition_prefs, client_goals or profile_custom kept the old values until it was opened
// again. Now the app announces the kinds the setup writes (services/userGoalsRefresh.mjs) and each
// mounted reader reads its document again. Pinned here:
//   - the announced kinds are every user_goals kind the setup's allowlist can write;
//   - the hook, mounted with the real React in jsdom, moves only for its own kinds and lets go on
//     unmount;
//   - every broadsheet screen that reads one of those documents in an effect has that hook's
//     number in the effect's deps, for a list that names the document it reads.
// The coach's own page is driven end to end in tests/trainer-profile.test.mjs, and the card's
// announcement on Confirm and on Undo in tests/nora-account-setup-surfaces.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BS_USER_GOALS_EVENT, BS_ACCOUNT_SETUP_KINDS, bsAnnounceUserGoals, bsOnUserGoals, bsUserGoalsRevHook } from '../mobile-app/src/services/userGoalsRefresh.mjs';
import * as setup from '../src/lib/ai/accountSetup.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('the announcement names every user_goals document the account setup can write', () => {
  const written = new Set([...setup.ALLOWED_CELLS].filter((id) => id.startsWith('goals:')).map((id) => id.split(':')[1]));
  assert.deepEqual([...BS_ACCOUNT_SETUP_KINDS].sort(), [...written].sort());
  assert.ok(Object.isFrozen(BS_ACCOUNT_SETUP_KINDS));
});

test('an announcement reaches a listener for any kind it names, and no other; unsubscribed, nothing', () => {
  const w = dom.window;
  const heard = [];
  const off = bsOnUserGoals(['client_goals'], (kinds) => heard.push(kinds), w);
  assert.equal(bsAnnounceUserGoals(['client_settings'], w), true);
  assert.deepEqual(heard, [], 'a document it does not read');
  assert.equal(bsAnnounceUserGoals(['client_settings', 'client_goals'], w), true);
  assert.deepEqual(heard, [['client_settings', 'client_goals']]);
  off();
  bsAnnounceUserGoals(['client_goals'], w);
  assert.equal(heard.length, 1, 'unsubscribed');
  assert.equal(bsAnnounceUserGoals([], w), false, 'nothing named, nothing sent');
  assert.equal(bsAnnounceUserGoals(['client_goals'], null), false, 'no window, nothing sent');
  // Only an announcement's own shape counts: a bare event of the same name names nothing.
  const off2 = bsOnUserGoals(['client_goals'], (kinds) => heard.push(kinds), w);
  w.dispatchEvent(new w.Event(BS_USER_GOALS_EVENT));
  assert.equal(heard.length, 1);
  off2();
});

test('the hook, mounted: its number moves on an announcement of its documents only, and it lets go on unmount', async () => {
  const prev = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  try {
    const React = require_('react');
    const { act } = React;
    const ReactDOMClient = require_('react-dom/client');
    const useBSUserGoalsRev = bsUserGoalsRevHook(React);
    const reads = [];
    function Reader() {
      const rev = useBSUserGoalsRev(['client_training_prefs', 'client_nutrition_prefs']);
      React.useEffect(() => { reads.push(rev); }, [rev]);
      return React.createElement('i', null, String(rev));
    }
    const host = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(host);
    const root = ReactDOMClient.createRoot(host);
    await act(async () => { root.render(React.createElement(Reader)); });
    assert.deepEqual(reads, [0], 'read as it mounts');
    await act(async () => { bsAnnounceUserGoals(['client_goals']); });
    assert.deepEqual(reads, [0], 'another document: no read');
    await act(async () => { bsAnnounceUserGoals(BS_ACCOUNT_SETUP_KINDS); });
    assert.deepEqual(reads, [0, 1], 'the setup\'s announcement: read again');
    await act(async () => { bsAnnounceUserGoals(['client_nutrition_prefs']); });
    assert.deepEqual(reads, [0, 1, 2]);
    const removed = [];
    const realRemove = dom.window.removeEventListener;
    dom.window.removeEventListener = function (type, ...rest) { removed.push(type); return realRemove.call(this, type, ...rest); };
    try { await act(async () => { root.unmount(); }); } finally { dom.window.removeEventListener = realRemove; }
    assert.ok(removed.includes(BS_USER_GOALS_EVENT), 'the listener is taken off as it unmounts');
    await act(async () => { bsAnnounceUserGoals(BS_ACCOUNT_SETUP_KINDS); });
    assert.deepEqual(reads, [0, 1, 2], 'unmounted: nothing');
    host.remove();
  } finally { globalThis.window = prev.window; globalThis.document = prev.document; }
});

// ── Every mounted reader ─────────────────────────────────────────────────────────────────────
const parser = require_('@babel/parser');
const DIR = join(ROOT, 'mobile-app/src/broadsheet');
const isEffect = (c) => (c.type === 'MemberExpression' && /^useEffect/.test(c.property.name)) || (c.type === 'Identifier' && /^useEffect/.test(c.name));
const children = (n) => Object.keys(n).filter((k) => k !== 'loc' && k !== 'leadingComments' && k !== 'trailingComments').flatMap((k) => (Array.isArray(n[k]) ? n[k] : [n[k]])).filter((c) => c && typeof c.type === 'string');
function scan(file) {
  const src = readFileSync(join(DIR, file), 'utf8');
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const lists = new Map(); // const NAME = ['kind', …]
  const revs = new Map();  // const name = useBSUserGoalsRev(LIST or [...]) → its kinds
  const reads = [];
  const effects = [];
  (function walk(n, stack) {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      if (n.init.type === 'ArrayExpression' && n.init.elements.length && n.init.elements.every((e) => e && e.type === 'StringLiteral')) lists.set(n.id.name, n.init.elements.map((e) => e.value));
      if (n.init.type === 'CallExpression' && n.init.callee.type === 'Identifier' && n.init.callee.name === 'useBSUserGoalsRev') revs.set(n.id.name, n.init.arguments[0]);
    }
    if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && n.callee.property && n.callee.property.name === 'getUserGoals' && n.arguments[0] && n.arguments[0].type === 'StringLiteral') {
      const eff = [...stack].reverse().find((s) => s.type === 'CallExpression' && isEffect(s.callee));
      const fnName = [...stack].reverse().find((s) => s.type === 'FunctionDeclaration');
      reads.push({ kind: n.arguments[0].value, line: n.loc.start.line, eff, inFn: fnName && fnName.id && fnName.id.name });
    }
    if (n.type === 'CallExpression' && isEffect(n.callee)) effects.push({ node: n, body: src.slice(n.start, n.end) });
    for (const c of children(n)) walk(c, [...stack, n]);
  })(ast.program, []);
  const kindsOf = (arg) => (!arg ? [] : arg.type === 'Identifier' ? lists.get(arg.name) || [] : arg.type === 'ArrayExpression' ? arg.elements.map((e) => e.value) : []);
  const depKinds = (eff) => {
    const deps = eff.arguments[1] && eff.arguments[1].type === 'ArrayExpression' ? eff.arguments[1].elements : [];
    return deps.filter((d) => d && d.type === 'Identifier' && revs.has(d.name)).flatMap((d) => kindsOf(revs.get(d.name)));
  };
  return { reads, effects, depKinds };
}
// The documents a screen shows from its own copy. (client_settings is the Preferences pane's, below;
// client_onboarding is the first run's, re-read on shape:accountSetup.)
const SHOWN = ['client_goals', 'client_identity', 'client_training_prefs', 'client_nutrition_prefs', 'profile_custom'];
// The one effect reader left as it is, and why: the avatar's photo (client_identity.photo), which the
// account setup never writes.
const EXEMPT = new Set(['useBSProfilePhoto']);

test('⚠ every broadsheet screen that reads one of the setup\'s documents in an effect reads it again on the announcement', () => {
  const missing = [];
  let checked = 0;
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.jsx'))) {
    if (!SHOWN.some((k) => readFileSync(join(DIR, file), 'utf8').includes(k))) continue;
    const { reads, depKinds } = scan(file);
    for (const r of reads) {
      if (!SHOWN.includes(r.kind) || !r.eff) continue;
      if (EXEMPT.has(r.inFn)) continue;
      checked += 1;
      if (!depKinds(r.eff).includes(r.kind)) missing.push(`${file}:${r.line} reads ${r.kind}`);
    }
  }
  assert.deepEqual(missing, [], 'each of these keeps its first read until it is opened again');
  assert.ok(checked >= 14, `the scan found the readers (${checked})`);
});

test('the Settings Preferences pane (units, week start, Morning check-in) reads client_settings again', () => {
  const { effects, depKinds } = scan('iosAppBroadsheetClient.jsx');
  const pane = effects.filter((e) => e.body.includes('hydrateRef.current = read;'));
  assert.equal(pane.length, 1, 'the pane\'s hydrate');
  assert.deepEqual(depKinds(pane[0].node), ['client_settings']);
});

test('the card announces after Confirm and after Undo, with the units and check-in re-applied as before', () => {
  const src = readFileSync(join(DIR, 'iosAppBroadsheetClient.jsx'), 'utf8');
  const fn = src.slice(src.indexOf('function bsAfterAccountSetup('), src.indexOf('\n}\n', src.indexOf('function bsAfterAccountSetup(')));
  assert.match(fn, /bsAnnounceUserGoals\(BS_ACCOUNT_SETUP_KINDS\)/);
  assert.match(fn, /ShapeUnits\?\.set\?\.\(st\.units\)/);
  assert.match(fn, /bsDailyCheckinApply\(/);
});

// ── The website (Codex on a569e48, P2) ───────────────────────────────────────────────────────
// The chat widget sits over the website's pages, and a setup confirmed or undone in it changes what
// they show. The widget announces `shape:accountSetup` (pinned in nora-account-setup-surfaces); each
// page that shows what the setup writes reads again on it. The units loader is driven end to end in
// tests/website-dash-units.test.mjs; these pin the other readers' wiring.
const web = (f) => readFileSync(join(ROOT, 'public/newdesign', f), 'utf8');
const sliceFn = (src, head) => { const a = src.indexOf(head); assert.ok(a >= 0, head); const b = src.indexOf('\n}\n', a); return src.slice(a, b); };

test('website: Settings, the notification centre, the dashboard\'s setup lines, Goals and the own profile read again after a setup', () => {
  const me = web('clientMeSettings.jsx');
  const settings = sliceFn(me, 'function ClientMeSettings(');
  assert.match(settings, /window\.addEventListener\("shape:accountSetup",refresh\);/, 'Settings (its profile, preferences and options) reads again');
  assert.match(settings, /window\.removeEventListener\("shape:accountSetup",refresh\);/, 'and lets go on unmount');
  assert.match(settings, /const refresh=\(\)=>\{if\(active\)loadSettings\(\);\};/);
  const notify = sliceFn(me, 'function NotificationDashboard(');
  assert.match(notify, /const again = \(\) => load\(\); window\.addEventListener\("shape:accountSetup", again\); return \(\) => window\.removeEventListener\("shape:accountSetup", again\); \}, \[load\]\);/, 'quiet hours and the daily limit');
  const board = sliceFn(web('dashClient.jsx'), 'function DclSetupBoard(');
  assert.match(board, /const again = \(\) => load\(\); window\.addEventListener\("shape:accountSetup", again\); return \(\) => window\.removeEventListener\("shape:accountSetup", again\); \}, \[load\]\);/, 'the dashboard\'s goal, experience and diet lines');
  const goals = web('dashGoals.jsx');
  assert.match(goals, /const again = \(\) => setSetupRev\(\(n\) => n \+ 1\); window\.addEventListener\("shape:accountSetup", again\);/);
  const goalsRead = goals.slice(goals.indexOf('window.shapeDb.getUserGoals("client_goals")'));
  assert.match(goalsRead.slice(0, goalsRead.indexOf('}, [')+20), /\}, \[setupRev\]\);/, 'the Goals page\'s read runs again on it');
  const prof = web('livingProfilePage.jsx');
  assert.match(prof, /const again = \(\) => setSetupRev\(\(n\) => n \+ 1\); window\.addEventListener\("shape:accountSetup", again\);/);
  const ident = prof.slice(prof.indexOf('.eq("kind", "client_identity")'));
  assert.match(ident.slice(0, ident.indexOf('}, [') + 20), /\}, \[setupRev\]\);/, 'the own profile\'s name and goal');
  assert.match(prof, /\}, \[st\.isSelf, st\.uid, setupRev\]\);/, 'and its units');
});

// Codex on 940ecd8 (P2): a setup that changes the name writes profiles.full_name, and bsMyName() and
// every avatar read it from the auth cache, which only Settings → Edit profile refreshed. After a
// setup the app reads the profile row again into the cache (ShapeAuth.reloadProfile), which tells the
// avatars itself (setCached's shape:identity on a changed name). Lifted out of shapeBackend.js and run.
test('reloadProfile reads the account\'s profile row into the cache, and leaves it for an account that switched', async () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const cut = (from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); };
  const code = cut('async function fetchProfile(user) {', '\nasync function upsertProfile(') + cut('async function reloadProfile() {', '\nasync function getCurrentSession() {');
  const make = (state, supabase, cached) => new Function('state', 'supabase', 'setCached', `${code}; return reloadProfile;`)(state, supabase, (next) => { cached.push(next); Object.assign(state, next); return state; });
  const db = (row, onRead) => ({ from: (t) => { assert.equal(t, 'profiles'); const q = { select: () => q, eq: (c, v) => { q.id = v; return q; }, maybeSingle: async () => { if (onRead) onRead(); return { data: row && row.id === q.id ? row : null, error: null }; } }; return q; } });
  const state = { user: { id: 'u-1' }, profile: { id: 'u-1', full_name: 'Sam Lee' } };
  const cached = [];
  const got = await make(state, db({ id: 'u-1', full_name: 'Samantha Lee' }), cached)();
  assert.equal(got.full_name, 'Samantha Lee');
  assert.deepEqual(cached, [{ profile: { id: 'u-1', full_name: 'Samantha Lee' } }], 'the profile, through setCached (which tells the avatars), and nothing else');
  // Another account signs in while the row is read: the cache is left alone.
  const s2 = { user: { id: 'u-1' }, profile: { id: 'u-1', full_name: 'Sam Lee' } };
  const c2 = [];
  assert.equal(await make(s2, db({ id: 'u-1', full_name: 'Samantha Lee' }, () => { s2.user = { id: 'u-2' }; }), c2)(), null);
  assert.deepEqual(c2, []);
  // Signed out, or a failed read: nothing.
  assert.equal(await make({ user: null }, db(null), [])(), null);
  const failing = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: new Error('offline') }) }) };
  const c3 = [];
  assert.equal(await make({ user: { id: 'u-1' } }, failing, c3)(), null);
  assert.deepEqual(c3, []);
  assert.match(src, /\n {2}reloadProfile,\n/, 'published on window.ShapeAuth');
});

test('the setup card reads the profile row again after Confirm and Undo', () => {
  const src = readFileSync(join(DIR, 'iosAppBroadsheetClient.jsx'), 'utf8');
  const fn = src.slice(src.indexOf('function bsAfterAccountSetup('), src.indexOf('\n}\n', src.indexOf('function bsAfterAccountSetup(')));
  assert.match(fn, /window\.ShapeAuth\?\.reloadProfile\?\.\(\)/);
});
