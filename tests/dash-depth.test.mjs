// The coach dashboard's depth system and client tier marks (step 1 of the new coach dashboard).
//
// The lifts are one shadow scale per paper (dash.css's "Depth" section): every paper declares
// every half, each level stands clear of the one below, the four derived papers pop (owner,
// 2026-11-06), the grid's cell casts the card's shadow because it clips, and nothing moves for a
// viewer who asked for reduced motion or on a touch screen. A client's colour is their Shape
// Score tier's (clientColors.mjs), drawn on a mark that keeps 3:1 against every paper's card,
// ground and resting fill, by its own colour or by a neutral ring; the other maps' colours read
// 4.5:1 as text. Every measurement is against dash.css itself, so a paper change that breaks one
// fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as CC from '../public/newdesign/clientColors.mjs';
import * as CCApp from '../mobile-app/src/services/clientColors.mjs';

const postcss = createRequire(import.meta.url)('postcss');
const ND = 'public/newdesign';
const read = (f) => readFileSync(join(ND, f), 'utf8');
const CSS = read('dash.css');
const ROOT = postcss.parse(CSS);
const GRID = read('dashGrid.jsx');
const GRID_CSS = (() => {
  const at = GRID.indexOf('function dgInjectStyle(');
  const a = GRID.indexOf('s.textContent = `', at) + 's.textContent = `'.length;
  const b = GRID.indexOf('`;', a);
  assert.ok(at > 0 && a > at && b > a, 'dashGrid.jsx: the injected style moved — re-derive this guard');
  assert.ok(!GRID.slice(a, b).includes('${'), 'the injected style interpolates now — this guard reads it as plain CSS');
  return postcss.parse(GRID.slice(a, b));
})();

// The papers, as dash.css names them: White is :root, the others stamp <html data-paper>.
const PAPERS = ['white', ...new Set([...CSS.matchAll(/^html\[data-paper="([a-z]+)"\] \{/gm)].map((m) => m[1]))];
const selOf = (p) => (p === 'white' ? ':root' : `html[data-paper="${p}"]`);
const HALVES = ['--lift-0', '--lift-1-edge', '--lift-1-cast', '--lift-2-edge', '--lift-2-cast', '--lift-3', '--lift-key', '--lift-key-fill', '--lift-key-press'];
const DARK_PAPERS = ['dark', 'carbon', 'night', 'glass'];

// Every --lift-* a paper's own rules declare (top level only: a lift is never media-scoped).
function liftsOf(paper) {
  const out = new Map();
  ROOT.each((n) => {
    if (n.type !== 'rule' || n.selector.trim() !== selOf(paper)) return;
    n.walkDecls(/^--lift-/, (d) => { out.set(d.prop, d.value.trim()); });
  });
  return out;
}
// A shadow list split into its layers (commas outside parentheses).
const layers = (v) => { const out = []; let depth = 0, cur = ''; for (const ch of v) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
const LAYER = /^(inset )?-?\d+(?:px)? -?\d+(?:px)? -?\d+(?:px)?(?: -?\d+(?:px)?)? (?:rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)|transparent)$/;

test('the papers this guard reads are the six skins', () => {
  assert.deepEqual([...PAPERS].sort(), ['bone', 'carbon', 'dark', 'glass', 'night', 'white']);
  assert.deepEqual([...PAPERS].sort(), Object.keys(CC.PAPER_TONE).sort(), 'clientColors.mjs and dash.css disagree on the papers');
});

test('every paper declares every lift, and each is a valid shadow list', () => {
  for (const p of PAPERS) {
    const m = liftsOf(p);
    for (const k of HALVES) {
      assert.equal(m.has(k), true, `${p} has no ${k}`);
      const v = m.get(k);
      assert.equal(/\bnone\b/.test(v), false, `${p} ${k} holds none — a list with none in it is invalid and the whole shadow drops`);
      for (const l of layers(v)) assert.equal(LAYER.test(l), true, `${p} ${k}: "${l}" is not a shadow layer`);
    }
    const extra = [...m.keys()].filter((k) => !HALVES.includes(k) && !(p === 'white' && (k === '--lift-1' || k === '--lift-2')));
    assert.deepEqual(extra, [], `${p} declares lifts the others do not`);
  }
  // The two composites are declared once, on :root, from the halves, so each resolves per paper.
  const w = liftsOf('white');
  assert.equal(w.get('--lift-1'), 'var(--lift-1-edge), var(--lift-1-cast)');
  assert.equal(w.get('--lift-2'), 'var(--lift-2-edge), var(--lift-2-cast)');
});

test('White and Dark are the depth review\'s values verbatim, and every dark paper has a lit edge', () => {
  const w = liftsOf('white'), d = liftsOf('dark');
  assert.equal(w.get('--lift-1-edge') + ', ' + w.get('--lift-1-cast'),
    'inset 0 -1px 0 rgba(16,36,32,0.05), 0 1px 1px rgba(16,36,32,0.05), 0 2px 5px -1px rgba(16,36,32,0.07), 0 12px 28px -10px rgba(16,36,32,0.18)');
  assert.equal(d.get('--lift-1-edge') + ', ' + d.get('--lift-1-cast'),
    'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.3), 0 14px 30px -12px rgba(0,0,0,0.65)');
  assert.equal(d.get('--lift-3'), '0 2px 6px rgba(0,0,0,0.4), 0 28px 60px -12px rgba(0,0,0,0.7)');
  for (const p of DARK_PAPERS) for (const k of ['--lift-1-edge', '--lift-2-edge']) {
    const top = layers(liftsOf(p).get(k))[0];
    const m = /^inset 0 1px 0 rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(top);
    assert.equal(!!m && +m[1] + +m[2] + +m[3] > 600 && +m[4] > 0, true, `${p} ${k} has no lit top edge`);
  }
  // The edge is the inset half and the cast the outer one: the grid cell relies on that split.
  for (const p of PAPERS) {
    const m = liftsOf(p);
    for (const k of ['--lift-1-edge', '--lift-2-edge']) assert.equal(layers(m.get(k)).every((l) => l.startsWith('inset ')), true, `${p} ${k} casts outward`);
    for (const k of ['--lift-1-cast', '--lift-2-cast']) assert.equal(layers(m.get(k)).some((l) => l.startsWith('inset ')), false, `${p} ${k} holds an inset the clipping cell would draw under its card`);
  }
});

// The rules of a parsed sheet whose selector matches, with the media they sit in.
const rulesMatching = (root, re) => { const out = []; root.walkRules((r) => { if (re.test(r.selector)) { const media = []; for (let p = r.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') media.push(p.params); out.push({ r, media: media.join(' && ') }); } }); return out; };
const declOf = (r, prop) => { let v = null; r.walkDecls(prop, (d) => { v = d.value; }); return v; };

test('the grid cell casts the card\'s shadow, since it clips', () => {
  const content = rulesMatching(GRID_CSS, /grid-stack-item-content/);
  assert.equal(content.some(({ r, media }) => !media && r.selector === '.dash-gridstack .grid-stack-item-content' && declOf(r, 'overflow') === 'hidden'), true,
    'the cell no longer clips — then the card could cast its own shadow, and this split is not needed');
  const rest = content.find(({ r, media }) => !media && r.selector === '.dash-gridstack .grid-stack-item-content:not(:empty)');
  assert.equal(!!rest && /^var\(--lift-1-cast,/.test(declOf(rest.r, 'box-shadow')), true, 'the cell does not cast Lift 1');
  assert.equal(!!rest && declOf(rest.r, 'border-radius') === '12px', true, 'the cell\'s shadow does not follow the card\'s radius');
  const edge = content.find(({ r, media }) => !media && r.selector === '.dash-gridstack .grid-stack-item-content:not(:empty)::after');
  assert.equal(!!edge && /^var\(--lift-1-edge,/.test(declOf(edge.r, 'box-shadow')) && declOf(edge.r, 'pointer-events') === 'none' && declOf(edge.r, 'position') === 'absolute', true,
    'the lit edge is not an overlay above the card (an inset on the cell itself draws under it)');
  const hover = content.filter(({ r }) => /:hover>/.test(r.selector));
  assert.equal(hover.length >= 2 && hover.every(({ media }) => /hover:\s*hover/.test(media) && /pointer:\s*fine/.test(media)), true, 'Lift 2 under the pointer is not limited to a mouse');
  assert.equal(hover.some(({ r }) => /^var\(--lift-2-cast,/.test(declOf(r, 'box-shadow') || '')), true, 'the cell under the pointer does not take Lift 2');
  const drag = content.find(({ r }) => /ui-draggable-dragging/.test(r.selector));
  assert.equal(!!drag && /^var\(--lift-3,/.test(declOf(drag.r, 'box-shadow')) && /\.grid-stack-item:is\(/.test(drag.r.selector), true, 'a dragged card does not take Lift 3 over the hover rule');
  assert.equal(/drop-shadow/.test(GRID_CSS.toString()), false, 'the old drag filter is back, doubling the dragged card\'s shadow');
  // ⚠ No transform on the cell: it would become the containing block of the fixed overlays its card draws.
  for (const { r } of content) for (const p of ['transform', 'translate', 'filter', 'will-change']) assert.equal(declOf(r, p), null, `${r.selector} sets ${p}`);
});

// Every transition or transform on a lifted surface, and the media it sits in.
function motion(root, re) {
  const out = [];
  for (const { r, media } of rulesMatching(root, re)) r.walkDecls(/^(transition|transform|translate)$/, (d) => out.push({ sel: r.selector, prop: d.prop, value: d.value, media }));
  return out;
}

test('reduced motion and a touch screen turn every lift\'s motion off', () => {
  for (const [name, root, re] of [['dash.css', ROOT, /\.sh-(key|lift)/], ['dashGrid.jsx', GRID_CSS, /grid-stack-item-content/]]) {
    const all = motion(root, re);
    assert.ok(all.length >= 2, `${name}: read ${all.length} motion declarations — the sweep stopped matching`);
    const moving = all.filter((m) => !/^none( !important)?$/.test(m.value.trim()));
    for (const m of moving) {
      assert.equal(/prefers-reduced-motion:\s*no-preference/.test(m.media) && /hover:\s*hover/.test(m.media) && /pointer:\s*fine/.test(m.media), true,
        `${name}: ${m.sel} { ${m.prop}: ${m.value} } moves outside the mouse-and-motion-allowed media`);
    }
    const guard = all.filter((m) => /prefers-reduced-motion:\s*reduce/.test(m.media) && /hover:\s*none/.test(m.media) && /pointer:\s*coarse/.test(m.media));
    assert.equal(guard.some((m) => m.prop === 'transition' && /^none/.test(m.value.trim())), true, `${name}: no reduced-motion guard on the transition`);
    if (name === 'dash.css') assert.equal(guard.some((m) => m.prop === 'transform' && /none/.test(m.value)), true, 'dash.css: no reduced-motion guard on the key\'s rise');
  }
  // The key rises on hover and presses in on click, and the press needs no motion to show.
  const keys = motion(ROOT, /\.sh-key/).filter((m) => m.prop === 'transform');
  assert.equal(keys.some((m) => /:hover/.test(m.sel) && /translateY\(-[12]px\)/.test(m.value)), true, 'the key does not rise 1-2px on hover');
  assert.equal(keys.some((m) => /:active/.test(m.sel) && /translateY\(1px\)/.test(m.value)), true, 'the key does not press in');
  const press = rulesMatching(ROOT, /^\.sh-key:not\(:disabled\):active$/).find(({ media }) => !media);
  assert.equal(!!press && declOf(press.r, 'box-shadow') === 'var(--lift-key-press)', true, 'a held key does not press in without motion');
});

test('the coach dashboard\'s surfaces take the lifts, and keep today\'s look without the sheet', () => {
  const td = read('trainerDashboard.jsx');
  assert.equal((td.match(/className="sh-key"/g) || []).length, 3, 'the page\'s card action is not a raised key in all three of its forms');
  assert.equal((td.match(/className="sh-key sh-key--fill"/g) || []).length, 3, 'the page\'s filled action is not a raised key in all three of its forms');
  assert.equal(/boxShadow: on \? "var\(--lift-key, 0 1px 2px rgba\(0,0,0,0\.18\)\)" : "none"/.test(read('dashToday.jsx')), true, 'the selected Needs you tab does not stand out of its track');
  assert.equal(/boxShadow: "var\(--lift-3, 0 12px 32px rgba\(0,0,0,0\.18\)\)"/.test(GRID), true, 'the grid\'s floating panels are not Lift 3');
  const pop = rulesMatching(ROOT, /^\.dash-facet-pop$/)[0];
  assert.equal(!!pop && /^var\(--lift-3, /.test(declOf(pop.r, 'box-shadow')), true, 'the filter popover is not Lift 3');
  // Colour never moves with a lift: no Depth rule sets a background or a text colour except the client ink.
  for (const { r } of rulesMatching(ROOT, /\.sh-(key|lift)/)) for (const p of ['background', 'background-color', 'color']) assert.equal(declOf(r, p), null, `${r.selector} sets ${p}`);
});

// ── Colour and contrast ─────────────────────────────────────────────────────────────────────
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgbOf = (v) => {
  let m = /^#([0-9a-f]{6})$/i.exec(String(v).trim());
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(String(v).trim());
  return m ? [+m[1], +m[2], +m[3], +m[4]] : null;
};
const over = (fg, bg) => [0, 1, 2].map((i) => fg[3] * fg[i] + (1 - fg[3]) * bg[i]).concat(1);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// A paper's own tokens, from its FIRST block.
function tokensOf(paper) {
  const open = paper === 'white' ? ':root {' : `html[data-paper="${paper}"] {`;
  const a = CSS.indexOf(open), b = CSS.indexOf('\n}', a);
  return new Map([...CSS.slice(a, b).matchAll(/^\s*(--sh-[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));
}
// Each paper's surfaces, composited the way tests/newdesign-paper-pairs.test.mjs does: a
// see-through card over the ground, and Glass again over each of its glows.
function surfaces(paper) {
  const tok = tokensOf(paper);
  const ground = rgbOf(tok.get('--sh-ground'));
  assert.ok(ground && ground[3] === 1, `${paper}: no solid ground`);
  const bases = [['', ground]];
  if (paper === 'glass') {
    const lit = /html\[data-paper="glass"\] \{\s*background-color:[^;]+;\s*background-image:([\s\S]*?);/.exec(CSS);
    assert.ok(lit, 'the Glass ground moved — re-derive its glows');
    for (const g of lit[1].matchAll(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g)) bases.push([` over the glow ${g[0]}`, over([+g[1], +g[2], +g[3], +g[4]], ground)]);
  }
  const out = [];
  for (const [where, base] of bases) for (const t of ['--sh-card', '--sh-ground', '--sh-rest']) {
    const c = rgbOf(tok.get(t));
    out.push([t + where, c[3] < 1 ? over(c, base) : (t === '--sh-ground' ? base : c)]);
  }
  return out;
}
const minOn = (paper, hex) => Math.min(...surfaces(paper).map(([, bg]) => ratio(rgbOf(hex), bg)));

// ── The lifts stand apart, and four papers pop ─────────────────────────────────────────────
// A shadow layer, parsed: inset, x, y, blur, spread, and its colour (null for transparent).
const PARTS = /^(inset )?(-?\d+)(?:px)? (-?\d+)(?:px)? (-?\d+)(?:px)?(?: (-?\d+)(?:px)?)? (?:rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)|transparent)$/;
const parts = (l) => {
  const m = PARTS.exec(l);
  assert.ok(m, `"${l}" is not a shadow layer`);
  return { inset: !!m[1], y: +m[3], blur: +m[4], spread: +(m[5] || 0), rgb: m[6] ? [+m[6], +m[7], +m[8]] : null, a: m[9] ? +m[9] : 0 };
};
const isLight = (p) => !!p.rgb && p.rgb[0] + p.rgb[1] + p.rgb[2] > 600;
const isDarkInk = (p) => !!p.rgb && p.rgb[0] + p.rgb[1] + p.rgb[2] < 200;
// How far and how dark a lift's cast falls: each outer dark layer's alpha times its reach.
const cast = (v) => layers(v).map(parts).filter((p) => !p.inset && isDarkInk(p)).reduce((s, p) => s + p.a * (Math.abs(p.y) + p.blur + p.spread), 0);
// The lit top edge: the brightest light inset layer one pixel down.
const litEdge = (v) => Math.max(0, ...layers(v).map(parts).filter((p) => p.inset && p.y === 1 && isLight(p)).map((p) => p.a));
const edgeLayer = (v) => layers(v).map(parts).filter((p) => p.inset && p.y === 1 && isLight(p)).sort((x, y) => y.a - x.a)[0];
// The shaded bottom lip: the darkest inset layer one pixel up.
const lip = (v) => Math.max(0, ...layers(v).map(parts).filter((p) => p.inset && p.y === -1 && isDarkInk(p)).map((p) => p.a));
// Each paper's four levels as one shadow list each (Lifts 1 and 2 are their two halves).
const levels = (p) => {
  const m = liftsOf(p);
  return [m.get('--lift-0'), m.get('--lift-1-edge') + ', ' + m.get('--lift-1-cast'), m.get('--lift-2-edge') + ', ' + m.get('--lift-2-cast'), m.get('--lift-3')];
};

test('each lift stands above the one below it on every paper, and Lift 2 (Needs you) stands off the board', () => {
  for (const p of PAPERS) {
    const s = levels(p).map(cast);
    // Lift 0 is flat: a hairline of shadow at most.
    assert.equal(s[0] < 0.5, true, `${p}: Lift 0 is not flat (${s[0].toFixed(2)})`);
    for (let i = 1; i < s.length; i++) assert.equal(s[i] >= s[i - 1] * 1.15, true, `${p}: Lift ${i} (${s[i].toFixed(1)}) does not stand clear of Lift ${i - 1} (${s[i - 1].toFixed(1)})`);
    assert.equal(s[2] >= s[1] * 1.6, true, `${p}: Lift 2 (${s[2].toFixed(1)}) is too close to the resting card (${s[1].toFixed(1)}) to stand off the board`);
    // On a dark paper the lit edge climbs with the lift too, where the cast is the half that hides.
    if (CC.paperTone(p) === 'dark') {
      const e = levels(p).map(litEdge);
      assert.equal(e[2] > e[1] && e[1] > 0, true, `${p}: Lift 2's lit edge (${e[2]}) is not brighter than Lift 1's (${e[1]})`);
      // A floating panel's edge is at least Lift 2's, except on Dark: the review gave its Lift 3 none.
      if (p !== 'dark') assert.equal(e[3] >= e[2], true, `${p}: a floating panel's edge is dimmer than Lift 2's`);
    }
  }
});

// The luminance step a lit edge makes over the card it sits on (its contrast with the card).
function edgeStep(paper, v) {
  const card = surfaces(paper).find(([w]) => w === '--sh-card')[1];
  const e = edgeLayer(v);
  return e ? ratio(over(e.rgb.concat(e.a), card), card) : 1;
}

test('Bone, Carbon, Night and Glass pop (owner, 2026-11-06), and White and Dark stay the review\'s', () => {
  const lv = Object.fromEntries(PAPERS.map((p) => [p, levels(p)]));
  // Bone's card sits close to its ground: a firmer contact shadow and a longer cast than White's.
  const contact = (v) => layers(v).map(parts).filter((p) => !p.inset && isDarkInk(p)).sort((x, y) => x.blur - y.blur)[0].a;
  for (const i of [1, 2, 3]) {
    assert.equal(cast(lv.bone[i]) >= cast(lv.white[i]) * 1.3, true, `Bone's Lift ${i} casts no firmer than White's`);
    assert.equal(contact(lv.bone[i]) > contact(lv.white[i]), true, `Bone's Lift ${i} has no firmer contact than White's`);
  }
  // Carbon, Night and Glass: a brighter lit edge and a darker lip than Dark's, over a deeper cast,
  // because on their grounds the shadow alone does not show; the edge measured as the step it makes
  // over the card. Lift 2 adds a hairline of light round the card.
  for (const p of ['carbon', 'night', 'glass']) {
    for (const [i, min] of [[1, 1.4], [2, 1.9]]) {
      assert.equal(edgeStep(p, lv[p][i]) >= min, true, `${p}: Lift ${i}'s lit edge steps ${edgeStep(p, lv[p][i]).toFixed(2)}:1 over the card, under ${min}`);
      assert.equal(edgeStep(p, lv[p][i]) > edgeStep('dark', lv.dark[i]), true, `${p}: Lift ${i}'s edge is no brighter than Dark's`);
      assert.equal(lip(lv[p][i]) > lip(lv.dark[i]), true, `${p}: Lift ${i}'s lip is no darker than Dark's`);
      assert.equal(cast(lv[p][i]) > cast(lv.dark[i]), true, `${p}: Lift ${i} casts no deeper than Dark's`);
    }
    const ring = layers(liftsOf(p).get('--lift-2-cast')).map(parts).find((x) => !x.inset && x.y === 0 && x.blur === 0 && x.spread === 1 && isLight(x));
    assert.equal(!!ring && ring.a > 0, true, `${p}: Lift 2 has no hairline of light round the card`);
  }
  // Night's light stays warm, the blue channel under the red and green: no white light on the
  // eye-sensitive skin.
  for (const k of liftsOf('night').keys()) {
    for (const x of layers(liftsOf('night').get(k)).map(parts).filter(isLight)) {
      assert.equal(x.rgb[2] < x.rgb[1] && x.rgb[1] < x.rgb[0], true, `Night's ${k} has a cold light layer`);
    }
  }
});

// ── Client tier marks ───────────────────────────────────────────────────────────────────────
// Every colour the module hands out as TEXT, with the value each paper takes. A client's tier
// colour is never text: it is a mark (below).
const TEXT = [
  ...Object.values(CC.CALENDAR_KINDS).filter((k) => !k.fromClient).map((k) => ['calendar ' + k.key, k]),
  ...Object.values(CC.PROGRAM_TYPES).map((t) => ['program ' + t.key, t]),
];

test('every text colour reads 4.5:1 on each paper\'s card, ground and resting fill', () => {
  const failures = [];
  for (const p of PAPERS) {
    const tone = CC.paperTone(p);
    for (const [name, c] of TEXT) for (const [where, bg] of surfaces(p)) {
      const r = ratio(rgbOf(c[tone]), bg);
      if (r < 4.5) failures.push(`${name} (${c[tone]}) on ${p} ${where} = ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

// The ring a tier mark wears on a paper: dash.css's `.sh-tier-mark` rules resolved in source order,
// each selector reading which papers (`data-paper`, none for all) and which tier (`data-tier`, none
// for all) it reaches. The rules are written base, then paper, then paper and tier, each more
// specific than the last, so the last that applies wins; the guard checks that order holds.
const MARK_RULES = rulesMatching(ROOT, /\.sh-tier-mark/).filter(({ media }) => !media).map(({ r }) => r);
const specOf = (sel) => (sel.replace(/:is\([^)]*\)/g, '[x]').match(/\[|\./g) || []).length;
function ringOf(paper, tier) {
  let v = null;
  for (const r of MARK_RULES) {
    const shadow = declOf(r, 'box-shadow');
    if (shadow == null) continue;
    for (const sel of r.selectors) {
      const papers = [...sel.matchAll(/data-paper="([a-z]+)"/g)].map((m) => m[1]);
      const tiers = [...sel.matchAll(/data-tier="([a-z]+)"/g)].map((m) => m[1]);
      if ((papers.length && !papers.includes(paper)) || (tiers.length && !tiers.includes(tier))) continue;
      v = shadow;
    }
  }
  return v;
}

test('a tier mark keeps 3:1 against every paper, by its own colour or by a neutral ring', () => {
  assert.ok(MARK_RULES.length >= 2, 'the tier mark rules moved — re-derive this guard');
  const specs = MARK_RULES.map((r) => Math.max(...r.selectors.map(specOf)));
  assert.deepEqual(specs, [...specs].sort((a, b) => a - b), 'a later .sh-tier-mark rule is less specific than an earlier one: source order no longer decides');
  const base = MARK_RULES.find((r) => r.selector === '.sh-tier-mark');
  assert.equal(!!base && declOf(base, 'background') === 'var(--tier-mark)', true, 'the mark does not paint --tier-mark');
  const failures = [];
  for (const p of PAPERS) {
    const ink2 = tokensOf(p).get('--sh-ink2');
    for (const t of CC.MEMBER_TIERS) {
      const own = minOn(p, t.color);
      const shadow = ringOf(p, t.key) || 'none';
      const ring = /^inset 0 0 0 1px var\(--sh-ink2[,)]/.test(shadow);
      if (own < 3 && !ring) failures.push(`${t.label} (${t.color}) reads ${own.toFixed(2)}:1 on ${p} and wears no ring`);
      if (ring && minOn(p, ink2) < 3) failures.push(`${p}'s ring (${ink2}) reads under 3:1`);
      // On a dark paper the ring is only where the colour needs it; White and Bone ring every tier.
      if (CC.paperTone(p) === 'dark' && own >= 3 && shadow !== 'none') failures.push(`${t.label} wears a ring on ${p}, where its colour reads ${own.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  // The measurement that made the ring necessary: Peak and Legend all but vanish on White.
  assert.equal(minOn('white', CC.clientTier('peak').color) < 2 && minOn('white', CC.clientTier('legend').color) < 2, true);
  // And the old per-paper text inks are gone.
  assert.equal(/sh-client-ink|--client-ink-/.test(CSS), false, 'the retired client ink rules are back');
});

test('the maps answer per paper, and the coach pages load the module the app re-exports', () => {
  assert.equal(CC.calendarKindColor('checkin', 'dark').color, CC.CALENDAR_KINDS.checkin.dark);
  assert.equal(CC.calendarKindColor('timeoff').hatch, true);
  // A session is its client's tier colour, the same on every paper; an unknown tier is no colour.
  const s = CC.calendarKindColor('session', 'glass', 2400);
  assert.equal(!!s && s.color === CC.clientTier('form').color && s.tier === 'form' && s.title === 'Form tier', true, 'a session is not drawn in its client\'s tier colour');
  assert.equal(CC.calendarKindColor('session', 'white', 2400).color === s.color, true, 'a session\'s colour moved with the paper');
  assert.equal(CC.calendarKindColor('session', 'white', null), null);
  assert.equal(CC.calendarKindColor('session', 'white'), null);
  assert.equal(CC.calendarKindColor('nope'), null);
  assert.deepEqual(Object.keys(CC.PROGRAM_TYPES), ['cut', 'maintain', 'build', 'race', 'intake']);
  assert.equal(CC.programTypeColor('Build', 'carbon').color, CC.PROGRAM_TYPES.build.dark);
  assert.equal(CC.programTypeColor('nope'), null);
  // The app's entry point is the same module, not a copy.
  assert.equal(CCApp.clientTier === CC.clientTier && CCApp.MEMBER_TIERS === CC.MEMBER_TIERS && CCApp.calendarKindColor === CC.calendarKindColor, true);
  for (const page of ['TrainerApp.html', 'NutritionistApp.html']) {
    const html = read(page);
    const tag = /<script type="module">import \* as (\w+) from "\/newdesign\/clientColors\.mjs\?v=\d{8}"; window\.ShapeClientColors = \1;<\/script>/.exec(html);
    assert.equal(!!tag, true, `${page} does not load clientColors.mjs as window.ShapeClientColors`);
    // Before the roster, so the global is set when it first renders (it also reads it at call time).
    assert.equal(html.indexOf('src="dashRoster.jsx') > tag.index, true, `${page} loads the colours after the roster`);
  }
});
