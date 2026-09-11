// Every page a phone can actually land on must declare a viewport meta.
//
// ⚠ WITHOUT IT A PHONE REPORTS A 980px LAYOUT VIEWPORT, so every responsive rule in
// dash.css and pageShell.jsx sits dormant — the work is already written and nothing is
// asking for it. The three shells were fixed on 2026-09-09 (P1-B); this closes the rest
// and stops a new page shipping without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../public/newdesign/', import.meta.url);
const pages = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
const read = (f) => readFileSync(new URL(f, DIR), 'utf8');

// A REDIRECT STUB never lays anything out: its head runs `location.replace(...)`
// unconditionally, before the body exists, so a viewport meta on it would be decoration.
// The distinction is drawn from the file, not from a hand-kept list — a stub that stops
// redirecting becomes a real page and is caught by the same sweep.
//
// ⚠ THE MATCH IS THE SCRIPT'S OWN FIRST STATEMENT, NOT "the file mentions replace".
// A looser test read `index.html` as a stub — it redirects only on a phone-width
// media query and otherwise renders the real homepage — which would have exempted the
// SITE'S FRONT PAGE from this sweep forever. Found by the classifier's own guard below.
// ⚠ TWO SHAPES OF STUB, AND THE FIRST CUT SAW ONLY ONE (CodeRabbit, #2026).
// `NutritionistPublic.html` / `TrainerPublic.html` redirect from inside an IIFE and have
// LITERALLY EMPTY bodies — measured, 0 characters — so a rule requiring the redirect to
// be the script's first token called them real pages and demanded a viewport meta on
// something that lays nothing out. That is a false negative, and worse, it meant this
// classifier did not implement the policy its own name states.
//
// Each arm says the same thing a different way, and `index.html` — whose redirect is
// CONDITIONAL on a phone-width media query — fails both, which the guard below asserts:
//   A · the redirect is the script's first statement (the 31 shell stubs)
//   B · the head redirects and the body is empty (the two superseded profile pages)
const headOf = (s) => s.slice(0, (s.indexOf('</head>') + 7) || 2000);
const bodyOf = (s) => {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(s);
  return (m ? m[1] : s.slice(s.indexOf('</head>') + 7)).replace(/<!--[\s\S]*?-->/g, '').trim();
};
const isStub = (s) => {
  const head = headOf(s);
  if (!head.includes('location.replace')) return false;
  return /<script>\s*location\.replace\(/.test(head) || bodyOf(s).length === 0;
};

test('every real newdesign page declares a viewport meta', () => {
  assert.ok(pages.length > 30, 'the page sweep found almost nothing (' + pages.length + ') — is the glob right?');
  const missing = [];
  let real = 0;
  for (const f of pages) {
    const s = read(f);
    if (isStub(s)) continue;
    real += 1;
    if (!/<meta\s+name="viewport"/i.test(s)) missing.push(f);
  }
  // ⚠ AND THE SWEEP ASSERTS IT SCANNED A CORPUS. A classifier that decided every page
  // was a stub would report "0 missing" and pass while covering nothing.
  assert.ok(real > 25, 'only ' + real + ' pages were classified as real — the stub test is over-matching');
  assert.deepEqual(missing, [], 'these pages give phones a 980px desktop layout: ' + missing.join(', '));
});

// The print mocks allowed to pin a page width, by name.
const PRINT_FIXED_WIDTH = new Set(['Shape Redesign-print.html', 'index-print.html']);
// A function, not an inline test, so a hypothetical future page can be put to it —
// measured: reverting this to `/-print\.html$/` is a NO-OP on today's file set, so a
// guard that only checks the two existing files cannot tell the two rules apart.
const mayPinWidth = (f) => PRINT_FIXED_WIDTH.has(f);
// ⚠ THE WHOLE VERDICT IS A PURE FUNCTION, so a hypothetical page can be put to it.
// Every rule here is a no-op on TODAY'S corpus — no current page blocks zoom or pins a
// width outside the allowlist — so a guard that only sweeps the real files cannot tell a
// working rule from a deleted one. Measured twice: two mutations survived that way.
function viewportVerdict(file, meta) {
  if (/user-scalable\s*=\s*no/i.test(meta)) return 'blocks-zoom';
  if (/maximum-scale\s*=\s*[01](\.0)?\b/i.test(meta)) return 'caps-zoom';
  if (/width\s*=\s*\d+/.test(meta)) return mayPinWidth(file) ? 'ok-fixed-print' : 'pins-a-width';
  return /width\s*=\s*device-width/i.test(meta) ? 'ok' : 'no-device-width';
}

test('the viewport meta is the one the shells use, and scales', () => {
  // A `user-scalable=no` or a `maximum-scale=1` viewport blocks pinch-zoom, which is an
  // accessibility failure (WCAG 1.4.4) — and none of these pages needs to.
  const shells = ['TrainerApp.html', 'ClientApp.html', 'NutritionistApp.html'].map(read);
  const canonical = /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/;
  for (const s of shells) assert.match(s, canonical, 'a shell changed its viewport line — re-derive the canonical form');
  // ⚠ THE EXEMPTION IS BY NAME. A `-print.html` SUFFIX rule would silently admit the
  // next fixed-width page someone adds; the two current ones are approved deliberately.
  assert.equal(mayPinWidth('Shape Redesign-print.html'), true);
  assert.equal(mayPinWidth('index-print.html'), true);
  assert.equal(mayPinWidth('Statement-print.html'), false, 'a new print page is exempted without anyone approving it');
  assert.equal(mayPinWidth('TrainerApp.html'), false);
  // ⚠ AND THE VERDICT IS DRIVEN ON PAGES THAT DO NOT EXIST, because every rule below is
  // a no-op on the real corpus and a sweep alone cannot see it deleted.
  const V = (f, meta) => viewportVerdict(f, '<meta name="viewport" content="' + meta + '" />');
  assert.equal(V('TrainerApp.html', 'width=device-width, initial-scale=1'), 'ok');
  assert.equal(V('TrainerApp.html', 'width=device-width, initial-scale=1, user-scalable=no'), 'blocks-zoom');
  assert.equal(V('TrainerApp.html', 'width=device-width, initial-scale=1, maximum-scale=1'), 'caps-zoom');
  assert.equal(V('TrainerApp.html', 'width=1200, initial-scale=1'), 'pins-a-width', 'any page may pin a desktop width');
  assert.equal(V('Statement-print.html', 'width=1440, initial-scale=1'), 'pins-a-width', 'a new print page exempts itself');
  assert.equal(V('index-print.html', 'width=1440, initial-scale=1'), 'ok-fixed-print');
  assert.equal(V('TrainerApp.html', 'initial-scale=1'), 'no-device-width');
  // and nothing in the allowlist is stale
  for (const f of PRINT_FIXED_WIDTH) assert.ok(pages.includes(f), 'the allowlist names a page that no longer exists: ' + f);
  for (const f of pages) {
    const s = read(f);
    const m = /<meta\s+name="viewport"[^>]*>/i.exec(s);
    if (!m) continue;
    // ⚠ AN EXPLICIT ALLOWLIST, NOT A SUFFIX RULE (CodeRabbit, #2026). A print mock is a
    // picture of a printed page — a fixed page box with no device to adopt — but
    // `/-print\.html$/` silently admits any future one, and `index-print.html` was
    // already riding it unnamed. Both are approved by NAME.
    const verdict = viewportVerdict(f, m[0]);
    assert.ok(verdict === 'ok' || verdict === 'ok-fixed-print', f + ': ' + verdict + ' -> ' + m[0]);
    if (verdict === 'ok-fixed-print') assert.match(m[0], /initial-scale=1/, f + ' pins a width without a scale');
  }
});

test('a redirect stub is classified by what it does, not by its name', () => {
  // The classifier decides which pages the sweep above polices, so it gets its own
  // check: a real page misread as a stub is silently exempted forever.
  const stubs = pages.filter((f) => isStub(read(f)));
  const real = pages.filter((f) => !isStub(read(f)));
  assert.ok(stubs.length > 10 && real.length > 10, 'the split is lopsided: ' + stubs.length + ' stubs / ' + real.length + ' real');
  for (const f of stubs) {
    assert.match(read(f), /location\.replace\(\s*["'][A-Za-z]+\.html/, f + ' is treated as a stub but redirects nowhere');
  }
  // The shells, the biggest real pages, and — the one this guard actually caught —
  // `index.html`, whose redirect is CONDITIONAL on a phone-width media query.
  for (const f of ['TrainerApp.html', 'ClientApp.html', 'NutritionistApp.html',
    'TrainerLiveConsole.html', 'ClientGrocery.html', 'index.html']) {
    assert.ok(!isStub(read(f)), f + ' was misread as a redirect stub');
  }
  // ⚠ AND THE IIFE STUBS ARE STUBS. They redirect from inside a function expression and
  // render an EMPTY body, so the first-token rule missed them entirely.
  for (const f of ['NutritionistPublic.html', 'TrainerPublic.html']) {
    const s = read(f);
    assert.ok(isStub(s), f + ' redirects and renders nothing, but is policed as a real page');
    assert.equal(bodyOf(s).length, 0, f + ' grew a body — re-check whether it is still a stub');
    assert.ok(!/<script>\s*location\.replace\(/.test(headOf(s)), f + ' now matches the first-token arm — the empty-body arm is untested');
  }
  // ⚠ index.html WAS the hard case here: a head that redirected only at phone
  // width, on a page with a full body — so it failed both arms and had to be
  // classified real. That redirect is GONE (phones get the homepage now), so the
  // shape is extinct and this no longer pins it. Measured rather than assumed:
  // every other head-redirecting page in newdesign/ uses the first-token arm.
  const home = read('index.html');
  assert.ok(!/location\.replace/.test(headOf(home)),
    'index.html redirects again — phones are being sent off the homepage');
  assert.ok(bodyOf(home).length > 1000, 'index.html has no body — it would classify as a stub');
  // and if the conditional shape ever comes back ANYWHERE, the classifier must
  // still call that page real rather than silently exempting it from the sweep
  // above. Derived, so a new one is covered with nobody remembering this exists;
  // the set is empty today, which is why index's own two assertions stay.
  const conditional = pages.filter((f) => {
    const s = read(f);
    return /location\.replace/.test(headOf(s))
      && !/<script>\s*location\.replace\(/.test(headOf(s))
      && bodyOf(s).length > 1000;
  });
  for (const f of conditional) assert.ok(!isStub(read(f)), f + ' redirects conditionally but is policed as a stub');
});
