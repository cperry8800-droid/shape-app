// THE HOLOGRAM DJ, MOUNTED: WHAT IT PROMISES THE SCREEN UNDER IT.
//
// WHY THIS FILE EXISTS: the hologram DJ sits ABOVE the member's content on every
// screen while Shape Radio plays. So the component owes the app a few things no
// screenshot shows: it never takes a tap, it never leaves an animation loop
// running after it unmounts, two copies on one page never share an SVG id (the
// #1518 lesson), it stands ON the tab bar rather than under it, and the Settings
// preview's glass never follows it onto a live screen. Each is driven here
// through a real React client mount in jsdom, on the shipping module.
//
// The wiring half at the bottom reads the call sites: the live overlay and the
// Settings preview must hand the hologram the paper and the floor, or light
// paper gets the dark palette and the booth stands under the tab bar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROADSHEET = join(ROOT, 'mobile-app', 'src', 'broadsheet');
const DJ_SRC = join(BROADSHEET, 'iosAppHologramDJ.jsx');

const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A hand-run animation clock: frames run only when a test flushes them, and
// every cancel is recorded, so "the loop stops on unmount" is a fact we can read.
const frames = new Map();
const cancelled = [];
let frameId = 0;
globalThis.requestAnimationFrame = (cb) => { frameId += 1; frames.set(frameId, cb); return frameId; };
globalThis.cancelAnimationFrame = (id) => { cancelled.push(id); frames.delete(id); };
function flushFrame(at) {
  const due = [...frames.entries()];
  frames.clear();
  for (const [, cb] of due) cb(at);
}

const mobileRequire = createRequire(join(ROOT, 'mobile-app', 'src', 'x.js'));
const React = mobileRequire('react');
const ReactDOMClient = mobileRequire('react-dom/client');
const { act } = React;
const { RadioHologramDJ } = await loadRealModule(DJ_SRC, { registry: new Map([['react', React]]) });
const core = await import(join(ROOT, 'mobile-app', 'src', 'services', 'hologramDj.mjs'));

function mount(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  act(() => { root.render(React.createElement(RadioHologramDJ, props)); });
  return {
    host,
    rerender: (p) => act(() => { root.render(React.createElement(RadioHologramDJ, p)); }),
    unmount: () => { act(() => root.unmount()); host.remove(); },
  };
}
const overlay = (host) => host.querySelector('div[aria-hidden="true"]');

test('it is decoration: aria-hidden, never takes a tap, under the edge glow (z 2)', () => {
  const m = mount({ color: '#0ac5a8', floor: 64 });
  const el = overlay(m.host);
  assert.ok(el, 'no overlay root rendered');
  assert.equal(el.style.pointerEvents, 'none');
  assert.equal(el.style.zIndex, '2');
  assert.equal(el.style.position, 'absolute');
  assert.ok(el.querySelector('svg'), 'the overlay drew nothing');
  m.unmount();
});

test('disabled, it renders nothing and runs no loop', () => {
  frames.clear();
  const m = mount({ enabled: false });
  assert.equal(m.host.childElementCount, 0);
  assert.equal(frames.size, 0, 'a disabled hologram scheduled a frame');
  m.unmount();
});

test('it stands on the floor it is given: the tab bar, or the screen edge with its corner cleared', () => {
  const tabbed = mount({ floor: 64 });
  const stage = overlay(tabbed.host).firstElementChild;
  assert.equal(stage.style.bottom, '64px', 'the booth is not standing on the tab bar');
  assert.equal(stage.style.right, `${core.HOLO_RIG.right}px`);
  tabbed.unmount();
  // the calendar and the cycle screen have no tab bar: the rig stands on the
  // surface's edge and steps in from the phone's rounded corner
  const bare = mount({ floor: 0 });
  const stage0 = overlay(bare.host).firstElementChild;
  assert.equal(stage0.style.bottom, '0px');
  assert.equal(stage0.style.right, `${core.HOLO_RIG.right + core.HOLO_RIG.corner}px`);
  bare.unmount();
});

test("the Settings preview's glass and 1.15x never follow it onto a live screen", () => {
  // The preview stands the booth on bright colour swatches, so it gets a
  // paper-coloured casing and glass and is drawn 1.15x. The calendar also has
  // floor 0 and must NOT get that panel over its day list (the defect the
  // second review round found when floor 0 alone switched it on).
  const casing = (host) => host.querySelectorAll(`[fill="${core.HOLO_CASING.dark}"], [stroke="${core.HOLO_CASING.dark}"]`).length;
  const rigScale = (host) => {
    const rig = [...host.querySelectorAll('div')].find((d) => /^scale\(/.test(d.style.transform));
    return rig && rig.style.transform;
  };
  const live = mount({ floor: 0 });
  assert.equal(casing(live.host), 0, 'a live floor-0 screen got the preview glass');
  assert.equal(rigScale(live.host), 'scale(1.000)');
  live.unmount();
  const preview = mount({ floor: 0, preview: true });
  assert.ok(casing(preview.host) > 0, 'the preview lost its glass');
  assert.equal(rigScale(preview.host), `scale(${core.HOLO_RIG.bareScale.toFixed(3)})`);
  preview.unmount();
});

test('the paper picks the palette, and a bad tint falls back to teal', () => {
  const dark = mount({ color: '#f2749f', isLight: false });
  assert.equal(overlay(dark.host).style.getPropertyValue('--hr'), core.holoPalette('#f2749f', false).rim);
  dark.unmount();
  const light = mount({ color: '#f2ede4', isLight: true });
  assert.equal(overlay(light.host).style.getPropertyValue('--hr'), core.holoPalette('#f2ede4', true).rim);
  assert.notEqual(core.holoPalette('#f2ede4', true).rim, core.holoPalette('#f2ede4', false).rim, 'both papers print cream the same');
  light.unmount();
  const bad = mount({ color: 'var(--accent)' });
  assert.equal(overlay(bad.host).style.getPropertyValue('--hr'), core.holoPalette('#0ac5a8', false).rim);
  bad.unmount();
});

test('a frame moves the figure, and unmounting cancels the loop', () => {
  frames.clear();
  cancelled.length = 0;
  const m = mount({ color: '#0ac5a8' });
  assert.equal(frames.size, 1, 'the hologram does not run one animation loop');
  const t0 = performance.now();
  act(() => flushFrame(t0 + 1000));
  const moving = [...m.host.querySelectorAll('div')].filter((d) => /translate\(/.test(d.style.transform));
  assert.ok(moving.length >= 3, `only ${moving.length} parts moved (body, head, deck hand)`);
  assert.equal(frames.size, 1, 'a frame did not schedule the next one');
  const pending = [...frames.keys()][0];
  m.unmount();
  assert.ok(cancelled.includes(pending), 'unmount left the animation loop running');
  assert.equal(frames.size, 0);
});

test('two holograms on one page never share an SVG id', () => {
  // The preview and the live overlay can both be mounted while Settings closes.
  const a = mount({ color: '#0ac5a8' });
  const b = mount({ color: '#0ac5a8', preview: true, floor: 0 });
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  assert.ok(ids.length > 4, 'the scan found no ids: it is no longer reading the drawing');
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  for (const ref of document.querySelectorAll('[mask], [clip-path]')) {
    const want = (ref.getAttribute('mask') || ref.getAttribute('clip-path')).match(/url\(#([^)]+)\)/);
    if (want) assert.ok(document.getElementById(want[1]), `url(#${want[1]}) points at nothing`);
  }
  a.unmount();
  b.unmount();
});

test('the component itself is deterministic and stays off WebGL', () => {
  const code = readFileSync(DJ_SRC, 'utf8').replace(/\/\/.*$/gm, '');
  for (const bad of [/Math\.random/, /\bDate\b/, /webgl/i, /getContext\(/]) assert.ok(!bad.test(code), `iosAppHologramDJ.jsx uses ${bad}`);
});

// ── the call sites ─────────────────────────────────────────────────────────

const REACTIVE = readFileSync(join(BROADSHEET, 'iosAppReactive.jsx'), 'utf8');
const CLIENT = readFileSync(join(BROADSHEET, 'iosAppBroadsheetClient.jsx'), 'utf8');

test('RadioEffects hands the paper, the floor and the preview flag to the hologram', () => {
  assert.match(REACTIVE, /import \{ RadioHologramDJ \} from '\.\/iosAppHologramDJ\.jsx';/);
  assert.doesNotMatch(REACTIVE, /function RadioHologramDJ/, 'the old in-file hologram is back');
  assert.match(REACTIVE, /function RadioEffects\(\{[^}]*isLight = false, floor = 0, preview = false, live = false \}\)/);
  assert.match(REACTIVE, /mode === 'hologram' && <RadioHologramDJ color=\{color\} isLight=\{isLight\} floor=\{floor\} preview=\{preview\} sample=\{sample\} \/>/);
  assert.match(REACTIVE, /Object\.assign\(window, \{[^}]*RadioHologramDJ/, 'RadioHologramDJ is no longer exposed on window');
});

test('the live overlay stands on the tab bar where there is one, and on the edge where there is not', () => {
  assert.match(CLIENT, /function BSRadioFx\(\{ floor = 0 \}\)/);
  assert.match(CLIENT, /<RadioEffects mode=\{r\.fxMode\} label=\{label\} tint=\{bsFxTint\(r\.fxColor, t\)\} isLight=\{!!t\.isLight\} floor=\{floor\} live \/>/);
  const mounts = [...CLIENT.matchAll(/<BSRadioFx([^/]*)\/>/g)].map((m) => m[1].trim());
  // calendar and cycle (no tab bar) + the tabbed main screen
  assert.deepEqual(mounts.sort(), ['', '', 'floor={window.BS_TABBAR_H || 64}']);
});

test('the Settings preview is the only mount that asks for the preview treatment', () => {
  const previews = [...CLIENT.matchAll(/<RadioEffects [^>]*\/>/g)].map((m) => m[0]);
  assert.equal(previews.length, 2, 'a third RadioEffects mount appeared: decide its floor and preview');
  const settings = previews.find((p) => /fxPreview/.test(p));
  assert.ok(settings, 'the Settings preview mount is gone');
  assert.match(settings, /isLight=\{!!t\.isLight\} floor=\{0\} preview \/>/);
  assert.equal(previews.filter((p) => /\bpreview \/>/.test(p)).length, 1);
});

test('an accent that is not #rrggbb never reaches the overlay', () => {
  const src = CLIENT.match(/function bsFxTint\(fxColor, t\) \{[\s\S]*?\n\}/);
  assert.ok(src, 'bsFxTint is gone');
  // eslint-disable-next-line no-new-func
  const bsFxTint = new Function(`${src[0]}; return bsFxTint;`)();
  assert.equal(bsFxTint('accent', { ACCENT: '#0a8f87' }), '#0a8f87');
  assert.equal(bsFxTint('accent', { ACCENT: 'var(--sh-accent)' }), null, 'a non-hex accent reached the overlay');
  assert.equal(bsFxTint('accent', {}), null);
  assert.equal(bsFxTint('cycle', { ACCENT: '#0a8f87' }), null);
  assert.equal(bsFxTint('#f2749f', {}), '#f2749f');
  assert.equal(bsFxTint('pink', {}), null);
});
