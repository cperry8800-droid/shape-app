// src/lib/stripe.ts: what the Business page's Money tab reads from Stripe (design E).
// The real module runs here against a stub Stripe client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const SRC = fileURLToPath(new URL('../src/lib/stripe.ts', import.meta.url));

async function load(client) {
  function FakeStripe() { return client; }
  return loadRealModule(SRC, { typescript: true, registry: new Map([['stripe', { __esModule: true, default: FakeStripe }]]) });
}

const acct = (over = {}) => ({
  balance: { retrieve: async () => ({ available: [{ amount: 41200 }], pending: [{ amount: 100000 }, { amount: 18000 }] }) },
  payouts: { list: async () => ({ data: [{ id: 'po_1', amount: 52000, currency: 'usd', status: 'in_transit', arrival_date: 1_800_000_000, created: 1_799_900_000 }] }) },
  accounts: { retrieve: async () => ({ settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'friday', delay_days: 7 } } } }) },
  ...over,
});

test('a linked account reads its available AND pending balance, schedule and payouts', async () => {
  const S = await load(acct());
  const s = await S.loadStripe('acct_1', 'active');
  assert.equal(s.connected, true);
  assert.equal(s.error, undefined);
  assert.equal(s.balanceCents, 41200);
  assert.equal(s.pendingCents, 118000);
  assert.deepEqual(s.schedule, { interval: 'weekly', weeklyAnchor: 'friday', monthlyAnchor: null, delayDays: 7 });
  assert.deepEqual(s.payouts.map((p) => [p.amountCents, p.status, p.arrivalDate]), [[52000, 'in_transit', 1_800_000_000_000]]);
});

test('no account is "not connected", with nothing read', async () => {
  const S = await load(acct());
  const s = await S.loadStripe(null, null);
  assert.deepEqual(s, { connected: false, status: 'not_connected', balanceCents: null, pendingCents: null, schedule: null, payouts: [] });
});

test('a linked account Stripe could not be read for is flagged, not shown as an empty account', async () => {
  const S = await load(acct({ balance: { retrieve: async () => { throw new Error('rate limited'); } } }));
  const s = await S.loadStripe('acct_1', 'active');
  assert.equal(s.connected, true);
  assert.equal(s.error, true, 'the status is the stored "active", so only the flag says the read failed');
  assert.equal(s.status, 'active');
  assert.equal(s.balanceCents, null);
  assert.equal(s.pendingCents, null);
});

test('loadCancelFlags: cancelled, renews, or unknown, and nothing past the cap is asked', async () => {
  const asked = [];
  const subs = {
    sub_renews: { cancel_at_period_end: false, cancel_at: null, status: 'active' },
    sub_cancel: { cancel_at_period_end: true, cancel_at: null, status: 'active' },
    sub_at: { cancel_at_period_end: false, cancel_at: 1_800_000_000, status: 'active' },
    sub_gone: { cancel_at_period_end: false, cancel_at: null, status: 'canceled' },
  };
  const S = await load({ subscriptions: { retrieve: async (id) => { asked.push(id); if (!subs[id]) throw new Error('No such subscription'); return subs[id]; } } });
  const ids = ['sub_renews', 'sub_cancel', 'sub_at', 'sub_gone', 'sub_missing', 'sub_over'];
  const flags = await S.loadCancelFlags(ids, 5);
  assert.deepEqual(ids.map((id) => flags.get(id)), [false, true, true, true, null, null]);
  assert.ok(!asked.includes('sub_over'), 'the sixth is past the cap of five');
});
