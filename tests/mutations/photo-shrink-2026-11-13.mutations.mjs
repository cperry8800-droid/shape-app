// Mutation spec for shrinking photos before they upload to community-photos (2026-11-13):
// public/newdesign/photoShrink.mjs and the four uploads that call it. Every mutation must be killed.
//   node scripts/mutate.mjs --spec tests/mutations/photo-shrink-2026-11-13.mutations.mjs --fail-on-skipped
const MOD = 'public/newdesign/photoShrink.mjs';
const APP = 'mobile-app/src/services/shapeBackend.js';
const FEED = 'public/newdesign/communityFeed.jsx';
const DESK = 'public/newdesign/livingDesktop.jsx';

export default {
  test: 'node --test tests/photo-shrink.test.mjs tests/recipe-photo-decode.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    // ── the size it draws at, and the name ──
    { name: 'a small photo is enlarged to the edge', file: MOD, find: '  const scale = Math.min(1, edge / Math.max(w, h));', replace: '  const scale = edge / Math.max(w, h);' },
    { name: 'a sliver rounds to no pixels', file: MOD, find: 'h: Math.max(1, Math.round(h * scale)) };', replace: 'h: Math.round(h * scale) };' },
    { name: 'a name with nothing before the extension goes up as ".jpg"', file: MOD, find: "  return `${base || 'photo'}.jpg`;", replace: '  return `${base}.jpg`;' },

    // ── what it leaves alone ──
    { name: 'a GIF is re-encoded and loses its animation', file: MOD, find: " || type === 'image/gif'", replace: '' },
    { name: 'a photo already within the edge is re-encoded', file: MOD, find: '  if (!target || (target.w === dims.w && target.h === dims.h)) { done(file); return; }', replace: '  if (!target) { done(file); return; }' },

    // ── the decode bound ──
    { name: 'a photo past 25 MP is decoded in full', file: MOD, find: '        if (dims.w * dims.h > PHOTO_MAX_PIXELS) {', replace: '        if (false) {' },
    { name: 'the downsampling decode names one axis only', file: MOD, find: "{ resizeWidth: target.w, resizeHeight: target.h, resizeQuality: 'high', imageOrientation: 'from-image' }", replace: "{ resizeWidth: target.w, resizeQuality: 'high', imageOrientation: 'from-image' }" },
    { name: 'a turned photo past 25 MP is resized as if upright', file: MOD, find: '          if (jpegOrientation(head) !== 1) { done(file); return; }', replace: '' },
    { name: 'the decode ignores the EXIF orientation', file: MOD, find: "          const b = await env.createImageBitmap(file, { imageOrientation: 'from-image' });", replace: '          const b = await env.createImageBitmap(file);' },
    { name: "the photo is drawn at the header's shape", file: MOD, find: '        const drawn = photoTarget(src.naturalWidth || src.width, src.naturalHeight || src.height);', replace: '        const drawn = target;' },
    { name: 'image data before any frame reads as upright', file: MOD, find: '    if (m === 0xda) return null;              // image data before any frame: not a photo this can read', replace: '    if (m === 0xda) return 1;' },
    { name: 'a frame before any EXIF reads as unknown', file: MOD, find: '    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return 1;', replace: '    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return null;' },
    { name: 'little-endian EXIF is read big-endian', file: MOD, find: '  const le = b[t] === 0x49 && b[t + 1] === 0x49;', replace: '  const le = false;' },
    { name: 'an orientation past 8 is believed', file: MOD, find: ' return v >= 1 && v <= 8 ? v : null; }', replace: ' return v; }' },
    { name: 'a decode that never settles holds the upload', file: MOD, find: '    const timer = setTimeout(() => done(file), deadlineMs);', replace: '    const timer = setTimeout(() => {}, deadlineMs);' },
    { name: 'a bitmap landing after the deadline is kept', file: MOD, find: "      if (settled) { if (b && typeof b.close === 'function') { try { b.close(); } catch (e) {} } return false; }", replace: '      if (settled) { return false; }' },
    { name: 'the decoded bitmap is never released', file: MOD, find: "      if (bitmap && typeof bitmap.close === 'function') { try { bitmap.close(); } catch (e) {} }", replace: '' },
    { name: "the <img> path's object URL is never revoked", file: MOD, find: '        try { env.URL.revokeObjectURL(objectUrl); } catch (e) {}', replace: '' },

    // ── what it encodes ──
    { name: 'no white ground under a transparent photo', file: MOD, find: '        ctx.fillRect(0, 0, drawn.w, drawn.h);', replace: '' },
    { name: 'the photo is encoded as PNG', file: MOD, find: "        }, 'image/jpeg', PHOTO_QUALITY);", replace: "        }, 'image/png', PHOTO_QUALITY);" },
    { name: 'a result as large as the original goes up', file: MOD, find: '!(blob.size > 0) || blob.size >= file.size', replace: '!(blob.size > 0) || blob.size > file.size' },
    { name: 'an empty result goes up', file: MOD, find: '!blob || !(blob.size > 0) || blob.size >= file.size', replace: '!blob || blob.size >= file.size' },

    // ── every upload sends the shrunk photo ──
    { name: 'the app uploads the photo as picked', file: APP, find: "supabase.storage.from('community-photos').upload(path, photo, { contentType: photo.type", replace: "supabase.storage.from('community-photos').upload(path, file, { contentType: photo.type" },
    { name: 'the website feed uploads the photo as picked', file: FEED, find: 'client.storage.from("community-photos").upload(path, photo, {', replace: 'client.storage.from("community-photos").upload(path, file, {' },
    { name: 'the website wall uploads the photo as picked', file: DESK, find: 'const up = await cl.storage.from("community-photos").upload(path, photo, { upsert: true, contentType: photo.type });\n      if (up.error) throw up.error;\n      const { data: pub } = cl.storage.from("community-photos").getPublicUrl(path);\n      setWall(', replace: 'const up = await cl.storage.from("community-photos").upload(path, file, { upsert: true, contentType: photo.type });\n      if (up.error) throw up.error;\n      const { data: pub } = cl.storage.from("community-photos").getPublicUrl(path);\n      setWall(' },
    { name: 'the website cover uploads the photo as picked', file: DESK, find: 'const up = await cl.storage.from("community-photos").upload(path, photo, { upsert: true, contentType: photo.type });\n      if (up.error) throw up.error;\n      const { data: pub } = cl.storage.from("community-photos").getPublicUrl(path);\n      setCoverUrl(', replace: 'const up = await cl.storage.from("community-photos").upload(path, file, { upsert: true, contentType: photo.type });\n      if (up.error) throw up.error;\n      const { data: pub } = cl.storage.from("community-photos").getPublicUrl(path);\n      setCoverUrl(' },
    { name: "the feed's module failing to load fails the post", file: FEED, find: 'm.shrinkPhotoForUpload(file)).catch(() => file);', replace: 'm.shrinkPhotoForUpload(file));' },
    { name: "the profile's module failing to load fails the upload", file: DESK, find: 'm.shrinkPhotoForUpload(file)).catch(() => file);', replace: 'm.shrinkPhotoForUpload(file));' },
  ],
};
