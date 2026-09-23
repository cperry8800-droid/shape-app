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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parse as parseJs } from '@babel/parser';
import { navTables } from './helpers/nav-tables.mjs';

const ND = path.dirname(fileURLToPath(new URL('../public/newdesign/x', import.meta.url)));
const SHELL = readFileSync(path.join(ND, 'pageShell.jsx'), 'utf8');
const INDEX = readFileSync(path.join(ND, 'index.html'), 'utf8');

// Each table is evaluated from its own statement in the source, so the test
// drives the table that SHIPS — including the signed-in row, which is derived
// from the signed-out one rather than written out (see the helper).
const NAV_TABLES = navTables(SHELL);

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

// ⚠ THE PLACEHOLDER MUST NOT OUTLIVE ITS REASON. For one PR this pointed at
// `Marketplace.html`, because Coaches.html did not exist yet and a nav entry to a
// 404 on all 70 pages is worse than one to the next-best page. That is a debt,
// and a debt with nothing watching it is a permanent feature — so the target has
// to be a file that is actually in the repo.
test('the Coaches link names a page that exists', () => {
  const href = NAV_TABLES.COACHES_HREF;
  assert.ok(href, 'COACHES_HREF did not parse out of pageShell.jsx');
  assert.ok(existsSync(path.join(ND, target(href))),
    'the nav\'s Coaches points at ' + href + ', which is not in public/newdesign');
  // Both tables read the same constant, so neither bar can be pointed somewhere
  // else without the other following.
  for (const [name, groups] of [['signed out', NAV_TABLES.SHAPE_NAV_GROUPS], ['signed in', NAV_TABLES.PORTAL_NAV]]) {
    const coaches = groups.find((g) => g.label === 'Coaches');
    assert.ok(coaches, 'the ' + name + ' row has no Coaches entry');
    assert.equal(coaches.href, href, 'the ' + name + ' row points Coaches somewhere else');
  }
});

// Owner, 2026-09-14: "just have 1 link and have it say marketplace, since both
// coaches and nutritionists are on same page. both of those tabs now take you to
// same place". The menu used to carry Trainers and Nutritionists, each
// deep-linking one of the marketplace's own two tabs — one page with the switch
// at the top of it — so it offered one destination as two.
//
// ⚠ A BARE `Marketplace.html` IS NOW THE RIGHT TARGET, which is the opposite of
// what the previous version of this test guarded: with two items, a bare link
// landed on whichever tab was the default and read as broken; with one, picking
// a side is the defect, because the item is the page and the page has the
// switch. The hash reader in `marketplace.jsx` stays for anything else that
// deep-links a tab.
test('the Coaches menu is one Marketplace item, the same on both bars', () => {
  const items = NAV_TABLES.COACHES_ITEMS;
  assert.deepEqual(items.map(([n]) => n), ['Marketplace']);
  for (const [name, href] of items) {
    assert.equal(target(href), 'Marketplace.html', name + ' does not point at the marketplace: ' + href);
    assert.ok(!String(href).includes('#'), name + ' picks a marketplace tab; the one item must land on the page and its switch: ' + href);
    assert.ok(existsSync(path.join(ND, target(href))), name + ' points at ' + href + ', which is not in public/newdesign');
  }
  // The homepage's static menu: the same items, by label AND by target, in the
  // same order. (Reading the panel rather than `includes`-ing each href, so an
  // extra item the shared header does not carry fails too.)
  const menu = /<div class="nmenu">([\s\S]*?)<\/div>/.exec(INDEX);
  assert.ok(menu, 'the homepage has no Coaches menu');
  const home = [...menu[1].matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((a) => [a[2].replace(/<small>[\s\S]*?<\/small>/g, '').replace(/<[^>]*>/g, '').trim(), a[1]]);
  assert.deepEqual(home.map(([n]) => n), items.map(([n]) => n), 'the homepage menu lists different items');
  assert.deepEqual(home.map(([, h]) => target(h)), items.map(([, h]) => target(h)), 'the homepage menu points at different pages');
  // ⚠ AND THE DRAWER, which is the only nav a phone has: it inlines the menu's
  // items under Coaches, indented — every item must be there and no retired one
  // may linger, or a phone keeps two links the desktop bar no longer offers.
  const drawer = /<div class="ndrawer" id="ndrawer">([\s\S]*?)<\/div>/.exec(INDEX);
  assert.ok(drawer, 'the homepage has no drawer');
  const inDrawer = [...drawer[1].matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((a) => [a[2].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim(), target(a[1])]);
  for (const [name, href] of items) {
    assert.ok(inDrawer.some(([n, h]) => n === name && h === target(href)), 'the drawer is missing the menu item ' + name + ' → ' + href);
  }
  for (const retired of ['Trainers', 'Nutritionists']) {
    assert.ok(!inDrawer.some(([n]) => n === retired), 'the drawer still carries the retired menu item ' + retired);
    assert.ok(!home.some(([n]) => n === retired), 'the homepage menu still carries the retired item ' + retired);
  }
});

// ── 1b · Radio is offered once per width ───────────────────────────────────
// Owner, 2026-09-15: "remove the radio tab from main middle dashboard and leave
// the existing radio tab next to get started. dont need 2 tabs on dash". The bar
// carried BOTH a `Radio` link in the middle row and `RadioWordmark`, the bordered
// ▸◂ RADIO pill in the auth cluster — one destination twice on one row.
//
// ⚠ AND THE DRAWER KEEPS ITS RADIO LINK, WHICH IS THE HALF A TIDY-UP WOULD GET
// WRONG. The collapse rule hides the whole auth cluster, so at ≤1020px the pill
// is not on screen and the drawer is the only nav a phone has: dropping Radio
// from it removes the ONLY route to the page from every phone rather than
// removing a second tab. So the invariant is not "Radio is not in the nav" — it
// is "Radio is offered exactly once at every width": the pill above the
// breakpoint, the drawer below it.
test('Radio left the middle row on both bars, and the pill it duplicated stayed', () => {
  assert.ok(!NAV_TABLES.SHAPE_NAV_GROUPS.some((g) => target(g.href) === 'Radio.html'),
    'Radio is back in the shared header\'s link row, beside the ▸◂ RADIO pill that already offers it');
  const home = homepageLinks();
  assert.ok(home.length >= 5, 'parsed only ' + home.length + ' homepage links — this guard is reading nothing');
  assert.ok(!home.some(([, h]) => target(h) === 'Radio.html'),
    'Radio is back in the homepage\'s middle row, beside the .nradio pill that already offers it');

  // The pill is the one that stayed — on BOTH bars. (`homepage-climb.test.mjs`
  // renders the shared one; this only needs its target, to compare against the
  // drawer's below.)
  const pill = /<a className="shape-nav-radio" href="([^"]+)"/.exec(SHELL);
  assert.ok(pill, 'RadioWordmark no longer renders an anchor — the pill the middle-row link was removed in favour of is gone');
  assert.equal(target(pill[1]), 'Radio.html');
  const homePill = /<a class="nradio" href="([^"]+)"/.exec(INDEX);
  assert.ok(homePill, 'the homepage lost its .nradio pill — Radio is now offered nowhere on that bar');
  assert.equal(target(homePill[1]), 'Radio.html');

  // ⚠ THE PREMISE IS THE COLLAPSE RULE, so assert it rather than assume it. If a
  // later change made the pill visible on a phone, the drawer's Radio would be a
  // duplicate again and this test would be defending the wrong shape.
  const homeCollapse = /@media \(max-width:(\d+)px\)\{\s*([^}]*)\}/.exec(
    INDEX.slice(INDEX.indexOf('@media (max-width:1020px){')));
  assert.ok(homeCollapse, 'the homepage collapse rule is gone');
  assert.match(homeCollapse[2], /\.nauth \.nradio/, 'the homepage pill is no longer hidden when the bar collapses, so the drawer\'s Radio is a duplicate');
  // Brace-matched, not cut at the first `}` — that lands on the end of the block's
  // FIRST rule, so the assertion would read one declaration and pass or fail on
  // whichever rule happens to be written first.
  const at = SHELL.indexOf('@media (max-width: 1020px) {');
  assert.notEqual(at, -1, 'the shared header\'s nav-collapse media query is gone');
  let depth = 0, end = -1;
  for (let i = SHELL.indexOf('{', at); i < SHELL.length; i++) {
    if (SHELL[i] === '{') depth++;
    else if (SHELL[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > at, 'could not brace-match the collapse block');
  assert.match(SHELL.slice(at, end), /\.shape-nav-auth \{ display: none/,
    'the shared header\'s auth cluster (which carries the pill) is no longer hidden when the bar collapses');
});

test('both drawers still carry Radio, pointing where the pill points', () => {
  // ⚠ The shared drawer renders from the SAME table the bar does, so removing
  // Radio from the table took it out of the drawer too — it is rendered
  // explicitly there now, and that line is what this asserts. It is the only
  // thing standing between a phone and no route to Radio at all.
  const drawer = SHELL.slice(SHELL.indexOf('function MobileDrawer('), SHELL.indexOf('async function shapePortalSignOutStandalone'));
  assert.ok(drawer.length > 400, 'could not slice MobileDrawer — this guard is reading nothing');
  const pill = target(/<a className="shape-nav-radio" href="([^"]+)"/.exec(SHELL)[1]);
  const inShell = [...drawer.matchAll(/<a href="([^"]+)"[^>]*>Radio<\/a>/g)].map((m) => target(m[1]));
  assert.deepEqual(inShell, [pill],
    'the shared mobile drawer offers Radio ' + inShell.length + ' times — it must be exactly once, at ' + pill +
    ' (the pill is display:none at this width, so this link is the only route to the page from a phone)');

  const home = /<div class="ndrawer" id="ndrawer">([\s\S]*?)<\/div>/.exec(INDEX);
  assert.ok(home, 'the homepage has no drawer');
  const links = [...home[1].matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((a) => [a[2].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim(), target(a[1])]);
  assert.ok(links.length >= 8, 'parsed only ' + links.length + ' homepage drawer links — the parse stopped matching');
  const radios = links.filter(([, h]) => h === 'Radio.html');
  assert.deepEqual(radios, [['Radio', pill]],
    'the homepage drawer offers Radio ' + radios.length + ' times — it must be exactly once, and it is the only route to the page below 1020px');

  // ⚠ AND IN THE SAME PLACE IN BOTH: after every tab, because Radio is no longer
  // one of them — it is the pill standing in where the pill cannot render. The
  // shared drawer gets that for free (it is appended after the table's own map);
  // the homepage's is hand-written, so the two can drift, which is exactly how
  // the site came to have two different nav bars in the first place.
  const tabs = new Set(NAV_TABLES.SHAPE_NAV_GROUPS.map((g) => target(g.href)));
  const lastTab = links.map(([, h]) => h).lastIndexOf([...links].reverse().find(([, h]) => tabs.has(h))[1]);
  const radioAt = links.findIndex(([, h]) => h === 'Radio.html');
  assert.ok(radioAt > lastTab,
    'the homepage drawer puts Radio at ' + radioAt + ', among the tabs (the last tab is at ' + lastTab +
    ') — the shared drawer appends it after them, and two drawers that disagree is the drift this file exists to catch');
});

// ── 1c · the bar's stylesheet is still a stylesheet ────────────────────────
// ⚠ A BACKTICK IN A COMMENT INSIDE THIS FILE'S CSS IS CODE, AND NOTHING ELSE IN
// THE GATE CAN SEE IT. `<style>{`…`}</style>` is one template literal, and the
// long ⚠ notes explaining the media queries live INSIDE it — so a comment that
// quotes a selector the way every other comment in the repo does (`.shape-nav-x`)
// closes the template early. Measured on the real occurrence, 2026-09-15: the
// file still PARSES, `tsc` is clean, the mobile build is clean and all ~3,800
// tests pass, because `…`.shape-header-inner` to 24px` is legal JavaScript — a
// member read, then a subtraction chain over the bare identifiers `header` and
// `inner`. The whole shared header then throws `ReferenceError: header is not
// defined` at render and ~70 pages lose their chrome. Only a browser caught it.
//
// The tell is structural and needs no list of forbidden characters: with the
// stray backticks the <style> child stops being a TemplateLiteral and becomes a
// BinaryExpression. Proven both ways before this was written.
test('the shared header\'s stylesheet is ONE template literal, not an expression around one', async () => {
  const { parse } = await import('@babel/parser');
  const ast = parse(SHELL, { sourceType: 'module', plugins: ['jsx'] });
  const kinds = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'JSXElement' && node.openingElement.name && node.openingElement.name.name === 'style') {
      for (const c of node.children) if (c.type === 'JSXExpressionContainer') kinds.push(c.expression.type);
    }
    for (const k of Object.keys(node)) if (!k.startsWith('loc') && !k.endsWith('Comments')) walk(node[k]);
  })(ast.program);
  assert.ok(kinds.length >= 1, 'pageShell renders no <style> with an expression child — this guard is reading nothing');
  assert.deepEqual(kinds, kinds.map(() => 'TemplateLiteral'),
    'a <style> block is ' + kinds.join('/') + ' rather than a plain template literal — almost certainly a backtick inside one of its CSS comments, ' +
    'which parses, builds and tests green and throws at render');
});

// ⚠ AND THE GUARD ABOVE COVERED ONE FILE WHILE THE HAZARD IS EVERY FILE. It read
// pageShell.jsx alone — the page that paid for it — so a backtick in a CSS comment in
// any other newdesign module was still free to close its template literal. Measured
// while writing radioInstrument.jsx's own <style>: TWO comments in one change did it,
// once quoting a CSS selector and once a property. Both happened to produce INVALID
// JavaScript, so the JSX parse-check caught them; pageShell's produced VALID JavaScript
// and reached a browser with ~70 pages' chrome gone. Which of the two you get is a
// property of the words you were quoting, not of the mistake.
//
// So the sweep is derived from the directory rather than from a list of files.
test('no newdesign stylesheet is an expression around a literal, in any module', async () => {
  const { parse } = await import('@babel/parser');
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(ND).filter((f) => f.endsWith('.jsx'));
  assert.ok(files.length > 20, `found ${files.length} newdesign .jsx files — this sweep has stopped reading the directory`);

  let seen = 0;
  const bad = [];
  for (const f of files) {
    const src = readFileSync(`${ND}/${f}`, 'utf8');
    let ast;
    try { ast = parse(src, { sourceType: 'module', plugins: ['jsx'] }); }
    catch (e) { bad.push(`${f}: does not parse (${String(e.message).slice(0, 70)})`); continue; }
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.type === 'JSXElement' && node.openingElement.name && node.openingElement.name.name === 'style') {
        for (const c of node.children) {
          if (c.type !== 'JSXExpressionContainer') continue;
          seen += 1;
          // A plain literal is safe — dashToday.jsx legitimately passes a StringLiteral.
          // What a stray backtick produces is an EXPRESSION built from one.
          if (c.expression.type !== 'TemplateLiteral' && c.expression.type !== 'StringLiteral') {
            bad.push(`${f}: a <style> child is ${c.expression.type}`);
          }
        }
      }
      for (const k of Object.keys(node)) if (!k.startsWith('loc') && !k.endsWith('Comments')) walk(node[k]);
    })(ast.program);
  }
  // vacuity floor: a walk that stops finding <style> children asserts nothing
  assert.ok(seen >= 15, `found only ${seen} <style> expression children across ${files.length} modules — this sweep has gone blind`);
  assert.deepEqual(bad, [],
    'a newdesign stylesheet is an expression rather than a plain literal — almost certainly a backtick inside one of its ' +
    'CSS comments, which can parse, build and test green and then throw at render:\n  ' + bad.join('\n  '));
});

// ── 2 · signed in, the row is the site's tabs minus the sign-up pages ──────
// Owner, 2026-09-23, on a screenshot of the signed-in bar reading only
// "Coaches ▾  About": "need to add more nav tabs on main nav bar when signed into
// account" — and of the rows put to them, "Site tabs minus sign-up pages".
// The older ruling still holds for the dashboard's own tabs: "for signed in dont
// say workouts and nutritionists for client. its repetitive… just have coaches",
// and "all of those tabs on nav are on the dashboard nav bar".
const DASHBOARD_TABS = ['Workouts', 'Nutrition', 'Progress', 'Schedule', 'Clients', 'Programs', 'Plans', 'Messages', 'Business'];

test('the signed-in row is the site\'s tabs minus the two sign-up pages, and none of the dashboard\'s', () => {
  const labels = NAV_TABLES.PORTAL_NAV.map((g) => g.label);
  assert.deepEqual(labels, ['Coaches', 'App', 'Kitchen', 'Community', 'Rewards', 'About'],
    'the signed-in row is not the owner\'s pick: ' + labels.join(' · '));
  assert.deepEqual(NAV_TABLES.SIGNED_OUT_ONLY, ['Members', 'Pricing'],
    'the sign-up pages kept off the signed-in row changed: ' + NAV_TABLES.SIGNED_OUT_ONLY.join(' · '));
  for (const tab of DASHBOARD_TABS) {
    assert.ok(!labels.includes(tab), tab + ' is on the nav AND is a tab of the dashboard — the duplication the owner asked to remove');
  }
});

// ⚠ DERIVED, NOT RESTATED — and asserted by IDENTITY, so this guard does not
// reimplement the filter it is checking. The signed-in row used to be a second
// hand-written table, and it had drifted: its Coaches tab lit on fewer pages than
// the signed-out one's. Every signed-in entry must be the very object the
// signed-out table holds, in the same order — a restated table fails even when
// every value in it happens to match today.
test('the signed-in row is the signed-out row\'s own entries, in its order', () => {
  const out = NAV_TABLES.SHAPE_NAV_GROUPS;
  const signedIn = NAV_TABLES.PORTAL_NAV;
  assert.ok(out.length >= 6 && signedIn.length >= 4, 'read ' + out.length + ' / ' + signedIn.length + ' tabs — this guard is reading nothing');
  let lastAt = -1;
  for (const g of signedIn) {
    const at = out.indexOf(g);
    assert.notEqual(at, -1, g.label + ' is on the signed-in row as a copy, not the signed-out table\'s own entry — the two tables can drift again');
    assert.ok(at > lastAt, g.label + ' is out of the signed-out row\'s order');
    lastAt = at;
  }
  // Every signed-out tab is either on the signed-in row or named as a sign-up
  // page — so a tab the site adds later reaches members unless somebody decides.
  for (const g of out) {
    assert.ok(signedIn.includes(g) !== NAV_TABLES.SIGNED_OUT_ONLY.includes(g.label),
      g.label + ' must be on exactly one side: the signed-in row or SIGNED_OUT_ONLY');
  }
  // A sign-up page named here must BE a tab. Renamed away (say "Pricing" →
  // "Plans"), the old name would exclude nothing and the page would slip back
  // onto the signed-in row with every other assertion still green.
  const outLabels = out.map((g) => g.label);
  for (const name of NAV_TABLES.SIGNED_OUT_ONLY) {
    assert.ok(outLabels.includes(name), 'SIGNED_OUT_ONLY names ' + name + ', which is not a tab on the signed-out row — it keeps nothing off');
  }
});

// ⚠ THE HOMEPAGE'S STATIC BAR CANNOT READ PORTAL_NAV, so it carries the same
// decision in its markup: each sign-up link is marked `data-signed-out-only`, on
// the bar AND in the drawer, and its /api/me scripts remove what is marked. This
// file's own header claimed to compare the two long before anything did — the old
// homepage kept a hand-written set of labels that nothing read back.
function markedLinks(block) {
  return [...block.matchAll(/<a href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)]
    .filter((a) => /\bdata-signed-out-only\b/.test(a[2]))
    .map((a) => [a[3].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim(), target(a[1])]);
}
test('the homepage marks exactly the sign-up pages, on its bar and in its drawer', () => {
  const bar = /<div class="nlinks">([\s\S]*?)<\/div>\s*<div class="nauth">/.exec(INDEX);
  const drawer = /<div class="ndrawer" id="ndrawer">([\s\S]*?)<\/div>/.exec(INDEX);
  assert.ok(bar && drawer, 'the homepage bar or drawer did not parse — this guard is reading nothing');
  const expected = NAV_TABLES.SIGNED_OUT_ONLY.map((n) => [n, target(NAV_TABLES.SHAPE_NAV_GROUPS.find((g) => g.label === n).href)]);
  assert.ok(expected.length >= 1, 'SIGNED_OUT_ONLY is empty — this guard compares nothing');
  assert.deepEqual(markedLinks(bar[1]), expected, 'the homepage bar marks a different set of sign-up links than the shared header keeps off');
  assert.deepEqual(markedLinks(drawer[1]), expected, 'the homepage drawer marks a different set of sign-up links than its bar');
});

// Driven, not grepped: the homepage's two /api/me scripts run in a real DOM
// against the real markup, once signed in and once signed out (the control — a
// swap that removed links for everyone would pass the first half alone).
async function homepageAfterMe(user) {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const dom = new JSDOM(INDEX, { runScripts: 'outside-only', url: 'https://shape.test/newdesign/index.html' });
  const w = dom.window;
  w.fetch = async () => ({ ok: true, json: async () => ({ user }) });
  const scripts = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const header = scripts.filter((s) => /nav \.nauth/.test(s) && /fetch\('\/api\/me'/.test(s));
  const drawer = scripts.filter((s) => /getElementById\('ndrawer'\)/.test(s) && /fetch\('\/api\/me'/.test(s));
  assert.equal(header.length, 1, 'found ' + header.length + ' signed-in header scripts on the homepage — this guard is driving nothing');
  assert.equal(drawer.length, 1, 'found ' + drawer.length + ' signed-in drawer scripts on the homepage — this guard is driving nothing');
  w.eval(header[0]);
  w.eval(drawer[0]);
  for (let i = 0; i < 5; i++) await new Promise((r) => w.setTimeout(r, 0));
  const doc = w.document;
  const bar = [...doc.querySelectorAll('nav .nlinks > *')]
    .map((el) => (el.matches('a') ? el : el.querySelector('a')).childNodes[0].textContent.trim());
  const inDrawer = [...doc.querySelectorAll('#ndrawer a')].map((a) => a.textContent.replace(/ /g, ' ').trim());
  dom.window.close();
  return { bar, inDrawer };
}
test('signed in, the homepage bar and drawer carry the shared header\'s signed-in row', async () => {
  const want = NAV_TABLES.PORTAL_NAV.map((g) => g.label);
  const tabs = new Set(NAV_TABLES.SHAPE_NAV_GROUPS.map((g) => g.label));
  const me = await homepageAfterMe({ id: 'u', email: 'x@shape.test', firstName: 'Chris', role: 'client', roles: ['client'] });
  assert.deepEqual(me.bar, want, 'the homepage\'s signed-in bar is not the shared header\'s signed-in row');
  assert.deepEqual(me.inDrawer.filter((l) => tabs.has(l)), want, 'the homepage\'s signed-in drawer is not the shared header\'s signed-in row');
  for (const extra of ['Marketplace', 'Radio', 'Dashboard', 'Sign out']) {
    assert.ok(me.inDrawer.includes(extra), 'the signed-in homepage drawer lost ' + extra + ': ' + me.inDrawer.join(' · '));
  }
  const out = await homepageAfterMe(null);
  const all = NAV_TABLES.SHAPE_NAV_GROUPS.map((g) => g.label);
  assert.deepEqual(out.bar, all, 'signed OUT, the homepage bar lost a tab — the swap is firing without an account');
  assert.deepEqual(out.inDrawer.filter((l) => tabs.has(l)), all, 'signed OUT, the homepage drawer lost a tab');
});

// ── 2b · every tab lights on the page it opens ─────────────────────────────
// A plain tab lights when its page renders `<Header active="<its label>" />`,
// a menu tab when the page's value is in its `match` list. The Rewards tab's own
// page passed "Shape Score", so the one page that tab opens was the one page it
// never marked — found while bringing Rewards onto the signed-in row. Derived
// from the table and each page's own scripts, so a tab added later is covered.
test('every tab on the bar lights on its own page', () => {
  const groups = NAV_TABLES.SHAPE_NAV_GROUPS;
  assert.ok(groups.length >= 6, 'read only ' + groups.length + ' tabs — this guard is reading nothing');
  for (const g of groups) {
    const page = target(g.href);
    const html = readFileSync(path.join(ND, page), 'utf8');
    const modules = [...html.matchAll(/<script type="text\/babel"[^>]*\bsrc="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
    const text = [html, ...modules.filter((m) => existsSync(path.join(ND, m))).map((m) => readFileSync(path.join(ND, m), 'utf8'))].join('\n');
    const actives = [...text.matchAll(/<Header active="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(actives.length >= 1, page + ' (the ' + g.label + ' tab) renders no <Header active="…"> that this guard can find');
    for (const a of actives) {
      const lit = g.kind === 'drop' ? g.match.includes(a) : a === g.label;
      assert.ok(lit, page + ' passes active="' + a + '", which does not light the ' + g.label + ' tab that opens it');
    }
  }
});

// ── 2c · the wider signed-in cluster gives way before it meets the tabs ─────
// ⚠ A FIT IS A BROWSER QUESTION; what is asserted here is what can be deleted by
// accident. Measured in Chromium in the real faces (the numbers live beside the
// rules in pageShell.jsx): with six tabs back on the signed-in row, a 150px name
// or a profile-switch pill ran the row into the right-hand cluster at widths the
// signed-out bar clears. Three rules close it — drop the greeting, tighten a
// switch account's spacing, fold a switch account to the menu — and each is
// keyed on a hook the markup has to keep providing.
function mediaBlocks(src) {
  const out = [];
  for (const m of src.matchAll(/@media \(max-width: ?(\d+)px\) ?\{/g)) {
    let depth = 0, end = -1;
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    out.push({ at: m.index, width: Number(m[1]), body: src.slice(m.index, end) });
  }
  return out;
}
test('signed in, the wide right-hand cluster gives way before it can meet the tabs', () => {
  const header = SHELL.slice(SHELL.indexOf('function Header({ active })'), SHELL.indexOf('function HeroBg('));
  assert.ok(header.length > 2000, 'could not slice Header — this guard is reading nothing');
  // The hooks: the greeting carries the class the stylesheet hides, and the
  // header's switch attribute comes from the SAME flag that renders the pill.
  assert.match(header, /<span className="shape-nav-hi"[^>]*>Hi, \{/, 'the greeting lost the class its width rules key on');
  assert.match(header, /<header className="shape-header" data-role-switch=\{hasRoleSwitch \? "" : undefined\}/, 'the header no longer stamps data-role-switch from hasRoleSwitch');
  assert.match(header, /\{hasRoleSwitch \? \(/, 'the switch pill renders on a condition of its own again — the pill and its layout can disagree');

  const blocks = mediaBlocks(SHELL);
  const find = (re) => blocks.filter((b) => re.test(b.body));
  const collapse = find(/\n\s*\.shape-nav-tabs \{ display: none/);
  assert.equal(collapse.length, 1, 'expected ONE everyone-collapse block, found ' + collapse.length);
  const everyone = collapse[0].width;

  // 1 · the greeting goes at some width above the everyone-collapse, and a switch
  // account's greeting goes no later than everyone's.
  const hi = find(/\n\s*\.shape-nav-hi \{ display: none !important; \}/);
  const hiSwitch = find(/\.shape-header\[data-role-switch\] \.shape-nav-hi \{ display: none !important; \}/);
  assert.equal(hi.length, 1, 'the greeting has no width at which it gives way');
  assert.equal(hiSwitch.length, 1, 'a switch account\'s greeting has no width at which it gives way');
  assert.ok(hi[0].width > everyone, 'the greeting only goes once the whole bar has collapsed — too late');
  assert.ok(hiSwitch[0].width >= hi[0].width, 'a switch account keeps its greeting to a narrower width than everyone else — it has the wider cluster');

  // 2 · a switch account's tight spacing weighs no more than the plain rules
  // (:where), and sits BEFORE the everyone-collapse and phone blocks in the
  // source, so those still tighten a switch account further on a phone.
  const tight = find(/:where\(\.shape-header\[data-role-switch\]\) \.shape-header-inner \{/);
  assert.equal(tight.length, 1, 'a switch account lost its early tight spacing, or it no longer uses :where()');
  assert.match(tight[0].body, /:where\(\.shape-header\[data-role-switch\]\) \.shape-nav-tabs \{ gap:/, 'the early tight spacing no longer tightens the tabs');
  // ⚠ GAPS ONLY. The side padding is the page gutter the Radio fold steps with
  // (tests/radio-instrument-rules.test.mjs); moving it for some accounts sets
  // their Radio hero out of line with the header — the first cut of this rule did.
  assert.doesNotMatch(tight[0].body, /\[data-role-switch\]\) \.shape-header-inner \{[^}]*padding/,
    'the early tight spacing moves the side padding — the page gutter other pages line up with');
  const phone = blocks.filter((b) => b.width < everyone + 1 && /\.shape-header-inner \{ padding/.test(b.body) && b !== tight[0]);
  assert.ok(phone.length >= 2, 'found ' + phone.length + ' later inner-tightening blocks — this guard is reading nothing');
  for (const p of phone) {
    assert.ok(p.at > tight[0].at, 'the ' + p.width + 'px block sits before the :where() rule, so on a phone a switch account keeps the looser inner');
  }

  // 3 · a switch account folds to the menu above the everyone-collapse, and the
  // fold hides and shows the same four things the everyone-collapse does.
  const fold = find(/\.shape-header\[data-role-switch\] \.shape-nav-tabs \{ display: none !important; \}/);
  assert.equal(fold.length, 1, 'a switch account no longer folds to the menu early');
  assert.ok(fold[0].width > everyone && fold[0].width < tight[0].width, 'the switch fold (' + fold[0].width + ') must sit between the everyone-collapse (' + everyone + ') and the switch tight spacing (' + tight[0].width + ')');
  for (const [cls, shown] of [['shape-nav-tabs', 'none'], ['shape-nav-auth', 'none'], ['shape-nav-bell', 'inline-flex'], ['shape-nav-burger', 'inline-flex']]) {
    assert.match(fold[0].body, new RegExp('\\.shape-header\\[data-role-switch\\] \\.' + cls + ' \\{ display: ' + shown + ' !important; \\}'),
      'the switch fold does not set .' + cls + ' to ' + shown + ' — a phone-width bar with a half-folded cluster');
    assert.match(collapse[0].body, new RegExp('\\.' + cls + ' \\{ display: ' + shown), 'the everyone-collapse changed shape for .' + cls + ' — re-check the switch fold against it');
  }

  // The homepage's greeting: the same 150px cap and the same width to go at —
  // one bar, one breakpoint.
  assert.match(header, /className="shape-nav-hi" style=\{\{[^}]*maxWidth: 150/, 'the shared greeting is no longer capped at 150px');
  assert.match(INDEX, /\.nauth \.nhi\{max-width:150px;overflow:hidden;text-overflow:ellipsis\}/, 'the homepage greeting is no longer capped at 150px');
  const homeHi = /@media \(max-width:(\d+)px\)\{\.nauth \.nhi\{display:none\}\}/.exec(INDEX);
  assert.ok(homeHi, 'the homepage greeting has no width at which it gives way');
  assert.equal(Number(homeHi[1]), hi[0].width, 'the two bars drop the greeting at different widths');
  assert.match(INDEX, /hi\.className='login nhi'/, 'the homepage greeting lost the class its width rule keys on');
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

test('Get started stays small, and Radio matches its height', () => {
  // Owner: "reduce the size of get started box".
  // ⚠ RE-ANCHORED: this pinned `height:34px` literally, so the N1 nav treatment —
  // which takes the pair to 36 with the house chamfer — broke a test about the pair
  // being SMALL and MATCHED. A guard that pins a spelling pins whatever that
  // spelling is wrong about. The invariants are the two that were ever meant: the
  // CTA is well under the 38px floor it came down from, and the chip is exactly the
  // same height, so the right-hand cluster reads as one row.
  const cta = /\.ncta\{([\s\S]*?)\}/.exec(INDEX);
  assert.ok(cta, 'the homepage CTA rule is gone');
  const ctaH = /height:(\d+)px/.exec(cta[1]);
  assert.ok(ctaH, 'the CTA has no height: ' + cta[1]);
  assert.ok(Number(ctaH[1]) < 38, 'the CTA is back up to ' + ctaH[1] + 'px');
  assert.ok(!/min-height:38px/.test(cta[1]), 'the CTA kept its 38px floor');
  const radio = /\.nradio\{([\s\S]*?)\}/.exec(INDEX);
  const radioH = /height:(\d+)px/.exec(radio[1]);
  assert.ok(radioH, 'the Radio pill has no height');
  assert.equal(radioH[1], ctaH[1], 'the Radio pill no longer matches the button height');
  // and the shared header draws the same pair, or one bar reads two ways
  const shellH = /const NAV_PILL_H = (\d+)/.exec(SHELL);
  assert.ok(shellH, 'NAV_PILL_H is gone from pageShell');
  assert.equal(shellH[1], ctaH[1], 'the two bars draw the pair at different heights');
  // the chamfer is on both, and it is the same cut
  const cut = (s) => (/calc\(100% - (\d+)px\) 0/.exec(s) || [])[1];
  assert.equal(cut(cta[1]), '8', 'the homepage CTA lost its chamfer');
  assert.equal(cut(radio[1]), '8', 'the homepage Radio pill lost its chamfer');
  // ⚠ THE SHELL NAMES THE CUT ONCE AND INTERPOLATES IT, so there is no literal
  // `calc(100% - 8px)` to match there — asking for one reported a chamfer that is
  // plainly in the file as missing. The invariant is that it is the same cut, which
  // means reading the constant it is built from.
  const shellCut = /const NAV_CUT = (\d+)/.exec(SHELL);
  assert.ok(shellCut, 'NAV_CUT is gone from pageShell');
  assert.equal(shellCut[1], '8', 'the shared header uses a different cut from the homepage');
  assert.match(SHELL, /navChamfer[\s\S]{0,120}calc\(100% - \$\{NAV_CUT\}px\)/, 'the shared chamfer is not built from NAV_CUT');
  assert.ok(/clipPath: navChamfer/.test(SHELL), 'the shared header lost its chamfer');
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

// ── 7b · sign-out is reachable at EVERY width ──────────────────────────────
// ⚠ Codex, #2063. Making Dashboard the button made Sign out the quiet `.login`,
// and `.nauth .login` is `display:none` in the collapsed rule — so a signed-in
// member on the homepage below that width had no way to sign out at all: hidden
// in the header, and the drawer deliberately carried none because the header's
// used to be the unhidden `.ncta`. A control that exists at some widths and
// nowhere at others is the dead-control class with a viewport attached.
test('a signed-in member can sign out at every width, on both bars', () => {
  // The homepage's collapsed rule hides the quiet link, so the DRAWER must carry
  // sign-out — and it must delegate rather than copy the chain.
  const hides = /\.nlinks,\.nauth \.login,[^}]*display:none/.test(INDEX);
  assert.ok(hides, 'the homepage collapse rule changed shape — re-check where Sign out goes');
  const drawerSwap = INDEX.slice(INDEX.indexOf('The drawer is the only nav a phone has'));
  assert.match(drawerSwap, /textContent\s*=\s*'Sign out'/, 'the authenticated drawer offers no Sign out, and the header hides it when collapsed');
  assert.match(drawerSwap, /window\.shapePortalSignOut/, 'the drawer reimplements the sign-out chain instead of delegating to the canonical one');
  // ⚠ AND IT MUST NOT BE A THIRD COPY. pageShell defines the ordering once; the
  // homepage header has the second. A third would be the "copied guard with its
  // rationale left behind" this repo refuses.
  assert.ok(!/api\/auth\/signout/.test(drawerSwap), 'the drawer carries its own copy of the sign-out chain');
  // The shared header's drawer carries one too.
  const shellDrawer = SHELL.slice(SHELL.indexOf('function MobileDrawer('), SHELL.indexOf('async function shapePortalSignOutStandalone'));
  assert.match(shellDrawer, />Sign out</, 'the shared mobile drawer lost its Sign out');
});

test('the drawer closes on the same breakpoint that creates it', () => {
  // ⚠ Codex, #2063. The close-on-resize listener restated the old 860 while the
  // CSS moved to 980, so a resize anywhere in 861–980 shut a drawer that was
  // still the only nav there. It asks matchMedia for the SAME query now, so the
  // two cannot drift — assert exactly that, not the number.
  const css = /@media \(max-width:(\d+)px\)\{\s*\.nlinks,\.nauth \.login/.exec(INDEX);
  assert.ok(css, 'the homepage nav-collapse media query is gone');
  const mq = /matchMedia\('\(max-width:(\d+)px\)'\)/.exec(INDEX);
  assert.ok(mq, 'the drawer no longer asks matchMedia — it is restating a breakpoint again');
  assert.equal(mq[1], css[1], 'the drawer closes at ' + mq[1] + 'px but collapses at ' + css[1] + 'px');
  assert.ok(!/innerWidth\s*>\s*\d+\)\s*set\(false\)/.test(INDEX), 'the width-comparison listener is back');
});

// ── 7c · the eighth tab has room to be on screen ───────────────────────────
test('the header tightens ABOVE the collapse, so the eight-link row is never clipped', () => {
  // ⚠ THIS IS A MEASUREMENT PINNED AS AN INVARIANT, not a taste. `Kitchen` took
  // the shared header's row from seven links to eight, and ALL of that bar's
  // tightening used to live in the ≤1020 block — the block that also hides the
  // row. Driven naturally in Chromium on Pricing.html with the real faces: the
  // eight-link row needed 508px at 1021 and the flex row gave it 493, so `About`
  // overhung its own box by 5px at 1040 and 15px at 1021 — CUT OFF at every
  // width from 1044 down to the collapse, on a 1024px window among others.
  //
  // Splitting the tightening out to the ≤1100 block clears it: re-measured, clip
  // is 0 at every width from 1440 to 1021, with 18px still between the row and
  // the auth cluster. The breakpoint itself is deliberately NOT moved — raising
  // it to 1060 would have taken 40px of desktop away AND split this bar from the
  // homepage's, whose own flex row measured clean to 1021 with the same links.
  //
  // What is asserted is the thing that can be deleted by accident: the trim
  // exists in a block ABOVE the collapse. A CSS fit is a browser question; that
  // this block still tightens before the row is asked to survive is not.
  const trim = /@media \(max-width: 1100px\) \{([\s\S]*?)\n {6}\}/.exec(SHELL);
  assert.ok(trim, 'the shared header lost its ≤1100px tightening block');
  assert.match(trim[1], /\.shape-header-inner\s*\{[^}]*padding:/, 'the ≤1100 block no longer trims the header inner padding');
  assert.match(trim[1], /\.shape-header-inner\s*\{[^}]*gap:/, 'the ≤1100 block no longer trims the header inner gap');
  assert.match(trim[1], /\.shape-nav-tabs\s*\{[^}]*gap:/, 'the ≤1100 block no longer trims the tab gap');
  // Guard the guard: the block must sit ABOVE the collapse or it tightens nothing
  // the row can use. Both numbers are read, never restated.
  const collapse = /@media \(max-width: (\d+)px\) \{\s*\.shape-header-inner[^}]*\}\s*\.shape-nav-tabs \{ display: none/.exec(SHELL);
  assert.ok(collapse, 'the shared header nav-collapse block is gone');
  // ⚠ The breakpoint is read by walking BACK from the trim to the @media that
  // encloses it, never by a fixed-width window: a window is a length, and the
  // comment above this block is free to grow past whatever length is chosen.
  const trimIdx = SHELL.indexOf('.shape-nav-tabs { gap:');
  assert.ok(trimIdx > 0, 'the tab-gap trim is gone');
  const opens = [...SHELL.slice(0, trimIdx).matchAll(/@media \(max-width: (\d+)px\) \{/g)];
  assert.ok(opens.length, 'no @media block encloses the tab-gap trim');
  const trimAt = Number(opens[opens.length - 1][1]);
  assert.ok(trimAt > Number(collapse[1]),
    `the tightening block (${trimAt}px) is not above the collapse (${collapse[1]}px) — it can never give the row room`);
});

// ── 7d · the drawer is the only nav a phone has ────────────────────────────
test('the homepage drawer carries every link the homepage bar carries', () => {
  // ⚠ THE MUTATION ROUND IS WHAT FOUND THIS, and it is a class rather than one
  // link: deleting `Kitchen` from the homepage DRAWER alone left the whole suite
  // green. Below 1020px `.nlinks` is display:none and this drawer is the only
  // nav the page has, so a link missing here is a destination no phone can reach
  // — the exact failure the Radio comment in index.html already warns about, in
  // the other direction.
  //
  // The two lists are DERIVED from the markup, and the drawer's extras are named
  // rather than counted: it legitimately carries the dropdown's own item inline
  // (Marketplace), plus Radio and the auth pair the collapse rule hides.
  const bar = homepageLinks().map(([l]) => l);
  const m = /<div class="ndrawer" id="ndrawer">([\s\S]*?)<\/div>/.exec(INDEX);
  assert.ok(m, 'the homepage drawer is gone — this guard is reading nothing');
  const drawer = [...m[1].matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)]
    .map((a) => a[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
  assert.ok(drawer.length >= 6, 'parsed only ' + drawer.length + ' drawer links — the parse stopped matching');
  const missing = bar.filter((l) => !drawer.includes(l));
  assert.deepEqual(missing, [], 'the homepage drawer is missing ' + missing.join(', ') + ' — below 1020px that is a destination no phone can reach');
  // Guard the guard: a parser that returned the whole bar would satisfy the line
  // above for free. The drawer must carry the extras that are ONLY in it.
  for (const extra of ['Marketplace', 'Radio']) {
    assert.ok(drawer.includes(extra), 'the drawer lost ' + extra + ', which the bar does not carry as a tab');
  }
});

// ── 7e · the shared drawer covers the screen it is the only nav on ──────────
// ⚠ THE DRAWER WAS CLIPPED TO A 72px STRIP ON EVERY PAGE THE HEADER RENDERS.
// `.shape-header` carries `backdrop-filter`, which makes it the containing block
// for its position:fixed descendants — so `inset: 0` resolved against the
// header, not the viewport. Measured at 390×844, signed in: the dialog was
// 390×72 with its links running to y 696 inside it. It is portaled to <body>
// now, and these read the AST rather than the spelling, so an equivalent
// rewrite passes and moving it back into the header does not.
const SHELL_AST = parseJs(SHELL, { sourceType: 'module', plugins: ['jsx'] });
function walkAst(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node) === false) return;
  for (const k of Object.keys(node)) {
    if (k === 'loc' || /Comments$/.test(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walkAst(c, visit));
    else if (v && typeof v.type === 'string') walkAst(v, visit);
  }
}
function shellFn(name) {
  let hit = null;
  walkAst(SHELL_AST, (n) => { if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { hit = n; return false; } });
  assert.ok(hit, 'pageShell.jsx no longer declares ' + name + ' — this guard is reading nothing');
  return hit;
}
const isMember = (n, obj, prop) => !!n && n.type === 'MemberExpression' && !n.computed && n.property.name === prop &&
  (typeof obj === 'string' ? n.object.type === 'Identifier' && n.object.name === obj : obj(n.object));
const jsxName = (el) => el.openingElement.name.name;
const jsxAttr = (el, name) => el.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name);
function jsxStyle(el) {
  const a = jsxAttr(el, 'style');
  const out = {};
  if (a && a.value && a.value.type === 'JSXExpressionContainer' && a.value.expression.type === 'ObjectExpression') {
    for (const p of a.value.expression.properties) if (p.type === 'ObjectProperty') out[p.key.name || p.key.value] = p.value;
  }
  return out;
}
function jsxElements(root, name) {
  const out = [];
  walkAst(root, (n) => { if (n.type === 'JSXElement' && (!name || jsxName(n) === name)) out.push(n); });
  return out;
}

test('the shared drawer is portaled out of the header, so it covers the screen', () => {
  const drawer = shellFn('MobileDrawer');
  // Its OWN returns: a handler's `return` inside an arrow is not the component's.
  const returns = [];
  walkAst(drawer.body, (n) => {
    if (n !== drawer.body && /Function/.test(n.type)) return false;
    if (n.type === 'ReturnStatement') returns.push(n);
  });
  const rendered = returns.filter((r) => r.argument && r.argument.type !== 'NullLiteral');
  assert.ok(rendered.length >= 1, 'MobileDrawer renders nothing this guard can see — it is reading nothing');
  for (const r of rendered) {
    const call = r.argument;
    assert.ok(call.type === 'CallExpression' && isMember(call.callee, 'ReactDOM', 'createPortal'),
      'MobileDrawer returns its dialog in place — inside <header>, whose backdrop-filter clips a fixed child to the header\'s 72px box. Portal it to document.body.');
    assert.ok(isMember(call.arguments[1], (o) => o.type === 'Identifier' && o.name === 'document', 'body'),
      'MobileDrawer portals somewhere other than document.body — anything inside the header keeps the clip');
    const dialog = call.arguments[0];
    assert.equal(dialog.type, 'JSXElement', 'the portal no longer carries the drawer\'s markup');
    const role = jsxAttr(dialog, 'role');
    assert.equal(role && role.value && role.value.value, 'dialog', 'the portaled element is not the drawer\'s dialog');
    // What the portal exists to make true: a fixed box pinned to all four edges.
    const st = jsxStyle(dialog);
    assert.equal(st.position && st.position.value, 'fixed', 'the drawer is no longer position:fixed');
    assert.equal(st.inset && st.inset.value, 0, 'the drawer is no longer pinned to all four edges');
  }
  // The React tree is unchanged — only the DOM moved — so Header still owns it.
  const header = shellFn('Header');
  assert.equal(jsxElements(header, 'MobileDrawer').length, 1, 'Header no longer renders the drawer exactly once');
});

test('the drawer sits above the header and below the page\'s own modals', () => {
  // ⚠ THIS IS WHY THE DRAWER DOES NOT SIMPLY OUT-RANK THE CHAT LAUNCHER. The
  // launcher floats at 2147483000; a drawer raised past it would also sit above
  // ShapeConfirm and the other page modals, so the launcher steps aside instead
  // (next test). Both bounds are read from the shipped source.
  const z = (el) => { const v = jsxStyle(el).zIndex; return v && v.type === 'NumericLiteral' ? v.value : NaN; };
  const [dialog] = jsxElements(shellFn('MobileDrawer')).filter((el) => { const r = jsxAttr(el, 'role'); return r && r.value && r.value.value === 'dialog'; });
  assert.ok(dialog, 'the drawer\'s dialog is gone');
  const header = jsxElements(shellFn('Header'), 'header').find((el) => { const c = jsxAttr(el, 'className'); return c && c.value && c.value.value === 'shape-header'; });
  assert.ok(header, 'the shared <header className="shape-header"> is gone');
  const confirmFn = shellFn('shapeConfirmOpen');
  const confirmZ = Number((/z-index:\s*(\d+)/.exec(SHELL.slice(confirmFn.start, confirmFn.end)) || [])[1]);
  assert.ok(Number.isFinite(z(dialog)) && Number.isFinite(z(header)) && Number.isFinite(confirmZ),
    'could not read the three layers (drawer ' + z(dialog) + ', header ' + z(header) + ', confirm ' + confirmZ + ')');
  assert.ok(z(dialog) > z(header), 'the drawer (' + z(dialog) + ') paints under the header (' + z(header) + ') now that both live in <body>');
  assert.ok(z(dialog) < confirmZ, 'the drawer (' + z(dialog) + ') would cover ShapeConfirm (' + confirmZ + ')');
});

test('the floating chat launcher steps aside while the drawer is open', () => {
  // Measured: from 761px up the launcher mounts, and at 820 and 1000 wide it
  // covered the right-hand end of the drawer's Dashboard button. The drawer is
  // aria-modal, so nothing outside it should sit on top of it while it is open.
  const chat = readFileSync(path.join(ND, 'globalChatButton.js'), 'utf8');
  const ids = ['ID', 'PANEL_ID'].map((v) => (new RegExp('var ' + v + ' = "([^"]+)"').exec(chat) || [])[1]);
  assert.ok(ids.every(Boolean), 'could not read the launcher\'s ids from globalChatButton.js — this guard is reading nothing');

  const drawer = shellFn('MobileDrawer');
  const calls = [];
  walkAst(drawer, (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && isMember(n.callee.object, (o) => isMember(o, 'document', 'body'), 'classList')) {
      calls.push([n.callee.property.name, n.arguments[0] && n.arguments[0].value]);
    }
  });
  const toggled = calls.filter(([m]) => m === 'toggle').map(([, c]) => c);
  assert.equal(toggled.length, 1, 'the drawer sets ' + toggled.length + ' body classes — expected the one the stylesheet keys on');
  const cls = toggled[0];
  assert.ok(calls.some(([m, c]) => m === 'remove' && c === cls),
    'the drawer never removes ' + cls + ' — unmounted while open, it would leave the launcher hidden on the next page state');

  // The rule has to live in the style block Header mounts, or it is absent on
  // exactly the pages that render the drawer.
  const styles = shellFn('ShapeMobileStyles');
  assert.equal(jsxElements(shellFn('Header'), 'ShapeMobileStyles').length, 1, 'Header no longer mounts ShapeMobileStyles');
  const css = jsxElements(styles, 'style')
    .flatMap((el) => el.children).filter((c) => c.type === 'JSXExpressionContainer' && c.expression.type === 'TemplateLiteral')
    .map((c) => c.expression.quasis.map((q) => q.value.raw).join('x')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const hides = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /visibility:\s*hidden\s*!important|display:\s*none\s*!important/.test(body))
    .flatMap(([, sel]) => sel.split(',').map((s) => s.trim().replace(/\s+/g, ' ')));
  for (const id of ids) {
    assert.ok(hides.includes('body.' + cls + ' #' + id),
      'nothing hides #' + id + ' while body.' + cls + ' is set — it floats over the open drawer');
  }
});

test('the drawer\'s logo follows the paper, like the header\'s', () => {
  // The dashboards open on the light paper, where the drawer's sheet is near
  // white — a white mark there is invisible. The header and footer swap a pair
  // of <img>s on --sh-logo-dark / --sh-logo-light; the drawer takes the same
  // pair, derived from the header rather than restated.
  const pair = (fn) => jsxElements(shellFn(fn), 'img')
    .map((el) => jsxStyle(el).display).filter((v) => v && v.type === 'StringLiteral' && /^var\(--sh-logo-/.test(v.value))
    .map((v) => v.value).sort();
  const header = pair('Header');
  assert.equal(header.length, 2, 'the header\'s logo pair is no longer two paper-swapped images (' + header.join(', ') + ')');
  assert.deepEqual(pair('MobileDrawer'), header, 'the drawer\'s logo does not swap with the paper the way the header\'s does');
  // <Logo> cannot do it: its class carries `display: block !important`, which
  // beats the token. Checked, so the reason cannot quietly stop being true.
  assert.match(SHELL, /\.shape-brand-logo \{[^}]*display: block !important/, 'the logo class lost its !important display — re-check whether <Logo> could swap');
  assert.equal(jsxElements(shellFn('MobileDrawer'), 'Logo').length, 0, 'the drawer renders <Logo>, whose class pins display:block over the paper token');
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
