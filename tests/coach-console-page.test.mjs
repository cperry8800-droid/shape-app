// The website's Live console pages (TrainerLiveConsole.html, NutritionistLiveConsole.html), mounted in
// jsdom off a roster the route sends:
//   · a client the route has no name for reads "No name on file" (or "Name didn't load"), never "Client";
//   · "Logged today" shows today's log (todayByClient), says when nothing is logged yet, and says a
//     failed read;
//   · the trainer's Today's session lists what is on the client's Train screen today, each with Remove;
//     an add and a remove wait for the server and say when they failed (they used to show the change
//     and drop the failure);
//   · the Clients page opens on the tab a link names (?tab=shared, the console's "Shared clients").
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' })
globalThis.window = dom.window; globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { createRoot } = require('react-dom/client')
const babel = require('next/dist/compiled/babel/core')
const presetReact = require('next/dist/compiled/babel/preset-react')
const h = React.createElement
// The page's shared pieces (pageShell.jsx, trainerDashboard.jsx, coachLiveWorkout.jsx), as plain stand-ins.
Object.assign(globalThis, {
  React,
  Card: ({ children }) => h('section', null, children),
  DashPage: ({ children }) => h('main', null, children),
  SectionTitle: ({ children, right }) => h('h3', null, children, right ? h('small', null, ' ', right) : null),
  CoachLiveWorkoutPanel: () => null,
  trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: {}, nutriPayoutCard: {},
  TEAL: 'teal', TEAL_BRIGHT: 'teal', PAPER: 'paper', INK: 'ink', serif: 'serif', sans: 'sans', mono: 'mono',
})

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
const typeInto = (input, value) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

function pageOf(role) {
  const source = readFileSync(new URL(`../public/newdesign/${role}LiveConsole.html`, import.meta.url), 'utf8')
  const inline = [...source.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n').replace(/ReactDOM\.createRoot[\s\S]*?;\s*$/, '')
  const code = babel.transformSync(inline, { presets: [presetReact], babelrc: false, configFile: false }).code
  return new Function('React', `${code}\nreturn ${role}LiveConsolePage;`)(React)
}

const roster = (role, over = {}) => ({
  [`is${role}`]: true,
  clients: [
    { id: A, name: 'Avery Stone', nameUnread: false, status: 'current', lastAt: null },
    { id: C, name: null, nameUnread: false, status: 'current', lastAt: null },
  ],
  focusByClient: {},
  itemsByClient: role === 'Trainer' ? { [A]: [{ id: 'e1', name: 'Hex bar deadlift', sets: '3 sets', reps: '—', tempo: '2-0-1-0', cue: 'Push the floor away' }] } : {},
  snapshotByClient: { [C]: { snapshot_date: '2026-11-01', calories: 2400, protein_g: 150 } },
  todayByClient: { [A]: { date: '2026-11-09', calories: 1800, protein_g: 120 } },
  todayUnread: false,
  seriesByClient: {}, profileByClient: {},
  ...over,
})

async function mount(role, data, onPost = async () => ({ ok: true, json: async () => ({ ok: true }) })) {
  const posts = []
  globalThis.fetch = async (url, opts = {}) => {
    if (!opts.method || opts.method === 'GET') return { ok: true, status: 200, json: async () => data }
    posts.push({ url, body: JSON.parse(opts.body) })
    return onPost(JSON.parse(opts.body))
  }
  const Page = pageOf(role)
  const root = createRoot(document.getElementById('root'))
  await React.act(async () => root.render(h(Page)))
  await React.act(flush)
  return { root, posts, pick: async (label) => {
    await React.act(async () => document.querySelector('button[aria-label="Choose client"]').click())
    await React.act(async () => button(label).click())
  } }
}

for (const role of ['Trainer', 'Nutritionist']) {
  test(`${role} console: a client with no name on file says so, and Logged today is today's`, async () => {
    const ui = await mount(role, roster(role))
    assert.match(document.body.textContent, /Avery Stone/)
    assert.match(document.body.textContent, /1,800/)
    assert.match(document.body.textContent, /120g/)
    await ui.pick('No name on file')
    assert.doesNotMatch(document.querySelector('button[aria-label="Choose client"]').textContent, /^Client/)
    assert.match(document.body.textContent, /Nothing logged yet today/, 'C\'s newest row is not today\'s')
    assert.doesNotMatch(document.body.textContent, /2,400/)
    await React.act(async () => ui.root.unmount())
  })

  test(`${role} console: a name that didn't load and a log that didn't load are said`, async () => {
    const data = roster(role, { todayUnread: true, todayByClient: {} })
    data.clients[1] = { ...data.clients[1], nameUnread: true }
    const ui = await mount(role, data)
    assert.match(document.body.textContent, /Today's log didn't load/)
    await ui.pick("Name didn't load")
    await React.act(async () => ui.root.unmount())
  })
}

test('trainer console: Today\'s session lists the client\'s exercises, and Remove waits for the server', async () => {
  let answer = { ok: false, json: async () => ({ error: 'Could not reach Shape.' }) }
  const ui = await mount('Trainer', roster('Trainer'), async () => answer)
  const list = () => document.querySelector('[data-console-session]')
  assert.match(list().textContent, /Hex bar deadlift/)
  assert.match(list().textContent, /3 sets · Tempo 2-0-1-0/)
  assert.match(list().textContent, /Push the floor away/)
  await React.act(async () => button('Remove').click())
  await React.act(flush)
  assert.deepEqual(ui.posts[0].body, { clientId: A, action: 'removeItem', itemId: 'e1' })
  assert.match(list().textContent, /Hex bar deadlift/, 'a failed remove leaves it listed')
  assert.match(document.body.textContent, /Could not reach Shape/)
  answer = { ok: true, json: async () => ({ ok: true }) }
  await React.act(async () => button('Remove').click())
  await React.act(flush)
  assert.equal(list().getAttribute('data-console-session'), 'empty')
  assert.match(list().textContent, /Nothing added today/)
  await React.act(async () => ui.root.unmount())
})

test('trainer console: an add is listed only once saved, and a failed add keeps the entry', async () => {
  let answer = { ok: false, json: async () => ({ error: 'You can only push to your own active clients.' }) }
  const ui = await mount('Trainer', roster('Trainer', { itemsByClient: {} }), async () => answer)
  const name = document.querySelector('input[placeholder="e.g. Hex bar deadlift"]')
  await React.act(async () => typeInto(name, 'Sled push'))
  await React.act(async () => button("+ Add to today's session").click())
  await React.act(flush)
  assert.equal(ui.posts[0].body.action, 'addItem')
  assert.deepEqual(ui.posts[0].body.payload, { name: 'Sled push', sets: '—', reps: '—', tempo: '—', cue: '' })
  assert.match(document.body.textContent, /only push to your own active clients/)
  assert.equal(document.querySelector('[data-console-session]').getAttribute('data-console-session'), 'empty', 'nothing listed that was not saved')
  assert.equal(document.querySelector('input[placeholder="e.g. Hex bar deadlift"]').value, 'Sled push', 'the entry is kept')
  answer = { ok: true, json: async () => ({ ok: true, id: 'saved-1' }) }
  await React.act(async () => button("+ Add to today's session").click())
  await React.act(flush)
  assert.match(document.querySelector('[data-console-session]').textContent, /Sled push/)
  assert.equal(document.querySelector('input[placeholder="e.g. Hex bar deadlift"]').value, '')
  assert.match(document.body.textContent, /Added to Avery's session/)
  await React.act(async () => ui.root.unmount())
})

test('the Clients pages open on the tab a link names (?tab=shared)', () => {
  for (const f of ['trainerClientsPage.jsx', 'nutritionistClientsPage.jsx']) {
    const src = readFileSync(new URL(`../public/newdesign/${f}`, import.meta.url), 'utf8')
    assert.match(src, /const requestedTab = dashRouteParam\("tab"\);/, f)
    assert.match(src, /if \(requestedTab === "shared" \|\| requestedTab === "all"\) setTab\(requestedTab\);/, f)
  }
  for (const [page, href] of [['TrainerLiveConsole', 'TrainerClients.html?tab=shared'], ['NutritionistLiveConsole', 'NutritionistClients.html?tab=shared']]) {
    assert.ok(readFileSync(new URL(`../public/newdesign/${page}.html`, import.meta.url), 'utf8').includes(href), page)
  }
})

test('trainer console: a session list that didn\'t load says so, never "Nothing added today" (Codex P2 on #2686)', async () => {
  const ui = await mount('Trainer', roster('Trainer', { itemsByClient: {}, itemsUnread: true }))
  assert.match(document.querySelector('[data-console-session-unread]').textContent, /Today's session didn't load/)
  assert.doesNotMatch(document.body.textContent, /Nothing added today/)
  await React.act(async () => ui.root.unmount())
})

// ── The nutritionist's plan and grocery note (left by #2686) ────────────────────────────────────────
const NUTRI_PLAN = { [A]: [{ id: 'm1', name: 'Salmon bowl', time: '12:30 pm', kcal: 540, protein: 42, note: 'After your run', ingredients: [], alternatives: [] }] }

test('nutritionist console: Today\'s plan lists the client\'s meals, and Remove waits for the server', async () => {
  let answer = { ok: false, json: async () => ({ error: 'Could not reach Shape.' }) }
  const ui = await mount('Nutritionist', roster('Nutritionist', { itemsByClient: NUTRI_PLAN }), async () => answer)
  const list = () => document.querySelector('[data-console-plan]')
  assert.match(list().textContent, /Salmon bowl/)
  assert.match(list().textContent, /12:30 pm · 540 kcal · 42 g protein/)
  assert.match(list().textContent, /After your run/)
  await React.act(async () => button('Remove').click())
  await React.act(flush)
  assert.deepEqual(ui.posts[0].body, { clientId: A, action: 'removeItem', itemId: 'm1' })
  assert.match(list().textContent, /Salmon bowl/, 'a failed remove leaves it listed')
  assert.match(document.body.textContent, /Could not reach Shape/)
  answer = { ok: true, json: async () => ({ ok: true }) }
  await React.act(async () => button('Remove').click())
  await React.act(flush)
  assert.equal(list().getAttribute('data-console-plan'), 'empty')
  assert.match(list().textContent, /Nothing on today's plan/)
  await React.act(async () => ui.root.unmount())
})

test('nutritionist console: a meal is listed only once saved, and a failed add keeps the entry', async () => {
  let answer = { ok: false, json: async () => ({ error: 'You can only push to your own active clients.' }) }
  const ui = await mount('Nutritionist', roster('Nutritionist'), async () => answer)
  const name = () => document.querySelector('input[placeholder="e.g. Salmon bowl + greens"]')
  await React.act(async () => typeInto(name(), 'Oats'))
  await React.act(async () => button("+ Add to today's plan").click())
  await React.act(flush)
  assert.equal(ui.posts[0].body.action, 'addItem')
  assert.equal(ui.posts[0].body.payload.name, 'Oats')
  assert.match(document.body.textContent, /only push to your own active clients/)
  assert.equal(document.querySelector('[data-console-plan]').getAttribute('data-console-plan'), 'empty', 'nothing listed that was not saved')
  assert.equal(name().value, 'Oats', 'the entry is kept')
  answer = { ok: true, json: async () => ({ ok: true, id: 'saved-1' }) }
  await React.act(async () => button("+ Add to today's plan").click())
  await React.act(flush)
  assert.match(document.querySelector('[data-console-plan]').textContent, /Oats/)
  assert.equal(name().value, '', 'cleared once saved')
  await React.act(async () => ui.root.unmount())
})

test('nutritionist console: a plan or note that didn\'t load says so, never "Nothing on today\'s plan"', async () => {
  const ui = await mount('Nutritionist', roster('Nutritionist', { itemsUnread: true, groceryNoteUnread: true }))
  assert.match(document.querySelector('[data-console-plan-unread]').textContent, /Today's plan didn't load/)
  assert.equal(document.querySelector('[data-console-plan]'), null)
  assert.match(document.querySelector('[data-console-grocery-unread]').textContent, /grocery note didn't load/)
  await React.act(async () => ui.root.unmount())
})

test('nutritionist console: Send on the grocery note waits for the server and says a refusal', async () => {
  let answer = { ok: false, json: async () => ({ error: 'This grocery note could not be saved.' }) }
  const ui = await mount('Nutritionist', roster('Nutritionist', { groceryNoteByClient: { [A]: 'Buy oats' } }), async () => answer)
  const box = () => [...document.querySelectorAll('textarea')].find((t) => /grocery list/.test(t.placeholder))
  assert.equal(box().value, 'Buy oats', 'the saved note is in the box')
  await React.act(async () => button('Send').click())
  await React.act(flush)
  assert.deepEqual(ui.posts[0].body, { clientId: A, action: 'groceryNote', text: 'Buy oats' })
  assert.match(document.body.textContent, /could not be saved/)
  assert.doesNotMatch(document.body.textContent, /Grocery note sent/)
  answer = { ok: true, json: async () => ({ ok: true }) }
  await React.act(async () => button('Send').click())
  await React.act(flush)
  assert.match(document.body.textContent, /Grocery note sent to Avery/)
  await React.act(async () => ui.root.unmount())
})
