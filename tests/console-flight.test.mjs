// Flight gates — both review-round P1s pinned here, plus the spoof vector.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REQUIRED_CHECKS,
  gateFromRuns,
  coderabbitVerdict,
  codexVerdict,
  nextPageUrl,
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
  // ⚠ AND A CAP MUST NEVER OPEN THE GATE. This was the claim that made it a P1: a rate-limit
  // notice names the head in its commit-range block, so anything keying on "mentions the
  // head" reads a review that never ran as a review that passed. Now that CodeRabbit gates
  // again, the assertion is live rather than structural.
  assert.equal(prAllGreen({ ci: 'green', coderabbit: 'limited', draft: false }), false);
});

test('coderabbitVerdict — a cap that has since cleared does not strand later pushes (round-7 P2)', () => {
  const OLD = 'deadbeef' + SHA.slice(8);
  const staleCap = {
    user: { login: 'coderabbitai[bot]' },
    body: `<!-- rate limited by coderabbit.ai -->\nReview limit reached.\n\nbetween base and ${OLD}.`,
  };
  // The notice names an older head, so it says nothing about this one: no
  // verdict yet, not "still capped".
  assert.equal(coderabbitVerdict({ comments: [staleCap], headSha: SHA }), 'commented');
  // A live cap keeps its commit-range current, so it still reads limited.
  assert.equal(
    coderabbitVerdict({
      comments: [{ ...staleCap, body: staleCap.body.replace(OLD, SHA) }],
      headSha: SHA,
    }),
    'limited'
  );
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
  assert.equal(codexVerdict({ reviews: [spoofRev], comments: [spoofCmt], headSha: SHA }), 'none');
  assert.equal(coderabbitVerdict({ reviews: [], comments: [spoofCmt], headSha: SHA }), 'none');
  assert.equal(
    codexVerdict({ comments: [{ user: { login: 'chatgpt-codex-connector[bot]' } }], headSha: SHA }),
    'stale'
  );
});

// ── Codex is now the gate, and it is HEAD-PINNED ────────────────────────────────────────
// ⚠ THE RULING THIS REPLACES RESTED ON A PREMISE THAT IS FALSE. `codexPresent` was
// presence-only because "Codex leaves no record at all when it is clean — it reacts a
// thumbs-up on the triggering comment", so head-pinning it "would jam every clean pass at
// none". Measured across every PR from #1840 (2026-07-26) to #1912: EVERY clean Codex
// verdict posts an issue comment carrying "Reviewed commit: <sha>", and ZERO trigger
// comments carry a thumbs-up reaction. The record the ruling says does not exist is the
// record Codex has always left, and it names the commit.
//
// So the strictness was backwards: the reviewer the process calls THE GATE could be
// satisfied by a review eight commits old, while the one the process calls "not a gate"
// blocked on the head. #1910 merged on a Codex pass from six commits earlier and was green
// under the old function. These pin the corrected reading.
const CODEX = 'chatgpt-codex-connector[bot]';
const REVIEWED = (sha) => '**Reviewed commit:** `' + sha + '`';
const cxClean = (sha) => ({ user: { login: CODEX }, body: 'Codex Review: Did not find any major issues. Nice work!\n\n' + REVIEWED(sha) });
const cxFinds = (sha) => ({ user: { login: CODEX }, state: 'COMMENTED', commit_id: sha, body: 'Codex Review\n\nHere are some automated review suggestions.\n\n' + REVIEWED(sha) });
const OLD = 'aaaaaaaaaa1111111111222222222233333333cc';

test('codexVerdict — a clean pass counts ONLY on the current head', () => {
  assert.equal(codexVerdict({ comments: [cxClean(SHA)], headSha: SHA }), 'clean');
  // The hole this closes: a clean verdict from an earlier push is NOT a verdict on this
  // head. Under codexPresent it returned 'present' and opened the gate — which Codex no
  // longer does at all, so this now protects the CHIP's honesty rather than the gate's.
  assert.equal(codexVerdict({ comments: [cxClean(OLD)], headSha: SHA }), 'stale');
});

test('codexVerdict — the commit is read from the body, abbreviated or full', () => {
  // Codex abbreviates to 10 chars in practice; the head we hold is the full 40.
  assert.equal(codexVerdict({ comments: [cxClean(SHA.slice(0, 10))], headSha: SHA }), 'clean');
  // ...and a 7-char floor, so a 2-char "prefix" can never accidentally match a head.
  assert.equal(codexVerdict({ comments: [cxClean(SHA.slice(0, 2))], headSha: SHA }), 'stale');
});

// ⚠ THE 7-CHAR FLOOR SURVIVED MUTATION UNTIL THIS TEST EXISTED. The body path is already
// guarded by the regex's own {7,40}, so dropping the floor changed no outcome and the line
// read as dead. It is not: `commit_id` comes straight from GitHub and never passes through
// that regex, so it is the one path where a too-short value can reach the prefix compare.
test('codexVerdict — a short commit_id can never masquerade as a head prefix', () => {
  const short = {
    user: { login: CODEX },
    state: 'COMMENTED',
    commit_id: SHA.slice(0, 3),
    body: 'Codex Review: here are some automated review suggestions.',
  };
  assert.equal(codexVerdict({ reviews: [short], headSha: SHA }), 'stale');
});

test('codexVerdict — findings on the head are FINDINGS (chip only; Codex no longer gates)', () => {
  assert.equal(codexVerdict({ reviews: [cxFinds(SHA)], headSha: SHA }), 'findings');
  // Findings on an OLD head, nothing on this one — still not a pass for this head.
  assert.equal(codexVerdict({ reviews: [cxFinds(OLD)], headSha: SHA }), 'stale');
});

test('codexVerdict — with no timestamps to order them, findings outrank a clean marker', () => {
  // Order cannot be established, so fail CLOSED: reading a findings round as a pass is the
  // direction that costs something, exactly as CR_LIMIT_RE outranks a zero-marker above.
  // When the records DO carry timestamps, latest-wins governs instead — see below.
  assert.equal(
    codexVerdict({ reviews: [cxFinds(SHA)], comments: [cxClean(SHA)], headSha: SHA }),
    'findings'
  );
});
// ⚠ FAIL-CLOSED BECAME FAIL-CLOSED-FOREVER, which is its own defect. Refuting a finding
// and re-triggering WITHOUT a new commit is a real round: both the findings review and the
// later clean comment then name the SAME head. Returning on the first findings record made
// that historical round permanently outrank the verdict that cleared it, so the gate could
// never open for a head Codex had explicitly passed. The rule is LATEST-WINS for the head.
test('codexVerdict — the NEWEST verdict for the head wins, not the first one seen', () => {
  const at = (r, t) => ({ ...r, submitted_at: t, created_at: t });
  const early = at(cxFinds(SHA), '2026-08-20T10:00:00Z');
  const later = at(cxClean(SHA), '2026-08-20T11:00:00Z');
  assert.equal(codexVerdict({ reviews: [early], comments: [later], headSha: SHA }), 'clean');

  // ...and the other order still closes it: a clean pass followed by a NEW findings round
  // on the same head is a gate that must shut again.
  const clearFirst = at(cxClean(SHA), '2026-08-20T10:00:00Z');
  const findsLater = at(cxFinds(SHA), '2026-08-20T11:00:00Z');
  assert.equal(
    codexVerdict({ reviews: [findsLater], comments: [clearFirst], headSha: SHA }),
    'findings'
  );
});

test('codexVerdict — no record is not a verdict, and neither is an unreadable one', () => {
  assert.equal(codexVerdict({ headSha: SHA }), 'none');
  assert.equal(codexVerdict({ reviews: [], comments: [], headSha: SHA }), 'none');
  // A Codex record naming no commit at all cannot be pinned to this head. It must not
  // read as clean — fail CLOSED, and let the board ask for a re-trigger.
  assert.equal(
    codexVerdict({ comments: [{ user: { login: CODEX }, body: 'Codex Review: Nice work!' }], headSha: SHA }),
    'stale'
  );
  // ⚠ And with no head to pin against, nothing can be confirmed.
  assert.equal(codexVerdict({ comments: [cxClean(SHA)] }), 'stale');
});

test('codexVerdict — trusted login is exact; a substring never passes (CWE-290)', () => {
  const spoof = { user: { login: 'codex-fan' }, body: 'Did not find any major issues ' + REVIEWED(SHA) };
  assert.equal(codexVerdict({ comments: [spoof], headSha: SHA }), 'none');
});

test('prAllGreen — the gate is CI + a CODERABBIT PASS ON THIS HEAD', () => {
  const base = { ci: 'green', draft: false };
  // The two ways CodeRabbit says "nothing to report". Measured across the last 18 merged
  // PRs: APPROVED is the only signal it emits reliably on a clean head (2 of 2 clean heads
  // approved), and the head-pinned zero-marker is the other, rarer one.
  assert.equal(prAllGreen({ ...base, coderabbit: 'approved' }), true);
  assert.equal(prAllGreen({ ...base, coderabbit: 'clean' }), true);
  // ⚠ 'commented' is NOT a pass. Its summary line is edited in place and is NOT head-pinned:
  // #1915 merged with the PR-wide line still reading "Actionable comments posted: 2" while
  // the head review was APPROVED with zero inline findings. Reading that as a verdict on
  // this head is how a cap or a stale sweep gets mistaken for a pass.
  assert.equal(prAllGreen({ ...base, coderabbit: 'commented' }), false);
  assert.equal(prAllGreen({ ...base, coderabbit: 'changes' }), false);
  assert.equal(prAllGreen({ ...base, coderabbit: 'limited' }), false);
  assert.equal(prAllGreen({ ...base, coderabbit: 'none' }), false);
  assert.equal(prAllGreen({ ...base, coderabbit: 'approved', draft: true }), false);
  assert.equal(prAllGreen({ ...base, coderabbit: 'approved', ci: 'none' }), false);
  // ⚠ CODEX NO LONGER GATES, and a Codex verdict must not open the gate on its own — the
  // house stopped using it, so a clean Codex record says nothing about whether this head
  // was reviewed at all.
  assert.equal(prAllGreen({ ...base, codex: 'clean' }), false);
  assert.equal(prAllGreen({ ...base, codex: 'clean', coderabbit: 'changes' }), false);
});

// ⚠ A REVIEW STATE IS NOT THE WHOLE VERDICT. CodeRabbit posts its findings as inline review
// comments and its containing review is often COMMENTED, not CHANGES_REQUESTED — so a
// state-only read returns 'commented' for a head that has open findings on it. As a CHIP
// that was merely vague; as the GATE it would be a false pass.
test('coderabbitVerdict — inline findings anchored on the head are CHANGES', () => {
  const inline = (sha) => ({ user: { login: 'coderabbitai[bot]' }, original_commit_id: sha });
  assert.equal(
    coderabbitVerdict({ reviews: [cr('COMMENTED')], reviewComments: [inline(SHA)], headSha: SHA }),
    'changes'
  );
  // An approval cannot outrank an open finding on the SAME head.
  assert.equal(
    coderabbitVerdict({ reviews: [cr('APPROVED')], reviewComments: [inline(SHA)], headSha: SHA }),
    'changes'
  );
  // ⚠ Anchored on an EARLIER push — that finding was answered by the push that moved the
  // head, so it must not strand the gate. This is the original_commit_id rule.
  const OLD = 'deadbeef' + SHA.slice(8);
  assert.equal(
    coderabbitVerdict({ reviews: [cr('APPROVED')], reviewComments: [inline(OLD)], headSha: SHA }),
    'approved'
  );
  // A human's inline comment is not a CodeRabbit finding.
  assert.equal(
    coderabbitVerdict({
      reviews: [cr('APPROVED')],
      reviewComments: [{ user: { login: 'cperry8800-droid' }, original_commit_id: SHA }],
      headSha: SHA,
    }),
    'approved'
  );
});

// ⚠ THE UNSATISFIABILITY THIS ONCE FIXED HAS DISSOLVED, AND THE GATE SWAPPED BACK. The old
// contradiction was that `coderabbitVerdict` is head-pinned while the house ran CodeRabbit
// ONCE as a breadth sweep — so the sweep stopped counting the moment a fix for its own
// findings was pushed. Codex is no longer used at all (owner, 2026-08-20), and CodeRabbit is
// re-triggered every round, so head-pinning is exactly what a gate wants: it now says
// "this head was reviewed and passed" rather than "some head once was".
test('prAllGreen — CODEX does NOT gate, whatever its verdict', () => {
  const base = { ci: 'green', coderabbit: 'approved', draft: false };
  for (const v of ['clean', 'findings', 'stale', 'none', undefined]) {
    assert.equal(prAllGreen({ ...base, codex: v }), true,
      'Codex verdict ' + JSON.stringify(v) + ' must not decide the gate');
  }
  // ...and it cannot rescue a head CodeRabbit has not passed.
  for (const v of ['clean', 'findings', 'stale', 'none', undefined]) {
    assert.equal(prAllGreen({ ...base, coderabbit: 'commented', codex: v }), false,
      'Codex verdict ' + JSON.stringify(v) + ' must not open the gate on its own');
  }
});

// ⚠ A RECORD CAP ON A LATEST-WINS GATE IS A CORRECTNESS BUG, NOT A LATENCY TRADE.
// Reviews and comments are fetched separately, so a five-page ceiling could keep a clean
// COMMENT for the head while the later findings REVIEW fell outside the reviews window —
// reporting 'clean' and marking the PR ready. The first version of this change asserted in
// its own comment that missing records could only ever read 'stale'. That claim was FALSE,
// and Codex refuted it. Pagination now runs to exhaustion, and the Link header is the only
// thing that knows where the end is.
test('nextPageUrl — follows rel=next and stops when there is none', () => {
  const nxt = '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"';
  assert.equal(nextPageUrl(nxt), 'https://api.github.com/x?page=2');

  // The LAST page carries prev/first and no next — this is the terminating condition.
  const end = '<https://api.github.com/x?page=8>; rel="prev", <https://api.github.com/x?page=1>; rel="first"';
  assert.equal(nextPageUrl(end), null);

  // ⚠ Absent header must terminate, not loop: a single-page response has no Link at all.
  assert.equal(nextPageUrl(''), null);
  assert.equal(nextPageUrl(null), null);
  assert.equal(nextPageUrl(undefined), null);

  // "nextish" rels must not match — only the exact relation ends the walk correctly.
  assert.equal(nextPageUrl('<https://api.github.com/x?page=2>; rel="nextish"'), null);
  // ...and whitespace variants that GitHub is entitled to emit still parse.
  assert.equal(
    nextPageUrl('<https://api.github.com/x?page=3> ;  rel = "next"'),
    'https://api.github.com/x?page=3'
  );
});

// ⚠ A TEST THAT SUPPLIES THE INPUT CANNOT SEE THE WIRING. Every verdict test above hands
// `reviewComments` in by hand, so all of them stay green if the route never fetches them —
// and the gate would then read APPROVED for a head with open findings on it. This asserts
// the real call site.
test('the flight route feeds the gate what the gate now reads', () => {
  const src = readFileSync(new URL('../src/app/api/console/flight/route.ts', import.meta.url), 'utf8');
  assert.match(src, /pulls\/\$\{p\.number\}\/comments/,
    'the route must fetch the PR review comments — inline findings live there');
  assert.match(src, /coderabbitVerdict\(\{[^}]*reviewComments/,
    'reviewComments must reach coderabbitVerdict, or head findings are invisible to it');
  assert.match(src, /prAllGreen\(\{[^}]*coderabbit/,
    'prAllGreen must be given the CodeRabbit verdict — it is the gate now');
});
