// The dashboard's paper switch (owner, 2026-09-21/22): the workout builder's light
// palette is the dashboard's default paper and the previous dark tones are one tap
// away, per account. Every rule below is DRIVEN against the shipped source rather
// than pinned to a spelling — a rewrite that keeps the behaviour passes, a rewrite
// that loses it fails.
//
// ⚠ tests/newdesign-paper-tokens.test.mjs owns the token layer itself (every var()
// carries its DARK fallback, both blocks declare the same set, no hex-alpha append
// reaches a token). This file owns what sits ON that layer: the first-paint stamp,
// the hook, the controls, the tour, the stylesheet's cache key and the card chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { stripComments } from './helpers/strip-comments.mjs';

const ND = new URL('../public/newdesign/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ND), 'utf8');
const DATA = read('dashData.jsx');
const CSS = read('dash.css');
// The skins, as dashData.jsx lists them: every rule below derives from this.
const SKINS = JSON.parse(/const DASH_PAPERS = (\[[^\]]*\]);/.exec(DATA)[1]);

// ⚠ The parameter list is walked by paren depth, not to the first `)`: DashShell's
// destructured params carry trailing comments with parentheses in them, and the
// shared comment stripper leaves a trailing comment on a code line alone — so
// "first `)` after the name" landed inside a comment and lifted a signature.
function lift(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone — re-anchor this guard`);
  let j = src.indexOf('(', at), pd = 0;
  for (; j < src.length; j++) { if (src[j] === '(') pd++; else if (src[j] === ')' && --pd === 0) break; }
  const open = src.indexOf('{', j);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  const body = src.slice(at, i + 1);
  assert.ok(body.length > 80, `${name} lifted only ${body.length} chars — the matcher read a signature, not a body`);
  return body;
}

// ── The first-paint stamp ─────────────────────────────────────────────────────
// A member who chose the dark paper must never see a light flash: the mirror is
// read and <html data-paper> stamped by an inline script that runs BEFORE the
// stylesheet link on every page that loads dash.css. Derived from the pages, so a
// dashboard host added later is covered the day it links the stylesheet.
test('every page that links dash.css stamps the paper before the stylesheet loads', () => {
  const pages = readdirSync(ND).filter((f) => f.endsWith('.html'));
  const hosts = pages.filter((f) => /href="dash\.css/.test(read(f)));
  assert.ok(hosts.length >= 10, `expected the dashboard hosts, found ${hosts.length}: ${hosts.join(', ')}`);
  for (const f of hosts) {
    const html = read(f);
    const link = html.indexOf('href="dash.css');
    const stamp = html.indexOf('localStorage.getItem("shape.web.paper")');
    assert.ok(stamp >= 0, `${f} links dash.css and never stamps the paper — a dark-paper member gets a light flash`);
    assert.ok(stamp < link, `${f} stamps the paper AFTER the stylesheet link`);
    const tag = html.slice(html.lastIndexOf('<script>', stamp), html.indexOf('</script>', stamp));
    assert.match(tag, /setAttribute\("data-paper",p\)/, `${f}: the stamp does not set data-paper`);
    assert.match(tag, /^<script>try\{/, `${f}: the stamp is not wrapped — a blocked localStorage would throw before the page`);
    // The stamp admits exactly the skins that are not White, so a mirror holding anything
    // else (an old value, a typo) stamps nothing and the page is White.
    const allowed = /\/\^\(([a-z|]+)\)\$\/\.test\(p\)/.exec(tag);
    assert.ok(allowed, `${f}: the stamp does not check the mirror against the skins`);
    assert.deepEqual(allowed[1].split('|').sort(), SKINS.filter((k) => k !== 'light').sort(), `${f}: the stamp's skins are not dashData.jsx's`);
    // ⚠ No global: a `var p` here would collide with a later classic script's top-level `const p`.
    assert.ok(!/\bvar\s/.test(tag), `${f}: the stamp declares a global`);
  }
  // And no page stamps a LIGHT value: light is the absence of the attribute, so a
  // page that never loads the stylesheet stays on its own (dark) paper.
  for (const f of pages) assert.ok(!/data-paper","light"/.test(read(f)), `${f} stamps a light paper — light is the default and needs no stamp`);
});

test('the light paper is the default and the dark switch is an attribute, in the stylesheet', () => {
  assert.match(CSS, /^:root \{/m, 'the :root block is gone');
  assert.match(CSS, /^html\[data-paper="dark"\] \{/m, 'the dark switch is not keyed on <html data-paper="dark">');
  assert.deepEqual(SKINS, ['light', 'bone', 'dark', 'carbon', 'night', 'glass'], 'the six skins (owner, 2026-10-27) changed');
  for (const k of SKINS.filter((x) => x !== 'light')) assert.match(CSS, new RegExp(`^html\\[data-paper="${k}"\\] \\{`, 'm'), `${k} has no block in dash.css`);
  assert.ok(!/data-paper="light"/.test(CSS), 'a light selector would make the default depend on a stamp');
  const root = /:root \{([\s\S]*?)\n\}/.exec(CSS)[1];
  assert.match(root, /--sh-ground: #f4f6f5;/, 'the light ground is not the builder\'s');
  assert.match(root, /--sh-card: #ffffff;/, 'the light card is not white');
  assert.match(root, /--sh-ink: #15211e;/, 'the light ink is not the builder\'s');
  assert.ok(!/color-scheme/.test(CSS), 'color-scheme would restyle native controls and scrollbars on the dark switch — measured, it turned every unstyled Retry button grey');
});

// ── The hook and the device mirror ────────────────────────────────────────────
function stubDom() {
  const attrs = {};
  const events = [];
  const storage = new Map();
  const sandbox = {
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, getAttribute: (k) => (k in attrs ? attrs[k] : null) } },
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    window: { dispatchEvent: (e) => { events.push(e); return true; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  };
  return { sandbox, attrs, events, storage };
}
// A one-line function (dashPaperKey) has no body for `lift`'s 80-character floor to find,
// so a function is taken whole from its line when it ends there.
function liftLine(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone — re-anchor this guard`);
  const eol = src.indexOf('\n', at);
  const line = src.slice(at, eol);
  return /\}\s*$/.test(line) && (line.match(/\{/g) || []).length === (line.match(/\}/g) || []).length ? line : lift(src, name);
}
function paperFns(sandbox) {
  const src = ['DASH_PAPERS', 'DASH_PAPER_LIGHT', 'DASH_PAPER_MIRROR', 'DASH_PAPER_EVENT'].map((n) => { const m = new RegExp(`const ${n} = .*;`).exec(DATA); assert.ok(m, `${n} is gone`); return m[0]; }).join('\n')
    + '\n' + ['dashPaperKey', 'dashPaperMode', 'dashResolvePaper', 'dashReadPaperMirror', 'dashApplyPaper'].map((n) => liftLine(DATA, n)).join('\n')
    + '\nthis.__fns = { dashPaperKey, dashPaperMode, dashResolvePaper, dashReadPaperMirror, dashApplyPaper };';
  vm.runInNewContext(src, sandbox);
  return sandbox.__fns;
}

test('dashApplyPaper stamps the page, mirrors the device and tells every mount, in both directions', () => {
  const { sandbox, attrs, events, storage } = stubDom();
  const { dashApplyPaper, dashReadPaperMirror } = paperFns(sandbox);
  assert.equal(dashReadPaperMirror(), 'light', 'an empty mirror is the light default');
  assert.equal(dashApplyPaper('dark'), 'dark');
  assert.equal(attrs['data-paper'], 'dark', 'the attribute the stylesheet keys on');
  assert.equal(storage.get('shape.web.paper'), 'dark', 'the mirror the first-paint stamp reads');
  assert.equal(dashReadPaperMirror(), 'dark');
  assert.equal(events.at(-1).type, 'shape:paper'); assert.equal(events.at(-1).detail, 'dark');
  assert.equal(dashApplyPaper('light'), 'light');
  assert.equal(attrs['data-paper'], undefined, 'light REMOVES the attribute — it is the absence, not a second value');
  assert.equal(storage.has('shape.web.paper'), false, 'light clears the mirror rather than storing a second value');
  assert.equal(events.at(-1).detail, 'light');
  // Every other skin round-trips the same way.
  for (const k of SKINS.filter((x) => x !== 'light')) {
    assert.equal(dashApplyPaper(k), k);
    assert.equal(attrs['data-paper'], k, `${k} is not stamped`);
    assert.equal(storage.get('shape.web.paper'), k, `${k} is not mirrored`);
    assert.equal(dashReadPaperMirror(), k);
    assert.equal(events.at(-1).detail, k);
  }
  // Anything that is not a skin is White — a corrupted mirror cannot invent a seventh paper.
  storage.set('shape.web.paper', 'sepia');
  assert.equal(dashReadPaperMirror(), 'light');
  assert.equal(dashApplyPaper('sepia'), 'light');
  assert.equal(attrs['data-paper'], undefined);
});

test('a skin applies only while its own light or dark is the one the app shares', () => {
  const { sandbox } = stubDom();
  const { dashPaperMode, dashResolvePaper } = paperFns(sandbox);
  assert.deepEqual(SKINS.map(dashPaperMode), ['light', 'light', 'dark', 'dark', 'dark', 'dark']);
  // The skin itself, while it agrees with colorMode (or there is no colorMode yet).
  for (const k of SKINS) { assert.equal(dashResolvePaper(k, dashPaperMode(k)), k); assert.equal(dashResolvePaper(k, undefined), k); }
  // The app turned light under Carbon: White, and Carbon again once it is dark.
  assert.equal(dashResolvePaper('carbon', 'light'), 'light');
  assert.equal(dashResolvePaper('carbon', 'dark'), 'carbon');
  assert.equal(dashResolvePaper('bone', 'dark'), 'dark', 'the app turned dark under Bone: Black');
  // No skin, or one this build does not know: the mode's plain paper.
  assert.equal(dashResolvePaper(undefined, 'dark'), 'dark');
  assert.equal(dashResolvePaper('sepia', 'light'), 'light');
  assert.equal(dashResolvePaper(null, null), 'light');
});

test('a blocked localStorage cannot break the paper', () => {
  const { sandbox, attrs } = stubDom();
  sandbox.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const { dashApplyPaper, dashReadPaperMirror } = paperFns(sandbox);
  assert.equal(dashReadPaperMirror(), 'light');
  assert.equal(dashApplyPaper('dark'), 'dark');
  assert.equal(attrs['data-paper'], 'dark', 'the page still stamps when the mirror cannot be written');
});

test('useDashPaper rides the account\'s shared app_tweaks document and only a READ document corrects the mirror', () => {
  const hook = lift(DATA, 'useDashPaper');
  assert.match(hook, /useRememberedChoices\(true\)/, 'the hook must open the per-account preference store');
  assert.match(hook, /useRememberedChoice\(store, "colorMode", DASH_PAPER_MODES, fallback, true\)/, 'the shared choice is validated against light/dark, with legacy and app-theme fallback');
  assert.match(DATA, /const DASH_PAPER_MODES = \["light", "dark"\];/, 'colorMode would accept a skin the app cannot read');
  assert.match(hook, /useRememberedChoice\(store, "webPaper", DASH_PAPERS, null, true\)/, 'the skin is not its own key, validated against the skins');
  assert.match(hook, /dashResolvePaper\(rememberedSkin, remembered\)/, 'the read document does not resolve the skin against the shared mode');
  assert.match(hook, /dashResolvePaper\(doc\.webPaper, mode\)/, 'the focus re-read does not resolve the skin against the shared mode');
  assert.match(hook, /useCoachDoc\("app_tweaks", accountId != null, accountId\)/, 'appearance must use the app account record');
  // The device mirror is corrected only by a document that was READ. "signedout",
  // "demo" and "unavailable" leave it standing — an absent read is not a preference.
  assert.match(hook, /if \(kind !== "ready" \|\| sessionChose\) return;/, 'the correction must wait for a read document and defer to a choice made this session');
  // The session's choice is bound to the account that made it.
  assert.match(DATA, /let dashPaperSession = null;/, 'the session choice is not held at module scope');
  assert.match(hook, /dashPaperSession = \{ acct, paper: p \}/, 'the session choice does not carry its account');
  assert.match(hook, /dashPaperSession\.acct === acct/, 'a choice made under another account would be honoured');
  // Choosing writes the document, the page and the device in one call.
  const choose = /const setPaperChoice = React\.useCallback\(\(next\) => \{([\s\S]*?)\}, \[choose, chooseSkin, acct\]\);/.exec(hook);
  assert.ok(choose, 'setPaperChoice moved');
  for (const need of ['choose(dashPaperMode(p))', 'chooseSkin(p)', 'dashApplyPaper(p)', 'setPaper(p)']) assert.ok(choose[1].includes(need), `setPaperChoice no longer calls ${need}`);
  // And it is exported as a bare global like the store hooks.
  const exp = /Object\.assign\(window, \{([^}]*)\}\);/.exec(DATA);
  assert.ok(exp && /\buseDashPaper\b/.test(exp[1]), 'useDashPaper is not exported');
});

// ── The mounts ────────────────────────────────────────────────────────────────
test('every shell page and both Settings pages mount the paper hook behind a typeof guard', () => {
  const sites = [
    ['trainerDashboard.jsx', 'DashPage'], ['trainerDashboard.jsx', 'DashShell'], ['dashClient.jsx', 'ClientDashboardPage'],
    ['coachSettings.jsx', 'CoachSettingsPage'], ['clientMeSettings.jsx', 'ClientMeSettings'],
  ];
  for (const [f, fn] of sites) {
    const body = lift(stripComments(read(f)), fn);
    assert.match(body, /typeof useDashPaper === "function"/, `${f}: ${fn} calls useDashPaper without the typeof guard — dashData.jsx loads AFTER this module (and never on the print page)`);
    assert.match(body, /useDashPaper\(\)/, `${f}: ${fn} no longer mounts the paper hook`);
    // The guard and the call sit on ONE line, which is what the load-order guard in
    // tests/dashboard-remembered-choices.test.mjs reads as a render-time read.
    const line = body.split('\n').find((l) => l.includes('useDashPaper()'));
    assert.ok(line && line.includes('typeof useDashPaper === "function"'), `${f}: the typeof guard must be on the same line as the call`);
  }
});

test('both Settings pages carry the skin picker, wired to the hook\'s setter', () => {
  const coach = stripComments(read('coachSettings.jsx'));
  assert.match(coach, /Appearance/, 'the coach Settings page lost its Appearance card');
  assert.match(coach, /<DashPaperPicker value=\{paperCtl\[0\]\} onChoose=\{paperCtl\[1\]\} \/>/, 'the coach page does not hand the picker the hook');
  const client = stripComments(read('clientMeSettings.jsx'));
  assert.match(client, /<SectionTitle>Appearance<\/SectionTitle>/, 'the client Settings page lost its Appearance card');
  assert.match(client, /<DashPaperPicker value=\{paperCtl\[0\]\} onChoose=\{paperCtl\[1\]\} \/>/, 'the client page does not hand the picker the hook');
  for (const [f, src] of [['coachSettings.jsx', coach], ['clientMeSettings.jsx', client]]) {
    assert.match(src, /typeof DashPaperPicker === "function" && <DashPaperPicker/, `${f}: the picker is not guarded — it is another file's global`);
  }
  // The picker: a radio per skin, checked on the current one, choosing through the setter,
  // and off without one.
  const picker = lift(stripComments(read('trainerDashboard.jsx')), 'DashPaperPicker');
  assert.match(picker, /typeof DASH_PAPER_OPTS !== "undefined"/, 'the picker reads the skins without a guard');
  assert.match(picker, /role="radiogroup"/);
  assert.match(picker, /role="radio" aria-checked=\{on\}/);
  assert.match(picker, /const on = value === key;/);
  assert.match(picker, /disabled=\{!onChoose\}/, 'the tiles stay live with no setter');
  assert.match(picker, /onClick=\{\(\) => onChoose && onChoose\(key\)\}/, 'a tile does not choose through the setter');
  const exp = /Object\.assign\(window, \{([^}]*)\}\);/.exec(read('trainerDashboard.jsx'));
  assert.ok(exp && /\bDashPaperPicker\b/.test(exp[1]), 'DashPaperPicker is not exported');
});

test('the picker\'s tiles are the skins, in each skin\'s own colours', () => {
  const opts = JSON.parse(/const DASH_PAPER_OPTS = (\[[\s\S]*?\n\]);/.exec(DATA)[1].replace(/,(\s*\])/g, '$1'));
  assert.deepEqual(opts.map((o) => o[0]), SKINS, 'a skin has no tile, or a tile no skin');
  const block = (k) => {
    const open = k === 'light' ? ':root {' : `html[data-paper="${k}"] {`;
    const a = CSS.indexOf(open); const b = CSS.indexOf('\n}', a);
    return new Map([...CSS.slice(a, b).matchAll(/^\s*(--sh-[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));
  };
  for (const [key, , , ground, card, ink, accent] of opts) {
    const b = block(key);
    assert.equal(ground, b.get('--sh-ground'), `${key}: the tile's ground is not the skin's`);
    assert.equal(ink, b.get('--sh-ink'), `${key}: the tile's ink is not the skin's`);
    assert.equal(accent, b.get('--sh-accent'), `${key}: the tile's accent is not the skin's`);
    // Glass's card is see-through on the page; its tile shows it a shade stronger, so the
    // pane reads on a 62px swatch.
    if (key !== 'glass') assert.equal(card, b.get('--sh-card'), `${key}: the tile's card is not the skin's`);
    else assert.match(card, /^rgba\(255,255,255,0\.\d+\)$/);
  }
});

// ── The tour, the chrome, the cache key ───────────────────────────────────────
test('the spotlight tour reads the paper instead of assuming dark', () => {
  const tour = stripComments(read('dashTour.js'));
  const darkList = /return \[([^\]]*)\]\.indexOf\(document\.documentElement\.getAttribute\('data-paper'\)\) >= 0;/.exec(tour);
  assert.ok(darkList, 'dashTour.js no longer reads the paper');
  assert.deepEqual(darkList[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort(), ['carbon', 'dark', 'glass', 'night'], 'the tour does not know which skins are dark');
  assert.match(tour, /isLight: !dark/, 'the tour card is pinned to one paper');
  assert.ok(!/isLight: false/.test(tour), 'the tour is hardcoded dark again');
  const engine = read('spotlightTour.js');
  assert.match(engine, /const onAccent = opts\.isLight \? '#ffffff' : '#06231f';/, 'the Next button\'s label colour must follow the accent it sits on');
  // The light tour accents are the stylesheet's own light TEXT tokens — derived, not
  // typed, so the tour cannot drift from the paper it sits on (it read the builder's
  // #0a8f87 at 3.97:1 on the card until the text tokens moved to AA).
  const root = /:root \{([\s\S]*?)\n\}/.exec(CSS)[1];
  const lightOf = (tok) => new RegExp('\\s' + tok + ':\\s*(#[0-9a-f]{6});').exec(root)[1];
  const light = /ACCENT_LIGHT = \{ client: '(#[0-9a-f]{6})', trainer: '(#[0-9a-f]{6})', nutritionist: '(#[0-9a-f]{6})' \}/.exec(tour);
  assert.ok(light, 'ACCENT_LIGHT moved — re-derive it');
  assert.equal(light[1], lightOf('--sh-accent'), 'the client tour accent is not the light paper\'s text teal');
  assert.equal(light[2], lightOf('--sh-accent'), 'the trainer tour accent is not the light paper\'s text teal');
  assert.equal(light[3], lightOf('--sh-gold'), 'the nutritionist tour accent is not the light paper\'s text gold');
});

test('the card chrome is the builder\'s: one hairline, a 12px radius, no chamfer, no tick, no bracket', () => {
  const plate = /^\.dash-plate \{([^}]*)\}/m.exec(CSS); // the base rule, not a skin's override
  assert.ok(plate, '.dash-plate is gone');
  assert.match(plate[1], /background:var\(--sh-card, #25211d\)/);
  assert.match(plate[1], /border:1px solid var\(--sh-line, #302c27\)/);
  assert.match(plate[1], /border-radius:12px/);
  assert.ok(!/clip-path/.test(plate[1]), 'the chamfer is back');
  assert.ok(!/border-left:3px/.test(plate[1]), 'the accent spine is back');
  assert.match(CSS, /\.dash-plate--tick::before \{ content:none; \}/, 'the ticking corner is back');
  assert.match(CSS, /\.dash-plate--bracket::after \{ content:none; \}/, 'the corner bracket is back');
  // The shared Card primitive agrees with the stylesheet (two spellings of one card
  // is how the dashboard drifts from itself).
  const card = lift(stripComments(read('trainerDashboard.jsx')), 'Card');
  assert.match(card, /background: "var\(--sh-card, #25211d\)"/);
  assert.match(card, /border: "1px solid var\(--sh-line, #302c27\)"/);
  assert.match(card, /borderRadius: 12,/);
  assert.ok(!/backdropFilter/.test(card), 'the glass blur is back on Card');
});

test('the shared header and footer swap the logo lockup with the paper', () => {
  const shell = stripComments(read('pageShell.jsx'));
  for (const which of ['header', 'footer']) {
    const seg = which === 'header' ? shell.slice(shell.indexOf('<header className="shape-header"'), shell.indexOf('</header>')) : shell.slice(shell.indexOf('<footer className="shape-footer"'), shell.indexOf('</footer>'));
    assert.match(seg, /shape-logo-nav-black\.png"[^>]*display: "var\(--sh-logo-light, none\)"/, `${which}: the black lockup is not gated on the light paper`);
    assert.match(seg, /display: "var\(--sh-logo-dark, block\)"/, `${which}: the white lockup is not gated on the dark paper`);
  }
  const root = /:root \{([\s\S]*?)\n\}/.exec(CSS)[1];
  assert.match(root, /--sh-logo-light: block;/); assert.match(root, /--sh-logo-dark: none;/);
  const dark = /html\[data-paper="dark"\] \{([\s\S]*?)\n\}/.exec(CSS)[1];
  assert.match(dark, /--sh-logo-light: none;/); assert.match(dark, /--sh-logo-dark: block;/);
});

test('the precompile content-hashes the stylesheet link, so a token change busts every dashboard page\'s cache', () => {
  const build = readFileSync(new URL('../scripts/build-newdesign.mjs', import.meta.url), 'utf8');
  assert.match(build, /const DASH_CSS_V = fs\.existsSync\(DASH_CSS_SRC\) \? hash8\(fs\.readFileSync\(DASH_CSS_SRC, 'utf8'\)\) : '';/, 'dash.css is no longer hashed');
  assert.match(build, /throw new Error\('build-newdesign: public\/newdesign\/dash\.css is missing/, 'a missing stylesheet must fail the build, not ship unhashed links');
  assert.match(build, /next = next\.replace\(DASH_CSS_LINK, `href="dash\.css\?v=\$\{DASH_CSS_V\}"`\)/, 'the link rewrite is gone');
  // The pages themselves carry a plain link the rewrite can match.
  const pages = readdirSync(ND).filter((f) => f.endsWith('.html') && /href="dash\.css/.test(read(f)));
  for (const f of pages) assert.match(read(f), /href="dash\.css(\?v=[^"]*)?"/, `${f}: the dash.css link is spelled in a way the precompile cannot rewrite`);
});

// ── Glass and Night, the two skins that need more than tokens ─────────────────
test('Glass blurs only what floats, and never a fixed panel or an in-flow card', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const glass = rules.filter((r) => r.sel.includes('html[data-paper="glass"]'));
  assert.ok(glass.length >= 5, `read ${glass.length} Glass rules — the sweep stopped matching`);
  // The ground is lit and the frame lets it through.
  assert.ok(glass.some((r) => /^html\[data-paper="glass"\]$/.test(r.sel) && /background-image:[^;]*radial-gradient/.test(r.body) && /background-attachment:\s*fixed/.test(r.body)), 'the lit ground is gone');
  assert.ok(glass.some((r) => r.sel.includes('.dash-app') && /background:\s*transparent !important/.test(r.body)), 'the frame paints over the lit ground');
  // A floating panel painted with the card is near-opaque, so rows under it do not read through.
  const floating = glass.find((r) => r.sel.includes('[style*="position: absolute"]') && r.sel.includes('[style*="position: sticky"]') && r.sel.includes('[style*="var(--sh-card,"]'));
  assert.ok(floating && /background-color:\s*rgba\([^)]*0\.8\d\) !important/.test(floating.body), 'a floating card panel is see-through');
  const fixed = glass.find((r) => r.sel.includes('[style*="position: fixed"]'));
  assert.ok(fixed && /background-color:/.test(fixed.body), 'a fixed card panel is see-through');
  assert.ok(glass.some((r) => r.sel.includes('.dash-rail-panel') && /backdrop-filter/.test(r.body)), 'the rail widens over the page see-through');
  // ⚠ backdrop-filter makes an element the containing block of its position:fixed children,
  // and the dashboard draws its overlays inline: a blurred card or fixed panel would trap them.
  for (const r of glass.filter((x) => /backdrop-filter/.test(x.body))) {
    assert.ok(!/position: fixed|\.dash-plate|\.dash-app\b|body/.test(r.sel), `Glass blurs ${r.sel}`);
  }
});

test('Night repaints the fixed teal the tokens cannot reach', () => {
  for (const sel of ['#shape-global-chat-button', '.dash-demo-band']) {
    assert.ok(new RegExp(`html\\[data-paper="night"\\] ${sel.replace(/[.#-]/g, (c) => '\\' + c)}\\s*\\{[^}]*#f2a03d`).test(CSS), `${sel} keeps its teal on Night`);
  }
  assert.match(read('dashToday.jsx'), /<div className="dash-demo-band" style=/, 'the demo band lost the class Night repaints it by');
});
