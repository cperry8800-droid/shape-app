// Check-in kit for the WEBSITE client pages (cookie session; Bearer also works).
// The mobile app talks to Supabase directly — this thin route exists so the
// self-contained newdesign pages can read/write the same RLS-scoped tables.
//
// GET  → { ok, weekOf, checkins, measurements, health }
// POST { action: 'checkin', ratings, wins?, struggles?, question?, weight?, unit?,
//        measurements?: [{site,value,unit}] }
//      { action: 'health', doc }      → upserts user_goals('health_profile')
//
// All writes ride the caller's session client, so RLS owns the scoping.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function weekOfMonday(): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const SITES = new Set(['waist', 'hips', 'chest', 'arm', 'thigh', 'calf', 'neck', 'shoulders']);

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const [checkins, measurements, health] = await Promise.all([
    supabase.from('client_checkins').select('*').eq('user_id', user.id).order('week_of', { ascending: false }).limit(8),
    supabase.from('client_measurements').select('*').eq('user_id', user.id).order('measured_on', { ascending: true }),
    supabase.from('user_goals').select('data').eq('user_id', user.id).eq('kind', 'health_profile').maybeSingle(),
  ]);
  return NextResponse.json({
    ok: true,
    weekOf: weekOfMonday(),
    checkins: checkins.data ?? [],
    measurements: measurements.data ?? [],
    health: health.data?.data ?? null,
  });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const action = String(body.action || '');

  if (action === 'health') {
    const doc = body.doc && typeof body.doc === 'object' ? body.doc : null;
    if (!doc) return NextResponse.json({ error: 'Missing health profile.' }, { status: 400 });
    const { error } = await supabase
      .from('user_goals')
      .upsert({ user_id: user.id, kind: 'health_profile', data: doc }, { onConflict: 'user_id,kind' });
    if (error) return dbError(error, 'checkin kit write', 500);
    return NextResponse.json({ ok: true });
  }

  if (action === 'checkin') {
    const w = Number(body.weight);
    const row = {
      user_id: user.id,
      week_of: weekOfMonday(),
      ratings: body.ratings && typeof body.ratings === 'object' ? body.ratings : {},
      wins: String(body.wins || '').trim() || null,
      struggles: String(body.struggles || '').trim() || null,
      question: String(body.question || '').trim() || null,
      weight: Number.isFinite(w) && w > 0 ? w : null,
      unit: body.unit === 'lb' ? 'lb' : 'kg',
    };
    const { error } = await supabase.from('client_checkins').upsert(row, { onConflict: 'user_id,week_of' });
    if (error) return dbError(error, 'checkin kit write', 500);

    const today = new Date().toISOString().slice(0, 10);
    const entries = (Array.isArray(body.measurements) ? body.measurements : [])
      .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>) : {}))
      .filter((e) => SITES.has(String(e.site)) && Number.isFinite(Number(e.value)) && Number(e.value) > 0)
      .map((e) => ({
        user_id: user.id,
        measured_on: today,
        site: String(e.site),
        value: Number(e.value),
        unit: e.unit === 'in' ? 'in' : 'cm',
      }));
    if (entries.length) {
      const { error: mErr } = await supabase
        .from('client_measurements')
        .upsert(entries, { onConflict: 'user_id,measured_on,site' });
      if (mErr) return dbError(mErr, 'measurement write', 500);
    }
    return NextResponse.json({ ok: true, weekOf: row.week_of });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
