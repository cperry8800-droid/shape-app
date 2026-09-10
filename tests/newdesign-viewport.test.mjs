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
const isStub = (s) => /<script>\s*location\.replace\(/.test(s.slice(0, (s.indexOf('</head>') + 1) || 2000));

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

test('the viewport meta is the one the shells use, and scales', () => {
  // A `user-scalable=no` or a `maximum-scale=1` viewport blocks pinch-zoom, which is an
  // accessibility failure (WCAG 1.4.4) — and none of these pages needs to.
  const shells = ['TrainerApp.html', 'ClientApp.html', 'NutritionistApp.html'].map(read);
  const canonical = /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/;
  for (const s of shells) assert.match(s, canonical, 'a shell changed its viewport line — re-derive the canonical form');
  for (const f of pages) {
    const s = read(f);
    const m = /<meta\s+name="viewport"[^>]*>/i.exec(s);
    if (!m) continue;
    assert.ok(!/user-scalable\s*=\s*no/i.test(m[0]), f + ' blocks pinch-zoom');
    assert.ok(!/maximum-scale\s*=\s*[01](\.0)?\b/i.test(m[0]), f + ' caps zoom at 1x');
    // ⚠ A PRINT MOCK IS THE ONE HONEST EXCEPTION and it is named rather than waved
    // through: `Shape Redesign-print.html` pins `width=1440` because it is a picture of
    // a printed page, which has a fixed page box and no device to adopt. Every other
    // page takes the device width.
    if (/-print\.html$/.test(f) && /width\s*=\s*\d+/.test(m[0])) {
      assert.match(m[0], /initial-scale=1/, f + ' pins a width without a scale');
      continue;
    }
    assert.match(m[0], /width\s*=\s*device-width/i, f + ' does not adopt the device width');
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
});
