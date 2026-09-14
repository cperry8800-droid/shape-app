// THE SHIPPED FONT FILE MUST CARRY BOTH AXES, AND THE ONLY PROOF IS ITS OWN BYTES.
//
// WHY THIS FILE EXISTS: on 2026-09-11 the homepage asked Google Fonts for
// `Doto:wght@100..900`. That service delivers the axes you NAME and pins every
// other one at its default, so the font arrived with no `ROND` axis at all —
// and all sixteen `font-variation-settings:'ROND' N` rules were inert while
// every figure rendered at Doto's default square-dot form, which is the one
// setting the review says cannot be read at display size.
//
// ⚠ NOTHING COULD HAVE REPORTED IT. An ignored `font-variation-settings` axis is
// not an error in any browser, linter or build — the page renders, it just
// renders the wrong glyph. The only thing that finds it is comparing the axes
// USED against the axes the shipped file actually HAS.
//
// The mobile app bundles its fonts as local woff2 rather than fetching them, so
// here the question is sharper still: are the bytes in the repo the two-axis file
// or the one-axis file? fontsource ships both, and — measured — its
// `doto-latin-full-normal.woff2` and `doto-latin-rond-normal.woff2` are
// BYTE-IDENTICAL while `doto-latin-wght-normal.woff2` is a different file with
// `wght` alone. A filename is not evidence. This reads the `fvar` table.
//
// The parser below is deliberately hand-rolled: `fontTools` is a Python package
// and this suite runs in Node, so a guard that depended on it would not run in CI
// at all — which is the same as not having one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const FONT = new URL('../mobile-app/src/assets/fonts/font-28.woff2', import.meta.url);
const CSS = new URL('../mobile-app/src/fonts.css', import.meta.url);

// woff2 spec, Appendix A — the 63 tags a directory entry can name by index.
// Index 63 means "an arbitrary tag follows as four bytes".
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

// UIntBase128 — seven bits a byte, high bit continues. Multiplication rather than
// `<<` so a value above 2^31 cannot wrap into a negative and read as a short table.
function readBase128(buf, pos) {
  let acc = 0;
  let p = pos;
  for (let i = 0; i < 5; i += 1) {
    const b = buf[p];
    p += 1;
    if (i === 0 && b === 0x80) throw new Error('UIntBase128 has a leading zero');
    acc = acc * 128 + (b & 0x7f);
    if (!(b & 0x80)) return [acc, p];
  }
  throw new Error('UIntBase128 runs past five bytes');
}

// Pull one table out of a woff2 container. Only the table DIRECTORY is plain; the
// table data itself is one brotli stream holding every table back to back in
// directory order, so reaching `fvar` means summing the lengths ahead of it.
function woff2Table(buf, want) {
  assert.equal(buf.toString('ascii', 0, 4), 'wOF2', 'not a woff2 file');
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  assert.ok(numTables > 0, 'woff2 declares no tables');

  let p = 48;
  const entries = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[p];
    p += 1;
    const idx = flags & 0x3f;
    const xform = (flags >> 6) & 0x03;
    let tag;
    if (idx === 0x3f) {
      tag = buf.toString('ascii', p, p + 4);
      p += 4;
    } else {
      tag = KNOWN_TAGS[idx];
      assert.ok(tag, `woff2 names an unknown table index ${idx}`);
    }
    let origLength;
    [origLength, p] = readBase128(buf, p);
    // glyf and loca invert the convention: for those two, version 0 IS the
    // transformed form. Getting this backwards shifts every later table's offset.
    const transformed = tag === 'glyf' || tag === 'loca' ? xform === 0 : xform !== 0;
    let streamLength = origLength;
    if (transformed) [streamLength, p] = readBase128(buf, p);
    entries.push({ tag, origLength, streamLength });
  }

  const data = brotliDecompressSync(buf.subarray(p, p + totalCompressedSize));
  let off = 0;
  for (const e of entries) {
    if (e.tag === want) return data.subarray(off, off + e.origLength);
    off += e.streamLength;
  }
  return null;
}

// fvar, per the OpenType spec: an 16-byte header then axisCount records of
// axisSize bytes, each opening with its four-character tag.
function fvarAxes(tbl) {
  assert.ok(tbl && tbl.length >= 16, 'fvar table is missing or truncated');
  const axesArrayOffset = tbl.readUInt16BE(4);
  const axisCount = tbl.readUInt16BE(8);
  const axisSize = tbl.readUInt16BE(10);
  const out = [];
  for (let i = 0; i < axisCount; i += 1) {
    const at = axesArrayOffset + i * axisSize;
    out.push({
      tag: tbl.toString('ascii', at, at + 4),
      min: tbl.readInt32BE(at + 4) / 65536,
      def: tbl.readInt32BE(at + 8) / 65536,
      max: tbl.readInt32BE(at + 12) / 65536,
    });
  }
  return out;
}

test('the bundled Doto file carries BOTH the ROND and wght axes', () => {
  const buf = readFileSync(FONT);
  const axes = fvarAxes(woff2Table(buf, 'fvar'));
  const byTag = new Map(axes.map((a) => [a.tag, a]));

  // The guard-the-guard line: if the parser silently returned nothing, every
  // assertion below would be about an empty map and would pass vacuously.
  assert.ok(axes.length >= 2, `fvar reports ${axes.length} axes — the parser found nothing to check`);

  const rond = byTag.get('ROND');
  assert.ok(rond, `ROND is absent — the bundled file carries only [${axes.map((a) => a.tag).join(', ')}]. `
    + 'This is the wght-only file; the two-axis one is doto-latin-full-normal.woff2.');
  assert.ok(rond.max > rond.min, `ROND does not vary: ${rond.min}..${rond.max}`);
  assert.ok(rond.max >= 100, `ROND tops out at ${rond.max}, below the round-dot end the readings need`);

  const wght = byTag.get('wght');
  assert.ok(wght, 'wght is absent — the readings could not be weighted');
  assert.ok(wght.min <= 100 && wght.max >= 900, `wght is ${wght.min}..${wght.max}, not the full 100..900`);
});

test('the bundled Doto file can actually spell a reading', () => {
  // A variable font with the right axes and no digits would still render nothing.
  const buf = readFileSync(FONT);
  const cmap = woff2Table(buf, 'cmap');
  assert.ok(cmap && cmap.length > 0, 'cmap is missing');
  // Format-4 subtable lookup is more parser than this needs; the character count
  // in the font's own maxp is enough to prove it is not an empty subset.
  const maxp = woff2Table(buf, 'maxp');
  assert.ok(maxp && maxp.length >= 6, 'maxp is missing');
  const numGlyphs = maxp.readUInt16BE(4);
  assert.ok(numGlyphs >= 100, `only ${numGlyphs} glyphs — this is not the latin subset`);
});

test('fonts.css declares Doto against the file that was checked', () => {
  const css = readFileSync(CSS, 'utf8');
  const block = css.slice(css.indexOf("font-family: 'Doto'"));
  assert.ok(block.length > 0, "fonts.css declares no 'Doto' family");
  const face = block.slice(0, block.indexOf('}'));
  assert.match(face, /font-28\.woff2/, 'the Doto face points at a file this guard did not read');
  // The weight RANGE, not a single weight: declaring `font-weight: 400` on a
  // variable face makes the browser clamp it and the wght axis goes inert — the
  // same silent failure as a missing axis, one layer up.
  assert.match(face, /font-weight:\s*100\s+900/, 'the Doto face does not declare the full weight range');
});
