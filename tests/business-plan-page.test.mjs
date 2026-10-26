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
// The preview roster's people (Today's ten), which Business's origin list and renewals name too.
const ROSTER_NAMES = new RegExp(globalThis.DashSignals.buildMockClients(new Date()).map((c) => c.profile.name.replace(/[.$]/g, '\\$&')).join('|'));

const { loadRealModule } = await import('./helpers/load-real-module.mjs');
// The routes' own rules for the trajectory and for each ended plan (both analytics routes use them).
const { buildTrajectory, subDeparture, NOT_ENDED_STATUSES } = await import('../src/lib/coach-trajectory.mjs');
const B = await loadRealModule(ND('dashBusiness.jsx'), {
  appendExports: 'export { DbzBringClientsZone, DbzChurnZone, DbzOutcomesZone, DbzGoalEarn, dbzGoalEarnBase, dbzPlanBase, DbzPlanZone, DbzEarnZone, DbzPayoutsZone, DbzRenewalsZone, dbzRenewalsHead, DbzWaitlistZone, DbzLifetimeZone, DbzOriginZone, DBZ_DEMO_CHURN, dbzDemoTrajectory, dbzDemoBook, dbzDemoOrigin, dbzDemoRenewals, DBZ_DEMO_OUTCOMES };',
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

test('dbzPlanBase: the brought-by-you share is the routes\' per-client mix, not a count of rows', () => {
  // The routes count clients (one client with two plans is one client: coach-analytics-routes).
  const byOrigin = [
    { kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 },
    { kind: 'purchase', feeBps: 0 }, { kind: 'purchase', feeBps: 0 },
  ];
  const b = B.dbzPlanBase({ live: true, extra: { metrics: { activeClients: 4, mrrNetCents: 1, mrrGrossCents: 1 }, byOrigin, byoMix: { clients: 4, brought: 1 }, trajectory: null }, listing: null, listingRead: true });
  assert.equal(b.byoShare, 0.25, 'from the mix, not the 2 of 4 rows');
  assert.equal(b.byoNote, '0% fee · 1 of your 4');
  // Today's count takes in a client whose payment is retrying (the trajectory's latest week); the
  // note and the share stay the mix's own 1 of 4 (coachForecast.js planNumbers, which the app reads too).
  const week = { weekOf: '2026-10-12', active: 5, added: 0, ended: 0, mrrNetCents: 1, mrrGrossCents: 1 };
  const t = B.dbzPlanBase({ live: true, extra: { metrics: { activeClients: 4, mrrNetCents: 1, mrrGrossCents: 1 }, byOrigin, byoMix: { clients: 4, brought: 1 }, trajectory: { weeks: [week], firstSubAt: null } }, listing: null, listingRead: true });
  assert.deepEqual([t.clients, t.byoShare, t.byoNote], [5, 0.25, '0% fee · 1 of your 4']);
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

// The chart read back through its own axis: the value each line is drawn at, month by month, the
// goal line's value, and the last month on the axis.
function readChart(div) {
  const svg = div.querySelector('svg');
  const ticks = [...svg.querySelectorAll('text[text-anchor=end]')].map((t) => ({ v: Number(t.textContent.replace(/[^0-9]/g, '')) * 100, y: Number(t.getAttribute('y')) - 3.5 }));
  const [zero, top] = [ticks[0], ticks[ticks.length - 1]];
  const at = (y) => ((zero.y - y) / (zero.y - top.y)) * top.v;
  const goal = svg.querySelector('line[stroke-dasharray="5 4"]');
  return {
    top: top.v,
    lines: [...svg.querySelectorAll('polyline')].map((p) => p.getAttribute('points').split(' ').map((xy) => at(Number(xy.split(',')[1])))),
    goal: goal ? at(Number(goal.getAttribute('y1'))) : null,
    lastMonth: [...svg.querySelectorAll('text[text-anchor=middle]')].map((t) => t.textContent).pop(),
  };
}

test('the chart follows the sliders, and a goal reached after month 24 stretches it to month 36', async () => {
  const m = await mount(React.createElement(B.DbzPlanZone, { base: BASE }));
  const close = (c, want, label) => assert.ok(Math.abs(c.lines[label[0]][label[1]] - want) <= c.top * 0.002, `${label}: drawn at ${c.lines[label[0]][label[1]]}, forecast ${want}`);
  const T = run({ adds: 2.3, churn: 0.08, rate: 180 });
  let c = readChart(m.div);
  close(c, T.rows[12].netCents, [0, 12]);
  close(c, T.rows[24].netCents, [0, 24]);
  assert.ok(Math.abs(c.goal - 300000) <= c.top * 0.002, 'the dashed line is at the goal');
  assert.equal(c.lastMonth, 'mo 24');

  const [adds, churn, rate, goal] = m.div.querySelectorAll('input[type=range]');
  await setValue(adds, 4); await setValue(churn, 3); await setValue(rate, 250); await setValue(goal, 20000);
  const P = run({ adds: 4, churn: 0.03, rate: 250 });
  const W = run({ adds: 5, churn: 0.03, rate: 250 });
  const r = CF.monthsTo(2000000, P);
  assert.ok(r > 24 && r <= 36, 'the fixture reaches its goal in the third year: ' + r);
  c = readChart(m.div);
  assert.equal(c.lines.length, 3, "today's pace, the plan and the what-if");
  close(c, T.rows[12].netCents, [0, 12]);
  close(c, P.rows[12].netCents, [1, 12]);
  close(c, P.rows[r].netCents, [1, r]);
  close(c, W.rows[36].netCents, [2, 36]);
  assert.ok(Math.abs(c.goal - 2000000) <= c.top * 0.002);
  assert.equal(c.lastMonth, 'mo 36', 'the month the table names is on the chart');
  assert.equal(m.div.querySelector('tbody tr:nth-child(2) td:last-child').textContent, 'mo ' + r);
  // A goal inside two years puts it back to two.
  await setValue(goal, 8000);
  c = readChart(m.div);
  assert.equal(c.lastMonth, 'mo 24');
  assert.equal(c.lines[1].length, 25);
  await m.unmount();
});

// ── Bring your clients ───────────────────────────────────────────────────────
test('the referral link names the coach, the token and the role, and a refused copy says to copy it by hand', async () => {
  const calls = [];
  window.shapeDb = {
    getSession: async () => ({ user: { id: 'coach-uid' } }),
    client: { rpc: async (fn, args) => { calls.push([fn, args]); return { data: 'tok-1', error: null }; } },
  };
  try {
    const m = await mount(React.createElement(B.DbzBringClientsZone, { live: true, role: 'nutritionist', providerId: 4 }));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.deepEqual(calls, [['create_coach_referral_link', { p_provider_role: 'nutritionist', p_provider_id: 4 }]]);
    // A coach with both roles has two provider rows: the role picks the one the token belongs to.
    assert.ok(m.text().includes('https://theshapecommunity.com/newdesign/MemberProfile.html?u=coach-uid&ref=tok-1&role=nutritionist'), m.text());
    const copy = [...m.div.querySelectorAll('button')].find((b) => /Copy link/.test(b.textContent));
    const had = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    try { await click(copy); await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
    finally { if (had) Object.defineProperty(window.navigator, 'clipboard', had); else delete window.navigator.clipboard; }
    assert.match(m.text(), /Couldn't copy it here\. Select the link above and copy it\./);
    await m.unmount();
  } finally { delete window.shapeDb; }
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

// ── The rate for new clients (the sweep after #2394 round 10) ───────────────
// The note under a slider, and whether a browser would snap the slider's value (jsdom does not
// snap a range input, but it does report the step mismatch a browser would snap away).
const sliderNote = (input) => input.closest('label').lastElementChild.textContent;
const holds = (input) => !input.validity.stepMismatch && !input.validity.rangeUnderflow && !input.validity.rangeOverflow;

test('a $149 listing price: the untouched plan runs at $149, not $150, and the slider holds it', async () => {
  const base = { ...BASE, rateCents: 14900 };
  const T = run({ adds: 2.3, churn: 0.08, rate: 149 });
  const at150 = run({ adds: 2.3, churn: 0.08, rate: 150 });
  assert.notEqual(money(T.rows[12].netCents), money(at150.rows[12].netCents), 'the fixture tells $149 from $150 in a year');
  assert.notEqual(money(CF.earnedOver(T, 12)), money(CF.earnedOver(at150, 12)));
  const m = await mount(React.createElement(B.DbzPlanZone, { base }));
  const rate = m.div.querySelectorAll('input[type=range]')[2];
  assert.equal(rate.value, '149');
  assert.ok(holds(rate), `a browser keeps $149 on this slider: min ${rate.min}, step ${rate.step}`);
  assert.match(m.text(), /Rate for new clients\$149your listing price/);
  assert.ok(sentence(m.div).includes(`At today's pace that becomes ${money(T.rows[12].netCents)} a month in a year`), sentence(m.div));
  const cells = [...m.div.querySelectorAll('table.dbz-cmp tbody tr')][0].textContent;
  assert.ok(cells.includes(money(CF.earnedOver(T, 12))), cells);
  // A drag away and back is the coach's own price again: untouched, one line, no "was".
  await setValue(rate, 160);
  assert.match(m.text(), /\$160 · was \$149/);
  await setValue(rate, 149);
  assert.doesNotMatch(m.text(), /· was \$/);
  assert.deepEqual(rowLabels(m.div), ["Today's pace", 'What if: +1 client a month']);
  await m.unmount();
});

test('a listing price with cents is held to the cent, on the plan and in What clients earn you', async () => {
  const base = { ...BASE, rateCents: 14950 };
  const m = await mount(React.createElement(B.DbzPlanZone, { base }));
  const rate = m.div.querySelectorAll('input[type=range]')[2];
  assert.equal(rate.value, '149.5');
  assert.ok(holds(rate), `a browser keeps $149.50 on this slider: min ${rate.min}, step ${rate.step}`);
  assert.match(m.text(), /Rate for new clients\$149\.50your listing price/);
  const T = CF.forecast({ clients: 12, mrrNetCents: 189000, byoShare: 2 / 12, months: 36, priceCents: 14950, adds: 2.3, churn: 0.08 });
  assert.ok(sentence(m.div).includes(`becomes ${money(T.rows[12].netCents)} a month in a year`), sentence(m.div));
  await setValue(rate, 150.5);
  assert.match(m.text(), /\$150\.50 · was \$149\.50/);
  await m.unmount();
  const e = await mount(React.createElement(B.DbzEarnZone, { base }));
  assert.equal(e.div.querySelectorAll('input[type=number]')[1].value, '149.5');
  assert.ok(e.text().includes(money(CF.earn({ clients: 20, priceCents: 14950, byoShare: 0.17 }).netCents) + 'net a month'), e.text());
  await e.unmount();
});

test('the rate slider says where its starting number came from, as What clients earn you does', async () => {
  const extra = (m) => ({ metrics: m, byOrigin: [], byoMix: { clients: 0, brought: 0 }, trajectory: null });
  const some = { activeClients: 3, mrrNetCents: 40000, mrrGrossCents: 47300 };
  const none = { activeClients: 0, mrrNetCents: 0, mrrGrossCents: 0 };
  for (const [why, args, from] of [
    ['a listing price', { extra: extra(some), listing: { monthly: 149 } }, 'your listing price'],
    ["the clients' average", { extra: extra(some), listing: { monthly: null } }, "your clients' average"],
    ['the default', { extra: extra(none), listing: null }, 'no listing price yet · set your own'],
    ['an unread listing, averaged', { extra: extra(some), listing: null, listingFailed: true }, "couldn't read your listing price · your clients' average"],
    ['an unread listing, no clients', { extra: extra(none), listing: null, listingFailed: true }, "couldn't read your listing price · set your own"],
  ]) {
    const base = B.dbzPlanBase({ live: true, listingRead: true, ...args });
    assert.equal(base.rateFrom, from, why);
    const m = await mount(React.createElement(B.DbzPlanZone, { base }));
    const rate = m.div.querySelectorAll('input[type=range]')[2];
    assert.equal(sliderNote(rate), from + " · today's clients keep their price", why);
    assert.equal(rate.value, String(base.rateCents / 100), why + ': the plan starts at the rate the note names');
    assert.ok(holds(rate), why);
    await m.unmount();
  }
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
  // People, not plans (Codex round 8, #2394): one client with two plans due is one client, and
  // both plans' net count. A row with no client id stands alone.
  const two = [{ ...RENEWALS[0], clientId: 'c1' }, { ...RENEWALS[0], clientId: 'c1', netCents: 10000 }];
  assert.equal(B.dbzRenewalsHead(true, two), '1 client · ' + money(RENEWALS[0].netCents + 10000) + ' net');
  assert.equal(B.dbzRenewalsHead(true, [...two, { ...RENEWALS[0], clientId: null }, { ...RENEWALS[0], clientId: null }]), '3 clients · ' + money(3 * RENEWALS[0].netCents + 10000) + ' net');
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
  // Departures, not plans that ended and not people (Codex round 8 and the sweep after round 10,
  // #2394). The route decides each row at the close of the week it ended in: a row whose client held
  // another plan then (departed false) is no departure, and is not listed. Plans one client ended at
  // one moment (or in one week) are one departure, and both plans' money is lost.
  const twoPlans = [
    { ...rows[0], name: 'Held another', clientId: 's', departed: false, priceCents: 9000 },
    { ...rows[0], name: 'Two at once', clientId: 'l', departed: true, priceCents: 18000 },
    { ...rows[0], name: 'Two at once', clientId: 'l', departed: true, priceCents: 6000 },
  ];
  const once = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: twoPlans }));
  assert.match(once.text(), /^1 left in the last 90 days−\$240 a month/, 'two plans at one moment, one departure');
  assert.match(once.text(), /Two at once[^−]*−\$240\/mo/, 'listed once, with both plans\' money');
  assert.doesNotMatch(once.text(), /Held another/, 'a plan ended while another was held is not a departure');
  await once.unmount();
  // A client who left, came back and left again left twice, each with its own money, as the pace's
  // ended count has it. Counting people said "1 left" beside both departures' money.
  const twice = [
    { ...rows[0], name: 'Back and gone', clientId: 'b', departed: true, endedAt: new Date(Date.now() - 5 * day).toISOString(), priceCents: 18000 },
    { ...rows[0], name: 'Back and gone', clientId: 'b', departed: true, endedAt: new Date(Date.now() - 60 * day).toISOString(), priceCents: 6000 },
  ];
  const left2 = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: twice }));
  assert.match(left2.text(), /^2 left in the last 90 days−\$240 a month/, 'two departures, two counts, and the money of both');
  assert.equal((left2.text().match(/Back and gone/g) || []).length, 2);
  await left2.unmount();
  // The history each departure is decided from unread (departed null, Codex round 9): no one is
  // counted, listed or subtracted.
  const unsure = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: [...twoPlans, { ...rows[0], name: 'Unknown', clientId: 'u', departed: null }] }));
  assert.equal(unsure.text(), "Couldn't check who still has a plan with you just now, so no one is counted as gone. Nothing is lost; reload to try again.");
  await unsure.unmount();
  // The floor is the route's list: 12 rows, all inside the window, even when some are left out.
  const fullMixed = full.map((r, i) => (i < 3 ? { ...r, clientId: 'k' + i, departed: false } : { ...r, clientId: 'g' + i, departed: true }));
  const floored = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: fullMixed }));
  assert.match(floored.text(), /^9 or more left in the last 90 daysat least −\$1,620 a month/);
  await floored.unmount();
  for (const role of ['trainer', 'nutritionist']) {
    const src = readFileSync(fileURLToPath(new URL(`../src/app/api/${role}/analytics/route.ts`, import.meta.url)), 'utf8');
    // Every ended plan (the trajectory's closed set, not 'canceled' alone), newest first, 12 of them.
    assert.match(src, /\.not\('status', 'in', `\(\$\{NOT_ENDED_STATUSES\.join\(','\)\}\)`\)\n\s+\.order\('current_period_end', \{ ascending: false, nullsFirst: false \}\)\n\s+\.limit\(12\);/, role + ' sends the newest 12 ended plans, as DBZ_CHURN_LIST says');
  }
});

// ── Left open by #2394 and #2395: a name the routes don't have is null, and nameUnread says why ──
// They sent "Former client" and "Client" for a name that couldn't be read and for none on file alike.
test('who left: a name that couldn\'t be read says so, and one with none on file reads "Former client"', async () => {
  const day = 86400000;
  const row = (o) => ({ departed: true, startedAt: new Date(Date.now() - 300 * day).toISOString(), priceCents: 18000, reason: null, ...o });
  const rows = [
    row({ name: null, nameUnread: true, clientId: 'u', endedAt: new Date(Date.now() - 5 * day).toISOString() }),
    row({ name: null, nameUnread: false, clientId: 'n', endedAt: new Date(Date.now() - 6 * day).toISOString() }),
    row({ name: 'Ada Lovelace', nameUnread: false, clientId: 'a', endedAt: new Date(Date.now() - 7 * day).toISOString() }),
  ];
  const m = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: rows }));
  assert.match(m.text(), /^3 left in the last 90 days−\$540 a monthName couldn't be readended [^−]*−\$180\/moFormer clientended [^−]*−\$180\/moAda Lovelaceended /);
  await m.unmount();
});

test('the roster outcomes say a name that couldn\'t be read, and "Client" for one with none on file', async () => {
  globalThis.useDashUnits = globalThis.useDashUnits || (() => ({ measure: (value, unit) => ({ value, unit }) }));
  const row = (client_id, name, nameUnread, workouts30d, weightChangeLb) => ({ client_id, name, nameUnread, workouts30d, workouts7d: 1, weightStart: 200, weightLatest: 200 + weightChangeLb, weightChangeLb, prs30d: 0 });
  const roster = [row('u', null, true, 9, -6), row('n', null, false, 8, -5), row('a', 'Ada Lovelace', false, 7, -4)];
  const cp = { activeClients: 3, workouts30d: 24, workouts7d: 3, avgAdherencePct: 50, prs30d: 0, weightsUnknown: false, rosterUnknown: false, roster };
  const m = await mount(React.createElement(B.DbzOutcomesZone, { role: 'trainer', cp }));
  // Both lists: the top weight loss, and the most consistent.
  assert.match(m.text(), /Top weight loss · 30dName couldn't be read−6\.0 lbClient−5\.0 lbAda Lovelace−4\.0 lb/);
  assert.match(m.text(), /Most consistent · 30dName couldn't be read9 workoutsClient8 workoutsAda Lovelace7 workouts/);
  await m.unmount();
});

// ── The sweep after #2394 round 10: who left counts over the pace's own window ──
// "What a client is worth" reads the pace (paceFrom: from the Monday on or before 91 days ago, or
// the Monday after the first client's week), "over the last 3 months"; the churn zone counted exactly
// 90 days, "in the last 90 days", so a departure on day 90.5 was in one and not the other.
const weeksFor = (now, firstDays, ends = []) => {
  const monday = new Date(now); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weeks = [];
  for (let i = 25; i >= 0; i--) weeks.push({ weekOf: new Date(monday.getTime() - i * 7 * 86400000).toISOString().slice(0, 10), active: 10, added: 0, ended: ends.includes(25 - i) ? 1 : 0, mrrGrossCents: 180000, mrrNetCents: 153000 });
  return { weeks, firstSubAt: new Date(now - firstDays * 86400000).toISOString() };
};
test('the churn zone counts over the pace\'s window and says it in the pace\'s words', async () => {
  const day = 86400000;
  const now = Date.now();
  const traj = weeksFor(now, 400, [13]);
  const pace = CF.paceFrom(traj, now);
  assert.ok(pace.adds != null && pace.from <= now - 91 * day, 'a pace over the last 3 months');
  // Ended 90.5 days ago: inside the pace's window, outside a 90-day one.
  const rows = [{ name: 'Day ninety', clientId: 'n', departed: true, startedAt: new Date(now - 300 * day).toISOString(), endedAt: new Date(now - 90.5 * day).toISOString(), priceCents: 18000, reason: null }];
  const m = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: rows, pace, now }));
  assert.match(m.text(), /^1 left over the last 3 months−\$180 a month/);
  await m.unmount();
  const none = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: [{ ...rows[0], endedAt: new Date(pace.from - day).toISOString() }], pace, now }));
  assert.match(none.text(), /^None left over the last 3 months/, 'before the window opens');
  await none.unmount();
  // A younger practice: the pace opens the Monday after the first client's week, and says so.
  const young = CF.paceFrom(weeksFor(now, 60), now);
  assert.ok(young.fromFirst && young.adds != null);
  const y = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: [{ ...rows[0], endedAt: new Date(now - 10 * day).toISOString() }], pace: young, now }));
  assert.match(y.text(), /^1 left after your first week−\$180 a month/);
  await y.unmount();
  // No pace (an unread history, or under a month of it): the last 90 days, said as such.
  for (const p of [null, { adds: null, churn: null, unread: true }, CF.paceFrom(weeksFor(now, 20), now)]) {
    const f = await mount(React.createElement(B.DbzChurnZone, { live: true, churn: rows, pace: p, now }));
    assert.match(f.text(), /^None left in the last 90 days/, JSON.stringify(p));
    await f.unmount();
  }
});

// The whole page, live, opened on one section, with the analytics answering `analytics`.
async function mountBusiness(analytics, section) {
  stubPage({ source: 'live', section });
  const ok = (d) => Promise.resolve({ ok: true, json: () => Promise.resolve(d) });
  globalThis.fetch = window.fetch = (url) => {
    if (url.startsWith('/api/trainer/analytics')) return ok(analytics);
    if (url.startsWith('/api/coach/listing')) return ok({ listings: [{ role: 'trainer', monthly: 180, ready: true }] });
    if (url.startsWith('/api/coach/capacity')) return ok({ listings: [{ role: 'trainer', waiting: 0 }] });
    return Promise.reject(new Error('unexpected ' + url));
  };
  const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
  await settle();
  await settle();
  return m;
}

test('on the Retention tab, who left and what a client is worth read one window', async () => {
  const day = 86400000;
  const now = Date.now();
  const weeks = weeksFor(now, 400, [13]);
  const analytics = { isTrainer: true, providerId: 7, metrics: {}, byOrigin: [], byoMix: { clients: 10, brought: 0 }, trajectory: weeks, renewals: [], stripe: { connected: false },
    churn: [{ name: 'Day ninety', clientId: 'n', departed: true, startedAt: new Date(now - 300 * day).toISOString(), endedAt: new Date(now - 90.5 * day).toISOString(), priceCents: 18000, reason: null }] };
  const m = await mountBusiness(analytics, 'retention');
  assert.match(m.text(), /From [\d.]+% of clients leaving a month over the last 3 months/);
  assert.match(m.text(), /1 left over the last 3 months−\$180 a month/);
  assert.doesNotMatch(m.text(), /None left/);
  await m.unmount();
});

// Its review (the sweep after #2394 round 10): the route decides each ended plan at the close of the
// week it ended in, and the page counts one client's departures in one week once, so the churn zone
// and "What a client is worth" count the same departures. The analytics here are built from
// subscription rows by the routes' own rules, as the route sends them.
function analyticsFrom(subs, now) {
  const churn = subs.filter((r) => !NOT_ENDED_STATUSES.includes(r.status))
    .sort((a, b) => Date.parse(b.current_period_end) - Date.parse(a.current_period_end))
    .map((r) => { const e = subDeparture(r, subs, now); return { name: r.name, clientId: r.client_id, departed: e.departed, startedAt: r.created_at, endedAt: new Date(e.endedAt).toISOString(), priceCents: r.price_cents, reason: null }; });
  return { isTrainer: true, providerId: 7, metrics: {}, byOrigin: [], byoMix: { clients: 6, brought: 0 }, trajectory: buildTrajectory({ subs, now }), renewals: [], stripe: { connected: false }, churn };
}
// Five clients who stay, and x: their plan ends on a Monday three weeks back at 10:00.
function weekCase(now) {
  const day = 86400000;
  const m = new Date(now); m.setUTCHours(0, 0, 0, 0); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  const monday = m.getTime() - 21 * day;
  const iso = (t) => new Date(t).toISOString();
  const row = (o) => ({ status: 'active', price_cents: 18000, fee_bps: 1500, created_at: iso(now - 200 * day), ...o });
  const others = Array.from({ length: 5 }, (_, i) => row({ id: 'o' + i, client_id: 'o' + i, name: 'Stays ' + i }));
  const gone = row({ id: 'x1', client_id: 'x', name: 'Card Failed', status: 'unpaid', current_period_end: iso(monday + 10 * 3600000) });
  return { monday, day, iso, row, others, gone };
}
test('on the Retention tab, a client back later the week they left is no departure in either zone', async () => {
  const now = Date.now();
  const { monday, day, iso, row, others, gone } = weekCase(now);
  // Back on the Thursday: the pace has no one leaving, and neither does the churn zone.
  const back = row({ id: 'x2', client_id: 'x', name: 'Card Failed', created_at: iso(monday + 3 * day + 9 * 3600000) });
  let m = await mountBusiness(analyticsFrom([...others, gone, back], now), 'retention');
  assert.match(m.text(), /No one has left over the last 3 months, so there isn't an average stay to measure yet\./);
  assert.match(m.text(), /None left over the last 3 months/);
  assert.doesNotMatch(m.text(), /1 left over the last 3 months|Card Failed/);
  await m.unmount();
  // Back on the Tuesday and gone again on the Wednesday: one departure in each, and the money lost is
  // the plan they held when they left, not the earlier one too (Codex on #2395).
  const again = row({ id: 'x2', client_id: 'x', name: 'Card Failed', status: 'canceled', price_cents: 6000, created_at: iso(monday + day + 8 * 3600000), current_period_end: iso(monday + 2 * day + 18 * 3600000) });
  const twice = analyticsFrom([...others, gone, again], now);
  assert.equal(CF.paceFrom(twice.trajectory, now).ended, 1, 'the pace counts one');
  m = await mountBusiness(twice, 'retention');
  assert.match(m.text(), /From [\d.]+% of clients leaving a month over the last 3 months/);
  assert.match(m.text(), /1 left over the last 3 months−\$60 a month/);
  assert.equal((m.text().match(/Card Failed/g) || []).length, 1, 'listed once');
  await m.unmount();
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

// ── The sweep after #2394 round 10: the Goal tab's live figures are today's, by the Plan's rule ──
test('the Goal tab\'s live clients and net are today\'s (coachForecast.js todayFrom), as the Plan\'s are: a client whose payment is retrying counts', async () => {
  // The hook itself, lifted from dashData.jsx and run against a scripted analytics answer.
  const data = readFileSync(ND('dashData.jsx'), 'utf8');
  const src = /function useCoachLiveFigures\(role\) \{[\s\S]*?\n\}/.exec(data)[0];
  const live = async (answer) => {
    let state = null;
    const R = { useState: (init) => [init, (v) => { state = v; }], useEffect: (fn) => { fn(); } };
    const hook = new Function('React', '_dashJson', 'window', src + '\nreturn useCoachLiveFigures;')(R, async () => answer, { CoachForecast: CF });
    hook('trainer');
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    return state;
  };
  // 13 clients today, one of them retrying (past_due): the route's `metrics` count 12.
  const weeks = [{ weekOf: '2026-10-05', active: 12, mrrNetCents: 170000, mrrGrossCents: 200000 }, { weekOf: '2026-10-12', active: 13, mrrNetCents: 182700, mrrGrossCents: 215000 }];
  const answer = { isTrainer: true, metrics: { activeClients: 12, mrrNetCents: 170000, mrrGrossCents: 200000 }, trajectory: { weeks, firstSubAt: null, summary: {} }, byoMix: { clients: 13, brought: 3 } };
  const l = await live(answer);
  assert.deepEqual([l.kind, l.activeClients, l.mrrNetCents, l.mrrGrossCents], ['live', 13, 182700, 215000], 'today, not the active and trialing rows');
  const plan = CF.planNumbers({ extra: answer, listingMonthly: null });
  assert.deepEqual([l.activeClients, l.mrrNetCents], [plan.clients, plan.mrrNetCents], 'the Goal tab and the Plan say the same today');
  assert.equal(B.dbzGoalEarnBase(l).clients, plan.clients);
  assert.equal(l.byoNote, '0% fee · 3 of your 13');
  // The trajectory unread: `metrics` stand in, as todayFrom says. Neither: unread, not 0.
  const fallback = await live({ ...answer, trajectory: null });
  assert.deepEqual([fallback.activeClients, fallback.mrrNetCents], [12, 170000]);
  const neither = await live({ ...answer, trajectory: null, metrics: { activeClients: null, mrrNetCents: null, mrrGrossCents: null } });
  assert.deepEqual([neither.kind, neither.activeClients, neither.mrrNetCents], ['live', null, null]);
});

// ── A signed-out reader is the sample, not a failed read ─────────────────────
// The analytics routes answer a signed-out caller with 401. The hook read every thrown fetch as
// "unknown", so the Goal tab's What clients earn you told a signed-out preview "Couldn't read your
// subscriptions just now". Only a 401 is the sample (the Score page's rule); anything else that
// fails stays a failed read.
test('the live figures read a 401 as the sample, and a 503, a 500 or a dead network as a failed read', async () => {
  const data = readFileSync(ND('dashData.jsx'), 'utf8');
  const lift = (re) => re.exec(data)[0];
  const dashJsonSrc = [lift(/const DASH_CACHE_TTL = [^\n]*\n/), lift(/const _dashCache = [^\n]*\n/), lift(/async function _dashJson\(url\) \{[\s\S]*?\n\}/)].join('');
  const hookSrc = lift(/function useCoachLiveFigures\(role\) \{[\s\S]*?\n\}/);
  const kindFor = async (respond) => {
    let state = null;
    const R = { useState: (init) => [init, (v) => { state = v; }], useEffect: (fn) => { fn(); } };
    // The real _dashJson, over a scripted fetch, so the status really comes off a response.
    const fetch = async () => { const r = respond(); if (r instanceof Error) throw r; return r; };
    const hook = new Function('React', 'fetch', 'window', dashJsonSrc + hookSrc + '\nreturn useCoachLiveFigures;')(R, fetch, { CoachForecast: CF });
    hook('trainer');
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    return state && state.kind;
  };
  const res = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  assert.equal(await kindFor(() => res(401, { error: 'Authentication required.' })), 'demo', 'signed out reads as a failure again');
  assert.equal(await kindFor(() => res(503, { error: 'Could not check your sign-in just now.' })), 'unknown', 'a sign-in that could not be checked is shown the sample');
  assert.equal(await kindFor(() => res(500)), 'unknown');
  assert.equal(await kindFor(() => new TypeError('Failed to fetch')), 'unknown', 'a dead network is shown the sample');
  // Signed in but not this role: the route's own answer, still the sample.
  assert.equal(await kindFor(() => res(200, { isTrainer: false })), 'demo');
});

test('the Goal tab\'s calculator says when its figures are the sample, and only then', async () => {
  const demo = await mount(React.createElement(B.DbzGoalEarn, { role: 'trainer', live: { kind: 'demo' } }));
  assert.equal(demo.div.querySelector('[data-dbz-sample]')?.textContent, 'Sample figures, not your own practice.');
  assert.doesNotMatch(demo.text(), /Couldn't read/);
  await demo.unmount();
  const failed = await mount(React.createElement(B.DbzGoalEarn, { role: 'trainer', live: { kind: 'unknown' } }));
  assert.match(failed.text(), /^Couldn't read your subscriptions just now/);
  assert.ok(!failed.div.querySelector('[data-dbz-sample]'), 'a failed read is labelled a sample');
  await failed.unmount();
  const weeks = [{ weekOf: '2026-10-12', active: 12, mrrNetCents: 179550, mrrGrossCents: 210000 }];
  const own = await mount(React.createElement(B.DbzGoalEarn, { role: 'trainer', live: { kind: 'live', activeClients: 12, mrrNetCents: 179550, mrrGrossCents: 210000, trajectory: { weeks }, byoShare: 0, byoNote: null } }));
  assert.ok(!own.div.querySelector('[data-dbz-sample]'), 'a coach\'s own figures are labelled a sample');
  await own.unmount();
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

test('an unread history, brought share or listing price is said as unread, never as none', async () => {
  const extra = { metrics: { activeClients: 12, mrrNetCents: 189000, mrrGrossCents: 216000 }, byOrigin: null, byoMix: null, trajectory: null };
  const b = B.dbzPlanBase({ live: true, extra, listing: null, listingRead: true, listingFailed: true });
  assert.equal(b.pace.unread, true);
  assert.equal(b.byoNote, "couldn't read who you brought · set your own");
  assert.equal(b.rateFrom, "couldn't read your listing price · your clients' average");
  assert.equal(B.dbzPlanBase({ live: true, extra: { ...extra, metrics: { activeClients: 0, mrrNetCents: 0, mrrGrossCents: 0 } }, listing: null, listingRead: true, listingFailed: true }).rateFrom, "couldn't read your listing price · set your own");
  assert.equal(B.dbzPlanBase({ live: true, extra: { ...extra, byOrigin: [], byoMix: { clients: 0, brought: 0 } }, listing: null, listingRead: true }).byoNote, '0% Shape fee on these', 'a read with no subscriptions is not unread');
  const m = await mount(React.createElement(B.DbzPlanZone, { base: b }));
  assert.equal((m.text().match(/couldn't read your history just now · set your own/g) || []).length, 2);
  assert.doesNotMatch(m.text(), /no history yet/);
  await m.unmount();
  const life = await mount(React.createElement(B.DbzLifetimeZone, { base: b }));
  assert.match(life.text(), /^Couldn't read your subscription history just now/);
  await life.unmount();
  const earn = await mount(React.createElement(B.DbzEarnZone, { base: b }));
  assert.match(earn.text(), /couldn't read who you brought · set your own/);
  await earn.unmount();
  // The Goal tab's figures (dashData.jsx) read the same per-client mix, and say when it couldn't be read.
  const data = readFileSync(ND('dashData.jsx'), 'utf8');
  assert.match(data, /const mix = a\.byoMix \|\| null;\n[^\n]*\n\s+if \(!mix\) return \{ byoShare: null, byoNote: "couldn't read who you brought · set your own" \};\n\s+if \(!mix\.clients\) return \{ byoShare: null, byoNote: null \};\n\s+return \{ byoShare: mix\.brought \/ mix\.clients, byoNote: "0% fee · " \+ mix\.brought \+ " of your " \+ mix\.clients \};/);
  assert.doesNotMatch(data, /a\.byOrigin/, 'the Goal tab no longer counts rows');
  const goal = B.dbzGoalEarnBase({ kind: 'live', activeClients: 12, mrrNetCents: 189000, mrrGrossCents: 216000, trajectory: null, byoShare: null, byoNote: "couldn't read who you brought · set your own" });
  assert.deepEqual([goal.byoShare, goal.byoNote], [0, "couldn't read who you brought · set your own"]);
});

test('a signed-in coach never sees the preview\'s figures while the page is still reading', async () => {
  // The dashboard feed hasn't resolved (source null) and the analytics haven't landed.
  Object.assign(globalThis, {
    useDashboard: () => ({ today: null, source: null }),
    useRememberedChoices: () => null,
    useRememberedChoice: () => React.useState('money'),
    DashPage: ({ children }) => React.createElement(React.Fragment, null, children),
    DashSegmented: () => null, DashExportButton: () => null, DashFunnelPanel: () => null, DashDemoBand: () => React.createElement('b', null, 'PREVIEW'),
    trainerNavItems: () => [], trainerPayoutCard: {}, nutriPayoutCard: {},
  });
  globalThis.fetch = window.fetch = () => new Promise(() => {});
  const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
  assert.doesNotMatch(m.text(), /Casey Morgan|Alex Rivera|Riley Kim|is coming to you/, m.text().slice(0, 300));
  assert.doesNotMatch(m.text(), ROSTER_NAMES, 'the preview roster is shown to a coach whose page is still reading');
  assert.match(m.text(), /Your payouts load with the analytics rollup/);
  await m.unmount();
  // A viewer the dashboard resolved as a demo, and the analytics answered as signed out, still sees
  // the preview, under its band.
  globalThis.useDashboard = () => ({ today: null, source: 'demo' });
  globalThis.fetch = window.fetch = () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Authentication required.' }) });
  const demo = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
  await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  assert.match(demo.text(), /PREVIEW/);
  assert.match(demo.text(), /is coming to you/);
  await demo.unmount();
});

// ── The whole page: a preview needs a preview viewer, not a failed read (Codex, #2394) ──
// useDashboard falls back to the demo whenever the roster read fails, signed out and outage
// alike, so `source: "demo"` alone cannot say who is looking. The page's own analytics answer can.
// The neighbours are stubbed so the page shows which it drew: the band, the sidebar card, and the
// funnel the panel would draw (the preview's when it is handed no feed).
function stubPage({ source, today = null, section }) {
  const seen = { card: null };
  Object.assign(globalThis, {
    useDashboard: () => ({ today, source }),
    useRememberedChoices: () => null,
    useRememberedChoice: () => React.useState(section),
    DashPage: ({ children, payoutCard }) => { seen.card = payoutCard; return React.createElement(React.Fragment, null, children); },
    DashSegmented: () => null, DashExportButton: () => null,
    DashFunnelPanel: ({ live }) => React.createElement('i', null, live ? 'LIVE FUNNEL' : 'DEMO FUNNEL'),
    DashDemoBand: () => React.createElement('b', null, 'PREVIEW'),
    trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: { demo: 'trainer' }, nutriPayoutCard: { demo: 'nutritionist' },
    useDashUnits: () => ({ measure: (value, unit) => ({ value, unit }) }),
  });
  return seen;
}
const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const SECTIONS = ['overview', 'money', 'plan', 'growth', 'retention'];
// Anything only the preview draws: its band, its people, its money sentence, its practice, its
// funnel, its waiting list. Its people include the roster its origin list, renewals and outcomes
// plate now name (ROSTER_NAMES, read from the roster rather than restated); the older names stay
// in the detector so a plate that brings them back is still caught.
const DEMO = new RegExp(/PREVIEW|Casey Morgan|Alex Rivera|Riley Kim|Sam Patel|Drew Park|Quinn Choi|Devon Sharpe|Mara Ellison|Theo Brandt|is coming to you|Active now|you have \d+ today|DEMO FUNNEL|people are waiting/.source + '|' + ROSTER_NAMES.source);
// Every figure on an unread page would be invented; the bring-your-clients pitch's $5 is the one
// fixed price the page states.
const dollars = (t) => /\$\d/.test(t.replace('members at $5/mo', ''));
const answer = (status, body) => () => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

test('a signed-in coach whose reads all failed sees unread states, never the preview\'s figures', async () => {
  const UNREAD = {
    overview: [/Your trajectory could not be read just now/],
    money: [/Couldn't read your payouts just now.*Couldn't read your subscriptions just now.*Couldn't read your subscriptions just now/],
    plan: [/Couldn't read your subscriptions just now, and the plan starts from them/],
    growth: [/Couldn't read your funnel just now/, /Couldn't read where your clients came from just now/, /Couldn't read your waiting list just now/],
    retention: [/Couldn't read your subscriptions just now/, /Couldn't read your roster outcomes just now/, /Couldn't read your cancellations just now/],
  };
  const outages = [
    ['a 500', answer(500, { error: 'Could not read your listing.' })],
    // An auth outage: the routes answer 503, never 401, when getUser() could not ask the auth
    // server (src/lib/auth-lookup.ts; coach-analytics-routes drives the route side).
    ['an auth outage (a 503)', answer(503, { error: 'Could not check your sign-in just now.' })],
    ['a thrown fetch', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['an answer that is not JSON', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) })],
  ];
  for (const [label, analytics] of outages) {
    for (const section of SECTIONS) {
      // The roster and dashboard reads failed too, so the dashboard resolved its demo fallback.
      const seen = stubPage({ source: 'demo', section });
      globalThis.fetch = window.fetch = (url) => (url.startsWith('/api/trainer/analytics') ? analytics() : answer(500, { error: 'x' })());
      const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
      await settle();
      const t = m.text();
      const at = label + ', ' + section + ': ' + t.slice(0, 400);
      assert.doesNotMatch(t, DEMO, at);
      assert.equal(dollars(t), false, at);
      assert.doesNotMatch(t, /loads? with|is loading/i, at);
      for (const re of UNREAD[section]) assert.match(t, re, at);
      assert.deepEqual([seen.card.amount, seen.card.sub], ['—', "couldn't read your payouts just now"], at);
      await m.unmount();
    }
  }
});

test('the preview is for a viewer the analytics answer as signed out or not a coach', async () => {
  const cases = [
    ['trainer', 'signed out', answer(401, { error: 'Authentication required.' })],
    ['trainer', 'forbidden', answer(403, { error: 'Forbidden.' })],
    ['trainer', 'signed in, not a trainer', answer(200, { isTrainer: false })],
    ['nutritionist', 'signed in, not a nutritionist', answer(200, { isNutritionist: false })],
  ];
  for (const [role, label, analytics] of cases) {
    const seen = stubPage({ source: 'demo', section: 'money' });
    globalThis.fetch = window.fetch = (url) => (url.startsWith('/api/' + role + '/analytics') ? analytics() : answer(401, { error: 'x' })());
    const m = await mount(React.createElement(window.CoachBusinessPage, { role }));
    await settle();
    assert.match(m.text(), /^PREVIEW/, label);
    assert.match(m.text(), /is coming to you/, label);
    assert.deepEqual(seen.card, { demo: role }, label + ': the preview\'s sidebar card');
    await m.unmount();
  }
  // Each preview tab draws the preview's own figures, under the band.
  // The preview's waiting list is valued at its sample rate, as a listing price would value it.
  for (const [section, re] of [['growth', /DEMO FUNNEL.*Found you on Shape.*3 people are waiting to join you\. If they all join at \$\d+ a month, that's about \$\d+ a month to you\./], ['retention', /Jordan M\..*Devon Sharpe/]]) {
    stubPage({ source: 'demo', section });
    globalThis.fetch = window.fetch = answer(401, { error: 'x' });
    const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
    await settle();
    assert.match(m.text(), /^PREVIEW/, section);
    assert.match(m.text().replace(/&#x27;/g, "'"), re, section);
    await m.unmount();
  }
});

// ── One practice across the preview, in money too (the sweep after #2394 round 10) ──
// Today's card took 15% off the whole demo roster ($1,547 a month). Business's Money row, Plan
// sentence and 13-week header read the last week of a walk that priced its own clients and took
// 15% off those ($1,585), beside an origin list and a Plan ("Brought by you", 50%) saying half the
// clients were brought at 0%. Every figure here is read off what the viewer sees, and the net it
// must equal is worked out from the roster's own prices and stored fees, not read from the code.
const bookOf = (cs) => ({
  clients: cs.length,
  gross: cs.reduce((s, c) => s + c.payments.mrrCents, 0),
  net: cs.reduce((s, c) => s + c.payments.mrrCents - c.payments.feeCents, 0),
});
// Today's Business card, the shipped function lifted out of dashToday.jsx (as coach-growth does).
function todayCard() {
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const pick = (re) => { const m = re.exec(today); assert.ok(m, re + ' moved'); return m[0]; };
  const code = [
    pick(/const DASH_FUNNEL_BENCHMARK = [^\n]*/),
    pick(/function dashCloseRate\(f\) \{[\s\S]*?\n\}/),
    pick(/function dashCloseWhy\(f\) \{[\s\S]*?\n\}/),
    pick(/function DashBusinessSummary\([\s\S]*?\n\}/),
  ].join('\n');
  const js = babel.transformSync(code, { presets: [presetReact], babelrc: false, configFile: false }).code;
  return new Function('React', 'serif', 'dashMoney', 'DASH_MONO_LINK', 'DASH_DEMO_GROWTH', 'DASH_DEMO_FUNNEL', js + '\nreturn DashBusinessSummary;')(
    React, 'serif', money, {}, { trainer: null, nutritionist: null }, null);
}
const esc = (s) => s.replace(/[.$()]/g, '\\$&');

test('the preview states one net on every tab: Today, the sidebar, the KPI strip, Money, the Plan and the 13 weeks', async () => {
  const now = new Date();
  const roster = DashSignals.buildMockClients(now);
  const book = bookOf(roster);
  // The roster has both kinds of client, so a flat rate and a per-client fee are different numbers.
  assert.ok(roster.some((c) => c.payments.feeCents === 0), 'no client in the preview was brought by the coach');
  for (const c of roster.filter((x) => x.payments.feeCents > 0)) {
    assert.equal(c.payments.origin, 'marketplace', c.profile.name + ' pays a fee without having found the coach on Shape');
    assert.equal(c.payments.feeCents, Math.round(c.payments.mrrCents * CF.FEE_RATE), c.profile.name + ' stores a fee that is not the published rate');
  }
  assert.ok(roster.some((c) => c.payments.feeCents > 0), 'no client in the preview found the coach on Shape');
  assert.notEqual(book.net, Math.round(book.gross * (1 - CF.FEE_RATE)), 'the fee mix makes no difference to the net');
  // The shared rule: each row after its own stored fee; a row that stores none nets at the
  // published rate (coach-trajectory.mjs's fallback); an unreadable row is left out.
  assert.equal(DashSignals.rosterNetCents([{ payments: { mrrCents: 10000 } }, { payments: { mrrCents: 20000, feeCents: 0 } }, { payments: { mrrCents: null, feeCents: null } }]),
    Math.round(10000 * (1 - CF.FEE_RATE)) + 20000);

  // Today: the Business card, the KPI strip's net, and the sidebar card's month (demoPayouts).
  const Card = todayCard();
  const card = await mount(React.createElement(Card, { live: null, role: 'trainer', clients: roster }));
  assert.match(card.text(), new RegExp(esc(money(book.net)) + 'Monthly · net'), "Today's card: " + card.text());
  assert.match(card.text(), /after Shape's fee/, 'a net with brought clients in it is not "after 15%"');
  await card.unmount();
  assert.equal(DashSignals.dashKpiValue('monthlyNet', { live: null, clients: roster }).value, book.net, 'the KPI strip');
  const p = DashSignals.demoPayouts(roster, now);
  assert.deepEqual([p.monthlyCents, p.netCents], [book.gross, book.net], 'the sidebar card and the payouts strip');
  // Each past payout is that month's clients after their own fees.
  // ⚠ A JOIN DATE IS A LOCAL DAY, AS THE CODE READS IT (the sweep after #2394 round 10). A bare
  // 'YYYY-MM-DD' parses as UTC midnight, so east of UTC this oracle dropped a client who joined on
  // a month's last day from that month while demoPayoutHistory (local midnight) counted them: red
  // in Berlin and Tokyo on the days a join lands there, green in CI. The fixed day puts one there
  // (Jonah W., joined 30 September) so the boundary is read every day, in every timezone.
  const localDay = (s) => new Date(String(s).length === 10 ? s + 'T00:00:00' : s).getTime();
  const boundary = new Date('2026-10-18T12:00:00');
  const atBoundary = DashSignals.buildMockClients(boundary);
  assert.ok(DashSignals.demoPayoutHistory(atBoundary, boundary, 4).some((r) => atBoundary.some((c) => localDay(c.payments.joinedAt) === r.arrivalDate)),
    'no client joins on a payout day, so the boundary goes unread');
  for (const [at, cs] of [[now, roster], [boundary, atBoundary]]) {
    for (const r of DashSignals.demoPayoutHistory(cs, at, 4)) {
      const joined = cs.filter((c) => localDay(c.payments.joinedAt) <= r.arrivalDate);
      assert.equal(r.amountCents, bookOf(joined).net, 'the payout of ' + new Date(r.arrivalDate).toDateString());
    }
  }

  // Business: the practice the Plan starts from, and the series the Overview and the 13 weeks draw.
  const base = B.dbzPlanBase({ live: false });
  assert.deepEqual([base.clients, base.mrrGrossCents, base.mrrNetCents], [book.clients, book.gross, book.net], "Business's today");
  const weeks = B.dbzDemoTrajectory().weeks;
  for (const w of weeks) {
    assert.ok(Math.abs(w.mrrGrossCents - book.gross * w.active / book.clients) <= 0.5, w.weekOf + ': billed is not the practice at its headcount');
    assert.ok(Math.abs(w.mrrNetCents - book.net * w.active / book.clients) <= 0.5, w.weekOf + ': net is not the practice at its headcount');
  }
  // The origin list is the roster, at the fees it stores, and the Plan's brought share is its share.
  const subs = B.dbzDemoOrigin().filter((r) => r.kind === 'subscription');
  assert.deepEqual(subs.map((r) => r.name), roster.map((c) => c.profile.name), 'the origin list is not the roster');
  // One row a client, in the routes' shape (origin-attribution.ts): each roster client, by their id.
  assert.deepEqual(subs.map((r) => [r.clientId, r.plans, r.mixedFees]), roster.map((c) => [c.profile.id, 1, false]), 'the origin list is not one row a roster client');
  assert.equal(subs.reduce((s, r) => s + Math.round(r.priceCents * (1 - r.feeBps / 10000)), 0), book.net, 'the origin list shows another fee mix');
  assert.equal(base.byoShare, subs.filter((r) => r.feeBps === 0).length / subs.length);
  // The renewals are roster clients, each at their own fee.
  for (const r of B.dbzDemoRenewals()) {
    const c = roster.find((x) => x.profile.name === r.name);
    assert.ok(c, r.name + ' renews but is not on the roster');
    assert.equal(r.netCents, c.payments.mrrCents - c.payments.feeCents, r.name);
  }

  // What the viewer reads: Money's row and the 13 weeks' header, the Plan's sentence, the origin list.
  const read = async (section) => {
    stubPage({ source: 'demo', section });
    globalThis.fetch = window.fetch = answer(401, { error: 'x' });
    const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
    await settle();
    const t = m.text();
    await m.unmount();
    return t;
  };
  const moneyTab = await read('money');
  assert.match(moneyTab, new RegExp("Net a month, at today's clients" + esc(money(book.gross)) + ' billed · ' + esc(money(book.gross - book.net)) + ' Shape fee' + esc(money(book.net))), moneyTab.slice(0, 600));
  assert.match(moneyTab, new RegExp('from your subscriptions · ' + esc(money(book.net)) + ' now'), 'the 13 weeks header');
  const planTab = await read('plan');
  assert.match(planTab, new RegExp('Today you have ' + book.clients + ' clients and net ' + esc(money(book.net)) + ' a month\\.'), planTab.slice(0, 600));
  const growthTab = await read('growth');
  // ⚠ "WHO FOUND WHOM" COUNTS CLIENTS, AND THE ONE-TIME PURCHASE IS NOT ONE (the follow-up to #2395).
  // Its header counted every row, so the brought one-time buyer made it "6 you brought · 5 found
  // you on Shape", eleven beside the Plan's ten. The header is the clients, the Plan's own count and
  // its brought share, and the purchase has a line of its own over its row.
  const origin = B.dbzDemoOrigin();
  const clients = origin.filter((r) => r.kind === 'subscription');
  const purchases = origin.filter((r) => r.kind === 'purchase');
  const brought = clients.filter((r) => r.feeBps === 0).length;
  assert.ok(purchases.length === 1 && purchases[0].feeBps === 0, 'the preview has no brought purchase, so a header that counts one goes unread');
  assert.equal(clients.length, book.clients, "the origin list's clients are not the Plan's");
  assert.equal(base.byoShare, brought / clients.length, "and its brought ones are not the Plan's share");
  assert.match(growthTab, new RegExp('who found whom' + brought + ' you brought · ' + (clients.length - brought) + ' found you on Shape' + esc(roster[0].profile.name)), growthTab.slice(0, 600));
  assert.match(growthTab, new RegExp('fee1 one-time purchase' + esc(purchases[0].name) + 'You brought · 0% fee · one-time'), 'the purchase has no line of its own');
  for (const c of roster) assert.match(growthTab, new RegExp(esc(c.profile.name) + (c.payments.feeCents ? 'Found you on Shape · 15% fee' : 'You brought · 0% fee')), c.profile.name);
});

// ── The follow-up to #2395: "who found whom" counts clients, as the brought-in share does ──
// Its header counted the feed's rows: a client on two plans was two and a one-time purchase one
// more, beside the Plan's per-client "1 of your 2". Mounted on a feed the real fold builds
// (origin-attribution.ts buildOriginFeed), the header is the share's own count (byoMixOf).
const ORIGIN_TS = fileURLToPath(new URL('../src/lib/origin-attribution.ts', import.meta.url));
const originZone = async (byOrigin) => {
  const m = await mount(React.createElement(B.DbzOriginZone, { live: true, byOrigin }));
  // The zone's lines: a count is a line of text, a row is [name, label].
  const lines = [...m.div.firstElementChild.children].map((d) => (d.children.length === 2 ? [d.children[0].textContent, d.children[1].textContent.replace(/\s+/g, ' ').trim()] : d.textContent.trim()));
  await m.unmount();
  return lines;
};

test('"who found whom" counts clients: two plans are one row, a purchase is not a client, and the header is the brought-in share', async () => {
  const { buildOriginFeed, byoMixOf } = await loadRealModule(ORIGIN_TS, { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) });
  // The purchases read answers `rows`; every name is already known, so no one is asked about.
  const db = (rows) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) };
    return { from: () => q, rpc: async () => ({ data: [], error: null }) };
  };
  // Ada was brought and took a second plan from the marketplace; Ben found the coach on Shape; Cleo
  // was brought and holds two plans at 0%. Ada also buys a meal plan, and Pia buys one alone.
  const subs = [
    { client_id: 'a', price_cents: 18000, fee_bps: 1500, origin: 'marketplace' },
    { client_id: 'b', price_cents: 16000, fee_bps: 1500, origin: 'marketplace' },
    { client_id: 'a', price_cents: 6000, fee_bps: 0, origin: 'coach_link' },
    { client_id: 'c', price_cents: 12000, fee_bps: 0, origin: 'coach_link' },
    { client_id: 'c', price_cents: 3000, fee_bps: 0, origin: 'coach_link' },
  ];
  const purchases = [
    { client_id: 'a', price_cents: 9000, fee_bps: 0, origin: 'coach_link' },
    { client_id: 'p', price_cents: 6000, fee_bps: 1500, origin: 'marketplace' },
  ];
  const names = new Map([['a', 'Ada'], ['b', 'Ben'], ['c', 'Cleo'], ['p', 'Pia']]);
  const feed = await buildOriginFeed(db(purchases), 'trainer', 7, subs, names);
  const mix = byoMixOf(subs);
  assert.deepEqual(mix, { clients: 3, brought: 2 });
  assert.deepEqual(await originZone(feed), [
    mix.brought + ' you brought · ' + (mix.clients - mix.brought) + ' found you on Shape',
    // Brought by her 0% plan; her other plan pays 15%, so no one rate is printed as hers.
    ['Ada', 'You brought · 2 plans · different fees'],
    ['Ben', 'Found you on Shape · 15% fee'],
    ['Cleo', 'You brought · 2 plans · 0% fee'],
    '2 one-time purchases',
    ['Ada', 'You brought · 0% fee · one-time'],
    ['Pia', 'Found you on Shape · 15% fee · one-time'],
  ]);
});

test('"who found whom" says a full purchases list is only the latest, and prints no count of purchases it has none of', async () => {
  // The feed reads the latest purchases, newest first; the page's cap is that read's own limit.
  const src = readFileSync(ORIGIN_TS, 'utf8');
  const limit = /\.eq\('status', 'paid'\)\s*\.order\('created_at', \{ ascending: false \}\)\s*\.limit\((\d+)\);/.exec(src);
  assert.ok(limit, "the feed's purchases read moved");
  const cap = /^const DBZ_ORIGIN_PURCHASES = (\d+);/m.exec(readFileSync(ND('dashBusiness.jsx'), 'utf8'));
  assert.ok(cap, "the page has no cap on the purchases it counts");
  const N = Number(cap[1]);
  assert.equal(N, Number(limit[1]), "the page's cap is not the feed's");
  const ada = { name: 'Ada', clientId: 'a', kind: 'subscription', origin: 'coach_link', feeBps: 0, priceCents: 18000, plans: 1, mixedFees: false };
  const bought = (n) => Array.from({ length: n }, (_, i) => ({ name: 'Buyer ' + i, kind: 'purchase', origin: 'marketplace', feeBps: 1500, priceCents: 5000 }));
  const counts = async (feed) => (await originZone(feed)).filter((l) => typeof l === 'string');
  // None: no line. A failed purchases read sends none too, so "0 one-time purchases" would be a claim.
  assert.deepEqual(await counts([ada]), ['1 you brought · 0 found you on Shape']);
  assert.deepEqual(await counts([ada, ...bought(1)]), ['1 you brought · 0 found you on Shape', '1 one-time purchase']);
  assert.deepEqual(await counts([ada, ...bought(N - 1)]), ['1 you brought · 0 found you on Shape', (N - 1) + ' one-time purchases']);
  assert.deepEqual(await counts([ada, ...bought(N)]), ['1 you brought · 0 found you on Shape', 'Your latest ' + N + ' one-time purchases']);
});

// ── The outcomes plate is the same roster (the sweep after #2394 round 10) ──
// Growth's origin list and Money's renewals name Today's ten; Retention's "most consistent" and
// "top weight loss" named six people of their own beside "Active clients 10". Each name is read
// off the mounted plate and looked up on the roster the rest of the preview shows.
test("the preview's roster outcomes are the preview's roster, each on a list their own record fits", async () => {
  const now = new Date();
  const roster = DashSignals.buildMockClients(now);
  const byName = new Map(roster.map((c) => [c.profile.name, c]));
  const weights = {};
  let compared = 0;
  for (const [role, consistentLabel] of [['trainer', 'Most consistent · 30d'], ['nutritionist', 'Most consistent loggers · 30d']]) {
    stubPage({ source: 'demo', section: 'retention' });
    globalThis.fetch = window.fetch = answer(401, { error: 'x' });
    const m = await mount(React.createElement(window.CoachBusinessPage, { role }));
    await settle();
    assert.match(m.text(), /^PREVIEW/, role);
    const list = (label) => {
      const head = [...m.div.querySelectorAll('div')].find((d) => d.children.length === 0 && d.textContent.trim() === label);
      assert.ok(head, role + ': the plate has no "' + label + '" list');
      return [...head.parentElement.querySelectorAll(':scope > div > span:first-child')].map((s) => [s.textContent.trim(), s.nextElementSibling.textContent.trim()]);
    };
    const losers = list('Top weight loss · 30d');
    const consistent = list(consistentLabel);
    assert.ok(losers.length > 0 && consistent.length > 0, role + ': an empty list proves nothing');
    for (const [name] of [...losers, ...consistent]) {
      const c = byName.get(name);
      assert.ok(c, role + ': ' + name + ' is on the outcomes plate but not on the roster Today and Growth name');
      // A 30-day figure needs 30 days with the coach (Tess B. joined five days ago).
      const days = (now.getTime() - new Date(c.payments.joinedAt + 'T00:00:00').getTime()) / 86400000;
      assert.ok(days >= 30, role + ': ' + name + ' has a 30-day figure after ' + Math.floor(days) + ' days');
    }
    // A stalled weight (Marcus T., 181.5 to 181.4 lb) is not a weight loss.
    assert.ok(!losers.some(([n]) => n === 'Marcus T.'), role + ': the stalled weight is a top weight loss');
    // A person's 30-day weight change is one fact: the trainer's preview and the nutritionist's
    // read the same one.
    for (const [n, w] of losers) {
      if (weights[n] != null) { compared++; assert.equal(w, weights[n], n + "'s 30 days: one weight change on one preview, another on the other"); }
      weights[n] = w;
    }
    await m.unmount();
  }
  assert.ok(compared > 0, "no one is on both previews' weight lists, so the one-weight rule goes unread");
});

test("the preview's practice falls back to what the roster would have returned, and lists no one it can't read", () => {
  const b = bookOf(DashSignals.buildMockClients(new Date()));
  const want = { clients: b.clients, grossCents: b.gross, netCents: b.net };
  assert.deepEqual(B.dbzDemoBook(), want);
  // dashBusiness can render before dashSignals is up (dbzDemoRosterSize's rule).
  const saved = globalThis.DashSignals;
  try {
    delete globalThis.DashSignals;
    assert.deepEqual(B.dbzDemoBook(), want, 'the fallback is not the practice dashSignals would have returned');
    assert.deepEqual(B.dbzDemoOrigin().map((r) => r.kind), ['purchase'], 'with no roster, the origin list invents subscribers');
    for (const role of ['trainer', 'nutritionist']) assert.deepEqual(B.DBZ_DEMO_OUTCOMES[role].roster, [], role + ': with no roster, the outcomes plate invents people');
    // A row whose roster client is gone is not listed, under no name or another's.
    globalThis.DashSignals = { ...saved, buildMockClients: (d) => saved.buildMockClients(d).filter((c) => c.profile.id !== 'demo-5') };
    const left = new Set(globalThis.DashSignals.buildMockClients(new Date()).map((c) => c.profile.name));
    for (const role of ['trainer', 'nutritionist']) {
      const rows = B.DBZ_DEMO_OUTCOMES[role].roster;
      assert.ok(rows.length > 0, role);
      for (const r of rows) assert.ok(left.has(r.name), role + ': "' + r.name + '" is listed but not on the roster');
    }
  } finally {
    globalThis.DashSignals = saved;
  }
});

test('while the analytics are out, a dashboard that fell back to its demo is loading, never the preview', async () => {
  const LOADING = {
    overview: [/Your trajectory loads with the analytics rollup/],
    money: [/Your payouts load with the analytics rollup/, /Your renewals load with the analytics rollup/, /Loads with the analytics rollup/],
    plan: [/Your numbers load with the analytics rollup/],
    growth: [/Your funnel is loading/, /Where your clients came from loads with the analytics rollup/, /Loads with your listing/],
    retention: [/Loads with the analytics rollup/, /Roster outcomes load with the analytics rollup/, /Your cancellations load with the analytics rollup/],
  };
  for (const section of SECTIONS) {
    const seen = stubPage({ source: 'demo', section });
    globalThis.fetch = window.fetch = () => new Promise(() => {});
    const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
    await settle();
    const t = m.text();
    assert.doesNotMatch(t, DEMO, section + ': ' + t.slice(0, 400));
    assert.doesNotMatch(t, /Couldn't read|could not be read|No cancellations on record|Origin labels land here/, section + ': still loading is not a failed or empty read');
    for (const re of LOADING[section]) assert.match(t, re, section + ': ' + t.slice(0, 400));
    assert.deepEqual([seen.card.amount, seen.card.sub], ['—', 'loads with the analytics rollup']);
    await m.unmount();
  }
});

test('a "signed out" analytics answer is a preview only when the dashboard resolved one', async () => {
  const signedOut = (url) => (url.startsWith('/api/trainer/analytics') ? answer(401, { error: 'x' })() : new Promise(() => {}));
  // The dashboard hasn't answered yet: still loading, not a preview and not a failed read.
  for (const section of ['money', 'growth']) {
    stubPage({ source: null, section });
    globalThis.fetch = window.fetch = signedOut;
    const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
    await settle();
    assert.doesNotMatch(m.text(), /PREVIEW|is coming to you|DEMO FUNNEL|Couldn't read/, section + ': ' + m.text().slice(0, 300));
    assert.match(m.text(), section === 'money' ? /Your payouts load with the analytics rollup/ : /Your funnel is loading/);
    await m.unmount();
  }
  // The dashboard resolved a coach (its roster read, or its own feed): an unread state, not loading forever.
  for (const [source, today] of [['live', null], ['demo', { kind: 'live', funnel: null }]]) {
    stubPage({ source, today, section: 'money' });
    globalThis.fetch = window.fetch = signedOut;
    const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
    await settle();
    assert.doesNotMatch(m.text(), /PREVIEW|is coming to you|loads? with/, source + ': ' + m.text().slice(0, 300));
    assert.match(m.text(), /Couldn't read your payouts just now/, source);
    await m.unmount();
  }
});

// useDashboard sets source "live" (and `today`) in one setState once the roster AND dashboard reads
// have both settled, so a live coach with no feed is a coach whose feed failed: the analytics read,
// still out, cannot make them a preview, and the funnel (fed by the dashboard, not the analytics)
// says it couldn't be read rather than loading until an unrelated read answers.
test('a live coach whose dashboard feed failed is told the funnel could not be read, without waiting on the analytics', async () => {
  stubPage({ source: 'live', section: 'growth' });
  globalThis.fetch = window.fetch = () => new Promise(() => {});
  const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
  await settle();
  const t = m.text();
  assert.match(t, /Couldn't read your funnel just now/, t.slice(0, 400));
  assert.doesNotMatch(t, /Your funnel is loading|DEMO FUNNEL|PREVIEW/, t.slice(0, 400));
  // The zone the analytics feed is still loading: only the funnel had its answer.
  assert.match(t, /Where your clients came from loads with the analytics rollup/);
  await m.unmount();
});

// ── The whole page: the waiting list is valued at the listing price alone (Codex round 7, #2394) ──
// The card was handed the Plan's starting rate, which falls back to the clients' average ($180
// here) when the listing price is unread or unset, and printed it as what the waiting members
// would pay.
test('the waiting list is valued at the listing price, and says why when there is none to value it at', async () => {
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.now() - (12 - i) * 7 * 86400000);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { weekOf: d.toISOString().slice(0, 10), active: 10, added: 0, ended: 0, mrrNetCents: 10 * 15300, mrrGrossCents: 10 * 18000 };
  });
  const analytics = { isTrainer: true, providerId: 7, metrics: {}, byOrigin: [], byoMix: { clients: 10, brought: 0 }, trajectory: { weeks, firstSubAt: weeks[0].weekOf + 'T00:00:00Z' }, renewals: [], churn: [], stripe: { connected: false } };
  const answer = (d) => Promise.resolve({ ok: true, json: () => Promise.resolve(d) });
  for (const [why, listingAnswer, re] of [
    ['the listing read failed', () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }), /2 people are waiting to join you\. Couldn't read your listing price just now, so they aren't valued here\./],
    ['no listing price yet', () => answer({ listings: [] }), /2 people are waiting to join you\. Set a monthly price on your Profile to see what they'd bring in\./],
    ['a listing at $200', () => answer({ listings: [{ role: 'trainer', monthly: 200, ready: true }] }), new RegExp("2 people are waiting to join you\\. If they all join at \\$200 a month, that's about " + money(CF.earn({ clients: 2, priceCents: 20000, byoShare: 0 }).netCents).replace(/[$.,]/g, (c) => '\\' + c) + ' a month to you\\.')],
  ]) {
    stubPage({ source: 'live', section: 'growth' });
    globalThis.fetch = window.fetch = (url) => {
      if (url.startsWith('/api/trainer/analytics')) return answer(analytics);
      if (url.startsWith('/api/coach/listing')) return listingAnswer();
      if (url.startsWith('/api/coach/capacity')) return answer({ listings: [{ role: 'trainer', waiting: 2 }] });
      return Promise.reject(new Error('unexpected ' + url));
    };
    const m = await mount(React.createElement(window.CoachBusinessPage, { role: 'trainer' }));
    await settle();
    await settle();
    const t = m.text().replace(/&#x27;/g, "'");
    assert.match(t, re, why + ': ' + t.slice(t.indexOf('waiting'), t.indexOf('waiting') + 240));
    assert.doesNotMatch(t, /join at \$180/, why + ': the clients\' average is not the price they would pay');
    await m.unmount();
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
