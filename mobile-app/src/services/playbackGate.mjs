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
  return {
    // Open a new attempt. Returns `live()` — call it after EVERY await; false means
    // this attempt was superseded by a newer play, cancelled by a pause, the account
    // signed out, or a sign-out STARTED. Fails CLOSED on every unreadable input.
    begin() {
      const mine = ++gen;
      // Captured at begin, compared in live(): an attempt is judged against the epoch
      // it started in, so a play() opened after a completed sign-out is not punished
      // for the earlier bump (it fails on identity instead, which is the honest reason).
      let epoch;
      try {
        epoch = epochFn ? epochFn() : null;
      } catch {
        epoch = Symbol('unreadable'); // can never equal a later read ⇒ stays closed
      }
      return function live() {
        if (mine !== gen) return false;
        if (epochFn) {
          try {
            if (epochFn() !== epoch) return false;
          } catch {
            // An epoch source that throws must not admit playback.
            return false;
          }
        }
        try {
          return !!identityFn();
        } catch {
          // An identity source that throws must not admit playback.
          return false;
        }
      };
    },
    // Cancel any in-flight attempt. A pause must supersede a pending play, or the
    // pending play restarts the audio the pause just stopped.
    supersede() {
      gen++;
    },
  };
}
