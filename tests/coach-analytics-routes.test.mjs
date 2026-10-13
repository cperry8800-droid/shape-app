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

// Every table read answers from `tables`; any chain of filters is accepted.
function fakeSupabase(tables) {
  const reads = []
  const from = (table) => {
    reads.push(table)
    const rows = tables[table] ?? []
    const result = { data: rows, error: null, count: rows.length }
    const q = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej)
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: rows[0] ?? null, error: null })
        return () => q
      },
    })
    return q
  }
  return { reads, client: { from, auth: { getUser: async () => ({ data: { user: COACH } }) } } }
}

async function loadRoute(role, tables) {
  const db = fakeSupabase(tables)
  // origin-attribution names the server client in a type-only import; the loader still maps it.
  const ts = (p) => loadRealModule(join(ROOT, p), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) })
  const route = await loadRealModule(join(ROOT, `src/app/api/${role}/analytics/route.ts`), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => db.client }],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
      ['@/lib/stripe', { loadStripe: async () => ({ connected: false }) }],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/origin-attribution', await ts('src/lib/origin-attribution.ts')],
      ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)],
    ]),
  })
  const res = await route.GET(new Request(`https://shape.test/api/${role}/analytics`))
  return { body: await res.json(), reads: db.reads }
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
