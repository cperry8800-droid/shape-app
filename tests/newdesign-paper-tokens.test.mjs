import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
