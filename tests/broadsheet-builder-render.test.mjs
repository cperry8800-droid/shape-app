// MOUNT the self-serve workout builder — because the copy this cut is most
// responsible for is INVISIBLE to the i18n inventory walk, so the ratchet
// cannot defend it.
//
// WHY THIS FILE EXISTS. `tests/i18n-surface-inventory.test.mjs` reads JSX text
// and an allowlist of attributes. It counted 46 strings here and it cannot see:
//   1. the eight discipline chips and three experience chips, declared as
//      MODULE-SCOPE ARRAY LITERALS and mapped to elements (cut 7's first
//      invisible shape);
//   2. six plain-JS toast and status strings, which never appear in JSX at all
//      (cut 2's lesson);
//   3. the seven weekday letters, previously a hardcoded English array.
// So reverting any of them leaves the ratchet, the catalog parity gate, tsc,
// the build and the whole suite green. This file is the only thing that goes
// red.
//
// ⚠ AND ITS SHARPEST ASSERTION IS NOT ABOUT COPY AT ALL. The discipline value
// crosses the wire to /api/ai/draft-program as the model's prompt input, so the
// split has to hold in BOTH directions at once: the member reads a translated
// LABEL while the writer receives the canonical English TOKEN. That is a claim
// about behaviour, so it is DRIVEN — a real jsdom mount, a real chip click, a
// real save — not grepped. Half of it passing is the dangerous state, so both
// halves are pinned in one test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');
const React = require_('react');
const { JSDOM } = require_('jsdom');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// ⚠ AFTER the globals, never before. react-dom decides at module init whether it
// is in a DOM environment; required first it never attaches its event listeners,
// so every click and keystroke lands on the DOM and nothing reaches React — the
// component renders, the assertions read a plausible screen, and the interactive
// half of this file tests nothing. Cost this cut a debugging round.
const ReactDOMClient = require_('react-dom/client');

// A total theme: this file tests copy routing and the token split, not the
// palette, so an enumerated stub would fail for an unrelated reason.
const THEME = new Proxy({ MONO: 'mono', DISPLAY: 'display', padX: 18, isLight: true, isMetric: false }, {
  get: (o, k) => (k in o ? o[k] : '#000'),
  has: () => true,
});
window.useBS = globalThis.useBS = () => THEME;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.BSLogo = () => React.createElement('span', null, 'SHAPE');
globalThis.BS_MAST_TOP_CSS = '44px';
globalThis.BSFacetAvatar = ({ initial }) => React.createElement('span', null, initial);
for (const n of ['BSPage', 'BSFooter', 'BSEyebrow', 'BSMasthead', 'BSPageHeader', 'BSBackButton', 'BSAvatar', 'BSPlate']) {
  globalThis[n] = ({ children }) => React.createElement('div', null, children);
}
globalThis.useStateBSC = (init) => React.useState(init);
globalThis._bsScrollTopOnMount = () => {};

// ── translators ──────────────────────────────────────────────────────────────
// RENAMING: every key answers with a sentinel, so a hardcoded English literal
// is the one thing that cannot appear in the markup.
const MARK = (key) => `⟦${key}⟧`;
const renaming = { t: (key) => (String(key).includes(':') ? MARK(key) : undefined) };
// REAL: the shipped `en` catalogs, so each assertion is also a live check that
// the key resolves — a typo fails here, on the screen it would break.
const CAT = new Map();
const catalog = (ns) => {
  if (!CAT.has(ns)) {
    const p = join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', `${ns}.json`);
    CAT.set(ns, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return CAT.get(ns);
};
const real = {
  t(key, opts) {
    const i = String(key).indexOf(':');
    if (i < 0) return undefined;
    const cat = catalog(key.slice(0, i));
    const raw = cat && cat[key.slice(i + 1)];
    if (raw == null) return undefined;
    let out = String(raw).replace(/\{\s*count\s*,\s*plural\s*,([\s\S]*)\}\s*$/, (m, body) => {
      const pick = (opts && opts.count === 1) ? /one\s*\{([^{}]*)\}/ : /other\s*\{([^{}]*)\}/;
      const hit = body.match(pick);
      return hit ? hit[1].replace(/#/g, String(opts.count)) : m;
    });
    return out.replace(/\{\s*([A-Za-z_][\w-]*)\s*(?:,[^{}]*)?\}/g, (m, n) => (opts && n in opts ? String(opts[n]) : m));
  },
};

async function loadModule() {
  const dir = dirname(SRC);
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\n`
    + 'export { BSWorkoutBuilder, BS_BUILDER_DISCIPLINES, BS_BUILDER_PROG_DISCIPLINES, BS_BUILDER_EXPERIENCE, bsDisciplineLabel, bsExperienceLabel };\n';
  const { code } = babel.transformSync(source, {
    presets: [presetReact], plugins: [commonjs], babelrc: false, configFile: false, filename: SRC,
  });
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]);
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

// A real client mount so a chip can actually be clicked and a save actually run.
async function mount(i18n, props = {}) {
  window.ShapeI18n = globalThis.ShapeI18n = i18n;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(MOD.BSWorkoutBuilder, { onClose: () => {}, onSaved: () => {}, ...props })); });
  const click = async (el) => {
    assert.ok(el, 'nothing to click');
    await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  };
  const buttons = () => [...host.querySelectorAll('button')];
  const byText = (txt) => buttons().find((b) => b.textContent.trim() === txt);
  const type = async (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  };
  return { host, root, click, buttons, byText, type, html: () => host.innerHTML };
}

test('guard the guard — the builder mounts and its form is on screen', async () => {
  const m = await mount(real);
  assert.match(m.html(), /Discipline/, 'the form did not render — every assertion below would be vacuous');
  assert.ok(m.byText('Strength'), 'the discipline chips did not render');
  assert.ok(m.buttons().length > 10, `only ${m.buttons().length} buttons rendered`);
  m.root.unmount();
});

test('the discipline chips route through the catalog — the ARRAY LITERAL shape', async () => {
  const m = await mount(renaming);
  for (const d of MOD.BS_BUILDER_DISCIPLINES) {
    assert.ok(m.html().includes(MARK(`session:build.disc.${d}`)), `session discipline "${d}" is hardcoded`);
  }
  // The English tokens must not be on screen as labels.
  assert.equal(m.byText('Strength'), undefined);
  assert.equal(m.byText('Conditioning'), undefined);
  m.root.unmount();
});

test('the program discipline chips route too — including triathlon, which only they offer', async () => {
  const m = await mount(renaming, { seed: { mode: 'program' } });
  for (const d of MOD.BS_BUILDER_PROG_DISCIPLINES) {
    assert.ok(m.html().includes(MARK(`session:build.disc.${d}`)), `program discipline "${d}" is hardcoded`);
  }
  assert.ok(MOD.BS_BUILDER_PROG_DISCIPLINES.includes('triathlon'));
  m.root.unmount();
});

test('the experience chips route through the catalog — the ARRAY LITERAL shape', async () => {
  // autoDraft opens the ✦ sheet on mount, which is where they live.
  const m = await mount(renaming, { seed: { mode: 'program', autoDraft: true } });
  for (const x of MOD.BS_BUILDER_EXPERIENCE) {
    assert.ok(m.html().includes(MARK(`session:build.exp.${x}`)), `experience "${x}" is hardcoded`);
  }
  assert.equal(m.byText('Beginner'), undefined);
  m.root.unmount();
});

test('THE WIRE GETS THE TOKEN WHILE THE MEMBER READS THE LABEL', async () => {
  const saved = [];
  window.ShapeSelfTraining = { saveSession: async (p) => { saved.push(p); return {}; }, saveProgram: async () => ({ count: 1 }) };
  window.__bsToast = () => {};
  const m = await mount(renaming);
  // Pick a discipline by the word the MEMBER can see — the translated label.
  await m.click(m.byText(MARK('session:build.disc.run')));
  await m.type(m.host.querySelector('input[list="bs-move-names"]'), 'Tempo');
  await m.click(m.byText(MARK('session:build.addSession')));
  await React.act(async () => {});
  assert.equal(saved.length, 1, 'the save never ran');
  // Both halves, because half of this passing is the dangerous state.
  assert.equal(saved[0].discipline, 'run', 'a TRANSLATED discipline crossed the wire — the token/label split is broken');
  assert.ok(m.html().includes(MARK('session:build.disc.run')), 'the member never saw a translated label');
  m.root.unmount();
});

test('a record NAME default is never translated at the write', async () => {
  const saved = [];
  window.ShapeSelfTraining = { saveSession: async (p) => { saved.push(p); return {}; }, saveProgram: async () => ({ count: 1 }) };
  window.__bsToast = () => {};
  const m = await mount(renaming);
  await m.type(m.host.querySelector('input[list="bs-move-names"]'), 'Tempo');
  await m.click(m.byText(MARK('session:build.addSession')));
  await React.act(async () => {});
  // It is written INTO the member's own saved session, so translating it at the
  // write would freeze one language into their data (the record-shape ruling).
  assert.equal(saved[0].name, 'My workout');
  m.root.unmount();
});

test('the plain-JS status and toast strings route through the catalog', async () => {
  const toasts = [];
  window.ShapeSelfTraining = { saveSession: async () => ({}), saveProgram: async () => ({ count: 1 }) };
  window.__bsToast = (msg) => toasts.push(msg);
  // No move name → the guard fires and sets `status`, which the walk never sees.
  const m = await mount(renaming);
  await m.click(m.byText(MARK('session:build.addSession')));
  assert.ok(m.html().includes(MARK('session:build.err.needMove')), 'the empty-form status is hardcoded');
  await m.type(m.host.querySelector('input[list="bs-move-names"]'), 'Tempo');
  await m.click(m.byText(MARK('session:build.addSession')));
  await React.act(async () => {});
  assert.deepEqual(toasts, [MARK('session:build.toast.sessionAdded')], 'the save toast is hardcoded');
  m.root.unmount();
});

test('the weekday chips are formatted, not a hardcoded English array', async () => {
  const en = await mount({ ...real, intlLocale: () => 'en' });
  assert.ok(en.byText('Mon'), 'Monday is not first — the builder dow convention is 0 = Monday');
  assert.ok(en.byText('Sun'));
  en.root.unmount();
  const de = await mount({ ...real, intlLocale: () => 'de' });
  // A hardcoded array cannot do this.
  assert.ok(de.byText('Mo'), 'the day letters did not follow the selected language');
  assert.equal(de.byText('Mon'), undefined);
  de.root.unmount();
});

test('every discipline and experience token has a catalog key — derived, not enumerated', () => {
  const cat = catalog('session');
  const tokens = new Set([...MOD.BS_BUILDER_DISCIPLINES, ...MOD.BS_BUILDER_PROG_DISCIPLINES]);
  assert.ok(tokens.size >= 8, `only ${tokens.size} discipline tokens found`);
  for (const d of tokens) assert.ok(cat[`build.disc.${d}`], `discipline token "${d}" has no catalog key`);
  for (const x of MOD.BS_BUILDER_EXPERIENCE) assert.ok(cat[`build.exp.${x}`], `experience token "${x}" has no catalog key`);
});

test('an unknown token renders as ITSELF — never a raw key, never blank', () => {
  // A discipline can arrive from a drafted program, i.e. from model output, so
  // the set cannot be enumerated here by construction.
  assert.equal(MOD.bsDisciplineLabel('fell-running', renaming.t), 'fell-running');
  assert.equal(MOD.bsExperienceLabel('elite', renaming.t), 'elite');
  // And with no translator at all it still degrades to the token.
  assert.equal(MOD.bsDisciplineLabel('run', null), 'run');
});
