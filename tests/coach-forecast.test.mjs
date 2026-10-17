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
  assert.equal(p.days, 91);
  // The window opens on the Monday of the week holding now − 91 days (Saturday 2026-07-18 →
  // Monday 2026-07-13), and the rates are taken over the span from that Monday to now.
  const open = Date.UTC(2026, 6, 13);
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

test('paceFrom: a practice younger than three months reads since its first client; under a month is no pace', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  const weeks = weeksTo(now, 104, (i, n) => ({ active: i >= n - 7 ? 3 : 0, added: i === n - 7 ? 3 : 0, ended: 0 }));
  const first = new Date(Date.parse(weeks[104 - 7].weekOf + 'T00:00:00Z') + DAY).toISOString();
  const p = CF.paceFrom({ weeks, firstSubAt: first }, now);
  assert.equal(p.fromFirst, true);
  assert.ok(p.adds > 0);
  assert.equal(p.churn, 0, 'nobody left: a measured zero, not "unknown"');
  const young = CF.paceFrom({ weeks, firstSubAt: new Date(now - 10 * DAY).toISOString() }, now);
  assert.equal(young.adds, null);
  assert.equal(young.churn, null);
  assert.equal(CF.paceFrom(null, now).adds, null);
  assert.equal(CF.paceFrom({ weeks: [] }, now).churn, null);
});

test('paceFrom: no one active over the window is no churn figure, not 0%', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  const weeks = weeksTo(now, 104, () => ({ active: 0, added: 0, ended: 0 }));
  const p = CF.paceFrom({ weeks, firstSubAt: null }, now);
  assert.equal(p.adds, 0);
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
