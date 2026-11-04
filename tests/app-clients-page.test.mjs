// The coach app's Clients page (BSProClients.jsx), trainer and nutritionist.
//
// Owner, 2026-11-04, of three looks drawn for it: "C for clients", after "reduce the coloring and simplify
// UI more" and "every client should have a message icon like the top person does in clients so they can
// easily message". BSProRosterView works out the roster, the counts, the views, the search, the phase
// filter and the groups, owns every door, and hands them to the page, which draws them: who needs you first,
// the four views, the search with the phase picker beside it, and every client in one list with Message on
// each. Mounted in jsdom from the shipping code (the harness is app-roster-details.test.mjs's).
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

const catalog = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/coach.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => {
    const msg = catalog[key.replace(/^coach:/, '')];
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
  intlLocale: () => 'en',
};

const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', AMBER: '#d8b25a', RUST: '#c0533b', GREEN: '#5fa96e', BLUE: '#4a7bd0', padX: 18, isLight: true };
W.useBS = () => theme;
W.BSPage = ({ children }) => React.createElement('div', null, children);
W.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);
for (const chrome of ['BSMasthead', 'BSPageHeader', 'BSBackButton', 'BSAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen', 'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage', 'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}
// The facet avatar is the client module's: a stand-in that says what it was asked to draw.
W.BSFacetAvatar = ({ initial, name, dotC }) => React.createElement('span', { 'data-facet': name, 'data-facet-dot': dotC || '' }, initial);

const PROS = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSProRosterView, bsRowFromTriage };',
});

const triage = (severity, profile, rec = {}) => ({ severity, client: { profile, ...rec }, flags: severity === 'green' ? [] : [{ reason: 'No logs in 5 days', owned: true }], reasons: [], readOnly: [] });
const rows = () => [
  PROS.bsRowFromTriage(triage('green', { id: 'u1', name: 'Ana Reyes', joinedAt: '2026-02-10T12:00:00Z' }, { program: { name: 'Hypertrophy' }, streaks: { current: 12 }, trainingAdherence: { pct: 91 } }), 'trainer', theme),
  PROS.bsRowFromTriage(triage('red', { id: 'u2', name: 'Ben Tal', paymentRetrying: true }, { program: { name: 'Cut Block' }, trainingAdherence: { pct: 40 } }), 'trainer', theme),
  PROS.bsRowFromTriage(triage('green', { id: 'u3', name: 'Cleo Park' }, {}), 'trainer', theme),
];

async function mount(clients, props = {}) {
  const calls = { open: [], query: [], filter: [], roster: [] };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const render = async (extra = {}) => React.act(async () => {
    root.render(React.createElement(PROS.BSProRosterView, {
      status: 'ready', role: 'trainer', clients, allClients: clients, activeCount: clients.length, pastCount: 2, totalCount: clients.length,
      roster: 'active', setRoster: (v) => calls.roster.push(v), query: '', setQuery: (v) => calls.query.push(v), filter: 'all', setFilter: (v) => calls.filter.push(v),
      onOpen: (c) => calls.open.push(c.n), ...props, ...extra,
    }));
  });
  await render();
  return { host, calls, render, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const tabs = (host) => [...host.querySelectorAll('[role="tab"]')];
const click = (el) => React.act(async () => { el.click(); });
const button = (host, re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));

test('the four views with their counts, Needs you first, and who needs you at the top', async () => {
  const m = await mount(rows());
  try {
    assert.ok(m.host.querySelector('[data-pro-clients]'), 'the page');
    assert.equal(m.host.querySelector('[role="tablist"]').getAttribute('data-roster-view'), 'needs');
    const labels = tabs(m.host).map((b) => b.textContent.replace(/\s+/g, ''));
    assert.deepEqual(labels, ['Needsyou1', 'Ontrack2', 'Past2', 'All3']);
    assert.equal(tabs(m.host)[0].getAttribute('aria-selected'), 'true');
    assert.match(m.host.querySelector('[data-pc-summary-words]').textContent, /^1 client needs you$/);
    // Their face, with the standing's dot (the facet avatar the client module draws).
    assert.deepEqual([...m.host.querySelectorAll('[data-pc-summary] [data-facet]')].map((f) => f.getAttribute('data-facet')), ['Ben Tal']);
    assert.match(m.host.querySelector('[data-roster-group="red"] h2').textContent, /^Reach out today\s*1$/);
    // The reason, and the payment mark, on the client to reach out to.
    const ben = button(m.host, /Ben Tal/);
    assert.equal(ben.querySelector('[data-pc-reason]').textContent, 'No logs in 5 days');
    assert.ok(ben.querySelector('[data-pay-retry]'), 'Payment retrying');
    // The summary opens Needs you; On track and All follow their tabs.
    await click(tabs(m.host)[1]);
    assert.ok(m.host.querySelector('[data-roster-group="track"]'), 'On track');
    await click(tabs(m.host)[3]);
    assert.ok(m.host.querySelector('[data-roster-group="all"]'), 'All');
    await click(m.host.querySelector('[data-pc-summary]'));
    assert.equal(m.host.querySelector('[role="tablist"]').getAttribute('data-roster-view'), 'needs');
  } finally { await m.close(); }
});

test('every client has Message, which messages them; the rest of the row opens their file', async () => {
  const m = await mount(rows());
  try {
    await click(tabs(m.host)[3]);
    const msgs = [...m.host.querySelectorAll('[data-pc-message]')].map((b) => b.getAttribute('aria-label'));
    assert.deepEqual(msgs.sort(), ['Message Ana Reyes', 'Message Ben Tal', 'Message Cleo Park']);
    // (The page dispatches shape:proMessageClient on window; the harness listens at the dispatch.)
    const sent = [];
    const dispatch = W.dispatchEvent;
    W.dispatchEvent = (e) => { if (e && e.type === 'shape:proMessageClient') sent.push(e.detail.client.n); return true; };
    try { await click(m.host.querySelector('[aria-label="Message Cleo Park"]')); } finally { W.dispatchEvent = dispatch; }
    assert.deepEqual(sent, ['Cleo Park']);
    await click([...m.host.querySelectorAll('button')].find((b) => !b.hasAttribute('data-pc-message') && b.textContent.includes('Ana Reyes')));
    assert.deepEqual(m.calls.open, ['Ana Reyes']);
    // The week's figure where the roster holds one, nothing where it does not; a quiet row's facts.
    const weeks = [...m.host.querySelectorAll('[data-roster-week]')].map((w) => w.textContent);
    assert.deepEqual(weeks.sort(), ['40% Adherence', '91% Adherence']);
    assert.equal(button(m.host, /Ana Reyes/).querySelector('[data-roster-facts]').textContent, 'Hypertrophy · 12-day streak · Since Feb 2026');
  } finally { await m.close(); }
});

test('search, the phase picker, Clear filters, Past and ＋ Add', async () => {
  const m = await mount(rows());
  try {
    const input = m.host.querySelector('input[aria-label="Search clients"]');
    assert.equal(input.getAttribute('placeholder'), 'Search 3 clients');
    const select = m.host.querySelector('select[aria-label="Filter by phase"]');
    assert.deepEqual([...select.options].map((o) => [o.value, o.textContent]), [['all', 'ALL'], ['cut', 'CUT'], ['build', 'BUILD'], ['peak', 'PEAK']]);
    await React.act(async () => { select.value = 'cut'; select.dispatchEvent(new W.Event('change', { bubbles: true })); });
    assert.deepEqual(m.calls.filter, ['cut']);
    // A narrowed list offers Clear filters, which clears the search and the phase.
    assert.equal(button(m.host, /^Clear filters$/), undefined);
    await m.render({ filter: 'cut', query: 'be' });
    await click(button(m.host, /^Clear filters$/));
    assert.deepEqual([m.calls.query.at(-1), m.calls.filter.at(-1)], ['', 'all']);
    // Past asks the parent for the past roster.
    await click(tabs(m.host)[2]);
    assert.deepEqual(m.calls.roster, ['past']);
    // The figures: the average and how many are active.
    assert.match(m.host.querySelector('[data-pc-figure="avg"]').textContent, /^66% Avg adherence$/);
    assert.match(m.host.querySelector('[data-pc-figure="active"]').textContent, /^3 ACTIVE$/);
    // ＋ Add opens the add-a-client sheet.
    await click(m.host.querySelector('button[aria-label="Add a client"]'));
    assert.ok(m.host.querySelector('[role="dialog"][aria-label="Add a client"]'), 'the add sheet');
  } finally { await m.close(); }
});

test('the past roster lists past clients, with Message, and no current counts on the views', async () => {
  const past = [{ i: 'B', c: '#888', n: 'Bea Old', prog: 'Finished block', streak: 0, r: 'PAST · finished block', s: 'past', active: false }];
  const m = await mount(past, { roster: 'past', pastCount: 1, totalCount: 4, activeCount: 3 });
  try {
    assert.equal(m.host.querySelector('[role="tablist"]').getAttribute('data-roster-view'), 'past');
    assert.deepEqual(tabs(m.host).map((b) => b.textContent.replace(/\s+/g, '')), ['Needsyou', 'Ontrack', 'Past1', 'All']);
    assert.ok(m.host.querySelector('[data-roster-group="past"]'));
    assert.ok(m.host.querySelector('[aria-label="Message Bea Old"]'));
    // Picking a current view asks the parent for the active roster.
    await click(tabs(m.host)[0]);
    assert.ok(m.calls.roster.includes('active'));
  } finally { await m.close(); }
});

test('loading reads "—", an error offers Retry, an empty roster offers Grow your roster', async () => {
  const m = await mount([], { status: 'loading', totalCount: 0, activeCount: 0 });
  try {
    assert.equal(m.host.querySelector('[data-pc-summary-words]').textContent, '—');
    assert.match(m.host.querySelector('[data-pc-figure="avg"]').textContent, /^— /);
    assert.match(m.host.querySelector('[data-pc-figure="active"]').textContent, /^— /);
    assert.match(m.host.querySelector('[data-pc-status]').textContent, /Loading clients/);
    let retried = 0;
    await m.render({ status: 'error', onRetry: () => { retried += 1; } });
    await click(button(m.host, /^Retry$/));
    assert.equal(retried, 1);
    await m.render({ status: 'ready' });
    assert.match(m.host.textContent, /NO CLIENTS YET/);
    await click(button(m.host, /Grow your roster/));
    assert.ok(m.host.querySelector('[role="dialog"][aria-label="Add a client"]'), 'Grow your roster opens the add sheet');
  } finally { await m.close(); }
});

test('a nutritionist reads days logged, and no preview switch is left', async () => {
  const c = PROS.bsRowFromTriage(triage('green', { id: 'n1', name: 'Nia Lo' }, { foodLogs: { daysLogged7d: 6 } }), 'nutritionist', theme);
  const m = await mount([c], { role: 'nutritionist' });
  try {
    assert.match(m.host.querySelector('[data-pc-figure="avg"]').textContent, /Avg logged · 7d$/);
    await click(tabs(m.host)[3]);
    assert.equal(button(m.host, /Nia Lo/).querySelector('[data-roster-week]').textContent, '86% Logged · 7d');
  } finally { await m.close(); }
  const src = ['BSProClients.jsx', 'iosAppBroadsheetPros.jsx'].map((f) => readFileSync(join(ROOT, 'mobile-app/src/broadsheet', f), 'utf8')).join('\n');
  assert.doesNotMatch(src, /designPreview/);
});
