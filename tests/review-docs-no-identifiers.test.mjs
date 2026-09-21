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
// So: a review or handoff doc carries no email address. The service addresses the repo
// legitimately writes down (an attribution footer, an outbound User-Agent) are named below
// rather than pattern-matched, so adding one is a decision somebody comes here to make.
//
// Scope is deliberately these two families and not all of `docs/`: the plans under
// `docs/superpowers/` quote commit footers by design, and widening the sweep would fail
// correct files instead of catching a leak.

const DOCS = 'docs';
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED = new Set([
  'noreply@anthropic.com',          // the commit/PR attribution footer
  'noreply@github.com',             // GitHub's own commit author for a web edit
  'privacy@theshapecommunity.com',  // the Open Food Facts outbound User-Agent
  'safety@theshapecommunity.com',   // the safety mailbox, quoted in two handoffs
]);

const files = readdirSync(DOCS)
  .filter((f) => /^(REVIEW|HANDOFF)-.*\.md$/.test(f))
  .map((f) => join(DOCS, f));

test('a review or handoff doc carries no personal identifier', () => {
  // vacuity: a sweep that finds no docs passes about nothing
  assert.ok(files.length >= 5, `only ${files.length} review/handoff docs found — this sweep is reading nothing`);
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.match(EMAIL) || []) if (!ALLOWED.has(m.toLowerCase())) hits.push(`${f}: ${m}`);
  }
  assert.deepEqual(hits, [], 'an email address reached a committed review/handoff doc:\n' + hits.join('\n'));
});

test('the allowlist is service addresses only, and the sweep can actually fire', () => {
  // an allowlist nobody can read is a hole; name what is permitted and why, above.
  assert.ok(ALLOWED.size > 0 && ALLOWED.size <= 6, 'the allowlist has grown — each entry is a decision');
  for (const a of ALLOWED) assert.match(a, /^(noreply|privacy|safety|support|security)@/, `${a} looks personal`);
  // guard the guard: the pattern must catch the exact shape that shipped, and must not
  // fire on ordinary prose. Without this a typo'd regex reports a clean sweep forever.
  assert.ok('## 6. Your activity feed (`someone@example.com`)'.match(EMAIL), 'the pattern misses a real address');
  assert.equal('the @coderabbitai round, at 21:44Z'.match(EMAIL), null, 'the pattern fires on prose');
});
