// tests/wall-photos.test.mjs
//
// The Wall's photos (owner, 2026-10-22, off the Wall mockup: "do photos and training now first"). A
// post's photo, video or link rides onto the Wall's card, and a post that is a photo or a video and
// nothing else is a card of its own under All. A note, a link or a repost stays off the Wall.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, SHIM, SRC } from './helpers/broadsheet-mount.mjs';

const { bsActivityFromPost, bsWallMediaCard, bsFeedTypeMatch } = await loadBroadsheet(['bsActivityFromPost', 'bsWallMediaCard', 'bsFeedTypeMatch'], SHIM);

const RUN = { id: 'p1', author_id: 'u1', name: 'Drew Oyelaran', kind: 'workout', workout: 'Run', hasRealStats: true, statA: '18.2 mi', labels: ['Distance'], note: 'Long run.', created_at: '2026-10-22T10:00:00Z' };

test('a workout posted with a photo carries it onto the Wall\'s card', () => {
  const card = bsActivityFromPost({ ...RUN, photo: 'https://cdn.test/run.jpg' });
  assert.equal(card.photo, 'https://cdn.test/run.jpg');
  assert.equal(card.typeLabel, 'Run');
  const meal = bsActivityFromPost({ id: 'p2', kind: 'meal', rawMetrics: { kcal: 620 }, video: 'https://cdn.test/prep.mp4', link: { url: 'https://example.test/r', title: 'Recipe' } });
  assert.equal(meal.video, 'https://cdn.test/prep.mp4');
  assert.deepEqual(meal.link, { url: 'https://example.test/r', title: 'Recipe' });
  const plain = bsActivityFromPost(RUN);
  assert.equal(plain.photo, null, 'no photo, nothing drawn');
  assert.equal(plain.video, null);
  assert.equal(plain.link, null);
});

test('a photo or a video on its own is a card of its own; a note, a link or a repost is not', () => {
  const photo = { id: 'p3', author_id: 'u2', name: 'Maya Patel', note: 'Sunday prep: five lunches done.', photo: 'https://cdn.test/prep.jpg', created_at: '2026-10-22T09:00:00Z' };
  assert.equal(bsActivityFromPost(photo), null, 'a photo is not an activity');
  const card = bsWallMediaCard(photo);
  assert.ok(card);
  assert.equal(card.wallMedia, true);
  assert.equal(card.typeLabel, 'Photo');
  assert.equal(card.title, 'Photo');
  assert.equal(card.photo, 'https://cdn.test/prep.jpg');
  assert.equal(card.body, 'Sunday prep: five lunches done.');
  assert.equal(card.postId, 'p3', 'respects and comments go to the post');
  assert.equal(bsWallMediaCard({ ...photo, status: 'Meal prep' }).title, 'Meal prep', 'the post\'s own title wins');
  assert.equal(bsWallMediaCard({ ...photo, photo: null, video: 'https://cdn.test/v.mp4' }).typeLabel, 'Video');
  assert.equal(bsWallMediaCard({ id: 'p4', note: 'hi' }), null, 'a note stays in chat');
  assert.equal(bsWallMediaCard({ id: 'p5', note: 'read this', link: { url: 'https://example.test' } }), null, 'a link stays in chat');
  assert.equal(bsWallMediaCard({ ...photo, repostOf: { id: 'p0' } }), null, 'a repost stays off: its original is already on the Wall');
  assert.equal(bsWallMediaCard(null), null);
});

test('a photo card shows under All only', () => {
  const card = bsWallMediaCard({ id: 'p3', photo: 'https://cdn.test/prep.jpg' });
  assert.equal(bsFeedTypeMatch(card, 'all'), true);
  for (const t of ['workouts', 'runs', 'prs', 'nutrition', 'milestones']) assert.equal(bsFeedTypeMatch(card, t), false, t);
  assert.equal(bsFeedTypeMatch(bsActivityFromPost(RUN), 'runs'), true, 'the other cards file as before');
});

test('the Wall maps its posts through both, and opens on who is training now', () => {
  const src = readFileSync(SRC, 'utf8');
  assert.match(src, /const acts = rows\.map\(\(p\) => bsActivityFromPost\(p\) \|\| bsWallMediaCard\(p\)\)\.filter\(Boolean\);/);
  assert.match(src, /\{railOn && feedType === 'all' && feedMode === 'universal' \? \(\n\s+<BSWallTrainingNow people=\{railPeople\} demo=\{!loggedIn\}/, 'Training now: the rail\'s people, under All in Universal, hidden with the rail');
  // The live boost sheet and the Wall read a live row the one way.
  assert.match(src, /const live = useBSLiveRow\(person\.userId \|\| null\);/);
  assert.match(src, /const mins = useBSLiveMinutes\(person\.userId \|\| null\);/);
});
