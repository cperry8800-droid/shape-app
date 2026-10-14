// The old root site is retired. Owner, 2026-10-14, from the legacy-pages review: "2. Retire old
// pages w/ redirects", and for the products Shape no longer offers, "Delete, no redirect".
//
// The root of public/ held a second copy of the site from before the website moved to
// public/newdesign/: dashboards, a marketplace, coach profiles, sign-up, Score and the Store, each
// a drifted copy of a flow the website now does. Every old address lands on the website page that
// does the same job; the gym, AI-trainer, integrations and radio sign-up pages are gone and 404.
//
// The redirects are read from next.config.ts itself, transpiled and run, and resolved the way Next
// does (the first matching rule wins, a `has` value is an anchored regex), so the order of the
// coach-profile rules is tested, not only their presence.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { stripComments } from './helpers/strip-comments.mjs'

// Each old page and where it now sends a visitor. Written out here rather than read from the
// config, so a changed destination has to be changed in both places.
const REDIRECTED = {
  home: '/',
  landing: '/newdesign/Landing.html',
  marketplace: '/newdesign/Marketplace.html',
  'for-trainers': '/newdesign/Coach.html',
  'for-nutritionists': '/newdesign/Nutritionist.html',
  'for-clients': '/newdesign/Client.html',
  'shape-score': '/newdesign/Score.html',
  'shape-score-trainer': '/newdesign/Score.html',
  'shape-score-nutritionist': '/newdesign/Score.html',
  'shape-store': '/newdesign/Store.html',
  community: '/newdesign/Community.html',
  'signup-client': '/newdesign/SignupClient.html',
  // Straight to the app shells, so an old #tab survives (see the last test).
  'trainer-dashboard': '/newdesign/TrainerApp.html',
  'nutrition-schedule': '/newdesign/NutritionistApp.html',
  clients: '/newdesign/ClientApp.html',
  'client-profile': '/newdesign/ClientProfile.html',
  'my-team': '/newdesign/ClientTeam.html',
  messages: '/newdesign/ClientDashboard.html',
  'dashboard-preview': '/newdesign/ClientApp.html',
  'my-workouts': '/newdesign/ClientTrain.html',
  workout: '/newdesign/ClientTrain.html',
  'live-workout': '/newdesign/ClientTrain.html',
}
// Only the old file redirects: the clean address is a live route (`/` and src/app/{trainers,
// nutritionists,login}).
const HTML_ONLY = {
  index: '/',
  login: '/newdesign/Login.html',
  trainers: '/newdesign/Marketplace.html',
  nutritionists: '/newdesign/Marketplace.html',
}
const NO_REDIRECT = ['gyms', 'for-gyms', 'for-gym-owners', 'gym-dashboard', 'signup-gym', 'ai-trainers', 'integrations', 'signup-radio']
const PROFILES = ['trainer-profile', 'nutritionist-profile']
// The scripts and images only the old pages used.
const GONE_ASSETS = [
  'public/add-role-widget.js', 'public/app.js', 'public/booking.js', 'public/chat-mobile.js', 'public/empty-state.js',
  'public/exercise-videos.js', 'public/nutrition-schedule.js', 'public/nutritionist-dashboard.js', 'public/progress.js',
  'public/real-providers.js', 'public/sessions-widget.js', 'public/trainer-dashboard.js', 'public/trainer-exercise-videos.js',
  'public/widget-drag.js', 'public/signup.css',
  'public/Rewards.png', 'public/client dash.png', 'public/nutri dash 1.png', 'public/trainer dash 1.png',
  'public/logo-text.png', 'public/shape-wordmark-white.png',
]
const ALL_PAGES = [...Object.keys(REDIRECTED), ...Object.keys(HTML_ONLY), ...NO_REDIRECT, ...PROFILES, 'pricing']

async function loadConfig() {
  const src = readFileSync('next.config.ts', 'utf8').replace(/^import .*$/gm, '')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = await import('data:text/javascript,' + encodeURIComponent('const withSentryConfig = (c) => c;\n' + js))
  return { redirects: await mod.default.redirects(), rewrites: await mod.default.rewrites() }
}

// Next's redirect matching, for the literal sources this config uses: the first rule whose source
// is the path and whose `has` conditions all hold wins.
function resolve(redirects, pathname, query = {}) {
  for (const r of redirects) {
    if (r.source !== pathname) continue
    const params = {}
    const ok = (r.has || []).every((h) => {
      if (h.type !== 'query' || query[h.key] === undefined) return false
      if (h.value === undefined) return true
      const m = new RegExp(`^${h.value}$`).exec(query[h.key])
      if (m) Object.assign(params, m.groups)
      return Boolean(m)
    })
    if (ok) return { destination: r.destination.replace(/:(\w+)/g, (_, k) => params[k]), permanent: r.permanent }
  }
  return null
}

const exists = (dest) => dest === '/' || existsSync('public' + dest.split('?')[0])

test('the old pages, and the scripts and images only they used, are gone', () => {
  for (const p of ALL_PAGES) assert.equal(existsSync(`public/${p}.html`), false, `public/${p}.html is back`)
  for (const f of GONE_ASSETS) assert.equal(existsSync(f), false, `${f} is back`)
})

test('every redirect source in the config is a literal path, which is what resolve() matches', async () => {
  const { redirects } = await loadConfig()
  assert.ok(redirects.length >= 60, `only ${redirects.length} redirects read; the config was not loaded whole`)
  for (const r of redirects) assert.doesNotMatch(r.source, /[:*(]/, `${r.source} has a pattern resolve() does not model`)
})

test('each old address, with or without .html, lands permanently on the page that does its job', async () => {
  const { redirects } = await loadConfig()
  for (const [page, dest] of Object.entries(REDIRECTED)) {
    for (const source of [`/${page}`, `/${page}.html`]) {
      assert.deepEqual(resolve(redirects, source), { destination: dest, permanent: true }, source)
    }
    assert.ok(exists(dest), `${dest} does not exist`)
  }
  for (const [page, dest] of Object.entries(HTML_ONLY)) {
    assert.deepEqual(resolve(redirects, `/${page}.html`), { destination: dest, permanent: true }, `/${page}.html`)
    assert.ok(exists(dest), `${dest} does not exist`)
  }
  // The clean addresses of those four are live routes, so nothing redirects them away.
  for (const live of ['/trainers', '/nutritionists', '/login']) {
    assert.equal(resolve(redirects, live), null, `${live} is a live route and must not redirect`)
    assert.ok(existsSync(`src/app${live}/page.tsx`), `src/app${live}/page.tsx is gone`)
  }
  assert.ok(existsSync('src/app/page.tsx'), 'the root route is gone')
  // /pricing.html was already redirected (to the website's pricing page); its file was dead.
  assert.deepEqual(resolve(redirects, '/pricing.html'), { destination: '/newdesign/Pricing.html', permanent: true })
})

test('an old coach profile keeps its coach', async () => {
  // The old profiles took the listing id as ?id=, and /trainers/<id> and /nutritionists/<id> are
  // the profiles by listing id. (TrainerPublic.html?id= would not do: that stub drops ?id=, the
  // finding Codex made on #2350.)
  const { redirects } = await loadConfig()
  for (const [page, route] of [['trainer-profile', 'trainers'], ['nutritionist-profile', 'nutritionists']]) {
    assert.ok(existsSync(`src/app/${route}/[id]/page.tsx`), `src/app/${route}/[id]/page.tsx is gone`)
    for (const source of [`/${page}`, `/${page}.html`]) {
      assert.deepEqual(resolve(redirects, source, { id: '42' }), { destination: `/${route}/42`, permanent: true }, `${source}?id=42`)
      // Not a listing id, or none: there is no coach to keep, so the marketplace, never /trainers/abc.
      for (const q of [{ id: 'abc' }, { id: '42x' }, { id: '' }, {}]) {
        assert.deepEqual(resolve(redirects, source, q), { destination: '/newdesign/Marketplace.html', permanent: true }, `${source} ${JSON.stringify(q)}`)
      }
    }
  }
})

test('the products Shape no longer offers 404: no redirect, no rewrite, no file', async () => {
  const { redirects, rewrites } = await loadConfig()
  for (const page of NO_REDIRECT) {
    for (const source of [`/${page}`, `/${page}.html`]) {
      assert.equal(resolve(redirects, source), null, `${source} redirects; the owner asked for none`)
      assert.ok(!rewrites.some((r) => r.source === source), `${source} is still rewritten`)
    }
  }
})

test('every rewrite serves a file that exists', async () => {
  const { rewrites } = await loadConfig()
  for (const r of rewrites) {
    const file = r.destination.split('?')[0]
    if (!file.endsWith('.html')) continue
    assert.ok(existsSync('public' + file), `${r.source} rewrites to ${file}, which does not exist`)
  }
  assert.deepEqual(readFileSync('next.config.ts', 'utf8').match(/const legacyPages = \[([^\]]*)\]/)[1].match(/'[^']+'/g),
    ["'contact'", "'help'", "'privacy'", "'terms'", "'radio'"], 'the clean root URLs are the kept pages only')
})

test('nothing live links an old page, and every website link names a file that exists', () => {
  const files = execFileSync('git', ['ls-files', '--', 'public/*.html', 'public/*.js', 'public/*.json', 'public/newdesign/*', 'src/*', 'mobile-app/src/*'])
    .toString().trim().split('\n')
    .filter((f) => /\.(html|jsx?|mjs|json|tsx?)$/.test(f) && existsSync(f))
    // The War Room's checklist labels are history, and quote old pages by name.
    .filter((f) => f !== 'src/lib/warroom.ts')
  assert.ok(files.length > 300, `only ${files.length} files scanned`)
  // `index.html` is left out: the website links its own homepage that way.
  const old = new RegExp(`(?<![\\w.-])/?(${ALL_PAGES.filter((p) => p !== 'index').join('|')})\\.html`, 'g')
  const hits = []
  const missing = []
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'))
    for (const m of src.matchAll(old)) {
      const line = src.slice(0, m.index).split('\n').length
      const text = src.split('\n')[line - 1]
      // A page-role check on the URL (supabase.js) is not a link; nor is the PWA's id, which has
      // to stay what installed copies were given.
      if (/indexOf\(/.test(text) || /"id": "\/home\.html"/.test(text)) continue
      hits.push(`${f}:${line}: ${text.trim().slice(0, 120)}`)
    }
    // Paths are case-sensitive on Vercel: /newdesign/marketplace.html and /newdesign/login.html
    // were both live links, and both 404ed, until this change.
    for (const m of src.matchAll(/\/newdesign\/[A-Za-z0-9_-]+\.html/g)) {
      if (!existsSync('public' + m[0])) missing.push(`${f}: ${m[0]}`)
    }
  }
  assert.deepEqual(hits, [], 'these still link an old page')
  // The clean addresses too (`/for-trainers`, not only `/for-trainers.html`): the Next header and
  // footer linked those, and a redirect is a detour, not a link. `/trainers`, `/nutritionists`,
  // `/login` and `/` are live routes, so they are not in the list.
  const clean = new RegExp(`["'\`(]/(${[...Object.keys(REDIRECTED), ...NO_REDIRECT, ...PROFILES].filter((p) => p !== 'home').join('|')})(?=["'\`?#)]|/["'\`])`, 'g')
  const cleanHits = []
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'))
    for (const m of src.matchAll(clean)) {
      const line = src.slice(0, m.index).split('\n').length
      const text = src.split('\n')[line - 1]
      if (/indexOf\(|\/api\//.test(text)) continue
      cleanHits.push(`${f}:${line}: ${text.trim().slice(0, 120)}`)
    }
  }
  assert.deepEqual(cleanHits, [], 'these link an old clean address, which only redirects')
  assert.deepEqual(missing, [], 'these link a website page that does not exist')
})

test('supabase.js sends people to the website, not to the old pages', () => {
  const src = stripComments(readFileSync('public/supabase.js', 'utf8'))
  const dash = src.slice(src.indexOf('dashboardFor(role) {'), src.indexOf('},', src.indexOf('dashboardFor(role) {')))
  assert.match(dash, /return '\/newdesign\/TrainerDashboard\.html'/)
  assert.match(dash, /return '\/newdesign\/NutritionistDashboard\.html'/)
  assert.match(dash, /return '\/newdesign\/ClientDashboard\.html'/)
  assert.match(src, /window\.shapeSignOut = async function \(\) \{\n\s+if \(window\.shapeDb\) await window\.shapeDb\.signOut\(\);\n\s+window\.location\.href = '\/';/)
})

test('the service worker precaches only files that exist, and the manifest opens live pages', () => {
  const sw = stripComments(readFileSync('public/sw.js', 'utf8'))
  const assets = sw.slice(sw.indexOf('const ASSETS = ['), sw.indexOf('];', sw.indexOf('const ASSETS = ['))).match(/'[^']+'/g).map((s) => s.slice(1, -1))
  assert.ok(assets.length >= 5)
  // cache.addAll fails the whole install on one missing file.
  for (const a of assets) assert.ok(exists(a), `the service worker precaches ${a}, which does not exist`)
  assert.match(sw, /const CACHE_NAME = 'shape-v134';/, 'the cache generation was not bumped, so installed workers keep the old pages')
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'))
  for (const url of [manifest.start_url, ...manifest.shortcuts.map((s) => s.url)]) assert.ok(exists(url), `the manifest opens ${url}`)
  const robots = readFileSync('public/robots.txt', 'utf8')
  for (const p of ALL_PAGES) assert.ok(!robots.includes(`/${p}.html`), `robots.txt still names /${p}.html`)
})

// The shells' own route readers, run from their source: the legacy tab map and the parser.
function shellRoute(file, constName, fnName, routesName) {
  const src = readFileSync(`public/newdesign/${file}`, 'utf8')
  const from = src.indexOf(`const ${constName}`)
  const fnAt = src.indexOf(`function ${fnName}()`, from)
  assert.ok(from >= 0 && fnAt > from, `${file}: ${constName} / ${fnName}() not found`)
  const block = src.slice(from, src.indexOf('\n}\n', fnAt) + 3)
  const routes = [...src.slice(src.indexOf(`const ${routesName} = {`)).split('\n};')[0].matchAll(/^\s+([a-z]+):/gm)].map((m) => m[1])
  assert.ok(routes.length >= 8, `${file}: only ${routes.length} routes read`)
  const table = Object.fromEntries(routes.map((r) => [r, () => null]))
  return (hash) => {
    const out = new Function('window', routesName, 'caHasRoute', `${block}; return ${fnName}();`)(
      { location: { hash } }, table, (h) => Object.prototype.hasOwnProperty.call(table, h))
    return typeof out === 'string' ? out : out.slug
  }
}
const caSlug = shellRoute('ClientApp.html', 'CA_LEGACY_TABS', 'caSlug', 'CA_ROUTES')
const taSlug = shellRoute('TrainerApp.html', 'TA_LEGACY_TABS', 'taParse', 'TA_ROUTES')
const naSlug = shellRoute('NutritionistApp.html', 'NA_LEGACY_TABS', 'naParse', 'NA_ROUTES')
const SHELL_SLUG = { '/newdesign/ClientApp.html': caSlug, '/newdesign/TrainerApp.html': taSlug, '/newdesign/NutritionistApp.html': naSlug }

// Where a visitor lands: through the redirect, then the stub's own script if the destination is
// a stub, carrying the query and the fragment the way a browser does.
async function land(source, { search = '', hash = '' } = {}) {
  const { redirects } = await loadConfig()
  const query = Object.fromEntries(new URLSearchParams(search))
  const { destination } = resolve(redirects, source, query)
  const file = readFileSync(`public${destination}`, 'utf8')
  const stub = file.match(/<script>(location\.replace\([^<]*\);)<\/script>/)
  if (!stub) return new URL(destination + search + hash, 'https://www.theshapecommunity.com')
  let to = null
  new Function('location', stub[1])({ search, hash, replace: (u) => { to = u } })
  return new URL(to, 'https://www.theshapecommunity.com' + destination)
}

test('an old address with a query still opens the page it names, through the stub and the shell', async () => {
  // Codex on #2352: `/workout.html?id=<assignment>` keeps its query through the redirect, the
  // ClientTrain.html stub forwards it after the hash (`ClientApp.html#workouts?id=…`), and the
  // member shell read the whole hash as the route, so the member landed on Today. The shell now
  // reads the route up to the "?", as the coach shells do. This follows the whole chain.
  for (const [old, route] of [['/workout.html', 'workouts'], ['/my-workouts.html', 'workouts'], ['/my-team.html', 'team'], ['/clients.html', 'today']]) {
    const landed = await land(old, { search: '?id=5' })
    assert.equal(landed.pathname, '/newdesign/ClientApp.html', old)
    assert.equal(caSlug(landed.hash), route, `${old}?id=5 opens ${caSlug(landed.hash)}, not ${route}`)
  }
  // And a link with no query is unchanged.
  assert.equal(caSlug('#workouts'), 'workouts')
  assert.equal(caSlug('#nonsense?x=1'), 'today')
  assert.equal(caSlug('#constructor'), 'today', 'a prototype key is not a route')
})

test('an old dashboard bookmark keeps its tab', async () => {
  // Codex on #2352: the old dashboards routed tabs by #fragment, and a stub would replace it
  // with #today. They redirect to the shells, and the shells read the old tab names.
  const cases = [
    ['/clients.html', '#progress', 'progress'], ['/clients.html', '#training', 'workouts'],
    ['/clients.html', '#myteam', 'team'], ['/clients.html', '#shapescore', 'score'],
    ['/clients.html', '#home', 'today'], ['/clients.html', '', 'today'],
    ['/trainer-dashboard.html', '#clients', 'clients'], ['/trainer-dashboard.html', '#programs', 'programs'],
    ['/trainer-dashboard.html', '#goalcalc', 'goal'], ['/trainer-dashboard', '#profile', 'profile'],
    ['/nutrition-schedule.html', '#mealplans', 'plans'], ['/nutrition-schedule.html', '#clients', 'clients'],
    ['/nutrition-schedule.html', '#goalcalc', 'goal'],
  ]
  for (const [old, hash, route] of cases) {
    const landed = await land(old, { hash })
    const slug = SHELL_SLUG[landed.pathname]
    assert.ok(slug, `${old} lands on ${landed.pathname}, not a shell`)
    assert.equal(landed.hash, hash, `${old}${hash}: the fragment was dropped on the way`)
    assert.equal(slug(landed.hash), route, `${old}${hash} opens ${slug(landed.hash)}, not ${route}`)
  }
})
