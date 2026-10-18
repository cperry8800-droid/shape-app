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
const APP_TOKEN = 'app-access-token'

// Every table read answers from `tables` (or `errors`); any chain of filters is accepted, and
// recorded. `rpc` answers from `rpcs[name](args)`.
// `auth` is what getUser resolves (a signed-in coach unless a test says otherwise).
// `honorStatus` also applies status filters (eq / in / not in on `status`), for a test whose rows
// differ by status; `failActive` fails the active-subscriptions walk (its `.in('status', …)`) alone,
// and `failTrajectory` / `failHistory` the trajectory's walk over every row (no status filter) alone:
// the first matches any subscriptions read without one, the second only the walk ordered by id.
// `failCall(call)` fails any one read it picks ({ table, ops }), e.g. one batch of the names read.
function fakeSupabase(tables, { errors = {}, rpcs = {}, auth = null, honorStatus = false, failActive = false, failTrajectory = false, failHistory = false, failCall = null } = {}) {
  const reads = []
  const calls = []
  const from = (table) => {
    reads.push(table)
    const call = { table, ops: [] }
    calls.push(call)
    const rows = tables[table] ?? []
    // gt, order and limit are honoured (on whatever column they name), so a paged read pages; and an
    // `in` on `id` (the names read's batches: no other read the routes make filters on `id`).
    const answer = () => {
      if (errors[table]) return { data: null, error: { message: errors[table] }, count: null }
      if (failCall && failCall(call)) return { data: null, error: { message: 'timeout' }, count: null }
      if (failActive && call.ops.some(([op, col]) => op === 'in' && col === 'status')) return { data: null, error: { message: 'timeout' }, count: null }
      if (failTrajectory && table === 'subscriptions' && !call.ops.some(([, col]) => col === 'status')) return { data: null, error: { message: 'timeout' }, count: null }
      if (failHistory && table === 'subscriptions' && call.ops.some(([op, col]) => op === 'order' && col === 'id') && !call.ops.some(([op, col]) => ['eq', 'in', 'not'].includes(op) && col === 'status')) return { data: null, error: { message: 'timeout' }, count: null }
      let out = rows
      if (honorStatus) for (const [op, col, v, w] of call.ops) {
        if (op === 'eq' && col === 'status') out = out.filter((r) => r.status === v)
        if (op === 'in' && col === 'status') out = out.filter((r) => v.includes(r.status))
        // PostgREST's not.in.(a,b): `.not('status', 'in', '(a,b)')`.
        if (op === 'not' && col === 'status' && v === 'in') { const list = String(w).replace(/^\(|\)$/g, '').split(','); out = out.filter((r) => !list.includes(r.status)) }
      }
      for (const [op, col, v] of call.ops) if (op === 'gt') out = out.filter((r) => String(r[col]) > String(v))
      for (const [op, col, v] of call.ops) if (op === 'in' && col === 'id') out = out.filter((r) => v.includes(r.id))
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
  return { reads, calls, bearer: [], client: { from, rpc, auth: { getUser: async () => auth ?? { data: { user: COACH }, error: null } } } }
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
      // Since 2026-10-18 each row is { id, account } (the account a direct charge lives on); `ids` keeps the ids.
      ['@/lib/stripe', { loadStripe: async () => ({ connected: false }), loadCancelFlags: async (rows, cap) => { const ids = rows.map((r) => (typeof r === 'string' ? r : r.id)); opts?.flagCalls?.push({ ids, rows, cap }); return new Map(ids.map((id) => [id, (opts?.cancelled || []).includes(id)])) } }],
      ['@/lib/coach-renewals.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-renewals.mjs')).href)],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/origin-attribution', await ts('src/lib/origin-attribution.ts')],
      ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)],
      ['@/lib/read-all-by-id', await ts('src/lib/read-all-by-id.ts')],
      ['@/lib/client-names', await ts('src/lib/client-names.ts')],
      ['@/lib/auth-lookup', await ts('src/lib/auth-lookup.ts')],
      // The real request-auth: the cookie client when there is no Bearer token, else a client made
      // for the token, which answers only the app's token (APP_TOKEN) as the coach.
      ['@/lib/request-auth', await loadRealModule(join(ROOT, 'src/lib/request-auth.ts'), {
        typescript: true,
        registry: new Map([
          ['@/lib/supabase/server', { createClient: async () => db.client }],
          ['@supabase/supabase-js', { createClient: (_url, _key, o) => {
            db.bearer.push(o?.global?.headers?.Authorization)
            return { ...db.client, auth: { getUser: async (token) => opts?.bearerAuth ?? ({ data: { user: token === APP_TOKEN ? COACH : null }, error: null }) } }
          } }],
        ]),
      })],
    ]),
  })
  const res = await route.GET(new Request(`https://shape.test/api/${role}/analytics${opts?.query || ''}`, { headers: opts?.headers || {} }))
  return { status: res.status, body: await res.json(), reads: db.reads, calls: db.calls, bearer: db.bearer }
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

// The app's Business page (2026-10-17) reads these routes with its own token: the routes were
// cookie-only, so the app could not read them at all.
test('the app\'s Bearer token reads as the coach on both routes; a token that is not valid is a 401', async () => {
  for (const [role, table, okKey] of [['trainer', 'trainers', 'isTrainer'], ['nutritionist', 'nutritionists', 'isNutritionist']]) {
    const app = await loadRoute(role, { [table]: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }, { headers: { Authorization: `Bearer ${APP_TOKEN}` } })
    assert.equal(app.status, 200, role)
    assert.equal(app.body[okKey], true, role)
    assert.ok(app.bearer.length >= 1 && app.bearer.every((h) => h === `Bearer ${APP_TOKEN}`), `${role}: the reads ran as the token, ${app.bearer.join(', ')}`)
    const bad = await loadRoute(role, { [table]: [{ id: 7 }] }, { headers: { Authorization: 'Bearer expired' } })
    assert.equal(bad.status, 401, role)
    // The website, as before: no header, the cookie session.
    const web = await loadRoute(role, { [table]: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] })
    assert.equal(web.body[okKey], true, role)
    assert.deepEqual(web.bearer, [], `${role}: no token, no token client`)
  }
})

// The 503 rule (src/lib/auth-lookup.ts) holds for the app's token too: request-auth's lookup keeps
// the auth server's error on the Bearer path, so an outage is not read as a refused token.
test('an auth outage behind the app\'s Bearer token answers 503; a refused token is a 401', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    const headers = { Authorization: `Bearer ${APP_TOKEN}` }
    const down = await loadRoute(role, roster(), { headers, bearerAuth: noUser(new AuthRetryableFetchError('fetch failed', 0)) })
    assert.equal(down.status, 503, `${role}: ${JSON.stringify(down.body)}`)
    assert.deepEqual(down.reads, [])
    const refused = await loadRoute(role, roster(), { headers, bearerAuth: noUser(new AuthApiError('invalid JWT', 403, 'bad_jwt')) })
    assert.equal(refused.status, 401, role)
  }
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

// ── An auth outage is not a signed-out viewer (review of #2394) ─────────────
// getUser() resolves { user: null, error } for an outage exactly as it does for a visitor with no
// session: auth-js turns a dead network or an auth-server 5xx into an AuthRetryableFetchError and
// hands it back with a null user. Both routes read `!user` as "answer 401", and the Business page
// reads a 401 as "show the preview", so an outage showed a signed-in coach the preview's payouts,
// renewals and plan. The errors are the SDK's own, not look-alikes.
const { AuthRetryableFetchError, AuthSessionMissingError, AuthApiError } = require_('@supabase/supabase-js')
const noUser = (error) => ({ data: { user: null }, error })

test('an auth outage answers 503 in both routes; only a missing or refused session is a 401', async () => {
  for (const role of ['trainer', 'nutritionist']) {
    for (const [why, error] of [
      ['the auth server could not be reached', new AuthRetryableFetchError('fetch failed', 0)],
      ['the auth server answered a 502', new AuthRetryableFetchError('Bad Gateway', 502)],
      ['the auth server was rate limiting', new AuthApiError('too many requests', 429, 'over_request_rate_limit')],
      ['an error nobody anticipated', new Error('something else')],
    ]) {
      const r = await loadRoute(role, roster(), { auth: noUser(error) })
      assert.equal(r.status, 503, `${role}, ${why}: ${JSON.stringify(r.body)}`)
      assert.deepEqual(r.body, { error: 'Could not check your sign-in just now.' })
      assert.deepEqual(r.reads, [], `${role}, ${why}: nothing is read for a viewer the route could not identify`)
    }
    for (const [why, error] of [
      ['a clean read that found nobody', null],
      ['no session at all', new AuthSessionMissingError()],
      ['a token the auth server refused', new AuthApiError('invalid JWT', 403, 'bad_jwt')],
      ['no authorization presented', new AuthApiError('no authorization', 401, 'no_authorization')],
    ]) {
      const r = await loadRoute(role, roster(), { auth: noUser(error) })
      assert.equal(r.status, 401, `${role}, ${why}: ${JSON.stringify(r.body)}`)
      assert.deepEqual(r.body, { error: 'Authentication required.' })
      assert.deepEqual(r.reads, [])
    }
  }
})

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
      ['@/lib/request-auth', { clientForRequest: async () => churnFails.client, userLookupForRequest: async () => ({ user: COACH, error: null }) }],
      ['@/lib/stripe', { loadStripe: async () => ({ connected: false }), loadCancelFlags: async (rows) => new Map(rows.map((r) => [typeof r === 'string' ? r : r.id, false])) }],
      ['@/lib/coach-renewals.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-renewals.mjs')).href)],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/origin-attribution', await loadRealModule(join(ROOT, 'src/lib/origin-attribution.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) })],
      ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)],
      ['@/lib/read-all-by-id', await loadRealModule(join(ROOT, 'src/lib/read-all-by-id.ts'), { typescript: true })],
      ['@/lib/client-names', await loadRealModule(join(ROOT, 'src/lib/client-names.ts'), { typescript: true })],
      ['@/lib/auth-lookup', await loadRealModule(join(ROOT, 'src/lib/auth-lookup.ts'), { typescript: true })],
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
    // sub_B is a direct charge on the coach's own account (2026-10-18): it is asked there.
    { ...sub(B, 16500), id: 'r2', fee_bps: 0, stripe_subscription_id: 'sub_B', stripe_account_id: 'acct_coach123456', current_period_end: soon(5) },
    { ...sub(C, 20000), id: 'r3', stripe_subscription_id: 'sub_C', current_period_end: soon(12) },
  ]
  for (const role of ['trainer', 'nutritionist']) {
    const flagCalls = []
    const tables = role === 'trainer' ? roster({ subscriptions: subs }) : { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }], subscriptions: subs.map((r) => ({ ...r, provider_role: 'nutritionist' })) }
    const { body } = await loadRoute(role, tables, { rpcs: lifts({}), cancelled: ['sub_B'], flagCalls, query: '?renewals=1' })
    assert.deepEqual(flagCalls.map((c) => c.ids), [['sub_A', 'sub_B']], role + ': only the rows due this week are asked about')
    assert.deepEqual(flagCalls[0].rows, [{ id: 'sub_A', account: null }, { id: 'sub_B', account: 'acct_coach123456' }], role + ': each with the account it lives on')
    assert.deepEqual(body.renewals.map((r) => [r.priceCents, r.netCents, r.ending]), [[18000, 15300, false], [16500, 16500, true]], role)
    assert.deepEqual(body.renewals.map((r) => r.clientId), [A, B], role + ': each renewal says whose plan it is, so the page counts people')
  }
})

// ── Codex round 8 (#2394) and the sweep after round 10: departures, decided when each plan ended ──
// A plan that ended is a departure unless its client held another plan at the close of the week it
// ended in (coach-trajectory.mjs subDeparture, the trajectory's leftIn rule). Whether they hold one NOW
// is not the question: a client who left and came back in a later week still left.
test('each ended plan says whose it is and whether it ended their membership, decided at its week\'s close', async () => {
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const F = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  const J = 'jjjjjjjj-jjjj-4jjj-8jjj-jjjjjjjjjjjj'
  const K = 'kkkkkkkk-kkkk-4kkk-8kkk-kkkkkkkkkkkk'
  const at = (iso, o) => ({ created_at: iso, ...o })
  const subs = [
    // A dropped one plan while holding another that opened before it ended: not a departure.
    { ...sub(A, 18000), id: 'r1' },
    { ...sub(A, 12000), id: 'r2', ...at('2026-08-01T00:00:00Z'), status: 'canceled', current_period_end: '2026-10-01T00:00:00Z' },
    // C left: no other plan.
    { ...sub(C, 15000), id: 'r3', status: 'canceled', current_period_end: '2026-10-02T00:00:00Z' },
    // D's other plan is retrying (past_due): still a membership, as the trajectory counts it (Codex round 9).
    { ...sub(D, 9000), id: 'r4', status: 'past_due' },
    { ...sub(D, 7000), id: 'r5', status: 'canceled', current_period_end: '2026-09-30T00:00:00Z' },
    // A row with no client has no other plan to hold: a departure.
    { ...sub(null, 5000), id: 'r6', status: 'canceled', current_period_end: '2026-09-29T00:00:00Z' },
    // E LEFT ON AUG 20 AND CAME BACK ON SEP 25: active now, and the Aug 20 departure is still one.
    { ...sub(E, 14000), id: 'r7', ...at('2026-06-01T00:00:00Z'), status: 'canceled', current_period_end: '2026-08-20T00:00:00Z' },
    { ...sub(E, 14000), id: 'r8', ...at('2026-09-25T00:00:00Z') },
    // An 'unpaid' plan closed the span in the trajectory, so it is an ended plan here too.
    { ...sub(F, 6000), id: 'r9', ...at('2026-07-01T00:00:00Z'), status: 'unpaid', current_period_end: '2026-09-28T00:00:00Z' },
    // A checkout never paid is no row at all: not listed.
    { ...sub(C, 6000), id: 'r10', status: 'incomplete_expired', current_period_end: '2026-09-27T00:00:00Z' },
    // J's Sep 10 cancellation came while another plan was open (it ended later, Oct 5): not a
    // departure. That later one ended theirs.
    { ...sub(J, 8000), id: 'r12', ...at('2026-07-01T00:00:00Z'), status: 'canceled', current_period_end: '2026-09-10T00:00:00Z' },
    { ...sub(J, 8000), id: 'r13', ...at('2026-08-01T00:00:00Z'), status: 'canceled', current_period_end: '2026-10-05T00:00:00Z' },
    // K ended two plans at the same moment: each row ended their membership (the page makes them one).
    { ...sub(K, 4000), id: 'r14', ...at('2026-06-01T00:00:00Z'), status: 'canceled', current_period_end: '2026-09-15T00:00:00Z' },
    { ...sub(K, 3000), id: 'r15', ...at('2026-07-01T00:00:00Z'), status: 'canceled', current_period_end: '2026-09-15T00:00:00Z' },
  ]
  for (const role of ['trainer', 'nutritionist']) {
    const tables = role === 'trainer' ? roster({ subscriptions: subs }) : { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }], subscriptions: subs.map((r) => ({ ...r, provider_role: 'nutritionist' })) }
    const { body, calls } = await loadRoute(role, tables, { rpcs: lifts({}), honorStatus: true })
    assert.deepEqual(body.churn.map((r) => [r.clientId, r.endedAt.slice(0, 10), r.departed]), [
      [J, '2026-10-05', true], [C, '2026-10-02', true], [A, '2026-10-01', false], [D, '2026-09-30', false], [null, '2026-09-29', true],
      [F, '2026-09-28', true], [K, '2026-09-15', true], [K, '2026-09-15', true], [J, '2026-09-10', false], [E, '2026-08-20', true],
    ], role + ': newest first; F\'s unpaid plan ended; A and D held another plan; J left once, in October; K left once with two plans; E left, though back now')
    assert.ok(!body.churn.some((r) => 'stillClient' in r), role + ': no field says who is here now')
    // The read takes the trajectory's closed set: everything but open and never-started.
    const churnRead = calls.find((c) => c.table === 'subscriptions' && c.ops.some(([op, col]) => op === 'order' && col === 'current_period_end'))
    assert.deepEqual(churnRead.ops.filter(([op, col]) => col === 'status'), [['not', 'status', 'in', '(active,trialing,past_due,incomplete,incomplete_expired)']], role)
    assert.ok(has(churnRead, 'limit', 12) && has(churnRead, 'eq', 'provider_role', role), role)
    // The round-9 read of the churned clients' past_due plans is gone: the trajectory's rows decide.
    assert.ok(!calls.some((c) => c.table === 'subscriptions' && c.ops.some(([op, col, v]) => op === 'eq' && col === 'status' && v === 'past_due')), role + ': no separate retrying read')
    // A failed active read is not a failed history: each row is still decided.
    const noActive = await loadRoute(role, tables, { rpcs: lifts({}), honorStatus: true, failActive: true })
    assert.deepEqual(noActive.body.churn.map((r) => r.departed), body.churn.map((r) => r.departed), role + ': the active read does not decide who left')
    // The trajectory's rows unread: no one is known to have left, and the list is still read.
    const unread = await loadRoute(role, tables, { rpcs: lifts({}), honorStatus: true, failHistory: true })
    assert.equal(unread.body.trajectory, null, role)
    assert.deepEqual(unread.body.churn.map((r) => r.departed), Array(10).fill(null), role + ': who left is unread')
    assert.equal(unread.body.churn[0].endedAt.slice(0, 10), '2026-10-05', role + ': the dates are still the rows\' own')
  }
})

test('a client who left and came back is listed as a departure in both routes, matching the trajectory', async () => {
  const E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const day = 86400000
  const ago = (d) => new Date(Date.now() - d * day).toISOString()
  // Left 40 days ago after four months; came back 10 days ago.
  const subs = (role) => [
    { ...sub(E, 14000), id: 'r1', provider_role: role, created_at: ago(160), status: 'canceled', current_period_end: ago(40) },
    { ...sub(E, 14000), id: 'r2', provider_role: role, created_at: ago(10) },
  ]
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', NUTRI]]) {
    const { body } = await loadRoute(role, { ...listing, subscriptions: subs(role) }, { rpcs: lifts({}), honorStatus: true })
    assert.deepEqual(body.churn.map((r) => [r.clientId, r.departed]), [[E, true]], role + ': the departure is listed, though the client is back')
    const ended = body.trajectory.weeks.reduce((s, w) => s + w.ended, 0)
    assert.equal(ended, 1, role + ': the trajectory counts the same departure')
    assert.equal(body.trajectory.weeks[body.trajectory.weeks.length - 1].active, 1, role + ': and the client as active today')
  }
})

// Its review: each row is decided at the close of the ISO week it ended in, the instant the trajectory's
// weekly `ended` is judged at, so the list and the pace count the same departures. Judged at the
// instant itself, a client back on the Thursday of the week they left in was a departure in the list
// and none in the trajectory (the Retention tab's "No one has left" above "1 left").
test('a client back later in the week they left in is no departure, in both routes, as trajectory.weeks\' ended has it', async () => {
  const X = 'abababab-abab-4bab-8bab-abababababab'
  const CF = require_(join(ROOT, 'public/newdesign/coachForecast.js'))
  const day = 86400000
  // The Monday three weeks back, so the whole week is past and inside the pace's window.
  const now = Date.now()
  const m = new Date(now); m.setUTCHours(0, 0, 0, 0); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7))
  const monday = m.getTime() - 21 * day
  const iso = (t) => new Date(t).toISOString()
  const weekOf = iso(monday).slice(0, 10)
  const others = (role) => Array.from({ length: 5 }, (_, i) => ({ ...sub('0000000' + i + '-0000-4000-8000-000000000000', 18000), id: 'o' + i, provider_role: role, created_at: iso(now - 200 * day) }))
  // x's plan ends on the Monday at 10:00 (a card failed).
  const mon = (role) => ({ ...sub(X, 18000), id: 'x1', provider_role: role, created_at: iso(now - 200 * day), status: 'unpaid', current_period_end: iso(monday + 10 * 3600000) })
  const cases = [
    // Back on the Thursday: no one left that week.
    ['back on the Thursday', (role) => [{ ...sub(X, 18000), id: 'x2', provider_role: role, created_at: iso(monday + 3 * day + 9 * 3600000) }], [false], 0, 0],
    // Back on the Tuesday, gone again on the Wednesday: one departure, and the money lost is the plan
    // held when they left, not the Monday membership too (Codex on #2395).
    ['gone twice that week', (role) => [{ ...sub(X, 6000), id: 'x2', provider_role: role, created_at: iso(monday + day + 8 * 3600000), status: 'canceled', current_period_end: iso(monday + 2 * day + 18 * 3600000) }], [true, true], 1, 6000],
    // Two plans held together, one ended on the Monday and one on the Wednesday: one departure.
    ['two plans, two days', (role) => [{ ...sub(X, 6000), id: 'x2', provider_role: role, created_at: iso(now - 150 * day), status: 'canceled', current_period_end: iso(monday + 2 * day + 18 * 3600000) }], [true, true], 1, 24000],
  ]
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', NUTRI]]) {
    for (const [what, more, departed, ended, lost] of cases) {
      const { body } = await loadRoute(role, { ...listing, subscriptions: [...others(role), mon(role), ...more(role)] }, { rpcs: lifts({}), honorStatus: true })
      assert.deepEqual(body.churn.map((r) => r.departed).reverse(), departed, `${role}, ${what}: each ended plan, decided at the week's close`)
      assert.equal(body.trajectory.weeks.find((w) => w.weekOf === weekOf).ended, ended, `${role}, ${what}: the trajectory's week`)
      // And what the Retention tab and the Clients tab print from them agrees.
      const pace = CF.paceFrom(body.trajectory, now)
      const gone = CF.departures(body.churn, { pace, now })
      assert.deepEqual([pace.ended, gone.count, gone.lostCents], [ended, ended, lost], `${role}, ${what}: the pace and the list count the same departures`)
    }
  }
})

test('an ended plan\'s date is the trajectory\'s close: a period end in the future is clamped to now', async () => {
  // Cancelled mid-period: the status says gone, the period end is three weeks out.
  const subs = (role) => [{ ...sub(A, 9000), id: 'r1', provider_role: role, created_at: '2026-06-01T00:00:00Z', status: 'canceled', current_period_end: new Date(Date.now() + 21 * 86400000).toISOString() }]
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', NUTRI]]) {
    const before = Date.now()
    const { body } = await loadRoute(role, { ...listing, subscriptions: subs(role) }, { rpcs: lifts({}), honorStatus: true })
    const t = Date.parse(body.churn[0].endedAt)
    assert.ok(t >= before && t <= Date.now(), role + ': ended now, not ' + body.churn[0].endedAt)
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
    // The origin feed lists the same two clients, A once with both plans (origin-attribution.ts's
    // fold, the share's own). It listed each row, so the Growth tab's header counted A twice beside
    // the Plan's "1 of your 2" (the follow-up to #2395).
    assert.deepEqual(body.byOrigin.filter((r) => r.kind === 'subscription').map((r) => [r.clientId, r.plans, r.feeBps]), [[A, 2, 0], [B, 1, 1500]], role + ': one row a client, not one a plan')
    const failed = await loadRoute(role, { ...listing, subscriptions: rows(role) }, { errors: { subscriptions: 'timeout' } })
    assert.equal(failed.body.byoMix, null, role + ': an unread share is unread, not 0%')
  }
})

// ── The sweep after #2394 round 10: the brought-in share is "of" the clients the Plan counts ──
test('both routes take the brought-in share over today\'s clients, so a brought client whose payment is retrying is in it, as in the Plan\'s count', async () => {
  // A and B found the coach on Shape and are active; C was brought (0%) and her payment is retrying;
  // D cancelled. Today is three clients (the trajectory's latest week, as membership counts), so the
  // share is 1 of 3. Over the active and trialing rows it read 0 of 2 beside "you have 3 today".
  // (Owner, 2026-10-18: a client whose payment is retrying is a client of their coach in every read,
  // so the active read takes past_due too, and the fallback says 1 of 3 as well.)
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const rows = (role) => [
    { ...sub(A), id: 'r1', provider_role: role },
    { ...sub(B), id: 'r2', provider_role: role },
    { ...sub(C), id: 'r3', fee_bps: 0, status: 'past_due', provider_role: role },
    { ...sub(D), id: 'r4', fee_bps: 0, status: 'canceled', current_period_end: '2026-10-01T00:00:00Z', provider_role: role },
  ]
  const CF = require_('./public/newdesign/coachForecast.js')
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] }]]) {
    const tables = { ...listing, subscriptions: rows(role) }
    const { body } = await loadRoute(role, tables, { honorStatus: true })
    assert.equal(body.trajectory.weeks[body.trajectory.weeks.length - 1].active, 3, role + ': today is three clients')
    assert.equal(body.metrics.activeClients, 3, role + ': the active read takes the retrying payment too (owner, 2026-10-18)')
    assert.deepEqual(body.byoMix, { clients: 3, brought: 1 }, role + ': 1 of today\'s 3, not 0 of the 2 active rows')
    // Through the shared forecast both Business pages read: "you have 3 today" beside "1 of your 3".
    const n = CF.planNumbers({ extra: body, listingMonthly: null })
    assert.deepEqual([n.clients, n.brought, n.byoClients], [3, 1, 3], role)
    // The trajectory unread: the share falls back to the active read, as todayFrom falls back to metrics.
    const noHistory = await loadRoute(role, tables, { honorStatus: true, failTrajectory: true })
    assert.equal(noHistory.body.trajectory, null, role)
    assert.deepEqual(noHistory.body.byoMix, { clients: 3, brought: 1 }, role + ': the open rows, when there is no trajectory')
    const n2 = CF.planNumbers({ extra: noHistory.body, listingMonthly: null })
    assert.deepEqual([n2.clients, n2.byoClients], [3, 3], role + ': the two fall back together')
    // The active read unread and the trajectory read: the share is still today's.
    const noActive = await loadRoute(role, tables, { honorStatus: true, failActive: true })
    assert.deepEqual(noActive.body.byoMix, { clients: 3, brought: 1 }, role)
    assert.deepEqual(noActive.body.byOrigin.map((r) => r.feeBps), [1500, 1500, 0], role + ': and so is the origin feed (the test below)')
    // Neither: unread, never 0%.
    const neither = await loadRoute(role, tables, { honorStatus: true, failActive: true, failTrajectory: true })
    assert.equal(neither.body.byoMix, null, role)
  }
})

test('both routes list today\'s clients in the Growth tab\'s "who found whom", so a brought client whose payment is retrying is there, as in the Plan\'s "1 of your 3"', async () => {
  // The scenario above: A and B from Shape and active, C brought (0%) and past_due, D cancelled.
  // The feed was built from the active and trialing rows, so the plate on the Plan's own page
  // listed A and B alone: "0 you brought · 2 found you on Shape" beside "0% fee · 1 of your 3".
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const rows = (role) => [
    { ...sub(A), id: 'r1', provider_role: role },
    { ...sub(B), id: 'r2', provider_role: role },
    { ...sub(C), id: 'r3', fee_bps: 0, status: 'past_due', provider_role: role },
    { ...sub(D), id: 'r4', fee_bps: 0, status: 'canceled', current_period_end: '2026-10-01T00:00:00Z', provider_role: role },
  ]
  // `profiles` answers what the coach's policy showed before 2026-10-18-coach-access-past-due.sql
  // runs (active and trialing clients: A and B), so the code is right in that window too;
  // get_display_names names anyone, and says whom it was asked about.
  const asked = []
  const names = { [A]: 'Ada', [B]: 'Ben', [C]: 'Cleo', [D]: 'Dee' }
  const rpcs = { get_display_names: ({ p_ids }) => { asked.push(p_ids); return { data: p_ids.map((id) => ({ user_id: id, full_name: names[id] })), error: null } } }
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] }]]) {
    const tables = { ...listing, subscriptions: rows(role), profiles: [{ id: A, full_name: 'Ada' }, { id: B, full_name: 'Ben' }] }
    asked.length = 0
    const { body } = await loadRoute(role, tables, { honorStatus: true, rpcs })
    const subsFeed = body.byOrigin.filter((r) => r.kind === 'subscription')
    assert.deepEqual(subsFeed.map((r) => [r.name, r.feeBps]), [['Ada', 1500], ['Ben', 1500], ['Cleo', 0]], role + ': C is listed, by name, at 0%; D (cancelled) is not')
    assert.deepEqual(asked, [[D], [C]], role + ': the churn list asks for D; the feed asks for the one name the profiles read could not see, and only that one')
    // The plate's own count (DbzOriginZone: rows at 0% are "you brought") agrees with the Plan's.
    assert.equal(subsFeed.filter((r) => r.feeBps === 0).length, body.byoMix.brought, role + ': "1 you brought" beside "1 of your 3"')
    // The feed sends one row a client now (the follow-up to #2395), so its rows are the count. A set
    // of their names, read when it sent a row a plan, merged two clients who share a name, or two
    // whose names could not be read ("—").
    assert.equal(subsFeed.length, body.byoMix.clients, role)
    // The trajectory unread: both fall back to the open rows together, the retrying client among them.
    const noHistory = await loadRoute(role, tables, { honorStatus: true, failTrajectory: true, rpcs })
    assert.deepEqual(noHistory.body.byOrigin.map((r) => r.name), ['Ada', 'Ben', 'Cleo'], role)
    // The active read unread: no roster, so no profiles read; every name comes from get_display_names.
    asked.length = 0
    const noActive = await loadRoute(role, tables, { honorStatus: true, failActive: true, rpcs })
    assert.deepEqual(noActive.body.byOrigin.map((r) => r.name), ['Ada', 'Ben', 'Cleo'], role + ': named, not "—"')
    assert.deepEqual(asked, [[D], [A, B, C]], role)
    // Neither: unread, never "no clients yet".
    const neither = await loadRoute(role, tables, { honorStatus: true, failActive: true, failTrajectory: true, rpcs })
    assert.equal(neither.body.byOrigin, null, role)
  }
})

test('the origin feed names the clients it lacks 200 at a time, the most get_display_names takes', async () => {
  const { buildOriginFeed } = await loadRealModule(join(ROOT, 'src/lib/origin-attribution.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) })
  const db = fakeSupabase({}, { rpcs: { get_display_names: ({ p_ids }) => (p_ids.length > 200 ? { data: null, error: { message: 'at most 200 ids' } } : { data: p_ids.map((id) => ({ user_id: id, full_name: 'N ' + id })), error: null }) } })
  const subs = Array.from({ length: 450 }, (_, i) => ({ client_id: 'c' + i, price_cents: 1000, fee_bps: 1500 }))
  const feed = await buildOriginFeed(db.client, 'trainer', 7, subs, new Map([['c0', 'Known']]))
  assert.deepEqual(db.calls.filter((c) => c.rpc === 'get_display_names').map((c) => c.args.p_ids.length), [200, 200, 49])
  assert.equal(feed[0].name, 'Known', 'a name the roster already read is not asked for again')
  assert.ok(feed.every((r) => r.name !== '—'), 'every client named')
  // A failed purchases read is still subscriptions-only, and still named.
  const failed = fakeSupabase({}, { errors: { one_time_purchases: 'timeout' }, rpcs: { get_display_names: ({ p_ids }) => ({ data: p_ids.map((id) => ({ user_id: id, full_name: 'Cleo' })), error: null }) } })
  const only = await buildOriginFeed(failed.client, 'trainer', 7, [{ client_id: 'c', price_cents: 1000, fee_bps: 0 }], new Map())
  assert.deepEqual(only.map((r) => [r.kind, r.name, r.feeBps]), [['subscription', 'Cleo', 0]])
})

// ── The follow-up to #2395: "who found whom" counts clients, as the brought-in share does ──
// The feed sent a row per plan and one per one-time purchase, and the Growth tab's header counted
// them all: a client on two plans was two, and a purchase one more, beside the Plan's per-client
// "1 of your 2". The feed now folds each client's plans into one row by the share's own rule
// (origin-attribution.ts clientsOf), and a purchase is listed on its own row, never as a client.
const originModule = () => loadRealModule(join(ROOT, 'src/lib/origin-attribution.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) })
const C3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const D4 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

test('the origin feed lists a client once: two plans are one row, their prices added, with plans: 2', async () => {
  const { buildOriginFeed, byoMixOf } = await originModule()
  const db = fakeSupabase({})
  // A's two plans sit apart in the rows, as an id-ordered read leaves them; C's second plan's price
  // was not read.
  const subs = [
    { client_id: A, price_cents: 10000, fee_bps: 1500, origin: 'marketplace' },
    { client_id: B, price_cents: 8000, fee_bps: 0, origin: 'coach_link' },
    { client_id: A, price_cents: 5000, fee_bps: 1500, origin: 'marketplace' },
    { client_id: C3, price_cents: 7000, fee_bps: 1500, origin: 'marketplace' },
    { client_id: C3, price_cents: null, fee_bps: 1500, origin: 'marketplace' },
  ]
  const feed = await buildOriginFeed(db.client, 'trainer', 7, subs, new Map([[A, 'Ada'], [B, 'Ben'], [C3, 'Cleo']]))
  assert.deepEqual(feed, [
    { name: 'Ada', clientId: A, kind: 'subscription', origin: 'marketplace', feeBps: 1500, priceCents: 15000, plans: 2, mixedFees: false },
    { name: 'Ben', clientId: B, kind: 'subscription', origin: 'coach_link', feeBps: 0, priceCents: 8000, plans: 1, mixedFees: false },
    // A plan of unknown price is not a $0 plan: the other plan's $70 is not her total.
    { name: 'Cleo', clientId: C3, kind: 'subscription', origin: 'marketplace', feeBps: 1500, priceCents: null, plans: 2, mixedFees: false },
  ])
  // Rows with no client id stand alone, each a client of one plan, as the share counts them.
  const lone = await buildOriginFeed(db.client, 'trainer', 7, [{ client_id: null, price_cents: 1000, fee_bps: 0 }, { client_id: null, price_cents: 2000, fee_bps: 1500 }], new Map())
  assert.deepEqual(lone.map((r) => [r.name, r.clientId, r.plans, r.feeBps, r.priceCents]), [['—', null, 1, 0, 1000], ['—', null, 1, 1500, 2000]])
  // A plan from before the feature stores no origin or fee: it paid 15% to a client from the
  // marketplace, so beside a plan that stores 15% the client is not brought, and the fees agree.
  const old = [{ client_id: A, price_cents: 1000 }, { client_id: A, price_cents: 2000, fee_bps: 1500, origin: 'marketplace' }]
  const pre = await buildOriginFeed(db.client, 'trainer', 7, old, new Map([[A, 'Ada']]))
  assert.deepEqual(pre.map((r) => [r.origin, r.feeBps, r.plans, r.mixedFees, r.priceCents]), [['marketplace', 1500, 2, false, 3000]])
  assert.deepEqual(byoMixOf(old), { clients: 1, brought: 0 })
})

test('mixed fees: a client with any plan at 0% is brought, and the row says their plans\' fees differ', async () => {
  const { buildOriginFeed, byoMixOf } = await originModule()
  const db = fakeSupabase({})
  // A took the 0% plan second, B first; D's two plans are at two marketplace rates.
  const subs = [
    { client_id: A, price_cents: 10000, fee_bps: 1500, origin: 'marketplace' },
    { client_id: A, price_cents: 5000, fee_bps: 0, origin: 'coach_link' },
    { client_id: B, price_cents: 9000, fee_bps: 0, origin: 'coach_link' },
    { client_id: B, price_cents: 4000, fee_bps: 1500, origin: 'marketplace' },
    { client_id: D4, price_cents: 6000, fee_bps: 1500, origin: 'marketplace' },
    { client_id: D4, price_cents: 6000, fee_bps: 1200, origin: 'marketplace' },
  ]
  const feed = await buildOriginFeed(db.client, 'trainer', 7, subs, new Map([[A, 'Ada'], [B, 'Ben'], [D4, 'Dee']]))
  assert.deepEqual(feed.map((r) => [r.name, r.feeBps, r.origin, r.mixedFees, r.plans, r.priceCents]), [
    ['Ada', 0, 'coach_link', true, 2, 15000],
    ['Ben', 0, 'coach_link', true, 2, 13000],
    // No plan at 0%: found on Shape, at the first plan's rate, and the row says the rates differ.
    ['Dee', 1500, 'marketplace', true, 2, 12000],
  ])
  // The share counts the same two as brought: the feed's rule is the share's, any plan at 0%.
  assert.deepEqual(byoMixOf(subs), { clients: 3, brought: 2 })
  assert.equal(feed.filter((r) => r.feeBps === 0).length, byoMixOf(subs).brought)
})

test('a subscriber\'s one-time purchase adds no client: the feed lists it on its own row, and its clients are the share\'s', async () => {
  // A (brought) and B (found on Shape) subscribe; A also buys a meal plan, and P buys one without
  // subscribing. Two clients, 1 brought, and two purchases listed beside them.
  const subs = (role) => [{ ...sub(A), id: 'r1', fee_bps: 0, origin: 'coach_link', provider_role: role }, { ...sub(B), id: 'r2', provider_role: role }]
  const P = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const purchases = [
    { id: 'p1', client_id: P, price_cents: 6000, fee_bps: 1500, origin: 'marketplace', status: 'paid', created_at: '2026-10-05T00:00:00Z' },
    { id: 'p2', client_id: A, price_cents: 9000, fee_bps: 0, origin: 'coach_link', status: 'paid', created_at: '2026-10-10T00:00:00Z' },
  ]
  const names = { [A]: 'Ada', [B]: 'Ben', [P]: 'Pia' }
  const rpcs = { get_display_names: ({ p_ids }) => ({ data: p_ids.map((id) => ({ user_id: id, full_name: names[id] })), error: null }) }
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] }]]) {
    const { body } = await loadRoute(role, { ...listing, subscriptions: subs(role), one_time_purchases: purchases, profiles: [{ id: A, full_name: 'Ada' }, { id: B, full_name: 'Ben' }] }, { rpcs })
    assert.deepEqual(body.byoMix, { clients: 2, brought: 1 }, role)
    const clients = body.byOrigin.filter((r) => r.kind === 'subscription')
    assert.deepEqual(clients.map((r) => [r.clientId, r.name, r.plans]), [[A, 'Ada', 1], [B, 'Ben', 1]], role + ': A\'s purchase is not a plan, and P, who only bought, is not a client')
    assert.equal(clients.length, body.byoMix.clients, role)
    // The purchases are still listed, newest first, each on its own row.
    assert.deepEqual(body.byOrigin.filter((r) => r.kind === 'purchase').map((r) => [r.name, r.feeBps, r.priceCents]), [['Ada', 0, 9000], ['Pia', 1500, 6000]], role)
    assert.equal(body.byOrigin.length, 4, role + ': two clients and two purchases, nothing else')
  }
})

test('both routes: the origin feed\'s clients and brought clients are the brought-in share\'s, whatever the plans', async () => {
  // A brought on a second plan, B from Shape, C brought on two plans, D on two marketplace rates,
  // and two rows with no client id (one at 0%), with purchases beside them: 6 clients, 3 brought.
  const rows = (role) => [
    { ...sub(A), id: 'r1', provider_role: role },
    { ...sub(B), id: 'r2', provider_role: role },
    { ...sub(A, 5000), id: 'r3', fee_bps: 0, origin: 'coach_link', provider_role: role },
    { ...sub(C3), id: 'r4', fee_bps: 0, origin: 'coach_link', provider_role: role },
    { ...sub(C3, 4000), id: 'r5', fee_bps: 0, origin: 'coach_link', provider_role: role },
    { ...sub(D4), id: 'r6', provider_role: role },
    { ...sub(D4), id: 'r7', fee_bps: 1200, provider_role: role },
    { ...sub(null), id: 'r8', fee_bps: 0, origin: 'coach_link', provider_role: role },
    { ...sub(null), id: 'r9', provider_role: role },
  ]
  const purchases = [{ id: 'p1', client_id: A, price_cents: 9000, fee_bps: 0, origin: 'coach_link', status: 'paid', created_at: '2026-10-10T00:00:00Z' }]
  for (const [role, listing] of [['trainer', { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }], ['nutritionist', { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] }]]) {
    for (const [label, subsRows, want] of [['every case', rows(role), { clients: 6, brought: 3 }], ['one plan each', rows(role).filter((r) => ['r1', 'r2'].includes(r.id)), { clients: 2, brought: 0 }], ['no clients', [], { clients: 0, brought: 0 }]]) {
      const { body } = await loadRoute(role, { ...listing, subscriptions: subsRows, one_time_purchases: purchases })
      assert.deepEqual(body.byoMix, want, role + ', ' + label)
      const clients = body.byOrigin.filter((r) => r.kind === 'subscription')
      assert.equal(clients.length, body.byoMix.clients, role + ', ' + label + ': the header\'s clients are the share\'s')
      assert.equal(clients.filter((r) => r.feeBps === 0).length, body.byoMix.brought, role + ', ' + label + ': and so are its brought ones')
    }
  }
})

// ── #2394's open item: the nutritionist route reads every row, a page at a time ──
const NUTRI = { nutritionists: [{ id: 9, stripe_account_id: null, stripe_account_status: null }] }
const nutriSubs = (n) => Array.from({ length: n }, (_, i) => ({ ...sub('c' + String(i).padStart(6, '0'), 1000), id: 'u' + String(i).padStart(6, '0'), provider_role: 'nutritionist' }))
// ⚠ fakeSupabase applies only gt, order and limit: an eq, in or gte is recorded and ignored, so a
// dropped filter changes no figure. Each read's filters are pinned by name with this.
const has = (c, op, col, v) => c.ops.some((o) => o[0] === op && o[1] === col && (v === undefined || JSON.stringify(o[2]) === JSON.stringify(v)))

test('nutritionist: every active subscription is read, a page at a time; at the ceiling it is unknown, not short', async () => {
  const { body, calls } = await loadRoute('nutritionist', { ...NUTRI, subscriptions: nutriSubs(2500) })
  assert.equal(body.metrics.activeClients, 2500, 'every client, not the first 1,000')
  assert.equal(body.metrics.mrrGrossCents, 2500 * 1000)
  const pages = calls.filter((c) => c.table === 'subscriptions' && c.ops.some((o) => o[0] === 'in' && o[1] === 'status'))
  assert.equal(pages.length, 3)
  assert.ok(pages.every((p) => has(p, 'eq', 'provider_role', 'nutritionist') && has(p, 'eq', 'provider_id', 9) && has(p, 'in', 'status', ['active', 'trialing', 'past_due'])),
    'every page is this nutritionist\'s open rows (active, trialing, past_due), not every coach\'s')
  assert.deepEqual(pages.map((p) => p.ops.find((o) => o[0] === 'gt')?.[2] ?? null), [null, 'u000999', 'u001999'], 'each page after the last id read')
  assert.ok(pages.every((p) => p.ops.some((o) => o[0] === 'order' && o[1] === 'id') && p.ops.some((o) => o[0] === 'limit' && o[1] === 1000)))
  const capped = await loadRoute('nutritionist', { ...NUTRI, subscriptions: nutriSubs(50_000) })
  const m = capped.body.metrics
  // (Scalars only: a failure diffing a 50,000-row byOrigin ran the test process out of memory.)
  assert.deepEqual([m.activeClients, m.mrrGrossCents, m.mrrNetCents, capped.body.clientProgress.rosterUnknown, capped.body.byOrigin === null], [null, null, null, true, true])
  const cp = capped.body.clientProgress
  assert.deepEqual([cp.totalDaysLogged, cp.avgLogsPerClient, cp.weightsUnknown], [null, null, true], 'no roster was read, so no logs were: unknown, not 0')
})

test('nutritionist: every snapshot in the window is read, and each client\'s first and latest weigh-in are by date, not by id', async () => {
  // 40 clients logging 30 days each is 1,200 rows; ids run opposite to dates.
  const day = (d) => new Date(Date.now() - (29 - d) * 86400000).toISOString().slice(0, 10)
  const snaps = []
  for (let d = 0; d < 30; d += 1) {
    for (let k = 0; k < 40; k += 1) {
      snaps.push({ id: 'h' + String(1199 - snaps.length).padStart(6, '0'), user_id: 'c' + String(k).padStart(6, '0'), snapshot_date: day(d), protein_g: d % 2 ? 100 : 130, dietary_kcal: 2000, weight_lb: 200 - d })
    }
  }
  // The window's first day, taken either side of the read, so a run across midnight UTC still passes.
  const since30 = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const windowStarts = [since30()]
  const { body, calls } = await loadRoute('nutritionist', { ...NUTRI, subscriptions: nutriSubs(40), daily_health_snapshot: snaps })
  windowStarts.push(since30())
  const reads = calls.filter((c) => c.table === 'daily_health_snapshot')
  assert.equal(reads.length, 2, 'two pages, not the first 1,000')
  assert.ok(reads.every((r) => r.ops.some((o) => o[0] === 'order' && o[1] === 'id') && r.ops.some((o) => o[0] === 'limit' && o[1] === 1000)))
  const rosterIds = JSON.stringify(Array.from({ length: 40 }, (_, k) => 'c' + String(k).padStart(6, '0')))
  assert.ok(reads.every((r) => r.ops.some((o) => o[0] === 'in' && o[1] === 'user_id' && Array.isArray(o[2]) && JSON.stringify([...o[2]].sort()) === rosterIds)),
    'every page is the roster\'s snapshots, not every member\'s')
  assert.ok(reads.every((r) => r.ops.some((o) => o[0] === 'gte' && o[1] === 'snapshot_date' && windowStarts.includes(o[2]))),
    'every page is the last 30 days, not every snapshot ever under a 30-day label')
  const cp = body.clientProgress
  assert.deepEqual([cp.totalDaysLogged, cp.avgLogsPerClient, cp.proteinAdherencePct, cp.weightsUnknown], [1200, 30, 50, false])
  assert.equal(cp.roster.length, 12)
  for (const r of cp.roster) assert.deepEqual([r.daysLogged30d, r.weightStart, r.weightLatest, r.weightChangeLb], [30, 200, 171, -29], r.client_id)
  // A failed read is unknown, not a roster that logged nothing.
  const failed = await loadRoute('nutritionist', { ...NUTRI, subscriptions: nutriSubs(2) }, { errors: { daily_health_snapshot: 'timeout' } })
  const f = failed.body.clientProgress
  assert.deepEqual([f.totalDaysLogged, f.avgLogsPerClient, f.proteinAdherencePct, f.weightsUnknown, f.activeClients], [null, null, null, true, 2])
  assert.ok(f.roster.length === 2 && f.roster.every((r) => r.daysLogged30d === null && r.avgProteinG === null && r.avgCalories === null && r.weightLatest === null))
  assert.equal(failed.body.ticker.avgLogsPerClient, null)
})

test('nutritionist: appointment counts are counted by the database, and a failed count is unknown', async () => {
  const { body, calls } = await loadRoute('nutritionist', { ...NUTRI, subscriptions: nutriSubs(2) })
  const counts = calls.filter((c) => c.table === 'sessions')
  assert.equal(counts.length, 4)
  assert.ok(counts.every((c) => c.ops.some((o) => o[0] === 'select' && o[2]?.count === 'exact' && o[2]?.head === true)), 'head counts, no rows')
  assert.ok(!counts.some((c) => c.ops.some((o) => o[0] === 'limit')), 'no row limit')
  assert.ok(counts.every((c) => has(c, 'eq', 'provider_role', 'nutritionist') && has(c, 'eq', 'provider_id', 9)))
  assert.ok(has(counts[1], 'eq', 'status', 'completed'))
  assert.ok(has(counts[2], 'in', 'status', ['requested', 'confirmed']) && has(counts[2], 'gte', 'scheduled_at'))
  assert.ok(has(counts[3], 'gte', 'scheduled_at') && has(counts[3], 'lt', 'scheduled_at') && has(counts[3], 'neq', 'status', 'cancelled'))
  assert.deepEqual([body.metrics.totalSessions, body.ticker.consultsToday], [0, 0], 'a count that worked is reported')
  const failed = await loadRoute('nutritionist', { ...NUTRI, subscriptions: nutriSubs(2) }, { errors: { sessions: 'timeout' } })
  const b = failed.body
  assert.deepEqual([b.metrics.totalSessions, b.metrics.completedSessions, b.metrics.upcomingSessions, b.ticker.consultsToday, b.ticker.upcomingSessions], [null, null, null, null, null])
})

test('the nutritionist Business cards print an unread figure as a dash, never as 0', () => {
  const src = readFileSync(join(ROOT, 'public/newdesign/dashBusiness.jsx'), 'utf8')
  const at = src.indexOf('  nutritionist: {', src.indexOf('const DBZ_ROLES ='))
  const nutritionist = src.slice(at, src.indexOf('\n};', at))
  assert.doesNotMatch(nutritionist, /\?\? 0/, 'no nutritionist figure falls back to 0')
  assert.match(nutritionist, /k: dbzFig\(cp\.proteinAdherencePct, "%"\), l: "Protein adherence"/)
  assert.match(nutritionist, /consistentValue: \(r\) => \(\{ n: dbzFig\(r\.daysLogged30d\), unit: "days" \}\)/)
})

// ── Left open by #2394 and #2395: every client's name, and a name that couldn't be read says so ──
// Both routes read their roster's names in ONE `profiles` select over every client id: it stopped at
// 1,000 rows (the API's cap, which fakeSupabase keeps), could pass the URL length limit, and dropped
// its error, so a name it didn't have read "Client" (the churn list's, "Former client") as if none
// were on file, in English in every language. Each name is now null when it isn't had, and
// `nameUnread` says whether the read failed (src/lib/client-names.ts).
const TRAINER = { trainers: [{ id: 7, stripe_account_id: null, stripe_account_status: null }] }
const LISTINGS = [['trainer', TRAINER], ['nutritionist', NUTRI]]
const cid = (i) => 'c' + String(i).padStart(6, '0')
// `n` clients, one active plan each, each with a name on file unless `named(i)` says not.
const practice = (role, n, named = () => true) => ({
  subscriptions: Array.from({ length: n }, (_, i) => ({ ...sub(cid(i), 1000), id: 'u' + String(i).padStart(6, '0'), provider_role: role })),
  profiles: Array.from({ length: n }, (_, i) => ({ id: cid(i), full_name: named(i) ? 'Name ' + i : null })),
})
// The clients `ids` are the busiest, so the payload's roster (its 12 busiest) is them.
const busiest = (role, ids) => (role === 'trainer'
  ? { workout_sessions: ids.map((c, k) => ({ id: 's' + String(k).padStart(4, '0'), client_id: c, started_at: recent, status: 'completed' })) }
  : { daily_health_snapshot: ids.map((c, k) => ({ id: 'h' + String(k).padStart(4, '0'), user_id: c, snapshot_date: recent.slice(0, 10), protein_g: 100, dietary_kcal: 2000, weight_lb: null })) })
// The ids each `profiles` read asked for, in the order the reads were made.
const nameReads = (calls) => calls.filter((c) => c.table === 'profiles').map((c) => c.ops.find(([op, col]) => op === 'in' && col === 'id')[2])

test('both routes name every client, 100 ids a read: past the 1,000th they read "Client"', async () => {
  const N = 1200
  // The last 12 in line are past the first 1,000 profiles rows, and the busiest, so the roster shows them.
  const late = Array.from({ length: 12 }, (_, k) => cid(N - 12 + k))
  for (const [role, listing] of LISTINGS) {
    const { body, calls } = await loadRoute(role, { ...listing, ...practice(role, N), ...busiest(role, late) }, { rpcs: lifts({}) })
    const roster = body.clientProgress.roster
    assert.deepEqual(roster.map((r) => r.client_id).sort(), late, role + ': the 12 busiest')
    assert.deepEqual(roster.map((r) => [r.client_id, r.name, r.nameUnread]), roster.map((r) => [r.client_id, 'Name ' + Number(r.client_id.slice(1)), false]),
      role + ': each one named, though past the 1,000th')
    const batches = nameReads(calls)
    assert.equal(batches.length, 12, role + ': 1,200 ids, a read for each 100')
    assert.ok(batches.every((b) => b.length <= 100), role + ': no read carries more than 100 ids (one list of every id could pass the URL length limit)')
    assert.deepEqual(batches.flat().sort(), practice(role, N).profiles.map((p) => p.id), role + ': each client asked for once')
  }
})

test('a names read that fails is said as unread, for its own batch alone; no name on file is not unread', async () => {
  // 150 clients are two reads, and the second (c000100 to c000149) fails. c000001 has no name on file.
  const N = 150
  const shown = [0, 1, 2, 3, 4, 5, 144, 145, 146, 147, 148, 149].map(cid)
  const failSecond = (c) => c.table === 'profiles' && c.ops.some(([op, col, v]) => op === 'in' && col === 'id' && v.includes(cid(149)))
  for (const [role, listing] of LISTINGS) {
    const { body, calls } = await loadRoute(role, { ...listing, ...practice(role, N, (i) => i !== 1), ...busiest(role, shown) }, { rpcs: lifts({}), failCall: failSecond })
    assert.equal(nameReads(calls).length, 2, role)
    const got = Object.fromEntries(body.clientProgress.roster.map((r) => [r.client_id, [r.name, r.nameUnread]]))
    assert.deepEqual(got[cid(0)], ['Name 0', false], role + ': read')
    assert.deepEqual(got[cid(1)], [null, false], role + ': read, with no name on file, which is not unread')
    for (const id of shown.slice(6)) assert.deepEqual(got[id], [null, true], `${role}: ${id}'s read failed: unread, not "Client"`)
    assert.equal(body.metrics.activeClients, N, role + ': the rest of the page is still read')
  }
})

test('both routes: when the churned clients\' names couldn\'t be read, every row the call was to name says so', async () => {
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const ended = (role) => [
    { ...sub(A), id: 'r1', provider_role: role },
    { ...sub(C, 15000), id: 'r2', provider_role: role, status: 'canceled', current_period_end: '2026-10-02T00:00:00Z' },
    { ...sub(D, 9000), id: 'r3', provider_role: role, status: 'canceled', current_period_end: '2026-10-01T00:00:00Z' },
    { ...sub(null, 5000), id: 'r4', provider_role: role, status: 'canceled', current_period_end: '2026-09-29T00:00:00Z' },
  ]
  // D has no name on file.
  const named = { get_display_names: ({ p_ids }) => ({ data: p_ids.map((id) => ({ user_id: id, full_name: id === D ? null : 'N ' + id.slice(0, 4) })), error: null }) }
  const refused = { get_display_names: () => ({ data: null, error: { message: 'function get_display_names(uuid[]) does not exist' } }) }
  for (const [role, listing] of LISTINGS) {
    const ok = await loadRoute(role, { ...listing, subscriptions: ended(role) }, { rpcs: { ...lifts({}), ...named }, honorStatus: true })
    assert.deepEqual(ok.body.churn.map((r) => [r.clientId, r.name, r.nameUnread]), [[C, 'N cccc', false], [D, null, false], [null, null, false]],
      role + ': a name; none on file; no client to name')
    const bad = await loadRoute(role, { ...listing, subscriptions: ended(role) }, { rpcs: { ...lifts({}), ...refused }, honorStatus: true })
    assert.deepEqual(bad.body.churn.map((r) => [r.clientId, r.name, r.nameUnread]), [[C, null, true], [D, null, true], [null, null, false]],
      role + ': each churned client\'s name unread, not "Former client"; a row with no client had none to read')
    assert.deepEqual(bad.body.churn.map((r) => [r.departed, r.priceCents]), ok.body.churn.map((r) => [r.departed, r.priceCents]), role + ': the rest of each row is still read')
  }
})

test('profileNames: each id asked for once, nothing read for no ids, and a failed batch is its ids alone', async () => {
  const { profileNames, NAME_BATCH } = await loadRealModule(join(ROOT, 'src/lib/client-names.ts'), { typescript: true })
  assert.equal(NAME_BATCH, 100)
  const db = fakeSupabase({ profiles: [{ id: 'a', full_name: '  Ada  ' }, { id: 'b', full_name: null }] })
  const got = await profileNames(db.client, ['a', 'b', 'a', null, '', undefined, 'z'])
  assert.deepEqual(nameReads(db.calls), [['a', 'b', 'z']], 'a repeated id is asked for once; no id is no id')
  assert.deepEqual([[...got.names], [...got.unread]], [[['a', 'Ada'], ['b', '']], []], 'z has no profile the caller can see: neither named nor unread')
  const none = fakeSupabase({})
  const empty = await profileNames(none.client, [])
  assert.deepEqual([none.calls.length, empty.names.size, empty.unread.size], [0, 0, 0], 'no read for no ids')
  // 250 ids are three reads, of 100, 100 and 50; the middle one fails.
  const ids = Array.from({ length: 250 }, (_, i) => cid(i))
  const some = fakeSupabase({ profiles: ids.map((id) => ({ id, full_name: 'N' })) }, { failCall: (c) => c.table === 'profiles' && c.ops.some(([op, col, v]) => op === 'in' && col === 'id' && v.includes(cid(150))) })
  const part = await profileNames(some.client, ids)
  assert.deepEqual(nameReads(some.calls).map((b) => b.length), [100, 100, 50])
  assert.deepEqual([part.names.size, part.unread.size, part.unread.has(cid(100)), part.unread.has(cid(199)), part.unread.has(cid(99)), part.unread.has(cid(200))], [150, 100, true, true, false, false])
})

test('nutritionist: the ticker sends no newClients7d, and no count of new subscriptions is read', async () => {
  // It counted rows (an abandoned checkout, a plan change), printed a failed count as 0, and nothing
  // read it (public/, mobile-app/src/ and src/ name it nowhere else).
  const { body, calls } = await loadRoute('nutritionist', { ...NUTRI, subscriptions: nutriSubs(2) })
  assert.ok(body.ticker && !('newClients7d' in body.ticker), JSON.stringify(body.ticker))
  assert.ok(!calls.some((c) => c.table === 'subscriptions' && (has(c, 'gte', 'created_at') || c.ops.some((o) => o[0] === 'select' && o[2]?.head === true))),
    'no count of the subscriptions created this week is read')
})
