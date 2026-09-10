// The signed-out preview must agree with itself (review 2026-09-09, V5).
//
// ⚠ IT IS WHAT A PROSPECTIVE COACH EVALUATES THE PRODUCT ON. It used to show, on
// adjacent tabs of one account: "34 active clients" on Business and ten on Today; and on
// ONE screen "$18,420 · Month to date" in the sidebar beside "$1,820 monthly recurring"
// from those same ten clients, with a payout date frozen at "APR 30" under a dateline
// that renders today.
//
// Every figure now derives from one anchor — the demo roster's own MRR — so this guard
// DRIVES the derivation rather than pinning the numbers it happens to produce.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const DS = require_('../public/newdesign/dashSignals.js');
const DATA = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');
const TODAY = readFileSync(new URL('../public/newdesign/dashToday.jsx', import.meta.url), 'utf8');
const NAV = readFileSync(new URL('../public/newdesign/coachNav.jsx', import.meta.url), 'utf8');
const BIZ = readFileSync(new URL('../public/newdesign/dashBusiness.jsx', import.meta.url), 'utf8');

function fn(src, name, deps) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' moved');
  let d = 0, seen = false, k = at;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') { d++; seen = true; } else if (c === '}') { d--; if (seen && !d) { k++; break; } } }
  const names = Object.keys(deps || {});
  return new Function(...names, src.slice(at, k) + '\nreturn ' + name + ';')(...names.map((n) => deps[n]));
}
// ⚠ REQUIRED, NOT EXTRACTED. `dashDemoPayouts` moved out of dashData.jsx into the pure
// engine on 2026-09-10 (CodeRabbit, #2027), which is the point of the move: it is now
// the SHIPPED function under a real require(), not a brace-matched copy of one.
const payouts = DS.demoPayouts;
const roster = (now) => DS.buildMockClients(now);
const mrrOf = (cs) => cs.reduce((s, c) => s + ((c.payments && c.payments.mrrCents) || 0), 0);

test('every preview money figure derives from the roster on the page', () => {
  const now = new Date('2026-09-10T12:00:00');
  const cs = roster(now);
  const p = payouts(cs, now);
  assert.equal(p.monthlyCents, mrrOf(cs), 'monthly recurring is not the roster it claims to sum');
  assert.equal(p.netCents, Math.round(p.monthlyCents * 0.85), 'net is not monthly after the 15% fee the label states');
  // month-to-date and the settled balance are FRACTIONS of the month, in order
  assert.ok(p.thisMonthCents > 0 && p.thisMonthCents < p.netCents, 'month-to-date is not inside the month');
  assert.ok(p.balanceCents <= p.thisMonthCents, 'more is settled than has been earned');
  // ⚠ AND THE FRACTION IS OF **NET**, WHICH THE ORDERING ABOVE CANNOT SEE. Measured:
  // recomputing month-to-date off GROSS survived every assertion here, because ten
  // thirtieths of gross is still comfortably less than net. What the coach is owed is
  // what is left after the platform fee, so the identity is pinned, not the ordering.
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  assert.equal(p.thisMonthCents, Math.round((p.netCents * now.getDate()) / days),
    'month-to-date is a slice of gross, so the preview promises money the fee has taken');
  assert.equal(p.balanceCents, Math.round((p.netCents * Math.max(0, now.getDate() - 7)) / days),
    'the settled balance ignores the holding period it exists to represent');
  // and on the first week of a month nothing has settled yet
  assert.equal(payouts(cs, new Date('2026-09-04T12:00:00')).balanceCents, 0);
  // lifetime is measured from the roster's own joinedAt, never picked
  assert.equal(p.lifetimeCents, p.netCents * p.months);
  assert.ok(p.months >= 1, 'a practice with no dated clients invents a history');
  // ⚠ AND `months` MUST TRACK THE ROSTER, not sit at whatever the mock happens to be.
  // Measured: `lifetimeCents = netCents * 24` SURVIVED here, because the demo roster is
  // 24 months old — a mutation that is a no-op on the fixture tests nothing.
  const young = [{ payments: { mrrCents: 10000, joinedAt: '2026-07-10' } }];
  const yp = payouts(young, now);
  assert.equal(yp.months, 2, 'the practice age is not measured from joinedAt');
  assert.equal(yp.lifetimeCents, yp.netCents * 2);
  const old10y = [{ payments: { mrrCents: 10000, joinedAt: '2016-09-10' } }];
  assert.equal(payouts(old10y, now).months, 120);
});

test('a roster of a different size moves every figure with it', () => {
  // ⚠ THE POINT IS THE DERIVATION, NOT THE NUMBERS. A guard that pinned "$1,820" would
  // pass a hardcoded literal that happens to match today's mock.
  const now = new Date('2026-09-10T12:00:00');
  const half = roster(now).slice(0, 5);
  const a = payouts(roster(now), now);
  const b = payouts(half, now);
  assert.equal(b.monthlyCents, mrrOf(half));
  assert.ok(b.monthlyCents < a.monthlyCents && b.netCents < a.netCents && b.lifetimeCents < a.lifetimeCents,
    'halving the roster changed nothing — the figures are not derived');
  // and an empty practice claims nothing
  const z = payouts([], now);
  assert.equal(z.monthlyCents, 0);
  assert.equal(z.lifetimeCents, 0);
  assert.equal(z.months, 1, 'an empty roster invented a history');
});

test('the payout date moves with the clock instead of sitting in April', () => {
  for (const [iso, label, days] of [
    ['2026-09-10T12:00:00', 'SEP 30', 20],
    ['2026-02-05T12:00:00', 'FEB 28', 23],
    ['2026-12-31T12:00:00', 'DEC 31', 0],
  ]) {
    const now = new Date(iso);
    const p = payouts(roster(now), now);
    assert.equal(p.payoutLabel, label, iso + ' pays out on the wrong date');
    assert.equal(p.daysToPayout, days, iso + ' counts down wrong');
  }
  // nothing anywhere still hardcodes the April placeholders or the old figures
  for (const [name, src] of [['dashToday', TODAY], ['coachNav', NAV]]) {
    const s = stripComments(src);
    for (const dead of ['APR 30', 'Apr 21', '$18,420', '$11,240', '$4,192', '$2,948', '$2,847.50', '$38,420', '$24,160', '$1,864']) {
      assert.ok(!s.includes(dead), name + ' still carries the frozen literal ' + dead);
    }
  }
});

test('the demo card and the payouts strip are lazy, because they load before the engine', () => {
  // coachNav.jsx is script #55 and dashSignals.js is #56 — a module-scope call reads
  // undefined. Getters and memoized functions evaluate at render instead.
  const nav = stripComments(NAV);
  assert.match(nav, /get amount\(\) \{ return coachDemoPayoutCard\(\)\.amount; \}/);
  assert.match(nav, /demo: true/, 'the demo mark is gone — DashSidebar can no longer tell a demo card from a real one');
  assert.match(nav, /const trainerPayoutCard = coachPayoutCardDemo;/);
  assert.match(nav, /const nutriPayoutCard = coachPayoutCardDemo;/);
  const today = stripComments(TODAY);
  assert.match(today, /mockKpis: \(\) => dashDemoKpis\(\)/, 'the payouts strip is a frozen array again');
  assert.equal((today.match(/mockKpis: \(\) => dashDemoKpis\(\)/g) || []).length, 2, 'one role still has its own strip');
  assert.match(today, /cfg\.mockKpis\(\)/, 'the call site did not follow the strip');
  // both caches key on the DAY, or a tab open past midnight quotes yesterday
  for (const [name, src] of [['coachNav', nav], ['dashToday', today]]) {
    assert.match(src, /toDateString\(\)/, name + ' memoizes without a day key');
  }
});

test('the demo calendar lands on this week, and its payout row follows the strip', () => {
  // ⚠ 48 ENTRIES WERE FROZEN IN APRIL 2026 under a dateline that renders today, and two
  // of them quoted payout figures the strip beside them no longer shows.
  // the base Monday is read from the SOURCE, not restated here — a copy would let the
  // two drift and the guard would still pass
  const base = (/const DASH_DEMO_CAL_BASE = "([\d-]+)"/.exec(TODAY) || [])[1];
  assert.ok(base, 'DASH_DEMO_CAL_BASE moved');
  assert.equal(new Date(base + 'T00:00:00').getDay(), 1, 'the demo block no longer starts on a Monday — the shift assumes it does');
  const cal = fn(TODAY, 'dashDemoCalendar', {
    dashDemoPayouts: payouts,
    DashSignals: DS,
    dashMoney: (c) => '$' + Math.round(c / 100).toLocaleString('en-US'),
    DASH_DEMO_CAL_BASE: base,
    _dashDemoCal: null,     // the memo is a module binding; a fresh one per call is fine here
  });
  const rows = [
    { date: '2026-04-13', time: '07:00', kind: 'SESSION', title: 'Priya S. · Lower pull', sub: 'Remote' },
    { date: '2026-04-18', time: '09:30', kind: 'SESSION', title: 'Deandre K.', sub: 'Brooklyn' },
    { date: '2026-04-16', time: '15:00', kind: 'ADMIN', title: 'Payout review', sub: '' },
    { date: '2026-04-21', time: '10:00', kind: 'ADMIN', title: 'Payout day', sub: '' },
  ];
  for (const iso of ['2026-09-10T12:00:00', '2027-01-02T12:00:00', '2026-03-01T12:00:00']) {
    const now = new Date(iso);
    const out = cal(rows, now);
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const d0 = new Date(out[0].date + 'T00:00:00');
    assert.equal(d0.getTime(), monday.getTime(), iso + ': the block did not land on this week');
    // the WEEKDAY pattern survives the shift — Sat stays Sat
    const src1 = new Date('2026-04-18T00:00:00'), got1 = new Date(out[1].date + 'T00:00:00');
    assert.equal(got1.getDay(), src1.getDay(), iso + ': a weekday moved');
    // the payout row sits on the derived payout date and quotes the derived figure
    const p = payouts(roster(now), now);
    const payoutRow = out.find((e) => e.title === 'Payout day');
    assert.equal(new Date(payoutRow.date + 'T00:00:00').getDate(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      iso + ': the payout row is not on the payout date');
    assert.match(payoutRow.sub, /^\w{3} \d+ · \$/, iso + ': the payout row does not quote a derived figure: ' + payoutRow.sub);
    assert.ok(!/Apr 21|2,847|1,864/.test(out.map((e) => e.sub).join(' ')), iso + ': an April literal survived');
    assert.equal(out.find((e) => e.title === 'Payout review').sub, 'This cycle');
  }
  // ⚠ AND THE PAGE HAS TO CALL IT. Measured: reverting the call site to `cfg.mockCalendar`
  // SURVIVED, because every assertion above drives the function directly — a shift nobody
  // applies leaves April on the screen.
  const src = stripComments(TODAY);
  assert.match(src, /: dashDemoCalendar\(cfg\.mockCalendar\);/, 'the page renders the unshifted April calendar');
  assert.ok(!/: cfg\.mockCalendar;/.test(src), 'the raw demo calendar is still rendered somewhere');
});

test('Business shows the same practice as Today', () => {
  // ⚠ TWO INTERNALLY-COHERENT DEMO DATASETS THAT CONTRADICT EACH OTHER on adjacent tabs
  // is worse than either alone. Business said 34 (trainer) and 28 (nutritionist).
  const biz = stripComments(BIZ);
  assert.ok(!/activeClients: 34/.test(biz), 'Business still claims 34 active clients');
  assert.ok(!/activeClients: 28/.test(biz), 'Business still claims 28 active clients');
  assert.equal((biz.match(/get activeClients\(\) \{ return dbzDemoRosterSize\(\); \}/g) || []).length, 2,
    'a role still carries a literal client count');
  assert.match(biz, /function dbzDemoRosterSize\(\)[\s\S]{0,220}buildMockClients/);
  // the growth walk lands on the roster and its flows are summed from the series
  assert.match(biz, /const target = dbzDemoRosterSize\(\);/);
  assert.match(biz, /addsThisMonth: weeks\.slice\(-4\)\.reduce/, 'the monthly flows are literals beside the series again');
  assert.ok(!/addsThisMonth: 3/.test(biz), 'addsThisMonth is a literal again');
  // and the trajectory is lazy for the same read-time reason as the card
  assert.match(biz, /function dbzDemoTrajectory\(\)/);
  assert.ok(!/const DBZ_DEMO_TRAJECTORY = \(\(\) =>/.test(biz), 'the trajectory is built at module load again');
});

// ── the card's dependency actually reaches every page that renders it ────────
// ⚠ THIS IS THE GUARD THAT WAS MISSING, AND THE DEFECT IT CLOSES WAS INVISIBLE BY
// DESIGN. `coachDemoPayoutCard` catches and returns "PAYOUTS · —", which is the right
// answer for "nothing to derive from" and the WRONG one for "this page never loaded the
// script" — the two are indistinguishable on screen. Ten pages were in the second state.
// A page is checked by what it DOES (renders a coach payout card, directly or through a
// module it loads), never by its name.
test('every page that renders a coach payout card loads the engine at all', () => {
  const dir = new URL('../public/newdesign/', import.meta.url);
  const names = readdirSync(dir).filter((f) => f.endsWith('.html'));
  assert.ok(names.length > 40, 'the sweep found no pages to scan');

  // which shared modules reference the card at all — derived, not listed
  const jsx = readdirSync(dir).filter((f) => f.endsWith('.jsx'));
  const cardModules = jsx.filter((f) =>
    /\b(trainerPayoutCard|nutriPayoutCard|coachPayoutCardDemo)\b/.test(
      stripComments(readFileSync(new URL(f, dir), 'utf8'))));
  assert.ok(cardModules.length > 3, 'no module references the payout card — the sweep is looking for the wrong name');

  let renders = 0, stubs = 0;
  for (const f of names) {
    const raw = readFileSync(new URL(f, dir), 'utf8');
    if (!raw.includes('coachNav.jsx')) continue;
    // a redirect stub navigates away in <head> and renders nothing
    const head = raw.slice(0, raw.toLowerCase().indexOf('</head>') + 7 || 2000);
    if (/location\.replace\(/.test(head)) { stubs += 1; continue; }
    const inline = /\b(trainerPayoutCard|nutriPayoutCard)\b/.test(raw);
    const viaModule = cardModules.some((m) => raw.includes(m));
    if (!inline && !viaModule) continue;
    renders += 1;
    // ⚠ PRESENCE, NOT ORDER — AND MY FIRST CUT OF THIS GUARD ASSERTED ORDER AND FAILED
    // CORRECT CODE. All three shells load `dashSignals.js` AFTER `coachNav.jsx` and are
    // right to: the card's properties are GETTERS, so nothing is read until render, by
    // which time every tag has run. Ordering is not even well defined here — the engine
    // is a plain <script> and coachNav is `type="text/babel"`, which @babel/standalone
    // defers, so the babel module runs last whatever the file says. What the page must
    // have is the script; the laziness that makes that sufficient is pinned below.
    assert.ok(raw.includes('dashSignals.js'), f + ' renders a coach payout card but never loads dashSignals.js');
  }
  assert.ok(renders >= 8, 'only ' + renders + ' payout-card pages were checked — the sweep scanned nothing');
  assert.ok(stubs > 0, 'no redirect stubs were recognised — the classifier stopped working');
});

test('the card reaches into ONE module, so one script tag is the whole dependency', () => {
  const nav = stripComments(NAV);
  const body = nav.slice(nav.indexOf('function coachDemoPayoutCard'), nav.indexOf('const coachPayoutCardDemo'));
  assert.match(body, /DashSignals\.demoPayoutCard\(now\)/);
  // the three-module reach that caused the defect must not come back
  assert.ok(!/dashDemoPayouts|dashMoney|buildMockClients/.test(body),
    'the payout card reached back into dashData.jsx or dashToday.jsx');
  // and the derivation really is in the engine, require()-able
  assert.equal(typeof DS.demoPayoutCard, 'function');
  // ⚠ AND THE CARD'S PROPERTIES MUST STAY GETTERS. Evaluating them at module scope
  // would read `DashSignals` before it exists on all three shells — which is what makes
  // presence, rather than order, the right requirement one test up.
  const decl = nav.slice(nav.indexOf('const coachPayoutCardDemo'), nav.indexOf('const trainerPayoutCard'));
  for (const k of ['label', 'amount', 'sub']) {
    assert.match(decl, new RegExp('get ' + k + '\\(\\) \\{ return coachDemoPayoutCard\\(\\)\\.' + k),
      'the payout card evaluates ' + k + ' at module scope');
  }
  assert.match(decl, /demo: true/, 'the demo marker is gone — a clone would show invented money to a live coach');
  assert.ok(!/function dashDemoPayouts\(/.test(stripComments(DATA)), 'dashDemoPayouts is back in dashData.jsx');
  const card = DS.demoPayoutCard(new Date('2026-09-10T12:00:00'));
  assert.match(card.label, /^PAYOUT [A-Z]{3} \d{1,2}$/);
  assert.match(card.amount, /^\$[\d,]+$/);
  assert.match(card.sub, /^Month to date · (pays out today|in \d+ days?)$/);
  // it agrees with the strip beside it: month-to-date is a slice of net, never of gross
  const now = new Date('2026-09-10T12:00:00');
  const p = DS.demoPayouts(DS.buildMockClients(now), now);
  assert.ok(p.thisMonthCents < p.netCents && p.netCents < p.monthlyCents);
  assert.equal(card.amount, '$' + Math.round(p.thisMonthCents / 100).toLocaleString());
});
