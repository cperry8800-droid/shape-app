// A trainer's exercise from the Live console reaches the member's day (2026-11-10).
//
// ⚠ BEFORE THIS NOTHING READ IT. TrainerLiveConsole's "+ Add to today's session" saved a
// coach_pushed_items row of kind 'exercise', the member was told "New exercise from your coach" with
// a notice that opened Train, and the app fetched the rows into Home's coach feed but drew only the
// banners: the exercise showed nowhere. Now:
//   · /api/client/coach-exercises reads the member's last seven days, each exercise on the member's
//     day it was sent (client_profiles.timezone), from trainers the member pays now, the coach named,
//     and says a failed read rather than answering "none";
//   · the app reads it with the member's Bearer token (window.ShapeCoachFeed.exercises), and a change
//     in the console redraws it (subscribeExercises, on a channel of its own);
//   · Train draws a day's exercises under that day's program (BSTrainDay → BSCoachExercises).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { loadRealModule } from './helpers/load-real-module.mjs'
import { drive, SHIM, ROOT as APP_ROOT } from './helpers/broadsheet-mount.mjs'
import { IntlMessageFormat } from 'intl-messageformat'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(join(ROOT, 'package.json'))
const nextServer = require_('next/server')
const MEMBER = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
const APP_TOKEN = 'member-app-token'
// 03:00 UTC on 10 November: 9 November in Los Angeles.
const NOW = Date.parse('2026-11-10T03:00:00.000Z')

function fakeDb(tables, { fail = null } = {}) {
  const calls = []
  const keep = (row, ops) => ops.every(([op, col, v]) => {
    if (op === 'eq') return String(row[col]) === String(v)
    if (op === 'in') return v.map(String).includes(String(row[col]))
    if (op === 'is') return v === null ? row[col] == null : row[col] === v
    if (op === 'gte') return String(row[col]) >= String(v)
    return true
  })
  const from = (table) => {
    const call = { table, ops: [], select: null }
    calls.push(call)
    const answer = (single) => {
      if (fail && fail(call)) return { data: null, error: { message: 'timeout' } }
      let out = (tables[table] ?? []).filter((r) => keep(r, call.ops))
      for (const [op, col, o] of call.ops) {
        if (op !== 'order') continue
        const dir = o && o.ascending === false ? -1 : 1
        out = out.slice().sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : String(a[col]) > String(b[col]) ? dir : 0))
      }
      const limit = call.ops.find(([op]) => op === 'limit')
      if (limit) out = out.slice(0, limit[1])
      return { data: single ? (out[0] ?? null) : out, error: null }
    }
    const q = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(answer(false)).then(res, rej)
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve(answer(true))
        if (prop === 'select') return (cols) => { call.select = cols; return q }
        return (...args) => { call.ops.push([prop, ...args]); return q }
      },
    })
    return q
  }
  return { calls, client: { from, auth: { getUser: async () => ({ data: { user: null }, error: null }) } } }
}

const ts = (p, registry = new Map()) => loadRealModule(join(ROOT, p), { typescript: true, registry })
const time = await ts('src/lib/time.ts')
const workoutDays = await ts('src/lib/workout-days.ts', new Map([['@/lib/time', time]]))
const exercisesLib = await ts('src/lib/coach-exercises.ts', new Map([['@/lib/workout-days', workoutDays]]))

async function route(db, { denied = null } = {}) {
  const requestAuth = await loadRealModule(join(ROOT, 'src/lib/request-auth.ts'), {
    typescript: true,
    registry: new Map([
      // The cookie client knows nobody: the installed app is signed in by its Bearer token alone.
      ['@/lib/supabase/server', { createClient: async () => db.client }],
      ['@supabase/supabase-js', { createClient: () => ({ ...db.client, auth: { getUser: async (token) => ({ data: { user: token === APP_TOKEN ? MEMBER : null }, error: null }) } }) }],
    ]),
  })
  return loadRealModule(join(ROOT, 'src/app/api/client/coach-exercises/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', requestAuth],
      ['@/lib/require-membership', { requireAccount: async () => denied }],
      ['@/lib/time', time],
      ['@/lib/coach-exercises', exercisesLib],
    ]),
  })
}
const get = async (db, { headers = { authorization: `Bearer ${APP_TOKEN}` }, denied } = {}) => {
  const real = Date.now
  Date.now = () => NOW
  try {
    const r = await route(db, { denied })
    const res = await r.GET(new Request('https://shape.test/api/client/coach-exercises', { headers }))
    return { status: res.status, body: await res.json() }
  } finally { Date.now = real }
}

const ex = (id, sent_at, payload, extra = {}) => ({ id, client_id: MEMBER.id, provider_role: 'trainer', provider_id: 7, kind: 'exercise', payload, sent_at, removed_at: null, ...extra })
const world = (over = {}) => ({
  client_profiles: [{ user_id: MEMBER.id, timezone: 'America/Los_Angeles' }],
  subscriptions: [
    { client_id: MEMBER.id, provider_role: 'trainer', provider_id: 7, status: 'active' },
    { client_id: MEMBER.id, provider_role: 'trainer', provider_id: 9, status: 'canceled' },
  ],
  trainers: [{ id: 7, name: 'Jordan Chen' }, { id: 9, name: 'Former Trainer' }],
  coach_pushed_items: [
    // Today in Los Angeles (17:00 on 9 November), though it is 10 November in UTC.
    ex('today-1', '2026-11-10T01:00:00.000Z', { name: 'Hex bar deadlift', sets: '3 sets', reps: '10–12 reps', tempo: '2-0-1-0', cue: 'Push the floor away' }),
    ex('today-2', '2026-11-10T01:05:00.000Z', { name: 'Copenhagen plank', sets: '—', reps: '—', tempo: '—', cue: '' }),
    // 22:00 on 8 November in Los Angeles: yesterday.
    ex('yesterday', '2026-11-09T06:00:00.000Z', { name: 'Goblet squat', sets: '4 sets' }),
    ex('removed', '2026-11-10T01:10:00.000Z', { name: 'Taken back' }, { removed_at: '2026-11-10T01:20:00.000Z' }),
    ex('former-coach', '2026-11-10T01:00:00.000Z', { name: 'From a trainer no longer paid' }, { provider_id: 9 }),
    ex('nameless', '2026-11-10T01:00:00.000Z', { name: '  ' }),
    ex('too-old', '2026-10-20T01:00:00.000Z', { name: 'Last month' }),
    { ...ex('cue', '2026-11-10T02:00:00.000Z', { text: 'Brace' }), kind: 'cue' },
    { ...ex('meal', '2026-11-10T02:00:00.000Z', { name: 'Oats' }), kind: 'meal', provider_role: 'nutritionist' },
  ],
  ...over,
})

test('the route: each exercise on the member\'s own day, from trainers they pay, the coach named', async () => {
  const db = fakeDb(world())
  const { status, body } = await get(db)
  assert.equal(status, 200, JSON.stringify(body))
  assert.equal(body.ok, true)
  assert.equal(body.today, '2026-11-09', 'the member\'s today is Los Angeles\'s')
  assert.deepEqual(Object.keys(body.days), ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'], 'seven days, oldest first, today last')
  assert.deepEqual(body.days['2026-11-09'].map((e) => e.id), ['today-1', 'today-2'])
  assert.deepEqual(body.days['2026-11-08'].map((e) => e.id), ['yesterday'])
  assert.deepEqual(body.days['2026-11-05'], [], 'a day with none is an empty list')
  const first = body.days['2026-11-09'][0]
  assert.deepEqual(
    { name: first.name, sets: first.sets, reps: first.reps, tempo: first.tempo, cue: first.cue, coachName: first.coachName, providerId: first.providerId, day: first.day },
    { name: 'Hex bar deadlift', sets: '3 sets', reps: '10–12 reps', tempo: '2-0-1-0', cue: 'Push the floor away', coachName: 'Jordan Chen', providerId: '7', day: '2026-11-09' },
  )
  assert.deepEqual([body.days['2026-11-09'][1].sets, body.days['2026-11-09'][1].cue], [null, null], 'an empty box (—) is no value')
  const all = Object.values(body.days).flat().map((e) => e.id)
  for (const id of ['removed', 'former-coach', 'nameless', 'too-old', 'cue', 'meal']) assert.ok(!all.includes(id), `${id} is not the member's`)
  const read = db.calls.find((c) => c.table === 'coach_pushed_items')
  assert.ok(read.ops.some(([op, col, v]) => op === 'eq' && col === 'client_id' && v === MEMBER.id))
  assert.ok(read.ops.some(([op, col]) => op === 'is' && col === 'removed_at'))
})

test('the route: no zone on file counts in UTC', async () => {
  const { body } = await get(fakeDb(world({ client_profiles: [] })))
  assert.equal(body.today, '2026-11-10')
  assert.deepEqual(body.days['2026-11-10'].map((e) => e.id), ['today-1', 'today-2'])
  assert.deepEqual(body.days['2026-11-09'].map((e) => e.id), ['yesterday'])
})

test('the route: a failed read is unread (500), never "your trainer added nothing"', async () => {
  // client_profiles too (Codex P2 on #2686): a zone that could not be read is unread, not UTC.
  for (const table of ['coach_pushed_items', 'subscriptions', 'client_profiles']) {
    const { status, body } = await get(fakeDb(world(), { fail: (c) => c.table === table }))
    assert.equal(status, 500, table)
    assert.equal(body.ok, false)
    assert.equal(body.days, undefined)
  }
  // A failed listing read only costs the byline.
  const { status, body } = await get(fakeDb(world(), { fail: (c) => c.table === 'trainers' }))
  assert.equal(status, 200)
  assert.equal(body.days['2026-11-09'][0].coachName, null)
})

test('the route answers the installed app\'s Bearer token, and nobody without one', async () => {
  assert.equal((await get(fakeDb(world()), { headers: {} })).status, 401)
  assert.equal((await get(fakeDb(world()), { headers: { authorization: 'Bearer someone-else' } })).status, 401)
  // The account guard's refusal (a known minor) is the route's answer.
  const minor = nextServer.NextResponse.json({ error: 'Shape is for adults 18 and over.' }, { status: 403 })
  assert.equal((await get(fakeDb(world()), { denied: minor })).status, 403)
  const src = readFileSync(join(ROOT, 'src/app/api/client/coach-exercises/route.ts'), 'utf8')
  assert.match(src, /const denied = await requireAccount\(request\);/, 'free with the account, as Train and the plan are')
})

test('the shared reader: an exercise is a named exercise row, on its member\'s day', () => {
  const at = '2026-11-10T01:00:00.000Z'
  assert.equal(exercisesLib.pushedExerciseOf({ id: 'x', kind: 'cue', payload: { name: 'Brace' }, sent_at: at }, null), null)
  assert.equal(exercisesLib.pushedExerciseOf({ id: 'x', kind: 'exercise', payload: {}, sent_at: at }, null), null)
  assert.equal(exercisesLib.pushedExerciseOf({ id: 'x', kind: 'exercise', payload: { name: 'Row' }, sent_at: 'not a date' }, null), null)
  assert.equal(exercisesLib.pushedExerciseOf({ id: 'x', kind: 'exercise', payload: { name: 'Row' }, sent_at: at }, 'Asia/Tokyo').day, '2026-11-10')
  assert.equal(exercisesLib.pushedExerciseOf({ id: 'x', kind: 'exercise', payload: { name: 'Row' }, sent_at: at }, 'America/Los_Angeles').day, '2026-11-09')
  const e = exercisesLib.pushedExerciseOf({ id: 'x', provider_id: 7, kind: 'exercise', payload: { name: ' Row ', sets: 3, reps: { bad: 1 }, tempo: '—', cue: ' Squeeze ' }, sent_at: at }, null)
  assert.deepEqual([e.name, e.sets, e.reps, e.tempo, e.cue, e.providerId], ['Row', '3', null, null, 'Squeeze', '7'])
  // The read's lower bound reaches the first instant of the oldest day in any zone (UTC+14 included).
  const since = exercisesLib.exerciseReadSince(NOW, 7)
  assert.ok(Date.parse(since) <= Date.parse('2026-11-02T10:00:00.000Z'), since)
})

// ── The app's read ──────────────────────────────────────────────────────────────────────────────

const backend = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8')
const slice = backend.slice(backend.indexOf("// The exercises the member's trainers pushed from the Live console, by the member's day"), backend.indexOf('window.ShapeCoachFeed = {'))
function app({ response, user = { id: MEMBER.id } } = {}) {
  const requests = []
  const channels = []
  const state = { user, session: { access_token: APP_TOKEN } }
  const supabase = {
    channel(name) {
      const ch = { name, on(_k, filter, cb) { ch.filter = filter; ch.cb = cb; return ch }, subscribe() { return ch } }
      channels.push(ch)
      return ch
    },
    removeChannel(ch) { ch.removed = true },
  }
  const ctx = vm.createContext({
    state, supabase, apiBaseUrl: 'https://theshape.test', window: {},
    sessionsAuthHeaders: (extra = {}) => ({ ...extra, Authorization: `Bearer ${state.session.access_token}` }),
    fetch: async (url, opts) => { requests.push({ url, ...opts }); if (typeof response === 'function') return response(); return response },
  })
  vm.runInContext(slice, ctx)
  return { ctx, requests, channels, state }
}
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('the app reads the route with the member\'s Bearer token, and tells ready, none and error apart', async () => {
  const days = { '2026-11-09': [{ id: 'today-1', name: 'Hex bar deadlift' }] }
  let a = app({ response: reply(200, { ok: true, today: '2026-11-09', days }) })
  // Through JSON: the service runs in its own realm, whose objects have other prototypes.
  assert.deepEqual(JSON.parse(JSON.stringify(await a.ctx.getCoachExercises())), { status: 'ready', today: '2026-11-09', days })
  assert.equal(a.requests[0].url, 'https://theshape.test/api/client/coach-exercises')
  assert.equal(a.requests[0].headers.Authorization, `Bearer ${APP_TOKEN}`)
  assert.equal(a.requests[0].cache, 'no-store')
  a = app({ response: reply(500, { ok: false }) })
  assert.equal((await a.ctx.getCoachExercises()).status, 'error', 'a failed read is unread')
  a = app({ response: () => { throw new Error('offline') } })
  assert.equal((await a.ctx.getCoachExercises()).status, 'error')
  a = app({ response: reply(200, { ok: true }) })
  assert.equal((await a.ctx.getCoachExercises()).status, 'error', 'an answer without days is no answer')
  a = app({ response: reply(403, { error: 'Shape is for adults 18 and over.' }) })
  assert.equal((await a.ctx.getCoachExercises()).status, 'none', 'refused by the age gate: nothing of theirs')
  a = app({ response: reply(402, { error: 'Membership required.' }) })
  assert.equal((await a.ctx.getCoachExercises()).status, 'none')
  a = app({ user: null, response: reply(200, { ok: true, days }) })
  assert.equal((await a.ctx.getCoachExercises()).status, 'none')
  assert.equal(a.requests.length, 0, 'signed out, nothing is asked')
  // An answer for an account that has since changed is not shown.
  a = app({ response: () => { a.state.user = { id: 'someone-else' }; return reply(200, { ok: true, days }) } })
  assert.equal((await a.ctx.getCoachExercises()).status, 'none')
})

test('the app listens on a channel of its own and ignores a cue\'s row', () => {
  const a = app()
  const seen = []
  const stop1 = a.ctx.subscribeCoachExercises((c) => seen.push(c))
  a.ctx.subscribeCoachExercises(() => {})
  assert.notEqual(a.channels[0].name, a.channels[1].name, 'two readers never share a channel')
  assert.deepEqual({ table: a.channels[0].filter.table, filter: a.channels[0].filter.filter }, { table: 'coach_pushed_items', filter: `client_id=eq.${MEMBER.id}` })
  a.channels[0].cb({ new: { kind: 'cue' } })
  a.channels[0].cb({ new: { kind: 'exercise' } })
  a.channels[0].cb({ old: { id: 'x' } })
  assert.equal(seen.length, 2, 'an exercise row and a delete that names no kind redraw; a cue does not')
  stop1()
  assert.equal(a.channels[0].removed, true)
  assert.notEqual(a.channels[1].removed, true)
})

// ── Train ───────────────────────────────────────────────────────────────────────────────────────

globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) }
const REG = { registry: new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]) }
const M = await loadRealModule(join(APP_ROOT, 'mobile-app/src/broadsheet/BSCoachExercises.jsx'), REG)
const titles = (d) => d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSFocusTitle').map((n) => n.props)
const READY = {
  status: 'ready',
  days: {
    '2026-11-09': [
      { id: 'a', providerId: '7', coachName: 'Jordan Chen', name: 'Hex bar deadlift', sets: '3 sets', reps: '10–12 reps', tempo: '2-0-1-0', cue: 'Push the floor away' },
      { id: 'b', providerId: '7', coachName: 'Jordan Chen', name: 'Copenhagen plank', sets: null, reps: null, tempo: null, cue: null },
      { id: 'c', providerId: '12', coachName: null, name: 'Sled push', sets: '4', reps: '20 m', tempo: null, cue: null },
    ],
    '2026-11-08': [],
  },
}

test('Train draws the day\'s exercises under their trainer: name, scheme, tempo and cue', () => {
  const d = drive(M.BSCoachExercisesView, { read: READY, date: '2026-11-09', today: true })
  const heads = titles(d)
  assert.deepEqual(heads.map((h) => [h.kicker, h.title, h.meta]), [['From Jordan Chen', 'Added today', '2 exercises'], ['From your trainer', 'Added today', '1 exercise']])
  assert.match(d.text, /Hex bar deadlift/)
  assert.match(d.text, /3 sets · 10–12 reps/)
  assert.match(d.text, /Tempo 2-0-1-0 · Push the floor away/)
  assert.match(d.text, /Copenhagen plank/)
  assert.match(d.text, /Sled push/)
  assert.equal(d.nodes().filter((n) => n.props && n.props['data-coach-exercise'] === '').length, 3)
})

test('another day reads by its name; an empty day, a load and a signed-out read draw nothing', () => {
  assert.equal(titles(drive(M.BSCoachExercisesView, { read: READY, date: '2026-11-09', today: false, dayLabel: 'Mon' }))[0].title, 'Added · Mon')
  for (const [read, date] of [[READY, '2026-11-08'], [READY, '2026-11-01'], [{ status: 'loading' }, '2026-11-09'], [{ status: 'none' }, '2026-11-09']]) {
    assert.equal(M.BSCoachExercisesView({ read, date, today: true }), null, `${read.status} ${date}`)
  }
})

test('a failed read says so, with Try again, never as an empty day', () => {
  let retried = 0
  const d = drive(M.BSCoachExercisesView, { read: { status: 'error' }, date: '2026-11-09', onRetry: () => { retried += 1 } })
  assert.match(d.text, /didn’t load/)
  d.click('Try again')
  assert.equal(retried, 1)
})

test('a weekday of Train\'s week is that date on the device\'s calendar, Monday first', () => {
  const wed = new Date(2026, 10, 11, 9, 0) // Wednesday 11 November, local
  assert.equal(M.bsCoachExerciseDate(0, wed), '2026-11-09')
  assert.equal(M.bsCoachExerciseDate(2, wed), '2026-11-11')
  assert.equal(M.bsCoachExerciseDate(6, wed), '2026-11-15')
  const sun = new Date(2026, 10, 15, 23, 30)
  assert.equal(M.bsCoachExerciseDate(0, sun), '2026-11-09', 'Sunday still belongs to the week that began on Monday')
})

test('the tiles count from the account\'s today, not the phone\'s, when the two are a date apart (Codex P2 on #2686)', () => {
  const wed = new Date(2026, 10, 11, 1, 0) // the phone: Wednesday 11 November, 01:00
  // The account keeps a zone still on Tuesday the 10th: the today tile (Wednesday) is the 10th.
  assert.equal(M.bsCoachExerciseDate(2, wed, '2026-11-10'), '2026-11-10')
  assert.equal(M.bsCoachExerciseDate(1, wed, '2026-11-10'), '2026-11-09', 'the tile before is the account\'s yesterday')
  assert.equal(M.bsCoachExerciseDate(0, wed, '2026-11-10'), '2026-11-08')
  // Ahead of the phone (Thursday the 12th already): across a month end too.
  assert.equal(M.bsCoachExerciseDate(2, wed, '2026-11-12'), '2026-11-12')
  assert.equal(M.bsCoachExerciseDate(6, new Date(2026, 10, 30, 9), '2026-12-01'), '2026-12-07')
  // No read yet, or a malformed one: the device's dates.
  assert.equal(M.bsCoachExerciseDate(2, wed, null), '2026-11-11')
  assert.equal(M.bsCoachExerciseDate(2, wed, 'Tuesday'), '2026-11-11')
})

test('Train\'s day draws the section for the day picked', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainDay.jsx'), 'utf8')
  assert.match(src, /import \{ BSCoachExercises, BSCoachExercisesView \} from '\.\/BSCoachExercises\.jsx';/)
  // Off the page's read when it hands one in (Train's, which runs today's in the session), else its own.
  assert.match(src, /<BSCoachExercisesView read=\{p\.coachRead\} date=\{p\.coachDate\} today=\{day === todayIdx\} dayLabel=\{shortDay\(day\)\} onRetry=\{p\.onCoachRetry\} inSession=\{p\.coachInSession !== false\} \/>/)
  assert.match(src, /<BSCoachExercises dayIdx=\{day\} today=\{day === todayIdx\} dayLabel=\{shortDay\(day\)\} \/>/)
  // Ahead of On deck: the day's own program, then what the trainer added to it.
  assert.ok(src.indexOf('<BSCoachExercisesView') < src.indexOf("tr('session:train.onDeck'"))
})

test('Start these hands today\'s added exercises to Train\'s player, on a rest day too (Codex P1 on #2686)', async () => {
  const { bsPreviewSession } = await import('../mobile-app/src/services/workoutSession.mjs')
  const sent = []
  const prev = globalThis.dispatchEvent
  const prevEvent = globalThis.CustomEvent
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail } }
  globalThis.dispatchEvent = (e) => { sent.push(e); return true }
  try {
    const d = drive(M.BSCoachExercisesView, { read: READY, date: '2026-11-09', today: true })
    d.click('Start these')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].type, 'shape:startWorkout', 'the shell\'s own Start, which opens Train\'s player')
    const w = sent[0].detail.workout
    assert.equal(w.title, 'From Jordan Chen')
    const session = bsPreviewSession(w)
    assert.deepEqual(session.moves.map((m) => [m.m, m.sets, m.reps, m.s]), [
      ['Hex bar deadlift', 3, '10–12', '3 × 10–12'],
      ['Copenhagen plank', 1, '', ''],
    ], 'the first trainer\'s two, as the player runs them')
    assert.equal(session.moves[0].tempo, '2-0-1-0')
    assert.equal(session.moves[0].cue, 'Push the floor away')
    assert.equal(session.clientWorkoutId, null, 'a session of its own, never written over the day\'s assigned one')
    assert.equal(drive(M.BSCoachExercisesView, { read: READY, date: '2026-11-09', today: false, dayLabel: 'Mon' }).buttons().filter((b) => b.label.startsWith('Start these')).length, 0, 'another day is read, not started')
  } finally {
    if (prev) globalThis.dispatchEvent = prev; else delete globalThis.dispatchEvent
    if (prevEvent) globalThis.CustomEvent = prevEvent; else delete globalThis.CustomEvent
  }
})
