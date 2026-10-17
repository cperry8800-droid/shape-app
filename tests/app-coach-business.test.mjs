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
function trajectory(now = Date.now()) {
  const monday = new Date(now); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weeks = [];
  let active = 9;
  for (let i = 25; i >= 0; i--) {
    const k = 25 - i;
    const added = k === 16 || k === 19 || k === 22 || k === 24 || k === 25 ? 1 : 0;
    const ended = k === 18 || k === 23 ? 1 : 0;
    active += added - ended;
    weeks.push({ weekOf: new Date(monday.getTime() - i * 7 * DAY).toISOString().slice(0, 10), active, added, ended, mrrGrossCents: active * 18000, mrrNetCents: active * 15300 });
  }
  return { weeks, firstSubAt: new Date(now - 300 * DAY).toISOString() };
}
function payload(over = {}) {
  const traj = trajectory();
  const last = traj.weeks[traj.weeks.length - 1];
  return {
    isTrainer: true, providerId: 7,
    trajectory: traj,
    metrics: { activeClients: last.active - 1, mrrNetCents: 1, mrrGrossCents: 1 },
    byOrigin: [{ kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 }],
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
  window.ShapeCoachListing = { getMine: () => Promise.resolve(listing ? [listing] : []) };
  window.ShapeBookings = { getCapacity: () => Promise.resolve(waiting == null ? null : { waiting }) };
  window.ShapeConnect = { startOnboarding: (a) => { st.onboard.push(a); return Promise.resolve(); } };
  return st;
}
const page = (props = {}) => inChrome(React.createElement(BIZ.BSCoachBusinessPage, { role: 'trainer', onBack: () => {}, ...props }));

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
  assert.match(m.text(), /Some couldn't be checked with Stripe just now/);
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
  const start = CF.planStart(base);
  const f = CF.forecast({ clients: base.clients, mrrNetCents: base.mrrNetCents, byoShare: base.byoShare, months: 36, priceCents: start.rate * 100, adds: start.adds, churn: start.churnPct / 100 });
  assert.match(m.text(), new RegExp(`You have ${base.clients} clients and net \\${money(base.mrrNetCents)} a month\\. At today's pace that becomes \\${money(f.rows[12].netCents)} a month in a year\\.`));
  const reach = CF.monthsTo(start.goal * 100, f);
  assert.match(m.text(), reach == null ? /doesn't reach your/ : new RegExp(`reach your \\$${start.goal.toLocaleString('en-US')} goal in ${reach} months?`));
  assert.match(m.text(), new RegExp(`yours: ${start.adds.toFixed(1)} (since your first client|over the last 3 months)`));
  assert.equal(m.host.querySelectorAll('polyline').length, 1, 'untouched, one line: today\'s pace');
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
