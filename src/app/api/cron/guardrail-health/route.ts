// Daily: the silent-failure check over analytics_events (error-tracking Layer 2).
//
// Sentry cannot see any of this. The progression guardrail NEVER THROWS BY
// CONTRACT, so a broken guardrail is indistinguishable from a healthy one at the
// exception layer. This job is the only thing that would notice.
//
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { bsEvaluateHealth } from '@/lib/guardrail-health.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  return safeEqual(req.headers.get('x-cron-secret') || '', secret)
    || safeEqual(req.headers.get('authorization') || '', `Bearer ${secret}`);
}

/**
 * Where an alert goes.
 *
 * ⚠ Sentry does not exist in this repo yet, so this logs. When Layer 1 lands,
 * THIS FUNCTION BODY is the single place that changes — nothing else in the job
 * knows how an alert is delivered. Until then the findings reach Vercel logs and
 * the run record, and no further.
 */
function reportAlerts(alerts: Array<{ check: string; severity: string; message: string }>): void {
  for (const a of alerts) {
    console.error('[shape-health]', JSON.stringify({ alert: 'guardrail-health', ...a }));
  }
}

/**
 * The dead-man's switch.
 *
 * ⚠ Deliberately provider-agnostic: a plain GET to whatever URL is configured.
 * Sentry cron monitors, Healthchecks.io and Cronitor all accept exactly this, so
 * the heartbeat is not blocked on choosing one — and, critically, not blocked on
 * Sentry existing.
 *
 * ⚠ A HEARTBEAT IS ABOUT THE JOB RUNNING, NOT ABOUT THE CHECKS FINDING NOTHING.
 * A run where all four checks report insufficient_sample is a HEALTHY run and
 * must still ping. Only an actual failure to complete withholds it.
 */
async function sendHeartbeat(): Promise<'sent' | 'skipped' | 'failed'> {
  const url = process.env.HEARTBEAT_PING_URL || '';
  if (!url) return 'skipped';
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const admin = createAdminClient();
    const nowISO = new Date().toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. The RPE drops, last 24h. head:true so no rows cross the wire.
    const { count: rpeDropped, error: rpeErr } = await admin
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'session_rpe_dropped')
      .gte('ts', since24h);
    if (rpeErr) throw new Error(`rpe_dropped query failed: ${rpeErr.message}`);

    // ── 2. The evaluations, last 7d. Only the two fields the checks read.
    const { data: rawEvals, error: evalErr } = await admin
      .from('analytics_events')
      .select('props')
      .eq('event', 'guardrail_evaluated')
      .gte('ts', since7d);
    if (evalErr) throw new Error(`guardrail_evaluated query failed: ${evalErr.message}`);

    const evaluations = (rawEvals ?? []).map((r: { props: unknown }) => {
      const p = (r && typeof r.props === 'object' && r.props !== null ? r.props : {}) as
        Record<string, unknown>;
      return {
        state: typeof p.state === 'string' ? p.state : null,
        unknownReason: typeof p.unknownReason === 'string' ? p.unknownReason : null,
      };
    });

    // ── 3. The previous verdicts, for the transition test.
    //
    // ⚠ A MISSING TABLE MUST NOT KILL THE RUN. This ships before the migration is
    // applied; with no prior record every check reads as a fresh transition, which
    // is the safe direction — it over-reports once rather than staying silent.
    let previous: Record<string, unknown> | null = null;
    const { data: prevRow, error: prevErr } = await admin
      .from('guardrail_health_runs')
      .select('verdicts')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevErr) console.error('[shape-health] previous run unreadable:', prevErr.message);
    else if (prevRow) previous = prevRow.verdicts as Record<string, unknown>;

    // ── 4. The verdict.
    const { verdicts, alerts } = bsEvaluateHealth({
      rpeDropped: rpeDropped ?? 0, evaluations, previous, nowISO,
    });

    reportAlerts(alerts);

    // ── 5. Persist. A failed insert is logged, never thrown: losing the record
    //       costs the next run its transition test, which is far better than
    //       losing the alerts that were just raised.
    const { error: insErr } = await admin
      .from('guardrail_health_runs')
      .insert({ ran_at: nowISO, verdicts, alerted: alerts.length > 0 });
    if (insErr) console.error('[shape-health] run record not saved:', insErr.message);

    // ── 6. The heartbeat, last, and only on a completed run.
    const heartbeat = await sendHeartbeat();

    return NextResponse.json({ ok: true, verdicts, alerted: alerts.length, heartbeat });
  } catch (e) {
    // ⚠ NO HEARTBEAT ON THIS PATH. A job that threw did not do its work, and a
    // dead-man's switch that pings anyway is worse than none — it reports health
    // it did not verify.
    console.error('[shape-health] run failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
