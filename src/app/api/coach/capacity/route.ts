// A coach's capacity: whether they take new clients (client-onboarding task #10).
//
// Owner, 2026-10-15: "make sure their at capacity toggle works and is routed properly, which
// basically makes it so they cant add new clients, but clients can still be added to waitlist.
// check coaches waitlist works properly also", and on intros at capacity: "let the coach decide".
//
// GET ?tz=                    → { listings: [{ role, providerId, name, atCapacity, effective,
//                                 resumeAt, resumeOn, timezone, introsAtCapacity, waiting }] },
//                                 every listing the
//                                 caller owns (a coach can hold both roles)
// POST { role, atCapacity?, resumeOn?, tz?, resumeAt?, introsAtCapacity? }
//                             → { ok, listing, notified }; at least one of the two switches. The
//                                 intro setting alone leaves the listing (and a resume date) as it is.
//
// Auth is the caller's own session, the cookie on the website or the Bearer token in the app
// (resolveRequestClient), and every write goes through that client: RLS lets a coach update their
// own listing row and their own booking rules, and nobody else's.
//
// ⚠ BEFORE THIS, THE WEBSITE HAD NO TOGGLE AND THE APP'S WROTE THE ROW DIRECTLY: it reached only the
// first listing it found (a coach with both roles could pause the trainer listing alone), it could
// not set a resume date, and nothing told the waiting list when the coach reopened. This route is
// the one way both surfaces change capacity, and the place the reopening is noticed.
//
// ⚠ REOPENING TELLS THE WAITING LIST (when the coach goes from at capacity to accepting): every
// member still waiting is notified that the coach is taking new clients, once a day per coach, under
// their "Waitlist invites" preference (it is the same news: a coach has room for you). A spot that
// reopens because the resume date passed is noticed by the hourly /api/cron/capacity-reopen, which
// switches the listing off and tells the same list (src/lib/capacity-reopen.ts, shared with this route).

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPreferredNotification } from '@/lib/notify';
import { readJson } from '@/lib/request-utils';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { isMissingRelation } from '@/lib/owned-provider';
import { resolveRequestClient } from '@/lib/waitlist';
import { instantInZone, normalizeZone, wallClockInZone } from '@/lib/time';
import { finishReopening, tellWaitingList } from '@/lib/capacity-reopen';

// How long a reopening request spends telling the list before leaving the rest to the hourly job.
const REOPEN_REQUEST_BUDGET_MS = 15_000;

export const dynamic = 'force-dynamic';

type Role = 'trainer' | 'nutritionist';
const ROLES: Role[] = ['trainer', 'nutritionist'];
const tableOf = (role: Role) => (role === 'trainer' ? 'trainers' : 'nutritionists');
/** The furthest a resume date may be set. */
const RESUME_MAX_DAYS = 365;

type Listing = { id: number; name: string | null; at_capacity: boolean | null; capacity_resume_at: string | null; timezone?: string | null };

function roleOf(raw: unknown): Role | null {
  return raw === 'trainer' || raw === 'nutritionist' ? raw : null;
}

async function ownListing(db: Awaited<ReturnType<typeof resolveRequestClient>> & object, role: Role) {
  const { data, error } = await db.supabase
    .from(tableOf(role))
    .select('id, name, at_capacity, capacity_resume_at, timezone')
    .eq('owner_id', db.user.id)
    // capped-read-ok: one listing per owner per role (the unique index from #2331); the order only
    // keeps the read deterministic if that ever changes.
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return 'unavailable' as const;
  return (data as Listing | null) ?? null;
}

async function introsFlag(db: Awaited<ReturnType<typeof resolveRequestClient>> & object, role: Role, id: number) {
  const { data, error } = await db.supabase
    .from('provider_booking_rules')
    .select('*')
    .eq('provider_role', role)
    .eq('provider_id', id)
    .maybeSingle();
  if (error) return isMissingRelation(error) ? false : null;
  return (data as { intros_at_capacity?: unknown } | null)?.intros_at_capacity === true;
}

async function waitingCount(role: Role, id: number): Promise<number | null> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('coach_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('provider_role', role)
    .eq('provider_id', id)
    .eq('status', 'waiting');
  return error ? null : count ?? 0;
}

// ⚠ A RESUME DATE IS A DAY ON THE COACH'S OWN CLOCK (Codex on #2375). The website turned the picked
// day into midnight in the BROWSER's zone, so a New York listing managed from a UTC laptop reopened
// hours early, on the evening before. The page now sends the day (`resumeOn`), and it becomes the
// start of that day in the listing's zone (`timezone`, set with its hours), or the zone the page
// sends when the listing has none yet, or UTC. The same day comes back as `resumeOn`, so a page
// shows the coach's date, never the viewer's. ⚠ THE READ USES THE SAME FALLBACK AS THE WRITE (Codex
// on #2375): a listing with no zone read its day back in UTC, so Oct 20 picked in Tokyo (stored as
// 15:00Z on the 19th) came back as the 19th. GET takes the page's zone as `?tz=` and POST its `tz`,
// so for such a listing the day is placed and read back in the same zone.
function zoneOf(row: Listing, fallback?: unknown): string {
  return normalizeZone(row.timezone) || normalizeZone(fallback) || 'UTC';
}
function resumeDayOn(day: string, zone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // A zone whose clocks skip midnight that day starts it at 01:00.
  const t = instantInZone(y, mo, d, 0, 0, zone);
  return Number.isFinite(t) ? t : instantInZone(y, mo, d, 1, 0, zone);
}

function shape(role: Role, row: Listing, introsAtCapacity: boolean, waiting: number | null, fallbackZone?: unknown) {
  const zone = zoneOf(row, fallbackZone);
  const resumeMs = row.capacity_resume_at ? Date.parse(row.capacity_resume_at) : NaN;
  return {
    role,
    providerId: row.id,
    name: row.name ?? null,
    atCapacity: row.at_capacity === true,
    // What members meet: a resume date that has passed means accepting again.
    effective: isEffectivelyAtCapacity(row),
    resumeAt: row.capacity_resume_at ?? null,
    resumeOn: Number.isFinite(resumeMs) ? wallClockInZone(resumeMs, zone)?.date ?? null : null,
    timezone: normalizeZone(row.timezone),
    introsAtCapacity,
    waiting,
  };
}

export async function GET(request: Request) {
  const db = await resolveRequestClient(request);
  if (!db) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const tz = new URL(request.url).searchParams.get('tz');
  const listings = [];
  for (const role of ROLES) {
    const row = await ownListing(db, role);
    if (row === 'unavailable') return NextResponse.json({ error: 'Your listing could not be read.' }, { status: 503 });
    if (!row) continue;
    const intros = await introsFlag(db, role, row.id);
    if (intros === null) return NextResponse.json({ error: 'Your booking rules could not be read.' }, { status: 503 });
    listings.push(shape(role, row, intros, await waitingCount(role, row.id), tz));
  }
  return NextResponse.json({ listings });
}

export async function POST(request: Request) {
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
  const role = roleOf(body.role);
  if (!role) return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  if (body.atCapacity !== undefined && typeof body.atCapacity !== 'boolean') {
    return NextResponse.json({ error: 'atCapacity is on or off.' }, { status: 400 });
  }
  if (body.introsAtCapacity !== undefined && typeof body.introsAtCapacity !== 'boolean') {
    return NextResponse.json({ error: 'introsAtCapacity is on or off.' }, { status: 400 });
  }
  if (body.atCapacity === undefined && body.introsAtCapacity === undefined) {
    return NextResponse.json({ error: 'Send atCapacity or introsAtCapacity.' }, { status: 400 });
  }
  const atCapacity: boolean | undefined = body.atCapacity;

  const db = await resolveRequestClient(request);
  if (!db) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const before = await ownListing(db, role);
  if (before === 'unavailable') return NextResponse.json({ error: 'Your listing could not be read.' }, { status: 503 });
  if (!before) return NextResponse.json({ error: 'You have no listing for this role.' }, { status: 404 });

  // A resume date: only while at capacity, in the future, within a year. A day (`resumeOn`, the
  // website) starts in the listing's zone; an instant with its offset (`resumeAt`) is taken as sent.
  let resumeAt: string | null = null;
  const wantsDay = body.resumeOn != null && body.resumeOn !== '';
  const wantsInstant = body.resumeAt != null && body.resumeAt !== '';
  if (atCapacity && (wantsDay || wantsInstant)) {
    let t = NaN;
    if (wantsDay) t = resumeDayOn(String(body.resumeOn), zoneOf(before, body.tz));
    else {
      const raw = String(body.resumeAt);
      t = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? Date.parse(raw) : NaN;
    }
    if (!Number.isFinite(t) || t <= Date.now() || t > Date.now() + RESUME_MAX_DAYS * 86_400_000) {
      return NextResponse.json({ error: 'Pick a resume date in the next year.', field: wantsDay ? 'resumeOn' : 'resumeAt' }, { status: 400 });
    }
    resumeAt = new Date(t).toISOString();
  }

  // The intros setting first: on a database without its column (before
  // 2026-10-15-capacity-intros.sql) the request is refused whole, never half-applied.
  // ⚠ AND A LISTING WRITE THAT FAILS AFTER IT PUTS IT BACK (Codex on #2375): the two writes are not
  // one transaction, so a combined save that answered save_failed had already changed the intro
  // setting. The setting it replaces is read first, and restored if the listing write fails.
  let intros: boolean | null;
  let introsBefore: boolean | null = null;
  if (typeof body.introsAtCapacity === 'boolean') {
    if (atCapacity !== undefined) {
      introsBefore = await introsFlag(db, role, before.id);
      if (introsBefore === null) return NextResponse.json({ error: 'Your booking rules could not be read.' }, { status: 503 });
    }
    const { error } = await db.supabase
      .from('provider_booking_rules')
      .upsert({ provider_role: role, provider_id: before.id, intros_at_capacity: body.introsAtCapacity, updated_at: new Date().toISOString() }, { onConflict: 'provider_role,provider_id' });
    if (error) {
      if (isMissingRelation(error)) {
        return NextResponse.json({ error: 'not_set_up', detail: "Intros at capacity aren't set up yet. They'll be ready after the next update." }, { status: 503 });
      }
      console.error('[coach capacity] intros save failed', error);
      return NextResponse.json({ error: 'save_failed' }, { status: 500 });
    }
    intros = body.introsAtCapacity;
  } else {
    intros = await introsFlag(db, role, before.id);
    if (intros === null) return NextResponse.json({ error: 'Your booking rules could not be read.' }, { status: 503 });
  }

  // The intro setting alone: the listing is left as it is.
  // ⚠ A REOPENING STAYS DUE UNTIL ITS LIST IS TOLD (Codex on #2375, P1). Switching the listing off
  // and then telling the list lost everyone after the point a request was cut off. A reopening is
  // written as at capacity with a resume date of now, which members already meet as open; it is
  // switched off only once the list has been told, and if this request stops first, the hourly
  // /api/cron/capacity-reopen finds it due and carries on (src/lib/capacity-reopen.ts).
  const reopening = atCapacity === false && isEffectivelyAtCapacity(before);
  const dueAt = new Date().toISOString();
  let after: Listing = before;
  if (atCapacity !== undefined) {
    const { data, error: updErr } = await db.supabase
      .from(tableOf(role))
      .update(reopening
        ? { at_capacity: true, capacity_resume_at: dueAt }
        : { at_capacity: atCapacity, capacity_resume_at: atCapacity ? resumeAt : null })
      .eq('id', before.id)
      .eq('owner_id', db.user.id)
      .select('id, name, at_capacity, capacity_resume_at, timezone')
      .maybeSingle();
    if (updErr || !data) {
      console.error('[coach capacity] update failed', updErr);
      if (introsBefore !== null && introsBefore !== intros) {
        const { error: undoErr } = await db.supabase
          .from('provider_booking_rules')
          .upsert({ provider_role: role, provider_id: before.id, intros_at_capacity: introsBefore, updated_at: new Date().toISOString() }, { onConflict: 'provider_role,provider_id' });
        if (undoErr) console.error('[coach capacity] intros restore failed', undoErr);
      }
      return NextResponse.json({ error: 'save_failed' }, { status: 500 });
    }
    after = data as Listing;
  }

  // Reopened: tell everyone still waiting, then switch the listing off. Best effort: the listing is
  // already open to members, and whatever this request does not finish, the hourly job does.
  let notified = 0;
  if (reopening) {
    try {
      const admin = createAdminClient();
      const told = await tellWaitingList(admin, createPreferredNotification, role, before.id, after.name, dueAt.slice(0, 10), Date.now() + REOPEN_REQUEST_BUDGET_MS);
      notified = told.sent;
      if (told.complete && await finishReopening(admin, role, before.id, dueAt)) {
        after = { ...after, at_capacity: false, capacity_resume_at: null };
      }
    } catch (err) {
      console.error('[coach capacity] reopening notice failed', err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({
    ok: true,
    listing: shape(role, after, intros, await waitingCount(role, before.id), body.tz),
    notified,
  });
}
