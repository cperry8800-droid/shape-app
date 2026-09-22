import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// The dashboard's colours read paper tokens (`--sh-*`, declared in
// `public/newdesign/dash.css`) so the whole surface can be re-papered from one
// place. Three invariants hold that up, and each one below is a defect that was
// actually hit or could not have been seen:
//
//   1. A TOKENISED CONSTANT MAY NOT CARRY A HEX-ALPHA SUFFIX.
//      `INK` used to be the string `#f2ede4`, so `${INK}40` produced the 8-digit
//      hex `#f2ede440`. The moment `INK` became `var(--sh-ink, #f2ede4)` that
//      same expression produced `var(--sh-ink, #f2ede4)40`, which is not a
//      colour — so CSS dropped the WHOLE declaration and the Team page's
//      "Browse coaches" button lost its border with nothing failing anywhere.
//      ⚠ AND THE TRAP HAS TWO SPELLINGS. A sweep for the template form
//      (`${INK}40`) found six sites and left five more written as concatenation
//      (`INK + "8c"`), which the pixel diff then caught on one line of text.
//      Both are checked here, because checking one spelling of a class is how
//      the other half ships.
//
//   2. EVERY `var(--sh-*)` REFERENCE MUST CARRY ITS OWN FALLBACK.
//      `pageShell.jsx` renders the shared header and footer on ~69 pages while
//      `dash.css` is loaded by ~34 of them. On the rest the tokens are ABSENT,
//      so the fallback is the only value there is — a bare `var(--sh-ink)` on a
//      marketing page is no colour at all.
//
//   3. EVERY `--sh-*` REFERENCED MUST BE DECLARED.
//      A misspelled token name is invisible: the fallback renders, every page
//      looks right, and the value simply never moves when the paper changes.
//      That is the same shape as a `font-variation-settings` axis nobody
//      requested — not an error in any browser, linter or build, just a feature
//      that quietly does nothing. Only comparing the two sets finds it.

const ND = 'public/newdesign';
const files = readdirSync(ND).filter(f => /\.(jsx|js|css|mjs)$/.test(f));
const src = new Map(files.map(f => [f, readFileSync(join(ND, f), 'utf8')]));

// Comment spans, so a colour quoted in prose is never read as code.
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
          .replace(/(?<=^|[^:])\/\/[^\n]*/g, m => ' '.repeat(m.length));
}
const code = new Map([...src].map(([f, s]) => [f, stripComments(s)]));

test('no tokenised colour constant carries a hex-alpha suffix', () => {
  // Derived, not enumerated: a constant is "tokenised" because its VALUE is a
  // var(), which is the property that makes the suffix invalid. Naming today's
  // constants would go stale the first time another one is tokenised.
  const tokenised = new Set();
  for (const [, s] of code) {
    for (const m of s.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]([^"'`]*var\(--[^"'`]*)["'`]/g)) {
      tokenised.add(m[1]);
    }
  }
  // Aliases: `const X = Y;` where Y is already tokenised. One pass is enough for
  // the shapes in this tree; a longer chain would need a fixpoint.
  for (const [, s] of code) {
    for (const m of s.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*[;,\n]/g)) {
      if (tokenised.has(m[2])) tokenised.add(m[1]);
    }
  }
  assert.ok(tokenised.size >= 5,
    `expected several var()-valued colour constants, found ${tokenised.size} — this sweep has stopped matching`);

  const offenders = [];
  for (const [f, s] of code) {
    // Spelling A — template interpolation: `${INK}40`
    for (const m of s.matchAll(/\$\{\s*([A-Za-z_$][\w$.]*)\s*\}([0-9a-fA-F]{2})(?![0-9a-fA-F])/g)) {
      if (tokenised.has(m[1])) offenders.push(`${f}: \${${m[1]}}${m[2]}`);
    }
    // Spelling B — concatenation: `INK + "8c"`
    for (const m of s.matchAll(/\b([A-Za-z_$][\w$]*)\s*\+\s*["']([0-9a-fA-F]{2})["']/g)) {
      if (tokenised.has(m[1])) offenders.push(`${f}: ${m[1]} + "${m[2]}"`);
    }
  }
  assert.deepEqual(offenders, [],
    'a var()-valued constant cannot take a hex-alpha suffix — CSS drops the whole declaration. ' +
    'Write rgba(var(--<token>-rgb, r,g,b), a) instead, with a = 0xHH/255:\n  ' + offenders.join('\n  '));
});

test('the suffix sweep can actually fire, in both spellings', () => {
  // Guard-the-guard: a pattern that has stopped matching reports a clean sweep
  // forever. Each spelling is proven against the exact text it exists to catch.
  const tpl = /\$\{\s*([A-Za-z_$][\w$.]*)\s*\}([0-9a-fA-F]{2})(?![0-9a-fA-F])/g;
  const cat = /\b([A-Za-z_$][\w$]*)\s*\+\s*["']([0-9a-fA-F]{2})["']/g;
  assert.equal([...'border: `1px solid ${INK}40`'.matchAll(tpl)].length, 1, 'template spelling not matched');
  assert.equal([...'const A = INK + "8c";'.matchAll(cat)].length, 1, 'concatenation spelling not matched');
  // And it must not fire on a legitimate 6-digit hex or a longer suffix.
  assert.equal([...'color: `${INK}`'.matchAll(tpl)].length, 0, 'fires with no suffix');
  assert.equal([...'const A = INK + "8c1f2e";'.matchAll(cat)].length, 0, 'fires on a longer string');
});

test('every var(--sh-*) reference carries a fallback', () => {
  const bare = [];
  for (const [f, s] of code) {
    for (const m of s.matchAll(/var\(\s*(--sh-[\w-]+)\s*([,)])/g)) {
      if (m[2] === ')') bare.push(`${f}: var(${m[1]})`);
    }
  }
  assert.deepEqual(bare, [],
    'pageShell.jsx renders on ~69 pages and dash.css loads on ~34 — where the tokens are absent ' +
    'the fallback is the only value there is, so a bare var() is no colour at all:\n  ' + bare.join('\n  '));
});

// ⚠ THE FALLBACK IS WHAT MAKES THE WHOLE LAYER A RENDER NO-OP, AND THIS IS THE ONLY
// THING THAT SAYS SO. Every use site is `var(--sh-x, <today's literal>)`, so on the
// ~39 pages that never load dash.css the fallback IS the colour, and on the rest the
// declaration and the fallback agree — which is why swapping 676 literals for tokens
// could be shipped without a single pixel moving. A fallback that drifts from its own
// token is the one edit that breaks that property, and it breaks it INVISIBLY: the
// page that loads dash.css renders one colour and the page that does not renders
// another, with nothing failing anywhere. Measured on this tree: 676 sites over 20
// tokens, 0 mismatches.
// ⚠ TWO PAPERS, AND THE FALLBACK IS THE DARK ONE. `:root` carries the light paper
// (the default) and `html[data-paper="dark"]` carries the values the dashboard
// shipped with. A use site's fallback is the colour on a page that never loads
// dash.css — the marketing pages, which stay dark — so it must equal the DARK
// block's declaration, never the :root one. Comparing against :root would demand
// `var(--sh-ink, #15211e)` everywhere and turn the marketing header light.
function paperBlocks() {
  const css = src.get('dash.css');
  assert.ok(css, 'dash.css missing');
  const block = (open) => {
    const a = css.indexOf(open);
    assert.ok(a >= 0, `dash.css has no ${open.trim()} block`);
    const b = css.indexOf('\n}', a);
    return css.slice(a, b);
  };
  const parse = (s) => new Map([...s.matchAll(/^\s*(--sh-[\w-]+)\s*:\s*([^;]+);/gm)].map(m => [m[1], m[2].trim()]));
  return { light: parse(block(':root {')), dark: parse(block('html[data-paper="dark"] {')) };
}
// The font tokens are not paper-dependent: they are declared once, on :root, and
// their fallback is the face the shared header keeps on the pages that do not load
// dash.css. Pinned here because no block declares that legacy value.
const LEGACY_FALLBACK = {
  '--sh-font-display': "'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif",
  '--sh-font-body': "'Space Grotesk', 'Space Grotesk Fallback', sans-serif",
  '--sh-font-mono': "'JetBrains Mono', 'JetBrains Mono Fallback', monospace",
};

test("every var(--sh-*) fallback is its own token's DARK-paper value", () => {
  const { light, dark } = paperBlocks();
  assert.ok(dark.size >= 15,
    `expected the dark paper block in dash.css, found ${dark.size} declarations`);
  const declared = new Map(dark);
  for (const [k, v] of Object.entries(LEGACY_FALLBACK)) {
    assert.ok(light.has(k), `${k} is not declared on :root`);
    assert.ok(!dark.has(k), `${k} is declared in the dark block — the fonts are not paper-dependent`);
    declared.set(k, v);
  }

  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, '');
  let sites = 0;
  const drift = [];
  for (const [f, s] of code) {
    // The fallback may carry ONE level of parentheses (an rgba() value — the header
    // bar's translucent ground) and never a nested var(): a fallback that is itself a
    // token is a second thing that can fail to resolve.
    for (const m of s.matchAll(/var\(\s*(--sh-[\w-]+)\s*,\s*((?:[^()]|\([^()]*\))*?)\s*\)/g)) {
      if (/var\(/.test(m[2])) { drift.push(`${f}: var(${m[1]}, ${m[2]}) — a fallback may not be a token`); continue; }
      sites++;
      const want = declared.get(m[1]);
      if (want === undefined) continue;   // the sibling test owns undeclared tokens
      if (norm(want) !== norm(m[2])) drift.push(`${f}: var(${m[1]}, ${m[2]}) but dash.css declares ${want}`);
    }
  }
  // ⚠ Not decoration: measured, breaking the collector's regex AND removing this floor
  // together goes GREEN, so the floor is the only thing between a dead sweep and a
  // passing suite. Its own deletion survives, because a floor is a no-op while the
  // read still matches — which is why it is proven by a read that has stopped.
  assert.ok(sites >= 400,
    `expected the tokenised use sites, found ${sites} — this sweep has stopped matching`);
  assert.deepEqual(drift, [],
    'a fallback that disagrees with its own token renders one colour on the ~34 pages that load ' +
    'dash.css and a different one on the ~39 that do not, with nothing failing on either. The ' +
    'fallback is today\'s value; change the paper by changing the DECLARATION:\n  ' + drift.join('\n  '));
});

// ⚠ A TOKEN THAT REFERENCES ITSELF IS DECLARED AND INERT, WHICH THE TEST ABOVE
// CANNOT SEE. `--sh-ground: var(--sh-ground, #1a1612)` is a CYCLE, and a cyclic
// custom property is invalid at computed-value time — measured in Chromium,
// getComputedStyle(root)['--sh-ground'] came back "" while a plain declaration of
// the same value came back "#1a1612". It is invisible because every use site
// carries its own fallback (the test two above enforces exactly that), so the
// page renders correctly off the fallback and the token silently never moves when
// the paper changes — which is the one thing the token layer exists to do.
// It shipped on 13 of the 19 declarations: the sweep rewrote the hex literals in
// dash.css including inside the :root block it had just written.
test('no --sh-* token is declared as a reference to itself', () => {
  const css = src.get('dash.css');
  assert.ok(css, 'dash.css missing');

  const decls = [...css.matchAll(/^\s*(--sh-[\w-]+)\s*:\s*([^;]+);/gm)].map(m => [m[1], m[2].trim()]);
  assert.ok(decls.length >= 15,
    `expected the paper token block in dash.css, found ${decls.length} declarations — this sweep has stopped matching`);

  // Direct self-reference, and the indirect cycles it generalises to: a token whose
  // value walks back to itself through any chain of other --sh-* tokens is equally inert.
  const edges = new Map(decls.map(([n, v]) => [n, [...v.matchAll(/var\(\s*(--sh-[\w-]+)/g)].map(m => m[1])]));
  const cyclic = [];
  for (const [start] of decls) {
    const seen = new Set(), stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      for (const next of edges.get(cur) || []) {
        if (next === start) { cyclic.push(start); stack.length = 0; break; }
        if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
  }
  assert.deepEqual([...new Set(cyclic)], [],
    'a custom property that references itself is cyclic, so it computes to the guaranteed-invalid ' +
    'value and declares NOTHING — every use site then silently falls through to its own literal ' +
    'fallback, which renders correctly today and can never follow a paper change. Declare the ' +
    'value plainly (`--sh-ink: #f2ede4;`):\n  ' + [...new Set(cyclic)].join('\n  '));
});

test('every --sh-* token referenced is declared in dash.css', () => {
  const css = src.get('dash.css');
  assert.ok(css, 'dash.css missing');
  const declared = new Set([...css.matchAll(/^\s*(--sh-[\w-]+)\s*:/gm)].map(m => m[1]));
  assert.ok(declared.size >= 15,
    `expected the paper token block in dash.css, found ${declared.size} declarations`);

  const referenced = new Set();
  for (const [, s] of code) {
    for (const m of s.matchAll(/var\(\s*(--sh-[\w-]+)/g)) referenced.add(m[1]);
  }
  assert.ok(referenced.size >= 10,
    `expected the dashboard to read the tokens, found ${referenced.size} references — this sweep has stopped matching`);

  // ⚠ ssAlpha (pageShell.jsx) and cwHexA (chatWidget.jsx) SYNTHESIZE a twin name
  // (`${token}-rgb`) at runtime, so that reference never appears literally in source
  // and the sweep above is structurally blind to it. A token handed to one of them
  // with no declared twin still RENDERS — the var() falls back to the triplet, which
  // is derived from the token's own literal — but it can never follow a paper change,
  // which is the one thing the layer exists to do. Reachable today: SS_TIERS' 750-point
  // rung is var(--sh-gold, #d8a23a), which arrives at ssAlpha via ssTierColor → SsFacet.
  // Rather than chase which tokens reach which helper, every colour token declares a
  // twin — then synthesis is sound whatever it is handed. A COLOUR token is one whose
  // value is a hex literal: the header's rgba() ground, the logo display switches and
  // the font stacks are tokens too, and none of them can reach an alpha helper.
  const { light, dark } = paperBlocks();
  const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim());
  const colour = [...declared].filter(t => !t.endsWith('-rgb') && (isHex(light.get(t)) || isHex(dark.get(t))));
  assert.ok(colour.length >= 10,
    `expected the paper colour tokens, found ${colour.length} — this sweep has stopped matching`);
  const noTwin = colour.filter(t => !declared.has(`${t}-rgb`)).sort();
  assert.deepEqual(noTwin, [],
    'a colour token with no -rgb twin is unsound for the alpha helpers, which synthesize ' +
    '`${token}-rgb` at runtime: the alpha renders off the fallback and silently stops ' +
    'following the paper. Declare the twin beside the token:\n  ' + noTwin.join('\n  '));

  // And a twin that disagrees with its own token is worse than a missing one — the
  // colour would then depend on whether dash.css happened to load. Checked on BOTH
  // papers: a twin right on the dark block and wrong on :root is a light-paper alpha
  // that follows a different hue than its solid.
  const drift = [];
  for (const [paper, decl] of [['light', light], ['dark', dark]]) {
    for (const t of colour) {
      const hex = decl.get(t), twin = decl.get(`${t}-rgb`);
      if (!isHex(hex) || !twin) continue;
      const n = parseInt(hex.slice(1), 16);
      const want = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
      if (twin.replace(/\s/g, '') !== want) drift.push(`${paper}: ${t}: ${hex} but ${t}-rgb is ${twin} (expected ${want})`);
    }
  }
  assert.deepEqual(drift, [],
    'a -rgb twin must be its own token\'s channels, or the alpha and the solid render ' +
    'different colours:\n  ' + drift.join('\n  '));

  // ⚠ AND THE TWO PAPERS DECLARE THE SAME SET. A token on :root with no dark twin is a
  // colour the dark switch leaves on the light paper — a white card on the dark ground
  // — and one only in the dark block is a colour the default paper never gets. The
  // fonts are the one deliberate exception (declared once, not paper-dependent).
  const notPaper = new Set(Object.keys(LEGACY_FALLBACK));
  const onlyLight = [...light.keys()].filter(t => !dark.has(t) && !notPaper.has(t)).sort();
  const onlyDark = [...dark.keys()].filter(t => !light.has(t)).sort();
  assert.deepEqual({ onlyLight, onlyDark }, { onlyLight: [], onlyDark: [] },
    'every paper token is declared on BOTH :root (light) and html[data-paper="dark"], or the switch leaves it behind');

  const undeclared = [...referenced].filter(t => !declared.has(t)).sort();
  assert.deepEqual(undeclared, [],
    'a referenced-but-undeclared token is invisible — the fallback renders, so every page looks ' +
    'right and the value simply never moves when the paper changes:\n  ' + undeclared.join('\n  '));
});

// The one region of a swept file that is deliberately OUTSIDE the paper system:
// the cookie-consent banner. It is injected on ~69 pages with its own
// `--consent-*` namespace because it once borrowed generic palette tokens and a
// page that defined one of them drew the disclosure at 1.11:1 while Accept stayed
// legible. See tests/consent-banner-contrast.test.mjs, which is the guard that
// caught the sweep reaching in here.
function consentRegion(s) {
  const a = s.indexOf('"Cookie consent"');
  if (a === -1) return null;
  const b = s.indexOf('document.body.appendChild(bar)', a);
  return b === -1 ? null : [a, b];
}

test('the dashboard reads its ink through the token, not the literal', () => {
  // The ratchet: the ink family is over half of the surface's colour literals, so
  // if the sweep is ever reverted piecemeal this is the first thing to notice.
  // Counted on the files the token layer covers, not the whole directory.
  const swept = ['dash.css', 'pageShell.jsx', 'trainerDashboard.jsx', 'dashGrid.jsx'];
  for (const f of swept) {
    const s = code.get(f);
    assert.ok(s != null, `${f} missing`);
    const skip = consentRegion(s);
    const sites = [...s.matchAll(/rgba?\(\s*242\s*,\s*237\s*,\s*228\s*[,)]/g)]
      .filter(m => !(skip && m.index >= skip[0] && m.index < skip[1]));
    assert.equal(sites.length, 0,
      `${f} still writes the ink literal directly (${sites.length} sites) — it should read rgba(var(--sh-ink-rgb, 242,237,228), a)`);
  }
});

test('the consent-banner exception is a real region, not a blanket escape', () => {
  // ⚠ Guard-the-guard: the ratchet above excludes a byte range, so if that range
  // ever stopped being found — or grew to swallow the file — the exclusion would
  // quietly stop the ratchet from catching anything. Both ends are pinned here.
  const s = code.get('pageShell.jsx');
  const r = consentRegion(s);
  assert.ok(r, 'the consent region is gone from pageShell.jsx — the ratchet exclusion above now means nothing');
  const [a, b] = r;
  assert.ok(b > a, 'the consent region is empty');
  assert.ok(b - a < s.length * 0.15,
    `the consent region spans ${Math.round((100 * (b - a)) / s.length)}% of pageShell.jsx — an exclusion that large is not an exception`);
  // And the exception must be EARNING itself: the region does carry literals the
  // ratchet would otherwise flag, which is the whole reason it is excluded.
  const inside = [...s.slice(a, b).matchAll(/rgba?\(\s*242\s*,\s*237\s*,\s*228\s*[,)]|#f2ede4|#1a1612/gi)].length;
  assert.ok(inside > 0,
    'the consent region carries no colour literal — it no longer needs an exception, so remove it rather than leaving a hole in the ratchet');
});

// ─────────────────────────────────────────────────────────────────────────────
// The two invariants above are about the TEXT of a colour. These two are about
// where that text ENDS UP, and both exist because a defect shipped that no
// pixel diff could see.
//
// ⚠ PR 1's sweep was verified by capturing 41 dashboard and marketing surfaces
// before and after and proving them identical. It was, and three surfaces were
// still broken — because a pixel diff only proves the states you captured, and
// the chat bubble's Feed tab, its profile card and Nora's row in site search
// are all CLOSED in a page capture. Measured on the branch:
//
//   cfHexA(INK, 0.06)        rgba(242,237,228,0.06)  ->  var(--sh-ink, #f2ede4)
//   ssShade(TEAL, 0.5)       rgb(5,99,84)            ->  rgb(0,0,0)
//   cwHexA(TEAL_BRIGHT, .3)  rgba(46,224,196,0.3)    ->  rgba(0,0,0,0.3)
//   `${tc}55`                #2ee0c455               ->  (invalid, dropped)
//
// `NaN >> 16 & 255` is 0, so two of those are VALID CSS that is simply BLACK,
// which is why no browser, linter or build could report them — the same shape as
// a font-variation-settings axis nobody requested.
//
// Both checks below DRIVE the shipped code rather than pinning its spelling, and
// both resolve identifiers through Babel's own scope. That is not a nicety: a
// name-keyed walk over these files crosses component scopes, because a
// 1,900-line module reuses `c`, `r`, `row` and `id` in a dozen of them —
// measured, a scope-blind walk went c -> r -> dir -> row through four unrelated
// functions and reported a defect that was not there.

const require_ = createRequire(import.meta.url);
const babelParser = require_('@babel/parser');
const traverseMod = require_('@babel/traverse');
const traverse = traverseMod.default || traverseMod;

const jsFiles = files.filter(f => /\.(jsx|js)$/.test(f));
const astOf = (f) => babelParser.parse(src.get(f), { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });

// A tokenised colour and the bare literal it falls back to. Any helper that
// derives a colour arithmetically must answer the same thing for both.
const PROBE_TOKEN = 'var(--sh-probe, #2ee0c4)';
const PROBE_BARE = '#2ee0c4';
// Derived from the probe rather than typed, so the two cannot drift apart.
const PROBE_NAME = PROBE_TOKEN.match(/var\(\s*(--[\w-]+)/)[1];
const PROBE_RGB = `${PROBE_NAME}-rgb`;
// Which custom properties a helper's output actually reads, and which of them did
// NOT come from the input. sameColour() below strips the `var(--name,` prefix before
// comparing, so it is blind to the name by construction — that blindness is correct
// for the equivalence question it answers and is exactly why identity needs its own.
const varRefs = (s) => [...String(s).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
const foreignRefs = (s) => varRefs(s).filter((t) => t !== PROBE_RGB && t !== PROBE_NAME);
// `rgba(var(--x-rgb, r,g,b), a)` and `rgba(r,g,b,a)` compute identically where
// the token is absent, and the token's whole point is that they diverge where it
// is present — so the comparison is on the fallback.
const sameColour = (a, b) => {
  const n = (x) => String(x).replace(/var\(\s*--[\w-]+\s*,\s*/g, '').replace(/\)\s*,/g, ',').replace(/[\s)]/g, '');
  return n(a) === n(b);
};

// The helpers that PRESERVE a paper token — derived by driving each one with a token
// and seeing whether a var() survives into the output, not by reading names.
// ALPHAS can (rgba(var(--x-rgb, r,g,b), a) is exact); SHADES cannot, because CSS has
// no multiply, so hexA / lvShade / mkShade / rdRgba / shade / ssShade / cwShade read
// the fallback and are frozen at today's value — stated at each of their sites.
// ⚠ hexA (livingShared) and rdRgba (radioInstrument) ARE alphas and do NOT preserve.
// That is a gap rather than a rule, registered rather than fixed here: both are
// outside what this PR swept, and widening it is PR 3–5's business.
const TOKEN_PRESERVING = ['cfHexA', 'clwAlpha', 'cwHexA', 'ssAlpha', 'stAlpha'];

test('every hex-parsing helper in newdesign accepts a paper token', () => {
  let driven = 0;
  const naive = [];
  const preserving = [];
  const mislinked = [];
  for (const f of jsFiles) {
    const s = src.get(f);
    const fns = new Map();
    traverse(astOf(f), {
      Function(p) {
        const name = p.node.id ? p.node.id.name
          : (p.parentPath?.node.type === 'VariableDeclarator' && p.parentPath.node.id.type === 'Identifier' ? p.parentPath.node.id.name : null);
        if (!name || !p.node.params.length) return;
        const decl = p.parentPath?.node.type === 'VariableDeclarator' ? p.parentPath.parentPath : p;
        let parses = false; const calls = new Set();
        p.traverse({
          CallExpression(q) {
            if (q.node.callee.type !== 'Identifier') return;
            if (q.node.callee.name === 'parseInt' && q.node.arguments.some(a => a.type === 'NumericLiteral' && a.value === 16)) parses = true;
            calls.add(q.node.callee.name);
          },
        });
        fns.set(name, { text: s.slice(decl.node.start, decl.node.end), parses, calls });
      },
    });
    for (const [name, info] of fns) {
      if (!info.parses) continue;
      driven++;
      // lift the parser plus the same-file helpers it delegates to
      const need = new Set([name]);
      for (let d = 0; d < 2; d++)
        for (const n of [...need]) for (const c of fns.get(n)?.calls || []) if (fns.has(c)) need.add(c);
      const body = [...need].map(n => fns.get(n).text).join('\n');
      let out;
      try {
        out = new Function(`${body}\nreturn [${name}(arguments[0], 0.5), ${name}(arguments[1], 0.5)];`)(PROBE_TOKEN, PROBE_BARE);
      } catch (e) { naive.push(`${f}: ${name}() threw on a paper token — ${e.message}`); continue; }
      if (!sameColour(out[0], out[1])) naive.push(`${f}: ${name}(token) = ${out[0]}   but   ${name}(hex) = ${out[1]}`);
      const emitted = String(out[0]);
      if (varRefs(emitted).length) {
        preserving.push(name);
        const foreign = [...new Set(foreignRefs(emitted))];
        if (foreign.length) mislinked.push(`${f}: ${name}(${PROBE_TOKEN}) = ${emitted}  → reads ${foreign.join(', ')}`);
      }
    }
  }
  // ── Which helpers PRESERVE the token, and which flatten it ──────────────────
  // An ALPHA is linear, so it can be composed as rgba(var(--x-rgb, r,g,b), a) and
  // keeps following the paper. A SHADE multiplies, and CSS has no multiply, so it
  // must read the fallback and is frozen at today's value by construction. That is
  // a real split, not an oversight — but it is invisible in the source, so it is
  // censused here: a helper silently dropping out of the preserving set is a colour
  // that quietly stops following the paper, which no render check would ever show.
  // ⚠ PRESERVING SOME TOKEN IS NOT PRESERVING THE INPUT'S, AND NOTHING ABOVE COULD
  // TELL THEM APART. A helper that emitted rgba(var(--sh-accent-rgb, 46,224,196), a)
  // for EVERY input passes sameColour() (which strips the name) and passes a bare
  // "is there a var()" test, while the colour silently follows --sh-accent rather
  // than the token it was handed — so a gold avatar ring would turn teal the day the
  // paper moved, on a path no render check taken today can reach.
  assert.equal(foreignRefs(`rgba(var(${PROBE_RGB}, 46,224,196), 0.5)`).length, 0,
    'the identity check rejects the CORRECT form — it would fail every helper');
  assert.equal(foreignRefs('rgba(var(--sh-accent-rgb, 46,224,196), 0.5)').length, 1,
    'the identity check cannot see a mislinked token — this is the exact string a ' +
    'fixed-token helper emits, and sameColour() provably passes it');
  assert.deepEqual(mislinked, [],
    'a token-preserving helper must compose the alpha through the twin of the token it ' +
    'was HANDED. Reading a different one renders correctly today, off the fallback, and ' +
    'follows the wrong colour the moment the paper moves:\n  ' + mislinked.join('\n  '));

  assert.deepEqual(preserving.sort(), TOKEN_PRESERVING,
    'the set of token-preserving helpers moved. A helper that USED to emit ' +
    'rgba(var(--x-rgb, …), a) and now flattens to the literal still renders correctly ' +
    'today and silently stops following the paper. If this was deliberate, update ' +
    'TOKEN_PRESERVING and say why in the PR:\n  expected ' + JSON.stringify(TOKEN_PRESERVING) +
    '\n  actual   ' + JSON.stringify(preserving.sort()));

  assert.ok(driven >= 9,
    `expected the directory's hex-parsing helpers, drove ${driven} — this sweep has stopped matching`);
  assert.deepEqual(naive, [],
    'a helper that parses hex digits arithmetically must EXTRACT them, because a paper token is not digits ' +
    'and parseInt on one is NaN — which >> 16 & 255 turns into 0, so the output is valid CSS that is black:\n  ' +
    naive.join('\n  '));
});

// The hex-alpha append census, DERIVED from the tree rather than typed: every site
// where a colour reaches a `c + "1c"` or `${INK}40` append, counted per file.
// 21 files, 16 concatenation + 40 template = 56 sinks.
// ⚠ Replaces a pair of `>=` floors. A floor is satisfied by unrelated sites, so the
// collector could stop matching a whole file and stay green — which is exactly how a
// tokenised colour would reach an unswept append. Per-file counts localise the drop.
const SINK_CENSUS = {
  'client.jsx': { concat: 0, template: 2 },
  'clientPlaylist.jsx': { concat: 0, template: 1 },
  'coachClientDetail.jsx': { concat: 1, template: 1 },
  'dashClient.jsx': { concat: 1, template: 0 },
  'dashProfileExtras.jsx': { concat: 0, template: 1 },
  'dashSchedule.jsx': { concat: 1, template: 0 },
  'landing.jsx': { concat: 0, template: 2 },
  'marketplace.jsx': { concat: 0, template: 10 },
  'memberProfile.jsx': { concat: 0, template: 4 },
  'pricing.jsx': { concat: 0, template: 2 },
  'publicProfile.jsx': { concat: 1, template: 0 },
  'score.jsx': { concat: 0, template: 8 },
  'trainerDashboard.jsx': { concat: 0, template: 2 },
};

test('no hex-alpha append resolves to a paper token', () => {
  const asts = new Map(jsFiles.map(f => [f, astOf(f)]));

  // Every `<Component prop={expr}>` in the tree — a colour crosses files this way
  // (DashPill is declared in dashToday and called from dashRoster).
  const props = new Map();
  for (const [f, ast] of asts) traverse(ast, {
    JSXAttribute(p) {
      const el = p.parentPath.node;
      if (el.type !== 'JSXOpeningElement' || el.name.type !== 'JSXIdentifier') return;
      if (p.node.name.type !== 'JSXIdentifier') return;
      if (!p.node.value || p.node.value.type !== 'JSXExpressionContainer') return;
      const k = el.name.name + '\u0000' + p.node.name.name;
      if (!props.has(k)) props.set(k, []);
      props.get(k).push({ file: f, path: p.get('value.expression') });
    },
  });

  // These are classic scripts sharing one global lexical scope, so a name with no
  // local binding may be another file's module-scope const.
  const globals = new Map();
  for (const [f, ast] of asts) traverse(ast, {
    VariableDeclarator(p) {
      if (p.scope.block.type !== 'Program' || p.node.id.type !== 'Identifier' || !p.node.init) return;
      if (!globals.has(p.node.id.name)) globals.set(p.node.id.name, []);
      globals.get(p.node.id.name).push({ file: f, path: p.get('init') });
    },
    FunctionDeclaration(p) {
      if (p.scope.parent?.block?.type !== 'Program' || !p.node.id) return;
      if (!globals.has(p.node.id.name)) globals.set(p.node.id.name, []);
      globals.get(p.node.id.name).push({ file: f, path: p, fn: true });
    },
  });

  const hits = [];
  // ⚠ COUNTED PER SPELLING, NOT SUMMED. A single total is satisfied by whichever
  // spelling still matches, so breaking the concatenation pattern outright left
  // the floor green — measured, that mutation SURVIVED a summed floor.
  const sinks = { concat: 0, template: 0, byFile: {} };
  const tally = (f, kind) => { (sinks.byFile[f] ||= { concat: 0, template: 0 })[kind]++; };

  function resolve(file, path, seen, depth, trail) {
    if (!path || !path.node || depth > 10) return;
    const n = path.node;
    // ⚠ FILE-SCOPED, or two files' nodes at the same byte offset collide and one
    // silently prunes the other's whole branch — measured, that hid the DashPill
    // chain entirely while the walk reported CLEAN.
    const key = file + ':' + n.start + ':' + n.type;
    if (seen.has(key)) return;
    seen.add(key);
    const kids = (sel) => resolve(file, path.get(sel), seen, depth + 1, trail);

    switch (n.type) {
      case 'StringLiteral':
        if (/var\(--/.test(n.value)) hits.push(`${trail.join(' -> ')}\n        = ${n.value}`);
        return;
      case 'TemplateLiteral': {
        const raw = n.quasis.map(q => q.value.cooked ?? '').join('${…}');
        if (/var\(--/.test(raw)) hits.push(`${trail.join(' -> ')}\n        = ${raw}`);
        n.expressions.forEach((_, i) => kids('expressions.' + i));
        return;
      }
      case 'ConditionalExpression': kids('consequent'); kids('alternate'); return;
      case 'LogicalExpression': kids('left'); kids('right'); return;
      case 'ObjectExpression':
        n.properties.forEach((pr, i) => { if (pr.type === 'ObjectProperty') kids('properties.' + i + '.value'); });
        return;
      case 'ArrayExpression': n.elements.forEach((_, i) => kids('elements.' + i)); return;
      case 'MemberExpression': kids('object'); return;
      case 'CallExpression': kids('callee'); return;
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
      case 'FunctionDeclaration': returns(file, path, seen, depth + 1, trail); return;
      case 'Identifier': {
        const b = path.scope.getBinding(n.name);
        const t = [...trail, n.name];
        if (!b) {
          for (const g of globals.get(n.name) || []) {
            const gt = [...t, `(module scope of ${g.file})`];
            if (g.fn) returns(g.file, g.path, seen, depth + 1, gt);
            else resolve(g.file, g.path, seen, depth + 1, gt);
          }
          return;
        }
        const k = b.path.node.type;
        if (k === 'VariableDeclarator') { resolve(file, b.path.get('init'), seen, depth + 1, t); return; }
        if (k === 'FunctionDeclaration' || k === 'FunctionExpression' || k === 'ArrowFunctionExpression') { returns(file, b.path, seen, depth + 1, t); return; }
        if (b.kind === 'param') { param(b, n.name, seen, depth + 1, t); return; }
        return;
      }
      default: return;
    }
  }

  function returns(file, fnPath, seen, depth, trail) {
    if (fnPath.node.type === 'ArrowFunctionExpression' && fnPath.node.body.type !== 'BlockStatement') {
      resolve(file, fnPath.get('body'), seen, depth + 1, trail); return;
    }
    fnPath.traverse({
      Function(p) { p.skip(); },
      ReturnStatement(p) { if (p.node.argument) resolve(file, p.get('argument'), seen, depth + 1, trail); },
    });
  }

  // A parameter is resolved at the CALL SITE, which is how the prop hop works.
  function param(binding, name, seen, depth, trail) {
    const fn = binding.scope.path;
    const fname = fn.node.type === 'FunctionDeclaration' && fn.node.id ? fn.node.id.name
      : (fn.parentPath?.node.type === 'VariableDeclarator' && fn.parentPath.node.id.type === 'Identifier' ? fn.parentPath.node.id.name : null);
    if (!fname) return;
    for (const site of props.get(fname + '\u0000' + name) || [])
      resolve(site.file, site.path, seen, depth + 1, [...trail, `<${fname} ${name}=…> in ${site.file}`]);
  }

  const SUFFIX = /^[0-9a-fA-F]{2}(?![0-9a-fA-F])/;
  for (const [f, ast] of asts) traverse(ast, {
    // Spelling B — concatenation: `c + "1c"`
    BinaryExpression(p) {
      if (p.node.operator !== '+') return;
      const r = p.node.right;
      if (r.type !== 'StringLiteral' || !/^[0-9a-fA-F]{2}$/.test(r.value)) return;
      sinks.concat++; tally(f, 'concat');
      resolve(f, p.get('left'), new Set(), 0, [`${f}:${p.node.loc.start.line}`]);
    },
    // Spelling A — interpolation: `${INK}40`. The suffix is the NEXT quasi's first
    // two characters, so the operand is the expression before it.
    TemplateLiteral(p) {
      p.node.expressions.forEach((_, i) => {
        const q = p.node.quasis[i + 1];
        if (!q || !SUFFIX.test(q.value.cooked ?? '')) return;
        sinks.template++; tally(f, 'template');
        resolve(f, p.get('expressions.' + i), new Set(), 0, [`${f}:${p.node.loc.start.line}`]);
      });
    },
  });

  // ⚠ THESE WERE `>=` FLOORS, AND A FLOOR LETS THE COLLECTOR DROP SITES SILENTLY:
  // sites in one file can stop matching while unrelated sites elsewhere hold the
  // total above the floor, so a tokenised colour reaches an unvisited append with
  // this test green. Exact counts PER FILE localise a drop to the file it happened
  // in. Deliberately not file:line signatures — a line number pins a layout, so an
  // unrelated edit above an append site would fail a test about colour.
  assert.deepEqual(sinks.byFile, SINK_CENSUS,
    'the hex-alpha append census moved. If you ADDED or REMOVED an append site, update ' +
    'SINK_CENSUS in this file and say so in the PR. If you did not, the collector has ' +
    'stopped matching a spelling and is no longer sweeping what it claims to.');
  assert.deepEqual(hits, [],
    'a colour that reaches a hex-alpha append cannot be a paper token — the suffix makes the whole ' +
    'declaration invalid and CSS drops it. Either keep the source literal (and say why, beside it) ' +
    'or compose the alpha as rgba(var(--<token>-rgb, r,g,b), a):\n  ' + hits.join('\n  '));
});
