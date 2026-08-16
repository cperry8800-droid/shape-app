// The career-award retry queue must be OWNER-SCOPED — a shared-device gate.
//
// shape.careerAwardPending used to hold a BARE post id, and both surfaces
// replayed it for whoever was signed in. On a shared device that meant member
// A's queued post was submitted UNDER member B's identity; award_work_milestone
// matches `author_id = auth.uid()`, so it answered
// {granted:false,'not_a_milestone'} — a SUCCESSFUL response, not an error — and
// the catch-up then deleted the key. Keeping the queue destroyed the very award
// it existed to protect (found in review of #1890).
//
// Two independent copies implement this (mobile shapeBackend.js and the website
// dashboardCommunity.jsx), so this file gates BOTH the way
// local-scrub-sync.test.mjs gates the scrub inventory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MOBILE = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
const WEB = readFileSync(new URL('../public/newdesign/dashboardCommunity.jsx', import.meta.url), 'utf8');

// The pending record must be an owner-tagged object, never a bare id.
test('both surfaces persist the queue as {uid, postId}, never a bare post id', () => {
  for (const [label, src] of [['shapeBackend.js', MOBILE], ['dashboardCommunity.jsx', WEB]]) {
    assert.match(src, /\{ uid: String\(uid\), postId: String\(p(?:ostId|id)\) \}/, `${label}: records are not owner-tagged`);
    // The exact pre-fix shape. If this ever comes back, the cross-account
    // replay comes back with it.
    assert.ok(
      !/setItem\(\s*['"]shape\.careerAwardPending['"]\s*,\s*String\(p(id|ostId)\)\s*\)/.test(src),
      `${label}: still writes a bare post id`
    );
  }
});

// An unattributable legacy value must be DROPPED, never replayed under whoever
// happens to be signed in — replaying it is precisely the defect.
test('both surfaces drop the legacy bare-string record instead of replaying it', () => {
  for (const [label, src] of [['shapeBackend.js', MOBILE], ['dashboardCommunity.jsx', WEB]]) {
    const at = src.indexOf('!Array.isArray(parsed)');
    assert.ok(at > 0, `${label}: no unattributable-record guard`);
    const slice = src.slice(at, at + 300);
    assert.match(slice, /removeItem\(/, `${label}: unattributable record is not dropped`);
  }
});

// The replay itself must be gated on ownership.
test('both surfaces refuse to replay another member\'s queued award', () => {
  const mobileAt = MOBILE.indexOf('async function careerAwardCatchUp');
  assert.ok(mobileAt > 0);
  const mobileSlice = MOBILE.slice(mobileAt, MOBILE.indexOf('window.ShapeCareerAward', mobileAt));
  const rpcIdx = mobileSlice.indexOf("supabase.rpc('award_work_milestone'");
  // The lookup itself is the guard: it can only ever return OUR record.
  const guardIdx = mobileSlice.indexOf('readCareerPendingFor(state.user.id)');
  assert.ok(guardIdx > 0, 'shapeBackend.js: catch-up does not look up its OWN entry');
  assert.ok(guardIdx < rpcIdx, 'shapeBackend.js: the owner lookup must run BEFORE the RPC');

  assert.match(WEB, /careerPendingRead\(me\.id\)/, 'dashboardCommunity.jsx: catch-up is not owner-keyed');
  // The web catch-up used to fire on mount with no signed-in check at all.
  assert.match(WEB, /shapeDb\.getUser\(\)/, 'dashboardCommunity.jsx: catch-up does not resolve the current user');
});

// Deleting the queue on a refusal is the second half of the defect: the RPC
// answers granted:false WITHOUT an error for a post the caller does not own,
// and the old code treated any non-error as "done".
test('the queue survives an unauthenticated answer and clears on a terminal one', () => {
  assert.match(MOBILE, /function careerAwardIsTerminal\(data\) \{\s*return !\(data && data\.reason === 'unauthenticated'\);/);
  // The web copy has no shared module to import, so it inlines the same rule.
  assert.match(WEB, /data\.reason === 'unauthenticated'/, 'dashboardCommunity.jsx: terminal rule missing');
});

// ⚠ Owner-TAGGING alone still lost awards: with ONE slot, member B's failed
// claim overwrote member A's queued record and A's retry was gone when they
// returned. The queue must be PARTITIONED per owner, not merely labelled.
test('both surfaces partition the queue per owner instead of overwriting one slot', () => {
  for (const [label, src] of [['shapeBackend.js', MOBILE], ['dashboardCommunity.jsx', WEB]]) {
    // A write keeps every other owner's record and replaces only its own.
    assert.match(src, /!\(String\(r\.uid\) === String\(uid\) && String\(r\.postId\) === String\(p(?:ostId|id)\)\)/,
      `${label}: a write does not preserve other records`);
    assert.match(src, /\.concat\(\[\{ uid: String\(uid\), postId: String\(p(?:ostId|id)\) \}\]\)/,
      `${label}: a write does not append an owner-keyed record`);
    // A read selects this owner's entry rather than assuming a single slot.
    assert.match(src, /filter\((?:function )?\(?r\)?\s*(?:=>|\{ return)\s*String\(r\.uid\) === String\(uid\)/,
      `${label}: the read is not owner-keyed`);
  }
});

// A success for post Y must not delete a still-pending retry for post X, and
// must never touch another owner's entry.
test('clearing removes only the matching owner+post record', () => {
  for (const [label, src, marker] of [
    ['shapeBackend.js', MOBILE, 'function clearCareerPending'],
    ['dashboardCommunity.jsx', WEB, 'careerPendingClear = React.useCallback'],
  ]) {
    const at = src.indexOf(marker);
    assert.ok(at > 0, `${label}: no scoped clear`);
    const slice = src.slice(at, at + 520);
    assert.match(slice, /String\(r\.uid\) === String\(uid\)/, `${label}: clear is not owner-matched`);
    assert.match(slice, /String\(r\.postId\) === String\(p(?:ostId|id)\)/, `${label}: clear is not post-matched`);
    assert.ok(!/removeItem\(\s*['"]shape\.careerAwardPending['"]\s*\)/.test(slice),
      `${label}: clear nukes the whole key instead of one record`);
  }
});

// The collection is bounded — a kiosk must not grow it without limit.
test('the per-owner queue is capped', () => {
  assert.match(MOBILE, /CAREER_AWARD_MAX = 20/);
  assert.match(MOBILE, /slice\(-CAREER_AWARD_MAX\)/);
  assert.match(WEB, /slice\(-20\)/);
});

// The key stays OUT of the sign-out scrub inventory (the owner ruling), which
// is only defensible now that replay is owner-safe.
test('the queue is still deliberately kept by the sign-out scrub', async () => {
  const { SHAPE_SCRUB_KEYS, SHAPE_SCRUB_PREFIXES } = await import('../public/newdesign/localScrub.mjs');
  assert.ok(!SHAPE_SCRUB_KEYS.includes('shape.careerAwardPending'));
  assert.ok(!SHAPE_SCRUB_PREFIXES.some((p) => 'shape.careerAwardPending'.startsWith(p)));
});

// ⚠ ONE OWNER CAN HOLD SEVERAL. award_work_milestone buckets each award from
// the POST'S OWN month, so two claims that failed across a month boundary (an
// outage spanning the 1st) are two DISTINCT +25s. Replacing on uid alone would
// silently drop one, and replaying only one of them would strand the other.
test('the queue is keyed by owner AND post, so one member can hold several', () => {
  for (const [label, src] of [['shapeBackend.js', MOBILE], ['dashboardCommunity.jsx', WEB]]) {
    // A read returns a LIST for the owner, not a single record.
    assert.match(src, /readCareerPendingFor|careerPendingRead/, `${label}: no owner lookup`);
    assert.ok(
      !/\.find\((?:function )?\(?r\)?\s*(?:=>|\{ return)\s*String\(r\.uid\) === String\(uid\)/.test(src),
      `${label}: the owner lookup still returns a single record`
    );
  }
});

test('the catch-up replays every one of the queued posts we own', () => {
  const at = MOBILE.indexOf('async function careerAwardCatchUp');
  const slice = MOBILE.slice(at, MOBILE.indexOf('window.ShapeCareerAward', at));
  assert.match(slice, /for \(const rec of pending\)/, 'shapeBackend.js: catch-up replays only one record');
  // One record's transport failure must not abandon the rest.
  assert.match(slice, /if \(error\) continue;/, 'shapeBackend.js: one failure aborts the remaining replays');
  assert.match(WEB, /for \(const rec of pending\)/, 'dashboardCommunity.jsx: catch-up replays only one record');
});

// ⚠ The owner comes from the POST RESPONSE, never a second network lookup.
// If connectivity dropped between a successful post and a getUser() round-trip,
// the award RPC would fail AND the retry would be refused for want of a uid —
// losing the earned +25 outright. The created row already carries author_id.
test('the web composer takes the award owner from the post response', () => {
  assert.match(WEB, /j\.post && j\.post\.author_id/,
    'dashboardCommunity.jsx does not read the owner from the post response');
  const at = WEB.indexOf('const pid = j && j.post && j.post.id');
  const slice = WEB.slice(at, at + 900);
  assert.ok(!/shapeDb\.getUser\(\)/.test(slice),
    'the composer still makes a network lookup for the owner after posting');
});
