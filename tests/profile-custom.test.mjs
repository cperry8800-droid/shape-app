import test from 'node:test';
import assert from 'node:assert/strict';
import { BS_SUPABASE_HOST } from '../public/newdesign/listingMedia.mjs';
import {
  BS_WALL_MAX, BS_SHELF_MAX, BS_LINE_MAX, BS_PINNED_REVIEWS_MAX,
  bsCleanText, bsProfileLine, bsProfileWall, bsProfileShelf,
  bsValidStartDate, bsStartLineState, bsProfileStartLine,
  bsProfileFilm, bsProfileBizCard, bsProfilePinnedReviews, bsNormalizeProfileCustom,
} from '../mobile-app/src/services/profileCustom.mjs';

const UID = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const HOST = `https://${BS_SUPABASE_HOST}`;
const photo = (uid, rest) => `${HOST}/storage/v1/object/public/community-photos/${uid}/${rest}`;

test('bsCleanText: strips control chars, trims, clamps; non-string → empty', () => {
  assert.equal(bsCleanText('a\nb\tc', 80), 'abc');
  assert.equal(bsCleanText('  hi  ', 80), 'hi');
  assert.equal(bsCleanText('x'.repeat(200), 80).length, 80);
  for (const junk of [null, undefined, 42, {}, [], Symbol('x')]) assert.equal(bsCleanText(junk, 80), '');
});

test('bsProfileLine (M4/P2): clamps to 80, cleans', () => {
  assert.equal(bsProfileLine('Strong is a skill.'), 'Strong is a skill.');
  assert.equal(bsProfileLine('m'.repeat(100)).length, BS_LINE_MAX);
  assert.equal(bsProfileLine(42), '');
});

test('bsProfileWall (M1): own community-photos only, owner-folder, ≤6, field rebuild', () => {
  const raw = [
    { url: photo(UID, 'a.jpg'), caption: 'Squat PR', extra: 'nope' },
    { url: photo(OTHER, 'b.jpg'), caption: 'stolen' },              // another member's folder → drop
    { url: 'https://evil.example/x.png', caption: 'beacon' },       // foreign host → drop
    { url: `${HOST}/storage/v1/object/public/coach-media/${UID}/c.jpg` }, // wrong bucket → drop
    { url: photo(UID, 'clip.mp4') },                                // non-image → drop
    { url: photo(UID, 'd.png'), caption: 'x'.repeat(200) },         // caption clamps
  ];
  const out = bsProfileWall(raw, UID);
  assert.equal(out.length, 2);
  assert.deepEqual(Object.keys(out[0]).sort(), ['caption', 'url']); // no extra key
  assert.equal(out[0].url, photo(UID, 'a.jpg'));
  assert.equal(out[1].caption.length, 80);
  // clamp to 6 + fail closed without ownerUid
  assert.equal(bsProfileWall(Array.from({ length: 10 }, (_, i) => ({ url: photo(UID, `g${i}.jpg`) })), UID).length, BS_WALL_MAX);
  assert.deepEqual(bsProfileWall([{ url: photo(UID, 'a.jpg') }], ''), []);
  for (const junk of [null, undefined, 'str', {}, 42]) assert.deepEqual(bsProfileWall(junk, UID), []);
});

test('bsProfileShelf (M3): ≤4, title required, field rebuild, clamps', () => {
  const raw = [
    { title: 'Deadlift 140kg', when: "May '26", tag: 'x' },
    { when: 'no title' },                        // drop
    { title: 't'.repeat(100), when: 'w'.repeat(100) }, // clamp title 60 / when 20
    { title: 'a' }, { title: 'b' }, { title: 'c' }, // overflow
  ];
  const out = bsProfileShelf(raw);
  assert.equal(out.length, BS_SHELF_MAX);
  assert.deepEqual(Object.keys(out[0]).sort(), ['title', 'when']);
  assert.equal(out[0].title, 'Deadlift 140kg');
  assert.equal(out[1].title.length, 60);
  assert.equal(out[1].when.length, 20);
  for (const junk of [null, 'str', {}]) assert.deepEqual(bsProfileShelf(junk), []);
});

test('bsProfileWall / bsProfileShelf: cap the source scan (DoS guard over a crafted huge array)', () => {
  // A valid wall item BEYOND the bounded scan window is never inspected → dropped.
  const wallLate = [...Array.from({ length: 30 }, () => ({ url: 'https://evil.example/x.png' })), { url: photo(UID, 'late.jpg') }];
  assert.deepEqual(bsProfileWall(wallLate, UID), []);
  // A massive invalid array does not hang and still yields the keep-max at most.
  const wallHuge = Array.from({ length: 100000 }, () => ({ url: photo(UID, 'g.jpg') }));
  assert.equal(bsProfileWall(wallHuge, UID).length, BS_WALL_MAX);
  // Shelf: a valid row beyond the scan window is dropped; huge array is bounded.
  const shelfLate = [...Array.from({ length: 20 }, () => ({ when: 'no title' })), { title: 'too late' }];
  assert.deepEqual(bsProfileShelf(shelfLate), []);
  assert.equal(bsProfileShelf(Array.from({ length: 100000 }, () => ({ title: 't' }))).length, BS_SHELF_MAX);
});

test('bsValidStartDate (M2): real calendar only', () => {
  assert.deepEqual(bsValidStartDate('2026-09-01'), { y: 2026, m: 9, d: 1 });
  assert.deepEqual(bsValidStartDate('2028-02-29'), { y: 2028, m: 2, d: 29 }); // leap → valid
  for (const bad of ['2026-02-31', '2026-00-10', '2026-13-01', '2025-02-29', '2026-9-1', '2026/09/01', 'soon', '', null, 42]) {
    assert.equal(bsValidStartDate(bad), null, `${bad} should be invalid`);
  }
});

test('bsStartLineState (M2): local-calendar days-out; past/invalid → null; time-of-day independent', () => {
  const jan1 = (h, min) => new Date(2026, 0, 1, h, min, 0, 0);
  assert.deepEqual(bsStartLineState('2026-01-02', jan1(0, 15)), { days: 1 });   // early
  assert.deepEqual(bsStartLineState('2026-01-02', jan1(23, 30)), { days: 1 });  // late — noon-anchored, still 1
  assert.deepEqual(bsStartLineState('2026-01-01', jan1(9, 0)), { days: 0 });    // TODAY
  assert.equal(bsStartLineState('2025-12-31', jan1(9, 0)), null);               // past → absent
  assert.deepEqual(bsStartLineState('2026-03-01', new Date(2026, 1, 1, 12)), { days: 28 }); // Feb 1 → Mar 1 = 28
  assert.equal(bsStartLineState('2026-02-31', jan1(9, 0)), null);               // impossible → absent
  assert.equal(bsStartLineState('2026-01-02', 'not a date'), null);
});

test('bsProfileStartLine (M2): valid date required, title clamps', () => {
  assert.deepEqual(bsProfileStartLine({ title: 'My first marathon', date: '2026-09-01' }), { title: 'My first marathon', date: '2026-09-01' });
  assert.equal(bsProfileStartLine({ title: 'x', date: '2026-02-31' }), null);
  assert.equal(bsProfileStartLine({ title: 'x' }), null);
  assert.equal(bsProfileStartLine('nope'), null);
  assert.equal(bsProfileStartLine({ title: 't'.repeat(100), date: '2026-09-01' }).title.length, 60);
});

test('bsNormalizeProfileCustom: allowlist — legacy keys byte-identical, empties dropped, junk safe', () => {
  const doc = {
    bio: 'hi', cover: { image: 'x' }, prompts: [{ q: 'Q', a: 'A' }], heroStats: ['score'],
    line: '  Strong  ', wall: [{ url: photo(UID, 'a.jpg'), caption: 'c' }], shelf: [{ title: 'PR' }],
    startLine: { title: 'Race', date: '2026-09-01' }, unknownFuture: { keep: true },
  };
  const out = bsNormalizeProfileCustom(doc, UID);
  // legacy + unknown keys untouched
  assert.deepEqual(out.bio, 'hi');
  assert.deepEqual(out.cover, { image: 'x' });
  assert.deepEqual(out.prompts, [{ q: 'Q', a: 'A' }]);
  assert.deepEqual(out.heroStats, ['score']);
  assert.deepEqual(out.unknownFuture, { keep: true });
  // wave keys normalized
  assert.equal(out.line, 'Strong');
  assert.equal(out.wall.length, 1);
  assert.equal(out.shelf[0].title, 'PR');
  assert.deepEqual(out.startLine, { title: 'Race', date: '2026-09-01' });
  // empty/invalid → key DROPPED (no empty-string tombstone)
  const cleared = bsNormalizeProfileCustom({ bio: 'keep', line: '   ', wall: [], shelf: 'junk', startLine: { date: '2026-02-31' } }, UID);
  assert.equal('line' in cleared, false);
  assert.equal('wall' in cleared, false);
  assert.equal('shelf' in cleared, false);
  assert.equal('startLine' in cleared, false);
  assert.equal(cleared.bio, 'keep');
  // junk doc → {}
  for (const junk of [null, undefined, 42, 'str', []]) assert.deepEqual(bsNormalizeProfileCustom(junk, UID), {});
  // no ownerUid → wall drops but text keys still normalize
  const noUid = bsNormalizeProfileCustom({ line: 'hi', wall: [{ url: photo(UID, 'a.jpg') }] }, '');
  assert.equal(noUid.line, 'hi');
  assert.equal('wall' in noUid, false);
});

const vid = (bucket, uid, rest) => `${HOST}/storage/v1/object/public/${bucket}/${uid}/${rest}`;

test('bsProfileFilm (P1/M5): own-folder VIDEO only, per-bucket, caption clamps', () => {
  // coach film → coach-media bucket
  assert.deepEqual(bsProfileFilm({ url: vid('coach-media', UID, 'intro.mp4'), caption: 'My intro' }, UID, 'coach-media'),
    { url: vid('coach-media', UID, 'intro.mp4'), caption: 'My intro' });
  // member film → member-films bucket (.mov/.webm/.m4v all valid)
  assert.equal(bsProfileFilm({ url: vid('member-films', UID, 'f.webm') }, UID, 'member-films').url, vid('member-films', UID, 'f.webm'));
  assert.equal(bsProfileFilm({ url: vid('coach-media', UID, 'x.mov'), caption: 'y'.repeat(200) }, UID, 'coach-media').caption.length, 80);
  // wrong bucket, foreign folder, IMAGE extension (video-only), non-object → null
  assert.equal(bsProfileFilm({ url: vid('member-films', UID, 'a.mp4') }, UID, 'coach-media'), null); // bucket mismatch
  assert.equal(bsProfileFilm({ url: vid('coach-media', OTHER, 'a.mp4') }, UID, 'coach-media'), null); // another owner
  assert.equal(bsProfileFilm({ url: vid('coach-media', UID, 'a.jpg') }, UID, 'coach-media'), null);   // image ext rejected
  assert.equal(bsProfileFilm({ url: `${HOST}/storage/v1/object/public/coach-media/${UID}/a.mp4` }, UID, ''), null); // no bucket arg
  for (const junk of [null, undefined, 'str', 42, []]) assert.equal(bsProfileFilm(junk, UID, 'coach-media'), null);
});

test('bsProfileBizCard (P4): name required, fields clamp, control chars stripped', () => {
  assert.deepEqual(bsProfileBizCard({ name: 'Iron Path', where: 'Austin, TX', hours: 'Mon–Fri', handle: '@ironpath' }),
    { name: 'Iron Path', where: 'Austin, TX', hours: 'Mon–Fri', handle: '@ironpath' });
  assert.equal(bsProfileBizCard({ where: 'no name' }), null);          // name is the anchor
  assert.equal(bsProfileBizCard({ name: '   ' }), null);
  const clamped = bsProfileBizCard({ name: 'n'.repeat(100), where: 'w'.repeat(100), hours: 'h'.repeat(100), handle: 'k'.repeat(100) });
  assert.equal(clamped.name.length, 60); assert.equal(clamped.where.length, 80);
  assert.equal(clamped.hours.length, 40); assert.equal(clamped.handle.length, 40);
  assert.equal(bsProfileBizCard({ name: 'a\nb\tc' }).name, 'abc');     // control chars stripped
  assert.deepEqual(bsProfileBizCard({ name: 'Gym' }), { name: 'Gym', where: '', hours: '', handle: '' });
  for (const junk of [null, 'str', [], 42]) assert.equal(bsProfileBizCard(junk), null);
});

test('bsProfilePinnedReviews (P5): uuid-only, deduped, ≤3, lowercased', () => {
  const R1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', R2 = 'BBBBBBBB-2222-4222-8222-BBBBBBBBBBBB', R3 = 'cccccccc-3333-4333-8333-cccccccccccc', R4 = 'dddddddd-4444-4444-8444-dddddddddddd';
  assert.deepEqual(bsProfilePinnedReviews([R1, R2.toLowerCase()]), [R1, R2.toLowerCase()]);
  assert.deepEqual(bsProfilePinnedReviews([R2]), [R2.toLowerCase()]);          // uppercase → lowercased
  assert.deepEqual(bsProfilePinnedReviews([R1, R1, R2]), [R1, R2.toLowerCase()]); // dedupe
  assert.equal(bsProfilePinnedReviews([R1, R2, R3, R4]).length, BS_PINNED_REVIEWS_MAX); // ≤3
  assert.deepEqual(bsProfilePinnedReviews([R1, 'not-a-uuid', 42, null, {}, R3]), [R1, R3]); // junk dropped
  for (const junk of [null, 'str', {}, 42]) assert.deepEqual(bsProfilePinnedReviews(junk), []);
  // scan cap (DoS guard): a valid uuid BEYOND the bounded window is never inspected;
  // a massive junk array doesn't hang.
  assert.deepEqual(bsProfilePinnedReviews([...Array.from({ length: 20 }, () => 'not-a-uuid'), R1]), []);
  assert.deepEqual(bsProfilePinnedReviews(Array.from({ length: 100000 }, () => 'x')), []);
});

test('bsNormalizeProfileCustom: P4/P5 keys + film via opts.filmBucket + film passthrough', () => {
  const R1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const doc = {
    bio: 'keep', line: 'Strong.', // legacy + M4 keys still work
    bizCard: { name: 'Iron Path', where: 'ATX' },
    pinnedReviews: [R1, 'junk'],
    film: { url: vid('coach-media', UID, 'intro.mp4'), caption: 'c' },
  };
  // WITH filmBucket → film normalized (kept)
  const out = bsNormalizeProfileCustom(doc, UID, { filmBucket: 'coach-media' });
  assert.equal(out.bio, 'keep');
  assert.deepEqual(out.bizCard, { name: 'Iron Path', where: 'ATX', hours: '', handle: '' });
  assert.deepEqual(out.pinnedReviews, [R1]);
  assert.equal(out.film.url, vid('coach-media', UID, 'intro.mp4'));
  // WITHOUT filmBucket → film passes through BYTE-IDENTICAL (the render re-validates);
  // other wave keys still normalize
  const noBucket = bsNormalizeProfileCustom(doc, UID);
  assert.deepEqual(noBucket.film, doc.film);   // untouched
  assert.deepEqual(noBucket.pinnedReviews, [R1]);
  // WITH filmBucket but a WRONG-bucket film → key dropped
  const wrongFilm = bsNormalizeProfileCustom({ film: { url: vid('member-films', UID, 'a.mp4') } }, UID, { filmBucket: 'coach-media' });
  assert.equal('film' in wrongFilm, false);
  // empty/invalid P4/P5 → keys dropped
  const cleared = bsNormalizeProfileCustom({ bio: 'x', bizCard: { where: 'no name' }, pinnedReviews: ['junk'] }, UID);
  assert.equal('bizCard' in cleared, false);
  assert.equal('pinnedReviews' in cleared, false);
  assert.equal(cleared.bio, 'x');
});
