// The legacy coach applications are retired. Owner, 2026-10-12: "retire legacy pages". The root
// pages (signup-trainer.html, signup-nutritionist.html) and the /mobile preview's sign-up pages
// each kept their own copy of the application, and each copy drifted from the rules the website
// and the app follow (the date of birth, the attestations and the 4 MB limit were each fixed in
// them one at a time; the 2026-10-12 experience rule would have been the next). The website's
// application (public/newdesign/signup.jsx) and the app's are the only two now, and every old
// address redirects to the website's. A removal is easy to undo by accident, so the absence is
// asserted rather than trusted.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { stripComments } from './helpers/strip-comments.mjs'

const RETIRED = [
  'public/signup-trainer.html',
  'public/signup-nutritionist.html',
  'public/mobile/SignupTrainer.html',
  'public/mobile/SignupNutritionist.html',
  'public/mobile/SignupClient.html',
  'public/mobile/signup.jsx',
  // The Next /signup form (client-onboarding review, M5): it redirects to the website's sign-up.
  'src/app/signup/page.tsx',
  'src/app/signup/SignupForm.tsx',
]

const REDIRECTS = [
  ['/signup-trainer', '/newdesign/SignupTrainer.html'],
  ['/signup-trainer.html', '/newdesign/SignupTrainer.html'],
  ['/signup-nutritionist', '/newdesign/SignupNutritionist.html'],
  ['/signup-nutritionist.html', '/newdesign/SignupNutritionist.html'],
  ['/mobile/SignupTrainer.html', '/newdesign/SignupTrainer.html'],
  ['/mobile/SignupNutritionist.html', '/newdesign/SignupNutritionist.html'],
  ['/mobile/SignupClient.html', '/newdesign/SignupClient.html'],
]

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

test('the legacy application pages are gone', () => {
  for (const file of RETIRED) assert.equal(existsSync(file), false, `${file} is back`)
})

test('every old address redirects to the website\'s application, which exists', () => {
  const cfg = readFileSync('next.config.ts', 'utf8')
  for (const [source, destination] of REDIRECTS) {
    assert.match(
      cfg,
      new RegExp(`\\{ source: '${esc(source)}', destination: '${esc(destination)}', permanent: false \\}`),
      `${source} is not redirected to ${destination}`,
    )
    assert.ok(existsSync(`public${destination}`), `${destination} does not exist`)
  }
  const legacy = cfg.slice(cfg.indexOf('const legacyPages'), cfg.indexOf('];', cfg.indexOf('const legacyPages')))
  assert.doesNotMatch(legacy, /'signup-trainer'|'signup-nutritionist'/, 'a rewrite still serves a retired page')
})

test('nothing precaches or builds a link to a retired page', () => {
  const sw = stripComments(readFileSync('public/sw.js', 'utf8'))
  assert.doesNotMatch(sw, /signup-trainer|signup-nutritionist/, 'the service worker precaches a retired page')
  for (const file of ['public/supabase.js']) {
    const src = stripComments(readFileSync(file, 'utf8'))
    assert.doesNotMatch(src, /['"]signup-(trainer|nutritionist)\.html/, `${file} links to a retired page`)
  }
  const sitemap = readFileSync('public/sitemap.xml', 'utf8')
  assert.doesNotMatch(sitemap, /signup-(trainer|nutritionist)\.html/, 'the sitemap lists a retired page')
})

test('the apply route names only the two applications that remain', () => {
  const route = readFileSync('src/app/api/apply/route.ts', 'utf8')
  const header = route.slice(0, route.indexOf('import '))
  assert.match(header, /public\/newdesign\/signup\.jsx/)
  assert.match(header, /submitProviderApplication/)
  assert.match(header, /retired on 2026-10-12/)
})
