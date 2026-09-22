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

// ⚠ THE SUITE JOB'S NAME IS A LITERAL ON PURPOSE, AND IT IS NAMED ONCE.
// GitHub pins a branch-protection required check by its LITERAL name, so renaming this job
// is a deliberate PAIRED action — the job, REQUIRED_CHECKS and the protection rule move
// together — which `ci.yml`'s own header already records for the mobile job. DERIVING the
// name instead (find the job whose steps run `npm test`) would let a rename pass here
// SILENTLY, and that is the worse answer: this board would go green while `main` had quietly
// stopped requiring the suite at all. So the literal stays, it is written once, and the two
// guards below name the rename in their failure text — a rename must fail loudly, pointing
// at branch protection, instead of sending the reader after a parse bug that is not there.
const SUITE_JOB = 'Tests (unit + mount)';

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
  // ⚠ THE GATE ASSERTION THAT STOOD HERE IS DELETED, NOT SILENTLY WEAKENED. It read that a
  // cap must never OPEN the gate — true while CodeRabbit gated, and unassertable now that no
  // reviewer does (owner, 2026-08-24). What made it a P1 survives in the line above: 'limited'
  // is its own verdict, so a rate-limit notice naming the head in its commit-range block is
  // still never read as a review that passed. The chip keeps telling the truth about that;
  // nothing gates on the answer any more.
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

test('prAllGreen — the gate is CI + not a draft, and NO reviewer decides it', () => {
  const base = { ci: 'green', draft: false };
  // Sanity at this end: the two properties that DO decide.
  assert.equal(prAllGreen(base), true);
  assert.equal(prAllGreen({ ...base, ci: 'none' }), false);
  assert.equal(prAllGreen({ ...base, ci: 'red' }), false);
  assert.equal(prAllGreen({ ...base, draft: true }), false);
  assert.equal(prAllGreen(), false);
  // ⚠ NO REVIEWER VERDICT MAY MOVE THE ANSWER IN EITHER DIRECTION (owner, 2026-08-24:
  // "no more coderabbit", after Codex on 2026-08-20). Both chips are still computed and
  // still rendered; neither is an input to this function.
  const VERDICTS = ['none', 'approved', 'clean', 'commented', 'changes', 'limited', 'stale',
    'findings', undefined];
  for (const v of VERDICTS) {
    const shown = JSON.stringify(v);
    assert.equal(prAllGreen({ ...base, coderabbit: v }), true,
      'CodeRabbit verdict ' + shown + ' must not close a green non-draft PR');
    assert.equal(prAllGreen({ ...base, codex: v }), true,
      'Codex verdict ' + shown + ' must not close a green non-draft PR');
    assert.equal(prAllGreen({ ci: 'none', draft: false, coderabbit: v, codex: v }), false,
      'verdict ' + shown + ' must not rescue a PR whose CI is not green');
    assert.equal(prAllGreen({ ci: 'green', draft: true, coderabbit: v, codex: v }), false,
      'verdict ' + shown + ' must not rescue a draft');
  }
});

// ⚠ A REVIEW STATE IS NOT THE WHOLE VERDICT. CodeRabbit posts its findings as inline review
// comments and its containing review is often COMMENTED, not CHANGES_REQUESTED — so a
// state-only read returns 'commented' for a head that has open findings on it. As a CHIP
// that was merely vague; as the GATE it would be a false pass.
// ⚠ FAILS CLOSED FOREVER — the same trap as #1914's findings-outrank-clean, one layer over.
// Refuting a finding and re-running the review WITHOUT a new commit leaves the original
// inline comment in place with the same original_commit_id, so "any finding on this head"
// stays true and the head can never pass, no matter how many approvals follow. The REST API
// exposes no thread-resolution state, so ORDER is what settles it: a finding counts only
// while it is NEWER than the latest approval on that head. Same latest-wins shape the Codex
// verdict already uses.
test('coderabbitVerdict — an approval AFTER a finding on the same head clears it', () => {
  const at = (t) => new Date(t).toISOString();
  const inline = (t) => ({ user: { login: 'coderabbitai[bot]' }, original_commit_id: SHA, created_at: at(t) });
  const review = (state, t) => ({ user: { login: 'coderabbitai[bot]' }, state, commit_id: SHA, submitted_at: at(t) });

  // finding, then a re-run that approves — no new commit. The head must be able to pass.
  assert.equal(
    coderabbitVerdict({ reviews: [review('APPROVED', 2000)], reviewComments: [inline(1000)], headSha: SHA }),
    'approved'
  );
  // ...and the other order still closes the gate: a finding filed AFTER the approval is open.
  assert.equal(
    coderabbitVerdict({ reviews: [review('APPROVED', 1000)], reviewComments: [inline(2000)], headSha: SHA }),
    'changes'
  );
  // An approval with no ordering information cannot be shown to answer the finding, and the
  // conservative reading is the one that costs a push rather than a false pass.
  assert.equal(
    coderabbitVerdict({ reviews: [{ user: { login: 'coderabbitai[bot]' }, state: 'APPROVED', commit_id: SHA }], reviewComments: [inline(1000)], headSha: SHA }),
    'changes'
  );
  // A finding with no approval at all is open, whatever its timestamp.
  assert.equal(coderabbitVerdict({ reviews: [], reviewComments: [inline(1000)], headSha: SHA }), 'changes');

  // ⚠ THE LATEST APPROVAL, NOT THE FIRST — a mutation taking the earliest survived until
  // this case existed. Two rounds on one head: finding, approval, another finding, another
  // approval. Against the FIRST approval the second finding still reads open and the head
  // is stranded; against the latest it is answered.
  assert.equal(
    coderabbitVerdict({
      reviews: [review('APPROVED', 2000), review('APPROVED', 4000)],
      reviewComments: [inline(1000), inline(3000)],
      headSha: SHA,
    }),
    'approved'
  );
  // ...and a finding after the LAST approval still closes it, with earlier rounds present.
  assert.equal(
    coderabbitVerdict({
      reviews: [review('APPROVED', 2000), review('APPROVED', 4000)],
      reviewComments: [inline(1000), inline(5000)],
      headSha: SHA,
    }),
    'changes'
  );
});

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

// ⚠ THIS TEST EXISTS BECAUSE THE SAME DEFECT SHIPPED TWICE, FOUR DAYS APART. A gate that
// names a reviewer flips CLOSED the day that reviewer is retired: the verdict pins at 'none'
// forever, and 'none' is the blocking case. #1914 made the gate require a clean CODEX verdict
// days before Codex was dropped (caught while writing the replacement); #1916 replaced it with
// a CODERABBIT pass three days before CodeRabbit was dropped — and that one was NOT caught, so
// /console called every PR not-mergeable regardless of CI from 2026-08-24 until this fix.
// The remedy is not a third reviewer name. It is that the gate reads only what the house
// controls, which is what the loop below pins.
test('prAllGreen — retiring a reviewer cannot close the gate (#1914 / #1916 regression)', () => {
  const RETIRED = ['none', undefined, 'stale', 'findings', 'limited', 'commented', 'changes'];
  for (const cr of RETIRED) {
    for (const cx of RETIRED) {
      assert.equal(prAllGreen({ ci: 'green', draft: false, coderabbit: cr, codex: cx }), true,
        'a green non-draft PR must stay mergeable with coderabbit=' + JSON.stringify(cr) +
        ' codex=' + JSON.stringify(cx));
    }
  }
  // Sanity at the far end, so a function stuck returning true would not pass this test.
  assert.equal(prAllGreen({ ci: 'none', draft: false }), false);
  assert.equal(prAllGreen({ ci: 'green', draft: true }), false);
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
test('the flight route feeds the chips their data, and the gate no reviewer at all', () => {
  const src = readFileSync(new URL('../src/app/api/console/flight/route.ts', import.meta.url), 'utf8');
  assert.match(src, /pulls\/\$\{p\.number\}\/comments/,
    'the route must fetch the PR review comments — inline findings live there');
  assert.match(src, /coderabbitVerdict\(\{[^}]*reviewComments/,
    'reviewComments must reach coderabbitVerdict, or head findings are invisible to the chip');
  // ⚠ AND THE INVERSE IS NOW THE LOAD-BEARING HALF. No reviewer has GATED since 2026-08-24 —
  // which is not the same as nobody reviewing, and CodeRabbit is run again by ruling (owner,
  // 2026-09-21). The way this defect comes back is someone wiring a verdict in AT THE CALL SITE — which
  // no unit test of prAllGreen can see, because every one of them builds its own argument.
  // Twice now a retired reviewer's permanent 'none' has closed the gate on every green PR, so
  // the absence is asserted where the bug actually travels.
  assert.doesNotMatch(src, /prAllGreen\(\{[^}]*coderabbit/,
    'prAllGreen must NOT be fed a CodeRabbit verdict — no reviewer gates (owner, 2026-08-24)');
  assert.doesNotMatch(src, /prAllGreen\(\{[^}]*codex/,
    'prAllGreen must NOT be fed a Codex verdict — no reviewer gates (owner, 2026-08-20)');
});

// ⚠ REQUIRED_CHECKS WAS A HAND-TYPED COPY OF A LIST THE TREE ALREADY DECLARES, AND IT
// HAD GONE STALE IN THE DIRECTION THAT OPENS THE GATE. `ci.yml` runs FOUR jobs and the
// array named three; the missing one is `Tests (unit + mount)`, which installs both
// node_modules trees and is the only job that executes a React component, so the entire
// suite and every mount test were invisible to the board. Driven against the shipped
// rules before the fix: three green checks beside a FAILING suite returned gate 'green'
// and prAllGreen true — Mission Control answering "safe to merge" over a red suite.
// Derived here rather than re-typed, so a fifth job fails this test instead of silently
// widening the blind spot. The repo has now paid three times for a gate that names a
// list somebody has to remember to update.
// ⚠ AND IT IS DERIVED FROM THE JOBS RATHER THAN FROM EITHER DOCUMENTED "REQUIRED
// CHECKS" LIST, BECAUSE THE TWO PROSE LISTS DISAGREE WITH EACH OTHER. ci.yml's own
// header says to require Web, Mobile and Tests — omitting gitleaks, which the house
// records prove IS required (a merge 405'd on it on 2026-07-19). docs/WORKLOG.md's
// auto-loaded conventions say Web, Mobile and gitleaks — omitting Tests, with a later
// correction noting CI has four jobs. Neither names all four; between them they name
// all four. The job table is the only list that cannot be stale, and it is a superset
// of both, so a board built on it is never LOOSER than whatever protection requires.
test('REQUIRED_CHECKS is every job ci.yml runs, derived from the workflow', () => {
  const yml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  // ⚠ SCOPED TO THE `jobs:` BLOCK, because the first version of this guard was not and
  // was RIGHT BY ACCIDENT. Over the whole file it matched `pull_request:` under `on:` —
  // also a two-space key — and paired it with the first four-space `name:` it found,
  // which happens to be the web job's. The name list came out correct while the KEY it
  // came from was wrong, and reordering `on:` would silently change the answer.
  const block = yml.slice(yml.indexOf('\njobs:'));
  assert.ok(block.length > 200, 'ci.yml has no jobs: block — this sweep has stopped matching');
  // A job's display name is the `name:` at four-space indent under its two-space key;
  // a step's `name:` is deeper and carries a leading `- `.
  const keys = [...block.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
  const pairs = [...block.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$\n(?:.*\n)*?^ {4}name: (.+)$/gm)]
    .map((m) => [m[1], m[2].trim()]);
  // ⚠ THAT CAPTURE IS RAW TEXT, NOT THE SCALAR YAML RESOLVES — and GitHub names a check by
  // the RESOLVED value. `name: Tests (unit + mount) # suite` resolves to `Tests (unit +
  // mount)`; a quoted, anchored, aliased, tagged or block scalar resolves to something else
  // again. Left alone, this guard could extract a name that is not the check's name, and an
  // edit that then "fixed" REQUIRED_CHECKS to match the bad extraction would leave this test
  // GREEN while the board could not recognise the real check — the same silent false green
  // this file exists to close, one level down. (CodeRabbit, #2143.)
  // ⚠ A YAML PARSER WAS THE OTHER REMEDY AND IS DECLINED ON A MEASUREMENT, not a preference:
  // this repo has no yaml parser in `dependencies` or `devDependencies` and none installed
  // even transitively, so that route adds a package to every `npm ci` for one assertion.
  // Refusing what cannot be resolved costs nothing and keeps the guard fail-loud, which is
  // the only property it is here for. Every form below is REFUSED rather than guessed at, so
  // a future job name in one of them stops the suite with a remedy instead of passing wrong.
  const unresolvable = (raw) => {
    if (/^["'&*!|>%@`#{}[\],]/.test(raw)) return 'not a plain scalar (quoted, anchored, aliased, tagged, block or flow)';
    if (/\s#/.test(raw)) return 'carries a trailing `#` comment, which YAML strips and this regex keeps';
    return null;
  };
  const unreadable = pairs.map(([k, raw]) => [k, raw, unresolvable(raw)]).filter((x) => x[2]);
  assert.deepEqual(unreadable, [],
    'a job `name:` in ci.yml is not a plain single-line scalar, so the text after `name:` is ' +
    'NOT the name GitHub will report. This guard refuses to guess:\n' +
    unreadable.map(([k, raw, why]) => `  ${k}: ${JSON.stringify(raw)} — ${why}`).join('\n') +
    '\n  Fix by writing the job name as a plain unquoted scalar, or teach this guard to ' +
    'resolve the form (a real YAML parse) — never by editing REQUIRED_CHECKS to match the ' +
    'raw text, which is how the board stops matching the real check.');
  const jobs = pairs.map((x) => x[1]);
  // ⚠ THE VACUITY FLOORS IN THIS TEST ARE BELT-AND-BRACES, measured rather than implied:
  // with both parses degraded to nothing AND every floor removed, this test still FAILS,
  // because the final comparison puts four names against an empty list and
  // REQUIRED_CHECKS can never be empty. They earn their place by naming the failure
  // precisely — a dead parse rather than a mismatched board — instead of printing a
  // confusing list diff. Kept for the message, not for the coverage.
  assert.ok(keys.length >= 3,
    `expected ci.yml's job keys, parsed ${keys.length} — this sweep has stopped matching`);
  // ⚠ EVERY KEY MUST HAVE YIELDED A NAME, or the hole re-opens from the other side: a job
  // declared with no `name:` reports its KEY as the check name on GitHub, so it would be
  // absent from this list, absent from REQUIRED_CHECKS, and invisible to the board — with
  // this guard green, because the two short lists would still agree.
  assert.deepEqual(pairs.map((x) => x[0]), keys,
    'a job in ci.yml yielded no display name. GitHub then reports it by its KEY, and a ' +
    'job the board cannot name is a job it cannot judge:\n  keys  ' + JSON.stringify(keys) +
    '\n  named ' + JSON.stringify(pairs.map((x) => x[0])));
  assert.ok(jobs.includes(SUITE_JOB),
    `ci.yml declares no job named ${JSON.stringify(SUITE_JOB)}. Either the parse above has ` +
    'stopped matching — in which case this guard would pass vacuously on the one name it ' +
    'exists to protect — or the job was RENAMED. A rename is a paired action: change it here, ' +
    'in REQUIRED_CHECKS, and in the branch-protection required check on `main`, which pins ' +
    'the literal old name and silently stops requiring the suite otherwise.\n  ci.yml ' +
    JSON.stringify([...jobs].sort()));
  assert.deepEqual([...REQUIRED_CHECKS].sort(), [...jobs].sort(),
    'REQUIRED_CHECKS must be exactly the jobs ci.yml runs. A job the board does not ' +
    'know about cannot turn its gate red, running or incomplete — it is simply not ' +
    'judged, and the PR reads green over it:\n  ci.yml  ' + JSON.stringify([...jobs].sort()) +
    '\n  console ' + JSON.stringify([...REQUIRED_CHECKS].sort()));
});

// The defect itself, replayed — so the suite is proven to catch it rather than merely
// to be green after the fix. Each of the three states a missed job can be in was a
// FALSE GREEN, and each is its own case because they reach different arms of the rule.
test('a red, running or absent suite job is never a green gate', () => {
  // ⚠ GUARD-THE-GUARD, and it is the difference between a useful failure and a misleading
  // one. If SUITE_JOB ever stops matching an entry in REQUIRED_CHECKS — a rename — this
  // filter silently yields the WHOLE array, every case below then runs with the suite
  // present twice, and the first assertion fails as "a FAILING suite must block the board":
  // true, unhelpful, and naming neither the cause nor the fix. Caught here instead.
  const others = REQUIRED_CHECKS.filter((n) => n !== SUITE_JOB).map((n) => run(n));
  assert.equal(others.length, REQUIRED_CHECKS.length - 1,
    `REQUIRED_CHECKS does not contain ${JSON.stringify(SUITE_JOB)}, so this test is no longer ` +
    'removing the suite from the set — every case below would run with it still present. If ' +
    'the job was renamed, rename it here, in REQUIRED_CHECKS and in branch protection.');

  const red = gateFromRuns([...others, run(SUITE_JOB, 'failure')]);
  assert.equal(red, 'red', 'a FAILING suite must block the board');
  assert.equal(prAllGreen({ ci: red, draft: false }), false);

  const running = gateFromRuns([...others, run(SUITE_JOB, null, 'in_progress')]);
  assert.equal(running, 'running', 'a suite still running is not a pass');
  assert.equal(prAllGreen({ ci: running, draft: false }), false);

  const absent = gateFromRuns(others);
  assert.equal(absent, 'none', 'a suite with no record at all is an unread gate, not a passed one');
  assert.equal(prAllGreen({ ci: absent, draft: false }), false);
});
