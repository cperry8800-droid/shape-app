// The trainer and nutritionist Business dashboards each read their own analytics route
// (public/newdesign/dashBusiness.jsx: /api/trainer/analytics with okKey isTrainer,
// /api/nutritionist/analytics with okKey isNutritionist).
//
// ⚠ #2030 (2026-09-10) COPIED THE NUTRITIONIST ROUTE OVER THE TRAINER'S, AND #2310 PINNED THE COPY
// IN A TEST ("the trainer and nutritionist analytics stay identical"). A trainer's dashboard then
// read the trainers' route, found no nutritionist listing and got { isNutritionist: false }: no
// roster, no revenue, no payouts, for a month. Restored 2026-10-13 from c850a22cc, the last
// version that read `trainers`, with the one later change both routes share (a failed purchases
// read is carried as oneTimeUnknown). These tests drive both routes with a signed-in coach of each
// role, so a copy in either direction fails.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadRealModule } from './helpers/load-real-module.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(join(ROOT, 'package.json'))
const nextServer = require_('next/server')
const COACH = { id: '33333333-3333-4333-8333-333333333333' }

// Every table read answers from `tables` (or `errors`); any chain of filters is accepted, and
// recorded. `rpc` answers from `rpcs[name](args)`.
function fakeSupabase(tables, { errors = {}, rpcs = {} } = {}) {
  const reads = []
  const calls = []
  const from = (table) => {
    reads.push(table)
    const call = { table, ops: [] }
    calls.push(call)
    const rows = tables[table] ?? []
    // gt, order and limit are honoured (on whatever column they name), so a paged read pages.
    const answer = () => {
      if (errors[table]) return { data: null, error: { message: errors[table] }, count: null }
      let out = rows
      for (const [op, col, v] of call.ops) if (op === 'gt') out = out.filter((r) => String(r[col]) > String(v))
      for (const [op, col, o] of call.ops) {
        if (op !== 'order') continue
        const dir = o && o.ascending === false ? -1 : 1
        out = out.slice().sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : String(a[col]) > String(b[col]) ? dir : 0))
      }
      const limit = call.ops.find((o) => o[0] === 'limit')
      // PostgREST's max_rows: an unlimited read still stops at 1,000, with no error.
      out = out.slice(0, limit ? Math.min(limit[1], 1000) : 1000)
      return { data: out, error: null, count: out.length }
    }
    const q = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(answer()).then(res, rej)
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: rows[0] ?? null, error: null })
        return (...args) => { call.ops.push([prop, ...args]); return q }
      },
    })
    return q
  }
  const rpc = async (name, args) => {
    calls.push({ rpc: name, args })
    const answer = rpcs[name]
    return answer ? answer(args) : { data: null, error: null }
  }
  return { reads, calls, client: { from, rpc, auth: { getUser: async () => ({ data: { user: COACH } }) } } }
}

async function loadRoute(role, tables, opts) {
  const db = fakeSupabase(tables, opts)
  // origin-attribution names the server client in a type-only import; the loader still maps it.
  const ts = (p) => loadRealModule(join(ROOT, p), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) })
  const route = await loadRealModule(join(ROOT, `src/app/api/${role}/analytics/route.ts`), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => db.client }],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
      ['@/lib/stripe', { loadStripe: async () => ({ connected: false }), loadCancelFlags: async (ids, cap) => { opts?.flagCalls?.push({ ids, cap }); return new Map(ids.map((id) => [id, (opts?.cancelled || []).includes(id)])) } }],
      ['@/lib/coach-renewals.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-renewals.mjs')).href)],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/origin-attribution', await ts('src/lib/origin-attribution.ts')],
      ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)],
      ['@/lib/read-all-by-id', await ts('src/lib/read-all-by-id.ts')],
    ]),
  })
  const res = await route.GET(new Request(`https://shape.test/api/${role}/analytics${opts?.query || ''}`))
  return { body: await res.json(), reads: db.reads, calls: db.calls }
}

test('a trainer reads the trainer analytics: their listing, their roster\'s workouts and PRs', async () => {
  const { body, reads } = await loadRoute('trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] })
  assert.equal(body.isTrainer, true, JSON.stringify(body).slice(0, 200))
  assert.equal(body.providerId, 7)
  assert.ok(!('isNutritionist' in body))
  assert.ok(reads.includes('trainers') && !reads.includes('nutritionists'), `read ${reads.join(', ')}`)
  assert.ok(body.clientProgress && 'workouts30d' in body.clientProgress && 'prs30d' in body.clientProgress, 'the roster the trainer cards read')
  assert.equal(body.trajectory?.oneTimeUnknown, false, 'the shared change: a failed purchases read is carried, not zeroed')
})

test('a nutritionist still reads the nutritionist analytics, and a trainer is not one', async () => {
  const n = await loadRoute('nutritionist', { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] })
  assert.equal(n.body.isNutritionist, true)
  assert.ok(n.reads.includes('nutritionists') && !n.reads.includes('trainers'))
  const t = await loadRoute('nutritionist', { trainers: [{ id: 7 }] })
  assert.deepEqual(t.body, { isNutritionist: false })
  const other = await loadRoute('trainer', { nutritionists: [{ id: 9 }] })
  assert.deepEqual(other.body, { isTrainer: false })
})

test('the two routes are not one file', () => {
  const t = readFileSync(join(ROOT, 'src/app/api/trainer/analytics/route.ts'), 'utf8')
  const n = readFileSync(join(ROOT, 'src/app/api/nutritionist/analytics/route.ts'), 'utf8')
  assert.notEqual(t, n)
  assert.match(t, /\.from\('trainers'\)\s+\.select\('id, stripe_account_id, stripe_account_status'\)/)
  assert.match(t, /return NextResponse\.json\(\{ isTrainer: false \}\);/)
})

// ── Codex on #2324: the restored route's own figures ───────────────────────
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const sub = (client_id, price_cents = 10000) => ({ client_id, price_cents, fee_bps: 1500, status: 'active', created_at: '2026-09-01T00:00:00Z' })
const recent = new Date(Date.now() - 2 * 86400000).toISOString()
const roster = (over = {}) => ({
  trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }],
  subscriptions: [sub(A), sub(B)],
  workout_sessions: [{ id: 's1', client_id: A, started_at: recent, status: 'completed' }, { id: 's2', client_id: A, started_at: recent, status: 'reviewed' }],
  // Ordinary sets: none of them is a PR.
  workout_set_logs: Array.from({ length: 30 }, () => ({ client_id: A, created_at: recent, completed: true })),
  ...over,
})
const lifts = (prs) => ({ get_client_lifts: async ({ p_user_id }) => ({ data: { prs: prs[p_user_id] ?? 0, keyLifts: [] }, error: null }) })

test('PRs are lifts beaten, from get_client_lifts per client, never sets logged', async () => {
  const { body, calls } = await loadRoute('trainer', roster(), { rpcs: lifts({ [A]: 2, [B]: 1 }) })
  assert.equal(body.clientProgress.prs30d, 3)
  assert.deepEqual(body.clientProgress.roster.map((r) => [r.client_id, r.prs30d]).sort(), [[A, 2], [B, 1]])
  assert.deepEqual(calls.filter((c) => c.rpc === 'get_client_lifts').map((c) => c.args.p_user_id).sort(), [A, B])
  assert.ok(!calls.some((c) => c.table === 'workout_set_logs'), 'the set logs are not read as PRs')
  // One client's call failing leaves the total unknown, not short.
  const failed = await loadRoute('trainer', roster(), { rpcs: { get_client_lifts: async ({ p_user_id }) => (p_user_id === B ? { data: null, error: { message: 'x' } } : { data: { prs: 2 }, error: null }) } })
  assert.equal(failed.body.clientProgress.prs30d, null)
  assert.equal(failed.body.clientProgress.roster.find((r) => r.client_id === B).prs30d, null)
  assert.equal(failed.body.clientProgress.roster.find((r) => r.client_id === A).prs30d, 2)
  // A refused call (not this coach's client) answers null: unknown too.
  const refused = await loadRoute('trainer', roster(), { rpcs: { get_client_lifts: async () => ({ data: null, error: null }) } })
  assert.equal(refused.body.clientProgress.prs30d, null)
})

test('a reviewed session is a workout, and a failed workouts read is unknown, not zero', async () => {
  const { body, calls } = await loadRoute('trainer', roster(), { rpcs: lifts({}) })
  const ws = calls.find((c) => c.table === 'workout_sessions')
  assert.deepEqual(ws.ops.find((o) => o[0] === 'in' && o[1] === 'status'), ['in', 'status', ['completed', 'reviewed']])
  assert.equal(body.clientProgress.workouts30d, 2)
  const failed = await loadRoute('trainer', roster(), { errors: { workout_sessions: 'timeout' }, rpcs: lifts({}) })
  const cp = failed.body.clientProgress
  assert.deepEqual([cp.workouts30d, cp.workouts7d, cp.avgAdherencePct], [null, null, null])
  assert.ok(cp.roster.every((r) => r.workouts30d === null && r.workouts7d === null))
  assert.equal(failed.body.ticker.workouts7d, null)
  assert.equal(cp.activeClients, 2, 'what was read is still reported')
})

test('past 1,000 sessions the read pages on, by id; at the ceiling it is unknown, not short', async () => {
  const id = (i) => 's' + String(i).padStart(6, '0')
  const many = (n) => Array.from({ length: n }, (_, i) => ({ id: id(i), client_id: i % 2 ? A : B, started_at: recent, status: 'completed' }))
  const { body, calls } = await loadRoute('trainer', roster({ workout_sessions: many(2500) }), { rpcs: lifts({}) })
  assert.equal(body.clientProgress.workouts30d, 2500, 'every session, not the first 1,000')
  const pages = calls.filter((c) => c.table === 'workout_sessions')
  assert.equal(pages.length, 3)
  assert.deepEqual(pages.map((p) => p.ops.find((o) => o[0] === 'gt')?.[2] ?? null), [null, id(999), id(1999)], 'each page after the last id read')
  assert.ok(pages.every((p) => p.ops.some((o) => o[0] === 'order' && o[1] === 'id') && p.ops.some((o) => o[0] === 'limit' && o[1] === 1000)))
  const capped = await loadRoute('trainer', roster({ workout_sessions: many(50_000) }), { rpcs: lifts({}) })
  assert.deepEqual([capped.body.clientProgress.workouts30d, capped.body.clientProgress.avgAdherencePct], [null, null])
})

test('two subscription rows for one client are one client; the revenue keeps both', async () => {
  const { body } = await loadRoute('trainer', roster({ subscriptions: [sub(A), sub(A, 5000)] }), { rpcs: lifts({ [A]: 1 }) })
  assert.equal(body.clientProgress.activeClients, 1)
  assert.equal(body.clientProgress.roster.length, 1)
  assert.equal(body.clientProgress.prs30d, 1, 'not counted twice')
  assert.equal(body.clientProgress.workouts30d, 2, 'not counted twice')
  assert.equal(body.metrics.mrrGrossCents, 15000)
})

test('the Business cards print an unread figure as a dash, never as 0', () => {
  const src = readFileSync(join(ROOT, 'public/newdesign/dashBusiness.jsx'), 'utf8')
  const start = src.indexOf('const dbzFig =')
  const dbzFig = new Function(`${src.slice(start, src.indexOf('\n', start))}\nreturn dbzFig;`)()
  assert.deepEqual([dbzFig(null), dbzFig(undefined), dbzFig(0), dbzFig(88, '%'), dbzFig(null, '%')], ['—', '—', '0', '88%', '—'])
  const trainer = src.slice(src.indexOf('  trainer: {', start), src.indexOf('  nutritionist: {', start))
  assert.doesNotMatch(trainer, /\?\? 0/, 'no trainer figure falls back to 0')
  assert.match(trainer, /k: dbzFig\(cp\.prs30d\), l: "PRs hit"/)
})

test('no failed read in the trainer route is published as an empty history', async () => {
  const ok = await loadRoute('trainer', roster({ subscriptions: [sub(A)] }), { rpcs: lifts({}) })
  // (The fake answers every subscriptions read alike, so the churn read gets rows: a list, not null.)
  assert.deepEqual([Array.isArray(ok.body.churn), ok.body.clientProgress.weightsUnknown, ok.body.metrics.totalSessions, ok.body.ticker.programsCount], [true, false, 0, 0], 'a read that worked is reported as read')
  for (const [table, check] of [
    ['subscriptions', null], // the primary read: covered by coach-roster-revenue-unknown
    ['daily_health_snapshot', (b) => assert.equal(b.clientProgress.weightsUnknown, true)],
    ['sessions', (b) => assert.deepEqual([b.metrics.totalSessions, b.metrics.completedSessions, b.metrics.upcomingSessions, b.ticker.bookedToday, b.ticker.upcomingSessions], [null, null, null, null, null])],
    ['client_workouts', (b) => assert.equal(b.ticker.programsCount, null)],
  ]) {
    if (!check) continue
    const { body } = await loadRoute('trainer', roster({ subscriptions: [sub(A)] }), { errors: { [table]: 'timeout' }, rpcs: lifts({}) })
    check(body)
  }
  // The churn read is the second subscriptions read; fail only it.
  const churnFails = fakeSupabase(roster({ subscriptions: [sub(A)] }), { rpcs: lifts({}) })
  const realFrom = churnFails.client.from
  let subsReads = 0
  churnFails.client.from = (t) => {
    if (t === 'subscriptions' && ++subsReads === 2) return { select: () => new Proxy({}, { get: (_x, p) => (p === 'then' ? (res) => res({ data: null, error: { message: 'timeout' } }) : () => churnProxy()) }) }
    return realFrom(t)
  }
  function churnProxy() { return new Proxy({}, { get: (_x, p) => (p === 'then' ? (res) => res({ data: null, error: { message: 'timeout' } }) : () => churnProxy()) }) }
  const route = await loadRealModule(join(ROOT, 'src/app/api/trainer/analytics/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => churnFails.client }],
      ['@/lib/supabase/admin', { createAdminClient: () => churnFails.client }],
      ['@/lib/stripe', { loadStripe: async () => ({ connected: false }), loadCancelFlags: async (ids) => new Map(ids.map((id) => [id, false])) }],
      ['@/lib/coach-renewals.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-renewals.mjs')).href)],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/origin-attribution', await loadRealModule(join(ROOT, 'src/lib/origin-attribution.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) })],
      ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)],
      ['@/lib/read-all-by-id', await loadRealModule(join(ROOT, 'src/lib/read-all-by-id.ts'), { typescript: true })],
    ]),
  })
  const body = await (await route.GET(new Request('https://shape.test/api/trainer/analytics'))).json()
  assert.equal(body.churn, null)
  assert.equal(body.metrics.activeClients, 1, 'the rest of the page is still read')
  // And a failed read of the trainer's own row is an error, not "not a trainer".
  const rowFails = await loadRoute('trainer', roster(), { errors: { trainers: 'timeout' } })
  assert.deepEqual(rowFails.body, { error: 'Could not read your listing.' })
})

test('the Business page says an unread churn or weigh-in, rather than "none"', () => {
  const src = readFileSync(join(ROOT, 'public/newdesign/dashBusiness.jsx'), 'utf8')
  const churn = src.slice(src.indexOf('function DbzChurnZone('), src.indexOf('const rows = live ?', src.indexOf('function DbzChurnZone(')))
  assert.match(churn, /if \(live && churn === null\) \{\s+return <div[^>]*>Couldn't read your cancellations just now\./)
  assert.match(src, /\{cp && cp\.weightsUnknown \? "Couldn't read weigh-ins just now\." : "No weight-loss trends yet\."\}/)
})

// ── Codex on b694159: every read complete, every count exact ───────────────
test('weigh-ins are read in full and each client\'s first and latest are by date, not by id', async () => {
  const day = (i) => new Date(Date.now() - (29 - (i % 30)) * 86400000).toISOString().slice(0, 10)
  // 2,500 weigh-ins for A whose ids run opposite to their dates, plus B's two.
  const snaps = Array.from({ length: 2500 }, (_, i) => ({ id: 'w' + String(2499 - i).padStart(6, '0'), user_id: A, snapshot_date: day(Math.floor(i / 84)), weight_lb: 200 - Math.floor(i / 84) }))
    .concat([{ id: 'x1', user_id: B, snapshot_date: day(29), weight_lb: 150 }, { id: 'x0', user_id: B, snapshot_date: day(0), weight_lb: 160 }])
  const { body, calls } = await loadRoute('trainer', roster({ daily_health_snapshot: snaps }), { rpcs: lifts({}) })
  const reads = calls.filter((c) => c.table === 'daily_health_snapshot')
  assert.equal(reads.length, 3, 'three pages, not the first 1,000')
  assert.ok(reads.every((r) => r.ops.some((o) => o[0] === 'not' && o[1] === 'weight_lb' && o[2] === 'is' && o[3] === null)), 'weigh-ins only')
  const a = body.clientProgress.roster.find((r) => r.client_id === A)
  const b = body.clientProgress.roster.find((r) => r.client_id === B)
  assert.deepEqual([a.weightStart, a.weightLatest], [200, 171])
  assert.deepEqual([b.weightStart, b.weightLatest, b.weightChangeLb], [160, 150, -10])
  assert.equal(body.clientProgress.weightsUnknown, false)
})

test('a workout with no start time counts by its end, else by when it was logged', async () => {
  const old = new Date(Date.now() - 60 * 86400000).toISOString()
  const { body, calls } = await loadRoute('trainer', roster({ workout_sessions: [
    { id: 's1', client_id: A, started_at: null, ended_at: recent, created_at: old, status: 'completed' },
    { id: 's2', client_id: A, started_at: null, ended_at: null, created_at: recent, status: 'completed' },
  ] }), { rpcs: lifts({}) })
  const or = calls.find((c) => c.table === 'workout_sessions').ops.find((o) => o[0] === 'or')[1]
  assert.match(or, /^started_at\.gte\."[^"]+",and\(started_at\.is\.null,ended_at\.gte\."[^"]+"\),and\(started_at\.is\.null,ended_at\.is\.null,created_at\.gte\."[^"]+"\)$/)
  assert.deepEqual([body.clientProgress.workouts30d, body.clientProgress.workouts7d], [2, 2], 'both in the week, by end and by log time')
})

test('appointment counts are counted by the database, each with its own filter', async () => {
  const { calls } = await loadRoute('trainer', roster(), { rpcs: lifts({}) })
  const counts = calls.filter((c) => c.table === 'sessions')
  assert.equal(counts.length, 4)
  assert.ok(counts.every((c) => c.ops.some((o) => o[0] === 'select' && o[2]?.count === 'exact' && o[2]?.head === true)), 'head counts, no rows')
  assert.ok(!counts.some((c) => c.ops.some((o) => o[0] === 'limit')), 'no row limit')
  const has = (c, op, col, v) => c.ops.some((o) => o[0] === op && o[1] === col && (v === undefined || JSON.stringify(o[2]) === JSON.stringify(v)))
  assert.ok(has(counts[1], 'eq', 'status', 'completed'))
  assert.ok(has(counts[2], 'in', 'status', ['requested', 'confirmed']) && has(counts[2], 'gte', 'scheduled_at'))
  assert.ok(has(counts[3], 'gte', 'scheduled_at') && has(counts[3], 'lt', 'scheduled_at') && has(counts[3], 'neq', 'status', 'cancelled'))
})

test('every active subscription is read, a page at a time', async () => {
  const many = Array.from({ length: 2500 }, (_, i) => ({ ...sub('c' + String(i).padStart(6, '0'), 1000), id: 'u' + String(i).padStart(6, '0') }))
  const { body, calls } = await loadRoute('trainer', roster({ subscriptions: many }), { rpcs: lifts({}) })
  assert.equal(body.metrics.activeClients, 2500)
  assert.equal(body.metrics.mrrGrossCents, 2500 * 1000)
  const pages = calls.filter((c) => c.table === 'subscriptions' && c.ops.some((o) => o[0] === 'in' && o[1] === 'status'))
  assert.equal(pages.length, 3)
  assert.ok(pages.every((p) => p.ops.some((o) => o[0] === 'order' && o[1] === 'id') && p.ops.some((o) => o[0] === 'limit' && o[1] === 1000)))
})

test('a failed subscriptions read leaves every roster outcome unknown, not 0 or "no trends"', async () => {
  const { body } = await loadRoute('trainer', roster(), { errors: { subscriptions: 'timeout' }, rpcs: lifts({}) })
  const cp = body.clientProgress
  assert.deepEqual([cp.activeClients, cp.workouts30d, cp.workouts7d, cp.prs30d, cp.avgAdherencePct, cp.weightsUnknown, cp.rosterUnknown], [null, null, null, null, null, true, true])
  assert.equal(body.ticker.workouts7d, null)
  assert.equal(body.byOrigin, null, 'the origin feed is built from the same rows')
  // And a roster that really is empty still reads as zero.
  const none = await loadRoute('trainer', roster({ subscriptions: [] }), { rpcs: lifts({}) })
  assert.deepEqual([none.body.clientProgress.workouts30d, none.body.clientProgress.prs30d, none.body.clientProgress.weightsUnknown, none.body.clientProgress.rosterUnknown], [0, 0, false, false])
  // The consistency panel says it could not read the roster, rather than "No history yet".
  const page = readFileSync(join(ROOT, 'public/newdesign/dashBusiness.jsx'), 'utf8')
  assert.match(page, /\{cp && cp\.rosterUnknown \? "Couldn't read your roster just now\." : "No history yet\."\}/)
  assert.ok(Array.isArray(none.body.byOrigin))
  const origin = page.slice(page.indexOf('function DbzOriginZone('), page.indexOf('const rows = live ?', page.indexOf('function DbzOriginZone(')))
  assert.match(origin, /if \(live && byOrigin === null\) \{\s+return <div[^>]*>Couldn't read where your clients came from just now\./)
})

// ── Business page, Money tab (design E): renewals this week ────────────────
test('renewals: the active rows due in the next 7 days, each asked of Stripe, net at the stored fee', async () => {
  const soon = (d) => new Date(Date.now() + d * 86400000).toISOString()
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const subs = [
    { ...sub(A, 18000), id: 'r1', stripe_subscription_id: 'sub_A', current_period_end: soon(2) },
    { ...sub(B, 16500), id: 'r2', fee_bps: 0, stripe_subscription_id: 'sub_B', current_period_end: soon(5) },
    { ...sub(C, 20000), id: 'r3', stripe_subscription_id: 'sub_C', current_period_end: soon(12) },
  ]
  for (const role of ['trainer', 'nutritionist']) {
    const flagCalls = []
    const tables = role === 'trainer' ? roster({ subscriptions: subs }) : { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }], subscriptions: subs.map((r) => ({ ...r, provider_role: 'nutritionist' })) }
    const { body } = await loadRoute(role, tables, { rpcs: lifts({}), cancelled: ['sub_B'], flagCalls, query: '?renewals=1' })
    assert.deepEqual(flagCalls.map((c) => c.ids), [['sub_A', 'sub_B']], role + ': only the rows due this week are asked about')
    assert.deepEqual(body.renewals.map((r) => [r.priceCents, r.netCents, r.ending]), [[18000, 15300, false], [16500, 16500, true]], role)
  }
})

test('renewals: a failed subscriptions read is "could not read", not "no one renews"', async () => {
  const flagCalls = []
  const { body } = await loadRoute('trainer', roster(), { errors: { subscriptions: 'timeout' }, rpcs: lifts({}), flagCalls, query: '?renewals=1' })
  assert.equal(body.renewals, null)
  assert.deepEqual(flagCalls.map((c) => c.ids), [[]], 'Stripe is not asked about rows nobody read')
})

test('renewals are read only when the page asks: the Goal page\'s figures cost no Stripe reads', async () => {
  const soon = new Date(Date.now() + 2 * 86400000).toISOString()
  const flagCalls = []
  const { body } = await loadRoute('trainer', roster({ subscriptions: [{ ...sub(A), id: 'r1', stripe_subscription_id: 'sub_A', current_period_end: soon }] }), { rpcs: lifts({}), flagCalls })
  assert.ok(!('renewals' in body), 'no renewals without ?renewals=1')
  assert.deepEqual(flagCalls.map((c) => c.ids), [[]], 'and Stripe is asked about nothing')
  const page = readFileSync(join(ROOT, 'public/newdesign/dashBusiness.jsx'), 'utf8')
  assert.match(page, /fetch\(cfg\.api \+ "\?renewals=1"/, 'the Business page asks for them')
})

// ── Business review 2026-10-17: the nutritionist route keeps the trainer route's rules ──
test('nutritionist: one client is one client, a failed read is said, not zero', async () => {
  const nutri = { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] }
  const two = [{ ...sub(A, 10000), id: 'n1', provider_role: 'nutritionist' }, { ...sub(A, 5000), id: 'n2', provider_role: 'nutritionist' }, { ...sub(B, 10000), id: 'n3', provider_role: 'nutritionist' }]
  const { body } = await loadRoute('nutritionist', { ...nutri, subscriptions: two })
  assert.equal(body.metrics.activeClients, 2, 'two clients, though one holds two rows')
  assert.equal(body.metrics.mrrGrossCents, 25000, 'every row still counts toward revenue')
  const failed = await loadRoute('nutritionist', { ...nutri, subscriptions: two }, { errors: { subscriptions: 'timeout' } })
  assert.equal(failed.body.byOrigin, null, 'the origin feed is built from the same rows')
  assert.equal(failed.body.clientProgress.rosterUnknown, true)
  assert.equal(failed.body.churn, null, 'the churn read failed too: unread, not "no cancellations"')
  const rowFails = await loadRoute('nutritionist', nutri, { errors: { nutritionists: 'timeout' } })
  assert.deepEqual(rowFails.body, { error: 'Could not read your listing.' }, 'not "this account is not a nutritionist"')
})

// ── Codex, #2394: the practice trajectory reads every row ────────────────────
test('both routes read the whole practice trajectory, so a long-standing client is still today\'s', async () => {
  // 1,200 subscription rows: one client on the same plan for three years, and 1,199 who came
  // and went this year. A newest-first read cut at 1,000 lost the oldest 200, the long-standing
  // client among them, and the Plan started from one client too few.
  const DAY = 86400000
  const at = (d) => new Date(Date.now() - d * DAY).toISOString()
  // Its row has the highest id too, so it sits on the last page: one page of the walk misses it.
  const subs = [{ id: 'r9999', client_id: 'old', created_at: at(3 * 365), status: 'active', price_cents: 20000, fee_bps: 1500, current_period_end: at(-20) }]
  for (let i = 1; i < 1200; i += 1) {
    subs.push({ id: 'r' + String(i).padStart(4, '0'), client_id: 'c' + i, created_at: at(300 - (i % 280)), status: 'canceled', price_cents: 15000, fee_bps: 1500, current_period_end: at(200 - (i % 190)) })
  }
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] }]]) {
    const { body, calls } = await loadRoute(role, { ...listing, subscriptions: subs })
    const weeks = body.trajectory?.weeks
    assert.ok(weeks && weeks.length, role + ': ' + JSON.stringify(body.trajectory).slice(0, 200))
    assert.equal(weeks[weeks.length - 1].active, 1, role + ': the three-year client is active today')
    assert.equal(body.trajectory.firstSubAt.slice(0, 10), subs[0].created_at.slice(0, 10), role + ': the practice began three years ago')
    const traj = calls.filter((c) => c.table === 'subscriptions' && c.ops.some(([op, col]) => op === 'order' && col === 'id') && !c.ops.some(([op, col]) => op === 'eq' && col === 'status') && !c.ops.some(([op]) => op === 'in'))
    assert.ok(traj.length >= 2, role + ': the trajectory read pages by id')
  }
})

// ── Codex, #2394: the brought-in share is per client ─────────────────────────
test('both routes send the brought-in share per client, not per subscription row', async () => {
  // A was brought (0%) and holds a second plan; B found the coach on Shape. That is 1 of 2
  // clients, not 2 of 3 rows.
  const rows = (role) => [{ ...sub(A), id: 'r1', fee_bps: 0, provider_role: role }, { ...sub(A, 5000), id: 'r2', provider_role: role }, { ...sub(B), id: 'r3', provider_role: role }]
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] }]]) {
    const { body } = await loadRoute(role, { ...listing, subscriptions: rows(role) })
    assert.deepEqual(body.byoMix, { clients: 2, brought: 1 }, role)
    assert.equal(body.byOrigin.filter((r) => r.kind === 'subscription').length, 3, role + ': the origin feed still lists each row')
    const failed = await loadRoute(role, { ...listing, subscriptions: rows(role) }, { errors: { subscriptions: 'timeout' } })
    assert.equal(failed.body.byoMix, null, role + ': an unread share is unread, not 0%')
  }
})
