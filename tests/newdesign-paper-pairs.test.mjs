// An ink and the fill it sits on have to agree about the paper.
//
// The light paper made one class of defect reachable that the dark one hid: an ink
// that follows the paper sitting on a fill that does not (or the reverse). On the
// dark paper `var(--sh-ground)` IS #1a1612, so near-black text on a fixed teal read
// fine; on the light paper the same token is #f4f6f5 and the text turns light-on-teal
// at ~2:1. The CodeRabbit round on #2146 found it thirteen ways — the chat button, the
// playlist Play buttons, four community-feed modals with paper ink on a dark literal
// panel, the goal pages' <option> popups, the cycle plate, the trajectory chart — and
// these guards are the rule those thirteen share, derived over the tree, so the next
// half-converted pair fails here instead of in a review round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const babelParser = require_('@babel/parser');
const traverseMod = require_('@babel/traverse');
const traverse = traverseMod.default || traverseMod;

const ND = 'public/newdesign';
const read = (f) => readFileSync(join(ND, f), 'utf8');
const all = readdirSync(ND);
const CSS = read('dash.css');

// ── Contrast, composited, with a self-check ─────────────────────────────────
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function blocks() {
  const block = (open) => {
    const a = CSS.indexOf(open); assert.ok(a >= 0, `dash.css has no ${open} block`);
    const b = CSS.indexOf('\n}', a); assert.ok(b >= 0, `dash.css has no closing brace for ${open}`);
    return new Map([...CSS.slice(a, b).matchAll(/^\s*(--sh-[\w-]+)\s*:\s*([^;]+);/gm)].map(m => [m[1], m[2].trim()]));
  };
  return { light: block(':root {'), dark: block('html[data-paper="dark"] {') };
}

test('the contrast arithmetic is the real one', () => {
  // A probe that reports a pass is a broken instrument until it is shown able to fail.
  assert.equal(ratio('#ffffff', '#000000').toFixed(2), '21.00');
  assert.equal(ratio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(ratio('#777777', '#777777').toFixed(2), '1.00');
});

test('the tokens the light paper made reachable clear their contrast floor on both papers', () => {
  const { light, dark } = blocks();
  const failures = [];
  const need = (paper, map, fg, bgs, floor, why) => {
    for (const bg of bgs) {
      const a = map.get(fg), b = map.get(bg);
      assert.ok(a && b && /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b), `${paper}: ${fg} or ${bg} is not a plain hex`);
      const r = ratio(a, b);
      if (r < floor) failures.push(`${paper} ${fg} ${a} on ${bg} ${b} = ${r.toFixed(2)}:1 (< ${floor}, ${why})`);
    }
  };
  for (const [paper, map] of [['light', light], ['dark', dark]]) {
    need(paper, map, '--sh-ink2', ['--sh-card', '--sh-ground'], 4.5, 'secondary text');
    need(paper, map, '--sh-cycle-heat', ['--sh-card', '--sh-ground'], 4.5, 'the cycle eyebrow and today are TEXT');
    need(paper, map, '--sh-cycle-heat-ink', ['--sh-cycle-heat'], 4.5, 'the Start button sets text on the heat fill');
    need(paper, map, '--sh-chart-teal', ['--sh-ground', '--sh-card'], 3, 'a non-text chart mark');
    need(paper, map, '--sh-chart-amber', ['--sh-ground', '--sh-card'], 3, 'a non-text chart mark');
  }
  // ink3 sets the 8–11px labels, and the dark paper's value is the one the dashboard
  // shipped with — so the light paper is where this PR owns the floor.
  need('light', light, '--sh-ink3', ['--sh-card', '--sh-ground'], 4.5, 'tertiary labels');
  assert.deepEqual(failures, [], failures.join('\n'));
});

// ── Ink / fill pairs, derived over every style object in the tree ───────────
// Parse every .jsx/.js module, plus the inline <script type="text/babel"> blocks of
// the .html pages (ClientGrocery's dropdown lives in one).
const units = [];
for (const f of all) {
  if (/\.(jsx|js)$/.test(f)) units.push({ f, code: read(f) });
  else if (/\.html$/.test(f)) {
    const h = read(f); let i = 0;
    for (const m of h.matchAll(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g)) units.push({ f: `${f}#babel${i++}`, code: m[1] });
  }
}
const parsed = units.map(u => ({ ...u, ast: babelParser.parse(u.code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }) }));

// The modules that render on a page carrying the paper. A page without dash.css
// resolves every token to its DARK fallback, so there a dark literal beside a token is
// a consistent pair; only a module that reaches a dash.css page can be half-converted.
// Derived from the pages' own script tags (plus the chat bubble, which globalChatButton
// lazy-boots onto every page), so a module wired to a dashboard later is covered.
const PAPERED = new Set();
for (const f of all.filter(x => /\.html$/.test(x))) {
  const h = read(f);
  if (!/dash\.css/.test(h)) continue;
  PAPERED.add(`${f}#babel`);
  for (const m of h.matchAll(/src="(?:\/newdesign\/)?([\w.-]+\.(?:jsx|js))(?:\?[^"]*)?"/g)) PAPERED.add(m[1]);
}
for (const m of read('globalChatButton.js').matchAll(/"(?:\/newdesign\/)?([\w-]+\.jsx)"/g)) PAPERED.add(m[1]);
const onPaper = (f) => PAPERED.has(f.replace(/#babel\d+$/, '#babel'));

// Module-scope string constants (INK, PAPER, TEAL…): these are classic scripts that
// share one global scope, so a bare name may be another file's const. ⚠ pageShell.jsx
// FIRST: it is the chrome every newdesign page loads, so its PAPER / TEAL_BRIGHT are
// the ones a dashboard module sees. First-come over the directory listing resolved
// PAPER to the retired directionB.jsx's "#1a1612" and reported paper panels as fixed.
const globals = new Map();
const byChrome = [...parsed].sort((a, b) => (b.f === 'pageShell.jsx') - (a.f === 'pageShell.jsx'));
for (const { ast } of byChrome) for (const st of ast.program.body) {
  if (st.type !== 'VariableDeclaration') continue;
  for (const d of st.declarations) {
    if (d.id.type === 'Identifier' && d.init && d.init.type === 'StringLiteral' && !globals.has(d.id.name)) globals.set(d.id.name, d.init.value);
  }
}

const PAPER_RE = /^\s*(?:var\(--sh-|rgba\(var\(--sh-)/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
// Every value an expression can take, as strings where they are knowable. A value
// named `accent` is an identity colour a CALLER chooses and callers pass literals
// (NutritionistLiveConsole hands the live panel `#d8b25a`), so it counts as fixed.
function values(n, scope) {
  if (!n) return [];
  switch (n.type) {
    case 'StringLiteral': return [n.value];
    case 'TemplateLiteral': return n.expressions.length ? ['?'] : [n.quasis[0].value.cooked];
    case 'ConditionalExpression': return [...values(n.consequent, scope), ...values(n.alternate, scope)];
    case 'LogicalExpression': return [...values(n.left, scope), ...values(n.right, scope)];
    case 'MemberExpression':
      return (!n.computed && n.property.type === 'Identifier' && n.property.name === 'accent') ? ['#accent'] : ['?'];
    case 'Identifier': {
      const b = scope && scope.getBinding(n.name);
      if (b && b.path.node.type === 'VariableDeclarator' && b.path.node.init) return values(b.path.node.init, b.path.scope);
      if (n.name === 'accent') return ['#accent'];   // a parameter: the caller's literal
      if (!b && globals.has(n.name)) return [globals.get(n.name)];
      return ['?'];
    }
    default: return ['?'];
  }
}
const isPaper = (v) => PAPER_RE.test(v);
const isFixed = (v) => v === '#accent' || HEX_RE.test(v);
const isDarkHex = (v) => HEX_RE.test(v) && lum(v) < 0.03;

// Follow an identifier to the expression it names, within its own scope.
function deref(n, scope) {
  for (let i = 0; i < 5 && n && n.type === 'Identifier'; i++) {
    const b = scope && scope.getBinding(n.name);
    if (!b || b.path.node.type !== 'VariableDeclarator' || !b.path.node.init) break;
    n = b.path.node.init; scope = b.path.scope;
  }
  return { n, scope };
}
// The (fill, ink) combinations that can actually co-occur. Two conditionals on the
// SAME test pair branch-by-branch — `tone === "dark" ? "#0f1513" : paper` beside
// `tone === "dark" ? white : paperInk` is two consistent pairs, not four.
function combos(fillNode, inkNode, scope, code) {
  const a = deref(fillNode, scope), b = deref(inkNode, scope);
  if (a.n && b.n && a.n.type === 'ConditionalExpression' && b.n.type === 'ConditionalExpression' &&
      code.slice(a.n.test.start, a.n.test.end) === code.slice(b.n.test.start, b.n.test.end)) {
    return [...combos(a.n.consequent, b.n.consequent, a.scope, code), ...combos(a.n.alternate, b.n.alternate, a.scope, code)];
  }
  const out = [];
  for (const f of values(a.n, a.scope)) for (const i of (inkNode ? values(b.n, b.scope) : [null])) out.push([f, i]);
  return out;
}

function styleProps(obj) {
  const out = {};
  for (const p of obj.properties) {
    if (p.type !== 'ObjectProperty') continue;
    const k = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null;
    if (k) out[k] = p.value;
  }
  return out;
}

function pairOffenders(inScope = onPaper) {
  const out = [];
  let objects = 0;
  for (const { f, code, ast } of parsed) if (inScope(f)) traverse(ast, {
    ObjectExpression(p) {
      const s = styleProps(p.node);
      if (!s.background) return;
      objects++;
      const line = p.node.loc ? p.node.loc.start.line : '?';
      const pairs = combos(s.background, s.color, p.scope, code);
      // A paper ink on a fixed fill: the ink turns with the paper, the fill does not.
      const bad = pairs.filter(([fill, ink]) => isFixed(fill) && ink && /var\(--sh-(?:ground|ground2|deep)[,)]/.test(ink));
      if (bad.length) out.push(`${f}:${line} — paper-ground ink on a fixed fill (${bad.map(x => x[0]).join(' | ')})`);
      // A dark literal panel whose ink or whose own border follows the paper: half
      // converted, so on the light paper its text or its edge is dark on dark.
      const border = s.border ? values(s.border, p.scope) : [];
      const dark = pairs.filter(([fill, ink]) => isDarkHex(fill) && ((ink && isPaper(ink)) || border.some(v => /var\(--sh-/.test(v))));
      if (dark.length) out.push(`${f}:${line} — a fixed dark panel (${dark.map(x => x[0]).join(', ')}) under paper ink or a paper border`);
    },
    // An SVG glyph painted in the paper's ground, on a fill that does not move.
    JSXAttribute(p) {
      const k = p.node.name.name;
      if (k !== 'fill' && k !== 'stroke') return;
      const v = p.node.value && p.node.value.type === 'StringLiteral' ? p.node.value.value : null;
      if (!v || !/var\(--sh-(?:ground|ground2|deep)[,)]/.test(v)) return;
      for (let a = p.parentPath.parentPath; a; a = a.parentPath) {
        if (a.node.type !== 'JSXElement') continue;
        const style = a.node.openingElement.attributes.find(x => x.type === 'JSXAttribute' && x.name.name === 'style');
        const obj = style && style.value && style.value.expression;
        if (!obj || obj.type !== 'ObjectExpression') continue;
        const s = styleProps(obj);
        if (!s.background) continue;
        if (values(s.background, a.scope).some(isFixed)) out.push(`${f}:${p.node.loc.start.line} — a ${k}="${v}" glyph on a fixed fill`);
        break;
      }
    },
  });
  return { out, objects };
}

test('no ink follows the paper while the fill under it stays put', () => {
  const { out, objects } = pairOffenders();
  assert.ok(PAPERED.size >= 40, `only ${PAPERED.size} modules reach a dash.css page — the derivation stopped matching`);
  assert.ok(PAPERED.has('communityFeed.jsx') && PAPERED.has('dashToday.jsx') && PAPERED.has('ClientGrocery.html#babel'), 'the papered set lost a module it must carry');
  assert.ok(objects > 500, `the style-object walk found only ${objects} objects with a background — it has stopped matching`);
  assert.deepEqual(out, [],
    'text on a FIXED fill takes a fixed ink (near-black #1a1612 reads on every teal, gold and rust fill in this tree), ' +
    'and a panel that keeps a dark literal fill cannot take paper ink or a paper border:\n  ' + out.join('\n  '));
});

test('the pair walk can actually fire', () => {
  // Guard-the-guard: each rule proven against the exact shape it was written for.
  const probe = (code) => {
    const ast = babelParser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
    // (probes see pageShell's globals too, so a bare INK resolves as it does in the tree)
    const saved = parsed.splice(0, parsed.length, { f: 'probe', code, ast });
    try { return pairOffenders(() => true).out; } finally { parsed.splice(0, parsed.length, ...saved); }
  };
  assert.equal(probe('const a = { background: p.accent, color: "var(--sh-ground, #1a1612)" };').length, 1, 'playlist Play button');
  assert.equal(probe('const INK2 = "var(--sh-ink, #f2ede4)"; const a = { background: "#1f1a16", color: INK2 };').length, 1, 'composer: paper ink via a const');
  assert.equal(probe('const a = { background: "#16130f", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)" };').length, 1, 'modal: paper border');
  assert.equal(probe('const x = <div style={{ background: p.accent }}><svg fill="var(--sh-ground, #1a1612)" /></div>;').length, 1, 'glyph on a fixed fill');
  assert.equal(probe('const a = { background: "var(--sh-ink, #f2ede4)", color: "var(--sh-ground, #1a1612)" };').length, 0, 'an inverting pair is legitimate');
  assert.equal(probe('const a = { background: p.accent, color: "#1a1612" };').length, 0, 'near-black on a fixed fill is the fix');
  assert.equal(probe('const bg = t === "d" ? "#0f1513" : "var(--sh-ink-soft, #efece6)"; const fg = t === "d" ? "rgba(255,255,255,0.4)" : "var(--sh-ink2, #a09b94)"; const a = { background: bg, color: fg };').length, 0, 'branchwise pairs on one test are consistent');
  assert.equal(probe('const bg = t === "d" ? "#0f1513" : "var(--sh-ink-soft, #efece6)"; const fg = t === "d" ? "var(--sh-ink2, #a09b94)" : "#000"; const a = { background: bg, color: fg };').length, 1, 'a crossed branch pair still fires');
});

// A CSS rule injected as a string (globalChatButton.js) — the same rule, in CSS.
test('no injected CSS rule pairs a fixed fill with paper-ground text, or a paper fill with a fixed teal', () => {
  const offenders = [];
  let rules = 0;
  for (const f of all.filter(x => /\.js$/.test(x))) {
    for (const m of read(f).matchAll(/"([^"{}]+)\{([^"{}]*)\}"/g)) {
      rules++;
      const decl = Object.fromEntries(m[2].split(';').map(d => d.split(/:(.*)/s)).filter(x => x.length > 1).map(([k, v]) => [k.trim(), v.trim()]));
      const bg = decl.background || '', ink = decl.color || '';
      if (HEX_RE.test(bg) && /var\(--sh-(?:ground|ground2|deep)[,)]/.test(ink)) offenders.push(`${f}: ${m[1]} — ${bg} fill, paper-ground text`);
      if (/^var\(--sh-(?:ground|ground2)[,)]/.test(bg) && HEX_RE.test(ink) && ratio(ink, '#f4f6f5') < 3) offenders.push(`${f}: ${m[1]} — paper fill, fixed ${ink} text (${ratio(ink, '#f4f6f5').toFixed(2)}:1 on the light ground)`);
    }
  }
  assert.ok(rules > 20, `found only ${rules} injected rules — the CSS-string walk stopped matching`);
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

// ── The rest of the round, each an invariant rather than a spelling ─────────
test('a native <option> popup gets its ink and its fill as one fixed pair', () => {
  // The popup is the OS's surface, not the paper, so an option ink or fill that follows
  // the paper lands light-on-white (or dark-on-dark) there. Neither half may be a token.
  const offenders = [];
  let seen = 0;
  for (const { f, ast } of parsed) traverse(ast, {
    JSXOpeningElement(p) {
      if (p.node.name.type !== 'JSXIdentifier' || p.node.name.name !== 'option') return;
      const style = p.node.attributes.find(x => x.type === 'JSXAttribute' && x.name.name === 'style');
      const obj = style && style.value && style.value.expression;
      if (!obj || obj.type !== 'ObjectExpression') return;
      seen++;
      const s = styleProps(obj);
      const ink = s.color ? values(s.color, p.scope) : [], fill = s.background ? values(s.background, p.scope) : [];
      if (ink.some(isPaper) || fill.some(isPaper)) offenders.push(`${f}:${p.node.loc.start.line} — ${[...ink, ...fill].join(' | ')}`);
    },
  });
  assert.ok(seen >= 8, `found ${seen} styled <option>s — the walk stopped matching`);
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every logo lockup in the shared chrome keeps its accessible name', () => {
  // display:none already drops the hidden lockup from the accessibility tree, so an
  // aria-hidden (or an empty alt) strips the name from whichever paper shows that one.
  const shell = read('pageShell.jsx');
  const imgs = [...shell.matchAll(/<img src="\/shape-logo-nav-[^"]+"[^>]*display: "var\(--sh-logo-(?:light|dark)[^>]*\/>/g)].map(m => m[0]);
  assert.ok(imgs.length >= 4, `found ${imgs.length} paper-gated lockups — the header and the footer carry two each`);
  for (const i of imgs) {
    assert.match(i, /alt="Shape"/, 'a lockup lost its name: ' + i.slice(0, 80));
    assert.doesNotMatch(i, /aria-hidden/, 'a lockup is hidden from assistive tech: ' + i.slice(0, 80));
  }
});

test('DashPill is never handed a bare hex — the severity table carries the paper', () => {
  const offenders = [];
  let pills = 0;
  for (const { f, ast } of parsed) traverse(ast, {
    JSXOpeningElement(p) {
      if (p.node.name.type !== 'JSXIdentifier' || p.node.name.name !== 'DashPill') return;
      const c = p.node.attributes.find(x => x.type === 'JSXAttribute' && x.name.name === 'c');
      if (!c || !c.value || c.value.type !== 'JSXExpressionContainer') return;
      pills++;
      const v = values(c.value.expression, p.scope);
      if (v.some(x => HEX_RE.test(x))) offenders.push(`${f}:${p.node.loc.start.line} — ${v.join(' | ')}`);
    },
  });
  assert.ok(pills >= 5, `found ${pills} DashPills — the walk stopped matching`);
  assert.deepEqual(offenders, [], 'a hex pill stays on the dark paper (#2ee0c4 reads 1.6:1 on white); use DASH_SEV_COLORS:\n  ' + offenders.join('\n  '));
});

test('a playlist accent is a hex literal, because every consumer hex-appends it', () => {
  // `${p.accent}55` and `${p.accent}1a` are valid only for a hex; a var() accent makes
  // the whole declaration invalid and the chip loses its border and tint.
  const offenders = [];
  let records = 0;
  for (const { f, ast } of parsed) traverse(ast, {
    ObjectExpression(p) {
      const s = styleProps(p.node);
      if (!s.accent || !s.provider) return;
      records++;
      const v = values(s.accent, p.scope);
      if (!v.length || !v.every(x => HEX_RE.test(x))) offenders.push(`${f}:${p.node.loc.start.line} — ${v.join(' | ')}`);
    },
  });
  assert.ok(records >= 6, `found ${records} playlist records — the walk stopped matching`);
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('the trajectory chart and the cycle plate draw in tokens, fill ink included', () => {
  const biz = read('dashBusiness.jsx');
  const chart = [...biz.matchAll(/^const (DBZ_T_\w+) = "([^"]+)"/gm)];
  assert.ok(chart.length >= 6, 'the DBZ_T_* palette moved');
  for (const [, name, v] of chart) assert.match(v, PAPER_RE, `${name} (${v}) is drawn on the moving ground, so it must move too`);
  const prog = parsed.find(u => u.f === 'dashProgress.jsx');
  for (const k of ['DPR_CYCLE_HEAT', 'DPR_CYCLE_HEAT_INK']) {
    const m = new RegExp('^const ' + k + ' = "([^"]+)"', 'm').exec(prog.code);
    assert.ok(m, `${k} is gone from dashProgress.jsx`);
    assert.match(m[1], PAPER_RE, `${k} (${m[1]}) is TEXT on the moving card, so it must be a paper token`);
  }
  const bad = [];
  traverse(prog.ast, {
    ObjectExpression(p) {
      const s = styleProps(p.node);
      if (!s.background || !s.color) return;
      const src = prog.code.slice(s.background.start, s.background.end);
      if (!/DPR_CYCLE_HEAT\b/.test(src)) return;
      if (values(s.color, p.scope).some(v => HEX_RE.test(v))) bad.push(`dashProgress.jsx:${p.node.loc.start.line}`);
    },
  });
  assert.deepEqual(bad, [], 'text on the cycle heat must be --sh-cycle-heat-ink: no teal clears 4.5:1 both as text on white and under #0b0f0f\n  ' + bad.join('\n  '));
});
