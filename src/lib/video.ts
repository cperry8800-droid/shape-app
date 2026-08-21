// In-app video rooms via Jitsi.
//
// A room is just a deterministic URL on a Jitsi domain — no API key, no
// per-minute cost. We store it in sessions.meeting_url on confirm and embed it
// in the app, so the coach and client land in the same room inside Shape. The
// room name is tied to the session id (a uuid → unique and effectively
// unguessable), so links can't be enumerated.
//
// ⚠ THIS USED TO FALL BACK TO THE PUBLIC `meet.jit.si` INSTANCE, AND THAT WAS THE
// DEFECT. With nothing configured, every coaching call — real-time audio and
// video, in a health-and-fitness context — was silently routed through a third
// party Shape has no data-processing agreement with, and which appeared in none
// of the documents in docs/legal/. The old comment sold that as "zero setup".
// Nothing errored, nothing warned, and the failure was invisible precisely
// because the calls worked.
//
// So this now FAILS CLOSED: with no JITSI_DOMAIN configured there is no video
// room, and the surfaces that offer one already treat a null meeting_url as
// "not joinable" (broadsheet client + calendar both gate on it). A member is
// never sent somewhere we have not contracted for.
//
// TO TURN VIDEO CALLS ON: set JITSI_DOMAIN to a self-hosted Jitsi or an 8x8 JaaS
// domain that Shape has an agreement with, and record it as a sub-processor
// before the first call.

// A bare hostname, optionally with a port. Deliberately strict.
//
// ⚠ THE VALUE IS INTERPOLATED INTO A URL, so anything carrying `/`, `@`, `?`, `#`
// or a scheme can point the room somewhere other than the intended host —
// `evil.test/x`, or `evil.test@real.test`, which resolves to evil.test while
// reading as real.test. Rejecting on shape is cheaper than parsing, and an
// invalid value fails CLOSED (no room) rather than producing a wrong one.
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/i;

/** The configured Jitsi host, or null when video calling is not set up. */
export function jitsiDomain(): string | null {
  const raw = (process.env.JITSI_DOMAIN || '').trim();
  if (!raw) return null;
  if (!HOSTNAME.test(raw)) {
    // Loud on the server, closed to the member: a malformed host is a
    // configuration error, and guessing at what was meant is how you end up
    // minting links to somewhere unintended.
    console.error('[video] JITSI_DOMAIN is not a bare hostname; video calling stays off:', raw);
    return null;
  }
  return raw;
}

/** True when video rooms can be issued at all. */
export function videoCallingEnabled(): boolean {
  return jitsiDomain() !== null;
}

/** A room URL for this session, or null when video calling is not configured. */
export function videoRoomUrl(sessionId: string): string | null {
  const domain = jitsiDomain();
  if (!domain) return null;
  const safeId = String(sessionId).replace(/[^a-zA-Z0-9-]/g, '');
  if (!safeId) return null;
  return `https://${domain}/shape-${safeId}`;
}
