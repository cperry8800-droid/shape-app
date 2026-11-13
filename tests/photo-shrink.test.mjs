// Photos are shrunk before they go up to `community-photos` (public/newdesign/photoShrink.mjs), and
// the shrink never costs the member their upload. Driven against a stubbed browser: the question each
// test asks is which decode path ran, what was drawn, and what went up.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shrinkPhotoForUpload, photoTarget, jpegName, imageHeaderDims,
  PHOTO_EDGE, PHOTO_QUALITY, PHOTO_MAX_PIXELS,
} from '../public/newdesign/photoShrink.mjs';
import * as appModule from '../mobile-app/src/services/photoShrink.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A JPEG header with its frame at w×h (the same shape tests/recipe-photo-decode.test.mjs builds).
const jpegBytes = (w, h) => {
  const f = Buffer.alloc(11);
  f[0] = 0xff; f[1] = 0xc0; f.writeUInt16BE(9, 2); f[4] = 8;
  f.writeUInt16BE(h, 5); f.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), f, Buffer.alloc(64)]);
};
const pngBytes = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};

const photo = ({ w = 4032, h = 3024, type = 'image/jpeg', size = 3_000_000, name = 'IMG_0412.JPG', bytes } = {}) => {
  const buf = bytes || (type === 'image/png' ? pngBytes(w, h) : jpegBytes(w, h));
  return { name, type, size, lastModified: 1_700_000_000_000, slice: () => ({ arrayBuffer: async () => new Uint8Array(buf).buffer }) };
};

// A stub browser. Every option turns one capability off or changes what it returns.
function browser({ bitmap = true, image = true, ctx = true, toBlob = true, blobSize = 250_000, file = true, bitmapDelayMs = 0, bitmapThrows = false } = {}) {
  const calls = { bitmap: [], image: 0, drawn: null, order: [], toBlob: null, closed: 0, created: 0, revoked: 0 };
  const env = {
    createImageBitmap: bitmap ? (f, opts) => new Promise((ok, fail) => {
      calls.bitmap.push(opts || null);
      setTimeout(() => {
        if (bitmapThrows) { fail(new Error('decode')); return; }
        ok({ width: opts ? opts.resizeWidth : 4032, height: opts ? opts.resizeHeight : 3024, close() { calls.closed += 1; } });
      }, bitmapDelayMs);
    }) : undefined,
    Image: image ? class { set src(_v) { calls.image += 1; setTimeout(() => this.onload && this.onload(), 0); } } : undefined,
    URL: { createObjectURL: () => { calls.created += 1; return 'blob:photo'; }, revokeObjectURL: () => { calls.revoked += 1; } },
    document: {
      createElement: (tag) => {
        assert.equal(tag, 'canvas');
        return {
          width: 0, height: 0,
          getContext: () => (ctx ? {
            set fillStyle(v) { calls.order.push(`fill:${v}`); },
            fillRect() { calls.order.push('fillRect'); },
            drawImage(_src, x, y, w, h) { calls.order.push('draw'); calls.drawn = { x, y, w, h }; },
          } : null),
          toBlob: toBlob ? (cb, type, q) => { calls.toBlob = { type, q }; setTimeout(() => cb(blobSize == null ? null : { size: blobSize, type }), 0); } : undefined,
        };
      },
    },
    File: file ? class { constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = opts.type; this.size = parts[0].size; this.lastModified = opts.lastModified; } } : undefined,
  };
  return { env, calls };
}

// ── the size it draws at ─────────────────────────────────────────────────────────────────────────

test('the long edge comes down to 1600, the aspect ratio is kept, and nothing is ever enlarged', () => {
  assert.equal(PHOTO_EDGE, 1600);
  assert.deepEqual(photoTarget(4032, 3024), { w: 1600, h: 1200 });
  assert.deepEqual(photoTarget(3024, 4032), { w: 1200, h: 1600 });
  assert.deepEqual(photoTarget(8000, 6000), { w: 1600, h: 1200 });
  assert.deepEqual(photoTarget(1200, 800), { w: 1200, h: 800 }, 'smaller than the edge stays as it is');
  assert.deepEqual(photoTarget(1600, 1600), { w: 1600, h: 1600 });
  assert.deepEqual(photoTarget(20000, 5), { w: 1600, h: 1 }, 'a sliver keeps at least one pixel (5 × 0.08 rounds to 0)');
  for (const bad of [[0, 10], [10, 0], [NaN, 10], [10, Infinity], [-5, 10]]) assert.equal(photoTarget(...bad), null, String(bad));
});

test('a shrunk photo keeps its name and ends .jpg', () => {
  assert.equal(jpegName('IMG_0412.HEIC'), 'IMG_0412.jpg');
  assert.equal(jpegName('beach.day.png'), 'beach.day.jpg');
  assert.equal(jpegName('no-extension'), 'no-extension.jpg');
  assert.equal(jpegName('.png'), 'photo.jpg');
  assert.equal(jpegName(undefined), 'photo.jpg');
});

// ── what goes up ────────────────────────────────────────────────────────────────────────────────

test('a 12 MP phone photo goes up as a 1600×1200 JPEG under its own name', async () => {
  const { env, calls } = browser();
  const file = photo();
  const out = await shrinkPhotoForUpload(file, env);
  assert.notEqual(out, file);
  assert.equal(out.name, 'IMG_0412.jpg');
  assert.equal(out.type, 'image/jpeg');
  assert.equal(out.size, 250_000);
  assert.equal(out.lastModified, file.lastModified);
  assert.deepEqual(calls.drawn, { x: 0, y: 0, w: 1600, h: 1200 });
  assert.deepEqual(calls.toBlob, { type: 'image/jpeg', q: PHOTO_QUALITY });
  // Under the pixel budget it is decoded whole, then drawn smaller, and the bitmap is released.
  assert.deepEqual(calls.bitmap, [null]);
  assert.equal(calls.closed, 1);
  assert.equal(calls.image, 0);
});

test('⚠ JPEG has no transparency, so the canvas is filled white BEFORE the photo is drawn', async () => {
  const { env, calls } = browser();
  await shrinkPhotoForUpload(photo({ type: 'image/png' }), env);
  assert.deepEqual(calls.order, ['fill:#fff', 'fillRect', 'draw']);
});

test('⚠ A PHOTO PAST 25 MP IS DOWNSAMPLED DURING THE DECODE, BOTH AXES NAMED', async () => {
  const { env, calls } = browser();
  const out = await shrinkPhotoForUpload(photo({ w: 8000, h: 6000, size: 9_000_000 }), env);
  assert.ok(8000 * 6000 > PHOTO_MAX_PIXELS);
  assert.deepEqual(calls.bitmap, [{ resizeWidth: 1600, resizeHeight: 1200, resizeQuality: 'high' }]);
  assert.equal(calls.image, 0, 'the full-size decode must never run');
  assert.equal(calls.closed, 1);
  assert.equal(out.type, 'image/jpeg');
});

test('past 25 MP with no resizing decoder, the original goes up rather than a full decode', async () => {
  const { env, calls } = browser({ bitmap: false });
  const file = photo({ w: 8000, h: 6000 });
  assert.equal(await shrinkPhotoForUpload(file, env), file);
  assert.equal(calls.image, 0);
  assert.equal(calls.drawn, null);
});

test('with no createImageBitmap, a photo under the budget is decoded through an <img>, and its URL released', async () => {
  const { env, calls } = browser({ bitmap: false });
  const out = await shrinkPhotoForUpload(photo(), env);
  assert.equal(calls.image, 1);
  assert.equal(calls.created, 1);
  assert.equal(calls.revoked, 1);
  assert.equal(out.type, 'image/jpeg');
});

// ── ⚠ it never loses an upload ──────────────────────────────────────────────────────────────────

test('what it should not touch goes up exactly as picked', async () => {
  for (const [why, file] of [
    ['not an image', photo({ type: 'application/pdf' })],
    ['a GIF, which may be animated', photo({ type: 'image/gif' })],
    ['a HEIC it cannot measure', photo({ type: 'image/heic', bytes: Buffer.from('....ftypheic........') })],
    ['a truncated JPEG', photo({ bytes: Buffer.from([0xff, 0xd8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) })],
    ['already no bigger than the edge', photo({ w: 1200, h: 900 })],
  ]) {
    const { env, calls } = browser();
    assert.equal(await shrinkPhotoForUpload(file, env), file, why);
    assert.equal(calls.bitmap.length + calls.image, 0, `${why}: nothing decoded`);
  }
  const { env } = browser();
  assert.equal(await shrinkPhotoForUpload(null, env), null);
});

test('a result no smaller than the original, or no result, sends the original', async () => {
  const file = photo({ size: 200_000 });
  for (const opts of [{ blobSize: 200_000 }, { blobSize: 900_000 }, { blobSize: null }, { blobSize: 0 }]) {
    const { env } = browser(opts);
    assert.equal(await shrinkPhotoForUpload(file, env), file, JSON.stringify(opts));
  }
});

test('a browser without a 2D canvas or toBlob sends the original', async () => {
  for (const opts of [{ ctx: false }, { toBlob: false }]) {
    const { env, calls } = browser(opts);
    const file = photo();
    assert.equal(await shrinkPhotoForUpload(file, env), file, JSON.stringify(opts));
    assert.equal(calls.closed, 1, 'the decoded bitmap is still released');
  }
});

test('a decoder that fails sends the original', async () => {
  const { env } = browser({ bitmapThrows: true });
  const file = photo();
  assert.equal(await shrinkPhotoForUpload(file, env), file);
});

test('⚠ A DECODE THAT NEVER SETTLES SENDS THE ORIGINAL, AND A BITMAP LANDING LATE IS CLOSED', async () => {
  const { env, calls } = browser({ bitmapDelayMs: 60 });
  const file = photo();
  const out = await shrinkPhotoForUpload(file, env, { deadlineMs: 10 });
  assert.equal(out, file);
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(calls.closed, 1, 'the late bitmap was released, not leaked');
  assert.equal(calls.drawn, null, 'nothing was drawn after the deadline');
});

test('without a File constructor the JPEG blob itself goes up', async () => {
  const { env } = browser({ file: false });
  const out = await shrinkPhotoForUpload(photo(), env);
  assert.equal(out.type, 'image/jpeg');
  assert.equal(out.size, 250_000);
});

// ── every upload to the bucket goes through it ──────────────────────────────────────────────────

test('the app re-exports the website module unchanged, header reader included', () => {
  assert.equal(appModule.shrinkPhotoForUpload, shrinkPhotoForUpload);
  assert.equal(appModule.imageHeaderDims, imageHeaderDims);
});

test('⚠ NO UPLOAD TO community-photos SENDS THE PHOTO AS PICKED', () => {
  const files = [
    ['mobile-app/src/services/shapeBackend.js', 'shrinkPhotoForUpload'],
    ['public/newdesign/communityFeed.jsx', 'cfShrinkPhoto'],
    ['public/newdesign/livingDesktop.jsx', 'dkShrinkPhoto'],
  ];
  let uploads = 0;
  for (const [rel, shrink] of files) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const re = /\.from\((["'])community-photos\1\)\.upload\(\s*\w+\s*,\s*(\w+)/g;
    let m;
    while ((m = re.exec(src))) {
      uploads += 1;
      assert.equal(m[2], 'photo', `${rel}: an upload sends \`${m[2]}\`, not the shrunk photo`);
      const before = src.slice(Math.max(0, m.index - 900), m.index);
      assert.match(before, new RegExp(`const photo = await ${shrink}\\(file\\);`), `${rel}: the upload is not preceded by ${shrink}(file)`);
    }
  }
  assert.equal(uploads, 4, 'the app feed/cover upload, the website feed upload, and the website wall and cover uploads');
});

test('the website helpers load the module that exists, and fall back to the photo as picked', () => {
  assert.ok(existsSync(join(ROOT, 'public/newdesign/photoShrink.mjs')));
  for (const [rel, name] of [['public/newdesign/communityFeed.jsx', 'cfShrinkPhoto'], ['public/newdesign/livingDesktop.jsx', 'dkShrinkPhoto']]) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const at = src.indexOf(`function ${name}(file) {`);
    assert.notEqual(at, -1, `${rel}: no ${name}`);
    const body = src.slice(at, src.indexOf('\n}', at));
    assert.match(body, /import\("\/newdesign\/photoShrink\.mjs"\)/);
    assert.match(body, /\.catch\(\(\) => file\)/, `${rel}: a module that fails to load must not fail the upload`);
  }
});
