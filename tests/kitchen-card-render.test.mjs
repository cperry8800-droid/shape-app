// The mobile Kitchen Card, RENDERED with a sourced recipe.
//
// `by || 'Coach'` stamped `COACH:` on all 50 public-domain tips — a fabricated
// byline on every USDA card. A source-text guard can catch that exact spelling,
// but not the next one written a different way, and the mobile client module
// mixes recipes with unrelated domains that legitimately carry their own `by`
// field (a goal's target date, a playlist's author), so a blanket text ban there
// would fire on correct code.
//
// So this asserts the OUTCOME instead: a recipe with no author must credit its
// source and must never be attributed to a coach. Harness follows the proven
// pattern in tests/broadsheet-session-render.test.mjs — the shipping module is
// compiled and evaluated, only `window`-provided chrome is stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// Total theme map: this test is about the component surviving and crediting
// correctly, not about the palette, so an unknown token must not fail it.
const THEME = new Proxy({
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK: '#111',
  INK50: '#777', INK70: '#555', RULE: '#ccc', HAIR: '#ddd', ACCENT: '#0f766e',
  padX: 18, isLight: true, isMetric: false,
}, { get: (t, k) => (k in t ? t[k] : '#000'), has: () => true });

globalThis.window = globalThis;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.useBS = () => THEME;
globalThis.useStateBSC = (init) => React.useState(init);
globalThis._bsScrollTopOnMount = () => {};
globalThis.BSEyebrow = ({ children }) => React.createElement('div', null, children);
globalThis.BSPage = ({ children }) => React.createElement('div', null, children);
globalThis.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);

async function loadModule() {
  const dir = dirname(SRC);
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSKitchenCard };\n`;
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
const { SHAPE_KITCHEN_RECIPES, bsAllergenNoteText } = await import(pathToFileURL(join(dirname(SRC), 'shapeKitchenData.js')).href);

// renderToStaticMarkup escapes & < > " ' — a brand like "Bob's Red Mill" comes
// back as `Bob&#x27;s`. Undo exactly those five so a composed note can be compared
// against the string the composer actually produced. No regex: split/join only.
const unesc = (s) => s
  .split('&#x27;').join("'")
  .split('&quot;').join('"')
  .split('&lt;').join('<')
  .split('&gt;').join('>')
  .split('&amp;').join('&');

function render(recipe) {
  const warnings = [];
  const realError = console.error;
  console.error = (...a) => warnings.push(a.join(' '));
  try {
    return { html: ReactDOMServer.renderToStaticMarkup(React.createElement(MOD.BSKitchenCard, { recipe, no: 1 })), warnings };
  } finally {
    console.error = realError;
  }
}

test('kitchen card: a sourced recipe credits its source and is never stamped COACH', () => {
  const sourced = SHAPE_KITCHEN_RECIPES.find((r) => !r.by && r.source);
  assert.ok(sourced, 'no sourced recipe in the catalog — this assertion would prove nothing');
  assert.ok(sourced.tip, 'the sourced recipe carries no tip, so the byline under test never renders');
  const { html, warnings } = render(sourced);
  assert.deepEqual(warnings, [], 'the kitchen card logged a render warning');
  assert.ok(html.includes(sourced.source), 'the card does not credit the source');
  assert.ok(!/\bCOACH\b/i.test(html), 'a public-domain recipe was attributed to a coach');
  assert.ok(!/\bnull\b|\bundefined\b/i.test(html), 'the card rendered a null/undefined byline');
});

test('kitchen card: an authored recipe still labels its tip with the author', () => {
  const authored = SHAPE_KITCHEN_RECIPES.find((r) => r.by && r.tip);
  const { html, warnings } = render(authored);
  assert.deepEqual(warnings, [], 'the kitchen card logged a render warning');
  const first = authored.by.replace(/^Dr\.?\s+/i, '').split(' ')[0].toUpperCase();
  assert.ok(html.includes(first), `the tip is not labelled with the author (${first})`);
});

test('kitchen card: every catalog recipe renders', () => {
  assert.ok(SHAPE_KITCHEN_RECIPES.length >= 85, `only ${SHAPE_KITCHEN_RECIPES.length} recipes — the catalog is not loading`);
  const broken = [];
  for (const recipe of SHAPE_KITCHEN_RECIPES) {
    try { render(recipe); } catch (err) { broken.push(`${recipe.title}: ${err.message}`); }
  }
  assert.deepEqual(broken, [], 'a kitchen card threw while rendering');
});

// ── Allergen claim notes ───────────────────────────────────────────────────
// A "free from" claim over an AMBIGUOUS ingredient (oats, soy sauce, broth,
// margarine) is only honest because the card tells the cook which form to buy.
// Two things can go wrong on this surface and both are silent:
//   1. the note never reaches the card (a claim renders uncaveated), and
//   2. the note reaches it through the TIP block, which renders behind an
//      attribution name — putting a brand recommendation in a named
//      nutritionist's or the USDA's mouth. That fabrication is the entire
//      reason the field is `allergenNotes` and not `tip`.

test('kitchen card: an allergen note renders unattributed, never behind a byline', () => {
  const TITLE = 'Herbed baked salmon with lemon';
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === TITLE);
  assert.ok(r, `"${TITLE}" is not in the catalog — this assertion would prove nothing`);
  assert.ok(r.allergenNotes && r.allergenNotes.length, `"${TITLE}" carries no allergenNotes — the block under test never renders`);
  const n = r.allergenNotes[0];

  const { html, warnings } = render(r);
  assert.deepEqual(warnings, [], 'the kitchen card logged a render warning');
  assert.ok(html.includes(n.certification), 'the allergen note certification does not render on the card');

  const eyebrow = `ALLERGEN · ${n.allergen.toUpperCase()}`;
  assert.ok(html.includes(eyebrow), `the note is missing its unattributed eyebrow (${eyebrow})`);

  // Guard the guard: the attribution name MUST still be on the card — it labels
  // the tip. If the byline machinery stopped rendering entirely, the "not behind
  // a byline" assertion below would pass for the wrong reason.
  const attribName = String(r.by || r.source).toUpperCase();
  assert.ok(html.includes(attribName), `the tip byline (${attribName}) is not on the card — the byline assertion would pass vacuously`);

  const block = html.slice(html.indexOf(eyebrow), html.indexOf(n.certification) + n.certification.length);
  assert.ok(!block.includes(attribName), 'the allergen note rendered behind the recipe attribution — a fabricated byline');
  assert.ok(html.indexOf(n.certification) < html.indexOf(attribName),
    'the allergen note renders inside/after the bylined tip — it must be its own block above it');
});

test('kitchen card: the note renders the COMPOSED text, brands and all', () => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => (x.allergenNotes || []).some((n) => n.brands && n.brands.length));
  assert.ok(r, 'no note carries example brands — this assertion would prove nothing');
  const n = r.allergenNotes.find((x) => x.brands && x.brands.length);
  const text = bsAllergenNoteText(n);
  assert.ok(text.length > n.certification.length, 'the composer dropped the brand clause before rendering was even reached');
  assert.ok(unesc(render(r).html).includes(text), 'the card renders the raw certification, not the composed note text');
});

test('kitchen card: the allergen block renders on exactly the note-bearing recipes', () => {
  const bearing = SHAPE_KITCHEN_RECIPES.filter((r) => (r.allergenNotes || []).length > 0);
  assert.ok(bearing.length >= 14, `only ${bearing.length} note-bearing recipes — the attach loop is not running`);
  // ⚠ The other 71 have NO `allergenNotes` key at all — `undefined`, not `[]`.
  // Mapping that unguarded is a render-time crash that parses and typechecks
  // clean, so the absent path is asserted explicitly, not assumed.
  const absent = SHAPE_KITCHEN_RECIPES.filter((r) => r.allergenNotes === undefined);
  assert.ok(absent.length > 0, 'every recipe carries notes — the absent path is untested');

  const wrong = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const shown = render(r).html.includes('ALLERGEN · ');
    const expected = (r.allergenNotes || []).length > 0;
    if (shown !== expected) wrong.push(`${r.title}: rendered=${shown} expected=${expected}`);
  }
  assert.deepEqual(wrong, [], 'the allergen block rendered on the wrong set of recipes');
});
