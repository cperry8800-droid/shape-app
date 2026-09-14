// The members page's type, and the request that has to back it.
//
// ⚠ GOOGLE FONTS SERVES THE AXES YOU ASK FOR AND PINS THE REST AT THEIR DEFAULT.
// A family requested without `wdth` delivers a font on which every
// `font-variation-settings: 'wdth' N` is INERT — and an ignored axis is not an
// error in any browser, in any linter, or in the build. The page renders; it
// renders the wrong glyph. index.html shipped exactly that defect (`Doto` asked
// for weight only, sixteen ROND rules dead), and the only thing that finds it is
// comparing the axes USED against the axes REQUESTED. So: this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const HTML = readFileSync(new URL('../public/newdesign/Client.html', import.meta.url), 'utf8');
// ⚠ COMMENTS OUT OF THE JSX. The type note names the retired families in prose to
// explain what moved — a raw scan would find `serif` there and report the port
// incomplete, which is the trap this repo has paid for on four separate guards.
const PAGE = stripComments(readFileSync(new URL('../public/newdesign/clientOverview.jsx', import.meta.url), 'utf8'));

/** `50..150` → [50,150] · `700` → [700,700] · anything else → null.
 *  Split on `..`; never match it with a character class — `[\d.]+` is greedy over
 *  the dots, so `50..150` matches whole and `Number()` of it is NaN. */
function range(spec) {
  const parts = String(spec).trim().split('..');
  if (parts.length > 2 || !parts.every((p) => /^-?\d+(?:\.\d+)?$/.test(p))) return null;
  return [Number(parts[0]), Number(parts[parts.length - 1])];
}

/** The page's own <link>, parsed into { family: { axis: [lo, hi] } }. */
function requested() {
  const link = /<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(HTML);
  assert.ok(link, 'Client.html requests no web font — every family below renders its fallback');
  const out = {};
  // ⚠ `[A-Za-z,]`, NOT `[a-z,]`. Axis tags are case-sensitive, and two of the
  // three registered ones this site uses are upper (`ROND`, and `wdth`/`wght`
  // lower). The first cut matched lowercase only, so `Doto:ROND,wght@…` parsed as
  // a family with NO AXES AT ALL — and the guard then reported Doto as requested
  // without a weight range, on a URL that plainly names one. A parser that reports
  // a failure is as broken as one that reports a pass.
  for (const m of link[1].matchAll(/family=([A-Za-z+]+)(?::([A-Za-z,]+)@([^&"]+))?/g)) {
    const family = m[1].replace(/\+/g, ' ');
    const axes = {};
    if (m[2]) {
      const names = m[2].split(',');
      // Each spec is `;`-separated instances, `,`-separated axis values within one.
      const cols = names.map(() => []);
      for (const inst of m[3].split(';')) {
        const vals = inst.split(',');
        vals.forEach((v, i) => { if (cols[i]) cols[i].push(v); });
      }
      names.forEach((n, i) => {
        const rs = cols[i].map(range).filter(Boolean);
        if (rs.length) axes[n] = [Math.min(...rs.map((r) => r[0])), Math.max(...rs.map((r) => r[1]))];
      });
    }
    out[family] = axes;
  }
  assert.ok(Object.keys(out).length >= 3, 'parsed only ' + Object.keys(out).length + ' families — the parse stopped matching');
  return out;
}
const REQ = requested();

// The page's three families, read from the file rather than named here, so a
// renamed constant fails instead of silently dropping out of the sweep.
function familyOf(constant) {
  const m = new RegExp('const ' + constant + ' = "([^"]+)"').exec(PAGE);
  assert.ok(m, constant + ' is no longer declared in clientOverview.jsx');
  return /'([^']+)'/.exec(m[1])[1]; // the first quoted name is the real face
}

// ── style objects, read whole ────────────────────────────────────────────────
// ⚠ A LINE IS NOT A STYLE OBJECT, and both of Codex's findings on this file come
// from pretending it is. The first cut swept `fontWeight:` from the REMAINDER OF
// THE fontFamily LINE, so a multiline object — `fontFamily: clSans,` on one line
// and `fontWeight: 500,` two lines down, which this page has at the paths CTA —
// was invisible: an out-of-range weight there passed. And it checked each
// variation axis against "whichever requested family carries that axis", which
// says nothing about the family the RULE IS ON: move a `'wdth' 100` onto
// `clSans` and the axis is inert on Schibsted while the guard still reads
// `owners === ['Anybody']` and passes.
//
// So: brace-match every object literal, and read family, weight and axes from
// the SAME object. The walker tracks quotes and template interpolation, because
// a `}` inside a string or a `${…}` is not a closing brace.
function styleObjects(src) {
  const spans = [];
  const stack = [];
  // modes: 0 code · 1 '…' · 2 "…" · 3 `…` (template) — interpolation pushes back to 0
  let mode = 0;
  const tmpl = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (mode === 0) {
      if (c === '\\') { i++; continue; }
      if (c === "'") mode = 1;
      else if (c === '"') mode = 2;
      else if (c === '`') { mode = 3; tmpl.push(stack.length); }
      else if (c === '{') stack.push(i);
      else if (c === '}') {
        const open = stack.pop();
        if (open === undefined) continue;
        // a `}` that closes a template interpolation returns us to the template
        if (tmpl.length && stack.length === tmpl[tmpl.length - 1]) { mode = 3; continue; }
        spans.push([open, i + 1]);
      }
    } else if (mode === 3) {
      if (c === '\\') { i++; continue; }
      if (c === '`') { mode = 0; tmpl.pop(); }
      else if (c === '$' && src[i + 1] === '{') { stack.push(i + 1); i++; mode = 0; }
    } else {
      if (c === '\\') { i++; continue; }
      if ((mode === 1 && c === "'") || (mode === 2 && c === '"')) mode = 0;
    }
  }
  // ⚠ SMALLEST FIRST, and skip any block that CONTAINS one already taken. The
  // first cut sorted largest-first, so an enclosing JSX container swallowed the
  // object literals inside it: the walker returned 10 blobs instead of ~50, and
  // one of them carried a clNum family beside a clDisp axis and reported `'wdth'
  // set on Doto`. The innermost block containing a fontFamily IS the style object.
  spans.sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]));
  const out = [];
  const claimed = [];
  for (const [a, b] of spans) {
    const body = src.slice(a, b);
    if (!/\bfontFamily:/.test(body)) continue;
    if (claimed.some(([x, y]) => a <= x && b >= y)) continue;  // encloses one we already took
    claimed.push([a, b]);
    out.push(body);
  }
  return out;
}

const OBJECTS = styleObjects(PAGE);

test('the page requests every family it sets, with a usable weight range', () => {
  assert.ok(OBJECTS.length >= 40, 'parsed only ' + OBJECTS.length + ' style objects — the walker stopped matching');
  const seenFamily = new Set();
  for (const o of OBJECTS) {
    const fam = /\bfontFamily: (clDisp|clNum|clSans)\b/.exec(o);
    if (!fam) continue;                       // a style object on a shared-chrome family; not this page's type
    seenFamily.add(fam[1]);
    const face = familyOf(fam[1]);
    assert.ok(REQ[face], fam[1] + ' is set in ' + face + ', which Client.html does not request');
    const w = /\bfontWeight: (\d+)/.exec(o);
    // ⚠ DISPLAY AND READINGS MUST NAME A WEIGHT. Anybody's default is 400 and this
    // page's display is 500; Doto's is 400 and its labels are 700. Three clDisp
    // sites shipped with the family and the axis and NO weight — they rendered at
    // 400 among fifteen siblings at 500, and nothing said so. Body may inherit:
    // Schibsted at its 400 default is the body face doing its job.
    if (fam[1] !== 'clSans') {
      assert.ok(w, fam[1] + ' sets no fontWeight, so it renders at the face default: ' + o.slice(0, 110));
    }
    if (w) {
      const wght = REQ[face].wght;
      assert.ok(wght, face + ' is requested without a weight range, so every fontWeight on it is pinned at the default');
      assert.ok(Number(w[1]) >= wght[0] && Number(w[1]) <= wght[1],
        `${face} is set at weight ${w[1]}, outside the requested ${wght[0]}..${wght[1]} — it will clamp`);
    }
  }
  assert.deepEqual([...seenFamily].sort(), ['clDisp', 'clNum', 'clSans'],
    'a family is declared and never used — the sweep is reading nothing');
});

test('every variation axis is on a family that asked for it, at a value in range', () => {
  let n = 0;
  for (const o of OBJECTS) {
    const axes = [...o.matchAll(/fontVariationSettings: "'(\w+)' (-?\d+(?:\.\d+)?)"/g)];
    if (!axes.length) continue;
    // ⚠ THE FAMILY IN THE SAME OBJECT, not "whoever requested this axis". An axis
    // set on a family that did not request it is INERT — which is the whole defect
    // this file exists for, and the version that asked only "is this axis
    // requested by someone" could not see it.
    const fam = /\bfontFamily: (clDisp|clNum|clSans)\b/.exec(o);
    assert.ok(fam, 'a style object sets a variation axis and names no family, so it rides whatever it inherits: ' + o.slice(0, 110));
    const face = familyOf(fam[1]);
    for (const [, axis, value] of axes) {
      n++;
      const axes_ = REQ[face];
      assert.ok(axes_ && axes_[axis],
        `'${axis}' is set on ${face}, which Client.html does not request it with — the declaration is inert`);
      const [lo, hi] = axes_[axis];
      assert.ok(Number(value) >= lo && Number(value) <= hi,
        `'${axis}' ${value} is outside ${face}'s requested ${lo}..${hi}`);
    }
  }
  assert.ok(n >= 2, 'found only ' + n + ' axis settings — the sweep stopped matching');
});

// ⚠ THE OLD THREE MUST STAY IN THE REQUEST. They are not this page's type — they
// are the SHARED CHROME's: pageShell's header and footer read Fraunces and Space
// Grotesk 37 times and JetBrains Mono 30 more. Dropping them from the link because
// the page stopped using them renders this page's own header in a fallback face.
test('the shared chrome keeps the families it is set in', () => {
  for (const fam of ['Fraunces', 'Space Grotesk', 'JetBrains Mono']) {
    assert.ok(REQ[fam], 'Client.html no longer requests ' + fam + ', which pageShell\'s header and footer are set in');
  }
});

test('the port left nothing behind', () => {
  for (const dead of ['fontFamily: serif', 'fontFamily: sans', "JetBrains Mono', monospace"]) {
    assert.ok(!PAGE.includes(dead), 'clientOverview.jsx still sets type via ' + dead);
  }
  // ⚠ AND NO SYNTHESISED ITALIC. Neither page in this system requests Anybody's
  // `ital` axis, so `font-style: italic` on it is the browser shearing the upright
  // — which is the thing a real italic axis exists to avoid. Both pages colour
  // their emphasis instead.
  assert.ok(!/fontStyle: "italic"/.test(PAGE), 'the page slants a face whose italic axis is not requested');
});

test('the metrics-matched fallbacks are declared', () => {
  for (const f of ['Anybody Fallback', 'Schibsted Fallback', 'Doto Fallback']) {
    assert.ok(HTML.includes(`font-family:'${f}'`), 'Client.html declares no ' + f + ' — the page reflows when the real face lands');
  }
});
