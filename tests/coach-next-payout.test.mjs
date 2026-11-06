// Today's Money card reads the coach's next payout from Stripe (the owner's answer to #2628,
// 2026-11-06) through GET /api/coach/next-payout. Driven here end to end: the real route, the real
// request-auth and the real src/lib/stripe.ts loadStripe (the Business page's own Stripe read), with
// a fake Stripe SDK under it and a fake Supabase client for the listing.
//   1. the caller: signed out is a 401, an auth outage a 503, a role that is not a coach's a 400;
//   2. the listing: each role reads its own table under the caller's session; a failed read is a
//      500, never "no listing" and never "not connected";
//   3. Stripe: no connected account says so; an unreachable one is `error`, never "no payout";
//   4. "next" is the earliest payout pending or in transit (coachForecast.js moneyFrom), with its
//      amount, currency and arrival day; paid, failed and cancelled payouts are never next;
//   5. every answer is private and never cached, and the route is in the War Room's RAW_ROUTES.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRealModule } from './helpers/load-real-module.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(join(ROOT, 'package.json'))
const nextServer = require_('next/server')
const CoachForecast = require_('./public/newdesign/coachForecast.js')
const COACH = { id: '33333333-3333-4333-8333-333333333333' }
const APP_TOKEN = 'app-access-token'
const DAY = 86400000
const T0 = Date.UTC(2026, 10, 6) / 1000          // 6 Nov 2026, in Stripe's seconds

// The listing read: `rows[table]` answers maybeSingle(); `errors[table]` fails it. Records each read's
// table and filters, so a test can see whose row was asked for.
function fakeSupabase({ rows = {}, errors = {}, auth = null } = {}) {
  const reads = []
  const from = (table) => {
    const call = { table, ops: [] }
    reads.push(call)
    const q = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'maybeSingle') return () => Promise.resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: rows[table] ?? null, error: null })
        return (...args) => { call.ops.push([prop, ...args]); return q }
      },
    })
    return q
  }
  return { reads, bearer: [], client: { from, auth: { getUser: async () => auth ?? { data: { user: COACH }, error: null } } } }
}

// The Stripe SDK under loadStripe: `payouts` answers payouts.list on a connected account; `fail` throws.
function fakeStripe({ payouts = [], fail = false } = {}) {
  const calls = []
  class FakeStripe {
    constructor() {
      this.balance = { retrieve: async (_p, o) => { calls.push(['balance', o && o.stripeAccount]); if (fail) throw new Error('down'); return { available: [{ amount: 1200 }], pending: [] } } }
      this.payouts = { list: async (p, o) => { calls.push(['payouts', o && o.stripeAccount, p]); if (fail) throw new Error('down'); return { data: payouts } } }
      this.accounts = { retrieve: async (id) => { calls.push(['account', id]); return { settings: { payouts: { schedule: { interval: 'daily', delay_days: 2 } } } } } }
      this.subscriptions = { list: async () => ({ data: [], has_more: false }), retrieve: async () => ({}) }
    }
  }
  return { FakeStripe, calls }
}
const payout = (id, status, cents, arrivalDay, currency = 'usd') => ({ id, status, amount: cents, currency, arrival_date: T0 + arrivalDay * 86400, created: T0 - 86400 })

async function call({ role = 'trainer', db = fakeSupabase(), stripe = fakeStripe(), headers = {}, bearerAuth } = {}) {
  const stripeLib = await loadRealModule(join(ROOT, 'src/lib/stripe.ts'), { typescript: true, registry: new Map([['stripe', stripe.FakeStripe]]) })
  const route = await loadRealModule(join(ROOT, 'src/app/api/coach/next-payout/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', stripeLib],
      ['@/lib/auth-lookup', await loadRealModule(join(ROOT, 'src/lib/auth-lookup.ts'), { typescript: true })],
      ['../../../../../public/newdesign/coachForecast.js', CoachForecast],
      ['@/lib/request-auth', await loadRealModule(join(ROOT, 'src/lib/request-auth.ts'), {
        typescript: true,
        registry: new Map([
          ['@/lib/supabase/server', { createClient: async () => db.client }],
          ['@supabase/supabase-js', { createClient: (_url, _key, o) => {
            db.bearer.push(o?.global?.headers?.Authorization)
            return { ...db.client, auth: { getUser: async (token) => bearerAuth ?? ({ data: { user: token === APP_TOKEN ? COACH : null }, error: null }) } }
          } }],
        ]),
      })],
    ]),
  })
  const q = role == null ? '' : '?role=' + encodeURIComponent(role)
  const res = await route.GET(new Request('https://shape.test/api/coach/next-payout' + q, { headers }))
  return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json(), reads: db.reads, stripe: stripe.calls }
}
const connected = (table, account = 'acct_coach') => fakeSupabase({ rows: { [table]: { id: 7, stripe_account_id: account, stripe_account_status: 'active' } } })

// ── 1. The caller ─────────────────────────────────────────────────────────────
test('signed out is a 401, an auth outage a 503, and a role that is not a coach\'s a 400', async () => {
  const out = await call({ db: fakeSupabase({ auth: { data: { user: null }, error: null } }) })
  assert.equal(out.status, 401)
  assert.equal(out.reads.length, 0, 'a signed-out caller read a listing')
  const down = Object.assign(new Error('fetch failed'), { status: 0, name: 'AuthRetryableFetchError' })
  const outage = await call({ db: fakeSupabase({ auth: { data: { user: null }, error: down } }) })
  assert.equal(outage.status, 503, 'an auth outage reads as signed out, which the card would show as the preview')
  for (const role of ['client', 'admin', '', null, 'toString']) {
    const bad = await call({ role })
    assert.equal(bad.status, 400, 'role ' + role)
    assert.equal(bad.reads.length, 0)
  }
})

test('the installed app is answered on its Bearer token', async () => {
  const db = connected('trainers')
  const out = await call({ db, headers: { authorization: 'Bearer ' + APP_TOKEN }, stripe: fakeStripe({ payouts: [payout('po_1', 'in_transit', 48300, 2)] }) })
  assert.equal(out.status, 200)
  assert.equal(out.body.next.amountCents, 48300)
  assert.deepEqual(db.bearer, ['Bearer ' + APP_TOKEN, 'Bearer ' + APP_TOKEN])
})

// ── 2. The listing ────────────────────────────────────────────────────────────
test('each role reads its own listing, the caller\'s own, and a failed read is a 500', async () => {
  const t = await call({ role: 'trainer', db: connected('trainers') })
  assert.deepEqual(t.reads.map((r) => r.table), ['trainers'])
  assert.deepEqual(t.reads[0].ops.find((o) => o[0] === 'eq'), ['eq', 'owner_id', COACH.id])
  assert.equal(t.reads[0].ops.some((o) => o[0] === 'select' && /stripe_account_id/.test(o[1])), true)
  const n = await call({ role: 'nutritionist', db: connected('nutritionists') })
  assert.deepEqual(n.reads.map((r) => r.table), ['nutritionists'])
  assert.equal(n.body.connected, true)
  // A trainer page on an account with only a nutritionist listing has no trainer listing.
  const none = await call({ role: 'trainer', db: connected('nutritionists') })
  assert.deepEqual(none.body, { isProvider: false })
  const failed = await call({ db: fakeSupabase({ errors: { trainers: 'timeout' } }) })
  assert.equal(failed.status, 500)
  assert.equal('connected' in failed.body || 'isProvider' in failed.body, false, 'a failed read answered as a listing state')
  assert.equal(failed.stripe.length, 0, 'Stripe was asked on a listing it could not read')
})

// ── 3. Stripe ─────────────────────────────────────────────────────────────────
test('no connected account says so, and Stripe unreachable is an error, never "no payout"', async () => {
  const unlinked = await call({ db: connected('trainers', null) })
  assert.deepEqual(unlinked.body, { isProvider: true, connected: false })
  assert.equal(unlinked.stripe.length, 0, 'Stripe was asked with no account')
  // An id that is not payable (deauthorized, or onboarding unfinished) is not set up, as checkout
  // rules it, and Stripe is not asked (#2629 review).
  for (const status of ['disconnected', 'pending', 'restricted', null]) {
    const db = fakeSupabase({ rows: { trainers: { id: 7, stripe_account_id: 'acct_coach', stripe_account_status: status } } })
    const res = await call({ db })
    assert.deepEqual(res.body, { isProvider: true, connected: false }, 'status ' + status)
    assert.equal(res.stripe.length, 0, 'Stripe was asked for a ' + status + ' account')
  }
  const down = await call({ db: connected('trainers'), stripe: fakeStripe({ fail: true }) })
  assert.equal(down.status, 200)
  assert.deepEqual(down.body, { isProvider: true, connected: true, error: true })
  assert.equal('next' in down.body, false)
})

// ── 4. The next payout ────────────────────────────────────────────────────────
test('next is the earliest payout pending or in transit, on the listing\'s own account', async () => {
  const payouts = [
    payout('po_paid', 'paid', 99900, -1),
    payout('po_later', 'pending', 30000, 5),
    payout('po_soon', 'in_transit', 48312, 2, 'usd'),
    payout('po_failed', 'failed', 77700, 1),
    payout('po_cancel', 'canceled', 11100, 0),
  ]
  const s = fakeStripe({ payouts })
  const out = await call({ db: connected('trainers', 'acct_trainer_7'), stripe: s })
  assert.equal(out.status, 200)
  assert.deepEqual(out.body, { isProvider: true, connected: true, next: { amountCents: 48312, currency: 'usd', arrivalDate: (T0 + 2 * 86400) * 1000, status: 'in_transit' } })
  assert.equal(s.calls.some(([k, acct]) => k === 'payouts' && acct === 'acct_trainer_7'), true, 'payouts were not read on the coach\'s connected account')
  // A pending payout is next when it lands first.
  const pend = await call({ db: connected('trainers'), stripe: fakeStripe({ payouts: [payout('a', 'in_transit', 1, 4), payout('b', 'pending', 2, 3, 'eur')] }) })
  assert.deepEqual(pend.body.next, { amountCents: 2, currency: 'eur', arrivalDate: (T0 + 3 * 86400) * 1000, status: 'pending' })
  // Nothing on its way: null, said as "no payout scheduled" on the card.
  const quiet = await call({ db: connected('trainers'), stripe: fakeStripe({ payouts: [payout('p', 'paid', 5000, -3)] }) })
  assert.deepEqual(quiet.body, { isProvider: true, connected: true, next: null })
  const empty = await call({ db: connected('trainers'), stripe: fakeStripe({ payouts: [] }) })
  assert.equal(empty.body.next, null)
})

// ── 5. Private, and listed ────────────────────────────────────────────────────
test('every answer is private and never cached, and the route is in RAW_ROUTES', async () => {
  const answers = [
    await call({ db: fakeSupabase({ auth: { data: { user: null }, error: null } }) }),
    await call({ role: 'client' }),
    await call({ db: fakeSupabase({ errors: { trainers: 'x' } }) }),
    await call({ db: connected('trainers', null) }),
    await call({ db: connected('trainers'), stripe: fakeStripe({ payouts: [payout('p', 'pending', 1, 1)] }) }),
  ]
  for (const a of answers) assert.equal(/private/.test(a.cache || '') && /no-store/.test(a.cache || ''), true, a.status + ' ' + a.cache)
  const war = readFileSync(join(ROOT, 'src/lib/warroom.ts'), 'utf8')
  assert.equal(war.includes("['/api/coach/next-payout', 'GET'],"), true)
  // The Business page's Stripe read, not a second client path: the route asks loadStripe, and owns no Stripe client.
  const src = readFileSync(join(ROOT, 'src/app/api/coach/next-payout/route.ts'), 'utf8')
  assert.equal(/from '@\/lib\/stripe'/.test(src) && /loadStripe\(/.test(src), true)
  assert.equal(/new Stripe\(|from 'stripe'/.test(src), false)
})
