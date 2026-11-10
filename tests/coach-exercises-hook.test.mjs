// Train's "From your trainer" section, mounted with real React in jsdom: it reads the member's pushed
// exercises once, redraws when the console adds or removes one (ShapeCoachFeed.subscribeExercises),
// opens its live channel again for a new account, and closes it on unmount.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRealModule } from './helpers/load-real-module.mjs'
import { IntlMessageFormat } from 'intl-messageformat'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' })
globalThis.window = dom.window; globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { createRoot } = require('react-dom/client')
// The app's translator with no catalog: each string is its English default, formatted as ICU.
window.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) }
window.useBS = () => new Proxy({ padX: 18, sectGap: 22, MONO: 'mono', DISPLAY: 'display' }, { get: (t, k) => (k in t ? t[k] : '#000') })

const M = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCoachExercises.jsx'), { registry: new Map([['react', React]]) })
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }

test('the section reads, redraws live, opens its channel again for a new account and closes it on unmount', async () => {
  const today = M.bsCoachExerciseDate((new Date().getDay() + 6) % 7)
  let reads = 0
  let answer = { status: 'ready', today, days: { [today]: [{ id: 'a', providerId: '7', coachName: 'Jordan Chen', name: 'Hex bar deadlift', sets: '3 sets', reps: null, tempo: null, cue: null }] } }
  const channels = []
  window.ShapeCoachFeed = {
    exercises: async () => { reads += 1; return answer },
    subscribeExercises: (cb) => { const ch = { cb, closed: false }; channels.push(ch); return () => { ch.closed = true } },
  }
  const root = createRoot(document.getElementById('root'))
  const dayIdx = (new Date().getDay() + 6) % 7
  await React.act(async () => root.render(React.createElement(M.BSCoachExercises, { dayIdx, today: true })))
  await React.act(flush)
  assert.equal(reads, 1)
  assert.match(document.body.textContent, /From Jordan Chen/)
  assert.match(document.body.textContent, /Hex bar deadlift/)
  assert.equal(channels.length, 1)

  // The trainer removes it in the console: the change arrives and the day redraws.
  answer = { status: 'ready', today, days: { [today]: [] } }
  await React.act(async () => { channels[0].cb({ new: { kind: 'exercise' } }); await flush() })
  assert.equal(reads, 2)
  assert.doesNotMatch(document.body.textContent, /Hex bar deadlift/)

  // A failed read says so.
  answer = { status: 'error' }
  await React.act(async () => { channels[0].cb({}); await flush() })
  assert.match(document.body.textContent, /didn’t load/)

  // Another account signs in: the old channel closes and a new one opens.
  answer = { status: 'none' }
  await React.act(async () => { window.dispatchEvent(new window.Event('shape:identity')); await flush() })
  assert.equal(channels[0].closed, true)
  assert.equal(channels.length, 2)
  assert.ok(!document.querySelector('[data-coach-exercises]'), 'nothing of the old account is left drawn')

  await React.act(async () => root.unmount())
  assert.equal(channels[1].closed, true)
})

test('the section shows the account\'s today on the today tile when the phone is a date apart (Codex P2 on #2686)', async () => {
  const dayIdx = (new Date().getDay() + 6) % 7
  const phoneToday = M.bsCoachExerciseDate(dayIdx)
  const d = new Date(`${phoneToday}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1)
  const accountToday = d.toISOString().slice(0, 10) // the account's zone is still on yesterday
  window.ShapeCoachFeed = {
    exercises: async () => ({ status: 'ready', today: accountToday, days: { [accountToday]: [{ id: 'a', providerId: '7', coachName: null, name: 'Sled push', sets: '4', reps: null, tempo: null, cue: null }], [phoneToday]: [] } }),
    subscribeExercises: () => () => {},
  }
  const root = createRoot(document.getElementById('root'))
  await React.act(async () => root.render(React.createElement(M.BSCoachExercises, { dayIdx, today: true })))
  await React.act(flush)
  assert.match(document.body.textContent, /Sled push/, 'today\'s addition, on the account\'s today')
  assert.ok(document.querySelector('[data-coach-exercises-start]'), 'with Start these')
  await React.act(async () => root.unmount())
})
