import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ⚠ A REVIEW OR HANDOFF DOC IS COMMITTED, PUSHED, AND READ BY PEOPLE THE ACCOUNT HOLDER
// NEVER CHOSE. `docs/REVIEW-2026-09-21-coach-dashboard.md` shipped the owner's own email in
// a heading, the verbatim text of their posts and the dates of their imported workouts —
// read from their account at their request, which is permission to LOOK and not permission
// to publish. None of it was needed: every cause in that section is a `path:line` in this
// repo, and the section reads the same without a single identifier in it.
//
// ⚠ THIS SWEEP CATCHES THE TWO SHAPES A MACHINE CAN RECOGNISE, AND IT IS NAMED FOR THEM
// RATHER THAN FOR THE WHOLE CLASS. Its first version was called "no personal identifier"
// and checked an email address alone — a name that tells the next reader the class is
// closed when four fifths of it is not. What is enforced here is exactly:
//
//   1. no email address, outside a named allowlist of service mailboxes
//   2. no bare account UUID — one not inside a `claude.ai/…/artifact/…` link
//
// ⚠ AND WHAT IS **NOT** ENFORCED IS WRITTEN DOWN, because a guard silent about its own
// gaps is how the gap gets trusted:
//
//   · **Verbatim post or message text** has no machine-recognisable shape at all. Nothing
//     distinguishes a member's note from any other quoted string in a review doc.
//   · **Activity dates** cannot be swept here. These files ARE dated and cite dates
//     constantly — a ban on date-like strings fails all 65 of them on the first run.
//   · **Phone numbers** were measured rather than assumed and are deliberately absent: a
//     standard pattern returns 9 hits on this corpus and **every one is a false positive**
//     (fragments of artifact UUIDs and GitHub Actions run ids). A rule that fails correct
//     docs and catches nothing is worse than no rule.
//
// Those three are a writing discipline and a review gate, not a regex. Whoever reads an
// account writes down the CAUSE and leaves the account out.
//
// Scope is deliberately these two families and not all of `docs/`: the plans under
// `docs/superpowers/` quote commit footers by design, and widening the sweep would fail
// correct files instead of catching a leak.

const DOCS = 'docs';
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// An artifact link legitimately carries a UUID and is not an account identifier; every one
// of the 11 UUIDs in this corpus today is one. Removed before the UUID sweep runs.
const ARTIFACT_LINK = /claude\.ai[^\s)>`"']*/gi;
const ALLOWED = new Set([
  'noreply@anthropic.com',          // the commit/PR attribution footer
  'noreply@github.com',             // GitHub's own commit author for a web edit
  'privacy@theshapecommunity.com',  // the Open Food Facts outbound User-Agent
  'safety@theshapecommunity.com',   // the safety mailbox, quoted in two handoffs
]);

const files = readdirSync(DOCS)
  .filter((f) => /^(REVIEW|HANDOFF)-.*\.md$/.test(f))
  .map((f) => join(DOCS, f));

test('no review or handoff doc carries an email address or a bare account id', () => {
  // vacuity: a sweep that finds no docs passes about nothing
  assert.ok(files.length >= 5, `only ${files.length} review/handoff docs found — this sweep is reading nothing`);
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.match(EMAIL) || []) if (!ALLOWED.has(m.toLowerCase())) hits.push(`${f}: ${m}`);
    for (const m of src.replace(ARTIFACT_LINK, '').match(UUID) || []) hits.push(`${f}: ${m} (bare uuid)`);
  }
  assert.deepEqual(hits, [], 'an account identifier reached a committed review/handoff doc:\n' + hits.join('\n'));
});

test('the allowlist is service addresses only, and both sweeps can actually fire', () => {
  // an allowlist nobody can read is a hole; name what is permitted and why, above.
  assert.ok(ALLOWED.size > 0 && ALLOWED.size <= 6, 'the allowlist has grown — each entry is a decision');
  for (const a of ALLOWED) assert.match(a, /^(noreply|privacy|safety|support|security)@/, `${a} looks personal`);
  // ⚠ GUARD THE GUARD. Each pattern must catch the exact shape that shipped, and must not
  // fire on ordinary prose — without this half a typo'd regex reports a clean sweep forever.
  assert.ok('## 6. Your activity feed (`someone@example.com`)'.match(EMAIL), 'the email pattern misses a real address');
  assert.equal('the @coderabbitai round, at 21:44Z'.match(EMAIL), null, 'the email pattern fires on prose');
  const bare = 'the account 7bea5f11-0693-4099-9cb5-272e21cf0712 holds seven posts';
  assert.ok(bare.replace(ARTIFACT_LINK, '').match(UUID), 'the uuid pattern misses a bare account id');
  // …and an artifact link, which every UUID in this corpus is, must survive it
  const link = 'board: https://claude.ai/code/artifact/adc4c3d3-2922-4735-b379-f3640e12c016';
  assert.equal(link.replace(ARTIFACT_LINK, '').match(UUID), null, 'the uuid pattern fires on an artifact link');
});
