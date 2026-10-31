// The coach's Programs / Plans page, condensed (owner, 2026-10-31, of the Most popular card and the
// "✦ Draft with Nora" / "＋ From scratch" buttons: "these can be condensed more").
//
// The Most popular card was an 88px band in the role's colour carrying the length at 34px ("12 wk")
// and "48 clients · 4.9 ★", over a second row with the name, the price and Assign: 158px in all. It
// is now one row like the catalogue's: the length on a 48px tile in the band, the name over its
// price, clients and rating, and Assign (68–76px). The two create buttons were 48px at 15 / 700 with
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
  appendExports: 'export { BSProFeaturedPlan, bsProCreateButtons };',
});

async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return { host, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const nb = (s) => s.replace(/ /g, ' ');

test('Most popular is one row: the length on a tile, the name over price, clients and rating, and Assign', async () => {
  let assigned = 0, opened = 0;
  const plan = { n: 'Push / Pull / Legs', meta: '12 wk · 48 on it · 4.9 ★', price: '$120/mo' };
  const m = await mount(React.createElement(PROS.BSProFeaturedPlan, { plan, heat: '#c0533b', t: theme, onOpen: () => { opened++; }, onAssign: () => { assigned++; } }));
  try {
    const card = m.host.querySelector('[data-featured-plan]');
    assert.equal(card.style.display, 'flex', 'one row');
    assert.equal(card.children.length, 3, 'the tile, the name block and Assign');
    const [tile, name, assign] = card.children;
    assert.equal(nb(tile.textContent), '12WK');
    assert.equal(tile.style.width, '48px');
    assert.equal(tile.style.height, '48px');
    assert.equal(name.querySelector('span').textContent, 'Push / Pull / Legs');
    const facts = m.host.querySelector('[data-featured-facts]').textContent;
    assert.equal(nb(facts), '$120/mo · 48 clients · 4.9 ★');
    assert.ok(facts.includes('4.9 ★') && facts.includes('48 clients'), 'a fact breaks only between facts');
    // Nothing on the card is set larger than the name: the 34px length is gone.
    for (const el of card.querySelectorAll('[style*="font-size"]')) assert.ok(parseFloat(el.style.fontSize) <= 18, el.textContent + ' ' + el.style.fontSize);
    assert.equal(assign.textContent, 'Assign');
    assert.equal(assign.style.minHeight, '40px');
    name.click(); assign.click();
    assert.equal(opened, 1);
    assert.equal(assigned, 1);
  } finally { await m.close(); }
});

test('a plan with no length has a ★ tile, and a plan with no price, clients or rating no facts line', async () => {
  const m = await mount(React.createElement(PROS.BSProFeaturedPlan, { plan: { n: 'Lean Cut', meta: '2,400 kcal' }, heat: '#a07a2e', t: theme, onOpen: () => {}, onAssign: () => {} }));
  try {
    const tile = m.host.querySelector('[data-featured-plan]').children[0];
    assert.equal(tile.textContent, '★');
    assert.equal(m.host.querySelector('[data-featured-facts]'), null);
  } finally { await m.close(); }
});

test('Draft with Nora and From scratch: 40px at 13.5 / 650, From scratch on a hairline', async () => {
  const calls = [];
  const m = await mount(React.createElement('div', null, PROS.bsProCreateButtons(theme, '#c0533b', (k, o) => (o && o.defaultValue) || k, () => calls.push('nora'), () => calls.push('scratch'))));
  try {
    const nora = m.host.querySelector('[data-create="nora"]');
    const scratch = m.host.querySelector('[data-create="scratch"]');
    for (const b of [nora, scratch]) {
      assert.equal(b.style.minHeight, '40px');
      assert.equal(b.style.fontSize, '13.5px');
      assert.equal(b.style.fontWeight, '650');
    }
    assert.equal(scratch.style.border, '1px solid rgb(204, 204, 204)', 'a hairline (RULE), not the ink outline');
    nora.click(); scratch.click();
    assert.deepEqual(calls, ['nora', 'scratch']);
  } finally { await m.close(); }
});
