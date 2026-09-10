// The record numeral is drawn, not typeset — so the test reads the digits back
// out of the rendered dots rather than trusting a string prop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, SHIM, flatten } from './helpers/broadsheet-mount.mjs';

globalThis.BSPlate = ({ children }) => SHIM.createElement('div', null, children);
globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
const { BSDotNumber, BS_DOT_GLYPHS, bsDotChars } = await loadBroadsheet(['BSDotNumber', 'BS_DOT_GLYPHS', 'bsDotChars']);

// Re-read a rendered figure by matching each character cell's lit pattern back
// against the glyph table — the inverse of the drawing, so a wrong glyph row
// cannot pass by agreeing with itself.
function readBack(text, size = 35) {
  // Two explicit colours, so "lit" is read off the fill rather than guessed
  // from a theme-derived alpha the harness may render differently.
  const d = drive(BSDotNumber, { text, size, color: '#ON', dim: '#OFF' });
  const rects = flatten(d.nodes()[0]).filter((n) => n.type === 'rect');
  const svg = d.nodes()[0];
  const unit = size / 7;
  const advance = 6 * unit;
  const lit = rects.filter((r) => r.props.fill === '#ON');
  const cells = new Map();
  for (const r of lit) {
    // ⚠ FLOOR, NOT ROUND. `raw` is `i*advance + x*unit`, and a dot in the
    // right-hand columns (x up to 4 of a 6-unit advance) rounds INTO the next
    // glyph — every character then read back as an unrecognised smear.
    const raw = r.props.x - (unit - r.props.width) / 2;
    const i = Math.floor(raw / advance + 1e-6);
    const x = Math.round((raw - i * advance) / unit);
    const y = Math.round((r.props.y - (unit - r.props.height) / 2) / unit);
    if (!cells.has(i)) cells.set(i, new Set());
    cells.get(i).add(`${y},${x}`);
  }
  const out = [];
  for (const [i, on] of [...cells.entries()].sort((a, b) => a[0] - b[0])) {
    const hit = Object.entries(BS_DOT_GLYPHS).find(([, rows]) => {
      const want = new Set();
      rows.forEach((row, y) => row.split('').forEach((c, x) => { if (c === '1') want.add(`${y},${x}`); }));
      return want.size === on.size && [...want].every((k) => on.has(k));
    });
    out[i] = hit ? hit[0] : '?';
  }
  return { text: out.join(''), svgWidth: svg.props.width, svgHeight: svg.props.height };
}

test('every digit renders as itself', () => {
  const r = readBack('0123456789');
  assert.equal(r.text, '0123456789');
});

test('a decimal figure keeps its point in the right place', () => {
  assert.equal(readBack('245').text, '245');
  assert.equal(readBack('18.2').text, '18.2');
  assert.equal(readBack('1,240').text, '1,240');
});

test('no two digits share a pattern', () => {
  // A duplicated row between, say, 6 and 8 would make readBack ambiguous and
  // the figure genuinely unreadable on screen.
  const seen = new Map();
  for (const [ch, rows] of Object.entries(BS_DOT_GLYPHS)) {
    const key = rows.join('|');
    assert.ok(!seen.has(key), `${ch} draws the same dots as ${seen.get(key)}`);
    seen.set(key, ch);
  }
});

test('every glyph is exactly 7 rows of 5 columns', () => {
  for (const [ch, rows] of Object.entries(BS_DOT_GLYPHS)) {
    assert.equal(rows.length, 7, `${ch} row count`);
    for (const row of rows) {
      assert.equal(row.length, 5, `${ch} column count`);
      assert.match(row, /^[01]{5}$/, `${ch} holds only 0/1`);
    }
  }
});

test('a character with no glyph is dropped, never drawn as a gap', () => {
  // A silent blank cell inside a number reads as a different number.
  assert.equal(bsDotChars('2a4b5').join(''), '245');
  assert.equal(bsDotChars('245 lb').join(''), '245 ');
  assert.equal(bsDotChars(null).length, 0);
  assert.equal(bsDotChars('lb').length, 0);
});

test('an unrenderable figure draws nothing at all', () => {
  const d = drive(BSDotNumber, { text: 'lb', size: 30 });
  assert.equal(d.nodes().length, 0, 'no empty svg box is left behind');
});

test('the size IS the cap height, so figures line up with type set beside them', () => {
  const r = readBack('245', 35);
  assert.equal(r.svgHeight, 35);
  // three glyphs at 5 columns + 1 column of tracking, less the trailing gap
  assert.equal(Math.round(r.svgWidth), Math.round(3 * 6 * 5 - 5));
});
