// The station's door (parts 3 and 4 of Shape's own radio, src/lib/radio/pass.mjs and listens.mjs).
// Shape's own station server (services/station, Icecast's url auth) posts here as each listener
// connects, with the address they asked for, and again as each one leaves, with how long they
// stayed. A good ticket for the station's own mount (src/app/api/radio/listen/route.ts gave it to
// their player, two minutes ago at most) lets a listener in; each session is kept, for
// the performances the SoundExchange report counts for every play.
//
// Icecast reads the answer from a header, not the status: `icecast-auth-user: 1` admits, its
// absence refuses (the reason goes back in `icecast-auth-message`, for its log). So every answer
// is a 200, and a fault refuses: no key, no listener.
//
// ⚠ ONLY THE STATION ASKS. Its calls sign in (`station` and the engine's token, which the station's
// .env already holds) and name the station's start (`?boot=`, its container's own). A call without
// both is refused: a session stored from anyone else would be a performance that never happened,
// or a listener's end that never came.
//
// The ticket is checked by its signature, then its stream's account is read and its connection
// written (src/lib/radio/streams.mjs); only the station's own signed-in calls get that far, so no
// one else can make this route do work. It is kept off the per-address rate limit
// (src/lib/supabase/middleware.ts), since every call comes from the one station server.
import { NextResponse } from 'next/server';
import { checkListener, leavingListener, passKey } from '@/lib/radio/pass.mjs';
import { parseBoot, recordListen, stationCaller } from '@/lib/radio/listens.mjs';
import { admitConnection, leaveConnection } from '@/lib/radio/streams.mjs';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let form = new URLSearchParams();
  try {
    form = new URLSearchParams((await request.text()).slice(0, 4096));
  } catch {
    /* an unreadable body refuses, below */
  }
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  const answer = () => new NextResponse(null, { status: 200, headers });
  const boot = parseBoot(new URL(request.url).searchParams.get('boot'));
  if (!stationCaller(request.headers.get('authorization')) || !boot) {
    headers['icecast-auth-message'] = 'station';
    return answer();
  }
  const now = Date.now();

  // A listener leaving: their session ends (or, if Shape never heard them join, is kept whole).
  if (form.get('action') === 'listener_remove') {
    const left = leavingListener(form, { key: passKey() });
    if (left.ok) {
      const { client, durationSec } = left as { client: number; durationSec: number };
      // Their account's record of the connection goes as they leave (streams.mjs).
      try {
        const gone = await leaveConnection(createAdminClient(), { boot: boot.boot, client });
        if (!gone.ok) console.error('[radio/pass] a listener left and their connection was not cleared');
      } catch (e) {
        console.error('[radio/pass] a listener left and their connection was not cleared:', (e as Error).message);
      }
      try {
        const r = await recordListen(createAdminClient(), { action: 'leave', ...boot, client, durationSec, now });
        if (!r.ok) console.error('[radio/pass] a listener left and was not recorded:', r.error);
      } catch (e) {
        console.error('[radio/pass] a listener left and was not recorded:', (e as Error).message);
      }
    }
    return answer();
  }

  const verdict = checkListener(form, { now, key: passKey() });
  if (verdict.ok) {
    const { client, streamId } = verdict as { client: number; streamId: string | null };
    // ⚠ A STREAM IS LET IN ONLY WITH ITS ACCOUNT ON RECORD (owner, 2026-11-10: only "your own login
    // with a your own paid membership"). The connection is recorded as the stream's account's, and
    // that account's other connections are marked to drop: one device at a time. A record that
    // cannot be read or written refuses (fail closed, as the licences ask). A ticket naming no
    // stream is the dashboard's own probe of the station, let in without an account.
    let admitted = streamId === null;
    if (streamId !== null) {
      try {
        const r = await admitConnection(createAdminClient(), { streamId, ...boot, client, now });
        admitted = r.ok;
        if (!r.ok) headers['icecast-auth-message'] = (r as { reason: string }).reason;
      } catch (e) {
        console.error('[radio/pass] a listener could not be recorded, so was refused:', (e as Error).message);
        headers['icecast-auth-message'] = 'write_failed';
      }
    }
    if (admitted) {
      headers['icecast-auth-user'] = '1';
      try {
        const r = await recordListen(createAdminClient(), { action: 'join', ...boot, client, now });
        if (!r.ok) console.error('[radio/pass] a listener joined and was not recorded:', r.error);
      } catch (e) {
        console.error('[radio/pass] a listener joined and was not recorded:', (e as Error).message);
      }
    }
  } else {
    headers['icecast-auth-message'] = String((verdict as { reason?: string }).reason ?? 'refused');
  }
  return answer();
}
