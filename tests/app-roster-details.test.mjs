// The coach app's Clients page: more about each client, and every current client in one tab.
//
// Owner, 2026-10-31: "this page needs to have more information on clients" and "client page should
// include a tab or section that shows total current clients". A row carries what the roster already
// holds, leaving out what it lacks: a client who needs the coach reads what to do, anyone else their
// program, streak, workouts or intake and since when; each row the week's figure (the page C, 2026-11-04).
// The tabs gain All, every current client, with their count. The rows are built by the shipping
// bsRowFromTriage from engine triage rows and drawn by the shipping BSProRosterView, in jsdom (the harness
// is tests/app-roster-payment-retrying.test.mjs's).
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
for (const chrome of ['BSMasthead', 'BSPageHeader', 'BSBackButton', 'BSAvatar', 'BSFacetAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen', 'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage', 'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}
W.BSTStationHead = ({ label }) => React.createElement('div', { 'data-station-head': String(label) }, String(label));

const PROS = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSProRosterView, bsRowFromTriage };',
});


const triage = (severity, profile, rec = {}) => ({ severity, client: { profile, ...rec }, flags: severity === 'green' ? [] : [{ reason: 'No logs in 5 days', owned: true }], reasons: [], readOnly: [] });
const rows = (role = 'trainer') => [
  PROS.bsRowFromTriage(triage('green', { id: 'u1', name: 'Ana Reyes', joinedAt: '2026-02-10T12:00:00Z' }, { program: { name: 'Hypertrophy' }, streaks: { current: 12 }, trainingAdherence: { pct: 91 }, foodLogs: { daysLogged7d: 6 } }), role, theme),
  PROS.bsRowFromTriage(triage('red', { id: 'u2', name: 'Ben Tal' }, { program: { name: 'Cut Block' }, streaks: { current: 0 }, trainingAdherence: { pct: 40 }, foodLogs: { daysLogged7d: 2 } }), role, theme),
  PROS.bsRowFromTriage(triage('green', { id: 'u3', name: 'Cleo Park' }, {}), role, theme),
];

async function mount(clients, { role = 'trainer', roster = 'active' } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(PROS.BSProRosterView, {
      status: 'ready', role, clients, activeCount: clients.length, pastCount: 2, totalCount: clients.length,
      roster, setRoster: () => {}, query: '', setQuery: () => {}, filter: 'all', setFilter: () => {}, onOpen: () => {},
    }));
  });
  return { host, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const rowOf = (host, name) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(name));
const tabs = (host) => [...host.querySelectorAll('[role="tab"]')];
const open = async (host, i) => { await React.act(async () => { tabs(host)[i].click(); }); };

test('the tabs end with All, every current client, and its count', async () => {
  const m = await mount(rows());
  try {
    // All comes last (owner, 2026-11-03), each view's count beside its word.
    assert.deepEqual(tabs(m.host).map((b) => b.textContent.replace(/\s+/g, ' ').replace(/(\D)(\d)/, '$1 $2').trim()), ['Needs you 1', 'On track 2', 'Past 2', 'All 3']);
    await open(m.host, 3);
    const all = m.host.querySelector('[data-roster-group="all"]');
    assert.ok(all, 'the All list');
    assert.match(all.querySelector('h2').textContent, /^Current clients\s*3$/);
    assert.deepEqual(['Ben Tal', 'Ana Reyes', 'Cleo Park'].map((n) => !!rowOf(all, n)), [true, true, true]);
    // Who needs the coach comes first.
    const order = [...all.querySelectorAll('button')].map((b) => b.textContent).filter((t) => /Ben Tal|Ana Reyes|Cleo Park/.test(t)).map((t) => t.match(/Ben Tal|Ana Reyes|Cleo Park/)[0]);
    assert.deepEqual(order, ['Ben Tal', 'Ana Reyes', 'Cleo Park']);
  } finally { await m.close(); }
});

test('a row carries the program, the streak, since when, and the week as a number', async () => {
  const m = await mount(rows());
  try {
    await open(m.host, 3);
    const ana = rowOf(m.host, 'Ana Reyes');
    assert.equal(ana.querySelector('[data-roster-facts]').textContent, 'Hypertrophy · 12-day streak · Since Feb 2026');
    const week = ana.querySelector('[data-roster-week]');
    assert.ok(week, 'no week figure');
    assert.match(week.textContent, /^91% Adherence$/);
    // A client to reach out to reads what to do (owner, 2026-11-04, of the page C: "the one-line reason"),
    // with their figure.
    const ben = rowOf(m.host, 'Ben Tal');
    assert.equal(ben.querySelector('[data-pc-reason]').textContent, 'No logs in 5 days');
    assert.match(ben.querySelector('[data-roster-week]').textContent, /^40%/);
    // Nothing known: no facts line and no figure.
    const cleo = rowOf(m.host, 'Cleo Park');
    assert.ok(!cleo.querySelector('[data-roster-facts]'), 'a facts line with nothing in it');
    assert.ok(!cleo.querySelector('[data-roster-week]'), 'a week figure with no figure');
  } finally { await m.close(); }
});

test('a program named as the phase line already reads is said once', () => {
  const c = PROS.bsRowFromTriage(triage('green', { id: 'u9', name: 'Dee Ko' }, { program: { name: 'Build · 2400' }, goalPhase: 'build · 2400', streaks: { current: 3 } }), 'nutritionist', theme);
  assert.equal(c.r, 'BUILD · 2400');
  return mount([c], { role: 'nutritionist' }).then(async (m) => {
    try {
      await open(m.host, 3);
      assert.equal(rowOf(m.host, 'Dee Ko').querySelector('[data-roster-facts]').textContent, '3-day streak');
    } finally { await m.close(); }
  });
});

test("a nutritionist's figure is days logged in the last week", async () => {
  const m = await mount(rows('nutritionist'), { role: 'nutritionist' });
  try {
    await open(m.host, 3);
    const week = rowOf(m.host, 'Ana Reyes').querySelector('[data-roster-week]');
    assert.match(week.textContent, /^86% Logged · 7d$/, '6 of 7 days');
  } finally { await m.close(); }
});

test('every client in All has a Message button (Codex on #2532; owner, 2026-11-04: "every client should have a message icon")', async () => {
  const m = await mount(rows());
  try {
    await open(m.host, 3);
    const all = m.host.querySelector('[data-roster-group="all"]');
    for (const n of ['Ben Tal', 'Ana Reyes', 'Cleo Park']) assert.ok(all.querySelector(`[aria-label="Message ${n}"]`), `${n} has no Message button in All`);
  } finally { await m.close(); }
});

test('a figure that falls back to the other measure is labelled as that measure (Codex on #2532)', async () => {
  // A trainer's client with no sessions on the calendar but a food log: that is days logged.
  const t1 = PROS.bsRowFromTriage(triage('green', { id: 'f1', name: 'Fay Lo' }, { foodLogs: { daysLogged7d: 5 } }), 'trainer', theme);
  assert.deepEqual([t1.adh, t1.adhSrc], [71, 'log']);
  // A nutritionist's client with no food log but sessions: that is training adherence.
  const n1 = PROS.bsRowFromTriage(triage('green', { id: 'f2', name: 'Gus Oh' }, { trainingAdherence: { pct: 80 } }), 'nutritionist', theme);
  assert.deepEqual([n1.adh, n1.adhSrc], [80, 'train']);
  for (const [c, role, want] of [[t1, 'trainer', /^71% Logged · 7d$/], [n1, 'nutritionist', /^80% Adherence$/]]) {
    const m = await mount([c], { role });
    try {
      await open(m.host, 3);
      assert.match(rowOf(m.host, c.n).querySelector('[data-roster-week]').textContent, want, role);
    } finally { await m.close(); }
  }
});

test('a live row says what the live reads hold: workouts in six weeks, or average intake (Codex on #2532)', async () => {
  // Built by the production mapper from the coach's reads, as triageLive builds it: get_client_stats,
  // get_client_lifts and the roster entry. Neither read carries a program or a streak.
  const { recordFromCoachData } = await import('../mobile-app/src/services/signalsMap.mjs');
  const rec = (id, name, extra = {}) => recordFromCoachData({
    id, name, joinedAt: '2026-03-02T09:00:00Z',
    stats: { sessionsCompleted: 9, sessionsPlanned: 10, daysLogged7d: 6, avgCalories: 1849.6, avgProtein: 120 },
    lifts: { workoutsLogged42d: 14 }, ...extra,
  });
  const live = (role, r) => PROS.bsRowFromTriage({ severity: 'green', client: r, flags: [], reasons: [], readOnly: [] }, role, theme);
  {
    const m = await mount([live('trainer', rec('l1', 'Hal Ry'))]);
    try {
      await open(m.host, 3);
      const row = rowOf(m.host, 'Hal Ry');
      assert.equal(row.querySelector('[data-roster-facts]').textContent, '14 workouts in 6 wk · Since Mar 2026');
      assert.match(row.querySelector('[data-roster-week]').textContent, /^90% Adherence$/);
    } finally { await m.close(); }
  }
  {
    const m = await mount([live('nutritionist', rec('l2', 'Ida Vu'))], { role: 'nutritionist' });
    try {
      await open(m.host, 3);
      const row = rowOf(m.host, 'Ida Vu');
      assert.equal(row.querySelector('[data-roster-facts]').textContent, 'Avg 1,850 kcal · Since Mar 2026');
      assert.match(row.querySelector('[data-roster-week]').textContent, /^86% Logged · 7d$/);
    } finally { await m.close(); }
  }
  {
    // A new client's six weeks mostly predate them: no count of workouts that reads as a lapse.
    const fresh = live('trainer', rec('l3', 'Jo Bee', { isNew: true, lifts: { workoutsLogged42d: 0 } }));
    assert.equal(fresh._sig.sev, 'new');
    const m = await mount([fresh]);
    try {
      await open(m.host, 3);
      // A new client's row reads their next step, and nowhere a count of workouts.
      const row = rowOf(m.host, 'Jo Bee');
      assert.ok(row.querySelector('[data-pc-reason]'), 'the next step');
      assert.doesNotMatch(row.textContent, /workout/);
    } finally { await m.close(); }
  }
});

test('a client who logged on all eight dates the rollup counts reads 100%, never 114% (Codex on #2532)', async () => {
  // get_client_stats counts snapshot_date >= current_date - 7: eight dates.
  const c = PROS.bsRowFromTriage(triage('green', { id: 'e1', name: 'Eve Ng' }, { foodLogs: { daysLogged7d: 8 } }), 'nutritionist', theme);
  assert.deepEqual([c.adh, c.d], [100, '100%']);
  const m = await mount([c], { role: 'nutritionist' });
  try {
    await open(m.host, 3);
    assert.match(rowOf(m.host, 'Eve Ng').querySelector('[data-roster-week]').textContent, /^100% Logged · 7d$/);
  } finally { await m.close(); }
  // The case file holds it the same way.
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
  assert.match(src, /const days7 = lnum\(S\.daysLogged7d\) == null \? null : Math\.min\(7, lnum\(S\.daysLogged7d\)\)/);
});

test('a trainer row keeps the workouts the lifts read found when the stats read failed (Codex on #2532)', async () => {
  const { recordFromCoachData } = await import('../mobile-app/src/services/signalsMap.mjs');
  const rec = recordFromCoachData({ id: 'k1', name: 'Kai Ro', stats: null, lifts: { workoutsLogged42d: 9 } });
  assert.deepEqual(rec.totals, { workouts: 9 });
  const row = PROS.bsRowFromTriage({ severity: 'green', client: rec, flags: [], reasons: [], readOnly: [] }, 'trainer', theme);
  assert.equal(row.workouts6w, 9);
  // Both reads failed: nothing is made up.
  assert.equal(recordFromCoachData({ id: 'k2', name: 'Lu', stats: null, lifts: null }).totals, undefined);
});

test('the facts are in every locale the app ships', () => {
  const LOCALES = ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];
  for (const loc of LOCALES) {
    for (const k of ['roster.tabAll', 'roster.groupAll', 'roster.streakDays', 'roster.since', 'roster.weekLogged', 'roster.weekAdherence', 'roster.workouts6w', 'roster.avgKcal']) {
      const v = catalog(loc)[k];
      assert.ok(typeof v === 'string' && v.trim(), `${loc}: coach:${k}`);
      assert.doesNotThrow(() => new IntlMessageFormat(v, loc).format({ count: 3, date: 'x', kcal: '1,850' }), `${loc}: coach:${k} formats`);
    }
  }
});
