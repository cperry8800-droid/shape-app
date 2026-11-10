// streams.mjs — whose stream each station connection is, so Shape Radio plays only for the account
// listening, on its own paid membership (owner, 2026-11-10). Plain ESM; the database client is
// passed in (the service role: supabase-migrations/2026-11-10-radio-own-account.sql).
//
//   openStream(db, { userId, now })                         a stream for a member, as they start
//                                                           (/api/radio/listen): its id, or null
//   admitConnection(db, { streamId, boot, bootAt, client, now })
//                                                           the station letting a listener in
//                                                           (/api/radio/pass): the account is
//                                                           recorded, and its OTHER connections
//                                                           are marked to drop (one device)
//   leaveConnection(db, { boot, client })                   the station's word that they left
//   markAccount(db, { userId, now, reason })                drop every connection of an account
//   recheckAccount(db, { userId })                          confirm an account's membership at the next ask
//                                                           (a membership that ended or went past
//                                                           due: the Stripe webhook)
//   kicksFor(db, { boot, now, mayListen })                  /api/radio/kicks, which the station's
//                                                           door polls: re-checks each connection's
//                                                           membership about once a minute, and
//                                                           hands back the ones to drop
//
// ⚠ AN ACCOUNT IS KEPT ONLY WHILE IT LISTENS. A connection's row goes when the station says the
// listener left, when a newer start of the station is seen (its connections ended with the one
// before), or ten minutes after a drop the station never confirmed; a stream's row a day after it
// was opened. radio_listens, the station's own record of sessions, holds no account and never will.

import { randomUUID } from 'node:crypto';

export const STREAMS = 'radio_streams';
export const CONNECTIONS = 'radio_connections';
/** How often each live connection's membership is confirmed again. */
export const RECHECK_SEC = 60;
/** How long a drop handed to the door waits for the station's "left" before it is handed again. */
export const KICK_RETRY_SEC = 30;
/** A drop the station never confirmed is given up after this (the connection is gone or stuck). */
export const KICK_GIVE_UP_SEC = 600;
/** A stream's record is kept this long after it was opened. */
export const STREAM_KEEP_SEC = 24 * 3600;
const RECHECK_BATCH = 50;
const KICK_BATCH = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (ms) => new Date(ms).toISOString();

/** A stream for this member, recorded before its ticket exists: its id, or null when not written. */
export async function openStream(db, { userId, now }) {
  if (!UUID.test(String(userId || ''))) return null;
  const streamId = randomUUID();
  const { error } = await db.from(STREAMS).insert({ stream_id: streamId, user_id: userId, opened_at: iso(now) });
  return error ? null : streamId;
}

/**
 * The station is letting a listener in on a ticket for `streamId`. Records the connection as the
 * stream's account's, and marks every OTHER connection of that account to drop: the newest device
 * plays (a member who starts the radio on a second device stops the first, and a code someone else
 * used is stopped by the member's own next start). Connections of an earlier start of the station
 * are cleared: they ended when it stopped.
 * @returns {Promise<{ok: true, userId: string, superseded: number} | {ok: false, reason: 'stream' | 'read_failed' | 'write_failed'}>}
 */
export async function admitConnection(db, { streamId, boot, bootAt, client, now }) {
  const { data: stream, error: readErr } = await db.from(STREAMS).select('user_id').eq('stream_id', streamId).maybeSingle();
  if (readErr) return { ok: false, reason: 'read_failed' };
  if (!stream || !stream.user_id) return { ok: false, reason: 'stream' };
  const userId = stream.user_id;
  // Best-effort: a stale row left behind is a drop nobody acts on (kicksFor reads this boot only).
  try { await db.from(CONNECTIONS).delete().neq('boot', boot).lt('connected_at', bootAt); } catch { /* next time */ }
  const at = iso(now);
  const { error: writeErr } = await db.from(CONNECTIONS).upsert(
    { boot, client, stream_id: streamId, user_id: userId, connected_at: at, checked_at: at, kick_requested_at: null, kick_reason: null, kicked_at: null },
    { onConflict: 'boot,client' },
  );
  if (writeErr) return { ok: false, reason: 'write_failed' };
  // ⚠ ONE DEVICE PER ACCOUNT, AND THE NEWEST ONE PLAYS, HOWEVER TWO ADMISSIONS INTERLEAVE (Codex P1
  // on #2675). Each used to mark every OTHER connection of the account, so two arriving together each
  // marked the other and both were dropped. Icecast numbers a start's connections in the order they
  // came, so on this start the higher client is the newer: a connection marks only the lower ones,
  // and marks itself when a higher one is already recorded. Whatever the order of the two writes,
  // the highest is never marked and every lower one is (each one's check runs after its own write,
  // so at least one of the two sees the other). Connections of an earlier start are marked too.
  const mark = { kick_requested_at: at, kick_reason: 'newer_stream' };
  const [sameBoot, otherBoot] = await Promise.all([
    db.from(CONNECTIONS).update(mark).eq('user_id', userId).eq('boot', boot).lt('client', client).is('kick_requested_at', null).select('client'),
    db.from(CONNECTIONS).update(mark).eq('user_id', userId).neq('boot', boot).is('kick_requested_at', null).select('client'),
  ]);
  const { data: newer } = await db.from(CONNECTIONS).select('client')
    .eq('user_id', userId).eq('boot', boot).gt('client', client).is('kick_requested_at', null).limit(1);
  if (newer && newer.length) {
    await db.from(CONNECTIONS).update(mark).eq('boot', boot).eq('client', client).is('kick_requested_at', null);
  }
  const superseded = (sameBoot.data?.length ?? 0) + (otherBoot.data?.length ?? 0);
  return { ok: true, userId, superseded, newer: !!(newer && newer.length) };
}

/** The station's word that a listener left: their connection's row goes. */
export async function leaveConnection(db, { boot, client }) {
  const { error } = await db.from(CONNECTIONS).delete().eq('boot', boot).eq('client', client);
  return error ? { ok: false, error: 'write_failed' } : { ok: true };
}

/** Drop every connection of an account (a membership that ended or went past due). */
export async function markAccount(db, { userId, now, reason = 'membership' }) {
  if (!UUID.test(String(userId || ''))) return { ok: false, marked: 0 };
  const { data, error } = await db.from(CONNECTIONS)
    .update({ kick_requested_at: iso(now), kick_reason: reason })
    .eq('user_id', userId).is('kick_requested_at', null).select('client');
  return error ? { ok: false, marked: 0 } : { ok: true, marked: data?.length ?? 0 };
}

/**
 * Ask again, at the station's next ask (its door asks every few seconds), whether an account may
 * still listen: its live connections are marked as never confirmed, so kicksFor's re-check
 * (`mayListen`, the membership's own rules: an admin's, a coach's and coaching's included) takes
 * them first, and drops them only if it says no. For Stripe's webhook, which knows that a plan
 * stopped paying but not whether the account is still paid another way (Codex P2 on #2675).
 */
export async function recheckAccount(db, { userId }) {
  if (!UUID.test(String(userId || ''))) return { ok: false, rechecked: 0 };
  const { data, error } = await db.from(CONNECTIONS)
    .update({ checked_at: iso(0) })
    .eq('user_id', userId).is('kick_requested_at', null).select('client');
  return error ? { ok: false, rechecked: 0 } : { ok: true, rechecked: data?.length ?? 0 };
}

/**
 * The connections the station's door should drop now, on this start of the station (`boot`).
 * First, up to RECHECK_BATCH connections whose membership was last confirmed more than RECHECK_SEC
 * ago are confirmed again (`mayListen(userId)`: true, false, or null when it could not be read,
 * which keeps the connection and asks again next time); a false marks the account's connections.
 * Then every connection marked to drop and not handed to the door in the last KICK_RETRY_SEC is
 * handed over, and old records are cleared.
 * @param {{ boot: string, now: number, mayListen: (userId: string) => Promise<boolean | null> }} p
 * @returns {Promise<{ok: true, clients: number[], checked: number} | {ok: false, error: string}>}
 */
export async function kicksFor(db, { boot, now, mayListen }) {
  const stale = iso(now - RECHECK_SEC * 1000);
  const { data: due, error: dueErr } = await db.from(CONNECTIONS).select('user_id')
    .eq('boot', boot).is('kick_requested_at', null).lt('checked_at', stale)
    .order('checked_at', { ascending: true }).limit(RECHECK_BATCH);
  if (dueErr) return { ok: false, error: 'read_failed' };
  const users = [...new Set((due ?? []).map((r) => r.user_id).filter(Boolean))];
  for (const userId of users) {
    let verdict = null;
    try { verdict = await mayListen(userId); } catch { verdict = null; }
    if (verdict === null) continue;
    if (verdict) await db.from(CONNECTIONS).update({ checked_at: iso(now) }).eq('user_id', userId).is('kick_requested_at', null);
    else await markAccount(db, { userId, now, reason: 'membership' });
  }

  const retry = iso(now - KICK_RETRY_SEC * 1000);
  const { data: marked, error: markErr } = await db.from(CONNECTIONS).select('client, kicked_at')
    .eq('boot', boot).not('kick_requested_at', 'is', null).limit(KICK_BATCH);
  if (markErr) return { ok: false, error: 'read_failed' };
  const clients = (marked ?? [])
    .filter((r) => !r.kicked_at || String(r.kicked_at) < retry)
    .map((r) => Number(r.client))
    .filter((c) => Number.isFinite(c));
  if (clients.length) {
    await db.from(CONNECTIONS).update({ kicked_at: iso(now) }).eq('boot', boot).in('client', clients);
  }
  // Records past keeping: a drop the station never confirmed, and streams opened a day ago.
  try {
    await db.from(CONNECTIONS).delete().lt('kick_requested_at', iso(now - KICK_GIVE_UP_SEC * 1000));
    await db.from(STREAMS).delete().lt('opened_at', iso(now - STREAM_KEEP_SEC * 1000));
  } catch { /* next time */ }
  return { ok: true, clients, checked: users.length };
}
