// THE LIGHT LAYERS, MOUNTED, AND THE ONE READING THEY ALL FOLLOW.
//
// WHY THIS FILE EXISTS: Immersive drew the same three layers as Subtle on a clock
// that ignored the music (its "button halos" were never built). It now adds stage
// lights, every mode gets an edge light, and all of it follows one reading of the
// radio per frame (iosAppReactive.jsx `radioLight`). These suites drive the
// shipping modules in jsdom:
//   - each layer is decoration (aria-hidden, no taps) at its place in the stack,
//     stands on the floor it is given, and stops its loop on unmount;
//   - the reading is measured when the analyser carries data, idle when it reads
//     all zeros (a stream we cannot read), and the demo when nothing plays — and
//     the analyser is read ONCE per frame however many layers ask;
//   - each mode mounts what its Settings cell promises;
//   - the call sites: the playing overlay is `live`, the Settings preview is not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROADSHEET = join(ROOT, 'mobile-app', 'src', 'broadsheet');

const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const frames = new Map();
const cancelled = [];
let frameId = 0;
globalThis.requestAnimationFrame = (cb) => { frameId += 1; frames.set(frameId, cb); return frameId; };
globalThis.cancelAnimationFrame = (id) => { cancelled.push(id); frames.delete(id); };
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
dom.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
function flushFrame(at) { const due = [...frames.values()]; frames.clear(); for (const cb of due) cb(at); }

const mobileRequire = createRequire(join(ROOT, 'mobile-app', 'src', 'x.js'));
const React = mobileRequire('react');
const ReactDOMClient = mobileRequire('react-dom/client');
const { act } = React;
const L = await import(join(ROOT, 'mobile-app', 'src', 'services', 'radioLight.mjs'));
const lights = await loadRealModule(join(BROADSHEET, 'iosAppRadioLights.jsx'), { registry: new Map([['react', React]]) });
await loadRealModule(join(BROADSHEET, 'iosAppReactive.jsx'), { registry: new Map([['react', React]]) });
const W = dom.window;

function mount(Comp, props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  act(() => { root.render(React.createElement(Comp, props)); });
  return { host, unmount: () => { act(() => root.unmount()); host.remove(); } };
}
const demo = (now) => ({ ...L.rlDemo(now), clock: now });

test('each light layer is decoration at its place in the stack', () => {
  for (const [name, z] of [['RadioBgBloom', '0'], ['RadioStageLights', '1'], ['RadioEdgeLight', '9']]) {
    const m = mount(lights[name], { color: '#0ac5a8', sample: demo, floor: 64 });
    const el = m.host.firstElementChild;
    assert.equal(el.getAttribute('aria-hidden'), 'true', `${name} is read out`);
    assert.equal(el.style.pointerEvents, 'none', `${name} takes taps`);
    assert.equal(el.style.zIndex, z, `${name} left its place in the stack`);
    m.unmount();
  }
});

test('the gels are the tint and its partner on dark paper, deepened on light paper', () => {
  const dark = mount(lights.RadioEdgeLight, { color: '#f2ede4', isLight: false, sample: demo });
  const light = mount(lights.RadioEdgeLight, { color: '#f2ede4', isLight: true, sample: demo });
  const v = (m, k) => m.host.firstElementChild.style.getPropertyValue(k);
  assert.equal(v(dark, '--rl-a'), L.rlRgbVar(L.rlGels('#f2ede4', false)[0]));
  assert.equal(v(light, '--rl-a'), L.rlRgbVar(L.rlGels('#f2ede4', true)[0]));
  assert.notEqual(v(light, '--rl-a'), v(dark, '--rl-a'), 'cream on light paper was not deepened: it would vanish');
  assert.notEqual(v(dark, '--rl-b'), v(dark, '--rl-a'), 'the partner gel is the same as the tint');
  // ...and the loop keeps them deepened when it refreshes the palette
  act(() => flushFrame(5000));
  assert.equal(v(light, '--rl-a'), L.rlRgbVar(L.rlGels('#f2ede4', true)[0]), 'the palette refresh dropped the light-paper gels');
  dark.unmount(); light.unmount();
});

test('the edge light and the pool stand on the floor they are given', () => {
  const edge = mount(lights.RadioEdgeLight, { sample: demo, floor: 64 });
  const strips = [...edge.host.firstElementChild.children];
  assert.equal(strips.length, 3, 'two sides and a floor');
  for (const s of strips) assert.equal(s.style.bottom, '64px');
  edge.unmount();
  // the pool is centred on the floor line: half of its 140 px under it
  for (const [floor, want] of [[64, '-6px'], [0, '-70px']]) {
    const stage = mount(lights.RadioStageLights, { sample: demo, floor });
    const pool = [...stage.host.firstElementChild.children].pop();
    assert.equal(pool.style.bottom, want, `on floor ${floor} the pool is not centred on the floor line`);
    stage.unmount();
  }
});

test('a frame moves the beams; unmount stops the loop', () => {
  frames.clear(); cancelled.length = 0;
  const m = mount(lights.RadioStageLights, { sample: demo, floor: 64 });
  assert.equal(frames.size, 1, 'the stage lights do not run one loop');
  act(() => flushFrame(4600)); // inside the demo drop
  const beams = [...m.host.querySelectorAll('div')].filter((d) => /^rotate\(/.test(d.style.transform));
  assert.equal(beams.length, 4, 'four beams');
  const angles = beams.map((b) => b.style.transform);
  assert.equal(new Set(angles).size, 1, `on the drop the beams do not swing together: ${angles}`);
  const pending = [...frames.keys()][0];
  m.unmount();
  assert.ok(cancelled.includes(pending), 'unmount left the loop running');
});

// ── the shared reading ───────────────────────────────────────────────────

function withAnalyser(bins, fn) {
  let reads = 0;
  W.ShapeRadioLive = { analyser: () => ({ frequencyBinCount: bins.length, getByteFrequencyData: (a) => { reads += 1; a.set(bins); } }) };
  try { return fn(() => reads); } finally { delete W.ShapeRadioLive; }
}

test('the reading: demo when nothing plays, idle on a stream we cannot read, measured on one we can', () => {
  assert.equal(W.radioLight(100000, false).source, 'demo');
  withAnalyser(new Uint8Array(256), () => {
    assert.equal(W.radioLight(110000, true).source, 'idle', 'an all-zero stream was read as music');
    assert.equal(W.radioLight(110016, true).kick, 0);
  });
  const loud = new Uint8Array(256).fill(120);
  withAnalyser(loud, () => {
    assert.equal(W.radioLight(120000, true).source, 'measured');
  });
  assert.equal(W.radioLight(130000, true).source, 'idle', 'with no radio at all the lights claim a reading');
});

test('the analyser is read once a frame, however many layers ask', () => {
  withAnalyser(new Uint8Array(256).fill(90), (reads) => {
    const a = W.radioLight(140000, true);
    for (let i = 0; i < 6; i++) assert.equal(W.radioLight(140000, true), a, 'a second layer got a different reading in the same frame');
    assert.equal(reads(), 1, `the analyser was read ${reads()} times in one frame`);
    W.radioLight(140016, true);
    assert.equal(reads(), 2);
  });
});

test('after a pause the demo starts over, so the 6 s preview always shows its drop', () => {
  W.radioLight(200000, false);
  W.radioLight(200016, false);
  const later = W.radioLight(260000, false); // a minute later: a new preview
  assert.ok(later.clock < 50, `the demo resumed at ${later.clock} ms instead of starting over`);
});

// ── the modes ───────────────────────────────────────────────────────────

test('each mode mounts what its Settings cell promises', () => {
  const layers = (host) => [...host.querySelectorAll('div[aria-hidden="true"]')].filter((d) => d.style.getPropertyValue('--rl-a')).map((d) => d.style.zIndex).sort();
  const subtle = mount(W.RadioEffects, { mode: 'subtle', tint: '#0ac5a8' });
  assert.deepEqual(layers(subtle.host), ['0', '9'], 'Subtle: the bloom and the edge light');
  subtle.unmount();
  const imm = mount(W.RadioEffects, { mode: 'immersive', tint: '#0ac5a8', floor: 64 });
  assert.deepEqual(layers(imm.host), ['0', '1', '9'], 'Immersive: the stage lights on top of Subtle');
  imm.unmount();
  const off = mount(W.RadioEffects, { mode: 'off' });
  assert.equal(off.host.childElementCount, 0);
  off.unmount();
});

// ── the call sites ──────────────────────────────────────────────────────

const CLIENT = readFileSync(join(BROADSHEET, 'iosAppBroadsheetClient.jsx'), 'utf8');

test('the playing overlay reads the music; the Settings preview runs the demo', () => {
  const mounts = [...CLIENT.matchAll(/<RadioEffects [^>]*\/>/g)].map((m) => m[0]);
  const playing = mounts.find((p) => /r\.fxMode/.test(p));
  const preview = mounts.find((p) => /fxPreview/.test(p));
  assert.ok(playing && preview, 'a RadioEffects mount is gone');
  assert.match(playing, /\blive \/>/, 'the playing overlay does not read the music');
  assert.doesNotMatch(preview, /\blive\b/, 'the preview reads a radio that is not playing');
});

test('Immersive’s Settings cell names the stage lights in every language', () => {
  const dir = join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs');
  const locales = readdirSync(dir);
  assert.ok(locales.length >= 13);
  const en = JSON.parse(readFileSync(join(dir, 'en', 'settings.json'), 'utf8'))['fx.subImmersive'];
  assert.equal(en, 'Stage lights · beams');
  assert.match(CLIENT, /fx\.subImmersive', \{ defaultValue: 'Stage lights · beams' \}/);
  for (const loc of locales) {
    const v = JSON.parse(readFileSync(join(dir, loc, 'settings.json'), 'utf8'))['fx.subImmersive'];
    assert.ok(v && !/halo|bloom/i.test(v), `${loc} still promises the halos: ${v}`);
  }
});

test('the hologram DJ moves on the music’s kick when there is music', async () => {
  const { RadioHologramDJ } = await loadRealModule(join(BROADSHEET, 'iosAppHologramDJ.jsx'), { registry: new Map([['react', React]]) });
  const bobAt = (kick) => {
    frames.clear();
    const read = { ...L.rlIdle(0), source: 'measured', measured: true, kick, clock: 0 };
    const m = mount(RadioHologramDJ, { color: '#0ac5a8', sample: () => read });
    act(() => flushFrame(performance.now() + 1000));
    const body = [...m.host.querySelectorAll('div')].find((d) => /translate\(.*rotate/.test(d.style.transform));
    const y = body ? +body.style.transform.match(/translate\([^,]+,\s*(-?[\d.]+)px\)/)[1] : NaN;
    m.unmount();
    return y;
  };
  const hit = bobAt(1), still = bobAt(0);
  assert.ok(Number.isFinite(hit) && Number.isFinite(still), 'could not read the DJ’s body');
  assert.ok(hit - still > 0.9, `the DJ’s bob did not follow the music’s kick (${still} → ${hit})`);
});

