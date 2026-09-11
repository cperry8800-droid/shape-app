// The cookie-consent banner's colours, and the page palette that made it
// unreadable.
//
// ⚠ WHAT THIS IS ABOUT. `pageShell.jsx` injects the EEA/UK consent banner with
// inline styles, outside any page stylesheet, and reached for the design-system
// tokens so it would "stay legible everywhere". Generic token names are a shared
// namespace with every page's private palette, so that is the mechanism that
// broke it: the Climb homepage is the first page in this directory to define
// `--ink`, and it defines it as its BACKGROUND (#06090f). The banner then drew
// #06090f text on its own #1a1612 fallback at 1.11:1 — and the Accept button,
// which reads `--paper` (no page defines it), stayed at 8.19:1. A consent choice
// where only ACCEPT is legible is a dark pattern, however it was arrived at.
//
// ⚠ WHAT THE FIX CHANGED ELSEWHERE, MEASURED RATHER THAN WAVED AT. Seven pages
// define one of the borrowed tokens; three of them load pageShell. index.html is
// the only one that was BROKEN (1.11:1). The other two, index-explorations.html
// and index-print.html, define `--paper:#fafaf7`, so they were rendering a LIGHT
// banner at 18.67:1 and now render the canonical dark one at 15.43:1 — a real
// visual change, comfortably inside AA either way, on two pages nothing links to
// and which the War Room does not register. Taken rather than special-cased: a
// page that wants a themed banner can say so with `--consent-*`, and these two
// were getting it by accident.
//
// ⚠ THIS ASSERTS TWO THINGS, AND NEITHER IS A SPELLING. (1) The banner's inline
// styles borrow no generic palette token — any page may define those for itself.
// (2) Every colour pair the banner can actually render clears WCAG AA 4.5:1,
// computed here rather than trusted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SHELL = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');

// the banner's own region: from the dialog element to where it is appended
function bannerRegion() {
  const a = SHELL.indexOf('"Cookie consent"');
  assert.notEqual(a, -1, 'the consent banner is gone from pageShell.jsx');
  const b = SHELL.indexOf('document.body.appendChild(bar)', a);
  assert.notEqual(b, -1, 'the consent banner is never appended');
  return SHELL.slice(a, b);
}

function lum(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = ch.map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(x, y) {
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

test('the consent banner borrows no generic palette token from the host page', () => {
  const region = bannerRegion();
  const vars = [...region.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
  assert.ok(vars.length > 0, 'no CSS variables found — the region matcher is reading the wrong code');
  const leaky = [...new Set(vars)].filter((v) => !v.startsWith('--consent-'));
  assert.deepEqual(leaky, [],
    `the banner reads ${leaky.join(', ')} from the host page — a page that defines any of these for its own palette silently re-colours the consent dialog`);
});

test('every colour pair the consent banner can render clears WCAG AA', () => {
  const region = bannerRegion();
  const fb = {};
  for (const m of region.matchAll(/var\(\s*(--consent-[a-z0-9-]+)\s*,\s*(#[0-9a-f]{6})\s*\)/gi)) {
    const [, name, hex] = m;
    if (fb[name]) assert.equal(fb[name].toLowerCase(), hex.toLowerCase(),
      `${name} has two different fallbacks (${fb[name]} / ${hex}) — one of them renders somewhere`);
    fb[name] = hex;
  }
  for (const k of ['--consent-bg', '--consent-fg', '--consent-accent', '--consent-link']) {
    assert.ok(fb[k], `${k} has no literal fallback — an undefined token renders as nothing`);
  }
  const AA = 4.5;
  const pairs = [
    ['disclosure text', fb['--consent-fg'], fb['--consent-bg']],
    ['reject button', fb['--consent-fg'], fb['--consent-bg']],
    ['accept button', fb['--consent-bg'], fb['--consent-accent']],
    ['privacy link', fb['--consent-link'], fb['--consent-bg']],
  ];
  for (const [what, fg, bg] of pairs) {
    const r = ratio(fg, bg);
    assert.ok(r >= AA, `${what}: ${fg} on ${bg} is ${r.toFixed(2)}:1, under the ${AA}:1 floor`);
  }
});

test('no newdesign page defines --consent-*, so the audited fallbacks are what render', async () => {
  // ⚠ NOT A BAN — a page MAY theme the banner deliberately. It is a statement
  // about what the contrast check above is actually proving today: with nothing
  // overriding them, the literal fallbacks are the rendered colours on every
  // page. The day a page overrides one, this fails and the check above has to
  // grow to cover that page's pair rather than silently stop applying.
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../public/newdesign/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.html') || f.endsWith('.jsx'));
  assert.ok(files.length > 20, `only ${files.length} newdesign files scanned — the sweep is not reading the directory`);
  const offenders = [];
  for (const f of files) {
    if (f === 'pageShell.jsx') continue;
    const src = readFileSync(new URL(f, dir), 'utf8');
    if (/--consent-[a-z0-9-]+\s*:/i.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    `${offenders.join(', ')} overrides a --consent-* token; extend the contrast test to cover it`);
});
