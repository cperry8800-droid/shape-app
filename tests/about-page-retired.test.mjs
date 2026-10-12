// The About page is retired on both surfaces. Owner, 2026-10-12: "remove the about
// page from app and website". A removal is the easiest change to undo by accident
// (a nav table restored from an old branch, a footer copied from a legal page), so
// the absence is asserted rather than trusted, and the old addresses are held to a
// redirect so a bookmark lands on the homepage instead of a 404.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from './helpers/strip-comments.mjs'

const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'
const CAT = 'mobile-app/src/i18n/catalogs'

function pages(dir, exts) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && exts.some((x) => e.name.endsWith(x)))
    .map((e) => join(dir, e.name))
}

test('the website page and its script are gone', () => {
  assert.equal(existsSync('public/newdesign/About.html'), false, 'public/newdesign/About.html is back')
  assert.equal(existsSync('public/newdesign/about.jsx'), false, 'public/newdesign/about.jsx is back')
})

test('no website page links to it', () => {
  const files = [...pages('public', ['.html']), ...pages('public/newdesign', ['.html', '.jsx'])]
  const hits = files.filter((f) => /About\.html/.test(stripComments(readFileSync(f, 'utf8'))))
  assert.deepEqual(hits, [], 'these still link to the retired About page')
})

test('the shared nav and footer carry no About entry', () => {
  const shell = stripComments(readFileSync('public/newdesign/pageShell.jsx', 'utf8'))
  assert.doesNotMatch(shell, /label:\s*"About"/, 'the nav table has an About tab again')
  assert.doesNotMatch(shell, /\["About",/, 'the footer has an About link again')
})

test('the old addresses redirect to the homepage', () => {
  const cfg = readFileSync('next.config.ts', 'utf8')
  for (const src of ['/about', '/about.html', '/newdesign/About.html']) {
    const esc = src.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    assert.match(cfg, new RegExp(`\\{ source: '${esc}', destination: '/newdesign/index\\.html', permanent: false \\}`),
      `${src} is not redirected to the homepage`)
  }
  assert.doesNotMatch(cfg, /destination: '\/newdesign\/About\.html'/, 'a rewrite still serves the retired page')
})

test('the app has no About page, no Settings row to it and no deep link', () => {
  const src = stripComments(readFileSync(APP, 'utf8'))
  assert.doesNotMatch(src, /BSAboutPage/, 'BSAboutPage is back')
  assert.doesNotMatch(src, /'about-shape'/, 'the about-shape deep link is back')
  assert.doesNotMatch(src, /settings:about\.aboutShape/, 'the Settings row to the About page is back')
})

test('no catalog keeps the retired keys', () => {
  for (const loc of readdirSync(CAT).filter((d) => !d.startsWith('.'))) {
    const keys = Object.keys(JSON.parse(readFileSync(`${CAT}/${loc}/settings.json`, 'utf8')))
    const left = keys.filter((k) => k.startsWith('aboutPage.') || k.startsWith('about.aboutShape'))
    assert.deepEqual(left, [], `${loc} still carries About page keys`)
  }
})
