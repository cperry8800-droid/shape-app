// In-shell routing (review 2026-09-09, R19).
//
// The header nav and the dashboards' in-card links pointed at legacy pages
// whose entire body is `location.replace("<Shell>.html#<slug>")`. From inside
// that shell each one cost TWO full page loads and an SPA boot to do what a
// hash change does instantly.
//
// ⚠ THE MAP IS DERIVED FROM THE STUB FILES, NOT TRUSTED. Membership is exactly
// "is a redirect stub into this shell", and that is a property of the repo, not
// of a list someone maintains: a stub added, retired, or re-pointed later would
// otherwise leave `DASH_SHELL_STUBS` quietly wrong, and a wrong entry routes to
// a tab that does not exist — where both shells fall back to `today`, so the
// link silently goes somewhere else rather than failing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ND = path.dirname(fileURLToPath(new URL('../public/newdesign/x', import.meta.url)));
const SHELL_SRC = readFileSync(path.join(ND, 'pageShell.jsx'), 'utf8');

// ── The truth: every pure redirect stub in public/newdesign ──────────────────
const SHELL_OF = { TrainerApp: 'trainer', NutritionistApp: 'nutritionist', ClientApp: 'client' };
function derivedMap() {
  const out = { trainer: {}, nutritionist: {}, client: {} };
  for (const f of readdirSync(ND)) {
    if (!f.endsWith('.html') || SHELL_OF[f.replace(/\.html$/, '')]) continue;
    const body = readFileSync(path.join(ND, f), 'utf8');
    // ⚠ PARSE THE WHOLE CALL, NOT ONE SPELLING OF IT. The first draft required
    // the hash inside the first string literal, so it never saw ClientMe.html —
    // `location.replace("ClientApp.html"+(location.search||"")+"#settings")` —
    // and a guard that misses a stub is not "derived, never trusted": it would
    // have passed a wrong map, AND failed anyone who later added the correct
    // entry. Find the replace() call into a shell, then take the hash from
    // anywhere in its arguments.
    const call = /location\.replace\(([^;]*?)\)\s*;/.exec(body);
    if (!call) continue;
    const shell = /["'](Trainer|Nutritionist|Client)App\.html/.exec(call[1]);
    const slug = /#([a-z]+)["']/.exec(call[1]);
    if (!shell) continue;
    assert.ok(slug, f + ' redirects into a shell but no slug could be parsed from: ' + call[1]);
    out[SHELL_OF[shell[1] + 'App']][f] = slug[1];
  }
  return out;
}

// ── The shipped map + helpers, evaluated out of the source ───────────────────
function block(startsWith) {
  const at = SHELL_SRC.indexOf(startsWith);
  assert.notEqual(at, -1, startsWith + ' not found in pageShell.jsx');
  // ⚠ Start at the BODY brace, not the first one. A destructured parameter list
  // (`function MobileDrawer({ open, onClose, … })`) opens a brace of its own, so
  // matching from the first `{` returns the PARAMETERS and every assertion about
  // the body then fails for a reason it does not care about.
  let from = at;
  if (SHELL_SRC.startsWith('function', at)) {
    const open = SHELL_SRC.indexOf('(', at);
    let d = 0;
    for (let j = open; j < SHELL_SRC.length; j++) {
      if (SHELL_SRC[j] === '(') d++;
      else if (SHELL_SRC[j] === ')' && --d === 0) { from = j; break; }
    }
  }
  let depth = 0;
  for (let j = SHELL_SRC.indexOf('{', from); j < SHELL_SRC.length; j++) {
    if (SHELL_SRC[j] === '{') depth++;
    else if (SHELL_SRC[j] === '}' && --depth === 0) return SHELL_SRC.slice(at, j + 1);
  }
  throw new Error('unbalanced braces after ' + startsWith);
}
const SRC = block('const DASH_SHELL_STUBS = ') + ';\n'
  + block('function dashShellRole()') + '\n'
  + block('function dashShellHref(href)') + '\n'
  + 'return { DASH_SHELL_STUBS, dashShellRole, dashShellHref };';
const load = (win) => new Function('window', SRC)(win);
const inShell = (role) => load({ __shapeDashShell: role });

test('the shipped map IS the set of redirect stubs — derived, never trusted', () => {
  const { DASH_SHELL_STUBS } = load({});
  const truth = derivedMap();
  for (const role of ['trainer', 'nutritionist', 'client']) {
    assert.deepEqual(DASH_SHELL_STUBS[role], truth[role],
      role + ": the map and the stub files disagree — a stub was added, retired or re-pointed");
  }
  // Sanity: the derivation itself found something, so an empty sweep can never
  // pass this test by matching an empty map.
  assert.ok(Object.keys(truth.trainer).length >= 8);
  assert.ok(Object.keys(truth.client).length >= 8);
});

test('outside a shell every href is untouched', () => {
  const { dashShellHref } = load({});
  assert.equal(dashShellHref('TrainerSchedule.html'), 'TrainerSchedule.html');
  assert.equal(dashShellHref('ClientTrain.html'), 'ClientTrain.html');
  // An unrecognised shell name is not a shell.
  assert.equal(load({ __shapeDashShell: 'bogus' }).dashShellHref('ClientTrain.html'), 'ClientTrain.html');
});

test('inside a shell only THAT shell\'s stubs become hash routes', () => {
  assert.equal(inShell('client').dashShellHref('ClientTrain.html'), '#workouts');
  assert.equal(inShell('trainer').dashShellHref('TrainerAnalytics.html'), '#business');
  assert.equal(inShell('nutritionist').dashShellHref('NutritionistPlans.html'), '#plans');
  // Another role's stub is not this shell's route.
  assert.equal(inShell('trainer').dashShellHref('ClientTrain.html'), 'ClientTrain.html');
  assert.equal(inShell('client').dashShellHref('TrainerSchedule.html'), 'TrainerSchedule.html');
});

test('a page with no shell route stays a real link', () => {
  // ⚠ These are real pages, not stubs. Rewriting one to a hash would route to a
  // tab that does not exist — and both shells fall back to `today`, so the link
  // would go somewhere else instead of failing.
  for (const page of ['ClientGrocery.html', 'Marketplace.html', 'TrainerMessages.html', 'NutritionistMessages.html', 'Login.html', 'index.html']) {
    assert.equal(inShell('client').dashShellHref(page), page, page + ' must not be rewritten');
    assert.equal(inShell('trainer').dashShellHref(page), page, page + ' must not be rewritten');
  }
});

test('an href carrying a query keeps its round trip rather than dropping it', () => {
  // The stub forwards `location.search`; a hash route cannot, so rewriting a
  // query-bearing link would silently discard it.
  assert.equal(inShell('client').dashShellHref('ClientTrain.html?day=2026-09-09'), 'ClientTrain.html?day=2026-09-09');
  // Paths and existing hashes still resolve to the file.
  assert.equal(inShell('client').dashShellHref('/newdesign/ClientTrain.html'), '#workouts');
  assert.equal(inShell('client').dashShellHref('ClientTrain.html#anything'), '#workouts');
  // Junk in, junk out — never a crash, never a wrong route.
  for (const junk of ['', null, undefined, 42]) assert.equal(inShell('client').dashShellHref(junk), junk);
});

test('every in-card dashShellHref() call names a page the map actually routes', () => {
  // A typo here is invisible: the helper returns the string unchanged, so the
  // link keeps working — as the two-page-load round trip this exists to remove.
  const { DASH_SHELL_STUBS } = load({});
  const known = new Set(Object.values(DASH_SHELL_STUBS).flatMap((m) => Object.keys(m)));
  let seen = 0;
  for (const f of readdirSync(ND)) {
    if (!f.endsWith('.jsx')) continue;
    const src = readFileSync(path.join(ND, f), 'utf8');
    for (const m of src.matchAll(/dashShellHref\(\s*["']([^"']+)["']\s*\)/g)) {
      seen++;
      assert.ok(known.has(m[1]), f + ' routes "' + m[1] + '" through dashShellHref, but no shell maps it');
    }
  }
  assert.ok(seen >= 10, 'expected the in-card links to be wired, found ' + seen);
});

test('navGroupsFor rewrites hrefs in ONE place, so the mobile drawer gets them too', () => {
  // The drawer is the only nav a phone has once the header collapses at 900px;
  // rewriting at the desktop render site alone would leave it on the old links.
  const fn = block('function navGroupsFor(authUser)');
  assert.match(fn, /dashShellHref\(g\.href\)/, 'nav hrefs must be mapped inside navGroupsFor');
  assert.match(fn, /items:[\s\S]*dashShellHref\(h\)/, 'dropdown items must be mapped too');
  const drawer = block('function MobileDrawer');
  assert.match(drawer, /navGroupsFor\(authUser\)/, 'the drawer must read the same mapped groups');
});

// ── V7: the responsive half, which shipped with no guard at all ─────────────
test('every dashboard shell declares a viewport', () => {
  // Without this the @media rules below are dead: a phone reports a 980px
  // layout viewport, so the block that collapses the grid and turns the 240px
  // sidebar into a horizontal tab bar never matches. A future edit to any
  // shell's <head> would restore that silently, with a green suite.
  for (const shell of Object.keys(SHELL_OF)) {
    const html = readFileSync(path.join(ND, shell + '.html'), 'utf8');
    assert.match(html, /<meta\s+name="viewport"\s+content="width=device-width/,
      shell + '.html must declare width=device-width');
  }
});

test('nothing hides the dashboard sidebar, which IS the nav', () => {
  // dash.css used to `display: none` the aside below 760px while pageShell's
  // own 900px block was turning that same element into the only nav a phone
  // has. Two stylesheets, both loaded by all three shells, disagreeing.
  const css = readFileSync(path.join(ND, 'dash.css'), 'utf8');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /aside\s*\{[^}]*display:\s*none/,
    'dash.css must not hide the dashboard aside — pageShell turns it into the mobile tab bar');
  const shell = SHELL_SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(shell, /\.shape-dash-aside\s*\{[^}]*flex-direction:\s*row/,
    'pageShell must still collapse the aside into a horizontal tab bar');
  assert.match(shell, /\bmain\s*\{[^}]*padding-left/,
    'main needs a phone padding override — 44-48px a side is a quarter of a 390px screen');
});

test('a phone-collapsed GridStack layout is never persisted as the saved one', () => {
  // The grid inits with breakpoints:[{w:768,c:1}]. Below 768px GridStack calls
  // column(1), clamps every widget to x:0/w:1 and fires `change` — which lands
  // in persistFromGrid and would upsert that as the account's layout, restoring
  // one-column on every device. Unreachable until the viewport meta above made
  // 768px reachable, which is why the two ship together.
  const grid = readFileSync(path.join(ND, 'dashGrid.jsx'), 'utf8');
  const at = grid.indexOf('const persistFromGrid');
  assert.notEqual(at, -1);
  const body = grid.slice(at, grid.indexOf('const addOne', at));
  assert.match(body, /getColumn\(\)\s*!==\s*12/, 'persistFromGrid must bail while the grid is column-collapsed');
  assert.ok(body.indexOf('getColumn') < body.indexOf('persist({'), 'the bail must come BEFORE the write');
});
