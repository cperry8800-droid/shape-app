// The coach Live console's routes (/api/trainer/console, /api/nutritionist/console), driven with a
// signed-in coach through the real request-auth, client-names, time and coach-exercises modules:
//
//   · ⚠ A SUBSCRIBER WITH NO SESSION WAS "Client". Only sessions carry a name, so every client who
//     subscribed without booking read "Client" in the console's picker. The name is the client's
//     profile's now (src/lib/client-names.ts), a session's the fallback, and a name the route doesn't
//     have is null, with nameUnread saying the read failed.
//   · ⚠ "LOGGED TODAY" WAS THE NEWEST ROW OF 90 DAYS. todayByClient is what the client logged on their
//     own today (client_profiles.timezone), and todayUnread a failed read.
//   · the Shape Score's 10 workout points read workout_minutes, which the trajectory never selected;
//   · today's session is the exercises sent on the client's today, never another day's and never a cue;
//   · ⚠ A CUE IS NOT THE FOCUS: action 'cue' appends a coach_pushed_items row of kind 'cue', and only
//     'focus' writes the banner (a cue used to replace the coach's weekly focus).
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
const COACH = { id: '33333333-3333-4333-8333-333333333333' }
const APP_TOKEN = 'app-access-token'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' // active subscriber, no session, Los Angeles
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' // former client with a session, profile not readable
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' // active subscriber, no name on file, no zone (UTC)
// 03:00 UTC on 10 November: still 9 November in Los Angeles.
const NOW = Date.parse('2026-11-10T03:00:00.000Z')

// Every read answers from `tables`, filtered by the eq / in / is / gte filters the route names (so a
// filter the route drops lets the wrong rows through); `fail(call)` fails a read it picks. Writes are
// recorded and answer ok. `rpc` answers is_coach_on_client from `onClient`.
function fakeDb(tables, { fail = null, onClient = true } = {}) {
  const calls = []
  const writes = []
  const keep = (row, ops) => ops.every(([op, col, v]) => {
    if (op === 'eq') return String(row[col]) === String(v)
    if (op === 'in') return v.map(String).includes(String(row[col]))
    if (op === 'is') return v === null ? row[col] == null : row[col] === v
    if (op === 'gte') return String(row[col]) >= String(v)
    if (op === 'gt') return String(row[col]) > String(v)
    return true
  })
  const from = (table) => {
    const call = { table, ops: [], select: null, write: null }
    calls.push(call)
    const answer = (single) => {
      if (call.write) {
        writes.push({ table, ...call.write, ops: call.ops })
        return { data: single ? { id: 'new-item' } : null, error: null }
      }
      if (fail && fail(call)) return { data: null, error: { message: 'timeout' } }
      let out = (tables[table] ?? []).filter((r) => keep(r, call.ops))
      for (const [op, col, o] of call.ops) {
        if (op !== 'order') continue
        const dir = o && o.ascending === false ? -1 : 1
        out = out.slice().sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : String(a[col]) > String(b[col]) ? dir : 0))
      }
      for (const [op, n] of call.ops) if (op === 'limit') out = out.slice(0, n) // PostgREST's cap: a read stops here, silently
      return { data: single ? (out[0] ?? null) : out, error: null }
    }
    const q = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(answer(false)).then(res, rej)
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(answer(true))
        if (prop === 'select') return (cols) => { if (!call.write) call.select = cols; return q }
        if (prop === 'insert' || prop === 'upsert' || prop === 'update' || prop === 'delete') return (row, opts) => { call.write = { kind: prop, row, opts }; return q }
        return (...args) => { call.ops.push([prop, ...args]); return q }
      },
    })
    return q
  }
  const rpc = async (name, args) => { calls.push({ rpc: name, args }); return name === 'is_coach_on_client' ? { data: onClient, error: null } : { data: null, error: null } }
  return { calls, writes, client: { from, rpc, auth: { getUser: async () => ({ data: { user: COACH }, error: null }) } } }
}

const ts = (p, registry = new Map()) => loadRealModule(join(ROOT, p), { typescript: true, registry })

async function libs() {
  const time = await ts('src/lib/time.ts')
  const workoutDays = await ts('src/lib/workout-days.ts', new Map([['@/lib/time', time]]))
  const exercises = await ts('src/lib/coach-exercises.ts', new Map([['@/lib/workout-days', workoutDays]]))
  return { time, workoutDays, exercises, names: await ts('src/lib/client-names.ts'), utils: await ts('src/lib/request-utils.ts', new Map([['next/server', nextServer]])), readAll: await ts('src/lib/read-all-by-id.ts') }
}
const LIBS = await libs()

async function route(role, db) {
  const requestAuth = await loadRealModule(join(ROOT, 'src/lib/request-auth.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/supabase/server', { createClient: async () => db.client }],
      // A Bearer client answers only the app's token as the coach.
      ['@supabase/supabase-js', { createClient: () => ({ ...db.client, auth: { getUser: async (token) => ({ data: { user: token === APP_TOKEN ? COACH : null }, error: null }) } }) }],
    ]),
  })
  return loadRealModule(join(ROOT, `src/app/api/${role}/console/route.ts`), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/supabase-js', {}],
      ['@/lib/request-auth', requestAuth],
      ['@/lib/request-utils', LIBS.utils],
      ['@/lib/client-names', LIBS.names],
      ['@/lib/time', LIBS.time],
      ['@/lib/workout-days', LIBS.workoutDays],
      ['@/lib/coach-exercises', LIBS.exercises],
      ['@/lib/read-all-by-id', LIBS.readAll],
    ]),
  })
}

const atNow = async (fn) => {
  const real = Date.now
  Date.now = () => NOW
  try { return await fn() } finally { Date.now = real }
}
const get = (role, db, headers = { authorization: `Bearer ${APP_TOKEN}` }) => atNow(async () => {
  const r = await route(role, db)
  const res = await r.GET(new Request(`https://shape.test/api/${role}/console`, { headers }))
  return { status: res.status, body: await res.json() }
})
const post = (role, db, body) => atNow(async () => {
  const r = await route(role, db)
  const res = await r.POST(new Request(`https://shape.test/api/${role}/console`, { method: 'POST', headers: { authorization: `Bearer ${APP_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  return { status: res.status, body: await res.json() }
})

const ex = (id, client_id, sent_at, payload, extra = {}) => ({ id, client_id, provider_role: 'trainer', provider_id: 7, kind: 'exercise', payload, sent_at, removed_at: null, ...extra })
const world = (role = 'trainer', over = {}) => ({
  trainers: [{ id: 7, owner_id: COACH.id }],
  nutritionists: [{ id: 7, owner_id: COACH.id }],
  subscriptions: [
    { client_id: A, status: 'active', provider_role: role, provider_id: 7 },
    { client_id: B, status: 'canceled', provider_role: role, provider_id: 7 },
    { client_id: C, status: 'trialing', provider_role: role, provider_id: 7 },
  ],
  sessions: [{ client_id: B, client_name: 'Blake Session', scheduled_at: '2026-06-01T10:00:00Z', provider_role: role, provider_id: 7 }],
  // B's profile is not readable to a former coach (RLS), so the fake has none.
  profiles: [{ id: A, full_name: 'Avery Stone' }, { id: C, full_name: '' }],
  client_profiles: [{ user_id: A, data: { goal: 'Strength' }, timezone: 'America/Los_Angeles' }, { user_id: C, data: {}, timezone: null }],
  daily_health_snapshot: [
    // A's today (9 November in Los Angeles), with 45 workout minutes.
    { user_id: A, snapshot_date: '2026-11-09', calories: 1800, protein_g: 120, sleep_hours: 6, workout_minutes: 45 },
    // C's newest row is yesterday's (C counts in UTC): not today.
    { user_id: C, snapshot_date: '2026-11-09', calories: 2400, protein_g: 150 },
  ],
  coach_focus_banners: [{ client_id: A, text: 'Control the eccentric.', provider_role: role, provider_id: 7 }],
  coach_pushed_items: [
    // A's today in Los Angeles (17:00 on 9 November).
    ex('e-today', A, '2026-11-10T01:00:00.000Z', { name: 'Hex bar deadlift', sets: '3 sets', reps: '—', tempo: '2-0-1-0', cue: 'Push the floor away' }),
    // Noon on 9 November in Los Angeles: A's today, though it is yesterday in UTC.
    ex('e-today-early', A, '2026-11-09T20:00:00.000Z', { name: 'Box jump', sets: '3', reps: '5' }),
    // A's yesterday (22:00 on 8 November in Los Angeles): it stays on that day.
    ex('e-yesterday', A, '2026-11-09T06:00:00.000Z', { name: 'Goblet squat' }),
    ex('e-removed', A, '2026-11-10T01:30:00.000Z', { name: 'Removed row' }, { removed_at: '2026-11-10T01:40:00.000Z' }),
    ex('e-other-coach', A, '2026-11-10T01:00:00.000Z', { name: 'Another trainer' }, { provider_id: 8 }),
    { id: 'cue-1', client_id: A, provider_role: role, provider_id: 7, kind: 'cue', payload: { text: 'Brace' }, sent_at: '2026-11-10T02:00:00.000Z', removed_at: null },
    // C's today (UTC).
    ex('e-c', C, '2026-11-10T02:30:00.000Z', { name: 'Sled push', sets: '4', reps: '20 m' }),
    { id: 'meal-1', client_id: A, provider_role: 'nutritionist', provider_id: 7, kind: 'meal', payload: { name: 'Oats' }, sent_at: '2026-11-01T08:00:00.000Z', removed_at: null },
    { id: 'note-1', client_id: A, provider_role: 'nutritionist', provider_id: 7, kind: 'grocery_note', payload: { text: 'Buy oats' }, sent_at: '2026-11-02T08:00:00.000Z', removed_at: null },
    { id: 'cue-n', client_id: A, provider_role: 'nutritionist', provider_id: 7, kind: 'cue', payload: { text: 'Sip water' }, sent_at: '2026-11-10T02:00:00.000Z', removed_at: null },
  ],
  ...over,
})
const byId = (clients) => Object.fromEntries(clients.map((c) => [c.id, c]))

for (const role of ['trainer', 'nutritionist']) {
  test(`${role} console: a subscriber with no session is listed by their profile's name, never "Client"`, async () => {
    const { status, body } = await get(role, fakeDb(world(role)))
    assert.equal(status, 200, JSON.stringify(body))
    const c = byId(body.clients)
    assert.deepEqual([c[A].name, c[A].nameUnread, c[A].status], ['Avery Stone', false, 'current'], 'their profile name')
    assert.deepEqual([c[B].name, c[B].status], ['Blake Session', 'past'], 'a profile the coach cannot read falls back to the session name')
    assert.deepEqual([c[C].name, c[C].nameUnread], [null, false], 'no name on file is null, not "Client"')
    assert.ok(!JSON.stringify(body.clients).includes('"Client"'))
  })

  test(`${role} console: a failed profiles read is said (nameUnread), and a session name still stands`, async () => {
    const { body } = await get(role, fakeDb(world(role), { fail: (call) => call.table === 'profiles' }))
    const c = byId(body.clients)
    assert.deepEqual([c[A].name, c[A].nameUnread], [null, true])
    assert.deepEqual([c[C].name, c[C].nameUnread], [null, true])
    assert.deepEqual([c[B].name, c[B].nameUnread], ['Blake Session', false])
  })

  test(`${role} console: "Logged today" is the client's own today, in their zone, never the newest row`, async () => {
    const db = fakeDb(world(role))
    const { body } = await get(role, db)
    assert.deepEqual(body.todayByClient[A], { date: '2026-11-09', calories: 1800, protein_g: 120 }, 'A is still on 9 November in Los Angeles')
    assert.equal(body.todayByClient[C], undefined, 'C last logged yesterday (UTC): nothing today')
    assert.equal(body.snapshotByClient[C].snapshot_date, '2026-11-09', 'the newest row is still the snapshot')
    assert.equal(body.todayUnread, false)
    const todayRead = db.calls.find((c) => c.table === 'daily_health_snapshot' && c.ops.some(([op, col]) => op === 'in' && col === 'snapshot_date'))
    assert.ok(todayRead, 'today is read on its own, so a long trajectory read cannot crowd it out')
  })

  test(`${role} console: a failed read of today's logs is unread, not "nothing logged"`, async () => {
    const fail = (call) => call.table === 'daily_health_snapshot' && call.ops.some(([op, col]) => op === 'in' && col === 'snapshot_date')
    const { body } = await get(role, fakeDb(world(role), { fail }))
    assert.equal(body.todayUnread, true)
    assert.deepEqual(body.todayByClient, {})
  })

  test(`${role} console: the Shape Score reads the workout minutes it scores`, async () => {
    const db = fakeDb(world(role))
    const { body } = await get(role, db)
    const traj = db.calls.find((c) => c.table === 'daily_health_snapshot' && c.ops.some(([op]) => op === 'gte'))
    assert.match(traj.select, /\bworkout_minutes\b/)
    // 45 workout minutes (10) + 120 g protein (5) + calories logged (2); 6 h of sleep scores nothing.
    assert.equal(body.seriesByClient[A].score[0], 17)
  })

  test(`${role} console: the 90-day trajectory reads every row, newest days included (left by #2686)`, async () => {
    // 1,500 rows for A, more than one page: one capped select, oldest first, stopped at 1,000 and lost
    // the newest days, so the chart ended early and the "latest" snapshot was weeks old.
    const w = world(role)
    // 75 days inside the 90-day window, 20 August to 2 November.
    const days = Array.from({ length: 75 }, (_, i) => new Date(Date.parse('2026-08-20T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10))
    const many = []
    for (let n = 0; n < 1500; n += 1) many.push({ id: `r${String(n).padStart(5, '0')}`, user_id: A, snapshot_date: days[(n * 7) % days.length], protein_g: 100 })
    // The newest day has the lowest id, so only the date sort makes it the latest.
    w.daily_health_snapshot = [...many, { id: 'a00000', user_id: A, snapshot_date: '2026-11-09', calories: 1800, protein_g: 120, sleep_hours: 6, workout_minutes: 45 }]
    const db = fakeDb(w)
    const { body } = await get(role, db)
    assert.equal(body.seriesByClient[A].protein.length, 1501, 'every row is in the trajectory')
    assert.equal(body.snapshotByClient[A].snapshot_date, '2026-11-09', 'the latest snapshot is the newest day')
    assert.equal(body.snapshotByClient[A].id, undefined, 'the cursor id stays in the route')
    assert.equal(body.trajectoryUnread, false)
    const walks = db.calls.filter((c) => c.table === 'daily_health_snapshot' && c.ops.some(([op]) => op === 'gte'))
    assert.equal(walks.length, 2, 'two pages')
    assert.ok(walks.every((c) => c.ops.some(([op, col]) => op === 'order' && col === 'id')), 'a keyset walk on id')
  })

  test(`${role} console: a failed trajectory read is unread, never an empty chart`, async () => {
    const fail = (call) => call.table === 'daily_health_snapshot' && call.ops.some(([op]) => op === 'gte')
    const { body } = await get(role, fakeDb(world(role), { fail }))
    assert.equal(body.trajectoryUnread, true)
    assert.deepEqual(body.seriesByClient, {})
  })

  test(`${role} console: a cue is its own row, never the focus banner`, async () => {
    const db = fakeDb(world(role))
    const { status, body } = await post(role, db, { clientId: A, action: 'cue', text: '  Brace  ' })
    assert.equal(status, 200, JSON.stringify(body))
    assert.deepEqual(db.writes.map((w) => [w.table, w.kind]), [['coach_pushed_items', 'insert']])
    assert.deepEqual(db.writes[0].row, { provider_role: role, provider_id: 7, client_id: A, kind: 'cue', payload: { text: 'Brace' } })
    assert.ok(!db.writes.some((w) => w.table === 'coach_focus_banners'), 'the focus is untouched')
  })

  test(`${role} console: Save focus writes the banner and nothing else`, async () => {
    const db = fakeDb(world(role))
    const { status } = await post(role, db, { clientId: A, action: 'focus', text: 'Control the eccentric.' })
    assert.equal(status, 200)
    assert.deepEqual(db.writes.map((w) => [w.table, w.kind]), [['coach_focus_banners', 'upsert']])
  })

  test(`${role} console: an empty, an overlong and another coach's client's cue are refused, with nothing written`, async () => {
    for (const [body, want, opts] of [
      [{ clientId: A, action: 'cue', text: '   ' }, 400],
      [{ clientId: A, action: 'cue', text: 'x'.repeat(501) }, 400],
      [{ clientId: A, action: 'cue', text: 'Brace' }, 403, { onClient: false }],
    ]) {
      const db = fakeDb(world(role), opts)
      const res = await post(role, db, body)
      assert.equal(res.status, want, JSON.stringify(res.body))
      assert.deepEqual(db.writes, [])
    }
    const db = fakeDb(world(role))
    assert.equal((await post(role, db, { clientId: A, action: 'cue', text: 'x'.repeat(500) })).status, 200, '500 characters is a cue')
  })

  test(`${role} console: a signed-out caller is refused`, async () => {
    const { status } = await get(role, fakeDb(world(role)), { authorization: 'Bearer someone-else' })
    assert.equal(status, 401)
  })
}

test('trainer console: today\'s session is the exercises sent on each client\'s today, never a cue or another day\'s', async () => {
  const db = fakeDb(world('trainer'))
  const { body } = await get('trainer', db)
  assert.deepEqual(body.itemsByClient[A], [
    { id: 'e-today-early', name: 'Box jump', sets: '3', reps: '5', tempo: '—', cue: '' },
    { id: 'e-today', name: 'Hex bar deadlift', sets: '3 sets', reps: '—', tempo: '2-0-1-0', cue: 'Push the floor away' },
  ], 'A\'s today in Los Angeles, oldest first')
  assert.deepEqual(body.itemsByClient[C].map((e) => e.id), ['e-c'], 'C counts in UTC')
  const read = db.calls.find((c) => c.table === 'coach_pushed_items')
  assert.ok(read.ops.some(([op, col, v]) => op === 'eq' && col === 'kind' && v === 'exercise'), 'the read asks for exercises alone')
  assert.ok(read.ops.some(([op, col]) => op === 'gte' && col === 'sent_at'), 'the read is bounded to the last days')
  assert.equal(body.focusByClient[A], 'Control the eccentric.')
})

test('nutritionist console: the plan and the grocery note, never a live cue', async () => {
  const db = fakeDb(world('nutritionist'))
  const { body } = await get('nutritionist', db)
  assert.deepEqual(body.itemsByClient[A].map((m) => m.id), ['meal-1'])
  assert.equal(body.groceryNoteByClient[A], 'Buy oats')
  const read = db.calls.find((c) => c.table === 'coach_pushed_items')
  assert.ok(read.ops.some(([op, col, v]) => op === 'in' && col === 'kind' && v.join() === 'meal,grocery_note'))
})

test('the migration lets a cue be its own row, and files no notice for one', () => {
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-11-10-coach-live-cues.sql'), 'utf8').replace(/--.*$/gm, '')
  assert.match(sql, /drop constraint if exists coach_pushed_items_kind_check;/)
  assert.match(sql, /add constraint coach_pushed_items_kind_check check \(kind in \('exercise', 'meal', 'cue'\)\);/)
  const fn = sql.slice(sql.indexOf('create or replace function public.notify_on_pushed_item()'))
  assert.match(fn, /security definer\s+set search_path = public, pg_temp/, 'the definer keeps its pinned path')
  // A cue returns before any notice is written; exercises and meals keep theirs.
  const cue = fn.indexOf("if new.kind = 'cue' then\n    return new;")
  assert.ok(cue > 0 && cue < fn.indexOf('insert into public.notifications'), 'a cue files no notice')
  assert.match(fn, /'New exercise from your coach'/)
  assert.match(fn, /'New meal \+ grocery items'/)
  assert.match(fn, /'Grocery list ready'/)
})

test('trainer console: a failed read of today\'s sessions is unread, never an empty session (Codex P2 on #2686)', async () => {
  const { body } = await get('trainer', fakeDb(world('trainer'), { fail: (call) => call.table === 'coach_pushed_items' }))
  assert.equal(body.itemsUnread, true)
  assert.deepEqual(body.itemsByClient, {})
  const ok = await get('trainer', fakeDb(world('trainer')))
  assert.equal(ok.body.itemsUnread, false)
})

for (const role of ['trainer', 'nutritionist']) {
  test(`${role} console: a zone that could not be read makes today unread, never a UTC guess (Codex P2 on #2686)`, async () => {
    // A row on the UTC date (10 November), which a UTC guess would take as A's today; in Los Angeles it is tomorrow.
    const w = world(role)
    w.daily_health_snapshot = [...w.daily_health_snapshot, { user_id: A, snapshot_date: '2026-11-10', calories: 300, protein_g: 20 }]
    const { body } = await get(role, fakeDb(w, { fail: (call) => call.table === 'client_profiles' }))
    assert.equal(body.todayUnread, true)
    assert.deepEqual(body.todayByClient, {}, 'no client is said to have logged nothing')
    if (role === 'trainer') {
      assert.equal(body.itemsUnread, true)
      assert.deepEqual(body.itemsByClient, {}, 'no session list read on a guessed date')
    }
    // A client with no zone on file still counts in UTC (C, in the passing world).
    const ok = await get(role, fakeDb(world(role)))
    assert.equal(ok.body.todayUnread, false)
  })
}
