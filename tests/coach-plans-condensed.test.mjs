// The coach's Programs / Plans page, redrawn in direction A, the Instrument (owner, 2026-11-03), after it
// was condensed (owner, 2026-10-31, of the Most popular card and the
// "✦ Draft with Nora" / "＋ From scratch" buttons: "these can be condensed more").
//
// The Most popular card was an 88px band in the role's colour carrying the length at 34px ("12 wk")
// and "48 clients · 4.9 ★", over a second row with the name, the price and Assign: 158px in all. It
// is now one row: the length on a 56px tile in the band, the name, its price, then clients and
// rating, and Assign at 44px (owner, of the first condensed row: "you can make this a little bigger
// for coaches"); about 84px. The two create buttons were 48px at 15 / 700 with
// an ink outline on From scratch; they are 40px at 13.5 / 650, From scratch on a hairline.
//
// The shipping components, mounted in jsdom (the harness is tests/app-roster-details.test.mjs's).
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
globalThis.localStorage = W.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

const { IntlMessageFormat } = require_('intl-messageformat');
const CATALOG = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/coach.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => {
    const msg = key.startsWith('coach:') ? CATALOG[key.slice(6)] : null;
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
  intlLocale: () => 'en',
};
W.bsDateLocale = () => 'en-US';
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', PAPER3: '#ddd', INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', AMBER: '#d8b25a', RUST: '#c0533b', GREEN: '#5fa96e', BLUE: '#4a7bd0', padX: 18, isLight: true, W: { display: 700 } };
W.useBS = () => theme;
for (const chrome of ['BSPage', 'BSFooter', 'BSBackButton', 'BSBackRow', 'BSMasthead', 'BSPageHeader', 'BSAvatar', 'BSFacetAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen', 'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage', 'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}

const PROS = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSProFeaturedPlan, bsProCreateButton, bsProDeckTheme };',
});

async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return { host, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const nb = (s) => s.replace(/ /g, ' ');

test('Most popular is the plate: the length on a block, "Most popular", the name, clients and rating, the weeks, the price and Assign', async () => {
  // Direction A (owner, 2026-11-03). The words keep the condensed sizes (none over 20px); the length on
  // its block is the one figure set large.
  let assigned = 0, opened = 0;
  const plan = { n: 'Push / Pull / Legs', meta: '12 wk · 48 on it · 4.9 ★', price: '$120/mo' };
  const m = await mount(React.createElement(PROS.BSProFeaturedPlan, { plan, heat: '#c0533b', t: theme, onOpen: () => { opened++; }, onAssign: () => { assigned++; } }));
  try {
    const card = m.host.querySelector('[data-featured-plan]');
    assert.equal(card.style.display, 'grid');
    assert.equal(card.style.gridTemplateColumns, '72px minmax(0, 1fr)');
    const [block, body] = card.children;
    assert.equal(nb(block.textContent), '12WK');
    assert.equal(block.style.background, 'rgb(192, 83, 59)', 'the block in the role\'s heat');
    const name = m.host.querySelector('[data-featured-name]');
    const assign = m.host.querySelector('[data-featured-assign]');
    assert.match(body.textContent, /^Most popular/);
    assert.equal(name.textContent, 'Push / Pull / Legs');
    assert.equal(m.host.querySelector('[data-featured-price]').textContent, '$120/mo');
    const facts = m.host.querySelector('[data-featured-facts]').textContent;
    assert.equal(nb(facts), '48 clients · 4.9 ★');
    assert.ok(facts.includes('4.9 ★') && facts.includes('48 clients'), 'a fact breaks only between facts');
    assert.equal(m.host.querySelector('[data-featured-spine]').children.length, 12, 'a tick a week');
    for (const el of body.querySelectorAll('[style*="font-size"]')) assert.ok(parseFloat(el.style.fontSize) <= 20, el.textContent + ' ' + el.style.fontSize);
    assert.equal(assign.textContent, 'Assign');
    assert.equal(assign.style.minHeight, '44px');
    name.click(); assign.click();
    assert.equal(opened, 1, 'the name opens it, and Assign does not');
    assert.equal(assigned, 1);
    m.host.querySelector('[data-featured-facts]').click();
    assert.equal(opened, 2, 'the rest of the plate opens it too');
  } finally { await m.close(); }
});

test('a plan with no length has a ★ block, and a plan with no price, clients or rating no facts line', async () => {
  const m = await mount(React.createElement(PROS.BSProFeaturedPlan, { plan: { n: 'Lean Cut', meta: '2,400 kcal' }, heat: '#a07a2e', t: theme, onOpen: () => {}, onAssign: () => {} }));
  try {
    const block = m.host.querySelector('[data-featured-plan]').children[0];
    assert.equal(block.textContent, '★');
    assert.ok(!m.host.querySelector('[data-featured-facts]'), 'no facts line');
    assert.ok(!m.host.querySelector('[data-featured-price]'), 'no price line');
    assert.ok(!m.host.querySelector('[data-featured-spine]'), 'no weeks to draw');
  } finally { await m.close(); }
});

test('the deck holds From scratch alone: no Nora line (she drafts from the masthead), 44 to tap, builds blank', async () => {
  // Owner, 2026-11-04: "remove this nora box from program and plan page since coach should just be able
  // to ask nora from click nora button in mast head".
  const calls = [];
  const deck = PROS.bsProDeckTheme(theme);
  const m = await mount(React.createElement('div', null, PROS.bsProCreateButton(deck, (k, o) => (o && o.defaultValue) || k, () => calls.push('scratch'))));
  try {
    assert.ok(!m.host.querySelector('[data-create="nora"]'), 'Nora\'s draft line is back on the deck');
    assert.doesNotMatch(m.host.textContent, /Nora/);
    const scratch = m.host.querySelector('[data-create="scratch"]');
    assert.ok(parseFloat(scratch.style.minHeight) >= 44, scratch.style.minHeight);
    assert.equal(scratch.textContent, '＋ From scratch');
    assert.equal(deck.PAPER, '#111', 'the deck is the paper\'s ink on a light paper');
    scratch.click();
    assert.deepEqual(calls, ['scratch']);
  } finally { await m.close(); }
});
