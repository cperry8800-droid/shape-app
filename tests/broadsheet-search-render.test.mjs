// MOUNT the universal search surface — because three of its copy shapes are
// INVISIBLE to the i18n inventory walk, so the ratchet cannot defend them.
//
// WHY THIS FILE EXISTS. `tests/i18n-surface-inventory.test.mjs` reads JSX text
// and an allowlist of attributes. It cannot see a string that is:
//   1. an ARRAY LITERAL mapped to elements — the four filter chips,
//      `[['all', 'All'], ['members', 'Members'], …].map(…)`
//   2. a LOCAL ARROW FUNCTION's return — the three role nouns,
//      `const roleLabel = (r) => r === 'trainer' ? 'Trainer' : …`
//   3. a LOCAL CONST TERNARY rendered as `{label}` — the three follow states,
//      `const label = st.following ? 'Following' : … : 'Follow'`
// Ten member-facing words on ONE screen, and BSSearchFollowBtn read
// `tr: 0, hard: 0` — the walk's way of saying "renders no user copy" — while
// showing an English Follow / Following / Requested in thirteen locales.
//
// So reverting any of them to a hardcoded literal would leave the ratchet, the
// catalog parity gate, tsc, the build and the whole suite green. This file is
// the only thing that would go red. It DRIVES the components rather than
// grepping the source: a translator that renames every key is installed, and
// the markup must carry the renamed keys and NOT the English words — so any
// equivalent rewrite that still routes through `tr()` passes, and a spelling
// change to the surrounding code does not.
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
const ReactDOMServer = require_('react-dom/server');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

// A total theme: this file tests copy routing, not the palette, so an
// enumerated stub would fail for a reason unrelated to the code under test.
const THEME = new Proxy({ MONO: 'mono', DISPLAY: 'display', padX: 18, isLight: true }, {
  get: (o, k) => (k in o ? o[k] : '#000'),
  has: () => true,
});

globalThis.window = globalThis;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.useBS = () => THEME;
globalThis.BSLogo = () => React.createElement('span', null, 'SHAPE');
globalThis.BS_MAST_TOP_CSS = '44px';
globalThis.BSFacetAvatar = ({ initial }) => React.createElement('span', null, initial);
for (const n of ['BSPage', 'BSFooter', 'BSEyebrow', 'BSMasthead', 'BSPageHeader', 'BSBackButton', 'BSAvatar', 'BSPlate']) {
  globalThis[n] = ({ children }) => React.createElement('div', null, children);
}
globalThis.useStateBSC = (init) => React.useState(init);
globalThis._bsScrollTopOnMount = () => {};

// The surface is member-actionable only for a signed-in viewer looking at
// someone else — that gate is what puts the two row buttons on screen at all.
const ME = 'me-uuid';
globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: ME } }) };
// No follow state resolved yet → the ternary's default branch, the bare verb.
globalThis.ShapeFollows = { getCached: () => null, stats: () => new Promise(() => {}) };
globalThis.ShapeChannels = { list: () => new Promise(() => {}) };
globalThis.ShapeSearch = { people: () => new Promise(() => {}) };

// `recents` is seeded from localStorage in a state initializer, so a stubbed
// store puts real people rows in the FIRST server render — no effects needed.
const RECENTS = [
  { userId: 'u1', name: 'Ada Lovelace', role: 'trainer', mutuals: 3 },
  { userId: 'u2', name: 'Grace Hopper', role: 'nutritionist', followsMe: true },
  { userId: 'u3', name: 'Alan Turing', role: 'client' },
];
globalThis.localStorage = {
  getItem: (k) => (k === 'shape.recentSearch' ? JSON.stringify(RECENTS) : null),
  setItem: () => {}, removeItem: () => {},
};

// ── the two translators ──────────────────────────────────────────────────────
// RENAMING: every key answers with a sentinel, so a hardcoded English literal
// is the one thing that cannot appear in the markup.
const MARK = (key) => `⟦${key}⟧`;
const renaming = {
  t(key, opts) {
    if (!String(key).includes(':')) return undefined;
    // Keep interpolation observable — a key that swallowed its {name} would
    // otherwise pass while rendering a nameless label.
    const vars = opts ? Object.keys(opts).filter((k) => k !== 'defaultValue' && k !== 'count') : [];
    const args = vars.map((v) => `${v}=${opts[v]}`).join(',');
    const cnt = opts && 'count' in opts ? `#${opts.count}` : '';
    return MARK(key) + (args ? `(${args})` : '') + cnt;
  },
};
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
    // Enough ICU for these strings: {arg}, {arg, number} and a plural whose
    // branch is selected by `count` (one vs other is all `en` needs).
    let out = String(raw).replace(/\{\s*count\s*,\s*plural\s*,([\s\S]*)\}\s*$/, (m, body) => {
      const pick = (opts && opts.count === 1) ? /one\s*\{([^{}]*)\}/ : /other\s*\{([^{}]*)\}/;
      const hit = body.match(pick);
      return hit ? hit[1].replace(/#/g, String(opts.count)) : m;
    });
    out = out.replace(/\{\s*([A-Za-z_][\w-]*)\s*(?:,[^{}]*)?\}/g,
      (m, n) => (opts && n in opts ? String(opts[n]) : m));
    return out;
  },
};

async function loadModule() {
  const dir = dirname(SRC);
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSUniversalSearch };\n`;
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

function render(i18n) {
  globalThis.ShapeI18n = i18n;
  const warnings = [];
  const realError = console.error;
  console.error = (...a) => warnings.push(a.join(' '));
  try {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MOD.BSUniversalSearch, { onClose: () => {}, signedIn: true }),
    );
    return { html, warnings };
  } finally {
    console.error = realError;
    globalThis.ShapeI18n = undefined;
  }
}

test('guard the guard — the surface mounts and the people rows are on screen', () => {
  const { html, warnings } = render(real);
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // Without these the assertions below could pass vacuously by rendering nothing.
  assert.match(html, /Ada Lovelace/, 'the seeded recents did not render — every assertion below would be vacuous');
  assert.match(html, /Grace Hopper/);
  assert.match(html, /Alan Turing/);
});

test('the four filter chips route through the catalog — the ARRAY LITERAL shape', () => {
  const { html } = render(renaming);
  for (const k of ['common:search.filterAll', 'common:search.filterMembers', 'common:search.filterCoaches', 'feed:tab.channels']) {
    assert.ok(html.includes(MARK(k)), `filter chip ${k} is not routed through tr()`);
  }
  // The English words must be GONE — that is what a hardcoded literal fails on.
  assert.doesNotMatch(html, />All</);
  assert.doesNotMatch(html, />Members</);
  assert.doesNotMatch(html, />Coaches</);
});

test('the three role nouns route through the catalog — the ARROW FUNCTION shape', () => {
  const { html } = render(renaming);
  assert.ok(html.includes(MARK('profile:role.trainer')), 'the trainer noun is hardcoded');
  assert.ok(html.includes(MARK('profile:role.nutritionist')), 'the nutritionist noun is hardcoded');
  assert.ok(html.includes(MARK('profile:role.member')), 'the member noun is hardcoded');
  // Reused from the role family, not minted: a rename of what Shape calls a
  // trainer has to move every surface at once.
  assert.equal(catalog('profile')['role.trainer'], 'Trainer');
  assert.equal(catalog('profile')['role.nutritionist'], 'Nutritionist');
});

test('the follow pill routes through the catalog — the CONST TERNARY shape', () => {
  const { html } = render(renaming);
  // This is the component the walk scored as `tr: 0, hard: 0` — "renders no
  // user copy" — while it showed an English verb in thirteen locales.
  assert.ok(html.includes(MARK('profile:follow.followShort')), 'the Follow verb is hardcoded');
  assert.doesNotMatch(html, />Follow</);
});

test('the follow pill renders each state from its own key', () => {
  const prev = globalThis.ShapeFollows;
  try {
    globalThis.ShapeFollows = { getCached: (u) => (u === 'u1' ? { is_following: true } : u === 'u2' ? { is_pending: true } : null), stats: () => new Promise(() => {}) };
    const { html } = render(renaming);
    assert.ok(html.includes(MARK('profile:follow.following')));
    assert.ok(html.includes(MARK('profile:follow.requested')));
    assert.ok(html.includes(MARK('profile:follow.followShort')));
  } finally { globalThis.ShapeFollows = prev; }
});

test('the message aria-label is ONE key carrying the name, never a verb glued to it', () => {
  const { html } = render(renaming);
  // The name must survive INTO the key's own interpolation — a concatenated
  // `Message ${name}` would put the English verb in the markup instead.
  assert.ok(html.includes(`${MARK('profile:terrain.messageName')}(name=Ada Lovelace)`),
    'the message label is not one interpolated key');
  assert.doesNotMatch(html, /aria-label="Message /);
});

test('the possessive aria-label is ONE key — a template literal split at the placeholder is not a sentence', () => {
  const { html } = render(renaming);
  // Only non-actionable rows (a demo person, or yourself) show the chevron.
  const prev = globalThis.ShapeAuth;
  try {
    globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    const own = render(renaming).html;
    assert.ok(own.includes(`${MARK('common:search.openProfileAria')}(name=Ada Lovelace)`),
      "the possessive aria-label is not one interpolated key");
    assert.doesNotMatch(own, /aria-label="Open /);
  } finally { globalThis.ShapeAuth = prev; }
  assert.ok(html.length > 0);
});

test('the mutual count is ICU, not a letter appended by a ternary', () => {
  const { html } = render(renaming);
  assert.ok(html.includes(`${MARK('common:search.mutuals')}#3`), 'the mutual count does not carry its count through');
  const en = catalog('common')['search.mutuals'];
  assert.match(en, /plural/, 'the mutual count is not an ICU plural');
  // ru/uk need four categories — a two-branch English plural cannot express it.
  const ru = JSON.parse(readFileSync(join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'ru', 'common.json'), 'utf8'));
  assert.match(ru['search.mutuals'], /few \{/);
  assert.match(ru['search.mutuals'], /many \{/);
});

test('with the real catalogs the member still reads English', () => {
  const { html, warnings } = render(real);
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.match(html, /Trainer/);
  assert.match(html, /Nutritionist/);
  assert.match(html, /Member/);
  assert.match(html, /Follow/);
  assert.match(html, /3 mutuals/);
  assert.match(html, /Follows you/);
  assert.match(html, /aria-label="Message Ada Lovelace"/);
});
