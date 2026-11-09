// The website's members page is retired. Owner, 2026-11-09: "remove the members
// page from website". It was `public/newdesign/Client.html` ("For members"), the
// `Members` tab on both nav bars (signed out only) and "For members" in both
// footers. A removal is the easiest change to undo by accident (a nav table
// restored from an old branch, a footer copied from an older page), so the absence
// is asserted rather than trusted, and the old address is held to a redirect so a
// bookmark lands on the homepage instead of a 404 — the way the About page went.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from './helpers/strip-comments.mjs'

const ND = 'public/newdesign'

test('the page and its script are gone', () => {
  assert.equal(existsSync(`${ND}/Client.html`), false, `${ND}/Client.html is back`)
  assert.equal(existsSync(`${ND}/clientOverview.jsx`), false, `${ND}/clientOverview.jsx is back`)
})

// The website, and the root pages still live beside it (privacy, terms, help…),
// whose old nav carried it as the Clients menu's Overview.
const filesIn = (dir, re) => readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isFile() && re.test(e.name))
  .map((e) => join(dir, e.name))

test('no website page links to it', () => {
  const files = [...filesIn(ND, /\.(html|jsx|js|mjs)$/), ...filesIn('public', /\.html$/)]
  assert.ok(files.length > 60, `only ${files.length} website files read`)
  // `Client.html` exactly: ClientApp.html, SignupClient.html and the rest are live.
  const hits = files.filter((f) => /(?<![A-Za-z])Client\.html/.test(stripComments(readFileSync(f, 'utf8'))))
  assert.deepEqual(hits, [], 'these still link to the retired members page')
  assert.doesNotMatch(readFileSync('public/sitemap.xml', 'utf8'), /\/newdesign\/Client\.html/, 'the sitemap still lists it')
})

test('neither nav bar has a Members tab, and neither footer a For members link', () => {
  const shell = stripComments(readFileSync(`${ND}/pageShell.jsx`, 'utf8'))
  assert.doesNotMatch(shell, /label:\s*"Members"/, 'the shared nav table has a Members tab again')
  assert.doesNotMatch(shell, /\["For members",/, 'the shared footer has a For members link again')
  assert.doesNotMatch(shell, /SIGNED_OUT_ONLY = \[[^\]]*"Members"/, 'Members is a signed-out-only tab again')
  const home = stripComments(readFileSync(`${ND}/index.html`, 'utf8'))
  assert.doesNotMatch(home, />Members<\/a>/, 'the homepage bar or drawer has a Members link again')
  assert.doesNotMatch(home, />For members<\/a>/, 'the homepage footer has a For members link again')
})

test('the old addresses redirect to the homepage', () => {
  const cfg = readFileSync('next.config.ts', 'utf8')
  assert.match(cfg, /\{ source: '\/newdesign\/Client\.html', destination: '\/newdesign\/index\.html', permanent: false \}/,
    '/newdesign/Client.html is not redirected to the homepage')
  // The old root page pointed at it; it goes straight to the homepage, not through a second hop.
  assert.match(cfg, /\['for-clients', '\/newdesign\/index\.html'\]/, '/for-clients does not land on the homepage')
  assert.doesNotMatch(cfg, /destination: '\/newdesign\/Client\.html'/, 'a rule still sends a visitor to the retired page')
})
