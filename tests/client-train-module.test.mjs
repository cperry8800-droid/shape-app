// Train is its own module (BSClientTrain.jsx), and a trainer's added exercises run inside the day's
// session (Codex P1 on #2686).
//
// ⚠ BEFORE THIS, TODAY'S ADDITIONS RAN AS A SESSION OF THEIR OWN. A trainer's "+ Add to today's session"
// in the website's Live console reached Train's list (BSCoachExercises.jsx), whose Start these ran them
// apart from the day's assigned workout, because BSClientTrain launched BSSession with
// bsSessionMoves(effMoves): the program alone. And a rest day with additions still read Rest, with no
// Start. Now Train reads them once, Start session runs the program's moves and then them
// (bsTrainSessionPlan), a rest day with additions offers Start, and the list under the program says the
// exercises are in today's session.
//
// The move out of iosAppBroadsheetClient.jsx follows the integrations page's rules
// (integrations-page-module.test.mjs): evaluating the module reads no window global, it never imports
// the client module, and every global it reads at call time is published.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { stripComments } from './helpers/strip-comments.mjs'
import { loadRealModule } from './helpers/load-real-module.mjs'
import { SHIM, ROOT, drive } from './helpers/broadsheet-mount.mjs'

const NEW = 'mobile-app/src/broadsheet/BSClientTrain.jsx'
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'
const page = stripComments(fs.readFileSync(path.join(ROOT, NEW), 'utf8'))
const client = stripComments(fs.readFileSync(path.join(ROOT, CLIENT), 'utf8'))

test('Train lives in its own module; the client imports it and declares it nowhere', () => {
  assert.match(page, /^export function BSClientTrain\(/m)
  assert.doesNotMatch(client, /^(?:export )?function BSClientTrain\(/m, 'declared in the client module again')
  assert.match(client, /^import \{ BSClientTrain \} from '\.\/BSClientTrain\.jsx';/m)
  assert.match(client, /<BSClientTrain\s/)
  assert.doesNotMatch(page, /from '\.\/iosAppBroadsheetClient\.jsx'/, 'the module never imports the client back')
})

test('evaluating the module by itself reads NO window global, whatever the spelling', async () => {
  const reads = []
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined },
    has: (_t, prop) => { reads.push(String(prop)); return false },
  })
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true })
  let mod
  try {
    mod = await loadRealModule(path.join(ROOT, NEW), { registry: new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]) })
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window
  }
  assert.ok(typeof mod.BSClientTrain === 'function')
  assert.deepEqual(reads, [], `the module read window.${reads.join(', window.')} while it was being evaluated`)
})

test('every global the page reads at call time is published before it is called', () => {
  const m = /^\s*const \{([^}]+)\} = window;/m.exec(page.slice(page.indexOf('export function BSClientTrain(')))
  assert.ok(m, 'the page names its globals on its first line')
  const names = m[1].split(',').map((x) => x.trim()).filter(Boolean)
  assert.ok(names.length >= 15, names.join(', '))
  // The client publishes what it defines; the chrome's pieces come from iosAppBroadsheet.jsx, which
  // the client itself reads off window at its top.
  const published = new Set()
  for (const a of client.matchAll(/Object\.assign\(window,\s*\{([\s\S]*?)\}\);/g)) {
    for (const n of a[1].split(',')) { const k = n.trim().split(':')[0].trim(); if (k) published.add(k) }
  }
  const chrome = /^const \{\s*([\s\S]*?)\} = window;/m.exec(client)[1].split(',').map((x) => x.trim())
  for (const n of names) assert.ok(published.has(n) || chrome.includes(n), `${n} is read off window but nobody publishes it`)
  // Each name the client publishes for Train is one it really defines.
  for (const n of names.filter((x) => published.has(x) && !chrome.includes(x))) {
    assert.match(client, new RegExp(`^(?:function|const) ${n}\\b`, 'm'), `${n} is published but not defined in the client`)
  }
})

// ── The session ─────────────────────────────────────────────────────────────────────────────────

const REG = { registry: new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]) }
const EX = await loadRealModule(path.join(ROOT, 'mobile-app/src/broadsheet/BSCoachExercises.jsx'), REG)
const { bsSessionMoves, bsPreviewSession } = await import('../mobile-app/src/services/workoutSession.mjs')
const READ = {
  status: 'ready',
  today: '2026-11-09',
  days: {
    '2026-11-09': [
      { id: 'b', providerId: '12', coachName: null, name: 'Sled push', sets: '4', reps: '20 m', tempo: null, cue: null, sentAt: '2026-11-10T01:10:00.000Z' },
      { id: 'a', providerId: '7', coachName: 'Jordan Chen', name: 'Hex bar deadlift', sets: '3 sets', reps: '10–12 reps', tempo: '2-0-1-0', cue: 'Push the floor away', sentAt: '2026-11-10T01:00:00.000Z' },
    ],
    '2026-11-08': [{ id: 'y', providerId: '7', coachName: 'Jordan Chen', name: 'Goblet squat', sets: '4 sets', reps: null, sentAt: '2026-11-09T06:00:00.000Z' }],
  },
}
const PROGRAM = [{ n: '01', m: 'Back squat', s: '5 × 5', l: '225 lb' }, { n: '02', m: 'RDL', s: '3 × 8', l: '185 lb' }]

test('today\'s session is the program\'s moves, then the added exercises in the order they were added', () => {
  const plan = EX.bsTrainSessionPlan({ moves: PROGRAM, isRest: false, isToday: true, read: READ, date: '2026-11-09' })
  assert.deepEqual(plan.rows.map((r) => r.m), ['Back squat', 'RDL', 'Hex bar deadlift', 'Sled push'])
  assert.equal(plan.restWithWork, false)
  const moves = bsSessionMoves(plan.rows)
  assert.deepEqual(moves.map((m) => [m.m, m.sets, m.reps]), [['Back squat', 5, '5'], ['RDL', 3, '8'], ['Hex bar deadlift', 3, '10–12'], ['Sled push', 4, '20 m']])
  assert.equal(moves[2].tempo, '2-0-1-0')
  assert.equal(moves[2].cue, 'Push the floor away')
  assert.equal(moves[2].coachAdded, true)
  assert.equal(moves[2].coachExerciseId, 'a')
  assert.ok(!moves[0].coachAdded, 'a program move is not marked added')
  // The same moves Start these runs as a session of its own (no plan): one reading of the coach's words.
  const alone = bsPreviewSession(EX.bsCoachExerciseWorkout([READ.days['2026-11-09'][1]])).moves[0]
  assert.deepEqual([moves[2].m, moves[2].sets, moves[2].reps, moves[2].s], [alone.m, alone.sets, alone.reps, alone.s])
})

test('a rest day with additions has work to start; another day, a failed read and none add nothing', () => {
  const rest = EX.bsTrainSessionPlan({ moves: [], isRest: true, isToday: true, read: READ, date: '2026-11-09' })
  assert.equal(rest.restWithWork, true)
  assert.deepEqual(rest.rows.map((r) => r.m), ['Hex bar deadlift', 'Sled push'])
  const quiet = (o) => EX.bsTrainSessionPlan({ moves: PROGRAM, isRest: false, isToday: true, read: READ, date: '2026-11-09', ...o })
  assert.equal(quiet({ isToday: false }).rows, PROGRAM, 'another day\'s additions are read, not run')
  assert.equal(quiet({ read: { status: 'error' } }).rows, PROGRAM, 'a failed read: the day as planned')
  assert.equal(quiet({ read: { status: 'loading' } }).rows, PROGRAM)
  assert.equal(quiet({ date: '2026-11-07' }).rows, PROGRAM)
  assert.equal(EX.bsTrainSessionPlan({ moves: [], isRest: true, isToday: true, read: { status: 'error' }, date: '2026-11-09' }).restWithWork, false, 'a rest day stays rest when nothing is known')
})

test('Train runs the plan\'s rows, and a rest day with work offers Start on no assigned workout', () => {
  assert.match(page, /bsTrainSessionPlan\(\{ moves: effMoves, isRest: isRestDay, isToday: day === bsWeekdayIdx\(\), read: _coachRead, date: coachDate \}\)/)
  assert.match(page, /moves=\{openSession \? \[\] : bsSessionMoves\(sessionRows\)\}/, 'the session runs the rows, additions included')
  assert.doesNotMatch(page, /bsSessionMoves\(effMoves\)/, 'never the program alone')
  assert.match(page, /clientWorkoutId=\{openSession \|\| coachOnlyDay \? null : cur\.workoutId\}/, 'a rest day\'s additions write to no assigned workout')
  assert.match(page, /isRest=\{isRestDay && !coachOnlyDay\}/, 'a rest day with additions shows Start')
  assert.match(page, /coachRead=\{_coachRead\} coachDate=\{coachDate\} onCoachRetry=\{coachEx\.retry\}/, 'the list is drawn off the same read')
  // With no plan, or a plan that did not load, the list stands alone with its Start these.
  assert.equal((page.match(/<BSCoachExercisesView read=\{_coachRead\} date=\{coachTodayDate\} today onRetry=\{coachEx\.retry\} \/>/g) || []).length, 2)
  assert.equal((page.match(/useBSCoachExercises\(\)/g) || []).length, 1, 'one read for the page')
})

test('on Train with a plan, today\'s list says the exercises are in the session and has no Start of its own', () => {
  globalThis.ShapeI18n = { t: (key, opts = {}) => String(opts.defaultValue ?? key) }
  const inSession = drive(EX.BSCoachExercisesView, { read: READ, date: '2026-11-09', today: true, inSession: true })
  assert.match(inSession.text, /In today’s session/)
  assert.equal(inSession.buttons().filter((b) => b.label.startsWith('Start these')).length, 0)
  const alone = drive(EX.BSCoachExercisesView, { read: READ, date: '2026-11-09', today: true })
  assert.equal(alone.buttons().filter((b) => b.label.startsWith('Start these')).length, 2, 'standing alone, each trainer\'s list starts')
  const day = stripComments(fs.readFileSync(path.join(ROOT, 'mobile-app/src/broadsheet/BSTrainDay.jsx'), 'utf8'))
  assert.match(day, /<BSCoachExercisesView read=\{p\.coachRead\} date=\{p\.coachDate\} today=\{day === todayIdx\} dayLabel=\{shortDay\(day\)\} onRetry=\{p\.onCoachRetry\} inSession \/>/)
})
