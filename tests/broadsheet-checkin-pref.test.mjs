// The optional daily check-in (spec §3D) — mount-level proof on the REAL
// BSTodayNudge from iosAppBroadsheetClient.jsx, not a copy.
//
// WHY MOUNT: the pref reaches Home through a hook (useBSDailyCheckinPref) whose
// load-bearing halves are a synchronous localStorage seed, an async cloud
// hydrate, and a window-event subscription that lets Settings — an OVERLAY over
// a still-mounted Home — re-render the bulletin live. renderToStaticMarkup
// never runs effects, so the hydrate + event wiring is provable only under a
// real client mount (jsdom + react-dom/client + React.act — the
// error-boundary-mount pattern). The static renders below cover the FIRST
// PAINT (the mirror seed), which is exactly what the mirror exists for.
//
// Loading technique is broadsheet-session-render's: compile the shipping file
// in memory, resolve its real imports, append exports. No source copied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

// Real browser environment FIRST — react-dom/client needs a document, and the
// module reads its window globals at import time.
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node's own `navigator` getter is read-only but configurable (see
// error-boundary-mount.test.mjs) — redefine rather than assign.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
// The pref helpers reach `localStorage` as a bare global (inside try/catch);
// bare identifiers in the compiled module resolve against the REAL globalThis,
// not dom.window, so bridge it explicitly.
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
// The apply() helper constructs a bare `new CustomEvent(...)`; Node's native
// CustomEvent fails jsdom's dispatchEvent brand check (silently — the helper
// wraps dispatch in try/catch), so the constructor must be jsdom's own.
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Total theme map (the broadsheet-session-render pattern): unknown tokens
// resolve to a harmless color so this test can only fail for pref logic, never
// for an unstubbed palette token.
const THEME_KNOWN = {
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK: '#111',
  INK50: '#777', INK70: '#555', RULE: '#ccc', HAIR: '#ddd', ACCENT: '#0f766e',
  GREEN: '#2f7d32', AMBER: '#b26a00', RUST: '#9a3b1b', TEAL: '#0f766e',
  padX: 18, isLight: true,
};
const THEME = new Proxy(THEME_KNOWN, {
  get: (target, key) => (key in target ? target[key] : '#000'),
  has: () => true,
});
// The module's top-level `const { useBS, … } = window` destructure reads
// dom.window; bare-identifier lookups fall through to globalThis — stub both.
for (const g of [dom.window, globalThis]) {
  g.useBS = () => THEME;
  g.BSEyebrow = ({ children }) => require_('react').createElement('div', null, children);
  g.BSPage = ({ children }) => require_('react').createElement('div', null, children);
  g.BSFooter = ({ left, right }) => require_('react').createElement('footer', null, left, right);
}

const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const ReactDOMServer = require_('react-dom/server');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');

async function loadModule() {
  const dir = dirname(SRC);
  // Substitute ALL of `import.meta` — the file also probes a bare
  // `typeof import.meta`, a SyntaxError inside a CJS function body.
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSTodayNudge, bsDailyCheckinOn, bsDailyCheckinApply, bsDailyCheckinMirrorWrite, bsDailyCheckinMirrorRead };\n`;
  const { code } = babel.transformSync(source, {
    presets: [presetReact],
    plugins: [commonjs],
    babelrc: false,
    configFile: false,
    filename: SRC,
  });
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([
    ['react', React],
    ['react-dom', { createPortal: (n) => n }],
  ]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    registry.set(spec, await import(pathToFileURL(join(dir, spec)).href));
  }
  const mod = { exports: {} };
  const req = (spec) => {
    if (!registry.has(spec)) throw new Error(`unmapped import: ${spec}`);
    return registry.get(spec);
  };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}

const MOD = await loadModule();
// The mirror is PER-UID: 'shape.dailyCheckin.<uid>' (one shared slot let
// account B's default-ON hydrate delete account A's OFF record).
const lsKey = (uid) => `shape.dailyCheckin.${uid}`;

// Per-test environment. `uid: null` = signed out. `doc` = what the cloud
// client_settings read resolves to (only consulted under a real mount, where
// effects run) — pass a FUNCTION for a controllable/pending hydrate.
function env({ uid = null, doc = {} } = {}) {
  dom.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
  globalThis.ShapeAuth = dom.window.ShapeAuth; // bare-global fallback path
  dom.window.shapeDb = { getUserGoals: typeof doc === 'function' ? doc : async () => doc };
  dom.window.localStorage.clear();
}
function switchAccount(uid) {
  // Sign-out → sign-in on the SAME device: auth changes, localStorage does not.
  dom.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
  globalThis.ShapeAuth = dom.window.ShapeAuth;
}

// Static render (no effects — the first paint the mirror seed decides).
// Render warnings (hook-order divergence etc.) are failures.
function renderStatic(el) {
  const warnings = [];
  const realError = console.error;
  console.error = (...a) => warnings.push(a.join(' '));
  try {
    return { html: ReactDOMServer.renderToStaticMarkup(el), warnings };
  } finally {
    console.error = realError;
  }
}
const nudge = (props) => React.createElement(MOD.BSTodayNudge, { onOpen: () => {}, ...props });

test('bsDailyCheckinOn tolerates BOTH storage shapes (house string + spec boolean)', () => {
  // ON: absent / true / 'On'. OFF: only an explicit false / 'Off'.
  assert.equal(MOD.bsDailyCheckinOn(undefined), true);
  assert.equal(MOD.bsDailyCheckinOn(true), true);
  assert.equal(MOD.bsDailyCheckinOn('On'), true);
  assert.equal(MOD.bsDailyCheckinOn(false), false);
  assert.equal(MOD.bsDailyCheckinOn('Off'), false);
});

test('signed-out preview is byte-identical: bulletin due, no residue row, unknown variant nothing', () => {
  env({ uid: null });
  // Even a stale OFF record on the device must not touch the signed-out demo.
  dom.window.localStorage.setItem(lsKey('somebody-else'), JSON.stringify({ uid: 'somebody-else', off: true }));
  const bulletin = renderStatic(nudge({ variant: 'bulletin' }));
  assert.equal(bulletin.warnings.length, 0, bulletin.warnings.join('\n'));
  assert.match(bulletin.html, /Check-in due/);
  const row = renderStatic(nudge({ variant: 'row' }));
  assert.equal(row.html, ''); // not logged → no residue row (unchanged behavior)
  const unknown = renderStatic(nudge({ variant: 'weird' }));
  assert.equal(unknown.html, ''); // explicit-variant contract holds
});

test('signed-in with no stored pref: first paint identical to today (default ON)', () => {
  env({ uid: 'member-1' });
  const bulletin = renderStatic(nudge({ variant: 'bulletin' }));
  assert.equal(bulletin.warnings.length, 0, bulletin.warnings.join('\n'));
  assert.match(bulletin.html, /Check-in due/);
  assert.equal(renderStatic(nudge({ variant: 'row' })).html, '');
});

test('pref OFF: the bulletin never renders; the row is the quiet door (no "due", no done-tick)', () => {
  env({ uid: 'member-1' });
  MOD.bsDailyCheckinMirrorWrite(false); // what Settings' apply() writes
  const bulletin = renderStatic(nudge({ variant: 'bulletin' }));
  assert.equal(bulletin.warnings.length, 0, bulletin.warnings.join('\n'));
  assert.equal(bulletin.html, '');
  const row = renderStatic(nudge({ variant: 'row' }));
  assert.equal(row.warnings.length, 0, row.warnings.join('\n'));
  assert.match(row.html, /Check-in/);
  assert.match(row.html, /add water/);
  assert.doesNotMatch(row.html, /due/i);      // never nags
  assert.doesNotMatch(row.html, /Logged/);    // not the residue row
  assert.doesNotMatch(row.html, /✓/);         // no done-tick semantics
  const unknown = renderStatic(nudge({ variant: 'weird' }));
  assert.equal(unknown.html, ''); // the contract survives the OFF branch too
});

test('the OFF mirror is uid-scoped: another account’s record reads as ON', () => {
  env({ uid: 'member-2' });
  dom.window.localStorage.setItem(lsKey('member-1'), JSON.stringify({ uid: 'member-1', off: true }));
  const bulletin = renderStatic(nudge({ variant: 'bulletin' }));
  assert.match(bulletin.html, /Check-in due/); // member-2 never inherits member-1's OFF
});

// ── Real mounts: effects run (cloud hydrate · the live Settings event) ──────
async function mount(el) {
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return {
    host,
    rerenderFlush: () => React.act(async () => {}),
    act: (fn) => React.act(async () => { fn(); }),
    unmount: () => { React.act(() => root.unmount()); host.remove(); },
  };
}

test('a Settings toggle re-renders a mounted Home live — bsDailyCheckinApply is the whole wire', async () => {
  env({ uid: 'member-3', doc: {} });
  const m = await mount(nudge({ variant: 'bulletin' }));
  try {
    assert.match(m.host.textContent, /Check-in due/);
    // Settings (an overlay — Home stays mounted) flips the pref OFF: the SAME
    // helper its cyclePref/setPref side effect calls.
    await m.act(() => MOD.bsDailyCheckinApply(false));
    assert.equal(m.host.textContent, '');
    // …and the per-uid mirror now holds the OFF record for the next launch.
    const rec = JSON.parse(dom.window.localStorage.getItem(lsKey('member-3')));
    assert.deepEqual(rec, { uid: 'member-3', off: true });
    // Turning it back ON restores the bulletin and clears the record.
    await m.act(() => MOD.bsDailyCheckinApply(true));
    assert.match(m.host.textContent, /Check-in due/);
    assert.equal(dom.window.localStorage.getItem(lsKey('member-3')), null);
  } finally {
    m.unmount();
  }
});

test('the quiet door stays a real door: tapping it opens the check-in page', async () => {
  // The cloud doc must agree with the mirror — under a real mount the hydrate
  // effect runs, and a doc WITHOUT the key would (correctly) converge back ON.
  env({ uid: 'member-4', doc: { dailyCheckin: 'Off' } });
  MOD.bsDailyCheckinMirrorWrite(false);
  let opened = 0;
  const m = await mount(nudge({ variant: 'row', onOpen: () => { opened += 1; } }));
  try {
    const btn = m.host.querySelector('button');
    assert.ok(btn, 'the quiet door renders as a button');
    assert.match(btn.getAttribute('aria-label') || '', /Check-in/);
    await m.act(() => { btn.click(); });
    assert.equal(opened, 1);
  } finally {
    m.unmount();
  }
});

for (const [label, doc] of [
  ['spec boolean `dailyCheckin: false`', { dailyCheckin: false }],
  ["house string `dailyCheckin: 'Off'`", { dailyCheckin: 'Off' }],
]) {
  test(`cloud hydrate converges a fresh device — ${label} hides the bulletin and refreshes the mirror`, async () => {
    env({ uid: 'member-5', doc });
    // Fresh device: no mirror, so the first paint is ON — then the cloud read
    // (both storage shapes) must win and write the mirror for the next launch.
    const m = await mount(nudge({ variant: 'bulletin' }));
    try {
      assert.equal(m.host.textContent, '');
      const rec = JSON.parse(dom.window.localStorage.getItem(lsKey('member-5')));
      assert.deepEqual(rec, { uid: 'member-5', off: true });
    } finally {
      m.unmount();
    }
  });
}

test('cloud hydrate also converges the OTHER way: an absent key clears a stale OFF mirror', async () => {
  env({ uid: 'member-6', doc: {} }); // account truth: default ON
  MOD.bsDailyCheckinMirrorWrite(false); // stale local OFF (e.g. a failed save)
  const m = await mount(nudge({ variant: 'bulletin' }));
  try {
    // First paint honors the mirror; the resolved cloud read restores ON.
    assert.match(m.host.textContent, /Check-in due/);
    assert.equal(dom.window.localStorage.getItem(lsKey('member-6')), null);
  } finally {
    m.unmount();
  }
});

test('a NULL cloud read (failed OR no row — getUserGoals never rejects) keeps the OFF seed', async () => {
  // shapeBackend's getUserGoals resolves null when offline / signed out /
  // query error, and {} only for a real empty doc. A null must NEVER clear a
  // valid OFF mirror — the member's last local choice is the safe direction.
  env({ uid: 'member-7', doc: null });
  MOD.bsDailyCheckinMirrorWrite(false);
  const m = await mount(nudge({ variant: 'bulletin' }));
  try {
    assert.equal(m.host.textContent, '', 'OFF held through the null hydrate');
    const rec = JSON.parse(dom.window.localStorage.getItem(lsKey('member-7')));
    assert.deepEqual(rec, { uid: 'member-7', off: true }, 'the OFF record survives');
  } finally {
    m.unmount();
  }
});

test('a toggle during a pending hydrate wins — the late response is discarded (edit generation)', async () => {
  let resolveHydrate;
  const pending = new Promise((res) => { resolveHydrate = res; });
  env({ uid: 'member-8', doc: () => pending });
  const m = await mount(nudge({ variant: 'bulletin' }));
  try {
    assert.match(m.host.textContent, /Check-in due/); // seed ON, hydrate in flight
    // The member toggles OFF while the request is still pending…
    await m.act(() => MOD.bsDailyCheckinApply(false));
    assert.equal(m.host.textContent, '');
    // …then the stale response lands, claiming ON. It must lose.
    await m.act(() => { resolveHydrate({ dailyCheckin: 'On' }); });
    await m.rerenderFlush();
    assert.equal(m.host.textContent, '', 'the late hydrate must not overwrite the fresh toggle');
    const rec = JSON.parse(dom.window.localStorage.getItem(lsKey('member-8')));
    assert.deepEqual(rec, { uid: 'member-8', off: true }, 'the mirror keeps the fresh toggle too');
  } finally {
    m.unmount();
  }
});

test("B's default-ON hydrate cannot delete A's OFF record — per-uid mirror keys", async () => {
  // Account A turns the pref OFF on this device…
  env({ uid: 'member-A', doc: {} });
  MOD.bsDailyCheckinMirrorWrite(false);
  const aRecord = dom.window.localStorage.getItem(lsKey('member-A'));
  assert.ok(aRecord, "A's OFF record exists");
  // …then A signs out and B signs in on the SAME device. B's cloud doc has no
  // key, so B's hydrate converges B's own mirror toward ON (a removeItem).
  switchAccount('member-B');
  const m = await mount(nudge({ variant: 'bulletin' }));
  try {
    assert.match(m.host.textContent, /Check-in due/); // B reads ON
  } finally {
    m.unmount();
  }
  // A's record survived B's whole session…
  assert.equal(dom.window.localStorage.getItem(lsKey('member-A')), aRecord);
  // …so A's next first paint still seeds OFF.
  switchAccount('member-A');
  assert.equal(MOD.bsDailyCheckinMirrorRead(), false);
  assert.equal(renderStatic(nudge({ variant: 'bulletin' })).html, '');
});

test('window.ShapeCheckinPref.on() is the synchronous pref reader and tracks the mirror', () => {
  // The engine gates its vitals leg on this export (tolerant consumption:
  // `window.ShapeCheckinPref?.on?.() === false` drops the leg; absent = ON).
  env({ uid: 'member-9' });
  const api = dom.window.ShapeCheckinPref;
  assert.equal(typeof (api && api.on), 'function', 'the export exists');
  assert.equal(api.on(), true); // default ON
  MOD.bsDailyCheckinApply(false); // the Settings toggle's own helper
  assert.equal(api.on(), false); // flips with the member's choice
  MOD.bsDailyCheckinApply(true);
  assert.equal(api.on(), true);
  switchAccount(null); // signed-out always reads ON, whatever is stored
  dom.window.localStorage.setItem(lsKey('member-9'), JSON.stringify({ uid: 'member-9', off: true }));
  assert.equal(api.on(), true);
});

// ── Settings wiring guard (source-level — BSSettings is too heavy to mount) ─
// The behavioral wire (apply → mirror + event → Home) is proven above; what a
// mount cannot cheaply reach is that BOTH Settings writers (cyclePref for
// tap-to-cycle rows, setPref for the segmented row) carry the side effect, that
// the option registry + Preferences row exist, and that the load effect
// normalizes a boolean doc value. Mutation-checked: deleting either writer's
// side-effect line, the PREF_OPTIONS entry, the row, or the loader branch
// fails the matching assertion.
test('Settings carries the dailyCheckin pref end to end (both writers, row, loader)', () => {
  const src = readFileSync(SRC, 'utf8');
  assert.match(src, /dailyCheckin:\s*\['On',\s*'Off'\]/, 'PREF_OPTIONS entry');
  // Both writers must apply the pref (mirror + the event a mounted Home listens
  // for). Two writers exist — cyclePref for tap-to-cycle rows, setPref for the
  // segmented row — and a member can reach the pref through either.
  const sideEffects = src.match(/if \(key === 'dailyCheckin'\) \{ try \{ bsDailyCheckinApply\(next\[key\] !== 'Off'\); \} catch \(e\) \{\} \}/g) || [];
  assert.equal(sideEffects.length, 2, 'cyclePref AND setPref both apply the pref');
  assert.match(src, /settings:pref\.dailyCheckin/, 'the Preferences row exists');
  assert.match(src, /'dailyCheckin' in s/, 'the Settings load effect handles a stored value');
  // The row seeds from the mirror so an offline pane can't show On while the
  // mirror correctly keeps Home OFF.
  assert.match(src, /dailyCheckin: bsDailyCheckinLabel\(\)/, 'the prefs seed reads the per-uid mirror');
});

// ── The pane's ONE cloud writer (Codex round 3) ────────────────────────────
// `saveUserGoals` upserts the WHOLE document, so a whole-doc save issued before
// the hydrate lands publishes PREF_DEFAULTS over the member's stored units,
// privacy, meal times and phases. Every row is interactive from the first frame,
// so this is a whole-pane rule — the reason the guard lives at the writer rather
// than on the check-in row Codex found it through. Mutation-checked: restoring
// the bare `saveUserGoals('client_settings', next)` call, or dropping the
// no-real-document refusal, fails the matching assertion.
test('every Settings write goes through the deferred, merge-on-a-real-document writer', () => {
  const src = readFileSync(SRC, 'utf8');
  const settings = src.slice(src.indexOf('function BSSettings('));
  assert.ok(settings.length > 0, 'BSSettings is in the source');
  // Nothing in the pane may publish the pref object directly.
  assert.doesNotMatch(
    settings,
    /saveUserGoals\('client_settings',\s*next\)/,
    'no writer publishes the whole prefs object (that is the pre-hydrate clobber)',
  );
  const writers = settings.match(/persistPrefs\(key, next\[key\]\);/g) || [];
  assert.equal(writers.length, 2, 'cyclePref AND setPref both write through persistPrefs');
  assert.match(settings, /const persistPrefs = \(key, value\) => \{/, 'the pane declares one cloud writer');
  // It merges the member's edits onto a REAL server document...
  assert.match(
    settings,
    /db\.saveUserGoals\('client_settings', \{ \.\.\.doc, \.\.\.editedRef\.current \}\)/,
    'the write merges edited keys onto the server document',
  );
  // ...and declines to write at all when it cannot obtain one.
  assert.match(
    settings,
    /if \(!\(doc && typeof doc === 'object'\)\) return;/,
    'no real document ⇒ decline to write rather than publish defaults',
  );
  // The hydrate must not revert a key the member already edited — dropped from
  // the PATCH, not merely skipped at the apply, or the blanket spread reverts it.
  assert.match(
    settings,
    /Object\.keys\(edited\)\.forEach\(k => \{ delete patch\[k\]; \}\);/,
    'an edited key is dropped from the hydrate patch',
  );
  assert.match(settings, /const fresh = \(k\) => !\(k in edited\);/, 'the hydrate applies only un-edited keys');
});

test('the two new settings keys exist in the en catalog (the parity gate covers the other 12)', () => {
  const en = JSON.parse(readFileSync(join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', 'settings.json'), 'utf8'));
  assert.equal(en['pref.dailyCheckin'], 'Daily check-in');
  assert.equal(en['pref.dailyCheckinDesc'], 'Show the daily check-in prompt on Home');
});
