// The coach dashboards' 90-day growth and funnel (src/lib/coach-growth.ts), and the two places
// that read them (dashToday.jsx), after the Business review of 2026-10-17: a new client is a person
// who started paying, once; the comparison is over equal spans; "signed" is the clients who found
// the coach on Shape, and the close rate stops at 100.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const G = await loadRealModule(ROOT + 'src/lib/coach-growth.ts', {
  typescript: true,
  registry: new Map([['@/lib/coach-trajectory.mjs', await import(pathToFileURL(ROOT + 'src/lib/coach-trajectory.mjs').href)]]),
});
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 17, 12);
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const row = (client_id, d, over = {}) => ({ client_id, created_at: ago(d), status: 'active', price_cents: 10000, fee_bps: 1500, ...over });
const total = (g) => g.growth.weeklyAdds.reduce((s, w) => s + w.count, 0);

test('an abandoned checkout is not a new client, and a plan change is not a second one', () => {
  const g = G.growthFrom([
    row('a', 10),
    row('a', 5, { price_cents: 20000 }),          // a's plan change
    row('b', 8, { status: 'incomplete' }),          // never paid
    row('c', 7, { status: 'incomplete_expired' }),  // never paid
    row('d', 3, { status: 'canceled' }),            // paid, then left: still joined
  ], { consults90: 0, now: NOW });
  assert.equal(total(g), 2);
  assert.equal(g.growth.weeklyAdds.reduce((s, w) => s + w.addedCents, 0), 20000, 'each counted at its first row\'s price');
});

test('a client who was a client when the window opened is not new; one with no client_id stands alone', () => {
  const g = G.growthFrom([row('a', 10), row('b', 9), row(null, 8), row(null, 7)], { existing: new Map([['a', Infinity]]), consults90: 0, now: NOW });
  assert.equal(total(g), 3);
});

test('a client who leaves after the window opens and comes back inside it is new; a plan change that carried the membership on is not', async () => {
  // Through the route's own reads: coachGrowthAndFunnel works the window out from the clock.
  const T = Date.now();
  const at = (d) => new Date(T - d * DAY).toISOString();
  const sub = (client_id, d, over = {}) => ({ provider_role: 'trainer', provider_id: 7, client_id, created_at: at(d), status: 'active', price_cents: 10000, fee_bps: 1500, ...over });
  const db = fakeSupabase({ tables: { subscriptions: [
    sub('a', 120, { status: 'canceled', current_period_end: at(70) }), // a left 70 days ago...
    sub('a', 20),                                                     // ...and came back
    sub('b', 200),                                                    // b is still on her first plan
    sub('b', 30),                                                     // so this is a plan change
    sub('c', 150, { status: 'canceled', current_period_end: at(40) }), // c's first plan ran out 40 days ago,
    sub('c', 50, { status: 'canceled', current_period_end: at(10) }),  // after she moved to this one,
    sub('c', 30),                                                     // and then to this one: never away
    sub('d', 300),                                                    // d's first plan still runs, whatever
    sub('d', 120, { status: 'canceled', current_period_end: at(60) }), // order the earlier rows are read in,
    sub('d', 30),                                                     // so this is a plan change
    sub('e', 120, { status: 'canceled', current_period_end: at(60) }), // e moved, inside the window,
    sub('e', 70, { status: 'past_due' }),                             // to a plan that is still open,
    sub('e', 30),                                                     // so this is a plan change too
    sub('f', 120, { status: 'canceled', current_period_end: at(50) }), // f's next plan began the moment
    sub('f', 50),                                                     // the last one ended: never away
  ] } });
  // (f's rows share a timestamp, at(50): the second starts exactly when the first ends.)
  const g = await G.coachGrowthAndFunnel(db, 'trainer', 7, 0);
  assert.equal(total(g), 1, 'a\'s return is a new client; b, c, d, e and f never left');
  assert.equal(g.funnel.signed90, 1);
});

test('the comparison is the last 30 days against the 30 before, not a part-month against a whole one', () => {
  const g = G.growthFrom([row('a', 5), row('b', 12), row('c', 29), row('d', 35), row('e', 50), row('f', 70)], { consults90: 0, now: NOW });
  assert.equal(g.growth.momPct, 50, '3 in the last 30 days against 2 in the 30 before');
  assert.equal(G.growthFrom([row('a', 5)], { consults90: 0, now: NOW }).growth.momPct, null, 'no base to compare with');
});

test('"signed" counts the clients who found the coach on Shape; a row with no stored fee is one', () => {
  const g = G.growthFrom([row('a', 5, { fee_bps: 0 }), row('b', 6), row('c', 7, { fee_bps: null }), row('d', 8, { status: 'incomplete' })], { consults90: 4, now: NOW });
  assert.equal(g.funnel.signed90, 2);
  assert.equal(g.funnel.consults90, 4);
  assert.equal(g.funnel.views, null);
});

test('the dashboards cap consult → signed at 100 and say what the comparison is', () => {
  const src = readFileSync(ROOT + 'public/newdesign/dashToday.jsx', 'utf8');
  const fn = /function dashCloseRate\(f\) \{[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, 'dashCloseRate moved');
  const close = new Function(fn[0] + '\nreturn dashCloseRate;')();
  assert.equal(close({ consults90: 4, signed90: 6 }), 100);
  assert.equal(close({ consults90: 10, signed90: 3 }), 30);
  assert.equal(close({ consults90: 0, signed90: 3 }), null);
  assert.equal(close(null), null);
  assert.equal((src.match(/const close = dashCloseRate\(f\);/g) || []).length, 2, 'both readers use it');
  assert.ok(!/MoM/.test(src), 'no month-over-month label is left for a 30-day comparison');
  assert.ok(!/function DashGrowthPanel\(/.test(src), 'the growth panel nothing showed is gone');
});
