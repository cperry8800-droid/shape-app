// The Business page's Plan tab math (public/newdesign/coachForecast.js; design E, owner
// 2026-10-17: "forecast on business"). Every figure the tab prints comes from these functions,
// so each is driven here with numbers worked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PLATFORM_FEE_RATE } from '../src/lib/platform-fee.mjs';

const require_ = createRequire(import.meta.url);
const CF = require_('../public/newdesign/coachForecast.js');
const DAY = 86400000;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("the fee is Shape's one rate, read from the platform-fee module's number", () => {
  assert.equal(CF.FEE_RATE, PLATFORM_FEE_RATE);
});

test('netOf: 15% off a client who found the coach on Shape, nothing off one the coach brought', () => {
  near(CF.netOf(18000, 0), 15300);
  near(CF.netOf(18000, 1), 18000);
  near(CF.netOf(18000, 0.25), 18000 * (1 - 0.75 * 0.15));
  // Out-of-range shares are clamped, not extrapolated into a negative fee.
  near(CF.netOf(18000, 2), 18000);
  near(CF.netOf(18000, -1), 15300);
  near(CF.netOf(-5, 0), 0);
});

test('earn: 20 clients at $180 with a quarter brought by the coach', () => {
  const e = CF.earn({ clients: 20, priceCents: 18000, byoShare: 0.25 });
  assert.equal(e.grossCents, 360000);
  assert.equal(e.netCents, Math.round(20 * 18000 * (1 - 0.75 * 0.15)));   // 319500
  assert.equal(e.feeCents, e.grossCents - e.netCents);
  assert.equal(e.yearNetCents, e.netCents * 12);
});

test('forecast: row 0 is today, then today\'s clients fade by churn and new ones join at the new rate', () => {
  const f = CF.forecast({ clients: 10, mrrNetCents: 150000, priceCents: 20000, byoShare: 0, adds: 2, churn: 0.1, months: 3 });
  assert.equal(f.rows.length, 4);
  assert.deepEqual(f.rows[0], { m: 0, clients: 10, netCents: 150000 });
  // Month 1: 10 × 0.9 = 9 of today's, at 150000 × 0.9; plus 2 new at 17000 net each.
  near(f.rows[1].clients, 11);
  near(f.rows[1].netCents, 135000 + 2 * 17000);
  // Month 2: 8.1 of today's; the 2 new fade to 1.8 and 2 more join.
  near(f.rows[2].clients, 8.1 + 3.8);
  near(f.rows[2].netCents, 121500 + 3.8 * 17000);
  near(f.perNewCents, 17000);
  near(f.steadyClients, 20);
  near(f.steadyNetCents, 20 * 17000);
});

test('forecast: with no churn nothing levels off, and the count only climbs', () => {
  const f = CF.forecast({ clients: 4, mrrNetCents: 60000, priceCents: 15000, byoShare: 0, adds: 1, churn: 0, months: 12 });
  assert.equal(f.steadyClients, null);
  assert.equal(f.steadyNetCents, null);
  near(f.rows[12].clients, 16);
});

test('earnedOver sums months 1..n, not today', () => {
  const f = CF.forecast({ clients: 1, mrrNetCents: 1000, priceCents: 0, byoShare: 0, adds: 0, churn: 0, months: 12 });
  assert.equal(CF.earnedOver(f, 12), 12000);
  assert.equal(CF.earnedOver(f, 3), 3000);
});

test('monthsTo: the first month at or past the goal; 0 when already there; null when never', () => {
  const f = CF.forecast({ clients: 10, mrrNetCents: 150000, priceCents: 20000, byoShare: 0, adds: 2, churn: 0.05, months: 36 });
  const m = CF.monthsTo(200000, f);
  assert.ok(m > 0 && f.rows[m].netCents >= 200000 && f.rows[m - 1].netCents < 200000, `month ${m}`);
  assert.equal(CF.monthsTo(100000, f), 0);
  assert.equal(CF.monthsTo(10_000_000, f), null);
  assert.equal(CF.monthsTo(0, f), null);
  assert.equal(CF.monthsTo(null, f), null);
});

// Weekly buckets ending on the Monday of `now`'s week, oldest first.
function weeksTo(now, n, fill) {
  const monday = new Date(now); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    return { weekOf: new Date(monday.getTime() - k * 7 * DAY).toISOString().slice(0, 10), ...fill(i, n) };
  });
}

test('paceFrom: adds and churn a month over the last three months, churn against the average headcount', () => {
  const now = Date.UTC(2026, 9, 17, 12);   // a Saturday
  // 104 weeks; in the last 14 there are 6 joins and 2 departures, with 10 active throughout.
  const weeks = weeksTo(now, 104, (i, n) => ({ active: 10, added: i >= n - 14 && i % 2 === 0 && i < n - 2 ? 1 : 0, ended: i === n - 3 || i === n - 6 ? 1 : 0 }));
  const p = CF.paceFrom({ weeks, firstSubAt: '2025-01-01T00:00:00Z' }, now);
  assert.equal(p.fromFirst, false);
  // The window opens on the Monday of the week holding now − 91 days (Saturday 2026-07-18 →
  // Monday 2026-07-13), and the rates are taken over the span from that Monday to now.
  const open = Date.UTC(2026, 6, 13);
  assert.equal(p.days, Math.round((now - open) / DAY));
  const inWin = weeks.filter((w) => Date.parse(w.weekOf + 'T00:00:00Z') >= open);
  assert.equal(inWin[0].weekOf, '2026-07-13');
  const span = (now - open) / DAY / 30.4;
  const added = inWin.reduce((s, w) => s + w.added, 0);
  assert.equal(p.added, added);
  assert.equal(p.ended, 2);
  near(p.adds, added / span);
  near(p.churn, 2 / 10 / span);
  near(p.avgActive, 10);
});

test('paceFrom: a practice younger than three months reads after its first week; a month after it is needed', () => {
  const now = Date.UTC(2026, 9, 17, 12);     // a Saturday
  // The first week holds the opening roster (3 at once); one more joins three weeks ago.
  const weeks = weeksTo(now, 104, (i, n) => ({ active: i >= n - 3 ? 4 : i >= n - 7 ? 3 : 0, added: i === n - 7 ? 3 : i === n - 3 ? 1 : 0, ended: 0 }));
  const first = new Date(Date.parse(weeks[104 - 7].weekOf + 'T00:00:00Z') + DAY).toISOString();
  const p = CF.paceFrom({ weeks, firstSubAt: first }, now);
  assert.equal(p.fromFirst, true);
  const from = Date.parse(weeks[104 - 6].weekOf + 'T00:00:00Z');   // the Monday after the first week
  assert.equal(p.added, 1, 'the opening three are where the practice started, not its pace');
  near(p.adds, 1 / ((now - from) / DAY / 30.4));
  assert.equal(p.churn, 0, 'nobody left: a measured zero, not "unknown"');
  const young = CF.paceFrom({ weeks, firstSubAt: new Date(now - 10 * DAY).toISOString() }, now);
  assert.equal(young.adds, null);
  assert.equal(young.churn, null);
  assert.equal(CF.paceFrom(null, now).adds, null);
  assert.equal(CF.paceFrom({ weeks: [] }, now).churn, null);
});

test('paceFrom: a coach who brings their roster on day one is not adding it every month', () => {
  // Twelve brought in the first week, 35 days ago, and one client from Shape ten days ago.
  const now = Date.UTC(2026, 9, 17, 12);     // a Saturday
  const first = now - 35 * DAY;              // Saturday 2026-09-12, in the week of Monday 09-07
  const weeks = weeksTo(now, 104, (i, n) => ({ active: i >= n - 2 ? 13 : i >= n - 6 ? 12 : 0, added: i === n - 6 ? 12 : i === n - 2 ? 1 : 0, ended: 0 }));
  assert.equal(weeks[104 - 6].weekOf, '2026-09-07');
  const p = CF.paceFrom({ weeks, firstSubAt: new Date(first).toISOString() }, now);
  const from = Date.UTC(2026, 8, 14);
  assert.equal(p.added, 1);
  near(p.adds, 1 / ((now - from) / DAY / 30.4));
  assert.ok(p.adds < 1, 'about one a month, not eleven');
});

test('paceFrom: the month of history is counted from the end of the first week', () => {
  // Codex, #2394: a first client on a Sunday, 27 days before a Saturday, sits in a week that
  // opens 33 days back. That is still under a month, so it is no pace; and so is a first client
  // on a Wednesday 31 days back, whose first week ends 26.5 days before now.
  const now = Date.UTC(2026, 9, 17, 12);     // a Saturday
  const weeks = weeksTo(now, 104, (i, n) => ({ active: i >= n - 6 ? 1 : 0, added: i === n - 5 ? 1 : 0, ended: 0 }));
  assert.equal(weeks[104 - 5].weekOf, '2026-09-14');
  for (const first of [Date.UTC(2026, 8, 20, 12), Date.UTC(2026, 8, 16, 12)]) {
    const p = CF.paceFrom({ weeks, firstSubAt: new Date(first).toISOString() }, now);
    assert.equal(p.fromFirst, true);
    assert.equal(p.adds, null);
    assert.equal(p.churn, null);
  }
  // A first week that ended 33.5 days ago is a month of history: a measured pace, over those days.
  const p = CF.paceFrom({ weeks, firstSubAt: new Date(Date.UTC(2026, 8, 9, 12)).toISOString() }, now);
  assert.equal(p.days, Math.round((now - Date.UTC(2026, 8, 14)) / DAY));
  near(p.adds, 1 / ((now - Date.UTC(2026, 8, 14)) / DAY / 30.4));
  assert.equal(p.churn, 0, 'nobody left: a measured zero');
});

test('paceFrom: a first week that falls just inside the three months is still the opening roster', () => {
  // The first client was 95 days ago, past the 91, but in the window's first week.
  const now = Date.UTC(2026, 9, 17, 12);
  const weeks = weeksTo(now, 104, (i, n) => ({ active: i >= n - 14 ? 10 : 0, added: i === n - 14 ? 10 : i === n - 4 ? 1 : 0, ended: 0 }));
  assert.equal(weeks[104 - 14].weekOf, '2026-07-13');
  const p = CF.paceFrom({ weeks, firstSubAt: new Date(Date.UTC(2026, 6, 14, 12)).toISOString() }, now);
  assert.equal(p.fromFirst, true);
  assert.equal(p.added, 1);
});

test('paceFrom: a practice with no clients yet has no pace, not a pace of 0', () => {
  // Codex-style sweep, #2394: three empty months read as "0 a month over the last 3 months".
  const now = Date.UTC(2026, 9, 17, 12);
  const weeks = weeksTo(now, 104, () => ({ active: 0, added: 0, ended: 0 }));
  const p = CF.paceFrom({ weeks, firstSubAt: null }, now);
  assert.equal(p.adds, null);
  assert.equal(p.churn, null);
});

test('paceFrom: no one active over the window is no churn figure, not 0%', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  const weeks = weeksTo(now, 104, () => ({ active: 0, added: 0, ended: 0 }));
  const p = CF.paceFrom({ weeks, firstSubAt: '2025-01-01T00:00:00Z' }, now);
  assert.equal(p.adds, 0, 'a practice that had clients once and gained none: a measured zero');
  assert.equal(p.churn, null);
});

test('lifetime: the average stay is 1 / churn, and the value is the net over it', () => {
  const lt = CF.lifetime({ netPerClientCents: 15750, churn: 0.08 });
  near(lt.months, 12.5);
  near(lt.valueCents, 196875);
  assert.equal(CF.lifetime({ netPerClientCents: 15750, churn: 0 }), null);
  assert.equal(CF.lifetime({ netPerClientCents: 15750, churn: null }), null);
  assert.equal(CF.lifetime({ netPerClientCents: null, churn: 0.1 }), null);
});

test('paceFrom: with a growing practice, churn is against the average headcount, not the first week\'s', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  // 4 active at the window's start, 20 by its end; 2 departures.
  const weeks = weeksTo(now, 104, (i, n) => {
    const k = i - (n - 14);
    return { active: k < 0 ? 4 : 4 + Math.min(16, k * 2), added: 0, ended: k === 5 || k === 9 ? 1 : 0 };
  });
  const p = CF.paceFrom({ weeks, firstSubAt: '2025-01-01T00:00:00Z' }, now);
  const open = Date.UTC(2026, 6, 13);
  const inWin = weeks.filter((w) => Date.parse(w.weekOf + 'T00:00:00Z') >= open);
  const avg = inWin.reduce((s, w) => s + w.active, 0) / inWin.length;
  assert.ok(avg > inWin[0].active * 2, 'the fixture grows');
  const months = (now - open) / DAY / 30.4;
  near(p.churn, 2 / avg / months);
});

// ── The figures both Business pages print (the website's dashBusiness.jsx and the app's
// BSCoachBusiness.jsx read these, so the two say the same numbers) ──

test("todayFrom: the trajectory's latest week, so a client whose payment is retrying counts; metrics only when it is missing", () => {
  const weeks = [{ active: 9, mrrNetCents: 1, mrrGrossCents: 2 }, { active: 13, mrrNetCents: 170000, mrrGrossCents: 200000 }];
  assert.deepEqual(CF.todayFrom({ trajectory: { weeks }, metrics: { activeClients: 12, mrrNetCents: 150000, mrrGrossCents: 180000 } }), { clients: 13, mrrNetCents: 170000, mrrGrossCents: 200000 });
  assert.deepEqual(CF.todayFrom({ trajectory: null, metrics: { activeClients: 12, mrrNetCents: 150000, mrrGrossCents: 180000 } }), { clients: 12, mrrNetCents: 150000, mrrGrossCents: 180000 });
  assert.equal(CF.todayFrom({ trajectory: null, metrics: { activeClients: null, mrrNetCents: null } }), null, 'unread is not zero');
  assert.equal(CF.todayFrom(null), null);
});

test('planNumbers: the listing price, else the clients\' average to $5, else the default; the brought share per client, from the routes\' mix', () => {
  const extra = {
    trajectory: null,
    metrics: { activeClients: 4, mrrNetCents: 60000, mrrGrossCents: 70300 },
    // The origin feed has a row per subscription: the one brought client, on two plans, is two 0% rows
    // (2 of 5), and a one-time purchase is a row too.
    byOrigin: [{ kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'subscription', feeBps: 1500 }, { kind: 'purchase', feeBps: 0 }],
    // The routes count clients (byoMixOf, Codex round 5 on #2394): 1 of 4.
    byoMix: { clients: 4, brought: 1 },
  };
  const listed = CF.planNumbers({ extra, listingMonthly: 180 });
  assert.equal(listed.rateCents, 18000);
  assert.equal(listed.rateFrom, 'listing');
  assert.deepEqual([listed.brought, listed.byoClients], [1, 4], 'per client, not the 2 of 5 rows');
  assert.equal(listed.byoShare, 0.25);
  assert.deepEqual([listed.pace.adds, listed.pace.churn], [null, null], 'no trajectory is no pace, not a pace of zero');
  assert.equal(listed.pace.unread, true, 'and an unread history, not an empty one');
  assert.deepEqual([listed.listingUnread, listed.broughtUnread], [false, false]);
  // A measured history is not unread.
  const read = CF.planNumbers({ extra: { ...extra, trajectory: { weeks: [{ weekOf: '2026-10-12', active: 5, added: 0, ended: 0, mrrNetCents: 60000, mrrGrossCents: 70300 }], firstSubAt: '2025-01-01T00:00:00Z' } }, listingMonthly: 180, now: Date.UTC(2026, 9, 17, 12) });
  assert.equal(read.pace.unread, undefined);
  // Today's count takes in a client whose payment is retrying (todayFrom); the share stays the
  // mix's own 1 of 4, not 1 of today's 5.
  assert.deepEqual([read.clients, read.byoClients, read.byoShare], [5, 4, 0.25]);
  const avg = CF.planNumbers({ extra, listingMonthly: 0 });
  assert.equal(avg.rateFrom, 'average');
  assert.equal(avg.rateCents, 17500, '$175.75 a client rounds to $175');
  const none = CF.planNumbers({ extra: { metrics: { activeClients: 0, mrrNetCents: 0, mrrGrossCents: 0 } }, listingMonthly: null });
  assert.deepEqual([none.rateCents, none.rateFrom, none.byoShare], [CF.DEFAULT_RATE_CENTS, 'default', 0]);
  assert.equal(CF.planNumbers({ extra: { metrics: {} }, listingMonthly: 180 }), null);
});

test('planNumbers: an unread listing, brought share or history is said as unread, never as a measurement', () => {
  const extra = { trajectory: null, metrics: { activeClients: 4, mrrNetCents: 60000, mrrGrossCents: 70300 }, byOrigin: null, byoMix: null };
  // The listing read failed: the rate falls back to the clients' average, and says the price was unread.
  const failed = CF.planNumbers({ extra, listingMonthly: null, listingFailed: true });
  assert.deepEqual([failed.rateFrom, failed.rateCents, failed.listingUnread], ['average', 17500, true]);
  const failedNone = CF.planNumbers({ extra: { ...extra, metrics: { activeClients: 0, mrrNetCents: 0, mrrGrossCents: 0 } }, listingMonthly: null, listingFailed: true });
  assert.deepEqual([failedNone.rateFrom, failedNone.listingUnread], ['default', true]);
  // A price that was read is the price, whatever else failed.
  assert.equal(CF.planNumbers({ extra, listingMonthly: 180, listingFailed: true }).listingUnread, false);
  assert.equal(CF.planNumbers({ extra, listingMonthly: null }).listingUnread, false, 'no listing price yet is not an unread one');
  // byoMix null: the share starts at 0% as a default, marked unread; a mix of no clients is a measured none.
  assert.deepEqual([failed.byoShare, failed.brought, failed.byoClients, failed.broughtUnread], [0, 0, 0, true]);
  assert.equal(CF.planNumbers({ extra: { ...extra, byOrigin: [], byoMix: { clients: 0, brought: 0 } }, listingMonthly: null }).broughtUnread, false);
  // The rows are never counted in its place: without the mix, the share is unread.
  const rowsOnly = CF.planNumbers({ extra: { ...extra, byOrigin: [{ kind: 'subscription', feeBps: 0 }, { kind: 'subscription', feeBps: 1500 }] }, listingMonthly: null });
  assert.deepEqual([rowsOnly.byoShare, rowsOnly.broughtUnread], [0, true]);
  // The trajectory read failed: no pace, and an unread history.
  assert.deepEqual(failed.pace, { adds: null, churn: null, days: 0, fromFirst: false, unread: true });
});

test('churnPct: a measured churn to a tenth of a point, and never 0', () => {
  assert.equal(CF.churnPct(0.0712), 7.1);
  assert.equal(CF.churnPct(0.0045), 0.5, 'one departure from 70 clients in three months');
  assert.equal(CF.churnPct(0.0004), 0.1, 'a measured churn never rounds to 0');
  assert.equal(CF.churnPct(0), 0, 'no one left is 0');
  assert.equal(CF.churnPct(0.42), 42);
});

test('planStart: today\'s pace rounded to the sliders, the rate to $5, the goal half again above today', () => {
  const s = CF.planStart({ rateCents: 17800, mrrNetCents: 189000, pace: { adds: 2.34, churn: 0.0712 } });
  assert.deepEqual(s, { adds: 2.3, churnPct: 7.1, rate: 180, goal: 3000 });
  // Churn is kept to a tenth of a point, and a measured churn never starts the plan at 0%.
  assert.equal(CF.planStart({ rateCents: 15000, mrrNetCents: 0, pace: { adds: 1, churn: 0.0045 } }).churnPct, 0.5);
  assert.equal(CF.planStart({ rateCents: 15000, mrrNetCents: 0, pace: { adds: 1, churn: 0.0004 } }).churnPct, 0.1);
  assert.equal(CF.planStart({ rateCents: 15000, mrrNetCents: 0, pace: { adds: 1, churn: 0 } }).churnPct, 0, 'no one left is a measured 0');
  // No history: the stated defaults. A tiny practice still aims at $1,000.
  assert.deepEqual(CF.planStart({ rateCents: 15000, mrrNetCents: 20000, pace: { adds: null, churn: null } }), { adds: 1, churnPct: 5, rate: 150, goal: 1000 });
  // A churn past the slider's usual 30% is kept, not clamped (the range stretches to it).
  assert.equal(CF.planStart({ rateCents: 15000, mrrNetCents: 0, pace: { adds: 1, churn: 0.42 } }).churnPct, 42);
});

test('renewalsSum: only a renewal Stripe confirmed counts; cancelled and unchecked do not', () => {
  const rows = [{ netCents: 15300, ending: false }, { netCents: 18000, ending: false }, { netCents: 9000, ending: true }, { netCents: 7000, ending: null }];
  assert.deepEqual(CF.renewalsSum(rows), { count: 2, netCents: 33300 });
  // None checked is no total, not "0 clients · $0" beside a list of renewals; all cancelled is a checked zero.
  assert.equal(CF.renewalsSum(rows.map((r) => ({ ...r, ending: null }))), null);
  assert.equal(CF.renewalsSum([{ netCents: 9000, ending: true }, { netCents: 7000, ending: null }]), null);
  assert.deepEqual(CF.renewalsSum([{ netCents: 9000, ending: true }]), { count: 0, netCents: 0 });
  assert.equal(CF.renewalsSum([]), null);
  assert.equal(CF.renewalsSum(null), null);
});

test('moneyFrom: on its way, ready and clearing add up to what is coming; a paid payout is not on its way', () => {
  const m = CF.moneyFrom({
    balanceCents: 52000, pendingCents: 9000,
    payouts: [
      { status: 'in_transit', amountCents: 40000, arrivalDate: Date.UTC(2026, 9, 21) },
      { status: 'pending', amountCents: 12000, arrivalDate: Date.UTC(2026, 9, 19) },
      { status: 'paid', amountCents: 99999, arrivalDate: Date.UTC(2026, 9, 10) },
    ],
  });
  assert.deepEqual([m.onWay, m.onWayCents, m.balanceCents, m.pendingCents, m.comingCents], [2, 52000, 52000, 9000, 113000]);
  assert.equal(m.next.amountCents, 12000, 'the soonest to land');
  const none = CF.moneyFrom({ connected: true, balanceCents: null, payouts: [] });
  assert.deepEqual([none.onWay, none.next, none.balanceCents, none.comingCents], [0, null, null, 0]);
});
