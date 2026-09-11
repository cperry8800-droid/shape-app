// The activity composer's default audience.
//
// ⚠ WHAT THIS EXISTS FOR. `BSLogActivitySheet` seeded a hard 'public' for every
// new post, so a member whose profile is Private — or who had turned Share
// workout data off — opened the composer with PUBLIC already lit, and a post
// made without reading the control went to the community feed against the
// setting they had chosen precisely to stop that.
//
// ⚠ IT IS A DEFAULT, NOT A CLAMP, and the tests say so: pressing PUBLIC still
// posts publicly. This sheet HAS an audience control, and a control that
// silently does something else is worse than one that starts in the wrong
// place. The per-post override is the same shape as the session player's share
// toggle, which this file's own comment calls "their per-workout override".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
// The app's ONE share rule, imported rather than restated — a local copy would
// make this suite agree with itself instead of with what ships.
import { bsWorkoutSharePrivacy } from '../mobile-app/src/services/workoutShare.mjs';

globalThis.window = globalThis.window || {};
const { bsComposerVisFor } = await loadBroadsheet(['bsComposerVisFor']);

const bare = stripComments(readFileSync(SRC, 'utf8'));

// The decision reads the rule off `window`, because the module that ships it is
// a classic browser script the broadsheet cannot import.
function withRule(fn, rule = bsWorkoutSharePrivacy) {
  const prev = globalThis.window.ShapeWorkoutShare;
  globalThis.window.ShapeWorkoutShare = rule ? { rule } : undefined;
  try { return fn(); } finally { globalThis.window.ShapeWorkoutShare = prev; }
}

test('a sharing member keeps the public default they already had', () => {
  withRule(() => {
    assert.equal(bsComposerVisFor({}), 'public', 'no settings row yet means On · Public');
    assert.equal(bsComposerVisFor({ profileVisibility: 'Public', shareWorkoutData: 'On' }), 'public');
  });
});

test('a private profile defaults to just me', () => {
  withRule(() => assert.equal(bsComposerVisFor({ profileVisibility: 'Private' }), 'private'));
});

test('share workout data off defaults to just me, whatever the profile says', () => {
  // The setting is about their workout data, not about who can open their page.
  withRule(() => assert.equal(bsComposerVisFor({ profileVisibility: 'Public', shareWorkoutData: 'Off' }), 'private'));
});

test('just friends defaults to the profile rung, never to public', () => {
  // ⚠ THE PICKER HAS NO 'followers' RUNG. 'profile' keeps the post off the open
  // feed — which reads public/community and never profile — and their profile is
  // already gated to the people that setting names, so the rung's own
  // description is exactly what happens. 'public' would be the whole defect.
  withRule(() => assert.equal(bsComposerVisFor({ profileVisibility: 'Just friends' }), 'profile'));
});

test('a read we could not make never leaves the audience open', () => {
  // null is getUserGoals' can't-know answer; {} is a row that genuinely is not
  // there yet. Only the second may mean "the defaults apply".
  withRule(() => assert.equal(bsComposerVisFor(null), 'private'));
  withRule(() => assert.equal(bsComposerVisFor(undefined), 'private'));
  withRule(() => assert.equal(bsComposerVisFor({}), 'public', 'and the two are not collapsed'));
});

test('a missing share rule fails closed rather than defaulting to public', () => {
  withRule(() => assert.equal(bsComposerVisFor({ profileVisibility: 'Public' }), 'private'), null);
});

test('every audience the share rule can return lands on a rung the picker offers', () => {
  // Derived from BOTH sides, so neither can move without the other: the rungs
  // come out of the control itself, the audiences out of the shipped rule.
  const rungs = [...bare.matchAll(/\[\['public', 'Public'\], \['profile', 'Profile'\], \['private', 'Just me'\]\]/g)];
  assert.equal(rungs.length, 1, 'the composer still draws the three-way control this maps onto');
  const offered = ['public', 'profile', 'private'];
  const docs = [
    {}, { profileVisibility: 'Public' }, { profileVisibility: 'Just friends' },
    { profileVisibility: 'Private' }, { shareWorkoutData: 'Off' }, null,
  ];
  const audiences = new Set(docs.map((d) => (d == null ? 'private' : bsWorkoutSharePrivacy(d))));
  assert.deepEqual([...audiences].sort(), ['followers', 'private', 'public'], 'all three audiences are exercised');
  for (const d of docs) {
    const rung = withRule(() => bsComposerVisFor(d));
    assert.ok(offered.includes(rung), `${JSON.stringify(d)} → ${rung}, which the picker does not offer`);
  }
});

// ── the wiring the mount harness cannot run (useEffect is a no-op there) ─────

const effect = (() => {
  const i = bare.indexOf('const visTouched = ');
  assert.ok(i > 0, 'the composer still tracks whether the member has used the control');
  const j = bare.indexOf('}, []);', i);
  assert.ok(j > i, 'and the effect that seeds it is still there');
  return bare.slice(i, j);
})();

test('an edit keeps the privacy its author chose', () => {
  // A post's stored privacy is a decision already made. Re-privatising it
  // because they have since gone quiet is a change to their history, which
  // `bsMaybeRetightenAutoPosts` deliberately reserves for AUTO posts.
  assert.match(effect, /if \(ed\) return undefined;/);
});

test('a choice already made outranks a settings read that lands after it', () => {
  // Both arms, or a rejection would quietly overrule a deliberate PUBLIC.
  assert.equal((effect.match(/visTouched\.current/g) || []).length, 2, 'the resolve arm and the failure arm');
  assert.match(effect, /setVis\(bsComposerVisFor\(doc\)\)/);
  assert.match(effect, /catch\(\(\) => \{ if \(on && !visTouched\.current\) setVis\(bsComposerVisFor\(null\)\)/);
});

test('using the control marks it used', () => {
  assert.match(bare, /onClick=\{\(\) => \{ visTouched\.current = true; setVis\(val\); \}\}/);
});
