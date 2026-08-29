// Evidence-aware AI weekly readout.
//
// Pulls the last N days from daily_health_snapshot, computes real
// correlations, and asks OpenAI to surface 3-5 insights. Each insight MUST
// reference one of the correlations (so it can be plotted) — the schema
// gates that. If OpenAI is missing or fails, we fall back to a deterministic
// readout that picks the strongest correlations and writes their statements.

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
  user_id: string;
  window_days: number;
  sample_size: number;
  generated_at: string;
  correlations: CorrelationResult[];
  readout: Readout;
};

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

  return {
    summary: `Across the window, ${significant.length} cross-domain pattern${
      significant.length === 1 ? '' : 's'
    } stand out. Strongest: ${significant[0].label.toLowerCase()} (r=${significant[0].r.toFixed(2)}).`,
    insights: significant.map((c) => {
      const dir = c.direction === 'positive' ? 'tracks together with' : 'moves opposite to';
      return {
        headline: c.label,
        detail: `Across ${c.n} day${c.n === 1 ? '' : 's'}, ${c.x.replaceAll('_', ' ')} ${dir} ${c.y.replaceAll('_', ' ')} (r=${c.r.toFixed(2)}, ${c.strength}).`,
        correlation_key: correlationKey(c),
        evidence_chart: c.lagDays === 0 ? 'scatter' : 'line',
        recommendation:
          c.direction === 'positive'
            ? `Protect the ${c.x.replaceAll('_', ' ')} input — when it dips, ${c.y.replaceAll('_', ' ')} dips with it.`
            : `Watch the ${c.x.replaceAll('_', ' ')} side — gains there cost ${c.y.replaceAll('_', ' ')}.`,
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
          content:
            'You are a sports-science coach generating a weekly readout for one client. ' +
            'You are given a catalog of correlations already computed from the client\'s real data. ' +
            'Pick the 3-5 most actionable findings, write a short summary, and return one insight per finding. ' +
            'Every insight MUST reference an existing correlation_key from the catalog so the UI can plot it. ' +
            'Be specific, name the metric pair, cite the r value, and recommend an action. Do not invent numbers. ' +
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

  const userId = body.user_id || user.id;
  const windowDays = clampWindow(body.window_days, 28);
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('daily_health_snapshot')
    .select(SNAPSHOT_SELECT)
    .eq('user_id', userId)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true })
    .returns<SnapshotPoint[]>();

  if (error) {
    return dbError(error, 'weekly readout', 500);
  }

  const rows = data ?? [];
  const correlations = computeCorrelations(rows);

  const generated = await generateReadout(correlations, windowDays, rows.length).catch((err) => {
    console.warn('[shape-app] weekly readout generation error:', err);
    return null;
  });

  const readout = generated ?? fallbackReadout(correlations);

  const result: ReadoutResponse = {
    source: generated ? 'openai' : 'fallback',
    user_id: userId,
    window_days: windowDays,
    sample_size: rows.length,
    generated_at: new Date().toISOString(),
    correlations,
    readout,
  };

  return NextResponse.json(result);
}
