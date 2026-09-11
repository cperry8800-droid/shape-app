// The photo import's DECODE BOUND, driven rather than grepped.
//
// ⚠ WHY THIS FILE EXISTS. The guard it covers was wrong in a way that reads as
// right: a 25 MB ceiling on the COMPRESSED file, under a comment explaining that
// a 48 MP shot decodes to ~190 MB of RGBA and kills the WebView. Those two facts
// do not meet — an ordinary 48 MP JPEG is 6–12 MB on disk and sails through —
// so the guard waved through precisely the file it was written for. Only the
// PIXELS bound the decode, and pixels come out of the header.
//
// Both functions are lifted from the shipped source and EXECUTED. A source scan
// could not tell a header walk from a byte scan, and the difference between
// those two is a thumbnail's dimensions reported as the photo's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');

// Brace-match a top-level function out of the source.
// ⚠ IT SKIPS THE PARAMETER LIST AND ASSERTS IT GOT A BODY. Counting braces from
// `function NAME(` returns the SIGNATURE when a parameter is destructured — the
// defect that made a 47-character string pass every assertion written against it
// in #2032 and again one PR later. These parameters are plain, so the naive form
// would work; the assertion is what keeps that true.
function lift(name) {
  const at = SRC.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `no function ${name} in shapeBackend.js`);
  const open = SRC.indexOf('{', SRC.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < SRC.length; i += 1) {
    if (SRC[i] === '{') depth += 1;
    else if (SRC[i] === '}') { depth -= 1; if (depth === 0) {
      const body = SRC.slice(at, i + 1);
      assert.ok(body.length > 200, `lifted ${name} is ${body.length} chars — that is a signature, not a body`);
      return body;
    } }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const constOf = (name) => {
  const m = SRC.match(new RegExp(`^const ${name} = ([^;]+);`, 'm'));
  assert.ok(m, `no const ${name}`);
  return m[1];
};

// ── the header reader ──────────────────────────────────────────────────────

const bsImageHeaderDims = new Function(`${lift('bsImageHeaderDims')}; return bsImageHeaderDims;`)();

const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};
const gif = (w, h) => {
  const b = Buffer.alloc(14);
  b.write('GIF89a', 0, 'latin1');
  b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8);
  return b;
};
// A JPEG with `segments` before its SOF. Each segment is [marker, payload].
const jpeg = (w, h, segments = [], sof = 0xc0) => {
  const parts = [Buffer.from([0xff, 0xd8])];
  for (const [marker, payload] of segments) {
    const head = Buffer.alloc(4);
    head[0] = 0xff; head[1] = marker; head.writeUInt16BE(payload.length + 2, 2);
    parts.push(head, payload);
  }
  const f = Buffer.alloc(11);
  f[0] = 0xff; f[1] = sof; f.writeUInt16BE(9, 2); f[4] = 8;
  f.writeUInt16BE(h, 5); f.writeUInt16BE(w, 7);
  parts.push(f, Buffer.alloc(64));
  return Buffer.concat(parts);
};
const webpVP8 = (w, h) => {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1'); b.write('WEBP', 8, 'latin1'); b.write('VP8 ', 12, 'latin1');
  b.writeUInt16LE(w & 0x3fff, 26); b.writeUInt16LE(h & 0x3fff, 28);
  return b;
};
const webpVP8X = (w, h) => {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1'); b.write('WEBP', 8, 'latin1'); b.write('VP8X', 12, 'latin1');
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3);
  return b;
};

test('the header reader measures every format the route accepts', () => {
  assert.deepEqual(bsImageHeaderDims(png(4032, 3024)), { w: 4032, h: 3024 });
  assert.deepEqual(bsImageHeaderDims(gif(640, 480)), { w: 640, h: 480 });
  assert.deepEqual(bsImageHeaderDims(jpeg(8000, 6000)), { w: 8000, h: 6000 });
  assert.deepEqual(bsImageHeaderDims(webpVP8(1200, 1600)), { w: 1200, h: 1600 });
  assert.deepEqual(bsImageHeaderDims(webpVP8X(5000, 4000)), { w: 5000, h: 4000 });
  // It takes a Uint8Array or an ArrayBuffer — the caller hands it the latter.
  assert.deepEqual(bsImageHeaderDims(new Uint8Array(png(10, 20)).buffer), { w: 10, h: 20 });
});

test('⚠ IT WALKS THE MARKER CHAIN — a 0xFFC0 inside EXIF is not the photo size', () => {
  // The failure this pins: scanning for the SOF bytes lands inside an EXIF or
  // thumbnail payload, and the member's 48 MP photo is measured as a 160×120
  // thumbnail — which passes the pixel budget, so the decode that kills the
  // WebView proceeds with the guard reporting green.
  const exif = Buffer.alloc(600);
  exif.write('Exif\0\0', 0, 'latin1');
  exif[100] = 0xff; exif[101] = 0xc0;              // the trap
  exif.writeUInt16BE(9, 102); exif[104] = 8;
  exif.writeUInt16BE(120, 105); exif.writeUInt16BE(160, 107);
  const buf = jpeg(8000, 6000, [[0xe1, exif]]);
  assert.deepEqual(bsImageHeaderDims(buf), { w: 8000, h: 6000 });
  // And the trap really is in the bytes — otherwise this test proves nothing.
  let found = false;
  for (let i = 0; i < buf.length - 1; i += 1) if (buf[i] === 0xff && buf[i + 1] === 0xc0) { found = true; break; }
  assert.ok(found, 'the fixture must actually contain a stray 0xFFC0');
});

test('a progressive JPEG is measured, and DHT is not mistaken for a frame', () => {
  assert.deepEqual(bsImageHeaderDims(jpeg(4000, 3000, [], 0xc2)), { w: 4000, h: 3000 });
  // 0xc4 (DHT) shares SOF's marker range and must be skipped, not read.
  assert.deepEqual(bsImageHeaderDims(jpeg(4000, 3000, [[0xc4, Buffer.alloc(40)]])), { w: 4000, h: 3000 });
});

test('an unreadable header is UNKNOWN, never a guess', () => {
  assert.equal(bsImageHeaderDims(Buffer.alloc(8)), null, 'too short');
  assert.equal(bsImageHeaderDims(Buffer.from('not an image at all, really', 'latin1')), null);
  assert.equal(bsImageHeaderDims(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(200)])), null,
    'a JPEG whose chain goes out of sync must not be guessed at');
});

test('⚠ AND A DESYNCED CHAIN REFUSES RATHER THAN RESYNCING ONTO THE FIRST PLAUSIBLE FRAME', () => {
  // ⚠ MUTATION-FOUND GAP, and the fixture above is why it was needed. Turning
  // the out-of-sync bail into `i += 1; continue;` — a scan, rather than a walk —
  // SURVIVED every other assertion in this file: a well-formed chain never
  // reaches that branch, and the zero-filled fixture above finds no 0xFF to
  // resync onto, so both versions returned null for the same uninteresting
  // reason. The hazard only shows when the garbage CONTAINS something that looks
  // like a frame header, which is exactly what a corrupt file or an unusual
  // container carries.
  const junk = Buffer.alloc(80);                        // no 0xFF: the chain is lost here
  const decoy = Buffer.alloc(11);                       // ...and a thumbnail-sized SOF after it
  decoy[0] = 0xff; decoy[1] = 0xc0; decoy.writeUInt16BE(9, 2); decoy[4] = 8;
  decoy.writeUInt16BE(120, 5); decoy.writeUInt16BE(160, 7);
  const buf = Buffer.concat([Buffer.from([0xff, 0xd8]), junk, decoy, Buffer.alloc(64)]);

  // The fixture has to be able to fool a scanner, or this test proves nothing.
  let scanned = null;
  for (let i = 2; i < buf.length - 8; i += 1) {
    if (buf[i] === 0xff && buf[i + 1] === 0xc0) { scanned = { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }; break; }
  }
  assert.deepEqual(scanned, { w: 160, h: 120 }, 'the fixture must be able to fool a byte scan');

  assert.equal(bsImageHeaderDims(buf), null,
    'a lost chain is unknown — reporting 160×120 would pass the pixel budget and let the killing decode proceed');
});

// ── the guard that uses it ─────────────────────────────────────────────────

const MAX_PIXELS = Number(constOf('BS_RECIPE_PHOTO_MAX_PIXELS').replace(/_/g, ''));
const MAX_FILE = Number(constOf('BS_RECIPE_PHOTO_MAX_FILE').replace(/_/g, ''));

// Drives the REAL bsRecipePhotoDataUrl against a stubbed browser. `calls`
// records which decode path was taken, which is the whole question.
function drivePhoto({ bytes, size = 1_000_000, type = 'image/jpeg', bitmap = true, imageDecode = true }) {
  const calls = { img: 0, bitmap: 0, resize: null, closed: 0 };
  const env = {
    BS_RECIPE_PHOTO_EDGES: [1600, 1200, 900],
    BS_RECIPE_PHOTO_QUALITIES: [0.82, 0.5],
    BS_RECIPE_PHOTO_BUDGET: 640000,
    BS_RECIPE_PHOTO_MAX_FILE: MAX_FILE,
    BS_RECIPE_PHOTO_MAX_PIXELS: MAX_PIXELS,
    BS_RECIPE_PHOTO_HEADER_BYTES: 262144,
    BS_RECIPE_PHOTO_DECODE_MS: 20000,
    bsImageHeaderDims,
    setTimeout, clearTimeout,
    document: {
      createElement: () => ({
        width: 0, height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/jpeg;base64,' + 'A'.repeat(400),
      }),
    },
    FileReader: class {
      readAsDataURL() {
        calls.img += 1;
        setTimeout(() => { this.result = 'data:image/jpeg;base64,AAAA'; this.onload && this.onload(); }, 0);
      }
    },
    Image: class {
      set src(_v) {
        setTimeout(() => {
          if (!imageDecode) { this.onerror && this.onerror(); return; }
          this.width = 4000; this.height = 3000; this.onload && this.onload();
        }, 0);
      }
    },
    createImageBitmap: bitmap
      ? async (_f, opts) => { calls.bitmap += 1; calls.resize = opts;
          return { width: opts.resizeWidth, height: opts.resizeHeight, close() { calls.closed += 1; } }; }
      : undefined,
  };
  const file = {
    size, type,
    slice: () => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }),
  };
  const names = Object.keys(env);
  const fn = new Function(...names, `${lift('bsRecipePhotoDataUrl')}; return bsRecipePhotoDataUrl;`)(
    ...names.map((n) => env[n]),
  );
  return fn(file).then((url) => ({ url, calls }));
}

test('⚠ A PHOTO PAST THE PIXEL BUDGET IS DOWNSAMPLED DURING DECODE, NEVER MATERIALISED', async () => {
  // 8000×6000 = 48 MP ≈ 190 MB of RGBA, in a 6 MB file that clears every byte
  // ceiling in the module. The <img> path must not be taken.
  const { url, calls } = await drivePhoto({ bytes: jpeg(8000, 6000), size: 6_000_000 });
  assert.ok(String(url).startsWith('data:image/jpeg;base64,'), 'it still produces an image');
  assert.equal(calls.img, 0, 'the full-decode path must not run for a 48 MP source');
  assert.equal(calls.bitmap, 1, 'it must decode through the resizing decoder');
  assert.equal(calls.resize.resizeWidth, 1600, 'capped on the long edge');
  assert.equal(calls.resize.resizeHeight, 1200, 'and the aspect ratio is kept');
  assert.equal(calls.closed, 1, 'the bitmap is closed — its pixels live outside the JS heap');
});

test('an ordinary photo still takes the plain path', async () => {
  const { url, calls } = await drivePhoto({ bytes: jpeg(4032, 3024), size: 3_000_000 });   // 12 MP
  assert.ok(String(url).startsWith('data:image/jpeg;base64,'));
  assert.equal(calls.bitmap, 0, 'no need to reach for the resizing decoder under the budget');
  assert.equal(calls.img, 1);
});

test('an unmeasurable header falls back rather than refusing', async () => {
  // Refusing everything we cannot measure would refuse formats that decode fine.
  const { url, calls } = await drivePhoto({ bytes: Buffer.from('mystery', 'latin1') });
  assert.ok(String(url).startsWith('data:image/jpeg;base64,'));
  assert.equal(calls.img, 1);
});

test('⚠ WITHOUT A RESIZING DECODER A HUGE PHOTO IS REFUSED, NOT ATTEMPTED', async () => {
  // The refusal is the point: `too-big` reaches the member as "crop it to the
  // recipe and try again", which is a thing they can do. An out-of-memory kill
  // takes the whole sheet, and everything they had typed, with no message.
  const { url, calls } = await drivePhoto({ bytes: jpeg(8000, 6000), size: 6_000_000, bitmap: false });
  assert.equal(url, 'too-big');
  assert.equal(calls.img, 0, 'it must not fall back to decoding the whole bitmap');
});

test('a resizing decoder that throws is a refusal too, not a full decode', async () => {
  // Built inline rather than through drivePhoto, because this stub has to REJECT.
  const calls = { img: 0 };
  const fn = new Function(
    'BS_RECIPE_PHOTO_EDGES', 'BS_RECIPE_PHOTO_QUALITIES', 'BS_RECIPE_PHOTO_BUDGET',
    'BS_RECIPE_PHOTO_MAX_FILE', 'BS_RECIPE_PHOTO_MAX_PIXELS', 'BS_RECIPE_PHOTO_HEADER_BYTES',
    'BS_RECIPE_PHOTO_DECODE_MS', 'bsImageHeaderDims', 'setTimeout', 'clearTimeout',
    'document', 'FileReader', 'Image', 'createImageBitmap',
    `${lift('bsRecipePhotoDataUrl')}; return bsRecipePhotoDataUrl;`,
  )(
    [1600], [0.8], 640000, MAX_FILE, MAX_PIXELS, 262144, 20000, bsImageHeaderDims,
    setTimeout, clearTimeout,
    { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,AAAA' }) },
    class { readAsDataURL() { calls.img += 1; } },
    class { set src(_v) {} },
    async () => { throw new Error('decode failed'); },
  );
  const url = await fn({
    size: 6_000_000, type: 'image/jpeg',
    slice: () => ({ arrayBuffer: async () => new Uint8Array(jpeg(8000, 6000)).buffer }),
  });
  assert.equal(url, 'too-big');
  assert.equal(calls.img, 0, 'a failed resize must not become a full decode');
});

test('the compressed ceiling still refuses an enormous file outright', async () => {
  const { url } = await drivePhoto({ bytes: jpeg(1000, 1000), size: MAX_FILE + 1 });
  assert.equal(url, 'too-big');
});

test('the pixel budget is a real bound, not a rounding of the byte one', () => {
  // ⚠ The two ceilings answer different questions, and collapsing them is the
  // defect. 25 MP ≈ 100 MB decoded; the byte ceiling cannot express that.
  assert.ok(MAX_PIXELS >= 12_000_000, 'an ordinary 12 MP phone photo must not be refused');
  assert.ok(MAX_PIXELS <= 40_000_000, 'and a 48 MP one must not sail through');
});
