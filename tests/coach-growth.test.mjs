// The coach dashboards' 90-day growth and funnel (src/lib/coach-growth.ts), and the two places
// that read them (dashToday.jsx), after the Business review of 2026-10-17: a new client is a person
// who started paying, once; the comparison is over equal spans; "signed" is the clients who found
// the coach on Shape, and the close rate stops at 100.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

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
  const g = G.growthFrom([row('a', 10), row('b', 9), row(null, 8), row(null, 7)], { existing: new Set(['a']), consults90: 0, now: NOW });
  assert.equal(total(g), 3);
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
