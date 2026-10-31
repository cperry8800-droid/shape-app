// Back in the same place on every screen (owner, 2026-10-31: "please review evrey place there is a
// back button on the app, it needs to be in the same place on evrey screen if that screen needs to
// have a back button" and "make sure it goes back to [the] page of where that person was on the
// page").
//
// THE SLOT: the masthead row is always the corner's height (BS_MAST_ROW_H), and ← Back sits on its
// own row directly under it (BSBackRow: BS_BACK_ROW_GAP down, BS_BACK_ROW_H tall), its ← on the page
// gutter, the page's eyebrow on the right. Every page draws its Back through BSBackRow; the two
// sign-in screens, which have no masthead row, place the same button at the same y
// (BS_BACK_SLOT_TOP_CSS). Once the page scrolls, the pinned bar shows ← at its left.
//
// THE PLACE: a page that leaves going forward is remembered with how far down it was, and a Back
// brings it back there (services/scrollMemory.mjs; its rules in tests/scroll-memory.test.mjs). The
// second half of this file drives the real chrome in jsdom: a list, a detail, a Back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'mobile-app', 'src', 'broadsheet');
const read = (f) => readFileSync(join(DIR, f), 'utf8');
const CHROME = read('iosAppBroadsheet.jsx');
const fnSrc = (src, name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} is gone`);
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j);
};
const lineOf = (src, i) => src.slice(0, i).split('\n').length;

// ── The slot ────────────────────────────────────────────────────────────────────────────────────
test('the slot has one geometry, owned by the chrome', () => {
  assert.match(CHROME, /const BS_MAST_ROW_H = 34;/, 'the masthead row is the corner\'s height');
  assert.match(CHROME, /const BS_BACK_ROW_GAP = 4;/);
  assert.match(CHROME, /const BS_BACK_ROW_H = 44;/, 'the back row is a full tap target');
  assert.match(fnSrc(CHROME, 'BSMastRow'), /minHeight: BS_MAST_ROW_H/, 'a masthead row without a corner is as tall as one with it');
  const row = fnSrc(CHROME, 'BSBackRow');
  assert.match(row, /<div data-bs-back-row="" style=\{\{\n\s*display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,\n\s*minHeight: BS_BACK_ROW_H, marginTop: BS_BACK_ROW_GAP, \.\.\.style,\n\s*\}\}>/,
    'the row is flush with the gutter: nothing but its height and its gap under the masthead row');
  assert.match(row, /<BSBackButton /);
  const btn = fnSrc(CHROME, 'BSBackButton');
  assert.match(btn, /minHeight: BS_BACK_ROW_H, padding: '0 12px 0 0'/, 'the ← sits on the gutter and the button fills the row');
  assert.match(btn, /data-bs-back=""/, 'the swipe finds it');
});

test('the three page headers draw their Back through the shared row', () => {
  assert.match(fnSrc(CHROME, 'BSMasthead'), /\{onBack && <BSBackRow onBack=\{onBack\}/);
  assert.match(fnSrc(CHROME, 'BSPageHeader'), /\{onBack && <BSBackRow onBack=\{onBack\} \/>\}/);
  const client = read('iosAppBroadsheetClient.jsx');
  const detail = fnSrc(client, 'BSDetailHeader');
  assert.match(detail, /<BSMastRow trailing=\{noCorner \? null : <BSMeCorner \/>\} \/>\}\n\s*<BSBackRow onBack=\{onBack\}/, 'BSDetailHeader: the masthead row, then the back row');
  for (const [name, src] of [['BSMasthead', fnSrc(CHROME, 'BSMasthead')], ['BSPageHeader', fnSrc(CHROME, 'BSPageHeader')]]) {
    assert.match(src, /minHeight: BS_MAST_ROW_H/, `${name}'s masthead row is the corner's height`);
  }
});

test('no page draws its own Back: every one goes through the shared row', () => {
  // A Back drawn by hand sat wherever its page put it: on the right, in the masthead row, at the
  // very top, at the foot, a 26px ‹, a round icon, a bordered ✕ Close. These are the only plain
  // buttons left that call a page's Back, each an end-of-flow action with its own words, not the
  // page's Back (that is the ← in the slot above it).
  const ENDS = [
    ['iosAppBroadsheetClient.jsx', "store:checkout.backToStore", 'an empty cart\'s Back to store'],
    ['iosAppBroadsheetPros.jsx', "coach:schedule.runDone", 'Done, once a scheduled run is in'],
    ['iosAppBroadsheetProviderApply.jsx', 'Back to marketplace →', 'the application\'s sent screen'],
    ['BSLiveWorkoutWatch.jsx', "coach:live.stopWatching", 'Stop watching, at the foot of the live view'],
  ];
  const found = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.jsx'))) {
    const src = read(f);
    for (const m of src.matchAll(/<button\b[^>]*data-bs-back[^>]*>/g)) {
      if (f === 'iosAppBroadsheet.jsx' && src.slice(0, m.index).lastIndexOf('function BSBackButton(') > src.slice(0, m.index).lastIndexOf('\n}\n')) continue;
      const tail = src.slice(m.index, m.index + 1200);
      const end = ENDS.find(([file, marker]) => file === f && tail.includes(marker));
      found.push(end ? `${f} · ${end[2]}` : `${f}:${lineOf(src, m.index)} draws its own Back — use BSBackRow under the masthead row`);
    }
  }
  assert.deepEqual(found.sort(), ENDS.map(([f, , why]) => `${f} · ${why}`).sort());
});

test('a page may space what follows the back row, never move the row itself', () => {
  // A caller's style can push the content under the row down (marginBottom) or lift the row over a
  // photo (position, zIndex), never shift it: no margin above or beside it, no padding, no offset.
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.jsx'))) {
    const src = read(f);
    for (const m of src.matchAll(/<(?:window\.)?BSBackRow\b[^]*?\/>/g)) {
      const st = /\sstyle=\{\{([^}]*)\}\}/.exec(m[0].replace(/trailing=\{[^]*$/, ''));
      if (!st) continue;
      const keys = st[1].split(',').map((kv) => kv.split(':')[0].trim()).filter(Boolean);
      for (const k of keys) if (!['marginBottom', 'position', 'zIndex'].includes(k)) bad.push(`${f}:${lineOf(src, m.index)} ${k}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every Back says Back', () => {
  // Owner, 2026-10-31: "make them all say back". A row may pass its screen's own key for the word,
  // never a destination ("← Settings", "← Library", "← The listing", "← Radio", "← Profile",
  // "← Cancel" all went); each allowed key reads Back in English.
  const SAYS_BACK = ["tr('home:checkin.back'", "tr('profile:trainer.back'", "tr('session:action.back'", "tr('onboarding:health.back'", "tr('settings:head.back'"];
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.jsx'))) {
    const src = read(f);
    for (const m of src.matchAll(/<(?:window\.|W\.)?BSBackRow\b[^]*?\/>/g)) {
      const lab = /\slabel=\{/.exec(m[0]);
      if (!lab) continue;
      const rest = m[0].slice(lab.index);
      if (!SAYS_BACK.some((k) => rest.includes(k))) bad.push(`${f}:${lineOf(src, m.index)}`);
    }
  }
  assert.deepEqual(bad, []);
  const en = (ns) => JSON.parse(readFileSync(join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', `${ns}.json`), 'utf8'));
  for (const k of SAYS_BACK) {
    const [ns, key] = k.slice(4, -1).split(':');
    assert.match(en(ns)[key], /^(← )?Back$/, `${ns}:${key} reads Back`);
  }
  assert.match(fnSrc(CHROME, 'BSBackButton'), /tr\('common:action\.back', \{ defaultValue: 'Back' \}\)/, 'with no label, the button says Back');
});

test('only the shared row draws the Back button, but for the two screens with no masthead row', () => {
  const hits = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.jsx') && x !== 'iosAppBroadsheet.jsx')) {
    const src = read(f);
    if (/<BSBackButton\b|<window\.BSBackButton\b|window\.BSBackButton\b/.test(src)) hits.push(f);
  }
  assert.deepEqual(hits.sort(), ['iosAppBroadsheetMain.jsx', 'iosAppBroadsheetProviderApply.jsx']);
  for (const f of hits) assert.match(read(f), /BS_BACK_SLOT_TOP_CSS/, `${f} places its Back at the slot's y`);
  assert.match(CHROME, /const BS_BACK_SLOT_TOP_CSS = `calc\(\$\{BS_MAST_TOP_CSS\} \+ \$\{BS_MAST_ROW_H \+ BS_BACK_ROW_GAP\}px\)`;/);
});

test('every way back marks itself, so the page it opens lands where it was', () => {
  assert.match(fnSrc(CHROME, 'BSBackButton'), /onClick=\{\(e\) => \{ bsMarkBack\(\); if \(onClick\) onClick\(e\); \}\}/, 'the ←');
  const gestures = fnSrc(CHROME, 'BSNavGestures');
  assert.match(gestures, /if \(intent === 'back'\) bsMarkBack\(\);/, 'the shell\'s back from a swipe');
  assert.match(gestures, /if \(d\.back\) \{ bsMarkBack\(\); d\.back\(\); \}/, 'an edge drag let go');
  assert.match(gestures, /bsMarkBack\(\);\n\s*back\(\);/, 'a right swipe on a page with a Back');
  assert.match(readFileSync(join(DIR, 'bsNavShell.js'), 'utf8'), /window\.bsMarkBack\(\)/, 'the phone\'s back (navBack)');
  assert.match(fnSrc(CHROME, 'BSPage'), /if \(typeof fn === 'function'\) \{ bsMarkBack\(\); fn\(\); \}/, 'the pinned bar\'s ←');
});

// ── Driven: the real chrome in jsdom ─────────────────────────────────────────────────────────────
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
window.requestAnimationFrame = globalThis.requestAnimationFrame;
// jsdom lays nothing out, so every element reads as off screen; the page's Back is looked for among
// the ones on screen (the swipe's rule), so here everything drawn counts as on screen.
window.HTMLElement.prototype.getClientRects = function getClientRects() { return [{}]; };
const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');
await loadRealModule(join(DIR, 'iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const h = React.createElement;
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); });
// A tap as a finger makes it: the press, then the click.
const tap = async (el) => {
  assert.ok(el, 'no such element');
  await act(async () => {
    el.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flush();
};
const scroller = () => document.querySelector('.bs-scroll[data-bs-page]');
const scrollTo = async (y) => {
  const el = scroller();
  el.scrollTop = y;
  await act(async () => { el.dispatchEvent(new window.Event('scroll')); });
  await flush();
};

// Progress, as the member app has it: a list whose rows open a detail in its place, and the
// detail's Back closes it. A third page under the detail tests a deeper stack.
function List({ onOpen }) {
  return h(window.BSPage, null,
    h('div', { style: { padding: '0 22px' } }, h(window.BSMastRow, { trailing: null })),
    h('h1', { title: 'Progress' }, 'Progress'),
    h('button', { type: 'button', 'data-open': '', onClick: onOpen }, 'Bench press'));
}
function Detail({ onBack, onOpen }) {
  return h(window.BSPage, null,
    h('header', { title: 'Bench press' }, h(window.BSMastRow, { trailing: null }), h(window.BSBackRow, { onBack, trailing: h('span', null, 'Lift') })),
    h('button', { type: 'button', 'data-open-more': '', onClick: onOpen }, 'Session'));
}
function Session({ onBack }) {
  return h(window.BSPage, null,
    h('header', { title: 'Session' }, h(window.BSMastRow, { trailing: null }), h(window.BSBackRow, { onBack })),
    h('p', null, 'Session'));
}
function App() {
  const [view, setView] = React.useState('list');
  if (view === 'session') return h(Session, { onBack: () => setView('detail') });
  if (view === 'detail') return h(Detail, { onBack: () => setView('list'), onOpen: () => setView('session') });
  return h(List, { onOpen: () => setView('detail') });
}
async function mountApp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(h(window.BSProvider, { paperMode: 'light', accentKey: 'teal' }, h(App))); });
  await flush();
  return { unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test('Back returns to the page where the reader was on it', async () => {
  const app = await mountApp();
  try {
    await scrollTo(640);
    await tap(document.querySelector('[data-open]'));
    assert.ok(document.querySelector('[data-bs-back-row]'), 'the detail draws the shared back row');
    assert.equal(scroller().scrollTop, 0, 'the detail opens at its top');
    await scrollTo(220);
    await tap(document.querySelector('[data-open-more]'));
    assert.equal(scroller().scrollTop, 0, 'and the page under it at its top');
    await tap(document.querySelector('[data-bs-back]'));
    assert.equal(scroller().scrollTop, 220, 'Back: the detail, where the reader left it');
    await tap(document.querySelector('[data-bs-back]'));
    assert.ok(document.querySelector('[data-open]'), 'Back again: the list');
    assert.equal(scroller().scrollTop, 640, 'where the reader left it');
  } finally { await app.unmount(); }
});

test('a page opened going forward starts at its top, even after a Back that opened nothing', async () => {
  const app = await mountApp();
  try {
    await scrollTo(500);
    window.bsMarkBack();                    // a Back that closed something over this page, nothing mounted
    await tap(document.querySelector('[data-open]')); // the next tap is not a Back
    assert.equal(scroller().scrollTop, 0, 'the detail is not handed the list\'s place');
    await tap(document.querySelector('[data-bs-back]'));
    assert.equal(scroller().scrollTop, 500, 'and the list still gets its own back');
  } finally { await app.unmount(); }
});

test('the same, when the next step is taken from the keyboard or a screen reader (a click with no press)', async () => {
  // Codex on #2533: a keyboard activation is a click with no pointerdown before it, so a click
  // that is not a Back has to clear a Back that opened nothing, as a press does.
  const app = await mountApp();
  try {
    await scrollTo(500);
    window.bsMarkBack();
    await act(async () => { document.querySelector('[data-open]').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    await flush();
    assert.equal(scroller().scrollTop, 0, 'the detail is not handed the list\'s place');
    await act(async () => { document.querySelector('[data-bs-back]').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    await flush();
    assert.equal(scroller().scrollTop, 500, 'and a Back from the keyboard still brings the list back where it was');
  } finally { await app.unmount(); }
});

test('scrolled down a page, the pinned bar shows ← at its left, and it goes back the same way', async () => {
  const app = await mountApp();
  try {
    await scrollTo(300);
    await tap(document.querySelector('[data-open]'));
    assert.ok(!document.querySelector('[data-bs-pin-back]'), 'at the top, the page\'s own ← Back is on screen');
    await scrollTo(400);
    const pin = document.querySelector('[data-bs-pin-bar] [data-bs-pin-back]');
    assert.ok(pin, 'the pinned bar\'s ←');
    await tap(pin);
    assert.ok(document.querySelector('[data-open]'), 'it went back');
    assert.equal(scroller().scrollTop, 300, 'to where the reader was');
  } finally { await app.unmount(); }
});
