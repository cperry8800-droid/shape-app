// Live Console persistence for the newdesign Trainer "Console" page.
//
// GET  → hydrate this trainer's focus banners + active pushed items
//        grouped by client_id, so a refresh restores the Console state.
// POST → three actions, keyed by `action`:
//          • 'focus'      — upsert the focus banner for (provider, client)
//          • 'addItem'    — append an exercise to the client's pushed items
//          • 'removeItem' — soft-delete a pushed item (sets removed_at)
//
// RLS (coach_focus_banners / coach_pushed_items) enforces that this
// trainer can only see / write rows for their own provider id.

import { NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError } from '@/lib/request-utils';

async function clientForRequest(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    return createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${m[1]}` } } },
    );
  }
  return createClient();
}

async function userForRequest(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const supabase = await clientForRequest(request);
  if (m) {
    const { data } = await supabase.auth.getUser(m[1]);
    return { user: data?.user ?? null, supabase };
  }
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase };
}

export const dynamic = 'force-dynamic';

const ROLE = 'trainer' as const;
const KIND = 'exercise' as const;
const RECENT_CLIENT_MS = 60 * 86_400_000; // 60 days = "current"
const TRAJECTORY_DAYS = 90;

function ageFromDob(dob: unknown): number | null {
  if (typeof dob !== 'string' || !dob) return null;
  const t = new Date(dob).getTime();
  if (!Number.isFinite(t)) return null;
  const years = (Date.now() - t) / (365.25 * 86_400_000);
  if (years < 0 || years > 130) return null;
  return Math.floor(years);
}

// Lightweight Shape Score: per-day increment from daily_health_snapshot
// signals. Cumulative across the trajectory window so the chart renders a
// monotonically growing total per client. Tunable rubric — see PR notes.
function dailyShapeScore(row: Record<string, unknown>): number {
  let s = 0;
  if (Number(row.workout_minutes ?? 0) >= 30) s += 10;
  if (Number(row.protein_g ?? 0) >= 100) s += 5;
  if (Number(row.sleep_hours ?? 0) >= 7) s += 3;
  if (Number(row.calories ?? 0) > 0) s += 2;
  return s;
}

type PushedItemRow = {
  id: string;
  client_id: string;
  kind: string;
  payload: Record<string, unknown>;
  sent_at: string;
};

type ConsoleClient = {
  id: string;
  name: string;
  status: 'current' | 'past';
  lastAt: string | null;
};

async function getProviderId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('trainers')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

// Fetches the trainer's client roster from subscriptions + sessions, grouped
// by client_id with a "current" / "past" status the dropdown groups by.
// "current" = active/trialing subscription OR a session in the last 60 days.
async function fetchClientsForProvider(
  supabase: Awaited<ReturnType<typeof createClient>>,
  providerId: number,
): Promise<ConsoleClient[]> {
  const [subRes, sessRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('client_id, status')
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId),
    supabase
      .from('sessions')
      .select('client_id, client_name, scheduled_at')
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId)
      .order('scheduled_at', { ascending: false })
      .limit(1000),
  ]);

  type Entry = { id: string; name: string; status: 'current' | 'past'; lastAt: number | null };
  const byId = new Map<string, Entry>();

  for (const sub of subRes.data ?? []) {
    if (!sub.client_id) continue;
    const e: Entry = byId.get(sub.client_id) ?? { id: sub.client_id, name: 'Client', status: 'past', lastAt: null };
    if (sub.status === 'active' || sub.status === 'trialing') e.status = 'current';
    byId.set(sub.client_id, e);
  }

  const now = Date.now();
  for (const s of sessRes.data ?? []) {
    if (!s.client_id) continue;
    const e: Entry = byId.get(s.client_id) ?? { id: s.client_id, name: 'Client', status: 'past', lastAt: null };
    if (s.client_name && e.name === 'Client') e.name = s.client_name;
    const t = new Date(s.scheduled_at).getTime();
    if (e.lastAt == null || t > e.lastAt) e.lastAt = t;
    if (now - t < RECENT_CLIENT_MS && e.status !== 'current') e.status = 'current';
    byId.set(s.client_id, e);
  }

  return [...byId.values()]
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .map((e) => ({ id: e.id, name: e.name, status: e.status, lastAt: e.lastAt ? new Date(e.lastAt).toISOString() : null }));
}

export async function GET(request: Request) {
  const { user, supabase } = await userForRequest(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const providerId = await getProviderId(supabase, user.id);
  if (providerId == null) {
    return NextResponse.json({ isTrainer: false, clients: [], focusByClient: {}, itemsByClient: {}, snapshotByClient: {} });
  }

  const clients = await fetchClientsForProvider(supabase, providerId);

  // Pull the supporting data for each client in parallel.
  // RLS does the gating: providers_read_subscriber_snapshots covers
  // daily_health_snapshot, providers_read_subscriber_profiles covers
  // client_profiles (added in 2026-05-22-client-profiles-provider-read).
  const snapshotByClient: Record<string, Record<string, unknown>> = {};
  const seriesByClient: Record<string, Record<string, Array<number | null>>> = {};
  const profileByClient: Record<string, { age: number | null; focus: string | null }> = {};

  if (clients.length > 0) {
    const clientIds = clients.map((c) => c.id);
    const since = new Date(Date.now() - TRAJECTORY_DAYS * 86_400_000).toISOString().slice(0, 10);

    const [snapRes, profRes] = await Promise.all([
      supabase
        .from('daily_health_snapshot')
        .select('user_id, snapshot_date, weight_lb, sleep_hours, resting_hr, stress, calories, protein_g, hrv_ms, recovery_score')
        .in('user_id', clientIds)
        .gte('snapshot_date', since)
        .order('snapshot_date', { ascending: true }),
      supabase
        .from('client_profiles')
        .select('user_id, data')
        .in('user_id', clientIds),
    ]);

    // daily_health_snapshot: walk ascending so the LAST row per client is
    // the latest snapshot. Also accumulate per-metric series for trajectory,
    // including a cumulative Shape Score derived per-day.
    const cumScoreByClient: Record<string, number> = {};
    for (const row of snapRes.data ?? []) {
      const uid = row.user_id as string;
      snapshotByClient[uid] = row as Record<string, unknown>;
      const s = (seriesByClient[uid] ??= { weight: [], sleep: [], hr: [], stress: [], protein: [], score: [] });
      s.weight.push(row.weight_lb != null ? Number(row.weight_lb) : null);
      s.sleep.push(row.sleep_hours != null ? Number(row.sleep_hours) : null);
      s.hr.push(row.resting_hr != null ? Number(row.resting_hr) : null);
      s.stress.push(row.stress != null ? Number(row.stress) : null);
      s.protein.push(row.protein_g != null ? Number(row.protein_g) : null);
      cumScoreByClient[uid] = (cumScoreByClient[uid] ?? 0) + dailyShapeScore(row as Record<string, unknown>);
      s.score.push(cumScoreByClient[uid]);
    }

    for (const row of profRes.data ?? []) {
      const uid = row.user_id as string;
      const data = (row.data ?? {}) as Record<string, unknown>;
      profileByClient[uid] = {
        age: ageFromDob(data.dob),
        focus: typeof data.goal === 'string' && data.goal ? data.goal : null,
      };
    }
  }

  const { data: bannerRows } = await supabase
    .from('coach_focus_banners')
    .select('client_id, text, sent_at')
    .eq('provider_role', ROLE)
    .eq('provider_id', providerId);

  const focusByClient: Record<string, string> = {};
  for (const b of bannerRows ?? []) {
    if (typeof b.client_id === 'string' && typeof b.text === 'string') {
      focusByClient[b.client_id] = b.text;
    }
  }

  const { data: itemRows } = await supabase
    .from('coach_pushed_items')
    .select('id, client_id, kind, payload, sent_at')
    .eq('provider_role', ROLE)
    .eq('provider_id', providerId)
    .is('removed_at', null)
    .order('sent_at', { ascending: true });

  const itemsByClient: Record<string, Array<Record<string, unknown>>> = {};
  for (const r of (itemRows ?? []) as PushedItemRow[]) {
    const list = itemsByClient[r.client_id] ?? [];
    list.push({ id: r.id, ...(r.payload ?? {}) });
    itemsByClient[r.client_id] = list;
  }

  return NextResponse.json({
    isTrainer: true,
    clients,
    focusByClient,
    itemsByClient,
    snapshotByClient,
    seriesByClient,
    profileByClient,
  });
}

export async function POST(req: Request) {
  const { user, supabase } = await userForRequest(req);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const providerId = await getProviderId(supabase, user.id);
  if (providerId == null) {
    return NextResponse.json({ error: 'Not a trainer.' }, { status: 403 });
  }

  const bodyResult = await readJson<
    | {
        clientId?: unknown;
        action?: unknown;
        text?: unknown;
        payload?: unknown;
        itemId?: unknown;
      }
    | null
  >(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const clientId = String(body?.clientId ?? '').trim();
  const action = String(body?.action ?? '').trim();
  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId.' }, { status: 400 });
  }

  // IDOR guard (AUTHZ-P2-console-idor): coaching content may only be written for a
  // client this coach ACTIVELY coaches. removeItem is owner+item scoped, so it
  // stays usable even after a subscription lapses. RLS enforces the same on INSERT.
  if (action !== 'removeItem') {
    const { data: onClient, error: gateErr } = await supabase.rpc('is_coach_on_client', {
      p_client_id: clientId,
    });
    if (gateErr) {
      return NextResponse.json({ error: 'Could not verify client access.' }, { status: 500 });
    }
    if (onClient !== true) {
      return NextResponse.json({ error: 'You can only push to your own active clients.' }, { status: 403 });
    }
  }

  if (action === 'focus') {
    const text = String(body?.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Focus text is empty.' }, { status: 400 });
    }
    const { error } = await supabase.from('coach_focus_banners').upsert(
      {
        provider_role: ROLE,
        provider_id: providerId,
        client_id: clientId,
        text,
        sent_at: new Date().toISOString(),
      },
      { onConflict: 'provider_role,provider_id,client_id' },
    );
    if (error) return dbError(error, 'trainer console write', 400);
    return NextResponse.json({ ok: true });
  }

  if (action === 'addItem') {
    const payload = body?.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : null;
    const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!payload || !name) {
      return NextResponse.json({ error: 'Exercise name is required.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('coach_pushed_items')
      .insert({
        provider_role: ROLE,
        provider_id: providerId,
        client_id: clientId,
        kind: KIND,
        payload,
      })
      .select('id')
      .single();
    if (error) return dbError(error, 'trainer console write', 400);
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === 'removeItem') {
    const itemId = String(body?.itemId ?? '').trim();
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId.' }, { status: 400 });
    }
    const { error } = await supabase
      .from('coach_pushed_items')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId);
    if (error) return dbError(error, 'trainer console write', 400);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
