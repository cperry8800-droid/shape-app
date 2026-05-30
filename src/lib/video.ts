// In-app video rooms via Jitsi.
//
// A room is just a deterministic URL on a Jitsi domain — no API key, no
// per-minute cost. We store it in sessions.meeting_url on confirm and embed it
// in the app, so the coach and client land in the same room inside Shape.
//
// Defaults to the public meet.jit.si instance (zero setup). For production
// SLA / branding, set JITSI_DOMAIN to your own self-hosted Jitsi or an 8x8
// JaaS domain. The room name is tied to the session id (a uuid → unique and
// effectively unguessable), so links can't be enumerated.

export function jitsiDomain(): string {
  return process.env.JITSI_DOMAIN || 'meet.jit.si';
}

export function videoRoomUrl(sessionId: string): string {
  const safeId = String(sessionId).replace(/[^a-zA-Z0-9-]/g, '');
  return `https://${jitsiDomain()}/shape-${safeId}`;
}
