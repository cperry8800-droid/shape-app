// The Radio page's Nora box header, public/nora-stage.webp: a still of the booth's LED wall with
// NORA on it.
//
// Owner, 2026-10-15, on the first still: "can the quality of this image be improved. looks very
// pixelated". It was rendered once at 1600x900 and cropped to 1600x560, so the wall's 75 mm dots
// fell on a 5.4 px pitch the pixel grid could not hold evenly, and a 2x screen (the box is 860 CSS
// px wide, so 1720 device px) upscaled it. The still is now rendered at 2x (3200x1800,
// prototypes/nora-booth/nora-wall-still.cjs with SCALE=2) and downscaled to 1720x602.
//
// This holds what a re-render could quietly undo: a still narrower than the box at 2x, a crop that
// no longer matches the band's aspect ratio (cover would then cut NORA), and a re-export heavy
// enough to slow the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STILL = path.join(ROOT, 'public', 'nora-stage.webp');
const RADIO = readFileSync(path.join(ROOT, 'public', 'newdesign', 'radio.jsx'), 'utf8');
// 337 KB when this was written; the cap leaves room for a re-export, not for a lossless one.
const MAX_BYTES = 500 * 1024;

// Width and height of a WebP: lossy ("VP8 "), lossless ("VP8L") or extended ("VP8X").
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

// The Nora box and its header band, read from the page rather than restated here.
function boxAndBand() {
  const at = RADIO.indexOf('<section id="nora"');
  assert.ok(at > 0, 'radio.jsx has no <section id="nora">');
  const box = RADIO.slice(at).match(/maxWidth:\s*(\d+)/);
  assert.ok(box, 'the Nora box has no maxWidth');
  const band = RADIO.slice(at).match(/aspectRatio:\s*"(\d+)\s*\/\s*(\d+)",[^\n]*RD_NORA_STAGE/);
  assert.ok(band, 'the header band has no aspectRatio beside RD_NORA_STAGE');
  return { boxWidth: Number(box[1]), ratio: Number(band[1]) / Number(band[2]) };
}

test('the page shows /nora-stage.webp as the header', () => {
  assert.match(RADIO, /const RD_NORA_STAGE = "\/nora-stage\.webp";/);
});

test('the still is sharp on a 2x screen: at least twice the box width', () => {
  const { width } = webpSize(readFileSync(STILL));
  const { boxWidth } = boxAndBand();
  assert.ok(width >= 2 * boxWidth, `nora-stage.webp is ${width} px wide; the box is ${boxWidth} CSS px, so a 2x screen needs ${2 * boxWidth}`);
});

test("the still has the band's aspect ratio, so cover does not crop NORA", () => {
  const { width, height } = webpSize(readFileSync(STILL));
  const { ratio } = boxAndBand();
  assert.ok(Math.abs(width / height - ratio) / ratio < 0.005, `nora-stage.webp is ${width}x${height} (${(width / height).toFixed(4)}); the band is ${ratio.toFixed(4)}`);
});

test('the still stays light', () => {
  const size = statSync(STILL).size;
  assert.ok(size <= MAX_BYTES, `nora-stage.webp is ${size} bytes, over the ${MAX_BYTES}-byte cap`);
});

test('webpSize reads all three WebP kinds', () => {
  const riff = (kind, body) => {
    const chunk = Buffer.concat([Buffer.from(kind, 'latin1'), Buffer.alloc(4), body]);
    return Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), chunk]);
  };
  const lossy = Buffer.alloc(10); lossy.writeUInt16LE(1720, 6); lossy.writeUInt16LE(602, 8);
  assert.deepEqual(webpSize(riff('VP8 ', lossy)), { width: 1720, height: 602 });
  const lossless = Buffer.alloc(5); lossless.writeUInt32LE(((602 - 1) << 14) | (1720 - 1), 1);
  assert.deepEqual(webpSize(riff('VP8L', lossless)), { width: 1720, height: 602 });
  const ext = Buffer.alloc(10); ext.writeUIntLE(1720 - 1, 4, 3); ext.writeUIntLE(602 - 1, 7, 3);
  assert.deepEqual(webpSize(riff('VP8X', ext)), { width: 1720, height: 602 });
});
