import test from 'node:test';
import assert from 'node:assert/strict';
import { bsWorkoutSharePrivacy, bsIsDuplicateWorkoutPost, BS_PRIVACY_RANK } from '../mobile-app/src/services/workoutShare.mjs';

test('share rule: defaults (missing doc/fields) resolve to public', () => {
  assert.equal(bsWorkoutSharePrivacy(null), 'public');
  assert.equal(bsWorkoutSharePrivacy({}), 'public');
  assert.equal(bsWorkoutSharePrivacy({ profileVisibility: 'Public' }), 'public');
});

test('share rule: visibility maps On+Friends→followers, On+Private→private', () => {
  assert.equal(bsWorkoutSharePrivacy({ shareWorkoutData: 'On', profileVisibility: 'Just friends' }), 'followers');
  assert.equal(bsWorkoutSharePrivacy({ shareWorkoutData: 'On', profileVisibility: 'Private' }), 'private');
});

test('share rule: Off wins over any visibility', () => {
  assert.equal(bsWorkoutSharePrivacy({ shareWorkoutData: 'Off', profileVisibility: 'Public' }), 'private');
  assert.equal(bsWorkoutSharePrivacy({ shareWorkoutData: 'Off', profileVisibility: 'Just friends' }), 'private');
});

test('dedup: different provider within ±20min is a duplicate; same provider / outside window is not', () => {
  const start = '2026-07-08T10:00:00Z';
  const mk = (p, iso) => ({ source_provider: p, created_at: iso });
  assert.equal(bsIsDuplicateWorkoutPost([mk('strava', '2026-07-08T10:10:00Z')], start, 'shape_session'), true);
  assert.equal(bsIsDuplicateWorkoutPost([mk('strava', '2026-07-08T09:41:00Z')], start, 'shape_session'), true);
  assert.equal(bsIsDuplicateWorkoutPost([mk('shape_session', '2026-07-08T10:05:00Z')], start, 'shape_session'), false); // same source (its own upsert dedup owns this)
  assert.equal(bsIsDuplicateWorkoutPost([mk('strava', '2026-07-08T10:21:00Z')], start, 'shape_session'), false);      // outside window
  assert.equal(bsIsDuplicateWorkoutPost([mk(null, '2026-07-08T10:00:00Z')], start, 'shape_session'), false);          // manual post
  assert.equal(bsIsDuplicateWorkoutPost([], start, 'strava'), false);
  assert.equal(bsIsDuplicateWorkoutPost([mk('strava', '2026-07-08T10:00:00Z')], 'not-a-date', 'shape_session'), false); // bad input → never block
});

test('privacy rank orders public < followers < private', () => {
  assert.ok(BS_PRIVACY_RANK.public < BS_PRIVACY_RANK.followers && BS_PRIVACY_RANK.followers < BS_PRIVACY_RANK.private);
});
