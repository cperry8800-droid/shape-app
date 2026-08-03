// Daily: the silent-failure check over analytics_events (error-tracking Layer 2).
//
// Sentry cannot see any of this. The progression guardrail NEVER THROWS BY
// CONTRACT, so a broken guardrail is indistinguishable from a healthy one at the
// exception layer. This job is the only thing that would notice.
//
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { bsEvaluateHealth, bsReadState, bsReadStateNote } from '@/lib/guardrail-health.mjs';

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

type EvalRow = { id: string; ts: string; props: unknown };

/**
 * One value inside a PostgREST `or(...)` group, safe to embed.
 *
 * ⚠ `,` `.` `:` `(` `)` are RESERVED inside a logic tree, and an ISO timestamp
 * carries `.` (milliseconds), `:` (the time separator) and usually a `+00:00`
 * offset — PostgREST returns `timestamptz` in that form, so the cursor value is
 * exactly the shape that needs quoting. Double quotes are PostgREST's documented
 * escape; supabase-js builds the query through `URLSearchParams`, so the quotes
 * and the `+` are percent-encoded for us.
 *
 * A `"` cannot occur in a `uuid` or a `timestamptz` rendering, so the strip is
 * belt-and-braces: a stray quote would terminate the value early and change what
 * the filter means, which is the one failure mode worth spending a line on.
 */
const orValue = (v: string) => `"${String(v).replace(/"/g, '')}"`;

/**
 * The 7-day evaluation read: NEWEST FIRST, explicitly bounded, and honest about
 * whether it saw everything.
 *
 * ⚠ FIVE THINGS HERE ARE LOAD-BEARING, and the original read had none of them.
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
 * 2. **KEYSET PAGING, NOT `range()`.** ⚠ `.range(from, to)` is an OFFSET into a
 *    result set that is recomputed per request. Insert one evaluation between
 *    two pages and every later offset shifts by one: a boundary row is fetched
 *    twice and an older row is never fetched at all — and when the original
 *    count is an exact multiple of the page size, `rows.length === matched` so
 *    `truncated` stays FALSE. The run then reports a complete read that skipped
 *    a row, and the skipped row can be the malformed one. The `id` tiebreak
 *    stabilises ORDER within one snapshot; it does nothing across snapshots.
 *    A cursor on the last `(ts, id)` pair is immune, because each page asks for
 *    rows strictly BEFORE a fixed point rather than at a counted position — a
 *    row inserted mid-read is newer than the cursor and simply never appears.
 *    The ceiling stays: a cursor removes the shifting window, not the need to
 *    bound the read.
 * 3. **AN EXACT COUNT, NOT A LENGTH COMPARISON.** `count: 'exact'` returns the
 *    true number of matching rows from Content-Range regardless of any page cap,
 *    so comparing it against what we actually read is a truncation test that
 *    cannot be fooled by the server capping a page. Comparing `rows.length`
 *    against a limit we chose would be.
 * 4. **TRUNCATION IS REPORTED, NEVER SWALLOWED.** A capped read must never be
 *    indistinguishable from a complete one. When it happens, the rates are still
 *    a valid sample of the newest rows, but `malformed` — "any occurrence over
 *    7d" — can no longer prove absence, so the caller logs it and persists it.
 *    It is set when the read reached the ceiling, AND when the final row count
 *    disagrees with `matched` in EITHER direction — a set that grew under the
 *    read is as interesting as one that shrank.
 *
 *    ⚠ **`rows.length === matched` IS NOT PROOF OF A COMPLETE READ, so reaching
 *    the ceiling stays `truncated` even when the counts agree.** This looks like
 *    a false positive and is not one. `matched` is the count from page 0's
 *    snapshot; a row backfilled with an OLD `ts` into a region the cursor has
 *    ALREADY paged past is never fetched (the cursor only ever moves older, and
 *    the row was not there when that page was read) and was never counted in
 *    `matched` either. The two numbers therefore agree while a row is missing —
 *    the exact silent omission point 5 exists to prevent, arriving through a
 *    different door. Treating equality as proof would reopen it. What the
 *    counts DO justify is describing the run honestly rather than alarmingly:
 *    ceiling-with-agreement is a different sentence in the log and a different
 *    `_read.state` in the history than ceiling-with-disagreement (see
 *    `bsReadState`), because a human reading that history months later needs to
 *    tell "filled its budget, nothing known missing" from "demonstrably lost
 *    rows". The flag stays conservative; only the words get precise.
 * 5. **`matched` IS A REPORTING VALUE, NOT A STOP CONDITION — DO NOT "SIMPLIFY"
 *    IT BACK INTO THE LOOP.** Stopping at `rows.length >= matched` reads like an
 *    obvious early exit and is a silent row-loss bug. `matched` is captured from
 *    the FIRST page's snapshot; every later page reads a database that has moved
 *    on. A row backfilled with a `ts` OLDER than the current cursor is inserted
 *    after that snapshot, so it appears on a later page even though it was never
 *    counted in `matched` — and it consumes the same budget, displacing the
 *    oldest original row off the end of the read. The two counts then land
 *    EXACTLY equal, `truncated` stays false, and the run reports a complete read
 *    that silently omitted an evaluation. (An earlier version of this comment
 *    claimed the residual was safe because the mismatch would surface as
 *    `rows.length < matched`. That was wrong: equality is precisely the case a
 *    displacement produces.) The omitted row can be the malformed one, and
 *    malformed is the check with no floor and any-occurrence semantics — one
 *    dropped row turns a real alert into `ok/0`. So the loop stops ONLY on
 *    genuine exhaustion (an empty page, or a page shorter than the one asked
 *    for) or on the EVAL_MAX_ROWS ceiling, and `matched` is consulted only
 *    afterwards, as the disagreement test above.
 */
async function readEvaluations(
  admin: ReturnType<typeof createAdminClient>,
  since: string,
): Promise<{ rows: EvalRow[]; matched: number | null; truncated: boolean; state: string }> {
  const rows: EvalRow[] = [];
  let matched: number | null = null;
  let cursor: { ts: string; id: string } | null = null;

  while (rows.length < EVAL_MAX_ROWS) {
    const first = cursor === null;
    const want = Math.min(EVAL_PAGE_ROWS, EVAL_MAX_ROWS - rows.length);

    let q = admin
      .from('analytics_events')
      .select('id, ts, props', first ? { count: 'exact' } : undefined)
      .eq('event', 'guardrail_evaluated')
      .gte('ts', since);
    if (cursor) {
      // `ts < c.ts OR (ts = c.ts AND id < c.id)` — ONE filter, so it AND-s with
      // the event/since predicates and keeps the `ts desc, id desc` order intact.
      const ts = orValue(cursor.ts);
      q = q.or(`ts.lt.${ts},and(ts.eq.${ts},id.lt.${orValue(cursor.id)})`);
    }

    const { data, count, error } = await q
      .order('ts', { ascending: false })
      .order('id', { ascending: false })
      .limit(want);
    if (error) throw new Error(`guardrail_evaluated query failed: ${error.message}`);

    const page = (data ?? []) as EvalRow[];
    rows.push(...page);
    if (first && typeof count === 'number') matched = count;

    // ── THE ONLY STOP CONDITIONS. See point 5 above: `matched` is NOT one of
    //    them, and adding it back reintroduces the concealed-omission bug.

    // Exhaustion: nothing older than the cursor exists.
    if (page.length === 0) break;

    // ⚠ A row with no usable cursor pair cannot anchor the next page, and
    // guessing one would either repeat rows forever or skip past them. Stop, and
    // let the truncation test below report the short read honestly.
    const last = page[page.length - 1];
    if (!last || typeof last.ts !== 'string' || typeof last.id !== 'string') break;
    cursor = { ts: last.ts, id: last.id };

    // Exhaustion again: a page shorter than the one asked for means the server
    // ran out of rows before the cursor. This is a sound end-of-data signal only
    // because EVAL_PAGE_ROWS is held at or below PostgREST's "Max rows" cap (see
    // its declaration). If that invariant were ever broken, EVERY page would come
    // back short, the read would stop after one page — and `rows.length` would
    // then disagree with `matched`, so it reports as truncated rather than as a
    // clean read. The failure mode of the invariant is loud, not silent.
    if (page.length < want) break;

    // and the ceiling, which is the `while` condition — it keeps the read bounded
    // for the 8s `statement_timeout` on `service_role` and for memory.
  }

  // ⚠ EITHER DIRECTION. Fewer rows than `matched` is the obvious truncation.
  // MORE rows than `matched` means the set grew under the read, so the window
  // this run judged is not the window the count describes — equally worth
  // flagging, and equally a reason not to treat a `malformed: ok/0` from it as
  // proof of absence. Over-reporting here is the safe direction; the alternative
  // is a run that quietly certifies a read it cannot vouch for.
  //
  // ⚠ DO NOT ADD `&& rows.length !== matched` TO THE CEILING CLAUSE. Equality is
  // not proof of completeness — see point 4. The precision belongs in `state`,
  // which describes WHICH of these happened; the flag stays conservative.
  const truncated = rows.length >= EVAL_MAX_ROWS
    || (matched !== null && rows.length !== matched);
  const state = bsReadState({ rows: rows.length, matched, ceiling: EVAL_MAX_ROWS });
  return { rows, matched, truncated, state };
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
 * Layer 1 (Sentry) has landed — this now fires BOTH sinks for every alert: the
 * existing `console.error` (Vercel logs, and the run record persists
 * independently of this function entirely) AND a `Sentry.captureMessage`
 * tagged with the alert + the specific check.
 *
 * ⚠ SENTRY IS INERT UNTIL A DSN EXISTS. With no `SENTRY_DSN` configured,
 * `Sentry.captureMessage` runs against a disabled SDK and is a documented
 * no-op — so today this still behaves exactly as it did before Layer 1: only
 * the log fires. `console.error` is KEPT for exactly that reason — dropping
 * it in favour of Sentry would mean a finding reaches nobody at all until a
 * DSN is configured, which is precisely the silent-alerting failure Layer 2
 * exists to catch, one level up.
 */
function reportAlerts(
  alerts: Array<{ check: string; severity: string; message: string; state?: string }>,
): void {
  for (const a of alerts) {
    // ⚠ `info` MUST NOT LOG AT ERROR LEVEL. A read that merely spent its row
    // budget with the count in agreement is not an incident, and an error-level
    // line on a run with nothing known missing is exactly the noise that gets a
    // check muted — after which the warning-level ones stop being read too.
    // This mapping is why the truncation alert can now come through here
    // instead of logging inline: routing it used to mean losing the split.
    const log = a.severity === 'info' ? console.warn : console.error;
    log('[shape-health]', JSON.stringify({ alert: 'guardrail-health', ...a }));
    // ⚠ A throw here — from the SDK itself, or from a future change to it —
    // must never cost an alert its console.error line above, which is the
    // ONLY sink that exists before a DSN is configured. Caught and swallowed,
    // not re-raised: the same "total function" discipline as `bsSentryUser`
    // in sentry-context.mjs:38-46 — a failure while reporting one finding
    // must never become a second, worse one (a job that dies mid-loop and
    // reports the rest of the alerts to nobody, not even the log).
    try {
      Sentry.captureMessage(a.message, {
        level: a.severity === 'info' ? 'info' : a.severity === 'warning' ? 'warning' : 'error',
        // `state` rides along when the alert carries one (today: the
        // evaluation_read truncation finding). The console line already gets it
        // via the `...a` spread above; without it here the ONE field that
        // distinguishes "this run read everything" from "this run lost rows" is
        // filterable in the log and invisible in the dashboard — which is the
        // wrong way round, since the dashboard is where a human looks.
        tags: { alert: 'guardrail-health', check: a.check, ...(a.state ? { state: a.state } : {}) },
      });
    } catch {
      // deliberately empty — see the comment above.
    }
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
    const { rows: rawEvals, matched, truncated, state } = await readEvaluations(admin, since7d);
    const read = { evaluations: rawEvals.length, matched, truncated, state };
    if (truncated || matched === null) {
      // ⚠ ONE FLAG, FOUR DIFFERENT FACTS — AND THE LOG MUST SAY WHICH. Every
      // verdict below was computed on a read that cannot PROVE it saw the whole
      // window (see point 4: `rows === matched` is not proof), so the flag stays
      // set for all of them. But "filled its 5000-row budget with the count in
      // agreement" and "demonstrably lost rows" are not the same event, and a
      // history in which they read identically is a history nobody can use: the
      // reader either treats every ceiling-length run as an incident or learns to
      // skip the line entirely. `bsReadStateNote` supplies the sentence for the
      // case that actually occurred; `state` carries the same distinction into the
      // persisted record, where it outlives the log.
      //
      // Severity follows the same split. `warning` is for a read with evidence of
      // loss; `info` is for one that merely spent its budget — an error-level line
      // on a run with nothing known missing is the noise that gets a check muted.
      const severity = state === 'ceiling_exact' ? 'info' : 'warning';
      // ⚠ GOES THROUGH reportAlerts, NOT AN INLINE LOG. This used to emit its
      // own console line, which meant it was the ONE finding structurally
      // excluded from the Sentry path — and it is the finding that says "do not
      // trust this run's other verdicts", because every one of them was computed
      // on a read that may have lost rows. A degraded read reaching only Vercel
      // logs while the verdicts it undermines reach Sentry is worse than not
      // alerting at all: the dashboard reads clean.
      reportAlerts([{
        check: 'evaluation_read',
        severity,
        state,
        message: bsReadStateNote({ state, rows: rawEvals.length, matched, ceiling: EVAL_MAX_ROWS }),
      }]);
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
    // ⚠ THE JOB DYING IS THE ONE FAILURE NOTHING ELSE COVERS. Withheld
    // heartbeat is the intended signal, but HEARTBEAT_PING_URL is unset today,
    // so without this a thrown run reaches Vercel logs and nobody. Swallowed
    // like reportAlerts' capture, for the same reason: a failure while
    // reporting a failure must not replace it.
    try {
      Sentry.captureException(e, { tags: { alert: 'guardrail-health', check: 'run_failed' } });
    } catch {
      // deliberately empty — the console.error above is the sink that always runs.
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
