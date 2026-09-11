// tests/homepage-climb-route.test.mjs
//
// The homepage fold draws a route climbing to a summit it FINDS on the front
// ridge, and its trailhead was `H*0.86` — 0.14H above the canvas floor — while
// `.camps` sits at `bottom:78px` with ~41px of label, i.e. the camps own
// 78..119px of that same floor. 0.14H lands INSIDE that band for every canvas
// height from 558 to 850px, which is every ordinary desktop window, so the route
// was drawn starting on top of the stats and climbed out through "0 ads · Shape
// Radio, included". Measured in Chromium before the fix at 1657/1440/1280/1024/
// 860: 83/12/52/83/6 sampled columns of route inside that camp's box, clearances
// of -12/-1/-15/-20/-1px.
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
// These drive the SHIPPED functions lifted out of the page and pin invariants
// rather than the numbers that currently satisfy them. The sweep carries a
// positive control, because a guard that cannot fail on the old code is not
// reporting on this one.
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

const CAMP_CLEAR = Number(expr(/var CAMP_CLEAR=(\d+)/, 'CAMP_CLEAR'));
// x0 lives inside draw()'s combined `var` declaration, where it has always been —
// anchored between its own name and the trailhead that follows it.
const X0_SRC = expr(/\bx0=([^,;]+),\s*y0=/, 'x0');

/* The camps as the stylesheet actually places them: absolute, bottom:78px, and
   ~41px of label. Read from the CSS rather than retyped, so a restyle that moves
   them fails here instead of silently moving the route back onto them. */
const CAMPS_BOTTOM = Number(expr(/\.camps\{[^}]*?bottom:(\d+)px/, '.camps bottom'));
const CAMP_H = 41;

/** Drive the shipped measureBase() against a stubbed canvas and camps box. */
function baseFor({ W, H, campsTop, campsH = CAMP_H, hasCamps = true }) {
  const rect = (top, height) => ({ top, height, bottom: top + height });
  const cv = { getBoundingClientRect: () => rect(0, H) };
  const el = { getBoundingClientRect: () => rect(campsTop, campsH) };
  const doc = { querySelector: (s) => (hasCamps && s === '.camps' ? el : null) };
  const fn = Function('document', 'cv', 'W', 'H', 'CAMP_CLEAR', `${grab('measureBase')}; return measureBase;`)(doc, cv, W, H, CAMP_CLEAR);
  return fn();
}

test('the trailhead clears the camps at every fold shape — and the old constant did not', () => {
  // ⚠ A FLOOR ON THE CLEARANCE ITSELF, because the sweep below reads CAMP_CLEAR
  // out of the page: set it to 0 and every assertion about clearing the camps is
  // satisfied by a trailhead drawn exactly on their top edge. Mutation-proven —
  // `CAMP_CLEAR=0` was the one mutant that survived the first round. The route is
  // stroked 7px wide, so ~4px of halo sits above its centre line; anything under
  // that lays the glow across the labels' ascenders even with the line itself
  // technically outside the box.
  assert.ok(CAMP_CLEAR >= 12, `a clearance of ${CAMP_CLEAR}px puts the route's halo on the stats`);

  let oldWouldCollide = 0;
  for (let H = 520; H <= 1000; H += 1) {
    const campsTop = H - CAMPS_BOTTOM - CAMP_H;           // where the stylesheet puts them
    const base = baseFor({ W: 1440, H, campsTop });

    // the route only ever rises, so clearing the camps at the trailhead clears
    // them for the whole climb — the monotonicity is pinned separately below.
    assert.ok(base <= campsTop - CAMP_CLEAR + 0.001,
      `H=${H}: trailhead at ${base.toFixed(1)} is only ${(campsTop - base).toFixed(1)}px above the camps' top ${campsTop}`);

    if (H * 0.86 >= campsTop && H * 0.86 <= campsTop + CAMP_H) oldWouldCollide++;
  }
  // POSITIVE CONTROL: without this the sweep above would pass just as happily on
  // a fold whose camps the route never came near, proving nothing.
  assert.ok(oldWouldCollide > 250,
    `the fixture never reaches the hazard: the retired H*0.86 rule collided in only ${oldWouldCollide} of the swept heights`);
});

test('the camps constrain the route only where they actually overlap the terrain', () => {
  const H = 300;   // below 760px the canvas is its own band and the camps sit under it
  assert.equal(baseFor({ W: 390, H, campsTop: H + 40 }), H * 0.86);
  assert.equal(baseFor({ W: 760, H, campsTop: H + 12 }), H * 0.86);
  // no camps on the page at all, and a collapsed camps box, are the same case
  assert.equal(baseFor({ W: 1440, H: 800, campsTop: 600, hasCamps: false }), 800 * 0.86);
  assert.equal(baseFor({ W: 1440, H: 800, campsTop: 600, campsH: 0 }), 800 * 0.86);
});

test('no clamp may move the trailhead back toward the camps', () => {
  // ⚠ THE INVARIANT, NOT THE BOUNDS. A first cut floored the trailhead at H*0.55
  // with `Math.max`, which on a y axis picks the point LOWER on the screen — a
  // floor that could push the route back down through its own clearance into the
  // labels. Bounds are a means; this is the end, and it holds at every camps
  // position rather than at the two the old test happened to name.
  const H = 800;
  for (let campsTop = -40; campsTop <= H + 40; campsTop += 7) {
    const base = baseFor({ W: 1440, H, campsTop });
    assert.ok(base <= Math.max(0, campsTop - CAMP_CLEAR) + 1e-9,
      `camps at ${campsTop}: trailhead ${base.toFixed(1)} is nearer them than the clearance allows`);
    assert.ok(base >= 0, `camps at ${campsTop}: trailhead ${base.toFixed(1)} is off the top of the canvas`);
    assert.ok(base <= H * 0.92 + 1e-9, `camps at ${campsTop}: trailhead ${base.toFixed(1)} is down in the wire`);
  }
});

test('the trailhead has ONE source, and it is the measurement', () => {
  const code = stripComments(SRC);
  assert.match(code, /\by0=baseY\b/, 'draw() must take the trailhead from the measured base');
  // Nothing but the measurement may compute the trailhead. The declaration's own
  // `= 0` is a placeholder, not a rule — it is the only other right-hand side
  // allowed, and a third one is a second opinion about where the route starts.
  const writes = [...code.matchAll(/baseY\s*=\s*([^,;]+)/g)].map((m) => m[1].trim());
  assert.ok(writes.length >= 2, 'baseY is never written — the trailhead is not being measured at all');
  for (const rhs of writes) {
    assert.ok(rhs === '0' || rhs === 'measureBase()', `the trailhead is written as \`${rhs}\` — only measureBase() may decide it`);
  }
  assert.ok(writes.includes('measureBase()'), 'and the measurement must actually be the one that runs');
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
