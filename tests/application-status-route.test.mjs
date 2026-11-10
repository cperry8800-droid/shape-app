// GET /api/me/application: where the signed-in person's own coach application stands (owner, 2026-11-09:
// the app's Settings row "Coach on Shape" shows its status). The stage rule is src/lib/application-status.mjs;
// the route reads with the admin client and must scope every read to the caller, and answer a failed read as
// unavailable, never as "no application" (the row would offer to apply again over one in review).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applicationStage, pickApplication } from '../src/lib/application-status.mjs';

const ROUTE = readFileSync(new URL('../src/app/api/me/application/route.ts', import.meta.url), 'utf8');
const row = (over = {}) => ({ provider_type: 'trainer', status: 'pending', email: 'maya@x.com', details: { account_id: 'u1' }, admin_review: {}, created_at: '2026-11-09T10:00:00Z', reviewed_at: null, ...over });

test('the stage: submitted, in review, background check, and the three decisions', () => {
  assert.equal(applicationStage(row()), 'submitted');
  assert.equal(applicationStage(row({ status: 'in_review' })), 'in_review');
  for (const check of ['requested', 'needs_review', 'clear']) {
    assert.equal(applicationStage(row({ status: 'in_review', admin_review: { background_check: { status: check } } })), 'background_check', check);
    assert.equal(applicationStage(row({ admin_review: { background_check: { status: check } } })), 'background_check', `pending, ${check}`);
  }
  assert.equal(applicationStage(row({ status: 'approved', admin_review: { background_check: { status: 'clear' } } })), 'approved');
  assert.equal(applicationStage(row({ status: 'rejected' })), 'not_approved');
  assert.equal(applicationStage(row({ status: 'withdrawn' })), 'withdrawn');
  assert.equal(applicationStage(row({ admin_review: null })), 'submitted', 'no review record yet');
});

test('the one to show: the caller\'s own only, an open one before a decided one, the newest first', () => {
  assert.equal(pickApplication([], { accountId: 'u1' }), null);
  // Someone else's rows are never picked, whatever the caller passes.
  assert.equal(pickApplication([row({ details: { account_id: 'u2' } })], { accountId: 'u1' }), null);
  // ⚠ Only the server's stamp is ownership (Codex on #2667): the address and details.user_id are the
  // form's, anyone's to write, so neither makes a row the caller's.
  assert.equal(pickApplication([row({ email: 'maya@x.com', details: {} })], { accountId: 'u1', email: 'maya@x.com' }), null, 'the caller\'s address on a row is not theirs');
  assert.equal(pickApplication([row({ details: { user_id: 'u1' } })], { accountId: 'u1' }), null, 'a client-written id is not theirs');
  assert.equal(pickApplication([row()], {}), null, 'no account, nothing to find');
  assert.equal(pickApplication([row()], { accountId: 'u1' }).role, 'trainer');
  const rows = [
    row({ status: 'rejected', created_at: '2026-11-10T00:00:00Z', reviewed_at: '2026-11-11T00:00:00Z' }),
    row({ provider_type: 'nutritionist', status: 'in_review', created_at: '2026-11-08T00:00:00Z' }),
  ];
  const got = pickApplication(rows, { accountId: 'u1' });
  assert.deepEqual(got, { role: 'nutritionist', stage: 'in_review', status: 'in_review', submittedAt: '2026-11-08T00:00:00Z', decidedAt: null });
  // A reviewer's stamp on an open one is not a decision.
  assert.equal(pickApplication([row({ status: 'in_review', reviewed_at: '2026-11-09T12:00:00Z' })], { accountId: 'u1' }).decidedAt, null);
  // An RD/RDN's application rides the nutritionist rails, marked by details.nutrition_role (Codex on #2667).
  assert.equal(pickApplication([row({ provider_type: 'nutritionist', details: { account_id: 'u1', nutrition_role: 'dietitian' } })], { accountId: 'u1' }).role, 'dietitian');
  assert.equal(pickApplication([row({ provider_type: 'nutritionist', details: { account_id: 'u1', nutrition_role: 'nutritionist' } })], { accountId: 'u1' }).role, 'nutritionist');
  const decided = pickApplication([rows[0]], { accountId: 'u1' });
  assert.equal(decided.stage, 'not_approved');
  assert.equal(decided.decidedAt, '2026-11-11T00:00:00Z');
  // Nothing the reviewer wrote is in the answer.
  assert.deepEqual(Object.keys(got).sort(), ['decidedAt', 'role', 'stage', 'status', 'submittedAt']);
});

test('the route: signed in, every read scoped to the account /api/apply stamped, by exact match, a failed read is 503, private', () => {
  assert.match(ROUTE, /const user = await currentUser\(request\);\s*if \(!user\) return privateJson\(\{ error: 'Authentication required\.' \}, \{ status: 401 \}\);/);
  assert.doesNotMatch(ROUTE, /details->>user_id|userId: user\.id/, 'a client-written account id is not ownership');
  assert.match(ROUTE, /\.eq\('details->>account_id', user\.id\)/);
  assert.doesNotMatch(ROUTE, /\.eq\('email'/, 'the address is the form\'s, not ownership');
  // The open ones are read on their own (Codex on #2667): a newest-ten window alone drops an open
  // application older than ten later decisions.
  assert.match(ROUTE, /const OPEN_STATUSES = \['pending', 'in_review'\];/);
  assert.match(ROUTE, /newest\(scoped\(\)\),\n\s+newest\(scoped\(\)\.in\('status', OPEN_STATUSES\)\),/);
  assert.doesNotMatch(ROUTE, /\.ilike\(|\.like\(|\.or\(/, 'a pattern match on an address can reach someone else\'s row');
  assert.match(ROUTE, /if \(results\.some\(\(r\) => r\.error\)\) return privateJson\([^)]*\{ status: 503 \}\)/);
  assert.match(ROUTE, /'Cache-Control': 'private, no-store, max-age=0'/);
  assert.doesNotMatch(ROUTE, /review_notes|reviewed_by/, 'the reviewer\'s own record is not read');
});
