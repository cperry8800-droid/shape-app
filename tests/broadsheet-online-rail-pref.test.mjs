// The online-rail preference ("Online members" · Settings → Preferences) — the
// member choice to hide the Community presence rail. Helpers + hook proven on
// the REAL compiled module (the broadsheet-checkin-pref loading technique — no
// source copied); the hook is driven through a minimal probe because mounting
// all of BSClientFeed would stub more than it proves (presence channel,
// supabase, the feed query).
//
// ⚠ A probe cannot see the WIRING (it supplies its own consumption), so the
// wiring is pinned separately against the shipping source at the bottom: the
// rail render must gate on railOn, the Settings pane must seed/hydrate/apply
// the key, and the inline × must exist. Source-anchored, not behavioural — but
// it is exactly the "hook exists, nothing consumes it" failure it exists for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { bsOnlineRailOn, bsOnlineRailApply, bsOnlineRailMirrorRead, bsOnlineRailMirrorWrite, bsOnlineRailPersist, useBSOnlineRailPref };\n`;
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
const lsKey = (uid) => `shape.onlineRail.${uid}`;

function env({ uid = null, doc = {} } = {}) {
  dom.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
  globalThis.ShapeAuth = dom.window.ShapeAuth;
  dom.window.shapeDb = {
    getUserGoals: typeof doc === 'function' ? doc : async () => doc,
    saveUserGoals: async () => ({}),
  };
  dom.window.localStorage.clear();
}

// The probe consumes the hook the way BSClientFeed does: one boolean out.
const Probe = () => React.createElement('div', null, MOD.useBSOnlineRailPref() ? 'RAIL-ON' : 'RAIL-OFF');

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

async function mount(el) {
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return {
    host,
    act: (fn) => React.act(async () => { fn(); }),
    unmount: () => { React.act(() => root.unmount()); host.remove(); },
  };
}

test('bsOnlineRailOn tolerates BOTH storage shapes (house string + boolean)', () => {
  assert.equal(MOD.bsOnlineRailOn(undefined), true);
  assert.equal(MOD.bsOnlineRailOn(true), true);
  assert.equal(MOD.bsOnlineRailOn('On'), true);
  assert.equal(MOD.bsOnlineRailOn(false), false);
  assert.equal(MOD.bsOnlineRailOn('Off'), false);
});

test('the OFF mirror is uid-scoped, and one account’s default-ON can never delete another’s OFF', () => {
  env({ uid: 'rail-a' });
  MOD.bsOnlineRailMirrorWrite(false);
  assert.equal(MOD.bsOnlineRailMirrorRead(), false);
  // Same device, different account: B reads ON (never inherits A's OFF)…
  dom.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'rail-b' } }) };
  globalThis.ShapeAuth = dom.window.ShapeAuth;
  assert.equal(MOD.bsOnlineRailMirrorRead(), true);
  // …and B's ON write removes only B's key — A's record survives the visit.
  MOD.bsOnlineRailMirrorWrite(true);
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-a'))), { uid: 'rail-a', off: true });
});

test('signed-out is always ON — even over a stale OFF record on the device', () => {
  env({ uid: null });
  dom.window.localStorage.setItem(lsKey('somebody'), JSON.stringify({ uid: 'somebody', off: true }));
  assert.equal(MOD.bsOnlineRailMirrorRead(), true);
  const r = renderStatic(React.createElement(Probe));
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
  assert.match(r.html, /RAIL-ON/);
});

test('bsOnlineRailApply writes the mirror AND dispatches the live event', () => {
  env({ uid: 'rail-c' });
  const seen = [];
  const onEvt = (e) => seen.push(e.detail && e.detail.on);
  dom.window.addEventListener('shape:onlineRailPref', onEvt);
  try {
    MOD.bsOnlineRailApply(false);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-c'))), { uid: 'rail-c', off: true });
    MOD.bsOnlineRailApply(true);
    assert.equal(dom.window.localStorage.getItem(lsKey('rail-c')), null);
    assert.deepEqual(seen, [false, true]);
  } finally {
    dom.window.removeEventListener('shape:onlineRailPref', onEvt);
  }
});

// ⚠ Both arms measured on purpose — a decline test alone could pass because the
// helper is broken, not because it declined (check-the-check).
test('bsOnlineRailPersist merges onto a REAL doc and declines a null one — never a bare clobber', async () => {
  env({ uid: 'rail-d' });
  const saves = [];
  // Arm 1: a real doc — the save must carry the SIBLINGS plus the new key.
  dom.window.shapeDb = {
    getUserGoals: async () => ({ units: 'Metric · kg / km', dailyCheckin: 'Off' }),
    saveUserGoals: async (kind, data) => { saves.push([kind, data]); },
  };
  MOD.bsOnlineRailPersist(false);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(saves.length, 1);
  assert.equal(saves[0][0], 'client_settings');
  assert.deepEqual(saves[0][1], { units: 'Metric · kg / km', dailyCheckin: 'Off', onlineRail: 'Off' });
  // Arm 2: a null read (offline / query error) — DECLINE: no save at all. The
  // mirror still hides this device; publishing {} would erase every sibling.
  dom.window.shapeDb = {
    getUserGoals: async () => null,
    saveUserGoals: async (kind, data) => { saves.push([kind, data]); },
  };
  MOD.bsOnlineRailPersist(false);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(saves.length, 1, 'a null read must never produce a save');
});

test('a Settings toggle (or the inline ×) re-renders a mounted feed live — apply is the whole wire', async () => {
  env({ uid: 'rail-e', doc: {} });
  const m = await mount(React.createElement(Probe));
  try {
    assert.match(m.host.textContent, /RAIL-ON/);
    await m.act(() => MOD.bsOnlineRailApply(false));
    assert.match(m.host.textContent, /RAIL-OFF/);
    await m.act(() => MOD.bsOnlineRailApply(true));
    assert.match(m.host.textContent, /RAIL-ON/);
  } finally {
    m.unmount();
  }
});

for (const [label, doc] of [
  ['boolean `onlineRail: false`', { onlineRail: false }],
  ["house string `onlineRail: 'Off'`", { onlineRail: 'Off' }],
]) {
  test(`cloud hydrate converges a fresh device — ${label} hides the rail and refreshes the mirror`, async () => {
    env({ uid: 'rail-f', doc });
    const m = await mount(React.createElement(Probe));
    try {
      assert.match(m.host.textContent, /RAIL-OFF/);
      assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-f'))), { uid: 'rail-f', off: true });
    } finally {
      m.unmount();
    }
  });
}

test('a real doc WITHOUT the key converges a stale OFF mirror back ON — the doc is the truth', async () => {
  env({ uid: 'rail-g', doc: {} });
  MOD.bsOnlineRailMirrorWrite(false); // stale local OFF (e.g. a declined persist)
  const m = await mount(React.createElement(Probe));
  try {
    assert.match(m.host.textContent, /RAIL-ON/);
    assert.equal(dom.window.localStorage.getItem(lsKey('rail-g')), null);
  } finally {
    m.unmount();
  }
});

test('a null cloud read keeps the member’s local choice — absence of data is not a promise', async () => {
  env({ uid: 'rail-h', doc: async () => null });
  MOD.bsOnlineRailMirrorWrite(false);
  const m = await mount(React.createElement(Probe));
  try {
    assert.match(m.host.textContent, /RAIL-OFF/);
  } finally {
    m.unmount();
  }
});

// ── The wiring the probe cannot see, pinned against the shipping source ─────
test('the feed consumes the pref, the pane owns the row, both writers apply it', () => {
  const src = readFileSync(SRC, 'utf8');
  assert.match(src, /\{railOn && railPeople\.length > 0 && \(/,
    'the rail render must gate on railOn — a hook nothing consumes is the silent-death class');
  assert.match(src, /const railOn = useBSOnlineRailPref\(\);/,
    'BSClientFeed must read the pref through the hook');
  assert.match(src, /key: 'onlineRail', segmented: PREF_OPTIONS\.onlineRail/,
    'the Settings pane must own the row');
  assert.match(src, /onlineRail: bsOnlineRailLabel\(\)/,
    'the pane must SEED from the mirror, or an offline pane contradicts the feed');
  assert.equal((src.match(/if \(key === 'onlineRail'\) \{ try \{ bsOnlineRailApply\(next\[key\] !== 'Off'\); \} catch \(e\) \{\} \}/g) || []).length, 2,
    'BOTH pane writers (cyclePref + setPref) must apply the toggle');
  assert.match(src, /if \(fresh\('onlineRail'\)\) \{ try \{ bsOnlineRailApply\(orOn\); \} catch \(e\) \{\} \}/,
    'the pane hydrate must converge a mounted feed');
  assert.match(src, /\{loggedIn && \(\s*<button onClick=\{hideRail\}/,
    'the inline × must exist and stay signed-in-only (the demo rail is byte-identical)');
});
