// Mission Control flight gates — the pure decision rules behind
// /api/console/flight, extracted so every review-round P1 lives as TESTED
// logic (tests/console-flight.test.mjs), not route plumbing:
//
//   1. CI is green ONLY when every required check is present by name and
//      successful — a subset (mid-registration, a rename, a job that never
//      registered) can never read green (Codex P1).
//   2. A CodeRabbit verdict counts ONLY on the current head, and a CLEAN pass
//      is recognized from the edited-in-place summary comment — a clean
//      review submits no APPROVED record (the house clean-review-leaves-no-
//      record rule; Codex P1). Trusted bots are matched by EXACT login, never
//      substring — anyone can comment on a public repo (CodeRabbit CWE-290).
//   3. A reviewer that was PREVENTED from running is its own state, never a
//      verdict: a rate-limit/spending-cap notice edits the same summary and
//      carries the head SHA, so it reads exactly like a completed pass to
//      anything less careful (Codex P1).
//
// The through-line: an unread gate is not a passed gate.

export const REQUIRED_CHECKS = [
  'Web (typecheck + build)',
  'Mobile (build + public/m sync)',
  'Secret scan (gitleaks)',
];

// Exact, case-normalized bot identities (as they post on this repo).
export const CODERABBIT_BOTS = ['coderabbitai[bot]'];

// CodeRabbit's two ways of saying "nothing to report" — both are in use, and
// the house records (docs/HANDOFF-2026-06-22.md) name the pair.
const CR_CLEAN_RE = /actionable comments posted:\s*0\b|no actionable comments were generated/i;

// ...and its way of saying it never ran: the HTML marker CodeRabbit stamps
// into the summary it edits in place. Deliberately ONLY the stamp, not the
// prose ("Review limit reached", "usage spending cap") — those sentences now
// live in this repo's own docs and tests, and a walkthrough that quoted them
// would jam the gate at CAPPED forever. The stamp is CodeRabbit's, not ours.
const CR_LIMIT_RE = /<!--[^>]*rate limited by coderabbit\.ai[^>]*-->/i;

export const CODEX_BOTS = ['chatgpt-codex-connector[bot]'];

// Conclusions that mean the check did not pass. `startup_failure` / `stale`
// are the ones that bite: GitHub marks them `completed`, so a presence-only
// gate would read them as green (round-2 Codex P1).
const BAD = ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'];

/** @param {unknown} login @param {string[]} allow */
function isTrusted(login, allow) {
  return allow.includes(String(login || '').toLowerCase());
}

/**
 * Overall CI gate from a commit's check runs.
 * Red / running are judged on the required checks (falling back to all runs
 * when none of the required names registered — a failure is a failure under
 * any name). GREEN is the strict case: every required check present by name
 * AND each one completed with conclusion exactly 'success'. Anything else —
 * partial coverage, a `neutral`/`skipped`/null conclusion, a completed-but-
 * not-successful run — reads 'none'. No complete record is never a pass.
 * @param {Array<{name?: string, status?: string, conclusion?: string | null}>} runs
 * @returns {'green' | 'red' | 'running' | 'none'}
 */
export function gateFromRuns(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const required = list.filter((r) => REQUIRED_CHECKS.includes(String(r?.name)));
  const judged = required.length ? required : list;
  if (judged.some((r) => BAD.includes(String(r?.conclusion)))) return 'red';
  if (judged.length && judged.some((r) => r?.status !== 'completed')) return 'running';
  const passed = new Set(
    required.filter((r) => r?.status === 'completed' && r?.conclusion === 'success').map((r) => String(r.name))
  );
  return REQUIRED_CHECKS.every((n) => passed.has(n)) ? 'green' : 'none';
}

/**
 * CodeRabbit's verdict for the CURRENT head only.
 * - A review record (APPROVED / CHANGES_REQUESTED) counts only when its
 *   commit_id IS the head SHA — stale approvals from an earlier push demote
 *   to 'commented'.
 * - A clean pass leaves no review record: CodeRabbit edits its summary
 *   comment in place. We accept 'clean' only when that summary carries a zero
 *   marker AND provably references the current head SHA; otherwise the honest
 *   read is 'commented', which never satisfies a gate. BOTH of CodeRabbit's
 *   zero markers count — `docs/HANDOFF-2026-06-22.md` records the pair, and
 *   `docs/WORKLOG.md` (2026-06-24) warns that polling for one literal string
 *   misses in-place edits and clean 0-issue reviews.
 * - A rate-limit / spending-cap notice is NOT a review — CodeRabbit says in so
 *   many words that it "couldn't start this review". That reads 'limited',
 *   its own state, because the response differs: findings get addressed, a cap
 *   gets waited out or raised. The same WORKLOG entry records a merge made on
 *   a cap notice mistaken for a pass; treating it as any flavour of reviewed
 *   is how that happens. It is head-pinned like everything else here — a cap
 *   that has since cleared must not strand later pushes at CAPPED.
 * @param {{reviews?: Array<{user?: {login?: string}, state?: string, commit_id?: string}>,
 *          comments?: Array<{user?: {login?: string}, body?: string}>,
 *          headSha?: string}} args
 * @returns {'approved' | 'clean' | 'changes' | 'commented' | 'limited' | 'none'}
 */
export function coderabbitVerdict({ reviews, comments, headSha } = {}) {
  const sha = String(headSha || '');
  const revs = (Array.isArray(reviews) ? reviews : []).filter((r) =>
    isTrusted(r?.user?.login, CODERABBIT_BOTS)
  );
  const onHead = sha ? revs.filter((r) => String(r?.commit_id || '') === sha) : [];
  const last = onHead[onHead.length - 1];
  if (last?.state === 'CHANGES_REQUESTED') return 'changes';
  if (last?.state === 'APPROVED') return 'approved';

  const summaries = (Array.isArray(comments) ? comments : []).filter((c) =>
    isTrusted(c?.user?.login, CODERABBIT_BOTS)
  );
  const short = sha.slice(0, 7);
  let limited = false;
  for (const c of summaries) {
    const body = String(c?.body || '');
    // Head-pinned exactly like the clean markers: a cap notice is a statement
    // about the head it names. CodeRabbit keeps its commit-range current while
    // capped, so a live cap still matches; an OLD notice left behind by a
    // cleared cap says nothing about this head and must not strand the chip.
    const onThisHead = !!sha && (body.includes(sha) || (short.length === 7 && body.includes(short)));
    // Checked first and allowed to dominate a zero-marker in the same body:
    // reading a cap as a pass is the failure direction that costs something.
    if (CR_LIMIT_RE.test(body)) {
      if (onThisHead) limited = true;
      continue;
    }
    if (!CR_CLEAN_RE.test(body)) continue;
    if (onThisHead) return 'clean';
  }
  if (limited) return 'limited';
  if (revs.length || summaries.length) return 'commented';
  return 'none';
}

/**
 * Codex presence — exact bot identity only.
 *
 * Presence, NOT freshness, and that is a ruling (owner, 2026-07-27) rather
 * than an oversight: Codex leaves no record at all when it is clean — it
 * reacts 👍 on the triggering comment — so head-pinning it the way
 * coderabbitVerdict is head-pinned would jam every clean pass at 'none' and
 * the gate could never open. That is the same false-negative that cost a P1
 * here. The house gate treats a stale Codex pass as the owner's re-trigger
 * call, so the board reports the record that exists rather than guessing.
 * (Registered, not built: read reactions to pin freshness without the trap.)
 * @param {{reviews?: Array<{user?: {login?: string}}>,
 *          comments?: Array<{user?: {login?: string}}>}} args
 * @returns {'present' | 'none'}
 */
export function codexPresent({ reviews, comments } = {}) {
  const hit = (l) => isTrusted(l, CODEX_BOTS);
  const inRevs = (Array.isArray(reviews) ? reviews : []).some((r) => hit(r?.user?.login));
  const inCmts = (Array.isArray(comments) ? comments : []).some((c) => hit(c?.user?.login));
  return inRevs || inCmts ? 'present' : 'none';
}

/**
 * AWAITING YOUR WORD = every gate genuinely green: CI full-coverage green,
 * CodeRabbit approved OR clean (both are real verdicts on the head), Codex
 * present, and not a draft.
 * @param {{ci?: string, coderabbit?: string, codex?: string, draft?: boolean}} p
 */
export function prAllGreen({ ci, coderabbit, codex, draft } = {}) {
  return (
    ci === 'green' &&
    (coderabbit === 'approved' || coderabbit === 'clean') &&
    codex === 'present' &&
    !draft
  );
}
