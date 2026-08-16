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
    assert.match(src, /JSON\.stringify\(\{\s*uid:/, `${label}: queue is not owner-tagged`);
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
    const at = src.indexOf('!parsed.uid');
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
  const guardIdx = mobileSlice.indexOf('String(pending.uid) !== String(state.user.id)');
  assert.ok(guardIdx > 0, 'shapeBackend.js: no owner guard in the catch-up');
  assert.ok(guardIdx < rpcIdx, 'shapeBackend.js: the owner guard must run BEFORE the RPC');

  assert.match(WEB, /String\(pending\.uid\) !== String\(me\.id\)/, 'dashboardCommunity.jsx: no owner guard');
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

// A success for post Y must not delete a still-pending retry for post X — the
// queue holds one slot, so the clear has to match on BOTH fields.
test('clearing the queue matches on owner AND post', () => {
  const at = MOBILE.indexOf('function clearCareerPending');
  assert.ok(at > 0, 'shapeBackend.js: no scoped clear');
  const slice = MOBILE.slice(at, at + 420);
  assert.match(slice, /cur\.uid\) !== String\(uid\)/);
  assert.match(slice, /cur\.postId\) !== String\(postId\)/);
});

// The key stays OUT of the sign-out scrub inventory (the owner ruling), which
// is only defensible now that replay is owner-safe.
test('the queue is still deliberately kept by the sign-out scrub', async () => {
  const { SHAPE_SCRUB_KEYS, SHAPE_SCRUB_PREFIXES } = await import('../public/newdesign/localScrub.mjs');
  assert.ok(!SHAPE_SCRUB_KEYS.includes('shape.careerAwardPending'));
  assert.ok(!SHAPE_SCRUB_PREFIXES.some((p) => 'shape.careerAwardPending'.startsWith(p)));
});
