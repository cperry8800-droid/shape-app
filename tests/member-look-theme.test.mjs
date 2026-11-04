// The theme a member's profile is painted in, once they pick a paper (owner, 2026-11-04: members get the colours
// coaches got): the chrome's bsLookTheme (mobile-app/src/broadsheet/iosAppBroadsheet.jsx), which BSTerrainProfile
// hands to all it holds through BSContext (tests/member-look.test.mjs drives that). MOUNTED: the real BSProvider.
//
// It is exactly what a BSProvider with the look's paper and accent gives, with every other setting the reader's
// (density, borders, weight, text size, texture), and the reader's ink override left out: that is theirs, not
// part of the look, as BSTrainerProfile's own provider leaves it out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');
await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });

// The theme a BSProvider with these settings hands its page.
async function themeOf(settings) {
  let seen = null;
  function Probe() { seen = window.useBS(); return null; }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(React.createElement(window.BSProvider, settings, React.createElement(Probe))); });
  await act(async () => root.unmount());
  return seen;
}
// A theme as plain values (the unit formatters are fresh functions on every render, so they compare by kind).
const values = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'function' ? 'fn' : v]));

const READER = { paperMode: 'dark', accentKey: 'blue', densityKey: 'dense', borderKey: 'thick rules', weightKey: 'bold', textScaleKey: 'large', textureKey: 'grid', textureColor: 'auto' };

test('a look\'s theme is exactly the provider\'s for that paper and accent, with the reader\'s other settings', async () => {
  assert.equal(typeof window.bsLookTheme, 'function', 'the chrome does not publish bsLookTheme');
  const reader = await themeOf(READER);
  for (const [paper, accent] of [['bone', 'rust'], ['plum', 'violet'], ['steel', 'black'], ['dark', 'white'], ['manila', 'teal']]) {
    const want = await themeOf({ ...READER, paperMode: paper, accentKey: accent });
    const got = window.bsLookTheme(reader, { paper, accent });
    assert.deepEqual(values(got), values(want), `${paper} / ${accent}`);
  }
  // The page reads what the look changes: its paper, ink, accent, borders and texture tint.
  const bone = window.bsLookTheme(reader, { paper: 'bone', accent: 'rust' });
  assert.equal(bone.isLight, true);
  assert.equal(bone.PAPER, '#ece4d3');
  assert.equal(bone.ACCENT, '#a8331b');
  assert.notEqual(bone.B.rule, reader.B.rule, 'the borders kept the reader\'s ink');
  assert.notEqual(bone.TEXTURE, reader.TEXTURE, 'the texture kept the reader\'s tint');
  assert.equal(bone.densityKey, 'dense');
  assert.equal(bone.padX, reader.padX);
});

test('a look with no accent of its own keeps the reader\'s; the reader\'s ink override stays theirs', async () => {
  const reader = await themeOf({ ...READER, accentKey: 'amber', inkOverride: '#ff8800' });
  assert.equal(reader.INK, '#ff8800', 'the fixture\'s override did not take');
  const got = window.bsLookTheme(reader, { paper: 'forest' });
  const want = await themeOf({ ...READER, accentKey: 'amber', paperMode: 'forest' });
  assert.deepEqual(values(got), values(want));
  assert.notEqual(got.INK, '#ff8800');
});
