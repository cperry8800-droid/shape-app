// The client review pages in the coach pages' clean type, trainer and nutritionist.
//
// Owner, 2026-10-31, of the case file and Adjust plan: "this design needs to be updated", "and this",
// "all of those pages for client review", and "no but also update design of trainers review pages".
// They were set in the broadsheet's mono capitals: dash eyebrows over gradient rules, an italic
// accent surname with a period, underlined mono actions, teal mono buttons, dashed "not yet" rules.
// They now take Today and Clients' grammar: Geist heads, Inter Tight words, PAPER2 cards, one ink
// button per form, the Clients page's tabs. The catalogs write their labels in capitals, so those stay
// capitals (an overline in Inter Tight), never recased in code.
//
// The pages are the shipping components, mounted in jsdom (the harness is
// tests/app-roster-details.test.mjs's).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
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

// The catalog the app ships, formatted as its ICU runtime formats it.
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
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', AMBER: '#d8b25a', RUST: '#c0533b', GREEN: '#5fa96e', BLUE: '#4a7bd0', padX: 18, isLight: true, W: { display: 700 }, weightUnit: 'lb', uMeasure: (v, u) => ({ value: v, unit: u }), uText: (s) => s, kgToDisplay: (v) => v, isMetric: false };
W.useBS = () => theme;
W.BSPage = ({ children }) => React.createElement('div', null, children);
W.BSFooter = () => null;
W.BSBackButton = ({ onClick }) => React.createElement('button', { type: 'button', 'data-bs-back': '', onClick }, '← Back');
// The shared back row (#2533): Back in one place on every page, the page's eyebrow on its right.
W.BSBackRow = ({ onBack, trailing }) => React.createElement('div', { 'data-bs-back-row': '' }, React.createElement(W.BSBackButton, { onClick: onBack }), trailing);
for (const chrome of ['BSMasthead', 'BSPageHeader', 'BSAvatar', 'BSFacetAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen', 'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage', 'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}
// The client module's mono heads and dashed lines: present, so a page that still reached for them
// would draw them, and the test would see it.
W.BSTStationHead = ({ label }) => React.createElement('div', { 'data-old-station-head': String(label) }, String(label));
W.BSTRedact = ({ label }) => React.createElement('div', { 'data-old-redact': String(label) }, String(label));
W.BSTLedgerStat = ({ label }) => React.createElement('div', { 'data-old-ledger': String(label) }, String(label));

const PROS = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSProClientFullProfilePage, BSProAdjustProgram, BSProScheduleSession, bsNutriDemoRoster };',
});

async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return { host, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
// The source of the review pages: the workout review, and Adjust through the case file.
function span(a, b) {
  const i = SRC.indexOf(a), j = SRC.indexOf(b, i);
  assert.ok(i > 0 && j > i, `${a} moved`);
  return SRC.slice(i, j);
}
const PAGES = span('function BSWorkoutReviewPage(', 'function BSProLiveWatch(') + span('function BSProAdjustProgram(', 'const bsEditorSteps = ');

test('the review pages set no mono, no italic, no dashed rule and no mono station head', () => {
  assert.doesNotMatch(PAGES, /fontFamily: t\.MONO/, 'a mono label');
  assert.doesNotMatch(PAGES, /fontStyle: 'italic'|<i style/, 'an italic');
  assert.doesNotMatch(PAGES, /<window\.BSTStationHead|<window\.BSTRedact|<window\.BSTLedgerStat/, 'a client-module mono primitive');
  // Every page takes the clean theme and hands it on.
  for (const fn of ['BSWorkoutReviewPage', 'BSProAdjustProgram', 'BSProScheduleSession', 'BSProAssignPage', 'BSProCheckinDraft', 'BSProClientFullProfilePage']) {
    const body = span(`function ${fn}(`, '\n}\n');
    assert.match(body, /const t = useBSProClean\(\);/, fn + ' is not in the clean type');
    assert.match(body, /<BSProCleanType t=\{t\}>/, fn + ' does not hand the clean type on');
  }
});

test("the case file: the name as a Geist title, no italic surname or period, four actions, the Clients page's tabs", async () => {
  const casey = PROS.bsNutriDemoRoster(theme).find((c) => c.n === 'Casey Lee');
  const m = await mount(React.createElement(PROS.BSProClientFullProfilePage, { client: casey, role: 'nutritionist', onBack: () => {} }));
  try {
    const h1 = m.host.querySelector('h1');
    assert.equal(h1.textContent, 'Casey Lee');
    assert.match(m.host.querySelector('[data-case-eyebrow]').textContent, /^CASE FILE · /);
    assert.ok(m.host.querySelector('[data-bs-back-row] [data-case-eyebrow]'), 'the case line rides the shared back row');
    const actions = [...m.host.querySelectorAll('[data-case-actions] button')].map((b) => b.textContent);
    assert.deepEqual(actions, ['MESSAGE', 'ADJUST', 'SCHEDULE', '✦ DRAFT']);
    const tabs = [...m.host.querySelectorAll('[data-case-tabs] [role="tab"]')];
    assert.deepEqual(tabs.map((b) => [b.textContent, b.getAttribute('aria-selected')]), [['PLAN', 'true'], ['MANAGE', 'false']]);
    // Sections are the clean head; nothing reached for the mono ones.
    assert.ok(m.host.querySelectorAll('[data-pro-case-head]').length >= 5, 'too few section heads');
    assert.equal(m.host.querySelectorAll('[data-old-station-head], [data-old-redact], [data-old-ledger]').length, 0);
    // The private note is a card in the page's type.
    assert.ok(m.host.querySelector('[data-coach-note]'));
  } finally { await m.close(); }
});

test("a demo client's case file says what the Clients page says: 4 of 7 days is 57%, and the row's streak", async () => {
  const casey = PROS.bsNutriDemoRoster(theme).find((c) => c.n === 'Casey Lee');
  assert.equal(casey.d, '57%');
  // Every nutritionist demo figure is a whole number of days out of seven.
  for (const c of PROS.bsNutriDemoRoster(theme)) {
    if (!/%$/.test(c.d)) continue;
    const pct = Number(c.d.slice(0, -1));
    assert.ok([0, 1, 2, 3, 4, 5, 6, 7].some((k) => Math.round((k / 7) * 100) === pct), `${c.n}: ${c.d} is no number of days`);
  }
  const m = await mount(React.createElement(PROS.BSProClientFullProfilePage, { client: casey, role: 'nutritionist', onBack: () => {} }));
  try {
    const stats = [...m.host.querySelectorAll('[data-pro-stat]')].map((s) => s.textContent);
    assert.ok(stats.includes('ADHERENCE57%'), stats.join(' | '));
    assert.ok(stats.includes('DAYS LOGGED4/7'), stats.join(' | '));
    assert.match(m.host.textContent, /CLIENT Since Feb 2026 · 9-day streak/, 'the streak is not the row\'s: ' + (m.host.textContent.match(/CLIENT.{0,60}/) || [''])[0]);
  } finally { await m.close(); }
});

test('Adjust: the title without its italic half or period, the client in a card, one ink button', async () => {
  for (const [role, title] of [['nutritionist', 'Tune the plan'], ['trainer', 'Tune the program']]) {
    const m = await mount(React.createElement(PROS.BSProAdjustProgram, { client: { n: 'Ana Reyes', i: 'A', c: '#000', prog: 'Cut' }, role, onBack: () => {} }));
    try {
      assert.equal(m.host.querySelector('h1').textContent, title, role);
      assert.ok(m.host.querySelector('[data-pro-client-mini]'), role + ': the client card');
      assert.ok(m.host.querySelector('[data-bs-back-row] [data-bs-back]'), role + ': Back is the shared row\'s');
      assert.ok(m.host.querySelectorAll('[data-pro-action-sec] h2').length >= 3, role + ': the section heads');
      const send = [...m.host.querySelectorAll('button')].find((b) => /Apply & Send/.test(b.textContent));
      const notify = [...m.host.querySelectorAll('button')].find((b) => /Apply & Notify/.test(b.textContent));
      assert.equal(send.style.background, 'rgb(17, 17, 17)', role + ': Apply & Send is not the ink button');
      assert.equal(notify.style.background, 'transparent', role + ': Apply & Notify is not the quiet one');
      // A note box at 16px: iOS zooms the page when a focused box is under it.
      assert.equal(m.host.querySelector('textarea').style.fontSize, '16px');
    } finally { await m.close(); }
  }
});

test('Schedule: the chosen day and time are pressed and drawn in ink', async () => {
  const m = await mount(React.createElement(PROS.BSProScheduleSession, { client: { n: 'Ana Reyes', i: 'A', c: '#000' }, role: 'trainer', onBack: () => {} }));
  try {
    const pressed = [...m.host.querySelectorAll('button[aria-pressed="true"]')];
    assert.ok(pressed.length >= 2, 'a day and a time');
    for (const b of pressed) assert.equal(b.style.background, 'rgb(17, 17, 17)', b.textContent);
  } finally { await m.close(); }
});
