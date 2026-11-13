// The kind picked in the website's post composer (its own row, or a chip in the message box
// heading Wall and Community) is written as the marker the feed's readers file by, so a Meal,
// Workout, Run or PR post files the same after a refresh as it did on screen (Codex P2 on #2736).
// Both functions are lifted from communityFeed.jsx as written and run together: what the
// composer writes, and how the feed files what it reads back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FEED = readFileSync(new URL('../public/newdesign/communityFeed.jsx', import.meta.url), 'utf8');

function lift(name) {
  const at = FEED.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone from communityFeed.jsx`);
  const end = FEED.indexOf('\n}\n', at);
  assert.ok(end > at, `${name} has no end`);
  return FEED.slice(at, end + 2);
}
const { cfKindMarker, cfBucketsFor } = new Function(
  `${lift('cfKindMarker')}\n${lift('cfBucketsFor')}\nreturn { cfKindMarker, cfBucketsFor };`,
)();

// What the create path writes for a composer post: activity_type from the kind (workout when
// none, as the route defaults it), and metrics.kind from the marker. Then the reader files it.
function filedAs(post) {
  const metrics = {};
  if (post.video) metrics.kind = 'video';
  const marker = cfKindMarker(post);
  if (marker) metrics.kind = marker;
  const row = { activity_type: post.kind || 'workout' };
  return { marker, buckets: cfBucketsFor(row, metrics) };
}

test('a meal is filed as a meal, as the app\'s meal share writes it', () => {
  assert.deepEqual(filedAs({ kind: 'meal', body: 'Salmon bowl' }), { marker: 'meal', buckets: ['meal'] });
});

test('a workout, a run and a PR carry the composer\'s activity marker', () => {
  assert.deepEqual(filedAs({ kind: 'workout', body: 'Leg day' }), { marker: 'workout', buckets: ['workout'] });
  assert.deepEqual(filedAs({ kind: 'run', body: '5k easy' }), { marker: 'workout', buckets: ['run'] });
  // A PR with no figure files as a workout: the PR bucket needs a delta the composer never asks for.
  assert.deepEqual(filedAs({ kind: 'pr', body: '225 on bench' }), { marker: 'workout', buckets: ['workout'] });
});

test('a plain post stays a post, and a video or a milestone keeps its own kind', () => {
  assert.deepEqual(filedAs({ kind: 'post', body: 'Hello' }), { marker: null, buckets: ['post'] });
  assert.equal(cfKindMarker({ kind: 'pr', video: 'https://example.com/v.mp4' }), null, 'a video lost its kind to the chip');
  assert.equal(cfKindMarker({ kind: 'video' }), null);
  assert.equal(cfKindMarker({ kind: 'milestone', milestone: { headline: 'Promoted' } }), null, 'a milestone lost its kind');
  assert.equal(cfKindMarker(null), null);
});

test('the create path writes the marker, after the video\'s own kind', () => {
  const at = FEED.indexOf("if (post.video) { metrics.kind = 'video'; metrics.video_url = post.video; }");
  const marker = FEED.indexOf('const kindMarker = cfKindMarker(post);', at);
  const write = FEED.indexOf('if (kindMarker) metrics.kind = kindMarker;', marker);
  const isMs = FEED.indexOf("const isMs = post.kind === 'milestone' && post.milestone;", write);
  assert.ok(at > 0 && marker > at && write > marker && isMs > write, 'the create path no longer writes the kind marker');
});
