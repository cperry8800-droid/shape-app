// Playback generation gate — the licensing guard for Shape Radio.
//
// ⚠ WHY THIS EXISTS. Radio playback requires a signed-in account (licensing, not
// product). But starting playback spans TWO awaits — the authenticated station read,
// then `audio.play()` — and a sign-out can land in either window. The sign-out path
// calls pause(), which only touches an element that already exists, so it is a
// complete NO-OP before the first play; the late resolution then creates an element
// and starts the stream. That is signed-out playback: the non-subscription rate
// classification the signed-out path was removed to avoid.
//
// A boolean "stopped" flag is not enough — two overlapping play() calls must resolve
// last-wins, which needs a generation counter, not a flag.
//
// The identity is INJECTED so this is pure and testable; the caller passes a function
// reading live auth state (never a captured snapshot, which is the bug being fixed).
//
// ⚠ LIVE IDENTITY IS NOT SUFFICIENT ON ITS OWN, and this is the subtle half.
// signOut() bumps the shared sign-out generation as its FIRST statement, but it does
// not clear the cached user until AFTER push teardown, local-habit cleanup, the
// Supabase sign-out, the cookie DELETE and MusicKit cleanup — every one of which can
// await on a slow network. Through that entire window `identityFn()` still returns the
// signed-out account, so identity alone cannot tell that sign-out has BEGUN. The
// optional `epochFn` (wired to signOutGen) closes it: the epoch moves first, so a
// pending station read or `audio.play()` resolving mid-teardown is refused rather than
// admitted against an account whose session is already being revoked.
export function makePlaybackGate(identityFn, epochFn) {
  let gen = 0;
  // Bumped ONLY by supersede() — see live.mustStop below. `gen` alone cannot answer
  // "must nothing be playing?" because it also moves when a newer play begins.
  let stopGen = 0;
  return {
    // Open a new attempt. Returns `live()` — call it after EVERY await; false means
    // this attempt was superseded by a newer play, cancelled by a pause, the account
    // signed out, or a sign-out STARTED. Fails CLOSED on every unreadable input.
    begin() {
      const mine = ++gen;
      const myStop = stopGen;
      // Captured at begin, compared in live(): an attempt is judged against the epoch
      // it started in, so a play() opened after a completed sign-out is not punished
      // for the earlier bump (it fails on identity instead, which is the honest reason).
      let epoch;
      try {
        epoch = epochFn ? epochFn() : null;
      } catch {
        epoch = Symbol('unreadable'); // can never equal a later read ⇒ stays closed
      }
      const epochMoved = () => {
        if (!epochFn) return false;
        try {
          return epochFn() !== epoch;
        } catch {
          return true; // an epoch source that throws must not admit playback
        }
      };
      const identityGone = () => {
        try {
          return !identityFn();
        } catch {
          return true; // an identity source that throws must not admit playback
        }
      };
      function live() {
        if (mine !== gen) return false;
        if (epochMoved()) return false;
        return !identityGone();
      }
      // ⚠ WHY THIS IS SEPARATE FROM live(). The audio element is a SINGLETON, so a
      // superseded attempt cannot distinguish "the audio I started" from the audio the
      // WINNING attempt started. Pausing whenever live() went false therefore had a
      // loser stop the stream the winner had legitimately begun (Codex P2, round 22).
      //
      // The two reasons live() goes false are not interchangeable:
      //   · a newer play() superseded me → it owns the element; I must touch nothing.
      //   · a pause / sign-out cancelled me → nothing may be playing; I must stop it,
      //     and this is the case that cannot be delegated to pause(), which is a no-op
      //     when no element existed yet (the original round-17 defect).
      live.mustStop = () => stopGen !== myStop || epochMoved() || identityGone();
      return live;
    },
    // Cancel any in-flight attempt. A pause must supersede a pending play, or the
    // pending play restarts the audio the pause just stopped.
    supersede() {
      gen++;
      stopGen++;
    },
  };
}
