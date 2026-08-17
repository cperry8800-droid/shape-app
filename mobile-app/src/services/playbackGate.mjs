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
export function makePlaybackGate(identityFn) {
  let gen = 0;
  return {
    // Open a new attempt. Returns `live()` — call it after EVERY await; false means
    // this attempt was superseded by a newer play, cancelled by a pause, or the
    // account signed out. Fails CLOSED: no identity ⇒ never live.
    begin() {
      const mine = ++gen;
      return function live() {
        if (mine !== gen) return false;
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
