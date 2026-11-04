// The coach's Programs / Plans page, the owner's B (2026-11-04): "B for programs just reduce size of this
// button", of the most popular plan's big filled Assign. Every action on the page is a compact pill now: a
// 34px pill drawn inside a 44px button, so the tap stays 44 while the button reads small. The most popular
// plan's Assign is the page's one filled teal pill; every other plan's is the quiet one, the same size.
//
// The shipping component (BSProCatalog.jsx), mounted in jsdom with a page's model.
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
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

const { IntlMessageFormat } = require_('intl-messageformat');
const CATALOG = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/coach.json'), 'utf8'));
W.ShapeI18n = { t: (key, opts = {}) => { const msg = key.startsWith('coach:') ? CATALOG[key.slice(6)] : null; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); } };
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#ffffff', PAPER2: '#eeeeee', INK: '#111111', INK50: '#777777', INK70: '#555555', RULE: '#cccccc', RUST: '#c0533b', padX: 18, isLight: true, inkRGB: '17,17,17' };

const CAT = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSProCatalog.jsx'), { registry: new Map([['react', React]]) });

async function mount(model) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(CAT.BSProCatalog, { t: theme, model })); });
  const click = async (el) => { assert.ok(el, 'no such element'); await React.act(async () => { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); }); };
  return { host, click, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const nb = (s) => s.replace(/ /g, ' ');

function model(calls) {
  const item = (name, meta, price, extra = {}) => ({ key: name, name, meta, price, demo: true, onOpen: () => calls.push(`open ${name}`), onAssign: () => calls.push(`assign ${name}`), ...extra });
  return {
    role: 'trainer', title: 'Programs', published: '4 published', publishedRest: '1 draft',
    onScratch: () => calls.push('scratch'), note: '', alert: null, loading: null,
    tabs: [['plans', 'Plans'], ['workouts', 'Workouts'], ['programs', 'Programs'], ['soundtracks', 'Music']], tab: 'plans', onTab: (k) => calls.push(`tab ${k}`), tabsAria: 'Catalogue kind',
    search: { value: '', onChange: () => {}, placeholder: 'Search plans, workouts, music', aria: 'Search your library' },
    sort: { value: 'Popular', label: 'Sort: Popular', onPick: (k) => calls.push(`sort ${k}`), options: [['Popular', 'Popular'], ['Price', 'Price'], ['Rating', 'Rating']] },
    sections: [
      { kind: 'featured', item: { ...item('Push / Pull / Legs', '12 wk · 48 on it · 4.9 ★', '$120/mo'), badge: 'Most popular' } },
      { kind: 'list', key: 'plans', sortable: true, head: 'All plans', items: [item('Starting Strength', '8 wk · 31 on it · 4.8 ★', '$95', { onDuplicate: () => calls.push('copy Starting Strength') }), item('Lean Cut', '2,400 kcal', null)] },
    ],
  };
}

test('the most popular plan: its photo, "★ Most popular", the name, the length, clients and rating, the price, and a compact filled Assign', async () => {
  const calls = [];
  const m = await mount(model(calls));
  try {
    const tile = m.host.querySelector('[data-pc-featured]');
    assert.match(tile.textContent, /★ Most popular/);
    assert.equal(tile.querySelector('[data-pc-featured-name]').textContent, 'Push / Pull / Legs');
    assert.match(nb(tile.textContent), /12 WK · 48 clients · 4\.9 ★/);
    assert.equal(tile.querySelector('[data-pc-price]').textContent, '$120/mo');
    assert.equal(tile.querySelector('[data-pc-thumb]').getAttribute('data-pc-thumb'), 'photo', 'the sample plan wears its photo');
    const assign = tile.querySelector('[data-pc-action="assign"]');
    assert.equal(assign.getAttribute('data-pc-compact'), 'primary', 'the page\'s one filled action');
    assert.equal(assign.style.minHeight, '44px', 'the tap stays 44');
    assert.equal(assign.style.minWidth, '44px');
    const pill = assign.querySelector('[data-pc-pill]');
    assert.equal(pill.style.height, '34px', 'the pill reads small');
    assert.equal(pill.style.fontSize, '13px');
    assert.equal(pill.style.background, 'rgb(10, 143, 135)', 'teal, filled');
    assert.equal(assign.getAttribute('aria-label'), 'Assign Push / Pull / Legs to a client');
    await m.click(assign);
    await m.click(tile.querySelector('[data-pc-open]'));
    assert.deepEqual(calls, ['assign Push / Pull / Legs', 'open Push / Pull / Legs'], 'Assign keeps its own tap; the tile opens the plan');
  } finally { await m.close(); }
});

test('every other plan\'s Assign is the quiet pill, the same size; Copy is the words alone; a plan with no figures shows none', async () => {
  const calls = [];
  const m = await mount(model(calls));
  try {
    const rows = [...m.host.querySelectorAll('[data-pc-item]')];
    assert.equal(rows.length, 2);
    const assign = rows[0].querySelector('[data-pc-action="assign"]');
    assert.equal(assign.getAttribute('data-pc-compact'), 'quiet');
    assert.equal(assign.style.minHeight, '44px');
    assert.equal(assign.querySelector('[data-pc-pill]').style.height, '34px', 'the same size as the featured one');
    assert.equal(assign.querySelector('[data-pc-pill]').style.background, 'rgba(255, 255, 255, 0.72)', 'quiet, in the paper\'s own colour');
    const copy = rows[0].querySelector('[data-pc-action="copy"]');
    assert.equal(copy.getAttribute('data-pc-compact'), 'bare');
    assert.equal(copy.getAttribute('aria-label'), 'Duplicate Starting Strength');
    await m.click(copy);
    assert.deepEqual(calls, ['copy Starting Strength']);
    assert.match(nb(rows[0].textContent), /8 WK · 31 clients · 4\.8 ★/);
    assert.ok(!rows[1].querySelector('[data-pc-price]'), 'no price, none drawn');
    assert.match(rows[1].textContent, /2,400 kcal/, 'the line as it is when it carries no figure the page reads');
  } finally { await m.close(); }
});

test('the head: the title with its full stop, what is published, and ＋ From scratch at 44', async () => {
  const calls = [];
  const m = await mount(model(calls));
  try {
    assert.equal(m.host.querySelector('h1[data-tour="hero-plans"]').textContent, 'Programs.');
    assert.equal(m.host.querySelector('[data-deck-published]').textContent, '4 published · 1 draft');
    const scratch = m.host.querySelector('[data-create="scratch"]');
    assert.equal(scratch.textContent, '＋ From scratch');
    assert.ok(parseFloat(scratch.style.minHeight) >= 44);
    await m.click(scratch);
    assert.deepEqual(calls, ['scratch']);
    for (const b of m.host.querySelectorAll('button')) {
      if (b.hasAttribute('data-pc-open')) continue;
      assert.ok(parseFloat(b.style.minHeight) >= 44, `${b.textContent || b.getAttribute('aria-label')} is under 44 tall`);
    }
  } finally { await m.close(); }
});
