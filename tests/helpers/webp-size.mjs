// Width and height of a WebP file, read from its header: lossy ("VP8 "), lossless ("VP8L") or
// extended ("VP8X"). For tests that hold a picture to the size its box needs.
import assert from 'node:assert/strict';

export function webpSize(buf) {
  assert.equal(buf.toString('latin1', 0, 4) + buf.toString('latin1', 8, 12), 'RIFFWEBP', 'not a WebP file');
  const kind = buf.toString('latin1', 12, 16);
  if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  throw new Error(`unknown WebP chunk ${JSON.stringify(kind)}`);
}
