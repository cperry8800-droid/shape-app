// A time asked of a coach who isn't on Shape yet (the owner, 2026-10-29: "Request, saved for her").
//
// A seeded listing (a trainer or nutritionist row with no owner_id) shows sample open times. A member
// taps one and asks for it: /api/listing-requests keeps the ask against the listing
// (listing_time_requests, 2026-10-29-listing-time-requests.sql) and tells Shape's owners. When an
// admin claims the listing for its coach (/dashboard/claim), tellAskers tells every member who asked
// that the coach is on Shape now, and the coach reads the asks on their own page.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notify';
import { ownerAccountIds } from '@/lib/payment-notices';
import { np } from '../../mobile-app/src/services/noticeCopy.mjs';

export type CoachRole = 'trainer' | 'nutritionist';
export type ListingAsk = { role: CoachRole; providerId: number; slotStart: string; durationMin: number; note: string | null };
export type AskRead = { ok: true; value: ListingAsk } | { ok: false; code: string; error: string };

/** How far ahead a time may be asked for: the sample week is two weeks; this leaves room. */
export const ASK_AHEAD_DAYS = 60;
/** A time must be at least this far off when it is asked for. */
export const ASK_LEAD_MIN = 15;
/** Asks a member may make in a day, across listings. */
export const ASKS_PER_DAY = 10;
/** Asks a member may have waiting on one listing (times still to come). */
export const ASKS_PER_LISTING = 3;
export const ASK_NOTE_MAX = 500;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** The ask in a request body, checked; `now` in milliseconds. */
export function readListingAsk(body: unknown, now: number): AskRead {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const bad = (code: string, error: string): AskRead => ({ ok: false, code, error });
  const role = b.role;
  if (role !== 'trainer' && role !== 'nutritionist') return bad('role', 'Choose a coach to ask.');
  const providerId = b.providerId;
  if (typeof providerId !== 'number' || !Number.isInteger(providerId) || providerId <= 0) return bad('listing', 'Choose a coach to ask.');
  const at = typeof b.at === 'string' ? Date.parse(b.at) : NaN;
  if (!Number.isFinite(at)) return bad('time', 'Choose a time to ask for.');
  if (at < now + ASK_LEAD_MIN * 60_000) return bad('time_past', 'That time has passed. Pick a later one.');
  if (at > now + ASK_AHEAD_DAYS * 86_400_000) return bad('time_far', 'Pick a time in the next two months.');
  const durationMin = b.durationMin;
  if (typeof durationMin !== 'number' || !Number.isInteger(durationMin) || durationMin < 5 || durationMin > 240) return bad('length', 'Choose how long the call is.');
  if (b.note != null && typeof b.note !== 'string') return bad('note', 'Write the note as text.');
  const note = typeof b.note === 'string' ? b.note.replace(CONTROL, '').trim() : '';
  if (note.length > ASK_NOTE_MAX) return bad('note_long', `Keep the note to ${ASK_NOTE_MAX} characters.`);
  return { ok: true, value: { role, providerId, slotStart: new Date(at).toISOString(), durationMin, note: note || null } };
}

/** "Fri, Oct 31, 9:00 AM UTC": the owners' notice is in English, on UTC. */
export function utcWhen(iso: string): string {
  try {
    return `${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))} UTC`;
  } catch {
    return iso;
  }
}

/** What Shape's owners are told of an ask. In English, as their payment notice is. */
export function ownerAskNotice(ask: ListingAsk, member: string, coach: string): { title: string; body: string } {
  const who = member || 'A member';
  const name = coach || (ask.role === 'nutritionist' ? 'a nutritionist' : 'a trainer');
  const note = ask.note ? ` Their note: "${ask.note.length > 140 ? `${ask.note.slice(0, 139)}…` : ask.note}"` : '';
  return {
    title: `A time asked of ${name}`,
    body: `${who} asked ${name}, who isn't on Shape yet, for ${utcWhen(ask.slotStart)} (${ask.durationMin} min).${note}`,
  };
}

/** Tell the owners of an ask. Best effort: the ask is stored already. Returns how many were told. */
export async function tellOwnersOfAsk(admin: SupabaseClient, askId: string, ask: ListingAsk, memberId: string, member: string, coach: string): Promise<number> {
  try {
    const owners = await ownerAccountIds(admin);
    const notice = ownerAskNotice(ask, member, coach);
    let told = 0;
    for (const ownerId of owners) {
      const stored = await createNotification(admin, {
        userId: ownerId,
        type: 'listing_request',
        ...notice,
        route: 'admin',
        data: { dedupe: `ask:${askId}`, providerRole: ask.role, providerId: ask.providerId, memberId, slotStart: ask.slotStart, side: 'owner' },
      });
      if (stored) told += 1;
    }
    return told;
  } catch (err) {
    console.error('[listing-requests] owners not told:', err);
    return 0;
  }
}

/** The member's notice when the coach they asked is on Shape: English for the website, and copy for the app. */
export function joinedNotice(coach: string): { title: string; body: string; copy: { title: unknown; body: unknown } } {
  const name = coach || 'The coach you asked';
  return {
    title: `${name} is on Shape now`,
    body: `You asked ${coach || 'them'} for a time before they joined. Book one on their listing.`,
    copy: { title: np('listingJoined.title', { coach: name }), body: np('listingJoined.body', { coach: coach || '' }) },
  };
}

/**
 * The listing has just been claimed for its coach: tell each member who asked for a time. Once per
 * member and listing (data.dedupe). Best effort: the claim is done. Returns how many were told.
 */
export async function tellAskers(admin: SupabaseClient, role: CoachRole, providerId: number): Promise<number> {
  try {
    const [{ data: asks, error }, { data: listing }] = await Promise.all([
      admin.from('listing_time_requests').select('member_id').eq('provider_role', role).eq('provider_id', providerId).limit(500),
      admin.from(role === 'nutritionist' ? 'nutritionists' : 'trainers').select('name').eq('id', providerId).maybeSingle(),
    ]);
    if (error) {
      console.error('[listing-requests] asks not read:', error.message);
      return 0;
    }
    const members = [...new Set(((asks || []) as { member_id?: string | null }[]).map((a) => a.member_id).filter((id): id is string => !!id))];
    const coach = String((listing as { name?: string | null } | null)?.name || '').trim();
    const { copy, ...notice } = joinedNotice(coach);
    let told = 0;
    for (const memberId of members) {
      const stored = await createNotification(admin, {
        userId: memberId,
        type: 'listing_joined',
        ...notice,
        route: `coach:${role}:${providerId}`,
        data: { dedupe: `joined:${role}:${providerId}:${memberId}`, providerRole: role, providerId, side: 'client' },
      }, copy);
      if (stored) told += 1;
    }
    return told;
  } catch (err) {
    console.error('[listing-requests] askers not told:', err);
    return 0;
  }
}
