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

/**
 * Rows per request. ⚠ MUST STAY AT OR BELOW PostgREST's "Max rows" setting
 * (default 1000). Above it the server silently caps the page and every page
 * looks short, which is exactly the trap that makes a naive
 * `rows.length === LIMIT` truncation test read "complete" on a capped read.
 */
const EVAL_PAGE_ROWS = 500;

/**
 * Hard ceiling on the 7-day read. ⚠ `service_role` carries
 * `statement_timeout = 8s`, so an unbounded read is a timeout risk as well as a
 * memory one. Exceeding this is not silently tolerated — it sets `truncated`,
 * which is reported and persisted.
 */
const EVAL_MAX_ROWS = 5000;

type EvalRow = { props: unknown };

/**
 * The 7-day evaluation read: NEWEST FIRST, explicitly bounded, and honest about
 * whether it saw everything.
 *
 * ⚠ THREE THINGS HERE ARE LOAD-BEARING, and the original read had none of them.
 *
 * 1. **ORDER.** With no `order()` PostgREST still applies its "Max rows" cap, and
 *    the scan over `analytics_events_event_ts_idx (event, ts)` comes back
 *    TS-ASCENDING — so the rows silently dropped were the MOST RECENT ones.
 *    Adjust writes one row per evaluated week inside a `map`, so ~83 twelve-week
 *    regenerations in 7 days is enough to reach 1000. A malformed row from
 *    yesterday then vanishes, `malformed` reports `ok/0`, and a check with no
 *    floor and any-occurrence semantics never fires again. Newest-first means a
 *    capped read loses the OLDEST rows instead, which is the survivable
 *    direction. `id` is the tiebreak so identical timestamps cannot make
 *    pagination skip or repeat a row.
 * 2. **AN EXACT COUNT, NOT A LENGTH COMPARISON.** `count: 'exact'` returns the
 *    true number of matching rows from Content-Range regardless of any page cap,
 *    so `fetched < matched` is a truncation test that cannot be fooled by the
 *    server capping a page. Comparing `rows.length` against a limit we chose
 *    would be.
 * 3. **TRUNCATION IS REPORTED, NEVER SWALLOWED.** A capped read must never be
 *    indistinguishable from a complete one. When it happens, the rates are still
 *    a valid sample of the newest rows, but `malformed` — "any occurrence over
 *    7d" — can no longer prove absence, so the caller logs it and persists it.
 */
async function readEvaluations(
  admin: ReturnType<typeof createAdminClient>,
  since: string,
): Promise<{ rows: EvalRow[]; matched: number | null; truncated: boolean }> {
  const rows: EvalRow[] = [];
  let matched: number | null = null;

  for (let from = 0; from < EVAL_MAX_ROWS; from += EVAL_PAGE_ROWS) {
    const to = Math.min(from + EVAL_PAGE_ROWS, EVAL_MAX_ROWS) - 1;
    const { data, count, error } = await admin
      .from('analytics_events')
      .select('props', from === 0 ? { count: 'exact' } : undefined)
      .eq('event', 'guardrail_evaluated')
      .gte('ts', since)
      .order('ts', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throw new Error(`guardrail_evaluated query failed: ${error.message}`);

    const page = (data ?? []) as EvalRow[];
    rows.push(...page);
    if (from === 0 && typeof count === 'number') matched = count;

    if (page.length === 0) break;
    if (matched !== null && rows.length >= matched) break;
    // Only reachable if the exact count did not come back at all. A page shorter
    // than the one requested is then the sole end-of-data signal available, and
    // it is genuinely ambiguous (the server may have capped us) — which is why
    // `matched: null` is surfaced rather than presented as a clean read.
    if (matched === null && page.length < to - from + 1) break;
  }

  const truncated = matched !== null ? rows.length < matched : rows.length >= EVAL_MAX_ROWS;
  return { rows, matched, truncated };
}

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
    // ⚠ 25 HOURS, NOT 24, AND THE EXTRA HOUR IS NOT COSMETIC. Both bounds are
    // taken from `Date.now()` at execution, so consecutive daily runs cover
    // [N-24h, N] and [N+1-24h, N+1]. Any positive cron drift — and cron
    // scheduling drifts — leaves the sliver (N, N+1-24h) covered by NEITHER run,
    // and a `session_rpe_dropped` row landing in it is never counted by anything.
    // The overlap this creates is harmless: `shouldNotify` suppresses a repeat
    // notification while an alert is already open, so a row seen twice produces
    // one alert, not two. Missing a row entirely has no such safety net.
    const since25h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. The RPE drops, last 25h. head:true so no rows cross the wire, and
    //       the exact count is the whole answer — nothing here can truncate.
    const { count: rpeDropped, error: rpeErr } = await admin
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'session_rpe_dropped')
      .gte('ts', since25h);
    if (rpeErr) throw new Error(`rpe_dropped query failed: ${rpeErr.message}`);

    // ── 2. The evaluations, last 7d — newest first, bounded, truncation-aware.
    const { rows: rawEvals, matched, truncated } = await readEvaluations(admin, since7d);
    const read = { evaluations: rawEvals.length, matched, truncated };
    if (truncated || matched === null) {
      // Loud, because every 7-day verdict below was computed on a partial read:
      // the rates remain a valid sample of the newest rows, but `malformed` can
      // no longer prove absence, and `ok/0` from it means "none in what we saw".
      console.error('[shape-health]', JSON.stringify({
        alert: 'guardrail-health',
        check: 'evaluation_read',
        severity: 'warning',
        message: `The 7d evaluation read was incomplete: ${rawEvals.length} of `
          + `${matched === null ? 'an unknown total' : matched} rows. Verdicts below `
          + 'cover only the newest rows, so a malformed "ok" is not proof of absence.',
      }));
    }

    const evaluations = rawEvals.map((r: { props: unknown }) => {
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
    //
    // ⚠ `_read` RIDES IN THE PERSISTED VERDICTS ON PURPOSE. A human reading the
    // history months later has to be able to tell a run that checked everything
    // from a run that checked the newest 5000 rows and stopped; without it a
    // capped run is indistinguishable from a clean one in the record. The
    // underscore keeps it out of the check namespace — `bsEvaluateHealth` only
    // ever looks the previous run up by check name, so it is inert as input.
    const { error: insErr } = await admin
      .from('guardrail_health_runs')
      .insert({ ran_at: nowISO, verdicts: { ...verdicts, _read: read }, alerted: alerts.length > 0 });
    if (insErr) console.error('[shape-health] run record not saved:', insErr.message);

    // ── 6. The heartbeat, last, and only on a completed run.
    const heartbeat = await sendHeartbeat();

    return NextResponse.json({ ok: true, verdicts, read, alerted: alerts.length, heartbeat });
  } catch (e) {
    // ⚠ NO HEARTBEAT ON THIS PATH. A job that threw did not do its work, and a
    // dead-man's switch that pings anyway is worse than none — it reports health
    // it did not verify.
    console.error('[shape-health] run failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
