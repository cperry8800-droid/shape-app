import test from 'node:test';
import assert from 'node:assert/strict';
import { bsWorkoutSharePrivacy, bsIsDuplicateWorkoutPost, bsPostActivityStart, bsActivityStartISO, bsFetchDuplicateCandidates, bsDuplicateWindowBounds, BS_PRIVACY_RANK } from '../mobile-app/src/services/workoutShare.mjs';

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

// ── The activity date leaves `created_at` ─────────────────────────────────────
// Auto-posters used to stamp `created_at` at the activity START, because the
// ±20-min cross-source dedup needed to compare like with like. That made the
// feed — which orders by `created_at` desc, limit 50, and dates each card by it
// — file a backfill under 50 newer rows where nobody ever saw it. The activity's
// own start is `metrics.startedAt` now; `created_at` means when the post was
// made. These guards pin BOTH halves: the fallback that keeps legacy rows
// matchable, and the absence of `created_at` from every auto-post payload.

test('activity start: metrics.startedAt wins, created_at is the legacy fallback', () => {
  assert.equal(bsPostActivityStart({ metrics: { startedAt: '2026-03-14T08:00:00.000Z' }, created_at: '2026-09-21T22:00:00Z' }), '2026-03-14T08:00:00.000Z');
  // A row written before this change: no startedAt, and created_at IS the start.
  assert.equal(bsPostActivityStart({ metrics: { provider: 'whoop' }, created_at: '2026-03-14T08:00:00Z' }), '2026-03-14T08:00:00Z');
  // Unparseable startedAt must not shadow a good created_at.
  assert.equal(bsPostActivityStart({ metrics: { startedAt: 'soon' }, created_at: '2026-03-14T08:00:00Z' }), '2026-03-14T08:00:00Z');
  assert.equal(bsPostActivityStart({ metrics: { startedAt: '   ' }, created_at: '2026-03-14T08:00:00Z' }), '2026-03-14T08:00:00Z');
  assert.equal(bsPostActivityStart({}), null);
  assert.equal(bsPostActivityStart(null), null);
  assert.equal(bsPostActivityStart({ created_at: 'nope' }), null);
});

test('activity start ISO: normalised to UTC, because the DB filter compares TEXT', () => {
  // The pre-filter ranges `metrics->>startedAt` as text, so lexical order is
  // only the real order when every writer spells the instant the same way.
  // Strava sends a local offset; WHOOP sends Z.
  assert.equal(bsActivityStartISO('2026-03-14T10:00:00+02:00'), '2026-03-14T08:00:00.000Z');
  assert.equal(bsActivityStartISO('2026-03-14T08:00:00Z'), '2026-03-14T08:00:00.000Z');
  assert.equal(bsActivityStartISO(new Date('2026-03-14T08:00:00Z')), '2026-03-14T08:00:00.000Z');
  assert.equal(bsActivityStartISO(''), null);
  assert.equal(bsActivityStartISO(null), null);
  assert.equal(bsActivityStartISO(undefined), null);
  assert.equal(bsActivityStartISO('whenever'), null);
  assert.equal(bsActivityStartISO(1773475200000), null); // a number is not a date we were handed
});

test('dedup judges the ACTIVITY start, so a backfill posted today is still caught', () => {
  const start = '2026-03-14T08:00:00.000Z';
  // The competing row was SYNCED today and describes the same March workout.
  const backfilled = { source_provider: 'strava', created_at: '2026-09-21T22:00:00Z', metrics: { startedAt: '2026-03-14T08:10:00.000Z' } };
  assert.equal(bsIsDuplicateWorkoutPost([backfilled], start, 'whoop'), true);
  // ⚠ And the POST date must not be able to match on its own — under the old
  // rule these two were the same field, so this is the case that separates them.
  const unrelated = { source_provider: 'strava', created_at: '2026-03-14T08:05:00Z', metrics: { startedAt: '2025-01-02T06:00:00.000Z' } };
  assert.equal(bsIsDuplicateWorkoutPost([unrelated], start, 'whoop'), false);
});

test('dedup pre-filter: two plain legs, live + legacy, union of both', async () => {
  const calls = [];
  const rec = (leg) => {
    const q = { leg, filters: [] };
    q.gte = (c, v) => { q.filters.push(['gte', c, v]); return q; };
    q.lte = (c, v) => { q.filters.push(['lte', c, v]); return q; };
    q.is = (c, v) => { q.filters.push(['is', c, v]); return q; };
    q.limit = (n) => { q.filters.push(['limit', n]); calls.push(q); return Promise.resolve(q.result); };
    return q;
  };
  let n = 0;
  const live = { source_provider: 'strava', metrics: { startedAt: '2026-03-14T08:05:00.000Z' } };
  const legacy = { source_provider: 'garmin', created_at: '2026-03-14T08:06:00Z', metrics: { provider: 'garmin' } };
  const make = () => {
    const q = rec(n === 0 ? 'live' : 'legacy');
    q.result = { data: n === 0 ? [live] : [legacy], error: null };
    n += 1;
    return q;
  };
  const rows = await bsFetchDuplicateCandidates(make, '2026-03-14T08:00:00.000Z');
  assert.deepEqual(rows, [live, legacy]);
  assert.equal(calls.length, 2, 'both legs must run');
  // Leg 1 ranges metrics->>startedAt; leg 2 is narrowed to rows that HAVE no
  // startedAt, so the 5-row cap can never be spent on rows leg 1 already covers.
  assert.deepEqual(calls[0].filters, [
    ['gte', 'metrics->>startedAt', '2026-03-14T07:40:00.000Z'],
    ['lte', 'metrics->>startedAt', '2026-03-14T08:20:00.000Z'],
    ['limit', 5],
  ]);
  assert.deepEqual(calls[1].filters, [
    ['is', 'metrics->>startedAt', null],
    ['gte', 'created_at', '2026-03-14T07:40:00.000Z'],
    ['lte', 'created_at', '2026-03-14T08:20:00.000Z'],
    ['limit', 5],
  ]);
});

test('dedup pre-filter: one leg erroring still lets the other decide', async () => {
  const good = { source_provider: 'strava', metrics: { startedAt: '2026-03-14T08:05:00.000Z' } };
  let n = 0;
  const make = () => {
    const res = n === 0 ? { data: null, error: { message: 'boom' } } : { data: [good], error: null };
    n += 1;
    const q = { gte: () => q, lte: () => q, is: () => q, limit: () => Promise.resolve(res) };
    return q;
  };
  assert.deepEqual(await bsFetchDuplicateCandidates(make, '2026-03-14T08:00:00.000Z'), [good]);
});

test('dedup pre-filter: an unparseable start runs NO query at all', async () => {
  let ran = 0;
  const make = () => { ran += 1; const q = { gte: () => q, lte: () => q, is: () => q, limit: () => Promise.resolve({ data: [], error: null }) }; return q; };
  assert.deepEqual(await bsFetchDuplicateCandidates(make, 'not-a-date'), []);
  assert.equal(ran, 0);
});

test('window bounds are ±20 minutes of the activity start', () => {
  assert.deepEqual(bsDuplicateWindowBounds('2026-03-14T08:00:00.000Z'), {
    lo: '2026-03-14T07:40:00.000Z', hi: '2026-03-14T08:20:00.000Z',
  });
  assert.equal(bsDuplicateWindowBounds(''), null);
  assert.equal(bsDuplicateWindowBounds('nope'), null);
});
