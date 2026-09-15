import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The member journey's point cloud shares its canvas with the phone column
// (#jcanvas is `inset:0` on .jpin), so the cloud has to fit itself into the room
// left of the phone. This drives the SHIPPED geometry — the constants are built
// by running the page's own IIFE, and the clamp is lifted verbatim — because a
// restatement here would be testing the restatement.
//
// ⚠ WHAT THIS DOES NOT COVER, SAID PLAINLY: it drives the clamp with `phoneL`
// handed to it, so it cannot see a change to HOW that number is measured —
// `resize()` reading the phone's own rect is a browser question and a mutation
// setting `phoneL = 0` survives this file by design. The browser drive is the
// evidence for that half. (The mutation that widens a pad at its draw site also
// survives, and that one is a PROVEN no-op: PAINT reads the very same constant,
// so the draw and the bound cannot drift apart at all.)
//
// ⚠ THE DEFECT THIS EXISTS FOR IS INVISIBLE TO A RENDER. The bound was once
// `max(orb[i].r)`: the largest of eleven UNSEEDED draws from [1.00, 1.35). A
// browser measurement of it passes or fails by luck, and the centre glow reaches
// 1.35*R whatever the orbs drew, so it escaped an orb-derived bound outright.
// Every row of PAINT must therefore be a BOUND, and that is what is asserted.

const HTML = readFileSync('public/newdesign/index.html', 'utf8');

function journeyScript() {
  const blocks = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const hit = blocks.filter((b) => b.includes("getElementById('jcanvas')"));
  assert.equal(hit.length, 1, 'expected exactly one inline script to own #jcanvas');
  return hit[0];
}

// Run the page's own IIFE under a stub DOM and hand back its constants, plus the
// geometry block lifted out of it as a callable. Nothing here re-derives a value.
function loadJourney() {
  const js = journeyScript();
  const open = js.indexOf('(function(){');
  const close = js.lastIndexOf('})();');
  assert.ok(open >= 0 && close > open, 'the journey IIFE no longer has the shape this reads');
  const iife = js.slice(open + '(function(){'.length, close);

  const A = '      var wide=W>900,';
  const B = '      var R=Rb*(1+mPa*Math.sin(t*mPs));';
  const a = iife.indexOf(A);
  const b = iife.indexOf(B);
  assert.ok(a >= 0 && b > a, 'the per-frame geometry block no longer has the shape this lifts');
  const geom = iife.slice(a, b);
  assert.ok(geom.includes('phoneL'), 'the lifted block does not read the phone — re-anchor this');

  const mod = new Function(`
    var __nodes=[{classList:{toggle:function(){}}}];
    var document={getElementById:function(id){
      if(id==='journey') return {querySelectorAll:function(){return __nodes;}};
      if(id==='jtrack') return {getBoundingClientRect:function(){return{top:0,height:1000};}};
      return null; }};
    var window={innerWidth:1440,innerHeight:900,addEventListener:function(){},scrollY:0};
    function Image(){ return {}; }
    function requestAnimationFrame(){}
${iife}
    return { PAINT:PAINT, PA_MAX:PA_MAX, J_GUT:J_GUT, J_MINCX:J_MINCX,
             CLOUD_R:CLOUD_R, ORB_R0:ORB_R0, ORB_RSPAN:ORB_RSPAN, orb:orb,
             GLOW_R0:GLOW_R0, GLOW_RAMP:GLOW_RAMP, ECG_HALF:ECG_HALF, ARC_R:ARC_R,
             ORB_GLOW:ORB_GLOW, ECG_GLOW:ECG_GLOW, ARC_GLOW:ARC_GLOW,
             geom:function(W,H,phoneL){
${geom}
               return { cx:cx, Rb:Rb, wide:wide };
             } };
  `)();

  assert.ok(Array.isArray(mod.PAINT) && mod.PAINT.length >= 5,
    'read only ' + (mod.PAINT || []).length + ' painted effects — the IIFE stopped building PAINT');
  for (const row of mod.PAINT) {
    assert.ok(Array.isArray(row) && row.length === 2, 'a PAINT row is not [reach, pad]');
    assert.ok(Number.isFinite(row[0]) && row[0] > 0, 'a PAINT reach is not a positive number');
    assert.ok(Number.isFinite(row[1]) && row[1] >= 0, 'a PAINT pad is not a number');
  }
  return mod;
}

// ⚠ THE SWEEP BELOW MUST NOT TRUST `PAINT`. Checking the clamp against the table
// it was fed only proves self-consistency: revert one row to a sampled value and
// the clamp still "clears" the smaller number it was handed. So the expectation is
// rebuilt here from the DRAW SITES' own named constants, and the sweep runs over
// the union of that and PAINT — a wrong row then fails, and so does a new effect.
function expectedExtents(m) {
  const fromDraw = [
    [m.ORB_R0 + m.ORB_RSPAN, m.ORB_GLOW],   // an orb's orbit + its glow box
    [m.GLOW_R0 + m.GLOW_RAMP, 0],           // the centre glow, which no orb bounds
    [m.CLOUD_R, 0],                         // the cloud, measured off the shapes
    [m.ECG_HALF, m.ECG_GLOW],               // the ECG sweep head + its glow box
    [m.ARC_R, m.ARC_GLOW],                  // the score arc + its head glow
  ];
  for (const [r, pad] of fromDraw) {
    assert.ok(Number.isFinite(r) && r > 0, 'a draw-site reach did not resolve to a number');
    assert.ok(Number.isFinite(pad) && pad >= 0, 'a draw-site pad did not resolve to a number');
  }
  return fromDraw.concat(m.PAINT);
}

test('nothing the journey paints crosses into the phone, at any viewport', () => {
  const m = loadJourney();
  const extents = expectedExtents(m);
  const br = 1 + m.PA_MAX;
  let checked = 0;
  // phoneL is MEASURED off the live layout, so it is swept independently of W
  // rather than modelled — that covers every real column position and then some.
  for (let W = 861; W <= 1920; W += 37) {
    for (let H = 600; H <= 1400; H += 97) {
      for (let phoneL = 120; phoneL < W; phoneL += 53) {
        const g = m.geom(W, H, phoneL);
        assert.ok(Number.isFinite(g.Rb) && g.Rb >= 0, `Rb went bad at ${W}x${H} phoneL=${phoneL}`);
        assert.ok(Number.isFinite(g.cx), `cx went bad at ${W}x${H} phoneL=${phoneL}`);
        const lim = phoneL - m.J_GUT;
        for (const [reach, pad] of extents) {
          const edge = g.cx + reach * br * g.Rb + pad;
          assert.ok(edge <= lim + 1e-9,
            `an effect (reach ${reach}, pad ${pad}) reaches ${edge.toFixed(1)} past ${lim} ` +
            `at ${W}x${H} phoneL=${phoneL}`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 2000, `swept only ${checked} layouts — the sweep stopped running`);
});

test('the cloud shifts left before it shrinks, and never past the floor', () => {
  const m = loadJourney();
  for (let W = 861; W <= 1920; W += 53) {
    for (let H = 600; H <= 1400; H += 113) {
      for (let phoneL = 400; phoneL < W; phoneL += 71) {
        const g = m.geom(W, H, phoneL);
        if (g.Rb <= 0) continue;               // degenerate: nothing is painted at scale
        const cx0 = g.wide ? W * 0.62 : W * 0.5;
        const floor = Math.min(cx0, W * m.J_MINCX);
        assert.ok(g.cx >= floor - 1e-9,
          `cx ${g.cx.toFixed(1)} was pushed left of the floor ${floor.toFixed(1)} at ${W}x${H}`);
      }
    }
  }
});

test('with the phone hidden the clamp does not run at all', () => {
  const m = loadJourney();
  // offsetParent is null exactly when .jph is display:none, so phoneL is 0 and
  // the cloud is centred as it always was. This is the narrow layout's control.
  for (const [W, H] of [[820, 900], [760, 800], [640, 900], [1280, 800]]) {
    const g = m.geom(W, H, 0);
    const wide = W > 900;
    assert.equal(g.cx, wide ? W * 0.62 : W * 0.5, `cx moved with no phone at ${W}x${H}`);
    assert.equal(g.Rb, Math.min(wide ? W * 0.22 : W * 0.30, H * 0.30),
      `Rb moved with no phone at ${W}x${H}`);
  }
});

test('every reach is a bound, never a sample of what this page load drew', () => {
  const m = loadJourney();
  const orbit = m.ORB_R0 + m.ORB_RSPAN;
  assert.ok(m.orb.length >= 7, `only ${m.orb.length} orbs were built — the IIFE stopped running`);

  // the orbit row is the GENERATOR's bound, and it covers every radius that
  // generator can draw — a sampled max is smaller than this almost always.
  const sampled = Math.max(...m.orb.map((o) => o.r));
  assert.ok(sampled <= orbit + 1e-9, 'an orb was drawn outside its own generator bound');
  assert.ok(m.PAINT.some(([r]) => Math.abs(r - orbit) < 1e-9),
    'no PAINT row carries the orbit bound ORB_R0 + ORB_RSPAN');

  // ⚠ AND THE CENTRE GLOW NEEDS ITS OWN ROW. It reaches 1.35*R whatever the orbs
  // drew, so a bound taken from the orbs — sampled OR bounded — is not a bound on
  // it. This is the half of the defect an orb-only fix would have left behind.
  const glow = /var grr=R\*\(GLOW_R0\+GLOW_RAMP\*/.test(journeyScript());
  assert.ok(glow, 'the centre glow no longer reads its radius from the named constants');
  assert.ok(m.PAINT.filter(([r]) => Math.abs(r - orbit) < 1e-9).length >= 2,
    'the centre glow and the orbit are meant to be two separate rows of PAINT');

  // the cloud's own reach is measured off the shapes, so it cannot drift from them
  assert.ok(m.CLOUD_R > 0.9 && m.CLOUD_R < 1.2,
    `CLOUD_R measured ${m.CLOUD_R} — that is not the shapes this page builds`);

  // and PAINT itself carries every draw-site extent, so the table is the bound
  // rather than merely being consistent with whatever it happens to hold.
  for (const [r, pad] of expectedExtents(m).slice(0, 5)) {
    assert.ok(m.PAINT.some(([pr, pp]) => pr >= r - 1e-9 && pp >= pad - 1e-9),
      `no PAINT row bounds a draw-site extent of reach ${r} pad ${pad}`);
  }
});

test('every fixed glow box in the journey is accounted for in the table', () => {
  const m = loadJourney();
  const js = journeyScript();
  // ⚠ DERIVED, NOT LISTED. A new glowing effect added with its own pad has to
  // join PAINT or this fails — naming today's three here would let the draw and
  // the bound drift apart with the suite green, which is the whole failure.
  const boxes = [...js.matchAll(/fillRect\(\s*\w+\s*-\s*([A-Z_]+)\s*,\s*\w+\s*-\s*\1\s*,\s*2\s*\*\s*\1\s*,\s*2\s*\*\s*\1\s*\)/g)]
    .map((x) => x[1]);
  assert.ok(boxes.length >= 3,
    `found only ${boxes.length} glow boxes — the sweep stopped matching`);

  const pads = new Set(m.PAINT.map(([, p]) => p));
  // resolve each pad name against the IIFE's own declaration rather than a table here
  for (const name of new Set(boxes)) {
    const dec = new RegExp('\\b' + name + '\\s*=\\s*([0-9.]+)').exec(js);
    assert.ok(dec, `${name} has no numeric declaration in the journey script`);
    const px = Number(dec[1]);
    assert.ok(pads.has(px),
      `${name} paints a ${px}px box that no PAINT row bounds — add it to the table`);
  }
});
