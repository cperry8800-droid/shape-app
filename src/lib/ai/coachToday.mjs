// "What needs me today?" for a coach (the Ask Nora plan, step 5), from reads that exist:
//   - the booking requests waiting on them to confirm (sessions they are the provider on);
//   - today's sessions, on the coach's own clock;
//   - the clients the Today screen would flag, by the same engine the app's Today runs
//     (DashSignals.getTriageFeed over records built by signalsMap.recordFromCoachData from
//     the get_client_* rollups), with the coach's own signal tuning.
// Everything is read with the COACH'S own client, so RLS and the gated definer RPCs decide
// what comes back; a leg that fails says so rather than reading as "nothing".
import DashSignals from '../../../public/newdesign/dashSignals.js';
import { recordFromCoachData } from '../../../mobile-app/src/services/signalsMap.mjs';
import { readCoachRoster } from './memberReads.mjs';
import { validZone, localClock } from './noraContext.mjs';

export const TODAY_CAPS = Object.freeze({ clients: 30, sessions: 100, requests: 10, flagged: 8, horizonDays: 14, pool: 6 });

const engine = DashSignals;

async function leg(promise) {
  try {
    const r = await promise;
    if (r && r.error) return { ok: false, data: null };
    return { ok: true, data: r ? r.data : null };
  } catch { return { ok: false, data: null }; }
}
// A session's moment as the coach reads it, in their zone.
function when(iso, zone, withDay) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const opts = withDay
    ? { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { timeZone: zone, hour: 'numeric', minute: '2-digit' };
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}
const clip = (v, n) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null);

// Run `fn` over `items`, `size` at a time.
async function pooled(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// The coach's own tuning of the signals (Settings → signal thresholds), re-validated by the
// engine; null when nothing is tuned or it cannot be read, so house policy applies.
async function coachThresholds(sb, uid) {
  const r = await leg(sb.from('user_goals').select('data').eq('user_id', uid).eq('kind', 'coach_settings').maybeSingle());
  const t = r.ok && r.data && r.data.data && typeof r.data.data.thresholds === 'object' ? r.data.data.thresholds : null;
  if (!t) return null;
  try { return engine.resolveThresholds(t).thresholds; } catch { return null; }
}

/**
 * @param {any} sb   the coach's own Supabase client
 * @param {string} uid
 * @param {{ now?: Date, zone?: string, role?: string|null }} [opts]
 */
export async function readCoachToday(sb, uid, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const zone = validZone(opts.zone) || 'UTC';
  const roster = await readCoachRoster(sb, uid);
  if (!roster.ok) return { ok: false };
  if (!roster.isCoach) return { ok: true, isCoach: false };
  const clock = localClock(now, zone);
  const out = { ok: true, isCoach: true, timezone: zone, today: `${clock.day} (${clock.weekday})`, now: clock.time };
  const nameById = new Map(roster.clients.map((c) => [c.id, c.name]));

  // ── Bookings: requests to confirm, and today's sessions ──
  // From a day back (today in any zone), to the request horizon; requested or confirmed
  // only. One read per listing the coach owns: a booking names its provider by role + id.
  const from = new Date(now.getTime() - 36 * 3600e3).toISOString();
  const to = new Date(now.getTime() + TODAY_CAPS.horizonDays * 864e5).toISOString();
  const legs = await Promise.all((roster.providers || []).map((p) => leg(
    sb.from('sessions').select('id, client_id, scheduled_at, duration_min, type, topic, status')
      .eq('provider_role', p.role).eq('provider_id', p.id).in('status', ['requested', 'confirmed'])
      .gte('scheduled_at', from).lte('scheduled_at', to).order('scheduled_at', { ascending: true }).limit(TODAY_CAPS.sessions),
  )));
  if (legs.length && legs.every((l) => !l.ok)) {
    out.sessionsUnavailable = true;
  } else {
    if (legs.some((l) => !l.ok)) out.sessionsPartial = true;
    const rows = legs.flatMap((l) => (l.ok && Array.isArray(l.data) ? l.data : []))
      .filter((r) => r && r.scheduled_at && !Number.isNaN(new Date(r.scheduled_at).getTime()))
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
    // Someone booking an intro is often not a client yet: their name comes the way the
    // roster's does (get_display_names), never from a profiles read.
    const unknown = [...new Set(rows.map((r) => r.client_id).filter((id) => id && !nameById.has(id)))];
    if (unknown.length) {
      const n = await leg(sb.rpc('get_display_names', { p_ids: unknown }));
      for (const r of (n.ok && Array.isArray(n.data) ? n.data : [])) if (r && r.user_id) nameById.set(r.user_id, clip(r.full_name, 80));
    }
    const who = (id) => nameById.get(id) || 'a client';
    const kind = (r) => [clip(r.type, 30), clip(r.topic, 80)].filter(Boolean).join(' · ') || null;
    const requests = rows.filter((r) => r.status === 'requested' && Date.parse(r.scheduled_at) >= now.getTime());
    out.requestsToConfirm = {
      count: requests.length,
      items: requests.slice(0, TODAY_CAPS.requests).map((r) => ({ name: who(r.client_id), when: when(r.scheduled_at, zone, true), ...(kind(r) ? { what: kind(r) } : {}) })),
    };
    out.sessionsToday = rows.filter((r) => localClock(new Date(r.scheduled_at), zone).day === clock.day).map((r) => ({
      time: when(r.scheduled_at, zone, false), name: who(r.client_id),
      status: r.status === 'requested' ? 'requested, not confirmed yet' : 'confirmed',
      ...(kind(r) ? { what: kind(r) } : {}),
      ...(Number(r.duration_min) > 0 ? { minutes: Number(r.duration_min) } : {}),
      ...(Date.parse(r.scheduled_at) < now.getTime() ? { past: true } : {}),
    }));
  }

  // ── Clients who need them: the Today screen's triage ──
  const clients = roster.clients.slice(0, TODAY_CAPS.clients);
  const role = opts.role === 'trainer' || opts.role === 'nutritionist' ? opts.role
    : (roster.providers || []).some((p) => p.role === 'trainer') ? 'trainer' : 'nutritionist';
  if (clients.length) {
    const thresholds = await coachThresholds(sb, uid);
    let read = 0;
    const records = await pooled(clients, TODAY_CAPS.pool, async (c) => {
      const [stats, goals, checkins] = await Promise.all([
        leg(sb.rpc('get_client_stats', { p_user_id: c.id })),
        leg(sb.rpc('get_client_goals', { p_user_id: c.id })),
        leg(sb.rpc('get_client_checkins', { p_user_id: c.id, p_limit: 2 })),
      ]);
      // get_client_stats is NULL for anyone who is not this coach's active client: no record,
      // never a fabricated zero.
      if (!stats.ok || !stats.data || typeof stats.data !== 'object') return null;
      read += 1;
      return recordFromCoachData({
        id: c.id, name: c.name || 'Client', stats: stats.data,
        goalsDoc: goals.ok ? goals.data : null,
        checkins: checkins.ok && Array.isArray(checkins.data) ? checkins.data : null,
      }, { goalsFromDoc: engine.goalsFromDoc });
    });
    let feed = [];
    try { feed = engine.getTriageFeed(role, records.filter(Boolean), now, thresholds || undefined) || []; } catch { feed = []; }
    const flagged = feed.filter((r) => r && (r.severity === 'red' || r.severity === 'amber'));
    out.needsYou = {
      checked: read, of: roster.clients.length,
      ...(roster.clients.length > clients.length ? { onlyFirst: clients.length } : {}),
      items: flagged.slice(0, TODAY_CAPS.flagged).map((r) => ({
        name: (r.client && r.client.profile && r.client.profile.name) || 'Client',
        severity: r.severity,
        // The verdict and its reason, never the directive's action: that line is the
        // client's ("log a meal today"), and this answer is for the coach.
        why: clip([r.directive && r.directive.verdict, r.directive && r.directive.reason].filter(Boolean).join(': '), 280) || clip((r.reasons || []).join('; '), 280) || 'flagged',
      })),
      ...(flagged.length > TODAY_CAPS.flagged ? { more: flagged.length - TODAY_CAPS.flagged } : {}),
    };
  } else {
    out.needsYou = { checked: 0, of: 0, items: [] };
  }
  if (roster.namesUnavailable) out.namesUnavailable = true;
  return out;
}
