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

test('the page requests every family it sets, with a usable weight range', () => {
  const weights = { clDisp: [], clNum: [], clSans: [] };
  for (const c of Object.keys(weights)) {
    for (const m of PAGE.matchAll(new RegExp('fontFamily: ' + c + '([^\\n]*)', 'g'))) {
      for (const w of m[1].matchAll(/fontWeight: (\d+)/g)) weights[c].push(Number(w[1]));
    }
  }
  assert.ok(Object.values(weights).every((w) => w.length), 'a family is declared and never used — the sweep is reading nothing');
  for (const [c, used] of Object.entries(weights)) {
    const fam = familyOf(c);
    assert.ok(REQ[fam], c + ' is set in ' + fam + ', which Client.html does not request');
    const wght = REQ[fam].wght;
    assert.ok(wght, fam + ' is requested without a weight range, so every fontWeight on it is pinned at the default');
    for (const w of used) {
      assert.ok(w >= wght[0] && w <= wght[1],
        `${fam} is set at weight ${w}, outside the requested ${wght[0]}..${wght[1]} — it will clamp`);
    }
  }
});

test('every variation axis the page sets is one it asked for, at a value in range', () => {
  const used = [...PAGE.matchAll(/fontVariationSettings: "'(\w+)' (-?\d+(?:\.\d+)?)"/g)].map((m) => [m[1], Number(m[2])]);
  assert.ok(used.length >= 2, 'found only ' + used.length + ' axis settings — the sweep stopped matching');
  for (const [axis, value] of used) {
    // ⚠ A SINGLE-FAMILY AXIS IS A RULE FOR THAT FAMILY, BY CONSTRUCTION: if exactly
    // one requested family carries the axis, a rule setting it either targets that
    // family or is inert — and inert is what this test forbids. Shared axes cannot
    // be attributed this way, so they are named rather than guessed at.
    const owners = Object.entries(REQ).filter(([, axes]) => axes[axis]).map(([f]) => f);
    assert.equal(owners.length, 1,
      `'${axis}' is requested by ${owners.length} families (${owners.join(', ') || 'none'}) — with none it is inert, with two this test cannot say whose rule it is`);
    const [lo, hi] = REQ[owners[0]][axis];
    assert.ok(value >= lo && value <= hi,
      `'${axis}' ${value} is outside ${owners[0]}'s requested ${lo}..${hi}`);
  }
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
