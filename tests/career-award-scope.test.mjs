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

// ⚠ ONE KEY PER CLAIM: `shape.careerAwardPending.<uid>.<postId>`. A single JSON
// blob holding the queue was a read-modify-write over storage EVERY same-origin
// tab shares, so two tabs whose claims failed at once each read the same array,
// each appended, and the second write discarded the first member's retry —
// during exactly the outage the queue exists to survive.
test('both surfaces key each claim independently, never one shared blob', () => {
  for (const [label, src] of [['shapeBackend.js', MOBILE], ['dashboardCommunity.jsx', WEB]]) {
    assert.match(src, /['\"]shape\.careerAwardPending\.['\"]/, `${label}: no per-claim key prefix`);
    // The write must be a single setItem on its OWN key — no array serialisation.
    assert.ok(!/JSON\.stringify\(/.test(src.slice(src.indexOf('careerAwardPending'), src.indexOf('careerAwardPending') + 4000)),
      `${label}: still serialises a shared queue blob`);
    // The exact pre-fix shapes. Either returning is the race (or the
    // cross-account replay) coming back with it.
    assert.ok(
      !/setItem\(\s*['\"]shape\.careerAwardPending['\"]\s*,/.test(src),
      `${label}: still writes the single shared key`
    );
  }
});

// A write must not read-modify-write another tab's claims.
test('a queued claim is written with a single setItem on its own key', () => {
  const at = MOBILE.indexOf('function writeCareerPending');
  assert.ok(at > 0);
  const slice = MOBILE.slice(at, at + 600);
  assert.match(slice, /setItem\(careerAwardKey\(uid, postId\)/,
    'shapeBackend.js: the write is not a single own-key setItem');
  assert.match(WEB, /setItem\(careerKey\(uid, pid\)/,
    'dashboardCommunity.jsx: the write is not a single own-key setItem');
});

// A clear must remove only its own claim.
test('clearing removes only the matching owner+post key', () => {
  const at = MOBILE.indexOf('function clearCareerPending');
  assert.ok(at > 0, 'shapeBackend.js: no scoped clear');
  const slice = MOBILE.slice(at, at + 320);
  assert.match(slice, /removeItem\(careerAwardKey\(uid, postId\)\)/,
    'shapeBackend.js: clear is not scoped to one claim');
  assert.match(WEB, /removeItem\(careerKey\(uid, pid\)\)/,
    'dashboardCommunity.jsx: clear is not scoped to one claim');
});

// The pre-per-key formats carry no owner (bare id) or no race safety (the
// single array) — both are dropped rather than migrated.
test('both surfaces drop the legacy single-key formats', () => {
  for (const [label, src] of [['shapeBackend.js', MOBILE], ['dashboardCommunity.jsx', WEB]]) {
    assert.match(src, /removeItem\(\s*(?:CAREER_AWARD_PENDING_KEY|['\"]shape\.careerAwardPending['\"])\s*\)/,
      `${label}: the legacy single key is not dropped`);
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

// The key stays OUT of the sign-out scrub inventory (the owner ruling), which
// is only defensible now that replay is owner-safe.
test('the queue is still deliberately kept by the sign-out scrub', async () => {
  const { SHAPE_SCRUB_KEYS, SHAPE_SCRUB_PREFIXES } = await import('../public/newdesign/localScrub.mjs');
  assert.ok(!SHAPE_SCRUB_KEYS.includes('shape.careerAwardPending'));
  // ⚠ The per-claim keys must survive too — the prefix sweep must not match
  // `shape.careerAwardPending.<uid>.<postId>`, or the owner ruling silently
  // reverses and every queued award is wiped on the next sign-out.
  const sample = 'shape.careerAwardPending.0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.aabbccdd-1122-3344-5566-778899aabbcc';
  assert.ok(!SHAPE_SCRUB_PREFIXES.some((p) => sample.startsWith(p)),
    'a scrub prefix now matches the per-claim award keys');
  assert.ok(!SHAPE_SCRUB_KEYS.includes(sample));
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

// The cap is the one read-modify-write left, and it must evict the OLDEST —
// which is the cap's documented behaviour, so a concurrent enforcement can at
// worst repeat that same eviction rather than destroy a fresh claim.
test('the per-claim queue is capped, oldest first', () => {
  assert.match(MOBILE, /CAREER_AWARD_MAX = 20/);
  const at = MOBILE.indexOf('function enforceCareerCap');
  assert.ok(at > 0, 'shapeBackend.js: no cap enforcement');
  const slice = MOBILE.slice(at, at + 520);
  assert.match(slice, /sort\(\(a, b\) => a\.at - b\.at\)/, 'shapeBackend.js: cap does not evict oldest first');
  assert.match(slice, /slice\(0, all\.length - CAREER_AWARD_MAX\)/);
  assert.match(WEB, /a\.at - b\.at/, 'dashboardCommunity.jsx: cap does not evict oldest first');
  assert.match(WEB, /all\.length - 20/);
});

// Each claim stores its own timestamp, which is what makes "oldest" meaningful
// without a shared ordered list.
test('each claim carries its own timestamp as the value', () => {
  assert.match(MOBILE, /setItem\(careerAwardKey\(uid, postId\), String\(Date\.now\(\)\)\)/);
  assert.match(WEB, /setItem\(careerKey\(uid, pid\), String\(Date\.now\(\)\)\)/);
});
