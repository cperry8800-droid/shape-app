// The coach dashboard's depth system and client colours (step 1 of the new coach dashboard).
//
// The lifts are one shadow scale per paper (dash.css's "Depth" section): every paper declares
// every half, the grid's cell casts the card's shadow because it clips, and nothing moves for a
// viewer who asked for reduced motion or on a touch screen. The client colours
// (clientColors.mjs) are a function of the client's id alone, stay off every colour that
// already means something, and read 4.5:1 as text on every paper's card and ground, measured
// against dash.css itself so a paper change that breaks one fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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

// ── Client colours ──────────────────────────────────────────────────────────────────────────
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
const oklab = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
};
const dE = (a, b) => { const p = oklab(rgbOf(a)), q = oklab(rgbOf(b)); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const hueOf = (h) => { const [, a, b] = oklab(rgbOf(h)); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };

// Each paper's surfaces, from its token block (the FIRST block for that paper), composited the
// way tests/newdesign-paper-pairs.test.mjs does: a see-through card over the ground, and Glass
// again over each of its glows.
function surfaces(paper) {
  const open = paper === 'white' ? ':root {' : `html[data-paper="${paper}"] {`;
  const a = CSS.indexOf(open), b = CSS.indexOf('\n}', a);
  const tok = new Map([...CSS.slice(a, b).matchAll(/^\s*(--sh-[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));
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
// Every colour the module hands out as text, with the value each paper takes.
const TEXT = [
  ...CC.CLIENT_PALETTE.map((c) => ['client ' + c.key, c]),
  ...Object.values(CC.CALENDAR_KINDS).filter((k) => !k.fromClient).map((k) => ['calendar ' + k.key, k]),
  ...Object.values(CC.PROGRAM_TYPES).map((t) => ['program ' + t.key, t]),
];

test('every colour reads 4.5:1 as text on each paper\'s card, ground and resting fill', () => {
  const failures = [];
  for (const p of PAPERS) {
    const tone = CC.paperTone(p);
    for (const [name, c] of TEXT) for (const [where, bg] of surfaces(p)) {
      const r = ratio(rgbOf(c[tone]), bg);
      if (r < 4.5) failures.push(`${name} (${c[tone]}) on ${p} ${where} = ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  // And the stylesheet picks the same value per paper as the module.
  const dark = rulesMatching(ROOT, /\.sh-client-ink$/).find(({ r }) => /data-paper/.test(r.selector));
  const named = dark ? [...dark.r.selector.matchAll(/data-paper="([a-z]+)"/g)].map((m) => m[1]).sort() : [];
  assert.deepEqual(named, Object.keys(CC.PAPER_TONE).filter((p) => CC.PAPER_TONE[p] === 'dark').sort(), '.sh-client-ink\'s dark papers are not the module\'s');
  assert.equal(!!dark && declOf(dark.r, 'color') === 'var(--client-ink-dark)', true);
  const base = rulesMatching(ROOT, /^\.sh-client-ink$/)[0];
  assert.equal(!!base && declOf(base.r, 'color') === 'var(--client-ink-light)', true);
});

const PINNED = ['magenta', 'violet', 'raspberry', 'orchid'];
// Synthetic ids: uuid-shaped, from a hash, so the spread is not tuned to a lucky seed.
const uuid =(i) => { const h = createHash('sha256').update('client-' + i).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

test('a client\'s colour is a function of their id alone: deterministic and stable when the list reorders', () => {
  const ids = Array.from({ length: 60 }, (_, i) => uuid(i));
  const first = new Map(ids.map((id) => [id, CC.clientColor(id).key]));
  // The same roster reversed, re-sorted by the id's last character, and filtered to a slice:
  // each client keeps the colour it had, however the coach sorts or filters.
  for (const order of [[...ids].reverse(), [...ids].sort((a, b) => a.slice(-1).localeCompare(b.slice(-1)) || a.localeCompare(b)), ids.slice(7, 19)]) {
    assert.equal(order.map((id) => CC.clientColor(id).key).every((k, i) => k === first.get(order[i])), true, 'a reordered or filtered roster recoloured a client');
  }
  assert.equal(CC.clientColor('  ' + ids[0].toUpperCase() + ' ').key === first.get(ids[0]), true, 'case or spacing changed a colour');
  // Pinned, so a change to the hash or the palette's order (either recolours every client a
  // coach has learned) is a decision, not an accident.
  assert.deepEqual(['c1', 'demo-marcus', '00000000-0000-4000-a000-000000000001', uuid(0)].map((id) => CC.clientColor(id).key), PINNED);
  // No id, no colour: the caller keeps its plain ink.
  assert.equal(CC.clientColor(null), null); assert.equal(CC.clientColor(''), null); assert.equal(CC.clientColorVars(undefined), null);
  assert.deepEqual(CC.clientColorVars(ids[0]), { '--client-ink-light': CC.clientColor(ids[0]).light, '--client-ink-dark': CC.clientColor(ids[0]).dark });
  assert.equal(CC.clientColor(ids[0], 'night').color === CC.clientColor(ids[0]).dark && CC.clientColor(ids[0], 'bone').color === CC.clientColor(ids[0]).light, true);
  // The roster colours by the client's id, never by the row index.
  const roster = read('dashRoster.jsx');
  assert.equal(/const ink = dashClientInk\(rec\.profile\.id\);/.test(roster), true, 'the roster does not colour by the client\'s id');
  assert.equal(/dashClientInk\(\s*i\s*\)/.test(roster), false);
  // The roster's helper, brace-matched out of the shipped source and run against a window with
  // and without the module: the colour when it is there, today's plain ink when it is not.
  const at = roster.indexOf('function dashClientInk(');
  let depth = 0, end = -1;
  for (let j = roster.indexOf('{', at); j < roster.length; j++) { if (roster[j] === '{') depth++; else if (roster[j] === '}' && --depth === 0) { end = j + 1; break; } }
  assert.ok(at > 0 && end > at, 'dashClientInk is gone from dashRoster.jsx');
  const inkFor = (win) => new Function('window', roster.slice(at, end) + '\nreturn dashClientInk;')(win);
  assert.deepEqual(inkFor({ ShapeClientColors: CC })(ids[0]), { className: 'sh-client-ink', style: CC.clientColorVars(ids[0]) });
  assert.equal(inkFor({})(ids[0]), null, 'without the module the name does not keep its plain ink');
  assert.equal(inkFor({ ShapeClientColors: CC })(null), null);
});

test('ids spread across the whole palette', () => {
  const n = CC.CLIENT_PALETTE.length, N = 3000;
  const count = new Array(n).fill(0);
  for (let i = 0; i < N; i++) count[CC.clientColorIndex(uuid(i))]++;
  const lo = Math.min(...count), hi = Math.max(...count), want = N / n;
  assert.equal(lo > want * 0.75 && hi < want * 1.25, true, `uneven spread: ${count.join(' ')}`);
  // Short ids too (demo data): twelve of them reach most of the palette.
  const short = new Set(Array.from({ length: 12 }, (_, i) => CC.clientColorIndex('c' + (i + 1))));
  assert.equal(short.size >= Math.ceil(n * 0.6), true, `twelve short ids reached only ${short.size} colours`);
});

test('the palette stays off the role, status and kind colours, and its colours are told apart', () => {
  // The literals the dashboard and the app use, and every paper's own role and status tokens.
  const reserved = new Set(['#0a8f87', '#34d6c5', '#2ee0c4', '#0a7a72', '#c0533b', '#b24c36', '#e0644b', '#a07a2e', '#86662a', '#d8a23a', '#387a2b', '#7bbf5a', '#f2a03d',
    CC.CALENDAR_KINDS.checkin.light, CC.CALENDAR_KINDS.checkin.dark, CC.CALENDAR_KINDS.consult.light, CC.CALENDAR_KINDS.consult.dark]);
  for (const p of PAPERS) {
    const open = p === 'white' ? ':root {' : `html[data-paper="${p}"] {`;
    const a = CSS.indexOf(open), b = CSS.indexOf('\n}', a);
    for (const m of CSS.slice(a, b).matchAll(/^\s*--sh-(accent|rust|rust2|gold|green|heat-trainer|heat-nutri|heat-client)\s*:\s*(#[0-9a-f]{6});/gim)) reserved.add(m[2].toLowerCase());
  }
  assert.ok(reserved.size >= 20, `read ${reserved.size} reserved colours — the sweep stopped matching`);
  const near = [];
  for (const c of CC.CLIENT_PALETTE) for (const v of [c.light, c.dark]) {
    for (const r of reserved) { const d = dE(v, r); if (d < 0.08) near.push(`${c.key} ${v} is ${d.toFixed(3)} from ${r}`); }
    // Red, amber, gold, green and teal live between 20 and 200 degrees of OKLCH hue.
    const h = hueOf(v);
    if (h > 20 && h < 200) near.push(`${c.key} ${v} sits in the status and role hues (${h.toFixed(0)} degrees)`);
  }
  assert.deepEqual(near, [], near.join('\n'));
  const close = [];
  const P = CC.CLIENT_PALETTE;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (const t of ['light', 'dark']) {
    const d = dE(P[i][t], P[j][t]); if (d < 0.06) close.push(`${P[i].key} and ${P[j].key} (${t}) are ${d.toFixed(3)} apart`);
  }
  assert.deepEqual(close, [], close.join('\n'));
  assert.equal(P.length >= 10 && new Set(P.map((c) => c.key)).size === P.length, true);
});

test('the maps answer per paper, and the coach pages load the module the app re-exports', () => {
  assert.equal(CC.calendarKindColor('checkin', 'dark').color, CC.CALENDAR_KINDS.checkin.dark);
  assert.equal(CC.calendarKindColor('timeoff').hatch, true);
  const s = CC.calendarKindColor('session', 'glass', uuid(3));
  assert.equal(!!s && s.color === CC.clientColor(uuid(3)).dark && s.client === CC.clientColor(uuid(3)).key, true, 'a session is not drawn in its client\'s colour');
  assert.equal(CC.calendarKindColor('session', 'white', null), null);
  assert.equal(CC.calendarKindColor('nope'), null);
  assert.deepEqual(Object.keys(CC.PROGRAM_TYPES), ['cut', 'maintain', 'build', 'race', 'intake']);
  assert.equal(CC.programTypeColor('Build', 'carbon').color, CC.PROGRAM_TYPES.build.dark);
  assert.equal(CC.programTypeColor('nope'), null);
  // The app's entry point is the same module, not a copy.
  assert.equal(CCApp.clientColor === CC.clientColor && CCApp.CLIENT_PALETTE === CC.CLIENT_PALETTE, true);
  for (const page of ['TrainerApp.html', 'NutritionistApp.html']) {
    const html = read(page);
    const tag = /<script type="module">import \* as (\w+) from "\/newdesign\/clientColors\.mjs\?v=\d{8}"; window\.ShapeClientColors = \1;<\/script>/.exec(html);
    assert.equal(!!tag, true, `${page} does not load clientColors.mjs as window.ShapeClientColors`);
    // Before the roster, so the global is set when it first renders (it also reads it at call time).
    assert.equal(html.indexOf('src="dashRoster.jsx') > tag.index, true, `${page} loads the colours after the roster`);
  }
});
