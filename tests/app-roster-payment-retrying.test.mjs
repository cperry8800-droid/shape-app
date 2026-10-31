// The coach app's roster MOUNTED with a client whose renewal Stripe is still retrying (past_due).
//
// Owner, 2026-10-18: "They stay normal clients until Stripe gives up: on the list, with logs
// visible, and the coach can still send them plans." So the row keeps the station its progress puts
// it in (NEEDS YOU or ON TRACK) and carries one quiet mark, "Payment retrying"
// (coach:roster.paymentRetrying, in all 13 catalogs). The rows here are built by the shipping
// bsRowFromTriage from engine triage rows, and drawn by the shipping BSProRosterView, in jsdom.
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
const { IntlMessageFormat } = require_('intl-messageformat');
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

// The catalog the app ships, formatted as its ICU runtime formats it; switchable per test.
const CATALOGS = {};
const catalog = (loc) => (CATALOGS[loc] ??= JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${loc}/coach.json`), 'utf8')));
let locale = 'en';
W.ShapeI18n = {
  t: (key, opts = {}) => {
    const k = key.replace(/^coach:/, '');
    const msg = catalog(locale)[k];
    return msg == null ? undefined : new IntlMessageFormat(msg, locale).format(opts);
  },
  intlLocale: () => locale,
};

// Chrome only: the roster view, its rows and the mark are the shipping code.
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', AMBER: '#d8b25a', RUST: '#c0533b', GREEN: '#5fa96e', BLUE: '#4a7bd0', padX: 18, isLight: true };
W.useBS = () => theme;
W.BSPage = ({ children }) => React.createElement('div', null, children);
W.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);
// The shared back row (BSBackRow): ← Back on its own row, the page's eyebrow beside it.
globalThis.BSBackRow = ({ onBack, label, trailing, disabled }) => React.createElement('div', { 'data-chrome': 'BSBackRow' }, React.createElement('button', { type: 'button', onClick: onBack, disabled }, '← ' + (label || 'Back')), trailing);
for (const chrome of ['BSMasthead', 'BSPageHeader', 'BSBackButton', 'BSAvatar', 'BSFacetAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen', 'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage', 'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}
W.BSTStationHead = ({ label }) => React.createElement('div', { 'data-station-head': String(label) }, String(label));

const PROS = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSProRosterView, bsRowFromTriage };',
});

// Engine triage rows, the shape ShapeSignals.triageLive hands the roster (getTriageFeed).
const triageRow = (severity, profile) => ({ severity, client: { profile }, flags: severity === 'green' ? [] : [{ reason: 'No logs in 5 days', owned: true }], reasons: [], readOnly: [] });
const rows = () => [
  PROS.bsRowFromTriage(triageRow('green', { id: 'u7', name: 'Priya Shah', isNew: false, paymentRetrying: true }), 'trainer', theme),
  PROS.bsRowFromTriage(triageRow('red', { id: 'u8', name: 'Marcus Tran', isNew: false, paymentRetrying: true }), 'trainer', theme),
  PROS.bsRowFromTriage(triageRow('green', { id: 'u1', name: 'Ana Reyes', isNew: false }), 'trainer', theme),
  PROS.bsRowFromTriage(triageRow('red', { id: 'u2', name: 'Ben Tal', isNew: false }), 'trainer', theme),
];

async function mount(clients) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(PROS.BSProRosterView, {
      status: 'ready', role: 'trainer', clients, activeCount: clients.length, pastCount: 0, totalCount: clients.length,
      roster: 'active', setRoster: () => {}, query: '', setQuery: () => {}, filter: 'all', setFilter: () => {}, onOpen: () => {},
    }));
  });
  return { host, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
// The row (a button) that names this client, and whether it carries the mark.
const rowOf = (host, name) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(name));
const marked = (host, name) => !!rowOf(host, name)?.querySelector('[data-pay-retry]');

test('the row mapping keeps the flag, true only for a client the roster said is retrying', () => {
  const [priya, marcus, ana, ben] = rows();
  assert.deepEqual([priya.paymentRetrying, marcus.paymentRetrying, ana.paymentRetrying, ben.paymentRetrying], [true, true, false, false]);
  // A normal client in every other way: the same station, the same verdict.
  assert.equal(priya._sig.sev, 'green');
  assert.equal(marcus._sig.sev, 'red');
});

// The roster's tabs (the Clients mockup C, 2026-10-25): Needs you, On track, Past. A tab is a
// role="tab" button; the second is On track.
const openTab = async (host, i) => { await React.act(async () => { host.querySelectorAll('[role="tab"]')[i].click(); }); };

test('a retrying client keeps their station and carries "Payment retrying", in Needs you and in On track; nobody else does', async () => {
  locale = 'en';
  const m = await mount(rows());
  try {
    // Needs you (two red clients): their group, their rows, the mark on the retrying one only.
    assert.equal(m.host.querySelector('[role="tablist"]').getAttribute('data-roster-view'), 'needs');
    const red = m.host.querySelector('[data-roster-group="red"]');
    assert.ok(red && /^Reach out today\s*2$/.test(red.querySelector('h2')?.textContent || ''), 'two to reach out to today, on the head\'s count');
    assert.deepEqual(['Marcus Tran', 'Ben Tal'].map((n) => !!rowOf(m.host, n)), [true, true]);
    assert.deepEqual(['Priya Shah', 'Ana Reyes'].map((n) => !!rowOf(m.host, n)), [false, false], 'on-track clients are on their own tab');
    assert.deepEqual(['Marcus Tran', 'Ben Tal'].map((n) => marked(m.host, n)), [true, false]);
    assert.equal(m.host.querySelectorAll('[data-pay-retry]').length, 1);
    // On track: the other two, the mark on the retrying one only.
    await openTab(m.host, 1);
    assert.ok(m.host.querySelector('[data-roster-group="track"]'), 'the On track list');
    assert.deepEqual(['Priya Shah', 'Ana Reyes'].map((n) => marked(m.host, n)), [true, false]);
    assert.equal(rowOf(m.host, 'Priya Shah').querySelector('[data-pay-retry]').textContent, 'Payment retrying');
    assert.equal(m.host.querySelectorAll('[data-pay-retry]').length, 1);
  } finally { await m.close(); }
});

test('the mark is the catalog\'s, in every locale the app ships', async () => {
  const LOCALES = ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];
  for (const loc of LOCALES) {
    const v = catalog(loc)['roster.paymentRetrying'];
    assert.ok(typeof v === 'string' && v.trim(), loc + ': coach:roster.paymentRetrying');
    if (loc !== 'en') assert.notEqual(v, catalog('en')['roster.paymentRetrying'], loc + ': translated, not the English');
  }
  locale = 'de';
  const m = await mount(rows());
  try {
    await openTab(m.host, 1);
    assert.equal(rowOf(m.host, 'Priya Shah').querySelector('[data-pay-retry]').textContent, catalog('de')['roster.paymentRetrying']);
  } finally { await m.close(); locale = 'en'; }
});
