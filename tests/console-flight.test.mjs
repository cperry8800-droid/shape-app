// Flight gates — both review-round P1s pinned here, plus the spoof vector.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_CHECKS,
  gateFromRuns,
  coderabbitVerdict,
  codexPresent,
  prAllGreen,
} from '../src/lib/console-flight.mjs';

const run = (name, conclusion = 'success', status = 'completed') => ({ name, status, conclusion });
const ALL_GREEN = REQUIRED_CHECKS.map((n) => run(n));

test('gateFromRuns — green requires EVERY required check present and successful', () => {
  assert.equal(gateFromRuns(ALL_GREEN), 'green');
  // The Codex P1: a subset of required checks (mid-registration, a rename)
  // must never read green — one successful job is not the gate.
  assert.equal(gateFromRuns([run(REQUIRED_CHECKS[0])]), 'none');
  assert.equal(gateFromRuns(ALL_GREEN.slice(0, 2)), 'none');
});

test('gateFromRuns — red and running judged on the required set', () => {
  assert.equal(gateFromRuns([...ALL_GREEN.slice(0, 2), run(REQUIRED_CHECKS[2], 'failure')]), 'red');
  assert.equal(
    gateFromRuns([...ALL_GREEN.slice(0, 2), run(REQUIRED_CHECKS[2], null, 'in_progress')]),
    'running'
  );
});

test('gateFromRuns — completed ≠ success: only a real success conclusion counts', () => {
  // Round-2 Codex P1: GitHub marks these 'completed', so a presence-only gate
  // would have read them green.
  for (const bad of ['startup_failure', 'stale']) {
    assert.equal(gateFromRuns([...ALL_GREEN.slice(0, 2), run(REQUIRED_CHECKS[2], bad)]), 'red', bad);
  }
  // Ambiguous / absent conclusions are not a pass and not confidently a fail.
  for (const amb of ['neutral', 'skipped', null]) {
    assert.equal(
      gateFromRuns([...ALL_GREEN.slice(0, 2), run(REQUIRED_CHECKS[2], amb)]),
      'none',
      String(amb)
    );
  }
});

test('gateFromRuns — the no-required fallback can flag red/running but NEVER green', () => {
  assert.equal(gateFromRuns([run('Some Renamed Job', 'failure')]), 'red');
  assert.equal(gateFromRuns([run('Some Renamed Job', null, 'queued')]), 'running');
  assert.equal(gateFromRuns([run('Some Renamed Job', 'success')]), 'none');
  assert.equal(gateFromRuns([]), 'none');
});

const SHA = 'bff3a3fa519361d0e49ba953892b7f8c4423dc1f';
const cr = (state, commit_id = SHA) => ({ user: { login: 'coderabbitai[bot]' }, state, commit_id });

test('coderabbitVerdict — a review counts only on the current head', () => {
  assert.equal(coderabbitVerdict({ reviews: [cr('APPROVED')], headSha: SHA }), 'approved');
  assert.equal(coderabbitVerdict({ reviews: [cr('CHANGES_REQUESTED')], headSha: SHA }), 'changes');
  // The Codex P1: an approval from an EARLIER push demotes to commented.
  assert.equal(
    coderabbitVerdict({ reviews: [cr('APPROVED', 'deadbeef' + SHA.slice(8))], headSha: SHA }),
    'commented'
  );
});

test('coderabbitVerdict — the clean pass is the edited summary, head-pinned', () => {
  const clean = (body) => ({ user: { login: 'coderabbitai[bot]' }, body });
  // Clean summary referencing the current head → clean (satisfies the gate).
  assert.equal(
    coderabbitVerdict({
      comments: [clean(`**Actionable comments posted: 0**\n\nreviewed up to ${SHA.slice(0, 7)}`)],
      headSha: SHA,
    }),
    'clean'
  );
  // Zero actionable but NO head reference → commented (cannot confirm head).
  assert.equal(
    coderabbitVerdict({ comments: [clean('Actionable comments posted: 0')], headSha: SHA }),
    'commented'
  );
  // Actionable > 0 is never clean.
  assert.equal(
    coderabbitVerdict({
      comments: [clean(`Actionable comments posted: 5 · ${SHA}`)],
      headSha: SHA,
    }),
    'commented'
  );
});

test('coderabbitVerdict — BOTH clean markers count (round-6 P1)', () => {
  const clean = (body) => ({ user: { login: 'coderabbitai[bot]' }, body });
  // The second marker is the one the house records name alongside the first;
  // requiring only "Actionable comments posted:" left genuinely-clean PRs
  // stuck at 'commented' forever, so the gate could never open.
  assert.equal(
    coderabbitVerdict({
      comments: [clean(`**No actionable comments were generated**\n\nreviewed up to ${SHA}`)],
      headSha: SHA,
    }),
    'clean'
  );
  // Still head-pinned: a zero marker with no head reference cannot be trusted.
  assert.equal(
    coderabbitVerdict({ comments: [clean('No actionable comments were generated')], headSha: SHA }),
    'commented'
  );
});

test('coderabbitVerdict — a rate-limit notice is NOT a review (round-6 P1)', () => {
  // Verbatim shape of the notice this very PR received. It carries the head
  // SHA in its commit-range block, so anything keying on "mentions the head"
  // would have read it as a completed pass.
  const capped = {
    user: { login: 'coderabbitai[bot]' },
    body:
      '<!-- This is an auto-generated comment: rate limited by coderabbit.ai -->\n\n' +
      "> ## Review limit reached\n> `@owner`, you've reached your PR review limit, so we couldn't start this review.\n" +
      `> **Next review available in:** **56 minutes**\n> Your organization has reached its usage spending cap.\n\n` +
      `Reviewing files that changed from the base of the PR and between deadbeef and ${SHA}.`,
  };
  assert.equal(coderabbitVerdict({ comments: [capped], headSha: SHA }), 'limited');
  // And it never satisfies the gate.
  assert.equal(prAllGreen({ ci: 'green', codex: 'present', draft: false, coderabbit: 'limited' }), false);
});

test('coderabbitVerdict — the cap detector reads the STAMP, not prose about caps', () => {
  // This repo's own docs and tests now contain "Review limit reached" and
  // "usage spending cap". A walkthrough quoting them must not jam the gate at
  // CAPPED forever — only CodeRabbit's own HTML stamp counts.
  const quoting = {
    user: { login: 'coderabbitai[bot]' },
    body:
      `**Actionable comments posted: 0**\n\nreviewed up to ${SHA}\n\n` +
      'Walkthrough: adds handling for "Review limit reached" notices and the org usage spending cap.',
  };
  assert.equal(coderabbitVerdict({ comments: [quoting], headSha: SHA }), 'clean');
});

test('coderabbitVerdict — a cap notice outranks a stale clean marker', () => {
  const capped = {
    user: { login: 'coderabbitai[bot]' },
    body: `Actionable comments posted: 0 — ${SHA}\n<!-- rate limited by coderabbit.ai -->\nReview limit reached`,
  };
  // "We couldn't start this review" is a statement about THIS head; reading a
  // cap as a pass is the direction that costs something.
  assert.equal(coderabbitVerdict({ comments: [capped], headSha: SHA }), 'limited');
});

test('trusted bots are exact logins — substrings never pass (CWE-290)', () => {
  const spoofRev = { user: { login: 'codex-fan' }, state: 'APPROVED', commit_id: SHA };
  const spoofCmt = { user: { login: 'my-coderabbit-imitator' }, body: 'Actionable comments posted: 0 ' + SHA };
  assert.equal(codexPresent({ reviews: [spoofRev], comments: [spoofCmt] }), 'none');
  assert.equal(coderabbitVerdict({ reviews: [], comments: [spoofCmt], headSha: SHA }), 'none');
  assert.equal(
    codexPresent({ comments: [{ user: { login: 'chatgpt-codex-connector[bot]' } }] }),
    'present'
  );
});

test('prAllGreen — clean counts, commented never does', () => {
  const base = { ci: 'green', codex: 'present', draft: false };
  assert.equal(prAllGreen({ ...base, coderabbit: 'approved' }), true);
  assert.equal(prAllGreen({ ...base, coderabbit: 'clean' }), true);
  assert.equal(prAllGreen({ ...base, coderabbit: 'commented' }), false);
  assert.equal(prAllGreen({ ...base, coderabbit: 'clean', draft: true }), false);
  assert.equal(prAllGreen({ ...base, coderabbit: 'clean', ci: 'none' }), false);
});
