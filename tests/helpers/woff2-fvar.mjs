// Read a table out of a woff2 file, and the axes out of its `fvar` table.
// Moved here from tests/radio-font-axes.test.mjs so every font guard reads the
// shipped bytes the same way (the cooking faces use it too). Hand-rolled on
// purpose: fontTools is Python and this suite runs in Node.

import assert from 'node:assert/strict';
import { brotliDecompressSync } from 'node:zlib';

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
export function woff2Table(buf, want) {
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

// fvar, per the OpenType spec: a 16-byte header then axisCount records of
// axisSize bytes, each opening with its four-character tag.
export function fvarAxes(tbl) {
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
