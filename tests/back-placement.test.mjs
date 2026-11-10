// Back in the same place on every screen (owner, 2026-10-31: "please review evrey place there is a
// back button on the app, it needs to be in the same place on evrey screen if that screen needs to
// have a back button" and "make sure it goes back to [the] page of where that person was on the
// page").
//
// THE SLOT (owner, 2026-11-09: "remove the back button everywhere to free up space on page. Put a small
// back arrow to the left of logo in top left of screen"): the masthead row is always the corner's height
// (BS_MAST_ROW_H), and a page's ← sits in it ahead of the logo, on the gutter, in a 44px target: every
// masthead row keeps an empty slot there (BSMastBackSlot), and BSBackRow, at every call site, hands that
// slot its Back. What a page put on the back row's right stays under the masthead row. A Back with no
// masthead row above it keeps the old row (BS_BACK_ROW_GAP down, BS_BACK_ROW_H tall). The two sign-in
// screens, which have no masthead row, place the same small ← at the masthead row's y
// (BS_BACK_SLOT_TOP_CSS). Once the page scrolls, the pinned bar shows ← at its left, as the top does.
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
  assert.match(CHROME, /const BS_BACK_ROW_H = 44;/, 'the old row, for a Back with no masthead above it, is a full tap target');
  assert.match(fnSrc(CHROME, 'BSMastRow'), /minHeight: BS_MAST_ROW_H/, 'a masthead row without a corner is as tall as one with it');
  // The masthead's ←: the arrow alone, in a 44px target reaching past the 34px row, as the pinned bar's.
  const btn = fnSrc(CHROME, 'BSBackButton');
  assert.match(btn, /data-bs-back="" data-bs-back-compact=""/, 'the swipe finds the compact ←');
  assert.match(btn, /width: 44, height: 44, margin: '-5px -6px -5px -14px'/, 'the ← sits on the gutter and keeps the row 34px tall');
  assert.match(btn, /<span aria-hidden>←<\/span><\/button>/, 'the arrow alone, no word');
  // The masthead's icons one size (owner, 2026-11-09): the ← at BS_MAST_ARROW, here and on the pinned bar.
  assert.match(CHROME, /const BS_MAST_ARROW = 22;/);
  assert.match(btn, /fontSize: BS_MAST_ARROW, lineHeight: 1, \.\.\.style,/);
  assert.match(fnSrc(CHROME, 'BSPinBackButton'), /fontSize: BS_MAST_ARROW, lineHeight: 1,/);
  assert.match(btn, /minHeight: BS_BACK_ROW_H, padding: '0 12px 0 0'/, 'the worded Back fills the old row');
  assert.match(btn, /data-bs-back=""/, 'the swipe finds it');
  // The slot draws the Back the row below hands it.
  const slot = fnSrc(CHROME, 'BSMastBackSlot');
  assert.match(slot, /<span ref=\{ref\} data-bs-mast-back-slot="" style=\{\{ display: 'contents' \}\}>/);
  assert.match(slot, /<BSBackButton compact onClick=\{back\.onBack\}/);
  // BSBackRow: hands the slot above it its Back, keeps its right-hand content under the row, and keeps the
  // old row when there is no masthead above it.
  const row = fnSrc(CHROME, 'BSBackRow');
  assert.match(row, /const slot = bsMastBackSlotFor\(anchorRef\.current, owner\);/);
  assert.match(row, /BS_BACK_SLOTS\.get\(slot\)\(hidden \? null : \{ onBack, label, ink, disabled, buttonStyle \}\);/, 'a hidden Back leaves the slot empty');
  assert.match(row, /data-bs-back-row="" data-bs-back-in-mast=""/);
  assert.match(row, /minHeight: BS_BACK_ROW_H, marginTop: BS_BACK_ROW_GAP, \.\.\.style,/, 'the old row, with no masthead above');
  assert.match(fnSrc(CHROME, 'bsMastBackSlotFor'), /const BS_BACK_SLOT_DEPTH = 4;|BS_BACK_SLOT_DEPTH/);
});

test('every masthead row keeps the slot ahead of its logo; the pinned bars draw their own ←', () => {
  assert.match(fnSrc(CHROME, 'BSMastRow'), /\{backSlot \? <BSMastBackSlot \/> : null\}\n\s*<BSLogo /);
  assert.match(fnSrc(CHROME, 'BSMasthead'), /<BSMastBackSlot \/>\n\s*<BSLogo size=\{BS_MAST_LOGO\}/);
  assert.match(fnSrc(CHROME, 'BSPageHeader'), /<BSMastBackSlot \/>\n\s*<BSLogo size=\{BS_MAST_LOGO\}/);
  assert.match(fnSrc(CHROME, 'BSMastWordRow'), /\{backSlot \? <BSMastBackSlot \/> : null\}\n\s*<BSLogo /);
  // The pinned bars (BSPage's and a takeover's) draw BSPinBackButton ahead of the row, so their row has none.
  const page = fnSrc(CHROME, 'BSPage');
  assert.equal((page.match(/<BSMastRow .*backSlot=\{false\} \/>/g) || []).length, 2, 'BSPage\'s pinned rows');
  assert.match(page, /<BSMastWordRow .*backSlot=\{false\} \/>/, 'Home\'s pinned row');
  assert.match(fnSrc(CHROME, 'BSPinnedBar'), /<BSMastRow trailing=\{trailing\} ink=\{ink\} backSlot=\{false\} \/>/);
  // Every Back a page draws has a masthead row with the slot above it: BSMastRow (directly or through
  // bsProMastRow / BSStShell), Home's row, or a hand-built row carrying BSMastBackSlot ahead of its logo.
  const missing = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.jsx'))) {
    const src = read(f);
    const lines = src.split('\n');
    for (const m of src.matchAll(/<(?:window\.|W\.)?BSBackRow\b/g)) {
      const at = lineOf(src, m.index);
      const above = lines.slice(Math.max(0, at - 46), at - 1).join('\n');
      if (!/BSMastRow|bsProMastRow|BSStShell|BSMastBackSlot|BSMastWordRow/.test(above)) missing.push(`${f}:${at}`);
    }
  }
  assert.deepEqual(missing, [], 'a Back with no masthead slot above it keeps its own row');
  for (const f of ['BSTrainerProfile.jsx', 'BSMarketDirectory.jsx', 'BSNoraProfile.jsx', 'iosAppBroadsheetRadio.jsx']) {
    assert.match(read(f), /\{window\.BSMastBackSlot \? <window\.BSMastBackSlot \/> : null\}\n\s*\{?(?:typeof BSLogo === 'function' && |W\.BSLogo \? |BSLogo \? |BSLogo && )?<(?:W\.)?BSLogo /, `${f}'s hand-built row`);
  }
});

test('the three page headers draw their Back through the shared row', () => {
  assert.match(fnSrc(CHROME, 'BSMasthead'), /\{onBack && <BSBackRow onBack=\{onBack\}/);
  // A page may lift a control up to the back row's right (the calendar's Month | Weeks); the ← stays put.
  assert.match(fnSrc(CHROME, 'BSPageHeader'), /\{onBack && <BSBackRow onBack=\{onBack\} trailing=\{backTrailing\} \/>\}/);
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
    ['iosAppBroadsheetProviderApply.jsx', "onboarding:apply.status.done", 'Done, on the application\'s sent screen'],
    ['BSLiveWorkoutWatch.jsx', "coach:live.stopWatching", 'Stop watching, at the foot of the live view'],
    ['BSProfileCustomizer.jsx', "profile:editor.live.back", 'Back to editing, on the live preview\'s bar'],
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

test('the pinned bar\'s ← is one button, the chrome\'s, on every pinned bar', () => {
  // Codex P1 on #2595: Make it yours drew its own copy of BSPage's pinned ← for its own pinned bar.
  // BSPage's bar and a takeover's (BSPinnedBar) both draw BSPinBackButton; no other file writes its marker.
  // A file that writes the marker draws one; a selector that only reads it (Customize's live preview lets
  // a tap on the pinned ← through) draws nothing.
  const hits = readdirSync(DIR).filter((f) => f.endsWith('.jsx') && f !== 'iosAppBroadsheet.jsx' && /data-bs-pin-back\s*=|['"]data-bs-pin-back['"]\s*:/.test(read(f)));
  assert.deepEqual(hits, [], 'a pinned ← drawn outside the chrome');
  const chrome = CHROME.match(/<button\b[^>]*data-bs-pin-back/g) || [];
  assert.equal(chrome.length, 1, 'one pinned ← in the chrome');
  assert.match(fnSrc(CHROME, 'BSPinBackButton'), /data-bs-pin-back=""/);
  assert.match(fnSrc(CHROME, 'BSPage'), /const pinBackButton = \(\) => <BSPinBackButton run=\{runPinBack\} \/>;/, 'BSPage\'s bar draws it');
  assert.match(fnSrc(CHROME, 'BSPinnedBar'), /<BSPinBackButton run=\{run\} /, 'a takeover\'s pinned bar draws it');
  assert.match(read('BSMakeItYours.jsx'), /<window\.BSPinnedBar /, 'Make it yours\'s bar is the takeover bar');
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
  for (const f of hits) {
    assert.match(read(f), /BS_BACK_SLOT_TOP_CSS/, `${f} places its Back at the slot's y`);
    assert.match(read(f), /BackButton compact onClick=\{onBack\}/, `${f} draws the small ←`);
  }
  // The masthead row's y: where every page draws its ← ahead of the logo.
  assert.match(CHROME, /const BS_BACK_SLOT_TOP_CSS = BS_MAST_TOP_CSS;/);
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
    // Its ← is in the masthead row, ahead of the logo, and no row of its own is left under it (owner,
    // 2026-11-09); the row's right-hand words stay under the masthead row.
    const mast = scroller().querySelector('[data-bs-mast-row]');
    const arrow = mast && mast.querySelector('[data-bs-mast-back-slot] [data-bs-back][data-bs-back-compact]');
    assert.ok(arrow, 'the ← is not in the masthead row');
    assert.equal(arrow.textContent, '←', 'the arrow alone');
    assert.ok(arrow.compareDocumentPosition(mast.querySelector('svg, img, canvas, [data-bs-logo]') || mast.lastChild) & 4, 'the ← is ahead of the logo');
    assert.equal(document.querySelectorAll('[data-bs-back]').length, 1, 'one Back on the page');
    assert.ok(!document.querySelector('[data-bs-back-row]:not([data-bs-back-in-mast])'), 'the old back row is still drawn');
    assert.equal(document.querySelector('[data-bs-back-in-mast]').textContent, 'Lift', 'the row\'s right-hand words stay');
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

// Codex on #2637: a section's own view sits deep in its page (Soundtracks embedded in a coach's Programs puts
// its Back five levels under the page's masthead). It still lands in that masthead.
test('a Back deep in a section of its page still lands in the page\'s masthead row', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  let backs = 0;
  const nest = (n, child) => (n ? h('div', { 'data-depth': n }, nest(n - 1, child)) : child);
  await act(async () => {
    root.render(h(window.BSProvider, { paperMode: 'light', accentKey: 'teal' }, h(window.BSPage, null,
      h('div', { style: { padding: '0 22px' } }, h(window.BSMastRow, { trailing: null })),
      h('section', null, nest(5, h(window.BSBackRow, { onBack: () => { backs += 1; }, trailing: h('span', null, 'Spotify') }))))));
  });
  await flush();
  try {
    const arrow = scroller().querySelector('[data-bs-mast-row] [data-bs-mast-back-slot] [data-bs-back-compact]');
    assert.ok(arrow, 'the deep Back kept a row of its own');
    assert.ok(!document.querySelector('[data-bs-back-row]:not([data-bs-back-in-mast])'));
    assert.equal(document.querySelector('[data-bs-back-in-mast]').textContent, 'Spotify');
    await tap(arrow);
    assert.equal(backs, 1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

// Codex on #2637: the check-in's first step has nowhere to go back to and hides its Back
// (buttonStyle visibility: hidden). A hidden Back is no Back in the masthead: the slot stays empty, so the
// logo does not move, and the row's right-hand words stay. Once there is a step behind, the ← is back.
test('a Back its page hides leaves the masthead slot empty, and comes back when shown', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const render = (hasBack) => act(async () => {
    root.render(h(window.BSProvider, { paperMode: 'light', accentKey: 'teal' }, h(window.BSPage, null,
      h('div', { style: { padding: '0 22px' } }, h(window.BSMastRow, { trailing: null }),
        h(window.BSBackRow, { onBack: () => {}, disabled: !hasBack, buttonStyle: { visibility: hasBack ? 'visible' : 'hidden' }, trailing: h('span', null, 'Morning check-in') })))));
  });
  try {
    await render(false);
    await flush();
    const slot = scroller().querySelector('[data-bs-mast-row] [data-bs-mast-back-slot]');
    assert.ok(slot, 'no slot in the masthead row');
    assert.equal(slot.childElementCount, 0, 'a hidden Back still takes room ahead of the logo');
    assert.ok(!document.querySelector('[data-bs-back-row]:not([data-bs-back-in-mast])'), 'the hidden Back fell back to its own row');
    assert.equal(document.querySelector('[data-bs-back-in-mast]').textContent, 'Morning check-in');
    await render(true);
    await flush();
    assert.ok(slot.querySelector('[data-bs-back-compact]'), 'a shown Back is not in the masthead');
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test('a Back with no masthead row above it keeps its own row', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  let backs = 0;
  await act(async () => { root.render(h(window.BSProvider, { paperMode: 'light', accentKey: 'teal' }, h(window.BSPage, null, h('p', null, 'No masthead'), h(window.BSBackRow, { onBack: () => { backs += 1; } })))); });
  await flush();
  try {
    const row = document.querySelector('[data-bs-back-row]');
    assert.ok(row && !row.hasAttribute('data-bs-back-in-mast'), 'the Back went looking for a masthead that is not there');
    assert.match(row.textContent, /Back/, 'the worded Back, on its own row');
    await tap(row.querySelector('[data-bs-back]'));
    assert.equal(backs, 1);
  } finally { await act(async () => root.unmount()); host.remove(); }
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
