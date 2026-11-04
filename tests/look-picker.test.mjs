// The profile editor's Colors page as the lit panel the owner picked (2026-11-04: "update profile edit settings
// page", then "B for colors"): BSLookPicker.jsx, MOUNTED in jsdom with real React. Three raised plates (the Shape
// looks, the paper, the accent); the paper and the accent read their pick in a lit slot; a look, a paper or an
// accent picked hands the whole next look on, keeping its other fields; the check under the accents says whether
// buttons and text read. Make it yours draws it on its Colors tab, the preview in the panel's bezel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const { IntlMessageFormat } = require_('intl-messageformat');
const cats = Object.fromEntries(['profile', 'settings'].map((ns) => [ns, JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/en/${ns}.json`), 'utf8'))]));
W.ShapeI18n = { t: (key, opts = {}) => { const [ns, k] = key.split(':'); const m = cats[ns] && cats[ns][k]; return m == null ? undefined : new IntlMessageFormat(m, 'en').format(opts); } };
// The app's makePalette, in miniature: a dark or a light paper and the accent as asked.
const LIGHT = new Set(['bone', 'paper', 'white', 'manila', 'cream', 'sage', 'blush', 'mist', 'silver']);
const ACC = { teal: ['#0a8f87', '#34d6c5'], rust: ['#a8331b', '#e06547'], amber: ['#c8881a', '#e3a544'], black: ['#000000', '#000000'], white: ['#ffffff', '#ffffff'], blue: ['#1c4ed8', '#5b8df9'], green: ['#2f6b3a', '#5fb16e'], violet: ['#6d3fc4', '#a78bfa'], rose: ['#b8285f', '#f2749f'] };
W.makePalette = ({ paperMode, accentKey }) => {
  const light = LIGHT.has(paperMode);
  // Black on a dark paper and white on a light one vanish, so the app swaps them, as makePalette does.
  let accent = (ACC[accentKey] || ACC.teal)[light ? 0 : 1];
  if (!light && accentKey === 'black') accent = '#ffffff';
  if (light && accentKey === 'white') accent = '#000000';
  return { PAPER: light ? '#f4efe4' : '#0f0e0c', PAPER2: light ? '#ede6d6' : '#181612', PAPER_BG: light ? '#f4efe4' : '#0f0e0c', INK: light ? '#14120f' : '#f5f0e6', inkRGB: light ? '20,18,15' : '245,240,230', isLight: light, ACCENT: accent };
};

const M = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSLookPicker.jsx'), { registry: new Map([['react', React]]) });
const PC = await import(join(ROOT, 'public/newdesign/profileCustom.mjs'));
const tr = (key, opts) => { const v = W.ShapeI18n.t(key, opts); return v == null ? (opts && opts.defaultValue) || key : v; };

async function mount(look) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const picks = [];
  function Page() {
    const [l, setL] = React.useState(look);
    return React.createElement(M.BSLookPicker, { tr, look: l, setLook: (n) => { picks.push(n); setL(n); } });
  }
  await React.act(async () => { root.render(React.createElement(Page)); });
  return {
    host, picks,
    q: (s) => host.querySelector(s),
    qa: (s) => [...host.querySelectorAll(s)],
    click: (el) => React.act(async () => { el.click(); }),
    close: () => React.act(async () => { root.unmount(); host.remove(); }),
  };
}

test('three raised plates: the Shape looks, the paper and the accent, each pick read in a lit slot', async () => {
  const m = await mount({ paper: 'dark', accent: 'teal', focus: 'top' });
  try {
    assert.deepEqual(m.qa('[data-colors-plate]').map((p) => p.getAttribute('data-colors-plate')), ['looks', 'paper', 'accent']);
    assert.equal(m.qa('[data-look]').length, M.PRESETS.length);
    assert.equal(m.qa('[data-paper]').length, PC.BS_LOOK_PAPERS.length, 'every paper the profile can carry');
    assert.equal(m.qa('[data-accent]').length, PC.BS_LOOK_ACCENTS.length, 'every accent the profile can carry');
    const leds = m.qa('[data-led="on"]').map((l) => l.textContent);
    assert.equal(leds.length, 2);
    assert.match(leds[0], /^Paper · /);
    assert.match(leds[1], /^Accent · /);
    // The picks are pressed, and lit: framed and glowing.
    assert.equal(m.q('[data-look="shape"]').getAttribute('aria-pressed'), 'true');
    assert.equal(m.q('[data-paper="dark"]').getAttribute('aria-pressed'), 'true');
    assert.match(m.q('[data-paper="dark"]').style.boxShadow, /0 0 14px/);
    assert.doesNotMatch(m.q('[data-paper="bone"]').style.boxShadow, /0 0 14px/);
    assert.match(m.q('[data-accent="teal"] [data-lamp]').style.boxShadow, /0 0 12px/);
    assert.equal(m.q('[data-look-check]').getAttribute('data-look-check'), 'ok');
  } finally { await m.close(); }
});

test('a look, a paper or an accent picked hands the whole next look on, its other fields kept', async () => {
  const m = await mount({ paper: 'dark', accent: 'teal', focus: 'top' });
  try {
    await m.click(m.q('[data-look="bone"]'));
    assert.deepEqual(m.picks.at(-1), { paper: 'bone', accent: 'rust', focus: 'top' });
    await m.click(m.q('[data-paper="blueprint"]'));
    assert.deepEqual(m.picks.at(-1), { paper: 'blueprint', accent: 'rust', focus: 'top' });
    await m.click(m.q('[data-accent="amber"]'));
    assert.deepEqual(m.picks.at(-1), { paper: 'blueprint', accent: 'amber', focus: 'top' });
    assert.equal(m.q('[data-look="blueprint"]').getAttribute('aria-pressed'), 'true', 'the look it matches lights');
    assert.match(m.qa('[data-led="on"]')[1].textContent, /Amber$/);
    // Every target is 44px or more.
    for (const b of m.qa('button')) {
      const h = Math.max(parseFloat(b.style.minHeight) || 0, parseFloat(b.style.height) || 0);
      assert.ok(h >= 44, `${b.getAttribute('aria-label') || b.textContent} is ${h}px tall`);
    }
  } finally { await m.close(); }
});

test('the check says when an accent would vanish on the paper and what the buttons use instead', async () => {
  const m = await mount({ paper: 'dark', accent: 'black' });
  try {
    assert.equal(m.q('[data-look-check]').getAttribute('data-look-check'), 'warn');
    assert.match(m.q('[data-look-check]').textContent, /would vanish on/);
  } finally { await m.close(); }
});

test('Make it yours draws the picker on its Colors tab, the preview in the panel\'s bezel there only', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSMakeItYours.jsx'), 'utf8');
  assert.match(src, /from '\.\/BSLookPicker\.jsx'/);
  assert.match(src, /function ColorsTab\(\{ tr, look, setLook \}\) \{\n\s*return <BSLookPicker tr=\{tr\} look=\{look\} setLook=\{setLook\} \/>;/);
  assert.match(src, /<Preview [^\n]*lit=\{tab === 'colors'\} \/>/);
  assert.match(src, /return lit \? <BSLookBezel style=\{\{ marginTop: 14 \}\}>\{card\}<\/BSLookBezel> : card;/);
  const mod = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSLookPicker.jsx'), 'utf8');
  assert.doesNotMatch(mod, /from '\.\/iosAppBroadsheetClient/, 'a feature module never imports the client');
});
