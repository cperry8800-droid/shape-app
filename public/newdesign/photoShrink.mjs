// ─── A PHOTO, SHRUNK BEFORE IT IS UPLOADED ─────────────────────────────────────────────────────────
// Feed photo posts and profile wall and cover photos went up to the public `community-photos` bucket
// as the phone took them (several MB), and everyone who scrolled past one downloaded that original.
// Shrunk here to a 1600 px long edge as a JPEG, the same photo is a fraction of the size: the feed
// loads faster and the data Shape pays to serve falls (hosting review, 2026-11-13: about $2,200 a
// month by 2031 on the goal plan). Re-encoding also drops the photo's EXIF, including where it was
// taken.
//
// ⚠ IT NEVER LOSES AN UPLOAD. Anything it cannot do hands back the ORIGINAL file, and the upload
// goes ahead exactly as it did before this existed: a format it cannot measure (HEIC, a truncated
// file), an animated GIF, a photo already small enough, a browser with no canvas or no toBlob, a
// decode that never settles, or a result no smaller than the original. It never throws.
//
// ⚠ THE PIXELS ARE MEASURED BEFORE ANYTHING IS DECODED, by the header reader the recipe-photo import
// already uses (moved here from mobile-app/src/services/shapeBackend.js so both read one copy; its
// tests stay in tests/recipe-photo-decode.test.mjs). A 48 MP photo decodes to ~190 MB of RGBA, which
// kills a mid-range Android WebView, so past 25 MP the photo is only ever decoded through
// createImageBitmap's resize options, which downsample during the decode.
//
// The app (shapeBackend.js uploadCommunityPhoto, re-exported as mobile-app/src/services/photoShrink.mjs)
// and the website (communityFeed.jsx, livingDesktop.jsx, by dynamic import) both call
// shrinkPhotoForUpload; tests/photo-shrink.test.mjs drives it against a stubbed browser.

export const PHOTO_EDGE = 1600;              // the long edge a shrunk photo is drawn at, at most
export const PHOTO_QUALITY = 0.82;           // JPEG quality, as the avatar and recipe paths use
export const PHOTO_MAX_PIXELS = 25_000_000;  // past this, decode only with downsampling
export const PHOTO_HEADER_BYTES = 2 * 1024 * 1024;  // enough to reach a JPEG's frame past its EXIF
export const PHOTO_DECODE_MS = 20_000;       // a decode that never settles gives the original back

// Width and height out of an image's HEADER — no decode, no bitmap, no canvas.
// Returns null when the format is not JPEG, PNG, GIF or WebP (the four the recipe
// route accepts; HEIC is not read) or the header is truncated; the caller treats null as "unknown" rather than as a
// refusal, because a format we cannot measure is not the same as one we know is
// too large.
export function imageHeaderDims(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const be16 = (i) => (b[i] << 8) | b[i + 1];
  const be32 = (i) => (((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0);
  const le32 = (i) => ((b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0);
  // PNG — 8-byte signature, then IHDR's width/height at 16/20.
  // ⚠ THE CHUNK TYPE IS CHECKED, NOT ASSUMED. The spec requires IHDR first, but
  // this function now decides whether an image is decoded at all, so a file that
  // merely starts with the PNG signature must not be able to hand back whatever
  // happens to sit at those offsets — a fabricated small size is a full decode of
  // something arbitrarily large.
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) {
    return { w: be32(16), h: be32(20) };
  }
  // GIF — little-endian logical screen size at 6/8.
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  }
  // JPEG — walk the marker chain to a start-of-frame. ⚠ The chain must be
  // walked rather than scanned for 0xFFC0: those two bytes occur constantly
  // inside EXIF and thumbnail payloads, and a scan lands on one of them and
  // reports a thumbnail's size as the photo's.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;            // out of sync: refuse to guess
      const m = b[i + 1];
      if (m === 0xff) { i += 1; continue; }      // fill byte
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }  // standalone
      if (m === 0xda) return null;               // scan data: no SOF before it
      const len = be16(i + 2);
      if (len < 2) return null;
      // SOF0-SOF15, excluding DHT (c4), DAC (c8) and DNL (cc), which share the range.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        // ⚠ THE SEGMENT MUST BE BIG ENOUGH TO CONTAIN WHAT WE ARE ABOUT TO READ.
        // A frame header is length(2) + precision(1) + height(2) + width(2) +
        // components(1) = 8 bytes minimum, and without that check a hostile file
        // can declare a two-byte SOF while planting small values at the offsets
        // below — dimensions that are not inside the segment at all. They would
        // pass the pixel budget and send the file to the full decode, where a
        // permissive decoder skips the bogus frame, finds the real one, and
        // recreates exactly the unbounded decode this whole guard exists to stop.
        // The declared segment must also fit in the buffer, so a truncated file
        // cannot have its tail read as a dimension.
        if (len < 8 || i + 2 + len > b.length) return null;
        return { h: be16(i + 5), w: be16(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  // WebP — RIFF container, three body formats, each with its own size encoding.
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const fmt = String.fromCharCode(b[12], b[13], b[14], b[15]);
    // ⚠ The lossy branch checks VP8's 3-byte sync code (9d 01 2a) before reading
    // the size after it — same reason as PNG's IHDR: without it a truncated or
    // hostile RIFF hands back two arbitrary bytes as a dimension.
    if (fmt === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    }
    if (fmt === 'VP8L') { const n = le32(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
    if (fmt === 'VP8X') {
      return { w: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, h: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1 };
    }
  }
  return null;
}

// The size a photo is drawn at: its long edge brought down to `edge`, never up, the aspect ratio
// kept. null for a size that is not a real one.
export function photoTarget(w, h, edge = PHOTO_EDGE) {
  if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) return null;
  const scale = Math.min(1, edge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

// The name a shrunk photo goes up under: its own, ending .jpg.
export function jpegName(name) {
  const base = String(name || '').replace(/\.[^./\\]*$/, '');
  return `${base || 'photo'}.jpg`;
}

// Resolves the file to upload: a smaller JPEG when one can be made, otherwise `file` itself.
// `env` is the browser (globalThis); the tests hand in a stub. `deadlineMs` is for the tests too.
export function shrinkPhotoForUpload(file, env = globalThis, { deadlineMs = PHOTO_DECODE_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let bitmap = null;
    let objectUrl = null;
    // An ImageBitmap holds its pixels outside the JS heap until it is closed, and an object URL
    // keeps the whole file alive until it is revoked: every way out releases both.
    const release = () => {
      if (bitmap && typeof bitmap.close === 'function') { try { bitmap.close(); } catch (e) {} }
      bitmap = null;
      if (objectUrl && env.URL && typeof env.URL.revokeObjectURL === 'function') {
        try { env.URL.revokeObjectURL(objectUrl); } catch (e) {}
      }
      objectUrl = null;
    };
    const done = (out) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      release();
      resolve(out || file);
    };
    const timer = setTimeout(() => done(file), deadlineMs);

    // A bitmap that lands after the deadline belongs to nobody: close it rather than keep it.
    const keep = (b) => {
      if (settled) { if (b && typeof b.close === 'function') { try { b.close(); } catch (e) {} } return false; }
      bitmap = b;
      return true;
    };

    const viaImage = () => new Promise((ok, fail) => {
      if (typeof env.Image !== 'function' || !env.URL || typeof env.URL.createObjectURL !== 'function') { fail(new Error('no image')); return; }
      const img = new env.Image();
      img.onload = () => ok(img);
      img.onerror = () => fail(new Error('decode'));
      objectUrl = env.URL.createObjectURL(file);
      img.src = objectUrl;
    });

    (async () => {
      try {
        const type = String((file && file.type) || '').toLowerCase();
        // Not an image, or a GIF that may be animated: as it is.
        if (!file || !type.startsWith('image/') || type === 'image/gif') { done(file); return; }
        if (typeof file.slice !== 'function') { done(file); return; }

        const dims = imageHeaderDims(await file.slice(0, PHOTO_HEADER_BYTES).arrayBuffer());
        if (settled) return;
        if (!dims || !(dims.w > 0 && dims.h > 0)) { done(file); return; }
        const target = photoTarget(dims.w, dims.h);
        // Already no bigger than the edge: re-encoding would only cost quality.
        if (!target || (target.w === dims.w && target.h === dims.h)) { done(file); return; }

        let src = null;
        if (dims.w * dims.h > PHOTO_MAX_PIXELS) {
          // The full bitmap must never exist: downsample during the decode, both axes named.
          if (typeof env.createImageBitmap !== 'function') { done(file); return; }
          const b = await env.createImageBitmap(file, { resizeWidth: target.w, resizeHeight: target.h, resizeQuality: 'high' });
          if (!keep(b)) return;
          src = b;
        } else if (typeof env.createImageBitmap === 'function') {
          const b = await env.createImageBitmap(file);
          if (!keep(b)) return;
          src = b;
        } else {
          src = await viaImage();
          if (settled) return;
        }

        const doc = env.document;
        const canvas = doc && typeof doc.createElement === 'function' ? doc.createElement('canvas') : null;
        const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (!ctx || typeof canvas.toBlob !== 'function') { done(file); return; }
        canvas.width = target.w;
        canvas.height = target.h;
        // JPEG has no transparency: a transparent PNG or WebP would come out black where it was clear.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, target.w, target.h);
        ctx.drawImage(src, 0, 0, target.w, target.h);
        release();
        canvas.toBlob((blob) => {
          // No smaller than what was picked: the original is the better upload.
          if (!blob || !(blob.size > 0) || blob.size >= file.size) { done(file); return; }
          let out = blob;
          if (typeof env.File === 'function') {
            try { out = new env.File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified || Date.now() }); } catch (e) { out = blob; }
          }
          done(out);
        }, 'image/jpeg', PHOTO_QUALITY);
      } catch (e) {
        done(file);
      }
    })();
  });
}
