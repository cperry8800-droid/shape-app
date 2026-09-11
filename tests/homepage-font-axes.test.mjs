// tests/homepage-font-axes.test.mjs
//
// A variable-font axis you USE must be an axis you REQUESTED.
//
// ⚠ THE DEFECT THIS EXISTS FOR SHIPPED, AND NOTHING ANYWHERE REPORTED IT.
// index.html asked Google Fonts for `Doto:wght@100..900` — weight only — while
// sixteen rules set `font-variation-settings:'ROND' N`. Google Fonts serves the
// axes you name and PINS every other one at its default, so the delivered font
// carried no ROND axis at all: each declaration was inert and every figure
// rendered at Doto's default ROND 0, the square-dot form the file's own type
// note says cannot be read at display size. An ignored font-variation-settings
// is not an error in any browser, any linter or any build — the page renders,
// it just renders the wrong glyph. Only a reader who thought to compare the two
// lists would ever catch it, which is what this does.
//
// It DERIVES both lists from the shipped file rather than naming ROND, so an
// axis added later is covered with nobody remembering this test exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

// ⚠ COMMENTS FIRST. The type note above the <link> quotes the broken URL
// (`Doto:wght@100..900`) verbatim to explain what went wrong, so a scan of the
// raw file finds the defect's own spelling in the prose describing its fix —
// the trap this repo has now paid for four times.
const SRC = stripComments(readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8'));

/** `0..100` → [0,100] · `700` → [700,700] · anything else → null.
 *
 *  ⚠ SPLIT ON `..`, NEVER MATCH IT WITH A CHARACTER CLASS. The first version
 *  was `^(-?[\d.]+)(?:\.\.(-?[\d.]+))?$`, and `[\d.]+` is greedy over the dots
 *  — so `50..150` matched ENTIRELY as the lower bound, `Number('50..150')` is
 *  NaN, and every ranged axis was silently dropped. The map came back holding
 *  only `ital` (a bare `0`), and the guard failed on a page that was correct.
 *  A parser that reports a failure is as broken as one that reports a pass. */
function range(spec) {
  const parts = String(spec).trim().split('..');
  if (parts.length > 2 || !parts.every((p) => /^-?\d+(?:\.\d+)?$/.test(p))) return null;
  const [lo, hi] = [Number(parts[0]), Number(parts[parts.length - 1])];
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** Every axis the stylesheet request actually asks for, as tag → [min,max]
 *  unioned across families. A css2 family reads `Name:a1,a2@t1;t2`, where each
 *  `;`-separated tuple carries one `,`-separated value per axis, in order. */
function requestedAxes(html) {
  const link = /fonts\.googleapis\.com\/css2\?([^"']+)/.exec(html);
  if (!link) return null;
  const out = new Map();
  for (const part of link[1].split('&')) {
    if (!part.startsWith('family=')) continue;
    const spec = decodeURIComponent(part.slice('family='.length));
    const colon = spec.indexOf(':');
    if (colon < 0) continue;                       // no axes requested at all
    const [axisList, valueList = ''] = spec.slice(colon + 1).split('@');
    const axes = axisList.split(',').map((s) => s.trim()).filter(Boolean);
    for (const tuple of valueList.split(';')) {
      const vals = tuple.split(',');
      axes.forEach((tag, i) => {
        const r = range(vals[i]);
        if (!r) return;
        const prev = out.get(tag);
        out.set(tag, prev ? [Math.min(prev[0], r[0]), Math.max(prev[1], r[1])] : r);
      });
    }
  }
  return out;
}

/** Every axis the page sets, as tag → the set of values it sets it to. */
function usedAxes(html) {
  const out = new Map();
  for (const m of html.matchAll(/font-variation-settings\s*:\s*([^;}]+)/g)) {
    for (const d of m[1].matchAll(/['"]([A-Za-z]{4})['"]\s*(-?[\d.]+)/g)) {
      if (!out.has(d[1])) out.set(d[1], new Set());
      out.get(d[1]).add(Number(d[2]));
    }
  }
  return out;
}

test('the homepage requests every variable-font axis it sets', () => {
  const requested = requestedAxes(SRC);
  const used = usedAxes(SRC);

  // Vacuity controls, both directions: a parser that quietly stops matching
  // passes this file trivially, and that is exactly how the defect survived.
  assert.ok(requested, 'no Google Fonts css2 request found — the scan is broken, not the page');
  assert.ok(requested.size > 0, 'parsed zero requested axes — the family parser stopped matching');
  assert.ok(used.size > 0, 'parsed zero used axes — the declaration parser stopped matching');

  for (const [tag, values] of used) {
    assert.ok(
      requested.has(tag),
      `font-variation-settings sets '${tag}' but the font URL never requests it, so Google Fonts ` +
        `pins it at its default and every '${tag}' declaration on the page is inert. ` +
        `Requested: ${[...requested.keys()].join(', ')}`,
    );
    const [lo, hi] = requested.get(tag);
    for (const v of values) {
      assert.ok(
        v >= lo && v <= hi,
        `'${tag}' is set to ${v} but only ${lo}..${hi} is requested — the value is clamped, ` +
          `so the glyph is not the one this rule asks for`,
      );
    }
  }
});

test('a range the parser cannot read is not recorded as a known range', () => {
  // The numeric check in range() makes this parser FAIL CLOSED: a spec it cannot
  // read is dropped, so the axis reads as unrequested and the main test says so
  // loudly. Without it the axis would be stored as [NaN, NaN], every `v >= lo`
  // comparison would quietly be false, and the failure would blame the value
  // rather than the URL. Unreachable from the shipped file — which is exactly
  // why it needs driving here, or the check is decoration the next reader trusts.
  const synthetic = '<link href="https://fonts.googleapis.com/css2?family=Doto:ROND,wght@auto,100..900">';
  const req = requestedAxes(synthetic);
  assert.ok(!req.has('ROND'), 'an unparseable range must not be recorded as a known one');
  assert.deepEqual(req.get('wght'), [100, 900], 'and the axes that DO parse are still recorded');
});

test('Doto ships its roundness axis, not just its weight', () => {
  // The regression itself, pinned by name as well as by the derived rule above:
  // the derived test is the one that covers a future axis, this one says out
  // loud which axis was lost and must not be dropped again.
  const requested = requestedAxes(SRC);
  assert.ok(requested?.has('ROND'), 'Doto must be requested with its ROND axis, not wght alone');
  assert.deepEqual(requested.get('ROND'), [0, 100], 'ROND must be requested across its full 0..100 range');
});
