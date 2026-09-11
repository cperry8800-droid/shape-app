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

/** Every axis the stylesheet request asks for, KEYED BY FAMILY:
 *  Map<family, Map<axisTag, [min,max]>>. A css2 family reads `Name:a1,a2@t1;t2`,
 *  where each `;`-separated tuple carries one `,`-separated value per axis, in
 *  order.
 *
 *  ⚠ KEYED BY FAMILY, NOT UNIONED — CodeRabbit, #2045. The first version
 *  flattened every family into one map, which cannot see the regression it was
 *  written for: move `ROND` from Doto to Anybody and the union still contains
 *  `ROND`, so both tests pass while every Doto figure goes inert again. The
 *  union is kept below as a broad net, but the named regression is checked
 *  against Doto's OWN request. */
function requestedAxes(html) {
  const link = /fonts\.googleapis\.com\/css2\?([^"']+)/.exec(html);
  if (!link) return null;
  const out = new Map();
  for (const part of link[1].split('&')) {
    if (!part.startsWith('family=')) continue;
    const spec = decodeURIComponent(part.slice('family='.length));
    const colon = spec.indexOf(':');
    if (colon < 0) continue;                       // no axes requested at all
    // css2 spells a space in a family name as `+`, which decodeURIComponent
    // leaves alone — that is form encoding, not percent encoding.
    const family = spec.slice(0, colon).replace(/\+/g, ' ');
    const [axisList, valueList = ''] = spec.slice(colon + 1).split('@');
    const axes = axisList.split(',').map((s) => s.trim()).filter(Boolean);
    if (!out.has(family)) out.set(family, new Map());
    const fam = out.get(family);
    for (const tuple of valueList.split(';')) {
      const vals = tuple.split(',');
      axes.forEach((tag, i) => {
        const r = range(vals[i]);
        if (!r) return;
        const prev = fam.get(tag);
        fam.set(tag, prev ? [Math.min(prev[0], r[0]), Math.max(prev[1], r[1])] : r);
      });
    }
  }
  return out;
}

/** The broad net: every axis requested by ANY family, unioned.
 *
 *  ⚠ THIS IS DELIBERATELY WEAKER THAN THE PER-FAMILY CHECK, and the reason is
 *  written here rather than discovered later. Deciding which family a given
 *  `font-variation-settings` rule applies to means resolving the CSS cascade
 *  — selector matching, inheritance, `var(--num)` indirection — which a source
 *  scan cannot do honestly. So the derived sweep asks the question it CAN
 *  answer ("is this axis requested at all?"), which still catches an axis
 *  nobody asked for, and the families we can name are checked exactly below. */
function unionAxes(byFamily) {
  const out = new Map();
  for (const fam of byFamily.values()) {
    for (const [tag, r] of fam) {
      const prev = out.get(tag);
      out.set(tag, prev ? [Math.min(prev[0], r[0]), Math.max(prev[1], r[1])] : r);
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

/** The `font-weight` values set on rules that carry AXIS, plus the family that
 *  axis belongs to — `{ family, weights }`, or null when AXIS is not requested
 *  by exactly one family.
 *
 *  ⚠ A RULE THAT SETS A SINGLE-FAMILY AXIS IS A RULE FOR THAT FAMILY, BY
 *  CONSTRUCTION. That is what makes a per-family weight check honest here
 *  without resolving the cascade: if exactly one family requests `ROND`, then a
 *  rule setting `ROND` either targets that family or is inert — and inert is
 *  precisely what the sibling test forbids. `font-weight` is a plain CSS
 *  property, so it never appears in the axis sweep at all; this is the only
 *  bridge from a weight back to the family that has to serve it.
 *
 *  ⚠ AND THE PRECONDITION IS ASSERTED, NOT ASSUMED. Returning null when the axis
 *  is shared is the whole safety of the inference: add `ROND` to a second family
 *  and this stops claiming to know whose rule it is, rather than quietly
 *  attributing every ROND rule to the wrong font. */
function weightsOfFamilyWithUniqueAxis(html, byFamily, axis) {
  const owners = [...byFamily.entries()].filter(([, axes]) => axes.has(axis)).map(([f]) => f);
  if (owners.length !== 1) return null;
  const weights = new Set();
  // ⚠ THE AXIS MAY SIT ANYWHERE IN THE DECLARATION — CodeRabbit, #2045. Anchoring
  // it immediately after the property name misses `'wght' 900,'ROND' 30`, which
  // CSS allows and which this page could legitimately be written as tomorrow: the
  // rule would not be recognised as that family's, its weight would never be
  // collected, and an out-of-range weight would pass unseen. Blocks are already
  // split on `}`, so `[^;}]*` cannot run past the declaration.
  const re = new RegExp(`font-variation-settings\\s*:\\s*[^;}]*['"]${axis}['"]`);
  for (const block of html.split('}')) {
    if (!re.test(block)) continue;
    for (const m of block.matchAll(/font-weight\s*:\s*(\d{2,3})\b/g)) weights.add(Number(m[1]));
  }
  return { family: owners[0], weights };
}

/** Assert a family's own requested `wght` range covers every weight the page
 *  sets on that family's rules. */
function assertWeightsFit(byFamily, derived, label) {
  assert.ok(derived, `${label} must be requested by exactly one family for this check to be sound`);
  assert.ok(derived.weights.size > 0, `derived zero ${label} weights \u2014 the block scan stopped matching`);
  const range = byFamily.get(derived.family)?.get('wght');
  assert.ok(range, `${derived.family} must request a wght axis`);
  const [lo, hi] = range;
  for (const w of derived.weights) {
    assert.ok(
      w >= lo && w <= hi,
      `a ${derived.family} rule sets font-weight ${w}, but ${derived.family} is requested at ` +
        `wght ${lo}..${hi} \u2014 the weight is clamped, so the glyph is not the one the rule asks ` +
        `for. Weights on that family: ${[...derived.weights].sort((a, b) => a - b).join(', ')}`,
    );
  }
}

test('the homepage requests every variable-font axis it sets', () => {
  const byFamily = requestedAxes(SRC);
  const used = usedAxes(SRC);

  // Vacuity controls, both directions: a parser that quietly stops matching
  // passes this file trivially, and that is exactly how the defect survived.
  assert.ok(byFamily, 'no Google Fonts css2 request found \u2014 the scan is broken, not the page');
  assert.ok(byFamily.size > 0, 'parsed zero families \u2014 the family parser stopped matching');
  assert.ok(used.size > 0, 'parsed zero used axes \u2014 the declaration parser stopped matching');

  const requested = unionAxes(byFamily);
  assert.ok(requested.size > 0, 'parsed zero requested axes \u2014 the axis parser stopped matching');

  for (const [tag, values] of used) {
    assert.ok(
      requested.has(tag),
      `font-variation-settings sets '${tag}' but no family in the font URL requests it, so Google ` +
        `Fonts pins it at its default and every '${tag}' declaration on the page is inert. ` +
        `Requested: ${[...requested.keys()].join(', ')}`,
    );
    const [lo, hi] = requested.get(tag);
    for (const v of values) {
      assert.ok(
        v >= lo && v <= hi,
        `'${tag}' is set to ${v} but only ${lo}..${hi} is requested \u2014 the value is clamped, ` +
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
  // rather than the URL. Unreachable from the shipped file \u2014 which is exactly
  // why it needs driving here, or the check is decoration the next reader trusts.
  const synthetic = '<link href="https://fonts.googleapis.com/css2?family=Doto:ROND,wght@auto,100..900">';
  const doto = requestedAxes(synthetic).get('Doto');
  assert.ok(!doto.has('ROND'), 'an unparseable range must not be recorded as a known one');
  assert.deepEqual(doto.get('wght'), [100, 900], 'and the axes that DO parse are still recorded');
});

test('a rule is recognised whichever order its axes are listed in', () => {
  // The regression CodeRabbit named: `wght` first, the family's own axis second.
  // Without it this rule is invisible to the deriver and its 900 is never checked.
  const byFamily = new Map([['Doto', new Map([['ROND', [0, 100]], ['wght', [100, 400]]])]]);
  const html = ".x{font-family:var(--num);font-variation-settings:'wght' 900,'ROND' 30;font-weight:900}";
  const got = weightsOfFamilyWithUniqueAxis(html, byFamily, 'ROND');
  assert.ok(got, 'ROND is requested by exactly one family here, so this must resolve');
  assert.deepEqual([...got.weights], [900], 'the axis-second rule must be collected');
  // and the whole point: that weight is outside Doto's 100..400, so it must fail
  assert.throws(
    () => assertWeightsFit(byFamily, got, 'ROND'),
    /font-weight 900/,
    'an out-of-range weight in an axis-second rule must still be caught',
  );
});

test('a family name containing a space is read as that family', () => {
  // css2 spells a space as `+`, which decodeURIComponent does NOT undo. Left
  // unhandled, `Schibsted Grotesk` keys the map as `Schibsted+Grotesk` and any
  // per-family lookup for it silently misses \u2014 the family reads as requesting
  // no axes at all, which is the fail-open direction.
  const byFamily = requestedAxes(SRC);
  assert.ok(byFamily.has('Schibsted Grotesk'), `families parsed: ${[...byFamily.keys()].join(', ')}`);
});

test('Doto ships its roundness axis, not just its weight', () => {
  // THE REGRESSION ITSELF, and it is checked against Doto's OWN request rather
  // than the union \u2014 CodeRabbit, #2045. Against the union this test passes when
  // ROND is merely requested by SOME family, so moving it to Anybody would take
  // every Doto figure back to the inert default with the suite still green.
  const byFamily = requestedAxes(SRC);
  assert.ok(byFamily, 'no Google Fonts css2 request found');
  const doto = byFamily.get('Doto');
  assert.ok(doto, `Doto must be requested by name. Families: ${[...byFamily.keys()].join(', ')}`);
  assert.ok(doto.has('ROND'), "Doto must be requested with its ROND axis, not wght alone");
  assert.deepEqual(doto.get('ROND'), [0, 100], 'ROND must be requested across its full 0..100 range');
  assert.ok(doto.has('wght'), 'and Doto still needs its weight axis');

  // ⚠ AND ITS WEIGHT RANGE, NOT JUST THE AXIS — CodeRabbit, #2045, the same blind
  // spot one level down. `doto.has('wght')` passes on `Doto:ROND,wght@100..400`
  // while the derived sweep above is satisfied by ANYBODY's 100..900 through the
  // union, so every Doto figure would clamp to 400 with the suite green. The
  // weights are read off the page rather than named here, so restyling a figure
  // is covered with nobody remembering this test exists.
  assertWeightsFit(byFamily, weightsOfFamilyWithUniqueAxis(SRC, byFamily, 'ROND'), 'ROND');
});

test("Anybody's weight range covers the weights the page sets on it", () => {
  // The same inference pointed at the other single-family axis, so the class is
  // closed rather than patched once per round: `wdth` is Anybody's and nobody
  // else's, so a rule setting it is an Anybody rule, and Anybody's OWN requested
  // wght range must carry those weights. Without this, narrowing Anybody to
  // wght@100..400 passes — Doto contributes 100..900 to the union and the Doto
  // test only ever looks at Doto.
  const byFamily = requestedAxes(SRC);
  assertWeightsFit(byFamily, weightsOfFamilyWithUniqueAxis(SRC, byFamily, 'wdth'), 'wdth');
});

// ⚠ SCHIBSTED GROTESK IS DELIBERATELY NOT CHECKED THIS WAY, and saying so is the
// point: it requests no axis of its own (ital and wght are shared), so there is
// no rule on this page that can be attributed to it without resolving the
// cascade. Its weights are covered only by the union sweep above. Registered
// rather than faked — a check that guessed which rules were Schibsted's would be
// a claim this file cannot support.

test('the display width axis is set in one place and the reveal reads it back', () => {
  // ⚠ THIS NUMBER USED TO LIVE IN FOUR PLACES: `--w` at :root, the `.hero h1 .w`
  // fallback, the reduced-motion branch of reveal(), and the `62+56` arithmetic
  // that animated toward it. Narrowing the headline meant landing all four, and
  // missing one leaves the words animating past the width every other heading
  // uses — a disagreement nothing would report, because both values are legal.
  const root = [...SRC.matchAll(/--w\s*:\s*(\d+(?:\.\d+)?)\s*;/g)].map((m) => Number(m[1]));
  assert.equal(root.length, 1, `--w must be declared exactly once, found ${root.length}`);
  const target = root[0];

  // The hero's own rule may not restate it: it must defer to --w.
  const hero = /\.hero h1 \.w\{[^}]*\}/.exec(SRC);
  assert.ok(hero, 'no .hero h1 .w rule found \u2014 the scan is broken, not the page');
  assert.match(hero[0], /var\(--hw,\s*var\(--w\)\)/, 'the hero headline must fall back to --w, not a literal');

  // Nor may the reveal: it reads the computed value.
  assert.match(SRC, /function headWidth\(\)/, 'reveal() must read the target rather than restate it');
  assert.match(SRC, /getPropertyValue\('--w'\)/, 'headWidth() must read --w from the computed style');

  // And both ends of the animation must be axis values the font was asked for,
  // or the words animate through a width Google Fonts never delivered.
  const byFamily = requestedAxes(SRC);
  const [lo, hi] = byFamily.get('Anybody').get('wdth');
  const from = Number(/var to=headWidth\(\), from=(\d+)/.exec(SRC)?.[1]);
  assert.ok(Number.isFinite(from), 'could not read the reveal start width');

  // ⚠ AND headWidth()'s OWN FALLBACK IS THE THIRD VALUE, because nothing used to
  // check it and it went stale in exactly the way this test exists to prevent: it
  // still read 105 after --w moved to 90, a copy of the number inside the function
  // written to stop there being copies of the number. It is only reachable when --w
  // is missing, so it is NOT asserted to equal --w — it is deliberately independent
  // — but it still has to be a width the font was actually asked for, or the broken
  // state renders through an axis value Google Fonts never delivered.
  const fallback = Number(/return \(isFinite\(v\) && v > 0\) \? v : (\d+(?:\.\d+)?);/.exec(SRC)?.[1]);
  assert.ok(Number.isFinite(fallback), "could not read headWidth()'s fallback width");

  for (const [label, v] of [['start', from], ['target', target], ['fallback', fallback]]) {
    assert.ok(v >= lo && v <= hi, `the reveal ${label} width ${v} is outside Anybody's requested ${lo}..${hi}`);
  }
});
