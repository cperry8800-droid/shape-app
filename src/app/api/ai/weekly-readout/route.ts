// Evidence-aware AI weekly readout.
//
// Pulls the last N days from daily_health_snapshot, computes real
// correlations, and asks OpenAI to surface 3-5 insights. Each insight MUST
// reference one of the correlations (so it can be plotted) — the schema
// gates that. If OpenAI is missing or fails, we fall back to a deterministic
// readout that picks the strongest correlations and writes their statements.
//
// ONE MODEL CALL PER MEMBER PER WEEK, ENFORCED HERE. §C says the bound is
// server-side and "never in the UI", so it is a claim on the database rather
// than a check a client could skip: claim_weekly_readout hands exactly one
// concurrent caller the right to spend the call, finalize stores what it
// produced, release hands the claim back when it produced nothing. See
// supabase-migrations/2026-08-29-ai-weekly-readouts.sql for why a stale claim
// is reclaimed here and is deliberately NOT reclaimed by the undo claim it
// otherwise mirrors.
//
// ⚠ EVERY CLAIM PATH DEGRADES TO THE PRE-MIGRATION BEHAVIOUR. Until the owner
// applies the migration the RPCs do not exist, and a readout is worth more to a
// member than a cache is: an absent RPC computes and generates exactly as this
// route did before, it does not fail the request.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError } from '@/lib/request-utils';
import { callAI, hasOpenAIKey } from '@/lib/ai';
import { requireMembership } from '@/lib/require-membership';
import {
  computeCorrelations,
  SNAPSHOT_SELECT,
  type CorrelationResult,
  type SnapshotPoint,
} from '@/lib/correlations';
import { weeklyReadoutWeekStart, buildReadoutResponse } from '@/lib/weekly-readout.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Insight = {
  headline: string;
  detail: string;
  correlation_key: string;
  evidence_chart: 'scatter' | 'line';
  recommendation: string;
};

type Readout = {
  summary: string;
  insights: Insight[];
};

type ReadoutResponse = {
  source: 'openai' | 'fallback';
  /** True when this is the week's stored readout rather than one just generated. */
  cached: boolean;
  user_id: string;
  /** Monday (UTC) of the week this readout belongs to; null if it could not be computed. */
  week_start: string | null;
  /**
   * The window and sample the READOUT was computed from — not the window this
   * request asked for. On a cache hit they differ, and reporting the request's
   * would be a claim about days the readout never saw.
   */
  window_days: number | null;
  sample_size: number | null;
  generated_at: string | null;
  correlations: CorrelationResult[];
  readout: Readout;
};

/**
 * How long a claim is honoured before another request may take it.
 *
 * Long enough that a slow model call is not stolen mid-flight, short enough
 * that a crashed generator does not cost the member their week. The value is
 * clamped server-side too (the RPC refuses anything under 30s), so a caller
 * cannot hand itself a zero-length lease and make every request a reclaimer.
 */
const CLAIM_LEASE_SECONDS = 300;

/** PostgREST's codes for "that function is not deployed". */
function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function|does not exist/i.test(error.message ?? '')
  );
}

function clampWindow(value: unknown, fallback = 28): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(14, Math.min(90, Math.round(n)));
}

function correlationKey(c: CorrelationResult): string {
  return `${c.x}->${c.y}@lag${c.lagDays}`;
}

// The false-discovery-rate ceiling a correlation must clear to be offered as an
// insight.
const Q_THRESHOLD = 0.2;

// The fewest overlapping days a correlation needs before it may be reported.
// Above `MIN_DAYS` (which is only the floor at which an r can be computed at
// all) because a week is the shortest span in which a "cross-domain pattern" is
// a pattern rather than a coincidence.
const MIN_REPORTABLE_DAYS = 7;

/**
 * ONE eligibility predicate, used by BOTH readout paths.
 *
 * ⚠ SHARING THE *THRESHOLD* WAS NOT ENOUGH, and that was my own incomplete fix.
 * After unifying `Q_THRESHOLD` the two filters still disagreed on the other two
 * terms: the fallback took any non-weak pair regardless of `n`, while the model
 * catalog took any pair with `n >= 7` regardless of strength. So a strong pair
 * at n = 5 was reportable by the deterministic path but invisible to the model,
 * and a weak pair at n = 10 was offered to the model but refused by the
 * fallback — and which path a member gets is decided by whether OpenAI happens
 * to be reachable. Two renderings of the same evidence must not disagree about
 * what the evidence IS; a member switching between them because of an outage
 * would see a different set of facts about their own body.
 */
function isReportable(c: CorrelationResult): boolean {
  return c.n >= MIN_REPORTABLE_DAYS && c.strength !== 'weak' && c.qValue < Q_THRESHOLD;
}

function fallbackReadout(correlations: CorrelationResult[]): Readout {
  // ⚠ GATES ON q, NOT p, and that is the point of computing q at all. Each pair
  // is a separate test, so with a 16-pair catalog and a 28-day window roughly
  // two "moderate" findings are expected from noise alone — a readout that
  // always has something to say is a horoscope, not a readout. q is the
  // Benjamini–Hochberg FDR across the pairs in THIS response, so the threshold
  // means what a reader assumes it means. BH guarantees q >= p, so this is at
  // least as strict as the raw-p gate it replaces — equality is possible (the
  // largest-p finding always takes q = p), so "strictly stricter" would have
  // been a claim the maths does not make. When nothing survives, the honest
  // empty summary below is the correct output, not a failure.
  const significant = correlations.filter(isReportable).slice(0, 4);
  if (significant.length === 0) {
    return {
      // ⚠ THE NUMBER COMES FROM THE GATE, because this line is what a member is
      // told about their own data and it said "~14 days" while the gate was 7 —
      // a threshold the code contradicts, which is the same honesty class as
      // every other defect in this module. It is also OVERLAP, not window
      // length: what counts is days where BOTH sides of a pair have a value, so
      // a 28-day window with sleep logged and training missing clears nothing.
      summary:
        `Not enough signal yet to call out cross-domain patterns. Keep logging — a pattern needs at least ${MIN_REPORTABLE_DAYS} days where both sides were recorded, so sleep, training and nutrition logged on the same days are what unlock this.`,
      insights: [],
    };
  }

  const one = significant.length === 1;
  return {
    summary: `Across the window, ${significant.length} cross-domain pattern${one ? '' : 's'} ${
      one ? 'stands' : 'stand'
    } out. Strongest: ${significant[0].label.toLowerCase()} (r=${significant[0].r.toFixed(2)}).`,
    insights: significant.map((c) => {
      const dir = c.direction === 'positive' ? 'tracks together with' : 'moves opposite to';
      const x = c.x.replaceAll('_', ' ');
      const y = c.y.replaceAll('_', ' ');
      return {
        headline: c.label,
        detail: `Across ${c.n} day${c.n === 1 ? '' : 's'}, ${x} ${dir} ${y} (r=${c.r.toFixed(2)}, ${c.strength}).`,
        correlation_key: correlationKey(c),
        evidence_chart: c.lagDays === 0 ? 'scatter' : 'line',
        // ⚠ THIS DESCRIBES, IT DOES NOT PRESCRIBE — the copy used to read
        // "Protect the {x} input — when it dips, {y} dips with it" and "gains
        // there COST {y}", which assert a causal lever from an observational
        // correlation. This module computes a false-discovery rate precisely
        // because it takes over-claiming seriously; telling a member to pull a
        // lever it has no evidence is a lever would undo that in the one place
        // they actually read. It is also unfalsifiable advice: the pair may run
        // the other way, or both may follow something unmeasured. So the line
        // reports the association and names it as worth WATCHING, which is a
        // claim the r supports.
        recommendation:
          c.direction === 'positive'
            ? `Worth watching together: on this member's own days, higher ${x} shows up alongside higher ${y}. What drives what is not established here.`
            : `Worth watching together: on this member's own days, higher ${x} shows up alongside lower ${y}. What drives what is not established here.`,
      };
    }),
  };
}

const readoutSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'insights'],
  properties: {
    summary: { type: 'string' },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['headline', 'detail', 'correlation_key', 'evidence_chart', 'recommendation'],
        properties: {
          headline: { type: 'string' },
          detail: { type: 'string' },
          correlation_key: { type: 'string' },
          evidence_chart: { type: 'string', enum: ['scatter', 'line'] },
          recommendation: { type: 'string' },
        },
      },
    },
  },
};

type OpenAIContentPart = { type?: string; text?: string };
type OpenAIOutputItem = { content?: OpenAIContentPart[] };
type OpenAIResponsePayload = { output_text?: string; output?: OpenAIOutputItem[] };

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output ?? []) {
    const text = item?.content?.find((part) => part?.type === 'output_text')?.text;
    if (typeof text === 'string') return text;
  }
  return '';
}

async function generateReadout(
  correlations: CorrelationResult[],
  windowDays: number,
  sampleSize: number
): Promise<Readout | null> {
  if (!hasOpenAIKey()) return null;

  // ⚠ THE GATE IS ENFORCED HERE, NOT LEFT TO THE PROMPT. The catalog handed to
  // the model is the ONLY set an insight may reference (post-parse validation
  // checks membership), so filtering it is what makes the gate binding — a
  // prompt line asking the model to "prefer" low q is advisory, and a model
  // that ignores it would surface a finding the deterministic fallback would
  // have refused. Same predicate as fallbackReadout, deliberately. When nothing
  // survives, this returns null and the honest empty summary is the output.
  const significantCorrelations = correlations.filter(isReportable).slice(0, 6);
  if (significantCorrelations.length === 0) return null;

  const correlationCatalog = significantCorrelations.map((c) => ({
    correlation_key: correlationKey(c),
    label: c.label,
    explanation: c.explanation,
    r: c.r,
    n: c.n,
    p_value: c.pValue,
    // The model sees the multiple-comparison-adjusted figure too, so it can
    // tell a finding that survives the whole batch from one that only looks
    // good alone. Withholding it would ask it to judge on evidence we know is
    // incomplete.
    q_value: c.qValue,
    direction: c.direction,
    strength: c.strength,
  }));

  const result = await callAI(
    {
      input: [
        {
          role: 'system',
          // ⚠ THE PROMPT ASKED FOR THE OVER-CLAIM THE FALLBACK JUST STOPPED
          // MAKING. It said "pick the most ACTIONABLE findings" and "recommend
          // an ACTION" — from a catalog of observational correlations, which
          // invites exactly the causal lever the deterministic path no longer
          // asserts. The two renderings must not disagree about what the
          // evidence supports any more than they may disagree about which
          // evidence qualifies. So the instruction now matches the fallback's
          // stance: describe the association, say what is worth watching, and
          // never state direction of cause.
          content:
            'You are a sports-science coach writing a weekly readout for one client. ' +
            "You are given a catalog of correlations already computed from the client's own logged data. " +
            'Pick the 3-5 findings most worth their attention, write a short summary, and return one insight per finding. ' +
            'Every insight MUST reference an existing correlation_key from the catalog so the UI can plot it. ' +
            'Be specific, name the metric pair, cite the r value, and do not invent numbers. ' +
            'These are OBSERVATIONAL associations from one person, not experiments: describe what moves with what ' +
            'and what is worth watching, and never claim one metric causes the other or tell them a change to X ' +
            'will produce a change in Y. Some pairs are two self-reports entered in the same check-in seconds ' +
            'apart, which can agree for reasons other than the relationship — the explanation field says so where ' +
            'it applies, and you should carry that caution into the wording. ' +
            'q_value is the false-discovery rate across the whole catalog: prefer findings with a low q_value, ' +
            'and do not present a high-q_value finding as established.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            window_days: windowDays,
            sample_size: sampleSize,
            correlation_catalog: correlationCatalog,
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'shape_weekly_readout',
          strict: true,
          schema: readoutSchema,
        },
      },
    },
    { promptId: 'ai.weekly-readout' },
  );

  if (!result.ok) return null;

  const payload = result.data as OpenAIResponsePayload;
  const text = extractOutputText(payload);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as Readout;
    const validKeys = new Set(significantCorrelations.map(correlationKey));
    parsed.insights = (parsed.insights ?? []).filter((insight) =>
      validKeys.has(insight.correlation_key)
    );
    if (parsed.insights.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  let body: { user_id?: string; window_days?: number } = {};
  const bodyResult = await readJson<{ user_id?: string; window_days?: number }>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  body = bodyResult.data;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // ⚠ A CALLER-SUPPLIED id IS A REQUEST TO READ SOMEONE ELSE, NOT A DEFAULT.
  // This read `body.user_id || user.id` with no check of its own, and the
  // snapshot read below is RLS-scoped, so a stranger passing another member's
  // id already got an empty readout rather than a leak. What they ALSO got was
  // that member's weekly claim: the claim RPC would hand it to them, they would
  // generate a readout over zero rows, and the member's own request would then
  // be served that empty result for the rest of the week — a denial of the
  // feature dressed as an answer. So the id is only honoured for a caller the
  // RPC's own self-or-coach check admits, and it raises rather than returning
  // a row when it does not.
  const subjectId = typeof body.user_id === 'string' && body.user_id ? body.user_id : user.id;
  const windowDays = clampWindow(body.window_days, 28);
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const weekStart = weeklyReadoutWeekStart(Date.now());

  // A week key we cannot compute is a cache we must not use — generate live
  // rather than claim under a key that would collide with another week.
  let claim: {
    outcome: 'ready' | 'claimed' | 'generating';
    claim_token: string | null;
    readout: Readout | null;
    correlations: CorrelationResult[] | null;
    source: 'openai' | 'fallback' | null;
    window_days: number | null;
    sample_size: number | null;
    generated_at: string | null;
  } | null = null;

  if (weekStart) {
    const { data: claimRows, error: claimError } = await supabase.rpc('claim_weekly_readout', {
      p_user_id: subjectId,
      p_week_start: weekStart,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    });
    if (claimError) {
      // The permission refusal is the one claim failure that must NOT degrade
      // into serving the readout anyway: the RPC raises for a caller who is
      // neither the member nor their coach, and falling through would answer a
      // request the database just refused.
      if (/not permitted/i.test(claimError.message ?? '')) {
        return NextResponse.json({ error: 'Not permitted to read this readout.' }, { status: 403 });
      }
      if (!isMissingRpc(claimError)) {
        console.warn('[shape-app] weekly readout claim failed:', claimError.message);
      }
    } else {
      claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) ?? null;
    }
  }

  // A finished readout answers without touching the snapshot table at all —
  // the whole point of the claim. Its stored correlations travel with it so the
  // insight keys the UI plots still resolve.
  if (claim?.outcome === 'ready' && claim.readout) {
    return NextResponse.json(
      buildReadoutResponse({
        subjectId,
        weekStart,
        stored: {
          readout: claim.readout,
          correlations: claim.correlations ?? [],
          source: claim.source ?? 'fallback',
          window_days: claim.window_days,
          sample_size: claim.sample_size,
          generated_at: claim.generated_at,
        },
        live: {
          readout: { summary: '', insights: [] },
          correlations: [],
          source: 'fallback',
          window_days: windowDays,
          sample_size: 0,
          generated_at: new Date().toISOString(),
        },
      }) as ReadoutResponse,
    );
  }

  const { data, error } = await supabase
    .from('daily_health_snapshot')
    .select(SNAPSHOT_SELECT)
    .eq('user_id', subjectId)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true })
    .returns<SnapshotPoint[]>();

  if (error) {
    // The claim is held by this request; hand it back before failing, or the
    // member waits out the lease before anyone can try again.
    if (claim?.outcome === 'claimed' && claim.claim_token && weekStart) {
      // The builder is thenable but not a Promise, so `.catch` is not on it —
      // await and discard, since a failed release must not mask the read error
      // that is the actual answer to this request.
      const { error: releaseError } = await supabase.rpc('release_weekly_readout', {
        p_user_id: subjectId,
        p_week_start: weekStart,
        p_claim_token: claim.claim_token,
      });
      if (releaseError && !isMissingRpc(releaseError)) {
        console.warn('[shape-app] weekly readout release failed:', releaseError.message);
      }
    }
    return dbError(error, 'weekly readout', 500);
  }

  const rows = data ?? [];
  const correlations = computeCorrelations(rows);

  // ⚠ THE MODEL IS ONLY CALLED BY THE CALLER HOLDING THE CLAIM. `generating`
  // means another request is mid-flight: this one serves the deterministic
  // readout for THIS response and stores nothing, which is honest (the fallback
  // is real evidence, just not the AI rendering of it) and costs no call. A
  // missing claim — the pre-migration path, or a week key we could not compute
  // — generates as this route always did.
  const mayGenerate = !claim || claim.outcome === 'claimed';

  const generated = mayGenerate
    ? await generateReadout(correlations, windowDays, rows.length).catch((err) => {
        console.warn('[shape-app] weekly readout generation error:', err);
        return null;
      })
    : null;

  const readout = generated ?? fallbackReadout(correlations);
  const source: 'openai' | 'fallback' = generated ? 'openai' : 'fallback';

  // ⚠ ONLY A REAL MODEL READOUT IS STORED; EVERYTHING ELSE RELEASES THE CLAIM.
  // The deterministic fallback is recomputed from live correlations for free,
  // so caching it would buy nothing and would spend the member's whole week on
  // one transient OpenAI outage — they would be told "no AI readout this week"
  // because of a blip. Storing only the generated readout makes the row mean
  // exactly "the AI readout for this week", which is the thing the
  // one-call-per-week rule exists to conserve.
  if (claim?.outcome === 'claimed' && claim.claim_token && weekStart) {
    const rpc = generated ? 'finalize_weekly_readout' : 'release_weekly_readout';
    const args = generated
      ? {
          p_user_id: subjectId,
          p_week_start: weekStart,
          p_claim_token: claim.claim_token,
          p_readout: readout,
          p_correlations: correlations,
          p_source: source,
          p_window_days: windowDays,
          p_sample_size: rows.length,
        }
      : {
          p_user_id: subjectId,
          p_week_start: weekStart,
          p_claim_token: claim.claim_token,
        };
    const { error: writeError } = await supabase.rpc(rpc, args);
    // A failed store is not a failed readout — the member still gets this
    // response; the week simply regenerates next request.
    if (writeError && !isMissingRpc(writeError)) {
      console.warn(`[shape-app] weekly readout ${rpc} failed:`, writeError.message);
    }
  }

  const result = buildReadoutResponse({
    subjectId,
    weekStart,
    stored: null,
    live: {
      readout,
      correlations,
      source,
      window_days: windowDays,
      sample_size: rows.length,
      generated_at: new Date().toISOString(),
    },
  }) as ReadoutResponse;

  return NextResponse.json(result);
}
