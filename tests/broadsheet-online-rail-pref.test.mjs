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
    saveUserGoals: async () => ({ ok: true }),
    getUser: async () => (uid ? { id: uid } : null),
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

// ⚠ Every arm measured on purpose — a decline test alone could pass because the
// helper is broken, not because it declined (check-the-check). The lane is
// async: settle it with a macrotask tick after each call.
const tick = () => new Promise((r) => setTimeout(r, 0));

test('bsOnlineRailPersist merges onto a REAL doc and declines a null one — never a bare clobber', async () => {
  env({ uid: 'rail-d' });
  const saves = [];
  // Arm 1: a real doc — the save must carry the SIBLINGS plus the new key.
  dom.window.shapeDb = {
    getUserGoals: async () => ({ units: 'Metric · kg / km', dailyCheckin: 'Off' }),
    saveUserGoals: async (kind, data) => { saves.push([kind, data]); return { ok: true }; },
    getUser: async () => ({ id: 'rail-d' }),
  };
  // The real call order: hideRail applies (mirror + event) BEFORE persisting —
  // the success path deliberately only REWRITES an existing record, so a member
  // who toggled back ON mid-flight is never re-hidden by a landing save.
  MOD.bsOnlineRailApply(false);
  MOD.bsOnlineRailPersist(false);
  await tick(); await tick();
  assert.equal(saves.length, 1);
  assert.equal(saves[0][0], 'client_settings');
  assert.deepEqual(saves[0][1], { units: 'Metric · kg / km', dailyCheckin: 'Off', onlineRail: 'Off' });
  // …and a successful save leaves a PLAIN (non-pending) mirror record.
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-d'))), { uid: 'rail-d', off: true });
  // Arm 2: a null read (offline / query error) — DECLINE: no save, and the
  // choice survives as a PENDING record for the hydrate to re-issue.
  dom.window.localStorage.clear();
  dom.window.shapeDb = {
    getUserGoals: async () => null,
    saveUserGoals: async (kind, data) => { saves.push([kind, data]); return { ok: true }; },
    getUser: async () => ({ id: 'rail-d' }),
  };
  MOD.bsOnlineRailPersist(false);
  await tick(); await tick();
  assert.equal(saves.length, 1, 'a null read must never produce a save');
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-d'))), { uid: 'rail-d', off: true, pending: true });
});

// ⚠ ROUND 2: a save that FAILED (res.error) or THREW is a hide that did not
// persist — it must leave the same PENDING record a declined read leaves, or
// the next hydrate of a doc without the key silently converges the choice away.
test('a failed or thrown save marks the hide pending — same contract as a declined read', async () => {
  env({ uid: 'rail-m' });
  // Arm 1: the backend REPORTS failure ({ error }).
  dom.window.shapeDb = {
    getUserGoals: async () => ({}),
    saveUserGoals: async () => ({ error: { message: 'nope' } }),
    getUser: async () => ({ id: 'rail-m' }),
  };
  MOD.bsOnlineRailApply(false);
  MOD.bsOnlineRailPersist(false);
  await tick(); await tick();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-m'))), { uid: 'rail-m', off: true, pending: true });
  // Arm 2: the save THROWS.
  dom.window.localStorage.clear();
  dom.window.shapeDb = {
    getUserGoals: async () => ({}),
    saveUserGoals: async () => { throw new Error('boom'); },
    getUser: async () => ({ id: 'rail-m' }),
  };
  MOD.bsOnlineRailApply(false);
  MOD.bsOnlineRailPersist(false);
  await tick(); await tick();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-m'))), { uid: 'rail-m', off: true, pending: true });
});

// ⚠ AND THE DELIBERATE NON-FIX, pinned so a future "fix" has to delete a test:
// a pending hide is retried only over an ABSENT key. An explicit 'On' in the
// doc is a choice with no ordering information — retrying over it could
// resurrect an OLDER intent across devices (the visOverride resurrection
// shape). The doc wins; the member sees the rail return and can re-hide.
test("a pending hide does NOT override an explicit onlineRail:'On' in the doc", async () => {
  env({ uid: 'rail-n', doc: { onlineRail: 'On' } });
  const saves = [];
  dom.window.shapeDb = {
    getUserGoals: async () => ({ onlineRail: 'On' }),
    saveUserGoals: async (kind, data) => { saves.push(data); return { ok: true }; },
    getUser: async () => ({ id: 'rail-n' }),
  };
  dom.window.localStorage.setItem(lsKey('rail-n'), JSON.stringify({ uid: 'rail-n', off: true, pending: true }));
  const m = await mount(React.createElement(Probe));
  try {
    await React.act(async () => { await tick(); await tick(); });
    assert.match(m.host.textContent, /RAIL-ON/, 'an explicit doc choice wins over a pending local hide');
    assert.equal(saves.length, 0, 'the pending hide must not be re-issued over an explicit On');
    assert.equal(dom.window.localStorage.getItem(lsKey('rail-n')), null, 'the mirror converges to the doc');
  } finally {
    m.unmount();
  }
});

// ⚠ THE P1: saveUserGoals resolves the CURRENT user at save time, so a save
// issued by account A must be DISCARDED if the account changed while the read
// was in flight — otherwise B's row receives A's whole settings blob.
test('an account switch mid-flight discards the save — never writes A’s blob into B’s row', async () => {
  env({ uid: 'rail-i' });
  const saves = [];
  dom.window.shapeDb = {
    getUserGoals: async () => ({ units: 'Metric · kg / km' }),
    saveUserGoals: async (kind, data) => { saves.push([kind, data]); return { ok: true }; },
    // By the time the identity re-check runs, the CURRENT user is someone else.
    getUser: async () => ({ id: 'rail-OTHER' }),
  };
  MOD.bsOnlineRailPersist(false);
  await tick(); await tick();
  assert.equal(saves.length, 0, 'a changed identity must discard the write');
  // The initiator’s choice still survives, pending, under the INITIATOR’s key.
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-i'))), { uid: 'rail-i', off: true, pending: true });
});

// ⚠ THE LOCAL RACE: two whole-doc writers in flight at once can each land a
// snapshot that predates the other. The lane serializes them: the second
// writer’s READ must not start until the first writer’s save resolved.
test('the serial lane orders local client_settings writers — the second read waits for the first save', async () => {
  env({ uid: 'rail-j' });
  const log = [];
  let releaseFirstSave;
  const firstSaveGate = new Promise((r) => { releaseFirstSave = r; });
  let call = 0;
  dom.window.shapeDb = {
    getUserGoals: async () => { call += 1; log.push('read' + call); return { seq: call }; },
    saveUserGoals: async (kind, data) => {
      log.push('save' + data.seq);
      if (data.seq === 1) await firstSaveGate; // hold the first save open
      return { ok: true };
    },
    getUser: async () => ({ id: 'rail-j' }),
  };
  MOD.bsOnlineRailPersist(false);
  MOD.bsOnlineRailPersist(false);
  await tick(); await tick();
  assert.deepEqual(log, ['read1', 'save1'], 'the second writer must not even READ while the first save is in flight');
  releaseFirstSave();
  await tick(); await tick();
  assert.deepEqual(log, ['read1', 'save1', 'read2', 'save2']);
});

// ⚠ THE PENDING RETRY: a hide whose cloud write declined must not be converged
// away by a doc that predates it — the hydrate keeps OFF and RE-ISSUES.
test('a pending hide survives the hydrate: stays OFF and re-issues the persist', async () => {
  env({ uid: 'rail-k', doc: {} });
  const saves = [];
  dom.window.shapeDb = {
    getUserGoals: async () => ({}), // a real doc WITHOUT the key
    saveUserGoals: async (kind, data) => { saves.push(data); return { ok: true }; },
    getUser: async () => ({ id: 'rail-k' }),
  };
  dom.window.localStorage.setItem(lsKey('rail-k'), JSON.stringify({ uid: 'rail-k', off: true, pending: true }));
  const m = await mount(React.createElement(Probe));
  try {
    await React.act(async () => { await tick(); await tick(); });
    assert.match(m.host.textContent, /RAIL-OFF/, 'a pending hide must not be converged back ON');
    assert.equal(saves.length, 1, 'the hydrate must re-issue the declined persist');
    assert.equal(saves[0].onlineRail, 'Off');
    // The successful re-issue settles the record to plain (non-pending).
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(lsKey('rail-k'))), { uid: 'rail-k', off: true });
  } finally {
    m.unmount();
  }
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

test('a real doc WITHOUT the key converges a stale PLAIN OFF mirror back ON — the doc is the truth', async () => {
  env({ uid: 'rail-g', doc: {} });
  // PLAIN (non-pending) stale OFF — e.g. the doc was cleared from another
  // device. Only a PENDING record survives convergence; this one must not.
  MOD.bsOnlineRailMirrorWrite(false);
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
  // Round-1 review guards (Codex P1/P2 on #1933) — the pane half of each fix
  // lives outside anything a probe can mount, so it is pinned at the source:
  assert.match(src, /const railFold = \(!\('onlineRail' in editedRef\.current\) && !bsOnlineRailMirrorRead\(\)\) \? \{ onlineRail: 'Off' \} : null;/,
    'persistPrefs must fold an unedited inline hide into its saves, or a pre-hide doc snapshot reverts the ×');
  assert.match(src, /const read = bsSettingsWriteSerial\(\(\) => window\.shapeDb\.getUserGoals\('client_settings'\)\)\.catch\(\(\) => null\);/,
    'the pane hydrate must read THROUGH the lane — read-your-own-writes after the ×');
});
