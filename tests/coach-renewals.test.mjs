// "Renewing this week" on the Business page's Money tab (src/lib/coach-renewals.mjs; design E).
// The route picks the active rows due in the next 7 days and asks Stripe whether each will
// renew; only a confirmed renewal is money coming in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRenewals, renewalRows, RENEWAL_DAYS, RENEWAL_CHECK_CAP } from '../src/lib/coach-renewals.mjs';
import { coachCutCents, bpsToRate } from '../src/lib/platform-fee.mjs';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 17, 12);
const at = (d) => new Date(NOW + d * DAY).toISOString();
const cut = (p, bps) => coachCutCents(p, bpsToRate(bps ?? 1500));

test('the window is the next 7 days, soonest first', () => {
  assert.equal(RENEWAL_DAYS, 7);
  assert.ok(RENEWAL_CHECK_CAP > 0);
  const rows = [
    { client_id: 'c', current_period_end: at(6.9) },
    { client_id: 'a', current_period_end: at(0.5) },
    { client_id: 'late', current_period_end: at(7.01) },
    { client_id: 'past', current_period_end: at(-0.01) },
    { client_id: 'none', current_period_end: null },
    { client_id: 'junk', current_period_end: 'not a date' },
    { client_id: 'b', current_period_end: at(3) },
  ];
  assert.deepEqual(pickRenewals(rows, NOW).map((r) => r.client_id), ['a', 'b', 'c']);
  assert.deepEqual(pickRenewals(rows, NOW, 1).map((r) => r.client_id), ['a']);
  assert.deepEqual(pickRenewals(null, NOW), []);
});

test('each row carries the name, the due date, the price and the net at its STORED fee', () => {
  const picked = [
    { client_id: 'a', price_cents: 18000, fee_bps: 1500, current_period_end: at(1), stripe_subscription_id: 'sub_a' },
    { client_id: 'b', price_cents: 18000, fee_bps: 0, current_period_end: at(2), stripe_subscription_id: 'sub_b' },
    { client_id: 'c', price_cents: 16500, fee_bps: null, current_period_end: at(3), stripe_subscription_id: 'sub_c' },
  ];
  const rows = renewalRows(picked, { names: new Map([['a', 'Ana Reyes'], ['b', 'Ben K']]), flags: new Map([['sub_a', false], ['sub_b', false], ['sub_c', true]]), cutCents: cut });
  assert.deepEqual(rows.map((r) => r.name), ['Ana Reyes', 'Ben K', '—'], 'an unread name is unknown, not a row of "Client"s');
  assert.deepEqual(rows.map((r) => r.netCents), [15300, 18000, 14025]);
  assert.deepEqual(rows.map((r) => r.priceCents), [18000, 18000, 16500]);
  assert.equal(rows[0].dueAt, new Date(NOW + DAY).toISOString());
  assert.deepEqual(rows.map((r) => r.ending), [false, false, true]);
});

test('a row Stripe was not asked about, or could not answer for, is "unknown", never "renews"', () => {
  const picked = [
    { client_id: 'a', price_cents: 100, current_period_end: at(1), stripe_subscription_id: 'sub_a' },
    { client_id: 'b', price_cents: 100, current_period_end: at(1), stripe_subscription_id: null },
    { client_id: 'c', price_cents: 100, current_period_end: at(1), stripe_subscription_id: 'sub_c' },
  ];
  const rows = renewalRows(picked, { names: new Map(), flags: new Map([['sub_a', null]]), cutCents: cut });
  assert.deepEqual(rows.map((r) => r.ending), [null, null, null]);
});
