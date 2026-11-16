// Club Shape's filmed views (owner, 2026-11-16: "make it look like the pictures, more real"; then
// "create some VIP table service on the GA dance floor as well", "as well as the booths and private
// rooms", "still need the tall ceilings with openings and views of the city skyline", and of the
// outside, "add swimming pools, tennis courts, padel courts", "maybe an outdoor track").
// clubViews.mjs says which rooms there are and which still each takes, and its createClubFilm shows
// them in a box. Both pages mount it, so what is pinned here holds for the website and the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLUB_VIEWS, CLUB_DOOR, CLUB_FIRST, CLUB_DWELL_MS, CLUB_ASSET_VERSION,
  clubView, clubRooms, nextClubView, clubDwellMs, clubPulseSeconds, clubFormat, clubSmall, clubViewUrl, createClubFilm,
} from '../public/newdesign/booth/clubViews.mjs';
import { webpSize } from './helpers/webp-size.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');

// ── the rooms ────────────────────────────────────────────────────────────────
test('the club has its door, the whole room, the floor, Nora, the rooms and the grounds the owner asked for', () => {
  const ids = CLUB_VIEWS.map((v) => v.id);
  assert.deepEqual(ids, ['arrival', 'atrium', 'floor', 'decks', 'booth', 'tables', 'balcony', 'suite', 'lounge', 'bar', 'grounds', 'pool', 'courts', 'track', 'sunset']);
  assert.equal(new Set(ids).size, ids.length);
  for (const v of CLUB_VIEWS) {
    assert.ok(v.label && v.label.length <= 18, `${v.id}: a room's name has to fit a chip`);
    assert.ok(v.alt && v.alt.length > 30, `${v.id}: the picture is described for a screen reader`);
    assert.ok(Object.isFrozen(v));
  }
  assert.equal(CLUB_DOOR, 'arrival');
  assert.equal(CLUB_FIRST, 'atrium');
  assert.equal(clubView('suite').label, 'Private room');
  assert.equal(clubView('nowhere'), null);
});

test('the rooms a visitor picks are every view but the door', () => {
  const rooms = clubRooms().map((v) => v.id);
  assert.ok(!rooms.includes(CLUB_DOOR));
  assert.equal(rooms.length, CLUB_VIEWS.length - 1);
  assert.equal(rooms[0], CLUB_FIRST);
});

test('no room is sold: nothing in the views names a price, a booking or availability', () => {
  // The floor tables, booths, private room, pools, courts and track are scenery until a product exists.
  const src = readFileSync(path.join(ROOT, 'public/newdesign/booth/clubViews.mjs'), 'utf8');
  for (const v of CLUB_VIEWS) assert.ok(!/book|reserve|price|\$|available|from \d/i.test(v.label + ' ' + v.alt), `${v.id} reads as an offer`);
  assert.match(src, /THE ROOMS AND THE GROUNDS ARE SCENERY/);
});

// ── the tour ─────────────────────────────────────────────────────────────────
test('the tour leaves the door for the whole room, walks every room once, and never returns to the door', () => {
  assert.equal(nextClubView(CLUB_DOOR), CLUB_FIRST);
  assert.equal(nextClubView('not a view'), CLUB_FIRST);
  const seen = [];
  let at = CLUB_FIRST;
  for (let i = 0; i < CLUB_VIEWS.length - 1; i++) { seen.push(at); at = nextClubView(at); }
  assert.equal(at, CLUB_FIRST, 'the tour wraps to its first room');
  assert.equal(new Set(seen).size, CLUB_VIEWS.length - 1);
  assert.ok(!seen.includes(CLUB_DOOR));
});

test('the tour steps back as well as forward, and wraps both ways', () => {
  assert.equal(nextClubView(CLUB_FIRST, -1), 'sunset');
  assert.equal(nextClubView('sunset', 1), CLUB_FIRST);
  assert.equal(nextClubView('bar', 1), 'grounds', 'after the rooms, the tour goes outside');
  assert.equal(nextClubView('floor', -1), 'atrium');
  assert.equal(nextClubView('floor', 2), 'booth');
  assert.equal(nextClubView('floor', NaN), 'decks', 'a step that is not a number is one step');
});

test('a view is held for eight bars at a measured tempo, between 9 and 20 seconds, else 12', () => {
  assert.equal(CLUB_DWELL_MS, 12000);
  assert.equal(clubDwellMs(null), 12000);
  assert.equal(clubDwellMs(undefined), 12000);
  assert.equal(clubDwellMs('fast'), 12000);
  assert.equal(clubDwellMs(0), 12000);
  assert.equal(clubDwellMs(128), 15000);       // 32 beats at 128
  assert.equal(clubDwellMs(120), 16000);
  assert.equal(clubDwellMs(240), 9000);        // 8 s, held up to the floor
  assert.equal(clubDwellMs(60), 20000);        // 32 s, held down to the ceiling
  assert.equal(clubDwellMs(500), 12000, 'a tempo nothing plays at is no tempo');
});

test('the light swells once a bar and never faster than once a second', () => {
  assert.equal(clubPulseSeconds(null), 4);
  assert.equal(clubPulseSeconds(120), 2);
  assert.equal(clubPulseSeconds(240), 1);
  for (const bpm of [40, 90, 128, 174, 240]) assert.ok(clubPulseSeconds(bpm) >= 1, `${bpm} BPM swells faster than once a second`);
  assert.equal(clubPulseSeconds(999), 4);
});

// ── which still a box takes ──────────────────────────────────────────────────
test('a box clearly taller than wide takes the tall cut; anything else the wide one', () => {
  assert.equal(clubFormat({ width: 390, height: 700 }), 'portrait');
  assert.equal(clubFormat({ width: 1180, height: 664 }), 'landscape');
  assert.equal(clubFormat({ width: 600, height: 620 }), 'landscape', 'a near-square box keeps the wide cut');
  assert.equal(clubFormat({}), 'landscape');
  assert.equal(clubFormat(), 'landscape');
});

test('a box takes the full still only when it is larger than the small one covers', () => {
  assert.equal(clubSmall({ width: 390, height: 700, dpr: 1 }), true);
  assert.equal(clubSmall({ width: 390, height: 700, dpr: 3 }), false);
  assert.equal(clubSmall({ width: 1180, height: 664, dpr: 1 }), true);
  assert.equal(clubSmall({ width: 1180, height: 664, dpr: 2 }), false);
  assert.equal(clubSmall({}), true, 'an unknown box takes the file that cannot hurt');
});

test('a still\'s address carries its cut, its size and the asset version', () => {
  assert.equal(clubViewUrl('floor'), `/club/floor-l.webp?v=${CLUB_ASSET_VERSION}`);
  assert.equal(clubViewUrl('floor', { format: 'portrait', small: true }), `/club/floor-p-sm.webp?v=${CLUB_ASSET_VERSION}`);
  assert.equal(clubViewUrl('bar', { base: 'https://www.theshapecommunity.com', small: true }), `https://www.theshapecommunity.com/club/bar-l-sm.webp?v=${CLUB_ASSET_VERSION}`);
  assert.equal(clubViewUrl('bar', { base: 'https://x.test/' }), `https://x.test/club/bar-l.webp?v=${CLUB_ASSET_VERSION}`);
  assert.equal(clubViewUrl('nowhere'), null);
});

// ── the stills themselves ────────────────────────────────────────────────────
const CUTS = [
  { cut: 'l', width: 1920, height: 1080, max: 420 * 1024 },
  { cut: 'l-sm', width: 1280, height: 720, max: 200 * 1024 },
  { cut: 'p', width: 1080, height: 1920, max: 420 * 1024 },
  { cut: 'p-sm', width: 720, height: 1280, max: 200 * 1024 },
];

test('every view has all four cuts, at their size and under their cap', () => {
  for (const v of CLUB_VIEWS) for (const c of CUTS) {
    const file = path.join(ROOT, 'public', 'club', `${v.id}-${c.cut}.webp`);
    assert.ok(existsSync(file), `public/club/${v.id}-${c.cut}.webp is missing`);
    const { width, height } = webpSize(readFileSync(file));
    assert.deepEqual({ width, height }, { width: c.width, height: c.height }, `${v.id}-${c.cut}.webp is ${width}x${height}`);
    const size = statSync(file).size;
    assert.ok(size <= c.max, `${v.id}-${c.cut}.webp is ${size} bytes, over its ${c.max}-byte cap`);
  }
});

// ── the film ─────────────────────────────────────────────────────────────────
function mount({ width = 1180, height = 664, dpr = 1, reducedMotion = false, fail = () => false } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="host"></div></body></html>', { url: 'https://shape.test/', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
  const host = window.document.getElementById('host');
  let box = { width, height };
  host.getBoundingClientRect = () => ({ ...box, top: 0, left: 0, right: box.width, bottom: box.height });
  const loads = [], events = [], timers = [];
  // The film's own timer, held so a test can run the tour without waiting twelve seconds.
  window.setTimeout = (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; };
  window.clearTimeout = (t) => { if (t) t.live = false; };
  const pending = [];
  const film = createClubFilm({
    host, reducedMotion,
    onChange: (s) => events.push({ ...s }),
    load: (url) => new Promise((resolve, reject) => { loads.push(url); pending.push(() => (fail(url) ? reject(new Error('no')) : resolve())); }),
  });
  const settle = async () => { while (pending.length) pending.shift()(); await new Promise((r) => setImmediate(r)); };
  const fire = () => { const t = timers.filter((x) => x.live).pop(); assert.ok(t, 'no tour timer is armed'); t.live = false; t.fn(); return t.ms; };
  const armed = () => timers.filter((x) => x.live);
  const on = () => [...host.querySelectorAll('.cf-layer.cf-on')];
  return { window, host, film, loads, events, settle, fire, armed, on, setBox: (b) => { box = b; } };
}

test('the film shows a view only once its still has arrived, and cross-fades to the next', async () => {
  const m = mount();
  m.film.show('arrival');
  assert.equal(m.on().length, 0, 'nothing is shown before the still arrives');
  assert.deepEqual(m.events.at(-1), { id: 'arrival', status: 'loading', auto: false });
  await m.settle();
  assert.equal(m.on().length, 1);
  assert.match(m.on()[0].style.backgroundImage, /club\/arrival-l-sm\.webp/);
  assert.equal(m.events.at(-1).status, 'shown');
  m.film.show('floor');
  await m.settle();
  assert.equal(m.on().length, 1, 'one layer is lit at a time: the old one fades as the new one comes up');
  assert.match(m.on()[0].style.backgroundImage, /club\/floor-l-sm\.webp/);
  assert.equal(m.film.view, 'floor');
});

test('a phone-shaped box is given the tall cut, and a sharp screen the full file', async () => {
  const m = mount({ width: 390, height: 720, dpr: 3 });
  m.film.show('decks');
  await m.settle();
  assert.match(m.loads[0], /club\/decks-p\.webp/);
  const small = mount({ width: 390, height: 720, dpr: 1 });
  small.film.show('decks');
  assert.match(small.loads[0], /club\/decks-p-sm\.webp/);
});

test('a box that turns from wide to tall takes the other cut of the same view', async () => {
  const m = mount();
  m.film.show('atrium');
  await m.settle();
  m.setBox({ width: 400, height: 760 });
  m.film.resize();
  await m.settle();
  assert.equal(m.film.view, 'atrium');
  assert.match(m.on()[0].style.backgroundImage, /club\/atrium-p-sm\.webp/);
  const n = m.loads.length;
  m.film.resize();
  assert.equal(m.loads.length, n, 'a resize that changes nothing fetches nothing');
});

test('a still that does not arrive leaves the last one up and says so', async () => {
  const m = mount({ fail: (url) => /suite/.test(url) });
  m.film.show('floor');
  await m.settle();
  m.film.show('suite');
  await m.settle();
  assert.equal(m.events.at(-1).status, 'failed');
  assert.match(m.on()[0].style.backgroundImage, /club\/floor-/, 'the floor stays on screen');
  // Stopping or starting the tour says nothing new about the picture: the room that failed is
  // still the one that failed, and one still on its way is still loading.
  m.film.setAuto(true);
  assert.deepEqual(m.events.at(-1), { id: 'suite', status: 'failed', auto: true });
  m.film.show('lounge');
  m.film.setAuto(false);
  assert.deepEqual(m.events.at(-1), { id: 'lounge', status: 'loading', auto: false });
  await m.settle();
  assert.deepEqual(m.events.at(-1), { id: 'lounge', status: 'shown', auto: false });
});

test('a later pick wins over a still that arrives after it', async () => {
  const m = mount();
  m.film.show('lounge');
  m.film.show('bar');
  await m.settle();
  assert.equal(m.film.view, 'bar');
  assert.match(m.on()[0].style.backgroundImage, /club\/bar-/);
  assert.ok(!m.events.some((e) => e.id === 'lounge' && e.status === 'shown'));
});

test('the tour waits at the door, then walks the rooms on the dwell', async () => {
  const m = mount();
  m.film.setAuto(true);
  m.film.show('arrival');
  await m.settle();
  assert.equal(m.armed().length, 0, 'the tour never leaves the door on its own');
  m.film.show('atrium');
  await m.settle();
  assert.equal(m.fire(), 12000);
  await m.settle();
  assert.equal(m.film.view, 'floor');
  m.film.setTempo(128);
  m.film.show('decks');
  await m.settle();
  assert.equal(m.fire(), 15000, 'eight bars at the measured tempo');
  await m.settle();
  assert.equal(m.film.view, 'booth');
  m.film.setAuto(false);
  assert.equal(m.armed().length, 0, 'turning the tour off stops it');
});

test('the tour does not run while the page is hidden', async () => {
  const m = mount();
  Object.defineProperty(m.window.document, 'hidden', { value: true, configurable: true });
  m.film.setAuto(true);
  m.film.show('floor');
  await m.settle();
  assert.equal(m.armed().length, 0);
  Object.defineProperty(m.window.document, 'hidden', { value: false, configurable: true });
  m.window.document.dispatchEvent(new m.window.Event('visibilitychange'));
  assert.equal(m.armed().length, 1, 'it picks up when the page is seen again');
});

test('the swell takes its time from the tempo, and reduced motion holds everything still', async () => {
  const m = mount();
  const root = m.host.querySelector('.cf-root');
  assert.equal(root.style.getPropertyValue('--cf-pulse'), '4.000s');
  m.film.setTempo(120);
  assert.equal(root.style.getPropertyValue('--cf-pulse'), '2.000s');
  m.film.setTempo(null);
  assert.equal(root.style.getPropertyValue('--cf-pulse'), '4.000s');
  assert.ok(!root.classList.contains('cf-still'));
  const still = mount({ reducedMotion: true });
  assert.ok(still.host.querySelector('.cf-root').classList.contains('cf-still'));
  const css = still.window.document.getElementById('club-film-style').textContent;
  assert.match(css, /\.cf-still \.cf-layer\{transition:none;animation:none!important\}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('destroying the film takes it out of the box and stops its tour', async () => {
  const m = mount();
  m.film.setAuto(true);
  m.film.show('floor');
  await m.settle();
  m.film.destroy();
  assert.equal(m.host.querySelector('.cf-root'), null);
  assert.equal(m.armed().length, 0);
  const n = m.events.length;
  m.film.show('bar');
  await m.settle();
  assert.equal(m.events.length, n, 'a destroyed film says and shows nothing more');
});

test('the views and the film are one module that imports nothing: no three, no video, one cache key', () => {
  const src = readFileSync(path.join(ROOT, 'public/newdesign/booth/clubViews.mjs'), 'utf8');
  assert.deepEqual([...src.matchAll(/^import\b.*$/gm)].map((x) => x[0]), []);
  assert.ok(!/\bimport\(/.test(src), 'a dynamic import would be a second file under no key');
  assert.ok(!/createElement\('(video|canvas)'\)/.test(src));
});
