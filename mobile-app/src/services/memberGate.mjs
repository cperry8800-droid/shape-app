// Who gets into the app, what a membership lookup leaves an account as, and what a paid feature
// says when it is locked. Pure, so tests/app-membership-gate.test.mjs drives the shell's own rules.
//
// ⚠ AN ACCOUNT IS THE GATE; THE MEMBERSHIP IS NOT (owner, 2026-11-10). The app needs an account,
// and a signed-in adult account that has not paid is a free account that gets in: logging,
// Home, programs, the leaderboards, the coaches and messaging them, and help-desk Nora. The
// $5 membership (or an approved coach, or an admin) adds the paid features: assistant Nora and
// her voice, Shape Radio, the AI helpers, Cook Mode's voice and the points Store. There is no free
// trial. The one way in with no account is the welcome's Preview at the app's URL (owner,
// 2026-11-13): the app on its demo data behind a banner, decided in the shell, not by this gate.
//
// ⚠ PAST DUE IS FREE. A member whose $5 renewal failed while Stripe retries keeps the account and
// every free feature, and loses the paid ones until the card is updated. The server answers
// `pastDue: true` (with `member: false`) on /api/me/membership, and a paid route answers 402
// `payment_past_due` instead of `membership_required`, so the app can say which it is.

/**
 * The gate: an approved coach is in; anyone else waits for the session restore, and then a
 * signed-in account is in, paid or not. While a signed-in account's first membership answer is
 * on its way the shell holds (that answer also says whether the account is a known minor); a
 * failed or slow lookup ends the hold without keeping anyone out.
 */
export function bsAccountGate({ isApprovedCoach, authReady, signedIn, membership }) {
  if (isApprovedCoach) return { allowed: true, loading: false };
  if (!authReady) return { allowed: false, loading: true };
  if (!signedIn) return { allowed: false, loading: false };
  return { allowed: true, loading: !!(membership && membership.loading) };
}

/**
 * The flags the shell publishes for every screen: `canChat` (window.ShapeCanChat, any signed-in
 * account: messaging is free), `paid` (window.ShapePaid: Shape Radio, the Store, the AI helpers,
 * the full leaderboard), `nora` (window.ShapeNora: assistant Nora) and `pastDue`
 * (window.ShapePastDue). `paid` and `nora` are undefined until the account's answer is known, so a
 * screen that locks on an explicit `false` never locks a member on the first frames of a cold launch.
 *
 * ⚠ ASSISTANT NORA IS PAID ONLY (owner, 2026-11-10): an active $5 plan, an approved coach, an admin
 * or an account paying a coach. A free account never has her, not even for a while: the server's
 * `nora` is the paid features (`member`), and a free account meets her paid lock (Join, or Update
 * your card when past due).
 */
// ⚠ NO ACCOUNT IS KNOWN UNPAID, NOT UNKNOWN (Codex P2 on #2734). With the welcome's Preview a session
// with no account is in the app, and a paid screen locks only on an explicit `false`: `undefined`
// left the points Store open to the demo profile (redeem, shipping details) until an unauthenticated
// request failed. `false` shows each paid screen's lock, whose Join opens account creation
// (BSPaidLock's __bsGoAuth('create')).
export function bsPaidFlags({ signedIn, isApprovedCoach, membership }) {
  if (!signedIn) return { canChat: false, paid: false, pastDue: false, nora: false };
  if (isApprovedCoach) return { canChat: true, paid: true, pastDue: false, nora: true };
  const m = membership || {};
  if (m.loading || typeof m.active !== 'boolean') return { canChat: true, paid: undefined, pastDue: false, nora: undefined };
  const paid = m.active === true;
  // `nora` unknown (no lookup has answered yet) stays undefined, which never locks: only a false does.
  const nora = paid ? true : typeof m.nora === 'boolean' ? m.nora : undefined;
  return { canChat: true, paid, pastDue: !paid && m.pastDue === true, nora };
}

/**
 * A lookup's answer (true / false / null when it could not be found out) applied to what this
 * account was last known to be. A real answer replaces it. A failed lookup keeps it: it never
 * takes the paid features from a confirmed member, and never grants them with no answer on record.
 */
export function bsMembershipAfter(known, answer) {
  if (answer === true || answer === false) return answer;
  return known === true;
}

/**
 * The boot seed, before the session restores. Only an answer recorded FOR the last signed-in
 * account counts: another account on the same device is not this one. Returns null when there
 * is nothing to go on, and the shell holds until the lookup answers.
 */
export function bsMembershipSeed({ stored, storedUid, lastUid }) {
  if (!storedUid || storedUid !== lastUid) return null;
  if (stored === '1') return true;
  if (stored === '0') return false;
  return null;
}

/**
 * Asks `run` (resolving true once the account is a member) up to `tries` times, `everyMs` apart,
 * stopping at the first true. For the checkout's browser closing while the payment may still be
 * clearing: one check on close missed a payment that cleared a moment later (#2353's moved item).
 * Returns a stop function. `schedule`/`unschedule` are injectable for tests.
 */
export function bsPollMembership(run, { tries, everyMs, schedule = setTimeout, unschedule = clearTimeout }) {
  let timer = null;
  let stopped = false;
  const step = (left) => {
    if (stopped) return;
    Promise.resolve().then(run).catch(() => null).then((active) => {
      if (stopped || active === true || left <= 1) return;
      timer = schedule(() => step(left - 1), everyMs);
    });
  };
  step(tries);
  return () => { stopped = true; if (timer != null) unschedule(timer); };
}

// ── A locked paid feature ─────────────────────────────────────────────────────
// 'free'    a free account (never paid, or cancelled): a short upgrade prompt and Join.
// 'pastDue' the renewal failed: "Your payment didn't go through…" and Update your card, which
//           opens the Stripe billing portal (a new checkout would sell a second membership).

/** A paid route's refusal code, as the lock it means; null for anything else. */
export function bsPaidLockOf(code) {
  if (code === 'payment_past_due') return 'pastDue';
  if (code === 'membership_required') return 'free';
  return null;
}

/**
 * A response's lock: a 402 is a paid feature refused (by its code, and a 402 with no code is the
 * upgrade); anything else is not a lock. `body` is the parsed JSON, or null.
 */
export function bsPaidLockFrom(status, body) {
  if (status !== 402) return null;
  return bsPaidLockOf(body && body.code) || 'free';
}

/** The lock the shell's flags mean right now: only an explicit `paid === false` locks. */
export function bsPaidLockNow({ paid, pastDue }) {
  if (paid !== false) return null;
  return pastDue === true ? 'pastDue' : 'free';
}

/**
 * Assistant Nora's lock: only an explicit `nora === false` locks (unknown never does). A free
 * account reads 'free' (Join), a membership whose renewal failed 'pastDue' (Update your card).
 */
export function bsNoraLockNow({ nora, pastDue }) {
  if (nora !== false) return null;
  return pastDue === true ? 'pastDue' : 'free';
}

/** A Nora route's refusal code as its lock: the same codes as any paid route. */
export function bsNoraLockOf(code) {
  return bsPaidLockOf(code);
}

// Home's past-due notice is put away for the day: the stamp is "<uid>:<local day>", so it comes
// back tomorrow, and another account on the same phone is not this one.
export function bsPastDueStamp(uid, day) {
  return String(uid == null ? '' : uid) + ':' + String(day == null ? '' : day);
}
export function bsPastDueNoticeShown({ pastDue, uid, day, stamp }) {
  if (pastDue !== true || !uid || !day) return false;
  return stamp !== bsPastDueStamp(uid, day);
}
