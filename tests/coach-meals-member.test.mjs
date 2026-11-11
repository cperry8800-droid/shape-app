// A nutritionist's meals and grocery note from the Live console reach the member's Eat and Grocery
// (left by #2686).
//
// ⚠ BEFORE THIS NOTHING READ THEM. NutritionistLiveConsole's "+ Add to today's plan" saved a
// coach_pushed_items row of kind 'meal', and /api/client/nutrition sent every meal never removed as
// `todayMeals`, which neither the app nor the website read; its grocery note could not be saved at all
// (the kind check refused it). Now:
//   · /api/client/coach-meals reads the member's last seven days, each meal on the member's day it was
//     sent (client_profiles.timezone), and each nutritionist's newest grocery note, from nutritionists
//     the member pays now, the coach named, and says a failed read rather than answering "none";
//   · the app reads it with the member's Bearer token (window.ShapeCoachFeed.meals), and a change in the
//     console redraws it (subscribeMeals, on a channel of its own);
//   · Eat draws a day's meals under that day's menu (BSEatDay → BSCoachMeals), today's with the grocery
//     notes, and Grocery draws the notes under the list's head (BSGroceryList → BSCoachGroceryNotes).
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
const mealsLib = await ts('src/lib/coach-meals.ts', new Map([['@/lib/workout-days', workoutDays]]))

async function route(db, { denied = null } = {}) {
  const requestAuth = await loadRealModule(join(ROOT, 'src/lib/request-auth.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/supabase/server', { createClient: async () => db.client }],
      ['@supabase/supabase-js', { createClient: () => ({ ...db.client, auth: { getUser: async (token) => ({ data: { user: token === APP_TOKEN ? MEMBER : null }, error: null }) } }) }],
    ]),
  })
  return loadRealModule(join(ROOT, 'src/app/api/client/coach-meals/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', requestAuth],
      ['@/lib/require-membership', { requireAccount: async () => denied }],
      ['@/lib/time', time],
      ['@/lib/coach-exercises', exercisesLib],
      ['@/lib/coach-meals', mealsLib],
    ]),
  })
}
const get = async (db, { headers = { authorization: `Bearer ${APP_TOKEN}` }, denied } = {}) => {
  const real = Date.now
  Date.now = () => NOW
  try {
    const r = await route(db, { denied })
    const res = await r.GET(new Request('https://shape.test/api/client/coach-meals', { headers }))
    return { status: res.status, body: await res.json() }
  } finally { Date.now = real }
}

const meal = (id, sent_at, payload, extra = {}) => ({ id, client_id: MEMBER.id, provider_role: 'nutritionist', provider_id: 7, kind: 'meal', payload, sent_at, removed_at: null, ...extra })
const note = (id, sent_at, text, extra = {}) => ({ id, client_id: MEMBER.id, provider_role: 'nutritionist', provider_id: 7, kind: 'grocery_note', payload: { text }, sent_at, removed_at: null, ...extra })
const world = (over = {}) => ({
  client_profiles: [{ user_id: MEMBER.id, timezone: 'America/Los_Angeles' }],
  subscriptions: [
    { client_id: MEMBER.id, provider_role: 'nutritionist', provider_id: 7, status: 'active' },
    { client_id: MEMBER.id, provider_role: 'nutritionist', provider_id: 9, status: 'canceled' },
  ],
  nutritionists: [{ id: 7, name: 'Priya Rao' }, { id: 9, name: 'Former Nutritionist' }],
  coach_pushed_items: [
    // Today in Los Angeles (17:00 on 9 November), though it is 10 November in UTC.
    meal('today-1', '2026-11-10T01:00:00.000Z', { name: 'Salmon bowl', time: '12:30 pm', kcal: '540', protein: 42, note: 'After your run', ingredients: ['Salmon', ' ', 'Rice'], alternatives: ['Cod bowl'] }),
    meal('today-2', '2026-11-10T01:05:00.000Z', { name: 'Greek yogurt', time: '—', kcal: null, protein: 'lots' }),
    // 22:00 on 8 November in Los Angeles: yesterday.
    meal('yesterday', '2026-11-09T06:00:00.000Z', { name: 'Lentil soup' }),
    meal('removed', '2026-11-10T01:10:00.000Z', { name: 'Taken back' }, { removed_at: '2026-11-10T01:20:00.000Z' }),
    meal('former-coach', '2026-11-10T01:00:00.000Z', { name: 'From a nutritionist no longer paid' }, { provider_id: 9 }),
    meal('nameless', '2026-11-10T01:00:00.000Z', { name: '  ' }),
    meal('too-old', '2026-10-20T01:00:00.000Z', { name: 'Last month' }),
    { ...meal('cue', '2026-11-10T02:00:00.000Z', { text: 'Sip water' }), kind: 'cue' },
    { ...meal('exercise', '2026-11-10T02:00:00.000Z', { name: 'Row' }), kind: 'exercise', provider_role: 'trainer' },
    // The notes stand until replaced: the newest of each, from a month ago too.
    note('note-old', '2026-10-01T08:00:00.000Z', 'Old note'),
    note('note-new', '2026-10-12T08:00:00.000Z', 'Swap salmon for cod if the price jumps'),
    note('note-former', '2026-11-01T08:00:00.000Z', 'From before', { provider_id: 9 }),
    note('note-removed', '2026-11-05T08:00:00.000Z', 'Taken back', { removed_at: '2026-11-06T08:00:00.000Z' }),
  ],
  ...over,
})

test('the route: each meal on the member\'s own day, from nutritionists they pay, the coach named', async () => {
  const db = fakeDb(world())
  const { status, body } = await get(db)
  assert.equal(status, 200, JSON.stringify(body))
  assert.equal(body.ok, true)
  assert.equal(body.today, '2026-11-09', 'the member\'s today is Los Angeles\'s')
  assert.deepEqual(Object.keys(body.days), ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'])
  assert.deepEqual(body.days['2026-11-09'].map((m) => m.id), ['today-1', 'today-2'])
  assert.deepEqual(body.days['2026-11-08'].map((m) => m.id), ['yesterday'])
  assert.deepEqual(body.days['2026-11-05'], [], 'a day with none is an empty list')
  const first = body.days['2026-11-09'][0]
  assert.deepEqual(
    { name: first.name, time: first.time, kcal: first.kcal, protein: first.protein, note: first.note, ingredients: first.ingredients, alternatives: first.alternatives, coachName: first.coachName, providerId: first.providerId, day: first.day },
    { name: 'Salmon bowl', time: '12:30 pm', kcal: 540, protein: 42, note: 'After your run', ingredients: ['Salmon', 'Rice'], alternatives: ['Cod bowl'], coachName: 'Priya Rao', providerId: '7', day: '2026-11-09' },
  )
  const second = body.days['2026-11-09'][1]
  assert.deepEqual([second.time, second.kcal, second.protein], [null, null, null], 'an empty box (—), null and words are no value')
  const all = Object.values(body.days).flat().map((m) => m.id)
  for (const id of ['removed', 'former-coach', 'nameless', 'too-old', 'cue', 'exercise']) assert.ok(!all.includes(id), `${id} is not the member's`)
  assert.deepEqual(body.notes.map((n) => [n.id, n.text, n.coachName]), [['note-new', 'Swap salmon for cod if the price jumps', 'Priya Rao']], 'the newest note of a nutritionist paid now')
  for (const c of db.calls.filter((x) => x.table === 'coach_pushed_items')) {
    assert.ok(c.ops.some(([op, col, v]) => op === 'eq' && col === 'client_id' && v === MEMBER.id))
    assert.ok(c.ops.some(([op, col, v]) => op === 'eq' && col === 'provider_role' && v === 'nutritionist'))
    assert.ok(c.ops.some(([op, col]) => op === 'is' && col === 'removed_at'))
  }
})

test('the route: no zone on file counts in UTC', async () => {
  const { body } = await get(fakeDb(world({ client_profiles: [] })))
  assert.equal(body.today, '2026-11-10')
  assert.deepEqual(body.days['2026-11-10'].map((m) => m.id), ['today-1', 'today-2'])
})

test('the route: a failed read is unread (500), never "your nutritionist sent nothing"', async () => {
  const kindIs = (k) => (c) => c.table === 'coach_pushed_items' && c.ops.some(([op, col, v]) => op === 'eq' && col === 'kind' && v === k)
  for (const [label, fail] of [['meals', kindIs('meal')], ['notes', kindIs('grocery_note')], ['subscriptions', (c) => c.table === 'subscriptions'], ['zone', (c) => c.table === 'client_profiles']]) {
    const { status, body } = await get(fakeDb(world(), { fail }))
    assert.equal(status, 500, label)
    assert.equal(body.ok, false)
    assert.equal(body.days, undefined)
    assert.equal(body.notes, undefined)
  }
  const { status, body } = await get(fakeDb(world(), { fail: (c) => c.table === 'nutritionists' }))
  assert.equal(status, 200, 'a failed listing read only costs the byline')
  assert.equal(body.days['2026-11-09'][0].coachName, null)
  assert.equal(body.notes[0].coachName, null)
})

test('the route answers the installed app\'s Bearer token, and nobody without one', async () => {
  assert.equal((await get(fakeDb(world()), { headers: {} })).status, 401)
  assert.equal((await get(fakeDb(world()), { headers: { authorization: 'Bearer someone-else' } })).status, 401)
  const minor = nextServer.NextResponse.json({ error: 'Shape is for adults 18 and over.' }, { status: 403 })
  assert.equal((await get(fakeDb(world()), { denied: minor })).status, 403)
  const src = readFileSync(join(ROOT, 'src/app/api/client/coach-meals/route.ts'), 'utf8')
  assert.match(src, /const denied = await requireAccount\(request\);/)
  assert.match(readFileSync(join(ROOT, 'src/lib/warroom.ts'), 'utf8'), /\['\/api\/client\/coach-meals', 'GET'\]/, 'in RAW_ROUTES')
})

test('the shared reader: a meal is a named meal row on its member\'s day; a note is the newest of its coach', () => {
  const at = '2026-11-10T01:00:00.000Z'
  assert.equal(mealsLib.pushedMealOf({ id: 'x', kind: 'exercise', payload: { name: 'Row' }, sent_at: at }, null), null)
  assert.equal(mealsLib.pushedMealOf({ id: 'x', kind: 'meal', payload: {}, sent_at: at }, null), null)
  assert.equal(mealsLib.pushedMealOf({ id: 'x', kind: 'meal', payload: { name: 'Oats' }, sent_at: 'not a date' }, null), null)
  assert.equal(mealsLib.pushedMealOf({ id: 'x', kind: 'meal', payload: { name: 'Oats' }, sent_at: at }, 'America/Los_Angeles').day, '2026-11-09')
  const m = mealsLib.pushedMealOf({ id: 'x', provider_id: 7, kind: 'meal', payload: { name: ' Oats ', kcal: -5, protein: '31.6', ingredients: 'not a list', alternatives: [{ bad: 1 }, 'Eggs'] }, sent_at: at }, null)
  assert.deepEqual([m.name, m.kcal, m.protein, m.ingredients, m.alternatives], ['Oats', null, 32, [], ['Eggs']])
  assert.equal(mealsLib.groceryNoteOf({ id: 'n', kind: 'grocery_note', payload: { text: '  ' }, sent_at: at }), null)
  assert.equal(mealsLib.groceryNoteOf({ id: 'n', kind: 'meal', payload: { text: 'Hi' }, sent_at: at }), null)
  const notes = mealsLib.latestGroceryNotes([
    { id: 'b', provider_id: 7, kind: 'grocery_note', payload: { text: 'New' }, sent_at: '2026-11-02T00:00:00.000Z' },
    { id: 'a', provider_id: 7, kind: 'grocery_note', payload: { text: 'Old' }, sent_at: '2026-11-01T00:00:00.000Z' },
    { id: 'c', provider_id: 8, kind: 'grocery_note', payload: { text: 'Other' }, sent_at: '2026-10-01T00:00:00.000Z' },
  ])
  assert.deepEqual([...notes.values()].map((n) => n.id), ['b', 'c'])
})

// ── The app's read ──────────────────────────────────────────────────────────────────────────────

const backend = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8')
const slice = backend.slice(backend.indexOf("// The member's nutritionist meals and grocery notes"), backend.indexOf('window.ShapeCoachFeed = {'))
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
  assert.ok(slice.includes('async function getCoachMeals()'), 'the slice holds the reader')
  const days = { '2026-11-09': [{ id: 'today-1', name: 'Salmon bowl' }] }
  const notes = [{ id: 'n', text: 'Buy oats' }]
  let a = app({ response: reply(200, { ok: true, today: '2026-11-09', days, notes }) })
  assert.deepEqual(JSON.parse(JSON.stringify(await a.ctx.getCoachMeals())), { status: 'ready', today: '2026-11-09', days, notes })
  assert.equal(a.requests[0].url, 'https://theshape.test/api/client/coach-meals')
  assert.equal(a.requests[0].headers.Authorization, `Bearer ${APP_TOKEN}`)
  assert.equal(a.requests[0].cache, 'no-store')
  a = app({ response: reply(500, { ok: false }) })
  assert.equal((await a.ctx.getCoachMeals()).status, 'error', 'a failed read is unread')
  a = app({ response: () => { throw new Error('offline') } })
  assert.equal((await a.ctx.getCoachMeals()).status, 'error')
  a = app({ response: reply(200, { ok: true }) })
  assert.equal((await a.ctx.getCoachMeals()).status, 'error', 'an answer without days is no answer')
  a = app({ response: reply(403, { error: 'Shape is for adults 18 and over.' }) })
  assert.equal((await a.ctx.getCoachMeals()).status, 'none')
  a = app({ user: null, response: reply(200, { ok: true, days }) })
  assert.equal((await a.ctx.getCoachMeals()).status, 'none')
  assert.equal(a.requests.length, 0, 'signed out, nothing is asked')
  a = app({ response: () => { a.state.user = { id: 'someone-else' }; return reply(200, { ok: true, days }) } })
  assert.equal((await a.ctx.getCoachMeals()).status, 'none', 'an answer for an account since changed is not shown')
  assert.match(backend, /meals: getCoachMeals,\s+subscribeMeals: subscribeCoachMeals,/)
})

test('the app listens on a channel of its own, for meals and notes only', () => {
  const a = app()
  const seen = []
  const stop1 = a.ctx.subscribeCoachMeals((c) => seen.push(c))
  a.ctx.subscribeCoachMeals(() => {})
  assert.notEqual(a.channels[0].name, a.channels[1].name, 'two readers never share a channel')
  assert.deepEqual({ table: a.channels[0].filter.table, filter: a.channels[0].filter.filter }, { table: 'coach_pushed_items', filter: `client_id=eq.${MEMBER.id}` })
  for (const kind of ['cue', 'exercise', 'meal', 'grocery_note']) a.channels[0].cb({ new: { kind } })
  a.channels[0].cb({ old: { id: 'x' } })
  assert.equal(seen.length, 3, 'a meal, a note and a delete that names no kind redraw; a cue and an exercise do not')
  stop1()
  assert.equal(a.channels[0].removed, true)
  assert.notEqual(a.channels[1].removed, true)
})

// ── Eat and Grocery ──────────────────────────────────────────────────────────────────────────────

globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) }
const REG = { registry: new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]) }
const M = await loadRealModule(join(APP_ROOT, 'mobile-app/src/broadsheet/BSCoachMeals.jsx'), REG)
const titles = (d) => d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSFocusTitle').map((n) => n.props)
const READY = {
  status: 'ready',
  today: '2026-11-09',
  days: {
    '2026-11-09': [
      { id: 'a', providerId: '7', coachName: 'Priya Rao', name: 'Salmon bowl', time: '12:30 pm', kcal: 540, protein: 42, note: 'After your run', ingredients: ['Salmon'], alternatives: ['Cod bowl', 'Tofu bowl'] },
      { id: 'b', providerId: '7', coachName: 'Priya Rao', name: 'Greek yogurt', time: null, kcal: null, protein: null, note: null, ingredients: [], alternatives: [] },
      { id: 'c', providerId: '12', coachName: null, name: 'Oats', time: '8:00 am', kcal: 380, protein: null, note: null, ingredients: [], alternatives: [] },
    ],
    '2026-11-08': [],
  },
  notes: [{ id: 'n', providerId: '7', coachName: 'Priya Rao', text: 'Swap salmon for cod if the price jumps' }],
}

test('Eat draws the day\'s meals under their nutritionist: name, time, figures, note and swaps', () => {
  const d = drive(M.BSCoachMealsView, { read: READY, date: '2026-11-09', today: true })
  assert.deepEqual(titles(d).map((h) => [h.kicker, h.title, h.meta]), [['From Priya Rao', 'Added today', '2 meals'], ['From your nutritionist', 'Added today', '1 meal']])
  assert.match(d.text, /Salmon bowl/)
  assert.match(d.text, /12:30 pm/)
  assert.match(d.text, /540 kcal · 42 g protein/)
  assert.match(d.text, /After your run · Swaps: Cod bowl, Tofu bowl/)
  assert.match(d.text, /380 kcal/)
  assert.equal(d.nodes().filter((n) => n.props && n.props['data-coach-meal'] === '').length, 3)
  assert.match(d.text, /Grocery note · Priya Rao/, 'today carries the grocery note')
  assert.match(d.text, /Swap salmon for cod if the price jumps/)
})

test('another day reads by its name and has no note; an empty day, a load and a signed-out read draw nothing', () => {
  const other = drive(M.BSCoachMealsView, { read: READY, date: '2026-11-09', today: false, dayLabel: 'Mon' })
  assert.equal(titles(other)[0].title, 'Added · Mon')
  assert.doesNotMatch(other.text, /Grocery note/)
  for (const [read, date, today] of [[READY, '2026-11-08', false], [{ status: 'loading' }, '2026-11-09', true], [{ status: 'none' }, '2026-11-09', true]]) {
    const d = drive(M.BSCoachMealsView, { read, date, today })
    assert.equal(d.text.trim(), '', `${read.status} ${date}`)
  }
  // Today with no meals still carries the note.
  assert.match(drive(M.BSCoachMealsView, { read: READY, date: '2026-11-08', today: true }).text, /Swap salmon for cod/)
})

test('a failed read says so, with Try again, never as an empty day or an empty note', () => {
  let retried = 0
  const d = drive(M.BSCoachMealsView, { read: { status: 'error' }, date: '2026-11-09', onRetry: () => { retried += 1 } })
  assert.match(d.text, /meals didn’t load/)
  d.click('Try again')
  assert.equal(retried, 1)
  const g = drive(M.BSCoachGroceryNotesView, { read: { status: 'error' }, onRetry: () => { retried += 1 } })
  assert.match(g.text, /grocery note didn’t load/)
  g.click('Try again')
  assert.equal(retried, 2)
  assert.equal(drive(M.BSCoachGroceryNotesView, { read: { status: 'ready', days: {}, notes: [] } }).text.trim(), '', 'no note draws nothing')
})

test('Eat\'s day and Grocery mount the sections, which read for themselves', () => {
  const eat = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSEatDay.jsx'), 'utf8')
  assert.match(eat, /import \{ BSCoachMeals \} from '\.\/BSCoachMeals\.jsx';/)
  assert.match(eat, /<BSCoachMeals dayIdx=\{day\} today=\{isToday\} dayLabel=\{pick\.short\} \/>/)
  assert.ok(eat.indexOf('<BSCoachMeals') > eat.indexOf('<BSFocusLine'), 'under the day\'s own menu')
  const grocery = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSGroceryList.jsx'), 'utf8')
  assert.match(grocery, /import \{ BSCoachGroceryNotes \} from '\.\/BSCoachMeals\.jsx';/)
  assert.ok(grocery.indexOf('<BSCoachGroceryNotes />') > grocery.indexOf('data-grocery-list-card'), 'under the list\'s head')
})
