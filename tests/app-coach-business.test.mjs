// The coach app's Business page (owner, 2026-10-17: "create a business page on app for coaches.
// So have to match what is on website but designed for app", placed inside Me), MOUNTED:
// mobile-app/src/broadsheet/BSCoachBusiness.jsx in the real broadsheet chrome, against a scripted
// ShapeCoachBusiness / ShapeCoachListing / ShapeBookings, reading the real English catalog.
//
// Every figure it prints comes from public/newdesign/coachForecast.js, the module the website's
// Business page runs, so the expected numbers here are computed through it too: the two pages
// cannot drift apart without one of these failing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
// The routes' own renewal rows (both analytics routes build them with it).
import { renewalRows, RENEWAL_CHECK_CAP } from '../src/lib/coach-renewals.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');

// The English catalog the app ships, formatted as the app's i18next+ICU runtime formats it.
// A key missing from it fails here rather than falling back.
const CATALOG = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/coach.json'), 'utf8'));
window.ShapeI18n = {
  t: (key, opts = {}) => {
    const k = key.replace(/^coach:/, '');
    assert.ok(key.startsWith('coach:') && k in CATALOG, `${key} is not in the English coach catalog`);
    return new IntlMessageFormat(CATALOG[k], 'en-US').format(opts);
  },
  intlLocale: () => 'en-US',
};

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { host, text: () => host.textContent.replace(/\s+/g, ' '), unmount: () => act(async () => root.unmount()) };
}
const click = async (el) => { assert.ok(el, 'no such button'); await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const button = (host, re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent) || re.test(b.getAttribute('aria-label') || ''));

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
// The subpage header lives in the client module; the page reads it from window at call time.
window.BSDetailHeader = ({ kicker, title, onBack }) => React.createElement('header', null, React.createElement('button', { type: 'button', onClick: onBack }, '← Back'), kicker, ' ', title);
const BIZ = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCoachBusiness.jsx'), { registry: new Map([['react', React]]) });
const CF = window.CoachForecast;
assert.ok(CF && CF.planNumbers, 'the module registers the shared forecast');
const inChrome = (el) => React.createElement(window.BSProvider, { paperMode: 'paper' }, el);
const money = (c) => '$' + Math.round(c / 100).toLocaleString('en-US');
const DAY = 86400000;

// 26 weekly buckets ending this week: 9 clients growing to 12, two departures in the window.
// `start`, `adds` and `ends` (week indexes, 0 oldest) and `firstDays` reshape it.
function trajectory(now = Date.now(), { start = 9, adds = [16, 19, 22, 24, 25], ends = [18, 23], firstDays = 300 } = {}) {
  const monday = new Date(now); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weeks = [];
  let active = start;
  for (let i = 25; i >= 0; i--) {
    const k = 25 - i;
    const added = adds.includes(k) ? 1 : 0;
    const ended = ends.includes(k) ? 1 : 0;
    active += added - ended;
    weeks.push({ weekOf: new Date(monday.getTime() - i * 7 * DAY).toISOString().slice(0, 10), active, added, ended, mrrGrossCents: active * 18000, mrrNetCents: active * 15300 });
  }
  return { weeks, firstSubAt: new Date(now - firstDays * DAY).toISOString() };
}
function payload(over = {}, shape) {
  const traj = trajectory(Date.now(), shape);
  const last = traj.weeks[traj.weeks.length - 1];
  return {
    isTrainer: true, providerId: 7,
    trajectory: traj,
    metrics: { activeClients: last.active - 1, mrrNetCents: 1, mrrGrossCents: 1 },
    byOrigin: [{ kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 }],
    // The routes' per-client brought-in share (byoMixOf): one plan a client here, so 1 of 4.
    byoMix: { clients: 4, brought: 1 },
    stripe: { connected: true, balanceCents: 52000, pendingCents: 9000, payouts: [{ status: 'in_transit', amountCents: 40000, arrivalDate: Date.now() + 2 * DAY }, { status: 'paid', amountCents: 99999, arrivalDate: Date.now() - 5 * DAY }], schedule: { interval: 'weekly', weeklyAnchor: 'friday', delayDays: 2 } },
    renewals: [
      { name: 'Casey M.', dueAt: new Date(Date.now() + DAY).toISOString(), priceCents: 18000, netCents: 15300, ending: false },
      { name: 'Alex R.', dueAt: new Date(Date.now() + 3 * DAY).toISOString(), priceCents: 18000, netCents: 18000, ending: false },
      { name: 'Jordan P.', dueAt: new Date(Date.now() + 4 * DAY).toISOString(), priceCents: 18000, netCents: 15300, ending: true },
      { name: 'Sam K.', dueAt: new Date(Date.now() + 5 * DAY).toISOString(), priceCents: 18000, netCents: 15300, ending: null },
    ],
    churn: [
      { name: 'Riley T.', endedAt: new Date(Date.now() - 20 * DAY).toISOString(), priceCents: 18000 },
      { name: 'Old Departure', endedAt: new Date(Date.now() - 200 * DAY).toISOString(), priceCents: 18000 },
    ],
    ...over,
  };
}
// The services the page reads, scripted. `analytics` answers `answer` (a payload, null, or an Error).
function world({ signedIn = true, answer = payload(), listing = { role: 'trainer', monthly: 180 }, waiting = 3 } = {}) {
  const st = { calls: [], onboard: [], stripe: 0 };
  window.ShapeAuth = { getCachedState: () => ({ user: signedIn ? { id: 'coach-1' } : null }) };
  window.ShapeCoachBusiness = {
    analytics: (args) => { st.calls.push(args); return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer); },
    openStripe: () => { st.stripe++; },
  };
  // `listing` an Error: the listing read failed.
  window.ShapeCoachListing = { getMine: () => (listing instanceof Error ? Promise.reject(listing) : Promise.resolve(listing ? [listing] : [])) };
  window.ShapeBookings = { getCapacity: () => Promise.resolve(waiting == null ? null : { waiting }) };
  window.ShapeConnect = { startOnboarding: (a) => { st.onboard.push(a); return Promise.resolve(); } };
  return st;
}
const page = (props = {}) => inChrome(React.createElement(BIZ.BSCoachBusinessPage, { role: 'trainer', onBack: () => {}, ...props }));
// The planner on its own, from a base the test sets (as the website's tests mount DbzPlanZone).
const PlanOnly = ({ base }) => React.createElement(BIZ.BSBizPlan, { t: window.useBS(), base });
const plan = (base) => inChrome(React.createElement(PlanOnly, { base }));
const setRange = async (input, v) => {
  assert.ok(input, 'no such slider');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, String(v));
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
};
const ranges = (host) => [...host.querySelectorAll('input[type="range"]')];
const sentence = (host) => host.querySelector('p').textContent;
// Where the planner starts: coachForecast.js planStart, with the churn kept to a tenth.
const startOf = (base) => ({ ...CF.planStart(base), ...(base.pace.churn != null ? { churnPct: BIZ.bsBizChurnPct(base.pace.churn) } : {}) });
const runFor = (base, o) => CF.forecast({ clients: base.clients, mrrNetCents: base.mrrNetCents, byoShare: base.byoShare, months: 36, priceCents: o.rate * 100, adds: o.adds, churn: o.churnPct / 100 });

test("Money: today's figures from the trajectory, what's coming from Stripe, and this week's renewals checked", async () => {
  const st = world();
  const p = payload();
  const m = await mount(page());
  assert.deepEqual(st.calls, [{ role: 'trainer', renewals: true }], 'the page asks for this week\'s renewals');
  const today = CF.todayFrom(p);
  assert.match(m.text(), new RegExp(`${today.clients} clients · \\${money(today.mrrNetCents)} net a month`), 'the trajectory, not the route\'s metrics (a past_due client counts)');
  const coming = CF.moneyFrom(p.stripe);
  assert.equal(coming.comingCents, 40000 + 52000 + 9000);
  assert.match(m.text(), new RegExp(`\\${money(coming.comingCents)} is coming to you\\. The next payout, \\$400, lands`));
  assert.match(m.text(), /On its way to your bank.*Ready to pay out.*Still clearing.*Net a month, at today's clients/);
  assert.match(m.text(), /Paid out weekly, on Friday, 2 days after each charge/);
  // Renewals: only the confirmed two are counted; the cancelled and the unchecked say so.
  assert.match(m.text(), /Renewing this week2 clients · \$333 net/);
  assert.match(m.text(), /Cancelled · ends/);
  assert.match(m.text(), /Some couldn't be checked with Stripe, so they aren't counted above\./);
  // The footnote can't say which client wasn't checked, so Sam's own row does: amber, with no
  // monthly price like a renewal's, and the amount dimmed like money not counted, but not struck.
  assert.match(m.text(), /Sam K\.[^$]* · not checked with Stripe\$153/);
  const row = (name) => [...m.host.querySelectorAll('div')].find((d) => d.textContent === name).parentElement;
  const amount = (name) => row(name).nextElementSibling.style;
  const sub = (name) => row(name).lastElementChild.style.color;
  assert.deepEqual([amount('Sam K.').color === amount('Casey M.').color, amount('Sam K.').color === amount('Jordan P.').color, amount('Sam K.').textDecoration], [false, true, 'none']);
  assert.deepEqual([sub('Sam K.') === sub('Casey M.'), sub('Sam K.') === sub('Jordan P.'), sub('Jordan P.') === sub('Casey M.')], [false, false, false]);
  await click(button(m.host, /Open your Stripe/));
  assert.equal(st.stripe, 1, 'payouts are in the coach\'s own Stripe dashboard');
  await m.unmount();
});

test('Money: not linked offers set-up; a failed Stripe read says so; no renewals is its own sentence', async () => {
  let st = world({ answer: payload({ stripe: { connected: false }, renewals: [] }) });
  let m = await mount(page());
  assert.match(m.text(), /Payouts aren't set up yet/);
  assert.match(m.text(), /No one renews in the next 7 days\./);
  await click(button(m.host, /Set up payouts/));
  assert.deepEqual(st.onboard, [{ role: 'trainer' }]);
  await m.unmount();
  st = world({ answer: payload({ stripe: { connected: true, error: true }, renewals: null }) });
  m = await mount(page());
  assert.match(m.text(), /Couldn't reach Stripe just now/);
  assert.doesNotMatch(m.text(), /is coming to you/, 'a failed read is not an empty account');
  assert.match(m.text(), /Couldn't read your subscriptions just now/, 'unread renewals are not "no one renews"');
  await m.unmount();
});

test('loading, no listing, and a failed read are three sentences; Try again reads again', async () => {
  let st = world({ answer: null });
  let m = await mount(page());
  assert.match(m.text(), /Business fills in once your coach application is approved/);
  await m.unmount();
  st = world({ answer: new Error('500') });
  m = await mount(page());
  assert.match(m.text(), /Couldn't read your business figures just now/);
  assert.doesNotMatch(m.text(), /\$0/, 'never a zero');
  window.ShapeCoachBusiness.analytics = (args) => { st.calls.push(args); return Promise.resolve(payload()); };
  await click(button(m.host, /Try again/));
  assert.equal(st.calls.length, 2);
  assert.match(m.text(), /is coming to you/);
  await m.unmount();
});

test('Plan: the calculator and the planner start from the listing price and the coach\'s own pace', async () => {
  world();
  const p = payload();
  const m = await mount(page({ tab: 'plan' }));
  const base = CF.planNumbers({ extra: p, listingMonthly: 180 });
  assert.equal(base.rateFrom, 'listing');
  // What clients earn you: a round number above today, at the listing price, with the brought share.
  const inputs = [...m.host.querySelectorAll('input[type="number"]')].map((i) => i.value);
  assert.deepEqual(inputs, [String(Math.max(20, Math.ceil((base.clients + 1) / 10) * 10)), '180', '25']);
  const e = CF.earn({ clients: Number(inputs[0]), priceCents: 18000, byoShare: 0.25 });
  assert.match(m.text(), new RegExp(`\\${money(e.netCents)}net a month\\${money(e.yearNetCents)}a year`));
  assert.match(m.text(), /0% fee · 1 of your 4/);
  // The planner's sentence says what the chart shows, from today's pace.
  const start = startOf(base);
  const f = runFor(base, start);
  assert.match(m.text(), new RegExp(`You have ${base.clients} clients and net \\${money(base.mrrNetCents)} a month\\. At today's pace that becomes \\${money(f.rows[12].netCents)} a month in a year\\.`));
  const reach = CF.monthsTo(start.goal * 100, f);
  assert.match(m.text(), reach == null ? /doesn't reach your/ : new RegExp(`reach your \\$${start.goal.toLocaleString('en-US')} goal in ${reach} months?`));
  assert.match(m.text(), new RegExp(`yours: ${start.adds.toFixed(1)} over the last 3 months`));
  assert.equal(m.host.querySelectorAll('polyline').length, 1, 'untouched, one line: today\'s pace');
  await m.unmount();
});

// Codex round 5 on #2394: the brought-in share is per client. One brought client on two plans and
// one who found the coach on Shape is 1 of 2 clients (50%), not 2 of 3 rows, and the app's "What
// clients earn you" starts from the same per-client mix the website's Plan tab does.
test('What clients earn you: the brought-in share is per client, so a brought client on two plans beside one from Shape reads 1 of 2', async () => {
  // The mix as the routes build it (the real byoMixOf), from the rows the routes read.
  const { byoMixOf } = await loadRealModule(join(ROOT, 'src/lib/origin-attribution.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) });
  const subs = [{ id: 'r1', client_id: 'A', fee_bps: 0 }, { id: 'r2', client_id: 'A', fee_bps: 1500 }, { id: 'r3', client_id: 'B', fee_bps: 1500 }];
  const byoMix = byoMixOf(subs);
  assert.deepEqual(byoMix, { clients: 2, brought: 1 });
  // The origin feed still lists each row: counted as rows, its two brought-in rows read 2 of 3.
  const byOrigin = [{ kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 1500 }];
  world({ answer: payload({ byOrigin, byoMix }) });
  const m = await mount(page({ tab: 'plan' }));
  assert.match(m.text(), /0% fee · 1 of your 2/);
  assert.doesNotMatch(m.text(), /of your 3/);
  const inputs = [...m.host.querySelectorAll('input[type="number"]')].map((i) => i.value);
  assert.equal(inputs[2], '50', 'the calculator starts at 1 of 2 clients brought');
  const e = CF.earn({ clients: Number(inputs[0]), priceCents: 18000, byoShare: 0.5 });
  assert.match(m.text(), new RegExp(`\\${money(e.netCents)}net a month`));
  await m.unmount();
});

test('Plan: moving a slider makes it your plan, with today\'s pace kept as the dashed line, and Back to my numbers', async () => {
  world();
  const m = await mount(page({ tab: 'plan' }));
  const adds = m.host.querySelectorAll('input[type="range"]')[0];
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(adds, String(Number(adds.value) + 2));
    adds.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
  assert.equal(m.host.querySelectorAll('polyline').length, 2, 'the plan, and today\'s pace to beat');
  assert.match(m.text(), /At today's pace that becomes \$[\d,]+ a month in a year\. With your plan it's \$[\d,]+\./);
  assert.match(m.text(), /· was \d/);
  await click(button(m.host, /Back to my numbers/));
  assert.equal(m.host.querySelectorAll('polyline').length, 1);
  await m.unmount();
});

test('Clients: joined and left, what a client is worth, the waiting list in money, and who left in 90 days', async () => {
  world();
  const p = payload();
  const m = await mount(page({ tab: 'clients' }));
  const base = CF.planNumbers({ extra: p, listingMonthly: 180 });
  assert.match(m.text(), new RegExp(`${base.pace.added} clients joined and ${base.pace.ended} left`));
  const lt = CF.lifetime({ netPerClientCents: base.mrrNetCents / base.clients, churn: base.pace.churn });
  assert.match(m.text(), new RegExp(`stays about ${Math.round(lt.months)} months on average, so each one is worth about \\${money(lt.valueCents)} to you`));
  const wait = CF.earn({ clients: 3, priceCents: 18000, byoShare: 0 }).netCents;
  assert.match(m.text(), new RegExp(`3 people are waiting to join you\\. If they join at \\$180 a month, that's about \\${money(wait)} a month to you\\.`));
  assert.match(m.text(), /Riley T\./);
  assert.doesNotMatch(m.text(), /Old Departure/, 'the list has the 90-day window its heading says');
  await m.unmount();
});

// The website's Codex round 7 (#2394): the waiting list is valued at the listing price alone. The
// Plan's rate falls back to the clients' average or a default, which is not what they would pay.
test('the waiting list is valued at the listing price, and says why when there is none', async () => {
  for (const [why, listing, re] of [
    ['the listing read failed', new Error('offline'), /3 people are waiting to join you\. Couldn't read your listing price just now, so they aren't valued here\./],
    ['no listing of this role', null, /3 people are waiting to join you\. Set a monthly price on your listing to see what they'd bring in\./],
    ['a listing with no price', { role: 'trainer', monthly: 0 }, /3 people are waiting to join you\. Set a monthly price on your listing to see what they'd bring in\./],
    ['a listing at $200', { role: 'trainer', monthly: 200 }, new RegExp(`3 people are waiting to join you\\. If they join at \\$200 a month, that's about \\${money(CF.earn({ clients: 3, priceCents: 20000, byoShare: 0 }).netCents)} a month to you\\.`)],
  ]) {
    world({ listing });
    const m = await mount(page({ tab: 'clients' }));
    assert.match(m.text(), re, why);
    if (why !== 'a listing at $200') assert.doesNotMatch(m.text(), /If they join at/, why + ': no figure from a fallback rate');
    await m.unmount();
  }
});

// The website's Codex round 8 (#2394): people, not plans. A client still here who cancelled one
// plan hasn't left; one client with two plans due is one client.
test('Left in the last 90 days leaves out a current client, and the renewals header counts people', async () => {
  const p = payload();
  const recentEnd = p.churn[0].endedAt;
  const soon = new Date(Date.now() + 2 * DAY).toISOString();
  world({ answer: payload({
    churn: [...p.churn, { name: 'Still Here', clientId: 'still', stillClient: true, endedAt: recentEnd, priceCents: 9000 }],
    renewals: [
      { name: 'Two Plans', clientId: 'two', dueAt: soon, priceCents: 18000, netCents: 15300, ending: false },
      { name: 'Two Plans', clientId: 'two', dueAt: soon, priceCents: 6000, netCents: 5100, ending: false },
    ],
  }) });
  const clients = await mount(page({ tab: 'clients' }));
  assert.match(clients.text(), /Riley T\./);
  assert.doesNotMatch(clients.text(), /Still Here/, 'a current client is not listed as gone');
  await clients.unmount();
  const moneyTab = await mount(page({ tab: 'money' }));
  assert.match(moneyTab.text(), new RegExp('1 client · \\' + money(20400) + ' net'));
  await moneyTab.unmount();
});

// ── The website's Business sweep (2026-10-18), mirrored ─────────────────────
test('the pace is read once per visit: a re-render under a moving clock keeps the plan where it started', async () => {
  // The waiting list answers late, as a slow network does, and re-renders the page.
  let land;
  const late = new Promise((r) => { land = r; });
  world();
  window.ShapeBookings = { getCapacity: () => late.then(() => ({ waiting: 3 })) };
  const realNow = Date.now;
  const t0 = realNow();
  let clock = t0;
  Date.now = () => clock;
  try {
    const p = payload();
    const m = await mount(page({ tab: 'plan' }));
    const base = CF.planNumbers({ extra: p, listingMonthly: 180, now: t0 });
    const start = startOf(base);
    assert.match(m.text(), new RegExp(`yours: ${start.adds.toFixed(1)} over the last 3 months`));
    await setRange(ranges(m.host)[0], start.adds + 2);
    const moved = m.text();
    assert.match(moved, new RegExp(`· was ${start.adds.toFixed(1)}`));
    // Two months on by the clock, far enough that even the rounded pace would read differently
    // (in a browser it moves every render; at a tenth of a point a day can be enough).
    clock = t0 + 60 * DAY;
    assert.notEqual(startOf(CF.planNumbers({ extra: p, listingMonthly: 180, now: clock })).adds, start.adds, 'the fixture\'s pace moves with the clock');
    await act(async () => { land(); await late; });
    await flush();
    assert.equal(Number(ranges(m.host)[0].value), start.adds + 2, 'the coach\'s plan survives the re-render');
    assert.equal(m.text(), moved, 'the same "yours", the same "was", the same line to beat');
    // The Clients tab reads the same moment: what a client is worth, from the pace at t0.
    await click(button(m.host, /^Clients$/));
    const lt = CF.lifetime({ netPerClientCents: base.mrrNetCents / base.clients, churn: base.pace.churn });
    assert.match(m.text(), new RegExp(`${base.pace.added} clients joined and ${base.pace.ended} left over the last 3 months`));
    assert.match(m.text(), new RegExp(`stays about ${Math.round(lt.months)} months on average, so each one is worth about \\${money(lt.valueCents)} to you`));
    await m.unmount();
  } finally {
    Date.now = realNow;
  }
});

test('a younger practice\'s pace reads "after your first week" (the opening roster is not a pace)', async () => {
  world({ answer: payload({}, { firstDays: 60 }) });
  let m = await mount(page({ tab: 'plan' }));
  assert.match(m.text(), /yours: \d+\.\d after your first week/);
  assert.match(m.text(), /% leave a month, after your first week/);
  assert.doesNotMatch(m.text(), /since your first client/);
  await m.unmount();
  m = await mount(page({ tab: 'clients' }));
  assert.match(m.text(), /joined and \d+ left after your first week\./);
  assert.match(m.text(), /of clients leaving a month after your first week/);
  await m.unmount();
});

test('a small measured churn is kept to a tenth of a point, and a departure never reads as 0%', async () => {
  // One departure from about 70 clients in three months: under half a point a month.
  const p = payload({}, { start: 70, adds: [16, 20, 24], ends: [22] });
  world({ answer: p });
  const base = CF.planNumbers({ extra: p, listingMonthly: 180 });
  const pct = BIZ.bsBizChurnPct(base.pace.churn);
  assert.ok(pct > 0 && pct < 1 && !Number.isInteger(pct), 'the fixture churns under a point: ' + pct);
  // Checked on the raw pace, not through planStart: the shared module's whole-point rounding is
  // the defect, and a fix to it must not turn this test red.
  assert.equal(Math.round(base.pace.churn * 100), 0, 'whole points would read it as nobody leaving');
  let m = await mount(page({ tab: 'plan' }));
  const churn = ranges(m.host)[1];
  assert.equal(churn.getAttribute('step'), '0.1');
  assert.match(m.text(), new RegExp(`Monthly churn${pct.toFixed(1)}%`));
  assert.match(m.text(), new RegExp(`yours: ${pct.toFixed(1)}% leave a month, over the last 3 months`));
  const f = runFor(base, startOf(base));
  assert.match(sentence(m.host), new RegExp(`At today's pace that becomes \\${money(f.rows[12].netCents)} a month in a year\\.`), 'the plan runs at the measured churn, not at 0%');
  // A tenth of a point at a time, with the was in the same precision.
  await setRange(churn, pct + 0.3);
  assert.match(m.text(), new RegExp(`Monthly churn${(pct + 0.3).toFixed(1)}% · was ${pct.toFixed(1)}%`));
  await m.unmount();
  m = await mount(page({ tab: 'clients' }));
  assert.match(m.text(), new RegExp(`From ${pct.toFixed(1)}% of clients leaving a month over the last 3 months`));
  await m.unmount();
  // One departure from 800 clients in three months rounds to 0.0: it still reads 0.1%.
  const big = payload({}, { start: 800, adds: [16, 20, 24], ends: [22] });
  world({ answer: big });
  assert.equal(Math.round(CF.planNumbers({ extra: big, listingMonthly: 180 }).pace.churn * 1000), 0, 'the fixture rounds to 0.0');
  m = await mount(page({ tab: 'clients' }));
  assert.match(m.text(), /From 0\.1% of clients leaving a month/);
  await click(button(m.host, /^Plan$/));
  assert.match(m.text(), /yours: 0\.1% leave a month/);
  await m.unmount();
});

// The catalog the app ships for `loc`, formatted as the app formats it, with the app's Intl locale.
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR', 'ru', 'uk', 'tr', 'vi', 'id', 'ha', 'pcm'];
const catalogOf = (loc) => JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${loc}/coach.json`), 'utf8'));
function speak(loc, intl) {
  const C = catalogOf(loc);
  window.ShapeI18n = {
    t: (key, opts = {}) => {
      const k = key.replace(/^coach:/, '');
      assert.ok(key.startsWith('coach:') && k in C, `${key} is not in the ${loc} coach catalog`);
      return new IntlMessageFormat(C[k], intl).format(opts);
    },
    intlLocale: () => intl,
  };
}

test('a tenth reads in the coach\'s language: a comma in German, beside money grouped with a point, and the percent sign where the language writes it', async () => {
  const english = window.ShapeI18n;
  speak('de', 'de-DE');
  // German and Turkish both write the tenth with a comma.
  const de1 = (v) => v.toFixed(1).replace('.', ',');
  try {
    const p = payload({}, { start: 70, adds: [16, 20, 24], ends: [22] });
    world({ answer: p });
    const base = CF.planNumbers({ extra: p, listingMonthly: 180 });
    const pct = BIZ.bsBizChurnPct(base.pace.churn);
    const start = startOf(base);
    assert.ok(!Number.isInteger(pct), 'the fixture churns a tenth of a point: ' + pct);
    const m = await mount(page({ tab: 'clients' }));
    const lt = CF.lifetime({ netPerClientCents: base.mrrNetCents / base.clients, churn: base.pace.churn });
    assert.ok(lt.valueCents >= 100000, 'the worth is in the thousands, so German groups it with a point');
    // The money groups with a point, so the tenth must use a comma, or "0.4 %" reads as grouping.
    assert.ok(m.text().includes('$' + Math.round(lt.valueCents / 100).toLocaleString('de-DE')), 'the worth in German grouping');
    assert.match(m.text(), new RegExp(`Aus ${de1(pct)} % der Klienten, die in den letzten 3 Monaten pro Monat gehen`));
    assert.doesNotMatch(m.text(), /\d\.\d %/, 'no English decimal point beside a German percent');
    await click(button(m.host, /^Plan$/));
    // The slider writes its percent as the note under it does: "0,4 %" in German, not "0,4%".
    assert.match(m.text(), new RegExp(`Monatliche Abwanderung${de1(pct)} %deins: ${de1(pct)} % gehen im Monat, in den letzten 3 Monaten`));
    assert.match(m.text(), new RegExp(`Neue Klienten im Monat${de1(start.adds)}`));
    assert.match(m.text(), new RegExp(`deins: ${de1(start.adds)} in den letzten 3 Monaten`));
    // Moved, the "vorher" carries the same comma and the same sign.
    await setRange(ranges(m.host)[1], pct + 0.3);
    await setRange(ranges(m.host)[0], start.adds + 2);
    assert.match(m.text(), new RegExp(`Monatliche Abwanderung${de1(pct + 0.3)} % · vorher ${de1(pct)} %deins`));
    assert.match(m.text(), new RegExp(`Neue Klienten im Monat${de1(start.adds + 2)} · vorher ${de1(start.adds)}`));
    await m.unmount();
    // Turkish writes the sign first ("%0,4"): the slider, its "önce" and its note alike.
    speak('tr', 'tr-TR');
    world({ answer: p });
    const tm = await mount(page({ tab: 'plan' }));
    assert.match(tm.text(), new RegExp(`Aylık kayıp%${de1(pct)}seninki: her ay %${de1(pct)} ayrılıyor, son 3 ayda`));
    await setRange(ranges(tm.host)[1], pct + 0.3);
    assert.match(tm.text(), new RegExp(`Aylık kayıp%${de1(pct + 0.3)} · önce %${de1(pct)}seninki`));
    await tm.unmount();
  } finally {
    window.ShapeI18n = english;
  }
});

test('the churn slider\'s percent sign sits where its note puts it, in all 13 languages, and is never glued on in English', () => {
  for (const loc of LOCALES) {
    const C = catalogOf(loc);
    assert.ok(C['business.plan.pct'], `${loc} has the slider's percent`);
    const shown = new IntlMessageFormat(C['business.plan.pct'], 'en').format({ value: 'N' });
    assert.ok(shown.includes('N') && shown.includes('%'), `${loc}: "${shown}"`);
    // The note under the slider and the Clients tab's worth both write the same percent.
    const note = new IntlMessageFormat(C['business.plan.yoursChurn'], 'en').format({ value: 'N', when: 'W' });
    const worth = new IntlMessageFormat(C['business.clients.worthFrom'], 'en').format({ pct: 'N', when: 'W', net: '$1' });
    assert.ok(note.includes(shown), `${loc}: the slider reads "${shown}", its note "${note}"`);
    assert.ok(worth.includes(shown), `${loc}: the slider reads "${shown}", the worth "${worth}"`);
  }
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSCoachBusiness.jsx'), 'utf8');
  assert.doesNotMatch(src, /\+ '%'/, 'no English percent sign appended to a number in the coach\'s language');
});

test('the goal sentence never contradicts its figures: still climbing, levelling off, or the same month', async () => {
  const BASE = { state: 'ready', rateFrom: 'listing', brought: 0, byoClients: 0, byoShare: 0, rateCents: 15000 };
  // 8 clients, $1,020 net a month, 0.7 a month, 2% churn, $150: it plateaus near $4,463, above a
  // $3,500 goal it takes more than three years to reach.
  const climbing = { ...BASE, clients: 8, mrrNetCents: 102000, pace: { adds: 0.7, churn: 0.02, fromFirst: false, added: 2, ended: 0 } };
  let m = await mount(plan(climbing));
  await setRange(ranges(m.host)[3], 3500);
  const T = runFor(climbing, { adds: 0.7, churnPct: 2, rate: 150 });
  assert.equal(CF.monthsTo(350000, T), null);
  assert.ok(T.steadyNetCents > 350000, 'the fixture plateaus above the goal');
  assert.ok(sentence(m.host).endsWith(`That doesn't reach your $3,500 goal within three years, but it's still climbing, toward ${money(T.steadyNetCents)} a month.`), sentence(m.host));
  assert.doesNotMatch(sentence(m.host), /levels off/);
  // Above the plateau, it does level off below the goal, and says so.
  await setRange(ranges(m.host)[3], 5000);
  assert.ok(sentence(m.host).endsWith(`That doesn't reach your $5,000 goal within three years: it levels off near ${money(T.steadyNetCents)} a month.`), sentence(m.host));
  await m.unmount();
  // The plan and today's pace reach the goal the same month: not "in 8 months, instead of 8 months".
  const same = { ...BASE, clients: 10, mrrNetCents: 127500, pace: { adds: 1, churn: 0.02, fromFirst: false, added: 3, ended: 1 } };
  m = await mount(plan(same));
  await setRange(ranges(m.host)[2], 155);
  const goal = Number(ranges(m.host)[3].value) * 100;
  const [pr, tr] = [CF.monthsTo(goal, runFor(same, { adds: 1, churnPct: 2, rate: 155 })), CF.monthsTo(goal, runFor(same, { adds: 1, churnPct: 2, rate: 150 }))];
  assert.ok(pr != null && pr === tr, 'the fixture reaches the goal the same month both ways: ' + pr + ' ' + tr);
  assert.ok(sentence(m.host).endsWith(`goal in ${pr} months, the same month as at today's pace.`), sentence(m.host));
  assert.doesNotMatch(sentence(m.host), /instead of/);
  await m.unmount();
});

test('Left in the last 90 days: a full list all inside the window says more may have left', async () => {
  const row = (i, days) => ({ name: 'C' + i, endedAt: new Date(Date.now() - days * DAY).toISOString(), priceCents: 18000 });
  const full = Array.from({ length: BIZ.BS_BIZ_CHURN_LIST }, (_, i) => row(i, 5 + i));
  world({ answer: payload({ churn: full }) });
  let m = await mount(page({ tab: 'clients' }));
  assert.match(m.text(), /C11left [^$]*\$180\/moOnly the latest 12 are shown; more may have left in these 90 days\./);
  await m.unmount();
  // One of the twelve is older than the window: the list is whole, and no note.
  world({ answer: payload({ churn: [...full.slice(0, 11), row(11, 120)] }) });
  m = await mount(page({ tab: 'clients' }));
  assert.match(m.text(), /C10left /);
  assert.doesNotMatch(m.text(), /C11|Only the latest/);
  await m.unmount();
  // The routes send the newest 12, as BS_BIZ_CHURN_LIST says.
  assert.equal(BIZ.BS_BIZ_CHURN_LIST, 12);
  for (const role of ['trainer', 'nutritionist']) {
    const src = readFileSync(join(ROOT, `src/app/api/${role}/analytics/route.ts`), 'utf8');
    assert.match(src, /\.eq\('status', 'canceled'\)\n\s+\.order\('current_period_end', \{ ascending: false, nullsFirst: false \}\)\n\s+\.limit\(12\);/, role + ' sends the newest 12');
  }
});

test('signed out: a preview with sample numbers that says so, and no reads', async () => {
  const st = world({ signedIn: false });
  const m = await mount(page());
  assert.equal(st.calls.length, 0);
  assert.match(m.text(), /A preview with sample numbers\. Sign in as a coach to see yours\./);
  assert.match(m.text(), /is coming to you/);
  await click(button(m.host, /^Plan$/));
  assert.match(m.text(), /What clients earn you/);
  await click(button(m.host, /^Clients$/));
  assert.match(m.text(), /people are waiting to join you/);
  await m.unmount();
});

test('the Me card: the coach\'s own net a month and clients, no renewal reads, opening Business, and hiding remembered', async () => {
  const st = world();
  const p = payload();
  window.localStorage.removeItem('bs_pro_rev_hidden');
  const opened = [];
  const card = () => inChrome(React.createElement(BIZ.BSCoachBusinessCard, { role: 'trainer', accent: '#c0533b', onOpen: () => opened.push(1) }));
  let m = await mount(card());
  assert.deepEqual(st.calls, [{ role: 'trainer', renewals: false }], 'the card costs no Stripe renewal reads');
  const today = CF.todayFrom(p);
  assert.match(m.text(), new RegExp(`\\${money(today.mrrNetCents)}net a month${today.clients} clients · payouts, renewals and your plan`));
  await click(button(m.host, /Business ›/));
  assert.equal(opened.length, 1);
  await click(button(m.host, /Hide your figures/));
  assert.match(m.text(), /Business · hidden/);
  assert.doesNotMatch(m.text(), /net a month/, 'the money is off the screen');
  await m.unmount();
  // Remembered on this device: hidden, it reads nothing; Show brings it back.
  st.calls.length = 0;
  m = await mount(card());
  assert.match(m.text(), /Business · hidden/);
  assert.equal(st.calls.length, 0, 'a hidden card reads nothing');
  await click(button(m.host, /Show your figures/));
  assert.match(m.text(), /net a month/);
  assert.equal(window.localStorage.getItem('bs_pro_rev_hidden'), '0');
  await m.unmount();
});

test('Me: the card is on the coach\'s own Me tab only, and Settings → Your practice → Payouts opens Business', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(src, /import \{ BSCoachBusinessPage, BSCoachBusinessCard \} from '\.\/BSCoachBusiness\.jsx';/);
  const coach = src.slice(src.indexOf('function BSSignalCoachProfile('), src.indexOf('function BSPublicProfile('));
  assert.match(coach, /\{meMode && isSelf && \(\n\s+<div style=\{\{ marginTop: 16 \}\}>\n\s+<BSCoachBusinessCard role=\{bizRole\}[^\n]*onOpen=\{\(\) => setShowBusiness\('money'\)\} \/>/, 'never on a profile someone else views');
  assert.match(coach, /const bizRole = person && person\.kind === 'NUTRI' \? 'nutritionist' : 'trainer';/);
  assert.match(coach, /if \(showBusiness\) return <BSCoachBusinessPage role=\{bizRole\} tab=\{showBusiness\} onBack=\{\(\) => setShowBusiness\(null\)\} \/>;\n\s+return \(/);
  // The coach's Me tab IS this profile in meMode (iosAppBroadsheetPros.jsx screens.me).
  const pros = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
  assert.match(pros, /me: +<BSPublicProfile person=\{\{ who: 'Jordan Chen', kind: 'TRAINER'[^\n]*isSelf meMode/);
  // Settings: Payouts opens Business on Money (it went straight to Stripe onboarding).
  assert.match(src, /\{ l: tr\('settings:practice\.payouts', \{ defaultValue: 'Payouts' \}\), r: tr\('settings:practice\.payoutsMeta', \{ defaultValue: 'Stripe' \}\), action: \(\) => setShowBusiness\('money'\) \},/);
  assert.match(src, /if \(showBusiness\) \{\n\s+return <BSCoachBusinessPage role=\{tweaks\.role === 'nutritionist' \? 'nutritionist' : 'trainer'\} tab=\{showBusiness\}/);
});

// ── The website's second sweep (2026-10-18: 47fe066, 2d59cfa, c4460ff), mirrored ────────────────
test('Renewing this week: none checked with Stripe is no total, not "0 clients · $0"; all cancelled is a checked zero', async () => {
  const rows = payload().renewals;
  world({ answer: payload({ renewals: rows.map((r) => ({ ...r, ending: null })) }) });
  let m = await mount(page());
  assert.match(m.text(), /Renewing this weekCasey M\./, 'the header carries no total beside the rows');
  assert.doesNotMatch(m.text(), /0 clients · \$0 net/);
  assert.equal((m.text().match(/not checked with Stripe/g) || []).length, rows.length, 'each row says it was not checked');
  await m.unmount();
  world({ answer: payload({ renewals: rows.map((r) => ({ ...r, ending: true })) }) });
  m = await mount(page());
  assert.match(m.text(), /Renewing this week0 clients · \$0 net/, 'every one cancelled was checked, and says so');
  await m.unmount();
});

test('the unchecked footnote never says "just now": a row past the check cap is unchecked on every load, in all 13 languages', async () => {
  // The routes ask Stripe about the first RENEWAL_CHECK_CAP rows; the rest are unchecked every time.
  assert.equal(RENEWAL_CHECK_CAP, 25);
  world();
  const m = await mount(page());
  assert.match(m.text(), /Net to you, after Shape's fee\. Some couldn't be checked with Stripe, so they aren't counted above\./);
  await m.unmount();
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSCoachBusiness.jsx'), 'utf8');
  assert.match(src, /tr\('coach:business\.renew\.unchecked', \{ defaultValue: "Some couldn't be checked with Stripe, so they aren't counted above\." \}\)/);
  // The words each language used for "just now".
  const NOW = { en: /just now/, de: /gerade/, es: /ahora mismo/, fr: /pour le moment/, it: /in questo momento/, 'pt-BR': /agora/, ru: /сейчас/, uk: /зараз/, tr: /şu an/, vi: /hiện/i, id: /saat ini/, ha: /a yanzu/, pcm: /right now/ };
  for (const [loc, re] of Object.entries(NOW)) {
    const v = JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/${loc}/coach.json`), 'utf8'))['business.renew.unchecked'];
    assert.ok(v, loc + ' has the footnote');
    assert.doesNotMatch(v, re, `${loc}: "${v}"`);
  }
});

test('a renewal whose name could not be read is —, from the routes\' own rows, and still reads as a renewal', async () => {
  const now = Date.now();
  const picked = [
    { client_id: 'c1', stripe_subscription_id: 'sub_1', current_period_end: new Date(now + DAY).toISOString(), price_cents: 18000, fee_bps: 1500 },
    { client_id: 'c2', stripe_subscription_id: 'sub_2', current_period_end: new Date(now + 2 * DAY).toISOString(), price_cents: 18000, fee_bps: 0 },
  ];
  // The profiles read failed, so there are no names; Stripe answered for both.
  const rows = renewalRows(picked, { names: null, flags: new Map([['sub_1', false], ['sub_2', true]]), cutCents: (p, bps) => Math.round(p * (1 - (bps == null ? 1500 : bps) / 10000)) });
  assert.deepEqual(rows.map((r) => r.name), ['—', '—']);
  world({ answer: payload({ renewals: rows }) });
  const m = await mount(page());
  const labels = (s) => [...m.host.querySelectorAll('div')].filter((d) => d.textContent === s).length;
  assert.deepEqual([labels('—'), labels('Client')], [2, 0], 'not a row of "Client"s');
  assert.match(m.text(), /Renewing this week1 client · \$153 net—[^$]* · \$180 a month\$153—Cancelled · ends /);
  await m.unmount();
});

test('a failed analytics read says so and never loads forever: the page, each zone of a partial read, and the Me card', async () => {
  world({ answer: new Error('500') });
  let m = await mount(page({ tab: 'plan' }));
  assert.match(m.text(), /Couldn't read your business figures just now\. Nothing is lost\.Try again/);
  assert.doesNotMatch(m.text(), /Reading your numbers/);
  await m.unmount();
  window.localStorage.removeItem('bs_pro_rev_hidden');
  const card = () => inChrome(React.createElement(BIZ.BSCoachBusinessCard, { role: 'trainer', accent: '#c0533b', onOpen: () => {} }));
  m = await mount(card());
  assert.match(m.text(), /—net a monthCouldn't read your numbers\. Tap to open Business\./);
  await m.unmount();
  // Every part of the payload unread (the route sends null for each read that failed), and the
  // waiting list too: each zone on each tab says it couldn't read, none says it is loading.
  world({ answer: payload({ stripe: null, renewals: null, trajectory: null, byOrigin: null, byoMix: null, churn: null, metrics: { activeClients: 0, mrrNetCents: null, mrrGrossCents: null } }), waiting: null });
  m = await mount(page());
  assert.match(m.text(), /Your moneyCouldn't read your payouts just now\./);
  assert.match(m.text(), /Renewing this weekCouldn't read your subscriptions just now\./);
  assert.match(m.text(), /last 13 weeksCouldn't read your subscriptions just now\./);
  assert.doesNotMatch(m.text(), /Reading your numbers/);
  await click(button(m.host, /^Plan$/));
  assert.equal((m.text().match(/Couldn't read your subscriptions just now/g) || []).length, 2);
  assert.doesNotMatch(m.text(), /Reading your numbers/);
  await click(button(m.host, /^Clients$/));
  assert.match(m.text(), /Joined and leftCouldn't read your subscriptions[^]*What a client is worthCouldn't read your subscriptions[^]*Your waiting listCouldn't read your waiting list just now\.Left in the last 90 daysCouldn't read your cancellations just now\./);
  assert.doesNotMatch(m.text(), /Reading your numbers/);
  await m.unmount();
});

// The data layer's analytics read, lifted from the shipped shapeBackend.js and run against a
// recorded fetch (as coach-capacity.test.mjs lifts the capacity calls).
function liftAnalytics() {
  const src = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const i = src.indexOf('async function getCoachAnalytics(');
  const j = src.indexOf('\n}\n', i) + 3;
  const k = src.indexOf('async function liveAccessToken() {');
  const l = src.indexOf('window.ShapeApi = ', k);
  assert.ok(i > 0 && j > i && k > 0 && l > k, 'could not lift the analytics read');
  assert.match(src, /window\.ShapeCoachBusiness = \{\n\s+analytics: getCoachAnalytics,/);
  const calls = [];
  let answer = { status: 200, body: {} };
  const fetch = async (url, init = {}) => {
    calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
    if (answer instanceof Error) throw answer;
    return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
  };
  const state = { session: { access_token: 'tok' }, user: null };
  const normalizeRole = (r) => (['client', 'trainer', 'nutritionist', 'dietitian'].includes(r) ? r : 'client');
  const providerDiscipline = (r) => (r === 'dietitian' ? 'nutritionist' : r);
  const read = new Function('fetch', 'apiBaseUrl', 'state', 'normalizeRole', 'providerDiscipline', 'supabase', 'Headers',
    src.slice(k, l) + '\n' + src.slice(i, j) + '\nreturn getCoachAnalytics;')(fetch, 'https://shape.test', state, normalizeRole, providerDiscipline, null, Headers);
  return { read, calls, state, answer: (a) => { answer = a; } };
}

test('the data layer: a refused token or a lost session is a failed read (Try again), not "no listing yet"', async () => {
  const a = liftAnalytics();
  a.answer({ status: 200, body: { isTrainer: true, providerId: 7 } });
  assert.deepEqual(await a.read({ role: 'trainer', renewals: true }), { isTrainer: true, providerId: 7 });
  assert.deepEqual(a.calls[0], { url: 'https://shape.test/api/trainer/analytics?renewals=1', auth: 'Bearer tok' });
  // Signed in with no listing of this role: the route answers isTrainer: false, which IS "none".
  a.answer({ status: 200, body: { isTrainer: false } });
  assert.equal(await a.read({ role: 'trainer' }), null);
  // The route answers 401 only when it has no user: for a signed-in coach that is a read that
  // failed, and the page says so with Try again, not "fills in once your application is approved".
  a.answer({ status: 401, body: { error: 'Authentication required.' } });
  await assert.rejects(a.read({ role: 'trainer' }));
  a.answer({ status: 500, body: { error: 'Could not read your listing.' } });
  await assert.rejects(a.read({ role: 'trainer' }), /Could not read your listing/);
  a.answer(new Error('offline'));
  await assert.rejects(a.read({ role: 'trainer' }));
  // No token to read with (the session was lost under a cached sign-in): nothing is asked, and it fails.
  a.state.session = null;
  a.calls.length = 0;
  await assert.rejects(a.read({ role: 'trainer' }));
  assert.equal(a.calls.length, 0);
});

test('an unread history says so: the Plan\'s notes and the Clients tab, never "no history yet"', async () => {
  // The trajectory read failed; the active subscriptions were read, so today's figures stand.
  const unread = payload({ trajectory: null, metrics: { activeClients: 11, mrrNetCents: 168300, mrrGrossCents: 198000 } });
  assert.equal(CF.planNumbers({ extra: unread, listingMonthly: 180 }).pace.unread, true);
  world({ answer: unread });
  let m = await mount(page({ tab: 'plan' }));
  assert.match(m.text(), /You have 11 clients and net \$1,683 a month\./, 'the plan still starts from today');
  assert.equal((m.text().match(/couldn't read your history just now · set your own/g) || []).length, 2, 'new clients and churn both say so');
  assert.doesNotMatch(m.text(), /no history yet/);
  await click(button(m.host, /^Clients$/));
  assert.match(m.text(), /Joined and leftCouldn't read your subscription history just now, and who joined and left is counted from it\. Nothing is lost; try again in a moment\./);
  assert.match(m.text(), /What a client is worthCouldn't read your subscription history just now, and the average stay is measured from it\. Nothing is lost; try again in a moment\./);
  assert.doesNotMatch(m.text(), /This fills in after a month/);
  await m.unmount();
  // A history that was read but is under a month old is still "no history yet".
  world({ answer: payload({}, { firstDays: 10 }) });
  m = await mount(page({ tab: 'plan' }));
  assert.equal((m.text().match(/no history yet · set your own/g) || []).length, 2);
  assert.doesNotMatch(m.text(), /couldn't read your history/);
  await click(button(m.host, /^Clients$/));
  assert.match(m.text(), /This fills in after a month with clients: who joined/);
  assert.doesNotMatch(m.text(), /subscription history/);
  await m.unmount();
});

test('an unread brought share and listing price say so in What clients earn you, and start from stated fallbacks', async () => {
  // The routes send byOrigin and byoMix null together when the subscriptions could not be read.
  const p = payload({ byOrigin: null, byoMix: null });
  world({ answer: p, listing: new Error('500') });
  let m = await mount(page({ tab: 'plan' }));
  assert.match(m.text(), /couldn't read your listing price · your clients' average/);
  assert.match(m.text(), /couldn't read who you brought · set your own/);
  assert.doesNotMatch(m.text(), /no listing price yet|0% Shape fee on these|0% fee · /);
  const base = CF.planNumbers({ extra: p, listingMonthly: null, listingFailed: true });
  assert.deepEqual([base.rateFrom, base.listingUnread, base.broughtUnread], ['average', true, true]);
  const inputs = [...m.host.querySelectorAll('input[type="number"]')].map((i) => i.value);
  assert.deepEqual(inputs.slice(1), [String(base.rateCents / 100), '0'], 'the clients\' average, and 0% brought');
  await m.unmount();
  // A listing read that answered with no listing of this role is a read: the average, said plainly.
  world({ listing: { role: 'nutritionist', monthly: 200 } });
  m = await mount(page({ tab: 'plan' }));
  assert.match(m.text(), /your clients' average/);
  assert.doesNotMatch(m.text(), /couldn't read/);
  await m.unmount();
  // No listing service to ask is an unread price too.
  world();
  window.ShapeCoachListing = undefined;
  m = await mount(page({ tab: 'plan' }));
  assert.match(m.text(), /couldn't read your listing price · your clients' average/);
  await m.unmount();
  // With no clients to average, the unread price starts at the default, and says set your own.
  const Earn = ({ base: b }) => React.createElement(BIZ.BSBizEarn, { t: window.useBS(), base: b });
  m = await mount(inChrome(React.createElement(Earn, { base: { state: 'ready', clients: 0, mrrNetCents: 0, rateCents: CF.DEFAULT_RATE_CENTS, rateFrom: 'default', listingUnread: true, byoShare: 0, brought: 0, byoClients: 0, broughtUnread: false, pace: {} } })));
  assert.match(m.text(), /couldn't read your listing price · set your own/);
  assert.match(m.text(), /0% Shape fee on these/, 'a read with no subscriptions is the plain note');
  await m.unmount();
});

test('the preview is for a signed-out viewer only: a signed-in coach never sees sample figures while reads are pending, or after they fail', async () => {
  const demo = BIZ.bsBizDemo().extra;
  const esc = (s) => s.replace(/[.$]/g, '\\$&');
  const sample = new RegExp([...demo.renewals.map((r) => r.name), money(demo.stripe.balanceCents), money(demo.metrics.mrrNetCents)].map(esc).join('|'));
  const card = () => inChrome(React.createElement(BIZ.BSCoachBusinessCard, { role: 'trainer', accent: '#c0533b', onOpen: () => {} }));
  window.localStorage.removeItem('bs_pro_rev_hidden');
  // Pending: no read answers.
  world({ answer: new Promise(() => {}) });
  window.ShapeCoachListing.getMine = () => new Promise(() => {});
  window.ShapeBookings.getCapacity = () => new Promise(() => {});
  for (const el of [page(), card()]) {
    const m = await mount(el);
    assert.match(m.text(), /Reading your numbers…/);
    assert.doesNotMatch(m.text(), /preview|Sample numbers/i);
    assert.doesNotMatch(m.text(), sample);
    await m.unmount();
  }
  // Failed.
  world({ answer: new Error('500') });
  for (const el of [page(), card()]) {
    const m = await mount(el);
    assert.match(m.text(), /Couldn't read your/);
    assert.doesNotMatch(m.text(), /preview|Sample numbers/i);
    assert.doesNotMatch(m.text(), sample);
    await m.unmount();
  }
});
