// The Business page's Plan and Money tabs (design E, owner 2026-10-17: "go with this design,
// build it"). These mount the SHIPPED components from public/newdesign/dashBusiness.jsx in jsdom,
// with the real forecast module, and read what a coach would read. Every expected figure is
// computed here through coachForecast.js from the same inputs, not restated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
// jsdom first, so React DOM sees a real input event model when it loads.
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
const React = require_('react');
globalThis.React = React;
const { createRoot } = require_('react-dom/client');
const CF = require_('../public/newdesign/coachForecast.js');
window.CoachForecast = CF;
globalThis.DashSignals = require_('../public/newdesign/dashSignals.js');
globalThis.serif = 'serif';
// The page's money format is dashToday.jsx's own function, read from the file.
const today = readFileSync(ND('dashToday.jsx'), 'utf8');
globalThis.dashMoney = new Function(/function dashMoney\(cents\) \{[\s\S]*?\n\}/.exec(today)[0] + '\nreturn dashMoney;')();
const money = globalThis.dashMoney;

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const B = await loadRealModule(ND('dashBusiness.jsx'), {
  appendExports: 'export { DbzChurnZone, DbzGoalEarn, dbzGoalEarnBase, dbzPlanBase, DbzPlanZone, DbzEarnZone, DbzPayoutsZone, DbzRenewalsZone, dbzRenewalsHead, DbzWaitlistZone, DbzLifetimeZone, DBZ_DEMO_CHURN };',
});

async function mount(el) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await React.act(async () => root.render(el));
  return { div, text: () => div.textContent.replace(/\s+/g, ' ').trim(), unmount: () => React.act(async () => root.unmount()) };
}
async function setValue(input, v) {
  const proto = Object.getPrototypeOf(input);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, String(v));
  await React.act(async () => { input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
async function click(el) { await React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); }
const rowLabels = (div) => [...div.querySelectorAll('table.dbz-cmp tbody tr td:first-child')].map((td) => td.textContent.trim());
const sentence = (div) => div.querySelector('p').textContent.replace(/\s+/g, ' ').trim();
const months = (m) => (m === 1 ? '1 month' : m + ' months');

const PACE = { adds: 2.3, churn: 0.08, days: 91, fromFirst: false, added: 7, ended: 3, avgActive: 12 };
const BASE = { state: 'ready', clients: 12, mrrNetCents: 189000, mrrGrossCents: 216000, rateCents: 18000, rateFrom: 'your listing price', byoShare: 2 / 12, byoNote: '0% fee · 2 of your 12', pace: PACE };
const run = (o) => CF.forecast({ clients: 12, mrrNetCents: 189000, byoShare: 2 / 12, months: 36, priceCents: o.rate * 100, adds: o.adds, churn: o.churn });

// ── Where the plan starts ────────────────────────────────────────────────────
test('dbzPlanBase waits for the analytics AND the listing, and says when the practice could not be read', () => {
  const extra = { metrics: { activeClients: 12, mrrNetCents: 189000, mrrGrossCents: 216000 }, byOrigin: [], trajectory: null };
  assert.equal(B.dbzPlanBase({ live: true, extra: null, listing: null, listingRead: true }).state, 'loading');
  assert.equal(B.dbzPlanBase({ live: true, extra, listing: null, listingRead: false }).state, 'loading');
  assert.equal(B.dbzPlanBase({ live: true, extra: { ...extra, metrics: { activeClients: null, mrrNetCents: null } }, listing: null, listingRead: true }).state, 'unread');
  const ok = B.dbzPlanBase({ live: true, extra, listing: null, listingRead: true });
  assert.equal(ok.state, 'ready');
  assert.deepEqual([ok.pace.adds, ok.pace.churn], [null, null], 'an unread trajectory is no pace, not a pace of zero');
});

test('today\'s clients and net come from the Overview\'s series, so a client whose payment is retrying counts on every tab', () => {
  // The route's metrics count active and trialing rows (12); the trajectory also counts past_due (13).
  const weeks = [{ weekOf: '2026-10-05', active: 12, mrrNetCents: 180000, mrrGrossCents: 210000 }, { weekOf: '2026-10-12', active: 13, mrrNetCents: 195300, mrrGrossCents: 228000 }];
  const extra = { metrics: { activeClients: 12, mrrNetCents: 179550, mrrGrossCents: 210000 }, byOrigin: [], trajectory: { weeks, firstSubAt: null } };
  const b = B.dbzPlanBase({ live: true, extra, listing: null, listingRead: true });
  assert.deepEqual([b.clients, b.mrrNetCents, b.mrrGrossCents], [13, 195300, 228000]);
  // With the trajectory unread, the metrics stand in.
  const m = B.dbzPlanBase({ live: true, extra: { ...extra, trajectory: null }, listing: null, listingRead: true });
  assert.deepEqual([m.clients, m.mrrNetCents], [12, 179550]);
});

test('dbzPlanBase: the rate is the listing price, else the clients\' average, else a stated default', () => {
  const extra = (m) => ({ metrics: m, byOrigin: [], trajectory: null });
  const listed = B.dbzPlanBase({ live: true, extra: extra({ activeClients: 12, mrrNetCents: 189000, mrrGrossCents: 216000 }), listing: { monthly: 195 }, listingRead: true });
  assert.deepEqual([listed.rateCents, listed.rateFrom], [19500, 'your listing price']);
  const avg = B.dbzPlanBase({ live: true, extra: extra({ activeClients: 3, mrrNetCents: 40000, mrrGrossCents: 47300 }), listing: { monthly: null }, listingRead: true });
  assert.deepEqual([avg.rateCents, avg.rateFrom], [16000, "your clients' average"], '$157.67 rounds to the nearest $5, $160');
  const none = B.dbzPlanBase({ live: true, extra: extra({ activeClients: 0, mrrNetCents: 0, mrrGrossCents: 0 }), listing: null, listingRead: true });
  assert.equal(none.rateCents, 15000);
  assert.match(none.rateFrom, /set your own/);
});

test('dbzPlanBase: the brought-by-you share counts subscriptions only, from their stored fee', () => {
  const byOrigin = [
    { kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 },
    { kind: 'purchase', feeBps: 0 }, { kind: 'purchase', feeBps: 0 },
  ];
  const b = B.dbzPlanBase({ live: true, extra: { metrics: { activeClients: 4, mrrNetCents: 1, mrrGrossCents: 1 }, byOrigin, trajectory: null }, listing: null, listingRead: true });
  assert.equal(b.byoShare, 0.25);
  assert.equal(b.byoNote, '0% fee · 1 of your 4');
});

test("the preview's pace includes the preview's own departures, so Retention never says no one left beside its churn list", async () => {
  const demo = B.dbzPlanBase({ live: false });
  const inWindow = B.DBZ_DEMO_CHURN.filter((r) => Date.parse(r.endedAt) >= Date.now() - 91 * 86400000).length;
  assert.ok(inWindow > 0, 'the demo churn list has someone inside the window');
  assert.ok(demo.pace.ended >= inWindow);
  assert.ok(demo.pace.churn > 0);
  const m = await mount(React.createElement(B.DbzLifetimeZone, { base: demo }));
  assert.doesNotMatch(m.text(), /No one has left/);
  assert.match(m.text(), /A client stays about \d+ months? on average/);
  await m.unmount();
});

// ── What clients earn you ────────────────────────────────────────────────────
test('the calculator starts at a round number above today, and reads the net through the forecast module', async () => {
  const m = await mount(React.createElement(B.DbzEarnZone, { base: BASE }));
  const [clients, rate, byo] = m.div.querySelectorAll('input[type=number]');
  assert.deepEqual([clients.value, rate.value, byo.value], ['20', '180', '17']);
  assert.match(m.text(), /you have 12 today/);
  assert.match(m.text(), /your listing price/);
  const e = CF.earn({ clients: 20, priceCents: 18000, byoShare: 0.17 });
  assert.ok(m.text().includes(money(e.netCents) + 'net a month'), m.text());
  assert.ok(m.text().includes(money(e.grossCents) + ' billed · ' + money(e.feeCents) + ' Shape fee'));
  await setValue(clients, 30);
  await setValue(byo, 100);
  assert.ok(m.text().includes(money(30 * 18000) + 'net a month'), 'every client brought by the coach: no fee');
  assert.ok(m.text().includes('$0 Shape fee'));
  await m.unmount();
});

// ── Plan the next 12 months ──────────────────────────────────────────────────
test('untouched, the plan IS today\'s pace: one line, one sentence, the goal month', async () => {
  const m = await mount(React.createElement(B.DbzPlanZone, { base: BASE }));
  const T = run({ adds: 2.3, churn: 0.08, rate: 180 });
  const reach = CF.monthsTo(300000, T);
  assert.ok(reach > 0, 'the fixture reaches its goal');
  assert.equal(sentence(m.div), `Today you have 12 clients and net $1,890 a month. At today's pace that becomes ${money(T.rows[12].netCents)} a month in a year, and you reach your $3,000 goal in ${months(reach)}.`);
  assert.deepEqual(rowLabels(m.div), ["Today's pace", 'What if: +1 client a month']);
  assert.equal(m.div.querySelectorAll('svg polyline').length, 2);
  assert.match(m.text(), /yours: 2\.3 over the last 3 months/);
  assert.match(m.text(), /yours: 8% leave a month, over the last 3 months/);
  assert.doesNotMatch(m.text(), /Back to my numbers/);
  await m.unmount();
  // A younger practice's pace is read after its first week (the opening roster), and says so.
  const young = await mount(React.createElement(B.DbzPlanZone, { base: { ...BASE, pace: { ...PACE, fromFirst: true } } }));
  assert.match(young.text(), /yours: 2\.3 after your first week/);
  await young.unmount();
});

test('moving a slider makes it your plan, with today\'s pace kept as the line to beat', async () => {
  const m = await mount(React.createElement(B.DbzPlanZone, { base: BASE }));
  const [adds] = m.div.querySelectorAll('input[type=range]');
  await setValue(adds, 3);
  const T = run({ adds: 2.3, churn: 0.08, rate: 180 });
  const P = run({ adds: 3, churn: 0.08, rate: 180 });
  const [pr, tr] = [CF.monthsTo(300000, P), CF.monthsTo(300000, T)];
  assert.equal(sentence(m.div), `Today you have 12 clients and net $1,890 a month. At today's pace that becomes ${money(T.rows[12].netCents)} in a year. With your plan it's ${money(P.rows[12].netCents)} a month, and you reach your $3,000 goal in ${months(pr)} instead of ${months(tr)}.`);
  assert.deepEqual(rowLabels(m.div), ["Today's pace", 'Your plan', 'What if: +1 client a month']);
  assert.match(m.text(), /3\.0 · was 2\.3/);
  // The what-if is the plan plus one a month, and its row says so in figures.
  const W = run({ adds: 4, churn: 0.08, rate: 180 });
  const cells = [...m.div.querySelectorAll('table.dbz-cmp tbody tr')][2].textContent;
  assert.ok(cells.includes(money(W.rows[12].netCents)) && cells.includes(money(CF.earnedOver(W, 12))), cells);
  // Back to my numbers puts every slider back.
  await click([...m.div.querySelectorAll('button')].find((b) => /Back to my numbers/.test(b.textContent)));
  assert.deepEqual(rowLabels(m.div), ["Today's pace", 'What if: +1 client a month']);
  await m.unmount();
});

test('the what-if chips compare one change at a time, and can be turned off', async () => {
  const m = await mount(React.createElement(B.DbzPlanZone, { base: BASE }));
  const chip = (re) => [...m.div.querySelectorAll('button[aria-pressed]')].find((b) => re.test(b.textContent));
  await click(chip(/Churn 5%/));
  assert.deepEqual(rowLabels(m.div), ["Today's pace", 'What if: churn 5%']);
  await click(chip(/\$205 for new clients/));
  assert.deepEqual(rowLabels(m.div), ["Today's pace", 'What if: $205 for new clients']);
  await click(chip(/\$205 for new clients/));
  assert.deepEqual(rowLabels(m.div), ["Today's pace"]);
  assert.equal(m.div.querySelectorAll('svg polyline').length, 1);
  await m.unmount();
});

test('a goal already met, and one the pace never reaches, are each said plainly', async () => {
  const m = await mount(React.createElement(B.DbzPlanZone, { base: BASE }));
  const goal = m.div.querySelectorAll('input[type=range]')[3];
  await setValue(goal, 1000);
  assert.match(sentence(m.div), /You're already past your \$1,000 goal\.$/);
  assert.match(m.div.querySelector('tbody tr td:last-child').textContent, /^now$/);
  await setValue(goal, 20000);
  const T = run({ adds: 2.3, churn: 0.08, rate: 180 });
  assert.equal(CF.monthsTo(2000000, T), null);
  assert.ok(sentence(m.div).endsWith(`That doesn't reach your $20,000 goal within three years: it levels off near ${money(T.steadyNetCents)} a month.`), sentence(m.div));
  assert.match(m.div.querySelector('tbody tr td:last-child').textContent, /^—$/);
  await m.unmount();
});

test('with no history yet, the plan starts from stated defaults and never calls them "yours"', async () => {
  const m = await mount(React.createElement(B.DbzPlanZone, { base: { ...BASE, pace: { adds: null, churn: null, days: 12, fromFirst: true } } }));
  assert.match(sentence(m.div), /^You have 12 clients and net \$1,890 a month\. With your plan that becomes /);
  assert.equal((m.text().match(/no history yet · set your own/g) || []).length, 2);
  assert.doesNotMatch(m.text(), /yours:/);
  assert.deepEqual(rowLabels(m.div), ['Your plan', 'What if: +1 client a month']);
  await m.unmount();
});

test('a pace outside the sliders\' usual range is kept, and the range stretches to it', async () => {
  const m = await mount(React.createElement(B.DbzPlanZone, { base: { ...BASE, rateCents: 1500, pace: { ...PACE, adds: 24, churn: 0.45 } } }));
  const [adds, churn, rate] = m.div.querySelectorAll('input[type=range]');
  assert.deepEqual([adds.value, churn.value, churn.max, rate.value, rate.min], ['24', '45', '45', '15', '15']);
  assert.match(m.text(), /yours: 24\.0 over the last 3 months/);
  assert.match(m.text(), /yours: 45% leave a month/);
  await m.unmount();
});

// ── Your money ───────────────────────────────────────────────────────────────
const STRIPE = { connected: true, status: 'active', balanceCents: 41200, pendingCents: 118000, schedule: { interval: 'weekly', weeklyAnchor: 'friday', delayDays: 7 }, payouts: [
  { id: 'a', amountCents: 52000, status: 'in_transit', arrivalDate: Date.UTC(2026, 9, 19, 12) },
  { id: 'b', amountCents: 49000, status: 'paid', arrivalDate: Date.UTC(2026, 9, 12, 12) },
] };

test('your money: what is on its way, ready and clearing adds up to "coming to you"; a paid payout does not', async () => {
  const m = await mount(React.createElement(B.DbzPayoutsZone, { live: true, stripe: STRIPE, providerId: 7, role: 'trainer', metrics: { mrrNetCents: 283500, mrrGrossCents: 324000 } }));
  const t = m.text();
  assert.ok(t.startsWith(`${money(52000 + 41200 + 118000)} is coming to you. The next payout, $520, lands`), t);
  for (const k of ['On its way to your bank', 'Ready to pay out', 'Still clearing', "Net a month, at today's clients"]) assert.ok(t.includes(k), k);
  assert.ok(t.includes('$3,240 billed · $405 Shape fee'));
  assert.ok(t.includes('Paid out weekly · Fridays · 7-day rolling delay.'));
  await m.unmount();
});

test('your money: not linked offers set-up; a failed Stripe read says so; still loading says that', async () => {
  const off = await mount(React.createElement(B.DbzPayoutsZone, { live: true, stripe: { connected: false, payouts: [] }, providerId: 7, role: 'trainer' }));
  assert.match(off.text(), /Payouts aren't set up yet/);
  assert.ok(off.div.querySelector('button'));
  await off.unmount();
  const err = await mount(React.createElement(B.DbzPayoutsZone, { live: true, stripe: { connected: true, error: true, status: 'active', balanceCents: null, pendingCents: null, payouts: [] }, providerId: 7, role: 'trainer' }));
  assert.match(err.text(), /^Couldn't reach Stripe just now/);
  assert.doesNotMatch(err.text(), /coming to you/);
  await err.unmount();
  const wait = await mount(React.createElement(B.DbzPayoutsZone, { live: true, stripe: undefined, providerId: 7, role: 'trainer' }));
  assert.match(wait.text(), /load/);
  await wait.unmount();
});

// ── Renewing this week ───────────────────────────────────────────────────────
const RENEWALS = [
  { name: 'Ana Reyes', dueAt: '2026-10-18T12:00:00Z', priceCents: 18000, netCents: 15300, ending: false },
  { name: 'Ben Kowalski', dueAt: '2026-10-21T12:00:00Z', priceCents: 18000, netCents: 18000, ending: false },
  { name: 'Dee Morgan', dueAt: '2026-10-22T12:00:00Z', priceCents: 16500, netCents: 14025, ending: true },
  { name: 'Eli Park', dueAt: '2026-10-23T12:00:00Z', priceCents: 16000, netCents: 13600, ending: null },
];

test('renewals: the total counts confirmed renewals only; a cancellation and an unchecked row say so', async () => {
  assert.equal(B.dbzRenewalsHead(true, RENEWALS), '2 clients · $333 net');
  const m = await mount(React.createElement(B.DbzRenewalsZone, { live: true, renewals: RENEWALS }));
  const t = m.text();
  assert.match(t, /Dee Morgan\s*Cancelled · ends /);
  // The footnote can't say which client wasn't checked, so Eli's own row does: no monthly price
  // like a renewal's, and the amount dimmed like money not counted, but not struck through.
  assert.match(t, /Eli Park[^$]* · not checked with Stripe\$136/);
  const amount = (name) => [...m.div.firstChild.children].find((row) => row.firstChild.firstChild?.textContent === name).lastChild.style;
  assert.deepEqual([amount('Eli Park').color === amount('Ana Reyes').color, amount('Eli Park').textDecoration], [false, 'none']);
  assert.equal(amount('Eli Park').color, amount('Dee Morgan').color);
  // The subline is amber, apart from both the cancelled red and a renewal's grey.
  const sub = (name) => [...m.div.firstChild.children].find((row) => row.firstChild.firstChild?.textContent === name).firstChild.lastChild.style.color;
  assert.deepEqual([sub('Eli Park'), sub('Dee Morgan') === sub('Ana Reyes')], ['var(--sh-gold, #d8a23a)', false]);
  assert.match(t, /Some couldn't be checked with Stripe, so they aren't counted above\./);
  assert.doesNotMatch(t, /just now/, 'a row past the 25-check cap is unchecked on every load: not a passing problem');
  await m.unmount();
  const one = await mount(React.createElement(B.DbzRenewalsZone, { live: true, renewals: RENEWALS.slice(0, 1) }));
  assert.doesNotMatch(one.text(), /couldn't be checked/);
  await one.unmount();
  assert.equal(B.dbzRenewalsHead(true, RENEWALS.slice(0, 1)), '1 client · $153 net');
  // None could be checked: no "0 clients · $0" beside a list of renewals.
  assert.equal(B.dbzRenewalsHead(true, RENEWALS.map((r) => ({ ...r, ending: null }))), null);
  assert.equal(B.dbzRenewalsHead(true, RENEWALS.filter((r) => r.ending === true)), '0 clients · $0 net', 'all cancelled is a checked zero');
});

test('renewals: none due, not read, and still loading are three different sentences', async () => {
  const none = await mount(React.createElement(B.DbzRenewalsZone, { live: true, renewals: [] }));
  assert.equal(none.text(), 'No one renews in the next 7 days.');
  await none.unmount();
  const unread = await mount(React.createElement(B.DbzRenewalsZone, { live: true, renewals: null }));
  assert.match(unread.text(), /^Couldn't read your subscriptions just now/);
  await unread.unmount();
  const wait = await mount(React.createElement(B.DbzRenewalsZone, { live: true, renewals: undefined }));
  assert.match(wait.text(), /load/);
  await wait.unmount();
  assert.equal(B.dbzRenewalsHead(true, null), null);
});

// ── Growth: the waiting list; Retention: what a client is worth ──────────────
test('the waiting list in money: each one found the coach on Shape, so 15% comes off', async () => {
  const m = await mount(React.createElement(B.DbzWaitlistZone, { live: true, waiting: 4, rateCents: 18000 }));
  assert.equal(m.text(), `4 people are waiting to join you. If they all join at $180 a month, that's about ${money(CF.earn({ clients: 4, priceCents: 18000, byoShare: 0 }).netCents)} a month to you.`);
  await m.unmount();
  for (const [waiting, re] of [[0, /^No one is waiting\./], [null, /^Couldn't read your waiting list/], [undefined, /load/i]]) {
    const x = await mount(React.createElement(B.DbzWaitlistZone, { live: true, waiting, rateCents: 18000 }));
    assert.match(x.text(), re);
    await x.unmount();
  }
});

test('what a client is worth: the average stay at your churn, and the net over it', async () => {
  const m = await mount(React.createElement(B.DbzLifetimeZone, { base: BASE }));
  const lt = CF.lifetime({ netPerClientCents: 189000 / 12, churn: 0.08 });
  assert.match(m.text(), new RegExp(`A client stays about ${Math.round(lt.months)} months on average, so each one is worth about \\${money(lt.valueCents)} to you\\.`));
  await m.unmount();
  const none = await mount(React.createElement(B.DbzLifetimeZone, { base: { ...BASE, pace: { ...PACE, churn: 0 } } }));
  assert.equal(none.text(), "No one has left over the last 3 months, so there isn't an average stay to measure yet.");
  await none.unmount();
});

test('the churn total counts the last 90 days and says so, not every cancellation listed', async () => {
  const day = 86400000;
  const rows = [
    { name: 'Recent', startedAt: new Date(Date.now() - 200 * day).toISOString(), endedAt: new Date(Date.now() - 10 * day).toISOString(), priceCents: 18000, reason: null },
    { name: 'Long gone', startedAt: new Date(Date.now() - 900 * day).toISOString(), endedAt: new Date(Date.now() - 400 * day).toISOString(), priceCents: 22000, reason: null },
  ];
  const m = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: rows }));
  assert.match(m.text(), /^1 left in the last 90 days−\$180 a month/);
  assert.match(m.text(), /Long gone/, 'the older departure is still listed');
  await m.unmount();
  const old = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: rows.slice(1) }));
  assert.match(old.text(), /^None left in the last 90 days/);
  assert.doesNotMatch(old.text(), /a month/, 'no total for a window with no departures');
  await old.unmount();
  // The routes send the newest 12. When all 12 are inside the window, more may have left: a floor.
  const full = Array.from({ length: 12 }, (_, i) => ({ ...rows[0], name: 'C' + i, endedAt: new Date(Date.now() - (5 + i) * day).toISOString() }));
  const many = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: full }));
  assert.match(many.text(), /^12 or more left in the last 90 daysat least −\$2,160 a month/);
  await many.unmount();
  const eleven = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: [...full.slice(0, 11), rows[1]] }));
  assert.match(eleven.text(), /^11 left in the last 90 days−\$1,980 a month/, 'one row outside the window: the count is whole');
  await eleven.unmount();
  for (const role of ['trainer', 'nutritionist']) {
    const src = readFileSync(fileURLToPath(new URL(`../src/app/api/${role}/analytics/route.ts`, import.meta.url)), 'utf8');
    assert.match(src, /\.eq\('status', 'canceled'\)\n\s+\.order\('current_period_end', \{ ascending: false, nullsFirst: false \}\)\n\s+\.limit\(12\);/, role + ' sends the newest 12, as DBZ_CHURN_LIST says');
  }
});

// ── The Goal tab's calculator (Business review, 2026-10-17) ──────────────────
test('the Goal tab starts "What clients earn you" from the coach\'s live figures, or says why it cannot', () => {
  assert.equal(B.dbzGoalEarnBase({ kind: 'loading' }).state, 'loading');
  assert.equal(B.dbzGoalEarnBase({ kind: 'unknown' }).state, 'unread');
  assert.equal(B.dbzGoalEarnBase({ kind: 'demo' }).state, 'ready', 'the preview starts from the preview practice');
  const weeks = [{ weekOf: '2026-10-12', active: 13, mrrNetCents: 195300, mrrGrossCents: 228000 }];
  const b = B.dbzGoalEarnBase({ kind: 'live', activeClients: 12, mrrNetCents: 179550, mrrGrossCents: 210000, trajectory: { weeks }, byoShare: 0.25, byoNote: '0% fee · 3 of your 12' });
  assert.deepEqual([b.state, b.clients, b.rateCents, b.rateFrom, b.byoShare, b.byoNote], ['ready', 13, 17500, "your clients' average", 0.25, '0% fee · 3 of your 12']);
  const none = B.dbzGoalEarnBase({ kind: 'live', activeClients: 0, mrrNetCents: 0, mrrGrossCents: 0, trajectory: null, byoShare: null });
  assert.deepEqual([none.rateCents, none.byoShare], [15000, 0]);
  assert.match(none.rateFrom, /set your rate/);
});

test('the Goal tab\'s calculator links to the planner on Business, opened on Plan', async () => {
  const m = await mount(React.createElement(B.DbzGoalEarn, { role: 'nutritionist', live: { kind: 'demo' } }));
  const a = m.div.querySelector('a');
  assert.equal(a.textContent, 'Plan the next 12 months on Business →');
  assert.equal(a.getAttribute('href'), 'NutritionistApp.html#business?section=plan');
  assert.ok(m.div.querySelectorAll('input[type=number]').length === 3, 'the same three fields as on Business');
  await m.unmount();
  const src = readFileSync(ND('dashBusiness.jsx'), 'utf8');
  assert.match(src, /const asked = typeof dashRouteParam === "function" \? dashRouteParam\("section"\) : null;\n\s+if \(asked && DBZ_SECTION_KEYS\.includes\(asked\)\) setSection\(asked\);/, 'Business opens the section a link names');
});

// ── The whole page ───────────────────────────────────────────────────────────
test('the sidebar money card says when Stripe couldn\'t be reached, as the Money tab does', async () => {
  let card = null;
  Object.assign(globalThis, {
    useDashboard: () => ({ today: null, source: 'live' }),
    useRememberedChoices: () => null,
    useRememberedChoice: () => React.useState('money'),
    DashPage: ({ children, payoutCard }) => { card = payoutCard; return React.createElement(React.Fragment, null, children); },
    DashSegmented: () => null, DashExportButton: () => null, DashFunnelPanel: () => null, DashDemoBand: () => null,
    trainerNavItems: () => [], trainerPayoutCard: {}, nutriPayoutCard: {},
  });
  const answer = (d) => Promise.resolve({ ok: true, json: () => Promise.resolve(d) });
  for (const [stripe, sub] of [[{ connected: true, error: true, balanceCents: null, pendingCents: null, payouts: [] }, "couldn't reach Stripe just now"], [{ connected: false }, 'connects when payouts go live']]) {
    globalThis.fetch = window.fetch = (url) => url.startsWith('/api/trainer/analytics')
      ? answer({ isTrainer: true, providerId: 7, metrics: {}, byOrigin: [], trajectory: null, renewals: [], churn: [], stripe })
      : answer({ listings: [] });
    const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.deepEqual([card.amount, card.sub], ['—', sub]);
    await m.unmount();
  }
});

test('a failed analytics read says so in every zone it feeds, instead of loading forever', async () => {
  let section = 'money';
  Object.assign(globalThis, {
    useDashboard: () => ({ today: { kind: 'live' }, source: 'live' }),
    useRememberedChoices: () => null,
    useRememberedChoice: () => React.useState(section),
    DashPage: ({ children }) => React.createElement(React.Fragment, null, children),
    DashSegmented: () => null, DashExportButton: () => null, DashFunnelPanel: () => null, DashDemoBand: () => null,
    trainerNavItems: () => [], trainerPayoutCard: {}, nutriPayoutCard: {},
  });
  for (const fail of [() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'x' }) }), () => Promise.reject(new Error('offline'))]) {
    globalThis.fetch = window.fetch = (url) => url.startsWith('/api/trainer/analytics') ? fail() : Promise.resolve({ ok: true, json: () => Promise.resolve({ listings: [] }) });
    for (section of ['money', 'plan']) {
      const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
      await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      assert.doesNotMatch(m.text(), /load with the analytics rollup|load with your|Loads with/, section + ': ' + m.text().slice(0, 300));
      assert.match(m.text(), section === 'money' ? /Couldn't read your payouts just now.*Couldn't read your subscriptions just now.*Couldn't read your subscriptions just now/ : /Couldn't read your subscriptions just now, and the plan starts from them/);
      await m.unmount();
    }
  }
});

// ── The whole page: the plan holds what the coach set ────────────────────────
test('the Plan keeps the coach\'s sliders when the page re-renders (the pace is read once per visit)', async () => {
  // The page's own neighbours, as the dashboard loads them: the chrome only passes children
  // through, and the section choice is held in plain state, opened on Plan.
  const pass = ({ children }) => React.createElement(React.Fragment, null, children);
  Object.assign(globalThis, {
    useDashboard: () => ({ today: null, source: 'live' }),
    useRememberedChoices: () => null,
    useRememberedChoice: () => React.useState('plan'),
    DashPage: pass, DashSegmented: () => null, DashExportButton: () => null, DashFunnelPanel: () => null, DashDemoBand: () => null,
    trainerNavItems: () => [], trainerPayoutCard: {}, nutriPayoutCard: {},
  });
  // Twelve weeks of a practice that adds a client most weeks, so the plan starts from a pace.
  const weeks = Array.from({ length: 26 }, (_, i) => {
    const d = new Date(Date.now() - (25 - i) * 7 * 86400000);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { weekOf: d.toISOString().slice(0, 10), active: 6 + Math.floor(i / 2), added: i % 2, ended: 0, mrrNetCents: (6 + Math.floor(i / 2)) * 15300, mrrGrossCents: (6 + Math.floor(i / 2)) * 18000 };
  });
  const analytics = { isTrainer: true, providerId: 7, metrics: {}, byOrigin: [], trajectory: { weeks, firstSubAt: weeks[0].weekOf + 'T00:00:00Z' }, renewals: [], churn: [], stripe: { connected: false } };
  let capacityLands;
  const capacity = new Promise((r) => { capacityLands = r; });
  const answer = (d) => Promise.resolve({ ok: true, json: () => Promise.resolve(d) });
  globalThis.fetch = window.fetch = (url) => {
    if (url.startsWith('/api/trainer/analytics')) return answer(analytics);
    if (url.startsWith('/api/coach/listing')) return answer({ listings: [{ role: 'trainer', monthly: 180, ready: true }] });
    if (url.startsWith('/api/coach/capacity')) return capacity.then(() => ({ ok: true, json: () => Promise.resolve({ listings: [{ role: 'trainer', waiting: 2 }] }) }));
    return Promise.reject(new Error('unexpected ' + url));
  };
  // The clock moves on between renders, as it does in a browser.
  const realNow = Date.now;
  let tick = realNow();
  Date.now = () => (tick += 1000);
  try {
    const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const adds = () => m.div.querySelectorAll('input[type=range]')[0];
    assert.ok(adds(), 'the plan is drawn: ' + m.text().slice(0, 200));
    await setValue(adds(), 4);
    assert.equal(adds().value, '4');
    // A late answer re-renders the page: the waiting list lands.
    await React.act(async () => { capacityLands(); await capacity; await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(adds().value, '4', 'the coach\'s plan survives the re-render');
    assert.match(m.text(), /Your plan/);
    await m.unmount();
  } finally {
    Date.now = realNow;
  }
});

// ── The plan's words agree with its figures (sweep before Codex round 4, #2394) ──
const runFor = (base, o) => CF.forecast({ clients: base.clients, mrrNetCents: base.mrrNetCents, byoShare: base.byoShare, months: 36, priceCents: o.rate * 100, adds: o.adds, churn: o.churnPct / 100 });

test('a small measured churn is kept to a tenth of a point, never rounded to 0%', async () => {
  // One departure from 70 clients in three months: 0.45% a month.
  const base = { ...BASE, clients: 70, mrrNetCents: 70 * 15300, pace: { ...PACE, adds: 1, churn: 0.00448 } };
  const m = await mount(React.createElement(B.DbzPlanZone, { base }));
  assert.match(m.text(), /yours: 0\.4% leave a month, over the last 3 months/);
  assert.match(m.text(), /Monthly churn0\.4%/);
  const T = runFor(base, { adds: 1, churnPct: 0.4, rate: 180 });
  assert.ok(sentence(m.div).includes(money(T.rows[12].netCents)), 'the plan runs at 0.4%, not 0%: ' + sentence(m.div));
  await m.unmount();
  const life = await mount(React.createElement(B.DbzLifetimeZone, { base: { ...base, state: 'ready' } }));
  assert.match(life.text(), /From 0\.4% of clients leaving a month/);
  await life.unmount();
  const tiny = await mount(React.createElement(B.DbzLifetimeZone, { base: { ...base, state: 'ready', pace: { ...base.pace, churn: 0.0002 } } }));
  assert.match(tiny.text(), /From 0\.1% of clients leaving a month/, 'a departure is never 0%');
  await tiny.unmount();
});

test('a plan that misses the goal but is still climbing past it says so, not that it levels off', async () => {
  // 8 clients, $1,020 net a month, 0.7 a month, 2% churn, $150: it plateaus near $4,463, above a
  // $3,500 goal it takes more than three years to reach.
  const base = { ...BASE, clients: 8, mrrNetCents: 102000, rateCents: 15000, byoShare: 0, pace: { ...PACE, adds: 0.7, churn: 0.02 } };
  const m = await mount(React.createElement(B.DbzPlanZone, { base }));
  await setValue(m.div.querySelectorAll('input[type=range]')[3], 3500);
  const T = runFor(base, { adds: 0.7, churnPct: 2, rate: 150 });
  assert.equal(CF.monthsTo(350000, T), null);
  assert.ok(T.steadyNetCents > 350000, 'the fixture plateaus above the goal');
  assert.ok(sentence(m.div).endsWith(`That doesn't reach your $3,500 goal within three years, but it's still climbing, toward ${money(T.steadyNetCents)} a month.`), sentence(m.div));
  await m.unmount();
});

test('when the plan and today\'s pace reach the goal the same month, the sentence says so', async () => {
  const base = { ...BASE, clients: 10, mrrNetCents: 127500, rateCents: 15000, byoShare: 0, pace: { ...PACE, adds: 1, churn: 0.02 } };
  const m = await mount(React.createElement(B.DbzPlanZone, { base }));
  await setValue(m.div.querySelectorAll('input[type=range]')[2], 155);
  const goal = Number(m.div.querySelectorAll('input[type=range]')[3].value) * 100;
  const [pr, tr] = [CF.monthsTo(goal, runFor(base, { adds: 1, churnPct: 2, rate: 155 })), CF.monthsTo(goal, runFor(base, { adds: 1, churnPct: 2, rate: 150 }))];
  assert.ok(pr != null && pr === tr, 'the fixture reaches the goal the same month both ways: ' + pr + ' ' + tr);
  assert.ok(sentence(m.div).endsWith(`goal in ${months(pr)} the same month as at today's pace.`), sentence(m.div));
  assert.doesNotMatch(sentence(m.div), /instead of/);
  await m.unmount();
});
