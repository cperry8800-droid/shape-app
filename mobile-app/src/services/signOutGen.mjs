// One shared sign-out generation counter.
//
// The class it closes: an async operation started while account A was signed in
// can be parked on an await when the sign-out sweep runs, resume AFTER it, and
// re-create the very state the sweep just removed. shapeBackend's realtime
// managers already guard exactly this way (_unread.gen / _activity.gen); this is
// the same counter for the two teardowns whose state lives OUTSIDE the page —
// the push token (a server row) and device-local habit reminders (scheduled in
// the OS). Neither the storage scrub nor the sign-out reload can undo either, so
// a resumed coroutine leaves account A's data on a signed-out shared device.
//
// It is deliberately its own module rather than a field on one of the two
// consumers: push.js and shapeBackend.js must read the SAME counter, and having
// the habit scheduler import from the push module (or vice versa) would state
// the coupling backwards.
//
// Usage: capture signOutGen() BEFORE the first await, re-check it immediately
// before the write. signOut() bumps the counter before any teardown step runs,
// so every operation already in flight is invalidated by the time the sweep
// starts — the check can never race the bump it is testing for.

let _gen = 0;
// Whether a sign-out is under way: set by the bump that starts it, cleared when an account is next signed
// in (shapeBackend's setCached, the one identity chokepoint). Between the bump and the cleared user lie the
// sign-out's awaited teardown steps, and work STARTED in that window would capture the bumped generation
// and pass for live; this lets it refuse to start at all (the grocery lists store, Codex P1 on #2433).
let _signingOut = false;

export function signOutGen() { return _gen; }

export function bumpSignOutGen() { _gen += 1; _signingOut = true; return _gen; }

export function signOutInProgress() { return _signingOut; }

export function signOutEnded() { _signingOut = false; }
