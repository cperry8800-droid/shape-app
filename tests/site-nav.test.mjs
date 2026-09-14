// ── ONE NAV BAR, ON EVERY PAGE ──────────────────────────────────────────────
//
// This site had TWO nav bars and they disagreed about everything: the homepage's
// own static HTML bar (66px tall, a 36px logo, sentence-case links, a filled
// CTA) and the React `Header` the other 69 pages render (~80px, a 60px logo,
// lowercase links, three dropdowns, an outlined CTA). Nothing compared them, so
// they drifted for months — and the drift was invisible to every existing test,
// because each was internally consistent.
//
// ⚠ THAT IS WHAT THIS FILE IS FOR. Two implementations of one bar is a choice
// the homepage forces (its nav is static so it paints before React boots), and
// the only thing that keeps a choice like that honest is a guard that reads BOTH
// and requires them to agree. Every assertion here is derived from the shipped
// source — nothing restates a link table the code could change underneath it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ND = path.dirname(fileURLToPath(new URL('../public/newdesign/x', import.meta.url)));
const SHELL = readFileSync(path.join(ND, 'pageShell.jsx'), 'utf8');
const INDEX = readFileSync(path.join(ND, 'index.html'), 'utf8');

// Brace-match a top-level declaration out of the source and evaluate it, so the
// test drives the table that SHIPS rather than a copy of it.
function decl(name) {
  const at = SHELL.indexOf('const ' + name + ' = ');
  assert.notEqual(at, -1, name + ' is gone from pageShell.jsx');
  const open = SHELL.indexOf('[', at);
  let depth = 0, end = -1;
  for (let i = open; i < SHELL.length; i++) {
    const c = SHELL[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > open, 'could not bracket-match ' + name);
  return SHELL.slice(open, end);
}
const NAV_TABLES = new Function(
  'const COACHES_HREF = ' + /const COACHES_HREF = ("[^"]*")/.exec(SHELL)[1] + ';' +
  'const COACHES_ITEMS = ' + decl('COACHES_ITEMS') + ';' +
  'const SHAPE_NAV_GROUPS = ' + decl('SHAPE_NAV_GROUPS') + ';' +
  'const PORTAL_NAV = ' + decl('PORTAL_NAV') + ';' +
  'return { SHAPE_NAV_GROUPS, PORTAL_NAV, COACHES_HREF, COACHES_ITEMS };')();

// A link's identity for comparison: the file it lands on plus any hash. The two
// bars legitimately spell the same destination differently — the homepage writes
// `/newdesign/Marketplace.html`, the shared header writes `Marketplace.html`,
// because one is a static page and the other is mapped into a dashboard shell.
const target = (href) => String(href || '').replace(/^.*\//, '');

// ── the homepage's own bar, parsed out of the HTML ──────────────────────────
function homepageLinks() {
  const m = /<div class="nlinks">([\s\S]*?)<\/div>\s*<div class="nauth">/.exec(INDEX);
  assert.ok(m, 'the homepage nav\'s .nlinks block is gone — this guard is reading nothing');
  // Drop the dropdown PANELS first: their anchors are menu items, not top-level
  // tabs, and a naive anchor sweep would count them as extra links.
  const row = m[1].replace(/<div class="nmenu">[\s\S]*?<\/div>/g, '');
  const out = [];
  for (const a of row.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const label = a[2].replace(/<[^>]*>/g, '').replace(/&#9662;|▾/g, '').trim();
    out.push([label, a[1]]);
  }
  assert.ok(out.length >= 5, 'parsed only ' + out.length + ' homepage links — the parse stopped matching');
  return out;
}

// ── 1 · the two bars carry the SAME table ───────────────────────────────────
test('the homepage bar and the shared header offer the same links, in the same order', () => {
  const home = homepageLinks();
  const shell = NAV_TABLES.SHAPE_NAV_GROUPS.map((g) => [g.label, g.href]);
  assert.deepEqual(
    home.map(([l]) => l), shell.map(([l]) => l),
    'the two bars list different links — this is exactly the drift that produced two different nav bars',
  );
  assert.deepEqual(home.map(([, h]) => target(h)), shell.map(([, h]) => target(h)),
    'the two bars point the same labels at different pages');
});

test('the Coaches menu is the same on both bars', () => {
  const items = NAV_TABLES.COACHES_ITEMS;
  assert.deepEqual(items.map(([n]) => n), ['Trainers', 'Nutritionists']);
  // Each one deep-links the marketplace's own tab, and `marketplace.jsx` reads
  // that hash — a menu item pointing at a bare Marketplace.html would land on
  // whichever tab happened to be the default and look like a broken link.
  for (const [name, href] of items) {
    assert.match(href, /Marketplace\.html#(trainers|nutritionists)$/, name + ' does not deep-link a marketplace tab: ' + href);
  }
  const menu = /<div class="nmenu">([\s\S]*?)<\/div>/.exec(INDEX);
  assert.ok(menu, 'the homepage has no Coaches menu');
  for (const [, href] of items) {
    assert.ok(menu[1].includes(href.replace(/^/, '/newdesign/')), 'the homepage menu is missing ' + href);
  }
});

// ── 2 · signed in, the row is the essentials ────────────────────────────────
// Owner: "for signed in dont say workouts and nutritionists for client. its
// repetitive… just have coaches", and "all of those tabs on nav are on the
// dashboard nav bar".
const DASHBOARD_TABS = ['Workouts', 'Nutrition', 'Progress', 'Schedule', 'Clients', 'Programs', 'Plans', 'Messages', 'Business'];

test('the signed-in row carries the essentials and none of the dashboard\'s own tabs', () => {
  const labels = NAV_TABLES.PORTAL_NAV.map((g) => g.label);
  assert.deepEqual(labels, ['Coaches', 'About'], 'the signed-in row is not the essentials: ' + labels.join(' · '));
  for (const tab of DASHBOARD_TABS) {
    assert.ok(!labels.includes(tab), tab + ' is on the nav AND is a tab of the dashboard — the duplication the owner asked to remove');
  }
});

test('the signed-in row is the same for a member, a trainer and a nutritionist', () => {
  // ⚠ ONE TABLE, NOT A PER-ROLE MAP. `navGroupsFor` used to key on the role and
  // return a different set of tabs for each, which is what made the bar change
  // shape when a dual-role coach switched hats. The row is role-independent now;
  // the ROLE only decides where the Dashboard button points.
  assert.ok(!/PORTAL_NAV\s*=\s*\{/.test(SHELL), 'PORTAL_NAV is a per-role map again');
  const fn = SHELL.slice(SHELL.indexOf('function navGroupsFor('), SHELL.indexOf('\n}', SHELL.indexOf('function navGroupsFor(')));
  assert.ok(!/PORTAL_NAV\[/.test(fn), 'navGroupsFor indexes PORTAL_NAV by role again');
  assert.match(fn, /authUser \? PORTAL_NAV : SHAPE_NAV_GROUPS/, 'navGroupsFor no longer picks the table on signed-in alone');
});

// ── 3 · Dashboard appears exactly once when signed in ───────────────────────
test('Dashboard is offered once, as the button', () => {
  // It used to render TWICE on the same bar: as the first role tab and again as
  // a mono link in the auth cluster.
  assert.ok(!NAV_TABLES.PORTAL_NAV.some((g) => g.label === 'Dashboard'), 'Dashboard is back in the link row as well as the button');
  const header = SHELL.slice(SHELL.indexOf('function Header({ active })'));
  const signedIn = header.slice(header.indexOf('{authUser ? ('), header.indexOf(') : ('));
  assert.equal((signedIn.match(/>Dashboard</g) || []).length, 1, 'the signed-in cluster renders Dashboard more than once');
  assert.match(signedIn, /href=\{dashboardHref\(authUser\.role\)\} style=\{ctaBtn\}/, 'Dashboard is no longer the button');
  assert.match(signedIn, /onClick=\{handleLogout\} style=\{quietLink\}/, 'Sign out is no longer the quiet link');
});

test('the Dashboard button goes through dashShellHref, so inside a shell it is a hash route', () => {
  // A full page load and an SPA boot to reach a tab the shell already renders is
  // the defect R19 removed everywhere else; this button was an absolute URL.
  const fn = SHELL.slice(SHELL.indexOf('const dashboardHref ='), SHELL.indexOf('// Wrap plain-link nav items'));
  assert.match(fn, /dashShellHref\(/, 'dashboardHref bypasses the in-shell router');
  assert.ok(!/\/newdesign\/\w+Dashboard\.html/.test(fn), 'dashboardHref builds an absolute URL again: ' + fn.slice(0, 160));
});

// ── 4 · nothing in the bar can wrap ─────────────────────────────────────────
// The reported defect: at 1180px "Log in" rendered 35x32 across TWO LINES and
// "Get started" became a 50px block, because a `flex: 1 1 0` column may shrink
// below its own content — `min-width: auto` floors a flex item at its MIN-content
// width, which for a line of text is its longest WORD.
test('both flex columns are floored at max-content, on both bars', () => {
  assert.match(INDEX, /\.brand\{flex:1 1 0;min-width:max-content\}/, 'the homepage brand column can shrink below the logo again');
  assert.match(INDEX, /\.nauth\{flex:1 1 0;min-width:max-content;/, 'the homepage auth cluster can shrink below its text again');
  const header = SHELL.slice(SHELL.indexOf('<div className="shape-header-inner"'), SHELL.indexOf('</header>'));
  assert.equal((header.match(/minWidth: "max-content"/g) || []).length, 2,
    'the shared header no longer floors BOTH of its outer columns at max-content');
});

test('every control in the auth cluster refuses to wrap', () => {
  for (const name of ['quietLink', 'ctaBtn']) {
    const at = SHELL.indexOf('const ' + name + ' = {');
    assert.notEqual(at, -1, name + ' is gone');
    const decl = SHELL.slice(at, SHELL.indexOf('};', at));
    assert.match(decl, /whiteSpace: "nowrap"/, name + ' can wrap');
  }
  assert.match(INDEX, /\.nauth \.login\{[^}]*white-space:nowrap/, 'the homepage Log in can wrap again');
  assert.match(INDEX, /\.ncta\{[\s\S]{0,240}?white-space:nowrap/, 'the homepage Get started can wrap again');
});

test('Get started came down in size, and Radio matches its height', () => {
  // Owner: "reduce the size of get started box".
  const cta = /\.ncta\{([\s\S]*?)\}/.exec(INDEX);
  assert.ok(cta, 'the homepage CTA rule is gone');
  assert.match(cta[1], /height:34px/, 'the CTA is not 34px tall: ' + cta[1]);
  assert.ok(!/min-height:38px/.test(cta[1]), 'the CTA kept its 38px floor');
  const radio = /\.nradio\{([\s\S]*?)\}/.exec(INDEX);
  assert.match(radio[1], /height:34px/, 'the Radio pill no longer matches the button height');
});

test('the logo is larger than it was, on both bars', () => {
  // Owner: "make the shape logo larger in top left corner" — it was 36px.
  const home = /\.brand img\{height:(\d+)px/.exec(INDEX);
  assert.ok(home, 'the homepage logo rule is gone');
  assert.ok(Number(home[1]) > 36, 'the homepage logo is back to ' + home[1] + 'px');
  const shellH = /const NAV_LOGO_H = (\d+)/.exec(SHELL);
  assert.ok(shellH, 'NAV_LOGO_H is gone from pageShell');
  assert.equal(Number(shellH[1]), Number(home[1]), 'the two bars draw the logo at different heights');
});

// ── 5 · one bar height, read from one place ─────────────────────────────────
test('the bar height is named once and every offset is derived from it', () => {
  const h = /const NAV_H = (\d+)/.exec(SHELL);
  assert.ok(h, 'NAV_H is gone — the bar height is a literal again');
  const n = Number(h[1]);
  // The spacer, the responsive spacer and the sticky dashboard sidebar all read
  // it. A number typed in four places is a number that only moves in three.
  assert.match(SHELL, /className="shape-header-spacer" style=\{\{ height: NAV_H \}\}/, 'the header spacer hardcodes a height again');
  assert.match(SHELL, /top: \$\{NAV_H\}px !important/, 'the sticky dashboard sidebar hardcodes the header height again');
  // ⚠ And the homepage's fold was measured against the old 66px bar. These are
  // literals in a static file, so they cannot read NAV_H — they are asserted
  // EQUAL to it instead, which is what a shared constant would have bought.
  for (const re of [/\.hero\{position:relative;min-height:calc\(100vh - (\d+)px\)/, /\.jpin\{position:sticky;top:(\d+)px;height:calc\(100vh - (\d+)px\)/, /\.ndrawer\{display:block;position:fixed;inset:(\d+)px/]) {
    const m = re.exec(INDEX);
    assert.ok(m, 'a homepage rule that offsets against the bar is gone: ' + re);
    for (const px of m.slice(1)) assert.equal(Number(px), n, 'a homepage offset still assumes a ' + px + 'px bar, but the bar is ' + n + 'px');
  }
  assert.match(INDEX, new RegExp('\\.navr\\{[^}]*height:' + n + 'px'), 'the homepage bar is not ' + n + 'px tall');
});

// ── 6 · no anonymous route into a dashboard ─────────────────────────────────
test('the signed-out bar offers no dashboard link', () => {
  // The retired Clients / Trainers / Nutritionists menus each carried a
  // `Dashboard` item, so an anonymous visitor was one hover from the demo
  // dashboard — the access the owner asked to put behind an account.
  const hrefs = [];
  for (const g of NAV_TABLES.SHAPE_NAV_GROUPS) {
    hrefs.push(g.href);
    for (const [, h] of g.items || []) hrefs.push(h);
  }
  assert.ok(hrefs.length >= 7, 'read only ' + hrefs.length + ' signed-out targets');
  for (const h of hrefs) {
    assert.ok(!/Dashboard\.html|(Trainer|Nutritionist|Client)App\.html/.test(String(h)),
      'the signed-out nav still routes to a dashboard: ' + h);
  }
  for (const [label] of homepageLinks()) {
    assert.notEqual(label, 'Dashboard', 'the homepage bar offers a Dashboard link while signed out');
  }
});

// ── 7 · one typeface for the nav, everywhere ────────────────────────────────
// Owner: "make sure the font is the same on nav across website".
test('the shared header requests the nav families it draws with, with every axis', () => {
  // ⚠ GOOGLE FONTS SERVES ONLY THE AXES YOU ASK FOR and pins the rest at their
  // default, so a family requested without `wdth` delivers a font on which every
  // font-variation-settings:'wdth' N in this bar is INERT — and an ignored axis
  // is not an error in any browser, linter or build. It renders; it renders the
  // wrong glyph. Same class as tests/homepage-font-axes.test.mjs.
  const imp = /@import url\('([^']+)'\)/.exec(SHELL);
  assert.ok(imp, 'the shared header requests no web font — the nav renders the metrics fallback on all 69 pages');
  const url = imp[1];
  const families = {};
  for (const m of url.matchAll(/family=([A-Za-z+]+):([a-z,]+)@/g)) {
    families[m[1].replace(/\+/g, ' ')] = m[2].split(',');
  }
  assert.ok(Object.keys(families).length >= 2, 'the font request names fewer than two families: ' + url);
  // Derived: every axis the bar actually sets must be requested for a family
  // that is requested at all.
  const axes = new Set([...SHELL.matchAll(/fontVariationSettings: "'([A-Za-z]{4})' \d+"/g)].map((m) => m[1]));
  assert.ok(axes.size >= 1, 'the bar sets no variation axis — this guard is reading nothing');
  for (const axis of axes) {
    const served = Object.values(families).some((list) => list.includes(axis));
    assert.ok(served, "the bar sets the '" + axis + "' axis but no family is requested with it: " + url);
  }
  for (const fam of Object.keys(families)) {
    assert.ok(SHELL.includes("'" + fam + "'"), fam + ' is requested but the bar never names it');
  }
});

test('the nav is set in the same faces on both bars', () => {
  const navFaces = /const navSans = "([^"]+)"[\s\S]*?const navDisp = "([^"]+)"/.exec(SHELL);
  assert.ok(navFaces, 'the shared header no longer names its nav faces');
  // The homepage's own tokens are the source of truth — the shared header was
  // brought to THEM, not the other way round.
  const homeSans = /--sans:'([^']+)'/.exec(INDEX);
  const homeDisp = /--disp:'([^']+)'/.exec(INDEX);
  assert.ok(homeSans && homeDisp, 'the homepage no longer declares its type tokens');
  assert.ok(navFaces[1].includes(homeSans[1]), 'the shared header\'s nav body face is not the homepage\'s (' + homeSans[1] + '): ' + navFaces[1]);
  assert.ok(navFaces[2].includes(homeDisp[1]), 'the shared header\'s nav display face is not the homepage\'s (' + homeDisp[1] + '): ' + navFaces[2]);
});

// ── 8 · the pages the nav dropped are still reachable ──────────────────────
test('removing the nav dropdowns did not orphan the pages they pointed at', () => {
  // ⚠ Measured when the three dropdowns were retired: nothing else on the site
  // linked Coach.html, Nutritionist.html, Client.html or Recipes.html, so the
  // nav change alone would have left four real pages reachable only by typing a
  // URL. They moved to the footers; this keeps them there.
  //
  // ⚠ EACH FOOTER IS CHECKED SEPARATELY, and the mutation round is why. The first
  // cut asked whether EITHER footer linked the page — so deleting it from the
  // shared footer, the one rendered on all 69 other pages, still passed because
  // the homepage's own footer happened to keep it. "Reachable from somewhere" is
  // not the invariant; "reachable from the page you are on" is.
  for (const [where, src] of [['the shared footer', SHELL], ['the homepage footer', INDEX]]) {
    for (const page of ['Coach.html', 'Nutritionist.html', 'Client.html', 'Recipes.html']) {
      const linked = new RegExp('["\'/]' + page.replace('.', '\\.')).test(src);
      assert.ok(linked, page + ' is not linked from ' + where + ' — the nav dropped it and nothing picked it up');
    }
  }
});

// ── 9 · the bar really is on every page ─────────────────────────────────────
test('every newdesign page carries a nav, and the list is derived', () => {
  const pages = readdirSync(ND).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length > 50, 'read only ' + pages.length + ' pages — the sweep stopped matching');
  const missing = [];
  for (const f of pages) {
    const body = readFileSync(path.join(ND, f), 'utf8');
    if (/pageShell\.jsx/.test(body)) continue;          // renders the shared Header
    if (/location\.replace\(/.test(body)) continue;      // a redirect stub: it has no chrome by design
    if (/<nav[\s>]|<header[\s>]/.test(body)) continue;   // its own chrome (the app tour, the booking page)
    missing.push(f);
  }
  // ⚠ NAMED, NOT COUNTED. These are the pages with no nav of any kind, and each
  // is here for a stated reason: `ClientPlaylists.html` is an embedded phone-frame
  // surface, and `Shape Redesign-print.html` is a print sheet from the design
  // explorations. A NEW name appearing here is a page that shipped without the
  // bar — this test should fail rather than quietly absorb it into a count.
  assert.deepEqual(missing, ['ClientPlaylists.html', 'Shape Redesign-print.html'],
    'a newdesign page carries no nav at all: ' + missing.join(', '));
});
