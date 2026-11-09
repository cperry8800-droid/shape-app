// tests/homepage-climb-route.test.mjs
//
// The homepage fold draws a route climbing to a summit it FINDS on the front
// ridge. Its trailhead was once measured against three stats that sat along the
// bottom of the fold (`.camps`: "$5/mo", "0 ads", "1 app"), because the route had
// been drawn starting on top of them. The owner took the stats out (2026-11-09),
// so the trailhead is a fixed fraction of the canvas again, and what it must
// clear is the wire, the ticker along the fold's floor.
//
// ⚠ THE ROUTE'S SPAN AND SHAPE ARE DELIBERATELY UNTOUCHED, AND THAT IS AN OWNER
// RULING RATHER THAN A LIMIT OF THE FIX. A first cut also derived the start from
// a declared pitch, which cleared the stats a second way and roughly doubled the
// angle — at the cost of half the route's width, because the only rise available
// is what the mountain leaves between the camps and the summit. Owner: "It just
// needs to be moved up a little so it's not overlapping the stats at bottom." So
// the last test here pins the span as independent of the rise, which is what
// stops a later session deriving it again.
//
// These read the SHIPPED page and pin invariants rather than the numbers that
// currently satisfy them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8');

/** Lift a named function declaration whole.
 *
 *  ⚠ SKIPS THE PARAMETER LIST BEFORE COUNTING BRACES. Counting from the first
 *  `{` after the name opens and closes on a destructured parameter and hands
 *  back the signature — after which every assertion made against it is
 *  vacuously true. (Paid for in #2032 and again in the recipe-import wave.) */
function grab(name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(SRC);
  assert.ok(m, `grab: no function ${name} in the page`);
  let i = SRC.indexOf('(', m.index), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '(') depth++;
    else if (SRC[i] === ')' && --depth === 0) { i++; break; }
  }
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let j = open; j < SRC.length; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}' && --d === 0) {
      const body = SRC.slice(m.index, j + 1);
      // guard-the-guard: a matcher that stopped inside the parameter list hands
      // back a signature, and every assertion made against it is then vacuously
      // true. A real body closes on a brace and has at least one statement in it.
      assert.ok(/;|return\b/.test(body.slice(body.indexOf('{'))), `grab: ${name} came back with no statements — that is a signature, not a body`);
      return body;
    }
  }
  throw new Error(`grab: unbalanced ${name}`);
}

/** The single statement that places the trailhead's x, lifted verbatim. */
function expr(re, label) {
  const m = re.exec(SRC);
  assert.ok(m, `${label}: not found in the page`);
  return m[1];
}

// x0 lives inside draw()'s combined `var` declaration, where it has always been —
// anchored between its own name and the trailhead that follows it.
const X0_SRC = expr(/\bx0=([^,;]+),\s*y0=/, 'x0');
const BASE_U = Number(expr(/var BASE_U=([\d.]+)/, 'BASE_U'));
const WIRE_CLEAR = Number(expr(/WIRE_CLEAR=(\d+)/, 'WIRE_CLEAR'));
// The wire as the stylesheet sizes it on a desktop fold, read rather than retyped.
const WIRE_H = Number(expr(/\.wire\{[^}]*?height:(\d+)px/, '.wire height'));
// The route is stroked 7px wide: ~4px of it sits under its centre line.
const HALO = 4;

/** The shipped trailhead() for a canvas H tall. */
const trailheadAt = (H) => Function('H', 'BASE_U', 'WIRE_CLEAR', `${grab('trailhead')}; return trailhead();`)(H, BASE_U, WIRE_CLEAR);

test('the fold carries no stats, and nothing measures them', () => {
  // Owner, 2026-11-09, on a screenshot of the three stats: "remove these from
  // home page on website". Gone with them: the eyebrow over the headline, and the
  // script that placed the trailhead against the stats' box.
  const code = stripComments(SRC);
  assert.doesNotMatch(code, /class="camps?"|\.camps?\{|querySelector\('\.camps'\)/, 'the stats strip is back on the fold');
  assert.doesNotMatch(code, /one platform fee<\/span>|Shape Radio, included/, 'a removed stat is back on the fold');
  assert.doesNotMatch(code, /class="eyb"|Your climb · Shape Score/, 'the fold eyebrow is back');
  assert.doesNotMatch(code, /measureBase|CAMP_CLEAR/, 'the trailhead is still being measured against stats that are gone');
});

test('the trailhead clears the wire, stroke included, on every fold', () => {
  assert.ok(BASE_U > 0.5 && BASE_U < 1, `a trailhead at ${BASE_U}H is off the mountain`);
  let fractionAloneFails = 0;
  for (let H = 200; H <= 1400; H += 1) {
    const base = trailheadAt(H);
    assert.ok(H - base >= WIRE_H + HALO - 1e-9,
      `H=${H}: the trailhead is ${(H - base).toFixed(1)}px above the floor, and the wire plus the stroke need ${WIRE_H + HALO}`);
    assert.ok(base > 0, `H=${H}: the trailhead is off the top of the canvas`);
    if (H - H * BASE_U < WIRE_H + HALO) fractionAloneFails++;
  }
  // POSITIVE CONTROL: the bare fraction did draw the stroke into the wire on
  // short folds (Codex on #2659, 800x402), so the sweep reaches the hazard.
  assert.ok(fractionAloneFails > 100, `the sweep never reaches a fold where 0.14H is too little (${fractionAloneFails})`);
  // And on an ordinary window the fraction, not the floor, decides.
  assert.equal(trailheadAt(828), 828 * BASE_U, 'the floor binds on a 1440x900 fold, moving the route for no reason');
});

test('the trailhead has ONE source', () => {
  const code = stripComments(SRC);
  assert.match(code, /\by0=baseY\b/, 'draw() must take the trailhead from baseY');
  // The declaration's own `= 0` is a placeholder, not a rule — it is the only
  // other right-hand side allowed, and a third one is a second opinion about
  // where the route starts.
  const writes = [...code.matchAll(/baseY\s*=\s*([^,;]+)/g)].map((m) => m[1].trim());
  assert.ok(writes.includes('trailhead()'), 'baseY is never set from trailhead() — the route is stuck at the canvas top');
  for (const rhs of writes) {
    assert.ok(rhs === '0' || rhs === 'trailhead()', `the trailhead is written as \`${rhs}\` — only trailhead() may decide it`);
  }
});

test("the route's span is independent of its rise — the owner's ruling, pinned", () => {
  // Lifting the route clear of the stats is a VERTICAL change. A start derived
  // from the rise (a pitch, a target angle, a setback from the summit) shortens
  // the route, because the rise is only ever what the mountain leaves between
  // the camps and the summit — which is the version the owner sent back.
  //
  // ⚠ IT ASKS ABOUT EVERY ASSIGNMENT, NOT THE DECLARATION'S INITIALIZER. A first
  // version read only where x0 is first set, and the mutation that matters —
  // leave the initializer alone, then reassign x0 from the rise on the next
  // statement — walked straight past it with the suite green. That is exactly
  // the shape the declined change would take if someone reintroduced it.
  const draw = grab('draw');
  const sets = [...draw.matchAll(/\bx0\s*=(?!=)([^,;]+)/g)].map((m) => m[1].trim());
  assert.equal(sets.length, 1, `x0 is assigned ${sets.length} times in draw() — a second one is a second opinion about where the route starts`);
  assert.doesNotMatch(sets[0], /\bsy\b|\by0\b|\bbaseY\b|\bbest\b|PITCH|Math\.tan/,
    `the start is derived from the rise (\`${sets[0]}\`) — that shortens the route, which is the change the owner declined`);
  assert.match(sets[0], /\bW\b/, 'the start is still placed across the width');
});

test('the route only rises, which is what makes one clearance check enough', () => {
  // buildProfile writes to the page's closure `prof`; give it one of its own
  // and hand it the page's own hash() rather than a restatement of it.
  const prof = Function(`${grab('hash')};${grab('buildProfile')};var prof=[];buildProfile();return prof;`)();
  assert.ok(prof.length > 2, 'the profile came back empty');
  assert.equal(prof[0], 0);
  assert.equal(prof[prof.length - 1], 1);
  for (let i = 1; i < prof.length; i++) {
    assert.ok(prof[i] >= prof[i - 1], `the profile dips at step ${i} — a climb that descends breaks the trailhead-clears-everything argument`);
  }
});
