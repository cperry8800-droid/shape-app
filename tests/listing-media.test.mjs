import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_SUPABASE_HOST, BS_LISTING_GALLERY_MAX, BS_LISTING_CAPTION_MAX,
  bsSafeMediaUrl, bsOwnMediaUrl, bsNormalizeListingMedia,
} from '../mobile-app/src/services/listingMedia.mjs';

// A real coach's own owner uid + the bucket every listing photo lives in.
const UID = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const BUCKET = 'coach-media';
const ORIGIN = `https://${BS_SUPABASE_HOST}`;
// The exact shape supabase getPublicUrl produces for an own-folder upload.
const own = (uid, rest) => `${ORIGIN}/storage/v1/object/public/${BUCKET}/${uid}/${rest}`;
const OK = own(UID, 'listing/1753000000-ab12.jpg');

test('constants are the spec values', () => {
  assert.equal(BS_LISTING_GALLERY_MAX, 6);
  assert.equal(BS_LISTING_CAPTION_MAX, 80);
  assert.equal(typeof BS_SUPABASE_HOST, 'string');
  assert.ok(BS_SUPABASE_HOST.length > 0);
});

test('bsSafeMediaUrl: the loose gate — http(s) + hostname + length, never throws', () => {
  assert.equal(bsSafeMediaUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(bsSafeMediaUrl('http://example.com/a.png'), 'http://example.com/a.png');
  // host-less / malformed — a ^https?:// prefix regex would WRONGLY accept these
  assert.equal(bsSafeMediaUrl('https://'), null);
  assert.equal(bsSafeMediaUrl('https://  '), null);
  assert.equal(bsSafeMediaUrl('javascript:alert(1)'), null);
  assert.equal(bsSafeMediaUrl('data:image/png;base64,AAAA'), null);
  assert.equal(bsSafeMediaUrl('not a url'), null);
  assert.equal(bsSafeMediaUrl(''), null);
  assert.equal(bsSafeMediaUrl('   '), null);
  assert.equal(bsSafeMediaUrl('https://h/' + 'x'.repeat(600)), null); // > 500
  // non-string junk → null, no throw
  for (const junk of [null, undefined, 42, {}, [], Symbol('x'), true, NaN]) {
    assert.equal(bsSafeMediaUrl(junk), null);
  }
});

test('bsOwnMediaUrl: accepts a well-formed own-folder image URL', () => {
  assert.equal(bsOwnMediaUrl(OK, BUCKET, UID), OK);
  assert.equal(bsOwnMediaUrl(own(UID, 'listing/x.jpeg'), BUCKET, UID), own(UID, 'listing/x.jpeg'));
  assert.equal(bsOwnMediaUrl(own(UID, 'x.png'), BUCKET, UID), own(UID, 'x.png'));
  assert.equal(bsOwnMediaUrl(own(UID, 'a/b/c.webp'), BUCKET, UID), own(UID, 'a/b/c.webp'));
  assert.equal(bsOwnMediaUrl(own(UID, 'p.heic'), BUCKET, UID), own(UID, 'p.heic'));
});

test('bsOwnMediaUrl: rejects the whole SSRF / hotlink / cross-type attack surface', () => {
  // AC 5 vectors
  assert.equal(bsOwnMediaUrl('javascript:alert(1)', BUCKET, UID), null);
  assert.equal(bsOwnMediaUrl('https://evil.example/pixel.png', BUCKET, UID), null); // wrong host
  assert.equal(bsOwnMediaUrl('http://127.0.0.1:9000/x.png', BUCKET, UID), null);    // wrong host + port
  assert.equal(bsOwnMediaUrl(own(OTHER, 'listing/x.png'), BUCKET, UID), null);      // another coach's folder
  // wrong host but same path shape (attacker-hosted supabase project)
  assert.equal(bsOwnMediaUrl(`https://attacker.supabase.co/storage/v1/object/public/${BUCKET}/${UID}/x.png`, BUCKET, UID), null);
  // http on our own host — public objects are https only
  assert.equal(bsOwnMediaUrl(OK.replace('https://', 'http://'), BUCKET, UID), null);
  // userinfo smuggling the host
  assert.equal(bsOwnMediaUrl(`https://${BS_SUPABASE_HOST}@evil.example/x.png`, BUCKET, UID), null);
  assert.equal(bsOwnMediaUrl(`https://user:pw@${BS_SUPABASE_HOST}/storage/v1/object/public/${BUCKET}/${UID}/x.png`, BUCKET, UID), null);
  // explicit port on our host
  assert.equal(bsOwnMediaUrl(`https://${BS_SUPABASE_HOST}:8443/storage/v1/object/public/${BUCKET}/${UID}/x.png`, BUCKET, UID), null);
  // non-image extension (video/svg/none) — the bucket allows video for plan clips
  assert.equal(bsOwnMediaUrl(own(UID, 'clip.mp4'), BUCKET, UID), null);
  assert.equal(bsOwnMediaUrl(own(UID, 'x.svg'), BUCKET, UID), null);
  assert.equal(bsOwnMediaUrl(own(UID, 'x'), BUCKET, UID), null);
  // wrong bucket
  assert.equal(bsOwnMediaUrl(`${ORIGIN}/storage/v1/object/public/other-bucket/${UID}/x.png`, BUCKET, UID), null);
  // path traversal cannot forge the owner prefix (URL normalizes .. before our check)
  assert.equal(bsOwnMediaUrl(own(UID, `../../${OTHER}/x.png`), BUCKET, UID), null);
  // CSS url() breakout chars that new URL() leaves raw (' ( )) are rejected
  assert.equal(bsOwnMediaUrl(own(UID, "a').png"), BUCKET, UID), null);
  assert.equal(bsOwnMediaUrl(own(UID, 'a(1).png'), BUCKET, UID), null);
});

test('bsOwnMediaUrl: fails closed on missing bucket / ownerUid / junk', () => {
  assert.equal(bsOwnMediaUrl(OK, BUCKET, ''), null);
  assert.equal(bsOwnMediaUrl(OK, BUCKET, null), null);
  assert.equal(bsOwnMediaUrl(OK, BUCKET, undefined), null);
  assert.equal(bsOwnMediaUrl(OK, '', UID), null);
  assert.equal(bsOwnMediaUrl(OK, null, UID), null);
  for (const junk of [null, undefined, 42, {}, [], Symbol('x')]) {
    assert.equal(bsOwnMediaUrl(junk, BUCKET, UID), null);
  }
});

test('bsNormalizeListingMedia: a full clean doc passes through', () => {
  const raw = {
    portrait: own(UID, 'listing/face.jpg'),
    cover: own(UID, 'listing/gym.png'),
    gallery: [
      { url: own(UID, 'listing/1.jpg'), caption: 'The floor' },
      { url: own(UID, 'listing/2.webp'), caption: 'The rack' },
    ],
    updatedAt: '2026-07-23T10:31:00.000Z',
  };
  const out = bsNormalizeListingMedia(raw, UID);
  assert.equal(out.portrait, raw.portrait);
  assert.equal(out.cover, raw.cover);
  assert.deepEqual(out.gallery, [
    { url: own(UID, 'listing/1.jpg'), caption: 'The floor' },
    { url: own(UID, 'listing/2.webp'), caption: 'The rack' },
  ]);
  assert.equal(out.updatedAt, '2026-07-23T10:31:00.000Z');
});

test('bsNormalizeListingMedia: drops each invalid URL and keeps resolution honest', () => {
  const raw = {
    portrait: 'javascript:alert(1)',
    cover: 'https://evil.example/x.png',
    gallery: [
      { url: own(OTHER, 'x.png'), caption: 'stolen' },     // another coach's folder → drop
      { url: own(UID, 'ok.jpg'), caption: 'mine' },        // keep
      { url: 'not a url', caption: 'junk' },               // drop
      { caption: 'no url at all' },                        // drop
    ],
  };
  const out = bsNormalizeListingMedia(raw, UID);
  assert.equal(out.portrait, null);
  assert.equal(out.cover, null);
  assert.deepEqual(out.gallery, [{ url: own(UID, 'ok.jpg'), caption: 'mine' }]);
});

test('bsNormalizeListingMedia: gallery clamps to 6, field-by-field rebuild, caption clamp + control strip', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({
    url: own(UID, `g${i}.jpg`),
    caption: 'c'.repeat(200),
    evil: 'should not ride through', // extra key must be stripped by the rebuild
  }));
  const out = bsNormalizeListingMedia({ gallery: many }, UID);
  assert.equal(out.gallery.length, BS_LISTING_GALLERY_MAX);
  for (const g of out.gallery) {
    assert.deepEqual(Object.keys(g).sort(), ['caption', 'url']); // no extra keys
    assert.equal(g.caption.length, BS_LISTING_CAPTION_MAX);       // clamped to 80
  }
  // control chars (newlines/tabs/NUL) stripped; non-string caption → ''
  const out2 = bsNormalizeListingMedia({
    gallery: [
      { url: own(UID, 'a.jpg'), caption: 'x\ny\tz' },
      { url: own(UID, 'b.jpg'), caption: 42 },
      { url: own(UID, 'c.jpg') },
    ],
  }, UID);
  assert.equal(out2.gallery[0].caption, 'xyz');
  assert.equal(out2.gallery[1].caption, '');
  assert.equal(out2.gallery[2].caption, '');
});

test('bsNormalizeListingMedia: updatedAt only passes a valid ISO string', () => {
  assert.equal(bsNormalizeListingMedia({ updatedAt: '2026-07-23T10:31:00.000Z' }, UID).updatedAt, '2026-07-23T10:31:00.000Z');
  assert.equal(bsNormalizeListingMedia({ updatedAt: 'yesterday' }, UID).updatedAt, null);
  assert.equal(bsNormalizeListingMedia({ updatedAt: 1753000000000 }, UID).updatedAt, null);
  assert.equal(bsNormalizeListingMedia({ updatedAt: {} }, UID).updatedAt, null);
});

test('bsNormalizeListingMedia: junk shapes → empty, never throws, no Number() coercion', () => {
  const EMPTY = { portrait: null, cover: null, gallery: [], updatedAt: null };
  for (const junk of [null, undefined, 42, 'str', [], true, NaN, Symbol('x')]) {
    assert.deepEqual(bsNormalizeListingMedia(junk, UID), EMPTY);
  }
  // gallery not an array → empty gallery
  assert.deepEqual(bsNormalizeListingMedia({ gallery: 'nope' }, UID).gallery, []);
  assert.deepEqual(bsNormalizeListingMedia({ gallery: { url: OK } }, UID).gallery, []);
  // gallery items that are junk shapes are skipped, not thrown on
  assert.deepEqual(bsNormalizeListingMedia({ gallery: [null, 1, 'x', [], Symbol('y'), { url: own(UID, 'k.jpg') }] }, UID).gallery,
    [{ url: own(UID, 'k.jpg'), caption: '' }]);
});

test('bsNormalizeListingMedia: caps the source scan (DoS guard over a crafted huge array)', () => {
  // A valid item BEYOND the bounded scan window is never inspected → dropped.
  const junk = Array.from({ length: 40 }, () => ({ url: 'https://evil.example/x.png' }));
  const withLateValid = [...junk.slice(0, 30), { url: own(UID, 'late.jpg'), caption: 'too late' }];
  assert.deepEqual(bsNormalizeListingMedia({ gallery: withLateValid }, UID).gallery, []);
  // A valid item within the window is still kept (a few junk entries up front).
  const early = [{ url: 'not a url' }, { url: own(UID, 'ok.jpg'), caption: 'kept' }];
  assert.deepEqual(bsNormalizeListingMedia({ gallery: early }, UID).gallery, [{ url: own(UID, 'ok.jpg'), caption: 'kept' }]);
  // A massive array does not throw and still clamps to the keep-max.
  const huge = Array.from({ length: 100000 }, () => ({ url: own(UID, 'g.jpg') }));
  assert.equal(bsNormalizeListingMedia({ gallery: huge }, UID).gallery.length, BS_LISTING_GALLERY_MAX);
});

test('bsNormalizeListingMedia: fails closed without ownerUid', () => {
  const EMPTY = { portrait: null, cover: null, gallery: [], updatedAt: null };
  const raw = { portrait: OK, cover: OK, gallery: [{ url: OK }], updatedAt: '2026-07-23T10:31:00.000Z' };
  assert.deepEqual(bsNormalizeListingMedia(raw, ''), EMPTY);
  assert.deepEqual(bsNormalizeListingMedia(raw, null), EMPTY);
  assert.deepEqual(bsNormalizeListingMedia(raw, undefined), EMPTY);
});
