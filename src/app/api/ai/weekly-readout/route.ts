// Evidence-aware AI weekly readout.
//
// Pulls the last N days from daily_health_snapshot, computes real
// correlations, and asks OpenAI to surface 3-5 insights. Each insight MUST
// reference one of the correlations (so it can be plotted) — the schema
// gates that. If OpenAI is missing or fails, we fall back to a deterministic
// readout that picks the strongest correlations and writes their statements.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  computeCorrelations,
  type CorrelationResult,
  type SnapshotPoint,
} from '@/lib/correlations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SNAPSHOT_FIELDS = [
  'snapshot_date',
  'sleep_hours',
  'sleep_performance_pct',
  'recovery_score',
  'hrv_ms',
  'resting_hr',
  'strain',
  'workout_minutes',
  'workout_volume_lb',
  'avg_heart_rate',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'hydration_l',
  'weight_lb',
  'body_fat_pct',
  'mood',
  'stress',
  'soreness',
].join(',');

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

function fallbackReadout(correlations: CorrelationResult[]): Readout {
  const significant = correlations.filter((c) => c.strength !== 'weak' && c.pValue < 0.2).slice(0, 4);
  if (significant.length === 0) {
    return {
      summary:
        'Not enough signal yet to call out cross-domain patterns. Keep logging — sleep, training, and nutrition data unlock the readout once we have ~14 days of overlap.',
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
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const significantCorrelations = correlations.filter((c) => c.n >= 7).slice(0, 6);
  if (significantCorrelations.length === 0) return null;

  const correlationCatalog = significantCorrelations.map((c) => ({
    correlation_key: correlationKey(c),
    label: c.label,
    explanation: c.explanation,
    r: c.r,
    n: c.n,
    p_value: c.pValue,
    direction: c.direction,
    strength: c.strength,
  }));

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      input: [
        {
          role: 'system',
          content:
            'You are a sports-science coach generating a weekly readout for one client. ' +
            'You are given a catalog of correlations already computed from the client\'s real data. ' +
            'Pick the 3-5 most actionable findings, write a short summary, and return one insight per finding. ' +
            'Every insight MUST reference an existing correlation_key from the catalog so the UI can plot it. ' +
            'Be specific, name the metric pair, cite the r value, and recommend an action. Do not invent numbers.',
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
    }),
  });

  if (!response.ok) {
    console.warn('[shape-app] weekly readout OpenAI failed:', await response.text());
    return null;
  }

  const payload = (await response.json()) as OpenAIResponsePayload;
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
  let body: { user_id?: string; window_days?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

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
    .select(SNAPSHOT_FIELDS)
    .eq('user_id', userId)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true })
    .returns<SnapshotPoint[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
