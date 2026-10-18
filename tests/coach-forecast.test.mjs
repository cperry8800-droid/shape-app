// The Business page's Plan tab math (public/newdesign/coachForecast.js; design E, owner
// 2026-10-17: "forecast on business"). Every figure the tab prints comes from these functions,
// so each is driven here with numbers worked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PLATFORM_FEE_RATE } from '../src/lib/platform-fee.mjs';
// The routes' own rules for the rows the churn list is built from (both analytics routes use them).
import { buildTrajectory, subDeparture, NOT_ENDED_STATUSES } from '../src/lib/coach-trajectory.mjs';

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
    // An origin feed of a row per subscription, as the routes sent until the follow-up to #2395: the
    // one brought client, on two plans, is two 0% rows (2 of 5), and a one-time purchase is a row too.
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

test('planStart: today\'s pace rounded to the sliders, the rate as it is, the goal half again above today', () => {
  const s = CF.planStart({ rateCents: 17800, mrrNetCents: 189000, pace: { adds: 2.34, churn: 0.0712 } });
  assert.deepEqual(s, { adds: 2.3, churnPct: 7.1, rate: 178, goal: 3000 });
  // The sweep after #2394 round 10: the rate is the listing price as it is, never rounded to $5.
  // A $149 listing started the plan at $150 beside "$149 · your listing price".
  assert.equal(CF.planStart({ rateCents: 14900, mrrNetCents: 0, pace: {} }).rate, 149);
  assert.equal(CF.planStart({ rateCents: 14950, mrrNetCents: 0, pace: {} }).rate, 149.5, 'to the cent');
  assert.equal(CF.planStart({ rateCents: 14999, mrrNetCents: 0, pace: {} }).rate, 149.99);
  assert.equal(CF.planStart({ rateCents: 0, mrrNetCents: 0, pace: {} }).rate, 5, 'no rate at all still starts the slider somewhere');
  // Churn is kept to a tenth of a point, and a measured churn never starts the plan at 0%.
  assert.equal(CF.planStart({ rateCents: 15000, mrrNetCents: 0, pace: { adds: 1, churn: 0.0045 } }).churnPct, 0.5);
  assert.equal(CF.planStart({ rateCents: 15000, mrrNetCents: 0, pace: { adds: 1, churn: 0.0004 } }).churnPct, 0.1);
  assert.equal(CF.planStart({ rateCents: 15000, mrrNetCents: 0, pace: { adds: 1, churn: 0 } }).churnPct, 0, 'no one left is a measured 0');
  // No history: the stated defaults. A tiny practice still aims at $1,000.
  assert.deepEqual(CF.planStart({ rateCents: 15000, mrrNetCents: 20000, pace: { adds: null, churn: null } }), { adds: 1, churnPct: 5, rate: 150, goal: 1000 });
  // A churn past the slider's usual 30% is kept, not clamped (the range stretches to it).
  assert.equal(CF.planStart({ rateCents: 15000, mrrNetCents: 0, pace: { adds: 1, churn: 0.42 } }).churnPct, 42);
});

// A range input snaps its value to its low end plus a whole number of steps (the HTML value
// sanitization), so the starting rate must sit on that grid or the slider cannot hold it. Checked
// in cents, so a float never decides it.
const onGrid = (r, rate) => (Math.round(rate * 100) - Math.round(r.min * 100)) % Math.round(r.step * 100) === 0;
test('rateRange: the rate slider holds the starting rate exactly, to the cent, from about $20 to $500 or twice the rate', () => {
  for (const rate of [149, 150, 178, 149.5, 149.99, 15, 20, 21.37, 800, 0.5]) {
    const r = CF.rateRange(rate);
    assert.ok(onGrid(r, rate), `$${rate} sits on the slider's steps: ${JSON.stringify(r)}`);
    assert.ok(r.min <= rate && rate <= r.max, `$${rate} is inside ${JSON.stringify(r)}`);
    assert.ok(r.min > Math.min(20, rate) - 1, `the low end is about $20, or the rate below it: ${JSON.stringify(r)}`);
  }
  // A $149 listing on the old $5 steps from $20 was off the grid: 129 is not a multiple of 5.
  assert.equal(onGrid({ min: 20, step: 5 }, 149), false, 'the helper itself tells the old slider apart');
  assert.deepEqual(CF.rateRange(149), { min: 20, max: 500, step: 1 });
  assert.deepEqual(CF.rateRange(149.5), { min: 20.5, max: 500, step: 1 });
  assert.deepEqual(CF.rateRange(15), { min: 15, max: 500, step: 1 }, 'a rate under $20 is the low end');
  assert.deepEqual(CF.rateRange(800), { min: 20, max: 1600, step: 1 }, 'the top stretches to twice the rate');
  // A drag from a rate with cents moves in whole dollars from it, so it can always come back.
  const r = CF.rateRange(149.99);
  assert.equal(r.min, 20.99);
  assert.ok(onGrid(r, 150.99) && !onGrid(r, 150), JSON.stringify(r));
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

// ── Who left (the sweep after #2394 round 10): the churn list both Business pages print ──
test('paceFrom says where its window opens, so a count of departures can open there too', () => {
  const now = Date.UTC(2026, 9, 17, 12);   // a Saturday
  const weeks = weeksTo(now, 104, () => ({ active: 10, added: 0, ended: 0 }));
  assert.equal(CF.paceFrom({ weeks, firstSubAt: '2025-01-01T00:00:00Z' }, now).from, Date.UTC(2026, 6, 13), 'the Monday on or before 91 days ago');
  // A younger practice: the Monday after its first week.
  const first = Date.UTC(2026, 8, 2, 9);   // a Wednesday; its week opens Monday 08-31
  assert.equal(CF.paceFrom({ weeks, firstSubAt: new Date(first).toISOString() }, now).from, Date.UTC(2026, 8, 7));
  assert.equal(CF.paceFrom({ weeks, firstSubAt: null }, now).from, null, 'no history, no window');
});

test('churnWindow: the pace\'s window whenever the pace has one, else the last 90 days', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  const weeks = weeksTo(now, 104, (i, n) => ({ active: 10, added: 0, ended: i === n - 3 ? 1 : 0 }));
  const pace = CF.paceFrom({ weeks, firstSubAt: '2025-01-01T00:00:00Z' }, now);
  assert.deepEqual(CF.churnWindow(pace, now), { from: Date.UTC(2026, 6, 13), paced: true, fromFirst: false });
  const young = CF.paceFrom({ weeks, firstSubAt: new Date(Date.UTC(2026, 8, 2, 9)).toISOString() }, now);
  assert.deepEqual(CF.churnWindow(young, now), { from: Date.UTC(2026, 8, 7), paced: true, fromFirst: true });
  const ninety = { from: now - 90 * DAY, paced: false, fromFirst: false };
  // Under a month of history has a window but no pace: the 90 days, and the page says so.
  const tooYoung = CF.paceFrom({ weeks, firstSubAt: new Date(now - 20 * DAY).toISOString() }, now);
  assert.equal(tooYoung.adds, null);
  assert.deepEqual(CF.churnWindow(tooYoung, now), ninety);
  assert.deepEqual(CF.churnWindow({ adds: null, churn: null, unread: true }, now), ninety, 'an unread history');
  assert.deepEqual(CF.churnWindow(null, now), ninety);
});

test('departures: one client at one moment is one departure whose money adds; two weeks apart are two', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  const at = (d) => new Date(now - d * DAY).toISOString();
  const rows = [
    { name: 'Two at once', clientId: 'a', departed: true, startedAt: at(200), endedAt: at(5), priceCents: 18000 },
    { name: 'Two at once', clientId: 'a', departed: true, startedAt: at(300), endedAt: at(5), priceCents: 6000, reason: 'Moved' },
    { name: 'Held another', clientId: 'h', departed: false, endedAt: at(6), priceCents: 9000 },
    { name: 'Back and gone', clientId: 'b', departed: true, endedAt: at(10), priceCents: 15000 },
    { name: 'Back and gone', clientId: 'b', departed: true, endedAt: at(70), priceCents: 9000 },
    { name: 'No client', clientId: null, departed: true, endedAt: at(70), priceCents: 4000 },
    { name: 'No client', clientId: null, departed: true, endedAt: at(70), priceCents: 3000 },
    { name: 'Long gone', clientId: 'g', departed: true, endedAt: at(400), priceCents: 22000 },
  ];
  const d = CF.departures(rows, { now });
  assert.deepEqual(d.list.map((x) => [x.name, x.priceCents, x.plans]), [
    ['Two at once', 24000, 2], ['Back and gone', 15000, 1], ['Back and gone', 9000, 1], ['No client', 4000, 1], ['No client', 3000, 1], ['Long gone', 22000, 1],
  ]);
  assert.equal(d.list[0].startedAt, at(300), 'the earliest start of the plans that ended together');
  assert.equal(d.list[0].reason, 'Moved');
  assert.deepEqual([d.count, d.lostCents, d.floor, d.window.paced], [5, 24000 + 15000 + 9000 + 4000 + 3000, false, false], 'the last 90 days with no pace');
  // A row nobody could decide (the route's history read failed) makes the whole list unread.
  assert.equal(CF.departures([...rows, { name: 'Unknown', clientId: 'u', departed: null, endedAt: at(3) }], { now }), null);
  // A row the route did not decide (the preview's rows) is a departure.
  assert.equal(CF.departures([{ name: 'Preview', endedAt: at(3), priceCents: 100 }], { now }).count, 1);
});

// ── Its review (the sweep after #2394 round 10): one client's departures in one ISO week are one ──
test('departures: one client\'s departures in one week are one, with the money of the plans held when it happened, dated by the last end', () => {
  const now = Date.UTC(2026, 9, 16, 12);
  // Newest first, as the routes send them. x left Monday 09-14, came back Tuesday, left again
  // Wednesday 09-16; and before that left on Sunday 09-06, the week before last.
  const rows = [
    { name: 'X', clientId: 'x', departed: true, startedAt: '2026-09-15T08:00:00Z', endedAt: '2026-09-16T18:00:00Z', priceCents: 18000 },
    { name: 'X', clientId: 'x', departed: true, startedAt: '2026-09-10T08:00:00Z', endedAt: '2026-09-14T10:00:00Z', priceCents: 6000, reason: 'Card failed' },
    { name: 'X', clientId: 'x', departed: true, startedAt: '2026-01-05T00:00:00Z', endedAt: '2026-09-06T23:00:00Z', priceCents: 9000 },
    // Two rows with no client in one week still stand apart.
    { name: 'No client', clientId: null, departed: true, endedAt: '2026-09-15T00:00:00Z', priceCents: 4000 },
    { name: 'No client', clientId: null, departed: true, endedAt: '2026-09-15T01:00:00Z', priceCents: 3000 },
  ];
  const d = CF.departures(rows, { now });
  // x's Monday plan ended before the Tuesday one began: an earlier membership, not money lost on
  // Wednesday (Codex on #2395). One departure, the $180 plan they held when they left.
  assert.deepEqual(d.list.map((x) => [x.name, x.endedAt, x.priceCents, x.plans]), [
    ['X', '2026-09-16T18:00:00Z', 18000, 1], ['X', '2026-09-06T23:00:00Z', 9000, 1], ['No client', '2026-09-15T00:00:00Z', 4000, 1], ['No client', '2026-09-15T01:00:00Z', 3000, 1],
  ]);
  assert.deepEqual([d.list[0].startedAt, d.list[0].reason], ['2026-09-15T08:00:00.000Z', null], 'the start and reason of the plan held');
  assert.deepEqual([d.count, d.lostCents], [4, 18000 + 9000 + 4000 + 3000]);
  // Whatever order the rows arrive in, the week's departure is dated by its last end.
  const flipped = CF.departures([rows[1], rows[0]], { now });
  assert.deepEqual(flipped.list.map((x) => [x.endedAt, x.priceCents]), [['2026-09-16T18:00:00Z', 18000]]);
  // Two plans held together and ended on different days of one week: both were lost.
  const together = CF.departures([
    { name: 'Y', clientId: 'y', departed: true, startedAt: '2026-08-01T00:00:00Z', endedAt: '2026-09-16T12:00:00Z', priceCents: 5000 },
    { name: 'Y', clientId: 'y', departed: true, startedAt: '2026-09-01T00:00:00Z', endedAt: '2026-09-15T10:00:00Z', priceCents: 10000, reason: 'Moved' },
  ], { now });
  assert.deepEqual(together.list.map((x) => [x.priceCents, x.plans, x.startedAt, x.reason]), [[15000, 2, '2026-08-01T00:00:00.000Z', 'Moved']]);
  // When the last plan's start is unknown, the week's other plans are counted as held.
  assert.equal(CF.departures([{ ...rows[0], startedAt: null }, { ...rows[1] }], { now }).list[0].priceCents, 24000);
  // Sunday 23:00 and the next Monday 01:00 are two weeks, so two departures.
  assert.equal(CF.departures([{ ...rows[2], endedAt: '2026-09-13T23:00:00Z' }, { ...rows[1], endedAt: '2026-09-14T01:00:00Z' }], { now }).count, 2);
});

// From subscription rows through the routes' rules to both counts the Retention tab prints: the
// pace's ended count (the trajectory's weeks) and the churn list's departures agree.
test('departures and the pace count the same departures, from the same subscription rows', () => {
  const now = Date.UTC(2026, 9, 16, 12);
  const sub = (o) => ({ status: 'active', price_cents: 18000, fee_bps: 1500, created_at: '2026-01-05T00:00:00Z', ...o });
  const others = Array.from({ length: 5 }, (_, i) => sub({ id: 'o' + i, client_id: 'o' + i }));
  // What the routes send: the ended rows, newest first, each decided by subDeparture.
  const counts = (subs) => {
    const pace = CF.paceFrom(buildTrajectory({ subs, now }), now);
    const churn = subs.filter((r) => !NOT_ENDED_STATUSES.includes(r.status))
      .sort((a, b) => Date.parse(b.current_period_end) - Date.parse(a.current_period_end))
      .map((r) => { const e = subDeparture(r, subs, now); return { name: r.client_id, clientId: r.client_id, departed: e.departed, endedAt: new Date(e.endedAt).toISOString(), priceCents: r.price_cents }; });
    const gone = CF.departures(churn, { pace, now });
    return [pace.ended, gone.count, gone.lostCents];
  };
  const mon = sub({ id: 'x1', client_id: 'x', status: 'unpaid', current_period_end: '2026-09-14T10:00:00Z' });
  // The review's case: ended Monday 09-14, back Thursday 09-17. No one left, in either.
  assert.deepEqual(counts([...others, mon, sub({ id: 'x2', client_id: 'x', created_at: '2026-09-17T09:00:00Z' })]), [0, 0, 0]);
  // Back the next Monday: one departure in each.
  assert.deepEqual(counts([...others, mon, sub({ id: 'x2', client_id: 'x', created_at: '2026-09-21T09:00:00Z' })]), [1, 1, 18000]);
  // Left twice that week (back Tuesday, gone Wednesday): one in each, with both plans' money.
  assert.deepEqual(counts([...others, mon, sub({ id: 'x2', client_id: 'x', status: 'canceled', price_cents: 6000, created_at: '2026-09-15T08:00:00Z', current_period_end: '2026-09-16T18:00:00Z' })]), [1, 1, 24000]);
  // Two plans held together, ended Monday and Wednesday: one departure, and both plans' money left.
  assert.deepEqual(counts([...others, mon, sub({ id: 'x2', client_id: 'x', status: 'canceled', price_cents: 6000, created_at: '2026-04-06T00:00:00Z', current_period_end: '2026-09-16T18:00:00Z' })]), [1, 1, 24000]);
  // Left in two weeks: two in each.
  assert.deepEqual(counts([...others, mon, sub({ id: 'x2', client_id: 'x', status: 'canceled', price_cents: 6000, created_at: '2026-09-21T08:00:00Z', current_period_end: '2026-10-07T18:00:00Z' })]), [2, 2, 24000]);
});

test('departures: the count opens where the pace opens; a full list inside it is a floor', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  const weeks = weeksTo(now, 104, (i, n) => ({ active: 10, added: 0, ended: i === n - 3 ? 1 : 0 }));
  const pace = CF.paceFrom({ weeks, firstSubAt: '2025-01-01T00:00:00Z' }, now);
  const row = (days, o) => ({ name: 'C' + days, clientId: 'c' + days, departed: true, endedAt: new Date(now - days * DAY).toISOString(), priceCents: 1000, ...o });
  // Ended 92 days ago: after the pace's Monday (2026-07-13, 96.5 days back), outside 90 days.
  assert.deepEqual([CF.departures([row(92)], { pace, now }).count, CF.departures([row(92)], { now }).count], [1, 0]);
  assert.equal(CF.departures([row(100)], { pace, now }).count, 0, 'before the window opens');
  const full = Array.from({ length: 12 }, (_, i) => row(3 + i));
  assert.equal(CF.departures(full, { pace, now }).floor, true);
  assert.equal(CF.departures(full.slice(0, 11), { pace, now }).floor, false, 'fewer than the route sends: the list is whole');
  assert.equal(CF.departures([...full.slice(0, 11), row(100)], { pace, now }).floor, false, 'one older than the window: whole');
  // The floor is the route's list, before a row is left out.
  assert.equal(CF.departures(full.map((r, i) => (i < 3 ? { ...r, departed: false } : r)), { pace, now }).floor, true);
  assert.equal(CF.departures(full, { pace, now, cap: 13 }).floor, false);
  assert.equal(CF.CHURN_LIST, 12);
});
